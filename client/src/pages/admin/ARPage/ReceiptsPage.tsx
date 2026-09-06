import { useState, useMemo } from 'react';
import { useGetReceiptsQuery } from '../../../store/api/arApi';
import {
  Banknote, Plus, Search, ChevronLeft, ChevronRight,
  DollarSign, CheckCircle, RotateCcw, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import CreateReceiptModal from './CreateReceiptModal';
import ReceiptDetailDrawer from './ReceiptDetailDrawer';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './ARPage.css';

const STATUS_OPTIONS = ['', 'pending', 'confirmed', 'reversed', 'refunded'];
const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

export default function ReceiptsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isFetching } = useGetReceiptsQuery({ status: status || undefined, page, limit: 15 });
  const receipts = data?.data || [];
  const meta = data?.meta;

  const stats = useMemo(() => {
    return {
      total: meta?.total || 0,
      totalAmount: receipts.reduce((s, r) => s + Number(r.amount), 0),
      confirmed: receipts.filter(r => r.status === 'confirmed').length,
      reversed: receipts.filter(r => r.status === 'reversed').length,
    };
  }, [receipts, meta]);

  const filtered = search
    ? receipts.filter(r =>
        r.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
        (r.tenant?.firstName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.tenant?.lastName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.tenant?.companyName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.paymentReference || '').toLowerCase().includes(search.toLowerCase()))
    : receipts;

  const getTenantName = (r: any) => {
    if (!r.tenant) return '—';
    return r.tenant.tenantType === 'corporate'
      ? r.tenant.companyName || ''
      : `${r.tenant.firstName || ''} ${r.tenant.lastName || ''}`.trim();
  };

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <Banknote size={22} />
          </div>
          <div>
            <h1>Payment Receipts</h1>
            <p>Record and manage incoming payments</p>
          </div>
        </div>
        <PermissionGuard permission="ar-receipts.write">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Record Payment
          </button>
        </PermissionGuard>
      </div>

      {/* Summary Cards */}
      <div className="ar-summary-cards">
        <div className="ar-stat-card">
          <div className="asc-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <Banknote size={18} />
          </div>
          <span className="asc-label">Total Receipts</span>
          <span className="asc-value">{stats.total}</span>
        </div>
        <div className="ar-stat-card">
          <div className="asc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <DollarSign size={18} />
          </div>
          <span className="asc-label">Page Collections</span>
          <span className="asc-value">{formatCurrency(stats.totalAmount)}</span>
        </div>
        <div className="ar-stat-card">
          <div className="asc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <CheckCircle size={18} />
          </div>
          <span className="asc-label">Confirmed</span>
          <span className="asc-value" style={{ color: '#34d399' }}>{stats.confirmed}</span>
        </div>
        <div className="ar-stat-card">
          <div className="asc-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <RotateCcw size={18} />
          </div>
          <span className="asc-label">Reversed</span>
          <span className="asc-value" style={{ color: stats.reversed > 0 ? '#f87171' : undefined }}>{stats.reversed}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="ar-filters">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input type="text" placeholder="Search receipts…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map(s => (
            <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Receipt #</th>
              <th style={{ width: 170 }}>Tenant</th>
              <th style={{ width: 110 }}>Date</th>
              <th style={{ width: 130 }}>Method</th>
              <th className="text-right" style={{ width: 120 }}>Amount</th>
              <th style={{ width: 150 }}>Reference</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 60 }}>Inv.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="ar-empty">
                    {isFetching ? 'Loading receipts…' : 'No receipts found.'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr key={r.id} className="clickable" onClick={() => setSelectedId(r.id)}>
                  <td><div className="cell-primary">{r.receiptNumber}</div></td>
                  <td><div className="cell-primary">{getTenantName(r)}</div></td>
                  <td>
                    <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {format(new Date(r.receiptDate), 'MMM d, yyyy')}
                    </div>
                  </td>
                  <td>
                    <span className="pay-method">{r.paymentMethod.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="text-right">
                    <span className="cell-amount">{formatCurrency(r.amount, r.currency)}</span>
                  </td>
                  <td>
                    {r.paymentReference ? (
                      <span className="cell-mono">{r.paymentReference}</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`ar-status ar-status--${r.status}`}>{r.status}</span>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {r._count?.allocations || 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta && meta.totalPages > 1 && (
          <div className="ar-pagination">
            <span className="page-info">
              Page {meta.page} of {meta.totalPages} · {meta.total} receipts
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

      {/* Create Modal */}
      {showCreate && <CreateReceiptModal onClose={() => setShowCreate(false)} />}

      {/* Detail Drawer */}
      {selectedId && <ReceiptDetailDrawer receiptId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
