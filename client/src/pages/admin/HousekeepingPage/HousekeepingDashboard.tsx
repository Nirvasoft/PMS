import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetHkStatsQuery, useGetHkTasksQuery,
  useGetHkZonesQuery, useGetHkSchedulesQuery, useGetHkInspectionsQuery,
  useStartHkTaskMutation, useCompleteHkTaskMutation,
} from '../../../store/api/housekeepingApi';
import {
  Sparkles, CheckCircle2, Clock, AlertTriangle,
  Play, XCircle, MapPin, Star, BarChart3, Calendar,
  ClipboardCheck, ArrowRight, TrendingUp, Gauge, Timer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'Pending' },
  in_progress: { color: '#6366f1', bg: 'rgba(99,102,241,0.12)', label: 'In Progress' },
  completed: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Done' },
  missed: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Missed' },
};

const SCORE_COLORS = ['', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981'];
const ZONE_TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  corridor: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  lobby: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  car_park: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
  amenity: { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  office: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  restroom: { color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  other: { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

export default function HousekeepingDashboard() {
  const navigate = useNavigate();
  const [propertyId] = useState<string | undefined>(undefined);

  const { data: statsResp, isLoading: statsLoading } = useGetHkStatsQuery({ propertyId });
  const today = new Date().toISOString().split('T')[0];
  const { data: tasksResp } = useGetHkTasksQuery({ date: today, limit: 50 });
  const { data: zonesResp } = useGetHkZonesQuery({ propertyId });
  const { data: schedulesResp } = useGetHkSchedulesQuery({ propertyId });
  const { data: inspResp } = useGetHkInspectionsQuery({ propertyId });
  const [startTask] = useStartHkTaskMutation();
  const [completeTask] = useCompleteHkTaskMutation();

  const stats = statsResp?.data;
  const todayTasks = tasksResp?.data || [];
  const zones = zonesResp?.data || [];
  const schedules = schedulesResp?.data || [];
  const inspections = (inspResp?.data || []).slice(0, 5);

  const handleStart = async (id: string) => {
    try { await startTask(id).unwrap(); toast.success('Task started'); } catch { toast.error('Failed'); }
  };
  const handleComplete = async (id: string) => {
    try { await completeTask({ id, data: {} }).unwrap(); toast.success('Completed'); } catch { toast.error('Failed'); }
  };

  const avgInspScore = inspections.length > 0
    ? inspections.reduce((s: number, i: any) => s + (i.overallScore || 0), 0) / inspections.length
    : 0;

  if (statsLoading) {
    return (
      <div className="maint-page">
        <TableSkeleton columns={5} rows={5} />
      </div>
    );
  }

  const completion = stats?.today?.completionRate ?? 0;
  const pending = stats?.today?.pending ?? 0;
  const inProgress = stats?.today?.inProgress ?? 0;
  const completed = stats?.today?.completed ?? 0;
  const missed = stats?.today?.missed ?? 0;
  const totalTasks = stats?.today?.total ?? 0;

  // Completion ring SVG params
  const ringR = 38, ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC - (completion / 100) * ringC;
  const ringColor = completion >= 80 ? '#10b981' : completion >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="maint-page">
      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Header Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Sparkles size={22} /></div>
          <div>
            <h1>Housekeeping Dashboard</h1>
            <p>Today's overview Ã‚Â· {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/housekeeping')}>
            <Calendar size={14} /> Tasks & Schedules
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/housekeeping/inspections')}>
            <ClipboardCheck size={14} /> Inspections
          </button>
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Hero Stats Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="hk-hero-stats">
        {/* Completion */}
        <div
          className="hk-hero-stat-card"
          style={{ '--stat-accent': ringColor } as React.CSSProperties}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${ringColor}18`, color: ringColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={15} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completion</span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.03em', color: ringColor }}>{completion}%</div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-elevated)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${completion}%`, background: ringColor, transition: 'width 0.6s' }} />
          </div>
        </div>
        {/* Pending */}
        <div
          className="hk-hero-stat-card"
          style={{ '--stat-accent': '#64748b' } as React.CSSProperties}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(100,116,139,0.14)', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={15} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending</span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>{pending}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 500 }}>awaiting start</div>
        </div>
        {/* In Progress */}
        <div
          className="hk-hero-stat-card"
          style={{ '--stat-accent': '#6366f1' } as React.CSSProperties}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={15} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In Progress</span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#6366f1' }}>{inProgress}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 500 }}>active now</div>
        </div>
        {/* Completed */}
        <div
          className="hk-hero-stat-card"
          style={{ '--stat-accent': '#10b981' } as React.CSSProperties}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={15} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed</span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#10b981' }}>{completed}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 500 }}>tasks done</div>
        </div>
        {/* Missed */}
        <div
          className="hk-hero-stat-card"
          style={{ '--stat-accent': missed > 0 ? '#ef4444' : '#64748b' } as React.CSSProperties}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: missed > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.12)', color: missed > 0 ? '#ef4444' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XCircle size={15} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Missed</span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.03em', color: missed > 0 ? '#ef4444' : 'var(--text-primary)' }}>{missed}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 500 }}>{missed === 0 ? 'none missed Ã¢Å“â€œ' : 'need attention'}</div>
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Main Grid Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="hk-dash-main-grid">
        {/* Left */}
        <div className="hk-dash-col">
          {/* Today's Progress */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={16} /> Today's Progress</h3>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, padding: '3px 9px', borderRadius: 8, background: 'var(--surface-hover)' }}>
                {totalTasks} total
              </span>
            </div>
            {/* Circular ring + stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '6px 0' }}>
              <svg width={96} height={96} style={{ flexShrink: 0 }}>
                <circle cx={48} cy={48} r={ringR} fill="none" stroke="var(--surface-elevated)" strokeWidth={7} />
                <circle cx={48} cy={48} r={ringR} fill="none" stroke={ringColor} strokeWidth={7}
                  strokeDasharray={ringC} strokeDashoffset={ringOffset}
                  strokeLinecap="round" transform="rotate(-90 48 48)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                <text x={48} y={44} textAnchor="middle" fontSize={18} fontWeight={800}
                  fill={ringColor}>{completion}%</text>
                <text x={48} y={58} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="var(--text-tertiary)">complete</text>
              </svg>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
                {[
                  { label: 'Done', val: completed, color: '#10b981' },
                  { label: 'Active', val: inProgress, color: '#6366f1' },
                  { label: 'Pending', val: pending, color: '#64748b' },
                  { label: 'Missed', val: missed, color: '#ef4444' },
                ].map(s => (
                  <div key={s.label} className="hk-mini-stat-box">
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{s.val}</div>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-tertiary)' }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Tasks */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3>
                <Sparkles size={16} /> Active & Pending
                {todayTasks.filter((t: any) => t.status !== 'completed').length > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.14)', color: '#6366f1' }}>
                    {todayTasks.filter((t: any) => t.status !== 'completed').length}
                  </span>
                )}
              </h3>
              <button className="hk-card-link-btn" onClick={() => navigate('/admin/housekeeping')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {todayTasks.filter((t: any) => t.status !== 'completed').length === 0 ? (
              <div className="hk-dash-empty-box">
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(16,185,129,0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={22} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>All tasks completed!</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>Great work today</span>
              </div>
            ) : (
              <div>
                {todayTasks.filter((t: any) => t.status !== 'completed').slice(0, 8).map((task: any) => {
                  const st = STATUS_STYLE[task.status] || STATUS_STYLE.pending;
                  return (
                    <div key={task.id} className="hk-dash-item-row" style={{ borderLeft: `3px solid ${st.color}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {task.schedule?.name || task.zone?.name || 'Task'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          {task.zone && <><MapPin size={10} /> {task.zone.name}</>}
                          {task.scheduledTime && <> Ã‚Â· <Timer size={10} /> {task.scheduledTime}</>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: st.bg, color: st.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {st.label}
                      </span>
                      <PermissionGuard permission="housekeeping-tasks.write">
                        {task.status === 'pending' && (
                          <button onClick={() => handleStart(task.id)} title="Start"
                            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <Play size={12} />
                          </button>
                        )}
                        {task.status === 'in_progress' && (
                          <button onClick={() => handleComplete(task.id)} title="Complete"
                            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <CheckCircle2 size={12} />
                          </button>
                        )}
                      </PermissionGuard>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="hk-dash-col">
          {/* Zones */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><MapPin size={16} /> Zones ({zones.length})</h3>
              <button className="hk-card-link-btn" onClick={() => navigate('/admin/housekeeping/zones')}>
                Manage <ArrowRight size={12} />
              </button>
            </div>
            {zones.length === 0 ? (
              <div className="hk-dash-empty-box">
                <MapPin size={22} color="var(--text-tertiary)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>No zones configured</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {zones.slice(0, 8).map((zone: any) => {
                  const zt = ZONE_TYPE_COLORS[zone.zoneType] || ZONE_TYPE_COLORS.other;
                  return (
                    <div
                      key={zone.id}
                      className="hk-dash-zone-card"
                      onClick={() => navigate('/admin/housekeeping/zones')}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: zt.bg, color: zt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={13} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{zone.name}</div>
                        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', display: 'flex', gap: 4, alignItems: 'center', marginTop: 1 }}>
                          {zone.zoneType && <span style={{ textTransform: 'capitalize' }}>{zone.zoneType.replace('_', ' ')}</span>}
                          {zone.floor && <span>Ã‚Â· F{zone.floor}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {zones.length > 8 && (
                  <div
                    className="hk-dash-zone-card"
                    style={{ justifyContent: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--accent)' }}
                    onClick={() => navigate('/admin/housekeeping/zones')}
                  >
                    +{zones.length - 8} more
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent Inspections */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3>
                <ClipboardCheck size={16} /> Inspections
                {inspections.length > 0 && avgInspScore > 0 && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: `${SCORE_COLORS[Math.round(avgInspScore)] || '#10b981'}18`,
                    color: SCORE_COLORS[Math.round(avgInspScore)] || '#10b981',
                  }}>
                    avg {avgInspScore.toFixed(1)}/5
                  </span>
                )}
              </h3>
              <button className="hk-card-link-btn" onClick={() => navigate('/admin/housekeeping/inspections')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {inspections.length === 0 ? (
              <div className="hk-dash-empty-box">
                <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(100,116,139,0.1)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardCheck size={20} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>No inspections yet</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>Schedule inspections to track quality</span>
              </div>
            ) : (
              <div>
                {inspections.map((insp: any) => {
                  const sc = SCORE_COLORS[insp.overallScore] || 'var(--text-tertiary)';
                  return (
                    <div key={insp.id} className="hk-dash-item-row">
                      <div style={{
                        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                        background: `${sc}18`, color: sc,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 13,
                      }}>
                        {insp.overallScore || 'Ã¢â‚¬â€'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {insp.zone?.name || insp.property?.name || 'General'}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1 }}>
                          {new Date(insp.inspectionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      {insp.actionRequired && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 700,
                          padding: '2px 7px', borderRadius: 6,
                          background: 'rgba(245,158,11,0.14)', color: '#d97706',
                        }}>
                          <AlertTriangle size={10} /> Action
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={11}
                            fill={s <= (insp.overallScore || 0) ? sc : 'none'}
                            stroke={s <= (insp.overallScore || 0) ? sc : 'var(--border)'}
                            strokeWidth={1.6}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><Gauge size={16} /> Summary</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Zones', value: stats?.zones ?? zones.length, icon: MapPin, color: '#6366f1', path: '/admin/housekeeping/zones' },
                { label: 'Schedules', value: stats?.schedules ?? schedules.length, icon: Calendar, color: '#10b981', path: '/admin/housekeeping/schedules' },
                { label: 'Inspections', value: (inspResp?.data || []).length, icon: ClipboardCheck, color: '#f59e0b', path: '/admin/housekeeping/inspections' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="hk-mini-stat-box clickable"
                  onClick={() => navigate(item.path)}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${item.color}16`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <item.icon size={14} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{item.value}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-tertiary)' }}>{item.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
