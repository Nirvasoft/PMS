import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGetLeasesQuery, useDeleteLeaseMutation } from '../../../store/api/leasesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  FileText, Plus, Search, Filter, X, AlertTriangle, Trash2,
  Clock, CheckCircle, XCircle, PenLine, Archive, Import,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import ImportLeadModal from './ImportLeadModal';
import {
  formatFullAmount as formatRentDetail,
  formatCompactAmount as formatCompactRent,
} from '../../../utils/formatCurrency';
import './LeaseListPage.css';

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:            { label: 'Draft',            color: '#95a5a6', icon: <PenLine size={11} /> },
  pending_approval: { label: 'Pending Approval', color: '#f39c12', icon: <Clock size={11} /> },
  approved:         { label: 'Approved',         color: '#3498db', icon: <CheckCircle size={11} /> },
  active:           { label: 'Active',           color: '#2ecc71', icon: <CheckCircle size={11} /> },
  expired:          { label: 'Expired',          color: '#9b59b6', icon: <Archive size={11} /> },
  terminated:       { label: 'Terminated',       color: '#e74c3c', icon: <XCircle size={11} /> },
  renewed:          { label: 'Renewed',          color: '#1abc9c', icon: <CheckCircle size={11} /> },
  cancelled:        { label: 'Cancelled',        color: '#7f8c8d', icon: <XCircle size={11} /> },
};

