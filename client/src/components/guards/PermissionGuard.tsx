import type { ReactNode } from 'react';
import { useAppSelector } from '../../store';
import { isAdminRole } from '../../utils/permissions';
import './PermissionGuard.css';

interface PermissionGuardProps {
  permission: string | string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  /**
   * When true, denied content is removed from the tree entirely (old behavior) —
   * used for sidebar nav items/sections, where an inaccessible module should
   * disappear rather than sit around disabled. Defaults to false: denied content
   * stays visible but disabled with a "not-allowed" cursor and a tooltip, which is
   * what every action-button usage (Save/Create/Edit/Delete/etc.) wants, so a user
   * can see the control exists without being able to trigger it.
   */
  hideWhenDenied?: boolean;
  children: ReactNode;
}

const DENIED_TITLE = 'Permission required';

/**
 * Component that conditionally renders children based on user permissions.
 * Usage:
 *   <PermissionGuard permission="users.create">
 *     <CreateUserButton />
 *   </PermissionGuard>
 * By default, a denied action stays visible but disabled (not-allowed cursor +
 * title tooltip). Pass `hideWhenDenied` to remove it from the tree instead (nav items).
 */
export function PermissionGuard({
  permission,
  requireAll = false,
  fallback = null,
  hideWhenDenied = false,
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

  if (hasAccess) return <>{children}</>;
  if (hideWhenDenied) return <>{fallback}</>;

  // Wrap (rather than clone) so this works regardless of whether children is a
  // single button or a whole group of them: the inner layer blocks all pointer
  // events so nothing inside is clickable, and the outer layer actually owns a
  // paintable box (not display:contents — a boxless element can't be hit-tested,
  // so its cursor/title would never fire) that the browser hit-tests against
  // once the inner layer stops intercepting, which is what shows the
  // not-allowed cursor and the title tooltip on hover.
  return (
    <span className="perm-denied-wrap" title={DENIED_TITLE}>
      <span className="perm-denied-inner" aria-disabled="true">
        {children}
      </span>
    </span>
  );
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
