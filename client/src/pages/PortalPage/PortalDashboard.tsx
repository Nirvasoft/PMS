import { useGetPortalDashboardQuery } from '../../store/api/portalApi';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign, CalendarDays, Wrench, AlertTriangle,
  Clock, ChevronRight, Megaphone, TrendingUp,
} from 'lucide-react';

export default function PortalDashboard() {
  const { data, isLoading, error } = useGetPortalDashboardQuery();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="page-content portal-page">
        <div className="loading-inline"><div className="loading-spinner" /> Loading your dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-content portal-page">
        <div className="portal-empty-state">
          <AlertTriangle size={48} />
          <h2>Portal Not Available</h2>
          <p>No active residence found for your account. Please contact your property manager.</p>
        </div>
      </div>
    );
  }

  const { resident, unit, property, lease, invoiceSummary, openTickets } = data;

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Lease progress
  let leaseProgress = 0;
  if (lease) {
    const start = new Date(lease.startDate).getTime();
    const end = new Date(lease.endDate).getTime();
    const now = Date.now();
    leaseProgress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  return (
    <div className="page-content portal-page">
      {/* Welcome Banner */}
      <div className="portal-welcome-banner" id="portal-welcome-banner">
        <div className="portal-welcome-text">
          <h1>{greeting}, {resident.firstName}!</h1>
          <p className="portal-welcome-sub">
            {unit.unitNumber} · {property.name}
          </p>
        </div>
        <div className="portal-welcome-accent" />
      </div>

      {/* Stats Grid */}
      <div className="portal-stats-grid">
        {/* Outstanding Balance */}
        <div
          className="portal-stat-card portal-stat-balance"
          id="portal-outstanding-balance"
          onClick={() => navigate('/portal/invoices')}
        >
          <div className="portal-stat-icon-wrap balance-icon">
            <DollarSign size={22} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-label">Outstanding Balance</span>
            <span className="portal-stat-value">
              {lease?.currency || 'USD'} {invoiceSummary.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            {invoiceSummary.overdueCount > 0 && (
              <span className="portal-stat-alert">
                <AlertTriangle size={12} /> {invoiceSummary.overdueCount} overdue
              </span>
            )}
            {invoiceSummary.nextDueDate && (
              <span className="portal-stat-sub">
                Next due: {new Date(invoiceSummary.nextDueDate).toLocaleDateString()}
              </span>
            )}
          </div>
          <ChevronRight size={16} className="portal-stat-chevron" />
        </div>

        {/* Paid This Month */}
        <div className="portal-stat-card portal-stat-paid">
          <div className="portal-stat-icon-wrap paid-icon">
            <TrendingUp size={22} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-label">Paid This Month</span>
            <span className="portal-stat-value">
              {lease?.currency || 'USD'} {invoiceSummary.paidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Open Tickets */}
        <div
          className="portal-stat-card portal-stat-tickets"
          onClick={() => navigate('/portal/maintenance')}
        >
          <div className="portal-stat-icon-wrap ticket-icon">
            <Wrench size={22} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-label">Open Tickets</span>
            <span className="portal-stat-value">{openTickets.length}</span>
          </div>
          <ChevronRight size={16} className="portal-stat-chevron" />
        </div>
      </div>

      {/* Quick Actions Grid */}
      {data.quickActions && data.quickActions.length > 0 && (
        <div className="portal-quick-actions" id="portal-quick-actions">
          <h3 className="portal-section-title">Quick Actions</h3>
          <div className="portal-quick-actions-grid">
            {data.quickActions.map((qa) => (
              <button
                key={qa.id}
                className="portal-quick-action-btn"
                onClick={() => {
                  if (qa.actionType === 'page' && qa.actionUrl) {
                    navigate(qa.actionUrl);
                  } else if (qa.actionType === 'link' && qa.actionUrl) {
                    window.open(qa.actionUrl, '_blank', 'noopener');
                  }
                }}
              >
                <span className="portal-qa-icon">{qa.icon || '⚡'}</span>
                <span className="portal-qa-label">{qa.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="portal-dashboard-grid">
        {/* Lease Card */}
        {lease && (
          <div className="portal-card portal-lease-summary" id="portal-lease-summary" onClick={() => navigate('/portal/lease')}>
            <div className="portal-card-header">
              <CalendarDays size={18} />
              <h3>Lease Summary</h3>
              <ChevronRight size={16} className="portal-card-chevron" />
            </div>
            <div className="portal-lease-details">
              <div className="portal-lease-row">
                <span className="portal-lease-label">Lease #</span>
                <span className="portal-lease-val">{lease.leaseNumber}</span>
              </div>
              <div className="portal-lease-row">
                <span className="portal-lease-label">Period</span>
                <span className="portal-lease-val">
                  {new Date(lease.startDate).toLocaleDateString()} — {new Date(lease.endDate).toLocaleDateString()}
                </span>
              </div>
              <div className="portal-lease-row">
                <span className="portal-lease-label">Monthly Rent</span>
                <span className="portal-lease-val portal-lease-rent">
                  {lease.currency} {Number(lease.rentAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="portal-lease-progress-wrap">
                <div className="portal-lease-progress-bar">
                  <div className="portal-lease-progress-fill" style={{ width: `${leaseProgress}%` }} />
                </div>
                <span className="portal-lease-progress-text">
                  {lease.daysUntilExpiry != null && lease.daysUntilExpiry > 0
                    ? `${lease.daysUntilExpiry} days remaining`
                    : lease.status === 'active' ? 'Expiring soon' : lease.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Open Tickets List */}
        <div className="portal-card portal-tickets-widget" id="portal-open-tickets">
          <div className="portal-card-header">
            <Wrench size={18} />
            <h3>Open Requests</h3>
            <button className="portal-card-action" onClick={() => navigate('/portal/maintenance')}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          {openTickets.length === 0 ? (
            <div className="portal-card-empty">
              <p>No open maintenance requests</p>
              <button className="btn btn-sm btn-primary" onClick={() => navigate('/portal/maintenance', { state: { showForm: true } })}>
                Submit a Request
              </button>
            </div>
          ) : (
            <div className="portal-ticket-list">
              {openTickets.map((t) => (
                <div key={t.id} className="portal-ticket-item">
                  <div className="portal-ticket-info">
                    <span className="portal-ticket-title">{t.title}</span>
                    <span className="portal-ticket-meta">
                      {t.ticketNumber} · {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`portal-status-badge status-${t.status.replace(/_/g, '-')}`}>
                    {t.status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Property Contacts */}
        {property.contacts.length > 0 && (
          <div className="portal-card portal-contacts-widget">
            <div className="portal-card-header">
              <Megaphone size={18} />
              <h3>Property Contacts</h3>
            </div>
            <div className="portal-contacts-list">
              {property.contacts.map((c, i) => (
                <div key={i} className="portal-contact-item">
                  <span className="portal-contact-role">{c.role.replace(/_/g, ' ')}</span>
                  <span className="portal-contact-name">{c.name}</span>
                  <span className="portal-contact-phone">{c.phone}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
