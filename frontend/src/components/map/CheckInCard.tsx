import { useNavigate } from 'react-router-dom';
import { useMapStore } from '../../store/mapStore';
import { useMySavedPlaces, useAreaLabel } from '../../hooks/usePlaces';
import { formatDistance } from '../../lib/format';
import type { Place } from '../../types/api';

function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

const NEARBY_M = 2500; // "around here" when the area has no explicit bbox

/** Check-in context (spec §5): whenever the scoped area lands somewhere the user
 * has saved places — physically (locate-me) or virtually (search-this-area /
 * city switch) — their own saves lead and system suggestions step back. */
export function useCheckIn() {
  const [lng, lat] = useMapStore((s) => s.scopedCenter);
  const scopedBbox = useMapStore((s) => s.scopedBbox);
  const remoteCity = useMapStore((s) => s.remoteCity);
  const { data: saves } = useMySavedPlaces();
  const { data: area } = useAreaLabel();

  const savedHere = (saves ?? [])
    .map((p) => ({ ...p, distance_meters: distM(lat, lng, p.lat, p.lng) }))
    .filter((p) =>
      scopedBbox
        ? p.lng >= scopedBbox[0] && p.lat >= scopedBbox[1] && p.lng <= scopedBbox[2] && p.lat <= scopedBbox[3]
        : (p.distance_meters ?? Infinity) <= NEARBY_M,
    )
    .sort((a, b) => (a.distance_meters ?? 0) - (b.distance_meters ?? 0));

  const label = remoteCity?.name ?? area?.area_label ?? 'here';
  return { active: savedHere.length > 0, label, savedHere };
}

export function CheckInCard({
  label,
  savedHere,
  suggestionsVisible,
  onToggleSuggestions,
  remote,
}: {
  label: string;
  savedHere: Place[];
  suggestionsVisible: boolean;
  onToggleSuggestions: () => void;
  remote: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div>
      <p className="mb-1.5 text-xs text-slate-600 dark:text-zinc-300">
        📌 You've saved {savedHere.length} spot{savedHere.length === 1 ? '' : 's'} around{' '}
        <span className="font-medium">{label}</span>
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {savedHere.slice(0, 5).map((p) => (
          <button
            key={p.place_id}
            onClick={() => navigate(`/places/${p.place_id}`)}
            className="shrink-0 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-left hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
          >
            <span className="block text-xs text-slate-700 dark:text-zinc-200">{p.name}</span>
            <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-zinc-500">
              {p.note ? `❝ ${p.note}` : p.distance_meters != null ? `${formatDistance(p.distance_meters)} away` : p.category}
            </span>
          </button>
        ))}
      </div>
      {/* System suggestions politely step aside here (spec §5, MD-1). */}
      {!remote && (
        <button
          onClick={onToggleSuggestions}
          className="mt-1 text-[11px] text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          {suggestionsVisible ? 'Hide suggestions' : 'Want a few fresh ideas too?'}
        </button>
      )}
    </div>
  );
}
