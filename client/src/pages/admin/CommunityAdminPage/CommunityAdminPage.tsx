import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import { useState, useEffect, useRef } from 'react';
import {
  useGetAdminAnnouncementsQuery, useCreateAnnouncementMutation,
  useGetAdminPollsQuery, useCreatePollMutation,
  useGetAdminComplaintsQuery, useRespondToComplaintMutation,
  useGetAdminMoveRequestsQuery, useApproveMoveRequestMutation,
} from '../../../store/api/communityApi';
import { useGetPropertiesQuery, useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Megaphone, BarChart3, MessageSquareWarning, Truck,
  Plus, X, Pin, Eye, Send, CheckCircle2, Clock, AlertCircle,
  MessageSquare, Loader2, Star, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import '../MaintenancePage/MaintenancePage.css';

type Tab = 'announcements' | 'polls' | 'complaints' | 'moves';

export default function CommunityAdminPage() {
  const [tab, setTab] = useState<Tab>('announcements');

  return (
    <div className="page-content maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Megaphone size={22} /></div>
          <div>
            <h1>Community Management</h1>
            <p>Manage announcements, polls, complaints, and move requests</p>
          </div>
        </div>
      </div>

      <div className="tabs" id="community-admin-tabs">
        <button className={`tab ${tab === 'announcements' ? 'active' : ''}`} onClick={() => setTab('announcements')}>
          <Megaphone size={14} /> Announcements
        </button>
        <button className={`tab ${tab === 'polls' ? 'active' : ''}`} onClick={() => setTab('polls')}>
          <BarChart3 size={14} /> Polls
        </button>
        <button className={`tab ${tab === 'complaints' ? 'active' : ''}`} onClick={() => setTab('complaints')}>
          <MessageSquareWarning size={14} /> Complaints
        </button>
        <button className={`tab ${tab === 'moves' ? 'active' : ''}`} onClick={() => setTab('moves')}>
          <Truck size={14} /> Move Requests
        </button>
      </div>

      <div className="tab-content">
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'polls' && <PollsTab />}
        {tab === 'complaints' && <ComplaintsTab />}
        {tab === 'moves' && <MoveRequestsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ANNOUNCEMENTS TAB
   ═══════════════════════════════════════════ */

const CATEGORIES = ['general', 'maintenance', 'event', 'emergency', 'policy'];
const PRIORITIES = ['normal', 'important', 'urgent'];

function AnnouncementsTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading } = useGetAdminAnnouncementsQuery({
    status: statusFilter || undefined,
    page,
  });
  const [createAnnouncement, { isLoading: creating }] = useCreateAnnouncementMutation();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];
  // /properties requires properties.read, which a community-only role may lack — use the
  // permission-free /properties/my-scope endpoint so the locked field still resolves
  // a name instead of silently rendering as unselected. See useSelectedPropertyId.ts.
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const scopeProperties = scopeData?.data || [];

  // New announcements bind to the sidebar's Active Property; only "All Properties" allows
  // picking one here.
  const activeProperty = useSelectedPropertyFilter();
  const propertyLocked = !!activeProperty;
  const lockedPropertyName = scopeProperties.find((p) => p.id === activeProperty)?.name;

  const [form, setForm] = useState({
    propertyId: '', title: '', content: '', category: 'general', priority: 'normal',
    targetAudience: 'all', isPinned: false, sendPush: true, sendEmail: false,
  });

  // Clears back to "Select property" (or re-locks to the new property) if the sidebar
  // changes while the create form is open.
  const prevPropertyLockedRef = useRef(propertyLocked);
  useEffect(() => {
    if (showForm) {
      if (propertyLocked) {
        if (form.propertyId !== activeProperty) setForm((f) => ({ ...f, propertyId: activeProperty }));
      } else if (prevPropertyLockedRef.current) {
        setForm((f) => ({ ...f, propertyId: '' }));
      }
    }
    prevPropertyLockedRef.current = propertyLocked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyLocked, activeProperty, showForm]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!form.propertyId || !form.title.trim() || !form.content.trim()) return;
    try {
      await createAnnouncement(form).unwrap();
      toast.success('Announcement published');
      setShowForm(false);
      setSubmitted(false);
      setForm({ propertyId: '', title: '', content: '', category: 'general', priority: 'normal', targetAudience: 'all', isPinned: false, sendPush: true, sendEmail: false });
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to create announcement');
    }
  };

  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <div className="section-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="form-select" style={{ width: 160 }}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="expired">Expired</option>
          <option value="archived">Archived</option>
        </select>
        <div style={{ flex: 1 }} />
        <PermissionGuard permission="community-admin.write">
          <button
            className="btn btn-primary"
            onClick={() => { setForm((f) => ({ ...f, propertyId: activeProperty })); setSubmitted(false); setShowForm(true); }}
            id="create-announcement-btn"
          >
            <Plus size={14} /> New Announcement
          </button>
        </PermissionGuard>
      </div>

      {showForm && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Create Announcement</h3>
            <button className="btn-icon" onClick={() => { setShowForm(false); setSubmitted(false); }}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Property *</label>
                <select
                  value={form.propertyId}
                  disabled={propertyLocked}
                  onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                  className={`form-select ${submitted && !form.propertyId ? 'maint-input-error' : ''}`}
                >
                  {propertyLocked ? (
                    <option value={form.propertyId}>{lockedPropertyName || 'Loading…'}</option>
                  ) : (
                    <>
                      <option value="">Select property...</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </>
                  )}
                </select>
                {submitted && !form.propertyId && <span className="maint-error-text">Property is required</span>}
              </div>
              <div className="form-group">
                <label>Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={submitted && !form.title.trim() ? 'maint-input-error' : ''}
                />
                {submitted && !form.title.trim() && <span className="maint-error-text">Title is required</span>}
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Content *</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={4}
                style={{ width: '100%' }}
                className={submitted && !form.content.trim() ? 'maint-input-error' : ''}
              />
              {submitted && !form.content.trim() && <span className="maint-error-text">Content is required</span>}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} /> Pin to top
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.sendPush} onChange={(e) => setForm({ ...form, sendPush: e.target.checked })} /> Send push
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} /> Send email
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setSubmitted(false); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <><Loader2 size={14} className="spin" /> Publishing...</> : <><Send size={14} /> Publish</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : !items.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Megaphone size={40} />
          <p>No announcements found</p>
        </div>
      ) : (
        <div className="maint-table-wrap">
          <TableScrollWrapper>
            <table className="maint-table" id="admin-announcements-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Property</th>
                  <th>Status</th>
                  <th>Views</th>
                  <th>Reads</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {a.isPinned && <Pin size={12} className="text-warning" />}
                        <span>{a.title}</span>
                      </div>
                    </td>
                    <td><span className={`badge badge-${a.category}`}>{a.category}</span></td>
                    <td><span className={`badge badge-${a.priority === 'urgent' ? 'danger' : a.priority === 'important' ? 'warning' : 'default'}`}>{a.priority}</span></td>
                    <td>{a.property?.name || '—'}</td>
                    <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                    <td><Eye size={12} /> {a.viewCount || 0}</td>
                    <td>{a._count?.reads || 0}</td>
                    <td>{a.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollWrapper>
          {meta && meta.total >= 10 && (
            <div className="maint-pagination">
              <div className="maint-pagination-left">
                <span>Rows per page: {meta.limit}</span>
              </div>
              <div className="maint-pagination-right">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
                <span className="maint-page-info">Page {meta.page} of {Math.max(1, Math.ceil(meta.total / meta.limit))}</span>
                <button disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   POLLS TAB
   ═══════════════════════════════════════════ */

function PollsTab() {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { data, isLoading } = useGetAdminPollsQuery({ page });
  const [createPoll, { isLoading: creating }] = useCreatePollMutation();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];
  // /properties requires properties.read, which a community-only role may lack — use the
  // permission-free /properties/my-scope endpoint so the locked field still resolves
  // a name instead of silently rendering as unselected. See useSelectedPropertyId.ts.
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const scopeProperties = scopeData?.data || [];

  // New polls bind to the sidebar's Active Property; only "All Properties" allows
  // picking one here.
  const activeProperty = useSelectedPropertyFilter();
  const propertyLocked = !!activeProperty;
  const lockedPropertyName = scopeProperties.find((p) => p.id === activeProperty)?.name;

  const [form, setForm] = useState({
    propertyId: '', title: '', description: '', pollType: 'single',
    startAt: '', endAt: '', isAnonymous: true,
    options: [{ id: 'opt-1', text: '' }, { id: 'opt-2', text: '' }],
  });

  // Clears back to "Select property" (or re-locks to the new property) if the sidebar
  // changes while the create form is open.
  const prevPropertyLockedRef = useRef(propertyLocked);
  useEffect(() => {
    if (showForm) {
      if (propertyLocked) {
        if (form.propertyId !== activeProperty) setForm((f) => ({ ...f, propertyId: activeProperty }));
      } else if (prevPropertyLockedRef.current) {
        setForm((f) => ({ ...f, propertyId: '' }));
      }
    }
    prevPropertyLockedRef.current = propertyLocked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyLocked, activeProperty, showForm]);

  const addOption = () => {
    setForm({ ...form, options: [...form.options, { id: `opt-${form.options.length + 1}`, text: '' }] });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const validOptions = form.options.filter(o => o.text.trim());
    if (!form.propertyId || !form.title.trim() || !form.startAt || !form.endAt || validOptions.length < 2) return;
    try {
      await createPoll({ ...form, options: validOptions }).unwrap();
      toast.success('Poll created');
      setShowForm(false);
      setSubmitted(false);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to create poll');
    }
  };

  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <div className="section-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <PermissionGuard permission="community-admin.write">
          <button
            className="btn btn-primary"
            onClick={() => { setForm((f) => ({ ...f, propertyId: activeProperty })); setSubmitted(false); setShowForm(true); }}
            id="create-poll-btn"
          >
            <Plus size={14} /> New Poll
          </button>
        </PermissionGuard>
      </div>

      {showForm && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Create Poll</h3>
            <button className="btn-icon" onClick={() => { setShowForm(false); setSubmitted(false); }}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Property *</label>
                <select
                  value={form.propertyId}
                  disabled={propertyLocked}
                  onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                  className={`form-select ${submitted && !form.propertyId ? 'maint-input-error' : ''}`}
                >
                  {propertyLocked ? (
                    <option value={form.propertyId}>{lockedPropertyName || 'Loading…'}</option>
                  ) : (
                    <>
                      <option value="">Select property...</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </>
                  )}
                </select>
                {submitted && !form.propertyId && <span className="maint-error-text">Property is required</span>}
              </div>
              <div className="form-group">
                <label>Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={submitted && !form.title.trim() ? 'maint-input-error' : ''}
                />
                {submitted && !form.title.trim() && <span className="maint-error-text">Title is required</span>}
              </div>
              <div className="form-group">
                <label>Start Date *</label>
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                  className={submitted && !form.startAt ? 'maint-input-error' : ''}
                />
                {submitted && !form.startAt && <span className="maint-error-text">Start date is required</span>}
              </div>
              <div className="form-group">
                <label>End Date *</label>
                <input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                  className={submitted && !form.endAt ? 'maint-input-error' : ''}
                />
                {submitted && !form.endAt && <span className="maint-error-text">End date is required</span>}
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Options *</label>
              {form.options.map((opt, i) => (
                <div key={opt.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className={`input-full ${submitted && form.options.filter(o => o.text.trim()).length < 2 && !opt.text.trim() ? 'maint-input-error' : ''}`}
                    value={opt.text}
                    onChange={(e) => {
                      const opts = [...form.options];
                      opts[i] = { ...opts[i], text: e.target.value };
                      setForm({ ...form, options: opts });
                    }}
                    placeholder={`Option ${i + 1}`}
                    style={{ flex: 1 }}
                  />
                  {form.options.length > 2 && (
                    <button type="button" className="btn-danger" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {submitted && form.options.filter(o => o.text.trim()).length < 2 && (
                <span className="maint-error-text" style={{ display: 'block', marginBottom: 8 }}>At least 2 options are required</span>
              )}
              <button type="button" className="btn btn-sm" onClick={addOption}><Plus size={12} /> Add Option</button>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} /> Anonymous voting
              </label>
              <select value={form.pollType} onChange={(e) => setForm({ ...form, pollType: e.target.value })} className="form-select" style={{ width: 160 }}>
                <option value="single">Single choice</option>
                <option value="multiple">Multiple choice</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setSubmitted(false); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <><Loader2 size={14} className="spin" /> Creating...</> : <><BarChart3 size={14} /> Create Poll</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : !items.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <BarChart3 size={40} />
          <p>No polls found</p>
        </div>
      ) : (
        <div className="maint-table-wrap">
          <TableScrollWrapper>
            <table className="maint-table" id="admin-polls-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Options</th>
                  <th>Votes</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p: any) => {
                  const now = new Date();
                  const isEnded = now > new Date(p.endAt);
                  const isActive = now >= new Date(p.startAt) && !isEnded;
                  return (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td>{p.property?.name || '—'}</td>
                      <td>{p.pollType}</td>
                      <td>{Array.isArray(p.options) ? p.options.length : 0}</td>
                      <td>{p._count?.votes || 0}</td>
                      <td>{new Date(p.startAt).toLocaleDateString()}</td>
                      <td>{new Date(p.endAt).toLocaleDateString()}</td>
                      <td>
                        {isEnded ? (
                          <span className="status-badge status-closed">Ended</span>
                        ) : isActive ? (
                          <span className="status-badge status-active">Active</span>
                        ) : (
                          <span className="status-badge status-pending">Upcoming</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollWrapper>
          {meta && meta.total >= 10 && (
            <div className="maint-pagination">
              <div className="maint-pagination-left">
                <span>Rows per page: {meta.limit}</span>
              </div>
              <div className="maint-pagination-right">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
                <span className="maint-page-info">Page {meta.page} of {Math.max(1, Math.ceil(meta.total / meta.limit))}</span>
                <button disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   COMPLAINTS TAB
   ═══════════════════════════════════════════ */

const STATUS_OPTIONS = ['open', 'in_review', 'resolved', 'closed'];
const COMPLAINT_CATS: Record<string, string> = {
  noise: 'Noise', cleanliness: 'Cleanliness', neighbor: 'Neighbor',
  management: 'Management', facility: 'Facility', other: 'Other',
};

function ComplaintsTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [respondSubmitted, setRespondSubmitted] = useState(false);

  const { data, isLoading } = useGetAdminComplaintsQuery({
    status: statusFilter || undefined,
    page,
  });
  const [respondToComplaint, { isLoading: responding }] = useRespondToComplaintMutation();

  const handleRespond = async () => {
    setRespondSubmitted(true);
    if (!respondingId || !responseText.trim()) return;
    try {
      await respondToComplaint({ id: respondingId, response: responseText }).unwrap();
      toast.success('Response sent');
      setRespondingId(null);
      setResponseText('');
      setRespondSubmitted(false);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to respond');
    }
  };

  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <div className="section-toolbar" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="form-select" style={{ width: 160 }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
        </select>
      </div>

      {/* Respond Modal */}
      {respondingId && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20, borderLeft: '4px solid var(--primary)' }}>
          <h3 style={{ margin: '0 0 12px' }}>Respond to Complaint</h3>
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            rows={3}
            placeholder="Enter your response to the complainant..."
            style={{ width: '100%', marginBottom: 4 }}
            className={respondSubmitted && !responseText.trim() ? 'maint-input-error' : ''}
          />
          {respondSubmitted && !responseText.trim() && (
            <span className="maint-error-text" style={{ display: 'block', marginBottom: 8 }}>Response is required</span>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn" onClick={() => { setRespondingId(null); setResponseText(''); setRespondSubmitted(false); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRespond} disabled={responding}>
              {responding ? <><Loader2 size={14} className="spin" /> Sending...</> : <><MessageSquare size={14} /> Send Response</>}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : !items.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <MessageSquareWarning size={40} />
          <p>No complaints found</p>
        </div>
      ) : (
        <div className="maint-table-wrap">
          <TableScrollWrapper>
            <table className="maint-table" id="admin-complaints-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Submitted By</th>
                  <th>Unit</th>
                  <th>Property</th>
                  <th>Status</th>
                  <th>Rating</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c: any) => (
                  <tr key={c.id}>
                    <td title={c.description}>{c.title}</td>
                    <td><span className="badge">{COMPLAINT_CATS[c.category] || c.category}</span></td>
                    <td>
                      {c.isAnonymous ? (
                        <span className="text-muted">Anonymous</span>
                      ) : (
                        c.resident ? `${c.resident.firstName} ${c.resident.lastName}` : '—'
                      )}
                    </td>
                    <td>{c.unit?.unitNumber || '—'}</td>
                    <td>{c.property?.name || '—'}</td>
                    <td>
                      <span className={`status-badge status-${c.status}`}>
                        {c.status === 'open' && <AlertCircle size={10} />}
                        {c.status === 'resolved' && <CheckCircle2 size={10} />}
                        {c.status === 'in_review' && <Clock size={10} />}
                        {' '}{c.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {c.satisfactionScore ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Star size={12} className="text-warning" /> {c.satisfactionScore}/5
                        </span>
                      ) : '—'}
                    </td>
                    <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td>
                      {['open', 'in_review'].includes(c.status) && (
                        <PermissionGuard permission="community-admin.write">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => { setRespondingId(c.id); setResponseText(''); setRespondSubmitted(false); }}
                          >
                            <MessageSquare size={12} /> Respond
                          </button>
                        </PermissionGuard>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollWrapper>
          {meta && meta.total >= 10 && (
            <div className="maint-pagination">
              <div className="maint-pagination-left">
                <span>Rows per page: {meta.limit}</span>
              </div>
              <div className="maint-pagination-right">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
                <span className="maint-page-info">Page {meta.page} of {Math.max(1, Math.ceil(meta.total / meta.limit))}</span>
                <button disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   MOVE REQUESTS TAB
   ═══════════════════════════════════════════ */

function MoveRequestsTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const { data: items, isLoading } = useGetAdminMoveRequestsQuery({
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  });
  const [approveMoveRequest, { isLoading: approving }] = useApproveMoveRequestMutation();

  const handleApprove = async (id: string) => {
    const notes = window.prompt('Add any notes for the approval (optional):');
    try {
      await approveMoveRequest({ id, notes: notes || undefined }).unwrap();
      toast.success('Move request approved');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to approve');
    }
  };

  return (
    <>
      <div className="section-toolbar" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-select" style={{ width: 160 }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="form-select" style={{ width: 160 }}>
          <option value="">All Types</option>
          <option value="move_in">Move In</option>
          <option value="move_out">Move Out</option>
        </select>
      </div>

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : !items?.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Truck size={40} />
          <p>No move requests found</p>
        </div>
      ) : (
        <div className="maint-table-wrap">
          <TableScrollWrapper>
            <table className="maint-table" id="admin-move-requests-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Resident</th>
                  <th>Unit</th>
                  <th>Property</th>
                  <th>Requested Date</th>
                  <th>Preferred Time</th>
                  <th>Deposit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m: any) => (
                  <tr key={m.id}>
                    <td>
                      <span className={`badge badge-${m.requestType === 'move_in' ? 'success' : 'warning'}`}>
                        {m.requestType === 'move_in' ? '↓ Move In' : '↑ Move Out'}
                      </span>
                    </td>
                    <td>{m.resident ? `${m.resident.firstName} ${m.resident.lastName}` : '—'}</td>
                    <td>{m.unit?.unitNumber || '—'}</td>
                    <td>{m.property?.name || '—'}</td>
                    <td>{new Date(m.requestedDate).toLocaleDateString()}</td>
                    <td>{m.preferredTime || '—'}</td>
                    <td>
                      {m.depositAmount ? (
                        <span>{Number(m.depositAmount).toLocaleString()} {m.depositPaid ? '✓ Paid' : '⏳'}</span>
                      ) : '—'}
                    </td>
                    <td><span className={`status-badge status-${m.status}`}>{m.status}</span></td>
                    <td>
                      {m.status === 'pending' && (
                        <PermissionGuard permission="community-admin.write">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleApprove(m.id)}
                            disabled={approving}
                          >
                            <CheckCircle2 size={12} /> Approve
                          </button>
                        </PermissionGuard>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollWrapper>
        </div>
      )}
    </>
  );
}
