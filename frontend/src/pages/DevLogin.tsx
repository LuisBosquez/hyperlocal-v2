// DEV ONLY — pick a seed user (bypasses Google OAuth). Backend mints a JWT.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authClient } from '../lib/authClient';
import { useAuthStore } from '../store/authStore';
import api, { unwrap } from '../lib/api';
import { Spinner } from '../components/ui';
import type { AppUser } from '../types/api';

const USERS = [
  { email: 'alice@dev.local', label: 'Alice', note: 'has friends, plans & a follow request' },
  { email: 'bob@dev.local', label: 'Bob', note: "Alice's mutual friend; organizes plans" },
  { email: 'carlos@dev.local', label: 'Carlos', note: 'Alice follows him one-way' },
  { email: 'dana@dev.local', label: 'Dana', note: 'private profile' },
  { email: 'newuser@dev.local', label: 'New user', note: 'no handle — walks onboarding' },
];

export default function DevLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const { setSession, setUser, setInitialized } = useAuthStore();

  async function signIn(email: string) {
    setBusy(email);
    try {
      const session = await authClient.signInDev(email);
      setSession(session);
      const data = await unwrap<{ user: AppUser | null; needs_onboarding: boolean }>(api.post('/auth/session'));
      setUser(data.user);
      setInitialized(true);
      const redirect = sessionStorage.getItem('hl_redirect');
      sessionStorage.removeItem('hl_redirect');
      if (data.needs_onboarding) navigate('/onboarding', { replace: true });
      else navigate(redirect || params.get('next') || '/map', { replace: true });
    } catch (e) {
      setBusy(null);
      alert(`Dev login failed: ${(e as Error).message}. Is the backend running on :5001?`);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100 mb-1">Hyperlocal — dev sign in</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-5">Pick a seed account to test as.</p>
        <div className="space-y-2">
          {USERS.map((u) => (
            <button
              key={u.email}
              onClick={() => signIn(u.email)}
              disabled={!!busy}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-500 text-left disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{u.label}</p>
                <p className="text-xs text-slate-400 dark:text-zinc-500">{u.note}</p>
              </div>
              {busy === u.email && <Spinner />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
