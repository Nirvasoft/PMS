import { useState, useMemo, useRef, useEffect } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useCreateReceiptMutation } from '../../../store/api/arApi';
import { useGetInvoicesQuery, useGetCurrencyRatesQuery } from '../../../store/api/billingApi';
import { useGetPaymentMethodsQuery } from '../../../store/api/glApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import { Banknote, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import ComboBox from '../../../components/ComboBox';

const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', currencyDisplay: 'code' }).format(amount);

interface Props { onClose: () => void; }

export default function CreateReceiptModal({ onClose }: Props) {
  // Active property — tenants and payment methods are scoped to this property.
  const activePropertyId = useSelectedPropertyId();
  const { data: paymentMethods = [] } = useGetPaymentMethodsQuery(
    activePropertyId ? { isActive: true, propertyId: activePropertyId } : skipToken,
  );
  const activePaymentMethods = useMemo(
    () => paymentMethods.filter((pm) => pm.isActive),
    [paymentMethods]
  );

  const [isCash, setIsCash] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  useEffect(() => {
    if (activePaymentMethods.length > 0 && (!paymentMethod || !activePaymentMethods.some((pm) => pm.code === paymentMethod))) {
      const preferred =
        activePaymentMethods.find((pm) => pm.code.toUpperCase() === 'BANK_TRANSFER')?.code ||
        activePaymentMethods[0].code;
      setPaymentMethod(preferred);
    } else if (activePaymentMethods.length === 0 && paymentMethod) {
      setPaymentMethod('');
    }
  }, [activePaymentMethods, paymentMethod]);

  const { data: tenantsData } = useGetTenantsQuery({
    page: 1,
    limit: 200,
    propertyId: activePropertyId || undefined,
    kycStatus: 'verified',
  });
  const tenants = tenantsData?.data || [];

  // Derive currency from the selected tenant's record.
  const tenantCurrency = tenants.find(t => t.id === tenantId)?.currency || '';

  // Fetch currency rates scoped to the active property.
  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    activePropertyId ? { propertyId: activePropertyId } : undefined,
  );
  const currencyOptions = useMemo(() => {
    const rates = currencyRatesData?.data || [];
    return [...new Set(rates.map(r => r.currency))].sort();
  }, [currencyRatesData]);
  const baseCurrency = useMemo(() => {
    const rates = currencyRatesData?.data || [];
    return rates.find(r => r.isBaseCurrency)?.currency || rates[0]?.currency || '';
  }, [currencyRatesData]);

  const { data: invoicesData } = useGetInvoicesQuery(
    { tenantId: tenantId || undefined, propertyId: activePropertyId || undefined, page: 1, limit: 50 },
    { skip: !tenantId || isCash },
  );
  const outstandingInvoices = useMemo(() => {
    return (invoicesData?.data || []).filter(inv =>
      ['issued', 'sent', 'partially_paid', 'overdue'].includes(inv.status) && inv.outstandingAmount > 0
    );
  }, [invoicesData]);

  const [createReceipt, { isLoading }] = useCreateReceiptMutation();

  // Auto-bind currency from the selected tenant's currency field (or property base currency for Cash).
  // Allow manual override — re-sync only when the tenant changes.
  const manualCurrency = useRef(false);
  useEffect(() => { manualCurrency.current = false; }, [tenantId]);
  useEffect(() => {
    if (tenantCurrency && !manualCurrency.current) {
      setCurrency(tenantCurrency);
    } else if (isCash && !currency && baseCurrency && !manualCurrency.current) {
      setCurrency(baseCurrency);
    }
  }, [tenantCurrency, isCash, currency, baseCurrency]);

  // Reset tenant selection whenever the active property changes.
  useEffect(() => {
    setTenantId('');
    setAllocations({});
  }, [activePropertyId]);


  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);
  const amountNum = parseFloat(amount) || 0;
  const overpayment = amountNum - totalAllocated;

  const handleAllocChange = (invoiceId: string, val: string) => {
    const n = parseFloat(val) || 0;
    setAllocations(prev => ({ ...prev, [invoiceId]: n }));
  };

  const isTenantMissing = hasAttemptedSubmit && !isCash && !tenantId;
  const isPaymentMethodMissing = hasAttemptedSubmit && !paymentMethod;
  const isReceiptDateMissing = hasAttemptedSubmit && !receiptDate;
  const isAmountMissing = hasAttemptedSubmit && (!amount.trim() || amountNum <= 0);

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if ((!isCash && !tenantId) || !paymentMethod || !receiptDate || !amount.trim() || amountNum <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (totalAllocated > amountNum + 0.01) {
      toast.error('Allocations exceed receipt amount');
      return;
    }

    try {
      const allocArr = isCash
        ? []
        : Object.entries(allocations)
            .filter(([, v]) => v > 0)
            .map(([invoiceId, amt]) => ({ invoiceId, amount: amt }));

      await createReceipt({
        tenantId: isCash ? undefined : tenantId,
        isCash,
        propertyId: activePropertyId || undefined,
        receiptDate,
        paymentMethod,
        paymentReference: paymentReference || undefined,
        amount: amountNum,
        currency: currency || baseCurrency || undefined,
        notes: notes || undefined,
        allocations: allocArr,
      }).unwrap();

      toast.success('Payment recorded successfully');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to record payment');
    }
  };

  const tenantComboOptions = useMemo(() => {
    return tenants
      .map((t: any) => {
        const topLine = (t.lastName || t.companyName || t.displayName || t.firstName || '').trim();
        const firstName = (t.firstName || '').trim();
        return {
          id: t.id,
          label: topLine,
          sublabel: firstName && firstName !== topLine ? firstName : undefined,
        };
      })
      .filter((o: any) => o.label !== '');
  }, [tenants]);

  return (
    <div className="ar-modal-backdrop">
      <div className="ar-modal">
        <h2>
          <span className="modal-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <Banknote size={18} />
          </span>
          Record Receipts
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}><X size={18} /></button>
        </h2>

        {/* Tenant Selection + Cash Checkbox */}
        <div className="ar-form-grid">
          <div className={`ar-field ${isTenantMissing ? 'ar-field-error' : ''}`} style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ margin: 0 }}>
                Tenant {!isCash && <span className="req">*</span>}
              </label>
              <label
                htmlFor="receipt-cash-checkbox"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  textTransform: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: 'normal',
                  userSelect: 'none',
                }}
              >
                <input
                  id="receipt-cash-checkbox"
                  type="checkbox"
                  checked={isCash}
                  onChange={e => {
                    const checked = e.target.checked;
                    setIsCash(checked);
                    if (checked) {
                      setTenantId('');
                      setAllocations({});
                    }
                  }}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)', margin: 0 }}
                />
                Cash
              </label>
            </div>
            <ComboBox
              id="receipt-tenant"
              value={tenantId}
              disabled={isCash}
              placeholder={isCash ? 'Disabled for Cash receipt' : 'Select tenant…'}
              emptyText="No KYC-verified tenants found"
              options={tenantComboOptions}
              onChange={val => { setTenantId(val); setAllocations({}); }}
            />
            {isTenantMissing && <span className="ar-error-text">Tenant is required</span>}
            {!isCash && tenants.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: '#f59e0b' }}>
                <AlertTriangle size={13} />
                No KYC-verified tenants found for this property.
              </div>
            )}
          </div>
        </div>

        {/* Payment Details */}
        <div className="ar-form-grid">
          <div className="ar-field">
            <label>Payment Method <span className="req">*</span></label>
            <select
              className={isPaymentMethodMissing ? 'ar-input-error' : ''}
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
            >
              {activePaymentMethods.length === 0 ? (
                <option value="">No active payment methods</option>
              ) : (
                activePaymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.code}>
                    {pm.name}
                  </option>
                ))
              )}
            </select>
            {isPaymentMethodMissing && <span className="ar-error-text">Payment method is required</span>}
          </div>
          <div className="ar-field">
            <label>Receipt Date <span className="req">*</span></label>
            <input
              type="date"
              className={isReceiptDateMissing ? 'ar-input-error' : ''}
              value={receiptDate}
              onChange={e => setReceiptDate(e.target.value)}
            />
            {isReceiptDateMissing && <span className="ar-error-text">Receipt date is required</span>}
          </div>
          <div className="ar-field">
            <label>Amount <span className="req">*</span></label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className={isAmountMissing ? 'ar-input-error' : ''}
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            {isAmountMissing && <span className="ar-error-text">Valid amount is required</span>}
          </div>
          <div className="ar-field">
            <label>Currency</label>
            <select value={currency} onChange={e => { manualCurrency.current = true; setCurrency(e.target.value); }}>
              {!currency && <option value="">Select currency…</option>}
              {currencyOptions.map(c => (
                <option key={c} value={c}>{c}</option>
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
        {!isCash && tenantId && (
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
            <Banknote size={14} /> {isLoading ? 'Recording…' : 'Record Receipts'}
          </button>
        </div>
      </div>
    </div>
  );
}
