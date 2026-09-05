import '../MaintenancePage/MaintenancePage.css';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetFacilityAssetsQuery, useCreateFacilityAssetMutation, useGetFacilityStatsQuery,
  useGetServiceDueAssetsQuery, useGetWarrantyExpiringAssetsQuery,
} from '../../../store/api/facilityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Box, Plus, Search, Loader2, XCircle, Wrench, AlertTriangle,
  CheckCircle2, ShieldAlert, Clock, Settings2, Shield, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ASSET_TYPES: Record<string, { label: string; icon: string }> = {
  hvac: { label: 'HVAC', icon: '❄️' },
  elevator: { label: 'Elevator', icon: '🛗' },
  generator: { label: 'Generator', icon: '⚡' },
  fire_system: { label: 'Fire System', icon: '🧯' },
  water_pump: { label: 'Water Pump', icon: '💧' },
  cctv: { label: 'CCTV', icon: '📹' },
  access_control: { label: 'Access Control', icon: '🔑' },
  lighting: { label: 'Lighting', icon: '💡' },
  other: { label: 'Other', icon: '🔧' },
};

const STATUS_MAP: Record<string, string> = {
  operational: 'completed',
  under_maintenance: 'in_progress',
  decommissioned: 'closed',
  fault: 'cancelled',
};

