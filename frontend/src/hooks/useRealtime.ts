import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { queryKeys } from '../lib/queryKeys';

export function useRealtime() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    const notifChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { queryClient.invalidateQueries({ queryKey: queryKeys.panel() }); },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          queryClient.invalidateQueries();
        }
      });

    const plansChannel = supabase
      .channel('plans:friends')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plans' },
        () => { queryClient.invalidateQueries({ queryKey: queryKeys.panel() }); },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          queryClient.invalidateQueries();
        }
      });

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(plansChannel);
    };
  }, [session?.user.id]);
}
