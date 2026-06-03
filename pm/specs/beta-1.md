# Beta-1 Spec

> **Status:** Draft
> **Last updated:** 2026-05-17
> **Release:** Beta (MVP-2) — Functionality enhancement: deepen engagement, add time layer
> **Platform:** Mobile-first web app
> **Builds on:** Alpha (MVP-1)

---

## Introduction

Beta builds directly on the foundation Alpha established: the social graph, the ambient plan visibility model, the Interested → notification loop, and the place-saving layer. Alpha proved that lightweight, opt-in plan sharing can reduce the coordination burden on organizers and that a plan's social value outlives the moment it was created. Beta takes that further.

**The thesis:** the social intent that creates a plan rarely disappears when the plan falls apart. When you committed to a hangout — joined it, put it in your Panel, told yourself you were going — the underlying desire to spend time with that person was real. A scheduling conflict or a low-energy evening doesn't erase it. It just defers it. Current tools have no concept of this. A cancelled plan disappears, and that social thread quietly dies.

Beta introduces a **cancellation-aware re-engagement system** that catches the moment of cancellation and converts it into a forward signal — a lightweight, one-tap path to keeping the social intent alive. It also closes the one remaining bottleneck in the Alpha materialization loop: if the organizer never gets around to setting a time, anyone who's committed can now propose one.

Beta does not introduce a new interaction paradigm. The map, The Panel, plans, and the social graph are unchanged. Beta adds intelligence to the moments where Alpha goes quiet.

---

## What Beta Builds On

| Alpha capability | Beta extension |
|---|---|
| Organizer cancels a plan (Flow 5) | Cancellation now triggers a re-engagement prompt for the organizer |
| Joiner joins a plan | Joiners can now cancel their join — new "leave plan" flow, also with re-engagement |
| Timeless plan → organizer adds time (Flow 4.2) | Joiners and Interested users can now propose a time — organizer reviews and accepts |
| Interested → notification loop (Flow 8.2) | Organizer accepting a time proposal triggers the same notification broadcast |
| The Panel | Two new card types: Re-plan prompt card · Proposed time notification card |

Beta also introduces an entirely new input surface with no Alpha equivalent: the **calendar layer**. Where the map is the "where" input (users save places to build a location graph), the calendar is the "when" input (users mark availability to build a time graph). Together, these two graphs power the compatible plan ranking used throughout the re-engagement system.

---

## Core Principles

These sit alongside the Alpha principles — they narrow the focus of Beta without replacing any prior commitments.

- **Cancellation is a pivot, not an ending.** The social intent behind a committed plan is durable. When a plan falls apart, that signal deserves a forward path, not a dead end.
- **Re-engagement should cost almost nothing.** The moment after cancellation is when friction is highest and motivation is lowest. A re-plan that requires three decisions will fail. One tap is the bar.
- **The system already knows what you both want.** Both users have a saved places list, a plan history, and mutual interests. The platform has enough context to make a useful suggestion without asking — so it should.
- **Proposals close the loop.** The original materialization loop had one bottleneck: the organizer. Enabling anyone who has committed to propose a time distributes that responsibility without taking control away from the organizer.
- **No guilt, no dark patterns.** Every cancellation flow must give a clean exit with zero social pressure attached. The re-engagement prompt is a forward-looking offer, not a retention tactic.
- **Place as Idea, Time as Commitment.** Saving a place is the first gesture of a potential plan — a location where you could hang out in the future, with no time and no people yet attached. A saved place is an idea. For that idea to become a plan, it needs two things: time and people. Beta introduces the concept of a **Stage 1 Plan** — a plan that has fulfilled one of those two requirements but not yet both. Stage 1 plans are the product's primary tool for converting social intent into real hangouts.
- **Shrink the guilt window to near-zero.** Cancelling a committed plan carries psychological weight. Guilt blocks action — a user who feels bad about cancelling is less likely to re-engage immediately, which causes plans to die rather than reschedule. Beta's job is to do as much work as possible so that after a cancellation, both users find themselves in a Stage 1 plan together before the social awkwardness has time to set in. Every step in the cancellation-to-replan flow should feel like relief, not obligation.

---

## In Scope

### Re-engagement system

- Two-step cancellation flow for committed (joined) plans — applies to joiners leaving a plan and to organizers cancelling their own
- Re-engagement prompt surfaced immediately after cancellation confirms
- Compatible plan matching: cross-references both users' existing timeless plans, saved places, and Interested signals to rank re-plan options
- One-click re-plan creation from the prompt: pre-filled place, pre-tagged friend, no further decisions required — enters timeless plan state immediately
- Persistent Re-plan card in The Panel after a dismissal, until acted on or cleared
- Homepage Re-plan card: proactive, non-cancellation surface for mutual friends with high-confidence plan overlap

