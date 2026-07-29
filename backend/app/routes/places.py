import os
import logging
from datetime import datetime

import httpx
from flask import Blueprint, request, g

from ..middleware import require_auth, optional_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..signals import record_signal
from ..domain import (
    NOTE_MAX, mutual_friend_ids, users_by_ids, distance_m, place_now, _within_opening_hours,
    in_bbox, parse_bbox, clamp_cap,
)

logger = logging.getLogger(__name__)

places_bp = Blueprint('places', __name__, url_prefix='/api/v1/places')
user_places_bp = Blueprint('user_places', __name__, url_prefix='/api/v1/user-places')
geo_bp = Blueprint('geo', __name__, url_prefix='/api/v1/geo')

# Coarse neighborhood centroids for the dev reverse-geocode stub (Flow 14 area
# label). Production proxies a geocoding provider; this keeps dev offline.
_SEATTLE_AREAS = [
    ('Capitol Hill', 47.6190, -122.3210), ('Downtown', 47.6090, -122.3350),
    ('Belltown', 47.6140, -122.3460), ('South Lake Union', 47.6270, -122.3370),
    ('First Hill', 47.6090, -122.3240), ('Queen Anne', 47.6370, -122.3570),
    ('Fremont', 47.6510, -122.3500), ('Ballard', 47.6680, -122.3840),
    ('University District', 47.6610, -122.3140), ('West Seattle', 47.5790, -122.3870),
    ('International District', 47.5980, -122.3270),
]


def _note_search(sb, viewer_id: str, q: str) -> dict[str, dict]:
    """Notes-enriched search (Flow 16): {place_id: {'source','handle'}} for places
    whose viewer-visible note matches q — own notes win over a friend's."""
    like = f'%{q}%'
    matches: dict[str, dict] = {}
    own = sb.table('user_places').select('*').eq('user_id', viewer_id).ilike('note', like).execute().data or []
    for r in own:
        if r.get('note'):
            matches[r['place_id']] = {'source': 'own', 'handle': None}
    friend_ids = mutual_friend_ids(viewer_id)
    if friend_ids:
        fr = sb.table('user_places').select('*').in_('user_id', friend_ids).ilike('note', like).execute().data or []
        fusers = users_by_ids(friend_ids)
        for r in fr:
            pid = r['place_id']
            if not r.get('note') or pid in matches:  # own match wins
                continue
            matches[pid] = {'source': 'friend', 'handle': (fusers.get(r['user_id']) or {}).get('handle')}
    return matches

GOOGLE_TYPE_MAP = {
    'cafe': 'coffee', 'coffee_shop': 'coffee', 'restaurant': 'restaurant',
    'park': 'park', 'museum': 'museum', 'art_gallery': 'museum', 'bar': 'bar',
    'night_club': 'bar', 'library': 'library', 'book_store': 'bookstore',
    'bakery': 'restaurant', 'tourist_attraction': 'attraction',
}

# Category intent for natural-language search (spec §3 / MD-3). A query that
# mentions any keyword surfaces a proximity group of up to 5 places in that
# category, tied to the map (the client fits the viewport around them).
CATEGORY_KEYWORDS = {
    'coffee': ('coffee', 'cafe', 'café', 'espresso', 'latte', 'cortado', 'roaster'),
    'restaurant': ('restaurant', 'food', 'dinner', 'lunch', 'brunch', 'breakfast',
                   'eat', 'izakaya', 'tacos', 'pizza', 'sushi', 'sandwich'),
    'bar': ('bar', 'drink', 'beer', 'brewery', 'brewer', 'cocktail', 'whiskey', 'wine', 'pub'),
    'park': ('park', 'outdoor', 'picnic', 'sunset', 'beach', 'walk'),
    'museum': ('museum', 'art', 'gallery', 'exhibit'),
    'library': ('library', 'study', 'quiet'),
    'bookstore': ('bookstore', 'book', 'bookshop'),
}
CATEGORY_LABELS = {
    'coffee': 'Coffee', 'restaurant': 'Food', 'bar': 'Drinks', 'park': 'Parks',
    'museum': 'Museums', 'library': 'Libraries', 'bookstore': 'Bookstores',
}
CATEGORY_GROUP_SIZE = 5  # MD-3: at most 5, nearest-first; the map zooms out to fit


