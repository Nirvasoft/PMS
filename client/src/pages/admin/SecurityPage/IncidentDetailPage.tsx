import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetSecurityIncidentByIdQuery, useResolveSecurityIncidentMutation,
  useUpdateSecurityIncidentMutation,
} from '../../../store/api/securityApi';
import {
  Shield, Loader2, ArrowLeft, MapPin, Clock, User,
  CheckCircle2, AlertTriangle, AlertOctagon, Eye, XCircle,
  FileText, Phone, Building2, Users2, CalendarClock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const TYPE_ICONS: Record<string, string> = {
  theft: '🔓', vandalism: '🔨', trespassing: '🚷', fire: '🔥',
  medical: '🏥', accident: '⚠️', suspicious_activity: '🔍', other: '📋',
};
const SEVERITY_MAP: Record<string, { color: string; bg: string; label: string }> = {
  low: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'Low' },
  medium: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', label: 'Medium' },
  high: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'High' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: 'Critical' },
};
const STATUS_MAP: Record<string, { color: string; bg: string; icon: typeof Shield; label: string }> = {
  open: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: AlertOctagon, label: 'Open' },
  investigating: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: Eye, label: 'Investigating' },
  resolved: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle2, label: 'Resolved' },
  closed: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', icon: Shield, label: 'Closed' },
  escalated: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)', icon: AlertTriangle, label: 'Escalated' },
};

function fullName(user: any) {
  if (!user) return '—';
  if (user.profile) return `${user.profile.firstName} ${user.profile.lastName}`;
  return user.email || '—';
}