### Stage 1 Plans

A Stage 1 Plan has fulfilled one of the two requirements for a full plan (time + people) but not both yet. Beta introduces two variants:

**People-first (the re-engagement path):** A specific friend is attached and a place is pre-filled (from the compatible plan matching), but no time is set. Either user can initiate this. It lives in the Panel as a distinct card type — warmer than a timeless plan, more committed than an "Interested" signal. Both the organizer and the friend see it. The plan is waiting for one thing: time.

**Time-first (the calendar path):** A user marks a time slot as available for a hangout. The product suggests places based on both users' locations, overlapping saved places, business opening hours, and reasonable hours for public locations. No specific person is attached yet — or optionally, the user pre-selects a friend before browsing time slots. A time-first plan becomes a full plan when a place is selected.

### Time proposals

- Joiners and Interested users can propose a time on any timeless or tentative plan
- Organizer receives a Notification card when a proposal is submitted
- Organizer can accept, set their own time, or ignore each proposal from the plan detail page
- On acceptance: all Joined and Interested users receive a Notification card with the confirmed time
- On organizer setting their own time while proposals exist: proposals are cleared and all Joined + Interested are notified (same behavior as Alpha Flow 4.2)

### Calendar Layer

Beta introduces a calendar view as a second homepage surface alongside the map. The map is the "where" input layer — users save places to build a location graph. The calendar is the "when" input layer — users mark availability to build a time graph. Both graphs feed the compatible plan ranking.

**Google Calendar sync:**
- Integrates via an additional OAuth scope (`calendar.events`) requested during the existing Google sign-in flow — no new auth infrastructure required
- Users with multiple Google Calendars (Work, Personal, etc.) can select which calendars to include in availability calculations
- **Read:** existing Google Calendar events appear as opaque "Busy" blocks in the in-app calendar view — event title and details are never shown, only free/busy status
- **Write:** when a plan is confirmed (time + place + people), the app automatically creates a corresponding Google Calendar event
- **Auto-sync on cancellation:** when a plan is cancelled in the app, the corresponding Google Calendar event is deleted automatically — the time slot reopens without the user doing anything
- Users can also mark availability slots directly in the in-app calendar view; these optionally create Google Calendar events

**In-app calendar view:**
- Shows a merged view: Google Calendar events as opaque "Busy" blocks + hyperlocal plans in a distinct visual style (color, icon)
- Supports week and day views; month view is optional for Beta
- Tapping a free slot initiates the time-first plan creation flow (Flow B8)
- The calendar is a homepage-level surface — not buried in settings

---

## Out of Scope

- Re-engagement for plans where only Interested signals exist — the signal is too weak to trigger a re-plan prompt; re-engagement requires at least one committed join
- Time proposal voting, ranked ballots, or any consensus UI — organizer has final say
- Counter-proposals: proposer submits, organizer acts — no back-and-forth negotiation UI
- Re-engagement targeting fellow joiners (rather than the organizer) — deferred; limited to the two-person organizer–joiner relationship in Beta
- Notifications for joiner cancellations (organizer is not notified when a joiner leaves — see Open Questions)
- Push or email notifications (remains deferred, consistent with Alpha)
- Recurring plans
- Explicit-invite plans visible only to named friends (exploratory horizon from the vision doc — not Beta)
- Place recommendation feed (algorithmically surfacing new places for users to save, to grow the location graph) — inputs are built in Beta (calendar availability, saved places graph) but the recommendation engine itself is deferred to V3
- Multi-calendar platform support: Apple Calendar / CalDAV, Outlook / Microsoft 365 via Microsoft Graph API — V3 market expansion scope

---

## Key UI Surfaces

### Cancellation Confirmation Modal (Two-Step)

Triggered when a joiner taps "Leave plan" inside a committed plan detail view, or when an organizer cancels their own plan.

This modal is **not reachable from the Plan card in The Panel** — it lives only inside the plan detail view, behind a secondary action. This friction is intentional. Cancelling a committed plan should be a deliberate act, not a thumb slip.

**Step 1 — Acknowledgment**

> "You're leaving [place name] on [date]."
> Subtext: "Your spot will be freed up for others."

Actions: [Back] · [Continue]

