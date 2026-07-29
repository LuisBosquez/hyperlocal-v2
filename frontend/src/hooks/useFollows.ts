import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap, apiError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { toast } from '../components/ui';
import type { PublicUser } from '../types/api';

export function useFriends() {
  return useQuery<PublicUser[]>({
    queryKey: queryKeys.friends(),
    queryFn: () => unwrap(api.get('/users/me/friends')),
    staleTime: 2 * 60_000,
  });
}

type FollowEdge = PublicUser & { follows_me: boolean; i_follow: boolean };

export function useFollowers(enabled = true) {
  return useQuery<FollowEdge[]>({
    queryKey: queryKeys.followers(),
    queryFn: () => unwrap(api.get('/follows/followers')),
    staleTime: 60_000,
    enabled,
  });
}

export function useFollowing(enabled = true) {
  return useQuery<FollowEdge[]>({
    queryKey: queryKeys.following(),
    queryFn: () => unwrap(api.get('/follows/following')),
    staleTime: 60_000,
    enabled,
  });
}

export function useUserSearch(q: string) {
  return useQuery<(PublicUser & { is_private: boolean })[]>({
    queryKey: ['users', 'search', q],
    queryFn: () => unwrap(api.get('/users/search', { params: { q } })),
    enabled: q.trim().length > 0,
  });
}

/** Follow by handle (Flow 6/7). Invalidates profile + friends + panel. */
export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => unwrap<{ is_mutual: boolean }>(api.post('/follows', { handle })),
    onSuccess: (data, handle) => {
      qc.invalidateQueries({ queryKey: queryKeys.friends() });
      qc.invalidateQueries({ queryKey: queryKeys.userProfile(handle) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
      toast.success(data.is_mutual ? "You're friends now — plans unlocked." : 'Followed.');
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't follow."),
  });
}

export function useUnfollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => api.delete(`/follows/${handle}`),
    onSuccess: (_d, handle) => {
      qc.invalidateQueries({ queryKey: queryKeys.friends() });
      qc.invalidateQueries({ queryKey: queryKeys.userProfile(handle) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
    },
  });
}
