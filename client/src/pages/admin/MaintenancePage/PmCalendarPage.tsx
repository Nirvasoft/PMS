import '../MaintenancePage/MaintenancePage.css';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetPmSchedulesQuery } from '../../../store/api/pmApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Calendar, ChevronLeft, ChevronRight, ArrowLeft, Loader2,
} from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  P1: '#ef4444', P2: '#f97316', P3: '#3b82f6', P4: '#94a3b8',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PmCalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Active property from the sidebar — follows the same pattern as Parking Overview.
  const selectedProperty = useSelectedPropertyFilter();
  const { data: propertiesData } = useGetMyPropertyScopeQuery();
  const properties = propertiesData?.data || [];
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  const { data: schedulesData, isLoading } = useGetPmSchedulesQuery({
    status: 'active',
    propertyId: selectedProperty || undefined,
    page: 1,
    limit: 500,
  });
  const schedules = schedulesData?.data || [];

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    let startDay = firstOfMonth.getDay() - 1; // Mon=0
    if (startDay < 0) startDay = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: Array<{ date: number | null; iso: string; isToday: boolean }> = [];

    // Padding
    for (let i = 0; i < startDay; i++) days.push({ date: null, iso: '', isToday: false });

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = iso === today.toISOString().split('T')[0];
      days.push({ date: d, iso, isToday });
    }

    return days;
  }, [year, month]);

  // Map schedules to their due dates
  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    schedules.forEach((s: any) => {
      const dueDateStr = new Date(s.nextDueDate).toISOString().split('T')[0];
      if (!map.has(dueDateStr)) map.set(dueDateStr, []);
      map.get(dueDateStr)!.push(s);
    });
    return map;
  }, [schedules]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/maintenance/pm')}>
            <ArrowLeft size={16} />
          </button>
          <div className="page-icon-lg"><Calendar size={22} /></div>
          <div>
            <h1>PM Calendar</h1>
            <p>Visualize upcoming preventive maintenance events</p>
          </div>
        </div>
        <div className="header-actions">
          {/* Property follows the sidebar's "Active Property" selector — not independently choosable here. */}
          <select className="filter-select" value={selectedProperty} disabled>
            {!selectedProperty && <option value="">All Properties</option>}
            {selectedProperty && <option value={selectedProperty}>{selectedPropertyName || 'Loading…'}</option>}
          </select>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="week-navigator" style={{ marginBottom: '16px' }}>
        <button className="btn btn-ghost btn-sm" onClick={prevMonth}><ChevronLeft size={16} /></button>
        <span className="week-label">{MONTH_NAMES[month]} {year}</span>
        <button className="btn btn-ghost btn-sm" onClick={nextMonth}><ChevronRight size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={goToday}>Today</button>
      </div>

      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : (
        <div className="pm-calendar-grid">
          {/* Day headers */}
          {DAY_NAMES.map(d => (
            <div key={d} className="pm-cal-header">{d}</div>
          ))}

          {/* Day cells */}
          {calendarDays.map((day, idx) => (
            <div key={idx} className={`pm-cal-cell ${day.date === null ? 'empty' : ''} ${day.isToday ? 'today' : ''}`}>
              {day.date !== null && (
                <>
                  <span className={`pm-cal-date ${day.isToday ? 'today-badge' : ''}`}>{day.date}</span>
                  <div className="pm-cal-events">
                    {(eventsByDate.get(day.iso) || []).map((s: any) => (
                      <div
                        key={s.id}
                        className="pm-cal-event"
                        style={{ borderLeftColor: PRIORITY_COLORS[s.priority] || '#94a3b8' }}
                        onClick={() => navigate(`/admin/maintenance/pm/${s.id}`)}
                        title={`${s.name} (${s.priority})`}
                      >
                        <span className="pm-cal-event-name">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
