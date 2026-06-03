import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

export function useFriends() {
  return useQuery({
    queryKey: queryKeys.friends(),
    queryFn: () => api.get('/users/me/friends').then((r) => r.data.data),
    staleTime: 2 * 60_000,
  });
}

export function useFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (followeeId: string) =>
      api.post('/follows', { followee_id: followeeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends() });
    },
  });
}

export function useUnfollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (followeeId: string) => api.delete(`/follows/${followeeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends() });
    },
  });
}
