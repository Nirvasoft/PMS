import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useGetPortalMaintenanceTicketsQuery,
  useSubmitPortalMaintenanceMutation,
  useRatePortalTicketMutation,
} from '../../store/api/portalApi';
import toast from 'react-hot-toast';
import {
  Wrench, Plus, X, Send, Star, Clock, CheckCircle2,
  AlertTriangle, ChevronRight, Camera,
} from 'lucide-react';

const PRIORITY_LABELS: Record<string, string> = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

function statusColor(status: string): string {
  switch (status) {
    case 'open': return 'status-issued';
    case 'assigned':
    case 'in_progress': return 'status-sent';
    case 'on_hold': return 'status-partially-paid';
    case 'resolved':
    case 'closed': return 'status-paid';
    case 'cancelled': return 'status-overdue';
    default: return '';
  }
}

export default function PortalMaintenance() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(!!(location.state as any)?.showForm);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [ratingTicket, setRatingTicket] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const [locationDetail, setLocationDetail] = useState('');

  const { data: tickets, isLoading } = useGetPortalMaintenanceTicketsQuery();
  const [submitRequest, { isLoading: submitting }] = useSubmitPortalMaintenanceMutation();
  const [rateTicket, { isLoading: rating }] = useRatePortalTicketMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitRequest({ title, description, priority, locationDetail }).unwrap();
      toast.success('Maintenance request submitted!');
      setShowForm(false);
      setTitle('');
      setDescription('');
      setPriority('P3');
      setLocationDetail('');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to submit request');
    }
  };

  const handleRate = async () => {
    if (!ratingTicket || ratingValue === 0) return;
    try {
      await rateTicket({ id: ratingTicket, rating: ratingValue, comment: ratingComment }).unwrap();
      toast.success('Thank you for your feedback!');
      setRatingTicket(null);
      setRatingValue(0);
      setRatingComment('');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to submit rating');
    }
  };

  return (
    <div className="page-content portal-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Maintenance Requests</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)} id="portal-new-request-btn">
            <Plus size={16} /> New Request
          </button>
        )}
      </div>

      {/* Submit Form */}
      {showForm && (
        <div className="portal-card portal-maint-form" id="portal-maintenance-form">
          <div className="portal-card-header">
            <Wrench size={18} />
            <h3>Submit Maintenance Request</h3>
            <button className="btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="portal-form">
            <div className="form-group">
              <label>Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., AC not cooling in bedroom" required />
            </div>
            <div className="form-group">
              <label>Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe the issue in detail..." required />
            </div>
            <div className="portal-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="P1">P1 — Critical</option>
                  <option value="P2">P2 — High</option>
                  <option value="P3">P3 — Medium</option>
                  <option value="P4">P4 — Low</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Location</label>
                <input value={locationDetail} onChange={e => setLocationDetail(e.target.value)} placeholder="e.g., Master bedroom" />
              </div>
            </div>
            <div className="portal-form-actions">
              <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting || !title || !description}>
                <Send size={14} /> {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ticket List */}
      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading tickets...</div>
      ) : !tickets?.length ? (
        <div className="portal-card-empty" style={{ padding: '40px' }}>
          <Wrench size={40} style={{ opacity: 0.3 }} />
          <p>No maintenance requests yet</p>
          <button className="btn btn-sm btn-primary" onClick={() => setShowForm(true)}>
            Submit Your First Request
          </button>
        </div>
      ) : (
        <div className="portal-ticket-grid" id="portal-ticket-list">
          {tickets.map((t: any) => (
            <div key={t.id} className="portal-card portal-ticket-card-full">
              <div className="portal-ticket-card-top">
                <div className="portal-ticket-card-info">
                  <div className="portal-ticket-title-row">
                    <span className="portal-ticket-title">{t.title}</span>
                    <span className={`portal-status-badge ${statusColor(t.status)}`}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="portal-ticket-meta-row">
                    <span>{t.ticketNumber}</span>
                    <span className={`portal-priority-badge priority-${t.priority?.toLowerCase()}`}>
                      {PRIORITY_LABELS[t.priority] || t.priority}
                    </span>
                    {t.category?.name && <span>{t.category.name}</span>}
                    <span><Clock size={12} /> {new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                  {t.description && (
                    <p className="portal-ticket-desc">{t.description.slice(0, 150)}{t.description.length > 150 ? '...' : ''}</p>
                  )}
                </div>
                {t.photos?.length > 0 && (
                  <div className="portal-ticket-photos">
                    {t.photos.slice(0, 3).map((p: any) => (
                      <img key={p.id} src={p.url} alt="" className="portal-ticket-thumb" />
                    ))}
                  </div>
                )}
              </div>
              <div className="portal-ticket-card-bottom">
                {['resolved', 'closed'].includes(t.status) && !t.rating && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setRatingTicket(t.id)}
                  >
                    <Star size={14} /> Rate Service
                  </button>
                )}
                {t.rating && (
                  <div className="portal-ticket-rating">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={14}
                        fill={i < t.rating ? 'var(--warning)' : 'none'}
                        color={i < t.rating ? 'var(--warning)' : 'var(--text-muted)'}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rating Modal */}
      {ratingTicket && (
        <div className="modal-overlay" onClick={() => setRatingTicket(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Rate Maintenance Service</h2>
              <button className="btn-icon" onClick={() => setRatingTicket(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16 }}>How was your maintenance experience?</p>
              <div className="portal-rating-stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button
                    key={i}
                    className="portal-star-btn"
                    onClick={() => setRatingValue(i + 1)}
                  >
                    <Star
                      size={32}
                      fill={i < ratingValue ? 'var(--warning)' : 'none'}
                      color={i < ratingValue ? 'var(--warning)' : 'var(--text-muted)'}
                    />
                  </button>
                ))}
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Comment (optional)</label>
                <textarea
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  rows={3}
                  placeholder="Tell us about your experience..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRatingTicket(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={rating || ratingValue === 0} onClick={handleRate}>
                {rating ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
