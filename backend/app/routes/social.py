from flask import Blueprint, request, g

from ..middleware import require_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..devdb import DuplicateError
from ..domain import follows, users_by_ids, public_user, notify

social_bp = Blueprint('social', __name__, url_prefix='/api/v1/follows')

RENOTIFY_SUPPRESS_HOURS = 24  # J7.7: re-follow shortly after unfollow doesn't re-notify


@social_bp.route('', methods=['POST'])
@require_auth
def follow():
    """Flow 6 / J7. Follow by handle; immediate, no approval. Idempotent (P2).
    Private profiles can't gain new followers (Flow 11)."""
    body = request.get_json(silent=True) or {}
    handle = (body.get('handle') or '').strip().lower().lstrip('@')
    if not handle:
        return err('INVALID_REQUEST', 400, 'handle is required.')

    sb = get_supabase()
    row = sb.table('users').select('*').eq('handle', handle).maybe_single().execute()
    target = row.data if row else None
    if not target:
        return err('NOT_FOUND', 404, 'No one with that handle.')
    if target['id'] == g.user_id:
        return err('VALIDATION_ERROR', 422, "You can't follow yourself.")  # J7.4 backstop
    already_following = follows(g.user_id, target['id'])
    if target.get('is_private') and not already_following:
        return err('FORBIDDEN', 403, 'This profile is private.')  # J7.5

    created = True
    try:
        sb.table('follows').insert({'follower_id': g.user_id, 'followee_id': target['id']}).execute()
    except DuplicateError:
        created = False

    became_mutual = follows(target['id'], g.user_id)
    if created:
        me = users_by_ids([g.user_id]).get(g.user_id) or {}
        # J7.7: suppress duplicate notification on quick re-follow
        recent = sb.table('notifications').select('id, data, created_at') \
            .eq('user_id', target['id']).eq('type', 'new_follower') \
            .order('created_at', desc=True).limit(5).execute().data or []
        already_notified = any((n.get('data') or {}).get('follower_id') == g.user_id for n in recent)
        if not already_notified:
            notify(target['id'], 'new_follower', {
                'follower_id': g.user_id,
                'follower_handle': me.get('handle'),
                'follower_avatar_url': me.get('avatar_url'),
            })
        if became_mutual:
            track('mutual_connection_formed', g.user_id, {'with_user_id': target['id']})
            # follow_back_prompt: "a user you follow has followed you back" → to the original follower
            notify(target['id'], 'follow_back_prompt', {
                'follower_id': g.user_id, 'follower_handle': me.get('handle'),
            })

    return ok({
        'following': True, 'handle': target['handle'], 'is_mutual': became_mutual,
    }, 201 if created else 200)


@social_bp.route('/<handle>', methods=['DELETE'])
@require_auth
def unfollow(handle: str):
    """J7.7: idempotent unfollow. Mutuality is derived, never stored, so the
    other side's follow is untouched and a re-follow restores friendship."""
    sb = get_supabase()
    row = sb.table('users').select('id').eq('handle', handle.lower()).maybe_single().execute()
    target = row.data if row else None
    if not target:
        return err('NOT_FOUND', 404)
    sb.table('follows').delete().eq('follower_id', g.user_id).eq('followee_id', target['id']).execute()
    return ok({'following': False, 'handle': handle})


@social_bp.route('/followers', methods=['GET'])
@require_auth
def get_followers():
    sb = get_supabase()
    rows = sb.table('follows').select('follower_id').eq('followee_id', g.user_id).execute().data or []
    users = users_by_ids([r['follower_id'] for r in rows])
    out = []
    for r in rows:
        u = users.get(r['follower_id'])
        if u:
            out.append({**public_user(u), 'follows_me': True, 'i_follow': follows(g.user_id, u['id'])})
    return ok(out)


@social_bp.route('/following', methods=['GET'])
@require_auth
def get_following():
    sb = get_supabase()
    rows = sb.table('follows').select('followee_id').eq('follower_id', g.user_id).execute().data or []
    users = users_by_ids([r['followee_id'] for r in rows])
    out = []
    for r in rows:
        u = users.get(r['followee_id'])
        if u:
            out.append({**public_user(u), 'i_follow': True, 'follows_me': follows(u['id'], g.user_id)})
    return ok(out)
