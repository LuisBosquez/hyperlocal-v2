import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { identifyUser } from '../lib/posthog';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setSession, setUser } = useAuthStore();

  useEffect(() => {
    let unsubscribed = false;

    async function processSession(session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>) {
      if (unsubscribed) return;
      setSession(session);
      try {
        const res = await api.post('/auth/session');
        const { user, needs_onboarding } = res.data.data;
        if (user) {
          setUser(user);
          identifyUser(session.user.id, {
            handle: user.handle ?? '',
            display_name: user.display_name ?? '',
          });
        }
        navigate(needs_onboarding ? '/onboarding' : '/map', { replace: true });
      } catch {
        navigate('/', { replace: true });
      }
    }

    async function handleCallback() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        processSession(session);
        return;
      }
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!session) return;
        subscription.unsubscribe();
        processSession(session);
      });
    }

    handleCallback();
    return () => { unsubscribed = true; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
      <p className="text-slate-400 dark:text-zinc-500">Signing you in…</p>
    </div>
  );
}
