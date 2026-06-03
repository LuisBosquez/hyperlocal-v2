# Frontend Architecture — Hyperlocal MVP-1

> **Stack:** React (Vite) · Mapbox GL JS · Supabase JS · React Query · Zustand · React Router · Tailwind CSS · shadcn/ui · PostHog
> **Audience:** AI agents and engineers implementing discrete frontend slices.
> **Status:** Design-complete, pre-implementation.
> **Last updated:** 2026-05-16

---

## 1. Project Structure

```
src/
├── components/
│   ├── map/
│   │   ├── MapCanvas.tsx          # react-map-gl wrapper; owns the Mapbox instance
│   │   ├── MapPinLayer.tsx        # GeoJSON source + symbol layer for place pins
│   │   └── SearchBar.tsx          # Place search input; replaces Panel with results
│   ├── panel/
│   │   ├── Panel.tsx              # Scrollable sidebar container; filter pills
│   │   ├── PanelCard.tsx          # Dispatcher: routes card.type → sub-component
│   │   ├── NotificationCard.tsx   # Renders notification type cards
│   │   ├── PlanCard.tsx           # Renders plan cards (branched by role)
│   │   └── PlaceCard.tsx          # Renders place cards (own / friend / contextual)
│   ├── plans/
│   │   ├── CreatePlanFlow.tsx     # Multi-step modal: date picker → time picker → confirm
│   │   ├── DatePillSelector.tsx   # Today / Tomorrow / This weekend / Select date pills
│   │   ├── TimePicker.tsx         # 30-min block scroller; Skip for now option
│   │   └── PlanDetailView.tsx     # Full plan page: place, time, attendee list, actions
│   ├── places/
│   │   ├── PlaceDetailView.tsx    # Place info sheet: address, photo, save, create plan
│   │   └── SavePlaceModal.tsx     # Note input triggered from bookmark tap
│   ├── profile/
│   │   ├── UserProfile.tsx        # Tiered profile page (own / mutual / follower / none)
│   │   ├── ProfileHeader.tsx      # Avatar, handle, bio, social links, follow button
│   │   ├── PlaceList.tsx          # Reusable saved-places / curated-places list
│   │   └── PlanList.tsx           # Upcoming plans list on mutual-friend profile
│   ├── invite/
│   │   ├── InviteLinkCard.tsx     # Share panel: link display, copy button
│   │   └── InviteLandingView.tsx  # Public page shown when following an invite link
│   └── ui/                        # shadcn/ui re-exports + project-level primitives
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Sheet.tsx              # Bottom / side sheet primitive
│       ├── Toast.tsx
│       └── Avatar.tsx
├── pages/
│   ├── LandingPage.tsx            # Unauthenticated hero; Google sign-in CTA
│   ├── AuthCallbackPage.tsx       # Supabase OAuth return; redirects to onboard or map
│   ├── OnboardingPage.tsx         # Handle picker; required before accessing the app
│   ├── MapPage.tsx                # Main app view: MapCanvas + Panel side-by-side
│   ├── PlanDetailPage.tsx         # /plans/:planId — full plan detail
│   ├── UserProfilePage.tsx        # /u/:handle — tiered profile
│   ├── InvitePage.tsx             # /invite/:token — invite preview + sign-up CTA
│   └── SettingsPage.tsx           # /settings — sign out, profile edit
├── hooks/
│   ├── useAuth.ts                 # Reads auth context; exposes session + user
│   ├── usePanel.ts                # Fetches and invalidates panel cards
│   ├── useMapPlaces.ts            # Fetches place pins within current viewport bounds
│   ├── usePlaceDetail.ts          # Fetches a single place (search or pin click)
│   ├── usePlaceSearch.ts          # Debounced search query hook
│   ├── usePlans.ts                # Plan CRUD mutations
│   ├── useUserProfile.ts          # Fetches tiered user profile by handle
│   ├── useFollow.ts               # Follow / unfollow mutations
│   └── useRealtime.ts             # Supabase Realtime subscriptions; invalidates queries
├── lib/
│   ├── supabase.ts                # Supabase JS client (anon key, public URL)
│   ├── api.ts                     # Axios instance: base URL, JWT interceptors
│   ├── queryKeys.ts               # Centralized React Query key factory
│   └── posthog.ts                 # PostHog init + typed track helper
├── store/
│   ├── mapStore.ts                # Zustand: viewport center/zoom/bounds, selected place ID
│   ├── panelStore.ts              # Zustand: panel open, active filter pill
│   └── authStore.ts              # Zustand: session + user (hydrated from Supabase onAuthStateChange)
├── types/
│   ├── api.ts                     # API response shapes (PanelCard, PlanCard, PlaceCard, etc.)
│   └── map.ts                     # BBox, Viewport, MapPin types
├── App.tsx                        # Router setup, AuthProvider, QueryClientProvider
└── main.tsx                       # Vite entry: PostHog init, Supabase client, React mount
```

