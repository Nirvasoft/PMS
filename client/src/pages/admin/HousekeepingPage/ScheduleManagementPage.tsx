import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetHkSchedulesQuery, useCreateHkScheduleMutation, useGetHkZonesQuery,
} from '../../../store/api/housekeepingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Calendar, Plus, Loader2, Inbox, XCircle, MapPin, Users, Timer,
  Clock, CheckCircle2, Search, Filter, Repeat, Zap, ClipboardList,
  Building2, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const FREQ_META: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  daily:   { color: '#6366f1', bg: 'rgba(99,102,241,0.08)', label: 'Daily', icon: Repeat },
  weekly:  { color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)', label: 'Weekly', icon: Calendar },
  monthly: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', label: 'Monthly', icon: Clock },
  custom:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Custom', icon: Zap },
};
const CLEAN_META: Record<string, { color: string; bg: string; label: string }> = {
  routine:       { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', label: 'Routine' },
  deep_clean:    { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', label: 'Deep Clean' },
  sanitization:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Sanitization' },
};

export default function ScheduleManagementPage() {
  const [showCreate, setShowCreate] = useState(false);
  const filterProperty = useSelectedPropertyFilter();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFreq, setFilterFreq] = useState('');

  const { data: schedsData, isLoading } = useGetHkSchedulesQuery({ propertyId: filterProperty || undefined });
  const { data: zonesData } = useGetHkZonesQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createSchedule, { isLoading: creating }] = useCreateHkScheduleMutation();

  const schedules = schedsData?.data || [];
  const zones = zonesData?.data || [];
  const properties = propsData?.data || [];

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

  // Filter
  const filtered = schedules.filter((s: any) => {
    if (searchTerm && !s.name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterFreq && s.frequencyType !== filterFreq) return false;
    return true;
  });

  const activeCount = schedules.filter((s: any) => s.status === 'active').length;
  const pausedCount = schedules.filter((s: any) => s.status !== 'active').length;

  // Freq counts
  const freqCounts = schedules.reduce((acc: Record<string, number>, s: any) => {
    acc[s.frequencyType] = (acc[s.frequencyType] || 0) + 1;
    return acc;
  }, {});

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
              background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar size={18} color="#fff" />
            </div>
            Schedule Management
          </h1>
          <p style={{ margin: '4px 0 0 46px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {schedules.length} cleaning schedule{schedules.length !== 1 ? 's' : ''}
          </p>
        </div>
        <PermissionGuard permission="housekeeping-schedules.write">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ borderRadius: 10 }}>
            <Plus size={14} /> New Schedule
          </button>
        </PermissionGuard>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        <div style={{
          borderRadius: 14, padding: '14px 16px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03))',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Calendar size={13} /></div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6366f1' }}>{schedules.length}</div>
        </div>
        <div style={{
          borderRadius: 14, padding: '14px 16px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))',
          border: '1px solid rgba(16,185,129,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={13} /></div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Active</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{activeCount}</div>
        </div>
        {Object.entries(freqCounts).slice(0, 3).map(([type, count]) => {
          const meta = FREQ_META[type] || FREQ_META.daily;
          return (
            <div key={type} style={{
              borderRadius: 14, padding: '14px 16px', overflow: 'hidden',
              background: `linear-gradient(135deg, ${meta.bg}, transparent)`,
              border: `1px solid ${meta.color}20`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `${meta.color}15`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><meta.icon size={13} /></div>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{meta.label}</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: meta.color }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search schedules..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-tertiary)' }} />
          {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
          <select className="filter-select" value={filterProperty} disabled
            style={{ borderRadius: 10, fontSize: 12, padding: '7px 28px 7px 10px' }}>
            {filterProperty && (
              <option value={filterProperty}>{properties.find((p: any) => p.id === filterProperty)?.name || ''}</option>
            )}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Repeat size={13} style={{ color: 'var(--text-tertiary)' }} />
          <select className="filter-select" value={filterFreq}
            onChange={(e) => setFilterFreq(e.target.value)}
            style={{ borderRadius: 10, fontSize: 12, padding: '7px 28px 7px 10px' }}>
            <option value="">All Frequencies</option>
            {Object.entries(FREQ_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Schedule Cards ── */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading schedules...</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(107,114,128,0.08)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Calendar size={28} /></div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {searchTerm || filterFreq ? 'No schedules match' : 'No schedules configured'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Create schedules to automate cleaning tasks</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {filtered.map((s: any) => {
            const freq = FREQ_META[s.frequencyType] || FREQ_META.daily;
            const ct = CLEAN_META[s.cleaningType] || CLEAN_META.routine;
            const assignee = s.assignedTo?.profile
              ? `${s.assignedTo.profile.firstName} ${s.assignedTo.profile.lastName}`
              : 'Unassigned';
            const checklist = Array.isArray(s.checklist) ? s.checklist : [];
            const isActive = s.status === 'active';

            return (
              <div key={s.id} style={{
                borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden',
                background: freq.bg, border: `1px solid ${freq.color}18`,
                borderLeft: `4px solid ${freq.color}`,
                opacity: isActive ? 1 : 0.65, transition: 'all 0.2s',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <Building2 size={10} /> {s.zone?.property?.name || s.property?.name || '—'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                    color: isActive ? '#10b981' : '#6b7280', textTransform: 'uppercase',
                    flexShrink: 0,
                  }}>{s.status || 'active'}</span>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${freq.color}14`, color: freq.color, textTransform: 'capitalize' }}>
                    {freq.label}
                  </span>
                  {s.cleaningType && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: ct.bg, color: ct.color, textTransform: 'capitalize' }}>
                      {ct.label}
                    </span>
                  )}
                  {s.scheduledTime && (
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.04)', color: 'var(--text-secondary)' }}>
                      ⏰ {s.scheduledTime}
                    </span>
                  )}
                </div>

                {/* Meta Row */}
                <div style={{
                  display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)',
                  paddingTop: 8, borderTop: `1px solid ${freq.color}10`,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={10} /> {s.zone?.name || '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={10} /> {assignee}</span>
                  {s.durationMinutes && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Timer size={10} /> {s.durationMinutes}m</span>}
                  {s.staffCount > 1 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>👥 {s.staffCount}</span>}
                </div>

                {/* Checklist Preview */}
                {checklist.length > 0 && (
                  <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(0,0,0,0.03)',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ClipboardList size={9} /> Checklist ({checklist.length})
                    </div>
                    {checklist.slice(0, 3).map((c: any, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '1px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={9} style={{ color: '#10b981', flexShrink: 0 }} />
                        {typeof c === 'string' ? c : c.item}
                      </div>
                    ))}
                    {checklist.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 2 }}>
                        +{checklist.length - 3} more items
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '540px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={16} color="#fff" />
                </div>
                New Schedule
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowCreate(false); resetForm(); }}><XCircle size={20} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Property *</label>
                    <select name="propertyId" required style={{ borderRadius: 10 }}>
                      <option value="">Select...</option>
                      {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Zone *</label>
                    <select name="zoneId" required style={{ borderRadius: 10 }}>
                      <option value="">Select...</option>
                      {zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group"><label>Schedule Name *</label>
                  <input name="name" required placeholder="e.g. Daily Lobby Cleaning" style={{ borderRadius: 10 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Frequency *</label>
                    <select name="frequencyType" required style={{ borderRadius: 10 }}>
                      {Object.entries(FREQ_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Cleaning Type</label>
                    <select name="cleaningType" style={{ borderRadius: 10 }}>
                      {Object.entries(CLEAN_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Scheduled Time</label>
                    <input name="scheduledTime" type="time" style={{ borderRadius: 10 }} />
                  </div>
                  <div className="form-group"><label>Duration (min)</label>
                    <input name="durationMinutes" type="number" min="1" placeholder="30" style={{ borderRadius: 10 }} />
                  </div>
                  <div className="form-group"><label>Staff Count</label>
                    <input name="staffCount" type="number" min="1" defaultValue="1" style={{ borderRadius: 10 }} />
                  </div>
                </div>
                {/* Checklist Builder */}
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Checklist Items</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input placeholder="Add checklist item..." value={newCheckItem}
                      onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCheckItem())}
                      style={{ flex: 1, borderRadius: 10 }} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addCheckItem}
                      disabled={!newCheckItem.trim()} style={{ borderRadius: 10 }}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {checklistItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {checklistItems.map((item, idx) => (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.06)',
                          border: '1px solid rgba(16,185,129,0.12)',
                        }}>
                          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={11} style={{ color: '#10b981' }} /> {item.item}
                          </span>
                          <button type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
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
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ borderRadius: 10 }}>
                  {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
