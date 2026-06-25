"""Scheduled reminder job (tech/09, materialization worksheet decisions).

Runs from Lambda cron in production and from POST /api/v1/dev/run-reminders in dev.
Idempotent: every notification is deduped per (user, type, plan), so the job can
run any number of times per day (M-D1; tech/08 race ledger).

Decisions implemented:
  M-D1(a)  Tentative plans (date, no time): day-before + morning-of nudges to organizer.
  M-D2(a)  Fully timeless plans are never nudged — Interested is the only pressure.
  M-D3(a)  "Day before"/"morning of" are evaluated in the place's timezone.
  M-D4(a)  "Unconfirmed" is computed state (domain.is_unconfirmed), not stored here.
  M-D6(a)  Tentative plans whose date passed: organizer gets one plan_date_passed
           notification offering to recreate the intent as a timeless plan.
  M-D19/20 Approximate plans (a coarse plan_time_band) are confirmed: they get the
           same attendance reminders, and the morning-of card carries plan_time_band
           so the organizer sees a "lock in an exact time?" refine CTA. Band plans
           never get plan_date_passed — they already have a "when".
  M-D17    Pending time proposals past their expires_at are voided (status=expired)
           and the proposer is notified. The status flip makes the pass idempotent.
  Confirmed plans also get day-before + morning-of reminders, to organizer + joiners
  (spec principle: reminders are set automatically).
"""
from datetime import datetime, timedelta, timezone

from ..extensions import get_supabase
from ..domain import notify, place_now


def run_reminders() -> dict:
    sb = get_supabase()
    counts = {'day_before': 0, 'morning_of': 0, 'date_passed': 0, 'expired': 0}

    # Expire pending proposals past their window first (runs even when no plans need
    # nudging). The pending→expired status flip is the idempotency guard (M-D17).
    counts['expired'] = _expire_proposals(sb)

    plans = sb.table('plans').select('*').eq('status', 'active').eq('is_timeless', False).execute().data or []
    if not plans:
        return counts
    pids = list({p['place_id'] for p in plans})
    places = {p['id']: p for p in (sb.table('places').select('*').in_('id', pids).execute().data or [])}

    for plan in plans:
        place = places.get(plan['place_id'])
        if not plan.get('plan_date'):
            continue
        local_today = place_now(place).date()
        plan_date = plan['plan_date']
        tomorrow = str(local_today + timedelta(days=1))
        today = str(local_today)

        data = {
            'plan_id': plan['id'],
            'place_id': plan['place_id'],
            'place_name': (place or {}).get('name'),
            'plan_date': plan_date,
            'plan_time': plan.get('plan_time'),
            'plan_time_band': plan.get('plan_time_band'),
        }

        if plan.get('plan_time') or plan.get('plan_time_band'):
            # Confirmed (exact or approximate): attendance reminders to organizer + joiners.
            # A band plan's morning card carries plan_time_band → "lock in a time?" CTA (M-D20).
            joiners = sb.table('plan_joins').select('user_id').eq('plan_id', plan['id']).execute().data or []
            recipients = {plan['organizer_id']} | {r['user_id'] for r in joiners}
            if plan_date == tomorrow:
                for uid in recipients:
                    if notify(uid, 'plan_reminder_day_before', data, dedupe_plan_id=plan['id']):
                        counts['day_before'] += 1
            elif plan_date == today:
                for uid in recipients:
                    if notify(uid, 'plan_reminder_morning', data, dedupe_plan_id=plan['id']):
                        counts['morning_of'] += 1
        else:
            # Tentative plan: add-time nudges to the organizer (Flow 4.2 / M-J1)
            if plan_date == tomorrow:
                if notify(plan['organizer_id'], 'plan_reminder_day_before', data, dedupe_plan_id=plan['id']):
                    counts['day_before'] += 1
            elif plan_date == today:
                if notify(plan['organizer_id'], 'plan_reminder_morning', data, dedupe_plan_id=plan['id']):
                    counts['morning_of'] += 1
            elif plan_date < today:
                # M-D6(a): date passed with no time — one forward-looking prompt
                if notify(plan['organizer_id'], 'plan_date_passed', data, dedupe_plan_id=plan['id']):
                    counts['date_passed'] += 1

    return counts


def _expire_proposals(sb) -> int:
    """Void pending proposals whose expires_at has passed (M-D17). The proposer gets a
    plan_proposal_declined card with reason='expired'. Idempotent: the status flip means
    a re-run finds nothing pending, so no duplicate notification."""
    now_iso = datetime.now(timezone.utc).isoformat()
    pending = (
        sb.table('plan_time_proposals').select('*')
        .eq('status', 'pending').lt('expires_at', now_iso).execute().data or []
    )
    n = 0
    for prop in pending:
        sb.table('plan_time_proposals').update({'status': 'expired'}).eq('id', prop['id']).execute()
        place_name = None
        plan_row = sb.table('plans').select('place_id').eq('id', prop['plan_id']).maybe_single().execute()
        if plan_row and plan_row.data:
            place_row = sb.table('places').select('name').eq('id', plan_row.data['place_id']).maybe_single().execute()
            place_name = (place_row.data or {}).get('name') if place_row else None
        notify(prop['proposer_id'], 'plan_proposal_declined', {
            'plan_id': prop['plan_id'], 'place_name': place_name, 'reason': 'expired',
        })
        n += 1
    return n
