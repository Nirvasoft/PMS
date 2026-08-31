import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetInvoiceQuery, useVoidInvoiceMutation, useLazyGetInvoicePdfQuery,
  useSendInvoiceMutation, useCreateCreditNoteMutation, useGetChargeTypesQuery,
} from '../../../store/api/billingApi';
import { ArrowLeft, FileText, Ban, CreditCard, Download, Send, Plus, Trash2, X, AlertTriangle, Clock, Banknote, History, ShieldAlert, Timer, Eye, ExternalLink } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import './BillingPage.css';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

interface CreditLine { chargeTypeId: string; description: string; quantity: number; unitPrice: number; taxRate: number; }

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useGetInvoiceQuery(id!);
  const [voidInvoice, { isLoading: voiding }] = useVoidInvoiceMutation();
  const [triggerPdf, { isFetching: loadingPdf }] = useLazyGetInvoicePdfQuery();
  const [sendInvoice, { isLoading: sending }] = useSendInvoiceMutation();
  const [createCreditNote, { isLoading: creatingCN }] = useCreateCreditNoteMutation();
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const chargeTypes = chargeTypesData?.data || [];
  const inv = data?.data;

  // Credit Note modal state
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditReason, setCreditReason] = useState('');
  const [creditLines, setCreditLines] = useState<CreditLine[]>([
    { chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0 },
  ]);

  // PDF Viewer state
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleVoid = async () => {
    const reason = prompt('Enter void reason:');
    if (!reason) return;
    await voidInvoice({ id: id!, reason }).unwrap();
  };

  const handleViewPdf = async () => {
    setPdfLoading(true);
    setShowPdfViewer(true);
    try {
      const blobUrl = await triggerPdf(id!).unwrap();
      if (blobUrl) {
        setPdfUrl(blobUrl);
      }
    } catch {
      setPdfUrl(null);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
      return;
    }
    try {
      const blobUrl = await triggerPdf(id!).unwrap();
      if (blobUrl) {
        window.open(blobUrl, '_blank');
      }
    } catch { /* error handled by RTK */ }
  };

  const closePdfViewer = useCallback(() => {
    setShowPdfViewer(false);
    setPdfUrl(null);
  }, []);

  // ESC key to close PDF viewer
  useEffect(() => {
    if (!showPdfViewer) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closePdfViewer(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showPdfViewer, closePdfViewer]);

  const handleSend = async () => {
    if (!(await confirmDialog('Send this invoice to the tenant via email?'))) return;
    try {
      const result = await sendInvoice(id!).unwrap();
      alertDialog(`Invoice sent to ${result.data.sentTo}`);
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to send invoice');
    }
  };

  const addCreditLine = () => setCreditLines([...creditLines, { chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
  const removeCreditLine = (idx: number) => setCreditLines(creditLines.filter((_, i) => i !== idx));
  const updateCreditLine = (idx: number, field: string, value: unknown) => {
    const updated = [...creditLines];
    (updated[idx] as any)[field] = value;
    if (field === 'chargeTypeId') {
      const ct = chargeTypes.find(c => c.id === value);
      if (ct && !updated[idx].description) updated[idx].description = ct.name;
      if (ct && ct.isTaxable && updated[idx].taxRate === 0) updated[idx].taxRate = Number(ct.taxRate) || 0;
    }
    setCreditLines(updated);
  };

  const handleCreateCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCreditNote({
        id: id!,
        data: {
          creditReason,
          lines: creditLines.map(l => ({
            chargeTypeId: l.chargeTypeId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
          })),
        },
      }).unwrap();
      setShowCreditModal(false);
      setCreditReason('');
      setCreditLines([{ chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to create credit note');
    }
  };

  const creditTotal = creditLines.reduce((s, l) => {
    const amt = l.quantity * l.unitPrice;
    return s + amt + amt * l.taxRate;
  }, 0);

  if (isLoading || !inv) {
    return <div className="billing-page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Loading invoice…</div>;
  }

  const tenantName = inv.tenant.tenantType === 'company'
    ? inv.tenant.companyName || ''
    : `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();

  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);

  // Penalty info
  const hasPenalty = Number(inv.penaltyAmount) > 0;
  const daysOverdue = inv.status === 'overdue' || hasPenalty
    ? Math.max(0, differenceInDays(new Date(), new Date(inv.dueDate)) - (inv.gracePeriodDays || 0))
    : 0;

  return (
    <div className="billing-page">
      {/* Back button */}
      <button className="btn btn-secondary" onClick={() => navigate('/admin/billing/invoices')} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={14} /> Back to Invoices
      </button>

      {/* Header */}
      <div className="invoice-detail-header">
        <div className="inv-number">
          <FileText size={28} />
          {inv.invoiceNumber}
          <span className={`inv-status inv-status--${inv.status}`}>{inv.status.replace('_', ' ')}</span>
          {inv.invoiceType !== 'invoice' && (
            <span className={`inv-type inv-type--${inv.invoiceType}`}>{inv.invoiceType.replace('_', ' ')}</span>
          )}
        </div>
        <div className="inv-actions">
          <button className="btn btn-primary" onClick={handleViewPdf} disabled={loadingPdf}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Eye size={14} /> {loadingPdf ? 'Loading…' : 'View PDF'}
          </button>
          <button className="btn btn-secondary" onClick={handleDownloadPdf}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Download
          </button>
          {['draft', 'issued'].includes(inv.status) && (
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={14} /> {sending ? 'Sending…' : 'Send'}
            </button>
          )}
          {/* Credit Note button */}
          {['issued', 'sent', 'partially_paid', 'paid', 'overdue'].includes(inv.status) && inv.invoiceType === 'invoice' && (
            <button className="btn btn-secondary" onClick={() => setShowCreditModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
              <CreditCard size={14} /> Credit Note
            </button>
          )}
          {['draft', 'issued', 'sent'].includes(inv.status) && (
            <button className="btn btn-secondary" onClick={handleVoid} disabled={voiding}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
              <Ban size={14} /> Void
            </button>
          )}
        </div>
      </div>

      {/* Meta Grid */}
      <div className="invoice-meta-grid">
        <div className="invoice-meta-item">
          <div className="imi-label">Tenant</div>
          <div className="imi-value">{tenantName}</div>
        </div>
        <div className="invoice-meta-item">
          <div className="imi-label">Property</div>
          <div className="imi-value">{inv.property?.name}{inv.unit ? ` — Unit ${inv.unit.unitNumber}` : ''}</div>
        </div>
        <div className="invoice-meta-item">
          <div className="imi-label">Invoice Date</div>
          <div className="imi-value">{format(new Date(inv.invoiceDate), 'MMM d, yyyy')}</div>
        </div>
        <div className="invoice-meta-item">
          <div className="imi-label">Due Date</div>
          <div className="imi-value">{format(new Date(inv.dueDate), 'MMM d, yyyy')}</div>
        </div>
        {inv.periodFrom && inv.periodTo && (
          <div className="invoice-meta-item">
            <div className="imi-label">Billing Period</div>
            <div className="imi-value">{format(new Date(inv.periodFrom), 'MMM d')} — {format(new Date(inv.periodTo), 'MMM d, yyyy')}</div>
          </div>
        )}
        {inv.notes && (
          <div className="invoice-meta-item" style={{ gridColumn: 'span 2' }}>
            <div className="imi-label">Notes</div>
            <div className="imi-value">{inv.notes}</div>
          </div>
        )}
      </div>

      {/* Penalty Info */}
      {(hasPenalty || inv.status === 'overdue') && (
        <div className="card" style={{ marginBottom: 20, padding: 20, borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.12)' }}>
              <ShieldAlert size={18} style={{ color: '#f87171' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f87171', margin: 0 }}>
                {hasPenalty ? 'Late Payment Penalty Applied' : 'Invoice Overdue'}
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                {hasPenalty ? 'A penalty has been automatically applied to this invoice.' : 'This invoice has passed its due date.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            {hasPenalty && (
              <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Penalty Amount</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{formatCurrency(inv.penaltyAmount, inv.currency)}</div>
              </div>
            )}
            {daysOverdue > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Days Overdue</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Timer size={16} /> {daysOverdue}
                </div>
                {/* Overdue progress bar */}
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'rgba(245,158,11,0.15)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: daysOverdue > 30 ? '#ef4444' : daysOverdue > 14 ? '#f59e0b' : '#fbbf24', width: `${Math.min(100, (daysOverdue / 60) * 100)}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}
            {inv.gracePeriodDays > 0 && (
              <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Grace Period</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{inv.gracePeriodDays} <span style={{ fontSize: 12, fontWeight: 400 }}>days</span></div>
              </div>
            )}
            {inv.penaltyAppliedAt && (
              <div style={{ background: 'rgba(139,92,246,0.06)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Applied At</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#8b5cf6' }}>
                  {format(new Date(inv.penaltyAppliedAt), 'MMM d, yyyy')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {format(new Date(inv.penaltyAppliedAt), 'HH:mm')}
                </div>
              </div>
            )}
          </div>

          {/* Penalty Breakdown */}
          {hasPenalty && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.03)', borderRadius: 8, border: '1px dashed rgba(239,68,68,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>Original Total</span>
                <span>{formatCurrency(Number(inv.totalAmount) - Number(inv.penaltyAmount), inv.currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 4 }}>
                <span>+ Late Penalty</span>
                <span>{formatCurrency(inv.penaltyAmount, inv.currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(239,68,68,0.1)' }}>
                <span>Revised Total</span>
                <span>{formatCurrency(inv.totalAmount, inv.currency)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Line Items */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: 14 }}>
          Line Items
        </div>
        <table className="line-items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Charge Type</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit Price</th>
              <th className="text-right">Tax</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map(line => (
              <tr key={line.id}>
                <td style={{ fontWeight: 500 }}>{line.description}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{line.chargeType.name}</td>
                <td className="text-right">{Number(line.quantity)}</td>
                <td className="text-right">{formatCurrency(line.unitPrice, inv.currency)}</td>
                <td className="text-right" style={{ color: 'var(--text-tertiary)' }}>
                  {Number(line.taxRate) > 0 ? `${(Number(line.taxRate) * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(line.lineTotal, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="invoice-totals-panel">
        <div className="invoice-total-row">
          <span className="label">Subtotal</span>
          <span className="amount">{formatCurrency(inv.subtotal, inv.currency)}</span>
        </div>
        {Number(inv.taxAmount) > 0 && (
          <div className="invoice-total-row">
            <span className="label">Tax</span>
            <span className="amount">{formatCurrency(inv.taxAmount, inv.currency)}</span>
          </div>
        )}
        {Number(inv.penaltyAmount) > 0 && (
          <div className="invoice-total-row" style={{ color: '#ef4444' }}>
            <span className="label">Late Payment Penalty</span>
            <span className="amount">{formatCurrency(inv.penaltyAmount, inv.currency)}</span>
          </div>
        )}
        <div className="invoice-total-row total-main">
          <span className="label">Total Amount</span>
          <span className="amount">{formatCurrency(inv.totalAmount, inv.currency)}</span>
        </div>
        <div className="invoice-total-row">
          <span className="label">Paid</span>
          <span className="amount" style={{ color: '#10b981' }}>{formatCurrency(inv.paidAmount, inv.currency)}</span>
        </div>
        <div className="invoice-total-row" style={{ fontWeight: 600, fontSize: 16 }}>
          <span className="label">Outstanding</span>
          <span className="amount" style={{ color: outstanding > 0 ? '#ef4444' : '#10b981' }}>
            {formatCurrency(outstanding, inv.currency)}
          </span>
        </div>
      </div>

      {/* Payment History */}
      {inv.receiptAllocations && inv.receiptAllocations.length > 0 && (
        <div className="card" style={{ marginTop: 20, padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.1)' }}>
              <History size={14} style={{ color: '#10b981' }} />
            </div>
            Payment History
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>
              {inv.receiptAllocations.length} payment{inv.receiptAllocations.length !== 1 ? 's' : ''}
            </span>
          </div>
          <table className="line-items-table">
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="text-right">Amount Applied</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inv.receiptAllocations.map(alloc => (
                <tr key={alloc.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Banknote size={14} style={{ color: '#10b981' }} />
                      {alloc.receipt.receiptNumber}
                    </div>
                  </td>
                  <td>{format(new Date(alloc.receipt.receiptDate), 'MMM d, yyyy')}</td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: 'rgba(59,130,246,0.08)', color: '#3b82f6', textTransform: 'capitalize',
                    }}>
                      {alloc.receipt.paymentMethod.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{alloc.receipt.paymentReference || '—'}</td>
                  <td className="text-right" style={{ fontWeight: 700, color: '#10b981' }}>
                    {formatCurrency(alloc.amount, alloc.receipt.currency)}
                  </td>
                  <td>
                    <span className={`inv-status inv-status--${alloc.receipt.status === 'applied' ? 'paid' : alloc.receipt.status}`}
                      style={{ fontSize: 10 }}>
                      {alloc.receipt.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>Total Payments</td>
                <td className="text-right" style={{ fontWeight: 700, fontSize: 15, color: '#10b981' }}>
                  {formatCurrency(inv.receiptAllocations.reduce((s: number, a: any) => s + Number(a.amount), 0), inv.currency)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* No Payment History info */}
      {(!inv.receiptAllocations || inv.receiptAllocations.length === 0) && Number(inv.paidAmount) === 0 && !['draft', 'void'].includes(inv.status) && (
        <div className="card" style={{ marginTop: 20, padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <Banknote size={24} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, margin: 0 }}>No payments received yet</p>
        </div>
      )}

      {/* Credit Notes */}
      {inv.creditNotes && inv.creditNotes.length > 0 && (
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CreditCard size={16} /> Credit Notes
          </h3>
          {inv.creditNotes.map(cn => (
            <div key={cn.id} onClick={() => navigate(`/admin/billing/invoices/${cn.id}`)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}>
              <span>{cn.invoiceNumber}</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>-{formatCurrency(cn.totalAmount, inv.currency)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Void Info */}
      {inv.status === 'void' && inv.voidReason && (
        <div className="card" style={{ marginTop: 20, padding: 20, borderColor: '#ef444440' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>Voided</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inv.voidReason}</p>
        </div>
      )}

      {/* ═══ Credit Note Modal ═══ */}
      {showCreditModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><CreditCard size={18} /> Create Credit Note</h2>
              <button className="modal-close" onClick={() => setShowCreditModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateCreditNote}>
              <div className="modal-body">
                <div style={{ marginBottom: 16, padding: 12, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, fontSize: 12, color: '#34d399' }}>
                  Creating credit note against <strong>{inv.invoiceNumber}</strong> — Total: {formatCurrency(inv.totalAmount, inv.currency)}
                </div>

                <div className="inv-field" style={{ marginBottom: 16 }}>
                  <label>Credit Reason <span className="req">*</span></label>
                  <textarea required rows={2} placeholder="Reason for issuing this credit note…"
                    value={creditReason} onChange={e => setCreditReason(e.target.value)} />
                </div>

                {/* Credit Lines */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Credit Line Items
                  </span>
                  <button type="button" className="add-line-btn" onClick={addCreditLine}>
                    <Plus size={13} /> Add Line
                  </button>
                </div>

                <table className="inv-lines-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Charge Type</th>
                      <th style={{ width: '30%' }}>Description</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Tax %</th>
                      <th style={{ width: '8%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditLines.map((line, idx) => (
                      <tr key={idx}>
                        <td>
                          <select className="line-select" required value={line.chargeTypeId}
                            onChange={e => updateCreditLine(idx, 'chargeTypeId', e.target.value)}>
                            <option value="">Select…</option>
                            {chargeTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input className="line-input" required placeholder="Description" value={line.description}
                            onChange={e => updateCreditLine(idx, 'description', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" className="line-input" min={0} step={1} value={line.quantity}
                            onChange={e => updateCreditLine(idx, 'quantity', Number(e.target.value))} />
                        </td>
                        <td>
                          <input type="number" className="line-input" min={0} step={0.01} value={line.unitPrice}
                            onChange={e => updateCreditLine(idx, 'unitPrice', Number(e.target.value))} />
                        </td>
                        <td>
                          <input type="number" className="line-input" min={0} max={100} step={0.1}
                            value={Math.round(line.taxRate * 10000) / 100}
                            onChange={e => updateCreditLine(idx, 'taxRate', Number(e.target.value) / 100)} />
                        </td>
                        <td>
                          {creditLines.length > 1 && (
                            <button type="button" className="line-remove-btn" onClick={() => removeCreditLine(idx)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: 16, textAlign: 'right', fontSize: 16, fontWeight: 700, color: '#34d399' }}>
                  Credit Total: {formatCurrency(creditTotal, inv.currency)}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creatingCN}
                  style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>
                  {creatingCN ? 'Creating…' : 'Issue Credit Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Embedded PDF Viewer ═══ */}
      {showPdfViewer && (
        <div className="pdf-viewer-overlay">
          <div className="pdf-viewer-modal" onClick={e => e.stopPropagation()}>
            <div className="pdf-viewer-header">
              <h3>
                <FileText size={16} style={{ color: 'var(--primary)' }} />
                {inv.invoiceNumber} — PDF Preview
              </h3>
              <div className="pdf-actions">
                {pdfUrl && (
                  <button className="btn btn-secondary" onClick={() => window.open(pdfUrl, '_blank')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}>
                    <ExternalLink size={13} /> Open in New Tab
                  </button>
                )}
                {pdfUrl && (
                  <a href={pdfUrl} download className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', textDecoration: 'none' }}>
                    <Download size={13} /> Download
                  </a>
                )}
                <button className="btn btn-secondary" onClick={closePdfViewer}
                  style={{ padding: '6px 8px', display: 'flex' }}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="pdf-viewer-body">
              {pdfLoading && (
                <div className="pdf-viewer-loading">
                  <div className="pdf-spinner" />
                  Generating PDF…
                </div>
              )}
              {!pdfLoading && pdfUrl && (
                <iframe
                  src={pdfUrl}
                  title={`Invoice ${inv.invoiceNumber} PDF`}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
              {!pdfLoading && !pdfUrl && (
                <div className="pdf-viewer-loading">
                  <AlertTriangle size={28} style={{ color: '#f87171' }} />
                  <span>Failed to generate PDF. Try again.</span>
                  <button className="btn btn-secondary" onClick={handleViewPdf}
                    style={{ marginTop: 8, fontSize: 12 }}>
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
