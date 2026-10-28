import { TableSkeletonRows } from '../../../components/common/SkeletonLoaders';
import { useState, useEffect, useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import {
  useGetPaymentVouchersQuery, useCreatePaymentVoucherMutation, useMarkVoucherPaidMutation,
  useGetApInvoicesQuery,
} from '../../../store/api/apApi';
import { useGetPaymentMethodsQuery } from '../../../store/api/glApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  CreditCard, Plus, X, DollarSign,
  ChevronLeft, ChevronRight, Banknote,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import { CURRENCIES } from '../../../constants/currencies';
import './APPage.css';

import { formatCompactAmount as fmt } from '../../../utils/formatCurrency';

export default function PaymentVouchersPage() {
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

  useEffect(() => {
    if (activePaymentMethods.length > 0 && (!form.paymentMethod || !activePaymentMethods.some((pm) => pm.code === form.paymentMethod))) {
      setForm((f) => ({ ...f, paymentMethod: defaultPaymentMethodCode }));
    } else if (activePaymentMethods.length === 0 && form.paymentMethod) {
      setForm((f) => ({ ...f, paymentMethod: '' }));
    }
  }, [activePaymentMethods, defaultPaymentMethodCode, form.paymentMethod]);

  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
  const effectiveAmount = parseFloat(form.amount) || totalAllocated;

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
    if (!form.voucherDate || !form.paymentMethod || (!isCash && !form.vendorName.trim()) || effectiveAmount <= 0) {
      return toast.error('Please fill in all required fields');
    }
    if (!isCash && allocations.length === 0) return toast.error('At least one AP invoice allocation is required');
    try {
      await createPaymentVoucher({
        ...form,
        propertyId: selectedProperty,
        isCash,
        amount: effectiveAmount,
        vendorName: isCash ? '' : form.vendorName.trim(),
        allocations: isCash ? [] : allocations,
      }).unwrap();
      toast.success('Payment Voucher created');
      setShowCreate(false);
      setHasAttemptedCreate(false);
      setIsCash(false);
      setForm({ voucherDate: format(new Date(), 'yyyy-MM-dd'), paymentMethod: defaultPaymentMethodCode, vendorName: '', vendorBankName: '', vendorBankAcc: '', amount: '', currency: 'USD', notes: '' });
      setAllocations([]);
    } catch { toast.error('Failed to create payment voucher'); }
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
              const propertyCurrency = properties.find((p) => p.id === selectedProperty)?.currency;
              setForm((f) => ({ ...f, currency: propertyCurrency || 'USD', paymentMethod: f.paymentMethod || defaultPaymentMethodCode }));
              setIsCash(false);
              setHasAttemptedCreate(false);
              setShowCreate(true);
            }}
            disabled={!selectedProperty}
            title={!selectedProperty ? 'Select a property from the sidebar first' : undefined}
          >
            <Plus size={16} /> New Voucher
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
                    className={hasAttemptedCreate && effectiveAmount <= 0 ? 'ap-input-error' : ''}
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
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

              {/* Invoice allocator */}
              <div className="ap-line-items">
                <h3><DollarSign size={16} /> Allocate AP Invoices</h3>
                <div className="ap-form-group" style={{ marginBottom: '0.75rem' }}>
                  <label>Select Approved Invoice {!isCash && <span className="req">*</span>}</label>
                  <select
                    disabled={isCash}
                    className={hasAttemptedCreate && !isCash && allocations.length === 0 ? 'ap-input-error' : ''}
                    style={isCash ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                    onChange={e => { addAllocation(e.target.value); e.target.value = ''; }}
                  >
                    <option value="">{isCash ? '— Disabled for Cash voucher —' : '— Select an approved AP invoice —'}</option>
                    {!isCash && availableInvoices.filter((i: any) => !allocations.find(a => a.apInvoiceId === i.id)).map((inv: any) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.apInvoiceNumber} — {inv.vendorName} — Outstanding: {fmt(inv.outstanding)} {inv.currency}
                      </option>
                    ))}
                  </select>
                  {hasAttemptedCreate && !isCash && allocations.length === 0 && (
                    <span className="ap-error-text">At least one approved AP invoice must be allocated</span>
                  )}
                </div>

                {!isCash && allocations.length > 0 && (
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
