# MVP-1 User Journeys — Happy & Sad Paths

> **Status:** Draft for review
> **Last updated:** 2026-06-11
> **Companion docs:** [MVP-1 Spec](specs/mvp-1.md) (happy-path flows) · [tech/08-edge-cases-and-error-handling.md](../tech/08-edge-cases-and-error-handling.md) (implementation) · [Materialization Workflow Worksheet](specs/materialization-workflow.md) (open decisions)

This document expands every MVP-1 flow into a full user journey: the happy path (condensed — the spec owns the canonical version), every meaningful sad path, and the standard resolution pattern applied to each. Where a sad path depends on an unresolved product decision, it links to the [Materialization Workflow Worksheet](specs/materialization-workflow.md) instead of guessing.

**Assumptions made in this doc** (reasonable defaults from the PM docs; flag for correction if wrong):

- A1. Duplicate social actions (re-follow, re-save, re-join, re-Interested) are never errors from the user's perspective — the app treats "already done" as success.
- A2. The app is useful-but-degraded without geolocation: it falls back to map default (last viewport, else a default city) and proximity sorting degrades to recency.
- A3. Google Places is the only place source; if it's down, saved/cached places still work, discovery doesn't.
- A4. Plans, saves, follows are all soft, reversible actions — only plan cancellation gets a confirmation step (per spec Flow 5).
- A5. "Friend" always means mutual follow; losing mutuality (unfollow) silently revokes visibility on the next data fetch — no notification is sent.
- A6. Making a profile private gates only *new* discovery — existing followers/mutuals keep the access they already had (referenced by J12.2; confirm with PM).
- A7. Notes-enriched search reaches the viewer's own notes and their **mutual friends'** notes only, and returns a **provenance label** ("matched @handle's note"), never the note text. Losing mutuality drops that friend's notes from the viewer's results on the next fetch (consistent with A5).
- A8. Lists have a single owner. A place's membership in a List is independent of the underlying save and of other Lists; removing a place from one List never unsaves it or touches other Lists. "Want to Go" is a default List every user has.

---

## Standard Resolution Patterns

Each sad path below cites one of these named patterns. Implementation details for each live in [tech/08](../tech/08-edge-cases-and-error-handling.md).

| ID | Pattern | Summary |
|---|---|---|
| **P1** | Optimistic update + rollback | Apply the change in the UI instantly; revert with a toast if the server rejects it. |
| **P2** | Idempotent action | Duplicate submissions (double-tap, retry, stale tab) resolve to success, not an error. |
| **P3** | Stale-state refresh | On conflict/not-found (someone else changed the world), refetch and render the current truth with a brief explanation. |
| **P4** | Graceful degradation | A denied permission or down dependency narrows functionality; it never blocks the core loop. |
| **P5** | Inline validation + recovery | Validate before submit where possible; on failure, keep user input, explain the problem, suggest a fix. |
| **P6** | Retry + offline awareness | Transient network failures retry automatically with backoff; persistent failure shows a non-blocking "you're offline" state preserving user input. |
| **P7** | Empty state with CTA | Every list that can be empty gets a designed state that explains why and offers the next action. |
| **P8** | Deep-link preservation | Auth interruptions remember where the user was going and resume there after sign-in. |
| **P9** | Soft-fail external dependency | Google Places / weather / PostHog failures degrade silently to cached or generic content; telemetry failures never surface to the user. |
| **P10** | Confirm destructive actions | Anything that affects other people or is hard to undo gets one confirmation step — exactly one. |

---

## J0 — Landing & first contact (Flow 0)

**Actor:** Unauthenticated visitor. **Trigger:** Opens the app URL, possibly via a shared place/plan/invite link.

