import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState } from 'react';
import { Layers, Search, X, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  useGetCostCentersQuery,
  useCreateCostCenterMutation,
  useUpdateCostCenterMutation,
  useDeleteCostCenterMutation,
  type CostCenter,
} from '../../../store/api/glApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import toast from 'react-hot-toast';
import './GLPage.css';

export default function CostCentersPage() {
  const propertyId = useSelectedPropertyId();
  const { data: costCenters = [], isLoading } = useGetCostCentersQuery(
    propertyId ? { propertyId } : undefined
  );
  const [createCostCenter] = useCreateCostCenterMutation();
  const [updateCostCenter] = useUpdateCostCenterMutation();
  const [deleteCostCenter] = useDeleteCostCenterMutation();
  const confirmDialog = useConfirm();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CostCenter | null>(null);

  const filtered = costCenters.filter((cc) => {
    if (statusFilter === 'active' && !cc.isActive) return false;
    if (statusFilter === 'inactive' && cc.isActive) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        cc.code.toLowerCase().includes(q) ||
        cc.name.toLowerCase().includes(q) ||
        (cc.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDelete = async (cc: CostCenter) => {
    const ok = await confirmDialog(
      `Delete Cost Center "${cc.code} — ${cc.name}"?`,
      { danger: true, confirmText: 'Delete' }
    );
    if (!ok) return;
    try {
      await deleteCostCenter(cc.id).unwrap();
      toast.success('Cost Center deleted');
    } catch (err: any) {
      toast.error(err.data?.errors?.[0]?.message || 'Failed to delete Cost Center');
    }
  };

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Layers size={22} />
          </div>
          <div>
            <h1>Cost Centers</h1>
            <p>{costCenters.length} total cost centers for financial tracking & GL</p>
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
            <Plus size={16} /> Add Cost Center
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
        <TableSkeleton columns={6} rows={6} />
      ) : (
        <div className="gl-table-wrap">
          <table className="gl-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Code</th>
                <th>Cost Center Name</th>
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
                    No cost centers found. Click &ldquo;+ Add Cost Center&rdquo; to get started.
                  </td>
                </tr>
              ) : (
                filtered.map((cc) => (
                  <tr key={cc.id}>
                    <td>
                      <span className="coa-code">{cc.code}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{cc.name}</td>
                    <td style={{ color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cc.description || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="gl-badge" style={{ background: 'rgba(16, 185, 129, 0.14)', color: '#34d399' }}>
                        {cc._count?.glAccounts ?? 0}
                      </span>
                    </td>
                    <td>
                      <span className={`gl-badge ${cc.isActive ? 'open' : 'closed'}`}>
                        {cc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <PermissionGuard permission="finance-coa.write">
                        <button
                          className="btn-icon"
                          title="Edit"
                          onClick={() => {
                            setEditingItem(cc);
                            setShowModal(true);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-icon"
                          title="Delete"
                          onClick={() => handleDelete(cc)}
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
        <CostCenterModal
          item={editingItem}
          propertyId={propertyId || undefined}
          onClose={() => setShowModal(false)}
          onCreate={createCostCenter}
          onUpdate={updateCostCenter}
        />
      )}
    </div>
  );
}

function CostCenterModal({
  item,
  propertyId,
  onClose,
  onCreate,
  onUpdate,
}: {
  item: CostCenter | null;
  propertyId?: string;
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
      const payload = {
        ...(propertyId ? { propertyId } : {}),
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (isEdit) {
        await onUpdate({ id: item.id, data: payload }).unwrap();
        toast.success('Cost Center updated');
      } else {
        await onCreate(payload).unwrap();
        toast.success('Cost Center created');
      }
      onClose();
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || err.data?.message || 'Error saving Cost Center');
    }
  };

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? 'Edit Cost Center' : 'New Cost Center'}</h3>
        <form onSubmit={handleSubmit} noValidate>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>
                Cost Center Code <span className="req">*</span>
              </label>
              <input
                className={hasAttemptedSubmit && !form.code.trim() ? 'gl-input-error' : ''}
                placeholder="e.g. CC-101"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              {hasAttemptedSubmit && !form.code.trim() && (
                <span className="gl-error-text">Cost center code is required</span>
              )}
            </div>
            <div className="gl-form-group">
              <label>
                Cost Center Name <span className="req">*</span>
              </label>
              <input
                className={hasAttemptedSubmit && !form.name.trim() ? 'gl-input-error' : ''}
                placeholder="e.g. General Property Operations"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {hasAttemptedSubmit && !form.name.trim() && (
                <span className="gl-error-text">Cost center name is required</span>
              )}
            </div>
          </div>

          <div className="gl-form-group">
            <label>Description</label>
            <textarea
              rows={2}
              placeholder="Optional description of this cost center…"
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
