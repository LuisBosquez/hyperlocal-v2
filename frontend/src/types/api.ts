export interface ApiResponse<T> {
  data: T;
  error: { code: string; message?: string } | null;
}

export interface AppUser {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface Place {
  place_id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  category?: string;
  photo_url?: string | null;
  opening_hours?: string[] | null;
  google_maps_url?: string | null;
}

export interface Plan {
  id: string;
  organizer_id: string;
  place_id: string;
  plan_date: string | null;
  plan_time: string | null;
  is_timeless: boolean;
  is_cancelled: boolean;
  created_at: string;
}

// Panel card discriminated union
export type PanelCardType = 'notification' | 'plan' | 'place';

export interface NotificationPayload {
  actor_handle?: string;
  plan_id?: string;
  place_name?: string;
  [key: string]: unknown;
}

export interface NotificationCardData {
  type: 'notification';
  id: string;
  event_type: string;
  payload: NotificationPayload;
  created_at: string;
}

export interface PlanCardData {
  type: 'plan';
  plan_id: string;
  role: 'organizer' | 'joiner' | 'friend';
  place_name: string;
  planned_at: string | null;
  is_cancelled: boolean;
  interest_count: number;
  join_count: number;
  requester_has_joined: boolean;
  requester_is_interested: boolean;
  organizer_handle: string;
  organizer_avatar_url: string | null;
}

export interface PlaceCardData {
  type: 'place';
  place_id: string;
  name: string;
  source: 'own' | 'friend' | 'contextual';
  saved_by_handle: string | null;
  distance_meters: number | null;
  note: string | null;
}

export type PanelCard = NotificationCardData | PlanCardData | PlaceCardData;

export interface MapPin {
  place_id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  saved_by: 'me' | string;
}

export interface InviteLink {
  token: string;
  creator_id: string;
  plan_id: string | null;
  created_at: string;
}