def _category_groups(sb, q: str, lat: float | None, lng: float | None) -> list[dict]:
    """Category groups for a NL-ish query: up to 5 nearest places per matched
    category. No bbox filter — thin areas widen naturally and the client zooms
    out to fit (MD-3)."""
    ql = q.lower()
    matched = [cat for cat, kws in CATEGORY_KEYWORDS.items() if any(kw in ql for kw in kws)]
    groups = []
    for cat in matched[:2]:  # a query rarely means more than two intents
        rows = sb.table('places').select('*').eq('category', cat).eq('is_unavailable', False).execute().data or []
        if lat is not None and lng is not None:
            for p in rows:
                p['_dist'] = distance_m(lat, lng, p['lat'], p['lng'])
            rows.sort(key=lambda p: p['_dist'])
        nearest = rows[:CATEGORY_GROUP_SIZE]
        if not nearest:
            continue
        groups.append({
            'kind': 'category',
            'category': cat,
            'label': f'{CATEGORY_LABELS[cat]} near you',
            'places': [
                serialize_place(p, {'distance_meters': p.get('_dist')}) for p in nearest
            ],
        })
    return groups


def serialize_place(p: dict, extra: dict | None = None) -> dict:
    out = {
        'place_id': p['id'], 'google_place_id': p.get('google_place_id'),
        'name': p['name'], 'address': p['address'],
        'lat': p['lat'], 'lng': p['lng'],
        'category': p.get('category'), 'photo_url': p.get('photo_url'),
        'description': p.get('description'),
        'opening_hours': p.get('opening_hours'),
        'is_unavailable': bool(p.get('is_unavailable')),
        'google_maps_url': f"https://www.google.com/maps/search/?api=1&query={p['lat']},{p['lng']}&query_place_id={p.get('google_place_id', '')}",
    }
    if extra:
        out.update(extra)
    return out


def _normalize_category(types: list[str]) -> str | None:
    for t in types or []:
        if t in GOOGLE_TYPE_MAP:
            return GOOGLE_TYPE_MAP[t]
    return None


def _google_search(q: str, lat: float | None, lng: float | None) -> list[dict] | None:
    """Text Search against Google Places (New). Returns None on failure (P9)."""
    key = os.environ.get('GOOGLE_PLACES_API_KEY', '')
    if not key:
        return None
    body = {'textQuery': q, 'maxResultCount': 10}
    if lat is not None and lng is not None:
        body['locationBias'] = {'circle': {'center': {'latitude': lat, 'longitude': lng}, 'radius': 15000.0}}
    try:
        resp = httpx.post(
            'https://places.googleapis.com/v1/places:searchText',
            json=body,
            headers={
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': ','.join([
                    'places.id', 'places.displayName', 'places.formattedAddress',
                    'places.location', 'places.types', 'places.regularOpeningHours.periods',
                    'places.editorialSummary', 'places.utcOffsetMinutes',
                ]),
            },
            timeout=6.0,
        )
        if not resp.is_success:
            logger.warning('google places %s: %s', resp.status_code, resp.text[:200])
            return None
        return resp.json().get('places', [])
    except httpx.HTTPError:
        logger.exception('google places request failed')
        return None


