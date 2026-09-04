import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useLoginMutation, useLazyValidateCompanyCodeQuery, useGetCompanyInfoQuery, useLazyGetSsoProvidersQuery } from '../../store/api/authApi';
import { useAppSelector } from '../../store';
import { Eye, EyeOff, Building2, Lock, Mail, AlertTriangle, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '../../components/ThemeToggle';
import { getDefaultRoute } from '../../utils/defaultRoute';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [login, { isLoading, error }] = useLoginMutation();
  const [validateCode] = useLazyValidateCompanyCodeQuery();
  const [fetchSsoProviders] = useLazyGetSsoProvidersQuery();
  const { data: companyInfo, isLoading: loadingCompanyInfo, isError: companyInfoError } = useGetCompanyInfoQuery();
  const { mfaPending } = useAppSelector((s) => s.auth);

  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyValid, setCompanyValid] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<{ id: string; name: string; provider: string; companyId: string }[]>([]);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
  const [lockoutDisplay, setLockoutDisplay] = useState('');
  const ssoError = searchParams.get('sso_error');

  // Derive whether company code input should be shown
  // Hide company code while loading, on API error, or when only 1 company exists
  const isSingleCompany = loadingCompanyInfo || companyInfoError || !companyInfo || companyInfo?.data?.count === 1;
  const singleCompany = companyInfo?.data?.singleCompany;

  // Auto-fill company code when only one company exists
  useEffect(() => {
    if (isSingleCompany && singleCompany) {
      setCompanyCode(singleCompany.code);
      setCompanyName(singleCompany.name);
      setCompanyValid(true);
      // Fetch SSO providers for single company
      fetchSsoProviders(singleCompany.code).unwrap()
        .then(res => setSsoProviders(res.data || []))
        .catch(() => {});
    }
  }, [isSingleCompany, singleCompany, fetchSsoProviders]);

  // Validate company code as user types (only when multiple companies)
  const handleCompanyCodeChange = useCallback(async (value: string) => {
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setCompanyCode(code);
    setCompanyName(null);
    setCompanyValid(null);
    setSsoProviders([]);

    if (code.length >= 2) {
      try {
        const result = await validateCode(code).unwrap();
        if (result.data) {
          setCompanyName(result.data.name);
          setCompanyValid(true);
          // Fetch SSO providers when company is valid
          const ssoResult = await fetchSsoProviders(code).unwrap();
          setSsoProviders(ssoResult.data || []);
        } else {
          setCompanyValid(false);
        }
      } catch {
        setCompanyValid(false);
      }
    }
  }, [validateCode, fetchSsoProviders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login({ companyCode, email, password, rememberMe }).unwrap();
      if (!mfaPending) {
        toast.success('Welcome back!');
        const user = 'user' in result.data ? result.data.user : undefined;
        navigate(getDefaultRoute(user?.permissions ?? [], user?.roles ?? []));
      }
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: Array<{ message: string; code: string; meta?: { unlockAt: string } }> } };
      const errData = apiErr?.data?.errors?.[0];
      if (errData?.code === 'ACCOUNT_LOCKED' && errData.meta?.unlockAt) {
        setLockoutUntil(new Date(errData.meta.unlockAt));
      }
    }
  };

  // Live countdown timer for account lockout
  useEffect(() => {
    if (!lockoutUntil) {
      setLockoutDisplay('');
      return;
    }

    const tick = () => {
      const remaining = lockoutUntil.getTime() - Date.now();
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLockoutDisplay('');
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setLockoutDisplay(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Redirect to MFA page if needed
  if (mfaPending) {
    navigate('/login/mfa');
    return null;
  }

  const apiError = (error as { data?: { errors?: Array<{ message: string }> } })?.data?.errors?.[0]?.message;
  const isLockedOut = !!lockoutUntil;
  const canSubmit = isLoading || isLockedOut ? false : isSingleCompany ? true : companyValid === true;

  return (
    <div className="auth-page">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <Building2 size={40} strokeWidth={1.5} />
          </div>
          <h1>Property Management System</h1>
          <p className="auth-subtitle">
            {isSingleCompany && singleCompany
              ? singleCompany.name
              : 'Sign in to your account'}
          </p>
        </div>

        {apiError && !isLockedOut && (
          <div className="alert alert-error">
            <AlertTriangle size={18} />
            <span>{apiError}</span>
          </div>
        )}

        {isLockedOut && (
          <div className="lockout-banner">
            <div className="lockout-icon">
              <Lock size={24} />
            </div>
            <div className="lockout-info">
              <strong>Account Temporarily Locked</strong>
              <p>Too many failed login attempts. Please try again in:</p>
            </div>
            <div className="lockout-timer">{lockoutDisplay}</div>
          </div>
        )}

        {ssoError && (
          <div className="alert alert-error">
            <AlertTriangle size={18} />
            <span>SSO sign in failed: {decodeURIComponent(ssoError)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@acmeproperty.com"
                autoComplete="email"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Only show company code when multiple companies exist */}
          {!isSingleCompany && (
            <div className="form-group">
              <label htmlFor="companyCode">Company Code</label>
              <div className="input-with-icon">
                <Building2 size={18} className="input-icon" />
                <input
                  id="companyCode"
                  type="text"
                  value={companyCode}
                  onChange={(e) => handleCompanyCodeChange(e.target.value)}
                  placeholder="e.g. ACME"
                  autoComplete="organization"
                  required
                  maxLength={20}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                />
                {companyValid === true && (
                  <span className="input-action" style={{ color: 'var(--color-success)', pointerEvents: 'none' }}>
                    <CheckCircle2 size={18} />
                  </span>
                )}
                {companyValid === false && companyCode.length >= 2 && (
                  <span className="input-action" style={{ color: 'var(--color-danger)', pointerEvents: 'none' }}>
                    <XCircle size={18} />
                  </span>
                )}
              </div>
              {companyValid === true && companyName && (
                <span className="text-small" style={{ color: 'var(--color-success)', marginTop: '4px', display: 'block' }}>
                  {companyName}
                </span>
              )}
              {companyValid === false && companyCode.length >= 2 && (
                <span className="text-small" style={{ color: 'var(--color-danger)', marginTop: '4px', display: 'block' }}>
                  Company not found
                </span>
              )}
            </div>
          )}

          <div className="form-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
            <Link to="/forgot-password" className="link-subtle">
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
            {isLoading ? (
              <>
                <Loader2 size={18} className="spin" /> Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* SSO Sign-In Buttons */}
        {ssoProviders.length > 0 && (
          <div className="sso-section">
            <div className="sso-divider">
              <span>or sign in with</span>
            </div>
            <div className="sso-buttons">
              {ssoProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-outline btn-block sso-btn"
                  onClick={() => {
                    window.location.href = `/api/v1/auth/sso/initiate?provider=${encodeURIComponent(p.provider)}&companyId=${encodeURIComponent(p.companyId)}`;
                  }}
                >
                  <SsoProviderIcon provider={p.provider} />
                  {p.name}
                  <ExternalLink size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="auth-footer">
          <p className="text-muted">Demo credentials</p>
          <p className="text-small text-muted">
            {isSingleCompany
              ? 'admin@acmeproperty.com / Admin@123'
              : 'Company: ACME | admin@acmeproperty.com / Admin@123'}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Maps SSO provider types to branded icons/labels */
function SsoProviderIcon({ provider }: { provider: string }) {
  const icons: Record<string, string> = {
    azure_ad: '🔷',
    google: '🔴',
    okta: '🟡',
    oidc: '🔑',
  };
  return <span style={{ fontSize: 18, marginRight: 8 }}>{icons[provider] || '🔐'}</span>;
}
