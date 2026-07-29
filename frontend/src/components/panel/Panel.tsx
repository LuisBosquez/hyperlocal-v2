import { useNavigate } from 'react-router-dom';
import { usePanel } from '../../hooks/usePanel';
import { useMySignal, useSetSignal } from '../../hooks/useSignal';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { PanelCard } from './PanelCard';
import { EmptyState, Avatar } from '../ui';
import type { PanelCard as PanelCardType } from '../../types/api';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'plans', label: 'Plans' },
  { key: 'places', label: 'Places' },
  { key: 'hide_notifications', label: 'Hide alerts' },
] as const;

function cardKey(card: PanelCardType): string {
  return card.type === 'notification'
    ? `n-${card.id}`
    : card.type === 'plan'
      ? `pl-${card.plan_id}`
      : `pc-${card.place_id}-${card.source}`;
}

function Section({ title, cards }: { title: string; cards: PanelCardType[] }) {
  if (cards.length === 0) return null;
  return (
    <div>
      <p className="sticky top-0 z-10 bg-white/95 px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur dark:bg-zinc-900/95 dark:text-zinc-500">
        {title}
      </p>
      <div className="divide-y divide-slate-100 dark:divide-zinc-800">
        {cards.map((card) => (
          <PanelCard key={cardKey(card)} card={card} />
        ))}
      </div>
    </div>
  );
}

/** "I'm down for plans today" (spec §8) — a visible, friendly toggle. */
function OpenToPlansRow() {
  const { data } = useMySignal();
  const setSignal = useSetSignal();
  const on = data?.open_to_plans ?? false;
  return (
    <button
      onClick={() => setSignal.mutate(!on)}
      disabled={setSignal.isPending}
      className={`mx-3 mt-2 flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
        on
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:bg-zinc-800'
      }`}
    >
      <span className="text-xs font-medium text-slate-700 dark:text-zinc-200">
        {on ? "⚡ You're down for plans today" : '⚡ Down for plans today?'}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function Panel() {
  const { data, isLoading } = usePanel();
  const {
    activeFilter, setActiveFilter, darkMode, toggleDarkMode,
    mobilePanelOpen, setMobilePanelOpen, desktopPanelOpen, toggleDesktopPanel,
  } = useUIStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const cards = data?.cards ?? [];
  const meta = data?.meta;

  // Sectioned for scanability (spec §9): user-generated objects only — the
  // server never sends system recommendations here (MD-1).
  const notifications = cards.filter((c) => c.type === 'notification');
  const plans = cards.filter((c) => c.type === 'plan');
  const friendPlans = plans.filter((c) => c.type === 'plan' && c.role !== 'organizer');
  const myPlans = plans.filter((c) => c.type === 'plan' && c.role === 'organizer');
  const friendPlaces = cards.filter((c) => c.type === 'place' && c.source === 'friend');
  const myPlaces = cards.filter((c) => c.type === 'place' && c.source === 'own');
  const notificationCount = notifications.length;

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

      {/* Desktop: expand button when the panel is tucked away (spec §9, MD-8). */}
      {!desktopPanelOpen && (
        <button
          onClick={toggleDesktopPanel}
          aria-label="Open panel"
          className="fixed right-4 top-4 z-30 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-sm font-medium text-slate-700 shadow-lg backdrop-blur hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 sm:flex"
        >
          ☰ Activity
          {notificationCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
              {notificationCount}
            </span>
          )}
        </button>
      )}

      <div
        className={`
          flex flex-col bg-white dark:bg-zinc-900
          fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:border-zinc-800
          transition-[height] duration-300 ease-out
          ${mobilePanelOpen ? 'h-[82vh]' : 'h-[76px]'}
          sm:static sm:z-auto sm:inset-auto sm:h-full sm:max-w-full sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none
          ${desktopPanelOpen ? 'sm:flex sm:w-96' : 'sm:hidden'}
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
                onClick={() => navigate('/lists')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-sm"
                title="Your lists"
              >
                📑
              </button>
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
              <button
                onClick={toggleDesktopPanel}
                aria-label="Collapse panel"
                title="Collapse panel"
                className="hidden text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 sm:block"
              >
                »
              </button>
            </div>
          </div>

          <OpenToPlansRow />

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

          <div className="flex-1 overflow-y-auto pb-3">
            {isLoading && (
              <div className="space-y-3 p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                ))}
              </div>
            )}
            {!isLoading && cards.length === 0 && emptyContent()}
            {!isLoading && cards.length > 0 && (
              <>
                <Section title="Notifications" cards={notifications} />
                <Section title="Friends' plans" cards={friendPlans} />
                <Section title="Your plans" cards={myPlans} />
                <Section title="Friends' places" cards={friendPlaces} />
                <Section title="Your places nearby" cards={myPlaces} />
              </>
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
