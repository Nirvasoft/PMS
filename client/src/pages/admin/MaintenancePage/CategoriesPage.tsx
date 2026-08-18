import './MaintenancePage.css';
import { useState } from 'react';
import {
  useGetCategoriesQuery, useCreateCategoryMutation,
  useUpdateCategoryMutation, useDeleteCategoryMutation,
} from '../../../store/api/maintenanceApi';
import type { MaintenanceCategory } from '../../../store/api/maintenanceApi';
import {
  Tags, Plus, Loader2, XCircle, Pencil, Trash2, Lock,
  Droplet, Zap, Thermometer, ArrowUpDown, Building, Bug,
  Sparkles, Shield, Microwave, Wifi, Armchair, Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';

// Map icon string names to Lucide components
const ICON_MAP: Record<string, React.ReactNode> = {
  droplet: <Droplet size={16} />,
  zap: <Zap size={16} />,
  thermometer: <Thermometer size={16} />,
  'arrow-up-down': <ArrowUpDown size={16} />,
  building: <Building size={16} />,
  bug: <Bug size={16} />,
  sparkles: <Sparkles size={16} />,
  shield: <Shield size={16} />,
  microwave: <Microwave size={16} />,
  wifi: <Wifi size={16} />,
  armchair: <Armchair size={16} />,
  wrench: <Wrench size={16} />,
  tags: <Tags size={16} />,
};

const ICON_OPTIONS = [
  'droplet', 'zap', 'thermometer', 'arrow-up-down', 'building', 'bug',
  'sparkles', 'shield', 'microwave', 'wifi', 'armchair', 'wrench', 'tags',
];

export default function CategoriesPage() {
  const confirmDialog = useConfirm();
  const { data: categoriesData, isLoading } = useGetCategoriesQuery();
  const [deleteCategory] = useDeleteCategoryMutation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editCategory, setEditCategory] = useState<MaintenanceCategory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categories = categoriesData?.data || [];

  const handleDelete = async (cat: MaintenanceCategory) => {
    const ticketCount = cat._count?.tickets || 0;
    const msg = ticketCount > 0
      ? `"${cat.name}" has ${ticketCount} ticket(s). It will be deactivated instead of deleted. Continue?`
      : `Delete category "${cat.name}"?`;
    if (!(await confirmDialog(msg, { danger: true, confirmText: 'Delete' }))) return;

    setDeletingId(cat.id);
    try {
      await deleteCategory(cat.id).unwrap();
      toast.success(ticketCount > 0 ? 'Category deactivated' : 'Category deleted');
    } catch (err: any) {
      toast.error(err?.data?.message || err?.data?.errors?.[0]?.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Tags size={22} /></div>
          <div>
            <h1>Maintenance Categories</h1>
            <p>Manage ticket categories for your maintenance operations</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Add Category
          </button>
        </div>
      </div>

      {/* Categories Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : categories.length === 0 ? (
        <div className="maint-empty">
          <div className="empty-icon"><Tags size={28} /></div>
          <p>No categories found</p>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Create First Category
          </button>
        </div>
      ) : (
        <div className="maint-table-wrap">
          <table className="maint-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Name</th>
                <th>Description</th>
                <th className="text-center">Tickets</th>
                <th>Type</th>
                <th style={{ width: 80, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const isSystem = cat.companyId === null;
                return (
                  <tr key={cat.id} className={isSystem ? 'cat-row-system' : ''}>
                    <td className="text-center">
                      <span className="cat-icon-cell">
                        {cat.icon && ICON_MAP[cat.icon] ? ICON_MAP[cat.icon] : <Tags size={16} />}
                      </span>
                    </td>
                    <td>
                      <span className="cat-name">{cat.name}</span>
                      {cat.children.length > 0 && (
                        <span className="cat-children-count">
                          {cat.children.length} sub
                        </span>
                      )}
                    </td>
                    <td><span className="cell-secondary">{cat.description || '—'}</span></td>
                    <td className="text-center">
                      <span className="cat-ticket-count">{cat._count?.tickets || 0}</span>
                    </td>
                    <td>
                      {isSystem ? (
                        <span className="cat-type-badge system"><Lock size={10} /> System</span>
                      ) : (
                        <span className="cat-type-badge custom">Custom</span>
                      )}
                    </td>
                    <td>
                      {isSystem ? (
                        <div className="sla-row-actions">
                          <span className="cell-secondary" title="System categories cannot be modified" style={{ fontSize: 11 }}>—</span>
                        </div>
                      ) : (
                        <div className="sla-row-actions">
                          <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEditCategory(cat)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-danger-ghost"
                            title="Delete"
                            disabled={deletingId === cat.id}
                            onClick={() => handleDelete(cat)}
                          >
                            {deletingId === cat.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CategoryModal mode="create" onClose={() => setShowCreateModal(false)} />
      )}

      {editCategory && (
        <CategoryModal mode="edit" initialData={editCategory} onClose={() => setEditCategory(null)} />
      )}
    </div>
  );
}

// ── Category Create/Edit Modal ────────────────
function CategoryModal({ mode, initialData, onClose }: {
  mode: 'create' | 'edit';
  initialData?: MaintenanceCategory;
  onClose: () => void;
}) {
  const [createCategory, { isLoading: isCreating }] = useCreateCategoryMutation();
  const [updateCategory, { isLoading: isUpdating }] = useUpdateCategoryMutation();
  const isEdit = mode === 'edit';
  const isLoading = isCreating || isUpdating;

  const [form, setForm] = useState({
    name: initialData?.name || '',
    icon: initialData?.icon || '',
    description: initialData?.description || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        icon: form.icon || undefined,
        description: form.description || undefined,
      };

      if (isEdit && initialData) {
        await updateCategory({ id: initialData.id, ...payload }).unwrap();
        toast.success('Category updated');
      } else {
        await createCategory(payload).unwrap();
        toast.success('Category created');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || `Failed to ${isEdit ? 'update' : 'create'}`);
    }
  };

  return (
    <div className="maint-modal-backdrop">
      <div className="maint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><Tags size={18} /></span>
            {isEdit ? 'Edit Category' : 'Create Category'}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Name <span style={{ color: '#f87171' }}>*</span></label>
              <input
                type="text" required maxLength={150}
                placeholder="e.g. Pool Maintenance"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Icon</label>
              <div className="cat-icon-picker">
                {ICON_OPTIONS.map((ico) => (
                  <button
                    key={ico} type="button"
                    className={`cat-icon-option ${form.icon === ico ? 'active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, icon: ico }))}
                    title={ico}
                  >
                    {ICON_MAP[ico] || <Tags size={16} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Description (optional)</label>
              <textarea
                rows={2} maxLength={500}
                placeholder="Brief description of this category"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : isEdit ? 'Update Category' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
