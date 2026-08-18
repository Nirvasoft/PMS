import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetApInvoicesQuery, useCreateApInvoiceMutation,
  useApproveApInvoiceMutation, useRejectApInvoiceMutation,
} from '../../../store/api/apApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetChargeTypesQuery } from '../../../store/api/billingApi';
import {
  FileText, Plus, X, Clock, CheckCircle, AlertTriangle,
  DollarSign, Building2, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './APPage.css';

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface LineItem { description: string; quantity: number; unitPrice: number; taxRate: number; chargeTypeId?: string; glAccountCode?: string; }

export default function ApInvoiceListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: invoicesData, isLoading } = useGetApInvoicesQuery({ status: statusFilter || undefined, page: String(page), limit: '20' });
  const { data: propertiesData } = useGetPropertiesQuery({});
  const { data: chargeTypesRes } = useGetChargeTypesQuery({});
  const [createApInvoice, { isLoading: creating }] = useCreateApInvoiceMutation();
  const [approveApInvoice] = useApproveApInvoiceMutation();
  const [rejectApInvoice] = useRejectApInvoiceMutation();

  const invoices = invoicesData?.data || [];
  const meta = invoicesData?.meta;
  const properties = (propertiesData as any)?.data || [];
  const chargeTypes = (chargeTypesRes as any)?.data || [];

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

  // Create form
  const [form, setForm] = useState({
    vendorName: '', vendorInvoiceNo: '', propertyId: '', invoiceDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'), description: '',
    currency: 'USD', departmentId: '', costCenter: '', poReference: '', notes: '',
  });
  const [lines, setLines] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 0 },
  ]);

  const lineSubtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const lineTax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.taxRate, 0);
  const lineTotal = lineSubtotal + lineTax;

  const addLine = () => setLines(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleCreate = async () => {
    if (!form.vendorName) return toast.error('Vendor name is required');
    if (lines.some(l => !l.description || l.unitPrice <= 0)) return toast.error('All line items must have description and positive unit price');
    try {
      await createApInvoice({ ...form, lines }).unwrap();
      toast.success('AP Invoice created');
      setShowCreate(false);
      setForm({ vendorName: '', vendorInvoiceNo: '', propertyId: '', invoiceDate: format(new Date(), 'yyyy-MM-dd'),
        dueDate: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'), description: '', currency: 'USD',
        departmentId: '', costCenter: '', poReference: '', notes: '' });
      setLines([{ description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
    } catch { toast.error('Failed to create AP invoice'); }
  };

  const handleApprove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await approveApInvoice(id).unwrap(); toast.success('AP Invoice approved'); } catch { toast.error('Approval failed'); }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason) return;
    try {
      await rejectApInvoice({ id: rejectId, reason: rejectReason }).unwrap();
      toast.success('AP Invoice rejected');
      setRejectId(null);
      setRejectReason('');
    } catch { toast.error('Rejection failed'); }
  };

  return (
    <div className="ap-page">
      <div className="page-header">
        <h1><FileText size={24} /> AP Invoices</h1>
        <button className="ap-btn primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New AP Invoice</button>
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
              <th>Actions</th>
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
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="ap-btn sm success" onClick={(e) => handleApprove(inv.id, e)}>Approve</button>
                      <button className="ap-btn sm danger" onClick={(e) => { e.stopPropagation(); setRejectId(inv.id); }}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && meta.totalPages > 1 && (
          <div className="ap-pagination">
            <span>Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ap-btn sm ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
              <button className="ap-btn sm ghost" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Reject reason inline */}
      {rejectId && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="ap-modal-header"><h2><AlertTriangle size={18} /> Reject AP Invoice</h2><button className="ap-btn icon-only ghost" onClick={() => setRejectId(null)}><X size={18} /></button></div>
            <div className="ap-modal-body">
              <div className="ap-form-group">
                <label>Rejection Reason *</label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason for rejection..." />
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => setRejectId(null)}>Cancel</button>
              <button className="ap-btn danger" disabled={!rejectReason} onClick={handleReject}>Reject</button>
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
              <button className="ap-btn icon-only ghost" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-grid">
                <div className="ap-form-group">
                  <label>Vendor Name *</label>
                  <input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} placeholder="ABC Facilities Management" />
                </div>
                <div className="ap-form-group">
                  <label>Vendor Invoice No.</label>
                  <input value={form.vendorInvoiceNo} onChange={e => setForm(f => ({ ...f, vendorInvoiceNo: e.target.value }))} placeholder="INV-2025-001" />
                </div>
                <div className="ap-form-group">
                  <label>Property</label>
                  <select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}>
                    <option value="">— All Properties —</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="SGD">SGD</option>
                    <option value="MMK">MMK</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Invoice Date *</label>
                  <input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} />
                </div>
                <div className="ap-form-group">
                  <label>Due Date *</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
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
                <h3><FileText size={16} /> Line Items</h3>
                {lines.map((line, idx) => (
                  <div className="ap-line-item-row" key={idx}>
                    <input placeholder="Description *" value={line.description}
                      onChange={e => updateLine(idx, 'description', e.target.value)} />
                    <input type="number" placeholder="Qty" min={0.01} step={0.01} value={line.quantity || ''}
                      onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                    <input type="number" placeholder="Unit Price" min={0} step={0.01} value={line.unitPrice || ''}
                      onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                    <input type="number" placeholder="Tax %" min={0} max={100} step={0.01}
                      value={line.taxRate ? (line.taxRate * 100) : ''}
                      onChange={e => updateLine(idx, 'taxRate', (parseFloat(e.target.value) || 0) / 100)} />
                    <button className="ap-btn icon-only ghost" onClick={() => removeLine(idx)} disabled={lines.length <= 1}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button className="ap-btn sm ghost" onClick={addLine}><Plus size={14} /> Add Line</button>

                <div style={{ marginTop: '0.75rem', textAlign: 'right', fontSize: '0.875rem' }}>
                  <div>Subtotal: <strong>{fmt(lineSubtotal)}</strong></div>
                  <div>Tax: <strong>{fmt(lineTax)}</strong></div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, marginTop: '0.25rem' }}>Total: {fmt(lineTotal)}</div>
                </div>
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => setShowCreate(false)}>Cancel</button>
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
