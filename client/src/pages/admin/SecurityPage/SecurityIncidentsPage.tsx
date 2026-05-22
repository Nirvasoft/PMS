import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetSecurityIncidentsQuery, useCreateSecurityIncidentMutation,
  useResolveSecurityIncidentMutation, useGetSecurityStatsQuery,
} from '../../../store/api/securityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Shield, Plus, Loader2, Search, AlertTriangle, Eye, CheckCircle2,
  FileWarning, AlertOctagon,
} from 'lucide-react';
import toast from 'react-hot-toast';

const TYPES = ['theft', 'vandalism', 'trespassing', 'fire', 'medical', 'accident', 'suspicious_activity', 'other'];
const TYPE_ICONS: Record<string, string> = {
  theft: '🔓', vandalism: '🔨', trespassing: '🚷', fire: '🔥',
  medical: '🏥', accident: '⚠️', suspicious_activity: '🔍', other: '📋',
};
const SEVERITY_MAP: Record<string, { color: string; bg: string }> = {
  low: { color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  medium: { color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  high: { color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};
const STATUS_CSS: Record<string, string> = {
  open: 'open', investigating: 'in_progress', resolved: 'completed', closed: 'closed', escalated: 'cancelled',
};

export default function SecurityIncidentsPage() {
  const [search, setSearch] = useState('');
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

  return (
    <div className="maint-page">
      {/* Stats */}
      {stats && (
        <div className="maint-stats-row">
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}><Shield size={18} /></div>
            <div><div className="stat-value">{stats.incidentSummary?.total || 0}</div><div className="stat-label">Total Incidents</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><AlertOctagon size={18} /></div>
            <div><div className="stat-value">{stats.incidentSummary?.open || 0}</div><div className="stat-label">Open</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}><Eye size={18} /></div>
            <div><div className="stat-value">{stats.incidentSummary?.investigating || 0}</div><div className="stat-label">Investigating</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}><CheckCircle2 size={18} /></div>
            <div><div className="stat-value">{stats.incidentSummary?.resolved || 0}</div><div className="stat-label">Resolved</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316' }}><FileWarning size={18} /></div>
            <div><div className="stat-value">{stats.bySeverity?.high + stats.bySeverity?.critical || 0}</div><div className="stat-label">High/Critical</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}><AlertTriangle size={18} /></div>
            <div><div className="stat-value">{stats.checkpoints || 0}</div><div className="stat-label">Checkpoints</div></div>
          </div>
        </div>
      )}

      {/* Header */}
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

      {/* Filters */}
      <div className="maint-filters">
        <select className="filter-select" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
          <option value="">All Severity</option>
          {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {['open', 'investigating', 'resolved', 'closed', 'escalated'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : incidents.length === 0 ? (
        <div className="maint-empty"><Shield size={32} /><p>No incidents found</p></div>
      ) : (
        <div className="maint-table-wrap">
          <table className="maint-table">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Property</th>
                <th>Status</th>
                <th>Reported</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc: any) => {
                const sev = SEVERITY_MAP[inc.severity] || SEVERITY_MAP.medium;
                const reporter = inc.reportedBy?.profile
                  ? `${inc.reportedBy.profile.firstName} ${inc.reportedBy.profile.lastName}`
                  : inc.reportedBy?.email || '—';
                return (
                  <tr key={inc.id}>
                    <td>
                      <span className="cell-mono" style={{ fontSize: '11px' }}>{inc.incidentNumber}</span>
                      <span className="cell-primary" style={{ display: 'block' }}>{inc.title}</span>
                    </td>
                    <td>
                      <span className="maint-status open">
                        {TYPE_ICONS[inc.incidentType] || '📋'} {inc.incidentType?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                        background: sev.bg, color: sev.color, textTransform: 'uppercase',
                      }}>
                        {inc.severity}
                      </span>
                    </td>
                    <td><span className="cell-secondary">{inc.property?.name}</span></td>
                    <td><span className={`maint-status ${STATUS_CSS[inc.status] || 'open'}`}>{inc.status}</span></td>
                    <td>
                      <span className="cell-secondary">{reporter}</span>
                      <span className="cell-secondary" style={{ display: 'block', fontSize: '11px' }}>
                        {new Date(inc.incidentAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td>
                      {(inc.status === 'open' || inc.status === 'investigating') && (
                        <button className="btn btn-success btn-sm" onClick={() => setResolveId(inc.id)}>
                          <CheckCircle2 size={12} /> Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="maint-pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {/* Create Modal */}
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

      {/* Resolve Modal */}
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
