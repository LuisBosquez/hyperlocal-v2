# Materialization Workflow — Decision Worksheet

> **Status:** ✅ Resolved — all 13 decisions accepted (recommendations adopted) and implemented in Alpha.
> **Last updated:** 2026-06-12
> **Resolution:** Every decision below took its recommended option. The behavior is built and tested (`backend/tests/test_journeys.py::TestMaterialization`, `TestReminders`) and specified in [tech/09-materialization-workflow.md](../../tech/09-materialization-workflow.md). This doc is retained as the decision record.
> **Purpose:** Resolve every open product question in the plan-materialization loop so a tech doc (`tech/09-materialization-workflow.md`) can be written without guessing.
> **Scope sources:** [MVP-1 Spec](mvp-1.md) Flows 4.1, 4.2, 5, 8, 8.2 · [tech/02 plans/notifications schema](../../tech/02-database-schema.md) · [tech/04 Scheduled Jobs](../../tech/04-api-design.md) · [Beta-1 Spec](beta-1.md) (forward compatibility)

## How to use this doc

Each journey below tells the story with **[M-Dn]** markers where a decision is pending. The **Decision Register** at the bottom holds every question with context, options, and a recommendation. To unblock the tech doc:

1. Work through the register — accept the recommendation or pick another option (or "accept all recommendations" wholesale).
2. Each resolved decision gets its **Status** flipped to ✅ with the chosen option.
3. When all are ✅, the worksheet graduates: decisions get folded back into [mvp-1.md](mvp-1.md) Flows 4.2/8.2, and the tech doc gets written (state machine, cron spec, notification fan-out, API deltas).

**Why this workflow matters:** materialization *is* the core engagement loop ("Interest is the catalyst" — [vision doc](../1-product-vision.md)): ambient plan visibility → interest signal → organizer motivation → **plan materialization** → friend notification → attendance. Two of the seven launch metrics (materialization rate ≥30%, Interested→Joined ≥20%) measure exactly this workflow. It's also the piece Beta-1 builds hardest on (time proposals, Stage 1 plans) — decisions here constrain Beta.

---

## The state machine (as currently documented)

From [tech/02](../../tech/02-database-schema.md):

```
                 add date (+ optional time)            add time
  TIMELESS  ────────────────────────────►  TENTATIVE ───────────►  CONFIRMED
  (no date, no time)                       (date, no time)         (date + time)
  "Want to Go"                             "Add time" prompt        Full plan
       │                                        │                      │
       │                                        │ date passes          │ time passes
       ▼                                        ▼ without time         ▼
   [M-D2: nudged? forever?]              [M-D6: then what?]         Past plan
```

Any state can also be **cancelled** by the organizer (plan survives for joiners). The documented contradictions:

