-- =============================================================================
-- Hyperlocal MVP-1 — Initial Schema Migration
-- =============================================================================
-- How to run:
--
--   Option 1 — Supabase SQL Editor:
--     Open app.supabase.com → your project → SQL Editor.
--     Paste this entire file and click Run.
--
--   Option 2 — Supabase CLI:
--     Place this file in supabase/migrations/ and run:
--       supabase db push
--     Or apply directly:
--       psql "$DATABASE_URL" -f 001_initial_schema.sql
--
-- This file is idempotent on a fresh Postgres 15 instance.
-- Re-running on an existing schema is safe for tables (CREATE TABLE IF NOT EXISTS)
-- and functions (CREATE OR REPLACE), but RLS policies and enum types will error
-- if they already exist — run DROP POLICY / DROP TYPE first in that case.
-- =============================================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4() (kept for compatibility)
CREATE EXTENSION IF NOT EXISTS "postgis";      -- future geo queries; bounding box used in MVP-1
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_bytes() for invite link tokens

-- ============================================================
-- 2. ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE plan_status AS ENUM ('active', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'new_follower',             -- someone followed you
    'follow_back_prompt',       -- a user you follow has followed you back
    'plan_time_updated',        -- organizer added/changed time on a plan you marked Interested
    'plan_reminder_day_before', -- day-before reminder for your upcoming plan
    'plan_reminder_morning',    -- morning-of reminder for your upcoming plan
    'friend_joined_plan',       -- a mutual friend joined your plan
    'plan_cancelled'            -- a plan you joined was cancelled by organizer
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. HELPER FUNCTIONS (no table dependencies)
-- ============================================================

-- Reusable trigger: keep updated_at current on any table.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. TABLES (FK-dependency order)
-- ============================================================

-- ------------------------------------------------------------
-- 4.1  users
-- ------------------------------------------------------------
-- Profile extension of auth.users. id matches auth.users.id.
-- Row is created after Google OAuth + handle selection (onboarding flow).

CREATE TABLE IF NOT EXISTS public.users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle           TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  bio              TEXT,
  avatar_url       TEXT,          -- URL in Supabase Storage
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

-- ------------------------------------------------------------
-- 4.2  places
-- ------------------------------------------------------------
-- Cache of Google Places API results. Flask upserts on first interaction.
-- No user-generated places.

CREATE TABLE IF NOT EXISTS public.places (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  address         TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  category        TEXT,     -- normalized from Google Places types array
  opening_hours   JSONB,    -- Google Places periods array: [{open:{day,time}, close:{day,time}}]
  photo_url       TEXT,     -- first photo reference URL from Google Places
  description     TEXT,     -- editorial_summary or types-derived text
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT places_google_place_id_unique UNIQUE (google_place_id)
);

COMMENT ON TABLE public.places IS
  'Cached Google Places API results. One row per unique Google place_id.';
COMMENT ON COLUMN public.places.opening_hours IS
  'Google Places API periods array. Used by Flask to validate plan_time against opening hours.';
COMMENT ON COLUMN public.places.category IS
  'Normalized category derived from Google Places types array. Used for contextual suggestions.';

-- ------------------------------------------------------------
-- 4.3  user_places
-- ------------------------------------------------------------
-- "Saved places" join table. Created when a user saves a place OR creates a
-- plan for a place they haven't yet saved (auto-save). Deleted on unsave.

CREATE TABLE IF NOT EXISTS public.user_places (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  place_id   UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  note       TEXT,   -- personal note; shown only to owner and mutual friends
  -- saved_at is the product-meaningful timestamp (shown in Panel "saved X ago").
  -- created_at satisfies the schema convention; both default to NOW().
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_places_unique    UNIQUE (user_id, place_id),
  CONSTRAINT user_places_note_length CHECK (char_length(note) <= 500)
);

COMMENT ON TABLE public.user_places IS
  'A user''s saved places. One row per (user, place) pair.
   Creating a plan for an unsaved place auto-creates this row.';

-- ------------------------------------------------------------
-- 4.4  plans
-- ------------------------------------------------------------
-- A plan is a place + optional date + optional time.
-- Three states: Timeless (is_timeless=TRUE), Tentative (date set, no time),
-- Confirmed (date + time set).
-- Plans survive organizer cancellation — status records the action but joiners
-- retain their plan_joins rows.

CREATE TABLE IF NOT EXISTS public.plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  -- RESTRICT: prevents orphaned plans if a place is removed from cache.
  -- Flask must check for active plans before purging a place row.
  place_id     UUID NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  plan_date    DATE,   -- NULL when is_timeless = TRUE
  plan_time    TIME,   -- NULL for timeless or tentative plans
  is_timeless  BOOLEAN NOT NULL DEFAULT FALSE,
  status       plan_status NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plans_timeless_no_date CHECK (
    (is_timeless = TRUE  AND plan_date IS NULL AND plan_time IS NULL)
    OR
    (is_timeless = FALSE AND plan_date IS NOT NULL)
  ),
  CONSTRAINT plans_time_requires_date CHECK (
    plan_time IS NULL OR plan_date IS NOT NULL
  )
);

