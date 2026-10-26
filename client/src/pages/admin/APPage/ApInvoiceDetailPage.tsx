import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetApInvoiceQuery, useApproveApInvoiceMutation, useRejectApInvoiceMutation,
} from '../../../store/api/apApi';
import {
  ArrowLeft, FileText, CheckCircle, XCircle, Building2,
  User, DollarSign, AlertTriangle, Link2, X,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import './APPage.css';

import { formatCompactAmount as fmt } from '../../../utils/formatCurrency';

export default function ApInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: res, isLoading } = useGetApInvoiceQuery(id!);
  const [approveApInvoice, { isLoading: approving }] = useApproveApInvoiceMutation();
  const [rejectApInvoice, { isLoading: rejecting }] = useRejectApInvoiceMutation();

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [hasAttemptedReject, setHasAttemptedReject] = useState(false);

  const inv = res?.data;

  const handleApprove = async () => {
    try { await approveApInvoice(id!).unwrap(); toast.success('AP Invoice approved'); } catch { toast.error('Approval failed'); }
  };

  const handleReject = async () => {
    setHasAttemptedReject(true);
    if (!rejectReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }
    try {
      await rejectApInvoice({ id: id!, reason: rejectReason }).unwrap();
      toast.success('AP Invoice rejected');
      setShowReject(false);
      setHasAttemptedReject(false);
    } catch { toast.error('Rejection failed'); }
  };

  if (isLoading) return <div className="ap-page" style={{ padding: '3rem', textAlign: 'center' }}>Loading...</div>;
  if (!inv) return <div className="ap-page"><div className="ap-empty"><FileText size={40} /><p>AP Invoice not found</p></div></div>;

  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
  const isOverdue = new Date(inv.dueDate) < new Date() && !['paid', 'void', 'rejected'].includes(inv.status);
  const creatorName = inv.creator?.profile ? `${inv.creator.profile.firstName} ${inv.creator.profile.lastName}` : inv.creator?.email || '—';
  const approverName = inv.approver?.profile ? `${inv.approver.profile.firstName} ${inv.approver.profile.lastName}` : inv.approver?.email || null;

  return (
    <div className="ap-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <button className="ap-btn icon-only ghost" onClick={() => navigate('/admin/ap/invoices')} title="Back to AP Invoices">
            <ArrowLeft size={18} />
          </button>
          <div className="page-icon-lg">
            <FileText size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1>{inv.apInvoiceNumber}</h1>
              <span className={`ap-status ${inv.status}`}>{inv.status}</span>
              {isOverdue && <span className="ap-status" style={{ background: 'rgba(239, 68, 68, 0.14)', color: '#f87171' }}>Overdue</span>}
            </div>
            <p>{inv.vendorName}</p>
          </div>
        </div>
        {inv.status === 'pending' && (
          <PermissionGuard permission="ap-invoices.write">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ap-btn success" onClick={handleApprove} disabled={approving}>
                <CheckCircle size={16} /> {approving ? 'Approving...' : 'Approve'}
              </button>
              <button className="ap-btn danger" onClick={() => { setHasAttemptedReject(false); setRejectReason(''); setShowReject(true); }} disabled={rejecting}>
                <XCircle size={16} /> Reject
              </button>
            </div>
          </PermissionGuard>
        )}
      </div>

      {/* Detail grid */}
      <div className="ap-detail-grid">
        {/* Invoice Info */}
        <div className="ap-detail-card">
          <h3><FileText size={16} /> Invoice Information</h3>
          <div className="field-row"><span className="label">Vendor Invoice No.</span><span className="val">{inv.vendorInvoiceNo || '—'}</span></div>
          <div className="field-row"><span className="label">Invoice Date</span><span className="val">{format(new Date(inv.invoiceDate), 'dd MMM yyyy')}</span></div>
          <div className="field-row"><span className="label">Due Date</span><span className="val">{format(new Date(inv.dueDate), 'dd MMM yyyy')}</span></div>
          <div className="field-row"><span className="label">PO Reference</span><span className="val">{inv.poReference || '—'}</span></div>
          <div className="field-row"><span className="label">Cost Center</span><span className="val">{inv.costCenter || '—'}</span></div>
          {inv.description && <div className="field-row"><span className="label">Description</span><span className="val">{inv.description}</span></div>}
        </div>

        {/* Amounts */}
        <div className="ap-detail-card">
          <h3><DollarSign size={16} /> Amounts ({inv.currency})</h3>
          <div className="field-row"><span className="label">Subtotal</span><span className="val">{fmt(inv.subtotal)}</span></div>
          <div className="field-row"><span className="label">Tax</span><span className="val">{fmt(inv.taxAmount)}</span></div>
          <div className="field-row"><span className="label">Total</span><span className="val" style={{ fontSize: '1.125rem' }}>{fmt(inv.totalAmount)}</span></div>
          <div className="field-row"><span className="label">Paid</span><span className="val amount-positive">{fmt(inv.paidAmount)}</span></div>
          <div className="field-row"><span className="label">Outstanding</span><span className="val" style={{ color: outstanding > 0 ? '#dc2626' : '#059669' }}>{fmt(outstanding)}</span></div>
        </div>

        {/* Property & Department */}
        <div className="ap-detail-card">
          <h3><Building2 size={16} /> Allocation</h3>
          <div className="field-row"><span className="label">Property</span><span className="val">{inv.property?.name || 'All Properties'}</span></div>
          <div className="field-row"><span className="label">Department</span><span className="val">{inv.department?.name || '—'}</span></div>
          <div className="field-row"><span className="label">Created By</span><span className="val">{creatorName}</span></div>
          <div className="field-row"><span className="label">Created At</span><span className="val">{format(new Date(inv.createdAt), 'dd MMM yyyy HH:mm')}</span></div>
        </div>

        {/* Approval */}
        <div className="ap-detail-card">
          <h3><User size={16} /> Approval</h3>
          <div className="field-row"><span className="label">Status</span><span className={`ap-status ${inv.status}`}>{inv.status}</span></div>
          {approverName && <div className="field-row"><span className="label">Approved By</span><span className="val">{approverName}</span></div>}
          {inv.approvedAt && <div className="field-row"><span className="label">Approved At</span><span className="val">{format(new Date(inv.approvedAt), 'dd MMM yyyy HH:mm')}</span></div>}
          {inv.rejectionReason && <div className="field-row"><span className="label">Rejection Reason</span><span className="val" style={{ color: '#dc2626' }}>{inv.rejectionReason}</span></div>}
        </div>
      </div>

      {/* Line Items */}
      <div className="ap-table-wrap" style={{ marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem 1rem 0.5rem', fontWeight: 700 }}>Line Items</div>
        <TableScrollWrapper>
          <table className="ap-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Charge Type</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((line: any, idx: number) => (
                <tr key={line.id}>
                  <td>{idx + 1}</td>
                  <td>{line.description}</td>
                  <td>{line.chargeType?.name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{Number(line.quantity)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(line.unitPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(line.amount)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(line.taxAmount)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={5}></td>
                <td style={{ textAlign: 'right' }}>{fmt(inv.subtotal)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(inv.taxAmount)}</td>
                <td style={{ textAlign: 'right', fontSize: '1rem' }}>{fmt(inv.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </TableScrollWrapper>
      </div>

      {/* Linked Vouchers */}
      {inv.pvAllocations && inv.pvAllocations.length > 0 && (
        <div className="ap-table-wrap">
          <div style={{ padding: '1rem 1rem 0.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={16} /> Linked Payment Vouchers
          </div>
          <TableScrollWrapper>
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Voucher No.</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid At</th>
                </tr>
              </thead>
              <tbody>
                {inv.pvAllocations.map((alloc: any) => (
                  <tr key={alloc.id}>
                    <td><strong>{alloc.voucher.voucherNumber}</strong></td>
                    <td>{fmt(alloc.amount)}</td>
                    <td><span className={`ap-status ${alloc.voucher.status}`}>{alloc.voucher.status}</span></td>
                    <td>{alloc.voucher.paidAt ? format(new Date(alloc.voucher.paidAt), 'dd MMM yyyy HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollWrapper>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="ap-modal-header">
              <h2><AlertTriangle size={18} /> Reject AP Invoice</h2>
              <button className="ap-btn icon-only ghost" onClick={() => { setShowReject(false); setHasAttemptedReject(false); }}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-group">
                <label>Rejection Reason <span className="req">*</span></label>
                <textarea
                  className={hasAttemptedReject && !rejectReason.trim() ? 'ap-input-error' : ''}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Enter reason..."
                />
                {hasAttemptedReject && !rejectReason.trim() && (
                  <span className="ap-error-text">Rejection reason is required</span>
                )}
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => { setShowReject(false); setHasAttemptedReject(false); }}>Cancel</button>
              <button className="ap-btn danger" disabled={rejecting} onClick={handleReject}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
