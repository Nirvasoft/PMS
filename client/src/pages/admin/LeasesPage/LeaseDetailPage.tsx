import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetLeaseQuery, useSubmitLeaseMutation, useActivateLeaseMutation,
  useCancelLeaseMutation, useTerminateLeaseMutation, useCreateRenewalMutation,
  useCreateAmendmentMutation, useApproveAmendmentMutation,
  useSendForSigningMutation, useGetEsignStatusQuery,
  type LeaseDetail, type LeaseAmendment, type EscalationEntry,
} from '../../../store/api/leasesApi';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, PenLine, AlertTriangle,
  FileText, Send, RefreshCw, Scissors, Plus, X, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './LeaseDetailPage.css';

type Tab = 'overview' | 'terms' | 'amendments' | 'esign';

const STATUS_COLORS: Record<string, string> = {
  draft: '#95a5a6', pending_approval: '#f39c12', approved: '#3498db',
  active: '#2ecc71', expired: '#9b59b6', terminated: '#e74c3c', renewed: '#1abc9c', cancelled: '#7f8c8d',
};

export default function LeaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [showRenewalModal,   setShowRenewalModal]   = useState(false);
  const [showAmendModal,     setShowAmendModal]      = useState(false);
  const [showEsignModal,     setShowEsignModal]      = useState(false);

  const { data, isLoading } = useGetLeaseQuery(id!);
  const lease = data?.data;

  const [submit,   { isLoading: submitting }]   = useSubmitLeaseMutation();
  const [activate, { isLoading: activating }]   = useActivateLeaseMutation();
  const [cancel,   { isLoading: cancelling }]   = useCancelLeaseMutation();

  if (isLoading) return <div className="ld-loading"><div className="ld-spinner" /></div>;
  if (!lease)    return <div className="ld-not-found"><AlertTriangle size={40}/><p>Lease not found</p></div>;

  const color  = STATUS_COLORS[lease.status] || '#95a5a6';
  const isDraft    = lease.status === 'draft';
  const isPending  = lease.status === 'pending_approval';
  const isApproved = lease.status === 'approved';
  const isActive   = lease.status === 'active';

  const handleSubmit = async () => {
    try { await submit(id!).unwrap(); toast.success('Submitted for approval'); }
    catch (e: any) { toast.error(e?.data?.message || 'Submit failed'); }
  };
  const handleActivate = async () => {
    try { await activate(id!).unwrap(); toast.success('Lease activated'); }
    catch (e: any) { toast.error(e?.data?.message || 'Activation failed'); }
  };
  const handleCancel = async () => {
    if (!confirm('Cancel this lease?')) return;
    try { await cancel({ id: id! }).unwrap(); toast.success('Lease cancelled'); }
    catch (e: any) { toast.error(e?.data?.message || 'Cancel failed'); }
  };

  return (
    <div className="lease-detail-page">
      {/* Header */}
      <div className="ld-header">
        <button className="back-btn" onClick={() => navigate('/admin/leases')}><ArrowLeft size={16}/> Leases</button>

        <div className="ld-hero">
          <div className="ld-hero-left">
            <div className="lease-num-lg">{lease.leaseNumber}</div>
            <span className="status-pill-lg" style={{ color, background: color + '1a', borderColor: color + '40' }}>
              {lease.status.replace(/_/g,' ')}
            </span>
            {lease.daysUntilExpiry <= 30 && isActive && (
              <span className="exp-badge"><AlertTriangle size={12}/> Expires in {lease.daysUntilExpiry}d</span>
            )}
          </div>

          {/* Action toolbar */}
          <div className="ld-actions">
            {isDraft  && <button className="btn-action-submit" onClick={handleSubmit}  disabled={submitting}><Send size={14}/> Submit</button>}
            {(isApproved || isPending) && <button className="btn-action-activate" onClick={handleActivate} disabled={activating}><CheckCircle size={14}/> Activate</button>}
            {isActive  && <button className="btn-action-amend"     onClick={() => setShowAmendModal(true)}><PenLine size={14}/> Amend</button>}
            {isActive  && <button className="btn-action-renew"     onClick={() => setShowRenewalModal(true)}><RefreshCw size={14}/> Renew</button>}
            {isActive  && <button className="btn-action-terminate" onClick={() => setShowTerminateModal(true)}><Scissors size={14}/> Terminate</button>}
            {(isDraft || isPending) && <button className="btn-action-cancel" onClick={handleCancel} disabled={cancelling}><XCircle size={14}/> Cancel</button>}
          </div>
        </div>

        {/* Parties strip */}
        <div className="parties-strip">
          <div className="party-card">
            <div className="party-label">Tenant</div>
            <div className="party-name">{lease.tenant.displayName}</div>
            <div className="party-sub">{lease.tenant.email}</div>
          </div>
          <ChevronRight size={16} className="party-arrow"/>
          <div className="party-card">
            <div className="party-label">Unit</div>
            <div className="party-name">{lease.unit.unitNumber}</div>
            <div className="party-sub">{lease.unit.unitType?.replace(/_/g,' ')}</div>
          </div>
          <ChevronRight size={16} className="party-arrow"/>
          <div className="party-card">
            <div className="party-label">Property</div>
            <div className="party-name">{lease.property.name}</div>
          </div>
        </div>
      </div>

      {/* Key metrics bar */}
      <div className="ld-metrics">
        <Metric label="Rent"     value={`${lease.property.currency} ${Number(lease.rentAmount).toLocaleString()}`} sub={lease.billingCycle} />
        <Metric label="Deposit"  value={`${lease.property.currency} ${Number(lease.securityDeposit).toLocaleString()}`} sub={lease.depositPaid ? '✓ Paid' : 'Unpaid'} highlight={!lease.depositPaid} />
        <Metric label="Start"    value={new Date(lease.startDate).toLocaleDateString()} />
        <Metric label="End"      value={new Date(lease.endDate).toLocaleDateString()} sub={`${lease.leaseTermMonths}mo term`} />
        <Metric label="E-Sign"   value={lease.esignStatus.replace(/_/g,' ')} sub="status" />
      </div>

      {/* Tabs */}
      <div className="ld-tabs">
        {(['overview','terms','amendments','esign'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'amendments' && lease.amendments.length > 0 && <span className="tab-cnt">{lease.amendments.length}</span>}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'overview'    && <OverviewTab lease={lease} />}
      {tab === 'terms'       && <TermsTab lease={lease} />}
      {tab === 'amendments'  && <AmendmentsTab leaseId={id!} lease={lease} onAddAmendment={() => setShowAmendModal(true)} />}
      {tab === 'esign'       && <ESignTab leaseId={id!} lease={lease} onSend={() => setShowEsignModal(true)} />}

      {/* Modals */}
      {showTerminateModal && <TerminateModal leaseId={id!} rentAmount={Number(lease.rentAmount)} endDate={lease.endDate} currency={lease.property.currency} onClose={() => setShowTerminateModal(false)} />}
      {showRenewalModal   && <RenewalModal   leaseId={id!} lease={lease} onClose={() => setShowRenewalModal(false)} />}
      {showAmendModal     && <AmendModal     leaseId={id!} onClose={() => setShowAmendModal(false)} />}
      {showEsignModal     && <EsignSendModal leaseId={id!} tenantEmail={lease.tenant.email || ''} tenantName={lease.tenant.displayName} onClose={() => setShowEsignModal(false)} />}
    </div>
  );
}

