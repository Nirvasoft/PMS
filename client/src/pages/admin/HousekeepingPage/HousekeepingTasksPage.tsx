import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetHkTasksQuery, useGetHkZonesQuery, useGetHkSchedulesQuery,
  useCreateHkZoneMutation, useCreateHkScheduleMutation,
  useStartHkTaskMutation, useCompleteHkTaskMutation,
  useGetHkStatsQuery,
} from '../../../store/api/housekeepingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Sparkles, Loader2, Plus, Search, Play, CheckCircle2,
  Calendar, Users, MapPin, ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ZONE_TYPES = ['corridor', 'lobby', 'car_park', 'amenity', 'office', 'restroom', 'other'];
const ZONE_ICONS: Record<string, string> = {
  corridor: '🚶', lobby: '🏛️', car_park: '🅿️', amenity: '🏊', office: '🏢', restroom: '🚻', other: '📍',
};
const STATUS_MAP: Record<string, string> = {
  pending: 'open', in_progress: 'in_progress', completed: 'completed', missed: 'cancelled',
};

export default function HousekeepingTasksPage() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<'tasks' | 'schedules' | 'zones'>('tasks');
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const { data: tasksData, isLoading: tasksLoading } = useGetHkTasksQuery({ date, status: status || undefined, page: 1, limit: 100 });
  const { data: zonesData } = useGetHkZonesQuery({});
  const { data: schedulesData } = useGetHkSchedulesQuery({});
  const { data: statsData } = useGetHkStatsQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });

  const [createZone] = useCreateHkZoneMutation();
  const [createSchedule] = useCreateHkScheduleMutation();
  const [startTask] = useStartHkTaskMutation();
  const [completeTask] = useCompleteHkTaskMutation();

  const tasks = tasksData?.data || [];
  const zones = zonesData?.data || [];
  const schedules = schedulesData?.data || [];
  const stats = statsData?.data;
  const properties = propsData?.data || [];

  const handleStartTask = async (id: string) => {
    try { await startTask(id).unwrap(); toast.success('Task started'); } catch { toast.error('Failed'); }
  };
  const handleCompleteTask = async (id: string) => {
    try { await completeTask({ id, data: {} }).unwrap(); toast.success('Task completed'); } catch { toast.error('Failed'); }
  };

  const handleCreateZone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createZone({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        zoneType: fd.get('zoneType') || undefined, floor: fd.get('floor') || undefined,
        areaSqm: parseFloat(fd.get('areaSqm') as string) || undefined,
      }).unwrap();
      toast.success('Zone created'); setShowZoneModal(false);
    } catch { toast.error('Failed'); }
  };

  const handleCreateSchedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createSchedule({
        propertyId: fd.get('propertyId'), zoneId: fd.get('zoneId'),
        name: fd.get('name'), frequencyType: fd.get('frequencyType'),
        scheduledTime: fd.get('scheduledTime') || undefined,
        durationMinutes: parseInt(fd.get('durationMinutes') as string) || undefined,
        cleaningType: fd.get('cleaningType') || undefined,
      }).unwrap();
      toast.success('Schedule created'); setShowScheduleModal(false);
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="maint-page">
      {/* Stats */}
      {stats?.today && (
        <div className="maint-stats-row">
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}><ClipboardList size={18} /></div>
            <div><div className="stat-value">{stats.today.total}</div><div className="stat-label">Today's Tasks</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}><CheckCircle2 size={18} /></div>
            <div><div className="stat-value">{stats.today.completed}</div><div className="stat-label">Completed</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}><Play size={18} /></div>
            <div><div className="stat-value">{stats.today.inProgress}</div><div className="stat-label">In Progress</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}><MapPin size={18} /></div>
            <div><div className="stat-value">{stats.zones}</div><div className="stat-label">Zones</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: 'rgba(14,165,233,0.15)', color: '#0ea5e9' }}><Calendar size={18} /></div>
            <div><div className="stat-value">{stats.schedules}</div><div className="stat-label">Schedules</div></div>
          </div>
          <div className="maint-stat-card">
            <div className="stat-icon" style={{ background: stats.today.completionRate >= 80 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: stats.today.completionRate >= 80 ? '#10b981' : '#ef4444' }}>
              <Sparkles size={18} />
            </div>
            <div><div className="stat-value">{stats.today.completionRate}%</div><div className="stat-label">Completion</div></div>
          </div>
        </div>
      )}

      {/* Header + Tabs */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Sparkles size={20} /></div>
          <div><h1>Housekeeping</h1><p>Tasks, schedules & zones</p></div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowZoneModal(true)}><MapPin size={14} /> Add Zone</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowScheduleModal(true)}><Plus size={14} /> Add Schedule</button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="maint-filters" style={{ gap: '4px' }}>
        {(['tasks', 'schedules', 'zones'] as const).map((t) => (
          <button key={t} className={`filter-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'tasks' ? <ClipboardList size={12} /> : t === 'schedules' ? <Calendar size={12} /> : <MapPin size={12} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {tab === 'tasks' && (
          <>
            <input type="date" className="filter-select" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '160px' }} />
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
            </select>
          </>
        )}
      </div>

      {/* Tasks Tab */}
      {tab === 'tasks' && (
        tasksLoading ? <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div> :
        tasks.length === 0 ? <div className="maint-empty"><Sparkles size={32} /><p>No tasks for this date</p></div> : (
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr><th>Time</th><th>Zone</th><th>Schedule</th><th>Assigned</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {tasks.map((t: any) => {
                  const assignee = t.assignedTo?.profile ? `${t.assignedTo.profile.firstName} ${t.assignedTo.profile.lastName}` : '—';
                  return (
                    <tr key={t.id}>
                      <td><span className="cell-mono">{t.scheduledTime || '—'}</span></td>
                      <td>
                        <span className="cell-primary">{ZONE_ICONS[t.zone?.zoneType] || '📍'} {t.zone?.name}</span>
                        {t.zone?.floor && <span className="cell-secondary" style={{ display: 'block' }}>Floor {t.zone.floor}</span>}
                      </td>
                      <td>
                        <span className="cell-secondary">{t.schedule?.name}</span>
                        {t.schedule?.cleaningType && <span className={`maint-status open`} style={{ marginLeft: '6px' }}>{t.schedule.cleaningType}</span>}
                      </td>
                      <td><span className="cell-secondary"><Users size={12} style={{ marginRight: '4px' }} />{assignee}</span></td>
                      <td><span className={`maint-status ${STATUS_MAP[t.status] || 'open'}`}>{t.status}</span></td>
                      <td>
                        {t.status === 'pending' && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleStartTask(t.id)}>
                            <Play size={12} /> Start
                          </button>
                        )}
                        {t.status === 'in_progress' && (
                          <button className="btn btn-success btn-sm" onClick={() => handleCompleteTask(t.id)}>
                            <CheckCircle2 size={12} /> Done
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Schedules Tab */}
      {tab === 'schedules' && (
        schedules.length === 0 ? <div className="maint-empty"><Calendar size={32} /><p>No schedules</p></div> : (
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead><tr><th>Name</th><th>Zone</th><th>Frequency</th><th>Time</th><th>Type</th><th>Assigned</th><th>Status</th></tr></thead>
              <tbody>
                {schedules.map((s: any) => (
                  <tr key={s.id}>
                    <td><span className="cell-primary">{s.name}</span></td>
                    <td><span className="cell-secondary">{s.zone?.name}</span></td>
                    <td><span className="maint-status open">{s.frequencyType}</span></td>
                    <td><span className="cell-mono">{s.scheduledTime || '—'}</span></td>
                    <td>{s.cleaningType && <span className="maint-status in_progress">{s.cleaningType}</span>}</td>
                    <td><span className="cell-secondary">{s.assignedTo?.profile ? `${s.assignedTo.profile.firstName} ${s.assignedTo.profile.lastName}` : '—'}</span></td>
                    <td><span className={`maint-status ${s.status === 'active' ? 'completed' : 'closed'}`}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Zones Tab */}
      {tab === 'zones' && (
        zones.length === 0 ? <div className="maint-empty"><MapPin size={32} /><p>No zones</p></div> : (
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead><tr><th>Zone</th><th>Type</th><th>Property</th><th>Floor</th><th>Area (sqm)</th></tr></thead>
              <tbody>
                {zones.map((z: any) => (
                  <tr key={z.id}>
                    <td><span className="cell-primary">{z.name}</span></td>
                    <td><span className="maint-status open">{ZONE_ICONS[z.zoneType] || '📍'} {z.zoneType || '—'}</span></td>
                    <td><span className="cell-secondary">{z.property?.name}</span></td>
                    <td><span className="cell-mono">{z.floor || '—'}</span></td>
                    <td><span className="cell-secondary">{z.areaSqm ? Number(z.areaSqm).toLocaleString() : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Zone Modal */}
      {showZoneModal && (
        <div className="modal-overlay" onClick={() => setShowZoneModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h2><MapPin size={18} /> New Zone</h2>
            <form onSubmit={handleCreateZone}>
              <div className="form-group"><label>Property *</label>
                <select name="propertyId" required><option value="">Select...</option>{properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="form-group"><label>Zone Name *</label><input name="name" required placeholder="Lobby" /></div>
              <div className="form-group"><label>Type</label>
                <select name="zoneType"><option value="">Select...</option>{ZONE_TYPES.map((t) => <option key={t} value={t}>{ZONE_ICONS[t]} {t}</option>)}</select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Floor</label><input name="floor" placeholder="G" /></div>
                <div className="form-group"><label>Area (sqm)</label><input name="areaSqm" type="number" step="0.01" /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowZoneModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <h2><Calendar size={18} /> New Schedule</h2>
            <form onSubmit={handleCreateSchedule}>
              <div className="form-group"><label>Property *</label>
                <select name="propertyId" required><option value="">Select...</option>{properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="form-group"><label>Zone *</label>
                <select name="zoneId" required><option value="">Select...</option>{zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
              </div>
              <div className="form-group"><label>Schedule Name *</label><input name="name" required placeholder="Daily Lobby Cleaning" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Frequency *</label>
                  <select name="frequencyType" required>
                    <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="form-group"><label>Type</label>
                  <select name="cleaningType"><option value="routine">Routine</option><option value="deep_clean">Deep Clean</option><option value="sanitization">Sanitization</option></select>
                </div>
                <div className="form-group"><label>Time</label><input name="scheduledTime" type="time" /></div>
                <div className="form-group"><label>Duration (min)</label><input name="durationMinutes" type="number" min="1" /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowScheduleModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
