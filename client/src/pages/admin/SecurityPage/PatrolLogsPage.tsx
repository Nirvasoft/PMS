import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetPatrolLogsQuery, useGetPatrolCheckpointsQuery,
  useCreatePatrolCheckpointMutation, useGetSecurityStatsQuery,
} from '../../../store/api/securityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  MapPin, Loader2, Plus, Clock, CheckCircle2, XCircle, QrCode,
  Shield, Copy, Navigation, TrendingUp, Users, Radio,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function PatrolLogsPage() {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'logs' | 'checkpoints' | 'schedules'>('logs');
  const [showModal, setShowModal] = useState(false);

  const { data: logsData, isLoading } = useGetPatrolLogsQuery({ page, limit: 50 });
  const { data: checkpointsData } = useGetPatrolCheckpointsQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: statsData } = useGetSecurityStatsQuery({});
  const [createCheckpoint] = useCreatePatrolCheckpointMutation();

  const logs = logsData?.data || [];
  const meta = logsData?.meta;
  const checkpoints = checkpointsData?.data || [];
  const properties = propsData?.data || [];
  const stats = statsData?.data;
  const patrolComp = stats?.patrolCompliance;

  const compRate = patrolComp?.complianceRate ?? 0;
  const compColor = compRate >= 80 ? '#10b981' : compRate >= 50 ? '#eab308' : '#ef4444';

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createCheckpoint({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        location: fd.get('location') || undefined, floor: fd.get('floor') || undefined,
        sortOrder: parseInt(fd.get('sortOrder') as string) || 0,
      }).unwrap();
      toast.success('Checkpoint created'); setShowModal(false);
    } catch { toast.error('Failed'); }
  };

  const copyQr = (qr: string) => {
    navigator.clipboard.writeText(qr);
    toast.success('QR code copied');
  };

  return (
    <div className="maint-page">
      {/* ── Stats Row ── */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><QrCode size={18} /></div>
          <div className="msc-label">Checkpoints</div>
          <div className="msc-value">{checkpoints.length}</div>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><Navigation size={18} /></div>
          <div className="msc-label">Total Scans</div>
          <div className="msc-value">{meta?.total ?? 0}</div>
        </div>
        {patrolComp && (
          <>
            <div className="maint-stat-card" style={{ position: 'relative' }}>
              <div className="msc-icon" style={{ background: 'rgba(99,102,241,0.14)', color: '#818cf8' }}><Radio size={18} /></div>
              <div className="msc-label">Scheduled / Done</div>
              <div className="msc-value" style={{ color: '#818cf8' }}>
                {patrolComp.completed}
                <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', margin: '0 4px' }}>/</span>
                {patrolComp.scheduled}
              </div>
            </div>
            <div className="maint-stat-card red">
              <div className="msc-icon"><XCircle size={18} /></div>
              <div className="msc-label">Missed Today</div>
              <div className="msc-value">{patrolComp.missed}</div>
            </div>
            <div className="maint-stat-card" style={{ position: 'relative' }}>
              <div className="msc-icon" style={{ background: `${compColor}22`, color: compColor }}><TrendingUp size={18} /></div>
              <div className="msc-label">Compliance Rate</div>
              <div className="msc-value" style={{ color: compColor }}>{compRate}%</div>
              <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginTop: '4px' }}>
                <div style={{ height: '100%', width: `${Math.min(compRate, 100)}%`, borderRadius: '2px', background: compColor, transition: 'width 0.5s' }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Shield size={20} /></div>
          <div><h1>Patrol Management</h1><p>{checkpoints.length} checkpoints · {meta?.total ?? 0} logs</p></div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Add Checkpoint
          </button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="maint-filters" style={{ gap: '4px' }}>
        <button className={`filter-chip ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
          <Clock size={12} /> Patrol Logs
          {meta?.total ? <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>({meta.total})</span> : null}
        </button>
        <button className={`filter-chip ${tab === 'checkpoints' ? 'active' : ''}`} onClick={() => setTab('checkpoints')}>
          <QrCode size={12} /> Checkpoints
          <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>({checkpoints.length})</span>
        </button>
      </div>

      {/* ── Logs Tab ── */}
      {tab === 'logs' && (
        isLoading ? <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div> :
        logs.length === 0 ? <div className="maint-empty"><Navigation size={32} /><p>No patrol logs yet</p></div> : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map((log: any, i: number) => {
                const guard = log.guard?.profile
                  ? `${log.guard.profile.firstName} ${log.guard.profile.lastName}`
                  : log.guard?.email || '—';
                const scannedAt = new Date(log.scannedAt);
                const timeFmt = scannedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateFmt = scannedAt.toLocaleDateString([], { month: 'short', day: 'numeric' });

                // Check gap with previous log
                let gapMinutes: number | null = null;
                if (i < logs.length - 1) {
                  const prevAt = new Date(logs[i + 1].scannedAt);
                  gapMinutes = Math.round((scannedAt.getTime() - prevAt.getTime()) / 60000);
                }
                const hasGap = gapMinutes !== null && gapMinutes > 90;

                return (
                  <div key={log.id} style={{
                    background: 'var(--surface-elevated)',
                    border: `1px solid ${hasGap ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}`,
                    borderRadius: '12px', padding: '14px 18px',
                    display: 'flex', gap: '14px', alignItems: 'center',
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                  >
                    {/* Time column */}
                    <div style={{ textAlign: 'center', flexShrink: 0, width: '60px' }}>
                      <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{timeFmt}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{dateFmt}</div>
                    </div>

                    {/* Separator */}
                    <div style={{ width: '3px', height: '36px', borderRadius: '2px', background: hasGap ? '#ef4444' : 'rgba(99,102,241,0.3)', flexShrink: 0 }} />

                    {/* Checkpoint */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{log.checkpoint?.name}</div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '3px', flexWrap: 'wrap' }}>
                        {log.checkpoint?.floor && <span>Floor {log.checkpoint.floor}</span>}
                        {log.checkpoint?.location && <span><MapPin size={9} style={{ marginRight: '2px' }} />{log.checkpoint.location}</span>}
                        {log.property?.name && <span>{log.property.name}</span>}
                      </div>
                    </div>

                    {/* Guard */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={12} style={{ color: '#818cf8' }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{guard}</span>
                    </div>

                    {/* Status/gap */}
                    <div style={{ flexShrink: 0 }}>
                      {log.isOnTime === true ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#10b981', textTransform: 'uppercase' }}>
                          <CheckCircle2 size={10} /> On Time
                        </span>
                      ) : hasGap ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#ef4444', textTransform: 'uppercase' }}>
                          <XCircle size={10} /> {gapMinutes}m gap
                        </span>
                      ) : gapMinutes !== null ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{gapMinutes}m</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="maint-pagination">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Previous</button>
                <span>Page {page} of {meta.totalPages}</span>
                <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={14} /></button>
              </div>
            )}
          </>
        )
      )}

      {/* ── Checkpoints Tab ── */}
      {tab === 'checkpoints' && (
        checkpoints.length === 0 ? <div className="maint-empty"><QrCode size={32} /><p>No checkpoints</p></div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
            {checkpoints.map((cp: any, i: number) => (
              <div key={cp.id} style={{
                background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '14px', padding: '18px', position: 'relative', overflow: 'hidden',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
              >
                {/* Top accent */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #6366f1, transparent)', opacity: 0.4 }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                      background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: '14px', color: '#818cf8', fontVariantNumeric: 'tabular-nums',
                    }}>
                      #{cp.sortOrder || i + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{cp.name}</div>
                      {cp.property?.name && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{cp.property.name}</div>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {cp.location && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      <MapPin size={10} /> {cp.location}
                    </span>
                  )}
                  {cp.floor && (
                    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: 'rgba(168,85,247,0.1)', color: '#c084fc' }}>
                      Floor {cp.floor}
                    </span>
                  )}
                </div>

                {/* QR Code */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    {cp.qrCode}
                  </span>
                  <button
                    onClick={() => copyQr(cp.qrCode)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '2px', display: 'flex' }}
                    title="Copy QR code"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Create Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h2><QrCode size={18} /> New Checkpoint</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group"><label>Property *</label>
                <select name="propertyId" required><option value="">Select...</option>{properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="form-group"><label>Checkpoint Name *</label><input name="name" required placeholder="Main Gate" /></div>
              <div className="form-group"><label>Location</label><input name="location" placeholder="Ground floor, east wing" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Floor</label><input name="floor" placeholder="G" /></div>
                <div className="form-group"><label>Sort Order</label><input name="sortOrder" type="number" defaultValue="0" /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
