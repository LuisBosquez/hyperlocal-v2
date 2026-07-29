from datetime import date

from flask import Blueprint, request, g

from ..middleware import require_auth
from ..extensions import get_supabase
from ..errors import ok, err
from ..domain import (
    mutual_friend_ids, users_by_ids, distance_m, plan_state, time_granularity,
    is_past, is_unconfirmed, parse_bbox, in_bbox, clamp_cap,
)

feed_bp = Blueprint('feed', __name__, url_prefix='/api/v1')


def _plan_card(plan: dict, place: dict, organizer: dict | None, viewer_id: str,
               join_ids: set, interest_ids: set, role: str,
               has_pending_proposal: bool = False) -> dict:
    return {
        'type': 'plan',
        'plan_id': plan['id'],
        'role': role,  # organizer | joiner | friend
        'place_id': plan['place_id'],
        'place_name': (place or {}).get('name', 'Unknown place'),
        'plan_date': plan.get('plan_date'),
        'plan_time': plan.get('plan_time'),
        'plan_time_band': plan.get('plan_time_band'),
        'state': plan_state(plan),
        'time_granularity': time_granularity(plan),
        'is_cancelled': plan.get('status') == 'cancelled',
        'is_unconfirmed': is_unconfirmed(plan, place),
        'has_pending_proposal': has_pending_proposal,
        'interest_count': len(interest_ids),
        'join_count': len(join_ids),
        'viewer_has_joined': viewer_id in join_ids,
        'viewer_is_interested': viewer_id in interest_ids,
        'organizer_handle': (organizer or {}).get('handle'),
        'organizer_avatar_url': (organizer or {}).get('avatar_url'),
        'created_at': plan.get('created_at'),
    }


