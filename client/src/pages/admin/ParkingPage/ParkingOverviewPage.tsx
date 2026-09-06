import { useState, useEffect } from 'react';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useGetUnitsQuery, type UnitListItem } from '../../../store/api/unitsApi';
import {
  useGetParkingTypesQuery,
  useGetOccupancyQuery, useGetZonesQuery, useCreateZoneMutation, useUpdateZoneMutation, useDeleteZoneMutation,
  useGetSlotsQuery, useBulkCreateSlotsMutation, useUpdateSlotMutation, useDeleteSlotMutation,
  type ParkingZone, type ParkingSlot, type ParkingUnitType,
} from '../../../store/api/parkingApi';
import { Car, LayoutGrid, Plus, Layers, Grid3X3, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './ParkingPage.css';

const STATUS_COLORS: Record<string, string> = {
  available: '#10b981', allocated: '#3b82f6', visitor: '#f59e0b',
  blocked: '#ef4444', maintenance: '#6b7280',
};

function unitLabel(u: { unitNumber: string; floorLabel: string | null }) {
  return u.floorLabel ? `${u.unitNumber} · ${u.floorLabel}` : u.unitNumber;
}

export default function ParkingOverviewPage() {
  const [parkingType, setParkingType] = useState('');
  const [unitId, setUnitId] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'slots' | 'zones'>('overview');

  const { data: propertiesData } = useGetMyPropertyScopeQuery();
  const properties = propertiesData?.data || [];
  // Property follows the sidebar's "Active Property" selector — not independently choosable here.
  const selectedProperty = useSelectedPropertyFilter();
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  // Reset downstream filters whenever the active property changes.
  useEffect(() => {
    setParkingType('');
    setUnitId('');
  }, [selectedProperty]);

  const { currentData: typesData } = useGetParkingTypesQuery(selectedProperty, {
    skip: !selectedProperty,
    refetchOnMountOrArgChange: true,
  });
  const parkingTypes = typesData?.data || [];
  // Auto-select first parking type present for this property (Car Park / Bike Park / EV Bay)
  const selectedType = parkingType || parkingTypes[0]?.code || '';
  const selectedTypeName = parkingTypes.find((t) => t.code === selectedType)?.name || selectedType;

  const { currentData: parkUnitsData } = useGetUnitsQuery(
    { propertyId: selectedProperty, unitType: selectedType, limit: 100 },
    { skip: !selectedProperty || !selectedType, refetchOnMountOrArgChange: true },
  );
  const parkUnits = parkUnitsData?.data || [];
  const selectedUnit = unitId || parkUnits[0]?.id || '';

  const handleTypeChange = (type: string) => { setParkingType(type); setUnitId(''); };

  const scopeReady = !!(selectedProperty && selectedType && selectedUnit);

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="parking-filter-field">
            <label>Properties</label>
            {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
            <select className="filter-select" value={selectedProperty} disabled style={{ minWidth: 200 }}>
              {!selectedProperty && <option value="">Loading…</option>}
              {selectedProperty && <option value={selectedProperty}>{selectedPropertyName}</option>}
            </select>
          </div>

          <div className="parking-filter-field">
            <label>Parking</label>
            <select
              className="filter-select"
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              disabled={!selectedProperty || parkingTypes.length === 0}
              style={{ minWidth: 160 }}
            >
              {parkingTypes.length === 0 && <option value="">-</option>}
              {parkingTypes.map((t: ParkingUnitType) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </div>

          <div className="parking-filter-field">
            <label>Park Unit</label>
            <select
              className="filter-select"
              value={selectedUnit}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!selectedType || parkUnits.length === 0}
              style={{ minWidth: 160 }}
            >
              {parkUnits.length === 0 && <option value="">-</option>}
              {parkUnits.map((u: UnitListItem) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
            </select>
          </div>
        </div>
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

      {scopeReady && activeTab === 'overview' && <OccupancyOverview propertyId={selectedProperty} unitId={selectedUnit} />}
      {scopeReady && activeTab === 'slots' && <SlotsManager propertyId={selectedProperty} unitId={selectedUnit} />}
      {scopeReady && activeTab === 'zones' && <ZonesManager propertyId={selectedProperty} unitId={selectedUnit} />}

      {!selectedProperty && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>Select a property to manage parking</div>}
      {selectedProperty && !selectedType && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
          No parking set up for this property yet
        </div>
      )}
      {selectedProperty && selectedType && !selectedUnit && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
          No units with Unit Type "{selectedTypeName}" yet
        </div>
      )}
    </div>
  );
}

// ── Occupancy Overview ─────────────────────────

function OccupancyOverview({ propertyId, unitId }: { propertyId: string; unitId: string }) {
  const { data } = useGetOccupancyQuery({ propertyId, unitId }, { refetchOnMountOrArgChange: true });
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

function SlotsManager({ propertyId, unitId }: { propertyId: string; unitId: string }) {
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showBulk, setShowBulk] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ParkingSlot | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<ParkingSlot | null>(null);

  const { data: zonesData } = useGetZonesQuery({ propertyId, unitId }, { refetchOnMountOrArgChange: true });
  const { data, isLoading } = useGetSlotsQuery(
    { propertyId, unitId, zoneId: zoneFilter || undefined, status: statusFilter || undefined, page, limit: 50 },
    { refetchOnMountOrArgChange: true },
  );
  const [bulkCreate] = useBulkCreateSlotsMutation();
  const [updateSlot] = useUpdateSlotMutation();
  const [deleteSlot, { isLoading: isDeleting }] = useDeleteSlotMutation();

  const zones = zonesData?.data || [];
  const slots = data?.data || [];
  const meta = data?.meta;

  const handleBulkCreate = async (form: Record<string, unknown>) => {
    try {
      const result = await bulkCreate({ propertyId, data: { ...form, unitId } }).unwrap();
      const { created, total, duplicates } = result.data;
      if (duplicates?.length) {
        toast.error(`Skipped ${duplicates.length} duplicate slot${duplicates.length > 1 ? 's' : ''}: ${duplicates.join(', ')}`);
      }
      if (created > 0) toast.success(`Created ${created} of ${total} slots`);
      if (created > 0 || !duplicates?.length) setShowBulk(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleUpdateSlot = async (form: Record<string, unknown>) => {
    if (!editingSlot) return;
    try {
      await updateSlot({ propertyId, id: editingSlot.id, data: form }).unwrap();
      toast.success('Slot updated');
      setEditingSlot(null);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleDeleteSlot = async () => {
    if (!deletingSlot) return;
    try {
      await deleteSlot({ propertyId, id: deletingSlot.id }).unwrap();
      toast.success('Slot deleted');
      setDeletingSlot(null);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const slotInUse = (slot: ParkingSlot) => slot.status === 'allocated' || slot.status === 'visitor';

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
        <PermissionGuard permission="parking-overview.write">
          <button className="btn-primary" onClick={() => setShowBulk(true)} style={{ marginLeft: 'auto' }}>
            <Plus size={14} /> Bulk Create Slots
          </button>
        </PermissionGuard>
      </div>

      <div className="slot-table-wrap">
        <div className="slot-table-header">
          <span>Slot #</span><span>Zone</span>
          <span>Status</span><span>Monthly Rate</span><span>Actions</span>
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
              <div>
                <span className="slot-status-badge" style={{ background: (STATUS_COLORS[slot.status] || '#666') + '18', color: STATUS_COLORS[slot.status] || '#666' }}>
                  {slot.status}
                </span>
              </div>
              <div>{slot.monthlyRate ? `$${Number(slot.monthlyRate).toLocaleString()}` : '—'}</div>
              <PermissionGuard permission="parking-overview.write">
                <div className="row-actions">
                  <button
                    className="btn-icon-sm"
                    title={slotInUse(slot) ? `Slot is ${slot.status} — cannot edit` : 'Edit slot'}
                    disabled={slotInUse(slot)}
                    onClick={() => setEditingSlot(slot)}
                  ><Pencil size={14} /></button>
                  <button
                    className="btn-icon-sm btn-icon-danger"
                    title={slotInUse(slot) ? `Slot is ${slot.status} — cannot delete` : 'Delete slot'}
                    disabled={slotInUse(slot)}
                    onClick={() => setDeletingSlot(slot)}
                  ><Trash2 size={14} /></button>
                </div>
              </PermissionGuard>
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
      {editingSlot && (
        <EditSlotModal slot={editingSlot} zones={zones} onClose={() => setEditingSlot(null)} onSubmit={handleUpdateSlot} />
      )}
      {deletingSlot && (
        <ConfirmDeleteModal
          title="Delete Slot"
          message={`Delete slot '${deletingSlot.slotNumber}'? This cannot be undone.`}
          isLoading={isDeleting}
          onClose={() => setDeletingSlot(null)}
          onConfirm={handleDeleteSlot}
        />
      )}
    </div>
  );
}

function BulkCreateModal({ zones, onClose, onSubmit }: {
  zones: ParkingZone[]; onClose: () => void; onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    zoneId: '', prefix: '', rangeStart: '1', rangeEnd: '10', monthlyRate: '',
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
        <div className="form-group">
          <label>Monthly Rate</label>
          <input className="form-input" type="number" value={form.monthlyRate} onChange={e => set('monthlyRate', e.target.value)} placeholder="0" />
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
            monthlyRate: form.monthlyRate ? Number(form.monthlyRate) : undefined,
          })}>
            Create Slots
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSlotModal({ slot, zones, onClose, onSubmit }: {
  slot: ParkingSlot; zones: ParkingZone[]; onClose: () => void; onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [slotNumber, setSlotNumber] = useState(slot.slotNumber);
  const [zoneId, setZoneId] = useState(slot.zone?.id || '');
  const [slotType, setSlotType] = useState(slot.slotType);
  const [size, setSize] = useState(slot.size);
  const [monthlyRate, setMonthlyRate] = useState(slot.monthlyRate ? String(slot.monthlyRate) : '');
  const [hourlyRate, setHourlyRate] = useState(slot.hourlyRate ? String(slot.hourlyRate) : '');
  const [notes, setNotes] = useState(slot.notes || '');

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <h2>Edit Slot</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Slot Number *</label>
            <input className="form-input" value={slotNumber} onChange={e => setSlotNumber(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Zone</label>
            <select className="form-input" value={zoneId} onChange={e => setZoneId(e.target.value)}>
              <option value="">— No zone —</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Type</label>
            <select className="form-input" value={slotType} onChange={e => setSlotType(e.target.value)}>
              <option value="car">Car</option><option value="motorcycle">Motorcycle</option>
              <option value="ev">EV</option><option value="disabled">Disabled</option><option value="compact">Compact</option>
            </select>
          </div>
          <div className="form-group">
            <label>Size</label>
            <select className="form-input" value={size} onChange={e => setSize(e.target.value)}>
              <option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Monthly Rate</label>
            <input className="form-input" type="number" value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>Hourly Rate</label>
            <input className="form-input" type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!slotNumber} onClick={() => onSubmit({
            slotNumber,
            zoneId: zoneId || null,
            slotType,
            size,
            monthlyRate: monthlyRate ? Number(monthlyRate) : undefined,
            hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
            notes: notes || null,
          })}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ title, message, isLoading, onClose, onConfirm }: {
  title: string; message: string; isLoading?: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2>{title}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm} disabled={isLoading}>{isLoading ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Zones Manager ──────────────────────────────

function ZonesManager({ propertyId, unitId }: { propertyId: string; unitId: string }) {
  const { data } = useGetZonesQuery({ propertyId, unitId }, { refetchOnMountOrArgChange: true });
  const [createZone] = useCreateZoneMutation();
  const [updateZone] = useUpdateZoneMutation();
  const [deleteZone, { isLoading: isDeleting }] = useDeleteZoneMutation();
  const [showCreate, setShowCreate] = useState(false);
  const [editingZone, setEditingZone] = useState<ParkingZone | null>(null);
  const [deletingZone, setDeletingZone] = useState<ParkingZone | null>(null);
  const zones = data?.data || [];

  const handleCreate = async (form: { name: string; code: string; zoneType: string }) => {
    try {
      await createZone({ propertyId, data: { ...form, unitId } }).unwrap();
      toast.success('Zone created');
      setShowCreate(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleUpdate = async (form: { name: string; code: string; zoneType: string }) => {
    if (!editingZone) return;
    try {
      await updateZone({ propertyId, id: editingZone.id, data: form }).unwrap();
      toast.success('Zone updated');
      setEditingZone(null);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleDelete = async () => {
    if (!deletingZone) return;
    try {
      await deleteZone({ propertyId, id: deletingZone.id }).unwrap();
      toast.success('Zone deleted');
      setDeletingZone(null);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Parking Zones ({zones.length})</h3>
        <PermissionGuard permission="parking-overview.write">
          <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Add Zone</button>
        </PermissionGuard>
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
            <PermissionGuard permission="parking-overview.write">
              <div className="row-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn-icon-sm" title="Edit zone" onClick={() => setEditingZone(z)}><Pencil size={14} /></button>
                <button
                  className="btn-icon-sm btn-icon-danger"
                  title={z._count.slots > 0 ? `Zone has ${z._count.slots} slot(s) — cannot delete` : 'Delete zone'}
                  disabled={z._count.slots > 0}
                  onClick={() => setDeletingZone(z)}
                ><Trash2 size={14} /></button>
              </div>
            </PermissionGuard>
          </div>
        ))}
        {zones.length === 0 && <div style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>No zones yet — add one to organize your parking</div>}
      </div>

      {showCreate && (
        <CreateZoneModal onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}
      {editingZone && (
        <CreateZoneModal zone={editingZone} onClose={() => setEditingZone(null)} onSubmit={handleUpdate} />
      )}
      {deletingZone && (
        <ConfirmDeleteModal
          title="Delete Zone"
          message={`Delete zone '${deletingZone.name}'? This cannot be undone.`}
          isLoading={isDeleting}
          onClose={() => setDeletingZone(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function CreateZoneModal({ zone, onClose, onSubmit }: { zone?: ParkingZone; onClose: () => void; onSubmit: (data: any) => void }) {
  const [name, setName] = useState(zone?.name || '');
  const [code, setCode] = useState(zone?.code || '');
  const [zoneType, setZoneType] = useState(zone?.zoneType || 'covered');

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <h2>{zone ? 'Edit Parking Zone' : 'New Parking Zone'}</h2>
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
          <button className="btn-primary" disabled={!name} onClick={() => onSubmit({ name, code: code || undefined, zoneType })}>{zone ? 'Save Changes' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
