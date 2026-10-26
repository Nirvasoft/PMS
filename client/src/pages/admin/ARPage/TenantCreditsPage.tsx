import { useState, useMemo } from 'react';
import {
  useGetCreditsQuery, useGetCreditsSummaryQuery,
  useCreateCreditMutation, useApplyCreditMutation,
} from '../../../store/api/arApi';
import type { TenantCreditWithTenant } from '../../../store/api/arApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { useGetInvoicesQuery } from '../../../store/api/billingApi';
import {
  Coins, Plus, Search, ChevronLeft, ChevronRight, X,
  DollarSign, Award, Zap, ArrowRightCircle, Wallet,
  CreditCard, Gift,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import '../BillingPage/BillingPage.css';
import './ARPage.css';

import { formatCurrency } from '../../../utils/formatCurrency';

const SOURCE_TYPE_MAP: Record<string, { label: string; color: string; bg: string; icon: typeof CreditCard }> = {
  overpayment: { label: 'Overpayment', color: '#2563eb', bg: 'rgba(37,99,235,0.1)', icon: Wallet },
  credit_note: { label: 'Credit Note', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', icon: CreditCard },
  adjustment:  { label: 'Adjustment',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Gift },
};

export default function TenantCreditsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);
  const [applyModal, setApplyModal] = useState<TenantCreditWithTenant | null>(null);
  const [hasAttemptedApply, setHasAttemptedApply] = useState(false);

  const { data: creditsData, isFetching } = useGetCreditsQuery({
    sourceType: sourceFilter || undefined, page, limit: pageSize,
  });
  const { data: summaryRes } = useGetCreditsSummaryQuery();
  const { data: tenantsRes } = useGetTenantsQuery({ page: 1, limit: 200 });
  const [createCredit, { isLoading: creating }] = useCreateCreditMutation();
  const [applyCredit, { isLoading: applying }] = useApplyCreditMutation();

  const credits = creditsData?.data || [];
  const meta = creditsData?.meta;
  const summary = summaryRes?.data;
  const tenants = tenantsRes?.data || [];

  const filtered = search
    ? credits.filter(c =>
        getTenantName(c).toLowerCase().includes(search.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(search.toLowerCase()))
    : credits;

  // Create form
  const [form, setForm] = useState({
    tenantId: '', amount: '', currency: 'USD',
    sourceType: 'adjustment' as string, description: '',
  });

  // Apply form
  const [applyInvoiceId, setApplyInvoiceId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');

  // Get invoices for the apply modal tenant
  const { data: tenantInvoicesRes } = useGetInvoicesQuery(
    { tenantId: applyModal?.tenant.id, status: undefined, page: 1, limit: 100 },
    { skip: !applyModal },
  );
  const outstandingInvoices = useMemo(() =>
    (tenantInvoicesRes?.data || []).filter(inv =>
      !['void', 'paid'].includes(inv.status) && Number(inv.totalAmount) - Number(inv.paidAmount) > 0
    ),
    [tenantInvoicesRes],
  );

  const openCreateModal = () => {
    setHasAttemptedCreate(false);
    setForm({ tenantId: '', amount: '', currency: 'USD', sourceType: 'adjustment', description: '' });
    setShowCreate(true);
  };

  const isCreateTenantInvalid = !form.tenantId;
  const createAmtNum = parseFloat(form.amount);
  const isCreateAmountInvalid = !form.amount.trim() || isNaN(createAmtNum) || createAmtNum <= 0;

  const handleCreate = async () => {
    setHasAttemptedCreate(true);
    if (isCreateTenantInvalid || isCreateAmountInvalid) {
      return toast.error('Tenant and amount are required');
    }
    try {
      await createCredit({
        tenantId: form.tenantId,
        amount: createAmtNum,
        currency: form.currency,
        sourceType: form.sourceType,
        description: form.description || undefined,
      }).unwrap();
      toast.success('Credit created');
      setShowCreate(false);
      setHasAttemptedCreate(false);
      setForm({ tenantId: '', amount: '', currency: 'USD', sourceType: 'adjustment', description: '' });
    } catch (err: any) { toast.error(err?.data?.errors?.[0]?.message || 'Failed to create credit'); }
  };

  const isApplyInvoiceInvalid = !applyInvoiceId;
  const applyAmtNum = parseFloat(applyAmount);
  const isApplyAmountInvalid = !applyAmount.trim() || isNaN(applyAmtNum) || applyAmtNum <= 0 || (applyModal ? applyAmtNum > applyModal.balance : false);

  const handleApply = async () => {
    setHasAttemptedApply(true);
    if (!applyModal || isApplyInvoiceInvalid || isApplyAmountInvalid) return;
    try {
      const result = await applyCredit({
        creditId: applyModal.id,
        invoiceId: applyInvoiceId,
        amount: applyAmtNum,
      }).unwrap();
      toast.success(`Applied ${formatCurrency(result.data.appliedAmount, applyModal.currency)} to invoice`);
      setApplyModal(null);
      setHasAttemptedApply(false);
      setApplyInvoiceId('');
      setApplyAmount('');
    } catch (err: any) { toast.error(err?.data?.errors?.[0]?.message || 'Failed to apply credit'); }
  };

  const totalCount = meta ? meta.total : filtered.length;
  const totalPages = meta?.totalPages || 1;

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <Coins size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Tenant Credits</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {meta ? `${meta.total} total credits` : 'Loading…'}
            </p>
          </div>
          <PermissionGuard permission="ar-credits.write">
            <button className="btn btn-primary" onClick={openCreateModal}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Issue Credit
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="billing-summary-cards" style={{ marginBottom: 24 }}>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
              <Award size={18} />
            </div>
            <div className="bsc-info">
              <span className="bsc-label">Total Credits</span>
              <span className="bsc-value">{summary.totalCredits}</span>
            </div>
          </div>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
              <DollarSign size={18} />
            </div>
            <div className="bsc-info">
              <span className="bsc-label">Total Issued</span>
              <span className="bsc-value">{formatCurrency(summary.totalIssued)}</span>
            </div>
          </div>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
              <Zap size={18} />
            </div>
            <div className="bsc-info">
              <span className="bsc-label">Total Used</span>
              <span className="bsc-value">{formatCurrency(summary.totalUsed)}</span>
            </div>
          </div>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
              <Wallet size={18} />
            </div>
            <div className="bsc-info">
              <span className="bsc-label">Available Balance</span>
              <span className="bsc-value" style={{ color: '#3b82f6' }}>{formatCurrency(summary.totalAvailable)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="billing-filters">
        <div className="billing-filters-left">
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input type="text" placeholder="Search by tenant or description…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="filter-select" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            <option value="overpayment">Overpayment</option>
            <option value="credit_note">Credit Note</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="billing-table-wrap" style={{ marginTop: 0 }}>
        <TableScrollWrapper>
          <table className="billing-table">
            <thead>
              <tr>
                <th style={{ width: 200 }}>Tenant</th>
                <th style={{ width: 120 }}>Type</th>
                <th>Description</th>
                <th className="text-right" style={{ width: 120 }}>Issued</th>
                <th className="text-right" style={{ width: 120 }}>Used</th>
                <th className="text-right" style={{ width: 120 }}>Balance</th>
                <th style={{ width: 130 }}>Date</th>
                <th className="text-center" style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="billing-empty">
                      {isFetching ? 'Loading credits…' : 'No credits found.'}
                    </div>
                  </td>
                </tr>
              ) : filtered.map(credit => {
                const src = SOURCE_TYPE_MAP[credit.sourceType] || SOURCE_TYPE_MAP.adjustment;
                const IconComp = src.icon;
                const hasBalance = credit.balance > 0;

                return (
                  <tr key={credit.id}>
                    <td>
                      <div className="cell-primary">{getTenantName(credit)}</div>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: src.bg, color: src.color,
                      }}>
                        <IconComp size={12} /> {src.label}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {credit.description || '—'}
                    </td>
                    <td className="text-right">
                      <span className="cell-amount">{formatCurrency(credit.amount, credit.currency)}</span>
                    </td>
                    <td className="text-right">
                      <span className="cell-amount" style={{ color: Number(credit.usedAmount) > 0 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                        {formatCurrency(credit.usedAmount, credit.currency)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="cell-amount" style={{ color: hasBalance ? '#10b981' : 'var(--text-tertiary)', fontWeight: 700 }}>
                        {formatCurrency(credit.balance, credit.currency)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{format(new Date(credit.createdAt), 'MMM d, yyyy')}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{format(new Date(credit.createdAt), 'HH:mm')}</div>
                    </td>
                    <td className="text-center">
                      {hasBalance && (
                        <PermissionGuard permission="ar-credits.write">
                          <button
                            className="action-btn"
                            onClick={() => {
                              setHasAttemptedApply(false);
                              setApplyInvoiceId('');
                              setApplyModal(credit);
                              setApplyAmount(String(credit.balance));
                            }}
                            title="Apply credit to invoice"
                            style={{ color: '#3b82f6' }}
                          >
                            <ArrowRightCircle size={15} />
                          </button>
                        </PermissionGuard>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScrollWrapper>

        {totalCount >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="tc-ar-page-size">Rows per page:</label>
                <select
                  id="tc-ar-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="page-btns">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} title="Previous page"><ChevronLeft size={15} /></button>
              <span className="page-num-display">
                Page {page} of {Math.max(totalPages, 1)}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} title="Next page"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Create Credit Modal ═══ */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Plus size={18} /> Issue Credit</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="inv-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="inv-field" style={{ gridColumn: 'span 2' }}>
                  <label>Tenant <span className="req">*</span></label>
                  <select
                    value={form.tenantId}
                    onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))}
                    className={hasAttemptedCreate && isCreateTenantInvalid ? 'inv-input-error' : ''}
                  >
                    <option value="">Select tenant…</option>
                    {tenants.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.tenantType !== 'individual' ? t.companyName : `${t.firstName || ''} ${t.lastName || ''}`.trim()}
                      </option>
                    ))}
                  </select>
                  {hasAttemptedCreate && isCreateTenantInvalid && (
                    <span className="inv-error-text">Tenant is required</span>
                  )}
                </div>
                <div className="inv-field">
                  <label>Amount <span className="req">*</span></label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className={hasAttemptedCreate && isCreateAmountInvalid ? 'inv-input-error' : ''}
                  />
                  {hasAttemptedCreate && isCreateAmountInvalid && (
                    <span className="inv-error-text">Valid amount is required</span>
                  )}
                </div>
                <div className="inv-field">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    <option value="USD">USD</option><option value="SGD">SGD</option>
                    <option value="MMK">MMK</option><option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="inv-field" style={{ gridColumn: 'span 2' }}>
                  <label>Source Type <span className="req">*</span></label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {Object.entries(SOURCE_TYPE_MAP).map(([key, val]) => {
                      const Icon = val.icon;
                      return (
                        <button key={key} type="button" onClick={() => setForm(f => ({ ...f, sourceType: key }))}
                          style={{
                            flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid',
                            borderColor: form.sourceType === key ? val.color : 'var(--border-subtle)',
                            background: form.sourceType === key ? val.bg : 'transparent',
                            color: form.sourceType === key ? val.color : 'var(--text-secondary)',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}>
                          <Icon size={14} /> {val.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="inv-field" style={{ gridColumn: 'span 2' }}>
                  <label>Description</label>
                  <textarea rows={2} placeholder="e.g. Overpayment from January rent"
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
                {creating ? 'Creating…' : 'Issue Credit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Apply Credit Modal ═══ */}
      {applyModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><ArrowRightCircle size={18} /> Apply Credit to Invoice</h2>
              <button className="modal-close" onClick={() => setApplyModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Credit info */}
              <div style={{ marginBottom: 16, padding: 14, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Tenant</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{getTenantName(applyModal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Available Balance</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>
                    {formatCurrency(applyModal.balance, applyModal.currency)}
                  </span>
                </div>
              </div>

              <div className="inv-field" style={{ marginBottom: 16 }}>
                <label>Select Invoice <span className="req">*</span></label>
                <select
                  value={applyInvoiceId}
                  onChange={e => {
                    setApplyInvoiceId(e.target.value);
                    const inv = outstandingInvoices.find(i => i.id === e.target.value);
                    if (inv) {
                      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
                      setApplyAmount(String(Math.min(applyModal.balance, outstanding)));
                    }
                  }}
                  className={hasAttemptedApply && isApplyInvoiceInvalid ? 'inv-input-error' : ''}
                >
                  <option value="">Select an outstanding invoice…</option>
                  {outstandingInvoices.map(inv => {
                    const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — Outstanding: {formatCurrency(outstanding, inv.currency)}
                      </option>
                    );
                  })}
                </select>
                {hasAttemptedApply && isApplyInvoiceInvalid && (
                  <span className="inv-error-text">Invoice is required</span>
                )}
                {outstandingInvoices.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    No outstanding invoices found for this tenant.
                  </p>
                )}
              </div>

              <div className="inv-field">
                <label>Amount to Apply <span className="req">*</span></label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  max={applyModal.balance}
                  value={applyAmount}
                  onChange={e => setApplyAmount(e.target.value)}
                  placeholder="0.00"
                  className={hasAttemptedApply && isApplyAmountInvalid ? 'inv-input-error' : ''}
                />
                {hasAttemptedApply && isApplyAmountInvalid && (
                  <span className="inv-error-text">Valid amount (up to available balance) is required</span>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Max: {formatCurrency(applyModal.balance, applyModal.currency)}
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setApplyModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleApply}
                disabled={applying}
                style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                {applying ? 'Applying…' : 'Apply Credit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTenantName(item: TenantCreditWithTenant) {
  if (!item.tenant) return '—';
  return item.tenant.tenantType !== 'individual'
    ? item.tenant.companyName || ''
    : `${item.tenant.firstName || ''} ${item.tenant.lastName || ''}`.trim();
}
