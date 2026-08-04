import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// ─── Widget Types ────────────────────────────

export interface WidgetCatalogItem {
  code: string;
  name: string;
  description: string | null;
  widgetType: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
}

export type WidgetCatalog = Record<string, WidgetCatalogItem[]>;

export interface WidgetTrend {
  direction: 'up' | 'down' | 'flat';
  changePercent: number;
  label: string;
}

export interface KpiCardData {
  type: 'kpi_card';
  label: string;
  value: number;
  unit: string;
  trend?: WidgetTrend;
  breakdown?: Record<string, number>;
  sparkline?: number[];
  updatedAt?: string;
}

export interface ChartSeries {
  name: string;
  data: Array<{ x: string; y: number }>;
}

export interface LineChartData {
  type: 'line_chart';
  label: string;
  series: ChartSeries[];
  xAxis: { label: string; type: string };
  yAxis: { label: string; unit: string };
  updatedAt?: string;
}

export interface BarChartData {
  type: 'bar_chart';
  label: string;
  series: ChartSeries[];
  yAxis: { label: string; unit: string };
  updatedAt?: string;
}

export interface PieChartData {
  type: 'pie_chart';
  label: string;
  data: Array<{ name: string; value: number; color: string }>;
  updatedAt?: string;
}

export interface GaugeData {
  type: 'gauge';
  label: string;
  value: number;
  unit: string;
  target?: number;
  breakdown?: Record<string, number>;
  updatedAt?: string;
}

export interface DataTableData {
  type: 'data_table';
  label: string;
  columns: string[];
  rows: string[][];
  updatedAt?: string;
}

export interface HeatmapData {
  type: 'heatmap';
  label: string;
  rows: string[];     // Y-axis labels (e.g. hours)
  columns: string[];  // X-axis labels (e.g. days)
  data: number[][];   // [row][col] intensity 0-100
  maxValue?: number;
  updatedAt?: string;
}

export type WidgetData = KpiCardData | LineChartData | BarChartData | PieChartData | GaugeData | DataTableData | HeatmapData;

export interface DrillDownColumn {
  key: string;
  label: string;
  link?: string;
}

export interface DrillDownResult {
  title: string;
  columns: DrillDownColumn[];
  rows: Record<string, unknown>[];
  total: number;
  navigateTo?: string;
}

export interface LayoutItem {
  id: string;
  widgetCode: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export interface DashboardLayoutResponse {
  dashboardKey: string;
  layout: LayoutItem[];
  updatedAt: string;
}

export interface SavedReport {
  id: string;
  name: string;
  reportType: string;
  parameters: Record<string, unknown>;
  schedule: Record<string, unknown> | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    email: string;
    profile?: { firstName: string; lastName: string };
  };
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── API ─────────────────────────────────────

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Layout', 'WidgetData', 'Reports'],
  endpoints: (builder) => ({
    getWidgetCatalog: builder.query<ApiResponse<WidgetCatalog>, void>({
      query: () => '/dashboard/widgets',
    }),

    getWidgetData: builder.query<ApiResponse<WidgetData>, { code: string; propertyId?: string; dateRange?: string }>({
      query: ({ code, propertyId, dateRange }) => ({
        url: `/dashboard/widget-data/${code}`,
        params: { ...(propertyId && { propertyId }), ...(dateRange && { dateRange }) },
      }),
      providesTags: (_r, _e, { code }) => [{ type: 'WidgetData', id: code }],
      keepUnusedDataFor: 300,
    }),

    getDashboardLayout: builder.query<ApiResponse<DashboardLayoutResponse>, string>({
      query: (dashboardKey) => ({ url: '/dashboard/layout', params: { dashboardKey } }),
      providesTags: ['Layout'],
    }),

    saveDashboardLayout: builder.mutation<{ success: boolean }, { dashboardKey: string; layout: LayoutItem[] }>({
      query: (body) => ({ url: '/dashboard/layout', method: 'PUT', body }),
      invalidatesTags: ['Layout'],
    }),

    resetDashboardLayout: builder.mutation<{ success: boolean }, void>({
      query: () => ({ url: '/dashboard/layout/reset', method: 'POST' }),
      invalidatesTags: ['Layout'],
    }),

    getDrillDown: builder.query<ApiResponse<DrillDownResult>, { code: string; drillKey?: string }>({
      query: ({ code, drillKey }) => ({
        url: `/dashboard/widget-data/${code}/drilldown`,
        params: { ...(drillKey && { drillKey }) },
      }),
    }),

    // ─── Reports ──────────────────────────────
    listReports: builder.query<
      PaginatedResponse<SavedReport>,
      { reportType?: string; page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/reports', params }),
      providesTags: ['Reports'],
    }),

    createReport: builder.mutation<
      ApiResponse<SavedReport>,
      { name: string; reportType: string; parameters?: Record<string, unknown> }
    >({
      query: (body) => ({ url: '/reports', method: 'POST', body }),
      invalidatesTags: ['Reports'],
    }),

    deleteReport: builder.mutation<void, string>({
      query: (id) => ({ url: `/reports/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Reports'],
    }),
  }),
});

export const {
  useGetWidgetCatalogQuery,
  useGetWidgetDataQuery,
  useGetDashboardLayoutQuery,
  useSaveDashboardLayoutMutation,
  useResetDashboardLayoutMutation,
  useLazyGetDrillDownQuery,
  useListReportsQuery,
  useCreateReportMutation,
  useDeleteReportMutation,
} = dashboardApi;
