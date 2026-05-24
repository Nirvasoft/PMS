/**
 * Widget definitions — full catalog covering all modules.
 * Each widget can optionally specify a `requiredFeature` that maps to the
 * company.settings feature flag. Widgets whose feature is disabled are
 * hidden from the catalog and return no data.
 */

export interface WidgetDef {
  code: string;
  name: string;
  category: string;
  widgetType: string;
  dataProvider: string;
  defaultWidth: number;
  defaultHeight: number;
  requiredPermissions: string[];
  requiredFeature?: string;  // maps to FeatureFlagKey in company.settings
}

export const WIDGET_DEFINITIONS: WidgetDef[] = [
  // ── Property ──
  { code: 'occupancy_rate',        name: 'Occupancy Rate',         category: 'property',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'vacancy_trend',         name: 'Vacancy Trend',          category: 'property',    widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },
  { code: 'unit_status_breakdown', name: 'Unit Status Breakdown',  category: 'property',    widgetType: 'pie_chart',   dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'lease_expiring_soon',   name: 'Leases Expiring (90d)',  category: 'property',    widgetType: 'data_table',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [], requiredFeature: 'leasingEnabled' },

  // ── Finance ──
  { code: 'revenue_mtd',           name: 'Revenue MTD',            category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'revenue_ytd',           name: 'Revenue YTD',            category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'collection_rate',       name: 'Collection Rate',        category: 'finance',     widgetType: 'gauge',       dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'overdue_invoices',      name: 'Overdue Invoices',       category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'revenue_by_property',   name: 'Revenue by Property',    category: 'finance',     widgetType: 'bar_chart',   dataProvider: 'real', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
  { code: 'gl_net_income',         name: 'Net Income (Period)',     category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'bank_balance_summary',  name: 'Bank Balances',          category: 'finance',     widgetType: 'data_table',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Maintenance ──
  { code: 'maintenance_open',      name: 'Open Tickets',           category: 'maintenance', widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'maintenance_sla',       name: 'SLA Breaches',           category: 'maintenance', widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'tickets_by_category',   name: 'Tickets by Category',    category: 'maintenance', widgetType: 'pie_chart',   dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'maintenance_trend',     name: 'Maintenance Trend',      category: 'maintenance', widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },

  // ── CRM / Leasing ──
  { code: 'crm_active_leads',      name: 'Active Leads',           category: 'crm',         widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'crmEnabled' },
  { code: 'crm_lead_pipeline',     name: 'Lead Pipeline',          category: 'crm',         widgetType: 'bar_chart',   dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'crmEnabled' },
  { code: 'crm_conversion_rate',   name: 'Conversion Rate',        category: 'crm',         widgetType: 'gauge',       dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'crmEnabled' },

  // ── Facility Booking ──
  { code: 'facility_bookings_today', name: "Today's Bookings",     category: 'facility',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'facility_utilization',    name: 'Facility Utilization',  category: 'facility',    widgetType: 'bar_chart',   dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Parking ──
  { code: 'parking_occupancy',     name: 'Parking Occupancy',      category: 'parking',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'parkingEnabled' },
  { code: 'parking_revenue',       name: 'Parking Revenue',        category: 'parking',     widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'parkingEnabled' },

  // ── Security ──
  { code: 'security_open_incidents', name: 'Open Incidents',       category: 'security',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'security_incidents_trend', name: 'Incidents Trend',     category: 'security',    widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Visitors ──
  { code: 'visitors_today',        name: "Today's Visitors",       category: 'visitors',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'visitors_trend',        name: 'Visitor Trend',          category: 'visitors',    widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Housekeeping ──
  { code: 'cleaning_completion_rate', name: 'Cleaning Completion', category: 'housekeeping', widgetType: 'gauge',      dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'cleaning_open_tasks',     name: 'Open Cleaning Tasks',  category: 'housekeeping', widgetType: 'kpi_card',   dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },

  // ── Preventive Maintenance ──
  { code: 'pm_upcoming',           name: 'PM Due (7 Days)',        category: 'preventive',  widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },
  { code: 'pm_compliance_rate',    name: 'PM Compliance Rate',     category: 'preventive',  widgetType: 'gauge',       dataProvider: 'real', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [], requiredFeature: 'maintenanceEnabled' },

  // ── Inventory ──
  { code: 'inventory_low_stock',    name: 'Low Stock Items',       category: 'inventory',   widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'inventory_movement_trend', name: 'Stock Movement Trend', category: 'inventory',  widgetType: 'line_chart',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },

  // ── Activity ──
  { code: 'recent_activity',       name: 'Recent Activity',        category: 'activity',    widgetType: 'data_table',  dataProvider: 'real', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
  { code: 'active_workflows',      name: 'Active Workflows',       category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'workflowEnabled' },
  { code: 'pending_tasks',         name: 'My Pending Tasks',       category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'documents_expiring',    name: 'Documents Expiring',     category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'real', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [], requiredFeature: 'documentVaultEnabled' },
];

/**
 * Default layout for new users — 4-row overview.
 */
export const DEFAULT_LAYOUT = [
  // Row 0 — top KPI cards
  { id: 'w1',  widgetCode: 'occupancy_rate',          x: 0, y: 0, w: 3, h: 1, config: {} },
  { id: 'w2',  widgetCode: 'revenue_mtd',             x: 3, y: 0, w: 3, h: 1, config: {} },
  { id: 'w3',  widgetCode: 'maintenance_open',        x: 6, y: 0, w: 3, h: 1, config: {} },
  { id: 'w4',  widgetCode: 'crm_active_leads',        x: 9, y: 0, w: 3, h: 1, config: {} },
  // Row 1 — charts
  { id: 'w5',  widgetCode: 'vacancy_trend',           x: 0, y: 1, w: 6, h: 2, config: {} },
  { id: 'w6',  widgetCode: 'revenue_by_property',     x: 6, y: 1, w: 6, h: 2, config: {} },
  // Row 2 — mixed
  { id: 'w7',  widgetCode: 'unit_status_breakdown',   x: 0, y: 3, w: 4, h: 2, config: {} },
  { id: 'w8',  widgetCode: 'tickets_by_category',     x: 4, y: 3, w: 4, h: 2, config: {} },
  { id: 'w9',  widgetCode: 'crm_lead_pipeline',       x: 8, y: 3, w: 4, h: 2, config: {} },
  // Row 3 — operational KPIs
  { id: 'w10', widgetCode: 'parking_occupancy',        x: 0, y: 5, w: 3, h: 1, config: {} },
  { id: 'w11', widgetCode: 'visitors_today',           x: 3, y: 5, w: 3, h: 1, config: {} },
  { id: 'w12', widgetCode: 'security_open_incidents',  x: 6, y: 5, w: 3, h: 1, config: {} },
  { id: 'w13', widgetCode: 'pm_upcoming',              x: 9, y: 5, w: 3, h: 1, config: {} },
];
