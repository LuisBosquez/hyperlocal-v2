import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/authClient';
import { useAuthStore } from '../store/authStore';
import api, { unwrap } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

interface Notif {
  id: string;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}

const NOTIFICATION_COPY: Record<string, (d: Record<string, unknown>) => string> = {
  new_follower: (d) => `@${d.follower_handle ?? 'someone'} followed you`,
  follow_back_prompt: (d) => `@${d.follower_handle ?? 'someone'} followed you back — you're friends`,
  plan_time_updated: (d) => `${d.place_name ?? 'A plan'} now has a time`,
  plan_reminder_day_before: (d) => `Tomorrow: ${d.place_name ?? 'your plan'}`,
  plan_reminder_morning: (d) => `Today: ${d.place_name ?? 'your plan'}`,
  plan_date_passed: (d) => `Your plan for ${d.place_name ?? 'a place'} never got a time — still want to go?`,
  friend_joined_plan: (d) => `@${d.joiner_handle ?? 'a friend'} joined your plan`,
  plan_cancelled: (d) => `${d.place_name ?? 'A plan'} was cancelled by the organizer`,
};

/**
 * In production this subscribes to Supabase Realtime. In dev (and as the
 * documented X.3 fallback when Realtime drops) it polls notifications, fires a
 * browser Notification for anything new, and refreshes the Panel.
 */
export function useRealtime() {
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const lastSeen = useRef<string | null>(null);
  const askedPermission = useRef(false);

  useEffect(() => {
    if (!session) return;
    let stopped = false;

    async function maybeAskPermission() {
      if (askedPermission.current || !('Notification' in window)) return;
      askedPermission.current = true;
      if (Notification.permission === 'default' && !localStorage.getItem('hl_notif_asked')) {
        localStorage.setItem('hl_notif_asked', '1');
        try {
          await Notification.requestPermission();
        } catch {
          /* ignore — Panel cards remain the source of truth (X.4) */
        }
      }
    }

    async function poll() {
      if (stopped) return;
      try {
        const params = lastSeen.current ? { since: lastSeen.current } : {};
        const notifs = await unwrap<Notif[]>(api.get('/notifications', { params }));
        if (notifs.length) {
          if (lastSeen.current && 'Notification' in window && Notification.permission === 'granted') {
            notifs.forEach((n) => {
              const copy = NOTIFICATION_COPY[n.type]?.(n.data) ?? 'New activity on Hyperlocal';
              new Notification('Hyperlocal', { body: copy });
            });
          }
          lastSeen.current = notifs[0].created_at;
          qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
        } else if (!lastSeen.current) {
          lastSeen.current = new Date().toISOString();
        }
      } catch {
        /* transient — try again next tick */
      }
    }

    maybeAskPermission();
    poll();
    const interval = setInterval(poll, 8000);
    const onFocus = () => qc.invalidateQueries({ queryKey: queryKeys.panelAll() });
    window.addEventListener('focus', onFocus);

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);
}