COMMENT ON TABLE public.plans IS
  'A plan to visit a place. Survives organizer cancellation (status = cancelled).
   Joiners retain their plan_joins rows regardless of status.';
COMMENT ON COLUMN public.plans.is_timeless IS
  'TRUE = no date or time set ("Want to Go" intent). FALSE = date is set (time may be null).';
COMMENT ON COLUMN public.plans.status IS
  'active: plan is live. cancelled: organizer cancelled but plan persists for joiners.';

-- ------------------------------------------------------------
-- 4.5  plan_interests
-- ------------------------------------------------------------
-- Lightweight "Interested" signal (not a join commitment).
-- Flask queries this to notify interested users when organizer adds/updates a time.

CREATE TABLE IF NOT EXISTS public.plan_interests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES public.plans(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plan_interests_unique UNIQUE (user_id, plan_id)
);

COMMENT ON TABLE public.plan_interests IS
  '"Interested" signal on a friend''s plan. Not a join commitment.
   Triggers notification when organizer adds/updates plan time.';

-- ------------------------------------------------------------
-- 4.6  plan_joins
-- ------------------------------------------------------------
-- Formal join: plan appears in joiner's Panel; joiner listed as attendee.
-- Row is retained even after organizer cancels (plan survives its organizer).

CREATE TABLE IF NOT EXISTS public.plan_joins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES public.plans(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plan_joins_unique UNIQUE (user_id, plan_id)
);

COMMENT ON TABLE public.plan_joins IS
  'Formal join of a plan. Plan appears in joiner''s Panel.
   Row is retained even if organizer cancels.';

-- ------------------------------------------------------------
-- 4.7  follows
-- ------------------------------------------------------------
-- One-directional. No approval required. Mutual follows (both rows exist) = "friends",
-- which unlocks full plan and saved-place visibility between the two users.

CREATE TABLE IF NOT EXISTS public.follows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT follows_unique        UNIQUE (follower_id, followee_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id != followee_id)
);

COMMENT ON TABLE public.follows IS
  'One-way follow relationship. Mutual follows (both rows exist) = friends.
   No approval step — follow is immediate.';

