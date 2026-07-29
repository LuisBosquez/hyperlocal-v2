"""User-curated Lists (MVP-1 Flows 17–19) — CRUD, membership, visibility, share.

A List is a named collection of places with public/private visibility. A place can
belong to many lists. Every user has a non-deletable default "Want to Go" list,
which is where a plain save lands.
"""
import secrets

from flask import Blueprint, request, g

from ..middleware import require_auth, optional_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..signals import record_signal
from ..devdb import DuplicateError
from ..domain import relationship, public_user

lists_bp = Blueprint('lists', __name__, url_prefix='/api/v1')

NAME_MAX = 80
DESC_MAX = 280
DEFAULT_LIST_NAME = 'Want to Go'


# --- helpers -----------------------------------------------------------------

def _list_place_info(p: dict, position: int | None = None) -> dict:
    info = {
        'place_id': p['id'], 'name': p['name'], 'address': p['address'],
        'category': p.get('category'), 'photo_url': p.get('photo_url'),
        'lat': p['lat'], 'lng': p['lng'],
    }
    if position is not None:
        info['position'] = position
    return info


def _serialize_list(l: dict, *, place_count: int, places=None, owner=None,
                    is_owner=None, contains_place=None) -> dict:
    out = {
        'id': l['id'], 'name': l['name'], 'description': l.get('description'),
        'visibility': l['visibility'], 'is_default': bool(l.get('is_default')),
        'place_count': place_count, 'updated_at': l.get('updated_at'),
    }
    if places is not None:
        out['places'] = places
    if owner is not None:
        out['owner'] = owner
    if is_owner is not None:
        out['is_owner'] = is_owner
    if contains_place is not None:
        out['contains_place'] = contains_place
    return out


def _can_see_private(viewer_id: str | None, owner_id: str) -> bool:
    """Owner or mutual friend may see a user's private lists."""
    rel = relationship(viewer_id, owner_id)
    return rel['is_self'] or rel['is_mutual']


def _places_by_list(sb, list_ids: list[str]) -> dict[str, list[dict]]:
    """Map list_id -> [list_place rows ordered by position]."""
    if not list_ids:
        return {}
    rows = sb.table('list_places').select('*').in_('list_id', list_ids).execute().data or []
    rows.sort(key=lambda r: (r.get('position') or 0, r.get('added_at') or ''))
    by_list: dict[str, list[dict]] = {}
    for r in rows:
        by_list.setdefault(r['list_id'], []).append(r)
    return by_list


def _hydrate_lists(sb, list_rows: list[dict], *, with_places: bool = True) -> list[dict]:
    """Attach place_count (+ optional places) to a set of list rows, default first."""
    list_rows = sorted(
        list_rows,
        key=lambda l: (0 if l.get('is_default') else 1, l.get('created_at') or ''),
    )
    members = _places_by_list(sb, [l['id'] for l in list_rows])
    place_ids = list({m['place_id'] for ms in members.values() for m in ms})
    places = {p['id']: p for p in (sb.table('places').select('*').in_('id', place_ids).execute().data or [])} if place_ids else {}
    out = []
    for l in list_rows:
        ms = members.get(l['id'], [])
        place_list = None
        if with_places:
            place_list = [_list_place_info(places[m['place_id']], m.get('position'))
                          for m in ms if m['place_id'] in places]
        out.append(_serialize_list(l, place_count=len(ms), places=place_list))
    return out


def visible_lists(sb, owner_id: str, viewer_id: str | None) -> list[dict]:
    """Hydrated lists visible to viewer: public only for non-mutual, all otherwise.
    Shared with the profile endpoint (GET /users/:handle)."""
    rows = sb.table('lists').select('*').eq('owner_id', owner_id).execute().data or []
    if not _can_see_private(viewer_id, owner_id):
        rows = [l for l in rows if l['visibility'] == 'public']
    return _hydrate_lists(sb, rows)


def _default_list_id(sb, user_id: str) -> str:
    """Return the user's default list id, creating one if missing (defensive)."""
    rows = sb.table('lists').select('*').eq('owner_id', user_id).eq('is_default', True).limit(1).execute().data or []
    if rows:
        return rows[0]['id']
    created = sb.table('lists').insert({
        'owner_id': user_id, 'name': DEFAULT_LIST_NAME, 'visibility': 'private', 'is_default': True,
    }).execute()
    return created.data[0]['id']


