"""Domain helpers shared across routes: relationships, plan state,
opening-hours validation, distance, notifications.
"""
from __future__ import annotations

import math
from datetime import datetime, date, time, timedelta, timezone

from .extensions import get_supabase

HANDLE_RE = r'^[a-z0-9_]{3,30}$'
NOTE_MAX = 500


# --- social graph -------------------------------------------------------------

def follows(a: str, b: str) -> bool:
    """True if a follows b."""
    sb = get_supabase()
    r = sb.table('follows').select('id').eq('follower_id', a).eq('followee_id', b).limit(1).execute()
    return bool(r.data)


def relationship(viewer_id: str | None, owner_id: str) -> dict:
    if viewer_id == owner_id:
        return {'is_self': True, 'i_follow': False, 'follows_me': False, 'is_mutual': False}
    if viewer_id is None:
        return {'is_self': False, 'i_follow': False, 'follows_me': False, 'is_mutual': False}
    i_follow = follows(viewer_id, owner_id)
    follows_me = follows(owner_id, viewer_id)
    return {
        'is_self': False,
        'i_follow': i_follow,
        'follows_me': follows_me,
        'is_mutual': i_follow and follows_me,
    }


def mutual_friend_ids(user_id: str) -> list[str]:
    sb = get_supabase()
    following = sb.table('follows').select('followee_id').eq('follower_id', user_id).execute()
    followee_ids = [r['followee_id'] for r in (following.data or [])]
    if not followee_ids:
        return []
    back = (
        sb.table('follows').select('follower_id')
        .in_('follower_id', followee_ids).eq('followee_id', user_id).execute()
    )
    return [r['follower_id'] for r in (back.data or [])]


def users_by_ids(ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    sb = get_supabase()
    rows = sb.table('users').select('*').in_('id', list(set(ids))).execute().data or []
    return {u['id']: u for u in rows}


def public_user(u: dict | None) -> dict | None:
    if not u:
        return None
    return {
        'id': u['id'], 'handle': u['handle'], 'display_name': u['display_name'],
        'avatar_url': u.get('avatar_url'),
    }


# --- plan state ----------------------------------------------------------------

def plan_state(plan: dict) -> str:
    if plan.get('is_timeless'):
        return 'timeless'
    # A coarse band soft-confirms the plan, same as an exact time (M-D19).
    if plan.get('plan_time') or plan.get('plan_time_band'):
        return 'confirmed'
    return 'tentative'


def time_granularity(plan: dict) -> str | None:
    """'exact' (plan_time) · 'approximate' (plan_time_band) · None (no when yet)."""
    if plan.get('plan_time'):
        return 'exact'
    if plan.get('plan_time_band'):
        return 'approximate'
    return None


def place_now(place: dict | None) -> datetime:
    """Naive 'now' in the place's local timezone (M-D3: place tz drives time logic)."""
    offset = (place or {}).get('utc_offset_minutes')
    if offset is None:
        return datetime.now()  # server-local fallback
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(minutes=offset))).replace(tzinfo=None)


def is_past(plan: dict, place: dict | None = None) -> bool:
    if plan.get('is_timeless') or not plan.get('plan_date'):
        return False
    now = place_now(place)
    d = date.fromisoformat(plan['plan_date'])
    if plan.get('plan_time'):
        t = time.fromisoformat(plan['plan_time'])
        return datetime.combine(d, t) < now
    return d < now.date()


def is_unconfirmed(plan: dict, place: dict | None = None) -> bool:
    """M-D4(a): computed, state-based. Tentative plan whose date is today and
    local noon has passed (both reminders behind us), or whose date passed."""
    if plan_state(plan) != 'tentative':
        return False
    now = place_now(place)
    d = date.fromisoformat(plan['plan_date'])
    if d < now.date():
        return True
    return d == now.date() and now.time() >= time(12, 0)


# --- opening hours --------------------------------------------------------------

def validate_plan_datetime(place: dict, plan_date: str, plan_time: str | None) -> str | None:
    """Return an error code, or None when valid (tech/08 P5).
    Unknown opening hours are allowed through (P9 / journey 4.3)."""
    now = place_now(place)
    try:
        d = date.fromisoformat(plan_date)
    except (ValueError, TypeError):
        return 'INVALID_REQUEST'
    if d < now.date():
        return 'TIME_IN_PAST'
    if plan_time is not None:
        try:
            t = time.fromisoformat(plan_time)
        except (ValueError, TypeError):
            return 'INVALID_REQUEST'
        if d == now.date() and t <= now.time():
            return 'TIME_IN_PAST'
        if not _within_opening_hours(place.get('opening_hours'), d, t):
            return 'OUTSIDE_OPENING_HOURS'
    elif d == now.date():
        # Spec Flow 4.1: "Today" requires a time
        return 'TIME_REQUIRED_TODAY'
    return None


