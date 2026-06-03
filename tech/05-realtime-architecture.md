# Realtime Architecture — Hyperlocal v2 (Supabase Realtime)

> **Stack:** Supabase Realtime · React SPA · Python Flask (backend; no direct Realtime SDK usage)  
> **Purpose:** Design the live-update layer for the Panel feed, plan detail pages, and in-app notifications. Each section is self-contained for AI plan-mode task splitting.

---

## Overview

Supabase Realtime delivers database change events to connected clients over WebSocket. It listens to the Postgres Write-Ahead Log (WAL) via logical replication and broadcasts row-level changes to subscribed channels.

**Flask does not push to Realtime directly.** Flask writes to Postgres. Supabase picks up the WAL change and fans it out to matching subscribers. This means Realtime is purely a read-side concern — the React client subscribes; the Flask backend just writes to the DB as normal.

**Two kinds of channels are used in MVP-1:**

| Channel type | Name format | Purpose |
|---|---|---|
| User panel channel | `panel:{user_id}` | All Panel-level updates for one user: notifications, new friend plans |
| Plan detail channel | `plan:{plan_id}` | Real-time interest/join counts on a plan detail page |

---

## Tables Requiring Realtime Enabled

Enable Postgres CDC (Change Data Capture) in the Supabase dashboard for these tables:

| Table | Events | Reason |
|-------|--------|--------|
| `events` | `INSERT` | Drives all Panel notification cards in real time |
| `plan_interests` | `INSERT`, `DELETE` | Real-time interest count on plan detail page |
| `plan_joins` | `INSERT`, `DELETE` | Real-time join count on plan detail page |
| `plans` | `UPDATE` | Plan detail page reflects time addition, cancellation |
| `follows` | `INSERT` | Not strictly needed (follow notifications go through `events`) — enable for V2 near-future use |

**How to enable:** In Supabase Dashboard → Database → Replication → enable tables listed above under the `supabase_realtime` publication.

**RLS and Realtime:** Supabase Realtime respects Row Level Security. Clients only receive events for rows they are permitted to read under the active JWT. The RLS policies required for each table:

| Table | Required RLS policy |
|-------|---------------------|
| `events` | `SELECT` where `recipient_id = auth.uid()` |
| `plan_interests` | `SELECT` where the plan is visible to the user (mutual friend of organizer or joined) |
| `plan_joins` | `SELECT` where the plan is visible to the user |
| `plans` | `SELECT` where the plan is visible to the user |

---

## Channel Design

### Channel 1: `panel:{user_id}`

**One channel per authenticated user. Opened on app mount. Closed on logout.**

This channel is the single entry point for all Panel updates. It subscribes to `events` INSERTs filtered by `recipient_id`. When a new event row appears, the React client shows the corresponding notification card or refreshes the affected Panel section.

**What triggers rows in `events`:**
- `POST /follows` → `follow` event for followed user → their `panel:{user_id}` channel fires
- `POST /plans` (new plan by mutual friend) → `new_friend_plan` event for each mutual friend → each friend's `panel:{user_id}` channel fires
- `PATCH /plans/:id` (time added to timeless plan) → `plan_time_added` event for each interested user → each user's `panel:{user_id}` channel fires
- `POST /plans/:id/cancel` → `plan_cancelled` event for each joiner → each joiner's `panel:{user_id}` channel fires
- Lambda cron job → `plan_reminder` event for organizer → organizer's `panel:{user_id}` channel fires

**Filter used on the subscription:**
```
filter: "recipient_id=eq.{user_id}"
```

---

### Channel 2: `plan:{plan_id}`

**One channel per plan, opened when the user navigates to a plan detail page. Closed when the user navigates away.**

Subscribes to `plan_interests` and `plan_joins` changes (for live counts), plus `plans` UPDATE (for time addition or cancellation status).

**What triggers updates:**
- `POST /plans/:id/interests` or `DELETE /plans/:id/interests` → `plan_interests` INSERT/DELETE
- `POST /plans/:id/joins` or `DELETE /plans/:id/joins` → `plan_joins` INSERT/DELETE
- `PATCH /plans/:id` or `POST /plans/:id/cancel` → `plans` UPDATE

**Filter used:**
```
filter: "plan_id=eq.{plan_id}"    (for plan_interests and plan_joins)
filter: "id=eq.{plan_id}"         (for plans table)
```

---

## Event Catalog

### Events flowing through `panel:{user_id}` channel

| Supabase event | Table | Filter | React action |
|---|---|---|---|
| `INSERT` | `events` | `recipient_id=eq.{user_id}` | Prepend a new Notification card to the Panel |

When the client receives a new `events` row, it inspects `type` to determine the card:

| `events.type` | Panel card behavior |
|---|---|
| `follow` | Show "X followed you" card with Follow Back action |
| `new_friend_plan` | Append a new friend Plan card to the Plan section of Panel |
| `plan_time_added` | Show "X added a time to their plan" card; refresh that plan card if it's already in the Panel |
| `plan_reminder` | Show "Add a time to your plan at [place]" card |
| `plan_cancelled` | Update the matching Plan card in the Panel to show "Cancelled" badge |

