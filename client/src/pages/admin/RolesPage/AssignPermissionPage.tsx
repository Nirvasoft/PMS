import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetRolesQuery, useGetRoleQuery, useGetPermissionsQuery, useUpdateRoleMutation,
  type PermissionsByModule,
} from '../../../store/api/usersApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useRefreshAuth } from '../../../hooks/useRefreshAuth';
import toast from 'react-hot-toast';

// Modules ordered to match the side menu's section/item order, top to bottom.
// Any module not listed here (e.g. newly added permissions) falls back to alphabetical
// order after all the known ones.
const MODULE_ORDER = [
  'dashboard',
  'users', 'roles', 'departments', 'positions',
  'company', 'properties', 'floor', 'unit', 'tenants', 'leases',
  'crm',
  'parking',
  'billing', 'meter', 'charge-category',
  'ar',
  'ap',
  'finance',
  'workflows',
  'maintenance',
  'facility',
  'inventory',
  'housekeeping',
  'security',
  'documents',
  'notifications',
  'mall',
  'community',
  'condo',
  'portal',
  'reports',
  'developer',
  'settings', 'audit',
];

function sortByMenuOrder(modules: string[]): string[] {
  return [...modules].sort((a, b) => {
    const ia = MODULE_ORDER.indexOf(a);
    const ib = MODULE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// Side menu section ("menu") each module ("sub menu") belongs to. Modules with no entry
// (e.g. 'dashboard', which sits directly under the side menu with no section) render
// standalone, same as in the side menu.
const MODULE_SECTIONS: Record<string, string> = {
  users: 'Administration', roles: 'Administration', departments: 'Administration', positions: 'Administration',
  company: 'Organization', properties: 'Organization', floor: 'Organization', unit: 'Organization', tenants: 'Organization', leases: 'Organization',
  crm: 'CRM',
  parking: 'Parking',
  billing: 'Billing', meter: 'Billing', 'charge-category': 'Billing',
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  finance: 'Finance',
  workflows: 'Workflows',
  maintenance: 'Maintenance',
  facility: 'Facility',
  inventory: 'Inventory',
  housekeeping: 'Housekeeping',
  security: 'Security',
  documents: 'Documents',
  notifications: 'Notifications',
  mall: 'Shopping Mall',
  community: 'Community',
  condo: 'Condo',
  portal: 'Tenant Portal',
  reports: 'Analytics',
  developer: 'Developer',
  settings: 'Settings',
  audit: 'Settings',
};

// Physical containment hierarchy — a Property has Floors, and each Floor has Units — so
// these render nested under their parent instead of as flat siblings within Organization.
const NESTED_MODULES: Record<string, string[]> = {
  properties: ['floor'],
  floor: ['unit'],
};
const CHILD_MODULES = new Set(Object.values(NESTED_MODULES).flat());

type ModuleBlock =
  | { type: 'standalone'; module: string }
  | { type: 'section'; label: string; modules: string[] };

// Walks the (already menu-ordered) module list and groups consecutive modules that
// belong to the same side-menu section into one collapsible block.
function groupModulesBySection(modules: string[]): ModuleBlock[] {
  const blocks: ModuleBlock[] = [];
  for (const module of modules) {
    const section = MODULE_SECTIONS[module];
    if (!section) {
      blocks.push({ type: 'standalone', module });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === 'section' && last.label === section) {
      last.modules.push(module);
    } else {
      blocks.push({ type: 'section', label: section, modules: [module] });
    }
  }
  return blocks;
}

// "leases.create" (module "leases") -> "Allow to create"; "users.manage-roles" -> "Allow to manage roles".
// "read" actions display as "view" (e.g. "billing.read" -> "Allow to view").
function permissionLabel(code: string, module: string): string {
  const suffix = code.startsWith(`${module}.`) ? code.slice(module.length + 1) : code;
  const display = suffix === 'read' ? 'view' : suffix;
  return `Allow to ${display.replace(/-/g, ' ')}`;
}

export default function AssignPermissionPage() {
  const navigate = useNavigate();
  const refreshAuth = useRefreshAuth();
  const { data: rolesData } = useGetRolesQuery({ includePermissions: false });
  const { data: permsData } = useGetPermissionsQuery();
  const [updateRole, { isLoading: saving }] = useUpdateRoleMutation();

  const [roleId, setRoleId] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [selectedFloorNumbers, setSelectedFloorNumbers] = useState<Set<number>>(new Set());
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activePropertyOpen, setActivePropertyOpen] = useState(false);
  const [floorModalOpen, setFloorModalOpen] = useState(false);
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const properties = propertiesData?.data ?? [];

  // System roles (e.g. Super Admin) are listed so their permissions can be viewed,
  // but the backend rejects any update to them, so the form below renders read-only.
  const roles = [...(rolesData?.data ?? [])]
    .sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const selectedRole = roles.find((r) => r.id === roleId);
  const isSystemRole = selectedRole?.isSystem ?? false;

  const permsByModule: PermissionsByModule = permsData?.data ?? {};
  const modules = sortByMenuOrder(Object.keys(permsByModule).filter((m) => permsByModule[m]?.length > 0));
  const blocks = groupModulesBySection(modules);
  const allCodes = modules.flatMap((m) => permsByModule[m]?.map((p) => p.code) ?? []);

  const { data: roleDetail } = useGetRoleQuery(roleId, { skip: !roleId });

  // Pre-tag whatever the selected role already has, once per role selection.
  // A system role (Super Admin) has unrestricted access by definition, so it always shows
  // every permission and property checked here, regardless of what's actually stored —
  // the backend refuses edits to it anyway, so this is display-only.
  // For custom roles, if the role has no property scoping yet, default to the first
  // property — at least one must always stay checked, so wait for properties to load
  // before initializing.
  if (roleId && roleDetail && initializedFor !== roleId) {
    if (isSystemRole) {
      setSelectedPerms(new Set(allCodes));
      setSelectedPropertyIds(new Set(properties.map((p) => p.id)));
      setSelectedFloorNumbers(new Set());
      setInitializedFor(roleId);
    } else {
      const existingPropertyIds = roleDetail.data.propertyIds ?? [];
      if (existingPropertyIds.length > 0 || propertiesData) {
        setSelectedPerms(new Set(roleDetail.data.permissions?.map((p) => p.code) ?? []));
        setSelectedPropertyIds(new Set(
          existingPropertyIds.length > 0 ? existingPropertyIds : (properties[0] ? [properties[0].id] : [])
        ));
        setSelectedFloorNumbers(new Set(roleDetail.data.floorNumbers ?? []));
        setInitializedFor(roleId);
      }
    }
  }

  const handleRoleChange = (id: string) => {
    setRoleId(id);
    setInitializedFor(null);
    setSelectedPerms(new Set());
    setSelectedPropertyIds(new Set());
    setSelectedFloorNumbers(new Set());
  };

  const toggleProperty = (id: string) => {
    if (isSystemRole) return;
    // At least one active property must stay checked — unchecking the last one is a no-op.
    if (selectedPropertyIds.has(id) && selectedPropertyIds.size === 1) {
      toast.error('At least one active property must stay checked');
      return;
    }
    const next = new Set(selectedPropertyIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedPropertyIds(next);
  };

  // Floor numbers are capped by the checked active properties' own floor counts —
  // the highest "total floors" among them, so no floor beyond what any scoped property has.
  const maxFloorNumber = Math.max(
    0,
    ...properties.filter((p) => selectedPropertyIds.has(p.id)).map((p) => p.totalFloors || 0),
  );
  const floorOptions = Array.from({ length: maxFloorNumber }, (_, i) => i + 1);
  const allFloorsChecked = floorOptions.length > 0 && floorOptions.every((n) => selectedFloorNumbers.has(n));

  // Drop any checked floor number that no longer fits once the active property selection
  // shrinks the floor count (e.g. switching from a 28-floor property to a 25-floor one).
  useEffect(() => {
    setSelectedFloorNumbers((prev) => {
      const pruned = new Set([...prev].filter((n) => n <= maxFloorNumber));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [maxFloorNumber]);

  const toggleFloor = (n: number) => {
    if (isSystemRole) return;
    const next = new Set(selectedFloorNumbers);
    if (next.has(n)) next.delete(n); else next.add(n);
    setSelectedFloorNumbers(next);
  };

  const toggleAllFloors = () => {
    if (isSystemRole) return;
    setSelectedFloorNumbers(allFloorsChecked ? new Set() : new Set(floorOptions));
  };

  const togglePerm = (code: string) => {
    if (isSystemRole) return;
    const next = new Set(selectedPerms);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSelectedPerms(next);
  };

  const toggleExpand = (module: string) => {
    const next = new Set(expandedModules);
    if (next.has(module)) next.delete(module); else next.add(module);
    setExpandedModules(next);
  };

  const toggleSection = (label: string) => {
    const next = new Set(expandedSections);
    if (next.has(label)) next.delete(label); else next.add(label);
    setExpandedSections(next);
  };

  const toggleModuleAll = (module: string) => {
    if (isSystemRole) return;
    const codes = (permsByModule[module] ?? []).map((p) => p.code);
    const allSelected = codes.length > 0 && codes.every((c) => selectedPerms.has(c));
    const next = new Set(selectedPerms);
    codes.forEach((c) => allSelected ? next.delete(c) : next.add(c));
    setSelectedPerms(next);
  };

  const toggleSectionAll = (sectionModules: string[]) => {
    if (isSystemRole) return;
    const codes = sectionModules.flatMap((m) => (permsByModule[m] ?? []).map((p) => p.code));
    const allSelected = codes.length > 0 && codes.every((c) => selectedPerms.has(c));
    const next = new Set(selectedPerms);
    codes.forEach((c) => allSelected ? next.delete(c) : next.add(c));
    setSelectedPerms(next);
  };

  const allPermsChecked = allCodes.length > 0 && allCodes.every((c) => selectedPerms.has(c));
  const somePermsChecked = selectedPerms.size > 0 && !allPermsChecked;

  const toggleAllPerms = () => {
    if (isSystemRole) return;
    setSelectedPerms(allPermsChecked ? new Set() : new Set(allCodes));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId || isSystemRole) return;
    if (selectedPerms.size < 2) {
      toast.error('Select at least two permissions before assigning');
      return;
    }
    if (properties.length > 0 && selectedPropertyIds.size === 0) {
      toast.error('Select at least one active property before assigning');
      return;
    }
    try {
      // Drop any selected floor number that no longer fits the checked properties' floor counts.
      const floorNumbers = Array.from(selectedFloorNumbers).filter((n) => n <= maxFloorNumber);
      await updateRole({
        id: roleId,
        data: { permissionCodes: Array.from(selectedPerms), propertyIds: Array.from(selectedPropertyIds), floorNumbers },
      }).unwrap();
      toast.success('Permissions assigned');
      await refreshAuth();
      navigate('/admin/roles');
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Failed to assign permissions');
    }
  };

  const renderModule = (module: string, depth = 0) => {
    const perms = permsByModule[module];
    const isOpen = expandedModules.has(module);
    const selectedCount = perms.filter((p) => selectedPerms.has(p.code)).length;
    const allChecked = perms.length > 0 && selectedCount === perms.length;
    const someChecked = selectedCount > 0 && !allChecked;
    const childModules = (NESTED_MODULES[module] ?? []).filter((m) => permsByModule[m]?.length > 0);
    return (
      <div key={module} className="perm-tag-group" style={depth > 0 ? { marginLeft: depth * 24 } : undefined}>
        <div className="perm-module-header" onClick={() => toggleExpand(module)}>
          <button
            type="button"
            className="perm-expand-btn"
            onClick={(e) => { e.stopPropagation(); toggleExpand(module); }}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? '−' : '+'}
          </button>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleModuleAll(module)}
          />
          <span className="perm-module-name">{module}</span>
          <span className="text-muted text-small">{selectedCount}/{perms.length}</span>
        </div>
        {isOpen && (
          <div className="perm-actions" style={{ paddingLeft: 32 }}>
            {perms.map((p) => (
              <label key={p.code} className={`perm-item ${selectedPerms.has(p.code) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedPerms.has(p.code)} onChange={() => togglePerm(p.code)} />
                <span style={{ textTransform: 'none' }}>{permissionLabel(p.code, module)}</span>
              </label>
            ))}
            {module === 'floor' && (
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: 8 }}
                disabled={isSystemRole}
                onClick={() => setFloorModalOpen(true)}
              >
                All Floor{selectedFloorNumbers.size > 0 ? ` (${selectedFloorNumbers.size})` : ''}
              </button>
            )}
          </div>
        )}
        {isOpen && childModules.map((child) => renderModule(child, depth + 1))}
      </div>
    );
  };

  // A module with no side-menu section (e.g. 'dashboard') sits at the top level, same as
  // a section — so it's styled and behaves like one (checkbox + dropdown), not like a
  // module nested inside a section.
  const renderStandaloneModule = (module: string) => {
    const perms = permsByModule[module];
    const isOpen = expandedModules.has(module);
    const selectedCount = perms.filter((p) => selectedPerms.has(p.code)).length;
    const allChecked = perms.length > 0 && selectedCount === perms.length;
    const someChecked = selectedCount > 0 && !allChecked;
    return (
      <div key={module} className="perm-section">
        <div className="perm-section-header" onClick={() => toggleExpand(module)}>
          <button
            type="button"
            className="perm-expand-btn"
            onClick={(e) => { e.stopPropagation(); toggleExpand(module); }}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? '−' : '+'}
          </button>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleModuleAll(module)}
          />
          <span className="perm-section-label">{module}</span>
          <span className="text-muted text-small">{selectedCount}/{perms.length}</span>
        </div>
        {isOpen && (
          <div className="perm-actions" style={{ paddingLeft: 32 }}>
            {perms.map((p) => (
              <label key={p.code} className={`perm-item ${selectedPerms.has(p.code) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedPerms.has(p.code)} onChange={() => togglePerm(p.code)} />
                <span style={{ textTransform: 'none' }}>{permissionLabel(p.code, module)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/admin/roles')}>← Back</button>
        <h1>Assign Permission</h1>
        <p className="text-secondary">Pick a role, then tag the permissions it should have</p>
      </div>

      <form onSubmit={handleSubmit} className="detail-form">
        <div className="form-group">
          <label>Role *</label>
          <select className="input-full" required value={roleId} onChange={(e) => handleRoleChange(e.target.value)}>
            <option value="">Select a role...</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {roleId && isSystemRole && (
          <p className="text-muted text-small" style={{ marginTop: -8 }}>
            {selectedRole?.name} is a system role — its permissions are fixed and shown here for reference only.
          </p>
        )}

        {roleId && (
          <div className={`perm-matrix ${isSystemRole ? 'perm-readonly' : ''}`}>
            <h3>
              <input
                type="checkbox"
                checked={allPermsChecked}
                ref={(el) => { if (el) el.indeterminate = somePermsChecked; }}
                onChange={toggleAllPerms}
              />
              Permissions <span className="perm-count">{selectedPerms.size} selected</span>
            </h3>

            <div className="perm-section">
              <div className="perm-section-header" onClick={() => setActivePropertyOpen(!activePropertyOpen)}>
                <button
                  type="button"
                  className="perm-expand-btn"
                  onClick={(e) => { e.stopPropagation(); setActivePropertyOpen(!activePropertyOpen); }}
                  aria-label={activePropertyOpen ? 'Collapse' : 'Expand'}
                >
                  {activePropertyOpen ? '−' : '+'}
                </button>
                <input
                  type="checkbox"
                  checked
                  readOnly
                  title="Active Property is always enabled"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="perm-section-label">Active Property</span>
                <span className="text-muted text-small">{selectedPropertyIds.size}/{properties.length}</span>
              </div>
              {activePropertyOpen && (
                <div className="perm-actions" style={{ paddingLeft: 32 }}>
                  {properties.map((p) => (
                    <label key={p.id} className={`perm-item ${selectedPropertyIds.has(p.id) ? 'selected' : ''}`}>
                      <input type="checkbox" checked={selectedPropertyIds.has(p.id)} onChange={() => toggleProperty(p.id)} />
                      <span style={{ textTransform: 'none' }}>{p.name}</span>
                    </label>
                  ))}
                  {properties.length === 0 && (
                    <span className="text-muted text-small">No properties created yet</span>
                  )}
                </div>
              )}
            </div>

            {blocks.map((block) => {
              if (block.type === 'standalone') return renderStandaloneModule(block.module);

              const sectionCodes = block.modules.flatMap((m) => permsByModule[m]?.map((p) => p.code) ?? []);
              const selectedCount = sectionCodes.filter((c) => selectedPerms.has(c)).length;
              const sectionAllChecked = sectionCodes.length > 0 && selectedCount === sectionCodes.length;
              const sectionSomeChecked = selectedCount > 0 && !sectionAllChecked;
              const isOpen = expandedSections.has(block.label);

              return (
                <div key={block.label} className="perm-section">
                  <div className="perm-section-header" onClick={() => toggleSection(block.label)}>
                    <button
                      type="button"
                      className="perm-expand-btn"
                      onClick={(e) => { e.stopPropagation(); toggleSection(block.label); }}
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? '−' : '+'}
                    </button>
                    <input
                      type="checkbox"
                      checked={sectionAllChecked}
                      ref={(el) => { if (el) el.indeterminate = sectionSomeChecked; }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSectionAll(block.modules)}
                    />
                    <span className="perm-section-label">{block.label}</span>
                    <span className="text-muted text-small">{selectedCount}/{sectionCodes.length}</span>
                  </div>
                  {isOpen && block.modules.filter((m) => !CHILD_MODULES.has(m)).map((m) => renderModule(m))}
                </div>
              );
            })}
          </div>
        )}

        {roleId && !isSystemRole && selectedPerms.size < 2 && (
          <p style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
            {selectedPerms.size === 0
              ? 'No permissions selected — this role will end up with no access.'
              : 'Only one permission selected.'} Check at least two permissions before assigning.
          </p>
        )}

        {roleId && !isSystemRole && properties.length > 0 && selectedPropertyIds.size === 0 && (
          <p style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
            No active property selected — check at least one property before assigning.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => navigate('/admin/roles')}>Cancel</button>
          {!isSystemRole && (
            <button type="submit" className="btn btn-primary" disabled={!roleId || saving}>Assign Permissions</button>
          )}
        </div>
      </form>

      {floorModalOpen && (
        <div className="modal-overlay" onClick={() => setFloorModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>All Floor</h2>
              <button className="modal-close" onClick={() => setFloorModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-muted text-small" style={{ marginBottom: 16 }}>
                Check the floor numbers this role can access. Leave all unchecked for unrestricted (all floors).
              </p>
              {floorOptions.length === 0 ? (
                <p className="text-muted text-small">
                  No floors available — check an active property with floors set up first.
                </p>
              ) : (
                <>
                  <label className="perm-item" style={{ marginBottom: 12 }}>
                    <input type="checkbox" checked={allFloorsChecked} onChange={toggleAllFloors} />
                    <span>Select All</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {floorOptions.map((n) => (
                      <label
                        key={n}
                        className={`perm-item ${selectedFloorNumbers.has(n) ? 'selected' : ''}`}
                        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}
                      >
                        <input type="checkbox" checked={selectedFloorNumbers.has(n)} onChange={() => toggleFloor(n)} />
                        <span style={{ textTransform: 'uppercase' }}>Floor {n}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setFloorModalOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
