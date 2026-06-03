export interface DbUser {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface DbPlace {
  id: string;
  google_place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string | null;
  created_at: string;
}

export interface DbUserPlace {
  id: string;
  user_id: string;
  place_id: string;
  note: string | null;
  created_at: string;
}

export interface DbPlan {
  id: string;
  organizer_id: string;
  place_id: string;
  plan_date: string | null;
  plan_time: string | null;
  is_timeless: boolean;
  is_cancelled: boolean;
  created_at: string;
}

export interface DbPlanJoin {
  id: string;
  plan_id: string;
  user_id: string;
  created_at: string;
}

export interface DbPlanInterest {
  id: string;
  plan_id: string;
  user_id: string;
  created_at: string;
}

export interface DbFollow {
  id: string;
  follower_id: string;
  followee_id: string;
  created_at: string;
}

export interface DbNotification {
  id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface DbInviteLink {
  id: string;
  token: string;
  creator_id: string;
  plan_id: string | null;
  created_at: string;
}
