import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap, apiError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { toast } from '../components/ui';
import type { PlanDetail, TimeBand, TimeProposal, TimeProposalOption } from '../types/api';

export function usePlanDetail(planId: string) {
  return useQuery<PlanDetail>({
    queryKey: queryKeys.planDetail(planId),
    queryFn: () => unwrap(api.get(`/plans/${planId}`)),
    enabled: !!planId,
    retry: (count, e) => apiError(e).code !== 'NOT_FOUND' && count < 1,
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      place_id: string;
      plan_date?: string | null;
      plan_time?: string | null;
      plan_time_band?: TimeBand | null;
      is_timeless?: boolean;
    }) => unwrap<PlanDetail>(api.post('/plans', vars)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
      qc.invalidateQueries({ queryKey: queryKeys.mapPins() });
    },
  });
}

export function useUpdatePlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { plan_date?: string | null; plan_time?: string | null; plan_time_band?: TimeBand | null }) =>
      unwrap<PlanDetail>(api.patch(`/plans/${planId}`, vars)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      qc.invalidateQueries({ queryKey: queryKeys.planProposals(planId) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
      toast.success('Time set — everyone interested was notified.');
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't set the time."),
  });
}

export function useCancelPlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap<PlanDetail>(api.post(`/plans/${planId}/cancel`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
      toast.info('Plan cancelled. It lives on for anyone who joined.');
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't cancel."),
  });
}

// --- Optimistic toggles on plan detail (tech/08 P1) ---

function patchPlanDetail(
  qc: ReturnType<typeof useQueryClient>,
  planId: string,
  fn: (p: PlanDetail) => PlanDetail,
) {
  qc.setQueryData<PlanDetail>(queryKeys.planDetail(planId), (old) => (old ? fn(old) : old));
}

export function useJoinPlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/plans/${planId}/joins`),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.planDetail(planId) });
      const prev = qc.getQueryData<PlanDetail>(queryKeys.planDetail(planId));
      patchPlanDetail(qc, planId, (p) => ({
        ...p,
        viewer: { ...p.viewer, has_joined: true },
        join_count: p.viewer.has_joined ? p.join_count : p.join_count + 1,
      }));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.planDetail(planId), ctx.prev);
      toast.error(apiError(e).message ?? "Couldn't join.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
    },
  });
}

export function useLeavePlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/plans/${planId}/joins`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
    },
  });
}

export function useToggleInterest(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (interested: boolean) =>
      interested ? api.post(`/plans/${planId}/interests`) : api.delete(`/plans/${planId}/interests`),
    onMutate: async (interested) => {
      await qc.cancelQueries({ queryKey: queryKeys.planDetail(planId) });
      const prev = qc.getQueryData<PlanDetail>(queryKeys.planDetail(planId));
      patchPlanDetail(qc, planId, (p) => ({
        ...p,
        viewer: { ...p.viewer, is_interested: interested },
        interest_count: Math.max(0, p.interest_count + (interested ? 1 : -1)),
      }));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.planDetail(planId), ctx.prev);
      toast.error(apiError(e).message ?? "Couldn't update.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
      qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
    },
  });
}

// --- Collaborative time proposals (Flow 4.3/4.4) ---

function invalidatePlan(qc: ReturnType<typeof useQueryClient>, planId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.planDetail(planId) });
  qc.invalidateQueries({ queryKey: queryKeys.planProposals(planId) });
  qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
}

export function usePlanProposals(planId: string, enabled = true) {
  return useQuery<TimeProposal[]>({
    queryKey: queryKeys.planProposals(planId),
    queryFn: () => unwrap(api.get(`/plans/${planId}/proposals`)),
    enabled: !!planId && enabled,
  });
}

export function useProposeTime(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { options: TimeProposalOption[]; expires_in_days?: number }) =>
      unwrap<TimeProposal>(api.post(`/plans/${planId}/proposals`, vars)),
    onSuccess: () => {
      invalidatePlan(qc, planId);
      toast.success('Proposal sent to the organizer.');
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't send your proposal."),
  });
}

export function useAcceptProposal(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { proposalId: string; optionIndex: number }) =>
      unwrap<PlanDetail>(api.post(`/plans/${planId}/proposals/${vars.proposalId}/accept`, { option_index: vars.optionIndex })),
    onSuccess: () => {
      invalidatePlan(qc, planId);
      toast.success('Time locked in — everyone was notified.');
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't accept that time."),
  });
}

export function useDeclineProposal(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => unwrap(api.post(`/plans/${planId}/proposals/${proposalId}/decline`)),
    onSuccess: () => {
      invalidatePlan(qc, planId);
      toast.info('Proposal declined. The plan is still open for a time.');
    },
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't decline."),
  });
}

export function useRetractProposal(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => api.delete(`/plans/${planId}/proposals/${proposalId}`),
    onSuccess: () => invalidatePlan(qc, planId),
    onError: (e) => toast.error(apiError(e).message ?? "Couldn't retract."),
  });
}
