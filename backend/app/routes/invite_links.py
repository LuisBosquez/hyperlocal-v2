import secrets
from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth
from ..extensions import get_supabase

invite_links_bp = Blueprint('invite_links', __name__, url_prefix='/api/v1/invite-links')


@invite_links_bp.route('', methods=['POST'])
@require_auth
def generate_invite_link():
    body = request.get_json(silent=True) or {}
    plan_id = body.get('plan_id')
    token = secrets.token_urlsafe(16)
    sb = get_supabase()
    result = (
        sb.table('invite_links')
        .insert({'token': token, 'creator_id': g.user_id, 'plan_id': plan_id})
        .execute()
    )
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 201


@invite_links_bp.route('/<token>', methods=['GET'])
def get_invite_link(token: str):
    sb = get_supabase()
    result = (
        sb.table('invite_links')
        .select('*, plans(*), users!creator_id(handle, avatar_url)')
        .eq('token', token)
        .single()
        .execute()
    )
    return jsonify({'data': result.data, 'error': None}), 200


@invite_links_bp.route('/<token>/redeem', methods=['POST'])
@require_auth
def redeem_invite_link(token: str):
    sb = get_supabase()
    link = sb.table('invite_links').select('creator_id').eq('token', token).single().execute()
    if not link.data:
        return jsonify({'data': None, 'error': {'code': 'INVALID_TOKEN'}}), 404
    creator_id = link.data['creator_id']
    if creator_id != g.user_id:
        sb.table('follows').upsert({'follower_id': g.user_id, 'followee_id': creator_id}).execute()
    return jsonify({'data': {'followed': creator_id}, 'error': None}), 200
