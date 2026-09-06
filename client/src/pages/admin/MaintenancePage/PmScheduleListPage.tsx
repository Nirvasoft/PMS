import '../MaintenancePage/MaintenancePage.css';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetPmSchedulesQuery, useCreatePmScheduleMutation,
  usePausePmScheduleMutation, useResumePmScheduleMutation,
  useGeneratePmWorkOrderMutation,
} from '../../../store/api/pmApi';
import { useGetCategoriesQuery } from '../../../store/api/maintenanceApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  CalendarClock, Plus, Search, Loader2, XCircle, Inbox,
  Play, Pause, Zap, RotateCcw, Clock, CheckCircle2,
  AlertTriangle, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const FREQUENCIES: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', semi_annual: 'Semi-Annual',
  annual: 'Annual', custom_days: 'Custom',
};

const PRIORITIES = [
  { value: 'P1', label: 'P1 — Emergency' },
  { value: 'P2', label: 'P2 — Urgent' },
  { value: 'P3', label: 'P3 — Normal' },
  { value: 'P4', label: 'P4 — Low' },
];

function DueDateBadge({ daysUntilDue }: { daysUntilDue: number }) {
  const cls = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 3 ? 'at_risk' : daysUntilDue <= 7 ? 'on_track' : '';
  const label = daysUntilDue < 0
    ? `${Math.abs(daysUntilDue)}d overdue`
    : daysUntilDue === 0
    ? 'Due today'
    : `${daysUntilDue}d`;
  return <span className={`sla-chip ${cls}`}><Clock size={11} />{label}</span>;
}

