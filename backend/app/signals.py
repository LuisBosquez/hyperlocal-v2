"""Discovery-signals pipeline (pm/specs/mvp-map-discovery.md §7, decision MD-6).

Collects the user-generated data that fuels future contextual recommendations:
list names, personal notes, search queries, category/city searches, and plan
joins — each with whatever location/time context the request carried. This
release only collects; nothing reads the corpus yet.

Every write is soft-fail: a signal must never break a user-facing request.
"""
import logging
from datetime import datetime, timezone

from .extensions import get_supabase

logger = logging.getLogger(__name__)

SIGNAL_KINDS = {
    'list_name', 'note', 'search_query', 'category_search',
    'city_search', 'contextual_click', 'save', 'plan_join',
}


def record_signal(kind: str, user_id: str | None, *, text: str | None = None,
                  place_id: str | None = None, context: dict | None = None):
    if kind not in SIGNAL_KINDS:
        logger.warning('unknown signal kind %s dropped', kind)
        return
    ctx = {k: v for k, v in (context or {}).items() if v is not None}
    ctx.setdefault('hour_utc', datetime.now(timezone.utc).hour)
    try:
        get_supabase().table('discovery_signals').insert({
            'user_id': user_id,
            'kind': kind,
            'text': text,
            'place_id': place_id,
            'context': ctx,
        }).execute()
    except Exception:
        logger.exception('discovery_signals insert failed for %s', kind)
