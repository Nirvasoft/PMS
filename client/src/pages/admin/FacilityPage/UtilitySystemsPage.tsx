import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetUtilitySystemsQuery, useCreateUtilitySystemMutation,
  useUpdateUtilitySystemMutation, useDeleteUtilitySystemMutation,
} from '../../../store/api/facilityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Gauge, Plus, Loader2, XCircle, Inbox, Pencil, Trash2,
  Zap, Droplets, Flame, Snowflake, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SYSTEM_TYPES: Record<string, { label: string; icon: typeof Zap; color: string; unit: string }> = {
  electricity: { label: 'Electricity', icon: Zap, color: '#facc15', unit: 'kWh' },
  water: { label: 'Water', icon: Droplets, color: '#38bdf8', unit: 'm³' },
  gas: { label: 'Gas', icon: Flame, color: '#fb923c', unit: 'm³' },
  chilled_water: { label: 'Chilled Water', icon: Snowflake, color: '#818cf8', unit: 'RTh' },
};

export default function UtilitySystemsPage() {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSystem, setEditSystem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: systemsData, isLoading } = useGetUtilitySystemsQuery({
    propertyId: propertyFilter || undefined,
  });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const [deleteSystem, { isLoading: deleting }] = useDeleteUtilitySystemMutation();

  const systems = systemsData?.data || [];
  const properties = propertiesData?.data || [];

  const handleDelete = async (id: string) => {
    try {
      await deleteSystem(id).unwrap();
      toast.success('Utility system deleted');
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to delete');
    }
  };

  // Group systems by property
  const grouped = systems.reduce((acc: Record<string, any[]>, s: any) => {
    const pName = s.property?.name || 'Unknown';
    (acc[pName] = acc[pName] || []).push(s);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Gauge size={22} /></div>
          <div>
            <h1>Utility Systems</h1>
            <p>Building-level meters and utility systems</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setEditSystem(null); setShowModal(true); }}>
            <Plus size={16} /> Add System
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="maint-toolbar">
        <div className="filter-group">
          <select className="filter-select" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="toolbar-stats">
          <span className="stat-chip">
            <Activity size={12} />
            {systems.length} system{systems.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading utility systems...</div>
      ) : systems.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No utility systems found</p>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditSystem(null); setShowModal(true); }}>
            <Plus size={14} /> Add First System
          </button>
        </div>
      ) : (
        <div className="utility-systems-grid">
          {Object.entries(grouped).map(([propName, propSystems]) => (
            <div key={propName} className="utility-property-group">
              <div className="utility-group-header">{propName}</div>
              <div className="utility-cards">
                {(propSystems as any[]).map((sys: any) => {
                  const typeInfo = SYSTEM_TYPES[sys.systemType] || { label: sys.systemType, icon: Activity, color: '#94a3b8', unit: '' };
                  const Icon = typeInfo.icon;
                  return (
                    <div key={sys.id} className="utility-card">
                      <div className="utility-card-header">
                        <div className="utility-type-icon" style={{ background: `${typeInfo.color}18`, color: typeInfo.color }}>
                          <Icon size={18} />
                        </div>
                        <div className="utility-card-info">
                          <span className="utility-type-label">{typeInfo.label}</span>
                          {sys.meterId && <span className="utility-meter-id">Meter: {sys.meterId}</span>}
                        </div>
                        <div className="sla-row-actions">
                          <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditSystem(sys); setShowModal(true); }}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm btn-danger-ghost" title="Delete" onClick={() => setDeleteConfirm(sys.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="utility-card-body">
                        {sys.capacity != null && (
                          <div className="utility-stat">
                            <span className="utility-stat-label">Capacity</span>
                            <span className="utility-stat-value">
                              {Number(sys.capacity).toLocaleString()} {sys.unitOfMeasure || typeInfo.unit}
                            </span>
                          </div>
                        )}
                        {sys.unitOfMeasure && (
                          <div className="utility-stat">
                            <span className="utility-stat-label">Unit</span>
                            <span className="utility-stat-value">{sys.unitOfMeasure}</span>
                          </div>
                        )}
                        {sys.notes && (
                          <div className="utility-notes">{sys.notes}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <UtilitySystemModal
          system={editSystem}
          properties={properties}
          onClose={() => { setShowModal(false); setEditSystem(null); }}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="maint-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="maint-modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><Trash2 size={18} /></span> Delete Utility System</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}><XCircle size={20} /></button>
            </div>
            <div style={{ padding: '0 24px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete this utility system? This action cannot be undone.
            </div>
            <div className="maint-modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={deleting}
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => handleDelete(deleteConfirm)}
              >
                {deleting ? <Loader2 size={16} className="spin" /> : <><Trash2 size={16} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create / Edit Modal ──────────────────────
function UtilitySystemModal({ system, properties, onClose }: {
  system: any | null;
  properties: any[];
  onClose: () => void;
}) {
  const isEdit = !!system;
  const [createSystem, { isLoading: creating }] = useCreateUtilitySystemMutation();
  const [updateSystem, { isLoading: updating }] = useUpdateUtilitySystemMutation();
  const isLoading = creating || updating;

  const [form, setForm] = useState({
    propertyId: system?.propertyId || '',
    systemType: system?.systemType || 'electricity',
    meterId: system?.meterId || '',
    capacity: system?.capacity != null ? String(Number(system.capacity)) : '',
    unitOfMeasure: system?.unitOfMeasure || '',
    notes: system?.notes || '',
  });

  // Auto-set default unit based on system type
  const handleTypeChange = (type: string) => {
    const defaultUnit = SYSTEM_TYPES[type]?.unit || '';
    setForm(f => ({
      ...f,
      systemType: type,
      unitOfMeasure: f.unitOfMeasure || defaultUnit,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      propertyId: form.propertyId,
      systemType: form.systemType,
      meterId: form.meterId || null,
      capacity: form.capacity ? parseFloat(form.capacity) : null,
      unitOfMeasure: form.unitOfMeasure || null,
      notes: form.notes || null,
    };

    try {
      if (isEdit) {
        await updateSystem({ id: system.id, data: payload }).unwrap();
        toast.success('Utility system updated');
      } else {
        await createSystem(payload).unwrap();
        toast.success('Utility system created');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || `Failed to ${isEdit ? 'update' : 'create'}`);
    }
  };

  const selectedType = SYSTEM_TYPES[form.systemType];

  return (
    <div className="maint-modal-backdrop" onClick={onClose}>
      <div className="maint-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="maint-modal-header">
          <h2>
            <span className="modal-icon">{isEdit ? <Pencil size={18} /> : <Gauge size={18} />}</span>
            {isEdit ? 'Edit' : 'Add'} Utility System
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* System Type Selector */}
          <div className="maint-field" style={{ marginBottom: '16px' }}>
            <label>System Type <span style={{ color: '#f87171' }}>*</span></label>
            <div className="utility-type-selector">
              {Object.entries(SYSTEM_TYPES).map(([key, info]) => {
                const Icon = info.icon;
                return (
                  <button
                    key={key} type="button"
                    className={`utility-type-btn ${form.systemType === key ? 'active' : ''}`}
                    style={{ '--ut-color': info.color } as any}
                    onClick={() => handleTypeChange(key)}
                  >
                    <Icon size={18} />
                    <span>{info.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Property <span style={{ color: '#f87171' }}>*</span></label>
              <select required value={form.propertyId} disabled={isEdit}
                onChange={(e) => setForm(f => ({ ...f, propertyId: e.target.value }))}
              >
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {isEdit && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Property cannot be changed</span>}
            </div>
            <div className="maint-field">
              <label>Meter ID</label>
              <input type="text" value={form.meterId} onChange={(e) => setForm(f => ({ ...f, meterId: e.target.value }))}
                placeholder={`e.g. ${form.systemType === 'electricity' ? 'ELEC-B1-M01' : form.systemType === 'water' ? 'WTR-MAIN-01' : 'MTR-001'}`}
              />
            </div>
          </div>

          <div className="maint-form-grid">
            <div className="maint-field">
              <label>Capacity</label>
              <input type="number" step="0.001" min="0" value={form.capacity}
                onChange={(e) => setForm(f => ({ ...f, capacity: e.target.value }))}
                placeholder={`e.g. ${form.systemType === 'electricity' ? '500' : '100'}`}
              />
            </div>
            <div className="maint-field">
              <label>Unit of Measure</label>
              <input type="text" value={form.unitOfMeasure}
                onChange={(e) => setForm(f => ({ ...f, unitOfMeasure: e.target.value }))}
                placeholder={selectedType?.unit || 'kWh, m³, etc.'}
              />
            </div>
          </div>

          <div className="maint-form-grid cols-1">
            <div className="maint-field">
              <label>Notes</label>
              <textarea rows={2} value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes about this system..."
              />
            </div>
          </div>

          <div className="maint-modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="spin" /> : isEdit
                ? <><Pencil size={16} /> Update System</>
                : <><Plus size={16} /> Add System</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
