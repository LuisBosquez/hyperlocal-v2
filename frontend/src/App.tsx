import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { RedirectIfAuthed, RequireAuth } from './components/layout/AuthGuard';
import { HandleGuard } from './components/layout/HandleGuard';

import LandingPage from './pages/LandingPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import OnboardingPage from './pages/OnboardingPage';
import MapPage from './pages/MapPage';
import PlanDetailPage from './pages/PlanDetailPage';
import PlaceDetailPage from './pages/PlaceDetailPage';
import ProfilePage from './pages/ProfilePage';
import PublicProfilePage from './pages/PublicProfilePage';
import PublicPlanPage from './pages/PublicPlanPage';
import InvitePage from './pages/InvitePage';
import SettingsPage from './pages/SettingsPage';
import DevLogin from './pages/DevLogin';
import { useAuth } from './hooks/useAuth';

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  useAuth();
  return <>{children}</>;
}

const router = createBrowserRouter([
  {
    element: (
      <AuthBootstrap>
        <Outlet />
      </AuthBootstrap>
    ),
    children: [
      {
        path: '/',
        element: (
          <RedirectIfAuthed>
            <LandingPage />
          </RedirectIfAuthed>
        ),
      },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/dev-login', element: <DevLogin /> },
      {
        path: '/onboarding',
        element: (
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        ),
      },
      {
        element: <HandleGuard />,
        children: [
          { path: '/map', element: <MapPage /> },
          { path: '/plans/:planId', element: <PlanDetailPage /> },
          { path: '/places/:placeId', element: <PlaceDetailPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      // /u/:handle — public profile (no auth required; shows plans with venue gating)
      { path: '/u/:handle', element: <PublicProfilePage /> },
      // /p/:planId — public plan detail (venue locked behind sign-up CTA)
      { path: '/p/:planId', element: <PublicPlanPage /> },
      { path: '/invite/:token', element: <InvitePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
