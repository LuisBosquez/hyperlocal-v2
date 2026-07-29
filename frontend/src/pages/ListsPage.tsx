import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyLists, useCreateList } from '../hooks/useLists';
import { ListEditor } from '../components/lists/ListEditor';
import { Spinner, EmptyState } from '../components/ui';

/** Lists home (spec §5): the place to view, open, and create your saved-places
 * lists — no longer buried in the profile. */
export default function ListsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyLists();
  const createList = useCreateList();
  const [newOpen, setNewOpen] = useState(false);
  const lists = data?.items ?? [];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-md p-6">
        <button onClick={() => navigate('/map')} className="mb-4 text-sm text-slate-400 hover:text-slate-600">
          ← Map
        </button>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Your lists</h1>
          <button
            onClick={() => setNewOpen(true)}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            ＋ New list
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-slate-400" />
          </div>
        )}

        {!isLoading && lists.length === 0 && (
          <EmptyState title="No lists yet" hint="Create one, or save a place — it lands in “Want to Go”." />
        )}

        <div className="space-y-2">
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => navigate(`/lists/${l.id}`)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-zinc-200">
                  {l.name}
                  {l.is_default && <span className="ml-1.5 text-[10px] text-slate-400">default</span>}
                  {l.visibility === 'public' && (
                    <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">public</span>
                  )}
                </span>
                {l.description && (
                  <span className="block truncate text-xs text-slate-400">{l.description}</span>
                )}
              </span>
              <span className="ml-3 shrink-0 text-xs text-slate-400">
                {l.place_count} place{l.place_count === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <ListEditor
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New list"
        submitting={createList.isPending}
        onSubmit={(draft) =>
          createList.mutate(draft, {
            onSuccess: (created) => {
              setNewOpen(false);
              navigate(`/lists/${created.id}`);
            },
          })
        }
      />
    </div>
  );
}
