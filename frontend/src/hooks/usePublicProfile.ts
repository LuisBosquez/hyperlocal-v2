import { useQuery } from '@tanstack/react-query';
import publicApi from '../lib/publicApi';

export interface PublicPlan {
  id: string;
  title: string;
  description: string | null;
  plan_date: string | null;
  plan_time: string | null;
  // Venue info — neighbourhood only for unauth'd, full details when authed
  place_neighbourhood: string | null;
  place_name: string | null; // null if caller is not authenticated
  place_address: string | null; // null if caller is not authenticated
  organizer_handle: string;
  organizer_display_name: string | null;
  organizer_avatar_url: string | null;
  join_count: number;
  interest_count: number;
  is_cancelled: boolean;
}

export interface PublicProfile {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
}

export function usePublicProfile(handle: string | undefined) {
  return useQuery<PublicProfile>({
    queryKey: ['public', 'profile', handle],
    queryFn: () =>
      publicApi.get(`/public/users/${handle}`).then((r) => r.data.data),
    enabled: !!handle,
    staleTime: 2 * 60_000,
  });
}

export function usePublicPlans(handle: string | undefined) {
  return useQuery<PublicPlan[]>({
    queryKey: ['public', 'plans', handle],
    queryFn: () =>
      publicApi.get(`/public/users/${handle}/plans`).then((r) => r.data.data),
    enabled: !!handle,
    staleTime: 60_000,
  });
}

export function usePublicPlan(planId: string | undefined) {
  return useQuery<PublicPlan>({
    queryKey: ['public', 'plan', planId],
    queryFn: () =>
      publicApi.get(`/public/plans/${planId}`).then((r) => r.data.data),
    enabled: !!planId,
    staleTime: 60_000,
  });
}
