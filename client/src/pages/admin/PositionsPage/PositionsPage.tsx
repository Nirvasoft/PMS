import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState, useEffect } from 'react';
import { useGetPositionsQuery, useCreatePositionMutation, useDeletePositionMutation, useGetDepartmentTreeQuery } from '../../../store/api/usersApi';
import { Briefcase, Trash2, Plus, ChevronLeft, ChevronRight, Search, Filter, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';

export default function PositionsPage() {
  const confirmDialog = useConfirm();
  const { data, isLoading } = useGetPositionsQuery();
  const { data: deptData } = useGetDepartmentTreeQuery();
  const [createPosition] = useCreatePositionMutation();
  const [deletePosition] = useDeletePositionMutation();
  const positions = data?.data || [];
  const departments = deptData?.data || [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', level: 1, departmentId: '', canApprove: false, approvalLimit: '' });
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const nameError = hasAttemptedSubmit && !form.name.trim() ? 'Position name is required' : '';

  const openForm = () => {
    setHasAttemptedSubmit(false);
    setShowForm(true);
  };

  const closeForm = () => {
    setHasAttemptedSubmit(false);
    setShowForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    const trimmedName = form.name.trim();
    if (!trimmedName) return;
    try {
      await createPosition({
        name: trimmedName,
        level: form.level,
        ...(form.departmentId ? { departmentId: form.departmentId } : {}),
        canApprove: form.canApprove,
        ...(form.approvalLimit ? { approvalLimit: parseFloat(form.approvalLimit) } : {}),
      }).unwrap();
      toast.success('Position created!');
      setForm({ name: '', level: 1, departmentId: '', canApprove: false, approvalLimit: '' });
      setHasAttemptedSubmit(false);
      setShowForm(false);
    } catch { toast.error('Failed to create position'); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Delete position "${name}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deletePosition(id).unwrap();
      toast.success('Position deleted');
    } catch { toast.error('Cannot delete — position may be in use'); }
  };

  // Flatten departments for select
  const flatDepts: { id: string; name: string; depth: number }[] = [];
  const flatten = (nodes: typeof departments, depth = 0) => {
    for (const n of nodes) {
      flatDepts.push({ id: n.id, name: n.name, depth });
      if (n.children) flatten(n.children, depth + 1);
    }
  };
  flatten(departments);

  const availableLevels = Array.from(new Set(positions.map(p => p.level))).sort((a, b) => a - b);
  const hasActiveFilters = Boolean(departmentFilter || approvalFilter || levelFilter);

  const resetFilters = () => {
    setDepartmentFilter('');
    setApprovalFilter('');
    setLevelFilter('');
    setPage(1);
  };

  const filteredPositions = positions.filter((p) => {
    if (departmentFilter) {
      if (departmentFilter === '__unassigned__') {
        if (p.departmentId) return false;
      } else if (p.departmentId !== departmentFilter) {
        return false;
      }
    }
    if (approvalFilter) {
      const canApprove = Boolean((p as any).canApprove);
      if (approvalFilter === 'can_approve' && !canApprove) return false;
      if (approvalFilter === 'cannot_approve' && canApprove) return false;
    }
    if (levelFilter && String(p.level) !== levelFilter) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const deptName = p.departmentId ? (flatDepts.find(d => d.id === p.departmentId)?.name || '') : 'All';
    return (
      p.name.toLowerCase().includes(q) ||
      deptName.toLowerCase().includes(q) ||
      `level ${p.level}`.toLowerCase().includes(q) ||
      String(p.level).includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredPositions.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [search, departmentFilter, approvalFilter, levelFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedPositions = filteredPositions.slice((page - 1) * pageSize, page * pageSize);

  if (isLoading) return <div className="page-content"><TableSkeleton columns={5} rows={5} /></div>;

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
              <Briefcase size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Positions</h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {`${positions.length} total positions`}
              </p>
            </div>
          </div>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PermissionGuard permission="positions.create">
              <button className="btn btn-primary" onClick={openForm} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} /> New Position
              </button>
            </PermissionGuard>
          </div>
        </div>
      </div>

      {/* Users-style Toolbar with Search Bar and Filters */}
      <div className="users-toolbar" style={showFilters ? { marginBottom: 10 } : undefined}>
        <div className="users-search-wrap">
          <Search size={16} className="users-search-icon" />
          <input
            type="text"
            placeholder="Search positions by name, division, level..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="users-search-input"
            id="position-search"
          />
        </div>
        <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
          <Filter size={15} /> Filters{hasActiveFilters ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className="filter-bar" style={{ marginBottom: 20 }}>
          <select
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Divisions</option>
            <option value="__unassigned__">All (Global / No Division)</option>
            {flatDepts.map(d => (
              <option key={d.id} value={d.id}>{'\u00A0\u00A0'.repeat(d.depth) + d.name}</option>
            ))}
          </select>
          <select
            value={approvalFilter}
            onChange={(e) => { setApprovalFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Approvals</option>
            <option value="can_approve">Can Approve</option>
            <option value="cannot_approve">Cannot Approve</option>
          </select>
          <select
            value={levelFilter}
            onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Levels</option>
            {availableLevels.map(lvl => (
              <option key={lvl} value={String(lvl)}>Level {lvl}</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={resetFilters}>
            <X size={14} /> Reset
          </button>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>New Position</h2>
              <button className="btn-icon" onClick={closeForm}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-body" noValidate>
              <div className="form-group">
                <label>Position Name *</label>
                <input
                  className={`input-full${nameError ? ' input-error' : ''}`}
                  value={form.name}
                  placeholder="e.g. Senior Manager"
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
                {nameError && <span className="field-error-text">{nameError}</span>}
              </div>
              <div className="form-group">
                <label>Level</label>
                <input type="number" className="input-full no-spinner" min={1} max={20} value={form.level}
                  onChange={e => setForm({ ...form, level: +e.target.value })} />
              </div>
              <div className="form-group">
                <label>Division (optional)</label>
                <select className="input-full" value={form.departmentId}
                  onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                  <option value="">— All Divisions —</option>
                  {flatDepts.map(d => (
                    <option key={d.id} value={d.id}>{'  '.repeat(d.depth) + d.name}</option>
                  ))}
                </select>
              </div>
              {form.canApprove && (
                <div className="form-group">
                  <label>Approval Limit</label>
                  <input type="number" className="input-full no-spinner" min={0} step="0.01" placeholder="No limit"
                    value={form.approvalLimit}
                    onChange={e => setForm({ ...form, approvalLimit: e.target.value })} />
                </div>
              )}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <button type="button" className={`toggle-switch ${form.canApprove ? 'on' : ''}`}
                  onClick={() => setForm({ ...form, canApprove: !form.canApprove })}>
                  <span className="toggle-knob" />
                </button>
                <label style={{ margin: 0 }}>Can Approve</label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40 }}>
          <Briefcase size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p className="text-muted">No positions defined yet. Click "New Position" to create one.</p>
        </div>
      ) : (
        <div className="positions-table-wrap billing-table-wrap">
          <TableScrollWrapper className="positions-table-scroll">
            <table className="audit-table billing-table positions-table" id="positions-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Position Name</th>
                  <th style={{ width: 120 }}>Level</th>
                  <th style={{ minWidth: 180 }}>Division</th>
                  <th style={{ width: 160 }}>Approval</th>
                  <th style={{ width: 70, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                      No positions match your search
                    </td>
                  </tr>
                ) : (
                  pagedPositions.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td><span className="role-chip">Level {p.level}</span></td>
                      <td className="text-muted">{p.departmentId ? flatDepts.find(d => d.id === p.departmentId)?.name || '—' : 'All'}</td>
                      <td>
                        {(p as any).canApprove ? (
                          <span className="status-badge active">
                            ✓ {(p as any).approvalLimit
                              ? `≤ ${Number((p as any).approvalLimit).toLocaleString()}`
                              : 'Unlimited'}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <PermissionGuard permission="positions.delete">
                          <button
                            className="btn-icon"
                            title="Delete"
                            style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                            onClick={() => handleDelete(p.id, p.name)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </PermissionGuard>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableScrollWrapper>

          {/* Modern Pagination Toolbar */}
          {filteredPositions.length >= 10 && (
            <div className="positions-pagination billing-pagination">
              <div className="pagination-left">
                <div className="page-size-selector">
                  <label htmlFor="positions-page-size">Rows per page:</label>
                  <select
                    id="positions-page-size"
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
                  onClick={() => setPage(p => p - 1)}
                  title="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="page-num-display">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  title="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