export default function AssetRegistryPage() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState({
    propertyId: '', assetType: '', status: '', search: '',
    page: 1, limit: 20,
  });
  const selectedProperty = useSelectedPropertyFilter();

  // Reset pagination whenever the sidebar's Active Property changes.
  useEffect(() => { setFilters(f => ({ ...f, page: 1 })); }, [selectedProperty]);

  const { data: assetsData, isLoading } = useGetFacilityAssetsQuery({
    ...filters,
    propertyId: selectedProperty || undefined,
    assetType: filters.assetType || undefined,
    status: filters.status || undefined,
    search: filters.search || undefined,
  });
  const { data: statsData } = useGetFacilityStatsQuery({
    propertyId: selectedProperty || undefined,
  });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });

  const assets = assetsData?.data || [];
  const meta = assetsData?.meta;
  const properties = propertiesData?.data || [];
  const stats = statsData?.data || {};

  const [showServiceDue, setShowServiceDue] = useState(false);
  const [showWarrantyExpiring, setShowWarrantyExpiring] = useState(false);

  const { data: serviceDueData } = useGetServiceDueAssetsQuery(
    { propertyId: selectedProperty || undefined },
    { skip: !showServiceDue },
  );
  const { data: warrantyExpData } = useGetWarrantyExpiringAssetsQuery(
    { propertyId: selectedProperty || undefined },
    { skip: !showWarrantyExpiring },
  );
  const serviceDueAssets = serviceDueData?.data || [];
  const warrantyExpAssets = warrantyExpData?.data || [];

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Box size={22} /></div>
          <div>
            <h1>Asset Registry</h1>
            <p>Track and manage facility assets and equipment</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Register Asset
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Box size={18} /></div>
          <span className="msc-value">{stats.total || 0}</span>
          <span className="msc-label">Total Assets</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><CheckCircle2 size={18} /></div>
          <span className="msc-value">{stats.operational || 0}</span>
          <span className="msc-label">Operational</span>
        </div>
        <div className="maint-stat-card red">
          <div className="msc-icon"><AlertTriangle size={18} /></div>
          <span className="msc-value">{stats.fault || 0}</span>
          <span className="msc-label">Fault</span>
        </div>
        <div className="maint-stat-card amber" style={{ cursor: 'pointer' }} onClick={() => setShowServiceDue(p => !p)}>
          <div className="msc-icon"><Wrench size={18} /></div>
          <span className="msc-value">{stats.serviceDue || 0}</span>
          <span className="msc-label">Service Due {showServiceDue ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        </div>
        <div className="maint-stat-card purple" style={{ cursor: 'pointer' }} onClick={() => setShowWarrantyExpiring(p => !p)}>
          <div className="msc-icon"><ShieldAlert size={18} /></div>
          <span className="msc-value">{stats.warrantyExpiring || 0}</span>
          <span className="msc-label">Warranty Expiring {showWarrantyExpiring ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        </div>
      </div>

      {/* Service Due Alerts */}
      {showServiceDue && (
        <div className="asset-alert-widget">
          <div className="asset-alert-header amber">
            <Wrench size={14} /> Assets Needing Service
          </div>
          {serviceDueAssets.length === 0 ? (
            <div className="asset-alert-empty">No assets currently due for service</div>
          ) : (
            <div className="asset-alert-list">
              {serviceDueAssets.map((a: any) => {
                const days = a.nextServiceDue ? Math.ceil((new Date(a.nextServiceDue).getTime() - Date.now()) / 86400000) : 0;
                return (
                  <div key={a.id} className="asset-alert-item" onClick={() => navigate(`/admin/facility/assets/${a.id}`)}>
                    <span style={{ fontSize: '16px' }}>{ASSET_TYPES[a.assetType]?.icon || '🔧'}</span>
                    <div className="asset-alert-info">
                      <span className="asset-alert-name">{a.name}</span>
                      <span className="asset-alert-sub">{a.property?.name} · {a.assetNumber}</span>
                    </div>
                    <span className={`sla-chip ${days < 0 ? 'breached' : 'at_risk'}`}>
                      <Clock size={10} />
                      {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Warranty Expiring Alerts */}
      {showWarrantyExpiring && (
        <div className="asset-alert-widget">
          <div className="asset-alert-header purple">
            <Shield size={14} /> Warranties Expiring Soon
          </div>
          {warrantyExpAssets.length === 0 ? (
            <div className="asset-alert-empty">No warranties expiring soon</div>
          ) : (
            <div className="asset-alert-list">
              {warrantyExpAssets.map((a: any) => {
                const days = a.warrantyExpiry ? Math.ceil((new Date(a.warrantyExpiry).getTime() - Date.now()) / 86400000) : 0;
                return (
                  <div key={a.id} className="asset-alert-item" onClick={() => navigate(`/admin/facility/assets/${a.id}`)}>
                    <span style={{ fontSize: '16px' }}>{ASSET_TYPES[a.assetType]?.icon || '🔧'}</span>
                    <div className="asset-alert-info">
                      <span className="asset-alert-name">{a.name}</span>
                      <span className="asset-alert-sub">{a.property?.name} · {a.assetNumber}</span>
                    </div>
                    <span className={`sla-chip ${days < 0 ? 'breached' : days <= 30 ? 'at_risk' : 'on_track'}`}>
                      {days < 0 ? 'Expired' : `${days}d left`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="maint-filters">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search assets..." value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
        </div>
        {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select className="filter-select" value={selectedProperty} disabled>
          {selectedProperty && (
            <option value={selectedProperty}>{properties.find((p: any) => p.id === selectedProperty)?.name || ''}</option>
          )}
        </select>
        <select className="filter-select" value={filters.assetType} onChange={(e) => setFilters(f => ({ ...f, assetType: e.target.value, page: 1 }))}>
          <option value="">All Types</option>
          {Object.entries(ASSET_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select className="filter-select" value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">All Statuses</option>
          <option value="operational">Operational</option>
          <option value="under_maintenance">Under Maintenance</option>
          <option value="fault">Fault</option>
          <option value="decommissioned">Decommissioned</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading assets...</div>
      ) : assets.length === 0 ? (
        <div className="maint-empty">
          <div className="empty-icon"><Box size={28} /></div>
          <p>No assets registered</p>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Register First Asset
          </button>
        </div>
      ) : (
        <>
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Asset #</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Next Service</th>
                  <th>Warranty</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a: any) => (
                  <tr key={a.id} onClick={() => navigate(`/admin/facility/assets/${a.id}`)}>
                    <td><span className="cell-mono">{a.assetNumber}</span></td>
                    <td>
                      <div className="ticket-title-cell">
                        <span style={{ fontSize: '16px', marginRight: '4px' }}>
                          {ASSET_TYPES[a.assetType]?.icon || '🔧'}
                        </span>
                        <span className="title-text">{a.name}</span>
                      </div>
                    </td>
                    <td><span className="maint-status open">{ASSET_TYPES[a.assetType]?.label || a.assetType}</span></td>
                    <td><span className="cell-secondary">{a.property?.name}</span></td>
                    <td><span className="cell-secondary">{a.location || '—'}</span></td>
                    <td>
                      <span className={`maint-status ${STATUS_MAP[a.status] || 'open'}`}>
                        {a.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {a.nextServiceDue ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="cell-secondary">{new Date(a.nextServiceDue).toLocaleDateString()}</span>
                          {a.daysUntilService !== null && (
                            <span className={`sla-chip ${a.daysUntilService < 0 ? 'breached' : a.daysUntilService <= 7 ? 'at_risk' : 'on_track'}`}>
                              <Clock size={10} />
                              {a.daysUntilService < 0
                                ? `${Math.abs(a.daysUntilService)}d overdue`
                                : `${a.daysUntilService}d`}
                            </span>
                          )}
                        </div>
                      ) : <span className="cell-secondary">—</span>}
                    </td>
                    <td>
                      {a.warrantyExpiry ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="cell-secondary">{new Date(a.warrantyExpiry).toLocaleDateString()}</span>
                          {a.daysUntilWarrantyExpiry !== null && (
                            <span className={`sla-chip ${a.daysUntilWarrantyExpiry < 0 ? 'breached' : a.daysUntilWarrantyExpiry <= 30 ? 'at_risk' : 'on_track'}`}>
                              {a.daysUntilWarrantyExpiry < 0
                                ? 'Expired'
                                : `${a.daysUntilWarrantyExpiry}d left`}
                            </span>
                          )}
                        </div>
                      ) : <span className="cell-secondary">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="maint-pagination">
              <span className="page-info">Page {meta.page} of {meta.totalPages} ({meta.total} assets)</span>
              <div className="page-btns">
                <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Previous</button>
                <button disabled={filters.page >= meta.totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateAssetModal
          properties={properties}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

// ── Create Asset Modal ─────────────────────

function CreateAssetModal({ properties, onClose }: {
  properties: any[]; onClose: () => void;
}) {
  const [createAsset, { isLoading }] = useCreateFacilityAssetMutation();
  const [form, setForm] = useState({
    propertyId: '', assetNumber: '', name: '', assetType: 'hvac',
    make: '', model: '', serialNumber: '',
    installationDate: '', warrantyExpiry: '', expectedLifespanYears: '',
    location: '', floor: '',
    vendorName: '', vendorContact: '', serviceContractNo: '', serviceContractExpiry: '',
    purchaseCost: '', notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAsset({
        propertyId: form.propertyId,
        assetNumber: form.assetNumber,
        name: form.name,
        assetType: form.assetType,
        make: form.make || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        installationDate: form.installationDate || undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
        expectedLifespanYears: form.expectedLifespanYears ? parseInt(form.expectedLifespanYears) : undefined,
        location: form.location || undefined,
        floor: form.floor || undefined,
        vendorName: form.vendorName || undefined,
        vendorContact: form.vendorContact || undefined,
        serviceContractNo: form.serviceContractNo || undefined,
        serviceContractExpiry: form.serviceContractExpiry || undefined,
        purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : undefined,
        notes: form.notes || undefined,
      }).unwrap();
      toast.success('Asset registered');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="maint-modal-backdrop">
      <div className="maint-modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon"><Box size={18} /></span>
            Register Asset
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 24px 24px' }}>
          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Property <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.propertyId} onChange={(e) => setForm(f => ({ ...f, propertyId: e.target.value }))}>
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="maint-field">
              <label>Asset Type <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.assetType} onChange={(e) => setForm(f => ({ ...f, assetType: e.target.value }))}>
                {Object.entries(ASSET_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Asset Number <span style={{ color: '#f87171' }}>*</span></label>
              <input type="text" required value={form.assetNumber} onChange={(e) => setForm(f => ({ ...f, assetNumber: e.target.value }))} placeholder="e.g. HVAC-B1-01" />
            </div>
            <div className="maint-field">
              <label>Name <span style={{ color: '#f87171' }}>*</span></label>
              <input type="text" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Air Handling Unit — Basement 1" />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Make / Brand</label>
              <input type="text" value={form.make} onChange={(e) => setForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Carrier" />
            </div>
            <div className="maint-field">
              <label>Model</label>
              <input type="text" value={form.model} onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. AHU-30XT" />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Serial Number</label>
              <input type="text" value={form.serialNumber} onChange={(e) => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Location</label>
              <input type="text" value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Basement Plant Room" />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Floor</label>
              <input type="text" value={form.floor} onChange={(e) => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="e.g. B1" />
            </div>
            <div className="maint-field">
              <label>Expected Lifespan (years)</label>
              <input type="number" min="1" value={form.expectedLifespanYears} onChange={(e) => setForm(f => ({ ...f, expectedLifespanYears: e.target.value }))} />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Installation Date</label>
              <input type="date" value={form.installationDate} onChange={(e) => setForm(f => ({ ...f, installationDate: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Warranty Expiry</label>
              <input type="date" value={form.warrantyExpiry} onChange={(e) => setForm(f => ({ ...f, warrantyExpiry: e.target.value }))} />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Vendor Name</label>
              <input type="text" value={form.vendorName} onChange={(e) => setForm(f => ({ ...f, vendorName: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Vendor Contact</label>
              <input type="text" value={form.vendorContact} onChange={(e) => setForm(f => ({ ...f, vendorContact: e.target.value }))} />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Service Contract #</label>
              <input type="text" value={form.serviceContractNo} onChange={(e) => setForm(f => ({ ...f, serviceContractNo: e.target.value }))} />
            </div>
            <div className="maint-field">
              <label>Service Contract Expiry</label>
              <input type="date" value={form.serviceContractExpiry} onChange={(e) => setForm(f => ({ ...f, serviceContractExpiry: e.target.value }))} />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Purchase Cost</label>
              <input type="number" min="0" step="0.01" value={form.purchaseCost} onChange={(e) => setForm(f => ({ ...f, purchaseCost: e.target.value }))} />
            </div>
            <div className="maint-field" />
          </div>

          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Register Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
