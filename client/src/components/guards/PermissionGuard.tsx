import type { ReactNode } from 'react';
import { useAppSelector } from '../../store';
import { isAdminRole } from '../../utils/permissions';

interface PermissionGuardProps {
  permission: string | string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Component that conditionally renders children based on user permissions.
 * Usage:
 *   <PermissionGuard permission="users.create">
 *     <CreateUserButton />
 *   </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? []);
  const roles = useAppSelector((state) => state.auth.user?.roles ?? []);
  const perms = Array.isArray(permission) ? permission : [permission];
  // Admin / Super Admin bypass, matching RequirePermission's route-level behavior —
  // otherwise an admin role without every individual permission explicitly granted
  // could reach a page via URL but not see its nav link.
  const hasAccess = isAdminRole(roles) || (requireAll
    ? perms.every((p) => permissions.includes(p))
    : perms.some((p) => permissions.includes(p)));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook to check if the current user has a specific permission.
 * Usage:
 *   const canCreateUser = usePermission('users.create');
 */
export function usePermission(permission: string | string[], requireAll = false): boolean {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? []);
  const roles = useAppSelector((state) => state.auth.user?.roles ?? []);
  const perms = Array.isArray(permission) ? permission : [permission];
  return isAdminRole(roles) || (requireAll
    ? perms.every((p) => permissions.includes(p))
    : perms.some((p) => permissions.includes(p)));
}
