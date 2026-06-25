import re
from collections import Counter
from datetime import date

from flask import Blueprint, request, g

from ..middleware import require_auth, optional_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..domain import (
    HANDLE_RE, relationship, mutual_friend_ids, users_by_ids, public_user, plan_state,
)

users_bp = Blueprint('users', __name__, url_prefix='/api/v1/users')

PROFILE_FIELDS = {
    'display_name', 'bio', 'avatar_url', 'is_private',
    'instagram_handle', 'twitter_handle', 'facebook_url',
}


@users_bp.route('/me', methods=['GET'])
@require_auth
def get_me():
    sb = get_supabase()
    result = sb.table('users').select('*').eq('id', g.user_id).maybe_single().execute()
    return ok(result.data if result else None)


@users_bp.route('/me', methods=['PATCH'])
@require_auth
def update_me():
    body = request.get_json(silent=True) or {}
    updates = {k: v for k, v in body.items() if k in PROFILE_FIELDS}
    if not updates:
        return err('INVALID_REQUEST', 400, 'No editable fields provided.')
    if 'display_name' in updates and not (updates['display_name'] or '').strip():
        return err('VALIDATION_ERROR', 422, 'Display name cannot be empty.',
                   fields={'display_name': 'REQUIRED'})
    for f in ('bio', 'instagram_handle', 'twitter_handle', 'facebook_url'):
        if f in updates and updates[f] is not None and len(str(updates[f])) > 500:
            return err('VALIDATION_ERROR', 422, f'{f} is too long.', fields={f: 'TOO_LONG'})
    sb = get_supabase()
    result = sb.table('users').update(updates).eq('id', g.user_id).execute()
    return ok(result.data[0] if result.data else None)


@users_bp.route('/handle-check', methods=['GET'])
@require_auth
def handle_check():
    """Live availability check during onboarding (J1.3, debounced client-side)."""
    handle = (request.args.get('handle') or '').strip().lower()
    if not re.fullmatch(HANDLE_RE, handle):
        return ok({'handle': handle, 'available': False, 'reason': 'INVALID_FORMAT'})
    sb = get_supabase()
    row = sb.table('users').select('id').eq('handle', handle).maybe_single().execute()
    taken = bool(row and row.data and row.data['id'] != g.user_id)
    return ok({'handle': handle, 'available': not taken})


@users_bp.route('/search', methods=['GET'])
@require_auth
def search_users():
    """Find users by handle prefix (Flow 6)."""
    q = (request.args.get('q') or '').strip().lower().lstrip('@')
    if not q:
        return ok([])
    sb = get_supabase()
    rows = sb.table('users').select('*').like('handle', f'{q}%').limit(10).execute().data or []
    out = []
    for u in rows:
        if u['id'] == g.user_id:
            continue
        # Private profiles remain findable by exact handle but show the private state (Flow 11)
        if u.get('is_private') and u['handle'] != q:
            continue
        out.append({**public_user(u), 'is_private': bool(u.get('is_private'))})
    return ok(out)


@users_bp.route('/me/friends', methods=['GET'])
@require_auth
def get_friends():
    ids = mutual_friend_ids(g.user_id)
    users = users_by_ids(ids)
    return ok([public_user(u) for u in users.values()])


def _favorite_places(sb, owner_id: str, today: str) -> list[dict]:
    """Top 5 places from attendance history: past confirmed plans the owner
    organized or joined, aggregated at the place level (spec: Profile Page)."""
    organized = sb.table('plans').select('*').eq('organizer_id', owner_id).eq('status', 'active').execute().data or []
    joined_rows = sb.table('plan_joins').select('plan_id').eq('user_id', owner_id).execute().data or []
    joined_ids = [r['plan_id'] for r in joined_rows]
    joined = sb.table('plans').select('*').in_('id', joined_ids).eq('status', 'active').execute().data if joined_ids else []
    past = [
        p for p in organized + (joined or [])
        if not p['is_timeless'] and p.get('plan_time') and p.get('plan_date') and p['plan_date'] < today
    ]
    counts = Counter(p['place_id'] for p in past)
    top = [pid for pid, _ in counts.most_common(5)]
    places = sb.table('places').select('*').in_('id', top).execute().data if top else []
    by_id = {p['id']: p for p in (places or [])}
    return [_place_info(by_id[pid]) for pid in top if pid in by_id]


