import { useState, useCallback, useRef, useMemo, useEffect, type ReactNode } from 'react';
import { ResponsiveGridLayout as RGLResponsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = RGLResponsive as any;

import {
  useGetDashboardLayoutQuery,
  useGetWidgetDataQuery,
  useGetWidgetCatalogQuery,
  useSaveDashboardLayoutMutation,
  useResetDashboardLayoutMutation,
} from '../../store/api/dashboardApi';
import type { LayoutItem, WidgetData, KpiCardData, LineChartData, BarChartData, PieChartData, GaugeData, DataTableData, HeatmapData, WidgetCatalogItem } from '../../store/api/dashboardApi';
import { useAppSelector, useAppDispatch } from '../../store';
import {
  setDatePreset,
  toggleEditMode,
  setEditMode,
  toggleAddWidgetPanel,
  closeAddWidgetPanel,
  type DatePresetKey,
} from '../../store/slices/dashboardSlice';
import { useSelectedPropertyFilter } from '../../hooks/useSelectedPropertyId';
import { formatCompactAmount, formatFullAmount } from '../../utils/formatCurrency';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Plus, X, Settings2, RotateCcw,
  Calendar, LayoutGrid, GripVertical, Trash2, Search, ExternalLink,
  BarChart3, PieChart as PieChartIcon, Table2, Gauge, Activity,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useConfirm } from '../../components/DialogProvider';
import './AnalyticsDashboard.css';

const PROPERTY_UNIT_WIDGETS = new Set([
  'occupancy_rate',
  'vacancy_trend',
  'unit_status_breakdown',
]);

const WIDGET_LIST_ROUTES: Record<string, string> = {
  // Property & Leases
  lease_expiring_soon: '/admin/leases',
  // Finance & Billing
  revenue_mtd: '/admin/billing/invoices',
  revenue_ytd: '/admin/billing/invoices',
  overdue_invoices: '/admin/billing/invoices',
  revenue_by_property: '/admin/billing/invoices',
  collection_rate: '/admin/ar/collections',
  gl_net_income: '/admin/gl/pnl',
  bank_balance_summary: '/admin/banking',
  // Maintenance & Preventive Maintenance
  maintenance_open: '/admin/maintenance/tickets',
  maintenance_sla: '/admin/maintenance/tickets',
  tickets_by_category: '/admin/maintenance/tickets',
  maintenance_trend: '/admin/maintenance/tickets',
  occupancy_heatmap: '/admin/maintenance/tickets',
  pm_upcoming: '/admin/maintenance/pm',
  pm_compliance_rate: '/admin/maintenance/pm',
  // CRM
  crm_active_leads: '/admin/crm/leads',
  crm_lead_pipeline: '/admin/crm/leads',
  crm_conversion_rate: '/admin/crm/leads',
  // Facility & Parking
  facility_bookings_today: '/admin/facility/schedule',
  facility_utilization: '/admin/facility/schedule',
  parking_occupancy: '/admin/parking',
  parking_revenue: '/admin/parking',
  // Security & Visitors
  security_open_incidents: '/admin/security/incidents',
  security_incidents_trend: '/admin/security/incidents',
  visitors_today: '/admin/security/dashboard',
  visitors_trend: '/admin/security/dashboard',
  // Housekeeping & Inventory
  cleaning_completion_rate: '/admin/housekeeping',
  cleaning_open_tasks: '/admin/housekeeping',
  inventory_low_stock: '/admin/inventory/stock',
  inventory_movement_trend: '/admin/inventory/movements',
  // Activity & Workflows
  pending_tasks: '/tasks',
  active_workflows: '/admin/workflows',
  documents_expiring: '/documents',
  recent_activity: '/notifications',
};

