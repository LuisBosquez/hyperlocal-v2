# Database Schema — Hyperlocal MVP-1

> **Audience:** AI agents implementing the database layer as discrete tasks.
> **Database:** Supabase (hosted Postgres 15), region: us-east-1.
> **Approach:** Each table section is a self-contained implementation unit.
> **Last updated:** 2026-05-15

---

## Prerequisites

Run these once before applying any table DDL:

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable PostGIS for future geo queries (install now, use bounding box for MVP-1)
CREATE EXTENSION IF NOT EXISTS "postgis";

-- pgcrypto for token generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm for fuzzy / substring matching on personal notes (notes-enriched search, Flow 16)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

Supabase automatically creates the `auth` schema and `auth.users` table. All tables in this document live in the `public` schema. The `public.users` table is a profile extension of `auth.users` — its `id` is a foreign key to `auth.users(id)`.

---

## Tables

---

### `users`

Stores the public profile data for every registered user. Created after Google OAuth completes and the user picks a handle (Flow 1). The `id` column matches the user's `auth.users.id` (Supabase Auth UUID).

```sql
CREATE TABLE public.users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle           TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  bio              TEXT,
  avatar_url       TEXT,                        -- URL to profile photo (Supabase Storage)
  is_private       BOOLEAN NOT NULL DEFAULT FALSE,
  instagram_handle TEXT,
  twitter_handle   TEXT,
  facebook_url     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_handle_unique UNIQUE (handle),
  CONSTRAINT users_handle_format CHECK (handle ~ '^[a-z0-9_]{3,30}$')
);

COMMENT ON TABLE public.users IS
  'Public user profiles. id is a FK to auth.users(id).';
COMMENT ON COLUMN public.users.handle IS
  'Lowercase alphanumeric + underscore, 3-30 chars. Unique. Set during onboarding.';
COMMENT ON COLUMN public.users.is_private IS
  'When true, non-followers see only that the profile exists — no places, no follow action.';
```

**Indexes:**
```sql
CREATE UNIQUE INDEX users_handle_idx ON public.users (handle);
```

**Trigger (keep updated_at current):**
```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### `places`

A cache of Google Places API results. Flask upserts a row the first time any user interacts with a place. No user-generated places. The `google_place_id` is the canonical identifier from Google Places.

```sql
CREATE TABLE public.places (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  google_place_id  TEXT NOT NULL,
  name             TEXT NOT NULL,
  address          TEXT NOT NULL,
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  category         TEXT,                        -- e.g. 'restaurant', 'museum', 'park', 'bar'
  opening_hours    JSONB,                       -- Google Places opening_hours.periods array
  photo_url        TEXT,                        -- First photo reference URL from Google Places
  description      TEXT,                        -- editorial_summary or types-derived description
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT places_google_place_id_unique UNIQUE (google_place_id)
);

COMMENT ON TABLE public.places IS
  'Cached Google Places API results. One row per unique Google place_id.';
COMMENT ON COLUMN public.places.opening_hours IS
  'Stored as Google Places API periods array. Format: [{open: {day, time}, close: {day, time}}].
   Used by Flask to validate plan_time against opening hours.';
COMMENT ON COLUMN public.places.category IS
  'Normalized category derived from Google Places types array.
   Used for contextual suggestions (Flow 12).';
```

**Indexes:**
```sql
CREATE UNIQUE INDEX places_google_place_id_idx ON public.places (google_place_id);

-- Bounding box queries for map view (GET /api/map/places?bounds=...)
CREATE INDEX places_lat_lng_idx ON public.places (lat, lng);

-- Category filter for contextual suggestions
CREATE INDEX places_category_idx ON public.places (category);
```

**Trigger:**
```sql
CREATE TRIGGER places_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### `user_places`

The "saved places" relationship — one row per user-place pair. Saving a place (Flow 3.1, 3.2) creates this record. Creating a plan for a place that isn't already saved auto-creates this record (Flow 4.1). Unsaving deletes the row.

```sql
CREATE TABLE public.user_places (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  place_id   UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  note       TEXT,                              -- personal note, max 500 chars
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_places_unique UNIQUE (user_id, place_id),
  CONSTRAINT user_places_note_length CHECK (char_length(note) <= 500)
);

COMMENT ON TABLE public.user_places IS
  'A user''s saved places. One row per (user, place) pair.
   Creating a plan for an unsaved place auto-creates this row.';
```