---

## 2. Routing

All routing is handled by React Router v6 with `createBrowserRouter`. No hash routing — history API.

```
/                         LandingPage         Public
/auth/callback            AuthCallbackPage    Public (receives Supabase redirect)
/onboarding               OnboardingPage      Auth-required, handle-not-set guard
/map                      MapPage             Auth-required, handle-required guard
/plans/:planId            PlanDetailPage      Auth-required, handle-required guard
/u/:handle                UserProfilePage     Public (response varies by relationship tier)
/invite/:token            InvitePage          Public
/settings                 SettingsPage        Auth-required, handle-required guard
```

### Route guards

Three guard levels implemented as wrapper components:

**`<RequireAuth>`** — redirects to `/` if no Supabase session. Wraps all non-public routes.

**`<RequireHandle>`** — after RequireAuth, redirects to `/onboarding` if `user.handle` is null. Wraps `/map`, `/plans/*`, `/settings`.

**`<RedirectIfAuthed>`** — on `/` and `/auth/callback`, if the user is already authenticated with a handle, redirect to `/map`.

```tsx
// App.tsx router config (simplified)
createBrowserRouter([
  { path: '/', element: <RedirectIfAuthed><LandingPage /></RedirectIfAuthed> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/onboarding', element: <RequireAuth><OnboardingPage /></RequireAuth> },
  {
    element: <RequireAuth><RequireHandle /></RequireAuth>,
    children: [
      { path: '/map', element: <MapPage /> },
      { path: '/plans/:planId', element: <PlanDetailPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '/u/:handle', element: <UserProfilePage /> },
  { path: '/invite/:token', element: <InvitePage /> },
])
```

---

## 3. State Management

State is divided into three tiers based on origin and lifetime.

### Server state — React Query

React Query owns all data fetched from the Flask API. It handles caching, background refetching, and optimistic updates.

| Query key (from `queryKeys.ts`) | Endpoint | Notes |
|---|---|---|
| `['user', 'me']` | `GET /users/me` | Loaded on app boot after auth |
| `['panel', lat, lng, filter]` | `GET /panel` | Primary feed; lat/lng from Zustand mapStore; re-fetched on viewport change |
| `['map', 'places', bounds]` | `GET /users/me/friends/places` | Fetched when viewport bounds change; debounced 300ms |
| `['place', placeId]` | `GET /places/:place_id` | Fetched on pin click or card tap |
| `['places', 'search', q, lat, lng]` | `GET /places/search` | Debounced 400ms; enabled only when `q.length >= 2` |
| `['places', 'contextual', lat, lng]` | `GET /places/contextual` | Fetched once on map load with user coordinates |
| `['plan', planId]` | `GET /plans/:plan_id` | Fetched on PlanDetailPage mount |
| `['plan', planId, 'joins']` | `GET /plans/:plan_id/joins` | Fetched on PlanDetailPage; invalidated by Realtime |
| `['plan', planId, 'interests']` | `GET /plans/:plan_id/interests` | Organizer only; invalidated by Realtime |
| `['user', handle]` | `GET /users/:handle` | Fetched on UserProfilePage mount |
| `['user', 'me', 'friends']` | `GET /users/me/friends` | Loaded after auth; used for follow list |
| `['invite', token]` | `GET /invite-links/:token` | Fetched on InvitePage mount |