@feed_bp.route('/panel', methods=['GET'])
@require_auth
def get_panel():
    """The Panel (spec: Key UI Surfaces). Ordered card list:
    notifications (recent first) → plans (soonest first; timeless last with
    add-time prompt) → places (own + friends' + contextual handled client-side),
    proximity ascending. meta powers empty-state selection (P7)."""
    filter_param = request.args.get('filter', 'all')
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    bbox = parse_bbox(request.args.get('bbox'))
    cap = clamp_cap(request.args.get('cap', type=int))

    sb = get_supabase()
    cards: list[dict] = []
    today = str(date.today())

    friend_ids = mutual_friend_ids(g.user_id)
    saved = sb.table('user_places').select('*').eq('user_id', g.user_id).execute().data or []

    # ---- 1. Notification cards ------------------------------------------------
    if filter_param in ('all', 'plans', 'places'):
        notifs = (
            sb.table('notifications').select('*')
            .eq('user_id', g.user_id).eq('is_read', False)
            .order('created_at', desc=True).limit(20).execute()
        )
        for n in (notifs.data or []):
            cards.append({
                'type': 'notification', 'id': n['id'], 'event_type': n['type'],
                'payload': n.get('data') or {}, 'created_at': n['created_at'],
            })

    # ---- 2. Plan cards ----------------------------------------------------------
    if filter_param in ('all', 'plans', 'hide_notifications'):
        plan_rows: list[tuple[dict, str]] = []

        mine = sb.table('plans').select('*').eq('organizer_id', g.user_id).eq('status', 'active').execute().data or []
        plan_rows += [(p, 'organizer') for p in mine]

        joined_rows = sb.table('plan_joins').select('plan_id').eq('user_id', g.user_id).execute().data or []
        joined_ids = {r['plan_id'] for r in joined_rows}
        if joined_ids:
            joined_plans = sb.table('plans').select('*').in_('id', list(joined_ids)).execute().data or []
            plan_rows += [(p, 'joiner') for p in joined_plans if p['organizer_id'] != g.user_id]

        if friend_ids:
            friend_plans = (
                sb.table('plans').select('*')
                .in_('organizer_id', friend_ids).eq('status', 'active').execute().data or []
            )
            seen = {p['id'] for p, _ in plan_rows}
            plan_rows += [(p, 'friend') for p in friend_plans if p['id'] not in seen]

        pids = list({p['place_id'] for p, _ in plan_rows})
        places = {p['id']: p for p in (sb.table('places').select('*').in_('id', pids).execute().data or [])} if pids else {}
        org_ids = list({p['organizer_id'] for p, _ in plan_rows})
        organizers = users_by_ids(org_ids)

        plan_ids = [p['id'] for p, _ in plan_rows]
        joins_all = sb.table('plan_joins').select('plan_id, user_id').in_('plan_id', plan_ids).execute().data if plan_ids else []
        ints_all = sb.table('plan_interests').select('plan_id, user_id').in_('plan_id', plan_ids).execute().data if plan_ids else []
        joins_by_plan: dict[str, set] = {}
        for r in (joins_all or []):
            joins_by_plan.setdefault(r['plan_id'], set()).add(r['user_id'])
        ints_by_plan: dict[str, set] = {}
        for r in (ints_all or []):
            ints_by_plan.setdefault(r['plan_id'], set()).add(r['user_id'])

        # Pending time proposals — drives the organizer's "Review proposals" affordance.
        prop_rows = (
            sb.table('plan_time_proposals').select('plan_id, status')
            .in_('plan_id', plan_ids).eq('status', 'pending').execute().data if plan_ids else []
        )
        pending_pids = {r['plan_id'] for r in (prop_rows or [])}

        plan_cards = []
        for plan, role in plan_rows:
            place = places.get(plan['place_id'])
            # Archive: date-passed plans drop out of the Panel (M-D6a, J9.6)
            if is_past(plan, place):
                continue
            # Cancelled plans stay visible only to joiners (Flow 5)
            if plan.get('status') == 'cancelled' and role != 'joiner':
                continue
            plan_cards.append(_plan_card(
                plan, place, organizers.get(plan['organizer_id']), g.user_id,
                joins_by_plan.get(plan['id'], set()), ints_by_plan.get(plan['id'], set()), role,
                has_pending_proposal=plan['id'] in pending_pids,
            ))

        # Sort: timed plans soonest first; timeless at the bottom (spec sort logic)
        timed = sorted(
            [c for c in plan_cards if c['plan_date']],
            key=lambda c: (c['plan_date'], c['plan_time'] or '99:99'),
        )
        timeless = sorted([c for c in plan_cards if not c['plan_date']], key=lambda c: c['created_at'], reverse=True)
        cards += timed + timeless

    # ---- 3. Place cards -----------------------------------------------------------
    if filter_param in ('all', 'places', 'hide_notifications'):
        place_cards = []
        pids = [s['place_id'] for s in saved]
        my_places = {p['id']: p for p in (sb.table('places').select('*').in_('id', pids).execute().data or [])} if pids else {}
        for s in saved:
            p = my_places.get(s['place_id'])
            if not p:
                continue
            place_cards.append({
                'type': 'place', 'place_id': p['id'], 'name': p['name'],
                'category': p.get('category'), 'source': 'own',
                'saved_by_handle': None, 'note': s.get('note'),
                'distance_meters': distance_m(lat, lng, p['lat'], p['lng']) if lat is not None and lng is not None else None,
                'lat': p['lat'], 'lng': p['lng'],
            })

        if friend_ids:
            f_saves = sb.table('user_places').select('*').in_('user_id', friend_ids).execute().data or []
            f_pids = [s['place_id'] for s in f_saves]
            f_places = {p['id']: p for p in (sb.table('places').select('*').in_('id', f_pids).execute().data or [])} if f_pids else {}
            f_users = users_by_ids(friend_ids)
            my_pids = {s['place_id'] for s in saved}
            seen_friend = set()
            for s in f_saves:
                if s['place_id'] in my_pids or s['place_id'] in seen_friend:
                    continue
                seen_friend.add(s['place_id'])
                p = f_places.get(s['place_id'])
                if not p:
                    continue
                u = f_users.get(s['user_id'])
                place_cards.append({
                    'type': 'place', 'place_id': p['id'], 'name': p['name'],
                    'category': p.get('category'), 'source': 'friend',
                    'saved_by_handle': (u or {}).get('handle'),
                    'note': None,  # notes are personal: only mutual-visible on profile, not in Panel
                    'distance_meters': distance_m(lat, lng, p['lat'], p['lng']) if lat is not None and lng is not None else None,
                    'lat': p['lat'], 'lng': p['lng'],
                })

        # Area scoping (Flow 14): keep only cards inside the current area box.
        if bbox:
            place_cards = [c for c in place_cards if in_bbox(c['lat'], c['lng'], bbox)]
        # Proximity ascending when we have a location, else recency (J11.5 / P4)
        if lat is not None and lng is not None:
            place_cards.sort(key=lambda c: c['distance_meters'] or 0)
        # Cap so the list stays scannable ("show 6–9 nearby", Flow 9/10).
        cards += place_cards[:cap]

    return ok({
        'cards': cards,
        'meta': {
            'friend_count': len(friend_ids),
            'saved_count': len(saved),
            'sorted_by': 'proximity' if lat is not None else 'recency',
        },
    })


@feed_bp.route('/notifications/<notification_id>/dismiss', methods=['POST'])
@require_auth
def dismiss_notification(notification_id: str):
    """Idempotent dismiss (mark read). J7.8."""
    sb = get_supabase()
    sb.table('notifications').update({'is_read': True}) \
        .eq('id', notification_id).eq('user_id', g.user_id).execute()
    return ok(None)


@feed_bp.route('/notifications', methods=['GET'])
@require_auth
def list_notifications():
    """Polling endpoint for browser alerts (X.3 realtime fallback).
    ?since=<iso> returns only newer unread notifications."""
    since = request.args.get('since')
    sb = get_supabase()
    q = sb.table('notifications').select('*').eq('user_id', g.user_id).eq('is_read', False)
    if since:
        q = q.gt('created_at', since)
    rows = q.order('created_at', desc=True).limit(20).execute().data or []
    return ok(rows)
