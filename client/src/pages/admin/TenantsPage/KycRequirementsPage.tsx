import { useState, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetKycRequirementsQuery,
  useCreateKycRequirementMutation,
  useDeleteKycRequirementMutation,
  type KycRequirement,
} from '../../../store/api/tenantsApi';
import {
  List, Shield, Plus, Trash2, FileCheck, Users2, Building2, Search, Filter, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './KycRequirementsPage.css';

type TenantTypeOption = 'individual' | 'company';
type RequiredFilter = '' | 'required' | 'optional';

interface KycRequirementFormState {
  tenantType: TenantTypeOption;
  docType: string;
  name: string;
  description: string;
  isRequired: boolean;
  validityDays: string;
  sortOrder: number;
}

const DOC_TYPES = [
  'passport', 'nric', 'fin', 'driving_license', 'bank_statement',
  'proof_of_income', 'employment_letter', 'trade_license', 'company_registration',
  'tax_clearance', 'utility_bill', 'reference_letter', 'photo', 'other',
] as const;

const DOC_TYPE_ACRONYMS: Record<string, string> = { nric: 'NRIC', fin: 'FIN' };

const TENANT_TYPE_TABS: ReadonlyArray<readonly ['' | TenantTypeOption, string]> = [
  ['', 'All'],
  ['individual', 'Individual'],
  ['company', 'Company'],
];

const INITIAL_FORM: KycRequirementFormState = {
  tenantType: 'individual',
  docType: 'passport',
  name: '',
  description: '',
  isRequired: true,
  validityDays: '',
  sortOrder: 0,
};

function formatDocType(docType: string): string {
  if (DOC_TYPE_ACRONYMS[docType]) return DOC_TYPE_ACRONYMS[docType];
  return docType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getApiErrorMessage(err: unknown, fallback = 'Failed'): string {
  const apiErr = err as { data?: { errors?: Array<{ message?: string }> } } | undefined;
  return apiErr?.data?.errors?.[0]?.message || fallback;
}

export default function KycRequirementsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'' | TenantTypeOption>('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [requiredFilter, setRequiredFilter] = useState<RequiredFilter>('');

  const { data, isLoading } = useGetKycRequirementsQuery();
  const [create, { isLoading: creating }] = useCreateKycRequirementMutation();
  const [deleteReq] = useDeleteKycRequirementMutation();
  const confirmDialog = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [form, setForm] = useState<KycRequirementFormState>(INITIAL_FORM);

  const requirements = data?.data ?? [];
  const hasActiveFilters = Boolean(typeFilter || docTypeFilter || requiredFilter);
  const hasSearchOrFilters = Boolean(search.trim() || hasActiveFilters);

  const resetFilters = () => {
    setTypeFilter('');
    setDocTypeFilter('');
    setRequiredFilter('');
  };

  const { filteredRequirements, individualReqs, companyReqs } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = requirements
      .filter((r) => {
        if (typeFilter && r.tenantType !== typeFilter) return false;
        if (docTypeFilter && r.docType !== docTypeFilter) return false;
        if (requiredFilter === 'required' && !r.isRequired) return false;
        if (requiredFilter === 'optional' && r.isRequired) return false;
        if (q) {
          return [r.name, r.description, r.docType, formatDocType(r.docType)].some((v) =>
            v?.toLowerCase().includes(q),
          );
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      filteredRequirements: filtered,
      individualReqs: filtered.filter((r) => r.tenantType === 'individual'),
      companyReqs: filtered.filter((r) => r.tenantType === 'company'),
    };
  }, [requirements, search, typeFilter, docTypeFilter, requiredFilter]);

  const handleCreate = async () => {
    setAttempted(true);
    if (!form.name.trim()) {
      toast.error('Display name is required');
      return;
    }
    try {
      await create({
        ...form,
        name: form.name.trim(),
        validityDays: form.validityDays ? Number(form.validityDays) : null,
        description: form.description.trim() || null,
      }).unwrap();
      toast.success('Requirement added');
      setShowForm(false);
      setAttempted(false);
      setForm(INITIAL_FORM);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirmDialog(
      `Delete requirement "${name}"? Existing tenant checklists won't be affected.`,
      { danger: true, confirmText: 'Delete' },
    );
    if (!confirmed) return;
    try {
      await deleteReq(id).unwrap();
      toast.success('Requirement deleted');
    } catch {
      toast.error('Failed');
    }
  };

  return (
    <div className="kyc-req-page">
      <div className="kyc-req-header">
        <div className="kyc-req-title-group">
          <div className="kyc-req-icon"><Shield size={22} /></div>
          <div className="kyc-req-title-row">
            <h1>KYC Requirements</h1>
            <p className="kyc-req-count">
              {isLoading
                ? <span className="pms-skeleton-line kyc-count-skeleton" />
                : `${filteredRequirements.length} total requirements`}
            </p>
          </div>
        </div>
        <div className="kyc-req-header-actions">
          <button
            type="button"
            className="kyc-btn-secondary"
            onClick={() => navigate('/admin/tenants')}
          >
            <List size={14} /> List
          </button>
          <PermissionGuard permission="tenants.kyc">
            <button
              type="button"
              className="kyc-btn-primary"
              onClick={() => { setShowForm(!showForm); setAttempted(false); }}
            >
              <Plus size={15} /> Add Requirement
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="kyc-toolbar">
        <div className="kyc-search-box">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search document name, description, type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`kyc-btn-secondary kyc-filter-toggle${showFilters || hasActiveFilters ? ' active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={14} /> Filters{hasActiveFilters ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className="kyc-filter-bar">
          <div className="kyc-filter-tabs">
            {TENANT_TYPE_TABS.map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={typeFilter === val ? 'active' : ''}
                onClick={() => setTypeFilter(val)}
              >
                {val === 'individual' ? <Users2 size={12} /> : val === 'company' ? <Building2 size={12} /> : null}
                {label}
              </button>
            ))}
          </div>

          <select
            className="kyc-filter-select"
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
          >
            <option value="">All Document Types</option>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>{formatDocType(d)}</option>
            ))}
          </select>

          <select
            className="kyc-filter-select"
            value={requiredFilter}
            onChange={(e) => setRequiredFilter(e.target.value as RequiredFilter)}
          >
            <option value="">All Statuses</option>
            <option value="required">Required</option>
            <option value="optional">Optional</option>
          </select>

          <button type="button" className="kyc-btn-secondary" onClick={resetFilters}>
            <X size={14} /> Reset
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="kyc-req-form">
          <h3>New KYC Requirement</h3>
          <div className="kyc-req-form-grid">
            <div className="field">
              <label>Tenant Type</label>
              <select
                value={form.tenantType}
                onChange={(e) => setForm({ ...form, tenantType: e.target.value as TenantTypeOption })}
              >
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </select>
            </div>
            <div className="field">
              <label>Document Type</label>
              <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
                {DOC_TYPES.map((d) => <option key={d} value={d}>{formatDocType(d)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Display Name <span className="kyc-required-mark">*</span></label>
              <input
                className={attempted && !form.name.trim() ? 'input-error' : ''}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. NRIC / National ID"
              />
              {attempted && !form.name.trim() && (
                <span className="field-error-text">Display name is required</span>
              )}
            </div>
            <div className="field">
              <label>Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Must be valid and not expired"
              />
            </div>
            <div className="field">
              <label>Validity (days)</label>
              <input
                type="number"
                value={form.validityDays}
                onChange={(e) => setForm({ ...form, validityDays: e.target.value })}
                placeholder="e.g. 180"
              />
            </div>
            <div className="field">
              <label>Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </div>
            <div className="field checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={form.isRequired}
                  onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
                />
                Required for verification
              </label>
            </div>
          </div>
          <div className="kyc-req-form-actions">
            <button type="button" className="kyc-btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Requirement'}
            </button>
            <button
              type="button"
              className="kyc-btn-secondary"
              onClick={() => { setShowForm(false); setAttempted(false); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="loading-center">Loading…</div>}

      {/* Requirements grouped by type */}
      {individualReqs.length > 0 && (
        <ReqSection title="Individual Tenants" icon={<Users2 size={15} />} items={individualReqs} onDelete={handleDelete} />
      )}
      {companyReqs.length > 0 && (
        <ReqSection title="Company Tenants" icon={<Building2 size={15} />} items={companyReqs} onDelete={handleDelete} />
      )}

      {!isLoading && filteredRequirements.length === 0 && (
        <div className="empty-state">
          <FileCheck size={40} />
          {hasSearchOrFilters ? (
            <>
              <h3>No Matching Requirements</h3>
              <p>No KYC requirements found — try clearing search or filters.</p>
            </>
          ) : (
            <>
              <h3>No KYC Requirements</h3>
              <p>Add requirements to define which documents tenants need to submit for verification.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReqSection({ title, icon, items, onDelete }: {
  title: string;
  icon: ReactNode;
  items: KycRequirement[];
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="kyc-req-section">
      <h3 className="req-section-title">{icon} {title}</h3>
      <div className="req-table">
        <div className="req-table-header">
          <span>#</span>
          <span>Document</span>
          <span>Type</span>
          <span>Required</span>
          <span>Validity</span>
          <span></span>
        </div>
        {items.map((r, i) => (
          <div key={r.id} className="req-row">
            <span className="req-sort">{i + 1}</span>
            <div className="req-name-cell">
              <div className="req-name">{r.name}</div>
              {r.description && <div className="req-desc">{r.description}</div>}
            </div>
            <span className="req-doctype">{formatDocType(r.docType)}</span>
            <span>
              {r.isRequired
                ? <span className="required-chip">Required</span>
                : <span className="optional-chip">Optional</span>}
            </span>
            <span className="req-validity">{r.validityDays ? `${r.validityDays} days` : '—'}</span>
            <PermissionGuard permission="tenants.kyc">
              <button type="button" className="req-delete" onClick={() => onDelete(r.id, r.name)}>
                <Trash2 size={13} />
              </button>
            </PermissionGuard>
          </div>
        ))}
      </div>
    </div>
  );
}
