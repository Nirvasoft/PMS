import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useResetPasswordMutation } from '../../store/api/authApi';
import { Lock, ArrowLeft, Loader2, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '../../components/ThemeToggle';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [resetPassword, { isLoading }] = useResetPasswordMutation();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await resetPassword({ token, newPassword, confirmPassword }).unwrap();
      setSuccess(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: unknown) {
      const msg = (err as { data?: { errors?: Array<{ message: string }> } })?.data?.errors?.[0]?.message;
      setError(msg || 'Failed to reset password');
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-theme-toggle">
          <ThemeToggle />
        </div>
        <div className="auth-card">
          <div className="alert alert-error"><AlertTriangle size={18} /> Invalid or missing reset token</div>
          <div className="auth-links"><Link to="/login" className="link-subtle"><ArrowLeft size={14} /> Back to login</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo"><Lock size={40} strokeWidth={1.5} /></div>
          <h1>Set New Password</h1>
          <p className="auth-subtitle">Choose a strong password for your account</p>
        </div>

        {error && <div className="alert alert-error"><AlertTriangle size={18} /> {error}</div>}

        {success ? (
          <div className="success-state">
            <CheckCircle size={48} className="text-success" />
            <p>Your password has been reset. Redirecting to login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input id="newPassword" type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} placeholder="Enter new password" required minLength={8} />
                <button type="button" className="input-action" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input id="confirmPassword" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }} placeholder="Confirm new password" required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
              {isLoading ? <><Loader2 size={18} className="spin" /> Resetting...</> : 'Reset Password'}
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
