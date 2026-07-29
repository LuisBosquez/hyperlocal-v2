import { useEffect, useState } from 'react';
import { Sheet } from '../ui';

export interface ListDraft {
  name: string;
  description: string;
  visibility: 'public' | 'private';
}

/** Create or edit a List (Flow 17): name, description, visibility. */
export function ListEditor({
  open,
  onClose,
  initial,
  title,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ListDraft>;
  title: string;
  submitting?: boolean;
  onSubmit: (draft: ListDraft) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setVisibility(initial?.visibility ?? 'private');
    }
  }, [open, initial?.name, initial?.description, initial?.visibility]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 80))}
            placeholder="e.g. Rainy day spots"
            className="mt-1 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-zinc-400">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 280))}
            rows={2}
            placeholder="What ties these places together?"
            className="mt-1 w-full resize-none rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="flex gap-2">
          {(['private', 'public'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${
                visibility === v
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-slate-200 text-slate-600 dark:border-zinc-700 dark:text-zinc-300'
              }`}
            >
              {v === 'public' ? '🌎 Public' : '🔒 Private'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-zinc-500">
          {visibility === 'public'
            ? 'Anyone can see this list on your profile.'
            : 'Only you can see this list.'}
        </p>
        <button
          disabled={!name.trim() || submitting}
          onClick={() => onSubmit({ name: name.trim(), description, visibility })}
          className="w-full rounded-full bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save list
        </button>
      </div>
    </Sheet>
  );
}
