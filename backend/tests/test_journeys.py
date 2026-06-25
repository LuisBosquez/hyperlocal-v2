"""End-to-end journey tests against the dev data layer.
Each test maps to a journey in pm/4-user-journeys-mvp1.md or a decision in
pm/specs/materialization-workflow.md.
"""
from datetime import date, timedelta

from .conftest import ALICE, BOB, CARLOS, DANA, auth

PLACE_VICTROLA = '00000000-0000-0000-0000-000000000010'
PLACE_GASWORKS = '00000000-0000-0000-0000-000000000013'
PLACE_OPTIMISM = '00000000-0000-0000-0000-000000000017'
PLAN_BOB_TENTATIVE = '00000000-0000-0000-0000-000000000020'
PLAN_BOB_CONFIRMED = '00000000-0000-0000-0000-000000000021'
PLAN_CARLOS = '00000000-0000-0000-0000-000000000023'
PLAN_ALICE_TIMELESS = '00000000-0000-0000-0000-000000000022'

TOMORROW = str(date.today() + timedelta(days=1))
NEXT_WEEK = str(date.today() + timedelta(days=7))


def get(client, path, headers):
    return client.get(path, headers=headers)


# --- J1 Onboarding ---------------------------------------------------------------

class TestOnboarding:
    def test_new_user_needs_onboarding(self, client, as_newuser):
        r = client.post('/api/v1/auth/session', headers=as_newuser)
        assert r.status_code == 200
        assert r.json['data']['needs_onboarding'] is True

    def test_onboard_happy_path(self, client, as_newuser):
        r = client.post('/api/v1/auth/onboard', json={'handle': 'newbie', 'display_name': 'New B'}, headers=as_newuser)
        assert r.status_code == 201
        assert r.json['data']['handle'] == 'newbie'
        r2 = client.post('/api/v1/auth/session', headers=as_newuser)
        assert r2.json['data']['needs_onboarding'] is False

    def test_handle_taken_gets_409_and_suggestions(self, client, as_newuser):
        r = client.post('/api/v1/auth/onboard', json={'handle': 'alice'}, headers=as_newuser)
        assert r.status_code == 409
        assert r.json['error']['code'] == 'CONFLICT'
        assert r.json['error']['fields']['handle'] == 'TAKEN'
        assert len(r.json['error']['fields']['suggestions']) > 0

    def test_invalid_handle_422(self, client, as_newuser):
        r = client.post('/api/v1/auth/onboard', json={'handle': 'A!'}, headers=as_newuser)
        assert r.status_code == 422

    def test_onboard_idempotent_resubmit(self, client, as_newuser):
        client.post('/api/v1/auth/onboard', json={'handle': 'newbie'}, headers=as_newuser)
        r = client.post('/api/v1/auth/onboard', json={'handle': 'newbie'}, headers=as_newuser)
        assert r.status_code == 200  # J1.6

    def test_handle_check(self, client, as_newuser):
        r = client.get('/api/v1/users/handle-check?handle=alice', headers=as_newuser)
        assert r.json['data']['available'] is False
        r = client.get('/api/v1/users/handle-check?handle=fresh_handle', headers=as_newuser)
        assert r.json['data']['available'] is True

    def test_unauthenticated_rejected(self, client):
        r = client.post('/api/v1/auth/session')
        assert r.status_code == 401


# --- J3 Saving places --------------------------------------------------------------

