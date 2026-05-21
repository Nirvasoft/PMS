import { useState } from 'react';
import { useGetCashFlowQuery } from '../../../store/api/glApi';

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

  const sign = (n: number) => n >= 0 ? 'positive' : 'negative';

  return (
    <div className="gl-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>💰 Cash Flow Statement</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14 }} />
          <span style={{ color: 'var(--text-secondary)' }}>to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14 }} />
        </div>
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
            <div key={title} style={{
              background: 'var(--bg-secondary)', borderRadius: 12, marginBottom: 16,
              border: '1px solid var(--border-color)', overflow: 'hidden',
            }}>
              <div style={{
                padding: '16px 24px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: `linear-gradient(135deg, ${color}11, transparent)`,
              }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{title}</span>
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
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 24px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Description</th>
                      <th style={{ textAlign: 'right', padding: '10px 24px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px 24px', fontSize: 14 }}>{item.description}</td>
                        <td style={{
                          padding: '10px 24px', textAlign: 'right', fontSize: 14, fontWeight: 600,
                          fontFamily: 'monospace',
                          color: item.amount >= 0 ? '#10b981' : '#ef4444',
                        }}>
                          {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
