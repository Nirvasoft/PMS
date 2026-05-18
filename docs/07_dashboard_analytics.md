# Module 1.7 — Dashboard & Analytics

**Phase:** 1 — Core Platform Foundation  
**Stack:** Express · Prisma · PostgreSQL · Redis · Recharts · React 18 · Redux Toolkit  
**Status:** ⚠️ Partial (dashboard layout implemented, widget data providers stubbed for Phase 2+)  
**Depends On:** All Phase 1 modules; data stubs provided now, real data populated Phase 2+

---

## Table of Contents
1. [Overview](#overview)
2. [DB Schema](#db-schema)
3. [Server-Side Architecture](#server-side-architecture)
4. [API Contract](#api-contract)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [UI Screens & Component Breakdown](#ui-screens--component-breakdown)
7. [State Management](#state-management)

---

## Overview

A configurable, role-aware KPI dashboard framework. Each user has their own persistent layout (widget positions + sizes). Widgets are typed (KPI card, bar chart, line chart, pie chart, table, heatmap) and backed by domain-specific data providers that are stubbed in Phase 1 and filled in as modules are delivered.

**Key capabilities:**
- Drag-and-drop widget layout per user (saved to DB)
- Date range + property filters applied globally to all widgets on dashboard
- Server-side data aggregation with Redis caching (TTL per widget type)
- Role-scoped widget catalog (finance role sees revenue widgets; maintenance role sees ticket widgets)
- Export to Excel (ExcelJS) and PDF (Puppeteer) for any report/widget
- BI widget types: KPI card, trend line, bar chart, donut/pie, data table, heatmap, gauge

---

## DB Schema

```sql
-- Widget catalog (system-defined widget types — seeded)
CREATE TABLE widget_definitions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(100) NOT NULL UNIQUE,      -- 'occupancy_rate' | 'revenue_mtd' | ...
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  category      VARCHAR(50) NOT NULL,              -- 'property' | 'finance' | 'maintenance' | 'security'
  widget_type   VARCHAR(30) NOT NULL,              -- 'kpi_card' | 'line_chart' | 'bar_chart' | 'pie_chart' | 'data_table' | 'heatmap' | 'gauge'
  data_provider VARCHAR(100) NOT NULL,             -- service method that returns data
  default_config JSONB DEFAULT '{}',              -- default size, color, etc.
  required_permissions TEXT[] DEFAULT '{}',       -- permissions needed to see this widget
  min_width     SMALLINT DEFAULT 1,               -- grid columns (12-col grid)
  min_height    SMALLINT DEFAULT 1,               -- grid rows
  default_width SMALLINT DEFAULT 3,
  default_height SMALLINT DEFAULT 2,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- User dashboard layouts
CREATE TABLE dashboard_layouts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dashboard_key VARCHAR(100) NOT NULL DEFAULT 'main',  -- 'main' | 'property:{id}' | 'finance' | ...
  layout        JSONB NOT NULL,                        -- array of widget placement objects
  -- layout item: { widgetDefinitionId, x, y, w, h, config: { title?, colorScheme?, ... } }
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_dashboard UNIQUE (user_id, dashboard_key)
);

-- Saved report configurations
CREATE TABLE saved_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES users(id),
  name          VARCHAR(255) NOT NULL,
  report_type   VARCHAR(100) NOT NULL,             -- 'occupancy' | 'revenue' | 'collection' | ...
  parameters    JSONB DEFAULT '{}',               -- filters: propertyIds, dateRange, groupBy, etc.
  schedule      JSONB,                             -- null = manual; { cron, recipients[], format }
  last_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Report export jobs
CREATE TABLE report_exports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  report_type   VARCHAR(100) NOT NULL,
  format        VARCHAR(10) NOT NULL,              -- 'xlsx' | 'pdf' | 'csv'
  parameters    JSONB DEFAULT '{}',
  status        VARCHAR(20) DEFAULT 'queued',      -- 'queued' | 'processing' | 'done' | 'failed'
  storage_key   VARCHAR(1000),                     -- S3 key of completed export
  error_message TEXT,
  requested_by  UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
```

---

## Server-Side Architecture

```
src/modules/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts
├── dashboard.service.ts              # layout CRUD + widget data orchestration
├── widgets/
│   ├── widget-registry.ts            # maps widget codes to data providers
│   ├── providers/
│   │   ├── occupancy.provider.ts
│   │   ├── revenue.provider.ts
│   │   ├── collection.provider.ts
│   │   ├── maintenance-status.provider.ts
│   │   ├── vacancy.provider.ts
│   │   ├── user-activity.provider.ts
│   │   └── stub.provider.ts          # returns mock data for Phase 1
│   └── base-provider.ts
├── reports/
│   ├── reports.controller.ts
│   ├── reports.service.ts
│   ├── export.service.ts             # ExcelJS + Puppeteer PDF
│   └── queues/
│       └── export.processor.ts
├── dto/
│   ├── save-layout.dto.ts
│   ├── get-widget-data.dto.ts
│   └── export-report.dto.ts
└── entities/ (as above)
```

### Widget Registry

```typescript
// src/modules/dashboard/widgets/widget-registry.ts
@Injectable()
export class WidgetRegistry {
  private providers = new Map<string, BaseWidgetProvider>();

  constructor(
    private occupancyProvider: OccupancyProvider,
    private revenueProvider: RevenueProvider,
    private collectionProvider: CollectionProvider,
    private maintenanceProvider: MaintenanceStatusProvider,
    private vacancyProvider: VacancyProvider,
    private stubProvider: StubProvider,
  ) {
    this.register('occupancy_rate', occupancyProvider);
    this.register('revenue_mtd', revenueProvider);
    this.register('revenue_ytd', revenueProvider);
    this.register('collection_rate', collectionProvider);
    this.register('overdue_invoices', collectionProvider);
    this.register('maintenance_open_tickets', maintenanceProvider);
    this.register('maintenance_sla_breach', maintenanceProvider);
    this.register('vacancy_trend', vacancyProvider);
    // Phase 1 stubs — replaced as real modules ship
    this.register('lease_expiring_soon', stubProvider);
    this.register('visitor_count_today', stubProvider);
  }

  register(code: string, provider: BaseWidgetProvider) {
    this.providers.set(code, provider);
  }

  get(code: string): BaseWidgetProvider {
    const provider = this.providers.get(code);
    if (!provider) throw new NotFoundException(`Widget provider '${code}' not found`);
    return provider;
  }
}

// src/modules/dashboard/widgets/base-provider.ts
export abstract class BaseWidgetProvider {
  abstract getData(params: WidgetDataParams): Promise<WidgetData>;

  protected getCacheKey(code: string, params: WidgetDataParams): string {
    return `pms:widget:${params.companyId}:${code}:${params.propertyId ?? 'all'}:${params.dateRange.from}:${params.dateRange.to}`;
  }

  protected abstract cacheTtlSeconds: number;
}

// src/modules/dashboard/widgets/providers/occupancy.provider.ts
@Injectable()
export class OccupancyProvider extends BaseWidgetProvider {
  protected cacheTtlSeconds = 300; // 5 minutes

  constructor(
    @InjectRepository(Unit) private unitRepo: Repository<Unit>,
    @InjectRedis() private redis: Redis,
  ) { super(); }

  async getData(params: WidgetDataParams): Promise<WidgetData> {
    const cacheKey = this.getCacheKey('occupancy_rate', params);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { companyId, propertyId, dateRange } = params;

    const qb = this.unitRepo.createQueryBuilder('u')
      .select('COUNT(*)::int', 'total')
      .addSelect("COUNT(*) FILTER (WHERE u.status = 'occupied')::int", 'occupied')
      .innerJoin('u.property', 'p', 'p.company_id = :companyId', { companyId });

    if (propertyId) qb.andWhere('u.property_id = :propertyId', { propertyId });

    const result = await qb.getRawOne();
    const rate = result.total > 0 ? Math.round((result.occupied / result.total) * 100) : 0;

    const data: WidgetData = {
      type: 'kpi_card',
      value: rate,
      unit: '%',
      label: 'Occupancy Rate',
      trend: await this.calculateTrend(companyId, propertyId, dateRange),
      breakdown: { occupied: result.occupied, total: result.total, vacant: result.total - result.occupied },
    };

    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', this.cacheTtlSeconds);
    return data;
  }

  private async calculateTrend(companyId: string, propertyId: string | undefined, dateRange: DateRange) {
    // Compare current period vs previous period of same duration
    // Returns: { direction: 'up'|'down'|'flat', changePercent: number }
    // ...implementation...
  }
}
```

### Export Service

```typescript
// src/modules/dashboard/reports/export.service.ts
@Injectable()
export class ExportService {
  async exportToExcel(reportType: string, parameters: Record<string, unknown>, companyId: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PMS System';
    workbook.created = new Date();

    // Load report data
    const reportData = await this.reportsService.getReportData(reportType, parameters, companyId);

    const sheet = workbook.addWorksheet(reportData.title);

    // Header row styling
    sheet.addRow(reportData.headers);
    const headerRow = sheet.lastRow!;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C5E' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });

    // Data rows
    for (const row of reportData.rows) {
      sheet.addRow(row);
    }

    // Auto-fit columns
    sheet.columns.forEach(col => { col.width = Math.max(12, ...col.values!.map(v => String(v).length + 2)); });

    // Summary row
    if (reportData.summary) {
      sheet.addRow([]);
      const summaryRow = sheet.addRow(reportData.summary);
      summaryRow.eachCell(cell => { cell.font = { bold: true }; });
    }

    return workbook.xlsx.writeBuffer() as Promise<Buffer>;
  }

  async exportToPdf(reportType: string, parameters: Record<string, unknown>, companyId: string): Promise<Buffer> {
    const reportData = await this.reportsService.getReportData(reportType, parameters, companyId);
    const html = await this.renderReportHtml(reportData);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });

    await browser.close();
    return Buffer.from(pdf);
  }
}
```

---

## API Contract

### `GET /dashboard/widgets`
**Access:** Authenticated  
Returns catalog of widgets the user is allowed to see (filtered by permissions).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "property": [
      { "code": "occupancy_rate", "name": "Occupancy Rate", "widgetType": "kpi_card", "defaultWidth": 2, "defaultHeight": 1 },
      { "code": "vacancy_trend", "name": "Vacancy Trend", "widgetType": "line_chart", "defaultWidth": 4, "defaultHeight": 2 },
      { "code": "lease_expiring_soon", "name": "Leases Expiring Soon", "widgetType": "data_table", "defaultWidth": 4, "defaultHeight": 3 }
    ],
    "finance": [
      { "code": "revenue_mtd", "name": "Revenue MTD", "widgetType": "kpi_card", "defaultWidth": 2, "defaultHeight": 1 },
      { "code": "collection_rate", "name": "Collection Rate", "widgetType": "gauge", "defaultWidth": 2, "defaultHeight": 2 },
      { "code": "overdue_invoices", "name": "Overdue Invoices", "widgetType": "bar_chart", "defaultWidth": 4, "defaultHeight": 2 }
    ],
    "maintenance": [
      { "code": "maintenance_open_tickets", "name": "Open Tickets", "widgetType": "kpi_card", "defaultWidth": 2, "defaultHeight": 1 },
      { "code": "maintenance_sla_breach", "name": "SLA Breaches", "widgetType": "kpi_card", "defaultWidth": 2, "defaultHeight": 1 }
    ]
  }
}
```

---

### `GET /dashboard/widget-data/:code`
**Access:** Authenticated + required permission for widget

**Query Params:**
```
?propertyId=uuid          # optional filter (null = all properties)
&dateRange=2025-01-01,2025-01-31
&companyId=uuid
```

**Response 200 (KPI card example):**
```json
{
  "success": true,
  "data": {
    "type": "kpi_card",
    "label": "Occupancy Rate",
    "value": 87.5,
    "unit": "%",
    "trend": { "direction": "up", "changePercent": 2.3, "label": "vs last month" },
    "breakdown": { "occupied": 70, "total": 80, "vacant": 10 },
    "updatedAt": "2025-01-15T10:00:00Z"
  }
}
```

**Response 200 (Line chart example):**
```json
{
  "success": true,
  "data": {
    "type": "line_chart",
    "label": "Vacancy Trend",
    "series": [
      {
        "name": "Vacancy Rate",
        "data": [
          { "x": "2024-08", "y": 15.2 },
          { "x": "2024-09", "y": 13.8 },
          { "x": "2024-10", "y": 12.1 },
          { "x": "2024-11", "y": 11.5 },
          { "x": "2024-12", "y": 12.8 },
          { "x": "2025-01", "y": 12.5 }
        ]
      }
    ],
    "xAxis": { "label": "Month", "type": "category" },
    "yAxis": { "label": "Vacancy %", "unit": "%" }
  }
}
```

**Response 200 (Bar chart example):**
```json
{
  "success": true,
  "data": {
    "type": "bar_chart",
    "label": "Revenue by Property",
    "series": [
      {
        "name": "Revenue",
        "data": [
          { "x": "Tower A", "y": 125000 },
          { "x": "Tower B", "y": 98000 },
          { "x": "Mall C", "y": 210000 }
        ]
      }
    ],
    "yAxis": { "label": "Revenue (USD)", "unit": "USD" }
  }
}
```

---

### `GET /dashboard/layout`
**Access:** Authenticated

**Query:** `?dashboardKey=main`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "dashboardKey": "main",
    "layout": [
      { "id": "w1", "widgetCode": "occupancy_rate", "x": 0, "y": 0, "w": 2, "h": 1, "config": {} },
      { "id": "w2", "widgetCode": "revenue_mtd", "x": 2, "y": 0, "w": 2, "h": 1, "config": {} },
      { "id": "w3", "widgetCode": "vacancy_trend", "x": 0, "y": 1, "w": 6, "h": 2, "config": { "colorScheme": "blue" } },
      { "id": "w4", "widgetCode": "maintenance_open_tickets", "x": 6, "y": 0, "w": 2, "h": 1, "config": {} }
    ],
    "updatedAt": "2025-01-14T15:30:00Z"
  }
}
```

---

### `PUT /dashboard/layout`
**Access:** Authenticated

**Request Body:**
```json
{
  "dashboardKey": "main",
  "layout": [
    { "id": "w1", "widgetCode": "occupancy_rate", "x": 0, "y": 0, "w": 3, "h": 1, "config": {} },
    { "id": "w3", "widgetCode": "vacancy_trend", "x": 0, "y": 1, "w": 8, "h": 3, "config": {} }
  ]
}
```

**Response 200:** `{ "success": true }`

---

### `POST /dashboard/layout/reset`
**Access:** Authenticated  
Resets to default layout for the user's primary role.

---

### `GET /reports`
**Access:** `reports.read`  
**Query:** `?reportType=&page=1&limit=20`

### `POST /reports/:type/export`
**Access:** `reports.export`

```json
{
  "format": "xlsx",
  "parameters": {
    "propertyIds": ["uuid1", "uuid2"],
    "dateRange": { "from": "2025-01-01", "to": "2025-01-31" },
    "groupBy": "property"
  }
}
```

**Response 202 Accepted:**
```json
{
  "success": true,
  "data": {
    "exportId": "uuid",
    "status": "queued",
    "estimatedSeconds": 30
  }
}
```

### `GET /reports/exports/:exportId`
**Access:** `reports.export`

**Response 200 (when done):**
```json
{
  "success": true,
  "data": {
    "exportId": "uuid",
    "status": "done",
    "downloadUrl": "https://s3.amazonaws.com/...",
    "expiresIn": 3600,
    "filename": "occupancy_report_2025-01.xlsx"
  }
}
```

---

## Business Logic & Validation Rules

### Widget Data Caching
```
Cache TTL by widget category:
- Real-time metrics (active sessions, visitor count): 30 seconds
- Operational KPIs (occupancy, open tickets): 5 minutes
- Financial aggregates (revenue, collection): 15 minutes
- Trend charts (monthly data): 1 hour
- Annual/historical reports: 24 hours

Cache invalidation:
- On lease status change → invalidate occupancy, vacancy widgets
- On invoice payment → invalidate collection, revenue widgets
- On maintenance ticket update → invalidate maintenance widgets

Cache key pattern:
pms:widget:{companyId}:{widgetCode}:{propertyId|'all'}:{dateFrom}:{dateTo}
```

### Layout Validation
```
Grid is 12 columns wide, unlimited rows.
Validation rules:
- x + w <= 12 (no overflow)
- x >= 0, y >= 0
- w >= widgetDefinition.minWidth
- h >= widgetDefinition.minHeight
- No two widgets overlap (check each pair for collision)
- Max 20 widgets per layout (configurable)
- widgetCode must exist in widget_definitions and be active
- User must have all required permissions for each widget in layout
```

### Export Queue Processing
```
Bull queue: 'report-exports'
Concurrency: 3 workers
Max duration: 5 minutes (beyond this → timeout + error status)
On completion: store file in S3 under exports/{companyId}/{exportId}.{format}
  + send in-app notification to requestedBy user with download link
Download URL: pre-signed S3 URL, 1-hour TTL
Cleanup: S3 lifecycle rule deletes export files after 7 days
```

### Role-Based Default Layouts
```
Seeded default layouts per role (used on first login or reset):

Admin / Manager:
  [occupancy_rate, revenue_mtd, collection_rate, maintenance_open_tickets]
  [vacancy_trend (wide), overdue_invoices]
  [lease_expiring_soon (wide)]

Finance:
  [revenue_mtd, revenue_ytd, collection_rate, overdue_invoices]
  [revenue_by_property_chart]

Maintenance:
  [maintenance_open_tickets, maintenance_sla_breach]
  [tickets_by_category_chart, tickets_by_priority_chart]

Security:
  [visitor_count_today, incidents_this_week]
```

---

## UI Screens & Component Breakdown

```
pages/dashboard/
├── DashboardPage/
│   ├── DashboardPage.tsx              # main page with grid layout
│   └── components/
│       ├── DashboardHeader.tsx        # title + global filters (property picker + date range)
│       ├── DashboardGrid/
│       │   ├── DashboardGrid.tsx      # react-grid-layout wrapper (12-col, drag + resize)
│       │   ├── WidgetContainer.tsx    # wrapper: title bar + edit/remove + loading state
│       │   └── WidgetLoadingShell.tsx # skeleton placeholder during data fetch
│       ├── WidgetTypes/
│       │   ├── KpiCardWidget.tsx      # big number + trend arrow + sparkline
│       │   ├── LineChartWidget.tsx    # Recharts <LineChart>
│       │   ├── BarChartWidget.tsx     # Recharts <BarChart>
│       │   ├── PieChartWidget.tsx     # Recharts <PieChart> / donut
│       │   ├── GaugeWidget.tsx        # SVG arc gauge (0–100%)
│       │   ├── DataTableWidget.tsx    # paginated mini-table
│       │   └── HeatmapWidget.tsx      # custom SVG grid heatmap
│       ├── AddWidgetPanel/
│       │   ├── AddWidgetPanel.tsx     # slide-in panel, widget catalog by category
│       │   ├── WidgetCatalogItem.tsx  # preview card with "Add" button
│       │   └── WidgetSearch.tsx
│       └── DashboardToolbar.tsx       # "Add Widget" + "Edit Layout" + "Reset" + "Export"

pages/reports/
├── ReportsPage/
│   └── components/
│       ├── ReportTypeList.tsx         # cards: Occupancy | Revenue | Collection | Maintenance
│       └── SavedReportsList.tsx

├── ReportViewerPage/
│   ├── ReportViewerPage.tsx
│   └── components/
│       ├── ReportFilters.tsx          # property, date range, group by
│       ├── ReportTable.tsx            # sortable data table
│       ├── ReportChart.tsx            # chart visualization of report data
│       ├── ExportButton.tsx           # triggers export job + polls for completion
│       └── ExportStatusModal.tsx      # shows "Generating..." → download link
```

### Key UI Behaviors

```
DashboardGrid (react-grid-layout):
- 12-column grid, row height = 80px
- Drag to reorder: hold widget title bar and drag
- Resize: drag bottom-right corner handle
- On drag/resize end: auto-save layout (debounced 500ms PUT /dashboard/layout)
- "Edit Layout" mode: shows widget borders + remove (×) buttons
- "Add Widget" panel: catalog with live search; click card to add at first available position

KpiCardWidget:
- Main value: large bold number with unit
- Trend: up arrow (green) / down arrow (red) / flat (gray) with % change vs previous period
- Sparkline: tiny 7-day line chart in card background
- Click: navigate to detailed report for that metric

WidgetContainer loading states:
- First load: skeleton placeholder (animated gray gradient)
- Background refresh: subtle "refreshing" spinner in top-right corner (no full skeleton)
- Error: error icon + "Failed to load" + retry button

Global filter bar:
- Property picker: multi-select (default = all properties user has access to)
- Date range: preset buttons (Today, MTD, QTD, YTD, Last 30d, Custom)
  Custom: date range picker
- Filter changes → clear all widget caches → refetch all widgets

ExportButton flow:
1. Click → POST /reports/:type/export → get exportId
2. Show "Generating report..." modal
3. Poll GET /reports/exports/:exportId every 3 seconds
4. On done: show "Download" button + send in-app notification
5. On failed: show error message + retry option
```

---

## State Management

```typescript
// src/store/slices/dashboardSlice.ts
interface DashboardFilters {
  propertyIds: string[];       // empty = all
  dateRange: {
    preset: 'today' | 'mtd' | 'qtd' | 'ytd' | 'last30' | 'custom';
    from: string;   // ISO date
    to: string;     // ISO date
  };
}

interface DashboardState {
  filters: DashboardFilters;
  editMode: boolean;
  addWidgetPanelOpen: boolean;
}

const defaultFilters: DashboardFilters = {
  propertyIds: [],
  dateRange: {
    preset: 'mtd',
    from: startOfMonth(new Date()).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
};

export const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: { filters: defaultFilters, editMode: false, addWidgetPanelOpen: false } as DashboardState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<DashboardFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    setDatePreset: (state, action: PayloadAction<DashboardFilters['dateRange']>) => {
      state.filters.dateRange = action.payload;
    },
    toggleEditMode: (state) => { state.editMode = !state.editMode; },
    toggleAddWidgetPanel: (state) => { state.addWidgetPanelOpen = !state.addWidgetPanelOpen; },
  },
});

// src/store/api/dashboardApi.ts
export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  tagTypes: ['Layout', 'WidgetData', 'Reports', 'Exports'],
  endpoints: (builder) => ({
    getWidgetCatalog: builder.query<WidgetCatalog, void>({
      query: () => '/dashboard/widgets',
    }),
    getWidgetData: builder.query<WidgetData, GetWidgetDataParams>({
      query: ({ code, propertyId, dateRange }) => ({
        url: `/dashboard/widget-data/${code}`,
        params: { propertyId, dateRange: `${dateRange.from},${dateRange.to}` },
      }),
      providesTags: (_, __, { code }) => [{ type: 'WidgetData', id: code }],
      // Re-fetch when global filters change
      keepUnusedDataFor: 300,
    }),
    getDashboardLayout: builder.query<DashboardLayout, string>({
      query: (dashboardKey) => ({ url: '/dashboard/layout', params: { dashboardKey } }),
      providesTags: ['Layout'],
    }),
    saveDashboardLayout: builder.mutation<void, SaveLayoutDto>({
      query: (body) => ({ url: '/dashboard/layout', method: 'PUT', body }),
      invalidatesTags: ['Layout'],
    }),
    resetDashboardLayout: builder.mutation<void, void>({
      query: () => ({ url: '/dashboard/layout/reset', method: 'POST' }),
      invalidatesTags: ['Layout'],
    }),
    exportReport: builder.mutation<ExportJobResponse, ExportReportDto>({
      query: ({ reportType, ...body }) => ({
        url: `/reports/${reportType}/export`,
        method: 'POST',
        body,
      }),
    }),
    getExportStatus: builder.query<ExportStatus, string>({
      query: (exportId) => `/reports/exports/${exportId}`,
      providesTags: (_, __, id) => [{ type: 'Exports', id }],
    }),
  }),
});

// Hook for polling export status
export const useExportPoller = (exportId: string | null) => {
  const [pollingInterval, setPollingInterval] = React.useState<number | false>(false);
  const { data } = dashboardApi.useGetExportStatusQuery(exportId!, {
    skip: !exportId,
    pollingInterval,
  });

  React.useEffect(() => {
    if (!exportId) return;
    setPollingInterval(3000);
  }, [exportId]);

  React.useEffect(() => {
    if (data?.status === 'done' || data?.status === 'failed') {
      setPollingInterval(false);
    }
  }, [data?.status]);

  return data;
};
```

---

## Widget Definition Seeds

```typescript
// src/modules/dashboard/seeds/widget-definitions.seed.ts
export const WIDGET_DEFINITIONS = [
  // ── Property ──
  { code: 'occupancy_rate',       name: 'Occupancy Rate',         category: 'property',    widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['properties.read'] },
  { code: 'vacancy_trend',        name: 'Vacancy Trend',          category: 'property',    widgetType: 'line_chart',  defaultWidth: 4, defaultHeight: 2, requiredPermissions: ['properties.read'] },
  { code: 'lease_expiring_soon',  name: 'Leases Expiring (90d)',  category: 'property',    widgetType: 'data_table',  defaultWidth: 4, defaultHeight: 3, requiredPermissions: ['leases.read'] },
  { code: 'unit_status_breakdown',name: 'Unit Status Breakdown',  category: 'property',    widgetType: 'pie_chart',   defaultWidth: 3, defaultHeight: 2, requiredPermissions: ['properties.read'] },
  // ── Finance ──
  { code: 'revenue_mtd',          name: 'Revenue MTD',            category: 'finance',     widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['billing.read'] },
  { code: 'revenue_ytd',          name: 'Revenue YTD',            category: 'finance',     widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['billing.read'] },
  { code: 'collection_rate',      name: 'Collection Rate',        category: 'finance',     widgetType: 'gauge',       defaultWidth: 2, defaultHeight: 2, requiredPermissions: ['ar.read'] },
  { code: 'overdue_invoices',     name: 'Overdue Invoices',       category: 'finance',     widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['ar.read'] },
  { code: 'revenue_by_property',  name: 'Revenue by Property',    category: 'finance',     widgetType: 'bar_chart',   defaultWidth: 6, defaultHeight: 3, requiredPermissions: ['billing.read'] },
  { code: 'ar_aging',             name: 'AR Aging Summary',       category: 'finance',     widgetType: 'bar_chart',   defaultWidth: 4, defaultHeight: 2, requiredPermissions: ['ar.read'] },
  // ── Maintenance ──
  { code: 'maintenance_open',     name: 'Open Tickets',           category: 'maintenance', widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['maintenance.read'] },
  { code: 'maintenance_sla',      name: 'SLA Breaches',           category: 'maintenance', widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['maintenance.read'] },
  { code: 'tickets_by_category',  name: 'Tickets by Category',    category: 'maintenance', widgetType: 'pie_chart',   defaultWidth: 3, defaultHeight: 2, requiredPermissions: ['maintenance.read'] },
  { code: 'maintenance_trend',    name: 'Maintenance Trend',      category: 'maintenance', widgetType: 'line_chart',  defaultWidth: 4, defaultHeight: 2, requiredPermissions: ['maintenance.read'] },
  // ── Security ──
  { code: 'visitor_count_today',  name: 'Visitors Today',         category: 'security',    widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['visitors.read'] },
  { code: 'incidents_this_week',  name: 'Incidents This Week',    category: 'security',    widgetType: 'kpi_card',    defaultWidth: 2, defaultHeight: 1, requiredPermissions: ['security.read'] },
];
```
