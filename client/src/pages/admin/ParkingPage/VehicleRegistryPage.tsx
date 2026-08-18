import { useState, useMemo } from 'react';
import {
  useGetVehiclesQuery, useAddVehicleMutation,
  useUpdateVehicleMutation, useDeactivateVehicleMutation,
  type TenantVehicle,
} from '../../../store/api/parkingApi';
import { useGetTenantsQuery, type TenantListItem } from '../../../store/api/tenantsApi';
import {
  Car, Plus, Search, Edit3, Trash2, X, Save, Tag, Wifi,
  ChevronDown, AlertTriangle, Truck, Bike,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './ParkingPage.css';

const VEHICLE_TYPES: Record<string, { label: string; icon: JSX.Element; color: string }> = {
  car:        { label: 'Car',        icon: <Car size={14} />,   color: '#3b82f6' },
  suv:        { label: 'SUV',        icon: <Car size={14} />,   color: '#8b5cf6' },
  motorcycle: { label: 'Motorcycle', icon: <Bike size={14} />,  color: '#f59e0b' },
  truck:      { label: 'Truck',      icon: <Truck size={14} />, color: '#ef4444' },
  van:        { label: 'Van',        icon: <Truck size={14} />, color: '#06b6d4' },
};

export default function VehicleRegistryPage() {
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<TenantVehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantVehicle | null>(null);

  // Fetch tenants
  const { data: tenantsData, isFetching: isFetchingTenants } = useGetTenantsQuery(
    { search: tenantSearch || undefined, page: 1, limit: 50 }
  );
  const tenants = tenantsData?.data || [];
  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  // Fetch vehicles for selected tenant
  const { data: vehiclesData, isFetching: isFetchingVehicles } = useGetVehiclesQuery(
    selectedTenantId,
    { skip: !selectedTenantId }
  );
  const allVehicles = vehiclesData?.data || [];

  // Filter vehicles by search
  const vehicles = useMemo(() => {
    if (!vehicleSearch) return allVehicles;
    const q = vehicleSearch.toLowerCase();
    return allVehicles.filter(v =>
      v.plateNumber.toLowerCase().includes(q) ||
      v.make?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q) ||
      v.color?.toLowerCase().includes(q) ||
      v.rfidTagNo?.toLowerCase().includes(q)
    );
  }, [allVehicles, vehicleSearch]);

  const activeVehicles = vehicles.filter(v => v.isActive);
  const inactiveVehicles = vehicles.filter(v => !v.isActive);

  return (
    <div className="parking-page">
      <div className="vr-page-header">
        <div>
          <h1 className="page-title">Vehicle Registry</h1>
          <p className="page-subtitle">Manage tenant vehicles, RFID tags, and registrations</p>
        </div>
      </div>

      <div className="vr-layout">
        {/* Left: Tenant Selector */}
        <div className="vr-tenant-panel">
          <div className="vr-search-box">
            <Search size={14} />
            <input
              className="form-input"
              value={tenantSearch}
              onChange={e => setTenantSearch(e.target.value)}
              placeholder="Search tenants…"
            />
          </div>
          <div className="vr-tenant-list">
            {isFetchingTenants ? (
              <div className="vr-tenant-empty">Loading…</div>
            ) : tenants.length === 0 ? (
              <div className="vr-tenant-empty">No tenants found</div>
            ) : (
              tenants.map((t: TenantListItem) => (
                <button
                  key={t.id}
                  className={`vr-tenant-item ${selectedTenantId === t.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTenantId(t.id)}
                >
                  <div className="vti-avatar">
                    {t.avatarUrl
                      ? <img src={t.avatarUrl} alt="" />
                      : <span>{(t.displayName?.[0] || '?').toUpperCase()}</span>
                    }
                  </div>
                  <div className="vti-info">
                    <div className="vti-name">{t.displayName}</div>
                    <div className="vti-meta">{t.tenantType} {t.email ? `· ${t.email}` : ''}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Vehicle List */}
        <div className="vr-vehicle-panel">
          {!selectedTenantId ? (
            <div className="vr-empty-state">
              <Car size={48} />
              <h3>Select a Tenant</h3>
              <p>Choose a tenant from the list to view and manage their registered vehicles</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="vr-toolbar">
                <div className="vr-toolbar-left">
                  <h2 className="vr-tenant-title">
                    {selectedTenant?.displayName || 'Tenant'}
                    <span className="vr-vehicle-count">{activeVehicles.length} vehicle{activeVehicles.length !== 1 ? 's' : ''}</span>
                  </h2>
                </div>
                <div className="vr-toolbar-right">
                  <div className="vr-search-box vr-search-sm">
                    <Search size={14} />
                    <input
                      className="form-input"
                      value={vehicleSearch}
                      onChange={e => setVehicleSearch(e.target.value)}
                      placeholder="Filter vehicles…"
                    />
                  </div>
                  <button className="btn-primary" onClick={() => { setEditingVehicle(null); setShowAddModal(true); }}>
                    <Plus size={14} /> Add Vehicle
                  </button>
                </div>
              </div>

              {/* Vehicle Cards */}
              {isFetchingVehicles ? (
                <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
              ) : activeVehicles.length === 0 && inactiveVehicles.length === 0 ? (
                <div className="vr-empty-state">
                  <Car size={40} />
                  <h3>No Vehicles Registered</h3>
                  <p>This tenant has no vehicles. Click "Add Vehicle" to register one.</p>
                </div>
              ) : (
                <>
                  {/* Active Vehicles */}
                  <div className="vr-cards-grid">
                    {activeVehicles.map(v => (
                      <VehicleCard
                        key={v.id}
                        vehicle={v}
                        tenantId={selectedTenantId}
                        onEdit={() => { setEditingVehicle(v); setShowAddModal(true); }}
                        onDelete={() => setDeleteTarget(v)}
                      />
                    ))}
                  </div>

                  {/* Inactive Vehicles */}
                  {inactiveVehicles.length > 0 && (
                    <div className="vr-inactive-section">
                      <h4 className="vr-section-title">Deactivated ({inactiveVehicles.length})</h4>
                      <div className="vr-cards-grid">
                        {inactiveVehicles.map(v => (
                          <VehicleCard
                            key={v.id}
                            vehicle={v}
                            tenantId={selectedTenantId}
                            onEdit={() => { setEditingVehicle(v); setShowAddModal(true); }}
                            onDelete={() => setDeleteTarget(v)}
                            inactive
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Vehicle Modal */}
      {showAddModal && (
        <VehicleFormModal
          tenantId={selectedTenantId}
          vehicle={editingVehicle}
          onClose={() => { setShowAddModal(false); setEditingVehicle(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <DeleteVehicleConfirm
          vehicle={deleteTarget}
          tenantId={selectedTenantId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Vehicle Card ─────────────────────────────

function VehicleCard({
  vehicle: v, tenantId, onEdit, onDelete, inactive,
}: {
  vehicle: TenantVehicle;
  tenantId: string;
  onEdit: () => void;
  onDelete: () => void;
  inactive?: boolean;
}) {
  const vType = VEHICLE_TYPES[v.vehicleType] || VEHICLE_TYPES.car;

  return (
    <div className={`vehicle-card ${inactive ? 'inactive' : ''}`}>
      <div className="vc-top">
        <div className="vc-plate-badge">
          <span className="vc-plate">{v.plateNumber}</span>
        </div>
        <div className="vc-type-badge" style={{ color: vType.color, background: vType.color + '18' }}>
          {vType.icon}
          {vType.label}
        </div>
      </div>

      <div className="vc-details">
        {(v.make || v.model) && (
          <div className="vc-make-model">
            {v.make} {v.model}
          </div>
        )}
        {v.color && (
          <div className="vc-detail-item">
            <span className="vc-color-dot" style={{ background: getColorHex(v.color) }} />
            {v.color}
          </div>
        )}
        {v.rfidTagNo && (
          <div className="vc-detail-item vc-rfid">
            <Wifi size={11} />
            <span>{v.rfidTagNo}</span>
          </div>
        )}
      </div>

      {!inactive && (
        <div className="vc-actions">
          <button className="btn-sm btn-ghost" onClick={onEdit} title="Edit">
            <Edit3 size={13} /> Edit
          </button>
          <button className="btn-sm btn-ghost btn-danger-text" onClick={onDelete} title="Deactivate">
            <Trash2 size={13} />
          </button>
        </div>
      )}
      {inactive && (
        <div className="vc-inactive-badge">Deactivated</div>
      )}
    </div>
  );
}

// ── Add/Edit Modal ──────────────────────────

function VehicleFormModal({
  tenantId,
  vehicle,
  onClose,
}: {
  tenantId: string;
  vehicle: TenantVehicle | null;
  onClose: () => void;
}) {
  const isEdit = !!vehicle;
  const [addVehicle, { isLoading: isAdding }] = useAddVehicleMutation();
  const [updateVehicle, { isLoading: isUpdating }] = useUpdateVehicleMutation();
  const isSaving = isAdding || isUpdating;

  const [form, setForm] = useState({
    plateNumber: vehicle?.plateNumber || '',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    color: vehicle?.color || '',
    vehicleType: vehicle?.vehicleType || 'car',
    rfidTagNo: vehicle?.rfidTagNo || '',
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.plateNumber.trim()) {
      toast.error('Plate number is required');
      return;
    }
    try {
      const data: Record<string, unknown> = {
        plateNumber: form.plateNumber.trim(),
        make: form.make || null,
        model: form.model || null,
        color: form.color || null,
        vehicleType: form.vehicleType,
        rfidTagNo: form.rfidTagNo || null,
      };

      if (isEdit) {
        await updateVehicle({ tenantId, vehicleId: vehicle!.id, data }).unwrap();
        toast.success('Vehicle updated');
      } else {
        await addVehicle({ tenantId, data }).unwrap();
        toast.success('Vehicle registered');
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || `Failed to ${isEdit ? 'update' : 'add'} vehicle`);
    }
  };

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal vr-modal" onClick={e => e.stopPropagation()}>
        <div className="vr-modal-header">
          <div className="vr-modal-icon">
            <Car size={20} />
          </div>
          <h2>{isEdit ? 'Edit Vehicle' : 'Register Vehicle'}</h2>
        </div>

        <div className="form-group">
          <label>Plate Number *</label>
          <input
            className="form-input vr-plate-input"
            value={form.plateNumber}
            onChange={e => set('plateNumber', e.target.value.toUpperCase())}
            placeholder="ABC-1234"
            autoFocus
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Make</label>
            <input className="form-input" value={form.make} onChange={e => set('make', e.target.value)} placeholder="Toyota" />
          </div>
          <div className="form-group">
            <label>Model</label>
            <input className="form-input" value={form.model} onChange={e => set('model', e.target.value)} placeholder="Camry" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Color</label>
            <input className="form-input" value={form.color} onChange={e => set('color', e.target.value)} placeholder="Silver" />
          </div>
          <div className="form-group">
            <label>Vehicle Type</label>
            <select className="form-input" value={form.vehicleType} onChange={e => set('vehicleType', e.target.value)}>
              {Object.entries(VEHICLE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>RFID Tag No.</label>
          <div className="vr-rfid-input-wrap">
            <Wifi size={14} />
            <input className="form-input" value={form.rfidTagNo} onChange={e => set('rfidTagNo', e.target.value)} placeholder="RFID-0001" />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={isSaving || !form.plateNumber.trim()}>
            <Save size={14} />
            {isSaving ? 'Saving…' : isEdit ? 'Update Vehicle' : 'Register Vehicle'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation ────────────────────

function DeleteVehicleConfirm({
  vehicle,
  tenantId,
  onClose,
}: {
  vehicle: TenantVehicle;
  tenantId: string;
  onClose: () => void;
}) {
  const [deactivateVehicle, { isLoading }] = useDeactivateVehicleMutation();

  const handleDelete = async () => {
    try {
      await deactivateVehicle({ tenantId, vehicleId: vehicle.id }).unwrap();
      toast.success('Vehicle deactivated');
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to deactivate');
    }
  };

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="vr-delete-icon"><AlertTriangle size={28} /></div>
        <h2 style={{ textAlign: 'center' }}>Deactivate Vehicle?</h2>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
          This will deactivate <strong>{vehicle.plateNumber}</strong>
          {vehicle.make && ` (${vehicle.make} ${vehicle.model || ''})`}.
        </p>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
          The vehicle record will be preserved but marked as inactive.
        </p>
        <div className="modal-actions" style={{ justifyContent: 'center' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-danger" onClick={handleDelete} disabled={isLoading}>
            {isLoading ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────

function getColorHex(colorName: string): string {
  const map: Record<string, string> = {
    black: '#1a1a1a', white: '#e5e5e5', silver: '#a3a3a3', gray: '#6b7280',
    grey: '#6b7280', red: '#ef4444', blue: '#3b82f6', green: '#22c55e',
    yellow: '#eab308', gold: '#ca8a04', orange: '#f97316', brown: '#92400e',
    beige: '#d4c5a9', maroon: '#7f1d1d', navy: '#1e3a5f', purple: '#7c3aed',
    pink: '#ec4899', champagne: '#f5e6cc', bronze: '#cd7f32',
  };
  return map[colorName.toLowerCase()] || '#6b7280';
}
