import { useState, useEffect } from 'react';
import { useGetPositionsQuery, useCreatePositionMutation, useDeletePositionMutation, useGetDepartmentTreeQuery } from '../../../store/api/usersApi';
import { Briefcase, Trash2, Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const PAGE_SIZE = 10;

export default function PositionsPage() {
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetPositionsQuery();
  const { data: deptData } = useGetDepartmentTreeQuery();
  const [createPosition] = useCreatePositionMutation();
  const [deletePosition] = useDeletePositionMutation();
  const positions = data?.data || [];
  const departments = deptData?.data || [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', level: 1, departmentId: '', canApprove: false, approvalLimit: '' });

  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(positions.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pagedPositions = positions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPosition({
        name: form.name,
        level: form.level,
        ...(form.departmentId ? { departmentId: form.departmentId } : {}),
        canApprove: form.canApprove,
        ...(form.approvalLimit ? { approvalLimit: parseFloat(form.approvalLimit) } : {}),
      }).unwrap();
      toast.success('Position created!');
      setForm({ name: '', level: 1, departmentId: '', canApprove: false, approvalLimit: '' });
      setShowForm(false);
    } catch { toast.error('Failed to create position'); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete position "${name}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deletePosition(id).unwrap();
      toast.success('Position deleted');
    } catch { toast.error('Cannot delete — position may be in use'); }
  };

  // Flatten departments for select
  const flatDepts: { id: string; name: string; depth: number }[] = [];
  const flatten = (nodes: typeof departments, depth = 0) => {
    for (const n of nodes) {
      flatDepts.push({ id: n.id, name: n.name, depth });
      if (n.children) flatten(n.children, depth + 1);
    }
  };
  flatten(departments);

  if (isLoading) return <div className="page-content"><div className="loading-inline"><Loader2 size={20} className="spin" /> Loading positions...</div></div>;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Briefcase size={24} /> Positions</h1>
        <p className="text-muted">Manage organizational positions and job levels</p>
      </div>

      <div className="toolbar">
        <span className="text-secondary">{positions.length} position(s)</span>
        <PermissionGuard permission="positions.create">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> New Position
          </button>
        </PermissionGuard>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>New Position</h2>
              <button className="btn-icon" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-body">
              <div className="form-group">
                <label>Position Name *</label>
                <input className="input-full" required value={form.name} placeholder="e.g. Senior Manager"
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Level</label>
                <input type="number" className="input-full no-spinner" min={1} max={20} value={form.level}
                  onChange={e => setForm({ ...form, level: +e.target.value })} />
              </div>
              <div className="form-group">
                <label>Department (optional)</label>
                <select className="input-full" value={form.departmentId}
                  onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                  <option value="">— All Departments —</option>
                  {flatDepts.map(d => (
                    <option key={d.id} value={d.id}>{'  '.repeat(d.depth) + d.name}</option>
                  ))}
                </select>
              </div>
              {form.canApprove && (
                <div className="form-group">
                  <label>Approval Limit</label>
                  <input type="number" className="input-full no-spinner" min={0} step="0.01" placeholder="No limit"
                    value={form.approvalLimit}
                    onChange={e => setForm({ ...form, approvalLimit: e.target.value })} />
                </div>
              )}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <button type="button" className={`toggle-switch ${form.canApprove ? 'on' : ''}`}
                  onClick={() => setForm({ ...form, canApprove: !form.canApprove })}>
                  <span className="toggle-knob" />
                </button>
                <label style={{ margin: 0 }}>Can Approve</label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40 }}>
          <Briefcase size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p className="text-muted">No positions defined yet. Click "New Position" to create one.</p>
        </div>
      ) : (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Position Name</th>
                <th>Level</th>
                <th>Department</th>
                <th>Approval</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedPositions.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td><span className="role-chip">Level {p.level}</span></td>
                  <td className="text-muted">{p.departmentId ? flatDepts.find(d => d.id === p.departmentId)?.name || '—' : 'All'}</td>
                  <td>
                    {(p as Record<string, unknown>).canApprove ? (
                      <span className="status-badge active">
                        ✓ {(p as Record<string, unknown>).approvalLimit
                          ? `≤ ${Number((p as Record<string, unknown>).approvalLimit).toLocaleString()}`
                          : 'Unlimited'}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <PermissionGuard permission="positions.delete">
                      <button className="btn-danger" onClick={() => handleDelete(p.id, p.name)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </PermissionGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-muted text-small">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, positions.length)} of {positions.length}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={14} /> Previous
                </button>
                <span className="text-muted text-small">Page {page} of {totalPages}</span>
                <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
