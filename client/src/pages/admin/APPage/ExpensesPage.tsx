import { useState, useMemo } from 'react';
import {
  useGetExpensesQuery, useCreateExpenseMutation, useApproveExpenseMutation,
} from '../../../store/api/apApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Receipt, Plus, X, Clock, CheckCircle, DollarSign,
  ChevronLeft, ChevronRight, PieChart, Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './APPage.css';

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EXPENSE_CATEGORIES = [
  'maintenance', 'utilities', 'office_supplies', 'travel', 'food',
  'equipment', 'marketing', 'insurance', 'professional_services', 'other',
];

export default function ExpensesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: expensesData, isLoading } = useGetExpensesQuery({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    page: String(page), limit: '20',
  });
  const { data: propertiesData } = useGetPropertiesQuery({});
  const [createExpense, { isLoading: creating }] = useCreateExpenseMutation();
  const [approveExpense] = useApproveExpenseMutation();

  const expenses = expensesData?.data || [];
  const meta = expensesData?.meta;
  const properties = (propertiesData as any)?.data || [];

  const stats = useMemo(() => {
    return {
      pending: expenses.filter((e: any) => e.status === 'pending').length,
      approved: expenses.filter((e: any) => e.status === 'approved').length,
      totalPending: expenses.filter((e: any) => e.status === 'pending').reduce((s: number, e: any) => s + Number(e.amount), 0),
      totalApproved: expenses.filter((e: any) => e.status === 'approved').reduce((s: number, e: any) => s + Number(e.amount), 0),
    };
  }, [expenses]);

  const [form, setForm] = useState({
    expenseDate: format(new Date(), 'yyyy-MM-dd'), category: 'maintenance',
    description: '', amount: '', currency: 'USD', propertyId: '',
    receiptUrl: '', glAccountCode: '',
  });

  const handleCreate = async () => {
    if (!form.description || !form.amount) return toast.error('Description and amount are required');
    try {
      await createExpense({
        ...form,
        amount: parseFloat(form.amount),
      }).unwrap();
      toast.success('Expense submitted');
      setShowCreate(false);
      setForm({ expenseDate: format(new Date(), 'yyyy-MM-dd'), category: 'maintenance', description: '', amount: '', currency: 'USD', propertyId: '', receiptUrl: '', glAccountCode: '' });
    } catch { toast.error('Failed to submit expense'); }
  };

  const handleApprove = async (id: string) => {
    try { await approveExpense(id).unwrap(); toast.success('Expense approved'); } catch { toast.error('Approval failed'); }
  };

  return (
    <div className="ap-page">
      <div className="page-header">
        <h1><Receipt size={24} /> Expenses</h1>
        <button className="ap-btn primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Submit Expense</button>
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={8}><div className="ap-empty"><Receipt size={40} /><p>No expenses found</p></div></td></tr>
            ) : expenses.map((exp: any) => (
              <tr key={exp.id}>
                <td>{format(new Date(exp.expenseDate), 'dd MMM yyyy')}</td>
                <td>
                  <span className="ap-status" style={{ background: '#ede9fe', color: '#5b21b6', textTransform: 'capitalize' }}>
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
                    <button className="ap-btn sm success" onClick={() => handleApprove(exp.id)}>
                      <CheckCircle size={14} /> Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && meta.totalPages > 1 && (
          <div className="ap-pagination">
            <span>Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ap-btn sm ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
              <button className="ap-btn sm ghost" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="ap-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2><Plus size={18} /> Submit Expense</h2>
              <button className="ap-btn icon-only ghost" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-form-grid">
                <div className="ap-form-group">
                  <label>Expense Date *</label>
                  <input type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
                </div>
                <div className="ap-form-group">
                  <label>Category *</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Amount *</label>
                  <input type="number" min={0.01} step={0.01} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="ap-form-group">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="SGD">SGD</option>
                    <option value="MMK">MMK</option>
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>Property</label>
                  <select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}>
                    <option value="">— None —</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label>GL Account Code</label>
                  <input value={form.glAccountCode} onChange={e => setForm(f => ({ ...f, glAccountCode: e.target.value }))} placeholder="5200" />
                </div>
                <div className="ap-form-group full-width">
                  <label>Description *</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Office supplies purchase for Q1..." />
                </div>
              </div>
            </div>
            <div className="ap-modal-footer">
              <button className="ap-btn ghost" onClick={() => setShowCreate(false)}>Cancel</button>
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
