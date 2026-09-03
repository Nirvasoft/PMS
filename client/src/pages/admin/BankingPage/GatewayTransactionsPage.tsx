import { useState, useMemo } from 'react';
import {
  useGetGatewayTransactionsQuery, useGetGatewaySummaryQuery,
  useRefundGatewayPaymentMutation,
} from '../../../store/api/bankingApi';
import type { GatewayTransaction } from '../../../store/api/bankingApi';
import {
  Zap, Search, ChevronLeft, ChevronRight, X,
  CreditCard, DollarSign, AlertTriangle, RefreshCw,
  CheckCircle2, XCircle, Clock, RotateCcw, ExternalLink,
  Wallet, Globe, ArrowDownRight,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import '../GLPage/GLPage.css';
import '../BillingPage/BillingPage.css';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

const GATEWAY_MAP: Record<string, { label: string; color: string; bg: string; icon: typeof CreditCard }> = {
  stripe:  { label: 'Stripe',  color: '#635bff', bg: 'rgba(99,91,255,0.1)',  icon: CreditCard },
  paypal:  { label: 'PayPal',  color: '#003087', bg: 'rgba(0,48,135,0.1)',   icon: Globe },
  paytabs: { label: 'PayTabs', color: '#00a5b5', bg: 'rgba(0,165,181,0.1)',  icon: Wallet },
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  initiated: { label: 'Pending',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Clock },
  completed: { label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: CheckCircle2 },
  failed:    { label: 'Failed',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: XCircle },
  refunded:  { label: 'Refunded',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  icon: RotateCcw },
};

export default function GatewayTransactionsPage() {
  const [page, setPage] = useState(1);
  const [gateway, setGateway] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [detailTxn, setDetailTxn] = useState<GatewayTransaction | null>(null);
  const [refundModal, setRefundModal] = useState<GatewayTransaction | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const { data: txnsData, isFetching } = useGetGatewayTransactionsQuery({
    gateway: gateway || undefined,
    status: status || undefined,
    page, limit: 20,
  });
  const { data: summary } = useGetGatewaySummaryQuery();
  const [refundPayment, { isLoading: refunding }] = useRefundGatewayPaymentMutation();

  const txns = txnsData?.data || [];
  const meta = txnsData?.meta;

  const filtered = useMemo(() => {
    if (!search) return txns;
    const s = search.toLowerCase();
    return txns.filter(t =>
      getTenantName(t).toLowerCase().includes(s) ||
      t.gatewayTxnId.toLowerCase().includes(s) ||
      (t.invoice?.invoiceNumber || '').toLowerCase().includes(s) ||
      (t.payerEmail || '').toLowerCase().includes(s)
    );
  }, [txns, search]);

  const handleRefund = async () => {
    if (!refundModal || !refundReason.trim()) return;
    try {
      await refundPayment({ id: refundModal.id, reason: refundReason }).unwrap();
      toast.success('Payment refunded successfully');
      setRefundModal(null);
      setRefundReason('');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to refund payment');
    }
  };

  return (
    <div className="banking-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(99,91,255,0.12)', color: '#635bff' }}>
            <Zap size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Payment Gateway Transactions</h1>
            <p>Track online payments via Stripe, PayPal, and PayTabs</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="billing-summary-cards" style={{ marginBottom: 24 }}>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(99,91,255,0.12)', color: '#635bff' }}>
              <Zap size={18} />
            </div>
            <span className="bsc-label">Total Transactions</span>
            <span className="bsc-value">{summary.totalTransactions}</span>
          </div>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
              <CheckCircle2 size={18} />
            </div>
            <span className="bsc-label">Completed</span>
            <span className="bsc-value">{formatCurrency(summary.totalCompleted)}</span>
            <span className="bsc-sub">{summary.completedCount} transactions</span>
          </div>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
              <ArrowDownRight size={18} />
            </div>
            <span className="bsc-label">Gateway Fees</span>
            <span className="bsc-value">{formatCurrency(summary.totalFees)}</span>
          </div>
          <div className="billing-stat-card">
            <div className="bsc-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
              <DollarSign size={18} />
            </div>
            <span className="bsc-label">Net Revenue</span>
            <span className="bsc-value" style={{ color: '#3b82f6' }}>{formatCurrency(summary.totalNet)}</span>
          </div>
        </div>
      )}

      {/* Status pills */}
      {summary && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { key: '', label: 'All', count: summary.totalTransactions },
            { key: 'completed', label: 'Completed', count: summary.completedCount, color: '#10b981' },
            { key: 'initiated', label: 'Pending', count: summary.pendingCount, color: '#f59e0b' },
            { key: 'failed', label: 'Failed', count: summary.failedCount, color: '#ef4444' },
            { key: 'refunded', label: 'Refunded', count: summary.refundedCount, color: '#8b5cf6' },
          ].map(s => (
            <button key={s.key} onClick={() => { setStatus(s.key); setPage(1); }}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: '1px solid', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center',
                borderColor: status === s.key ? (s.color || 'var(--primary)') : 'var(--border-subtle)',
                background: status === s.key ? (s.color ? `${s.color}15` : 'rgba(99,91,255,0.08)') : 'transparent',
                color: status === s.key ? (s.color || 'var(--primary)') : 'var(--text-secondary)',
              }}>
              {s.label}
              <span style={{ background: s.color ? `${s.color}20` : 'var(--bg-elevated)', padding: '1px 7px', borderRadius: 10, fontSize: 10 }}>
                {s.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="billing-filters">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input type="text" placeholder="Search by tenant, txn ID, invoice…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={gateway} onChange={e => { setGateway(e.target.value); setPage(1); }}>
          <option value="">All Gateways</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="paytabs">PayTabs</option>
        </select>
      </div>

      {/* Table */}
      <div className="billing-table-wrap" style={{ marginTop: 0 }}>
        <table className="billing-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Gateway</th>
              <th style={{ width: 180 }}>Tenant</th>
              <th style={{ width: 130 }}>Invoice</th>
              <th className="text-right" style={{ width: 110 }}>Amount</th>
              <th className="text-right" style={{ width: 80 }}>Fee</th>
              <th style={{ width: 90 }}>Method</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 140 }}>Date</th>
              <th className="text-center" style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="billing-empty">{isFetching ? 'Loading…' : 'No transactions found.'}</div>
                </td>
              </tr>
            ) : filtered.map(txn => {
              const gw = GATEWAY_MAP[txn.gateway] || GATEWAY_MAP.stripe;
              const st = STATUS_MAP[txn.gatewayStatus] || STATUS_MAP.initiated;
              const GwIcon = gw.icon;
              const StIcon = st.icon;

              return (
                <tr key={txn.id} onClick={() => setDetailTxn(txn)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: gw.bg, color: gw.color,
                    }}>
                      <GwIcon size={12} /> {gw.label}
                    </span>
                  </td>
                  <td>
                    <div className="cell-primary">{getTenantName(txn)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{txn.payerEmail || '—'}</div>
                  </td>
                  <td>
                    {txn.invoice ? (
                      <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}>
                        {txn.invoice.invoiceNumber}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="text-right">
                    <span className="cell-amount">{formatCurrency(txn.amount, txn.currency)}</span>
                  </td>
                  <td className="text-right">
                    <span style={{ fontSize: 12, color: Number(txn.feeAmount) > 0 ? '#f59e0b' : 'var(--text-tertiary)' }}>
                      {Number(txn.feeAmount) > 0 ? formatCurrency(txn.feeAmount, txn.currency) : '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, textTransform: 'capitalize' }}>
                      {txn.paymentMethod || '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: st.bg, color: st.color,
                    }}>
                      <StIcon size={11} /> {st.label}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{format(new Date(txn.initiatedAt), 'MMM d, yyyy')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{format(new Date(txn.initiatedAt), 'HH:mm')}</div>
                  </td>
                  <td className="text-center" onClick={e => e.stopPropagation()}>
                    {txn.gatewayStatus === 'completed' && (
                      <button className="action-btn" onClick={() => { setRefundModal(txn); setRefundReason(''); }}
                        title="Refund" style={{ color: '#8b5cf6' }}>
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {meta && meta.totalPages > 1 && (
          <div className="billing-pagination">
            <span className="page-info">Page {meta.page} of {meta.totalPages} · {meta.total} transactions</span>
            <div className="page-btns">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} /></button>
              <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Transaction Detail Drawer ═══ */}
      {detailTxn && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2><ExternalLink size={18} /> Transaction Details</h2>
              <button className="modal-close" onClick={() => setDetailTxn(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Gateway & Status header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, padding: 14, background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Gateway</span>
                  <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>
                    {(GATEWAY_MAP[detailTxn.gateway] || GATEWAY_MAP.stripe).label}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Amount</span>
                  <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--primary)' }}>
                    {formatCurrency(detailTxn.amount, detailTxn.currency)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Status</span>
                  {(() => {
                    const st = STATUS_MAP[detailTxn.gatewayStatus] || STATUS_MAP.initiated;
                    const Icon = st.icon;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                        <Icon size={14} style={{ color: st.color }} />
                        <span style={{ fontWeight: 600, color: st.color }}>{st.label}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', fontSize: 13 }}>
                <DetailRow label="Transaction ID" value={detailTxn.gatewayTxnId} mono />
                <DetailRow label="Payment Method" value={detailTxn.paymentMethod || '—'} />
                <DetailRow label="Tenant" value={getTenantName(detailTxn)} />
                <DetailRow label="Payer Email" value={detailTxn.payerEmail || '—'} />
                <DetailRow label="Invoice" value={detailTxn.invoice?.invoiceNumber || '—'} />
                <DetailRow label="Currency" value={detailTxn.currency} />
                {Number(detailTxn.feeAmount) > 0 && (
                  <>
                    <DetailRow label="Fee" value={formatCurrency(detailTxn.feeAmount, detailTxn.currency)} />
                    <DetailRow label="Net" value={formatCurrency(detailTxn.netAmount || 0, detailTxn.currency)} />
                  </>
                )}
                <DetailRow label="Initiated" value={format(new Date(detailTxn.initiatedAt), 'MMM d, yyyy HH:mm')} />
                {detailTxn.completedAt && <DetailRow label="Completed" value={format(new Date(detailTxn.completedAt), 'MMM d, yyyy HH:mm')} />}
                {detailTxn.failedAt && <DetailRow label="Failed At" value={format(new Date(detailTxn.failedAt), 'MMM d, yyyy HH:mm')} />}
                {detailTxn.failureReason && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <DetailRow label="Failure Reason" value={detailTxn.failureReason} />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDetailTxn(null)}>Close</button>
              {detailTxn.gatewayStatus === 'completed' && (
                <button className="btn btn-primary" onClick={() => { setRefundModal(detailTxn); setRefundReason(''); setDetailTxn(null); }}
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={14} /> Refund
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Refund Modal ═══ */}
      {refundModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2><RotateCcw size={18} /> Refund Payment</h2>
              <button className="modal-close" onClick={() => setRefundModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Info */}
              <div style={{ marginBottom: 16, padding: 14, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Tenant</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{getTenantName(refundModal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Invoice</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{refundModal.invoice?.invoiceNumber || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Amount</span>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#ef4444' }}>
                    {formatCurrency(refundModal.amount, refundModal.currency)}
                  </span>
                </div>
              </div>

              <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.06)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(245,158,11,0.15)' }}>
                <AlertTriangle size={14} />
                This will reverse the invoice payment and mark the transaction as refunded.
              </div>

              <div className="inv-field">
                <label>Refund Reason <span className="req">*</span></label>
                <textarea rows={3} placeholder="Enter reason for refund…"
                  value={refundReason} onChange={e => setRefundReason(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRefundModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRefund}
                disabled={refunding || !refundReason.trim()}
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                {refunding ? 'Processing…' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTenantName(txn: GatewayTransaction) {
  if (!txn.tenant) return txn.payerName || '—';
  return txn.tenant.tenantType !== 'individual'
    ? txn.tenant.companyName || ''
    : `${txn.tenant.firstName || ''} ${txn.tenant.lastName || ''}`.trim();
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 500, fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
