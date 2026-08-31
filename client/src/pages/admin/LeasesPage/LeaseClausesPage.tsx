import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetLeaseClausesQuery, useCreateLeaseClauseMutation, useDeleteLeaseClauseMutation,
  type LeaseClause,
} from '../../../store/api/leasesApi';
import {
  ArrowLeft, BookOpen, Plus, Trash2, Star,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import './LeaseClausesPage.css';

const CATEGORIES = ['general', 'payment', 'termination', 'use', 'maintenance', 'insurance', 'other'];

export default function LeaseClausesPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetLeaseClausesQuery();
  const [create, { isLoading: creating }] = useCreateLeaseClauseMutation();
  const [del] = useDeleteLeaseClauseMutation();
  const [showForm, setShowForm] = useState(false);
  const [catFilter, setCatFilter] = useState('');
  const [form, setForm] = useState({
    title: '', content: '', category: 'general', isStandard: false,
  });

  const clauses = data?.data || [];
  const filtered = catFilter ? clauses.filter((c) => c.category === catFilter) : clauses;

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error('Title and content required'); return; }
    try {
      await create({ ...form, category: form.category || null }).unwrap();
      toast.success('Clause created');
      setShowForm(false);
      setForm({ title: '', content: '', category: 'general', isStandard: false });
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!(await confirmDialog(`Delete clause "${title}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try { await del(id).unwrap(); toast.success('Clause deleted'); }
    catch { toast.error('Failed'); }
  };

  // Group by category
  const grouped: Record<string, LeaseClause[]> = {};
  filtered.forEach((c) => {
    const cat = c.category || 'uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  });

  return (
    <div className="lc-page">
      <div className="lc-header">
        <button className="back-btn" onClick={() => navigate('/admin/leases')}>
          <ArrowLeft size={16} /> Leases
        </button>
        <div className="lc-title-row">
          <h1><BookOpen size={22} /> Clause Library</h1>
          <p className="lc-subtitle">Manage reusable lease clauses. Standard clauses are auto-included in new templates.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> New Clause
        </button>
      </div>

      <div className="lc-filters">
        <button className={catFilter === '' ? 'active' : ''} onClick={() => setCatFilter('')}>All ({clauses.length})</button>
        {CATEGORIES.map((c) => {
          const count = clauses.filter((cl) => cl.category === c).length;
          if (!count) return null;
          return <button key={c} className={catFilter === c ? 'active' : ''} onClick={() => setCatFilter(c)}>{c} ({count})</button>;
        })}
      </div>

      {showForm && (
        <div className="lc-form card">
          <h3>New Clause</h3>
          <div className="lc-form-fields">
            <div className="field-row">
              <div className="field" style={{ flex: 2 }}>
                <label>Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Pet Policy" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Content *</label>
              <textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Full clause text…" />
            </div>
            <div className="field checkbox-field">
              <label><input type="checkbox" checked={form.isStandard} onChange={(e) => setForm({ ...form, isStandard: e.target.checked })} /> Standard clause (auto-included in templates)</label>
            </div>
          </div>
          <div className="lc-form-actions">
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Clause'}
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <div className="loading-center">Loading…</div>}

      {!isLoading && clauses.length === 0 && (
        <div className="empty-state">
          <BookOpen size={40} />
          <h3>No Clauses</h3>
          <p>Add clauses to build a reusable library for lease agreements.</p>
        </div>
      )}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
        <div key={cat} className="lc-category">
          <h3 className="lc-cat-title">{cat}</h3>
          <div className="lc-clauses-list">
            {items.map((c) => (
              <div key={c.id} className="lc-clause-card">
                <div className="lc-clause-header">
                  <div className="lc-clause-title">
                    {c.isStandard && <Star size={12} className="standard-star" />}
                    {c.title}
                  </div>
                  <button className="lc-clause-delete" onClick={() => handleDelete(c.id, c.title)}><Trash2 size={13} /></button>
                </div>
                <p className="lc-clause-content">{c.content}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
