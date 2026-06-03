# API Design — Hyperlocal v2 Backend (Flask)

> **Stack:** Python Flask · AWS Lambda via Mangum · Supabase Postgres  
> **Purpose:** Complete REST API spec. Every section is self-contained for AI plan-mode task splitting.

---

## Conventions

### Base URL
```
https://api.hyperlocal.app/v1
```
All paths below are relative to this base.

### Authentication
Every authenticated endpoint requires:
```
Authorization: Bearer <supabase_jwt>
```
The Flask handler verifies the token with `supabase.auth.get_user(token)` and extracts `user.id` (UUID). The UUID matches `users.id` in the DB.

### Standard error shape
```json
{ "error": "Human-readable message", "code": "SNAKE_CASE_CODE" }
```

### Common error codes

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `INVALID_REQUEST` | Missing or malformed fields |
| 401 | `UNAUTHORIZED` | JWT missing, expired, or invalid |
| 403 | `FORBIDDEN` | Authenticated but not allowed |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource (already following, already joined, handle taken) |
| 422 | `VALIDATION_ERROR` | Field-level validation failure |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Pagination (where applicable)
Query params: `limit` (int, default 20, max 100) · `offset` (int, default 0)  
Response includes: `{ "items": [...], "total": int, "limit": int, "offset": int }`

---

## Database Schema Reference

> Columns used across all endpoints. The DB uses Supabase-hosted Postgres with RLS. All IDs are UUIDs unless noted.

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK; equals Supabase auth UID |
| `handle` | text | Unique, URL-safe, lowercase; set during onboarding |
| `display_name` | text | |
| `avatar_url` | text | Nullable; sourced from Google OAuth |
| `bio` | text | Nullable |
| `instagram_handle` | text | Nullable |
| `twitter_handle` | text | Nullable |
| `facebook_url` | text | Nullable |
| `is_private` | boolean | Default `false`; hides profile from non-followers |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `places`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text | PK; Mapbox feature ID (e.g. `poi.1234`) |
| `name` | text | |
| `address` | text | Human-readable full address |
| `lat` | float8 | |
| `lng` | float8 | |
| `category` | text | e.g. `restaurant`, `park`, `museum` |
| `mapbox_data` | jsonb | Raw Mapbox feature response |
| `created_at` | timestamptz | |

### `user_places`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id` |
| `place_id` | text | FK → `places.id` |
| `note` | text | Nullable; personal note |
| `saved_at` | timestamptz | |
| `updated_at` | timestamptz | |
| UNIQUE | — | `(user_id, place_id)` |

### `plans`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `organizer_id` | uuid | FK → `users.id` |
| `place_id` | text | FK → `places.id` |
| `planned_at` | timestamptz | Nullable — `NULL` = timeless plan |
| `is_cancelled` | boolean | Default `false`; soft-delete for organizer only |
| `cancelled_at` | timestamptz | Nullable |
| `organizer_confirmed` | boolean | Default `false`; set `true` when time is added |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `plan_interests`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `plan_id` | uuid | FK → `plans.id` |
| `user_id` | uuid | FK → `users.id` |
| `created_at` | timestamptz | |
| UNIQUE | — | `(plan_id, user_id)` |

### `plan_joins`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `plan_id` | uuid | FK → `plans.id` |
| `user_id` | uuid | FK → `users.id` |
| `created_at` | timestamptz | |
| UNIQUE | — | `(plan_id, user_id)` |

### `follows`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `follower_id` | uuid | FK → `users.id` (person doing the following) |
| `following_id` | uuid | FK → `users.id` (person being followed) |
| `created_at` | timestamptz | |
| UNIQUE | — | `(follower_id, following_id)` |

### `invite_links`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `token` | text | Unique; URL-safe random 32-char string |
| `creator_id` | uuid | FK → `users.id` |
| `plan_id` | uuid | FK → `plans.id`; nullable |
| `redeemed_by` | uuid | FK → `users.id`; nullable |
| `redeemed_at` | timestamptz | Nullable |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | Nullable |

### `events` (in-app notification records)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `recipient_id` | uuid | FK → `users.id` |
| `type` | text | See event types table below |
| `payload` | jsonb | Context-specific data |
| `read_at` | timestamptz | Nullable |
| `dismissed_at` | timestamptz | Nullable |
| `created_at` | timestamptz | |

**Event types:**
| `type` | `payload` keys | Trigger |
|--------|----------------|---------|
| `follow` | `follower_id`, `follower_handle`, `follower_display_name`, `follower_avatar_url` | POST /follows |
| `new_friend_plan` | `plan_id`, `place_name`, `organizer_handle`, `organizer_avatar_url` | POST /plans (fan-out to mutual friends) |
| `plan_time_added` | `plan_id`, `place_name`, `organizer_handle`, `planned_at` | PATCH /plans/:id (when planned_at added to timeless plan) |
| `plan_reminder` | `plan_id`, `place_name` | Scheduled Lambda job (not a Flask route) |
| `plan_cancelled` | `plan_id`, `place_name`, `organizer_handle` | POST /plans/:id/cancel |

