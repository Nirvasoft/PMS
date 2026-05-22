import '../MaintenancePage/MaintenancePage.css';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetPmScheduleByIdQuery, useGetPmScheduleHistoryQuery,
  usePausePmScheduleMutation, useResumePmScheduleMutation,
  useGeneratePmWorkOrderMutation,
} from '../../../store/api/pmApi';
import {
  CalendarClock, ArrowLeft, Loader2, Clock, Play, Pause, Zap,
  CheckCircle2, XCircle, AlertTriangle, ListChecks, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

const FREQUENCIES: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', semi_annual: 'Semi-Annual',
  annual: 'Annual', custom_days: 'Custom',
};

export default function PmScheduleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: scheduleData, isLoading } = useGetPmScheduleByIdQuery(id!);
  const { data: historyData } = useGetPmScheduleHistoryQuery(id!);
  const [pauseSchedule] = usePausePmScheduleMutation();
  const [resumeSchedule] = useResumePmScheduleMutation();
  const [generateWo] = useGeneratePmWorkOrderMutation();

  const schedule = scheduleData?.data;
  const history = historyData?.data || [];

  if (isLoading) return <div className="maint-page"><div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div></div>;
  if (!schedule) return <div className="maint-page"><div className="maint-empty"><p>Schedule not found</p></div></div>;

  const daysUntilDue = Math.ceil((new Date(schedule.nextDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const checklist = (schedule.checklistTemplate || []) as Array<{ item: string; isRequired: boolean; notes?: string }>;

  const handlePause = async () => {
    try { await pauseSchedule(id!).unwrap(); toast.success('Paused'); } catch { toast.error('Failed'); }
  };
  const handleResume = async () => {
    try { await resumeSchedule(id!).unwrap(); toast.success('Resumed'); } catch { toast.error('Failed'); }
  };
  const handleGenerate = async () => {
    try { await generateWo(id!).unwrap(); toast.success('Work order generated!'); } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed'); }
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/maintenance/pm')}>
            <ArrowLeft size={16} />
          </button>
          <div className="page-icon-lg"><CalendarClock size={22} /></div>
          <div>
            <h1>{schedule.name}</h1>
            <p>{schedule.property?.name} · {FREQUENCIES[schedule.frequencyType]} · <span className={`maint-priority ${schedule.priority?.toLowerCase()}`}>{schedule.priority}</span></p>
          </div>
        </div>
        <div className="header-actions">
          {schedule.status === 'active' && (
            <>
              <button className="btn btn-ghost" onClick={handlePause}><Pause size={16} /> Pause</button>
              <button className="btn btn-primary" onClick={handleGenerate}><Zap size={16} /> Generate WO</button>
            </>
          )}
          {schedule.status === 'paused' && (
            <button className="btn btn-primary" onClick={handleResume}><Play size={16} /> Resume</button>
          )}
        </div>
      </div>

      {/* Detail Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Schedule Info */}
        <div className="sla-defaults-card">
          <h3><FileText size={16} /> Schedule Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '12px', fontSize: '13px' }}>
            <div>
              <span className="cell-secondary">Status</span>
              <div style={{ marginTop: '4px' }}>
                <span className={`maint-status ${schedule.status === 'active' ? 'in_progress' : schedule.status === 'paused' ? 'pending_parts' : 'closed'}`}>
                  {schedule.status}
                </span>
              </div>
            </div>
            <div>
              <span className="cell-secondary">Frequency</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {FREQUENCIES[schedule.frequencyType]}
                {schedule.frequencyValue > 1 && ` (every ${schedule.frequencyValue})`}
              </div>
            </div>
            <div>
              <span className="cell-secondary">Next Due Date</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {new Date(schedule.nextDueDate).toLocaleDateString()}
                <span style={{ marginLeft: '8px', fontSize: '12px', color: daysUntilDue < 0 ? '#ef4444' : daysUntilDue <= 7 ? '#f59e0b' : '#22c55e' }}>
                  ({daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? 'Today' : `${daysUntilDue}d left`})
                </span>
              </div>
            </div>
            <div>
              <span className="cell-secondary">Advance Days</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>{schedule.advanceDays} days before due</div>
            </div>
            <div>
              <span className="cell-secondary">Estimated Hours</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>{Number(schedule.estimatedHours)}h</div>
            </div>
            <div>
              <span className="cell-secondary">Assigned To</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {schedule.assignedTo?.profile
                  ? `${schedule.assignedTo.profile.firstName} ${schedule.assignedTo.profile.lastName}`
                  : schedule.assignedRole || '—'}
              </div>
            </div>
            <div>
              <span className="cell-secondary">Category</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>{schedule.category?.name || '—'}</div>
            </div>
            <div>
              <span className="cell-secondary">Last Performed</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {schedule.lastPerformedAt ? new Date(schedule.lastPerformedAt).toLocaleDateString() : 'Never'}
              </div>
            </div>
          </div>
          {schedule.description && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>Description:</strong> {schedule.description}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="sla-defaults-card">
          <h3><ListChecks size={16} /> Checklist Template ({checklist.length} items)</h3>
          {checklist.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '12px' }}>No checklist items</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
              {checklist.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                  fontSize: '13px',
                }}>
                  <CheckCircle2 size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{item.item}</span>
                  {item.isRequired && (
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                      Required
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Service History */}
      <div className="maint-table-wrap">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
            <Clock size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            Service History ({history.length})
          </h3>
        </div>
        <table className="maint-table">
          <thead>
            <tr>
              <th>Due Date</th>
              <th>Status</th>
              <th>Completed At</th>
              <th>Completed By</th>
              <th>Ticket</th>
              <th>Findings</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="maint-empty" style={{ padding: '24px 0' }}>
                    <p>No service history yet</p>
                  </div>
                </td>
              </tr>
            ) : history.map((wo: any) => (
              <tr key={wo.id}>
                <td><span className="cell-mono">{new Date(wo.dueDate).toLocaleDateString()}</span></td>
                <td>
                  <span className={`maint-status ${wo.status === 'completed' ? 'completed' : wo.status === 'overdue' ? 'cancelled' : 'open'}`}>
                    {wo.status}
                  </span>
                </td>
                <td><span className="cell-secondary">{wo.completedAt ? new Date(wo.completedAt).toLocaleString() : '—'}</span></td>
                <td>
                  <span className="cell-secondary">
                    {wo.completedBy?.profile ? `${wo.completedBy.profile.firstName} ${wo.completedBy.profile.lastName}` : '—'}
                  </span>
                </td>
                <td>
                  {wo.ticket ? (
                    <span className="cell-mono" style={{ cursor: 'pointer', color: 'var(--primary)' }}
                      onClick={() => navigate(`/admin/maintenance/tickets/${wo.ticket.id}`)}
                    >
                      {wo.ticket.ticketNumber}
                    </span>
                  ) : '—'}
                </td>
                <td>
                  <span className="cell-secondary" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {wo.findings || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
