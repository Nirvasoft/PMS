import { useState } from 'react';
import {
  useGetQuickActionsQuery, useCreateQuickActionMutation,
  useUpdateQuickActionMutation, useDeleteQuickActionMutation,
} from '../../../store/api/portalApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Zap, Plus, X, Trash2, ToggleLeft, ToggleRight,
  Loader2, ExternalLink, ArrowUpDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';

const ACTION_TYPES = [
  { value: 'page', label: 'Internal Page', desc: 'Navigate to a portal page (e.g. /portal/invoices)' },
  { value: 'link', label: 'External Link', desc: 'Open a URL in new tab' },
  { value: 'modal', label: 'Modal Dialog', desc: 'Show a dialog (custom implementation)' },
];

const ICON_OPTIONS = [
  '💳', '🔧', '📝', '📞', '🏠', '🚗', '📋', '🔑', '📦', '🎉',
  '⚡', '🛡️', '📊', '💰', '🔔', '👤', '📧', '🏢', '🗓️', '✉️',
];

export default function QuickActionsAdminPage() {
  const confirmDialog = useConfirm();
  const [propertyFilter, setPropertyFilter] = useState('');
  const { data: actions = [], isLoading } = useGetQuickActionsQuery(
    propertyFilter ? { propertyId: propertyFilter } : undefined,
  );
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];

  const [createAction, { isLoading: creating }] = useCreateQuickActionMutation();
  const [updateAction] = useUpdateQuickActionMutation();
  const [deleteAction] = useDeleteQuickActionMutation();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    propertyId: '', label: '', icon: '⚡', actionType: 'page', actionUrl: '', sortOrder: 0,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.propertyId) { toast.error('Select a property'); return; }
    if (!form.label.trim()) { toast.error('Label is required'); return; }
    try {
      await createAction({
        propertyId: form.propertyId,
        label: form.label,
        icon: form.icon || undefined,
        actionType: form.actionType,
        actionUrl: form.actionUrl || undefined,
        sortOrder: form.sortOrder,
      }).unwrap();
      toast.success('Quick action created');
      setShowForm(false);
      setForm({ propertyId: '', label: '', icon: '⚡', actionType: 'page', actionUrl: '', sortOrder: 0 });
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to create');
    }
  };

  const handleToggle = async (id: string, currentlyActive: boolean) => {
    try {
      await updateAction({ id, isActive: !currentlyActive }).unwrap();
      toast.success(currentlyActive ? 'Deactivated' : 'Activated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('Delete this quick action?', { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteAction(id).unwrap();
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Zap size={24} /> Portal Quick Actions</h1>
        <p className="text-muted">Manage dashboard shortcuts for portal users, customizable per property</p>
      </div>

      <div className="section-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="form-select"
          style={{ width: 220 }}
        >
          <option value="">All Properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setShowForm(true)} id="add-quick-action-btn">
          <Plus size={14} /> Add Quick Action
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20, borderLeft: '4px solid var(--primary, #6366f1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>New Quick Action</h3>
            <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Property *</label>
                <select
                  value={form.propertyId}
                  onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                  required
                >
                  <option value="">Select Property</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Label *</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Pay Invoice"
                  required
                />
              </div>
              <div className="form-group">
                <label>Icon</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {ICON_OPTIONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setForm({ ...form, icon: ic })}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: form.icon === ic ? '2px solid var(--primary, #6366f1)' : '1px solid var(--border-color, #ddd)',
                        background: form.icon === ic ? 'rgba(99,102,241,0.08)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Action Type *</label>
                <select
                  value={form.actionType}
                  onChange={(e) => setForm({ ...form, actionType: e.target.value })}
                >
                  {ACTION_TYPES.map((at) => (
                    <option key={at.value} value={at.value}>{at.label}</option>
                  ))}
                </select>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {ACTION_TYPES.find(a => a.value === form.actionType)?.desc}
                </span>
              </div>
              <div className="form-group">
                <label>Action URL</label>
                <input
                  value={form.actionUrl}
                  onChange={(e) => setForm({ ...form, actionUrl: e.target.value })}
                  placeholder={form.actionType === 'page' ? '/portal/invoices' : 'https://...'}
                />
              </div>
              <div className="form-group">
                <label>Sort Order</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                  min={0}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <><Loader2 size={14} className="spin" /> Creating...</> : <><Zap size={14} /> Create</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading quick actions...</div>
      ) : !actions.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Zap size={40} />
          <p>No quick actions configured</p>
          <p className="text-muted">Quick actions appear as shortcut buttons on the portal dashboard</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" id="quick-actions-table">
            <thead>
              <tr>
                <th>Icon</th>
                <th>Label</th>
                <th>Property</th>
                <th>Type</th>
                <th>URL</th>
                <th><ArrowUpDown size={14} /> Order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((qa) => (
                <tr key={qa.id} style={{ opacity: qa.isActive === false ? 0.5 : 1 }}>
                  <td style={{ fontSize: '1.3rem' }}>{qa.icon || '⚡'}</td>
                  <td style={{ fontWeight: 600 }}>{qa.label}</td>
                  <td>{qa.property?.name || '—'}</td>
                  <td>
                    <span className={`status-badge ${qa.actionType === 'page' ? 'status-active' : qa.actionType === 'link' ? 'status-pending' : 'status-closed'}`}>
                      {qa.actionType}
                    </span>
                  </td>
                  <td>
                    {qa.actionUrl ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                        {qa.actionUrl}
                        {qa.actionType === 'link' && <ExternalLink size={12} />}
                      </span>
                    ) : '—'}
                  </td>
                  <td>{qa.sortOrder}</td>
                  <td>
                    <span className={`status-badge ${qa.isActive !== false ? 'status-active' : 'status-cancelled'}`}>
                      {qa.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn-icon"
                        onClick={() => handleToggle(qa.id, qa.isActive !== false)}
                        title={qa.isActive !== false ? 'Deactivate' : 'Activate'}
                      >
                        {qa.isActive !== false ? <ToggleRight size={16} className="text-success" /> : <ToggleLeft size={16} />}
                      </button>
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => handleDelete(qa.id)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
