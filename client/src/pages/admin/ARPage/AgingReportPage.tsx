import { useState } from 'react';
import { useGetAgingReportQuery } from '../../../store/api/arApi';
import { Clock, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import './ARPage.css';

import { formatCurrency } from '../../../utils/formatCurrency';

export default function AgingReportPage() {
  const [asOfDate, setAsOfDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isFetching } = useGetAgingReportQuery({ asOfDate: asOfDate || undefined });
  const report = data?.data;
  const summary = report?.summary || { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };
  const rows = report?.rows || [];

  const filtered = search
    ? rows.filter(r => r.tenantName.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedRows = filtered.slice(startIndex, startIndex + pageSize);

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <Clock size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>AR Aging Report</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {`${rows.length} total tenants`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>As of:</label>
          <input type="date" className="filter-date" value={asOfDate}
            onChange={e => { setAsOfDate(e.target.value); setPage(1); }}
            style={{
              padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
              color: 'var(--text-primary)', fontSize: 13,
            }}
          />
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            onClick={() => {
              const params = new URLSearchParams();
              if (asOfDate) params.set('asOfDate', asOfDate);
              const url = `/api/v1/ar/aging-report/csv${params.toString() ? '?' + params.toString() : ''}`;
              const a = document.createElement('a');
              a.href = url; a.download = 'aging-report.csv'; a.click();
            }}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Aging Bucket Cards */}
      <div className="aging-bucket-cards">
        <div className="aging-bucket current">
          <div className="ab-label">Current</div>
          <div className="ab-amount">{formatCurrency(summary.current)}</div>
        </div>
        <div className="aging-bucket d1-30">
          <div className="ab-label">1–30 Days</div>
          <div className="ab-amount">{formatCurrency(summary.days1to30)}</div>
        </div>
        <div className="aging-bucket d31-60">
          <div className="ab-label">31–60 Days</div>
          <div className="ab-amount">{formatCurrency(summary.days31to60)}</div>
        </div>
        <div className="aging-bucket d61-90">
          <div className="ab-label">61–90 Days</div>
          <div className="ab-amount">{formatCurrency(summary.days61to90)}</div>
        </div>
        <div className="aging-bucket over90">
          <div className="ab-label">Over 90 Days</div>
          <div className="ab-amount">{formatCurrency(summary.over90)}</div>
        </div>
      </div>

      {/* Total banner */}
      <div style={{
        background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 14, padding: '16px 24px', marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Total Outstanding
        </span>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {formatCurrency(summary.total)}
        </span>
      </div>

      {/* Search */}
      <div className="ar-filters">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input type="text" placeholder="Search tenants…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {/* Table */}
      <div className="ar-table-wrap">
        <TableScrollWrapper>
          <table className="ar-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th className="text-right">Current</th>
                <th className="text-right">1–30</th>
                <th className="text-right">31–60</th>
                <th className="text-right">61–90</th>
                <th className="text-right">90+</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ar-empty">
                      {isFetching ? 'Generating report…' : 'No outstanding balances.'}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map(row => (
                  <tr key={row.tenantId}>
                    <td><span className="cell-primary">{row.tenantName}</span></td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.current > 0 ? '' : 'zero'}`}>{formatCurrency(row.current)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.days1to30 > 0 ? '' : 'zero'}`}>{formatCurrency(row.days1to30)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.days31to60 > 0 ? '' : 'zero'}`}>{formatCurrency(row.days31to60)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.days61to90 > 0 ? '' : 'zero'}`}>{formatCurrency(row.days61to90)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.over90 > 0 ? 'overdue' : 'zero'}`}>{formatCurrency(row.over90)}</span>
                    </td>
                    <td className="text-right">
                      <span className="cell-amount" style={{ fontWeight: 800 }}>{formatCurrency(row.total)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScrollWrapper>

        {totalItems >= 10 && (
          <div className="ar-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="ar-aging-page-size">Rows per page:</label>
                <select
                  id="ar-aging-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="page-btns">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} title="Previous page">
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {page} of {Math.max(totalPages, 1)}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} title="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {report?.generatedAt && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right' }}>
          Generated: {new Date(report.generatedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
