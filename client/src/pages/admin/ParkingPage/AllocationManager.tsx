import { useState } from 'react';
import {
  useGetAllocationsQuery, useCreateAllocationMutation, useCancelAllocationMutation,
  useUpdateAllocationMutation, useGetVehiclesQuery,
  useGetSlotsQuery, type ParkingAllocation,
} from '../../../store/api/parkingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { useConfirm } from '../../../components/DialogProvider';
import { Link2, Plus, Trash2, Car, Edit3, Save, X, Calendar, DollarSign, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import './ParkingPage.css';

export default function AllocationManager() {
  const confirmDialog = useConfirm();
  const [propertyFilter, setPropertyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAlloc, setEditingAlloc] = useState<ParkingAllocation | null>(null);

  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data, isLoading } = useGetAllocationsQuery({ propertyId: propertyFilter || undefined, page, limit: 20 });
  const [cancelAllocation] = useCancelAllocationMutation();

  const properties = propertiesData?.data || [];
  const allocations = data?.data || [];
  const meta = data?.meta;

  const handleCancel = async (id: string, slotNumber: string) => {
    if (!(await confirmDialog(`Cancel allocation for slot ${slotNumber}?`, { danger: true, confirmText: 'Cancel' }))) return;
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
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New Allocation
        </button>
      </div>

      <div className="pipeline-toolbar" style={{ marginBottom: 16 }}>
        <select className="filter-select" value={propertyFilter} onChange={(e) => { setPropertyFilter(e.target.value); setPage(1); }}>
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            const tenantName = a.tenant.tenantType === 'company' ? a.tenant.companyName : `${a.tenant.firstName} ${a.tenant.lastName}`;
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
                    <>
                      <button className="row-btn-edit" onClick={() => setEditingAlloc(a)} title="Edit allocation">
                        <Edit3 size={13} />
                      </button>
                      <button className="row-btn-delete" onClick={() => handleCancel(a.id, a.slot.slotNumber)} title="Cancel allocation">
                        <Trash2 size={13} />
                      </button>
                    </>
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

      {showCreate && <CreateAllocationModal properties={properties} onClose={() => setShowCreate(false)} />}
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

  const tenantName = allocation.tenant.tenantType === 'company'
    ? allocation.tenant.companyName
    : `${allocation.tenant.firstName} ${allocation.tenant.lastName}`;

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal alloc-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="alloc-edit-header">
          <div className="alloc-edit-icon"><Edit3 size={20} /></div>
          <h2>Edit Allocation</h2>
        </div>

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
                  <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of month</option>
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

function CreateAllocationModal({ properties, onClose }: { properties: any[]; onClose: () => void }) {
  const [createAllocation, { isLoading }] = useCreateAllocationMutation();
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const { data: slotsData } = useGetSlotsQuery({ propertyId, status: 'available', limit: 200 });
  const { data: tenantsData } = useGetTenantsQuery({ page: 1, limit: 100 });

  const [form, setForm] = useState({ slotId: '', tenantId: '', startDate: '', endDate: '', monthlyRate: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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
        <h2>New Parking Allocation</h2>
        <div className="form-group">
          <label>Property</label>
          <select className="form-input" value={propertyId} onChange={e => setPropertyId(e.target.value)}>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Available Slot *</label>
          <select className="form-input" value={form.slotId} onChange={e => set('slotId', e.target.value)}>
            <option value="">— Select slot —</option>
            {slots.map((s: any) => <option key={s.id} value={s.id}>{s.slotNumber} ({s.zone?.name || 'No zone'})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Tenant *</label>
          <select className="form-input" value={form.tenantId} onChange={e => set('tenantId', e.target.value)}>
            <option value="">— Select tenant —</option>
            {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.tenantType === 'company' ? t.companyName : `${t.firstName} ${t.lastName}`}</option>)}
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