def _upsert_google_place(sb, gp: dict) -> dict:
    periods = (gp.get('regularOpeningHours') or {}).get('periods')
    norm_periods = None
    if periods:
        norm_periods = []
        for p in periods:
            o, c = p.get('open'), p.get('close')
            if not o:
                continue
            entry = {'open': {'day': o.get('day'), 'time': f"{o.get('hour', 0):02d}{o.get('minute', 0):02d}"}}
            if c:
                entry['close'] = {'day': c.get('day'), 'time': f"{c.get('hour', 0):02d}{c.get('minute', 0):02d}"}
            norm_periods.append(entry)
    row = {
        'google_place_id': gp['id'],
        'name': (gp.get('displayName') or {}).get('text') or 'Unknown place',
        'address': gp.get('formattedAddress') or '',
        'lat': (gp.get('location') or {}).get('latitude'),
        'lng': (gp.get('location') or {}).get('longitude'),
        'category': _normalize_category(gp.get('types')),
        'opening_hours': norm_periods,
        'description': ((gp.get('editorialSummary') or {}).get('text')),
        'utc_offset_minutes': gp.get('utcOffsetMinutes'),
    }
    result = sb.table('places').upsert(row, on_conflict='google_place_id').execute()
    return result.data[0]


@places_bp.route('/search', methods=['GET'])
@optional_auth
def search_places():
    """Flow 2. Google Places text search, cached locally; falls back to the
    local cache when Google is down or no key (P9 / J2.2)."""
    q = (request.args.get('q') or '').strip()
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    if not q:
        return ok({'results': [], 'groups': [], 'degraded': False})

    sb = get_supabase()
    google_results = _google_search(q, lat, lng)
    rows: list[dict] = []
    degraded = False
    if google_results is not None:
        for gp in google_results:
            if (gp.get('location') or {}).get('latitude') is None:
                continue
            rows.append(_upsert_google_place(sb, gp))
    else:
        degraded = True
        like = f'%{q}%'
        rows = sb.table('places').select('*').like('name', like).limit(10).execute().data or []
        if not rows:
            rows = sb.table('places').select('*').like('category', like).limit(10).execute().data or []

    # Notes-enriched search: also match the viewer's own + mutual-friend notes (Flow 16).
    note_matches = _note_search(sb, g.user_id, q) if g.user_id else {}
    by_id = {p['id']: p for p in rows}
    missing = [pid for pid in note_matches if pid not in by_id]
    if missing:
        for p in (sb.table('places').select('*').in_('id', missing).execute().data or []):
            by_id[p['id']] = p

    out = []
    for pid, p in by_id.items():
        extra = {}
        if lat is not None and lng is not None:
            extra['distance_meters'] = distance_m(lat, lng, p['lat'], p['lng'])
        m = note_matches.get(pid)
        extra['match'] = (
            {'kind': 'note', 'note_source': m['source'], 'note_handle': m['handle']}
            if m else {'kind': 'name', 'note_source': None, 'note_handle': None}
        )
        out.append(serialize_place(p, extra))

    # Rank: own-note → friend-note → name/category; within a group, nearest first.
    def _rank(r):
        src = (r.get('match') or {}).get('note_source')
        tier = 0 if src == 'own' else (1 if src == 'friend' else 2)
        return (tier, r.get('distance_meters') if r.get('distance_meters') is not None else 10 ** 12)
    out.sort(key=_rank)

    if note_matches:
        track('search_note_matched', g.user_id, {'q': q, 'matches': len(note_matches)})

    # Category groups: NL-ish queries also return "up to 5 nearby" clusters (spec §3).
    groups = _category_groups(sb, q, lat, lng)
    if groups:
        track('category_search_shown', g.user_id, {'q': q, 'categories': [gr['category'] for gr in groups]})

    # Signals pipeline (MD-6): searches teach us how people describe places.
    if len(q) >= 4:
        record_signal('search_query', g.user_id, text=q, context={
            'lat': lat, 'lng': lng, 'result_count': len(out),
            'categories': [gr['category'] for gr in groups] or None,
        })
    return ok({'results': out, 'groups': groups, 'degraded': degraded})


def _weather(lat: float, lng: float) -> str | None:
    """'rain' | 'clear' | 'clouds' | None. Soft-fail (P9 / J2.3)."""
    key = os.environ.get('OPENWEATHER_API_KEY', '')
    if not key:
        return None
    try:
        resp = httpx.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params={'lat': lat, 'lon': lng, 'appid': key}, timeout=4.0,
        )
        if not resp.is_success:
            return None
        main = (resp.json().get('weather') or [{}])[0].get('main', '').lower()
        if main in ('rain', 'drizzle', 'thunderstorm'):
            return 'rain'
        if main == 'clear':
            return 'clear'
        return 'clouds'
    except httpx.HTTPError:
        return None


