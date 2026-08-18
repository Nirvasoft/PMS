import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetTenantsQuery, useDeleteTenantMutation,
  type TenantListItem,
} from '../../../store/api/tenantsApi';
import {
  Users, Plus, Search, X, Building2, User, Shield, ShieldOff,
  Trash2, ChevronRight, Filter, GitMerge, Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import './TenantListPage.css';

const KYC_COLORS: Record<string, string> = {
  pending:   '#95a5a6',
  in_review: '#f39c12',
  verified:  '#2ecc71',
  rejected:  '#e74c3c',
  expired:   '#9b59b6',
};

const KYC_LABELS: Record<string, string> = {
  pending:   'Pending',
  in_review: 'In Review',
  verified:  'Verified',
  rejected:  'Rejected',
  expired:   'Expired',
};

export default function TenantListPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const [search, setSearch]           = useState('');
  const [tenantType, setTenantType]   = useState('');
  const [kycStatus, setKycStatus]     = useState('');
  const [tags, setTags]               = useState('');
  const [showBlacklisted, setShowBlacklisted] = useState<boolean | undefined>(undefined);
  const [page, setPage]               = useState(1);

  const { data, isLoading, isFetching } = useGetTenantsQuery({
    search: search || undefined,
    tenantType: tenantType || undefined,
    kycStatus: kycStatus || undefined,
    tags: tags || undefined,
    isBlacklisted: showBlacklisted,
    page,
    limit: 20,
  });

  const [deleteTenant] = useDeleteTenantMutation();

  const tenants = data?.data || [];
  const meta = data?.meta;
  const hasFilters = !!(search || tenantType || kycStatus || tags || showBlacklisted !== undefined);

  const handleDelete = async (t: TenantListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmDialog(`Delete tenant "${t.displayName}"? This cannot be undone.`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteTenant(t.id).unwrap();
      toast.success('Tenant deleted');
    } catch {
      toast.error('Cannot delete — tenant may have active leases');
    }
  };

  const clearFilters = () => {
    setSearch(''); setTenantType(''); setKycStatus(''); setTags(''); setShowBlacklisted(undefined); setPage(1);
  };

  return (
    <div className="tenant-list-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title">
          <div className="page-icon"><Users size={22} /></div>
          <div>
            <h1>Tenants</h1>
            <p>{meta ? `${meta.total} tenants in registry` : 'Loading…'}</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn-ghost" onClick={() => navigate('/admin/tenants/kyc-requirements')}>
            <Shield size={14} /> KYC Requirements
          </button>
          <button className="btn-ghost" onClick={() => navigate('/admin/tenants/merge')}>
            <GitMerge size={14} /> Merge
          </button>
          <button className="btn-primary" onClick={() => navigate('/admin/tenants/new')}>
            <Plus size={15} /> New Tenant
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="tenant-filters">
        <div className="search-box">
          <Search size={14} />
          <input
            placeholder="Search name, email, ID number, mobile…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
        </div>

        <div className="filter-tabs">
          {[['', 'All'], ['individual', 'Individual'], ['company', 'Company']].map(([val, label]) => (
            <button key={val} className={tenantType === val ? 'active' : ''}
              onClick={() => { setTenantType(val); setPage(1); }}>
              {val === 'individual' ? <User size={12} /> : val === 'company' ? <Building2 size={12} /> : null}
              {label}
            </button>
          ))}
        </div>

        <select className="filter-select" value={kycStatus} onChange={(e) => { setKycStatus(e.target.value); setPage(1); }}>
          <option value="">All KYC Statuses</option>
          {Object.entries(KYC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <div className="search-box">
          <Tag size={14} />
          <input
            placeholder="Filter by tags (comma separated)…"
            value={tags}
            onChange={(e) => { setTags(e.target.value); setPage(1); }}
          />
          {tags && <button onClick={() => setTags('')}><X size={13} /></button>}
        </div>

        <button
          className={`filter-btn-bl ${showBlacklisted === true ? 'active' : ''}`}
          onClick={() => { setShowBlacklisted(showBlacklisted === true ? undefined : true); setPage(1); }}
        >
          <ShieldOff size={13} /> Blacklisted
        </button>

        {hasFilters && <button className="btn-clear-filter" onClick={clearFilters}><X size={12} /> Clear</button>}
      </div>

      {/* Table */}
      <div className="tenant-table-wrap">
        <div className="tenant-table-header">
          <span>Tenant</span><span>Type</span><span>Contact</span>
          <span>KYC Status</span><span>Active Leases</span><span>Tags</span><span>Added</span><span></span>
        </div>

        {isLoading ? (
          <div className="table-loading"><div className="loading-pulse" /><div className="loading-pulse" /><div className="loading-pulse" /></div>
        ) : tenants.length === 0 ? (
          <div className="table-empty"><Users size={40} /><p>No tenants found{hasFilters ? ' — try clearing filters' : ''}</p></div>
        ) : (
          tenants.map((tenant) => (
            <TenantRow
              key={tenant.id}
              tenant={tenant}
              onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
              onDelete={(e) => handleDelete(tenant, e)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
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

// ── Tenant Row ────────────────────────────────
function TenantRow({ tenant, onClick, onDelete }: { tenant: TenantListItem; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const kycColor = KYC_COLORS[tenant.kycStatus] || '#95a5a6';

  return (
    <div className={`tenant-row ${tenant.isBlacklisted ? 'blacklisted' : ''}`} onClick={onClick}>
      {/* Avatar + name */}
      <div className="tenant-name-cell">
        <div className="tenant-avatar" style={{ background: tenant.isBlacklisted ? 'rgba(231,76,60,0.15)' : 'rgba(108,92,231,0.15)' }}>
          {tenant.avatarUrl
            ? <img src={tenant.avatarUrl} alt="" />
            : <span>{tenant.displayName.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div>
          <div className="tenant-display-name">
            {tenant.displayName}
            {tenant.isBlacklisted && <span className="bl-badge"><ShieldOff size={10} /> Blacklisted</span>}
          </div>
          <div className="tenant-email">{tenant.email || '—'}</div>
        </div>
      </div>

      {/* Type */}
      <div>
        <span className={`type-badge ${tenant.tenantType}`}>
          {tenant.tenantType === 'individual' ? <User size={10} /> : <Building2 size={10} />}
          {tenant.tenantType}
        </span>
      </div>

      {/* Contact */}
      <div className="tenant-contact">{tenant.mobile || '—'}</div>

      {/* KYC */}
      <div>
        <span className="kyc-badge" style={{ color: kycColor, background: kycColor + '18', borderColor: kycColor + '40' }}>
          {KYC_LABELS[tenant.kycStatus] || tenant.kycStatus}
        </span>
      </div>

      {/* Active Leases */}
      <div className="tenant-active-leases">
        {tenant.activeLeases}
      </div>

      {/* Tags */}
      <div className="tag-cell">
        {tenant.tags.slice(0, 2).map((tag) => <span key={tag} className="tenant-tag">{tag.replace(/_/g, ' ')}</span>)}
        {tenant.tags.length > 2 && <span className="tag-more">+{tenant.tags.length - 2}</span>}
      </div>

      {/* Date */}
      <div className="tenant-date">{new Date(tenant.createdAt).toLocaleDateString()}</div>

      {/* Actions */}
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="row-btn-delete" onClick={onDelete}><Trash2 size={13} /></button>
        <ChevronRight size={14} className="row-chevron" />
      </div>
    </div>
  );
}
