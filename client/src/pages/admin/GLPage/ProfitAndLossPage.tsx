import { useState } from 'react';
import { useGetPnLQuery } from '../../../store/api/glApi';
import './GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProfitAndLossPage() {
  const now = new Date();
  const [fromDate, setFromDate] = useState(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(now.toISOString().split('T')[0]);
  const { data: pnl, isLoading } = useGetPnLQuery({ fromDate, toDate });

  return (
    <div className="gl-page">
      <h2>Profit & Loss Statement</h2>
      <div className="gl-toolbar">
        <label>From</label>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <label>To</label>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : pnl && (
        <>
          {/* Income Section */}
          <div className="report-section">
            <h4>📈 Revenue / Income</h4>
            {pnl.income.length > 0 ? pnl.income.map(r => (
              <div key={r.accountId} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text-primary)'}}>{r.code} — {r.name}</span>
                <span className="amount positive" style={{fontWeight:600}}>{fmtAmt(r.netBalance)}</span>
              </div>
            )) : <p style={{padding:12,color:'var(--text-muted)',textAlign:'center'}}>No income recorded</p>}
            <div className="report-total-row">
              <span>Total Income</span>
              <span className="amount positive">{fmtAmt(pnl.totalIncome)}</span>
            </div>
          </div>

          {/* Expense Section */}
          <div className="report-section">
            <h4>📉 Operating Expenses</h4>
            {pnl.expense.length > 0 ? pnl.expense.map(r => (
              <div key={r.accountId} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text-primary)'}}>{r.code} — {r.name}</span>
                <span className="amount negative" style={{fontWeight:600}}>{fmtAmt(r.netBalance)}</span>
              </div>
            )) : <p style={{padding:12,color:'var(--text-muted)',textAlign:'center'}}>No expenses recorded</p>}
            <div className="report-total-row">
              <span>Total Expenses</span>
              <span className="amount negative">{fmtAmt(pnl.totalExpense)}</span>
            </div>
          </div>

          {/* Net Profit */}
          <div className="report-net-profit">
            <div className="label">Net Profit / (Loss)</div>
            <div className="value" style={{color: pnl.netProfit >= 0 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}}>
              {pnl.netProfit >= 0 ? '' : '('}{fmtAmt(Math.abs(pnl.netProfit))}{pnl.netProfit < 0 ? ')' : ''}
            </div>
          </div>

          <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:8}}>
            Period: {fromDate} to {toDate} · Generated: {new Date(pnl.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
