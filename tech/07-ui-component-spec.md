# UI Component Spec — Hyperlocal MVP-1

> **Purpose:** Bridge between product spec and design generation. Every screen and component is described with enough detail to generate it with V0 or Claude.
> **Stack:** React + Tailwind CSS + shadcn/ui. Mapbox GL JS where noted.
> **V0 prompt format:** Ready-to-paste. Props are inlined so V0 generates type-safe components.
> **Last updated:** 2026-05-16

---

## How to use this document

Each entry follows this structure:

```
### ComponentName
Screen · Purpose · Props interface · Data source · Key interactions · Visual notes · V0 prompt
```

The V0 prompt is self-contained — it repeats necessary context so you can paste it directly without reading the rest of the entry.

---

## 1. LandingPage

### LandingPage

**Screen:** `/` (unauthenticated root)

**Purpose:** Introduce the product to a new visitor and drive Google sign-in.

**Props interface:**
```ts
interface LandingPageProps {
  onSignIn: () => void; // calls supabase.auth.signInWithOAuth
}
```

**Data source:** None (static content). Sign-in button fires Supabase OAuth.

**Key interactions:**
- "Sign in with Google" button → starts OAuth flow.
- Scrolling reveals value-prop sections (no routing, single long-scroll page).
- Any CTA below the fold (e.g., "Get started") calls the same `onSignIn`.

**Visual notes:**
- Mobile-first, full-bleed layout.
- Hero: full-viewport-height section, dark/evening map screenshot as background image (blurred), centered white text.
- Tagline: "Create community anywhere, anytime." in large serif or display font.
- Sub-tagline (smaller): "Save the places you love. See what your friends are planning. Show up."
- Google sign-in button: standard Google OAuth button styling (white, Google logo, "Sign in with Google").
- Below hero: 3 feature callout cards in a horizontal row (on desktop) or stacked (mobile):
  1. "Save places" — bookmark icon, one sentence.
  2. "Create plans" — calendar icon, one sentence.
  3. "Join friends" — people icon, one sentence.