-- ------------------------------------------------------------
-- 4.8  are_mutual_friends  (defined AFTER follows — SQL body is validated at creation)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.are_mutual_friends(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.follows f1
    JOIN   public.follows f2
           ON  f2.follower_id = f1.followee_id
           AND f2.followee_id = f1.follower_id
    WHERE  f1.follower_id = user_a
    AND    f1.followee_id = user_b
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4.9  notifications
-- ------------------------------------------------------------
-- One row per notification per recipient. Realtime broadcasts on INSERT.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',  -- rendering data; schema varies by type (see comment)
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'In-app notification records. One row per notification per recipient.
   Realtime broadcasts on INSERT to drive live Panel updates.';
COMMENT ON COLUMN public.notifications.data IS
  'JSON shape by type:
   new_follower:          { follower_id, follower_handle, follower_avatar_url }
   follow_back_prompt:    { follower_id, follower_handle }
   plan_time_updated:     { plan_id, organizer_handle, place_name, plan_date, plan_time }
   plan_reminder_*:       { plan_id, place_name, plan_date, plan_time }
   friend_joined_plan:    { plan_id, joiner_handle, joiner_avatar_url, place_name }
   plan_cancelled:        { plan_id, organizer_handle, place_name }';

-- ------------------------------------------------------------
-- 4.10  invite_links
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invite_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- URL-safe random token generated via gen_random_bytes(12) in Flask, then base64url-encoded.
  token      TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- NULL = generic profile share link; non-NULL = plan-specific link.
  -- SET NULL on plan delete: link survives but degrades to a profile link.
  plan_id    UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- NULL = no expiry
  -- SET NULL on user delete: preserve conversion metric even after account deletion.
  used_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  used_at    TIMESTAMPTZ,

  CONSTRAINT invite_links_token_unique UNIQUE (token)
);

COMMENT ON TABLE public.invite_links IS
  'Shareable invite links. plan_id = plan-specific; NULL = generic profile share.
   used_by tracks new-user acquisition for the invite conversion rate metric.';

-- ------------------------------------------------------------
-- 4.11  events  (telemetry)
-- ------------------------------------------------------------
-- Server-side telemetry for all 9 MVP-1 success metrics. Inserted by Flask only
-- (not client-side) to ensure data integrity. PostHog SDK also captures these.

CREATE TABLE IF NOT EXISTS public.events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  -- SET NULL on user delete: preserve event totals even after account deletion.
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  session_id UUID,    -- groups events within a browser session
  properties JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.events IS
  'Server-confirmed telemetry. All 9 MVP-1 metric events inserted here by Flask.
   PostHog Python SDK also captures these concurrently. No client reads.';
COMMENT ON COLUMN public.events.event_name IS
  'One of: invite_link_shared, invite_link_converted, user_active_session,
   plan_created, place_saved, plan_interested, plan_joined, plan_materialized,
   mutual_connection_formed.';

-- ============================================================
-- 5. INDEXES
-- ============================================================

-- users — handle is also covered by the UNIQUE constraint index, but an
-- explicitly named index is useful for diagnostics and EXPLAIN output.
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_idx
  ON public.users (handle);

-- places
CREATE UNIQUE INDEX IF NOT EXISTS places_google_place_id_idx
  ON public.places (google_place_id);
-- Composite lat/lng for bounding-box viewport queries (map view).
CREATE INDEX IF NOT EXISTS places_lat_lng_idx
  ON public.places (lat, lng);
CREATE INDEX IF NOT EXISTS places_category_idx
  ON public.places (category);

-- user_places
CREATE INDEX IF NOT EXISTS user_places_user_id_idx
  ON public.user_places (user_id);
CREATE INDEX IF NOT EXISTS user_places_place_id_idx
  ON public.user_places (place_id);
-- Covered by constraint, but explicit name aids query plan readability.
CREATE UNIQUE INDEX IF NOT EXISTS user_places_user_place_idx
  ON public.user_places (user_id, place_id);

-- plans
CREATE INDEX IF NOT EXISTS plans_organizer_id_idx
  ON public.plans (organizer_id);
