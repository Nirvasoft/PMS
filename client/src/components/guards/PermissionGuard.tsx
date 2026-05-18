import type { ReactNode } from 'react';
import { useAppSelector } from '../../store';

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
  const perms = Array.isArray(permission) ? permission : [permission];
  const hasAccess = requireAll
    ? perms.every((p) => permissions.includes(p))
    : perms.some((p) => permissions.includes(p));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook to check if the current user has a specific permission.
 * Usage:
 *   const canCreateUser = usePermission('users.create');
 */
export function usePermission(permission: string | string[], requireAll = false): boolean {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? []);
  const perms = Array.isArray(permission) ? permission : [permission];
  return requireAll
    ? perms.every((p) => permissions.includes(p))
    : perms.some((p) => permissions.includes(p));
}
