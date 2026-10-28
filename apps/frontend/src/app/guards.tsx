/**
 * Route guards. The backend refuses what a role may not see anyway; these
 * only send each user to a page they can use.
 */
import type { Role } from '@mixline/shared';
import { Navigate, Outlet, useLocation } from 'react-router';

import { AppShell } from '../layout/AppShell';
import { AuthLayout } from '../layout/AuthLayout';
import { useSession } from '../session/session';
import { landingPath } from './landing';

/**
 * Pages for logged-in users, optionally of some roles only. Visitors go to the
 * login page; a temporary password goes to the change-password page; a role
 * that may not open the page goes to its own landing page.
 */
export function RequireUser({ roles }: { roles?: readonly Role[] }) {
  const { state } = useSession();
  const { pathname } = useLocation();
  if (state.status !== 'in') return <Navigate to="/login" replace />;
  const { user } = state;
  if (user.mustChangePassword && pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={landingPath(user)} replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** Login and sign-up: a logged-in user goes to their landing page. */
export function VisitorsOnly() {
  const { state } = useSession();
  if (state.status === 'in') return <Navigate to={landingPath(state.user)} replace />;
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}

/** "/": the user's landing page, or the login page. */
export function Landing() {
  const { state } = useSession();
  return <Navigate to={state.status === 'in' ? landingPath(state.user) : '/login'} replace />;
}