def _next_position(sb, list_id: str) -> int:
    rows = sb.table('list_places').select('position').eq('list_id', list_id).execute().data or []
    return (max((r.get('position') or 0) for r in rows) + 1) if rows else 0


def add_place_to_lists(sb, user_id: str, place_id: str, list_ids: list[str] | None) -> list[str]:
    """Add a place to the given lists (or the default list when none given).
    Validates ownership; idempotent per list. Returns the list ids it ended up in.
    Shared with POST /user-places."""
    targets = [lid for lid in (list_ids or []) if lid]
    if not targets:
        targets = [_default_list_id(sb, user_id)]
    owned = {l['id'] for l in (sb.table('lists').select('id').eq('owner_id', user_id).execute().data or [])}
    added = []
    for lid in targets:
        if lid not in owned:
            continue
        exists = sb.table('list_places').select('id').eq('list_id', lid).eq('place_id', place_id).limit(1).execute().data
        if exists:
            added.append(lid)
            continue
        try:
            sb.table('list_places').insert({
                'list_id': lid, 'place_id': place_id, 'position': _next_position(sb, lid),
            }).execute()
            track('place_added_to_list', user_id, {'list_id': lid, 'place_id': place_id})
            added.append(lid)
        except DuplicateError:
            added.append(lid)
    return added


# --- collection endpoints ----------------------------------------------------

@lists_bp.route('/users/me/lists', methods=['GET'])
@require_auth
def my_lists():
    """All of the caller's lists (default first). ?place_id= adds contains_place
    so the Add-to-List picker can pre-check memberships (Flow 18)."""
    sb = get_supabase()
    place_id = request.args.get('place_id')
    rows = sb.table('lists').select('*').eq('owner_id', g.user_id).execute().data or []
    rows = sorted(rows, key=lambda l: (0 if l.get('is_default') else 1, l.get('created_at') or ''))
    members = _places_by_list(sb, [l['id'] for l in rows])
    out = []
    for l in rows:
        ms = members.get(l['id'], [])
        item = _serialize_list(l, place_count=len(ms))
        if place_id is not None:
            item['contains_place'] = any(m['place_id'] == place_id for m in ms)
        out.append(item)
    return ok({'items': out})


@lists_bp.route('/users/<handle>/lists', methods=['GET'])
@optional_auth
def user_lists(handle: str):
    """A profile's visible lists: public only for non-mutual viewers, all for
    mutual friends / self."""
    sb = get_supabase()
    row = sb.table('users').select('*').eq('handle', handle).maybe_single().execute()
    owner = row.data if row else None
    if not owner:
        return err('NOT_FOUND', 404, 'No one with that handle.')
    if owner.get('is_private') and not _can_see_private(g.user_id, owner['id']):
        return err('FORBIDDEN', 403, 'This profile is private.')

    rows = sb.table('lists').select('*').eq('owner_id', owner['id']).execute().data or []
    if not _can_see_private(g.user_id, owner['id']):
        rows = [l for l in rows if l['visibility'] == 'public']
    return ok({'items': _hydrate_lists(sb, rows)})


@lists_bp.route('/lists/<list_id>', methods=['GET'])
@optional_auth
def get_list(list_id: str):
    """One list + ordered places. Public lists are world-readable (even via a
    share link when the owner's profile is private, Flow 19.2)."""
    sb = get_supabase()
    row = sb.table('lists').select('*').eq('id', list_id).maybe_single().execute()
    lst = row.data if row else None
    if not lst:
        return err('NOT_FOUND', 404, 'This list is no longer available.')
    is_owner = g.user_id == lst['owner_id']
    if lst['visibility'] != 'public' and not (is_owner or _can_see_private(g.user_id, lst['owner_id'])):
        return err('FORBIDDEN', 403, 'This list is private.')

    members = _places_by_list(sb, [list_id]).get(list_id, [])
    place_ids = [m['place_id'] for m in members]
    places = {p['id']: p for p in (sb.table('places').select('*').in_('id', place_ids).execute().data or [])} if place_ids else {}
    place_list = [_list_place_info(places[m['place_id']], m.get('position')) for m in members if m['place_id'] in places]
    owner_row = sb.table('users').select('*').eq('id', lst['owner_id']).maybe_single().execute()
    track('list_viewed', g.user_id, {'list_id': list_id, 'is_owner': is_owner})
    return ok(_serialize_list(
        lst, place_count=len(members), places=place_list,
        owner=public_user(owner_row.data if owner_row else None), is_owner=is_owner,
    ))


