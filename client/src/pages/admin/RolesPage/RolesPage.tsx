import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useGetRolesQuery, useCreateRoleMutation, useUpdateRoleMutation, useDeleteRoleMutation, type RoleItem,
} from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useConfirm } from '../../../components/DialogProvider';
import toast from 'react-hot-toast';

const ROLES_PAGE_SIZE = 10;

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
  const [page, setPage] = useState(1);

  const changeView = (next: 'list' | 'grid') => {
    setView(next);
    localStorage.setItem('roles-view', next);
  };

  // System roles (e.g. Super Admin) surface first, then custom roles alphabetically.
  const roles = [...(data?.data ?? [])].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const totalPages = Math.max(1, Math.ceil(roles.length / ROLES_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRoles = roles.slice((currentPage - 1) * ROLES_PAGE_SIZE, currentPage * ROLES_PAGE_SIZE);

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

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>🔑 Roles & Permissions</h1>
        <p className="text-secondary">Define roles and assign permissions to control access</p>
      </div>

      <div className="toolbar">
        <div className="view-toggle">
          <button className={view === 'list' ? 'active' : ''} onClick={() => changeView('list')} title="List view">
            <List size={16} />
          </button>
          <button className={view === 'grid' ? 'active' : ''} onClick={() => changeView('grid')} title="Grid view">
            <LayoutGrid size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <PermissionGuard permission="roles.manage">
            <button className="btn" onClick={() => navigate('/admin/roles/assign-permission')}>+ Assign Permission</button>
          </PermissionGuard>
          <PermissionGuard permission="roles.create">
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Role</button>
          </PermissionGuard>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading roles...</div>
      ) : view === 'list' ? (
        <div className="audit-table-container">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Users</th>
                <th>Permissions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedRoles.map((role) => (
                <tr key={role.id} className="table-row-clickable" onClick={() => setEditingRole(role)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{role.name}</span>
                      {role.isSystem && <span className="role-chip system">System</span>}
                    </div>
                  </td>
                  <td className="text-secondary text-small">{role.description || 'No description'}</td>
                  <td className="text-muted text-small">{role.userCount}</td>
                  <td className="text-muted text-small">{role.permissionCount ?? 0}</td>
                  <td>
                    {!role.isSystem && (
                      <PermissionGuard permission="roles.manage">
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={(e) => { e.stopPropagation(); handleDelete(role.id, role.name); }}
                        >
                          Delete
                        </button>
                      </PermissionGuard>
                    )}
                  </td>
                </tr>
              ))}
              {pagedRoles.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }} className="text-muted">No roles found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="roles-grid">
          {pagedRoles.map((role) => (
            <div key={role.id} className="role-card-full" onClick={() => setEditingRole(role)}>
              <div className="role-card-header">
                <h3>{role.name}</h3>
                {role.isSystem && <span className="role-chip system">System</span>}
              </div>
              <p className="text-secondary text-small">{role.description || 'No description'}</p>
              <div className="role-card-footer">
                <span className="text-muted text-small">{role.userCount} user(s)</span>
                {!role.isSystem && (
                  <PermissionGuard permission="roles.manage">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => { e.stopPropagation(); handleDelete(role.id, role.name); }}
                    >
                      Delete
                    </button>
                  </PermissionGuard>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
            <ChevronLeft size={14} /> Prev
          </button>
          <span className="text-secondary">Page {currentPage} of {totalPages} ({roles.length} roles)</span>
          <button className="btn btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRole({ name, description, permissionCodes: [] }).unwrap();
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
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Role Name *</label>
            <input className="input-full" required value={name}
              onChange={(e) => setName(e.target.value)} />
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
  const isSystem = role.isSystem;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateRole({ id: role.id, data: { name, description } }).unwrap();
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
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Role Name *</label>
            <input className="input-full" required value={name} disabled={isSystem}
              onChange={(e) => setName(e.target.value)} />
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
