import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetTenantsQuery, useDeleteTenantMutation,
  type TenantListItem,
} from '../../../store/api/tenantsApi';
import {
  Users, Plus, Search, X, Building2, User, Shield, ShieldOff, ShieldCheck,
  Trash2, Filter, GitMerge, Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
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
  const propertyId = useSelectedPropertyFilter(); // '' when "All Properties", else active property id
  const [search, setSearch]           = useState('');
  const [tenantType, setTenantType]   = useState('');
  const [kycStatus, setKycStatus]     = useState('');
  const [tags, setTags]               = useState('');
  const [showBlacklisted, setShowBlacklisted] = useState<boolean | undefined>(undefined);
  const [page, setPage]               = useState(1);

  // Reset to page 1 whenever the active property changes
  useEffect(() => { setPage(1); }, [propertyId]);

  const { data, isLoading, isFetching } = useGetTenantsQuery({
    search: search || undefined,
    tenantType: tenantType || undefined,
    kycStatus: kycStatus || undefined,
    tags: tags || undefined,
    isBlacklisted: showBlacklisted,
    propertyId: propertyId || undefined,
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

  const isCompanyTab = tenantType === 'company';

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
          <PermissionGuard permission="tenants.update">
            <button className="btn-ghost" onClick={() => navigate('/admin/tenants/merge')}>
              <GitMerge size={14} /> Merge
            </button>
          </PermissionGuard>
          <PermissionGuard permission="tenants.create">
            <button className="btn-primary" onClick={() => navigate('/admin/tenants/new')}>
              <Plus size={15} /> New Tenant
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* KYC status quick-stat chips */}
      {meta && (() => {
        const verifiedCount = tenants.filter(t => t.kycStatus === 'verified').length;
        const pendingCount  = tenants.filter(t => t.kycStatus === 'pending').length;
        const inReviewCount = tenants.filter(t => t.kycStatus === 'in_review').length;
        const rejectedCount = tenants.filter(t => t.kycStatus === 'rejected').length;
        return (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={() => { setKycStatus(kycStatus === 'verified' ? '' : 'verified'); setPage(1); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '1px solid',
                borderColor: kycStatus === 'verified' ? '#2ecc71' : 'rgba(46,204,113,0.35)',
                background: kycStatus === 'verified' ? 'rgba(46,204,113,0.12)' : 'rgba(46,204,113,0.06)',
                color: '#2ecc71',
              }}
            >
              <ShieldCheck size={13} /> {verifiedCount} Verified
            </button>
            {inReviewCount > 0 && (
              <button
                onClick={() => { setKycStatus(kycStatus === 'in_review' ? '' : 'in_review'); setPage(1); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid',
                  borderColor: kycStatus === 'in_review' ? '#f39c12' : 'rgba(243,156,18,0.35)',
                  background: kycStatus === 'in_review' ? 'rgba(243,156,18,0.12)' : 'rgba(243,156,18,0.06)',
                  color: '#f39c12',
                }}
              >
                <Shield size={13} /> {inReviewCount} In Review
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={() => { setKycStatus(kycStatus === 'pending' ? '' : 'pending'); setPage(1); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid',
                  borderColor: kycStatus === 'pending' ? '#95a5a6' : 'rgba(149,165,166,0.35)',
                  background: kycStatus === 'pending' ? 'rgba(149,165,166,0.12)' : 'rgba(149,165,166,0.06)',
                  color: '#95a5a6',
                }}
              >
                <Shield size={13} /> {pendingCount} Pending
              </button>
            )}
            {rejectedCount > 0 && (
              <button
                onClick={() => { setKycStatus(kycStatus === 'rejected' ? '' : 'rejected'); setPage(1); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid',
                  borderColor: kycStatus === 'rejected' ? '#e74c3c' : 'rgba(231,76,60,0.35)',
                  background: kycStatus === 'rejected' ? 'rgba(231,76,60,0.12)' : 'rgba(231,76,60,0.06)',
                  color: '#e74c3c',
                }}
              >
                <ShieldOff size={13} /> {rejectedCount} Rejected
              </button>
            )}
          </div>
        );
      })()}

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

        <button
          className={`filter-btn-bl ${kycStatus === 'verified' ? 'active' : ''}`}
          style={kycStatus === 'verified' ? { borderColor: '#2ecc71', color: '#2ecc71', background: 'rgba(46,204,113,0.08)' } : {}}
          onClick={() => { setKycStatus(kycStatus === 'verified' ? '' : 'verified'); setPage(1); }}
        >
          <ShieldCheck size={13} /> KYC Verified
        </button>

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
          <span>Photo</span>
          {isCompanyTab
            ? <span style={{ gridColumn: 'span 2' }}>Company</span>
            : <><span>Code</span><span>Name</span></>
          }
          <span>Type</span><span>Property</span>
          <span>KYC Status</span><span>Lease</span><span>Actions</span>
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
              isCompanyTab={isCompanyTab}
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
function TenantRow({ tenant, isCompanyTab, onClick, onDelete }: {
  tenant: TenantListItem;
  isCompanyTab: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const kycColor  = KYC_COLORS[tenant.kycStatus] || '#95a5a6';
  const isCompany = tenant.tenantType === 'company' || tenant.tenantType === 'corporate';

  return (
    <div className={`tenant-row ${tenant.isBlacklisted ? 'blacklisted' : ''}`} onClick={onClick}>

      {/* Avatar — own grid column */}
      <div className="tenant-avatar" style={{ background: tenant.isBlacklisted ? 'rgba(231,76,60,0.15)' : 'rgba(108,92,231,0.15)' }}>
        {tenant.avatarUrl
          ? <img src={tenant.avatarUrl} alt="" />
          : <span>{tenant.displayName.charAt(0).toUpperCase()}</span>
        }
      </div>

      {/* Code — or full Company cell when company tab */}
      {(() => {
        const codeVal = isCompanyTab ? tenant.displayName : (isCompany ? '—' : tenant.firstName || '—');
        const isDash  = codeVal === '—';
        return (
          <div
            className={`tenant-display-name${isDash ? ' cell-dash' : ''}`}
            style={isCompanyTab ? { gridColumn: 'span 2' } : {}}
          >
            {codeVal}
            {tenant.isBlacklisted && <span className="bl-badge"><ShieldOff size={10} /> Blacklisted</span>}
          </div>
        );
      })()}

      {/* Name — hidden on company tab; shows company displayName for company tenants */}
      {!isCompanyTab && (() => {
        const nameVal = isCompany ? tenant.displayName : (tenant.lastName || '—');
        return (
          <div className={`tenant-name-value${nameVal === '—' ? ' cell-dash' : ''}`}>
            {nameVal}
          </div>
        );
      })()}

      {/* Type */}
      <div>
        <span className={`type-badge ${tenant.tenantType === 'corporate' ? 'company' : tenant.tenantType}`}>
          {isCompany ? <Building2 size={10} /> : <User size={10} />}
          {isCompany ? 'company' : 'individual'}
        </span>
      </div>

      {/* Property Name */}
      <div className="tenant-property-name">{tenant.propertyName || '—'}</div>

      {/* KYC */}
      <div>
        <span className="kyc-badge" style={{ color: kycColor, background: kycColor + '18', borderColor: kycColor + '40', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {tenant.kycStatus === 'verified'
            ? <ShieldCheck size={11} />
            : tenant.kycStatus === 'rejected' || tenant.kycStatus === 'expired'
              ? <ShieldOff size={11} />
              : <Shield size={11} />
          }
          {KYC_LABELS[tenant.kycStatus] || tenant.kycStatus}
        </span>
      </div>

      {/* Active Leases */}
      <div className="tenant-active-leases">{tenant.activeLeases}</div>

      {/* Actions */}
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <PermissionGuard permission="tenants.delete">
          <button className="row-btn-delete" onClick={onDelete}><Trash2 size={13} /></button>
        </PermissionGuard>
      </div>
    </div>
  );
}
