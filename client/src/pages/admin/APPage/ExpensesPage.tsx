import { TableSkeletonRows } from '../../../components/common/SkeletonLoaders';
import { useState, useMemo, useEffect } from 'react';
import {
  useGetExpensesQuery, useCreateExpenseMutation, useApproveExpenseMutation,
} from '../../../store/api/apApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Receipt, Plus, X, Clock, CheckCircle, DollarSign,
  ChevronLeft, ChevronRight, Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import { CURRENCIES } from '../../../constants/currencies';
import './APPage.css';

import { formatCompactAmount as fmt } from '../../../utils/formatCurrency';

const EXPENSE_CATEGORIES = [
  'maintenance', 'utilities', 'office_supplies', 'travel', 'food',
  'equipment', 'marketing', 'insurance', 'professional_services', 'other',
];

export default function ExpensesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [showCreate, setShowCreate] = useState(false);
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);

  // Active property from the sidebar — follows the same pattern as Parking Overview.
  const selectedProperty = useSelectedPropertyFilter();
  const { data: propertiesData } = useGetMyPropertyScopeQuery();
  const properties = propertiesData?.data || [];
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  // Reset page whenever the active property changes.
  useEffect(() => { setPage(1); }, [selectedProperty]);

  const { data: expensesData, isLoading } = useGetExpensesQuery({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    propertyId: selectedProperty || undefined,
    page: String(page), limit: String(limit),
  });
  const [createExpense, { isLoading: creating }] = useCreateExpenseMutation();
  const [approveExpense] = useApproveExpenseMutation();

  const expenses = expensesData?.data || [];
  const meta = expensesData?.meta;

  const stats = useMemo(() => {
    return {
      pending: expenses.filter((e: any) => e.status === 'pending').length,
      approved: expenses.filter((e: any) => e.status === 'approved').length,
      totalPending: expenses.filter((e: any) => e.status === 'pending').reduce((s: number, e: any) => s + Number(e.amount), 0),
      totalApproved: expenses.filter((e: any) => e.status === 'approved').reduce((s: number, e: any) => s + Number(e.amount), 0),
    };
  }, [expenses]);

  // Create form — propertyId is always seeded from the active property.
  const [form, setForm] = useState({
    expenseDate: format(new Date(), 'yyyy-MM-dd'), category: 'maintenance',
    description: '', amount: '', currency: 'USD', propertyId: selectedProperty,
    receiptUrl: '', glAccountCode: '',
  });

  const handleCreate = async () => {
    setHasAttemptedCreate(true);
    if (!form.propertyId) return toast.error('Please select a property from the sidebar first');
    if (!form.expenseDate || !(parseFloat(form.amount) > 0) || !form.description.trim()) {
      return toast.error('Please fill in all required fields');
    }
    try {
      await createExpense({
        ...form,
        amount: parseFloat(form.amount),
      }).unwrap();
      toast.success('Expense submitted');
      setShowCreate(false);
      setHasAttemptedCreate(false);
      setForm({ expenseDate: format(new Date(), 'yyyy-MM-dd'), category: 'maintenance', description: '', amount: '', currency: 'USD', propertyId: selectedProperty, receiptUrl: '', glAccountCode: '' });
    } catch { toast.error('Failed to submit expense'); }
  };

  const handleApprove = async (id: string) => {
    try { await approveExpense(id).unwrap(); toast.success('Expense approved'); } catch { toast.error('Approval failed'); }
  };

  return (
    <div className="ap-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Receipt size={22} />
          </div>
          <div>
            <h1>Expenses</h1>
            <p>{meta?.total ?? expenses.length} total expenses</p>
          </div>
        </div>
        <PermissionGuard permission="ap-expenses.write">
          <button
            className="ap-btn primary"
            onClick={() => {
              const propertyCurrency = properties.find((p) => p.id === selectedProperty)?.currency;
              setForm((f) => ({ ...f, currency: propertyCurrency || 'USD', propertyId: selectedProperty }));
              setHasAttemptedCreate(false);
              setShowCreate(true);
            }}
            disabled={!selectedProperty}
            title={!selectedProperty ? 'Select a property from the sidebar first' : undefined}
          >
            <Plus size={16} /> Submit Expense
          </button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      <div className="ap-stat-cards">
        <div className="ap-stat-card">
          <div className="icon-wrap pending"><Clock size={20} /></div>
          <div className="stat-info"><div className="label">Pending</div><div className="value">{stats.pending}</div></div>
        </div>
        <div className="ap-stat-card">
          <div className="icon-wrap approved"><CheckCircle size={20} /></div>
          <div className="stat-info"><div className="label">Approved</div><div className="value">{stats.approved}</div></div>
        </div>
        <div className="ap-stat-card">
          <div className="icon-wrap expense"><DollarSign size={20} /></div>
          <div className="stat-info"><div className="label">Pending Amount</div><div className="value">{fmt(stats.totalPending)}</div></div>
        </div>
        <div className="ap-stat-card">
          <div className="icon-wrap paid"><DollarSign size={20} /></div>
          <div className="stat-info"><div className="label">Approved Amount</div><div className="value">{fmt(stats.totalApproved)}</div></div>
        </div>
      </div>

      {/* Filters */}
      <div className="ap-filters">
        {/* Property follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select value={selectedProperty} disabled style={{ minWidth: 180 }}>
          {!selectedProperty && <option value="">All Properties</option>}
          {selectedProperty && <option value={selectedProperty}>{selectedPropertyName || 'Loading…'}</option>}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="ap-table-wrap">
        <TableScrollWrapper>
          <table className="ap-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Submitted By</th>
                <th>Property</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeletonRows columns={8} />
              ) : expenses.length === 0 ? (
                <tr><td colSpan={8}><div className="ap-empty"><Receipt size={40} /><p>No expenses found</p></div></td></tr>
              ) : expenses.map((exp: any) => (
                <tr key={exp.id}>
                  <td>{format(new Date(exp.expenseDate), 'dd MMM yyyy')}</td>
                  <td>
                    <span className="ap-status" style={{ background: 'rgba(139, 92, 246, 0.14)', color: '#a78bfa', textTransform: 'capitalize' }}>
                      <Tag size={12} style={{ marginRight: 4 }} />{exp.category.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description}</td>
                  <td className="amount-neutral">{fmt(exp.amount)} {exp.currency}</td>
                  <td>{exp.submitter?.profile ? `${exp.submitter.profile.firstName} ${exp.submitter.profile.lastName}` : exp.submitter?.email}</td>
                  <td>{exp.property?.name || '—'}</td>
                  <td><span className={`ap-status ${exp.status}`}>{exp.status}</span></td>
                  <td>
                    {exp.status === 'pending' && (
                      <PermissionGuard permission="ap-expenses.write">
                        <button className="ap-btn sm success" onClick={() => handleApprove(exp.id)}>
                          <CheckCircle size={14} /> Approve
                        </button>
                      </PermissionGuard>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScrollWrapper>
        {meta && (meta.total ?? 0) >= 10 && (
          <div className="ap-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <span>Rows per page:</span>
                <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="page-btns">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} title="Previous Page">
                <ChevronLeft size={16} />
              </button>
              <span className="page-num-display">Page {page} of {meta.totalPages || 1}</span>
              <button disabled={page >= (meta.totalPages || 1)} onClick={() => setPage(p => p + 1)} title="Next Page">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2><Plus size={18} /> Submit Expense</h2>
              <button className="ap-btn icon-only ghost" onClick={() => { setShowCreate(false); setHasAttemptedCreate(false); }}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-grid">
                <div className="ap-form-group">
                  <label>Expense Date <span className="req">*</span></label>
                  <input
                    type="date"
                    className={hasAttemptedCreate && !form.expenseDate ? 'ap-input-error' : ''}
                    value={form.expenseDate}
                    onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))}
                  />
                  {hasAttemptedCreate && !form.expenseDate && (
                    <span className="ap-error-text">Expense date is required</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Category <span className="req">*</span></label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Amount <span className="req">*</span></label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    className={hasAttemptedCreate && !(parseFloat(form.amount) > 0) ? 'ap-input-error' : ''}
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                  {hasAttemptedCreate && !(parseFloat(form.amount) > 0) && (
                    <span className="ap-error-text">Please enter a valid amount</span>
                  )}
                </div>
                <div className="ap-form-group">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Property</label>
                  {/* Locked to the sidebar's Active Property — not independently editable. */}
                  <select value={form.propertyId} disabled>
                    {!form.propertyId && <option value="">None</option>}
                    {form.propertyId && <option value={form.propertyId}>{selectedPropertyName || 'Loading…'}</option>}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>GL Account Code</label>
                  <input value={form.glAccountCode} onChange={e => setForm(f => ({ ...f, glAccountCode: e.target.value }))} placeholder="5200" />
                </div>
                <div className="ap-form-group full-width">
                  <label>Description <span className="req">*</span></label>
                  <textarea
                    className={hasAttemptedCreate && !form.description.trim() ? 'ap-input-error' : ''}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Office supplies purchase for Q1..."
                  />
                  {hasAttemptedCreate && !form.description.trim() && (
                    <span className="ap-error-text">Description is required</span>
                  )}
                </div>
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => { setShowCreate(false); setHasAttemptedCreate(false); }}>Cancel</button>
              <button className="ap-btn primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Submitting...' : 'Submit Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
