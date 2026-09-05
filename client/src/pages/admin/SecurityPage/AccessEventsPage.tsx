import '../MaintenancePage/MaintenancePage.css';
import { useState, useEffect } from 'react';
import { useGetAccessEventsQuery, useGetSecurityStatsQuery } from '../../../store/api/securityApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  DoorOpen, Loader2, Inbox, ShieldAlert, ShieldCheck, ShieldX,
  Key, Clock, Building2, CreditCard, User, AlertTriangle,
} from 'lucide-react';

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'access_granted', label: '✅ Access Granted' },
  { value: 'access_denied', label: '🚫 Access Denied' },
  { value: 'door_forced', label: '⚠️ Door Forced' },
  { value: 'door_held', label: '🚪 Door Held Open' },
  { value: 'tailgate', label: '🚶 Tailgate' },
  { value: 'lockdown', label: '🔒 Lockdown' },
];

const EVENT_STYLE: Record<string, { color: string; bg: string; icon: typeof DoorOpen; label: string }> = {
  access_granted: { color: '#10b981', bg: 'rgba(16,185,129,0.10)', icon: ShieldCheck, label: 'Granted' },
  access_denied: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', icon: ShieldX, label: 'Denied' },
  door_forced: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)', icon: ShieldAlert, label: 'Door Forced' },
  door_held: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: DoorOpen, label: 'Door Held' },
  tailgate: { color: '#f97316', bg: 'rgba(249,115,22,0.10)', icon: AlertTriangle, label: 'Tailgate' },
  lockdown: { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', icon: ShieldAlert, label: 'Lockdown' },
};

function fullName(user: any) {
  if (!user) return null;
  if (user.profile) return `${user.profile.firstName} ${user.profile.lastName}`;
  return user.email || null;
}

export default function AccessEventsPage() {
  const [eventType, setEventType] = useState('');
  const [page, setPage] = useState(1);

  // Active property from the sidebar — follows the same pattern as Parking Overview.
  const selectedProperty = useSelectedPropertyFilter();
  const { data: propsData } = useGetMyPropertyScopeQuery();
  const properties = propsData?.data || [];
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  // Reset page whenever the active property changes.
  useEffect(() => { setPage(1); }, [selectedProperty]);

  const { data: eventsData, isLoading } = useGetAccessEventsQuery({
    propertyId: selectedProperty || undefined,
    eventType: eventType || undefined,
    page,
    limit: 50,
  });
  const { data: statsData } = useGetSecurityStatsQuery({});

  const events = eventsData?.data || [];
  const meta = eventsData?.meta;
  const properties = propsData?.data || [];
  const accessDenied24h = statsData?.data?.accessDenied24h || 0;

  // Count events by type in current page
  const grantedCount = events.filter((e: any) => e.eventType === 'access_granted').length;
  const deniedCount = events.filter((e: any) => e.eventType === 'access_denied').length;
  const alertCount = events.filter((e: any) =>
    ['door_forced', 'tailgate', 'lockdown'].includes(e.eventType)
  ).length;

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><DoorOpen size={22} /></div>
          <div>
            <h1>Access Control Events</h1>
            <p>Real-time access logs from door readers, card scanners & gates</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Key size={18} /></div>
          <span className="msc-value">{meta?.total || events.length}</span>
          <span className="msc-label">Total Events</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><ShieldCheck size={18} /></div>
          <span className="msc-value">{grantedCount}</span>
          <span className="msc-label">Granted</span>
        </div>
        <div className="maint-stat-card red">
          <div className="msc-icon"><ShieldX size={18} /></div>
          <span className="msc-value">{deniedCount}</span>
          <span className="msc-label">Denied</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{ background: 'rgba(220,38,38,0.14)', color: '#dc2626' }}>
            <AlertTriangle size={18} />
          </div>
          <span className="msc-value" style={{ color: accessDenied24h > 0 ? '#dc2626' : undefined }}>
            {accessDenied24h}
          </span>
          <span className="msc-label">Denied (24h)</span>
        </div>
      </div>

      {/* Filters */}
      <div className="maint-toolbar">
        <div className="filter-group">
          {/* Property follows the sidebar's "Active Property" selector — not independently choosable here. */}
          <select className="filter-select" value={selectedProperty} disabled>
            {!selectedProperty && <option value="">All Properties</option>}
            {selectedProperty && <option value={selectedProperty}>{selectedPropertyName || 'Loading…'}</option>}
          </select>
          <select className="filter-select" value={eventType}
            onChange={(e) => { setEventType(e.target.value); setPage(1); }}>
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Events Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading events...</div>
      ) : events.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No access events found</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Events are created via door reader webhooks or manual entry
          </p>
        </div>
      ) : (
        <>
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}></th>
                  <th>Event Type</th>
                  <th>Door / Device</th>
                  <th>Card</th>
                  <th>User</th>
                  <th>Property</th>
                  <th>Time</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt: any) => {
                  const es = EVENT_STYLE[evt.eventType] || EVENT_STYLE.access_granted;
                  const EIcon = es.icon;
                  const isAlert = ['door_forced', 'tailgate', 'lockdown', 'access_denied'].includes(evt.eventType);
                  const userName = fullName(evt.user);
                  return (
                    <tr key={evt.id} className={isAlert ? 'ace-alert-row' : ''}>
                      <td>
                        <div className="ace-icon" style={{ background: es.bg, color: es.color }}>
                          <EIcon size={15} />
                        </div>
                      </td>
                      <td>
                        <span className="ace-type-badge" style={{ background: es.bg, color: es.color }}>
                          {es.label}
                        </span>
                      </td>
                      <td>
                        <div className="ace-door-cell">
                          <span className="ace-door-name">{evt.doorName || '—'}</span>
                          {evt.deviceName && (
                            <span className="ace-device-id">{evt.deviceName}</span>
                          )}
                          {!evt.deviceName && evt.deviceId && (
                            <span className="ace-device-id">{evt.deviceId}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {evt.cardNumber ? (
                          <span className="ace-card">
                            <CreditCard size={11} /> {evt.cardNumber}
                          </span>
                        ) : (
                          <span className="cell-secondary">—</span>
                        )}
                      </td>
                      <td>
                        {userName ? (
                          <span className="ace-user">
                            <User size={11} /> {userName}
                          </span>
                        ) : (
                          <span className="cell-secondary">Unknown</span>
                        )}
                      </td>
                      <td>
                        <span className="cell-secondary">
                          <Building2 size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          {evt.property?.name || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="ace-time">
                          <Clock size={11} />
                          {new Date(evt.eventAt).toLocaleString(undefined, {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </span>
                      </td>
                      <td>
                        {evt.denialReason ? (
                          <span className="ace-denial">{evt.denialReason}</span>
                        ) : (
                          <span className="cell-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="maint-pagination">
              <span className="page-info">
                Page {meta.page} of {meta.totalPages} ({meta.total} events)
              </span>
              <div className="page-btns">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
