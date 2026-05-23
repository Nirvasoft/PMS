import { useGetPortalLeaseQuery, useGetPortalLeaseDocumentsQuery } from '../../store/api/portalApi';
import {
  FileText, CalendarDays, DollarSign, TrendingUp,
  Shield, Download, Clock, CheckCircle2,
} from 'lucide-react';

export default function PortalLease() {
  const { data: lease, isLoading, error } = useGetPortalLeaseQuery();
  const { data: documents } = useGetPortalLeaseDocumentsQuery();

  if (isLoading) {
    return (
      <div className="page-content portal-page">
        <div className="loading-inline"><div className="loading-spinner" /> Loading lease details...</div>
      </div>
    );
  }

  if (error || !lease) {
    return (
      <div className="page-content portal-page">
        <div className="page-header"><h1>My Lease</h1></div>
        <div className="portal-card-empty" style={{ padding: '40px' }}>
          <FileText size={40} style={{ opacity: 0.3 }} />
          <p>No active lease found</p>
        </div>
      </div>
    );
  }

  // Lease progress
  const start = new Date(lease.startDate).getTime();
  const end = new Date(lease.endDate).getTime();
  const now = Date.now();
  const leaseProgress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  return (
    <div className="page-content portal-page">
      <div className="page-header">
        <h1>My Lease</h1>
        <p className="page-subtitle">{lease.leaseNumber}</p>
      </div>

      {/* Lease Highlights */}
      <div className="portal-lease-highlights" id="portal-lease-highlights">
        <div className="portal-highlight-card">
          <div className="portal-highlight-icon"><CalendarDays size={20} /></div>
          <div className="portal-highlight-info">
            <span className="portal-highlight-label">Lease Period</span>
            <span className="portal-highlight-value">
              {new Date(lease.startDate).toLocaleDateString()} — {new Date(lease.endDate).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="portal-highlight-card">
          <div className="portal-highlight-icon"><DollarSign size={20} /></div>
          <div className="portal-highlight-info">
            <span className="portal-highlight-label">Monthly Rent</span>
            <span className="portal-highlight-value">
              {lease.currency} {Number(lease.rentAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="portal-highlight-card">
          <div className="portal-highlight-icon"><Shield size={20} /></div>
          <div className="portal-highlight-info">
            <span className="portal-highlight-label">Security Deposit</span>
            <span className="portal-highlight-value">
              {lease.currency} {Number(lease.securityDeposit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              {lease.depositPaid && <CheckCircle2 size={14} style={{ marginLeft: 6, color: 'var(--success)' }} />}
            </span>
          </div>
        </div>
        <div className="portal-highlight-card">
          <div className="portal-highlight-icon"><Clock size={20} /></div>
          <div className="portal-highlight-info">
            <span className="portal-highlight-label">Status</span>
            <span className={`portal-status-badge status-${lease.status}`}>{lease.status}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="portal-card" style={{ marginBottom: 24 }}>
        <div className="portal-card-header">
          <TrendingUp size={18} />
          <h3>Lease Progress</h3>
        </div>
        <div className="portal-lease-progress-wrap" style={{ padding: '0 0 4px' }}>
          <div className="portal-lease-progress-bar large">
            <div className="portal-lease-progress-fill" style={{ width: `${leaseProgress}%` }} />
          </div>
          <div className="portal-lease-progress-labels">
            <span>{new Date(lease.startDate).toLocaleDateString()}</span>
            <span className="portal-lease-progress-text">
              {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expired'}
            </span>
            <span>{new Date(lease.endDate).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Escalation Schedule */}
      {lease.escalationSchedule?.length > 0 && (
        <div className="portal-card" style={{ marginBottom: 24 }}>
          <div className="portal-card-header">
            <TrendingUp size={18} />
            <h3>Rent Escalation Schedule</h3>
          </div>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Effective Date</th>
                <th>New Rent</th>
                <th>Increase</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lease.escalationSchedule.map((e: any, i: number) => (
                <tr key={i}>
                  <td>{new Date(e.effectiveDate).toLocaleDateString()}</td>
                  <td>{lease.currency} {Number(e.newRentAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>
                    {e.increaseType === 'percentage'
                      ? `${Number(e.increaseValue)}%`
                      : `${lease.currency} ${Number(e.increaseValue).toLocaleString()}`}
                  </td>
                  <td>
                    <span className={`portal-status-badge ${e.status === 'applied' ? 'status-paid' : 'status-issued'}`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Special Conditions */}
      {lease.specialConditions && (
        <div className="portal-card" style={{ marginBottom: 24 }}>
          <div className="portal-card-header">
            <FileText size={18} />
            <h3>Special Conditions</h3>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {lease.specialConditions}
          </p>
        </div>
      )}

      {/* Lease Documents */}
      <div className="portal-card" id="portal-lease-documents">
        <div className="portal-card-header">
          <FileText size={18} />
          <h3>Lease Documents</h3>
        </div>
        {!documents?.length ? (
          <div className="portal-card-empty">
            <p>No documents available</p>
          </div>
        ) : (
          <div className="portal-doc-list">
            {documents.map((d: any) => (
              <div key={d.id} className="portal-doc-item">
                <FileText size={16} />
                <div className="portal-doc-info">
                  <span className="portal-doc-name">{d.originalName}</span>
                  <span className="portal-doc-meta">
                    {(d.fileSize / 1024).toFixed(0)} KB · {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button className="btn btn-sm"><Download size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
