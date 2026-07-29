import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useListDetail, useUpdateList, useDeleteList, useRemoveFromList, useShareList } from '../hooks/useLists';
import { Spinner, EmptyState, ConfirmSheet, Avatar } from '../components/ui';
import { ShareSheet } from '../components/ui/ShareSheet';
import { ListEditor } from '../components/lists/ListEditor';

export default function ListPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { data: list, isLoading, isError } = useListDetail(listId);
  const update = useUpdateList(listId ?? '');
  const del = useDeleteList();
  const removePlace = useRemoveFromList(listId ?? '');
  const share = useShareList();

  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  }
  if (isError || !list) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <EmptyState title="This list isn’t available" hint="It may be private or no longer exist."
          action={<Link to="/map" className="text-sm text-indigo-500">Back to map</Link>} />
      </div>
    );
  }

  const isOwner = list.is_owner;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-md p-6">
        <button onClick={() => navigate(-1)} className="mb-4 text-sm text-slate-400 hover:text-slate-600">← Back</button>

        <div className="mb-1 flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">{list.name}</h1>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            list.visibility === 'public'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
              : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'
          }`}>
            {list.visibility === 'public' ? '🌎 Public' : '🔒 Private'}
          </span>
        </div>
        {list.owner && (
          <button onClick={() => navigate(`/u/${list.owner!.handle}`)} className="mb-2 flex items-center gap-2">
            <Avatar user={list.owner} size={20} />
            <span className="text-sm text-slate-500 dark:text-zinc-400">@{list.owner.handle}</span>
          </button>
        )}
        {list.description && <p className="mb-3 text-sm text-slate-700 dark:text-zinc-300">{list.description}</p>}

        {isOwner && (
          <div className="mb-5 flex flex-wrap gap-2">
            <button onClick={() => setEditOpen(true)} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">Edit</button>
            <button
              onClick={() => update.mutate({ visibility: list.visibility === 'public' ? 'private' : 'public' })}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              Make {list.visibility === 'public' ? 'private' : 'public'}
            </button>
            {list.visibility === 'public' && (
              <button onClick={() => setShareOpen(true)} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">Share</button>
            )}
            {!list.is_default && (
              <button onClick={() => setConfirmDelete(true)} className="rounded-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Delete</button>
            )}
          </div>
        )}

        {list.places.length === 0 ? (
          <EmptyState title="No places in this list yet" hint={isOwner ? 'Open a place and “Add to list”.' : undefined} />
        ) : (
          <div className="space-y-1.5">
            {list.places.map((p) => (
              <div key={p.place_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-zinc-900">
                <button onClick={() => navigate(`/places/${p.place_id}`)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm text-slate-800 dark:text-zinc-200">{p.name}</span>
                  {p.category && <span className="text-xs capitalize text-slate-400">{p.category}</span>}
                </button>
                {isOwner && (
                  <button
                    onClick={() => removePlace.mutate(p.place_id)}
                    aria-label="Remove from list"
                    className="ml-2 shrink-0 text-slate-300 hover:text-red-500 dark:text-zinc-600"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ListEditor
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit list"
        initial={{ name: list.name, description: list.description ?? '', visibility: list.visibility }}
        submitting={update.isPending}
        onSubmit={(draft) => update.mutate(draft, { onSuccess: () => setEditOpen(false) })}
      />
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        getUrl={async () => {
          const r = await share.mutateAsync(list.id);
          return `${window.location.origin}/invite/${r.token}`;
        }}
        title="Share this list"
        subtitle={`Anyone with the link can see “${list.name}”.`}
      />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate(list.id, { onSuccess: () => navigate(-1) })}
        title="Delete this list?"
        body="The list is removed, but the places stay saved and in any other lists."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
