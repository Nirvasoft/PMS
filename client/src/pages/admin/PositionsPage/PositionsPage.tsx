import { useState } from 'react';
import { useGetPositionsQuery, useCreatePositionMutation, useDeletePositionMutation, useGetDepartmentTreeQuery } from '../../../store/api/usersApi';
import { Briefcase, Trash2, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PositionsPage() {
  const { data, isLoading } = useGetPositionsQuery();
  const { data: deptData } = useGetDepartmentTreeQuery();
  const [createPosition] = useCreatePositionMutation();
  const [deletePosition] = useDeletePositionMutation();
  const positions = data?.data || [];
  const departments = deptData?.data || [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', level: 1, departmentId: '', canApprove: false, approvalLimit: '' });

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
    if (!confirm(`Delete position "${name}"?`)) return;
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
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Position
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="info-card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', padding: 16, marginBottom: 16 }}>
          <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
            <label>Position Name *</label>
            <input className="input-full" required value={form.name} placeholder="e.g. Senior Manager"
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group" style={{ width: 100 }}>
            <label>Level</label>
            <input type="number" className="input-full" min={1} max={20} value={form.level}
              onChange={e => setForm({ ...form, level: +e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
            <label>Department (optional)</label>
            <select className="input-full" value={form.departmentId}
              onChange={e => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">— All Departments —</option>
              {flatDepts.map(d => (
                <option key={d.id} value={d.id}>{'  '.repeat(d.depth) + d.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 24 }}>
            <input type="checkbox" id="canApprove" checked={form.canApprove}
              onChange={e => setForm({ ...form, canApprove: e.target.checked })} />
            <label htmlFor="canApprove" style={{ margin: 0 }}>Can Approve</label>
          </div>
          {form.canApprove && (
            <div className="form-group" style={{ width: 140 }}>
              <label>Approval Limit</label>
              <input type="number" className="input-full" min={0} step="0.01" placeholder="No limit"
                value={form.approvalLimit}
                onChange={e => setForm({ ...form, approvalLimit: e.target.value })} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary">Create</button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
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
              {positions.map(p => (
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
                    <button className="btn-icon btn-danger" onClick={() => handleDelete(p.id, p.name)}>
                      <Trash2 size={14} />
                    </button>
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
