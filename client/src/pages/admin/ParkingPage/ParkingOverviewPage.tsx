import { useState } from 'react';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  useGetOccupancyQuery, useGetZonesQuery, useCreateZoneMutation,
  useGetSlotsQuery, useCreateSlotMutation, useBulkCreateSlotsMutation, useUpdateSlotMutation,
  type ParkingZone, type ParkingSlot, type OccupancyStats,
} from '../../../store/api/parkingApi';
import { Car, LayoutGrid, Plus, Layers, Grid3X3, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import './ParkingPage.css';

const STATUS_COLORS: Record<string, string> = {
  available: '#10b981', allocated: '#3b82f6', visitor: '#f59e0b',
  blocked: '#ef4444', maintenance: '#6b7280',
};

export default function ParkingOverviewPage() {
  const [propertyId, setPropertyId] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'slots' | 'zones'>('overview');
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];

  // Auto-select first property
  const selectedProperty = propertyId || properties[0]?.id || '';

  return (
    <div className="parking-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Car size={22} /></div>
          <div>
            <h1>Parking Management</h1>
            <p>Manage zones, slots, and occupancy</p>
          </div>
        </div>
        <select className="filter-select" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={{ minWidth: 200 }}>
          {properties.length === 0 && <option value="">Loading…</option>}
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="parking-tabs">
        <button className={`parking-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <LayoutGrid size={14} /> Overview
        </button>
        <button className={`parking-tab ${activeTab === 'slots' ? 'active' : ''}`} onClick={() => setActiveTab('slots')}>
          <Grid3X3 size={14} /> Slots
        </button>
        <button className={`parking-tab ${activeTab === 'zones' ? 'active' : ''}`} onClick={() => setActiveTab('zones')}>
          <Layers size={14} /> Zones
        </button>
      </div>

      {selectedProperty && activeTab === 'overview' && <OccupancyOverview propertyId={selectedProperty} />}
      {selectedProperty && activeTab === 'slots' && <SlotsManager propertyId={selectedProperty} />}
      {selectedProperty && activeTab === 'zones' && <ZonesManager propertyId={selectedProperty} />}
      {!selectedProperty && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Select a property to manage parking</div>}
    </div>
  );
}

// ── Occupancy Overview ─────────────────────────

function OccupancyOverview({ propertyId }: { propertyId: string }) {
  const { data } = useGetOccupancyQuery(propertyId);
  const occ = data?.data;
  if (!occ) return <div className="table-loading"><div className="lp" /><div className="lp" /></div>;

  const segments = [
    { key: 'allocated', color: STATUS_COLORS.allocated, value: occ.allocated },
    { key: 'visitor', color: STATUS_COLORS.visitor, value: occ.visitor },
    { key: 'blocked', color: STATUS_COLORS.blocked, value: occ.blocked },
    { key: 'maintenance', color: STATUS_COLORS.maintenance, value: occ.maintenance },
    { key: 'available', color: STATUS_COLORS.available, value: occ.available },
  ];

  // Build conic-gradient
  let gradientParts: string[] = [];
  let cumulative = 0;
  segments.forEach(s => {
    if (s.value > 0 && occ.total > 0) {
      const pct = (s.value / occ.total) * 100;
      gradientParts.push(`${s.color} ${cumulative}% ${cumulative + pct}%`);
      cumulative += pct;
    }
  });
  const gradient = gradientParts.length > 0
    ? `conic-gradient(${gradientParts.join(', ')})`
    : 'conic-gradient(var(--border-subtle) 0% 100%)';

  return (
    <div>
      <div className="occupancy-row">
        <div className="occupancy-donut-card">
          <div className="donut-container">
            <div className="donut-ring" style={{ background: gradient }}>
              <div className="donut-center">
                <span className="donut-pct">{occ.occupancyRate}%</span>
                <span className="donut-label">Occupied</span>
              </div>
            </div>
          </div>
          <div className="donut-legend">
            {segments.filter(s => s.value > 0).map(s => (
              <span key={s.key} className="donut-legend-item">
                <span className="dl-dot" style={{ background: s.color }} />
                <span className="dl-count">{s.value}</span> {s.key}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="parking-quick-stats">
            <div className="pqs-card"><div className="pqs-value">{occ.total}</div><div className="pqs-label">Total Slots</div></div>
            <div className="pqs-card"><div className="pqs-value" style={{ color: '#10b981' }}>{occ.available}</div><div className="pqs-label">Available</div></div>
            <div className="pqs-card"><div className="pqs-value" style={{ color: '#3b82f6' }}>{occ.allocated}</div><div className="pqs-label">Allocated</div></div>
            <div className="pqs-card"><div className="pqs-value" style={{ color: '#f59e0b' }}>{occ.visitor}</div><div className="pqs-label">Visitor</div></div>
          </div>

          {/* Zone breakdown cards */}
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>By Zone</h3>
          <div className="zone-cards-grid">
            {occ.byZone.map((z: any) => {
              const allocated = z.allocated || 0;
              const visitor = z.visitor || 0;
              const available = z.available || 0;
              const total = z.total || 1;
              return (
                <div key={z.id} className="zone-card">
                  <div className="zc-header">
                    <span className="zc-name">{z.name}</span>
                    <span className="zc-type">{z.zoneType}</span>
                  </div>
                  <div className="zc-bar">
                    <div className="zc-bar-seg" style={{ width: `${(allocated / total) * 100}%`, background: STATUS_COLORS.allocated }} />
                    <div className="zc-bar-seg" style={{ width: `${(visitor / total) * 100}%`, background: STATUS_COLORS.visitor }} />
                    <div className="zc-bar-seg" style={{ width: `${(available / total) * 100}%`, background: STATUS_COLORS.available }} />
                  </div>
                  <div className="zc-stats">
                    <span><span className="dl-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS.allocated, display: 'inline-block' }} /> {allocated}</span>
                    <span><span className="dl-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS.visitor, display: 'inline-block' }} /> {visitor}</span>
                    <span><span className="dl-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS.available, display: 'inline-block' }} /> {available}</span>
                    <span>Total: {total}</span>
                  </div>
                </div>
              );
            })}
            {occ.byZone.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 20 }}>No zones configured</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slots Manager ──────────────────────────────

function SlotsManager({ propertyId }: { propertyId: string }) {
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showBulk, setShowBulk] = useState(false);

  const { data: zonesData } = useGetZonesQuery(propertyId);
  const { data, isLoading } = useGetSlotsQuery({ propertyId, zoneId: zoneFilter || undefined, status: statusFilter || undefined, page, limit: 50 });
  const [bulkCreate] = useBulkCreateSlotsMutation();

  const zones = zonesData?.data || [];
  const slots = data?.data || [];
  const meta = data?.meta;

  const handleBulkCreate = async (form: Record<string, unknown>) => {
    try {
      const result = await bulkCreate({ propertyId, data: form }).unwrap();
      toast.success(`Created ${result.data.created} of ${result.data.total} slots`);
      setShowBulk(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div>
      <div className="pipeline-toolbar" style={{ marginBottom: 16 }}>
        <select className="filter-select" value={zoneFilter} onChange={(e) => { setZoneFilter(e.target.value); setPage(1); }}>
          <option value="">All Zones</option>
          {zones.map((z: ParkingZone) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn-primary" onClick={() => setShowBulk(true)} style={{ marginLeft: 'auto' }}>
          <Plus size={14} /> Bulk Create Slots
        </button>
      </div>

      <div className="slot-table-wrap">
        <div className="slot-table-header">
          <span>Slot #</span><span>Zone</span><span>Type</span><span>Size</span>
          <span>Status</span><span>Monthly Rate</span><span>EV</span>
        </div>
        {isLoading ? (
          <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
        ) : slots.length === 0 ? (
          <div className="table-empty"><Grid3X3 size={40} /><p>No slots found</p></div>
        ) : (
          slots.map((slot: ParkingSlot) => (
            <div key={slot.id} className="slot-row">
              <div style={{ fontWeight: 600 }}>{slot.slotNumber}</div>
              <div>{slot.zone?.name || '—'}</div>
              <div style={{ textTransform: 'capitalize' }}>{slot.slotType}</div>
              <div style={{ textTransform: 'capitalize' }}>{slot.size}</div>
              <div>
                <span className="slot-status-badge" style={{ background: (STATUS_COLORS[slot.status] || '#666') + '18', color: STATUS_COLORS[slot.status] || '#666' }}>
                  {slot.status}
                </span>
              </div>
              <div>{slot.monthlyRate ? `$${Number(slot.monthlyRate).toLocaleString()}` : '—'}</div>
              <div>{slot.hasEvCharger ? '⚡' : '—'}</div>
            </div>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {showBulk && <BulkCreateModal zones={zones} onClose={() => setShowBulk(false)} onSubmit={handleBulkCreate} />}
    </div>
  );
}

function BulkCreateModal({ zones, onClose, onSubmit }: {
  zones: ParkingZone[]; onClose: () => void; onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    zoneId: '', prefix: '', rangeStart: '1', rangeEnd: '10',
    slotType: 'car', size: 'standard', monthlyRate: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const previewSlots = [];
  const start = parseInt(form.rangeStart) || 1;
  const end = Math.min(parseInt(form.rangeEnd) || 1, start + 4);
  for (let i = start; i <= end; i++) previewSlots.push(`${form.prefix}${String(i).padStart(3, '0')}`);
  if ((parseInt(form.rangeEnd) || 1) > end) previewSlots.push('…');

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <h2>Bulk Create Parking Slots</h2>
        <div className="form-group">
          <label>Zone</label>
          <select className="form-input" value={form.zoneId} onChange={e => set('zoneId', e.target.value)}>
            <option value="">— No zone —</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Prefix *</label>
            <input className="form-input" value={form.prefix} onChange={e => set('prefix', e.target.value)} placeholder="A-" />
          </div>
          <div className="form-group">
            <label>From</label>
            <input className="form-input" type="number" value={form.rangeStart} onChange={e => set('rangeStart', e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input className="form-input" type="number" value={form.rangeEnd} onChange={e => set('rangeEnd', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Type</label>
            <select className="form-input" value={form.slotType} onChange={e => set('slotType', e.target.value)}>
              <option value="car">Car</option>
              <option value="motorcycle">Motorcycle</option>
              <option value="ev">EV</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div className="form-group">
            <label>Size</label>
            <select className="form-input" value={form.size} onChange={e => set('size', e.target.value)}>
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div className="form-group">
            <label>Monthly Rate</label>
            <input className="form-input" type="number" value={form.monthlyRate} onChange={e => set('monthlyRate', e.target.value)} placeholder="0" />
          </div>
        </div>
        {form.prefix && (
          <div className="bulk-preview">
            Preview: {previewSlots.join(', ')} ({(parseInt(form.rangeEnd) || 1) - (parseInt(form.rangeStart) || 1) + 1} slots)
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!form.prefix} onClick={() => onSubmit({
            zoneId: form.zoneId || undefined,
            prefix: form.prefix,
            rangeStart: parseInt(form.rangeStart),
            rangeEnd: parseInt(form.rangeEnd),
            slotType: form.slotType,
            size: form.size,
            monthlyRate: form.monthlyRate ? Number(form.monthlyRate) : undefined,
          })}>
            Create Slots
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Zones Manager ──────────────────────────────

function ZonesManager({ propertyId }: { propertyId: string }) {
  const { data } = useGetZonesQuery(propertyId);
  const [createZone] = useCreateZoneMutation();
  const [showCreate, setShowCreate] = useState(false);
  const zones = data?.data || [];

  const handleCreate = async (form: { name: string; code: string; zoneType: string }) => {
    try {
      await createZone({ propertyId, data: form }).unwrap();
      toast.success('Zone created');
      setShowCreate(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Parking Zones ({zones.length})</h3>
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Add Zone</button>
      </div>
      <div className="zone-cards-grid">
        {zones.map((z: ParkingZone) => (
          <div key={z.id} className="zone-card">
            <div className="zc-header">
              <span className="zc-name">{z.name}</span>
              <span className="zc-type">{z.zoneType.replace(/_/g, ' ')}</span>
            </div>
            <div className="zc-stats">
              <span>{z.code || '—'}</span>
              <span>{z._count.slots} slots</span>
              <span>{z.isActive ? '✓ Active' : '✗ Inactive'}</span>
            </div>
          </div>
        ))}
        {zones.length === 0 && <div style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>No zones yet — add one to organize your parking</div>}
      </div>

      {showCreate && (
        <CreateZoneModal onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}
    </div>
  );
}

function CreateZoneModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [zoneType, setZoneType] = useState('covered');

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <h2>New Parking Zone</h2>
        <div className="form-group"><label>Zone Name *</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Level B1" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Code</label><input className="form-input" value={code} onChange={e => setCode(e.target.value)} placeholder="B1" /></div>
          <div className="form-group">
            <label>Type</label>
            <select className="form-input" value={zoneType} onChange={e => setZoneType(e.target.value)}>
              <option value="covered">Covered</option><option value="open">Open</option>
              <option value="rooftop">Rooftop</option><option value="basement">Basement</option>
              <option value="multi_level">Multi Level</option>
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name} onClick={() => onSubmit({ name, code: code || undefined, zoneType })}>Create</button>
        </div>
      </div>
    </div>
  );
}
