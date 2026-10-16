import { useState } from 'react';
import { GitBranch, Search, X, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  useGetDepartmentCentersQuery,
  useCreateDepartmentCenterMutation,
  useUpdateDepartmentCenterMutation,
  useDeleteDepartmentCenterMutation,
  type DepartmentCenter,
} from '../../../store/api/glApi';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import toast from 'react-hot-toast';
import './GLPage.css';

export default function DepartmentCentersPage() {
  const { data: departmentCenters = [], isLoading } = useGetDepartmentCentersQuery();
  const [createDepartmentCenter] = useCreateDepartmentCenterMutation();
  const [updateDepartmentCenter] = useUpdateDepartmentCenterMutation();
  const [deleteDepartmentCenter] = useDeleteDepartmentCenterMutation();
  const confirmDialog = useConfirm();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DepartmentCenter | null>(null);

  const filtered = departmentCenters.filter((dc) => {
    if (statusFilter === 'active' && !dc.isActive) return false;
    if (statusFilter === 'inactive' && dc.isActive) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        dc.code.toLowerCase().includes(q) ||
        dc.name.toLowerCase().includes(q) ||
        (dc.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDelete = async (dc: DepartmentCenter) => {
    const ok = await confirmDialog(
      `Delete Department Center "${dc.code} — ${dc.name}"?`,
      { danger: true, confirmText: 'Delete' }
    );
    if (!ok) return;
    try {
      await deleteDepartmentCenter(dc.id).unwrap();
      toast.success('Department Center deleted');
    } catch (err: any) {
      toast.error(err.data?.errors?.[0]?.message || 'Failed to delete Department Center');
    }
  };

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <GitBranch size={22} />
          </div>
          <div>
            <h1>Department Centers</h1>
            <p>{departmentCenters.length} total department centers for accounting & GL</p>
          </div>
        </div>
        <PermissionGuard permission="finance-coa.write">
          <button
            className="btn-primary"
            onClick={() => {
              setEditingItem(null);
              setShowModal(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> Add Department Center
          </button>
        </PermissionGuard>
      </div>

      <div className="gl-toolbar">
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search by code, name, or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 34, paddingRight: search ? 30 : 12, boxSizing: 'border-box' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading department centers…</p>
      ) : (
        <div className="gl-table-wrap">
          <table className="gl-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Code</th>
                <th>Department Center Name</th>
                <th>Description</th>
                <th style={{ width: 130, textAlign: 'center' }}>GL Accounts</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 110, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                    No department centers found. Click &ldquo;+ Add Department Center&rdquo; to get started.
                  </td>
                </tr>
              ) : (
                filtered.map((dc) => (
                  <tr key={dc.id}>
                    <td>
                      <span className="coa-code">{dc.code}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{dc.name}</td>
                    <td style={{ color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dc.description || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="gl-badge" style={{ background: 'rgba(16, 185, 129, 0.14)', color: '#34d399' }}>
                        {dc._count?.glAccounts ?? 0}
                      </span>
                    </td>
                    <td>
                      <span className={`gl-badge ${dc.isActive ? 'open' : 'closed'}`}>
                        {dc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <PermissionGuard permission="finance-coa.write">
                        <button
                          className="btn-icon"
                          title="Edit"
                          onClick={() => {
                            setEditingItem(dc);
                            setShowModal(true);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-icon"
                          title="Delete"
                          onClick={() => handleDelete(dc)}
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </PermissionGuard>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <DepartmentCenterModal
          item={editingItem}
          onClose={() => setShowModal(false)}
          onCreate={createDepartmentCenter}
          onUpdate={updateDepartmentCenter}
        />
      )}
    </div>
  );
}

function DepartmentCenterModal({
  item,
  onClose,
  onCreate,
  onUpdate,
}: {
  item: DepartmentCenter | null;
  onClose: () => void;
  onCreate: any;
  onUpdate: any;
}) {
  const isEdit = !!item;
  const alertDialog = useAlertDialog();
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [form, setForm] = useState({
    code: item?.code || '',
    name: item?.name || '',
    description: item?.description || '',
    sortOrder: item?.sortOrder ?? 0,
    isActive: item?.isActive ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!form.code.trim() || !form.name.trim()) return;
    try {
      if (isEdit) {
        await onUpdate({
          id: item.id,
          data: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            sortOrder: Number(form.sortOrder) || 0,
            isActive: form.isActive,
          },
        }).unwrap();
        toast.success('Department Center updated');
      } else {
        await onCreate({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
        }).unwrap();
        toast.success('Department Center created');
      }
      onClose();
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || err.data?.message || 'Error saving Department Center');
    }
  };

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? 'Edit Department Center' : 'New Department Center'}</h3>
        <form onSubmit={handleSubmit} noValidate>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>
                Department Center Code <span className="req">*</span>
              </label>
              <input
                className={hasAttemptedSubmit && !form.code.trim() ? 'gl-input-error' : ''}
                placeholder="e.g. DC-100"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              {hasAttemptedSubmit && !form.code.trim() && (
                <span className="gl-error-text">Department center code is required</span>
              )}
            </div>
            <div className="gl-form-group">
              <label>
                Department Center Name <span className="req">*</span>
              </label>
              <input
                className={hasAttemptedSubmit && !form.name.trim() ? 'gl-input-error' : ''}
                placeholder="e.g. Property Operations"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {hasAttemptedSubmit && !form.name.trim() && (
                <span className="gl-error-text">Department center name is required</span>
              )}
            </div>
          </div>

          <div className="gl-form-group">
            <label>Description</label>
            <textarea
              rows={2}
              placeholder="Optional description of this accounting department center…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            <div className="gl-form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 22 }}>
              <label style={{ marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          </div>

          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {isEdit ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
