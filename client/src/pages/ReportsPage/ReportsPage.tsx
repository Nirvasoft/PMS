import { useState, useEffect } from 'react';
import { useAppSelector } from '../../store';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import {
  useListReportsQuery,
  useCreateReportMutation,
  useDeleteReportMutation,
  useGetWidgetDataQuery,
  useLazyGetWidgetDataQuery,
} from '../../store/api/dashboardApi';
import type { SavedReport, WidgetData } from '../../store/api/dashboardApi';
import {
  FileText, Trash2, X, Clock,
  BarChart3, PieChart as PieChartIcon, TrendingUp, Activity,
  Building2, DollarSign, Wrench, Calendar,
  Play, RefreshCw, ChevronLeft, ChevronRight, Download, Save,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from 'recharts';
import toast from 'react-hot-toast';
import { useConfirm } from '../../components/DialogProvider';
import { TableScrollWrapper } from '../../components/TableScrollWrapper';
import '../admin/MaintenancePage/MaintenancePage.css';
import './ReportsPage.css';

// ═══════════════════════════════════════════════════
// REPORT TYPE DEFINITIONS
// ═══════════════════════════════════════════════════
const REPORT_TYPES = [
  {
    code: 'occupancy',
    name: 'Occupancy Report',
    icon: <Building2 size={22} />,
    color: '#10b981',
    widgetCode: 'occupancy_rate',
  },
  {
    code: 'vacancy_trend',
    name: 'Vacancy Trend',
    icon: <TrendingUp size={22} />,
    color: '#10b981',
    widgetCode: 'vacancy_trend',
  },
  {
    code: 'revenue',
    name: 'Revenue Report',
    icon: <DollarSign size={22} />,
    color: '#10b981',
    widgetCode: 'revenue_by_property',
  },
  {
    code: 'collection',
    name: 'Collection Report',
    icon: <Activity size={22} />,
    color: '#fd79a8',
    widgetCode: 'collection_rate',
  },
  {
    code: 'overdue',
    name: 'Overdue Invoices',
    icon: <Clock size={22} />,
    color: '#e17055',
    widgetCode: 'overdue_invoices',
  },
  {
    code: 'maintenance',
    name: 'Maintenance Report',
    icon: <Wrench size={22} />,
    color: '#74b9ff',
    widgetCode: 'maintenance_open',
  },
  {
    code: 'unit_status',
    name: 'Unit Status Breakdown',
    icon: <PieChartIcon size={22} />,
    color: '#a29bfe',
    widgetCode: 'unit_status_breakdown',
  },
  {
    code: 'lease_expiry',
    name: 'Lease Expiry Report',
    icon: <Calendar size={22} />,
    color: '#55efc4',
    widgetCode: 'lease_expiring_soon',
  },
];

const CHART_COLORS = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#74b9ff', '#55efc4', '#a29bfe', '#fab1a0'];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDefaultDateRange() {
  return {
    from: '',
    to: '',
  };
}

function getMonthDateRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    to: now.toISOString().split('T')[0],
  };
}

function getYearDateRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0],
    to: now.toISOString().split('T')[0],
  };
}

