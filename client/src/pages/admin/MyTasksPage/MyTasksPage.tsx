import { useState, useMemo, useRef } from 'react';
import {
  useGetMyTasksQuery, useApproveTaskMutation, useRejectTaskMutation,
  useDelegateTaskMutation, useUploadTaskAttachmentMutation,
  type WorkflowTask,
} from '../../../store/api/workflowApi';
import { useGetUsersQuery } from '../../../store/api/usersApi';
import toast from 'react-hot-toast';
import { UserCheck, ArrowRightLeft, Search, X, Paperclip, Upload } from 'lucide-react';

export default function MyTasksPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page), limit: '20' };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, refetch } = useGetMyTasksQuery(params);
  const [approveTask] = useApproveTaskMutation();
  const [rejectTask] = useRejectTaskMutation();

  const tasks = data?.data ?? [];
  const meta = data?.meta;

  const [actionTask, setActionTask] = useState<{ task: WorkflowTask; action: 'approve' | 'reject' } | null>(null);
  const [delegateTask, setDelegateTask] = useState<WorkflowTask | null>(null);
  const [comments, setComments] = useState('');

  const handleAction = async () => {
    if (!actionTask) return;
    try {
      if (actionTask.action === 'approve') {
        await approveTask({ taskId: actionTask.task.id, comments }).unwrap();
        toast.success('Task approved');
      } else {
        await rejectTask({ taskId: actionTask.task.id, comments }).unwrap();
        toast.success('Task rejected');
      }
      setActionTask(null);
      setComments('');
      refetch();
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>📥 My Tasks</h1>
        <p className="text-secondary">Your approval inbox — review and action pending items</p>
      </div>

      {meta && (
        <div className="prop-stats-row">
          <div className="prop-stat">
            <span className="prop-stat-num">{meta.pending}</span>
            <span className="prop-stat-label">Pending</span>
          </div>
          <div className="prop-stat">
            <span className="prop-stat-num">{meta.total}</span>
            <span className="prop-stat-label">Total Tasks</span>
          </div>
        </div>
      )}

      <div className="toolbar">
        <select className="input-full" style={{ maxWidth: 180 }} value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="delegated">Delegated</option>
        </select>
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading tasks...</div>
      ) : (
        <div className="tasks-list">
          {tasks.map((t) => {
            const inst = t.instance;
            const initiator = inst?.initiator?.profile;
            const slaMinutes = t.minutesUntilSla;
            const slaUrgent = slaMinutes !== null && slaMinutes < 120 && slaMinutes > 0;
            const slaBreached = t.slaBreached || (slaMinutes !== null && slaMinutes <= 0);
            const delegateeName = t.delegatee?.profile
              ? `${t.delegatee.profile.firstName} ${t.delegatee.profile.lastName}`
              : null;
            const escalatorName = t.escalator?.profile
              ? `${t.escalator.profile.firstName} ${t.escalator.profile.lastName}`
              : null;

            return (
              <div key={t.id} className={`task-card ${t.status === 'pending' ? '' : 'completed'} ${slaBreached ? 'sla-breached' : ''}`}>
                <div className="task-card-header">
                  <div className="task-card-info">
                    <h3>{t.title}</h3>
                    <div className="task-card-meta">
                      <span className="role-chip">{inst?.entityType}</span>
                      <span className="text-muted text-small">{inst?.definition?.name}</span>
                    </div>
                  </div>
                  <div className="task-card-badges">
                    <span className={`status-badge ${t.status === 'pending' ? 'active' : t.status === 'approved' ? 'active' : t.status === 'delegated' ? 'warning' : 'danger'}`}>
                      {t.status}
                    </span>
                    {t.slaDueAt && t.status === 'pending' && (
                      <span className={`sla-chip ${slaBreached ? 'breached' : slaUrgent ? 'urgent' : t.remindedAt ? 'reminded' : 'normal'}`}>
                        {slaBreached
                          ? (t.escalatedAt ? '🔺 Escalated' : '⚠️ SLA Breached')
                          : slaUrgent
                            ? `⏰ ${slaMinutes}m left`
                            : `⏳ ${Math.round((slaMinutes ?? 0) / 60)}h left`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Entity Summary */}
                {inst?.context && Object.keys(inst.context).length > 0 && (
                  <div className="entity-summary">
                    <EntitySummary entityType={inst.entityType} context={inst.context} />
                  </div>
                )}

                <div className="task-card-body">
                  <span className="text-small text-muted">
                    Initiated by {initiator ? `${initiator.firstName} ${initiator.lastName}` : 'Unknown'} · {new Date(t.createdAt).toLocaleString()}
                  </span>
                  {delegateeName && (
                    <span className="delegate-badge">
                      <ArrowRightLeft size={12} />
                      Delegated to <strong>{delegateeName}</strong>
                    </span>
                  )}
                  {escalatorName && t.escalatedAt && (
                    <span className="escalation-badge">
                      🔺 Escalated to <strong>{escalatorName}</strong>
                      <span className="text-muted text-small"> · {new Date(t.escalatedAt).toLocaleString()}</span>
                    </span>
                  )}
                  {t.comments && <span className="text-small task-comment">💬 "{t.comments}"</span>}

                  {/* Attachments */}
                  {t.attachments && t.attachments.length > 0 && (
                    <div className="task-attachments">
                      <Paperclip size={12} />
                      {t.attachments.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                          className="task-attachment-chip" title={`${a.name} (${formatFileSize(a.size)})`}>
                          {a.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {t.status === 'pending' && (
                  <div className="task-card-actions">
                    <button className="btn btn-sm btn-primary"
                      onClick={() => { setActionTask({ task: t, action: 'approve' }); setComments(''); }}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-sm btn-danger"
                      onClick={() => { setActionTask({ task: t, action: 'reject' }); setComments(''); }}>
                      ✕ Reject
                    </button>
                    <button className="btn btn-sm btn-delegate"
                      onClick={() => setDelegateTask(t)}>
                      <ArrowRightLeft size={14} /> Delegate
                    </button>
                    <AttachButton taskId={t.id} />
                  </div>
                )}
              </div>
            );
          })}
          {tasks.length === 0 && (
            <div className="info-card" style={{ textAlign: 'center', padding: 60 }}>
              <h3>🎉 All clear!</h3>
              <p className="text-muted">No {statusFilter || ''} tasks in your inbox.</p>
            </div>
          )}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="text-secondary">Page {meta.page} of {meta.totalPages}</span>
          <button className="btn btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {/* Approve / Reject Modal */}
      {actionTask && (
        <div className="modal-overlay" onClick={() => setActionTask(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{actionTask.action === 'approve' ? '✓ Approve' : '✕ Reject'} Task</h2>
              <button className="btn-icon" onClick={() => setActionTask(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p><strong>{actionTask.task.title}</strong></p>
              <p className="text-muted text-small" style={{ marginBottom: 12 }}>
                {actionTask.task.instance?.definition?.name} · {actionTask.task.instance?.entityType}
              </p>
              <div className="form-group">
                <label>Comments {actionTask.action === 'reject' ? '*' : '(optional)'}</label>
                <textarea className="input-full" rows={3} value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={actionTask.action === 'approve' ? 'Add approval notes...' : 'Reason for rejection...'} />
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setActionTask(null)}>Cancel</button>
                <button
                  className={`btn ${actionTask.action === 'approve' ? 'btn-primary' : 'btn-danger'}`}
                  onClick={handleAction}
                  disabled={actionTask.action === 'reject' && !comments.trim()}
                >
                  {actionTask.action === 'approve' ? '✓ Approve' : '✕ Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delegate Modal */}
      {delegateTask && (
        <DelegateModal
          task={delegateTask}
          onClose={() => setDelegateTask(null)}
          onDelegated={() => { setDelegateTask(null); refetch(); }}
        />
      )}
    </div>
  );
}

/* ─── Delegate Modal ───────────────────────── */

function DelegateModal({ task, onClose, onDelegated }: {
  task: WorkflowTask;
  onClose: () => void;
  onDelegated: () => void;
}) {
  const [delegateTaskMutation, { isLoading: isDelegating }] = useDelegateTaskMutation();
  const { data: usersData, isLoading: usersLoading } = useGetUsersQuery({ limit: '200', isActive: 'true' });
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const users = usersData?.data ?? [];

  // Filter out the current assignee, and filter by search term
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Exclude current assignee
      if (u.id === task.assignedTo) return false;
      // Search by name, email, job title
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.jobTitle?.toLowerCase().includes(q)) ||
        (u.department?.name.toLowerCase().includes(q))
      );
    });
  }, [users, search, task.assignedTo]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleDelegate = async () => {
    if (!selectedUserId) return;
    try {
      await delegateTaskMutation({
        taskId: task.id,
        delegateTo: selectedUserId,
        reason: reason.trim(),
      }).unwrap();
      toast.success(`Task delegated to ${selectedUser?.fullName || 'user'}`);
      onDelegated();
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Delegation failed');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card delegate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><ArrowRightLeft size={20} /> Delegate Task</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {/* Task info */}
          <div className="delegate-task-info">
            <p className="delegate-task-title">{task.title}</p>
            <p className="text-muted text-small">
              {task.instance?.definition?.name} · <span className="role-chip">{task.instance?.entityType}</span>
            </p>
          </div>

          {/* Selected user preview */}
          {selectedUser && (
            <div className="delegate-selected-user">
              <UserCheck size={16} />
              <div className="delegate-selected-info">
                <strong>{selectedUser.fullName}</strong>
                <span className="text-muted text-small">{selectedUser.email}</span>
              </div>
              <button className="btn-icon" onClick={() => setSelectedUserId(null)} title="Clear selection">
                <X size={14} />
              </button>
            </div>
          )}

          {/* User picker */}
          <div className="form-group">
            <label>Select user to delegate to *</label>
            <div className="delegate-search-wrapper">
              <Search size={15} className="delegate-search-icon" />
              <input
                className="input-full delegate-search-input"
                placeholder="Search by name, email, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="btn-icon delegate-search-clear" onClick={() => setSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="delegate-user-list">
              {usersLoading ? (
                <div className="loading-inline" style={{ padding: 20 }}>
                  <div className="loading-spinner" /> Loading users…
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="delegate-empty">
                  <p className="text-muted text-small">No matching users found</p>
                </div>
              ) : (
                filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className={`delegate-user-item ${selectedUserId === u.id ? 'selected' : ''}`}
                    onClick={() => setSelectedUserId(u.id)}
                  >
                    <div className="delegate-user-avatar">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.fullName} />
                      ) : (
                        <span>{u.fullName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="delegate-user-details">
                      <span className="delegate-user-name">{u.fullName}</span>
                      <span className="delegate-user-meta">
                        {u.email}
                        {u.jobTitle && ` · ${u.jobTitle}`}
                        {u.department && ` · ${u.department.name}`}
                      </span>
                    </div>
                    {u.roles.length > 0 && (
                      <div className="delegate-user-roles">
                        {u.roles.slice(0, 2).map((r) => (
                          <span key={r.id} className="role-chip text-small">{r.name}</span>
                        ))}
                        {u.roles.length > 2 && (
                          <span className="text-muted text-small">+{u.roles.length - 2}</span>
                        )}
                      </div>
                    )}
                    {selectedUserId === u.id && (
                      <UserCheck size={16} className="delegate-check-icon" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Reason */}
          <div className="form-group">
            <label>Reason for delegation *</label>
            <textarea
              className="input-full"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. On leave until Aug 20, please review in my absence…"
            />
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-delegate-confirm"
              onClick={handleDelegate}
              disabled={!selectedUserId || !reason.trim() || isDelegating}
            >
              {isDelegating ? (
                <><div className="loading-spinner" style={{ width: 14, height: 14 }} /> Delegating…</>
              ) : (
                <><ArrowRightLeft size={15} /> Delegate Task</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Entity Summary ───────────────────────── */

/** Format camelCase/snake_case keys into readable labels */
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')       // camelCase → words
    .replace(/[_-]/g, ' ')             // snake_case → words
    .replace(/\b\w/g, c => c.toUpperCase()) // capitalize
    .trim();
}

/** Format values for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    // Format large numbers with commas
    return value >= 1000 ? value.toLocaleString() : String(value);
  }
  if (typeof value === 'string') {
    // Try to detect ISO dates
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return value;
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Keys to skip in entity summary (internal/meta fields) */
const SKIP_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'companyId', 'workflowName']);

/** Priority keys to show first (common PMS entity fields) */
const PRIORITY_KEYS = [
  'unitCode', 'unitNumber', 'propertyName', 'buildingName',
  'tenantName', 'customerName', 'vendorName',
  'leaseCode', 'contractNumber',
  'rentAmount', 'amount', 'totalAmount',
  'status', 'type', 'category',
];

function EntitySummary({ entityType, context }: { entityType: string; context: Record<string, unknown> }) {
  const entries = Object.entries(context).filter(([key, val]) => {
    if (SKIP_KEYS.has(key)) return false;
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'object' && !Array.isArray(val)) return false; // skip nested objects
    return true;
  });

  if (entries.length === 0) return null;

  // Sort: priority keys first, then alphabetical
  entries.sort(([a], [b]) => {
    const ai = PRIORITY_KEYS.indexOf(a);
    const bi = PRIORITY_KEYS.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // Take top 5 fields for summary display
  const displayEntries = entries.slice(0, 5);
  const remaining = entries.length - displayEntries.length;

  return (
    <div className="entity-summary-content">
      <span className="entity-summary-type">{entityType}</span>
      <div className="entity-summary-fields">
        {displayEntries.map(([key, val]) => (
          <span key={key} className="entity-summary-field">
            <span className="entity-summary-label">{formatLabel(key)}:</span>{' '}
            <span className="entity-summary-value">{formatValue(val)}</span>
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-muted text-small">+{remaining} more</span>
        )}
      </div>
    </div>
  );
}

/* ─── Attachment Button ────────────────────── */

function AttachButton({ taskId }: { taskId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadAttachment, { isLoading }] = useUploadTaskAttachmentMutation();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      await uploadAttachment({ taskId, files: formData }).unwrap();
      toast.success(`${files.length} file(s) attached`);
    } catch {
      toast.error('Failed to upload attachment');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <input type="file" ref={fileRef} multiple hidden
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
        onChange={handleUpload} />
      <button className="btn btn-sm" disabled={isLoading}
        onClick={() => fileRef.current?.click()}>
        {isLoading ? '…' : <><Paperclip size={14} /> Attach</>}
      </button>
    </>
  );
}

/* ─── Helpers ──────────────────────────────── */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
