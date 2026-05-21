import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetStatementLinesQuery, useGetReconciliationSummaryQuery,
  useImportStatementMutation, useMatchLineMutation,
  useExcludeLineMutation, useUnmatchLineMutation, useGetBalanceQuery,
} from '../../../store/api/bankingApi';
import '../GLPage/GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const STATUS_COLORS: Record<string, string> = {
  unmatched: 'draft', auto_matched: 'posted', manually_matched: 'posted', excluded: 'closed',
};

export default function ReconciliationPage() {
  const { bankAccountId } = useParams<{ bankAccountId: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showImport, setShowImport] = useState(false);

  const { data: balance } = useGetBalanceQuery(bankAccountId!);
  const { data: summary } = useGetReconciliationSummaryQuery(bankAccountId!);
  const { data: result, isLoading } = useGetStatementLinesQuery({
    bankAccountId: bankAccountId!, page, limit: 50,
    ...(statusFilter ? { matchStatus: statusFilter } : {}),
  });
  const [excludeLine] = useExcludeLineMutation();
  const [unmatchLine] = useUnmatchLineMutation();

  const lines = result?.data || [];
  const meta = result?.meta || { total: 0, page: 1, totalPages: 1 };

  const handleExclude = async (id: string) => {
    if (!confirm('Exclude this line from reconciliation?')) return;
    try { await excludeLine(id).unwrap(); } catch (err: any) { alert(err.data?.message || 'Error'); }
  };
  const handleUnmatch = async (id: string) => {
    if (!confirm('Unmatch this line?')) return;
    try { await unmatchLine(id).unwrap(); } catch (err: any) { alert(err.data?.message || 'Error'); }
  };

  return (
    <div className="gl-page">
      <button className="btn-sm" onClick={() => navigate('/admin/banking')} style={{marginBottom:12}}>← Bank Accounts</button>

      {balance && (
        <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
          <h2 style={{margin:0}}>{balance.bankName} — {balance.accountName}</h2>
          <span style={{fontSize:'1.3rem',fontWeight:700,color:'var(--success, #22c55e)',fontVariantNumeric:'tabular-nums'}}>
            {balance.currency} {fmtAmt(Number(balance.currentBalance))}
          </span>
        </div>
      )}

      {/* Reconciliation Summary */}
      {summary && (
        <div className="gl-stats">
          <div className="gl-stat-card">
            <div className="stat-value">{summary.total}</div>
            <div className="stat-label">Total Lines</div>
          </div>
          <div className="gl-stat-card">
            <div className="stat-value" style={{color:'var(--success, #22c55e)'}}>{summary.matched + summary.autoMatched}</div>
            <div className="stat-label">Matched ({summary.autoMatched} auto)</div>
          </div>
          <div className="gl-stat-card">
            <div className="stat-value" style={{color:'var(--danger, #ef4444)'}}>{summary.unmatched}</div>
            <div className="stat-label">Unmatched</div>
          </div>
          <div className="gl-stat-card">
            <div className="stat-value" style={{color:'var(--text-muted)'}}>{summary.excluded}</div>
            <div className="stat-label">Excluded</div>
          </div>
        </div>
      )}

      <div className="gl-toolbar">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="unmatched">Unmatched</option>
          <option value="auto_matched">Auto-matched</option>
          <option value="manually_matched">Manually Matched</option>
          <option value="excluded">Excluded</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={() => setShowImport(true)}>📥 Import Statement</button>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div className="gl-table-wrap">
          <table className="gl-table">
            <thead>
              <tr>
                <th>Date</th><th>Description</th><th>Reference</th>
                <th style={{textAlign:'right'}}>Credit</th><th style={{textAlign:'right'}}>Debit</th>
                <th>Status</th><th>Confidence</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.id}>
                  <td>{fmtDate(line.transactionDate)}</td>
                  <td style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{line.description || '—'}</td>
                  <td style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>{line.reference || '—'}</td>
                  <td className="amount positive">{Number(line.creditAmount) > 0 ? fmtAmt(Number(line.creditAmount)) : ''}</td>
                  <td className="amount negative">{Number(line.debitAmount) > 0 ? fmtAmt(Number(line.debitAmount)) : ''}</td>
                  <td>
                    <span className={`gl-badge ${STATUS_COLORS[line.matchStatus] || 'draft'}`}>
                      {line.matchStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>
                    {line.matchConfidence ? `${line.matchConfidence}%` : '—'}
                  </td>
                  <td style={{display:'flex',gap:4}}>
                    {line.matchStatus === 'unmatched' && (
                      <button className="btn-sm" onClick={() => handleExclude(line.id)} title="Exclude">✕</button>
                    )}
                    {(line.matchStatus === 'auto_matched' || line.matchStatus === 'manually_matched') && (
                      <button className="btn-sm" onClick={() => handleUnmatch(line.id)} title="Unmatch">↩</button>
                    )}
                    {line.matchStatus === 'excluded' && (
                      <button className="btn-sm" onClick={() => handleUnmatch(line.id)} title="Restore">♻</button>
                    )}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
                  No statement lines. Import a bank statement to get started.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {meta.totalPages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:16}}>
          <button className="btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{padding:'6px 12px',color:'var(--text-secondary)',fontSize:'0.85rem'}}>Page {meta.page} of {meta.totalPages}</span>
          <button className="btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {showImport && <ImportStatementModal bankAccountId={bankAccountId!} onClose={() => setShowImport(false)} />}
    </div>
  );
}