// ═══════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ═══════════════════════════════════════════════════
export default function ReportsPage() {
  const selectedPropertyId = useSelectedPropertyId();
  const [activeTab, setActiveTab] = useState<'types' | 'saved'>('types');
  const [selectedReport, setSelectedReport] = useState<string>(REPORT_TYPES[0].widgetCode);
  const [selectedReportName, setSelectedReportName] = useState<string>(REPORT_TYPES[0].name);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(getDefaultDateRange);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [runKey, setRunKey] = useState(0);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const selectedTypeDef = REPORT_TYPES.find((rt) => rt.widgetCode === selectedReport);

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1>Reports</h1>
            <p>{REPORT_TYPES.length} report types</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="reports-tabs">
        <button
          className={`tab-btn ${activeTab === 'types' ? 'active' : ''}`}
          onClick={() => setActiveTab('types')}
        >
          <BarChart3 size={16} /> Report Types
        </button>
        <button
          className={`tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          <Save size={16} /> Saved Reports
        </button>
      </div>

      {/* Content */}
      {activeTab === 'types' ? (
        <>
          {/* Horizontal Icon Bar */}
          <div className="report-compact-bar">
            <div className="report-icon-strip">
              {REPORT_TYPES.map((rt) => {
                const isActive = selectedReport === rt.widgetCode;
                return (
                  <button
                    key={rt.code}
                    type="button"
                    className={`report-icon-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedReport(rt.widgetCode);
                      setSelectedReportName(rt.name);
                      setViewMode('chart');
                    }}
                    style={
                      isActive
                        ? { borderColor: rt.color, background: `${rt.color}18` }
                        : undefined
                    }
                  >
                    <span
                      className="report-icon-box"
                      style={{ background: `${rt.color}18`, color: rt.color }}
                    >
                      {rt.icon}
                    </span>
                    <span className="report-icon-label">{rt.name}</span>
                    <span className="report-icon-tooltip">{rt.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Report viewer immediately visible below icon bar */}
          <ReportViewer
            widgetCode={selectedReport}
            reportName={selectedReportName}
            propertyId={selectedPropertyId || undefined}
            from={dateRange.from}
            to={dateRange.to}
            onDateRangeChange={setDateRange}
            view={viewMode}
            onViewChange={setViewMode}
            runKey={runKey}
            onSave={() => setShowSaveModal(true)}
          />
        </>
      ) : (
        <SavedReportsList
          onRun={(report) => {
            const matched = REPORT_TYPES.find(
              (rt) =>
                rt.code === report.reportType ||
                rt.widgetCode === report.reportType ||
                rt.name === report.reportType,
            );
            const params = (report.parameters || {}) as {
              dateFrom?: string;
              dateTo?: string;
              view?: 'chart' | 'table';
            };
            const defaults = getDefaultDateRange();
            setSelectedReport(matched ? matched.widgetCode : REPORT_TYPES[0].widgetCode);
            setSelectedReportName(report.name);
            setDateRange({
              from: params.dateFrom ?? defaults.from,
              to: params.dateTo ?? defaults.to,
            });
            setViewMode(params.view === 'table' ? 'table' : 'chart');
            setRunKey((prev) => prev + 1);
            setActiveTab('types');
            toast.success(`Running "${report.name}"`);
          }}
        />
      )}

      {/* Save Report Modal */}
      {showSaveModal && (
        <SaveReportModal
          reportType={selectedReport}
          reportTypeName={selectedTypeDef?.name || selectedReportName}
          defaultName={selectedReportName}
          parameters={{
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            view: viewMode,
          }}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// REPORT VIEWER — displays widget data as a report
// ═══════════════════════════════════════════════════
function ReportViewer({
  widgetCode,
  reportName,
  propertyId,
  from,
  to,
  onDateRangeChange,
  view,
  onViewChange,
  runKey,
  onSave,
}: {
  widgetCode: string;
  reportName: string;
  propertyId?: string;
  from: string;
  to: string;
  onDateRangeChange: (range: { from: string; to: string }) => void;
  view: 'chart' | 'table';
  onViewChange: (v: 'chart' | 'table') => void;
  runKey: number;
  onSave: () => void;
}) {
  const dateRangeParam = from || to ? `${from},${to}` : undefined;
  const { data, isLoading, isFetching, error } = useGetWidgetDataQuery({
    code: widgetCode,
    propertyId,
    dateRange: dateRangeParam,
  });
  const [triggerRefresh] = useLazyGetWidgetDataQuery();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const widgetData = data?.data;
  const [exporting, setExporting] = useState<string | null>(null);
  const refreshing = isRefreshing || (isFetching && !isLoading);

  useEffect(() => {
    if (runKey > 0) {
      triggerRefresh(
        { code: widgetCode, propertyId, dateRange: dateRangeParam, refresh: true },
        false,
      );
    }
  }, [runKey, widgetCode, propertyId, dateRangeParam, triggerRefresh]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        triggerRefresh(
          { code: widgetCode, propertyId, dateRange: dateRangeParam, refresh: true },
          false,
        ).unwrap(),
        new Promise((resolve) => setTimeout(resolve, 350)),
      ]);
      toast.success('Report data refreshed');
    } catch {
      toast.error('Failed to refresh report data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const res = await fetch(`/api/v1/reports/${widgetCode}/export`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          format,
          parameters: {
            propertyId,
            dateFrom: from || undefined,
            dateTo: to || undefined,
          },
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') ||
        `${widgetCode}_${from || 'all_time'}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error(`Failed to export as ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  const monthRange = getMonthDateRange();
  const yearRange = getYearDateRange();
  const isAllTime = !from && !to;
  const isThisMonth = from === monthRange.from && to === monthRange.to;
  const isThisYear = from === yearRange.from && to === yearRange.to;

  return (
    <div className="report-viewer">
      <div className="viewer-header">
        <div className="viewer-title">
          <BarChart3 size={18} />
          <h2>{reportName}</h2>
          <span className="viewer-date">
            {isAllTime
              ? 'All Time'
              : `${from ? formatDate(from) : 'Start'} — ${to ? formatDate(to) : 'Now'}`}
          </span>
        </div>
        <div className="viewer-actions">
          <button
            className="btn-primary-sm"
            onClick={() => handleExport('xlsx')}
            disabled={!!exporting || isLoading}
          >
            <Download size={14} /> {exporting === 'xlsx' ? 'Exporting...' : 'Excel'}
          </button>
          <button
            className="btn-secondary-sm"
            onClick={() => handleExport('csv')}
            disabled={!!exporting || isLoading}
          >
            <Download size={14} /> {exporting === 'csv' ? 'Exporting...' : 'CSV'}
          </button>
          <button className="btn-secondary-sm" onClick={onSave}>
            <Save size={14} /> Save Config
          </button>
          <button
            className="btn-secondary-sm"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
          >
            <RefreshCw size={14} className={refreshing ? 'spin-icon' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Date Range Filter Bar */}
      <div className="viewer-filter-bar">
        <div className="viewer-date-presets">
          <button
            type="button"
            className={`date-preset-btn ${isAllTime ? 'active' : ''}`}
            onClick={() => onDateRangeChange({ from: '', to: '' })}
          >
            All Time
          </button>
          <button
            type="button"
            className={`date-preset-btn ${isThisYear ? 'active' : ''}`}
            onClick={() => onDateRangeChange(yearRange)}
          >
            This Year
          </button>
          <button
            type="button"
            className={`date-preset-btn ${isThisMonth ? 'active' : ''}`}
            onClick={() => onDateRangeChange(monthRange)}
          >
            This Month
          </button>
        </div>
        <div className="viewer-date-inputs">
          <label className="date-input-group">
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => onDateRangeChange({ from: e.target.value, to })}
            />
          </label>
          <label className="date-input-group">
            <span>To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => onDateRangeChange({ from, to: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className={`viewer-body ${refreshing ? 'viewer-body-refreshing' : ''}`}>
        {isLoading ? (
          <div className="viewer-loading">
            <div className="spinner" />
            <p>Generating report data...</p>
          </div>
        ) : error ? (
          <div className="viewer-error">
            <p>Failed to load report data</p>
            <button className="btn-primary-sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        ) : widgetData ? (
          <ReportDataRenderer data={widgetData} view={view} onViewChange={onViewChange} />
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// REPORT DATA RENDERER — chart + table views
// ═══════════════════════════════════════════════════
function ReportDataRenderer({
  data,
  view,
  onViewChange,
}: {
  data: WidgetData;
  view: 'chart' | 'table';
  onViewChange: (v: 'chart' | 'table') => void;
}) {
  return (
    <div className="report-data">
      <div className="data-view-toggle">
        <button className={`toggle-btn ${view === 'chart' ? 'active' : ''}`} onClick={() => onViewChange('chart')}>
          <BarChart3 size={14} /> Chart
        </button>
        <button className={`toggle-btn ${view === 'table' ? 'active' : ''}`} onClick={() => onViewChange('table')}>
          <FileText size={14} /> Table
        </button>
      </div>

      {view === 'chart' ? (
        <div className="chart-area">
          {data.type === 'kpi_card' && <KpiReportView data={data} />}
          {data.type === 'line_chart' && <LineReportView data={data} />}
          {data.type === 'bar_chart' && <BarReportView data={data} />}
          {data.type === 'pie_chart' && <PieReportView data={data} />}
          {data.type === 'gauge' && <GaugeReportView data={data} />}
          {data.type === 'data_table' && <TableReportView data={data} />}
        </div>
      ) : (
        <div className="table-area">
          <RawDataTable data={data} />
        </div>
      )}
    </div>
  );
}

function KpiReportView({ data }: { data: any }) {
  const trendColor = data.trend?.direction === 'up' ? '#2ecc71' : data.trend?.direction === 'down' ? '#e74c3c' : '#95a5a6';
  return (
    <div className="kpi-report">
      <div className="kpi-big-value">
        <span className="value">{data.unit === 'USD' ? `$${Number(data.value).toLocaleString()}` : data.unit === '%' ? `${data.value}%` : Number(data.value).toLocaleString()}</span>
        <span className="label">{data.label}</span>
      </div>
      {data.trend && (
        <div className="kpi-trend-row" style={{ color: trendColor }}>
          {data.trend.direction === 'up' ? <TrendingUp size={18} /> : data.trend.direction === 'down' ? <TrendingUp size={18} style={{ transform: 'rotate(180deg)' }} /> : null}
          <span>{Math.abs(data.trend.changePercent)}% {data.trend.label}</span>
        </div>
      )}
      {data.breakdown && (
        <div className="kpi-breakdown">
          {Object.entries(data.breakdown).map(([key, val]) => (
            <div key={key} className="breakdown-item">
              <span className="breakdown-label">{key.replace(/_/g, ' ')}</span>
              <span className="breakdown-value">{Number(val).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useChartTheme() {
  const themeMode = useAppSelector((s) => s.theme.mode);
  const isLight = themeMode === 'light';

  return {
    gridStroke: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.06)',
    tickFill: isLight ? '#64748b' : '#8b95a5',
    tooltipBg: isLight ? '#ffffff' : '#1a1f2e',
    tooltipBorder: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.08)',
    tooltipShadow: isLight ? '0 8px 24px rgba(15, 23, 42, 0.12)' : '0 8px 24px rgba(0, 0, 0, 0.4)',
    textPrimary: isLight ? '#0f172a' : '#e2e8f0',
    legendColor: isLight ? '#475569' : '#8b95a5',
    gaugeTrack: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)',
  };
}

const BAR_GREEN_PALETTE = ['#10b981', '#059669', '#34d399', '#047857', '#6ee7b7'];

function LineReportView({ data }: { data: any }) {
  const ct = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data.series[0]?.data}>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
        <XAxis dataKey="x" tick={{ fill: ct.tickFill, fontSize: 12 }} />
        <YAxis tick={{ fill: ct.tickFill, fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            background: ct.tooltipBg,
            border: ct.tooltipBorder,
            borderRadius: 10,
            color: ct.textPrimary,
            boxShadow: ct.tooltipShadow,
          }}
          itemStyle={{ color: '#10b981', fontWeight: 600 }}
          labelStyle={{ color: ct.textPrimary, fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ color: ct.legendColor }} />
        {data.series.map((s: any, i: number) => {
          const lineColor = BAR_GREEN_PALETTE[i % BAR_GREEN_PALETTE.length];
          return (
            <Line
              key={s.name}
              type="monotone"
              data={s.data}
              dataKey="y"
              name={s.name}
              stroke={lineColor}
              strokeWidth={2.5}
              dot={{ r: 4, fill: lineColor, stroke: lineColor }}
              activeDot={{ r: 6, fill: lineColor }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatCompactAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${+(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${+(v / 1_000).toFixed(1)}K`;
  return Number(v).toLocaleString();
}

function BarReportView({ data }: { data: any }) {
  const ct = useChartTheme();
  const unit = data.yAxis?.unit ? ` (${data.yAxis.unit})` : '';
  const seriesName = (data.series[0]?.name || 'Revenue') + unit;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data.series[0]?.data} margin={{ top: 32, right: 24, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.gridStroke} />
        <XAxis dataKey="x" tick={{ fill: ct.textPrimary, fontSize: 12, fontWeight: 600 }} />
        <YAxis
          width={80}
          tick={{ fill: ct.tickFill, fontSize: 12, fontWeight: 600 }}
          tickFormatter={(val) => formatCompactAxisValue(Number(val))}
        />
        <Tooltip
          cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
          formatter={(val: any) => [Number(val).toLocaleString(), seriesName]}
          contentStyle={{
            background: ct.tooltipBg,
            border: ct.tooltipBorder,
            borderRadius: 10,
            color: ct.textPrimary,
            boxShadow: ct.tooltipShadow,
          }}
          labelStyle={{ color: ct.textPrimary, fontWeight: 700, marginBottom: 4 }}
          itemStyle={{ color: '#10b981', fontWeight: 700 }}
        />
        <Bar dataKey="y" name={seriesName} fill="#10b981" maxBarSize={88} radius={[6, 6, 0, 0]}>
          {data.series[0]?.data.map((_: any, i: number) => (
            <Cell key={i} fill={BAR_GREEN_PALETTE[i % BAR_GREEN_PALETTE.length]} />
          ))}
          <LabelList
            dataKey="y"
            position="top"
            formatter={(val: any) => Number(val).toLocaleString()}
            style={{ fill: ct.textPrimary, fontSize: 13, fontWeight: 700 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieReportView({ data }: { data: any }) {
  const ct = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={360}>
      <PieChart>
        <Pie data={data.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={2} label>
          {data.data.map((entry: any, i: number) => (
            <Cell key={entry.name} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: ct.tooltipBg,
            border: ct.tooltipBorder,
            borderRadius: 10,
            color: ct.textPrimary,
            boxShadow: ct.tooltipShadow,
          }}
        />
        <Legend wrapperStyle={{ color: ct.legendColor }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function GaugeReportView({ data }: { data: any }) {
  const ct = useChartTheme();
  const pct = Math.min(Math.max(data.value, 0), 100);
  return (
    <div className="gauge-report">
      <svg viewBox="0 0 200 120" className="gauge-svg">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={ct.gaugeTrack} strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#6c5ce7" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${pct * 2.52} 252`} />
        <text x="100" y="85" textAnchor="middle" fill={ct.textPrimary} fontSize="28" fontWeight="700">{data.value}{data.unit}</text>
        <text x="100" y="110" textAnchor="middle" fill={ct.tickFill} fontSize="12">{data.label}</text>
      </svg>
      {data.breakdown && (
        <div className="gauge-breakdown">
          {Object.entries(data.breakdown).map(([k, v]) => (
            <div key={k} className="breakdown-item">
              <span className="breakdown-label">{k.replace(/_/g, ' ')}</span>
              <span className="breakdown-value">{Number(v).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableReportView({ data }: { data: any }) {
  return (
    <div className="report-table-wrapper">
      <TableScrollWrapper>
        <table className="report-table">
          <thead>
            <tr>{data.columns?.map((col: string) => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows?.map((row: string[], ri: number) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </TableScrollWrapper>
    </div>
  );
}

function RawDataTable({ data }: { data: WidgetData }) {
  // Convert any widget type into a generic table
  if (data.type === 'data_table') {
    return <TableReportView data={data} />;
  }

  if (data.type === 'kpi_card') {
    return (
      <div className="report-table-wrapper">
        <TableScrollWrapper>
          <table className="report-table">
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>{data.label}</td><td>{data.value}{data.unit}</td></tr>
              {data.breakdown && Object.entries(data.breakdown).map(([k, v]) => (
                <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td>{Number(v).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </TableScrollWrapper>
      </div>
    );
  }

  if ((data.type === 'line_chart' || data.type === 'bar_chart') && 'series' in data) {
    const series = data.series[0];
    if (!series) return <p className="no-data-msg">No data available</p>;
    return (
      <div className="report-table-wrapper">
        <TableScrollWrapper>
          <table className="report-table">
            <thead><tr><th>{data.type === 'line_chart' ? 'Period' : 'Category'}</th><th>{series.name}</th></tr></thead>
            <tbody>
              {series.data.map((pt) => (
                <tr key={pt.x}><td>{pt.x}</td><td>{Number(pt.y).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </TableScrollWrapper>
      </div>
    );
  }

  if (data.type === 'pie_chart' && 'data' in data) {
    return (
      <div className="report-table-wrapper">
        <TableScrollWrapper>
          <table className="report-table">
            <thead><tr><th>Category</th><th>Value</th></tr></thead>
            <tbody>
              {data.data.map((d) => (
                <tr key={d.name}><td>{d.name}</td><td>{Number(d.value).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </TableScrollWrapper>
      </div>
    );
  }

  return <p className="no-data-msg">Table view not available for this report type</p>;
}

// ═══════════════════════════════════════════════════
// SAVED REPORTS LIST
// ═══════════════════════════════════════════════════
function SavedReportsList({ onRun }: { onRun: (r: SavedReport) => void }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const { data, isLoading } = useListReportsQuery({ page, limit });
  const [deleteReport] = useDeleteReportMutation();
  const confirmDialog = useConfirm();

  const reports = data?.data || [];
  const meta = data?.meta;

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('Delete this saved report?', { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteReport(id).unwrap();
      toast.success('Report deleted');
    } catch { toast.error('Failed to delete report'); }
  };

  return (
    <div className="saved-reports">
      {isLoading ? (
        <div className="saved-loading">
          {[1, 2, 3].map((i) => <div key={i} className="saved-skeleton" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="saved-empty">
          <Save size={40} />
          <h3>No Saved Reports</h3>
          <p>Run a report from the Report Types tab and save the configuration for quick access.</p>
        </div>
      ) : (
        <>
          <div className="saved-list">
            {reports.map((r) => {
              const typeDef = REPORT_TYPES.find((rt) => rt.code === r.reportType || rt.widgetCode === r.reportType);
              const creatorName = r.creator?.profile
                ? `${r.creator.profile.firstName} ${r.creator.profile.lastName}`
                : r.creator?.email || 'Unknown';
              return (
                <div key={r.id} className="saved-item">
                  <div className="saved-icon" style={{ background: typeDef ? `${typeDef.color}15` : 'rgba(108,92,231,0.1)', color: typeDef?.color || '#6c5ce7' }}>
                    {typeDef?.icon || <FileText size={20} />}
                  </div>
                  <div className="saved-info">
                    <h4>{r.name}</h4>
                    <div className="saved-meta">
                      <span className="saved-type">{typeDef?.name || r.reportType}</span>
                      <span className="dot">·</span>
                      <span>by {creatorName}</span>
                      <span className="dot">·</span>
                      <span>{formatDate(r.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="saved-actions">
                    <button className="btn-primary-sm" onClick={() => onRun(r)}>
                      <Play size={13} /> Run
                    </button>
                    <button className="btn-icon-sm danger" onClick={() => handleDelete(r.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {meta && meta.total >= 10 && (
            <div className="maint-pagination">
              <div className="maint-pagination-left">
                <span>Rows per page:</span>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                >
                  {[10, 15, 25, 50].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="maint-pagination-right">
                <button
                  className="maint-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="maint-page-info">
                  Page {page} of {meta.totalPages}
                </span>
                <button
                  className="maint-page-btn"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SAVE REPORT MODAL
// ═══════════════════════════════════════════════════
function SaveReportModal({
  reportType,
  reportTypeName,
  defaultName,
  parameters,
  onClose,
}: {
  reportType: string;
  reportTypeName: string;
  defaultName: string;
  parameters: Record<string, unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [submitted, setSubmitted] = useState(false);
  const [createReport, { isLoading }] = useCreateReportMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    try {
      await createReport({
        name: name.trim(),
        reportType,
        parameters,
      }).unwrap();
      toast.success('Report saved');
      onClose();
    } catch { toast.error('Failed to save report'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small-modal report-save-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Save size={20} /> Save Report</h2>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label>Report Name *</label>
            <input
              type="text"
              className={submitted && !name.trim() ? 'mall-input-error' : ''}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly Occupancy — Q1 2025"
              autoFocus
            />
            {submitted && !name.trim() && <span className="mall-error-text">Report name is required</span>}
          </div>
          <div className="form-group">
            <label>Report Type</label>
            <input type="text" value={reportTypeName} disabled />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              <Save size={14} /> {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
