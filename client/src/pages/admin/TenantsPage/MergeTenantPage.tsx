import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMergeTenantsMutation, useGetTenantQuery, useGetLeaseHistoryQuery,
  type TenantDetail,
} from '../../../store/api/tenantsApi';
import {
  List, GitMerge, User, Building2,
  ShieldOff, ArrowRight, CheckCircle, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import TenantComboBox from '../../../components/TenantComboBox';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import './MergeTenantPage.css';

export default function MergeTenantPage() {
  const navigate = useNavigate();
  const propertyId = useSelectedPropertyFilter();
  const [primaryId, setPrimaryId] = useState('');
  const [primaryLabel, setPrimaryLabel] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [duplicateLabel, setDuplicateLabel] = useState('');
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [mergeTenants, { isLoading: merging }] = useMergeTenantsMutation();

  const [confirmActive, setConfirmActive] = useState(false);

  // Reset selections when the sidebar Active Property changes
  useEffect(() => {
    setPrimaryId('');
    setPrimaryLabel('');
    setDuplicateId('');
    setDuplicateLabel('');
    setConfirmActive(false);
    setStep('select');
  }, [propertyId]);

  const handleMerge = async () => {
    if (!primaryId || !duplicateId) return;
    try {
      const result = await mergeTenants({ primaryTenantId: primaryId, duplicateTenantId: duplicateId, confirmActiveLeasesTransfer: confirmActive }).unwrap();
      toast.success(result.data.message);
      navigate(`/admin/tenants/${primaryId}`);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Merge failed');
    }
  };

  const canPreview = Boolean(primaryId && duplicateId && primaryId !== duplicateId);

  return (
    <div className="merge-page">
      <div className="merge-header">
        <div className="merge-title-row">
          <h1><GitMerge size={22} /> Merge Tenants</h1>
          <p className="merge-subtitle">
            Select a primary tenant (kept) and a duplicate tenant (merged into primary, then soft-deleted).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          onClick={() => navigate('/admin/tenants')}
        >
          <List size={14} /> List
        </button>
      </div>

      {step === 'select' && (
        <div className="merge-select">
          <div className="merge-side">
            <label htmlFor="merge-primary-tenant" className="merge-side-label primary-label">
              <CheckCircle size={14} /> Primary Tenant <span>(kept)</span>
            </label>
            <TenantComboBox
              id="merge-primary-tenant"
              propertyId={propertyId || undefined}
              value={primaryId}
              selectedLabel={primaryLabel}
              excludeId={duplicateId}
              onChange={(id, label) => {
                setPrimaryId(id);
                setPrimaryLabel(label);
              }}
            />
          </div>

          <div className="merge-arrow">
            <ArrowRight size={22} />
            <span>merges into</span>
          </div>

          <div className="merge-side">
            <label htmlFor="merge-duplicate-tenant" className="merge-side-label duplicate-label">
              <AlertTriangle size={14} /> Duplicate Tenant <span>(deleted)</span>
            </label>
            <TenantComboBox
              id="merge-duplicate-tenant"
              propertyId={propertyId || undefined}
              value={duplicateId}
              selectedLabel={duplicateLabel}
              excludeId={primaryId}
              onChange={(id, label) => {
                setDuplicateId(id);
                setDuplicateLabel(label);
              }}
            />
          </div>
        </div>
      )}

      {step === 'select' && (
        <div className="merge-footer">
          <button className="btn-ghost" onClick={() => navigate('/admin/tenants')}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!canPreview}
            onClick={() => setStep('preview')}
          >
            Preview Merge →
          </button>
        </div>
      )}

      {step === 'preview' && primaryId && duplicateId && (
        <MergePreview
          primaryId={primaryId}
          duplicateId={duplicateId}
          onBack={() => setStep('select')}
          onConfirm={handleMerge}
          merging={merging}
          confirmActive={confirmActive}
          setConfirmActive={setConfirmActive}
        />
      )}
    </div>
  );
}