- **C1.** [MVP-1 Flow 4.2](mvp-1.md) describes reminders "the day before the plan date, then the morning of" — which only makes sense for **tentative** plans. But the same flow's card prompt and the Want to Go list describe fully **timeless** plans. [tech/04's Scheduled Jobs section](../../tech/04-api-design.md) noticed this and left an explicit "resolution for implementer" note that contradicts the spec. → M-D1, M-D2
- **C2.** [tech/02's notification enum](../../tech/02-database-schema.md) defines `plan_time_updated` as reaching users who marked **Interested**. [Beta-1](beta-1.md) (Flow B7, "same behavior as Alpha Flow 4.2") assumes Alpha notifies **Joined + Interested**. These can't both be right. → M-D7
- **C3.** "Morning of" requires a timezone. Neither `users` nor `plans` carries one; `places` doesn't cache one either. → M-D3

---

## Journeys

### M-J1 — The organizer who needs a nudge (core path, Flow 4.2)

Dana creates a plan for Saturday at the climbing gym but skips the time ("Skip for now" — the info icon promised a reminder). The plan is **tentative**. Her mutual friends see the card; two tap Interested **[M-D13: who sees the interest count/list?]**, one taps Join **[M-D8: is Join even allowed before a time exists?]**.

Friday (day before), Dana gets a Notification card: "Add a time for the climbing gym tomorrow" **[M-D1: exact trigger time; M-D3: in which timezone?]**. She ignores it. Saturday morning a second card arrives **[M-D1]**. She ignores that too — so the plan now shows her as **"unconfirmed"** to friends **[M-D4: what precisely counts as 'ignored'? M-D5: where does the label render, and what does it imply?]**.

At 11 AM Saturday Dana finally opens the card and picks 2 PM. The label clears (per spec). Everyone who tapped Interested gets "Dana set a time" — and the joiner? **[M-D7]**. `plan_materialized` fires **[M-D10: define the exact trigger]**.

### M-J2 — The Want to Go that lives forever (timeless plan)

Sam saves a timeless plan for the speakeasy — no date, pure intent. It powers his **Want to Go** list (one-way-follower visible) and sits in his Panel with an "Add time" prompt. Question: does the system ever *nudge* Sam about it, and if so on what cadence — once at day 7 (tech/04's improvised answer), recurring monthly, or never **[M-D2]**? And does a timeless plan ever expire or get archived **[M-D2]**?

When Sam finally acts, the picker needs a shape: does adding "when" to a timeless plan reuse the Flow 4.1 picker wholesale (date pills first, time skippable — so timeless can hop to tentative *or* straight to confirmed) **[M-D9]**?

### M-J3 — The interested friend (Flow 8.2)

Priya taps Interested on Dana's timeless wine-bar plan. Contract per spec: she'll be notified when a time is **added or updated**. Three edges:

1. Dana sets a date but skips the time (timeless → tentative). Does Priya get notified now, or only when an actual *time* lands **[M-D10 boundary]**?
2. Dana cancels the plan instead. Spec Flow 5 only promises the cancelled state to **joiners**. Priya's card just vanishes — correct, or does she deserve a lightweight notification **[M-D12]**?
3. Priya un-taps Interested before Dana sets the time → she silently leaves the fan-out audience (settled — journeys doc J10.3).

### M-J4 — The joiner waiting on a time

If M-D8 allows joining tentative plans: Marcus joins Dana's Saturday plan before any time exists. He has committed harder than the Interested crowd, yet under the schema's current enum comment (C2) he would *not* be notified when the time lands — the Interested users would know before the guy who's coming. This is the strongest argument inside **[M-D7]**. (Originally Alpha gave Marcus no lever but waiting; **M-D14 now lets him propose a time** — see the collaborative-materialization addendum below.)

### M-J5 — The plan that never materializes

Dana never sets the time. Saturday ends. The tentative plan's date is in the past with no time ever chosen. Options: it silently drops out of every Panel into history; it converts back to timeless ("still want to go?"); or the organizer gets a morning-after prompt **[M-D6]**. Whatever we choose feeds the materialization-rate denominator **[M-D10]** and is the exact seam where Beta-1's re-engagement system will plug in — choose with that in mind.

### M-J6 — The time that changes

Dana set 2 PM, then shifts to 4 PM on Saturday morning. The enum (`plan_time_updated` — "added **/changed**") says the audience gets re-notified **[M-D11: confirm, and any anti-noise cap]**. Joiners again hang on M-D7.

---

## Decision Register

| ID | Question | Options | Recommendation | Status |
|---|---|---|---|---|
| **M-D1** | Reminder cadence for **tentative** plans (date set, no time) | (a) Day-before ~6 PM + morning-of ~9 AM local (spec reading) · (b) morning-of only · (c) configurable later | **(a)** — it's what the spec promises and the info icon in Flow 4.1 already commits to it | ✅ |
| **M-D2** | Nudges + lifespan for **fully timeless** plans (no date) | (a) Never nudge — Want to Go is ambient intent, the Interested loop is the nudge · (b) one reminder at day 7 (tech/04's note) · (c) recurring monthly, capped | **(a)** — timeless plans are the product's patience made visible; nudging them contradicts "decisions don't need to be made in a rush." Let social signal (Interested) be the only pressure. Explicitly: no expiry. | ✅ |
| **M-D3** | Timezone for "day before"/"morning of" | (a) Place's timezone (cache `utc_offset_minutes` on `places` — already drafted in [tech/08 §3](../../tech/08-edge-cases-and-error-handling.md)) · (b) add `users.timezone` captured from browser · (c) fixed UTC hour | **(a)** — the plan physically happens at the place; no new user-facing surface needed. Revisit (b) when email/SMS arrives in V2. | ✅ |
| **M-D4** | What does "both reminders ignored" mean technically | (a) No time set by a deadline (e.g. noon local on plan date) — purely state-based · (b) both notification cards untapped | **(a)** — state-based is testable and honest; "tapped but didn't finish" should still count as unconfirmed | ✅ |
| **M-D5** | "Unconfirmed" label: render location + meaning | (a) Plan detail page only, copy like "time not confirmed by @dana" · (b) also on the Panel card | **(a)** per spec ("a label visible to friends on the plan page"); Panel card already communicates timelessness via the missing time | ✅ |
| **M-D6** | Tentative plan whose date passes with no time | (a) Auto-archive: drops from all Panels, read-only history; organizer gets one "yesterday's plan never got a time — still want to go?" notification that recreates it as **timeless** on tap · (b) silent archive, no prompt · (c) auto-convert to timeless | **(a)** — preserves intent (the Beta thesis: intent survives the plan) with one cheap notification; auto-convert (c) silently inflates Want to Go with stale intent | ✅ |
| **M-D7** | Time set/changed: notification audience (contradiction C2) | (a) Joined + Interested · (b) Interested only (schema comment as written) | **(a)** — joiners committed hardest and literally need the time to show up; also makes Beta-1's "same behavior as Alpha" true. Requires updating the enum comment in tech/02. | ✅ |
| **M-D8** | Can friends **Join** a plan with no time — and no date? | (a) Join allowed on tentative (date, no time) AND timeless — "I'm in whenever it happens" · (b) Join on tentative only; timeless gets Interested only · (c) Join only on confirmed | **(a)** — Flow 8.2's whole premise is commitment-before-logistics, and the Marcus story in [user stories](../3-user-stories.md) ("Someone just had to pick a time") has joiners on a timeless plan. Join = "count me in," date or not. | ✅ |
| **M-D9** | Picker shape when materializing a timeless plan | (a) Reuse Flow 4.1 picker exactly (date pills, time skippable except Today) — timeless can become tentative or confirmed in one pass · (b) force date+time together | **(a)** — one picker to build and learn; partial progress (a date!) is still materialization momentum | ✅ |
| **M-D10** | Precise trigger for `plan_materialized` + materialization-rate denominator | (a) Fires once per plan on first transition **to confirmed** (time set); denominator = plans that were ever timeless or tentative · (b) fires on timeless→tentative too | **(a)** — the metric promises "received a time"; date-only is progress but not materialization. Notification to Interested on date-only set: **no** (notify on time, per the spec's wording). | ✅ |
| **M-D11** | Re-notify on time *change* post-confirmation | (a) Yes, same audience as M-D7, no cap (organizer-driven changes are rare) · (b) cap at N per day | **(a)** — enum already says "added/changed"; revisit if telemetry shows abuse | ✅ |
| **M-D12** | Notify Interested users when a plan is cancelled? | (a) No — card disappears silently; cancelled state is for joiners (spec Flow 5 as written) · (b) lightweight notification | **(a)** — Interested is deliberately low-stakes in both directions; notifying on cancel raises its emotional price | ✅ |
| **M-D13** | Interest count & identity visibility | (a) Count visible to everyone who can see the plan; identities visible to organizer only · (b) identities visible to all viewers (like joins) · (c) organizer-only everything | **(a)** — spec only promises the organizer "sees an interest count"; joins are public-by-design (attendee list), Interested stays cheap by staying semi-private | ✅ |

---

## Collaborative materialization + coarse time (M-D14–M-D20)

> **Added:** 2026-06-22. These decisions pull a richer **time-proposal** model into Alpha (it **supersedes** the Beta-1 Flow B6/B7 design) and add a **generic→specific** time picker. They reverse the original M-J4 stance ("a joiner's only lever is waiting") — joiners now have a lever: propose. Built and verified (`backend/tests/test_journeys.py::TestTimeProposals`, `TestCoarseTime`); specified in [tech/09 §10–11](../../tech/09-materialization-workflow.md). Resolutions adopted as recommended.

| ID | Question | Resolution | Status |
|---|---|---|---|
| **M-D14** | May a non-organizer propose a time? | **Yes** — any mutual friend who can view/join a **timeless or tentative** plan (not the organizer). Reverses M-J4's "only lever is waiting." | ✅ |
| **M-D15** | Who locks in a proposed time? | **Organizer only.** Proposals are input; the organizer stays the plan owner. Accept → the plan materializes via the normal path (M-D7a fan-out, M-D10a/M-D20 telemetry). | ✅ |
| **M-D16** | Proposal shape & concurrency | **Multiple options per proposal (1–5); one pending proposal per plan.** The first proposer owns the slot until it resolves (accept / decline / expire / retract). Enforced app-side + a partial-unique index. Avoids Beta's "noisy multi-proposer" problem. | ✅ |
| **M-D17** | Expiry | **Proposer-settable, default 48h** (clamped 1–14 days). On expiry the reminder cron voids the proposal and notifies the proposer (`plan_proposal_declined`, reason `expired`). | ✅ |
| **M-D18** | "None of these work" (decline) | Proposal → `declined`; the plan **returns to its prior un-timed state**; proposer notified. Organizer setting a time directly also voids a pending proposal (reason `organizer_set_time`). | ✅ |
| **M-D19** | Coarse time bands | **Morning / afternoon / evening** are valid "whens". A band **soft-confirms** the plan (`state=confirmed`, `time_granularity=approximate`) — distinct from tentative. Mutually exclusive with an exact `plan_time`; validated against opening hours (open for ≥1 slot in the band window). | ✅ |
| **M-D20** | Materialization & nudges with bands | `plan_materialized` fires **once** on the first "when", exact **or** band (carries `time_granularity`). A band→exact refine re-notifies (M-D11a) but does **not** re-fire. A band plan is **never** "unconfirmed" and never gets `plan_date_passed`; instead the organizer's morning-of card carries `plan_time_band` as a "lock in an exact time?" nudge. | ✅ |

---

## Definition of Ready — before `tech/09-materialization-workflow.md`

- [x] All 13 decisions ✅ in the register
- [x] [mvp-1.md](mvp-1.md) Flows 4.2 / 8.2 amended with the resolved behavior (and the C1 wording fixed: tentative vs timeless reminder language)
- [x] [tech/02](../../tech/02-database-schema.md) enum comment for `plan_time_updated` updated per M-D7; new notification types added if M-D6(a) chosen (`plan_date_passed`)
- [x] [tech/04](../../tech/04-api-design.md) Scheduled Jobs section rewritten from the M-D1/M-D2/M-D3 decisions (the current "resolution for implementer" note retired)
- [x] Telemetry: `plan_materialized` trigger definition (M-D10) confirmed against the PostHog event table

The tech doc will then cover: the full plan state machine with transitions and guards · cron job spec (schedule, queries, timezone math, idempotent delivery) · notification fan-out matrix (event × audience × channel) · API deltas (`PATCH /plans/:id` validation, unconfirmed flag exposure) · Realtime events · test plan for every register decision.
