import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetLeadQuery, useUpdateLeadMutation, useUpdateLeadStageMutation,
  useGetActivitiesQuery, useCreateActivityMutation,
  useGetViewingsQuery, useScheduleViewingMutation, useCompleteViewingMutation,
  useRescheduleViewingMutation,
  useDeleteLeadMutation,
  useGetCalendarStatusQuery, useDisconnectCalendarMutation,
  useBlacklistLeadMutation, useUnblacklistLeadMutation,
  type LeadViewing, type LeadActivityItem,
} from '../../../store/api/crmApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetUsersQuery } from '../../../store/api/usersApi';
import { useGetUnitTypesQuery } from '../../../store/api/unitsApi';
import { useConfirm } from '../../../components/DialogProvider';
import {
  ArrowLeft, User, Calendar, Mail, FileText, Eye, Activity,
  CheckCircle, Clock, MessageSquare, PhoneCall, Send, Target, ChevronRight,
  Edit3, Save, X, Trash2, Repeat, Search, UserPlus, AlertTriangle, RefreshCw,
  ShieldOff, Shield,
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

const SOURCES = ['website', 'walk_in', 'referral', 'agent', 'portal'];

const PRODUCT_PLAN_LABELS: Record<string, string> = {
  '100_300': '100-300 Sq.ft',
  '300_500': '300-500 Sq.ft',
  '500_700': '500-700 Sq.ft',
  '700_above': '700 Sq.ft & Above',
};

export default function LeadDetailPage() {
  const confirmDialog = useConfirm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('info');
  const [showConvert, setShowConvert] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBlacklistConfirm, setShowBlacklistConfirm] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [deleteLead, { isLoading: isDeleting }] = useDeleteLeadMutation();
  const [blacklistLead, { isLoading: isBlacklisting }] = useBlacklistLeadMutation();
  const [unblacklistLead] = useUnblacklistLeadMutation();

  const { data, isLoading } = useGetLeadQuery(id!);
  const lead = data?.data;

  const handleDelete = async () => {
    try {
      await deleteLead(id!).unwrap();
      toast.success('Lead deleted');
      navigate('/admin/crm/leads');
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to delete');
    }
  };

  const handleBlacklist = async () => {
    if (!blacklistReason.trim()) { toast.error('Please provide a reason'); return; }
    try {
      await blacklistLead({ id: id!, reason: blacklistReason.trim() }).unwrap();
      toast.success('Lead blacklisted');
      setShowBlacklistConfirm(false);
      setBlacklistReason('');
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || e?.data?.message || 'Failed to blacklist');
    }
  };

  const handleUnblacklist = async () => {
    if (!(await confirmDialog('Remove this lead from the blacklist?'))) return;
    try {
      await unblacklistLead(id!).unwrap();
      toast.success('Lead removed from blacklist');
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to unblacklist');
    }
  };

  if (isLoading) return <div className="lead-detail-page"><div className="table-loading"><div className="lp" /><div className="lp" /></div></div>;
  if (!lead) return <div className="lead-detail-page"><p>Lead not found</p></div>;

  const displayName = lead.companyName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown Lead';
  const stageMeta = STAGE_META[lead.stage] || { label: lead.stage, color: '#666' };
  const canConvert = !['new', 'contacted', 'lost', 'duplicate', 'lease_signed'].includes(lead.stage);

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
          {canConvert && !lead.isBlacklisted && (
            <button className="btn-convert" onClick={() => setShowConvert(true)}>
              <Repeat size={14} /> Convert to Lease
            </button>
          )}
          {lead.isBlacklisted ? (
            <button className="btn-sm btn-secondary" onClick={handleUnblacklist} title="Remove from blacklist">
              <Shield size={14} /> Unblacklist
            </button>
          ) : (
            <button className="btn-sm btn-blacklist" onClick={() => setShowBlacklistConfirm(true)} title="Blacklist lead">
              <ShieldOff size={14} /> Blacklist
            </button>
          )}
          <StageSelector leadId={lead.id} currentStage={lead.stage} />
          <button className="btn-ghost btn-danger-ghost" onClick={() => setShowDeleteConfirm(true)} title="Delete Lead">
            <Trash2 size={14} />
          </button>
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

      {/* Blacklisted Banner */}
      {lead.isBlacklisted && (
        <div className="blacklisted-banner">
          <ShieldOff size={16} />
          <div>
            <strong>This lead is blacklisted</strong>
            {lead.blacklistReason && <span> — {lead.blacklistReason}</span>}
            {lead.blacklistedAt && (
              <span className="bl-date"> (since {new Date(lead.blacklistedAt).toLocaleDateString()})</span>
            )}
          </div>
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
      {activeTab === 'info' && <InfoTab lead={lead} leadId={lead.id} />}
      {activeTab === 'viewings' && <ViewingsTab leadId={lead.id} />}
      {activeTab === 'activity' && <ActivityTab leadId={lead.id} />}

      {/* Convert Modal */}
      {showConvert && (
        <ConvertLeadModal
          leadId={lead.id}
          leadName={displayName}
          propertyId={lead.property?.id}
          onClose={() => setShowConvert(false)}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="crm-modal-overlay">
          <div className="crm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="delete-confirm-icon"><AlertTriangle size={28} /></div>
            <h2 style={{ textAlign: 'center' }}>Delete Lead?</h2>
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              This will permanently delete <strong>{displayName}</strong> and all associated viewings, activities, and data.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Delete Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blacklist Confirmation */}
      {showBlacklistConfirm && (
        <div className="crm-modal-overlay">
          <div className="crm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="delete-confirm-icon" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <ShieldOff size={28} color="#ef4444" />
            </div>
            <h2 style={{ textAlign: 'center' }}>Blacklist Lead?</h2>
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              <strong>{displayName}</strong> will be moved to &ldquo;Lost&rdquo; stage and flagged as blacklisted.
              Future leads with the same email will trigger a warning.
            </p>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Reason for blacklisting *</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
                placeholder="e.g. Fraudulent identity, repeated no-shows, abusive behavior..."
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => { setShowBlacklistConfirm(false); setBlacklistReason(''); }}>Cancel</button>
              <button className="btn-danger" onClick={handleBlacklist} disabled={isBlacklisting || !blacklistReason.trim()}>
                {isBlacklisting ? 'Blacklisting…' : 'Blacklist Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stage Selector ─────────────────────────────

function StageSelector({ leadId, currentStage }: { leadId: string; currentStage: string }) {
  const [updateStage, { isLoading }] = useUpdateLeadStageMutation();
  const [reason, setReason] = useState('');
  const [showLost, setShowLost] = useState(false);

  // Lease Signed is terminal — the lead is already converted, so there's no other stage to move to.
  if (currentStage === 'lease_signed') return null;

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
        <div className="crm-modal-overlay">
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

// ── Info Tab (Editable) ────────────────────────

function InfoTab({ lead, leadId }: { lead: any; leadId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateLead, { isLoading: isSaving }] = useUpdateLeadMutation();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: usersData } = useGetUsersQuery({ page: 1, limit: 200 });
  const { data: unitTypesData } = useGetUnitTypesQuery();
  const properties = propertiesData?.data || [];
  const users = usersData?.data || [];
  const unitTypes = unitTypesData?.data || [];

  const initForm = () => ({
    lastName: lead.lastName || '',
    email: (lead.email || '').toLowerCase(),
    phone: lead.phone || '',
    address: lead.loiDetails?.address || '',
    unitTypePreference: lead.unitTypePreference || '',
    budgetMin: lead.budgetMin ? Number(lead.budgetMin) : '',
    budgetMax: lead.budgetMax ? Number(lead.budgetMax) : '',
    leaseTermMonths: lead.leaseTermMonths ?? '',
    applicantDate: lead.loiDetails?.applicantDate ? lead.loiDetails.applicantDate.substring(0, 10) : '',
    shopName: lead.loiDetails?.shopName || '',
    businessType: lead.loiDetails?.businessType || '',
    doorType: lead.loiDetails?.doorType || '',
    productPlan: lead.loiDetails?.productPlan || '',
    ceiling: lead.loiDetails?.ceiling || '',
    currentShop: lead.loiDetails?.currentShop || '',
    priority: lead.priority || 'medium',
    source: lead.source || '',
    propertyId: lead.property?.id || '',
    assignedTo: lead.agent?.id || '',
    notes: lead.notes || '',
  });

  const [form, setForm] = useState(initForm);

  // Reset form when lead data changes
  useEffect(() => {
    setForm(initForm());
  }, [lead]);

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    const MAX_BUDGET = 9999999999999.99;
    if ((form.budgetMin !== '' && Number(form.budgetMin) > MAX_BUDGET) || (form.budgetMax !== '' && Number(form.budgetMax) > MAX_BUDGET)) {
      toast.error('Budget exceeds maximum allowed value');
      return;
    }
    try {
      const payload: Record<string, unknown> = {};
      if (form.lastName !== (lead.lastName || ''))     payload.lastName = form.lastName || null;
      const normalizedEmail = form.email.trim().toLowerCase();
      if (normalizedEmail !== (lead.email || '').toLowerCase()) payload.email = normalizedEmail || null;
      if (form.phone !== (lead.phone || ''))            payload.phone = form.phone || null;
      if (form.unitTypePreference !== (lead.unitTypePreference || '')) payload.unitTypePreference = form.unitTypePreference || null;

      const loiDetails: Record<string, unknown> = {};
      [['address', form.address], ['applicantDate', form.applicantDate], ['shopName', form.shopName],
       ['businessType', form.businessType], ['doorType', form.doorType], ['productPlan', form.productPlan],
       ['ceiling', form.ceiling], ['currentShop', form.currentShop]].forEach(([key, value]) => {
        if (value !== '') loiDetails[key as string] = value;
      });
      if (JSON.stringify(loiDetails) !== JSON.stringify(lead.loiDetails || {})) payload.loiDetails = loiDetails;

      const bMin = form.budgetMin === '' ? null : Number(form.budgetMin);
      const bMax = form.budgetMax === '' ? null : Number(form.budgetMax);
      if (bMin !== (lead.budgetMin ? Number(lead.budgetMin) : null)) payload.budgetMin = bMin;
      if (bMax !== (lead.budgetMax ? Number(lead.budgetMax) : null)) payload.budgetMax = bMax;

      const lTerm = form.leaseTermMonths === '' ? null : Number(form.leaseTermMonths);
      if (lTerm !== lead.leaseTermMonths) payload.leaseTermMonths = lTerm;

      if (form.priority !== lead.priority) payload.priority = form.priority;
      if (form.source !== (lead.source || '')) payload.source = form.source || null;
      if (form.propertyId !== (lead.property?.id || '')) payload.propertyId = form.propertyId || null;
      if (form.assignedTo !== (lead.agent?.id || '')) payload.assignedTo = form.assignedTo || null;
      if (form.notes !== (lead.notes || '')) payload.notes = form.notes || null;

      if (Object.keys(payload).length === 0) {
        setIsEditing(false);
        return;
      }

      await updateLead({ id: leadId, data: payload }).unwrap();
      toast.success('Lead updated');
      setIsEditing(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to save');
    }
  };

  const handleCancel = () => {
    setForm(initForm());
    setIsEditing(false);
  };

  // ─── Read-only View ───
  if (!isEditing) {
    return (
      <div>
        <div className="info-tab-header">
          <button className="btn-edit" onClick={() => setIsEditing(true)}>
            <Edit3 size={14} /> Edit Lead
          </button>
        </div>
        <div className="lead-info-grid">
          <div className="lead-info-section">
            <h3>Contact Information</h3>
            <div className="info-row"><span className="info-label">Name</span><span className="info-value">{lead.lastName || '—'}</span></div>
            <div className="info-row"><span className="info-label">Email</span><span className="info-value">{lead.email?.toLowerCase() || '—'}</span></div>
            <div className="info-row"><span className="info-label">Phone</span><span className="info-value">{lead.phone || '—'}</span></div>
            <div className="info-row"><span className="info-label">Address</span><span className="info-value">{lead.loiDetails?.address || '—'}</span></div>
          </div>
          <div className="lead-info-section">
            <h3>Requirements</h3>
            <div className="info-row"><span className="info-label">Unit Type</span><span className="info-value">{unitTypes.find((t) => t.code === lead.unitTypePreference)?.name || lead.unitTypePreference || '—'}</span></div>
            <div className="info-row"><span className="info-label">Budget</span><span className="info-value">{lead.budgetMin || lead.budgetMax ? `${Number(lead.budgetMin || 0).toLocaleString()} – ${Number(lead.budgetMax || 0).toLocaleString()}` : '—'}</span></div>
            <div className="info-row"><span className="info-label">Area (Sqft)</span><span className="info-value">{PRODUCT_PLAN_LABELS[lead.loiDetails?.productPlan] || '—'}</span></div>
            <div className="info-row"><span className="info-label">Lease Term</span><span className="info-value">{lead.leaseTermMonths ? `${lead.leaseTermMonths} months` : '—'}</span></div>
            <div className="info-row"><span className="info-label">Applicant Date</span><span className="info-value">{lead.loiDetails?.applicantDate ? new Date(lead.loiDetails.applicantDate).toLocaleDateString() : '—'}</span></div>
            <div className="info-row"><span className="info-label">Shop Name</span><span className="info-value">{lead.loiDetails?.shopName || '—'}</span></div>
            <div className="info-row"><span className="info-label">Business Type</span><span className="info-value">{lead.loiDetails?.businessType?.replace(/_/g, ' ') || '—'}</span></div>
            <div className="info-row"><span className="info-label">Door Type</span><span className="info-value">{lead.loiDetails?.doorType?.replace(/_/g, ' ') || '—'}</span></div>
            <div className="info-row"><span className="info-label">Product Plan</span><span className="info-value">{PRODUCT_PLAN_LABELS[lead.loiDetails?.productPlan] || '—'}</span></div>
            <div className="info-row"><span className="info-label">Ceiling</span><span className="info-value">{lead.loiDetails?.ceiling ? lead.loiDetails.ceiling.charAt(0).toUpperCase() + lead.loiDetails.ceiling.slice(1) : '—'}</span></div>
            <div className="info-row"><span className="info-label">Current Shop</span><span className="info-value">{lead.loiDetails?.currentShop ? lead.loiDetails.currentShop.charAt(0).toUpperCase() + lead.loiDetails.currentShop.slice(1) : '—'}</span></div>
          </div>
          <div className="lead-info-section">
            <h3>Pipeline Details</h3>
            <div className="info-row"><span className="info-label">Source</span><span className="info-value">{lead.source?.replace(/_/g, ' ') || '—'}</span></div>
            <div className="info-row"><span className="info-label">Priority</span><span className="info-value"><span className={`priority-chip ${lead.priority}`}>{lead.priority}</span></span></div>
            <div className="info-row"><span className="info-label">Property</span><span className="info-value">{lead.property?.name || '—'}</span></div>
            <div className="info-row"><span className="info-label">Lease Number</span><span className="info-value">{lead.convertedLease?.leaseNumber || '—'}</span></div>
            <div className="info-row"><span className="info-label">Assigned To</span><span className="info-value">{lead.agent?.profile ? `${lead.agent.profile.firstName} ${lead.agent.profile.lastName}` : lead.agent?.email || '—'}</span></div>
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
      </div>
    );
  }

  // ─── Edit View ───
  return (
    <div>
      <div className="info-tab-header">
        <div className="edit-actions">
          <button className="btn-secondary" onClick={handleCancel} disabled={isSaving}>
            <X size={14} /> Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
            <Save size={14} /> {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
      <div className="lead-edit-grid">
        {/* Contact Information */}
        <div className="lead-edit-section">
          <h3><User size={14} /> Contact Information</h3>
          <div className="form-group">
            <label>Name</label>
            <input className="form-input" value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Name" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value.toLowerCase())} placeholder="email@example.com"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ textTransform: 'lowercase' }} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input className="form-input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value.replace(/\D/g, ''))} placeholder="6591234567" />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St" />
          </div>
        </div>

        {/* Requirements */}
        <div className="lead-edit-section">
          <h3><FileText size={14} /> Requirements</h3>
          <div className="form-group">
            <label>Unit Type Preference</label>
            <select className="form-input" value={form.unitTypePreference} onChange={e => set('unitTypePreference', e.target.value)}>
              <option value="">Select…</option>
              {[...unitTypes].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
            </select>
          </div>
          <div className="edit-form-row">
            <div className="form-group">
              <label>Budget Min</label>
              <input className="form-input" type="number" value={form.budgetMin} onChange={e => set('budgetMin', e.target.value)} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Budget Max</label>
              <input className="form-input" type="number" value={form.budgetMax} onChange={e => set('budgetMax', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="form-group">
            <label>Lease Term</label>
            <input className="form-input" type="number" min="1" max="120" value={form.leaseTermMonths} onChange={e => set('leaseTermMonths', e.target.value)} placeholder="e.g. 12 months" />
          </div>
          <div className="edit-form-row">
            <div className="form-group">
              <label>Applicant Date</label>
              <input className="form-input" type="date" value={form.applicantDate} onChange={e => set('applicantDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Shop Name</label>
              <input className="form-input" value={form.shopName} onChange={e => set('shopName', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Business Type</label>
            <select className="form-input" value={form.businessType} onChange={e => set('businessType', e.target.value)}>
              <option value="">Select…</option>
              <option value="private">Private</option>
              <option value="share">Share</option>
              <option value="company">Company</option>
            </select>
          </div>
          <div className="form-group">
            <label>Door Type</label>
            <select className="form-input" value={form.doorType} onChange={e => set('doorType', e.target.value)}>
              <option value="">Select…</option>
              <option value="glass_door">Glass Door</option>
              <option value="other">Other</option>
              <option value="roller_shutter">Roller Shutter</option>
            </select>
          </div>
          <div className="form-group">
            <label>Product Plan</label>
            <select className="form-input" value={form.productPlan} onChange={e => set('productPlan', e.target.value)}>
              <option value="">Select…</option>
              <option value="100_300">100-300 Sq.ft</option>
              <option value="300_500">300-500 Sq.ft</option>
              <option value="500_700">500-700 Sq.ft</option>
              <option value="700_above">700 Sq.ft & Above</option>
            </select>
          </div>
        </div>

        {/* Pipeline Details */}
        <div className="lead-edit-section">
          <h3><Target size={14} /> Pipeline Details</h3>
          <div className="edit-form-row">
            <div className="form-group">
              <label>Priority</label>
              <select className="form-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="form-group">
              <label>Source</label>
              <select className="form-input" value={form.source} onChange={e => set('source', e.target.value)}>
                <option value="">— None —</option>
                {SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Property</label>
            <select className="form-input" value={form.propertyId} onChange={e => set('propertyId', e.target.value)}>
              <option value="">— None —</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Assigned To</label>
            <select className="form-input" value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)}>
              <option value="">— Auto-assign —</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : u.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="lead-edit-section" style={{ gridColumn: '1 / -1' }}>
          <h3><MessageSquare size={14} /> Notes</h3>
          <textarea className="form-input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this lead…" rows={4} style={{ width: '100%', resize: 'vertical' }} />
        </div>
      </div>
    </div>
  );
}

// ── Convert Lead Modal ─────────────────────────

function ConvertLeadModal({ leadId, leadName, propertyId, onClose }: { leadId: string; leadName: string; propertyId?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [tenantSearch, setTenantSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');

  // Only KYC-verified, non-blacklisted tenants can be put on a lease.
  const { data: tenantsData, isFetching: isFetchingTenants } = useGetTenantsQuery(
    { search: tenantSearch || undefined, kycStatus: 'verified', isBlacklisted: false, page: 1, limit: 20 },
    { skip: false }
  );
  const tenants = tenantsData?.data || [];

  const selectedTenant = tenants.find((t: any) => t.id === selectedTenantId);

  const handleConvert = () => {
    if (!selectedTenantId) {
      toast.error('Please select a tenant');
      return;
    }
    const params = new URLSearchParams({ leadId, tenantId: selectedTenantId });
    if (propertyId) params.set('propertyId', propertyId);
    onClose();
    navigate(`/admin/leases/new?${params.toString()}`);
  };

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal convert-modal" onClick={e => e.stopPropagation()}>
        <button className="crm-modal-close" onClick={onClose}><X size={16} /></button>
        {/* Header */}
        <div className="convert-modal-header">
          <h2>Convert Lead to Lease</h2>
        </div>

        <div className="convert-step-content">
          <div className="search-box-wrap">
            <Search size={14} />
            <input
              value={tenantSearch}
              onChange={e => setTenantSearch(e.target.value)}
              placeholder="Search tenants by name, email, company…"
              autoFocus
            />
          </div>
          <div className="convert-list">
            {isFetchingTenants ? (
              <div className="convert-list-empty">Searching…</div>
            ) : tenants.length === 0 ? (
              <div className="convert-list-empty">
                <UserPlus size={24} />
                <span>No KYC-verified tenants found.</span>
              </div>
            ) : (
              tenants.map((t: any) => {
                const name = t.displayName || t.companyName || `${t.firstName || ''} ${t.lastName || ''}`.trim();
                return (
                  <div
                    key={t.id}
                    className={`convert-list-item ${selectedTenantId === t.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTenantId(t.id)}
                  >
                    <div className="cli-avatar">
                      {t.avatarUrl ? (
                        <img src={t.avatarUrl} alt="" />
                      ) : (
                        <span>{(name[0] || '?').toUpperCase()}</span>
                      )}
                    </div>
                    <div className="cli-info">
                      <div className="cli-name">{name}</div>
                      <div className="cli-meta">
                        {t.email && <span><Mail size={10} /> {t.email}</span>}
                        <span className={`cli-type ${t.tenantType}`}>{t.tenantType}</span>
                        <span className="cli-kyc-verified"><CheckCircle size={10} /> KYC Verified</span>
                        {t.activeLeases > 0 && <span>{t.activeLeases} active lease{t.activeLeases > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    {selectedTenantId === t.id && <CheckCircle size={16} className="cli-check" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Summary */}
          {selectedTenantId && selectedTenant && (
            <div className="convert-summary">
              <div className="convert-summary-title">Conversion Summary</div>
              <div className="convert-summary-row">
                <span>Lead</span><span>{leadName}</span>
              </div>
              <div className="convert-summary-row">
                <span>Tenant</span><span>{(selectedTenant as any)?.displayName}</span>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-convert-confirm"
              disabled={!selectedTenantId}
              onClick={handleConvert}
            >
              <CheckCircle size={14} />
              Convert Lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Viewings Tab ───────────────────────────────

function ViewingsTab({ leadId }: { leadId: string }) {
  const confirmDialog = useConfirm();
  const { data } = useGetViewingsQuery(leadId);
  const [scheduleViewing] = useScheduleViewingMutation();
  const [completeViewing] = useCompleteViewingMutation();
  const [rescheduleViewing] = useRescheduleViewingMutation();
  const { data: calendarStatus } = useGetCalendarStatusQuery();
  const [disconnectCalendar] = useDisconnectCalendarMutation();
  const [showSchedule, setShowSchedule] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<LeadViewing | null>(null);
  const viewings = data?.data || [];
  const calendarConnected = calendarStatus?.data?.connected;
  const calendarConfigured = calendarStatus?.data?.configured;

  const handleSchedule = async (formData: Record<string, unknown>) => {
    try {
      await scheduleViewing({ leadId, data: formData }).unwrap();
      toast.success('Viewing scheduled');
      setShowSchedule(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to schedule');
    }
  };

  const handleReschedule = async (viewingId: string, formData: Record<string, unknown>) => {
    try {
      await rescheduleViewing({ leadId, viewingId, data: formData }).unwrap();
      toast.success('Viewing rescheduled');
      setRescheduleTarget(null);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to reschedule');
    }
  };

  const handleComplete = async (viewingId: string, outcome: string) => {
    try {
      await completeViewing({ leadId, viewingId, data: { outcome } }).unwrap();
      toast.success('Viewing completed');
    } catch { toast.error('Failed'); }
  };

  const handleCancel = async (viewing: LeadViewing) => {
    if (!(await confirmDialog(`Cancel viewing on ${new Date(viewing.scheduledAt).toLocaleString()}?`, { danger: true, confirmText: 'Cancel Viewing' }))) return;
    try {
      await rescheduleViewing({ leadId, viewingId: viewing.id, data: { status: 'cancelled' } }).unwrap();
      toast.success('Viewing cancelled');
    } catch { toast.error('Failed to cancel'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Viewings ({viewings.length})</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {calendarConfigured && (
            calendarConnected ? (
              <span className="gcal-badge gcal-connected" title="Google Calendar synced">
                <Calendar size={11} /> Calendar Synced
              </span>
            ) : (
              <a
                className="gcal-badge gcal-connect"
                href={`${import.meta.env.VITE_API_URL || ''}/api/v1/crm/google-calendar/auth-url`}
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    const resp = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/crm/google-calendar/auth-url`, {
                      headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}` },
                    });
                    const json = await resp.json();
                    if (json?.data?.url) window.open(json.data.url, '_blank', 'width=500,height=700');
                  } catch { toast.error('Failed to get auth URL'); }
                }}
                title="Connect Google Calendar"
              >
                <Calendar size={11} /> Connect Calendar
              </a>
            )
          )}
          <button className="btn-primary" onClick={() => setShowSchedule(true)}><Calendar size={14} /> Schedule Viewing</button>
        </div>
      </div>
      {viewings.length === 0 ? (
        <div className="table-empty" style={{ padding: 40 }}><Eye size={40} /><p>No viewings scheduled</p></div>
      ) : (
        viewings.map((v: LeadViewing) => (
          <div key={v.id} className={`viewing-card ${v.status === 'cancelled' ? 'vc-cancelled' : ''}`}>
            <div className="vc-header">
              <span className="vc-date">
                <Calendar size={12} style={{ marginRight: 6 }} />
                {new Date(v.scheduledAt).toLocaleString()}
              </span>
              <span className={`vc-status-badge vc-status-${v.status}`}>
                {v.status === 'scheduled' && <Clock size={10} />}
                {v.status === 'completed' && <CheckCircle size={10} />}
                {v.status === 'no_show' && <X size={10} />}
                {v.status}
              </span>
              {v.calendarEventId && (
                <span className="vc-gcal-badge" title="Synced to Google Calendar">📅 Synced</span>
              )}
            </div>
            <div className="vc-detail">
              {v.unit && <span>🏢 Unit {v.unit.unitNumber}</span>}
              <span>⏱ {v.durationMinutes} min</span>
              {v.agent && <span>👤 {v.agent.profile ? `${v.agent.profile.firstName} ${v.agent.profile.lastName}` : v.agent.email}</span>}
              {v.outcome && <span className={`vc-outcome vc-outcome-${v.outcome}`}>{v.outcome.replace(/_/g, ' ')}</span>}
            </div>
            {v.agentNotes && <div className="vc-notes">{v.agentNotes}</div>}
            {v.status === 'scheduled' && (
              <div className="vc-actions">
                <div className="vc-outcome-group">
                  <span className="vc-action-label">Mark as:</span>
                  <button className="btn-sm btn-primary" onClick={() => handleComplete(v.id, 'interested')}>
                    <CheckCircle size={12} /> Interested
                  </button>
                  <button className="btn-sm btn-secondary" onClick={() => handleComplete(v.id, 'not_interested')}>
                    <X size={12} /> Not Interested
                  </button>
                  <button className="btn-sm btn-ghost" onClick={() => handleComplete(v.id, 'undecided')}>
                    ? Undecided
                  </button>
                </div>
                <div className="vc-manage-group">
                  <button className="btn-sm btn-reschedule" onClick={() => setRescheduleTarget(v)} title="Reschedule">
                    <RefreshCw size={12} /> Reschedule
                  </button>
                  <button className="btn-sm btn-cancel-viewing" onClick={() => handleCancel(v)} title="Cancel viewing">
                    <Trash2 size={12} /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
      {showSchedule && (
        <ScheduleViewingModal onClose={() => setShowSchedule(false)} onSubmit={handleSchedule} />
      )}
      {rescheduleTarget && (
        <RescheduleViewingModal
          viewing={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSubmit={(data) => handleReschedule(rescheduleTarget.id, data)}
        />
      )}
    </div>
  );
}

function ScheduleViewingModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: Record<string, unknown>) => void }) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="viewing-modal-header">
          <div className="viewing-modal-icon"><Calendar size={20} /></div>
          <h2>Schedule Viewing</h2>
        </div>
        <div className="form-group">
          <label>Date & Time *</label>
          <input className="form-input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label>Duration (minutes)</label>
          <input className="form-input" type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} min="15" max="240" />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}><X size={14} /> Cancel</button>
          <button className="btn-primary" disabled={!scheduledAt} onClick={() => onSubmit({ scheduledAt: new Date(scheduledAt).toISOString(), durationMinutes: Number(durationMinutes) })}>
            <Calendar size={14} /> Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleViewingModal({ viewing, onClose, onSubmit }: {
  viewing: LeadViewing;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  // Pre-fill with the current viewing's date/time
  const currentDate = new Date(viewing.scheduledAt);
  const formattedDate = currentDate.toISOString().slice(0, 16);
  const [scheduledAt, setScheduledAt] = useState(formattedDate);
  const [durationMinutes, setDurationMinutes] = useState(viewing.durationMinutes.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const data: Record<string, unknown> = {};
    const newDate = new Date(scheduledAt).toISOString();
    if (newDate !== viewing.scheduledAt) data.scheduledAt = newDate;
    const newDuration = Number(durationMinutes);
    if (newDuration !== viewing.durationMinutes) data.durationMinutes = newDuration;
    if (Object.keys(data).length === 0) { onClose(); return; }
    await onSubmit(data);
    setIsSubmitting(false);
  };

  const hasChanges = scheduledAt !== formattedDate || Number(durationMinutes) !== viewing.durationMinutes;

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal reschedule-modal" onClick={e => e.stopPropagation()}>
        <div className="viewing-modal-header">
          <div className="viewing-modal-icon reschedule-icon"><RefreshCw size={20} /></div>
          <h2>Reschedule Viewing</h2>
        </div>

        {/* Current viewing info */}
        <div className="reschedule-current">
          <div className="rc-label">Current Schedule</div>
          <div className="rc-value">
            <Calendar size={13} />
            {currentDate.toLocaleString()}
            <span className="rc-duration">({viewing.durationMinutes} min)</span>
          </div>
          {viewing.unit && <div className="rc-unit">Unit {viewing.unit.unitNumber}</div>}
          {viewing.agent && (
            <div className="rc-agent">
              👤 {viewing.agent.profile ? `${viewing.agent.profile.firstName} ${viewing.agent.profile.lastName}` : viewing.agent.email}
            </div>
          )}
        </div>

        {/* New date/time */}
        <div className="form-group">
          <label>New Date & Time *</label>
          <input className="form-input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label>Duration (minutes)</label>
          <input className="form-input" type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min="15" max="240" />
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}><X size={14} /> Cancel</button>
          <button className="btn-primary" disabled={isSubmitting || !scheduledAt || !hasChanges} onClick={handleSubmit}>
            <RefreshCw size={14} /> {isSubmitting ? 'Rescheduling…' : 'Reschedule'}
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
