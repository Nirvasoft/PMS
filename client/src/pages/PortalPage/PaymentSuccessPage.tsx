import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGetPortalInvoicesQuery } from '../../store/api/portalApi';
import { CheckCircle2, Clock, XCircle, ArrowLeft, Receipt } from 'lucide-react';

type PaymentStatus = 'verifying' | 'success' | 'pending' | 'failed';

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<PaymentStatus>('verifying');
  const [pollCount, setPollCount] = useState(0);

  // Re-fetch invoices to check if payment landed
  const { data: invoiceData, refetch } = useGetPortalInvoicesQuery({
    status: 'paid',
    page: 1,
    limit: 5,
  });

  useEffect(() => {
    if (!sessionId) {
      setStatus('failed');
      return;
    }

    // Poll every 5 seconds for up to 60 seconds
    if (pollCount >= 12) {
      setStatus('pending');
      return;
    }

    const timer = setTimeout(async () => {
      const result = await refetch();
      // Check if we have any recently paid invoices
      const recentlyPaid = result.data?.data?.some((inv: any) => {
        const paidAt = new Date(inv.updatedAt || inv.invoiceDate);
        const now = new Date();
        return now.getTime() - paidAt.getTime() < 120000; // within last 2 minutes
      });

      if (recentlyPaid) {
        setStatus('success');
      } else {
        setPollCount((c) => c + 1);
      }
    }, pollCount === 0 ? 2000 : 5000); // first check after 2s, then every 5s

    return () => clearTimeout(timer);
  }, [sessionId, pollCount, refetch]);

  return (
    <div className="page-content portal-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="info-card" style={{ textAlign: 'center', padding: '48px 40px', maxWidth: 480 }}>
        {status === 'verifying' && (
          <>
            <div className="payment-status-icon verifying">
              <Clock size={48} />
            </div>
            <h2 style={{ marginTop: 20 }}>Verifying Payment...</h2>
            <p className="text-muted" style={{ marginTop: 8 }}>
              Please wait while we confirm your payment with Stripe.
            </p>
            <div className="loading-spinner" style={{ margin: '24px auto 0' }} />
          </>
        )}

        {status === 'success' && (
          <>
            <div className="payment-status-icon success" style={{ color: 'var(--green, #00b894)' }}>
              <CheckCircle2 size={56} />
            </div>
            <h2 style={{ marginTop: 20, color: 'var(--green, #00b894)' }}>Payment Successful!</h2>
            <p className="text-muted" style={{ marginTop: 8, fontSize: '0.95rem' }}>
              Your payment has been processed successfully. A receipt has been generated and is available in your payment history.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/portal/invoices')}
              >
                <Receipt size={16} /> View Invoices
              </button>
              <button
                className="btn"
                onClick={() => navigate('/portal')}
              >
                <ArrowLeft size={16} /> Back to Dashboard
              </button>
            </div>
          </>
        )}

        {status === 'pending' && (
          <>
            <div className="payment-status-icon pending" style={{ color: 'var(--warning, #fdcb6e)' }}>
              <Clock size={56} />
            </div>
            <h2 style={{ marginTop: 20 }}>Payment Processing</h2>
            <p className="text-muted" style={{ marginTop: 8, fontSize: '0.95rem' }}>
              Your payment is being processed. It may take a few minutes for the payment to be confirmed. You can check back on your invoices page.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/portal/invoices')}
              >
                <Receipt size={16} /> View Invoices
              </button>
            </div>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="payment-status-icon failed" style={{ color: 'var(--danger, #e74c3c)' }}>
              <XCircle size={56} />
            </div>
            <h2 style={{ marginTop: 20 }}>Payment Failed</h2>
            <p className="text-muted" style={{ marginTop: 8, fontSize: '0.95rem' }}>
              Something went wrong with your payment. No charges were made. Please try again from your invoices page.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/portal/invoices')}
              >
                <ArrowLeft size={16} /> Back to Invoices
              </button>
            </div>
          </>
        )}

        {sessionId && (
          <p className="text-small text-muted" style={{ marginTop: 20, opacity: 0.5 }}>
            Session: {sessionId.substring(0, 20)}...
          </p>
        )}
      </div>
    </div>
  );
}
