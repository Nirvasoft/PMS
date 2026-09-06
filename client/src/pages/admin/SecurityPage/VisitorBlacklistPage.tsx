import { useState } from 'react';
import {
  useGetBlacklistQuery, useCreateBlacklistEntryMutation,
  useUpdateBlacklistEntryMutation, useDeleteBlacklistEntryMutation,
} from '../../../store/api/visitorsApi';
import {
  ShieldBan, Plus, X, Trash2, ToggleLeft, ToggleRight,
  Search, Loader2, User, Phone, CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

export default function VisitorBlacklistPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

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
    if (!form.visitorName && !form.visitorIc && !form.visitorMobile) {
      toast.error('At least one identifier is required');
      return;
    }
    if (!form.reason.trim()) { toast.error('Reason is required'); return; }
    try {
      await createEntry({
        visitorName: form.visitorName || undefined,
        visitorIc: form.visitorIc || undefined,
        visitorMobile: form.visitorMobile || undefined,
        reason: form.reason,
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
    <div className="page-content">
      <div className="page-header">
        <h1><ShieldBan size={24} /> Visitor Blacklist</h1>
        <p className="text-muted">Manage blacklisted visitors who are blocked from entry</p>
      </div>

      <div className="section-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input
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
          className="form-select"
          style={{ width: 140 }}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <div style={{ flex: 1 }} />
        <PermissionGuard permission="security-blacklist.write">
          <button className="btn btn-primary" onClick={() => setShowForm(true)} id="add-blacklist-btn">
            <Plus size={14} /> Add to Blacklist
          </button>
        </PermissionGuard>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20, borderLeft: '4px solid var(--danger, #f44336)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Add to Blacklist</h3>
            <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label><User size={12} /> Visitor Name</label>
                <input value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} placeholder="Full name" />
              </div>
              <div className="form-group">
                <label><CreditCard size={12} /> IC / Passport No.</label>
                <input value={form.visitorIc} onChange={(e) => setForm({ ...form, visitorIc: e.target.value })} placeholder="ID number" />
              </div>
              <div className="form-group">
                <label><Phone size={12} /> Mobile</label>
                <input value={form.visitorMobile} onChange={(e) => setForm({ ...form, visitorMobile: e.target.value })} placeholder="+60..." />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Reason *</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={2}
                required
                placeholder="Why is this visitor being blacklisted?"
                style={{ width: '100%' }}
              />
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
        <div className="loading-inline"><div className="loading-spinner" /> Loading blacklist...</div>
      ) : !items.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <ShieldBan size={40} />
          <p>No blacklist entries found</p>
        </div>
      ) : (
        <>
          <div className="data-table-wrapper">
            <table className="data-table" id="blacklist-table">
              <thead>
                <tr>
                  <th>Visitor Name</th>
                  <th>IC / Passport</th>
                  <th>Mobile</th>
                  <th>Reason</th>
                  <th>Added By</th>
                  <th>Added On</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id} style={{ opacity: entry.isActive ? 1 : 0.5 }}>
                    <td>{entry.visitorName || '—'}</td>
                    <td>{entry.visitorIc || '—'}</td>
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
          </div>
          {meta && meta.total > meta.limit && (
            <div className="pagination" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span className="text-muted" style={{ padding: '6px 12px' }}>Page {meta.page} of {Math.ceil(meta.total / meta.limit)}</span>
              <button className="btn btn-sm" disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
