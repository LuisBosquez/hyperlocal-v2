from flask import Blueprint, g

from ..middleware import require_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..devdb import DuplicateError
from ..domain import relationship, users_by_ids, public_user

interests_bp = Blueprint('interests', __name__, url_prefix='/api/v1/plans')


@interests_bp.route('/<plan_id>/interests', methods=['POST'])
@require_auth
def mark_interested(plan_id: str):
    """Flow 8.2 / J10. Idempotent toggle (P2) — the canonical optimistic mutation."""
    sb = get_supabase()
    row = sb.table('plans').select('*').eq('id', plan_id).maybe_single().execute()
    plan = row.data if row else None
    if not plan:
        return err('NOT_FOUND', 404)
    if plan['organizer_id'] == g.user_id:
        return err('VALIDATION_ERROR', 422, "It's your plan.")
    rel = relationship(g.user_id, plan['organizer_id'])
    if not rel['is_mutual']:
        joined = sb.table('plan_joins').select('id').eq('plan_id', plan_id).eq('user_id', g.user_id).limit(1).execute()
        if not joined.data:
            return err('NOT_FOUND', 404, 'This plan is not available.')

    created = True
    try:
        sb.table('plan_interests').insert({'plan_id': plan_id, 'user_id': g.user_id}).execute()
    except DuplicateError:
        created = False
    if created:
        track('plan_interested', g.user_id, {'plan_id': plan_id})

    count = len(sb.table('plan_interests').select('id').eq('plan_id', plan_id).execute().data or [])
    return ok({'interested': True, 'interest_count': count}, 201 if created else 200)


@interests_bp.route('/<plan_id>/interests', methods=['DELETE'])
@require_auth
def remove_interest(plan_id: str):
    """J10.3: retract. Silently leaves the future notification audience."""
    sb = get_supabase()
    sb.table('plan_interests').delete().eq('plan_id', plan_id).eq('user_id', g.user_id).execute()
    count = len(sb.table('plan_interests').select('id').eq('plan_id', plan_id).execute().data or [])
    return ok({'interested': False, 'interest_count': count})


@interests_bp.route('/<plan_id>/interests', methods=['GET'])
@require_auth
def list_interests(plan_id: str):
    """M-D13(a): Interested identities are visible to the organizer only."""
    sb = get_supabase()
    row = sb.table('plans').select('*').eq('id', plan_id).maybe_single().execute()
    plan = row.data if row else None
    if not plan:
        return err('NOT_FOUND', 404)
    if plan['organizer_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'Only the organizer can see who is interested.')
    interests = sb.table('plan_interests').select('user_id').eq('plan_id', plan_id).execute().data or []
    users = users_by_ids([r['user_id'] for r in interests])
    return ok([public_user(u) for u in users.values()])
