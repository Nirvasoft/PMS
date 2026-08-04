import { useState } from 'react';
import {
  useGetAdminCompaniesQuery, useProvisionCompanyMutation,
  useDeactivateCompanyMutation, useActivateCompanyMutation,
} from '../../../store/api/organizationApi';
import toast from 'react-hot-toast';
import { usePermission } from '../../../components/guards/PermissionGuard';

export default function AdminCompaniesPage() {
  const canProvision = usePermission('companies.provision');
  const { data, isLoading } = useGetAdminCompaniesQuery(undefined, { skip: !canProvision });
  const [provisionCompany, { isLoading: provisioning }] = useProvisionCompanyMutation();
  const [deactivateCompany] = useDeactivateCompanyMutation();
  const [activateCompany] = useActivateCompanyMutation();
  const [showProvision, setShowProvision] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const companies = (data?.data ?? []) as Array<Record<string, unknown>>;

  const [form, setForm] = useState({
    name: '', legalName: '', companyType: 'standalone', country: '',
    currency: '', timezone: '', email: '', phone: '',
    adminEmail: '', adminFirstName: '', adminLastName: '',
  });

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await provisionCompany(form).unwrap();
      setResult(res.data);
      toast.success('Company provisioned successfully!');
      setForm({
        name: '', legalName: '', companyType: 'standalone', country: '',
        currency: '', timezone: '', email: '', phone: '',
        adminEmail: '', adminFirstName: '', adminLastName: '',
      });
    } catch (err: unknown) {
      const e2 = err as { data?: { errors?: { message: string }[] } };
      toast.error(e2.data?.errors?.[0]?.message || 'Provisioning failed');
    }
  };

  if (!canProvision) {
    return (
      <div className="page-content">
        <div className="info-card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2>Access Denied</h2>
          <p className="text-muted">Requires <code>companies.provision</code> permission.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>🏗️ Company Provisioning</h1>
        <p className="text-secondary">Create and manage multi-tenant companies</p>
      </div>

      <div className="toolbar">
        <span className="text-secondary">{companies.length} company(ies)</span>
        <button className="btn btn-primary" onClick={() => { setShowProvision(!showProvision); setResult(null); }}>
          {showProvision ? '✕ Close' : '+ Provision New Company'}
        </button>
      </div>

      {/* Provision Form */}
      {showProvision && (
        <div className="info-card" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>🏗️ Provision New Company</h3>
          <p className="text-muted text-small" style={{ marginBottom: 16 }}>
            Creates a company with default roles, departments, password policy, and the first admin user.
          </p>
          <form onSubmit={handleProvision}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label>Company Name *</label>
                <input className="input-full" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Legal Name</label>
                <input className="input-full" value={form.legalName}
                  onChange={e => setForm({ ...form, legalName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="input-full" value={form.companyType}
                  onChange={e => setForm({ ...form, companyType: e.target.value })}>
                  <option value="standalone">Standalone</option>
                  <option value="holding">Holding</option>
                  <option value="subsidiary">Subsidiary</option>
                </select>
              </div>
              <div className="form-group">
                <label>Country (ISO) *</label>
                <input className="input-full" required maxLength={2} placeholder="US"
                  value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} />
              </div>
              <div className="form-group">
                <label>Currency (ISO) *</label>
                <input className="input-full" required maxLength={3} placeholder="USD"
                  value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
              </div>
              <div className="form-group">
                <label>Timezone *</label>
                <input className="input-full" required placeholder="Asia/Yangon"
                  value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Company Email</label>
                <input className="input-full" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Company Phone</label>
                <input className="input-full" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>

            <h4 style={{ marginTop: 16 }}>First Admin User</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label>Admin Email *</label>
                <input className="input-full" type="email" required value={form.adminEmail}
                  onChange={e => setForm({ ...form, adminEmail: e.target.value })} />
              </div>
              <div className="form-group">
                <label>First Name *</label>
                <input className="input-full" required value={form.adminFirstName}
                  onChange={e => setForm({ ...form, adminFirstName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Last Name *</label>
                <input className="input-full" required value={form.adminLastName}
                  onChange={e => setForm({ ...form, adminLastName: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={provisioning}>
                {provisioning ? '⏳ Provisioning...' : '🚀 Provision Company'}
              </button>
            </div>
          </form>

          {/* Result */}
          {result && (
            <div className="info-card" style={{ marginTop: 16, padding: 16, background: 'var(--surface-elevated)' }}>
              <h4 style={{ color: 'var(--success)', marginTop: 0 }}>✅ Company Provisioned</h4>
              <div className="org-info-list">
                <InfoRow label="Company" value={String((result.company as Record<string, unknown>)?.name || '')} />
                <InfoRow label="Code" value={String((result.company as Record<string, unknown>)?.code || '')} badge />
                <InfoRow label="Admin Email" value={String((result.admin as Record<string, unknown>)?.email || '')} />
                <InfoRow label="Temp Password" value={String((result.admin as Record<string, unknown>)?.temporaryPassword || '')} badge />
                <InfoRow label="Roles Created" value={String((result.summary as Record<string, unknown>)?.rolesCreated || 0)} />
                <InfoRow label="Depts Created" value={String((result.summary as Record<string, unknown>)?.departmentsCreated || 0)} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Companies Table */}
      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading companies...</div>
      ) : (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Code</th>
                <th>Type</th>
                <th>Country</th>
                <th>Users</th>
                <th>Properties</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id as string}>
                  <td><strong>{String(c.name)}</strong></td>
                  <td><span className="dept-code">{String(c.code || '—')}</span></td>
                  <td><span className="role-chip">{String(c.companyType || 'standalone')}</span></td>
                  <td>{String(c.country || '—')}</td>
                  <td>{String((c._count as Record<string, number>)?.users ?? 0)}</td>
                  <td>{String((c._count as Record<string, number>)?.properties ?? 0)}</td>
                  <td>
                    <span className={`status-badge ${c.isActive ? 'active' : 'inactive'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    {c.isActive ? (
                      <button className="btn btn-sm btn-danger" onClick={async () => {
                        if (!confirm(`Deactivate "${c.name}"? Users will be unable to login.`)) return;
                        try { await deactivateCompany(c.id as string).unwrap(); toast.success('Company deactivated'); }
                        catch { toast.error('Failed'); }
                      }}>Deactivate</button>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={async () => {
                        try { await activateCompany(c.id as string).unwrap(); toast.success('Company activated'); }
                        catch { toast.error('Failed'); }
                      }}>Activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
