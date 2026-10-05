import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  useGetIntegrationsQuery,
  useCreateIntegrationMutation, useUpdateIntegrationMutation, useDeleteIntegrationMutation,
  useTestIntegrationMutation, useTriggerSyncMutation, useGetSyncLogsQuery,
  useGetEntityMapQuery, useDeleteEntityMapMutation,
} from '../../store/api/integrationsApi';
import {
  Plug, Plus, X, RefreshCw, Zap, Trash2, Activity,
  CheckCircle2, AlertCircle, Clock, Settings2, ChevronDown, ChevronUp,
  Cloud, CreditCard, FileSignature, Building2, Edit, Map, Database,
  Loader2, Search,
} from 'lucide-react';
import { useConfirm } from '../../components/DialogProvider';
import { PermissionGuard } from '../../components/guards/PermissionGuard';

const TYPE_META: Record<string, { name: string; icon: string; cat: string; color: string; image?: string }> = {
  v6erp:       { name: 'V6 ERP',                 icon: '🔗', image: '/v6erp-logo.png', cat: 'ERP', color: '#2b579a' },
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
  const [createIntegration, { isLoading: isCreating }] = useCreateIntegrationMutation();
  const [updateIntegration, { isLoading: isUpdating }] = useUpdateIntegrationMutation();
  const [deleteIntegration] = useDeleteIntegrationMutation();
  const [testIntegration] = useTestIntegrationMutation();
  const [triggerSync] = useTriggerSyncMutation();
  const confirmDialog = useConfirm();

  const [showCreate, setShowCreate] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [showEdit, setShowEdit] = useState<any | null>(null);
  const [showEntityMap, setShowEntityMap] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ integrationType: 'v6erp', name: '', description: '', syncFrequency: 'daily' });
  const [editForm, setEditForm] = useState({
    name: '', description: '', syncFrequency: 'daily', isActive: true,
    configJson: '', credentialsJson: '',
  });

  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const integrations = res?.data || [];

  const handleCreate = async () => {
    const trimmedName = createForm.name.trim();
    if (!trimmedName) {
      toast.error('Display Name is required');
      return;
    }
    try {
      await createIntegration({ ...createForm, name: trimmedName }).unwrap();
      toast.success('Integration created successfully');
      setShowCreate(false);
      setTypeDropdownOpen(false);
      setCreateForm({ integrationType: 'v6erp', name: '', description: '', syncFrequency: 'daily' });
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Failed to create integration');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await testIntegration(id).unwrap();
      setTestResult({ id, status: 'success', ...res.data });
      toast.success(res?.data?.connected ? 'Connection successful!' : 'Connected');
      setTimeout(() => setTestResult((prev: any) => (prev?.id === id ? null : prev)), 8000);
    } catch (err: any) {
      const errMsg = err?.data?.message || err?.message || 'Connection test failed';
      setTestResult({ id, status: 'error', error: errMsg });
      toast.error(errMsg);
      setTimeout(() => setTestResult((prev: any) => (prev?.id === id ? null : prev)), 8000);
    } finally {
      setTestingId(null);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const res = await triggerSync({ id, data: { syncType: 'full_sync' } }).unwrap();
      toast.success(res?.message || res?.data?.message || 'Sync completed successfully');
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirmDialog('Are you sure you want to delete this integration?', { danger: true })) {
      try {
        await deleteIntegration(id).unwrap();
        toast.success('Integration deleted');
      } catch (err: any) {
        toast.error(err?.data?.message || err?.message || 'Failed to delete integration');
      }
    }
  };

  const openEdit = (intg: any) => {
    setEditForm({
      name:            intg.name          || '',
      description:     intg.description   || '',
      syncFrequency:   intg.syncFrequency || 'daily',
      isActive:        intg.isActive !== undefined ? Boolean(intg.isActive) : (intg.status === 'active'),
      // Pre-populate config as formatted JSON string for the textarea
      configJson:      intg.config && Object.keys(intg.config).length > 0 ? JSON.stringify(intg.config, null, 2) : '',
      credentialsJson: '',
    });
    setShowEdit(intg);
  };

  const handleEdit = async () => {
    if (!showEdit) return;
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      toast.error('Display Name is required');
      return;
    }

    // Parse JSON fields — show toast error if malformed
    let config: any = {};
    let credentials: any = undefined;
    if (editForm.configJson.trim()) {
      try {
        config = JSON.parse(editForm.configJson);
      } catch {
        toast.error('Configuration JSON is invalid. Please check the format.');
        return;
      }
    }
    if (editForm.credentialsJson.trim()) {
      try {
        credentials = JSON.parse(editForm.credentialsJson);
      } catch {
        toast.error('Credentials JSON is invalid. Please check the format.');
        return;
      }
    }

    try {
      const payload: any = {
        name:          trimmedName,
        description:   editForm.description.trim(),
        syncFrequency: editForm.syncFrequency,
        isActive:      editForm.isActive,
        status:        editForm.isActive ? 'active' : 'disabled',
        config,
      };
      if (credentials !== undefined) {
        payload.credentials = credentials;
      }

      await updateIntegration({
        id: showEdit.id,
        data: payload,
      }).unwrap();

      toast.success('Integration updated successfully');
      setShowEdit(null);
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || 'Failed to update integration');
    }
  };

  return (
    <div className="page-content">
      <div className="intg-header">
        <div>
          <h1><Plug size={24} /> Integrations</h1>
          <p className="mall-page-subtitle">Connect external ERP, accounting, and payment systems</p>
        </div>
        <PermissionGuard permission="developer-integrations.write">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Add Integration
          </button>
        </PermissionGuard>
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
                  <div className="intg-card-icon" style={{ background: `${meta.color}15`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {meta.image ? (
                      <img src={meta.image} alt={meta.name} style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '1.5rem' }}>{meta.icon}</span>
                    )}
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
                  <div
                    className="intg-test-result"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      marginBottom: 12,
                      background: testResult.status === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: `1px solid ${testResult.status === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      color: testResult.status === 'success' ? '#16a34a' : '#dc2626',
                    }}
                  >
                    {testResult.status === 'success' ? (
                      <>
                        <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                        <span><strong>Connected</strong> ({testResult.responseTimeMs}ms) — {testResult.version || 'API Healthy'}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={15} style={{ flexShrink: 0 }} />
                        <span style={{ wordBreak: 'break-word' }}><strong>Connection Failed:</strong> {testResult.error}</span>
                      </>
                    )}
                  </div>
                )}

                <div className="intg-card-actions">
                  <button
                    className="intg-action-btn"
                    onClick={() => handleTest(intg.id)}
                    title="Test Connection"
                    disabled={testingId === intg.id || syncingId === intg.id}
                  >
                    {testingId === intg.id ? (
                      <><Loader2 size={14} className="spin" /> Testing...</>
                    ) : (
                      <><Zap size={14} /> Test</>
                    )}
                  </button>
                  <PermissionGuard permission="developer-integrations.write">
                    <button
                      className="intg-action-btn"
                      onClick={() => handleSync(intg.id)}
                      title="Trigger Sync"
                      disabled={syncingId === intg.id || testingId === intg.id}
                    >
                      {syncingId === intg.id ? (
                        <><Loader2 size={14} className="spin" /> Syncing...</>
                      ) : (
                        <><RefreshCw size={14} /> Sync</>
                      )}
                    </button>
                  </PermissionGuard>
                  <button className="intg-action-btn" onClick={() => setShowLogs(intg.id)} title="View Logs">
                    <Activity size={14} /> Logs
                  </button>
                  <PermissionGuard permission="developer-integrations.write">
                    <button className="intg-action-btn" onClick={() => openEdit(intg)} title="Edit Integration">
                      <Edit size={14} />
                    </button>
                    <button className="intg-action-btn" onClick={() => setShowEntityMap(intg.id)} title="Entity Map">
                      <Map size={14} />
                    </button>
                    <button className="intg-action-btn danger" onClick={() => handleDelete(intg.id)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </PermissionGuard>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && createPortal(
        <div className="mall-modal-overlay">
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Add Integration</h3>
              <button className="mall-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label style={{ gridColumn: '1 / -1', position: 'relative' }}>
                  <span>Integration Type</span>
                  <div
                    onClick={() => setTypeDropdownOpen(prev => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 14px',
                      background: 'var(--bg-input, rgba(255,255,255,0.04))',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      userSelect: 'none',
                    }}
                  >
                    {(() => {
                      const sel = TYPE_META[createForm.integrationType] || { name: createForm.integrationType, icon: '🔌', cat: 'Other' };
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {sel.image ? (
                            <img src={sel.image} alt={sel.name} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: 18, lineHeight: 1 }}>{sel.icon}</span>
                          )}
                          <span style={{ fontWeight: 600 }}>{sel.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4 }}>
                            {sel.cat}
                          </span>
                        </div>
                      );
                    })()}
                    <ChevronDown size={16} style={{ color: 'var(--text-secondary, #94a3b8)', transform: typeDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>

                  {typeDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        background: 'var(--bg-surface, #1e293b)',
                        border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                        borderRadius: 8,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                        zIndex: 9999,
                        maxHeight: 260,
                        overflowY: 'auto',
                        padding: 6,
                      }}
                    >
                      {Object.entries(TYPE_META).map(([key, val]) => {
                        const isSelected = createForm.integrationType === key;
                        return (
                          <div
                            key={key}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreateForm(prev => ({
                                ...prev,
                                integrationType: key,
                                name: prev.name && Object.values(TYPE_META).some(m => prev.name === m.name) ? val.name : (prev.name || val.name),
                              }));
                              setTypeDropdownOpen(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              background: isSelected ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {val.image ? (
                                <img src={val.image} alt={val.name} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />
                              ) : (
                                <span style={{ fontSize: 18, lineHeight: 1 }}>{val.icon}</span>
                              )}
                              <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>{val.name}</span>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary, #94a3b8)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4 }}>
                              {val.cat}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
          <div className="shop-detail-drawer" onClick={e => e.stopPropagation()} style={{ width: 560, padding: 0, display: 'flex', flexDirection: 'column' }}>
            <SyncLogsDrawer
              integration={integrations.find((i: any) => i.id === showLogs)}
              integrationId={showLogs}
              onClose={() => setShowLogs(null)}
            />
          </div>
        </div>
      , document.body)}

      {/* Edit Integration Modal */}
      {showEdit && createPortal(
        <div className="mall-modal-overlay" onClick={() => !isUpdating && setShowEdit(null)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit size={18} /> Edit Integration: {showEdit.name}
              </h3>
              <button className="mall-modal-close" onClick={() => !isUpdating && setShowEdit(null)}>✕</button>
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
                  {meta.image ? (
                    <img src={meta.image} alt={meta.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                  )}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Status Flag</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editForm.isActive}
                      onClick={() => setEditForm(f => ({ ...f, isActive: !f.isActive }))}
                      style={{
                        width: 46,
                        height: 26,
                        borderRadius: 13,
                        padding: 2,
                        background: editForm.isActive ? '#10b981' : 'rgba(156, 163, 175, 0.4)',
                        border: `1px solid ${editForm.isActive ? '#059669' : 'rgba(156, 163, 175, 0.6)'}`,
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        outline: 'none',
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#ffffff',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                          transform: editForm.isActive ? 'translateX(20px)' : 'translateX(0px)',
                          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                    </button>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: editForm.isActive ? '#10b981' : 'var(--text-muted)',
                      background: editForm.isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                      padding: '3px 10px',
                      borderRadius: 12,
                      border: `1px solid ${editForm.isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.2)'}`
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: editForm.isActive ? '#10b981' : '#9ca3af',
                        boxShadow: editForm.isActive ? '0 0 6px #10b981' : 'none'
                      }} />
                      {editForm.isActive ? 'Active (Flag ON)' : 'Disabled (Flag OFF)'}
                    </span>
                  </div>
                </div>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Description</span>
                  <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                </label>

                {/* ── Config & Credentials ── */}
                <label style={{ gridColumn: '1 / -1' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    ⚙️ Configuration <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>(JSON)</span>
                  </span>
                  <textarea
                    rows={6}
                    value={editForm.configJson}
                    onChange={e => setEditForm(f => ({ ...f, configJson: e.target.value }))}
                    placeholder={'{\n  "baseUrl": "http://localhost:8080",\n  "domain": "demo"\n}'}
                    style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    🔑 API Credentials
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>(JSON)</span>
                    {showEdit?.hasCredentials && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: 'rgba(16,185,129,0.12)', color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.3)',
                      }}>
                        ✅ Credentials saved
                      </span>
                    )}
                  </span>
                  <textarea
                    rows={4}
                    value={editForm.credentialsJson}
                    onChange={e => setEditForm(f => ({ ...f, credentialsJson: e.target.value }))}
                    placeholder={showEdit?.hasCredentials
                      ? '🔒 Leave empty to keep existing credentials unchanged.\n   Type new JSON to replace them.'
                      : '{\n  "username": "admin",\n  "password": "yourpassword"\n}'}
                    style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                    {showEdit?.hasCredentials
                      ? '🔒 Credentials are stored securely. Leave blank to keep unchanged, or type new JSON to replace.'
                      : '💡 Leave empty if no authentication is required.'}
                  </span>
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowEdit(null)} disabled={isUpdating}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleEdit}
                disabled={isUpdating || !editForm.name.trim()}
                style={{ opacity: (isUpdating || !editForm.name.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isUpdating ? <RefreshCw size={14} className="spin" /> : <Edit size={14} />}
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Entity Map Drawer */}
      {showEntityMap && createPortal(
        <div className="shop-detail-overlay" onClick={() => setShowEntityMap(null)}>
          <div className="shop-detail-drawer" onClick={e => e.stopPropagation()} style={{ width: 620, padding: 0, display: 'flex', flexDirection: 'column' }}>
            <EntityMapDrawer
              integration={integrations.find((i: any) => i.id === showEntityMap)}
              integrationId={showEntityMap}
              onClose={() => setShowEntityMap(null)}
            />
          </div>
        </div>
      , document.body)}
    </div>
  );
}

