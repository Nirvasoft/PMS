import { useState, useMemo, useRef, useEffect } from 'react';
import { useCreateReceiptMutation } from '../../../store/api/arApi';
import { useGetInvoicesQuery, useGetCurrencyRatesQuery } from '../../../store/api/billingApi';
import { useGetTenantsQuery, useGetTenantQuery } from '../../../store/api/tenantsApi';
import { Banknote, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

interface Props { onClose: () => void; }

export default function CreateReceiptModal({ onClose }: Props) {
  const [tenantId, setTenantId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [tenantSearch, setTenantSearch] = useState('');

  const { data: tenantsData } = useGetTenantsQuery({ page: 1, limit: 50, search: tenantSearch || undefined });
  const tenants = tenantsData?.data || [];

  // Fetch full tenant details to get the tenant's currency field
  const { data: tenantDetail } = useGetTenantQuery(tenantId, { skip: !tenantId });
  const tenantCurrency = tenantDetail?.data?.currency || '';

  // Fetch Currency Setup list — dropdown is populated from these configured currencies
  const { data: currencyRatesData } = useGetCurrencyRatesQuery();
  const currencyOptions = useMemo(() => {
    const rates = currencyRatesData?.data || [];
    // Deduplicate by currency code and preserve insertion order
    const seen = new Set<string>();
    return rates.reduce<{ code: string; description: string | null }[]>((acc, r) => {
      if (!seen.has(r.currency)) {
        seen.add(r.currency);
        acc.push({ code: r.currency, description: r.description });
      }
      return acc;
    }, []);
  }, [currencyRatesData]);

  const { data: invoicesData } = useGetInvoicesQuery(
    { tenantId: tenantId || undefined, page: 1, limit: 50 },
    { skip: !tenantId },
  );
  const outstandingInvoices = useMemo(() => {
    return (invoicesData?.data || []).filter(inv =>
      ['issued', 'sent', 'partially_paid', 'overdue'].includes(inv.status) && inv.outstandingAmount > 0
    );
  }, [invoicesData]);

  const [createReceipt, { isLoading }] = useCreateReceiptMutation();

  // Auto-bind currency from the selected tenant's currency field.
  // Allow manual override — re-sync only when the tenant changes.
  const manualCurrency = useRef(false);
  useEffect(() => { manualCurrency.current = false; }, [tenantId]);
  useEffect(() => {
    if (tenantCurrency && !manualCurrency.current) {
      setCurrency(tenantCurrency);
    }
  }, [tenantCurrency]);


  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);
  const amountNum = parseFloat(amount) || 0;
  const overpayment = amountNum - totalAllocated;

  const handleAllocChange = (invoiceId: string, val: string) => {
    const n = parseFloat(val) || 0;
    setAllocations(prev => ({ ...prev, [invoiceId]: n }));
  };

  const handleSubmit = async () => {
    if (!tenantId || amountNum <= 0) {
      toast.error('Please select a tenant and enter an amount');
      return;
    }
    if (totalAllocated > amountNum + 0.01) {
      toast.error('Allocations exceed receipt amount');
      return;
    }

    try {
      const allocArr = Object.entries(allocations)
        .filter(([, v]) => v > 0)
        .map(([invoiceId, amt]) => ({ invoiceId, amount: amt }));

      await createReceipt({
        tenantId,
        receiptDate,
        paymentMethod,
        paymentReference: paymentReference || undefined,
        amount: amountNum,
        currency,
        notes: notes || undefined,
        allocations: allocArr,
      }).unwrap();

      toast.success('Payment recorded successfully');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to record payment');
    }
  };

  const getTenantName = (t: any) => {
    return t.tenantType === 'corporate'
      ? t.companyName || ''
      : `${t.firstName || ''} ${t.lastName || ''}`.trim();
  };

  return (
    <div className="ar-modal-backdrop">
      <div className="ar-modal">
        <h2>
          <span className="modal-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <Banknote size={18} />
          </span>
          Record Payment
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}><X size={18} /></button>
        </h2>

        {/* Tenant Selection */}
        <div className="ar-form-grid">
          <div className="ar-field" style={{ gridColumn: '1 / -1' }}>
            <label>Tenant <span className="req">*</span></label>
            <select value={tenantId} onChange={e => { setTenantId(e.target.value); setAllocations({}); }}>
              <option value="">Select tenant…</option>
              {tenants.map((t: any) => (
                <option key={t.id} value={t.id}>{getTenantName(t)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Payment Details */}
        <div className="ar-form-grid">
          <div className="ar-field">
            <label>Payment Method <span className="req">*</span></label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
              <option value="giro">GIRO</option>
              <option value="credit_card">Credit Card</option>
            </select>
          </div>
          <div className="ar-field">
            <label>Receipt Date <span className="req">*</span></label>
            <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
          </div>
          <div className="ar-field">
            <label>Amount <span className="req">*</span></label>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="ar-field">
            <label>Currency</label>
            <select value={currency} onChange={e => { manualCurrency.current = true; setCurrency(e.target.value); }}>
              {!currency && <option value="">Select currency…</option>}
              {currencyOptions.map(c => (
                <option key={c.code} value={c.code}>
                  {c.description ? `${c.code} – ${c.description}` : c.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ar-form-grid">
          <div className="ar-field">
            <label>Payment Reference</label>
            <input type="text" placeholder="e.g. TT-20250208-001" value={paymentReference}
              onChange={e => setPaymentReference(e.target.value)} />
          </div>
          <div className="ar-field">
            <label>Notes</label>
            <input type="text" placeholder="Optional notes" value={notes}
              onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Invoice Allocations */}
        {tenantId && (
          <div className="alloc-section">
            <h4>Allocate to Invoices ({outstandingInvoices.length} outstanding)</h4>
            {outstandingInvoices.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '10px 0' }}>
                No outstanding invoices for this tenant.
              </div>
            ) : (
              <table className="alloc-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th style={{ textAlign: 'right' }}>Allocate</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td><span className="cell-primary">{inv.invoiceNumber}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Number(inv.totalAmount), inv.currency)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(inv.outstandingAmount, inv.currency)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          className="alloc-input"
                          type="number" step="0.01" min="0"
                          max={inv.outstandingAmount}
                          placeholder="0.00"
                          value={allocations[inv.id] || ''}
                          onChange={e => handleAllocChange(inv.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Allocation summary */}
            {amountNum > 0 && (
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 13 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  Allocated: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalAllocated, currency)}</strong>
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  Unallocated: <strong style={{ color: overpayment > 0 ? '#fbbf24' : 'var(--text-primary)' }}>
                    {formatCurrency(Math.max(0, overpayment), currency)}
                  </strong>
                </span>
              </div>
            )}

            {overpayment > 0.01 && totalAllocated > 0 && (
              <div className="overpayment-notice">
                <AlertTriangle size={16} />
                {formatCurrency(overpayment, currency)} will be recorded as tenant credit (overpayment).
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="ar-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Banknote size={14} /> {isLoading ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
