from flask import Blueprint, g

from ..middleware import require_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..signals import record_signal
from ..devdb import DuplicateError
from ..domain import relationship, users_by_ids, public_user, notify

joins_bp = Blueprint('joins', __name__, url_prefix='/api/v1/plans')


def _visible_plan(sb, plan_id: str, viewer_id: str) -> dict | None:
    row = sb.table('plans').select('*').eq('id', plan_id).maybe_single().execute()
    plan = row.data if row else None
    if not plan:
        return None
    if plan['organizer_id'] == viewer_id:
        return plan
    joined = sb.table('plan_joins').select('id').eq('plan_id', plan_id).eq('user_id', viewer_id).limit(1).execute()
    if joined.data:
        return plan
    rel = relationship(viewer_id, plan['organizer_id'])
    return plan if rel['is_mutual'] else None


@joins_bp.route('/<plan_id>/joins', methods=['POST'])
@require_auth
def join_plan(plan_id: str):
    """Flow 8 / J9. Idempotent (P2). Join is allowed on cancelled plans —
    plans survive their organizer (race ledger, journey 6.2/9.3) — and on
    timeless plans: Join means "count me in", date or not (M-D8a)."""
    sb = get_supabase()
    plan = _visible_plan(sb, plan_id, g.user_id)
    if not plan:
        return err('NOT_FOUND', 404, 'This plan is not available.')
    if plan['organizer_id'] == g.user_id:
        return err('VALIDATION_ERROR', 422, "You're the organizer — you're already going.")

    created = True
    try:
        sb.table('plan_joins').insert({'plan_id': plan_id, 'user_id': g.user_id}).execute()
    except DuplicateError:
        created = False

    if created:
        track('plan_joined', g.user_id, {'plan_id': plan_id})
        joiner = users_by_ids([g.user_id]).get(g.user_id) or {}
        place_row = sb.table('places').select('*').eq('id', plan['place_id']).maybe_single().execute()
        place = place_row.data if place_row else None
        record_signal('plan_join', g.user_id, place_id=plan['place_id'],
                      context={'category': (place or {}).get('category')})
        notify(plan['organizer_id'], 'friend_joined_plan', {
            'plan_id': plan_id,
            'joiner_handle': joiner.get('handle'),
            'joiner_avatar_url': joiner.get('avatar_url'),
            'place_name': (place or {}).get('name'),
        })

    from .plans import serialize_plan
    fresh = sb.table('plans').select('*').eq('id', plan_id).single().execute().data
    return ok(serialize_plan(fresh, g.user_id), 201 if created else 200)


@joins_bp.route('/<plan_id>/joins', methods=['DELETE'])
@require_auth
def leave_plan(plan_id: str):
    """J9.5: leave a plan. Idempotent; no organizer notification in MVP-1."""
    sb = get_supabase()
    sb.table('plan_joins').delete().eq('plan_id', plan_id).eq('user_id', g.user_id).execute()
    return ok(None)


@joins_bp.route('/<plan_id>/joins', methods=['GET'])
@require_auth
def list_joins(plan_id: str):
    """Attendee list — visible to anyone who can view the plan (spec: 'see everyone who is joining')."""
    sb = get_supabase()
    plan = _visible_plan(sb, plan_id, g.user_id)
    if not plan:
        return err('NOT_FOUND', 404)
    joins = sb.table('plan_joins').select('user_id').eq('plan_id', plan_id).execute().data or []
    users = users_by_ids([r['user_id'] for r in joins])
    return ok([public_user(u) for u in users.values()])