**Mutation patterns:**

Mutations call the Flask API, then invalidate the relevant queries on success.

```ts
// Example: save place
const savePlaceMutation = useMutation({
  mutationFn: (vars) => api.post('/user-places', vars),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
    queryClient.invalidateQueries({ queryKey: queryKeys.place(vars.placeId) });
  },
});
```

Optimistic updates are used for Interested and Join button taps (immediate count increment, rollback on error).

### Client state — Zustand

Zustand stores hold UI state that is not persisted to the server and is not server-derived.

**`mapStore`** (`src/store/mapStore.ts`):
```ts
interface MapStore {
  center: [number, number];       // [lng, lat]
  zoom: number;
  bounds: BBox | null;            // current viewport bounds; triggers map places re-fetch
  selectedPlaceId: string | null; // which pin is currently active
  setViewport: (vp: Partial<MapStore>) => void;
  setSelectedPlace: (id: string | null) => void;
}
```

**`panelStore`** (`src/store/panelStore.ts`):
```ts
interface PanelStore {
  isOpen: boolean;
  activeFilter: 'all' | 'plans' | 'places' | 'hide_notifications';
  setIsOpen: (open: boolean) => void;
  setFilter: (f: PanelStore['activeFilter']) => void;
}
```

**`authStore`** (`src/store/authStore.ts`):
```ts
interface AuthStore {
  session: Session | null;
  user: User | null;             // public.users row (handle, display_name, etc.)
  setSession: (s: Session | null) => void;
  setUser: (u: User | null) => void;
}
```

The authStore is hydrated once at app boot by listening to `supabase.auth.onAuthStateChange`.

### Component state

Local `useState` is used for:
- Form inputs (handle input, note textarea, display name)
- Modal and sheet open/closed (CreatePlanFlow, SavePlaceModal)
- Time picker selected block index
- Date pill selected value
- Copy-to-clipboard confirmation flash

---

## 4. Auth Flow

```
1. User lands on /  (LandingPage)
   └─ Clicks "Sign in with Google"
       └─ supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })
           └─ Browser → Google OAuth consent → Supabase OAuth endpoint

2. Supabase Auth callback
   └─ Exchanges code for tokens
   └─ Redirects browser to /auth/callback#access_token=...&refresh_token=...

3. AuthCallbackPage mounts
   └─ supabase.auth.onAuthStateChange fires with SIGNED_IN event
   └─ Supabase JS client parses hash fragment; stores:
       - access_token  → in memory (short-lived, 1hr)
       - refresh_token → in localStorage (long-lived)
   └─ authStore.setSession(session) called

4. AuthCallbackPage calls GET /auth/session (via api.ts)
   └─ api.ts interceptor attaches: Authorization: Bearer <access_token>
   └─ Flask verifies JWT → returns { user, needs_onboarding }

5. Routing decision:
   └─ needs_onboarding: true  → navigate('/onboarding')
   └─ needs_onboarding: false → navigate('/map')

6. On /onboarding
   └─ User submits handle
   └─ POST /auth/onboard { handle, display_name }
   └─ authStore.setUser(updatedUser)
   └─ navigate('/map')

7. Session refresh (automatic)
   └─ Supabase JS client detects access_token expiry
   └─ Calls Supabase Auth refresh endpoint with refresh_token
   └─ Updates in-memory access_token
   └─ api.ts interceptor always reads current token from supabase.auth.getSession()
```

The Supabase JWT is never stored in a variable — every request reads `(await supabase.auth.getSession()).data.session?.access_token` at call time so refresh is transparent.

---

## 5. API Client

**File:** `src/lib/api.ts`

