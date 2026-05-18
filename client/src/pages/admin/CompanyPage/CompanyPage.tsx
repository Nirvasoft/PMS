import { useState } from 'react';
import {
  useGetCompanyQuery, useUpdateCompanyMutation, useUpdateCompanySettingsMutation,
  useGetBranchesQuery, useCreateBranchMutation, useDeleteBranchMutation,
  useGetRegionsQuery, useCreateRegionMutation, useDeleteRegionMutation,
  useGetBusinessUnitsQuery, useCreateBusinessUnitMutation, useDeleteBusinessUnitMutation,
} from '../../../store/api/organizationApi';
import toast from 'react-hot-toast';

type Tab = 'general' | 'branches' | 'regions' | 'business-units' | 'features';

export default function CompanyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: '🏢 General' },
    { key: 'branches', label: '📍 Branches' },
    { key: 'regions', label: '🌍 Regions' },
    { key: 'business-units', label: '💼 Business Units' },
    { key: 'features', label: '⚙️ Features' },
  ];

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>🏢 Organization Settings</h1>
        <p className="text-secondary">Manage your company, branches, regions and organizational structure</p>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'branches' && <BranchesTab />}
        {activeTab === 'regions' && <RegionsTab />}
        {activeTab === 'business-units' && <BusinessUnitsTab />}
        {activeTab === 'features' && <FeaturesTab />}
      </div>
    </div>
  );
}

/* ─── General Tab ──────────────────────────────── */

