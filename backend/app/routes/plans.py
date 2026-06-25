from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, request, g

from ..middleware import require_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..telemetry import track
from ..devdb import DuplicateError
from ..domain import (
    relationship, users_by_ids, public_user, plan_state, time_granularity,
    is_past, is_unconfirmed, validate_plan_datetime, validate_proposal_option,
    notify, plan_audience,
)

PROPOSAL_DEFAULT_TTL_DAYS = 2   # M-D17: proposer-settable, defaults to 48h
PROPOSAL_MAX_OPTIONS = 5

plans_bp = Blueprint('plans', __name__, url_prefix='/api/v1/plans')


def _get_place(sb, place_id: str) -> dict | None:
    row = sb.table('places').select('*').eq('id', place_id).maybe_single().execute()
    return row.data if row else None


def serialize_plan(plan: dict, viewer_id: str | None, place: dict | None = None,
                   include_people: bool = True) -> dict:
    sb = get_supabase()
    place = place or _get_place(sb, plan['place_id'])
    joins = sb.table('plan_joins').select('user_id').eq('plan_id', plan['id']).execute().data or []
    interests = sb.table('plan_interests').select('user_id').eq('plan_id', plan['id']).execute().data or []
    join_ids = [r['user_id'] for r in joins]
    interest_ids = {r['user_id'] for r in interests}

    organizer = users_by_ids([plan['organizer_id']]).get(plan['organizer_id'])
    is_organizer = viewer_id == plan['organizer_id']

    out = {
        'id': plan['id'],
        'place_id': plan['place_id'],
        'place': place and {
            'place_id': place['id'], 'name': place['name'], 'address': place['address'],
            'category': place.get('category'), 'photo_url': place.get('photo_url'),
            'lat': place['lat'], 'lng': place['lng'],
            'opening_hours': place.get('opening_hours'),
            'is_unavailable': bool(place.get('is_unavailable')),
        },
        'organizer': public_user(organizer),
        'plan_date': plan.get('plan_date'),
        'plan_time': plan.get('plan_time'),
        'plan_time_band': plan.get('plan_time_band'),
        'is_timeless': bool(plan.get('is_timeless')),
        'state': plan_state(plan),
        'time_granularity': time_granularity(plan),
        'status': plan.get('status', 'active'),
        'is_cancelled': plan.get('status') == 'cancelled',
        'is_past': is_past(plan, place),
        'is_unconfirmed': is_unconfirmed(plan, place),  # M-D4/M-D5: computed label
        'created_at': plan.get('created_at'),
        # M-D13(a): count visible to anyone who can see the plan
        'interest_count': len(interest_ids),
        'join_count': len(join_ids),
        'viewer': {
            'is_organizer': is_organizer,
            'has_joined': viewer_id in join_ids if viewer_id else False,
            'is_interested': viewer_id in interest_ids if viewer_id else False,
        },
    }
    if include_people:
        attendees = users_by_ids(join_ids)
        out['attendees'] = [public_user(attendees[i]) for i in join_ids if i in attendees]
        # M-D13(a): Interested identities are organizer-only
        if is_organizer:
            interested_users = users_by_ids(list(interest_ids))
            out['interested_users'] = [public_user(u) for u in interested_users.values()]
        # Pending time proposal, if any (Flow 4.3/4.4). Detail view only.
        out['pending_proposal'] = _pending_proposal(sb, plan['id'], viewer_id)
    return out


def _can_view_plan(plan: dict, viewer_id: str) -> bool:
    if plan['organizer_id'] == viewer_id:
        return True
    sb = get_supabase()
    joined = sb.table('plan_joins').select('id').eq('plan_id', plan['id']).eq('user_id', viewer_id).limit(1).execute()
    if joined.data:
        return True  # joiners keep access even if mutuality later breaks (plans survive)
    rel = relationship(viewer_id, plan['organizer_id'])
    return rel['is_mutual']


