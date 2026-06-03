import type { PlanCardData } from '../../types/api';
import { useMarkInterested, useRemoveInterest, useJoinPlan, useLeavePlan, useCancelPlan } from '../../hooks/usePlans';

export function PlanCard({ card }: { card: PlanCardData }) {
  const markInterested = useMarkInterested(card.plan_id);
  const removeInterest = useRemoveInterest(card.plan_id);
  const joinPlan = useJoinPlan(card.plan_id);
  const leavePlan = useLeavePlan(card.plan_id);
  const cancelPlan = useCancelPlan(card.plan_id);

  return (
    <div className="p-3">
      <div className="flex items-start gap-2">
        {card.organizer_avatar_url && (
          <img src={card.organizer_avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{card.place_name}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-500">@{card.organizer_handle}</p>
          {card.planned_at && (
            <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
              {new Date(card.planned_at).toLocaleString()}
            </p>
          )}
        </div>
        {card.is_cancelled && (
          <span className="shrink-0 text-xs bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
            Cancelled
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        {card.role === 'organizer' && !card.is_cancelled && (
          <button
            onClick={() => cancelPlan.mutate()}
            className="text-xs text-red-500 hover:underline"
          >
            Cancel plan
          </button>
        )}
        {card.role === 'joiner' && !card.is_cancelled && (
          <button
            onClick={() => leavePlan.mutate()}
            className="text-xs px-3 py-1 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-700"
          >
            Leave
          </button>
        )}
        {card.role === 'friend' && !card.is_cancelled && (
          <>
            <button
              onClick={() =>
                card.requester_is_interested
                  ? removeInterest.mutate()
                  : markInterested.mutate()
              }
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                card.requester_is_interested
                  ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              {card.requester_is_interested ? 'Interested ✓' : 'Interested'}
            </button>
            {!card.requester_has_joined && (
              <button
                onClick={() => joinPlan.mutate()}
                className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-full hover:bg-emerald-700"
              >
                Join
              </button>
            )}
          </>
        )}
        <span className="text-xs text-slate-400 dark:text-zinc-500 ml-auto">
          {card.interest_count} interested · {card.join_count} joining
        </span>
      </div>
    </div>
  );
}