**Indexes:**
```sql
-- Panel feed: all saved places for a user
CREATE INDEX user_places_user_id_idx ON public.user_places (user_id);

-- Reverse: which users saved a given place
CREATE INDEX user_places_place_id_idx ON public.user_places (place_id);

-- Composite: fast lookup for "is this place saved by this user?"
CREATE UNIQUE INDEX user_places_user_place_idx ON public.user_places (user_id, place_id);

-- Notes-enriched search (Flow 16): trigram index over the note text so that
-- `note ILIKE '%cortado%'` (and similarity matching) stays fast. The search query
-- restricts rows to the viewer's own notes ∪ their mutual friends' notes before
-- matching, so this index backs the substring/fuzzy match within that set.
CREATE INDEX user_places_note_trgm_idx ON public.user_places
  USING gin (note gin_trgm_ops);
```

**Trigger:**
```sql
CREATE TRIGGER user_places_updated_at
  BEFORE UPDATE ON public.user_places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### `lists`

User-curated collections of places (Flows 17–19) — the curation primitive (think Spotify playlists, but for places). A List has an owner, a name, an optional description, and a **visibility** (`public` shows on the owner's profile to anyone; `private` is owner-only). Every user is seeded a default **"Want to Go"** List (`is_default = true`), which is where a plain save lands and which cannot be deleted (only emptied or made private).

> **Naming note (open):** "Want to Go" historically also denotes *places with a timeless plan* (Flow 4.2 / materialization worksheet). The default List reuses the name for the *save bucket*. The collision is tracked in the MVP-1 spec Open Questions and must be resolved before implementation — see [tech/09](09-materialization-workflow.md).

```sql
CREATE TYPE list_visibility AS ENUM ('public', 'private');

CREATE TABLE public.lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  visibility  list_visibility NOT NULL DEFAULT 'private',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,  -- the seeded "Want to Go" list
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lists_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT lists_description_length CHECK (char_length(description) <= 280)
);

COMMENT ON TABLE public.lists IS
  'User-created collections of places. visibility=public surfaces on the owner''s profile.
   is_default marks the seeded "Want to Go" list (one per user, not deletable).';
COMMENT ON COLUMN public.lists.visibility IS
  'public: visible to anyone on the owner''s profile and via a share link.
   private: owner-only.';
```

**Indexes:**
```sql
-- All lists owned by a user (profile render, "add to list" picker)
CREATE INDEX lists_owner_id_idx ON public.lists (owner_id);

-- Public lists for a profile, fetched by non-owners
CREATE INDEX lists_owner_visibility_idx ON public.lists (owner_id, visibility);

-- Enforce exactly one default ("Want to Go") list per user
CREATE UNIQUE INDEX lists_one_default_per_owner_idx ON public.lists (owner_id)
  WHERE is_default;
```

**Trigger:**
```sql
CREATE TRIGGER lists_updated_at
  BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### `list_places`

The membership join between `lists` and `places` — many-to-many, so the same place can live in multiple Lists (Flow 18). A row here is independent of the underlying `user_places` save: removing a place from a List does not unsave it, and unsaving does not require removing it from Lists (though the app keeps them aligned in practice). `position` supports manual reordering within a List.

```sql
CREATE TABLE public.list_places (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id    UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  place_id   UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,  -- manual ordering within the list
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT list_places_unique UNIQUE (list_id, place_id)
);

COMMENT ON TABLE public.list_places IS
  'Place membership in a list (many-to-many). A place may belong to many lists.
   Independent of user_places — removing here never unsaves the place.';
```

**Indexes:**
```sql
-- Render a list's places in order
CREATE INDEX list_places_list_id_position_idx ON public.list_places (list_id, position ASC);

-- "Which of my lists is this place in?" (Place detail "Add to list" state)
CREATE INDEX list_places_place_id_idx ON public.list_places (place_id);
```

---

### `plans`

A Plan is a place + an optional date + an optional "when" — an exact `plan_time` **or** a coarse `plan_time_band` (morning/afternoon/evening). The derived `state` stays a 3-value union; `confirmed` covers both an exact time and a band, distinguished by `time_granularity` (`exact` | `approximate`):

| State | `is_timeless` | `plan_date` | `plan_time` | `plan_time_band` | Description |
|---|---|---|---|---|---|
| Timeless | `true` | `NULL` | `NULL` | `NULL` | No date/time commitment — pure intent. (Historically called "Want to Go"; the name now also denotes the default `lists` save bucket — see the naming note on `lists` and the spec Open Questions.) |
| Tentative | `false` | set | `NULL` | `NULL` | Date set, no "when" yet — shows "Add time" prompt; eligible for time proposals (Flow 4.3) |
| Confirmed (approximate) | `false` | set | `NULL` | set | Coarse band, e.g. "Saturday afternoon" — soft-confirmed; organizer gets a day-of nudge to refine (M-D19) |
| Confirmed (exact) | `false` | set | set | `NULL` | Full plan — exact date and time |

