import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetTenantQuery, useUpdateTenantMutation, useBlacklistTenantMutation,
  useWhitelistTenantMutation, useGetBlacklistHistoryQuery,
  useGetEmergencyContactsQuery, useAddEmergencyContactMutation,
  useDeleteEmergencyContactMutation, useGetTenantNotesQuery,
  useAddTenantNoteMutation, useUpdateTenantNoteMutation,
  useDeleteTenantNoteMutation, useGetTenantKycQuery,
  useReviewKycDocumentMutation,
  type TenantNote, type EmergencyContact, type KycDocumentItem,
} from '../../../store/api/tenantsApi';
import {
  ArrowLeft, User, Building2, Shield, ShieldOff, Phone, Mail,
  Plus, Trash2, Pin, PinOff, CheckCircle, XCircle, Clock,
  AlertCircle, FileText, Users2, Edit2, X, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './TenantDetailPage.css';

type Tab = 'profile' | 'kyc' | 'leases' | 'notes';

const KYC_COLORS: Record<string, string> = {
  pending: '#95a5a6', in_review: '#f39c12', verified: '#2ecc71', rejected: '#e74c3c', expired: '#9b59b6',
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('profile');

  const { data, isLoading } = useGetTenantQuery(id!);
  const tenant = data?.data;

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
          <div className="td-avatar" style={{ background: tenant.isBlacklisted ? 'rgba(231,76,60,0.15)' : 'rgba(108,92,231,0.15)' }}>
            {tenant.avatarUrl ? <img src={tenant.avatarUrl} alt="" /> : tenant.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="td-info">
            <h1 className="td-name">{tenant.displayName}</h1>
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
        {(['profile', 'kyc', 'leases', 'notes'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'profile' ? <User size={13} /> : t === 'kyc' ? <Shield size={13} /> : t === 'leases' ? <FileText size={13} /> : <Edit2 size={13} />}
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
  const [blacklist, { isLoading }] = useBlacklistTenantMutation();

  const handleSubmit = async () => {
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await blacklist({ id: tenantId, reason }).unwrap();
      toast.success('Tenant blacklisted');
      setOpen(false); setReason('');
    } catch { toast.error('Failed'); }
  };

  return (
    <>
      <button className="btn-danger-ghost" onClick={() => setOpen(true)}><ShieldOff size={14} /> Blacklist</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Blacklist Tenant</h3><button onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="modal-body">
              <label>Reason *</label>
              <textarea rows={4} placeholder="Reason for blacklisting…" value={reason} onChange={(e) => setReason(e.target.value)} />
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
      <button className="btn-success-ghost" onClick={() => setOpen(true)}><Shield size={14} /> Whitelist</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
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

  return (
    <div className="profile-tab">
      {/* Identity */}
      <div className="info-card">
        <h4>{tenant.tenantType === 'individual' ? 'Personal Info' : 'Company Info'}</h4>
        <div className="info-rows">
          {tenant.tenantType === 'individual' ? (
            <>
              {tenant.dateOfBirth  && <InfoRow label="Date of Birth" value={tenant.dateOfBirth.split('T')[0]} />}
              {tenant.gender       && <InfoRow label="Gender" value={tenant.gender} />}
              {tenant.nationality  && <InfoRow label="Nationality" value={tenant.nationality} />}
              {tenant.idType       && <InfoRow label="ID Type" value={tenant.idType.replace(/_/g,' ')} />}
              {tenant.idNumber     && <InfoRow label="ID Number" value={tenant.idNumber} />}
              {tenant.idExpiryDate && <InfoRow label="ID Expiry" value={tenant.idExpiryDate.split('T')[0]} />}
            </>
          ) : (
            <>
              {tenant.companyRegNo        && <InfoRow label="Reg. No." value={tenant.companyRegNo} />}
              {tenant.companyType         && <InfoRow label="Company Type" value={tenant.companyType.replace(/_/g,' ')} />}
              {tenant.gstRegNo            && <InfoRow label="GST No." value={tenant.gstRegNo} />}
              {tenant.contactPersonName   && <InfoRow label="Contact Person" value={tenant.contactPersonName} />}
              {tenant.contactPersonRole   && <InfoRow label="Role" value={tenant.contactPersonRole} />}
              {tenant.contactPersonPhone  && <InfoRow label="Contact Phone" value={tenant.contactPersonPhone} />}
              {tenant.contactPersonEmail  && <InfoRow label="Contact Email" value={tenant.contactPersonEmail} />}
            </>
          )}
        </div>
      </div>

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
  const [del] = useDeleteEmergencyContactMutation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', relationship: 'spouse', phone: '', email: '', isPrimary: false });

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

  return (
    <div className="info-card">
      <div className="card-header-row">
        <h4>Emergency Contacts</h4>
        <button className="btn-add-sm" onClick={() => setShowForm(!showForm)}><Plus size={12} /></button>
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
            {c.isPrimary && <span className="primary-dot" title="Primary" />}
            <div className="ec-info">
              <div className="ec-name">{c.name} <span className="ec-rel">({c.relationship})</span></div>
              <div className="ec-contact"><Phone size={11} />{c.phone}</div>
              {c.email && <div className="ec-contact"><Mail size={11} />{c.email}</div>}
            </div>
            <button className="ec-del" onClick={async () => {
              try { await del({ tenantId, contactId: c.id }).unwrap(); toast.success('Removed'); }
              catch { toast.error('Failed'); }
            }}><Trash2 size={12} /></button>
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
              {doc.reviewedAt && <div className="kyc-reviewed-by">
                Reviewed by {doc.reviewedBy?.profile ? `${doc.reviewedBy.profile.firstName} ${doc.reviewedBy.profile.lastName}` : doc.reviewedBy?.email}
              </div>}
            </div>
            <div className="kyc-doc-actions">
              {doc.status !== 'approved' && (
                <button className="btn-kyc-review" onClick={() => { setReviewModal({ docId: doc.id, name: doc.name }); setDecision('approved'); }}>
                  Review
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {reviewModal && (
        <div className="modal-overlay" onClick={() => setReviewModal(null)}>
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
    </div>
  );
}

// ── Leases Tab ────────────────────────────────
function LeasesTab({ tenantId }: { tenantId: string }) {
  return (
    <div className="leases-tab">
      <div className="coming-soon">
        <FileText size={36} />
        <h3>Lease History</h3>
        <p>Lease management is implemented in Module 2.4. Tenant's full lease history will appear here.</p>
      </div>
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
          <button className="btn-primary-sm" onClick={handleAdd} disabled={!content.trim()}>Add Note</button>
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
        <button onClick={onTogglePin} title={note.isPinned ? 'Unpin' : 'Pin'}>
          {note.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button onClick={async () => { try { await onDelete(); toast.success('Deleted'); } catch { toast.error('Failed'); } }} title="Delete">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
