-- =============================================================================
-- Hyperlocal MVP-1 — Migration 004: collaborative time proposals + coarse time
-- =============================================================================
-- Backs the Alpha collaborative-materialization feature (pm/specs/mvp-1.md
-- Flows 4.3/4.4, pm/specs/materialization-workflow.md M-D14..M-D20, tech/09 §10–11):
--   • a coarse "time band" (morning/afternoon/evening) as a valid plan "when"
--   • a plan_time_proposals table: any mutual friend proposes 1..N time options;
--     the organizer accepts one (materializes), declines all, or lets it expire.
-- Idempotent; safe to re-run.
--
-- Run: psql "$DATABASE_URL" -f 004_time_proposals.sql
--      (or paste into the Supabase SQL Editor after 001 + 002 + 003)
-- =============================================================================

-- ------------------------------------------------------------
-- plans: coarse "time band" (M-D19). A band soft-confirms the plan — it counts
-- as a real, materialized "when" (state = confirmed, granularity = approximate),
-- distinct from a precise plan_time. At most one of (plan_time, plan_time_band)
-- is set; a band, like a time, requires a date.
-- ------------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_time_band TEXT
    CHECK (plan_time_band IN ('morning', 'afternoon', 'evening'));

DO $$ BEGIN
  ALTER TABLE public.plans ADD CONSTRAINT plans_one_time_kind
    CHECK (NOT (plan_time IS NOT NULL AND plan_time_band IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.plans ADD CONSTRAINT plans_band_requires_date
    CHECK (plan_time_band IS NULL OR plan_date IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.plans.plan_time_band IS
  'Coarse time-of-day band (morning/afternoon/evening) when the organizer/proposer
   committed to a rough time rather than an exact one (M-D19). Mutually exclusive
   with plan_time. A band soft-confirms the plan; the organizer gets a day-of nudge
   to refine it to an exact plan_time (optional — a band may stand).';

-- ------------------------------------------------------------
-- plan_time_proposals: a friend proposes time options on a friend's un-timed plan.
-- One PENDING proposal per plan (first proposer owns the slot until it resolves);
-- enforced by the partial unique index below + an app-level pre-check (M-D16).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_time_proposals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  proposer_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  options         JSONB NOT NULL DEFAULT '[]',
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_option INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.plan_time_proposals IS
  'A non-organizer''s proposed time options on a timeless/tentative plan (Flow 4.3).
   The organizer accepts one option (→ plan materializes, M-D15), declines all, or
   lets it expire (M-D17/M-D18). At most one pending proposal per plan.';
COMMENT ON COLUMN public.plan_time_proposals.options IS
  'JSONB array of { plan_date: "YYYY-MM-DD", plan_time: "HH:MM"|null,
   plan_time_band: "morning"|"afternoon"|"evening"|null }. Each option has exactly
   one of plan_time / plan_time_band. accepted_option indexes into this array.';

-- One pending proposal per plan (M-D16). App code also pre-checks and returns 409.
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_proposal_per_plan
  ON public.plan_time_proposals (plan_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS plan_time_proposals_plan_id_idx
  ON public.plan_time_proposals (plan_id);
CREATE INDEX IF NOT EXISTS plan_time_proposals_proposer_id_idx
  ON public.plan_time_proposals (proposer_id);
-- Cron expiry pass: pending proposals past their expires_at.
CREATE INDEX IF NOT EXISTS plan_time_proposals_pending_expiry_idx
  ON public.plan_time_proposals (status, expires_at);

DROP TRIGGER IF EXISTS plan_time_proposals_updated_at ON public.plan_time_proposals;
CREATE TRIGGER plan_time_proposals_updated_at
  BEFORE UPDATE ON public.plan_time_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- notifications: three new types for the proposal loop.
--   plan_time_proposed    → organizer, when a friend submits a proposal
--   plan_proposal_accepted→ proposer, when the organizer picks one of their options
--   plan_proposal_declined→ proposer, when declined / expired / superseded
-- ------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_time_proposed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_proposal_accepted';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'plan_proposal_declined';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- data JSONB shapes:
--   plan_time_proposed:     { plan_id, proposer_handle, place_name, option_count, expires_at }
--   plan_proposal_accepted: { plan_id, place_name, plan_date, plan_time, plan_time_band }
--   plan_proposal_declined: { plan_id, place_name, reason }  -- reason: declined|expired|organizer_set_time
