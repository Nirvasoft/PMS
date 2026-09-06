import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetKycRequirementsQuery, useCreateKycRequirementMutation, useDeleteKycRequirementMutation,
  type KycRequirement,
} from '../../../store/api/tenantsApi';
import {
  ArrowLeft, Shield, Plus, Trash2, X, FileCheck, Users2, Building2, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './KycRequirementsPage.css';

const DOC_TYPES = [
  'passport', 'nric', 'fin', 'driving_license', 'bank_statement',
  'proof_of_income', 'employment_letter', 'trade_license', 'company_registration',
  'tax_clearance', 'utility_bill', 'reference_letter', 'photo', 'other',
];

export default function KycRequirementsPage() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<'individual' | 'company' | ''>('');
  const { data, isLoading } = useGetKycRequirementsQuery(typeFilter ? { tenantType: typeFilter } : undefined);
  const [create, { isLoading: creating }] = useCreateKycRequirementMutation();
  const [deleteReq] = useDeleteKycRequirementMutation();
  const confirmDialog = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    tenantType: 'individual' as string,
    docType: 'passport',
    name: '',
    description: '',
    isRequired: true,
    validityDays: '' as string | number,
    sortOrder: 0,
  });

  const requirements = data?.data || [];

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    try {
      await create({
        ...form,
        validityDays: form.validityDays ? Number(form.validityDays) : null,
        description: form.description || null,
      }).unwrap();
      toast.success('Requirement added');
      setShowForm(false);
      setForm({ tenantType: 'individual', docType: 'passport', name: '', description: '', isRequired: true, validityDays: '', sortOrder: 0 });
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete requirement "${name}"? Existing tenant checklists won't be affected.`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteReq(id).unwrap();
      toast.success('Requirement deleted');
    } catch { toast.error('Failed'); }
  };

  const individualReqs = requirements.filter((r) => r.tenantType === 'individual');
  const companyReqs = requirements.filter((r) => r.tenantType === 'company');

  return (
    <div className="kyc-req-page">
      <div className="kyc-req-header">
        <button className="back-btn" onClick={() => navigate('/admin/tenants')}>
          <ArrowLeft size={16} /> Tenants
        </button>
        <div className="kyc-req-title-row">
          <h1><Shield size={22} /> KYC Requirements</h1>
          <p className="kyc-req-subtitle">
            Configure which documents are required for KYC verification. Requirements are applied to new tenants on creation.
          </p>
        </div>
        <PermissionGuard permission="tenants.kyc">
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} /> Add Requirement
          </button>
        </PermissionGuard>
      </div>

      {/* Type filter */}
      <div className="kyc-req-filters">
        {(['', 'individual', 'company'] as const).map((v) => (
          <button key={v} className={typeFilter === v ? 'active' : ''} onClick={() => setTypeFilter(v)}>
            {v === '' ? 'All' : v === 'individual' ? <><Users2 size={12} /> Individual</> : <><Building2 size={12} /> Company</>}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="kyc-req-form card">
          <h3>New KYC Requirement</h3>
          <div className="kyc-req-form-grid">
            <div className="field">
              <label>Tenant Type</label>
              <select value={form.tenantType} onChange={(e) => setForm({ ...form, tenantType: e.target.value })}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </select>
            </div>
            <div className="field">
              <label>Document Type</label>
              <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
                {DOC_TYPES.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Display Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. NRIC / National ID" />
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Must be valid and not expired" />
            </div>
            <div className="field">
              <label>Validity (days)</label>
              <input type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })}
                placeholder="e.g. 180" />
            </div>
            <div className="field">
              <label>Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
            </div>
            <div className="field checkbox-field">
              <label>
                <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
                Required for verification
              </label>
            </div>
          </div>
          <div className="kyc-req-form-actions">
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Requirement'}
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <div className="loading-center">Loading…</div>}

      {/* Requirements grouped by type */}
      {(!typeFilter || typeFilter === 'individual') && individualReqs.length > 0 && (
        <ReqSection title="Individual Tenants" icon={<Users2 size={15} />} items={individualReqs} onDelete={handleDelete} />
      )}
      {(!typeFilter || typeFilter === 'company') && companyReqs.length > 0 && (
        <ReqSection title="Company Tenants" icon={<Building2 size={15} />} items={companyReqs} onDelete={handleDelete} />
      )}

      {!isLoading && requirements.length === 0 && (
        <div className="empty-state">
          <FileCheck size={40} />
          <h3>No KYC Requirements</h3>
          <p>Add requirements to define which documents tenants need to submit for verification.</p>
        </div>
      )}
    </div>
  );
}

function ReqSection({ title, icon, items, onDelete }: {
  title: string; icon: JSX.Element; items: KycRequirement[]; onDelete: (id: string, name: string) => void;
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
        {items.sort((a, b) => a.sortOrder - b.sortOrder).map((r, i) => (
          <div key={r.id} className="req-row">
            <span className="req-sort">{i + 1}</span>
            <div className="req-name-cell">
              <div className="req-name">{r.name}</div>
              {r.description && <div className="req-desc">{r.description}</div>}
            </div>
            <span className="req-doctype">{r.docType.replace(/_/g, ' ')}</span>
            <span>{r.isRequired ? <span className="required-chip">Required</span> : <span className="optional-chip">Optional</span>}</span>
            <span className="req-validity">{r.validityDays ? `${r.validityDays} days` : '—'}</span>
            <PermissionGuard permission="tenants.kyc">
              <button className="req-delete" onClick={() => onDelete(r.id, r.name)}><Trash2 size={13} /></button>
            </PermissionGuard>
          </div>
        ))}
      </div>
    </div>
  );
}
