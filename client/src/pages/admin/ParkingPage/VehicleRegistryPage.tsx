import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  useGetVehiclesQuery, useAddVehicleMutation,
  useUpdateVehicleMutation, useDeactivateVehicleMutation,
  type TenantVehicle,
} from '../../../store/api/parkingApi';
import { useGetTenantsQuery, type TenantListItem } from '../../../store/api/tenantsApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import ComboBox from '../../../components/ComboBox';
import {
  Car, Plus, Search, Edit3, Trash2, Save, Wifi,
  AlertTriangle, Truck, Bike, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import './ParkingPage.css';

const VEHICLE_TYPES: Record<string, { label: string; icon: ReactNode; color: string }> = {
  car:        { label: 'Car',        icon: <Car size={13} />,   color: '#3b82f6' },
  suv:        { label: 'SUV',        icon: <Car size={13} />,   color: '#8b5cf6' },
  motorcycle: { label: 'Motorcycle', icon: <Bike size={13} />,  color: '#f59e0b' },
  truck:      { label: 'Truck',      icon: <Truck size={13} />, color: '#ef4444' },
  van:        { label: 'Van',        icon: <Truck size={13} />, color: '#06b6d4' },
};

export function getTenantDisplay(t: TenantListItem): { label: string; sublabel?: string } {
  const isCompany = t.tenantType === 'company' || t.tenantType === 'corporate';
  if (isCompany) {
    return {
      label: t.firstName || t.companyName || t.displayName || '—',
      sublabel: t.firstName ? (t.companyName || t.lastName || undefined) : (t.lastName || undefined),
    };
  }
  return {
    label: t.firstName || t.lastName || t.displayName || '—',
    sublabel: t.firstName ? (t.lastName || undefined) : undefined,
  };
}

export default function VehicleRegistryPage() {
  const selectedProperty = useSelectedPropertyFilter();
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedTenantCode, setSelectedTenantCode] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantDebounced, setTenantDebounced] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<TenantVehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantVehicle | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTenantDebounced(tenantSearch), 250);
    return () => clearTimeout(t);
  }, [tenantSearch]);

  // Fetch tenants scoped to active property (matching Create Lease's tenant filter)
  const { data: tenantsData, isFetching: isFetchingTenants } = useGetTenantsQuery({
    search: tenantDebounced || undefined,
    kycStatus: 'verified',
    isBlacklisted: false,
    propertyId: selectedProperty || undefined,
    page: 1,
    limit: 50,
  });
  const tenants = tenantsData?.data || [];
  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  const tenantOptions = useMemo(() => {
    const list = tenants.map((t: TenantListItem) => {
      const { label, sublabel } = getTenantDisplay(t);
      return { id: t.id, label, sublabel };
    });
    if (selectedTenantId && !list.some(t => t.id === selectedTenantId)) {
      list.unshift({
        id: selectedTenantId,
        label: selectedTenantCode || 'Selected tenant',
        sublabel: undefined,
      });
    }
    return list;
  }, [tenants, selectedTenantId, selectedTenantCode]);

  // Auto-select first tenant when list loads or property changes
  useEffect(() => {
    if (!tenantDebounced) {
      if (tenants.length > 0 && (!selectedTenantId || !tenants.some(t => t.id === selectedTenantId))) {
        const first = tenants[0];
        const { label } = getTenantDisplay(first);
        setSelectedTenantId(first.id);
        setSelectedTenantCode(label);
      } else if (tenants.length === 0) {
        setSelectedTenantId('');
        setSelectedTenantCode('');
      }
    }
  }, [tenants, selectedTenantId, tenantDebounced]);

  // Reset vehicle table pagination when tenant, filter, or page size changes
  useEffect(() => {
    setPage(1);
  }, [selectedTenantId, vehicleSearch, pageSize]);

  // Fetch vehicles for selected tenant
  const { data: vehiclesData, isFetching: isFetchingVehicles } = useGetVehiclesQuery(
    selectedTenantId,
    { skip: !selectedTenantId }
  );
  const allVehicles = vehiclesData?.data || [];

  // Filter vehicles by search and sort active first
  const vehicles = useMemo(() => {
    const filtered = !vehicleSearch
      ? allVehicles
      : allVehicles.filter(v => {
          const q = vehicleSearch.toLowerCase();
          return (
            v.plateNumber.toLowerCase().includes(q) ||
            v.make?.toLowerCase().includes(q) ||
            v.model?.toLowerCase().includes(q) ||
            v.color?.toLowerCase().includes(q) ||
            v.rfidTagNo?.toLowerCase().includes(q)
          );
        });
    return [...filtered].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  }, [allVehicles, vehicleSearch]);

  const activeCount = useMemo(() => allVehicles.filter(v => v.isActive).length, [allVehicles]);
  const totalPages = Math.max(1, Math.ceil(vehicles.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedVehicles = useMemo(
    () => vehicles.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [vehicles, currentPage, pageSize]
  );

  const selectedDisplay = selectedTenant
    ? getTenantDisplay(selectedTenant)
    : { label: selectedTenantCode || '—', sublabel: undefined };

  return (
    <div className="parking-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg">
            <Car size={22} />
          </div>
          <div>
            <h1>Vehicle Registry</h1>
            <p>
              {selectedTenantId
                ? `${allVehicles.length} total vehicle${allVehicles.length !== 1 ? 's' : ''} (${activeCount} active)`
                : 'Manage tenant vehicles, RFID tags, and registrations'}
            </p>
          </div>
        </div>
        <PermissionGuard permission="parking-vehicles.write">
          <button
            className="btn btn-primary"
            disabled={!selectedTenantId}
            onClick={() => { setEditingVehicle(null); setShowAddModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} /> Add Vehicle
          </button>
        </PermissionGuard>
      </div>

      {/* Filter Bar */}
      <div className="vr-filter-bar">
        <div className="parking-filter-field vr-tenant-combobox-wrap">
          <label>Tenant</label>
          <ComboBox
            id="vr-tenant-select"
            value={selectedTenantId}
            selectedLabel={selectedTenantCode}
            onChange={(v) => {
              const opt = tenantOptions.find(t => t.id === v);
              setSelectedTenantId(v);
              setSelectedTenantCode(opt?.label || '');
            }}
            options={tenantOptions}
            onSearch={setTenantSearch}
            loading={isFetchingTenants}
            placeholder="Search tenant by code or name…"
            emptyMessage="No verified tenants found"
          />
        </div>

        <div className="parking-filter-field vr-vehicle-search-wrap">
          <label>Search Vehicles</label>
          <div className="vr-search-box">
            <Search size={14} />
            <input
              className="form-input"
              value={vehicleSearch}
              onChange={e => setVehicleSearch(e.target.value)}
              placeholder="Search plate, make, model, color, RFID…"
            />
            {vehicleSearch && (
              <button className="vr-search-clear" onClick={() => setVehicleSearch('')} aria-label="Clear filter">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full-Width Vehicle List Table */}
      <div className="vr-table-wrap">
        <TableScrollWrapper className="tenant-table-scroll">
          <div className="vr-table-inner">
            <div className="vr-table-header">
              <span>Plate No.</span>
              <span>Tenant</span>
              <span>Type</span>
              <span>Make / Model</span>
              <span>Color</span>
              <span>RFID Tag</span>
              <span>Status</span>
              <span></span>
            </div>
            {!selectedTenantId ? (
              <div className="table-empty">
                <Car size={40} />
                <p>Select a tenant above to view their registered vehicles</p>
              </div>
            ) : isFetchingVehicles ? (
              <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
            ) : vehicles.length === 0 ? (
              <div className="table-empty">
                <Car size={40} />
                <p>{vehicleSearch ? 'No matching vehicles found' : 'No vehicles registered for this tenant'}</p>
              </div>
            ) : (
              paginatedVehicles.map((v: TenantVehicle) => {
                const vType = VEHICLE_TYPES[v.vehicleType] || VEHICLE_TYPES.car;
                const makeModel = [v.make, v.model].filter(Boolean).join(' ') || '—';
                return (
                  <div key={v.id} className={`vr-row ${!v.isActive ? 'vr-row-inactive' : ''}`}>
                    <div>
                      <span className="vr-plate-cell">{v.plateNumber}</span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{selectedDisplay.label}</div>
                      {selectedDisplay.sublabel && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{selectedDisplay.sublabel}</div>
                      )}
                    </div>
                    <div>
                      <span className="vc-type-badge" style={{ color: vType.color, background: vType.color + '18' }}>
                        {vType.icon}
                        {vType.label}
                      </span>
                    </div>
                    <div style={{ fontWeight: 500 }}>{makeModel}</div>
                    <div>
                      {v.color ? (
                        <span className="vc-color-inline">
                          <span className="vc-color-dot" style={{ background: getColorHex(v.color) }} />
                          {v.color}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </div>
                    <div>
                      {v.rfidTagNo ? (
                        <span className="vc-rfid">
                          <Wifi size={12} />
                          <span>{v.rfidTagNo}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </div>
                    <div>
                      <span
                        className="slot-status-badge"
                        style={{
                          background: v.isActive ? '#10b98118' : '#6b728018',
                          color: v.isActive ? '#10b981' : '#6b7280',
                        }}
                      >
                        {v.isActive ? 'active' : 'inactive'}
                      </span>
                    </div>
                    <div className="alloc-row-actions">
                      {v.isActive && (
                        <PermissionGuard permission="parking-vehicles.write">
                          <button
                            className="row-btn-edit"
                            onClick={() => { setEditingVehicle(v); setShowAddModal(true); }}
                            title="Edit vehicle"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            className="row-btn-delete"
                            onClick={() => setDeleteTarget(v)}
                            title="Deactivate vehicle"
                          >
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
        </TableScrollWrapper>

        {selectedTenantId && vehicles.length > 0 && (
          <div className="parking-pagination billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <span>Rows per page:</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="page-btns">
              <button disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)} title="Previous Page">
                <ChevronLeft size={16} />
              </button>
              <span className="page-num-display">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)} title="Next Page">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
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
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if (!form.plateNumber.trim()) {
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
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}
        >
          <X size={18} />
        </button>
        <div className="vr-modal-header">
          <div className="vr-modal-icon">
            <Car size={20} />
          </div>
          <h2>{isEdit ? 'Edit Vehicle' : 'Register Vehicle'}</h2>
        </div>

        <div className="form-group">
          <label>Plate Number *</label>
          <input
            className={`form-input vr-plate-input ${hasAttemptedSubmit && !form.plateNumber.trim() ? 'input-error' : ''}`}
            value={form.plateNumber}
            onChange={e => set('plateNumber', e.target.value.toUpperCase())}
            placeholder="ABC-1234"
            autoFocus
          />
          {hasAttemptedSubmit && !form.plateNumber.trim() && (
            <span className="field-error-text">Plate number is required</span>
          )}
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
          <button className="btn-primary" onClick={handleSubmit} disabled={isSaving}>
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
        <h2 style={{ textAlign: 'center', paddingRight: 0 }}>Deactivate Vehicle?</h2>
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