**Step 2 — Confirmation + forward prompt**

> "Got it. Are you sure?"
> Subtext: "Still want to hang with [name]? We'll help you find a better time."

Actions: [Nevermind] · [Yes, cancel]

The forward prompt on Step 2 is non-interactive — it is a preview of what comes next, not a decision the user has to make now. Tapping "Yes, cancel" confirms the cancellation and immediately opens the Re-plan Prompt Sheet.

---

### Re-plan Prompt Sheet

A bottom sheet that surfaces immediately after cancellation. Also reachable from the persistent Re-plan card in The Panel.

**Header:** "You and [name] still want to hang."
**Subtext:** "Here are some ideas that work for both of you."

The sheet shows a ranked list of up to 5 Compatible Plan Cards, followed by a "Start a blank plan together" fallback at the bottom. The sheet can be dismissed at any time. Dismissing it creates a persistent Re-plan card in The Panel (below Notification cards, above regular Plan cards) until acted on or cleared.

---

### Compatible Plan Cards (inside Re-plan Prompt Sheet)

Each card represents a potential re-plan option, ranked by compatibility signal strength. Cards display:

- Place name and category
- A single compatibility label — plain language, no jargon: "You both saved this" · "You two planned this before" · "Both of you are interested" · "[name] wants to go here too"
- One-tap action: **Re-plan here** — creates a new timeless plan immediately with no further input

---

### Persistent Re-plan Card (The Panel)

If the Re-plan Prompt Sheet is dismissed, a soft card remains in The Panel:

> "You and [name] still have plans in common."
> Subtext: "Tap to find a time that works."

Actions: [View options] · [Dismiss]

"View options" reopens the Re-plan Prompt Sheet. "Dismiss" removes the card permanently for this pair.

This same card surface is used for the proactive homepage re-engagement case (Flow B5) when the compatibility algorithm detects strong plan overlap between mutual friends who have not recently interacted.

---

### Time Proposal UI (Plan Detail Page)

On any timeless or tentative plan where the viewer is Joined or Interested, a secondary action appears below the main plan details:

**"Propose a time"** — opens the same date pill + 30-minute block time picker from Alpha Flow 4.1. Proposed time must fall within the place's opening hours and in the future.

After submitting:
- Toast confirms: "Your proposal was sent to [organizer handle]."
- The button changes to "Time proposed · [day, time]" — tappable to retract the proposal.
- A user can have one active proposal per plan at a time.

---

### Organizer's Proposed Time Review (Plan Detail Page)

When one or more joiners have proposed a time, the organizer's plan detail page shows a new section:

**"Proposed times"** — lists each proposal with the proposer's handle and suggested time. Newest first. Up to 3 visible; if more exist, a "+N more" indicator links to the full list.

Per proposal, the organizer can:

- **Accept** — sets the plan time, notifies all Joined + Interested, clears the proposals section
- **Set my own time** — opens the standard Alpha time picker; notifies all Joined + Interested; clears all pending proposals
- **Ignore** — removes that proposal from the list; proposer is not notified; plan remains timeless

The organizer also receives a Notification card: "[handle] proposed [day] at [time] for [plan name]."

---

### In-App Calendar View

A homepage-level surface displayed alongside (or as an alternative to) the map, accessible via a navigation tab.

**Views:** Week (default) and day. Month view is optional for Beta.

**Event rendering:**
- Google Calendar events: opaque "Busy" blocks — no title, no details, just time range. Privacy is preserved.
- Hyperlocal plans: distinct card style within the grid — place name, plan status, and join count if applicable.
- Manually marked availability: lightly shaded, distinct from both busy blocks and plans.

**Tapping a free slot:** Opens the time-first plan creation flow (Flow B8). If a mutual friend's calendar data is available, their free/busy is shown as an overlay before the user taps.

**Calendar selection (first-time setup and settings):** Users select which of their Google Calendars feed into the free/busy calculation. Persists in profile settings.

---

## Key Flows

### Flow B1: Joiner Cancels a Committed Plan

1. Joiner opens the plan detail page from their Panel.
2. A secondary "Leave plan" action is available below the primary plan content — not the primary CTA.
3. Tapping "Leave plan" opens the Cancellation Confirmation Modal at Step 1.
4. Step 1 names the plan and date (if set). Joiner taps "Continue."
5. Step 2 confirms the action and previews the re-engagement prompt. Joiner taps "Yes, cancel."
6. The plan is removed from the joiner's Panel. The plan detail page (for the organizer and other joiners) reflects the updated headcount.
7. The organizer is not notified in Beta (see Open Questions).
8. The Re-plan Prompt Sheet opens immediately (Flow B2).

