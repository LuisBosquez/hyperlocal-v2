import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api, { unwrap, apiError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useMapStore } from '../store/mapStore';
import { toast } from '../components/ui';
import type { Place, ContextualResponse, PlaceSearchResponse, CityResult } from '../types/api';

/** The current scoped discovery area as request params (Area scoping, Flow 14). */
function useScopedParams() {
  const [lng, lat] = useMapStore((s) => s.scopedCenter);
  const scopedBbox = useMapStore((s) => s.scopedBbox);
  return { lat, lng, bbox: scopedBbox ? scopedBbox.join(',') : undefined };
}

export function usePlaceDetail(placeId: string | null) {
  return useQuery<Place>({
    queryKey: queryKeys.placeDetail(placeId ?? ''),
    queryFn: () => unwrap(api.get(`/places/${placeId}`)),
    staleTime: 5 * 60_000,
    enabled: !!placeId,
  });
}

export function usePlaceSearch(q: string, lat?: number, lng?: number) {
  return useQuery<PlaceSearchResponse>({
    queryKey: queryKeys.placeSearch(q, lat, lng),
    queryFn: () => unwrap(api.get('/places/search', { params: { q, lat, lng } })),
    enabled: q.trim().length > 1,
    staleTime: 60_000,
  });
}

/** Change-location mode (spec §4): does the query look like a city? */
export function useCitySearch(q: string) {
  return useQuery<{ results: CityResult[] }>({
    queryKey: queryKeys.citySearch(q),
    queryFn: () => unwrap(api.get('/geo/forward', { params: { q } })),
    enabled: q.trim().length >= 3,
    staleTime: 10 * 60_000,
  });
}

/** All of the viewer's saved places — powers the check-in card (spec §5). */
export function useMySavedPlaces() {
  return useQuery<Place[]>({
    queryKey: queryKeys.myPlaces(),
    queryFn: () => unwrap(api.get('/user-places/mine')),
    staleTime: 60_000,
  });
}

export function useContextual() {
  // Scoped to the current area (not the live center) so chips/pins don't churn
  // while panning — refetches only on "Search this area" / locate-me / refresh.
  const { lat, lng, bbox } = useScopedParams();
  return useQuery<ContextualResponse>({
    queryKey: queryKeys.contextualPlaces(lat, lng, bbox),
    queryFn: () => unwrap(api.get('/places/contextual', { params: { lat, lng, bbox } })),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useMapPins() {
  const { lat, lng, bbox } = useScopedParams();
  return useQuery<Place[]>({
    queryKey: queryKeys.mapPins(lat, lng, bbox),
    queryFn: () => unwrap(api.get('/places/map', { params: { lat, lng, bbox } })),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Reverse-geocoded area label for the overlay (Flow 14). */
export function useAreaLabel() {
  const [lng, lat] = useMapStore((s) => s.scopedCenter);
  return useQuery<{ area_label: string; context: string | null }>({
    queryKey: queryKeys.area(lat, lng),
    queryFn: () => unwrap(api.get('/geo/reverse', { params: { lat, lng } })),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useSavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, note, listIds }: { placeId: string; note?: string; listIds?: string[] }) =>
      unwrap(api.post('/user-places', { place_id: placeId, note, list_ids: listIds })),
    onSuccess: (_d, { placeId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
      qc.invalidateQueries({ queryKey: queryKeys.placeDetail(placeId) });
      qc.invalidateQueries({ queryKey: queryKeys.mapPinsAll() });
      qc.invalidateQueries({ queryKey: queryKeys.myListsAll() });
      qc.invalidateQueries({ queryKey: queryKeys.myPlaces() });
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
      qc.invalidateQueries({ queryKey: queryKeys.mapPinsAll() });
      qc.invalidateQueries({ queryKey: queryKeys.myPlaces() });
    },
  });
}
