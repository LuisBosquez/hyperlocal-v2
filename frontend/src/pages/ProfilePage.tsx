import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();

  const { data: user, isLoading } = useQuery({
    queryKey: queryKeys.userProfile(handle ?? ''),
    queryFn: () => api.get(`/users/${handle}`).then((r) => r.data.data),
    enabled: !!handle,
    staleTime: 2 * 60_000,
  });

  if (isLoading) return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 p-8 text-slate-400 dark:text-zinc-500">Loading…</div>
  );
  if (!user) return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 p-8 text-slate-400 dark:text-zinc-500">User not found.</div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 p-8">
      <div className="flex items-center gap-4 mb-6">
        {user.avatar_url && (
          <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">{user.display_name}</h1>
          <p className="text-slate-500 dark:text-zinc-500">@{user.handle}</p>
        </div>
      </div>
      {user.bio && <p className="text-slate-700 dark:text-zinc-400">{user.bio}</p>}
    </div>
  );
}
