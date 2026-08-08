import { useState } from 'react';
import {
  useGetAdminAnnouncementsQuery, useCreateAnnouncementMutation,
  useGetAdminPollsQuery, useCreatePollMutation,
  useGetAdminComplaintsQuery, useRespondToComplaintMutation,
  useGetAdminMoveRequestsQuery, useApproveMoveRequestMutation,
} from '../../../store/api/communityApi';
import {
  Megaphone, BarChart3, MessageSquareWarning, Truck,
  Plus, X, Pin, Eye, Send, CheckCircle2, Clock, AlertCircle,
  MessageSquare, Loader2, Star,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Tab = 'announcements' | 'polls' | 'complaints' | 'moves';

export default function CommunityAdminPage() {
  const [tab, setTab] = useState<Tab>('announcements');

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><Megaphone size={24} /> Community Management</h1>
        <p className="text-muted">Manage announcements, polls, complaints, and move requests</p>
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

  const { data, isLoading } = useGetAdminAnnouncementsQuery({
    status: statusFilter || undefined,
    page,
  });
  const [createAnnouncement, { isLoading: creating }] = useCreateAnnouncementMutation();

  const [form, setForm] = useState({
    propertyId: '', title: '', content: '', category: 'general', priority: 'normal',
    targetAudience: 'all', isPinned: false, sendPush: true, sendEmail: false,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.propertyId) { toast.error('Select a property'); return; }
    try {
      await createAnnouncement(form).unwrap();
      toast.success('Announcement published');
      setShowForm(false);
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
        <button className="btn btn-primary" onClick={() => setShowForm(true)} id="create-announcement-btn">
          <Plus size={14} /> New Announcement
        </button>
      </div>

      {showForm && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Create Announcement</h3>
            <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Property ID *</label>
                <input value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} placeholder="Property UUID" required />
              </div>
              <div className="form-group">
                <label>Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
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
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} required style={{ width: '100%' }} />
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
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <><Loader2 size={14} className="spin" /> Publishing...</> : <><Send size={14} /> Publish</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading announcements...</div>
      ) : !items.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Megaphone size={40} />
          <p>No announcements found</p>
        </div>
      ) : (
        <>
          <div className="data-table-wrapper">
            <table className="data-table" id="admin-announcements-table">
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
    </>
  );
}

/* ═══════════════════════════════════════════
   POLLS TAB
   ═══════════════════════════════════════════ */

function PollsTab() {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = useGetAdminPollsQuery({ page });
  const [createPoll, { isLoading: creating }] = useCreatePollMutation();

  const [form, setForm] = useState({
    propertyId: '', title: '', description: '', pollType: 'single',
    startAt: '', endAt: '', isAnonymous: true,
    options: [{ id: 'opt-1', text: '' }, { id: 'opt-2', text: '' }],
  });

  const addOption = () => {
    setForm({ ...form, options: [...form.options, { id: `opt-${form.options.length + 1}`, text: '' }] });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.propertyId) { toast.error('Select a property'); return; }
    const validOptions = form.options.filter(o => o.text.trim());
    if (validOptions.length < 2) { toast.error('At least 2 options required'); return; }
    try {
      await createPoll({ ...form, options: validOptions }).unwrap();
      toast.success('Poll created');
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to create poll');
    }
  };

  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <div className="section-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} id="create-poll-btn">
          <Plus size={14} /> New Poll
        </button>
      </div>

      {showForm && (
        <div className="info-card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Create Poll</h3>
            <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Property ID *</label>
                <input value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} placeholder="Property UUID" required />
              </div>
              <div className="form-group">
                <label>Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Start Date *</label>
                <input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>End Date *</label>
                <input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} required />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ width: '100%' }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Options</label>
              {form.options.map((opt, i) => (
                <div key={opt.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
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
                    <button type="button" className="btn-icon btn-danger" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-sm" onClick={addOption}><Plus size={12} /> Add Option</button>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} /> Anonymous voting
              </label>
              <select value={form.pollType} onChange={(e) => setForm({ ...form, pollType: e.target.value })} style={{ width: 160 }}>
                <option value="single">Single choice</option>
                <option value="multiple">Multiple choice</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <><Loader2 size={14} className="spin" /> Creating...</> : <><BarChart3 size={14} /> Create Poll</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading polls...</div>
      ) : !items.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <BarChart3 size={40} />
          <p>No polls found</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" id="admin-polls-table">
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

  const { data, isLoading } = useGetAdminComplaintsQuery({
    status: statusFilter || undefined,
    page,
  });
  const [respondToComplaint, { isLoading: responding }] = useRespondToComplaintMutation();

  const handleRespond = async () => {
    if (!respondingId || !responseText.trim()) return;
    try {
      await respondToComplaint({ id: respondingId, response: responseText }).unwrap();
      toast.success('Response sent');
      setRespondingId(null);
      setResponseText('');
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
            style={{ width: '100%', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => { setRespondingId(null); setResponseText(''); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRespond} disabled={responding || !responseText.trim()}>
              {responding ? <><Loader2 size={14} className="spin" /> Sending...</> : <><MessageSquare size={14} /> Send Response</>}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading complaints...</div>
      ) : !items.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <MessageSquareWarning size={40} />
          <p>No complaints found</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" id="admin-complaints-table">
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
                <th>Actions</th>
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
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => { setRespondingId(c.id); setResponseText(''); }}
                      >
                        <MessageSquare size={12} /> Respond
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.total > meta.limit && (
        <div className="pagination" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="text-muted" style={{ padding: '6px 12px' }}>Page {meta.page} of {Math.ceil(meta.total / meta.limit)}</span>
          <button className="btn btn-sm" disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}>Next</button>
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
        <div className="loading-inline"><div className="loading-spinner" /> Loading move requests...</div>
      ) : !items?.length ? (
        <div className="info-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Truck size={40} />
          <p>No move requests found</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" id="admin-move-requests-table">
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
                <th>Actions</th>
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
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleApprove(m.id)}
                        disabled={approving}
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
