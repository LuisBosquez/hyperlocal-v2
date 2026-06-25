import { useNavigate } from 'react-router-dom';
import type { PlaceCardData } from '../../types/api';
import { useMapStore } from '../../store/mapStore';
import { formatDistance } from '../../lib/format';

export function PlaceCard({ card }: { card: PlaceCardData }) {
  const navigate = useNavigate();
  const setSelectedPlace = useMapStore((s) => s.setSelectedPlace);

  return (
    <button
      className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
      onClick={() => {
        setSelectedPlace(card.place_id);
        navigate(`/places/${card.place_id}`);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{card.name}</p>
            {card.source === 'friend' && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-indigo-500 dark:text-indigo-400">friend</span>
            )}
            {card.source === 'contextual' && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-500">suggested</span>
            )}
          </div>
          {card.category && <p className="text-xs text-slate-400 dark:text-zinc-500 capitalize">{card.category}</p>}
          {card.saved_by_handle && (
            <p className="text-xs text-indigo-500 dark:text-indigo-400">saved by @{card.saved_by_handle}</p>
          )}
          {card.note && <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5 italic truncate">“{card.note}”</p>}
        </div>
        {card.distance_meters != null && (
          <span className="shrink-0 text-xs text-slate-400 dark:text-zinc-500">{formatDistance(card.distance_meters)}</span>
        )}
      </div>
    </button>
  );
}
