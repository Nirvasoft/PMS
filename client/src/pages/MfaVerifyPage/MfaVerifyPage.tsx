import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVerifyMfaMutation } from '../../store/api/authApi';
import { useAppSelector } from '../../store';
import { ShieldCheck, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '../../components/ThemeToggle';
import { getDefaultRoute } from '../../utils/defaultRoute';

export default function MfaVerifyPage() {
  const navigate = useNavigate();
  const { mfaToken, mfaPending } = useAppSelector((s) => s.auth);
  const [verifyMfa, { isLoading }] = useVerifyMfaMutation();
  const [code, setCode] = useState<string[]>(Array(6).fill(''));
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!mfaPending || !mfaToken) {
      navigate('/login');
    }
  }, [mfaPending, mfaToken, navigate]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5 && newCode.every((d) => d)) {
      handleSubmit(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < text.length; i++) {
      newCode[i] = text[i];
    }
    setCode(newCode);
    if (text.length === 6) handleSubmit(text);
  };

  const handleSubmit = async (codeStr?: string) => {
    const finalCode = codeStr || (useBackup ? backupCode : code.join(''));
    if (!finalCode || !mfaToken) return;

    try {
      const result = await verifyMfa({ mfaToken, code: finalCode }).unwrap();
      toast.success('Authentication successful!');
      navigate(getDefaultRoute(result.data.user.permissions ?? [], result.data.user.roles ?? []));
    } catch {
      setError('Invalid or expired code. Please try again.');
      setCode(Array(6).fill(''));
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <ShieldCheck size={40} strokeWidth={1.5} />
          </div>
          <h1>Two-Factor Authentication</h1>
          <p className="auth-subtitle">
            {useBackup
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!useBackup ? (
          <div className="totp-input-group" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="totp-input"
                autoComplete="one-time-code"
              />
            ))}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <div className="form-group">
              <label htmlFor="backupCode">Backup Code</label>
              <input
                id="backupCode"
                type="text"
                value={backupCode}
                onChange={(e) => { setBackupCode(e.target.value); setError(''); }}
                placeholder="XXXX-XXXX"
                className="input-full"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={isLoading || !backupCode}>
              {isLoading ? <><Loader2 size={18} className="spin" /> Verifying...</> : 'Verify'}
            </button>
          </form>
        )}

        <div className="auth-links">
          <button className="link-subtle" onClick={() => { setUseBackup(!useBackup); setError(''); }}>
            {useBackup ? 'Use authenticator app' : 'Use a backup code instead'}
          </button>
        </div>

        <div className="auth-links">
          <button className="link-subtle" onClick={() => navigate('/login')}>
            <ArrowLeft size={14} /> Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
