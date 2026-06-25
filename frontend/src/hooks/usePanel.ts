import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api, { unwrap, apiError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import { useDebouncedValue } from './useDebouncedValue';
import { toast } from '../components/ui';
import type { PanelResponse, PlanCardData } from '../types/api';

export function usePanel() {
  const center = useMapStore((s) => s.center);
  const { activeFilter } = useUIStore();
  // Debounce the map center so panning doesn't refire the query every frame,
  // and keep the previous results visible while the next page loads — together
  // these stop the list from flashing as the user moves the map.
  const [lng, lat] = useDebouncedValue(center, 350);

  return useQuery<PanelResponse>({
    queryKey: queryKeys.panel(lat, lng, activeFilter),
    queryFn: () => unwrap(api.get('/panel', { params: { lat, lng, filter: activeFilter } })),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

/** Patch every cached panel page in place (P1 optimistic). */
function patchPanelPlan(
  qc: ReturnType<typeof useQueryClient>,
  planId: string,
  fn: (c: PlanCardData) => PlanCardData,
) {
  qc.getQueriesData<PanelResponse>({ queryKey: queryKeys.panelAll() }).forEach(([key, data]) => {
    if (!data) return;
    qc.setQueryData<PanelResponse>(key, {
      ...data,
      cards: data.cards.map((c) => (c.type === 'plan' && c.plan_id === planId ? fn(c) : c)),
    });
  });
}

export function usePanelToggleInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, interested }: { planId: string; interested: boolean }) =>
      interested ? api.post(`/plans/${planId}/interests`) : api.delete(`/plans/${planId}/interests`),
    onMutate: async ({ planId, interested }) => {
      await qc.cancelQueries({ queryKey: queryKeys.panelAll() });
      const snapshot = qc.getQueriesData<PanelResponse>({ queryKey: queryKeys.panelAll() });
      patchPanelPlan(qc, planId, (c) => ({
        ...c,
        viewer_is_interested: interested,
        interest_count: Math.max(0, c.interest_count + (interested ? 1 : -1)),
      }));
      return { snapshot };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(apiError(e).message ?? "Couldn't update.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.panelAll() }),
  });
}

export function usePanelJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId }: { planId: string }) => api.post(`/plans/${planId}/joins`),
    onMutate: async ({ planId }) => {
      await qc.cancelQueries({ queryKey: queryKeys.panelAll() });
      const snapshot = qc.getQueriesData<PanelResponse>({ queryKey: queryKeys.panelAll() });
      patchPanelPlan(qc, planId, (c) => ({
        ...c,
        viewer_has_joined: true,
        join_count: c.viewer_has_joined ? c.join_count : c.join_count + 1,
      }));
      return { snapshot };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(apiError(e).message ?? "Couldn't join.");
    },
    onSuccess: () => toast.success("You're in."),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.panelAll() }),
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/dismiss`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.panelAll() });
      const snapshot = qc.getQueriesData<PanelResponse>({ queryKey: queryKeys.panelAll() });
      qc.getQueriesData<PanelResponse>({ queryKey: queryKeys.panelAll() }).forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<PanelResponse>(key, {
          ...data,
          cards: data.cards.filter((c) => !(c.type === 'notification' && c.id === id)),
        });
      });
      return { snapshot };
    },
    onError: (_e, _v, ctx) => ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.panelAll() }),
  });
}
