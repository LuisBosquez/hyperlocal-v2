import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authClient } from '../../lib/authClient';
import { Spinner } from '../ui';

function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center h-screen text-slate-400">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

const SIGN_IN_PATH = authClient.isDev ? '/dev-login' : '/';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, initialized } = useAuthStore();
  if (!initialized) return <FullPageSpinner />;
  if (!session) return <Navigate to={SIGN_IN_PATH} replace />;
  return <>{children}</>;
}

export function RequireHandle({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  if (!initialized) return <FullPageSpinner />;
  if (!user?.handle) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { session, user, initialized } = useAuthStore();
  if (!initialized) return <FullPageSpinner />;
  if (session && user?.handle) return <Navigate to="/map" replace />;
  return <>{children}</>;
}
