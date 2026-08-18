import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetApiKeysQuery, useGetApiKeyScopesQuery,
  useCreateApiKeyMutation, useDeleteApiKeyMutation, useRevokeApiKeyMutation,
} from '../../store/api/integrationsApi';
import {
  Key, Plus, X, Trash2, Copy, ShieldOff, ShieldCheck,
  Clock, CheckCircle2,
} from 'lucide-react';
import { useConfirm } from '../../components/DialogProvider';

export default function ApiKeysPage() {
  const { data: res, isLoading } = useGetApiKeysQuery();
  const { data: scopesRes } = useGetApiKeyScopesQuery();
  const [createApiKey] = useCreateApiKeyMutation();
  const [deleteApiKey] = useDeleteApiKeyMutation();
  const [revokeApiKey] = useRevokeApiKeyMutation();
  const confirmDialog = useConfirm();

  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', scopes: [] as string[], rateLimitRpm: 100, expiresAt: '' });

  const apiKeys = res?.data || [];
  const allScopes = scopesRes?.data || [];

  const toggleScope = (scope: string) => {
    setCreateForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }));
  };

  const handleCreate = async () => {
    if (!createForm.name || createForm.scopes.length === 0) return;
    const result = await createApiKey({
      name: createForm.name,
      scopes: createForm.scopes,
      rateLimitRpm: createForm.rateLimitRpm,
      expiresAt: createForm.expiresAt || null,
    }).unwrap();
    setNewKey(result.data.key);
    setShowCreate(false);
    setCreateForm({ name: '', scopes: [], rateLimitRpm: 100, expiresAt: '' });
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  return (
    <div className="page-content">
      <div className="intg-header">
        <div>
          <h1><Key size={24} /> API Keys</h1>
          <p className="mall-page-subtitle">Manage developer API keys for programmatic access</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Create API Key
        </button>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3].map(i => <div key={i} className="skeleton-card" style={{height:80}} />)}
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="mall-empty-state">
          <Key size={48} strokeWidth={1} />
          <h3>No API Keys</h3>
          <p>Create an API key for programmatic access to the PMS API</p>
        </div>
      ) : (
        <div className="intg-table-wrap">
          <table className="intg-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key Prefix</th>
                <th>Scopes</th>
                <th>Rate Limit</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((ak: any) => (
                <tr key={ak.id} className={!ak.isActive ? 'intg-row-revoked' : ''}>
                  <td><strong>{ak.name}</strong></td>
                  <td><code className="intg-key-prefix">{ak.keyPrefix}•••</code></td>
                  <td>
                    <div className="intg-events-wrap">
                      {ak.scopes.slice(0, 2).map((s: string) => (
                        <span key={s} className="intg-event-badge">{s}</span>
                      ))}
                      {ak.scopes.length > 2 && <span className="intg-event-badge more">+{ak.scopes.length - 2}</span>}
                    </div>
                  </td>
                  <td>{ak.rateLimitRpm} rpm</td>
                  <td>
                    {ak.isActive ? (
                      <span className="intg-wh-status active">● Active</span>
                    ) : (
                      <span className="intg-wh-status inactive">○ Revoked</span>
                    )}
                  </td>
                  <td className="intg-date-cell">{ak.lastUsedAt ? new Date(ak.lastUsedAt).toLocaleDateString() : '—'}</td>
                  <td className="intg-date-cell">{new Date(ak.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="intg-row-actions">
                      {ak.isActive && (
                        <button className="intg-action-btn-sm" onClick={async () => { if (await confirmDialog('Revoke this key?', { danger: true, confirmText: 'Revoke' })) revokeApiKey(ak.id); }} title="Revoke">
                          <ShieldOff size={13} />
                        </button>
                      )}
                      <button className="intg-action-btn-sm danger" onClick={async () => { if (await confirmDialog('Delete this key permanently?', { danger: true, confirmText: 'Delete' })) deleteApiKey(ak.id); }} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && createPortal(
        <div className="mall-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Create API Key</h3>
              <button className="mall-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Key Name *</span>
                  <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. My Integration Key" />
                </label>
                <label>
                  <span>Rate Limit (rpm)</span>
                  <input type="number" value={createForm.rateLimitRpm} onChange={e => setCreateForm({ ...createForm, rateLimitRpm: Number(e.target.value) })} />
                </label>
                <label>
                  <span>Expires At (optional)</span>
                  <input type="date" value={createForm.expiresAt} onChange={e => setCreateForm({ ...createForm, expiresAt: e.target.value })} />
                </label>
              </div>
              <div className="intg-events-section">
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '16px 0 10px', color: 'var(--text-primary)' }}>
                  Scopes ({createForm.scopes.length} selected)
                </h4>
                <div className="intg-scopes-grid">
                  {allScopes.map((scope: string) => (
                    <label key={scope} className="intg-event-check">
                      <input type="checkbox" checked={createForm.scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                      <span className="intg-scope-name">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!createForm.name || createForm.scopes.length === 0}>
                <Key size={14} /> Generate Key
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Key Reveal Modal */}
      {newKey && createPortal(
        <div className="mall-modal-overlay" onClick={() => setNewKey(null)}>
          <div className="mall-modal mall-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Your API Key</h3>
              <button className="mall-modal-close" onClick={() => setNewKey(null)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="intg-secret-reveal">
                <p style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 12 }}>
                  ⚠️ This key will only be shown once. Store it securely.
                </p>
                <div className="intg-secret-box">
                  <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{newKey}</code>
                  <button onClick={() => copyToClipboard(newKey)} className="intg-copy-btn"><Copy size={14} /> Copy</button>
                </div>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-primary" onClick={() => setNewKey(null)}>Done</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
