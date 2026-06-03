import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';

export function useAuth() {
  const { session, user, setSession, setUser, setInitialized, signOut } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        try {
          const res = await api.post('/auth/session');
          if (res.data?.data?.user) setUser(res.data.data.user);
        } catch {}
      }
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setUser(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, user, setUser, signOut };
}
