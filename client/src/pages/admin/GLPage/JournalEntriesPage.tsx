import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState, useEffect } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Eye, Search, X } from 'lucide-react';
import {
  useGetJournalEntriesQuery, useCreateJournalEntryMutation,
  usePostJournalEntryMutation, useReverseJournalEntryMutation,
  useGetGlAccountsQuery,
} from '../../../store/api/glApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import TableScrollWrapper from '../../../components/TableScrollWrapper';
import './GLPage.css';

import { formatCompactAmount as fmtAmt } from '../../../utils/formatCurrency';
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const getLineDept = (line: any): { id?: string; code: string; name: string } | null =>
  line?.departmentCenter || line?.account?.departmentCenter || null;

const getLineCc = (line: any): { id?: string; code: string; name: string } | null =>
  line?.costCenter || line?.account?.costCenter || null;

const getEntryDepts = (je: any): Array<{ id?: string; code: string; name: string }> => {
  const seen = new Set<string>();
  const result: Array<{ id?: string; code: string; name: string }> = [];
  for (const line of je?.lines || []) {
    const d = getLineDept(line);
    if (d?.code && !seen.has(d.code)) {
      seen.add(d.code);
      result.push(d);
    }
  }
  return result;
};

const getEntryCcs = (je: any): Array<{ id?: string; code: string; name: string }> => {
  const seen = new Set<string>();
  const result: Array<{ id?: string; code: string; name: string }> = [];
  for (const line of je?.lines || []) {
    const c = getLineCc(line);
    if (c?.code && !seen.has(c.code)) {
      seen.add(c.code);
      result.push(c);
    }
  }
  return result;
};

