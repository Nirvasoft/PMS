import { useState } from 'react';
import { useGetMoveRequestsQuery, useSubmitMoveRequestMutation } from '../../store/api/communityApi';
import toast from 'react-hot-toast';
import {
  Truck, ArrowRightCircle, ArrowLeftCircle, Clock, CheckCircle2,
  XCircle, CalendarDays, DollarSign,
} from 'lucide-react';

const STATUS_CFG: Record<string, { color: string; icon: any }> = {
  pending: { color: 'var(--warning)', icon: Clock },
  approved: { color: 'var(--success)', icon: CheckCircle2 },
  rejected: { color: 'var(--danger)', icon: XCircle },
  completed: { color: 'var(--primary)', icon: CheckCircle2 },
  cancelled: { color: 'var(--text-muted)', icon: XCircle },
};

export default function PortalMoveRequests() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    requestType: 'move_in', requestedDate: '', preferredTime: '',
    depositAmount: '', notes: '',
  });

  const { data: requests, isLoading } = useGetMoveRequestsQuery();
  const [submitRequest, { isLoading: isSubmitting }] = useSubmitMoveRequestMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitRequest({
        requestType: form.requestType,
        requestedDate: form.requestedDate,
        preferredTime: form.preferredTime || undefined,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
        notes: form.notes || undefined,
      }).unwrap();
      toast.success('Move request submitted');
      setShowForm(false);
      setForm({ requestType: 'move_in', requestedDate: '', preferredTime: '', depositAmount: '', notes: '' });
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to submit');
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="page-content portal-page">
      <div className="portal-page-header">
        <div>
          <h1>Move Requests</h1>
          <p className="text-muted">Request move-in or move-out scheduling</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Truck size={16} /> New Request
        </button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <div className="portal-card portal-form-card">
          <h3>Submit Move Request</h3>
          <form onSubmit={handleSubmit} className="portal-form-grid">
            <div className="form-group">
              <label>Request Type *</label>
              <select value={form.requestType}
                onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}>
                <option value="move_in">Move In</option>
                <option value="move_out">Move Out</option>
              </select>
            </div>
            <div className="form-group">
              <label>Requested Date *</label>
              <input type="date" required value={form.requestedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setForm(f => ({ ...f, requestedDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Preferred Time</label>
              <input type="time" value={form.preferredTime}
                onChange={e => setForm(f => ({ ...f, preferredTime: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Deposit Amount</label>
              <input type="number" step="0.01" min="0" value={form.depositAmount}
                onChange={e => setForm(f => ({ ...f, depositAmount: e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea rows={3} value={form.notes} maxLength={1000}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="E.g., Have 2 large sofas and a piano — will need extra time" />
            </div>
            <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Request List */}
      {isLoading ? (
        <div className="portal-loading">Loading requests...</div>
      ) : (requests || []).length === 0 ? (
        <div className="portal-empty">
          <Truck size={48} strokeWidth={1} />
          <p>No move requests</p>
        </div>
      ) : (
        <div className="portal-move-requests-list">
          {(requests || []).map((r: any) => {
            const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
            const StatusIcon = cfg.icon;
            const TypeIcon = r.requestType === 'move_in' ? ArrowRightCircle : ArrowLeftCircle;
            return (
              <div key={r.id} className="portal-move-request-card">
                <div className="portal-move-request-header">
                  <div className="portal-move-type">
                    <TypeIcon size={20} color={r.requestType === 'move_in' ? 'var(--success)' : 'var(--warning)'} />
                    <h4>{r.requestType === 'move_in' ? 'Move In' : 'Move Out'}</h4>
                  </div>
                  <span className="portal-status-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
                    <StatusIcon size={12} /> {r.status}
                  </span>
                </div>
                <div className="portal-move-request-details">
                  <span><CalendarDays size={13} /> {fmtDate(r.requestedDate)}</span>
                  {r.preferredTime && <span><Clock size={13} /> {r.preferredTime}</span>}
                  {r.depositAmount && <span><DollarSign size={13} /> Deposit: {r.depositAmount}</span>}
                </div>
                {r.notes && <p className="portal-move-notes">{r.notes}</p>}
                {r.approvedAt && (
                  <div className="portal-move-approved">
                    <CheckCircle2 size={13} /> Approved on {fmtDate(r.approvedAt)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
