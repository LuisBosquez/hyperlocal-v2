# Materialization Workflow — Hyperlocal MVP-1

> **Status:** Implemented (Alpha)
> **Last updated:** 2026-06-22
> **Implements:** [pm/specs/materialization-workflow.md](../pm/specs/materialization-workflow.md) (decisions M-D1–M-D20, recommendations adopted) · [MVP-1 Spec](../pm/specs/mvp-1.md) Flows 4.1/4.2/4.3/4.4/5/8/8.2
> **Code:** `backend/app/routes/plans.py` · `backend/app/jobs/reminders.py` · `backend/app/domain.py` · `backend/tests/test_journeys.py`

This doc specifies the plan-materialization loop: how a plan moves from intent (timeless) to a confirmed time, who gets notified at each transition, the reminder cron, and the API/schema that back it. It supersedes the "resolution for implementer" note formerly in [tech/04 Scheduled Jobs](04-api-design.md).

> **Collaborative materialization (M-D14–M-D20):** §10 covers **time proposals** — any mutual friend can propose time options on an un-timed plan; the organizer accepts one. §11 covers **coarse time bands** (morning/afternoon/evening) and the generic→specific picker. These supersede the Beta-1 Flow B6/B7 design.

---

## 1. Plan State Machine

A plan is a `(place, date?, time?)` triple. The three live states plus the cancelled overlay:

```
            add date (M-D9 picker)        add time
  TIMELESS ───────────────────────► TENTATIVE ──────────► CONFIRMED
  is_timeless=true                  date set, no time     date + time
  plan_date=NULL                    is_timeless=false     is_timeless=false
  plan_time=NULL                    │                     │
  "Want to Go"                      │ date passes,        │ datetime passes
       │                            │ no time             │
       │ never nudged (M-D2a)       ▼                     ▼
       │                       date-passed prompt     past plan
       ▼                       → recreate as timeless  (archived from Panel)
   (no expiry)                  (M-D6a)
```

Any state → **cancelled** by the organizer (`status='cancelled'`). The plan row and all `plan_joins` survive; joiners keep it (Flow 5).

> **Naming note (open) — "Want to Go".** In this doc "Want to Go" labels the **timeless plan** state above (intent expressed as a plan). The newer Lists feature introduces a **default `lists` save bucket** also named "Want to Go" (a save is a weaker signal than a timeless plan). These are two distinct concepts that currently share a name. The collision — and whether to unify them (the default List subsumes timeless-plan places) or rename one — is tracked in the [MVP-1 spec Open Questions](../pm/specs/mvp-1.md) and must be resolved before the Lists work lands, because it affects what the default List contains and how this loop reads it. The state machine here is unaffected until that decision is made.

**State is derived, never stored** (`domain.plan_state`):

| State | Predicate |
|---|---|
| `timeless` | `is_timeless = true` |
| `confirmed` | `plan_time IS NOT NULL` |
| `tentative` | otherwise (date set, no time) |

DB constraints enforce validity (`plans_timeless_no_date`, `plans_time_requires_date` — [tech/02](02-database-schema.md)).

### Transitions and guards

| From → To | Trigger | Endpoint | Guard |
|---|---|---|---|
| (none) → any | create | `POST /plans` | place exists & available; date not past; today requires a time; time within opening hours |
| timeless → tentative | add date | `PATCH /plans/:id` | organizer only; date valid |
| timeless → confirmed | add date + time | `PATCH /plans/:id` | organizer only; datetime valid |
| tentative → confirmed | add time | `PATCH /plans/:id` | organizer only; time within opening hours |
| confirmed → confirmed | change time | `PATCH /plans/:id` | organizer only; re-notifies audience |
| any → cancelled | cancel | `POST /plans/:id/cancel` | organizer only; idempotent |

---

## 2. The "Unconfirmed" Label (M-D4a, M-D5a)

Computed, state-based, never stored (`domain.is_unconfirmed`): a **tentative** plan is "unconfirmed" once the deadline to set a time has passed — defined as **noon in the place's local timezone on the plan date, or any time after the plan date**. This is honest and testable: "tapped a reminder but didn't finish" still counts as unconfirmed because the *state* (no time) is what matters, not notification interaction.