```ts
import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,  // e.g. https://api.hyperlocal.app/v1
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// On 401: attempt one token refresh, then retry
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const { data: { session } } = await supabase.auth.refreshSession();
      if (session) {
        error.config.headers.Authorization = `Bearer ${session.access_token}`;
        return api(error.config);
      }
      // Refresh failed — clear session and redirect to landing
      await supabase.auth.signOut();
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
```

**Environment variables (Vite):**

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://api.hyperlocal.app/v1` (prod) / `http://localhost:8000/v1` (dev) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key |
| `VITE_MAPBOX_TOKEN` | Scope-restricted Mapbox public token |
| `VITE_POSTHOG_KEY` | PostHog public `phc_...` key |

---

## 6. Mapbox Integration

**Library:** `react-map-gl` v7 (wraps Mapbox GL JS v3). Mapbox GL JS renders to a WebGL canvas; React manages the lifecycle.

### Map component structure

```
MapPage
└── MapCanvas               ← react-map-gl <Map> wrapper; owns viewport state sync
    ├── MapPinLayer         ← GeoJSON source + Mapbox symbol layer for all place pins
    │   ├── OwnPlaceLayer   ← own saved places (solid color marker)
    │   └── FriendPlaceLayer ← mutual friends' saved places (avatar marker)
    └── [Mapbox default controls: NavigationControl, GeolocateControl]
```

### Why Mapbox layers, not React components

Place pins are rendered as Mapbox GL JS **GeoJSON layers** (not as React components rendered into the DOM). This is the correct approach for map performance: React components for 200+ pins would cause scroll jitter and re-render storms. Mapbox draws all pins in a single WebGL draw call.

The GeoJSON feature collection is derived from the React Query result and passed to the `<Source>` component:

```tsx
const { data: mapPlaces } = useMapPlaces(bounds);

// Convert API response → GeoJSON FeatureCollection
const ownGeoJSON = toGeoJSON(mapPlaces?.filter(p => p.savedBy === 'me'));
const friendGeoJSON = toGeoJSON(mapPlaces?.filter(p => p.savedBy !== 'me'));

<Map onMoveEnd={onMoveEnd} onClick={onMapClick} ...>
  <Source id="own-places" type="geojson" data={ownGeoJSON}>
    <Layer id="own-pins" type="symbol" layout={{ 'icon-image': 'pin-own' }} />
  </Source>
  <Source id="friend-places" type="geojson" data={friendGeoJSON}>
    <Layer id="friend-pins" type="symbol" layout={{ 'icon-image': 'pin-friend' }} />
  </Source>
</Map>
```

Clicking a pin calls `onMapClick(e)` which reads `map.queryRenderedFeatures(e.point)` to get the clicked feature's `place_id`, then calls `mapStore.setSelectedPlace(placeId)`.

### Viewport sync

`onMoveEnd` callback in `MapCanvas`:
```ts
const onMoveEnd = useCallback((evt) => {
  const map = evt.target;
  const bounds = map.getBounds();
  mapStore.setViewport({
    center: [map.getCenter().lng, map.getCenter().lat],
    zoom: map.getZoom(),
    bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
  });
}, []);
```

React Query's `useMapPlaces(bounds)` hook is keyed on `bounds`, so the query re-fires automatically when the user pans or zooms. Debounced 300ms to avoid hammering the API mid-pan.

### Place search wiring

`SearchBar` is rendered over the map (absolute positioned, top of screen). It does not use Mapbox's geocoding API directly — it calls `GET /places/search` via Flask (which proxies to Mapbox with the secret token).

When the user types:
1. `usePlaceSearch(q, lat, lng)` fires after 400ms debounce.
2. Results replace the Panel (`panelStore.setIsOpen(false)`; a search results sheet slides up).
3. Matching place pins are highlighted on the map via a `selectedPlaceIds` set passed to `MapPinLayer`.
4. Selecting a result calls `mapStore.setSelectedPlace(placeId)` and opens `PlaceDetailView`.
5. Clearing search restores the Panel.

