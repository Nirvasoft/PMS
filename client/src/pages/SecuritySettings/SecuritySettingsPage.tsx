import { useState } from 'react';
import {
  useGetDevicesQuery, useRevokeDeviceMutation, useGetAuditLogsQuery, useChangePasswordMutation,
  useSetupMfaMutation, useEnableMfaMutation, useDisableMfaMutation,
  useGetIpPoliciesQuery, useCreateIpPolicyMutation, useDeleteIpPolicyMutation,
  useGetPasswordPolicyQuery, useUpdatePasswordPolicyMutation,
  useGetMeQuery,
} from '../../store/api/authApi';
import { Shield, Smartphone, Monitor, Clock, Trash2, Lock, AlertTriangle, Loader2, CheckCircle, Key, Globe, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

type TabId = 'password' | 'mfa' | 'devices' | 'audit' | 'ip-policy' | 'pw-policy';

export default function SecuritySettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('password');

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Shield size={24} /> Security Settings</h1>
        <p className="text-muted">Manage your account security, MFA, and policies</p>
      </div>

      <div className="tabs" style={{ flexWrap: 'wrap' }}>
        <button className={`tab ${activeTab === 'password' ? 'active' : ''}`} onClick={() => setActiveTab('password')}>
          <Lock size={16} /> Password
        </button>
        <button className={`tab ${activeTab === 'mfa' ? 'active' : ''}`} onClick={() => setActiveTab('mfa')}>
          <Key size={16} /> MFA
        </button>
        <button className={`tab ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')}>
          <Smartphone size={16} /> Devices
        </button>
        <button className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
          <Clock size={16} /> Audit Log
        </button>
        <button className={`tab ${activeTab === 'ip-policy' ? 'active' : ''}`} onClick={() => setActiveTab('ip-policy')}>
          <Globe size={16} /> IP Policy
        </button>
        <button className={`tab ${activeTab === 'pw-policy' ? 'active' : ''}`} onClick={() => setActiveTab('pw-policy')}>
          <ShieldCheck size={16} /> Password Policy
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'password' && <ChangePasswordSection />}
        {activeTab === 'mfa' && <MfaSetupSection />}
        {activeTab === 'devices' && <DevicesSection />}
        {activeTab === 'audit' && <AuditLogSection />}
        {activeTab === 'ip-policy' && <IpPolicySection />}
        {activeTab === 'pw-policy' && <PasswordPolicySection />}
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

  const handleRevoke = async (id: string) => {
    if (confirm('Revoke this device? It will be signed out.')) {
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
  const { data, isLoading } = useGetAuditLogsQuery({ page: String(page), limit: '15' });
  const logs = data?.data || [];
  const meta = data?.meta || { total: 0, totalPages: 0, page: 1 };

  if (isLoading) return <div className="loading-inline"><Loader2 size={20} className="spin" /> Loading audit logs...</div>;

  return (
    <div className="settings-section">
      <h2>Authentication Audit Log</h2>
      {logs.length === 0 ? (
        <p className="text-muted">No audit logs found</p>
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

/* ─── MFA Setup ───────────────────────────── */

function MfaSetupSection() {
  const { data: meData } = useGetMeQuery();
  const mfaEnabled = meData?.data?.mfaEnabled ?? false;
  const [setupMfa] = useSetupMfaMutation();
  const [enableMfa, { isLoading: enabling }] = useEnableMfaMutation();
  const [disableMfa, { isLoading: disabling }] = useDisableMfaMutation();

  const [step, setStep] = useState<'idle' | 'setup' | 'done'>('idle');
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const handleSetup = async () => {
    try {
      const res = await setupMfa().unwrap();
      setSetupData(res.data);
      setStep('setup');
    } catch { toast.error('Failed to generate MFA secret'); }
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData) return;
    try {
      await enableMfa({ secret: setupData.secret, code, backupCodes: setupData.backupCodes }).unwrap();
      toast.success('MFA enabled! Your account is now more secure.');
      setStep('done');
    } catch { toast.error('Invalid code. Please try again.'); }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await disableMfa({ code: disableCode }).unwrap();
      toast.success('MFA has been disabled.');
      setDisableCode('');
    } catch { toast.error('Invalid code.'); }
  };

  if (mfaEnabled && step !== 'done') {
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

  if (step === 'done') {
    return (
      <div className="settings-section">
        <h2><Key size={20} /> Two-Factor Authentication</h2>
        <div className="info-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <p><CheckCircle size={16} style={{ color: 'var(--success)' }} /> <strong>MFA is now active!</strong></p>
          <p className="text-muted text-small">You will be asked for a TOTP code on your next login.</p>
        </div>
      </div>
    );
  }

  if (step === 'setup' && setupData) {
    return (
      <div className="settings-section">
        <h2><Key size={20} /> Setup Two-Factor Authentication</h2>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <p className="text-muted">1. Scan this QR code with your authenticator app:</p>
            <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginTop: 8 }}>
              <img src={setupData.qrCodeDataUrl} alt="MFA QR Code" style={{ width: 200, height: 200 }} />
            </div>
            <p className="text-small text-muted" style={{ marginTop: 8 }}>Or enter manually: <code style={{ wordBreak: 'break-all' }}>{setupData.secret}</code></p>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <form onSubmit={handleEnable}>
              <p className="text-muted">2. Enter the 6-digit code from your app:</p>
              <div className="form-group">
                <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} required autoFocus
                  style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', maxWidth: 200 }} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={enabling}>{enabling ? 'Verifying...' : 'Verify & Enable MFA'}</button>
            </form>
            <div style={{ marginTop: 24 }}>
              <p className="text-muted"><strong>3. Save your backup codes:</strong></p>
              <div style={{ background: 'var(--surface-elevated)', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 13 }}>
                {setupData.backupCodes.map((c, i) => <div key={i}>{c}</div>)}
              </div>
              <p className="text-small text-muted" style={{ marginTop: 4 }}>⚠ Store these safely. Each code can only be used once.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2><Key size={20} /> Two-Factor Authentication</h2>
      <p className="text-muted">Add an extra layer of security with TOTP-based two-factor authentication using Google Authenticator or similar apps.</p>
      <button className="btn btn-primary" onClick={handleSetup} style={{ marginTop: 12 }}>🔐 Set Up MFA</button>
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
