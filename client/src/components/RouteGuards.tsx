import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../store';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAppSelector((s) => s.auth);
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

  // Force password change — redirect to security settings if not already there
  if (user?.mustChangePassword && location.pathname !== '/settings/security') {
    return <Navigate to="/settings/security" replace />;
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

/**
 * Route-level permission guard. Wraps a group of <Route> children.
 * If the user lacks the required permission(s), shows an Access Denied page.
 *
 * Usage in App.tsx:
 *   <Route element={<RequirePermission permission="users.read" />}>
 *     <Route path="/admin/users" element={<UsersPage />} />
 *   </Route>
 */
export function RequirePermission({
  permission,
  requireAll = false,
}: {
  permission: string | string[];
  requireAll?: boolean;
}) {
  const permissions = useAppSelector((s) => s.auth.user?.permissions ?? []);
  const perms = Array.isArray(permission) ? permission : [permission];
  const hasAccess = requireAll
    ? perms.every((p) => permissions.includes(p))
    : perms.some((p) => permissions.includes(p));

  if (!hasAccess) {
    return (
      <div className="page-content">
        <div className="info-card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2>Access Denied</h2>
          <p className="text-muted">You don't have permission to access this page.</p>
          <p className="text-small text-muted" style={{ marginTop: 8 }}>
            Required: <code>{perms.join(', ')}</code>
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
