import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetSecurityIncidentsQuery, useCreateSecurityIncidentMutation,
  useResolveSecurityIncidentMutation, useGetSecurityStatsQuery,
} from '../../../store/api/securityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Shield, Plus, Loader2, AlertTriangle, Eye, CheckCircle2,
  FileWarning, AlertOctagon, MapPin, Clock, User,
  TrendingUp, DoorOpen, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

const TYPES = ['theft', 'vandalism', 'trespassing', 'fire', 'medical', 'accident', 'suspicious_activity', 'other'];
const TYPE_ICONS: Record<string, string> = {
  theft: '🔓', vandalism: '🔨', trespassing: '🚷', fire: '🔥',
  medical: '🏥', accident: '⚠️', suspicious_activity: '🔍', other: '📋',
};
const SEVERITY_MAP: Record<string, { color: string; bg: string; dot: string }> = {
  low: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', dot: '#9ca3af' },
  medium: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', dot: '#facc15' },
  high: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', dot: '#fb923c' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', dot: '#f87171' },
};
const STATUS_THEME: Record<string, { color: string; bg: string; icon: any }> = {
  open: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: AlertOctagon },
  investigating: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: Eye },
  resolved: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle2 },
  closed: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', icon: Shield },
  escalated: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)', icon: AlertTriangle },
};