# --- list CRUD ---------------------------------------------------------------

@lists_bp.route('/lists', methods=['POST'])
@require_auth
def create_list():
    body = request.get_json(silent=True) or {}
    name = (body.get('name') or '').strip()
    description = body.get('description')
    visibility = body.get('visibility', 'private')
    if not name or len(name) > NAME_MAX:
        return err('INVALID_REQUEST', 400, f'A list name is required (max {NAME_MAX} chars).',
                   fields={'name': 'REQUIRED'})
    if description is not None and len(str(description)) > DESC_MAX:
        return err('INVALID_REQUEST', 400, f'Description maxes out at {DESC_MAX} characters.',
                   fields={'description': 'TOO_LONG'})
    if visibility not in ('public', 'private'):
        return err('INVALID_REQUEST', 400, 'visibility must be public or private.')
    sb = get_supabase()
    created = sb.table('lists').insert({
        'owner_id': g.user_id, 'name': name, 'description': description,
        'visibility': visibility, 'is_default': False,
    }).execute()
    track('list_created', g.user_id, {'list_id': created.data[0]['id'], 'visibility': visibility})
    # How people name their collections is prime recommendation fuel (MD-6).
    record_signal('list_name', g.user_id, text=name,
                  context={'description': description, 'visibility': visibility})
    return ok(_serialize_list(created.data[0], place_count=0, places=[]), 201)


