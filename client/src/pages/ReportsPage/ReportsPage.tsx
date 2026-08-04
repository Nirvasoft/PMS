import { useState } from 'react';
import {
  useListReportsQuery,
  useCreateReportMutation,
  useDeleteReportMutation,
  useGetWidgetDataQuery,
} from '../../store/api/dashboardApi';
import type { SavedReport, WidgetData } from '../../store/api/dashboardApi';
import {
  FileText, Plus, Trash2, X, Search, Filter, Clock,
  BarChart3, PieChart as PieChartIcon, TrendingUp, Activity,
  Building2, DollarSign, Wrench, Shield, Calendar,
  Play, ChevronRight, Download, Save,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import './ReportsPage.css';

// ═══════════════════════════════════════════════════
// REPORT TYPE DEFINITIONS
// ═══════════════════════════════════════════════════
const REPORT_TYPES = [
  {
    code: 'occupancy',
    name: 'Occupancy Report',
    description: 'Unit occupancy rates across properties and time periods',
    icon: <Building2 size={22} />,
    category: 'property',
    color: '#6c5ce7',
    widgetCode: 'occupancy_rate',
  },
  {
    code: 'vacancy_trend',
    name: 'Vacancy Trend',
    description: 'Vacancy rate trends over time with forecasting',
    icon: <TrendingUp size={22} />,
    category: 'property',
    color: '#00cec9',
    widgetCode: 'vacancy_trend',
  },
  {
    code: 'revenue',
    name: 'Revenue Report',
    description: 'Revenue breakdown by property, unit type, and period',
    icon: <DollarSign size={22} />,
    category: 'finance',
    color: '#fdcb6e',
    widgetCode: 'revenue_by_property',
  },
  {
    code: 'collection',
    name: 'Collection Report',
    description: 'Payment collection rates and overdue analysis',
    icon: <Activity size={22} />,
    category: 'finance',
    color: '#fd79a8',
    widgetCode: 'collection_rate',
  },
  {
    code: 'overdue',
    name: 'Overdue Invoices',
    description: 'Outstanding invoice aging and follow-up tracking',
    icon: <Clock size={22} />,
    category: 'finance',
    color: '#e17055',
    widgetCode: 'overdue_invoices',
  },
  {
    code: 'maintenance',
    name: 'Maintenance Report',
    description: 'Ticket status, SLA compliance, and category breakdown',
    icon: <Wrench size={22} />,
    category: 'maintenance',
    color: '#74b9ff',
    widgetCode: 'maintenance_open',
  },
  {
    code: 'unit_status',
    name: 'Unit Status Breakdown',
    description: 'Distribution of unit statuses across all properties',
    icon: <PieChartIcon size={22} />,
    category: 'property',
    color: '#a29bfe',
    widgetCode: 'unit_status_breakdown',
  },
  {
    code: 'lease_expiry',
    name: 'Lease Expiry Report',
    description: 'Leases expiring within configurable time windows',
    icon: <Calendar size={22} />,
    category: 'property',
    color: '#55efc4',
    widgetCode: 'lease_expiring_soon',
  },
];

const CHART_COLORS = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#74b9ff', '#55efc4', '#a29bfe', '#fab1a0'];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ═══════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ═══════════════════════════════════════════════════
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'types' | 'saved'>('types');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedReport, setSelectedReport] = useState<string | null>(null); // widgetCode
  const [selectedReportName, setSelectedReportName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  const filteredTypes = REPORT_TYPES.filter((rt) => {
    if (search && !rt.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== 'all' && rt.category !== categoryFilter) return false;
    return true;
  });

  const categories = [...new Set(REPORT_TYPES.map((r) => r.category))];

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="reports-header">
        <div className="header-left">
          <BarChart3 size={24} className="header-icon" />
          <div>
            <h1>Reports</h1>
            <p className="subtitle">Generate, view, and manage analytical reports</p>
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
          {/* Toolbar */}
          <div className="reports-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="filter-pills">
              <button
                className={`pill ${categoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('all')}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`pill ${categoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Report type cards */}
          <div className="report-type-grid">
            {filteredTypes.map((rt) => (
              <button
                key={rt.code}
                className={`report-type-card ${selectedReport === rt.widgetCode ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedReport(rt.widgetCode);
                  setSelectedReportName(rt.name);
                }}
              >
                <div className="card-icon" style={{ background: `${rt.color}15`, color: rt.color }}>
                  {rt.icon}
                </div>
                <div className="card-content">
                  <h3>{rt.name}</h3>
                  <p>{rt.description}</p>
                  <span className="card-category">{rt.category}</span>
                </div>
                <ChevronRight size={16} className="card-arrow" />
              </button>
            ))}
          </div>

          {/* Report viewer */}
          {selectedReport && (
            <ReportViewer
              widgetCode={selectedReport}
              reportName={selectedReportName}
              onSave={() => setShowSaveModal(true)}
              onClose={() => setSelectedReport(null)}
            />
          )}
        </>
      ) : (
        <SavedReportsList
          onRun={(report) => {
            setSelectedReport(report.reportType);
            setSelectedReportName(report.name);
            setActiveTab('types');
          }}
        />
      )}

      {/* Save Report Modal */}
      {showSaveModal && selectedReport && (
        <SaveReportModal
          reportType={selectedReport}
          defaultName={selectedReportName}
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
  onSave,
  onClose,
}: {
  widgetCode: string;
  reportName: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];

  const { data, isLoading, error, refetch } = useGetWidgetDataQuery({
    code: widgetCode,
    dateRange: `${from},${to}`,
  });

  const widgetData = data?.data;
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/reports/${widgetCode}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          format,
          parameters: { dateFrom: from, dateTo: to },
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `report.${format}`;
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

  return (
    <div className="report-viewer">
      <div className="viewer-header">
        <div className="viewer-title">
          <BarChart3 size={18} />
          <h2>{reportName}</h2>
          <span className="viewer-date">
            {formatDate(from)} — {formatDate(to)}
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
          <button className="btn-secondary-sm" onClick={() => refetch()}>
            <Play size={14} /> Refresh
          </button>
          <button className="btn-icon-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="viewer-body">
        {isLoading ? (
          <div className="viewer-loading">
            <div className="spinner" />
            <p>Generating report data...</p>
          </div>
        ) : error ? (
          <div className="viewer-error">
            <p>Failed to load report data</p>
            <button className="btn-primary-sm" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        ) : widgetData ? (
          <ReportDataRenderer data={widgetData} />
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// REPORT DATA RENDERER — chart + table views
// ═══════════════════════════════════════════════════
function ReportDataRenderer({ data }: { data: WidgetData }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <div className="report-data">
      <div className="data-view-toggle">
        <button className={`toggle-btn ${view === 'chart' ? 'active' : ''}`} onClick={() => setView('chart')}>
          <BarChart3 size={14} /> Chart
        </button>
        <button className={`toggle-btn ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>
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

function LineReportView({ data }: { data: any }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="x" data={data.series[0]?.data} tick={{ fill: '#8b95a5', fontSize: 12 }} />
        <YAxis tick={{ fill: '#8b95a5', fontSize: 12 }} />
        <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
        <Legend wrapperStyle={{ color: '#8b95a5' }} />
        {data.series.map((s: any, i: number) => (
          <Line key={s.name} type="monotone" data={s.data} dataKey="y" name={s.name} stroke={CHART_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarReportView({ data }: { data: any }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data.series[0]?.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="x" tick={{ fill: '#8b95a5', fontSize: 12 }} />
        <YAxis tick={{ fill: '#8b95a5', fontSize: 12 }} />
        <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
        <Bar dataKey="y" name={data.series[0]?.name || 'Value'} radius={[4, 4, 0, 0]}>
          {data.series[0]?.data.map((_: any, i: number) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieReportView({ data }: { data: any }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <PieChart>
        <Pie data={data.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={2} label>
          {data.data.map((entry: any, i: number) => (
            <Cell key={entry.name} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
        <Legend wrapperStyle={{ color: '#8b95a5' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function GaugeReportView({ data }: { data: any }) {
  const pct = Math.min(Math.max(data.value, 0), 100);
  return (
    <div className="gauge-report">
      <svg viewBox="0 0 200 120" className="gauge-svg">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#6c5ce7" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${pct * 2.52} 252`} />
        <text x="100" y="85" textAnchor="middle" fill="#e2e8f0" fontSize="28" fontWeight="700">{data.value}{data.unit}</text>
        <text x="100" y="110" textAnchor="middle" fill="#8b95a5" fontSize="12">{data.label}</text>
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
        <table className="report-table">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>{data.label}</td><td>{data.value}{data.unit}</td></tr>
            {data.breakdown && Object.entries(data.breakdown).map(([k, v]) => (
              <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td>{Number(v).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if ((data.type === 'line_chart' || data.type === 'bar_chart') && 'series' in data) {
    const series = data.series[0];
    if (!series) return <p className="no-data-msg">No data available</p>;
    return (
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead><tr><th>{data.type === 'line_chart' ? 'Period' : 'Category'}</th><th>{series.name}</th></tr></thead>
          <tbody>
            {series.data.map((pt) => (
              <tr key={pt.x}><td>{pt.x}</td><td>{Number(pt.y).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.type === 'pie_chart' && 'data' in data) {
    return (
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead><tr><th>Category</th><th>Value</th></tr></thead>
          <tbody>
            {data.data.map((d) => (
              <tr key={d.name}><td>{d.name}</td><td>{Number(d.value).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
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
  const { data, isLoading } = useListReportsQuery({ page, limit: 15 });
  const [deleteReport] = useDeleteReportMutation();

  const reports = data?.data || [];
  const meta = data?.meta;

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this saved report?')) return;
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

          {meta && meta.totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page} of {meta.totalPages}</span>
              <button disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
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
  defaultName,
  onClose,
}: {
  reportType: string;
  defaultName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [createReport, { isLoading }] = useCreateReportMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createReport({
        name: name.trim(),
        reportType,
        parameters: {},
      }).unwrap();
      toast.success('Report saved');
      onClose();
    } catch { toast.error('Failed to save report'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Save size={20} /> Save Report</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ padding: '0 24px' }}>
            <label>Report Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly Occupancy — Q1 2025"
              autoFocus
            />
          </div>
          <div className="form-group" style={{ padding: '0 24px' }}>
            <label>Report Type</label>
            <input type="text" value={reportType} disabled />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading || !name.trim()}>
              <Save size={14} /> {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
