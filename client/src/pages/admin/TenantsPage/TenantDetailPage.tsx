import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetTenantQuery, useUpdateTenantMutation, useBlacklistTenantMutation,
  useWhitelistTenantMutation, useGetBlacklistHistoryQuery,
  useGetEmergencyContactsQuery, useAddEmergencyContactMutation,
  useUpdateEmergencyContactMutation, useDeleteEmergencyContactMutation,
  useGetTenantNotesQuery,
  useAddTenantNoteMutation, useUpdateTenantNoteMutation,
  useDeleteTenantNoteMutation, useGetTenantKycQuery, useUploadAvatarMutation,
  useReviewKycDocumentMutation, useSubmitKycDocumentMutation, useGetLeaseHistoryQuery,
  type TenantNote, type EmergencyContact, type KycDocumentItem, type LeaseHistoryItem,
} from '../../../store/api/tenantsApi';
import {
  ArrowLeft, User, Building2, Shield, ShieldOff, Phone, Mail,
  Plus, Trash2, Pin, PinOff, CheckCircle, XCircle, Clock,
  AlertCircle, FileText, Users2, Edit2, X, ChevronRight, Save,
  FolderOpen, Upload, Download, Camera, Pencil, CalendarClock,
} from 'lucide-react';
import { useGetDocumentsQuery, useUploadDocumentMutation, useDeleteDocumentMutation, type DocumentItem } from '../../../store/api/documentsApi';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard, usePermission } from '../../../components/guards/PermissionGuard';
import toast from 'react-hot-toast';
import './TenantDetailPage.css';

type Tab = 'profile' | 'kyc' | 'leases' | 'documents' | 'notes';

