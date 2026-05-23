import { useState } from 'react';
import {
  useGetAnnouncementsQuery, useMarkAnnouncementReadMutation,
  useGetPollsQuery, useVotePollMutation,
  useGetComplaintsQuery, useSubmitComplaintMutation, useRateComplaintMutation,
} from '../../store/api/communityApi';
import toast from 'react-hot-toast';
import {
  Megaphone, BarChart3, MessageSquare, Pin, Eye, Bell,
  CheckCircle2, Clock, Star, ChevronDown, ChevronUp, X,
  AlertTriangle, AlertCircle, Info,
} from 'lucide-react';

const PRIORITY_ICON: Record<string, any> = {
  urgent: AlertTriangle,
  important: AlertCircle,
  normal: Info,
};

const CATEGORIES = ['noise', 'cleanliness', 'neighbor', 'management', 'facility', 'other'];

export default function PortalCommunity() {
  const [tab, setTab] = useState<'announcements' | 'polls' | 'complaints'>('announcements');
  const [expandedAnn, setExpandedAnn] = useState<string | null>(null);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [ratingId, setRatingId] = useState<string | null>(null);
  const [ratingScore, setRatingScore] = useState(0);

  const { data: annResult } = useGetAnnouncementsQuery();
  const [markRead] = useMarkAnnouncementReadMutation();
  const { data: polls } = useGetPollsQuery();
  const [votePoll] = useVotePollMutation();
  const { data: complaints } = useGetComplaintsQuery();
  const [submitComplaint, { isLoading: isSubmitting }] = useSubmitComplaintMutation();
  const [rateComplaint] = useRateComplaintMutation();

  const [complaintForm, setComplaintForm] = useState({
    category: 'other', title: '', description: '', isAnonymous: false,
  });
  const [pollSelections, setPollSelections] = useState<Record<string, string[]>>({});

  const handleExpandAnnouncement = (id: string, isRead: boolean) => {
    setExpandedAnn(expandedAnn === id ? null : id);
    if (!isRead) markRead(id);
  };

  const handleVote = async (pollId: string) => {
    const selected = pollSelections[pollId];
    if (!selected?.length) { toast.error('Select an option'); return; }
    try {
      await votePoll({ pollId, optionIds: selected }).unwrap();
      toast.success('Vote submitted!');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to vote');
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitComplaint(complaintForm).unwrap();
      toast.success('Complaint submitted');
      setShowComplaintForm(false);
      setComplaintForm({ category: 'other', title: '', description: '', isAnonymous: false });
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to submit');
    }
  };

  const handleRate = async () => {
    if (!ratingId || !ratingScore) return;
    try {
      await rateComplaint({ id: ratingId, satisfactionScore: ratingScore }).unwrap();
      toast.success('Thank you for your feedback');
      setRatingId(null);
      setRatingScore(0);
    } catch {
      toast.error('Failed to rate');
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const announcements = annResult?.data || [];

  return (
    <div className="page-content portal-page">
      <div className="portal-page-header">
        <div>
          <h1>Community</h1>
          <p className="text-muted">Announcements, polls, and feedback</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="portal-tab-bar">
        <button className={`portal-tab${tab === 'announcements' ? ' active' : ''}`}
          onClick={() => setTab('announcements')}>
          <Megaphone size={16} /> Announcements
        </button>
        <button className={`portal-tab${tab === 'polls' ? ' active' : ''}`}
          onClick={() => setTab('polls')}>
          <BarChart3 size={16} /> Polls
        </button>
        <button className={`portal-tab${tab === 'complaints' ? ' active' : ''}`}
          onClick={() => setTab('complaints')}>
          <MessageSquare size={16} /> Complaints
        </button>
      </div>

      {/* ── Announcements ─────────────────────── */}
      {tab === 'announcements' && (
        <div className="portal-announcements-list">
          {announcements.length === 0 ? (
            <div className="portal-empty">
              <Megaphone size={48} strokeWidth={1} />
              <p>No announcements</p>
            </div>
          ) : (
            announcements.map((a: any) => {
              const PriorityIcon = PRIORITY_ICON[a.priority] || Info;
              const isExpanded = expandedAnn === a.id;
              return (
                <div key={a.id} className={`portal-announcement-card${a.isPinned ? ' pinned' : ''}${!a.isRead ? ' unread' : ''}`}
                  onClick={() => handleExpandAnnouncement(a.id, a.isRead)}>
                  <div className="portal-announcement-header">
                    <div className="portal-announcement-title-row">
                      {a.isPinned && <Pin size={14} className="portal-pin-icon" />}
                      <PriorityIcon size={14} style={{ color: a.priority === 'urgent' ? 'var(--danger)' : a.priority === 'important' ? 'var(--warning)' : 'var(--text-muted)' }} />
                      <h4>{a.title}</h4>
                      {!a.isRead && <span className="portal-unread-dot" />}
                    </div>
                    <div className="portal-announcement-meta">
                      <span className="portal-category-badge">{a.category}</span>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>{fmtDate(a.publishedAt)}</span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                  {!isExpanded && <p className="portal-announcement-preview">{a.preview}</p>}
                  {isExpanded && (
                    <div className="portal-announcement-body" onClick={e => e.stopPropagation()}>
                      <p>{a.content}</p>
                      <div className="portal-announcement-footer">
                        <span className="text-muted"><Eye size={13} /> {a.viewCount} views</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Polls ────────────────────────────── */}
      {tab === 'polls' && (
        <div className="portal-polls-list">
          {(polls || []).length === 0 ? (
            <div className="portal-empty">
              <BarChart3 size={48} strokeWidth={1} />
              <p>No active polls</p>
            </div>
          ) : (
            (polls || []).map((poll: any) => {
              const userVoted = !!poll.userVote;
              const showResults = poll.canViewResults;
              const maxVotes = Math.max(...(poll.options || []).map((o: any) => o.voteCount || 0), 1);
              return (
                <div key={poll.id} className="portal-poll-card">
                  <div className="portal-poll-header">
                    <h4>{poll.title}</h4>
                    <span className={`portal-status-badge${poll.isEnded ? ' ended' : ' active'}`}>
                      {poll.isEnded ? 'Ended' : 'Active'}
                    </span>
                  </div>
                  {poll.description && <p className="text-muted">{poll.description}</p>}

                  <div className="portal-poll-options">
                    {(poll.options || []).map((opt: any) => {
                      const isSelected = pollSelections[poll.id]?.includes(opt.id) || poll.userVote?.includes(opt.id);
                      const pct = showResults && poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0;
                      return (
                        <div key={opt.id} className={`portal-poll-option${isSelected ? ' selected' : ''}`}
                          onClick={() => {
                            if (userVoted || poll.isEnded) return;
                            setPollSelections(prev => {
                              const current = prev[poll.id] || [];
                              if (poll.pollType === 'single') return { ...prev, [poll.id]: [opt.id] };
                              return {
                                ...prev,
                                [poll.id]: current.includes(opt.id)
                                  ? current.filter(x => x !== opt.id)
                                  : [...current, opt.id],
                              };
                            });
                          }}>
                          <span className="portal-poll-option-text">{opt.text}</span>
                          {showResults && (
                            <div className="portal-poll-bar-wrap">
                              <div className="portal-poll-bar" style={{ width: `${pct}%` }} />
                              <span className="portal-poll-pct">{pct}%</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="portal-poll-footer">
                    <span className="text-muted">{poll.totalVotes} votes</span>
                    {!userVoted && !poll.isEnded && (
                      <button className="btn btn-sm btn-primary" disabled={!pollSelections[poll.id]?.length}
                        onClick={() => handleVote(poll.id)}>
                        Vote
                      </button>
                    )}
                    {userVoted && <span className="text-muted"><CheckCircle2 size={13} /> Voted</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Complaints ────────────────────────── */}
      {tab === 'complaints' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <button className="btn btn-primary" onClick={() => setShowComplaintForm(!showComplaintForm)}>
              <MessageSquare size={16} /> Submit Complaint
            </button>
          </div>

          {showComplaintForm && (
            <div className="portal-card portal-form-card">
              <h3>Submit Complaint / Feedback</h3>
              <form onSubmit={handleSubmitComplaint} className="portal-form-grid">
                <div className="form-group">
                  <label>Category *</label>
                  <select value={complaintForm.category}
                    onChange={e => setComplaintForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Title *</label>
                  <input type="text" required value={complaintForm.title}
                    onChange={e => setComplaintForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Description *</label>
                  <textarea rows={4} required value={complaintForm.description}
                    onChange={e => setComplaintForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={complaintForm.isAnonymous}
                      onChange={e => setComplaintForm(f => ({ ...f, isAnonymous: e.target.checked }))} />
                    Submit anonymously
                  </label>
                </div>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowComplaintForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="portal-complaints-list">
            {(complaints || []).length === 0 ? (
              <div className="portal-empty">
                <MessageSquare size={48} strokeWidth={1} />
                <p>No complaints submitted</p>
              </div>
            ) : (
              (complaints || []).map((c: any) => (
                <div key={c.id} className="portal-complaint-card">
                  <div className="portal-complaint-header">
                    <div>
                      <span className="portal-category-badge">{c.category}</span>
                      <h4>{c.title}</h4>
                    </div>
                    <span className={`portal-status-badge status-${c.status}`}>
                      {c.status === 'open' && <Clock size={12} />}
                      {c.status === 'resolved' && <CheckCircle2 size={12} />}
                      {c.status}
                    </span>
                  </div>
                  <p className="portal-complaint-desc">{c.description}</p>
                  {c.response && (
                    <div className="portal-complaint-response">
                      <strong>Response:</strong>
                      <p>{c.response}</p>
                      <span className="text-muted">{fmtDate(c.respondedAt)}</span>
                    </div>
                  )}
                  {c.status === 'resolved' && !c.satisfactionScore && (
                    <button className="btn btn-sm btn-primary" onClick={() => { setRatingId(c.id); setRatingScore(0); }}>
                      <Star size={14} /> Rate Response
                    </button>
                  )}
                  {c.satisfactionScore && (
                    <div className="portal-complaint-rating">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={14}
                          fill={i < c.satisfactionScore ? 'var(--warning)' : 'none'}
                          color={i < c.satisfactionScore ? 'var(--warning)' : 'var(--text-muted)'} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Rating Modal */}
      {ratingId && (
        <div className="modal-backdrop" onClick={() => setRatingId(null)}>
          <div className="modal-content portal-rating-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rate Response</h3>
              <button className="btn-icon" onClick={() => setRatingId(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px' }}>
              <p>How satisfied are you with the response?</p>
              <div className="portal-rating-stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={32} className="portal-star-btn"
                    fill={i < ratingScore ? 'var(--warning)' : 'none'}
                    color={i < ratingScore ? 'var(--warning)' : 'var(--text-muted)'}
                    onClick={() => setRatingScore(i + 1)}
                    style={{ cursor: 'pointer' }} />
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRatingId(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!ratingScore} onClick={handleRate}>Submit Rating</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