---

## 1. Auth

### `POST /auth/session`

| | |
|---|---|
| **Auth** | Public (JWT in `Authorization` header) |
| **Tables** | `users` |
| **PostHog** | — |

**Request body:** None. JWT is read from the `Authorization` header.

**Success `200 OK`:**
```json
{
  "user": {
    "id": "uuid",
    "handle": "string | null",
    "display_name": "string",
    "avatar_url": "string | null",
    "bio": "string | null",
    "instagram_handle": "string | null",
    "twitter_handle": "string | null",
    "facebook_url": "string | null",
    "is_private": false,
    "created_at": "ISO8601"
  },
  "needs_onboarding": false
}
```
`needs_onboarding: true` when `handle` is `null` (first login; user must call `POST /auth/onboard` before using the app).

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | JWT missing, expired, or rejected by Supabase |

**Implementer notes:**
- Call `supabase.auth.get_user(token)` to validate the JWT. Extract `user.id` and `user.user_metadata` (contains `full_name`, `avatar_url` from Google OAuth).
- Upsert into `users` on `id`. On first insert, set `display_name` from `full_name`, `avatar_url` from metadata. Do NOT overwrite `display_name` or `avatar_url` on subsequent calls — let the user control those via PATCH /users/me.
- Return `needs_onboarding: true` if `handle IS NULL`.

---

### `POST /auth/onboard`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `users` |
| **PostHog** | — |

**Request body:**
```json
{
  "handle": "string",
  "display_name": "string"
}
```

**Success `200 OK`:** Returns the updated user object (same shape as `POST /auth/session` → `user`).

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Invalid JWT |
| 403 | `FORBIDDEN` | User already has a handle set |
| 409 | `CONFLICT` | Handle already taken |
| 422 | `VALIDATION_ERROR` | `handle` is empty, too long (>30 chars), or contains invalid characters |

**Implementer notes:**
- `handle` must match `^[a-zA-Z0-9_]{1,30}$`. Enforce case-insensitive uniqueness (store lowercase).
- This endpoint is idempotent only before a handle is set. Once set, this route returns 403 to prevent re-onboarding exploits.
- After success, set `updated_at = now()` on the user record.

---

## 2. Users

### `GET /users/me`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `users` |
| **PostHog** | — |

**Query params:** None.

**Success `200 OK`:**
```json
{
  "id": "uuid",
  "handle": "string",
  "display_name": "string",
  "avatar_url": "string | null",
  "bio": "string | null",
  "instagram_handle": "string | null",
  "twitter_handle": "string | null",
  "facebook_url": "string | null",
  "is_private": false,
  "created_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Invalid JWT |

---

### `PATCH /users/me`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `users` |
| **PostHog** | — |

**Request body (all fields optional):**
```json
{
  "display_name": "string",
  "bio": "string",
  "avatar_url": "string",
  "instagram_handle": "string",
  "twitter_handle": "string",
  "facebook_url": "string",
  "is_private": false
}
```

**Success `200 OK`:** Updated user object (same shape as `GET /users/me`).

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Invalid JWT |
| 422 | `VALIDATION_ERROR` | `display_name` empty or > 100 chars |

**Implementer notes:**
- Only apply fields present in the body (partial update). Do not reset omitted fields to null.
- `handle` is NOT updatable through this endpoint. Handle changes are out of scope for MVP-1.
- Set `updated_at = now()` on every successful PATCH.

---

### `GET /users/handle-check`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `users` |
| **PostHog** | — |

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `handle` | string | Yes | The handle to check |

**Success `200 OK`:**
```json
{ "available": true }
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `handle` param missing |
| 401 | `UNAUTHORIZED` | Invalid JWT |

**Implementer notes:**
- Check case-insensitively: `WHERE lower(handle) = lower(:handle)`.
- Authenticated to prevent anonymous handle enumeration.

---

### `GET /users/:handle`

| | |
|---|---|
| **Auth** | Public (response varies by auth state and relationship) |
| **Tables** | `users`, `follows`, `user_places`, `plans`, `places` |
| **PostHog** | — |

**Path param:** `handle` — the target user's handle.

**Success `200 OK`** — Response shape varies by relationship tier:

**Tier: No relationship (or unauthenticated)**
```json
{
  "id": "uuid",
  "handle": "string",
  "display_name": "string",
  "avatar_url": "string | null",
  "bio": "string | null",
  "relationship": "none",
  "is_private": false
}
```
If `is_private: true`, return `403 FORBIDDEN` for unauthenticated users and non-followers.

**Tier: One-way follower** (authenticated user follows target; target has not followed back)
```json
{
  "id": "uuid",
  "handle": "string",
  "display_name": "string",
  "avatar_url": "string | null",
  "bio": "string | null",
  "relationship": "following",
  "is_private": false,
  "favorite_places": [
    {
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0
    }
  ],
  "want_to_go": [
    {
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0
    }
  ]
}
```

