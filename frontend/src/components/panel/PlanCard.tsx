import { useNavigate } from 'react-router-dom';
import type { PlanCardData } from '../../types/api';
import { usePanelToggleInterest, usePanelJoin } from '../../hooks/usePanel';
import { formatPlanWhen } from '../../lib/format';
import { Avatar } from '../ui';

export function PlanCard({ card }: { card: PlanCardData }) {
  const navigate = useNavigate();
  const toggleInterest = usePanelToggleInterest();
  const join = usePanelJoin();

  return (
    <div className="p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
      <button className="flex items-start gap-2 w-full text-left" onClick={() => navigate(`/plans/${card.plan_id}`)}>
        <Avatar user={{ handle: card.organizer_handle, avatar_url: card.organizer_avatar_url }} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{card.place_name}</p>
            {card.role === 'organizer' && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-zinc-500">yours</span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-500">
            {card.role === 'organizer' ? 'You' : `@${card.organizer_handle}`} ·{' '}
            {formatPlanWhen(card.plan_date, card.plan_time, card.state, card.plan_time_band)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {card.is_cancelled && (
              <span className="text-[11px] bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                Cancelled by organizer
              </span>
            )}
            {card.is_unconfirmed && !card.is_cancelled && (
              <span className="text-[11px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                Time unconfirmed
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {card.role === 'organizer' && !card.is_cancelled && card.has_pending_proposal && (
          <button
            onClick={() => navigate(`/plans/${card.plan_id}`)}
            className="text-xs px-3 py-1 bg-indigo-600 text-white rounded-full hover:bg-indigo-700"
          >
            Review proposals
          </button>
        )}
        {card.role === 'organizer' && !card.is_cancelled && !card.has_pending_proposal && card.state !== 'confirmed' && (
          <button
            onClick={() => navigate(`/plans/${card.plan_id}`)}
            className="text-xs px-3 py-1 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full"
          >
            Add time
          </button>
        )}
        {card.role === 'friend' && !card.is_cancelled && (
          <>
            <button
              disabled={toggleInterest.isPending}
              onClick={() => toggleInterest.mutate({ planId: card.plan_id, interested: !card.viewer_is_interested })}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                card.viewer_is_interested
                  ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              {card.viewer_is_interested ? 'Interested ✓' : 'Interested'}
            </button>
            {!card.viewer_has_joined ? (
              <button
                disabled={join.isPending}
                onClick={() => join.mutate({ planId: card.plan_id })}
                className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-full hover:bg-emerald-700"
              >
                Join
              </button>
            ) : (
              <span className="text-xs px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-full">
                Joined ✓
              </span>
            )}
          </>
        )}
        <span className="text-xs text-slate-400 dark:text-zinc-500 ml-auto">
          {card.interest_count > 0 && `${card.interest_count} interested`}
          {card.interest_count > 0 && card.join_count > 0 && ' · '}
          {card.join_count > 0 && `${card.join_count} going`}
        </span>
      </div>
    </div>
  );
}
