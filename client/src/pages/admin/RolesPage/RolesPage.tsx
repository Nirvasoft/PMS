import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetRolesQuery, useCreateRoleMutation, useDeleteRoleMutation,
  useGetPermissionsQuery, useGetRoleQuery, useUpdateRoleMutation,
  useGetRoleTemplatesQuery, useCreateRoleFromTemplateMutation,
  type PermissionsByModule,
} from '../../../store/api/usersApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useConfirm } from '../../../components/DialogProvider';
import toast from 'react-hot-toast';

// Modules that are displayed nested under a parent module in the permission matrix,
// reflecting the real hierarchy: a Property has Floors and Units (siblings, same level).
// Billing has Meters and Charge Categories.
const NESTED_MODULES: Record<string, string[]> = {
  properties: ['floor', 'unit'],
  billing: ['meter', 'charge-category'],
};
const CHILD_MODULES = new Set(Object.values(NESTED_MODULES).flat());

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
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [selectedFloors, setSelectedFloors] = useState<Set<number>>(new Set());
  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [showFloorsModal, setShowFloorsModal] = useState(false);

  // Initialize form from existing role
  if (existingRole && !initialized) {
    setName(existingRole.data.name);
    setDescription(existingRole.data.description || '');
    setSelectedPerms(new Set(existingRole.data.permissions?.map((p) => p.code) ?? []));
    setSelectedPropertyIds(new Set(existingRole.data.propertyIds ?? []));
    setSelectedFloors(new Set(existingRole.data.floorNumbers ?? []));
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

  const toggleExpand = (module: string) => {
    const next = new Set(expandedModules);
    if (next.has(module)) next.delete(module); else next.add(module);
    setExpandedModules(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const permissionCodes = Array.from(selectedPerms);
    const propertyIds = Array.from(selectedPropertyIds);
    const floorNumbers = Array.from(selectedFloors);
    try {
      if (roleId) {
        await updateRole({ id: roleId, data: { name, description, permissionCodes, propertyIds, floorNumbers } }).unwrap();
        toast.success('Role updated');
      } else {
        await createRole({ name, description, permissionCodes, propertyIds, floorNumbers }).unwrap();
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
            {Object.keys(permsByModule)
              .filter((module) => !CHILD_MODULES.has(module))
              .map((module) => (
                <div key={module} className="perm-module">
                  <ModuleTree
                    module={module}
                    permsByModule={permsByModule}
                    selectedPerms={selectedPerms}
                    toggleModule={toggleModule}
                    togglePerm={togglePerm}
                    disabled={isSystem}
                    expandedModules={expandedModules}
                    toggleExpand={toggleExpand}
                  />
                  {module === 'properties' && (
                    <div className="perm-actions" style={{ paddingLeft: 32 }}>
                      <button type="button" className="btn btn-sm" disabled={isSystem}
                        onClick={() => setShowPropertiesModal(true)}>
                        All Properties{selectedPropertyIds.size > 0 && ` (${selectedPropertyIds.size})`}
                      </button>
                      <button type="button" className="btn btn-sm" disabled={isSystem}
                        onClick={() => setShowFloorsModal(true)}>
                        All Floor{selectedFloors.size > 0 && ` (${selectedFloors.size})`}
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>

          {showPropertiesModal && (
            <PropertyScopeModal
              selected={selectedPropertyIds}
              onChange={setSelectedPropertyIds}
              onClose={() => setShowPropertiesModal(false)}
              disabled={isSystem}
            />
          )}
          {showFloorsModal && (
            <FloorScopeModal
              selected={selectedFloors}
              onChange={setSelectedFloors}
              onClose={() => setShowFloorsModal(false)}
              disabled={isSystem}
            />
          )}

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

/* ─── Permission Module Tree (collapsible: click +/− to reveal actions & nested children) ── */
function ModuleTree({ module, permsByModule, selectedPerms, toggleModule, togglePerm, disabled, expandedModules, toggleExpand }: {
  module: string;
  permsByModule: PermissionsByModule;
  selectedPerms: Set<string>;
  toggleModule: (module: string) => void;
  togglePerm: (code: string) => void;
  disabled?: boolean;
  expandedModules: Set<string>;
  toggleExpand: (module: string) => void;
}) {
  const perms = permsByModule[module];
  if (!perms) return null;
  const children = NESTED_MODULES[module] ?? [];
  const isOpen = expandedModules.has(module);
  const allChecked = perms.every((p) => selectedPerms.has(p.code));
  const someChecked = perms.some((p) => selectedPerms.has(p.code));

  return (
    <>
      <div className="perm-module-header" onClick={() => toggleModule(module)}>
        <button
          type="button"
          className="perm-expand-btn"
          onClick={(e) => { e.stopPropagation(); toggleExpand(module); }}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {isOpen ? '−' : '+'}
        </button>
        <input type="checkbox" checked={allChecked} readOnly
          ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
          disabled={disabled} />
        <span className="perm-module-name">{module}</span>
        <span className="text-muted text-small">
          {perms.filter((p) => selectedPerms.has(p.code)).length}/{perms.length}
        </span>
      </div>
      {isOpen && (
        <>
          <div className="perm-actions">
            {perms.map((p) => (
              <label key={p.code} className={`perm-item ${selectedPerms.has(p.code) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedPerms.has(p.code)}
                  onChange={() => togglePerm(p.code)} disabled={disabled} />
                <span>{p.action}</span>
              </label>
            ))}
          </div>
          {children.map((childModule) => (
            <div key={childModule} className="perm-submodule">
              <ModuleTree
                module={childModule}
                permsByModule={permsByModule}
                selectedPerms={selectedPerms}
                toggleModule={toggleModule}
                togglePerm={togglePerm}
                disabled={disabled}
                expandedModules={expandedModules}
                toggleExpand={toggleExpand}
              />
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ─── Property Scope Modal (which properties this role can access) ── */
function PropertyScopeModal({ selected, onChange, onClose, disabled }: {
  selected: Set<string>;
  onChange: (ids: Set<string>) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const properties = data?.data ?? [];
  const allChecked = properties.length > 0 && properties.every((p) => selected.has(p.id));
  const someChecked = properties.some((p) => selected.has(p.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const toggleAll = () => {
    onChange(allChecked ? new Set() : new Set(properties.map((p) => p.id)));
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>All Properties</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-secondary text-small">
            Check the properties this role can access. Leave all unchecked for unrestricted (all properties).
          </p>
          {isLoading ? (
            <div className="loading-inline"><div className="loading-spinner" /> Loading properties...</div>
          ) : (
            <>
              <label className="perm-module-header" style={{ borderRadius: 'var(--radius-sm)' }}>
                <input type="checkbox" checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={toggleAll} disabled={disabled || properties.length === 0} />
                <span className="perm-module-name">Select All</span>
              </label>
              <div className="perm-actions" style={{ paddingLeft: 0 }}>
                {properties.map((p) => (
                  <label key={p.id} className={`perm-item ${selected.has(p.id) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)} disabled={disabled} />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Floor Scope Modal (which floor numbers this role can access) ── */
function FloorScopeModal({ selected, onChange, onClose, disabled }: {
  selected: Set<number>;
  onChange: (floors: Set<number>) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const properties = data?.data ?? [];
  const maxFloor = Math.max(1, ...properties.map((p) => p.totalFloors ?? 0));
  const floorOptions = Array.from({ length: maxFloor }, (_, i) => i + 1);
  const allChecked = floorOptions.length > 0 && floorOptions.every((f) => selected.has(f));
  const someChecked = floorOptions.some((f) => selected.has(f));

  const toggle = (floor: number) => {
    const next = new Set(selected);
    if (next.has(floor)) next.delete(floor); else next.add(floor);
    onChange(next);
  };

  const toggleAll = () => {
    onChange(allChecked ? new Set() : new Set(floorOptions));
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>All Floor</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-secondary text-small">
            Check the floor numbers this role can access. Leave all unchecked for unrestricted (all floors).
          </p>
          {isLoading ? (
            <div className="loading-inline"><div className="loading-spinner" /> Loading floors...</div>
          ) : (
            <>
              <label className="perm-module-header" style={{ borderRadius: 'var(--radius-sm)' }}>
                <input type="checkbox" checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={toggleAll} disabled={disabled || floorOptions.length === 0} />
                <span className="perm-module-name">Select All</span>
              </label>
              <div className="perm-actions" style={{ paddingLeft: 0 }}>
                {floorOptions.map((floor) => (
                  <label key={floor} className={`perm-item ${selected.has(floor) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selected.has(floor)}
                      onChange={() => toggle(floor)} disabled={disabled} />
                    <span>Floor {floor}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
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
