import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../store';
import { setCredentials } from '../../store/slices/authSlice';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import ThemeToggle from '../../components/ThemeToggle';
import { getDefaultRoute } from '../../utils/defaultRoute';

/**
 * SSO Complete Page — handles the IdP redirect callback.
 *
 * The backend redirects to: /sso/complete#token={accessToken}&new={isNewUser}
 * This page extracts the token, decodes it, stores auth state, and redirects to dashboard.
 */
export default function SsoCompletePage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');

  useEffect(() => {
    const processToken = async () => {
      try {
        // Extract token from URL hash fragment: #token=xxx&new=true
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('token');
        const isNewUser = params.get('new') === 'true';

        if (!accessToken) {
          setError('No authentication token received from identity provider.');
          setStatus('error');
          return;
        }

        // Decode the JWT payload (not verification — just reading claims)
        const payloadBase64 = accessToken.split('.')[1];
        if (!payloadBase64) {
          setError('Invalid token format received.');
          setStatus('error');
          return;
        }

        const payload = JSON.parse(atob(payloadBase64));
        const roles: string[] = payload.roles || [];
        const permissions: string[] = payload.permissions || [];

        // Store credentials in Redux
        dispatch(setCredentials({
          user: {
            id: payload.sub,
            email: payload.email,
            companyId: payload.companyId,
            roles,
            permissions,
            mustChangePassword: false,
          },
          accessToken,
          expiresIn: payload.exp ? (payload.exp - Math.floor(Date.now() / 1000)) : 900,
        }));

        // Clean the URL hash (security — don't leave tokens in browser history)
        window.history.replaceState(null, '', '/sso/complete');

        setStatus('success');

        // Short delay to show success, then redirect
        setTimeout(() => {
          navigate(isNewUser ? '/settings/profile' : getDefaultRoute(permissions, roles), { replace: true });
        }, 1500);
      } catch (err) {
        console.error('SSO token processing failed:', err);
        setError('Failed to process authentication response. Please try logging in again.');
        setStatus('error');
      }
    };

    processToken();
  }, [dispatch, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          {status === 'processing' && (
            <>
              <Loader2 size={48} className="spin" style={{ color: 'var(--primary)', marginBottom: 16 }} />
              <h1>Completing Sign In</h1>
              <p className="auth-subtitle">Verifying your identity provider credentials...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 16 }} />
              <h1>Welcome!</h1>
              <p className="auth-subtitle">Sign in successful. Redirecting to your dashboard...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: 16 }} />
              <h1>Sign In Failed</h1>
              <div className="alert alert-error" style={{ marginTop: 16 }}>
                <AlertTriangle size={16} /> {error}
              </div>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/login', { replace: true })}
                style={{ marginTop: 20 }}
              >
                Back to Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
