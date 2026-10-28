import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetBlacklistQuery, useCreateBlacklistEntryMutation,
  useUpdateBlacklistEntryMutation, useDeleteBlacklistEntryMutation,
} from '../../../store/api/visitorsApi';
import {
  ShieldBan, Plus, X, Trash2, ToggleLeft, ToggleRight,
  Search, Loader2, User, Phone, CreditCard, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';

export default function VisitorBlacklistPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useGetBlacklistQuery({
    search: search || undefined,
    isActive: activeFilter || undefined,
    page,
  });
  const [createEntry, { isLoading: creating }] = useCreateBlacklistEntryMutation();
  const [updateEntry] = useUpdateBlacklistEntryMutation();
  const [deleteEntry] = useDeleteBlacklistEntryMutation();
  const confirmDialog = useConfirm();

  const [form, setForm] = useState({
    visitorName: '', visitorIc: '', visitorMobile: '', reason: '', propertyId: '',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.visitorName.trim() && !form.visitorIc.trim() && !form.visitorMobile.trim()) {
      errs.identifier = 'At least one identifier (Name, IC, or Mobile) is required';
    }
    if (!form.reason.trim()) {
      errs.reason = 'Reason is required';
    }
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    try {
      await createEntry({
        visitorName: form.visitorName.trim() || undefined,
        visitorIc: form.visitorIc.trim() || undefined,
        visitorMobile: form.visitorMobile.trim() || undefined,
        reason: form.reason.trim(),
        propertyId: form.propertyId || undefined,
      }).unwrap();
      toast.success('Added to blacklist');
      setShowForm(false);
      setForm({ visitorName: '', visitorIc: '', visitorMobile: '', reason: '', propertyId: '' });
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to add');
    }
  };

  const handleToggle = async (id: string, currentlyActive: boolean) => {
    try {
      await updateEntry({ id, isActive: !currentlyActive }).unwrap();
      toast.success(currentlyActive ? 'Entry deactivated' : 'Entry reactivated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('Permanently delete this blacklist entry?', { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteEntry(id).unwrap();
      toast.success('Entry deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><ShieldBan size={22} /></div>
          <div>
            <h1>Visitor Blacklist</h1>
            <p>{meta?.total ?? items.length} total entries</p>
          </div>
        </div>
        <div className="header-actions">
          <PermissionGuard permission="security-blacklist.write">
            <button className="btn btn-primary btn-sm" onClick={() => { setFormErrors({}); setShowForm(true); }} id="add-blacklist-btn">
              <Plus size={14} /> Add to Blacklist
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="maint-toolbar">
        <div className="filter-group" style={{ flex: 1 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              className="filter-select"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, IC, or mobile..."
              style={{ paddingLeft: 32, width: '100%' }}
              id="blacklist-search"
            />
          </div>
          <select
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
            className="filter-select"
            style={{ width: 140 }}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20, borderLeft: '4px solid var(--danger, #f44336)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Add to Blacklist</h3>
            <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label><User size={12} /> Visitor Name</label>
                <input
                  value={form.visitorName}
                  onChange={(e) => { setForm({ ...form, visitorName: e.target.value }); setFormErrors((p) => ({ ...p, identifier: '' })); }}
                  placeholder="Full name"
                  className={formErrors.identifier ? 'maint-input-error' : ''}
                />
              </div>
              <div className="form-group">
                <label><CreditCard size={12} /> IC / Passport No.</label>
                <input
                  value={form.visitorIc}
                  onChange={(e) => { setForm({ ...form, visitorIc: e.target.value }); setFormErrors((p) => ({ ...p, identifier: '' })); }}
                  placeholder="ID number"
                  className={formErrors.identifier ? 'maint-input-error' : ''}
                />
              </div>
              <div className="form-group">
                <label><Phone size={12} /> Mobile</label>
                <input
                  value={form.visitorMobile}
                  onChange={(e) => { setForm({ ...form, visitorMobile: e.target.value }); setFormErrors((p) => ({ ...p, identifier: '' })); }}
                  placeholder="+60..."
                  className={formErrors.identifier ? 'maint-input-error' : ''}
                />
              </div>
            </div>
            {formErrors.identifier && <span className="maint-error-text" style={{ display: 'block', marginTop: 4 }}>{formErrors.identifier}</span>}
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Reason *</label>
              <textarea
                value={form.reason}
                onChange={(e) => { setForm({ ...form, reason: e.target.value }); setFormErrors((p) => ({ ...p, reason: '' })); }}
                rows={2}
                placeholder="Why is this visitor being blacklisted?"
                style={{ width: '100%' }}
                className={formErrors.reason ? 'maint-input-error' : ''}
              />
              {formErrors.reason && <span className="maint-error-text">{formErrors.reason}</span>}
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '8px 0 0' }}>
              ⓘ At least one identifier (name, IC, or mobile) is required. The system will check against these when visitors are pre-registered.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-danger" disabled={creating}>
                {creating ? <><Loader2 size={14} className="spin" /> Adding...</> : <><ShieldBan size={14} /> Add to Blacklist</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : !items.length ? (
        <div className="maint-empty">
          <ShieldBan size={40} />
          <p>No blacklist entries found</p>
        </div>
      ) : (
        <div className="maint-table-wrap">
          <TableScrollWrapper>
            <table className="maint-table" id="blacklist-table">
              <thead>
                <tr>
                  <th>Visitor Name</th>
                  <th>IC / Passport</th>
                  <th>Mobile</th>
                  <th>Reason</th>
                  <th>Added By</th>
                  <th>Added On</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id} style={{ opacity: entry.isActive ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{entry.visitorName || '—'}</td>
                    <td className="cell-mono">{entry.visitorIc || '—'}</td>
                    <td>{entry.visitorMobile || '—'}</td>
                    <td title={entry.reason} style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.reason}
                    </td>
                    <td>
                      {entry.addedByUser?.profile
                        ? `${entry.addedByUser.profile.firstName} ${entry.addedByUser.profile.lastName}`
                        : entry.addedByUser?.email || '—'}
                    </td>
                    <td>{new Date(entry.addedAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`status-badge ${entry.isActive ? 'status-cancelled' : 'status-closed'}`}>
                        {entry.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <PermissionGuard permission="security-blacklist.write">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn-icon"
                            onClick={() => handleToggle(entry.id, entry.isActive)}
                            title={entry.isActive ? 'Deactivate' : 'Reactivate'}
                          >
                            {entry.isActive ? <ToggleRight size={16} className="text-danger" /> : <ToggleLeft size={16} />}
                          </button>
                          <button
                            className="btn-icon btn-danger"
                            onClick={() => handleDelete(entry.id)}
                            title="Delete permanently"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </PermissionGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollWrapper>
          {meta && meta.total >= 10 && (
            <div className="maint-pagination">
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Showing {items.length} of {meta.total} entries
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
                <span>Page {meta.page} of {Math.ceil(meta.total / meta.limit) || 1}</span>
                <button disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