**Tier: Mutual friend** (both users follow each other)
```json
{
  "id": "uuid",
  "handle": "string",
  "display_name": "string",
  "avatar_url": "string | null",
  "bio": "string | null",
  "relationship": "mutual",
  "is_private": false,
  "saved_places": [
    {
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0,
      "saved_at": "ISO8601"
    }
  ],
  "upcoming_plans": [
    {
      "plan_id": "uuid",
      "place_id": "string",
      "place_name": "string",
      "planned_at": "ISO8601 | null",
      "is_cancelled": false,
      "interest_count": 0,
      "join_count": 0
    }
  ]
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Profile is private and requester is not a follower |
| 404 | `NOT_FOUND` | Handle does not exist |

**Implementer notes:**
- Relationship check: query `follows` twice — one check `WHERE follower_id = me AND following_id = target`, one check `WHERE follower_id = target AND following_id = me`.
- `favorite_places`: query `plans` WHERE `organizer_id = target_id AND planned_at < now() AND is_cancelled = false`, join `places`, group by `place_id`, take top 5 by occurrence count. Return place info only — no plan dates, no attendees.
- `want_to_go`: query `plans` WHERE `organizer_id = target_id AND planned_at IS NULL AND is_cancelled = false`. Return place info only — no plan IDs, no dates.
- `upcoming_plans`: query `plans` WHERE `organizer_id = target_id AND (planned_at IS NULL OR planned_at > now()) AND is_cancelled = false`. Only for mutual tier.
- The viewing user's own `saved_places` includes both own places AND friend's places — do NOT include the target user's note field in the response.

---

### `GET /users/:handle/relationship`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows` |
| **PostHog** | — |

**Success `200 OK`:**
```json
{
  "you_follow_them": true,
  "they_follow_you": false,
  "is_mutual": false
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | Handle does not exist |

---

### `GET /users/me/friends`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows`, `users` |
| **PostHog** | — |

**Query params:** `limit`, `offset`

**Success `200 OK`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "handle": "string",
      "display_name": "string",
      "avatar_url": "string | null"
    }
  ],
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

**Implementer notes:**
- Mutual friends = users where `(follower_id = me AND following_id = friend)` AND `(follower_id = friend AND following_id = me)` both exist.
- SQL: `SELECT u.* FROM users u JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = :me JOIN follows f2 ON f2.follower_id = u.id AND f2.following_id = :me`.

---

## 3. Places

### `GET /places/search`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `places` (read-only; upsert happens at save time, not search time) |
| **PostHog** | — |

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | Yes | Search query text |
| `lat` | float | Yes | User's current latitude (for proximity bias) |
| `lng` | float | Yes | User's current longitude |
| `limit` | int | No | Max results, default 10, max 20 |

**Success `200 OK`:**
```json
{
  "results": [
    {
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0,
      "distance_meters": 450,
      "is_saved": false
    }
  ]
}
```
`is_saved` is `true` if the authenticated user has saved this place.

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `q`, `lat`, or `lng` missing |

**Implementer notes:**
- Proxy to Mapbox Geocoding API: `GET https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json?proximity={lng},{lat}&types=poi&access_token={MAPBOX_SECRET_TOKEN}&limit={limit}`.
- Map Mapbox `place_name` → `name`, `place_name` (full) → `address`, `properties.category` → `category`, `geometry.coordinates` → `[lng, lat]`, `id` → `place_id`.
- After fetching Mapbox results, query `user_places WHERE user_id = me AND place_id IN (result_ids)` and attach `is_saved` flag.
- The Mapbox secret token lives in Lambda env vars; never expose it to the client.

---

### `GET /places/:place_id`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `places`, `user_places` |
| **PostHog** | — |

**Path param:** `place_id` — URL-encoded Mapbox feature ID.

**Success `200 OK`:**
```json
{
  "place_id": "string",
  "name": "string",
  "address": "string",
  "category": "string",
  "lat": 0.0,
  "lng": 0.0,
  "mapbox_data": {},
  "is_saved": false,
  "user_note": "string | null",
  "google_maps_url": "string"
}
```
`google_maps_url` = `https://www.google.com/maps/search/?api=1&query={url-encoded address}`.

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | place_id not found in Mapbox or DB |

**Implementer notes:**
- First check `places` table. If not found, fetch from Mapbox Places API: `GET /geocoding/v5/mapbox.places/{place_id}.json`. If Mapbox also returns empty, return 404.
- Attach `is_saved` and `user_note` from `user_places WHERE user_id = me AND place_id = :id`.

---

### `GET /places/contextual`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | — (Mapbox proxy + optional weather API) |
| **PostHog** | — |

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | float | Yes | User's latitude |
| `lng` | float | Yes | User's longitude |
| `weather` | string | No | `sunny` \| `cloudy` \| `rainy` (client provides from browser geolocation weather call) |
| `timezone_offset` | int | No | UTC offset in minutes (e.g. `-420` for PDT) |

