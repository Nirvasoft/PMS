import { useState } from 'react';
import {
  useGetChargeTypesQuery, useCreateChargeTypeMutation, useUpdateChargeTypeMutation,
  useGetChargeCategoriesQuery,
  type ChargeType,
} from '../../../store/api/billingApi';
import { DollarSign, Plus, X, Tag, Check, Pencil, Lock } from 'lucide-react';
import { useAlertDialog } from '../../../components/DialogProvider';
import './BillingPage.css';

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  rent:    { bg: 'rgba(99,102,241,0.12)', color: '#a5b4fc' },
  utility: { bg: 'rgba(16,185,129,0.12)', color: '#34d399' },
  service: { bg: 'rgba(6,182,212,0.12)',  color: '#22d3ee' },
  parking: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
  penalty: { bg: 'rgba(239,68,68,0.12)',  color: '#f87171' },
  deposit: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  misc:    { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af' },
};

export default function ChargeTypesPage() {
  const { data: chargeTypesData, isFetching } = useGetChargeTypesQuery();
  const { data: categoriesData } = useGetChargeCategoriesQuery();
  const [createChargeType, { isLoading: creating }] = useCreateChargeTypeMutation();
  const [updateChargeType, { isLoading: updating }] = useUpdateChargeTypeMutation();
  const alertDialog = useAlertDialog();

  const chargeTypes = chargeTypesData?.data || [];
  const categories = categoriesData?.data || [];

  const emptyForm = { code: '', name: '', category: categories[0]?.code || '', glAccountCode: '', isTaxable: false, taxRate: 0 };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChargeType | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (ct: ChargeType) => {
    setEditing(ct);
    setForm({
      code: ct.code, name: ct.name, category: ct.category,
      glAccountCode: ct.glAccountCode || '', isTaxable: ct.isTaxable, taxRate: Number(ct.taxRate),
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      code: form.code.toUpperCase(),
      name: form.name,
      category: form.category,
      glAccountCode: form.glAccountCode || undefined,
      isTaxable: form.isTaxable,
      taxRate: form.isTaxable ? form.taxRate : 0,
    };
    try {
      if (editing) {
        await updateChargeType({ id: editing.id, data: payload }).unwrap();
      } else {
        await createChargeType(payload).unwrap();
      }
      closeForm();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || `Failed to ${editing ? 'update' : 'create'} charge type`);
    }
  };

  // Group by category
  const grouped = chargeTypes.reduce((acc, ct) => {
    const cat = ct.category || 'misc';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ct);
    return acc;
  }, {} as Record<string, typeof chargeTypes>);

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
            <DollarSign size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Charge Types</h1>
            <p>Manage charge categories used across billing and invoicing</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Charge Type
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="billing-summary-cards" style={{ gridTemplateColumns: `repeat(${categories.length || 1}, 1fr)` }}>
        {categories.map(cat => {
          const count = grouped[cat.code]?.length || 0;
          const c = CATEGORY_COLORS[cat.code.toLowerCase()] || CATEGORY_COLORS.misc;
          return (
            <div key={cat.id} className="billing-stat-card" style={{ padding: '14px 16px' }}>
              <div className="bsc-label" style={{ fontSize: 10 }}>{cat.code}</div>
              <div className="bsc-value" style={{ fontSize: 22, color: c.color }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Charge Types Table */}
      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>GL Account</th>
              <th className="text-center">Taxable</th>
              <th className="text-right">Default Tax</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && chargeTypes.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">Loading…</td></tr>
            ) : chargeTypes.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">No charge types found</td></tr>
            ) : chargeTypes.map(ct => {
              const c = CATEGORY_COLORS[ct.category] || CATEGORY_COLORS.misc;
              return (
                <tr key={ct.id}>
                  <td><span className="cell-mono">{ct.code}</span></td>
                  <td><span className="cell-primary">{ct.name}</span></td>
                  <td>
                    <span className={`charge-type-badge ${ct.category}`}>{ct.category}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {ct.glAccountCode || '—'}
                    </span>
                  </td>
                  <td className="text-center">
                    {ct.isTaxable ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                        <Check size={13} />
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {ct.isTaxable && Number(ct.taxRate) > 0
                      ? <span style={{ fontWeight: 600, color: '#fbbf24' }}>{(Number(ct.taxRate) * 100).toFixed(1)}%</span>
                      : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    {ct.isActive
                      ? <span className="sched-status sched-status--active">Active</span>
                      : <span className="sched-status sched-status--cancelled">Inactive</span>}
                  </td>
                  <td className="text-center">
                    {ct.isSystem ? (
                      <span title="System charge types can't be edited" style={{ display: 'inline-flex', color: 'var(--text-tertiary)' }}>
                        <Lock size={14} />
                      </span>
                    ) : (
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(ct)}>
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Tag size={18} /> {editing ? 'Edit Charge Type' : 'New Charge Type'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Code <span className="req">*</span></label>
                    <input required placeholder="e.g. ELECTRICITY" value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value })}
                      style={{ textTransform: 'uppercase' }} />
                  </div>
                  <div className="inv-field">
                    <label>Name <span className="req">*</span></label>
                    <input required placeholder="e.g. Electricity" value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Category <span className="req">*</span></label>
                    <select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                      {categories.length === 0 && <option value="">No charge categories — add one first</option>}
                      {categories.map(cat => <option key={cat.id} value={cat.code}>{cat.description || cat.code}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>GL Account Code</label>
                    <input placeholder="e.g. 4100" value={form.glAccountCode}
                      onChange={e => setForm({ ...form, glAccountCode: e.target.value })} />
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.isTaxable}
                      onChange={e => setForm({ ...form, isTaxable: e.target.checked })}
                      style={{ accentColor: 'var(--primary)' }} />
                    Taxable
                  </label>
                  {form.isTaxable && (
                    <div className="inv-field" style={{ width: 160 }}>
                      <label>Default Tax Rate</label>
                      <input type="number" min={0} max={1} step={0.001} value={form.taxRate}
                        onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })} />
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                  {creating || updating ? 'Saving…' : editing ? 'Save Changes' : 'Create Charge Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