const KYC_COLORS: Record<string, string> = {
  pending: '#95a5a6', in_review: '#f39c12', verified: '#2ecc71', rejected: '#e74c3c', expired: '#9b59b6',
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('profile');

  const { data, isLoading } = useGetTenantQuery(id!);
  const [uploadAvatar, { isLoading: uploadingAvatar }] = useUploadAvatarMutation();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const canEditAvatar = usePermission('tenants.update');

  const tenant = data?.data;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      await uploadAvatar({ id, file }).unwrap();
      toast.success('Avatar updated successfully');
    } catch (err: any) {
      toast.error(err.data?.errors?.[0]?.message || 'Failed to upload avatar');
    }
  };

  if (isLoading) return <div className="td-loading"><div className="td-spinner" /></div>;
  if (!tenant) return (
    <div className="td-not-found">
      <AlertCircle size={48} />
      <h3>Tenant not found</h3>
      <button onClick={() => navigate('/admin/tenants')}>Back to Tenants</button>
    </div>
  );

  const kycColor = KYC_COLORS[tenant.kycStatus] || '#95a5a6';

  return (
    <div className="tenant-detail-page">
      {/* Header */}
      <div className="td-header">
        <button className="back-btn" onClick={() => navigate('/admin/tenants')}>
          <ArrowLeft size={16} /> Tenants
        </button>

        <div className="td-hero">
          <div
            className="td-avatar-wrapper"
            onClick={() => canEditAvatar && avatarInputRef.current?.click()}
            title={canEditAvatar ? undefined : 'Permission required'}
            style={canEditAvatar ? undefined : { cursor: 'not-allowed' }}
          >
            <div className="td-avatar" style={{ background: tenant.isBlacklisted ? 'rgba(231,76,60,0.15)' : 'rgba(108,92,231,0.15)' }}>
              {tenant.avatarUrl ? <img src={tenant.avatarUrl} alt="" /> : tenant.displayName.charAt(0).toUpperCase()}
            </div>
            {canEditAvatar && (
              <div className="td-avatar-overlay">
                <Camera size={20} />
              </div>
            )}
            {canEditAvatar && (
              <input type="file" ref={avatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarUpload} />
            )}
          </div>
          <div className="td-info">
            <h1 className="td-name">
              {tenant.firstName}{' '}
              {tenant.lastName && <span className="td-name-pill">{tenant.lastName}</span>}
            </h1>
            <div className="td-meta">
              <span className={`type-badge ${tenant.tenantType}`}>
                {tenant.tenantType === 'individual' ? <User size={11} /> : <Building2 size={11} />}
                {tenant.tenantType}
              </span>
              <span className="kyc-badge" style={{ color: kycColor, background: kycColor + '18', borderColor: kycColor + '40' }}>
                {tenant.kycStatus.replace(/_/g, ' ')}
              </span>
              {tenant.isBlacklisted && (
                <span className="bl-badge"><ShieldOff size={10} /> Blacklisted</span>
              )}
              {tenant.source && <span className="source-badge">{tenant.source.replace(/_/g, ' ')}</span>}
              {tenant.kycExpiryDate && (() => {
                const days = Math.ceil((new Date(tenant.kycExpiryDate).getTime() - Date.now()) / 86400000);
                const isExpiringSoon = days >= 0 && days <= 30;
                const isExpired = days < 0;
                return (
                  <span className={`kyc-expiry-badge ${isExpired ? 'expired' : isExpiringSoon ? 'warning' : ''}`}>
                    <CalendarClock size={10} />
                    {isExpired ? 'KYC Expired' : `KYC expires ${new Date(tenant.kycExpiryDate).toLocaleDateString()}`}
                  </span>
                );
              })()}
            </div>
            <div className="td-contacts">
              {tenant.email  && <span><Mail size={12} />{tenant.email}</span>}
              {tenant.mobile && <span><Phone size={12} />{tenant.mobile}</span>}
            </div>
          </div>
        </div>

        <div className="td-header-right">
          {tenant.isBlacklisted
            ? <WhitelistButton tenantId={id!} />
            : <BlacklistButton tenantId={id!} />
          }
        </div>
      </div>

      {/* KYC progress strip */}
      <KycProgressStrip summary={tenant.kycSummary} />

      {/* Tabs */}
      <div className="td-tabs">
        {(['profile', 'kyc', 'leases', 'documents', 'notes'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'profile' ? <User size={13} /> : t === 'kyc' ? <Shield size={13} /> : t === 'leases' ? <FileText size={13} /> : t === 'documents' ? <FolderOpen size={13} /> : <Edit2 size={13} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'notes' && tenant._count.tenantNotes > 0 && (
              <span className="tab-count">{tenant._count.tenantNotes}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="td-content">
        {tab === 'profile' && <ProfileTab tenant={tenant} tenantId={id!} />}
        {tab === 'kyc'     && <KycTab tenantId={id!} />}
        {tab === 'leases'  && <LeasesTab tenantId={id!} />}
        {tab === 'documents' && <DocumentsTab tenantId={id!} />}
        {tab === 'notes'   && <NotesTab tenantId={id!} />}
      </div>
    </div>
  );
}

// ── KYC Progress Strip ────────────────────────
function KycProgressStrip({ summary }: { summary: { status: string; submitted: number; approved: number; pending: number; rejected: number } }) {
  return (
    <div className="kyc-strip">
      <div className="kyc-stat approved"><CheckCircle size={13} />{summary.approved} Approved</div>
      <div className="kyc-stat pending"><Clock size={13} />{summary.pending} Pending</div>
      <div className="kyc-stat rejected"><XCircle size={13} />{summary.rejected} Rejected</div>
      <div className="kyc-stat total">{summary.submitted} / {summary.approved + summary.pending + summary.rejected} Submitted</div>
    </div>
  );
}

// ── Blacklist/Whitelist buttons ────────────────
function BlacklistButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<'company' | 'property'>('company');
  const [notes, setNotes] = useState('');
  const [blacklist, { isLoading }] = useBlacklistTenantMutation();

  const handleSubmit = async () => {
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await blacklist({ id: tenantId, reason, scope, notes: notes || undefined }).unwrap();
      toast.success('Tenant blacklisted');
      setOpen(false); setReason(''); setNotes('');
    } catch { toast.error('Failed'); }
  };

  return (
    <>
      <PermissionGuard permission="tenants.blacklist">
        <button className="btn-danger-ghost" onClick={() => setOpen(true)}><ShieldOff size={14} /> Blacklist</button>
      </PermissionGuard>
      {open && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Blacklist Tenant</h3><button onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="modal-body">
              <label>Reason *</label>
              <textarea rows={3} placeholder="Reason for blacklisting…" value={reason} onChange={(e) => setReason(e.target.value)} />
              <label style={{ marginTop: 10 }}>Scope</label>
              <div className="scope-toggle">
                <button className={scope === 'company' ? 'active' : ''} onClick={() => setScope('company')}>
                  <Building2 size={12} /> Company-wide
                </button>
                <button className={scope === 'property' ? 'active' : ''} onClick={() => setScope('property')}>
                  <Shield size={12} /> Property only
                </button>
              </div>
              <label style={{ marginTop: 10 }}>Internal Notes</label>
              <textarea rows={2} placeholder="Additional notes (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Confirm Blacklist'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WhitelistButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [whitelist, { isLoading }] = useWhitelistTenantMutation();

  const handleSubmit = async () => {
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await whitelist({ id: tenantId, reason }).unwrap();
      toast.success('Tenant whitelisted');
      setOpen(false); setReason('');
    } catch { toast.error('Failed'); }
  };

  return (
    <>
      <PermissionGuard permission="tenants.blacklist">
        <button className="btn-success-ghost" onClick={() => setOpen(true)}><Shield size={14} /> Whitelist</button>
      </PermissionGuard>
      {open && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Remove from Blacklist</h3><button onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="modal-body">
              <label>Reason *</label>
              <textarea rows={4} placeholder="Reason for removal…" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Profile Tab ───────────────────────────────
function ProfileTab({ tenant, tenantId }: { tenant: any; tenantId: string }) {
  const { data: historyData } = useGetBlacklistHistoryQuery(tenantId);
  const history = historyData?.data || [];
  const [editing, setEditing] = useState(false);
  const [updateTenant, { isLoading: saving }] = useUpdateTenantMutation();
  const [form, setForm] = useState<Record<string, string>>({}); // populated on edit start
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const startEdit = () => {
    const f: Record<string, string> = {};
    if (tenant.tenantType === 'individual') {
      f.firstName = tenant.firstName || ''; f.lastName = tenant.lastName || '';
      f.fatherName = tenant.fatherName || ''; f.fatherNrc = tenant.fatherNrc || '';
      f.dateOfBirth = (tenant.dateOfBirth || '').split('T')[0]; f.gender = tenant.gender || '';
      f.maritalStatus = tenant.maritalStatus || '';
      f.nationality = tenant.nationality || ''; f.idType = tenant.idType || '';
      f.idNumber = tenant.idNumber || ''; f.idExpiryDate = (tenant.idExpiryDate || '').split('T')[0];
    } else {
      f.companyName = tenant.companyName || ''; f.companyRegNo = tenant.companyRegNo || '';
      f.companyType = tenant.companyType || ''; f.gstRegNo = tenant.gstRegNo || '';
      f.contactPersonName = tenant.contactPersonName || ''; f.contactPersonRole = tenant.contactPersonRole || '';
      f.contactPersonPhone = tenant.contactPersonPhone || ''; f.contactPersonEmail = tenant.contactPersonEmail || '';
    }
    f.email = tenant.email || ''; f.phone = tenant.phone || ''; f.mobile = tenant.mobile || '';
    f.addressLine1 = tenant.addressLine1 || ''; f.addressLine2 = tenant.addressLine2 || '';
    f.city = tenant.city || ''; f.state = tenant.state || ''; f.postalCode = tenant.postalCode || '';
    f.country = tenant.country || ''; f.source = tenant.source || ''; f.notes = tenant.notes || '';
    setForm(f);
    setTags([...(tenant.tags || [])]);
    setEditing(true);
  };

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      payload[k] = v || null;
    }
    payload.tags = tags;
    try {
      await updateTenant({ id: tenantId, data: payload }).unwrap();
      toast.success('Profile updated');
      setEditing(false);
    } catch (e: any) {
      const err = e?.data?.errors?.[0];
      if (err?.code === 'DUPLICATE_TENANT') {
        toast.error(err?.message || 'Duplicate code — another tenant already uses this code');
      } else {
        toast.error(err?.message || 'Failed to update profile');
      }
    }
  };

  // ── Editing mode ──
  if (editing) {
    return (
      <div className="profile-tab">
        <div className="info-card">
          <div className="card-header-row">
            <h4>{tenant.tenantType === 'individual' ? 'Personal Info' : 'Company Info'}</h4>
            <div className="edit-actions">
              <button className="btn-ghost-sm" onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
              <button className="btn-primary-sm" onClick={handleSave} disabled={saving}><Save size={13} /> {saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
          <div className="edit-grid">
            {tenant.tenantType === 'individual' ? (
              <>
                <EditField label="Code" value={form.firstName} onChange={(v) => set('firstName', v)} />
                <EditField label="Name" value={form.lastName} onChange={(v) => set('lastName', v)} />
                <EditField label="Father Name" value={form.fatherName} onChange={(v) => set('fatherName', v)} />
                <EditField label="Father's NRC" value={form.fatherNrc} onChange={(v) => set('fatherNrc', v)} />
                <EditField label="Date of Birth" value={form.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} type="date" />
                <EditSelect label="Gender" value={form.gender} onChange={(v) => set('gender', v)}
                  options={[['','—'],['male','Male'],['female','Female'],['other','Other'],['prefer_not_to_say','Prefer not to say']]} />
                <EditSelect label="Marital Status" value={form.maritalStatus} onChange={(v) => set('maritalStatus', v)}
                  options={[['','—'],['single','Single'],['married','Married']]} />
                <EditField label="Nationality" value={form.nationality} onChange={(v) => set('nationality', v)} />
                <EditSelect label="ID Type" value={form.idType} onChange={(v) => set('idType', v)}
                  options={[['','—'],['nric','NRC'],['passport','Passport'],['fin','FIN'],['driving_license','Driving License']]} />
                <EditField label="ID Number" value={form.idNumber} onChange={(v) => set('idNumber', v)} />
                <EditField label="ID Expiry" value={form.idExpiryDate} onChange={(v) => set('idExpiryDate', v)} type="date" />
              </>
            ) : (
              <>
                <EditField label="Company Name" value={form.companyName} onChange={(v) => set('companyName', v)} span={2} />
                <EditField label="Reg. No." value={form.companyRegNo} onChange={(v) => set('companyRegNo', v)} />
                <EditSelect label="Company Type" value={form.companyType} onChange={(v) => set('companyType', v)}
                  options={[['','—'],['private_limited','Private Limited'],['partnership','Partnership'],['sole_prop','Sole Proprietor'],['public','Public Listed']]} />
                <EditField label="GST No." value={form.gstRegNo} onChange={(v) => set('gstRegNo', v)} />
                <div />
                <EditField label="Contact Person" value={form.contactPersonName} onChange={(v) => set('contactPersonName', v)} />
                <EditField label="Role" value={form.contactPersonRole} onChange={(v) => set('contactPersonRole', v)} />
                <EditField label="Contact Phone" value={form.contactPersonPhone} onChange={(v) => set('contactPersonPhone', v)} />
                <EditField label="Contact Email" value={form.contactPersonEmail} onChange={(v) => set('contactPersonEmail', v)} type="email" />
              </>
            )}
          </div>
        </div>

        {/* Contact */}
        <div className="info-card">
          <h4>Contact Details</h4>
          <div className="edit-grid">
            <EditField label="Email" value={form.email} onChange={(v) => set('email', v)} type="email" />
            <EditField label="Phone" value={form.phone} onChange={(v) => set('phone', v)} />
            <EditField label="Mobile" value={form.mobile} onChange={(v) => set('mobile', v)} />
            <EditSelect label="Source" value={form.source} onChange={(v) => set('source', v)}
              options={[['','—'],['walk_in','Walk-in'],['referral','Referral'],['online','Online'],['agent','Agent']]} />
            {tenant.tenantType === 'individual' && (
              <>
                <EditField label="Father Name" value={form.fatherName} onChange={(v) => set('fatherName', v)} />
                <EditField label="Father's NRC" value={form.fatherNrc} onChange={(v) => set('fatherNrc', v)} />
              </>
            )}
          </div>
        </div>

        {/* Address */}
        <div className="info-card">
          <h4>Address</h4>
          <div className="edit-grid">
            <EditField label="Address Line 1" value={form.addressLine1} onChange={(v) => set('addressLine1', v)} span={2} />
            <EditField label="Address Line 2" value={form.addressLine2} onChange={(v) => set('addressLine2', v)} span={2} />
            <EditField label="City" value={form.city} onChange={(v) => set('city', v)} />
            <EditField label="State" value={form.state} onChange={(v) => set('state', v)} />
            <EditField label="Postal Code" value={form.postalCode} onChange={(v) => set('postalCode', v)} />
            <EditField label="Country" value={form.country} onChange={(v) => set('country', v.toUpperCase())} maxLen={2} />
          </div>
        </div>

        {/* Tags */}
        <div className="info-card">
          <h4>Tags</h4>
          <div className="edit-tags">
            {tags.map((t) => (
              <span key={t} className="edit-tag">{t.replace(/_/g, ' ')}<button onClick={() => setTags(tags.filter((x) => x !== t))}>×</button></span>
            ))}
            <input
              className="tag-input-inline"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput && !tags.includes(tagInput)) {
                  setTags([...tags, tagInput]); setTagInput('');
                }
              }}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="info-card">
          <h4>Internal Notes</h4>
          <textarea className="edit-notes" rows={3} placeholder="Internal notes…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>

        <EmergencyContactsSection tenantId={tenantId} />
      </div>
    );
  }

  // ── Read-only mode ──
  return (
    <div className="profile-tab">
      {/* Identity */}
      <div className="info-card">
        <div className="card-header-row">
          <h4>{tenant.tenantType === 'individual' ? 'Personal Info' : 'Company Info'}</h4>
          <PermissionGuard permission="tenants.update">
            <button className="btn-edit-profile" onClick={startEdit}><Edit2 size={13} /> Edit Profile</button>
          </PermissionGuard>
        </div>
        <div className="info-rows">
          {tenant.tenantType === 'individual' ? (
            <>
              {tenant.firstName     && <InfoRow label="Code"          value={tenant.firstName} />}
              {tenant.lastName      && <InfoRow label="Name"          value={tenant.lastName} />}
              {tenant.fatherName    && <InfoRow label="Father Name"   value={tenant.fatherName} />}
              {tenant.fatherNrc     && <InfoRow label="Father's NRC"  value={tenant.fatherNrc} />}
              {tenant.dateOfBirth   && <InfoRow label="Date of Birth" value={tenant.dateOfBirth.split('T')[0]} />}
              {tenant.gender        && <InfoRow label="Gender"        value={tenant.gender} />}
              {tenant.maritalStatus && <InfoRow label="Marital Status" value={tenant.maritalStatus.charAt(0).toUpperCase() + tenant.maritalStatus.slice(1)} />}
              {tenant.nationality   && <InfoRow label="Nationality"   value={tenant.nationality} />}
              {tenant.idType        && <InfoRow label="ID Type"       value={tenant.idType.replace(/_/g,' ')} />}
              {tenant.idNumber      && <InfoRow label="ID Number"     value={tenant.idNumber} />}
              {tenant.idExpiryDate  && <InfoRow label="ID Expiry"     value={tenant.idExpiryDate.split('T')[0]} />}
            </>
          ) : (
            <>
              {tenant.companyRegNo        && <InfoRow label="Reg. No."       value={tenant.companyRegNo} />}
              {tenant.companyType         && <InfoRow label="Company Type"   value={tenant.companyType.replace(/_/g,' ')} />}
              {tenant.gstRegNo            && <InfoRow label="GST No."        value={tenant.gstRegNo} />}
              {tenant.contactPersonName   && <InfoRow label="Contact Person" value={tenant.contactPersonName} />}
              {tenant.contactPersonRole   && <InfoRow label="Role"           value={tenant.contactPersonRole} />}
              {tenant.contactPersonPhone  && <InfoRow label="Contact Phone"  value={tenant.contactPersonPhone} />}
              {tenant.contactPersonEmail  && <InfoRow label="Contact Email"  value={tenant.contactPersonEmail} />}
            </>
          )}
        </div>
      </div>

      {/* Contact details */}
      {(tenant.email || tenant.phone || tenant.mobile || tenant.source) && (
        <div className="info-card">
          <h4>Contact Details</h4>
          <div className="info-rows">
            {tenant.email  && <InfoRow label="Email"  value={tenant.email} />}
            {tenant.phone  && <InfoRow label="Phone"  value={tenant.phone} />}
            {tenant.mobile && <InfoRow label="Mobile" value={tenant.mobile} />}
            {tenant.source && <InfoRow label="Source" value={tenant.source.replace(/_/g, ' ')} />}
          </div>
        </div>
      )}


      {/* Address */}
      {(tenant.addressLine1 || tenant.city || tenant.country) && (
        <div className="info-card">
          <h4>Address</h4>
          <div className="address-block">
            {[tenant.addressLine1, tenant.addressLine2, [tenant.city, tenant.state, tenant.postalCode].filter(Boolean).join(', '), tenant.country]
              .filter(Boolean).map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      )}

      {/* Tags */}
      {tenant.tags.length > 0 && (
        <div className="info-card">
          <h4>Tags</h4>
          <div className="tag-list">
            {tenant.tags.map((t: string) => <span key={t} className="tenant-tag">{t.replace(/_/g,' ')}</span>)}
          </div>
        </div>
      )}

      {/* Notes */}
      {tenant.notes && (
        <div className="info-card">
          <h4>Internal Notes</h4>
          <div className="address-block">{tenant.notes}</div>
        </div>
      )}

      {/* Emergency contacts */}
      <EmergencyContactsSection tenantId={tenantId} />

      {/* Blacklist history */}
      {history.length > 0 && (
        <div className="info-card">
          <h4>Blacklist History</h4>
          <div className="bl-history">
            {history.map((h: any) => (
              <div key={h.id} className={`bl-entry ${h.action}`}>
                <div className="bl-action">{h.action === 'blacklist' ? <ShieldOff size={13} /> : <Shield size={13} />} {h.action}</div>
                <div className="bl-reason">{h.reason}</div>
                <div className="bl-meta">
                  {h.actionedByUser?.profile ? `${h.actionedByUser.profile.firstName} ${h.actionedByUser.profile.lastName}` : h.actionedByUser?.email}
                  · {new Date(h.actionedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text', span, maxLen }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; span?: number; maxLen?: number;
}) {
  return (
    <div className="edit-field" style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLen} />
    </div>
  );
}

function EditSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div className="edit-field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value capitalize">{value}</span>
    </div>
  );
}

// ── Emergency Contacts ────────────────────────
function EmergencyContactsSection({ tenantId }: { tenantId: string }) {
  const { data } = useGetEmergencyContactsQuery(tenantId);
  const [add] = useAddEmergencyContactMutation();
  const [update] = useUpdateEmergencyContactMutation();
  const [del] = useDeleteEmergencyContactMutation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', relationship: 'spouse', phone: '', email: '', isPrimary: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', relationship: 'spouse', phone: '', email: '', isPrimary: false });

  const contacts = data?.data || [];

  const handleAdd = async () => {
    if (!form.name || !form.phone) return;
    try {
      await add({ tenantId, data: form }).unwrap();
      toast.success('Contact added');
      setShowForm(false);
      setForm({ name: '', relationship: 'spouse', phone: '', email: '', isPrimary: false });
    } catch { toast.error('Failed'); }
  };

  const startEdit = (c: EmergencyContact) => {
    setEditingId(c.id);
    setEditForm({ name: c.name, relationship: c.relationship, phone: c.phone, email: c.email || '', isPrimary: c.isPrimary });
  };

  const handleEditSave = async () => {
    if (!editingId || !editForm.name || !editForm.phone) return;
    try {
      await update({ tenantId, contactId: editingId, data: editForm }).unwrap();
      toast.success('Contact updated');
      setEditingId(null);
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="info-card">
      <div className="card-header-row">
        <h4>Emergency Contacts</h4>
        <PermissionGuard permission="tenants.update">
          <button className="btn-add-sm" onClick={() => setShowForm(!showForm)}><Plus size={12} /></button>
        </PermissionGuard>
      </div>

      {showForm && (
        <div className="ec-form">
          <div className="form-row-2">
            <input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
              {['spouse','parent','sibling','colleague','other'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-row-2">
            <input placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-actions-sm">
            <label><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Primary</label>
            <button className="btn-primary-sm" onClick={handleAdd}>Save</button>
            <button className="btn-ghost-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? <div className="empty-sm">No emergency contacts</div> : (
        contacts.map((c: EmergencyContact) => (
          <div key={c.id} className="ec-card">
            {editingId === c.id ? (
              <div className="ec-edit-inline">
                <div className="form-row-2">
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name *" />
                  <select value={editForm.relationship} onChange={(e) => setEditForm({ ...editForm, relationship: e.target.value })}>
                    {['spouse','parent','sibling','colleague','other'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-row-2">
                  <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone *" />
                  <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" />
                </div>
                <div className="form-actions-sm">
                  <label><input type="checkbox" checked={editForm.isPrimary} onChange={(e) => setEditForm({ ...editForm, isPrimary: e.target.checked })} /> Primary</label>
                  <button className="btn-primary-sm" onClick={handleEditSave}><Save size={11} /> Save</button>
                  <button className="btn-ghost-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {c.isPrimary && <span className="primary-dot" title="Primary" />}
                <div className="ec-info">
                  <div className="ec-name">{c.name} <span className="ec-rel">({c.relationship})</span></div>
                  <div className="ec-contact"><Phone size={11} />{c.phone}</div>
                  {c.email && <div className="ec-contact"><Mail size={11} />{c.email}</div>}
                </div>
                <PermissionGuard permission="tenants.update">
                  <div className="ec-actions">
                    <button className="ec-edit" onClick={() => startEdit(c)} title="Edit"><Pencil size={12} /></button>
                    <button className="ec-del" onClick={async () => {
                      try { await del({ tenantId, contactId: c.id }).unwrap(); toast.success('Removed'); }
                      catch { toast.error('Failed'); }
                    }}><Trash2 size={12} /></button>
                  </div>
                </PermissionGuard>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── KYC Tab ───────────────────────────────────
function KycTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useGetTenantKycQuery(tenantId);
  const [review] = useReviewKycDocumentMutation();
  const [reviewModal, setReviewModal] = useState<{ docId: string; name: string } | null>(null);
  const [submitModal, setSubmitModal] = useState<{ reqId: string; name: string } | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [rejReason, setRejReason] = useState('');

  const kyc = data?.data;

  const handleReview = async () => {
    if (!reviewModal) return;
    try {
      await review({ tenantId, kycDocId: reviewModal.docId, decision, rejectionReason: rejReason || undefined }).unwrap();
      toast.success(`Document ${decision}`);
      setReviewModal(null); setRejReason('');
    } catch { toast.error('Failed'); }
  };

  if (isLoading) return <div className="tab-loading">Loading KYC…</div>;

  return (
    <div className="kyc-tab">
      <div className="kyc-overall">
        <div>Overall KYC Status: <strong style={{ color: KYC_COLORS[kyc?.status || 'pending'] }}>{kyc?.status?.replace(/_/g,' ')}</strong></div>
        {kyc?.verifiedAt && <div>Verified: {new Date(kyc.verifiedAt).toLocaleDateString()}</div>}
      </div>

      <div className="kyc-docs">
        {(kyc?.documents || []).map((doc: KycDocumentItem) => (
          <div key={doc.id} className={`kyc-doc-card ${doc.status}`}>
            <div className="kyc-doc-left">
              {doc.status === 'approved' ? <CheckCircle size={18} color="#2ecc71" />
               : doc.status === 'rejected' ? <XCircle size={18} color="#e74c3c" />
               : <Clock size={18} color="#f39c12" />}
            </div>
            <div className="kyc-doc-body">
              <div className="kyc-doc-name">
                {doc.name || doc.docType.replace(/_/g,' ')}
                {doc.isRequired && <span className="req-badge">Required</span>}
              </div>
              <div className="kyc-doc-status" style={{ color: { approved: '#2ecc71', rejected: '#e74c3c', pending: '#f39c12' }[doc.status] }}>
                {doc.status}
              </div>
              {doc.rejectionReason && <div className="kyc-reject-reason">⚠ {doc.rejectionReason}</div>}
              {doc.expiryDate && (() => {
                const days = Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000);
                return (
                  <div className={`kyc-doc-expiry ${days < 0 ? 'expired' : days <= 30 ? 'warning' : ''}`}>
                    <CalendarClock size={11} />
                    {days < 0 ? 'Expired' : `Expires ${new Date(doc.expiryDate).toLocaleDateString()}`}
                    {days >= 0 && days <= 30 && <span> ({days}d left)</span>}
                  </div>
                );
              })()}
              {doc.reviewedAt && <div className="kyc-reviewed-by">
                Reviewed by {doc.reviewedBy?.profile ? `${doc.reviewedBy.profile.firstName} ${doc.reviewedBy.profile.lastName}` : doc.reviewedBy?.email}
              </div>}
            </div>
            <div className="kyc-doc-actions">
              {doc.documentId && doc.status !== 'approved' && (
                <PermissionGuard permission="tenants.kyc">
                  <button className="btn-kyc-review" onClick={() => { setReviewModal({ docId: doc.id, name: doc.name }); setDecision('approved'); }}>
                    Review
                  </button>
                </PermissionGuard>
              )}
              {(!doc.documentId || doc.status === 'rejected') && (
                <PermissionGuard permission="tenants.kyc">
                  <button className="btn-kyc-submit btn-primary-sm" onClick={() => setSubmitModal({ reqId: doc.requirementId, name: doc.name || doc.docType })}>
                    Submit
                  </button>
                </PermissionGuard>
              )}
            </div>
          </div>
        ))}
      </div>

      {reviewModal && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Review Document</h3><button onClick={() => setReviewModal(null)}><X size={18} /></button></div>
            <div className="modal-body">
              <p style={{ fontWeight: 600 }}>{reviewModal.name}</p>
              <div className="review-toggle">
                <button className={decision === 'approved' ? 'active approve' : ''} onClick={() => setDecision('approved')}><CheckCircle size={14} /> Approve</button>
                <button className={decision === 'rejected' ? 'active reject' : ''} onClick={() => setDecision('rejected')}><XCircle size={14} /> Reject</button>
              </div>
              {decision === 'rejected' && (
                <textarea rows={3} placeholder="Rejection reason…" value={rejReason} onChange={(e) => setRejReason(e.target.value)} />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setReviewModal(null)}>Cancel</button>
              <button className={decision === 'approved' ? 'btn-primary' : 'btn-danger'} onClick={handleReview}>
                {decision === 'approved' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitModal && (
        <SubmitDocumentModal 
          tenantId={tenantId}
          requirementId={submitModal.reqId}
          requirementName={submitModal.name}
          onClose={() => setSubmitModal(null)} 
        />
      )}
    </div>
  );
}

function SubmitDocumentModal({ tenantId, requirementId, requirementName, onClose }: { tenantId: string, requirementId: string, requirementName: string, onClose: () => void }) {
  const { data, isLoading } = useGetDocumentsQuery({ entityType: 'tenant', entityId: tenantId });
  const [submitKyc] = useSubmitKycDocumentMutation();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const documents = data?.data || [];

  const handleSubmit = async () => {
    if (!selectedDocId) return;
    try {
      await submitKyc({ tenantId, requirementId, documentId: selectedDocId }).unwrap();
      toast.success('Document submitted for KYC');
      onClose();
    } catch {
      toast.error('Failed to submit document');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Submit: {requirementName}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p>Select a document from the vault to satisfy this KYC requirement.</p>
          {isLoading ? <p>Loading documents...</p> : documents.length === 0 ? (
            <p className="empty-sm">No documents found. Please upload one in the Documents tab first.</p>
          ) : (
            <div className="doc-select-list" style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {documents.map((doc: DocumentItem) => (
                <div 
                  key={doc.id} 
                  className={`doc-card-sm ${selectedDocId === doc.id ? 'selected' : ''}`}
                  onClick={() => setSelectedDocId(doc.id)}
                  style={{ cursor: 'pointer', border: selectedDocId === doc.id ? '1px solid #6c5ce7' : '' }}
                >
                  <div className="doc-info">
                    <FileText size={16} className="doc-icon" />
                    <div>
                      <div className="doc-name">{doc.name}</div>
                      <div className="doc-meta">{doc.fileSizeFormatted} · {new Date(doc.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!selectedDocId} onClick={handleSubmit}>Submit</button>
        </div>
      </div>
    </div>
  );
}

// ── Leases Tab ────────────────────────────────
const LEASE_STATUS_COLORS: Record<string, string> = {
  draft: '#95a5a6', pending_approval: '#f39c12', approved: '#3498db',
  active: '#2ecc71', expired: '#9b59b6', terminated: '#e74c3c',
  renewed: '#1abc9c', cancelled: '#7f8c8d',
};

function LeasesTab({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useGetLeaseHistoryQuery(tenantId);
  const leases = data?.data || [];

  if (isLoading) return <div className="tab-loading">Loading leases…</div>;

  if (leases.length === 0) return (
    <div className="leases-tab">
      <div className="coming-soon">
        <FileText size={36} />
        <h3>No Leases</h3>
        <p>This tenant has no lease history yet.</p>
      </div>
    </div>
  );

  const active = leases.filter((l: LeaseHistoryItem) => l.status === 'active').length;

  return (
    <div className="leases-tab">
      <div className="leases-summary">
        <span className="lease-stat">{leases.length} total leases</span>
        {active > 0 && <span className="lease-stat active">{active} active</span>}
      </div>
      <div className="tenant-leases-list">
        <div className="lease-row header">
          <span>Lease #</span><span>Property</span><span>Unit</span>
          <span>Period</span><span>Rent</span><span>Status</span>
        </div>
        {leases.map((l: LeaseHistoryItem) => {
          const sc = LEASE_STATUS_COLORS[l.status] || '#95a5a6';
          return (
            <div key={l.id} className="lease-row">
              <span
                className="lease-num"
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => navigate(`/admin/leases/${l.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/admin/leases/${l.id}`); }}
              >
                {l.leaseNumber}
              </span>
              <span className="lease-prop">{l.propertyName}</span>
              <span className="lease-unit">{l.unitNumber}</span>
              <span className="lease-period">
                {new Date(l.startDate).toLocaleDateString()} — {new Date(l.endDate).toLocaleDateString()}
              </span>
              <span className="lease-rent">
                {l.currency} {l.rentAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="rent-cycle">/{l.billingCycle.replace('ly','')}</span>
              </span>
              <span>
                <span className="lease-status" style={{ color: sc, background: sc + '18', borderColor: sc + '40' }}>
                  {l.status.replace(/_/g, ' ')}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────
function DocumentsTab({ tenantId }: { tenantId: string }) {
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetDocumentsQuery({ entityType: 'tenant', entityId: tenantId });
  const [uploadDoc, { isLoading: uploading }] = useUploadDocumentMutation();
  const [deleteDoc] = useDeleteDocumentMutation();
  const fileRef = useRef<HTMLInputElement>(null);

  const documents = data?.data || [];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name.replace(/\.[^.]+$/, ''));
    formData.append('entityType', 'tenant');
    formData.append('entityId', tenantId);

    try {
      await uploadDoc(formData).unwrap();
      toast.success('Document uploaded');
    } catch { toast.error('Failed to upload document'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('Are you sure you want to delete this document?', { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteDoc(id).unwrap();
      toast.success('Document deleted');
    } catch { toast.error('Failed to delete document'); }
  };

  if (isLoading) return <div className="tab-loading">Loading documents…</div>;

  return (
    <div className="documents-tab">
      <div className="card-header-row">
        <h4>Tenant Documents</h4>
        <div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
          <PermissionGuard permission="documents.write">
            <button className="btn-primary-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload Document'}
            </button>
          </PermissionGuard>
        </div>
      </div>
      
      {documents.length === 0 ? (
        <div className="empty-sm">No documents found</div>
      ) : (
        <div className="doc-list">
          {documents.map((doc: DocumentItem) => (
            <div key={doc.id} className="doc-card-sm">
              <div className="doc-info">
                <FileText size={16} className="doc-icon" />
                <div>
                  <div className="doc-name">{doc.name}</div>
                  <div className="doc-meta">{doc.fileSizeFormatted} · {new Date(doc.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="doc-actions">
                <a href={`/api/v1/documents/${doc.id}/download`} target="_blank" rel="noreferrer" title="Download">
                  <Download size={14} />
                </a>
                <PermissionGuard permission="documents.write">
                  <button onClick={() => handleDelete(doc.id)} className="btn-danger-ghost" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </PermissionGuard>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────
function NotesTab({ tenantId }: { tenantId: string }) {
  const { data } = useGetTenantNotesQuery(tenantId);
  const [addNote] = useAddTenantNoteMutation();
  const [updateNote] = useUpdateTenantNoteMutation();
  const [deleteNote] = useDeleteTenantNoteMutation();
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  const notes = data?.data || [];
  const pinned   = notes.filter((n: TenantNote) => n.isPinned);
  const unpinned = notes.filter((n: TenantNote) => !n.isPinned);

  const handleAdd = async () => {
    if (!content.trim()) return;
    try {
      await addNote({ tenantId, content, isPinned }).unwrap();
      toast.success('Note added');
      setContent(''); setIsPinned(false);
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="notes-tab">
      {/* Compose */}
      <div className="note-compose">
        <textarea placeholder="Write a note…" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        <div className="note-compose-footer">
          <label className="pin-toggle">
            <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
            <Pin size={12} /> Pin note
          </label>
          <PermissionGuard permission="tenants.update">
            <button className="btn-primary-sm" onClick={handleAdd} disabled={!content.trim()}>Add Note</button>
          </PermissionGuard>
        </div>
      </div>

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="notes-section">
          <div className="notes-section-label"><Pin size={11} /> Pinned</div>
          {pinned.map((n: TenantNote) => (
            <NoteCard key={n.id} note={n} tenantId={tenantId} onTogglePin={() => updateNote({ tenantId, noteId: n.id, isPinned: !n.isPinned }).unwrap()} onDelete={() => deleteNote({ tenantId, noteId: n.id }).unwrap()} />
          ))}
        </div>
      )}

      {/* All notes */}
      <div className="notes-list">
        {unpinned.map((n: TenantNote) => (
          <NoteCard key={n.id} note={n} tenantId={tenantId} onTogglePin={() => updateNote({ tenantId, noteId: n.id, isPinned: !n.isPinned }).unwrap()} onDelete={() => deleteNote({ tenantId, noteId: n.id }).unwrap()} />
        ))}
        {notes.length === 0 && <div className="empty-sm">No notes yet</div>}
      </div>
    </div>
  );
}

function NoteCard({ note, tenantId, onTogglePin, onDelete }: {
  note: TenantNote; tenantId: string; onTogglePin: () => void; onDelete: () => void;
}) {
  return (
    <div className={`note-card ${note.isPinned ? 'pinned' : ''}`}>
      <p className="note-content">{note.content}</p>
      <div className="note-meta">
        <span>{note.author?.profile ? `${note.author.profile.firstName} ${note.author.profile.lastName}` : note.author?.email}</span>
        <span>·</span>
        <span>{new Date(note.createdAt).toLocaleString()}</span>
      </div>
      <div className="note-actions">
        <PermissionGuard permission="tenants.update">
          <button onClick={onTogglePin} title={note.isPinned ? 'Unpin' : 'Pin'}>
            {note.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          <button onClick={async () => { try { await onDelete(); toast.success('Deleted'); } catch { toast.error('Failed'); } }} title="Delete">
            <Trash2 size={12} />
          </button>
        </PermissionGuard>
      </div>
    </div>
  );
}
