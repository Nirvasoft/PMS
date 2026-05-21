import { useState } from 'react';
import {
  useGetAllocationsQuery, useCreateAllocationMutation, useCancelAllocationMutation,
  useGetSlotsQuery, type ParkingAllocation,
} from '../../../store/api/parkingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { Link2, Plus, Trash2, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import './ParkingPage.css';

export default function AllocationManager() {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data, isLoading } = useGetAllocationsQuery({ propertyId: propertyFilter || undefined, page, limit: 20 });
  const [cancelAllocation] = useCancelAllocationMutation();

  const properties = propertiesData?.data || [];
  const allocations = data?.data || [];
  const meta = data?.meta;

  const handleCancel = async (id: string, slotNumber: string) => {
    if (!confirm(`Cancel allocation for slot ${slotNumber}?`)) return;
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
                <div>
                  {a.status === 'active' && (
                    <button className="row-btn-delete" onClick={() => handleCancel(a.id, a.slot.slotNumber)}>
                      <Trash2 size={13} />
                    </button>
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
    </div>
  );
}

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
    <div className="crm-modal-overlay" onClick={onClose}>
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
