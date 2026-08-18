import { useState } from 'react';
import {
  useGetRolesQuery, useCreateRoleMutation, useDeleteRoleMutation,
  useGetPermissionsQuery, useGetRoleQuery, useUpdateRoleMutation,
  useGetRoleTemplatesQuery, useCreateRoleFromTemplateMutation,
} from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useConfirm } from '../../../components/DialogProvider';
import toast from 'react-hot-toast';

export default function RolesPage() {
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetRolesQuery({ includePermissions: false });
  const [deleteRole] = useDeleteRoleMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const roles = data?.data ?? [];

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
        <div />
        <PermissionGuard permission="roles.create">
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowTemplates(true)}>📋 From Template</button>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Role</button>
          </div>
        </PermissionGuard>
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading roles...</div>
      ) : (
        <div className="roles-grid">
          {roles.map((role) => (
            <div key={role.id} className="role-card-full" onClick={() => setEditingId(role.id)}>
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

      {showCreate && <RoleEditorModal onClose={() => setShowCreate(false)} />}
      {editingId && <RoleEditorModal roleId={editingId} onClose={() => setEditingId(null)} />}
      {showTemplates && <TemplatePickerModal onClose={() => setShowTemplates(false)} />}
    </div>
  );
}

function RoleEditorModal({ roleId, onClose }: { roleId?: string; onClose: () => void }) {
  const { data: existingRole } = useGetRoleQuery(roleId!, { skip: !roleId });
  const { data: permsData } = useGetPermissionsQuery();
  const [createRole, { isLoading: creating }] = useCreateRoleMutation();
  const [updateRole, { isLoading: updating }] = useUpdateRoleMutation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Initialize form from existing role
  if (existingRole && !initialized) {
    setName(existingRole.data.name);
    setDescription(existingRole.data.description || '');
    setSelectedPerms(new Set(existingRole.data.permissions?.map((p) => p.code) ?? []));
    setInitialized(true);
  }

  const permsByModule = permsData?.data ?? {};

  const togglePerm = (code: string) => {
    const next = new Set(selectedPerms);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSelectedPerms(next);
  };

  const toggleModule = (module: string) => {
    const codes = permsByModule[module]?.map((p) => p.code) ?? [];
    const allSelected = codes.every((c) => selectedPerms.has(c));
    const next = new Set(selectedPerms);
    codes.forEach((c) => allSelected ? next.delete(c) : next.add(c));
    setSelectedPerms(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const permissionCodes = Array.from(selectedPerms);
    try {
      if (roleId) {
        await updateRole({ id: roleId, data: { name, description, permissionCodes } }).unwrap();
        toast.success('Role updated');
      } else {
        await createRole({ name, description, permissionCodes }).unwrap();
        toast.success('Role created');
      }
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Failed to save role');
    }
  };

  const isSystem = existingRole?.data?.isSystem;

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{roleId ? `Edit: ${name}` : 'Create Role'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row-2">
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
          </div>

          {/* Permission Matrix */}
          <div className="perm-matrix">
            <h3>Permissions <span className="perm-count">{selectedPerms.size} selected</span></h3>
            {Object.entries(permsByModule).map(([module, perms]) => {
              const allChecked = perms.every((p) => selectedPerms.has(p.code));
              const someChecked = perms.some((p) => selectedPerms.has(p.code));
              return (
                <div key={module} className="perm-module">
                  <div className="perm-module-header" onClick={() => toggleModule(module)}>
                    <input type="checkbox" checked={allChecked} readOnly
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      disabled={isSystem} />
                    <span className="perm-module-name">{module}</span>
                    <span className="text-muted text-small">
                      {perms.filter((p) => selectedPerms.has(p.code)).length}/{perms.length}
                    </span>
                  </div>
                  <div className="perm-actions">
                    {perms.map((p) => (
                      <label key={p.code} className={`perm-item ${selectedPerms.has(p.code) ? 'selected' : ''}`}>
                        <input type="checkbox" checked={selectedPerms.has(p.code)}
                          onChange={() => togglePerm(p.code)} disabled={isSystem} />
                        <span>{p.action}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {!isSystem && (
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                {roleId ? 'Update Role' : 'Create Role'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

/* ─── Template Picker Modal ────────────────── */

function TemplatePickerModal({ onClose }: { onClose: () => void }) {
  const { data: templatesData, isLoading } = useGetRoleTemplatesQuery();
  const [createFromTemplate, { isLoading: creating }] = useCreateRoleFromTemplateMutation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');

  const templates = templatesData?.data ?? [];
  const selected = templates.find(t => t.id === selectedId);

  const handleCreate = async () => {
    if (!selectedId || !roleName.trim()) return;
    try {
      await createFromTemplate({ templateId: selectedId, name: roleName.trim() }).unwrap();
      toast.success(`Role "${roleName}" created from template`);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { data?: { errors?: { message: string }[] } })?.data?.errors?.[0]?.message;
      toast.error(msg || 'Failed to create role from template');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Role from Template</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {isLoading ? (
            <div className="loading-inline"><div className="loading-spinner" /> Loading templates...</div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p className="text-muted">No role templates available</p>
              <p className="text-small text-muted">Templates are seeded by the system administrator</p>
            </div>
          ) : (
            <>
              <p className="text-secondary" style={{ marginBottom: 16 }}>
                Select a template to pre-fill permissions, then give your role a custom name.
              </p>

              <div className="template-grid">
                {templates.map(t => (
                  <div
                    key={t.id}
                    className={`template-card ${selectedId === t.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedId(t.id); if (!roleName) setRoleName(t.name); }}
                  >
                    <div className="template-card-header">
                      <h4>{t.name}</h4>
                      <span className="perm-count">{t.permissions.length} perms</span>
                    </div>
                    <p className="text-small text-muted">{t.description || 'No description'}</p>
                    <div className="template-perms-preview">
                      {t.permissions.slice(0, 5).map(p => (
                        <span key={p} className="perm-chip small">{p}</span>
                      ))}
                      {t.permissions.length > 5 && (
                        <span className="perm-chip small muted">+{t.permissions.length - 5} more</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {selected && (
                <div className="template-name-form" style={{ marginTop: 20 }}>
                  <div className="form-group">
                    <label>Role Name *</label>
                    <input
                      type="text"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder="e.g., My Custom Finance Role"
                      className="input-full"
                      autoFocus
                    />
                    <p className="text-small text-muted">
                      Based on "{selected.name}" template with {selected.permissions.length} permissions
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !selectedId || !roleName.trim()}
          >
            {creating ? 'Creating...' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}
