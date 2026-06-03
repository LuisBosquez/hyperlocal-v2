# System Architecture — Hyperlocal MVP-1

> **Audience:** AI agents and engineers implementing discrete slices of the stack.
> **Status:** Design-complete, pre-implementation.
> **Last updated:** 2026-05-15

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                 │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        React SPA (JavaScript)                         │  │
│  │                                                                        │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │ Mapbox GL JS│  │ Supabase JS  │  │ PostHog  │  │   React UI   │  │  │
│  │  │ (map tiles) │  │ (auth+RT sub)│  │ (events) │  │  Components  │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └────┬─────┘  └──────┬───────┘  │  │
│  └─────────┼────────────────┼───────────────┼────────────────┼──────────┘  │
└────────────┼────────────────┼───────────────┼────────────────┼─────────────┘
             │                │               │                │
             ▼                │               ▼                ▼
    ┌─────────────┐           │      ┌──────────────┐  ┌─────────────────────┐
    │  Mapbox CDN │           │      │  PostHog US  │  │    AWS Amplify CDN  │
    │ (tile serve)│           │      │  (analytics) │  │  (serves SPA assets)│
    └─────────────┘           │      └──────────────┘  └─────────────────────┘
                              │
             ┌────────────────┼──────────────────────────┐
             │                │                          │
             ▼                ▼                          ▼
   ┌──────────────────┐  ┌────────────────────┐  ┌──────────────────────┐
   │  Supabase Auth   │  │  Supabase Realtime │  │   AWS API Gateway    │
   │ (Google OAuth,   │  │  (WebSocket, CDC   │  │   (REST, CORS,       │
   │  JWT issuance)   │  │   from Postgres)   │  │    throttling)       │
   └────────┬─────────┘  └────────────────────┘  └──────────┬───────────┘
            │                      ▲                         │
            │                      │                         ▼
            │             ┌────────┴────────┐      ┌─────────────────────┐
            │             │                 │      │   AWS Lambda        │
            │             │  Supabase       │◄─────│  Python Flask app   │
            └────────────►│  Postgres       │      │  (via Mangum ASGI)  │
                          │  (us-east-1)    │      │                     │
                          │                 │      │  ┌───────────────┐  │
                          └─────────────────┘      │  │ Google Places │  │
                                                   │  │ API (outbound)│  │
                                                   │  └───────────────┘  │
                                                   │  ┌───────────────┐  │
                                                   │  │ OpenWeather   │  │
                                                   │  │ API (outbound)│  │
                                                   │  └───────────────┘  │
                                                   │  ┌───────────────┐  │
                                                   │  │ PostHog Python│  │
                                                   │  │ (server events│  │
                                                   │  └───────────────┘  │
                                                   └─────────────────────┘
```

### Layer Summary

| Layer | Technology | Role |
|---|---|---|
| CDN / Static hosting | AWS Amplify | Serves the compiled React SPA (HTML, JS, CSS) globally |
| SPA | React (Vite) | All UI rendering, routing, state management |
| Map rendering | Mapbox GL JS | Renders the interactive map, tiles served from Mapbox CDN |
| Auth session | Supabase JS client | Manages OAuth redirect, stores/refreshes JWT in memory |
| Realtime | Supabase JS client | WebSocket subscription for Panel live updates and notifications |
| API | Python Flask on Lambda | All business logic, data reads/writes, external API calls |
| ASGI adapter | Mangum | Translates Lambda event/context to ASGI, wraps Flask via asgiref |
| API routing | AWS API Gateway | Routes HTTP requests to Lambda, enforces CORS, handles throttling |
| Database | Supabase Postgres (us-east-1) | Single source of truth for all persistent data |
| Auth provider | Supabase Auth | Google OAuth flow, JWT issuance, session refresh |
| Realtime broker | Supabase Realtime | PostgreSQL logical replication → WebSocket broadcast |
| Place data | Google Places API | Searched and fetched server-side by Flask, cached in `places` table |
| Weather data | OpenWeatherMap API | Fetched server-side by Flask for contextual suggestions (Flow 12) |
| Analytics | PostHog | Client-side (browser events) + server-side (Flask events) |

---

## 2. Data Flows

### 2.1 Page Load

```
1. Browser requests https://app.hyperlocal.xyz
2. Amplify CDN responds with index.html + JS bundle (cached)
3. React app initializes; Supabase JS client checks localStorage for session
4. If session exists → validate JWT expiry
   a. If expired → Supabase Auth refresh endpoint called automatically
   b. New access token stored in memory
5. Authenticated React fetches:
   a. GET /api/me        → user profile data
   b. GET /api/panel     → Panel cards (notifications + plans + places)
   c. GET /api/map/places → user's saved places + friend places for map pins
6. Mapbox GL JS initializes with public token → begins loading map tiles from Mapbox CDN
7. React subscribes to Supabase Realtime channels (see 2.6)
8. UI renders: map + Panel displayed simultaneously
```

### 2.2 Authentication (New User — Google OAuth)

```
1. User clicks "Sign in with Google"
2. React calls supabase.auth.signInWithOAuth({ provider: 'google' })
3. Browser redirects to Google OAuth consent screen
4. Google redirects back to: https://<project>.supabase.co/auth/v1/callback?code=...
5. Supabase Auth exchanges code for Google tokens, creates/updates auth.users record
6. Supabase redirects browser to: https://app.hyperlocal.xyz/#access_token=...
7. Supabase JS client parses hash fragment, stores session (access_token + refresh_token)
8. React detects onAuthStateChange event
9. React calls GET /api/me → Flask checks if user exists in public.users table
   a. If new user (no handle yet) → return { new_user: true }
   b. React redirects to handle-creation screen (Flow 1)
10. User sets handle → POST /api/me/handle { handle: "..." }
11. Flask inserts into public.users, returns full user object
12. React redirects to main map view
```

### 2.3 Map Load and Place Pins

```
1. Mapbox GL JS renders base map tiles (served by Mapbox CDN, no server involvement)
2. React determines current viewport bounds (lat/lng bounding box)
3. React calls GET /api/map/places?bounds={sw_lat},{sw_lng},{ne_lat},{ne_lng}
4. Flask:
   a. Verifies JWT from Authorization header
   b. Queries user's own saved places within bounds (user_places JOIN places)
   c. Queries mutual friends' saved places within bounds
   d. Returns list of place objects with owner info and pin type
5. React renders map pins:
   - Own places: solid color pin
   - Friends' places: different style/color with friend avatar
6. React separately calls GET /api/panel/suggestions?lat=...&lng=...
   for contextual Place cards (uses OpenWeatherMap + time-of-day logic in Flask)
```

### 2.4 Plan Creation

```
1. User taps "Create Plan" on a Place detail view
2. React opens plan creation UI (date pill selector → time selector)
3. User selects date; optionally selects time or taps "Skip for now"
4. React calls POST /api/plans with:
   {
     place_id: "uuid",
     plan_date: "2026-06-01",   // null if truly timeless
     plan_time: "19:00",        // null if skipped
     is_timeless: false
   }
5. Flask:
   a. Verifies JWT → g.user_id
   b. Validates place exists in DB
   c. Validates plan_time is within place opening_hours (if provided)
   d. Validates plan_date is not in the past
   e. Inserts into plans table
   f. If place not already saved by user → inserts into user_places (auto-save)
   g. Fires PostHog server-side event: plan_created
   h. Returns plan object
6. React updates Panel: Plan card added at top (above Place cards)
7. Mutual friends see the new Plan card on their next Panel load or via Realtime
```

### 2.5 "Interested" Tap

```
1. User taps "Interested" on a friend's Plan card in The Panel
2. React calls POST /api/plans/{plan_id}/interest
3. Flask:
   a. Verifies JWT → g.user_id
   b. Verifies plan is readable by this user (mutual friend of organizer)
   c. Inserts into plan_interests (user_id, plan_id) — idempotent (UNIQUE constraint)
   d. Fires PostHog event: plan_interested
   e. Returns updated interest_count
4. Supabase Realtime detects INSERT on plan_interests table
5. Organizer's connected client receives Realtime event on channel:
   realtime:plan:{plan_id}
6. Organizer's React updates the interest count on their Plan card in real time
```

### 2.6 Realtime Panel Update

```
Subscriptions established at app startup (after auth):

Channel 1: "notifications:{user_id}"
  - Listens for INSERTs on notifications table WHERE user_id = auth.uid()
  - React prepends new Notification card to Panel top

Channel 2: "plans:friends"
  - Listens for changes to plans table from users this client follows
  - React updates existing Plan cards or adds new ones

Channel 3: "plan_interests:{plan_id}" (opened when viewing a plan)
  - Listens for INSERTs on plan_interests for this plan
  - Updates interest count on plan detail view

On disconnect/reconnect: React re-fetches GET /api/panel to catch any missed events
```

---

## 3. Component Ownership Table

| Concern | Owner | Notes |
|---|---|---|
| **UI rendering** | React SPA | All screens, map, Panel, modals |
| **Client-side routing** | React Router (within SPA) | Hash or history routing |
| **JWT storage** | Supabase JS client | In-memory; refresh token in localStorage |
| **OAuth redirect flow** | Supabase Auth | Handles Google OAuth code exchange |
| **JWT issuance & refresh** | Supabase Auth | RS256 signed; expiry 1 hour |
| **JWT verification** | Flask middleware | Uses Supabase JWT secret (HS256) |
| **Map tile rendering** | Mapbox GL JS | Tiles served from Mapbox CDN, token-gated |
| **Place search** | Flask → Google Places API | Server-side; key never exposed to client |
| **Place caching** | Flask → `places` table | Upsert on first search; reduce Google API calls |
| **Weather data** | Flask → OpenWeatherMap | Server-side; powers Flow 12 contextual suggestions |
| **Business logic** | Flask | Plan validation, opening hours check, friend visibility |
| **Data persistence** | Supabase Postgres | Single source of truth |
| **Row-level access control** | Supabase RLS (defense-in-depth) | Primary enforcement is Flask; RLS is secondary |
| **Realtime broadcast** | Supabase Realtime | CDC from Postgres WAL → WebSocket to clients |
| **Analytics (client)** | PostHog JS | Page views, UI events |
| **Analytics (server)** | PostHog Python (in Flask) | Server-confirmed events (plan_created, plan_joined) |
| **Static asset delivery** | AWS Amplify CDN | index.html + JS/CSS bundle |
| **HTTP routing** | AWS API Gateway | Routes `/api/*` to Lambda |
| **Compute** | AWS Lambda (Flask via Mangum) | Stateless; scales to zero |

---

## 4. Key Architectural Decisions

### 4.1 API-Only Flask (No Template Rendering)

**Decision:** Flask serves JSON exclusively. All rendering is React's responsibility.

**Rationale:**
- Clean separation of concerns — front and back can evolve independently.
- React SPA on Amplify with full client-side routing matches mobile-web UX expectations (no page reloads).
- Enables the same Flask API to serve a future native mobile app with zero changes.
- Flask stays thin: validate input → authorize → query DB → return JSON.

### 4.2 AWS Lambda via Mangum (Serverless)

**Decision:** Flask wrapped with `asgiref.WsgiToAsgi` + `Mangum`, deployed as a single Lambda function behind API Gateway.

**Rationale:**
- Zero fixed infrastructure cost at MVP scale (pay-per-request).
- Auto-scales with traffic spikes without configuration.
- No server patching, OS management, or capacity planning.
- Cold start latency (~500ms) is acceptable for MVP-1 API calls; not on the critical render path (map tiles and Supabase Realtime are client-direct).
- Lambda timeout set to 29 seconds (API Gateway max is 30s); all Flask routes must complete well within this.

**Mangum setup:**
```python
# app.py
from flask import Flask
from mangum import Mangum
from asgiref.wsgi import WsgiToAsgi

flask_app = Flask(__name__)
asgi_app = WsgiToAsgi(flask_app)
handler = Mangum(asgi_app, lifespan="off")
```

### 4.3 Supabase Realtime vs Polling

**Decision:** Supabase Realtime (WebSocket, PostgreSQL CDC) for Panel live updates.

**Rationale:**
- The "Interested → organizer sees count update" flow requires near-instant feedback — a core product mechanic, not a nice-to-have.
- Polling at 5s intervals would create visible lag; 1s polling is too expensive for a serverless backend.
- Supabase Realtime is included in the Supabase plan, requires no additional infrastructure, and subscribes directly from the browser to Postgres WAL changes.
- Fallback: on WebSocket reconnect, React re-fetches Panel state via REST to catch any missed events.

### 4.4 Mapbox GL JS over Google Maps

**Decision:** Mapbox GL JS for map rendering; Google Places API (via Flask) for place data.

**Rationale:**
- Mapbox offers superior vector tile rendering, smoother animations, and more flexible custom styling — important for a place-discovery product where the map is the primary surface.
- Google Places API is still used for place search and metadata because it has the best coverage and richest data for POIs.
- These two concerns are decoupled: Mapbox renders, Google provides place data. Switching either independently is possible.

### 4.5 Supabase (Postgres + Auth + Realtime) as Unified Backend

**Decision:** Single Supabase project provides Postgres, Auth, and Realtime.

**Rationale:**
- Eliminates the need for a separate auth service, a WebSocket server, and manual connection pooling configuration.
- Row-Level Security (RLS) is built into Postgres — visibility tier enforcement is co-located with data.
- Same-region deployment (Supabase in us-east-1 matching Lambda in us-east-1) means Lambda→Postgres round trips stay under 5ms.
- Supabase manages connection pooling (PgBouncer), preventing connection exhaustion from Lambda's ephemeral execution model.

### 4.6 Flask Enforces Authorization; RLS Is Defense-in-Depth

**Decision:** Flask API uses the Supabase service role key (bypasses RLS) for all queries. Flask implements authorization checks explicitly. RLS policies exist as a secondary layer.

**Rationale:**
- Keeping authorization in one place (Flask) makes it testable and auditable.
- Flask can implement complex authorization logic (e.g., mutual friend check spanning two table joins) more clearly in Python than in Postgres RLS policy expressions.
- RLS as defense-in-depth ensures that even if Flask has a bug, a direct Supabase client call with a user JWT still cannot leak data across visibility tiers.
- The Supabase anon key is never used by Flask; it is only given to the React client for Auth and Realtime.

---

## 5. Security Boundaries

### What the client (React/browser) can do

- Initiate Google OAuth flow via Supabase JS client (public anon key)
- Subscribe to Supabase Realtime channels after authenticating with JWT
- Call Flask API endpoints with Bearer JWT in Authorization header
- Call Mapbox tile endpoints with the public Mapbox token
- Send analytics events to PostHog with the public PostHog key

**What the client cannot do:**
- Read or write Supabase Postgres directly (no service role key in client code)
- Call Google Places API (key is server-side only)
- Call OpenWeatherMap API (key is server-side only)
- Access other users' data without going through Flask (which enforces authorization)

### What Flask enforces (API layer)

Every authenticated endpoint runs this sequence:

1. **Extract JWT** from `Authorization: Bearer <token>` header.
2. **Verify JWT** using Supabase JWT secret (HS256). Reject if invalid or expired.
3. **Extract `sub` claim** → `g.user_id` (the authenticated Supabase user ID).
4. **Authorization check** per endpoint — e.g., for `GET /api/plans/{id}`: verify `g.user_id` is the organizer OR a mutual follower.
5. **Input validation** — reject malformed requests before DB interaction.
6. **Opening hours validation** — for plan creation, verify `plan_time` falls within `place.opening_hours`.
7. **Future-date validation** — reject plans with `plan_date` in the past.

### What RLS enforces (database layer)

RLS policies use `auth.uid()` from the JWT to enforce:

| Table | Policy | Condition |
|---|---|---|
| `users` | Read (public fields) | `NOT is_private` or `auth.uid() = id` |
| `users` | Write | `auth.uid() = id` |
| `user_places` | Read | `auth.uid() = user_id` OR mutual follow exists |
| `user_places` | Write | `auth.uid() = user_id` |
| `plans` | Read | `auth.uid() = organizer_id` OR mutual follow with organizer OR user is a joiner |
| `plans` | Write | `auth.uid() = organizer_id` |
| `plan_interests` | Read | Can read plan → can read its interests |
| `plan_interests` | Write | `auth.uid() = user_id` |
| `plan_joins` | Read | Can read plan → can read its joins |
| `plan_joins` | Write | `auth.uid() = user_id` |
| `follows` | Read | Public (anyone can read follow relationships) |
| `follows` | Insert | `auth.uid() = follower_id` |
| `follows` | Delete | `auth.uid() = follower_id` |
| `notifications` | All | `auth.uid() = user_id` |
| `invite_links` | Read | Creator or token match |
| `invite_links` | Insert | `auth.uid() = created_by` |
| `events` | Insert | `auth.uid() = user_id` OR anonymous insert allowed |
| `events` | Read | Never (service role only, via PostHog) |

### Keys and secrets placement

| Secret | Client (React) | Server (Flask) | Notes |
|---|---|---|---|
| Supabase anon key | ✅ | ❌ | Public-safe; used for auth + realtime only |
| Supabase service role key | ❌ | ✅ | Never expose; bypasses RLS |
| Supabase JWT secret | ❌ | ✅ | Used by Flask to verify JWTs |
| Google Places API key | ❌ | ✅ | Per-request billing; keep server-side |
| OpenWeatherMap API key | ❌ | ✅ | Server-side only |
| Mapbox public token | ✅ | ❌ | Scope-restricted token (map tiles only) |
| PostHog public key | ✅ | ❌ | `phc_...` prefix; safe to expose |
| PostHog project API key | ❌ | ✅ | Server-side events only |

---

## 6. Request/Response Conventions

All Flask API responses follow this envelope:

```json
// Success
{ "data": { ... }, "error": null }

// Error
{ "data": null, "error": { "code": "PLAN_IN_PAST", "message": "Plan date must be in the future." } }
```

All timestamps are ISO 8601 UTC strings (`2026-06-01T19:00:00Z`).

All IDs are UUIDs (string format).

Base API path: `/api/v1/` — versioned from day one to allow non-breaking evolution.

CORS origin: `https://app.hyperlocal.xyz` in production; `http://localhost:5173` in development. Configured in API Gateway and Flask-CORS.
