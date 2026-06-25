# Edge Cases & Error Handling — Hyperlocal MVP-1

> **Status:** Draft for review
> **Last updated:** 2026-06-11
> **Companion:** [pm/4-user-journeys-mvp1.md](../pm/4-user-journeys-mvp1.md) defines *what* should happen on every sad path; this doc defines *how* — on the actual stack (React Query + Zustand frontend, Flask/Lambda API, Supabase Postgres + Realtime).
> **References:** [01-system-architecture.md](01-system-architecture.md) · [02-database-schema.md](02-database-schema.md) · [04-api-design.md](04-api-design.md) · [05-realtime-architecture.md](05-realtime-architecture.md) · [06-frontend-architecture.md](06-frontend-architecture.md)

This doc implements the ten resolution patterns (P1–P10) from the journeys doc. Each section gives the mechanism once; the per-endpoint table at the end maps every mutation to its patterns.

---

## 1. Pattern Implementations

### P1 — Optimistic update + rollback (React Query)

Used for: Interested, Join, Follow, place save. Already a stated convention in [06-frontend-architecture.md](06-frontend-architecture.md) for Interested/Join — this extends it to all lightweight social toggles.

```ts
// Canonical shape — useInterested.ts and siblings
const mutation = useMutation({
  mutationFn: () => api.post(`/plans/${planId}/interests`),
  onMutate: async () => {
    await queryClient.cancelQueries({ queryKey: queryKeys.plan(planId) });
    const previous = queryClient.getQueryData(queryKeys.plan(planId));
    queryClient.setQueryData(queryKeys.plan(planId), (old) => ({
      ...old, viewer_interested: true, interest_count: old.interest_count + 1,
    }));
    return { previous };
  },
  onError: (err, _vars, ctx) => {
    queryClient.setQueryData(queryKeys.plan(planId), ctx.previous);
    if (!isIdempotentSuccess(err)) toast.error("Couldn't save that — try again");
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.plan(planId) }),
});
```

**Rule: optimistic only for self-scoped, single-row toggles.** Plan creation and cancellation fan out to other users' Panels — those wait for the server (journeys 4.4, 6.1) and show a pending state on the button instead.

### P2 — Idempotent actions

Two halves:

**Server:** every social edge has a DB uniqueness constraint (`follows (follower_id, followee_id)`, `plan_joins (plan_id, user_id)`, `plan_interests (plan_id, user_id)`, `user_places (user_id, place_id)` — see [02-database-schema.md](02-database-schema.md)). Flask catches the unique-violation and returns **`200` with the current resource state instead of `409`** for these toggle endpoints. `409 CONFLICT` is reserved for genuinely contested resources (handle taken).

```python
# routes/joins.py — duplicate join resolves to success
try:
    row = insert_join(plan_id, user_id)
    created = True
except UniqueViolation:
    row = get_join(plan_id, user_id)
    created = False
return jsonify(serialize_join(row)), 200 if not created else 201
```

**Client:** `isIdempotentSuccess(err)` treats a 200-on-duplicate as success (no rollback, no toast). Buttons disable while a mutation is in flight to prevent most double-taps at the source.

**Plan-creation dedupe (journey 4.5):** double-submit protection is client-side (disabled button + React Query `mutationKey` dedupe). No server idempotency key in MVP-1 — accepted risk; revisit if telemetry shows duplicate plans.

### P3 — Stale-state refresh on conflict

When the server rejects because the world changed (plan cancelled, mutuality broken, profile gone):

- API returns `404 NOT_FOUND` (resource gone/never visible) or `403 FORBIDDEN` (visibility revoked) per [04-api-design.md](04-api-design.md) conventions.
- Client maps both to the same handler: invalidate the relevant query keys, let the refetch repaint truth, show a one-line toast only when the user *initiated* the failed action (e.g. "This plan is no longer available"). Passive surfaces (Panel cards vanishing) repaint silently.
- **Never** render cached higher-privilege data after a `403`: the error handler also evicts (`queryClient.removeQueries`) profile/plan keys for that subject (journey 8.1).

**Join-after-cancel (journeys 6.2/9.3) — decision: allow.** `POST /plans/:plan_id/joins` succeeds on a `status = 'cancelled'` plan (plans survive their organizer — product philosophy). The response includes `plan.status` so the client immediately renders the cancelled banner. Joins are rejected (`404`) only when the plan date has passed or visibility is lost.

