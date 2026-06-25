import { useEffect } from 'react';
import { authClient } from '../lib/authClient';
import { useAuthStore } from '../store/authStore';
import api, { unwrap } from '../lib/api';
import type { AppUser } from '../types/api';

/**
 * Bootstraps the session once at app start (Flow 1 / P8). Resolves the backend
 * profile so guards know whether onboarding is complete.
 */
export function useAuth() {
  const { session, user, setSession, setUser, setInitialized, signOut } = useAuthStore();

  useEffect(() => {
    let active = true;

    async function boot() {
      const s = await authClient.getSession();
      if (!active) return;
      setSession(s);
      if (s) {
        try {
          const data = await unwrap<{ user: AppUser | null; needs_onboarding: boolean }>(
            api.post('/auth/session'),
          );
          if (active) setUser(data.user);
        } catch {
          /* leave user null; guards route to re-auth */
        }
      }
      if (active) setInitialized(true);
    }

    boot();
    const unsub = authClient.onChange((s) => {
      setSession(s);
      if (!s) setUser(null);
      else boot();
    });

    return () => {
      active = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { session, user, setUser, signOut };
}
