import { useState, useEffect, useMemo } from 'react';
import {
  useGetPaymentMethodsQuery,
  useCreatePaymentMethodMutation,
  useUpdatePaymentMethodMutation,
  useDeletePaymentMethodMutation,
  useGetGlAccountsQuery,
  useGetDepartmentCentersQuery,
  useGetCostCentersQuery,
  type PaymentMethod,
  type GlAccount,
} from '../../../store/api/glApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import {
  CreditCard, Plus, X, Check, Pencil, Trash2, Search, RotateCcw,
  ChevronLeft, ChevronRight, BookOpen, Filter,
} from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../BillingPage/components/TableScrollWrapper';
import toast from 'react-hot-toast';
import '../BillingPage/BillingPage.css';

export default function PaymentMethodSetupPage() {
  const propertyId = useSelectedPropertyId();
  const { data: paymentMethods = [], isFetching } = useGetPaymentMethodsQuery(
    propertyId ? { propertyId } : undefined
  );
  const { data: glAccounts = [], isLoading: loadingGlAccounts } = useGetGlAccountsQuery(
    propertyId ? { propertyId } : {}
  );
  const { data: departmentCenters = [] } = useGetDepartmentCentersQuery(
    propertyId ? { propertyId } : undefined
  );
  const { data: costCenters = [] } = useGetCostCentersQuery(
    propertyId ? { propertyId } : undefined
  );
  const [createPaymentMethod, { isLoading: creating }] = useCreatePaymentMethodMutation();
  const [updatePaymentMethod, { isLoading: updating }] = useUpdatePaymentMethodMutation();
  const [deletePaymentMethod] = useDeletePaymentMethodMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();

  const emptyForm = {
    code: '',
    name: '',
    glAccountCode: '',
    departmentCenterId: '',
    costCenterId: '',
    isActive: true,
  };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Chart of Accounts Lookup Modal state
  const [showCoaModal, setShowCoaModal] = useState(false);
  const [coaSearch, setCoaSearch] = useState('');
  const [coaTypeFilter, setCoaTypeFilter] = useState('');

  const glAccountByCode = useMemo(() => {
    const map = new Map<string, GlAccount>();
    glAccounts.forEach((a) => map.set(a.code, a));
    return map;
  }, [glAccounts]);

  const selectedGlAccount = useMemo(
    () => glAccountByCode.get(form.glAccountCode.trim()),
    [glAccountByCode, form.glAccountCode]
  );

  const filteredGlAccounts = useMemo(() => {
    const q = coaSearch.trim().toLowerCase();
    return glAccounts.filter((acc) => {
      if (acc.isActive === false) return false;
      if (coaTypeFilter && acc.accountType !== coaTypeFilter) return false;
      if (q) {
        const codeMatch = acc.code.toLowerCase().includes(q);
        const nameMatch = acc.name.toLowerCase().includes(q);
        const typeMatch = acc.accountType.toLowerCase().includes(q);
        const deptMatch = acc.departmentCenter?.code?.toLowerCase().includes(q) || false;
        const ccMatch = acc.costCenter?.code?.toLowerCase().includes(q) || false;
        if (!codeMatch && !nameMatch && !typeMatch && !deptMatch && !ccMatch) return false;
      }
      return true;
    });
  }, [glAccounts, coaSearch, coaTypeFilter]);

  // Search and filter state
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const hasFilterSelections = Boolean(statusFilter);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const openCreate = () => {
    setHasAttemptedSubmit(false);
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (pm: PaymentMethod) => {
    setHasAttemptedSubmit(false);
    setEditing(pm);
    const linkedGl = pm.glAccountCode ? glAccountByCode.get(pm.glAccountCode) : undefined;
    setForm({
      code: pm.code,
      name: pm.name,
      glAccountCode: pm.glAccountCode || '',
      departmentCenterId:
        pm.departmentCenterId ||
        pm.departmentCenter?.id ||
        linkedGl?.departmentCenterId ||
        linkedGl?.departmentCenter?.id ||
        '',
      costCenterId:
        pm.costCenterId ||
        pm.costCenter?.id ||
        linkedGl?.costCenterId ||
        linkedGl?.costCenter?.id ||
        '',
      isActive: pm.isActive,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setHasAttemptedSubmit(false);
    setShowCoaModal(false);
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const isCodeMissing = hasAttemptedSubmit && !form.code.trim();
  const isNameMissing = hasAttemptedSubmit && !form.name.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    const payload = {
      ...(propertyId ? { propertyId } : {}),
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      glAccountCode: form.glAccountCode || null,
      departmentCenterId: form.departmentCenterId || null,
      costCenterId: form.costCenterId || null,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await updatePaymentMethod({ id: editing.id, data: payload }).unwrap();
        toast.success('Payment method updated');
      } else {
        await createPaymentMethod(payload).unwrap();
        toast.success('Payment method created');
      }
      closeForm();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || err?.data?.message || `Failed to ${editing ? 'update' : 'create'} payment method`);
    }
  };

  const handleDelete = async (pm: PaymentMethod) => {
    const ok = await confirmDialog(
      `Delete payment method "${pm.code} — ${pm.name}"?`,
      { danger: true, confirmText: 'Delete' }
    );
    if (!ok) return;
    try {
      await deletePaymentMethod(pm.id).unwrap();
      toast.success('Payment method deleted');
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || err?.data?.message || 'Failed to delete payment method');
    }
  };

  const filteredPaymentMethods = paymentMethods.filter((pm) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const linkedGl = pm.glAccountCode ? glAccountByCode.get(pm.glAccountCode) : undefined;
      const deptCode = pm.departmentCenter?.code || linkedGl?.departmentCenter?.code || '';
      const ccCode = pm.costCenter?.code || linkedGl?.costCenter?.code || '';
      const codeMatch = pm.code.toLowerCase().includes(q);
      const nameMatch = pm.name.toLowerCase().includes(q);
      const glMatch = pm.glAccountCode ? pm.glAccountCode.toLowerCase().includes(q) : false;
      const deptMatch = deptCode.toLowerCase().includes(q);
      const ccMatch = ccCode.toLowerCase().includes(q);
      if (!codeMatch && !nameMatch && !glMatch && !deptMatch && !ccMatch) return false;
    }
    if (statusFilter === 'active' && !pm.isActive) {
      return false;
    }
    if (statusFilter === 'inactive' && pm.isActive) {
      return false;
    }
    return true;
  });

  // Reset pagination when search, filters, or active property change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize, propertyId]);

  const totalItems = filteredPaymentMethods.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedPaymentMethods = filteredPaymentMethods.slice(startIndex, startIndex + pageSize);

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <CreditCard size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Payment Method Setup</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {`${paymentMethods.length} total payment methods`}
            </p>
          </div>
          <PermissionGuard permission="finance-coa.write">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Payment Method
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="billing-filters" style={showFilters ? { marginBottom: 12 } : undefined}>
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

          <button
            type="button"
            className={`btn btn-secondary billing-filter-toggle-btn${showFilters || hasFilterSelections ? ' active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} /> Filters{hasFilterSelections ? ' •' : ''}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="billing-filter-bar">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Status"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            type="button"
            className="btn-ghost billing-filter-reset-btn"
            onClick={() => {
              setStatusFilter('');
              setPage(1);
            }}
          >
            <X size={14} /> Reset
          </button>
        </div>
      )}

      {/* Payment Methods Table */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
          <table className="billing-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Code</th>
                <th style={{ width: 200 }}>Name</th>
                <th style={{ width: 130 }}>GL Account</th>
                <th style={{ width: 130 }}>Department</th>
                <th style={{ width: 130 }}>Cost Center</th>
                <th style={{ width: 110 }}>Status</th>
                <th className="text-center" style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {isFetching && paymentMethods.length === 0 ? (
                <tr><td colSpan={7} className="billing-empty">Loading…</td></tr>
              ) : paymentMethods.length === 0 ? (
                <tr><td colSpan={7} className="billing-empty">No payment methods found</td></tr>
              ) : filteredPaymentMethods.length === 0 ? (
                <tr>
                  <td colSpan={7} className="billing-empty" style={{ padding: '36px 16px', textAlign: 'center' }}>
                    <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                      No payment methods match your search or filter criteria.
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
              ) : paginatedPaymentMethods.map(pm => {
                const linkedGl = pm.glAccountCode ? glAccountByCode.get(pm.glAccountCode) : undefined;
                const deptCode = pm.departmentCenter?.code || linkedGl?.departmentCenter?.code;
                const ccCode = pm.costCenter?.code || linkedGl?.costCenter?.code;
                return (
                  <tr key={pm.id}>
                    <td><span className="cell-mono">{pm.code}</span></td>
                    <td><div className="cell-primary">{pm.name}</div></td>
                    <td>
                      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                        {pm.glAccountCode || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="cell-mono" style={{ fontSize: 13, color: deptCode ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                        {deptCode || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="cell-mono" style={{ fontSize: 13, color: ccCode ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                        {ccCode || '—'}
                      </span>
                    </td>
                    <td>
                      {pm.isActive
                        ? <span className="sched-status sched-status--active">Active</span>
                        : <span className="sched-status sched-status--cancelled">Inactive</span>}
                    </td>
                    <td className="text-center">
                      <PermissionGuard permission="finance-coa.write">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button className="btn-icon" title="Edit" onClick={() => openEdit(pm)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn-icon"
                            title="Delete"
                            onClick={() => handleDelete(pm)}
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </PermissionGuard>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScrollWrapper>

        {/* Pagination */}
        {totalItems >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="pm-page-size">Rows per page:</label>
                <select
                  id="pm-page-size"
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
          <div className="modal-content meter-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><CreditCard size={18} /> {editing ? 'Edit Payment Method' : 'New Payment Method'}</h2>
              <button type="button" className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Code <span className="req">*</span></label>
                    <input
                      className={isCodeMissing ? 'inv-input-error' : ''}
                      placeholder="e.g. BANK_TRANSFER"
                      value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value })}
                      style={{ textTransform: 'uppercase' }}
                    />
                    {isCodeMissing && <span className="inv-error-text">Code is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>Name <span className="req">*</span></label>
                    <input
                      className={isNameMissing ? 'inv-input-error' : ''}
                      placeholder="e.g. Bank Transfer"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                    {isNameMissing && <span className="inv-error-text">Name is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>GL Account Code</label>
                    <div className="coa-input-group">
                      <input
                        className="coa-bound-input"
                        placeholder="Select from Chart of Accounts…"
                        value={form.glAccountCode}
                        readOnly
                        tabIndex={-1}
                        onClick={() => {
                          setCoaSearch('');
                          setCoaTypeFilter('');
                          setShowCoaModal(true);
                        }}
                      />
                      {form.glAccountCode && (
                        <button
                          type="button"
                          className="coa-clear-inline-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm({
                              ...form,
                              glAccountCode: '',
                              departmentCenterId: '',
                              costCenterId: '',
                            });
                          }}
                          title="Clear GL Account Code"
                          aria-label="Clear GL Account Code"
                        >
                          <X size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="coa-lookup-btn"
                        onClick={() => {
                          setCoaSearch('');
                          setCoaTypeFilter('');
                          setShowCoaModal(true);
                        }}
                        title="Search Chart of Accounts"
                        aria-label="Search Chart of Accounts"
                      >
                        <Search size={15} />
                      </button>
                    </div>
                    {selectedGlAccount && (
                      <span className="coa-selected-hint">
                        {selectedGlAccount.name} ({selectedGlAccount.accountType})
                      </span>
                    )}
                  </div>
                  <div className="inv-field">
                    <label>Department</label>
                    <select
                      value={form.departmentCenterId}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          departmentCenterId: e.target.value,
                          costCenterId: '',
                        })
                      }
                    >
                      <option value="">— None —</option>
                      {departmentCenters
                        .filter((d) => d.isActive)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Cost Center</label>
                    <select
                      value={form.costCenterId}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          costCenterId: e.target.value,
                        })
                      }
                    >
                      <option value="">— None —</option>
                      {costCenters
                        .filter((c) => {
                          if (!c.isActive) return false;
                          return !form.departmentCenterId || !c.departmentCenterId || c.departmentCenterId === form.departmentCenterId;
                        })
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="inv-field" style={{ justifyContent: 'flex-end' }}>
                    <label style={{ visibility: 'hidden' }} aria-hidden="true">Status</label>
                    <label className="ct-taxable-toggle">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={e => setForm({ ...form, isActive: e.target.checked })}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                  {creating || updating ? 'Saving…' : editing ? 'Save Changes' : 'Create Payment Method'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chart of Accounts Lookup Modal */}
      {showCoaModal && (
        <div className="modal-overlay coa-lookup-overlay" onClick={() => setShowCoaModal(false)}>
          <div className="modal-content coa-lookup-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <BookOpen size={18} /> Chart of Accounts
              </h2>
              <button type="button" className="modal-close" onClick={() => setShowCoaModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="coa-lookup-toolbar">
              <div className="coa-lookup-search-wrap">
                <Search size={15} className="coa-lookup-search-icon" />
                <input
                  type="text"
                  placeholder="Search by account code or name…"
                  value={coaSearch}
                  onChange={e => setCoaSearch(e.target.value)}
                  autoFocus
                />
                {coaSearch && (
                  <button
                    type="button"
                    className="coa-lookup-clear-btn"
                    onClick={() => setCoaSearch('')}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                className="coa-lookup-type-select"
                value={coaTypeFilter}
                onChange={e => setCoaTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>

            <div className="modal-body coa-lookup-body">
              {loadingGlAccounts ? (
                <div className="coa-lookup-empty">Loading Chart of Accounts…</div>
              ) : filteredGlAccounts.length === 0 ? (
                <div className="coa-lookup-empty">
                  No GL accounts found matching your search.
                </div>
              ) : (
                <div className="coa-lookup-list">
                  <table className="billing-table coa-lookup-table">
                    <thead>
                      <tr>
                        <th style={{ width: 110 }}>Code</th>
                        <th>Account Name</th>
                        <th style={{ width: 110 }}>Department</th>
                        <th style={{ width: 110 }}>Cost Center</th>
                        <th style={{ width: 110 }}>Type</th>
                        <th style={{ width: 100 }} className="text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGlAccounts.map((acc: GlAccount) => {
                        const isSelected = form.glAccountCode.trim() === acc.code;
                        return (
                          <tr
                            key={acc.id}
                            className={`coa-lookup-row ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setForm({
                                ...form,
                                glAccountCode: acc.code,
                                departmentCenterId: acc.departmentCenterId || acc.departmentCenter?.id || form.departmentCenterId,
                                costCenterId: acc.costCenterId || acc.costCenter?.id || form.costCenterId,
                              });
                              setShowCoaModal(false);
                            }}
                          >
                            <td>
                              <span className="cell-mono">{acc.code}</span>
                            </td>
                            <td>
                              <div className="cell-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>{acc.name}</span>
                                {acc.isControl && (
                                  <span className="coa-control-tag">Control</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="cell-mono" style={{ fontSize: 12, color: acc.departmentCenter?.code ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                                {acc.departmentCenter?.code || '—'}
                              </span>
                            </td>
                            <td>
                              <span className="cell-mono" style={{ fontSize: 12, color: acc.costCenter?.code ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                                {acc.costCenter?.code || '—'}
                              </span>
                            </td>
                            <td>
                              <span className={`coa-type-badge ${acc.accountType}`}>
                                {acc.accountType}
                              </span>
                            </td>
                            <td className="text-center">
                              <button
                                type="button"
                                className={`coa-select-btn ${isSelected ? 'active' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setForm({
                                    ...form,
                                    glAccountCode: acc.code,
                                    departmentCenterId: acc.departmentCenterId || acc.departmentCenter?.id || form.departmentCenterId,
                                    costCenterId: acc.costCenterId || acc.costCenter?.id || form.costCenterId,
                                  });
                                  setShowCoaModal(false);
                                }}
                              >
                                {isSelected ? (
                                  <>
                                    <Check size={13} /> Selected
                                  </>
                                ) : (
                                  'Select'
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
                Showing {filteredGlAccounts.length} of {glAccounts.length} accounts
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCoaModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
