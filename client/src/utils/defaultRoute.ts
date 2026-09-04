import { isAdminRole } from './permissions';

// First-accessible-route lookup, in the same top-to-bottom order as the sidebar
// (DashboardPage.tsx). The first entry whose permission the user holds wins.
const ROUTE_BY_PERMISSION: { permission: string | string[]; route: string }[] = [
  { permission: 'dashboard.view', route: '/dashboard' },
  { permission: 'users.read', route: '/admin/users' },
  { permission: 'roles.read', route: '/admin/roles' },
  { permission: 'departments.read', route: '/admin/departments' },
  { permission: 'positions.read', route: '/admin/positions' },
  { permission: 'company.read', route: '/admin/company' },
  { permission: 'properties.read', route: '/admin/properties' },
  { permission: 'tenants.read', route: '/admin/tenants' },
  { permission: 'leases.read', route: '/admin/leases' },
  { permission: 'crm.read', route: '/admin/crm/leads' },
  { permission: 'parking.read', route: '/admin/parking' },
  { permission: 'billing.read', route: '/admin/billing/dashboard' },
  { permission: 'ar.read', route: '/admin/ar/receipts' },
  { permission: 'ap.read', route: '/admin/ap/invoices' },
  { permission: 'finance.read', route: '/admin/gl/accounts' },
  { permission: 'workflows.read', route: '/admin/workflows' },
  { permission: 'maintenance.read', route: '/admin/maintenance' },
  { permission: 'facility.read', route: '/admin/facility/assets' },
  { permission: 'inventory.read', route: '/admin/inventory/dashboard' },
  { permission: 'housekeeping.read', route: '/admin/housekeeping/dashboard' },
  { permission: 'security.read', route: '/admin/security/dashboard' },
  { permission: 'documents.read', route: '/documents' },
  { permission: ['notifications.send', 'notifications.logs', 'notifications.manage'], route: '/notifications' },
  { permission: 'mall.read', route: '/admin/mall' },
  { permission: 'community.read', route: '/admin/community' },
  { permission: 'condo.read', route: '/admin/condo/smart-meters' },
  { permission: 'portal.read', route: '/portal' },
  { permission: 'reports.view', route: '/admin/bi' },
  { permission: 'developer.read', route: '/admin/developer/integrations' },
  { permission: ['settings.read', 'settings.manage'], route: '/settings/security' },
];

/**
 * Where to land a user right after login: the first sidebar destination they can
 * actually see, in sidebar order — not always /dashboard. Admins (who bypass
 * permission checks entirely) and anyone with no matching permission at all still
 * fall back to /dashboard, since that route itself isn't permission-gated.
 */
export function getDefaultRoute(permissions: string[], roles: string[] = []): string {
  if (isAdminRole(roles)) return '/dashboard';
  for (const entry of ROUTE_BY_PERMISSION) {
    const required = Array.isArray(entry.permission) ? entry.permission : [entry.permission];
    if (required.some((p) => permissions.includes(p))) return entry.route;
  }
  return '/dashboard';
}
