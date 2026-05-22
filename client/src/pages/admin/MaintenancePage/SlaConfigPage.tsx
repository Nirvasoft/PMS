import { useState } from 'react';
import {
  useGetSlaConfigsQuery, useCreateSlaConfigMutation, useGetCategoriesQuery,
} from '../../../store/api/maintenanceApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Shield, Plus, Loader2, XCircle, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
const PRIORITY_COLORS: Record<string, string> = {
  P1: '#ef4444', P2: '#f97316', P3: '#3b82f6', P4: '#94a3b8',
};

export default function SlaConfigPage() {
  const { data: configsData, isLoading } = useGetSlaConfigsQuery();
  const { data: categoriesData } = useGetCategoriesQuery();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const configs = configsData?.data || [];
  const categories = categoriesData?.data || [];

  // Group by priority
  const grouped = PRIORITIES.map((p) => ({
    priority: p,
    color: PRIORITY_COLORS[p],
    configs: configs.filter((c) => c.priority === p),
  }));

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Shield size={22} />
          </div>
          <div>
            <h1>SLA Configuration</h1>
            <p>Define response and resolution targets by priority and category</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Add SLA Config
          </button>
        </div>
      </div>

      {/* Defaults Info */}
      <div className="sla-defaults-card">
        <h3><Clock size={16} /> Default SLA Deadlines</h3>
        <p className="sla-defaults-subtitle">These apply when no custom config is set. Create custom configs to override.</p>
        <div className="sla-defaults-grid">
          <div className="sla-default-item">
            <span className="sla-default-priority" style={{ color: '#ef4444' }}>P1</span>
            <span>Response: <strong className="sla-hours">2h</strong> · Resolution: <strong className="sla-hours">8h</strong></span>
          </div>
          <div className="sla-default-item">
            <span className="sla-default-priority" style={{ color: '#f97316' }}>P2</span>
            <span>Response: <strong className="sla-hours">4h</strong> · Resolution: <strong className="sla-hours">24h</strong></span>
          </div>
          <div className="sla-default-item">
            <span className="sla-default-priority" style={{ color: '#3b82f6' }}>P3</span>
            <span>Response: <strong className="sla-hours">8h</strong> · Resolution: <strong className="sla-hours">72h</strong></span>
          </div>
          <div className="sla-default-item">
            <span className="sla-default-priority" style={{ color: '#94a3b8' }}>P4</span>
            <span>Response: <strong className="sla-hours">24h</strong> · Resolution: <strong className="sla-hours">168h</strong></span>
          </div>
        </div>
      </div>

      {/* Config Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : configs.length === 0 ? (
        <div className="maint-empty">
          <div className="empty-icon"><Shield size={28} /></div>
          <p>No custom SLA configurations yet</p>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>System defaults are active for all priorities</p>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Create First Config
          </button>
        </div>
      ) : (
        <div className="maint-table-wrap">
          <table className="maint-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Category</th>
                <th>Property</th>
                <th>Response Time</th>
                <th>Resolution Time</th>
                <th>Working Hours Only</th>
                <th>Escalation Contact</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) =>
                group.configs.length === 0 ? null : group.configs.map((c, idx) => (
                  <tr key={c.id}>
                    {idx === 0 && (
                      <td rowSpan={group.configs.length}>
                        <span className={`maint-priority ${group.priority.toLowerCase()}`}>
                          {group.priority}
                        </span>
                      </td>
                    )}
                    <td><span className="cell-secondary">{c.category?.name || 'All Categories'}</span></td>
                    <td><span className="cell-secondary">{c.propertyId ? 'Specific' : 'All Properties'}</span></td>
                    <td><span className="sla-hours">{c.responseHours}h</span></td>
                    <td><span className="sla-hours">{c.resolutionHours}h</span></td>
                    <td><span className="cell-secondary">{c.workingHoursOnly ? '✓ Yes' : '—'}</span></td>
                    <td>
                      <span className="cell-secondary">
                        {c.escalationContact
                          ? (c.escalationContact.profile
                            ? `${c.escalationContact.profile.firstName} ${c.escalationContact.profile.lastName}`
                            : c.escalationContact.email)
                          : '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateSlaConfigModal
          categories={categories}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function CreateSlaConfigModal({ categories, onClose }: { categories: any[]; onClose: () => void }) {
  const [createConfig, { isLoading }] = useCreateSlaConfigMutation();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const properties = propertiesData?.data || [];

  const [form, setForm] = useState({
    propertyId: '', categoryId: '', priority: 'P3',
    responseHours: '8', resolutionHours: '72',
    workingHoursOnly: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createConfig({
        propertyId: form.propertyId || undefined,
        categoryId: form.categoryId || undefined,
        priority: form.priority,
        responseHours: parseInt(form.responseHours),
        resolutionHours: parseInt(form.resolutionHours),
        workingHoursOnly: form.workingHoursOnly,
      }).unwrap();
      toast.success('SLA config created');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to create');
    }
  };

  return (
    <div className="maint-modal-backdrop" onClick={onClose}>
      <div className="maint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><Shield size={18} /></span>
            Create SLA Configuration
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Priority <span style={{ color: '#f87171' }}>*</span></label>
              <div className="priority-selector">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button"
                    className={`priority-option ${p.toLowerCase()} ${form.priority === p ? 'active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, priority: p }))}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Property (optional)</label>
              <select value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}>
                <option value="">All Properties</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="maint-field">
              <label>Category (optional)</label>
              <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">All Categories</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Response Time (hours) <span style={{ color: '#f87171' }}>*</span></label>
              <input type="number" required min="1" value={form.responseHours} onChange={(e) => setForm((f) => ({ ...f, responseHours: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Resolution Time (hours) <span style={{ color: '#f87171' }}>*</span></label>
              <input type="number" required min="1" value={form.resolutionHours} onChange={(e) => setForm((f) => ({ ...f, resolutionHours: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.workingHoursOnly} onChange={(e) => setForm((f) => ({ ...f, workingHoursOnly: e.target.checked }))} />
              Count only working hours (Mon-Fri 9am-6pm)
            </label>
          </div>
          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : 'Create Config'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
