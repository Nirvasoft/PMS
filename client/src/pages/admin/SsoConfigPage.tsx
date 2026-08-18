import { useState } from 'react';
import {
  useGetSsoConfigsQuery, useGetSsoConfigQuery,
  useCreateSsoConfigMutation, useUpdateSsoConfigMutation,
  useDeleteSsoConfigMutation, useToggleSsoConfigMutation,
} from '../../store/api/authApi';
import type { SsoConfigSummary } from '../../store/api/authApi';
import {
  Shield, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Loader2, AlertTriangle, Globe, Key, X, CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../components/DialogProvider';

const PROVIDERS = [
  { value: 'azure_ad', label: 'Azure AD', icon: '🔷' },
  { value: 'google', label: 'Google Workspace', icon: '🔴' },
  { value: 'okta', label: 'Okta', icon: '🟡' },
  { value: 'oidc', label: 'Generic OIDC', icon: '🔑' },
];

const emptyForm = {
  name: '',
  provider: 'oidc',
  protocol: 'oidc',
  clientId: '',
  clientSecret: '',
  issuerUrl: '',
  authorizationUrl: '',
  tokenUrl: '',
  userInfoUrl: '',
  scopes: 'openid profile email',
  autoProvision: false,
  defaultRoleId: '',
  domainRestriction: '',
};

export default function SsoConfigPage() {
  const { data, isLoading } = useGetSsoConfigsQuery();
  const [createConfig, { isLoading: creating }] = useCreateSsoConfigMutation();
  const [updateConfig, { isLoading: updating }] = useUpdateSsoConfigMutation();
  const [deleteConfig] = useDeleteSsoConfigMutation();
  const [toggleConfig] = useToggleSsoConfigMutation();
  const confirmDialog = useConfirm();

  const configs: SsoConfigSummary[] = data?.data || [];
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const handleNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleEdit = (id: string) => {
    setEditId(id);
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete SSO provider "${name}"? This will disconnect all users linked via this provider.`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteConfig(id).unwrap();
      toast.success('SSO provider deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      await toggleConfig({ id, enabled: !currentEnabled }).unwrap();
      toast.success(currentEnabled ? 'Provider disabled' : 'Provider enabled');
    } catch { toast.error('Failed to toggle'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await updateConfig({ id: editId, data: form }).unwrap();
        toast.success('SSO provider updated');
      } else {
        await createConfig(form).unwrap();
        toast.success('SSO provider created');
      }
      setShowModal(false);
    } catch (err: unknown) {
      const msg = (err as { data?: { errors?: Array<{ message: string }> } })?.data?.errors?.[0]?.message;
      toast.error(msg || 'Failed to save SSO config');
    }
  };

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="loading-screen"><Loader2 size={24} className="spin" /> Loading SSO configs...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><Shield size={24} /> SSO Configuration</h1>
          <p className="text-muted">Manage Single Sign-On providers for your organization</p>
        </div>
        <button className="btn btn-primary" onClick={handleNew}>
          <Plus size={16} /> Add Provider
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="empty-state">
          <Globe size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h3>No SSO Providers Configured</h3>
          <p className="text-muted">Add an OIDC provider like Azure AD, Google, or Okta to enable SSO for your users.</p>
          <button className="btn btn-primary" onClick={handleNew} style={{ marginTop: 16 }}>
            <Plus size={16} /> Add First Provider
          </button>
        </div>
      ) : (
        <div className="sso-config-grid">
          {configs.map((config) => {
            const provider = PROVIDERS.find(p => p.value === config.provider);
            return (
              <div key={config.id} className={`sso-config-card ${config.isEnabled ? 'enabled' : 'disabled'}`}>
                <div className="sso-config-header">
                  <span className="sso-provider-icon">{provider?.icon || '🔐'}</span>
                  <div className="sso-config-info">
                    <h3>{config.name}</h3>
                    <span className="text-muted text-small">{provider?.label || config.provider} · {config.protocol.toUpperCase()}</span>
                  </div>
                  <button
                    className="btn-icon"
                    onClick={() => handleToggle(config.id, config.isEnabled)}
                    title={config.isEnabled ? 'Disable' : 'Enable'}
                  >
                    {config.isEnabled
                      ? <ToggleRight size={28} style={{ color: 'var(--success)' }} />
                      : <ToggleLeft size={28} style={{ color: 'var(--text-muted)' }} />
                    }
                  </button>
                </div>

                <div className="sso-config-details">
                  <div className="sso-detail-row">
                    <span className="text-muted">Status</span>
                    {config.isEnabled
                      ? <span className="status-badge active"><CheckCircle size={12} /> Active</span>
                      : <span className="status-badge inactive">Inactive</span>
                    }
                  </div>
                  {config.domainRestriction && (
                    <div className="sso-detail-row">
                      <span className="text-muted">Domain</span>
                      <span className="text-mono text-small">{config.domainRestriction}</span>
                    </div>
                  )}
                  <div className="sso-detail-row">
                    <span className="text-muted">Auto-provision</span>
                    <span>{config.autoProvision ? 'Yes (JIT)' : 'No'}</span>
                  </div>
                  {config.isDefault && (
                    <div className="sso-detail-row">
                      <span className="text-muted">Default</span>
                      <span className="status-badge active">Default provider</span>
                    </div>
                  )}
                </div>

                <div className="sso-config-actions">
                  <button className="btn btn-sm btn-outline" onClick={() => handleEdit(config.id)}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button className="btn btn-sm btn-outline btn-danger" onClick={() => handleDelete(config.id, config.name)}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <SsoConfigModal
          editId={editId}
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
          isSaving={creating || updating}
        />
      )}
    </div>
  );
}

function SsoConfigModal({
  editId, form, setForm, onSubmit, onClose, isSaving,
}: {
  editId: string | null;
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  // Load existing config when editing
  const { data: existingData, isLoading: loadingExisting } = useGetSsoConfigQuery(editId || '', { skip: !editId });

  // Pre-fill form when data loads
  if (editId && existingData?.data && form.name === '') {
    const d = existingData.data;
    setForm({
      name: d.name,
      provider: d.provider,
      protocol: d.protocol,
      clientId: d.clientId || '',
      clientSecret: d.clientSecret || '',
      issuerUrl: d.issuerUrl || '',
      authorizationUrl: d.authorizationUrl || '',
      tokenUrl: d.tokenUrl || '',
      userInfoUrl: d.userInfoUrl || '',
      scopes: d.scopes || 'openid profile email',
      autoProvision: d.autoProvision,
      defaultRoleId: d.defaultRoleId || '',
      domainRestriction: d.domainRestriction || '',
    });
  }

  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });

  if (editId && loadingExisting) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h2><Key size={20} /> {editId ? 'Edit' : 'Add'} SSO Provider</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {/* Basic Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Display Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Acme Azure AD" required />
              </div>
              <div className="form-group">
                <label>Provider Type *</label>
                <select value={form.provider} onChange={e => set('provider', e.target.value)}>
                  {PROVIDERS.map(p => (
                    <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <h3 style={{ margin: '20px 0 12px', fontSize: 14, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              OIDC Configuration
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Client ID</label>
                <input value={form.clientId} onChange={e => set('clientId', e.target.value)} placeholder="Application (client) ID" />
              </div>
              <div className="form-group">
                <label>Client Secret</label>
                <input type="password" value={form.clientSecret} onChange={e => set('clientSecret', e.target.value)} placeholder={editId ? '••••••••' : 'Client secret value'} />
              </div>
            </div>

            <div className="form-group">
              <label>Issuer URL</label>
              <input value={form.issuerUrl} onChange={e => set('issuerUrl', e.target.value)} placeholder="https://login.microsoftonline.com/{tenant}/v2.0" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Authorization URL</label>
                <input value={form.authorizationUrl} onChange={e => set('authorizationUrl', e.target.value)} placeholder="https://...authorize" />
              </div>
              <div className="form-group">
                <label>Token URL</label>
                <input value={form.tokenUrl} onChange={e => set('tokenUrl', e.target.value)} placeholder="https://...token" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>UserInfo URL</label>
                <input value={form.userInfoUrl} onChange={e => set('userInfoUrl', e.target.value)} placeholder="https://...userinfo" />
              </div>
              <div className="form-group">
                <label>Scopes</label>
                <input value={form.scopes} onChange={e => set('scopes', e.target.value)} placeholder="openid profile email" />
              </div>
            </div>

            <h3 style={{ margin: '20px 0 12px', fontSize: 14, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Provisioning & Restrictions
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Domain Restriction</label>
                <input value={form.domainRestriction} onChange={e => set('domainRestriction', e.target.value)} placeholder="e.g. acme.com" />
                <span className="text-small text-muted">Only allow emails from this domain</span>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                  <input type="checkbox" checked={form.autoProvision} onChange={e => set('autoProvision', e.target.checked)} />
                  Auto-provision users (JIT)
                </label>
              </div>
            </div>

            {!editId && (
              <div className="alert" style={{ marginTop: 16, padding: 12, background: 'var(--surface-elevated)', borderRadius: 8, fontSize: 13 }}>
                <AlertTriangle size={14} style={{ marginRight: 6 }} />
                The provider will be created as <strong>disabled</strong>. Enable it after verifying the configuration.
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || !form.name}>
              {isSaving ? <><Loader2 size={16} className="spin" /> Saving...</> : (editId ? 'Update Provider' : 'Create Provider')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