At most one of (`plan_time`, `plan_time_band`) is set. A band is a real materialized "when": `plan_materialized` fires on the first band-or-exact set (M-D20). See [tech/09 §11](../tech/09-materialization-workflow.md).

Plans survive their organizer's cancellation — the `status` field records the organizer's action, but `plan_joins` rows are preserved for joiners.

```sql
CREATE TYPE plan_status AS ENUM ('active', 'cancelled');

CREATE TABLE public.plans (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  place_id     UUID NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  plan_date      DATE,                          -- NULL when is_timeless = true
  plan_time      TIME,                          -- exact time; NULL for timeless/tentative or band-only
  plan_time_band TEXT,                           -- coarse band (M-D19); mutually exclusive with plan_time
  is_timeless    BOOLEAN NOT NULL DEFAULT FALSE,
  status         plan_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plans_timeless_no_date CHECK (
    (is_timeless = TRUE AND plan_date IS NULL AND plan_time IS NULL)
    OR (is_timeless = FALSE AND plan_date IS NOT NULL)
  ),
  CONSTRAINT plans_time_requires_date CHECK (
    plan_time IS NULL OR plan_date IS NOT NULL
  ),
  CONSTRAINT plans_band_values CHECK (
    plan_time_band IS NULL OR plan_time_band IN ('morning', 'afternoon', 'evening')
  ),
  CONSTRAINT plans_band_requires_date CHECK (
    plan_time_band IS NULL OR plan_date IS NOT NULL
  ),
  CONSTRAINT plans_one_time_kind CHECK (
    NOT (plan_time IS NOT NULL AND plan_time_band IS NOT NULL)
  )
);

COMMENT ON TABLE public.plans IS
  'A plan to visit a place. Survives organizer cancellation (status = cancelled).
   Joiners retain their plan_joins rows regardless of status.';
COMMENT ON COLUMN public.plans.is_timeless IS
  'TRUE = no date or time set ("Want to Go" intent). FALSE = date is set (time may be null).';
COMMENT ON COLUMN public.plans.plan_time_band IS
  'Coarse time band (morning/afternoon/evening) when a rough time was committed instead
   of an exact one (M-D19). Mutually exclusive with plan_time; soft-confirms the plan.';
COMMENT ON COLUMN public.plans.status IS
  'active: plan is live. cancelled: organizer cancelled but plan persists for joiners.';
```

> Added in [migration 004](../backend/migrations/004_time_proposals.sql): `plan_time_band` + the band constraints.

**Indexes:**
```sql
-- Panel feed: find all active plans by a specific organizer
CREATE INDEX plans_organizer_id_idx ON public.plans (organizer_id);

-- Sort plans by date for Panel display
CREATE INDEX plans_date_time_idx ON public.plans (plan_date ASC NULLS LAST, plan_time ASC NULLS LAST);

-- Filter by status (most queries exclude cancelled plans for non-joiners)
CREATE INDEX plans_status_idx ON public.plans (status);

-- Composite: friends' active plans sorted by date (primary Panel feed query)
CREATE INDEX plans_organizer_status_date_idx ON public.plans (organizer_id, status, plan_date);
```

**Trigger:**
```sql
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### `plan_interests`

Records "Interested" taps (Flow 8.2). Not a commitment to attend — a lightweight signal. When the organizer adds/updates a time, Flask queries this table to send notifications to all interested users.

```sql
CREATE TABLE public.plan_interests (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plan_interests_unique UNIQUE (user_id, plan_id)
);

COMMENT ON TABLE public.plan_interests IS
  '"Interested" signal on a friend''s plan. Not a join commitment.
   Triggers notification when organizer adds/updates plan time.';
```

**Indexes:**
```sql
-- Look up who is interested in a plan (organizer view, interest count)
CREATE INDEX plan_interests_plan_id_idx ON public.plan_interests (plan_id);

-- Look up a user's expressed interests (user's Panel feed)
CREATE INDEX plan_interests_user_id_idx ON public.plan_interests (user_id);
```

---

### `plan_joins`

Records "Joined" confirmations (Flow 8). A join means the plan appears in the joiner's Panel and they are listed as an attendee.

```sql
CREATE TABLE public.plan_joins (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plan_joins_unique UNIQUE (user_id, plan_id)
);

COMMENT ON TABLE public.plan_joins IS
  'Formal join of a plan. Plan appears in joiner''s Panel.
   Row is retained even if organizer cancels (plan survives its organizer).';
```

**Indexes:**
```sql
-- Attendee list for a plan
CREATE INDEX plan_joins_plan_id_idx ON public.plan_joins (plan_id);

