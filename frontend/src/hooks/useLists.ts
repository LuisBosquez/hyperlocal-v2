import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap, apiError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { toast } from '../components/ui';
import type { ListSummary, ListDetail } from '../types/api';

export function useMyLists(placeId?: string) {
  return useQuery<{ items: ListSummary[] }>({
    queryKey: queryKeys.myLists(placeId),
    queryFn: () => unwrap(api.get('/users/me/lists', { params: { place_id: placeId } })),
    staleTime: 30_000,
  });
}

export function useUserLists(handle: string | undefined) {
  return useQuery<{ items: ListSummary[] }>({
    queryKey: queryKeys.userLists(handle ?? ''),
    queryFn: () => unwrap(api.get(`/users/${handle}/lists`)),
    enabled: !!handle,
  });
}

export function useListDetail(listId: string | undefined) {
  return useQuery<ListDetail>({
    queryKey: queryKeys.listDetail(listId ?? ''),
    queryFn: () => unwrap(api.get(`/lists/${listId}`)),
    enabled: !!listId,
  });
}

function invalidateLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.myListsAll() });
  qc.invalidateQueries({ queryKey: ['lists'] });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string | null; visibility: 'public' | 'private' }) =>
      unwrap<ListSummary>(api.post('/lists', body)),
    onSuccess: () => invalidateLists(qc),
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't create the list."),
  });
}

export function useUpdateList(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; description?: string | null; visibility?: 'public' | 'private' }) =>
      unwrap<ListSummary>(api.patch(`/lists/${listId}`, body)),
    onSuccess: () => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.listDetail(listId) });
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't update the list."),
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => api.delete(`/lists/${listId}`),
    onSuccess: () => invalidateLists(qc),
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't delete the list."),
  });
}

export function useAddToList(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.put(`/lists/${listId}/places/${placeId}`),
    onSuccess: () => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.listDetail(listId) });
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't add to the list."),
  });
}

export function useRemoveFromList(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => api.delete(`/lists/${listId}/places/${placeId}`),
    onSuccess: () => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: queryKeys.listDetail(listId) });
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't remove from the list."),
  });
}

export function useShareList() {
  return useMutation({
    mutationFn: (listId: string) => unwrap<{ token: string }>(api.post(`/lists/${listId}/share`, {})),
  });
}
