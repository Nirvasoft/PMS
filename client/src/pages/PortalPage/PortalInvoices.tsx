import { useState } from 'react';
import { useGetPortalInvoicesQuery, useGetPortalPaymentHistoryQuery, usePayPortalInvoiceMutation } from '../../store/api/portalApi';
import {
  Receipt, Download, DollarSign, Clock, CheckCircle2,
  AlertTriangle, Filter, CreditCard, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'issued,sent,partially_paid', label: 'Outstanding' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
];

function statusIcon(status: string) {
  switch (status) {
    case 'paid': return <CheckCircle2 size={14} />;
    case 'overdue': return <AlertTriangle size={14} />;
    default: return <Clock size={14} />;
  }
}

export default function PortalInvoices() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');

  const { data: invoiceData, isLoading: loadingInvoices } = useGetPortalInvoicesQuery({
    status: statusFilter || undefined,
    page,
    limit: 10,
  });

  const { data: payments, isLoading: loadingPayments } = useGetPortalPaymentHistoryQuery(undefined, {
    skip: tab !== 'payments',
  });

  const [payInvoice] = usePayPortalInvoiceMutation();
  const [payingId, setPayingId] = useState<string | null>(null);

  const handlePay = async (invoiceId: string) => {
    setPayingId(invoiceId);
    try {
      const returnUrl = `${window.location.origin}/portal/payments/success`;
      const result = await payInvoice({ invoiceId, returnUrl }).unwrap();
      // Redirect to Stripe Checkout (or mock URL in dev)
      window.location.href = result.checkoutUrl;
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to initiate payment');
      setPayingId(null);
    }
  };

  return (
    <div className="page-content portal-page">
      <div className="page-header">
        <h1>Invoices & Payments</h1>
      </div>

      {/* Tab Toggle */}
      <div className="portal-tab-bar" id="portal-invoices-tabs">
        <button
          className={`portal-tab ${tab === 'invoices' ? 'active' : ''}`}
          onClick={() => setTab('invoices')}
        >
          <Receipt size={16} /> Invoices
        </button>
        <button
          className={`portal-tab ${tab === 'payments' ? 'active' : ''}`}
          onClick={() => setTab('payments')}
        >
          <DollarSign size={16} /> Payment History
        </button>
      </div>

      {tab === 'invoices' && (
        <>
          {/* Status Filter */}
          <div className="portal-filter-bar">
            <Filter size={14} />
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                className={`portal-filter-chip ${statusFilter === t.key ? 'active' : ''}`}
                onClick={() => { setStatusFilter(t.key); setPage(1); }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loadingInvoices ? (
            <div className="loading-inline"><div className="loading-spinner" /> Loading invoices...</div>
          ) : !invoiceData?.data?.length ? (
            <div className="portal-card-empty" style={{ padding: '40px' }}>
              <Receipt size={40} style={{ opacity: 0.3 }} />
              <p>No invoices found</p>
            </div>
          ) : (
            <div className="portal-invoice-list" id="portal-invoice-list">
              {invoiceData.data.map((inv: any) => (
                <div key={inv.id} className="portal-invoice-card">
                  <div className="portal-invoice-left">
                    <div className="portal-invoice-header">
                      <span className="portal-invoice-number">{inv.invoiceNumber}</span>
                      <span className={`portal-status-badge status-${inv.status}`}>
                        {statusIcon(inv.status)} {inv.status}
                      </span>
                    </div>
                    <p className="portal-invoice-desc">{inv.description || 'Monthly Charges'}</p>
                    <div className="portal-invoice-dates">
                      <span>Issued: {new Date(inv.invoiceDate).toLocaleDateString()}</span>
                      <span>Due: {new Date(inv.dueDate).toLocaleDateString()}</span>
                    </div>
                    {inv.lines?.length > 0 && (
                      <div className="portal-invoice-lines">
                        {inv.lines.map((l: any, i: number) => (
                          <div key={i} className="portal-invoice-line">
                            <span>{l.description}</span>
                            <span>{Number(l.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="portal-invoice-right">
                    <div className="portal-invoice-amount">
                      <span className="portal-invoice-total">{inv.currency} {Number(inv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      {Number(inv.outstandingAmount) > 0 && inv.status !== 'paid' && (
                        <span className="portal-invoice-outstanding">
                          Due: {inv.currency} {Number(inv.outstandingAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <div className="portal-invoice-actions">
                      {Number(inv.outstandingAmount) > 0 && !['paid', 'void', 'cancelled'].includes(inv.status) && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handlePay(inv.id)}
                          disabled={payingId === inv.id}
                          id={`pay-invoice-${inv.id}`}
                        >
                          {payingId === inv.id ? (
                            <><Loader2 size={14} className="spin" /> Processing...</>
                          ) : (
                            <><CreditCard size={14} /> Pay Now</>
                          )}
                        </button>
                      )}
                      <button className="btn btn-sm" title="Download Invoice">
                        <Download size={14} /> PDF
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {invoiceData.meta && invoiceData.meta.total > invoiceData.meta.limit && (
                <div className="portal-pagination">
                  <button
                    className="btn btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Previous
                  </button>
                  <span className="portal-pagination-info">
                    Page {invoiceData.meta.page} of {Math.ceil(invoiceData.meta.total / invoiceData.meta.limit)}
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={page >= Math.ceil(invoiceData.meta.total / invoiceData.meta.limit)}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'payments' && (
        <>
          {loadingPayments ? (
            <div className="loading-inline"><div className="loading-spinner" /> Loading payments...</div>
          ) : !payments?.length ? (
            <div className="portal-card-empty" style={{ padding: '40px' }}>
              <DollarSign size={40} style={{ opacity: 0.3 }} />
              <p>No payment history yet</p>
            </div>
          ) : (
            <div className="portal-payment-list" id="portal-payment-list">
              {payments.map((p) => (
                <div key={p.id} className="portal-payment-card">
                  <div className="portal-payment-info">
                    <span className="portal-payment-number">{p.receiptNumber}</span>
                    <span className="portal-payment-date">{new Date(p.receiptDate).toLocaleDateString()}</span>
                    <span className="portal-payment-method">{p.paymentMethod}</span>
                  </div>
                  <div className="portal-payment-amount">
                    <span>{p.currency} {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {p.allocations?.length > 0 && (
                    <div className="portal-payment-allocs">
                      {p.allocations.map((a, i) => (
                        <span key={i} className="portal-payment-alloc">
                          {a.invoiceNumber}: {Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
