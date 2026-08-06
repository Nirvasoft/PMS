import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetCamCostsQuery, useCreateCamCostMutation, useUpdateCamCostMutation,
  useDeleteCamCostMutation, useGetCamCostSummaryQuery,
} from '../../../store/api/facilityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Receipt, Plus, Loader2, XCircle, PieChart, DollarSign,
  Pencil, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const COST_CATEGORIES: Record<string, { label: string; color: string }> = {
  cleaning: { label: 'Cleaning', color: '#3b82f6' },
  security: { label: 'Security', color: '#ef4444' },
  landscaping: { label: 'Landscaping', color: '#22c55e' },
  utilities: { label: 'Utilities', color: '#f59e0b' },
  insurance: { label: 'Insurance', color: '#8b5cf6' },
  management_fee: { label: 'Management Fee', color: '#ec4899' },
  repairs: { label: 'Repairs', color: '#f97316' },
  other: { label: 'Other', color: '#94a3b8' },
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CamCostPage() {
  const today = new Date();
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    propertyId: '', year: today.getFullYear(), month: today.getMonth() + 1,
    page: 1, limit: 50,
  });

  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const properties = propertiesData?.data || [];

  const { data: costsData, isLoading } = useGetCamCostsQuery({
    propertyId: filters.propertyId || undefined,
    year: filters.year,
    month: filters.month,
    page: filters.page,
    limit: filters.limit,
  });

  const { data: summaryData } = useGetCamCostSummaryQuery({
    propertyId: filters.propertyId || properties[0]?.id,
    year: filters.year,
    month: filters.month,
  }, { skip: !filters.propertyId && !properties[0]?.id });

  const [deleteCamCost, { isLoading: deleting }] = useDeleteCamCostMutation();

  const costs = costsData?.data || [];
  const summary = summaryData?.data;

  const handleDelete = async (id: string) => {
    try {
      await deleteCamCost(id).unwrap();
      toast.success('CAM cost entry deleted');
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to delete');
    }
  };

  const openEdit = (entry: any) => {
    setEditEntry(entry);
    setShowModal(true);
  };

  const openCreate = () => {
    setEditEntry(null);
    setShowModal(true);
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Receipt size={22} /></div>
          <div>
            <h1>CAM Costs</h1>
            <p>Common Area Maintenance cost tracking and allocation</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="maint-filters">
        <select className="filter-select" value={filters.propertyId} onChange={(e) => setFilters(f => ({ ...f, propertyId: e.target.value }))}>
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="filter-select" value={filters.year} onChange={(e) => setFilters(f => ({ ...f, year: parseInt(e.target.value) }))}>
          {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select className="filter-select" value={filters.month} onChange={(e) => setFilters(f => ({ ...f, month: parseInt(e.target.value) }))}>
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {/* Summary + Table grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
        {/* Summary card */}
        <div className="sla-defaults-card" style={{ height: 'fit-content' }}>
          <h3><PieChart size={16} /> Cost Summary</h3>
          <p className="sla-defaults-subtitle">{MONTHS[filters.month - 1]} {filters.year}</p>
          {summary ? (
            <>
              <div style={{
                fontSize: '28px', fontWeight: 800, marginBottom: '16px',
                color: 'var(--text-primary)', letterSpacing: '-0.5px',
              }}>
                <DollarSign size={20} style={{ verticalAlign: '-2px' }} />
                {summary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>

              {/* Category breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {summary.categories.map((c: any) => (
                  <div key={c.category} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 12px', borderRadius: '8px',
                    background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                    fontSize: '13px',
                  }}>
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: COST_CATEGORIES[c.category]?.color || '#94a3b8',
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      {COST_CATEGORIES[c.category]?.label || c.category}
                    </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      ${c.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      ({summary.total > 0 ? ((c.total / summary.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                ))}
                {summary.categories.length === 0 && (
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No data for this period</p>
                )}
              </div>

              {/* Simple donut-like bar */}
              {summary.categories.length > 0 && (
                <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '12px', background: 'rgba(255,255,255,0.04)' }}>
                  {summary.categories.map((c: any) => (
                    <div key={c.category} style={{
                      width: `${summary.total > 0 ? (c.total / summary.total) * 100 : 0}%`,
                      background: COST_CATEGORIES[c.category]?.color || '#94a3b8',
                      transition: 'width 0.5s ease',
                    }} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Select a property to see summary</p>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
        ) : costs.length === 0 ? (
          <div className="maint-empty">
            <div className="empty-icon"><Receipt size={28} /></div>
            <p>No CAM cost entries for this period</p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={openCreate}>
              <Plus size={16} /> Add Entry
            </button>
          </div>
        ) : (
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Property</th>
                  <th>Amount</th>
                  <th>Source</th>
                  <th>Created</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c: any) => (
                  <tr key={c.id} style={{ cursor: 'default' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: COST_CATEGORIES[c.costCategory]?.color || '#94a3b8',
                        }} />
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                          {COST_CATEGORIES[c.costCategory]?.label || c.costCategory}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {c.description}
                      </span>
                    </td>
                    <td><span className="cell-secondary">{c.property?.name}</span></td>
                    <td>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {c.currency} {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td>
                      <span className="cell-mono">{c.sourceType || 'manual'}</span>
                    </td>
                    <td><span className="cell-secondary">{new Date(c.createdAt).toLocaleDateString()}</span></td>
                    <td>
                      <div className="sla-row-actions">
                        <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => openEdit(c)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm btn-danger-ghost" title="Delete" onClick={() => setDeleteConfirm(c.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <CamEntryModal
          entry={editEntry}
          properties={properties}
          defaultMonth={filters.month}
          defaultYear={filters.year}
          onClose={() => { setShowModal(false); setEditEntry(null); }}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="maint-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="maint-modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><Trash2 size={18} /></span> Delete CAM Entry</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}><XCircle size={20} /></button>
            </div>
            <div style={{ padding: '0 24px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete this cost entry? This action cannot be undone.
            </div>
            <div className="maint-modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={deleting}
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => handleDelete(deleteConfirm)}
              >
                {deleting ? <Loader2 size={16} className="spin" /> : <><Trash2 size={16} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create / Edit CAM Entry Modal ────────────────

function CamEntryModal({ entry, properties, defaultMonth, defaultYear, onClose }: {
  entry: any | null;
  properties: any[];
  defaultMonth: number;
  defaultYear: number;
  onClose: () => void;
}) {
  const isEdit = !!entry;
  const [createCamCost, { isLoading: creating }] = useCreateCamCostMutation();
  const [updateCamCost, { isLoading: updating }] = useUpdateCamCostMutation();
  const isLoading = creating || updating;

  const [form, setForm] = useState({
    propertyId: entry?.propertyId || '',
    costCategory: entry?.costCategory || 'cleaning',
    description: entry?.description || '',
    amount: entry ? String(Number(entry.amount)) : '',
    currency: entry?.currency || 'USD',
    periodMonth: String(entry?.periodMonth || defaultMonth),
    periodYear: String(entry?.periodYear || defaultYear),
    sourceType: entry?.sourceType || 'manual',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      propertyId: form.propertyId,
      costCategory: form.costCategory,
      description: form.description,
      amount: parseFloat(form.amount),
      currency: form.currency,
      periodMonth: parseInt(form.periodMonth),
      periodYear: parseInt(form.periodYear),
      sourceType: form.sourceType,
    };

    try {
      if (isEdit) {
        await updateCamCost({ id: entry.id, data: payload }).unwrap();
        toast.success('CAM cost entry updated');
      } else {
        await createCamCost(payload).unwrap();
        toast.success('CAM cost entry added');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="maint-modal-backdrop" onClick={onClose}>
      <div className="maint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon">{isEdit ? <Pencil size={18} /> : <Receipt size={18} />}</span>
            {isEdit ? 'Edit' : 'Add'} CAM Cost Entry
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Property <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.propertyId} disabled={isEdit}
                onChange={(e) => setForm(f => ({ ...f, propertyId: e.target.value }))}
              >
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {isEdit && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Property cannot be changed</span>}
            </div>
            <div className="maint-field">
              <label>Category <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.costCategory} onChange={(e) => setForm(f => ({ ...f, costCategory: e.target.value }))}>
                {Object.entries(COST_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Description <span style={{ color: '#f87171' }}>*</span></label>
              <input type="text" required value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Monthly cleaning services — January 2025" />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Amount <span style={{ color: '#f87171' }}>*</span></label>
              <input type="number" required min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Currency</label>
              <select value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}>
                <option value="USD">USD</option>
                <option value="SGD">SGD</option>
                <option value="MMK">MMK</option>
              </select>
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Month</label>
              <select value={form.periodMonth} onChange={(e) => setForm(f => ({ ...f, periodMonth: e.target.value }))}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="maint-field">
              <label>Year</label>
              <select value={form.periodYear} onChange={(e) => setForm(f => ({ ...f, periodYear: e.target.value }))}>
                {[defaultYear - 1, defaultYear, defaultYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Source Type</label>
              <select value={form.sourceType} onChange={(e) => setForm(f => ({ ...f, sourceType: e.target.value }))}>
                <option value="manual">Manual</option>
                <option value="ap_invoice">AP Invoice</option>
                <option value="work_order">Work Order</option>
              </select>
            </div>
          </div>

          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : isEdit
                ? <><Pencil size={16} /> Update Entry</>
                : <><Plus size={16} /> Add Entry</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
