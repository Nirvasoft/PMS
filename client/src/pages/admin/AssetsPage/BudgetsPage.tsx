import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  useGetBudgetsQuery, useCreateBudgetMutation, useUpdateBudgetMutation,
  useDeleteBudgetMutation, useApproveBudgetMutation, useGetBudgetVarianceQuery,
  Budget,
} from '../../../store/api/assetsApi';
import { useGetGlAccountsQuery } from '../../../store/api/glApi';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import '../GLPage/GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function BudgetsPage() {
  const [tab, setTab] = useState<'spreadsheet' | 'variance'>('spreadsheet');
  const [year, setYear] = useState(new Date().getFullYear());
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="gl-page" style={{ maxWidth: 1600 }}>
      <h2>Budgeting</h2>
      <div className="gl-toolbar">
        <button className={`btn-sm ${tab === 'spreadsheet' ? 'btn-primary' : ''}`} onClick={() => setTab('spreadsheet')}>
          📋 Budget Spreadsheet
        </button>
        <button className={`btn-sm ${tab === 'variance' ? 'btn-primary' : ''}`} onClick={() => setTab('variance')}>
          📊 Variance Report
        </button>
        <div style={{ flex: 1 }} />
        <label>FY</label>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2020} max={2099} style={{width:80}} />
        {tab === 'spreadsheet' && <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Budget</button>}
      </div>

      {tab === 'spreadsheet' ? (
        <SpreadsheetTab year={year} />
      ) : (
        <VarianceTab year={year} />
      )}

      {showCreate && <CreateBudgetModal year={year} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SPREADSHEET TAB — inline editable monthly grid
// ═══════════════════════════════════════════════════

function SpreadsheetTab({ year }: { year: number }) {
  const { data: budgets = [], isLoading } = useGetBudgetsQuery({ fiscalYear: year });
  const [updateBudget] = useUpdateBudgetMutation();
  const [approveBudget] = useApproveBudgetMutation();
  const [deleteBudget] = useDeleteBudgetMutation();

  // Track which cell is being edited: `row-col`
  const [editCell, setEditCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Dirty tracking: { budgetId: { monthlyAmounts, annualAmount } }
  const [dirty, setDirty] = useState<Record<string, { monthly: number[]; annual: number }>>({});

  // Get or build the working monthly array for a budget
  const getMonthly = useCallback((b: Budget): number[] => {
    if (dirty[b.id]) return dirty[b.id].monthly;
    return MONTHS.map((_, i) => Number((b.monthlyAmounts as any)?.[String(i + 1)] || 0));
  }, [dirty]);

  const getAnnual = useCallback((b: Budget): number => {
    if (dirty[b.id]) return dirty[b.id].annual;
    return Number(b.annualAmount);
  }, [dirty]);

  // Start editing a cell
  const startEdit = useCallback((budgetId: string, monthIdx: number, currentVal: number) => {
    // Don't allow editing locked/approved budgets
    const budget = budgets.find(b => b.id === budgetId);
    if (budget && budget.status === 'locked') return;
    setEditCell(`${budgetId}-${monthIdx}`);
    setEditValue(currentVal ? String(currentVal) : '');
  }, [budgets]);

  // Commit a cell edit
  const commitEdit = useCallback(async (budgetId: string, monthIdx: number) => {
    const val = parseFloat(editValue) || 0;
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;

    const currentMonthly = getMonthly(budget);
    const newMonthly = [...currentMonthly];
    newMonthly[monthIdx] = val;
    const newAnnual = newMonthly.reduce((s, v) => s + v, 0);

    // Update dirty state
    setDirty(prev => ({ ...prev, [budgetId]: { monthly: newMonthly, annual: newAnnual } }));
    setEditCell(null);
    setEditValue('');

    // Save to server immediately
    const monthlyAmounts: Record<string, number> = {};
    newMonthly.forEach((v, i) => { monthlyAmounts[String(i + 1)] = v; });
    try {
      await updateBudget({ id: budgetId, data: { annualAmount: newAnnual, monthlyAmounts } }).unwrap();
      // Clear dirty since server is now in sync
      setDirty(prev => {
        const next = { ...prev };
        delete next[budgetId];
        return next;
      });
    } catch (err: any) {
      toast.error(err.data?.message || 'Failed to save');
    }
  }, [editValue, budgets, getMonthly, updateBudget]);

  // Focus the input when it appears
  useEffect(() => {
    if (editCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editCell]);

  // Keyboard navigation in the grid
  const handleKeyDown = useCallback((e: React.KeyboardEvent, budgetId: string, monthIdx: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitEdit(budgetId, monthIdx);
      // Move to next cell
      const budgetIdx = budgets.findIndex(b => b.id === budgetId);
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Move left
          if (monthIdx > 0) {
            const prevVal = getMonthly(budgets[budgetIdx])[monthIdx - 1];
            startEdit(budgetId, monthIdx - 1, prevVal);
          }
        } else {
          // Move right
          if (monthIdx < 11) {
            const nextVal = getMonthly(budgets[budgetIdx])[monthIdx + 1];
            startEdit(budgetId, monthIdx + 1, nextVal);
          } else if (budgetIdx < budgets.length - 1) {
            const nextBudget = budgets[budgetIdx + 1];
            if (nextBudget.status !== 'locked') {
              startEdit(nextBudget.id, 0, getMonthly(nextBudget)[0]);
            }
          }
        }
      } else if (e.key === 'Enter') {
        // Move down
        if (budgetIdx < budgets.length - 1) {
          const nextBudget = budgets[budgetIdx + 1];
          if (nextBudget.status !== 'locked') {
            startEdit(nextBudget.id, monthIdx, getMonthly(nextBudget)[monthIdx]);
          }
        }
      }
    } else if (e.key === 'Escape') {
      setEditCell(null);
      setEditValue('');
    }
  }, [commitEdit, budgets, getMonthly, startEdit]);

  // Distribute evenly for a row
  const distributeEvenly = useCallback(async (budgetId: string) => {
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget || budget.status === 'locked') return;
    const annual = getAnnual(budget);
    if (!annual) { toast.error('Set annual amount first'); return; }
    const perMonth = Math.round((annual / 12) * 100) / 100;
    const newMonthly = Array(12).fill(perMonth) as number[];
    newMonthly[11] = Math.round((annual - perMonth * 11) * 100) / 100;

    setDirty(prev => ({ ...prev, [budgetId]: { monthly: newMonthly, annual } }));

    const monthlyAmounts: Record<string, number> = {};
    newMonthly.forEach((v, i) => { monthlyAmounts[String(i + 1)] = v; });
    try {
      await updateBudget({ id: budgetId, data: { annualAmount: annual, monthlyAmounts } }).unwrap();
      setDirty(prev => { const next = { ...prev }; delete next[budgetId]; return next; });
      toast.success('Distributed evenly');
    } catch (err: any) { toast.error('Failed'); }
  }, [budgets, getAnnual, updateBudget]);

  // Copy first month to all
  const copyFirstMonth = useCallback(async (budgetId: string) => {
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget || budget.status === 'locked') return;
    const monthly = getMonthly(budget);
    const first = monthly[0];
    if (!first) { toast.error('First month is empty'); return; }
    const newMonthly = Array(12).fill(first) as number[];
    const newAnnual = first * 12;

    setDirty(prev => ({ ...prev, [budgetId]: { monthly: newMonthly, annual: newAnnual } }));

    const monthlyAmounts: Record<string, number> = {};
    newMonthly.forEach((v, i) => { monthlyAmounts[String(i + 1)] = v; });
    try {
      await updateBudget({ id: budgetId, data: { annualAmount: newAnnual, monthlyAmounts } }).unwrap();
      setDirty(prev => { const next = { ...prev }; delete next[budgetId]; return next; });
      toast.success('Copied to all months');
    } catch (err: any) { toast.error('Failed'); }
  }, [budgets, getMonthly, updateBudget]);

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this budget?')) return;
    try { await approveBudget(id).unwrap(); toast.success('Approved'); } catch (err: any) { toast.error(err.data?.message || 'Error'); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget line?')) return;
    try { await deleteBudget(id).unwrap(); toast.success('Deleted'); } catch (err: any) { toast.error(err.data?.message || 'Error'); }
  };

  // Grand totals
  const monthlyTotals = useMemo(() => {
    return MONTHS.map((_, i) =>
      budgets.reduce((sum, b) => sum + getMonthly(b)[i], 0)
    );
  }, [budgets, getMonthly]);

  const grandTotal = useMemo(() =>
    budgets.reduce((s, b) => s + getAnnual(b), 0)
  , [budgets, getAnnual]);

  return (
    <>
      {/* Summary */}
      <div className="gl-stats">
        <div className="gl-stat-card">
          <div className="stat-value">{budgets.length}</div>
          <div className="stat-label">Budget Lines</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value">{fmtAmt(grandTotal)}</div>
          <div className="stat-label">Total Annual Budget</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value">{budgets.filter(b => b.status === 'draft').length}</div>
          <div className="stat-label">Draft</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value">{budgets.filter(b => b.status === 'approved').length}</div>
          <div className="stat-label">Approved</div>
        </div>
      </div>

      {/* Tip */}
      <div style={{
        padding: '10px 14px', marginBottom: 16, borderRadius: 10, fontSize: 12,
        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        💡 <strong>Tip:</strong> Click any cell to edit. Use <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-hover)', fontSize: 10 }}>Tab</kbd> to move right,{' '}
        <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-hover)', fontSize: 10 }}>Enter</kbd> to move down,{' '}
        <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-hover)', fontSize: 10 }}>Esc</kbd> to cancel. Changes auto-save.
      </div>

      {/* Spreadsheet */}
      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div className="gl-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="gl-table" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface-hover)', minWidth: 80 }}>Account</th>
                <th style={{ position: 'sticky', left: 80, zIndex: 2, background: 'var(--surface-hover)', minWidth: 150 }}>Name</th>
                {MONTHS.map(m => (
                  <th key={m} style={{ textAlign: 'right', minWidth: 85 }}>{m}</th>
                ))}
                <th style={{ textAlign: 'right', minWidth: 100, background: 'rgba(59,130,246,0.06)' }}>Annual</th>
                <th style={{ minWidth: 70 }}>Status</th>
                <th style={{ minWidth: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map(b => {
                const monthly = getMonthly(b);
                const annual = getAnnual(b);
                const isLocked = b.status === 'locked';

                return (
                  <tr key={b.id} style={{ opacity: isLocked ? 0.6 : 1 }}>
                    {/* Sticky account code */}
                    <td style={{
                      fontWeight: 600, position: 'sticky', left: 0, zIndex: 1,
                      background: 'var(--surface)', borderRight: '1px solid var(--border)',
                    }}>
                      {b.glAccount.code}
                    </td>
                    {/* Sticky name */}
                    <td style={{
                      position: 'sticky', left: 80, zIndex: 1,
                      background: 'var(--surface)', borderRight: '2px solid var(--border)',
                      fontSize: 13, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={b.name || b.glAccount.name}>
                      {b.name || b.glAccount.name}
                    </td>

                    {/* ── Monthly cells (editable) ── */}
                    {MONTHS.map((_, i) => {
                      const cellKey = `${b.id}-${i}`;
                      const isEditing = editCell === cellKey;
                      const val = monthly[i];

                      return (
                        <td
                          key={i}
                          className="amount"
                          onClick={() => !isLocked && startEdit(b.id, i, val)}
                          style={{
                            padding: isEditing ? '2px 3px' : undefined,
                            cursor: isLocked ? 'default' : 'cell',
                            background: isEditing ? 'rgba(59,130,246,0.08)' : (val === 0 ? 'rgba(0,0,0,0.02)' : undefined),
                            fontSize: '0.78rem',
                            transition: 'background 0.15s',
                          }}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              type="number"
                              step="0.01"
                              min="0"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(b.id, i)}
                              onKeyDown={e => handleKeyDown(e, b.id, i)}
                              style={{
                                width: '100%', padding: '4px 6px', border: '2px solid var(--primary)',
                                borderRadius: 6, background: 'var(--bg)', color: 'var(--text-primary)',
                                fontSize: '0.8rem', textAlign: 'right', outline: 'none',
                                boxShadow: '0 0 0 3px rgba(59,130,246,0.15)',
                              }}
                            />
                          ) : (
                            <span style={{ color: val === 0 ? 'var(--text-muted, #999)' : 'var(--text-primary)' }}>
                              {val === 0 ? '—' : fmtAmt(val)}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Annual total */}
                    <td className="amount" style={{
                      fontWeight: 700, background: 'rgba(59,130,246,0.04)',
                      borderLeft: '2px solid var(--border)',
                    }}>
                      {fmtAmt(annual)}
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`gl-badge ${b.status === 'approved' ? 'posted' : b.status === 'locked' ? 'locked' : 'draft'}`}>
                        {b.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap' }}>
                        {!isLocked && (
                          <>
                            <button className="btn-sm" onClick={() => distributeEvenly(b.id)} title="Distribute evenly"
                              style={{ fontSize: 11, padding: '3px 6px' }}>⇉</button>
                            <button className="btn-sm" onClick={() => copyFirstMonth(b.id)} title="Copy Jan to all months"
                              style={{ fontSize: 11, padding: '3px 6px' }}>📋</button>
                          </>
                        )}
                        {b.status === 'draft' && (
                          <button className="btn-sm btn-success" onClick={() => handleApprove(b.id)} title="Approve"
                            style={{ fontSize: 11, padding: '3px 6px' }}>✓</button>
                        )}
                        {!isLocked && (
                          <button className="btn-sm btn-danger" onClick={() => handleDelete(b.id)} title="Delete"
                            style={{ fontSize: 11, padding: '3px 6px' }}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {budgets.length === 0 && (
                <tr>
                  <td colSpan={16} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No budgets for FY {year}. Click <strong>+ New Budget</strong> to start.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals footer */}
            {budgets.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: 'var(--surface-hover)' }}>TOTAL</td>
                  <td style={{ position: 'sticky', left: 80, background: 'var(--surface-hover)' }}></td>
                  {monthlyTotals.map((total, i) => (
                    <td key={i} className="amount" style={{ fontWeight: 600, fontSize: '0.78rem' }}>
                      {fmtAmt(total)}
                    </td>
                  ))}
                  <td className="amount" style={{ fontWeight: 700, background: 'rgba(59,130,246,0.06)', borderLeft: '2px solid var(--border)' }}>
                    {fmtAmt(grandTotal)}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════
// VARIANCE TAB — Recharts Bar Chart + Monthly Trend
// ═══════════════════════════════════════════════════

function VarianceTab({ year }: { year: number }) {
  const [month, setMonth] = useState<number | undefined>(undefined);
  const { data: variance, isLoading } = useGetBudgetVarianceQuery({ fiscalYear: year, ...(month ? { month } : {}) });
  const { data: budgets = [] } = useGetBudgetsQuery({ fiscalYear: year });
  const [chartView, setChartView] = useState<'bar' | 'trend'>('bar');

  // Build monthly trend data from budget monthlyAmounts
  const monthlyTrend = useMemo(() => {
    if (!budgets.length) return [];
    return MONTHS.map((m, i) => {
      const budgetTotal = budgets.reduce((sum, b) => {
        return sum + Number((b.monthlyAmounts as any)?.[String(i + 1)] || 0);
      }, 0);
      return { month: m, budget: Math.round(budgetTotal * 100) / 100, actual: 0 };
    });
  }, [budgets]);

  // Bar chart data from variance rows
  const barData = useMemo(() => {
    if (!variance?.rows) return [];
    return variance.rows.map(r => ({
      name: r.glAccountCode,
      fullName: `${r.glAccountCode} — ${r.accountName}`,
      budget: Math.round(r.budgetAmount * 100) / 100,
      actual: Math.round(r.actualAmount * 100) / 100,
      variance: Math.round(r.variance * 100) / 100,
    }));
  }, [variance]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    return (
      <div style={{
        background: 'var(--surface, #fff)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        fontSize: 13,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
          {item?.fullName || label}
        </div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(p.value)}</span>
          </div>
        ))}
        {item?.variance !== undefined && (
          <div style={{
            marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)',
            fontSize: 12, fontWeight: 600,
            color: item.variance >= 0 ? '#10b981' : '#ef4444',
          }}>
            Variance: {item.variance >= 0 ? '+' : ''}{fmtAmt(item.variance)}
          </div>
        )}
      </div>
    );
  };

  const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: 'var(--surface, #fff)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        fontSize: 13,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="gl-toolbar" style={{ marginBottom: 12 }}>
        <label>Month</label>
        <select value={month || ''} onChange={e => setMonth(e.target.value ? parseInt(e.target.value) : undefined)}>
          <option value="">Full Year</option>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 2 }}>
          <button onClick={() => setChartView('bar')} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: 'none', transition: 'all 0.2s',
            background: chartView === 'bar' ? 'var(--primary)' : 'transparent',
            color: chartView === 'bar' ? '#fff' : 'var(--text-secondary)',
          }}>
            📊 By Account
          </button>
          <button onClick={() => setChartView('trend')} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: 'none', transition: 'all 0.2s',
            background: chartView === 'trend' ? 'var(--primary)' : 'transparent',
            color: chartView === 'trend' ? '#fff' : 'var(--text-secondary)',
          }}>
            📈 Monthly Trend
          </button>
        </div>
      </div>

      {isLoading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : variance && (
        <>
          {/* Summary cards */}
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
              <div className="stat-value" style={{ color: variance.summary.totalVariance >= 0 ? '#10b981' : '#ef4444' }}>
                {variance.summary.totalVariance >= 0 ? '+' : ''}{fmtAmt(variance.summary.totalVariance)}
              </div>
              <div className="stat-label">Variance</div>
            </div>
            <div className="gl-stat-card">
              <div className="stat-value" style={{ color: variance.summary.totalVariancePct >= 0 ? '#10b981' : '#ef4444' }}>
                {variance.summary.totalVariancePct >= 0 ? '+' : ''}{variance.summary.totalVariancePct}%
              </div>
              <div className="stat-label">Variance %</div>
            </div>
          </div>

          {/* ══ Charts ══ */}
          {chartView === 'bar' && barData.length > 0 && (
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: '24px 20px',
              border: '1px solid var(--border)', marginBottom: 20,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: 'var(--text-primary)' }}>
                Budget vs Actual by Account
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
                {month ? `${MONTHS[month - 1]} ${year}` : `Full Year ${year}`} — Grouped bar comparison
              </div>
              <ResponsiveContainer width="100%" height={Math.max(300, barData.length * 50)}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  barGap={4}
                  barCategoryGap="25%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={70}
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    iconType="square"
                    iconSize={10}
                  />
                  <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="actual" name="Actual" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.variance >= 0 ? '#10b981' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartView === 'trend' && monthlyTrend.length > 0 && (
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: '24px 20px',
              border: '1px solid var(--border)', marginBottom: 20,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: 'var(--text-primary)' }}>
                Monthly Budget Allocation
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
                FY {year} — Monthly budget distribution across all accounts
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="budgetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="var(--text-secondary)"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                  <Area
                    type="monotone"
                    dataKey="budget"
                    name="Budget"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#budgetGrad)"
                    dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Variance table */}
          <div className="gl-table-wrap">
            <table className="gl-table">
              <thead>
                <tr>
                  <th>Account</th><th>Account Name</th>
                  <th style={{ textAlign: 'right' }}>Budget</th>
                  <th style={{ textAlign: 'right' }}>Actual</th>
                  <th style={{ textAlign: 'right' }}>Variance</th>
                  <th>%</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {variance.rows.map(r => (
                  <tr key={r.budgetId}>
                    <td style={{ fontWeight: 600 }}>{r.glAccountCode}</td>
                    <td>{r.accountName}</td>
                    <td className="amount">{fmtAmt(r.budgetAmount)}</td>
                    <td className="amount">{fmtAmt(r.actualAmount)}</td>
                    <td className={`amount ${r.variance >= 0 ? 'positive' : 'negative'}`}>{fmtAmt(r.variance)}</td>
                    <td style={{ color: r.variance >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
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
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No budget data for FY {year}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════
// CREATE BUDGET MODAL
// ═══════════════════════════════════════════════════

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
      toast.success('Budget created');
      onClose();
    } catch (err: any) {
      toast.error(err.data?.errors?.[0]?.message || err.data?.message || 'Error');
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