def _contextual_rules(now: datetime, weather: str | None) -> tuple[list[str], str]:
    """Spec Flow 12 + In-Scope rules: meal times, weather, no coffee after 5pm."""
    hour, minute = now.hour, now.minute
    hm = hour + minute / 60
    is_weekend = now.weekday() >= 5
    if 11.5 <= hm <= 13.0:
        return ['restaurant'], "Lunchtime — here's what's good nearby"
    if 18.0 <= hm <= 20.5:
        return ['restaurant', 'bar'], 'Dinner hour — somewhere new tonight?'
    if weather == 'rain' and is_weekend:
        return ['museum', 'library', 'bookstore'], 'Rainy weekend — stay dry somewhere interesting'
    if weather == 'clear' :
        return ['park'], "It's clear out — these parks are calling"
    if hm < 11.5 and hour >= 6:
        return ['coffee', 'bakery'] if hour < 17 else ['restaurant'], 'Morning — coffee within reach'
    if hour >= 17:
        # No coffee after 5pm (spec)
        return ['bar', 'restaurant', 'bookstore'], 'Evening plans, anyone?'
    return ['park', 'coffee', 'museum'], 'Here’s what’s around you right now'


@places_bp.route('/contextual', methods=['GET'])
@optional_auth
def contextual_places():
    """Flow 12: proactive suggestions from time of day, weekday, weather, location."""
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    if lat is None or lng is None:
        lat, lng = 47.6131, -122.3251  # default: Capitol Hill, Seattle (P4 fallback)

    weather = _weather(lat, lng)
    now = datetime.now()
    categories, tagline = _contextual_rules(now, weather)

    cap = clamp_cap(request.args.get('cap', type=int))
    bbox = parse_bbox(request.args.get('bbox'))

    sb = get_supabase()
    rows = sb.table('places').select('*').in_('category', categories).eq('is_unavailable', False).execute().data or []
    # Only currently-open places (smart defaults principle); unknown hours pass (P9)
    open_now = [p for p in rows if _within_opening_hours(p.get('opening_hours'), place_now(p).date(), place_now(p).time())]
    # Area scoping: prefer places inside the current area box, but never return
    # an empty strip — fall back to the unfiltered set if the box has nothing.
    if bbox:
        scoped = [p for p in open_now if in_bbox(p['lat'], p['lng'], bbox)]
        open_now = scoped or open_now
    for p in open_now:
        p['_dist'] = distance_m(lat, lng, p['lat'], p['lng'])
    open_now.sort(key=lambda p: p['_dist'])
    out = [serialize_place(p, {'distance_meters': p['_dist'], 'source': 'contextual'}) for p in open_now[:cap]]
    return ok({'tagline': tagline, 'weather': weather, 'results': out})


