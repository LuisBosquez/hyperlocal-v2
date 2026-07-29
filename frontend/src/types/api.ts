export interface ApiResponse<T> {
  data: T;
  error: { code: string; message?: string; fields?: Record<string, unknown> } | null;
}

export interface AppUser {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  is_private?: boolean;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  facebook_url?: string | null;
}

export interface PublicUser {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Relationship {
  is_self: boolean;
  i_follow: boolean;
  follows_me: boolean;
  is_mutual: boolean;
}

export interface PlaceInfo {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: string | null;
  photo_url?: string | null;
}

export interface SearchMatch {
  kind: 'name' | 'category' | 'note';
  note_source: 'own' | 'friend' | null;
  note_handle: string | null;
}

export interface Place extends PlaceInfo {
  google_place_id?: string;
  description?: string | null;
  opening_hours?: OpeningPeriod[] | null;
  is_unavailable?: boolean;
  google_maps_url?: string;
  distance_meters?: number;
  source?: 'own' | 'friend' | 'contextual';
  saved_by_handle?: string | null;
  note?: string | null;
  saved_at?: string | null;
  match?: SearchMatch; // notes-enriched search provenance (Flow 16)
  viewer?: {
    is_saved: boolean;
    note: string | null;
    active_plan_id?: string | null;
  };
}

// --- Map discovery (pm/specs/mvp-map-discovery.md) ----------------------------

/** NL/category search: a proximity cluster of up to 5 places (spec §3, MD-3). */
export interface CategoryGroup {
  kind: 'category';
  category: string;
  label: string;
  places: Place[];
}

export interface PlaceSearchResponse {
  results: Place[];
  groups: CategoryGroup[];
  degraded: boolean;
}

/** City match for the change-location search mode (spec §4). */
export interface CityResult {
  name: string;
  region: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number];
}

/** A plan rendered as a first-class map marker (spec §6, MD-4). */
export interface PlanPin {
  plan_id: string;
  place_id: string;
  place_name: string;
  category: string | null;
  lat: number;
  lng: number;
  plan_date: string | null;
  plan_time: string | null;
  plan_time_band: TimeBand | null;
  state: PlanState;
  role: 'organizer' | 'joiner' | 'friend';
  organizer_handle: string | null;
  organizer_avatar_url: string | null;
  join_count: number;
  interest_count: number;
  viewer_has_joined: boolean;
  viewer_is_interested: boolean;
  distance_meters: number | null;
}

/** "I'm down for plans today" (spec §8, MD-5). */
export interface OpenSignal {
  open_to_plans: boolean;
  until: string | null;
}

// --- Lists (Flows 17–20) -----------------------------------------------------
export interface ListSummary {
  id: string;
  name: string;
  description?: string | null;
  visibility: 'public' | 'private';
  is_default: boolean;
  place_count: number;
  updated_at?: string;
  contains_place?: boolean; // present on GET /users/me/lists?place_id=
  places?: PlaceInfo[]; // present on profile-embedded lists
}

export interface ListDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  is_default: boolean;
  place_count: number;
  owner: PublicUser | null;
  is_owner: boolean;
  places: (PlaceInfo & { position?: number })[];
}

export interface OpeningPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}

export type PlanState = 'timeless' | 'tentative' | 'confirmed';
export type TimeBand = 'morning' | 'afternoon' | 'evening';
export type TimeGranularity = 'exact' | 'approximate';

export interface TimeProposalOption {
  plan_date: string;
  plan_time: string | null;
  plan_time_band: TimeBand | null;
}

export interface TimeProposal {
  id: string;
  plan_id: string;
  proposer: PublicUser | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  options: TimeProposalOption[];
  expires_at: string | null;
  accepted_option: number | null;
  viewer_is_proposer: boolean;
  created_at: string;
}

export interface PlanDetail {
  id: string;
  place_id: string;
  place: PlaceInfo & { opening_hours?: OpeningPeriod[] | null; is_unavailable?: boolean };
  organizer: PublicUser;
  plan_date: string | null;
  plan_time: string | null;
  plan_time_band: TimeBand | null;
  is_timeless: boolean;
  state: PlanState;
  time_granularity: TimeGranularity | null;
  status: 'active' | 'cancelled';
  is_cancelled: boolean;
  is_past: boolean;
  is_unconfirmed: boolean;
  created_at: string;
  interest_count: number;
  join_count: number;
  viewer: { is_organizer: boolean; has_joined: boolean; is_interested: boolean };
  attendees?: PublicUser[];
  interested_users?: PublicUser[];
  pending_proposal?: TimeProposal | null;
}

// --- Panel cards (discriminated union) ---

export interface NotificationCardData {
  type: 'notification';
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PlanCardData {
  type: 'plan';
  plan_id: string;
  role: 'organizer' | 'joiner' | 'friend';
  place_id: string;
  place_name: string;
  plan_date: string | null;
  plan_time: string | null;
  plan_time_band: TimeBand | null;
  state: PlanState;
  time_granularity: TimeGranularity | null;
  is_cancelled: boolean;
  is_unconfirmed: boolean;
  has_pending_proposal: boolean;
  interest_count: number;
  join_count: number;
  viewer_has_joined: boolean;
  viewer_is_interested: boolean;
  organizer_handle: string | null;
  organizer_avatar_url: string | null;
  created_at: string;
}

export interface PlaceCardData {
  type: 'place';
  place_id: string;
  name: string;
  category: string | null;
  source: 'own' | 'friend' | 'contextual';
  saved_by_handle: string | null;
  note: string | null;
  distance_meters: number | null;
  lat: number;
  lng: number;
}

export type PanelCard = NotificationCardData | PlanCardData | PlaceCardData;

export interface PanelResponse {
  cards: PanelCard[];
  meta: { friend_count: number; saved_count: number; sorted_by: 'proximity' | 'recency' };
}

export interface ContextualResponse {
  tagline: string;
  weather: string | null;
  results: Place[];
}

export interface ProfileResponse {
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  is_private: boolean;
  tier: 'self' | 'mutual' | 'follower' | 'none' | 'private';
  relationship: Relationship;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  facebook_url?: string | null;
  lists?: ListSummary[];
}

export interface InviteResolved {
  token: string;
  creator: PublicUser | null;
  place: { name: string; category: string | null; place_id: string } | null;
  list: { list_id: string; name: string } | null;
  plan_id: string | null;
  expired: boolean;
}
