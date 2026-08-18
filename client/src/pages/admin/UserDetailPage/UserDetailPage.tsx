import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetUserQuery, useUpdateUserMutation, useDeactivateUserMutation,
  useReactivateUserMutation, useAdminResetPasswordMutation,
  useAssignUserRoleMutation, useRemoveUserRoleMutation,
  useGetRolesQuery, useGetDepartmentTreeQuery, useGetPositionsQuery,
  useGetPermissionsQuery, useAddPermissionOverrideMutation, useRemovePermissionOverrideMutation,
  useUploadAvatarMutation,
  type UserDetail,
} from '../../../store/api/usersApi';
import { useGetAuditLogsQuery } from '../../../store/api/authApi';
import { useConfirm } from '../../../components/DialogProvider';
import toast from 'react-hot-toast';

type Tab = 'profile' | 'roles' | 'security' | 'activity';

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
        <button className="btn btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => navigate('/admin/users')}>← Back</button>
        <div className="user-detail-identity">
          <AvatarUpload user={user} onRefresh={refetch} />
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
        <button className={`tab ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>
          📊 Activity
        </button>
      </div>

      <div className="tab-content">
        {tab === 'profile' && <ProfileTab user={user} onRefresh={refetch} />}
        {tab === 'roles' && <RolesTab user={user} onRefresh={refetch} />}
        {tab === 'security' && <SecurityTab user={user} onRefresh={refetch} />}
        {tab === 'activity' && <ActivityTab userId={user.id} />}
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
  const confirmDialog = useConfirm();
  const { data: rolesData } = useGetRolesQuery();
  const { data: permsData } = useGetPermissionsQuery();
  const [assignRole] = useAssignUserRoleMutation();
  const [removeRole] = useRemoveUserRoleMutation();
  const [addOverride] = useAddPermissionOverrideMutation();
  const [removeOverride] = useRemovePermissionOverrideMutation();
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);

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
    if (!(await confirmDialog(`Remove "${roleName}" role from this user?`, { danger: true, confirmText: 'Remove' }))) return;
    try {
      await removeRole({ userId: user.id, roleId }).unwrap();
      toast.success('Role removed');
      onRefresh();
    } catch { toast.error('Failed to remove role'); }
  };

  const handleRemoveOverride = async (overrideId: string, permName: string) => {
    if (!(await confirmDialog(`Remove override for "${permName}"?`, { danger: true, confirmText: 'Remove' }))) return;
    try {
      await removeOverride({ userId: user.id, overrideId }).unwrap();
      toast.success('Override removed');
      onRefresh();
    } catch { toast.error('Failed to remove override'); }
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

      {/* Effective Permissions — Grouped by Module */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <h3>Effective Permissions ({user.effectivePermissions.length})</h3>
      </div>
      <EffectivePermissionsGrouped user={user} />

      {/* Permission Overrides */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <h3>Permission Overrides ({user.permissionOverrides.length})</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setShowOverrideModal(true)}>+ Add Override</button>
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
              {o.expiresAt && (
                <span className="text-small" style={{ marginLeft: 8, color: 'var(--warning)' }}>
                  ⏰ expires {new Date(o.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => handleRemoveOverride(o.id, o.permissionName)}>Remove</button>
          </div>
        ))}
        {user.permissionOverrides.length === 0 && <p className="text-muted">No overrides — permissions come from assigned roles only</p>}
      </div>

      {/* Add Override Modal */}
      {showOverrideModal && (
        <AddOverrideModal
          userId={user.id}
          permsByModule={permsData?.data ?? {}}
          existingOverrides={user.permissionOverrides.map(o => o.permissionCode)}
          onClose={() => setShowOverrideModal(false)}
          onSuccess={() => { setShowOverrideModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

/* ─── Add Override Modal ──────────────────── */

function AddOverrideModal({
  userId, permsByModule, existingOverrides, onClose, onSuccess,
}: {
  userId: string;
  permsByModule: Record<string, { code: string; name: string; action: string; description: string | null }[]>;
  existingOverrides: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [addOverride, { isLoading }] = useAddPermissionOverrideMutation();
  const [selectedPerm, setSelectedPerm] = useState('');
  const [overrideType, setOverrideType] = useState<'grant' | 'revoke'>('grant');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerm) return;
    try {
      await addOverride({
        userId,
        permissionCode: selectedPerm,
        overrideType,
        reason: reason || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }).unwrap();
      toast.success(`Permission override added`);
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { data?: { errors?: { message: string }[] } })?.data?.errors?.[0]?.message;
      toast.error(msg || 'Failed to add override');
    }
  };

  // Filter permissions and exclude already overridden ones
  const existingSet = new Set(existingOverrides);
  const filteredModules = Object.entries(permsByModule)
    .map(([module, perms]) => ({
      module,
      perms: perms.filter(p =>
        !existingSet.has(p.code) &&
        (searchFilter === '' || p.code.toLowerCase().includes(searchFilter.toLowerCase()) || p.name.toLowerCase().includes(searchFilter.toLowerCase()))
      ),
    }))
    .filter(m => m.perms.length > 0);

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Add Permission Override</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {/* Override Type */}
          <div className="form-group">
            <label>Override Type</label>
            <div className="override-type-toggle">
              <button
                type="button"
                className={`toggle-btn ${overrideType === 'grant' ? 'active grant' : ''}`}
                onClick={() => setOverrideType('grant')}
              >
                ✅ Grant
              </button>
              <button
                type="button"
                className={`toggle-btn ${overrideType === 'revoke' ? 'active revoke' : ''}`}
                onClick={() => setOverrideType('revoke')}
              >
                🚫 Revoke
              </button>
            </div>
            <p className="text-small text-muted" style={{ marginTop: 4 }}>
              {overrideType === 'grant'
                ? 'Grant this permission even if not included in any role'
                : 'Revoke this permission even if granted by a role'}
            </p>
          </div>

          {/* Permission Picker */}
          <div className="form-group">
            <label>Permission</label>
            <input
              type="text"
              placeholder="Search permissions..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input-full"
              style={{ marginBottom: 8 }}
            />
            <div className="override-perm-list">
              {filteredModules.length === 0 && (
                <p className="text-muted text-small" style={{ padding: 12 }}>
                  {searchFilter ? 'No matching permissions' : 'All permissions are already overridden'}
                </p>
              )}
              {filteredModules.map(({ module, perms }) => (
                <div key={module} className="override-perm-module">
                  <div className="override-module-label">{module}</div>
                  {perms.map(p => (
                    <label
                      key={p.code}
                      className={`override-perm-option ${selectedPerm === p.code ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="permCode"
                        value={p.code}
                        checked={selectedPerm === p.code}
                        onChange={() => setSelectedPerm(p.code)}
                      />
                      <span className="override-perm-name">{p.name}</span>
                      <span className="override-perm-code">{p.code}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="form-group">
            <label>Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Temporary cover for leave"
              className="input-full"
            />
          </div>

          {/* Expiry */}
          <div className="form-group">
            <label>Expires At (optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="input-full"
            />
            <p className="text-small text-muted">Leave empty for permanent override</p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading || !selectedPerm}>
              {isLoading ? 'Adding...' : 'Add Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Effective Permissions Grouped ────────── */

function EffectivePermissionsGrouped({ user }: { user: UserDetail }) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  if (user.effectivePermissions.length === 0 && user.permissionOverrides.filter(o => o.overrideType === 'revoke').length === 0) {
    return <p className="text-muted">No permissions</p>;
  }

  // Build override lookup by permission code
  const overrideMap = new Map(user.permissionOverrides.map(o => [o.permissionCode, o]));

  // Build role→permissions lookup from role names (we'll mark granted permissions with role source)
  // Since we don't have per-role permission breakdown in UserDetail, we show role names as a combined source
  const roleNames = user.roles.map(r => r.name);

  // Group effective + revoked permissions by module
  type PermEntry = {
    code: string;
    action: string;
    source: string;
    isRevoked: boolean;
    expiresAt: string | null;
  };

  const moduleMap = new Map<string, PermEntry[]>();

  // Add effective permissions
  for (const code of user.effectivePermissions) {
    const dotIdx = code.indexOf('.');
    const module = dotIdx > 0 ? code.substring(0, dotIdx) : 'general';
    const action = dotIdx > 0 ? code.substring(dotIdx + 1) : code;

    const override = overrideMap.get(code);
    let source: string;
    if (override?.overrideType === 'grant') {
      source = '⊕ override (grant)';
    } else {
      source = roleNames.length > 0 ? `via ${roleNames.join(', ')}` : 'inherited';
    }

    if (!moduleMap.has(module)) moduleMap.set(module, []);
    moduleMap.get(module)!.push({
      code,
      action,
      source,
      isRevoked: false,
      expiresAt: override?.expiresAt ?? null,
    });
  }

  // Add revoked overrides (not in effectivePermissions but still worth showing)
  for (const o of user.permissionOverrides) {
    if (o.overrideType === 'revoke') {
      const dotIdx = o.permissionCode.indexOf('.');
      const module = dotIdx > 0 ? o.permissionCode.substring(0, dotIdx) : 'general';
      const action = dotIdx > 0 ? o.permissionCode.substring(dotIdx + 1) : o.permissionCode;

      if (!moduleMap.has(module)) moduleMap.set(module, []);
      moduleMap.get(module)!.push({
        code: o.permissionCode,
        action,
        source: '⊖ override (revoke)',
        isRevoked: true,
        expiresAt: o.expiresAt,
      });
    }
  }

  const sortedModules = [...moduleMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const toggleModule = (mod: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  // Start all expanded
  if (expandedModules.size === 0 && sortedModules.length > 0) {
    const all = new Set(sortedModules.map(([m]) => m));
    if (expandedModules.size !== all.size) {
      // Use a ref-like pattern: set on first render
      setTimeout(() => setExpandedModules(all), 0);
    }
  }

  return (
    <div className="eff-perm-grouped">
      {sortedModules.map(([module, perms]) => {
        const isExpanded = expandedModules.has(module);
        const grantedCount = perms.filter(p => !p.isRevoked).length;
        const revokedCount = perms.filter(p => p.isRevoked).length;

        return (
          <div key={module} className="eff-perm-module">
            <button
              className="eff-perm-module-header"
              onClick={() => toggleModule(module)}
            >
              <span className="eff-perm-expand">{isExpanded ? '▾' : '▸'}</span>
              <span className="eff-perm-module-name">{module}</span>
              <span className="eff-perm-module-count">
                {grantedCount}
                {revokedCount > 0 && <span className="revoked-count"> / {revokedCount} revoked</span>}
              </span>
            </button>
            {isExpanded && (
              <div className="eff-perm-list">
                {perms.map(p => (
                  <div
                    key={p.code}
                    className={`eff-perm-item ${p.isRevoked ? 'revoked' : ''}`}
                  >
                    <span className={`eff-perm-action ${p.isRevoked ? 'strikethrough' : ''}`}>
                      {p.action}
                    </span>
                    <span className="eff-perm-source">{p.source}</span>
                    {p.expiresAt && (
                      <span className="eff-perm-expiry" title={`Expires ${new Date(p.expiresAt).toLocaleDateString()}`}>
                        ⏰ {new Date(p.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Security Tab ─────────────────────────── */

function SecurityTab({ user, onRefresh }: { user: UserDetail; onRefresh: () => void }) {
  const confirmDialog = useConfirm();
  const [deactivateUser] = useDeactivateUserMutation();
  const [reactivateUser] = useReactivateUserMutation();
  const [adminResetPwd] = useAdminResetPasswordMutation();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [showDeactivate, setShowDeactivate] = useState(false);

  const handleResetPassword = async () => {
    if (!(await confirmDialog(`Reset password for ${user.email}? They will be forced to change it on next login.`))) return;
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
    if (!(await confirmDialog(`Reactivate ${user.email}?`))) return;
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

/* ─── Avatar Upload ────────────────────────── */

function AvatarUpload({ user, onRefresh }: { user: UserDetail; onRefresh: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadAvatar, { isLoading }] = useUploadAvatarMutation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    try {
      await uploadAvatar({ userId: user.id, file }).unwrap();
      toast.success('Avatar updated');
      onRefresh();
    } catch {
      toast.error('Failed to upload avatar');
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const initial = (user.firstName || user.email).charAt(0).toUpperCase();

  return (
    <div
      className={`user-avatar-lg clickable ${isLoading ? 'uploading' : ''}`}
      onClick={() => fileRef.current?.click()}
      title="Click to change avatar"
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.firstName} className="avatar-img" />
      ) : (
        initial
      )}
      <div className="avatar-overlay">
        {isLoading ? '⏳' : '📷'}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

/* ─── Activity Tab ─────────────────────────── */

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  login_success: { label: 'Login', icon: '✅' },
  login_failure: { label: 'Failed Login', icon: '❌' },
  logout: { label: 'Logout', icon: '🚪' },
  token_refresh: { label: 'Token Refresh', icon: '🔄' },
  mfa_enabled: { label: 'MFA Enabled', icon: '🔒' },
  mfa_disabled: { label: 'MFA Disabled', icon: '🔓' },
  mfa_verify_success: { label: 'MFA Verified', icon: '✅' },
  mfa_verify_failure: { label: 'MFA Failed', icon: '❌' },
  password_change: { label: 'Password Changed', icon: '🔑' },
  password_reset_request: { label: 'Reset Requested', icon: '📧' },
  password_reset_complete: { label: 'Reset Complete', icon: '🔑' },
  account_locked: { label: 'Account Locked', icon: '🔒' },
  account_unlocked: { label: 'Account Unlocked', icon: '🔓' },
  device_trusted: { label: 'Device Trusted', icon: '💻' },
  device_revoked: { label: 'Device Revoked', icon: '🚫' },
  sso_login: { label: 'SSO Login', icon: '🔗' },
  ip_blocked: { label: 'IP Blocked', icon: '🛑' },
  permission_override_expired: { label: 'Override Expired', icon: '⏰' },
};

function ActivityTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAuditLogsQuery({
    userId,
    page: String(page),
    limit: '20',
  });

  const logs = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, totalPages: 1 };

  return (
    <div className="user-detail-section">
      <div className="section-header">
        <h3>Auth Activity Log</h3>
        <span className="text-muted text-small">{meta.total} events</span>
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading activity...</div>
      ) : logs.length === 0 ? (
        <p className="text-muted">No activity recorded for this user</p>
      ) : (
        <>
          <div className="activity-table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>IP Address</th>
                  <th>Device</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: Record<string, unknown>) => {
                  const evtInfo = EVENT_LABELS[log.eventType as string] ?? { label: String(log.eventType), icon: '📝' };
                  const ua = String(log.userAgent || '');
                  const shortUA = ua.length > 40 ? ua.substring(0, 40) + '…' : ua || '—';
                  return (
                    <tr key={log.id as string}>
                      <td>
                        <span className="activity-event">
                          <span>{evtInfo.icon}</span>
                          <span>{evtInfo.label}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${log.status === 'success' ? 'active' : 'danger'}`}>
                          {String(log.status)}
                        </span>
                      </td>
                      <td className="text-small">{String(log.ipAddress || '—')}</td>
                      <td className="text-small text-muted" title={ua}>{shortUA}</td>
                      <td className="text-small text-muted">
                        {new Date(log.createdAt as string).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div className="pagination" style={{ marginTop: 16 }}>
              <button
                className="btn btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >← Prev</button>
              <span className="text-muted text-small">
                Page {page} of {meta.totalPages}
              </span>
              <button
                className="btn btn-sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(p => p + 1)}
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
