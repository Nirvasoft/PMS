import { useState } from 'react';
import {
  useGetChargeCategoriesQuery, useCreateChargeCategoryMutation,
  useUpdateChargeCategoryMutation, useDeleteChargeCategoryMutation,
  type ChargeCategory,
} from '../../../store/api/billingApi';
import { Tag, Plus, X, Pencil, Trash2, Check, Lock } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './BillingPage.css';

export default function ChargeCategoriesPage() {
  const { data: categoriesData, isFetching } = useGetChargeCategoriesQuery();
  const [createChargeCategory, { isLoading: creating }] = useCreateChargeCategoryMutation();
  const [updateChargeCategory, { isLoading: updating }] = useUpdateChargeCategoryMutation();
  const [deleteChargeCategory] = useDeleteChargeCategoryMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();

  const categories = categoriesData?.data || [];

  const emptyForm = { code: '', description: '', monthly: false };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChargeCategory | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (cc: ChargeCategory) => {
    setEditing(cc);
    setForm({ code: cc.code, description: cc.description || '', monthly: cc.monthly });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      code: form.code.trim(),
      description: form.description || undefined,
      monthly: form.monthly,
    };
    try {
      if (editing) {
        await updateChargeCategory({ id: editing.id, data: payload }).unwrap();
      } else {
        await createChargeCategory(payload).unwrap();
      }
      closeForm();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || `Failed to ${editing ? 'update' : 'create'} charge category`);
    }
  };

  const handleDelete = async (cc: ChargeCategory) => {
    if (!(await confirmDialog(`Delete charge category "${cc.code}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteChargeCategory(cc.id).unwrap();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to delete charge category');
    }
  };

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
            <Tag size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Charge Categories</h1>
            <p>Define charge categories used to classify charge types</p>
          </div>
          <PermissionGuard permission="charge-category.create">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Charge Category
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Charge Categories Table */}
      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th className="text-center">Monthly</th>
              <th className="text-center">Charge Types</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && categories.length === 0 ? (
              <tr><td colSpan={5} className="billing-empty">Loading…</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan={5} className="billing-empty">No charge categories found</td></tr>
            ) : categories.map(cc => (
              <tr key={cc.id}>
                <td><span className="cell-mono">{cc.code}</span></td>
                <td>{cc.description || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                <td className="text-center">
                  {cc.monthly ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                      <Check size={13} />
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td className="text-center">
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{cc.chargeTypeCount}</span>
                </td>
                <td className="text-center">
                  {cc.isSystem ? (
                    <span title="System charge categories can't be edited" style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}>
                      <Lock size={14} />
                    </span>
                  ) : (
                    <>
                      <PermissionGuard permission="charge-category.update">
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(cc)}>
                          <Pencil size={14} />
                        </button>
                      </PermissionGuard>
                      <PermissionGuard permission="charge-category.delete">
                        <button className="btn-danger" title="Delete" onClick={() => handleDelete(cc)}>
                          <Trash2 size={14} />
                        </button>
                      </PermissionGuard>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Tag size={18} /> {editing ? 'Edit Charge Category' : 'New Charge Category'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>
                  <div className="inv-field">
                    <label>Code <span className="req">*</span></label>
                    <input required placeholder="e.g. utility" value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Description</label>
                    <input placeholder="e.g. Utility-related charges" value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.monthly}
                      onChange={e => setForm({ ...form, monthly: e.target.checked })}
                      style={{ accentColor: 'var(--primary)' }} />
                    Monthly
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <PermissionGuard permission={editing ? 'charge-category.update' : 'charge-category.create'}>
                  <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                    {creating || updating ? 'Saving…' : editing ? 'Save Changes' : 'Create Charge Category'}
                  </button>
                </PermissionGuard>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