export default function PmScheduleListPage() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState({
    status: '', frequencyType: '', propertyId: '', search: '',
    page: 1, limit: 20,
  });
  const selectedProperty = useSelectedPropertyFilter();

  // Reset pagination whenever the sidebar's Active Property changes.
  useEffect(() => { setFilters(f => ({ ...f, page: 1 })); }, [selectedProperty]);

  const { data: schedulesData, isLoading } = useGetPmSchedulesQuery({
    ...filters,
    status: filters.status || undefined,
    frequencyType: filters.frequencyType || undefined,
    propertyId: selectedProperty || undefined,
    search: filters.search || undefined,
  });
  const { data: categoriesData } = useGetCategoriesQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });

  const schedules = schedulesData?.data || [];
  const meta = schedulesData?.meta;
  const categories = categoriesData?.data || [];
  const properties = propertiesData?.data || [];

  const [pauseSchedule] = usePausePmScheduleMutation();
  const [resumeSchedule] = useResumePmScheduleMutation();
  const [generateWo] = useGeneratePmWorkOrderMutation();

  // Compute stats
  const active = schedules.filter((s: any) => s.status === 'active').length;
  const paused = schedules.filter((s: any) => s.status === 'paused').length;
  const overdue = schedules.filter((s: any) => s.daysUntilDue < 0 && s.status === 'active').length;
  const dueThisWeek = schedules.filter((s: any) => s.daysUntilDue >= 0 && s.daysUntilDue <= 7 && s.status === 'active').length;

  const handlePause = async (id: string) => {
    try { await pauseSchedule(id).unwrap(); toast.success('Schedule paused'); } catch { toast.error('Failed'); }
  };
  const handleResume = async (id: string) => {
    try { await resumeSchedule(id).unwrap(); toast.success('Schedule resumed'); } catch { toast.error('Failed'); }
  };
  const handleGenerate = async (id: string) => {
    try { await generateWo(id).unwrap(); toast.success('Work order generated'); } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed'); }
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><CalendarClock size={22} /></div>
          <div>
            <h1>Preventive Maintenance</h1>
            <p>Schedule recurring maintenance for assets and equipment</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/admin/maintenance/pm/calendar')}>
            <Calendar size={16} /> Calendar
          </button>
          <PermissionGuard permission="maintenance-pm.write">
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> New Schedule
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Play size={18} /></div>
          <span className="msc-value">{active}</span>
          <span className="msc-label">Active</span>
        </div>
        <div className="maint-stat-card purple">
          <div className="msc-icon"><Pause size={18} /></div>
          <span className="msc-value">{paused}</span>
          <span className="msc-label">Paused</span>
        </div>
        <div className="maint-stat-card red">
          <div className="msc-icon"><AlertTriangle size={18} /></div>
          <span className="msc-value">{overdue}</span>
          <span className="msc-label">Overdue</span>
        </div>
        <div className="maint-stat-card amber">
          <div className="msc-icon"><Clock size={18} /></div>
          <span className="msc-value">{dueThisWeek}</span>
          <span className="msc-label">Due This Week</span>
        </div>
      </div>

      {/* Filters */}
      <div className="maint-filters">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text" placeholder="Search schedules..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select className="filter-select" value={selectedProperty} disabled>
          {selectedProperty && (
            <option value={selectedProperty}>{properties.find((p: any) => p.id === selectedProperty)?.name || ''}</option>
          )}
        </select>
        <select className="filter-select" value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
        <select className="filter-select" value={filters.frequencyType} onChange={(e) => setFilters(f => ({ ...f, frequencyType: e.target.value, page: 1 }))}>
          <option value="">All Frequencies</option>
          {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="maint-empty">
          <div className="empty-icon"><CalendarClock size={28} /></div>
          <p>No PM schedules found</p>
          <PermissionGuard permission="maintenance-pm.write">
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} /> Create First Schedule
            </button>
          </PermissionGuard>
        </div>
      ) : (
        <>
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Schedule Name</th>
                  <th>Property</th>
                  <th>Frequency</th>
                  <th>Next Due</th>
                  <th>Priority</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s: any) => (
                  <tr key={s.id} onClick={() => navigate(`/admin/maintenance/pm/${s.id}`)}>
                    <td>
                      <div className="ticket-title-cell">
                        <span className="title-text">{s.name}</span>
                      </div>
                    </td>
                    <td><span className="cell-secondary">{s.property?.name}</span></td>
                    <td>
                      <span className="maint-status open">{FREQUENCIES[s.frequencyType] || s.frequencyType}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="cell-secondary">{new Date(s.nextDueDate).toLocaleDateString()}</span>
                        {s.status === 'active' && <DueDateBadge daysUntilDue={s.daysUntilDue} />}
                      </div>
                    </td>
                    <td><span className={`maint-priority ${s.priority?.toLowerCase()}`}>{s.priority}</span></td>
                    <td>
                      <span className="cell-secondary">
                        {s.assignedTo?.profile
                          ? `${s.assignedTo.profile.firstName} ${s.assignedTo.profile.lastName}`
                          : s.assignedRole || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`maint-status ${s.status === 'active' ? 'in_progress' : s.status === 'paused' ? 'pending_parts' : 'closed'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <PermissionGuard permission="maintenance-pm.write">
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {s.status === 'active' && (
                            <>
                              <button className="btn btn-ghost btn-sm" title="Pause" onClick={() => handlePause(s.id)}>
                                <Pause size={14} />
                              </button>
                              <button className="btn btn-ghost btn-sm" title="Generate WO" onClick={() => handleGenerate(s.id)}>
                                <Zap size={14} />
                              </button>
                            </>
                          )}
                          {s.status === 'paused' && (
                            <button className="btn btn-ghost btn-sm" title="Resume" onClick={() => handleResume(s.id)}>
                              <Play size={14} />
                            </button>
                          )}
                        </div>
                      </PermissionGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="maint-pagination">
              <span className="page-info">Page {meta.page} of {meta.totalPages} ({meta.total} schedules)</span>
              <div className="page-btns">
                <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Previous</button>
                <button disabled={filters.page >= meta.totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateScheduleModal
          categories={categories}
          properties={properties}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

// ── Create Schedule Modal ─────────────────

function CreateScheduleModal({ categories, properties, onClose }: {
  categories: any[]; properties: any[]; onClose: () => void;
}) {
  const [createSchedule, { isLoading }] = useCreatePmScheduleMutation();
  const [form, setForm] = useState({
    propertyId: '', name: '', description: '', categoryId: '',
    frequencyType: 'monthly', frequencyValue: '1', customDays: '',
    estimatedHours: '1', nextDueDate: '', advanceDays: '7',
    priority: 'P3', notes: '',
  });
  const [checklist, setChecklist] = useState<Array<{ item: string; isRequired: boolean }>>([]);
  const [newItem, setNewItem] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSchedule({
        propertyId: form.propertyId,
        name: form.name,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        frequencyType: form.frequencyType,
        frequencyValue: parseInt(form.frequencyValue) || 1,
        customDays: form.frequencyType === 'custom_days' ? parseInt(form.customDays) || 30 : undefined,
        estimatedHours: parseFloat(form.estimatedHours) || 1,
        nextDueDate: form.nextDueDate,
        advanceDays: parseInt(form.advanceDays) || 7,
        priority: form.priority,
        notes: form.notes || undefined,
        checklistTemplate: checklist,
      }).unwrap();
      toast.success('PM schedule created');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to create');
    }
  };

  const addChecklistItem = () => {
    if (!newItem.trim()) return;
    setChecklist([...checklist, { item: newItem.trim(), isRequired: false }]);
    setNewItem('');
  };

  const removeChecklistItem = (idx: number) => {
    setChecklist(checklist.filter((_, i) => i !== idx));
  };

  const toggleRequired = (idx: number) => {
    setChecklist(checklist.map((c, i) => i === idx ? { ...c, isRequired: !c.isRequired } : c));
  };

  return (
    <div className="maint-modal-backdrop">
      <div className="maint-modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><CalendarClock size={18} /></span>
            Create PM Schedule
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 24px 24px' }}>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Property <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.propertyId} onChange={(e) => setForm(f => ({ ...f, propertyId: e.target.value }))}>
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="maint-field">
              <label>Category</label>
              <select value={form.categoryId} onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Schedule Name <span style={{ color: '#f87171' }}>*</span></label>
              <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Monthly AC Filter Replacement" />
            </div>
          </div>

          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Description</label>
              <textarea rows={2} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detailed description..." />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Frequency <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.frequencyType} onChange={(e) => setForm(f => ({ ...f, frequencyType: e.target.value }))}>
                {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="maint-field">
              <label>{form.frequencyType === 'custom_days' ? 'Every N Days' : 'Every N Intervals'}</label>
              <input
                type="number" min="1"
                value={form.frequencyType === 'custom_days' ? form.customDays : form.frequencyValue}
                onChange={(e) => setForm(f => ({
                  ...f,
                  ...(form.frequencyType === 'custom_days'
                    ? { customDays: e.target.value }
                    : { frequencyValue: e.target.value }),
                }))}
              />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Next Due Date <span style={{ color: '#f87171' }}>*</span></label>
              <input type="date" required value={form.nextDueDate} onChange={(e) => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Advance Days (create WO N days before)</label>
              <input type="number" min="0" max="365" value={form.advanceDays} onChange={(e) => setForm(f => ({ ...f, advanceDays: e.target.value }))} />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Priority</label>
              <div className="priority-selector">
                {PRIORITIES.map((p) => (
                  <button key={p.value} type="button"
                    className={`priority-option ${p.value.toLowerCase()} ${form.priority === p.value ? 'active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, priority: p.value }))}
                  >
                    {p.value}
                  </button>
                ))}
              </div>
            </div>
            <div className="maint-field">
              <label>Estimated Hours</label>
              <input type="number" min="0" step="0.5" value={form.estimatedHours} onChange={(e) => setForm(f => ({ ...f, estimatedHours: e.target.value }))} />
            </div>
          </div>

          {/* Checklist Builder */}
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Checklist Items</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text" value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="Add checklist item..."
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={addChecklistItem}>
                  <Plus size={14} />
                </button>
              </div>
              {checklist.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {checklist.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '6px',
                      background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                      fontSize: '13px',
                    }}>
                      <span style={{ flex: 1 }}>{item.item}</span>
                      <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={item.isRequired} onChange={() => toggleRequired(idx)} />
                        Required
                      </label>
                      <button type="button" onClick={() => removeChecklistItem(idx)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-tertiary)', padding: '2px',
                      }}>
                        <XCircle size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Create Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
