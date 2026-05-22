import './MaintenancePage.css';
import { useNavigate } from 'react-router-dom';
import {
  useGetMaintenanceStatsQuery, useGetTicketsQuery,
} from '../../../store/api/maintenanceApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  BarChart3, Wrench, Inbox, TrendingUp, AlertOctagon,
  ShieldCheck, Star, DollarSign, Clock, CheckCircle2,
  ArrowUpRight, AlertTriangle, Activity,
} from 'lucide-react';
import { useState, useMemo } from 'react';

// ── Priority colors ──────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  P1: '#ef4444', P2: '#f97316', P3: '#3b82f6', P4: '#94a3b8',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: '#3b82f6' },
  assigned: { label: 'Assigned', color: '#8b5cf6' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  pending_parts: { label: 'Pending Parts', color: '#f97316' },
  completed: { label: 'Completed', color: '#22c55e' },
  closed: { label: 'Closed', color: '#64748b' },
  cancelled: { label: 'Cancelled', color: '#ef4444' },
  reopened: { label: 'Reopened', color: '#e11d48' },
};

// ── SLA Gauge Component ──────────────────────
function SlaGauge({ label, rate, icon }: { label: string; rate: number; icon: React.ReactNode }) {
  const circumference = 2 * Math.PI * 44;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="md-gauge-card">
      <div className="md-gauge-svg-wrap">
        <svg viewBox="0 0 100 100" className="md-gauge-svg">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border-primary)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="md-gauge-center">
          <span className="md-gauge-value" style={{ color }}>{rate}%</span>
        </div>
      </div>
      <div className="md-gauge-label">
        {icon}
        <span>{label}</span>
      </div>
    </div>
  );
}

