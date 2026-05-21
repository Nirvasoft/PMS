import { useState } from 'react';
import {
  useGetBudgetsQuery, useCreateBudgetMutation, useUpdateBudgetMutation,
  useDeleteBudgetMutation, useApproveBudgetMutation, useGetBudgetVarianceQuery,
} from '../../../store/api/assetsApi';
import { useGetGlAccountsQuery } from '../../../store/api/glApi';
import '../GLPage/GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function BudgetsPage() {
  const [tab, setTab] = useState<'list' | 'variance'>('list');
  const [year, setYear] = useState(new Date().getFullYear());
  const [showCreate, setShowCreate] = useState(false);
  const { data: budgets = [], isLoading } = useGetBudgetsQuery({ fiscalYear: year });
  const [approveBudget] = useApproveBudgetMutation();
  const [deleteBudget] = useDeleteBudgetMutation();

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this budget?')) return;
    try { await approveBudget(id).unwrap(); } catch (err: any) { alert(err.data?.errors?.[0]?.message || 'Error'); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget?')) return;
    try { await deleteBudget(id).unwrap(); } catch (err: any) { alert(err.data?.errors?.[0]?.message || 'Error'); }
  };

  const totalBudget = budgets.reduce((s, b) => s + Number(b.annualAmount), 0);

  return (
    <div className="gl-page">
      <h2>Budgeting</h2>
      <div className="gl-toolbar">
        <button className={`btn-sm ${tab === 'list' ? 'btn-primary' : ''}`} onClick={() => setTab('list')}>📋 Budget List</button>
        <button className={`btn-sm ${tab === 'variance' ? 'btn-primary' : ''}`} onClick={() => setTab('variance')}>📊 Variance Report</button>
        <div style={{ flex: 1 }} />
        <label>FY</label>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2020} max={2099} style={{width:80}} />
        {tab === 'list' && <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Budget</button>}
      </div>

      {tab === 'list' ? (
        <>
          <div className="gl-stats">
            <div className="gl-stat-card">
              <div className="stat-value">{budgets.length}</div>
              <div className="stat-label">Budget Lines</div>
            </div>
            <div className="gl-stat-card">
              <div className="stat-value">{fmtAmt(totalBudget)}</div>
              <div className="stat-label">Total Annual Budget</div>
            </div>
          </div>

          {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
            <div className="gl-table-wrap">
              <table className="gl-table">
                <thead>
                  <tr><th>Account</th><th>Name</th><th>Annual</th>{MONTHS.map(m => <th key={m}>{m}</th>)}<th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {budgets.map(b => (
                    <tr key={b.id}>
                      <td style={{fontWeight:600}}>{b.glAccount.code}</td>
                      <td>{b.name || b.glAccount.name}</td>
                      <td className="amount">{fmtAmt(Number(b.annualAmount))}</td>
                      {MONTHS.map((_, i) => (
                        <td key={i} className="amount" style={{fontSize:'0.75rem'}}>
                          {fmtAmt(Number((b.monthlyAmounts as any)?.[String(i + 1)] || 0))}
                        </td>
                      ))}
                      <td><span className={`gl-badge ${b.status === 'approved' ? 'posted' : b.status === 'locked' ? 'locked' : 'draft'}`}>{b.status}</span></td>
                      <td style={{display:'flex',gap:4}}>
                        {b.status === 'draft' && <button className="btn-sm btn-success" onClick={() => handleApprove(b.id)}>✓</button>}
                        {b.status !== 'locked' && <button className="btn-sm btn-danger" onClick={() => handleDelete(b.id)}>✕</button>}
                      </td>
                    </tr>
                  ))}
                  {budgets.length === 0 && (
                    <tr><td colSpan={16} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No budgets for FY {year}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <VarianceTab year={year} />
      )}

      {showCreate && <CreateBudgetModal year={year} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function VarianceTab({ year }: { year: number }) {
  const [month, setMonth] = useState<number | undefined>(undefined);
  const { data: variance, isLoading } = useGetBudgetVarianceQuery({ fiscalYear: year, ...(month ? { month } : {}) });

  return (
    <>
      <div className="gl-toolbar" style={{marginBottom:12}}>
        <label>Month</label>
        <select value={month || ''} onChange={e => setMonth(e.target.value ? parseInt(e.target.value) : undefined)}>
          <option value="">Full Year</option>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : variance && (
        <>
          <div className="gl-stats">
            <div className="gl-stat-card">
              <div className="stat-value">{fmtAmt(variance.summary.totalBudget)}</div>
              <div className="stat-label">Total Budget</div>
            </div>
            <div className="gl-stat-card">
              <div className="stat-value">{fmtAmt(variance.summary.totalActual)}</div>
              <div className="stat-label">Total Actual</div>
            </div>
            <div className="gl-stat-card">
              <div className="stat-value" style={{color: variance.summary.totalVariance >= 0 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}}>
                {fmtAmt(variance.summary.totalVariance)}
              </div>
              <div className="stat-label">Variance ({variance.summary.totalVariancePct}%)</div>
            </div>
          </div>

          {/* Variance Bar Chart */}
          {variance.rows.length > 0 && (() => {
            const maxVal = Math.max(...variance.rows.map(r => Math.max(r.budgetAmount, r.actualAmount)));
            const scale = maxVal > 0 ? 100 / maxVal : 1;
            return (
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 12, padding: '20px 24px',
                border: '1px solid var(--border-color)', marginBottom: 16,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>📊 Budget vs Actual</div>
                {variance.rows.map(r => (
                  <div key={r.budgetId} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.glAccountCode} — {r.accountName}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: r.status === 'under_budget' ? '#10b981' : '#ef4444',
                      }}>
                        {r.variancePct > 0 ? '+' : ''}{r.variancePct}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 50, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>Budget</span>
                        <div style={{ flex: 1, height: 16, background: 'var(--bg-tertiary, rgba(0,0,0,0.05))', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 4,
                            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                            width: `${r.budgetAmount * scale}%`, minWidth: r.budgetAmount > 0 ? 4 : 0,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <span style={{ width: 80, fontSize: 12, fontFamily: 'monospace', textAlign: 'right' }}>{fmtAmt(r.budgetAmount)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 50, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>Actual</span>
                        <div style={{ flex: 1, height: 16, background: 'var(--bg-tertiary, rgba(0,0,0,0.05))', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 4,
                            background: r.status === 'under_budget'
                              ? 'linear-gradient(90deg, #10b981, #34d399)'
                              : 'linear-gradient(90deg, #ef4444, #f87171)',
                            width: `${r.actualAmount * scale}%`, minWidth: r.actualAmount > 0 ? 4 : 0,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <span style={{ width: 80, fontSize: 12, fontFamily: 'monospace', textAlign: 'right' }}>{fmtAmt(r.actualAmount)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 10, borderRadius: 2, background: '#3b82f6', display: 'inline-block' }} /> Budget
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 10, borderRadius: 2, background: '#10b981', display: 'inline-block' }} /> Under Budget
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 10, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} /> Over Budget
                  </span>
                </div>
              </div>
            );
          })()}

          <div className="gl-table-wrap">
            <table className="gl-table">
              <thead>
                <tr><th>Account</th><th>Account Name</th><th style={{textAlign:'right'}}>Budget</th><th style={{textAlign:'right'}}>Actual</th><th style={{textAlign:'right'}}>Variance</th><th>%</th><th>Status</th></tr>
              </thead>
              <tbody>
                {variance.rows.map(r => (
                  <tr key={r.budgetId}>
                    <td style={{fontWeight:600}}>{r.glAccountCode}</td>
                    <td>{r.accountName}</td>
                    <td className="amount">{fmtAmt(r.budgetAmount)}</td>
                    <td className="amount">{fmtAmt(r.actualAmount)}</td>
                    <td className={`amount ${r.variance >= 0 ? 'positive' : 'negative'}`}>{fmtAmt(r.variance)}</td>
                    <td style={{color: r.variance >= 0 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)', fontWeight:600}}>
                      {r.variancePct > 0 ? '+' : ''}{r.variancePct}%
                    </td>
                    <td>
                      <span className={`gl-badge ${r.status === 'under_budget' ? 'posted' : 'reversed'}`}>
                        {r.status === 'under_budget' ? '✓ Under' : '✗ Over'}
                      </span>
                    </td>
                  </tr>
                ))}
                {variance.rows.length === 0 && (
                  <tr><td colSpan={7} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No budget data for FY {year}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function CreateBudgetModal({ year, onClose }: { year: number; onClose: () => void }) {
  const { data: accounts = [] } = useGetGlAccountsQuery({});
  const [createBudget, { isLoading }] = useCreateBudgetMutation();
  const expenseAccounts = accounts.filter(a => (a.accountType === 'expense' || a.accountType === 'income') && a.isActive && !a.isControl);

  const [form, setForm] = useState({
    glAccountId: '', name: '', annualAmount: 0,
    monthly: Array(12).fill(0) as number[],
  });

  const totalMonthly = form.monthly.reduce((s, v) => s + (Number(v) || 0), 0);

  const handleMonthlyChange = (idx: number, val: number) => {
    const newMonthly = [...form.monthly];
    newMonthly[idx] = val;
    setForm({ ...form, monthly: newMonthly, annualAmount: newMonthly.reduce((s, v) => s + (Number(v) || 0), 0) });
  };

  const distributeEvenly = () => {
    if (!form.annualAmount) return;
    const perMonth = Math.round((form.annualAmount / 12) * 100) / 100;
    const monthly = Array(12).fill(perMonth);
    monthly[11] = Math.round((form.annualAmount - perMonth * 11) * 100) / 100;
    setForm({ ...form, monthly });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const monthlyAmounts: Record<string, number> = {};
    form.monthly.forEach((v, i) => { monthlyAmounts[String(i + 1)] = v; });
    try {
      await createBudget({
        fiscalYear: year,
        glAccountId: form.glAccountId,
        name: form.name || null,
        annualAmount: form.annualAmount,
        monthlyAmounts,
      }).unwrap();
      onClose();
    } catch (err: any) {
      alert(err.data?.errors?.[0]?.message || err.data?.message || 'Error');
    }
  };

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal" onClick={e => e.stopPropagation()} style={{maxWidth:800}}>
        <h3>New Budget — FY {year}</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>GL Account</label>
              <select value={form.glAccountId} onChange={e => setForm({...form, glAccountId: e.target.value})} required>
                <option value="">Select account…</option>
                {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div className="gl-form-group">
              <label>Budget Name (optional)</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Maintenance Budget" />
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Annual Amount</label>
              <input type="number" min="0" step="0.01" value={form.annualAmount || ''} onChange={e => setForm({...form, annualAmount: parseFloat(e.target.value) || 0})} required />
            </div>
            <div className="gl-form-group" style={{display:'flex',alignItems:'flex-end'}}>
              <button type="button" className="btn-sm" onClick={distributeEvenly}>Distribute Evenly</button>
            </div>
          </div>
          <div style={{marginTop:12}}>
            <label style={{fontSize:'0.8rem',fontWeight:500,color:'var(--text-secondary)'}}>Monthly Breakdown</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6,marginTop:6}}>
              {MONTHS.map((m, i) => (
                <div key={i} style={{textAlign:'center'}}>
                  <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginBottom:2}}>{m}</div>
                  <input type="number" min="0" step="0.01" value={form.monthly[i] || ''} onChange={e => handleMonthlyChange(i, parseFloat(e.target.value) || 0)}
                    style={{width:'100%',padding:'5px 4px',border:'1px solid var(--border)',borderRadius:6,background:'var(--bg)',color:'var(--text-primary)',fontSize:'0.8rem',textAlign:'right'}} />
                </div>
              ))}
            </div>
            <div style={{textAlign:'right',marginTop:6,fontSize:'0.85rem',color:'var(--text-secondary)'}}>
              Monthly Total: <strong style={{color: Math.abs(totalMonthly - form.annualAmount) < 0.01 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}}>{fmtAmt(totalMonthly)}</strong>
            </div>
          </div>
          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Creating…' : 'Create Budget'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
