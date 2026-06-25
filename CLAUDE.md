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
frontend/                   React SPA (Vite + React 18 + TS + Tailwind)
  src/{components,pages,hooks,store,lib,types}
backend/                    Flask API (Python 3.12, AWS Lambda via Mangum)
  app/{routes,jobs,utils}, devdb.py (offline SQLite dev layer)
pm/                         Product management docs
  1-product-vision.md       Vision, problem statement, future horizons
  2-product-faq.md          Supplementary product context
  3-user-stories.md         User stories
  4-user-journeys-mvp1.md   MVP-1 user journeys
  specs/
    mvp-1.md                Full MVP-1 specification (primary reference)
    materialization-workflow.md   Plan materialization / nudge workflow
  wh3_whitepaper.pdf        Background whitepaper
tech/                       Technical design docs (01–09)
  01 architecture · 02 database schema · 03 infrastructure · 04 API design
  05 realtime · 06 frontend · 07 UI components · 08 edge cases · 09 materialization
```

## Tech stack

- **Frontend** — React 18 + Vite + TypeScript + Tailwind CSS. State via Zustand + React Query. Mapbox GL JS for the map. Deployed as a static SPA.
- **Backend** — Flask (Python 3.12) deployed to AWS Lambda via Mangum. REST API under `/api/v1/`.
- **Data & auth** — Supabase (Postgres + Auth + Realtime). Google OAuth via Supabase Auth.
- **Places** — Google Places API (source of all places; results cached locally).
- **Analytics** — PostHog.
- See [README.md](README.md) and [tech/01-system-architecture.md](tech/01-system-architecture.md) for details.

## Working in this repo

- The `pm/` directory is the source of truth for product decisions. Read relevant specs before proposing implementation approaches. Key references: [pm/specs/mvp-1.md](pm/specs/mvp-1.md), [pm/4-user-journeys-mvp1.md](pm/4-user-journeys-mvp1.md), [pm/specs/materialization-workflow.md](pm/specs/materialization-workflow.md).
- The `tech/` directory holds the technical design docs; consult the relevant one before changing architecture, schema, or APIs.
- **Dev commands** (see [README.md](README.md) for full setup, incl. zero-config offline mode):
  - Backend: `cd backend && flask --app app run --port 5001 --debug`
  - Frontend: `cd frontend && npm run dev` (http://localhost:5173)
  - Vite proxies `/api` → `http://localhost:5001`, so no CORS config is needed locally.