-- All plans a user has joined (for their Panel)
CREATE INDEX plan_joins_user_id_idx ON public.plan_joins (user_id);
```

---

### `plan_time_proposals`

Collaborative materialization (Flow 4.3/4.4, [tech/09 §10](../tech/09-materialization-workflow.md)). Any mutual friend who can join a **timeless/tentative** plan may propose 1..N time options; the **organizer** accepts one (→ the plan materializes), declines all, or lets the proposal expire. Added in [migration 004](../backend/migrations/004_time_proposals.sql).

```sql
CREATE TABLE public.plan_time_proposals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  proposer_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  options         JSONB NOT NULL DEFAULT '[]',
  expires_at      TIMESTAMPTZ NOT NULL,         -- proposer-set; default now()+48h (M-D17)
  accepted_option INTEGER,                       -- index into options when status='accepted'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.plan_time_proposals IS
  'A non-organizer''s proposed time options on a timeless/tentative plan (Flow 4.3).
   The organizer accepts one option (→ plan materializes, M-D15), declines all, or
   lets it expire (M-D17/M-D18). At most one pending proposal per plan (M-D16).';
COMMENT ON COLUMN public.plan_time_proposals.options IS
  'JSONB array of { plan_date, plan_time|null, plan_time_band|null } — each option has
   exactly one of plan_time / plan_time_band. accepted_option indexes into this array.';
```

**Indexes:**
```sql
-- One pending proposal per plan (M-D16); app code also pre-checks → 409.
CREATE UNIQUE INDEX one_pending_proposal_per_plan
  ON public.plan_time_proposals (plan_id) WHERE status = 'pending';

CREATE INDEX plan_time_proposals_plan_id_idx     ON public.plan_time_proposals (plan_id);
CREATE INDEX plan_time_proposals_proposer_id_idx ON public.plan_time_proposals (proposer_id);

-- Cron expiry pass: pending proposals past expires_at.
CREATE INDEX plan_time_proposals_pending_expiry_idx
  ON public.plan_time_proposals (status, expires_at);
```

**Trigger:**
```sql
CREATE TRIGGER plan_time_proposals_updated_at
  BEFORE UPDATE ON public.plan_time_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

### `follows`

One-directional follow relationships. No approval required (Flow 6). Mutual follows (both rows exist) = "friends" — unlocks full plan visibility.

```sql
CREATE TABLE public.follows (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT follows_unique UNIQUE (follower_id, followee_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id != followee_id)
);

COMMENT ON TABLE public.follows IS
  'One-way follow relationship. Mutual follows (both rows exist) = friends.
   No approval step — follow is immediate.';
```

**Indexes:**
```sql
-- "Who does user X follow?" — used in Panel feed query to find friends' plans
CREATE INDEX follows_follower_id_idx ON public.follows (follower_id);

-- "Who follows user X?" — used for notification on new follow
CREATE INDEX follows_followee_id_idx ON public.follows (followee_id);

-- Mutual friend check: does a reverse row exist? (follower_id, followee_id) pair lookup
CREATE UNIQUE INDEX follows_pair_idx ON public.follows (follower_id, followee_id);
```

---

### `notifications`

In-app notification records delivered as Notification cards in The Panel (Flow 6, 8.2, 4.2). Realtime broadcasts on INSERT. Browser alerts are driven by these rows.

```sql
CREATE TYPE notification_type AS ENUM (
  'new_follower',           -- someone followed you
  'follow_back_prompt',     -- a user you follow has followed you back
  'plan_time_updated',      -- organizer set/changed a time; sent to Joined ∪ Interested (M-D7a)
  'plan_reminder_day_before', -- day-before reminder for an upcoming plan
  'plan_reminder_morning',  -- morning-of reminder for an upcoming plan
  'plan_date_passed',       -- tentative plan's date passed with no time set (M-D6a)
  'friend_joined_plan',     -- a mutual friend joined your plan
  'plan_cancelled',         -- a plan you joined was cancelled by organizer
  'plan_time_proposed',     -- a friend proposed time options on your plan (Flow 4.3, M-D14)
  'plan_proposal_accepted', -- the organizer picked one of your proposed times (M-D15)
  'plan_proposal_declined'  -- your proposal was declined / expired / superseded (M-D18)
);

CREATE TABLE public.notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',      -- IDs and display info needed to render the card
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'In-app notification records. One row per notification per recipient.
   Realtime broadcasts on INSERT to drive live Panel updates.
   data JSONB schema varies by type — see below.';

COMMENT ON COLUMN public.notifications.data IS
  'new_follower:        { follower_id, follower_handle, follower_avatar_url }
   follow_back_prompt:  { follower_id, follower_handle }
   plan_time_updated:   { plan_id, organizer_handle, place_name, plan_date, plan_time }
   plan_reminder_*:     { plan_id, place_name, plan_date, plan_time }
   plan_date_passed:    { plan_id, place_id, place_name }
   friend_joined_plan:  { plan_id, joiner_handle, joiner_avatar_url, place_name }
   plan_cancelled:      { plan_id, organizer_handle, place_name }
   plan_time_proposed:     { plan_id, proposer_handle, place_name, option_count, expires_at }
   plan_proposal_accepted: { plan_id, place_name, plan_date, plan_time, plan_time_band }
   plan_proposal_declined: { plan_id, place_name, reason }';
```

