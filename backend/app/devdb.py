"""
Dev-mode data layer: an in-process, SQLite-backed shim that implements the
subset of the supabase-py query API used by the routes.

Why this exists: local dev must work with zero external services (the hosted
Supabase project is not always available). Routes call get_supabase() and use
the same query surface against either backend — this shim in dev, real
Supabase/PostgREST in production. Enabled via USE_LOCAL_DB=1.

Supported surface (keep routes within this):
  sb.table(name).select(cols).eq/neq/in_/is_/lt/lte/gt/gte/like(...)
    .order(col, desc=...).limit(n).single()/.maybe_single().execute()
  sb.table(name).insert(dict | [dict]).execute()
  sb.table(name).upsert(dict, on_conflict='a,b').execute()
  sb.table(name).update(dict).<filters>.execute()
  sb.table(name).delete().<filters>.execute()

Unique violations raise DuplicateError so routes can implement idempotent
toggles (tech/08 pattern P2).
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone

_LOCK = threading.RLock()
_CONN: sqlite3.Connection | None = None

DB_PATH = os.environ.get('DEV_DB_PATH') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dev.db'
)

# Columns stored as JSON text in SQLite but exposed as dict/list.
JSON_COLUMNS = {
    'notifications': {'data'},
    'events': {'properties'},
    'places': {'opening_hours'},
    'plan_time_proposals': {'options'},
}

# Columns stored as 0/1 in SQLite but exposed as bool.
BOOL_COLUMNS = {
    'users': {'is_private'},
    'plans': {'is_timeless'},
    'notifications': {'is_read'},
    'places': {'is_unavailable'},
}


class DuplicateError(Exception):
    """Raised on unique-constraint violation. Routes map this to idempotent success."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, table: str):
        self._table = table
        self._filters: list[tuple[str, str, object]] = []
        self._order: list[tuple[str, bool]] = []
        self._limit: int | None = None
        self._single = False
        self._maybe = False
        self._op = 'select'
        self._payload = None
        self._on_conflict: str | None = None

    # --- verbs -------------------------------------------------------------
    def select(self, cols: str = '*'):
        self._op = 'select'
        return self

    def insert(self, payload):
        self._op = 'insert'
        self._payload = payload
        return self

    def upsert(self, payload, on_conflict: str | None = None):
        self._op = 'upsert'
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def update(self, payload):
        self._op = 'update'
        self._payload = payload
        return self

    def delete(self):
        self._op = 'delete'
        return self

    # --- filters -----------------------------------------------------------
    def eq(self, col, val):
        self._filters.append((col, '=', val))
        return self

    def neq(self, col, val):
        self._filters.append((col, '!=', val))
        return self

    def in_(self, col, vals):
        self._filters.append((col, 'IN', list(vals)))
        return self

    def is_(self, col, val):
        # supabase: .is_('col', 'null') / .is_('col', None)
        if val in ('null', None):
            self._filters.append((col, 'IS NULL', None))
        elif val in ('not.null',):
            self._filters.append((col, 'IS NOT NULL', None))
        else:
            self._filters.append((col, '=', val))
        return self

    def not_is(self, col, _val='null'):
        self._filters.append((col, 'IS NOT NULL', None))
        return self

    def lt(self, col, val):
        self._filters.append((col, '<', val))
        return self

    def lte(self, col, val):
        self._filters.append((col, '<=', val))
        return self

    def gt(self, col, val):
        self._filters.append((col, '>', val))
        return self

    def gte(self, col, val):
        self._filters.append((col, '>=', val))
        return self

    def like(self, col, pattern):
        self._filters.append((col, 'LIKE', pattern.replace('%', '%')))
        return self

    def ilike(self, col, pattern):
        self._filters.append((col, 'LIKE', pattern))  # SQLite LIKE is case-insensitive for ASCII
        return self

    # --- modifiers ----------------------------------------------------------
    def order(self, col, desc: bool = False, nullslast: bool = False):
        self._order.append((col, desc))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def single(self):
        self._single = True
        return self

    def maybe_single(self):
        self._maybe = True
        return self

    # --- execution -----------------------------------------------------------
    def _where(self):
        clauses, params = [], []
        for col, op, val in self._filters:
            if op == 'IS NULL':
                clauses.append(f'"{col}" IS NULL')
            elif op == 'IS NOT NULL':
                clauses.append(f'"{col}" IS NOT NULL')
            elif op == 'IN':
                if not val:
                    clauses.append('0 = 1')
                else:
                    ph = ','.join('?' * len(val))
                    clauses.append(f'"{col}" IN ({ph})')
                    params.extend(_encode_val(self._table, col, v) for v in val)
            else:
                clauses.append(f'"{col}" {op} ?')
                params.append(_encode_val(self._table, col, val))
        sql = (' WHERE ' + ' AND '.join(clauses)) if clauses else ''
        return sql, params

    def execute(self) -> FakeResult:
        with _LOCK:
            conn = _get_conn()
            if self._op == 'select':
                return self._exec_select(conn)
            if self._op in ('insert', 'upsert'):
                return self._exec_write(conn)
            if self._op == 'update':
                return self._exec_update(conn)
            if self._op == 'delete':
                return self._exec_delete(conn)
            raise ValueError(f'unknown op {self._op}')

    def _exec_select(self, conn):
        where, params = self._where()
        sql = f'SELECT * FROM "{self._table}"{where}'
        if self._order:
            parts = [f'"{c}" {"DESC" if d else "ASC"}' for c, d in self._order]
            sql += ' ORDER BY ' + ', '.join(parts)
        if self._limit is not None:
            sql += f' LIMIT {int(self._limit)}'
        rows = [_decode_row(self._table, dict(r)) for r in conn.execute(sql, params).fetchall()]
        if self._single or self._maybe:
            if not rows:
                if self._single:
                    raise LookupError(f'no rows in {self._table}')
                return FakeResult(None)
            return FakeResult(rows[0])
        return FakeResult(rows)

    def _exec_write(self, conn):
        payloads = self._payload if isinstance(self._payload, list) else [self._payload]
        out = []
        for p in payloads:
            row = dict(p)
            row.setdefault('id', str(uuid.uuid4()))
            cols = list(row.keys())
            placeholders = ','.join('?' * len(cols))
            col_sql = ','.join(f'"{c}"' for c in cols)
            values = [_encode_val(self._table, c, row[c]) for c in cols]
            sql = f'INSERT INTO "{self._table}" ({col_sql}) VALUES ({placeholders})'
            if self._op == 'upsert':
                conflict_cols = self._on_conflict or 'id'
                conflict_sql = ','.join(f'"{c.strip()}"' for c in conflict_cols.split(','))
                updates = ','.join(
                    f'"{c}"=excluded."{c}"' for c in cols
                    if c not in {s.strip() for s in conflict_cols.split(',')} and c != 'id'
                )
                if updates:
                    sql += f' ON CONFLICT ({conflict_sql}) DO UPDATE SET {updates}'
                else:
                    sql += f' ON CONFLICT ({conflict_sql}) DO NOTHING'
            try:
                conn.execute(sql, values)
            except sqlite3.IntegrityError as e:
                if 'UNIQUE' in str(e):
                    raise DuplicateError(str(e)) from e
                raise
            fetched = conn.execute(
                f'SELECT * FROM "{self._table}" WHERE id = ?', (row['id'],)
            ).fetchone()
            if fetched is None and self._op == 'upsert':
                # DO NOTHING hit an existing row — fetch by conflict cols
                conflict_cols = [c.strip() for c in (self._on_conflict or 'id').split(',')]
                where = ' AND '.join(f'"{c}" = ?' for c in conflict_cols)
                vals = [_encode_val(self._table, c, row[c]) for c in conflict_cols]
                fetched = conn.execute(
                    f'SELECT * FROM "{self._table}" WHERE {where}', vals
                ).fetchone()
            if fetched is not None:
                out.append(_decode_row(self._table, dict(fetched)))
        conn.commit()
        return FakeResult(out)

    def _exec_update(self, conn):
        where, params = self._where()
        payload = dict(self._payload)
        payload['updated_at'] = _now_iso() if _has_column(conn, self._table, 'updated_at') else None
        payload = {k: v for k, v in payload.items() if not (k == 'updated_at' and v is None)}
        sets = ','.join(f'"{c}" = ?' for c in payload)
        values = [_encode_val(self._table, c, v) for c, v in payload.items()]
        ids = [r['id'] for r in conn.execute(f'SELECT id FROM "{self._table}"{where}', params).fetchall()]
        conn.execute(f'UPDATE "{self._table}" SET {sets}{where}', values + params)
        conn.commit()
        if not ids:
            return FakeResult([])
        ph = ','.join('?' * len(ids))
        rows = conn.execute(f'SELECT * FROM "{self._table}" WHERE id IN ({ph})', ids).fetchall()
        return FakeResult([_decode_row(self._table, dict(r)) for r in rows])

    def _exec_delete(self, conn):
        where, params = self._where()
        conn.execute(f'DELETE FROM "{self._table}"{where}', params)
        conn.commit()
        return FakeResult([])


