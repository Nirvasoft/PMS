import { TableSkeletonRows } from '../../../components/common/SkeletonLoaders';
import { useState, useEffect, useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import {
  useGetPaymentVouchersQuery, useCreatePaymentVoucherMutation, useMarkVoucherPaidMutation,
  useGetApInvoicesQuery,
} from '../../../store/api/apApi';
import { useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { useGetPaymentMethodsQuery } from '../../../store/api/glApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useV6IntegrationStatus } from '../../../hooks/useV6IntegrationStatus';
import {
  CreditCard, Plus, X, DollarSign, FileText, Trash2,
  ChevronLeft, ChevronRight, Banknote,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import { CURRENCIES } from '../../../constants/currencies';
import './APPage.css';

import { formatCompactAmount as fmt } from '../../../utils/formatCurrency';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  chargeTypeId?: string;
  glAccountCode?: string;
}

export default function PaymentVouchersPage() {
  const { isV6Active } = useV6IntegrationStatus();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [showCreate, setShowCreate] = useState(false);
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);
  const [isCash, setIsCash] = useState(false);
  const [payId, setPayId] = useState<string | null>(null);
  const [payRef, setPayRef] = useState('');
  const [hasAttemptedPay, setHasAttemptedPay] = useState(false);

  // Active property from the sidebar — follows the same pattern as Parking Overview.
  const selectedProperty = useSelectedPropertyFilter();
  const { data: propertiesData } = useGetMyPropertyScopeQuery();
  const properties = propertiesData?.data || [];
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  // Reset page and modal whenever the active property changes.
  useEffect(() => {
    setPage(1);
    setShowCreate(false);
    setHasAttemptedCreate(false);
    setAllocations([]);
    setLines([{ chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0, glAccountCode: '' }]);
  }, [selectedProperty]);

  const { data: vouchersData, isLoading } = useGetPaymentVouchersQuery(
    selectedProperty
      ? {
          status: statusFilter || undefined,
          propertyId: selectedProperty,
          page: String(page),
          limit: String(limit),
        }
      : skipToken,
  );
  const { data: approvedInvoices } = useGetApInvoicesQuery(
    selectedProperty
      ? {
          status: 'approved',
          propertyId: selectedProperty,
          limit: '100',
        }
      : skipToken,
  );
  const { data: chargeTypesData } = useGetChargeTypesQuery(
    selectedProperty ? { propertyId: selectedProperty } : undefined,
  );
  const chargeTypes = useMemo(
    () => (chargeTypesData?.data || []).filter((ct) => ct.isActive !== false),
    [chargeTypesData],
  );
  const { data: paymentMethods = [] } = useGetPaymentMethodsQuery(
    selectedProperty ? { propertyId: selectedProperty } : skipToken,
  );
  const activePaymentMethods = useMemo(
    () => paymentMethods.filter((pm) => pm.isActive),
    [paymentMethods]
  );
  const paymentMethodMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const pm of paymentMethods) {
      map.set(pm.code.toLowerCase(), pm.name);
    }
    return map;
  }, [paymentMethods]);
  const formatPaymentMethod = (code: string) =>
    paymentMethodMap.get((code || '').toLowerCase()) || (code || '').replace(/_/g, ' ');
  const defaultPaymentMethodCode = useMemo(
    () =>
      activePaymentMethods.find((pm) => pm.code.toUpperCase() === 'BANK_TRANSFER')?.code ||
      activePaymentMethods[0]?.code ||
      '',
    [activePaymentMethods]
  );

  const [createPaymentVoucher, { isLoading: creating }] = useCreatePaymentVoucherMutation();
  const [markVoucherPaid, { isLoading: marking }] = useMarkVoucherPaidMutation();

  const vouchers = vouchersData?.data || [];
  const meta = vouchersData?.meta;
  const availableInvoices = (approvedInvoices?.data || []).map((inv: any) => ({
    ...inv,
    outstanding: Number(inv.totalAmount) - Number(inv.paidAmount),
  })).filter((inv: any) => inv.outstanding > 0);

  // Create form
  const [form, setForm] = useState({
    voucherDate: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: '' as string,
    vendorName: '', vendorBankName: '', vendorBankAcc: '',
    amount: '',
    currency: 'USD', notes: '',
  });
  const [allocations, setAllocations] = useState<Array<{ apInvoiceId: string; amount: number }>>([]);
  const [lines, setLines] = useState<LineItem[]>([
    { chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0, glAccountCode: '' },
  ]);

  useEffect(() => {
    if (activePaymentMethods.length > 0 && (!form.paymentMethod || !activePaymentMethods.some((pm) => pm.code === form.paymentMethod))) {
      setForm((f) => ({ ...f, paymentMethod: defaultPaymentMethodCode }));
    } else if (activePaymentMethods.length === 0 && form.paymentMethod) {
      setForm((f) => ({ ...f, paymentMethod: '' }));
    }
  }, [activePaymentMethods, defaultPaymentMethodCode, form.paymentMethod]);

  const lineSubtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const lineTax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.taxRate, 0);
  const lineTotal = Math.round((lineSubtotal + lineTax) * 100) / 100;

  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
  const effectiveAmount = isCash ? lineTotal : (parseFloat(form.amount) || totalAllocated);

  const addLine = () => setLines(prev => [
    ...prev,
    { chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0, glAccountCode: '' },
  ]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const next: LineItem = { ...l, [field]: value };
      if (field === 'chargeTypeId') {
        const ct = chargeTypes.find(c => c.id === value);
        if (ct) {
          const prevCt = chargeTypes.find(c => c.id === l.chargeTypeId);
          if (!l.description.trim() || (prevCt && l.description === prevCt.name)) {
            next.description = ct.name;
          }
          next.taxRate = ct.isTaxable ? (Number(ct.taxRate) || 0) : l.taxRate;
          next.glAccountCode = ct.glAccountCode || '';
        } else {
          next.glAccountCode = '';
        }
      }
      return next;
    }));
  };

  const addAllocation = (invId: string) => {
    if (isCash) return;
    const inv = availableInvoices.find((i: any) => i.id === invId);
    if (!inv || allocations.find(a => a.apInvoiceId === invId)) return;
    const nextAllocations = [...allocations, { apInvoiceId: invId, amount: inv.outstanding }];
    const nextSum = Math.round(nextAllocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    setAllocations(nextAllocations);
    setForm(f => ({
      ...f,
      vendorName: f.vendorName || inv.vendorName,
      currency: f.vendorName ? f.currency : inv.currency,
      amount: String(nextSum),
    }));
  };

  const removeAllocation = (idx: number) => {
    const nextAllocations = allocations.filter((_, i) => i !== idx);
    const nextSum = Math.round(nextAllocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    setAllocations(nextAllocations);
    setForm(f => ({ ...f, amount: nextSum > 0 ? String(nextSum) : '' }));
  };

  const handleCreate = async () => {
    setHasAttemptedCreate(true);
    if (!selectedProperty) return toast.error('Please select a property from the sidebar first');
    if (isCash) {
      if (lines.some(l => !l.description.trim() || !(l.unitPrice > 0))) {
        return toast.error('All line items must have description and positive unit price');
      }
    }
    if (!form.voucherDate || !form.paymentMethod || (!isCash && !form.vendorName.trim()) || effectiveAmount <= 0) {
      return toast.error('Please fill in all required fields');
    }
    if (!isCash && allocations.length === 0) return toast.error('At least one AP invoice allocation is required');
    try {
      const cleanedLines = lines.map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        ...(l.chargeTypeId ? { chargeTypeId: l.chargeTypeId } : {}),
        ...(l.glAccountCode ? { glAccountCode: l.glAccountCode } : {}),
      }));
      await createPaymentVoucher({
        ...form,
        propertyId: selectedProperty,
        isCash,
        amount: effectiveAmount,
        vendorName: isCash ? '' : form.vendorName.trim(),
        allocations: isCash ? [] : allocations,
        lines: isCash ? cleanedLines : [],
      }).unwrap();
      toast.success('Payment Voucher created');
      setShowCreate(false);
      setHasAttemptedCreate(false);
      setIsCash(false);
      setForm({ voucherDate: format(new Date(), 'yyyy-MM-dd'), paymentMethod: defaultPaymentMethodCode, vendorName: '', vendorBankName: '', vendorBankAcc: '', amount: '', currency: 'USD', notes: '' });
      setAllocations([]);
      setLines([{ chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0, glAccountCode: '' }]);
    } catch (err: any) {
      toast.error(err?.data?.error?.message || err?.data?.message || 'Failed to create payment voucher');
    }
  };

  const handleMarkPaid = async () => {
    setHasAttemptedPay(true);
    if (!payId || !payRef.trim()) {
      toast.error('Payment reference is required');
      return;
    }
    try {
      await markVoucherPaid({ id: payId, paymentReference: payRef }).unwrap();
      toast.success('Voucher marked as paid');
      setPayId(null);
      setPayRef('');
      setHasAttemptedPay(false);
    } catch { toast.error('Failed to mark paid'); }
  };

  return (
    <div className="ap-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <CreditCard size={22} />
          </div>
          <div>
            <h1>Payment Vouchers</h1>
            <p>{meta?.total ?? vouchers.length} total vouchers</p>
          </div>
        </div>
        <PermissionGuard permission="ap-vouchers.write">
          <button
            className="ap-btn primary"
            onClick={() => {
              if (isV6Active) return;
              const propertyCurrency = properties.find((p) => p.id === selectedProperty)?.currency;
              setForm((f) => ({ ...f, currency: propertyCurrency || 'USD', paymentMethod: f.paymentMethod || defaultPaymentMethodCode }));
              setIsCash(false);
              setHasAttemptedCreate(false);
              setShowCreate(true);
            }}
            disabled={isV6Active || !selectedProperty}
            title={
              isV6Active
                ? 'Payment voucher creation is disabled because V6 ERP integration is active.'
                : (!selectedProperty ? 'Select a property from the sidebar first' : undefined)
            }
            style={isV6Active ? { opacity: 0.6, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 } : undefined}
          >
            {isV6Active ? '🔒 New Voucher (V6 Active)' : <><Plus size={16} /> New Voucher</>}
          </button>
        </PermissionGuard>
      </div>

      {/* Filter */}
      <div className="ap-filters">
        {/* Property follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select value={selectedProperty} disabled style={{ minWidth: 180 }}>
          {!selectedProperty && <option value="">All Properties</option>}
          {selectedProperty && <option value={selectedProperty}>{selectedPropertyName || 'Loading…'}</option>}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="ap-table-wrap">
        <TableScrollWrapper>
          <table className="ap-table">
            <thead>
              <tr>
                <th>Voucher No.</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Method</th>
                <th>Amount</th>
                <th>AP Invoices</th>
                <th>Status</th>
                <th>Paid At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeletonRows columns={9} />
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={9}><div className="ap-empty"><CreditCard size={40} /><p>No payment vouchers found</p></div></td></tr>
              ) : vouchers.map((pv: any) => (
                <tr key={pv.id}>
                  <td><strong>{pv.voucherNumber}</strong></td>
                  <td>{format(new Date(pv.voucherDate), 'dd MMM yyyy')}</td>
                  <td>{pv.vendorName || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{formatPaymentMethod(pv.paymentMethod)}</td>
                  <td className="amount-neutral">{fmt(pv.totalAmount)} {pv.currency}</td>
                  <td>{pv.allocations.map((a: any) => a.apInvoice.apInvoiceNumber).join(', ') || '—'}</td>
                  <td><span className={`ap-status ${pv.status}`}>{pv.status}</span></td>
                  <td>{pv.paidAt ? format(new Date(pv.paidAt), 'dd MMM yyyy') : '—'}</td>
                  <td>
                    {pv.status === 'pending' && (
                      <PermissionGuard permission="ap-vouchers.write">
                        <button className="ap-btn sm success" onClick={() => { setHasAttemptedPay(false); setPayRef(''); setPayId(pv.id); }}>
                          <Banknote size={14} /> Pay
                        </button>
                      </PermissionGuard>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScrollWrapper>
        {meta && (meta.total ?? 0) >= 10 && (
          <div className="ap-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <span>Rows per page:</span>
                <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="page-btns">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} title="Previous Page">
                <ChevronLeft size={16} />
              </button>
              <span className="page-num-display">Page {page} of {meta.totalPages || 1}</span>
              <button disabled={page >= (meta.totalPages || 1)} onClick={() => setPage(p => p + 1)} title="Next Page">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mark Paid modal */}
      {payId && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="ap-modal-header">
              <h2><Banknote size={18} /> Mark as Paid</h2>
              <button className="ap-btn icon-only ghost" onClick={() => { setPayId(null); setHasAttemptedPay(false); }}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-group">
                <label>Payment Reference <span className="req">*</span></label>
                <input
                  className={hasAttemptedPay && !payRef.trim() ? 'ap-input-error' : ''}
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  placeholder="TT-20250125-002"
                />
                {hasAttemptedPay && !payRef.trim() && (
                  <span className="ap-error-text">Payment reference is required</span>
                )}
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => { setPayId(null); setHasAttemptedPay(false); }}>Cancel</button>
              <button className="ap-btn success" disabled={marking} onClick={handleMarkPaid}>
                {marking ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="ap-modal-overlay">
          <div className="ap-modal wide" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2><Plus size={18} /> New Payment Voucher</h2>
              <button className="ap-btn icon-only ghost" onClick={() => { setShowCreate(false); setHasAttemptedCreate(false); }}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-grid">
                <div className="ap-form-group">
                  <label>Voucher Date <span className="req">*</span></label>
                  <input
                    type="date"
                    className={hasAttemptedCreate && !form.voucherDate ? 'ap-input-error' : ''}
                    value={form.voucherDate}
                    onChange={e => setForm(f => ({ ...f, voucherDate: e.target.value }))}
                  />
                  {hasAttemptedCreate && !form.voucherDate && (
                    <span className="ap-error-text">Voucher date is required</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Payment Method <span className="req">*</span></label>
                  <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
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
                </div>
                <div className="ap-form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ margin: 0 }}>
                      Vendor Name {!isCash && <span className="req">*</span>}
                    </label>
                    <label
                      htmlFor="voucher-cash-checkbox"
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
                        margin: 0,
                      }}
                    >
                      <input
                        id="voucher-cash-checkbox"
                        type="checkbox"
                        checked={isCash}
                        onChange={e => {
                          const checked = e.target.checked;
                          setIsCash(checked);
                          if (checked) {
                            setForm(f => ({ ...f, vendorName: '' }));
                            setAllocations([]);
                          }
                        }}
                        style={{
                          width: 15,
                          height: 15,
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          boxShadow: 'none',
                          cursor: 'pointer',
                          accentColor: 'var(--primary)',
                          margin: 0,
                        }}
                      />
                      Cash
                    </label>
                  </div>
                  <input
                    disabled={isCash}
                    placeholder={isCash ? 'Disabled for Cash voucher' : ''}
                    className={hasAttemptedCreate && !isCash && !form.vendorName.trim() ? 'ap-input-error' : ''}
                    value={form.vendorName}
                    onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
                    style={isCash ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  />
                  {hasAttemptedCreate && !isCash && !form.vendorName.trim() && (
                    <span className="ap-error-text">Vendor name is required</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Amount <span className="req">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    disabled={isCash}
                    className={hasAttemptedCreate && effectiveAmount <= 0 ? 'ap-input-error' : ''}
                    value={isCash ? (lineTotal > 0 ? String(lineTotal) : '') : form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    style={isCash ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
                  />
                  {hasAttemptedCreate && effectiveAmount <= 0 && (
                    <span className="ap-error-text">Valid amount is required</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Vendor Bank Name</label>
                  <input value={form.vendorBankName} onChange={e => setForm(f => ({ ...f, vendorBankName: e.target.value }))} placeholder="OCBC Bank" />
                </div>
                <div className="ap-form-group">
                  <label>Vendor Bank Acc</label>
                  <input value={form.vendorBankAcc} onChange={e => setForm(f => ({ ...f, vendorBankAcc: e.target.value }))} placeholder="500-123456-001" />
                </div>
                <div className="ap-form-group full-width">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="January maintenance payment" />
                </div>
              </div>

              {isCash ? (
                /* Cash Line Items (same as AP Invoice Line Items) */
                <div className="ap-line-items">
                  <style>{`
                    .ap-line-items-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
                    .ap-line-items-header h3 { margin: 0 !important; }
                    .ap-lines-table { width: 100%; border-collapse: collapse; }
                    .ap-lines-table thead tr { background: rgba(255, 255, 255, 0.02); }
                    .ap-lines-table th { padding: 9px 8px; font-size: 10px; font-weight: 700; color: var(--text-tertiary, var(--text-muted)); text-transform: uppercase; letter-spacing: 0.06em; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.06); white-space: nowrap; }
                    .ap-lines-table th .req { color: #f87171; margin-left: 2px; }
                    .ap-lines-table td { padding: 8px 6px; vertical-align: middle; border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
                    .ap-lines-table tbody tr:last-child td { border-bottom: none; }
                    .ap-lines-table .ap-line-input, .ap-lines-table .ap-line-select { width: 100%; box-sizing: border-box; padding: 8px 10px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; color: var(--text-primary); font-size: 12.5px; outline: none; transition: border-color 0.15s; font-family: inherit; }
                    .ap-lines-table .ap-line-input:focus, .ap-lines-table .ap-line-select:focus { border-color: var(--primary); }
                    .ap-lines-table .ap-line-select option { background: #1a1f2e; }
                    .ap-lines-table .ap-line-input.num { font-variant-numeric: tabular-nums; text-align: right; }
                    .ap-lines-table .ap-line-total { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text-primary); text-align: right; padding-right: 6px; white-space: nowrap; }
                    .ap-lines-table input.ap-input-error, .ap-lines-table select.ap-input-error { border-color: #ef4444 !important; background-color: rgba(239, 68, 68, 0.08) !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important; }
                    [data-theme="light"] .ap-lines-table .ap-line-input, [data-theme="light"] .ap-lines-table .ap-line-select { background: #ffffff; border-color: rgba(0, 0, 0, 0.12); color: #111827; }
                    [data-theme="light"] .ap-lines-table .ap-line-select option { background: #ffffff; }
                    [data-theme="light"] .ap-lines-table thead tr { background: #f8fafc; }
                    [data-theme="light"] .ap-lines-table th { border-bottom-color: rgba(0, 0, 0, 0.08); }
                    [data-theme="light"] .ap-lines-table td { border-bottom-color: rgba(0, 0, 0, 0.05); }
                    [data-theme="light"] .ap-lines-table input.ap-input-error, [data-theme="light"] .ap-lines-table select.ap-input-error { border-color: #ef4444 !important; background-color: #fef2f2 !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12) !important; }
                  `}</style>
                  <div className="ap-line-items-header">
                    <h3><FileText size={16} /> Line Items</h3>
                    <button type="button" className="ap-btn sm ghost" onClick={addLine}><Plus size={14} /> Add Line</button>
                  </div>
                  <table className="ap-lines-table">
                    <thead>
                      <tr>
                        <th style={{ width: '22%' }}>Charge Type</th>
                        <th style={{ width: '28%' }}>Description <span className="req">*</span></th>
                        <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Unit Price <span className="req">*</span></th>
                        <th style={{ width: '10%', textAlign: 'right' }}>Tax %</th>
                        <th style={{ width: '11%', textAlign: 'right' }}>Total ({form.currency})</th>
                        <th style={{ width: '4%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => {
                        const rowAmt = line.quantity * line.unitPrice;
                        const rowTax = rowAmt * line.taxRate;
                        const rowTotal = rowAmt + rowTax;
                        return (
                          <tr key={idx}>
                            <td>
                              <select
                                className="ap-line-select"
                                value={line.chargeTypeId || ''}
                                onChange={e => updateLine(idx, 'chargeTypeId', e.target.value)}
                              >
                                <option value="">— Select charge (optional) —</option>
                                {chargeTypes.map(ct => (
                                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className={`ap-line-input ${hasAttemptedCreate && !line.description.trim() ? 'ap-input-error' : ''}`}
                                placeholder="Charge description"
                                value={line.description}
                                onChange={e => updateLine(idx, 'description', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ap-line-input num"
                                placeholder="Qty"
                                min={0.01}
                                step={0.01}
                                value={line.quantity || ''}
                                onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className={`ap-line-input num ${hasAttemptedCreate && !(line.unitPrice > 0) ? 'ap-input-error' : ''}`}
                                placeholder="0.00"
                                min={0}
                                step={0.01}
                                value={line.unitPrice || ''}
                                onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ap-line-input num"
                                placeholder="0"
                                min={0}
                                max={100}
                                step={0.01}
                                value={line.taxRate ? Math.round(line.taxRate * 10000) / 100 : ''}
                                onChange={e => updateLine(idx, 'taxRate', (parseFloat(e.target.value) || 0) / 100)}
                              />
                            </td>
                            <td>
                              <div className="ap-line-total">{fmt(rowTotal)}</div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="ap-btn icon-only ghost"
                                onClick={() => removeLine(idx)}
                                disabled={lines.length <= 1}
                                title="Remove line"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {hasAttemptedCreate && lines.some(l => !l.description.trim() || !(l.unitPrice > 0)) && (
                    <span className="ap-error-text" style={{ marginTop: 8 }}>
                      Each line item requires a description and a unit price greater than 0
                    </span>
                  )}

                  <div style={{ marginTop: '0.85rem', textAlign: 'right', fontSize: '0.875rem' }}>
                    <div>Subtotal: <strong>{fmt(lineSubtotal)}</strong></div>
                    <div>Tax: <strong>{fmt(lineTax)}</strong></div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, marginTop: '0.25rem' }}>
                      Total: {fmt(lineTotal)} {form.currency}
                    </div>
                  </div>
                </div>
              ) : (
                /* Invoice allocator */
                <div className="ap-line-items">
                  <h3><DollarSign size={16} /> Allocate AP Invoices</h3>
                  <div className="ap-form-group" style={{ marginBottom: '0.75rem' }}>
                    <label>Select Approved Invoice <span className="req">*</span></label>
                    <select
                      className={hasAttemptedCreate && allocations.length === 0 ? 'ap-input-error' : ''}
                      onChange={e => { addAllocation(e.target.value); e.target.value = ''; }}
                    >
                      <option value="">— Select an approved AP invoice —</option>
                      {availableInvoices.filter((i: any) => !allocations.find(a => a.apInvoiceId === i.id)).map((inv: any) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.apInvoiceNumber} — {inv.vendorName} — Outstanding: {fmt(inv.outstanding)} {inv.currency}
                        </option>
                      ))}
                    </select>
                    {hasAttemptedCreate && allocations.length === 0 && (
                      <span className="ap-error-text">At least one approved AP invoice must be allocated</span>
                    )}
                  </div>

                  {allocations.length > 0 && (
                    <TableScrollWrapper>
                      <table className="ap-table" style={{ marginBottom: '0.5rem' }}>
                        <thead>
                          <tr>
                            <th>AP Invoice</th>
                            <th>Vendor</th>
                            <th>Amount</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {allocations.map((alloc, idx) => {
                            const inv = availableInvoices.find((i: any) => i.id === alloc.apInvoiceId);
                            return (
                              <tr key={alloc.apInvoiceId}>
                                <td>{inv?.apInvoiceNumber || alloc.apInvoiceId}</td>
                                <td>{inv?.vendorName || '—'}</td>
                                <td>
                                  <input type="number" min={0.01} step={0.01} value={alloc.amount}
                                    style={{ width: 120, padding: '0.25rem 0.5rem' }}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      const nextAllocations = allocations.map((a, i) => i === idx ? { ...a, amount: val } : a);
                                      const nextSum = Math.round(nextAllocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
                                      setAllocations(nextAllocations);
                                      setForm(f => ({ ...f, amount: nextSum > 0 ? String(nextSum) : '' }));
                                    }}
                                  />
                                </td>
                                <td><button className="ap-btn icon-only ghost" onClick={() => removeAllocation(idx)}><X size={14} /></button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableScrollWrapper>
                  )}

                  <div style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 700 }}>
                    Total: {fmt(effectiveAmount)} {form.currency}
                  </div>
                </div>
              )}
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => { setShowCreate(false); setHasAttemptedCreate(false); }}>Cancel</button>
              <button className="ap-btn primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
