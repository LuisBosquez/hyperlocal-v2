import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '../lib/authClient';
import { useAuthStore } from '../store/authStore';
import api, { unwrap } from '../lib/api';
import { identifyUser } from '../lib/posthog';
import type { AppUser } from '../types/api';

/** Production Google OAuth landing (Supabase). Resolves the profile, then
 * resumes any stored deep-link redirect (P8). */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setSession, setUser, setInitialized } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const session = await authClient.getSession();
      if (cancelled) return;
      if (!session) {
        navigate('/', { replace: true });
        return;
      }
      setSession(session);
      try {
        const data = await unwrap<{ user: AppUser | null; needs_onboarding: boolean }>(api.post('/auth/session'));
        if (data.user) {
          setUser(data.user);
          identifyUser(session.user.id, {
            handle: data.user.handle ?? '',
            display_name: data.user.display_name ?? '',
          });
        }
        setInitialized(true);
        const redirect = sessionStorage.getItem('hl_redirect');
        sessionStorage.removeItem('hl_redirect');
        navigate(data.needs_onboarding ? '/onboarding' : redirect || '/map', { replace: true });
      } catch {
        navigate('/', { replace: true });
      }
    }

    // Give supabase-js a tick to parse the URL hash, then resolve.
    const t = setTimeout(finish, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [navigate, setSession, setUser, setInitialized]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
      <p className="text-slate-400 dark:text-zinc-500">Signing you in…</p>
    </div>
  );
}
