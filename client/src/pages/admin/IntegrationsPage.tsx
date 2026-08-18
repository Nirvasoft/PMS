import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetIntegrationsQuery, useGetIntegrationTypesQuery,
  useCreateIntegrationMutation, useUpdateIntegrationMutation, useDeleteIntegrationMutation,
  useTestIntegrationMutation, useTriggerSyncMutation, useGetSyncLogsQuery,
  useGetEntityMapQuery,
} from '../../store/api/integrationsApi';
import {
  Plug, Plus, X, RefreshCw, Zap, Trash2, Activity,
  CheckCircle2, AlertCircle, Clock, Settings2, ChevronRight,
  Cloud, CreditCard, FileSignature, Building2, Edit, Map, Database,
} from 'lucide-react';
import { useConfirm } from '../../components/DialogProvider';

const TYPE_META: Record<string, { name: string; icon: string; cat: string; color: string }> = {
  sap:         { name: 'SAP S/4HANA',           icon: '🏢', cat: 'ERP',        color: '#0070f3' },
  netsuite:    { name: 'Oracle NetSuite',        icon: '☁️', cat: 'ERP',        color: '#f97316' },
  dynamics365: { name: 'Microsoft Dynamics 365', icon: '🔷', cat: 'ERP',        color: '#00a4ef' },
  quickbooks:  { name: 'QuickBooks Online',      icon: '📗', cat: 'Accounting', color: '#2ca01c' },
  xero:        { name: 'Xero',                   icon: '💙', cat: 'Accounting', color: '#13b5ea' },
  docusign:    { name: 'DocuSign',               icon: '✍️', cat: 'E-Sign',     color: '#ffce00' },
  adobesign:   { name: 'Adobe Acrobat Sign',     icon: '📄', cat: 'E-Sign',     color: '#fa0f00' },
  stripe:      { name: 'Stripe',                 icon: '💳', cat: 'Payment',    color: '#635bff' },
  paytabs:     { name: 'PayTabs',                icon: '💰', cat: 'Payment',    color: '#00b894' },
  bacnet_bms:  { name: 'BACnet BMS',             icon: '🏗️', cat: 'BMS',        color: '#6366f1' },
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active:     { bg: 'var(--success-bg)', color: 'var(--success)', label: 'Active' },
  configured: { bg: 'var(--warning-bg)', color: 'var(--warning)', label: 'Configured' },
  error:      { bg: 'var(--error-bg)',   color: 'var(--error)',   label: 'Error' },
  disabled:   { bg: 'var(--accent-subtle)', color: 'var(--text-muted)', label: 'Disabled' },
};

const CAT_ICONS: Record<string, any> = {
  ERP: Building2, Accounting: Cloud, 'E-Sign': FileSignature, Payment: CreditCard, BMS: Settings2,
};

