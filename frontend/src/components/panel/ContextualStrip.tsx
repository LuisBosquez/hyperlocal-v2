import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useContextual, useAreaLabel } from '../../hooks/usePlaces';
import { queryKeys } from '../../lib/queryKeys';
import { formatDistance, closingHint } from '../../lib/format';

/** Flow 12: contextual tagline + a horizontal, scrollable strip of suggested
 * places. The refresh button re-runs the recommendation engine and reloads the
 * map pins. */
export function ContextualStrip() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isFetching } = useContextual();
  const { data: area } = useAreaLabel();

  function refresh() {
    qc.invalidateQueries({ queryKey: queryKeys.contextualAll() });
    qc.invalidateQueries({ queryKey: queryKeys.mapPinsAll() });
  }

  if (!data) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="min-w-0 truncate text-xs text-slate-500 dark:text-zinc-400">
          {data.tagline}
          {area?.area_label && (
            <span className="text-slate-400 dark:text-zinc-500"> · 📍 {area.area_label}</span>
          )}
        </p>
        <button
          onClick={refresh}
          disabled={isFetching}
          aria-label="Refresh recommendations"
          title="Refresh recommendations"
          className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 disabled:opacity-60"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isFetching ? 'animate-spin' : ''}
          >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </button>
      </div>
      {data.results.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {data.results.map((p) => {
            const dist = p.distance_meters != null ? `${formatDistance(p.distance_meters)} away` : null;
            const closing = closingHint(p.opening_hours);
            const hint = [dist, closing].filter(Boolean).join(' · ');
            return (
              <button
                key={p.place_id}
                onClick={() => navigate(`/places/${p.place_id}`)}
                className="shrink-0 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 text-left hover:bg-amber-100 dark:hover:bg-amber-950/50"
              >
                <span className="block text-xs text-slate-700 dark:text-zinc-200">{p.name}</span>
                {hint && <span className="block text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
