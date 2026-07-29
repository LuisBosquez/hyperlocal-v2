# Spinoff Handoff — Core Principles & Architecture

## What this is

This document distills what we learned building **Hyperlocal** into a reusable starting point for a **simpler, leaner spinoff in the same domain** (social planning around real-world places). It intentionally omits Hyperlocal-specific implementation details (exact schemas, endpoint paths, file names) and keeps only what should survive a rewrite: product principles, the minimal core loop, and the technical/process patterns worth reusing.

Paste this into a new chat as the seed context for the spinoff. Treat it as a starting hypothesis, not a spec — the new project should feel free to diverge once it has its own users and constraints.

---

## The core loop (build this first)

Everything else is optional scaffolding around this loop:

1. **A visitable place** exists (sourced from a real-world places API, not user-generated) — cache it locally after first fetch.
2. **A user** saves a place, optionally attaching **a time** — this is the atomic unit of intent. Time is optional; a place-only save is already a complete, valid action.
3. **A one-way follow** lets you see what someone else has saved. A **mutual follow** (both directions) upgrades the relationship to "friends" and unlocks their timed intents.
4. **A single unified feed** surfaces: things to act on (notifications), upcoming intents (yours + friends'), and nearby saved places — ranked, not tabbed.
5. **Time is progressive, not required upfront.** An intent can exist with no time, a rough time-of-day, or an exact time — and can move between those states as the person's certainty increases.

If a spinoff nails just this loop, it's a complete, shippable product. Everything below either supports this loop or was a later addition worth deferring.

## Features to defer

These were real, validated features in Hyperlocal, but they're second-order — build the core loop first, prove it, then decide if you need them:

- **Collections/lists** of saved places (beyond the flat saved-places feed)
- **Full-text/notes search** over personal annotations
- **Collaborative proposals** — letting a non-owner suggest a time for someone else's intent, with accept/decline/expiry semantics
- **Area-scoped search** ("search this area" on a panned map) and a dedicated profile map view
- **Signals/discovery pipeline** — category or city-wide browsing beyond your own social graph
- **Rich reminder cadences** (day-before/morning-of nudges, refine-your-approximate-time prompts)

Each of these is a well-scoped, self-contained feature you can bolt onto the core loop later without re-architecting it — that separability is itself a sign the core loop was designed correctly.

---

## Product principles (generalized)

These are the reusable *whys*, stripped of Hyperlocal's specific nouns:

1. **Progressive commitment over upfront specificity.** Never force full specification before something becomes real. Let a coarse version (a place with no time; a "sometime this afternoon") be a complete, valid state — and let it sharpen later. When you're tempted to make a field required, ask whether a deferred or coarser version is still useful on its own.

2. **Reciprocity-gated visibility.** A one-directional action (follow) reveals a low-stakes layer (what someone publicly saved). Only when it becomes mutual does the higher-commitment layer (their plans, their full activity) unlock. This gives relationships a natural, non-awkward on-ramp with no explicit permission dialogs.

3. **Ownership survives disengagement.** If the person who started something steps back (cancels, goes inactive), it shouldn't vanish for everyone who already opted in. Design cancellation/departure as soft — subtract the owner, don't delete the thing.

4. **Opt-in over RSVP.** Default to "everyone's invited," with a lightweight, low-commitment signal (interested) sitting below the real commitment line (joined). Avoid binary invite lists; let intent be visible and legible before anyone has to commit.

5. **Context-aware defaults, not configuration screens.** Use ambient signals — time of day, place hours, weather, proximity — to pre-filter and suggest, instead of exposing settings. Only offer valid choices (e.g. only in-hours time slots) rather than validating after the fact.

6. **Utility framing, not platform framing.** The product should feel like a useful tool a friend found, not a new social network to join. This is a scope-discipline tool as much as a tone one: if a proposed feature makes the product feel heavier or more "platform-y," that's a reason to cut it or defer it.

---

## Architecture & process principles

These are domain-agnostic — they'd apply to a spinoff in any domain, not just social planning.

1. **State machines for anything with a lifecycle.** Model it explicitly: named states, transitions, guards — in one canonical place. Derive display flags (e.g. "needs attention") from state; never store them as separate, driftable booleans.

2. **Decision worksheets for ambiguous product calls.** When a feature has many open UX questions, don't resolve them ad hoc while coding. Write a table: question → options considered → resolution + rationale → status. Only write the technical spec once every row is resolved. This produces an audit trail and stops "figuring it out while building" from becoming silent scope creep.

3. **Offline-first local dev.** Build a lightweight local shim (e.g. SQLite mirroring your real schema) so anyone can clone the repo and run the full stack with zero external accounts or API keys. The schema duplication cost is worth the onboarding and CI speed.

4. **Serverless-by-default backend.** A small, unopinionated REST framework deployed to a pay-per-request FaaS platform costs near-zero at low traffic and needs no ops. Right default for anything pre-product-market-fit; revisit only once traffic/latency actually demands it.

5. **Managed backend-as-a-service for auth + database + realtime.** One provider covering session management, OAuth, migrations, and websocket infrastructure removes an entire category of early-stage work. Swap out only when you concretely hit its limits — not preemptively.

6. **Static SPA frontend.** Ship it as static files. Cheap, cacheable, and portable across hosts.

7. **Separate product docs, tech docs, and code — explicitly.** A `pm/`-style folder holds the *why* (vision, user stories, journeys, specs); a `tech/`-style folder holds the *how* (architecture, schema, API design); code lives separately. This keeps product reasoning discoverable without spelunking through source, and gives whoever (or whatever) touches the code next a clear place to keep docs in sync with changes.

8. **One canonical doc per cross-cutting concern.** If a piece of logic (e.g. a notification/reminder system) touches many files, document it in exactly one place, referenced from everywhere else. Prevents "what the code does" and "what's documented" from drifting apart.

---

## Tech stack (named, with rationale — swap freely)

**Frontend**
- **React + Vite + TypeScript** — fast dev loop, typed, large ecosystem, no framework lock-in.
- **Tailwind CSS** — utility-first styling avoids CSS file sprawl; trivial dark-mode via variants.
- **Zustand** — minimal global state for client-only concerns (UI state, map viewport); skip Redux-style boilerplate.
- **React Query (TanStack Query)** — owns server-state caching, invalidation, and loading/error states; avoids hand-rolled fetch logic scattered through components.
- **A map SDK (e.g. Mapbox GL JS)** — only if the product has a map surface; otherwise omit entirely.

**Backend**
- **Flask (Python)** — small, unopinionated REST framework; fast to iterate, easy to reason about.
- **Mangum (or equivalent WSGI/ASGI adapter)** — lets you write a normal Flask app and deploy it serverless without rewriting it as Lambda handlers.
- **AWS Lambda (or equivalent FaaS)** — pay-per-request, zero idle cost, no server management.

**Data & auth**
- **A managed Postgres + Auth + Realtime platform (e.g. Supabase)** — one service instead of three; OAuth-ready out of the box.
- **OAuth via the managed auth provider** — fastest path to real auth without building your own session/credential system.

**External data**
- **A domain-appropriate places/data API** (e.g. Google Places), cached locally after first fetch — never treat the third-party API as your database; treat it as a one-time enrichment source.

**Analytics**
- **PostHog (or equivalent)** — event tracking and funnels from day one; cheap to self-host later if needed.

---

## How to use this doc

Start the new project's first conversation with: *"Here's a handoff doc from a related project — use its principles and stack as defaults, but treat the core loop as the actual spec to build first."* Let the new project's own constraints (team size, timeline, target platform) override anything here that doesn't fit.
