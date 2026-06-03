from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth
from ..extensions import get_supabase

users_bp = Blueprint('users', __name__, url_prefix='/api/v1/users')


@users_bp.route('/me', methods=['GET'])
@require_auth
def get_me():
    sb = get_supabase()
    result = sb.table('users').select('*').eq('id', g.user_id).maybe_single().execute()
    return jsonify({'data': result.data if result else None, 'error': None}), 200


@users_bp.route('/me', methods=['PATCH'])
@require_auth
def update_me():
    body = request.get_json(silent=True) or {}
    allowed = {'display_name', 'bio', 'avatar_url'}
    updates = {k: v for k, v in body.items() if k in allowed}
    sb = get_supabase()
    result = sb.table('users').update(updates).eq('id', g.user_id).execute()
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 200


@users_bp.route('/me/friends', methods=['GET'])
@require_auth
def get_friends():
    sb = get_supabase()
    following = sb.table('follows').select('followee_id').eq('follower_id', g.user_id).execute()
    followee_ids = [r['followee_id'] for r in (following.data or [])]
    followers = sb.table('follows').select('follower_id').in_('follower_id', followee_ids).eq('followee_id', g.user_id).execute()
    mutual_ids = [r['follower_id'] for r in (followers.data or [])]
    if not mutual_ids:
        return jsonify({'data': [], 'error': None}), 200
    users = sb.table('users').select('id, handle, display_name, avatar_url').in_('id', mutual_ids).execute()
    return jsonify({'data': users.data, 'error': None}), 200


@users_bp.route('/<handle>', methods=['GET'])
def get_user(handle: str):
    sb = get_supabase()
    result = sb.table('users').select('id, handle, display_name, avatar_url, bio').eq('handle', handle).maybe_single().execute()
    if not result or not result.data:
        return jsonify({'data': None, 'error': {'code': 'NOT_FOUND'}}), 404
    return jsonify({'data': result.data, 'error': None}), 200


@users_bp.route('/<handle>', methods=['PATCH'])
@require_auth
def update_user(handle: str):
    sb = get_supabase()
    me = sb.table('users').select('handle').eq('id', g.user_id).maybe_single().execute()
    if not me or not me.data or me.data['handle'] != handle:
        return jsonify({'data': None, 'error': {'code': 'FORBIDDEN'}}), 403
    body = request.get_json(silent=True) or {}
    allowed = {'display_name', 'bio', 'avatar_url'}
    updates = {k: v for k, v in body.items() if k in allowed}
    result = sb.table('users').update(updates).eq('id', g.user_id).execute()
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 200
