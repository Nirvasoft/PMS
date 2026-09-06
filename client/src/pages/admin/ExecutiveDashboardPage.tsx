import React, { useState } from 'react';
import {
  useGetExecutiveSummaryQuery,
  useGetOccupancyForecastQuery,
  useGetRevenueForecastQuery,
  useGetAnomaliesQuery,
  useDetectAnomaliesMutation,
  useAcknowledgeAnomalyMutation,
} from '../../store/api/biApi';
import {
  BarChart3, TrendingUp, TrendingDown, Building2, Users, DollarSign,
  Wrench, AlertTriangle, ChevronRight, RefreshCw, CheckCircle, Eye,
  Activity, PieChart, Calendar,
} from 'lucide-react';
import { PermissionGuard } from '../../components/guards/PermissionGuard';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  warning: '#f97316',
};

const DATE_RANGES = [
  { value: 'mtd', label: 'Month to Date' },
  { value: 'qtd', label: 'Quarter to Date' },
  { value: 'ytd', label: 'Year to Date' },
  { value: '12m', label: 'Last 12 Months' },
];

export default function ExecutiveDashboardPage() {
  const [dateRange, setDateRange] = useState('ytd');

  const { data: summary, isLoading } = useGetExecutiveSummaryQuery({ dateRange });
  const { data: occForecast } = useGetOccupancyForecastQuery({ period: '6m' });
  const { data: revForecast } = useGetRevenueForecastQuery({ period: '6m' });
  const { data: anomaliesResult } = useGetAnomaliesQuery({ acknowledged: 'false' });
  const [detectAnomalies, { isLoading: detecting }] = useDetectAnomaliesMutation();
  const [acknowledgeAnomaly] = useAcknowledgeAnomalyMutation();

  const portfolio = summary?.data?.portfolio;
  const properties = summary?.data?.properties || [];
  const alerts = summary?.data?.topAlerts || [];
  const anomalies = anomaliesResult?.data || [];
  const forecastOcc = occForecast?.data?.forecastData || occForecast?.data?.forecast_data || [];
  const forecastRev = revForecast?.data?.forecastData || revForecast?.data?.forecast_data || [];

  if (isLoading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-content" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            <BarChart3 size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Executive Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 }}>
            Portfolio-wide performance overview
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}
          >
            {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Row */}
      {portfolio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <KpiCard icon={<Building2 size={20} />} label="Properties" value={portfolio.totalProperties} color="#6366f1" />
          <KpiCard icon={<Users size={20} />} label="Total Units" value={portfolio.totalUnits} sub={`${portfolio.occupancyRate}% occupied`} color="#06b6d4" />
          <KpiCard icon={<DollarSign size={20} />} label="Revenue YTD" value={`$${(portfolio.totalRevenueYtd / 1000).toFixed(0)}K`} sub={portfolio.revenueTrend} color="#22c55e" />
          <KpiCard icon={<PieChart size={20} />} label="Collection Rate" value={`${portfolio.collectionRate}%`} color="#eab308" />
          <KpiCard icon={<Wrench size={20} />} label="Open Tickets" value={portfolio.openMaintenanceTickets} sub={`${portfolio.criticalTickets} critical`} color="#f97316" />
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Property Performance Table */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
            <Building2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Property Performance
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Property</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Units</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Occupancy</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Revenue</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Collection</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Tickets</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p: any) => (
                  <tr key={p.propertyId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{p.totalUnits}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ color: p.occupancyRate > 85 ? '#22c55e' : p.occupancyRate > 70 ? '#eab308' : '#ef4444' }}>
                        {p.occupancyRate}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>${(p.revenueYtd / 1000).toFixed(0)}K</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ color: p.collectionRate > 90 ? '#22c55e' : '#eab308' }}>
                        {p.collectionRate}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{p.openTickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
            <AlertTriangle size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Top Alerts
          </h3>
          {alerts.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No alerts — everything looks good! ✓</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((a: any, i: number) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${SEVERITY_COLORS[a.severity]}33`,
                  background: `${SEVERITY_COLORS[a.severity]}08`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: SEVERITY_COLORS[a.severity],
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {a.count} {a.type.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Forecasts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <ForecastChart
          title="Occupancy Forecast"
          icon={<TrendingUp size={16} />}
          data={Array.isArray(forecastOcc) ? forecastOcc : []}
          suffix="%"
          color="#6366f1"
        />
        <ForecastChart
          title="Revenue Forecast"
          icon={<DollarSign size={16} />}
          data={Array.isArray(forecastRev) ? forecastRev : []}
          prefix="$"
          color="#22c55e"
          divideBy={1000}
          suffix="K"
        />
      </div>

      {/* Anomalies */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            <Activity size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Detected Anomalies
          </h3>
          <PermissionGuard permission="reports-anomalies.write">
            <button
              onClick={() => detectAnomalies()}
              disabled={detecting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--card-bg)', color: 'var(--text-primary)',
                cursor: 'pointer', fontSize: 12,
              }}
            >
              <RefreshCw size={14} className={detecting ? 'spin' : ''} />
              {detecting ? 'Scanning...' : 'Run Detection'}
            </button>
          </PermissionGuard>
        </div>

        {anomalies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
            <CheckCircle size={36} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p>No unacknowledged anomalies</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
            {anomalies.slice(0, 8).map((a: any) => (
              <div key={a.id} style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: `1px solid ${SEVERITY_COLORS[a.severity]}33`,
                background: `${SEVERITY_COLORS[a.severity]}06`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    color: SEVERITY_COLORS[a.severity],
                    padding: '2px 8px', borderRadius: 4,
                    background: `${SEVERITY_COLORS[a.severity]}18`,
                  }}>
                    {a.anomalyType.replace(/_/g, ' ')}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: SEVERITY_COLORS[a.severity],
                    padding: '2px 6px', borderRadius: 4,
                    background: `${SEVERITY_COLORS[a.severity]}18`,
                  }}>
                    {a.severity}
                  </span>
                </div>
                <p style={{ fontSize: 13, margin: '6px 0', lineHeight: 1.4 }}>{a.description}</p>
                {a.deviationPct && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Deviation: {Number(a.deviationPct).toFixed(1)}%
                    {a.property && ` • ${a.property.name}`}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <PermissionGuard permission="reports-anomalies.write">
                    <button
                      onClick={() => acknowledgeAnomaly(a.id)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        border: '1px solid var(--border-color)', background: 'var(--card-bg)',
                        color: 'var(--text-primary)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Eye size={12} /> Acknowledge
                    </button>
                  </PermissionGuard>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="card" style={{
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${color}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ForecastChart({ title, icon, data, prefix = '', suffix = '', color, divideBy = 1 }: {
  title: string; icon: React.ReactNode; data: any[]; prefix?: string; suffix?: string; color: string; divideBy?: number;
}) {
  if (!data.length) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          {icon} {title}
        </h3>
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>
          <Calendar size={24} style={{ marginBottom: 8, opacity: 0.3 }} />
          <p>Not enough data for forecast (6+ months needed)</p>
        </div>
      </div>
    );
  }

  const values = data.map(d => d.value / divideBy);
  const maxVal = Math.max(...values, ...data.map(d => (d.upperBound || d.value) / divideBy));
  const minVal = Math.min(...values, ...data.map(d => (d.lowerBound || d.value) / divideBy));
  const range = maxVal - minVal || 1;

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon} {title}
      </h3>
      {/* Simple bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '0 4px' }}>
        {data.map((d: any, i: number) => {
          const val = d.value / divideBy;
          const height = ((val - minVal) / range) * 80 + 20;
          const monthLabel = new Date(d.date).toLocaleDateString('en', { month: 'short' });
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {prefix}{Math.round(val)}{suffix}
              </div>
              <div style={{
                width: '100%',
                height: `${height}%`,
                background: `linear-gradient(to top, ${color}, ${color}88)`,
                borderRadius: '6px 6px 0 0',
                minHeight: 8,
                position: 'relative',
              }}>
                {d.upperBound && (
                  <div style={{
                    position: 'absolute', top: -4, left: '10%', right: '10%',
                    borderTop: `2px dashed ${color}44`,
                  }} />
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{monthLabel}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>
        {data.length}-month projection with 95% confidence interval
      </div>
    </div>
  );
}
