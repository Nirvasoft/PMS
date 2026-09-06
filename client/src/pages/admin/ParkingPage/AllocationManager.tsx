import { useState, useEffect, useRef } from 'react';
import {
  useGetAllocationsQuery, useCreateAllocationMutation, useCancelAllocationMutation,
  useUpdateAllocationMutation, useGetVehiclesQuery,
  useGetSlotsQuery, useGetParkingTypesQuery, useGetZonesQuery, type ParkingAllocation, type ParkingUnitType,
} from '../../../store/api/parkingApi';
import { useGetPropertiesQuery, useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useConfirm } from '../../../components/DialogProvider';
import { Link2, Plus, Trash2, Car, Edit3, Save, X, Calendar, DollarSign, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './ParkingPage.css';

function ordinalSuffix(n: number): string {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

export default function AllocationManager() {
  const confirmDialog = useConfirm();
  const selectedProperty = useSelectedPropertyFilter();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAlloc, setEditingAlloc] = useState<ParkingAllocation | null>(null);

  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data, isLoading } = useGetAllocationsQuery({ propertyId: selectedProperty || undefined, page, limit: 20 });

  // Reset pagination whenever the sidebar's Active Property changes.
  useEffect(() => { setPage(1); }, [selectedProperty]);
  const [cancelAllocation] = useCancelAllocationMutation();

  const properties = propertiesData?.data || [];
  const allocations = data?.data || [];
  const meta = data?.meta;

  const handleCancel = async (id: string, slotNumber: string) => {
    if (!(await confirmDialog(`Cancel allocation for slot ${slotNumber}?`, { danger: true, confirmText: 'Cancel Allocation', cancelText: 'Keep' }))) return;
    try {
      await cancelAllocation(id).unwrap();
      toast.success('Allocation cancelled');
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="parking-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Link2 size={22} /></div>
          <div>
            <h1>Parking Allocations</h1>
            <p>{meta ? `${meta.total} allocations` : 'Loading…'}</p>
          </div>
        </div>
        <PermissionGuard permission="parking-allocations.write">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Allocation
          </button>
        </PermissionGuard>
      </div>

      <div className="pipeline-toolbar" style={{ marginBottom: 16 }}>
        {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select className="filter-select" value={selectedProperty} disabled>
          {selectedProperty && (
            <option value={selectedProperty}>{properties.find((p: any) => p.id === selectedProperty)?.name || ''}</option>
          )}
        </select>
      </div>

      <div className="alloc-table-wrap">
        <div className="alloc-table-header">
          <span>Slot</span><span>Tenant</span><span>Dates</span>
          <span>Rate/mo</span><span>Status</span><span></span>
        </div>
        {isLoading ? (
          <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
        ) : allocations.length === 0 ? (
          <div className="table-empty"><Car size={40} /><p>No allocations found</p></div>
        ) : (
          allocations.map((a: ParkingAllocation) => {
            const tenantName = a.tenant.tenantType !== 'individual' ? a.tenant.companyName : `${a.tenant.firstName} ${a.tenant.lastName}`;
            return (
              <div key={a.id} className="alloc-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{a.slot.slotNumber}</div>
                  {a.slot.zone && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{a.slot.zone.name}</div>}
                </div>
                <div>
                  <div>{tenantName}</div>
                  {a.unit && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Unit {a.unit.unitNumber}</div>}
                  {a.vehicle && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🚗 {a.vehicle.plateNumber}</div>}
                </div>
                <div style={{ fontSize: 12 }}>
                  {new Date(a.startDate).toLocaleDateString()}
                  {a.endDate ? ` → ${new Date(a.endDate).toLocaleDateString()}` : ' → Ongoing'}
                </div>
                <div style={{ fontWeight: 600 }}>${Number(a.monthlyRate).toLocaleString()}</div>
                <div>
                  <span className="slot-status-badge" style={{
                    background: a.status === 'active' ? '#10b98118' : a.status === 'cancelled' ? '#ef444418' : '#6b728018',
                    color: a.status === 'active' ? '#10b981' : a.status === 'cancelled' ? '#ef4444' : '#6b7280',
                  }}>
                    {a.status}
                  </span>
                </div>
                <div className="alloc-row-actions">
                  {a.status === 'active' && (
                    <PermissionGuard permission="parking-allocations.write">
                      <button className="row-btn-edit" onClick={() => setEditingAlloc(a)} title="Edit allocation">
                        <Edit3 size={13} />
                      </button>
                      <button className="row-btn-delete" onClick={() => handleCancel(a.id, a.slot.slotNumber)} title="Cancel allocation">
                        <Trash2 size={13} />
                      </button>
                    </PermissionGuard>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {showCreate && <CreateAllocationModal properties={properties} activeProperty={selectedProperty} onClose={() => setShowCreate(false)} />}
      {editingAlloc && (
        <EditAllocationModal
          allocation={editingAlloc}
          onClose={() => setEditingAlloc(null)}
        />
      )}
    </div>
  );
}

// ── Edit Allocation Modal ──────────────────

function EditAllocationModal({ allocation, onClose }: { allocation: ParkingAllocation; onClose: () => void }) {
  const [updateAllocation, { isLoading }] = useUpdateAllocationMutation();

  // Fetch vehicles for the tenant so they can link one
  const tenantId = allocation.tenant?.id;
  const { data: vehiclesData } = useGetVehiclesQuery(tenantId || '', { skip: !tenantId });
  const vehicles = (vehiclesData?.data || []).filter(v => v.isActive);

  const [form, setForm] = useState({
    endDate: allocation.endDate ? allocation.endDate.substring(0, 10) : '',
    monthlyRate: Number(allocation.monthlyRate).toString(),
    billingDay: allocation.billingDay.toString(),
    vehicleId: allocation.vehicle?.id || '',
    notes: allocation.notes || '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    try {
      const data: Record<string, unknown> = {};

      // Only send changed fields
      const newEndDate = form.endDate || null;
      const oldEndDate = allocation.endDate ? allocation.endDate.substring(0, 10) : null;
      if (newEndDate !== oldEndDate) data.endDate = newEndDate;

      const newRate = Number(form.monthlyRate);
      if (newRate !== Number(allocation.monthlyRate)) data.monthlyRate = newRate;

      const newBillingDay = Number(form.billingDay);
      if (newBillingDay !== allocation.billingDay) data.billingDay = newBillingDay;

      const newVehicleId = form.vehicleId || null;
      const oldVehicleId = allocation.vehicle?.id || null;
      if (newVehicleId !== oldVehicleId) data.vehicleId = newVehicleId;

      const newNotes = form.notes || null;
      const oldNotes = allocation.notes || null;
      if (newNotes !== oldNotes) data.notes = newNotes;

      if (Object.keys(data).length === 0) {
        onClose();
        return;
      }

      await updateAllocation({ id: allocation.id, data }).unwrap();
      toast.success('Allocation updated');
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to update');
    }
  };

  const tenantName = allocation.tenant.tenantType !== 'individual'
    ? allocation.tenant.companyName
    : `${allocation.tenant.firstName} ${allocation.tenant.lastName}`;

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal alloc-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="alloc-edit-header">
          <div className="alloc-edit-icon"><Edit3 size={20} /></div>
          <h2>Edit Allocation</h2>
        </div>

        <div className="alloc-edit-scroll">
          {/* Read-only summary */}
          <div className="alloc-edit-summary">
            <div className="aes-row">
              <span className="aes-label">Slot</span>
              <span className="aes-value">{allocation.slot.slotNumber} {allocation.slot.zone ? `(${allocation.slot.zone.name})` : ''}</span>
            </div>
            <div className="aes-row">
              <span className="aes-label">Tenant</span>
              <span className="aes-value">{tenantName}</span>
            </div>
            {allocation.unit && (
              <div className="aes-row">
                <span className="aes-label">Unit</span>
                <span className="aes-value">{allocation.unit.unitNumber}</span>
              </div>
            )}
            <div className="aes-row">
              <span className="aes-label">Start Date</span>
              <span className="aes-value">{new Date(allocation.startDate).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Editable fields */}
          <div className="alloc-edit-fields">
            <div className="form-row">
              <div className="form-group">
                <label><Calendar size={11} /> End Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.endDate}
                  onChange={e => set('endDate', e.target.value)}
                />
                <span className="form-hint">Leave empty for ongoing allocation</span>
              </div>
              <div className="form-group">
                <label><DollarSign size={11} /> Monthly Rate</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthlyRate}
                  onChange={e => set('monthlyRate', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Billing Day</label>
                <select className="form-input" value={form.billingDay} onChange={e => set('billingDay', e.target.value)}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}{ordinalSuffix(d)} of month</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label><Car size={11} /> Vehicle</label>
                <select className="form-input" value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)}>
                  <option value="">— No vehicle linked —</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber} {v.make ? `(${v.make} ${v.model || ''})` : ''}
                    </option>
                  ))}
                </select>
                {vehicles.length === 0 && tenantId && (
                  <span className="form-hint">No vehicles registered for this tenant</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label><FileText size={11} /> Notes</label>
              <textarea
                className="form-input"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Internal notes about this allocation…"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            <X size={14} /> Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={isLoading}>
            <Save size={14} /> {isLoading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Allocation Modal ────────────────

function CreateAllocationModal({ properties, activeProperty, onClose }: { properties: any[]; activeProperty: string; onClose: () => void }) {
  const [createAllocation, { isLoading }] = useCreateAllocationMutation();
  // /properties requires properties.read, which a parking-only role may lack — use the
  // permission-free /properties/my-scope endpoint so the locked field still resolves
  // a name instead of silently rendering as unselected. See useSelectedPropertyId.ts.
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const lockedPropertyName = (scopeData?.data || []).find((p: any) => p.id === activeProperty)?.name;
  const propertyLocked = !!activeProperty;

  const [propertyId, setPropertyId] = useState(activeProperty || '');
  const [parkingType, setParkingType] = useState('');
  const [zoneId, setZoneId] = useState('');
  const { data: typesData } = useGetParkingTypesQuery(propertyId, { skip: !propertyId });
  const parkingTypes = typesData?.data || [];
  const { data: zonesData } = useGetZonesQuery({ propertyId, unitType: parkingType || undefined }, { skip: !propertyId });
  const zones = zonesData?.data || [];
  const { data: slotsData } = useGetSlotsQuery(
    { propertyId, unitType: parkingType || undefined, zoneId: zoneId || undefined, status: 'available', limit: 200 },
    { skip: !propertyId },
  );
  const { data: tenantsData } = useGetTenantsQuery({ page: 1, limit: 100 });

  const [form, setForm] = useState({ slotId: '', tenantId: '', startDate: '', endDate: '', monthlyRate: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handlePropertyChange = (id: string) => { setPropertyId(id); setParkingType(''); setZoneId(''); set('slotId', ''); };
  const handleTypeChange = (type: string) => { setParkingType(type); setZoneId(''); set('slotId', ''); };
  const handleZoneChange = (id: string) => { setZoneId(id); set('slotId', ''); };

  // Bound to the sidebar's Active Property; only "All Properties" allows picking one here.
  // Clears back to "Select property" if the sidebar is switched to "All Properties".
  const prevPropertyLockedRef = useRef(propertyLocked);
  useEffect(() => {
    if (propertyLocked) {
      if (propertyId !== activeProperty) handlePropertyChange(activeProperty);
    } else if (prevPropertyLockedRef.current) {
      handlePropertyChange('');
    }
    prevPropertyLockedRef.current = propertyLocked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyLocked, activeProperty]);

  const slots = slotsData?.data || [];
  const tenants = tenantsData?.data || [];

  const handleSubmit = async () => {
    try {
      await createAllocation({
        slotId: form.slotId,
        tenantId: form.tenantId,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        monthlyRate: Number(form.monthlyRate),
      }).unwrap();
      toast.success('Allocation created');
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ marginBottom: 0 }}>New Parking Allocation</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Property</label>
            <select className="form-input" value={propertyId} disabled={propertyLocked} onChange={e => handlePropertyChange(e.target.value)}>
              {propertyLocked ? (
                <option value={activeProperty}>{lockedPropertyName || 'Loading…'}</option>
              ) : (
                <>
                  <option value="">— Select property —</option>
                  {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Parking Type</label>
            <select
              className="form-input"
              value={parkingType}
              onChange={e => handleTypeChange(e.target.value)}
              disabled={!propertyId || parkingTypes.length === 0}
            >
              <option value="">All Types</option>
              {parkingTypes.map((t: ParkingUnitType) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Zone</label>
            <select
              className="form-input"
              value={zoneId}
              onChange={e => handleZoneChange(e.target.value)}
              disabled={!propertyId || zones.length === 0}
            >
              <option value="">All Zones</option>
              {zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Available Slot *</label>
            <select className="form-input" value={form.slotId} onChange={e => set('slotId', e.target.value)}>
              <option value="">— Select slot —</option>
              {slots.map((s: any) => <option key={s.id} value={s.id}>{s.slotNumber} ({s.zone?.name || 'No zone'})</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Tenant *</label>
          <select className="form-input" value={form.tenantId} onChange={e => set('tenantId', e.target.value)}>
            <option value="">— Select tenant —</option>
            {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.tenantType !== 'individual' ? t.companyName : `${t.firstName} ${t.lastName}`}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Start Date *</label><input className="form-input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></div>
          <div className="form-group"><label>End Date</label><input className="form-input" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} /></div>
          <div className="form-group"><label>Monthly Rate *</label><input className="form-input" type="number" value={form.monthlyRate} onChange={e => set('monthlyRate', e.target.value)} placeholder="100" /></div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isLoading || !form.slotId || !form.tenantId || !form.startDate || !form.monthlyRate} onClick={handleSubmit}>
            {isLoading ? 'Creating…' : 'Create Allocation'}
          </button>
        </div>
      </div>
    </div>
  );
}
