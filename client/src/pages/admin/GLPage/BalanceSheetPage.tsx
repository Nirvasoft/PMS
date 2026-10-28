import { useState } from 'react';
import { Landmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppSelector } from '../../../store';
import { useGetBalanceSheetQuery } from '../../../store/api/glApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import './GLPage.css';

import { formatCompactAmount as fmtAmt } from '../../../utils/formatCurrency';

export default function BalanceSheetPage() {
  const selectedPropertyId = useSelectedPropertyId();
  const accessToken = useAppSelector(s => s.auth.accessToken);
  const [exporting, setExporting] = useState(false);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: bs, isLoading } = useGetBalanceSheetQuery({
    asOfDate,
    propertyId: selectedPropertyId || undefined,
  });

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const propParam = selectedPropertyId ? `&propertyId=${encodeURIComponent(selectedPropertyId)}` : '';
      const url = `/api/v1/gl/reports/balance-sheet?asOfDate=${asOfDate}${propParam}&format=xlsx`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `balance-sheet-${asOfDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Failed to export Balance Sheet');
    } finally {
      setExporting(false);
    }
  };

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
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Landmark size={22} />
          </div>
          <div>
            <h1>Balance Sheet</h1>
            <p>{(bs?.assets.length ?? 0) + (bs?.liabilities.length ?? 0) + (bs?.equity.length ?? 0)} total accounts</p>
          </div>
        </div>
      </div>
      <div className="gl-toolbar">
        <label>As of Date</label>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
        <div style={{ flex: 1 }} />
        {bs && (
          <>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', cursor: exporting ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center',
                opacity: exporting ? 0.7 : 1,
              }}
            >
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
            <span className={`report-balanced ${bs.isBalanced ? 'yes' : 'no'}`}>
              {bs.isBalanced ? '✓ A = L + E' : '✗ Out of Balance'}
            </span>
          </>
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
