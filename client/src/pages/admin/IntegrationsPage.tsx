import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetIntegrationsQuery, useGetIntegrationTypesQuery,
  useCreateIntegrationMutation, useDeleteIntegrationMutation,
  useTestIntegrationMutation, useTriggerSyncMutation, useGetSyncLogsQuery,
} from '../../store/api/integrationsApi';
import {
  Plug, Plus, X, RefreshCw, Zap, Trash2, Activity,
  CheckCircle2, AlertCircle, Clock, Settings2, ChevronRight,
  Cloud, CreditCard, FileSignature, Building2,
} from 'lucide-react';

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
  const [deleteIntegration] = useDeleteIntegrationMutation();
  const [testIntegration] = useTestIntegrationMutation();
  const [triggerSync] = useTriggerSyncMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ integrationType: 'xero', name: '', description: '', syncFrequency: 'daily' });
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
                  <button className="intg-action-btn danger" onClick={() => { if(confirm('Delete this integration?')) deleteIntegration(intg.id); }} title="Delete">
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