**Edge cases:**
- If the plan is timed and within 2 hours of the plan start, cancellation is still permitted — no hard block. The re-engagement prompt still appears.
- If the two users have no overlapping saved places or timeless plans, the Compatible Plan Cards list is empty. The sheet falls back to "Start a blank plan together" only.
- If the plan date has already passed, "Leave plan" is not available.

---

### Flow B2: Re-engagement Prompt (Post-Cancellation)

Triggered immediately after a joiner cancels (Flow B1) or an organizer cancels their own plan (Alpha Flow 5, extended).

1. The Re-plan Prompt Sheet opens with "You and [name] still want to hang."
2. Up to 5 Compatible Plan Cards are displayed (ranked by Flow B3 logic).
3. The user has three paths:
   - **Tap "Re-plan here"** on a Compatible Plan Card → Flow B4
   - **"Start a blank plan together"** at the bottom → Flow B4 with no place pre-filled
   - **Dismiss** → persistent Re-plan card appears in The Panel

---

### Flow B3: Compatible Plan Matching

Runs at the moment of cancellation and refreshes each time the Re-plan Prompt Sheet is opened. Cross-references both users' data.

**Input signals:**

| Signal | Source |
|---|---|
| Cancelled plan's place and category | The plan that was just cancelled |
| Each user's existing timeless plans | Their saved plan history |
| Each user's saved places | Their Place cards |
| Each user's Interested signals on shared plans | Interaction history |

**Ranking tiers (highest to lowest confidence):**