- **Where it renders (M-D5a):** plan detail page and the Panel plan card carry an `is_unconfirmed` flag; the UI shows a "Time unconfirmed" chip. Friends see it; it communicates "@organizer hasn't locked a time."
- **Clears automatically** the moment a time is set (the predicate flips).

---

## 3. Notification Fan-out Matrix

The audience for each event. **Joined + Interested** is the canonical materialization audience (M-D7a — resolves contradiction C2; the enum comment in [tech/02](02-database-schema.md) was corrected to match).

| Event | Fires when | Recipients | Excludes | Notification type |
|---|---|---|---|---|
| Time set (first) | tentative/timeless → confirmed (exact **or** band) | Joined ∪ Interested | organizer | `plan_time_updated` |
| Time changed | confirmed → confirmed (new time/band) | Joined ∪ Interested | organizer | `plan_time_updated` |
| Date-only set | timeless → tentative | — (no notification) | — | none (M-D10: notify on *time*, not date) |
| Plan cancelled | any → cancelled | Joined only | organizer | `plan_cancelled` |
| Friend joins | `POST joins` | organizer | — | `friend_joined_plan` |
| New follower | `POST follows` | followee | — | `new_follower` |
| Follow-back → mutual | `POST follows` completing a mutual | original follower | — | `follow_back_prompt` |
| Day-before reminder | cron, plan_date = tomorrow (local) | organizer (+ joiners if confirmed) | — | `plan_reminder_day_before` |
| Morning-of reminder | cron, plan_date = today (local) | organizer (+ joiners if confirmed) | — | `plan_reminder_morning` |
| Date passed, no time | cron, tentative plan_date < today | organizer | — | `plan_date_passed` |
| Time proposed | `POST /proposals` (Flow 4.3) | organizer | — | `plan_time_proposed` |
| Proposal accepted | organizer accepts an option (Flow 4.4) | proposer (Joined ∪ Interested get `plan_time_updated` instead) | — | `plan_proposal_accepted` |
| Proposal declined / expired / superseded | decline · cron expiry · organizer sets time directly | proposer | — | `plan_proposal_declined` (`reason`) |

**Interested users are NOT notified on cancel (M-D12a)** — Interested is deliberately low-stakes in both directions; the card simply leaves their Panel.

Fan-out is implemented by `domain.plan_audience(plan_id, exclude={organizer})` (union of `plan_joins` + `plan_interests`) and `domain.notify(...)`. On a proposal accept, the **proposer is excluded** from the `plan_time_updated` fan-out and gets the richer `plan_proposal_accepted` card instead (`_apply_materialization(..., exclude_audience={proposer})`). See §10–11.

---

## 4. Telemetry: `plan_materialized` (M-D10a, M-D20)

Fires **once per plan, on the first transition to `confirmed`** — the first time a "when" lands, whether an exact `plan_time` **or** a coarse `plan_time_band` (M-D20). Guarded by `had_when = bool(plan.plan_time or plan.plan_time_band)` before the update — a subsequent change (incl. a band→exact refine) does not re-fire it (verified: `TestMaterialization::test_time_change_renotifies_but_no_second_materialized`, `TestCoarseTime::test_band_refine_to_exact_no_second_materialized`). Carries a `time_granularity` property (`exact` | `approximate`).

- **Denominator** for materialization rate = plans that were ever timeless or tentative.
- Date-only sets (timeless → tentative) do **not** count as materialization — the metric promises "received a time" (a band counts; a bare date does not).

**Proposal telemetry (M-D14–D18):** `time_proposed` (proposer submits) · `time_proposal_accepted` (organizer accepts) · `time_proposal_declined` (organizer declines) · `time_proposal_retracted` (proposer retracts) · `time_proposal_expired` is folded into the cron's `expired` count and a `plan_proposal_declined` card with `reason=expired`. (Event names align with the Beta-1 table, which this supersedes.)

