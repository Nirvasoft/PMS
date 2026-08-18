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
  Sparkles, Loader2, Plus, Play, CheckCircle2,
  Calendar, Users, MapPin, ClipboardList, XCircle,
  Clock, Timer, TrendingUp, LayoutGrid, Star,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ZONE_TYPES = ['corridor', 'lobby', 'car_park', 'amenity', 'office', 'restroom', 'other'];
const ZONE_ICONS: Record<string, string> = {
  corridor: '🚶', lobby: '🏛️', car_park: '🅿️', amenity: '🏊', office: '🏢', restroom: '🚻', other: '📍',
};
const FREQ_BADGES: Record<string, { bg: string; color: string }> = {
  daily: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
  weekly: { bg: 'rgba(14,165,233,0.15)', color: '#38bdf8' },
  monthly: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
};
const STATUS_THEME: Record<string, { bg: string; color: string; icon: any }> = {
  pending: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', icon: Clock },
  in_progress: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', icon: Play },
  completed: { bg: 'rgba(16,185,129,0.12)', color: '#10b981', icon: CheckCircle2 },
  missed: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', icon: XCircle },
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

  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [clChecklist, setClChecklist] = useState<{ item: string; checked: boolean; notes: string }[]>([]);
  const [clScore, setClScore] = useState(4);
  const [clNotes, setClNotes] = useState('');

  const handleStartTask = async (id: string) => {
    try { await startTask(id).unwrap(); toast.success('Task started'); } catch { toast.error('Failed'); }
  };

  const openCompleteModal = (task: any) => {
    const scheduleChecklist = Array.isArray(task.schedule?.checklist) ? task.schedule.checklist : [];
    setClChecklist(
      scheduleChecklist.length > 0
        ? scheduleChecklist.map((c: any) => ({ item: c.item || c, checked: false, notes: '' }))
        : [{ item: 'General cleaning completed', checked: false, notes: '' }]
    );
    setClScore(4);
    setClNotes('');
    setCompleteTaskId(task.id);
  };

  const handleCompleteWithChecklist = async () => {
    if (!completeTaskId) return;
    try {
      await completeTask({
        id: completeTaskId,
        data: {
          checklistResults: clChecklist,
          qualityScore: clScore,
          notes: clNotes || undefined,
        },
      }).unwrap();
      toast.success('Task completed');
      setCompleteTaskId(null);
    } catch { toast.error('Failed to complete task'); }
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

  const completionPct = stats?.today?.completionRate ?? 0;
  const completionColor = completionPct >= 80 ? '#10b981' : completionPct >= 50 ? '#eab308' : '#ef4444';

  return (
    <div className="maint-page">
      {/* ── Stats Row ── */}
      {stats?.today && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
          gap: 10, marginBottom: 20,
        }}>
          <div style={{ borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03))', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardList size={13} /></div>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Today</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6366f1' }}>{stats.today.total}</div>
          </div>
          <div style={{ borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={13} /></div>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Done</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{stats.today.completed}</div>
          </div>
          <div style={{ borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(234,179,8,0.03))', border: '1px solid rgba(234,179,8,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(234,179,8,0.15)', color: '#eab308', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Timer size={13} /></div>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Active</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#eab308' }}>{stats.today.inProgress}</div>
          </div>
          <div style={{ borderRadius: 14, padding: '14px 16px', background: stats.today.missed > 0 ? 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))' : 'linear-gradient(135deg, rgba(107,114,128,0.04), transparent)', border: `1px solid ${stats.today.missed > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.1)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: stats.today.missed > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.1)', color: stats.today.missed > 0 ? '#ef4444' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><XCircle size={13} /></div>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Missed</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.today.missed > 0 ? '#ef4444' : 'var(--text-primary)' }}>{stats.today.missed}</div>
          </div>
          <div style={{ borderRadius: 14, padding: '14px 16px', background: `linear-gradient(135deg, ${completionColor}10, transparent)`, border: `1px solid ${completionColor}20` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: `${completionColor}18`, color: completionColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrendingUp size={13} /></div>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Rate</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: completionColor }}>{completionPct}%</div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--surface-hover)', marginTop: 4 }}>
              <div style={{ height: '100%', width: `${completionPct}%`, borderRadius: 2, background: completionColor, transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 16, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', margin: 0,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={18} color="#fff" />
            </div>
            Housekeeping
          </h1>
          <p style={{ margin: '4px 0 0 46px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Tasks, schedules & zones
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowZoneModal(true)} style={{ borderRadius: 10 }}><MapPin size={14} /> Add Zone</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowScheduleModal(true)} style={{ borderRadius: 10 }}><Plus size={14} /> Add Schedule</button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="maint-filters" style={{ gap: '4px' }}>
        {(['tasks', 'schedules', 'zones'] as const).map((t) => (
          <button key={t} className={`filter-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'tasks' ? <ClipboardList size={12} /> : t === 'schedules' ? <Calendar size={12} /> : <MapPin size={12} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'tasks' && tasks.length > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>({tasks.length})</span>}
            {t === 'schedules' && schedules.length > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>({schedules.length})</span>}
            {t === 'zones' && zones.length > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>({zones.length})</span>}
          </button>
        ))}
        {tab === 'tasks' && (
          <>
            <div style={{ marginLeft: 'auto' }} />
            <input type="date" className="filter-select" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '160px' }} />
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="pending">Pending</option><option value="in_progress">In Progress</option>
              <option value="completed">Completed</option><option value="missed">Missed</option>
            </select>
          </>
        )}
      </div>

      {/* ── Tasks Tab — Card layout ── */}
      {tab === 'tasks' && (
        tasksLoading ? <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div> :
        tasks.length === 0 ? <div className="maint-empty"><Sparkles size={32} /><p>No tasks for {date === today ? 'today' : date}</p></div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
            {tasks.map((t: any) => {
              const assignee = t.assignedTo?.profile ? `${t.assignedTo.profile.firstName} ${t.assignedTo.profile.lastName}` : '—';
              const theme = STATUS_THEME[t.status] || STATUS_THEME.pending;
              const Icon = theme.icon;
              return (
                <div key={t.id} style={{
                  background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: '14px', padding: '18px', position: 'relative', overflow: 'hidden',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {/* Top accent */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: theme.color, opacity: 0.6 }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: theme.bg, color: theme.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                        {ZONE_ICONS[t.zone?.zoneType] || '📍'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{t.zone?.name || 'Unknown Zone'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {t.zone?.floor && `Floor ${t.zone.floor}`}
                          {t.schedule?.cleaningType && <span style={{ marginLeft: t.zone?.floor ? '8px' : 0, padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontSize: '10px', fontWeight: 600 }}>{t.schedule.cleaningType}</span>}
                        </div>
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: theme.bg, color: theme.color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      <Icon size={11} /> {t.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Info row */}
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', flexWrap: 'wrap' }}>
                    {t.scheduledTime && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} style={{ opacity: 0.5 }} /> {t.scheduledTime}</span>}
                    {t.schedule?.name && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={11} style={{ opacity: 0.5 }} /> {t.schedule.name}</span>}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={11} style={{ opacity: 0.5 }} /> {assignee}</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {t.status === 'pending' && (
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleStartTask(t.id)}>
                        <Play size={12} /> Start Task
                      </button>
                    )}
                    {t.status === 'in_progress' && (
                      <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => openCompleteModal(t)}>
                        <CheckCircle2 size={12} /> Mark Complete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Schedules Tab ── */}
      {tab === 'schedules' && (
        schedules.length === 0 ? <div className="maint-empty"><Calendar size={32} /><p>No schedules</p></div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
            {schedules.map((s: any) => {
              const freq = FREQ_BADGES[s.frequencyType] || FREQ_BADGES.daily;
              const assignee = s.assignedTo?.profile ? `${s.assignedTo.profile.firstName} ${s.assignedTo.profile.lastName}` : 'Unassigned';
              return (
                <div key={s.id} style={{
                  background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: '14px', padding: '18px', position: 'relative', overflow: 'hidden',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${freq.color}, transparent)`, opacity: 0.5 }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{s.name}</div>
                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: s.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)', color: s.status === 'active' ? '#10b981' : '#6b7280', textTransform: 'uppercase' }}>
                      {s.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: freq.bg, color: freq.color }}>{s.frequencyType}</span>
                    {s.cleaningType && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>{s.cleaningType}</span>}
                    {s.scheduledTime && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>⏰ {s.scheduledTime}</span>}
                  </div>

                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={11} /> {s.zone?.name || '—'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={11} /> {assignee}</span>
                    {s.durationMinutes && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Timer size={11} /> {s.durationMinutes} min</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Zones Tab ── */}
      {tab === 'zones' && (
        zones.length === 0 ? <div className="maint-empty"><MapPin size={32} /><p>No zones</p></div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {zones.map((z: any) => (
              <div key={z.id} style={{
                background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '14px', padding: '18px', display: 'flex', gap: '14px', alignItems: 'center',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                  {ZONE_ICONS[z.zoneType] || '📍'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{z.name}</div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    {z.zoneType && <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(168,85,247,0.1)', color: '#c084fc', fontWeight: 600 }}>{z.zoneType}</span>}
                    {z.floor && <span>Floor {z.floor}</span>}
                    {z.areaSqm && <span>{Number(z.areaSqm).toLocaleString()} sqm</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{z.property?.name}</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Zone Modal ── */}
      {showZoneModal && (
        <div className="modal-overlay">
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

      {/* ── Schedule Modal ── */}
      {showScheduleModal && (
        <div className="modal-overlay">
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

      {/* ── Complete Task with Checklist Modal ── */}
      {completeTaskId && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><CheckCircle2 size={18} /></span> Complete Task</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setCompleteTaskId(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
              {/* Checklist */}
              <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                Checklist ({clChecklist.filter(c => c.checked).length}/{clChecklist.length} done)
              </label>
              <div className="insp-checklist-form">
                {clChecklist.map((item, idx) => (
                  <div key={idx} className="hk-cl-row">
                    <label className="hk-cl-check">
                      <input type="checkbox" checked={item.checked}
                        onChange={(e) => {
                          const u = [...clChecklist];
                          u[idx] = { ...u[idx], checked: e.target.checked };
                          setClChecklist(u);
                        }} />
                      <span className={item.checked ? 'hk-cl-done' : ''}>{item.item}</span>
                    </label>
                    <input className="insp-cl-notes" placeholder="Notes..."
                      value={item.notes}
                      onChange={(e) => {
                        const u = [...clChecklist];
                        u[idx] = { ...u[idx], notes: e.target.value };
                        setClChecklist(u);
                      }} />
                  </div>
                ))}
              </div>

              {/* Quality Score */}
              <div style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                  Quality Score
                </label>
                <div className="insp-score-picker">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} type="button"
                      className={`insp-score-btn ${clScore === s ? 'active' : ''}`}
                      style={{ '--score-color': s >= 4 ? '#10b981' : s >= 3 ? '#eab308' : '#ef4444' } as any}
                      onClick={() => setClScore(s)}>
                      <Star size={16} fill={clScore >= s ? (s >= 4 ? '#10b981' : s >= 3 ? '#eab308' : '#ef4444') : 'none'}
                        color={clScore >= s ? (s >= 4 ? '#10b981' : s >= 3 ? '#eab308' : '#ef4444') : 'var(--text-tertiary)'}
                        strokeWidth={clScore >= s ? 0 : 1.5} />
                      <span style={{ fontSize: '10px' }}>{s}</span>
                    </button>
                  ))}
                  <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: '8px',
                    color: clScore >= 4 ? '#10b981' : clScore >= 3 ? '#eab308' : '#ef4444' }}>
                    {['', 'Poor', 'Below Avg', 'Average', 'Good', 'Excellent'][clScore]}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>Notes</label>
                <textarea value={clNotes} onChange={(e) => setClNotes(e.target.value)}
                  rows={2} placeholder="Any additional notes..." />
              </div>
            </div>
            <div className="maint-modal-footer">
              <button className="btn btn-ghost" onClick={() => setCompleteTaskId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }}
                onClick={handleCompleteWithChecklist}>
                <CheckCircle2 size={16} /> Complete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