export default function JournalEntriesPage() {
  const selectedPropertyId = useSelectedPropertyFilter();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<any | null>(null);

  useEffect(() => {
    setPage(1);
  }, [selectedPropertyId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useGetJournalEntriesQuery({
    page,
    limit,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    propertyId: selectedPropertyId || undefined,
  });
  const [postJE] = usePostJournalEntryMutation();
  const [reverseJE] = useReverseJournalEntryMutation();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const entries = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };

  const handlePost = async (id: string) => {
    if (!(await confirmDialog('Post this journal entry? This cannot be undone.'))) return;
    try {
      await postJE(id).unwrap();
      if (viewingEntry?.id === id) setViewingEntry(null);
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || 'Error posting');
    }
  };
  const handleReverse = async (id: string) => {
    if (!(await confirmDialog('Reverse this posted journal entry?', { danger: true, confirmText: 'Reverse' }))) return;
    try {
      await reverseJE(id).unwrap();
      if (viewingEntry?.id === id) setViewingEntry(null);
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || 'Error reversing');
    }
  };

  return (
    <div className="gl-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <BookOpen size={22} />
          </div>
          <div>
            <h1>Journal Entries</h1>
            <p>{meta.total} total entries</p>
          </div>
        </div>
        <PermissionGuard permission="finance-journal.write">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Journal Entry</button>
        </PermissionGuard>
      </div>

      <div className="gl-toolbar">
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search JE #, description, department, cost center…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 34, paddingRight: search ? 30 : 12, boxSizing: 'border-box' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>

      {isLoading ? <TableSkeleton columns={6} rows={6} /> : (
        <div className="gl-table-wrap">
          <TableScrollWrapper>
            <table className="gl-table">
              <thead>
                <tr>
                  <th>JE #</th><th>Date</th><th>Type</th><th>Description</th>
                  <th>Department</th><th>Cost Center</th>
                  <th style={{textAlign:'right'}}>Debit</th><th style={{textAlign:'right'}}>Credit</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((je: any) => {
                  const depts = getEntryDepts(je);
                  const ccs = getEntryCcs(je);
                  return (
                    <tr key={je.id}>
                      <td style={{fontWeight:600}}>{je.journalNumber}</td>
                      <td>{fmtDate(je.entryDate)}</td>
                      <td><span className="gl-type-chip asset" style={{fontSize:'0.7rem'}}>{je.entryType}</span></td>
                      <td style={{maxWidth:250,overflow:'hidden',textOverflow:'ellipsis'}}>{je.description}</td>
                      <td>
                        {depts.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {depts.map((d) => (
                              <span
                                key={d.id || d.code}
                                className="gl-badge"
                                title={`${d.code} — ${d.name}`}
                                style={{
                                  fontSize: '0.68rem',
                                  background: 'rgba(139, 92, 246, 0.14)',
                                  color: '#a78bfa',
                                  textTransform: 'none',
                                }}
                              >
                                {d.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {ccs.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {ccs.map((c) => (
                              <span
                                key={c.id || c.code}
                                className="gl-badge"
                                title={`${c.code} — ${c.name}`}
                                style={{
                                  fontSize: '0.68rem',
                                  background: 'rgba(59, 130, 246, 0.14)',
                                  color: '#60a5fa',
                                  textTransform: 'none',
                                }}
                              >
                                {c.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="amount">{fmtAmt(Number(je.totalDebit))}</td>
                      <td className="amount">{fmtAmt(Number(je.totalCredit))}</td>
                      <td><span className={`gl-badge ${je.status}`}>{je.status}</span></td>
                      <td>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <button
                            type="button"
                            className="btn-sm je-view-btn"
                            onClick={() => setViewingEntry(je)}
                            title="View Journal Entry Details"
                          >
                            <Eye size={13} /> View
                          </button>
                          <PermissionGuard permission="finance-journal.write">
                            {je.status === 'draft' && <button className="btn-sm btn-success" onClick={() => handlePost(je.id)}>Post</button>}
                            {je.status === 'posted' && !je.isReversal && <button className="btn-sm btn-danger" onClick={() => handleReverse(je.id)}>Reverse</button>}
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr><td colSpan={10} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No journal entries found</td></tr>
                )}
              </tbody>
            </table>
          </TableScrollWrapper>

          {meta.total >= 10 && (
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
                  Page {meta.page} of {Math.max(1, meta.totalPages)}
                </span>
                <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} title="Next Page">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateJournalModal onClose={() => setShowCreate(false)} propertyId={selectedPropertyId} />}
      {viewingEntry && (
        <JournalEntryDetailModal
          entry={viewingEntry}
          onClose={() => setViewingEntry(null)}
          onPost={handlePost}
          onReverse={handleReverse}
        />
      )}
    </div>
  );
}

function JournalEntryDetailModal({
  entry,
  onClose,
  onPost,
  onReverse,
}: {
  entry: any;
  onClose: () => void;
  onPost: (id: string) => void;
  onReverse: (id: string) => void;
}) {
  const lines: any[] = entry.lines || [];
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) || Number(entry.totalDebit) || 0;
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) || Number(entry.totalCredit) || 0;
  const entryDepts = getEntryDepts(entry);
  const entryCcs = getEntryCcs(entry);

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal je-detail-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 960 }}>
        <div className="je-detail-header">
          <div>
            <div className="je-detail-title-row">
              <h3>{entry.journalNumber}</h3>
              <span className={`gl-badge ${entry.status}`}>{entry.status}</span>
              <span className="gl-type-chip asset">{entry.entryType}</span>
            </div>
            <p className="je-detail-subtitle">{entry.description}</p>
          </div>
          <button type="button" className="je-detail-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="je-detail-meta-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))' }}>
          <div className="je-detail-meta-item">
            <span className="meta-label">Entry Date</span>
            <span className="meta-value">{fmtDate(entry.entryDate)}</span>
          </div>
          <div className="je-detail-meta-item">
            <span className="meta-label">Fiscal Period</span>
            <span className="meta-value">{entry.fiscalPeriod?.name || '—'}</span>
          </div>
          <div className="je-detail-meta-item">
            <span className="meta-label">Department</span>
            <span className="meta-value">
              {entryDepts.length > 0 ? entryDepts.map((d) => d.code).join(', ') : '—'}
            </span>
          </div>
          <div className="je-detail-meta-item">
            <span className="meta-label">Cost Center</span>
            <span className="meta-value">
              {entryCcs.length > 0 ? entryCcs.map((c) => c.code).join(', ') : '—'}
            </span>
          </div>
          <div className="je-detail-meta-item">
            <span className="meta-label">Total Debit</span>
            <span className="meta-value">{fmtAmt(totalDebit)}</span>
          </div>
          <div className="je-detail-meta-item">
            <span className="meta-label">Total Credit</span>
            <span className="meta-value">{fmtAmt(totalCredit)}</span>
          </div>
        </div>

        <div className="gl-table-wrap" style={{ marginTop: 16 }}>
          <TableScrollWrapper>
            <table className="gl-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Department</th>
                  <th>Cost Center</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Debit</th>
                  <th style={{ textAlign: 'right' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line: any, idx: number) => {
                  const dept = getLineDept(line);
                  const cc = getLineCc(line);
                  return (
                    <tr key={line.id || idx}>
                      <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{line.account?.code || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{line.account?.name || '—'}</span>
                          {line.account?.accountType && (
                            <span className={`gl-type-chip ${line.account.accountType}`} style={{ fontSize: '0.65rem' }}>
                              {line.account.accountType}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {dept ? (
                          <span
                            className="gl-badge"
                            title={`${dept.code} — ${dept.name}`}
                            style={{
                              fontSize: '0.68rem',
                              background: 'rgba(139, 92, 246, 0.14)',
                              color: '#a78bfa',
                              textTransform: 'none',
                            }}
                          >
                            {dept.code}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {cc ? (
                          <span
                            className="gl-badge"
                            title={`${cc.code} — ${cc.name}`}
                            style={{
                              fontSize: '0.68rem',
                              background: 'rgba(59, 130, 246, 0.14)',
                              color: '#60a5fa',
                              textTransform: 'none',
                            }}
                          >
                            {cc.code}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{line.description || '—'}</td>
                      <td className="amount">{Number(line.debit) > 0 ? fmtAmt(Number(line.debit)) : '—'}</td>
                      <td className="amount">{Number(line.credit) > 0 ? fmtAmt(Number(line.credit)) : '—'}</td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                      No journal lines found
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right' }}>Total</td>
                  <td className="amount">{fmtAmt(totalDebit)}</td>
                  <td className="amount">{fmtAmt(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </TableScrollWrapper>
        </div>

        <div className="gl-modal-actions" style={{ marginTop: 22 }}>
          <PermissionGuard permission="finance-journal.write">
            {entry.status === 'draft' && (
              <button type="button" className="btn-sm btn-success" onClick={() => onPost(entry.id)}>
                Post Entry
              </button>
            )}
            {entry.status === 'posted' && !entry.isReversal && (
              <button type="button" className="btn-sm btn-danger" onClick={() => onReverse(entry.id)}>
                Reverse Entry
              </button>
            )}
          </PermissionGuard>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function CreateJournalModal({ onClose, propertyId }: { onClose: () => void; propertyId?: string }) {
  const { data: accounts = [] } = useGetGlAccountsQuery(propertyId ? { propertyId } : {});
  const [createJE, { isLoading }] = useCreateJournalEntryMutation();
  const alertDialog = useAlertDialog();
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [form, setForm] = useState({ entryDate: new Date().toISOString().split('T')[0], description: '' });
  const [lines, setLines] = useState([
    { accountId: '', accountCode: '', description: '', debit: 0, credit: 0 },
    { accountId: '', accountCode: '', description: '', debit: 0, credit: 0 },
  ]);

  const nonControlAccounts = accounts.filter(a => !a.isControl && a.isActive);
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLine = (idx: number, field: string, value: any) => {
    const newLines = [...lines];
    if (field === 'accountId') {
      const selectedAcc = nonControlAccounts.find(a => a.id === value);
      newLines[idx] = {
        ...newLines[idx],
        accountId: value,
        accountCode: selectedAcc?.code || '',
      };
    } else {
      (newLines[idx] as any)[field] = value;
    }
    setLines(newLines);
  };
  const addLine = () => setLines([...lines, { accountId: '', accountCode: '', description: '', debit: 0, credit: 0 }]);
  const removeLine = (idx: number) => { if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx)); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    const hasInvalidLines = lines.some(l => !l.accountCode);
    if (!form.entryDate || !form.description.trim() || hasInvalidLines) return;
    if (!isBalanced) { alertDialog('Journal entry must be balanced (Total Debit = Total Credit)'); return; }
    try {
      await createJE({
        ...form,
        propertyId: propertyId || undefined,
        lines: lines.filter(l => l.accountCode).map(l => {
          const acc = nonControlAccounts.find(a => a.id === l.accountId);
          return {
            accountId: l.accountId || undefined,
            accountCode: l.accountCode,
            departmentCenterId: acc?.departmentCenterId || acc?.departmentCenter?.id || null,
            costCenterId: acc?.costCenterId || acc?.costCenter?.id || null,
            description: l.description,
            debit: l.debit,
            credit: l.credit,
            propertyId: propertyId || undefined,
          };
        }),
      }).unwrap();
      onClose();
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || err.data?.message || 'Error creating journal entry');
    }
  };

  return (
    <div className="gl-modal-overlay">
      <div className="gl-modal" onClick={e => e.stopPropagation()} style={{maxWidth:850}}>
        <h3>New Journal Entry</h3>
        <form onSubmit={handleSubmit} noValidate>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Entry Date <span className="req">*</span></label>
              <input
                type="date"
                className={hasAttemptedSubmit && !form.entryDate ? 'gl-input-error' : ''}
                value={form.entryDate}
                onChange={e => setForm({...form, entryDate: e.target.value})}
              />
              {hasAttemptedSubmit && !form.entryDate && (
                <span className="gl-error-text">Entry date is required</span>
              )}
            </div>
            <div className="gl-form-group">
              <label>Description <span className="req">*</span></label>
              <input
                className={hasAttemptedSubmit && !form.description.trim() ? 'gl-input-error' : ''}
                value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Journal memo…"
              />
              {hasAttemptedSubmit && !form.description.trim() && (
                <span className="gl-error-text">Description is required</span>
              )}
            </div>
          </div>

          <div className="je-line-editor">
            <div className="je-line-row" style={{fontWeight:600,fontSize:'0.75rem',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.04em'}}>
              <span>Account <span style={{ color: '#f87171' }}>*</span></span><span>Description</span><span>Debit</span><span>Credit</span><span></span>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="je-line-row">
                <select
                  className={hasAttemptedSubmit && !line.accountCode ? 'gl-input-error' : ''}
                  value={line.accountId}
                  onChange={e => updateLine(i, 'accountId', e.target.value)}
                >
                  <option value="">Select…</option>
                  {nonControlAccounts.map(a => {
                    const deptCc = [a.departmentCenter?.code, a.costCenter?.code].filter(Boolean).join(' / ');
                    return (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}{deptCc ? ` (${deptCc})` : ''}
                      </option>
                    );
                  })}
                </select>
                <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Line memo" />
                <input type="number" min="0" step="0.01" value={line.debit || ''} onChange={e => updateLine(i, 'debit', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                <input type="number" min="0" step="0.01" value={line.credit || ''} onChange={e => updateLine(i, 'credit', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                <button type="button" className="remove-line" onClick={() => removeLine(i)}>✕</button>
              </div>
            ))}
            {hasAttemptedSubmit && lines.some(l => !l.accountCode) && (
              <span className="gl-error-text" style={{ marginBottom: 4 }}>All journal lines must have an account selected</span>
            )}
            <button type="button" className="btn-sm" onClick={addLine} style={{marginTop:6}}>+ Add Line</button>

            <div className="je-totals">
              <span>Total Debit: <strong>{fmtAmt(totalDebit)}</strong></span>
              <span>Total Credit: <strong>{fmtAmt(totalCredit)}</strong></span>
              <span className={isBalanced ? 'balanced' : 'unbalanced'}>
                {isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
              </span>
            </div>
          </div>

          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating…' : 'Create Journal Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
