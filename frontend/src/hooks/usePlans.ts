import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

export function usePlanDetail(planId: string) {
  return useQuery({
    queryKey: queryKeys.planDetail(planId),
    queryFn: () => api.get(`/plans/${planId}`).then((r) => r.data.data),
    staleTime: 30_000,
    enabled: !!planId,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { place_id: string; plan_date?: string; plan_time?: string }) =>
      api.post('/plans', vars).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
    },
  });
}

export function useUpdatePlan(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { plan_date?: string; plan_time?: string }) =>
      api.patch(`/plans/${planId}`, vars).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
    },
  });
}

export function useCancelPlan(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/plans/${planId}/cancel`).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
    },
  });
}

export function useJoinPlan(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/plans/${planId}/join`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.planJoins(planId) });
    },
  });
}

export function useLeavePlan(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/plans/${planId}/join`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.planJoins(planId) });
    },
  });
}

export function useMarkInterested(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/plans/${planId}/interest`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
    },
  });
}

export function useRemoveInterest(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/plans/${planId}/interest`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.panel() });
    },
  });
}