1. Both users have saved the exact same place — strongest signal; surfaces first
2. Both users have a timeless plan at the same category of place
3. One user has a timeless plan; the other has the same place saved
4. Both users have tapped Interested on plans in the same category
5. Category match only (based on the cancelled plan's place type) — fallback

The top 5 results are returned. Each result carries one of the compatibility labels used in the Compatible Plan Card UI.

If fewer than 2 signals are found across all tiers, the list returns empty and the sheet shows only "Start a blank plan together."

---

### Flow B4: One-Click Re-plan Creation

Triggered from "Re-plan here" on any Compatible Plan Card, or from "Start a blank plan together."

1. A new timeless plan is created immediately:
   - **Place:** pre-filled from the selected Compatible Plan Card (or empty for blank plan)
   - **Friend:** pre-tagged with the friend from the cancellation context
   - **Time:** none — enters the "needs time" timeless state
2. Toast: "New plan created with [name]. Add a time when you're ready."
3. The new Plan card appears at the top of both users' Panels.
4. The friend receives a Notification card: "[handle] re-planned [place name] with you." — they can tap Interested or Join directly.
5. The Re-plan Prompt Sheet (and the persistent Re-plan card, if it existed for this pair) are dismissed.
6. The Alpha timeless plan nudge cadence from Flow 4.2 applies to the new plan going forward.

**Edge case:** If the pre-filled place is no longer available in the Google Places API, the system falls back to the blank plan option and shows a toast: "That place is no longer available — you can choose another."

---

### Flow B5: Proactive Homepage Re-engagement Card

The compatibility matching algorithm runs periodically for mutual friend pairs independent of cancellations. If the system detects that two mutual friends have two or more overlapping signals (same place saved, same-category timeless plans, or Interested overlaps) with no recent shared plan activity, a Re-plan card is surfaced in The Panel unprompted.

1. A Re-plan card appears below Notification cards in The Panel: "You and [name] have compatible plans."
2. Tapping opens the Re-plan Prompt Sheet with the full compatible plan list.
3. User can tap "Re-plan here" (Flow B4) or dismiss.
4. If dismissed, the card does not reappear for the same pair for 30 days.

**Threshold:** The card only surfaces when both users have at least 2 overlapping signals. Single-signal overlap is not sufficient for a proactive prompt — it would surface too many low-confidence cards.

---

### Flow B6: Proposing a Time (Joiner or Interested User)

1. User opens the plan detail page for a timeless or tentative plan where they are Joined or Interested.
2. A secondary action "Propose a time" is visible below the plan details.
3. Tapping opens the time picker: same date pills and 30-minute block controls from Alpha Flow 4.1. Time must be in the future and within the place's opening hours.
4. User selects a time and taps "Send proposal."
5. Toast: "Proposal sent to [organizer handle]."
6. The organizer receives a Notification card: "[handle] proposed [day] at [time] for [plan name]."
7. The proposer's plan detail view now shows "Time proposed · [day, time]" in place of the propose button — tappable to retract.

**Edge cases:**
- A user can only have one active proposal per plan. Submitting a new proposal while one exists triggers a confirm step: "Replace your current proposal?" Confirming replaces it; the organizer is notified of the updated proposal.
- If the organizer sets a confirmed time after the proposal was submitted (before reviewing it), the proposal is automatically dismissed and the proposer sees the confirmed time.
- Organizers cannot use this flow on their own plans. They use the existing "Add time" flow from Alpha.

---

### Flow B7: Organizer Reviews a Proposed Time

1. Organizer opens their plan detail page (via The Panel or a Notification card).
2. A "Proposed times" section lists each proposal with the proposer's handle and time. Newest first; up to 3 shown with a "+N more" link.
3. **Accept:** Sets the plan time to the accepted time. All Joined + Interested receive a Notification card with the confirmed time. Proposal list is removed.
4. **Set my own time:** Opens the standard Alpha time picker. Setting a time notifies all Joined + Interested. All pending proposals are cleared.
5. **Ignore (per proposal):** Removes that proposal from the organizer's view. Proposer is not notified. Other proposals remain. Plan stays timeless.

---

### Flow B8: Time-First Plan Creation

Triggered by tapping a free time slot in the in-app calendar view.

1. User taps a free slot. The app checks which mutual friends appear free in that window based on their shared calendar data (if opted in).
2. A tray opens showing: the selected time, suggested friends who appear available, and place suggestions filtered by both users' saved places, proximity, and opening hours for the selected time.
3. User selects a friend (or confirms a pre-selected one) and a place. A Stage 1 plan is created: time and place set, pending friend confirmation.
4. Friend receives a Notification card: "[handle] wants to hang at [place] — [day] at [time]. Up for it?"
5. Friend can confirm (Joins the plan), propose an alternative time, or ignore.
6. On confirmation: the plan is promoted to a full plan. Both users' Google Calendars receive a new event automatically.

**Edge cases:**
- If no mutual friends have calendar data available, step 2 shows all mutual friends without availability filtering — the user picks who to invite.
- If no saved places overlap between the two users, suggestions fall back to either user's saved places, filtered by proximity and opening hours.
- If the selected time falls outside a suggested place's opening hours, that place is silently excluded from the list.

---

## Success Metrics

Beta metrics are additive — all Alpha metrics continue to apply.

**Definition of "re-engagement event":** A committed plan cancellation (joiner or organizer) followed by the Re-plan Prompt Sheet opening within 24 hours.

### Re-engagement

| Metric | Target |
|---|---|
| Re-plan prompt shown rate | ≥90% of committed plan cancellations trigger the prompt (validates the flow is wired correctly) |
| Re-plan prompt open rate | ≥50% of shown prompts are opened rather than immediately dismissed |
| Cancellation-to-replan conversion rate | ≥25% of re-engagement events result in a new plan created within 7 days |
| Re-plan materialization rate | ≥40% of re-plans receive a confirmed time within 14 days (vs. ~30% Alpha baseline for organic timeless plans) |

### Time proposals

| Metric | Target |
|---|---|
| Time proposal submission rate | ≥15% of eligible plan views (Joined or Interested, timeless plan) result in a proposal submitted |
| Time proposal acceptance rate | ≥50% of submitted proposals are accepted by the organizer |
| Proposal-to-organizer action time | Median ≤48 hours from proposal submission to accept, modify, or ignore |

### Proactive homepage card

| Metric | Target |
|---|---|
| Homepage card open rate | ≥35% of surfaced cards result in a sheet open |
| Homepage card conversion rate | ≥20% of opened cards result in a new plan created |

### Calendar layer

| Metric | Target |
|---|---|
| Calendar connection rate | ≥60% of active Beta users connect a Google Calendar within the first week |
| Time-first plan creation rate | ≥10% of active users create at least one plan via the calendar flow per week |
| Calendar-to-confirmed-plan rate | ≥30% of time-first plans (Flow B8) receive friend confirmation within 48 hours |

---

## Telemetry Requirements

All Alpha telemetry events remain unchanged. Beta adds:

| Event | Trigger | Powers |
|---|---|---|
| `plan_join_cancelled` | A joiner cancels their committed join | Re-engagement funnel entry (denominator for prompt shown rate) |
| `replan_prompt_shown` | Re-plan Prompt Sheet opens for any reason | Prompt shown rate |
| `replan_prompt_opened` | User scrolls or interacts with the compatible plan list | Prompt open rate (numerator) |
| `replan_prompt_dismissed` | User dismisses the sheet without creating a plan | Abandonment signal |
| `replan_created` | A plan is created from the Re-plan Prompt Sheet | Cancellation-to-replan conversion rate |
| `compatible_plan_surfaced` | Homepage Re-plan card shown without a prior cancellation | Homepage card open rate (denominator) |
| `compatible_plan_card_opened` | User taps the homepage Re-plan card | Homepage card open rate (numerator) |
| `time_proposed` | A joiner or Interested user submits a time proposal | Proposal submission rate |
| `time_proposal_accepted` | Organizer accepts a proposal | Proposal acceptance rate |
| `time_proposal_modified` | Organizer sets own time while proposals are pending | Informs accept vs. modify preference |
| `time_proposal_ignored` | Organizer dismisses a specific proposal | Friction signal; informs nudge timing |
| `time_proposal_retracted` | Proposer retracts an active proposal | Engagement quality signal |
| `calendar_connected` | User completes Google Calendar OAuth and selects calendars | Calendar adoption rate |
| `calendar_slot_tapped` | User taps a free time slot in the calendar view | Time-first plan funnel entry |
| `time_first_plan_created` | A plan is created from the time-first flow (Flow B8) | Calendar-to-plan conversion rate |
| `calendar_event_created` | A Google Calendar event is auto-created on plan confirmation | Calendar write success rate |
| `calendar_event_deleted` | A Google Calendar event is auto-deleted on plan cancellation | Auto-sync success rate |

---

## Tech Stack

The re-engagement system and time proposal flows run entirely on the Alpha stack (React frontend, Flask/Lambda backend, Supabase Postgres, Supabase Realtime for live Panel updates, PostHog for telemetry). The calendar layer adds one new dependency: an additional OAuth scope (`calendar.events`) on the existing Google sign-in flow via Supabase Auth — no new data stores or auth infrastructure required.

The compatibility matching algorithm (Flow B3) runs as a lightweight Postgres query against existing `saved_places`, `plans`, and `plan_interests` tables — no new data stores or async job infrastructure needed at Beta scale.

---

## Constraints & Assumptions

- Compatible plan matching is best-effort and approximate. It does not require ML or a recommendation engine — ranked Postgres queries against the existing schema are sufficient for Beta. Accuracy can improve over time as data accumulates.
- The re-engagement flow only triggers when a mutual friendship exists between the canceller and the other party. Plans between users who are not mutual friends are out of scope for the re-engagement system.
- The proactive homepage card (Flow B5) is rate-limited to one card per mutual friend pair at a time — no spam of the Panel with multiple compatible cards for the same person.

---

## Open Questions

0. **[BLOCKER] Compatible plan ranking algorithm not yet finalized.** The re-engagement system (Flow B3) depends on a ranking function that scores candidate plans by compatibility with a cancelled plan. The inputs are defined (cancelled plan's category/place, both users' saved places, mutual Interested signals) but the scoring weights, minimum score threshold for surfacing, and tie-breaking logic have not been decided. This must be resolved before B3 can be implemented.

1. **Organizer notification on joiner cancellation.** Currently excluded to avoid social pressure on the joiner. Counter-argument: organizers may need headcount awareness (e.g., restaurant bookings). Proposed resolution: notify only if the plan has a confirmed time and 3+ joiners. Below that threshold, it's noise.

2. **Compatibility algorithm freshness.** How often should Flow B5 re-run for dormant pairs? Daily for active user pairs makes sense; weekly for users who haven't opened the app in 7 days. Define a hard cooldown (suggested: 30 days) before re-surfacing the same pair's card after a dismiss.

3. **Does the friend see cancellation context on the re-plan?** When User A creates a re-plan after cancelling, User B receives "re-planned with you." Should B see that the original plan was cancelled, or is that unnecessary and slightly awkward? Current stance: no — the re-plan is a fresh start, not a thread on what went wrong.

4. **Multiple proposers, noisy review view.** If 5 people all propose times, the organizer's plan detail gets crowded. Proposed: cap visible proposals at 3 on the plan detail page; additional proposals accepted but collapsed under "+N more." Confirm this cap before building.

5. **Re-engagement between two joiners.** If two joiners both leave the same plan, they share a real social signal — but re-engagement currently only surfaces between the canceller and the organizer. This mutual joiner case is potentially valuable but out of scope for Beta. Flag for Beta-2.
