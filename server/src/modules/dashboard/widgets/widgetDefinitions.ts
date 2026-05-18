/**
 * Widget seed definitions — Phase 1 catalog.
 * All providers are stubbed with mock data until real modules ship.
 */
export const WIDGET_DEFINITIONS = [
  // ── Property ──
  { code: 'occupancy_rate',        name: 'Occupancy Rate',         category: 'property',    widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'vacancy_trend',         name: 'Vacancy Trend',          category: 'property',    widgetType: 'line_chart',  dataProvider: 'stub', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },
  { code: 'unit_status_breakdown', name: 'Unit Status Breakdown',  category: 'property',    widgetType: 'pie_chart',   dataProvider: 'stub', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'lease_expiring_soon',   name: 'Leases Expiring (90d)',  category: 'property',    widgetType: 'data_table',  dataProvider: 'stub', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
  // ── Finance ──
  { code: 'revenue_mtd',           name: 'Revenue MTD',            category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'revenue_ytd',           name: 'Revenue YTD',            category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'collection_rate',       name: 'Collection Rate',        category: 'finance',     widgetType: 'gauge',       dataProvider: 'stub', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'overdue_invoices',      name: 'Overdue Invoices',       category: 'finance',     widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'revenue_by_property',   name: 'Revenue by Property',    category: 'finance',     widgetType: 'bar_chart',   dataProvider: 'stub', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
  // ── Maintenance ──
  { code: 'maintenance_open',      name: 'Open Tickets',           category: 'maintenance', widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'maintenance_sla',       name: 'SLA Breaches',           category: 'maintenance', widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'tickets_by_category',   name: 'Tickets by Category',    category: 'maintenance', widgetType: 'pie_chart',   dataProvider: 'stub', defaultWidth: 3, defaultHeight: 2, requiredPermissions: [] },
  { code: 'maintenance_trend',     name: 'Maintenance Trend',      category: 'maintenance', widgetType: 'line_chart',  dataProvider: 'stub', defaultWidth: 6, defaultHeight: 2, requiredPermissions: [] },
  // ── Activity ──
  { code: 'recent_activity',       name: 'Recent Activity',        category: 'activity',    widgetType: 'data_table',  dataProvider: 'stub', defaultWidth: 6, defaultHeight: 3, requiredPermissions: [] },
  { code: 'active_workflows',      name: 'Active Workflows',       category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'pending_tasks',         name: 'My Pending Tasks',       category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
  { code: 'documents_expiring',    name: 'Documents Expiring',     category: 'activity',    widgetType: 'kpi_card',    dataProvider: 'stub', defaultWidth: 3, defaultHeight: 1, requiredPermissions: [] },
];

/**
 * Default layout for new users.
 */
export const DEFAULT_LAYOUT = [
  { id: 'w1', widgetCode: 'occupancy_rate',    x: 0, y: 0, w: 3, h: 1, config: {} },
  { id: 'w2', widgetCode: 'revenue_mtd',       x: 3, y: 0, w: 3, h: 1, config: {} },
  { id: 'w3', widgetCode: 'maintenance_open',  x: 6, y: 0, w: 3, h: 1, config: {} },
  { id: 'w4', widgetCode: 'pending_tasks',     x: 9, y: 0, w: 3, h: 1, config: {} },
  { id: 'w5', widgetCode: 'vacancy_trend',     x: 0, y: 1, w: 6, h: 2, config: {} },
  { id: 'w6', widgetCode: 'revenue_by_property', x: 6, y: 1, w: 6, h: 2, config: {} },
  { id: 'w7', widgetCode: 'unit_status_breakdown', x: 0, y: 3, w: 4, h: 2, config: {} },
  { id: 'w8', widgetCode: 'tickets_by_category',   x: 4, y: 3, w: 4, h: 2, config: {} },
];