### Events flowing through `plan:{plan_id}` channel

| Supabase event | Table | Filter | React action |
|---|---|---|---|
| `INSERT` | `plan_interests` | `plan_id=eq.{plan_id}` | Increment `interest_count` displayed on page |
| `DELETE` | `plan_interests` | `plan_id=eq.{plan_id}` | Decrement `interest_count` |
| `INSERT` | `plan_joins` | `plan_id=eq.{plan_id}` | Increment `join_count`; add user avatar to joiner list |
| `DELETE` | `plan_joins` | `plan_id=eq.{plan_id}` | Decrement `join_count`; remove user from joiner list |
| `UPDATE` | `plans` | `id=eq.{plan_id}` | Re-render plan header with updated `planned_at` or `is_cancelled` |

---

## Client-Side Implementation

### Prerequisites

Install the Supabase JS client (already used for auth):
```bash
npm install @supabase/supabase-js
```

Initialize in a shared module:
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

The anon key is the **public** Supabase key (safe to expose in the SPA). RLS policies enforce data access. Never use the `service_role` key in the frontend.

---

### Hook 1: `usePanelRealtime`

Open this channel immediately after the user authenticates. Keep it alive for the entire session.

```typescript
// src/hooks/usePanelRealtime.ts
import { useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

type PanelEvent = {
  id: string;
  type: 'follow' | 'new_friend_plan' | 'plan_time_added' | 'plan_reminder' | 'plan_cancelled';
  payload: Record<string, unknown>;
  created_at: string;
};

export function usePanelRealtime(userId: string | null) {
  const queryClient = useQueryClient();

  const handleNewEvent = useCallback(
    (event: PanelEvent) => {
      // Prepend to the events list in React Query cache
      queryClient.setQueryData<PanelEvent[]>(['panel-events'], (prev = []) => [
        event,
        ...prev,
      ]);

      // For plan-affecting events, invalidate the panel plans query
      if (
        event.type === 'new_friend_plan' ||
        event.type === 'plan_time_added' ||
        event.type === 'plan_cancelled'
      ) {
        queryClient.invalidateQueries({ queryKey: ['panel-plans'] });
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`panel:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => handleNewEvent(payload.new as PanelEvent)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Re-fetch panel on every (re)connect to catch missed events during disconnection
          queryClient.invalidateQueries({ queryKey: ['panel'] });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, handleNewEvent, queryClient]);
}
```

**Where to call this hook:**
```typescript
// src/App.tsx (or the authenticated layout component)
const { data: session } = useSession(); // your auth hook
usePanelRealtime(session?.user?.id ?? null);
```

---

### Hook 2: `usePlanRealtime`

Open this channel when the user navigates to a plan detail page. Closed automatically on unmount.

```typescript
// src/hooks/usePlanRealtime.ts
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

export function usePlanRealtime(planId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!planId) return;

    const channel = supabase
      .channel(`plan:${planId}`)
      // Real-time interest count
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'plan_interests',
          filter: `plan_id=eq.${planId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['plan', planId] })
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'plan_interests',
          filter: `plan_id=eq.${planId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['plan', planId] })
      )
      // Real-time join count
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'plan_joins',
          filter: `plan_id=eq.${planId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['plan', planId] })
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'plan_joins',
          filter: `plan_id=eq.${planId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['plan', planId] })
      )
      // Plan updates (time added, cancellation)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'plans',
          filter: `id=eq.${planId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['plan', planId] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [planId, queryClient]);
}
```

**Where to call this hook:**
```typescript
// src/pages/PlanDetail.tsx
export function PlanDetailPage() {
  const { planId } = useParams();
  usePlanRealtime(planId ?? null);

  const { data: plan } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => api.get(`/plans/${planId}`),
  });

  // ... render plan detail
}
```

**Note on invalidation strategy:** Both hooks use `queryClient.invalidateQueries` rather than optimistic cache updates. This is deliberate for MVP-1: it guarantees consistency with the server and avoids edge cases from concurrent updates. The refetch is fast (single row query) and acceptable on a stable connection.

---

## Server-Side (Flask) Role

**Flask has no dependency on the Supabase Realtime SDK.** Its only responsibility is writing to Postgres correctly. Realtime picks up the WAL changes automatically.

The causal chain for every Realtime event:

```
User action → POST /follows (Flask)
           → INSERT into `follows`       (Flask writes to Postgres)
           → INSERT into `events`        (Flask also writes this)
           → Supabase WAL picks up INSERT on `events`
           → Supabase Realtime broadcasts to `panel:{followed_user_id}` channel
           → React client receives event → shows Notification card
```

Flask must write the `events` rows explicitly — Realtime does not auto-create notification records. There are no Postgres triggers that create `events` rows; Flask handles this application logic.

**The only edge case where Flask might use Supabase Realtime's broadcast API** is if a future feature requires pushing a message not tied to any DB row (e.g. a transient "your friend just arrived" signal). For MVP-1, all notifications go through the `events` table, so this is not needed.

---

## Failure Handling