class TestSavePlace:
    def test_save_with_note(self, client, as_alice):
        r = client.post('/api/v1/user-places', json={'place_id': PLACE_GASWORKS, 'note': 'sunset!'}, headers=as_alice)
        assert r.status_code == 201
        assert r.json['data']['note'] == 'sunset!'

    def test_double_save_idempotent(self, client, as_alice):
        client.post('/api/v1/user-places', json={'place_id': PLACE_GASWORKS}, headers=as_alice)
        r = client.post('/api/v1/user-places', json={'place_id': PLACE_GASWORKS}, headers=as_alice)
        assert r.status_code == 200  # P2: duplicate = success

    def test_resave_does_not_clobber_note(self, client, as_alice):
        client.post('/api/v1/user-places', json={'place_id': PLACE_GASWORKS, 'note': 'keep me'}, headers=as_alice)
        client.post('/api/v1/user-places', json={'place_id': PLACE_GASWORKS}, headers=as_alice)
        r = client.get('/api/v1/user-places/mine', headers=as_alice)
        notes = {p['place_id']: p['note'] for p in r.json['data']}
        assert notes[PLACE_GASWORKS] == 'keep me'

    def test_note_too_long(self, client, as_alice):
        r = client.post('/api/v1/user-places', json={'place_id': PLACE_GASWORKS, 'note': 'x' * 501}, headers=as_alice)
        assert r.status_code == 422

    def test_unsave_idempotent(self, client, as_alice):
        client.delete(f'/api/v1/user-places/{PLACE_VICTROLA}', headers=as_alice)
        r = client.delete(f'/api/v1/user-places/{PLACE_VICTROLA}', headers=as_alice)
        assert r.status_code == 200

    def test_unsave_keeps_plan(self, client, as_alice):
        # J3.5: alice has a timeless plan at Frye; unsaving Frye keeps the plan
        client.delete('/api/v1/user-places/00000000-0000-0000-0000-000000000015', headers=as_alice)
        r = client.get(f'/api/v1/plans/{PLAN_ALICE_TIMELESS}', headers=as_alice)
        assert r.status_code == 200
        assert r.json['data']['status'] == 'active'


# --- J4 Plan creation -----------------------------------------------------------------

class TestCreatePlan:
    def test_create_tentative_plan_autosaves(self, client, as_alice):
        r = client.post('/api/v1/plans', json={'place_id': PLACE_OPTIMISM, 'plan_date': NEXT_WEEK}, headers=as_alice)
        assert r.status_code == 201
        assert r.json['data']['state'] == 'tentative'
        saved = client.get('/api/v1/user-places/mine', headers=as_alice)
        assert PLACE_OPTIMISM in {p['place_id'] for p in saved.json['data']}

    def test_create_timeless(self, client, as_alice):
        r = client.post('/api/v1/plans', json={'place_id': PLACE_OPTIMISM}, headers=as_alice)
        assert r.status_code == 201
        assert r.json['data']['state'] == 'timeless'

    def test_date_in_past_rejected(self, client, as_alice):
        r = client.post('/api/v1/plans', json={'place_id': PLACE_OPTIMISM, 'plan_date': '2020-01-01'}, headers=as_alice)
        assert r.status_code == 422
        assert r.json['error']['code'] == 'TIME_IN_PAST'

    def test_today_requires_time(self, client, as_alice):
        r = client.post('/api/v1/plans', json={'place_id': PLACE_OPTIMISM, 'plan_date': str(date.today())}, headers=as_alice)
        assert r.status_code == 422
        assert r.json['error']['code'] == 'TIME_REQUIRED_TODAY'

    def test_outside_opening_hours(self, client, as_alice):
        # Optimism opens at 16:00 — 10:00 is outside
        r = client.post('/api/v1/plans', json={'place_id': PLACE_OPTIMISM, 'plan_date': NEXT_WEEK, 'plan_time': '10:00'}, headers=as_alice)
        assert r.status_code == 422
        assert r.json['error']['code'] == 'OUTSIDE_OPENING_HOURS'

    def test_unknown_hours_allowed(self, client, as_alice):
        # Gas Works has no hours data → any time allowed (P9 / J4.3)
        r = client.post('/api/v1/plans', json={'place_id': PLACE_GASWORKS, 'plan_date': NEXT_WEEK, 'plan_time': '05:00'}, headers=as_alice)
        assert r.status_code == 201

    def test_plan_created_telemetry(self, client, as_alice, app):
        client.post('/api/v1/plans', json={'place_id': PLACE_OPTIMISM}, headers=as_alice)
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'plan_created').execute().data
        assert len(events) >= 1


# --- J5/M-J1 Materialization -------------------------------------------------------------

