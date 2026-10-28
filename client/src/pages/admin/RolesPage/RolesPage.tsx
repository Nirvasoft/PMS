import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, LayoutGrid, ChevronLeft, ChevronRight, Pencil, Trash2, Search, Key } from 'lucide-react';
import {
  useGetRolesQuery, useCreateRoleMutation, useUpdateRoleMutation, useDeleteRoleMutation, type RoleItem,
} from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useConfirm } from '../../../components/DialogProvider';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import toast from 'react-hot-toast';

export default function RolesPage() {
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetRolesQuery({ includePermissions: false });
  const [deleteRole] = useDeleteRoleMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [view, setView] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('roles-view') as 'list' | 'grid') || 'grid'
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const changeView = (next: 'list' | 'grid') => {
    setView(next);
    localStorage.setItem('roles-view', next);
  };

  // System roles (e.g. Super Admin) surface first, then custom roles alphabetically.
  const roles = [...(data?.data ?? [])].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const filteredRoles = roles.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.isSystem && 'system'.includes(q))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const currentPage = Math.min(page, totalPages);
  const pagedRoles = filteredRoles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete role "${name}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteRole(id).unwrap();
      toast.success('Role deleted');
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Cannot delete role');
    }
  };

  const renderPagination = (extraClass = '') => {
    if (filteredRoles.length < 10) return null;
    return (
      <div className={`roles-pagination positions-pagination billing-pagination ${extraClass}`.trim()}>
        <div className="pagination-left">
          <div className="page-size-selector">
            <label htmlFor="roles-page-size">Rows per page:</label>
            <select
              id="roles-page-size"
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
            disabled={currentPage === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            title="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="page-num-display">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            title="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  };

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
              <Key size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Roles & Permissions</h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {isLoading ? <span className="pms-skeleton-line" style={{ display: 'inline-block', width: 96, height: 12, verticalAlign: 'middle' }} /> : `${roles.length} total roles`}
              </p>
            </div>
          </div>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="view-toggle">
              <button className={view === 'list' ? 'active' : ''} onClick={() => changeView('list')} title="List view">
                <List size={16} />
              </button>
              <button className={view === 'grid' ? 'active' : ''} onClick={() => changeView('grid')} title="Grid view">
                <LayoutGrid size={16} />
              </button>
            </div>
            <PermissionGuard permission="roles.create">
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Role</button>
            </PermissionGuard>
          </div>
        </div>
      </div>

      {/* Users-style Toolbar with Search Bar */}
      <div className="users-toolbar">
        <div className="users-search-wrap">
          <Search size={16} className="users-search-icon" />
          <input
            type="text"
            placeholder="Search roles by name or description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="users-search-input"
            id="role-search"
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : view === 'list' ? (
        <div className="roles-table-wrap positions-table-wrap billing-table-wrap">
          <TableScrollWrapper className="roles-table-scroll positions-table-scroll">
            <table className="audit-table billing-table positions-table roles-table" id="roles-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Role</th>
                  <th style={{ minWidth: 260 }}>Description</th>
                  <th style={{ width: 110 }}>Users</th>
                  <th style={{ width: 130 }}>Permissions</th>
                  <th style={{ width: 80, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {pagedRoles.map((role) => (
                  <tr key={role.id} className="table-row-clickable" onClick={() => navigate(`/admin/roles/assign-permission?roleId=${role.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{role.name}</span>
                        {role.isSystem && <span className="role-chip system">System</span>}
                      </div>
                    </td>
                    <td className="text-secondary text-small">{role.description || 'No description'}</td>
                    <td className="text-muted text-small">{role.userCount}</td>
                    <td className="text-muted text-small">{role.permissionCount ?? 0}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {!role.isSystem && (
                          <PermissionGuard permission="roles.manage">
                            <button
                              className="btn-icon"
                              title="Edit"
                              onClick={(e) => { e.stopPropagation(); setEditingRole(role); }}
                            >
                              <Pencil size={14} />
                            </button>
                          </PermissionGuard>
                        )}
                        {!role.isSystem && (
                          <PermissionGuard permission="roles.manage">
                            <button
                              className="btn-icon"
                              title="Delete"
                              style={{ color: 'var(--text-muted)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                              onClick={(e) => { e.stopPropagation(); handleDelete(role.id, role.name); }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </PermissionGuard>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedRoles.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px' }} className="text-muted">
                      {search.trim() ? 'No roles match your search' : 'No roles found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScrollWrapper>

          {renderPagination()}
        </div>
      ) : (
        <>
          <div className="roles-grid">
            {pagedRoles.map((role) => (
              <div key={role.id} className="role-card-full" onClick={() => navigate(`/admin/roles/assign-permission?roleId=${role.id}`)}>
                <div className="role-card-header">
                  <h3>{role.name}</h3>
                  {role.isSystem && <span className="role-chip system">System</span>}
                </div>
                <p className="text-secondary text-small">{role.description || 'No description'}</p>
                <div className="role-card-footer">
                  <span className="text-muted text-small">{role.userCount} user(s)</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!role.isSystem && (
                      <PermissionGuard permission="roles.manage">
                        <button
                          className="btn-icon"
                          title="Edit"
                          onClick={(e) => { e.stopPropagation(); setEditingRole(role); }}
                        >
                          <Pencil size={14} />
                        </button>
                      </PermissionGuard>
                    )}
                    {!role.isSystem && (
                      <PermissionGuard permission="roles.manage">
                        <button
                          className="btn-icon"
                          title="Delete"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                          onClick={(e) => { e.stopPropagation(); handleDelete(role.id, role.name); }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </PermissionGuard>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {pagedRoles.length === 0 && (
              <div className="info-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 16px' }}>
                <p className="text-muted" style={{ margin: 0 }}>
                  {search.trim() ? 'No roles match your search' : 'No roles found'}
                </p>
              </div>
            )}
          </div>
          {renderPagination('roles-grid-pagination')}
        </>
      )}

      {showCreate && <CreateRoleModal onClose={() => setShowCreate(false)} />}
      {editingRole && <EditRoleModal role={editingRole} onClose={() => setEditingRole(null)} />}
    </div>
  );
}

function CreateRoleModal({ onClose }: { onClose: () => void }) {
  const [createRole, { isLoading: creating }] = useCreateRoleMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const nameError = hasAttemptedSubmit && !name.trim() ? 'Role name is required' : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    try {
      await createRole({ name: trimmedName, description: description.trim(), permissionCodes: [] }).unwrap();
      toast.success('Role created');
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Failed to create role');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Role</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" noValidate>
          <div className="form-group">
            <label>Role Name *</label>
            <input
              className={`input-full${nameError ? ' input-error' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {nameError && <span className="field-error-text">{nameError}</span>}
          </div>
          <div className="form-group">
            <label>Description</label>
            <input className="input-full" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={creating}>Create Role</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditRoleModal({ role, onClose }: { role: RoleItem; onClose: () => void }) {
  const [updateRole, { isLoading: updating }] = useUpdateRoleMutation();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const isSystem = role.isSystem;

  const nameError = hasAttemptedSubmit && !name.trim() ? 'Role name is required' : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    try {
      await updateRole({ id: role.id, data: { name: trimmedName, description: description.trim() } }).unwrap();
      toast.success('Role updated');
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Failed to update role');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isSystem ? role.name : `Edit: ${name}`}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" noValidate>
          <div className="form-group">
            <label>Role Name *</label>
            <input
              className={`input-full${nameError ? ' input-error' : ''}`}
              value={name}
              disabled={isSystem}
              onChange={(e) => setName(e.target.value)}
            />
            {nameError && <span className="field-error-text">{nameError}</span>}
          </div>
          <div className="form-group">
            <label>Description</label>
            <input className="input-full" value={description} disabled={isSystem}
              onChange={(e) => setDescription(e.target.value)} />
          </div>

          {!isSystem && (
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={updating}>Update Role</button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