function ImportStatementModal({ bankAccountId, onClose }: { bankAccountId: string; onClose: () => void }) {
  const [importStatement, { isLoading }] = useImportStatementMutation();
  const [form, setForm] = useState({
    fromDate: '', toDate: '', filename: 'manual-import',
  });
  const [csvText, setCsvText] = useState('');

  const parseCSV = (text: string) => {
    const rows = text.trim().split('\n').slice(1); // skip header
    return rows.map(row => {
      const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
      return {
        transactionDate: cols[0] || new Date().toISOString().split('T')[0],
        description: cols[1] || '',
        reference: cols[2] || '',
        debitAmount: parseFloat(cols[3]) || 0,
        creditAmount: parseFloat(cols[4]) || 0,
        balance: cols[5] ? parseFloat(cols[5]) : null,
      };
    }).filter(r => r.description || r.debitAmount || r.creditAmount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = parseCSV(csvText);
    if (lines.length === 0) { alert('No valid lines found'); return; }
    try {
      await importStatement({
        bankAccountId,
        data: { format: 'csv', fromDate: form.fromDate, toDate: form.toDate, filename: form.filename, lines },
      }).unwrap();
      onClose();
    } catch (err: any) { alert(err.data?.message || 'Error importing'); }
  };

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal" onClick={e => e.stopPropagation()} style={{maxWidth:750}}>
        <h3>📥 Import Bank Statement</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>From Date</label>
              <input type="date" value={form.fromDate} onChange={e => setForm({...form, fromDate: e.target.value})} required />
            </div>
            <div className="gl-form-group">
              <label>To Date</label>
              <input type="date" value={form.toDate} onChange={e => setForm({...form, toDate: e.target.value})} required />
            </div>
          </div>
          <div className="gl-form-group">
            <label>CSV Data (Date, Description, Reference, Debit, Credit, Balance)</label>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={10}
              placeholder={'date,description,reference,debit,credit,balance\n2026-01-15,Rent payment from Unit A1,REC-001,0,5000,55000\n2026-01-16,Utility bill payment,UTL-2026-01,1200,0,53800'}
              style={{fontFamily:'monospace',fontSize:'0.8rem'}} />
          </div>
          <p style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
            Paste CSV data with header: date, description, reference, debit, credit, balance
          </p>
          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Importing…' : 'Import & Auto-Match'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
