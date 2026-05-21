import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetLeadQuery, useUpdateLeadMutation, useUpdateLeadStageMutation,
  useGetActivitiesQuery, useCreateActivityMutation,
  useGetViewingsQuery, useScheduleViewingMutation, useCompleteViewingMutation,
  useConvertLeadMutation,
  type LeadViewing, type LeadActivityItem,
} from '../../../store/api/crmApi';
import {
  ArrowLeft, User, Calendar, Phone, Mail, MapPin, FileText, Eye, Activity,
  CheckCircle, Clock, MessageSquare, PhoneCall, Send, Target, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './CRMPage.css';

const STAGE_META: Record<string, { label: string; color: string }> = {
  new:                { label: 'New',               color: '#3b82f6' },
  contacted:          { label: 'Contacted',         color: '#8b5cf6' },
  viewing_scheduled:  { label: 'Viewing Scheduled', color: '#f59e0b' },
  viewed:             { label: 'Viewed',            color: '#06b6d4' },
  offer_sent:         { label: 'Offer Sent',        color: '#ec4899' },
  negotiating:        { label: 'Negotiating',       color: '#f97316' },
  lease_signed:       { label: 'Lease Signed',      color: '#10b981' },
  lost:               { label: 'Lost',              color: '#ef4444' },
  duplicate:          { label: 'Duplicate',         color: '#9ca3af' },
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('info');

  const { data, isLoading } = useGetLeadQuery(id!);
  const lead = data?.data;

  if (isLoading) return <div className="lead-detail-page"><div className="table-loading"><div className="lp" /><div className="lp" /></div></div>;
  if (!lead) return <div className="lead-detail-page"><p>Lead not found</p></div>;

  const displayName = lead.companyName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown Lead';
  const stageMeta = STAGE_META[lead.stage] || { label: lead.stage, color: '#666' };

  return (
    <div className="lead-detail-page">
      {/* Header */}
      <div className="lead-detail-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate('/admin/crm/leads')} style={{ marginBottom: 8 }}>
            <ArrowLeft size={14} /> Back to Pipeline
          </button>
          <div className="lead-name">{displayName}</div>
          <div className="lead-meta">
            {lead.leadNumber && <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{lead.leadNumber}</span>}
            <span className="stage-badge" style={{ background: stageMeta.color + '18', color: stageMeta.color, border: `1px solid ${stageMeta.color}40` }}>
              {stageMeta.label}
            </span>
            <span className={`priority-chip ${lead.priority}`}>{lead.priority}</span>
          </div>
        </div>
        <div className="lead-header-actions">
          <StageSelector leadId={lead.id} currentStage={lead.stage} />
        </div>
      </div>

      {/* Converted Banner */}
      {lead.stage === 'lease_signed' && lead.convertedLease && (
        <div className="converted-banner">
          <CheckCircle size={16} />
          Converted — Lease {lead.convertedLease.leaseNumber}
          <button className="btn-ghost" onClick={() => navigate(`/admin/leases/${lead.convertedLease!.id}`)}>
            View Lease <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="lead-tabs">
        <button className={`lead-tab ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
          <User size={14} /> Info
        </button>
        <button className={`lead-tab ${activeTab === 'viewings' ? 'active' : ''}`} onClick={() => setActiveTab('viewings')}>
          <Eye size={14} /> Viewings
        </button>
        <button className={`lead-tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
          <Activity size={14} /> Activity
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && <InfoTab lead={lead} />}
      {activeTab === 'viewings' && <ViewingsTab leadId={lead.id} />}
      {activeTab === 'activity' && <ActivityTab leadId={lead.id} />}
    </div>
  );
}

// ── Stage Selector ─────────────────────────────

function StageSelector({ leadId, currentStage }: { leadId: string; currentStage: string }) {
  const [updateStage, { isLoading }] = useUpdateLeadStageMutation();
  const [reason, setReason] = useState('');
  const [showLost, setShowLost] = useState(false);

  const handleChange = async (stage: string) => {
    if (stage === 'lost') { setShowLost(true); return; }
    try {
      await updateStage({ id: leadId, stage }).unwrap();
      toast.success(`Stage updated to ${stage}`);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Cannot change stage');
    }
  };

  const handleLost = async () => {
    try {
      await updateStage({ id: leadId, stage: 'lost', reason }).unwrap();
      toast.success('Lead marked as lost');
      setShowLost(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <>
      <select className="filter-select" value="" onChange={(e) => handleChange(e.target.value)} disabled={isLoading}>
        <option value="" disabled>Move to stage…</option>
        {Object.entries(STAGE_META).filter(([k]) => k !== currentStage).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>
      {showLost && (
        <div className="crm-modal-overlay" onClick={() => setShowLost(false)}>
          <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Mark as Lost</h2>
            <div className="form-group">
              <label>Reason</label>
              <textarea className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why was this lead lost?" rows={3} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowLost(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleLost}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Info Tab ────────────────────────────────────

function InfoTab({ lead }: { lead: any }) {
  return (
    <div className="lead-info-grid">
      <div className="lead-info-section">
        <h3>Contact Information</h3>
        <div className="info-row"><span className="info-label">First Name</span><span className="info-value">{lead.firstName || '—'}</span></div>
        <div className="info-row"><span className="info-label">Last Name</span><span className="info-value">{lead.lastName || '—'}</span></div>
        <div className="info-row"><span className="info-label">Company</span><span className="info-value">{lead.companyName || '—'}</span></div>
        <div className="info-row"><span className="info-label">Email</span><span className="info-value">{lead.email || '—'}</span></div>
        <div className="info-row"><span className="info-label">Phone</span><span className="info-value">{lead.phone || '—'}</span></div>
        <div className="info-row"><span className="info-label">Mobile</span><span className="info-value">{lead.mobile || '—'}</span></div>
      </div>
      <div className="lead-info-section">
        <h3>Requirements</h3>
        <div className="info-row"><span className="info-label">Unit Type</span><span className="info-value">{lead.unitTypePreference || '—'}</span></div>
        <div className="info-row"><span className="info-label">Budget</span><span className="info-value">{lead.budgetMin || lead.budgetMax ? `${Number(lead.budgetMin || 0).toLocaleString()} – ${Number(lead.budgetMax || 0).toLocaleString()}` : '—'}</span></div>
        <div className="info-row"><span className="info-label">Area (sqft)</span><span className="info-value">{lead.minAreaSqft || lead.maxAreaSqft ? `${lead.minAreaSqft || '—'} – ${lead.maxAreaSqft || '—'}` : '—'}</span></div>
        <div className="info-row"><span className="info-label">Move-in Date</span><span className="info-value">{lead.moveInDate ? new Date(lead.moveInDate).toLocaleDateString() : '—'}</span></div>
        <div className="info-row"><span className="info-label">Lease Term</span><span className="info-value">{lead.leaseTermMonths ? `${lead.leaseTermMonths} months` : '—'}</span></div>
      </div>
      <div className="lead-info-section">
        <h3>Pipeline Details</h3>
        <div className="info-row"><span className="info-label">Source</span><span className="info-value">{lead.source?.replace(/_/g, ' ') || '—'}</span></div>
        <div className="info-row"><span className="info-label">Property</span><span className="info-value">{lead.property?.name || '—'}</span></div>
        <div className="info-row"><span className="info-label">Assigned To</span><span className="info-value">{lead.agent?.profile ? `${lead.agent.profile.firstName} ${lead.agent.profile.lastName}` : lead.agent?.email || '—'}</span></div>
        <div className="info-row"><span className="info-label">Campaign</span><span className="info-value">{lead.campaign?.name || '—'}</span></div>
        <div className="info-row"><span className="info-label">Created</span><span className="info-value">{new Date(lead.createdAt).toLocaleString()}</span></div>
        {lead.lostReason && <div className="info-row"><span className="info-label">Lost Reason</span><span className="info-value">{lead.lostReason}</span></div>}
      </div>
      {lead.notes && (
        <div className="lead-info-section" style={{ gridColumn: '1 / -1' }}>
          <h3>Notes</h3>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lead.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Viewings Tab ───────────────────────────────

function ViewingsTab({ leadId }: { leadId: string }) {
  const { data } = useGetViewingsQuery(leadId);
  const [scheduleViewing] = useScheduleViewingMutation();
  const [completeViewing] = useCompleteViewingMutation();
  const [showSchedule, setShowSchedule] = useState(false);
  const viewings = data?.data || [];

  const handleSchedule = async (formData: Record<string, unknown>) => {
    try {
      await scheduleViewing({ leadId, data: formData }).unwrap();
      toast.success('Viewing scheduled');
      setShowSchedule(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to schedule');
    }
  };

  const handleComplete = async (viewingId: string, outcome: string) => {
    try {
      await completeViewing({ leadId, viewingId, data: { outcome } }).unwrap();
      toast.success('Viewing completed');
    } catch { toast.error('Failed'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Viewings ({viewings.length})</h3>
        <button className="btn-primary" onClick={() => setShowSchedule(true)}><Calendar size={14} /> Schedule Viewing</button>
      </div>
      {viewings.length === 0 ? (
        <div className="table-empty" style={{ padding: 40 }}><Eye size={40} /><p>No viewings scheduled</p></div>
      ) : (
        viewings.map((v: LeadViewing) => (
          <div key={v.id} className="viewing-card">
            <div className="vc-header">
              <span className="vc-date">{new Date(v.scheduledAt).toLocaleString()}</span>
              <span className="status-pill" style={{ color: v.status === 'completed' ? '#10b981' : v.status === 'cancelled' ? '#ef4444' : '#f59e0b', background: v.status === 'completed' ? '#10b98118' : v.status === 'cancelled' ? '#ef444418' : '#f59e0b18', borderColor: 'transparent', fontSize: 11, padding: '2px 10px' }}>
                {v.status}
              </span>
            </div>
            <div className="vc-detail">
              {v.unit && <span>Unit: {v.unit.unitNumber}</span>}
              <span>Duration: {v.durationMinutes}min</span>
              {v.agent && <span>Agent: {v.agent.profile ? `${v.agent.profile.firstName} ${v.agent.profile.lastName}` : v.agent.email}</span>}
              {v.outcome && <span>Outcome: {v.outcome}</span>}
            </div>
            {v.agentNotes && <div className="vc-notes">{v.agentNotes}</div>}
            {v.status === 'scheduled' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-sm btn-primary" onClick={() => handleComplete(v.id, 'interested')}>✓ Interested</button>
                <button className="btn-sm btn-secondary" onClick={() => handleComplete(v.id, 'not_interested')}>✗ Not Interested</button>
                <button className="btn-sm btn-ghost" onClick={() => handleComplete(v.id, 'undecided')}>? Undecided</button>
              </div>
            )}
          </div>
        ))
      )}
      {showSchedule && (
        <ScheduleViewingModal onClose={() => setShowSchedule(false)} onSubmit={handleSchedule} />
      )}
    </div>
  );
}

function ScheduleViewingModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: Record<string, unknown>) => void }) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Schedule Viewing</h2>
        <div className="form-group">
          <label>Date & Time *</label>
          <input className="form-input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Duration (minutes)</label>
          <input className="form-input" type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!scheduledAt} onClick={() => onSubmit({ scheduledAt: new Date(scheduledAt).toISOString(), durationMinutes: Number(durationMinutes) })}>
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Activity Tab ───────────────────────────────

function ActivityTab({ leadId }: { leadId: string }) {
  const { data } = useGetActivitiesQuery(leadId);
  const [createActivity] = useCreateActivityMutation();
  const [actType, setActType] = useState('note');
  const [desc, setDesc] = useState('');

  const activities = data?.data || [];

  const handleAdd = async () => {
    if (!desc.trim()) return;
    try {
      await createActivity({ leadId, data: { activityType: actType, description: desc } }).unwrap();
      setDesc('');
      toast.success('Activity logged');
    } catch { toast.error('Failed'); }
  };

  const typeIcon = (t: string) => {
    switch (t) {
      case 'call': return <PhoneCall size={12} />;
      case 'email': return <Send size={12} />;
      case 'viewing': return <Eye size={12} />;
      case 'stage_change': return <Target size={12} />;
      default: return <MessageSquare size={12} />;
    }
  };

  return (
    <div>
      {/* Add Activity */}
      <div className="add-activity-form">
        <div className="form-row">
          <select className="form-input" value={actType} onChange={(e) => setActType(e.target.value)} style={{ maxWidth: 140 }}>
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
          <textarea className="form-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Log an activity…" rows={2} style={{ flex: 1 }} />
          <button className="btn-primary" onClick={handleAdd} disabled={!desc.trim()} style={{ alignSelf: 'flex-end' }}>Add</button>
        </div>
      </div>

      {/* Timeline */}
      <div className="activity-timeline">
        {activities.map((act: LeadActivityItem) => (
          <div key={act.id} className={`activity-item type-${act.activityType}`}>
            <div className="act-header">
              <span className="act-type">{typeIcon(act.activityType)} {act.activityType.replace(/_/g, ' ')}</span>
              <span className="act-time">{new Date(act.createdAt).toLocaleString()}</span>
            </div>
            <div className="act-desc">{act.description}</div>
            {act.performer && (
              <div className="act-performer">
                by {act.performer.profile ? `${act.performer.profile.firstName} ${act.performer.profile.lastName}` : act.performer.email}
              </div>
            )}
          </div>
        ))}
        {activities.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No activity yet</div>
        )}
      </div>
    </div>
  );
}
