import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api, { unwrap, apiError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useDebouncedValue } from './useDebouncedValue';
import { toast } from '../components/ui';
import type { Place, ContextualResponse } from '../types/api';

export function usePlaceDetail(placeId: string | null) {
  return useQuery<Place>({
    queryKey: queryKeys.placeDetail(placeId ?? ''),
    queryFn: () => unwrap(api.get(`/places/${placeId}`)),
    staleTime: 5 * 60_000,
    enabled: !!placeId,
  });
}

export function usePlaceSearch(q: string, lat?: number, lng?: number) {
  return useQuery<{ results: Place[]; degraded: boolean }>({
    queryKey: queryKeys.placeSearch(q, lat, lng),
    queryFn: () => unwrap(api.get('/places/search', { params: { q, lat, lng } })),
    enabled: q.trim().length > 1,
    staleTime: 60_000,
  });
}

export function useContextual(lat?: number, lng?: number) {
  // Debounced + keepPreviousData so the contextual pins/chips don't churn while
  // the map is being panned (matches usePanel).
  const dLat = useDebouncedValue(lat, 350);
  const dLng = useDebouncedValue(lng, 350);
  return useQuery<ContextualResponse>({
    queryKey: queryKeys.contextualPlaces(dLat, dLng),
    queryFn: () => unwrap(api.get('/places/contextual', { params: { lat: dLat, lng: dLng } })),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useMapPins() {
  return useQuery<Place[]>({
    queryKey: queryKeys.mapPins(),
    queryFn: () => unwrap(api.get('/places/map')),
    staleTime: 30_000,
  });
}

export function useSavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, note }: { placeId: string; note?: string }) =>
      unwrap(api.post('/user-places', { place_id: placeId, note })),
    onSuccess: (_d, { placeId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
      qc.invalidateQueries({ queryKey: queryKeys.placeDetail(placeId) });
      qc.invalidateQueries({ queryKey: queryKeys.mapPins() });
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't save."),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, note }: { placeId: string; note: string }) =>
      unwrap(api.patch(`/user-places/${placeId}`, { note })),
    onSuccess: (_d, { placeId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.placeDetail(placeId) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't save the note."),
  });
}

export function useUnsavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.delete(`/user-places/${placeId}`),
    onSuccess: (_d, placeId) => {
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
      qc.invalidateQueries({ queryKey: queryKeys.placeDetail(placeId) });
      qc.invalidateQueries({ queryKey: queryKeys.mapPins() });
    },
  });
}