---

## 5. Reminder Cron (`jobs/reminders.py`)

Runs from Lambda cron in production (recommended: every 30 min, or hourly) and from `POST /api/v1/dev/run-reminders` in dev. **Idempotent** — every notification is deduped per `(user, type, plan)` via `domain.notify(..., dedupe_plan_id=)`, so the job can run any number of times per day without duplicate cards (verified: `TestReminders::test_reminders_idempotent`).

### Timezone (M-D3a)

"Day before" / "morning of" / "date passed" are all evaluated in the **place's local timezone**, via `places.utc_offset_minutes` (cached from Google Places at fetch time; see migration 003). `domain.place_now(place)` returns naive local now. No `users.timezone` column in Alpha — revisit when email/SMS notifications arrive (V2).

### Logic per plan (active, non-timeless)

```
expire pending proposals past expires_at  →  status='expired', notify proposer  # M-D17

local_today = place_now(place).date()

if plan has a when (confirmed — exact time OR band):     # M-D20
    recipients = {organizer} ∪ joiners        # attendance reminders
    if plan_date == tomorrow: notify plan_reminder_day_before
    elif plan_date == today:  notify plan_reminder_morning   # carries plan_time_band → "lock in a time?" CTA
else (tentative — add-time nudges to organizer, M-D1a):
    if plan_date == tomorrow: notify organizer plan_reminder_day_before
    elif plan_date == today:  notify organizer plan_reminder_morning
    elif plan_date < today:   notify organizer plan_date_passed   # M-D6a (band plans never reach here)
```

**Fully timeless plans are never touched (M-D2a)** — they have no `plan_date`, so the loop skips them. Want-to-Go intent is the product's patience made visible; the Interested signal is its only social pressure. No expiry.

**Proposal expiry (M-D17):** the cron first sweeps `plan_time_proposals` where `status='pending' AND expires_at < now()`, flips them to `expired`, and notifies the proposer (`plan_proposal_declined`, `reason=expired`). The status flip is the idempotency guard (a re-run finds nothing pending). Returned in the job's `expired` count (verified: `TestTimeProposals::test_expiry_voids_and_notifies`).

**Approximate-plan refine nudge (M-D20):** a band plan is *confirmed*, so it falls into the attendance-reminder branch. Its morning-of card carries `plan_time_band` in `data`; the client renders the organizer a "lock in an exact time?" CTA. Band plans never get `plan_date_passed` (verified: `TestCoarseTime::test_band_plan_reminder_carries_band`).

### `plan_date_passed` recovery (M-D6a)

When a tentative plan's date passes with no time, the organizer gets one `plan_date_passed` card carrying `{plan_id, place_id, place_name}`. Tapping it routes to the place detail so they can recreate the intent as a fresh timeless plan ("still want to go?"). The stale plan is excluded from the Panel by `is_past` filtering (`feed.py`). This is the exact seam Beta-1's re-engagement system extends.

---

## 6. API Summary

| Endpoint | Behavior |
|---|---|
| `POST /plans` | Create. Auto-saves the place (never clobbers an existing note). Accepts an exact `plan_time` **or** a `plan_time_band`. Validates date/time/band. `plan_created` telemetry. |
| `PATCH /plans/:id` | Add/change date and/or time/band. Organizer-only. Validates against opening hours + future. Fires `plan_materialized` on first when; fans out `plan_time_updated` to Joined ∪ Interested. **Voids any pending proposal** (M-D16) — proposer notified. |
| `POST /plans/:id/cancel` | Idempotent. `status='cancelled'`. Notifies joiners only. |
| `POST /plans/:id/joins` | Idempotent (P2). Allowed on timeless/tentative (M-D8a) and on cancelled plans (plans survive). Notifies organizer. `plan_joined`. |
| `POST/DELETE /plans/:id/interests` | Idempotent toggle. `plan_interested` on create. |
| `GET /plans/:id/interests` | Organizer-only (M-D13a). |
| `POST /plans/:id/proposals` | Mutual friend (not organizer) proposes 1–5 options on a timeless/tentative plan. 409 if a pending proposal exists. Notifies organizer; `time_proposed`. (§10) |
| `GET /plans/:id/proposals` | Organizer sees all; others see only their own. |
| `POST /plans/:id/proposals/:pid/accept` | Organizer only. `{option_index}` → materializes via shared `_apply_materialization`. Notifies proposer (`plan_proposal_accepted`); `time_proposal_accepted`. |
| `POST /plans/:id/proposals/:pid/decline` | Organizer only. Plan stays un-timed; proposer notified; `time_proposal_declined`. |
| `DELETE /plans/:id/proposals/:pid` | Proposer retracts own pending proposal (frees the slot). Idempotent; `time_proposal_retracted`. |
| `POST /dev/run-reminders` | Dev trigger for the cron. Returns `{day_before, morning_of, date_passed, expired}` counts. |