/** Maps each dashboard widget code to its primary related list/module route. */
function resolveWidgetListRoute(widgetCode: string, propertyId?: string): string | null {
  if (PROPERTY_UNIT_WIDGETS.has(widgetCode)) {
    return propertyId ? `/admin/properties/${propertyId}?tab=units` : '/admin/properties';
  }
  return WIDGET_LIST_ROUTES[widgetCode] ?? null;
}

const CHART_COLORS = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#74b9ff', '#55efc4', '#a29bfe', '#fab1a0'];

/** Read CSS variable values at render time so charts adapt to theme changes */
function useChartTheme() {
  const root = document.documentElement;
  const get = (v: string) => getComputedStyle(root).getPropertyValue(v).trim();
  const isDark = root.getAttribute('data-theme') !== 'light';
  return {
    gridStroke: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
    tickFill: get('--text-muted') || '#8b95a5',
    tooltipBg: get('--surface-card') || (isDark ? '#1a1f2e' : '#ffffff'),
    tooltipBorder: get('--border') || (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'),
    cursorFill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    accent: get('--accent') || '#6c5ce7',
    legendColor: get('--text-secondary') || '#a3b1c6',
    gaugeBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
  };
}

// ═══════════════════════════════════════════════════
// DATE PRESETS
// ═══════════════════════════════════════════════════
function getDateRange(preset: DatePresetKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  switch (preset) {
    case 'today': return { from: to, to };
    case 'mtd': return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], to };
    case 'qtd': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), qMonth, 1).toISOString().split('T')[0], to };
    }
    case 'ytd': return { from: `${now.getFullYear()}-01-01`, to };
    case 'last30': {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return { from: d.toISOString().split('T')[0], to };
    }
    default: return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], to };
  }
}

const DATE_PRESETS: Array<{ key: DatePresetKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'mtd', label: 'MTD' },
  { key: 'qtd', label: 'QTD' },
  { key: 'ytd', label: 'YTD' },
  { key: 'last30', label: 'Last 30d' },
];

