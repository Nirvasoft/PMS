import { useState } from 'react';
import {
  useGetDevicesQuery, useRevokeDeviceMutation, useGetAuditLogsQuery, useChangePasswordMutation,
  useSetupMfaMutation, useEnableMfaMutation, useDisableMfaMutation,
  useGetIpPoliciesQuery, useCreateIpPolicyMutation, useDeleteIpPolicyMutation,
  useGetPasswordPolicyQuery, useUpdatePasswordPolicyMutation,
  useGetMeQuery,
} from '../../store/api/authApi';
import { useAppSelector } from '../../store';
import { Shield, Smartphone, Monitor, Clock, Trash2, Lock, AlertTriangle, Loader2, CheckCircle, Key, Globe, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';
import { useConfirm } from '../../components/DialogProvider';

type TabId = 'password' | 'mfa' | 'devices' | 'audit' | 'ip-policy' | 'pw-policy';

export default function SecuritySettingsPage() {
  const mustChangePassword = useAppSelector((s) => s.auth.user?.mustChangePassword);
  const [activeTab, setActiveTab] = useState<TabId>('password');

  // Force password tab when mustChangePassword is true
  const effectiveTab = mustChangePassword ? 'password' : activeTab;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Shield size={24} /> Security Settings</h1>
        <p className="text-muted">Manage your account security, MFA, and policies</p>
      </div>

      {mustChangePassword && (
        <div className="alert alert-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} />
          <span><strong>Password change required.</strong> You must change your password before you can continue using the system.</span>
        </div>
      )}

      <div className="tabs" style={{ flexWrap: 'wrap' }}>
        <button className={`tab ${effectiveTab === 'password' ? 'active' : ''}`} onClick={() => setActiveTab('password')}>
          <Lock size={16} /> Password
        </button>
        <button className={`tab ${effectiveTab === 'mfa' ? 'active' : ''}`} onClick={() => !mustChangePassword && setActiveTab('mfa')} disabled={!!mustChangePassword}>
          <Key size={16} /> MFA
        </button>
        <button className={`tab ${effectiveTab === 'devices' ? 'active' : ''}`} onClick={() => !mustChangePassword && setActiveTab('devices')} disabled={!!mustChangePassword}>
          <Smartphone size={16} /> Devices
        </button>
        <button className={`tab ${effectiveTab === 'audit' ? 'active' : ''}`} onClick={() => !mustChangePassword && setActiveTab('audit')} disabled={!!mustChangePassword}>
          <Clock size={16} /> Audit Log
        </button>
        <button className={`tab ${effectiveTab === 'ip-policy' ? 'active' : ''}`} onClick={() => !mustChangePassword && setActiveTab('ip-policy')} disabled={!!mustChangePassword}>
          <Globe size={16} /> IP Policy
        </button>
        <button className={`tab ${effectiveTab === 'pw-policy' ? 'active' : ''}`} onClick={() => !mustChangePassword && setActiveTab('pw-policy')} disabled={!!mustChangePassword}>
          <ShieldCheck size={16} /> Password Policy
        </button>
      </div>

      <div className="tab-content">
        {effectiveTab === 'password' && <ChangePasswordSection />}
        {effectiveTab === 'mfa' && <MfaSetupSection />}
        {effectiveTab === 'devices' && <DevicesSection />}
        {effectiveTab === 'audit' && <AuditLogSection />}
        {effectiveTab === 'ip-policy' && <IpPolicySection />}
        {effectiveTab === 'pw-policy' && <PasswordPolicySection />}
      </div>
    </div>
  );
}