function GeneralTab() {
  const { data, isLoading } = useGetCompanyQuery();
  const [updateCompany, { isLoading: saving }] = useUpdateCompanyMutation();
  const company = data?.data;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const startEdit = () => {
    if (!company) return;
    setForm({
      name: company.name || '',
      legalName: company.legalName || '',
      phone: company.phone || '',
      email: company.email || '',
      website: company.website || '',
      addressLine1: company.addressLine1 || '',
      city: company.city || '',
      postalCode: company.postalCode || '',
      country: company.country || '',
      timezone: company.timezone || '',
      currency: company.currency || '',
      industry: company.industry || '',
      registrationNo: company.registrationNo || '',
      taxId: company.taxId || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      await updateCompany(form).unwrap();
      toast.success('Company details updated');
      setEditing(false);
    } catch {
      toast.error('Failed to update');
    }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;
  if (!company) return null;

  return (
    <div className="org-detail-grid">
      <div className="org-detail-card">
        <div className="org-detail-header">
          <h3>Company Information</h3>
          {!editing ? (
            <button className="btn btn-sm" onClick={startEdit}>Edit</button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {!editing ? (
          <div className="org-info-list">
            <InfoRow label="Company Name" value={company.name} />
            <InfoRow label="Legal Name" value={company.legalName} />
            <InfoRow label="Type" value={company.companyType} badge />
            <InfoRow label="Industry" value={company.industry} />
            <InfoRow label="Registration No." value={company.registrationNo} />
            <InfoRow label="Tax ID" value={company.taxId} />
            <InfoRow label="Phone" value={company.phone} />
            <InfoRow label="Email" value={company.email} />
            <InfoRow label="Website" value={company.website} />
            <InfoRow label="Address" value={[company.addressLine1, company.city, company.postalCode].filter(Boolean).join(', ')} />
            <InfoRow label="Country" value={company.country} />
            <InfoRow label="Timezone" value={company.timezone} />
            <InfoRow label="Currency" value={company.currency} />
          </div>
        ) : (
          <div className="org-edit-form">
            {Object.entries(form).map(([key, val]) => (
              <div className="form-group" key={key}>
                <label>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</label>
                <input
                  className="input-full"
                  value={val}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="org-detail-card">
        <h3>Organization Summary</h3>
        <div className="org-stats-mini">
          <div className="org-stat-item">
            <span className="org-stat-num">{company._count.branches}</span>
            <span className="org-stat-label">Branches</span>
          </div>
          <div className="org-stat-item">
            <span className="org-stat-num">{company._count.properties}</span>
            <span className="org-stat-label">Properties</span>
          </div>
          <div className="org-stat-item">
            <span className="org-stat-num">{company._count.users}</span>
            <span className="org-stat-label">Users</span>
          </div>
          <div className="org-stat-item">
            <span className="org-stat-num">{company._count.regions}</span>
            <span className="org-stat-label">Regions</span>
          </div>
          <div className="org-stat-item">
            <span className="org-stat-num">{company._count.businessUnits}</span>
            <span className="org-stat-label">Business Units</span>
          </div>
        </div>

        {company.subsidiaries.length > 0 && (
          <>
            <h4 style={{ marginTop: 20, marginBottom: 8 }}>Subsidiaries</h4>
            {company.subsidiaries.map((s) => (
              <div key={s.id} className="org-sub-item">
                <span>{s.name}</span>
                <span className="role-chip">{s.companyType}</span>
                <span className={`status-badge ${s.isActive ? 'active' : 'inactive'}`}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Branches Tab ─────────────────────────────── */

function BranchesTab() {
  const { data, isLoading } = useGetBranchesQuery();
  const [createBranch] = useCreateBranchMutation();
  const [deleteBranch] = useDeleteBranchMutation();
  const [showCreate, setShowCreate] = useState(false);
  const branches = data?.data ?? [];

  const handleCreate = async (form: Record<string, string>) => {
    try {
      await createBranch(form).unwrap();
      toast.success('Branch created');
      setShowCreate(false);
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete branch "${name}"?`)) return;
    try {
      await deleteBranch(id).unwrap();
      toast.success('Branch deleted');
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Cannot delete');
    }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      <div className="toolbar">
        <span className="text-secondary">{branches.length} branch(es)</span>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Branch</button>
      </div>

      <div className="org-cards-grid">
        {branches.map((b) => (
          <div key={b.id} className="org-card">
            <div className="org-card-top">
              <div className="org-card-icon">📍</div>
              <div className="org-card-title">
                <h3>{b.name}</h3>
                {b.code && <span className="dept-code">{b.code}</span>}
              </div>
            </div>
            <div className="org-card-details">
              <span>📞 {b.phone || '—'}</span>
              <span>📧 {b.email || '—'}</span>
              <span>📌 {[b.city, b.country].filter(Boolean).join(', ') || '—'}</span>
              <span>🏠 {b._count.properties} properties</span>
              {b.manager && (
                <span>👤 {b.manager.profile ? `${b.manager.profile.firstName} ${b.manager.profile.lastName}` : 'Manager assigned'}</span>
              )}
            </div>
            <div className="org-card-actions">
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(b.id, b.name)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <OrgFormModal
          title="Create Branch"
          fields={[
            { key: 'name', label: 'Branch Name', required: true },
            { key: 'code', label: 'Code (e.g. SG-HQ)' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'addressLine1', label: 'Address' },
            { key: 'city', label: 'City' },
            { key: 'country', label: 'Country (2-letter)', maxLength: 2 },
          ]}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

/* ─── Regions Tab ──────────────────────────────── */

function RegionsTab() {
  const { data, isLoading } = useGetRegionsQuery();
  const [createRegion] = useCreateRegionMutation();
  const [deleteRegion] = useDeleteRegionMutation();
  const [showCreate, setShowCreate] = useState(false);
  const regions = data?.data ?? [];

  const handleCreate = async (form: Record<string, string>) => {
    try {
      await createRegion(form).unwrap();
      toast.success('Region created');
      setShowCreate(false);
    } catch { toast.error('Failed'); }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      <div className="toolbar">
        <span className="text-secondary">{regions.length} region(s)</span>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Region</button>
      </div>

      <div className="org-cards-grid">
        {regions.map((r) => (
          <div key={r.id} className="org-card">
            <div className="org-card-top">
              <div className="org-card-icon">🌍</div>
              <div className="org-card-title">
                <h3>{r.name}</h3>
                {r.code && <span className="dept-code">{r.code}</span>}
              </div>
            </div>
            <div className="org-card-details">
              {r.description && <span>{r.description}</span>}
              <span>🏠 {r._count.regionProperties} properties</span>
            </div>
            <div className="org-card-actions">
              <button className="btn btn-sm btn-danger" onClick={async () => {
                if (!confirm(`Delete region "${r.name}"?`)) return;
                try { await deleteRegion(r.id).unwrap(); toast.success('Deleted'); }
                catch { toast.error('Cannot delete'); }
              }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <OrgFormModal
          title="Create Region"
          fields={[
            { key: 'name', label: 'Region Name', required: true },
            { key: 'code', label: 'Code (e.g. SEA)' },
            { key: 'description', label: 'Description' },
          ]}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

/* ─── Business Units Tab ───────────────────────── */

function BusinessUnitsTab() {
  const { data, isLoading } = useGetBusinessUnitsQuery();
  const { data: branchesData } = useGetBranchesQuery();
  const [createBU] = useCreateBusinessUnitMutation();
  const [deleteBU] = useDeleteBusinessUnitMutation();
  const [showCreate, setShowCreate] = useState(false);
  const units = data?.data ?? [];

  const handleCreate = async (form: Record<string, string>) => {
    try {
      await createBU(form).unwrap();
      toast.success('Business unit created');
      setShowCreate(false);
    } catch { toast.error('Failed'); }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      <div className="toolbar">
        <span className="text-secondary">{units.length} business unit(s)</span>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Unit</button>
      </div>

      <div className="org-cards-grid">
        {units.map((bu) => (
          <div key={bu.id} className="org-card">
            <div className="org-card-top">
              <div className="org-card-icon">💼</div>
              <div className="org-card-title">
                <h3>{bu.name}</h3>
                {bu.code && <span className="dept-code">{bu.code}</span>}
              </div>
            </div>
            <div className="org-card-details">
              <span>📍 Branch: {bu.branch?.name || '—'}</span>
              <span>🏠 {bu._count.properties} properties</span>
            </div>
            <div className="org-card-actions">
              <button className="btn btn-sm btn-danger" onClick={async () => {
                if (!confirm(`Delete "${bu.name}"?`)) return;
                try { await deleteBU(bu.id).unwrap(); toast.success('Deleted'); }
                catch (err: unknown) {
                  const e = err as { data?: { errors?: { message: string }[] } };
                  toast.error(e.data?.errors?.[0]?.message || 'Cannot delete');
                }
              }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <OrgFormModal
          title="Create Business Unit"
          fields={[
            { key: 'name', label: 'Unit Name', required: true },
            { key: 'code', label: 'Code (e.g. BU-FIN)' },
            { key: 'branchId', label: 'Branch', type: 'select', options: branchesData?.data?.map((b) => ({ value: b.id, label: b.name })) ?? [] },
          ]}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}
    </>
  );
}

/* ─── Features Tab ─────────────────────────────── */

function FeaturesTab() {
  const { data } = useGetCompanyQuery();
  const [updateSettings, { isLoading }] = useUpdateCompanySettingsMutation();
  const settings = (data?.data?.settings ?? {}) as Record<string, unknown>;

  const featureFlags = [
    { key: 'condoModuleEnabled', label: 'Condo Management Module', desc: 'Enable condo/strata management features' },
    { key: 'mallModuleEnabled', label: 'Mall Management Module', desc: 'Enable shopping mall tenant management' },
    { key: 'visitorMgmtEnabled', label: 'Visitor Management', desc: 'Enable visitor registration and tracking' },
    { key: 'onlinePaymentEnabled', label: 'Online Payments', desc: 'Enable tenant online payment portal' },
  ];

  const toggle = async (key: string) => {
    try {
      await updateSettings({ [key]: !settings[key] }).unwrap();
      toast.success('Setting updated');
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="org-detail-card" style={{ maxWidth: 600 }}>
      <h3>Feature Flags</h3>
      <p className="text-secondary text-small" style={{ marginBottom: 16 }}>
        Enable or disable modules for your organization. Changes take effect immediately.
      </p>
      <div className="feature-flags-list">
        {featureFlags.map((f) => (
          <div key={f.key} className="feature-flag-item">
            <div className="feature-flag-info">
              <span className="feature-flag-label">{f.label}</span>
              <span className="text-muted text-small">{f.desc}</span>
            </div>
            <button
              className={`toggle-switch ${settings[f.key] ? 'on' : ''}`}
              onClick={() => toggle(f.key)}
              disabled={isLoading}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <h4>Subscription</h4>
        <div className="org-info-list" style={{ marginTop: 8 }}>
          <InfoRow label="Plan" value={String(settings.subscriptionPlan || 'Free')} badge />
          <InfoRow label="Max Properties" value={String(settings.maxProperties || 'Unlimited')} />
        </div>
      </div>
    </div>
  );
}

/* ─── Shared Components ────────────────────────── */

function InfoRow({ label, value, badge }: { label: string; value: string | null; badge?: boolean }) {
  return (
    <div className="org-info-row">
      <span className="org-info-label">{label}</span>
      {badge ? (
        <span className="role-chip">{value || '—'}</span>
      ) : (
        <span className="org-info-value">{value || '—'}</span>
      )}
    </div>
  );
}

interface FieldDef {
  key: string; label: string; required?: boolean;
  type?: 'text' | 'select'; maxLength?: number;
  options?: { value: string; label: string }[];
}

function OrgFormModal({ title, fields, onClose, onSubmit }: {
  title: string; fields: FieldDef[];
  onClose: () => void; onSubmit: (form: Record<string, string>) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, '']))
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form
          className="modal-body"
          onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
        >
          {fields.map((f) => (
            <div className="form-group" key={f.key}>
              <label>{f.label} {f.required && '*'}</label>
              {f.type === 'select' ? (
                <select
                  className="input-full"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                >
                  <option value="">— Select —</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  className="input-full"
                  required={f.required}
                  maxLength={f.maxLength}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}
