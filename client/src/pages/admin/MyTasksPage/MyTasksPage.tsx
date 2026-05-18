import { useState } from 'react';
import {
  useGetMyTasksQuery, useApproveTaskMutation, useRejectTaskMutation,
  type WorkflowTask,
} from '../../../store/api/workflowApi';
import toast from 'react-hot-toast';

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

            return (
              <div key={t.id} className={`task-card ${t.status === 'pending' ? '' : 'completed'}`}>
                <div className="task-card-header">
                  <div className="task-card-info">
                    <h3>{t.title}</h3>
                    <div className="task-card-meta">
                      <span className="role-chip">{inst?.entityType}</span>
                      <span className="text-muted text-small">{inst?.definition?.name}</span>
                    </div>
                  </div>
                  <div className="task-card-badges">
                    <span className={`status-badge ${t.status === 'pending' ? 'active' : t.status === 'approved' ? 'active' : 'danger'}`}>
                      {t.status}
                    </span>
                    {t.slaDueAt && t.status === 'pending' && (
                      <span className={`sla-chip ${slaBreached ? 'breached' : slaUrgent ? 'urgent' : 'normal'}`}>
                        {slaBreached ? '⚠️ SLA Breached' :
                          slaUrgent ? `⏰ ${slaMinutes}m left` :
                            `⏳ ${Math.round((slaMinutes ?? 0) / 60)}h left`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="task-card-body">
                  <span className="text-small text-muted">
                    Initiated by {initiator ? `${initiator.firstName} ${initiator.lastName}` : 'Unknown'} · {new Date(t.createdAt).toLocaleString()}
                  </span>
                  {t.comments && <span className="text-small task-comment">💬 "{t.comments}"</span>}
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

      {/* Action Modal */}
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
    </div>
  );
}
