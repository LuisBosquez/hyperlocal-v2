from flask import Blueprint, jsonify, g
from ..middleware import require_auth
from ..extensions import get_supabase

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


@auth_bp.route('/session', methods=['POST'])
@require_auth
def session():
    """Return the current user and whether onboarding is needed."""
    sb = get_supabase()
    result = sb.table('users').select('*').eq('id', g.user_id).maybe_single().execute()
    user = result.data if result else None
    needs_onboarding = user is None or not user.get('handle')
    return jsonify({'data': {'user': user, 'needs_onboarding': needs_onboarding}, 'error': None}), 200


@auth_bp.route('/onboard', methods=['POST'])
@require_auth
def onboard():
    """Set handle and display_name for a newly registered user."""
    from flask import request
    body = request.get_json(silent=True) or {}
    handle = body.get('handle', '').strip()
    display_name = body.get('display_name', '').strip()
    if not handle:
        return jsonify({'data': None, 'error': {'code': 'INVALID_HANDLE'}}), 400
    sb = get_supabase()
    result = (
        sb.table('users')
        .upsert({'id': g.user_id, 'handle': handle, 'display_name': display_name})
        .execute()
    )
    return jsonify({'data': result.data[0] if result.data else None, 'error': None}), 200


@auth_bp.route('/me', methods=['GET'])
@require_auth
def me():
    """Alias: return the authenticated user's profile row."""
    sb = get_supabase()
    result = sb.table('users').select('*').eq('id', g.user_id).maybe_single().execute()
    return jsonify({'data': result.data if result else None, 'error': None}), 200
