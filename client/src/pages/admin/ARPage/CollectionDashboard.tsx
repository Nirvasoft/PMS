import { useGetCollectionSummaryQuery, useGetOutstandingByPropertyQuery, useGetOverdueTrendQuery } from '../../../store/api/arApi';
import { TrendingUp, DollarSign, AlertTriangle, CheckCircle, BarChart3, Building2, Activity } from 'lucide-react';
import './ARPage.css';

const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export default function CollectionDashboard() {
  const { data, isFetching } = useGetCollectionSummaryQuery({});
  const { data: propData } = useGetOutstandingByPropertyQuery();
  const { data: trendData } = useGetOverdueTrendQuery();
  const summary = data?.data || {
    totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0,
    collectionRate: 0, overdueCount: 0, overdueAmount: 0,
  };
  const propertyBreakdown = propData?.data || [];
  const trendPoints = trendData?.data || [];

  const circumference = 2 * Math.PI * 65;
  const offset = circumference - (summary.collectionRate / 100) * circumference;
  const gaugeColor = summary.collectionRate >= 80 ? '#34d399'
    : summary.collectionRate >= 60 ? '#fbbf24'
    : '#f87171';

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <BarChart3 size={22} />
          </div>
          <div>
            <h1>Collection Dashboard</h1>
            <p>Overview of accounts receivable collection performance</p>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="collection-dashboard">
        {/* Gauge */}
        <div className="collection-gauge-card">
          <div className="collection-gauge">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle className="gauge-track" cx="80" cy="80" r="65" />
              <circle
                className="gauge-fill"
                cx="80" cy="80" r="65"
                stroke={gaugeColor}
                strokeDasharray={circumference}
                strokeDashoffset={isFetching ? circumference : offset}
              />
            </svg>
            <span className="gauge-center">{summary.collectionRate}%</span>
            <span className="gauge-sub">Collection Rate</span>
          </div>
          <div className="collection-gauge-label">
            {summary.collectionRate >= 80 ? 'Excellent' : summary.collectionRate >= 60 ? 'Good' : 'Needs Attention'}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="collection-stats">
          <div className="ar-stat-card">
            <div className="asc-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
              <DollarSign size={18} />
            </div>
            <span className="asc-label">Total Invoiced</span>
            <span className="asc-value">{formatCurrency(summary.totalInvoiced)}</span>
            <div className="ar-progress-bar">
              <div className="fill" style={{ width: '100%' }} />
            </div>
          </div>

          <div className="ar-stat-card">
            <div className="asc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
              <CheckCircle size={18} />
            </div>
            <span className="asc-label">Total Collected</span>
            <span className="asc-value" style={{ color: '#34d399' }}>{formatCurrency(summary.totalCollected)}</span>
            <div className="ar-progress-bar">
              <div className="fill" style={{
                width: summary.totalInvoiced > 0 ? `${(summary.totalCollected / summary.totalInvoiced) * 100}%` : '0%',
              }} />
            </div>
          </div>

          <div className="ar-stat-card">
            <div className="asc-icon" style={{ background: 'rgba(251,146,60,0.12)', color: '#fb923c' }}>
              <TrendingUp size={18} />
            </div>
            <span className="asc-label">Outstanding</span>
            <span className="asc-value" style={{ color: '#fb923c' }}>{formatCurrency(summary.totalOutstanding)}</span>
            <span className="asc-sub">
              {summary.totalInvoiced > 0
                ? `${(100 - summary.collectionRate).toFixed(1)}% of invoiced`
                : 'No data'}
            </span>
          </div>

          <div className="ar-stat-card">
            <div className="asc-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
              <AlertTriangle size={18} />
            </div>
            <span className="asc-label">Overdue</span>
            <span className="asc-value" style={{ color: summary.overdueCount > 0 ? '#f87171' : undefined }}>
              {formatCurrency(summary.overdueAmount)}
            </span>
            <span className="asc-sub">
              {summary.overdueCount} invoice{summary.overdueCount !== 1 ? 's' : ''} overdue
            </span>
          </div>
        </div>
      </div>

      {/* Quick Summary Table */}
      <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="cell-primary">Collection Rate</span></td>
              <td className="text-right">
                <span className="cell-amount" style={{ color: gaugeColor }}>{summary.collectionRate}%</span>
              </td>
            </tr>
            <tr>
              <td><span className="cell-primary">Total Revenue Invoiced</span></td>
              <td className="text-right">
                <span className="cell-amount">{formatCurrency(summary.totalInvoiced)}</span>
              </td>
            </tr>
            <tr>
              <td><span className="cell-primary">Total Cash Collected</span></td>
              <td className="text-right">
                <span className="cell-amount paid">{formatCurrency(summary.totalCollected)}</span>
              </td>
            </tr>
            <tr>
              <td><span className="cell-primary">Total Outstanding Balance</span></td>
              <td className="text-right">
                <span className="cell-amount" style={{ color: '#fb923c' }}>{formatCurrency(summary.totalOutstanding)}</span>
              </td>
            </tr>
            <tr>
              <td><span className="cell-primary">Overdue Invoices</span></td>
              <td className="text-right">
                <span className="cell-amount" style={{ color: summary.overdueCount > 0 ? '#f87171' : undefined }}>
                  {summary.overdueCount} ({formatCurrency(summary.overdueAmount)})
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* Outstanding by Property */}
      {propertyBreakdown.length > 0 && (
        <div className="ar-table-wrap" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
              <Building2 size={16} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Outstanding by Property</span>
          </div>
          {propertyBreakdown.map((p: any) => {
            const maxAmount = propertyBreakdown[0]?.outstanding || 1;
            const pct = Math.min((p.outstanding / maxAmount) * 100, 100);
            return (
              <div key={p.propertyId || 'none'} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.propertyName}</span>
                  <span style={{ fontWeight: 700, color: '#fb923c' }}>{formatCurrency(p.outstanding)}</span>
                </div>
                <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, width: `${pct}%`,
                    background: 'linear-gradient(90deg, #818cf8, #6366f1)',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {p.invoiceCount} outstanding invoice{p.invoiceCount !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overdue Trend Chart */}
      {trendPoints.length > 0 && (() => {
        const maxVal = Math.max(...trendPoints.map(p => p.overdueAmount), 1);
        return (
          <div className="ar-table-wrap" style={{ marginTop: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(248,113,113,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
                <Activity size={16} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Overdue Trend (6 months)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 4px' }}>
              {trendPoints.map((p, i) => {
                const barH = maxVal > 0 ? Math.max((p.overdueAmount / maxVal) * 130, 4) : 4;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: p.overdueAmount > 0 ? '#f87171' : 'var(--text-tertiary)' }}>
                      {p.overdueAmount > 0 ? `$${(p.overdueAmount / 1000).toFixed(1)}k` : '—'}
                    </span>
                    <div style={{
                      width: '100%', maxWidth: 48, height: barH, borderRadius: '6px 6px 2px 2px',
                      background: p.overdueAmount > 0
                        ? `linear-gradient(180deg, #f87171 0%, #ef4444 100%)`
                        : 'rgba(255,255,255,0.04)',
                      transition: 'height 0.6s ease',
                      opacity: p.overdueAmount > 0 ? 0.85 : 0.3,
                    }} />
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {p.month.replace(/ /g, '\u00A0')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
