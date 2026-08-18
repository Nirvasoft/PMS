import { useState, useMemo } from 'react';
import {
  useGetRefundsQuery, useCreateRefundMutation,
  useApproveRefundMutation, useRejectRefundMutation, useMarkRefundPaidMutation,
} from '../../../store/api/arApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import {
  RotateCcw, Plus, Search, ChevronLeft, ChevronRight, X,
  Check, XCircle, Banknote, Shield, AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './ARPage.css';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

type ActionType = 'approve' | 'reject' | 'mark_paid';

export default function RefundsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [actionModal, setActionModal] = useState<{ type: ActionType; refund: any } | null>(null);

  const { data, isFetching } = useGetRefundsQuery({ status: status || undefined, page, limit: 15 });
  const refunds = data?.data || [];
  const meta = data?.meta;

  const filtered = search
    ? refunds.filter(r =>
        (r.tenant?.firstName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.tenant?.lastName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.tenant?.companyName || '').toLowerCase().includes(search.toLowerCase()) ||
        r.reason.toLowerCase().includes(search.toLowerCase()))
    : refunds;

  const getTenantName = (r: any) => {
    if (!r.tenant) return '—';
    return r.tenant.tenantType === 'corporate'
      ? r.tenant.companyName || ''
      : `${r.tenant.firstName || ''} ${r.tenant.lastName || ''}`.trim();
  };

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
            <RotateCcw size={22} />
          </div>
          <div>
            <h1>Refund Requests</h1>
            <p>Manage refunds for overpayments, deposits, and adjustments</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Refund
        </button>
      </div>

      {/* Filters */}
      <div className="ar-filters">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input type="text" placeholder="Search refunds…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {['pending', 'approved', 'rejected', 'paid'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Tenant</th>
              <th style={{ width: 100 }}>Type</th>
              <th className="text-right" style={{ width: 120 }}>Amount</th>
              <th style={{ width: 200 }}>Reason</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 110 }}>Created</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="ar-empty">{isFetching ? 'Loading…' : 'No refund requests found.'}</div>
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr key={r.id}>
                  <td><span className="cell-primary">{getTenantName(r)}</span></td>
                  <td>
                    <span className={`refund-type refund-type--${r.refundType}`}>{r.refundType}</span>
                  </td>
                  <td className="text-right">
                    <span className="cell-amount">{formatCurrency(r.amount, r.currency)}</span>
                  </td>
                  <td>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reason}
                    </div>
                  </td>
                  <td>
                    <span className={`ar-status ar-status--${r.status}`}>{r.status}</span>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {format(new Date(r.createdAt), 'MMM d, yyyy')}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.status === 'pending' && (
                        <>
                          <button className="action-btn" title="Approve" onClick={() => setActionModal({ type: 'approve', refund: r })}>
                            <Check size={14} />
                          </button>
                          <button className="action-btn danger" title="Reject" onClick={() => setActionModal({ type: 'reject', refund: r })}>
                            <XCircle size={14} />
                          </button>
                        </>
                      )}
                      {r.status === 'approved' && (
                        <button className="action-btn" title="Mark Paid" onClick={() => setActionModal({ type: 'mark_paid', refund: r })}>
                          <Banknote size={14} />
                        </button>
                      )}
                      {(r.status === 'rejected' || r.status === 'paid') && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {r.status === 'paid' ? r.paymentReference || '—' : r.rejectionReason || '—'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta && meta.totalPages > 1 && (
          <div className="ar-pagination">
            <span className="page-info">Page {meta.page} of {meta.totalPages} · {meta.total} refunds</span>
            <div className="page-btns">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} /></button>
              <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && <CreateRefundModal onClose={() => setShowCreate(false)} />}
      {actionModal && (
        <RefundActionModal
          type={actionModal.type}
          refund={actionModal.refund}
          onClose={() => setActionModal(null)}
          getTenantName={getTenantName}
        />
      )}
    </div>
  );
}

// ═══════ Refund Action Modal (Approve / Reject / Mark Paid) ═══════

