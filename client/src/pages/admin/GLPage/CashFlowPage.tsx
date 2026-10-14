import { useState } from 'react';
import { Activity } from 'lucide-react';
import { useGetCashFlowQuery } from '../../../store/api/glApi';
import TableScrollWrapper from '../../../components/TableScrollWrapper';
import './GLPage.css';

export default function CashFlowPage() {
  const year = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${year}-01-01`);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: cf, isLoading } = useGetCashFlowQuery({ fromDate, toDate });

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n < -0.01) return `(${formatted})`;
    return formatted;
  };

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Activity size={22} />
          </div>
          <div>
            <h1>Cash Flow Statement</h1>
            <p>Operating, investing & financing cash movements</p>
          </div>
        </div>
      </div>

      <div className="gl-toolbar">
        <label>From</label>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <label>To</label>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
      </div>

      {isLoading && <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>Loading cash flow statement...</div>}

      {cf && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Net Income', value: cf.netIncome, icon: '📈', color: '#10b981' },
              { label: 'Operating', value: cf.operating.net, icon: '⚙️', color: '#3b82f6' },
              { label: 'Investing', value: cf.investing.net, icon: '🏗️', color: '#f59e0b' },
              { label: 'Financing', value: cf.financing.net, icon: '🏦', color: '#8b5cf6' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--bg-secondary)', borderRadius: 12, padding: '20px 24px',
                border: '1px solid var(--border-color)',
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{c.icon} {c.label}</div>
                <div style={{
                  fontSize: 22, fontWeight: 700,
                  color: c.value >= 0 ? '#10b981' : '#ef4444',
                }}>{fmt(c.value)}</div>
              </div>
            ))}
          </div>

          {/* Net Cash Change Banner */}
          <div style={{
            background: cf.netCashChange >= 0
              ? 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.05))'
              : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05))',
            border: `1px solid ${cf.netCashChange >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: 12, padding: '16px 24px', marginBottom: 24,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Net Change in Cash</span>
            <span style={{
              fontSize: 24, fontWeight: 700,
              color: cf.netCashChange >= 0 ? '#10b981' : '#ef4444',
            }}>{cf.netCashChange >= 0 ? '+' : '-'}{fmt(cf.netCashChange)}</span>
          </div>

          {/* Three Sections */}
          {[
            { title: '⚙️ Operating Activities', section: cf.operating, color: '#3b82f6' },
            { title: '🏗️ Investing Activities', section: cf.investing, color: '#f59e0b' },
            { title: '🏦 Financing Activities', section: cf.financing, color: '#8b5cf6' },
          ].map(({ title, section, color }) => (
            <div key={title} className="gl-table-wrap" style={{ marginBottom: 16 }}>
              <div style={{
                padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: `linear-gradient(135deg, ${color}11, transparent)`,
              }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{title}</span>
                <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                  <span style={{ color: '#10b981' }}>In: {fmt(section.cashIn)}</span>
                  <span style={{ color: '#ef4444' }}>Out: {fmt(section.cashOut)}</span>
                  <span style={{ fontWeight: 700, color: section.net >= 0 ? '#10b981' : '#ef4444' }}>
                    Net: {fmt(section.net)}
                  </span>
                </div>
              </div>

              {section.items.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
                  No cash movements in this category
                </div>
              ) : (
                <TableScrollWrapper>
                  <table className="gl-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item, i) => (
                        <tr key={i}>
                          <td>{item.description}</td>
                          <td className={`amount ${item.amount >= 0 ? 'positive' : 'negative'}`} style={{ fontWeight: 600 }}>
                            {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollWrapper>
              )}
            </div>
          ))}

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', marginTop: 8 }}>
            Generated: {new Date(cf.generatedAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}
