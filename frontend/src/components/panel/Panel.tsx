import { useNavigate } from 'react-router-dom';
import { usePanel } from '../../hooks/usePanel';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { PanelCard } from './PanelCard';
import { EmptyState, Avatar } from '../ui';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'plans', label: 'Plans' },
  { key: 'places', label: 'Places' },
  { key: 'hide_notifications', label: 'Hide alerts' },
] as const;

export function Panel() {
  const { data, isLoading } = usePanel();
  const { activeFilter, setActiveFilter, darkMode, toggleDarkMode, mobilePanelOpen, setMobilePanelOpen } =
    useUIStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const cards = data?.cards ?? [];
  const meta = data?.meta;

  function emptyContent() {
    if (meta && meta.saved_count === 0 && meta.friend_count === 0) {
      return (
        <EmptyState
          title="Welcome to Hyperlocal"
          hint="Search for a place to save it, or find friends by their handle."
        />
      );
    }
    if (meta && meta.friend_count === 0) {
      return <EmptyState title="No friends yet" hint="Follow people by their handle to see their plans here." />;
    }
    return <EmptyState title="Nothing nearby yet" hint="Save a place or create a plan to get started." />;
  }

  return (
    <>
      {/* Mobile: dim the map when the sheet is expanded; tap to collapse. */}
      <div
        className={`sm:hidden fixed inset-0 z-20 bg-black/20 transition-opacity duration-200 ${
          mobilePanelOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobilePanelOpen(false)}
      />

      <div
        className={`
          flex flex-col bg-white dark:bg-zinc-900
          fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:border-zinc-800
          transition-[height] duration-300 ease-out
          ${mobilePanelOpen ? 'h-[82vh]' : 'h-[76px]'}
          sm:static sm:z-auto sm:inset-auto sm:h-full sm:w-96 sm:max-w-full sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none
        `}
      >
        {/* Mobile-only grab handle / toggle */}
        <button
          onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
          aria-label={mobilePanelOpen ? 'Collapse panel' : 'Expand panel'}
          className="flex shrink-0 flex-col items-center gap-1 pb-2 pt-2.5 sm:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-zinc-600" />
          {!mobilePanelOpen && (
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Plans &amp; places nearby</span>
          )}
        </button>

        {/* Full panel content: hidden on mobile while collapsed, always shown on desktop. */}
        <div className={`${mobilePanelOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col sm:flex`}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-zinc-800">
            <button onClick={() => navigate('/map')} className="font-bold text-slate-900 dark:text-zinc-100">
              Hyperlocal
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleDarkMode}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-sm"
                title="Toggle theme"
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              <button onClick={() => navigate(`/u/${user?.handle ?? ''}`)} title="Your profile">
                <Avatar user={user} size={28} />
              </button>
            </div>
          </div>

          <div className="flex gap-2 p-3 border-b border-slate-100 dark:border-zinc-800 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  activeFilter === f.key
                    ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="space-y-3 p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                ))}
              </div>
            )}
            {!isLoading && cards.length === 0 && emptyContent()}
            {!isLoading && cards.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {cards.map((card) => (
                  <PanelCard
                    key={
                      card.type === 'notification'
                        ? `n-${card.id}`
                        : card.type === 'plan'
                          ? `pl-${card.plan_id}`
                          : `pc-${card.place_id}-${card.source}`
                    }
                    card={card}
                  />
                ))}
              </div>
            )}
            {meta && meta.sorted_by === 'recency' && cards.length > 0 && (
              <p className="text-[11px] text-slate-400 dark:text-zinc-600 px-3 py-2">
                Location off — sorted by recent. Enable location for nearby ordering.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
