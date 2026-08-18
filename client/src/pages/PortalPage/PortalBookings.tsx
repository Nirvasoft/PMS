import { useState } from 'react';
import {
  useGetBookableFacilitiesQuery,
  useGetAvailabilityQuery,
  useCreateBookingMutation,
  useGetMyBookingsQuery,
  useCancelBookingMutation,
} from '../../store/api/bookingsApi';
import toast from 'react-hot-toast';
import {
  CalendarDays, Clock, Users, ChevronLeft, ChevronRight,
  X, CheckCircle2, XCircle, MapPin, DollarSign, Dumbbell,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, string> = {
  recreation: '🏊', convenience: '🏢', security: '🔒', utility: '⚡',
};

export default function PortalBookings() {
  const [tab, setTab] = useState<'facilities' | 'my_bookings'>('facilities');
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [cancelModal, setCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [bookingForm, setBookingForm] = useState({ paxCount: 1, purpose: '' });

  const { data: facilities, isLoading: loadingFacilities } = useGetBookableFacilitiesQuery();
  const { data: availability, isLoading: loadingSlots } = useGetAvailabilityQuery(
    { facilityId: selectedFacility!, date: selectedDate },
    { skip: !selectedFacility },
  );
  const { data: bookingsResult } = useGetMyBookingsQuery({ upcoming: true });
  const [createBooking, { isLoading: isCreating }] = useCreateBookingMutation();
  const [cancelBooking] = useCancelBookingMutation();

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacility || !selectedSlot) return;
    try {
      await createBooking({
        facilityId: selectedFacility,
        bookingDate: selectedDate,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        paxCount: bookingForm.paxCount,
        purpose: bookingForm.purpose || undefined,
      }).unwrap();
      toast.success('Booking confirmed!');
      setShowBookingForm(false);
      setSelectedSlot(null);
      setBookingForm({ paxCount: 1, purpose: '' });
    } catch (err: any) {
      toast.error(err?.data?.message || 'Booking failed');
    }
  };

  const handleCancel = async () => {
    if (!cancelModal || !cancelReason.trim()) return;
    try {
      await cancelBooking({ id: cancelModal, reason: cancelReason }).unwrap();
      toast.success('Booking cancelled');
      setCancelModal(null);
      setCancelReason('');
    } catch {
      toast.error('Failed to cancel');
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const myBookings = bookingsResult?.data || [];

  return (
    <div className="page-content portal-page">
      <div className="portal-page-header">
        <div>
          <h1>Facility Bookings</h1>
          <p className="text-muted">Book facilities and manage reservations</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="portal-tab-bar">
        <button className={`portal-tab${tab === 'facilities' ? ' active' : ''}`}
          onClick={() => setTab('facilities')}>
          <Dumbbell size={16} /> Facilities
        </button>
        <button className={`portal-tab${tab === 'my_bookings' ? ' active' : ''}`}
          onClick={() => setTab('my_bookings')}>
          <CalendarDays size={16} /> My Bookings ({myBookings.length})
        </button>
      </div>

      {tab === 'facilities' && (
        <>
          {/* Facility Grid */}
          {!selectedFacility ? (
            loadingFacilities ? (
              <div className="portal-loading">Loading facilities...</div>
            ) : (
              <div className="portal-facility-grid">
                {(facilities || []).map((f: any) => (
                  <div key={f.id} className="portal-facility-card" onClick={() => setSelectedFacility(f.id)}>
                    <div className="portal-facility-icon">
                      {CATEGORY_ICONS[f.facilityType?.category] || '🏠'}
                    </div>
                    <div className="portal-facility-info">
                      <h3>{f.name || f.facilityType?.name}</h3>
                      <div className="portal-facility-meta">
                        {f.capacity && <span><Users size={13} /> Cap: {f.capacity}</span>}
                        {f.bookingRule?.isPaid && (
                          <span><DollarSign size={13} />
                            {f.bookingRule.flatRate
                              ? `${f.bookingRule.currency} ${f.bookingRule.flatRate}/booking`
                              : `${f.bookingRule.currency} ${f.bookingRule.hourlyRate}/hr`}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-muted" />
                  </div>
                ))}
                {(facilities || []).length === 0 && (
                  <div className="portal-empty">
                    <Dumbbell size={48} strokeWidth={1} />
                    <p>No bookable facilities available</p>
                  </div>
                )}
              </div>
            )
          ) : (
            /* Availability View */
            <div className="portal-booking-detail">
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedFacility(null); setSelectedSlot(null); }}>
                <ChevronLeft size={16} /> Back to facilities
              </button>

              <div className="portal-card" style={{ marginTop: '12px' }}>
                <h3>{availability?.facilityName || 'Facility'}</h3>
                {availability?.operatingHours && (
                  <p className="text-muted">Operating: {availability.operatingHours}</p>
                )}

                <div className="portal-date-picker">
                  <label>Select Date</label>
                  <input type="date" value={selectedDate}
                    onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null); }}
                    min={new Date().toISOString().split('T')[0]} />
                </div>

                {loadingSlots ? (
                  <div className="portal-loading" style={{ padding: '24px 0' }}>Loading slots...</div>
                ) : (
                  <div className="portal-time-slots">
                    {(availability?.slots || []).map((s: any, i: number) => (
                      <button key={i}
                        className={`portal-slot${!s.available ? ' unavailable' : ''}${
                          selectedSlot?.start === s.startTime ? ' selected' : ''
                        }`}
                        disabled={!s.available}
                        onClick={() => setSelectedSlot(
                          selectedSlot?.start === s.startTime ? null : { start: s.startTime, end: s.endTime }
                        )}>
                        <Clock size={12} />
                        {s.startTime}–{s.endTime}
                      </button>
                    ))}
                    {(availability?.slots || []).length === 0 && (
                      <p className="text-muted">No slots available for this date</p>
                    )}
                  </div>
                )}

                {selectedSlot && !showBookingForm && (
                  <div className="portal-slot-actions">
                    <p><strong>Selected:</strong> {selectedSlot.start} – {selectedSlot.end}</p>
                    <button className="btn btn-primary" onClick={() => setShowBookingForm(true)}>
                      Book This Slot
                    </button>
                  </div>
                )}

                {showBookingForm && selectedSlot && (
                  <form onSubmit={handleBook} className="portal-booking-form">
                    <h4>Confirm Booking</h4>
                    <p className="text-muted">{fmtDate(selectedDate)} • {selectedSlot.start} – {selectedSlot.end}</p>
                    <div className="form-group">
                      <label>Number of Guests</label>
                      <input type="number" min={1} max={200} value={bookingForm.paxCount}
                        onChange={e => setBookingForm(f => ({ ...f, paxCount: parseInt(e.target.value) || 1 }))} />
                    </div>
                    <div className="form-group">
                      <label>Purpose (optional)</label>
                      <input type="text" value={bookingForm.purpose} maxLength={255}
                        onChange={e => setBookingForm(f => ({ ...f, purpose: e.target.value }))} />
                    </div>
                    {availability?.rules?.isPaid && (
                      <div className="portal-booking-charge">
                        <DollarSign size={14} />
                        Charge: {availability.rules.currency}{' '}
                        {availability.rules.flatRate || ((
                          (parseInt(selectedSlot.end.split(':')[0]) * 60 + parseInt(selectedSlot.end.split(':')[1]))
                          - (parseInt(selectedSlot.start.split(':')[0]) * 60 + parseInt(selectedSlot.start.split(':')[1]))
                        ) / 60 * availability.rules.hourlyRate).toFixed(2)}
                      </div>
                    )}
                    <div className="form-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setShowBookingForm(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={isCreating}>
                        {isCreating ? 'Booking...' : 'Confirm Booking'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* My Bookings */}
      {tab === 'my_bookings' && (
        <div className="portal-bookings-list">
          {myBookings.length === 0 ? (
            <div className="portal-empty">
              <CalendarDays size={48} strokeWidth={1} />
              <p>No bookings yet</p>
            </div>
          ) : (
            myBookings.map((b: any) => (
              <div key={b.id} className="portal-booking-card">
                <div className="portal-booking-card-header">
                  <div>
                    <h4>{b.facility?.name || 'Facility'}</h4>
                    <span className="portal-booking-date">
                      <CalendarDays size={13} /> {fmtDate(b.bookingDate)}
                    </span>
                  </div>
                  <span className={`portal-status-badge status-${b.status}`}>
                    {b.status === 'confirmed' && <CheckCircle2 size={12} />}
                    {b.status === 'cancelled' && <XCircle size={12} />}
                    {b.status === 'pending' && <Clock size={12} />}
                    {b.status}
                  </span>
                </div>
                <div className="portal-booking-detail-row">
                  <span><Clock size={13} /> {b.startTime} – {b.endTime} ({b.durationMinutes} min)</span>
                  <span><Users size={13} /> {b.paxCount} guests</span>
                  {b.isPaidBooking && <span><DollarSign size={13} /> {b.currency} {b.chargeAmount}</span>}
                </div>
                {b.purpose && <p className="portal-booking-purpose">{b.purpose}</p>}
                {['confirmed', 'pending'].includes(b.status) && (
                  <button className="btn btn-sm btn-danger-outline" onClick={() => setCancelModal(b.id)}>
                    Cancel Booking
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="modal-backdrop">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cancel Booking</h3>
              <button className="btn-icon" onClick={() => setCancelModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Reason for cancellation *</label>
                <textarea rows={3} value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)} placeholder="Why are you cancelling?" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setCancelModal(null)}>Keep Booking</button>
              <button className="btn btn-danger" disabled={!cancelReason.trim()} onClick={handleCancel}>
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
