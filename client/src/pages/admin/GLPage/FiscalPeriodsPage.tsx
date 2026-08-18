import { useState } from 'react';
import {
  useGetFiscalPeriodsQuery, useGenerateFiscalYearMutation,
  useCloseFiscalPeriodMutation, useReopenFiscalPeriodMutation,
} from '../../../store/api/glApi';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import './GLPage.css';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export default function FiscalPeriodsPage() {
  const { data: periods = [], isLoading } = useGetFiscalPeriodsQuery();
  const [generateFY, { isLoading: generating }] = useGenerateFiscalYearMutation();
  const [closePeriod] = useCloseFiscalPeriodMutation();
  const [reopenPeriod] = useReopenFiscalPeriodMutation();
  const [year, setYear] = useState(new Date().getFullYear());
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const years = [...new Set(periods.map(p => p.fiscalYear))].sort((a, b) => b - a);
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const filtered = filterYear ? periods.filter(p => p.fiscalYear === filterYear) : periods;

  const handleGenerate = async () => {
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
      <h2>Fiscal Periods</h2>
      <div className="gl-toolbar">
        <label>Filter Year</label>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value ? Number(e.target.value) : '')}>
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <label>Generate FY</label>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2020} max={2099} style={{width:80}} />
        <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : '📅 Generate 12 Months'}
        </button>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div className="gl-table-wrap">
          <table className="gl-table">
            <thead>
              <tr><th>Year</th><th>#</th><th>Period</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>{p.fiscalYear}</td>
                  <td>{p.periodNumber}</td>
                  <td style={{fontWeight:600}}>{p.name}</td>
                  <td>{fmtDate(p.startDate)}</td>
                  <td>{fmtDate(p.endDate)}</td>
                  <td><span className={`gl-badge ${p.status}`}>{p.status}</span></td>
                  <td>
                    {p.status === 'open' && <button className="btn-sm" onClick={() => handleClose(p.id)}>🔒 Close</button>}
                    {p.status === 'closed' && <button className="btn-sm" onClick={() => handleReopen(p.id)}>🔓 Reopen</button>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No fiscal periods. Generate a fiscal year above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
