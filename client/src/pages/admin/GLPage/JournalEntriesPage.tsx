import { useState } from 'react';
import {
  useGetJournalEntriesQuery, useCreateJournalEntryMutation,
  usePostJournalEntryMutation, useReverseJournalEntryMutation,
  useGetGlAccountsQuery,
} from '../../../store/api/glApi';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import './GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export default function JournalEntriesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useGetJournalEntriesQuery({ page, limit: 20, status: statusFilter || undefined });
  const [postJE] = usePostJournalEntryMutation();
  const [reverseJE] = useReverseJournalEntryMutation();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const entries = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };

  const handlePost = async (id: string) => {
    if (!(await confirmDialog('Post this journal entry? This cannot be undone.'))) return;
    try { await postJE(id).unwrap(); } catch (err: any) { alertDialog(err.data?.errors?.[0]?.message || 'Error posting'); }
  };
  const handleReverse = async (id: string) => {
    if (!(await confirmDialog('Reverse this posted journal entry?', { danger: true, confirmText: 'Reverse' }))) return;
    try { await reverseJE(id).unwrap(); } catch (err: any) { alertDialog(err.data?.errors?.[0]?.message || 'Error reversing'); }
  };

  return (
    <div className="gl-page">
      <h2>Journal Entries</h2>
      <div className="gl-toolbar">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="reversed">Reversed</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Journal Entry</button>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div className="gl-table-wrap">
          <table className="gl-table">
            <thead>
              <tr>
                <th>JE #</th><th>Date</th><th>Type</th><th>Description</th>
                <th>Debit</th><th>Credit</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((je: any) => (
                <tr key={je.id}>
                  <td style={{fontWeight:600}}>{je.journalNumber}</td>
                  <td>{fmtDate(je.entryDate)}</td>
                  <td><span className="gl-type-chip asset" style={{fontSize:'0.7rem'}}>{je.entryType}</span></td>
                  <td style={{maxWidth:250,overflow:'hidden',textOverflow:'ellipsis'}}>{je.description}</td>
                  <td className="amount">{fmtAmt(Number(je.totalDebit))}</td>
                  <td className="amount">{fmtAmt(Number(je.totalCredit))}</td>
                  <td><span className={`gl-badge ${je.status}`}>{je.status}</span></td>
                  <td style={{display:'flex',gap:6}}>
                    {je.status === 'draft' && <button className="btn-sm btn-success" onClick={() => handlePost(je.id)}>Post</button>}
                    {je.status === 'posted' && <button className="btn-sm btn-danger" onClick={() => handleReverse(je.id)}>Reverse</button>}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No journal entries found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {meta.totalPages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:16}}>
          <button className="btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{padding:'6px 12px',color:'var(--text-secondary)',fontSize:'0.85rem'}}>Page {meta.page} of {meta.totalPages}</span>
          <button className="btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {showCreate && <CreateJournalModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateJournalModal({ onClose }: { onClose: () => void }) {
  const { data: accounts = [] } = useGetGlAccountsQuery({});
  const [createJE, { isLoading }] = useCreateJournalEntryMutation();
  const alertDialog = useAlertDialog();
  const [form, setForm] = useState({ entryDate: new Date().toISOString().split('T')[0], description: '' });
  const [lines, setLines] = useState([
    { accountCode: '', description: '', debit: 0, credit: 0 },
    { accountCode: '', description: '', debit: 0, credit: 0 },
  ]);

  const nonControlAccounts = accounts.filter(a => !a.isControl && a.isActive);
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLine = (idx: number, field: string, value: any) => {
    const newLines = [...lines];
    (newLines[idx] as any)[field] = value;
    setLines(newLines);
  };
  const addLine = () => setLines([...lines, { accountCode: '', description: '', debit: 0, credit: 0 }]);
  const removeLine = (idx: number) => { if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx)); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) { alertDialog('Journal entry must be balanced (Total Debit = Total Credit)'); return; }
    try {
      await createJE({ ...form, lines: lines.filter(l => l.accountCode) }).unwrap();
      onClose();
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || err.data?.message || 'Error creating journal entry');
    }
  };

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal" onClick={e => e.stopPropagation()} style={{maxWidth:850}}>
        <h3>New Journal Entry</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Entry Date</label>
              <input type="date" value={form.entryDate} onChange={e => setForm({...form, entryDate: e.target.value})} required />
            </div>
            <div className="gl-form-group">
              <label>Description</label>
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Journal memo…" required />
            </div>
          </div>

          <div className="je-line-editor">
            <div className="je-line-row" style={{fontWeight:600,fontSize:'0.75rem',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.04em'}}>
              <span>Account</span><span>Description</span><span>Debit</span><span>Credit</span><span></span>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="je-line-row">
                <select value={line.accountCode} onChange={e => updateLine(i, 'accountCode', e.target.value)} required>
                  <option value="">Select…</option>
                  {nonControlAccounts.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                </select>
                <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Line memo" />
                <input type="number" min="0" step="0.01" value={line.debit || ''} onChange={e => updateLine(i, 'debit', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                <input type="number" min="0" step="0.01" value={line.credit || ''} onChange={e => updateLine(i, 'credit', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                <button type="button" className="remove-line" onClick={() => removeLine(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="btn-sm" onClick={addLine} style={{marginTop:6}}>+ Add Line</button>

            <div className="je-totals">
              <span>Total Debit: <strong>{fmtAmt(totalDebit)}</strong></span>
              <span>Total Credit: <strong>{fmtAmt(totalCredit)}</strong></span>
              <span className={isBalanced ? 'balanced' : 'unbalanced'}>
                {isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
              </span>
            </div>
          </div>

          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading || !isBalanced}>
              {isLoading ? 'Creating…' : 'Create Journal Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
