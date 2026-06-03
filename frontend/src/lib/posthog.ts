import posthog from 'posthog-js';

export function initPostHog() {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://us.posthog.com',
    autocapture: false,
    capture_pageview: true,
    persistence: 'localStorage',
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.opt_out_capturing();
    },
  });
}

export function identifyUser(userId: string, props: { handle: string; display_name: string }) {
  posthog.identify(userId, props);
}

export function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  posthog.capture(event, props);
}

type AnalyticsEvent =
  | 'invite_link_shared'
  | 'invite_link_converted'
  | 'plan_created'
  | 'place_saved'
  | 'plan_interested'
  | 'plan_joined'
  | 'place_detail_viewed'
  | 'map_search_performed'
  | 'user_followed'
  | 'plan_cancelled';
