import { useState } from 'react';
import {
  useGetDepartmentTreeQuery, useCreateDepartmentMutation,
  useUpdateDepartmentMutation, useDeleteDepartmentMutation,
  useMoveDepartmentMutation,
} from '../../../store/api/usersApi';
import type { DepartmentNode } from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useConfirm } from '../../../components/DialogProvider';
import toast from 'react-hot-toast';

export default function DepartmentsPage() {
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetDepartmentTreeQuery();
  const [createDepartment] = useCreateDepartmentMutation();
  const [deleteDepartment] = useDeleteDepartmentMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [movingDept, setMovingDept] = useState<{ id: string; name: string } | null>(null);

  const tree = data?.data ?? [];

  const handleCreate = async (name: string, code: string, parentId?: string) => {
    try {
      await createDepartment({ name, code: code || undefined, parentId }).unwrap();
      toast.success('Department created');
      setShowCreate(false);
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Failed to create department');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete department "${name}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteDepartment(id).unwrap();
      toast.success('Department deleted');
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Cannot delete department');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>🏢 Departments</h1>
        <p className="text-secondary">Organize your team with hierarchical departments</p>
      </div>

      <div className="toolbar">
        <div />
        <PermissionGuard permission="departments.create">
          <button className="btn btn-primary" onClick={() => { setCreateParentId(undefined); setShowCreate(true); }}>
            + New Department
          </button>
        </PermissionGuard>
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading departments...</div>
      ) : tree.length === 0 ? (
        <div className="info-card" style={{ textAlign: 'center', padding: '60px' }}>
          <p className="text-muted">No departments yet. Create your first department to get started.</p>
        </div>
      ) : (
        <div className="dept-tree">
          {tree.map((node) => (
            <DeptTreeNode
              key={node.id}
              node={node}
              depth={0}
              onAddChild={(parentId) => { setCreateParentId(parentId); setShowCreate(true); }}
              onDelete={handleDelete}
              onMove={(id, name) => setMovingDept({ id, name })}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateDeptModal
          parentId={createParentId}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {movingDept && (
        <MoveDeptModal
          deptId={movingDept.id}
          deptName={movingDept.name}
          tree={tree}
          onClose={() => setMovingDept(null)}
        />
      )}
    </div>
  );
}

function DeptTreeNode({
  node, depth, onAddChild, onDelete, onMove,
}: {
  node: DepartmentNode; depth: number;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
  onMove: (id: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div className="dept-node" style={{ marginLeft: depth * 24 }}>
      <div className="dept-node-content">
        <button
          className="dept-expand-btn"
          onClick={() => setExpanded(!expanded)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="dept-node-info">
          <span className="dept-node-name">{node.name}</span>
          {node.code && <span className="dept-code">{node.code}</span>}
          {node.manager && <span className="text-muted text-small"> · {node.manager.fullName}</span>}
          <span className="text-muted text-small"> · {node.userCount} users</span>
        </div>
        <div className="dept-actions">
          <PermissionGuard permission="departments.create">
            <button className="btn btn-sm" onClick={() => onAddChild(node.id)} title="Add sub-department">+</button>
          </PermissionGuard>
          <PermissionGuard permission="departments.update">
            <button className="btn btn-sm" onClick={() => onMove(node.id, node.name)} title="Move department">↕</button>
          </PermissionGuard>
          <PermissionGuard permission="departments.delete">
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onDelete(node.id, node.name)}
              title="Delete"
            >✕</button>
          </PermissionGuard>
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="dept-children">
          {node.children.map((child) => (
            <DeptTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateDeptModal({
  parentId, onClose, onCreate,
}: {
  parentId?: string; onClose: () => void;
  onCreate: (name: string, code: string, parentId?: string) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{parentId ? 'Add Sub-Department' : 'Create Department'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onCreate(name, code, parentId); }} className="modal-body">
          <div className="form-group">
            <label>Department Name *</label>
            <input className="input-full" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label>Code (e.g. FIN, OPS)</label>
            <input className="input-full" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Move Department Modal ────────────────── */

function MoveDeptModal({
  deptId, deptName, tree, onClose,
}: {
  deptId: string;
  deptName: string;
  tree: DepartmentNode[];
  onClose: () => void;
}) {
  const [moveDepartment, { isLoading }] = useMoveDepartmentMutation();
  const [selectedParentId, setSelectedParentId] = useState<string>('__root__');

  // Flatten the tree for the dropdown, excluding the dept itself and its descendants
  const flattenTree = (nodes: DepartmentNode[], depth: number, excludeId: string): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const node of nodes) {
      if (node.id === excludeId) continue; // Skip the moving dept and all its children
      result.push({ id: node.id, name: node.name, depth });
      result.push(...flattenTree(node.children, depth + 1, excludeId));
    }
    return result;
  };

  const options = flattenTree(tree, 0, deptId);

  const handleMove = async () => {
    const newParentId = selectedParentId === '__root__' ? null : selectedParentId;
    try {
      await moveDepartment({ id: deptId, newParentId }).unwrap();
      toast.success(`"${deptName}" moved successfully`);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { data?: { errors?: { message: string }[] } })?.data?.errors?.[0]?.message;
      toast.error(msg || 'Failed to move department');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>Move Department</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-secondary" style={{ marginBottom: 16 }}>
            Select a new parent for <strong>"{deptName}"</strong>
          </p>

          <div className="form-group">
            <label>New Parent</label>
            <select
              className="input-full"
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
            >
              <option value="__root__">— Root level (no parent) —</option>
              {options.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {'  '.repeat(opt.depth)}{'└ '}{opt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleMove}
              disabled={isLoading}
            >
              {isLoading ? 'Moving...' : 'Move Department'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
