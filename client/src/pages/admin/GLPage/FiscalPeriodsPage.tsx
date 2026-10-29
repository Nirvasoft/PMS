import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useGetFiscalPeriodsQuery, useGenerateFiscalYearMutation,
  useCloseFiscalPeriodMutation, useReopenFiscalPeriodMutation,
} from '../../../store/api/glApi';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useV6IntegrationStatus } from '../../../hooks/useV6IntegrationStatus';
import TableScrollWrapper from '../../../components/TableScrollWrapper';
import './GLPage.css';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export default function FiscalPeriodsPage() {
  const { isV6Active } = useV6IntegrationStatus();
  const { data: periods = [], isLoading } = useGetFiscalPeriodsQuery();
  const [generateFY, { isLoading: generating }] = useGenerateFiscalYearMutation();
  const [closePeriod] = useCloseFiscalPeriodMutation();
  const [reopenPeriod] = useReopenFiscalPeriodMutation();
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const years = [...new Set(periods.map(p => p.fiscalYear))].sort((a, b) => b - a);
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const filtered = filterYear ? periods.filter(p => p.fiscalYear === filterYear) : periods;
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const pagedPeriods = filtered.slice((page - 1) * limit, page * limit);

  const handleGenerate = async () => {
    if (isV6Active) return;
    try { await generateFY(year).unwrap(); } catch (err: any) { alertDialog(err.data?.errors?.[0]?.message || 'Error'); }
  };
  const handleClose = async (id: string) => {
    if (!(await confirmDialog('Close this fiscal period? Draft JEs must be posted first.'))) return;
    try { await closePeriod(id).unwrap(); } catch (err: any) { alertDialog(err.data?.errors?.[0]?.message || err.data?.message || 'Error'); }
  };
  const handleReopen = async (id: string) => {
    if (!(await confirmDialog('Reopen this closed period?'))) return;
    try { await reopenPeriod(id).unwrap(); } catch (err: any) { alertDialog(err.data?.errors?.[0]?.message || 'Error'); }
  };

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Calendar size={22} />
          </div>
          <div>
            <h1>Fiscal Periods</h1>
            <p>{filtered.length} total periods</p>
          </div>
        </div>
      </div>

      <div className="gl-toolbar">
        <label>Filter Year</label>
        <select value={filterYear} onChange={e => { setFilterYear(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <label>Generate FY</label>
        <input
          type="number"
          value={year}
          disabled={isV6Active}
          onChange={e => setYear(Number(e.target.value))}
          min={2020}
          max={2099}
          style={{ width: 80, ...(isV6Active ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
        />
        <PermissionGuard permission="finance-fiscal-periods.write">
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={isV6Active || generating}
            title={isV6Active ? 'Fiscal period generation is disabled because V6 ERP integration is active.' : undefined}
            style={isV6Active ? { opacity: 0.6, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 } : undefined}
          >
            {isV6Active ? '🔒 Generate 12 Months (V6 Active)' : (generating ? 'Generating…' : '📅 Generate 12 Months')}
          </button>
        </PermissionGuard>
      </div>

      {isLoading ? <TableSkeleton columns={6} rows={6} /> : (
        <div className="gl-table-wrap">
          <TableScrollWrapper>
            <table className="gl-table">
              <thead>
                <tr><th>Year</th><th>#</th><th>Period</th><th>Start</th><th>End</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {pagedPeriods.map(p => (
                  <tr key={p.id}>
                    <td>{p.fiscalYear}</td>
                    <td>{p.periodNumber}</td>
                    <td style={{fontWeight:600}}>{p.name}</td>
                    <td>{fmtDate(p.startDate)}</td>
                    <td>{fmtDate(p.endDate)}</td>
                    <td><span className={`gl-badge ${p.status}`}>{p.status}</span></td>
                    <td>
                      <PermissionGuard permission="finance-fiscal-periods.write">
                        {p.status === 'open' && <button className="btn-sm" onClick={() => handleClose(p.id)}>🔒 Close</button>}
                        {p.status === 'closed' && <button className="btn-sm" onClick={() => handleReopen(p.id)}>🔓 Reopen</button>}
                      </PermissionGuard>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No fiscal periods. Generate a fiscal year above.</td></tr>
                )}
              </tbody>
            </table>
          </TableScrollWrapper>

          {filtered.length >= 10 && (
            <div className="gl-pagination">
              <div className="pagination-left">
                <div className="page-size-selector">
                  <span>Rows per page:</span>
                  <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="page-btns">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} title="Previous Page">
                  <ChevronLeft size={14} />
                </button>
                <span className="page-num-display">
                  Page {page} of {totalPages}
                </span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} title="Next Page">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