function RefundActionModal({
  type, refund, onClose, getTenantName,
}: {
  type: ActionType; refund: any; onClose: () => void;
  getTenantName: (r: any) => string;
}) {
  const [notes, setNotes] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [approveRefund, { isLoading: approving }] = useApproveRefundMutation();
  const [rejectRefund, { isLoading: rejecting }] = useRejectRefundMutation();
  const [markPaid, { isLoading: marking }] = useMarkRefundPaidMutation();

  const isLoading = approving || rejecting || marking;

  const config = {
    approve: {
      title: 'Approve Refund',
      icon: <Shield size={18} />,
      iconBg: 'rgba(16,185,129,0.12)',
      iconColor: '#34d399',
      confirmLabel: 'Approve Refund',
      confirmClass: 'btn-success',
      description: 'This will approve the refund request. The refund can then be marked as paid.',
      notesLabel: 'Approval Notes (optional)',
      notesPlaceholder: 'Add any notes for this approval…',
    },
    reject: {
      title: 'Reject Refund',
      icon: <AlertTriangle size={18} />,
      iconBg: 'rgba(239,68,68,0.12)',
      iconColor: '#f87171',
      confirmLabel: 'Reject Refund',
      confirmClass: 'btn-danger',
      description: 'This will reject the refund request. Please provide a reason.',
      notesLabel: 'Rejection Reason *',
      notesPlaceholder: 'Enter the reason for rejecting this refund…',
    },
    mark_paid: {
      title: 'Mark Refund as Paid',
      icon: <Banknote size={18} />,
      iconBg: 'rgba(99,102,241,0.12)',
      iconColor: '#818cf8',
      confirmLabel: 'Mark as Paid',
      confirmClass: 'btn-primary',
      description: 'Confirm that this refund has been paid out.',
      notesLabel: 'Payment Reference *',
      notesPlaceholder: 'e.g. CHK-2025-001, TRF-12345',
    },
  }[type];

  const handleSubmit = async () => {
    try {
      if (type === 'approve') {
        await approveRefund(refund.id).unwrap();
        toast.success('Refund approved successfully');
      } else if (type === 'reject') {
        if (!notes.trim()) { toast.error('Please provide a rejection reason'); return; }
        await rejectRefund({ id: refund.id, reason: notes.trim() }).unwrap();
        toast.success('Refund rejected');
      } else {
        if (!paymentRef.trim()) { toast.error('Please provide a payment reference'); return; }
        await markPaid({ id: refund.id, paymentReference: paymentRef.trim() }).unwrap();
        toast.success('Refund marked as paid');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Action failed');
    }
  };

  return (
    <div className="ar-modal-backdrop">
      <div className="ar-modal" style={{ maxWidth: 480 }}>
        <h2>
          <span className="modal-icon" style={{ background: config.iconBg, color: config.iconColor }}>
            {config.icon}
          </span>
          {config.title}
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}><X size={18} /></button>
        </h2>

        {/* Refund Summary */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px',
          marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>Tenant</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{getTenantName(refund)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>Amount</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#818cf8' }}>{formatCurrency(refund.amount, refund.currency)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>Type</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{refund.refundType}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>Reason</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{refund.reason}</div>
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          {config.description}
        </p>

        {/* Input fields */}
        <div className="ar-form-grid cols-1">
          {type === 'mark_paid' ? (
            <div className="ar-field">
              <label>{config.notesLabel}</label>
              <input type="text" placeholder={config.notesPlaceholder}
                value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div className="ar-field">
              <label>{config.notesLabel}</label>
              <textarea placeholder={config.notesPlaceholder}
                value={notes} onChange={e => setNotes(e.target.value)}
                rows={3} autoFocus={type === 'reject'}
              />
            </div>
          )}
        </div>

        <div className="ar-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className={`btn ${config.confirmClass}`} onClick={handleSubmit} disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {config.icon} {isLoading ? 'Processing…' : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════ Inline Create Refund Modal ═══════

function CreateRefundModal({ onClose }: { onClose: () => void }) {
  const [tenantId, setTenantId] = useState('');
  const [refundType, setRefundType] = useState('overpayment');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [reason, setReason] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  const { data: tenantsData } = useGetTenantsQuery({ page: 1, limit: 50 });
  const tenants = tenantsData?.data || [];
  const [createRefund, { isLoading }] = useCreateRefundMutation();

  const getTenantName = (t: any) =>
    t.tenantType === 'corporate' ? t.companyName || '' : `${t.firstName || ''} ${t.lastName || ''}`.trim();

  const handleSubmit = async () => {
    if (!tenantId || !amount || !reason) {
      toast.error('Please fill required fields');
      return;
    }
    try {
      await createRefund({
        tenantId, refundType, amount: parseFloat(amount), currency, reason,
        bankName: bankName || undefined,
        bankAccountNo: bankAccountNo || undefined,
        bankAccountName: bankAccountName || undefined,
      }).unwrap();
      toast.success('Refund request created');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="ar-modal-backdrop">
      <div className="ar-modal">
        <h2>
          <span className="modal-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
            <RotateCcw size={18} />
          </span>
          New Refund Request
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}><X size={18} /></button>
        </h2>

        <div className="ar-form-grid">
          <div className="ar-field" style={{ gridColumn: '1 / -1' }}>
            <label>Tenant <span className="req">*</span></label>
            <select value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">Select tenant…</option>
              {tenants.map((t: any) => <option key={t.id} value={t.id}>{getTenantName(t)}</option>)}
            </select>
          </div>
        </div>

        <div className="ar-form-grid cols-3">
          <div className="ar-field">
            <label>Refund Type <span className="req">*</span></label>
            <select value={refundType} onChange={e => setRefundType(e.target.value)}>
              <option value="overpayment">Overpayment</option>
              <option value="deposit">Deposit</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div className="ar-field">
            <label>Amount <span className="req">*</span></label>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="ar-field">
            <label>Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}>
              {['USD', 'SGD', 'MYR', 'MMK', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="ar-form-grid cols-1">
          <div className="ar-field">
            <label>Reason <span className="req">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for refund…" />
          </div>
        </div>

        <div className="ar-form-grid cols-3">
          <div className="ar-field">
            <label>Bank Name</label>
            <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. DBS Bank" />
          </div>
          <div className="ar-field">
            <label>Bank Account No</label>
            <input type="text" value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} placeholder="e.g. 001-123456-7" />
          </div>
          <div className="ar-field">
            <label>Account Name</label>
            <input type="text" value={bankAccountName} onChange={e => setBankAccountName(e.target.value)} placeholder="Account holder name" />
          </div>
        </div>

        <div className="ar-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
