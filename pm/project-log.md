# Hyperlocal v2 — Project Log

_Last updated: 2026-05-15_

---

## Product Overview

**Hyperlocal** is a mobile-first social planning web app. The core thesis: social plans fail because they demand too many simultaneous decisions (who, where, when) before anyone is ready to commit. Hyperlocal separates intent from commitment — users save places they're interested in, optionally attach a time, and let friends discover and opt-in organically.

**Tagline:** _"Create community anywhere, anytime."_

### Core Concepts

| Concept | Definition |
|---|---|
| **Place** | A visitable POI sourced from the Google Places API. No user-generated locations. |
| **Plan** | A Place + an optional time. Lighter than an "event" — it's an open invite, not a commitment request. Survives its creator: if the organizer cancels, the plan persists for others who joined. |
| **User** | Has a public handle. Can follow others. |
| **Follow (one-way)** | Follower can see the followed user's saved places. |
| **Friends (mutual follow)** | Both users can see each other's Plans. |

### Target User

People with an active social life who struggle with the overhead of coordination — the "we should hang sometime" that never happens. Specifically those who want flexibility, hate committing too early, and use ephemeral channels (Instagram stories, newsletters, word of mouth) to discover things to do.

### Key Differentiators

- Plans are **opt-in invites**, not scheduled events requiring RSVP
- Flexibility is a first-class feature — no pressure to decide who, where, and when all at once
- Plans **survive their creator** — the community owns the plan, not just the organizer
- Context-aware defaults: smart time suggestions based on opening hours, time of day, weather, location

---

## Current Project Status

**Phase: M0 — Ready for Dev Setup**

As of May 15, 2026, all 5 blocking pre-development questions have been resolved. Product documentation is complete, the tech stack is decided, and success metrics are defined. The project is ready to begin M0 dev environment setup — no remaining blockers.

| Area | Status |
|---|---|
| Product vision | Done |
| Product FAQ | Done |
| User stories | Done (11 stories covering core scenarios) |
| MVP-1 specification | Done — last updated 2026-03-04 |
| Tech stack decision | **Done** — React SPA · Flask on Lambda · Supabase · Mapbox · PostHog |
| Open spec questions | **Resolved** — all 5 blocking questions answered 2026-05-15 |
| Success metrics | **Done** — 7 launch targets + 9 telemetry events defined |
| Dev environment setup | **Not started** (next action) |
| Any code | **None** |

---

## Outstanding Tasks Checklist

Tasks are sorted: **blocking items first**, then by priority within each group.

### Blocking — Must resolve before development begins

- [x] **Choose tech stack** — React SPA · Flask on Lambda (Mangum) · Supabase (Postgres + Auth + Realtime) · AWS Amplify · Mapbox GL JS · PostHog ✓
- [x] **Resolve: ambient visibility model / invite timing logic** — save = interest signal; plans surface to friends organically based on mutual follow; no explicit invite step ✓
- [x] **Resolve: follow request acceptance** — following is immediate, no approval required ✓
- [x] **Resolve: map visibility of saved places** — one-way followers see saved places on map; Plans visible only to mutual friends ✓
- [x] **Define success metrics** — 7 quantitative launch targets + 9 telemetry events defined ✓

### High Priority

- [ ] **Set up dev environment and project scaffold** — repo, CI, linting, build pipeline _(blocks all development)_
- [ ] **Implement Google Auth** — sign-in, handle creation, session management _(blocks all authenticated flows; flow 1)_
- [ ] **Integrate Google Places API** — place search, place detail fetching, map pins _(blocks map view and place-saving; flows 2, 3)_
- [ ] **Build map view** — main interface with pins for nearby places + search bar _(blocks The Panel context; flow 2)_
- [ ] **Build The Panel** — unified scrollable sidebar with Notification/Plan/Place cards + filter pills _(blocks place saving, plan creation, notifications UX; flow 9)_
- [ ] **Build place detail view** — address, metadata, save/plan actions, Google Maps link _(blocks save and plan flows; flows 3, 4)_
- [ ] **Implement place saving with notes** — save/unsave, personal notes, persistence _(blocks plan creation; flows 3.1, 3.2)_
- [ ] **Implement social graph** — follow/unfollow, mutual follow detection, profile lookup _(blocks friend visibility features; flows 6, 13)_
- [ ] **Build plan creation and management** — create plan with date/time, update plan, cancel plan _(blocks join flow; flows 4.1, 4.2, 5)_
- [ ] **Build user profile page** — public page with saved places; plans visible to mutual followers only _(blocks social flows; flows 7, 11)_
- [ ] **Implement plan join flow** — joining a friend's plan, viewing attendees, visiting attendee profiles _(flow 8)_
- [ ] **Build in-app notification system** — browser alerts for follow requests, reminders, friend plan alerts _(flow notifications in The Panel)_
- [ ] **Build unauthenticated landing page** — value prop, sign-in CTA, browsable without account _(flow 0)_

### Medium Priority

- [ ] **Implement contextual place suggestions** — time-of-day, weather, location-based recommendations shown in The Panel _(flow 12)_
- [ ] **Friends' places on map** — show friends' saved places as overlay on main map _(flow 10)_
- [ ] **Profile social links** — Instagram, Twitter, Facebook on user profile _(flow 11)_
- [ ] **Complete target users/goals sections** in `pm/1-product-vision.md` _(currently WIP placeholders)_

### Low Priority / Polish

- [ ] **Smart time defaults** — only suggest times within opening hours, only future times, auto-reminders
- [ ] **Privacy controls** — profile privacy settings _(flow 11)_
- [ ] **Responsive/mobile-first polish** — ensure all surfaces feel native on mobile
- [ ] **Empty states** — first-run experience for new users with no friends/places yet

---

## Next Milestones

The path to MVP-1 launch, in order:

### M0 — Foundations (Pre-dev decisions)
Resolve all blocking open questions. Choose tech stack. Define success metrics. Set up dev environment and scaffold.

### M1 — Auth + Infrastructure
Google auth working end-to-end. User handle creation flow. Database schema for Users, Places, Plans, Follows. Google Places API integration plumbed.

### M2 — Core Place UX
Map view with place search and pins. Place detail view. Save/unsave places with notes. Basic list view (proto-Panel, no social content yet).

### M3 — Social Graph
Follow/unfollow. Mutual follow detection. User profile pages. Friend places visible on map and in Panel.

### M4 — Plans
Create/update/cancel plans. Plan cards in The Panel. Join a friend's plan. View attendees.

### M5 — Notifications + Suggestions
In-app notification system (browser alerts). Contextual place suggestions in Panel. Auto-reminders for upcoming plans.

### M6 — Landing + Polish
Unauthenticated landing page. Profile social links. Mobile-first polish pass. Empty states and onboarding. Accessibility review.

### M7 — MVP Launch
Hit defined success metrics. Ship to initial users.