# Curated city table for the "change location" search mode (spec §4). Enough for
# MVP; production can proxy a geocoder behind the same endpoint (open question 3).
# (name, region, lat, lng, half_lng, half_lat) — half-extents shape the bbox.
_CITIES = [
    ('Seattle', 'WA, USA', 47.6062, -122.3321, 0.18, 0.12),
    ('Portland', 'OR, USA', 45.5152, -122.6784, 0.18, 0.12),
    ('San Francisco', 'CA, USA', 37.7749, -122.4194, 0.12, 0.09),
    ('Oakland', 'CA, USA', 37.8044, -122.2712, 0.12, 0.09),
    ('Los Angeles', 'CA, USA', 34.0522, -118.2437, 0.35, 0.25),
    ('San Diego', 'CA, USA', 32.7157, -117.1611, 0.2, 0.15),
    ('New York', 'NY, USA', 40.7128, -74.0060, 0.2, 0.15),
    ('Brooklyn', 'NY, USA', 40.6782, -73.9442, 0.12, 0.08),
    ('Chicago', 'IL, USA', 41.8781, -87.6298, 0.2, 0.15),
    ('Austin', 'TX, USA', 30.2672, -97.7431, 0.2, 0.15),
    ('Denver', 'CO, USA', 39.7392, -104.9903, 0.2, 0.15),
    ('Boston', 'MA, USA', 42.3601, -71.0589, 0.15, 0.1),
    ('Washington', 'DC, USA', 38.9072, -77.0369, 0.15, 0.1),
    ('Miami', 'FL, USA', 25.7617, -80.1918, 0.15, 0.12),
    ('Vancouver', 'BC, Canada', 49.2827, -123.1207, 0.18, 0.1),
    ('Toronto', 'ON, Canada', 43.6532, -79.3832, 0.2, 0.12),
    ('Montreal', 'QC, Canada', 45.5019, -73.5674, 0.18, 0.1),
    ('Mexico City', 'Mexico', 19.4326, -99.1332, 0.25, 0.2),
    ('Guadalajara', 'Mexico', 20.6597, -103.3496, 0.18, 0.12),
    ('Monterrey', 'Mexico', 25.6866, -100.3161, 0.18, 0.12),
    ('London', 'UK', 51.5074, -0.1278, 0.25, 0.15),
    ('Paris', 'France', 48.8566, 2.3522, 0.15, 0.1),
    ('Berlin', 'Germany', 52.5200, 13.4050, 0.2, 0.12),
    ('Madrid', 'Spain', 40.4168, -3.7038, 0.15, 0.1),
    ('Barcelona', 'Spain', 41.3874, 2.1686, 0.12, 0.09),
    ('Rome', 'Italy', 41.9028, 12.4964, 0.15, 0.1),
    ('Amsterdam', 'Netherlands', 52.3676, 4.9041, 0.12, 0.08),
    ('Tokyo', 'Japan', 35.6762, 139.6503, 0.3, 0.2),
    ('Osaka', 'Japan', 34.6937, 135.5023, 0.2, 0.12),
    ('Seoul', 'South Korea', 37.5665, 126.9780, 0.2, 0.15),
    ('Sydney', 'Australia', -33.8688, 151.2093, 0.25, 0.18),
    ('Melbourne', 'Australia', -37.8136, 144.9631, 0.25, 0.18),
    ('São Paulo', 'Brazil', -23.5505, -46.6333, 0.3, 0.2),
    ('Buenos Aires', 'Argentina', -34.6037, -58.3816, 0.2, 0.15),
    ('Bogotá', 'Colombia', 4.7110, -74.0721, 0.18, 0.15),
    ('Lima', 'Peru', -12.0464, -77.0428, 0.2, 0.15),
    ('Santiago', 'Chile', -33.4489, -70.6693, 0.2, 0.15),
]


@geo_bp.route('/forward', methods=['GET'])
@optional_auth
def forward_geocode():
    """City lookup for the change-location search mode (spec §4). Prefix matches
    rank above substring matches; up to 3 results with a viewport bbox each."""
    q = (request.args.get('q') or '').strip().lower()
    if len(q) < 3:
        return ok({'results': []})
    prefix, contains = [], []
    for name, region, lat, lng, hw, hh in _CITIES:
        nl = name.lower()
        entry = {
            'name': name, 'region': region, 'lat': lat, 'lng': lng,
            'bbox': [lng - hw, lat - hh, lng + hw, lat + hh],
        }
        if nl.startswith(q):
            prefix.append(entry)
        elif q in nl:
            contains.append(entry)
    results = (prefix + contains)[:3]
    if results:
        record_signal('city_search', g.user_id, text=q, context={'matched': results[0]['name']})
    return ok({'results': results})


