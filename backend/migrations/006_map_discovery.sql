-- =============================================================================
-- Hyperlocal MVP — Migration 006: Map Discovery & Social Layer
-- =============================================================================
-- Adds the MVP map-discovery features (pm/specs/mvp-map-discovery.md):
--   * discovery_signals — the user-generated-data pipeline (list names, notes,
--     searches, joins) that future contextual recommendations train on (MD-6)
--   * users.open_to_plans_until — the "I'm down for plans today" signal (MD-5)
--   * invite_links.place_id — share links for places (MD-7)
-- Idempotent; safe to re-run.
--
-- Run: psql "$DATABASE_URL" -f 006_map_discovery.sql
--      (or paste into the Supabase SQL Editor after 001–005)
-- =============================================================================

-- ------------------------------------------------------------
-- discovery_signals: user-generated signal corpus (spec §7)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_signals (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  text       TEXT,
  place_id   UUID REFERENCES public.places(id) ON DELETE SET NULL,
  context    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT discovery_signals_kind CHECK (kind IN (
    'list_name', 'note', 'search_query', 'category_search',
    'city_search', 'contextual_click', 'save', 'plan_join'
  ))
);

COMMENT ON TABLE public.discovery_signals IS
  'One row per user-generated discovery signal (list names, notes, searches, joins)
   with location/time context. Collection-only in this release: fuels future
   contextual recommendations. Writes are server-side and soft-fail (MD-6).';

CREATE INDEX IF NOT EXISTS discovery_signals_kind_idx ON public.discovery_signals (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS discovery_signals_user_idx ON public.discovery_signals (user_id, created_at DESC);

-- Service-role writes only; no client access (it's a telemetry corpus).
ALTER TABLE public.discovery_signals ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- users: open-to-plans signal (spec §8)
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS open_to_plans_until TIMESTAMPTZ;

COMMENT ON COLUMN public.users.open_to_plans_until IS
  '"I''m down for plans today" — visible to mutual friends while in the future;
   auto-expires end of local day (MD-5).';

-- ------------------------------------------------------------
-- invite_links: allow a link to target a place (spec §10)
-- ------------------------------------------------------------
ALTER TABLE public.invite_links
  ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places(id) ON DELETE SET NULL;