### P4 — Graceful degradation

| Dependency | Detection | Degraded behavior |
|---|---|---|
| Geolocation | `navigator.permissions.query` + getCurrentPosition error | mapStore falls back: last viewport (localStorage) → IP-region default → product default city. Panel proximity sort → `created_at DESC` with a "sorted by recent" chip. A `location_mode` flag in mapStore drives both. |
| Browser notifications | `Notification.permission` | Skip `new Notification()` calls; Panel cards are the source of truth regardless. Prompt for permission once, on first notification-worthy event, never again (localStorage flag). |
| Supabase Realtime | channel `status !== 'SUBSCRIBED'` / heartbeat timeout | React Query `refetchOnWindowFocus: true` (always on) + `refetchInterval: 60_000` activated only while the channel is down. Reconnect with exponential backoff (Supabase client default). See [05-realtime-architecture.md](05-realtime-architecture.md). |
| Clipboard | `navigator.clipboard` rejection | Fallback `<input readonly>` share sheet with selectable URL. |
| Area label (`GET /geo/reverse`) | provider 5xx / no named result | Drop the neighborhood name; overlay shows "this area". Discovery still works — scoping is driven by `bbox`/`lat`/`lng`, not the label (J14.1). |
| Notes-enriched search | note-match query path errors/times out | Fall back to name/category matches only, with a soft "searching notes is unavailable" note; never error the whole search (J16.1). |

### P5 — Inline validation + recovery

Validation lives in three layers; each inner layer is a backstop, not the UX:

1. **Client (pre-submit):** handle format (`^[a-z0-9_]{3,20}$` — single regex constant shared via `lib/validation.ts`, mirrored in Flask), note max length (live counter ≥90%), time-picker slots generated only from `place.opening_hours` ∩ future.
2. **API (Flask):** re-validates everything; field errors return `422 VALIDATION_ERROR` with `{ "fields": { "handle": "taken" } }` extension to the standard error shape.
3. **DB:** constraints (`plans_timeless_no_date`, `plans_time_requires_date`, uniques) — reaching these is a bug; they surface as `500` and get logged loudly.

**Handle availability:** debounced (400 ms) `GET /users/handle-check`; submit race returns `409` → keep input, render suggestions generated server-side (`{base}{n}`, `{base}_{city}` patterns).

**Time-just-passed (journey 4.2):** server validates `plan_date + plan_time > now()` in the **place's timezone** (from Google Places `utc_offset_minutes`, cached on `places`). `422` → client regenerates the slot list and highlights the change.

### P6 — Retry + offline awareness

- **Reads:** React Query defaults — `retry: 2` with exponential backoff, except `4xx` (no retry).
- **Mutations:** `retry: 0` by default (idempotency varies); user-visible retry affordance instead. Exception: telemetry and invite-redeem (P9 territory) retry once silently.
- **Offline:** `onlineManager` (React Query) drives a global banner; mutations fired while offline pause (`networkMode: 'online'`) and the triggering control shows a paused state. Form inputs are *never* cleared on failure — sheets stay mounted with state until success.

### P7 — Empty states

Empty states are **data contracts, not client guesses**: list endpoints return `{ items: [], total: 0 }` plus context the client needs to pick the right empty state, e.g. `GET /panel` includes `meta: { friend_count, saved_count }` so the Panel can distinguish "no friends yet" (J11.2) from "no places saved" (J11.1) from "nothing nearby". One `<EmptyState variant>` component; variants enumerated in [07-ui-component-spec.md](07-ui-component-spec.md).

### P8 — Deep-link preservation through auth

- Pre-auth intent stored in `sessionStorage` as `{ redirect: pathname, action?: { type: 'save_place' | 'follow' | ..., payload } }` before the OAuth redirect.
- `AuthCallbackPage` completes the session → if onboarding incomplete, route to onboarding *keeping the stored intent* → after handle creation, execute `action` (single mutation) and route to `redirect`.
- Half-onboarded accounts (J1.5): router guard — any authed route with `user.handle == null` redirects to `/onboarding`. The guard is the single enforcement point.
- Token refresh (X.1): Supabase client auto-refreshes; `onAuthStateChange('TOKEN_REFRESHED')` is a no-op, `('SIGNED_OUT')` triggers the soft re-auth modal (not a redirect) so in-progress form state survives.

