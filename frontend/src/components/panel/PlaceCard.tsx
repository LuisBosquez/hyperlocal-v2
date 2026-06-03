import type { PlaceCardData } from '../../types/api';

export function PlaceCard({ card }: { card: PlaceCardData }) {
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{card.name}</p>
          {card.saved_by_handle && (
            <p className="text-xs text-slate-500 dark:text-zinc-500">saved by @{card.saved_by_handle}</p>
          )}
          {card.note && (
            <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5 italic truncate">"{card.note}"</p>
          )}
        </div>
        {card.distance_meters != null && (
          <span className="shrink-0 text-xs text-slate-400 dark:text-zinc-500">
            {card.distance_meters < 1000
              ? `${card.distance_meters}m`
              : `${(card.distance_meters / 1000).toFixed(1)}km`}
          </span>
        )}
      </div>
      <span className="mt-1 inline-block text-xs text-slate-400 dark:text-zinc-500 capitalize">{card.source}</span>
    </div>
  );
}