class TestMaterialization:
    def test_organizer_adds_time_notifies_joined_and_interested(self, client, as_alice, as_bob, app):
        # alice (mutual friend) is interested in bob's tentative plan
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        # bob sets the time (within Optimism hours, 16:00+)
        r = client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time': '18:00'}, headers=as_bob)
        assert r.status_code == 200
        assert r.json['data']['state'] == 'confirmed'
        # M-D7(a): alice was notified
        notifs = client.get('/api/v1/notifications', headers=as_alice).json['data']
        types = {n['type'] for n in notifs}
        assert 'plan_time_updated' in types
        # M-D10(a): plan_materialized fired once
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'plan_materialized').execute().data
        assert len([e for e in events if e['properties'].get('plan_id') == PLAN_BOB_TENTATIVE]) == 1

    def test_time_change_renotifies_but_no_second_materialized(self, client, as_alice, as_bob, app):
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time': '18:00'}, headers=as_bob)
        client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time': '19:00'}, headers=as_bob)  # M-D11
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'plan_materialized').execute().data
        assert len([e for e in events if e['properties'].get('plan_id') == PLAN_BOB_TENTATIVE]) == 1
        notifs = client.get('/api/v1/notifications', headers=as_alice).json['data']
        time_updates = [n for n in notifs if n['type'] == 'plan_time_updated']
        assert len(time_updates) == 2

    def test_non_organizer_cannot_set_time(self, client, as_alice):
        r = client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time': '18:00'}, headers=as_alice)
        assert r.status_code == 403

    def test_materialize_timeless_plan_via_date_pills(self, client, as_alice):
        # M-D9(a): timeless → tentative with just a date
        r = client.patch(f'/api/v1/plans/{PLAN_ALICE_TIMELESS}', json={'plan_date': NEXT_WEEK}, headers=as_alice)
        assert r.status_code == 200
        assert r.json['data']['state'] == 'tentative'


# --- J6 Cancel -----------------------------------------------------------------------------