- Footer: minimal — product name + "© 2026".
- Color: dark neutral background (#0f0f0f or deep slate), white text, accent color for the sign-in button.

**V0 prompt:**
```
Build a mobile-first React + Tailwind + shadcn/ui landing page for a social planning app called Hyperlocal. No props needed — this is a static marketing page.

Layout:
- Hero section: full viewport height, dark background (#0f0f0f), centered content. Large display text: "Create community anywhere, anytime." Sub-text below: "Save the places you love. See what your friends are planning. Show up." Below that: a white Google OAuth button with the Google "G" logo and text "Sign in with Google". Clicking it calls onSignIn().
- Feature section below hero: 3 cards side-by-side on desktop, stacked on mobile. Cards have an icon, a short title, and one sentence. Card 1: Bookmark icon, "Save places", "Bookmark spots you want to visit — coffee shops, museums, parks, anything." Card 2: Calendar icon, "Create plans", "Set a date, or don't. Plans live on the map until you're ready." Card 3: Users icon, "Join friends", "See what mutual friends are planning and opt in — no pressure."
- Footer: "Hyperlocal © 2026", centered, small text.
- Typography: large sans-serif hero heading, normal weight subtext.
- Color palette: dark (#0f0f0f background), white text, zinc-800 cards with zinc-700 borders.
- The Google sign-in button should look authentic: white background, border, Google "G" colored SVG logo on left, "Sign in with Google" text, rounded corners.
- Export: export default function LandingPage({ onSignIn }: { onSignIn: () => void })
```

---

## 2. OnboardingPage

### OnboardingPage

**Screen:** `/onboarding`

**Purpose:** Collect the user's handle after their first Google sign-in. Required before accessing the app.

**Props interface:**
```ts
interface OnboardingPageProps {
  displayName: string;      // from Google OAuth (pre-filled display name)
  avatarUrl: string | null;
  onComplete: (handle: string) => void; // calls POST /auth/onboard
}
```

**Data source:**
- `GET /auth/session` → `display_name`, `avatar_url` (from Google).
- `GET /users/handle-check?handle=...` → availability check (debounced).
- `POST /auth/onboard` on submit.

**Key interactions:**
- Handle input: lowercase-only enforcement (client-side auto-lowercase as user types), alphanumeric + underscore only.
- Debounced availability check at 500ms → inline feedback: "✓ @luna_goes is available" or "✗ @luna_goes is taken".
- Submit button disabled until handle is valid and available.
- On success → navigate to `/map`.

**Visual notes:**
- Centered card layout, max-width 400px, vertically centered on screen.
- Top: user's Google avatar (circular, 64px) and "Welcome, [displayName]!" heading.
- Below: explanatory text: "Choose a handle. This is how friends will find you."
- Handle input: `@` prefix attached to the left of the input field (not inside it — use a left adornment).
- Availability indicator: small text below input, green for available, red for taken, gray for "checking…".
- "Continue" button: full width, primary, disabled state when invalid.
- Background: light (white/zinc-50) to contrast with the dark landing page.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui onboarding page for a social app. This is the handle-picker screen shown after Google sign-in.

Props:
interface OnboardingPageProps {
  displayName: string;
  avatarUrl: string | null;
  onComplete: (handle: string) => void;
}

Layout: centered card, max-w-sm, mx-auto, mt-24. White card with rounded-xl, shadow-md, p-8.

Contents (top to bottom):
1. User avatar: 64px circle using avatarUrl (fallback: initials from displayName in a gray circle).
2. Heading: "Welcome, {displayName}!" — text-2xl font-semibold.
3. Sub-text: "Pick a handle. This is how friends will find you on Hyperlocal." — text-sm text-muted-foreground.
4. Handle input: a shadcn Input with a "@" prefix adornment on the left (gray text inside a bordered left section, like an input group). Input auto-lowercases typed text.
5. Below input: availability status line — text-sm. Three states: gray "Checking…", green "✓ @{handle} is available", red "✗ @{handle} is taken".
6. "Continue" Button: full width, primary variant, disabled when handle is empty, too short, or taken.

Behavior (wire up with useState; don't call real APIs — just show the UI states):
- As user types, show "Checking…" after 300ms, then toggle to available/taken based on a mock.
- Submit calls onComplete(handle).

Export: export default function OnboardingPage(props: OnboardingPageProps)
```

---

## 3. MapPage (Main App View)

### MapPage

**Screen:** `/map`

**Purpose:** Primary app surface — interactive map with place pins, a search bar, and the Panel sidebar.

**Props interface:**
```ts
// No props — MapPage is a route-level component that reads from Zustand stores and React Query.
```

**Data source:**
- `mapStore`: center, zoom, bounds, selectedPlaceId.
- `panelStore`: isOpen, activeFilter.
- `useMapPlaces(bounds)` → place pins.
- `usePlaceDetail(selectedPlaceId)` → place detail sheet.

**Key interactions:**
- Map panning/zooming updates `mapStore.bounds` → triggers map places re-fetch.
- Clicking a pin → `mapStore.setSelectedPlace(placeId)` → `PlaceDetailView` slides up as a bottom sheet.
- Tapping the search bar → `SearchBar` expands; Panel hides temporarily.
- Panel toggle button (mobile) → `panelStore.setIsOpen(!isOpen)`.
- Tapping outside an open place detail → clears `selectedPlaceId`.

**Visual notes:**
- Full-bleed layout: map occupies the entire viewport.
- **Desktop (≥768px):** Panel is a fixed sidebar on the right (320px wide), always visible. Map fills the remaining width.
- **Mobile (<768px):** Panel is a bottom sheet that can be dragged up to half-screen or full-screen. A floating toggle button (bottom-right, circular) shows/hides it.
- Search bar: fixed at the top of the map, centered, max-width 480px, slightly transparent background, search icon on left, "Search places…" placeholder.
- Place pins: two visual styles — solid primary-color pin for own saved places, lighter pin with friend avatar overlay for friend places. Selected pin is larger.
- When a place is selected: `PlaceDetailView` appears as a bottom sheet (mobile) or right-side panel replacing the Panel (desktop).

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui layout shell for a map-based social planning app. This is the main MapPage layout — do NOT implement the actual Mapbox map; render a placeholder div with class "bg-slate-200 flex-1" labeled "Map Canvas (Mapbox GL JS)".

Props: none (uses internal state)

Layout requirements:
- Full viewport, no scroll: h-screen w-screen overflow-hidden flex.
- Map area: fills remaining space after the panel.
- Desktop (md+): Panel is a fixed right sidebar, 320px wide, h-full, overflow-y-auto, bg-white border-l border-zinc-200.
- Mobile (<md): Panel is a bottom drawer (use a Sheet component, from bottom, 60vh max height, draggable handle at top).

Overlay elements (position: absolute over the map):
1. SearchBar: top-center, mt-4, mx-auto, max-w-md, w-full px-4. A rounded-full white input with a Search icon on the left and placeholder "Search places…". Slight shadow.
2. Panel toggle button (mobile only, hidden on md+): bottom-right, mb-6 mr-4, circular floating button (48px), bg-white shadow-lg, with a "List" or "Menu" icon.
3. User avatar button (top-right corner): small circular avatar button (40px) linking to profile/settings.

Panel contents (stub — just show the structure):
- Filter pills row at top: "All", "Plans", "Places", "Hide notifications" — horizontal scroll, pill buttons, one active at a time.
- Scrollable card list below pills.
- Show 3 skeleton loading cards (animate-pulse, rounded-xl, h-24 bg-zinc-100).

Export: export default function MapPage()
```

---

## 4. Panel

### Panel

**Screen:** `/map` (sidebar on desktop, bottom sheet on mobile)

**Purpose:** The unified scrollable feed of all actionable content — notifications, plans, and nearby places.

**Props interface:**
```ts
interface PanelProps {
  cards: PanelCard[];        // ordered array from GET /panel
  isLoading: boolean;
  activeFilter: 'all' | 'plans' | 'places' | 'hide_notifications';
  onFilterChange: (f: PanelFilter) => void;
}

type PanelCard = NotificationCardData | PlanCardData | PlaceCardData;
```

**Data source:** `GET /panel?lat&lng&filter` via `usePanel()` hook.

**Key interactions:**
- Tapping a filter pill → `onFilterChange` → query re-fetches with new filter.
- Scrolling the card list → no pagination in MVP-1; all cards loaded at once.
- Tapping any card → opens the relevant detail view.

**Visual notes:**
- Filter pills: horizontally scrollable row (no wrapping), sticky at top of panel. Pills: rounded-full, inactive = zinc-100 text-zinc-600, active = zinc-900 text/bg.
- Card list: `space-y-3 px-3 pb-6`.
- Empty state: centered illustration or icon + short message.
- Loading: 3 skeleton cards (`animate-pulse rounded-xl h-20 bg-zinc-100`).
- Notification cards appear first (most recent top), then Plan cards (soonest first), then Place cards (nearest first).

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui Panel component for a social planning app. This is the main list sidebar/bottom-sheet feed.

Props:
interface PanelProps {
  cards: Array<{ type: 'notification' | 'plan' | 'place'; [key: string]: unknown }>;
  isLoading: boolean;
  activeFilter: 'all' | 'plans' | 'places' | 'hide_notifications';
  onFilterChange: (f: 'all' | 'plans' | 'places' | 'hide_notifications') => void;
}

Structure:
1. Filter pill row: sticky top-0 bg-white/95 backdrop-blur pt-3 pb-2 px-3 border-b border-zinc-100. Horizontal scroll, gap-2, flex-nowrap. Four pills: "All", "Plans", "Places", "Hide notifications". Pill style: text-sm rounded-full px-3 py-1. Active: bg-zinc-900 text-white. Inactive: bg-zinc-100 text-zinc-600.

2. Scrollable card list: overflow-y-auto flex-1 px-3 pt-3 pb-8 space-y-3.
   - If isLoading: render 3 skeleton cards (animate-pulse rounded-xl h-20 bg-zinc-100 w-full).
   - If cards is empty (and not loading): centered empty state — small icon (MapPin or Compass), text "Nothing here yet. Save a place or follow a friend to get started.", text-sm text-zinc-400.
   - Otherwise: map cards to their type. For now render a placeholder card per type showing just the type name in a rounded-xl border bg-white p-4.

Export: export default function Panel(props: PanelProps)
```

---

## 5. PlanCard (Friend's Plan)

### FriendPlanCard

**Screen:** Panel feed (type = `plan`, role = `friend`)

**Purpose:** Show a friend's upcoming plan; let the viewer express interest or join.

**Props interface:**
```ts
interface FriendPlanCardProps {
  planId: string;
  placeName: string;
  placeCategory: string;
  plannedAt: string | null;    // ISO8601; null = timeless plan
  organizerHandle: string;
  organizerAvatarUrl: string | null;
  interestCount: number;
  joinCount: number;
  isInterested: boolean;       // current user already tapped Interested
  hasJoined: boolean;          // current user already joined
  isCancelled: boolean;
  onInterested: () => void;
  onJoin: () => void;
  onCardTap: () => void;       // opens plan detail page
}
```

**Data source:** Panel feed card with `role: 'friend'`. Mutations: `POST /plans/:id/interests`, `POST /plans/:id/joins`.

**Key interactions:**
- Tapping the card body → `onCardTap` → navigates to `/plans/:planId`.
- "Interested" button: toggle. On tap → optimistic update → `POST /plans/:planId/interests`. Button label changes to "Interested ✓" when active; unfilled heart icon when inactive.
- "Join" button: primary action. On tap → `POST /plans/:planId/joins`. Disabled if `hasJoined` or `isCancelled`.
- Cancelled state: card has a muted badge "Organizer cancelled" but remains visible.

**Visual notes:**
- Card: `rounded-xl border border-zinc-200 bg-white p-4 shadow-sm`.
- Top row: organizer avatar (24px circle) + `@{organizerHandle}` in `text-xs text-zinc-500`. Category icon (small emoji or lucide icon) on the right.
- Place name: `text-base font-semibold text-zinc-900`, 1-2 lines max (truncate after 2).
- Date/time chip: `rounded-full bg-zinc-100 text-xs px-2 py-0.5 text-zinc-600`. If timeless: "No date yet" in zinc-400 italic.
- Bottom row: interest count ("3 interested") + join count ("2 joining") in `text-xs text-zinc-400`. Then action buttons right-aligned.
- "Interested" button: `variant="outline"` size-sm. Active state: filled background (zinc-100), checkmark prefix.
- "Join" button: `variant="default"` size-sm, primary color.
- Cancelled overlay: low-opacity card + red "Cancelled" badge top-right.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui card component for a social planning app. This card shows a friend's upcoming plan in a feed.

Props:
interface FriendPlanCardProps {
  planId: string;
  placeName: string;
  placeCategory: string;      // e.g. "restaurant", "park", "museum"
  plannedAt: string | null;   // ISO8601 datetime string, or null if no date set
  organizerHandle: string;
  organizerAvatarUrl: string | null;
  interestCount: number;
  joinCount: number;
  isInterested: boolean;
  hasJoined: boolean;
  isCancelled: boolean;
  onInterested: () => void;
  onJoin: () => void;
  onCardTap: () => void;
}

Design:
- Outer: rounded-xl border border-zinc-200 bg-white p-4 shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors. Clicking the card calls onCardTap().
- Top row (flex justify-between items-center mb-2):
  Left: small avatar (24px circle, fallback initials) + "@{organizerHandle}" text-xs text-zinc-500 ml-1.5.
  Right: category label text-xs text-zinc-400 (e.g. "Restaurant").
- Place name: text-base font-semibold text-zinc-900 leading-snug line-clamp-2 mb-2.
- Date chip: inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600.
  If plannedAt is null: show "No date yet" in text-xs text-zinc-400 italic instead.
  If plannedAt is set: format as "Sat Jun 1 · 7:00 PM".
- Stats row (mt-2 mb-3): "{interestCount} interested · {joinCount} joining" text-xs text-zinc-400.
- Action row (flex gap-2 justify-end):
  "Interested" button: outline variant, size sm. If isInterested: show "✓ Interested" with bg-zinc-100. If not: show "Interested".
  "Join" button: default variant (dark bg), size sm. If hasJoined: show "Joined ✓" disabled. If isCancelled: disabled.
- If isCancelled: add a red badge "Cancelled" absolute top-2 right-2, and reduce card opacity to 60%.

Stop all click propagation on action buttons so they don't trigger onCardTap.

Export: export default function FriendPlanCard(props: FriendPlanCardProps)
```

---

## 6. PlanCard (Own Plan)

### OwnPlanCard

**Screen:** Panel feed (type = `plan`, role = `organizer`)

**Purpose:** Show the user's own upcoming plan with management actions.

**Props interface:**
```ts
interface OwnPlanCardProps {
  planId: string;
  placeName: string;
  placeCategory: string;
  plannedAt: string | null;
  interestCount: number;
  joinCount: number;
  isCancelled: boolean;        // should not appear in feed if cancelled, but handle gracefully
  onAddTime: () => void;       // opens time picker (only if plannedAt is null)
  onCancel: () => void;        // shows confirmation dialog
  onShareLink: () => void;     // generates and copies invite link
  onCardTap: () => void;
}
```

**Data source:** Panel feed card with `role: 'organizer'`. Mutations: `POST /plans/:id/cancel`, `POST /invite-links`.

**Key interactions:**
- "Add time" prompt (visible when `plannedAt` is null) → `onAddTime` → opens `CreatePlanFlow` at the time-picker step.
- "Share" icon button → `onShareLink` → copies invite URL to clipboard with toast.
- "Cancel" → confirmation dialog → `POST /plans/:planId/cancel`.
- Card tap → `/plans/:planId`.

**Visual notes:**
- Same base card style as FriendPlanCard.
- Top-right: share icon button (link icon) + vertical ellipsis menu with "Cancel plan".
- Interest count prominently shown ("3 friends interested") as a positive signal.
- "Add time" prompt: a muted yellow/amber inline CTA when `plannedAt` is null — "Tap to add a time. Your friends are interested."
- No Interested/Join buttons (it's your own plan).

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui card component for a social planning app. This shows the current user's own plan in their feed.

Props:
interface OwnPlanCardProps {
  planId: string;
  placeName: string;
  placeCategory: string;
  plannedAt: string | null;
  interestCount: number;
  joinCount: number;
  onAddTime: () => void;
  onCancel: () => void;
  onShareLink: () => void;
  onCardTap: () => void;
}

Design:
- Outer: rounded-xl border border-zinc-200 bg-white p-4 shadow-sm cursor-pointer hover:bg-zinc-50. Click calls onCardTap.
- Top row (flex justify-between):
  Left: "Your plan" badge — text-xs font-medium text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5.
  Right: two icon buttons (stop propagation on click): Link icon (calls onShareLink), MoreVertical icon (opens a popover with "Cancel plan" in text-red-600).
- Place name: text-base font-semibold text-zinc-900 line-clamp-2 mt-2 mb-2.
- If plannedAt is null:
  Show amber add-time CTA: rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 cursor-pointer mb-2, text: "No time set yet — tap to add one". Clicking this calls onAddTime (stop propagation).
  Also show interestCount if > 0: "{interestCount} friend(s) interested" text-xs text-zinc-400.
- If plannedAt is set:
  Date chip: rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600. Format: "Sat Jun 1 · 7:00 PM".
  Stats: "{interestCount} interested · {joinCount} joining" text-xs text-zinc-400 mt-2.

Export: export default function OwnPlanCard(props: OwnPlanCardProps)
```

---

## 7. PlaceDetailView

### PlaceDetailView

**Screen:** Slides up over `/map` as a bottom sheet (mobile) or replaces Panel (desktop)

**Purpose:** Show full place metadata; primary entry point to save a place or create a plan.

**Props interface:**
```ts
interface PlaceDetailViewProps {
  placeId: string;
  name: string;
  address: string;             // clickable → Google Maps URL
  category: string;
  photoUrl: string | null;
  isSaved: boolean;
  userNote: string | null;
  googleMapsUrl: string;
  onSave: () => void;          // toggles save; opens note section
  onCreatePlan: () => void;    // opens CreatePlanFlow
  onClose: () => void;
}
```

**Data source:** `GET /places/:place_id` via `usePlaceDetail(placeId)`.

**Key interactions:**
- Bookmark icon: toggles save state. On tap if not saved → `POST /user-places` + opens note section. On tap if saved → shows unsave confirmation.
- Address: tappable → opens Google Maps in new tab.
- "Create plan" button → `onCreatePlan` → opens `CreatePlanFlow` pre-filled with this place.
- Note section: collapsed by default; expands with textarea. "Save note" button → `PATCH /user-places/:place_id`.
- Close button (X or swipe down) → `onClose` → clears `selectedPlaceId` in mapStore.

**Visual notes:**
- Bottom sheet on mobile: handle bar at top, slides from bottom, 70vh max.
- Header: full-width photo (200px tall, object-cover, placeholder gradient if no photo). Bookmark icon (top-right of photo area, circular white bg).
- Place name: `text-xl font-bold` below photo.
- Category pill: small rounded badge below name.
- Address: `text-sm text-zinc-500 underline` → external link icon.
- Divider line.
- Note section: collapsed toggle ("Add a personal note") → expands textarea. Already has a note: shows note text with edit pencil icon.
- CTA area at bottom: "Create plan" primary button (full width).

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui place detail component for a map-based planning app. This appears as a bottom sheet or side panel when a user taps a place pin.

Props:
interface PlaceDetailViewProps {
  placeId: string;
  name: string;
  address: string;
  category: string;
  photoUrl: string | null;
  isSaved: boolean;
  userNote: string | null;
  googleMapsUrl: string;
  onSave: () => void;
  onCreatePlan: () => void;
  onClose: () => void;
}

Structure (top to bottom):
1. Photo header: w-full h-48 object-cover rounded-t-2xl overflow-hidden. If photoUrl is null: gradient placeholder bg-gradient-to-br from-zinc-300 to-zinc-400. On top-right of photo: a circular white button (32px) with a Bookmark icon (filled if isSaved, outline if not). Clicking calls onSave. On top-left: a circular white button with an X icon, calling onClose.

2. Content section (px-4 pt-3 pb-6):
   - Place name: text-xl font-bold text-zinc-900.
   - Category: text-xs rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5 inline mt-1.
   - Address: mt-2, flex gap-1 items-center, ExternalLink icon (14px), text-sm text-zinc-500 underline cursor-pointer. Clicking opens googleMapsUrl in a new tab.
   - Divider: mt-3 border-t border-zinc-100.
   - Note section (mt-3):
     If userNote is null: a button "＋ Add a personal note" text-sm text-zinc-400. Clicking expands a textarea (resize-none, 3 rows, border, rounded-lg) with a "Save" button below.
     If userNote is not null: show the note text in text-sm text-zinc-600 italic, with a small pencil icon to edit.
   - CTA (mt-4 pt-3 border-t border-zinc-100): "Create a plan" Button full-width, default variant (dark), calling onCreatePlan.

Export: export default function PlaceDetailView(props: PlaceDetailViewProps)
```

---

## 8. SavePlaceModal

### SavePlaceModal

**Screen:** Appears over `PlaceDetailView` (within the detail sheet)

**Purpose:** Lightweight confirmation when a user saves a place; prompts for an optional personal note.

**Props interface:**
```ts
interface SavePlaceModalProps {
  placeName: string;
  initialNote: string;
  onSave: (note: string) => void;
  onSkip: () => void;           // save without note
}
```

**Data source:** Triggered by bookmark tap in PlaceDetailView. Calls `POST /user-places` with optional `note`.

**Key interactions:**
- Appears inline within the PlaceDetailView's note section (not a separate modal dialog).
- Textarea for note (max 500 chars, character counter shown at 400+).
- "Save note" → `onSave(note)`.
- "Skip" / "X" → `onSkip` (place is already saved at this point; this just dismisses the note prompt).

**Visual notes:**
- Rendered as an expandable section, not a modal overlay.
- Textarea: `min-h-[80px]`, `resize-none`, `rounded-lg border border-zinc-200 p-3 text-sm`.
- Below textarea: character counter (right-aligned, `text-xs text-zinc-400`) and two buttons ("Skip" ghost + "Save note" default).
- Animation: height transition from 0 to auto when expanded (use Tailwind's `transition-all`).

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui inline note-input section for a place-saving flow. This is NOT a modal dialog — it's an expandable section within a card.

Props:
interface SavePlaceModalProps {
  placeName: string;
  initialNote?: string;
  onSave: (note: string) => void;
  onSkip: () => void;
}

Design:
- Outer: rounded-lg bg-zinc-50 border border-zinc-200 p-4 mt-3 animate-in slide-in-from-top-2 duration-200.
- Heading: text-sm font-medium text-zinc-700 "Add a note about {placeName}" (truncate name at 30 chars).
- Sub-text: text-xs text-zinc-400 "Only you can see this."
- Textarea: mt-2, w-full, min-h-[80px], resize-none, rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 placeholder:text-zinc-400, placeholder "Why do you want to go here? What to order? Any tips…", maxLength 500.
- Character counter row: flex justify-between mt-1. Left: empty. Right: text-xs text-zinc-400 "{length}/500" — only show when length > 400.
- Button row: flex gap-2 justify-end mt-3. "Skip" ghost variant size sm (calls onSkip). "Save note" default variant size sm (calls onSave with current textarea value). "Save note" disabled when note is empty.

Export: export default function SavePlaceModal(props: SavePlaceModalProps)
```

---

## 9. CreatePlanFlow

### CreatePlanFlow

**Screen:** Modal/sheet that appears over `PlaceDetailView` or from a Plan card "Add time" prompt

**Purpose:** Multi-step flow to create a new plan (or add a time to an existing timeless plan).

**Props interface:**
```ts
interface CreatePlanFlowProps {
  placeName: string;
  placeId: string;
  mode: 'create' | 'add-time';  // add-time skips date picker if date is already known
  existingPlanDate?: string;    // pre-fill date for add-time mode
  openingHours?: OpeningHours;  // to restrict time picker to open hours
  onConfirm: (plannedAt: string | null) => void; // null = timeless/skip-for-now
  onClose: () => void;
}
```

**Data source:** Triggered from PlaceDetailView or OwnPlanCard. Calls `POST /plans` or `PATCH /plans/:id`.

**Key interactions:**

**Step 1 — Date selection:**
- Date pills: "Today", "Tomorrow", "This weekend" (or "Next weekend" if it's already the weekend), "Select date".
- "Select date" reveals a minimal calendar picker.
- "Today" skips to Step 2 (time is required today).
- Future dates: Step 2 shows "Skip for now" option.

**Step 2 — Time selection:**
- Scrollable list of 30-minute blocks (e.g., "6:00 PM", "6:30 PM", ...) within opening hours.
- "15-min" toggle switch to switch to 15-minute blocks for more precision.
- "Skip for now" button (disabled for Today plans) with info tooltip: "We'll remind you to add a time closer to the date."
- "Confirm" button creates the plan.

**Step 3 — Confirmation:**
- Brief toast: "Plan created for [Place Name]" with a link icon to copy the invite link.
- Closes the flow and returns to map.

**Visual notes:**
- Presented as a bottom sheet (mobile) or centered modal (desktop), max-width 480px.
- Step indicator: two dots at top (date = dot 1, time = dot 2). Active dot is filled.
- Date pills: flex-wrap row of pill buttons. Selected pill: dark filled.
- Time scroller: `overflow-y-auto max-h-64`, each block is a tappable row.
- Footer: "Back" ghost button + "Next" / "Confirm" primary button.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui multi-step plan creation flow for a social planning app. Implemented as a 2-step form.

Props:
interface CreatePlanFlowProps {
  placeName: string;
  placeId: string;
  mode: 'create' | 'add-time';
  onConfirm: (plannedAt: string | null) => void;
  onClose: () => void;
}

Container: rounded-t-2xl (mobile) or rounded-2xl (desktop) bg-white p-6 max-w-md w-full shadow-xl.

Header: flex justify-between items-center mb-4. Title: "Create a plan" (mode=create) or "Add a time" (mode=add-time). X button top-right (calls onClose).

Step indicator: flex gap-2 justify-center mb-6. Two circles 8px, rounded-full. Step 1: bg-zinc-900 (active) or bg-zinc-300 (inactive). Step 2: same.

STEP 1 — Date:
- Label: text-sm font-medium text-zinc-700 mb-3 "When are you going to {placeName}?"
- Date pills: flex flex-wrap gap-2. Pills: rounded-full border px-4 py-2 text-sm cursor-pointer. Selected: bg-zinc-900 text-white border-zinc-900. Unselected: bg-white text-zinc-700 border-zinc-300.
  Pills: "Today", "Tomorrow", "This weekend", "Select date".
- If "Select date" selected: show a simple date input (type="date") below the pills with min set to today.
- Footer: "Cancel" ghost button, "Next →" primary button (disabled until a date is selected).

STEP 2 — Time:
- Label: "What time?" + if it's a future date: small info text "You can skip this for now."
- Time slots: a scrollable list (max-h-56 overflow-y-auto) of time rows. Show 8 example slots: "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM", "9:00 PM", "9:30 PM". Each row: flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-zinc-50. Selected: bg-zinc-100 font-medium.
- "15-min intervals" toggle: small switch + label below the list.
- "Skip for now" link: text-sm text-zinc-400 underline cursor-pointer centered below list. Clicking calls onConfirm(null).
- Footer: "← Back" ghost button, "Confirm" primary button (calls onConfirm with selected datetime ISO string).

Export: export default function CreatePlanFlow(props: CreatePlanFlowProps)
```

---

## 10. UserProfilePage (Own)

### OwnProfilePage

**Screen:** `/u/:handle` when viewing your own profile (or via Settings → View profile)

**Purpose:** Your public profile as others would see it, plus edit access to your profile details and socials.

**Props interface:**
```ts
interface OwnProfilePageProps {
  user: {
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    instagramHandle: string | null;
    twitterHandle: string | null;
    facebookUrl: string | null;
    isPrivate: boolean;
    followerCount: number;
    followingCount: number;
  };
  savedPlaces: SavedPlace[];
  upcomingPlans: OwnPlan[];
  onEditProfile: () => void;
  onSignOut: () => void;
}
```

**Data source:** `GET /users/me` + `GET /users/me/places` + `GET /users/me/plans`.

**Key interactions:**
- "Edit profile" → opens inline form or navigates to `/settings`.
- Tapping a saved place → opens `PlaceDetailView`.
- Tapping a plan → navigates to `/plans/:planId`.
- Follower/following count → tappable to show list (modal).
- Privacy toggle visible in edit mode.

**Visual notes:**
- Top: full-width header with gradient or blurred map screenshot background.
- Avatar: 80px circle centered, slight border (ring-2 ring-white).
- Handle: `@handle` in `text-sm text-zinc-500`. Display name above in `text-lg font-bold`.
- Bio: `text-sm text-zinc-600 text-center mt-1 max-w-xs mx-auto`.
- Social icons row: small icons for Instagram, Twitter, Facebook — only shown if set.
- Stats row: "12 followers · 8 following" in `text-sm text-zinc-500`, tappable.
- "Edit profile" button: outline variant, full-width or width-fit.
- Tabs or sections: "Places" list + "Plans" list below.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui own-profile page for a social planning app.

Props:
interface OwnProfilePageProps {
  user: {
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    instagramHandle: string | null;
    twitterHandle: string | null;
    facebookUrl: string | null;
    isPrivate: boolean;
    followerCount: number;
    followingCount: number;
  };
  savedPlaces: Array<{ placeId: string; name: string; category: string; address: string }>;
  upcomingPlans: Array<{ planId: string; placeName: string; plannedAt: string | null; joinCount: number }>;
  onEditProfile: () => void;
  onSignOut: () => void;
}

Layout (mobile-first, max-w-lg mx-auto):

1. Profile header card (bg-white rounded-b-2xl shadow-sm pb-6):
   - Top banner: h-24 bg-gradient-to-r from-zinc-200 to-zinc-300 rounded-t-2xl (placeholder for cover photo).
   - Avatar: -mt-10 mx-auto w-20 h-20 rounded-full border-4 border-white object-cover (fallback: initials in bg-zinc-300).
   - Name: text-lg font-bold text-zinc-900 text-center mt-2.
   - Handle: text-sm text-zinc-500 text-center "@{handle}".
   - Bio: text-sm text-zinc-600 text-center mt-1 max-w-xs mx-auto (if not null).
   - Social icons row (mt-2 flex justify-center gap-3): show small icons (Instagram = camera, Twitter = bird, Facebook = f) only if handle/url is set. Each is a small icon link.
   - Stats row (mt-3 flex justify-center gap-6): "{followerCount} followers" and "{followingCount} following" — text-sm text-zinc-500, tappable (hover underline).
   - Action buttons (mt-4 flex gap-2 justify-center): "Edit profile" outline Button, "Sign out" ghost Button text-red-500.

2. Private account toggle notice (mt-4 mx-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800, only show if isPrivate): "Your profile is private. Only followers can see your places."

3. Upcoming plans section (mt-4 px-4):
   - Heading: text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2 "Upcoming Plans".
   - List of plan rows: each is a rounded-lg border bg-white p-3 flex justify-between items-center. Left: placeName text-sm font-medium. Right: plannedAt formatted date text-xs text-zinc-400, or "No date" in italic zinc-300.
   - If empty: text-sm text-zinc-400 "No upcoming plans."

4. Saved places section (mt-4 px-4 pb-8):
   - Heading: "Saved Places" same style.
   - Grid 2-col of place cards: each rounded-lg border bg-white p-3. Place name text-sm font-medium, category text-xs text-zinc-400.
   - If empty: text-sm text-zinc-400 "No saved places yet."

Export: export default function OwnProfilePage(props: OwnProfilePageProps)
```

---

## 11. UserProfilePage (Mutual Friend)

### FriendProfilePage

**Screen:** `/u/:handle` when relationship is `mutual`

**Purpose:** Full friend profile — see their saved places on your map and upcoming plans.

**Props interface:**
```ts
interface FriendProfilePageProps {
  user: {
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    followerCount: number;
    followingCount: number;
  };
  savedPlaces: SavedPlace[];
  upcomingPlans: FriendPlan[];
  onUnfollow: () => void;
  onJoinPlan: (planId: string) => void;
}
```

**Data source:** `GET /users/:handle` (tier = `mutual`) + `GET /users/:handle/places`.

**Key interactions:**
- "Unfollow" button → `DELETE /follows/:handle` → confirmation dialog first.
- Plan card tap → `/plans/:planId`.
- "Join" on plan → `POST /plans/:planId/joins`.
- Place tap → opens PlaceDetailView.

**Visual notes:**
- Same structure as OwnProfilePage but:
  - "Unfollow" button replaces "Edit profile".
  - No private account notice.
  - Plans show Interested/Join actions.
  - "Mutual friend" chip visible near handle.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui mutual-friend profile page for a social planning app. This is what you see when viewing a friend who follows you back.

Props:
interface FriendProfilePageProps {
  user: {
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    followerCount: number;
    followingCount: number;
  };
  savedPlaces: Array<{ placeId: string; name: string; category: string; address: string }>;
  upcomingPlans: Array<{ planId: string; placeName: string; plannedAt: string | null; interestCount: number; joinCount: number }>;
  onUnfollow: () => void;
  onJoinPlan: (planId: string) => void;
}

Use the same layout as OwnProfilePage (see above for structure). Differences:
- Below handle: add a "Mutual friend" badge — text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1 (check icon + "Mutual friend").
- Replace "Edit profile" + "Sign out" buttons with: "Unfollow" button (outline, text-red-500 border-red-200 hover:bg-red-50).
- Plans section shows full plan cards with Join button (matching FriendPlanCard style but simplified inline in the list row: place name left, "Join" button right, date below name).
- Saved places: show full list (not curated — mutual friends see everything).

Export: export default function FriendProfilePage(props: FriendProfilePageProps)
```

---

## 12. UserProfilePage (One-Way Follower)

### FollowingProfilePage

**Screen:** `/u/:handle` when the viewer follows the profile owner but they haven't followed back

**Purpose:** Curated taste profile — show Favorite Places and Want to Go without revealing personal activity.

**Props interface:**
```ts
interface FollowingProfilePageProps {
  user: {
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
  };
  favoritePlaces: CuratedPlace[];  // up to 5; from completed plans
  wantToGoPlaces: CuratedPlace[];  // timeless plans; place info only
  onFollowBack: () => void;        // not shown here (they don't follow viewer)
}

interface CuratedPlace {
  placeId: string;
  name: string;
  address: string;
  category: string;
}
```

**Data source:** `GET /users/:handle` with `relationship: 'following'` → `favorite_places` + `want_to_go`.

**Key interactions:**
- Place tap → opens PlaceDetailView (read-only; viewer can save it themselves).
- No follow/unfollow action shown (already following; unfollow accessible via Settings or ellipsis menu).

**Visual notes:**
- Same header as other profile pages.
- Two distinct sections with clear labels: "Favorite Places" (heart icon) and "Want to Go" (bookmark icon).
- Each section: horizontal scroll of small place chips or a list of cards.
- Below profile header: a small notice "You follow @{handle}. Follow back to see their plans." replaced with a "Following" status chip.
- No plans visible, no full place list — only the two curated lists.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui one-way-follower profile page for a social planning app. The viewer follows this user, but the user hasn't followed back — so only curated public taste data is shown.

Props:
interface FollowingProfilePageProps {
  user: { handle: string; displayName: string; bio: string | null; avatarUrl: string | null; };
  favoritePlaces: Array<{ placeId: string; name: string; address: string; category: string }>;
  wantToGoPlaces: Array<{ placeId: string; name: string; address: string; category: string }>;
}

Layout (mobile-first, max-w-lg mx-auto):

1. Profile header (same as before — banner, avatar, name, handle, bio).
   Below handle: "You're following @{handle}" badge — text-xs bg-zinc-100 text-zinc-500 rounded-full px-2 py-0.5.
   Below badge: small info note text-xs text-zinc-400 "Follow back to see their plans and full saved places."
   No action buttons (viewing only; they're already following).

2. "Favorite Places" section (mt-6 px-4):
   - Heading row: flex items-center gap-1.5 mb-3. Heart icon (16px, text-rose-500). "Favorite Places" text-sm font-semibold text-zinc-700. Badge showing count (up to 5): text-xs text-zinc-400.
   - Sub-text: text-xs text-zinc-400 mb-3 "Places @{handle} has actually been to."
   - List: space-y-2. Each place: rounded-lg border border-zinc-200 bg-white px-3 py-2.5 flex justify-between items-center. Left: place name text-sm font-medium + address text-xs text-zinc-400 below. Right: category badge text-xs bg-zinc-100 rounded-full px-2 py-0.5.
   - If empty: text-sm text-zinc-400 "No favorite places yet."

3. "Want to Go" section (mt-6 px-4 pb-8):
   - Heading: Bookmark icon (16px, text-indigo-500) + "Want to Go" text-sm font-semibold.
   - Sub-text: "Places @{handle} wants to visit someday."
   - Same list style as above.
   - If empty: text-sm text-zinc-400 "Nothing on the list yet."

Export: export default function FollowingProfilePage(props: FollowingProfilePageProps)
```

---

## 13. NotificationCard

### NotificationCard

**Screen:** Panel feed (type = `notification`)

**Purpose:** In-app alert for social and plan events; the primary way users discover activity.

**Props interface:**
```ts
interface NotificationCardProps {
  id: string;
  eventType:
    | 'new_follower'
    | 'follow_back_prompt'
    | 'plan_time_updated'
    | 'plan_reminder_day_before'
    | 'plan_reminder_morning'
    | 'friend_joined_plan'
    | 'plan_cancelled';
  payload: Record<string, string>; // varies by eventType; see API doc
  createdAt: string;
  onDismiss: () => void;
  onPrimaryAction: () => void;     // "Follow back", "View plan", etc.
}
```

**Data source:** Panel feed cards with `type: 'notification'`. Realtime pushes new ones via Supabase channel. Dismiss calls `POST /events/:id/dismiss`.

**Key interactions:**
- Tap card body → `onPrimaryAction` (navigates to profile or plan).
- "Follow back" button (on `new_follower` type) → `POST /follows` then dismiss.
- Dismiss button (X) → `POST /events/:id/dismiss` → removes card from Panel.

**Visual notes:**
- Card: same base as PlanCard but with a left-side colored accent border (3px) indicating type:
  - `new_follower` / `follow_back_prompt`: indigo accent.
  - `plan_time_updated` / `plan_reminder_*`: amber accent.
  - `friend_joined_plan`: green accent.
  - `plan_cancelled`: red accent.
- Left: small icon matching the event type.
- Content: bold first line (who/what), second line (place or action description).
- Right: X button to dismiss + relative timestamp ("2m ago").
- Action button (when applicable): small outline button inline at bottom.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui notification card component for a social planning app. Renders in a feed and handles 5 event types.

Props:
interface NotificationCardProps {
  id: string;
  eventType: 'new_follower' | 'follow_back_prompt' | 'plan_time_updated' | 'plan_reminder' | 'friend_joined_plan' | 'plan_cancelled';
  payload: Record<string, string>;
  createdAt: string;
  onDismiss: () => void;
  onPrimaryAction: () => void;
}

Design:
- Outer: relative rounded-xl border bg-white p-4 shadow-sm cursor-pointer hover:bg-zinc-50 flex gap-3.
- Left accent bar: absolute left-0 top-0 bottom-0 w-1 rounded-l-xl. Color by type:
  new_follower / follow_back_prompt → bg-indigo-500
  plan_time_updated / plan_reminder → bg-amber-400
  friend_joined_plan → bg-green-500
  plan_cancelled → bg-red-400

- Icon (left of content, 32px circle centered):
  new_follower: UserPlus icon, bg-indigo-50 text-indigo-600
  plan_time_updated: Clock icon, bg-amber-50 text-amber-600
  plan_reminder: Bell icon, bg-amber-50 text-amber-600
  friend_joined_plan: Users icon, bg-green-50 text-green-600
  plan_cancelled: XCircle icon, bg-red-50 text-red-600

- Content (flex-1):
  Title line: text-sm font-semibold text-zinc-900.
  Subtitle line: text-xs text-zinc-500.
  Render by type (use payload for values):
    new_follower: title "@{follower_handle} followed you", subtitle "Tap to view their profile."
    follow_back_prompt: title "@{follower_handle} followed you back!", subtitle "You're now mutual friends."
    plan_time_updated: title "@{organizer_handle} added a time", subtitle "{place_name} · {plan_date} {plan_time}."
    plan_reminder: title "Don't forget — {place_name}", subtitle "Your plan is coming up. Add a time?"
    friend_joined_plan: title "@{joiner_handle} is joining your plan", subtitle "{place_name}."
    plan_cancelled: title "@{organizer_handle} cancelled the plan", subtitle "{place_name} · The plan lives on for you."

- Action button (mt-2): if follow_back_prompt → "Follow back" outline Button size-sm.

- Top-right: flex gap-2 items-center absolute top-3 right-3.
  Timestamp: text-xs text-zinc-400 (e.g., "2m ago").
  X button: ghost size-icon, XIcon 14px, calls onDismiss (stops propagation).

Export: export default function NotificationCard(props: NotificationCardProps)
```

---

## 14. InviteLinkPage

### InviteLinkPage

**Screen:** `/invite/:token`

**Purpose:** Public landing page for a shared invite link. Shows plan preview; drives sign-up for unauthenticated users.

**Props interface:**
```ts
interface InviteLinkPageProps {
  token: string;
  creator: { handle: string; displayName: string; avatarUrl: string | null };
  plan: {
    planId: string;
    placeName: string;
    placeAddress: string;
    plannedAt: string | null;
    isCancelled: boolean;
  } | null;
  isExpired: boolean;
  isAuthenticated: boolean;
  onSignIn: () => void;          // Google OAuth for unauthenticated users
  onRedeem: () => void;          // authenticated: redeem token + follow creator
}
```

**Data source:** `GET /invite-links/:token` (public endpoint). Redeem calls `POST /invite-links/:token/redeem`.

**Key interactions:**
- Unauthenticated: shows preview + "Sign in to join" CTA → triggers Google OAuth.
- Authenticated: shows "Follow @{handle} and view this plan" CTA → `POST /invite-links/:token/redeem`.
- Expired link: shows error state.

**Visual notes:**
- Centered card (max-w-sm) on a light-gradient background.
- Creator avatar + name at top: "@{creatorHandle} invited you".
- Plan preview card (if plan is attached): place name, date/time or "No date set yet", cancelled badge if applicable.
- CTA: large primary button at bottom.
- If expired: gray-out with "This link has expired" message.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui invite link landing page for a social planning app. This page is shown when someone opens a shared invite link.

Props:
interface InviteLinkPageProps {
  token: string;
  creator: { handle: string; displayName: string; avatarUrl: string | null };
  plan: { planId: string; placeName: string; placeAddress: string; plannedAt: string | null; isCancelled: boolean } | null;
  isExpired: boolean;
  isAuthenticated: boolean;
  onSignIn: () => void;
  onRedeem: () => void;
}

Layout: min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 flex items-center justify-center p-4.

Center card: max-w-sm w-full bg-white rounded-2xl shadow-lg p-6.

Contents (top to bottom):
1. App logo / name: "Hyperlocal" text-lg font-bold text-zinc-900 text-center mb-6.

2. Creator section: flex items-center gap-3 mb-4.
   Avatar: 48px circle (fallback initials bg-zinc-200).
   Right: "@{creator.handle} invited you" text-sm font-semibold. Below: creator.displayName text-xs text-zinc-400.

3. If plan is not null:
   Plan preview card: rounded-xl bg-zinc-50 border border-zinc-200 p-4 mb-4.
   "Planning to visit" text-xs text-zinc-400 uppercase tracking-wide mb-1.
   Place name: text-lg font-bold text-zinc-900.
   Address: text-xs text-zinc-400 mt-0.5.
   Date: if plannedAt: "📅 Sat Jun 1 · 7:00 PM" text-sm text-zinc-600 mt-2. If null: "📅 No date set yet" text-sm text-zinc-400 italic.
   If isCancelled: red "Cancelled" badge.

4. If isExpired:
   Red alert box: rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 "This invite link has expired." mb-4.

5. CTA button (full-width, primary, disabled if isExpired):
   If !isAuthenticated: "Sign in with Google to join" (calls onSignIn).
   If isAuthenticated: "Follow @{creator.handle}" (calls onRedeem).

6. Footer: text-xs text-zinc-400 text-center mt-4 "Hyperlocal — Create community anywhere, anytime."

Export: export default function InviteLinkPage(props: InviteLinkPageProps)
```

---

## 15. SettingsPage

### SettingsPage

**Screen:** `/settings`

**Purpose:** Minimal settings: edit profile, manage account, sign out.

**Props interface:**
```ts
interface SettingsPageProps {
  user: {
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    instagramHandle: string | null;
    twitterHandle: string | null;
    facebookUrl: string | null;
    isPrivate: boolean;
  };
  onSave: (updates: Partial<UserUpdates>) => void; // calls PATCH /users/me
  onSignOut: () => void;
}
```

**Data source:** `GET /users/me`. Save calls `PATCH /users/me`.

**Key interactions:**
- All fields are inline-editable (no separate edit mode — form is always editable).
- "Save changes" button at bottom activates when any field has changed.
- "Private account" toggle → updates `is_private`.
- "Sign out" → `supabase.auth.signOut()` → redirect to `/`.
- Handle is shown as non-editable (read-only field with a lock icon).

**Visual notes:**
- Simple list-form layout (like iOS Settings).
- Sections: "Profile" (name, bio, avatar, socials), "Privacy" (private toggle), "Account" (sign out).
- Each section has a section heading in `text-xs text-zinc-400 uppercase tracking-wide`.
- Fields: each is a labeled row with a value that turns into an input on tap/focus.
- Sign out: red text button at bottom, separated from other settings.

**V0 prompt:**
```
Build a React + Tailwind + shadcn/ui settings page for a social planning app. MVP-minimal — profile editing and sign-out only.

Props:
interface SettingsPageProps {
  user: {
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    instagramHandle: string | null;
    twitterHandle: string | null;
    facebookUrl: string | null;
    isPrivate: boolean;
  };
  onSave: (updates: { displayName?: string; bio?: string; instagramHandle?: string; twitterHandle?: string; facebookUrl?: string; isPrivate?: boolean }) => void;
  onSignOut: () => void;
}

Layout: max-w-lg mx-auto px-4 py-6.

Page header: flex items-center gap-3 mb-6. Back arrow (←) icon button. "Settings" text-xl font-bold.

Section: "Profile" (text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2).

Profile avatar row: flex items-center gap-4 mb-4 p-4 rounded-xl bg-white border border-zinc-200.
  Left: 64px avatar circle. Right: "Change photo" text-sm text-indigo-600 cursor-pointer. Below that: "@{handle}" text-xs text-zinc-400 (with lock icon — non-editable label).

Form fields (each is a labeled input row in a white rounded-xl border card, divide-y):
  - Display name (text input, max 100 chars)
  - Bio (textarea, 3 rows, max 300 chars)
  - Instagram: "@" prefix input
  - Twitter: "@" prefix input
  - Facebook URL: plain text input

Section: "Privacy" (same section heading style, mt-6).
  One row card: flex justify-between items-center p-4 rounded-xl bg-white border. Label left: "Private account" text-sm font-medium + "Only followers can see your places." text-xs text-zinc-400 below. Right: shadcn Switch component bound to isPrivate.

Section: "Account" (mt-6).
  "Save changes" primary Button full-width (disabled until a field changes). Below: "Sign out" ghost Button full-width text-red-500 mt-2 (calls onSignOut).

Export: export default function SettingsPage(props: SettingsPageProps)
```

---

## Quick Reference — Component Index

| Component | File | Screen | Route |
|---|---|---|---|
| LandingPage | `pages/LandingPage.tsx` | Landing | `/` |
| OnboardingPage | `pages/OnboardingPage.tsx` | Onboarding | `/onboarding` |
| MapPage | `pages/MapPage.tsx` | Main map | `/map` |
| Panel | `components/panel/Panel.tsx` | Main map sidebar | `/map` |
| FriendPlanCard | `components/panel/PlanCard.tsx` | Panel | `/map` |
| OwnPlanCard | `components/panel/PlanCard.tsx` | Panel | `/map` |
| PlaceCard | `components/panel/PlaceCard.tsx` | Panel | `/map` |
| NotificationCard | `components/panel/NotificationCard.tsx` | Panel | `/map` |
| PlaceDetailView | `components/places/PlaceDetailView.tsx` | Over map | `/map` |
| SavePlaceModal | `components/places/SavePlaceModal.tsx` | Within PlaceDetailView | `/map` |
| CreatePlanFlow | `components/plans/CreatePlanFlow.tsx` | Modal over map | `/map` |
| PlanDetailPage | `pages/PlanDetailPage.tsx` | Plan detail | `/plans/:planId` |
| OwnProfilePage | `pages/UserProfilePage.tsx` | Own profile | `/u/:handle` |
| FriendProfilePage | `pages/UserProfilePage.tsx` | Friend profile | `/u/:handle` |
| FollowingProfilePage | `pages/UserProfilePage.tsx` | Follower-only profile | `/u/:handle` |
| InviteLinkPage | `pages/InvitePage.tsx` | Invite landing | `/invite/:token` |
| SettingsPage | `pages/SettingsPage.tsx` | Settings | `/settings` |