@geo_bp.route('/reverse', methods=['GET'])
@optional_auth
def reverse_geocode():
    """Flow 14: a short area/neighborhood label for the overlay. Display-only —
    it never affects which places are queried. Dev uses a coarse local lookup;
    production proxies a geocoding provider. Soft-fails to 'this area' (J14.1)."""
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    if lat is None or lng is None:
        return ok({'area_label': 'this area', 'context': None})
    best, best_d = None, None
    for name, alat, alng in _SEATTLE_AREAS:
        d = distance_m(lat, lng, alat, alng)
        if best_d is None or d < best_d:
            best, best_d = name, d
    # Only name it when reasonably close (~3km); otherwise stay generic.
    label = best if (best_d is not None and best_d <= 3000) else 'this area'
    return ok({'area_label': label, 'context': 'Seattle' if label != 'this area' else None})


@places_bp.route('/map', methods=['GET'])
@require_auth
def map_pins():
    """Flows 9/10/14: pins for my saves (always) + mutual friends' saves scoped
    to the current area (Flow 10) and capped, so the map isn't flooded."""
    bbox = parse_bbox(request.args.get('bbox'))
    cap = clamp_cap(request.args.get('cap', type=int))
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)

    sb = get_supabase()
    mine = sb.table('user_places').select('*').eq('user_id', g.user_id).execute().data or []
    friend_ids = mutual_friend_ids(g.user_id)
    friends_saves = (
        sb.table('user_places').select('*').in_('user_id', friend_ids).execute().data or []
    ) if friend_ids else []

    pids = list({s['place_id'] for s in mine + friends_saves})
    places = {p['id']: p for p in (sb.table('places').select('*').in_('id', pids).execute().data or [])} if pids else {}
    users = users_by_ids(friend_ids)

    my_pids = {s['place_id'] for s in mine}
    pins = []
    # Own saves: always shown (your own collection, not noise).
    for s in mine:
        p = places.get(s['place_id'])
        if p:
            pins.append(serialize_place(p, {'source': 'own', 'note': s.get('note')}))
    # Friends' saves: area-scoped + capped (nearest first when we have a center).
    friend_pins = []
    seen_friend = set()
    for s in friends_saves:
        if s['place_id'] in my_pids or s['place_id'] in seen_friend:
            continue
        seen_friend.add(s['place_id'])
        p = places.get(s['place_id'])
        if not p or not in_bbox(p['lat'], p['lng'], bbox):
            continue
        u = users.get(s['user_id'])
        extra = {'source': 'friend', 'saved_by_handle': (u or {}).get('handle')}
        if lat is not None and lng is not None:
            extra['distance_meters'] = distance_m(lat, lng, p['lat'], p['lng'])
        friend_pins.append(serialize_place(p, extra))
    if lat is not None and lng is not None:
        friend_pins.sort(key=lambda r: r.get('distance_meters') or 0)
    pins += friend_pins[:cap]
    return ok(pins)


@places_bp.route('/<place_id>', methods=['GET'])
@optional_auth
def get_place(place_id: str):
    """Place detail (Flow 2 step 5). Accepts our UUID or a google_place_id."""
    sb = get_supabase()
    row = sb.table('places').select('*').eq('id', place_id).maybe_single().execute()
    place = row.data if row else None
    if not place:
        row = sb.table('places').select('*').eq('google_place_id', place_id).maybe_single().execute()
        place = row.data if row else None
    if not place:
        return err('NOT_FOUND', 404, 'Place not found.')

    extra = {}
    if g.user_id:
        save = sb.table('user_places').select('*').eq('user_id', g.user_id).eq('place_id', place['id']).maybe_single().execute()
        extra['viewer'] = {
            'is_saved': bool(save and save.data),
            'note': (save.data or {}).get('note') if save else None,
        }
        plans = (
            sb.table('plans').select('*')
            .eq('organizer_id', g.user_id).eq('place_id', place['id']).eq('status', 'active')
            .execute().data or []
        )
        from ..domain import is_past
        active = [p for p in plans if not is_past(p, place)]
        extra['viewer']['active_plan_id'] = active[0]['id'] if active else None
    return ok(serialize_place(place, extra))


# --- saved places (user_places) -------------------------------------------------

