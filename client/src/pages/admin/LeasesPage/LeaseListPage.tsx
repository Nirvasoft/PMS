import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetLeasesQuery, useDeleteLeaseMutation, type LeaseListItem } from '../../../store/api/leasesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  FileText, Plus, Search, X, AlertTriangle, ChevronRight, Trash2,
  Clock, CheckCircle, XCircle, PenLine, Archive, Import,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
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
  const [showImportModal, setShowImportModal] = useState(false);
  const activePropertyFilter = useSelectedPropertyFilter();

  // Reset pagination whenever the sidebar's Active Property changes.
  useEffect(() => { setPage(1); }, [activePropertyFilter]);

  const { data, isLoading } = useGetLeasesQuery({
    search: search || undefined,
    status: status || undefined,
    expiringWithinDays: expiring,
    propertyId: activePropertyFilter || undefined,
    page, limit: 20,
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
          <input placeholder="Search lease number…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
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
        <div className="lease-table-header">
          <span>Lease #</span><span>Unit / Property</span><span>Tenant</span>
          <span>Dates</span><span>Rent</span><span>Status</span><span>E-Sign</span><span></span>
        </div>

        {isLoading ? (
          <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
        ) : leases.length === 0 ? (
          <div className="table-empty"><FileText size={40} /><p>No leases found{hasFilters ? ' — try clearing filters' : ''}</p></div>
        ) : (
          leases.map((lease) => <LeaseRow key={lease.id} lease={lease} onOpen={() => navigate(`/admin/leases/${lease.id}`)} onDelete={async (e) => {
            e.stopPropagation();
            if (!(await confirmDialog(`Delete lease ${lease.leaseNumber}?`, { danger: true, confirmText: 'Delete' }))) return;
            try { await deleteLease(lease.id).unwrap(); toast.success('Deleted'); }
            catch { toast.error('Cannot delete active lease'); }
          }} />)
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

function LeaseRow({ lease, onOpen, onDelete }: {
  lease: LeaseListItem; onOpen: () => void; onDelete: (e: React.MouseEvent) => void;
}) {
  const s = STATUS_META[lease.status] || { label: lease.status, color: '#95a5a6', icon: null };
  const expiring = lease.status === 'active' && lease.daysUntilExpiry <= 30;

  return (
    <div className={`lease-row ${expiring ? 'expiring' : ''}`} onClick={onOpen}>
      <div className="lease-num">
        <span className="ln-badge">{lease.leaseNumber}</span>
        {expiring && <span className="exp-warn"><AlertTriangle size={10} /> {lease.daysUntilExpiry}d</span>}
      </div>
      <div className="lease-unit">
        <div className="lu-number">{lease.unit.unitNumber}</div>
        <div className="lu-property">{lease.property.name}</div>
      </div>
      <div className="lease-tenant">{lease.tenant.displayName}</div>
      <div className="lease-dates">
        <div>{new Date(lease.startDate).toLocaleDateString()}</div>
        <div className="date-sep">→</div>
        <div>{new Date(lease.endDate).toLocaleDateString()}</div>
      </div>
      <div className="lease-rent">
        <span className="rent-val">{Number(lease.rentAmount).toLocaleString()}</span>
        <span className="rent-cur">{lease.currency}</span>
      </div>
      <div>
        <span className="status-pill" style={{ color: s.color, background: s.color + '1a', borderColor: s.color + '40' }}>
          {s.icon}{s.label}
        </span>
      </div>
      <div>
        <span className={`esign-dot ${lease.esignStatus}`} title={lease.esignStatus.replace(/_/g, ' ')} />
      </div>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        {['draft', 'cancelled', 'expired', 'terminated'].includes(lease.status) && (
          <PermissionGuard permission="leases.terminate">
            <button className="row-btn-delete" onClick={onDelete}><Trash2 size={13} /></button>
          </PermissionGuard>
        )}
        <ChevronRight size={14} className="row-chevron" />
      </div>
    </div>
  );
}
