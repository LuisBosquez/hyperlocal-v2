import { Outlet } from 'react-router-dom';
import { RequireAuth, RequireHandle } from './AuthGuard';

export function HandleGuard() {
  return (
    <RequireAuth>
      <RequireHandle>
        <Outlet />
      </RequireHandle>
    </RequireAuth>
  );
}
