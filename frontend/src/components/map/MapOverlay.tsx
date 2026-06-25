import { SearchBar } from '../panel/SearchBar';
import { ContextualStrip } from '../panel/ContextualStrip';

/** Floating, horizontally-centered card over the top of the map holding the
 * search bar and the contextual recommendations strip. Popped out of The Panel
 * so the map stays the primary surface (mobile + desktop). The wrapper is
 * click-through; only the card itself captures pointer events so the user can
 * still pan the map around it. */
export function MapOverlay() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-3 pt-3">
      <div className="pointer-events-auto w-full max-w-md space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <SearchBar />
        <ContextualStrip />
      </div>
    </div>
  );
}
