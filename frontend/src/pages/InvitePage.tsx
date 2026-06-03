import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();

  const { data: invite, isLoading } = useQuery({
    queryKey: queryKeys.inviteLink(token ?? ''),
    queryFn: () => api.get(`/invite-links/${token}`).then((r) => r.data.data),
    enabled: !!token,
  });

  if (isLoading) return <div className="p-8 text-slate-400">Loading invite…</div>;
  if (!invite) return <div className="p-8 text-slate-400">Invite not found or expired.</div>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">You're invited</h1>
      <p className="text-slate-500 mb-8 text-center">Sign in to follow and see their plans.</p>
      <a
        href="/"
        className="px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
      >
        Sign in with Google
      </a>
    </div>
  );
}