**Happy path:** Visitor lands on the map with browsable contextual places. Any gated action (save, plan, follow, join) prompts account creation. They sign up and resume what they were doing.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 0.1 | Visitor opens a shared **plan** link while logged out | Show the place + a teaser ("a friend is planning something here") without plan details (privacy: plans are mutual-only). Sign-in CTA; after auth + mutual check, land on the plan. If not mutual after auth, land on the place detail with explanation. | P8, P3 |
| 0.2 | Visitor opens a shared **profile** link of a private profile | Render the standard private-profile state (name only, follow disabled per Flow 11) — same as authenticated view. No leak of places/plans. | P3 |
| 0.3 | Geolocation denied or unavailable on landing | Map centers on default city (IP-based region if available, else product default); contextual cards use that location; tagline drops location-specific phrasing. Search still works. | P4 |
| 0.4 | Google Places API down on landing | Map renders without suggestion pins; Panel shows generic "search for a place" empty state. No error dialog for an anonymous user. | P9, P7 |
| 0.5 | Visitor taps a gated action then abandons sign-in | Return them to the exact pre-auth view, action not performed, no error. The intent (e.g. place being saved) is kept for the session so retrying sign-in completes it. | P8 |

---

## J1 — Onboarding & account creation (Flow 1)

**Actor:** New user. **Trigger:** "Create account" CTA or any gated action.

**Happy path:** Google OAuth → handle creation (unique, validated) → optional socials → lands on map + Panel. If they arrived via deep link or gated action, that intent completes/resumes.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 1.1 | User cancels/denies the Google OAuth screen | Return to the entry point with a neutral "sign-in cancelled" toast and the CTA still available. No error styling — this is a choice, not a failure. | P5 |
| 1.2 | OAuth succeeds but the callback fails (network, expired state token) | Show "something went wrong signing you in" with one-tap retry of the whole OAuth flow. Never leave a half-session. | P6 |
| 1.3 | Desired handle already taken | Inline availability check as they type (debounced); on conflict at submit (race), keep input, show "taken", suggest `handle2`, `handle_sea` style alternatives. | P5 |
| 1.4 | Handle invalid (length, characters) | Inline rules shown up front; validate client-side before submit; server re-validates. | P5 |
| 1.5 | User abandons mid-onboarding (authenticated, no handle yet) | Account exists in limbo: next visit resumes at handle creation. All authed surfaces are blocked behind onboarding completion. | P8 |
| 1.6 | Same Google account signs up twice (e.g. two tabs) | Second attempt resolves to the existing user; if onboarded, straight to map; if not, resume handle step. | P2 |
| 1.7 | Socials input invalid (bad URL/handle format) | Inline validation; socials are optional, so "skip" always available. Never block onboarding completion on an optional field. | P5 |

---

## J2 — Finding a place (Flows 2 + 12)

**Actor:** Authenticated user. **Trigger:** Opens app / uses search bar.

