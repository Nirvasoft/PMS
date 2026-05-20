import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetTenantsQuery, useMergeTenantsMutation, useGetTenantQuery,
  type TenantListItem,
} from '../../../store/api/tenantsApi';
import {
  ArrowLeft, GitMerge, Search, User, Building2, X,
  ShieldOff, ArrowRight, CheckCircle, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './MergeTenantPage.css';

export default function MergeTenantPage() {
  const navigate = useNavigate();
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [mergeTenants, { isLoading: merging }] = useMergeTenantsMutation();

  const handleMerge = async () => {
    if (!primaryId || !duplicateId) return;
    try {
      const result = await mergeTenants({ primaryTenantId: primaryId, duplicateTenantId: duplicateId }).unwrap();
      toast.success(result.data.message);
      navigate(`/admin/tenants/${primaryId}`);
    } catch (e: any) {
      toast.error(e?.data?.message || 'Merge failed');
    }
  };

  const canPreview = primaryId && duplicateId && primaryId !== duplicateId;

  return (
    <div className="merge-page">
      <div className="merge-header">
        <button className="back-btn" onClick={() => navigate('/admin/tenants')}>
          <ArrowLeft size={16} /> Tenants
        </button>
        <h1><GitMerge size={22} /> Merge Tenants</h1>
        <p className="merge-subtitle">
          Select a primary tenant (kept) and a duplicate tenant (merged into primary, then soft-deleted).
        </p>
      </div>

      {step === 'select' && (
        <div className="merge-select">
          <div className="merge-side">
            <div className="merge-side-label primary-label">
              <CheckCircle size={14} /> Primary Tenant <span>(kept)</span>
            </div>
            <TenantSearchPicker
              selectedId={primaryId}
              excludeId={duplicateId}
              onSelect={setPrimaryId}
              onClear={() => setPrimaryId(null)}
            />
          </div>

          <div className="merge-arrow">
            <ArrowRight size={24} />
            <span>merges into</span>
          </div>

          <div className="merge-side">
            <div className="merge-side-label duplicate-label">
              <AlertTriangle size={14} /> Duplicate Tenant <span>(deleted)</span>
            </div>
            <TenantSearchPicker
              selectedId={duplicateId}
              excludeId={primaryId}
              onSelect={setDuplicateId}
              onClear={() => setDuplicateId(null)}
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
        />
      )}
    </div>
  );
}

/* ══ Tenant Search Picker ══ */
function TenantSearchPicker({ selectedId, excludeId, onSelect, onClear }: {
  selectedId: string | null; excludeId: string | null;
  onSelect: (id: string) => void; onClear: () => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useGetTenantsQuery(
    { search: search || undefined, limit: 8 },
    { skip: !search || search.length < 2 },
  );

  const results = (data?.data || []).filter((t) => t.id !== excludeId);
  const { data: selectedData } = useGetTenantQuery(selectedId!, { skip: !selectedId });
  const selected = selectedData?.data;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (selected) {
    return (
      <div className="selected-tenant-card">
        <div className="stc-avatar" style={{ background: selected.isBlacklisted ? 'rgba(231,76,60,0.15)' : 'rgba(108,92,231,0.15)' }}>
          {selected.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="stc-info">
          <div className="stc-name">
            {selected.displayName}
            {selected.isBlacklisted && <span className="bl-badge"><ShieldOff size={9} /> BL</span>}
          </div>
          <div className="stc-meta">
            <span className={`type-badge ${selected.tenantType}`}>
              {selected.tenantType === 'individual' ? <User size={10} /> : <Building2 size={10} />}
              {selected.tenantType}
            </span>
            <span className="stc-email">{selected.email || '—'}</span>
          </div>
        </div>
        <button className="stc-clear" onClick={onClear}><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className="tenant-search-picker" ref={ref}>
      <div className="tsp-input-wrap">
        <Search size={14} />
        <input
          placeholder="Search by name, email, ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => search.length >= 2 && setOpen(true)}
        />
        {search && <button onClick={() => { setSearch(''); setOpen(false); }}><X size={13} /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="tsp-dropdown">
          {results.map((t) => (
            <button
              key={t.id}
              className="tsp-option"
              onClick={() => { onSelect(t.id); setSearch(''); setOpen(false); }}
            >
              <div className="tsp-opt-avatar" style={{ background: t.isBlacklisted ? 'rgba(231,76,60,0.15)' : 'rgba(108,92,231,0.15)' }}>
                {t.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="tsp-opt-info">
                <div className="tsp-opt-name">{t.displayName}</div>
                <div className="tsp-opt-meta">{t.email || '—'} · {t.tenantType}</div>
              </div>
              {t.isBlacklisted && <ShieldOff size={12} color="#e74c3c" />}
            </button>
          ))}
        </div>
      )}
      {open && search.length >= 2 && results.length === 0 && (
        <div className="tsp-dropdown"><div className="tsp-empty">No tenants found</div></div>
      )}
    </div>
  );
}

/* ══ Merge Preview ══ */
function MergePreview({ primaryId, duplicateId, onBack, onConfirm, merging }: {
  primaryId: string; duplicateId: string;
  onBack: () => void; onConfirm: () => void; merging: boolean;
}) {
  const { data: pData } = useGetTenantQuery(primaryId);
  const { data: dData } = useGetTenantQuery(duplicateId);
  const primary = pData?.data;
  const duplicate = dData?.data;

  if (!primary || !duplicate) {
    return <div className="merge-loading">Loading preview…</div>;
  }

  // Count what will be migrated
  const migrated = [
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

      <div className="merge-footer">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn-danger" onClick={onConfirm} disabled={merging}>
          <GitMerge size={14} /> {merging ? 'Merging…' : 'Confirm Merge'}
        </button>
      </div>
    </div>
  );
}

function TenantPreviewCard({ tenant }: { tenant: any }) {
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
