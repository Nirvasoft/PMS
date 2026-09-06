import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetPmScheduleByIdQuery, useGetPmScheduleHistoryQuery,
  usePausePmScheduleMutation, useResumePmScheduleMutation,
  useGeneratePmWorkOrderMutation, useCompletePmWorkOrderMutation,
  useSkipPmWorkOrderMutation, useUpdatePmScheduleMutation,
} from '../../../store/api/pmApi';
import { useGetCategoriesQuery } from '../../../store/api/maintenanceApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  CalendarClock, ArrowLeft, Loader2, Clock, Play, Pause, Zap,
  CheckCircle2, XCircle, AlertTriangle, ListChecks, FileText,
  Check, SkipForward, ShieldAlert, Pencil, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const FREQUENCIES: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', semi_annual: 'Semi-Annual',
  annual: 'Annual', custom_days: 'Custom',
};

const SEVERITY_OPTIONS = [
  { value: 'none', label: 'None — No issues found', color: '#22c55e' },
  { value: 'monitoring', label: 'Monitoring — Note logged, no action needed', color: '#3b82f6' },
  { value: 'requires_repair', label: 'Requires Repair — Auto-create P2 ticket', color: '#f59e0b' },
  { value: 'critical', label: 'Critical — Auto-create P1 ticket + notify manager', color: '#ef4444' },
];

