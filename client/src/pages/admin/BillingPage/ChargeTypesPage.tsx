import { useState, useEffect } from 'react';
import {
  useGetChargeTypesQuery, useCreateChargeTypeMutation, useUpdateChargeTypeMutation,
  useGetChargeCategoriesQuery,
  type ChargeType,
} from '../../../store/api/billingApi';
import { DollarSign, Plus, X, Tag, Check, Pencil, Lock, Search, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import './BillingPage.css';

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

  // Search and filter state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [taxFilter, setTaxFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const hasActiveFilters = Boolean(search.trim() || categoryFilter || taxFilter || statusFilter);

  const handleResetFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setTaxFilter('');
    setStatusFilter('');
    setPage(1);
  };

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

  const filteredChargeTypes = chargeTypes.filter((ct) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const codeMatch = ct.code.toLowerCase().includes(q);
      const nameMatch = ct.name.toLowerCase().includes(q);
      const glMatch = ct.glAccountCode ? ct.glAccountCode.toLowerCase().includes(q) : false;
      const categoryMatch = ct.category ? ct.category.toLowerCase().includes(q) : false;
      if (!codeMatch && !nameMatch && !glMatch && !categoryMatch) return false;
    }
    if (categoryFilter && ct.category !== categoryFilter) {
      return false;
    }
    if (taxFilter === 'taxable' && !ct.isTaxable) {
      return false;
    }
    if (taxFilter === 'non_taxable' && ct.isTaxable) {
      return false;
    }
    if (statusFilter === 'active' && !ct.isActive) {
      return false;
    }
    if (statusFilter === 'inactive' && ct.isActive) {
      return false;
    }
    return true;
  });

  // Reset pagination when search or filters change
  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, taxFilter, statusFilter, pageSize]);

  const totalItems = filteredChargeTypes.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedChargeTypes = filteredChargeTypes.slice(startIndex, startIndex + pageSize);

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
          <PermissionGuard permission="billing-charge-types.write">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Charge Type
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="billing-filters">
        <div className="billing-filters-left">
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search code, name, GL account…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.code}>
                {cat.description || cat.code}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={taxFilter}
            onChange={(e) => setTaxFilter(e.target.value)}
          >
            <option value="">All Tax Status</option>
            <option value="taxable">Taxable</option>
            <option value="non_taxable">Non-Taxable</option>
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResetFilters}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, height: 38, padding: '0 14px' }}
              title="Reset all filters"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Charge Types Table */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
          <table className="billing-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Code</th>
              <th style={{ minWidth: 200 }}>Name</th>
              <th style={{ width: 140 }}>Category</th>
              <th style={{ width: 140 }}>GL Account</th>
              <th className="text-center" style={{ width: 90 }}>Taxable</th>
              <th className="text-right" style={{ width: 120 }}>Default Tax</th>
              <th style={{ width: 110 }}>Status</th>
              <th className="text-center" style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && chargeTypes.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">Loading…</td></tr>
            ) : chargeTypes.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">No charge types found</td></tr>
            ) : filteredChargeTypes.length === 0 ? (
              <tr>
                <td colSpan={8} className="billing-empty" style={{ padding: '36px 16px', textAlign: 'center' }}>
                  <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                    No charge types match your search or filter criteria.
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleResetFilters}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px' }}
                  >
                    <RotateCcw size={13} /> Reset Filters
                  </button>
                </td>
              </tr>
            ) : paginatedChargeTypes.map(ct => (
                <tr key={ct.id}>
                  <td><span className="cell-mono">{ct.code}</span></td>
                  <td><div className="cell-primary">{ct.name}</div></td>
                  <td>
                    <span className={`charge-type-badge ${ct.category}`}>{ct.category}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                      {ct.glAccountCode || '—'}
                    </span>
                  </td>
                  <td className="text-center">
                    {ct.isTaxable ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                        <Check size={13} />
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {ct.isTaxable && Number(ct.taxRate) > 0
                      ? <span style={{ fontWeight: 600, color: '#fbbf24' }}>{(Number(ct.taxRate) * 100).toFixed(1)}%</span>
                      : <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>—</span>}
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
                      <PermissionGuard permission="billing-charge-types.write">
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(ct)}>
                          <Pencil size={14} />
                        </button>
                      </PermissionGuard>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </TableScrollWrapper>

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="ct-page-size">Rows per page:</label>
                <select
                  id="ct-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <span className="page-info">
                Showing {totalItems === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, totalItems)} of {totalItems}
              </span>
            </div>

            <div className="page-btns">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {page} of {Math.max(totalPages, 1)}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
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
