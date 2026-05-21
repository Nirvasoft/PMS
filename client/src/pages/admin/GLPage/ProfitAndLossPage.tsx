import { useState } from 'react';
import { useGetPnLQuery } from '../../../store/api/glApi';
import './GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Simple CSS bar chart component (no external deps)
function BarChart({ data, maxVal }: { data: Array<{ label: string; current: number; previous: number }>; maxVal: number }) {
  if (data.length === 0) return null;
  const scale = maxVal > 0 ? 100 / maxVal : 1;
  return (
    <div style={{ marginTop: 12, padding: '12px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 120, fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.label}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 14, borderRadius: 4, background: 'rgba(59,130,246,0.3)', width: `${Math.abs(d.current) * scale}%`, minWidth: d.current !== 0 ? 4 : 0, transition: 'width 0.5s ease' }}>
              <div style={{ height: '100%', borderRadius: 4, background: '#3b82f6', width: '100%' }} />
            </div>
            {d.previous !== 0 && (
              <div style={{ height: 10, borderRadius: 3, background: 'rgba(148,163,184,0.3)', width: `${Math.abs(d.previous) * scale}%`, minWidth: 4, transition: 'width 0.5s ease' }}>
                <div style={{ height: '100%', borderRadius: 3, background: '#94a3b8', width: '100%' }} />
              </div>
            )}
          </div>
          <div style={{ width: 80, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-primary)' }}>
            {fmtAmt(d.current)}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 8, borderRadius: 2, background: '#3b82f6', display: 'inline-block' }} /> Current
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 6, borderRadius: 2, background: '#94a3b8', display: 'inline-block' }} /> Previous
        </span>
      </div>
    </div>
  );
}

export default function ProfitAndLossPage() {
  const now = new Date();
  const [fromDate, setFromDate] = useState(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(now.toISOString().split('T')[0]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const prevYear = now.getFullYear() - 1;
  const [compareFromDate, setCompareFromDate] = useState(`${prevYear}-01-01`);
  const [compareToDate, setCompareToDate] = useState(`${prevYear}-12-31`);

  const queryParams: any = { fromDate, toDate };
  if (compareEnabled) {
    queryParams.compareFromDate = compareFromDate;
    queryParams.compareToDate = compareToDate;
  }
  const { data: pnl, isLoading } = useGetPnLQuery(queryParams);

  const comparison = pnl?.comparison;

  // Prepare chart data if comparison is available
  const chartData = comparison ? [
    ...comparison.income.map((r: any) => ({ label: r.name, current: r.netBalance, previous: r.previousBalance })),
    ...comparison.expense.map((r: any) => ({ label: r.name, current: r.netBalance, previous: r.previousBalance })),
  ] : [];
  const maxChartVal = chartData.length > 0 ? Math.max(...chartData.map(d => Math.max(Math.abs(d.current), Math.abs(d.previous)))) : 0;

  return (
    <div className="gl-page">
      <h2>Profit & Loss Statement</h2>
      <div className="gl-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label>From</label>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <label>To</label>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={compareEnabled} onChange={e => setCompareEnabled(e.target.checked)}
            style={{ accentColor: '#3b82f6' }} />
          Compare period
        </label>
        {compareEnabled && (
          <>
            <input type="date" value={compareFromDate} onChange={e => setCompareFromDate(e.target.value)} />
            <span style={{ color: 'var(--text-secondary)' }}>to</span>
            <input type="date" value={compareToDate} onChange={e => setCompareToDate(e.target.value)} />
          </>
        )}
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : pnl && (
        <>
          {/* Income Section */}
          <div className="report-section">
            <h4>📈 Revenue / Income</h4>
            {pnl.income.length > 0 ? pnl.income.map(r => {
              const comp = comparison?.income.find((c: any) => c.code === r.code);
              return (
                <div key={r.accountId} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border)', alignItems: 'center'}}>
                  <span style={{color:'var(--text-primary)', flex: 1}}>{r.code} — {r.name}</span>
                  <span className="amount positive" style={{fontWeight:600, width: 120, textAlign: 'right'}}>{fmtAmt(r.netBalance)}</span>
                  {comp && (
                    <span style={{ width: 100, textAlign: 'right', fontSize: 12, color: comp.variance >= 0 ? '#10b981' : '#ef4444' }}>
                      {comp.variance >= 0 ? '▲' : '▼'} {fmtAmt(Math.abs(comp.variance))}
                    </span>
                  )}
                </div>
              );
            }) : <p style={{padding:12,color:'var(--text-muted)',textAlign:'center'}}>No income recorded</p>}
            <div className="report-total-row">
              <span>Total Income</span>
              <span className="amount positive">{fmtAmt(pnl.totalIncome)}</span>
              {comparison && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 12 }}>
                  (prev: {fmtAmt(comparison.prevTotalIncome)})
                </span>
              )}
            </div>
          </div>

          {/* Expense Section */}
          <div className="report-section">
            <h4>📉 Operating Expenses</h4>
            {pnl.expense.length > 0 ? pnl.expense.map(r => {
              const comp = comparison?.expense.find((c: any) => c.code === r.code);
              return (
                <div key={r.accountId} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border)', alignItems: 'center'}}>
                  <span style={{color:'var(--text-primary)', flex: 1}}>{r.code} — {r.name}</span>
                  <span className="amount negative" style={{fontWeight:600, width: 120, textAlign: 'right'}}>{fmtAmt(r.netBalance)}</span>
                  {comp && (
                    <span style={{ width: 100, textAlign: 'right', fontSize: 12, color: comp.variance <= 0 ? '#10b981' : '#ef4444' }}>
                      {comp.variance <= 0 ? '▼' : '▲'} {fmtAmt(Math.abs(comp.variance))}
                    </span>
                  )}
                </div>
              );
            }) : <p style={{padding:12,color:'var(--text-muted)',textAlign:'center'}}>No expenses recorded</p>}
            <div className="report-total-row">
              <span>Total Expenses</span>
              <span className="amount negative">{fmtAmt(pnl.totalExpense)}</span>
              {comparison && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 12 }}>
                  (prev: {fmtAmt(comparison.prevTotalExpense)})
                </span>
              )}
            </div>
          </div>

          {/* Net Profit */}
          <div className="report-net-profit">
            <div className="label">Net Profit / (Loss)</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div className="value" style={{color: pnl.netProfit >= 0 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}}>
                {pnl.netProfit >= 0 ? '' : '('}{fmtAmt(Math.abs(pnl.netProfit))}{pnl.netProfit < 0 ? ')' : ''}
              </div>
              {comparison && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  vs {fmtAmt(comparison.prevNetProfit)} prev
                  <span style={{
                    marginLeft: 8, fontWeight: 600, fontSize: 13,
                    color: (pnl.netProfit - comparison.prevNetProfit) >= 0 ? '#10b981' : '#ef4444',
                  }}>
                    ({(pnl.netProfit - comparison.prevNetProfit) >= 0 ? '+' : ''}{fmtAmt(pnl.netProfit - comparison.prevNetProfit)})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Comparison Chart */}
          {comparison && chartData.length > 0 && (
            <div className="report-section" style={{ marginTop: 16 }}>
              <h4>📊 Period Comparison</h4>
              <BarChart data={chartData} maxVal={maxChartVal} />
            </div>
          )}

          <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:8}}>
            Period: {fromDate} to {toDate}
            {comparison && ` vs ${comparison.period.fromDate} to ${comparison.period.toDate}`}
            {' '}· Generated: {new Date(pnl.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
