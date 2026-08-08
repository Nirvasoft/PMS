import { useState, useMemo } from 'react';
import { useGetPortalAnalyticsQuery, type PortalAnalyticsData } from '../../../store/api/portalApi';
import {
  Activity, Users, Clock, FileText, Wifi, TrendingUp,
  Calendar,
} from 'lucide-react';

function formatDateInput(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function PortalAnalyticsPage() {
  const [startDate, setStartDate] = useState(() => formatDateInput(new Date(Date.now() - 30 * 86400000)));
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));

  const { data, isLoading } = useGetPortalAnalyticsQuery({ startDate, endDate });

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Activity size={24} /> Portal Session Analytics</h1>
        <p className="text-muted">Track portal usage, engagement, and activity patterns</p>
      </div>

      {/* Date Range */}
      <div className="section-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <Calendar size={16} />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="form-input" style={{ width: 150 }} />
        <span>to</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input" style={{ width: 150 }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => { setStartDate(formatDateInput(new Date(Date.now() - 7 * 86400000))); setEndDate(formatDateInput(new Date())); }}>7 Days</button>
        <button className="btn btn-sm" onClick={() => { setStartDate(formatDateInput(new Date(Date.now() - 30 * 86400000))); setEndDate(formatDateInput(new Date())); }}>30 Days</button>
        <button className="btn btn-sm" onClick={() => { setStartDate(formatDateInput(new Date(Date.now() - 90 * 86400000))); setEndDate(formatDateInput(new Date())); }}>90 Days</button>
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading analytics...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <SummaryCards data={data} />

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginTop: 20 }}>
            {/* Daily Sessions Chart */}
            <div className="info-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={18} /> Daily Sessions
              </h3>
              <DailyChart dailyCounts={data.dailyCounts} />
            </div>

            {/* Peak Hours Chart */}
            <div className="info-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} /> Peak Hours
              </h3>
              <HourlyChart peakHours={data.peakHours} />
            </div>
          </div>

          {/* Top Users */}
          <div className="info-card" style={{ padding: 20, marginTop: 20 }}>
            <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} /> Top Portal Users
            </h3>
            {data.topUsers.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>No sessions recorded yet</p>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table" id="top-users-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Sessions</th>
                      <th>Pages Visited</th>
                      <th>Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topUsers.map((u, i) => (
                      <tr key={u.userId}>
                        <td style={{ fontWeight: 700, opacity: 0.4 }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{u.name || '—'}</td>
                        <td className="text-muted">{u.email}</td>
                        <td>
                          <span className="status-badge status-active">{u.sessionCount}</span>
                        </td>
                        <td>{u.totalPages}</td>
                        <td>
                          <EngagementBar value={u.sessionCount} max={data.topUsers[0]?.sessionCount || 1} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Activity size={40} />
          <p>No analytics data available</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────

function SummaryCards({ data }: { data: PortalAnalyticsData }) {
  const cards = [
    { icon: <Activity size={22} />, label: 'Total Sessions', value: data.summary.totalSessions.toLocaleString(), color: '#6366f1' },
    { icon: <Users size={22} />, label: 'Unique Users', value: data.summary.uniqueUsers.toLocaleString(), color: '#8b5cf6' },
    { icon: <Clock size={22} />, label: 'Avg Duration', value: `${data.summary.avgDurationMinutes} min`, color: '#06b6d4' },
    { icon: <FileText size={22} />, label: 'Avg Pages/Session', value: String(data.summary.avgPages), color: '#10b981' },
    { icon: <Wifi size={22} />, label: 'Active Now', value: String(data.activeNow), color: data.activeNow > 0 ? '#22c55e' : '#94a3b8' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
      {cards.map((c) => (
        <div key={c.label} className="info-card" style={{
          padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 6,
          borderTop: `3px solid ${c.color}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: c.color }}>
            {c.icon}
            <span style={{ fontSize: '0.8rem', fontWeight: 500, opacity: 0.7, color: 'inherit' }}>{c.label}</span>
          </div>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ dailyCounts }: { dailyCounts: PortalAnalyticsData['dailyCounts'] }) {
  const maxCount = useMemo(() => Math.max(...dailyCounts.map(d => d.count), 1), [dailyCounts]);

  if (!dailyCounts.length) {
    return <p className="text-muted" style={{ textAlign: 'center', padding: 30 }}>No data for this period</p>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 160, overflow: 'hidden' }}>
      {dailyCounts.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count} sessions`}
          style={{
            flex: 1,
            minWidth: 4,
            maxWidth: 20,
            height: `${Math.max(4, (d.count / maxCount) * 100)}%`,
            background: 'linear-gradient(to top, #6366f1, #a78bfa)',
            borderRadius: '3px 3px 0 0',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.7'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
        />
      ))}
    </div>
  );
}

function HourlyChart({ peakHours }: { peakHours: PortalAnalyticsData['peakHours'] }) {
  // Fill all 24 hours
  const hours = useMemo(() => {
    const map = new Map(peakHours.map(h => [h.hour, h.count]));
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: map.get(i) || 0 }));
  }, [peakHours]);
  const maxCount = Math.max(...hours.map(h => h.count), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
      {hours.map((h) => (
        <div
          key={h.hour}
          title={`${h.hour}:00 — ${h.count} sessions`}
          style={{
            flex: 1,
            height: `${Math.max(3, (h.count / maxCount) * 100)}%`,
            background: h.count > 0
              ? `hsl(${200 + (h.count / maxCount) * 60}, 70%, 55%)`
              : 'rgba(128,128,128,0.1)',
            borderRadius: '2px 2px 0 0',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

function EngagementBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height: 6, background: 'rgba(128,128,128,0.1)', borderRadius: 3 }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: 'linear-gradient(to right, #6366f1, #a78bfa)',
        borderRadius: 3,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}