class TestCancelPlan:
    def test_cancel_notifies_joiners_not_interested(self, client, as_alice, as_bob, as_carlos):
        # alice joined bob's confirmed plan (seed). carlos can't see it (not mutual with bob).
        r = client.post(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/cancel', headers=as_bob)
        assert r.status_code == 200
        assert r.json['data']['is_cancelled'] is True
        notifs = client.get('/api/v1/notifications', headers=as_alice).json['data']
        assert 'plan_cancelled' in {n['type'] for n in notifs}  # joiner notified

    def test_double_cancel_noop(self, client, as_bob):
        client.post(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/cancel', headers=as_bob)
        r = client.post(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/cancel', headers=as_bob)
        assert r.status_code == 200  # P2

    def test_only_organizer_cancels(self, client, as_alice):
        r = client.post(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/cancel', headers=as_alice)
        assert r.status_code == 403

    def test_cancelled_plan_survives_for_joiners(self, client, as_alice, as_bob):
        client.post(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/cancel', headers=as_bob)
        r = client.get(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}', headers=as_alice)
        assert r.status_code == 200
        assert r.json['data']['is_cancelled'] is True

    def test_join_after_cancel_allowed(self, client, as_alice, as_bob):
        # Race ledger: join lands on cancelled plan and succeeds
        client.delete(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/joins', headers=as_alice)
        client.post(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/cancel', headers=as_bob)
        r = client.post(f'/api/v1/plans/{PLAN_BOB_CONFIRMED}/joins', headers=as_alice)
        assert r.status_code == 201
        assert r.json['data']['is_cancelled'] is True


# --- J7 Social graph ---------------------------------------------------------------------------

class TestFollows:
    def test_follow_by_handle_notifies(self, client, as_carlos, as_bob):
        r = client.post('/api/v1/follows', json={'handle': 'bob'}, headers=as_carlos)
        assert r.status_code == 201
        notifs = client.get('/api/v1/notifications', headers=as_bob).json['data']
        assert any(n['type'] == 'new_follower' and n['data']['follower_handle'] == 'carlos' for n in notifs)

    def test_double_follow_idempotent_single_notification(self, client, as_carlos, as_bob):
        client.post('/api/v1/follows', json={'handle': 'bob'}, headers=as_carlos)
        r = client.post('/api/v1/follows', json={'handle': 'bob'}, headers=as_carlos)
        assert r.status_code == 200  # P2
        notifs = client.get('/api/v1/notifications', headers=as_bob).json['data']
        assert len([n for n in notifs if n['type'] == 'new_follower' and n['data'].get('follower_handle') == 'carlos']) == 1

    def test_follow_back_creates_mutual_and_telemetry(self, client, as_carlos, app):
        # alice already follows carlos (seed). carlos follows back → mutual
        r = client.post('/api/v1/follows', json={'handle': 'alice'}, headers=as_carlos)
        assert r.json['data']['is_mutual'] is True
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'mutual_connection_formed').execute().data
        assert len(events) == 1

    def test_self_follow_rejected(self, client, as_alice):
        r = client.post('/api/v1/follows', json={'handle': 'alice'}, headers=as_alice)
        assert r.status_code == 422  # J7.4

    def test_private_profile_blocks_new_followers(self, client, as_bob):
        r = client.post('/api/v1/follows', json={'handle': 'dana'}, headers=as_bob)
        assert r.status_code == 403  # J7.5

    def test_unfollow_and_refollow_restores_mutual(self, client, as_alice, as_bob):
        client.delete('/api/v1/follows/bob', headers=as_alice)
        r = client.post('/api/v1/follows', json={'handle': 'bob'}, headers=as_alice)
        assert r.json['data']['is_mutual'] is True  # J7.7

    def test_unfollow_idempotent(self, client, as_alice):
        client.delete('/api/v1/follows/bob', headers=as_alice)
        r = client.delete('/api/v1/follows/bob', headers=as_alice)
        assert r.status_code == 200


# --- J8 Profile tiers -----------------------------------------------------------------------------

class TestProfileTiers:
    def test_mutual_sees_full_profile(self, client, as_alice):
        r = client.get('/api/v1/users/bob', headers=as_alice)
        assert r.json['data']['tier'] == 'mutual'
        places = client.get('/api/v1/users/bob/places', headers=as_alice)
        assert places.status_code == 200
        plans = client.get('/api/v1/users/bob/plans', headers=as_alice)
        assert plans.status_code == 200

    def test_one_way_follower_sees_curated_lists_only(self, client, as_alice):
        r = client.get('/api/v1/users/carlos', headers=as_alice)
        data = r.json['data']
        assert data['tier'] == 'follower'
        assert 'favorite_places' in data and 'want_to_go' in data
        # carlos's past izakaya plans make Tsukushinbo a favorite
        fav_names = {p['name'] for p in data['favorite_places']}
        assert 'Tsukushinbo' in fav_names
        wtg_names = {p['name'] for p in data['want_to_go']}
        assert 'Tsukushinbo' in wtg_names
        # but full lists are forbidden
        assert client.get('/api/v1/users/carlos/places', headers=as_alice).status_code == 403
        assert client.get('/api/v1/users/carlos/plans', headers=as_alice).status_code == 403

    def test_stranger_sees_basic_only(self, client, as_carlos):
        r = client.get('/api/v1/users/bob', headers=as_carlos)
        data = r.json['data']
        assert data['tier'] == 'none'
        assert 'favorite_places' not in data

    def test_private_profile_hidden(self, client, as_bob):
        r = client.get('/api/v1/users/dana', headers=as_bob)
        data = r.json['data']
        assert data['tier'] == 'private'
        assert 'bio' not in data

    def test_unknown_handle_404(self, client, as_alice):
        assert client.get('/api/v1/users/ghost', headers=as_alice).status_code == 404


# --- J9/J10 Join + Interested ---------------------------------------------------------------------

class TestJoinInterest:
    def test_join_notifies_organizer(self, client, as_alice, as_bob):
        r = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/joins', headers=as_alice)
        assert r.status_code == 201  # M-D8a: join allowed on tentative
        notifs = client.get('/api/v1/notifications', headers=as_bob).json['data']
        assert 'friend_joined_plan' in {n['type'] for n in notifs}

    def test_double_join_idempotent(self, client, as_alice):
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/joins', headers=as_alice)
        r = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/joins', headers=as_alice)
        assert r.status_code == 200

    def test_non_mutual_cannot_join(self, client, as_carlos):
        r = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/joins', headers=as_carlos)
        assert r.status_code == 404  # no existence leak

    def test_interested_toggle_and_count(self, client, as_alice):
        r = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        assert r.status_code == 201 and r.json['data']['interest_count'] == 1
        r = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        assert r.status_code == 200 and r.json['data']['interest_count'] == 1  # no double count
        r = client.delete(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        assert r.json['data']['interest_count'] == 0

    def test_interested_identities_organizer_only(self, client, as_alice, as_bob):
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        assert client.get(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_bob).status_code == 200
        assert client.get(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice).status_code == 403  # M-D13a

    def test_organizer_cannot_join_own(self, client, as_bob):
        r = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/joins', headers=as_bob)
        assert r.status_code == 422


# --- Panel -------------------------------------------------------------------------------------------

class TestPanel:
    def test_panel_order_and_meta(self, client, as_alice):
        r = client.get('/api/v1/panel?lat=47.61&lng=-122.32', headers=as_alice)
        data = r.json['data']
        types = [c['type'] for c in data['cards']]
        # notifications before plans before places
        assert types.index('notification') < types.index('plan') < types.index('place')
        assert data['meta']['friend_count'] == 1  # bob
        assert data['meta']['sorted_by'] == 'proximity'

    def test_carlos_plan_invisible_to_alice(self, client, as_alice):
        r = client.get('/api/v1/panel', headers=as_alice)
        plan_ids = {c['plan_id'] for c in r.json['data']['cards'] if c['type'] == 'plan'}
        assert PLAN_CARLOS not in plan_ids  # one-way follow ≠ plan visibility

    def test_friend_places_distinct(self, client, as_alice):
        r = client.get('/api/v1/panel?lat=47.61&lng=-122.32', headers=as_alice)
        sources = {c['source'] for c in r.json['data']['cards'] if c['type'] == 'place'}
        assert 'own' in sources and 'friend' in sources

    def test_date_passed_tentative_excluded(self, client, as_alice):
        # seed plan 29: alice's tentative plan dated yesterday → archived out (M-D6a)
        r = client.get('/api/v1/panel', headers=as_alice)
        plan_ids = {c['plan_id'] for c in r.json['data']['cards'] if c['type'] == 'plan'}
        assert '00000000-0000-0000-0000-000000000029' not in plan_ids

    def test_dismiss_notification(self, client, as_alice):
        r = client.get('/api/v1/panel', headers=as_alice)
        notif = next(c for c in r.json['data']['cards'] if c['type'] == 'notification')
        client.post(f"/api/v1/notifications/{notif['id']}/dismiss", headers=as_alice)
        r2 = client.get('/api/v1/panel', headers=as_alice)
        ids = {c['id'] for c in r2.json['data']['cards'] if c['type'] == 'notification'}
        assert notif['id'] not in ids


# --- Reminders job (M-J1, M-J5) ---------------------------------------------------------------------

class TestReminders:
    def test_day_before_nudge_for_tentative(self, client, as_bob):
        r = client.post('/api/v1/dev/run-reminders')
        assert r.status_code == 200
        counts = r.json['data']
        assert counts['day_before'] >= 1  # bob's tentative plan is tomorrow
        notifs = client.get('/api/v1/notifications', headers=as_bob).json['data']
        assert 'plan_reminder_day_before' in {n['type'] for n in notifs}

    def test_reminders_idempotent(self, client, as_bob):
        client.post('/api/v1/dev/run-reminders')
        r = client.post('/api/v1/dev/run-reminders')
        assert r.json['data']['day_before'] == 0  # deduped on second run

    def test_date_passed_prompt(self, client, as_alice):
        client.post('/api/v1/dev/run-reminders')
        notifs = client.get('/api/v1/notifications', headers=as_alice).json['data']
        passed = [n for n in notifs if n['type'] == 'plan_date_passed']
        assert len(passed) == 1  # alice's yesterday tentative plan (seed 29)
        assert passed[0]['data']['place_id']  # carries place for one-tap re-create

    def test_timeless_never_nudged(self, client, as_alice):
        client.post('/api/v1/dev/run-reminders')
        notifs = client.get('/api/v1/notifications', headers=as_alice).json['data']
        for n in notifs:
            if n['type'].startswith('plan_reminder'):
                assert n['data'].get('plan_id') != PLAN_ALICE_TIMELESS  # M-D2a


# --- Search + places ----------------------------------------------------------------------------------

class TestPlaces:
    def test_local_search_fallback(self, client, as_alice):
        r = client.get('/api/v1/places/search?q=coffee&lat=47.61&lng=-122.32', headers=as_alice)
        assert r.status_code == 200
        assert r.json['data']['degraded'] is True  # no Google key in tests
        names = {p['name'] for p in r.json['data']['results']}
        assert 'Victrola Coffee Roasters' in names or 'Anchorhead Coffee' in names

    def test_place_detail_includes_viewer_state(self, client, as_alice):
        r = client.get(f'/api/v1/places/{PLACE_VICTROLA}', headers=as_alice)
        assert r.json['data']['viewer']['is_saved'] is True
        assert r.json['data']['viewer']['note']

    def test_contextual_returns_tagline(self, client, as_alice):
        r = client.get('/api/v1/places/contextual?lat=47.61&lng=-122.32', headers=as_alice)
        assert r.status_code == 200
        assert r.json['data']['tagline']

    def test_map_pins_sources(self, client, as_alice):
        r = client.get('/api/v1/places/map', headers=as_alice)
        sources = {p['source'] for p in r.json['data']}
        assert sources == {'own', 'friend'}


# --- Invite links ---------------------------------------------------------------------------------------

class TestInviteLinks:
    def test_create_and_resolve(self, client, as_alice):
        r = client.post('/api/v1/invite-links', json={}, headers=as_alice)
        token = r.json['data']['token']
        pub = client.get(f'/api/v1/invite-links/{token}')  # anonymous
        assert pub.status_code == 200
        assert pub.json['data']['creator']['handle'] == 'alice'

    def test_plan_link_hides_details_from_anonymous(self, client, as_bob):
        r = client.post('/api/v1/invite-links', json={'plan_id': PLAN_BOB_TENTATIVE}, headers=as_bob)
        token = r.json['data']['token']
        pub = client.get(f'/api/v1/invite-links/{token}')
        assert pub.json['data']['place']['name']  # teaser ok
        assert pub.json['data']['plan_id'] is None  # no plan access while anonymous (J0.1)

    def test_redeem_follows_and_converts_once(self, client, as_carlos, as_alice, app):
        r = client.post('/api/v1/invite-links', json={}, headers=as_alice)
        token = r.json['data']['token']
        r1 = client.post(f'/api/v1/invite-links/{token}/redeem', headers=as_carlos)
        assert r1.json['data']['followed'] is True
        client.post(f'/api/v1/invite-links/{token}/redeem', headers=as_carlos)
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'invite_link_converted').execute().data
        assert len(events) == 1

    def test_bad_token_404(self, client, as_alice):
        assert client.get('/api/v1/invite-links/nope').status_code == 404


# --- J5.2/J5.3 Collaborative time proposals (M-D14..M-D18) -------------------------

def _propose(client, plan_id, headers, options, **extra):
    return client.post(f'/api/v1/plans/{plan_id}/proposals', json={'options': options, **extra}, headers=headers)


class TestTimeProposals:
    OPT_EXACT = {'plan_date': NEXT_WEEK, 'plan_time': '18:00'}        # within Optimism hours (16:00+)
    OPT_BAND = {'plan_date': NEXT_WEEK, 'plan_time_band': 'evening'}  # 17:00–22:00, valid for Optimism

    def test_propose_then_accept_materializes(self, client, as_alice, as_bob, app):
        # alice (mutual friend) proposes 2 options on bob's tentative plan
        r = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_EXACT, self.OPT_BAND])
        assert r.status_code == 201
        pid = r.json['data']['id']
        # bob is also notified there's a proposal to review
        assert 'plan_time_proposed' in {n['type'] for n in client.get('/api/v1/notifications', headers=as_bob).json['data']}
        # organizer accepts the exact-time option → plan materializes
        acc = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/proposals/{pid}/accept',
                          json={'option_index': 0}, headers=as_bob)
        assert acc.status_code == 200
        assert acc.json['data']['state'] == 'confirmed' and acc.json['data']['plan_time'] == '18:00'
        # proposer is told her time was picked
        assert 'plan_proposal_accepted' in {n['type'] for n in client.get('/api/v1/notifications', headers=as_alice).json['data']}
        # plan_materialized fires exactly once
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'plan_materialized').execute().data
        assert len([e for e in events if e['properties'].get('plan_id') == PLAN_BOB_TENTATIVE]) == 1

    def test_accept_fans_out_to_joiner_not_proposer(self, client, as_alice, as_bob, as_carlos):
        # make carlos & bob mutual so carlos can join bob's plan
        client.post('/api/v1/follows', json={'handle': 'bob'}, headers=as_carlos)
        client.post('/api/v1/follows', json={'handle': 'carlos'}, headers=as_bob)
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/joins', headers=as_carlos)
        # alice is interested (in the audience) AND proposes
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        pid = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_EXACT]).json['data']['id']
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/proposals/{pid}/accept', json={'option_index': 0}, headers=as_bob)
        # carlos (joiner) gets the generic time update
        assert 'plan_time_updated' in {n['type'] for n in client.get('/api/v1/notifications', headers=as_carlos).json['data']}
        # alice (proposer) gets the specific accepted card — NOT the generic one (excluded from fan-out)
        alice_types = {n['type'] for n in client.get('/api/v1/notifications', headers=as_alice).json['data']}
        assert 'plan_proposal_accepted' in alice_types
        assert 'plan_time_updated' not in alice_types

    def test_decline_keeps_plan_untimed(self, client, as_alice, as_bob):
        pid = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_EXACT]).json['data']['id']
        d = client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/proposals/{pid}/decline', headers=as_bob)
        assert d.status_code == 200
        assert d.json['data']['state'] == 'tentative'  # M-D18: back to un-timed
        assert 'plan_proposal_declined' in {n['type'] for n in client.get('/api/v1/notifications', headers=as_alice).json['data']}

    def test_one_pending_proposal_per_plan(self, client, as_alice):
        _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_EXACT])
        r = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_BAND])
        assert r.status_code == 409  # M-D16

    def test_non_mutual_cannot_propose(self, client, as_carlos):
        r = _propose(client, PLAN_BOB_TENTATIVE, as_carlos, [self.OPT_EXACT])
        assert r.status_code == 404  # carlos isn't mutual with bob — no existence leak

    def test_organizer_cannot_propose_own(self, client, as_bob):
        r = _propose(client, PLAN_BOB_TENTATIVE, as_bob, [self.OPT_EXACT])
        assert r.status_code == 403  # organizers set their own time directly

    def test_retract_frees_slot(self, client, as_alice):
        pid = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_EXACT]).json['data']['id']
        client.delete(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/proposals/{pid}', headers=as_alice)
        again = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_BAND])
        assert again.status_code == 201  # slot freed

    def test_organizer_direct_set_voids_proposal(self, client, as_alice, as_bob):
        _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_EXACT])
        client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time': '20:00'}, headers=as_bob)
        assert 'plan_proposal_declined' in {n['type'] for n in client.get('/api/v1/notifications', headers=as_alice).json['data']}
        props = client.get(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/proposals', headers=as_bob).json['data']
        assert all(p['status'] != 'pending' for p in props)

    def test_option_outside_hours_rejected(self, client, as_alice):
        r = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [{'plan_date': NEXT_WEEK, 'plan_time': '10:00'}])
        assert r.status_code == 422  # Optimism opens 16:00

    def test_expiry_voids_and_notifies(self, client, as_alice, app):
        pid = _propose(client, PLAN_BOB_TENTATIVE, as_alice, [self.OPT_EXACT]).json['data']['id']
        from app.extensions import get_supabase
        with app.app_context():  # force the proposal past its expiry
            get_supabase().table('plan_time_proposals').update(
                {'expires_at': '2020-01-01T00:00:00+00:00'}).eq('id', pid).execute()
        counts = client.post('/api/v1/dev/run-reminders').json['data']
        assert counts['expired'] >= 1
        declined = [n for n in client.get('/api/v1/notifications', headers=as_alice).json['data']
                    if n['type'] == 'plan_proposal_declined']
        assert any(n['data'].get('reason') == 'expired' for n in declined)


