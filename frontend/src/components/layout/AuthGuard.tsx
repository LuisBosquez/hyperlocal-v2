import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, initialized } = useAuthStore();
  if (!initialized) return null;
  if (!session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireHandle({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  if (!initialized) return null;
  if (!user?.handle) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { session, user, initialized } = useAuthStore();
  if (!initialized) return null;
  if (session && user?.handle) return <Navigate to="/map" replace />;
  return <>{children}</>;
}
