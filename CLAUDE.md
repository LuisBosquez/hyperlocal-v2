# Hyperlocal v2 — Claude Workspace

## What this is

**Hyperlocal** is a mobile-first social planning web app. The core idea: instead of coordinating a plan from scratch (who, where, when — all at once), users save places they're interested in and optionally attach a time. Friends can discover and opt-in to each other's plans organically.

Tagline: *"Create community anywhere, anytime."*

## Core concepts

- **Place** — A visitable point-of-interest sourced from the Google Places API. No user-generated locations.
- **Plan** — A Place + an optional time. Not an "event" — it's lighter, opt-in, and survives its creator. If the organizer cancels, the plan lives on for others.
- **User** — Has a public handle. Can follow others. Following back = friends, which unlocks Plan visibility.
- **Follow (one-way)** — You can see a user's saved places.
- **Friends (mutual follow)** — You can see each other's Plans.

## Product principles

- Decisions don't need to be made in a rush — flexibility is the key differentiator
- Smart, human defaults (only schedule during opening hours, only future times, auto reminders)
- Everyone is welcome by default — plans are open invites to friends
- Always use context (location, time of day, weather) to create relevant experiences
- This should feel like a useful utility a friend found, not a grand new platform

## MVP-1 scope

Full spec: [pm/specs/mvp-1.md](pm/specs/mvp-1.md)

Key surfaces:
- **Map view** — main interface with pins for nearby/saved places + search bar
- **The Panel** — scrollable sidebar list: notifications → upcoming plans → saved places nearby; filterable by pills
- **Place detail** — address (links to Google Maps), metadata, save/plan actions
- **User profile** — public page with saved places; plans visible to mutual followers only
- **Notifications** — browser alerts for MVP-1, email/SMS later

In scope: Google auth, social graph (follow/unfollow), place saving with personal notes, plan creation/cancellation, proactive contextual recommendations (meal times, weather, etc.), unauthenticated landing page.

Out of scope for MVP-1: personalized recommendations, recurring plans, email invites, email/SMS notifications, user-generated places.

## Project structure

```
pm/                         Product management docs
  1-product-vision.md       Vision, problem statement, future horizons
  2-product-faq.md          Supplementary product context
  3-user-stories.md         User stories
  specs/
    mvp-1.md                Full MVP-1 specification (primary reference)
  wh3_whitepaper.pdf        Background whitepaper
```

## Tech stack

> Not yet decided. Update this section when the stack is chosen.

## Working in this repo

- The `pm/` directory is the source of truth for product decisions. Read relevant specs before proposing implementation approaches.
- When the stack is established, add conventions, commands, and architecture notes here.
