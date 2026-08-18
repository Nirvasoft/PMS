import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetInvoicesQuery, useRunBillingMutation,
  useVoidInvoiceMutation, useSendInvoiceMutation, useLazyGetInvoicePdfQuery,
} from '../../../store/api/billingApi';
import {
  FileText, Plus, Play, Search, ChevronLeft, ChevronRight,
  DollarSign, AlertTriangle, CheckCircle, Receipt,
  Send, Ban, Download, XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import './BillingPage.css';

const STATUS_OPTIONS = ['', 'draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'disputed'];
const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const { data, isFetching } = useGetInvoicesQuery({ status: status || undefined, page, limit: 15 });
  const [runBilling, { isLoading: runningBilling }] = useRunBillingMutation();
  const [voidInvoice] = useVoidInvoiceMutation();
  const [sendInvoice] = useSendInvoiceMutation();
  const [triggerPdf] = useLazyGetInvoicePdfQuery();
  const confirmDialog = useConfirm();

  const invoices = data?.data || [];
  const meta = data?.meta;

  const stats = useMemo(() => {
    const all = invoices;
    return {
      total: meta?.total || 0,
      totalAmount: all.reduce((s, i) => s + Number(i.totalAmount), 0),
      overdue: all.filter(i => i.status === 'overdue').length,
      paid: all.filter(i => i.status === 'paid').length,
    };
  }, [invoices, meta]);

  const filteredInvoices = search
    ? invoices.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        (inv.tenant?.firstName || '').toLowerCase().includes(search.toLowerCase()) ||
        (inv.tenant?.lastName || '').toLowerCase().includes(search.toLowerCase()) ||
        (inv.tenant?.companyName || '').toLowerCase().includes(search.toLowerCase()))
    : invoices;

  // ── Selection Helpers ──────────────────────
  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
    }
  }, [filteredInvoices, selectedIds.size]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedInvoices = useMemo(
    () => filteredInvoices.filter(inv => selectedIds.has(inv.id)),
    [filteredInvoices, selectedIds],
  );

  // ── Bulk Actions ───────────────────────────
  const handleBulkSend = async () => {
    const sendable = selectedInvoices.filter(inv => ['draft', 'issued'].includes(inv.status));
    if (sendable.length === 0) return toast.error('No sendable invoices selected (must be draft or issued)');
    if (!(await confirmDialog(`Send ${sendable.length} invoice(s) to tenants via email?`))) return;

    setBulkProcessing(true);
    let success = 0, failed = 0;
    for (const inv of sendable) {
      try { await sendInvoice(inv.id).unwrap(); success++; }
      catch { failed++; }
    }
    setBulkProcessing(false);
    clearSelection();
    toast.success(`Sent ${success} invoice(s)${failed > 0 ? `, ${failed} failed` : ''}`);
  };

  const handleBulkVoid = async () => {
    const voidable = selectedInvoices.filter(inv => ['draft', 'issued', 'sent'].includes(inv.status));
    if (voidable.length === 0) return toast.error('No voidable invoices selected (must be draft, issued, or sent)');
    const reason = prompt(`Void ${voidable.length} invoice(s)? Enter reason:`);
    if (!reason) return;

    setBulkProcessing(true);
    let success = 0, failed = 0;
    for (const inv of voidable) {
      try { await voidInvoice({ id: inv.id, reason }).unwrap(); success++; }
      catch { failed++; }
    }
    setBulkProcessing(false);
    clearSelection();
    toast.success(`Voided ${success} invoice(s)${failed > 0 ? `, ${failed} failed` : ''}`);
  };

  const handleBulkDownload = async () => {
    setBulkProcessing(true);
    let success = 0, failed = 0;
    for (const inv of selectedInvoices) {
      try {
        const result = await triggerPdf(inv.id).unwrap();
        if (result.data?.url) {
          window.open(result.data.url, '_blank');
          success++;
        }
      } catch { failed++; }
    }
    setBulkProcessing(false);
    toast.success(`Opened ${success} PDF(s)${failed > 0 ? `, ${failed} failed` : ''}`);
  };

  const handleRunBilling = async () => {
    if (!(await confirmDialog('This will generate invoices for all due billing schedules. Continue?'))) return;
    const result = await runBilling().unwrap();
    toast.success(`Generated ${result.data.generated} invoices from ${result.data.processed} schedules.`);
    if (result.data.errors.length > 0) {
      toast.error(`${result.data.errors.length} errors occurred during billing run`);
    }
  };

  const getTenantName = (inv: any) => {
    if (!inv.tenant) return '—';
    return inv.tenant.tenantType === 'company'
      ? inv.tenant.companyName || ''
      : `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();
  };

  const allSelected = filteredInvoices.length > 0 && selectedIds.size === filteredInvoices.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
            <FileText size={22} />
          </div>
          <div>
            <h1>Invoices</h1>
            <p>Manage billing invoices and credit notes</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleRunBilling} disabled={runningBilling}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={14} /> {runningBilling ? 'Running…' : 'Run Billing'}
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/admin/billing/invoices/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Invoice
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="billing-summary-cards">
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <Receipt size={18} />
          </div>
          <span className="bsc-label">Total Invoices</span>
          <span className="bsc-value">{stats.total}</span>
        </div>
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <DollarSign size={18} />
          </div>
          <span className="bsc-label">Page Revenue</span>
          <span className="bsc-value">{formatCurrency(stats.totalAmount)}</span>
        </div>
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <AlertTriangle size={18} />
          </div>
          <span className="bsc-label">Overdue</span>
          <span className="bsc-value" style={{ color: stats.overdue > 0 ? '#f87171' : undefined }}>{stats.overdue}</span>
        </div>
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <CheckCircle size={18} />
          </div>
          <span className="bsc-label">Paid</span>
          <span className="bsc-value" style={{ color: '#34d399' }}>{stats.paid}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="billing-filters">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input type="text" placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); clearSelection(); }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map(s => (
            <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th style={{ width: 40, paddingLeft: 12 }}>
                <input
                  type="checkbox"
                  className="inv-checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </th>
              <th style={{ width: 140 }}>Invoice #</th>
              <th style={{ width: 160 }}>Tenant</th>
              <th style={{ width: 180 }}>Property / Unit</th>
              <th style={{ width: 150 }}>Period</th>
              <th className="text-right" style={{ width: 110 }}>Total</th>
              <th className="text-right" style={{ width: 110 }}>Paid</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 110 }}>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="billing-empty">
                    {isFetching ? 'Loading invoices…' : 'No invoices found.'}
                  </div>
                </td>
              </tr>
            ) : (
              filteredInvoices.map(inv => {
                const paidNum = Number(inv.paidAmount);
                const totalNum = Number(inv.totalAmount);
                const isSelected = selectedIds.has(inv.id);

                return (
                  <tr
                    key={inv.id}
                    className="clickable"
                    onClick={() => navigate(`/admin/billing/invoices/${inv.id}`)}
                    style={isSelected ? { background: 'rgba(99,102,241,0.06)' } : undefined}
                  >
                    <td style={{ paddingLeft: 12 }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="inv-checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={(e) => toggleSelect(inv.id, e)}
                      />
                    </td>
                    <td>
                      <div className="cell-primary">{inv.invoiceNumber}</div>
                      {inv.invoiceType !== 'invoice' && (
                        <span className={`inv-type inv-type--${inv.invoiceType}`}>{inv.invoiceType.replace('_', ' ')}</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-primary">{getTenantName(inv)}</div>
                    </td>
                    <td>
                      <div className="cell-primary">{inv.property?.name}</div>
                      {inv.unit && <div className="cell-secondary">Unit {inv.unit.unitNumber}</div>}
                    </td>
                    <td>
                      {inv.periodFrom && inv.periodTo ? (
                        <>
                          <div className="cell-primary">{format(new Date(inv.periodFrom), 'MMM d')} – {format(new Date(inv.periodTo), 'MMM d')}</div>
                          <div className="cell-secondary">{format(new Date(inv.periodTo), 'yyyy')}</div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <span className="cell-amount">{formatCurrency(inv.totalAmount, inv.currency)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${paidNum > 0 ? (paidNum >= totalNum ? 'paid' : '') : 'zero'}`}>
                        {formatCurrency(inv.paidAmount, inv.currency)}
                      </span>
                    </td>
                    <td>
                      <span className={`inv-status inv-status--${inv.status}`}>{inv.status.replace('_', ' ')}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{format(new Date(inv.dueDate), 'MMM d, yyyy')}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="billing-pagination">
            <span className="page-info">
              Page {meta.page} of {meta.totalPages} · {meta.total} invoices
            </span>
            <div className="page-btns">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={15} />
              </button>
              <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Bulk Actions Bar ═══ */}
      {someSelected && (
        <div className="bulk-actions-bar">
          <div className="bulk-info">
            <span className="bulk-count">{selectedIds.size}</span>
            <span>invoice{selectedIds.size !== 1 ? 's' : ''} selected</span>
          </div>
          <div className="bulk-btns">
            <button className="bulk-btn send" onClick={handleBulkSend} disabled={bulkProcessing}
              title="Send selected invoices to tenants">
              <Send size={14} /> Send
            </button>
            <button className="bulk-btn download" onClick={handleBulkDownload} disabled={bulkProcessing}
              title="Download PDF for selected invoices">
              <Download size={14} /> Download PDFs
            </button>
            <button className="bulk-btn void" onClick={handleBulkVoid} disabled={bulkProcessing}
              title="Void selected invoices">
              <Ban size={14} /> Void
            </button>
            <button className="bulk-btn deselect" onClick={clearSelection} disabled={bulkProcessing}>
              <XCircle size={14} /> Deselect All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
