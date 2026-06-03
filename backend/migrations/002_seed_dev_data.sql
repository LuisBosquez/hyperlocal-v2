-- =============================================================================
-- Hyperlocal MVP-1 — Dev Seed Data
-- =============================================================================
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
-- Fixed UUIDs make seeding idempotent — the same rows are always upserted.
--
-- How to run:
--   psql "$DATABASE_URL" -f 002_seed_dev_data.sql
--   (or paste into Supabase SQL Editor after 001_initial_schema.sql)
--
-- UUID key:
--   Users:         00000000-0000-0000-0000-00000000000[1-3]
--   Places:        00000000-0000-0000-0000-0000000000[10-12]
--   Plans:         00000000-0000-0000-0000-0000000000[20-21]
--   Follows:       00000000-0000-0000-0000-0000000000[40-42]
--   user_places:   00000000-0000-0000-0000-0000000000[50-53]
--   plan_interests: 00000000-0000-0000-0000-000000000030
--   plan_joins:    00000000-0000-0000-0000-000000000031
--
-- Social graph:
--   Alice ↔ Bob   — mutual follows (friends)
--   Alice → Carlos — one-way follow (Alice follows Carlos, Carlos does not follow back)
-- =============================================================================

-- ============================================================
-- 1. AUTH USERS
-- ============================================================
-- auth.users must be populated before public.users due to the FK constraint.
-- These are minimal rows sufficient for a dev environment; Supabase Auth normally
-- manages this table — do not use this pattern in production.

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  is_sso_user,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'alice@dev.local', '',
    NOW(),
    '{"provider": "google"}'::jsonb,
    '{"provider": "google", "providers": ["google"]}'::jsonb,
    false, NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'bob@dev.local', '',
    NOW(),
    '{"provider": "google"}'::jsonb,
    '{"provider": "google", "providers": ["google"]}'::jsonb,
    false, NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated',
    'carlos@dev.local', '',
    NOW(),
    '{"provider": "google"}'::jsonb,
    '{"provider": "google", "providers": ["google"]}'::jsonb,
    false, NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. PUBLIC USERS
-- ============================================================

INSERT INTO public.users (id, handle, display_name, bio, avatar_url)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'alice_dev',
    'Alice Dev',
    'Coffee shops and rooftop bars — always.',
    'https://api.dicebear.com/7.x/thumbs/svg?seed=alice'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'bob_dev',
    'Bob Dev',
    'Always down for a spontaneous plan.',
    'https://api.dicebear.com/7.x/thumbs/svg?seed=bob'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'carlos_dev',
    'Carlos Dev',
    'Foodie. Finding the best tacos in town.',
    'https://api.dicebear.com/7.x/thumbs/svg?seed=carlos'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. PLACES
-- ============================================================

INSERT INTO public.places (id, google_place_id, name, address, lat, lng, category, description)
VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    'ChIJseed000000000000000000000001',
    'Verve Coffee Roasters',
    '1010 Cedar St, Santa Cruz, CA 95060',
    36.9741, -122.0308,
    'cafe',
    'Specialty coffee roaster with a bright, airy space.'
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    'ChIJseed000000000000000000000002',
    'The Penny Ice Creamery',
    '913 Cedar St, Santa Cruz, CA 95060',
    36.9739, -122.0298,
    'dessert',
    'Artisan ice cream made from locally sourced ingredients.'
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    'ChIJseed000000000000000000000003',
    'Capitola Beach',
    'Capitola Beach, Capitola, CA 95010',
    36.9750, -121.9533,
    'park',
    'Sandy beach village with colorful seaside cottages.'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. FOLLOWS
-- ============================================================
-- Alice ↔ Bob: mutual (friends) — both users can see each other's plans + saved places.
-- Alice → Carlos: one-way — Alice can see Carlos's profile, not his plans.

INSERT INTO public.follows (id, follower_id, followee_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000040',
    '00000000-0000-0000-0000-000000000001',  -- Alice
    '00000000-0000-0000-0000-000000000002'   -- → Bob
  ),
  (
    '00000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000002',  -- Bob
    '00000000-0000-0000-0000-000000000001'   -- → Alice (mutual)
  ),
  (
    '00000000-0000-0000-0000-000000000042',
    '00000000-0000-0000-0000-000000000001',  -- Alice
    '00000000-0000-0000-0000-000000000003'   -- → Carlos (one-way)
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. USER_PLACES (saved places)
-- ============================================================

INSERT INTO public.user_places (id, user_id, place_id, note)
VALUES
  (
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000001',  -- Alice saved Verve Coffee
    '00000000-0000-0000-0000-000000000010',
    'Best oat latte in town'
  ),
  (
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000001',  -- Alice saved Capitola Beach (no note)
    '00000000-0000-0000-0000-000000000012',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000002',  -- Bob saved Verve Coffee
    '00000000-0000-0000-0000-000000000010',
    'Great for remote work'
  ),
  (
    '00000000-0000-0000-0000-000000000053',
    '00000000-0000-0000-0000-000000000003',  -- Carlos saved The Penny Ice Creamery
    '00000000-0000-0000-0000-000000000011',
    'Brown butter peach is incredible'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. PLANS
-- ============================================================

INSERT INTO public.plans (id, organizer_id, place_id, is_timeless, plan_date, plan_time, status)
VALUES
  (
    -- Timeless plan ("Want to Go"): Alice at Capitola Beach, no date or time set.
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001',  -- Alice
    '00000000-0000-0000-0000-000000000012',  -- Capitola Beach
    TRUE,
    NULL,
    NULL,
    'active'
  ),
  (
    -- Confirmed plan: Bob at Verve Coffee, Saturday morning.
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000002',  -- Bob
    '00000000-0000-0000-0000-000000000010',  -- Verve Coffee Roasters
    FALSE,
    '2026-05-23',
    '10:00:00',
    'active'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. PLAN_INTERESTS
-- ============================================================
-- Alice taps "Interested" on Bob's Verve Coffee plan.
-- She'll receive a notification if Bob updates the time.

INSERT INTO public.plan_interests (id, user_id, plan_id)
VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000001',  -- Alice
  '00000000-0000-0000-0000-000000000021'   -- Bob's Verve plan
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. PLAN_JOINS
-- ============================================================
-- Alice joins Bob's Verve Coffee plan — it appears in her Panel.

INSERT INTO public.plan_joins (id, user_id, plan_id)
VALUES (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000001',  -- Alice
  '00000000-0000-0000-0000-000000000021'   -- Bob's Verve plan
)
ON CONFLICT (id) DO NOTHING;
