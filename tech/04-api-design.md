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

### Standard response envelope

As built, **every** response (success and error) uses a uniform envelope so the client has one unwrap path (`backend/app/errors.py` → `ok()` / `err()`):

```json
{ "data": <payload-or-null>, "error": null }
```
```json
{ "data": null, "error": { "code": "SNAKE_CASE_CODE", "message": "Human-readable", "fields": { "handle": "TAKEN" } } }
```

`message` and `fields` are optional. `fields` carries per-field validation detail (e.g. `{ "handle": "TAKEN", "suggestions": [...] }`). The frontend reads this via `lib/api.ts → apiError()` / `unwrap()`.

### Common error codes

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `INVALID_REQUEST` | Missing or malformed fields |
| 401 | `UNAUTHORIZED` | JWT missing, expired, or invalid |
| 403 | `FORBIDDEN` | Authenticated but not allowed |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Contested resource (handle taken, already onboarded) |
| 422 | `VALIDATION_ERROR` | Field-level validation failure (`fields` populated) |
| 422 | `TIME_IN_PAST` / `TIME_REQUIRED_TODAY` / `OUTSIDE_OPENING_HOURS` / `PLACE_UNAVAILABLE` | Plan datetime validation ([tech/08 §2](08-edge-cases-and-error-handling.md)) |
| 410 | `GONE` | Invite link expired |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

**Idempotent toggles (P2):** `POST` on follows / joins / interests / user-places returns **201 on create, 200 on duplicate** (with the current resource state) rather than `409`. `409 CONFLICT` is reserved for genuinely contested resources like a taken handle.

### Pagination (where applicable)
Query params: `limit` (int, default 20, max 100) · `offset` (int, default 0)  
Response includes: `{ "items": [...], "total": int, "limit": int, "offset": int }`

