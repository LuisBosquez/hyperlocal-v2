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
  viewer?: {
    is_saved: boolean;
    note: string | null;
    active_plan_id?: string | null;
  };
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
  favorite_places?: PlaceInfo[];
  want_to_go?: PlaceInfo[];
}

export interface InviteResolved {
  token: string;
  creator: PublicUser | null;
  place: { name: string; category: string | null; place_id: string } | null;
  plan_id: string | null;
  expired: boolean;
}