---

## 7. Data Fetching Patterns

**File:** `src/lib/queryKeys.ts`

```ts
export const queryKeys = {
  me: () => ['user', 'me'] as const,
  friends: () => ['user', 'me', 'friends'] as const,
  userProfile: (handle: string) => ['user', handle] as const,
  userFollowers: (handle: string) => ['user', handle, 'followers'] as const,
  userFollowing: (handle: string) => ['user', handle, 'following'] as const,
  panel: (lat?: number, lng?: number, filter?: string) =>
    ['panel', lat ?? null, lng ?? null, filter ?? 'all'] as const,
  mapPlaces: (bounds: [number, number, number, number]) =>
    ['map', 'places', ...bounds] as const,
  placeDetail: (placeId: string) => ['place', placeId] as const,
  placeSearch: (q: string, lat: number, lng: number) =>
    ['places', 'search', q, lat, lng] as const,
  contextualPlaces: (lat: number, lng: number) =>
    ['places', 'contextual', lat, lng] as const,
  planDetail: (planId: string) => ['plan', planId] as const,
  planJoins: (planId: string) => ['plan', planId, 'joins'] as const,
  planInterests: (planId: string) => ['plan', planId, 'interests'] as const,
  inviteLink: (token: string) => ['invite', token] as const,
};
```

**Stale times:**

| Query | `staleTime` | Notes |
|---|---|---|
| `panel` | 30s | Realtime keeps it fresh; REST is fallback |
| `mapPlaces` | 60s | Viewport panning re-keys the query anyway |
| `placeDetail` | 5min | Place data changes rarely |
| `planDetail` | 30s | Realtime updates interest/join counts |
| `me` | 10min | Only changes on profile edit |
| `userProfile` | 2min | — |

**Query function pattern (panel example):**

```ts
export function usePanel() {
  const { center } = useMapStore();
  const { activeFilter } = usePanelStore();
  const [lat, lng] = center ?? [undefined, undefined];

  return useQuery({
    queryKey: queryKeys.panel(lat, lng, activeFilter),
    queryFn: () =>
      api.get('/panel', { params: { lat, lng, filter: activeFilter } })
         .then(r => r.data.cards),
    staleTime: 30_000,
    enabled: !!lat,
  });
}
```

---

## 8. Realtime Integration

**File:** `src/hooks/useRealtime.ts`

Subscriptions are established once after the user is authenticated and torn down on sign-out.

```ts
export function useRealtime() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    // Channel 1: new notifications for this user → refresh panel
    const notifChannel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
      })
      .subscribe();

    // Channel 2: plan changes from anyone the user follows → refresh panel
    const plansChannel = supabase
      .channel('plans:friends')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'plans',
      }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(plansChannel);
    };
  }, [session?.user.id]);
}
```

**Plan detail page** additionally subscribes to `plan_interests:{planId}` and `plan_joins:{planId}` while the plan detail view is mounted, using a `usePlanDetailRealtime(planId)` hook that invalidates `queryKeys.planDetail(planId)`.

**Reconnect fallback:** Supabase JS client fires `onSubscribe` with status `CHANNEL_ERROR` on disconnect. The `useRealtime` hook listens for this event and calls `queryClient.invalidateQueries()` (all queries) to catch any missed events via a REST refetch.

---

## 9. PostHog

**File:** `src/lib/posthog.ts`

```ts
import posthog from 'posthog-js';

export function initPosthog() {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',
    capture_pageview: true,
    autocapture: false,   // we fire all events manually for precision
  });
}

export function identifyUser(userId: string, props: { handle: string; display_name: string }) {
  posthog.identify(userId, props);
}

export function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  posthog.capture(event, props);
}

// Typed event names matching MVP-1 telemetry requirements
type AnalyticsEvent =
  | 'invite_link_shared'
  | 'invite_link_converted'
  | 'plan_created'
  | 'place_saved'
  | 'plan_interested'
  | 'plan_joined'
  | 'place_detail_viewed'
  | 'map_search_performed'
  | 'user_followed'
  | 'plan_cancelled';
```