def _plan_row(sb, plan_id: str) -> dict | None:
    row = sb.table('plans').select('*').eq('id', plan_id).maybe_single().execute()
    return row.data if row else None


def _serialize_proposal(prop: dict, viewer_id: str | None) -> dict:
    proposer = users_by_ids([prop['proposer_id']]).get(prop['proposer_id'])
    return {
        'id': prop['id'],
        'plan_id': prop['plan_id'],
        'proposer': public_user(proposer),
        'status': prop.get('status', 'pending'),
        'options': prop.get('options') or [],
        'expires_at': prop.get('expires_at'),
        'accepted_option': prop.get('accepted_option'),
        'viewer_is_proposer': viewer_id == prop['proposer_id'],
        'created_at': prop.get('created_at'),
    }


def _pending_proposal(sb, plan_id: str, viewer_id: str | None) -> dict | None:
    rows = (
        sb.table('plan_time_proposals').select('*')
        .eq('plan_id', plan_id).eq('status', 'pending').execute().data or []
    )
    return _serialize_proposal(rows[0], viewer_id) if rows else None


def _apply_materialization(sb, plan: dict, place: dict | None, *, plan_date, plan_time,
                           plan_time_band, actor_id: str, exclude_audience: set | None = None):
    """Shared by PATCH /plans/:id and proposal-accept. Writes the plan's "when",
    fires plan_materialized once on the first when (exact OR band — M-D20), and fans
    out plan_time_updated to Joined ∪ Interested (minus the actor and any proposer who
    receives a specific card). Returns the updated plan row."""
    plan_id = plan['id']
    had_when = bool(plan.get('plan_time') or plan.get('plan_time_band'))
    updated = sb.table('plans').update({
        'plan_date': plan_date, 'plan_time': plan_time,
        'plan_time_band': plan_time_band, 'is_timeless': False,
    }).eq('id', plan_id).execute().data[0]

    has_when = bool(plan_time or plan_time_band)
    if has_when:
        if not had_when:
            track('plan_materialized', actor_id, {
                'plan_id': plan_id, 'place_id': plan['place_id'],
                'time_granularity': 'exact' if plan_time else 'approximate',
            })
        organizer = users_by_ids([plan['organizer_id']]).get(plan['organizer_id']) or {}
        exclude = {actor_id} | (exclude_audience or set())
        for uid in plan_audience(plan_id, exclude=exclude):
            notify(uid, 'plan_time_updated', {
                'plan_id': plan_id,
                'organizer_handle': organizer.get('handle'),
                'place_name': (place or {}).get('name'),
                'plan_date': plan_date,
                'plan_time': plan_time,
                'plan_time_band': plan_time_band,
            })
    return updated


def _void_pending_proposals(sb, plan_id: str, place: dict | None, reason: str):
    """Decline any pending proposals (e.g. the organizer set a time directly). The
    proposer is notified; idempotent."""
    pending = (
        sb.table('plan_time_proposals').select('*')
        .eq('plan_id', plan_id).eq('status', 'pending').execute().data or []
    )
    for prop in pending:
        sb.table('plan_time_proposals').update({'status': 'declined'}).eq('id', prop['id']).execute()
        notify(prop['proposer_id'], 'plan_proposal_declined', {
            'plan_id': plan_id, 'place_name': (place or {}).get('name'), 'reason': reason,
        })


