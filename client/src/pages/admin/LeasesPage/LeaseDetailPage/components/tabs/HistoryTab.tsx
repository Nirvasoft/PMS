import { Clock } from 'lucide-react';
import { type LeaseDetail } from '../../../../../../store/api/leasesApi';

export function HistoryTab({ lease }: { lease: LeaseDetail }) {
  const events = [];
  
  if (lease.createdAt) {
    events.push({ date: lease.createdAt, label: 'Lease Draft Created', user: lease.creator?.email || 'System' });
  }
  if (lease.approvedAt) {
    events.push({ date: lease.approvedAt, label: 'Lease Approved', user: lease.approver?.email || 'System' });
  }
  if (lease.activatedAt) {
    events.push({ date: lease.activatedAt, label: 'Lease Activated', user: 'System' });
  }
  if (lease.esignCompletedAt) {
    events.push({ date: lease.esignCompletedAt, label: 'E-Signature Completed', user: 'System' });
  }
  if (lease.terminationDate) {
    events.push({ date: lease.terminationDate, label: 'Lease Terminated', user: 'System' });
  }

  // Sort by date descending
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="tab-panel">
      <div className="history-timeline">
        {events.length === 0 ? (
          <div className="empty-state">
            <Clock size={36} />
            <p>No history available</p>
          </div>
        ) : (
          events.map((e, i) => (
            <div key={i} className="timeline-item">
              <div className="tl-dot"></div>
              <div className="tl-content">
                <div className="tl-header">
                  <strong>{e.label}</strong>
                  <span className="tl-date">{new Date(e.date).toLocaleString()}</span>
                </div>
                <div className="tl-user">By: {e.user}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
