import '../MaintenancePage/MaintenancePage.css';
import { useNavigate } from 'react-router-dom';
import {
  useGetSecurityStatsQuery, useGetSecurityIncidentsQuery,
  useGetPatrolLogsQuery, useGetAccessEventsQuery,
} from '../../../store/api/securityApi';
import {
  Shield, Loader2, AlertOctagon, Eye, CheckCircle2, AlertTriangle,
  MapPin, TrendingUp, Clock, DoorOpen, ShieldX,
  ArrowRight, BarChart3, Target,
} from 'lucide-react';

const SEVERITY_STYLE: Record<string, { color: string; bg: string }> = {
  low: { color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  medium: { color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  high: { color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

const TYPE_ICONS: Record<string, string> = {
  theft: '🔓', vandalism: '🔨', trespassing: '🚷', fire: '🔥',
  medical: '🏥', accident: '⚠️', suspicious_activity: '🔍', other: '📋',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#ef4444', investigating: '#eab308', resolved: '#10b981', closed: '#6b7280',
};

export default function SecurityDashboard() {
  const navigate = useNavigate();

  const { data: statsResp, isLoading } = useGetSecurityStatsQuery({});
  const { data: incResp } = useGetSecurityIncidentsQuery({ status: 'open', limit: 5 });
  const { data: patrolResp } = useGetPatrolLogsQuery({ limit: 5 });
  const { data: accessResp } = useGetAccessEventsQuery({ eventType: 'access_denied', limit: 5 });

  const stats = statsResp?.data;
  const openIncidents = incResp?.data || [];
  const recentPatrols = patrolResp?.data || [];
  const recentDenied = accessResp?.data || [];

  if (isLoading) {
    return (
      <div className="maint-page">
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading security dashboard...</div>
      </div>
    );
  }

  const inc = stats?.incidentSummary || {};
  const patrol = stats?.patrolCompliance || {};
  const sevData = stats?.bySeverity || {};
  const typeData = stats?.byType || [];
  const maxTypeCount = Math.max(...typeData.map((t: any) => t.count), 1);

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Shield size={22} /></div>
          <div>
            <h1>Security Dashboard</h1>
            <p>Incident tracking, patrol compliance & access control overview</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/security/patrol')}>
            <MapPin size={14} /> Patrols
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/security/access-events')}>
            <DoorOpen size={14} /> Access Events
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/security/incidents')}>
            <Shield size={14} /> All Incidents
          </button>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="maint-stats-row">
        <div className="maint-stat-card red">
          <div className="msc-icon"><AlertOctagon size={18} /></div>
          <span className="msc-value">{inc.open ?? 0}</span>
          <span className="msc-label">Open Incidents</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{ background: 'rgba(234,179,8,0.14)', color: '#eab308' }}>
            <Eye size={18} />
          </div>
          <span className="msc-value" style={{ color: '#eab308' }}>{inc.investigating ?? 0}</span>
          <span className="msc-label">Investigating</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><CheckCircle2 size={18} /></div>
          <span className="msc-value">{inc.resolved ?? 0}</span>
          <span className="msc-label">Resolved</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{
            background: patrol.complianceRate >= 80 ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
            color: patrol.complianceRate >= 80 ? '#10b981' : '#ef4444',
          }}>
            <Target size={18} />
          </div>
          <span className="msc-value" style={{
            color: patrol.complianceRate >= 80 ? '#10b981' : '#ef4444',
          }}>{patrol.complianceRate ?? 100}%</span>
          <span className="msc-label">Patrol Compliance</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{
            background: (stats?.accessDenied24h ?? 0) > 0 ? 'rgba(220,38,38,0.14)' : 'rgba(107,114,128,0.14)',
            color: (stats?.accessDenied24h ?? 0) > 0 ? '#dc2626' : '#6b7280',
          }}>
            <ShieldX size={18} />
          </div>
          <span className="msc-value" style={{
            color: (stats?.accessDenied24h ?? 0) > 0 ? '#dc2626' : undefined,
          }}>{stats?.accessDenied24h ?? 0}</span>
          <span className="msc-label">Access Denied (24h)</span>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="sec-dash-grid">
        {/* Left Column */}
        <div className="hk-dash-col">
          {/* Severity Breakdown */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={15} /> Incidents by Severity</h3>
              <span className="cell-secondary" style={{ fontSize: '11px' }}>{inc.total ?? 0} total</span>
            </div>
            <div className="sec-severity-bars">
              {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                const count = sevData[sev] || 0;
                const pct = (inc.total ?? 0) > 0 ? Math.round((count / inc.total) * 100) : 0;
                const s = SEVERITY_STYLE[sev];
                return (
                  <div key={sev} className="sec-sev-row">
                    <span className="sec-sev-label" style={{ color: s.color }}>
                      {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </span>
                    <div className="sec-sev-bar-track">
                      <div className="sec-sev-bar-fill" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                    <span className="sec-sev-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Incidents by Type */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><AlertTriangle size={15} /> Incidents by Type</h3>
            </div>
            {typeData.length === 0 ? (
              <div className="hk-dash-empty">
                <Shield size={20} color="var(--text-tertiary)" />
                <span>No incidents recorded</span>
              </div>
            ) : (
              <div className="sec-type-chart">
                {typeData.slice(0, 6).map((t: any) => {
                  const pct = Math.round((t.count / maxTypeCount) * 100);
                  return (
                    <div key={t.type} className="sec-type-row">
                      <span className="sec-type-icon">{TYPE_ICONS[t.type] || '📋'}</span>
                      <span className="sec-type-label">{t.type.replace(/_/g, ' ')}</span>
                      <div className="sec-type-bar-track">
                        <div className="sec-type-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="sec-type-count">{t.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Patrol Compliance */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><Target size={15} /> Patrol Compliance (Today)</h3>
            </div>
            <div className="sec-patrol-stats">
              <div className="sec-patrol-ring">
                <svg viewBox="0 0 60 60" className="sec-ring-svg">
                  <circle cx="30" cy="30" r="25" className="sec-ring-bg" />
                  <circle cx="30" cy="30" r="25" className="sec-ring-fill"
                    style={{
                      strokeDasharray: `${(patrol.complianceRate || 0) * 1.57} 157`,
                      stroke: patrol.complianceRate >= 80 ? '#10b981' : patrol.complianceRate >= 50 ? '#eab308' : '#ef4444',
                    }} />
                </svg>
                <span className="sec-ring-label" style={{
                  color: patrol.complianceRate >= 80 ? '#10b981' : patrol.complianceRate >= 50 ? '#eab308' : '#ef4444',
                }}>{patrol.complianceRate ?? 100}%</span>
              </div>
              <div className="sec-patrol-detail">
                <div className="hk-qs-item">
                  <span className="hk-qs-label">Scheduled</span>
                  <span className="hk-qs-value">{patrol.scheduled ?? 0}</span>
                </div>
                <div className="hk-qs-item">
                  <span className="hk-qs-label">Completed</span>
                  <span className="hk-qs-value" style={{ color: '#10b981' }}>{patrol.completed ?? 0}</span>
                </div>
                <div className="hk-qs-item">
                  <span className="hk-qs-label">Missed</span>
                  <span className="hk-qs-value" style={{ color: (patrol.missed ?? 0) > 0 ? '#ef4444' : undefined }}>
                    {patrol.missed ?? 0}
                  </span>
                </div>
                <div className="hk-qs-item">
                  <span className="hk-qs-label">Checkpoints</span>
                  <span className="hk-qs-value">{stats?.checkpoints ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="hk-dash-col">
          {/* Open Incidents Feed */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><AlertOctagon size={15} /> Open Incidents</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/security/incidents')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {openIncidents.length === 0 ? (
              <div className="hk-dash-empty">
                <CheckCircle2 size={24} color="#10b981" />
                <span>No open incidents</span>
              </div>
            ) : (
              <div className="sec-feed">
                {openIncidents.map((inc: any) => {
                  const s = SEVERITY_STYLE[inc.severity] || SEVERITY_STYLE.medium;
                  return (
                    <div key={inc.id} className="sec-feed-item" style={{ borderLeftColor: s.color }}
                      onClick={() => navigate(`/admin/security/incidents/${inc.id}`)}>
                      <div className="sec-feed-icon" style={{ background: s.bg }}>
                        {TYPE_ICONS[inc.incidentType] || '📋'}
                      </div>
                      <div className="sec-feed-info">
                        <span className="sec-feed-title">{inc.title}</span>
                        <span className="sec-feed-meta">
                          <span className="sec-feed-sev" style={{ color: s.color }}>{inc.severity}</span>
                          {inc.property?.name && <> · {inc.property.name}</>}
                          <> · {new Date(inc.incidentAt).toLocaleDateString()}</>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Patrol Logs */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><MapPin size={15} /> Recent Patrol Scans</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/security/patrol')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {recentPatrols.length === 0 ? (
              <div className="hk-dash-empty">
                <MapPin size={20} color="var(--text-tertiary)" />
                <span>No patrol logs yet</span>
              </div>
            ) : (
              <div className="sec-feed">
                {recentPatrols.map((log: any) => (
                  <div key={log.id} className="sec-patrol-row">
                    <div className="sec-patrol-dot" style={{
                      background: log.status === 'on_time' ? '#10b981' : log.status === 'late' ? '#f59e0b' : '#ef4444',
                    }} />
                    <div className="sec-feed-info">
                      <span className="sec-feed-title">{log.checkpoint?.name || 'Checkpoint'}</span>
                      <span className="sec-feed-meta">
                        <Clock size={10} /> {new Date(log.scannedAt).toLocaleString(undefined, {
                          hour: '2-digit', minute: '2-digit',
                        })}
                        {log.guard && <> · {log.guard.profile?.firstName} {log.guard.profile?.lastName}</>}
                      </span>
                    </div>
                    <span className="sec-patrol-status" style={{
                      color: log.status === 'on_time' ? '#10b981' : '#f59e0b',
                      background: log.status === 'on_time' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                    }}>{log.status?.replace('_', ' ') || 'scanned'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Access Denied */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3 style={{ color: '#ef4444' }}><ShieldX size={15} /> Recent Access Denied</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/security/access-events')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {recentDenied.length === 0 ? (
              <div className="hk-dash-empty">
                <CheckCircle2 size={20} color="#10b981" />
                <span>No denied events</span>
              </div>
            ) : (
              <div className="sec-feed">
                {recentDenied.map((evt: any) => (
                  <div key={evt.id} className="sec-denied-row">
                    <ShieldX size={14} color="#ef4444" />
                    <div className="sec-feed-info">
                      <span className="sec-feed-title">{evt.doorName || evt.deviceName || 'Unknown Door'}</span>
                      <span className="sec-feed-meta">
                        {evt.cardNumber && <><span style={{ fontFamily: 'monospace' }}>{evt.cardNumber}</span> · </>}
                        {evt.denialReason || 'Access denied'}
                        <> · {new Date(evt.eventAt).toLocaleString(undefined, {
                          hour: '2-digit', minute: '2-digit',
                        })}</>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
