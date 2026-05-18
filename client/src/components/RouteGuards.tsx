import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../store';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAppSelector((s) => s.auth);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function PublicRoute() {
  const { isAuthenticated } = useAppSelector((s) => s.auth);
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