**Indexes:**
```sql
-- Fetch all unread notifications for a user (Panel load)
CREATE INDEX notifications_user_id_read_idx ON public.notifications (user_id, is_read, created_at DESC);

-- Realtime filter: subscribe to notifications for a specific user
CREATE INDEX notifications_user_id_idx ON public.notifications (user_id);
```

---

### `invite_links`

Shareable links generated from Plan cards (Flow 4.1). Tracked for the invite conversion rate metric. A link can be tied to a specific plan or to a user profile. Anyone can view the linked plan/profile; signing up via the link records `used_by`.

```sql
CREATE TABLE public.invite_links (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token      TEXT NOT NULL,                    -- URL-safe random token, e.g. gen_random_bytes(12)
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id    UUID REFERENCES public.plans(id) ON DELETE SET NULL,  -- set = plan link
  list_id    UUID REFERENCES public.lists(id) ON DELETE SET NULL,  -- set = public-list link (Flow 19)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                      -- null = no expiry
  used_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- null = not yet used
  used_at    TIMESTAMPTZ,

  CONSTRAINT invite_links_token_unique UNIQUE (token)
);

COMMENT ON TABLE public.invite_links IS
  'Shareable invite links. Target precedence: plan_id set = plan link; list_id set = public-list link;
   both NULL = generic profile share link. used_by tracks new user acquisition for the conversion metric.';
```

**Indexes:**
```sql
-- Token lookup (every invite link request)
CREATE UNIQUE INDEX invite_links_token_idx ON public.invite_links (token);

-- Fetch all links created by a user
CREATE INDEX invite_links_created_by_idx ON public.invite_links (created_by);
```

---

### `events` (Telemetry)

Server-side telemetry events powering the 9 success metrics defined in the MVP-1 spec. All 9 events are inserted here by Flask (not client-side) for data integrity. PostHog Python SDK also captures these for the analytics dashboard.

```sql
CREATE TABLE public.events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name TEXT NOT NULL,
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- null for anonymous
  session_id UUID,                             -- groups events within a browser session
  properties JSONB NOT NULL DEFAULT '{}',      -- arbitrary event properties
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.events IS
  'Server-confirmed telemetry events. All 9 MVP-1 metric events inserted here by Flask.
   PostHog Python SDK also captures these concurrently for the analytics dashboard.
   No reads via API — analytics consumed via PostHog UI or service-role queries.';

COMMENT ON COLUMN public.events.event_name IS
  'Core loop: invite_link_shared, invite_link_converted, user_active_session,
   plan_created, place_saved, plan_interested, plan_joined, plan_materialized,
   mutual_connection_formed.
   Discovery & curation: search_note_matched, area_rescoped, locate_me_tapped,
   list_created, place_added_to_list, place_removed_from_list,
   list_visibility_changed, list_shared, list_viewed, profile_map_pin_tapped.';
```

**Indexes:**
```sql
-- Time-series queries for metrics
CREATE INDEX events_event_name_created_at_idx ON public.events (event_name, created_at DESC);

-- Per-user event history
CREATE INDEX events_user_id_idx ON public.events (user_id);
```

---

## Foreign Key Relationship Map

```
auth.users (Supabase managed)
    └── public.users (id → auth.users.id)
            ├── user_places.user_id
            ├── lists.owner_id
            ├── plans.organizer_id
            ├── plan_interests.user_id
            ├── plan_joins.user_id
            ├── follows.follower_id
            ├── follows.followee_id
            ├── notifications.user_id
            ├── invite_links.created_by
            ├── invite_links.used_by
            └── events.user_id

public.places (id)
    ├── user_places.place_id
    ├── list_places.place_id
    └── plans.place_id

public.lists (id)
    └── list_places.list_id

public.plans (id)
    ├── plan_interests.plan_id
    ├── plan_joins.plan_id
    └── invite_links.plan_id
```

---

## Query Patterns & Index Rationale

### Panel Feed Query (most critical)

Fetches Plan cards for a user's Panel: own plans + mutual friends' plans, sorted by date.

