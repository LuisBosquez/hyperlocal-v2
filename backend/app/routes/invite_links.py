import secrets
from datetime import datetime, timezone

from flask import Blueprint, request, g

from ..middleware import require_auth, optional_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..devdb import DuplicateError
from ..domain import users_by_ids, public_user, relationship, notify

invite_links_bp = Blueprint('invite_links', __name__, url_prefix='/api/v1/invite-links')


@invite_links_bp.route('', methods=['POST'])
@require_auth
def generate_invite_link():
    """J13 + spec §10 (MD-7): create a share link — generic (profile),
    plan-specific, or place-specific. One mint path for every share surface."""
    body = request.get_json(silent=True) or {}
    plan_id = body.get('plan_id')
    place_id = body.get('place_id')
    if plan_id and place_id:
        return err('INVALID_REQUEST', 400, 'A link targets a plan or a place, not both.')
    sb = get_supabase()
    if plan_id:
        plan = sb.table('plans').select('*').eq('id', plan_id).maybe_single().execute()
        if not plan or not plan.data:
            return err('NOT_FOUND', 404, 'Plan not found.')
    if place_id:
        place = sb.table('places').select('id').eq('id', place_id).maybe_single().execute()
        if not place or not place.data:
            return err('NOT_FOUND', 404, 'Place not found.')
    token = secrets.token_urlsafe(12)
    result = sb.table('invite_links').insert({
        'token': token, 'created_by': g.user_id, 'plan_id': plan_id, 'place_id': place_id,
    }).execute()
    track('invite_link_shared', g.user_id, {'plan_id': plan_id, 'place_id': place_id})
    if place_id:
        track('place_shared', g.user_id, {'place_id': place_id})
    return ok(result.data[0], 201)


@invite_links_bp.route('/<token>', methods=['GET'])
@optional_auth
def get_invite_link(token: str):
    """Public resolve (J0.1): creator basics + a place teaser only — never plan
    details to anonymous viewers (plans are mutual-only)."""
    sb = get_supabase()
    row = sb.table('invite_links').select('*').eq('token', token).maybe_single().execute()
    link = row.data if row else None
    if not link:
        return err('NOT_FOUND', 404, 'This invite link is not valid.')

    expired = bool(link.get('expires_at')) and link['expires_at'] < datetime.now(timezone.utc).isoformat()
    creator = users_by_ids([link['created_by']]).get(link['created_by'])

    place_teaser = None
    plan_visible = False
    if link.get('plan_id'):
        plan_row = sb.table('plans').select('*').eq('id', link['plan_id']).maybe_single().execute()
        plan = plan_row.data if plan_row else None
        if plan:
            place_row = sb.table('places').select('*').eq('id', plan['place_id']).maybe_single().execute()
            place = place_row.data if place_row else None
            if place:
                place_teaser = {'name': place['name'], 'category': place.get('category'), 'place_id': place['id']}
            if g.user_id:
                rel = relationship(g.user_id, plan['organizer_id'])
                plan_visible = rel['is_mutual'] or rel['is_self'] or False

    # Place share links (spec §10): the place itself is world-viewable.
    if link.get('place_id'):
        place_row = sb.table('places').select('*').eq('id', link['place_id']).maybe_single().execute()
        place = place_row.data if place_row else None
        if place:
            place_teaser = {'name': place['name'], 'category': place.get('category'), 'place_id': place['id']}

    # List share links (Flow 19): resolve a teaser so the client can land on the
    # list page (public lists are world-readable).
    list_teaser = None
    if link.get('list_id'):
        list_row = sb.table('lists').select('*').eq('id', link['list_id']).maybe_single().execute()
        lst = list_row.data if list_row else None
        if lst and lst.get('visibility') == 'public':
            list_teaser = {'list_id': lst['id'], 'name': lst['name']}

    return ok({
        'token': token,
        'creator': public_user(creator),
        'place': place_teaser,
        'list': list_teaser,
        'plan_id': link.get('plan_id') if (plan_visible or not link.get('plan_id')) else None,
        'expired': expired,
    })


@invite_links_bp.route('/<token>/redeem', methods=['POST'])
@require_auth
def redeem_invite_link(token: str):
    """Post-signup attribution + auto-follow the inviter (J13). Best-effort:
    never blocks onboarding; expired links degrade to the landing page (J13.1)."""
    sb = get_supabase()
    row = sb.table('invite_links').select('*').eq('token', token).maybe_single().execute()
    link = row.data if row else None
    if not link:
        return err('NOT_FOUND', 404, 'This invite link is not valid.')
    if link.get('expires_at') and link['expires_at'] < datetime.now(timezone.utc).isoformat():
        return err('GONE', 410, 'This invite expired.')

    creator_id = link['created_by']
    followed = False
    if creator_id != g.user_id:
        try:
            sb.table('follows').insert({'follower_id': g.user_id, 'followee_id': creator_id}).execute()
            followed = True
            me = users_by_ids([g.user_id]).get(g.user_id) or {}
            notify(creator_id, 'new_follower', {
                'follower_id': g.user_id,
                'follower_handle': me.get('handle'),
                'follower_avatar_url': me.get('avatar_url'),
            })
        except DuplicateError:
            pass
        if not link.get('used_by'):
            sb.table('invite_links').update({
                'used_by': g.user_id, 'used_at': datetime.now(timezone.utc).isoformat(),
            }).eq('id', link['id']).execute()
            track('invite_link_converted', g.user_id, {'token': token, 'inviter_id': creator_id})

    creator = users_by_ids([creator_id]).get(creator_id)
    return ok({
        'followed': followed,
        'creator': public_user(creator),
        'plan_id': link.get('plan_id'),
        'place_id': link.get('place_id'),
        'list_id': link.get('list_id'),
    })
