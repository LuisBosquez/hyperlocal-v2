import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

interface AppUser {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface AuthStore {
  session: Session | null;
  user: AppUser | null;
  initialized: boolean;
  setSession: (session: Session | null) => void;
  setUser: (user: AppUser | null) => void;
  setInitialized: (initialized: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  initialized: false,
  setSession: (session) => set({ session }),
  setUser: (user) => set({ user }),
  setInitialized: (initialized) => set({ initialized }),
  signOut: () => set({ session: null, user: null, initialized: true }),
}));
