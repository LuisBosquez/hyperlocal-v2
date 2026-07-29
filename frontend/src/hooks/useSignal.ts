import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap, apiError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { toast } from '../components/ui';
import type { OpenSignal, PublicUser } from '../types/api';

/** "I'm down for plans today" (spec §8, MD-5). */
export function useMySignal() {
  return useQuery<OpenSignal>({
    queryKey: queryKeys.mySignal(),
    queryFn: () => unwrap(api.get('/users/me/signal')),
    staleTime: 60_000,
  });
}

export function useSetSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => unwrap<OpenSignal>(api.put('/users/me/signal', { open_to_plans: on })),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.mySignal(), data);
      toast.success(data.open_to_plans ? "You're down for plans today — friends will see it." : 'Signal off.');
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't update your signal."),
  });
}

/** Mutual friends signalling they're down today — powers the composer hint. */
export function useOpenFriends(enabled = true) {
  return useQuery<PublicUser[]>({
    queryKey: queryKeys.openFriends(),
    queryFn: () => unwrap(api.get('/users/me/friends/open-today')),
    staleTime: 60_000,
    enabled,
  });
}
