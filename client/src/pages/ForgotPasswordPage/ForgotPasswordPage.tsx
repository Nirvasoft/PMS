import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRequestPasswordResetMutation } from '../../store/api/authApi';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import ThemeToggle from '../../components/ThemeToggle';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [requestReset, { isLoading }] = useRequestPasswordResetMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestReset({ email }).unwrap();
    setSent(true);
  };

  return (
    <div className="auth-page">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo"><Mail size={40} strokeWidth={1.5} /></div>
          <h1>Reset Password</h1>
          <p className="auth-subtitle">
            {sent ? 'Check your email' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {sent ? (
          <div className="success-state">
            <CheckCircle size={48} className="text-success" />
            <p>If an account exists with <strong>{email}</strong>, we've sent a password reset link.</p>
            <p className="text-muted text-small">The link expires in 1 hour.</p>
          </div>
        ) : (
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
                  placeholder="you@company.com"
                  required
                  autoFocus
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
              {isLoading ? <><Loader2 size={18} className="spin" /> Sending...</> : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link to="/login" className="link-subtle"><ArrowLeft size={14} /> Back to login</Link>
        </div>
      </div>
    </div>
  );
}
