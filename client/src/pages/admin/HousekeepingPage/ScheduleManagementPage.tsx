import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetHkSchedulesQuery, useCreateHkScheduleMutation, useGetHkZonesQuery,
} from '../../../store/api/housekeepingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Calendar, Plus, Loader2, Inbox, XCircle, MapPin, Users, Timer,
  Clock, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const FREQ_BADGES: Record<string, { bg: string; color: string }> = {
  daily: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
  weekly: { bg: 'rgba(14,165,233,0.15)', color: '#38bdf8' },
  monthly: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc' },
  custom: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
};
const CLEANING_BADGES: Record<string, { bg: string; color: string }> = {
  routine: { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af' },
  deep_clean: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8' },
  sanitization: { bg: 'rgba(16,185,129,0.12)', color: '#10b981' },
};

export default function ScheduleManagementPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [filterProperty, setFilterProperty] = useState('');

  const { data: schedsData, isLoading } = useGetHkSchedulesQuery({ propertyId: filterProperty || undefined });
  const { data: zonesData } = useGetHkZonesQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createSchedule] = useCreateHkScheduleMutation();

  const schedules = schedsData?.data || [];
  const zones = zonesData?.data || [];
  const properties = propsData?.data || [];

  // Form state for checklist
  const [checklistItems, setChecklistItems] = useState<{ item: string; isRequired: boolean }[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');

  const addCheckItem = () => {
    if (newCheckItem.trim()) {
      setChecklistItems([...checklistItems, { item: newCheckItem.trim(), isRequired: true }]);
      setNewCheckItem('');
    }
  };

  const resetForm = () => { setChecklistItems([]); setNewCheckItem(''); };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createSchedule({
        propertyId: fd.get('propertyId'), zoneId: fd.get('zoneId'),
        name: fd.get('name'), frequencyType: fd.get('frequencyType'),
        scheduledTime: fd.get('scheduledTime') || undefined,
        durationMinutes: parseInt(fd.get('durationMinutes') as string) || undefined,
        cleaningType: fd.get('cleaningType') || undefined,
        staffCount: parseInt(fd.get('staffCount') as string) || 1,
        checklist: checklistItems.length > 0 ? checklistItems : undefined,
      }).unwrap();
      toast.success('Schedule created');
      setShowCreate(false); resetForm();
    } catch { toast.error('Failed to create schedule'); }
  };

  const activeCount = schedules.filter((s: any) => s.status === 'active').length;
  const pausedCount = schedules.filter((s: any) => s.status !== 'active').length;

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Calendar size={22} /></div>
          <div>
            <h1>Schedule Management</h1>
            <p>{schedules.length} cleaning schedules</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Schedule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Calendar size={18} /></div>
          <span className="msc-value">{schedules.length}</span>
          <span className="msc-label">Total Schedules</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><CheckCircle2 size={18} /></div>
          <span className="msc-value">{activeCount}</span>
          <span className="msc-label">Active</span>
        </div>
        {pausedCount > 0 && (
          <div className="maint-stat-card">
            <div className="msc-icon" style={{ background: 'rgba(107,114,128,0.14)', color: '#6b7280' }}>
              <Clock size={18} />
            </div>
            <span className="msc-value">{pausedCount}</span>
            <span className="msc-label">Paused</span>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="maint-toolbar">
        <div className="filter-group">
          <select className="filter-select" value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Schedule Cards */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No schedules configured</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Create schedules to automate daily, weekly, or monthly cleaning tasks
          </p>
        </div>
      ) : (
        <div className="hk-mgmt-grid">
          {schedules.map((s: any) => {
            const freq = FREQ_BADGES[s.frequencyType] || FREQ_BADGES.daily;
            const ct = CLEANING_BADGES[s.cleaningType] || CLEANING_BADGES.routine;
            const assignee = s.assignedTo?.profile
              ? `${s.assignedTo.profile.firstName} ${s.assignedTo.profile.lastName}`
              : 'Unassigned';
            const checklist = Array.isArray(s.checklist) ? s.checklist : [];
            return (
              <div key={s.id} className="hk-mgmt-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {/* Top accent */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${freq.color}, transparent)`, opacity: 0.5, borderRadius: '12px 12px 0 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="hk-mgmt-name">{s.name}</div>
                  <span style={{
                    padding: '2px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                    background: s.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                    color: s.status === 'active' ? '#10b981' : '#6b7280',
                    textTransform: 'uppercase',
                  }}>{s.status}</span>
                </div>

                <div className="hk-sched-badges">
                  <span className="hk-mgmt-tag" style={{ background: freq.bg, color: freq.color }}>{s.frequencyType}</span>
                  {s.cleaningType && (
                    <span className="hk-mgmt-tag" style={{ background: ct.bg, color: ct.color }}>{s.cleaningType.replace('_', ' ')}</span>
                  )}
                  {s.scheduledTime && (
                    <span className="hk-mgmt-tag" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                      ⏰ {s.scheduledTime}
                    </span>
                  )}
                </div>

                <div className="hk-mgmt-meta">
                  <span><MapPin size={11} /> {s.zone?.name || '—'}</span>
                  <span><Users size={11} /> {assignee}</span>
                  {s.durationMinutes && <span><Timer size={11} /> {s.durationMinutes}m</span>}
                  {s.staffCount > 1 && <span>👥 {s.staffCount} staff</span>}
                </div>

                {checklist.length > 0 && (
                  <div className="hk-checklist-preview">
                    <strong style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      Checklist ({checklist.length})
                    </strong>
                    {checklist.slice(0, 3).map((c: any, i: number) => (
                      <span key={i}>• {typeof c === 'string' ? c : c.item}</span>
                    ))}
                    {checklist.length > 3 && (
                      <span style={{ fontStyle: 'italic' }}>+{checklist.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Schedule Modal */}
      {showCreate && (
        <div className="maint-modal-backdrop" onClick={() => { setShowCreate(false); resetForm(); }}>
          <div className="maint-modal" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><Calendar size={18} /></span> New Schedule</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowCreate(false); resetForm(); }}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Property *</label>
                    <select name="propertyId" required>
                      <option value="">Select...</option>
                      {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Zone *</label>
                    <select name="zoneId" required>
                      <option value="">Select...</option>
                      {zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Schedule Name *</label>
                  <input name="name" required placeholder="Daily Lobby Cleaning" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Frequency *</label>
                    <select name="frequencyType" required>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cleaning Type</label>
                    <select name="cleaningType">
                      <option value="routine">Routine</option>
                      <option value="deep_clean">Deep Clean</option>
                      <option value="sanitization">Sanitization</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Scheduled Time</label>
                    <input name="scheduledTime" type="time" />
                  </div>
                  <div className="form-group">
                    <label>Duration (min)</label>
                    <input name="durationMinutes" type="number" min="1" placeholder="30" />
                  </div>
                  <div className="form-group">
                    <label>Staff Count</label>
                    <input name="staffCount" type="number" min="1" defaultValue="1" />
                  </div>
                </div>

                {/* Checklist Builder */}
                <div style={{ marginTop: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                    Checklist Items
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input placeholder="Add checklist item..."
                      value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCheckItem())}
                      style={{ flex: 1 }} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addCheckItem}
                      disabled={!newCheckItem.trim()}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {checklistItems.length > 0 && (
                    <div className="insp-checklist-form">
                      {checklistItems.map((item, idx) => (
                        <div key={idx} className="hk-cl-row">
                          <span style={{ fontSize: '13px' }}>• {item.item}</span>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#ef4444', padding: '2px' }}
                            onClick={() => setChecklistItems(checklistItems.filter((_, i) => i !== idx))}>
                            <XCircle size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Calendar size={16} /> Create Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
