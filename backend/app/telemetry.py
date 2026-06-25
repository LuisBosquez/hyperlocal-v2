"""Server-side telemetry (tech/04 §events). Inserts into the events table and
mirrors to PostHog. Both writes are soft-fail (pattern P9): telemetry must
never break a user-facing request.
"""
import os
import logging

from .extensions import get_supabase

logger = logging.getLogger(__name__)

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


def track(event_name: str, user_id: str | None, properties: dict | None = None):
    properties = properties or {}
    try:
        get_supabase().table('events').insert({
            'event_name': event_name,
            'user_id': user_id,
            'properties': properties,
        }).execute()
    except Exception:
        logger.exception('events insert failed for %s', event_name)
    if os.environ.get('FLASK_ENV') == 'development':
        return
    try:
        if os.environ.get('POSTHOG_PROJECT_API_KEY'):
            _get_posthog().capture(user_id or 'anonymous', event_name, properties)
    except Exception:
        logger.exception('posthog capture failed for %s', event_name)
