import type { NotificationCardData } from '../../types/api';

export function NotificationCard({ card }: { card: NotificationCardData }) {
  return (
    <div className="p-3">
      <p className="text-sm text-slate-700 dark:text-zinc-300 font-medium">{card.event_type}</p>
      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
        {new Date(card.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}
