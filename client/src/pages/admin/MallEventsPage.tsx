import React, { useState } from 'react';
import {
  useGetMallEventsQuery, useCreateMallEventMutation, useUpdateMallEventMutation,
  useGetMallEventDetailQuery, useCreateBoothMutation,
} from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Calendar, Plus, MapPin, Tag } from 'lucide-react';

const EVENT_TYPES = ['campaign', 'event', 'roadshow', 'sale', 'exhibition'];
const STATUSES = ['planned', 'active', 'completed', 'cancelled'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MallEventsPage() {
  
  const propertyId = useSelectedPropertyId();

  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [showBooth, setShowBooth] = useState(false);
  const [formData, setFormData] = useState<any>({
    title: '', eventType: 'event', category: '', startDate: '', endDate: '',
    venue: '', organizer: '', estimatedFootfall: '', budget: '', isPublic: true,
  });
  const [boothData, setBoothData] = useState<any>({
    boothNumber: '', boothLocation: '', sizeSqft: '', brandName: '',
    startDate: '', endDate: '', dailyRate: '', deposit: '',
  });

  const { data: eventsData, isLoading } = useGetMallEventsQuery(
    { propertyId, status: statusFilter || undefined },
    { skip: !propertyId }
  );
  const { data: detailData } = useGetMallEventDetailQuery(selectedEvent!, { skip: !selectedEvent });
  const [createEvent] = useCreateMallEventMutation();
  const [createBooth] = useCreateBoothMutation();

  const events = eventsData?.data || [];
  const detail = detailData?.data;

  const handleCreateEvent = async () => {
    try {
      await createEvent({
        propertyId, ...formData,
        estimatedFootfall: formData.estimatedFootfall ? Number(formData.estimatedFootfall) : undefined,
        budget: formData.budget ? Number(formData.budget) : undefined,
      }).unwrap();
      setShowCreate(false);
    } catch (e) { console.error(e); }
  };

  const handleCreateBooth = async () => {
    if (!selectedEvent) return;
    try {
      await createBooth({
        eventId: selectedEvent,
        data: {
          ...boothData,
          sizeSqft: boothData.sizeSqft ? Number(boothData.sizeSqft) : undefined,
          dailyRate: boothData.dailyRate ? Number(boothData.dailyRate) : undefined,
          deposit: boothData.deposit ? Number(boothData.deposit) : undefined,
        },
      }).unwrap();
      setShowBooth(false);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="page-content">
      <div className="mall-page-header">
        <div>
          <h1>Events & Promotions</h1>
          <p className="mall-page-subtitle">Manage mall events, campaigns, and booth rentals</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} style={{ marginRight: 4 }} />New Event
        </button>
      </div>

      {/* Filters */}
      <div className="mall-filter-bar">
        <button
          className={`mall-filter-chip ${!statusFilter ? 'active' : ''}`}
          onClick={() => setStatusFilter('')}
        >All</button>
        {STATUSES.map(s => (
          <button
            key={s}
            className={`mall-filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >{s}</button>
        ))}
        <span className="mall-filter-count">{eventsData?.total || 0} events</span>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3,4].map(i => <div key={i} className="module-skeleton-card" />)}
        </div>
      ) : (
        <div className="mall-events-grid">
          {events.map((ev: any) => (
            <div
              key={ev.id}
              className={`mall-event-card ${selectedEvent === ev.id ? 'mall-event-selected' : ''}`}
              onClick={() => setSelectedEvent(ev.id)}
            >
              <div className="mall-event-card-header">
                <div className="mall-event-date-badge">
                  <span className="mall-event-day">{new Date(ev.startDate).getDate()}</span>
                  <span className="mall-event-month">{MONTH_SHORT[new Date(ev.startDate).getMonth()]}</span>
                </div>
                <span className={`mall-status-badge mall-status-${ev.status}`}>{ev.status}</span>
              </div>
              <h4 className="mall-event-card-title">{ev.title}</h4>
              <div className="mall-event-card-meta">
                <span><MapPin size={12} style={{ marginRight: 3 }} />{ev.venue || 'TBD'}</span>
                <span><Tag size={12} style={{ marginRight: 3 }} />{ev.eventType}</span>
              </div>
              <div className="mall-event-card-footer">
                <span>{ev._count?.booths || 0} booths</span>
                {ev.budget && <span>Budget: ${Number(ev.budget).toLocaleString()}</span>}
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="mall-empty-state">
              <Calendar size={40} strokeWidth={1} />
              <h3>No Events</h3>
              <p>Create your first mall event or promotion</p>
            </div>
          )}
        </div>
      )}

      {/* Event Detail Panel */}
      {detail && (
        <div className="mall-card" style={{ marginTop: 20 }}>
          <div className="mall-card-header">
            <h3>{detail.title}</h3>
            <button className="mall-btn-sm" onClick={() => setShowBooth(true)}>
              <Plus size={12} style={{ marginRight: 4 }} />Add Booth
            </button>
          </div>
          <div className="mall-card-body">
            <div className="mall-detail-row">
              <span>Type: <strong>{detail.eventType}</strong></span>
              <span>Venue: <strong>{detail.venue || 'TBD'}</strong></span>
              <span>Dates: <strong>{detail.startDate?.split('T')[0]} → {detail.endDate?.split('T')[0]}</strong></span>
              {detail.estimatedFootfall && <span>Est. Footfall: <strong>{detail.estimatedFootfall.toLocaleString()}</strong></span>}
            </div>
            {detail.booths?.length > 0 && (
              <div className="mall-table-wrap" style={{ marginTop: 12 }}>
                <table className="mall-table">
                  <thead>
                    <tr>
                      <th>Booth</th>
                      <th>Location</th>
                      <th>Brand</th>
                      <th>Size</th>
                      <th>Daily Rate</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.booths.map((b: any) => (
                      <tr key={b.id}>
                        <td><strong>{b.boothNumber}</strong></td>
                        <td>{b.boothLocation}</td>
                        <td>{b.brandName || b.tenant?.companyName || '-'}</td>
                        <td>{b.sizeSqft ? `${b.sizeSqft} sqft` : '-'}</td>
                        <td>${Number(b.dailyRate || 0).toLocaleString()}</td>
                        <td><strong>${Number(b.totalAmount || 0).toLocaleString()}</strong></td>
                        <td>
                          <span className={`mall-status-badge mall-status-${b.status}`}>{b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreate && (
        <div className="mall-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Create Event</h3>
              <button className="mall-modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label>Title
                  <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                </label>
                <label>Event Type
                  <select value={formData.eventType} onChange={e => setFormData({ ...formData, eventType: e.target.value })}>
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>Start Date
                  <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                </label>
                <label>End Date
                  <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                </label>
                <label>Venue
                  <input value={formData.venue} onChange={e => setFormData({ ...formData, venue: e.target.value })} placeholder="e.g. Atrium Level 1" />
                </label>
                <label>Organizer
                  <input value={formData.organizer} onChange={e => setFormData({ ...formData, organizer: e.target.value })} />
                </label>
                <label>Expected Footfall
                  <input type="number" value={formData.estimatedFootfall} onChange={e => setFormData({ ...formData, estimatedFootfall: e.target.value })} />
                </label>
                <label>Budget
                  <input type="number" value={formData.budget} onChange={e => setFormData({ ...formData, budget: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateEvent}>Create Event</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Booth Modal */}
      {showBooth && (
        <div className="mall-modal-overlay" onClick={() => setShowBooth(false)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Add Booth</h3>
              <button className="mall-modal-close" onClick={() => setShowBooth(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label>Booth Number
                  <input value={boothData.boothNumber} onChange={e => setBoothData({ ...boothData, boothNumber: e.target.value })} />
                </label>
                <label>Location
                  <input value={boothData.boothLocation} onChange={e => setBoothData({ ...boothData, boothLocation: e.target.value })} />
                </label>
                <label>Brand Name
                  <input value={boothData.brandName} onChange={e => setBoothData({ ...boothData, brandName: e.target.value })} />
                </label>
                <label>Size (sqft)
                  <input type="number" value={boothData.sizeSqft} onChange={e => setBoothData({ ...boothData, sizeSqft: e.target.value })} />
                </label>
                <label>Start Date
                  <input type="date" value={boothData.startDate} onChange={e => setBoothData({ ...boothData, startDate: e.target.value })} />
                </label>
                <label>End Date
                  <input type="date" value={boothData.endDate} onChange={e => setBoothData({ ...boothData, endDate: e.target.value })} />
                </label>
                <label>Daily Rate
                  <input type="number" value={boothData.dailyRate} onChange={e => setBoothData({ ...boothData, dailyRate: e.target.value })} />
                </label>
                <label>Deposit
                  <input type="number" value={boothData.deposit} onChange={e => setBoothData({ ...boothData, deposit: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBooth(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateBooth}>Add Booth</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