export default function SecurityIncidentsPage() {
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);

  const { data: incData, isLoading } = useGetSecurityIncidentsQuery({
    severity: severity || undefined, status: status || undefined, page, limit: 20,
  });
  const { data: statsData } = useGetSecurityStatsQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createIncident] = useCreateSecurityIncidentMutation();
  const [resolveIncident] = useResolveSecurityIncidentMutation();

  const incidents = incData?.data || [];
  const meta = incData?.meta;
  const stats = statsData?.data;
  const properties = propsData?.data || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createIncident({
        propertyId: fd.get('propertyId'), incidentType: fd.get('incidentType'),
        severity: fd.get('severity'), title: fd.get('title'),
        description: fd.get('description'), locationDetail: fd.get('locationDetail') || undefined,
        incidentAt: new Date(fd.get('incidentAt') as string).toISOString(),
        policeReportNo: fd.get('policeReportNo') || undefined,
        followUpRequired: fd.get('followUpRequired') === 'on',
      }).unwrap();
      toast.success('Incident reported'); setShowCreate(false);
    } catch { toast.error('Failed'); }
  };

  const handleResolve = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await resolveIncident({
        id: resolveId!,
        data: { resolution: fd.get('resolution'), policeReportNo: fd.get('policeReportNo') || undefined },
      }).unwrap();
      toast.success('Incident resolved'); setResolveId(null);
    } catch { toast.error('Failed'); }
  };

  const patrolComp = stats?.patrolCompliance;
  const compRate = patrolComp?.complianceRate ?? 0;
  const compColor = compRate >= 80 ? '#10b981' : compRate >= 50 ? '#eab308' : '#ef4444';

  return (
    <div className="maint-page">
      {/* ── Stats Row ── */}
      {stats && (
        <div className="maint-stats-row">
          <div className="maint-stat-card blue">
            <div className="msc-icon"><Shield size={18} /></div>
            <div className="msc-label">Total Incidents</div>
            <div className="msc-value">{stats.incidentSummary?.total || 0}</div>
          </div>
          <div className="maint-stat-card red">
            <div className="msc-icon"><AlertOctagon size={18} /></div>
            <div className="msc-label">Open</div>
            <div className="msc-value">{stats.incidentSummary?.open || 0}</div>
          </div>
          <div className="maint-stat-card" style={{ position: 'relative' }}>
            <div className="msc-icon" style={{ background: 'rgba(234,179,8,0.14)', color: '#eab308' }}><Eye size={18} /></div>
            <div className="msc-label">Investigating</div>
            <div className="msc-value" style={{ color: '#eab308' }}>{stats.incidentSummary?.investigating || 0}</div>
          </div>
          <div className="maint-stat-card green">
            <div className="msc-icon"><CheckCircle2 size={18} /></div>
            <div className="msc-label">Resolved</div>
            <div className="msc-value">{stats.incidentSummary?.resolved || 0}</div>
          </div>
          <div className="maint-stat-card" style={{ position: 'relative' }}>
            <div className="msc-icon" style={{ background: 'rgba(249,115,22,0.14)', color: '#f97316' }}><FileWarning size={18} /></div>
            <div className="msc-label">High + Critical</div>
            <div className="msc-value" style={{ color: '#f97316' }}>{(stats.bySeverity?.high || 0) + (stats.bySeverity?.critical || 0)}</div>
          </div>
          {patrolComp && (
            <div className="maint-stat-card" style={{ position: 'relative' }}>
              <div className="msc-icon" style={{ background: `${compColor}22`, color: compColor }}><TrendingUp size={18} /></div>
              <div className="msc-label">Patrol Compliance</div>
              <div className="msc-value" style={{ color: compColor }}>{compRate}%</div>
              <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginTop: '4px' }}>
                <div style={{ height: '100%', width: `${compRate}%`, borderRadius: '2px', background: compColor, transition: 'width 0.5s' }} />
              </div>
            </div>
          )}
          {stats.accessDenied24h !== undefined && (
            <div className="maint-stat-card purple">
              <div className="msc-icon"><DoorOpen size={18} /></div>
              <div className="msc-label">Access Denied (24h)</div>
              <div className="msc-value">{stats.accessDenied24h}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Shield size={20} /></div>
          <div><h1>Security Incidents</h1><p>{meta?.total ?? 0} incidents</p></div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Report Incident
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="maint-filters">
        {['', 'low', 'medium', 'high', 'critical'].map((s) => (
          <button key={s || 'all'} className={`filter-chip ${severity === s ? 'active' : ''}`}
            onClick={() => { setSeverity(s); setPage(1); }}>
            {s ? (
              <>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: SEVERITY_MAP[s]?.dot, display: 'inline-block' }} />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </>
            ) : 'All Severity'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }} />
        <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {['open', 'investigating', 'resolved', 'closed', 'escalated'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Incident Cards ── */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : incidents.length === 0 ? (
        <div className="maint-empty"><Shield size={32} /><p>No incidents found</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {incidents.map((inc: any) => {
            const sev = SEVERITY_MAP[inc.severity] || SEVERITY_MAP.medium;
            const st = STATUS_THEME[inc.status] || STATUS_THEME.open;
            const StIcon = st.icon;
            const reporter = inc.reportedBy?.profile
              ? `${inc.reportedBy.profile.firstName} ${inc.reportedBy.profile.lastName}`
              : inc.reportedBy?.email || '—';
            return (
              <div key={inc.id} style={{
                background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '14px', padding: '18px 20px', position: 'relative', overflow: 'hidden',
                display: 'flex', gap: '16px', alignItems: 'center',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Severity indicator */}
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: sev.color, borderRadius: '4px 0 0 4px' }} />

                {/* Type icon */}
                <div style={{
                  width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                  background: sev.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px',
                }}>
                  {TYPE_ICONS[inc.incidentType] || '📋'}
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-tertiary)', letterSpacing: '0.5px' }}>{inc.incidentNumber}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: sev.bg, color: sev.color, textTransform: 'uppercase' }}>
                      {inc.severity}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inc.title}</div>
                  <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontWeight: 600 }}>{inc.incidentType?.replace('_', ' ')}</span>
                    </span>
                    {inc.property?.name && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><MapPin size={10} /> {inc.property.name}</span>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><User size={10} /> {reporter}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={10} /> {new Date(inc.incidentAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Status + Action */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 12px',
                    borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: st.bg, color: st.color,
                    textTransform: 'uppercase', letterSpacing: '0.3px',
                  }}>
                    <StIcon size={11} /> {inc.status}
                  </span>
                  {(inc.status === 'open' || inc.status === 'investigating') && (
                    <button className="btn btn-success btn-sm" onClick={() => setResolveId(inc.id)} style={{ fontSize: '11px' }}>
                      <CheckCircle2 size={11} /> Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {meta && meta.totalPages > 1 && (
        <div className="maint-pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Previous</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={14} /></button>
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <h2><Shield size={18} /> Report Security Incident</h2>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Property *</label>
                  <select name="propertyId" required><option value="">Select...</option>{properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </div>
                <div className="form-group"><label>Type *</label>
                  <select name="incidentType" required>{TYPES.map((t) => <option key={t} value={t}>{TYPE_ICONS[t]} {t.replace('_', ' ')}</option>)}</select>
                </div>
                <div className="form-group"><label>Severity *</label>
                  <select name="severity" defaultValue="medium">
                    <option value="low">Low</option><option value="medium">Medium</option>
                    <option value="high">High</option><option value="critical">Critical</option>
                  </select>
                </div>
                <div className="form-group"><label>Date/Time *</label>
                  <input name="incidentAt" type="datetime-local" required defaultValue={new Date().toISOString().slice(0, 16)} />
                </div>
              </div>
              <div className="form-group"><label>Title *</label><input name="title" required placeholder="Brief incident title" /></div>
              <div className="form-group"><label>Description *</label><textarea name="description" rows={3} required placeholder="Detailed description..." /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Location</label><input name="locationDetail" placeholder="Car Park B1, slot 045" /></div>
                <div className="form-group"><label>Police Report #</label><input name="policeReportNo" /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '16px', cursor: 'pointer' }}>
                <input type="checkbox" name="followUpRequired" /> Follow-up required
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Resolve Modal ── */}
      {resolveId && (
        <div className="modal-overlay" onClick={() => setResolveId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <h2><CheckCircle2 size={18} /> Resolve Incident</h2>
            <form onSubmit={handleResolve}>
              <div className="form-group"><label>Resolution *</label><textarea name="resolution" rows={3} required placeholder="Describe how the incident was resolved..." /></div>
              <div className="form-group"><label>Police Report #</label><input name="policeReportNo" /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setResolveId(null)}>Cancel</button>
                <button type="submit" className="btn btn-success">Resolve</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
