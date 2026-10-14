import { useState } from 'react';
import {
  useGetUsersQuery,
  useCreateUserMutation,
  useGetInvitationsQuery,
  useSendInvitationMutation,
  useRevokeInvitationMutation,
  useGetRolesQuery,
  useGetPositionsQuery,
} from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useConfirm } from '../../../components/DialogProvider';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Undo2, Clock, CheckCircle, UserPlus, Users, Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { BulkImportTab } from './BulkImportTab';

export default function UsersPage() {
  const [tab, setTab] = useState<'users' | 'invitations' | 'import'>('users');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const queryParams: Record<string, string> = {
    search, page: String(page), limit: String(pageSize),
  };
  if (statusFilter !== 'all') queryParams.isActive = statusFilter === 'active' ? 'true' : 'false';

  const { data, isLoading } = useGetUsersQuery(queryParams);
  const users = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-row" style={{ alignItems: 'center' }}>
          <div className="page-title-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              className="page-icon-lg"
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <Users size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>User Management</h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {meta ? `${meta.total} total users` : 'Loading…'}
              </p>
            </div>
          </div>
          <PermissionGuard permission="users.create">
            <button
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
              id="create-user-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
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
      {tab === 'import' && <BulkImportTab onViewUsers={() => { setSearch(''); setStatusFilter('all'); setPage(1); setTab('users'); }} />}
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
        </div>

        {/* Users Table */}
        {isLoading ? (
          <div className="loading-inline"><div className="loading-spinner" /> Loading users...</div>
        ) : (
          <div className="users-table-wrap billing-table-wrap">
            <TableScrollWrapper>
              <table className="audit-table billing-table users-table" id="users-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200, paddingLeft: 30 }}>User</th>
                    <th style={{ minWidth: 220 }}>Roles</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th style={{ width: 140 }}>Last Login</th>
                    <th style={{ width: 60, textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="user-cell">
                          <UserAvatar url={user.avatarUrl} name={user.fullName} />
                          <div className="user-cell-name">{user.fullName}</div>
                        </div>
                      </td>
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
                      <td style={{ textAlign: 'center' }}>
                        <Link to={`/admin/users/${user.id}`} className="btn-icon" title="View" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Eye size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }} className="text-muted">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </TableScrollWrapper>

            {/* Pagination Toolbar */}
            {meta && meta.total >= 10 && (
              <div className="users-pagination positions-pagination billing-pagination">
                <div className="pagination-left">
                  <div className="page-size-selector">
                    <label htmlFor="user-page-size">Rows per page:</label>
                    <select
                      id="user-page-size"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div className="page-btns">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    title="Previous page"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="page-num-display">
                    Page {page} of {meta.totalPages}
                  </span>
                  <button
                    disabled={page >= meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    title="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>
      )}

      {/* Create User Modal */}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function UserAvatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="user-avatar-sm" style={{ overflow: 'hidden' }}>
      {url && !failed
        ? (
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
          />
        )
        : name.charAt(0)}
    </div>
  );
}
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [createUser, { isLoading }] = useCreateUserMutation();
  const { data: rolesData } = useGetRolesQuery();
  const { data: positionsData } = useGetPositionsQuery();
  const positions = positionsData?.data || [];
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    positionId: '',
    roleIds: [] as string[],
  });
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [emailServerError, setEmailServerError] = useState('');

  const emailTrimmed = form.email.trim();
  const isFirstNameInvalid = hasAttemptedSubmit && !form.firstName.trim();
  const isLastNameInvalid = hasAttemptedSubmit && !form.lastName.trim();
  const isEmailEmpty = hasAttemptedSubmit && !emailTrimmed;
  const isEmailFormatInvalid = hasAttemptedSubmit && !!emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const isEmailInvalid = isEmailEmpty || isEmailFormatInvalid || !!emailServerError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    setEmailServerError('');

    const missingFirst = !form.firstName.trim();
    const missingLast = !form.lastName.trim();
    const missingEmail = !emailTrimmed;
    const badEmail = !!emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

    if (missingFirst || missingLast || missingEmail) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (badEmail) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      await createUser({
        email: emailTrimmed,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        jobTitle: form.jobTitle || undefined,
        positionId: form.positionId || undefined,
        roleIds: form.roleIds,
      }).unwrap();
      toast.success('User created successfully');
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string; code?: string }[] } };
      const errMsg = apiErr.data?.errors?.[0]?.message || 'Failed to create user';
      const errCode = apiErr.data?.errors?.[0]?.code;
      if (errCode === 'EMAIL_ALREADY_EXISTS' || errMsg.toLowerCase().includes('email')) {
        setEmailServerError(errMsg);
      }
      toast.error(errMsg);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Create User</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" noValidate>
          <div className="form-row-2">
            <div className="form-group">
              <label>First Name *</label>
              <input
                className={`input-full${isFirstNameInvalid ? ' input-error' : ''}`}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
              {isFirstNameInvalid && <span className="field-error-text">First name is required</span>}
            </div>
            <div className="form-group">
              <label>Last Name *</label>
              <input
                className={`input-full${isLastNameInvalid ? ' input-error' : ''}`}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
              {isLastNameInvalid && <span className="field-error-text">Last name is required</span>}
            </div>
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input
              className={`input-full${isEmailInvalid ? ' input-error' : ''}`}
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                if (emailServerError) setEmailServerError('');
              }}
            />
            {isEmailEmpty && <span className="field-error-text">Email is required</span>}
            {!isEmailEmpty && isEmailFormatInvalid && <span className="field-error-text">Please enter a valid email address</span>}
            {!isEmailEmpty && !isEmailFormatInvalid && emailServerError && <span className="field-error-text">{emailServerError}</span>}
          </div>
          <div className="form-group">
            <label>Job Title</label>
            <select
              className="input-full"
              value={form.positionId}
              onChange={(e) => {
                const posId = e.target.value;
                const pos = positions.find((p) => p.id === posId);
                setForm({
                  ...form,
                  positionId: posId,
                  jobTitle: pos ? pos.name : '',
                });
              }}
            >
              <option value="">— Select Job Title —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetInvitationsQuery();
  const { data: rolesData } = useGetRolesQuery({});
  const [sendInvite, { isLoading: sending }] = useSendInvitationMutation();
  const [revokeInvite] = useRevokeInvitationMutation();
  const invitations = data?.data || [];
  const roles = rolesData?.data || [];

  const [form, setForm] = useState({ email: '', roleId: '', message: '' });
  const [lastInviteUrl, setLastInviteUrl] = useState('');
  const [hasAttemptedInvite, setHasAttemptedInvite] = useState(false);

  const inviteEmailTrimmed = form.email.trim();
  const isInviteEmailEmpty = hasAttemptedInvite && !inviteEmailTrimmed;
  const isInviteEmailInvalid = hasAttemptedInvite && !!inviteEmailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmailTrimmed);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedInvite(true);
    if (!inviteEmailTrimmed) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmailTrimmed)) {
      toast.error('Please enter a valid email address');
      return;
    }
    try {
      const res = await sendInvite({ ...form, email: inviteEmailTrimmed }).unwrap();
      toast.success(`Invitation sent to ${inviteEmailTrimmed}`);
      setLastInviteUrl(res.data.inviteUrl);
      setForm({ email: '', roleId: '', message: '' });
      setHasAttemptedInvite(false);
    } catch (err: unknown) {
      const e = err as { data?: { errors?: { message: string }[] } };
      toast.error(e.data?.errors?.[0]?.message || 'Failed to send invitation');
    }
  };

  if (isLoading) return <div className="loading-inline"><div className="loading-spinner" /> Loading...</div>;

  return (
    <>
      {/* Send Invite Form */}
      <form onSubmit={handleSend} className="info-card" style={{ padding: 20, marginBottom: 20 }} noValidate>
        <h3 style={{ marginTop: 0 }}><Mail size={18} /> Invite a New User</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Email Address *</label>
            <input
              className={`input-full${(isInviteEmailEmpty || isInviteEmailInvalid) ? ' input-error' : ''}`}
              type="email"
              value={form.email}
              placeholder="user@example.com"
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
            {isInviteEmailEmpty && <span className="field-error-text">Email is required</span>}
            {!isInviteEmailEmpty && isInviteEmailInvalid && <span className="field-error-text">Please enter a valid email address</span>}
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
                      <button className=" btn-danger" title="Revoke" onClick={async () => {
                        if (!(await confirmDialog(`Revoke invitation for ${inv.email}?`, { danger: true, confirmText: 'Revoke' }))) return;
                        try { await revokeInvite(inv.id).unwrap(); toast.success('Invitation revoked'); }
                        catch { toast.error('Failed to revoke'); }
                      }}><Undo2 size={18} strokeWidth={2.5} /></button>
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