export default function LeaseListPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const [search, setSearch]           = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus]           = useState('');
  const [expiring, setExpiring]       = useState<number | undefined>(undefined);
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(10);
  const [showImportModal, setShowImportModal] = useState(false);
  const activePropertyFilter = useSelectedPropertyFilter();

  // Reset pagination whenever the sidebar's Active Property changes.
  useEffect(() => { setPage(1); }, [activePropertyFilter]);

  const { data, isLoading } = useGetLeasesQuery({
    search: search || undefined,
    status: status || undefined,
    expiringWithinDays: expiring,
    propertyId: activePropertyFilter || undefined,
    page,
    limit: pageSize,
  });

  // Count expiring soon for alert banner
  const { data: expiringData } = useGetLeasesQuery({
    expiringWithinDays: 30,
    propertyId: activePropertyFilter || undefined,
    limit: 100,
  });
  const expiringCount = expiringData?.meta?.total ?? 0;
  const [deleteLease] = useDeleteLeaseMutation();

  const leases = data?.data || [];
  const meta   = data?.meta;
  const hasActiveFilters = !!(status || expiring);
  const hasFilters = !!(search || status || expiring);

  return (
    <div className="lease-list-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><FileText size={22} /></div>
          <div>
            <h1>Leases</h1>
            <p>{meta ? `${meta.total} total leases` : <span className="pms-skeleton-line" style={{ display: 'inline-block', width: 96, height: 12, verticalAlign: 'middle' }} />}</p>
          </div>
        </div>
        <div className="lease-header-actions">
          <button className="btn-ghost" onClick={() => navigate('/admin/leases/templates')}>
            <FileText size={14} /> Templates
          </button>
          <button className="btn-ghost" onClick={() => navigate('/admin/leases/clauses')}>
            <Archive size={14} /> Clauses
          </button>
          <PermissionGuard permission="leases.create">
            <button className="btn-ghost" onClick={() => setShowImportModal(true)}>
              <Import size={14} className="import-lead-icon" /> Import Lead
            </button>
          </PermissionGuard>
          <PermissionGuard permission="leases.create">
            <button className="btn-primary" onClick={() => navigate('/admin/leases/new')}>
              <Plus size={15} /> New Lease
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Import Lead Modal */}
      {showImportModal && <ImportLeadModal onClose={() => setShowImportModal(false)} />}

      {/* Expiry alert */}
      {expiringCount > 0 && (
        <div className="expiry-banner">
          <AlertTriangle size={15} />
          <span><strong>{expiringCount}</strong> lease{expiringCount > 1 ? 's' : ''} expiring within 30 days</span>
          <button onClick={() => { setExpiring(30); setStatus('active'); setShowFilters(true); setPage(1); }}>View →</button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="lease-filters">
        <div className="search-box">
          <Search size={14} />
          <input placeholder="Search lease #, unit no, or tenant code/name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
        </div>
        <button className="btn-ghost" onClick={() => setShowFilters(!showFilters)}>
          <Filter size={14} /> Filters{hasActiveFilters ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className="filter-bar">
          <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>

          <div className="expiry-filter">
            {[30, 60, 90].map((d) => (
              <button key={d} className={expiring === d ? 'active' : ''} onClick={() => { setExpiring(expiring === d ? undefined : d); setPage(1); }}>
                <Clock size={11} /> Expiring {d}d
              </button>
            ))}
          </div>

          <button className="btn-ghost" onClick={() => { setStatus(''); setExpiring(undefined); setPage(1); }}>
            <X size={14} /> Reset
          </button>
        </div>
      )}

      {/* Table */}
      <div className="lease-table-wrap">
        <TableScrollWrapper>
          <table className="lease-table billing-table">
            <thead>
              <tr>
                <th className="col-lease-num">Lease #</th>
                <th className="col-unit">Unit</th>
                <th className="col-code">Code</th>
                <th className="col-tenant">Tenant</th>
                <th className="col-dates">Dates</th>
                <th className="col-rent text-right">Rent</th>
                <th className="col-status">Status</th>
                <th className="col-action text-center"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
                  </td>
                </tr>
              ) : leases.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty"><FileText size={40} /><p>No leases found{hasFilters ? ' — try clearing filters' : ''}</p></div>
                  </td>
                </tr>
              ) : (
                leases.map((lease) => {
                  const s = STATUS_META[lease.status] || { label: lease.status, color: '#95a5a6', icon: null };
                  const expiring = lease.status === 'active' && lease.daysUntilExpiry <= 30;
                  const tenantCode = lease.tenant?.firstName || '—';
                  const tenantName = lease.tenant?.lastName || lease.tenant?.companyName || '—';

                  return (
                    <tr
                      key={lease.id}
                      className={expiring ? 'expiring' : ''}
                    >
                      <td className="col-lease-num">
                        <div className="lease-num">
                          <Link to={`/admin/leases/${lease.id}`} className="user-name-link">
                            {lease.leaseNumber}
                          </Link>
                          {expiring && (
                            <span className="exp-warn">
                              <AlertTriangle size={10} /> {lease.daysUntilExpiry}d left
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="col-unit">
                        <div className="lease-tenant lu-number" title={lease.unit?.unitNumber || undefined}>
                          <span>
                            {lease.unit?.unitNumber || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="col-code">
                        <div className="lease-tenant" title={tenantCode !== '—' ? tenantCode : undefined}>
                          <span>
                            {tenantCode}
                          </span>
                        </div>
                      </td>
                      <td className="col-tenant">
                        <div className="lease-tenant" title={tenantName !== '—' ? tenantName : undefined}>
                          <span>
                            {tenantName}
                          </span>
                        </div>
                      </td>
                      <td className="col-dates">
                        <div className="lease-dates">
                          <div className="lease-dates-stack">
                            <span>{lease.startDate ? new Date(lease.startDate).toLocaleDateString() : '—'}</span>
                            <span>{lease.endDate ? new Date(lease.endDate).toLocaleDateString() : '—'}</span>
                          </div>
                          {lease.leaseTermMonths ? (
                            <span className="lease-term-middle">
                              {lease.leaseTermMonths} mo
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="col-rent text-right">
                        <div
                          className="lease-rent"
                          style={{ justifyContent: 'flex-end', cursor: 'help' }}
                          title={`${formatRentDetail(lease.rentAmount)} ${lease.currency || 'USD'}`}
                        >
                          <span className="rent-val">{formatCompactRent(lease.rentAmount)}</span>
                          <span className="rent-cur">{lease.currency || 'USD'}</span>
                        </div>
                      </td>
                      <td className="col-status">
                        <span className="status-pill" style={{ color: s.color, background: s.color + '1a', borderColor: s.color + '40' }}>
                          {s.icon}{s.label}
                        </span>
                      </td>
                      <td className="col-action text-center" onClick={(e) => e.stopPropagation()}>
                        {['draft', 'cancelled', 'expired', 'terminated'].includes(lease.status) && (
                          <PermissionGuard permission="leases.terminate">
                            <button
                              className="btn-icon"
                              title="Delete"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!(await confirmDialog(`Delete lease ${lease.leaseNumber}?`, { danger: true, confirmText: 'Delete' }))) return;
                                try { await deleteLease(lease.id).unwrap(); toast.success('Deleted'); }
                                catch { toast.error('Cannot delete active lease'); }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </PermissionGuard>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScrollWrapper>

        {/* Pagination Toolbar */}
        {meta && meta.total >= 10 && (
          <div className="lease-pagination billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="lease-page-size">Rows per page:</label>
                <select
                  id="lease-page-size"
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
    </div>
  );
}
