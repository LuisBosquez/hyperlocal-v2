# MVP — Map Discovery & Social Layer

> **Status:** Approved for build
> **Last updated:** 2026-07-02
> **Release:** MVP (post-Alpha hardening) — deliver differentiated value through the Map UI
> **Platform:** Mobile-first web app
> **Builds on:** Alpha (MVP-1) + Discovery & Curation (Flows 14–20)

---

## Introduction

The prototype proved the mechanics: places can be saved, plans can be made and joined, the social graph gates visibility. This MVP turns those mechanics into **differentiated value delivered through the Map UI**. The map is not a backdrop — it is the product. Every discovery level, every recommendation, and every friend signal must be legible *on the map* and actionable *in one or two taps*.

**The thesis:** discovery has levels, and the UI should meet users at the level they're operating on:

- **Level 1 — Pin discovery.** Tap a marker, see the place, save it or start a plan. The entry-level experience for new users, fed by search and suggestions.
- **Level 2 — Contextual recommendations.** The system proposes places using clear, legible context (time of day, weather, proximity). The user always knows *why* something is being recommended — recommendations are actionable, not mysterious.
- **Level 3 — Searched discovery.** Natural-language and category search, tied to the map. Results aren't just a list — selecting a result moves the map, and category results ("coffee near me") visualize *up to 5* nearby options at once, zooming out as far as needed to show them.

Above all: **user-generated data comes first.** When friends' plans and saved places exist, they beat system recommendations everywhere — bigger markers, top billing in the Panel, and the system recommendations politely step aside.

---

## Core Principles

- **The map is the interface.** Search results, recommendations, plans, and check-ins all resolve to something visible on the map.
- **Context must be legible.** Every system recommendation states its reason ("Lunchtime", "Rainy weekend"). No black-box suggestions.
- **User-generated beats system-generated.** Friends' plans and liked places always outrank recommendations. The Panel shows *only* user-generated objects; system suggestions live on the map surface and are opt-in inside check-in contexts.
- **Searching another city means planning ahead.** Location change is a deliberate mode switch: contextual recommendations pause, and the UI assumes a future plan.
- **Every object is shareable.** Plans, lists, and places all mint share links — sharing is the collaboration engine.
- **Every interaction teaches the system.** List names, notes, and searches are collected (as consented product telemetry) to fuel future contextual recommendations.

---

## In Scope (build items)

### 1. Place discovery (Level 1) — *refine existing*
Marker tap → place detail overlay (existing). Markers stay the primary object; **default Mapbox POI icons are removed in both themes** so our pins are the only interactive objects on the map.

### 2. Recommended places (Level 2) — *refine existing*
The contextual strip (Flow 12) stays on the map overlay with its tagline ("Lunchtime — here's what's good nearby · 📍 Capitol Hill"). Recommendations are proximity-ranked within the scoped area and clearly labeled. They are **not** shown in the Panel (executive decision — too noisy), and they are **suppressed** in remote-city mode and de-emphasized (opt-in) in the check-in context.

### 3. Searched places (Level 3) — natural-language + category search *(new)*
- `/places/search` gains **category groups**: when the query reads as a category intent ("coffee", "coffee shops with wifi", "somewhere for a rainy day"), the response includes a group of **up to 5** places in proximity, expanding radius when the area is thin.
- Selecting a **place result** flies the map to it and opens the detail.
- Selecting a **category group** highlights all its places on the map and fits the viewport around them (zooming out as far as needed).
- Google Text Search continues to power true NL matching when a key is present; the local cache powers the offline/degraded path.

### 4. Change location — remote-city planning mode *(new)*
- The search bar also matches **cities** (`/geo/forward`). When the query looks like a city, a distinct "Plan ahead in {city}" row appears.
- Selecting it re-centers and re-scopes the map to the city and enters **remote mode**: a persistent banner ("Browsing {city} — planning ahead · Back to my area"), contextual recommendations suppressed, search biased to the city.
- Assumption codified: remote-city browsing is for **future plans and list-building** — the plan composer works normally; "Today" simply isn't the expected path.

### 5. Lists + check-in *(new surfacing over existing lists)*
- **Check-in card:** when the scoped area changes to a new neighborhood/city (physically via locate-me or virtually via search-this-area/city switch) and the user has saved places there, the map overlay leads with "You've saved N spots around {area}" listing them. System suggestions collapse behind a friendly "Show suggestions too" link in this state.
- **Lists home:** a dedicated `/lists` view of all my lists (create, open, share) reachable from the Panel header — saved-places lists finally have a home that isn't buried in the profile.
- Lists remain shareable/public (Flow 19) — share links now resolve correctly to the list page.

### 6. User-generated data first — plan markers *(new)*
- New `/plans/map` endpoint: pins for my plans + mutual friends' active, upcoming plans in the scoped area.
- Plan markers are **visually louder** than place pins (accent color, avatar badge). Hover/tap opens a card: who's organizing, when (or "needs a time"), and actions — **Join**, **Save place for later**, open details. Joined users can propose times (existing Flows 4.3/4.4).

