from flask import Blueprint, jsonify, g
from ..middleware import require_auth
from ..extensions import get_supabase

joins_bp = Blueprint('joins', __name__, url_prefix='/api/v1/plans')


@joins_bp.route('/<plan_id>/join', methods=['POST'])
@require_auth
def join_plan(plan_id: str):
    sb = get_supabase()
    result = (
        sb.table('plan_joins')
        .upsert({'plan_id': plan_id, 'user_id': g.user_id})
        .execute()
    )
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 201


@joins_bp.route('/<plan_id>/join', methods=['DELETE'])
@require_auth
def leave_plan(plan_id: str):
    sb = get_supabase()
    sb.table('plan_joins').delete().eq('plan_id', plan_id).eq('user_id', g.user_id).execute()
    return jsonify({'data': None, 'error': None}), 204