Validation error codes (`domain.validate_plan_datetime` / `validate_proposal_option`): `TIME_IN_PAST`, `TIME_REQUIRED_TODAY`, `OUTSIDE_OPENING_HOURS`, `PLACE_UNAVAILABLE` (see [tech/08 §2](08-edge-cases-and-error-handling.md)).

---

## 7. Opening-Hours Validation

`domain._within_opening_hours(periods, date, time)` mirrors the Google Places `periods` shape (`{open:{day,time}, close:{day,time}}`, day 0 = Sunday). Handles **overnight periods** (close day ≠ open day, or close ≤ open): e.g. a bar open 16:00–02:00 admits both 21:00 on the open day and 01:00 on the following day. Unknown hours (`periods` empty/null) **allow any time** (P9) — the UI shows a "hours unknown — double-check" caveat. The frontend `lib/format.timeSlotsFor` reproduces the same logic so the picker only offers valid slots (verified live: overnight bar yields the post-midnight tail + evening slots).

---

## 8. Forward Compatibility (Beta-1)

This workflow is the foundation Beta-1 extends:
- **Time proposals are now an Alpha capability** (§10) — they **supersede** the Beta-1 Flow B6/B7 design (one-at-a-time, organizer-reviewed). Beta-1 retains only its genuinely-Beta proposal surface: the **calendar-driven, time-first** flow (Flow B8) and **re-engagement** (Flow B1–B5).
- **Re-engagement** (Flow B1–B5) plugs into the `plan_date_passed` / cancel seams.
- `plan_joins` allowed on timeless plans (M-D8a) and the proposal model here are what the Beta calendar layer builds compatible-plan ranking on.

---

## 9. Test Coverage

`backend/tests/test_journeys.py`:
- `TestMaterialization` — add-time notifies Joined+Interested; `plan_materialized` once; time-change re-notifies without re-firing; non-organizer 403; timeless→tentative via date.
- `TestReminders` — day-before nudge for tentative; idempotent re-run; date-passed prompt with place payload; timeless never nudged.
- `TestTimeProposals` — propose→accept materializes + fans out (proposer excluded, gets `plan_proposal_accepted`); decline leaves plan un-timed + notifies; one-pending-per-plan 409; non-mutual 404; organizer-can't-propose-own 403; retract frees the slot; organizer direct time-set voids a pending proposal; option outside hours 422; expiry voids + notifies.
- `TestCoarseTime` — create-with-band; band-set materializes once (granularity `approximate`) + fan-out; band→exact refine re-notifies without re-firing; band plan not `is_unconfirmed`; band reminder carries `plan_time_band` (not `plan_date_passed`); band outside hours 422.

---

## 10. Collaborative Time Proposals (M-D14–M-D18)

The original loop had one bottleneck: only the organizer could set a time, so a joiner's "only lever was waiting." Proposals add a **non-organizer → organizer** channel that closes it (the "Someone just had to pick a time" user story).

**Roles.** Any mutual friend who can view a **timeless or tentative** plan — but **not** the organizer — may propose. The **organizer** alone decides (accept / decline). The organizer's own direct add-time flow (§6 PATCH) is unchanged.

