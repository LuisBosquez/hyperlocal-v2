import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api, { unwrap } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { authClient } from '../lib/authClient';
import { useAuthStore } from '../store/authStore';
import { Spinner, Avatar, toast } from '../components/ui';
import type { InviteResolved } from '../types/api';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, user } = useAuthStore();
  const [redeeming, setRedeeming] = useState(false);

  const { data: invite, isLoading } = useQuery<InviteResolved>({
    queryKey: queryKeys.inviteLink(token ?? ''),
    queryFn: () => unwrap(api.get(`/invite-links/${token}`)),
    enabled: !!token,
  });

  // If already signed in, redeem immediately (follow inviter, attribute) then
  // route to the shared object: plan → list → place → map (spec §10).
  useEffect(() => {
    if (!token || !session || !user?.handle || redeeming) return;
    setRedeeming(true);
    (async () => {
      try {
        const res = await unwrap<{
          followed: boolean;
          plan_id: string | null;
          list_id: string | null;
          place_id: string | null;
          creator: { handle: string } | null;
        }>(api.post(`/invite-links/${token}/redeem`));
        if (res.followed && res.creator) toast.success(`You're now following @${res.creator.handle}.`);
        const dest = res.plan_id
          ? `/plans/${res.plan_id}`
          : res.list_id
            ? `/lists/${res.list_id}`
            : res.place_id
              ? `/places/${res.place_id}`
              : '/map';
        navigate(dest, { replace: true });
      } catch {
        navigate('/map', { replace: true });
      }
    })();
  }, [token, session, user?.handle, redeeming, navigate]);

  function signInToContinue() {
    sessionStorage.setItem('hl_redirect', `/invite/${token}`);
    navigate(authClient.isDev ? '/dev-login' : '/');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  }

  if (!invite || invite.expired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white dark:bg-zinc-950">
        <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100 mb-2">This invite isn’t valid</h1>
        <p className="text-slate-500 dark:text-zinc-500 mb-6 text-sm">It may have expired — but you can still join Hyperlocal.</p>
        <button onClick={signInToContinue} className="px-6 py-3 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium">
          Get started
        </button>
      </div>
    );
  }

  if (session && user?.handle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white dark:bg-zinc-950">
      <div className="flex items-center gap-3 mb-4">
        <Avatar user={invite.creator} size={48} />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">@{invite.creator?.handle} invited you</h1>
          {invite.place && <p className="text-sm text-slate-500 dark:text-zinc-500">…to check out {invite.place.name}</p>}
          {invite.list && <p className="text-sm text-slate-500 dark:text-zinc-500">…to see their list “{invite.list.name}”</p>}
        </div>
      </div>
      <p className="text-slate-500 dark:text-zinc-500 mb-8 text-center text-sm max-w-sm">
        Sign in to follow @{invite.creator?.handle} and see their plans.
      </p>
      <button onClick={signInToContinue} className="px-6 py-3 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium">
        {authClient.isDev ? 'Continue (dev sign in)' : 'Sign in with Google'}
      </button>
      {/* Public lists are world-viewable — no account needed (Flow 19.2). */}
      {invite.list && (
        <button
          onClick={() => navigate(`/lists/${invite.list!.list_id}`)}
          className="mt-3 text-sm text-indigo-500 hover:underline"
        >
          Just show me the list
        </button>
      )}
    </div>
  );
}
