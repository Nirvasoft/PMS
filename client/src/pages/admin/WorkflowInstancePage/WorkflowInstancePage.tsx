import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useGetInstanceQuery, useCancelInstanceMutation,
  type WorkflowTask, type WorkflowInstance,
} from '../../../store/api/workflowApi';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, Ban,
  User, ArrowRightLeft, AlertTriangle, Timer,
} from 'lucide-react';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

export default function WorkflowInstancePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useGetInstanceQuery(id!);
  const [cancelInstance] = useCancelInstanceMutation();
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [activeSection, setActiveSection] = useState<'tasks' | 'history' | 'context'>('tasks');

  const inst = data?.data;

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="loading-inline"><div className="loading-spinner" /> Loading instance…</div>
      </div>
    );
  }

  if (!inst) {
    return (
      <div className="page-content">
        <div className="info-card" style={{ textAlign: 'center', padding: 60 }}>
          <h2>Instance Not Found</h2>
          <p className="text-muted">The workflow instance could not be loaded.</p>
          <Link to="/admin/workflows" className="btn btn-primary" style={{ marginTop: 16 }}>
            ← Back to Workflows
          </Link>
        </div>
      </div>
    );
  }

  const pendingTasks = inst.tasks.filter(t => t.status === 'pending');
  const completedTasks = inst.tasks.filter(t => t.status !== 'pending');
  const progress = inst.tasks.length > 0
    ? Math.round((completedTasks.length / inst.tasks.length) * 100) : 0;

  const StatusIcon = inst.status === 'running' ? Clock
    : inst.status === 'approved' ? CheckCircle2
      : inst.status === 'rejected' ? XCircle : Ban;

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    try {
      await cancelInstance({ id: inst.id, reason: cancelReason.trim() }).unwrap();
      toast.success('Workflow cancelled');
      setCancelModal(false);
      setCancelReason('');
    } catch { toast.error('Failed to cancel'); }
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <Link to="/admin/workflows" className="text-muted text-small" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <ArrowLeft size={14} /> Back to Workflows
            </Link>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusIcon size={24} />
              {inst.definition.name}
            </h1>
            <p className="text-secondary">
              <span className="role-chip">{inst.entityType}</span>
              Entity: <strong>{inst.entityId}</strong>
              {' · '}Started {new Date(inst.startedAt).toLocaleString()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => refetch()}>↻ Refresh</button>
            {inst.status === 'running' && (
              <PermissionGuard permission="workflows-engine.write">
                <button className="btn btn-sm btn-danger" onClick={() => { setCancelModal(true); setCancelReason(''); }}>
                  Cancel Workflow
                </button>
              </PermissionGuard>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="wfi-status-bar">
        <div className="wfi-status-cards">
          <div className={`wfi-stat-card ${inst.status}`}>
            <span className="wfi-stat-label">Status</span>
            <span className={`wfi-stat-value status-${inst.status}`}>{inst.status.toUpperCase()}</span>
          </div>
          <div className="wfi-stat-card">
            <span className="wfi-stat-label">Total Tasks</span>
            <span className="wfi-stat-value">{inst.tasks.length}</span>
          </div>
          <div className="wfi-stat-card">
            <span className="wfi-stat-label">Pending</span>
            <span className="wfi-stat-value" style={{ color: pendingTasks.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {pendingTasks.length}
            </span>
          </div>
          <div className="wfi-stat-card">
            <span className="wfi-stat-label">Progress</span>
            <span className="wfi-stat-value">{progress}%</span>
          </div>
          <div className="wfi-stat-card">
            <span className="wfi-stat-label">Initiated By</span>
            <span className="wfi-stat-value text-small">
              {inst.initiator?.profile
                ? `${inst.initiator.profile.firstName} ${inst.initiator.profile.lastName}`
                : 'Unknown'}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="wfi-progress-bar-track">
          <div className="wfi-progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Cancel Reason Display */}
      {inst.status === 'cancelled' && inst.cancelReason && (
        <div className="wf-cancel-reason-display" style={{ marginBottom: 16 }}>
          <span>💬 <strong>Cancel reason:</strong> {inst.cancelReason}</span>
        </div>
      )}

      {/* Current Node Indicator */}
      {inst.status === 'running' && inst.currentNodeIds.length > 0 && (
        <div className="wfi-current-nodes">
          <span className="text-small text-muted"><Timer size={14} /> Current position:</span>
          {inst.currentNodeIds.map(nodeId => {
            const node = inst.definition.graph.nodes.find(n => n.id === nodeId);
            return (
              <span key={nodeId} className="wfi-node-chip">
                {node?.data?.name || nodeId}
              </span>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${activeSection === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveSection('tasks')}>
          Tasks ({inst.tasks.length})
        </button>
        <button className={`tab ${activeSection === 'history' ? 'active' : ''}`}
          onClick={() => setActiveSection('history')}>
          History ({inst.history.length})
        </button>
        <button className={`tab ${activeSection === 'context' ? 'active' : ''}`}
          onClick={() => setActiveSection('context')}>
          Context Data
        </button>
      </div>

      {/* Tasks Section */}
      {activeSection === 'tasks' && (
        <div className="wfi-section">
          {inst.tasks.length === 0 ? (
            <div className="info-card" style={{ textAlign: 'center', padding: 30 }}>
              <p className="text-muted">No tasks generated yet.</p>
            </div>
          ) : (
            <div className="wfi-tasks-grid">
              {inst.tasks.map(t => <TaskCard key={t.id} task={t} />)}
            </div>
          )}
        </div>
      )}

      {/* History Section */}
      {activeSection === 'history' && (
        <div className="wfi-section">
          <div className="wfi-timeline">
            {inst.history.map((h, i) => {
              const prf = h.performer?.profile;
              const actionColors: Record<string, string> = {
                started: 'var(--info, #3b82f6)',
                approved: 'var(--success)',
                rejected: 'var(--error)',
                delegated: 'var(--warning)',
                sla_breach: 'var(--error)',
                delayed: 'var(--warning)',
                delay_resumed: 'var(--info, #3b82f6)',
                completed: 'var(--success)',
                cancelled: 'var(--error)',
              };
              const dotColor = actionColors[h.action] || 'var(--text-tertiary)';

              return (
                <div key={h.id} className="wfi-timeline-item">
                  <div className="wfi-timeline-line-wrapper">
                    <div className="wfi-timeline-dot" style={{ background: dotColor }} />
                    {i < inst.history.length - 1 && <div className="wfi-timeline-line" />}
                  </div>
                  <div className="wfi-timeline-content">
                    <div className="wfi-timeline-header">
                      <span className="wfi-timeline-action">{h.action}</span>
                      <span className="text-muted text-small">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-small">
                      <User size={12} /> {prf ? `${prf.firstName} ${prf.lastName}` : 'System'}
                    </span>
                    {h.comments && (
                      <span className="text-small text-muted wfi-timeline-comment">
                        "{h.comments}"
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Context Section */}
      {activeSection === 'context' && (
        <div className="wfi-section">
          <div className="wfi-context-grid">
            {Object.entries(inst.context).map(([key, val]) => (
              <div key={key} className="wfi-context-item">
                <span className="wfi-context-key">{formatLabel(key)}</span>
                <span className="wfi-context-value">{formatContextValue(val)}</span>
              </div>
            ))}
            {Object.keys(inst.context).length === 0 && (
              <p className="text-muted">No context data.</p>
            )}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="modal-overlay">
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>Cancel Workflow</h2>
              <button className="btn-icon" onClick={() => setCancelModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="cancel-modal-info">
                <p>You are about to cancel <strong>{inst.definition.name}</strong>.</p>
                <p className="text-muted text-small">This action cannot be undone.</p>
              </div>
              <div className="form-group">
                <label>Reason for cancellation *</label>
                <textarea className="input-full" rows={3} value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Duplicate request, requirements changed…" />
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setCancelModal(false)}>Close</button>
                <button className="btn btn-danger" disabled={!cancelReason.trim()} onClick={handleCancel}>
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Task Card ────────────────────────────── */

function TaskCard({ task: t }: { task: WorkflowTask }) {
  const assignee = t.assignee?.profile;
  const delegatee = t.delegatee?.profile;
  const escalator = t.escalator?.profile;
  const slaMinutes = t.minutesUntilSla;
  const slaBreached = t.slaBreached || (slaMinutes !== null && slaMinutes <= 0);
  const slaUrgent = slaMinutes !== null && slaMinutes < 120 && slaMinutes > 0;

  return (
    <div className={`wfi-task-card ${slaBreached ? 'sla-breached' : ''}`}>
      <div className="wfi-task-card-header">
        <span className={`status-badge ${t.status === 'pending' ? 'active' : t.status === 'approved' ? 'active' : 'danger'}`}>
          {t.status}
        </span>
        {t.slaDueAt && t.status === 'pending' && (
          <span className={`sla-chip ${slaBreached ? 'breached' : slaUrgent ? 'urgent' : t.remindedAt ? 'reminded' : 'normal'}`}>
            {slaBreached
              ? (t.escalatedAt ? '🔺 Escalated' : '⚠️ Breached')
              : slaUrgent
                ? `⏰ ${slaMinutes}m`
                : `⏳ ${Math.round((slaMinutes ?? 0) / 60)}h`}
          </span>
        )}
      </div>
      <h4 className="wfi-task-title">{t.title}</h4>
      <div className="wfi-task-details">
        <div className="wfi-task-detail-row">
          <User size={13} />
          <span>{assignee ? `${assignee.firstName} ${assignee.lastName}` : 'Unassigned'}</span>
        </div>
        {delegatee && (
          <div className="wfi-task-detail-row">
            <ArrowRightLeft size={13} />
            <span>→ {delegatee.firstName} {delegatee.lastName}</span>
          </div>
        )}
        {escalator && t.escalatedAt && (
          <div className="wfi-task-detail-row" style={{ color: 'var(--error)' }}>
            <AlertTriangle size={13} />
            <span>→ {escalator.firstName} {escalator.lastName}</span>
          </div>
        )}
      </div>
      {t.comments && (
        <div className="wfi-task-comment">"{t.comments}"</div>
      )}
      <div className="wfi-task-footer">
        <span className="text-small text-muted">
          {t.completedAt
            ? `Completed ${new Date(t.completedAt).toLocaleString()}`
            : `Created ${new Date(t.createdAt).toLocaleString()}`}
        </span>
      </div>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────── */

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function formatContextValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value >= 1000 ? value.toLocaleString() : String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return value;
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