**Data.** `plan_time_proposals (id, plan_id, proposer_id, status, options JSONB, expires_at, accepted_option)` — see [tech/02](02-database-schema.md). `options` is an array of `{plan_date, plan_time|null, plan_time_band|null}`, each carrying exactly one "when".

**One pending proposal per plan (M-D16).** Enforced two ways: an app-level pre-check (`SELECT … status='pending'` → 409) and a Postgres partial-unique index `one_pending_proposal_per_plan`. The dev SQLite shim relies on the pre-check (no partial indexes); production has both. The first proposer owns the slot until it resolves.

**Lifecycle.**

| Action | Endpoint | Effect |
|---|---|---|
| Propose | `POST /proposals` | Validate every option (`domain.validate_proposal_option`); insert `pending`; notify organizer `plan_time_proposed`; `time_proposed`. |
| Accept | `POST /proposals/:pid/accept` | `_apply_materialization` writes the chosen option's date + time/band → normal materialization (`plan_materialized` once, `plan_time_updated` to Joined ∪ Interested **minus the proposer**); proposal → `accepted`; proposer gets `plan_proposal_accepted`; `time_proposal_accepted`. |
| Decline | `POST /proposals/:pid/decline` | proposal → `declined`; plan **stays un-timed** (M-D18); proposer gets `plan_proposal_declined` (`reason=declined`); `time_proposal_declined`. |
| Retract | `DELETE /proposals/:pid` | Proposer deletes own pending proposal → slot freed. Idempotent; `time_proposal_retracted`. |
| Expire | cron (§5) | `pending` + `expires_at < now` → `expired`; proposer notified (`reason=expired`). |
| Organizer sets time directly | `PATCH /plans/:id` | Pending proposal voided (`declined`, `reason=organizer_set_time`); proposer notified. |

**Expiry window (M-D17).** Proposer-settable via `expires_in_days` (default 2, clamped 1–14). `serialize_plan` embeds the single `pending_proposal` (proposer, options, expires_at, `viewer_is_proposer`) on the detail view so the page renders the review/propose state in one fetch; the Panel card carries a `has_pending_proposal` flag for the organizer's "Review proposals" affordance.

---

## 11. Time Granularity — Coarse Bands (M-D19, M-D20)

The time picker goes **generic → specific**, mirroring the date pills: **Morning · Afternoon · Evening · Set a time**. A coarse **band** is a valid "when".

**Model.** A new nullable `plans.plan_time_band` (`morning|afternoon|evening`), mutually exclusive with `plan_time` (CHECK `plans_one_time_kind`), and like a time it requires a date. `domain.plan_state` treats a band as **`confirmed`**; `domain.time_granularity(plan)` returns `exact` (time) · `approximate` (band) · `null`. A band **soft-confirms** — it's a real, notified, materialized plan, distinct from tentative.

**Validation.** `domain.validate_proposal_option` maps a band to a window (morning 06–12, afternoon 12–17, evening 17–22, place-local) and requires the place to be open for **≥1 slot** in that window (unknown hours pass, P9); if today, the window must not be wholly past. Reuses `_within_opening_hours`.

**Consequences (M-D20).**
- `plan_materialized` fires on the first band **or** exact time (carries `time_granularity`); a band→exact refine re-notifies but does not re-fire.
- A band plan is **never** `is_unconfirmed` (it has a when) and never gets `plan_date_passed`.
- The organizer gets a **day-of refine nudge**: the morning-of reminder carries `plan_time_band` so the client shows "lock in an exact time?". Refining is optional — a band may stand forever.

**Frontend.** The shared `WhenFields` picker (in `components/plan/PlanComposer.tsx`) renders the tier and is reused by create (Flow 4.1), materialize (Flow 4.2), and per-option in `ProposeTimeSheet` (Flow 4.3). `lib/format.formatPlanWhen` renders a band as e.g. "Sat, Jun 14 · afternoon".
- `TestCancelPlan` — joiners notified, Interested not; survives for joiners; join-after-cancel allowed.
