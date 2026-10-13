import { useState, useEffect } from 'react';
import {
  useGetChargeCategoriesQuery, useCreateChargeCategoryMutation,
  useUpdateChargeCategoryMutation, useDeleteChargeCategoryMutation,
  type ChargeCategory,
} from '../../../store/api/billingApi';
import { Tag, Plus, X, Pencil, Trash2, Check, Lock, Search, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import toast from 'react-hot-toast';
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
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Search and filter state
  const [search, setSearch] = useState('');
  const [monthlyFilter, setMonthlyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const hasActiveFilters = Boolean(search.trim() || monthlyFilter || typeFilter);

  const handleResetFilters = () => {
    setSearch('');
    setMonthlyFilter('');
    setTypeFilter('');
    setPage(1);
  };

  const openCreate = () => { setHasAttemptedSubmit(false); setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (cc: ChargeCategory) => {
    setHasAttemptedSubmit(false);
    setEditing(cc);
    setForm({ code: cc.code, description: cc.description || '', monthly: cc.monthly });
    setShowForm(true);
  };
  const closeForm = () => { setHasAttemptedSubmit(false); setShowForm(false); setEditing(null); setForm(emptyForm); };

  const isCodeMissing = hasAttemptedSubmit && !form.code.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!form.code.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
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

  // Reset pagination when search or filters change
  useEffect(() => {
    setPage(1);
  }, [search, monthlyFilter, typeFilter, pageSize]);

  const filteredCategories = categories.filter((cc) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const codeMatch = cc.code.toLowerCase().includes(q);
      const descMatch = cc.description ? cc.description.toLowerCase().includes(q) : false;
      if (!codeMatch && !descMatch) return false;
    }
    if (monthlyFilter === 'monthly' && !cc.monthly) return false;
    if (monthlyFilter === 'non_monthly' && cc.monthly) return false;
    if (typeFilter === 'system' && !cc.isSystem) return false;
    if (typeFilter === 'custom' && cc.isSystem) return false;
    return true;
  });

  const totalItems = filteredCategories.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedCategories = filteredCategories.slice(startIndex, startIndex + pageSize);

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

      {/* Search & Filter Toolbar */}
      <div className="billing-filters">
        <div className="billing-filters-left">
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search code, description…"
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
            value={monthlyFilter}
            onChange={(e) => setMonthlyFilter(e.target.value)}
          >
            <option value="">All Frequencies</option>
            <option value="monthly">Monthly Only</option>
            <option value="non_monthly">Non-Monthly</option>
          </select>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="custom">Custom Categories</option>
            <option value="system">System Categories</option>
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

      {/* Charge Categories Table */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
          <table className="billing-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Code</th>
                <th style={{ minWidth: 220 }}>Description</th>
                <th className="text-center" style={{ width: 100 }}>Monthly</th>
                <th className="text-center" style={{ width: 120 }}>Charge Types</th>
                <th className="text-center" style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && categories.length === 0 ? (
                <tr><td colSpan={5} className="billing-empty">Loading…</td></tr>
              ) : categories.length === 0 ? (
                <tr><td colSpan={5} className="billing-empty">No charge categories found</td></tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="billing-empty" style={{ padding: '36px 16px', textAlign: 'center' }}>
                    <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                      No charge categories match your search or filter criteria.
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
              ) : (
                paginatedCategories.map(cc => (
                  <tr key={cc.id}>
                    <td><span className="cell-mono">{cc.code}</span></td>
                    <td><div className="cell-primary">{cc.description || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</div></td>
                    <td className="text-center">
                      {cc.monthly ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                          <Check size={13} />
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{cc.chargeTypeCount}</span>
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
                            <button className="btn-icon" title="Delete" onClick={() => handleDelete(cc)}
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </PermissionGuard>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScrollWrapper>

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="cc-page-size">Rows per page:</label>
                <select
                  id="cc-page-size"
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
              <h2><Tag size={18} /> {editing ? 'Edit Charge Category' : 'New Charge Category'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>
                  <div className="inv-field">
                    <label>Code <span className="req">*</span></label>
                    <input
                      className={isCodeMissing ? 'inv-input-error' : ''}
                      placeholder="e.g. utility"
                      value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value })}
                    />
                    {isCodeMissing && <span className="inv-error-text">Code is required</span>}
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
