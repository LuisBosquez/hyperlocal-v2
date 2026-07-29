import { useEffect, useState } from 'react';
import { SearchBar } from '../panel/SearchBar';
import { ContextualStrip } from '../panel/ContextualStrip';
import { CheckInCard, useCheckIn } from './CheckInCard';
import { useMapStore } from '../../store/mapStore';

/** Floating, horizontally-centered card over the top of the map holding the
 * search bar, mode banners, and the discovery strips. Popped out of The Panel
 * so the map stays the primary surface (mobile + desktop). The wrapper is
 * click-through; only the card itself captures pointer events so the user can
 * still pan the map around it. */
export function MapOverlay() {
  const remoteCity = useMapStore((s) => s.remoteCity);
  const highlight = useMapStore((s) => s.highlight);
  const setHighlight = useMapStore((s) => s.setHighlight);
  const exitRemoteCity = useMapStore((s) => s.exitRemoteCity);
  const checkIn = useCheckIn();
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fresh area → suggestions collapse again behind the friendly opt-in.
  useEffect(() => setShowSuggestions(false), [checkIn.label]);

  // MD-1/MD-2: contextual recommendations pause in remote mode, and step back
  // (opt-in) when the check-in card is showing the user's own saves.
  const showContextual = !remoteCity && (!checkIn.active || showSuggestions);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-3 pt-3">
      <div className="pointer-events-auto w-full max-w-md space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <SearchBar />

        {/* Remote-city planning mode (spec §4) */}
        {remoteCity && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 dark:border-indigo-900/40 dark:bg-indigo-950/30">
            <p className="min-w-0 truncate text-xs text-indigo-700 dark:text-indigo-300">
              🧭 Browsing <span className="font-semibold">{remoteCity.name}</span> — planning ahead
            </p>
            <button
              onClick={exitRemoteCity}
              className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
            >
              Back to my area
            </button>
          </div>
        )}

        {/* Category-search highlight (spec §3) */}
        {highlight && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/30">
            <p className="min-w-0 truncate text-xs text-rose-700 dark:text-rose-300">
              📍 {highlight.label} · {highlight.places.length} spot{highlight.places.length === 1 ? '' : 's'} on the map
            </p>
            <button
              onClick={() => setHighlight(null)}
              aria-label="Clear search results"
              className="shrink-0 text-rose-400 hover:text-rose-600 dark:hover:text-rose-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Check-in: your saved places lead when you land somewhere (spec §5) */}
        {checkIn.active && (
          <CheckInCard
            label={checkIn.label}
            savedHere={checkIn.savedHere}
            suggestionsVisible={showSuggestions}
            onToggleSuggestions={() => setShowSuggestions((v) => !v)}
            remote={!!remoteCity}
          />
        )}

        {showContextual && <ContextualStrip />}
      </div>
    </div>
  );
}
