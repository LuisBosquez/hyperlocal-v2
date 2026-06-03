from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth
from ..extensions import get_supabase

interests_bp = Blueprint('interests', __name__, url_prefix='/api/v1/plans')


@interests_bp.route('/<plan_id>/interest', methods=['POST'])
@require_auth
def mark_interested(plan_id: str):
    sb = get_supabase()
    result = (
        sb.table('plan_interests')
        .upsert({'plan_id': plan_id, 'user_id': g.user_id})
        .execute()
    )
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 201


@interests_bp.route('/<plan_id>/interest', methods=['DELETE'])
@require_auth
def remove_interest(plan_id: str):
    sb = get_supabase()
    sb.table('plan_interests').delete().eq('plan_id', plan_id).eq('user_id', g.user_id).execute()
    return jsonify({'data': None, 'error': None}), 204