// ═══════════════════════════════════════════════════
// MAIN ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════
export default function AnalyticsDashboard() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { filters, editMode, addWidgetPanelOpen } = useAppSelector((s) => s.dashboard);

  // A successful load means the chunk fetched fine — clear the reload guard
  // so a future deploy gets its own one-time auto-recovery.
  useEffect(() => {
    sessionStorage.removeItem('dashboard-chunk-reload');
  }, []);
  const { data: layoutData, isLoading: layoutLoading } = useGetDashboardLayoutQuery('main');
  const [saveLayout] = useSaveDashboardLayoutMutation();
  const [resetLayout] = useResetDashboardLayoutMutation();
  const confirmDialog = useConfirm();

  // Measure container width (replaces library's useContainerWidth for reliability)
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width || 1200);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth || 1200);
    return () => ro.disconnect();
  }, []);

  const layout = (layoutData?.data?.layout || []) as LayoutItem[];
  // Widget data follows the sidebar's "Active Property" selector — not independently
  // choosable here, so every module reads the same scope.
  const selectedPropertyId = useSelectedPropertyFilter() || undefined;

  const handlePreset = (preset: DatePresetKey) => {
    const range = getDateRange(preset);
    dispatch(setDatePreset({ preset, ...range }));
  };

  const handleRemoveWidget = useCallback(async (widgetId: string) => {
    const newLayout = layout.filter((w) => w.id !== widgetId);
    try {
      await saveLayout({ dashboardKey: 'main', layout: newLayout }).unwrap();
      toast.success('Widget removed');
    } catch { toast.error('Failed to remove widget'); }
  }, [layout, saveLayout]);

  const handleAddWidget = useCallback(async (widget: WidgetCatalogItem) => {
    const maxY = layout.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    const newItem: LayoutItem = {
      id: `w_${Date.now()}`,
      widgetCode: widget.code,
      x: 0,
      y: maxY,
      w: widget.defaultWidth,
      h: widget.defaultHeight,
      config: {},
    };
    const newLayout = [...layout, newItem];
    try {
      await saveLayout({ dashboardKey: 'main', layout: newLayout }).unwrap();
      toast.success(`Added: ${widget.name}`);
      dispatch(closeAddWidgetPanel());
    } catch { toast.error('Failed to add widget'); }
  }, [layout, saveLayout, dispatch]);

  // ─── react-grid-layout integration ────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resetEpoch, setResetEpoch] = useState(0);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleReset = async () => {
    if (!(await confirmDialog('Reset to default dashboard layout? (Based on your role)', { danger: true, confirmText: 'Reset' }))) return;
    // Cancel any pending debounced drag/resize save so it never overwrites the reset
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await resetLayout('main').unwrap();
      if (editMode) dispatch(setEditMode(false));
      // Force ResponsiveGridLayout to remount cleanly from default coordinates
      setResetEpoch((n) => n + 1);
      toast.success('Dashboard layout reset to default');
    } catch { toast.error('Failed to reset'); }
  };

  /** Convert our LayoutItem[] → react-grid-layout's Layout[] across all breakpoints */
  const rglLayouts = useMemo(() => {
    const base12 = layout.map((item) => ({
      i: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      // Enforce minimum height of 2 rows (240px+margin) — h=1 (120px) is too small
      // for any widget content (KPI cards with sparklines, values, breakdowns, etc.)
      h: Math.max(item.h, 2),
      minW: 2,
      minH: 2,
    }));

    const stackForCols = (cols: number) => {
      let cursorY = 0;
      return base12.map((item) => {
        const y = cursorY;
        cursorY += item.h;
        return { ...item, x: 0, y, w: cols };
      });
    };

    return {
      lg: base12,
      md: base12,
      sm: stackForCols(6),
      xs: stackForCols(4),
    };
  }, [layout]);

  /** Called only on explicit user drag/resize stop (never on programmatic reset or resize). */
  const handleUserLayoutCommit = useCallback((newRglLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
    if (!editMode) return;
    // Map RGL layout back to our LayoutItem format
    const updated: LayoutItem[] = newRglLayout.map((rgl) => {
      const existing = layout.find((l) => l.id === rgl.i);
      return {
        id: rgl.i,
        widgetCode: existing?.widgetCode || '',
        x: rgl.x,
        y: rgl.y,
        w: rgl.w,
        h: rgl.h,
        config: existing?.config || {},
      };
    }).filter((l) => l.widgetCode); // safety: skip unmapped items

    // Debounced auto-save (600ms after last drag/resize)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      try {
        await saveLayout({ dashboardKey: 'main', layout: updated }).unwrap();
      } catch { /* silent — user can manually retry */ }
    }, 600);
  }, [editMode, layout, saveLayout]);

  return (
    <div className="analytics-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <BarChart3 size={24} className="header-icon" />
          <div>
            <h1>Analytics Dashboard</h1>
            <p className="subtitle">Real-time overview of your property portfolio</p>
          </div>
        </div>
        <div className="header-controls">
          {/* Date presets */}
          <div className="date-presets">
            <Calendar size={14} />
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`preset-btn ${filters.dateRange.preset === p.key ? 'active' : ''}`}
                onClick={() => handlePreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="header-actions">
            <button className="btn-icon-sm" onClick={() => dispatch(toggleAddWidgetPanel())} title="Add Widget">
              <Plus size={16} />
            </button>
            <button className={`btn-icon-sm ${editMode ? 'active' : ''}`} onClick={() => dispatch(toggleEditMode())} title="Edit Layout">
              <Settings2 size={16} />
            </button>
            <button className="btn-icon-sm" onClick={handleReset} title="Reset Layout">
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Widget Grid — react-grid-layout */}
      <div className="widget-grid" ref={gridContainerRef}>
        {layoutLoading ? (
          <div className="grid-loading">
            {[1,2,3,4].map((i) => <div key={i} className="widget-skeleton" />)}
          </div>
        ) : layout.length === 0 ? (
          <div className="empty-dashboard">
            <LayoutGrid size={48} />
            <h3>No widgets configured</h3>
            <p>Add widgets to build your dashboard</p>
            <button className="btn-primary" onClick={() => dispatch(toggleAddWidgetPanel())}>
              <Plus size={16} /> Add Widgets
            </button>
          </div>
        ) : (
          <ResponsiveGridLayout
            key={`rgl-grid-${resetEpoch}`}
            className="rgl-grid"
            layouts={rglLayouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
            cols={{ lg: 12, md: 12, sm: 6, xs: 4 }}
            rowHeight={120}
            width={containerWidth || 1200}
            isDraggable={editMode}
            isResizable={editMode}
            draggableCancel=".widget-remove,.widget-nav-btn,button,a,input,textarea,select"
            compactType="vertical"
            margin={[12, 12]}
            containerPadding={[0, 0]}
            onDragStop={(newLayout: any) => handleUserLayoutCommit(newLayout)}
            onResizeStop={(newLayout: any) => handleUserLayoutCommit(newLayout)}
            useCSSTransforms
          >
            {layout.map((item) => {
              const targetRoute = resolveWidgetListRoute(item.widgetCode, selectedPropertyId);
              return (
                <div key={item.id} className={`rgl-widget-wrapper ${editMode ? 'edit-mode' : ''}`}>
                  <WidgetContainer
                    item={item}
                    dateRange={filters.dateRange}
                    propertyId={selectedPropertyId}
                    editMode={editMode}
                    targetRoute={targetRoute}
                    onNavigate={targetRoute ? () => navigate(targetRoute) : undefined}
                    onRemove={() => handleRemoveWidget(item.id)}
                  />
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>

      {/* Add Widget Panel */}
      {addWidgetPanelOpen && (
        <AddWidgetPanel onAdd={handleAddWidget} onClose={() => dispatch(closeAddWidgetPanel())} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// WIDGET CONTAINER
// ═══════════════════════════════════════════════════
function WidgetContainer({ item, dateRange, propertyId, editMode, targetRoute, onNavigate, onRemove }: {
  item: LayoutItem;
  dateRange: { from: string; to: string };
  propertyId?: string;
  editMode: boolean;
  targetRoute: string | null;
  onNavigate?: () => void;
  onRemove: () => void;
}) {
  const { data, isLoading, error, refetch } = useGetWidgetDataQuery({
    code: item.widgetCode,
    dateRange: `${dateRange.from},${dateRange.to}`,
    propertyId,
  }, {
    // Widgets summarize data that changes elsewhere in the app (leases, tickets, invoices, …)
    // with no cross-module cache invalidation wired up, so poll and refetch on focus/reconnect
    // instead of requiring a full page reload to see updates.
    pollingInterval: 30000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const widgetData = data?.data;
  const showNavBtn = !editMode && !!targetRoute && !!onNavigate && !isLoading && !error && !widgetData?.disabled;
  const hasTopAction = editMode || showNavBtn;

  return (
    <div className={`widget-container ${hasTopAction ? 'has-top-action' : ''}`}>
      {editMode ? (
        <div className="widget-edit-bar">
          <GripVertical size={14} className="drag-handle" />
          <button
            type="button"
            className="widget-remove"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title="Remove widget"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : showNavBtn ? (
        <button
          type="button"
          className="widget-nav-btn"
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          title="View related list"
          aria-label="View related list"
        >
          <ExternalLink size={13} />
        </button>
      ) : null}

      {isLoading ? (
        <div className="widget-loading">
          <div className="loading-pulse" />
        </div>
      ) : error ? (
        <div className="widget-error">
          <p>Failed to load</p>
          <button onClick={() => refetch()}>Retry</button>
        </div>
      ) : widgetData ? (
        <WidgetRenderer data={widgetData} widgetCode={item.widgetCode} />
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// WIDGET RENDERER — dispatches to type-specific components
// ═══════════════════════════════════════════════════
function WidgetRenderer({ data, widgetCode }: { data: WidgetData; widgetCode: string }) {
  // Server sends this shape for any widget type whose feature flag is off —
  // it carries no type-specific fields (data/series/columns), so it must be
  // handled before dispatching to a type-specific renderer.
  if (data.disabled) {
    return <div className="widget-disabled">Not available</div>;
  }
  switch (data.type) {
    case 'kpi_card': return <KpiCardWidget data={data} widgetCode={widgetCode} />;
    case 'line_chart': return <LineChartWidget data={data} />;
    case 'bar_chart': return <BarChartWidget data={data} />;
    case 'pie_chart': return <PieChartWidget data={data} />;
    case 'gauge': return <GaugeWidget data={data} />;
    case 'data_table': return <DataTableWidget data={data} />;
    case 'heatmap': return <HeatmapWidget data={data} />;
    default: return <div className="widget-unknown">Unknown type: {(data as any).type}</div>;
  }
}

// ═══════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════
function KpiCardWidget({ data, widgetCode }: { data: KpiCardData; widgetCode?: string }) {
  const formatNum = (v: number, compact = true) =>
    compact ? formatCompactAmount(v) : formatFullAmount(v);

  const effectiveUnit = widgetCode === 'revenue_mtd' ? '' : data.unit;

  const formatValue = (v: number, unit: string, compact = true) => {
    if (/^[A-Z]{3}$/.test(unit || '')) {
      let symbol = unit;
      try {
        symbol = new Intl.NumberFormat('en', { style: 'currency', currency: unit, currencyDisplay: 'narrowSymbol' })
          .formatToParts(0).find(p => p.type === 'currency')?.value || unit;
      } catch { /* unknown code: fall back to the code itself */ }
      if (symbol === unit && unit === 'MMK') symbol = 'K';
      return `${symbol}${formatNum(v, compact)}`;
    }
    if (unit === '%') return `${v}%`;
    if (unit) return `${unit} ${formatNum(v, compact)}`;
    return formatNum(v, compact);
  };

  return (
    <div className="kpi-card">
      {/* Sparkline background */}
      {data.sparkline && data.sparkline.length > 1 && (
        <svg className="kpi-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`spark-${data.label.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent, #6c5ce7)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent, #6c5ce7)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const min = Math.min(...data.sparkline!);
            const max = Math.max(...data.sparkline!);
            const range = max - min || 1;
            const pts = data.sparkline!.map((v, i) => {
              const x = (i / (data.sparkline!.length - 1)) * 100;
              const y = 40 - ((v - min) / range) * 36;
              return `${x},${y}`;
            });
            const linePath = `M${pts.join(' L')}`;
            const areaPath = `${linePath} L100,40 L0,40 Z`;
            return (
              <>
                <path d={areaPath} fill={`url(#spark-${data.label.replace(/\s+/g, '')})`} />
                <path d={linePath} fill="none" stroke="var(--accent, #6c5ce7)" strokeWidth="1.5" strokeLinecap="round" />
              </>
            );
          })()}
        </svg>
      )}
      <div className="kpi-header">
        <span className="kpi-label">{data.label}</span>
        {data.trend && (
          <div className={`kpi-trend ${data.trend.direction}`}>
            {data.trend.direction === 'up' && <TrendingUp size={14} />}
            {data.trend.direction === 'down' && <TrendingDown size={14} />}
            {data.trend.direction === 'flat' && <Minus size={14} />}
            <span>{Math.abs(data.trend.changePercent)}%</span>
          </div>
        )}
      </div>
      <div className="kpi-value" title={formatValue(data.value, effectiveUnit, false)}>{formatValue(data.value, effectiveUnit, true)}</div>
      {data.trend?.label && <span className="kpi-sublabel">{data.trend.label}</span>}
      {data.breakdown && (
        <div className="kpi-breakdown">
          {Object.entries(data.breakdown).map(([k, v]) => (
            <div key={k} className="breakdown-item">
              <span className="breakdown-value">{v.toLocaleString()}</span>
              <span className="breakdown-label">{k}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LINE CHART
// ═══════════════════════════════════════════════════
function LineChartWidget({ data }: { data: LineChartData }) {
  const theme = useChartTheme();
  const chartData = data.series[0]?.data.map((point, i) => {
    const row: Record<string, unknown> = { x: point.x };
    data.series.forEach((s) => { row[s.name] = s.data[i]?.y; });
    return row;
  }) || [];

  return (
    <div className="chart-widget">
      <h4 className="chart-title">{data.label}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData}>
          <defs>
            {data.series.map((s, i) => (
              <linearGradient key={s.name} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS[i]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_COLORS[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="x" tick={{ fontSize: 11, fill: theme.tickFill }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: theme.tickFill }} tickLine={false} axisLine={false} width={40} />
          <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8, color: theme.tickFill }} />
          {data.series.map((s, i) => (
            <Area key={s.name} type="monotone" dataKey={s.name} stroke={CHART_COLORS[i]} fill={`url(#grad-${i})`} strokeWidth={2} dot={false} />
          ))}
          {data.series.length > 1 && <Legend />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// BAR CHART
// ═══════════════════════════════════════════════════
function BarChartWidget({ data }: { data: BarChartData }) {
  const theme = useChartTheme();
  const chartData = data.series[0]?.data.map((d) => ({ name: d.x, value: d.y })) || [];

  return (
    <div className="chart-widget">
      <h4 className="chart-title">{data.label}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.tickFill }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: theme.tickFill }} tickLine={false} axisLine={false} width={50} />
          <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8, color: theme.tickFill }} cursor={{ fill: theme.cursorFill }} />
          <Bar dataKey="value" fill={theme.accent} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PIE CHART
// ═══════════════════════════════════════════════════
function PieChartWidget({ data }: { data: PieChartData }) {
  const theme = useChartTheme();
  return (
    <div className="chart-widget">
      <h4 className="chart-title">{data.label}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data.data}
            cx="50%" cy="50%"
            innerRadius={40} outerRadius={70}
            dataKey="value"
            stroke="none"
            paddingAngle={2}
          >
            {data.data.map((entry, i) => (
              <Cell key={i} fill={entry.color || CHART_COLORS[i]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8, color: theme.tickFill }} />
          <Legend verticalAlign="bottom" height={36} formatter={(value: string) => <span style={{ color: theme.legendColor, fontSize: 11 }}>{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// GAUGE
// ═══════════════════════════════════════════════════
function GaugeWidget({ data }: { data: GaugeData }) {
  const theme = useChartTheme();
  const angle = (data.value / 100) * 180;
  const radius = 60;
  const cx = 80;
  const cy = 75;

  const startAngle = Math.PI;
  const endAngle = startAngle - (angle * Math.PI) / 180;

  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy - radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy - radius * Math.sin(endAngle);

  const largeArc = angle > 180 ? 1 : 0;

  return (
    <div className="gauge-widget">
      <h4 className="chart-title">{data.label}</h4>
      <div className="gauge-container">
        <svg viewBox="0 0 160 90" className="gauge-svg">
          {/* Background arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none" stroke={theme.gaugeBg} strokeWidth="12" strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={theme.accent} strokeWidth="12" strokeLinecap="round"
          />
        </svg>
        <div className="gauge-value">{data.value}{data.unit}</div>
        {data.target && <div className="gauge-target">Target: {data.target}%</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// DATA TABLE
// ═══════════════════════════════════════════════════
function DataTableWidget({ data }: { data: DataTableData }) {
  return (
    <div className="table-widget">
      <h4 className="chart-title">{data.label}</h4>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{data.columns.map((col) => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ADD WIDGET PANEL
// ═══════════════════════════════════════════════════
function AddWidgetPanel({ onAdd, onClose }: {
  onAdd: (widget: WidgetCatalogItem) => void;
  onClose: () => void;
}) {
  const { data: catalogData } = useGetWidgetCatalogQuery();
  const [search, setSearch] = useState('');
  const catalog = catalogData?.data || {};

  const CATEGORY_ICONS: Record<string, ReactNode> = {
    property: <BarChart3 size={16} />,
    finance: <Activity size={16} />,
    maintenance: <Settings2 size={16} />,
    activity: <LayoutGrid size={16} />,
    security: <Gauge size={16} />,
  };

  const TYPE_ICONS: Record<string, ReactNode> = {
    kpi_card: <BarChart3 size={14} />,
    line_chart: <Activity size={14} />,
    bar_chart: <BarChart3 size={14} />,
    pie_chart: <PieChartIcon size={14} />,
    gauge: <Gauge size={14} />,
    data_table: <Table2 size={14} />,
  };

  return (
    <div className="add-widget-overlay">
      <aside className="add-widget-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3><Plus size={18} /> Add Widget</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="panel-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search widgets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="panel-body">
          {Object.entries(catalog).map(([category, widgets]) => {
            const filtered = (widgets as WidgetCatalogItem[]).filter((w) =>
              !search || w.name.toLowerCase().includes(search.toLowerCase()),
            );
            if (filtered.length === 0) return null;

            return (
              <div key={category} className="catalog-section">
                <h4 className="catalog-category">
                  {CATEGORY_ICONS[category] || <LayoutGrid size={16} />}
                  {category}
                </h4>
                <div className="catalog-items">
                  {filtered.map((w) => (
                    <button key={w.code} className="catalog-item" onClick={() => onAdd(w)}>
                      {TYPE_ICONS[w.widgetType] || <BarChart3 size={14} />}
                      <div className="item-info">
                        <span className="item-name">{w.name}</span>
                        <span className="item-type">{w.widgetType.replace(/_/g, ' ')}</span>
                      </div>
                      <Plus size={14} className="add-icon" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// HEATMAP WIDGET
// ═══════════════════════════════════════════════════
function HeatmapWidget({ data }: { data: HeatmapData }) {
  const getColor = (intensity: number): string => {
    if (intensity === 0) return 'var(--surface-hover, rgba(255,255,255,0.03))';
    // Purple gradient: low = light, high = vivid
    const alpha = 0.1 + (intensity / 100) * 0.8;
    return `rgba(108, 92, 231, ${alpha})`;
  };

  // Show only business hours (6AM - 10PM) to keep it readable
  const startHour = 6;
  const endHour = 22;
  const visibleRows = data.rows.slice(startHour, endHour);
  const visibleData = data.data.slice(startHour, endHour);

  return (
    <div className="heatmap-widget">
      <div className="heatmap-header">
        <span className="heatmap-label">{data.label}</span>
        <span className="heatmap-sublabel">Last 30 days • Intensity by hour</span>
      </div>
      <div className="heatmap-grid">
        {/* Column headers */}
        <div className="heatmap-row heatmap-col-headers">
          <div className="heatmap-hour-label" />
          {data.columns.map((col) => (
            <div key={col} className="heatmap-col-label">{col}</div>
          ))}
        </div>
        {/* Data rows */}
        {visibleData.map((row, ri) => (
          <div key={ri} className="heatmap-row">
            <div className="heatmap-hour-label">{visibleRows[ri]}</div>
            {row.map((val, ci) => (
              <div
                key={ci}
                className="heatmap-cell"
                style={{ background: getColor(val) }}
                title={`${visibleRows[ri]} ${data.columns[ci]}: ${val}%`}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="heatmap-legend">
        <span>Low</span>
        <div className="heatmap-legend-gradient" />
        <span>High</span>
      </div>
    </div>
  );
}
