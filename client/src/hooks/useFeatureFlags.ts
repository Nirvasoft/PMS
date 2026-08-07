import { useGetCompanyQuery } from '../store/api/organizationApi';

/**
 * All feature flags in the system.
 * Keys are stored in company.settings JSON field.
 */
export const FEATURE_FLAGS = {
  maintenanceEnabled:  { label: 'Maintenance Management',        desc: 'Enable tickets, PM schedules, SLA, and technician management', module: 'maintenance' },
  facilityEnabled:     { label: 'Facility Management',           desc: 'Enable asset registry, QR scanning, CAM costs, and utilities', module: 'facility' },
  inventoryEnabled:    { label: 'Inventory Management',          desc: 'Enable item catalog, stock levels, movements, and purchase requisitions', module: 'inventory' },
  housekeepingEnabled: { label: 'Housekeeping',                  desc: 'Enable zones, schedules, tasks, and inspections',             module: 'housekeeping' },
  securityEnabled:     { label: 'Security Management',           desc: 'Enable incidents, patrol management, and access control',     module: 'security' },
  crmEnabled:          { label: 'CRM & Lead Management',       desc: 'Enable lead pipeline, campaigns, and sales tracking',   module: 'crm' },
  parkingEnabled:      { label: 'Parking Management',           desc: 'Enable parking zones, slots, allocations and visitor passes', module: 'parking' },
  workflowEnabled:     { label: 'Workflow Engine',              desc: 'Enable approval workflows, task inbox, and visual designer',  module: 'workflow' },
  documentVaultEnabled:{ label: 'Document Vault',               desc: 'Enable centralized document storage and management',         module: 'documents' },
  notificationsAdminEnabled: { label: 'Notification Admin',     desc: 'Enable notification logs, templates, and admin tools',       module: 'notifications_admin' },
  leasingEnabled:      { label: 'Lease Management',             desc: 'Enable lease creation, tracking, and renewal workflows',     module: 'leases' },
  mallModuleEnabled:   { label: 'Shopping Mall Module',          desc: 'Enable shop directory, GTO, CAM, events, and footfall',      module: 'mall' },
  condoModuleEnabled:  { label: 'Condo Module',                  desc: 'Enable smart meters, funds, meetings/AGM, and by-laws',     module: 'condo' },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Hook to check if a feature flag is enabled.
 * Returns true if the flag is explicitly enabled OR if no value is set (defaults to enabled).
 * This means all modules are ON by default — admins opt-out by toggling flags off.
 */
export function useFeatureFlag(flag: FeatureFlagKey): boolean {
  const { data } = useGetCompanyQuery();
  const settings = (data?.data?.settings ?? {}) as Record<string, unknown>;

  // Default to true if the flag hasn't been explicitly set
  const value = settings[flag];
  return value === undefined || value === null ? true : Boolean(value);
}

/**
 * Hook to get all feature flag values at once.
 * Returns a record of flag key → boolean.
 */
export function useFeatureFlags(): Record<FeatureFlagKey, boolean> {
  const { data } = useGetCompanyQuery();
  const settings = (data?.data?.settings ?? {}) as Record<string, unknown>;

  const flags = {} as Record<FeatureFlagKey, boolean>;
  for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]) {
    const value = settings[key];
    flags[key] = value === undefined || value === null ? true : Boolean(value);
  }
  return flags;
}
