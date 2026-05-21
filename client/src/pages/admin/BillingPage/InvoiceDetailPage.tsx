import { useParams, useNavigate } from 'react-router-dom';
import { useGetInvoiceQuery, useVoidInvoiceMutation, useLazyGetInvoicePdfQuery, useSendInvoiceMutation } from '../../../store/api/billingApi';
import { ArrowLeft, FileText, Ban, CreditCard, Download, Send } from 'lucide-react';
import { format } from 'date-fns';
import './BillingPage.css';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useGetInvoiceQuery(id!);
  const [voidInvoice, { isLoading: voiding }] = useVoidInvoiceMutation();
  const [triggerPdf, { isFetching: loadingPdf }] = useLazyGetInvoicePdfQuery();
  const [sendInvoice, { isLoading: sending }] = useSendInvoiceMutation();

  const inv = data?.data;

  const handleVoid = async () => {
    const reason = prompt('Enter void reason:');
    if (!reason) return;
    await voidInvoice({ id: id!, reason }).unwrap();
  };

  const handleDownloadPdf = async () => {
    try {
      const result = await triggerPdf(id!).unwrap();
      if (result.data?.url) {
        window.open(result.data.url, '_blank');
      }
    } catch { /* error handled by RTK */ }
  };

  const handleSend = async () => {
    if (!confirm('Send this invoice to the tenant via email?')) return;
    try {
      const result = await sendInvoice(id!).unwrap();
      alert(`Invoice sent to ${result.data.sentTo}`);
    } catch (err: any) {
      alert(err?.data?.message || 'Failed to send invoice');
    }
  };

  if (isLoading || !inv) {
    return <div className="billing-page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Loading invoice…</div>;
  }

  const tenantName = inv.tenant.tenantType === 'company'
    ? inv.tenant.companyName || ''
    : `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();

  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);

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
          <button className="btn btn-secondary" onClick={handleDownloadPdf} disabled={loadingPdf}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> {loadingPdf ? 'Generating…' : 'PDF'}
          </button>
          {['draft', 'issued'].includes(inv.status) && (
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={14} /> {sending ? 'Sending…' : 'Send'}
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
    </div>
  );
}