```sql
-- Step 1: get mutual friend IDs
WITH mutual_friends AS (
  SELECT f1.followee_id AS friend_id
  FROM follows f1
  JOIN follows f2
    ON f2.follower_id = f1.followee_id
   AND f2.followee_id = f1.follower_id
  WHERE f1.follower_id = :user_id
),
-- Step 2: own plans + friends' plans
panel_plans AS (
  SELECT p.*,
         u.handle AS organizer_handle,
         u.avatar_url AS organizer_avatar,
         pl.name AS place_name,
         pl.address AS place_address,
         COUNT(pj.id) AS join_count,
         COUNT(pi.id) AS interest_count
  FROM plans p
  JOIN public.users u ON u.id = p.organizer_id
  JOIN places pl ON pl.id = p.place_id
  LEFT JOIN plan_joins pj ON pj.plan_id = p.id
  LEFT JOIN plan_interests pi ON pi.plan_id = p.id
  WHERE p.organizer_id = :user_id
     OR p.organizer_id IN (SELECT friend_id FROM mutual_friends)
  GROUP BY p.id, u.handle, u.avatar_url, pl.name, pl.address
)
SELECT * FROM panel_plans
ORDER BY
  plan_date ASC NULLS LAST,
  plan_time ASC NULLS LAST,
  created_at DESC;
```

**Indexes used:** `follows_follower_id_idx`, `follows_followee_id_idx`, `plans_organizer_status_date_idx`, `plan_joins_plan_id_idx`, `plan_interests_plan_id_idx`.

### Map Places Query

Fetches pins within a viewport bounding box for the authenticated user + mutual friends.

```sql
WITH mutual_friend_ids AS (
  SELECT f1.followee_id
  FROM follows f1
  JOIN follows f2
    ON f2.follower_id = f1.followee_id
   AND f2.followee_id = :user_id
  WHERE f1.follower_id = :user_id
)
SELECT
  pl.id, pl.name, pl.lat, pl.lng, pl.category,
  up.user_id AS saved_by,
  u.handle AS saved_by_handle,
  u.avatar_url AS saved_by_avatar
FROM user_places up
JOIN places pl ON pl.id = up.place_id
JOIN public.users u ON u.id = up.user_id
WHERE up.user_id = :user_id
   OR up.user_id IN (SELECT followee_id FROM mutual_friend_ids)
  AND pl.lat BETWEEN :sw_lat AND :ne_lat
  AND pl.lng BETWEEN :sw_lng AND :ne_lng;
```

**Indexes used:** `user_places_user_id_idx`, `follows_follower_id_idx`, `places_lat_lng_idx`.

### Profile Page Query (mutual friend view)

```sql
-- Saved places list
SELECT pl.*, up.note, up.saved_at
FROM user_places up
JOIN places pl ON pl.id = up.place_id
WHERE up.user_id = :profile_user_id
ORDER BY up.saved_at DESC;

-- Upcoming active plans
SELECT p.*, pl.name AS place_name, pl.address
FROM plans p
JOIN places pl ON pl.id = p.place_id
WHERE p.organizer_id = :profile_user_id
  AND p.status = 'active'
  AND (p.plan_date >= CURRENT_DATE OR p.is_timeless = TRUE)
ORDER BY p.plan_date ASC NULLS LAST;
```

### Profile Page Query (Lists — replaces the old curated-list derivation)

User-curated **Lists** are now the primary expression of taste on a profile. A non-mutual viewer sees only `public` Lists; a mutual friend (or the owner) sees all of them. The old auto-derived "Favorite Places" / "Want to Go" SQL is gone — these are now rows in `lists` / `list_places`.

```sql
-- Lists visible to the viewer, with their places (ordered).
-- :viewer_can_see_private is TRUE for the owner or a mutual friend, else FALSE.
SELECT l.id, l.name, l.description, l.visibility, l.is_default,
       lp.position, pl.id AS place_id, pl.name AS place_name,
       pl.address, pl.category, pl.lat, pl.lng, pl.photo_url
FROM lists l
LEFT JOIN list_places lp ON lp.list_id = l.id
LEFT JOIN places pl ON pl.id = lp.place_id
WHERE l.owner_id = :profile_user_id
  AND (l.visibility = 'public' OR :viewer_can_see_private)
ORDER BY l.is_default DESC, l.created_at ASC, lp.position ASC;
```

The **profile map** pins the distinct places across the viewer-visible Lists (mutual friends additionally see the full `user_places` set — same query as the mutual-friend saved-places query above).

### Notes-enriched Search Query (Flow 16)