**Call sites:**

| Event | Where fired | Notes |
|---|---|---|
| `identifyUser` | `AuthCallbackPage`, after `GET /auth/session` returns | Also re-called when authStore hydrates |
| `place_detail_viewed` | `PlaceDetailView` mount | Client-only; no server duplicate |
| `map_search_performed` | `SearchBar`, on query submit | Client-only |
| `place_saved` | `savePlaceMutation.onSuccess` | Server also fires; client fires for immediate UI analytics |
| `plan_created` | `createPlanMutation.onSuccess` | Server also fires |
| `plan_interested` | `interestedMutation.onSuccess` | Server also fires |
| `plan_joined` | `joinMutation.onSuccess` | Server also fires |
| `user_followed` | `followMutation.onSuccess` | Client-only |
| `invite_link_shared` | `InviteLinkCard` copy button | Server also fires via `POST /invite-links` |

Server-side Flask fires the canonical versions of the 9 MVP-1 metric events. Client-side PostHog calls are additive and used for funnel analysis (e.g., "how many users viewed place detail but did not save").

---

## 10. Component Patterns

### Panel card polymorphism

The `/panel` API returns a flat, ordered array of `cards`, each with a `type` discriminant. `Panel.tsx` maps this array to `PanelCard` components. `PanelCard` dispatches to the correct sub-component:

```tsx
// types/api.ts
type PanelCardType = 'notification' | 'plan' | 'place';

interface NotificationCardData { type: 'notification'; id: string; event_type: string; payload: NotificationPayload; created_at: string; }
interface PlanCardData { type: 'plan'; plan_id: string; role: 'organizer' | 'joiner' | 'friend'; place_name: string; planned_at: string | null; is_cancelled: boolean; interest_count: number; join_count: number; requester_has_joined: boolean; requester_is_interested: boolean; organizer_handle: string; organizer_avatar_url: string | null; }
interface PlaceCardData { type: 'place'; place_id: string; name: string; source: 'own' | 'friend' | 'contextual'; saved_by_handle: string | null; distance_meters: number | null; note: string | null; }

type PanelCard = NotificationCardData | PlanCardData | PlaceCardData;

// components/panel/PanelCard.tsx
function PanelCard({ card }: { card: PanelCard }) {
  switch (card.type) {
    case 'notification': return <NotificationCard card={card} />;
    case 'plan':         return <PlanCard card={card} />;
    case 'place':        return <PlaceCard card={card} />;
  }
}
```

**PlanCard role branching:**

`PlanCard` receives a `role: 'organizer' | 'joiner' | 'friend'` prop. It renders a shared layout (place name, date/time chip, avatar) but conditionally shows different action buttons:

| role | Actions shown |
|---|---|
| `organizer` | "Add time" (if timeless) · "Cancel plan" · interest count · join count |
| `joiner` | "Leave plan" · cancelled badge if `is_cancelled` |
| `friend` | "Interested" toggle · "Join" button |

The `Interested` button is optimistic: `requester_is_interested` from the API initializes local state, and the mutation updates it immediately before the server responds.

**Filter pills:**

`Panel.tsx` reads `panelStore.activeFilter` and passes it to the `GET /panel` query as a param. The panel re-fetches with the new filter when the pill changes. There is no client-side filtering of already-fetched cards — the server applies all filtering.

### Empty and loading states

Every card list renders a skeleton loader (3 `<CardSkeleton />` placeholders) while `isLoading` is true. Empty states are:

- Panel (all filter): "Nothing yet — try saving a place or following a friend."
- Panel (plans filter): "No upcoming plans. Create one from any place."
- Panel (places filter): "No saved places nearby. Search to find somewhere."
- Map: no empty state (map always renders; pins appear as data loads).
- User profile (places): "No saved places yet."
- Search results: "No places found for '{q}'."