export default function IntegrationsPage() {
  const { data: res, isLoading } = useGetIntegrationsQuery();
  const [createIntegration] = useCreateIntegrationMutation();
  const [updateIntegration] = useUpdateIntegrationMutation();
  const [deleteIntegration] = useDeleteIntegrationMutation();
  const [testIntegration] = useTestIntegrationMutation();
  const [triggerSync] = useTriggerSyncMutation();
  const confirmDialog = useConfirm();

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<any | null>(null);
  const [showEntityMap, setShowEntityMap] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ integrationType: 'xero', name: '', description: '', syncFrequency: 'daily' });
  const [editForm, setEditForm] = useState({ name: '', description: '', syncFrequency: 'daily', isActive: true });
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const integrations = res?.data || [];

  const handleCreate = async () => {
    if (!createForm.name) return;
    await createIntegration(createForm).unwrap();
    setShowCreate(false);
    setCreateForm({ integrationType: 'xero', name: '', description: '', syncFrequency: 'daily' });
  };

  const handleTest = async (id: string) => {
    const res = await testIntegration(id).unwrap();
    setTestResult({ id, ...res.data });
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleSync = async (id: string) => {
    await triggerSync({ id, data: { syncType: 'full_sync' } }).unwrap();
  };

  const openEdit = (intg: any) => {
    setEditForm({
      name: intg.name || '',
      description: intg.description || '',
      syncFrequency: intg.syncFrequency || 'daily',
      isActive: intg.status === 'active',
    });
    setShowEdit(intg);
  };

  const handleEdit = async () => {
    if (!showEdit || !editForm.name.trim()) return;
    await updateIntegration({ id: showEdit.id, data: editForm });
    setShowEdit(null);
  };

  return (
    <div className="page-content">
      <div className="intg-header">
        <div>
          <h1><Plug size={24} /> Integrations</h1>
          <p className="mall-page-subtitle">Connect external ERP, accounting, and payment systems</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Add Integration
        </button>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3].map(i => <div key={i} className="skeleton-card" style={{height:180}} />)}
        </div>
      ) : integrations.length === 0 ? (
        <div className="mall-empty-state">
          <Plug size={48} strokeWidth={1} />
          <h3>No Integrations</h3>
          <p>Connect your first external system to get started</p>
        </div>
      ) : (
        <div className="intg-grid">
          {integrations.map((intg: any) => {
            const meta = TYPE_META[intg.integrationType] || { name: intg.integrationType, icon: '🔌', cat: 'Other', color: '#6b7280' };
            const status = STATUS_STYLES[intg.status] || STATUS_STYLES.configured;
            return (
              <div key={intg.id} className="intg-card">
                <div className="intg-card-header">
                  <div className="intg-card-icon" style={{ background: `${meta.color}15`, color: meta.color }}>
                    <span style={{ fontSize: '1.5rem' }}>{meta.icon}</span>
                  </div>
                  <div className="intg-card-info">
                    <h3>{intg.name}</h3>
                    <span className="intg-card-type">{meta.cat} • {meta.name}</span>
                  </div>
                  <span className="intg-status-badge" style={{ background: status.bg, color: status.color }}>
                    {status.label}
                  </span>
                </div>

                <div className="intg-card-meta">
                  <div className="intg-meta-item">
                    <Clock size={13} />
                    <span>Sync: {intg.syncFrequency}</span>
                  </div>
                  <div className="intg-meta-item">
                    <Activity size={13} />
                    <span>{intg.totalSyncs} syncs</span>
                  </div>
                  {intg.lastSyncAt && (
                    <div className="intg-meta-item">
                      <RefreshCw size={13} />
                      <span>Last: {new Date(intg.lastSyncAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {testResult?.id === intg.id && (
                  <div className="intg-test-result" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                    <CheckCircle2 size={14} /> Connected — {testResult.responseTimeMs}ms
                  </div>
                )}

                <div className="intg-card-actions">
                  <button className="intg-action-btn" onClick={() => handleTest(intg.id)} title="Test Connection">
                    <Zap size={14} /> Test
                  </button>
                  <button className="intg-action-btn" onClick={() => handleSync(intg.id)} title="Trigger Sync">
                    <RefreshCw size={14} /> Sync
                  </button>
                  <button className="intg-action-btn" onClick={() => setShowLogs(intg.id)} title="View Logs">
                    <Activity size={14} /> Logs
                  </button>
                  <button className="intg-action-btn" onClick={() => openEdit(intg)} title="Edit Integration">
                    <Edit size={14} />
                  </button>
                  <button className="intg-action-btn" onClick={() => setShowEntityMap(intg.id)} title="Entity Map">
                    <Map size={14} />
                  </button>
                  <button className="intg-action-btn danger" onClick={async () => { if (await confirmDialog('Delete this integration?', { danger: true })) deleteIntegration(intg.id); }} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && createPortal(
        <div className="mall-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Add Integration</h3>
              <button className="mall-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Integration Type</span>
                  <select value={createForm.integrationType} onChange={e => setCreateForm({ ...createForm, integrationType: e.target.value })}>
                    {Object.entries(TYPE_META).map(([key, val]) => (
                      <option key={key} value={key}>{val.icon} {val.name} ({val.cat})</option>
                    ))}
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Display Name *</span>
                  <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Xero — Acme Holdings" />
                </label>
                <label>
                  <span>Sync Frequency</span>
                  <select value={createForm.syncFrequency} onChange={e => setCreateForm({ ...createForm, syncFrequency: e.target.value })}>
                    <option value="realtime">Realtime</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                  </select>
                </label>
                <label>
                  <span>Description</span>
                  <input value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Optional notes" />
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!createForm.name}>
                <Plus size={14} /> Create
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Sync Logs Drawer */}
      {showLogs && createPortal(
        <div className="shop-detail-overlay" onClick={() => setShowLogs(null)}>
          <div className="shop-detail-drawer" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
            <SyncLogsDrawer integrationId={showLogs} onClose={() => setShowLogs(null)} />
          </div>
        </div>
      , document.body)}

      {/* Edit Integration Modal */}
      {showEdit && createPortal(
        <div className="mall-modal-overlay" onClick={() => setShowEdit(null)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit size={18} /> Edit Integration: {showEdit.name}
              </h3>
              <button className="mall-modal-close" onClick={() => setShowEdit(null)}>✕</button>
            </div>
            <div className="mall-modal-body">
              {/* Type info banner */}
              {(() => { const meta = TYPE_META[showEdit.integrationType] || { name: showEdit.integrationType, icon: '🔌', cat: 'Other', color: '#6b7280' }; return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                  padding: '10px 14px', borderRadius: 10,
                  background: `${meta.color}08`, border: `1px solid ${meta.color}20`,
                  fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  <span style={{ fontSize: 20 }}>{meta.icon}</span>
                  <span>{meta.cat} • <strong style={{ color: 'var(--text-primary)' }}>{meta.name}</strong></span>
                </div>
              ); })()}
              <div className="mall-form-grid">
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Display Name *</span>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </label>
                <label>
                  <span>Sync Frequency</span>
                  <select value={editForm.syncFrequency} onChange={e => setEditForm(f => ({ ...f, syncFrequency: e.target.value }))}>
                    <option value="realtime">Realtime</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.isActive}
                    onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  Active
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Description</span>
                  <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowEdit(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={!editForm.name.trim()}
                style={{ opacity: !editForm.name.trim() ? 0.5 : 1 }}>
                <Edit size={14} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Entity Map Drawer */}
      {showEntityMap && createPortal(
        <div className="shop-detail-overlay" onClick={() => setShowEntityMap(null)}>
          <div className="shop-detail-drawer" onClick={e => e.stopPropagation()} style={{ width: 620 }}>
            <EntityMapDrawer integrationId={showEntityMap} onClose={() => setShowEntityMap(null)} />
          </div>
        </div>
      , document.body)}
    </div>
  );
}

function SyncLogsDrawer({ integrationId, onClose }: { integrationId: string; onClose: () => void }) {
  const { data: res } = useGetSyncLogsQuery({ integrationId });
  const logs = res?.data || [];

  return (
    <>
      <div className="shop-detail-drawer-header">
        <h2>Sync History</h2>
        <button className="mall-modal-close" onClick={onClose}>✕</button>
      </div>
      <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 ? (
          <div className="mall-empty-state" style={{ padding: '40px 0' }}>
            <Activity size={36} strokeWidth={1} />
            <h3 style={{ fontSize: '1rem' }}>No sync logs yet</h3>
          </div>
        ) : (
          <div className="intg-logs-list">
            {logs.map((log: any) => (
              <div key={log.id} className="intg-log-item">
                <div className="intg-log-header">
                  <span className={`intg-log-status ${log.status}`}>
                    {log.status === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    {log.status}
                  </span>
                  <span className="intg-log-type">{log.syncType.replace(/_/g, ' ')}</span>
                  <span className="intg-log-dir">{log.direction} →</span>
                </div>
                <div className="intg-log-stats">
                  <span>📊 {log.recordsProcessed} processed</span>
                  <span>✅ {log.recordsCreated} created</span>
                  {log.recordsFailed > 0 && <span style={{ color: 'var(--error)' }}>❌ {log.recordsFailed} failed</span>}
                  <span>⏱ {log.durationMs}ms</span>
                </div>
                <div className="intg-log-date">{new Date(log.startedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function EntityMapDrawer({ integrationId, onClose }: { integrationId: string; onClose: () => void }) {
  const [entityFilter, setEntityFilter] = useState('');
  const { data: res, isLoading } = useGetEntityMapQuery({ integrationId, entityType: entityFilter || undefined });
  const maps = res?.data || [];

  const ENTITY_TYPES = ['tenant', 'invoice', 'property', 'unit', 'payment', 'vendor', 'lease'];

  return (
    <>
      <div className="shop-detail-drawer-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={18} /> Entity Map
        </h2>
        <button className="mall-modal-close" onClick={onClose}>✕</button>
      </div>
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className={`condo-filter-chip ${!entityFilter ? 'active' : ''}`}
            onClick={() => setEntityFilter('')}
          >All</button>
          {ENTITY_TYPES.map(t => (
            <button key={t} className={`condo-filter-chip ${entityFilter === t ? 'active' : ''}`}
              onClick={() => setEntityFilter(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : maps.length === 0 ? (
          <div className="mall-empty-state" style={{ padding: '40px 0' }}>
            <Map size={36} strokeWidth={1} />
            <h3 style={{ fontSize: '1rem' }}>No entity mappings</h3>
            <p style={{ fontSize: '0.85rem' }}>Mappings are created when data is synced with the external system.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {maps.map((m: any) => (
              <div key={m.id} style={{
                padding: '12px 14px', borderRadius: 10,
                border: '1px solid var(--border-color)', background: 'var(--card-bg)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: 'rgba(99,102,241,0.1)', color: '#6366f1', textTransform: 'uppercase',
                  }}>{m.entityType}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {m.syncedAt ? new Date(m.syncedAt).toLocaleString() : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Local ID</div>
                    <code style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }}>
                      {m.localEntityId?.slice(-12)}
                    </code>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 16 }}>↔</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>External ID</div>
                    <code style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }}>
                      {m.externalEntityId}
                    </code>
                  </div>
                </div>
                {m.syncStatus && (
                  <div style={{ marginTop: 6, fontSize: 11, color: m.syncStatus === 'synced' ? 'var(--success)' : 'var(--warning)' }}>
                    {m.syncStatus === 'synced' ? '✅' : '⚠️'} {m.syncStatus}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