### P9 — Soft-fail external dependencies

| Dependency | Failure mode | Behavior |
|---|---|---|
| Google Places (search/contextual) | 5xx, quota | One transparent retry; then cached/empty per J2.2/J0.4. Flask wraps Places errors as `502 UPSTREAM_ERROR` (new code, see §2) so the client can distinguish "our bug" from "Google's down". |
| Google Places (detail of a saved place) | place_id gone (`NOT_FOUND`) | Serve from our `places` row (we always have a snapshot — saves/plans copy core fields at write time). Set `places.is_unavailable = true` (new column, §3) on first detection; place detail renders the "may have closed" notice and **`POST /plans` rejects with `422 PLACE_UNAVAILABLE`** (J2.6, J4.7). |
| Weather | any | `GET /places/contextual` computes suggestions without the weather dimension and omits weather from the tagline payload. Weather is fetched server-side; the client never knows. |
| PostHog | any | Client SDK buffers; server-side `POST /analytics/track` returns `204` even when the upstream write fails (logged internally). Invite redemption attribution (J13.3): one silent retry, then drop. |

### P10 — Confirmations

Exactly one confirm step, only for: plan cancel (J6), leaving a joined plan (J9.5), unfollow **only when it breaks a mutual** (cheap relationship check already in the profile payload). Implemented as a shared `<ConfirmSheet>`; copy lives with the journey definitions, including the "can't be undone" line for plan cancel (J6.4).

---

## 2. Error Code Extensions

Additions to the common table in [04-api-design.md](04-api-design.md):

| Status | Code | Meaning | Client handling |
|---|---|---|---|
| 422 | `PLACE_UNAVAILABLE` | Target place no longer resolvable in Google Places | Render unavailable-place state; disable plan CTA |
| 422 | `TIME_IN_PAST` | Submitted plan time already passed | Regenerate picker slots (P5) |
| 422 | `OUTSIDE_OPENING_HOURS` | Time outside place hours | Regenerate picker slots; show hours |
| 429 | `RATE_LIMITED` | Per-user rate limit (search, handle-check) | Back off; keep input |
| 502 | `UPSTREAM_ERROR` | Google Places / weather hard failure | P9 degraded content, never a blame-the-user message |

`VALIDATION_ERROR` responses gain an optional `fields` object: `{ "error": "...", "code": "VALIDATION_ERROR", "fields": { "handle": "TAKEN" } }`.

**Toggle-endpoint duplicate convention (P2):** `POST` on follows/joins/interests/user-places returns `201` on create, `200` with current state on duplicate. Documented per-endpoint in 04 — this doc is the rationale.

---

## 3. Schema Deltas

Required by the sad paths; to be appended to [02-database-schema.md](02-database-schema.md) migrations:

```sql
-- P9: stale-place handling (J2.6, J4.7)
ALTER TABLE public.places
  ADD COLUMN is_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN unavailable_checked_at TIMESTAMPTZ;

-- P5: timezone-correct "future time" validation and reminder scheduling
ALTER TABLE public.places
  ADD COLUMN utc_offset_minutes INTEGER;          -- from Google Places, cached at fetch

-- P2 backstops — verify these uniques exist (they do per 02, listed here as the
-- canonical idempotency dependency): follows, plan_joins, plan_interests, user_places
```

**Discovery & curation (Lists / notes search):** the `lists` + `list_places` tables, the `list_visibility` enum, the `user_places.note` trigram index (`pg_trgm`), and `invite_links.list_id` are specified canonically in [02-database-schema.md](02-database-schema.md) — not repeated here.

**Open (worksheet):** a `users.timezone` column is likely needed for "morning of" reminders — deferred to the [materialization worksheet](../pm/specs/materialization-workflow.md) decision M-D3 rather than added speculatively.

---

## 4. Race Conditions Ledger

The complete list of multi-actor races MVP-1 must tolerate, with the deciding mechanism:

