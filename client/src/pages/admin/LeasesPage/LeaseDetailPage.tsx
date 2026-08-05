import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetLeaseQuery, useSubmitLeaseMutation, useActivateLeaseMutation,
  useCancelLeaseMutation, useUpdateLeaseMutation,
} from '../../../store/api/leasesApi';
import {
  ArrowLeft, CheckCircle, XCircle, PenLine, AlertTriangle,
  Send, RefreshCw, Scissors, ChevronRight, Edit2, Save, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './LeaseDetailPage.css';

// Tabs
import { OverviewTab } from './LeaseDetailPage/components/tabs/OverviewTab';
import { TermsTab } from './LeaseDetailPage/components/tabs/TermsTab';
import { AmendmentsTab } from './LeaseDetailPage/components/tabs/AmendmentsTab';
import { ESignTab } from './LeaseDetailPage/components/tabs/ESignTab';
import { DocumentsTab } from './LeaseDetailPage/components/tabs/DocumentsTab';
import { HistoryTab } from './LeaseDetailPage/components/tabs/HistoryTab';

// Modals
import { TerminateModal } from './LeaseDetailPage/components/modals/TerminateModal';
import { RenewalModal } from './LeaseDetailPage/components/modals/RenewalModal';
import { AmendModal } from './LeaseDetailPage/components/modals/AmendModal';
import { EsignSendModal } from './LeaseDetailPage/components/modals/EsignSendModal';

type Tab = 'overview' | 'terms' | 'amendments' | 'esign' | 'documents' | 'history';

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
  const [showEditDraft,      setShowEditDraft]        = useState(false);

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
            {isDraft  && <button className="btn-action-edit" onClick={() => setShowEditDraft(true)}><Edit2 size={14}/> Edit</button>}
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
        {(['overview','terms','amendments','esign','documents','history'] as Tab[]).map((t) => (
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
      {tab === 'documents'   && <DocumentsTab lease={lease} />}
      {tab === 'history'     && <HistoryTab lease={lease} />}

      {/* Modals */}
      {showTerminateModal && <TerminateModal leaseId={id!} rentAmount={Number(lease.rentAmount)} endDate={lease.endDate} currency={lease.property.currency} onClose={() => setShowTerminateModal(false)} />}
      {showRenewalModal   && <RenewalModal   leaseId={id!} lease={lease} onClose={() => setShowRenewalModal(false)} />}
      {showAmendModal     && <AmendModal     leaseId={id!} onClose={() => setShowAmendModal(false)} />}
      {showEsignModal     && <EsignSendModal leaseId={id!} tenantEmail={lease.tenant.email || ''} tenantName={lease.tenant.displayName} onClose={() => setShowEsignModal(false)} />}
      {showEditDraft       && <EditDraftModal lease={lease} onClose={() => setShowEditDraft(false)} />}
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

// ── Edit Draft Modal ────────────────────────
function EditDraftModal({ lease, onClose }: { lease: import('../../../store/api/leasesApi').LeaseDetail; onClose: () => void }) {
  const [update, { isLoading }] = useUpdateLeaseMutation();
  const [form, setForm] = useState({
    rentAmount: Number(lease.rentAmount),
    billingCycle: lease.billingCycle,
    billingDay: lease.billingDay,
    paymentDueDays: lease.paymentDueDays,
    securityDeposit: Number(lease.securityDeposit),
    startDate: lease.startDate.split('T')[0],
    endDate: lease.endDate.split('T')[0],
    handoverDate: lease.handoverDate?.split('T')[0] || '',
    escalationType: lease.escalationType || '',
    escalationValue: lease.escalationValue ? Number(lease.escalationValue) : '',
    escalationFrequency: lease.escalationFrequency || 'annual',
    notes: lease.notes || '',
    specialConditions: lease.specialConditions || '',
  });

  const set = (key: string, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    try {
      await update({
        id: lease.id,
        data: {
          ...form,
          rentAmount: Number(form.rentAmount),
          securityDeposit: Number(form.securityDeposit),
          escalationValue: form.escalationValue ? Number(form.escalationValue) : null,
          escalationType: form.escalationType || null,
          handoverDate: form.handoverDate || null,
          notes: form.notes || null,
          specialConditions: form.specialConditions || null,
        },
      }).unwrap();
      toast.success('Draft updated');
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || 'Update failed');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Edit Draft Lease</h3><button onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body edit-draft-form">
          <div className="edf-section">
            <h4>Dates</h4>
            <div className="edf-row">
              <label>Start Date<input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
              <label>End Date<input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>
              <label>Handover<input type="date" value={form.handoverDate} onChange={(e) => set('handoverDate', e.target.value)} /></label>
            </div>
          </div>
          <div className="edf-section">
            <h4>Financial</h4>
            <div className="edf-row">
              <label>Rent Amount<input type="number" value={form.rentAmount} onChange={(e) => set('rentAmount', e.target.value)} /></label>
              <label>Security Deposit<input type="number" value={form.securityDeposit} onChange={(e) => set('securityDeposit', e.target.value)} /></label>
            </div>
            <div className="edf-row">
              <label>Billing Cycle
                <select value={form.billingCycle} onChange={(e) => set('billingCycle', e.target.value)}>
                  {['monthly','quarterly','semi_annual','annual'].map((c) => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
                </select>
              </label>
              <label>Billing Day<input type="number" min={1} max={28} value={form.billingDay} onChange={(e) => set('billingDay', Number(e.target.value))} /></label>
              <label>Payment Due Days<input type="number" min={1} max={30} value={form.paymentDueDays} onChange={(e) => set('paymentDueDays', Number(e.target.value))} /></label>
            </div>
          </div>
          <div className="edf-section">
            <h4>Escalation</h4>
            <div className="edf-row">
              <label>Type
                <select value={form.escalationType} onChange={(e) => set('escalationType', e.target.value)}>
                  <option value="">None</option>
                  {['fixed_percent','fixed_amount','cpi','stepped'].map((t) => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                </select>
              </label>
              {form.escalationType && (
                <label>Value<input type="number" value={form.escalationValue} onChange={(e) => set('escalationValue', e.target.value)} /></label>
              )}
              {form.escalationType && (
                <label>Frequency
                  <select value={form.escalationFrequency} onChange={(e) => set('escalationFrequency', e.target.value)}>
                    <option value="annual">Annual</option>
                    <option value="biennial">Biennial</option>
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="edf-section">
            <h4>Notes</h4>
            <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Internal notes…" />
            <textarea rows={3} value={form.specialConditions} onChange={(e) => set('specialConditions', e.target.value)} placeholder="Special conditions…" style={{ marginTop: 8 }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={isLoading}><Save size={14}/> {isLoading ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}
