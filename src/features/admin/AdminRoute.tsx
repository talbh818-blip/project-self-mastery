import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentProfile } from './ProfileContext';

// Gates a route to admin users only. Non-admins are redirected to the home
// (habits) screen. The server enforces this too — RLS will refuse any data
// to a non-admin — but this stops the screen from rendering at all.
export function AdminRoute() {
  const { isAdmin, loading } = useCurrentProfile();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base text-ink-100">
        טוען…
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
