/**
 * Single source of truth for unit status keys, labels and colours.
 * Used by P-Units (UnitsTab) and the Shop Directory "Add New Shop" picker so both always match.
 */
export const UNIT_STATUSES = [
  { key: 'available',    label: 'Available',    color: '#10b981' },
  { key: 'occupied',     label: 'Occupied',     color: '#3b82f6' },
  { key: 'reserved',     label: 'Reserved',     color: '#f59e0b' },
  { key: 'maintenance',  label: 'Maintenance',  color: '#ef4444' },
  { key: 'not_for_rent', label: 'Not for Rent', color: '#6b7280' },
] as const;

export const UNIT_STATUS_COLOR: Record<string, string> = Object.fromEntries(
  UNIT_STATUSES.map((s) => [s.key, s.color]),
);

export const UNIT_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  UNIT_STATUSES.map((s) => [s.key, s.label]),
);

export const UNIT_STATUS_FALLBACK_COLOR = '#6b7280';