Searches place name/category **and** personal notes — the viewer's own notes plus their mutual friends' notes. Note matches carry **provenance** (whose note matched) and are ranked above name-only matches. The viewer's own note outranks a friend's for the same place.

```sql
WITH searchable_notes AS (
  -- own notes + mutual friends' notes only
  SELECT up.place_id, up.user_id, up.note,
         (up.user_id = :viewer_id) AS is_own
  FROM user_places up
  WHERE up.note IS NOT NULL
    AND (
      up.user_id = :viewer_id
      OR public.are_mutual_friends(:viewer_id, up.user_id)
    )
    AND up.note ILIKE '%' || :q || '%'
)
SELECT pl.id AS place_id, pl.name, pl.address, pl.category, pl.lat, pl.lng,
       -- strongest match wins: own note > friend note
       bool_or(sn.is_own) AS matched_own_note,
       -- a friend handle to attribute the match (only when not own)
       (ARRAY_AGG(u.handle) FILTER (WHERE NOT sn.is_own))[1] AS matched_friend_handle
FROM searchable_notes sn
JOIN places pl ON pl.id = sn.place_id
JOIN public.users u ON u.id = sn.user_id
GROUP BY pl.id, pl.name, pl.address, pl.category, pl.lat, pl.lng;
```

**Notes:** the API returns only a **provenance label** ("matched your note" / "matched @handle's note") — never the note text itself (privacy boundary, MVP-1 spec Flow 16). Name/category matches come from the place-search path and are merged with these note matches, note matches ranked first. `user_places_note_trgm_idx` backs the `ILIKE`.

---

## Row-Level Security (RLS) Policies

RLS is enabled on all tables. Flask uses the service role key (bypasses RLS); these policies govern any direct Supabase JS client access. All policies use `auth.uid()` from the user's JWT.

Enable RLS on all tables:

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_joins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
```

### Helper Function: mutual follow check

```sql
CREATE OR REPLACE FUNCTION public.are_mutual_friends(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM follows f1
    JOIN follows f2
      ON f2.follower_id = f1.followee_id
     AND f2.followee_id = f1.follower_id
    WHERE f1.follower_id = user_a
      AND f1.followee_id = user_b
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

### `users` policies

```sql
-- Public read for non-private profiles; own profile always readable
CREATE POLICY "users_read" ON public.users
  FOR SELECT USING (
    NOT is_private
    OR auth.uid() = id
  );

-- Users can only update their own record
CREATE POLICY "users_update" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert handled by server-side trigger after auth.users creation
CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
```

### `places` policies

```sql
-- Places are public read (no personal data)
CREATE POLICY "places_read" ON public.places
  FOR SELECT USING (true);

-- Only service role can insert/update (via Flask — no direct client writes)
-- No client INSERT/UPDATE/DELETE policies — Flask uses service role key
```

### `user_places` policies

```sql
-- Own: full access
CREATE POLICY "user_places_own" ON public.user_places
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Mutual friends: read access only
CREATE POLICY "user_places_friends_read" ON public.user_places
  FOR SELECT USING (
    public.are_mutual_friends(auth.uid(), user_id)
  );
```

### `lists` policies

```sql
-- Owner: full access to their own lists
CREATE POLICY "lists_own" ON public.lists
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Anyone (incl. anon) can read a public list; mutual friends can also read private ones
CREATE POLICY "lists_public_read" ON public.lists
  FOR SELECT USING (
    visibility = 'public'
    OR auth.uid() = owner_id
    OR public.are_mutual_friends(auth.uid(), owner_id)
  );
```

### `list_places` policies

```sql
-- Owner of the parent list: full access
CREATE POLICY "list_places_owner" ON public.list_places
  FOR ALL USING (
    EXISTS (SELECT 1 FROM lists l WHERE l.id = list_id AND l.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM lists l WHERE l.id = list_id AND l.owner_id = auth.uid())
  );

-- Read membership for any list the reader is allowed to see (mirrors lists_public_read)
CREATE POLICY "list_places_readable" ON public.list_places
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lists l
      WHERE l.id = list_id
        AND (
          l.visibility = 'public'
          OR l.owner_id = auth.uid()
          OR public.are_mutual_friends(auth.uid(), l.owner_id)
        )
    )
  );
```

### `plans` policies

```sql
-- Own organizer: full access
CREATE POLICY "plans_own" ON public.plans
  FOR ALL USING (auth.uid() = organizer_id)
  WITH CHECK (auth.uid() = organizer_id);

-- Mutual friends: read access
CREATE POLICY "plans_friends_read" ON public.plans
  FOR SELECT USING (
    public.are_mutual_friends(auth.uid(), organizer_id)
  );

-- Joiners: read access (can see plans they joined, even if not mutual friends with organizer)
CREATE POLICY "plans_joiners_read" ON public.plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plan_joins
      WHERE user_id = auth.uid() AND plan_id = id
    )
  );
```

### `plan_interests` policies

```sql
-- Own: full access
CREATE POLICY "plan_interests_own" ON public.plan_interests
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Can read interests if you can see the plan
CREATE POLICY "plan_interests_plan_readers" ON public.plan_interests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plans p
      WHERE p.id = plan_id
        AND (
          p.organizer_id = auth.uid()
          OR public.are_mutual_friends(auth.uid(), p.organizer_id)
          OR EXISTS (SELECT 1 FROM plan_joins WHERE plan_id = p.id AND user_id = auth.uid())
        )
    )
  );
```

### `plan_joins` policies

```sql
-- Own: full access
CREATE POLICY "plan_joins_own" ON public.plan_joins
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Can read joins if you can see the plan
CREATE POLICY "plan_joins_plan_readers" ON public.plan_joins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plans p
      WHERE p.id = plan_id
        AND (
          p.organizer_id = auth.uid()
          OR public.are_mutual_friends(auth.uid(), p.organizer_id)
          OR EXISTS (SELECT 1 FROM plan_joins pj2 WHERE pj2.plan_id = p.id AND pj2.user_id = auth.uid())
        )
    )
  );
```

### `follows` policies

```sql
-- Follow relationships are public (needed to compute mutual friends)
CREATE POLICY "follows_read" ON public.follows
  FOR SELECT USING (true);

-- Only create follows where you are the follower
CREATE POLICY "follows_insert" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Only delete your own follows
CREATE POLICY "follows_delete" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);
```

### `notifications` policies

```sql
-- Notifications are private — recipient only
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### `invite_links` policies

```sql
-- Creator can read and insert their own links
CREATE POLICY "invite_links_creator" ON public.invite_links
  FOR ALL USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Anyone (including anon) can read a link by token for validation
-- Flask handles this via service role; no direct client read needed
```

### `events` (telemetry) policies

```sql
-- No client reads — analytics are consumed via PostHog or service-role queries
-- Flask inserts via service role key — no client INSERT policy needed
-- If client-side event capture is ever added, restrict to own user_id:
CREATE POLICY "events_own_insert" ON public.events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
```

---

## Realtime Configuration

Enable Realtime on these tables in the Supabase Dashboard → Database → Replication:

| Table | Events | Purpose |
|---|---|---|
| `notifications` | INSERT | Live Panel notification cards |
| `plans` | INSERT, UPDATE | Plan card updates (time added, status change) |
| `plan_interests` | INSERT | Live interest count for organizer |
| `plan_joins` | INSERT | Live join count and attendee list updates |
| `follows` | INSERT | Live follow notification |

**React subscription pattern:**
```javascript
// Subscribe to notifications for the current user
supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // prepend new notification card to Panel
    dispatch(addNotification(payload.new));
  })
  .subscribe();