function ChangePasswordSection() {
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword }).unwrap();
      toast.success('Password changed! Please sign in again.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      // Force re-login — backend has already cleared the refresh token cookie
      // and set mustChangePassword = false on the user record
      window.location.href = '/login';
    } catch (err: unknown) {
      const msg = (err as { data?: { errors?: Array<{ message: string }> } })?.data?.errors?.[0]?.message;
      setError(msg || 'Failed to change password');
    }
  };

  return (
    <div className="settings-section">
      <h2>Change Password</h2>
      {error && <div className="alert alert-error"><AlertTriangle size={16} /> {error}</div>}
      <form onSubmit={handleSubmit} className="settings-form">
        <div className="form-group">
          <label>Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }} required />
        </div>
        <div className="form-group">
          <label>New Password</label>
          <input type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} required minLength={8} />
          <PasswordStrengthMeter password={newPassword} />
        </div>
        <div className="form-group">
          <label>Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }} required />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? <><Loader2 size={16} className="spin" /> Changing...</> : 'Change Password'}
        </button>
      </form>
    </div>
  );
}

function DevicesSection() {
  const { data, isLoading } = useGetDevicesQuery();
  const [revokeDevice] = useRevokeDeviceMutation();
  const devices = data?.data || [];
  const confirmDialog = useConfirm();

  const handleRevoke = async (id: string) => {
    if (await confirmDialog('Revoke this device? It will be signed out.', { danger: true, confirmText: 'Revoke' })) {
      await revokeDevice(id);
      toast.success('Device revoked');
    }
  };

  if (isLoading) return <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading devices...</div>;

  return (
    <div className="settings-section">
      <h2>Active Devices</h2>
      {devices.length === 0 ? (
        <p className="text-muted">No registered devices</p>
      ) : (
        <div className="device-list">
          {devices.map((d: Record<string, unknown>) => (
            <div key={d.id as string} className="device-card">
              <div className="device-icon">
                {(d.deviceType as string) === 'mobile' ? <Smartphone size={24} /> : <Monitor size={24} />}
              </div>
              <div className="device-info">
                <span className="device-name">{d.deviceName as string || 'Unknown Device'}</span>
                <span className="device-meta">
                  {d.os as string} · {d.browser as string} · Last seen {d.lastSeenAt ? new Date(d.lastSeenAt as string).toLocaleDateString() : 'Never'}
                </span>
              </div>
              <button className="btn-icon btn-danger" onClick={() => handleRevoke(d.id as string)} title="Revoke">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditLogSection() {
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const params: Record<string, string> = { page: String(page), limit: '15' };
  if (eventType) params.eventType = eventType;
  if (status) params.status = status;
  if (dateFrom) params.from = new Date(dateFrom).toISOString();
  if (dateTo) params.to = new Date(dateTo + 'T23:59:59').toISOString();

  const { data, isLoading, isFetching } = useGetAuditLogsQuery(params);
  const logs = data?.data || [];
  const meta = data?.meta || { total: 0, totalPages: 0, page: 1 };

  const hasFilters = eventType || status || dateFrom || dateTo;
  const clearFilters = () => {
    setEventType('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  const EVENT_TYPES = [
    { value: 'login_success', label: 'Login Success' },
    { value: 'login_failure', label: 'Login Failure' },
    { value: 'logout', label: 'Logout' },
    { value: 'token_refresh', label: 'Token Refresh' },
    { value: 'mfa_enabled', label: 'MFA Enabled' },
    { value: 'mfa_disabled', label: 'MFA Disabled' },
    { value: 'mfa_verify_success', label: 'MFA Verify Success' },
    { value: 'mfa_verify_failure', label: 'MFA Verify Failure' },
    { value: 'password_change', label: 'Password Change' },
    { value: 'password_reset_request', label: 'Password Reset Request' },
    { value: 'password_reset_complete', label: 'Password Reset Complete' },
    { value: 'account_locked', label: 'Account Locked' },
    { value: 'account_unlocked', label: 'Account Unlocked' },
    { value: 'device_trusted', label: 'Device Trusted' },
    { value: 'device_revoked', label: 'Device Revoked' },
    { value: 'sso_login', label: 'SSO Login' },
    { value: 'ip_blocked', label: 'IP Blocked' },
    { value: 'token_reuse', label: 'Token Reuse' },
  ];

  return (
    <div className="settings-section">
      <h2>Authentication Audit Log</h2>

      {/* Filters */}
      <div className="audit-filters">
        <div className="audit-filter-row">
          <div className="form-group compact">
            <label>Event Type</label>
            <select value={eventType} onChange={handleFilterChange(setEventType)}>
              <option value="">All Events</option>
              {EVENT_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className="form-group compact">
            <label>Status</label>
            <select value={status} onChange={handleFilterChange(setStatus)}>
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </div>
          <div className="form-group compact">
            <label>From</label>
            <input type="date" value={dateFrom} onChange={handleFilterChange(setDateFrom)} max={dateTo || undefined} />
          </div>
          <div className="form-group compact">
            <label>To</label>
            <input type="date" value={dateTo} onChange={handleFilterChange(setDateTo)} min={dateFrom || undefined} />
          </div>
          {hasFilters && (
            <button className="btn btn-sm btn-outline" onClick={clearFilters} style={{ alignSelf: 'flex-end', marginBottom: 4 }}>
              Clear
            </button>
          )}
        </div>
        <div className="text-small text-muted" style={{ marginTop: 4 }}>
          {isFetching ? 'Loading...' : `${meta.total ?? logs.length} event${(meta.total ?? logs.length) === 1 ? '' : 's'} found`}
        </div>
      </div>

      {isLoading ? (
        <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading audit logs...</div>
      ) : logs.length === 0 ? (
        <p className="text-muted">{hasFilters ? 'No events match your filters' : 'No audit logs found'}</p>
      ) : (
        <>
          <div className="audit-table-container">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>IP Address</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: Record<string, unknown>) => (
                  <tr key={log.id as string}>
                    <td>
                      <span className={`event-badge ${log.eventType as string}`}>
                        {(log.eventType as string).replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {log.status === 'success'
                        ? <span className="status-success"><CheckCircle size={14} /> Success</span>
                        : <span className="status-failure"><AlertTriangle size={14} /> Failure</span>}
                    </td>
                    <td className="text-mono">{log.ipAddress as string || '—'}</td>
                    <td>{new Date(log.createdAt as string).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta.totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-sm">Previous</button>
              <span className="text-muted">Page {meta.page} of {meta.totalPages}</span>
              <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)} className="btn btn-sm">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MfaSetupSection() {
  const { data: meData } = useGetMeQuery();
  const mfaEnabled = meData?.data?.mfaEnabled ?? false;
  const [setupMfa] = useSetupMfaMutation();
  const [enableMfa, { isLoading: enabling }] = useEnableMfaMutation();
  const [disableMfa, { isLoading: disabling }] = useDisableMfaMutation();

  const [wizardStep, setWizardStep] = useState(0); // 0=idle, 1=scan, 2=verify, 3=backup, 4=done
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  const handleStart = async () => {
    try {
      const res = await setupMfa().unwrap();
      setSetupData(res.data);
      setWizardStep(1);
    } catch { toast.error('Failed to generate MFA secret'); }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData) return;
    setVerifyError('');
    try {
      await enableMfa({ secret: setupData.secret, code, backupCodes: setupData.backupCodes }).unwrap();
      setWizardStep(3);
    } catch {
      setVerifyError('Invalid code. Please check your authenticator app and try again.');
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await disableMfa({ code: disableCode }).unwrap();
      toast.success('MFA has been disabled.');
      setDisableCode('');
    } catch { toast.error('Invalid code.'); }
  };

  const copyToClipboard = (text: string, type: 'secret' | 'backup') => {
    navigator.clipboard.writeText(text);
    if (type === 'secret') { setCopiedSecret(true); setTimeout(() => setCopiedSecret(false), 2000); }
    else { setCopiedBackup(true); setTimeout(() => setCopiedBackup(false), 2000); }
  };

  const downloadBackupCodes = () => {
    if (!setupData) return;
    const content = `PMS Backup Codes\nGenerated: ${new Date().toLocaleString()}\n${'─'.repeat(30)}\n${setupData.backupCodes.join('\n')}\n\n⚠ Each code can only be used once.\n   Store this file securely.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pms-mfa-backup-codes.txt';
    a.click();
  };

  const STEPS = ['Scan QR Code', 'Verify Code', 'Save Backup Codes'];

  // ── MFA Already Enabled ──
  if (mfaEnabled && wizardStep < 3) {
    return (
      <div className="settings-section">
        <h2><Key size={20} /> Two-Factor Authentication</h2>
        <div className="info-card" style={{ borderLeft: '4px solid var(--success)', marginBottom: 16 }}>
          <p><CheckCircle size={16} style={{ color: 'var(--success)' }} /> <strong>MFA is enabled</strong> — your account is protected with TOTP-based two-factor authentication.</p>
        </div>
        <form onSubmit={handleDisable} className="settings-form">
          <p className="text-muted">To disable MFA, enter a current authenticator code:</p>
          <div className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input type="text" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="6-digit code" maxLength={6} required style={{ maxWidth: 180 }} />
            <button type="submit" className="btn btn-danger" disabled={disabling}>{disabling ? 'Disabling...' : 'Disable MFA'}</button>
          </div>
        </form>
      </div>
    );
  }

  // ── Idle State (Not started) ──
  if (wizardStep === 0) {
    return (
      <div className="settings-section">
        <h2><Key size={20} /> Two-Factor Authentication</h2>
        <p className="text-muted">Add an extra layer of security with TOTP-based two-factor authentication using Google Authenticator, Authy, or similar apps.</p>
        <div className="mfa-benefits">
          <div className="mfa-benefit-item"><ShieldCheck size={16} /> Protects against password theft</div>
          <div className="mfa-benefit-item"><Smartphone size={16} /> Works with any TOTP authenticator app</div>
          <div className="mfa-benefit-item"><Key size={16} /> Backup codes for account recovery</div>
        </div>
        <button className="btn btn-primary" onClick={handleStart} style={{ marginTop: 16 }}>🔐 Set Up MFA</button>
      </div>
    );
  }

  // ── Wizard Steps ──
  return (
    <div className="settings-section">
      <h2><Key size={20} /> Set Up Two-Factor Authentication</h2>

      {/* Stepper */}
      <div className="mfa-stepper">
        {STEPS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = wizardStep === stepNum;
          const isComplete = wizardStep > stepNum;
          return (
            <div key={label} className={`mfa-step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}>
              <div className="mfa-step-circle">
                {isComplete ? <CheckCircle size={16} /> : stepNum}
              </div>
              <span className="mfa-step-label">{label}</span>
              {i < STEPS.length - 1 && <div className="mfa-step-line" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Scan QR Code */}
      {wizardStep === 1 && setupData && (
        <div className="mfa-wizard-panel">
          <div className="mfa-qr-section">
            <p className="text-muted" style={{ marginBottom: 12 }}>
              Open your authenticator app and scan this QR code:
            </p>
            <div className="mfa-qr-wrapper">
              <img src={setupData.qrCodeDataUrl} alt="MFA QR Code" width={200} height={200} />
            </div>
            <div className="mfa-manual-entry">
              <p className="text-small text-muted">Can't scan? Enter this code manually:</p>
              <div className="mfa-secret-row">
                <code className="mfa-secret-code">{setupData.secret}</code>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => copyToClipboard(setupData.secret, 'secret')}
                >
                  {copiedSecret ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <div className="mfa-wizard-actions">
            <button className="btn btn-outline" onClick={() => { setWizardStep(0); setSetupData(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={() => setWizardStep(2)}>Next: Verify Code →</button>
          </div>
        </div>
      )}

      {/* Step 2: Enter Verification Code */}
      {wizardStep === 2 && (
        <div className="mfa-wizard-panel">
          <p className="text-muted" style={{ marginBottom: 16 }}>
            Enter the 6-digit code shown in your authenticator app to verify the setup:
          </p>
          <form onSubmit={handleVerify}>
            <div className="mfa-code-input-wrapper">
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(v);
                  setVerifyError('');
                }}
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
                className="mfa-code-input"
              />
            </div>
            {verifyError && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                <AlertTriangle size={14} /> {verifyError}
              </div>
            )}
            <div className="mfa-wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setWizardStep(1)}>← Back</button>
              <button type="submit" className="btn btn-primary" disabled={enabling || code.length < 6}>
                {enabling ? <><Loader2 size={16} className="spin" /> Verifying...</> : 'Verify & Enable'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 3: Save Backup Codes */}
      {wizardStep === 3 && setupData && (
        <div className="mfa-wizard-panel">
          <div className="info-card" style={{ borderLeft: '4px solid var(--success)', marginBottom: 16 }}>
            <p><CheckCircle size={16} style={{ color: 'var(--success)' }} /> <strong>MFA is now active!</strong> Save your backup codes below.</p>
          </div>
          <p className="text-muted" style={{ marginBottom: 12 }}>
            If you lose access to your authenticator app, you can use these one-time codes to sign in. Each code can only be used once.
          </p>
          <div className="mfa-backup-grid">
            {setupData.backupCodes.map((c, i) => (
              <div key={i} className="mfa-backup-code">{c}</div>
            ))}
          </div>
          <div className="mfa-backup-actions">
            <button
              className="btn btn-sm btn-outline"
              onClick={() => copyToClipboard(setupData.backupCodes.join('\n'), 'backup')}
            >
              {copiedBackup ? '✓ Copied!' : '📋 Copy All'}
            </button>
            <button className="btn btn-sm btn-outline" onClick={downloadBackupCodes}>
              📥 Download .txt
            </button>
          </div>
          <div className="alert" style={{ marginTop: 16, padding: 10, background: 'color-mix(in srgb, var(--warning) 10%, transparent)', borderRadius: 8, fontSize: 13 }}>
            <AlertTriangle size={14} style={{ color: 'var(--warning)', marginRight: 6 }} />
            Store these codes in a safe place. You won't be able to see them again.
          </div>
          <div className="mfa-wizard-actions">
            <button className="btn btn-primary" onClick={() => setWizardStep(4)}>Done</button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {wizardStep === 4 && (
        <div className="mfa-wizard-panel" style={{ textAlign: 'center', padding: '32px 0' }}>
          <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 12 }} />
          <h3>Two-Factor Authentication Enabled</h3>
          <p className="text-muted">You'll be asked for a TOTP code on your next login.</p>
        </div>
      )}
    </div>
  );
}

/* ─── IP Policy ───────────────────────────── */

function IpPolicySection() {
  const { data, isLoading } = useGetIpPoliciesQuery();
  const [createPolicy] = useCreateIpPolicyMutation();
  const [deletePolicy] = useDeleteIpPolicyMutation();
  const policies = data?.data || [];
  const [form, setForm] = useState({ ipAddress: '', type: 'allow', description: '' });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPolicy(form).unwrap();
      toast.success('IP policy added');
      setForm({ ipAddress: '', type: 'allow', description: '' });
    } catch { toast.error('Failed to add policy'); }
  };

  if (isLoading) return <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading...</div>;

  return (
    <div className="settings-section">
      <h2><Globe size={20} /> IP Access Policy</h2>
      <p className="text-muted" style={{ marginBottom: 16 }}>Control which IP addresses can access the system.</p>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <input className="input-full" style={{ maxWidth: 200 }} required value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="e.g. 192.168.1.0/24" />
        <select className="input-full" style={{ maxWidth: 120 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="allow">Allow</option>
          <option value="block">Block</option>
        </select>
        <input className="input-full" style={{ maxWidth: 200 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" />
        <button type="submit" className="btn btn-primary">Add Rule</button>
      </form>
      {policies.length === 0 ? (
        <p className="text-muted">No IP policies configured. All IPs are allowed.</p>
      ) : (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead><tr><th>IP / CIDR</th><th>Type</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              {policies.map((p: Record<string, unknown>) => (
                <tr key={p.id as string}>
                  <td className="text-mono">{p.ipAddress as string}</td>
                  <td><span className={`status-badge ${p.type === 'allow' ? 'active' : 'danger'}`}>{p.type as string}</span></td>
                  <td>{p.description as string || '—'}</td>
                  <td><button className="btn-icon btn-danger" onClick={async () => { await deletePolicy(p.id as string).unwrap(); toast.success('Removed'); }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Password Policy ─────────────────────── */

function PasswordPolicySection() {
  const { data, isLoading } = useGetPasswordPolicyQuery();
  const [updatePolicy, { isLoading: saving }] = useUpdatePasswordPolicyMutation();
  const policy = data?.data;
  const [form, setForm] = useState({
    minLength: 8, requireUppercase: true, requireLowercase: true,
    requireNumbers: true, requireSpecial: true, maxAgeDays: 90,
    preventReuse: 5, lockoutThreshold: 5, lockoutDurationMinutes: 30,
  });
  const [loaded, setLoaded] = useState(false);

  if (!loaded && policy) {
    setForm({
      minLength: (policy.minLength as number) ?? 8,
      requireUppercase: (policy.requireUppercase as boolean) ?? true,
      requireLowercase: (policy.requireLowercase as boolean) ?? true,
      requireNumbers: (policy.requireNumbers as boolean) ?? true,
      requireSpecial: (policy.requireSpecial as boolean) ?? true,
      maxAgeDays: (policy.maxAgeDays as number) ?? 90,
      preventReuse: (policy.preventReuse as number) ?? 5,
      lockoutThreshold: (policy.lockoutThreshold as number) ?? 5,
      lockoutDurationMinutes: (policy.lockoutDurationMinutes as number) ?? 30,
    });
    setLoaded(true);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await updatePolicy(form).unwrap(); toast.success('Password policy updated'); }
    catch { toast.error('Failed to save'); }
  };

  if (isLoading) return <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading...</div>;

  return (
    <div className="settings-section">
      <h2><ShieldCheck size={20} /> Password Policy</h2>
      <form onSubmit={handleSave} className="settings-form">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          <div className="form-group">
            <label>Minimum Length</label>
            <input type="number" min={6} max={128} value={form.minLength} onChange={(e) => setForm({ ...form, minLength: +e.target.value })} />
          </div>
          <div className="form-group">
            <label>Max Age (days, 0=never)</label>
            <input type="number" min={0} value={form.maxAgeDays} onChange={(e) => setForm({ ...form, maxAgeDays: +e.target.value })} />
          </div>
          <div className="form-group">
            <label>Prevent Reuse (last N)</label>
            <input type="number" min={0} value={form.preventReuse} onChange={(e) => setForm({ ...form, preventReuse: +e.target.value })} />
          </div>
          <div className="form-group">
            <label>Lockout After (fails)</label>
            <input type="number" min={1} value={form.lockoutThreshold} onChange={(e) => setForm({ ...form, lockoutThreshold: +e.target.value })} />
          </div>
          <div className="form-group">
            <label>Lockout Duration (min)</label>
            <input type="number" min={1} value={form.lockoutDurationMinutes} onChange={(e) => setForm({ ...form, lockoutDurationMinutes: +e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0' }}>
          {([['requireUppercase', 'Uppercase'], ['requireLowercase', 'Lowercase'], ['requireNumbers', 'Numbers'], ['requireSpecial', 'Special chars']] as const).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /> Require {label}
            </label>
          ))}
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Policy'}</button>
      </form>
    </div>
  );
}
