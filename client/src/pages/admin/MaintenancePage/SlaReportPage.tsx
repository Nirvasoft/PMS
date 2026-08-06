import './MaintenancePage.css';
import { useState, useMemo } from 'react';
import { useGetSlaReportQuery } from '../../../store/api/maintenanceApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import type { SlaReportGroup } from '../../../store/api/maintenanceApi';
import {
  ShieldCheck, AlertTriangle, Clock, BarChart3,
  Loader2, TrendingUp, TrendingDown, Filter,
} from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  P1: '#ef4444', P2: '#f97316', P3: '#3b82f6', P4: '#94a3b8',
};

// ── SLA Gauge ────────────────────────────────
function SlaGauge({ label, rate, subtitle }: { label: string; rate: number; subtitle?: string }) {
  const circumference = 2 * Math.PI * 44;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="sla-report-gauge">
      <div className="md-gauge-svg-wrap" style={{ width: 100, height: 100 }}>
        <svg viewBox="0 0 100 100" className="md-gauge-svg">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border-primary)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="md-gauge-center">
          <span className="md-gauge-value" style={{ color, fontSize: 18 }}>{rate}%</span>
        </div>
      </div>
      <div className="sla-report-gauge-label">{label}</div>
      {subtitle && <div className="sla-report-gauge-sub">{subtitle}</div>}
    </div>
  );
}

// ── Rate Bar ─────────────────────────────────
function RateBar({ rate, label }: { rate: number; label?: string }) {
  const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="sla-rate-bar">
      <div className="sla-rate-bar-track">
        <div className="sla-rate-bar-fill" style={{ width: `${rate}%`, backgroundColor: color }} />
      </div>
      <span className="sla-rate-bar-value" style={{ color }}>{rate}%</span>
      {label && <span className="sla-rate-bar-label">{label}</span>}
    </div>
  );
}

// ── Group Row ────────────────────────────────
function GroupRow({ g }: { g: SlaReportGroup }) {
  const respColor = g.slaResponse.rate >= 90 ? '#22c55e' : g.slaResponse.rate >= 70 ? '#f59e0b' : '#ef4444';
  const resColor = g.slaResolution.rate >= 90 ? '#22c55e' : g.slaResolution.rate >= 70 ? '#f59e0b' : '#ef4444';
  const priorityColor = PRIORITY_COLORS[g.group];

  return (
    <tr className="sla-report-row">
      <td>
        <span className="sla-group-name" style={priorityColor ? { color: priorityColor } : undefined}>
          {g.group}
        </span>
      </td>
      <td className="text-center">{g.totalTickets}</td>
      <td>
        <RateBar rate={g.slaResponse.rate} />
        <span className="sla-met-fraction">{g.slaResponse.met}/{g.slaResponse.total}</span>
      </td>
      <td>
        <RateBar rate={g.slaResolution.rate} />
        <span className="sla-met-fraction">{g.slaResolution.met}/{g.slaResolution.total}</span>
      </td>
      <td className="text-center">
        {g.breaches > 0 ? (
          <span className="sla-breach-count">{g.breaches}</span>
        ) : (
          <span className="sla-no-breach">—</span>
        )}
      </td>
      <td className="text-center">
        {g.avgResolutionHours !== null ? (
          <span className="sla-res-hours">{g.avgResolutionHours}h</span>
        ) : (
          <span className="sla-no-data">—</span>
        )}
      </td>
    </tr>
  );
}