-- Date-sorted Panel display; NULLs (timeless) sort last.
CREATE INDEX IF NOT EXISTS plans_date_time_idx
  ON public.plans (plan_date ASC NULLS LAST, plan_time ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS plans_status_idx
  ON public.plans (status);
-- Primary Panel feed composite: friends' active plans ordered by date.
CREATE INDEX IF NOT EXISTS plans_organizer_status_date_idx
  ON public.plans (organizer_id, status, plan_date);

-- plan_interests
CREATE INDEX IF NOT EXISTS plan_interests_plan_id_idx
  ON public.plan_interests (plan_id);
CREATE INDEX IF NOT EXISTS plan_interests_user_id_idx
  ON public.plan_interests (user_id);

-- plan_joins
CREATE INDEX IF NOT EXISTS plan_joins_plan_id_idx
  ON public.plan_joins (plan_id);
CREATE INDEX IF NOT EXISTS plan_joins_user_id_idx
  ON public.plan_joins (user_id);

-- follows
CREATE INDEX IF NOT EXISTS follows_follower_id_idx
  ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_followee_id_idx
  ON public.follows (followee_id);
-- Covered by constraint; explicit name used in mutual-friend check EXPLAIN plans.
CREATE UNIQUE INDEX IF NOT EXISTS follows_pair_idx
  ON public.follows (follower_id, followee_id);

-- notifications — composite covers both unread-badge count and Panel load.
CREATE INDEX IF NOT EXISTS notifications_user_id_read_idx
  ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id);

-- invite_links
CREATE UNIQUE INDEX IF NOT EXISTS invite_links_token_idx
  ON public.invite_links (token);
CREATE INDEX IF NOT EXISTS invite_links_created_by_idx
  ON public.invite_links (created_by);

-- events
CREATE INDEX IF NOT EXISTS events_event_name_created_at_idx
  ON public.events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS events_user_id_idx
  ON public.events (user_id);

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

-- CREATE OR REPLACE TRIGGER requires Postgres 14+; Supabase uses Postgres 15.
CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER places_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER user_places_updated_at
  BEFORE UPDATE ON public.user_places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 7. ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_places    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_joins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events         ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- users policies
-- ------------------------------------------------------------
-- Note on column-level restriction (Tier 4 / anon):
--   The spec restricts anon users to handle/display_name/avatar_url/bio only.
--   Postgres RLS is row-level — it cannot restrict column visibility within a policy.
--   Enforce the column restriction at the API layer (Flask serializes only those
--   fields for unauthenticated responses). The SELECT policy below allows row access;
--   column filtering is the API's responsibility.

-- Tier 1 (own): full CRUD on own profile.
CREATE POLICY "users_own" ON public.users
  FOR ALL
  USING     (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Tier 2-4 (one-way follower / public / anon): read non-private profiles.
-- Private profiles are invisible to non-followers; own profile always visible via users_own.
CREATE POLICY "users_public_read" ON public.users
  FOR SELECT
  USING (NOT is_private);

-- Onboarding INSERT (server-side trigger creates the row; this allows client fallback).
CREATE POLICY "users_insert" ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------
-- places policies
-- ------------------------------------------------------------

-- Tier 4 (public): place cache has no PII — fully readable by anyone.
CREATE POLICY "places_read" ON public.places
  FOR SELECT USING (true);

-- No client INSERT/UPDATE/DELETE: Flask uses the service role key.

-- ------------------------------------------------------------
-- user_places policies
-- ------------------------------------------------------------

-- Tier 1 (own): full access to own saved places.
CREATE POLICY "user_places_own" ON public.user_places
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tier 2 (mutual friends): read-only access to friend's saved places.
CREATE POLICY "user_places_friends_read" ON public.user_places
  FOR SELECT
  USING (public.are_mutual_friends(auth.uid(), user_id));

-- ------------------------------------------------------------
-- plans policies
-- ------------------------------------------------------------

-- Tier 1 (own organizer): full CRUD.
CREATE POLICY "plans_own" ON public.plans
  FOR ALL
  USING     (auth.uid() = organizer_id)
  WITH CHECK (auth.uid() = organizer_id);

-- Tier 2 (mutual friends): read friend's plans.
CREATE POLICY "plans_friends_read" ON public.plans
  FOR SELECT
  USING (public.are_mutual_friends(auth.uid(), organizer_id));

-- Tier 3 (joiners): read plans they joined, even without mutual friendship.
-- Handles the edge case where friendship lapses after joining a plan.
CREATE POLICY "plans_joiners_read" ON public.plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.plan_joins
      WHERE user_id = auth.uid()
        AND plan_id  = id
    )
  );

