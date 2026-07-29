-- =============================================================================
-- Hyperlocal MVP-1 — Migration 005: Lists + notes-enriched search
-- =============================================================================
-- Adds the Discovery & Curation features (pm/specs/mvp-1.md Flows 16–20,
-- tech/02 + tech/04):
--   * user-curated Lists (lists + list_places, many-to-many, public/private)
--   * a default "Want to Go" list seeded per user
--   * a trigram index over user_places.note for notes-enriched search (Flow 16)
--   * invite_links.list_id so a public list can be shared
-- Idempotent; safe to re-run.
--
-- Run: psql "$DATABASE_URL" -f 005_lists_and_notes_search.sql
--      (or paste into the Supabase SQL Editor after 001–004)
-- =============================================================================

-- pg_trgm backs substring/fuzzy matching on personal notes.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ------------------------------------------------------------
-- list_visibility enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'list_visibility') THEN
    CREATE TYPE list_visibility AS ENUM ('public', 'private');
  END IF;
END $$;

-- ------------------------------------------------------------
-- lists: user-curated collections of places (Flows 17–19)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  visibility  list_visibility NOT NULL DEFAULT 'private',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lists_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT lists_description_length CHECK (char_length(description) <= 280)
);

COMMENT ON TABLE public.lists IS
  'User-created collections of places. visibility=public surfaces on the owner''s profile.
   is_default marks the seeded "Want to Go" list (one per user, not deletable).';

CREATE INDEX IF NOT EXISTS lists_owner_id_idx ON public.lists (owner_id);
CREATE INDEX IF NOT EXISTS lists_owner_visibility_idx ON public.lists (owner_id, visibility);
CREATE UNIQUE INDEX IF NOT EXISTS lists_one_default_per_owner_idx ON public.lists (owner_id)
  WHERE is_default;

DROP TRIGGER IF EXISTS lists_updated_at ON public.lists;
CREATE TRIGGER lists_updated_at
  BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- list_places: membership (many-to-many) — Flow 18
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.list_places (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id    UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  place_id   UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT list_places_unique UNIQUE (list_id, place_id)
);

COMMENT ON TABLE public.list_places IS
  'Place membership in a list (many-to-many). Independent of user_places —
   removing here never unsaves the place.';

CREATE INDEX IF NOT EXISTS list_places_list_id_position_idx ON public.list_places (list_id, position ASC);
CREATE INDEX IF NOT EXISTS list_places_place_id_idx ON public.list_places (place_id);

-- ------------------------------------------------------------
-- user_places: trigram index for notes-enriched search (Flow 16)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS user_places_note_trgm_idx ON public.user_places
  USING gin (note gin_trgm_ops);

-- ------------------------------------------------------------
-- invite_links: allow a link to target a public list (Flow 19)
-- ------------------------------------------------------------
ALTER TABLE public.invite_links
  ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES public.lists(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- Seed a default "Want to Go" list for every existing user
-- (new users get one in the onboarding handler).
-- ------------------------------------------------------------
INSERT INTO public.lists (owner_id, name, visibility, is_default)
SELECT u.id, 'Want to Go', 'private', TRUE
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.lists l WHERE l.owner_id = u.id AND l.is_default
);

-- ------------------------------------------------------------
-- Row-Level Security
-- ------------------------------------------------------------
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lists_own" ON public.lists;
CREATE POLICY "lists_own" ON public.lists
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "lists_public_read" ON public.lists;
CREATE POLICY "lists_public_read" ON public.lists
  FOR SELECT USING (
    visibility = 'public'
    OR auth.uid() = owner_id
    OR public.are_mutual_friends(auth.uid(), owner_id)
  );

DROP POLICY IF EXISTS "list_places_owner" ON public.list_places;
CREATE POLICY "list_places_owner" ON public.list_places
  FOR ALL USING (
    EXISTS (SELECT 1 FROM lists l WHERE l.id = list_id AND l.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM lists l WHERE l.id = list_id AND l.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "list_places_readable" ON public.list_places;
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
