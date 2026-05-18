import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetUserQuery, useUpdateUserMutation, useDeactivateUserMutation,
  useReactivateUserMutation, useAdminResetPasswordMutation,
  useAssignUserRoleMutation, useRemoveUserRoleMutation,
  useGetRolesQuery, useGetDepartmentTreeQuery, useGetPositionsQuery,
  type UserDetail,
} from '../../../store/api/usersApi';
import toast from 'react-hot-toast';

type Tab = 'profile' | 'roles' | 'security';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useGetUserQuery(id!);
  const user = data?.data;
  const [tab, setTab] = useState<Tab>('profile');

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="loading-inline"><div className="loading-spinner" /> Loading user...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-content">
        <div className="info-card" style={{ textAlign: 'center', padding: 60 }}>
          <h3>User not found</h3>
          <button className="btn btn-primary" onClick={() => navigate('/admin/users')}>← Back to Users</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="user-detail-header">
        <button className="btn btn-sm" onClick={() => navigate('/admin/users')}>← Back</button>
        <div className="user-detail-identity">
          <div className="user-avatar-lg">{(user.firstName || user.email).charAt(0).toUpperCase()}</div>
          <div>
            <h1>{user.firstName} {user.lastName}</h1>
            <p className="text-secondary">{user.email}</p>
            <div className="user-detail-badges">
              <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
              {user.mfaEnabled && <span className="status-badge active">🔒 MFA</span>}
              {user.jobTitle && <span className="role-chip">{user.jobTitle}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
          📋 Profile
        </button>
        <button className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>
          🔑 Roles & Permissions
        </button>
        <button className={`tab ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>
          🛡️ Security
        </button>
      </div>

      <div className="tab-content">
        {tab === 'profile' && <ProfileTab user={user} onRefresh={refetch} />}
        {tab === 'roles' && <RolesTab user={user} onRefresh={refetch} />}
        {tab === 'security' && <SecurityTab user={user} onRefresh={refetch} />}
      </div>
    </div>
  );
}

/* ─── Profile Tab ──────────────────────────── */

function ProfileTab({ user, onRefresh }: { user: UserDetail; onRefresh: () => void }) {
  const [updateUser, { isLoading }] = useUpdateUserMutation();
  const { data: deptsData } = useGetDepartmentTreeQuery();
  const { data: posData } = useGetPositionsQuery();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phone: user.phone || '',
    mobile: user.mobile || '',
    jobTitle: user.jobTitle || '',
    employeeId: user.employeeId || '',
    timezone: user.timezone || 'UTC',
    locale: user.locale || 'en',
  });

  const handleSave = async () => {
    try {
      await updateUser({ id: user.id, data: form }).unwrap();
      toast.success('Profile updated');
      setEditing(false);
      onRefresh();
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Update failed');
    }
  };

  // Flatten department tree for select
  const flatDepts: { id: string; name: string; depth: number }[] = [];
  function flattenDepts(nodes: { id: string; name: string; children: unknown[] }[], depth = 0) {
    for (const n of nodes) {
      flatDepts.push({ id: n.id, name: n.name, depth });
      if (n.children) flattenDepts(n.children as typeof nodes, depth + 1);
    }
  }
  if (deptsData?.data) flattenDepts(deptsData.data as { id: string; name: string; children: unknown[] }[]);

  return (
    <div className="user-detail-section">
      <div className="section-header">
        <h3>Profile Information</h3>
        {!editing ? (
          <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>Edit</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="detail-grid">
          <DetailRow label="First Name" value={user.firstName} />
          <DetailRow label="Last Name" value={user.lastName} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Phone" value={user.phone} />
          <DetailRow label="Mobile" value={user.mobile} />
          <DetailRow label="Job Title" value={user.jobTitle} />
          <DetailRow label="Employee ID" value={user.employeeId} />
          <DetailRow label="Department" value={user.department?.name} />
          <DetailRow label="Position" value={user.position?.name} />
          <DetailRow label="Timezone" value={user.timezone} />
          <DetailRow label="Locale" value={user.locale} />
          <DetailRow label="Date of Joining" value={user.dateOfJoining ? new Date(user.dateOfJoining).toLocaleDateString() : null} />
          <DetailRow label="Created" value={new Date(user.createdAt).toLocaleString()} />
          <DetailRow label="Last Login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'} />
        </div>
      ) : (
        <div className="edit-form">
          <div className="form-row-2">
            <div className="form-group">
              <label>First Name</label>
              <input className="input-full" value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input className="input-full" value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Phone</label>
              <input className="input-full" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Mobile</label>
              <input className="input-full" value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Job Title</label>
              <input className="input-full" value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Employee ID</label>
              <input className="input-full" value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Timezone</label>
              <select className="input-full" value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {['UTC', 'Asia/Yangon', 'Asia/Singapore', 'Asia/Tokyo', 'America/New_York', 'Europe/London'].map(tz =>
                  <option key={tz} value={tz}>{tz}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Locale</label>
              <select className="input-full" value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}>
                <option value="en">English</option>
                <option value="my">Myanmar</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Roles Tab ────────────────────────────── */

function RolesTab({ user, onRefresh }: { user: UserDetail; onRefresh: () => void }) {
  const { data: rolesData } = useGetRolesQuery();
  const [assignRole] = useAssignUserRoleMutation();
  const [removeRole] = useRemoveUserRoleMutation();
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const allRoles = rolesData?.data ?? [];
  const assignedIds = new Set(user.roles.map(r => r.id));
  const availableRoles = allRoles.filter(r => !assignedIds.has(r.id));

  const handleAssign = async () => {
    if (!selectedRoleId) return;
    try {
      await assignRole({ userId: user.id, roleId: selectedRoleId }).unwrap();
      toast.success('Role assigned');
      setSelectedRoleId('');
      onRefresh();
    } catch { toast.error('Failed to assign role'); }
  };

  const handleRemove = async (roleId: string, roleName: string) => {
    if (!confirm(`Remove "${roleName}" role from this user?`)) return;
    try {
      await removeRole({ userId: user.id, roleId }).unwrap();
      toast.success('Role removed');
      onRefresh();
    } catch { toast.error('Failed to remove role'); }
  };

  return (
    <div className="user-detail-section">
      {/* Assigned Roles */}
      <div className="section-header">
        <h3>Assigned Roles ({user.roles.length})</h3>
      </div>
      <div className="role-list">
        {user.roles.map(r => (
          <div key={r.id} className="role-list-item">
            <div>
              <strong>{r.name}</strong>
              {r.expiresAt && <span className="text-muted text-small"> · expires {new Date(r.expiresAt).toLocaleDateString()}</span>}
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => handleRemove(r.id, r.name)}>Remove</button>
          </div>
        ))}
        {user.roles.length === 0 && <p className="text-muted">No roles assigned</p>}
      </div>

      {/* Add Role */}
      {availableRoles.length > 0 && (
        <div className="add-role-row">
          <select className="input-full" value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
            <option value="">— Select role to add —</option>
            {availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={handleAssign} disabled={!selectedRoleId}>
            + Assign
          </button>
        </div>
      )}

      {/* Effective Permissions */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <h3>Effective Permissions ({user.effectivePermissions.length})</h3>
      </div>
      <div className="perm-grid">
        {user.effectivePermissions.map(p => (
          <span key={p} className="perm-chip">{p}</span>
        ))}
        {user.effectivePermissions.length === 0 && <p className="text-muted">No permissions</p>}
      </div>

      {/* Permission Overrides */}
      {user.permissionOverrides.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 24 }}>
            <h3>Permission Overrides ({user.permissionOverrides.length})</h3>
          </div>
          <div className="role-list">
            {user.permissionOverrides.map(o => (
              <div key={o.id} className="role-list-item">
                <div>
                  <span className={`status-badge ${o.overrideType === 'grant' ? 'active' : 'danger'}`}>
                    {o.overrideType}
                  </span>
                  <strong style={{ marginLeft: 8 }}>{o.permissionName}</strong>
                  <span className="text-muted text-small"> ({o.module})</span>
                  {o.reason && <span className="text-muted text-small"> — {o.reason}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Security Tab ─────────────────────────── */

function SecurityTab({ user, onRefresh }: { user: UserDetail; onRefresh: () => void }) {
  const [deactivateUser] = useDeactivateUserMutation();
  const [reactivateUser] = useReactivateUserMutation();
  const [adminResetPwd] = useAdminResetPasswordMutation();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [showDeactivate, setShowDeactivate] = useState(false);

  const handleResetPassword = async () => {
    if (!confirm(`Reset password for ${user.email}? They will be forced to change it on next login.`)) return;
    try {
      const result = await adminResetPwd(user.id).unwrap();
      setTempPassword(result.data.temporaryPassword);
      toast.success('Password reset');
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateUser({ id: user.id, reason: deactivateReason || 'Admin action' }).unwrap();
      toast.success('User deactivated');
      setShowDeactivate(false);
      onRefresh();
    } catch { toast.error('Failed'); }
  };

  const handleReactivate = async () => {
    if (!confirm(`Reactivate ${user.email}?`)) return;
    try {
      await reactivateUser(user.id).unwrap();
      toast.success('User reactivated');
      onRefresh();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="user-detail-section">
      <div className="section-header"><h3>Security Actions</h3></div>

      <div className="security-actions">
        {/* Reset Password */}
        <div className="security-card">
          <div className="security-card-info">
            <h4>🔑 Reset Password</h4>
            <p className="text-muted text-small">Generate a temporary password. User will be forced to change it on next login.</p>
          </div>
          <button className="btn btn-primary" onClick={handleResetPassword}>Reset Password</button>
        </div>

        {tempPassword && (
          <div className="info-card" style={{ background: 'var(--surface-elevated)', borderColor: 'var(--accent)' }}>
            <p><strong>⚠️ Temporary Password:</strong></p>
            <code className="temp-password">{tempPassword}</code>
            <p className="text-small text-muted" style={{ marginTop: 8 }}>
              Copy this now — it won't be shown again. The user must change it on next login.
            </p>
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => {
              navigator.clipboard.writeText(tempPassword);
              toast.success('Copied!');
            }}>📋 Copy</button>
          </div>
        )}

        {/* Deactivate / Reactivate */}
        <div className="security-card">
          <div className="security-card-info">
            <h4>{user.isActive ? '🚫 Deactivate Account' : '✅ Reactivate Account'}</h4>
            <p className="text-muted text-small">
              {user.isActive
                ? 'Prevent this user from logging in and revoke all sessions.'
                : 'Re-enable this user account to allow login.'}
            </p>
          </div>
          {user.isActive ? (
            <button className="btn btn-danger" onClick={() => setShowDeactivate(true)}>Deactivate</button>
          ) : (
            <button className="btn btn-primary" onClick={handleReactivate}>Reactivate</button>
          )}
        </div>

        {showDeactivate && (
          <div className="info-card" style={{ borderColor: 'var(--error)' }}>
            <div className="form-group">
              <label>Reason for deactivation</label>
              <input className="input-full" value={deactivateReason} placeholder="e.g. Employee left the company"
                onChange={(e) => setDeactivateReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => setShowDeactivate(false)}>Cancel</button>
              <button className="btn btn-sm btn-danger" onClick={handleDeactivate}>Confirm Deactivation</button>
            </div>
          </div>
        )}

        {/* MFA Status */}
        <div className="security-card">
          <div className="security-card-info">
            <h4>🔒 Multi-Factor Authentication</h4>
            <p className="text-muted text-small">
              Status: {user.mfaEnabled
                ? <span className="status-badge active">Enabled</span>
                : <span className="status-badge inactive">Disabled</span>}
            </p>
          </div>
        </div>

        {/* Account Info */}
        <div className="security-card">
          <div className="security-card-info">
            <h4>📊 Account Info</h4>
            <div className="detail-grid" style={{ marginTop: 8 }}>
              <DetailRow label="Created" value={new Date(user.createdAt).toLocaleString()} />
              <DetailRow label="Last Login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'} />
              <DetailRow label="Status" value={user.isActive ? 'Active' : 'Inactive'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────── */

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value || '—'}</span>
    </div>
  );
}