def _within_opening_hours(periods, d: date, t: time) -> bool:
    if not periods:
        return True  # hours unknown — allow (P9), client shows a caveat
    # Google "day": 0 = Sunday. Python weekday(): 0 = Monday.
    gday = (d.weekday() + 1) % 7
    hhmm = t.hour * 100 + t.minute
    for p in periods:
        o, c = p.get('open'), p.get('close')
        if o is None:
            continue
        if c is None:
            return True  # open 24/7 entry
        o_day, o_t = o['day'], int(o['time'])
        c_day, c_t = c['day'], int(c['time'])
        overnight = c_day != o_day or c_t <= o_t  # closes past midnight
        if o_day == gday:
            if not overnight and o_t <= hhmm < c_t:
                return True
            if overnight and hhmm >= o_t:
                return True
        if overnight and gday == (o_day + 1) % 7 and hhmm < c_t:
            return True
    return False


# --- time bands + proposal validation (M-D16/M-D19) ------------------------------

# Coarse band windows, place-local (minutes from midnight). Used to validate that a
# proposed/selected band is reachable: the place must be open for at least one slot
# inside the window, and (if today) the window must not be entirely in the past.
BAND_WINDOWS = {
    'morning': (6 * 60, 12 * 60),
    'afternoon': (12 * 60, 17 * 60),
    'evening': (17 * 60, 22 * 60),
}


def _validate_band(place: dict, plan_date: str, band: str) -> str | None:
    now = place_now(place)
    try:
        d = date.fromisoformat(plan_date)
    except (ValueError, TypeError):
        return 'INVALID_REQUEST'
    if d < now.date():
        return 'TIME_IN_PAST'
    start, end = BAND_WINDOWS[band]
    if d == now.date():
        now_min = now.hour * 60 + now.minute
        if now_min >= end:
            return 'TIME_IN_PAST'
        start = max(start, now_min)
    periods = place.get('opening_hours')
    if not periods:
        return None  # hours unknown — allow (P9)
    for mins in range(start, end, 30):
        if _within_opening_hours(periods, d, time(mins // 60, mins % 60)):
            return None
    return 'OUTSIDE_OPENING_HOURS'


def validate_proposal_option(place: dict, option: dict) -> str | None:
    """Validate one proposed option. Each option carries a date plus exactly one of
    an exact plan_time or a coarse plan_time_band. Returns an error code or None."""
    if not isinstance(option, dict):
        return 'INVALID_REQUEST'
    plan_date = option.get('plan_date')
    plan_time = option.get('plan_time')
    band = option.get('plan_time_band')
    if not plan_date:
        return 'INVALID_REQUEST'
    has_time, has_band = plan_time is not None, band is not None
    if has_time == has_band:  # neither, or both — each option needs exactly one "when"
        return 'INVALID_REQUEST'
    if has_time:
        return validate_plan_datetime(place, plan_date, plan_time)
    if band not in BAND_WINDOWS:
        return 'INVALID_REQUEST'
    return _validate_band(place, plan_date, band)


# --- geo -------------------------------------------------------------------------

def distance_m(lat1, lng1, lat2, lng2) -> int:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


# --- notifications ----------------------------------------------------------------

def notify(user_id: str, ntype: str, data: dict, dedupe_plan_id: str | None = None) -> bool:
    """Insert a notification. With dedupe_plan_id, skip when an identical
    (user, type, plan) notification already exists — idempotent cron delivery."""
    sb = get_supabase()
    if dedupe_plan_id:
        existing = sb.table('notifications').select('id, data').eq('user_id', user_id).eq('type', ntype).execute()
        for n in (existing.data or []):
            nd = n.get('data') or {}
            if isinstance(nd, dict) and nd.get('plan_id') == dedupe_plan_id:
                return False
    sb.table('notifications').insert({'user_id': user_id, 'type': ntype, 'data': data}).execute()
    return True


def plan_audience(plan_id: str, exclude: set[str] | None = None) -> set[str]:
    """Joined + Interested user ids for a plan (M-D7a fan-out audience)."""
    sb = get_supabase()
    joined = sb.table('plan_joins').select('user_id').eq('plan_id', plan_id).execute()
    interested = sb.table('plan_interests').select('user_id').eq('plan_id', plan_id).execute()
    ids = {r['user_id'] for r in (joined.data or [])} | {r['user_id'] for r in (interested.data or [])}
    return ids - (exclude or set())
