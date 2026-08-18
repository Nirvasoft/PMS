import { useGetReceiptQuery, useReverseReceiptMutation } from '../../../store/api/arApi';
import { X, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

interface Props { receiptId: string; onClose: () => void; }

export default function ReceiptDetailDrawer({ receiptId, onClose }: Props) {
  const { data, isLoading } = useGetReceiptQuery(receiptId);
  const [reverseReceipt, { isLoading: reversing }] = useReverseReceiptMutation();
  const receipt = data?.data;

  const handleReverse = async () => {
    const reason = prompt('Enter reason for reversal:');
    if (!reason) return;
    try {
      await reverseReceipt({ id: receiptId, reason }).unwrap();
      toast.success('Receipt reversed');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to reverse');
    }
  };

  const getTenantName = (r: any) => {
    if (!r?.tenant) return '—';
    return r.tenant.tenantType === 'corporate'
      ? r.tenant.companyName || ''
      : `${r.tenant.firstName || ''} ${r.tenant.lastName || ''}`.trim();
  };

  return (
    <>
      <div className="ar-drawer-backdrop" />
      <div className="ar-drawer">
        {isLoading || !receipt ? (
          <div className="ar-empty">Loading receipt…</div>
        ) : (
          <>
            <h2>
              <span>{receipt.receiptNumber}</span>
              <button className="btn-icon" onClick={onClose}><X size={18} /></button>
            </h2>

            <div style={{ marginBottom: 20 }}>
              <span className={`ar-status ar-status--${receipt.status}`}>{receipt.status}</span>
            </div>

            <div className="drawer-meta-grid">
              <div className="drawer-meta-item">
                <div className="dmi-label">Tenant</div>
                <div className="dmi-value">{getTenantName(receipt)}</div>
              </div>
              <div className="drawer-meta-item">
                <div className="dmi-label">Property</div>
                <div className="dmi-value">{receipt.property?.name || '—'}</div>
              </div>
              <div className="drawer-meta-item">
                <div className="dmi-label">Receipt Date</div>
                <div className="dmi-value">{format(new Date(receipt.receiptDate), 'MMM d, yyyy')}</div>
              </div>
              <div className="drawer-meta-item">
                <div className="dmi-label">Payment Method</div>
                <div className="dmi-value" style={{ textTransform: 'capitalize' }}>
                  {receipt.paymentMethod.replace(/_/g, ' ')}
                </div>
              </div>
              <div className="drawer-meta-item">
                <div className="dmi-label">Amount</div>
                <div className="dmi-value" style={{ fontSize: 18, fontWeight: 800 }}>
                  {formatCurrency(receipt.amount, receipt.currency)}
                </div>
              </div>
              <div className="drawer-meta-item">
                <div className="dmi-label">Reference</div>
                <div className="dmi-value">{receipt.paymentReference || '—'}</div>
              </div>
            </div>

            {receipt.notes && (
              <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong>Notes:</strong> {receipt.notes}
              </div>
            )}

            {/* Allocations */}
            <div className="drawer-alloc-section">
              <h3>Invoice Allocations ({receipt.allocations?.length || 0})</h3>
              {receipt.allocations && receipt.allocations.length > 0 ? (
                <table className="alloc-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th style={{ textAlign: 'right' }}>Invoice Total</th>
                      <th style={{ textAlign: 'right' }}>Allocated</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.allocations.map((a: any) => (
                      <tr key={a.id}>
                        <td><span className="cell-primary">{a.invoice.invoiceNumber}</span></td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(a.invoice.totalAmount)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(a.amount)}</td>
                        <td>
                          <span className={`inv-status inv-status--${a.invoice.status}`}>{a.invoice.status.replace('_', ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
                  No allocations — full amount recorded as unallocated.
                </div>
              )}
            </div>

            {/* Actions */}
            {receipt.status === 'confirmed' && (
              <div style={{ marginTop: 24 }}>
                <button className="btn btn-secondary" onClick={handleReverse} disabled={reversing}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171' }}>
                  <RotateCcw size={14} /> {reversing ? 'Reversing…' : 'Reverse Receipt'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