function SyncLogsDrawer({ integrationId, integration, onClose }: { integrationId: string; integration?: any; onClose: () => void }) {
  const { data: res, isFetching, refetch } = useGetSyncLogsQuery({ integrationId });
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const logs = res?.data || [];

  const meta = TYPE_META[integration?.integrationType] || { name: integration?.name || 'Integration', icon: '🔌', color: '#6b7280' };

  const totalRuns = logs.length;
  const successRuns = logs.filter((l: any) => l.status === 'success').length;
  const failedRuns = logs.filter((l: any) => l.status === 'failed' || l.recordsFailed > 0).length;
  const totalProcessed = logs.reduce((acc: number, l: any) => acc + (Number(l.recordsProcessed) || 0), 0);

  return (
    <>
      <div className="shop-detail-drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {meta.image ? (
            <img src={meta.image} alt={meta.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 20 }}>{meta.icon}</span>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{integration?.name || 'Sync History'}</h2>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Execution audit logs & record counts</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => refetch()}
            title="Refresh sync history"
            disabled={isFetching}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', fontSize: 12 }}
          >
            <RefreshCw size={13} className={isFetching ? 'spin' : ''} />
            <span>{isFetching ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button className="mall-modal-close" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {logs.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          padding: '12px 20px', background: 'var(--bg-card-subtle, rgba(255,255,255,0.02))',
          borderBottom: '1px solid var(--border-color)', fontSize: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Runs</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{totalRuns}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Successful</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>{successRuns}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>With Issues</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: failedRuns > 0 ? '#ef4444' : 'var(--text-secondary)', marginTop: 2 }}>{failedRuns}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Records</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{totalProcessed}</div>
          </div>
        </div>
      )}

      <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 ? (
          <div className="mall-empty-state" style={{ padding: '40px 0', textAlign: 'center' }}>
            <Activity size={36} strokeWidth={1} style={{ opacity: 0.5, marginBottom: 8 }} />
            <h3 style={{ fontSize: '1rem', margin: '0 0 4px' }}>No sync logs yet</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              Trigger a manual sync or wait for scheduled background runs.
            </p>
          </div>
        ) : (
          <div className="intg-logs-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {logs.map((log: any) => {
              const hasErrors = log.recordsFailed > 0 || (Array.isArray(log.errorDetails) && log.errorDetails.length > 0);
              const isExpanded = expandedLogId === log.id;
              const errorsList = Array.isArray(log.errorDetails) ? log.errorDetails : [];

              return (
                <div
                  key={log.id}
                  className="intg-log-item"
                  style={{
                    padding: '14px', borderRadius: 10,
                    border: `1px solid ${hasErrors ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-color)'}`,
                    background: hasErrors ? 'rgba(239, 68, 68, 0.02)' : 'var(--card-bg)',
                  }}
                >
                  <div className="intg-log-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`intg-log-status ${log.status}`} style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}>
                        {log.status === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                        {log.status}
                      </span>
                      <span className="intg-log-type" style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                        {log.syncType?.replace(/_/g, ' ') || 'Sync'}
                      </span>
                    </div>
                    <span className="intg-log-dir" style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {log.direction} →
                    </span>
                  </div>

                  <div className="intg-log-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <span>📊 <strong>{log.recordsProcessed}</strong> processed</span>
                    <span>✅ <strong>{log.recordsCreated}</strong> created</span>
                    {log.recordsUpdated > 0 && <span>🔄 <strong>{log.recordsUpdated}</strong> updated</span>}
                    {log.recordsFailed > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ {log.recordsFailed} failed</span>}
                    <span>⏱ {log.durationMs}ms</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span>{new Date(log.startedAt || log.completedAt).toLocaleString()}</span>
                    {log.initiatedBy && <span>Trigger: {log.initiatedBy}</span>}
                  </div>

                  {/* Expandable error details */}
                  {hasErrors && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(239, 68, 68, 0.15)' }}>
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          background: 'none', border: 'none', color: '#ef4444',
                          fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600,
                        }}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>{isExpanded ? 'Hide Error Details' : `Inspect ${errorsList.length || log.recordsFailed} Error(s)`}</span>
                      </button>

                      {isExpanded && (
                        <div style={{
                          marginTop: 8, padding: 10, borderRadius: 6,
                          background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)',
                          fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                          {errorsList.length === 0 ? (
                            <div style={{ color: '#ef4444' }}>Execution reported {log.recordsFailed} failure(s).</div>
                          ) : (
                            errorsList.map((errItem: any, idx: number) => (
                              <div key={idx} style={{ padding: '4px 0', borderBottom: idx < errorsList.length - 1 ? '1px dashed rgba(239, 68, 68, 0.2)' : 'none' }}>
                                {errItem.invoiceNumber && (
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Invoice #{errItem.invoiceNumber} {errItem.customerCode ? `(Customer: ${errItem.customerCode})` : ''}
                                  </div>
                                )}
                                <div style={{ color: '#ef4444', marginTop: 2, wordBreak: 'break-word' }}>
                                  {errItem.error || JSON.stringify(errItem)}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function EntityMapDrawer({ integrationId, integration, onClose }: { integrationId: string; integration?: any; onClose: () => void }) {
  const [entityFilter, setEntityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { data: res, isLoading } = useGetEntityMapQuery({ integrationId, entityType: entityFilter || undefined });
  const [deleteEntityMap] = useDeleteEntityMapMutation();
  const confirmDialog = useConfirm();

  const maps = res?.data || [];
  const meta = TYPE_META[integration?.integrationType] || { name: integration?.name || 'External System', icon: '🔗' };
  const extSystemName = integration?.name || meta.name;

  const ENTITY_TYPES = ['tenant', 'invoice', 'property', 'unit', 'payment', 'vendor', 'lease'];

  const filteredMaps = maps.filter((m: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const pmsVal = (m.externalRef || m.pmsId || m.localEntityId || '').toLowerCase();
    const extVal = (m.externalId || m.externalEntityId || '').toLowerCase();
    const typeVal = (m.entityType || '').toLowerCase();
    return pmsVal.includes(q) || extVal.includes(q) || typeVal.includes(q);
  });

  const handleUnlink = async (mapId: string, itemDesc: string) => {
    if (await confirmDialog(
      `Unlink ${itemDesc}? The records in PMS and ${extSystemName} will remain intact, but the automatic synchronization bridge between them will be removed.`,
      { danger: true }
    )) {
      try {
        await deleteEntityMap(mapId).unwrap();
        toast.success('Mapping unlinked successfully');
      } catch (err: any) {
        toast.error(err?.data?.message || err?.message || 'Failed to unlink mapping');
      }
    }
  };

  return (
    <>
      <div className="shop-detail-drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {meta.image ? (
            <img src={meta.image} alt={meta.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 20 }}>{meta.icon}</span>
          )}
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
              <Database size={16} /> {extSystemName} Entity Map
            </h2>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Cross-system identity bridging (PMS ID ↔ {extSystemName} ID)
            </div>
          </div>
        </div>
        <button className="mall-modal-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Filter by PMS ID, ${extSystemName} ID, or reference...`}
            style={{
              width: '100%', padding: '7px 10px 7px 30px', fontSize: 12,
              borderRadius: 6, border: '1px solid var(--border-color)',
              background: 'var(--bg-input, rgba(255,255,255,0.04))', color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Entity type filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className={`condo-filter-chip ${!entityFilter ? 'active' : ''}`}
            onClick={() => setEntityFilter('')}
          >All ({maps.length})</button>
          {ENTITY_TYPES.map(t => {
            const count = maps.filter((m: any) => m.entityType === t).length;
            if (count === 0 && entityFilter !== t) return null;
            return (
              <button
                key={t}
                className={`condo-filter-chip ${entityFilter === t ? 'active' : ''}`}
                onClick={() => setEntityFilter(t)}
              >
                {t} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>Loading entity maps...</div>
        ) : filteredMaps.length === 0 ? (
          <div className="mall-empty-state" style={{ padding: '40px 0', textAlign: 'center' }}>
            <Map size={36} strokeWidth={1} style={{ opacity: 0.5, marginBottom: 8 }} />
            <h3 style={{ fontSize: '1rem', margin: '0 0 4px' }}>
              {searchQuery ? 'No matching mappings' : 'No entity mappings found'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              {searchQuery
                ? 'Try adjusting your search criteria.'
                : `Mappings are created when data is synchronized between PMS and ${extSystemName}.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredMaps.map((m: any) => (
              <div
                key={m.id}
                style={{
                  padding: '12px 14px', borderRadius: 10,
                  border: '1px solid var(--border-color)', background: 'var(--card-bg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: 'rgba(99,102,241,0.1)', color: '#6366f1', textTransform: 'uppercase',
                    }}>{m.entityType}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {m.syncedAt ? new Date(m.syncedAt).toLocaleString() : '—'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleUnlink(m.id, `${m.entityType} mapping (${m.externalId})`)}
                    title="Unlink mapping"
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-secondary)',
                      cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>PMS Record</div>
                    <code style={{
                      display: 'block', fontSize: 12, padding: '4px 8px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.04)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {m.externalRef || m.pmsId?.slice(-12) || m.localEntityId?.slice(-12) || '—'}
                    </code>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 16, flexShrink: 0 }}>↔</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{extSystemName} ID</div>
                    <code style={{
                      display: 'block', fontSize: 12, padding: '4px 8px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.04)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--primary, #3b82f6)',
                    }}>
                      {m.externalId || m.externalEntityId || '—'}
                    </code>
                  </div>
                </div>

                <div style={{ marginTop: 8, fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} />
                  <span>Bridged to {extSystemName}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
