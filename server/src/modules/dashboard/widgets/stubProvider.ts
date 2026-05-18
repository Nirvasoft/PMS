/**
 * Stub Widget Data Provider — returns realistic mock data for Phase 1.
 * Each widget type gets appropriate mock data structure.
 * Replace with real data providers as modules ship in Phase 2+.
 */

interface WidgetDataParams {
  companyId: string;
  propertyId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Generate months for trend charts
function getMonthLabels(count: number): string[] {
  const months: string[] = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(m.toISOString().slice(0, 7)); // '2025-01'
  }
  return months;
}

const STUB_DATA: Record<string, (params: WidgetDataParams) => unknown> = {
  // ── KPI Cards ──
  occupancy_rate: () => ({
    type: 'kpi_card', label: 'Occupancy Rate', value: 87.5, unit: '%',
    trend: { direction: 'up', changePercent: 2.3, label: 'vs last month' },
    breakdown: { occupied: 70, total: 80, vacant: 10 },
  }),
  revenue_mtd: () => ({
    type: 'kpi_card', label: 'Revenue MTD', value: 245000, unit: 'USD',
    trend: { direction: 'up', changePercent: 8.1, label: 'vs last month' },
  }),
  revenue_ytd: () => ({
    type: 'kpi_card', label: 'Revenue YTD', value: 2840000, unit: 'USD',
    trend: { direction: 'up', changePercent: 12.4, label: 'vs last year' },
  }),
  collection_rate: () => ({
    type: 'gauge', label: 'Collection Rate', value: 92, unit: '%',
    target: 95, breakdown: { collected: 226000, billed: 245000 },
  }),
  overdue_invoices: () => ({
    type: 'kpi_card', label: 'Overdue Invoices', value: 12, unit: '',
    trend: { direction: 'down', changePercent: -15, label: 'vs last month' },
    breakdown: { totalAmount: 34500, averageDays: 28 },
  }),
  maintenance_open: () => ({
    type: 'kpi_card', label: 'Open Tickets', value: 23, unit: '',
    trend: { direction: 'down', changePercent: -8, label: 'vs last week' },
    breakdown: { critical: 3, high: 7, medium: 8, low: 5 },
  }),
  maintenance_sla: () => ({
    type: 'kpi_card', label: 'SLA Breaches', value: 2, unit: '',
    trend: { direction: 'down', changePercent: -50, label: 'vs last month' },
  }),
  pending_tasks: () => ({
    type: 'kpi_card', label: 'My Pending Tasks', value: 8, unit: '',
    trend: { direction: 'flat', changePercent: 0, label: '' },
  }),
  active_workflows: () => ({
    type: 'kpi_card', label: 'Active Workflows', value: 15, unit: '',
    trend: { direction: 'up', changePercent: 5, label: 'vs last week' },
  }),
  documents_expiring: () => ({
    type: 'kpi_card', label: 'Documents Expiring (30d)', value: 5, unit: '',
    trend: { direction: 'up', changePercent: 25, label: 'vs last month' },
  }),

  // ── Line Charts ──
  vacancy_trend: () => {
    const months = getMonthLabels(6);
    return {
      type: 'line_chart', label: 'Vacancy Trend',
      series: [{ name: 'Vacancy Rate', data: months.map((m) => ({ x: m, y: +(10 + Math.random() * 8).toFixed(1) })) }],
      xAxis: { label: 'Month', type: 'category' },
      yAxis: { label: 'Vacancy %', unit: '%' },
    };
  },
  maintenance_trend: () => {
    const months = getMonthLabels(6);
    return {
      type: 'line_chart', label: 'Maintenance Trend',
      series: [
        { name: 'Opened', data: months.map((m) => ({ x: m, y: Math.floor(15 + Math.random() * 20) })) },
        { name: 'Closed', data: months.map((m) => ({ x: m, y: Math.floor(12 + Math.random() * 22) })) },
      ],
      xAxis: { label: 'Month', type: 'category' },
      yAxis: { label: 'Tickets', unit: '' },
    };
  },

  // ── Bar Charts ──
  revenue_by_property: () => ({
    type: 'bar_chart', label: 'Revenue by Property',
    series: [{
      name: 'Revenue',
      data: [
        { x: 'Tower A', y: 125000 }, { x: 'Tower B', y: 98000 },
        { x: 'Mall C', y: 210000 }, { x: 'Villa D', y: 45000 },
        { x: 'Office E', y: 156000 },
      ],
    }],
    yAxis: { label: 'Revenue (USD)', unit: 'USD' },
  }),

  // ── Pie/Donut Charts ──
  unit_status_breakdown: () => ({
    type: 'pie_chart', label: 'Unit Status Breakdown',
    data: [
      { name: 'Occupied', value: 70, color: '#6c5ce7' },
      { name: 'Vacant', value: 8, color: '#e74c3c' },
      { name: 'Under Maintenance', value: 2, color: '#f39c12' },
    ],
  }),
  tickets_by_category: () => ({
    type: 'pie_chart', label: 'Tickets by Category',
    data: [
      { name: 'Plumbing', value: 12, color: '#3498db' },
      { name: 'Electrical', value: 8, color: '#f39c12' },
      { name: 'HVAC', value: 6, color: '#2ecc71' },
      { name: 'Cleaning', value: 4, color: '#9b59b6' },
      { name: 'Other', value: 3, color: '#95a5a6' },
    ],
  }),

  // ── Data Tables ──
  lease_expiring_soon: () => ({
    type: 'data_table', label: 'Leases Expiring (90 Days)',
    columns: ['Tenant', 'Unit', 'Expiry Date', 'Days Left', 'Rent'],
    rows: [
      ['Acme Corp', 'A-101', '2025-03-15', '45', '$2,500'],
      ['Beta LLC', 'B-205', '2025-03-28', '58', '$3,200'],
      ['Gamma Inc', 'C-310', '2025-04-10', '71', '$1,800'],
      ['Delta Co', 'A-402', '2025-04-22', '83', '$4,100'],
    ],
  }),
  recent_activity: () => ({
    type: 'data_table', label: 'Recent Activity',
    columns: ['Action', 'User', 'Target', 'Time'],
    rows: [
      ['Uploaded document', 'John Agent', 'Lease Agreement — A101', '5 min ago'],
      ['Approved task', 'Sarah Admin', 'Vendor Onboarding: XYZ', '12 min ago'],
      ['Created property', 'Mike Manager', 'Tower F', '1 hour ago'],
      ['Updated role', 'Admin', 'Property Manager', '3 hours ago'],
    ],
  }),
};

/**
 * Get stub widget data for a given widget code.
 */
export function getStubWidgetData(code: string, _params: WidgetDataParams): unknown {
  const provider = STUB_DATA[code];
  if (!provider) {
    // Return a generic KPI card for unknown widgets
    return {
      type: 'kpi_card', label: code.replace(/_/g, ' '), value: 0, unit: '',
      trend: { direction: 'flat', changePercent: 0, label: '' },
    };
  }
  return { ...provider(_params) as Record<string, unknown>, updatedAt: new Date().toISOString() };
}
