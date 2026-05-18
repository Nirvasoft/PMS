import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLoginMutation } from '../../store/api/authApi';
import { useAppSelector } from '../../store';
import { Eye, EyeOff, Building2, Lock, Mail, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '../../components/ThemeToggle';

export default function LoginPage() {
  const navigate = useNavigate();
  const [login, { isLoading, error }] = useLoginMutation();
  const { mfaPending } = useAppSelector((s) => s.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password, rememberMe }).unwrap();
      // If MFA is required, redirect happens via useEffect below
      if (!mfaPending) {
        toast.success('Welcome back!');
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: Array<{ message: string; code: string; meta?: { unlockAt: string } }> } };
      const errData = apiErr?.data?.errors?.[0];
      if (errData?.code === 'ACCOUNT_LOCKED') {
        toast.error(errData.message);
      }
    }
  };

  // Redirect to MFA page if needed
  if (mfaPending) {
    navigate('/login/mfa');
    return null;
  }

  const apiError = (error as { data?: { errors?: Array<{ message: string }> } })?.data?.errors?.[0]?.message;

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
          <p className="auth-subtitle">Sign in to your account</p>
        </div>

        {apiError && (
          <div className="alert alert-error">
            <AlertTriangle size={18} />
            <span>{apiError}</span>
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

          <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={18} className="spin" /> Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p className="text-muted">Demo credentials</p>
          <p className="text-small text-muted">admin@acmeproperty.com / Admin@123</p>
        </div>
      </div>
    </div>
  );
}
