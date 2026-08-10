import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetBiReportsQuery, useCreateBiReportMutation,
  useLazyRunBiReportQuery, useDeleteBiReportMutation,
} from '../../store/api/biApi';
import { useGetPropertiesQuery } from '../../store/api/propertiesApi';
import {
  FileBarChart, Plus, X, Trash2, Play, Clock, Building2, DollarSign,
  Wrench, BarChart3, PieChart, Users, CheckCircle, AlertCircle,
  TrendingUp, TrendingDown, Share2, Calendar, RefreshCw, ChevronDown,
  Eye, Layers, Activity, ArrowRight,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────
const REPORT_TYPES = [
  { code: 'occupancy', label: 'Occupancy', description: 'Unit occupancy rates across all properties', icon: Building2, color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)' },
  { code: 'revenue', label: 'Revenue', description: 'Monthly invoiced vs collected revenue breakdown', icon: DollarSign, color: '#22c55e', gradient: 'linear-gradient(135deg, #22c55e, #4ade80)' },
  { code: 'maintenance', label: 'Maintenance', description: 'Ticket status, priority and resolution time analytics', icon: Wrench, color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
  { code: 'portfolio', label: 'Portfolio', description: 'Executive summary with all KPIs aggregated', icon: Layers, color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
  { code: 'custom', label: 'Custom', description: 'Custom report with user-defined configuration', icon: BarChart3, color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
];

const STATUS_COLORS: Record<string, string> = { occupancy: '#6366f1', revenue: '#22c55e', maintenance: '#f59e0b', portfolio: '#8b5cf6', custom: '#06b6d4' };

function getTypeMeta(code: string) {
  return REPORT_TYPES.find(t => t.code === code) || REPORT_TYPES[4];
}

function fmtDate(d: string | null | undefined) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d: string | null | undefined) {
  if (!d) return 'Never run';
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Main Page ───────────────────────────────────────────
export default function BiReportsPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [runningReportId, setRunningReportId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any>(null);

  const { data: reportsRes, isLoading } = useGetBiReportsQuery({ reportType: typeFilter || undefined });
  const [deleteReport] = useDeleteBiReportMutation();
  const [triggerRun, { isFetching: isRunning }] = useLazyRunBiReportQuery();

  const reports = reportsRes?.data || [];
  const total = reportsRes?.total || 0;

  const handleRun = async (id: string) => {
    setRunningReportId(id);
    setRunResult(null);
    try {
      const result = await triggerRun(id).unwrap();
      setRunResult(result);
    } catch {
      setRunResult({ error: 'Failed to run report' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this saved report?')) return;
    await deleteReport(id);
    if (runningReportId === id) {
      setRunningReportId(null);
      setRunResult(null);
    }
  };

  const handleCloseResult = () => {
    setRunningReportId(null);
    setRunResult(null);
  };

  // Count by type
  const typeCounts: Record<string, number> = {};
  reports.forEach((r: any) => { typeCounts[r.reportType] = (typeCounts[r.reportType] || 0) + 1; });

  return (
    <div className="page-content" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <FileBarChart size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            BI Saved Reports
          </h1>
          <p style={styles.subtitle}>
            Create, manage and run analytical reports • {total} report{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button style={styles.createBtn} onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Report
        </button>
      </div>

      {/* Type Cards */}
      <div style={styles.typeCardsRow}>
        <button
          style={{ ...styles.typeCard, ...(typeFilter === '' ? styles.typeCardActive : {}) }}
          onClick={() => setTypeFilter('')}
        >
          <div style={{ ...styles.typeCardIcon, background: 'rgba(255,255,255,0.06)' }}>
            <Layers size={20} color="var(--text-secondary)" />
          </div>
          <div style={styles.typeCardText}>
            <span style={styles.typeCardLabel}>All Types</span>
            <span style={styles.typeCardCount}>{total}</span>
          </div>
        </button>
        {REPORT_TYPES.filter(t => t.code !== 'custom').map(t => (
          <button
            key={t.code}
            style={{ ...styles.typeCard, ...(typeFilter === t.code ? styles.typeCardActive : {}) }}
            onClick={() => setTypeFilter(typeFilter === t.code ? '' : t.code)}
          >
            <div style={{ ...styles.typeCardIcon, background: `${t.color}18` }}>
              <t.icon size={20} color={t.color} />
            </div>
            <div style={styles.typeCardText}>
              <span style={styles.typeCardLabel}>{t.label}</span>
              <span style={styles.typeCardCount}>{typeCounts[t.code] || 0}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Report List */}
      {isLoading ? (
        <div style={styles.loadingWrap}>
          {[1, 2, 3].map(i => <div key={i} style={styles.skeletonRow} />)}
        </div>
      ) : reports.length === 0 ? (
        <div style={styles.emptyState}>
          <FileBarChart size={48} style={{ opacity: 0.15, marginBottom: 16 }} />
          <h3 style={{ margin: '0 0 8px', fontWeight: 600 }}>No Saved Reports</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
            {typeFilter ? `No ${getTypeMeta(typeFilter).label} reports found.` : 'Create a report to start analyzing your portfolio data.'}
          </p>
          <button style={{ ...styles.createBtn, marginTop: 16 }} onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create Your First Report
          </button>
        </div>
      ) : (
        <div style={styles.reportList}>
          {reports.map((r: any) => {
            const meta = getTypeMeta(r.reportType);
            const isActive = runningReportId === r.id;
            const creator = r.creator?.profile
              ? `${r.creator.profile.firstName || ''} ${r.creator.profile.lastName || ''}`.trim()
              : r.creator?.email || '—';

            return (
              <div key={r.id} style={{ ...styles.reportCard, ...(isActive ? styles.reportCardActive : {}) }}>
                <div style={styles.reportCardLeft}>
                  <div style={{ ...styles.reportIcon, background: meta.gradient }}>
                    <meta.icon size={20} color="#fff" />
                  </div>
                  <div style={styles.reportInfo}>
                    <div style={styles.reportName}>{r.name}</div>
                    {r.description && <div style={styles.reportDesc}>{r.description}</div>}
                    <div style={styles.reportMeta}>
                      <span style={{ ...styles.reportTypeBadge, background: `${meta.color}18`, color: meta.color }}>
                        {meta.label}
                      </span>
                      <span style={styles.metaDivider}>·</span>
                      <Users size={12} style={{ opacity: 0.5 }} />
                      <span>{creator}</span>
                      <span style={styles.metaDivider}>·</span>
                      <Calendar size={12} style={{ opacity: 0.5 }} />
                      <span>{fmtDate(r.createdAt)}</span>
                      {r.lastRunAt && (
                        <>
                          <span style={styles.metaDivider}>·</span>
                          <Play size={12} style={{ opacity: 0.5 }} />
                          <span>Last run {timeAgo(r.lastRunAt)}</span>
                        </>
                      )}
                      {r.isShared && (
                        <>
                          <span style={styles.metaDivider}>·</span>
                          <Share2 size={12} color="#06b6d4" />
                          <span style={{ color: '#06b6d4' }}>Shared</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div style={styles.reportActions}>
                  <button
                    style={styles.runBtn}
                    onClick={() => handleRun(r.id)}
                    disabled={isRunning && runningReportId === r.id}
                  >
                    {isRunning && runningReportId === r.id ? (
                      <><RefreshCw size={14} className="spin" /> Running...</>
                    ) : (
                      <><Play size={14} /> Run</>
                    )}
                  </button>
                  <button style={styles.iconBtn} onClick={() => handleDelete(r.id)} title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Report Result Panel */}
      {runningReportId && runResult && (
        <ReportResultPanel
          result={runResult}
          onClose={handleCloseResult}
        />
      )}

      {/* Create Modal */}
      {showCreate && createPortal(
        <CreateReportModal onClose={() => setShowCreate(false)} />,
        document.body,
      )}
    </div>
  );
}

// ─── Report Result Panel ─────────────────────────────────
function ReportResultPanel({ result, onClose }: { result: any; onClose: () => void }) {
  if (result.error) {
    return (
      <div style={styles.resultPanel}>
        <div style={styles.resultHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={20} color="#ef4444" />
            <h3 style={{ margin: 0, fontWeight: 600 }}>Report Error</h3>
          </div>
          <button style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
          {result.error}
        </div>
      </div>
    );
  }

  const report = result.data?.report || result.report;
  const reportResult = result.data?.result || result.result;
  const runAt = result.data?.runAt || result.runAt;
  const meta = report ? getTypeMeta(report.reportType) : REPORT_TYPES[0];

  return (
    <div style={styles.resultPanel}>
      <div style={styles.resultHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...styles.resultHeaderIcon, background: meta.gradient }}>
            <meta.icon size={18} color="#fff" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{report?.name || 'Report Results'}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Generated {runAt ? fmtDate(runAt) : 'just now'}
            </span>
          </div>
        </div>
        <button style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
      </div>

      <div style={styles.resultBody}>
        {reportResult?.type === 'occupancy' && <OccupancyResult data={reportResult.data} />}
        {reportResult?.type === 'revenue' && <RevenueResult data={reportResult.data} />}
        {reportResult?.type === 'maintenance' && <MaintenanceResult data={reportResult.data} />}
        {/* Portfolio uses executive summary structure */}
        {reportResult?.portfolio && <PortfolioResult data={reportResult} />}
        {/* Fallback for custom/unknown */}
        {!reportResult?.type && !reportResult?.portfolio && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <pre style={{ textAlign: 'left', fontSize: 12, overflow: 'auto', maxHeight: 400, background: 'rgba(0,0,0,0.15)', padding: 16, borderRadius: 8 }}>
              {JSON.stringify(reportResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Occupancy Result ────────────────────────────────────
function OccupancyResult({ data }: { data: any[] }) {
  if (!data?.length) return <EmptyResult />;
  const totalUnits = data.reduce((s, d) => s + d.totalUnits, 0);
  const totalOccupied = data.reduce((s, d) => s + d.occupied, 0);
  const avgRate = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 1000) / 10 : 0;

  return (
    <div>
      {/* Summary KPIs */}
      <div style={styles.kpiRow}>
        <KpiMini icon={<Building2 size={18} />} label="Properties" value={data.length} color="#6366f1" />
        <KpiMini icon={<Layers size={18} />} label="Total Units" value={totalUnits} color="#06b6d4" />
        <KpiMini icon={<CheckCircle size={18} />} label="Occupied" value={totalOccupied} color="#22c55e" />
        <KpiMini icon={<Activity size={18} />} label="Avg Occupancy" value={`${avgRate}%`} color="#8b5cf6" />
      </div>

      {/* Per-property table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Property</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Occupied</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Vacant</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Under Reno</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: any) => (
              <tr key={row.propertyId}>
                <td style={styles.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={14} color="#6366f1" />
                    {row.propertyName}
                  </div>
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{row.totalUnits}</td>
                <td style={{ ...styles.td, textAlign: 'right', color: '#22c55e' }}>{row.occupied}</td>
                <td style={{ ...styles.td, textAlign: 'right', color: '#ef4444' }}>{row.vacant}</td>
                <td style={{ ...styles.td, textAlign: 'right', color: '#f59e0b' }}>{row.underRenovation}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <RateBar value={row.occupancyRate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Revenue Result ──────────────────────────────────────
function RevenueResult({ data }: { data: any[] }) {
  if (!data?.length) return <EmptyResult />;
  const totalInvoiced = data.reduce((s, d) => s + d.invoiced, 0);
  const totalCollected = data.reduce((s, d) => s + d.collected, 0);
  const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 1000) / 10 : 0;
  const maxVal = Math.max(...data.map(d => Math.max(d.invoiced, d.collected)), 1);

  return (
    <div>
      <div style={styles.kpiRow}>
        <KpiMini icon={<DollarSign size={18} />} label="Total Invoiced" value={`$${(totalInvoiced / 1000).toFixed(0)}K`} color="#f59e0b" />
        <KpiMini icon={<CheckCircle size={18} />} label="Total Collected" value={`$${(totalCollected / 1000).toFixed(0)}K`} color="#22c55e" />
        <KpiMini icon={<PieChart size={18} />} label="Collection Rate" value={`${collectionRate}%`} color="#8b5cf6" />
        <KpiMini icon={<Calendar size={18} />} label="Months" value={data.length} color="#06b6d4" />
      </div>

      {/* Bar chart */}
      <div style={styles.chartArea}>
        <div style={styles.chartLegend}>
          <span style={legendDot('#6366f1')}>■</span> Invoiced
          <span style={{ ...legendDot('#22c55e'), marginLeft: 16 }}>■</span> Collected
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 180, padding: '0 4px' }}>
          {data.map((d: any, i: number) => {
            const invH = (d.invoiced / maxVal) * 160 + 8;
            const colH = (d.collected / maxVal) * 160 + 8;
            const label = new Date(d.month).toLocaleDateString('en', { month: 'short' });
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                  <div style={{ width: '35%', height: invH, background: 'linear-gradient(to top, #6366f1, #818cf8)', borderRadius: '4px 4px 0 0' }} title={`Invoiced: $${d.invoiced.toLocaleString()}`} />
                  <div style={{ width: '35%', height: colH, background: 'linear-gradient(to top, #22c55e, #4ade80)', borderRadius: '4px 4px 0 0' }} title={`Collected: $${d.collected.toLocaleString()}`} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Month</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Invoiced</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Collected</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Invoices</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d: any) => {
              const rate = d.invoiced > 0 ? Math.round((d.collected / d.invoiced) * 100) : 0;
              return (
                <tr key={d.month}>
                  <td style={styles.td}>{new Date(d.month).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>${d.invoiced.toLocaleString()}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: '#22c55e' }}>${d.collected.toLocaleString()}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{d.invoiceCount}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}><RateBar value={rate} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Maintenance Result ──────────────────────────────────
function MaintenanceResult({ data }: { data: any }) {
  if (!data) return <EmptyResult />;
  const { byStatus = [], byPriority = [], avgResolutionHours = 0, totalResolved = 0 } = data;

  const statusColors: Record<string, string> = {
    open: '#ef4444', in_progress: '#f59e0b', assigned: '#6366f1', completed: '#22c55e', closed: '#64748b', cancelled: '#94a3b8',
  };
  const priorityColors: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', normal: '#64748b',
  };

  const totalTickets = byStatus.reduce((s: number, r: any) => s + r.count, 0);

  return (
    <div>
      <div style={styles.kpiRow}>
        <KpiMini icon={<Wrench size={18} />} label="Total Tickets" value={totalTickets} color="#f59e0b" />
        <KpiMini icon={<CheckCircle size={18} />} label="Resolved" value={totalResolved} color="#22c55e" />
        <KpiMini icon={<Clock size={18} />} label="Avg Resolution" value={`${avgResolutionHours}h`} color="#6366f1" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* By Status */}
        <div style={styles.miniCard}>
          <h4 style={styles.miniCardTitle}>By Status</h4>
          {byStatus.map((s: any) => (
            <div key={s.status} style={styles.barRow}>
              <span style={{ ...styles.barLabel, textTransform: 'capitalize' as any }}>{s.status.replace(/_/g, ' ')}</span>
              <div style={styles.barTrack}>
                <div style={{ ...styles.barFill, width: `${totalTickets > 0 ? (s.count / totalTickets) * 100 : 0}%`, background: statusColors[s.status] || '#64748b' }} />
              </div>
              <span style={styles.barCount}>{s.count}</span>
            </div>
          ))}
        </div>

        {/* By Priority */}
        <div style={styles.miniCard}>
          <h4 style={styles.miniCardTitle}>By Priority</h4>
          {byPriority.map((p: any) => (
            <div key={p.priority} style={styles.barRow}>
              <span style={{ ...styles.barLabel, textTransform: 'capitalize' as any }}>{p.priority}</span>
              <div style={styles.barTrack}>
                <div style={{ ...styles.barFill, width: `${totalTickets > 0 ? (p.count / totalTickets) * 100 : 0}%`, background: priorityColors[p.priority] || '#64748b' }} />
              </div>
              <span style={styles.barCount}>{p.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Portfolio Result ────────────────────────────────────
function PortfolioResult({ data }: { data: any }) {
  const portfolio = data.portfolio;
  const properties = data.properties || [];
  if (!portfolio) return <EmptyResult />;

  return (
    <div>
      <div style={styles.kpiRow}>
        <KpiMini icon={<Building2 size={18} />} label="Properties" value={portfolio.totalProperties} color="#6366f1" />
        <KpiMini icon={<Users size={18} />} label="Units" value={portfolio.totalUnits} color="#06b6d4" />
        <KpiMini icon={<Activity size={18} />} label="Occupancy" value={`${portfolio.occupancyRate}%`} color="#22c55e" />
        <KpiMini icon={<DollarSign size={18} />} label="Revenue YTD" value={`$${(portfolio.totalRevenueYtd / 1000).toFixed(0)}K`} color="#f59e0b" />
        <KpiMini icon={<PieChart size={18} />} label="Collection" value={`${portfolio.collectionRate}%`} color="#8b5cf6" />
      </div>

      {properties.length > 0 && (
        <div style={{ ...styles.tableWrap, marginTop: 16 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Property</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Occupancy</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Revenue YTD</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Collection</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Tickets</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p: any) => (
                <tr key={p.propertyId}>
                  <td style={styles.td}>{p.name}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}><RateBar value={p.occupancyRate} /></td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>${Number(p.revenueYtd).toLocaleString()}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{p.collectionRate}%</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{p.openTickets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Create Report Modal ─────────────────────────────────
function CreateReportModal({ onClose }: { onClose: () => void }) {
  const [createReport, { isLoading }] = useCreateBiReportMutation();
  const { data: propsRes } = useGetPropertiesQuery({});
  const properties = propsRes?.data || [];

  const [form, setForm] = useState({
    name: '',
    description: '',
    reportType: 'occupancy',
    isShared: false,
    config: {
      propertyId: '',
      dateRange: 'ytd',
      fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
      toDate: new Date().toISOString().split('T')[0],
    },
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    await createReport({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      reportType: form.reportType,
      isShared: form.isShared,
      config: form.config,
    });
    onClose();
  };

  const meta = getTypeMeta(form.reportType);
  const showDateRange = form.reportType === 'revenue' || form.reportType === 'portfolio';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ ...styles.resultHeaderIcon, background: meta.gradient }}>
              <meta.icon size={18} color="#fff" />
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Create BI Report</h2>
          </div>
          <button style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={styles.modalBody}>
          {/* Report Type Selector */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Report Type</label>
            <div style={styles.typeSelector}>
              {REPORT_TYPES.map(t => (
                <button
                  key={t.code}
                  style={{
                    ...styles.typeSelectorBtn,
                    ...(form.reportType === t.code ? { border: `2px solid ${t.color}`, background: `${t.color}12` } : {}),
                  }}
                  onClick={() => setForm(f => ({ ...f, reportType: t.code }))}
                >
                  <t.icon size={18} color={t.color} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{meta.description}</p>
          </div>

          {/* Name */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Report Name *</label>
            <input
              style={styles.input}
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={`e.g. Monthly ${meta.label} — ${new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })}`}
            />
          </div>

          {/* Description */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Description</label>
            <textarea
              style={{ ...styles.input, minHeight: 64, resize: 'vertical' as any }}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description..."
            />
          </div>

          {/* Property filter */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Property (optional)</label>
            <select
              style={styles.input}
              value={form.config.propertyId}
              onChange={e => setForm(f => ({ ...f, config: { ...f.config, propertyId: e.target.value } }))}
            >
              <option value="">All Properties</option>
              {properties.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Date range for revenue/portfolio */}
          {showDateRange && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>From Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={form.config.fromDate}
                  onChange={e => setForm(f => ({ ...f, config: { ...f.config, fromDate: e.target.value } }))}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>To Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={form.config.toDate}
                  onChange={e => setForm(f => ({ ...f, config: { ...f.config, toDate: e.target.value } }))}
                />
              </div>
            </div>
          )}

          {/* Shared toggle */}
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.isShared}
              onChange={e => setForm(f => ({ ...f, isShared: e.target.checked }))}
            />
            <Share2 size={14} />
            Share this report with all team members
          </label>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.createBtn, opacity: !form.name.trim() || isLoading ? 0.5 : 1 }}
            onClick={handleSubmit}
            disabled={!form.name.trim() || isLoading}
          >
            {isLoading ? <><RefreshCw size={14} className="spin" /> Creating...</> : <><Plus size={14} /> Create Report</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Sub-components ───────────────────────────────

function KpiMini({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div style={styles.kpiMini}>
      <div style={{ ...styles.kpiMiniIcon, background: `${color}14`, color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function RateBar({ value }: { value: number }) {
  const color = value >= 90 ? '#22c55e' : value >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${Math.min(value, 100)}%`, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontWeight: 600, color, fontSize: 13, minWidth: 42, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

function EmptyResult() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
      <BarChart3 size={36} style={{ opacity: 0.15, marginBottom: 12 }} />
      <p style={{ margin: 0 }}>No data available for this report.</p>
    </div>
  );
}

function legendDot(color: string): React.CSSProperties {
  return { color, fontSize: 16 };
}

// ─── Inline Styles ───────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, margin: 0 },
  subtitle: { color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 },
  createBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10,
    border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
  },

  // Type filter cards
  typeCardsRow: { display: 'flex', gap: 10, marginBottom: 24, overflowX: 'auto' as any },
  typeCard: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12,
    border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: 'pointer',
    transition: 'all 0.2s', minWidth: 140, flex: 1,
  },
  typeCardActive: { border: '1px solid #6366f1', background: 'rgba(99,102,241,0.08)' },
  typeCardIcon: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeCardText: { display: 'flex', flexDirection: 'column' as any },
  typeCardLabel: { fontSize: 13, fontWeight: 600 },
  typeCardCount: { fontSize: 20, fontWeight: 700 },

  // Loading & empty
  loadingWrap: { display: 'flex', flexDirection: 'column' as any, gap: 12 },
  skeletonRow: { height: 80, borderRadius: 12, background: 'var(--card-bg)', animation: 'pulse 1.5s infinite' },
  emptyState: { textAlign: 'center' as any, padding: '60px 24px', background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border-color)' },

  // Report list
  reportList: { display: 'flex', flexDirection: 'column' as any, gap: 10 },
  reportCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px',
    borderRadius: 14, border: '1px solid var(--border-color)', background: 'var(--card-bg)',
    transition: 'all 0.2s',
  },
  reportCardActive: { border: '1px solid #6366f1', boxShadow: '0 0 0 1px rgba(99,102,241,0.3)' },
  reportCardLeft: { display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  reportIcon: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reportInfo: { flex: 1, minWidth: 0 },
  reportName: { fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as any },
  reportDesc: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as any },
  reportMeta: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' as any },
  reportTypeBadge: { padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 },
  metaDivider: { opacity: 0.4 },
  reportActions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },

  runBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
    border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-color)',
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
  },

  // Result panel
  resultPanel: {
    marginTop: 24, borderRadius: 16, border: '1px solid var(--border-color)',
    background: 'var(--card-bg)', overflow: 'hidden',
  },
  resultHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
  },
  resultHeaderIcon: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  resultBody: { padding: 20 },

  // KPI row
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  kpiMini: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' },
  kpiMiniIcon: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // Table
  tableWrap: { marginTop: 16, borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' as any, fontSize: 13 },
  th: { padding: '10px 14px', textAlign: 'left' as any, fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' },
  td: { padding: '10px 14px', borderBottom: '1px solid var(--border-color)' },

  // Chart area
  chartArea: { marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' },
  chartLegend: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 },

  // Maintenance bar rows
  miniCard: { padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' },
  miniCardTitle: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 },
  barRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { fontSize: 12, minWidth: 80, color: 'var(--text-secondary)' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  barCount: { fontSize: 13, fontWeight: 600, minWidth: 28, textAlign: 'right' as any },

  // Modal
  overlay: { position: 'fixed' as any, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, backdropFilter: 'blur(4px)' },
  modal: { width: 560, maxHeight: '90vh', borderRadius: 16, background: 'var(--card-bg)', border: '1px solid var(--border-color)', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.4)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' },
  modalBody: { padding: '20px' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 20px', borderTop: '1px solid var(--border-color)' },

  // Form elements
  formGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
    background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' as any,
  },
  typeSelector: { display: 'flex', gap: 6, flexWrap: 'wrap' as any },
  typeSelectorBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
    border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer',
    color: 'var(--text-primary)', fontSize: 13, transition: 'all 0.15s',
  },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' },
  cancelBtn: {
    padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border-color)',
    background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
  },
};


