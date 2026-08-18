import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetWebhooksQuery, useGetWebhookEventsQuery,
  useCreateWebhookMutation, useUpdateWebhookMutation, useDeleteWebhookMutation,
  useTestWebhookMutation, useGetDeliveriesQuery, useRetryDeliveryMutation,
} from '../../store/api/integrationsApi';
import {
  Webhook, Plus, X, Trash2, Send, Copy, Eye, ExternalLink,
  CheckCircle2, AlertCircle, Clock, RefreshCw, XCircle, Edit,
} from 'lucide-react';
import { useConfirm } from '../../components/DialogProvider';

const DELIVERY_STATUS: Record<string, { color: string; icon: any }> = {
  delivered: { color: 'var(--success)', icon: CheckCircle2 },
  pending:   { color: 'var(--warning)', icon: Clock },
  failed:    { color: 'var(--error)',   icon: XCircle },
  abandoned: { color: 'var(--text-muted)', icon: AlertCircle },
};

export default function WebhooksPage() {
  const { data: res, isLoading } = useGetWebhooksQuery();
  const { data: eventsRes } = useGetWebhookEventsQuery();
  const [createWebhook] = useCreateWebhookMutation();
  const [updateWebhook] = useUpdateWebhookMutation();
  const [deleteWebhook] = useDeleteWebhookMutation();
  const [testWebhook] = useTestWebhookMutation();
  const confirmDialog = useConfirm();

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<any | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showDeliveries, setShowDeliveries] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ url: '', description: '', events: [] as string[] });
  const [editForm, setEditForm] = useState({ url: '', description: '', events: [] as string[], isActive: true });

  const webhooks = res?.data || [];
  const allEvents = eventsRes?.data || {};

  const toggleEvent = (evt: string) => {
    setCreateForm(f => ({
      ...f,
      events: f.events.includes(evt) ? f.events.filter(e => e !== evt) : [...f.events, evt],
    }));
  };

  const handleCreate = async () => {
    if (!createForm.url || createForm.events.length === 0) return;
    const result = await createWebhook(createForm).unwrap();
    setNewSecret(result.data.secret);
    setShowCreate(false);
    setCreateForm({ url: '', description: '', events: [] });
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  const toggleEditEvent = (evt: string) => {
    setEditForm(f => ({
      ...f,
      events: f.events.includes(evt) ? f.events.filter(e => e !== evt) : [...f.events, evt],
    }));
  };

  const openEdit = (wh: any) => {
    setEditForm({
      url: wh.url || '',
      description: wh.description || '',
      events: wh.events || [],
      isActive: wh.isActive ?? true,
    });
    setShowEdit(wh);
  };

  const handleEdit = async () => {
    if (!showEdit || !editForm.url.trim() || editForm.events.length === 0) return;
    await updateWebhook({ id: showEdit.id, data: editForm });
    setShowEdit(null);
  };

  return (
    <div className="page-content">
      <div className="intg-header">
        <div>
          <h1><Webhook size={24} /> Webhooks</h1>
          <p className="mall-page-subtitle">Configure outbound webhook endpoints for event notifications</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Add Webhook
        </button>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3].map(i => <div key={i} className="skeleton-card" style={{height:120}} />)}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="mall-empty-state">
          <Webhook size={48} strokeWidth={1} />
          <h3>No Webhooks</h3>
          <p>Add a webhook endpoint to receive event notifications</p>
        </div>
      ) : (
        <div className="intg-table-wrap">
          <table className="intg-table">
            <thead>
              <tr>
                <th>Endpoint URL</th>
                <th>Events</th>
                <th>Status</th>
                <th>Deliveries</th>
                <th>Last Success</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((wh: any) => (
                <tr key={wh.id}>
                  <td>
                    <div className="intg-url-cell">
                      <ExternalLink size={13} />
                      <span className="intg-url-text">{wh.url}</span>
                    </div>
                    {wh.description && <div className="intg-url-desc">{wh.description}</div>}
                  </td>
                  <td>
                    <div className="intg-events-wrap">
                      {wh.events.slice(0, 3).map((e: string) => (
                        <span key={e} className="intg-event-badge">{e}</span>
                      ))}
                      {wh.events.length > 3 && <span className="intg-event-badge more">+{wh.events.length - 3}</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`intg-wh-status ${wh.isActive ? 'active' : 'inactive'}`}>
                      {wh.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td>{wh._count?.deliveries || 0}</td>
                  <td className="intg-date-cell">{wh.lastSuccessAt ? new Date(wh.lastSuccessAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="intg-row-actions">
                      <button className="intg-action-btn-sm" onClick={() => testWebhook(wh.id)} title="Send Test">
                        <Send size={13} />
                      </button>
                      <button className="intg-action-btn-sm" onClick={() => openEdit(wh)} title="Edit">
                        <Edit size={13} />
                      </button>
                      <button className="intg-action-btn-sm" onClick={() => setShowDeliveries(wh.id)} title="View Deliveries">
                        <Eye size={13} />
                      </button>
                      <button className="intg-action-btn-sm danger" onClick={async () => { if (await confirmDialog('Delete webhook?', { danger: true })) deleteWebhook(wh.id); }} title="Delete">
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
          <div className="mall-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Add Webhook Endpoint</h3>
              <button className="mall-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Endpoint URL *</span>
                  <input value={createForm.url} onChange={e => setCreateForm({ ...createForm, url: e.target.value })} placeholder="https://yourapp.com/webhooks/pms" />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Description</span>
                  <input value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} placeholder="My integration endpoint" />
                </label>
              </div>
              <div className="intg-events-section">
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '16px 0 10px', color: 'var(--text-primary)' }}>
                  Subscribe to Events ({createForm.events.length} selected)
                </h4>
                <div className="intg-events-grid">
                  {Object.entries(allEvents).map(([key, desc]) => (
                    <label key={key} className="intg-event-check">
                      <input type="checkbox" checked={createForm.events.includes(key)} onChange={() => toggleEvent(key)} />
                      <div>
                        <span className="intg-event-key">{key}</span>
                        <span className="intg-event-desc">{desc as string}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!createForm.url || createForm.events.length === 0}>
                <Plus size={14} /> Create Webhook
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Secret Reveal Modal */}
      {newSecret && createPortal(
        <div className="mall-modal-overlay" onClick={() => setNewSecret(null)}>
          <div className="mall-modal mall-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Webhook Secret</h3>
              <button className="mall-modal-close" onClick={() => setNewSecret(null)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="intg-secret-reveal">
                <p style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 12 }}>
                  ⚠️ This secret will only be shown once. Store it securely.
                </p>
                <div className="intg-secret-box">
                  <code>{newSecret}</code>
                  <button onClick={() => copyToClipboard(newSecret)} className="intg-copy-btn"><Copy size={14} /> Copy</button>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12 }}>
                  Use this secret to verify webhook signatures via the <code>X-PMS-Signature</code> header.
                </p>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-primary" onClick={() => setNewSecret(null)}>Done</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Deliveries Drawer */}
      {showDeliveries && createPortal(
        <div className="shop-detail-overlay" onClick={() => setShowDeliveries(null)}>
          <div className="shop-detail-drawer" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
            <DeliveriesDrawer endpointId={showDeliveries} onClose={() => setShowDeliveries(null)} />
          </div>
        </div>
      , document.body)}

      {/* Edit Webhook Modal */}
      {showEdit && createPortal(
        <div className="mall-modal-overlay" onClick={() => setShowEdit(null)}>
          <div className="mall-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit size={18} /> Edit Webhook
              </h3>
              <button className="mall-modal-close" onClick={() => setShowEdit(null)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Endpoint URL *</span>
                  <input value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} />
                </label>
                <label>
                  <span>Description</span>
                  <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.isActive}
                    onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  Active
                </label>
              </div>
              <div className="intg-events-section">
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '16px 0 10px', color: 'var(--text-primary)' }}>
                  Subscribed Events ({editForm.events.length} selected)
                </h4>
                <div className="intg-events-grid">
                  {Object.entries(allEvents).map(([key, desc]) => (
                    <label key={key} className="intg-event-check">
                      <input type="checkbox" checked={editForm.events.includes(key)} onChange={() => toggleEditEvent(key)} />
                      <div>
                        <span className="intg-event-key">{key}</span>
                        <span className="intg-event-desc">{desc as string}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowEdit(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit}
                disabled={!editForm.url.trim() || editForm.events.length === 0}
                style={{ opacity: (!editForm.url.trim() || editForm.events.length === 0) ? 0.5 : 1 }}>
                <Edit size={14} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

function DeliveriesDrawer({ endpointId, onClose }: { endpointId: string; onClose: () => void }) {
  const { data: res } = useGetDeliveriesQuery({ endpointId });
  const [retryDelivery] = useRetryDeliveryMutation();
  const deliveries = res?.data || [];

  return (
    <>
      <div className="shop-detail-drawer-header">
        <h2>Delivery Log</h2>
        <button className="mall-modal-close" onClick={onClose}>✕</button>
      </div>
      <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
        {deliveries.length === 0 ? (
          <div className="mall-empty-state" style={{ padding: '40px 0' }}>
            <Send size={36} strokeWidth={1} />
            <h3 style={{ fontSize: '1rem' }}>No deliveries yet</h3>
          </div>
        ) : (
          <div className="intg-logs-list">
            {deliveries.map((d: any) => {
              const st = DELIVERY_STATUS[d.status] || DELIVERY_STATUS.pending;
              const Icon = st.icon;
              return (
                <div key={d.id} className="intg-log-item">
                  <div className="intg-log-header">
                    <span style={{ color: st.color, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: '0.8rem' }}>
                      <Icon size={13} /> {d.status}
                    </span>
                    <span className="intg-log-type">{d.eventType}</span>
                    {d.httpStatus && <span className="intg-log-dir">HTTP {d.httpStatus}</span>}
                  </div>
                  <div className="intg-log-stats">
                    <span>Attempt {d.attemptCount}</span>
                    {d.status === 'failed' && (
                      <button className="intg-action-btn-sm" onClick={() => retryDelivery(d.id)} style={{ marginLeft: 'auto' }}>
                        <RefreshCw size={12} /> Retry
                      </button>
                    )}
                  </div>
                  <div className="intg-log-date">{new Date(d.createdAt).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
