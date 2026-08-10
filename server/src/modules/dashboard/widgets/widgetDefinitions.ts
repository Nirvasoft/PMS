export interface WidgetDef {
  code: string;
  name: string;
  category: string;
  widgetType: string;      // 'kpi_card' | 'line_chart' | 'bar_chart' | 'pie_chart' | 'gauge' | 'data_table' | 'heatmap'
  dataProvider: 'stub' | 'real';
  defaultWidth: number;
  defaultHeight: number;
  requiredPermissions: string[];
  requiredFeature?: string;
}

export const WIDGET_DEFINITIONS: WidgetDef[] = [
  // ── Property ──
  { code: 'occupancy_rate',        name: 'Occupancy Rate',         category: 'property',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'vacancy_trend',         name: 'Vacancy Trend',          category: 'property',    widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },
  { code: 'unit_status_breakdown', name: 'Unit Status Breakdown',  category: 'property',    widgetType: 'pie_chart',   dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'lease_expiring_soon',   name: 'Leases Expiring (90d)',  category: 'property',    widgetType: 'data_table',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [], requiredFeature: 'leasingEnabled' },

  // ── Finance ──
  { code: 'revenue_mtd',           name: 'Revenue MTD',            category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'revenue_ytd',           name: 'Revenue YTD',            category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'collection_rate',       name: 'Collection Rate',        category: 'finance',     widgetType: 'gauge',       dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'overdue_invoices',      name: 'Overdue Invoices',       category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'revenue_by_property',   name: 'Revenue by Property',    category: 'finance',     widgetType: 'bar_chart',   dataProvider: 'real', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
  { code: 'gl_net_income',         name: 'Net Income (Period)',     category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'bank_balance_summary',  name: 'Bank Balances',          category: 'finance',     widgetType: 'data_table',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Maintenance ──
  { code: 'maintenance_open',      name: 'Open Tickets',           category: 'maintenance', widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'maintenance_sla',       name: 'SLA Breaches',           category: 'maintenance', widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'tickets_by_category',   name: 'Tickets by Category',    category: 'maintenance', widgetType: 'pie_chart',   dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'maintenance_trend',     name: 'Maintenance Trend',      category: 'maintenance', widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },

  // ── CRM / Leasing ──
  { code: 'crm_active_leads',      name: 'Active Leads',           category: 'crm',         widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'crmEnabled' },
  { code: 'crm_lead_pipeline',     name: 'Lead Pipeline',          category: 'crm',         widgetType: 'bar_chart',   dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'crmEnabled' },
  { code: 'crm_conversion_rate',   name: 'Conversion Rate',        category: 'crm',         widgetType: 'gauge',       dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'crmEnabled' },

  // ── Facility Booking ──
  { code: 'facility_bookings_today', name: "Today's Bookings",     category: 'facility',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'facility_utilization',    name: 'Facility Utilization',  category: 'facility',    widgetType: 'bar_chart',   dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Parking ──
  { code: 'parking_occupancy',     name: 'Parking Occupancy',      category: 'parking',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'parkingEnabled' },
  { code: 'parking_revenue',       name: 'Parking Revenue',        category: 'parking',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'parkingEnabled' },

  // ── Security ──
  { code: 'security_open_incidents', name: 'Open Incidents',       category: 'security',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'security_incidents_trend', name: 'Incidents Trend',     category: 'security',    widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Visitors ──
  { code: 'visitors_today',        name: "Today's Visitors",       category: 'visitors',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'visitors_trend',        name: 'Visitor Trend',          category: 'visitors',    widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Housekeeping ──
  { code: 'cleaning_completion_rate', name: 'Cleaning Completion', category: 'housekeeping', widgetType: 'gauge',      dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'cleaning_open_tasks',     name: 'Open Cleaning Tasks',  category: 'housekeeping', widgetType: 'kpi_card',   dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },

  // ── Preventive Maintenance ──
  { code: 'pm_upcoming',           name: 'PM Due (7 Days)',        category: 'preventive',  widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'pm_compliance_rate',    name: 'PM Compliance Rate',     category: 'preventive',  widgetType: 'gauge',       dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },

  // ── Inventory ──
  { code: 'inventory_low_stock',    name: 'Low Stock Items',       category: 'inventory',   widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'inventory_movement_trend', name: 'Stock Movement Trend', category: 'inventory',  widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Activity ──
  { code: 'recent_activity',       name: 'Recent Activity',        category: 'activity',    widgetType: 'data_table',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
  { code: 'active_workflows',      name: 'Active Workflows',       category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'workflowEnabled' },
  { code: 'pending_tasks',         name: 'My Pending Tasks',       category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'documents_expiring',    name: 'Documents Expiring',     category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'documentVaultEnabled' },

  // ── Heatmap ──
  { code: 'occupancy_heatmap',     name: 'Activity Heatmap',       category: 'property',    widgetType: 'heatmap',     dataProvider: 'real', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
];

/**
 * Default layout for new users — 4-row overview.
 * All items use h >= 2 to ensure content fits without overflow.
 */
export const DEFAULT_LAYOUT = [
  // Row 0 — top KPI cards (h=2 each)
  { id: 'w1',  widgetCode: 'occupancy_rate',          x: 0, y: 0, w: 3, h: 2, config: {} },
  { id: 'w2',  widgetCode: 'revenue_mtd',             x: 3, y: 0, w: 3, h: 2, config: {} },
  { id: 'w3',  widgetCode: 'maintenance_open',        x: 6, y: 0, w: 3, h: 2, config: {} },
  { id: 'w4',  widgetCode: 'crm_active_leads',        x: 9, y: 0, w: 3, h: 2, config: {} },
  // Row 1 — charts
  { id: 'w5',  widgetCode: 'vacancy_trend',           x: 0, y: 2, w: 6, h: 2, config: {} },
  { id: 'w6',  widgetCode: 'revenue_by_property',     x: 6, y: 2, w: 6, h: 2, config: {} },
  // Row 2 — mixed
  { id: 'w7',  widgetCode: 'unit_status_breakdown',   x: 0, y: 4, w: 4, h: 2, config: {} },
  { id: 'w8',  widgetCode: 'tickets_by_category',     x: 4, y: 4, w: 4, h: 2, config: {} },
  { id: 'w9',  widgetCode: 'crm_lead_pipeline',       x: 8, y: 4, w: 4, h: 2, config: {} },
  // Row 3 — operational KPIs (h=2 each)
  { id: 'w10', widgetCode: 'parking_occupancy',        x: 0, y: 6, w: 3, h: 2, config: {} },
  { id: 'w11', widgetCode: 'visitors_today',           x: 3, y: 6, w: 3, h: 2, config: {} },
  { id: 'w12', widgetCode: 'security_open_incidents',  x: 6, y: 6, w: 3, h: 2, config: {} },
  { id: 'w13', widgetCode: 'pm_upcoming',              x: 9, y: 6, w: 3, h: 2, config: {} },
];

/**
 * Role-specific default layouts — optimized for each role's daily workflow.
 * All items use h >= 2 to ensure content fits without overflow.
 */
export const ROLE_LAYOUTS: Record<string, typeof DEFAULT_LAYOUT> = {
  finance: [
    { id: 'f1', widgetCode: 'revenue_mtd',          x: 0, y: 0, w: 3, h: 2, config: {} },
    { id: 'f2', widgetCode: 'revenue_ytd',          x: 3, y: 0, w: 3, h: 2, config: {} },
    { id: 'f3', widgetCode: 'collection_rate',      x: 6, y: 0, w: 3, h: 2, config: {} },
    { id: 'f4', widgetCode: 'overdue_invoices',     x: 9, y: 0, w: 3, h: 2, config: {} },
    { id: 'f5', widgetCode: 'revenue_by_property',  x: 0, y: 2, w: 6, h: 3, config: {} },
    { id: 'f6', widgetCode: 'gl_net_income',        x: 6, y: 2, w: 3, h: 2, config: {} },
    { id: 'f7', widgetCode: 'bank_balance_summary', x: 6, y: 4, w: 6, h: 2, config: {} },
    { id: 'f8', widgetCode: 'occupancy_rate',       x: 0, y: 5, w: 3, h: 2, config: {} },
    { id: 'f9', widgetCode: 'lease_expiring_soon',  x: 3, y: 5, w: 9, h: 3, config: {} },
  ],
  maintenance: [
    { id: 'm1', widgetCode: 'maintenance_open',     x: 0, y: 0, w: 3, h: 2, config: {} },
    { id: 'm2', widgetCode: 'maintenance_sla',      x: 3, y: 0, w: 3, h: 2, config: {} },
    { id: 'm3', widgetCode: 'pm_upcoming',          x: 6, y: 0, w: 3, h: 2, config: {} },
    { id: 'm4', widgetCode: 'pm_compliance_rate',   x: 9, y: 0, w: 3, h: 2, config: {} },
    { id: 'm5', widgetCode: 'tickets_by_category',  x: 0, y: 2, w: 4, h: 2, config: {} },
    { id: 'm6', widgetCode: 'maintenance_trend',    x: 4, y: 2, w: 5, h: 2, config: {} },
    { id: 'm7', widgetCode: 'inventory_low_stock',  x: 0, y: 4, w: 3, h: 2, config: {} },
    { id: 'm8', widgetCode: 'cleaning_open_tasks',  x: 3, y: 4, w: 3, h: 2, config: {} },
    { id: 'm9', widgetCode: 'cleaning_completion_rate', x: 6, y: 4, w: 3, h: 2, config: {} },
  ],
  security: [
    { id: 's1', widgetCode: 'security_open_incidents', x: 0, y: 0, w: 3, h: 2, config: {} },
    { id: 's2', widgetCode: 'visitors_today',          x: 3, y: 0, w: 3, h: 2, config: {} },
    { id: 's3', widgetCode: 'parking_occupancy',       x: 6, y: 0, w: 3, h: 2, config: {} },
    { id: 's4', widgetCode: 'occupancy_rate',          x: 9, y: 0, w: 3, h: 2, config: {} },
    { id: 's5', widgetCode: 'security_incidents_trend', x: 0, y: 2, w: 6, h: 2, config: {} },
    { id: 's6', widgetCode: 'visitors_trend',          x: 6, y: 2, w: 6, h: 2, config: {} },
    { id: 's7', widgetCode: 'facility_bookings_today', x: 0, y: 4, w: 3, h: 2, config: {} },
    { id: 's8', widgetCode: 'pending_tasks',           x: 3, y: 4, w: 3, h: 2, config: {} },
  ],
};

/**
 * Resolve the best default layout for a given role name.
 * Falls back to the universal DEFAULT_LAYOUT for admin/manager/unknown roles.
 */
export function getDefaultLayoutForRole(roleName?: string): typeof DEFAULT_LAYOUT {
  if (!roleName) return DEFAULT_LAYOUT;

  const lower = roleName.toLowerCase();

  // Finance / Accounting
  if (lower.includes('finance') || lower.includes('account') || lower.includes('billing')) {
    return ROLE_LAYOUTS.finance;
  }
  // Maintenance / Engineering / Facilities
  if (lower.includes('maintenance') || lower.includes('engineer') || lower.includes('technician') || lower.includes('facilit')) {
    return ROLE_LAYOUTS.maintenance;
  }
  // Security / Guard
  if (lower.includes('security') || lower.includes('guard') || lower.includes('patrol')) {
    return ROLE_LAYOUTS.security;
  }

  // Admin / Manager / Owner / everything else → universal default
  return DEFAULT_LAYOUT;
}
