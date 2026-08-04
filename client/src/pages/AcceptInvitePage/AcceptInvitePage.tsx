import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAcceptInvitationMutation } from '../../store/api/usersApi';
import { UserPlus, ArrowLeft, Loader2, Eye, EyeOff, AlertTriangle, CheckCircle, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '../../components/ThemeToggle';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [acceptInvitation, { isLoading }] = useAcceptInvitationMutation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await acceptInvitation({ token, firstName, lastName, password }).unwrap();
      setSuccess(true);
      toast.success('Account created successfully!');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: unknown) {
      const msg = (err as { data?: { errors?: Array<{ message: string }> } })?.data?.errors?.[0]?.message;
      setError(msg || 'Failed to accept invitation');
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-theme-toggle">
          <ThemeToggle />
        </div>
        <div className="auth-card">
          <div className="alert alert-error"><AlertTriangle size={18} /> Invalid or missing invitation link</div>
          <div className="auth-links"><Link to="/login" className="link-subtle"><ArrowLeft size={14} /> Go to login</Link></div>
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
          <div className="auth-logo"><UserPlus size={40} strokeWidth={1.5} /></div>
          <h1>Set Up Your Account</h1>
          <p className="auth-subtitle">Complete your profile to join the team</p>
        </div>

        {error && <div className="alert alert-error"><AlertTriangle size={18} /> {error}</div>}

        {success ? (
          <div className="success-state">
            <CheckCircle size={48} className="text-success" />
            <h3>Welcome Aboard!</h3>
            <p className="text-muted">Your account has been created. Redirecting to login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <div className="input-with-icon">
                  <User size={18} className="input-icon" />
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setError(''); }}
                    placeholder="First name"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <div className="input-with-icon">
                  <User size={18} className="input-icon" />
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setError(''); }}
                    placeholder="Last name"
                    required
                  />
                </div>
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
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Create a strong password"
                  required
                  minLength={8}
                />
                <button type="button" className="input-action" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrengthMeter password={password} />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  placeholder="Confirm your password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
              {isLoading ? <><Loader2 size={18} className="spin" /> Creating Account...</> : 'Create Account & Join'}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link to="/login" className="link-subtle"><ArrowLeft size={14} /> Already have an account? Sign in</Link>
        </div>
      </div>
    </div>
  );
}
