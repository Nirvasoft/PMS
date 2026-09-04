/**
 * True if any of the user's role names is an admin/super-admin role.
 * Normalizes "Super Admin" -> "super_admin" before comparing so the check
 * doesn't depend on exact capitalization/spacing.
 */
export function isAdminRole(roles: string[]): boolean {
  return roles.some((r) => {
    const normalized = r.toLowerCase().replace(/\s+/g, '_');
    return normalized === 'admin' || normalized === 'super_admin';
  });
}
