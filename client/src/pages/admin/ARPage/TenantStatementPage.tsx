import { useState } from 'react';
import { useLazyGetTenantStatementQuery } from '../../../store/api/arApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { FileText, Search, Download } from 'lucide-react';
import './ARPage.css';

const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export default function TenantStatementPage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState(firstOfMonth.toISOString().split('T')[0]);
  const [to, setTo] = useState(today.toISOString().split('T')[0]);

  const { data: tenantsData } = useGetTenantsQuery({ page: 1, limit: 50 });
  const tenants = tenantsData?.data || [];

  const [fetchStatement, { data, isFetching }] = useLazyGetTenantStatementQuery();
  const statement = data?.data;

  const handleGenerate = () => {
    if (!tenantId || !from || !to) return;
    fetchStatement({ tenantId, from, to });
  };

  const handleDownloadPdf = () => {
    if (!tenantId || !from || !to) return;
    const url = `/api/v1/tenants/${tenantId}/statement/pdf?from=${from}&to=${to}`;
    window.open(url, '_blank');
  };

  const getTenantName = (t: any) =>
    t.tenantType === 'corporate' ? t.companyName || '' : `${t.firstName || ''} ${t.lastName || ''}`.trim();

  const typeLabel = (type: string) => {
    switch (type) {
      case 'invoice': return 'Invoice';
      case 'credit_note': return 'Credit Note';
      case 'receipt': return 'Payment';
      default: return type;
    }
  };

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(6,182,212,0.12)', color: '#22d3ee' }}>
            <FileText size={22} />
          </div>
          <div>
            <h1>Tenant Statement</h1>
            <p>Generate account statements for tenants</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="ar-filters" style={{ marginBottom: 24 }}>
        <select className="filter-select" value={tenantId} onChange={e => setTenantId(e.target.value)}
          style={{ minWidth: 240 }}>
          <option value="">Select tenant…</option>
          {tenants.map((t: any) => (
            <option key={t.id} value={t.id}>{getTenantName(t)}</option>
          ))}
        </select>
        <input type="date" className="filter-date" value={from} onChange={e => setFrom(e.target.value)}
          style={{
            padding: '9px 14px', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
            color: 'var(--text-primary)', fontSize: 13,
          }} />
        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>to</span>
        <input type="date" className="filter-date" value={to} onChange={e => setTo(e.target.value)}
          style={{
            padding: '9px 14px', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
            color: 'var(--text-primary)', fontSize: 13,
          }} />
        <button className="btn btn-primary" onClick={handleGenerate}
          disabled={!tenantId || isFetching}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} /> {isFetching ? 'Loading…' : 'Generate'}
        </button>
      </div>

      {/* Statement Content */}
      {statement && (
        <>
          {/* Statement Header */}
          <div className="statement-header">
            <div>
              <div className="sh-tenant">{statement.tenant.displayName}</div>
              <div className="sh-period">
                Statement Period: {new Date(statement.period.from).toLocaleDateString()} — {new Date(statement.period.to).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={handleDownloadPdf}
                disabled={!tenantId}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Download size={14} /> Download PDF
              </button>
            </div>
            <div className="statement-balances">
              <div className="sb-item">
                <div className="sb-label">Opening Balance</div>
                <div className="sb-value">{formatCurrency(statement.openingBalance)}</div>
              </div>
              <div className="sb-item">
                <div className="sb-label">Closing Balance</div>
                <div className="sb-value" style={{
                  color: statement.closingBalance > 0 ? '#f87171' : statement.closingBalance < 0 ? '#34d399' : undefined,
                }}>
                  {formatCurrency(statement.closingBalance)}
                </div>
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="ar-table-wrap">
            <table className="ar-table statement-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Date</th>
                  <th style={{ width: 100 }}>Type</th>
                  <th style={{ width: 140 }}>Reference</th>
                  <th>Description</th>
                  <th className="text-right" style={{ width: 110 }}>Debit</th>
                  <th className="text-right" style={{ width: 110 }}>Credit</th>
                  <th className="text-right" style={{ width: 120 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance row */}
                <tr style={{ fontStyle: 'italic' }}>
                  <td>{new Date(statement.period.from).toLocaleDateString()}</td>
                  <td><span style={{ color: 'var(--text-tertiary)' }}>—</span></td>
                  <td><span style={{ color: 'var(--text-tertiary)' }}>—</span></td>
                  <td><span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Opening Balance</span></td>
                  <td className="text-right"><span style={{ color: 'var(--text-tertiary)' }}>—</span></td>
                  <td className="text-right"><span style={{ color: 'var(--text-tertiary)' }}>—</span></td>
                  <td className="text-right">
                    <span className="balance-cell">{formatCurrency(statement.openingBalance)}</span>
                  </td>
                </tr>

                {statement.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="ar-empty">No transactions in this period.</div>
                    </td>
                  </tr>
                ) : (
                  statement.transactions.map((txn, i) => (
                    <tr key={i}>
                      <td>{txn.date}</td>
                      <td>
                        <span className={`ar-status ar-status--${txn.type === 'invoice' ? 'pending' : 'confirmed'}`}>
                          {typeLabel(txn.type)}
                        </span>
                      </td>
                      <td><span className="cell-mono">{txn.reference}</span></td>
                      <td>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {txn.description}
                        </div>
                      </td>
                      <td className="text-right">
                        {txn.debit > 0 ? (
                          <span className="debit-cell">{formatCurrency(txn.debit)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td className="text-right">
                        {txn.credit > 0 ? (
                          <span className="credit-cell">{formatCurrency(txn.credit)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="balance-cell">{formatCurrency(txn.balance)}</span>
                      </td>
                    </tr>
                  ))
                )}

                {/* Closing balance row */}
                <tr style={{ fontWeight: 700, background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={4} style={{ textAlign: 'right', paddingRight: 20 }}>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Closing Balance</span>
                  </td>
                  <td className="text-right">
                    <span className="debit-cell" style={{ fontWeight: 800 }}>
                      {formatCurrency(statement.transactions.reduce((s, t) => s + t.debit, 0))}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className="credit-cell" style={{ fontWeight: 800 }}>
                      {formatCurrency(statement.transactions.reduce((s, t) => s + t.credit, 0))}
                    </span>
                  </td>
                  <td className="text-right">
                    <span className="balance-cell" style={{
                      fontSize: 15,
                      color: statement.closingBalance > 0 ? '#f87171' : statement.closingBalance < 0 ? '#34d399' : 'var(--text-primary)',
                    }}>
                      {formatCurrency(statement.closingBalance)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state before generating */}
      {!statement && !isFetching && (
        <div style={{
          textAlign: 'center', padding: '80px 20px', color: 'var(--text-tertiary)',
        }}>
          <FileText size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Select a tenant and date range</div>
          <div style={{ fontSize: 13 }}>Then click "Generate" to view their account statement</div>
        </div>
      )}
    </div>
  );
}
