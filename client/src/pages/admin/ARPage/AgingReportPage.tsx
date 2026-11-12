import { useState, useMemo, useEffect, useRef } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useGetAgingReportQuery } from '../../../store/api/arApi';
import { useGetCurrencyRatesQuery } from '../../../store/api/billingApi';
import { useSelectedPropertyId, useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useAppSelector } from '../../../store';
import { Clock, Search, Download, ChevronLeft, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import { formatCurrency as formatCurrencyHelper } from '../../../utils/formatCurrency';
import './ARPage.css';

export default function AgingReportPage() {
  const propertyId = useSelectedPropertyId();
  const propertyFilter = useSelectedPropertyFilter();
  const accessToken = useAppSelector((s) => s.auth.accessToken);

  const [asOfDate, setAsOfDate] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exportingCsv, setExportingCsv] = useState(false);

  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    propertyId ? { propertyId } : skipToken,
  );
  const currencyRates = currencyRatesData?.data ?? [];
  const baseCurrencyCode = currencyRates.find((r) => r.isBaseCurrency)?.currency || 'MMK';

  const currencyOptions = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of currencyRates) {
      if (!r.currency) continue;
      map.set(r.currency, Boolean(map.get(r.currency) || r.isBaseCurrency));
    }
    if (map.size === 0) {
      map.set(baseCurrencyCode, true);
    }
    return Array.from(map.entries())
      .sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0) || a[0].localeCompare(b[0]))
      .map(([code, isBase]) => ({ code, isBase }));
  }, [currencyRates, baseCurrencyCode]);

  const prevPropertyRef = useRef(propertyFilter);
  useEffect(() => {
    if (prevPropertyRef.current !== propertyFilter) {
      prevPropertyRef.current = propertyFilter;
      setCurrencyFilter('ALL');
      setPage(1);
    }
  }, [propertyFilter]);

  const activeCurrencyParam = currencyFilter === 'ALL' ? undefined : currencyFilter;

  const { data, isFetching } = useGetAgingReportQuery({
    propertyId: propertyFilter || undefined,
    asOfDate: asOfDate || undefined,
    currency: activeCurrencyParam,
  });
  const report = data?.data;
  const summary = report?.summary || { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };
  const rows = report?.rows || [];
  const displayCurrency =
    report?.currency || (currencyFilter !== 'ALL' ? currencyFilter : baseCurrencyCode);

  const fmtAmount = (amount: number) =>
    formatCurrencyHelper(amount, displayCurrency, 'code');

  const filtered = search
    ? rows.filter(r => r.tenantName.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedRows = filtered.slice(startIndex, startIndex + pageSize);

  const handleExportCsv = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (propertyFilter) params.set('propertyId', propertyFilter);
      if (asOfDate) params.set('asOfDate', asOfDate);
      if (activeCurrencyParam) params.set('currency', activeCurrencyParam);
      const url = `/api/v1/ar/aging-report/csv${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      if (!res.ok) {
        throw new Error('Failed to export CSV');
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `aging-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export aging report CSV');
    } finally {
      setExportingCsv(false);
    }
  };

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
              {`${rows.length} total tenants · ${displayCurrency}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>As of:</label>
          <input
            type="date"
            className="filter-date"
            value={asOfDate}
            onChange={e => { setAsOfDate(e.target.value); setPage(1); }}
            style={{
              padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
              color: 'var(--text-primary)', fontSize: 13,
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={exportingCsv}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            onClick={handleExportCsv}
          >
            <Download size={14} /> {exportingCsv ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Aging Bucket Cards */}
      <div className="aging-bucket-cards">
        <div className="aging-bucket current">
          <div className="ab-label">Current</div>
          <div className="ab-amount">{fmtAmount(summary.current)}</div>
        </div>
        <div className="aging-bucket d1-30">
          <div className="ab-label">1–30 Days</div>
          <div className="ab-amount">{fmtAmount(summary.days1to30)}</div>
        </div>
        <div className="aging-bucket d31-60">
          <div className="ab-label">31–60 Days</div>
          <div className="ab-amount">{fmtAmount(summary.days31to60)}</div>
        </div>
        <div className="aging-bucket d61-90">
          <div className="ab-label">61–90 Days</div>
          <div className="ab-amount">{fmtAmount(summary.days61to90)}</div>
        </div>
        <div className="aging-bucket over90">
          <div className="ab-label">Over 90 Days</div>
          <div className="ab-amount">{fmtAmount(summary.over90)}</div>
        </div>
      </div>

      {/* Total banner */}
      <div style={{
        background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 14, padding: '16px 24px', marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Total Outstanding ({displayCurrency})
        </span>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {fmtAmount(summary.total)}
        </span>
      </div>

      {/* Search & Currency Filter */}
      <div className="ar-filters">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search tenants…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1); }}
              title="Clear search"
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 2, display: 'flex',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <select
          className="filter-select"
          value={currencyFilter}
          onChange={e => { setCurrencyFilter(e.target.value); setPage(1); }}
          title="Currency"
        >
          <option value="ALL">All Currencies ({baseCurrencyCode})</option>
          {currencyOptions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}{c.isBase ? ' (Base)' : ''}
            </option>
          ))}
        </select>
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
                      <span className={`cell-amount ${row.current > 0 ? '' : 'zero'}`}>{fmtAmount(row.current)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.days1to30 > 0 ? '' : 'zero'}`}>{fmtAmount(row.days1to30)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.days31to60 > 0 ? '' : 'zero'}`}>{fmtAmount(row.days31to60)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.days61to90 > 0 ? '' : 'zero'}`}>{fmtAmount(row.days61to90)}</span>
                    </td>
                    <td className="text-right">
                      <span className={`cell-amount ${row.over90 > 0 ? 'overdue' : 'zero'}`}>{fmtAmount(row.over90)}</span>
                    </td>
                    <td className="text-right">
                      <span className="cell-amount" style={{ fontWeight: 800 }}>{fmtAmount(row.total)}</span>
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
