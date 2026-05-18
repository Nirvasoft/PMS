import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token provided.'); return; }

    fetch('/api/v1/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) { setStatus('success'); setMessage(data.data.message); }
        else { setStatus('error'); setMessage(data.errors?.[0]?.message || 'Verification failed'); }
      })
      .catch(() => { setStatus('error'); setMessage('Network error — please try again.'); });
  }, [token]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div className="auth-card" style={{ maxWidth: 400, textAlign: 'center', padding: 40 }}>
        {status === 'loading' && (
          <>
            <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
            <h2>Verifying your email…</h2>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 16 }} />
            <h2>Email Verified! 🎉</h2>
            <p className="text-muted">{message}</p>
            <Link to="/dashboard" className="btn btn-primary" style={{ display: 'inline-block', marginTop: 16 }}>
              Go to Dashboard
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={48} style={{ color: 'var(--danger)', marginBottom: 16 }} />
            <h2>Verification Failed</h2>
            <p className="text-muted">{message}</p>
            <Link to="/dashboard" className="btn" style={{ display: 'inline-block', marginTop: 16 }}>
              Back to Dashboard
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
