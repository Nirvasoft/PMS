import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetApInvoicesQuery, useCreateApInvoiceMutation,
  useApproveApInvoiceMutation, useRejectApInvoiceMutation,
} from '../../../store/api/apApi';
import { useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  FileText, Plus, X, Clock, CheckCircle, AlertTriangle,
  DollarSign, Trash2, ChevronLeft, ChevronRight,
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

export default function ApInvoiceListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Active property from the sidebar — follows the same pattern as Parking Overview.
  const selectedProperty = useSelectedPropertyFilter();
  const { data: propertiesData } = useGetMyPropertyScopeQuery();
  const properties = propertiesData?.data || [];
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  // Reset page whenever the active property changes.
  useEffect(() => { setPage(1); }, [selectedProperty]);
  const [showCreate, setShowCreate] = useState(false);
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);

  const { data: invoicesData, isLoading } = useGetApInvoicesQuery({
    status: statusFilter || undefined,
    propertyId: selectedProperty || undefined,
    page: String(page), limit: String(limit),
  });
  const [createApInvoice, { isLoading: creating }] = useCreateApInvoiceMutation();
  const [approveApInvoice] = useApproveApInvoiceMutation();
  const [rejectApInvoice] = useRejectApInvoiceMutation();

  const invoices = invoicesData?.data || [];
  const meta = invoicesData?.meta;

  // Stats
  const stats = useMemo(() => {
    const all = invoices;
    return {
      pending: all.filter((i: any) => i.status === 'pending').length,
      approved: all.filter((i: any) => i.status === 'approved').length,
      overdue: all.filter((i: any) => new Date(i.dueDate) < new Date() && !['paid', 'void', 'rejected'].includes(i.status)).length,
      totalOutstanding: all.reduce((s: number, i: any) => s + (Number(i.totalAmount) - Number(i.paidAmount)), 0),
    };
  }, [invoices]);

  // Create form — propertyId is seeded from and locked to the active property; only when
  // "All Properties" is active can it be chosen in the form itself.
  const propertyLocked = !!selectedProperty;
  const [form, setForm] = useState({
    vendorName: '', vendorInvoiceNo: '', propertyId: selectedProperty, invoiceDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'), description: '',
    currency: 'USD', departmentId: '', costCenter: '', poReference: '', notes: '',
  });

  // Clears back to "Select property" (or re-locks to the new property) if the sidebar's
  // Active Property changes.
  const prevPropertyLockedRef = useRef(propertyLocked);
  useEffect(() => {
    if (propertyLocked) {
      if (form.propertyId !== selectedProperty) setForm((f) => ({ ...f, propertyId: selectedProperty }));
    } else if (prevPropertyLockedRef.current) {
      setForm((f) => ({ ...f, propertyId: '' }));
    }
    prevPropertyLockedRef.current = propertyLocked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyLocked, selectedProperty]);

  const resolvedPropertyId = form.propertyId || selectedProperty || '';
  const { data: chargeTypesData } = useGetChargeTypesQuery(
    resolvedPropertyId ? { propertyId: resolvedPropertyId } : undefined,
  );
  const chargeTypes = useMemo(
    () => (chargeTypesData?.data || []).filter((ct) => ct.isActive !== false),
    [chargeTypesData],
  );

  const [lines, setLines] = useState<LineItem[]>([
    { chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0, glAccountCode: '' },
  ]);

  const lineSubtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const lineTax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.taxRate, 0);
  const lineTotal = lineSubtotal + lineTax;

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

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [hasAttemptedReject, setHasAttemptedReject] = useState(false);

  const handleCreate = async () => {
    setHasAttemptedCreate(true);
    if (!form.vendorName.trim()) return toast.error('Vendor name is required');
    if (!form.propertyId) return toast.error('Please select a property');
    if (!form.invoiceDate || !form.dueDate) return toast.error('Invoice date and due date are required');
    if (lines.some(l => !l.description.trim() || !(l.unitPrice > 0))) {
      return toast.error('All line items must have description and positive unit price');
    }
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      );
      const cleanedLines = lines.map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        ...(l.chargeTypeId ? { chargeTypeId: l.chargeTypeId } : {}),
        ...(l.glAccountCode ? { glAccountCode: l.glAccountCode } : {}),
      }));
      await createApInvoice({ ...payload, lines: cleanedLines }).unwrap();
      toast.success('AP Invoice created');
      setShowCreate(false);
      setHasAttemptedCreate(false);
      setForm({ vendorName: '', vendorInvoiceNo: '', propertyId: selectedProperty, invoiceDate: format(new Date(), 'yyyy-MM-dd'),
        dueDate: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'), description: '', currency: 'USD',
        departmentId: '', costCenter: '', poReference: '', notes: '' });
      setLines([{ chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0, glAccountCode: '' }]);
    } catch (err: any) {
      toast.error(err?.data?.error?.message || err?.data?.message || 'Failed to create AP invoice');
    }
  };

  const handleApprove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await approveApInvoice(id).unwrap(); toast.success('AP Invoice approved'); } catch { toast.error('Approval failed'); }
  };

  const handleReject = async () => {
    setHasAttemptedReject(true);
    if (!rejectId || !rejectReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }
    try {
      await rejectApInvoice({ id: rejectId, reason: rejectReason }).unwrap();
      toast.success('AP Invoice rejected');
      setRejectId(null);
      setRejectReason('');
      setHasAttemptedReject(false);
    } catch { toast.error('Rejection failed'); }
  };

  return (
    <div className="ap-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <FileText size={22} />
          </div>
          <div>
            <h1>AP Invoices</h1>
            <p>{meta?.total ?? invoices.length} total invoices</p>
          </div>
        </div>
        <PermissionGuard permission="ap-invoices.write">
          <button
            className="ap-btn primary"
            onClick={() => {
              const propertyCurrency = properties.find((p) => p.id === selectedProperty)?.currency;
              setForm((f) => ({ ...f, currency: propertyCurrency || f.currency }));
              setHasAttemptedCreate(false);
              setShowCreate(true);
            }}
          >
            <Plus size={16} /> New AP Invoice
          </button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      <div className="ap-stat-cards">
        <div className="ap-stat-card">
          <div className="icon-wrap pending"><Clock size={20} /></div>
          <div className="stat-info"><div className="label">Pending</div><div className="value">{stats.pending}</div></div>
        </div>
        <div className="ap-stat-card">
          <div className="icon-wrap approved"><CheckCircle size={20} /></div>
          <div className="stat-info"><div className="label">Approved</div><div className="value">{stats.approved}</div></div>
        </div>
        <div className="ap-stat-card">
          <div className="icon-wrap overdue"><AlertTriangle size={20} /></div>
          <div className="stat-info"><div className="label">Overdue</div><div className="value">{stats.overdue}</div></div>
        </div>
        <div className="ap-stat-card">
          <div className="icon-wrap total"><DollarSign size={20} /></div>
          <div className="stat-info"><div className="label">Outstanding</div><div className="value">{fmt(stats.totalOutstanding)}</div></div>
        </div>
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
          <option value="rejected">Rejected</option>
          <option value="void">Void</option>
        </select>
      </div>

      {/* Table */}
      <div className="ap-table-wrap">
        <TableScrollWrapper>
          <table className="ap-table">
            <thead>
              <tr>
                <th>AP No.</th>
                <th>Vendor</th>
                <th>Vendor Inv#</th>
                <th>Date</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9}><div className="ap-empty"><FileText size={40} /><p>No AP invoices found</p></div></td></tr>
              ) : invoices.map((inv: any) => (
                <tr key={inv.id} className="clickable" onClick={() => navigate(`/admin/ap/invoices/${inv.id}`)}>
                  <td><strong>{inv.apInvoiceNumber}</strong></td>
                  <td>{inv.vendorName}</td>
                  <td>{inv.vendorInvoiceNo || '—'}</td>
                  <td>{format(new Date(inv.invoiceDate), 'dd MMM yyyy')}</td>
                  <td>{format(new Date(inv.dueDate), 'dd MMM yyyy')}</td>
                  <td className="amount-neutral">{fmt(inv.totalAmount)}</td>
                  <td className="amount-positive">{fmt(inv.paidAmount)}</td>
                  <td><span className={`ap-status ${inv.status}`}>{inv.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    {inv.status === 'pending' && (
                      <PermissionGuard permission="ap-invoices.write">
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className="ap-btn sm success" onClick={(e) => handleApprove(inv.id, e)}>Approve</button>
                          <button className="ap-btn sm danger" onClick={(e) => { e.stopPropagation(); setHasAttemptedReject(false); setRejectReason(''); setRejectId(inv.id); }}>Reject</button>
                        </div>
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

      {/* Reject reason inline */}
      {rejectId && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="ap-modal-header">
              <h2><AlertTriangle size={18} /> Reject AP Invoice</h2>
              <button className="ap-btn icon-only ghost" onClick={() => { setRejectId(null); setHasAttemptedReject(false); }}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-group">
                <label>Rejection Reason <span className="req">*</span></label>
                <textarea
                  className={hasAttemptedReject && !rejectReason.trim() ? 'ap-input-error' : ''}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                />
                {hasAttemptedReject && !rejectReason.trim() && (
                  <span className="ap-error-text">Rejection reason is required</span>
                )}
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => { setRejectId(null); setHasAttemptedReject(false); }}>Cancel</button>
              <button className="ap-btn danger" onClick={handleReject}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="ap-modal-overlay">
          <div className="ap-modal wide" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2><Plus size={18} /> New AP Invoice</h2>
              <button className="ap-btn icon-only ghost" onClick={() => { setShowCreate(false); setHasAttemptedCreate(false); }}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-grid">
                <div className="ap-form-group">
                  <label>Vendor Name <span className="req">*</span></label>
                  <input
                    className={hasAttemptedCreate && !form.vendorName.trim() ? 'ap-input-error' : ''}
                    value={form.vendorName}
                    onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
                    placeholder="ABC Facilities Management"
                  />
                  {hasAttemptedCreate && !form.vendorName.trim() && (
                    <span className="ap-error-text">Vendor name is required</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Vendor Invoice No.</label>
                  <input value={form.vendorInvoiceNo} onChange={e => setForm(f => ({ ...f, vendorInvoiceNo: e.target.value }))} placeholder="INV-2025-001" />
                </div>
                <div className="ap-form-group">
                  <label>Property <span className="req">*</span></label>
                  {/* Locked to the sidebar's Active Property; not independently choosable then. */}
                  <select
                    className={hasAttemptedCreate && !form.propertyId ? 'ap-input-error' : ''}
                    value={form.propertyId}
                    disabled={propertyLocked}
                    onChange={e => {
                      const propertyId = e.target.value;
                      const propertyCurrency = properties.find((p) => p.id === propertyId)?.currency;
                      setForm(f => ({ ...f, propertyId, currency: propertyCurrency || f.currency }));
                    }}
                  >
                    {propertyLocked ? (
                      <option value={form.propertyId}>{selectedPropertyName || 'Loading…'}</option>
                    ) : (
                      <>
                        <option value="">Select property</option>
                        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </>
                    )}
                  </select>
                  {hasAttemptedCreate && !form.propertyId && (
                    <span className="ap-error-text">Please select a property</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Invoice Date <span className="req">*</span></label>
                  <input
                    type="date"
                    className={hasAttemptedCreate && !form.invoiceDate ? 'ap-input-error' : ''}
                    value={form.invoiceDate}
                    onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))}
                  />
                  {hasAttemptedCreate && !form.invoiceDate && (
                    <span className="ap-error-text">Invoice date is required</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Due Date <span className="req">*</span></label>
                  <input
                    type="date"
                    className={hasAttemptedCreate && !form.dueDate ? 'ap-input-error' : ''}
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  />
                  {hasAttemptedCreate && !form.dueDate && (
                    <span className="ap-error-text">Due date is required</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>PO Reference</label>
                  <input value={form.poReference} onChange={e => setForm(f => ({ ...f, poReference: e.target.value }))} placeholder="PO-2025-001" />
                </div>
                <div className="ap-form-group">
                  <label>Cost Center</label>
                  <input value={form.costCenter} onChange={e => setForm(f => ({ ...f, costCenter: e.target.value }))} placeholder="OP-TOWER-A" />
                </div>
                <div className="ap-form-group full-width">
                  <label>Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Building maintenance services — January 2025" />
                </div>
              </div>

              {/* Line items */}
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
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, marginTop: '0.25rem' }}>Total: {fmt(lineTotal)}</div>
                </div>
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => { setShowCreate(false); setHasAttemptedCreate(false); }}>Cancel</button>
              <button className="ap-btn primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create AP Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
