import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetHkStatsQuery, useGetHkTasksQuery,
  useGetHkZonesQuery, useGetHkSchedulesQuery, useGetHkInspectionsQuery,
  useStartHkTaskMutation, useCompleteHkTaskMutation,
} from '../../../store/api/housekeepingApi';
import {
  Sparkles, Loader2, CheckCircle2, Clock, AlertTriangle,
  Play, XCircle, MapPin, Star, BarChart3, Calendar,
  ClipboardCheck, ArrowRight, TrendingUp, Gauge, Timer,
  Layers, Users, Zap, CircleDot,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading dashboard...</div>
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
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', margin: 0,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={18} color="#fff" />
            </div>
            Housekeeping Dashboard
          </h1>
          <p style={{ margin: '4px 0 0 46px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Today's overview · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/housekeeping')}
            style={{ borderRadius: 10 }}>
            <Calendar size={14} /> Tasks & Schedules
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/housekeeping/inspections')}
            style={{ borderRadius: 10 }}>
            <ClipboardCheck size={14} /> Inspections
          </button>
        </div>
      </div>

      {/* ── Hero Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        {/* Completion */}
        <div style={{
          borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden',
          background: `linear-gradient(135deg, ${ringColor}12, ${ringColor}06)`,
          border: `1px solid ${ringColor}25`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `${ringColor}18`, color: ringColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completion</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: ringColor }}>{completion}%</div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-hover)', marginTop: 6 }}>
            <div style={{ height: '100%', borderRadius: 2, width: `${completion}%`, background: ringColor, transition: 'width 0.6s' }} />
          </div>
        </div>
        {/* Pending */}
        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(107,114,128,0.06), rgba(107,114,128,0.02))',
          border: '1px solid rgba(107,114,128,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(107,114,128,0.12)', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em' }}>{pending}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>awaiting start</div>
        </div>
        {/* In Progress */}
        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03))',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In Progress</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#6366f1' }}>{inProgress}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>active now</div>
        </div>
        {/* Completed */}
        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))',
          border: '1px solid rgba(16,185,129,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#10b981' }}>{completed}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>tasks done</div>
        </div>
        {/* Missed */}
        <div style={{
          borderRadius: 14, padding: '16px 18px', overflow: 'hidden',
          background: missed > 0 ? 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))' : 'linear-gradient(135deg, rgba(107,114,128,0.04), rgba(107,114,128,0.02))',
          border: `1px solid ${missed > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.1)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: missed > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.1)', color: missed > 0 ? '#ef4444' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XCircle size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Missed</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: missed > 0 ? '#ef4444' : 'var(--text-primary)' }}>{missed}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{missed === 0 ? 'none missed ✓' : 'need attention'}</div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Today's Progress */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={15} /> Today's Progress</h3>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{totalTasks} total</span>
            </div>
            {/* Circular ring + stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '8px 0' }}>
              <svg width={92} height={92} style={{ flexShrink: 0 }}>
                <circle cx={46} cy={46} r={ringR} fill="none" stroke="var(--surface-hover)" strokeWidth={6} />
                <circle cx={46} cy={46} r={ringR} fill="none" stroke={ringColor} strokeWidth={6}
                  strokeDasharray={ringC} strokeDashoffset={ringOffset}
                  strokeLinecap="round" transform="rotate(-90 46 46)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                <text x={46} y={42} textAnchor="middle" fontSize={18} fontWeight={800}
                  fill={ringColor}>{completion}%</text>
                <text x={46} y={56} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)">complete</text>
              </svg>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
                {[
                  { label: 'Done', val: completed, color: '#10b981' },
                  { label: 'Active', val: inProgress, color: '#6366f1' },
                  { label: 'Pending', val: pending, color: '#6b7280' },
                  { label: 'Missed', val: missed, color: '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{s.val}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Tasks */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={15} /> Active & Pending
                {todayTasks.filter((t: any) => t.status !== 'completed').length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
                    {todayTasks.filter((t: any) => t.status !== 'completed').length}
                  </span>
                )}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/housekeeping')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {todayTasks.filter((t: any) => t.status !== 'completed').length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px', gap: 8 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={22} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>All tasks completed!</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Great work today</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {todayTasks.filter((t: any) => t.status !== 'completed').slice(0, 8).map((task: any, idx: number, arr: any[]) => {
                  const st = STATUS_STYLE[task.status] || STATUS_STYLE.pending;
                  return (
                    <div key={task.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px',
                      borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      borderLeft: `3px solid ${st.color}`, paddingLeft: 12, borderRadius: '0 0 0 0',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {task.schedule?.name || task.zone?.name || 'Task'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {task.zone && <><MapPin size={9} /> {task.zone.name}</>}
                          {task.scheduledTime && <> · <Timer size={9} /> {task.scheduledTime}</>}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {st.label}
                      </span>
                      {task.status === 'pending' && (
                        <button onClick={() => handleStart(task.id)} title="Start"
                          style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.08)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <Play size={11} />
                        </button>
                      )}
                      {task.status === 'in_progress' && (
                        <button onClick={() => handleComplete(task.id)} title="Complete"
                          style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.08)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <CheckCircle2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Zones */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><MapPin size={15} /> Zones ({zones.length})</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/housekeeping/zones')}>
                Manage <ArrowRight size={12} />
              </button>
            </div>
            {zones.length === 0 ? (
              <div className="hk-dash-empty">
                <MapPin size={20} color="var(--text-tertiary)" />
                <span>No zones configured</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, paddingTop: 4 }}>
                {zones.slice(0, 8).map((zone: any, i: number) => {
                  const zt = ZONE_TYPE_COLORS[zone.zoneType] || ZONE_TYPE_COLORS.other;
                  return (
                    <div key={zone.id} style={{
                      padding: '8px 10px', borderRadius: 10,
                      border: `1px solid ${zt.color}20`,
                      background: zt.bg,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <MapPin size={12} style={{ color: zt.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{zone.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'flex', gap: 4, alignItems: 'center' }}>
                          {zone.zoneType && <span style={{ textTransform: 'capitalize' }}>{zone.zoneType.replace('_', ' ')}</span>}
                          {zone.floor && <span>· F{zone.floor}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {zones.length > 8 && (
                  <div style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', cursor: 'pointer' }}
                    onClick={() => navigate('/admin/housekeeping/zones')}>
                    +{zones.length - 8} more
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent Inspections */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardCheck size={15} /> Inspections
                {inspections.length > 0 && avgInspScore > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                    background: `${SCORE_COLORS[Math.round(avgInspScore)] || '#10b981'}15`,
                    color: SCORE_COLORS[Math.round(avgInspScore)] || '#10b981',
                  }}>
                    avg {avgInspScore.toFixed(1)}/5
                  </span>
                )}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/housekeeping/inspections')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {inspections.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px', gap: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(107,114,128,0.08)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardCheck size={20} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>No inspections yet</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Schedule inspections to track quality</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {inspections.map((insp: any, idx: number) => {
                  const sc = SCORE_COLORS[insp.overallScore] || 'var(--text-tertiary)';
                  return (
                    <div key={insp.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px',
                      borderBottom: idx < inspections.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: `${sc}15`, color: sc,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 13,
                      }}>
                        {insp.overallScore || '—'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {insp.zone?.name || insp.property?.name || 'General'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {new Date(insp.inspectionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      {insp.actionRequired && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 6,
                          background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                        }}>
                          <AlertTriangle size={9} /> Action
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={10}
                            fill={s <= (insp.overallScore || 0) ? sc : 'none'}
                            stroke={s <= (insp.overallScore || 0) ? sc : 'var(--text-tertiary)'}
                            strokeWidth={1.5}
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
          <div className="hk-dash-card" style={{ padding: '14px 18px' }}>
            <div className="hk-dash-card-header" style={{ marginBottom: 10 }}>
              <h3><Gauge size={15} /> Summary</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Zones', value: stats?.zones ?? zones.length, icon: MapPin, color: '#6366f1' },
                { label: 'Schedules', value: stats?.schedules ?? schedules.length, icon: Calendar, color: '#10b981' },
                { label: 'Inspections', value: (inspResp?.data || []).length, icon: ClipboardCheck, color: '#f59e0b' },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: `${item.color}12`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <item.icon size={12} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>{item.value}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{item.label}</div>
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
