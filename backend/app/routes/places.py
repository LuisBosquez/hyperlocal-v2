import os
import logging
from datetime import datetime

import httpx
from flask import Blueprint, request, g

from ..middleware import require_auth, optional_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..domain import (
    NOTE_MAX, mutual_friend_ids, users_by_ids, distance_m, place_now, _within_opening_hours,
)

logger = logging.getLogger(__name__)

places_bp = Blueprint('places', __name__, url_prefix='/api/v1/places')
user_places_bp = Blueprint('user_places', __name__, url_prefix='/api/v1/user-places')

GOOGLE_TYPE_MAP = {
    'cafe': 'coffee', 'coffee_shop': 'coffee', 'restaurant': 'restaurant',
    'park': 'park', 'museum': 'museum', 'art_gallery': 'museum', 'bar': 'bar',
    'night_club': 'bar', 'library': 'library', 'book_store': 'bookstore',
    'bakery': 'restaurant', 'tourist_attraction': 'attraction',
}


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
        return ok([])

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

    out = []
    for p in rows:
        extra = {}
        if lat is not None and lng is not None:
            extra['distance_meters'] = distance_m(lat, lng, p['lat'], p['lng'])
        out.append(serialize_place(p, extra))
    if lat is not None and lng is not None:
        out.sort(key=lambda r: r.get('distance_meters', 0))
    return ok({'results': out, 'degraded': degraded})


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

    sb = get_supabase()
    rows = sb.table('places').select('*').in_('category', categories).eq('is_unavailable', False).execute().data or []
    # Only currently-open places (smart defaults principle); unknown hours pass (P9)
    open_now = [p for p in rows if _within_opening_hours(p.get('opening_hours'), place_now(p).date(), place_now(p).time())]
    for p in open_now:
        p['_dist'] = distance_m(lat, lng, p['lat'], p['lng'])
    open_now.sort(key=lambda p: p['_dist'])
    out = [serialize_place(p, {'distance_meters': p['_dist'], 'source': 'contextual'}) for p in open_now[:5]]
    return ok({'tagline': tagline, 'weather': weather, 'results': out})


@places_bp.route('/map', methods=['GET'])
@require_auth
def map_pins():
    """Flows 9/10: pins for my saves + mutual friends' saves, distinct styles."""
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
    for s in mine:
        p = places.get(s['place_id'])
        if p:
            pins.append(serialize_place(p, {'source': 'own', 'note': s.get('note')}))
    seen_friend = set()
    for s in friends_saves:
        if s['place_id'] in my_pids or s['place_id'] in seen_friend:
            continue
        seen_friend.add(s['place_id'])
        p = places.get(s['place_id'])
        u = users.get(s['user_id'])
        if p:
            pins.append(serialize_place(p, {'source': 'friend', 'saved_by_handle': (u or {}).get('handle')}))
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
    if not place_id:
        return err('INVALID_REQUEST', 400, 'place_id is required.')
    if note is not None and len(str(note)) > NOTE_MAX:
        return err('VALIDATION_ERROR', 422, f'Notes max out at {NOTE_MAX} characters.',
                   fields={'note': 'TOO_LONG'})

    sb = get_supabase()
    place_row = sb.table('places').select('*').eq('id', place_id).maybe_single().execute()
    if not place_row or not place_row.data:
        return err('NOT_FOUND', 404, 'Place not found.')

    existing = sb.table('user_places').select('*').eq('user_id', g.user_id).eq('place_id', place_id).maybe_single().execute()
    if existing and existing.data:
        if note is not None:
            sb.table('user_places').update({'note': note}).eq('id', existing.data['id']).execute()
        fresh = sb.table('user_places').select('*').eq('id', existing.data['id']).single().execute()
        return ok(fresh.data, 200)

    payload = {'user_id': g.user_id, 'place_id': place_id}
    if note is not None:
        payload['note'] = note
    result = sb.table('user_places').upsert(payload, on_conflict='user_id,place_id').execute()
    track('place_saved', g.user_id, {'place_id': place_id})
    return ok(result.data[0], 201)


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
