import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetInvoicesQuery, useRunBillingMutation } from '../../../store/api/billingApi';
import { FileText, Plus, Play, Search, ChevronLeft, ChevronRight, DollarSign, AlertTriangle, CheckCircle, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import './BillingPage.css';

const STATUS_OPTIONS = ['', 'draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'disputed'];
const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data, isFetching } = useGetInvoicesQuery({ status: status || undefined, page, limit: 15 });
  const [runBilling, { isLoading: runningBilling }] = useRunBillingMutation();

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

  const handleRunBilling = async () => {
    if (!confirm('This will generate invoices for all due billing schedules. Continue?')) return;
    const result = await runBilling().unwrap();
    alert(`Generated ${result.data.generated} invoices from ${result.data.processed} schedules.${result.data.errors.length > 0 ? '\n\nErrors:\n' + result.data.errors.join('\n') : ''}`);
  };

  const getTenantName = (inv: any) => {
    if (!inv.tenant) return '—';
    return inv.tenant.tenantType === 'company'
      ? inv.tenant.companyName || ''
      : `${inv.tenant.firstName || ''} ${inv.tenant.lastName || ''}`.trim();
  };

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
        <select className="filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
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
                <td colSpan={8}>
                  <div className="billing-empty">
                    {isFetching ? 'Loading invoices…' : 'No invoices found.'}
                  </div>
                </td>
              </tr>
            ) : (
              filteredInvoices.map(inv => {
                const paidNum = Number(inv.paidAmount);
                const totalNum = Number(inv.totalAmount);

                return (
                  <tr key={inv.id} className="clickable" onClick={() => navigate(`/admin/billing/invoices/${inv.id}`)}>
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
    </div>
  );
}
