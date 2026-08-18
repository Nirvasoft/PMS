import { useState, useMemo } from 'react';
import {
  useGetTechniciansQuery, useGetTechScheduleQuery, useUpsertTechProfileMutation,
} from '../../../store/api/maintenanceApi';
import {
  Users, Calendar, ChevronLeft, ChevronRight, Loader2, XCircle,
  UserPlus, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

const WO_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  accepted: '#8b5cf6',
  in_progress: '#f59e0b',
  on_hold: '#f97316',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: '#ef4444',
  P2: '#f97316',
  P3: '#3b82f6',
  P4: '#94a3b8',
};

export default function TechnicianSchedulePage() {
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const { data: techData, isLoading } = useGetTechniciansQuery({});
  const techs = techData?.data || [];

  // Week boundaries
  const { weekStart, weekEnd, weekLabel, days } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay() + 1 + weekOffset * 7); // Monday
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const daysArr = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });

    return {
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      weekLabel: `${start.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      days: daysArr,
    };
  }, [weekOffset]);

  const { data: scheduleData } = useGetTechScheduleQuery(
    { userId: selectedTech!, from: weekStart, to: weekEnd },
    { skip: !selectedTech },
  );
  const scheduleEvents = scheduleData?.data || [];

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof scheduleEvents>();
    days.forEach((d) => {
      const key = d.toISOString().split('T')[0];
      map.set(key, []);
    });
    scheduleEvents.forEach((ev) => {
      if (!ev.start) return;
      const key = ev.start.split('T')[0];
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    });
    return map;
  }, [scheduleEvents, days]);

  const activeTech = techs.find((t) => t.userId === selectedTech);

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Users size={22} />
          </div>
          <div>
            <h1>Technician Schedule</h1>
            <p>View and manage technician workload and schedules</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowProfileModal(true)}>
            <UserPlus size={16} /> Manage Profiles
          </button>
        </div>
      </div>

      <div className="tech-schedule-layout">
        {/* Left: Technician list */}
        <div className="tech-list-panel">
          <h3>Technicians ({techs.length})</h3>
          {isLoading ? (
            <div className="maint-loading"><Loader2 size={18} className="spin" /></div>
          ) : techs.length === 0 ? (
            <p className="empty-state-inline">No technician profiles found</p>
          ) : techs.map((tech) => (
            <div
              key={tech.userId}
              className={`tech-list-item ${selectedTech === tech.userId ? 'active' : ''}`}
              onClick={() => setSelectedTech(tech.userId)}
            >
              <div className="tech-avatar">
                {tech.fullName.split(' ').map((w) => w[0]).join('').substring(0, 2)}
              </div>
              <div className="tech-info">
                <span className="tech-name">{tech.fullName}</span>
                <span className="tech-meta">
                  {tech.openJobs}/{tech.maxConcurrentJobs} jobs · {tech.isAvailable ? '🟢' : '🔴'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Calendar */}
        <div className="tech-calendar-panel">
          {!selectedTech ? (
            <div className="maint-empty">
              <div className="empty-icon"><Calendar size={28} /></div>
              <p>Select a technician to view their schedule</p>
            </div>
          ) : (
            <>
              {/* Week navigator */}
              <div className="week-navigator">
                <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
                  <ChevronLeft size={16} />
                </button>
                <span className="week-label">{weekLabel}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>
                  <ChevronRight size={16} />
                </button>
                {weekOffset !== 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>Today</button>
                )}
              </div>

              {/* Tech workload summary */}
              {activeTech && (
                <div className="tech-workload-summary">
                  <span><strong>{activeTech.fullName}</strong></span>
                  <span className="workload-badge">
                    {activeTech.openJobs} / {activeTech.maxConcurrentJobs} active jobs
                  </span>
                  <div className="skill-tags">
                    {activeTech.skills.map((s) => <span key={s} className="skill-tag">{s}</span>)}
                  </div>
                </div>
              )}

              {/* Calendar grid */}
              <div className="calendar-grid">
                {days.map((day) => {
                  const key = day.toISOString().split('T')[0];
                  const events = eventsByDay.get(key) || [];
                  const isToday = new Date().toISOString().split('T')[0] === key;

                  return (
                    <div key={key} className={`calendar-day ${isToday ? 'today' : ''}`}>
                      <div className="calendar-day-header">
                        <span className="day-name">{day.toLocaleDateString('en', { weekday: 'short' })}</span>
                        <span className={`day-number ${isToday ? 'today-badge' : ''}`}>
                          {day.getDate()}
                        </span>
                      </div>
                      <div className="calendar-day-body">
                        {events.length === 0 ? (
                          <p className="no-events">No events</p>
                        ) : events.map((ev) => (
                          <div
                            key={ev.id}
                            className="schedule-event"
                            style={{ borderLeftColor: PRIORITY_COLORS[ev.priority] || '#94a3b8' }}
                          >
                            <div className="event-header">
                              <span className="event-wo">{ev.woNumber}</span>
                              <span
                                className="event-status-dot"
                                style={{ backgroundColor: WO_COLORS[ev.status] || '#94a3b8' }}
                              />
                            </div>
                            <p className="event-title">{ev.title}</p>
                            <div className="event-meta">
                              {ev.unitNumber && <span>{ev.unitNumber}</span>}
                              {ev.start && (
                                <span className="event-time">
                                  <Clock size={10} />
                                  {new Date(ev.start).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {showProfileModal && <TechProfileModal techs={techs} onClose={() => setShowProfileModal(false)} />}
    </div>
  );
}

function TechProfileModal({ techs, onClose }: { techs: any[]; onClose: () => void }) {
  const [upsertProfile, { isLoading }] = useUpsertTechProfileMutation();
  const [form, setForm] = useState({
    userId: '', skills: '', hourlyRate: '', maxConcurrentJobs: '3', isAvailable: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertProfile({
        userId: form.userId,
        data: {
          skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
          hourlyRate: parseFloat(form.hourlyRate) || undefined,
          maxConcurrentJobs: parseInt(form.maxConcurrentJobs) || 3,
          isAvailable: form.isAvailable,
        },
      }).unwrap();
      toast.success('Profile updated');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Update failed');
    }
  };

  return (
    <div className="maint-modal-backdrop">
      <div className="maint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><UserPlus size={18} /></span>
            Technician Profile
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Select User <span style={{ color: '#f87171' }}>*</span></label>
              <input type="text" required placeholder="User ID (UUID)" value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))} />
            </div>
          </div>
          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Skills (comma separated)</label>
              <input type="text" value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} placeholder="plumbing, electrical, hvac" />
            </div>
          </div>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Hourly Rate</label>
              <input type="number" min="0" step="0.01" value={form.hourlyRate} onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Max Concurrent Jobs</label>
              <input type="number" min="1" max="20" value={form.maxConcurrentJobs} onChange={(e) => setForm((f) => ({ ...f, maxConcurrentJobs: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.isAvailable} onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))} />
              Available for assignments
            </label>
          </div>
          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>Save Profile</button>
          </div>
        </form>
      </div>
    </div>
  );
}