// ── Main Page ────────────────────────────────
export default function SlaReportPage() {
  const [filters, setFilters] = useState({
    propertyId: '',
    groupBy: 'priority' as 'priority' | 'property' | 'category' | 'technician',
    from: '',
    to: '',
  });

  const { data: reportResp, isLoading, isFetching } = useGetSlaReportQuery({
    propertyId: filters.propertyId || undefined,
    groupBy: filters.groupBy,
    from: filters.from || undefined,
    to: filters.to || undefined,
  });
  const { data: propsData } = useGetPropertiesQuery({});
  const properties = propsData?.data || [];
  const report = reportResp?.data;

  // Trend indicators
  const worstGroup = useMemo(() => {
    if (!report?.groups.length) return null;
    return report.groups.reduce((w, g) =>
      g.slaResolution.rate < w.slaResolution.rate ? g : w
    );
  }, [report]);

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1>SLA Compliance Report</h1>
            <p>Analyze response and resolution SLA performance across your portfolio</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="sla-report-filters">
        <div className="sla-filter-group">
          <Filter size={14} />
          <select
            value={filters.groupBy}
            onChange={(e) => setFilters((f) => ({ ...f, groupBy: e.target.value as typeof filters.groupBy }))}
          >
            <option value="priority">Group by Priority</option>
            <option value="property">Group by Property</option>
            <option value="category">Group by Category</option>
            <option value="technician">Group by Technician</option>
          </select>
        </div>
        <div className="sla-filter-group">
          <select
            value={filters.propertyId}
            onChange={(e) => setFilters((f) => ({ ...f, propertyId: e.target.value }))}
          >
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="sla-filter-group">
          <label>From</label>
          <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="sla-filter-group">
          <label>To</label>
          <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>
        {isFetching && <Loader2 size={16} className="spinner" style={{ marginLeft: 8 }} />}
      </div>

      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading SLA report...</div>
      ) : !report || report.totalTickets === 0 ? (
        <div className="maint-empty">
          <div className="empty-icon"><ShieldCheck size={28} /></div>
          <p>No tickets found for the selected filters</p>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>Try expanding the date range or changing the property filter</p>
        </div>
      ) : (
        <>
          {/* Overall Summary Cards */}
          <div className="sla-report-summary">
            <div className="sla-summary-gauges">
              <SlaGauge label="Response SLA" rate={report.overall.responseRate} subtitle="First response within target" />
              <SlaGauge label="Resolution SLA" rate={report.overall.resolutionRate} subtitle="Resolved within target" />
            </div>
            <div className="sla-summary-stats">
              <div className="sla-stat-card">
                <div className="sla-stat-icon"><ShieldCheck size={18} /></div>
                <div>
                  <div className="sla-stat-value">{report.totalTickets}</div>
                  <div className="sla-stat-label">Total Tickets</div>
                </div>
              </div>
              <div className="sla-stat-card warning">
                <div className="sla-stat-icon"><AlertTriangle size={18} /></div>
                <div>
                  <div className="sla-stat-value">{report.overall.totalBreaches}</div>
                  <div className="sla-stat-label">Total Breaches</div>
                </div>
              </div>
              {worstGroup && worstGroup.slaResolution.rate < 100 && (
                <div className="sla-stat-card danger">
                  <div className="sla-stat-icon"><TrendingDown size={18} /></div>
                  <div>
                    <div className="sla-stat-value">{worstGroup.slaResolution.rate}%</div>
                    <div className="sla-stat-label">Worst: {worstGroup.group}</div>
                  </div>
                </div>
              )}
              {report.overall.resolutionRate >= 90 && (
                <div className="sla-stat-card success">
                  <div className="sla-stat-icon"><TrendingUp size={18} /></div>
                  <div>
                    <div className="sla-stat-value">On Track</div>
                    <div className="sla-stat-label">Overall SLA compliance ≥ 90%</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="detail-card" style={{ marginTop: 20 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} />
              SLA Breakdown by {filters.groupBy.charAt(0).toUpperCase() + filters.groupBy.slice(1)}
              <span className="sla-group-count">({report.groups.length} groups)</span>
            </h3>

            <div className="maint-table-wrap" style={{ marginTop: 14 }}>
              <table className="maint-table sla-report-table">
                <thead>
                  <tr>
                    <th>{filters.groupBy.charAt(0).toUpperCase() + filters.groupBy.slice(1)}</th>
                    <th className="text-center">Tickets</th>
                    <th>Response SLA</th>
                    <th>Resolution SLA</th>
                    <th className="text-center">Breaches</th>
                    <th className="text-center">Avg Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups.map((g) => (
                    <GroupRow key={g.group} g={g} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