export default function PmScheduleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: scheduleData, isLoading } = useGetPmScheduleByIdQuery(id!);
  const { data: historyData } = useGetPmScheduleHistoryQuery(id!);
  const [pauseSchedule] = usePausePmScheduleMutation();
  const [resumeSchedule] = useResumePmScheduleMutation();
  const [generateWo] = useGeneratePmWorkOrderMutation();

  const [completeWoId, setCompleteWoId] = useState<string | null>(null);
  const [skipWoId, setSkipWoId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const { data: categoriesData } = useGetCategoriesQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const categories = categoriesData?.data || [];
  const properties = propertiesData?.data || [];

  const schedule = scheduleData?.data;
  const history = historyData?.data || [];

  if (isLoading) return <div className="maint-page"><div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div></div>;
  if (!schedule) return <div className="maint-page"><div className="maint-empty"><p>Schedule not found</p></div></div>;

  const daysUntilDue = Math.ceil((new Date(schedule.nextDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const checklist = (schedule.checklistTemplate || []) as Array<{ item: string; isRequired: boolean; notes?: string }>;

  const handlePause = async () => {
    try { await pauseSchedule(id!).unwrap(); toast.success('Paused'); } catch { toast.error('Failed'); }
  };
  const handleResume = async () => {
    try { await resumeSchedule(id!).unwrap(); toast.success('Resumed'); } catch { toast.error('Failed'); }
  };
  const handleGenerate = async () => {
    try { await generateWo(id!).unwrap(); toast.success('Work order generated!'); } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed'); }
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/maintenance/pm')}>
            <ArrowLeft size={16} />
          </button>
          <div className="page-icon-lg"><CalendarClock size={22} /></div>
          <div>
            <h1>{schedule.name}</h1>
            <p>{schedule.property?.name} · {FREQUENCIES[schedule.frequencyType]} · <span className={`maint-priority ${schedule.priority?.toLowerCase()}`}>{schedule.priority}</span></p>
          </div>
        </div>
        <PermissionGuard permission="maintenance-pm.write">
          <div className="header-actions">
            <button className="btn btn-ghost" onClick={() => setShowEditModal(true)}><Pencil size={16} /> Edit</button>
            {schedule.status === 'active' && (
              <>
                <button className="btn btn-ghost" onClick={handlePause}><Pause size={16} /> Pause</button>
                <button className="btn btn-primary" onClick={handleGenerate}><Zap size={16} /> Generate WO</button>
              </>
            )}
            {schedule.status === 'paused' && (
              <button className="btn btn-primary" onClick={handleResume}><Play size={16} /> Resume</button>
            )}
          </div>
        </PermissionGuard>
      </div>

      {/* Detail Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Schedule Info */}
        <div className="sla-defaults-card">
          <h3><FileText size={16} /> Schedule Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '12px', fontSize: '13px' }}>
            <div>
              <span className="cell-secondary">Status</span>
              <div style={{ marginTop: '4px' }}>
                <span className={`maint-status ${schedule.status === 'active' ? 'in_progress' : schedule.status === 'paused' ? 'pending_parts' : 'closed'}`}>
                  {schedule.status}
                </span>
              </div>
            </div>
            <div>
              <span className="cell-secondary">Frequency</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {FREQUENCIES[schedule.frequencyType]}
                {schedule.frequencyValue > 1 && ` (every ${schedule.frequencyValue})`}
              </div>
            </div>
            <div>
              <span className="cell-secondary">Next Due Date</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {new Date(schedule.nextDueDate).toLocaleDateString()}
                <span style={{ marginLeft: '8px', fontSize: '12px', color: daysUntilDue < 0 ? '#ef4444' : daysUntilDue <= 7 ? '#f59e0b' : '#22c55e' }}>
                  ({daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? 'Today' : `${daysUntilDue}d left`})
                </span>
              </div>
            </div>
            <div>
              <span className="cell-secondary">Advance Days</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>{schedule.advanceDays} days before due</div>
            </div>
            <div>
              <span className="cell-secondary">Estimated Hours</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>{Number(schedule.estimatedHours)}h</div>
            </div>
            <div>
              <span className="cell-secondary">Assigned To</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {schedule.assignedTo?.profile
                  ? `${schedule.assignedTo.profile.firstName} ${schedule.assignedTo.profile.lastName}`
                  : schedule.assignedRole || '—'}
              </div>
            </div>
            <div>
              <span className="cell-secondary">Category</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>{schedule.category?.name || '—'}</div>
            </div>
            <div>
              <span className="cell-secondary">Last Performed</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {schedule.lastPerformedAt ? new Date(schedule.lastPerformedAt).toLocaleDateString() : 'Never'}
              </div>
            </div>
          </div>
          {schedule.description && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>Description:</strong> {schedule.description}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="sla-defaults-card">
          <h3><ListChecks size={16} /> Checklist Template ({checklist.length} items)</h3>
          {checklist.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '12px' }}>No checklist items</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
              {checklist.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                  fontSize: '13px',
                }}>
                  <CheckCircle2 size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{item.item}</span>
                  {item.isRequired && (
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      Required
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Service History */}
      <div className="maint-table-wrap">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
            <Clock size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            Service History ({history.length})
          </h3>
        </div>
        <table className="maint-table">
          <thead>
            <tr>
              <th>Due Date</th>
              <th>Status</th>
              <th>Completed At</th>
              <th>Completed By</th>
              <th>Ticket</th>
              <th>Findings</th>
              <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="maint-empty" style={{ padding: '24px 0' }}>
                    <p>No service history yet</p>
                  </div>
                </td>
              </tr>
            ) : history.map((wo: any) => (
              <tr key={wo.id}>
                <td><span className="cell-mono">{new Date(wo.dueDate).toLocaleDateString()}</span></td>
                <td>
                  <span className={`maint-status ${wo.status === 'completed' ? 'completed' : wo.status === 'overdue' ? 'cancelled' : wo.status === 'skipped' ? 'pending_parts' : 'open'}`}>
                    {wo.status}
                  </span>
                </td>
                <td><span className="cell-secondary">{wo.completedAt ? new Date(wo.completedAt).toLocaleString() : '—'}</span></td>
                <td>
                  <span className="cell-secondary">
                    {wo.completedBy?.profile ? `${wo.completedBy.profile.firstName} ${wo.completedBy.profile.lastName}` : '—'}
                  </span>
                </td>
                <td>
                  {wo.ticket ? (
                    <span className="cell-mono" style={{ cursor: 'pointer', color: 'var(--primary)' }}
                      onClick={() => navigate(`/admin/maintenance/tickets/${wo.ticket.id}`)}
                    >
                      {wo.ticket.ticketNumber}
                    </span>
                  ) : '—'}
                </td>
                <td>
                  <span className="cell-secondary" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {wo.findings || '—'}
                  </span>
                </td>
                <td>
                  {(wo.status === 'scheduled' || wo.status === 'in_progress' || wo.status === 'overdue') ? (
                    <PermissionGuard permission="maintenance-pm.write">
                      <div className="sla-row-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Complete"
                          style={{ color: '#22c55e' }}
                          onClick={() => setCompleteWoId(wo.id)}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-danger-ghost"
                          title="Skip"
                          onClick={() => setSkipWoId(wo.id)}
                        >
                          <SkipForward size={14} />
                        </button>
                      </div>
                    </PermissionGuard>
                  ) : (
                    <span className="cell-secondary" style={{ fontSize: 11 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Complete Modal */}
      {completeWoId && (
        <CompletePmWoModal
          woId={completeWoId}
          checklistTemplate={checklist}
          onClose={() => setCompleteWoId(null)}
        />
      )}

      {/* Skip Modal */}
      {skipWoId && (
        <SkipPmWoModal
          woId={skipWoId}
          onClose={() => setSkipWoId(null)}
        />
      )}

      {/* Edit Schedule Modal */}
      {showEditModal && (
        <EditScheduleModal
          schedule={schedule}
          categories={categories}
          properties={properties}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}

// ── Complete PM Work Order Modal ────────────────
function CompletePmWoModal({ woId, checklistTemplate, onClose }: {
  woId: string;
  checklistTemplate: Array<{ item: string; isRequired: boolean; notes?: string }>;
  onClose: () => void;
}) {
  const [completePmWo, { isLoading }] = useCompletePmWorkOrderMutation();

  const [checklistResults, setChecklistResults] = useState(
    checklistTemplate.map((t) => ({ item: t.item, checked: false, notes: '' }))
  );
  const [findings, setFindings] = useState('');
  const [severity, setSeverity] = useState<'none' | 'monitoring' | 'requires_repair' | 'critical'>('none');

  const updateChecklist = (idx: number, field: 'checked' | 'notes', value: any) => {
    setChecklistResults((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  // Validate required items are checked
  const requiredUnchecked = checklistTemplate
    .map((t, i) => ({ ...t, idx: i }))
    .filter((t) => t.isRequired && !checklistResults[t.idx]?.checked);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (requiredUnchecked.length > 0) {
      toast.error(`${requiredUnchecked.length} required checklist item(s) unchecked`);
      return;
    }

    try {
      await completePmWo({
        id: woId,
        data: { checklistResults, findings: findings || undefined, severity },
      }).unwrap();
      toast.success('Work order completed!');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to complete');
    }
  };

  return (
    <div className="maint-modal-backdrop">
      <div className="maint-modal" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><CheckCircle2 size={18} /></span>
            Complete PM Work Order
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* Checklist */}
          {checklistTemplate.length > 0 && (
            <div className="maint-field" style={{ marginBottom: '16px' }}>
              <label><ListChecks size={14} style={{ verticalAlign: '-2px', marginRight: '4px' }} /> Checklist Results</label>
              <div className="pm-complete-checklist">
                {checklistTemplate.map((item, idx) => (
                  <div key={idx} className={`pm-checklist-item ${checklistResults[idx]?.checked ? 'checked' : ''} ${item.isRequired && !checklistResults[idx]?.checked ? 'required-unchecked' : ''}`}>
                    <label className="pm-check-label">
                      <input
                        type="checkbox"
                        checked={checklistResults[idx]?.checked || false}
                        onChange={(e) => updateChecklist(idx, 'checked', e.target.checked)}
                      />
                      <span className="pm-check-custom">
                        {checklistResults[idx]?.checked && <Check size={12} />}
                      </span>
                      <span className="pm-check-text">{item.item}</span>
                      {item.isRequired && (
                        <span className="pm-check-required">Required</span>
                      )}
                    </label>
                    <input
                      type="text"
                      className="pm-check-notes"
                      placeholder="Notes (optional)"
                      value={checklistResults[idx]?.notes || ''}
                      onChange={(e) => updateChecklist(idx, 'notes', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          <div className="maint-field" style={{ marginBottom: '16px' }}>
            <label>Findings / Notes</label>
            <textarea
              rows={3}
              placeholder="Describe any findings, issues observed, or notes..."
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
            />
          </div>

          {/* Severity */}
          <div className="maint-field" style={{ marginBottom: '16px' }}>
            <label>
              <ShieldAlert size={14} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
              Finding Severity
            </label>
            <div className="pm-severity-options">
              {SEVERITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`pm-severity-option ${severity === opt.value ? 'active' : ''}`}
                  style={{ '--sev-color': opt.color } as any}
                >
                  <input
                    type="radio" name="severity"
                    value={opt.value}
                    checked={severity === opt.value}
                    onChange={() => setSeverity(opt.value as any)}
                  />
                  <span className="pm-severity-dot" />
                  <span className="pm-severity-label">{opt.label}</span>
                </label>
              ))}
            </div>
            {(severity === 'requires_repair' || severity === 'critical') && (
              <div className="pm-severity-warning">
                <AlertTriangle size={14} />
                A follow-up {severity === 'critical' ? 'P1 Emergency' : 'P2'} ticket will be auto-created from the findings above
              </div>
            )}
          </div>

          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : <><CheckCircle2 size={16} /> Complete Work Order</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Skip PM Work Order Modal ────────────────
function SkipPmWoModal({ woId, onClose }: { woId: string; onClose: () => void }) {
  const [skipPmWo, { isLoading }] = useSkipPmWorkOrderMutation();
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await skipPmWo({ id: woId, reason: reason || undefined }).unwrap();
      toast.success('Work order skipped');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to skip');
    }
  };

  return (
    <div className="maint-modal-backdrop">
      <div className="maint-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><SkipForward size={18} /></span>
            Skip Work Order
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="maint-field">
            <label>Reason for skipping (optional)</label>
            <textarea
              rows={3}
              placeholder="e.g. Asset under separate maintenance contract this month..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ background: '#f59e0b', borderColor: '#f59e0b' }}>
              {isLoading ? <Loader2 size={16} className="spin" /> : <><SkipForward size={16} /> Skip Work Order</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit PM Schedule Modal ────────────────
const FREQUENCIES_LIST: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', semi_annual: 'Semi-Annual',
  annual: 'Annual', custom_days: 'Custom',
};

const PRIORITIES_LIST = [
  { value: 'P1', label: 'P1 — Emergency' },
  { value: 'P2', label: 'P2 — Urgent' },
  { value: 'P3', label: 'P3 — Normal' },
  { value: 'P4', label: 'P4 — Low' },
];

function EditScheduleModal({ schedule, categories, properties, onClose }: {
  schedule: any;
  categories: any[];
  properties: any[];
  onClose: () => void;
}) {
  const [updateSchedule, { isLoading }] = useUpdatePmScheduleMutation();

  const existingChecklist = (schedule.checklistTemplate || []) as Array<{ item: string; isRequired: boolean }>;

  const [form, setForm] = useState({
    name: schedule.name || '',
    description: schedule.description || '',
    categoryId: schedule.categoryId || '',
    frequencyType: schedule.frequencyType || 'monthly',
    frequencyValue: String(schedule.frequencyValue || 1),
    customDays: String(schedule.customDays || ''),
    estimatedHours: String(Number(schedule.estimatedHours) || 1),
    nextDueDate: schedule.nextDueDate ? new Date(schedule.nextDueDate).toISOString().split('T')[0] : '',
    advanceDays: String(schedule.advanceDays ?? 7),
    priority: schedule.priority || 'P3',
    notes: schedule.notes || '',
  });
  const [checklist, setChecklist] = useState<Array<{ item: string; isRequired: boolean }>>(existingChecklist);
  const [newItem, setNewItem] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSchedule({
        id: schedule.id,
        data: {
          name: form.name,
          description: form.description || undefined,
          categoryId: form.categoryId || null,
          frequencyType: form.frequencyType,
          frequencyValue: parseInt(form.frequencyValue) || 1,
          customDays: form.frequencyType === 'custom_days' ? parseInt(form.customDays) || 30 : undefined,
          estimatedHours: parseFloat(form.estimatedHours) || 1,
          nextDueDate: form.nextDueDate,
          advanceDays: parseInt(form.advanceDays) || 7,
          priority: form.priority,
          notes: form.notes || null,
          checklistTemplate: checklist,
        },
      }).unwrap();
      toast.success('Schedule updated');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to update');
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
            <span className="modal-icon"><Pencil size={18} /></span>
            Edit PM Schedule
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 24px 24px' }}>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Schedule Name <span style={{ color: '#f87171' }}>*</span></label>
              <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
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
              <label>Category</label>
              <select value={form.categoryId} onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">No category</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="maint-field">
              <label>Property</label>
              <select disabled value={schedule.propertyId}>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Property cannot be changed</span>
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Frequency <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.frequencyType} onChange={(e) => setForm(f => ({ ...f, frequencyType: e.target.value }))}>
                {Object.entries(FREQUENCIES_LIST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
              <label>Next Due Date</label>
              <input type="date" value={form.nextDueDate} onChange={(e) => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Advance Days</label>
              <input type="number" min="0" max="365" value={form.advanceDays} onChange={(e) => setForm(f => ({ ...f, advanceDays: e.target.value }))} />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Priority</label>
              <div className="priority-selector">
                {PRIORITIES_LIST.map((p) => (
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

          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes..." />
            </div>
          </div>

          {/* Checklist Builder */}
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Checklist Items ({checklist.length})</label>
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
              {isLoading ? <Loader2 size={16} className="spin" /> : <><Pencil size={16} /> Update Schedule</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