**Success `200 OK`:**
```json
{
  "tagline": "Sunny afternoon — great day for a park",
  "results": [
    {
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0,
      "is_saved": false
    }
  ]
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `lat` or `lng` missing |

**Implementer notes:**
- Derive local hour from server UTC time + `timezone_offset` (default to UTC if not provided).
- Apply category selection rules:
  - 11:30–13:00 local time → `restaurant` (search "lunch" near location, filter open now)
  - 18:00–20:00 → `restaurant` (search "dinner")
  - Sunny + not meal time → `park`
  - Rainy + Saturday or Sunday → `museum` or `library`
  - Default → `cafe` (but not after 17:00 local)
- Mapbox search: `GET /geocoding/v5/mapbox.places/{category}.json?proximity={lng},{lat}&types=poi&limit=5`.
- Tagline is generated server-side from the rule that fired (short, plain English, no LLM call needed in MVP-1).
- Attach `is_saved` from `user_places` for authenticated user.

---

### `POST /user-places`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `places` (upsert), `user_places` (insert) |
| **PostHog** | `place_saved` |

**Request body:**
```json
{
  "place_id": "string",
  "note": "string | null"
}
```

**Success `201 Created`:**
```json
{
  "id": "uuid",
  "place_id": "string",
  "place_name": "string",
  "note": "string | null",
  "saved_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `place_id` missing |
| 409 | `CONFLICT` | User has already saved this place (return existing record with `200` instead of 409 — idempotent save) |

**Implementer notes:**
- Before inserting into `user_places`, upsert the place into `places` (fetch from Mapbox if not yet in DB).
- Use `INSERT ... ON CONFLICT (user_id, place_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now()` to make this idempotent.
- Fire PostHog event `place_saved` with `{ place_id, place_category }`.

---

### `PATCH /user-places/:place_id`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `user_places` |
| **PostHog** | — |

**Path param:** `place_id` — URL-encoded Mapbox feature ID.

**Request body:**
```json
{ "note": "string" }
```

**Success `200 OK`:**
```json
{
  "place_id": "string",
  "note": "string",
  "updated_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | User has not saved this place |

---

### `DELETE /user-places/:place_id`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `user_places` |
| **PostHog** | — |

**Success `204 No Content`**

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | User has not saved this place |

**Implementer notes:**
- Deletes from `user_places` only. Does NOT delete from `places` (shared cache).
- If the user has active plans for this place, the plan continues to exist — the place is still bookmarked implicitly by the plan.

---

### `GET /users/me/places`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `user_places`, `places` |
| **PostHog** | — |

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | float | No | User's latitude (for proximity sort) |
| `lng` | float | No | User's longitude |
| `limit` | int | No | Default 50 |
| `offset` | int | No | Default 0 |

**Success `200 OK`:**
```json
{
  "items": [
    {
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0,
      "note": "string | null",
      "saved_at": "ISO8601",
      "distance_meters": 320
    }
  ],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```
`distance_meters` is `null` if `lat`/`lng` not provided.

**Implementer notes:**
- Sort by proximity (`ST_Distance(place.location, ST_MakePoint(:lng, :lat))`) if coordinates provided, else by `saved_at DESC`.
- Use PostGIS for distance calculation. Store `places.location` as a `geography(Point, 4326)` column (in addition to `lat`/`lng` columns).

---

### `GET /users/:handle/places`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `users`, `follows`, `user_places`, `places` |
| **PostHog** | — |

**Query params:** `lat`, `lng`, `limit`, `offset`

**Success `200 OK`:** Same shape as `GET /users/me/places` but `note` field is omitted (notes are private).

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester is not a mutual friend of target |
| 404 | `NOT_FOUND` | Handle does not exist |

**Implementer notes:**
- Only mutual friends can call this endpoint and receive results. One-way followers do NOT get the full place list — the curated `favorite_places` / `want_to_go` lists are returned via `GET /users/:handle` instead.
- Verify mutual follow before querying `user_places`.

---

### `GET /users/me/friends/places`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows`, `user_places`, `places`, `users` |
| **PostHog** | — |

**Query params:** `lat`, `lng`, `limit` (default 100)

**Success `200 OK`:**
```json
{
  "items": [
    {
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0,
      "saved_by": {
        "handle": "string",
        "display_name": "string",
        "avatar_url": "string | null"
      },
      "distance_meters": 600
    }
  ]
}
```

**Implementer notes:**
- Fetch all mutual friends' IDs first, then query `user_places WHERE user_id IN (friend_ids)`. Join `places` and `users`.
- This powers the map view showing friends' place pins. Keep response payload lean — no notes, no saved_at.

---

## 4. Plans

### `POST /plans`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plans`, `user_places` (auto-save), `places` (upsert), `events` (fan-out to mutual friends) |
| **PostHog** | `plan_created` |

**Request body:**
```json
{
  "place_id": "string",
  "planned_at": "ISO8601 | null"
}
```

**Success `201 Created`:**
```json
{
  "plan_id": "uuid",
  "place_id": "string",
  "place_name": "string",
  "place_address": "string",
  "planned_at": "ISO8601 | null",
  "is_cancelled": false,
  "organizer_confirmed": false,
  "interest_count": 0,
  "join_count": 0,
  "created_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `place_id` missing |
| 422 | `VALIDATION_ERROR` | `planned_at` is in the past |

**Implementer notes:**
- Auto-save the place: call the same upsert logic as `POST /user-places` (place in `places`, entry in `user_places`). Skip if user already saved it.
- `planned_at` must be in the future if provided. Validate server-side (reject if `planned_at < now()`).
- After inserting the plan, fan out `new_friend_plan` event to all mutual friends: query mutual friends, bulk-insert into `events`.
- Fire PostHog `plan_created` with `{ plan_id, has_time: planned_at != null, place_category }`.

---

### `PATCH /plans/:plan_id`

| | |
|---|---|
| **Auth** | Authenticated (organizer only) |
| **Tables** | `plans`, `events` (if time added to timeless plan) |
| **PostHog** | `plan_materialized` (conditional) |

**Request body (all optional):**
```json
{
  "planned_at": "ISO8601 | null"
}
```

**Success `200 OK`:**
```json
{
  "plan_id": "uuid",
  "place_id": "string",
  "place_name": "string",
  "planned_at": "ISO8601 | null",
  "organizer_confirmed": true,
  "updated_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester is not the organizer |
| 404 | `NOT_FOUND` | Plan does not exist |
| 422 | `VALIDATION_ERROR` | `planned_at` is in the past or before place opening hours |

**Implementer notes:**
- If the plan previously had `planned_at IS NULL` and the PATCH sets a non-null `planned_at`, this is a "plan materialized" event:
  1. Set `organizer_confirmed = true`.
  2. Insert `plan_time_added` events for all users in `plan_interests WHERE plan_id = :id`.
  3. Fire PostHog `plan_materialized` with `{ plan_id, place_id, interested_count }`.
- If `planned_at` is set but was already non-null (time update), still notify interested users via `plan_time_added` events.

---

### `POST /plans/:plan_id/cancel`

| | |
|---|---|
| **Auth** | Authenticated (organizer only) |
| **Tables** | `plans`, `events` |
| **PostHog** | — |

**Request body:** None.

**Success `200 OK`:**
```json
{
  "plan_id": "uuid",
  "is_cancelled": true,
  "cancelled_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester is not the organizer |
| 404 | `NOT_FOUND` | Plan does not exist |
| 409 | `CONFLICT` | Plan is already cancelled |

**Implementer notes:**
- Set `is_cancelled = true`, `cancelled_at = now()`. Do NOT delete the row — joiners still see the plan as cancelled.
- Insert `plan_cancelled` events for all users in `plan_joins WHERE plan_id = :id`.
- The organizer's own Panel removes the plan card (client filters out `is_cancelled` plans for the organizer). The plan card persists for joiners with a "cancelled" badge.

---

### `GET /plans/:plan_id`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plans`, `places`, `users`, `plan_interests`, `plan_joins`, `follows` |
| **PostHog** | — |

**Success `200 OK`:**
```json
{
  "plan_id": "uuid",
  "organizer": {
    "id": "uuid",
    "handle": "string",
    "display_name": "string",
    "avatar_url": "string | null"
  },
  "place": {
    "place_id": "string",
    "name": "string",
    "address": "string",
    "category": "string",
    "lat": 0.0,
    "lng": 0.0,
    "google_maps_url": "string"
  },
  "planned_at": "ISO8601 | null",
  "is_cancelled": false,
  "organizer_confirmed": true,
  "interest_count": 3,
  "join_count": 2,
  "requester_has_joined": false,
  "requester_is_interested": false,
  "created_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester cannot see this plan (not organizer, not joiner, not mutual friend of organizer) |
| 404 | `NOT_FOUND` | Plan does not exist |

**Implementer notes:**
- Visibility check: requester can see the plan if any of: (a) they are the organizer, (b) they have a record in `plan_joins`, (c) they are a mutual friend of the organizer.
- To check mutual friendship: both rows must exist in `follows` — `(follower=me, following=organizer)` AND `(follower=organizer, following=me)`.

---

### `GET /users/me/plans`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plans`, `plan_joins`, `places` |
| **PostHog** | — |

**Query params:** `limit`, `offset`

**Success `200 OK`:**
```json
{
  "items": [
    {
      "plan_id": "uuid",
      "role": "organizer | joiner",
      "place_id": "string",
      "place_name": "string",
      "place_address": "string",
      "planned_at": "ISO8601 | null",
      "is_cancelled": false,
      "organizer_confirmed": true,
      "interest_count": 0,
      "join_count": 0,
      "created_at": "ISO8601"
    }
  ],
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

**Implementer notes:**
- Fetch plans where `organizer_id = me` (role `organizer`) UNION plans where `plan_id IN (SELECT plan_id FROM plan_joins WHERE user_id = me)` (role `joiner`).
- For organizer view, include cancelled plans. For joiner view, include cancelled plans (so user can see the cancelled badge).
- Sort: timed plans by `planned_at ASC`, timeless plans below timed ones (treat `planned_at IS NULL` as infinity), then by `created_at DESC`.

---

### `GET /users/:handle/plans`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plans`, `places`, `follows` |
| **PostHog** | — |

**Query params:** `limit`, `offset`

**Success `200 OK`:** Same items shape as `GET /users/me/plans` but `role` is always `organizer` and `interest_count` / `join_count` are included.

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester is not a mutual friend of target |
| 404 | `NOT_FOUND` | Handle does not exist |

---

## 5. Social (Follows)

### `POST /follows`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows`, `events`, `users` |
| **PostHog** | `mutual_connection_formed` (conditional) |

**Request body:**
```json
{ "handle": "string" }
```

**Success `201 Created`:**
```json
{
  "following": {
    "id": "uuid",
    "handle": "string",
    "display_name": "string",
    "avatar_url": "string | null"
  },
  "is_mutual": false
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | Cannot follow yourself |
| 404 | `NOT_FOUND` | Handle does not exist |
| 409 | `CONFLICT` | Already following this user |

**Implementer notes:**
- Insert into `follows (follower_id = me, following_id = target.id)`.
- Insert a `follow` event for the followed user with payload `{ follower_id, follower_handle, follower_display_name, follower_avatar_url }`.
- Check if the follow creates a mutual: check `follows WHERE follower_id = target.id AND following_id = me`. If yes, set `is_mutual: true` in response and fire PostHog `mutual_connection_formed`.
- On mutual, also fan out any existing plans from each user to the other's Panel via `new_friend_plan` events.

---

### `DELETE /follows/:handle`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows` |
| **PostHog** | — |

**Success `204 No Content`**

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | Not following this handle |

**Implementer notes:**
- Deletes from `follows` where `follower_id = me AND following_id = target.id`.
- No event is created for the unfollowed user.

---

### `GET /users/:handle/followers`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows`, `users` |
| **PostHog** | — |

**Query params:** `limit`, `offset`

**Success `200 OK`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "handle": "string",
      "display_name": "string",
      "avatar_url": "string | null"
    }
  ],
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | Handle does not exist |

---

### `GET /users/:handle/following`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows`, `users` |
| **PostHog** | — |

**Query params:** `limit`, `offset`

**Success `200 OK`:** Same shape as `GET /users/:handle/followers`.

---

## 6. Interests

### `POST /plans/:plan_id/interests`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plan_interests`, `plans`, `follows` |
| **PostHog** | `plan_interested` |

**Request body:** None.

**Success `201 Created`:**
```json
{
  "plan_id": "uuid",
  "interest_count": 4
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester cannot see this plan (not a mutual friend of organizer) |
| 404 | `NOT_FOUND` | Plan does not exist |
| 409 | `CONFLICT` | Already marked Interested |

**Implementer notes:**
- Verify the requester can see the plan before allowing Interested (mutual friend of organizer OR already joined).
- Organizer cannot mark Interested on their own plan — return 403.
- Fire PostHog `plan_interested` with `{ plan_id, plan_has_time: planned_at != null }`.

---

### `DELETE /plans/:plan_id/interests`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plan_interests` |
| **PostHog** | — |

**Success `200 OK`:**
```json
{ "plan_id": "uuid", "interest_count": 3 }
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | No Interested record for this user on this plan |

---

### `GET /plans/:plan_id/interests`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plan_interests`, `users`, `plans` |
| **PostHog** | — |

**Success `200 OK`:**
```json
{
  "plan_id": "uuid",
  "interest_count": 4,
  "users": [
    {
      "id": "uuid",
      "handle": "string",
      "display_name": "string",
      "avatar_url": "string | null"
    }
  ]
}
```
The `users` array is only populated if the requester is the organizer. For other users, `users` is an empty array and `interest_count` is the count.

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester cannot see this plan |
| 404 | `NOT_FOUND` | Plan does not exist |

---

## 7. Joins

### `POST /plans/:plan_id/joins`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plan_joins`, `plans`, `follows`, `user_places` (auto-save) |
| **PostHog** | `plan_joined` |

**Request body:** None.

**Success `201 Created`:**
```json
{
  "plan_id": "uuid",
  "join_count": 3
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester cannot see this plan |
| 404 | `NOT_FOUND` | Plan does not exist |
| 409 | `CONFLICT` | Already joined · Plan is cancelled · Plan is in the past |

**Implementer notes:**
- Organizer cannot join their own plan — return 409 with message "You are the organizer."
- Check `is_cancelled = false` and `planned_at IS NULL OR planned_at > now()` before inserting.
- Auto-save the place: upsert into `user_places` if user hasn't saved it yet (same logic as `POST /user-places`).
- Fire PostHog `plan_joined` with `{ plan_id, was_interested: bool }`.

---

### `DELETE /plans/:plan_id/joins`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plan_joins` |
| **PostHog** | — |

**Success `200 OK`:**
```json
{ "plan_id": "uuid", "join_count": 2 }
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | User has not joined this plan |

---

### `GET /plans/:plan_id/joins`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `plan_joins`, `users`, `plans` |
| **PostHog** | — |

**Success `200 OK`:**
```json
{
  "plan_id": "uuid",
  "join_count": 3,
  "users": [
    {
      "id": "uuid",
      "handle": "string",
      "display_name": "string",
      "avatar_url": "string | null"
    }
  ]
}
```
Full user list is returned to anyone who can see the plan (organizer + joiners + mutual friends of organizer).

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester cannot see this plan |
| 404 | `NOT_FOUND` | Plan does not exist |

---

## 8. Invite Links

### `POST /invite-links`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `invite_links` |
| **PostHog** | `invite_link_shared` |

**Request body:**
```json
{
  "plan_id": "uuid | null"
}
```

**Success `201 Created`:**
```json
{
  "token": "string",
  "url": "https://hyperlocal.app/invite/{token}",
  "plan_id": "uuid | null",
  "created_at": "ISO8601"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | `plan_id` provided but plan does not exist or requester is not the organizer |

**Implementer notes:**
- Generate `token` using `secrets.token_urlsafe(24)` (32 URL-safe chars).
- If `plan_id` is provided, verify the requester is the organizer of that plan.
- Fire PostHog `invite_link_shared` with `{ plan_id, has_plan: plan_id != null }`.

---

### `GET /invite-links/:token`

| | |
|---|---|
| **Auth** | Public |
| **Tables** | `invite_links`, `users`, `plans`, `places` |
| **PostHog** | — |

**Success `200 OK`:**
```json
{
  "token": "string",
  "creator": {
    "handle": "string",
    "display_name": "string",
    "avatar_url": "string | null"
  },
  "plan": {
    "plan_id": "uuid",
    "place_name": "string",
    "place_address": "string",
    "planned_at": "ISO8601 | null",
    "is_cancelled": false
  } | null,
  "is_redeemed": false,
  "is_expired": false
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | Token does not exist |

**Implementer notes:**
- This endpoint is public so unauthenticated users can land on the invite page and see a preview before signing up.
- `is_expired` = `expires_at IS NOT NULL AND expires_at < now()`.

---

### `POST /invite-links/:token/redeem`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `invite_links`, `follows`, `events` |
| **PostHog** | `invite_link_converted` |

**Request body:** None.

**Success `200 OK`:**
```json
{
  "token": "string",
  "creator_handle": "string",
  "now_following": true,
  "plan_id": "uuid | null"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 404 | `NOT_FOUND` | Token does not exist |
| 409 | `CONFLICT` | Link already redeemed · Link is expired · User is the creator |

**Implementer notes:**
- Mark `redeemed_by = me`, `redeemed_at = now()`.
- Auto-follow the creator: insert into `follows (follower_id = me, following_id = creator_id)` if not already following.
- If a follow is created, insert a `follow` event for the creator.
- If `plan_id` is set, do NOT auto-join the plan — let the user choose to join explicitly.
- Fire PostHog `invite_link_converted` with `{ creator_handle, plan_id }`.
- This endpoint should be idempotent for the same user: if already redeemed by this user, return 200 with the same data (do not 409).

---

## 9. Feed / Panel

### `GET /panel`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `events`, `plans`, `plan_joins`, `plan_interests`, `user_places`, `places`, `follows`, `users` |
| **PostHog** | — |

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | float | No | User's latitude (for place proximity sort) |
| `lng` | float | No | User's longitude |
| `filter` | string | No | `all` (default) \| `plans` \| `places` \| `hide_notifications` |
| `weather` | string | No | `sunny` \| `cloudy` \| `rainy` (for contextual place suggestions) |
| `timezone_offset` | int | No | UTC offset in minutes |

**Success `200 OK`:**
```json
{
  "cards": [
    {
      "type": "notification",
      "id": "uuid",
      "event_type": "follow | new_friend_plan | plan_time_added | plan_reminder | plan_cancelled",
      "payload": {},
      "created_at": "ISO8601",
      "dismissed_at": "ISO8601 | null"
    },
    {
      "type": "plan",
      "plan_id": "uuid",
      "role": "organizer | joiner | friend",
      "place_id": "string",
      "place_name": "string",
      "place_address": "string",
      "place_category": "string",
      "planned_at": "ISO8601 | null",
      "is_cancelled": false,
      "organizer_confirmed": true,
      "organizer_handle": "string",
      "organizer_avatar_url": "string | null",
      "interest_count": 0,
      "join_count": 0,
      "requester_has_joined": false,
      "requester_is_interested": false,
      "created_at": "ISO8601"
    },
    {
      "type": "place",
      "place_id": "string",
      "name": "string",
      "address": "string",
      "category": "string",
      "lat": 0.0,
      "lng": 0.0,
      "source": "own | friend | contextual",
      "saved_by_handle": "string | null",
      "saved_by_avatar_url": "string | null",
      "note": "string | null",
      "distance_meters": 200,
      "is_saved": true
    }
  ]
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | Invalid JWT |

**Implementer notes:**
- The response is a flat, ordered list. Sort logic:
  1. **Notification cards** (type `notification`): all undismissed events for this user, sorted by `created_at DESC`.
  2. **Plan cards** (type `plan`): 
     - Own plans (role `organizer`): `plans WHERE organizer_id = me AND is_cancelled = false AND (planned_at IS NULL OR planned_at > now())`.
     - Joined plans (role `joiner`): `plans WHERE id IN (SELECT plan_id FROM plan_joins WHERE user_id = me)`, including cancelled ones.
     - Friend plans (role `friend`): `plans WHERE organizer_id IN (mutual_friend_ids) AND is_cancelled = false AND (planned_at IS NULL OR planned_at > now())` — exclude plans the user has already joined (those appear as `joiner`).
     - Sort within plans: timed plans by `planned_at ASC` (soonest first), timeless plans after timed ones sorted by `created_at DESC`.
  3. **Place cards** (type `place`):
     - Own saved places (source `own`)
     - Friends' saved places (source `friend`) — one entry per place per friend who saved it
     - Contextual suggestions (source `contextual`) — call the same logic as `GET /places/contextual`; skip if no `lat`/`lng` provided
     - Sort by `distance_meters ASC` if `lat`/`lng` provided, else `saved_at DESC`.
- Apply `filter` param: `plans` = only notification + plan cards; `places` = only place cards; `hide_notifications` = no notification cards.
- `note` is only populated for `source: own` place cards.

---

### `POST /events/:event_id/dismiss`

| | |
|---|---|
| **Auth** | Authenticated (recipient only) |
| **Tables** | `events` |
| **PostHog** | — |

**Request body:** None.

**Success `200 OK`:**
```json
{ "event_id": "uuid", "dismissed_at": "ISO8601" }
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Requester is not the recipient |
| 404 | `NOT_FOUND` | Event does not exist |

**Implementer notes:**
- Sets `dismissed_at = now()`. Dismissed events are excluded from `GET /panel` notification cards.
- Does not delete the event row — the row is kept for potential analytics queries.

---

## 10. Analytics

### `POST /analytics/track`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | — |
| **PostHog** | Proxied event |

**Request body:**
```json
{
  "event": "string",
  "properties": {}
}
```

**Success `200 OK`:**
```json
{ "ok": true }
```

**Implementer notes:**
- This is an optional server-side proxy for client events that need server enrichment (e.g. IP-based geo, server-verified user ID). 
- For most telemetry, the React app calls PostHog's client SDK directly. This endpoint is only needed if the client PostHog SDK cannot be used (e.g., for ad-blocker resilience or server-only events).
- Forward to PostHog via `posthog.capture(distinct_id=user_id, event=event, properties={...properties, source: "server_proxy"})`.
- Do NOT fire this for events already captured by server-side Flask handlers (e.g. `place_saved`, `plan_created` are fired server-side; do not double-count).

---

## Scheduled Jobs (Lambda Cron — not Flask routes)

These are not API endpoints but are critical to the product and must be implemented alongside the API.

### Plan reminders
**Trigger:** Daily Lambda cron (e.g. every morning at 8 AM UTC)  
**Logic:**
1. Find timeless plans where `planned_at IS NULL AND is_cancelled = false AND created_at < (now() - 7 days)`.
2. Insert `plan_reminder` event for each plan's organizer.
3. Also: find timeless plans with a set date (wait — these don't exist by definition; timeless means no date). In MVP-1, timeless plans have no scheduled date, so reminders are sent based on time since creation.

Actually per the spec (Flow 4.2): reminders fire "the day before the plan date, then the morning of." This implies timeless plans DO have a date — they just don't have a time. Reconsider: a plan can have a `planned_date` (date only, no time) separate from `planned_at` (datetime). However, the current schema uses a single `planned_at` timestamp.

**Resolution for implementer:** In MVP-1, a "timeless" plan is `planned_at IS NULL`. Reminder logic targets plans that are timeless AND were created more than N days ago (threshold TBD). The reminder cadence from Flow 4.2 applies when a date is known — meaning: the plan has a specific date set but no time. If the schema collapses date and time into one field, treat `planned_at IS NULL` as fully timeless (no date or time known) and send a single reminder at the 7-day mark.
