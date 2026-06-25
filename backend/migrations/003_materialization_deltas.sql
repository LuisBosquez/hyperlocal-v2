-- =============================================================================
-- Hyperlocal MVP-1 — Migration 003: materialization + edge-case deltas
-- =============================================================================
-- Adds the columns and enum value required by the resolved materialization
-- workflow (pm/specs/materialization-workflow.md, tech/09) and the edge-case
-- handling doc (tech/08 §3). Idempotent; safe to re-run.
--
-- Run: psql "$DATABASE_URL" -f 003_materialization_deltas.sql
--      (or paste into the Supabase SQL Editor after 001 + 002)
-- =============================================================================

-- ------------------------------------------------------------
-- places: stale-place handling (tech/08 P9 — J2.6 / J4.7) and
-- timezone-correct plan-time validation + reminders (M-D3a).
-- ------------------------------------------------------------
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS is_unavailable          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unavailable_checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS utc_offset_minutes      INTEGER;

COMMENT ON COLUMN public.places.is_unavailable IS
  'TRUE once Google Places stops resolving this place. Detail still renders from
   cache with a "may have closed" notice; plan creation is rejected (PLACE_UNAVAILABLE).';
COMMENT ON COLUMN public.places.utc_offset_minutes IS
  'Place-local UTC offset (minutes) from Google Places. Drives future-time
   validation and the reminder cron''s "day before" / "morning of" boundaries (M-D3a).';

-- ------------------------------------------------------------
-- notifications: new type for tentative plans whose date passed with no
-- time set — organizer gets one recovery prompt (M-D6a).
-- ------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_date_passed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- data JSONB shape for plan_date_passed: { plan_id, place_id, place_name }

-- ------------------------------------------------------------
-- Idempotency backstops (tech/08 P2). These UNIQUE constraints already exist
-- from migration 001; listed here as the canonical dependency for the
-- duplicate-resolves-to-success behavior. No-ops if already present.
-- ------------------------------------------------------------
-- follows (follower_id, followee_id)  — follows_unique
-- plan_joins (user_id, plan_id)        — plan_joins_unique
-- plan_interests (user_id, plan_id)    — plan_interests_unique
-- user_places (user_id, place_id)      — user_places_unique