function Metric({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={highlight ? { color: '#e74c3c' } : {}}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────
function OverviewTab({ lease }: { lease: LeaseDetail }) {
  return (
    <div className="tab-panel">
      <div className="info-grid">
        <InfoCard title="Dates">
          <InfoRow label="Start Date"    value={new Date(lease.startDate).toLocaleDateString()} />
          <InfoRow label="End Date"      value={new Date(lease.endDate).toLocaleDateString()} />
          {lease.handoverDate && <InfoRow label="Handover"   value={new Date(lease.handoverDate).toLocaleDateString()} />}
          <InfoRow label="Term"          value={`${lease.leaseTermMonths} months`} />
          {lease.activatedAt && <InfoRow label="Activated"   value={new Date(lease.activatedAt).toLocaleString()} />}
          {lease.approvedAt  && <InfoRow label="Approved"    value={new Date(lease.approvedAt).toLocaleString()} />}
        </InfoCard>

        <InfoCard title="Billing">
          <InfoRow label="Billing Cycle" value={lease.billingCycle.replace(/_/g,' ')} />
          <InfoRow label="Billing Day"   value={`Day ${lease.billingDay} of month`} />
          <InfoRow label="Payment Due"   value={`${lease.paymentDueDays} days after invoice`} />
        </InfoCard>

        {lease.parentLease && (
          <InfoCard title="Renewal Chain">
            <InfoRow label="Parent Lease" value={lease.parentLease.leaseNumber} />
            <InfoRow label="Status"       value={lease.parentLease.status} />
          </InfoCard>
        )}

        {lease.terminationDate && (
          <InfoCard title="Termination">
            <InfoRow label="Date"   value={new Date(lease.terminationDate).toLocaleDateString()} />
            <InfoRow label="Type"   value={lease.terminationType || '—'} />
            <InfoRow label="Reason" value={lease.terminationReason || '—'} />
            {lease.earlyTerminationPenalty && <InfoRow label="Penalty" value={`${Number(lease.earlyTerminationPenalty).toLocaleString()}`} />}
          </InfoCard>
        )}
      </div>

      {lease.specialConditions && (
        <div className="special-conditions">
          <div className="sc-label">Special Conditions</div>
          <p>{lease.specialConditions}</p>
        </div>
      )}

      {(lease.clauses as any[]).length > 0 && (
        <div className="clauses-list">
          <div className="sc-label">Clauses ({(lease.clauses as any[]).length})</div>
          {(lease.clauses as any[]).map((c: any, i: number) => (
            <div key={i} className="clause-card">
              <strong>{c.title}</strong>
              <p>{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="info-card"><h4>{title}</h4>{children}</div>;
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="info-row"><span className="ir-label">{label}</span><span className="ir-value">{value}</span></div>;
}

// ── Terms Tab ─────────────────────────────────
function TermsTab({ lease }: { lease: LeaseDetail }) {
  return (
    <div className="tab-panel">
      <InfoCard title="Escalation">
        {lease.escalationType ? (
          <>
            <InfoRow label="Type"      value={lease.escalationType.replace(/_/g,' ')} />
            <InfoRow label="Value"     value={lease.escalationType === 'fixed_percent' ? `${lease.escalationValue}%` : `${lease.property.currency} ${lease.escalationValue}`} />
            <InfoRow label="Frequency" value={lease.escalationFrequency || '—'} />
            {lease.escalationMonth && <InfoRow label="Month" value={String(lease.escalationMonth)} />}
          </>
        ) : <div className="empty-sm">No escalation configured</div>}
      </InfoCard>

      {lease.escalationSchedule.length > 0 && (
        <div className="escalation-table-wrap">
          <div className="et-label">Escalation Schedule</div>
          <table className="escalation-table">
            <thead><tr><th>Effective Date</th><th>New Rent</th><th>Applied</th></tr></thead>
            <tbody>
              {lease.escalationSchedule.map((e: EscalationEntry) => (
                <tr key={e.id} className={e.applied ? 'applied' : ''}>
                  <td>{new Date(e.effectiveDate).toLocaleDateString()}</td>
                  <td>{lease.property.currency} {Number(e.newRent).toLocaleString()}</td>
                  <td>{e.applied ? <span className="applied-badge">✓ Applied</span> : <span className="pending-badge">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Amendments Tab ────────────────────────────
function AmendmentsTab({ leaseId, lease, onAddAmendment }: { leaseId: string; lease: LeaseDetail; onAddAmendment: () => void }) {
  const [approveAmendment] = useApproveAmendmentMutation();

  const handleApprove = async (amendmentId: string) => {
    try { await approveAmendment({ leaseId, amendmentId }).unwrap(); toast.success('Amendment approved'); }
    catch { toast.error('Approve failed'); }
  };

  return (
    <div className="tab-panel">
      {lease.status === 'active' && (
        <div className="tab-toolbar">
          <button className="btn-add-amendment" onClick={onAddAmendment}><Plus size={13}/> Add Amendment</button>
        </div>
      )}
      {lease.amendments.length === 0 ? (
        <div className="empty-state"><PenLine size={36}/><p>No amendments yet</p></div>
      ) : (
        lease.amendments.map((a: LeaseAmendment) => (
          <div key={a.id} className={`amendment-card ${a.status}`}>
            <div className="ac-header">
              <div className="ac-num">Amendment #{a.amendmentNumber}</div>
              <span className={`amend-status ${a.status}`}>{a.status.replace(/_/g,' ')}</span>
            </div>
            <div className="ac-type">{a.amendmentType.replace(/_/g,' ')}</div>
            <div className="ac-desc">{a.description}</div>
            <div className="ac-meta">
              Effective: {new Date(a.effectiveDate).toLocaleDateString()}
              {a.newRentAmount && ` · New rent: ${Number(a.newRentAmount).toLocaleString()}`}
              {a.newEndDate    && ` · New end: ${new Date(a.newEndDate).toLocaleDateString()}`}
            </div>
            {a.status === 'pending_approval' && (
              <button className="btn-approve-amendment" onClick={() => handleApprove(a.id)}>Approve Amendment</button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── ESign Tab ─────────────────────────────────
function ESignTab({ leaseId, lease, onSend }: { leaseId: string; lease: LeaseDetail; onSend: () => void }) {
  const { data: esignData } = useGetEsignStatusQuery(leaseId);

  const ESIGN_COLOR: Record<string, string> = {
    not_started: '#95a5a6', sent: '#f39c12', partial: '#e67e22',
    completed: '#2ecc71', voided: '#e74c3c',
  };

  return (
    <div className="tab-panel">
      <div className="esign-overview">
        <div className="esign-status-lg" style={{ color: ESIGN_COLOR[lease.esignStatus] || '#95a5a6' }}>
          {lease.esignStatus.replace(/_/g,' ')}
        </div>
        {lease.esignStatus !== 'completed' && (
          <button className="btn-send-esign" onClick={onSend}><Send size={14}/> Send for Signing</button>
        )}
      </div>

      {(esignData?.data?.recipients || lease.esignRecipients).map((r: any) => (
        <div key={r.id} className="recipient-row">
          <div className="rr-left">
            <div className="rr-name">{r.name} <span className="rr-type">({r.recipientType})</span></div>
            <div className="rr-email">{r.email}</div>
          </div>
          <span className={`rr-status ${r.status}`}>{r.status}</span>
          {r.signedAt && <div className="rr-date">{new Date(r.signedAt).toLocaleString()}</div>}
        </div>
      ))}

      {lease.esignRecipients.length === 0 && lease.esignStatus === 'not_started' && (
        <div className="empty-state"><FileText size={36}/><p>No signing requests sent yet</p></div>
      )}
    </div>
  );
}

// ── Terminate Modal ───────────────────────────
function TerminateModal({ leaseId, rentAmount, endDate, currency, onClose }: {
  leaseId: string; rentAmount: number; endDate: string; currency: string; onClose: () => void;
}) {
  const [terminationDate, setTermDate] = useState('');
  const [reason, setReason] = useState('');
  const [terminate, { isLoading }] = useTerminateLeaseMutation();

  const isEarly   = terminationDate && terminationDate < endDate.split('T')[0];
  const remaining = terminationDate ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(terminationDate).getTime()) / (30.44 * 86400000))) : 0;
  const penalty   = isEarly ? Math.min(rentAmount * 3, rentAmount * remaining * 0.5) : 0;

  const handleSubmit = async () => {
    if (!terminationDate || !reason) { toast.error('All fields required'); return; }
    try {
      const result = await terminate({ id: leaseId, terminationDate, reason }).unwrap();
      toast.success(`Lease terminated${result.data.earlyTerminationPenalty ? ` · Penalty: ${currency} ${result.data.earlyTerminationPenalty}` : ''}`);
      onClose();
    } catch (e: any) { toast.error(e?.data?.message || 'Failed'); }
  };

  return (
    <Modal title="Terminate Lease" onClose={onClose}>
      <div className="modal-body">
        <div className="form-field">
          <label>Termination Date *</label>
          <input type="date" value={terminationDate} onChange={(e) => setTermDate(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Reason *</label>
          <textarea rows={3} placeholder="Reason for termination…" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {isEarly && penalty > 0 && (
          <div className="penalty-box">
            <AlertTriangle size={14}/> Early termination penalty: <strong>{currency} {penalty.toLocaleString()}</strong>
            <div className="penalty-calc">min(3 months rent, {remaining} remaining months × 50%)</div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Confirm Terminate'}</button>
      </div>
    </Modal>
  );
}

// ── Renewal Modal ─────────────────────────────
function RenewalModal({ leaseId, lease, onClose }: { leaseId: string; lease: LeaseDetail; onClose: () => void }) {
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [rentAmount, setRent]     = useState('');
  const [createRenewal, { isLoading }] = useCreateRenewalMutation();

  const handleSubmit = async () => {
    if (!startDate || !endDate) { toast.error('Dates required'); return; }
    try {
      const r = await createRenewal({ id: leaseId, startDate, endDate, rentAmount: rentAmount ? Number(rentAmount) : undefined }).unwrap();
      toast.success(`Renewal lease ${r.data.leaseNumber} created (draft)`);
      onClose();
    } catch (e: any) { toast.error(e?.data?.message || 'Failed'); }
  };

  return (
    <Modal title="Create Renewal Offer" onClose={onClose}>
      <div className="modal-body">
        <div className="form-field"><label>New Start Date *</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="form-field"><label>New End Date *</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div className="form-field"><label>New Rent (optional, current: {lease.property.currency} {Number(lease.rentAmount).toLocaleString()})</label><input type="number" value={rentAmount} onChange={(e) => setRent(e.target.value)} /></div>
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary-sm" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Create Renewal'}</button>
      </div>
    </Modal>
  );
}

// ── Amendment Modal ───────────────────────────
function AmendModal({ leaseId, onClose }: { leaseId: string; onClose: () => void }) {
  const [form, setForm] = useState({ amendmentType: 'rent_revision', description: '', effectiveDate: '', newRentAmount: '', newEndDate: '' });
  const [create, { isLoading }] = useCreateAmendmentMutation();

  const handleSubmit = async () => {
    if (!form.description || !form.effectiveDate) { toast.error('Description and effective date required'); return; }
    try {
      await create({ leaseId, ...form, newRentAmount: form.newRentAmount ? Number(form.newRentAmount) : undefined, newEndDate: form.newEndDate || undefined }).unwrap();
      toast.success('Amendment created');
      onClose();
    } catch (e: any) { toast.error(e?.data?.message || 'Failed'); }
  };

  return (
    <Modal title="Add Amendment" onClose={onClose}>
      <div className="modal-body">
        <div className="form-field">
          <label>Type</label>
          <select value={form.amendmentType} onChange={(e) => setForm({ ...form, amendmentType: e.target.value })}>
            <option value="rent_revision">Rent Revision</option>
            <option value="term_extension">Term Extension</option>
            <option value="unit_change">Unit Change</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="form-field"><label>Description *</label><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="form-field"><label>Effective Date *</label><input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
        {form.amendmentType === 'rent_revision' && <div className="form-field"><label>New Rent Amount</label><input type="number" value={form.newRentAmount} onChange={(e) => setForm({ ...form, newRentAmount: e.target.value })} /></div>}
        {form.amendmentType === 'term_extension' && <div className="form-field"><label>New End Date</label><input type="date" value={form.newEndDate} onChange={(e) => setForm({ ...form, newEndDate: e.target.value })} /></div>}
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary-sm" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Create Amendment'}</button>
      </div>
    </Modal>
  );
}

// ── ESign Send Modal ──────────────────────────
function EsignSendModal({ leaseId, tenantEmail, tenantName, onClose }: { leaseId: string; tenantEmail: string; tenantName: string; onClose: () => void }) {
  const [recipients, setRecipients] = useState([
    { recipientType: 'tenant',   name: tenantName,   email: tenantEmail },
    { recipientType: 'landlord', name: '', email: '' },
  ]);
  const [send, { isLoading }] = useSendForSigningMutation();

  const handleSend = async () => {
    const valid = recipients.filter((r) => r.name && r.email);
    if (valid.length < 1) { toast.error('At least one recipient required'); return; }
    try {
      await send({ id: leaseId, recipients: valid }).unwrap();
      toast.success('Signing requests sent');
      onClose();
    } catch (e: any) { toast.error(e?.data?.message || 'Failed'); }
  };

  return (
    <Modal title="Send for E-Signature" onClose={onClose}>
      <div className="modal-body">
        {recipients.map((r, i) => (
          <div key={i} className="recipient-form-row">
            <div className="rf-type">{r.recipientType}</div>
            <input placeholder="Name" value={r.name} onChange={(e) => setRecipients(rr => rr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input type="email" placeholder="Email" value={r.email} onChange={(e) => setRecipients(rr => rr.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary-sm" onClick={handleSend} disabled={isLoading}>{isLoading ? '…' : 'Send'}</button>
      </div>
    </Modal>
  );
}

// ── Shared Modal wrapper ──────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button onClick={onClose}><X size={18}/></button></div>
        {children}
      </div>
    </div>
  );
}
