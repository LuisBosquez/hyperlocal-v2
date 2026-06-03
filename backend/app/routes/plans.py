from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth
from ..extensions import get_supabase

plans_bp = Blueprint('plans', __name__, url_prefix='/api/v1/plans')


@plans_bp.route('', methods=['POST'])
@require_auth
def create_plan():
    body = request.get_json(silent=True) or {}
    place_id = body.get('place_id')
    if not place_id:
        return jsonify({'data': None, 'error': {'code': 'MISSING_PLACE_ID'}}), 400
    sb = get_supabase()
    result = (
        sb.table('plans')
        .insert({
            'organizer_id': g.user_id,
            'place_id': place_id,
            'plan_date': body.get('plan_date'),
            'plan_time': body.get('plan_time'),
            'is_timeless': not body.get('plan_date'),
        })
        .execute()
    )
    plan = result.data[0] if result.data else None
    return jsonify({'data': plan, 'error': None}), 201


@plans_bp.route('/<plan_id>', methods=['GET'])
@require_auth
def get_plan(plan_id: str):
    sb = get_supabase()
    result = sb.table('plans').select('*').eq('id', plan_id).single().execute()
    return jsonify({'data': result.data, 'error': None}), 200


@plans_bp.route('/<plan_id>', methods=['PATCH'])
@require_auth
def update_plan(plan_id: str):
    body = request.get_json(silent=True) or {}
    sb = get_supabase()
    existing = sb.table('plans').select('organizer_id').eq('id', plan_id).single().execute()
    if not existing.data or existing.data['organizer_id'] != g.user_id:
        return jsonify({'data': None, 'error': {'code': 'FORBIDDEN'}}), 403
    allowed = {'plan_date', 'plan_time', 'is_timeless'}
    updates = {k: v for k, v in body.items() if k in allowed}
    result = sb.table('plans').update(updates).eq('id', plan_id).execute()
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 200


@plans_bp.route('/<plan_id>/cancel', methods=['POST'])
@require_auth
def cancel_plan(plan_id: str):
    sb = get_supabase()
    existing = sb.table('plans').select('organizer_id').eq('id', plan_id).single().execute()
    if not existing.data or existing.data['organizer_id'] != g.user_id:
        return jsonify({'data': None, 'error': {'code': 'FORBIDDEN'}}), 403
    result = sb.table('plans').update({'is_cancelled': True}).eq('id', plan_id).execute()
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 200


@plans_bp.route('/<plan_id>/joins', methods=['GET'])
@require_auth
def get_plan_joins(plan_id: str):
    sb = get_supabase()
    result = sb.table('plan_joins').select('user_id, users(handle, avatar_url)').eq('plan_id', plan_id).execute()
    return jsonify({'data': result.data, 'error': None}), 200


@plans_bp.route('/<plan_id>/interests', methods=['GET'])
@require_auth
def get_plan_interests(plan_id: str):
    sb = get_supabase()
    result = sb.table('plan_interests').select('user_id, users(handle, avatar_url)').eq('plan_id', plan_id).execute()
    return jsonify({'data': result.data, 'error': None}), 200