/* ══ Merge Preview ══ */
function MergePreview({ primaryId, duplicateId, onBack, onConfirm, merging, confirmActive, setConfirmActive }: {
  primaryId: string; duplicateId: string;
  onBack: () => void; onConfirm: () => void; merging: boolean;
  confirmActive: boolean; setConfirmActive: (val: boolean) => void;
}) {
  const { data: pData } = useGetTenantQuery(primaryId);
  const { data: dData } = useGetTenantQuery(duplicateId);
  const { data: dLeasesData } = useGetLeaseHistoryQuery(duplicateId);
  const primary = pData?.data;
  const duplicate = dData?.data;
  const duplicateLeases = dLeasesData?.data || [];
  const duplicateActiveLeases = duplicateLeases.filter(l => l.status === 'active');
  const hasActiveLeases = duplicateActiveLeases.length > 0;

  if (!primary || !duplicate) {
    return <div className="merge-loading">Loading preview…</div>;
  }

  // Count what will be migrated
  const migrated = [
    { label: 'Active Leases', count: duplicateActiveLeases.length },
    { label: 'Past Leases', count: duplicateLeases.length - duplicateActiveLeases.length },
    { label: 'KYC Documents', count: duplicate.kycDocuments?.length || 0 },
    { label: 'Emergency Contacts', count: duplicate.emergencyContacts?.length || 0 },
    { label: 'Notes', count: duplicate._count?.tenantNotes || 0 },
  ].filter((m) => m.count > 0);

  return (
    <div className="merge-preview">
      <div className="mp-cards">
        <div className="mp-card primary">
          <div className="mp-card-label"><CheckCircle size={13} /> Keeping</div>
          <TenantPreviewCard tenant={primary} />
        </div>
        <div className="mp-arrow">
          <ArrowRight size={20} />
        </div>
        <div className="mp-card duplicate">
          <div className="mp-card-label"><AlertTriangle size={13} /> Deleting</div>
          <TenantPreviewCard tenant={duplicate} />
        </div>
      </div>

      {migrated.length > 0 && (
        <div className="mp-migration">
          <h4>Data to be migrated to primary:</h4>
          <div className="mp-migration-items">
            {migrated.map((m) => (
              <div key={m.label} className="mp-mig-item">
                <span className="mp-mig-count">{m.count}</span>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mp-warning">
        <AlertTriangle size={16} />
        <div>
          <strong>This action cannot be undone.</strong>
          <p>
            All data from "{duplicate.displayName}" will be migrated to "{primary.displayName}".
            The duplicate tenant will be soft-deleted.
          </p>
        </div>
      </div>

      {hasActiveLeases && (
        <div className="mp-warning" style={{ background: 'rgba(243,156,18,0.1)', color: '#d35400' }}>
          <AlertTriangle size={16} />
          <div>
            <strong>Active Leases Detected</strong>
            <p>The duplicate tenant has {duplicateActiveLeases.length} active lease(s). By merging, these leases will be transferred to the primary tenant.</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={confirmActive} onChange={(e) => setConfirmActive(e.target.checked)} />
              I confirm the transfer of active leases
            </label>
          </div>
        </div>
      )}

      <div className="merge-footer">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <PermissionGuard permission="tenants.update">
          <button className="btn-danger" onClick={onConfirm} disabled={merging || (hasActiveLeases && !confirmActive)}>
            <GitMerge size={14} /> {merging ? 'Merging…' : 'Confirm Merge'}
          </button>
        </PermissionGuard>
      </div>
    </div>
  );
}

function TenantPreviewCard({ tenant }: { tenant: TenantDetail }) {
  return (
    <div className="tp-card-inner">
      <div className="tp-avatar" style={{ background: tenant.isBlacklisted ? 'rgba(231,76,60,0.15)' : 'rgba(108,92,231,0.15)' }}>
        {tenant.displayName.charAt(0).toUpperCase()}
      </div>
      <div className="tp-name">{tenant.displayName}</div>
      <div className="tp-meta">
        <span className={`type-badge ${tenant.tenantType}`}>
          {tenant.tenantType === 'individual' ? <User size={10} /> : <Building2 size={10} />}
          {tenant.tenantType}
        </span>
        {tenant.isBlacklisted && <span className="bl-badge"><ShieldOff size={9} /> Blacklisted</span>}
      </div>
      <div className="tp-detail">{tenant.email || '—'}</div>
      <div className="tp-detail">{tenant.mobile || tenant.phone || '—'}</div>
      <div className="tp-detail">KYC: <strong style={{ color: { verified:'#2ecc71', rejected:'#e74c3c', pending:'#95a5a6', in_review:'#f39c12' }[tenant.kycStatus as string] || '#95a5a6' }}>
        {tenant.kycStatus?.replace(/_/g,' ')}
      </strong></div>
    </div>
  );
}
