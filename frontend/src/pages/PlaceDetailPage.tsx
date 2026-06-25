import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlaceDetail, useSavePlace, useUnsavePlace, useUpdateNote } from '../hooks/usePlaces';
import { useCreatePlan } from '../hooks/usePlans';
import { OverlayScreen } from '../components/layout/OverlayScreen';
import { PlanComposer } from '../components/plan/PlanComposer';
import { Spinner, EmptyState, toast } from '../components/ui';
import { apiError } from '../lib/api';

export default function PlaceDetailPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const navigate = useNavigate();
  const { data: place, isLoading, isError } = usePlaceDetail(placeId ?? null);
  const savePlace = useSavePlace();
  const unsave = useUnsavePlace();
  const updateNote = useUpdateNote();
  const createPlan = useCreatePlan();

  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  const saved = place?.viewer?.is_saved ?? false;

  useEffect(() => {
    if (place?.viewer?.note != null) setNote(place.viewer.note);
  }, [place?.viewer?.note]);

  if (isLoading) {
    return (
      <OverlayScreen>
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-slate-400" />
        </div>
      </OverlayScreen>
    );
  }
  if (isError || !place) {
    return (
      <OverlayScreen title="Place">
        <EmptyState title="This place isn’t available" hint="It may have closed or the link is broken." />
      </OverlayScreen>
    );
  }

  function toggleBookmark() {
    if (!placeId) return;
    if (saved) {
      unsave.mutate(placeId);
      setNoteOpen(false);
    } else {
      // Flow 3.1: bookmark saves immediately AND opens the note section.
      savePlace.mutate({ placeId, note: note || undefined });
      setNoteOpen(true);
      toast.success('Saved');
    }
  }

  function saveNote() {
    if (!placeId) return;
    if (!saved) {
      savePlace.mutate({ placeId, note }, { onSuccess: () => navigate('/map') });
      toast.success('Saved');
    } else {
      updateNote.mutate({ placeId, note });
      toast.success('Note saved');
    }
  }

  function submitPlan(vars: { plan_date: string | null; plan_time: string | null; is_timeless: boolean }) {
    if (!placeId) return;
    createPlan.mutate(
      { place_id: placeId, ...vars },
      {
        onSuccess: (plan) => {
          setComposerOpen(false);
          toast.success(vars.is_timeless ? 'Added to your “Want to go”.' : 'Plan created!');
          navigate(`/plans/${plan.id}`);
        },
        onError: (e) => toast.error(apiError(e).message ?? "Couldn't create the plan."),
      },
    );
  }

  return (
    <OverlayScreen title={place.name}>
      {place.photo_url && <img src={place.photo_url} alt="" className="w-full h-44 object-cover" />}
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-zinc-100">{place.name}</h1>
          {place.category && <p className="text-sm text-slate-400 dark:text-zinc-500 capitalize">{place.category}</p>}
          {place.is_unavailable && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">This place may have closed.</p>
          )}
        </div>

        {place.description && <p className="text-sm text-slate-600 dark:text-zinc-300">{place.description}</p>}

        <a
          href={place.google_maps_url}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {place.address} ↗
        </a>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleBookmark}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium ${
              saved
                ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
            }`}
          >
            {saved ? '★ Saved' : '☆ Save'}
          </button>
          <button
            onClick={() => (place.viewer?.active_plan_id ? navigate(`/plans/${place.viewer.active_plan_id}`) : setComposerOpen(true))}
            disabled={place.is_unavailable}
            className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {place.viewer?.active_plan_id ? 'View your plan' : 'Create a plan'}
          </button>
        </div>

        <div>
          <button
            onClick={() => setNoteOpen((o) => !o)}
            className="text-sm text-slate-500 dark:text-zinc-400 hover:underline"
          >
            {noteOpen ? '▾' : '▸'} Personal note
          </button>
          {noteOpen && (
            <div className="mt-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="Why did you save this? (optional)"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-400">{note.length}/500</span>
                <button
                  onClick={saveNote}
                  className="px-3 py-1.5 text-xs rounded-full bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                >
                  {saved ? 'Save note' : 'Save with note'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PlanComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        openingHours={place.opening_hours}
        submitting={createPlan.isPending}
        onSubmit={submitPlan}
      />
    </OverlayScreen>
  );
}