### Area scoping (discovery endpoints)
Discovery surfaces (the Panel place list, contextual suggestions, map pins, friends' places) are **scoped to the area the user is looking at** and **capped** so the result stays scannable (MVP-1 Flows 9/10/12/14; "Show what's nearby, not everything"). Endpoints that feed those surfaces accept:

| Param | Type | Description |
|-------|------|-------------|
| `bbox` | string | `minLng,minLat,maxLng,maxLat` — the current map viewport / "Search this area" selection. Filters places to `lat/lng` inside the box. |
| `lat`, `lng` | float | Map center, used for proximity sort and as the area centroid when `bbox` is absent. |
| `cap` | int | Max place results to return for the area. Default **9** (the "6–9" cap is an open spec question; server clamps to ≤ 9). |

When `bbox` is omitted, the endpoint falls back to a radius around `lat`/`lng` (or recency when neither is given). The reverse-geocoded **area label** shown in the UI comes from `GET /geo/reverse` (below); it does not change the query.

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

### `lists`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `owner_id` | uuid | FK → `users.id` |
| `name` | text | 1–80 chars |
| `description` | text | Nullable; ≤280 chars |
| `visibility` | text | `public` \| `private`; default `private` |
| `is_default` | boolean | `true` for the seeded "Want to Go" list (one per user, not deletable) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `list_places`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `list_id` | uuid | FK → `lists.id` |
| `place_id` | text | FK → `places.id` |
| `position` | int | Manual ordering within the list |
| `added_at` | timestamptz | |
| UNIQUE | — | `(list_id, place_id)` — a place appears at most once per list |

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
| `plan_id` | uuid | FK → `plans.id`; nullable (set = plan link) |
| `list_id` | uuid | FK → `lists.id`; nullable (set = public-list link, Flow 19) |
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

**Tier: No relationship / one-way follower (or unauthenticated)**

A profile leads with the owner's **public Lists**. Following does not unlock additional profile content on its own (public Lists are already visible) — it's the precursor to a mutual follow. `relationship` is `none` or `following` accordingly.
```json
{
  "id": "uuid",
  "handle": "string",
  "display_name": "string",
  "avatar_url": "string | null",
  "bio": "string | null",
  "relationship": "none | following",
  "is_private": false,
  "lists": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string | null",
      "visibility": "public",
      "is_default": false,
      "place_count": 0,
      "places": [
        { "place_id": "string", "name": "string", "address": "string",
          "category": "string", "lat": 0.0, "lng": 0.0, "photo_url": "string | null" }
      ]
    }
  ]
}
```
Only `visibility: public` Lists are included for this tier. The `places` arrays power the **profile map** (the union of their places is what gets pinned). If `is_private: true`, return `403 FORBIDDEN` for unauthenticated users and non-followers.

**Tier: Mutual friend** (both users follow each other)

Mutual friends additionally see **all** the owner's Lists (public and private), the full saved-places set (for the profile map), and upcoming plans.
```json
{
  "id": "uuid",
  "handle": "string",
  "display_name": "string",
  "avatar_url": "string | null",
  "bio": "string | null",
  "relationship": "mutual",
  "is_private": false,
  "lists": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string | null",
      "visibility": "public | private",
      "is_default": false,
      "place_count": 0,
      "places": [
        { "place_id": "string", "name": "string", "address": "string",
          "category": "string", "lat": 0.0, "lng": 0.0, "photo_url": "string | null" }
      ]
    }
  ],
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
- `lists`: query `lists WHERE owner_id = target_id` filtered by visibility for the viewer's tier (`public` only for non-mutual; all for mutual or self), each joined to `list_places`/`places` ordered by `is_default DESC, created_at ASC, position ASC`. Cap `places` per list for the payload (e.g. first 50) and expose `place_count` for the rest.
- The **profile map** is the distinct union of the visible Lists' places; for the mutual tier it's the full `saved_places` set. The frontend can pin from either — see Flow 20.
- This **replaces** the former auto-derived `favorite_places` / `want_to_go` arrays. "Want to Go" is now the user's default List (`is_default = true`), returned inline in `lists`.
- `upcoming_plans`: query `plans` WHERE `organizer_id = target_id AND (planned_at IS NULL OR planned_at > now()) AND is_cancelled = false`. Only for mutual tier.
- `saved_places` never includes the target user's private `note` text.

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
      "is_saved": false,
      "match": {
        "kind": "name | category | note",
        "note_source": "own | friend | null",
        "note_handle": "string | null"
      }
    }
  ]
}
```
`is_saved` is `true` if the authenticated user has saved this place. `match` describes **why** the place surfaced (Flow 16). For `kind: note`, `note_source` is `own` or `friend` and `note_handle` carries the friend's handle for the provenance label ("matched @handle's note"). **The note text itself is never returned.**

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `q`, `lat`, or `lng` missing |

**Implementer notes:**
- **Two match sources, merged:**
  1. **Place text** — proxy to the place provider (Mapbox Geocoding: `GET .../mapbox.places/{q}.json?proximity={lng},{lat}&types=poi&limit={limit}`); these produce `match.kind = name | category`.
  2. **Notes** — query the **notes-enriched** path (Flow 16): match `user_places.note ILIKE '%q%'` over the viewer's own notes ∪ their mutual friends' notes (see the "Notes-enriched Search Query" in [tech/02](02-database-schema.md)). These produce `match.kind = note` with `note_source` / `note_handle`.
- **Merge & rank:** de-dupe by `place_id` (a place matched by both note and name keeps the **note** match — it's the differentiated signal). Order: own-note matches → friend-note matches → name/category matches; within each, by `distance_meters` ascending.
- Attach `is_saved` from `user_places WHERE user_id = me AND place_id IN (result_ids)`.
- Fire `search_note_matched` (PostHog) when ≥1 result has `match.kind = note`.
- The provider secret token lives in Lambda env vars; never expose it to the client.

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
| `lat` | float | Yes | Area centroid latitude (map center) |
| `lng` | float | Yes | Area centroid longitude |
| `bbox` | string | No | Current area box (see *Area scoping*); biases/limits suggestions to the area |
| `cap` | int | No | Max suggestions, default 9 (clamped ≤ 9) |
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
  "note": "string | null",
  "list_ids": ["uuid"]
}
```
`list_ids` (optional) — the Lists to add this place to (Flow 18). When omitted/empty, the place is added to the user's default **"Want to Go"** List so a save is never list-less.

**Success `201 Created`:**
```json
{
  "id": "uuid",
  "place_id": "string",
  "place_name": "string",
  "note": "string | null",
  "saved_at": "ISO8601",
  "list_ids": ["uuid"]
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `place_id` missing, or a `list_id` not owned by the user |
| 409 | `CONFLICT` | User has already saved this place (return existing record with `200` instead of 409 — idempotent save) |

**Implementer notes:**
- Before inserting into `user_places`, upsert the place into `places` (fetch from the place provider if not yet in DB).
- Use `INSERT ... ON CONFLICT (user_id, place_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now()` to make this idempotent.
- For each `list_id` (or the default list when none given), upsert a `list_places` row (`ON CONFLICT (list_id, place_id) DO NOTHING`). Validate every `list_id` is owned by the caller. Fire `place_added_to_list` per list added.
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
- Only mutual friends can call this endpoint and receive results. One-way followers do NOT get the full place list — they see the owner's **public Lists** (returned inline in `GET /users/:handle`, or via `GET /users/:handle/lists`).
- Verify mutual follow before querying `user_places`.

---

### `GET /users/me/friends/places`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `follows`, `user_places`, `places`, `users` |
| **PostHog** | — |

**Query params:** `lat`, `lng`, `bbox` (see *Area scoping*), `cap` (default 9)

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
- **Area-scoped:** filter to places inside `bbox` (or a radius around `lat`/`lng`); a friend's saves appear only when near the current area, never their whole global set (Flow 10). Return the nearest `cap` results.
- This powers the map view showing friends' place pins. Keep response payload lean — no notes, no saved_at.

---

### `GET /geo/reverse`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | — (geocoding provider proxy, cached) |
| **PostHog** | — |

Reverse-geocodes the map center to a short **area / neighborhood label** for the floating overlay (Flows 12/14). Display-only — it does not affect which places are queried (that's driven by `bbox`/`lat`/`lng`).

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | float | Yes | Map center latitude |
| `lng` | float | Yes | Map center longitude |

**Success `200 OK`:**
```json
{ "area_label": "Capitol Hill", "context": "Seattle" }
```

**Implementer notes:**
- Proxy to the geocoding provider's reverse endpoint, preferring a neighborhood-level result, falling back to locality, then a generic `"this area"` when nothing usable returns (Flow 14 sad path 14.1 — never error the UI over a missing label).
- Cache aggressively (coarse lat/lng grid, e.g. round to ~3 decimals) — labels change slowly and this is called on every area re-scope.

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

### Collaborative time proposals (Flow 4.3/4.4)

> Canonical spec: [tech/09 §10–11](09-materialization-workflow.md). Uses the current `plan_date` / `plan_time` / `plan_time_band` model (the legacy `planned_at` / `organizer_confirmed` wording elsewhere in this §4 predates the materialization rework — see tech/09; a full §4 cleanup is tracked separately). Each **option** is `{ plan_date, plan_time | null, plan_time_band | null }` with exactly one "when". `PATCH /plans/:plan_id` also accepts `plan_time_band` and **voids any pending proposal** when the organizer sets a time directly.

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /plans/:plan_id/proposals` | mutual friend, **not** organizer | Body `{ options: [...1–5], expires_in_days? (default 2, 1–14) }`. Plan must be timeless/tentative. Validates each option (future + opening hours; bands via the band window). **409** if a pending proposal already exists (one per plan). Notifies organizer `plan_time_proposed`; PostHog `time_proposed`. → `201` with the proposal. |
| `GET /plans/:plan_id/proposals` | viewer of plan | Organizer sees all; anyone else sees only their own. |
| `POST /plans/:plan_id/proposals/:id/accept` | organizer | Body `{ option_index }`. Writes the option → materializes (`plan_materialized` once, `plan_time_updated` to Joined ∪ Interested **minus the proposer**). Proposer gets `plan_proposal_accepted`; PostHog `time_proposal_accepted`. |
| `POST /plans/:plan_id/proposals/:id/decline` | organizer | Plan stays un-timed; proposer gets `plan_proposal_declined` (`reason=declined`); PostHog `time_proposal_declined`. |
| `DELETE /plans/:plan_id/proposals/:id` | proposer | Retract own pending proposal (frees the slot). Idempotent; PostHog `time_proposal_retracted`. |

**Errors:** `403` (organizer proposing on own plan; non-organizer accepting/declining), `404` (plan not visible — no existence leak; or proposal not found), `409` (pending proposal exists / already resolved), `422` (`OUTSIDE_OPENING_HOURS`, `TIME_IN_PAST`, `INVALID_REQUEST`).

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
| `bbox` | string | No | Current area box (see *Area scoping*); scopes place cards to the area |
| `cap` | int | No | Max place cards, default 9 (clamped ≤ 9) |
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
  3. **Place cards** (type `place`) — **area-scoped and capped** (see *Area scoping*; MVP-1 Flows 9/10):
     - Own saved places (source `own`)
     - Friends' saved places (source `friend`) — one entry per place per friend who saved it, **only when near the current area** (never a friend's whole global save set)
     - Contextual suggestions (source `contextual`) — call the same logic as `GET /places/contextual`; skip if no `lat`/`lng` provided
     - Filter to places inside `bbox` (or a radius around `lat`/`lng`), sort by `distance_meters ASC` (else `saved_at DESC`), and **return at most `cap` (default 9)** place cards combined.
- **Plan cards are not area-scoped** — plans are time-relevant, surface at the top, and are bounded by their own soonest-first ordering (the cap applies only to place cards).
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

## 11. Lists

User-curated collections of places (MVP-1 Flows 17–19). A place can belong to many Lists; each List is `public` or `private`. Every user has a non-deletable default **"Want to Go"** List (`is_default = true`).

### `GET /users/me/lists`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `lists`, `list_places` |
| **PostHog** | — |

Returns all of the caller's Lists (public and private), default first. Used to render the profile and to populate the "Add to List" picker on Place detail.

**Query params:** `place_id` (optional) — when present, each list includes `contains_place: bool` so the picker can pre-check the Lists this place is already in.

**Success `200 OK`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Want to Go",
      "description": "string | null",
      "visibility": "private",
      "is_default": true,
      "place_count": 12,
      "contains_place": false,
      "updated_at": "ISO8601"
    }
  ]
}
```

---

### `GET /users/:handle/lists`

| | |
|---|---|
| **Auth** | Public (response varies by relationship) |
| **Tables** | `users`, `follows`, `lists`, `list_places` |
| **PostHog** | `list_viewed` (on single-list open, see below) |

Returns the target user's Lists visible to the caller: **public only** for non-mutual viewers; **all** for mutual friends and self. Same item shape as `GET /users/me/lists` (no `contains_place`).

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Target profile is private and caller is not a follower |
| 404 | `NOT_FOUND` | Handle does not exist |

---

### `GET /lists/:list_id`

| | |
|---|---|
| **Auth** | Public (must be able to see the list) |
| **Tables** | `lists`, `list_places`, `places`, `users` |
| **PostHog** | `list_viewed` |

Returns one List with its ordered places — used by the List Page and by shared-link views (Flow 19). A `public` List is viewable by anyone (including via a direct share link even when the owner's profile is private); a `private` List is viewable only by its owner.

**Success `200 OK`:**
```json
{
  "id": "uuid",
  "name": "string",
  "description": "string | null",
  "visibility": "public | private",
  "is_default": false,
  "owner": { "handle": "string", "display_name": "string", "avatar_url": "string | null" },
  "is_owner": false,
  "places": [
    {
      "place_id": "string", "name": "string", "address": "string",
      "category": "string", "lat": 0.0, "lng": 0.0, "photo_url": "string | null",
      "position": 0
    }
  ]
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | List is private and caller is not the owner |
| 404 | `NOT_FOUND` | List does not exist |

**Implementer notes:** fire `list_viewed` with `{ list_id, is_owner }`. A private profile does not gate a direct `public` list link — the link resolves to the list view only, leaking no other profile content (Flow 19.2).

---

### `POST /lists`

| | |
|---|---|
| **Auth** | Authenticated |
| **Tables** | `lists` |
| **PostHog** | `list_created` |

**Request body:**
```json
{ "name": "string", "description": "string | null", "visibility": "public | private" }
```
`visibility` defaults to `private`.

**Success `201 Created`:** the created list object (same shape as a `GET /users/me/lists` item, `place_count: 0`).

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | `name` missing or > 80 chars; `description` > 280 chars |

---

### `PATCH /lists/:list_id`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `lists` |
| **PostHog** | `list_visibility_changed` (when `visibility` changes) |

Updates `name`, `description`, and/or `visibility`. The default "Want to Go" List can be renamed and re-scoped but **not** un-defaulted.

**Request body (all optional):**
```json
{ "name": "string", "description": "string | null", "visibility": "public | private" }
```

**Success `200 OK`:** the updated list object.

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Caller is not the owner |
| 404 | `NOT_FOUND` | List does not exist |

**Implementer notes:** flipping `public → private` immediately removes the list from the owner's profile for non-owners and causes existing share links to 404 (Flow 19.1). Fire `list_visibility_changed` with `{ list_id, visibility }`.

---

### `DELETE /lists/:list_id`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `lists`, `list_places` (cascade) |
| **PostHog** | — |

**Success `204 No Content`**

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Caller is not the owner |
| 409 | `CONFLICT` | Attempt to delete the default `is_default` list (not allowed — empty it or make it private instead) |
| 404 | `NOT_FOUND` | List does not exist |

**Implementer notes:** deleting a List removes its `list_places` rows (FK cascade) but **never** unsaves the underlying places (`user_places` is untouched).

---

### `PUT /lists/:list_id/places/:place_id`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `list_places`, `places` (upsert) |
| **PostHog** | `place_added_to_list` |

Adds a place to a List (idempotent). Upserts the place into `places` first if needed. Optional body `{ "position": int }` to place it at a specific spot; defaults to the end.

**Success `200 OK`:** `{ "list_id": "uuid", "place_id": "string", "position": 0 }`

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Caller is not the list owner |
| 404 | `NOT_FOUND` | List does not exist |

---

### `DELETE /lists/:list_id/places/:place_id`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `list_places` |
| **PostHog** | `place_removed_from_list` |

Removes a place from a List. **Does not** unsave the place or remove it from other Lists (Flow 17.4 / Flow 19).

**Success `204 No Content`**

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | `FORBIDDEN` | Caller is not the list owner |
| 404 | `NOT_FOUND` | List or membership does not exist |

---

### `PATCH /lists/:list_id/order`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `list_places` |
| **PostHog** | — |

Reorders places within a List. Body: `{ "place_ids": ["string", ...] }` — the full desired order; the server rewrites `position` to match the array index.

**Success `200 OK`:** `{ "ok": true }`. Last-write-wins on concurrent reorders (Flow 17.6).

---

### `POST /lists/:list_id/share`

| | |
|---|---|
| **Auth** | Authenticated (owner only) |
| **Tables** | `invite_links` (reuses the invite-link mechanism) |
| **PostHog** | `list_shared` |

Mints (or returns) a shareable link for a **public** List, reusing the invite-link infrastructure (§8). Returns `{ "token": "string", "url": "string" }`.

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 409 | `CONFLICT` | List is `private` — make it public before sharing |
| 403 | `FORBIDDEN` | Caller is not the owner |

> **Implementer note:** add a nullable `list_id` to `invite_links` (alongside the existing `plan_id`) so a link can target a plan, a profile, or a list. Update `GET /invite-links/:token` to resolve a list target to the List view.

---

## Scheduled Jobs (Lambda Cron — not Flask routes)

These are not API endpoints but are critical to the product and must be implemented alongside the API.

### Plan reminders

**Full spec:** [tech/09-materialization-workflow.md §5](09-materialization-workflow.md). Implemented in `backend/app/jobs/reminders.py`; dev-triggerable via `POST /api/v1/dev/run-reminders`.

**Trigger:** Lambda cron every 30–60 min (frequency only affects latency near the local-time boundaries; delivery is idempotent so over-running is safe).

**Model:** A plan's three states are derived from `is_timeless` / `plan_date` / `plan_time` / `plan_time_band` (not a single `planned_at`). Reminder behavior by state, evaluated in the **place's local timezone** (`places.utc_offset_minutes`):

| Plan state | Cron behavior |
|---|---|
| **Timeless** (no date) | **Never reminded** (M-D2a). Want-to-Go is ambient intent; the Interested signal is its only nudge. No expiry. |
| **Tentative** (date, no when) | Organizer gets `plan_reminder_day_before` (plan_date = tomorrow) then `plan_reminder_morning` (plan_date = today). If the date passes with no when → one `plan_date_passed` card offering to recreate the intent (M-D6a). |
| **Confirmed** (date + exact time **or** band) | Organizer **and joiners** get day-before + morning-of attendance reminders. For an **approximate** (band) plan the morning-of card carries `plan_time_band` → a "lock in an exact time?" nudge for the organizer (M-D20). Band plans never get `plan_date_passed`. |

**Proposal expiry (M-D17):** the same job first sweeps `plan_time_proposals` where `status='pending' AND expires_at < now()`, flips them to `expired`, and notifies the proposer (`plan_proposal_declined`, `reason=expired`). Returned in the job's `expired` count; `POST /api/v1/dev/run-reminders` → `{day_before, morning_of, date_passed, expired}`.

**Idempotency:** every reminder insert is deduped on `(user_id, type, plan_id)`, and the proposal-expiry sweep is guarded by the `pending → expired` status flip, so the job may run any number of times per day without duplicates. Past plans are excluded from the Panel by the `is_past` filter, not deleted.

This replaces the earlier "resolution for implementer" note (which predated the `is_timeless`/`plan_date`/`plan_time` schema and the resolved materialization decisions).