-- ------------------------------------------------------------
-- plan_interests policies
-- ------------------------------------------------------------

-- Tier 1 (own): full access.
CREATE POLICY "plan_interests_own" ON public.plan_interests
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tier 2/3 (plan readers): read interests if you can see the plan.
CREATE POLICY "plan_interests_plan_readers" ON public.plan_interests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.plans p
      WHERE  p.id = plan_id
        AND  (
               p.organizer_id = auth.uid()
               OR public.are_mutual_friends(auth.uid(), p.organizer_id)
               OR EXISTS (
                    SELECT 1 FROM public.plan_joins
                    WHERE  plan_id = p.id AND user_id = auth.uid()
                  )
             )
    )
  );

-- ------------------------------------------------------------
-- plan_joins policies
-- ------------------------------------------------------------

-- Tier 1 (own): full access.
CREATE POLICY "plan_joins_own" ON public.plan_joins
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tier 2/3 (plan readers): read joins if you can see the plan.
CREATE POLICY "plan_joins_plan_readers" ON public.plan_joins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.plans p
      WHERE  p.id = plan_id
        AND  (
               p.organizer_id = auth.uid()
               OR public.are_mutual_friends(auth.uid(), p.organizer_id)
               OR EXISTS (
                    SELECT 1 FROM public.plan_joins pj2
                    WHERE  pj2.plan_id = p.id AND pj2.user_id = auth.uid()
                  )
             )
    )
  );

-- ------------------------------------------------------------
-- follows policies
-- ------------------------------------------------------------

-- Tier 4 (public): follow graph must be readable by all authenticated users
-- to allow client-side mutual-friend computation.
CREATE POLICY "follows_read" ON public.follows
  FOR SELECT USING (true);

-- Tier 1 (own follower): create your own follows.
CREATE POLICY "follows_insert" ON public.follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- Tier 1 (own follower): remove your own follows.
CREATE POLICY "follows_delete" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- ------------------------------------------------------------
-- notifications policies
-- ------------------------------------------------------------

-- Tier 1 (own): private — recipient only.
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- invite_links policies
-- ------------------------------------------------------------

-- Tier 1 (own creator): full access to links you created.
CREATE POLICY "invite_links_creator" ON public.invite_links
  FOR ALL
  USING     (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Token-based validation reads are handled server-side via service role key.

-- ------------------------------------------------------------
-- events policies (telemetry)
-- ------------------------------------------------------------

-- No client reads: analytics consumed via PostHog or service-role queries only.
-- Client insert allowed for own user_id or for anonymous (null) events.
CREATE POLICY "events_own_insert" ON public.events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================
-- 8. REALTIME PUBLICATION
-- ============================================================
-- Supabase creates the supabase_realtime publication automatically on project init.
-- Adding tables here enables CDC (change data capture) for Realtime subscriptions.
-- The React client subscribes with row-level filters (e.g. user_id=eq.<uid>).

ALTER PUBLICATION supabase_realtime ADD TABLE public.plans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_interests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_joins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- 9. ROLE GRANTS
-- ============================================================
-- PostgREST authenticates as the service_role PostgreSQL role when the service
-- role key is used.  That role needs explicit object-level grants even though it
-- has BYPASSRLS.  Grant ALL here; RLS policies still enforce row-level access for
-- the anon/authenticated roles.

GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO service_role;

-- Ensure future tables created by the postgres role also inherit these grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role, authenticated, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role, authenticated, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES  TO service_role, authenticated, anon;
