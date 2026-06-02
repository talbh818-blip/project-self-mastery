import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CompassLoader } from './CompassLoader';

export function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return <CompassLoader fullscreen size="lg" />;
  }
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
