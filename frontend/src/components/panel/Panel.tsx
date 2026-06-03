import { usePanel } from '../../hooks/usePanel';
import { useUIStore } from '../../store/uiStore';
import { PanelCard } from './PanelCard';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'plans', label: 'Plans' },
  { key: 'places', label: 'Places' },
  { key: 'hide_notifications', label: 'Hide alerts' },
] as const;

export function Panel() {
  const { data: cards, isLoading } = usePanel();
  const { activeFilter, setActiveFilter } = useUIStore();

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-zinc-800 w-80">
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
        {!isLoading && (!cards || cards.length === 0) && (
          <div className="flex items-center justify-center h-32 text-slate-400 dark:text-zinc-500 text-sm px-4 text-center">
            Nothing yet — try saving a place or following a friend.
          </div>
        )}
        {!isLoading && cards && cards.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {cards.map((card) => (
              <PanelCard key={'id' in card ? card.id : 'plan_id' in card ? card.plan_id : card.place_id} card={card} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