```

---

## Enum Types Summary

```sql
CREATE TYPE plan_status AS ENUM ('active', 'cancelled');

CREATE TYPE list_visibility AS ENUM ('public', 'private');

CREATE TYPE notification_type AS ENUM (
  'new_follower',
  'follow_back_prompt',
  'plan_time_updated',
  'plan_reminder_day_before',
  'plan_reminder_morning',
  'plan_date_passed',
  'friend_joined_plan',
  'plan_cancelled',
  'plan_time_proposed',
  'plan_proposal_accepted',
  'plan_proposal_declined'
);
```

---

## Migration Execution Order

Apply DDL in this order to respect foreign key dependencies:

1. Extensions (`uuid-ossp`, `postgis`, `pgcrypto`, `pg_trgm`)
2. Enum types (`plan_status`, `list_visibility`, `notification_type`)
3. Helper function (`set_updated_at`, `are_mutual_friends`)
4. `public.users` (depends on `auth.users`)
5. `public.places`
6. `public.user_places` (depends on `users`, `places`)
7. `public.lists` (depends on `users`)
8. `public.list_places` (depends on `lists`, `places`)
9. `public.plans` (depends on `users`, `places`)
10. `public.plan_interests` (depends on `users`, `plans`)
11. `public.plan_joins` (depends on `users`, `plans`)
12. `public.follows` (depends on `users`)
13. `public.notifications` (depends on `users`)
14. `public.invite_links` (depends on `users`, `plans`)
15. `public.events` (depends on `users`)
16. All indexes (after tables)
17. All triggers (after tables)
18. Enable RLS + create policies (after tables and helper functions)
19. Seed a default "Want to Go" `lists` row per user (in the onboarding trigger / handler that creates `public.users`)
