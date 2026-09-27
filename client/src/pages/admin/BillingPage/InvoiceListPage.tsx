import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  useGetInvoicesQuery, useRunBillingMutation, useGetBillingSchedulesQuery,
  useVoidInvoiceMutation, useSendInvoiceMutation, useLazyGetInvoicePdfQuery,
  useGetCurrencyRatesQuery,
} from '../../../store/api/billingApi';
import { usePushInvoicesToV6ErpMutation } from '../../../store/api/integrationsApi';
import { useGetPropertiesQuery, useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  FileText, Plus, Play, Search, ChevronLeft, ChevronRight,
  DollarSign, AlertTriangle, CheckCircle, Receipt,
  Send, Ban, Download, XCircle, X, Building2, UploadCloud,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './BillingPage.css';

const STATUS_OPTIONS = ['', 'draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'disputed'];
const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', currencyDisplay: 'code' }).format(Number(amount));

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [runBillingModalOpen, setRunBillingModalOpen] = useState(false);

  const activePropertyFilter = useSelectedPropertyFilter();

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset pagination whenever the sidebar's Active Property, status, or search changes.
  useEffect(() => { setPage(1); }, [activePropertyFilter, status, debouncedSearch]);

  const { data, isFetching, refetch } = useGetInvoicesQuery({
    propertyId: activePropertyFilter || undefined,
    status: status || undefined,
    search: debouncedSearch || undefined,
    page, limit: 15,
  });
  const [runBilling, { isLoading: runningBilling }] = useRunBillingMutation();
  const [voidInvoice] = useVoidInvoiceMutation();
  const [sendInvoice] = useSendInvoiceMutation();
  const [triggerPdf] = useLazyGetInvoicePdfQuery();
  const [pushInvoicesToV6Erp, { isLoading: pushingToV6 }] = usePushInvoicesToV6ErpMutation();
  const confirmDialog = useConfirm();

  const invoices = data?.data || [];
  const meta = data?.meta;

  // V6 ERP result modal state
  const [v6ErpResult, setV6ErpResult] = useState<null | {
    sent: number; failed: number; skipped: number;
    results: Array<{ invoiceId: string; invoiceNumber: string; customerCode: string; status: string; error?: string }>;
    message: string;
  }>(null);


  // Fetch currency rates scoped to the active property so Page Revenue is expressed
  // in that property's base currency. When "All Properties" is selected (no propertyId),
  // rates are skipped and amounts are grouped by their own currency instead.
  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    activePropertyFilter ? { propertyId: activePropertyFilter } : skipToken,
  );
  const currencyRates = currencyRatesData?.data ?? [];
  const baseCurrencyCode = currencyRates.find(r => r.isBaseCurrency)?.currency ?? '';

  // Convert an amount from `fromCurrency` to the property's base currency using the
  // same two-hop method used across the rest of the app (currency → base via rate/operator).
  const toBase = (amount: number, fromCurrency: string): number => {
    if (!fromCurrency || fromCurrency === baseCurrencyCode) return amount;
    const row = currencyRates.find(r => r.currency === fromCurrency);
    if (!row) return amount;
    return row.operator === 'divide' ? amount / Number(row.rate) : amount * Number(row.rate);
  };

  // Two-hop conversion: fromCurrency → base → toCurrency
  const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount;
    const baseAmount = toBase(amount, fromCurrency);
    if (toCurrency === baseCurrencyCode) return baseAmount;
    const toRow = currencyRates.find(r => r.currency === toCurrency);
    if (!toRow) return baseAmount;
    return toRow.operator === 'divide' ? baseAmount * Number(toRow.rate) : baseAmount / Number(toRow.rate);
  };

  const stats = useMemo(() => {
    const all = invoices;
    // Group raw totals by currency for the "All Properties" multi-currency display
    const byCurrency: Record<string, number> = {};
    let totalInBase = 0;
    for (const inv of all) {
      const cur = inv.currency || 'USD';
      byCurrency[cur] = (byCurrency[cur] || 0) + Number(inv.totalAmount);
      totalInBase += toBase(Number(inv.totalAmount), cur);
    }
    return {
      total: meta?.total || 0,
      totalInBase,
      byCurrency,
      overdue: all.filter(i => i.status === 'overdue').length,
      paid: all.filter(i => i.status === 'paid').length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, meta, currencyRates, baseCurrencyCode]);


  // Filtering by invoice # / tenant name happens server-side (see `search` above), so it
  // covers every matching invoice — not just whichever page happened to be loaded.
  const filteredInvoices = invoices;

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

  const handleRunBilling = async (propertyId: string, asOfDate: string) => {
    try {
      const result = await runBilling({ propertyId: propertyId || undefined, asOfDate }).unwrap();
      toast.success(`Generated ${result.data.generated} invoices from ${result.data.processed} schedules.`);
      if (result.data.errors.length > 0) {
        toast.error(`${result.data.errors.length} errors occurred during billing run`);
      }
      setRunBillingModalOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to run billing');
    }
  };

  const getTenantName = (inv: any) => {
    if (!inv.tenant) return '—';
    return inv.tenant.tenantType !== 'individual'
      ? inv.tenant.companyName || ''
      : `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();
  };

  // ── V6 ERP Handlers ────────────────────────────────────────────────────────

  /** Send ALL issued invoices to V6 ERP (header button) */
  const handleSendAllToV6Erp = async () => {
    const issuedCount = invoices.filter(i => i.status === 'issued').length;
    if (issuedCount === 0) {
      return toast.error('No "issued" invoices on this page. Filter by Status = Issued first.');
    }
    if (!(await confirmDialog(
      `Send ${issuedCount} issued invoice(s) to V6 ERP?\n\nOnly invoices with status "issued" will be sent. Status will change to "sent" upon completion.`,
    ))) return;
    try {
      const result = await pushInvoicesToV6Erp().unwrap();
      setV6ErpResult(result.data);
      refetch();
      if (result.data.sent > 0) toast.success(`${result.data.sent} invoice(s) sent to V6 ERP (status changed to sent).`);
      if (result.data.failed > 0) toast.error(`${result.data.failed} invoice(s) failed.`);
    } catch (err: any) {
      const msg = err?.data?.errors?.[0]?.message
        || err?.data?.message
        || err?.error
        || 'Failed to connect to V6 ERP. Check Developer → Integrations → V6 ERP config.';
      toast.error(msg);
      console.error('[V6 ERP] push error:', err);
    }
  };

  /** Send only SELECTED issued invoices to V6 ERP (bulk action bar) */
  const handleBulkSendToV6Erp = async () => {
    const issuedSelected = selectedInvoices.filter(i => i.status === 'issued');
    if (issuedSelected.length === 0) {
      return toast.error('None of the selected invoices have status "issued".');
    }
    if (!(await confirmDialog(
      `Send ${issuedSelected.length} selected issued invoice(s) to V6 ERP?\n\nStatus will change to "sent" upon completion.`,
    ))) return;
    try {
      const result = await pushInvoicesToV6Erp({ invoiceIds: issuedSelected.map(i => i.id) }).unwrap();
      setV6ErpResult(result.data);
      clearSelection();
      refetch();
      if (result.data.sent > 0) toast.success(`${result.data.sent} invoice(s) sent to V6 ERP (status changed to sent).`);
      if (result.data.failed > 0) toast.error(`${result.data.failed} invoice(s) failed.`);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to connect to V6 ERP.');
    }
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
        <PermissionGuard permission="billing-invoices.write">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={handleSendAllToV6Erp}
              disabled={pushingToV6}
              title="Send all issued invoices to V6 ERP"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
            >
              <UploadCloud size={14} />
              {pushingToV6 ? 'Sending…' : 'Send to V6 ERP'}
            </button>
            <button className="btn btn-secondary" onClick={() => setRunBillingModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Play size={14} /> Run Billing
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/admin/billing/invoices/new')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Invoice
            </button>
          </div>
        </PermissionGuard>
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
          {/* Property selected → show total converted to base currency.
              All Properties  → list each currency's raw total separately. */}
          {baseCurrencyCode ? (
            <span className="bsc-value">{formatCurrency(stats.totalInBase, baseCurrencyCode)}</span>
          ) : Object.keys(stats.byCurrency).length <= 1 ? (
            <span className="bsc-value">
              {formatCurrency(stats.totalInBase, Object.keys(stats.byCurrency)[0] || 'USD')}
            </span>
          ) : (
            <span className="bsc-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, fontSize: 13 }}>
              {Object.entries(stats.byCurrency).map(([cur, amt]) => (
                <span key={cur}>{formatCurrency(amt, cur)}</span>
              ))}
            </span>
          )}
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
          <input type="text" placeholder="Search invoice or tenant" value={search} onChange={e => setSearch(e.target.value)} />
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
              <th style={{ width: 110 }}>Invoice Date</th>
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
                <td colSpan={10}>
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
                      <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{format(new Date(inv.invoiceDate), 'MMM d, yyyy')}</div>
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
                      <span className="cell-amount">
                        {inv.tenant?.currency && inv.tenant.currency !== inv.currency ? (
                          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            <span>{formatCurrency(convertCurrency(Number(inv.totalAmount), inv.currency, inv.tenant.currency), inv.tenant.currency)}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>{formatCurrency(inv.totalAmount, inv.currency)}</span>
                          </span>
                        ) : formatCurrency(inv.totalAmount, inv.currency)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${paidNum > 0 ? (paidNum >= totalNum ? 'paid' : '') : 'zero'}`}>
                        {inv.tenant?.currency && inv.tenant.currency !== inv.currency ? (
                          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            <span>{formatCurrency(convertCurrency(Number(inv.paidAmount), inv.currency, inv.tenant.currency), inv.tenant.currency)}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>{formatCurrency(inv.paidAmount, inv.currency)}</span>
                          </span>
                        ) : formatCurrency(inv.paidAmount, inv.currency)}
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
            <PermissionGuard permission="billing-invoices.write">
              <button className="bulk-btn send" onClick={handleBulkSend} disabled={bulkProcessing}
                title="Send selected invoices to tenants">
                <Send size={14} /> Send
              </button>
            </PermissionGuard>
            <button className="bulk-btn download" onClick={handleBulkDownload} disabled={bulkProcessing}
              title="Download PDF for selected invoices">
              <Download size={14} /> Download PDFs
            </button>
            <PermissionGuard permission="billing-invoices.write">
              {/* V6 ERP Bulk Push — only issued invoices will be forwarded */}
              <button
                className="bulk-btn"
                onClick={handleBulkSendToV6Erp}
                disabled={bulkProcessing || pushingToV6}
                title="Send selected issued invoices to V6 ERP"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <UploadCloud size={14} /> Send to V6 ERP
              </button>
              <button className="bulk-btn void" onClick={handleBulkVoid} disabled={bulkProcessing}
                title="Void selected invoices">
                <Ban size={14} /> Void
              </button>
            </PermissionGuard>
            <button className="bulk-btn deselect" onClick={clearSelection} disabled={bulkProcessing}>
              <XCircle size={14} /> Deselect All
            </button>
          </div>
        </div>
      )}

      {runBillingModalOpen && (
        <RunBillingModal
          activeProperty={activePropertyFilter}
          onClose={() => setRunBillingModalOpen(false)}
          onSubmit={handleRunBilling}
          isLoading={runningBilling}
        />
      )}

      {/* ═══ V6 ERP Result Modal ═══ */}
      {v6ErpResult && (
        <div className="mall-modal-overlay" onClick={() => setV6ErpResult(null)}>
          <div className="mall-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UploadCloud size={18} /> V6 ERP — Push Result
              </h3>
              <button className="mall-modal-close" onClick={() => setV6ErpResult(null)}>✕</button>
            </div>
            <div className="mall-modal-body">
              {/* Summary */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{v6ErpResult.sent}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Sent ✅</div>
                </div>
                <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{v6ErpResult.failed}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Failed ❌</div>
                </div>
                <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{v6ErpResult.skipped}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Skipped ⚠️</div>
                </div>
              </div>

              {/* Per-invoice results */}
              {v6ErpResult.results.length > 0 && (
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {v6ErpResult.results.map(r => (
                    <div key={r.invoiceId} style={{
                      padding: '8px 12px', borderRadius: 8,
                      border: `1px solid ${r.status === 'sent' ? 'rgba(16,185,129,0.2)' : r.status === 'failed' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      background: r.status === 'sent' ? 'rgba(16,185,129,0.05)' : r.status === 'failed' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{r.invoiceNumber}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          color: r.status === 'sent' ? '#10b981' : r.status === 'failed' ? '#ef4444' : '#f59e0b',
                        }}>
                          {r.status === 'sent' ? '✅ Sent' : r.status === 'failed' ? '❌ Failed' : '⚠️ Skipped'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        CustomerCode: <strong>{r.customerCode || '—'}</strong>
                      </div>
                      {r.error && (
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{r.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {v6ErpResult.results.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>
                  No issued invoices were found to send.
                </p>
              )}
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-primary" onClick={() => setV6ErpResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Run Billing Modal ────────────────────────
function RunBillingModal({ activeProperty, onClose, onSubmit, isLoading }: {
  activeProperty: string;
  onClose: () => void;
  onSubmit: (propertyId: string, asOfDate: string) => void;
  isLoading: boolean;
}) {
  const todayStr = new Date().toISOString().split('T')[0];
  // Locked to the sidebar's Active Property, same convention as elsewhere — only when
  // "All Properties" is active can a specific property (or "All Properties" itself) be
  // chosen here.
  const propertyLocked = !!activeProperty;
  const [manualPropertyId, setManualPropertyId] = useState('');
  const propertyId = propertyLocked ? activeProperty : manualPropertyId;
  const [asOfDate, setAsOfDate] = useState(todayStr);

  const { data: propertiesData } = useGetPropertiesQuery({ limit: 200 });
  const properties = propertiesData?.data || [];
  // /properties requires properties.read, which a billing-only role may lack — use the
  // permission-free /properties/my-scope endpoint so the locked field still resolves
  // a name instead of silently rendering as unselected. See useSelectedPropertyId.ts.
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const lockedPropertyName = (scopeData?.data || []).find((p) => p.id === activeProperty)?.name;

  const { data: schedulesData, isFetching: schedulesLoading } = useGetBillingSchedulesQuery({
    status: 'active',
    propertyId: propertyId || undefined,
    limit: 200,
  });

  const dueSchedules = useMemo(() => {
    const schedules = schedulesData?.data || [];
    return schedules.filter(s =>
      s.nextBillingDate && s.nextBillingDate.split('T')[0] <= asOfDate
    );
  }, [schedulesData, asOfDate]);

  const getTenantName = (s: any) => s.tenant?.tenantType && s.tenant.tenantType !== 'individual'
    ? s.tenant.companyName || ''
    : `${s.tenant?.firstName || ''} ${s.tenant?.lastName || ''}`.trim();

  const handleSubmit = () => {
    if (!asOfDate || asOfDate > todayStr) {
      toast.error('Bill date cannot be in the future');
      return;
    }
    onSubmit(propertyId, asOfDate);
  };

  return (
    <div className="rb-overlay" onClick={onClose}>
      <div className="rb-modal rb-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="rb-header">
          <div className="rb-title"><Play size={16} /> Run Billing</div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="rb-body">
          <div className="rb-grid-2">
            <div className="rb-field">
              <label>Property</label>
              <select value={propertyId} disabled={propertyLocked} onChange={e => setManualPropertyId(e.target.value)}>
                {propertyLocked ? (
                  <option value={propertyId}>{lockedPropertyName || 'Loading…'}</option>
                ) : (
                  <>
                    <option value="">All Properties</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </>
                )}
              </select>
            </div>
            <div className="rb-field">
              <label>Bill Date</label>
              <input
                type="date"
                value={asOfDate}
                max={todayStr}
                onChange={e => setAsOfDate(e.target.value)}
              />
            </div>
          </div>

          <div className="rb-field">
            <label>Due Schedules ({dueSchedules.length})</label>
            <div className="rb-schedule-list">
              <div className="rb-schedule-row rb-schedule-header">
                <span>Charge</span>
                <span>Tenant</span>
                <span>Next Billing Day</span>
                <span className="text-right">Amount</span>
              </div>
              {schedulesLoading ? (
                <div className="rb-schedule-empty">Loading…</div>
              ) : dueSchedules.length === 0 ? (
                <div className="rb-schedule-empty">No active schedules due on or before this date.</div>
              ) : (
                dueSchedules.map(s => (
                  <div key={s.id} className="rb-schedule-row">
                    <span className="rb-schedule-charge">{s.description || s.chargeType.name}</span>
                    <span>{getTenantName(s)}</span>
                    <span>{s.nextBillingDate ? format(new Date(s.nextBillingDate), 'MMM d, yyyy') : '—'}</span>
                    <span className="text-right">{formatCurrency(s.amount, s.currency)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="rb-hint">
            <Building2 size={12} />
            Generates invoices for all billing schedules due on or before the selected date
            {propertyId ? '' : ', across all properties'}.
          </p>
        </div>

        <div className="rb-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={14} /> {isLoading ? 'Running…' : 'Run Billing'}
          </button>
        </div>
      </div>
    </div>
  );
}
