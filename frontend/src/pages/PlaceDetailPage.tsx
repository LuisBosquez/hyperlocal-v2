import { useParams } from 'react-router-dom';
import { usePlaceDetail } from '../hooks/usePlaces';

export default function PlaceDetailPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const { data: place, isLoading } = usePlaceDetail(placeId ?? null);

  if (isLoading) return <div className="min-h-screen bg-white dark:bg-zinc-950 p-8 text-slate-400 dark:text-zinc-500">Loading…</div>;
  if (!place) return <div className="min-h-screen bg-white dark:bg-zinc-950 p-8 text-slate-400 dark:text-zinc-500">Place not found.</div>;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 p-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">{place.name}</h1>
      <p className="text-slate-500 dark:text-zinc-500 mt-1">{place.address}</p>
    </div>
  );
}
