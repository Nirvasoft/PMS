import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetInvoicesQuery, useLazyGetInvoicesQuery, useGetInvoiceReportFiltersQuery,
  useRunBillingMutation, useGetBillingSchedulesQuery,
  useVoidInvoiceMutation, useSendInvoiceMutation, useLazyGetInvoicePdfQuery,
  useGetCurrencyRatesQuery,
} from '../../../store/api/billingApi';
import { usePushInvoicesToV6ErpMutation } from '../../../store/api/integrationsApi';
import { useGetPropertiesQuery, useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useV6IntegrationStatus } from '../../../hooks/useV6IntegrationStatus';
import {
  FileText, Plus, Play, Search, ChevronLeft, ChevronRight,
  DollarSign, AlertTriangle, CheckCircle, Receipt,
  Send, Ban, Download, XCircle, X, Building2, UploadCloud, Eye, Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import ComboBox from '../../../components/ComboBox';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import { openInvoicesReportPreview, type InvoiceReportType } from './utils/invoicePrintPreview';
import './BillingPage.css';

const STATUS_OPTIONS = ['', 'draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'disputed'];
const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', currencyDisplay: 'code' }).format(Number(amount));
const formatAmount = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);
const formatCompactAmount = (amount: string | number) => {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  }
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('');
  const [billType, setBillType] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [runBillingModalOpen, setRunBillingModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const activePropertyFilter = useSelectedPropertyFilter();

  // Fetch currency rates scoped to the active property (or company-wide when All Properties is selected)
  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    activePropertyFilter ? { propertyId: activePropertyFilter } : undefined,
  );
  const currencyRates = currencyRatesData?.data ?? [];
  const baseCurrencyCode = currencyRates.find(r => r.isBaseCurrency)?.currency || 'MMK';

  const currencyOptions = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of currencyRates) {
      if (!r.currency) continue;
      map.set(r.currency, Boolean(map.get(r.currency) || r.isBaseCurrency));
    }
    if (map.size === 0) {
      map.set(baseCurrencyCode, true);
    }
    return Array.from(map.entries())
      .sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0) || a[0].localeCompare(b[0]))
      .map(([code, isBase]) => ({ code, isBase }));
  }, [currencyRates, baseCurrencyCode]);

  // Default currency filter to Base Currency whenever property or base currency changes
  useEffect(() => {
    setCurrencyFilter(baseCurrencyCode);
  }, [activePropertyFilter, baseCurrencyCode]);

  const activeCurrency = currencyFilter === 'ALL' ? undefined : (currencyFilter || baseCurrencyCode);

  const hasActiveFilters = Boolean(
    status ||
    billType ||
    fromDate ||
    toDate ||
    (currencyFilter && currencyFilter !== baseCurrencyCode)
  );

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset pagination whenever the sidebar's Active Property, filters, pageSize, or search changes.
  useEffect(() => { setPage(1); }, [activePropertyFilter, status, currencyFilter, billType, fromDate, toDate, debouncedSearch, pageSize]);

  const { data, isFetching, refetch } = useGetInvoicesQuery({
    propertyId: activePropertyFilter || undefined,
    status: status || undefined,
    currency: activeCurrency,
    billType: billType || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    search: debouncedSearch || undefined,
    includeLines: false,
    page, limit: pageSize,
  });
  const [runBilling, { isLoading: runningBilling }] = useRunBillingMutation();
  const [voidInvoice] = useVoidInvoiceMutation();
  const [sendInvoice] = useSendInvoiceMutation();
  const [triggerPdf] = useLazyGetInvoicePdfQuery();
  const [pushInvoicesToV6Erp, { isLoading: pushingToV6 }] = usePushInvoicesToV6ErpMutation();
  const { isV6Active } = useV6IntegrationStatus();
  const confirmDialog = useConfirm();

  const invoices = data?.data || [];
  const meta = data?.meta;

  // V6 ERP result modal state
  const [v6ErpResult, setV6ErpResult] = useState<null | {
    sent: number; failed: number; skipped: number;
    results: Array<{ invoiceId: string; invoiceNumber: string; customerCode: string; status: string; error?: string }>;
    message: string;
  }>(null);

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

  const displayCurrencyCode = activeCurrency || baseCurrencyCode || 'MMK';

  const stats = useMemo(() => {
    const all = invoices;
    const byCurrency: Record<string, number> = {};
    let totalInDisplayCurrency = 0;
    for (const inv of all) {
      const cur = inv.currency || 'USD';
      byCurrency[cur] = (byCurrency[cur] || 0) + Number(inv.totalAmount);
      totalInDisplayCurrency += convertCurrency(Number(inv.totalAmount), cur, displayCurrencyCode);
    }
    return {
      total: meta?.total || 0,
      totalInDisplayCurrency,
      byCurrency,
      overdue: all.filter(i => i.status === 'overdue').length,
      paid: all.filter(i => i.status === 'paid').length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, meta, currencyRates, baseCurrencyCode, displayCurrencyCode]);


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
        const url = typeof result === 'string' ? result : (result as any)?.data?.url;
        if (url) {
          window.open(url, '_blank');
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
    if (inv.tenant.tenantType && inv.tenant.tenantType !== 'individual') {
      return inv.tenant.companyName || '—';
    }
    return inv.tenant.lastName || inv.tenant.firstName || '—';
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
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <FileText size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Invoices</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {meta ? `${meta.total} total invoices` : 'Loading…'}
            </p>
          </div>
          <PermissionGuard permission="billing-invoices.write">
            <button className="btn btn-primary" onClick={() => navigate('/admin/billing/invoices/new')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Invoice
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Summary Cards (Compact Modified Design) */}
      <div className="billing-summary-cards">
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <Receipt size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Total Invoices</span>
            <span className="bsc-value">{stats.total.toLocaleString()}</span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <DollarSign size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Page Revenue</span>
            <span
              className="bsc-value"
              title={formatAmount(stats.totalInDisplayCurrency)}
              style={{ cursor: 'help' }}
            >
              {formatCompactAmount(stats.totalInDisplayCurrency)}
            </span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <AlertTriangle size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Overdue</span>
            <span className="bsc-value" style={{ color: stats.overdue > 0 ? '#f87171' : undefined }}>
              {stats.overdue}
            </span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <CheckCircle size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Paid</span>
            <span className="bsc-value" style={{ color: '#34d399' }}>
              {stats.paid}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search + Filter Toggle (Left) & Actions (Right) */}
      <div className="billing-filters" style={showFilters ? { marginBottom: 12 } : undefined}>
        <div className="billing-filters-left">
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search invoice or tenant"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clear-btn" onClick={() => setSearch('')} title="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="button"
            className={`btn btn-secondary billing-filter-toggle-btn${showFilters || hasActiveFilters ? ' active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} /> Filters{hasActiveFilters ? ' •' : ''}
          </button>
        </div>

        <div className="billing-filters-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setReportModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Eye size={14} /> View Report
          </button>
          <PermissionGuard permission="billing-invoices.write">
            {isV6Active && (
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
            )}
            <button className="btn btn-secondary" onClick={() => setRunBillingModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Play size={14} /> Run Billing
            </button>
          </PermissionGuard>
        </div>
      </div>

      {showFilters && (
        <div className="billing-filter-bar">
          <select
            className="filter-select"
            value={currencyFilter || baseCurrencyCode}
            onChange={e => { setCurrencyFilter(e.target.value); setPage(1); clearSelection(); }}
            title="Currency"
          >
            {currencyOptions.map(c => (
              <option key={c.code} value={c.code}>
                {c.code}{c.isBase ? ' (Base)' : ''}
              </option>
            ))}
            <option value="ALL">All Currencies</option>
          </select>

          <select
            className="filter-select"
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); clearSelection(); }}
            title="Status"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={billType}
            onChange={e => { setBillType(e.target.value); setPage(1); clearSelection(); }}
            title="Bill Type"
          >
            <option value="">All Bills</option>
            <option value="monthly">Monthly Bill</option>
            <option value="rental">Rental Bill</option>
          </select>

          <div className="billing-filter-date-range">
            <input
              type="date"
              className="filter-date-input"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(1); clearSelection(); }}
              title="From Issue Date"
            />
            <span className="filter-date-sep">to</span>
            <input
              type="date"
              className="filter-date-input"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(1); clearSelection(); }}
              title="To Issue Date"
            />
          </div>

          <button
            type="button"
            className="btn-ghost billing-filter-reset-btn"
            onClick={() => {
              setCurrencyFilter(baseCurrencyCode);
              setStatus('');
              setBillType('');
              setFromDate('');
              setToDate('');
              setPage(1);
              clearSelection();
            }}
          >
            <X size={14} /> Reset
          </button>
        </div>
      )}

      {/* Table */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
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
              <th style={{ width: 120 }}>Unit</th>
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
                const displayTotal = inv.tenant?.currency && inv.tenant.currency !== inv.currency
                  ? convertCurrency(totalNum, inv.currency, inv.tenant.currency)
                  : totalNum;
                const displayPaid = inv.tenant?.currency && inv.tenant.currency !== inv.currency
                  ? convertCurrency(paidNum, inv.currency, inv.tenant.currency)
                  : paidNum;

                return (
                  <tr
                    key={inv.id}
                    className={`clickable${isSelected ? ' row-selected' : ''}`}
                    onClick={() => navigate(`/admin/billing/invoices/${inv.id}`)}
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
                      <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {inv.invoiceDate ? format(new Date(inv.invoiceDate), 'yyyy-MM-dd') : '—'}
                      </div>
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
                      <div className="cell-primary">{inv.unit?.unitNumber || '—'}</div>
                    </td>
                    <td className="text-right">
                      <span className="cell-amount" title={formatAmount(displayTotal)}>
                        {formatCompactAmount(displayTotal)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span
                        className={`cell-amount ${paidNum > 0 ? (paidNum >= totalNum ? 'paid' : '') : 'zero'}`}
                        title={formatAmount(displayPaid)}
                      >
                        {formatCompactAmount(displayPaid)}
                      </span>
                    </td>
                    <td>
                      <span className={`inv-status inv-status--${inv.status}`}>{inv.status.replace('_', ' ')}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {inv.dueDate ? format(new Date(inv.dueDate), 'yyyy-MM-dd') : '—'}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </TableScrollWrapper>

        {/* Pagination */}
        {meta && meta.total >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="inv-page-size">Rows per page:</label>
                <select
                  id="inv-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="page-btns">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {meta.page} of {Math.max(meta.totalPages, 1)}
              </span>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage(p => p + 1)}
                title="Next page"
              >
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
              {isV6Active && (
                <button
                  className="bulk-btn v6-erp"
                  onClick={handleBulkSendToV6Erp}
                  disabled={bulkProcessing || pushingToV6}
                  title="Send selected issued invoices to V6 ERP"
                >
                  <UploadCloud size={14} /> Send to V6 ERP
                </button>
              )}
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

      {reportModalOpen && (
        <ViewInvoiceReportModal
          activeProperty={activePropertyFilter}
          onClose={() => setReportModalOpen(false)}
        />
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

  const getTenantName = (s: any) => {
    if (!s.tenant) return '—';
    if (s.tenant.tenantType && s.tenant.tenantType !== 'individual') {
      return s.tenant.companyName || '—';
    }
    return s.tenant.lastName || s.tenant.firstName || '—';
  };

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
                    <span>{s.nextBillingDate ? format(new Date(s.nextBillingDate), 'yyyy-MM-dd') : '—'}</span>
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

// ── View Invoice Report Modal ────────────────────────
function ViewInvoiceReportModal({
  activeProperty,
  onClose,
}: {
  activeProperty: string;
  onClose: () => void;
}) {
  const { data: filterMetaResp } = useGetInvoiceReportFiltersQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const filterMeta = filterMetaResp?.data;

  const [triggerFetchReportInvoices, { isFetching: generatingReport }] = useLazyGetInvoicesQuery();

  const defaultDates = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      min: format(firstDay, 'yyyy-MM-dd'),
      max: format(lastDay, 'yyyy-MM-dd'),
    };
  }, []);

  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    activeProperty ? { propertyId: activeProperty } : undefined,
  );
  const currencyRates = currencyRatesData?.data ?? [];
  const baseCurrencyCode = currencyRates.find(r => r.isBaseCurrency)?.currency || 'MMK';

  const currencyOptions = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of currencyRates) {
      if (!r.currency) continue;
      map.set(r.currency, Boolean(map.get(r.currency) || r.isBaseCurrency));
    }
    if (map.size === 0) {
      map.set(baseCurrencyCode, true);
    }
    return Array.from(map.entries())
      .sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0) || a[0].localeCompare(b[0]))
      .map(([code, isBase]) => ({ code, isBase }));
  }, [currencyRates, baseCurrencyCode]);

  const [reportType, setReportType] = useState<InvoiceReportType>('summary');
  const [billType, setBillType] = useState<string>('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>(() => defaultDates.min);
  const [toDate, setToDate] = useState<string>(() => defaultDates.max);
  const [startInvoice, setStartInvoice] = useState<string>('');
  const [endInvoice, setEndInvoice] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('invoiceNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [validationError, setValidationError] = useState<string>('');

  useEffect(() => {
    setCurrencyFilter(baseCurrencyCode);
  }, [activeProperty, baseCurrencyCode]);

  const activeCurrency = currencyFilter === 'ALL' ? undefined : (currencyFilter || baseCurrencyCode);

  const floorOptions = useMemo(() => filterMeta?.floors || [], [filterMeta?.floors]);

  const unitOptions = useMemo(() => {
    const list = filterMeta?.units || [];
    const set = new Set<string>();
    list.forEach(u => {
      if (floor && u.floor !== floor) return;
      if (u.unitNumber) set.add(u.unitNumber);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [filterMeta?.units, floor]);

  const tenantComboOptions = useMemo(() => {
    const items = filterMeta?.tenantItems || [];
    return items.map((t) => {
      const topLine = t.firstName || t.lastName;
      const subLine = t.firstName && t.lastName && t.lastName !== t.firstName ? t.lastName : undefined;
      return {
        id: t.id,
        label: topLine,
        sublabel: subLine,
      };
    });
  }, [filterMeta?.tenantItems]);

  const selectedTenantDisplay = useMemo(() => {
    if (!tenantId) return '';
    const found = (filterMeta?.tenantItems || []).find((t) => t.id === tenantId);
    if (!found) return '';
    return [found.firstName, found.lastName].filter(Boolean).join(' - ');
  }, [tenantId, filterMeta?.tenantItems]);

  const statusOptions = useMemo(() => filterMeta?.statuses || [], [filterMeta?.statuses]);

  useEffect(() => {
    if (fromDate && toDate && fromDate > toDate) {
      setValidationError('From Date cannot be later than To Date.');
    } else if (startInvoice.trim() && endInvoice.trim() && startInvoice.trim() > endInvoice.trim()) {
      setValidationError('Start Invoice cannot be greater than End Invoice.');
    } else {
      setValidationError('');
    }
  }, [billType, currencyFilter, fromDate, toDate, startInvoice, endInvoice, floor, unitNumber, tenantId, statusFilter]);

  const handleResetFilters = () => {
    setBillType('');
    setCurrencyFilter(baseCurrencyCode);
    setFromDate(defaultDates.min);
    setToDate(defaultDates.max);
    setStartInvoice('');
    setEndInvoice('');
    setFloor('');
    setUnitNumber('');
    setTenantId('');
    setStatusFilter('');
    setSortBy('invoiceNumber');
    setSortOrder('asc');
    setValidationError('');
  };

  const handleGenerateReport = async () => {
    if (!reportType) {
      toast.error('Please select a Report Type');
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setValidationError('From Date cannot be later than To Date.');
      toast.error('From Date cannot be later than To Date');
      return;
    }
    if (startInvoice.trim() && endInvoice.trim() && startInvoice.trim() > endInvoice.trim()) {
      setValidationError('Start Invoice cannot be greater than End Invoice.');
      toast.error('Start Invoice cannot be greater than End Invoice');
      return;
    }

    setValidationError('');

    const baseFilterParams: Record<string, any> = {
      includeLines: reportType !== 'summary',
      sortBy,
      sortOrder,
    };
    if (activeProperty) baseFilterParams.propertyId = activeProperty;
    if (activeCurrency) baseFilterParams.currency = activeCurrency;
    if (billType) baseFilterParams.billType = billType;
    if (startInvoice.trim()) baseFilterParams.startInvoice = startInvoice.trim();
    if (endInvoice.trim()) baseFilterParams.endInvoice = endInvoice.trim();
    if (fromDate) baseFilterParams.from = fromDate;
    if (toDate) baseFilterParams.to = toDate;
    if (floor) baseFilterParams.floor = floor;
    if (unitNumber) baseFilterParams.unitNumber = unitNumber;
    if (tenantId) baseFilterParams.tenantId = tenantId;
    if (statusFilter) baseFilterParams.status = statusFilter;

    const reportFiltersInfo = {
      currency: activeCurrency || undefined,
      billType: billType ? (billType === 'monthly' ? 'Monthly Bill' : 'Rental Bill') : undefined,
      startInvoice: startInvoice.trim() || undefined,
      endInvoice: endInvoice.trim() || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      floor: floor || undefined,
      unit: unitNumber || undefined,
      tenant: selectedTenantDisplay || undefined,
      status: statusFilter || undefined,
    };

    let previewWin: Window | null = null;

    const loadReportPage = async (
      targetPage: number,
      targetPageSize: number,
      cachedTotals?: Record<string, { subtotal: number; tax: number; total: number; paid: number; outstanding: number }>,
    ) => {
      try {
        const res = await triggerFetchReportInvoices({
          ...baseFilterParams,
          page: targetPage,
          limit: targetPageSize,
          includeTotals: !cachedTotals,
        }).unwrap();

        const fetched = res?.data || [];
        if (fetched.length === 0 && targetPage === 1) {
          if (previewWin) previewWin.close();
          setValidationError('No invoices match the current filter criteria.');
          toast.error('No invoices match the current filter criteria.');
          return;
        }

        if (!previewWin || previewWin.closed) {
          previewWin = window.open('', '_blank');
          if (!previewWin) {
            toast.error('Popup blocked! Please allow popups for this site to view the report.');
            return;
          }
        }

        const total = res?.meta?.total ?? fetched.length;
        const totalPages = res?.meta?.totalPages ?? Math.max(1, Math.ceil(total / targetPageSize));
        const totalsByCurrency = cachedTotals || res?.meta?.totalsByCurrency;

        openInvoicesReportPreview({
          reportType,
          invoices: fetched,
          targetWindow: previewWin,
          filters: reportFiltersInfo,
          pagination: {
            page: targetPage,
            pageSize: targetPageSize,
            total,
            totalPages,
            totalsByCurrency,
            onPageChange: (nextPage, nextSize) => {
              loadReportPage(nextPage, nextSize, totalsByCurrency);
            },
          },
        });
      } catch (err: any) {
        if (targetPage === 1 && previewWin) {
          previewWin.close();
        }
        toast.error(err?.data?.errors?.[0]?.message || 'Failed to generate invoice report');
      }
    };

    await loadReportPage(1, 500);
  };

  return (
    <div className="rb-overlay" onClick={onClose}>
      <div className="rb-modal rb-modal-lg" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="rb-header">
          <div className="rb-title">
            <Eye size={16} /> View Invoice Report
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="rb-body">
          {/* Report Type */}
          <div className="rb-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>Report Type <span style={{ color: '#ef4444' }}>*</span></label>
              {(billType || (currencyFilter && currencyFilter !== baseCurrencyCode) || startInvoice.trim() || endInvoice.trim() || floor || unitNumber || tenantId || statusFilter || sortBy !== 'invoiceNumber' || sortOrder !== 'asc' || fromDate !== defaultDates.min || toDate !== defaultDates.max) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent, #10b981)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value as InvoiceReportType)}
            >
              <option value="summary">Invoice Summary Report</option>
              <option value="detail">Invoice Detail Report</option>
              <option value="voucher">Invoice Voucher Print Preview</option>
            </select>
          </div>

          {/* Bill Type & Currency */}
          <div className="rb-grid-2">
            <div className="rb-field">
              <label>Bill Type</label>
              <select
                value={billType}
                onChange={e => setBillType(e.target.value)}
              >
                <option value="">All Bills</option>
                <option value="monthly">Monthly Bill</option>
                <option value="rental">Rental Bill</option>
              </select>
            </div>
            <div className="rb-field">
              <label>Currency</label>
              <select
                value={currencyFilter || baseCurrencyCode}
                onChange={e => setCurrencyFilter(e.target.value)}
              >
                {currencyOptions.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code}{c.isBase ? ' (Base)' : ''}
                  </option>
                ))}
                <option value="ALL">All Currencies</option>
              </select>
            </div>
          </div>

          {/* Date Range Validation */}
          <div className="rb-grid-2">
            <div className="rb-field">
              <label>From Date (Issue Date)</label>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div className="rb-field">
              <label>To Date (Issue Date)</label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </div>

          {/* Start Invoice & End Invoice */}
          <div className="rb-grid-2">
            <div className="rb-field">
              <label>Start Invoice</label>
              <input
                type="text"
                placeholder="e.g. INV-000001"
                value={startInvoice}
                onChange={e => setStartInvoice(e.target.value)}
              />
            </div>
            <div className="rb-field">
              <label>End Invoice</label>
              <input
                type="text"
                placeholder="e.g. INV-000500"
                value={endInvoice}
                onChange={e => setEndInvoice(e.target.value)}
              />
            </div>
          </div>

          {/* Floor & Unit Validation */}
          <div className="rb-grid-2">
            <div className="rb-field">
              <label>Floor</label>
              <select
                value={floor}
                onChange={e => {
                  setFloor(e.target.value);
                  setUnitNumber('');
                }}
              >
                <option value="">All Floors</option>
                {floorOptions.map(fl => (
                  <option key={fl} value={fl}>{fl}</option>
                ))}
              </select>
            </div>
            <div className="rb-field">
              <label>Unit / Room</label>
              <select
                value={unitNumber}
                onChange={e => setUnitNumber(e.target.value)}
              >
                <option value="">All Units</option>
                {unitOptions.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tenant & Status Validation */}
          <div className="rb-grid-2">
            <div className="rb-field">
              <label>Tenant</label>
              <ComboBox
                id="report-tenant"
                value={tenantId}
                placeholder="All Tenants"
                emptyText="No tenants found"
                options={tenantComboOptions}
                onChange={val => setTenantId(val)}
              />
            </div>
            <div className="rb-field">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sort By & Sort Order */}
          <div className="rb-grid-2">
            <div className="rb-field">
              <label>Sort By</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="invoiceNumber">Invoice Number</option>
                <option value="issueDate">Issue Date</option>
                <option value="dueDate">Due Date</option>
                <option value="floor">Floor</option>
                <option value="unit">Unit / Room</option>
                <option value="tenant">Tenant</option>
                <option value="totalAmount">Total Amount</option>
              </select>
            </div>
            <div className="rb-field">
              <label>Sort Order</label>
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as 'asc' | 'desc')}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>

          {/* Validation Banner */}
          {validationError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '0.82rem',
                fontWeight: 500,
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{validationError}</span>
            </div>
          )}

          <p className="rb-hint">
            <FileText size={12} />
            Opens a printable report preview window where you can print or save as PDF.
          </p>
        </div>

        <div className="rb-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleGenerateReport}
            disabled={generatingReport}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Eye size={14} /> {generatingReport ? 'Loading…' : 'View Report'}
          </button>
        </div>
      </div>
    </div>
  );
}


