import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlaceSearch } from '../../hooks/usePlaces';
import { useUserSearch } from '../../hooks/useFollows';
import { useMapStore } from '../../store/mapStore';
import { formatDistance } from '../../lib/format';
import { Spinner, Avatar } from '../ui';

export function SearchBar() {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { center } = useMapStore();
  const [lng, lat] = center;

  // Debounce 300ms (tech/06)
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 300);
    return () => clearTimeout(t);
  }, [raw]);

  const isHandle = raw.startsWith('@');
  const places = usePlaceSearch(isHandle ? '' : q, lat, lng);
  const users = useUserSearch(isHandle ? q.slice(1) : '');

  const loading = places.isFetching || users.isFetching;

  return (
    <div className="relative">
      <input
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search places, or @handle for people"
        className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      {open && q.length > 1 && (
        <div className="absolute z-30 mt-1 w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 p-3 text-sm text-slate-400">
              <Spinner /> Searching…
            </div>
          )}
          {isHandle &&
            (users.data ?? []).map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  navigate(`/u/${u.handle}`);
                  setOpen(false);
                  setRaw('');
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
                onClick={() => {
                  navigate(`/places/${p.place_id}`);
                  setOpen(false);
                  setRaw('');
                }}
                className="flex items-center justify-between gap-2 w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 dark:text-zinc-100 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 truncate">{p.address}</p>
                </div>
                {p.distance_meters != null && (
                  <span className="shrink-0 text-xs text-slate-400">{formatDistance(p.distance_meters)}</span>
                )}
              </button>
            ))}
          {!loading &&
            ((isHandle && (users.data?.length ?? 0) === 0) ||
              (!isHandle && (places.data?.results.length ?? 0) === 0)) && (
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
