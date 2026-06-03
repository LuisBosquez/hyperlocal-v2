from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth
from ..extensions import get_supabase

social_bp = Blueprint('social', __name__, url_prefix='/api/v1/follows')


@social_bp.route('', methods=['POST'])
@require_auth
def follow():
    body = request.get_json(silent=True) or {}
    followee_id = body.get('followee_id')
    if not followee_id or followee_id == g.user_id:
        return jsonify({'data': None, 'error': {'code': 'INVALID_FOLLOWEE'}}), 400
    sb = get_supabase()
    result = (
        sb.table('follows')
        .upsert({'follower_id': g.user_id, 'followee_id': followee_id})
        .execute()
    )
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 201


@social_bp.route('/<followee_id>', methods=['DELETE'])
@require_auth
def unfollow(followee_id: str):
    sb = get_supabase()
    sb.table('follows').delete().eq('follower_id', g.user_id).eq('followee_id', followee_id).execute()
    return jsonify({'data': None, 'error': None}), 204


@social_bp.route('/followers', methods=['GET'])
@require_auth
def get_followers():
    sb = get_supabase()
    result = sb.table('follows').select('follower_id, users!follower_id(handle, avatar_url)').eq('followee_id', g.user_id).execute()
    return jsonify({'data': result.data, 'error': None}), 200


@social_bp.route('/following', methods=['GET'])
@require_auth
def get_following():
    sb = get_supabase()
    result = sb.table('follows').select('followee_id, users!followee_id(handle, avatar_url)').eq('follower_id', g.user_id).execute()
    return jsonify({'data': result.data, 'error': None}), 200
