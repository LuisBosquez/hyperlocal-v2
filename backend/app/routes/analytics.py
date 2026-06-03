import os
from flask import Blueprint, jsonify, request, g
from ..middleware import require_auth

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/v1/analytics')

_posthog = None


def _get_posthog():
    global _posthog
    if _posthog is None:
        from posthog import Posthog
        _posthog = Posthog(
            project_api_key=os.environ.get('POSTHOG_PROJECT_API_KEY', ''),
            host=os.environ.get('POSTHOG_HOST', 'https://us.posthog.com'),
        )
    return _posthog


@analytics_bp.route('/capture', methods=['POST'])
@require_auth
def capture_event():
    """Proxy client-side PostHog events through the server for data integrity."""
    if os.environ.get('FLASK_ENV') == 'development':
        return jsonify({'data': None, 'error': None}), 200

    body = request.get_json(silent=True) or {}
    event = body.get('event')
    properties = body.get('properties', {})
    if not event:
        return jsonify({'data': None, 'error': {'code': 'MISSING_EVENT'}}), 400

    _get_posthog().capture(g.user_id, event, properties)
    return jsonify({'data': None, 'error': None}), 200