// ── Priority Bar Chart ───────────────────────
function PriorityChart({ data }: { data: Record<string, number> }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div className="md-chart-card">
      <h3 className="md-chart-title">
        <BarChart3 size={16} />
        Tickets by Priority
      </h3>
      <div className="md-bar-chart">
        {['P1', 'P2', 'P3', 'P4'].map((p) => (
          <div key={p} className="md-bar-row">
            <span className="md-bar-label" style={{ color: PRIORITY_COLORS[p] }}>{p}</span>
            <div className="md-bar-track">
              <div
                className="md-bar-fill"
                style={{
                  width: `${(data[p] || 0) / max * 100}%`,
                  backgroundColor: PRIORITY_COLORS[p],
                }}
              />
            </div>
            <span className="md-bar-value">{data[p] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Category Breakdown ───────────────────────
function CategoryBreakdown({ data }: { data: Array<{ category: string; count: number; pct: number }> }) {
  const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];
  return (
    <div className="md-chart-card">
      <h3 className="md-chart-title">
        <Activity size={16} />
        Top Categories
      </h3>
      <div className="md-category-list">
        {data.map((item, i) => (
          <div key={item.category} className="md-cat-row">
            <div className="md-cat-info">
              <span className="md-cat-dot" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="md-cat-name">{item.category}</span>
            </div>
            <div className="md-cat-bar-wrap">
              <div
                className="md-cat-bar"
                style={{ width: `${item.pct}%`, backgroundColor: colors[i % colors.length] }}
              />
            </div>
            <span className="md-cat-value">{item.count} ({item.pct}%)</span>
          </div>
        ))}
        {data.length === 0 && (
          <div className="empty-message">No category data yet</div>
        )}
      </div>
    </div>
  );
}

// ── Recent Tickets Feed ──────────────────────
function RecentTicketsFeed({ tickets, onClickTicket }: {
  tickets: Array<{
    id: string; ticketNumber: string; title: string; priority: string;
    status: string; createdAt: string;
    category: { name: string } | null;
    property: { name: string } | null;
    assignedTo: { profile: { firstName: string; lastName: string } | null } | null;
  }>;
  onClickTicket: (id: string) => void;
}) {
  const formatAgo = (d: string) => {
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="md-chart-card md-recent-feed">
      <h3 className="md-chart-title">
        <Clock size={16} />
        Recent Tickets
      </h3>
      <div className="md-feed-list">
        {tickets.map((t) => (
          <div key={t.id} className="md-feed-item" onClick={() => onClickTicket(t.id)}>
            <div className="md-feed-left">
              <span className={`maint-priority ${t.priority.toLowerCase()}`}>{t.priority}</span>
              <div className="md-feed-info">
                <span className="md-feed-number">{t.ticketNumber}</span>
                <span className="md-feed-title">{t.title}</span>
              </div>
            </div>
            <div className="md-feed-right">
              <span className={`maint-status ${t.status}`}>
                {STATUS_LABELS[t.status]?.label || t.status}
              </span>
              <span className="md-feed-time">{formatAgo(t.createdAt)}</span>
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <div className="empty-message">No recent tickets</div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────
export default function MaintenanceDashboard() {
  const navigate = useNavigate();
  const [propertyFilter, setPropertyFilter] = useState<string>('');

  const { data: statsData, isLoading } = useGetMaintenanceStatsQuery({
    propertyId: propertyFilter || undefined,
  });
  const { data: recentData } = useGetTicketsQuery({
    sort: 'createdAt', order: 'desc', limit: 8,
    propertyId: propertyFilter || undefined,
  });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });

  const stats = statsData?.data;
  const recentTickets = recentData?.data || [];
  const properties = propertiesData?.data || [];

  // Compute status distribution for the donut
  const statusDist = useMemo(() => {
    if (!stats) return [];
    const { open, assigned, inProgress, pendingParts, completed, cancelled, closed } = stats.ticketSummary;
    return [
      { status: 'open', count: open },
      { status: 'assigned', count: assigned },
      { status: 'in_progress', count: inProgress },
      { status: 'pending_parts', count: pendingParts },
      { status: 'completed', count: completed },
      { status: 'closed', count: closed },
      { status: 'cancelled', count: cancelled },
    ].filter((s) => s.count > 0);
  }, [stats]);

  if (isLoading) {
    return (
      <div className="maint-page">
        <div className="loading-spinner" style={{ padding: '80px 0', textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1>Maintenance Dashboard</h1>
            <p>Overview of maintenance operations, SLA compliance, and team performance</p>
          </div>
        </div>
        <div className="header-actions">
          <select
            className="filter-select"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
          >
            <option value="">All Properties</option>
            {properties.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => navigate('/admin/maintenance')}>
            <Wrench size={16} />
            <span>View Tickets</span>
          </button>
        </div>
      </div>

      {stats && (
        <>
          {/* Summary Cards Row */}
          <div className="md-stats-grid">
            <div className="md-stat-card">
              <div className="md-stat-icon blue"><Inbox size={20} /></div>
              <div className="md-stat-body">
                <span className="md-stat-value">{stats.ticketSummary.open}</span>
                <span className="md-stat-label">Open Tickets</span>
              </div>
              <div className="md-stat-trend">
                {stats.ticketSummary.assigned > 0 && (
                  <span className="md-trend-badge purple">{stats.ticketSummary.assigned} assigned</span>
                )}
              </div>
            </div>

            <div className="md-stat-card">
              <div className="md-stat-icon purple"><TrendingUp size={20} /></div>
              <div className="md-stat-body">
                <span className="md-stat-value">{stats.ticketSummary.inProgress}</span>
                <span className="md-stat-label">In Progress</span>
              </div>
              <div className="md-stat-trend">
                {stats.ticketSummary.pendingParts > 0 && (
                  <span className="md-trend-badge amber">{stats.ticketSummary.pendingParts} pending parts</span>
                )}
              </div>
            </div>

            <div className="md-stat-card">
              <div className="md-stat-icon red"><AlertOctagon size={20} /></div>
              <div className="md-stat-body">
                <span className="md-stat-value">{stats.ticketSummary.overdue}</span>
                <span className="md-stat-label">Overdue</span>
              </div>
              <div className="md-stat-trend">
                {stats.slaCompliance.totalBreaches > 0 && (
                  <span className="md-trend-badge red">{stats.slaCompliance.totalBreaches} breaches</span>
                )}
              </div>
            </div>

            <div className="md-stat-card">
              <div className="md-stat-icon green"><CheckCircle2 size={20} /></div>
              <div className="md-stat-body">
                <span className="md-stat-value">{stats.ticketSummary.completed + stats.ticketSummary.closed}</span>
                <span className="md-stat-label">Resolved</span>
              </div>
              <div className="md-stat-trend">
                <span className="md-trend-badge green">{stats.avgResolutionHours}h avg</span>
              </div>
            </div>

            <div className="md-stat-card">
              <div className="md-stat-icon amber"><Star size={20} /></div>
              <div className="md-stat-body">
                <span className="md-stat-value">{stats.avgRating ? `${stats.avgRating} ★` : '—'}</span>
                <span className="md-stat-label">Avg Rating</span>
              </div>
            </div>

            <div className="md-stat-card">
              <div className="md-stat-icon teal"><DollarSign size={20} /></div>
              <div className="md-stat-body">
                <span className="md-stat-value">
                  ${stats.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span className="md-stat-label">Total Cost</span>
              </div>
            </div>
          </div>

          {/* SLA Gauges + Priority Chart Row */}
          <div className="md-charts-row">
            {/* SLA Compliance Gauges */}
            <div className="md-chart-card md-sla-gauges">
              <h3 className="md-chart-title">
                <ShieldCheck size={16} />
                SLA Compliance
              </h3>
              <div className="md-gauges-wrap">
                <SlaGauge
                  label="Response SLA"
                  rate={stats.slaCompliance.responseRate}
                  icon={<ArrowUpRight size={14} />}
                />
                <SlaGauge
                  label="Resolution SLA"
                  rate={stats.slaCompliance.resolutionRate}
                  icon={<CheckCircle2 size={14} />}
                />
              </div>
              {stats.slaCompliance.totalBreaches > 0 && (
                <div className="md-sla-breach-note">
                  <AlertTriangle size={14} />
                  <span>{stats.slaCompliance.totalBreaches} total breach{stats.slaCompliance.totalBreaches !== 1 ? 'es' : ''}</span>
                </div>
              )}
            </div>

            {/* Priority Distribution */}
            <PriorityChart data={stats.byPriority} />

            {/* Status Distribution */}
            <div className="md-chart-card">
              <h3 className="md-chart-title">
                <Activity size={16} />
                Status Distribution
              </h3>
              <div className="md-status-grid">
                {statusDist.map((s) => {
                  const info = STATUS_LABELS[s.status];
                  return (
                    <div key={s.status} className="md-status-item">
                      <span className="md-status-dot" style={{ backgroundColor: info?.color || '#64748b' }} />
                      <span className="md-status-name">{info?.label || s.status}</span>
                      <span className="md-status-count">{s.count}</span>
                    </div>
                  );
                })}
                {statusDist.length === 0 && (
                  <div className="empty-message">No tickets yet</div>
                )}
              </div>
              <div className="md-total-row">
                <span>Total Tickets</span>
                <span className="md-total-value">{stats.ticketSummary.total}</span>
              </div>
            </div>
          </div>

          {/* Category Breakdown + Recent Tickets */}
          <div className="md-charts-row">
            <CategoryBreakdown data={stats.byCategory} />
            <RecentTicketsFeed
              tickets={recentTickets as any}
              onClickTicket={(id) => navigate(`/admin/maintenance/tickets/${id}`)}
            />
          </div>
        </>
      )}
    </div>
  );
}
