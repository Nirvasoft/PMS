import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState, useEffect } from 'react';
import { GitBranch, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useGetDepartmentTreeQuery, useCreateDepartmentMutation,
  useDeleteDepartmentMutation,
  useMoveDepartmentMutation,
} from '../../../store/api/usersApi';
import type { DepartmentNode } from '../../../store/api/usersApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { useConfirm } from '../../../components/DialogProvider';
import toast from 'react-hot-toast';

function countDepartments(nodes: DepartmentNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countDepartments(node.children), 0);
}

export default function DepartmentsPage() {
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetDepartmentTreeQuery();
  const [createDepartment] = useCreateDepartmentMutation();
  const [deleteDepartment] = useDeleteDepartmentMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [movingDept, setMovingDept] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const tree = data?.data ?? [];
  const totalDepartments = countDepartments(tree);
  const totalPages = Math.max(1, Math.ceil(tree.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const currentPage = Math.min(page, totalPages);
  const pagedTree = tree.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleCreate = async (name: string, code: string, parentId?: string) => {
    try {
      await createDepartment({ name, code: code || undefined, parentId }).unwrap();
      toast.success('Division created');
      setShowCreate(false);
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Failed to create division');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete division "${name}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteDepartment(id).unwrap();
      toast.success('Division deleted');
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] } };
      toast.error(apiErr.data?.errors?.[0]?.message || 'Cannot delete division');
    }
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
              <GitBranch size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Divisions</h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {isLoading ? <span className="pms-skeleton-line" style={{ display: 'inline-block', width: 96, height: 12, verticalAlign: 'middle' }} /> : `${totalDepartments} total divisions`}
              </p>
            </div>
          </div>
          <PermissionGuard permission="departments.create">
            <button className="btn btn-primary" onClick={() => { setCreateParentId(undefined); setShowCreate(true); }}>
              + New Division
            </button>
          </PermissionGuard>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : tree.length === 0 ? (
        <div className="info-card" style={{ textAlign: 'center', padding: '60px' }}>
          <p className="text-muted">No divisions yet. Create your first division to get started.</p>
        </div>
      ) : (
        <>
          <div className="dept-tree">
            {pagedTree.map((node) => (
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

          {tree.length >= 10 && (
            <div className="departments-pagination positions-pagination billing-pagination roles-grid-pagination">
              <div className="pagination-left">
                <div className="page-size-selector">
                  <label htmlFor="dept-page-size">Rows per page:</label>
                  <select
                    id="dept-page-size"
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="page-num-display">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </>
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
            <button className="btn btn-sm" onClick={() => onAddChild(node.id)} title="Add sub-division">+</button>
          </PermissionGuard>
          <PermissionGuard permission="departments.update">
            <button className="btn btn-sm" onClick={() => onMove(node.id, node.name)} title="Move division">↕</button>
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
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const nameError = hasAttemptedSubmit && !name.trim() ? 'Division name is required' : '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onCreate(trimmedName, code, parentId);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{parentId ? 'Add Sub-Division' : 'Create Division'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" noValidate>
          <div className="form-group">
            <label>Division Name *</label>
            <input
              className={`input-full${nameError ? ' input-error' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {nameError && <span className="field-error-text">{nameError}</span>}
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

/* ─── Move Division Modal ──────────────────── */

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
      toast.error(msg || 'Failed to move division');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>Move Division</h2>
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
              {isLoading ? 'Moving...' : 'Move Division'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
