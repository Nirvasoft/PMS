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
  ClipboardCheck, ArrowRight, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  pending: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  in_progress: { color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  completed: { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  missed: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const SCORE_COLORS = ['', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981'];

export default function HousekeepingDashboard() {
  const navigate = useNavigate();
  const [propertyId, setPropertyId] = useState<string | undefined>(undefined);

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

  // Average inspection score
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

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Sparkles size={22} /></div>
          <div>
            <h1>Housekeeping Dashboard</h1>
            <p>Today's overview · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
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

      {/* Stats Row */}
      <div className="maint-stats-row">
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{
            background: completion >= 80 ? 'rgba(16,185,129,0.14)' : completion >= 50 ? 'rgba(234,179,8,0.14)' : 'rgba(239,68,68,0.14)',
            color: completion >= 80 ? '#10b981' : completion >= 50 ? '#eab308' : '#ef4444',
          }}>
            <TrendingUp size={18} />
          </div>
          <span className="msc-value" style={{
            color: completion >= 80 ? '#10b981' : completion >= 50 ? '#eab308' : '#ef4444',
          }}>{completion}%</span>
          <span className="msc-label">Completion</span>
        </div>
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Clock size={18} /></div>
          <span className="msc-value">{stats?.today?.pending ?? 0}</span>
          <span className="msc-label">Pending</span>
        </div>
        <div className="maint-stat-card purple">
          <div className="msc-icon"><Play size={18} /></div>
          <span className="msc-value">{stats?.today?.inProgress ?? 0}</span>
          <span className="msc-label">In Progress</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><CheckCircle2 size={18} /></div>
          <span className="msc-value">{stats?.today?.completed ?? 0}</span>
          <span className="msc-label">Completed</span>
        </div>
        <div className="maint-stat-card red">
          <div className="msc-icon"><XCircle size={18} /></div>
          <span className="msc-value">{stats?.today?.missed ?? 0}</span>
          <span className="msc-label">Missed</span>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="hk-dash-grid">
        {/* Left Column */}
        <div className="hk-dash-col">
          {/* Today's Task Progress */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={15} /> Today's Progress</h3>
              <span className="cell-secondary" style={{ fontSize: '11px' }}>
                {stats?.today?.total ?? 0} total tasks
              </span>
            </div>
            {/* Progress Bar */}
            <div className="hk-progress-bar">
              <div className="hk-progress-fill" style={{
                width: `${completion}%`,
                background: completion >= 80 ? 'linear-gradient(90deg, #10b981, #34d399)' :
                  completion >= 50 ? 'linear-gradient(90deg, #eab308, #facc15)' :
                  'linear-gradient(90deg, #ef4444, #f87171)',
              }} />
            </div>
            <div className="hk-progress-labels">
              <span style={{ color: '#10b981' }}>{stats?.today?.completed ?? 0} done</span>
              <span style={{ color: '#6366f1' }}>{stats?.today?.inProgress ?? 0} active</span>
              <span style={{ color: '#6b7280' }}>{stats?.today?.pending ?? 0} pending</span>
              {(stats?.today?.missed ?? 0) > 0 && (
                <span style={{ color: '#ef4444' }}>{stats.today.missed} missed</span>
              )}
            </div>
          </div>

          {/* Active Tasks */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><Sparkles size={15} /> Active & Pending Tasks</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/housekeeping')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {todayTasks.filter((t: any) => t.status !== 'completed').length === 0 ? (
              <div className="hk-dash-empty">
                <CheckCircle2 size={24} color="#10b981" />
                <span>All tasks completed for today!</span>
              </div>
            ) : (
              <div className="hk-task-list">
                {todayTasks
                  .filter((t: any) => t.status !== 'completed')
                  .slice(0, 8)
                  .map((task: any) => {
                    const st = STATUS_STYLE[task.status] || STATUS_STYLE.pending;
                    return (
                      <div key={task.id} className="hk-task-row">
                        <div className="hk-task-info">
                          <span className="hk-task-name">
                            {task.schedule?.name || task.zone?.name || 'Task'}
                          </span>
                          <span className="hk-task-meta">
                            {task.zone && <><MapPin size={10} /> {task.zone.name}</>}
                            {task.scheduledTime && <> · {task.scheduledTime}</>}
                          </span>
                        </div>
                        <div className="hk-task-actions">
                          <span className="hk-task-status" style={{ background: st.bg, color: st.color }}>
                            {task.status.replace('_', ' ')}
                          </span>
                          {task.status === 'pending' && (
                            <button className="btn btn-ghost btn-sm" style={{ color: '#6366f1' }}
                              onClick={() => handleStart(task.id)}>
                              <Play size={12} />
                            </button>
                          )}
                          {task.status === 'in_progress' && (
                            <button className="btn btn-ghost btn-sm" style={{ color: '#10b981' }}
                              onClick={() => handleComplete(task.id)}>
                              <CheckCircle2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="hk-dash-col">
          {/* Zones Overview */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><MapPin size={15} /> Zones ({zones.length})</h3>
            </div>
            {zones.length === 0 ? (
              <div className="hk-dash-empty">
                <MapPin size={20} color="var(--text-tertiary)" />
                <span>No zones configured</span>
              </div>
            ) : (
              <div className="hk-zone-list">
                {zones.slice(0, 6).map((zone: any) => (
                  <div key={zone.id} className="hk-zone-chip">
                    <MapPin size={12} />
                    <span>{zone.name}</span>
                    {zone.zoneType && (
                      <span className="hk-zone-type">{zone.zoneType}</span>
                    )}
                    {zone.floor && (
                      <span className="hk-zone-floor">F{zone.floor}</span>
                    )}
                  </div>
                ))}
                {zones.length > 6 && (
                  <span className="hk-zone-more">+{zones.length - 6} more</span>
                )}
              </div>
            )}
          </div>

          {/* Recent Inspections */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><ClipboardCheck size={15} /> Recent Inspections</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/housekeeping/inspections')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {inspections.length === 0 ? (
              <div className="hk-dash-empty">
                <ClipboardCheck size={20} color="var(--text-tertiary)" />
                <span>No inspections yet</span>
              </div>
            ) : (
              <div className="hk-insp-list">
                {inspections.map((insp: any) => (
                  <div key={insp.id} className="hk-insp-row">
                    <div className="hk-insp-score" style={{
                      background: SCORE_COLORS[insp.overallScore] ? `${SCORE_COLORS[insp.overallScore]}18` : undefined,
                      color: SCORE_COLORS[insp.overallScore] || 'var(--text-tertiary)',
                    }}>
                      <Star size={12} fill={SCORE_COLORS[insp.overallScore] || 'none'} />
                      {insp.overallScore || '—'}
                    </div>
                    <div className="hk-insp-info">
                      <span className="hk-insp-zone">{insp.zone?.name || insp.property?.name || 'General'}</span>
                      <span className="hk-insp-date">{new Date(insp.inspectionDate).toLocaleDateString()}</span>
                    </div>
                    {insp.actionRequired && (
                      <AlertTriangle size={13} color="#f59e0b" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {inspections.length > 0 && (
              <div className="hk-avg-score">
                Avg Score: <strong style={{ color: SCORE_COLORS[Math.round(avgInspScore)] || '#10b981' }}>
                  {avgInspScore.toFixed(1)}/5
                </strong>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={15} /> Quick Stats</h3>
            </div>
            <div className="hk-quick-stats">
              <div className="hk-qs-item">
                <span className="hk-qs-label">Active Zones</span>
                <span className="hk-qs-value">{stats?.zones ?? 0}</span>
              </div>
              <div className="hk-qs-item">
                <span className="hk-qs-label">Active Schedules</span>
                <span className="hk-qs-value">{stats?.schedules ?? 0}</span>
              </div>
              <div className="hk-qs-item">
                <span className="hk-qs-label">Total Inspections</span>
                <span className="hk-qs-value">{(inspResp?.data || []).length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
