/**
 * Shared billing utility functions.
 */

export interface TenantNameFields {
  tenantType?: string | null;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Formats a tenant's display name consistently across all billing contexts
 * (invoices, PDFs, notifications). Uses a space separator for individual names.
 */
export function formatTenantName(tenant: TenantNameFields): string {
  if (tenant.tenantType === 'company') {
    return tenant.companyName || '';
  }
  return `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();
}
