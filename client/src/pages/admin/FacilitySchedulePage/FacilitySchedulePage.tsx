import '../MaintenancePage/MaintenancePage.css';
import { useState, useEffect } from 'react';
import {
  useGetAdminBookingsQuery, useApproveBookingMutation, useRejectBookingMutation,
} from '../../../store/api/bookingsApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  CalendarDays, CheckCircle, XCircle, Clock,
  ChevronLeft, ChevronRight, User, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const STATUSES = ['', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function getWeekRange(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export default function FacilitySchedulePage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectAttempted, setRejectAttempted] = useState(false);

  // Active property from the sidebar — follows the same pattern as Parking Overview.
  const selectedProperty = useSelectedPropertyFilter();
  const { data: propertiesData } = useGetMyPropertyScopeQuery();
  const properties = propertiesData?.data || [];
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  // Reset page whenever the active property changes.
  useEffect(() => { setPage(1); }, [selectedProperty]);

  // Week date range
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const { startDate, endDate } = getWeekRange(baseDate);

  const { data, isLoading } = useGetAdminBookingsQuery({
    propertyId: selectedProperty || undefined,
    status: statusFilter || undefined,
    startDate,
    endDate,
    page,
  });
  const [approveBooking] = useApproveBookingMutation();
  const [rejectBooking] = useRejectBookingMutation();

  const items = data?.data || [];
  const meta = data?.meta;

  // Group bookings by date
  const grouped = items.reduce<Record<string, typeof items>>((acc, b) => {
    const d = b.bookingDate.split('T')[0];
    if (!acc[d]) acc[d] = [];
    acc[d].push(b);
    return acc;
  }, {});

  // Generate 7 days for the week
  const weekDays: string[] = [];
  const ws = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    weekDays.push(ws.toISOString().split('T')[0]);
    ws.setDate(ws.getDate() + 1);
  }

  const handleApprove = async (id: string) => {
    try {
      await approveBooking(id).unwrap();
      toast.success('Booking approved');
    } catch { toast.error('Failed to approve'); }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setRejectAttempted(true);
    if (!rejectReason.trim()) return;
    try {
      await rejectBooking({ id: rejectId, reason: rejectReason }).unwrap();
      toast.success('Booking rejected');
      setRejectId(null);
      setRejectReason('');
      setRejectAttempted(false);
    } catch { toast.error('Failed to reject'); }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'status-active';
      case 'pending': return 'status-pending';
      case 'completed': return 'status-closed';
      case 'cancelled': return 'status-cancelled';
      case 'no_show': return 'status-overdue';
      default: return '';
    }
  };

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><CalendarDays size={22} /></div>
          <div>
            <h1>Facility Bookings Schedule</h1>
            <p>{meta?.total ?? items.length} total bookings</p>
          </div>
        </div>
      </div>

      {/* Week Navigation + Filters */}
      <div className="section-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft size={14} /></button>
          <span style={{ fontWeight: 600, minWidth: 200, textAlign: 'center' }}>
            {formatDate(startDate)} — {formatDate(endDate)}
          </span>
          <button className="btn btn-sm" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight size={14} /></button>
          {weekOffset !== 0 && (
            <button className="btn btn-sm" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {/* Property follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select
          value={selectedProperty}
          disabled
          className="form-select"
          style={{ width: 180 }}
        >
          {!selectedProperty && <option value="">All Properties</option>}
          {selectedProperty && <option value={selectedProperty}>{selectedPropertyName || 'Loading…'}</option>}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="form-select"
          style={{ width: 140 }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s ? s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'All Status'}</option>
          ))}
        </select>
      </div>

      {/* Reject Modal */}
      {rejectId && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3>Reject Booking</h3>
            <div className="form-group">
              <label>Reason <span style={{ color: '#f87171' }}>*</span></label>
              <textarea
                className={rejectAttempted && !rejectReason.trim() ? 'maint-input-error' : ''}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Reason for rejection..."
                style={{ width: '100%' }}
              />
              {rejectAttempted && !rejectReason.trim() && (
                <span className="maint-error-text">Reason is required</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => { setRejectId(null); setRejectAttempted(false); }}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Grid */}
      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading schedule...</div>
      ) : (
        <div className="facility-schedule-grid">
          {weekDays.map((day) => {
            const dayBookings = grouped[day] || [];
            const isToday = day === new Date().toISOString().split('T')[0];
            return (
              <div key={day} className={`facility-schedule-day ${isToday ? 'facility-schedule-today' : ''}`}>
                <div className="facility-schedule-day-header">
                  <span className="facility-day-name">
                    {new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className="facility-day-date">
                    {new Date(day + 'T12:00:00').getDate()}
                  </span>
                  {dayBookings.length > 0 && (
                    <span className="facility-day-count">{dayBookings.length}</span>
                  )}
                </div>
                <div className="facility-schedule-day-body">
                  {dayBookings.length === 0 ? (
                    <div className="facility-schedule-empty">No bookings</div>
                  ) : (
                    dayBookings.map((b) => (
                      <div key={b.id} className={`facility-booking-card booking-${b.status}`}>
                        <div className="facility-booking-time">
                          <Clock size={11} />
                          {b.startTime}–{b.endTime}
                        </div>
                        <div className="facility-booking-name">
                          {b.facility?.name || 'Facility'}
                        </div>
                        <div className="facility-booking-meta">
                          <User size={10} />
                          {b.resident ? `${b.resident.firstName} ${b.resident.lastName}` : '—'}
                          {b.unit && <> · <Building2 size={10} /> {b.unit.unitNumber}</>}
                        </div>
                        {b.purpose && (
                          <div className="facility-booking-purpose" title={b.purpose}>
                            {b.purpose}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <span className={`status-badge ${statusColor(b.status)}`} style={{ fontSize: '0.65rem' }}>
                            {b.status.replace(/_/g, ' ')}
                          </span>
                          {b.status === 'pending' && (
                            <PermissionGuard permission="facility-schedule.write">
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  className="btn-icon"
                                  onClick={() => handleApprove(b.id)}
                                  title="Approve"
                                  style={{ color: 'var(--success, #22c55e)' }}
                                >
                                  <CheckCircle size={14} />
                                </button>
                                <button
                                  className="btn-icon"
                                  onClick={() => { setRejectId(b.id); setRejectAttempted(false); }}
                                  title="Reject"
                                  style={{ color: 'var(--danger, #ef4444)' }}
                                >
                                  <XCircle size={14} />
                                </button>
                              </div>
                            </PermissionGuard>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total >= 10 && (
        <div className="maint-pagination" style={{ marginTop: 16 }}>
          <div className="maint-pagination-left" />
          <div className="maint-pagination-right">
            <button className="maint-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={16} />
            </button>
            <span className="maint-page-info">
              Page {meta.page} of {Math.ceil(meta.total / meta.limit) || 1}
            </span>
            <button className="maint-page-btn" disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