| Race | Winner / outcome | Mechanism |
|---|---|---|
| Join vs. organizer cancel | Both apply — join lands on cancelled plan, client renders cancelled state | Plans survive cancellation; no FK/status gate on `plan_joins` insert (status returned in response) |
| Join/Interest vs. mutuality broken | Server rejects with `404` (plan not visible) | Visibility check (`is_mutual`) inside the same transaction as the insert |
| Follow-back vs. original unfollow | Fresh one-way follow; no mutual formed | Follow insert is unconditional; mutuality is *derived*, never stored (per [02](02-database-schema.md) helper function) |
| Add-time vs. add-time (organizer, two tabs) | Last write wins; second tab repaints via Realtime | `plans.updated_at` trigger; no version column at MVP scale |
| Unsave vs. plan-create auto-save | Save exists if plan exists | `POST /plans` upserts `user_places` in-transaction |
| Notification tap vs. underlying state change | Stale notification self-resolves | Notification `data` carries IDs only; target fetch renders truth; tap on dead target → P3 toast + dismiss |
| Invite redeem vs. signup completion | Signup always completes; attribution best-effort | Redeem is a separate post-onboarding call, never in the critical path |

---

## 5. Per-Endpoint Pattern Map

| Endpoint | Patterns | Notes |
|---|---|---|
| `POST /auth/session` / `/auth/onboard` | P5, P6, P8 | Handle race → 409 + suggestions; onboarding guard |
| `GET /places/search` | P6, P7, P9 | 429 + UPSTREAM_ERROR handling; empty-state contract; note-match path degrades to name/category only (J16.1) |
| `GET /places/contextual` | P9, P7 | Weather-less fallback computed server-side; area-scoped + capped |
| `GET /geo/reverse` | P4, P9 | Missing label → "this area"; coarse-cached; never blocks discovery |
| `POST /user-places` | P1, P2 | Optimistic; duplicate → 200; default-list add when no `list_ids` |
| `GET/POST/PATCH/DELETE /lists*` | P1, P5, P10 | Owner-only writes; default list not deletable (409); private-list 403; visibility flip 404s old share links (J17–J19) |
| `PUT/DELETE /lists/:id/places/:pid` | P1, P2 | Idempotent add; remove never unsaves the place or touches other lists |
| `PATCH /user-places/:id` (note) | P5, P6 | Length clamp; input preservation |
| `DELETE /user-places/:id` | P2, P3 | No-op if absent; friend surfaces repaint via Realtime |
| `POST /plans` | P2(client), P5, P9 | No optimistic insert; PLACE_UNAVAILABLE; same-place prompt is client-side using existing plan list |
| `PATCH /plans/:id` (add time) | P3, P5 | TIME_IN_PAST / OUTSIDE_OPENING_HOURS; stale-notification self-dismiss |
| `POST /plans/:id/cancel` | P2, P10 | No optimistic removal; double-cancel no-op |
| `POST /plans/:id/joins` | P1, P2, P3 | Succeeds on cancelled plan; 404 on visibility loss |
| `DELETE /plans/:id/joins` | P2, P10 | Leave-plan confirm; no organizer notification (MVP-1) |
| `POST/DELETE /plans/:id/interests` | P1, P2 | The canonical optimistic toggle |
| `POST /follows` | P1, P2, P5 | Self-follow 422 backstop; private-profile 403 |
| `DELETE /follows/:handle` | P2, P10 (mutual only) | Re-follow within 24 h suppresses duplicate notification |
| `GET /panel` | P4, P7 | `meta` for empty-state selection; polling fallback when Realtime down |
| `POST /invite-links/:token/redeem` | P9 | Never blocks onboarding; silent single retry |
| `POST /analytics/track` | P9 | Always 204 to client |

---

## 6. Testing Checklist (per journey)

Each sad path in the journeys doc gets one test at the cheapest layer that proves it:

- **Flask unit tests:** every error-code branch in §2, idempotent-duplicate responses, race ledger items enforceable in one transaction (visibility-checked inserts).
- **Frontend integration (Vitest + MSW):** P1 rollback on 500, P3 cache eviction on 403, P8 intent-resume through a mocked OAuth round-trip, offline mutation pausing.
- **Manual/E2E (small set):** two-browser races — join-vs-cancel, follow-back-vs-unfollow, add-time in two tabs — and geolocation/notification permission denial flows.
