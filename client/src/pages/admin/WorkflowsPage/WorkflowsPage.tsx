import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  useGetDefinitionsQuery, useCreateDefinitionMutation, usePublishDefinitionMutation,
  useDeprecateDefinitionMutation, useDeleteDefinitionMutation,
  useGetInstancesQuery, useCancelInstanceMutation, useGetInstanceQuery,
  useStartInstanceMutation,
  type WorkflowDefinition, type WorkflowInstance,
} from '../../../store/api/workflowApi';
import WorkflowEditor from './WorkflowEditor';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import {
  Settings, Layers, RefreshCw, Plus, Palette, Eye, Pencil,
  Rocket, Play, ArchiveX, Trash2,
} from 'lucide-react';

type Tab = 'definitions' | 'instances';

export default function WorkflowsPage() {
  const [tab, setTab] = useState<Tab>('definitions');

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><Settings size={24} /> Workflow Engine</h1>
            <p className="text-secondary">Define approval workflows and monitor running instances</p>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'definitions' ? 'active' : ''}`} onClick={() => setTab('definitions')}>
          <Layers size={15} /> Definitions
        </button>
        <button className={`tab ${tab === 'instances' ? 'active' : ''}`} onClick={() => setTab('instances')}>
          <RefreshCw size={15} /> Instances
        </button>
      </div>

      <div className="tab-content">
        {tab === 'definitions' && <DefinitionsTab />}
        {tab === 'instances' && <InstancesTab />}
      </div>
    </div>
  );
}

/* ─── Definitions Tab ──────────────────────── */

function DefinitionsTab() {
  const navigate = useNavigate();
  const { data, isLoading } = useGetDefinitionsQuery();
  const [publishDef] = usePublishDefinitionMutation();
  const [deprecateDef] = useDeprecateDefinitionMutation();
  const [deleteDef] = useDeleteDefinitionMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [startDef, setStartDef] = useState<WorkflowDefinition | null>(null);
  const [editDef, setEditDef] = useState<WorkflowDefinition | null>(null);
  const confirmDialog = useConfirm();
  const defs = data?.data ?? [];

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      <div className="users-toolbar">
        <span className="users-count-badge">{defs.length} workflow{defs.length !== 1 ? 's' : ''}</span>
        <div style={{ marginLeft: 'auto' }}>
          <PermissionGuard permission="workflows-engine.write">
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New Workflow
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="audit-table-container">
        <table className="audit-table" id="wf-defs-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Entity Type</th>
              <th>Ver.</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Instances</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {defs.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="wf-def-name">
                    <strong>{d.name}</strong>
                    {d.description && <span className="text-muted text-small">{d.description}</span>}
                  </div>
                </td>
                <td><span className="role-chip">{d.entityType}</span></td>
                <td>v{d.version}</td>
                <td>
                  <span className={`status-badge ${d.status === 'active' ? 'active' : d.status === 'draft' ? 'pending' : 'inactive'}`}>
                    {d.status}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>{d._count.instances}</td>
                <td>
                  <div className="wf-def-actions">
                    <button className="btn-icon" title="Visual Designer"
                      onClick={() => navigate(`/admin/workflows/${d.id}/design`)}>
                      <Palette size={15} />
                    </button>
                    {d.status === 'draft' ? (
                      <PermissionGuard permission="workflows-engine.write">
                        <button className="btn-icon" title="Edit" onClick={() => setEditDef(d)}>
                          <Pencil size={15} />
                        </button>
                      </PermissionGuard>
                    ) : (
                      <button className="btn-icon" title="View" onClick={() => setEditDef(d)}>
                        <Eye size={15} />
                      </button>
                    )}
                    {d.status === 'draft' && (
                      <PermissionGuard permission="workflows-engine.write">
                        <button className="btn-icon" title="Publish" style={{ color: 'var(--success)' }}
                          onClick={async () => {
                            try { await publishDef(d.id).unwrap(); toast.success('Published!'); }
                            catch (e: unknown) { const err = e as { data?: { errors?: { message: string }[] } }; toast.error(err.data?.errors?.[0]?.message || 'Validation failed'); }
                          }}><Rocket size={15} /></button>
                        <button className="btn-icon btn-danger" title="Delete"
                          onClick={async () => {
                            if (!(await confirmDialog(`Delete "${d.name}"?`, { danger: true, confirmText: 'Delete' }))) return;
                            try { await deleteDef(d.id).unwrap(); toast.success('Deleted'); }
                            catch { toast.error('Cannot delete'); }
                          }}><Trash2 size={15} /></button>
                      </PermissionGuard>
                    )}
                    {d.status === 'active' && (
                      <PermissionGuard permission="workflows-engine.write">
                        <button className="btn-icon" title="Run Instance" style={{ color: 'var(--success)' }}
                          onClick={() => setStartDef(d)}><Play size={15} /></button>
                        <button className="btn-icon" title="Deprecate"
                          onClick={async () => {
                            await deprecateDef(d.id).unwrap(); toast.success('Deprecated');
                          }}><ArchiveX size={15} /></button>
                      </PermissionGuard>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {defs.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }} className="text-muted">No workflow definitions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateWorkflowModal onClose={() => setShowCreate(false)} />}
      {startDef && <StartInstanceModal definition={startDef} onClose={() => setStartDef(null)} />}
      {editDef && <WorkflowEditor definition={editDef} onClose={() => setEditDef(null)} />}
    </>
  );
}

/* ─── Instances Tab ────────────────────────── */

function InstancesTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{ id: string; name: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const params: Record<string, string> = { page: String(page), limit: '15' };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading } = useGetInstancesQuery(params);
  const [cancelInstance] = useCancelInstanceMutation();
  const instances = data?.data ?? [];
  const meta = data?.meta;

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      <div className="toolbar">
        <select className="input-full" style={{ maxWidth: 180 }} value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="running">Running</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="text-secondary">{meta?.total ?? 0} instance(s)</span>
      </div>

      <div className="wf-instances-list">
        {instances.map((inst) => (
          <div key={inst.id} className={`wf-instance-card ${selectedId === inst.id ? 'selected' : ''}`}
            onClick={() => setSelectedId(selectedId === inst.id ? null : inst.id)}>
            <div className="wf-instance-header">
              <div className="wf-instance-info">
                <strong>{inst.definition.name}</strong>
                <span className="role-chip">{inst.entityType}</span>
              </div>
              <span className={`status-badge ${inst.status === 'running' ? 'active' : inst.status === 'approved' ? 'active' : inst.status === 'rejected' ? 'danger' : 'inactive'}`}>
                {inst.status}
              </span>
            </div>
            <div className="wf-instance-meta">
              <span className="text-muted text-small">
                Started {new Date(inst.startedAt).toLocaleString()} by {inst.initiator?.profile ? `${inst.initiator.profile.firstName} ${inst.initiator.profile.lastName}` : 'Unknown'}
              </span>
              <span className="text-muted text-small">Tasks: {inst._count?.tasks ?? '?'}</span>
            </div>
            {inst.status === 'cancelled' && inst.cancelReason && (
              <div className="wf-instance-cancel-reason">
                <span className="text-small text-muted">💬 {inst.cancelReason}</span>
              </div>
            )}
            {inst.status === 'running' && (
              <div className="wf-instance-actions" onClick={(e) => e.stopPropagation()}>
                <Link to={`/admin/workflows/instances/${inst.id}`} className="btn btn-sm">
                  View
                </Link>
                <PermissionGuard permission="workflows-engine.write">
                  <button className="btn btn-sm btn-danger" onClick={() => {
                    setCancelModal({ id: inst.id, name: inst.definition.name });
                    setCancelReason('');
                  }}>Cancel</button>
                </PermissionGuard>
              </div>
            )}
            {inst.status !== 'running' && (
              <div className="wf-instance-actions" onClick={(e) => e.stopPropagation()}>
                <Link to={`/admin/workflows/instances/${inst.id}`} className="btn btn-sm">
                  View
                </Link>
              </div>
            )}
          </div>
        ))}
        {instances.length === 0 && (
          <div className="info-card" style={{ textAlign: 'center', padding: 40 }}>
            <p className="text-muted">No workflow instances found.</p>
          </div>
        )}
      </div>

      {selectedId && <InstanceDetail id={selectedId} onClose={() => setSelectedId(null)} />}

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="text-secondary">Page {meta.page} of {meta.totalPages}</span>
          <button className="btn btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {/* Cancel Instance Modal */}
      {cancelModal && (
        <div className="modal-overlay">
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>Cancel Workflow</h2>
              <button className="btn-icon" onClick={() => setCancelModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="cancel-modal-info">
                <p>You are about to cancel <strong>{cancelModal.name}</strong>.</p>
                <p className="text-muted text-small">This action cannot be undone. All pending tasks will be terminated.</p>
              </div>
              <div className="form-group">
                <label>Reason for cancellation *</label>
                <textarea
                  className="input-full"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Duplicate request, requirements changed, submitted in error…"
                />
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setCancelModal(null)}>Close</button>
                <button
                  className="btn btn-danger"
                  disabled={!cancelReason.trim()}
                  onClick={async () => {
                    try {
                      await cancelInstance({ id: cancelModal.id, reason: cancelReason.trim() }).unwrap();
                      toast.success('Workflow cancelled');
                      setCancelModal(null);
                      setCancelReason('');
                    } catch {
                      toast.error('Failed to cancel');
                    }
                  }}
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Instance Detail ──────────────────────── */

function InstanceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useGetInstanceQuery(id);
  const inst = data?.data;

  if (isLoading || !inst) return null;

  return (
    <div className="wf-detail-panel">
      <div className="wf-detail-header">
        <h3>Instance Detail</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to={`/admin/workflows/instances/${id}`} className="btn btn-sm">
            Open Full Page →
          </Link>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="wf-detail-section">
        <h4>Status</h4>
        <span className={`status-badge ${inst.status === 'running' ? 'active' : inst.status === 'approved' ? 'active' : 'danger'}`}>
          {inst.status}
        </span>
        <span className="text-small text-muted" style={{ marginLeft: 8 }}>
          Current: {inst.currentNodeIds.join(', ')}
        </span>
        {inst.status === 'cancelled' && inst.cancelReason && (
          <div className="wf-cancel-reason-display">
            <span className="text-small">💬 <strong>Cancel reason:</strong> {inst.cancelReason}</span>
          </div>
        )}
      </div>

      <div className="wf-detail-section">
        <h4>Tasks ({inst.tasks.length})</h4>
        {inst.tasks.map((t) => {
          const nm = t.assignee?.profile;
          const escNm = t.escalator?.profile;
          return (
            <div key={t.id} className={`wf-task-item ${t.slaBreached ? 'sla-breached' : ''}`}>
              <div className="wf-task-item-row">
                <span className={`status-badge ${t.status === 'pending' ? 'active' : t.status === 'approved' ? 'active' : 'danger'}`}>
                  {t.status}
                </span>
                <span><strong>{t.title}</strong></span>
                <span className="text-muted text-small">
                  → {nm ? `${nm.firstName} ${nm.lastName}` : 'Unassigned'}
                </span>
              </div>
              {t.slaBreached && (
                <div className="wf-task-sla-info">
                  <span className="sla-chip breached">
                    {t.escalatedAt ? '🔺 Escalated' : '⚠️ SLA Breached'}
                  </span>
                  {escNm && (
                    <span className="text-small text-muted">
                      → Escalated to <strong>{escNm.firstName} {escNm.lastName}</strong>
                      {t.escalatedAt && ` · ${new Date(t.escalatedAt).toLocaleString()}`}
                    </span>
                  )}
                </div>
              )}
              {t.slaDueAt && !t.slaBreached && t.status === 'pending' && (
                <div className="wf-task-sla-info">
                  <span className={`sla-chip ${t.remindedAt ? 'reminded' : 'normal'}`}>
                    ⏳ Due: {new Date(t.slaDueAt).toLocaleString()}
                  </span>
                </div>
              )}
              {t.comments && <span className="text-small text-muted">"{t.comments}"</span>}
            </div>
          );
        })}
      </div>

      <div className="wf-detail-section">
        <h4>History ({inst.history.length})</h4>
        <div className="wf-timeline">
          {inst.history.map((h) => {
            const prf = h.performer?.profile;
            return (
              <div key={h.id} className="wf-timeline-item">
                <div className="wf-timeline-dot" data-action={h.action} />
                <div className="wf-timeline-content">
                  <span className="wf-timeline-action">{h.action}</span>
                  <span className="text-muted text-small">
                    {prf ? `${prf.firstName} ${prf.lastName}` : 'System'} · {new Date(h.createdAt).toLocaleString()}
                  </span>
                  {h.comments && <span className="text-small">"{h.comments}"</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Create Workflow Modal ────────────────── */

const ENTITY_TYPES = [
  { value: 'lease', label: 'Lease' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'maintenance_ticket', label: 'Maintenance Ticket' },
  { value: 'move_in', label: 'Move In' },
  { value: 'move_out', label: 'Move Out' },
];

function CreateWorkflowModal({ onClose }: { onClose: () => void }) {
  const [createDef, { isLoading }] = useCreateDefinitionMutation();
  const [form, setForm] = useState({
    name: '', description: '', entityType: 'lease',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Create with a simple start → approval → end graph
      const graph = {
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'approval_1', type: 'approval', data: {
            name: 'Manager Approval',
            assignTo: 'initiator',
            sla: { hours: 24 },
            allowDelegate: true,
          }},
          { id: 'end', type: 'end' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'approval_1' },
          { id: 'e2', source: 'approval_1', target: 'end' },
        ],
      };
      await createDef({ ...form, graph }).unwrap();
      toast.success('Workflow created as draft');
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Workflow</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleCreate} className="modal-body">
          <div className="form-group">
            <label>Name *</label>
            <input className="input-full" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Invoice Approval" />
          </div>
          <div className="form-group">
            <label>Entity Type *</label>
            <select className="input-full" value={form.entityType}
              onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
              {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <input className="input-full" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="info-card" style={{ marginTop: 8 }}>
            <p className="text-small text-muted">
              💡 A default graph (Start → Manager Approval → End) will be created.
              Edit the JSON graph via the API to customize the workflow before publishing.
            </p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Start Instance Modal ─────────────────── */

function StartInstanceModal({ definition, onClose }: { definition: WorkflowDefinition; onClose: () => void }) {
  const [startInstance, { isLoading }] = useStartInstanceMutation();
  const [form, setForm] = useState({
    entityId: '',
    contextJson: JSON.stringify({
      tenantName: 'Example Corp',
      unitCode: 'A-101',
      rentAmount: 25000,
    }, null, 2),
  });
  const [error, setError] = useState('');

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let context: Record<string, unknown> = {};
    try {
      context = JSON.parse(form.contextJson);
    } catch {
      setError('Invalid JSON in context'); return;
    }
    try {
      const result = await startInstance({
        definitionId: definition.id,
        entityType: definition.entityType,
        entityId: form.entityId || `test-${definition.entityType}-${Date.now()}`,
        context,
      }).unwrap();
      toast.success(`Workflow started! Instance: ${result.data.id.slice(0, 8)}...`);
      onClose();
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      setError(e.data?.errors?.[0]?.message || 'Failed to start workflow');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2>▶ Start Workflow</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleStart} className="modal-body">
          <div className="info-card" style={{ marginBottom: 16 }}>
            <p className="text-small">
              <strong>{definition.name}</strong> (v{definition.version})
              <br />
              Entity type: <span className="role-chip">{definition.entityType}</span>
              <br />
              Nodes: {definition.graph.nodes.map(n => `${n.type}${n.data?.name ? ` (${n.data.name})` : ''}`).join(' → ')}
            </p>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

          <div className="form-group">
            <label>Entity ID <span className="text-muted text-small">(leave blank for auto-generated)</span></label>
            <input className="input-full" value={form.entityId} placeholder={`e.g. ${definition.entityType}-001`}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })} />
          </div>

          <div className="form-group">
            <label>Context / Entity Snapshot (JSON) *</label>
            <textarea className="input-full" rows={8} required value={form.contextJson}
              onChange={(e) => setForm({ ...form, contextJson: e.target.value })}
              style={{ fontFamily: 'monospace', fontSize: 13 }} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-success" disabled={isLoading}>
              {isLoading ? '⏳ Starting...' : '▶ Start Instance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
