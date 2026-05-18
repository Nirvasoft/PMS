import { useState } from 'react';
import {
  useGetDepartmentTreeQuery, useCreateDepartmentMutation,
  useUpdateDepartmentMutation, useDeleteDepartmentMutation,
} from '../../../store/api/usersApi';
import type { DepartmentNode } from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import toast from 'react-hot-toast';

export default function DepartmentsPage() {
  const { data, isLoading } = useGetDepartmentTreeQuery();
  const [createDepartment] = useCreateDepartmentMutation();
  const [deleteDepartment] = useDeleteDepartmentMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();

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
    if (!confirm(`Delete department "${name}"?`)) return;
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
    </div>
  );
}

function DeptTreeNode({
  node, depth, onAddChild, onDelete,
}: {
  node: DepartmentNode; depth: number;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
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
    <div className="modal-overlay" onClick={onClose}>
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
