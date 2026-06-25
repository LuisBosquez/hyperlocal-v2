import { useNavigate } from 'react-router-dom';
import type { NotificationCardData } from '../../types/api';
import { useDismissNotification } from '../../hooks/usePanel';
import { useFollow } from '../../hooks/useFollows';

function describe(card: NotificationCardData): { text: string; href?: string; followBack?: string } {
  const d = card.payload;
  const handle = d.follower_handle as string | undefined;
  switch (card.event_type) {
    case 'new_follower':
      return { text: `@${handle ?? 'Someone'} followed you`, href: handle ? `/u/${handle}` : undefined, followBack: handle };
    case 'follow_back_prompt':
      return { text: `@${handle ?? 'Someone'} followed you back — you're friends now`, href: handle ? `/u/${handle}` : undefined };
    case 'plan_time_updated':
      return { text: `${d.place_name ?? 'A plan'} now has a time`, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    case 'plan_reminder_day_before':
      return { text: `Tomorrow: ${d.place_name ?? 'your plan'}`, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    case 'plan_reminder_morning':
      return { text: `Today: ${d.place_name ?? 'your plan'}`, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    case 'plan_date_passed':
      return { text: `Your plan for ${d.place_name ?? 'a place'} never got a time — still want to go?`, href: d.place_id ? `/places/${d.place_id}` : undefined };
    case 'friend_joined_plan':
      return { text: `@${d.joiner_handle ?? 'A friend'} joined your plan`, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    case 'plan_cancelled':
      return { text: `${d.place_name ?? 'A plan'} was cancelled by the organizer`, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    case 'plan_time_proposed': {
      const n = (d.option_count as number) ?? 0;
      return { text: `@${d.proposer_handle ?? 'A friend'} proposed ${n} time${n === 1 ? '' : 's'} for ${d.place_name ?? 'your plan'}`, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    }
    case 'plan_proposal_accepted':
      return { text: `${d.place_name ?? 'A plan'} is set — your proposed time was picked`, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    case 'plan_proposal_declined': {
      const reason = d.reason as string | undefined;
      const place = d.place_name ?? 'a plan';
      const text =
        reason === 'expired' ? `Your proposed times for ${place} expired`
        : reason === 'organizer_set_time' ? `${place} now has a time`
        : `Your proposed times for ${place} didn’t work out — propose again?`;
      return { text, href: d.plan_id ? `/plans/${d.plan_id}` : undefined };
    }
    default:
      return { text: card.event_type };
  }
}

export function NotificationCard({ card }: { card: NotificationCardData }) {
  const navigate = useNavigate();
  const dismiss = useDismissNotification();
  const follow = useFollow();
  const { text, href, followBack } = describe(card);

  return (
    <div className="p-3 bg-indigo-50/40 dark:bg-indigo-950/20">
      <div className="flex items-start gap-2">
        <span className="text-indigo-500 mt-0.5">•</span>
        <button className="flex-1 text-left" disabled={!href} onClick={() => href && navigate(href)}>
          <p className="text-sm text-slate-700 dark:text-zinc-200">{text}</p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
            {new Date(card.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </button>
      </div>
      <div className="flex gap-2 mt-2 ml-5">
        {followBack && (
          <button
            onClick={() => {
              follow.mutate(followBack);
              dismiss.mutate(card.id);
            }}
            className="text-xs px-3 py-1 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full"
          >
            Follow back
          </button>
        )}
        <button
          onClick={() => dismiss.mutate(card.id)}
          className="text-xs px-3 py-1 text-slate-500 dark:text-zinc-400 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