### Connection drops

Supabase Realtime JS client reconnects automatically with exponential backoff. The reconnection is transparent to the application code.

**The critical gap:** Supabase Realtime does NOT replay events missed during a disconnection. If the user was offline for 30 seconds and 3 events fired, the client will not receive them on reconnect.

**Mitigation:** The `usePanelRealtime` hook invalidates the full panel query on every `SUBSCRIBED` status event (which fires on both initial connect and reconnect). This triggers a full `GET /panel` refetch, which catches any missed events.

```typescript
.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    queryClient.invalidateQueries({ queryKey: ['panel'] });
  }
});
```

### Stale-state indicator

For a future improvement (V1.1+), track connection status and show a subtle "Reconnecting…" indicator while the channel status is `CHANNEL_ERROR` or `TIMED_OUT`:

```typescript
const [isConnected, setIsConnected] = useState(true);

.subscribe((status) => {
  setIsConnected(status === 'SUBSCRIBED');
  if (status === 'SUBSCRIBED') {
    queryClient.invalidateQueries({ queryKey: ['panel'] });
  }
});
```

For MVP-1, the silent re-fetch on reconnect is sufficient.

### JWT expiry

Supabase Realtime channels use the JWT passed at client initialization. When the JWT expires, the Realtime connection will drop. The Supabase client auto-refreshes JWTs when using `supabase.auth.onAuthStateChange` — ensure this listener is set up in the app root. The channel will reconnect with the refreshed token automatically.

```typescript
// src/App.tsx
useEffect(() => {
  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      // Clean up all channels
      supabase.removeAllChannels();
    }
  });
  return () => listener.subscription.unsubscribe();
}, []);
```

---

## Fan-Out at Scale (MVP-1 vs V2)

### MVP-1 approach (acceptable)

When a user creates a plan, Flask queries all mutual friends, then bulk-inserts one `events` row per friend. For a user with 50 mutual friends, this is 50 INSERTs in one transaction. Each INSERT triggers one Realtime broadcast.

This is O(n) in the number of mutual friends and is acceptable for MVP-1 where user counts are small.

```python
# Flask handler for POST /plans (simplified)
def create_plan(user_id, place_id, planned_at):
    plan = db.insert("plans", {...})

    # Fan out to mutual friends
    mutual_friends = get_mutual_friends(user_id)
    events = [
        {
            "recipient_id": friend_id,
            "type": "new_friend_plan",
            "payload": {
                "plan_id": str(plan.id),
                "place_name": plan.place.name,
                "organizer_handle": plan.organizer.handle,
                "organizer_avatar_url": plan.organizer.avatar_url,
            },
        }
        for friend_id in mutual_friends
    ]
    db.bulk_insert("events", events)
    return plan
```

### V2 consideration

Replace synchronous fan-out with an async queue (SQS + Lambda worker). Flask publishes one message to SQS; the worker handles fan-out asynchronously. This decouples plan creation latency from friend count.

---

## Presence (Out of Scope for MVP-1)

Supabase Realtime supports Presence — tracking who is currently online or viewing a resource. This is not needed for MVP-1.

**V2 use cases to consider:**
- "3 friends are viewing this plan" on the plan detail page
- "Friend is nearby" ambient awareness on the map
- Online indicator on user avatars in the Panel

If implemented, presence would use Supabase's built-in Presence feature on a dedicated channel, not the `postgres_changes` subscription used above.

---

## Supabase Dashboard Configuration Checklist

For an AI implementer setting up the Supabase project:

- [ ] Enable Realtime on the project (Dashboard → Realtime → Enable)
- [ ] Add `events`, `plan_interests`, `plan_joins`, `plans`, `follows` to the `supabase_realtime` publication (Dashboard → Database → Replication)
- [ ] Enable RLS on all tables with Realtime subscriptions
- [ ] Create RLS policy on `events`: `SELECT` for `auth.uid() = recipient_id`
- [ ] Create RLS policy on `plan_interests`: `SELECT` for users who can see the plan
- [ ] Create RLS policy on `plan_joins`: `SELECT` for users who can see the plan
- [ ] Create RLS policy on `plans`: `SELECT` for organizer, joiners, and mutual friends of organizer
- [ ] Verify Supabase Realtime is in the same AWS region as Lambda (`us-east-1` recommended)

---

## Summary: What Updates What

```
User action                   Flask writes to         Realtime triggers on
─────────────────────────────────────────────────────────────────────────────
Follow user                   events (follow)         panel:{followed_user_id}
Create plan                   events (new_friend_plan) panel:{each_friend_id}
Add time to timeless plan     events (plan_time_added) panel:{each_interested_id}
Cancel plan                   events (plan_cancelled) panel:{each_joiner_id}
Lambda: plan reminder         events (plan_reminder)  panel:{organizer_id}
Mark Interested               plan_interests          plan:{plan_id}
Remove Interested             plan_interests          plan:{plan_id}
Join plan                     plan_joins              plan:{plan_id}
Leave plan                    plan_joins              plan:{plan_id}
Update plan time              plans                   plan:{plan_id}
```