_COLUMN_CACHE: dict[str, set[str]] = {}


def _has_column(conn, table: str, col: str) -> bool:
    if table not in _COLUMN_CACHE:
        _COLUMN_CACHE[table] = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
    return col in _COLUMN_CACHE[table]


def _encode_val(table, col, val):
    if isinstance(val, bool):
        return 1 if val else 0
    if isinstance(val, (dict, list)):
        return json.dumps(val)
    return val


def _decode_row(table, row: dict) -> dict:
    for col in JSON_COLUMNS.get(table, ()):
        if isinstance(row.get(col), str):
            try:
                row[col] = json.loads(row[col])
            except (ValueError, TypeError):
                pass
    for col in BOOL_COLUMNS.get(table, ()):
        if row.get(col) is not None:
            row[col] = bool(row[col])
    return row


class FakeSupabase:
    def table(self, name: str) -> FakeQuery:
        if not re.fullmatch(r'[a-z_]+', name):
            raise ValueError(f'bad table name {name}')
        return FakeQuery(name)


# =============================================================================
# Schema + seed
# =============================================================================

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  is_private INTEGER NOT NULL DEFAULT 0,
  instagram_handle TEXT,
  twitter_handle TEXT,
  facebook_url TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  google_place_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  category TEXT,
  opening_hours TEXT,
  photo_url TEXT,
  description TEXT,
  is_unavailable INTEGER NOT NULL DEFAULT 0,
  utc_offset_minutes INTEGER,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS user_places (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  note TEXT,
  saved_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, place_id)
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  plan_date TEXT,
  plan_time TEXT,
  plan_time_band TEXT,
  is_timeless INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS plan_interests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, plan_id)
);
CREATE TABLE IF NOT EXISTS plan_joins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, plan_id)
);
CREATE TABLE IF NOT EXISTS plan_time_proposals (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  proposer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  options TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  accepted_option INTEGER,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  followee_id TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (follower_id, followee_id),
  CHECK (follower_id != followee_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS invite_links (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL,
  plan_id TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  used_by TEXT,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
"""

# Seattle, PDT
_TZ_OFFSET = -420

_HOURS_STANDARD = [  # 08:00–22:00 daily, Google Places "periods" shape
    {'open': {'day': d, 'time': '0800'}, 'close': {'day': d, 'time': '2200'}} for d in range(7)
]
_HOURS_EVENING = [
    {'open': {'day': d, 'time': '1600'}, 'close': {'day': (d + 1) % 7, 'time': '0200'}} for d in range(7)
]
_HOURS_MUSEUM = [
    {'open': {'day': d, 'time': '1100'}, 'close': {'day': d, 'time': '1700'}} for d in (2, 3, 4, 5, 6)
]

U_ALICE = '00000000-0000-0000-0000-000000000001'
U_BOB = '00000000-0000-0000-0000-000000000002'
U_CARLOS = '00000000-0000-0000-0000-000000000003'
U_DANA = '00000000-0000-0000-0000-000000000004'

SEED_PLACES = [
    # (uuid_suffix, google_place_id, name, address, lat, lng, category, hours, description)
    ('10', 'gp_victrola', 'Victrola Coffee Roasters', '310 E Pike St, Seattle, WA 98122', 47.6140, -122.3270, 'coffee', _HOURS_STANDARD, 'Beloved Capitol Hill coffee roaster.'),
    ('11', 'gp_anchorhead', 'Anchorhead Coffee', '1600 7th Ave, Seattle, WA 98101', 47.6131, -122.3338, 'coffee', _HOURS_STANDARD, 'Downtown specialty coffee bar.'),
    ('12', 'gp_calanderson', 'Cal Anderson Park', '1635 11th Ave, Seattle, WA 98122', 47.6172, -122.3190, 'park', None, 'Capitol Hill park with a reflecting pool.'),
    ('13', 'gp_gasworks', 'Gas Works Park', '2101 N Northlake Way, Seattle, WA 98103', 47.6456, -122.3344, 'park', None, 'Iconic park on Lake Union with skyline views.'),
    ('14', 'gp_kerrypark', 'Kerry Park', '211 W Highland Dr, Seattle, WA 98119', 47.6295, -122.3599, 'park', None, 'Tiny park, biggest Seattle skyline view.'),
    ('15', 'gp_frye', 'Frye Art Museum', '704 Terry Ave, Seattle, WA 98104', 47.6062, -122.3243, 'museum', _HOURS_MUSEUM, 'Free art museum on First Hill.'),
    ('16', 'gp_mopop', 'Museum of Pop Culture', '325 5th Ave N, Seattle, WA 98109', 47.6215, -122.3481, 'museum', _HOURS_MUSEUM, 'Music, sci-fi, and pop culture museum.'),
    ('17', 'gp_optimism', 'Optimism Brewing', '1158 Broadway, Seattle, WA 98122', 47.6128, -122.3208, 'bar', _HOURS_EVENING, 'Big, friendly Capitol Hill brewery.'),
    ('18', 'gp_canon', 'Canon', '928 12th Ave, Seattle, WA 98122', 47.6116, -122.3168, 'bar', _HOURS_EVENING, 'Acclaimed whiskey and bitters emporium.'),
    ('19', 'gp_tsukushinbo', 'Tsukushinbo', '515 S Main St, Seattle, WA 98104', 47.6003, -122.3265, 'restaurant', _HOURS_STANDARD, 'Beloved Japantown izakaya.'),
    ('1a', 'gp_unbien', 'Un Bien', '7302 15th Ave NW, Seattle, WA 98117', 47.6822, -122.3766, 'restaurant', _HOURS_STANDARD, 'Caribbean sandwiches worth the line.'),
    ('1b', 'gp_centrallib', 'Seattle Central Library', '1000 4th Ave, Seattle, WA 98104', 47.6067, -122.3325, 'library', _HOURS_STANDARD, 'Striking Koolhaas-designed central library.'),
    ('1c', 'gp_elliottbay', 'Elliott Bay Book Company', '1521 10th Ave, Seattle, WA 98122', 47.6149, -122.3196, 'bookstore', _HOURS_STANDARD, 'Legendary independent bookstore and café.'),
    ('1d', 'gp_alkibeach', 'Alki Beach Park', '1702 Alki Ave SW, Seattle, WA 98116', 47.5812, -122.4096, 'park', None, 'Beach with sunset views across Elliott Bay.'),
]


def _pid(suffix: str) -> str:
    return f'00000000-0000-0000-0000-0000000000{suffix}'


def seed(conn):
    today = datetime.now().date()
    tomorrow = today + timedelta(days=1)
    yesterday = today - timedelta(days=1)
    # next Saturday (at least 2 days out so it isn't "today/tomorrow")
    days_to_sat = (5 - today.weekday()) % 7
    if days_to_sat < 2:
        days_to_sat += 7
    next_sat = today + timedelta(days=days_to_sat)
    weeks_ago = lambda n: today - timedelta(weeks=n)

    users = [
        (U_ALICE, 'alice', 'Alice Marin', 'Plans enthusiast. Coffee, parks, art.', 0, 'alice.gram', None, None),
        (U_BOB, 'bob', 'Bob Tran', 'Always down for a brewery or a hike.', 0, None, 'bobtran', None),
        (U_CARLOS, 'carlos', 'Carlos Vega', 'Izakaya hunter. Whiskey appreciator.', 0, None, None, None),
        (U_DANA, 'dana', 'Dana Kim', 'Keeping it low-key.', 1, None, None, None),
    ]
    for uid, handle, name, bio, private, ig, tw, fb in users:
        conn.execute(
            'INSERT OR IGNORE INTO users (id, handle, display_name, bio, is_private, instagram_handle, twitter_handle, facebook_url) VALUES (?,?,?,?,?,?,?,?)',
            (uid, handle, name, bio, private, ig, tw, fb),
        )

    for sfx, gpid, name, addr, lat, lng, cat, hours, desc in SEED_PLACES:
        conn.execute(
            'INSERT OR IGNORE INTO places (id, google_place_id, name, address, lat, lng, category, opening_hours, description, utc_offset_minutes) VALUES (?,?,?,?,?,?,?,?,?,?)',
            (_pid(sfx), gpid, name, addr, lat, lng, cat, json.dumps(hours) if hours else None, desc, _TZ_OFFSET),
        )

    follows = [
        ('40', U_ALICE, U_BOB),    # alice ↔ bob mutual
        ('41', U_BOB, U_ALICE),
        ('42', U_ALICE, U_CARLOS), # alice → carlos one-way
        ('43', U_DANA, U_ALICE),   # dana → alice (drives alice's follow-back notification)
    ]
    for sfx, a, b in follows:
        conn.execute('INSERT OR IGNORE INTO follows (id, follower_id, followee_id) VALUES (?,?,?)', (_pid(sfx), a, b))

    saves = [
        ('50', U_ALICE, _pid('10'), 'Their cortado is the best on the Hill'),
        ('51', U_ALICE, _pid('15'), 'Free museum!! First Thursdays'),
        ('52', U_ALICE, _pid('1c'), 'for a good rainy afternoon'),
        ('53', U_ALICE, _pid('1d'), 'sunset walk spot'),
        ('54', U_BOB, _pid('17'), None),
        ('55', U_BOB, _pid('13'), 'kite weather only'),
        ('56', U_BOB, _pid('1c'), 'heard the cafe in the back is great'),
        ('57', U_CARLOS, _pid('19'), 'best izakaya, fight me'),
        ('58', U_CARLOS, _pid('18'), None),
    ]
    for sfx, uid, pid, note in saves:
        conn.execute('INSERT OR IGNORE INTO user_places (id, user_id, place_id, note) VALUES (?,?,?,?)', (_pid(sfx), uid, pid, note))

    plans = [
        # (sfx, organizer, place, date, time, timeless, status)
        ('20', U_BOB, _pid('17'), str(tomorrow), None, 0, 'active'),          # tentative tomorrow — reminder demo
        ('21', U_BOB, _pid('13'), str(next_sat), '18:00', 0, 'active'),       # confirmed
        ('22', U_ALICE, _pid('15'), None, None, 1, 'active'),                 # alice timeless (Want to Go)
        ('23', U_CARLOS, _pid('18'), str(next_sat), '20:00', 0, 'active'),    # carlos's — invisible to alice (one-way)
        ('24', U_CARLOS, _pid('19'), None, None, 1, 'active'),                # carlos timeless → his Want to Go
        # history for Favorite Places aggregation (past, confirmed)
        ('25', U_CARLOS, _pid('19'), str(weeks_ago(3)), '19:00', 0, 'active'),
        ('26', U_CARLOS, _pid('19'), str(weeks_ago(8)), '19:30', 0, 'active'),
        ('27', U_CARLOS, _pid('18'), str(weeks_ago(5)), '21:00', 0, 'active'),
        ('28', U_ALICE, _pid('12'), str(weeks_ago(2)), '10:00', 0, 'active'), # alice+bob past hang
        # tentative plan whose date already passed — date-passed journey demo
        ('29', U_ALICE, _pid('11'), str(yesterday), None, 0, 'active'),
    ]
    for sfx, org, pid, d, t, tl, status in plans:
        conn.execute(
            'INSERT OR IGNORE INTO plans (id, organizer_id, place_id, plan_date, plan_time, is_timeless, status) VALUES (?,?,?,?,?,?,?)',
            (_pid(sfx), org, pid, d, t, tl, status),
        )

    joins = [
        ('31', U_ALICE, _pid('21')),  # alice joined bob's confirmed plan
        ('32', U_BOB, _pid('28')),    # bob attended alice's past plan
    ]
    for sfx, uid, plid in joins:
        conn.execute('INSERT OR IGNORE INTO plan_joins (id, user_id, plan_id) VALUES (?,?,?)', (_pid(sfx), uid, plid))

    # alice has an unread "dana followed you" notification → Flow 13 demo
    conn.execute(
        'INSERT OR IGNORE INTO notifications (id, user_id, type, data) VALUES (?,?,?,?)',
        (_pid('60'), U_ALICE, 'new_follower', json.dumps({'follower_id': U_DANA, 'follower_handle': 'dana', 'follower_avatar_url': None})),
    )

    # bob proposed times on alice's timeless Frye plan (Flow 4.3) → alice sees a
    # "Proposed times" review section as organizer; bob sees "you proposed 2 options".
    proposal_options = [
        {'plan_date': str(next_sat), 'plan_time': None, 'plan_time_band': 'afternoon'},
        {'plan_date': str(next_sat), 'plan_time': '15:00', 'plan_time_band': None},
    ]
    conn.execute(
        'INSERT OR IGNORE INTO plan_time_proposals (id, plan_id, proposer_id, status, options, expires_at) VALUES (?,?,?,?,?,?)',
        (_pid('70'), _pid('22'), U_BOB, 'pending', json.dumps(proposal_options),
         (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()),
    )
    conn.commit()


def _get_conn() -> sqlite3.Connection:
    global _CONN
    if _CONN is None:
        fresh = not os.path.exists(DB_PATH)
        _CONN = sqlite3.connect(DB_PATH, check_same_thread=False)
        _CONN.row_factory = sqlite3.Row
        _CONN.executescript(SCHEMA)
        if fresh or os.environ.get('DEV_DB_RESEED') == '1':
            seed(_CONN)
        _CONN.commit()
    return _CONN


def reset(path: str | None = None):
    """Test helper: close and wipe the dev database."""
    global _CONN, _COLUMN_CACHE
    with _LOCK:
        if _CONN is not None:
            _CONN.close()
            _CONN = None
        _COLUMN_CACHE = {}
        p = path or DB_PATH
        if os.path.exists(p):
            os.remove(p)


def get_fake_supabase() -> FakeSupabase:
    _get_conn()
    return FakeSupabase()
