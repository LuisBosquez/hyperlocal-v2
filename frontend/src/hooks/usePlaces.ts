import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

export function usePlaceDetail(placeId: string | null) {
  return useQuery({
    queryKey: queryKeys.placeDetail(placeId ?? ''),
    queryFn: () => api.get(`/places/${placeId}`).then((r) => r.data.data),
    staleTime: 5 * 60_000,
    enabled: !!placeId,
  });
}

export function useSavePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, note }: { placeId: string; note?: string }) =>
      api.post(`/places/${placeId}/save`, { note }),
    onSuccess: (_data, { placeId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
      queryClient.invalidateQueries({ queryKey: queryKeys.placeDetail(placeId) });
    },
  });
}

export function useUnsavePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.delete(`/places/${placeId}/save`),
    onSuccess: (_data, placeId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
      queryClient.invalidateQueries({ queryKey: queryKeys.placeDetail(placeId) });
    },
  });
}