# --- Coarse time / generic→specific picker (M-D19/M-D20) ---------------------------

class TestCoarseTime:
    def test_create_plan_with_band(self, client, as_alice):
        r = client.post('/api/v1/plans',
                        json={'place_id': PLACE_OPTIMISM, 'plan_date': NEXT_WEEK, 'plan_time_band': 'evening'},
                        headers=as_alice)
        assert r.status_code == 201
        d = r.json['data']
        assert d['state'] == 'confirmed' and d['time_granularity'] == 'approximate'
        assert d['plan_time_band'] == 'evening' and d['plan_time'] is None

    def test_band_set_materializes_and_notifies(self, client, as_alice, as_bob, app):
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        r = client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time_band': 'evening'}, headers=as_bob)
        assert r.status_code == 200
        assert r.json['data']['state'] == 'confirmed' and r.json['data']['time_granularity'] == 'approximate'
        assert 'plan_time_updated' in {n['type'] for n in client.get('/api/v1/notifications', headers=as_alice).json['data']}
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'plan_materialized').execute().data
        mine = [e for e in events if e['properties'].get('plan_id') == PLAN_BOB_TENTATIVE]
        assert len(mine) == 1 and mine[0]['properties'].get('time_granularity') == 'approximate'

    def test_band_refine_to_exact_no_second_materialized(self, client, as_alice, as_bob, app):
        client.post(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}/interests', headers=as_alice)
        client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time_band': 'evening'}, headers=as_bob)
        r = client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time': '18:00'}, headers=as_bob)
        assert r.json['data']['time_granularity'] == 'exact' and r.json['data']['plan_time_band'] is None
        from app.extensions import get_supabase
        with app.app_context():
            events = get_supabase().table('events').select('*').eq('event_name', 'plan_materialized').execute().data
        assert len([e for e in events if e['properties'].get('plan_id') == PLAN_BOB_TENTATIVE]) == 1
        updates = [n for n in client.get('/api/v1/notifications', headers=as_alice).json['data'] if n['type'] == 'plan_time_updated']
        assert len(updates) == 2  # band set + refine both re-notify

    def test_band_plan_not_unconfirmed(self, client, as_bob):
        client.patch(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', json={'plan_time_band': 'evening'}, headers=as_bob)
        d = client.get(f'/api/v1/plans/{PLAN_BOB_TENTATIVE}', headers=as_bob).json['data']
        assert d['is_unconfirmed'] is False and d['time_granularity'] == 'approximate'

    def test_band_plan_reminder_carries_band(self, client, as_alice):
        # Gas Works has no hours → a band for tomorrow is valid; it's confirmed-approximate
        client.post('/api/v1/plans', json={'place_id': PLACE_GASWORKS, 'plan_date': TOMORROW, 'plan_time_band': 'evening'}, headers=as_alice)
        client.post('/api/v1/dev/run-reminders')
        notifs = client.get('/api/v1/notifications', headers=as_alice).json['data']
        assert any(n['type'] == 'plan_reminder_day_before' and n['data'].get('plan_time_band') == 'evening' for n in notifs)
        # a band plan is confirmed → never the date_passed recovery prompt
        assert not any(n['type'] == 'plan_date_passed' and n['data'].get('plan_time_band') == 'evening' for n in notifs)

    def test_band_outside_hours_rejected(self, client, as_alice):
        # Optimism opens 16:00 → 'morning' (06:00–12:00) has no open slot
        r = client.post('/api/v1/plans', json={'place_id': PLACE_OPTIMISM, 'plan_date': NEXT_WEEK, 'plan_time_band': 'morning'}, headers=as_alice)
        assert r.status_code == 422 and r.json['error']['code'] == 'OUTSIDE_OPENING_HOURS'
