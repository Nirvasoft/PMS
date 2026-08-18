import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetPatrolSchedulesQuery, useCreatePatrolScheduleMutation,
  useGetPatrolCheckpointsQuery, useCreatePatrolCheckpointMutation,
  useGetSecurityStatsQuery,
} from '../../../store/api/securityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  MapPin, Plus, Loader2, Inbox, XCircle, Building2, Users, Clock,
  Shield, CheckCircle2, QrCode,
} from 'lucide-react';
import toast from 'react-hot-toast';

const FREQ_BADGES: Record<string, { bg: string; color: string }> = {
  hourly: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
  every_2h: { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
  every_4h: { bg: 'rgba(234,179,8,0.12)', color: '#eab308' },
  daily: { bg: 'rgba(99,102,241,0.12)', color: '#818cf8' },
  custom: { bg: 'rgba(168,85,247,0.12)', color: '#c084fc' },
};

export default function PatrolScheduleManagement() {
  const [tab, setTab] = useState<'schedules' | 'checkpoints'>('schedules');
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [showCreateCheckpoint, setShowCreateCheckpoint] = useState(false);
  const [filterProperty, setFilterProperty] = useState('');

  const { data: schedsData, isLoading } = useGetPatrolSchedulesQuery({ propertyId: filterProperty || undefined });
  const { data: chkData } = useGetPatrolCheckpointsQuery({ propertyId: filterProperty || undefined });
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: statsResp } = useGetSecurityStatsQuery({});
  const [createSchedule] = useCreatePatrolScheduleMutation();
  const [createCheckpoint] = useCreatePatrolCheckpointMutation();

  const schedules = schedsData?.data || [];
  const checkpoints = chkData?.data || [];
  const properties = propsData?.data || [];
  const stats = statsResp?.data;

  const handleCreateSchedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const chkIds = Array.from(fd.getAll('checkpoints')).filter(Boolean) as string[];
    try {
      await createSchedule({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        frequencyType: fd.get('frequencyType'),
        checkpoints: chkIds,
        customTimes: (fd.get('customTimes') as string || '').split(',').map(s => s.trim()).filter(Boolean),
        assignedToId: fd.get('assignedToId') || undefined,
      }).unwrap();
      toast.success('Schedule created');
      setShowCreateSchedule(false);
    } catch { toast.error('Failed'); }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createCheckpoint({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        location: fd.get('location') || undefined, floor: fd.get('floor') || undefined,
        sortOrder: parseInt(fd.get('sortOrder') as string) || 0,
      }).unwrap();
      toast.success('Checkpoint created');
      setShowCreateCheckpoint(false);
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Shield size={22} /></div>
          <div>
            <h1>Patrol Management</h1>
            <p>Schedules, checkpoints & QR-enabled patrol routes</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateCheckpoint(true)}>
            <QrCode size={14} /> Add Checkpoint
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateSchedule(true)}>
            <Plus size={14} /> New Schedule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Shield size={18} /></div>
          <span className="msc-value">{schedules.length}</span>
          <span className="msc-label">Schedules</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><MapPin size={18} /></div>
          <span className="msc-value">{stats?.checkpoints ?? checkpoints.length}</span>
          <span className="msc-label">Checkpoints</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{
            background: (stats?.patrolCompliance?.complianceRate ?? 100) >= 80 ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
            color: (stats?.patrolCompliance?.complianceRate ?? 100) >= 80 ? '#10b981' : '#ef4444',
          }}>
            <CheckCircle2 size={18} />
          </div>
          <span className="msc-value" style={{
            color: (stats?.patrolCompliance?.complianceRate ?? 100) >= 80 ? '#10b981' : '#ef4444',
          }}>{stats?.patrolCompliance?.complianceRate ?? 100}%</span>
          <span className="msc-label">Compliance</span>
        </div>
      </div>

      {/* Tab Bar + Filter */}
      <div className="maint-toolbar">
        <div className="filter-group">
          {(['schedules', 'checkpoints'] as const).map(t => (
            <button key={t} className={`filter-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'schedules' ? <Clock size={12} /> : <MapPin size={12} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '4px' }}>
                ({t === 'schedules' ? schedules.length : checkpoints.length})
              </span>
            </button>
          ))}
        </div>
        <select className="filter-select" value={filterProperty}
          onChange={(e) => setFilterProperty(e.target.value)} style={{ marginLeft: 'auto' }}>
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Schedules Tab */}
      {tab === 'schedules' && (
        isLoading ? <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div> :
        schedules.length === 0 ? (
          <div className="maint-empty"><Inbox size={40} /><p>No patrol schedules</p></div>
        ) : (
          <div className="hk-mgmt-grid">
            {schedules.map((s: any) => {
              const freq = FREQ_BADGES[s.frequencyType] || FREQ_BADGES.custom;
              const assignee = s.assignedTo?.profile
                ? `${s.assignedTo.profile.firstName} ${s.assignedTo.profile.lastName}`
                : 'Unassigned';
              const chkCount = Array.isArray(s.checkpoints) ? s.checkpoints.length : 0;
              return (
                <div key={s.id} className="hk-mgmt-card" style={{ flexDirection: 'column', alignItems: 'stretch', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${freq.color}, transparent)`, opacity: 0.5 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="hk-mgmt-name">{s.name}</div>
                    <span style={{
                      padding: '2px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                      background: s.isActive !== false ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                      color: s.isActive !== false ? '#10b981' : '#6b7280',
                      textTransform: 'uppercase',
                    }}>{s.isActive !== false ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="hk-sched-badges">
                    <span className="hk-mgmt-tag" style={{ background: freq.bg, color: freq.color }}>{s.frequencyType.replace('_', ' ')}</span>
                    <span className="hk-mgmt-tag" style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8' }}>
                      {chkCount} checkpoint{chkCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="hk-mgmt-meta">
                    <span><Building2 size={11} /> {s.property?.name || '—'}</span>
                    <span><Users size={11} /> {assignee}</span>
                  </div>
                  {Array.isArray(s.customTimes) && s.customTimes.length > 0 && (
                    <div className="hk-checklist-preview">
                      <strong style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Scheduled Times</strong>
                      <span>{s.customTimes.join(', ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Checkpoints Tab */}
      {tab === 'checkpoints' && (
        checkpoints.length === 0 ? (
          <div className="maint-empty"><Inbox size={40} /><p>No checkpoints</p></div>
        ) : (
          <div className="hk-mgmt-grid">
            {checkpoints.map((cp: any) => (
              <div key={cp.id} className="hk-mgmt-card">
                <div className="hk-mgmt-icon" style={{ background: 'rgba(99,102,241,0.1)' }}>
                  <QrCode size={20} color="#818cf8" />
                </div>
                <div className="hk-mgmt-info">
                  <div className="hk-mgmt-name">{cp.name}</div>
                  <div className="hk-mgmt-tags">
                    {cp.floor && <span className="hk-mgmt-tag" style={{ background: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)' }}>Floor {cp.floor}</span>}
                    <span className="hk-mgmt-tag" style={{ background: 'rgba(14,165,233,0.08)', color: '#38bdf8' }}>#{cp.sortOrder}</span>
                  </div>
                  <div className="hk-mgmt-meta">
                    <span><Building2 size={11} /> {cp.property?.name || '—'}</span>
                    {cp.location && <span><MapPin size={11} /> {cp.location}</span>}
                  </div>
                  <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                    QR: {cp.qrCode}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create Schedule Modal */}
      {showCreateSchedule && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><Shield size={18} /></span> New Patrol Schedule</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateSchedule(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateSchedule}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div className="form-group"><label>Property *</label>
                  <select name="propertyId" required>
                    <option value="">Select...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Schedule Name *</label>
                  <input name="name" required placeholder="Hourly Floor 1 Patrol" />
                </div>
                <div className="form-group"><label>Frequency *</label>
                  <select name="frequencyType" required>
                    <option value="hourly">Hourly</option>
                    <option value="every_2h">Every 2 Hours</option>
                    <option value="every_4h">Every 4 Hours</option>
                    <option value="daily">Daily</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="form-group"><label>Custom Times (comma-separated)</label>
                  <input name="customTimes" placeholder="08:00, 14:00, 22:00" />
                </div>
                {checkpoints.length > 0 && (
                  <div className="form-group">
                    <label>Checkpoints (select route)</label>
                    <div style={{ maxHeight: '150px', overflow: 'auto', border: '1px solid var(--border-primary)', borderRadius: '8px', padding: '8px' }}>
                      {checkpoints.map((cp: any) => (
                        <label key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" name="checkpoints" value={cp.id} style={{ accentColor: '#6366f1' }} />
                          {cp.name} {cp.floor && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>(F{cp.floor})</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateSchedule(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Shield size={16} /> Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Checkpoint Modal */}
      {showCreateCheckpoint && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><QrCode size={18} /></span> New Checkpoint</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateCheckpoint(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateCheckpoint}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div className="form-group"><label>Property *</label>
                  <select name="propertyId" required>
                    <option value="">Select...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Name *</label>
                  <input name="name" required placeholder="Main Gate, Lobby A..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group"><label>Location</label><input name="location" placeholder="Building A, Level 1" /></div>
                  <div className="form-group"><label>Floor</label><input name="floor" placeholder="G" /></div>
                </div>
                <div className="form-group"><label>Sort Order</label><input name="sortOrder" type="number" defaultValue="0" /></div>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  A unique QR code will be auto-generated for this checkpoint. Print and place at the physical location.
                </p>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateCheckpoint(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><QrCode size={16} /> Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
