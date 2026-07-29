import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { Sheet, Spinner, toast } from '../ui';
import { ListEditor } from './ListEditor';
import { useMyLists, useAddToList, useRemoveFromList, useCreateList } from '../../hooks/useLists';

/** Flow 18: pick which Lists a place belongs to. Toggling a list adds/removes the
 * place immediately; "New list" creates one and drops the place in it. */
export function AddToListSheet({
  open,
  onClose,
  placeId,
}: {
  open: boolean;
  onClose: () => void;
  placeId: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useMyLists(open ? placeId : undefined);
  const createList = useCreateList();
  const [editorOpen, setEditorOpen] = useState(false);
  const lists = data?.items ?? [];

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Add to a list">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5 text-slate-400" />
          </div>
        ) : (
          <div className="space-y-1.5">
            {lists.map((l) => (
              <ListRow key={l.id} listId={l.id} placeId={placeId} name={l.name} isDefault={l.is_default}
                visibility={l.visibility} checked={!!l.contains_place} />
            ))}
            <button
              onClick={() => setEditorOpen(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="text-lg leading-none">＋</span> New list
            </button>
            {/* Affirmative close (spec §9): saving shouldn't require hunting for the ✕. */}
            <button
              onClick={() => {
                toast.success('Lists updated.');
                onClose();
              }}
              className="mt-3 w-full rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save
            </button>
          </div>
        )}
      </Sheet>

      <ListEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="New list"
        submitting={createList.isPending}
        onSubmit={(draft) =>
          createList.mutate(draft, {
            onSuccess: async (created) => {
              await api.put(`/lists/${created.id}/places/${placeId}`).catch(() => {});
              qc.invalidateQueries({ queryKey: queryKeys.myListsAll() });
              setEditorOpen(false);
            },
          })
        }
      />
    </>
  );
}

function ListRow({
  listId,
  placeId,
  name,
  isDefault,
  visibility,
  checked,
}: {
  listId: string;
  placeId: string;
  name: string;
  isDefault: boolean;
  visibility: 'public' | 'private';
  checked: boolean;
}) {
  const [on, setOn] = useState(checked);
  const add = useAddToList(listId);
  const remove = useRemoveFromList(listId);
  const busy = add.isPending || remove.isPending;

  function toggle() {
    const next = !on;
    setOn(next);
    if (next) add.mutate(placeId, { onError: () => setOn(false) });
    else remove.mutate(placeId, { onError: () => setOn(true) });
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-zinc-800"
    >
      <span className="flex items-center gap-2 text-sm text-slate-800 dark:text-zinc-200">
        {name}
        {isDefault && <span className="text-[10px] text-slate-400">default</span>}
        {visibility === 'public' && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">public</span>}
      </span>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
          on
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 text-transparent dark:border-zinc-600'
        }`}
      >
        ✓
      </span>
    </button>
  );
}
