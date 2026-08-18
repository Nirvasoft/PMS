import { useState } from 'react';
import {
  useGetAdminBookingsQuery, useApproveBookingMutation, useRejectBookingMutation,
} from '../../../store/api/bookingsApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  CalendarDays, CheckCircle, XCircle, Clock, Search,
  ChevronLeft, ChevronRight, User, Building2, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [propertyFilter, setPropertyFilter] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Week date range
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const { startDate, endDate } = getWeekRange(baseDate);

  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];

  const { data, isLoading } = useGetAdminBookingsQuery({
    propertyId: propertyFilter || undefined,
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
    try {
      await rejectBooking({ id: rejectId, reason: rejectReason || 'Rejected by admin' }).unwrap();
      toast.success('Booking rejected');
      setRejectId(null);
      setRejectReason('');
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
    <div className="page-content">
      <div className="page-header">
        <h1><CalendarDays size={24} /> Facility Bookings Schedule</h1>
        <p className="text-muted">View and manage facility bookings across all properties</p>
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
        <select
          value={propertyFilter}
          onChange={(e) => { setPropertyFilter(e.target.value); setPage(1); }}
          className="form-select"
          style={{ width: 180 }}
        >
          <option value="">All Properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
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
              <label>Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Reason for rejection..."
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => setRejectId(null)}>Cancel</button>
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
                                onClick={() => setRejectId(b.id)}
                                title="Reject"
                                style={{ color: 'var(--danger, #ef4444)' }}
                              >
                                <XCircle size={14} />
                              </button>
                            </div>
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
      {meta && meta.total > meta.limit && (
        <div className="pagination" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="text-muted" style={{ padding: '6px 12px' }}>
            Page {meta.page} of {Math.ceil(meta.total / meta.limit)}
          </span>
          <button className="btn btn-sm" disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