export default function IncidentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: resp, isLoading, error } = useGetSecurityIncidentByIdQuery(id!);
  const [resolveIncident] = useResolveSecurityIncidentMutation();
  const [updateIncident] = useUpdateSecurityIncidentMutation();
  const [showResolve, setShowResolve] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);

  if (isLoading) {
    return (
      <div className="maint-page">
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading incident...</div>
      </div>
    );
  }

  if (error || !resp?.data) {
    return (
      <div className="maint-page">
        <div className="maint-empty">
          <Shield size={40} />
          <p>Incident not found</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/security/incidents')}>
            <ArrowLeft size={14} /> Back to Incidents
          </button>
        </div>
      </div>
    );
  }

  const inc = resp.data;
  const sev = SEVERITY_MAP[inc.severity] || SEVERITY_MAP.medium;
  const st = STATUS_MAP[inc.status] || STATUS_MAP.open;
  const StIcon = st.icon;
  const elapsed = Math.round((Date.now() - new Date(inc.incidentAt).getTime()) / 3600000);

  const handleResolve = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await resolveIncident({
        id: inc.id,
        data: {
          resolution: fd.get('resolution') as string,
          policeReportNo: (fd.get('policeReportNo') as string) || undefined,
        },
      }).unwrap();
      toast.success('Incident resolved');
      setShowResolve(false);
    } catch { toast.error('Failed to resolve'); }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateIncident({ id: inc.id, data: { status: newStatus } }).unwrap();
      toast.success(`Status changed to ${newStatus}`);
      setShowStatusChange(false);
    } catch { toast.error('Failed to update status'); }
  };

  // Timeline events
  const timeline: { time: string; label: string; icon: typeof Clock; color: string }[] = [
    { time: inc.incidentAt, label: 'Incident occurred', icon: AlertOctagon, color: sev.color },
    { time: inc.createdAt, label: 'Reported', icon: FileText, color: '#6366f1' },
  ];
  if (inc.resolvedAt) {
    timeline.push({ time: inc.resolvedAt, label: 'Resolved', icon: CheckCircle2, color: '#10b981' });
  }
  timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <div className="maint-page">
      {/* Back Button */}
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: '12px' }}
        onClick={() => navigate('/admin/security/incidents')}>
        <ArrowLeft size={14} /> Back to Incidents
      </button>

      {/* Hero Header */}
      <div className="inc-detail-hero" style={{ borderLeftColor: sev.color }}>
        <div className="inc-hero-top">
          <div className="inc-hero-left">
            <div className="inc-type-icon" style={{ background: sev.bg }}>
              {TYPE_ICONS[inc.incidentType] || '📋'}
            </div>
            <div>
              <div className="inc-hero-meta">
                <span className="cell-mono" style={{ fontSize: '11px' }}>{inc.incidentNumber}</span>
                <span className="inc-severity-badge" style={{ background: sev.bg, color: sev.color }}>
                  {sev.label}
                </span>
                <span className="inc-type-badge">
                  {inc.incidentType?.replace(/_/g, ' ')}
                </span>
              </div>
              <h1 className="inc-hero-title">{inc.title}</h1>
            </div>
          </div>
          <div className="inc-hero-right">
            <span className="inc-status-pill" style={{ background: st.bg, color: st.color }}>
              <StIcon size={13} /> {st.label}
            </span>
            {(inc.status === 'open' || inc.status === 'investigating') && (
              <PermissionGuard permission="security-incidents.write">
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowStatusChange(true)}>
                    Change Status
                  </button>
                  <button className="btn btn-success btn-sm" onClick={() => setShowResolve(true)}>
                    <CheckCircle2 size={14} /> Resolve
                  </button>
                </div>
              </PermissionGuard>
            )}
          </div>
        </div>

        {/* Elapsed Time */}
        <div className="inc-elapsed">
          <CalendarClock size={13} />
          {elapsed < 24
            ? `${elapsed}h ago`
            : `${Math.round(elapsed / 24)}d ago`}
          {' · '}
          {new Date(inc.incidentAt).toLocaleString()}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="inc-detail-grid">
        {/* Left Column — Description & Details */}
        <div className="inc-detail-main">
          {/* Description */}
          <div className="inc-section">
            <h3 className="inc-section-title"><FileText size={14} /> Description</h3>
            <p className="inc-description">{inc.description}</p>
          </div>

          {/* Timeline */}
          <div className="inc-section">
            <h3 className="inc-section-title"><Clock size={14} /> Timeline</h3>
            <div className="inc-timeline">
              {timeline.map((event, i) => {
                const EIcon = event.icon;
                return (
                  <div key={i} className="inc-timeline-item">
                    <div className="inc-tl-dot" style={{ background: event.color }}>
                      <EIcon size={11} color="#fff" />
                    </div>
                    <div className="inc-tl-content">
                      <span className="inc-tl-label">{event.label}</span>
                      <span className="inc-tl-time">{new Date(event.time).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resolution */}
          {inc.resolution && (
            <div className="inc-section">
              <h3 className="inc-section-title" style={{ color: '#10b981' }}>
                <CheckCircle2 size={14} /> Resolution
              </h3>
              <div className="inc-resolution-box">{inc.resolution}</div>
            </div>
          )}

          {/* Follow Up */}
          {inc.followUpRequired && (
            <div className="inc-section">
              <h3 className="inc-section-title" style={{ color: '#f59e0b' }}>
                <AlertTriangle size={14} /> Follow-Up Required
              </h3>
              <div className="inc-followup-box">
                {inc.followUpNotes || 'Follow-up action is required for this incident.'}
              </div>
            </div>
          )}
        </div>

        {/* Right Column — Sidebar Info */}
        <div className="inc-detail-sidebar">
          {/* Key Info */}
          <div className="inc-sidebar-card">
            <h4 className="inc-sidebar-title">Details</h4>
            <div className="inc-info-rows">
              <div className="inc-info-row">
                <MapPin size={13} />
                <div>
                  <span className="inc-info-label">Property</span>
                  <span className="inc-info-value">{inc.property?.name || '—'}</span>
                </div>
              </div>
              {inc.locationDetail && (
                <div className="inc-info-row">
                  <MapPin size={13} />
                  <div>
                    <span className="inc-info-label">Location</span>
                    <span className="inc-info-value">{inc.locationDetail}</span>
                  </div>
                </div>
              )}
              {inc.unit && (
                <div className="inc-info-row">
                  <Building2 size={13} />
                  <div>
                    <span className="inc-info-label">Unit</span>
                    <span className="inc-info-value">{inc.unit.unitNumber}</span>
                  </div>
                </div>
              )}
              <div className="inc-info-row">
                <User size={13} />
                <div>
                  <span className="inc-info-label">Reported By</span>
                  <span className="inc-info-value">{fullName(inc.reportedBy)}</span>
                </div>
              </div>
              {inc.assignedTo && (
                <div className="inc-info-row">
                  <Users2 size={13} />
                  <div>
                    <span className="inc-info-label">Assigned To</span>
                    <span className="inc-info-value">{fullName(inc.assignedTo)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Police / Tenant */}
          {(inc.policeReportNo || inc.involvesTenant) && (
            <div className="inc-sidebar-card">
              <h4 className="inc-sidebar-title">Additional Info</h4>
              <div className="inc-info-rows">
                {inc.policeReportNo && (
                  <div className="inc-info-row">
                    <Phone size={13} />
                    <div>
                      <span className="inc-info-label">Police Report No.</span>
                      <span className="inc-info-value" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {inc.policeReportNo}
                      </span>
                    </div>
                  </div>
                )}
                {inc.involvesTenant && inc.tenant && (
                  <div className="inc-info-row">
                    <User size={13} />
                    <div>
                      <span className="inc-info-label">Tenant Involved</span>
                      <span className="inc-info-value">
                        {inc.tenant.firstName} {inc.tenant.lastName}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resolve Modal */}
      {showResolve && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><CheckCircle2 size={18} /></span> Resolve Incident</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowResolve(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleResolve}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div className="form-group">
                  <label>Resolution *</label>
                  <textarea name="resolution" required rows={4}
                    placeholder="Describe how the incident was resolved..." />
                </div>
                <div className="form-group">
                  <label>Police Report No.</label>
                  <input name="policeReportNo" placeholder="RPT-2025-00123"
                    defaultValue={inc.policeReportNo || ''} />
                </div>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowResolve(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }}>
                  <CheckCircle2 size={16} /> Mark as Resolved
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {showStatusChange && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '360px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><Shield size={18} /></span> Change Status</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowStatusChange(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['open', 'investigating', 'escalated', 'closed'].filter(s => s !== inc.status).map(s => {
                  const sm = STATUS_MAP[s] || STATUS_MAP.open;
                  const SmIcon = sm.icon;
                  return (
                    <button key={s} className="inc-status-option"
                      style={{ '--st-color': sm.color, '--st-bg': sm.bg } as any}
                      onClick={() => handleStatusChange(s)}>
                      <SmIcon size={16} /> {sm.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