**Happy path:** Map + Panel load with contextual suggestions for the current area (time/weather/location-aware, capped). User searches (name, category, or personal/friends' notes — see J16) or taps a pin/card → place detail with address link, photo, save and plan actions.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 2.1 | Search returns no results | Empty state in the (temporarily replaced) Panel: "No places found for '[query]' near here" + suggestions: zoom out, check spelling. Map untouched. | P7 |
| 2.2 | Search query rate-limited / Places API error | Retry transparently once; if still failing, show "search is having trouble — try again in a moment" while keeping the query in the box. | P6, P9 |
| 2.3 | Weather provider down (contextual suggestions, Flow 12) | Suggestions fall back to time-of-day + location rules only; tagline drops weather phrasing. User never sees a weather error. | P9 |
| 2.4 | No contextual matches (e.g. 3 AM, everything closed) | Panel shows saved places + a quiet "nothing open nearby right now" contextual section, not an error. | P7 |
| 2.5 | Place detail fetch fails after tapping a pin | Detail sheet shows skeleton → inline retry. The map remains interactive behind it. | P6 |
| 2.6 | A previously saved place no longer exists in Google Places | Render from our cached snapshot with a "this place may have closed" notice; save/note still editable; **plan creation disabled** with explanation. | P9, P5 |
| 2.7 | Geolocation lost mid-session (user revokes) | Same fallback as 0.3; proximity sort switches to recency with a subtle indicator. | P4 |

---

## J3 — Saving a place, with or by a note (Flows 3.1, 3.2)

**Actor:** Authenticated user on a place detail.

**Happy path:** Tap bookmark → instant saved state + toast; note section opens; note optional. Or: write note → save → both happen at once. Place card appears in Panel + pin on map.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 3.1 | Save request fails (network) | Bookmark filled optimistically; on failure, revert + toast "couldn't save — retry". The typed note is preserved locally. | P1, P6 |
| 3.2 | Double-tap bookmark / save in two tabs | Second save is a no-op success. Unsave-then-save races resolve to last action wins. | P2 |
| 3.3 | Note save fails after place save succeeded | Place stays saved (it already succeeded); note field keeps text with inline retry. Never lose typed text. | P6 |
| 3.4 | Note exceeds max length | Live character counter near limit; block submit client-side; server clamps as backstop. | P5 |
| 3.5 | User unsaves a place that has an **active plan** attached | Allowed — the plan is the stronger object and is unaffected (spec: plan creation auto-saves, but the reverse dependency doesn't hold). Confirm copy clarifies: "Your plan for this place stays." | P5 |
| 3.6 | Unsave a place a friend can currently see on their map | Silent revocation: disappears from friend surfaces on next fetch/realtime tick. No notification (A5). | P3 |

---

## J4 — Creating a plan (Flow 4.1)

**Actor:** Authenticated user on a place detail.

**Happy path:** CTA → date pills (Today / Tomorrow / This weekend / Select date) → time (required for Today; skippable otherwise, within opening hours) → Plan card appears atop own Panel and mutual friends' Panels; shareable link available; place auto-saved.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 4.1 | "Today" selected but the place is already closed for the day | Disable remaining time blocks with "closed for today"; suggest Tomorrow pill. | P5 |
| 4.2 | Selected time slips into the past while the picker is open (e.g. user idles) | Validate at submit; on failure, refresh the picker to current valid slots with "that time just passed". | P5, P3 |
| 4.3 | Opening hours unavailable for the place | Allow any future time but label it "hours unknown — double-check before you go". Don't block plan creation on missing third-party data. | P9, P4 |
| 4.4 | Plan submit fails (network) | Sheet stays open with selections intact + retry. No optimistic Panel insert for plan creation (it fans out to friends — too heavy to fake). | P6 |
| 4.5 | Double-submit (two taps on save) | One plan. Duplicate request within the creation window resolves to the first plan. | P2 |
| 4.6 | User creates a second plan for the same place | Allowed (different dates are legitimate), but if an **active plan for the same place exists**, prompt: "You already have a plan here for [date] — create another?" | P5 |
| 4.7 | Place disappears from Google Places between detail view and submit | Submit fails gracefully: "this place is no longer available" + plan sheet closes to cached place detail (see 2.6). | P9, P3 |
| 4.8 | Copy-share-link fails (clipboard permission) | Fall back to a visible, selectable URL in a small sheet. | P4 |

---

## J5 — Materializing a plan: adding time later (Flow 4.2)

**This journey is specified by the [Materialization Worksheet](specs/materialization-workflow.md) (all decisions resolved) and [tech/09](../tech/09-materialization-workflow.md).** The picker now offers a coarse band (morning/afternoon/evening) as well as an exact time (Flow 4.1).

**Happy path:** Timeless/tentative Plan card shows "Add time" → same picker as Flow 4.1 → an exact time **or** a band saved → card updates; Joined ∪ Interested users notified. A band soft-confirms the plan; the organizer gets a day-of nudge to refine it (optional).

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 5.1 | Organizer opens "Add time" from a stale Notification card after already setting the time elsewhere | Picker opens pre-filled with the now-set time in edit mode; the stale notification self-dismisses. | P3, P2 |
| 5.2 | Add-time fails (network) | Picker stays open with selection; retry inline. | P6 |
| 5.3 | Place's opening hours changed since plan creation; previously valid slots now invalid | Picker reflects current hours; if the plan's existing tentative date is now a closed day, surface "this place is closed on [date]" with date edit. | P3, P5 |
| 5.4 | Organizer commits only a band ("Saturday afternoon") and never refines | Allowed — the band stands as the plan's time. Day-of, the morning reminder offers "lock in an exact time?"; ignoring it is fine, not an "unconfirmed" state. | P7 |

---

## J5.2 — Proposing a time on a friend's plan (Flow 4.3)

**Actor:** A mutual friend (joined, interested, or neither) viewing a friend's timeless/tentative plan. **Trigger:** taps "Propose a time."

**Happy path:** Sheet opens → proposer adds 1+ options (date + band/exact, same picker) and an expiry (default 2 days) → sends → organizer gets a notification + a review section; proposer sees "waiting on [organizer]" with Retract.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 5.2.1 | A proposal already exists on the plan (someone else got there first) | The propose action is replaced by "[handle] proposed times — waiting on [organizer]." One open proposal per plan; the server rejects a second with a clear conflict. | P3 |
| 5.2.2 | A proposed option falls outside the place's opening hours (or in the past) | Validated like Flow 4.1 — the option is rejected inline before send; for bands, the place must be open sometime in that window. | P5 |
| 5.2.3 | Proposer is no longer mutual with the organizer when they send | Server rejects (plan no longer visible); the plan card disappears on refresh with a brief explanation. | P3 |
| 5.2.4 | Proposal submit fails (network) | Sheet stays open with the options intact; retry inline. | P6 |
| 5.2.5 | Proposer changes their mind | They can **Retract** their pending proposal anytime, which frees the slot for anyone else to propose. | A4 |

---

## J5.3 — The organizer decides on a proposal (Flow 4.4)

**Actor:** Plan organizer with one or more proposed options. **Trigger:** opens the plan (often from the "[handle] proposed…" notification).

**Happy path:** "Proposed times" section lists each option with **Accept**, plus **"None of these work."** Accept → the plan materializes to that option (notifies Joined ∪ Interested; proposer gets "your time was picked"). Decline → plan stays un-timed; proposer notified.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 5.3.1 | Organizer ignores the proposal until it expires | The reminder cron voids it at the expiry window and tells the proposer; the plan returns to its un-timed state. | P7 |
| 5.3.2 | Organizer would rather set their own time than accept any option | Setting a time directly (Flow 4.2) clears the pending proposal and notifies the proposer it's moot. | P3 |
| 5.3.3 | A proposed option's hours changed between proposal and accept | Re-validated at accept; an invalid option is rejected with "that time no longer works" and the organizer picks another or sets their own. | P5, P3 |
| 5.3.4 | Accept races with the proposer retracting | Whichever lands first wins; the loser gets a stale-state refresh (proposal already resolved). | P3, P2 |

---

## J6 — Cancelling a plan (Flow 5)

**Actor:** Plan organizer.

**Happy path:** Cancel from card or detail → single confirmation → card removed from organizer's Panel; place stays saved; joiners keep the plan, marked "cancelled by organizer"; plan lives on.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 6.1 | Cancel request fails after confirm | Plan card stays; toast + retry. Do **not** optimistically remove (other people's Panels are involved). | P6 |
| 6.2 | Organizer cancels while a friend is mid-Join on the same plan | Join lands on a cancelled plan: allowed but the joiner immediately sees the cancelled state (they may still want to go — that's the product philosophy). If we instead reject, joiner gets stale-state refresh. **Default: allow.** | P3 |
| 6.3 | Double-cancel (two surfaces) | Second cancel is a no-op success. | P2 |
| 6.4 | Organizer cancels, then regrets it | MVP-1: no un-cancel. The place is still saved; creating a fresh plan is the recovery path. Confirmation copy sets this expectation ("this can't be undone"). | P10 |
| 6.5 | Cancel attempted on a plan whose date/time already passed | Hide/disable cancel for past plans; if raced, treat as no-op. | P5, P2 |

---

## J7 — Finding & following a user; follow-back (Flows 6, 13)

**Actor:** Any authenticated user.

**Happy path:** Search by handle or open shared profile link → Follow (instant) → curated lists unlock → followed user gets a Notification card with "Follow back" → mutual → Plans unlock both ways.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 7.1 | Handle search: no match | Empty state: "No one with that handle" + "invite them" pointing at invite links. | P7 |
| 7.2 | Follow tap fails (network) | Optimistic follow state; rollback + toast on failure. | P1, P6 |
| 7.3 | Double-follow / follow from two surfaces | No-op success; exactly one notification to the followed user. | P2 |
| 7.4 | User tries to follow themselves | Follow button never rendered on own profile; server rejects as backstop. | P5 |
| 7.5 | Target profile is private | Follow disabled per Flow 11; page explains. If privacy flipped mid-view, action fails → refresh to private state. | P3 |
| 7.6 | Follow-back tapped on a stale notification (follower already unfollowed) | Follow proceeds (it's now a fresh one-way follow); card dismisses; no mutual is formed. The asymmetry is honest. | P3 |
| 7.7 | Unfollow regret (accidental unfollow breaks a mutual) | Re-follow is instant and recreates the one-way edge; the *other* side's follow was never touched, so mutuality restores immediately. No notification spam: re-follow within a short window doesn't re-notify. | P2 |
| 7.8 | Notification card dismissed without follow-back | Dismiss is final for the card; the follower relationship is still visible in the followers list — discoverable later. | P7 |

---

## J8 — Viewing profiles across the visibility tiers (Flows 7, 11)

**Actor:** Any user viewing another user.

**Happy path:** Tiered render per spec: stranger → name/photo/bio + public Lists on the profile map; one-way follower → same; mutual → + full saved places on the map and upcoming plans; private → name + "this profile is private". Tapping any visible pin opens Place detail (see J20).

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 8.1 | Relationship changes while the profile is open (they unfollow you) | Next data fetch renders the lower tier; private Lists and full saves drop out; no in-your-face notice. Cached higher-tier data must not linger past the refetch. | P3 |
| 8.2 | Owner has no public Lists (nothing to show a non-mutual viewer) | Profile map shows a friendly empty state, not an empty header; bio still renders. Same when a tier yields zero visible places. | P7 |
| 8.3 | Profile owner deleted/deactivated between link share and open | "This profile isn't available" state. | P3 |
| 8.4 | Viewing own profile via the public route | Render own profile in owner mode (edit affordances) regardless of route used. | P5 |

---

## J9 — Joining a friend's plan (Flow 8)

**Actor:** Mutual friend of an organizer.

**Happy path:** Friend's Plan card in Panel → plan detail (place, date/time, attendees) → Join → plan appears in own Panel, sorted by date; organizer's attendee list updates.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 9.1 | Join fails (network) | Optimistic joined state + rollback with toast. | P1, P6 |
| 9.2 | Double-join | No-op success. | P2 |
| 9.3 | Plan cancelled before the Join lands | Per 6.2 default: join succeeds onto a cancelled plan, cancelled state shown immediately. | P3 |
| 9.4 | Mutuality broken before Join lands (organizer unfollowed) | Server rejects (plan no longer visible to this user); client refreshes Panel — the card disappears with brief "this plan is no longer available". | P3 |
| 9.5 | User wants to un-join (leave a plan) | **Spec gap, assumed in:** joiners can leave a plan (delete their join) with a single confirm; no notification to organizer in MVP-1 (Beta makes this a first-class flow with re-engagement). | P10, A4 |
| 9.6 | Plan's time arrives / passes while user deliberates | Past plans drop out of the joinable Panel section; deep-linked past plan shows read-only "this already happened". | P3 |

---

## J10 — Expressing interest (Flow 8.2)

**Actor:** Mutual friend viewing a friend's (often timeless) plan.

**Happy path:** "Interested" tap → count increments for organizer → on time set/changed, all Interested users get a Notification card → from there they can Join.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 10.1 | Interested tap fails | Optimistic + rollback (this is the canonical P1 case — already an implementation convention). | P1 |
| 10.2 | Double-tap Interested | No-op success; count never double-increments. | P2 |
| 10.3 | Un-Interested (retract) | Tap again to toggle off; count decrements; user silently leaves the future notification audience. | P2 |
| 10.4 | Interested on a plan that gets cancelled | No notification on cancel for merely-Interested users in MVP-1 (only joiners get the cancelled state, per spec Flow 5). The card simply leaves their Panel. *Flagged in worksheet — confirm.* | P3 |
| 10.5 | Interested user also Joins | Join supersedes Interested in UI; user is counted once in notification fan-out. | P2 |

---

## J11 — Saved places list & friends' places (Flows 9, 10)

**Happy path:** Panel filtered to Places shows own + nearby friends' saves **for the current area**, sorted by proximity and capped (~9), friends' visually distinct; same on map with distinct pin styles. The user browses other areas via pan + "Search this area" (J14), and their full collection List-by-List on their own profile.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 11.1 | No saved places at all (new user) | Empty state pointing at search + contextual suggestions: "Places you save will show up here." | P7 |
| 11.2 | No friends yet | Panel is self-only; an inline card suggests finding friends by handle / sharing an invite link. | P7 |
| 11.3 | Friend's save disappears (they unsaved or unfollowed) | Silent removal on next fetch (A5). | P3 |
| 11.4 | More nearby saves than the cap (dense area) | Show the nearest ~9; the rest are reachable by zooming/re-scoping (J14). Map pins cluster/declutter at low zoom. A scannability feature, not just a perf one. | P4 |
| 11.5 | Proximity sort with no location permission | Recency sort + indicator, per 2.7; "Search this area" still re-scopes by viewport even without location. | P4 |
| 11.6 | User expects to see a save they made elsewhere and it's not in the list | Expected: the list is area-scoped. Empty/short states hint "Showing [area] — pan and Search this area to look elsewhere," so absence is legible, not a bug. | P7 |

---

## J12 — Editing profile & privacy (Flow 11)

**Happy path:** Edit socials (each optional), toggle private. Private hides everything but name from non-followers and disables Follow.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 12.1 | Save profile fails | Keep edits in the form, inline retry. | P6 |
| 12.2 | Toggling private with existing followers | Existing followers/mutuals keep access (private gates *new* discovery, per spec: "disallow non-followers"). Confirm copy states this. *Assumption A6 — verify with PM.* | P5 |
| 12.3 | Concurrent edits in two tabs | Last write wins; the stale tab refreshes on next focus. Acceptable at MVP scale. | P3 |

---

## J13 — Invite links (Success metrics / acquisition funnel)

**Happy path:** User copies an invite link (from plan share or profile) → recipient opens it → lands per J0 → signs up → `invite_link_converted` fires → original sharer is an obvious first follow.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 13.1 | Invite link expired or revoked | Land on the generic landing page with "this invite expired" toast; product is still fully sign-up-able. Attribution is lost, experience isn't. | P4 |
| 13.2 | Recipient already has an account | Link resolves to its target (profile/plan) for the logged-in user; no conversion event. | P8 |
| 13.3 | Redeem fails post-signup (race/network) | Signup always wins; attribution is best-effort and retried once silently. Never block onboarding on analytics. | P9 |

---

## J14 — Scoping discovery to an area (Flow 14)

**Actor:** Authenticated user. **Trigger:** Pans the map to a different area.

**Happy path:** Discovery defaults to the user's current-location area (reverse-geocoded label). User pans → "Search this area" appears → tap → recommendations, Panel place list (own + nearby friends', capped), and pins re-scope to the new area; label updates.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 14.1 | Reverse-geocode fails / unnamed area | Drop the name, label generically ("this area"); scoping still works off the viewport. | P9 |
| 14.2 | Re-scoped area has no places | Capped list shows a friendly "nothing saved or open around here yet" with a nudge to search or zoom out. Map isn't blanked. | P7 |
| 14.3 | Rapid panning fires many re-scopes | "Search this area" is an explicit tap, not auto-fire; the underlying area query is debounced (reuse the existing 350ms pattern). No request storm. | P6 |
| 14.4 | Panning with location permission off | Works fully — area is viewport-driven, not location-driven; proximity ordering within the area degrades to recency. | P4 |
| 14.5 | User pans back into the already-scoped area | "Search this area" hides; no redundant re-scope or refetch. | P3 |

---

## J15 — Recentering on my location ("Locate me") (Flow 15)

**Actor:** Authenticated user (esp. mobile). **Trigger:** Taps the "locate me" control.

**Happy path:** Tap → permission prompt if needed → map recenters on current location, "you are here" marker drops, discovery re-scopes to that area (as J14).

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 15.1 | Location permission denied | Control shows a brief inline hint ("enable location to recenter"); map stays on last/default viewport; never blocks the loop. | P4 |
| 15.2 | Location unavailable / times out | Same fallback as 15.1 with a "couldn't get your location — try again" affordance; existing viewport preserved. | P6, P4 |
| 15.3 | Location returns but is stale/low-accuracy | Recenter anyway; the marker reflects best-known position. No hard error for imperfect accuracy. | P4 |
| 15.4 | Permission revoked mid-session, then tapped again | Re-prompts (or shows OS-level guidance if hard-denied); consistent with 2.7 degradation. | P4 |

---

## J16 — Notes-enriched search (Flow 16)

**Actor:** Authenticated user. **Trigger:** Types a term in the search bar.

**Happy path:** Query matches place name/category **and** personal notes (own + mutual friends'). Note-matched results are prioritized and labeled with provenance ("matched your note" / "matched @handle's note"). Tap → Place detail.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 16.1 | Note index unavailable / search backend degraded | Fall back to name + category matching only, with a soft "searching notes is unavailable right now" note. Core search still works. | P9, P6 |
| 16.2 | Query matches only a friend's note | Result shows with "matched @handle's note" provenance; **never** the note text itself (A7). | P3 |
| 16.3 | Friend un-friended since their note was indexed | Their note drops out of the viewer's results on the next fetch (A5/A7); no stale leak. | P3 |
| 16.4 | No matches anywhere (name, category, or notes) | Standard empty state (per 2.1): "No places found for '[query]' near here." | P7 |
| 16.5 | Own note matches and a friend's note matches the same place | Show once; rank by own-note-first; provenance reflects the strongest (own) match. | P2 |

---

## J17 — Creating & curating a List (Flow 17)

**Actor:** Authenticated user. **Trigger:** "+ New List" on their profile or from "Add to List".

**Happy path:** Create List (name + optional description) → set visibility (defaults private) → add/remove/reorder places → List page reflects changes; public Lists are shareable.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 17.1 | List name empty or duplicate of an existing List | Inline validation; require a name; allow duplicate names but warn (Lists are id-keyed, not name-keyed). | P5 |
| 17.2 | Create/save fails (network) | Keep the form input; inline retry; no half-created List in the UI. | P6 |
| 17.3 | Add a place already in the List | No-op success; never a duplicate entry. | P2 |
| 17.4 | Remove a place from the List | Removes from this List only — the save and any other List memberships are untouched (A8); confirm copy makes this clear if the place is in no other List. | P5 |
| 17.5 | Delete a List that has places | Single confirm (P10); deleting the List does not unsave its places. The default "Want to Go" List cannot be deleted (only emptied/made private). | P10 |
| 17.6 | Reorder race in two tabs | Last write wins; stale tab refreshes on focus. | P3 |

---

## J18 — Adding a place to one or more Lists (Flow 18)

**Actor:** Authenticated user on a Place detail.

**Happy path:** Save action offers multi-select of Lists, defaulting to "Want to Go" → confirm → place appears as a card/pin and on each chosen List's page.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 18.1 | Plain bookmark with no List chosen | Lands in "Want to Go" by default — a save is never list-less. | P5 |
| 18.2 | Add-to-List request fails | Optimistic add + rollback with toast; the chosen Lists are preserved for retry. | P1, P6 |
| 18.3 | Add the same place to multiple Lists at once | All memberships created; idempotent per List. | P2 |
| 18.4 | Place becomes unavailable in Google Places after being listed | Stays in the List from cache with a "may have closed" notice; plan creation disabled (per 2.6); still removable. | P9 |

---

## J19 — List visibility & viewing another user's public List (Flow 19)

**Actor:** Owner toggling visibility; any viewer (incl. non-friend) opening a public List.

**Happy path:** Owner toggles public/private from the List page. Viewer opens a public List from a profile or shared link → sees title/description/places → can open any place into Place detail to save / add to a List / create a plan.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 19.1 | Owner makes a shared List private | The List leaves their profile for non-owners immediately; existing shared links stop resolving → viewer gets "this list is no longer available". | P3 |
| 19.2 | Non-friend opens a public List of a user with a private profile | The direct List link resolves to the List view only; the private profile itself stays gated — no other profile content leaks. | P3 |
| 19.3 | Viewer opens a List that was deleted | "This list is no longer available" state. | P3 |
| 19.4 | Empty public List | Friendly empty state on the List page; still a valid (if sparse) share target. | P7 |
| 19.5 | Toggle visibility fails (network) | Optimistic toggle + rollback with toast; state never silently diverges from the server. | P1, P6 |

---

## J20 — Viewing a profile's map (Flow 20)

**Actor:** Any user viewing a profile (own or another's).

**Happy path:** Profile opens on a map of the owner's places, scoped to the viewer's tier (non-mutual → public Lists' places; mutual → full saves). Tap a pin → Place detail → Save / Add to List / Create a plan.

| # | Sad path | Resolution | Pattern |
|---|---|---|---|
| 20.1 | No visible places for the viewer's tier | Friendly empty map state ("no public places yet"); bio and Lists section still render. | P7 |
| 20.2 | Many pins (a prolific saver) | Cluster/declutter at low zoom; tapping a cluster zooms in. | P4 |
| 20.3 | Private profile | Map hidden entirely; standard private-profile state (per Flow 11). | P3 |
| 20.4 | A pinned place is no longer available in Google Places | Pin renders from cache; Place detail shows "may have closed"; viewer can still save/add to List, plan creation disabled (per 2.6). | P9 |
| 20.5 | Relationship drops while the profile map is open | Next fetch re-scopes pins to the lower tier; higher-tier pins must not linger. | P3 |

---

## Cross-cutting sad paths (apply to every journey)

| # | Case | Resolution | Pattern |
|---|---|---|---|
| X.1 | JWT expires mid-session | Silent token refresh via Supabase; if refresh fails, soft re-auth prompt preserving current view and unsaved input. | P8 |
| X.2 | Full offline | Read what's cached; every mutation queues a visible "you're offline" state with input preserved; no silent drops. | P6 |
| X.3 | Realtime subscription drops | Panel falls back to refetch-on-focus + polling interval; reconnect transparently. User never told "realtime is down". | P4 |
| X.4 | Browser notification permission denied | All notifications remain Panel-only (which is the source of truth anyway). One-time gentle explainer, never re-nag. | P4 |
| X.5 | PostHog unreachable | Telemetry buffers/drops silently. Never user-visible. | P9 |
| X.6 | Server 500 on any read | Surface-level inline retry per widget, never a full-page error if any cached content can render. | P6 |