### 7. Growing backend capabilities — discovery-signals pipeline *(new)*
- New `discovery_signals` table: one row per user-generated signal — list names (create/rename), personal notes, search queries, category searches, city searches, contextual clicks, plan joins — each with location/time context.
- Written server-side (soft-fail, never blocks a request) from the existing endpoints. This is the corpus that future contextual recommendation models train on.

### 8. Check-in scenario — "open to plans" signal *(new)*
- A user can flip **"I'm down for plans today"** (visible toggle in the Panel). The signal auto-expires at end of day.
- When a friend composes a plan and picks **Today**, the composer hints "N friends are looking for plans today" with an include/exclude choice; including them notifies those friends when the plan is created.

### 9. UI cleanup — the Panel *(rework)*
- **Collapsible on desktop** (slides away to a slim edge toggle; map becomes full-bleed).
- **Sectioned for scanability:** Notifications → Friends' plans → Friends' places → Your saved places. Clear headers, most actionable objects first.
- **No system-recommended places** in the Panel (server already excludes them; the UI contract is now explicit).
- **Affirmative save:** option UIs close via a Save/Done button, not only via ✕ — starting with "Add to list".

### 10. Share links everywhere *(extend existing)*
- Plans: share available to organizers **and** joiners/viewers (was organizer-only).
- Places: new — share any place via invite link.
- Lists: existing share; the invite resolver now returns list targets so links land on the list page.

### 11. Friends view *(new)*
- A **Friends** sheet on the profile (self view): Friends / Followers / Following tabs, each row linking to the profile. Keeps the sidebar unloaded.

---

## Out of Scope

- Personalized (per-user-model) recommendations — the signals pipeline only **collects** in this release.
- True elastic-search infrastructure — category grouping + Google Text Search approximate NL adequately at this scale.
- Real geocoding service for city search — a curated city table serves dev/MVP; production can proxy a geocoder later without API changes.
- Push/email notifications (unchanged from Alpha).
- "Want to Go" naming collision (still open, tracked in Discovery & Curation notes).

---

## Key decisions

| # | Decision |
|---|---|
| MD-1 | Contextual recommendations never appear in the Panel; they live on the map overlay only, and are opt-in inside a check-in context. |
| MD-2 | Remote-city mode suppresses contextual recommendations entirely — remote browsing is future-planning by definition. |
| MD-3 | Category search returns at most **5** places, nearest-first, expanding radius rather than returning empties. |
| MD-4 | Plan pins outrank place pins visually; a place with an active friend plan renders as a plan pin, not a place pin. |
| MD-5 | The open-to-plans signal expires at the end of the local day; no ambient presence is ever shown beyond it. |
| MD-6 | Signal collection is server-side and soft-fail; no signal write may ever break a user-facing request. |
| MD-7 | Share links for places/plans/lists all use the existing `invite_links` token flow — one mint path, one resolve path. |
| MD-8 | The Panel's desktop collapse state persists per device (localStorage), like dark mode. |

---

## API additions

| Endpoint | Purpose |
|---|---|
| `GET /places/search` | + `groups[]` (category groups: label, category, up to 5 places) alongside `results[]` |
| `GET /geo/forward?q=` | City lookup → `[{name, region, lat, lng, bbox}]` (curated table; Google fallback) |
| `GET /plans/map?lat&lng&bbox` | Plan pins (mine + mutual friends', active + upcoming, area-scoped) |
| `PUT /users/me/signal` | Set/clear `open_to_plans` (auto-expiring) |
| `GET /users/me/friends/open-today` | Mutual friends with an active open-to-plans signal |
| `POST /plans` | + `invite_open_friends: bool` — notify open friends on Today plans |
| `POST /invite-links` | + `place_id` target (plans + generic already exist) |
| `GET /invite-links/:token` | + resolves `list_id` and `place_id` targets |

## Schema additions (migration 006)

- `discovery_signals` (id, user_id, kind, text, place_id, context jsonb, created_at)
- `users.open_to_plans_until timestamptz`
- `invite_links.place_id uuid`

## Telemetry additions

`city_search`, `category_search_shown`, `category_group_opened`, `checkin_card_shown`, `open_to_plans_set`, `open_friends_invited`, `plan_pin_opened`, `plan_joined_from_map`, `place_shared`, `panel_collapsed`.

## Success metrics

| Metric | Target |
|---|---|
| Category-group open rate | ≥30% of searches that show a group result in a group open |
| Remote-city sessions ending in a save or plan | ≥40% |
| Check-in card → saved-place open rate | ≥35% |
| Plan-pin hover → join conversion | ≥15% |
| Open-to-plans adoption | ≥20% of WAU set the signal at least once/week |
| Share links minted per WAU | ≥0.5 |

## Open questions

1. Should the check-in card also surface friends' saves in the area (not just your own)? (Leaning yes, next iteration.)
2. Does the open-to-plans signal deserve reciprocal visibility ("3 friends are down today") outside plan composition? Deferred — composer-only for MVP.
3. City table coverage vs. real geocoding — revisit when a non-seeded city shows up in `city_search` signals with no match.