@user_places_bp.route('', methods=['POST'])
@require_auth
def save_place():
    """Flows 3.1/3.2 / J3. Idempotent (P2): re-save updates the note only when provided."""
    body = request.get_json(silent=True) or {}
    place_id = body.get('place_id')
    note = body.get('note')
    list_ids = body.get('list_ids')  # optional; defaults to the "Want to Go" list (Flow 18)
    if not place_id:
        return err('INVALID_REQUEST', 400, 'place_id is required.')
    if note is not None and len(str(note)) > NOTE_MAX:
        return err('VALIDATION_ERROR', 422, f'Notes max out at {NOTE_MAX} characters.',
                   fields={'note': 'TOO_LONG'})

    sb = get_supabase()
    from .lists import add_place_to_lists  # local import avoids blueprint import cycle
    place_row = sb.table('places').select('*').eq('id', place_id).maybe_single().execute()
    if not place_row or not place_row.data:
        return err('NOT_FOUND', 404, 'Place not found.')

    existing = sb.table('user_places').select('*').eq('user_id', g.user_id).eq('place_id', place_id).maybe_single().execute()
    if existing and existing.data:
        if note is not None:
            sb.table('user_places').update({'note': note}).eq('id', existing.data['id']).execute()
        added = add_place_to_lists(sb, g.user_id, place_id, list_ids)
        fresh = sb.table('user_places').select('*').eq('id', existing.data['id']).single().execute()
        return ok({**fresh.data, 'list_ids': added}, 200)

    payload = {'user_id': g.user_id, 'place_id': place_id}
    if note is not None:
        payload['note'] = note
    result = sb.table('user_places').upsert(payload, on_conflict='user_id,place_id').execute()
    added = add_place_to_lists(sb, g.user_id, place_id, list_ids)
    track('place_saved', g.user_id, {'place_id': place_id})
    record_signal('save', g.user_id, place_id=place_id,
                  context={'category': place_row.data.get('category')})
    if note:
        record_signal('note', g.user_id, text=note, place_id=place_id)
    return ok({**result.data[0], 'list_ids': added}, 201)


@user_places_bp.route('/<place_id>', methods=['PATCH'])
@require_auth
def update_note(place_id: str):
    body = request.get_json(silent=True) or {}
    note = body.get('note')
    if note is not None and len(str(note)) > NOTE_MAX:
        return err('VALIDATION_ERROR', 422, f'Notes max out at {NOTE_MAX} characters.',
                   fields={'note': 'TOO_LONG'})
    sb = get_supabase()
    result = sb.table('user_places').update({'note': note}).eq('user_id', g.user_id).eq('place_id', place_id).execute()
    if not result.data:
        return err('NOT_FOUND', 404, 'You have not saved this place.')
    if note:
        record_signal('note', g.user_id, text=note, place_id=place_id)
    return ok(result.data[0])


@user_places_bp.route('/<place_id>', methods=['DELETE'])
@require_auth
def unsave_place(place_id: str):
    """J3.5/J3.6: idempotent; any active plan for the place is unaffected."""
    sb = get_supabase()
    sb.table('user_places').delete().eq('user_id', g.user_id).eq('place_id', place_id).execute()
    return ok(None)


@user_places_bp.route('/mine', methods=['GET'])
@require_auth
def my_places():
    sb = get_supabase()
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    saves = sb.table('user_places').select('*').eq('user_id', g.user_id).execute().data or []
    pids = [s['place_id'] for s in saves]
    places = {p['id']: p for p in (sb.table('places').select('*').in_('id', pids).execute().data or [])} if pids else {}
    out = []
    for s in saves:
        p = places.get(s['place_id'])
        if not p:
            continue
        extra = {'note': s.get('note'), 'saved_at': s.get('saved_at'), 'source': 'own'}
        if lat is not None and lng is not None:
            extra['distance_meters'] = distance_m(lat, lng, p['lat'], p['lng'])
        out.append(serialize_place(p, extra))
    if lat is not None:
        out.sort(key=lambda r: r.get('distance_meters', 0))
    return ok(out)