@plans_bp.route('', methods=['POST'])
@require_auth
def create_plan():
    """Flow 4.1 + journeys J4. Creating a plan auto-saves the place."""
    body = request.get_json(silent=True) or {}
    place_id = body.get('place_id')
    if not place_id:
        return err('INVALID_REQUEST', 400, 'place_id is required.')

    sb = get_supabase()
    place = _get_place(sb, place_id)
    if not place:
        return err('NOT_FOUND', 404, 'Place not found.')
    if place.get('is_unavailable'):
        return err('PLACE_UNAVAILABLE', 422, 'This place is no longer available.')

    plan_date = body.get('plan_date')
    plan_time = body.get('plan_time')
    plan_time_band = body.get('plan_time_band')  # coarse band, picker tier (M-D19)
    is_timeless = bool(body.get('is_timeless')) or (not plan_date and not plan_time and not plan_time_band)

    if is_timeless:
        plan_date = plan_time = plan_time_band = None
    else:
        if not plan_date:
            return err('INVALID_REQUEST', 400, 'A date is required unless the plan is timeless.')
        if plan_time is not None:
            plan_time_band = None  # exact time and band are mutually exclusive
            code = validate_plan_datetime(place, plan_date, plan_time)
        elif plan_time_band is not None:
            code = validate_proposal_option(place, {'plan_date': plan_date, 'plan_time_band': plan_time_band})
        else:
            code = validate_plan_datetime(place, plan_date, None)
        if code:
            return err(code, 422)

    result = sb.table('plans').insert({
        'organizer_id': g.user_id,
        'place_id': place_id,
        'plan_date': plan_date,
        'plan_time': plan_time,
        'plan_time_band': plan_time_band,
        'is_timeless': is_timeless,
        'status': 'active',
    }).execute()
    plan = result.data[0]

    # Auto-save the place (Flow 4.1 step 6); never clobber an existing note (race ledger)
    existing_save = sb.table('user_places').select('id').eq('user_id', g.user_id).eq('place_id', place_id).limit(1).execute()
    if not existing_save.data:
        sb.table('user_places').upsert(
            {'user_id': g.user_id, 'place_id': place_id}, on_conflict='user_id,place_id'
        ).execute()

    track('plan_created', g.user_id, {'plan_id': plan['id'], 'place_id': place_id, 'state': plan_state(plan)})
    return ok(serialize_plan(plan, g.user_id, place), 201)


@plans_bp.route('/<plan_id>', methods=['GET'])
@require_auth
def get_plan(plan_id: str):
    sb = get_supabase()
    row = sb.table('plans').select('*').eq('id', plan_id).maybe_single().execute()
    plan = row.data if row else None
    if not plan or not _can_view_plan(plan, g.user_id):
        return err('NOT_FOUND', 404, 'This plan is not available.')  # P3: no existence leak
    return ok(serialize_plan(plan, g.user_id))


