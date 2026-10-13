import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetLeasesQuery, useDeleteLeaseMutation, type LeaseListItem } from '../../../store/api/leasesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  FileText, Plus, Search, X, AlertTriangle, Trash2,
  Clock, CheckCircle, XCircle, PenLine, Archive, Import,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import ImportLeadModal from './ImportLeadModal';
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
  const hasFilters = !!(search || status || expiring);

  return (
    <div className="lease-list-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><FileText size={22} /></div>
          <div>
            <h1>Leases</h1>
            <p>{meta ? `${meta.total} total leases` : 'Loading…'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => navigate('/admin/leases/templates')}>
            <FileText size={14} /> Templates
          </button>
          <button className="btn-ghost" onClick={() => navigate('/admin/leases/clauses')}>
            <Archive size={14} /> Clauses
          </button>
          <PermissionGuard permission="leases.create">
            <button className="btn-import-lead" onClick={() => setShowImportModal(true)}>
              <Import size={14} /> Import Lead
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
          <button onClick={() => { setExpiring(30); setStatus('active'); }}>View →</button>
        </div>
      )}

      {/* Filters */}
      <div className="lease-filters">
        <div className="search-box">
          <Search size={14} />
          <input placeholder="Search lease #, unit no, or tenant code/name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
        </div>

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

        {hasFilters && <button className="btn-clear-filter" onClick={() => { setSearch(''); setStatus(''); setExpiring(undefined); setPage(1); }}><X size={12} /> Clear</button>}
      </div>

      {/* Table */}
      <div className="lease-table-wrap">
        <TableScrollWrapper>
          <table className="lease-table billing-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Lease #</th>
                <th style={{ width: 170 }}>Unit / Property</th>
                <th style={{ minWidth: 200 }}>Tenant</th>
                <th style={{ width: 190 }}>Dates</th>
                <th className="text-right" style={{ width: 140 }}>Rent</th>
                <th style={{ width: 150 }}>Status</th>
                <th className="text-center" style={{ width: 80 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
                  </td>
                </tr>
              ) : leases.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="table-empty"><FileText size={40} /><p>No leases found{hasFilters ? ' — try clearing filters' : ''}</p></div>
                  </td>
                </tr>
              ) : (
                leases.map((lease) => {
                  const s = STATUS_META[lease.status] || { label: lease.status, color: '#95a5a6', icon: null };
                  const expiring = lease.status === 'active' && lease.daysUntilExpiry <= 30;

                  return (
                    <tr
                      key={lease.id}
                      className={expiring ? 'expiring' : ''}
                      onClick={() => navigate(`/admin/leases/${lease.id}`)}
                    >
                      <td>
                        <div className="lease-num">
                          <span className="ln-badge">{lease.leaseNumber}</span>
                          {expiring && (
                            <span className="exp-warn">
                              <AlertTriangle size={10} /> {lease.daysUntilExpiry}d left
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="lu-number">{lease.unit?.unitNumber || '—'}</div>
                        {lease.property?.name && (
                          <div className="lu-property">{lease.property.name}</div>
                        )}
                      </td>
                      <td>
                        <div className="lease-tenant" title={lease.tenant?.firstName || undefined}>
                          <span style={{ fontWeight: 600 }}>
                            {lease.tenant?.displayName || lease.tenant?.lastName || lease.tenant?.companyName || '—'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="lease-dates">
                          <div>
                            {lease.startDate ? new Date(lease.startDate).toLocaleDateString() : '—'}
                            <span className="date-sep">→</span>
                            {lease.endDate ? new Date(lease.endDate).toLocaleDateString() : '—'}
                          </div>
                          {lease.leaseTermMonths ? (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              {lease.leaseTermMonths} months
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="lease-rent" style={{ justifyContent: 'flex-end' }}>
                          <span className="rent-val">{Number(lease.rentAmount || 0).toLocaleString()}</span>
                          <span className="rent-cur">{lease.currency || 'USD'}</span>
                        </div>
                      </td>
                      <td>
                        <span className="status-pill" style={{ color: s.color, background: s.color + '1a', borderColor: s.color + '40' }}>
                          {s.icon}{s.label}
                        </span>
                      </td>
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
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
        {meta && meta.total > 0 && (
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
              <span className="pagination-range" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Showing {(page - 1) * pageSize + 1} – {Math.min(page * pageSize, meta.total)} of {meta.total} leases
              </span>
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
