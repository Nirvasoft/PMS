import { useState } from 'react';
import { useGetUsersQuery, useCreateUserMutation, useDeactivateUserMutation, useGetInvitationsQuery, useSendInvitationMutation, useRevokeInvitationMutation } from '../../../store/api/usersApi';
import { useGetRolesQuery } from '../../../store/api/usersApi';
import { useGetDepartmentTreeQuery } from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Trash2, Clock, CheckCircle, UserPlus, Users, Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { BulkImportTab } from './BulkImportTab';

export default function UsersPage() {
  const [tab, setTab] = useState<'users' | 'invitations' | 'import'>('users');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const queryParams: Record<string, string> = {
    search, page: String(page), limit: '15',
  };
  if (statusFilter !== 'all') queryParams.isActive = statusFilter === 'active' ? 'true' : 'false';

  const { data, isLoading } = useGetUsersQuery(queryParams);
  const users = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><Users size={24} /> User Management</h1>
            <p className="text-secondary">Manage users, roles, and access for your organization</p>
          </div>
          <PermissionGuard permission="users.create">
            <button className="btn btn-primary" onClick={() => setShowCreate(true)} id="create-user-btn">
              <UserPlus size={16} /> New User
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          <Users size={15} /> Users
        </button>
        <button className={`tab ${tab === 'invitations' ? 'active' : ''}`} onClick={() => setTab('invitations')}>
          <Mail size={15} /> Invitations
        </button>
        <button className={`tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>
          📂 Bulk Import
        </button>
      </div>

      {tab === 'invitations' && <InvitationsTab />}
      {tab === 'import' && <BulkImportTab />}
      {tab === 'users' && (
        <>
        {/* Toolbar Row */}
        <div className="users-toolbar">
          <div className="users-search-wrap">
            <Search size={16} className="users-search-icon" />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="users-search-input"
              id="user-search"
            />
          </div>
          <div className="users-filter-pills">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button key={s} className={`filter-pill ${statusFilter === s ? 'active' : ''}`}
                onClick={() => { setStatusFilter(s); setPage(1); }}>
                {s === 'all' ? 'All' : s === 'active' ? '✅ Active' : '🚫 Inactive'}
              </button>
            ))}
          </div>
          {meta && (
            <span className="users-count-badge">{meta.total} user{meta.total !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Users Table */}
        {isLoading ? (
          <div className="loading-inline"><div className="loading-spinner" /> Loading users...</div>
        ) : (
          <div className="audit-table-container">
            <table className="audit-table" id="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Job Title</th>
                  <th>Department</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar-sm">{user.fullName.charAt(0)}</div>
                        <div>
                          <div className="user-cell-name">{user.fullName}</div>
                          <div className="text-muted text-small">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{user.jobTitle || '—'}</td>
                    <td>{user.department?.name || '—'}</td>
                    <td>
                      <div className="role-chips">
                        {user.roles.map((r) => (
                          <span key={r.id} className="role-chip">{r.name}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-muted text-small">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td>
                      <Link to={`/admin/users/${user.id}`} className="btn-view-user">
                        <Eye size={14} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px' }} className="text-muted">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Prev</button>
            <span className="text-secondary">Page {meta.page} of {meta.totalPages} ({meta.total} users)</span>
            <button className="btn btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={14} /></button>
          </div>
        )}

        {/* Create User Modal */}
        {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
        </>
      )}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [createUser, { isLoading }] = useCreateUserMutation();
  const { data: rolesData } = useGetRolesQuery();
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', jobTitle: '', roleIds: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(form).unwrap();
      toast.success('User created successfully');
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Failed to create user');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create User</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row-2">
            <div className="form-group">
              <label>First Name *</label>
              <input className="input-full" required value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Last Name *</label>
              <input className="input-full" required value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input className="input-full" type="email" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Job Title</label>
            <input className="input-full" value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select className="input-full" value={form.roleIds[0] || ''}
              onChange={(e) => setForm({ ...form, roleIds: e.target.value ? [e.target.value] : [] })}>
              <option value="">— Select Role —</option>
              {rolesData?.data?.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


/* ─── Invitations Tab ──────────────────────── */

function InvitationsTab() {
  const { data, isLoading } = useGetInvitationsQuery();
  const { data: rolesData } = useGetRolesQuery({});
  const [sendInvite, { isLoading: sending }] = useSendInvitationMutation();
  const [revokeInvite] = useRevokeInvitationMutation();
  const invitations = data?.data || [];
  const roles = rolesData?.data || [];

  const [form, setForm] = useState({ email: '', roleId: '', message: '' });
  const [lastInviteUrl, setLastInviteUrl] = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await sendInvite(form).unwrap();
      toast.success(`Invitation sent to ${form.email}`);
      setLastInviteUrl(res.data.inviteUrl);
      setForm({ email: '', roleId: '', message: '' });
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed to send invitation');
    }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      {/* Send Invite Form */}
      <form onSubmit={handleSend} className="info-card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}><Mail size={18} /> Invite a New User</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Email Address *</label>
            <input className="input-full" type="email" required value={form.email}
              placeholder="user@example.com"
              onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Role (optional)</label>
            <select className="input-full" value={form.roleId}
              onChange={e => setForm({ ...form, roleId: e.target.value })}>
              <option value="">— No Role —</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Personal Message (optional)</label>
            <input className="input-full" value={form.message} placeholder="Welcome to our team!"
              onChange={e => setForm({ ...form, message: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={sending} style={{ marginTop: 8 }}>
          {sending ? '📨 Sending...' : '📨 Send Invitation'}
        </button>
      </form>

      {/* Show invite URL after send */}
      {lastInviteUrl && (
        <div className="info-card" style={{ borderLeft: '4px solid var(--success)', padding: 14, marginBottom: 16 }}>
          <p style={{ margin: 0 }}><CheckCircle size={14} style={{ color: 'var(--success)' }} /> <strong>Invitation created!</strong> Share this link:</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input className="input-full" value={lastInviteUrl} readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
            <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(lastInviteUrl); toast.success('Copied!'); }}>Copy</button>
          </div>
        </div>
      )}

      {/* Invitations List */}
      {invitations.length === 0 ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 32 }}>
          <p className="text-muted">No pending invitations. Use the form above to invite users.</p>
        </div>
      ) : (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th>Invited By</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {invitations.map(inv => (
                <tr key={inv.id}>
                  <td><Mail size={14} style={{ marginRight: 6 }} />{inv.email}</td>
                  <td>{inv.role?.name ? <span className="role-chip">{inv.role.name}</span> : '—'}</td>
                  <td>
                    {inv.acceptedAt
                      ? <span className="status-badge active"><CheckCircle size={12} /> Accepted</span>
                      : new Date(inv.expiresAt) < new Date()
                        ? <span className="status-badge inactive">Expired</span>
                        : <span className="status-badge pending"><Clock size={12} /> Pending</span>}
                  </td>
                  <td className="text-small">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td className="text-small text-muted">{inv.inviter.email}</td>
                  <td>
                    {!inv.acceptedAt && (
                      <button className="btn-icon btn-danger" title="Revoke" onClick={async () => {
                        if (!confirm(`Revoke invitation for ${inv.email}?`)) return;
                        try { await revokeInvite(inv.id).unwrap(); toast.success('Invitation revoked'); }
                        catch { toast.error('Failed to revoke'); }
                      }}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
