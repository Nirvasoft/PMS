import { useState, useCallback } from 'react';
import {
  useGetDashboardLayoutQuery,
  useGetWidgetDataQuery,
  useGetWidgetCatalogQuery,
  useSaveDashboardLayoutMutation,
  useResetDashboardLayoutMutation,
} from '../../store/api/dashboardApi';
import type { LayoutItem, WidgetData, KpiCardData, LineChartData, BarChartData, PieChartData, GaugeData, DataTableData, WidgetCatalogItem } from '../../store/api/dashboardApi';
import { useAppSelector, useAppDispatch } from '../../store';
import { setDatePreset, toggleEditMode, toggleAddWidgetPanel, closeAddWidgetPanel } from '../../store/slices/dashboardSlice';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Plus, X, Settings2, RotateCcw,
  Calendar, LayoutGrid, Maximize2, GripVertical, Trash2, Search,
  BarChart3, PieChart as PieChartIcon, Table2, Gauge, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import DrillDownModal from './DrillDownModal';
import './AnalyticsDashboard.css';

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
function getDateRange(preset: string): { from: string; to: string } {
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

const DATE_PRESETS = [
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
  const { filters, editMode, addWidgetPanelOpen } = useAppSelector((s) => s.dashboard);
  const { data: layoutData, isLoading: layoutLoading } = useGetDashboardLayoutQuery('main');
  const [saveLayout] = useSaveDashboardLayoutMutation();
  const [resetLayout] = useResetDashboardLayoutMutation();

  // Drill-down state
  const [drillDownData, setDrillDownData] = useState<{ widgetCode: string; drillKey?: string } | null>(null);

  const layout = (layoutData?.data?.layout || []) as LayoutItem[];

  const handlePreset = (preset: string) => {
    const range = getDateRange(preset);
    dispatch(setDatePreset({ preset: preset as any, ...range }));
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

  const handleReset = async () => {
    if (!confirm('Reset to default dashboard layout?')) return;
    try {
      await resetLayout().unwrap();
      toast.success('Dashboard reset');
    } catch { toast.error('Failed to reset'); }
  };

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

      {/* Widget Grid */}
      <div className="widget-grid">
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
          <div className="widget-rows">
            {/* Render widgets in row order based on y position */}
            {groupByRows(layout).map((row, ri) => (
              <div key={ri} className="widget-row">
                {row.map((item) => (
                  <div
                    key={item.id}
                    className={`widget-cell ${editMode ? 'edit-mode' : ''}`}
                    style={{ flex: `0 0 ${(item.w / 12) * 100}%`, maxWidth: `${(item.w / 12) * 100}%` }}
                  >
                    <WidgetContainer
                      item={item}
                      dateRange={filters.dateRange}
                      editMode={editMode}
                      onRemove={() => handleRemoveWidget(item.id)}
                      onDrillDown={(drillKey) => setDrillDownData({ widgetCode: item.widgetCode, drillKey })}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Widget Panel */}
      {addWidgetPanelOpen && (
        <AddWidgetPanel onAdd={handleAddWidget} onClose={() => dispatch(closeAddWidgetPanel())} />
      )}

      {/* Drill Down Modal */}
      {drillDownData && (
        <DrillDownModal
          widgetCode={drillDownData.widgetCode}
          drillKey={drillDownData.drillKey}
          onClose={() => setDrillDownData(null)}
        />
      )}
    </div>
  );
}

/** Group layout items into visual rows based on y position */
function groupByRows(layout: LayoutItem[]): LayoutItem[][] {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: LayoutItem[][] = [];
  let currentY = -1;

  for (const item of sorted) {
    if (item.y !== currentY) {
      rows.push([]);
      currentY = item.y;
    }
    rows[rows.length - 1].push(item);
  }
  return rows;
}

// ═══════════════════════════════════════════════════
// WIDGET CONTAINER
// ═══════════════════════════════════════════════════
function WidgetContainer({ item, dateRange, editMode, onRemove, onDrillDown }: {
  item: LayoutItem;
  dateRange: { from: string; to: string };
  editMode: boolean;
  onRemove: () => void;
  onDrillDown: (drillKey?: string) => void;
}) {
  const { data, isLoading, error, refetch } = useGetWidgetDataQuery({
    code: item.widgetCode,
    dateRange: `${dateRange.from},${dateRange.to}`,
  });

  const widgetData = data?.data;

  return (
    <div className="widget-container">
      {editMode && (
        <div className="widget-edit-bar">
          <GripVertical size={14} className="drag-handle" />
          <button className="widget-remove" onClick={onRemove}><Trash2 size={14} /></button>
        </div>
      )}

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
        <WidgetRenderer data={widgetData} onDrillDown={onDrillDown} />
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// WIDGET RENDERER — dispatches to type-specific components
// ═══════════════════════════════════════════════════
function WidgetRenderer({ data, onDrillDown }: { data: WidgetData; onDrillDown: (key?: string) => void }) {
  switch (data.type) {
    case 'kpi_card': return <KpiCardWidget data={data} onDrillDown={onDrillDown} />;
    case 'line_chart': return <LineChartWidget data={data} onDrillDown={onDrillDown} />;
    case 'bar_chart': return <BarChartWidget data={data} onDrillDown={onDrillDown} />;
    case 'pie_chart': return <PieChartWidget data={data} onDrillDown={onDrillDown} />;
    case 'gauge': return <GaugeWidget data={data} onDrillDown={onDrillDown} />;
    case 'data_table': return <DataTableWidget data={data} onDrillDown={onDrillDown} />;
    default: return <div className="widget-unknown">Unknown type: {(data as any).type}</div>;
  }
}

// ═══════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════
function KpiCardWidget({ data, onDrillDown }: { data: KpiCardData; onDrillDown: (k?: string) => void }) {
  const formatValue = (v: number, unit: string) => {
    if (unit === 'USD') return `$${v.toLocaleString()}`;
    if (unit === '%') return `${v}%`;
    return v.toLocaleString();
  };

  return (
    <div className="kpi-card" onClick={() => onDrillDown()} style={{ cursor: 'pointer' }}>
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
      <div className="kpi-value">{formatValue(data.value, data.unit)}</div>
      {data.trend?.label && <span className="kpi-sublabel">{data.trend.label}</span>}
      {data.breakdown && (
        <div className="kpi-breakdown">
          {Object.entries(data.breakdown).map(([k, v]) => (
            <div key={k} className="breakdown-item" onClick={(e) => { e.stopPropagation(); onDrillDown(k); }}>
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
function LineChartWidget({ data, onDrillDown }: { data: LineChartData; onDrillDown: (k?: string) => void }) {
  const theme = useChartTheme();
  const chartData = data.series[0]?.data.map((point, i) => {
    const row: Record<string, unknown> = { x: point.x };
    data.series.forEach((s) => { row[s.name] = s.data[i]?.y; });
    return row;
  }) || [];

  return (
    <div className="chart-widget" onClick={() => onDrillDown()} style={{ cursor: 'pointer' }}>
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
function BarChartWidget({ data, onDrillDown }: { data: BarChartData; onDrillDown: (k?: string) => void }) {
  const theme = useChartTheme();
  const chartData = data.series[0]?.data.map((d) => ({ name: d.x, value: d.y })) || [];

  return (
    <div className="chart-widget" style={{ cursor: 'pointer' }}>
      <h4 className="chart-title" onClick={() => onDrillDown()}>{data.label}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.tickFill }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: theme.tickFill }} tickLine={false} axisLine={false} width={50} />
          <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8, color: theme.tickFill }} cursor={{ fill: theme.cursorFill }} />
          <Bar dataKey="value" fill={theme.accent} radius={[4, 4, 0, 0]} onClick={(d) => onDrillDown(d.name)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PIE CHART
// ═══════════════════════════════════════════════════
function PieChartWidget({ data, onDrillDown }: { data: PieChartData; onDrillDown: (k?: string) => void }) {
  const theme = useChartTheme();
  return (
    <div className="chart-widget" style={{ cursor: 'pointer' }}>
      <h4 className="chart-title" onClick={() => onDrillDown()}>{data.label}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data.data}
            cx="50%" cy="50%"
            innerRadius={40} outerRadius={70}
            dataKey="value"
            stroke="none"
            paddingAngle={2}
            onClick={(d) => onDrillDown(d.name)}
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
function GaugeWidget({ data, onDrillDown }: { data: GaugeData; onDrillDown: (k?: string) => void }) {
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
    <div className="gauge-widget" onClick={() => onDrillDown()} style={{ cursor: 'pointer' }}>
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
function DataTableWidget({ data, onDrillDown }: { data: DataTableData; onDrillDown: (k?: string) => void }) {
  return (
    <div className="table-widget" onClick={() => onDrillDown()} style={{ cursor: 'pointer' }}>
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

  const CATEGORY_ICONS: Record<string, JSX.Element> = {
    property: <BarChart3 size={16} />,
    finance: <Activity size={16} />,
    maintenance: <Settings2 size={16} />,
    activity: <LayoutGrid size={16} />,
    security: <Gauge size={16} />,
  };

  const TYPE_ICONS: Record<string, JSX.Element> = {
    kpi_card: <BarChart3 size={14} />,
    line_chart: <Activity size={14} />,
    bar_chart: <BarChart3 size={14} />,
    pie_chart: <PieChartIcon size={14} />,
    gauge: <Gauge size={14} />,
    data_table: <Table2 size={14} />,
  };

  return (
    <div className="add-widget-overlay" onClick={onClose}>
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
