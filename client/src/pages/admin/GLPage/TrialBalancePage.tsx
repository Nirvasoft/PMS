import { useState } from 'react';
import { Scale } from 'lucide-react';
import { useGetTrialBalanceQuery } from '../../../store/api/glApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import TableScrollWrapper from '../../../components/TableScrollWrapper';
import './GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TrialBalancePage() {
  const selectedPropertyId = useSelectedPropertyId();
  const now = new Date();
  const [fromDate, setFromDate] = useState(`${now.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(now.toISOString().split('T')[0]);
  const { data: tb, isLoading } = useGetTrialBalanceQuery({
    fromDate,
    toDate,
    propertyId: selectedPropertyId || undefined,
  });

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Scale size={22} />
          </div>
          <div>
            <h1>Trial Balance</h1>
            <p>{tb?.rows.length ?? 0} total accounts</p>
          </div>
        </div>
      </div>

      <div className="gl-toolbar">
        <label>From</label>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <label>To</label>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        <div style={{ flex: 1 }} />
        {tb && (
          <>
            <button
              onClick={() => {
                const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
                const propParam = selectedPropertyId ? `&propertyId=${encodeURIComponent(selectedPropertyId)}` : '';
                const url = `/api/v1/gl/trial-balance?fromDate=${fromDate}&toDate=${toDate}${propParam}&format=csv`;
                fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `trial-balance-${toDate}.csv`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  });
              }}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              📥 Export CSV
            </button>
            <span className={`report-balanced ${tb.summary.isBalanced ? 'yes' : 'no'}`}>
              {tb.summary.isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
            </span>
          </>
        )}
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : tb && (
        <div className="gl-table-wrap">
          <TableScrollWrapper>
            <table className="gl-table">
              <thead>
                <tr>
                  <th>Code</th><th>Account Name</th><th>Type</th>
                  <th style={{textAlign:'right'}}>Debit</th>
                  <th style={{textAlign:'right'}}>Credit</th>
                  <th style={{textAlign:'right'}}>Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map(r => (
                  <tr key={r.accountId}>
                    <td style={{fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{r.code}</td>
                    <td>{r.name}</td>
                    <td><span className={`gl-type-chip ${r.accountType}`}>{r.accountType}</span></td>
                    <td className="amount">{fmtAmt(r.totalDebit)}</td>
                    <td className="amount">{fmtAmt(r.totalCredit)}</td>
                    <td className={`amount ${r.netBalance >= 0 ? 'positive' : 'negative'}`}>{fmtAmt(r.netBalance)}</td>
                  </tr>
                ))}
                {tb.rows.length === 0 && (
                  <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No posted transactions in this period</td></tr>
                )}
              </tbody>
              {tb.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{fontWeight:700}}>TOTALS</td>
                    <td className="amount">{fmtAmt(tb.summary.totalDebit)}</td>
                    <td className="amount">{fmtAmt(tb.summary.totalCredit)}</td>
                    <td className={`amount ${tb.summary.isBalanced ? 'positive' : 'negative'}`}>
                      {fmtAmt(tb.summary.totalDebit - tb.summary.totalCredit)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </TableScrollWrapper>
        </div>
      )}

      {tb && <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:8}}>Generated: {new Date(tb.generatedAt).toLocaleString()}</p>}
    </div>
  );
}
