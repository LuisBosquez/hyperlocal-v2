import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlaceSearch, useCitySearch } from '../../hooks/usePlaces';
import { useUserSearch } from '../../hooks/useFollows';
import { useMapStore, type BBox } from '../../store/mapStore';
import { formatDistance } from '../../lib/format';
import { Spinner, Avatar } from '../ui';
import type { CategoryGroup, CityResult, Place } from '../../types/api';

const CATEGORY_ICONS: Record<string, string> = {
  coffee: '☕', restaurant: '🍽️', bar: '🍸', park: '🌳',
  museum: '🖼️', library: '📚', bookstore: '📖',
};

/** Fit-bounds bbox for a set of points, padded so pins aren't on the edge. */
function bboxOf(places: { lat: number; lng: number }[]): BBox {
  const lats = places.map((p) => p.lat);
  const lngs = places.map((p) => p.lng);
  const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.25, 0.004);
  const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.25, 0.004);
  return [Math.min(...lngs) - padLng, Math.min(...lats) - padLat, Math.max(...lngs) + padLng, Math.max(...lats) + padLat];
}

export function SearchBar() {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const center = useMapStore((s) => s.center);
  const remoteCity = useMapStore((s) => s.remoteCity);
  const flyTo = useMapStore((s) => s.flyTo);
  const fitBounds = useMapStore((s) => s.fitBounds);
  const setHighlight = useMapStore((s) => s.setHighlight);
  const enterRemoteCity = useMapStore((s) => s.enterRemoteCity);
  const [lng, lat] = center;

  // Debounce 300ms (tech/06)
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 300);
    return () => clearTimeout(t);
  }, [raw]);

  const isHandle = raw.startsWith('@');
  const places = usePlaceSearch(isHandle ? '' : q, lat, lng);
  const users = useUserSearch(isHandle ? q.slice(1) : '');
  const cities = useCitySearch(isHandle ? '' : q);

  const loading = places.isFetching || users.isFetching;
  const groups = places.data?.groups ?? [];
  // Don't offer "plan ahead in Seattle" while already browsing Seattle.
  const cityResults = (cities.data?.results ?? []).filter((c) => c.name !== remoteCity?.name);

  function reset() {
    setOpen(false);
    setRaw('');
  }

  function pickPlace(p: Place) {
    // Search results are tied to the map (spec §3): fly there, then open detail.
    flyTo([p.lng, p.lat], 15);
    navigate(`/places/${p.place_id}`);
    reset();
  }

  function pickGroup(gr: CategoryGroup) {
    // Highlight all (up to 5) places and fit the viewport around them — the map
    // zooms out as far as needed (MD-3).
    setHighlight({
      label: gr.label,
      places: gr.places.map((p) => ({ place_id: p.place_id, name: p.name, lat: p.lat, lng: p.lng })),
    });
    if (gr.places.length > 0) fitBounds(bboxOf(gr.places));
    reset();
  }

  function pickCity(c: CityResult) {
    // Change-location mode (spec §4): re-scope everything to the city;
    // contextual recommendations pause — this is planning ahead.
    enterRemoteCity(c);
    reset();
  }

  return (
    <div className="relative">
      <input
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={
          remoteCity
            ? `Search places in ${remoteCity.name}…`
            : 'Try “coffee near me”, a city, or @handle'
        }
        className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      {open && q.length > 1 && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 p-3 text-sm text-slate-400">
              <Spinner /> Searching…
            </div>
          )}

          {/* Different city → switch the whole search context (spec §4) */}
          {!isHandle && cityResults.length > 0 && (
            <div className="border-b border-slate-100 dark:border-zinc-800">
              {cityResults.map((c) => (
                <button
                  key={`${c.name}-${c.region}`}
                  onClick={() => pickCity(c)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                >
                  <span className="text-base">🧭</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-indigo-700 dark:text-indigo-300">
                      Plan ahead in {c.name}
                    </span>
                    <span className="block text-xs text-slate-400">{c.region} · browse for a future plan</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Category groups: up to 5 nearby, shown together on the map (spec §3) */}
          {!isHandle &&
            groups.map((gr) => (
              <button
                key={gr.category}
                onClick={() => pickGroup(gr)}
                className="flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left hover:bg-amber-50 dark:border-zinc-800 dark:hover:bg-amber-950/30"
              >
                <span className="text-base">{CATEGORY_ICONS[gr.category] ?? '📍'}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 dark:text-zinc-200">{gr.label}</span>
                  <span className="block text-xs text-slate-400">
                    {gr.places.length} spot{gr.places.length === 1 ? '' : 's'} · show on map
                  </span>
                </span>
              </button>
            ))}

          {isHandle &&
            (users.data ?? []).map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  navigate(`/u/${u.handle}`);
                  reset();
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800"
              >
                <Avatar user={u} size={28} />
                <div>
                  <p className="text-sm text-slate-900 dark:text-zinc-100">@{u.handle}</p>
                  <p className="text-xs text-slate-400">{u.display_name}</p>
                </div>
              </button>
            ))}
          {!isHandle &&
            (places.data?.results ?? []).map((p) => (
              <button
                key={p.place_id}
                onClick={() => pickPlace(p)}
                className="flex items-center justify-between gap-2 w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 dark:text-zinc-100 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 truncate">{p.address}</p>
                  {p.match?.kind === 'note' && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-500 truncate">
                      ❝ {p.match.note_source === 'own' ? 'matched your note' : `matched @${p.match.note_handle}'s note`}
                    </p>
                  )}
                </div>
                {p.distance_meters != null && (
                  <span className="shrink-0 text-xs text-slate-400">{formatDistance(p.distance_meters)}</span>
                )}
              </button>
            ))}
          {!loading &&
            ((isHandle && (users.data?.length ?? 0) === 0) ||
              (!isHandle &&
                (places.data?.results.length ?? 0) === 0 &&
                groups.length === 0 &&
                cityResults.length === 0)) && (
              <div className="p-3 text-sm text-slate-400">
                {isHandle ? `No one matching ${q}` : `No places found for “${q}”`}
              </div>
            )}
          {!isHandle && places.data?.degraded && (
            <p className="px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-500">
              Showing saved matches — live search is unavailable right now.
            </p>
          )}
        </div>
      )}
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}
    </div>
  );
}
