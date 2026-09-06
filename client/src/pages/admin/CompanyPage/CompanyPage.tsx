import { useState, useRef } from 'react';
import {
  useGetCompanyQuery, useUpdateCompanyMutation, useUpdateCompanySettingsMutation,
  useUploadLogoMutation, useGetCompanyHierarchyQuery,
  useGetBranchesQuery, useCreateBranchMutation, useUpdateBranchMutation, useDeleteBranchMutation,
  useGetRegionsQuery, useCreateRegionMutation, useUpdateRegionMutation, useDeleteRegionMutation,
  useGetRegionPropertiesQuery, useAddRegionPropertyMutation, useRemoveRegionPropertyMutation,
  useGetBusinessUnitsQuery, useCreateBusinessUnitMutation, useUpdateBusinessUnitMutation, useDeleteBusinessUnitMutation,
  useGetPropertiesQuery,
} from '../../../store/api/organizationApi';
import { useGetUsersQuery } from '../../../store/api/usersApi';
import toast from 'react-hot-toast';
import { FEATURE_FLAGS } from '../../../hooks/useFeatureFlags';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard, usePermission } from '../../../components/guards/PermissionGuard';

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
  const [uploadLogo, { isLoading: uploading }] = useUploadLogoMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const company = data?.data;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const canManage = usePermission('company.manage');

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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return; }
    try {
      await uploadLogo(file).unwrap();
      toast.success('Logo updated');
    } catch { toast.error('Failed to upload logo'); }
    e.target.value = '';
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;
  if (!company) return null;

  return (
    <div className="org-detail-grid">
      <div className="org-detail-card">
        <div className="org-detail-header">
          <h3>Company Information</h3>
          {!editing ? (
            <PermissionGuard permission="company.manage">
              <button className="btn btn-sm" onClick={startEdit}>Edit</button>
            </PermissionGuard>
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
        {/* Logo Upload */}
        <h3>Logo & Branding</h3>
        <div
          className={`logo-upload-area ${uploading ? 'uploading' : ''}`}
          onClick={() => canManage && fileRef.current?.click()}
          title={canManage ? 'Click to upload logo' : 'Permission required'}
          style={canManage ? undefined : { cursor: 'not-allowed' }}
        >
          {company.logoUrl ? (
            <img src={company.logoUrl} alt="Company Logo" className="company-logo-img" />
          ) : (
            <div className="logo-placeholder">
              <span style={{ fontSize: 40 }}>🏢</span>
              <span className="text-muted text-small">Click to upload logo</span>
            </div>
          )}
          {canManage && (
            <div className="logo-upload-overlay">
              {uploading ? '⏳ Uploading...' : '📷 Change Logo'}
            </div>
          )}
          {canManage && (
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          )}
        </div>

        {/* Summary Stats */}
        <h3 style={{ marginTop: 24 }}>Organization Summary</h3>
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

        {/* Subsidiary List */}
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
  const [updateBranch] = useUpdateBranchMutation();
  const [deleteBranch] = useDeleteBranchMutation();
  const [showModal, setShowModal] = useState<'create' | string | null>(null);
  const confirmDialog = useConfirm();
  const branches = data?.data ?? [];

  const editingBranch = typeof showModal === 'string' && showModal !== 'create'
    ? branches.find(b => b.id === showModal) : null;

  const handleSubmit = async (form: Record<string, string>) => {
    try {
      if (editingBranch) {
        await updateBranch({ id: editingBranch.id, data: form }).unwrap();
        toast.success('Branch updated');
      } else {
        await createBranch(form).unwrap();
        toast.success('Branch created');
      }
      setShowModal(null);
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete branch "${name}"?`, { danger: true, confirmText: 'Delete' }))) return;
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
        <PermissionGuard permission="company.manage">
          <button className="btn btn-primary" onClick={() => setShowModal('create')}>+ New Branch</button>
        </PermissionGuard>
      </div>

      <div className="org-cards-grid">
        {branches.map((b) => (
          <div key={b.id} className="org-card">
            <div className="org-card-top">
              <div className="org-card-icon">📍</div>
              <div className="org-card-title">
                <h3>{b.name}</h3>
              </div>
              {b.code && <span className="dept-code">{b.code}</span>}
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
            <PermissionGuard permission="company.manage">
              <div className="org-card-actions">
                <button className="btn btn-sm" onClick={() => setShowModal(b.id)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(b.id, b.name)}>Delete</button>
              </div>
            </PermissionGuard>
          </div>
        ))}
      </div>

      {showModal && (
        <OrgFormModal
          title={editingBranch ? `Edit Branch: ${editingBranch.name}` : 'Create Branch'}
          fields={[
            { key: 'name', label: 'Branch Name', required: true },
            { key: 'code', label: 'Code (e.g. SG-HQ)' },
            { key: 'managerId', label: 'Manager', type: 'user-select' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'addressLine1', label: 'Address' },
            { key: 'city', label: 'City' },
            { key: 'country', label: 'Country (2-letter)', maxLength: 2 },
          ]}
          initialValues={editingBranch ? {
            name: editingBranch.name,
            code: editingBranch.code || '',
            managerId: editingBranch.manager?.id || '',
            phone: editingBranch.phone || '',
            email: editingBranch.email || '',
            addressLine1: editingBranch.addressLine1 || '',
            city: editingBranch.city || '',
            country: editingBranch.country || '',
          } : undefined}
          onClose={() => setShowModal(null)}
          onSubmit={handleSubmit}
          submitLabel={editingBranch ? 'Save' : 'Create'}
        />
      )}
    </>
  );
}

/* ─── Regions Tab ──────────────────────────────── */

function RegionsTab() {
  const { data, isLoading } = useGetRegionsQuery();
  const [createRegion] = useCreateRegionMutation();
  const [updateRegion] = useUpdateRegionMutation();
  const [deleteRegion] = useDeleteRegionMutation();
  const [showModal, setShowModal] = useState<'create' | string | null>(null);
  const [pickerRegionId, setPickerRegionId] = useState<string | null>(null);
  const confirmDialog = useConfirm();
  const regions = data?.data ?? [];

  const editingRegion = typeof showModal === 'string' && showModal !== 'create'
    ? regions.find(r => r.id === showModal) : null;

  const handleSubmit = async (form: Record<string, string>) => {
    try {
      if (editingRegion) {
        await updateRegion({ id: editingRegion.id, data: form }).unwrap();
        toast.success('Region updated');
      } else {
        await createRegion(form).unwrap();
        toast.success('Region created');
      }
      setShowModal(null);
    } catch { toast.error('Failed'); }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      <div className="toolbar">
        <span className="text-secondary">{regions.length} region(s)</span>
        <PermissionGuard permission="company.manage">
          <button className="btn btn-primary" onClick={() => setShowModal('create')}>+ New Region</button>
        </PermissionGuard>
      </div>

      <div className="org-cards-grid">
        {regions.map((r) => (
          <div key={r.id} className="org-card">
            <div className="org-card-top">
              <div className="org-card-icon">🌍</div>
              <div className="org-card-title">
                <h3>{r.name}</h3>
              </div>
              {r.code && <span className="dept-code">{r.code}</span>}
            </div>
            <div className="org-card-details">
              {r.description && <span>{r.description}</span>}
              <span>🏠 {r._count.regionProperties} properties</span>
              {r.manager && (
                <span>👤 {r.manager.profile ? `${r.manager.profile.firstName} ${r.manager.profile.lastName}` : 'Manager'}</span>
              )}
            </div>
            <div className="org-card-actions">
              <button className="btn btn-sm" onClick={() => setPickerRegionId(r.id)}>🏠 Properties</button>
              <PermissionGuard permission="company.manage">
                <button className="btn btn-sm" onClick={() => setShowModal(r.id)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={async () => {
                  if (!(await confirmDialog(`Delete region "${r.name}"?`, { danger: true, confirmText: 'Delete' }))) return;
                  try { await deleteRegion(r.id).unwrap(); toast.success('Deleted'); }
                  catch { toast.error('Cannot delete'); }
                }}>Delete</button>
              </PermissionGuard>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <OrgFormModal
          title={editingRegion ? `Edit Region: ${editingRegion.name}` : 'Create Region'}
          fields={[
            { key: 'name', label: 'Region Name', required: true },
            { key: 'code', label: 'Code (e.g. SEA)' },
            { key: 'description', label: 'Description' },
            { key: 'managerId', label: 'Manager', type: 'user-select' },
          ]}
          initialValues={editingRegion ? {
            name: editingRegion.name,
            code: editingRegion.code || '',
            description: editingRegion.description || '',
            managerId: editingRegion.manager?.id || '',
          } : undefined}
          onClose={() => setShowModal(null)}
          onSubmit={handleSubmit}
          submitLabel={editingRegion ? 'Save' : 'Create'}
        />
      )}

      {pickerRegionId && (
        <RegionPropertyPicker
          regionId={pickerRegionId}
          onClose={() => setPickerRegionId(null)}
        />
      )}
    </>
  );
}

/* ─── Region Property Picker ───────────────────── */

function RegionPropertyPicker({ regionId, onClose }: { regionId: string; onClose: () => void }) {
  const { data: regionProps, isLoading: loadingRegion } = useGetRegionPropertiesQuery(regionId);
  const { data: allProps, isLoading: loadingAll } = useGetPropertiesQuery({ limit: '200' });
  const [addProp] = useAddRegionPropertyMutation();
  const [removeProp] = useRemoveRegionPropertyMutation();

  const assigned = regionProps?.data ?? [];
  const allProperties = allProps?.data ?? [];
  const assignedIds = new Set(assigned.map(p => p.id));
  const unassigned = allProperties.filter(p => !assignedIds.has(p.id));

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Region Properties</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 500, overflow: 'auto' }}>
          {(loadingRegion || loadingAll) ? (
            <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>
          ) : (
            <>
              <h4>Assigned ({assigned.length})</h4>
              {assigned.length === 0 ? (
                <p className="text-muted text-small">No properties assigned to this region</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {assigned.map(p => (
                    <div key={p.id} className="region-prop-row">
                      <div>
                        <strong>{p.name}</strong>
                        {p.code && <span className="dept-code">{p.code}</span>}
                        <span className="text-muted text-small" style={{ marginLeft: 8 }}>{p.city || ''}</span>
                      </div>
                      <PermissionGuard permission="company.manage">
                        <button className="btn btn-sm btn-danger" onClick={async () => {
                          try { await removeProp({ regionId, propertyId: p.id }).unwrap(); toast.success('Removed'); }
                          catch { toast.error('Failed'); }
                        }}>Remove</button>
                      </PermissionGuard>
                    </div>
                  ))}
                </div>
              )}

              <h4>Available Properties ({unassigned.length})</h4>
              {unassigned.length === 0 ? (
                <p className="text-muted text-small">All properties are assigned to this region</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unassigned.map(p => (
                    <div key={p.id} className="region-prop-row">
                      <div>
                        <span>{p.name}</span>
                        {p.code && <span className="dept-code">{p.code}</span>}
                        <span className="text-muted text-small" style={{ marginLeft: 8 }}>{p.city || ''}</span>
                      </div>
                      <PermissionGuard permission="company.manage">
                        <button className="btn btn-sm btn-primary" onClick={async () => {
                          try { await addProp({ regionId, propertyId: p.id }).unwrap(); toast.success('Added'); }
                          catch { toast.error('Failed'); }
                        }}>+ Add</button>
                      </PermissionGuard>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Business Units Tab ───────────────────────── */

function BusinessUnitsTab() {
  const { data, isLoading } = useGetBusinessUnitsQuery();
  const { data: branchesData } = useGetBranchesQuery();
  const [createBU] = useCreateBusinessUnitMutation();
  const [updateBU] = useUpdateBusinessUnitMutation();
  const [deleteBU] = useDeleteBusinessUnitMutation();
  const [showModal, setShowModal] = useState<'create' | string | null>(null);
  const confirmDialog = useConfirm();
  const units = data?.data ?? [];

  const editingBU = typeof showModal === 'string' && showModal !== 'create'
    ? units.find(u => u.id === showModal) : null;

  const handleSubmit = async (form: Record<string, string>) => {
    try {
      if (editingBU) {
        await updateBU({ id: editingBU.id, data: form }).unwrap();
        toast.success('Business unit updated');
      } else {
        await createBU(form).unwrap();
        toast.success('Business unit created');
      }
      setShowModal(null);
    } catch { toast.error('Failed'); }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      <div className="toolbar">
        <span className="text-secondary">{units.length} business unit(s)</span>
        <PermissionGuard permission="company.manage">
          <button className="btn btn-primary" onClick={() => setShowModal('create')}>+ New Unit</button>
        </PermissionGuard>
      </div>

      <div className="org-cards-grid">
        {units.map((bu) => (
          <div key={bu.id} className="org-card">
            <div className="org-card-top">
              <div className="org-card-icon">💼</div>
              <div className="org-card-title">
                <h3>{bu.name}</h3>
              </div>
              {bu.code && <span className="dept-code">{bu.code}</span>}
            </div>
            <div className="org-card-details">
              <span>📍 Branch: {bu.branch?.name || '—'}</span>
              <span>🏠 {bu._count.properties} properties</span>
              {bu.manager && (
                <span>👤 {bu.manager.profile ? `${bu.manager.profile.firstName} ${bu.manager.profile.lastName}` : 'Manager'}</span>
              )}
            </div>
            <PermissionGuard permission="company.manage">
              <div className="org-card-actions">
                <button className="btn btn-sm" onClick={() => setShowModal(bu.id)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={async () => {
                  if (!(await confirmDialog(`Delete "${bu.name}"?`, { danger: true, confirmText: 'Delete' }))) return;
                  try { await deleteBU(bu.id).unwrap(); toast.success('Deleted'); }
                  catch (err: unknown) {
                    const e = err as { data?: { errors?: { message: string }[] } };
                    toast.error(e.data?.errors?.[0]?.message || 'Cannot delete');
                  }
                }}>Delete</button>
              </div>
            </PermissionGuard>
          </div>
        ))}
      </div>

      {showModal && (
        <OrgFormModal
          title={editingBU ? `Edit: ${editingBU.name}` : 'Create Business Unit'}
          fields={[
            { key: 'name', label: 'Unit Name', required: true },
            { key: 'code', label: 'Code (e.g. BU-FIN)' },
            { key: 'branchId', label: 'Branch', type: 'select', options: branchesData?.data?.map((b) => ({ value: b.id, label: b.name })) ?? [] },
            { key: 'managerId', label: 'Manager', type: 'user-select' },
          ]}
          initialValues={editingBU ? {
            name: editingBU.name,
            code: editingBU.code || '',
            branchId: editingBU.branch?.id || '',
            managerId: editingBU.manager?.id || '',
          } : undefined}
          onClose={() => setShowModal(null)}
          onSubmit={handleSubmit}
          submitLabel={editingBU ? 'Save' : 'Create'}
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

  const toggle = async (key: string) => {
    // Default is true (enabled) if not explicitly set
    const currentValue = settings[key] === undefined || settings[key] === null ? true : Boolean(settings[key]);
    try {
      await updateSettings({ [key]: !currentValue }).unwrap();
      toast.success(`${!currentValue ? 'Enabled' : 'Disabled'} successfully`);
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="org-detail-card" style={{ maxWidth: 600 }}>
      <h3>Feature Flags</h3>
      <p className="text-secondary text-small" style={{ marginBottom: 16 }}>
        Enable or disable modules for your organization. Changes take effect immediately — disabled modules are hidden from the sidebar.
      </p>
      <div className="feature-flags-list">
        {Object.entries(FEATURE_FLAGS).map(([key, meta]) => {
          const isOn = settings[key] === undefined || settings[key] === null ? true : Boolean(settings[key]);
          return (
            <div key={key} className="feature-flag-item">
              <div className="feature-flag-info">
                <span className="feature-flag-label">{meta.label}</span>
                <span className="text-muted text-small">{meta.desc}</span>
              </div>
              <PermissionGuard permission="company.manage">
                <button
                  className={`toggle-switch ${isOn ? 'on' : ''}`}
                  onClick={() => toggle(key)}
                  disabled={isLoading}
                >
                  <span className="toggle-knob" />
                </button>
              </PermissionGuard>
            </div>
          );
        })}
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
  type?: 'text' | 'select' | 'user-select'; maxLength?: number;
  options?: { value: string; label: string }[];
}

function OrgFormModal({ title, fields, onClose, onSubmit, initialValues, submitLabel }: {
  title: string; fields: FieldDef[];
  onClose: () => void; onSubmit: (form: Record<string, string>) => void;
  initialValues?: Record<string, string>;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<Record<string, string>>(
    initialValues || Object.fromEntries(fields.map((f) => [f.key, '']))
  );

  // Load users for user-select fields
  const hasUserSelect = fields.some(f => f.type === 'user-select');
  const { data: usersData } = useGetUsersQuery({}, { skip: !hasUserSelect });
  const users = usersData?.data ?? [];

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            // Empty fields are omitted entirely so Prisma uses column defaults.
            // Sending null breaks non-nullable columns (e.g. country String @default("US"))
            // and UUID/FK columns (e.g. managerId) that expect a valid UUID or nothing.
            const sanitized = Object.fromEntries(
              Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined)
            );
            onSubmit(sanitized as Record<string, string>);
          }}
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
              ) : f.type === 'user-select' ? (
                <select
                  className="input-full"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                >
                  <option value="">— No Manager —</option>
                  {users.map((u: Record<string, unknown>) => (
                    <option key={u.id as string} value={u.id as string}>
                      {String(u.fullName || u.email || '')}
                    </option>
                  ))}
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
            <button type="submit" className="btn btn-primary">{submitLabel || 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