@lists_bp.route('/lists/<list_id>', methods=['PATCH'])
@require_auth
def update_list(list_id: str):
    sb = get_supabase()
    row = sb.table('lists').select('*').eq('id', list_id).maybe_single().execute()
    lst = row.data if row else None
    if not lst:
        return err('NOT_FOUND', 404, 'List not found.')
    if lst['owner_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'You can only edit your own lists.')

    body = request.get_json(silent=True) or {}
    updates = {}
    if 'name' in body:
        name = (body['name'] or '').strip()
        if not name or len(name) > NAME_MAX:
            return err('INVALID_REQUEST', 400, f'A list name is required (max {NAME_MAX} chars).',
                       fields={'name': 'REQUIRED'})
        updates['name'] = name
    if 'description' in body:
        if body['description'] is not None and len(str(body['description'])) > DESC_MAX:
            return err('INVALID_REQUEST', 400, f'Description maxes out at {DESC_MAX} characters.',
                       fields={'description': 'TOO_LONG'})
        updates['description'] = body['description']
    visibility_changed = False
    if 'visibility' in body:
        if body['visibility'] not in ('public', 'private'):
            return err('INVALID_REQUEST', 400, 'visibility must be public or private.')
        visibility_changed = body['visibility'] != lst['visibility']
        updates['visibility'] = body['visibility']
    if not updates:
        return err('INVALID_REQUEST', 400, 'No editable fields provided.')

    sb.table('lists').update(updates).eq('id', list_id).execute()
    if visibility_changed:
        track('list_visibility_changed', g.user_id, {'list_id': list_id, 'visibility': updates['visibility']})
    if updates.get('name') and updates['name'] != lst['name']:
        record_signal('list_name', g.user_id, text=updates['name'], context={'renamed_from': lst['name']})
    members = sb.table('list_places').select('id').eq('list_id', list_id).execute().data or []
    fresh = sb.table('lists').select('*').eq('id', list_id).single().execute().data
    return ok(_serialize_list(fresh, place_count=len(members)))


@lists_bp.route('/lists/<list_id>', methods=['DELETE'])
@require_auth
def delete_list(list_id: str):
    sb = get_supabase()
    row = sb.table('lists').select('*').eq('id', list_id).maybe_single().execute()
    lst = row.data if row else None
    if not lst:
        return err('NOT_FOUND', 404, 'List not found.')
    if lst['owner_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'You can only delete your own lists.')
    if lst.get('is_default'):
        return err('CONFLICT', 409, 'The default list can\'t be deleted — empty it or make it private.')
    # Cascade membership; never touches user_places (saves stay).
    sb.table('list_places').delete().eq('list_id', list_id).execute()
    sb.table('lists').delete().eq('id', list_id).execute()
    return ok(None)


# --- membership --------------------------------------------------------------

@lists_bp.route('/lists/<list_id>/places/<place_id>', methods=['PUT'])
@require_auth
def add_to_list(list_id: str, place_id: str):
    sb = get_supabase()
    row = sb.table('lists').select('*').eq('id', list_id).maybe_single().execute()
    lst = row.data if row else None
    if not lst:
        return err('NOT_FOUND', 404, 'List not found.')
    if lst['owner_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'You can only edit your own lists.')
    place = sb.table('places').select('id').eq('id', place_id).maybe_single().execute()
    if not place or not place.data:
        return err('NOT_FOUND', 404, 'Place not found.')

    existing = sb.table('list_places').select('*').eq('list_id', list_id).eq('place_id', place_id).maybe_single().execute()
    if existing and existing.data:
        return ok({'list_id': list_id, 'place_id': place_id, 'position': existing.data.get('position')})
    body = request.get_json(silent=True) or {}
    position = body.get('position')
    if position is None:
        position = _next_position(sb, list_id)
    sb.table('list_places').insert({'list_id': list_id, 'place_id': place_id, 'position': position}).execute()
    track('place_added_to_list', g.user_id, {'list_id': list_id, 'place_id': place_id})
    return ok({'list_id': list_id, 'place_id': place_id, 'position': position})


@lists_bp.route('/lists/<list_id>/places/<place_id>', methods=['DELETE'])
@require_auth
def remove_from_list(list_id: str, place_id: str):
    """Remove a place from a list. Never unsaves it or touches other lists (Flow 17.4)."""
    sb = get_supabase()
    row = sb.table('lists').select('*').eq('id', list_id).maybe_single().execute()
    lst = row.data if row else None
    if not lst:
        return err('NOT_FOUND', 404, 'List not found.')
    if lst['owner_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'You can only edit your own lists.')
    sb.table('list_places').delete().eq('list_id', list_id).eq('place_id', place_id).execute()
    track('place_removed_from_list', g.user_id, {'list_id': list_id, 'place_id': place_id})
    return ok(None)


@lists_bp.route('/lists/<list_id>/order', methods=['PATCH'])
@require_auth
def reorder_list(list_id: str):
    sb = get_supabase()
    row = sb.table('lists').select('*').eq('id', list_id).maybe_single().execute()
    lst = row.data if row else None
    if not lst:
        return err('NOT_FOUND', 404, 'List not found.')
    if lst['owner_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'You can only edit your own lists.')
    place_ids = (request.get_json(silent=True) or {}).get('place_ids') or []
    for pos, pid in enumerate(place_ids):
        sb.table('list_places').update({'position': pos}).eq('list_id', list_id).eq('place_id', pid).execute()
    return ok({'ok': True})


# --- share -------------------------------------------------------------------

@lists_bp.route('/lists/<list_id>/share', methods=['POST'])
@require_auth
def share_list(list_id: str):
    """Mint a shareable invite link for a public list (Flow 19)."""
    sb = get_supabase()
    row = sb.table('lists').select('*').eq('id', list_id).maybe_single().execute()
    lst = row.data if row else None
    if not lst:
        return err('NOT_FOUND', 404, 'List not found.')
    if lst['owner_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'You can only share your own lists.')
    if lst['visibility'] != 'public':
        return err('CONFLICT', 409, 'Make the list public before sharing it.')
    token = secrets.token_urlsafe(12)
    sb.table('invite_links').insert({
        'token': token, 'created_by': g.user_id, 'list_id': list_id,
    }).execute()
    track('list_shared', g.user_id, {'list_id': list_id})
    return ok({'token': token}, 201)
