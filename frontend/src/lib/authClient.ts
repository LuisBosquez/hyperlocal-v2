/**
 * Auth abstraction (tech/08 P8). Two modes:
 *  - Dev (VITE_DEV_AUTH=1): sessions minted by the backend's /api/v1/dev/token
 *    endpoint and kept in localStorage. Zero external services.
 *  - Prod: delegates to supabase-js (Google OAuth via Supabase Auth).
 */

export interface AuthSession {
  access_token: string;
  expires_at: number; // unix seconds
  user: { id: string; email: string };
}

const DEV = import.meta.env.VITE_DEV_AUTH === '1';
const KEY = 'hl_dev_session';

type Listener = (session: AuthSession | null) => void;
const listeners = new Set<Listener>();

function readStored(): AuthSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    if (s.expires_at * 1000 < Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function emit(session: AuthSession | null) {
  listeners.forEach((l) => l(session));
}

export const authClient = {
  isDev: DEV,

  async getSession(): Promise<AuthSession | null> {
    if (DEV) return readStored();
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return {
      access_token: data.session.access_token,
      expires_at: data.session.expires_at ?? 0,
      user: { id: data.session.user.id, email: data.session.user.email ?? '' },
    };
  },

  async getAccessToken(): Promise<string | null> {
    const s = await this.getSession();
    return s?.access_token ?? null;
  },

  /** Dev only: mint a token for a seed user via the backend. */
  async signInDev(email: string): Promise<AuthSession> {
    const resp = await fetch(`/api/v1/dev/token/${encodeURIComponent(email)}`);
    if (!resp.ok) throw new Error(`dev token failed: ${resp.status}`);
    const body = await resp.json();
    const session: AuthSession = {
      access_token: body.access_token,
      expires_at: body.expires_at,
      user: { id: body.user.id, email: body.user.email },
    };
    localStorage.setItem(KEY, JSON.stringify(session));
    emit(session);
    return session;
  },

  async signInGoogle(redirectTo?: string) {
    const { supabase } = await import('./supabase');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo ?? `${window.location.origin}/auth/callback` },
    });
  },

  async signOut() {
    if (DEV) {
      localStorage.removeItem(KEY);
      emit(null);
      return;
    }
    const { supabase } = await import('./supabase');
    await supabase.auth.signOut();
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    if (!DEV) {
      import('./supabase').then(({ supabase }) => {
        supabase.auth.onAuthStateChange((_e, session) => {
          listener(
            session
              ? {
                  access_token: session.access_token,
                  expires_at: session.expires_at ?? 0,
                  user: { id: session.user.id, email: session.user.email ?? '' },
                }
              : null,
          );
        });
      });
    }
    return () => listeners.delete(listener);
  },
};