@plans_bp.route('/<plan_id>', methods=['PATCH'])
@require_auth
def update_plan(plan_id: str):
    """Add or change date/time — the materialization step (Flow 4.2, M-J1/M-J6).
    Accepts an exact plan_time or a coarse plan_time_band (M-D19). On the first "when"
    (exact OR band) plan_materialized fires once (M-D10a/M-D20); Joined ∪ Interested are
    notified on set/change (M-D7a, M-D11a). Setting a time directly clears any pending
    proposal (M-D16)."""
    body = request.get_json(silent=True) or {}
    sb = get_supabase()
    plan = _plan_row(sb, plan_id)
    if not plan:
        return err('NOT_FOUND', 404)
    if plan['organizer_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'Only the organizer can edit a plan.')
    if plan.get('status') == 'cancelled':
        return err('CONFLICT', 409, 'This plan was cancelled.')

    plan_date = body.get('plan_date', plan.get('plan_date'))
    plan_time = body.get('plan_time', plan.get('plan_time'))
    plan_time_band = body.get('plan_time_band', plan.get('plan_time_band'))
    if not plan_date:
        return err('INVALID_REQUEST', 400, 'A date is required to schedule a plan.')
    # Exact time and band are mutually exclusive; whichever the body sets wins.
    if body.get('plan_time'):
        plan_time_band = None
    elif body.get('plan_time_band'):
        plan_time = None

    place = _get_place(sb, plan['place_id'])
    if plan_time is not None:
        code = validate_plan_datetime(place, plan_date, plan_time)
    elif plan_time_band is not None:
        code = validate_proposal_option(place, {'plan_date': plan_date, 'plan_time_band': plan_time_band})
    else:
        code = validate_plan_datetime(place, plan_date, None)  # date-only (timeless → tentative)
    if code:
        return err(code, 422)

    updated = _apply_materialization(
        sb, plan, place, plan_date=plan_date, plan_time=plan_time,
        plan_time_band=plan_time_band, actor_id=g.user_id,
    )
    if plan_time or plan_time_band:
        _void_pending_proposals(sb, plan_id, place, reason='organizer_set_time')

    return ok(serialize_plan(updated, g.user_id, place))


@plans_bp.route('/<plan_id>/cancel', methods=['POST'])
@require_auth
def cancel_plan(plan_id: str):
    """Flow 5 / J6. Idempotent. Joiners are notified and keep the plan;
    Interested users are not notified (M-D12a). The place stays saved."""
    sb = get_supabase()
    row = sb.table('plans').select('*').eq('id', plan_id).maybe_single().execute()
    plan = row.data if row else None
    if not plan:
        return err('NOT_FOUND', 404)
    if plan['organizer_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'Only the organizer can cancel a plan.')
    if plan.get('status') == 'cancelled':
        return ok(serialize_plan(plan, g.user_id))  # P2: double-cancel is a no-op success

    result = sb.table('plans').update({'status': 'cancelled'}).eq('id', plan_id).execute()
    updated = result.data[0]

    place = _get_place(sb, plan['place_id'])
    organizer = users_by_ids([g.user_id]).get(g.user_id) or {}
    joins = sb.table('plan_joins').select('user_id').eq('plan_id', plan_id).execute().data or []
    for r in joins:
        if r['user_id'] != g.user_id:
            notify(r['user_id'], 'plan_cancelled', {
                'plan_id': plan_id,
                'organizer_handle': organizer.get('handle'),
                'place_name': (place or {}).get('name'),
            })
    return ok(serialize_plan(updated, g.user_id, place))


# --- Collaborative time proposals (Flow 4.3/4.4, M-D14..M-D18) ---------------------

@plans_bp.route('/<plan_id>/proposals', methods=['POST'])
@require_auth
def create_proposal(plan_id: str):
    """Flow 4.3 / J5.2. A mutual friend (not the organizer) proposes 1..N time
    options on a timeless/tentative plan. One pending proposal per plan (M-D16)."""
    body = request.get_json(silent=True) or {}
    sb = get_supabase()
    plan = _plan_row(sb, plan_id)
    if not plan or not _can_view_plan(plan, g.user_id):
        return err('NOT_FOUND', 404, 'This plan is not available.')  # P3: no existence leak
    if plan['organizer_id'] == g.user_id:
        return err('FORBIDDEN', 403, 'Organizers set their own time directly.')
    if plan.get('status') == 'cancelled':
        return err('CONFLICT', 409, 'This plan was cancelled.')
    if plan_state(plan) == 'confirmed':
        return err('CONFLICT', 409, 'This plan already has a time.')

    options = body.get('options') or []
    if not isinstance(options, list) or not (1 <= len(options) <= PROPOSAL_MAX_OPTIONS):
        return err('INVALID_REQUEST', 400, f'Propose between 1 and {PROPOSAL_MAX_OPTIONS} time options.')
    place = _get_place(sb, plan['place_id'])
    norm = []
    for opt in options:
        code = validate_proposal_option(place, opt)
        if code:
            return err(code, 422)
        norm.append({
            'plan_date': opt['plan_date'],
            'plan_time': opt.get('plan_time'),
            'plan_time_band': opt.get('plan_time_band'),
        })

    # One pending proposal per plan (M-D16). App-level pre-check (the dev shim has no
    # partial-unique index); the Postgres index is the production backstop.
    existing = (
        sb.table('plan_time_proposals').select('id')
        .eq('plan_id', plan_id).eq('status', 'pending').limit(1).execute()
    )
    if existing.data:
        return err('CONFLICT', 409, 'Someone already proposed times — waiting on the organizer.')

    try:
        ttl = int(body.get('expires_in_days', PROPOSAL_DEFAULT_TTL_DAYS))
    except (ValueError, TypeError):
        ttl = PROPOSAL_DEFAULT_TTL_DAYS
    ttl = max(1, min(ttl, 14))
    expires_at = (datetime.now(timezone.utc) + timedelta(days=ttl)).isoformat()

    try:
        prop = sb.table('plan_time_proposals').insert({
            'plan_id': plan_id, 'proposer_id': g.user_id, 'status': 'pending',
            'options': norm, 'expires_at': expires_at,
        }).execute().data[0]
    except DuplicateError:  # lost the race against the partial-unique index (prod)
        return err('CONFLICT', 409, 'Someone already proposed times — waiting on the organizer.')

    proposer = users_by_ids([g.user_id]).get(g.user_id) or {}
    notify(plan['organizer_id'], 'plan_time_proposed', {
        'plan_id': plan_id,
        'proposer_handle': proposer.get('handle'),
        'place_name': (place or {}).get('name'),
        'option_count': len(norm),
        'expires_at': expires_at,
    })
    track('time_proposed', g.user_id, {
        'plan_id': plan_id, 'place_id': plan['place_id'], 'option_count': len(norm),
    })
    return ok(_serialize_proposal(prop, g.user_id), 201)


@plans_bp.route('/<plan_id>/proposals', methods=['GET'])
@require_auth
def list_proposals(plan_id: str):
    """Organizer sees all proposals; anyone else who can view the plan sees only their own."""
    sb = get_supabase()
    plan = _plan_row(sb, plan_id)
    if not plan or not _can_view_plan(plan, g.user_id):
        return err('NOT_FOUND', 404, 'This plan is not available.')
    rows = sb.table('plan_time_proposals').select('*').eq('plan_id', plan_id).execute().data or []
    if plan['organizer_id'] != g.user_id:
        rows = [r for r in rows if r['proposer_id'] == g.user_id]
    return ok([_serialize_proposal(r, g.user_id) for r in rows])


@plans_bp.route('/<plan_id>/proposals/<proposal_id>/accept', methods=['POST'])
@require_auth
def accept_proposal(plan_id: str, proposal_id: str):
    """Flow 4.4 / J5.3. The organizer picks one option → the plan materializes (M-D15).
    Joined ∪ Interested get plan_time_updated; the proposer gets plan_proposal_accepted."""
    body = request.get_json(silent=True) or {}
    sb = get_supabase()
    plan = _plan_row(sb, plan_id)
    if not plan:
        return err('NOT_FOUND', 404)
    if plan['organizer_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'Only the organizer can accept a proposed time.')
    row = sb.table('plan_time_proposals').select('*').eq('id', proposal_id).maybe_single().execute()
    prop = row.data if row else None
    if not prop or prop['plan_id'] != plan_id:
        return err('NOT_FOUND', 404, 'Proposal not found.')
    if prop.get('status') != 'pending':
        return err('CONFLICT', 409, 'This proposal was already resolved.')

    options = prop.get('options') or []
    try:
        idx = int(body.get('option_index', 0))
    except (ValueError, TypeError):
        idx = -1
    if not (0 <= idx < len(options)):
        return err('INVALID_REQUEST', 400, 'Pick a valid option.')
    opt = options[idx]

    place = _get_place(sb, plan['place_id'])
    code = validate_proposal_option(place, opt)  # re-validate (hours may have changed)
    if code:
        return err(code, 422)

    updated = _apply_materialization(
        sb, plan, place, plan_date=opt['plan_date'], plan_time=opt.get('plan_time'),
        plan_time_band=opt.get('plan_time_band'), actor_id=g.user_id,
        exclude_audience={prop['proposer_id']},
    )
    sb.table('plan_time_proposals').update(
        {'status': 'accepted', 'accepted_option': idx}
    ).eq('id', proposal_id).execute()
    notify(prop['proposer_id'], 'plan_proposal_accepted', {
        'plan_id': plan_id, 'place_name': (place or {}).get('name'),
        'plan_date': opt['plan_date'], 'plan_time': opt.get('plan_time'),
        'plan_time_band': opt.get('plan_time_band'),
    })
    track('time_proposal_accepted', g.user_id, {'plan_id': plan_id, 'option_index': idx})
    return ok(serialize_plan(updated, g.user_id, place))


@plans_bp.route('/<plan_id>/proposals/<proposal_id>/decline', methods=['POST'])
@require_auth
def decline_proposal(plan_id: str, proposal_id: str):
    """Flow 4.4 "None of these work" (M-D18). Plan stays un-timed; proposer notified."""
    sb = get_supabase()
    plan = _plan_row(sb, plan_id)
    if not plan:
        return err('NOT_FOUND', 404)
    if plan['organizer_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'Only the organizer can decline a proposal.')
    row = sb.table('plan_time_proposals').select('*').eq('id', proposal_id).maybe_single().execute()
    prop = row.data if row else None
    if not prop or prop['plan_id'] != plan_id:
        return err('NOT_FOUND', 404, 'Proposal not found.')
    if prop.get('status') != 'pending':
        return err('CONFLICT', 409, 'This proposal was already resolved.')

    sb.table('plan_time_proposals').update({'status': 'declined'}).eq('id', proposal_id).execute()
    place = _get_place(sb, plan['place_id'])
    notify(prop['proposer_id'], 'plan_proposal_declined', {
        'plan_id': plan_id, 'place_name': (place or {}).get('name'), 'reason': 'declined',
    })
    track('time_proposal_declined', g.user_id, {'plan_id': plan_id})
    return ok(serialize_plan(plan, g.user_id, place))


@plans_bp.route('/<plan_id>/proposals/<proposal_id>', methods=['DELETE'])
@require_auth
def retract_proposal(plan_id: str, proposal_id: str):
    """The proposer retracts their own pending proposal, freeing the slot. Idempotent."""
    sb = get_supabase()
    row = sb.table('plan_time_proposals').select('*').eq('id', proposal_id).maybe_single().execute()
    prop = row.data if row else None
    if not prop or prop['plan_id'] != plan_id:
        return err('NOT_FOUND', 404, 'Proposal not found.')
    if prop['proposer_id'] != g.user_id:
        return err('FORBIDDEN', 403, 'You can only retract your own proposal.')
    if prop.get('status') == 'pending':
        sb.table('plan_time_proposals').delete().eq('id', proposal_id).execute()
        track('time_proposal_retracted', g.user_id, {'plan_id': plan_id})
    return ok(None)


@plans_bp.route('/mine', methods=['GET'])
@require_auth
def my_plans():
    """Organizer's own plans + plans the user joined (incl. cancelled-by-organizer)."""
    sb = get_supabase()
    mine = sb.table('plans').select('*').eq('organizer_id', g.user_id).execute().data or []
    joined_rows = sb.table('plan_joins').select('plan_id').eq('user_id', g.user_id).execute().data or []
    joined_ids = [r['plan_id'] for r in joined_rows]
    joined = sb.table('plans').select('*').in_('id', joined_ids).execute().data if joined_ids else []
    seen, out = set(), []
    for p in mine + (joined or []):
        if p['id'] in seen:
            continue
        seen.add(p['id'])
        if p['organizer_id'] != g.user_id and p.get('status') != 'active' and p['id'] not in joined_ids:
            continue
        out.append(serialize_plan(p, g.user_id, include_people=False))
    return ok(out)
