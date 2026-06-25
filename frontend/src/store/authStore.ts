import { create } from 'zustand';
import type { AppUser } from '../types/api';
import type { AuthSession } from '../lib/authClient';

interface AuthStore {
  session: AuthSession | null;
  user: AppUser | null;
  initialized: boolean;
  setSession: (session: AuthSession | null) => void;
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