def _want_to_go(sb, owner_id: str) -> list[dict]:
    """Places the owner has an active timeless plan for — place info only, no dates."""
    plans = (
        sb.table('plans').select('*')
        .eq('organizer_id', owner_id).eq('status', 'active').eq('is_timeless', True)
        .execute().data or []
    )
    pids = list({p['place_id'] for p in plans})
    places = sb.table('places').select('*').in_('id', pids).execute().data if pids else []
    return [_place_info(p) for p in (places or [])]


def _place_info(p: dict) -> dict:
    return {
        'place_id': p['id'], 'name': p['name'], 'address': p['address'],
        'category': p.get('category'), 'photo_url': p.get('photo_url'),
        'lat': p['lat'], 'lng': p['lng'],
    }


@users_bp.route('/<handle>', methods=['GET'])
@optional_auth
def get_user(handle: str):
    """Tiered profile (Flows 6/7/11, journeys J7/J8). Tier depends on the
    viewer's relationship: none / one-way follower / mutual / self / private."""
    sb = get_supabase()
    row = sb.table('users').select('*').eq('handle', handle).maybe_single().execute()
    owner = row.data if row else None
    if not owner:
        return err('NOT_FOUND', 404, 'No one with that handle.')

    rel = relationship(g.user_id, owner['id'])
    base = {
        **public_user(owner),
        'bio': owner.get('bio'),
        'is_private': bool(owner.get('is_private')),
        'relationship': rel,
    }

    if rel['is_self']:
        today = str(date.today())
        return ok({
            **base, 'tier': 'self',
            'instagram_handle': owner.get('instagram_handle'),
            'twitter_handle': owner.get('twitter_handle'),
            'facebook_url': owner.get('facebook_url'),
            'favorite_places': _favorite_places(sb, owner['id'], today),
            'want_to_go': _want_to_go(sb, owner['id']),
        })

    # Private profile: hidden from non-followers entirely; follow disabled (Flow 11).
    if owner.get('is_private') and not rel['i_follow']:
        return ok({
            'handle': owner['handle'], 'display_name': owner['display_name'],
            'is_private': True, 'tier': 'private', 'relationship': rel,
        })

    socials = {
        'instagram_handle': owner.get('instagram_handle'),
        'twitter_handle': owner.get('twitter_handle'),
        'facebook_url': owner.get('facebook_url'),
    }

    if rel['is_mutual']:
        return ok({**base, **socials, 'tier': 'mutual'})

    if rel['i_follow']:
        today = str(date.today())
        return ok({
            **base, **socials, 'tier': 'follower',
            'favorite_places': _favorite_places(sb, owner['id'], today),
            'want_to_go': _want_to_go(sb, owner['id']),
        })

    return ok({**base, 'tier': 'none'})


@users_bp.route('/<handle>/places', methods=['GET'])
@require_auth
def get_user_places(handle: str):
    """Full saved-places list — mutual friends and self only (Flow 7/9)."""
    sb = get_supabase()
    row = sb.table('users').select('*').eq('handle', handle).maybe_single().execute()
    owner = row.data if row else None
    if not owner:
        return err('NOT_FOUND', 404)
    rel = relationship(g.user_id, owner['id'])
    if not (rel['is_self'] or rel['is_mutual']):
        return err('FORBIDDEN', 403, 'Saved places are visible to mutual friends.')
    saves = sb.table('user_places').select('*').eq('user_id', owner['id']).execute().data or []
    pids = [s['place_id'] for s in saves]
    places = {p['id']: p for p in (sb.table('places').select('*').in_('id', pids).execute().data or [])}
    out = []
    for s in saves:
        p = places.get(s['place_id'])
        if p:
            out.append({**_place_info(p), 'note': s.get('note'), 'saved_at': s.get('saved_at')})
    return ok(out)


@users_bp.route('/<handle>/plans', methods=['GET'])
@require_auth
def get_user_plans(handle: str):
    """Upcoming plans — mutual friends and self only (Flow 7)."""
    from .plans import serialize_plan  # local import to avoid cycle
    sb = get_supabase()
    row = sb.table('users').select('*').eq('handle', handle).maybe_single().execute()
    owner = row.data if row else None
    if not owner:
        return err('NOT_FOUND', 404)
    rel = relationship(g.user_id, owner['id'])
    if not (rel['is_self'] or rel['is_mutual']):
        return err('FORBIDDEN', 403, 'Plans are visible to mutual friends.')
    plans = sb.table('plans').select('*').eq('organizer_id', owner['id']).eq('status', 'active').execute().data or []
    today = str(date.today())
    upcoming = [p for p in plans if p['is_timeless'] or (p.get('plan_date') and p['plan_date'] >= today)]
    return ok([serialize_plan(p, g.user_id) for p in upcoming])
