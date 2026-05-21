import { useState } from 'react';
import { useGetBalanceSheetQuery } from '../../../store/api/glApi';
import './GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: bs, isLoading } = useGetBalanceSheetQuery({ asOfDate });

  const renderSection = (title: string, icon: string, rows: any[], total: number, colorClass: string) => (
    <div className="report-section">
      <h4>{icon} {title}</h4>
      {rows.length > 0 ? rows.map((r: any) => (
        <div key={r.accountId} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border)'}}>
          <span style={{color:'var(--text-primary)'}}>{r.code} — {r.name}</span>
          <span className={`amount ${colorClass}`} style={{fontWeight:600}}>{fmtAmt(r.netBalance)}</span>
        </div>
      )) : <p style={{padding:12,color:'var(--text-muted)',textAlign:'center'}}>No entries</p>}
      <div className="report-total-row">
        <span>Total {title}</span>
        <span className={`amount ${colorClass}`}>{fmtAmt(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="gl-page">
      <h2>Balance Sheet</h2>
      <div className="gl-toolbar">
        <label>As of Date</label>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
        <div style={{ flex: 1 }} />
        {bs && (
          <span className={`report-balanced ${bs.isBalanced ? 'yes' : 'no'}`}>
            {bs.isBalanced ? '✓ A = L + E' : '✗ Out of Balance'}
          </span>
        )}
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : bs && (
        <>
          {renderSection('Assets', '🏢', bs.assets, bs.totalAssets, 'positive')}

          {renderSection('Liabilities', '📋', bs.liabilities, bs.totalLiabilities, 'negative')}

          <div className="report-section">
            <h4>💎 Equity</h4>
            {bs.equity.length > 0 ? bs.equity.map((r: any) => (
              <div key={r.accountId} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text-primary)'}}>{r.code} — {r.name}</span>
                <span className="amount" style={{fontWeight:600}}>{fmtAmt(r.netBalance)}</span>
              </div>
            )) : null}
            {bs.retainedEarnings !== 0 && (
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid var(--border)',fontStyle:'italic'}}>
                <span style={{color:'var(--text-secondary)'}}>Retained Earnings (Current Period)</span>
                <span className={`amount ${bs.retainedEarnings >= 0 ? 'positive' : 'negative'}`} style={{fontWeight:600}}>{fmtAmt(bs.retainedEarnings)}</span>
              </div>
            )}
            <div className="report-total-row">
              <span>Total Equity</span>
              <span className="amount">{fmtAmt(bs.totalEquity)}</span>
            </div>
          </div>

          {/* Balance Check Summary */}
          <div className="gl-stats">
            <div className="gl-stat-card">
              <div className="stat-value" style={{color:'var(--success, #22c55e)'}}>{fmtAmt(bs.totalAssets)}</div>
              <div className="stat-label">Total Assets</div>
            </div>
            <div className="gl-stat-card" style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',fontWeight:700,color:'var(--text-muted)'}}>
              =
            </div>
            <div className="gl-stat-card">
              <div className="stat-value" style={{color:'var(--primary, #3b82f6)'}}>{fmtAmt(bs.totalLiabilitiesAndEquity)}</div>
              <div className="stat-label">Liabilities + Equity</div>
            </div>
          </div>

          <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:8}}>
            As of {asOfDate} · Generated: {new Date(bs.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
