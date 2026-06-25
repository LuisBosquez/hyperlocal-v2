from flask import Blueprint, request, g

from ..middleware import require_auth
from ..errors import ok, err
from ..telemetry import track

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/v1/analytics')

# Client-originated events allowed through the proxy. Server-truth events
# (plan_created, plan_joined, ...) are emitted server-side only.
CLIENT_EVENTS = {'user_active_session', 'invite_link_shared', 'page_view'}


@analytics_bp.route('/capture', methods=['POST'])
@require_auth
def capture_event():
    """Proxy client events through the server (tech/04 §10). Always succeeds
    from the client's perspective — telemetry never breaks UX (P9 / X.5)."""
    body = request.get_json(silent=True) or {}
    event = body.get('event')
    if not event:
        return err('INVALID_REQUEST', 400, 'event is required.')
    if event in CLIENT_EVENTS:
        track(event, g.user_id, body.get('properties') or {})
    return ok(None, 204)
