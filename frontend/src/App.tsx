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
      { path: '/u/:handle', element: <ProfilePage /> },
      { path: '/invite/:token', element: <InvitePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
