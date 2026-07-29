import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  usePlanDetail,
  useUpdatePlan,
  useCancelPlan,
  useJoinPlan,
  useLeavePlan,
  useToggleInterest,
  useProposeTime,
  useAcceptProposal,
  useDeclineProposal,
  useRetractProposal,
} from '../hooks/usePlans';
import { OverlayScreen } from '../components/layout/OverlayScreen';
import { PlanComposer } from '../components/plan/PlanComposer';
import { ProposeTimeSheet } from '../components/plan/ProposeTimeSheet';
import { Spinner, EmptyState, Avatar, ConfirmSheet } from '../components/ui';
import { ShareSheet } from '../components/ui/ShareSheet';
import { formatPlanWhen, formatDate, formatTime, bandLabel } from '../lib/format';
import type { TimeProposalOption } from '../types/api';
import api, { unwrap } from '../lib/api';

function whenLabel(o: TimeProposalOption): string {
  const d = formatDate(o.plan_date);
  if (o.plan_time) return `${d} · ${formatTime(o.plan_time)}`;
  if (o.plan_time_band) return `${d} · ${bandLabel(o.plan_time_band)}`;
  return d;
}

export default function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { data: plan, isLoading, isError } = usePlanDetail(planId ?? '');
  const updatePlan = useUpdatePlan(planId ?? '');
  const cancelPlan = useCancelPlan(planId ?? '');
  const join = useJoinPlan(planId ?? '');
  const leave = useLeavePlan(planId ?? '');
  const toggleInterest = useToggleInterest(planId ?? '');
  const propose = useProposeTime(planId ?? '');
  const accept = useAcceptProposal(planId ?? '');
  const decline = useDeclineProposal(planId ?? '');
  const retract = useRetractProposal(planId ?? '');

  const [composerOpen, setComposerOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) {
    return (
      <OverlayScreen>
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-slate-400" />
        </div>
      </OverlayScreen>
    );
  }
  if (isError || !plan) {
    return (
      <OverlayScreen title="Plan">
        <EmptyState title="This plan isn’t available" hint="It may have been removed, or you’re no longer mutual friends." />
      </OverlayScreen>
    );
  }

  const { viewer } = plan;
  const pending = plan.pending_proposal ?? null;
  const isApproximate = plan.time_granularity === 'approximate';
  const noTimeYet = plan.state === 'timeless' || plan.state === 'tentative';

  async function makeShareUrl() {
    const link = await unwrap<{ token: string }>(api.post('/invite-links', { plan_id: planId }));
    return `${window.location.origin}/invite/${link.token}`;
  }

  return (
    <OverlayScreen title={plan.place.name}>
      <div className="p-4 space-y-4">
        {plan.is_cancelled && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            The organizer cancelled this plan — but it lives on. You can still go.
          </div>
        )}
        {plan.is_unconfirmed && !plan.is_cancelled && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            @{plan.organizer.handle} hasn’t confirmed a time yet.
          </div>
        )}
        {isApproximate && !plan.is_cancelled && (
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
            Approximate time ({bandLabel(plan.plan_time_band)}).{' '}
            {viewer.is_organizer ? 'You can lock in an exact time anytime.' : `@${plan.organizer.handle} may set an exact time closer to the day.`}
          </div>
        )}

        <div className="flex items-start gap-3">
          <Avatar user={plan.organizer} size={40} />
          <div>
            <button onClick={() => navigate(`/places/${plan.place_id}`)} className="text-left">
              <h1 className="text-lg font-bold text-slate-900 dark:text-zinc-100">{plan.place.name}</h1>
            </button>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              {viewer.is_organizer ? 'Your plan' : `@${plan.organizer.handle}’s plan`} ·{' '}
              {formatPlanWhen(plan.plan_date, plan.plan_time, plan.state, plan.plan_time_band)}
            </p>
          </div>
        </div>

        <a
          href={plan.place && `https://www.google.com/maps/search/?api=1&query=${plan.place.lat},${plan.place.lng}`}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {plan.place.address} ↗
        </a>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {viewer.is_organizer && !plan.is_cancelled && (
            <>
              {plan.state !== 'confirmed' && (
                <button
                  onClick={() => setComposerOpen(true)}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {plan.state === 'timeless' ? 'Add date & time' : 'Add time'}
                </button>
              )}
              {plan.state === 'confirmed' && (
                <button
                  onClick={() => setComposerOpen(true)}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                >
                  {isApproximate ? 'Lock in exact time' : 'Change time'}
                </button>
              )}
              <button onClick={() => setShareOpen(true)} className="px-4 py-2 rounded-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                Share
              </button>
              <button onClick={() => setConfirmCancel(true)} className="px-4 py-2 rounded-full text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                Cancel plan
              </button>
            </>
          )}

          {!viewer.is_organizer && (
            <>
              {!viewer.has_joined ? (
                <button
                  onClick={() => join.mutate()}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Join
                </button>
              ) : (
                <button
                  onClick={() => setConfirmLeave(true)}
                  className="px-4 py-2 rounded-full text-sm bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                >
                  Joined ✓ · Leave
                </button>
              )}
              <button
                onClick={() => toggleInterest.mutate(!viewer.is_interested)}
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  viewer.is_interested
                    ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                {viewer.is_interested ? 'Interested ✓' : 'Interested'}
              </button>
              {/* Sharing powers collaboration (spec §10) — not just for organizers. */}
              <button onClick={() => setShareOpen(true)} className="px-4 py-2 rounded-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                Share
              </button>
            </>
          )}
        </div>

        {/* Time proposals (Flow 4.3/4.4) */}
        {!plan.is_cancelled && viewer.is_organizer && pending && (
          <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/40 p-3">
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2">
              Proposed times · from @{pending.proposer?.handle ?? 'a friend'}
            </p>
            <div className="space-y-1.5 mb-2">
              {pending.options.map((o, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-200">{whenLabel(o)}</span>
                  <button
                    disabled={accept.isPending}
                    onClick={() => accept.mutate({ proposalId: pending.id, optionIndex: i })}
                    className="text-xs px-3 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Accept
                  </button>
                </div>
              ))}
            </div>
            <button
              disabled={decline.isPending}
              onClick={() => decline.mutate(pending.id)}
              className="text-xs text-slate-500 dark:text-zinc-400 hover:underline"
            >
              None of these work
            </button>
          </div>
        )}

        {!plan.is_cancelled && !viewer.is_organizer && noTimeYet && (
          <div>
            {!pending ? (
              <button
                onClick={() => setProposeOpen(true)}
                className="px-4 py-2 rounded-full text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Propose a time
              </button>
            ) : pending.viewer_is_proposer ? (
              <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/40 p-3">
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2">
                  You proposed {pending.options.length} time{pending.options.length === 1 ? '' : 's'} · waiting on @{plan.organizer.handle}
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {pending.options.map((o, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                      {whenLabel(o)}
                    </span>
                  ))}
                </div>
                <button
                  disabled={retract.isPending}
                  onClick={() => retract.mutate(pending.id)}
                  className="text-xs text-slate-500 dark:text-zinc-400 hover:underline"
                >
                  Retract proposal
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                @{pending.proposer?.handle ?? 'A friend'} proposed times — waiting on @{plan.organizer.handle} to pick one.
              </p>
            )}
          </div>
        )}

        {/* Counts + attendees */}
        <div className="text-sm text-slate-500 dark:text-zinc-400">
          {plan.interest_count} interested · {plan.join_count} going
        </div>

        {plan.attendees && plan.attendees.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2">Who’s going</p>
            <div className="space-y-1.5">
              {plan.attendees.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/u/${a.handle}`)}
                  className="flex items-center gap-2 w-full text-left hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg p-1"
                >
                  <Avatar user={a} size={28} />
                  <span className="text-sm text-slate-700 dark:text-zinc-200">@{a.handle}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {viewer.is_organizer && plan.interested_users && plan.interested_users.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-2">Interested</p>
            <div className="flex flex-wrap gap-2">
              {plan.interested_users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => navigate(`/u/${u.handle}`)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-zinc-800"
                >
                  <Avatar user={u} size={20} />
                  <span className="text-xs text-slate-600 dark:text-zinc-300">@{u.handle}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <PlanComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        openingHours={plan.place.opening_hours}
        initialDate={plan.state === 'tentative' || plan.state === 'confirmed' ? plan.plan_date : undefined}
        allowTimeless={false}
        title={plan.state === 'timeless' ? 'Add date & time' : 'Add a time'}
        submitting={updatePlan.isPending}
        onSubmit={(vars) => {
          updatePlan.mutate(
            { plan_date: vars.plan_date, plan_time: vars.plan_time, plan_time_band: vars.plan_time_band },
            { onSuccess: () => setComposerOpen(false) },
          );
        }}
      />

      <ProposeTimeSheet
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        openingHours={plan.place.opening_hours}
        submitting={propose.isPending}
        onSubmit={(vars) => propose.mutate(vars, { onSuccess: () => setProposeOpen(false) })}
      />

      <ConfirmSheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelPlan.mutate()}
        title="Cancel this plan?"
        body="This can’t be undone. Anyone who joined keeps the plan — it just shows you cancelled. The place stays saved."
        confirmLabel="Yes, cancel"
        destructive
      />
      <ConfirmSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => leave.mutate()}
        title="Leave this plan?"
        body="You can rejoin anytime while it’s still upcoming."
        confirmLabel="Leave"
      />
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        getUrl={makeShareUrl}
        title="Share this plan"
        subtitle={`Invite friends to ${plan.place.name}.`}
      />
    </OverlayScreen>
  );
}
