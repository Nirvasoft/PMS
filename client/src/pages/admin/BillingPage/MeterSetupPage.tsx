import { useState } from 'react';
import {
  useGetMeterSetupsQuery, useCreateMeterSetupMutation, useUpdateMeterSetupMutation, useDeleteMeterSetupMutation,
  type MeterSetup,
} from '../../../store/api/billingApi';
import { useGetPropertiesQuery, useGetFloorSetupsQuery } from '../../../store/api/propertiesApi';
import { Gauge, Plus, X, Pencil, Trash2 } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import './BillingPage.css';

const METER_TYPES = [
  { value: 'mepe', label: 'MEPE Meter' },
  { value: 'sub_meter', label: 'Sub Meter' },
  { value: 'ct_meter', label: 'CT Meter' },
  { value: 'water_meter', label: 'Water Meter' },
] as const;

export const CATEGORIES = [
  { value: 'lighting', label: 'Lighting' },
  { value: 'water', label: 'Water' },
  { value: 'aircon', label: 'AirCon' },
  { value: 'aircon_lighting', label: 'Aircon/Lighting' },
  { value: 'lighting_telenor', label: 'Lighting(Telenor)' },
] as const;

const USAGE_TYPES = [
  { value: 'tenant_used', label: 'TenantUsed' },
  { value: 'common_used', label: 'CommonUsed' },
  { value: 'office_used', label: 'OfficeUsed' },
] as const;

const labelFor = (opts: readonly { value: string; label: string }[], value: string) =>
  opts.find((o) => o.value === value)?.label || value;

export default function MeterSetupPage() {
  const { data: metersData, isFetching } = useGetMeterSetupsQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ limit: 100 });
  const [createMeterSetup, { isLoading: creating }] = useCreateMeterSetupMutation();
  const [updateMeterSetup, { isLoading: updating }] = useUpdateMeterSetupMutation();
  const [deleteMeterSetup] = useDeleteMeterSetupMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();

  const meters = metersData?.data || [];
  const properties = propertiesData?.data || [];

  const emptyForm = {
    propertyId: '', floorId: '', meterType: '', meterNo: '', mainMeterId: '', horsePower: '', unitLostPct: '',
    category: '', factor: '1', maintenanceFee: '', usageType: '',
  };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MeterSetup | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: floorsData } = useGetFloorSetupsQuery(
    form.propertyId ? { propertyId: form.propertyId } : undefined,
    { skip: !form.propertyId }
  );
  const floors = floorsData?.data || [];
  const mainMeterOptions = meters.filter(
    (m) => m.propertyId === form.propertyId && m.meterType !== 'sub_meter' && m.id !== editing?.id
  );

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (m: MeterSetup) => {
    setEditing(m);
    setForm({
      propertyId: m.propertyId,
      floorId: m.floorId ?? '',
      meterType: m.meterType,
      meterNo: m.meterNo,
      mainMeterId: m.mainMeterId ?? '',
      horsePower: m.horsePower ?? '',
      unitLostPct: m.unitLostPct ?? '',
      category: m.category,
      factor: m.factor ?? '',
      maintenanceFee: m.maintenanceFee ?? '',
      usageType: m.usageType ?? '',
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handlePropertyChange = (propertyId: string) => {
    setForm({ ...form, propertyId, floorId: '', mainMeterId: '' });
  };

  const handleMeterTypeChange = (meterType: string) => {
    setForm({ ...form, meterType, mainMeterId: meterType === 'sub_meter' ? form.mainMeterId : '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      propertyId: form.propertyId,
      floorId: form.floorId || undefined,
      meterType: form.meterType,
      meterNo: form.meterNo,
      mainMeterId: form.meterType === 'sub_meter' ? form.mainMeterId : undefined,
      horsePower: form.horsePower ? Number(form.horsePower) : undefined,
      unitLostPct: form.unitLostPct ? Number(form.unitLostPct) : undefined,
      category: form.category,
      factor: form.factor ? Number(form.factor) : undefined,
      maintenanceFee: form.maintenanceFee ? Number(form.maintenanceFee) : undefined,
      usageType: form.usageType || undefined,
    };
    try {
      if (editing) {
        await updateMeterSetup({ id: editing.id, data: payload }).unwrap();
      } else {
        await createMeterSetup(payload).unwrap();
      }
      closeForm();
    } catch (err: any) {
      alertDialog(err?.data?.message || `Failed to ${editing ? 'update' : 'create'} meter`);
    }
  };

  const handleDelete = async (m: MeterSetup) => {
    if (!(await confirmDialog(`Delete meter "${m.meterNo}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteMeterSetup(m.id).unwrap();
    } catch {
      alertDialog('Failed to delete meter');
    }
  };

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
            <Gauge size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Meter Setup</h1>
            <p>Register and configure electricity meters across your properties</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Meter
          </button>
        </div>
      </div>

      {/* Meter Setup Table */}
      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Floor Label</th>
              <th>Meter Type</th>
              <th>Meter No</th>
              <th>Category</th>
              <th className="text-right">Maintenance Fee</th>
              <th>Usage Type</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && meters.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">Loading…</td></tr>
            ) : meters.length === 0 ? (
              <tr><td colSpan={8} className="billing-empty">No meters set up yet</td></tr>
            ) : meters.map((m) => (
              <tr key={m.id}>
                <td><span className="cell-primary">{m.property.name}</span></td>
                <td>{m.floor?.floorLabel ?? '—'}</td>
                <td>{labelFor(METER_TYPES, m.meterType)}</td>
                <td><span className="cell-mono">{m.meterNo}</span></td>
                <td>{labelFor(CATEGORIES, m.category)}</td>
                <td className="text-right">{m.maintenanceFee ? Number(m.maintenanceFee).toFixed(2) : '—'}</td>
                <td>{m.usageType ? labelFor(USAGE_TYPES, m.usageType) : '—'}</td>
                <td className="text-center">
                  <button className="btn-icon" title="Edit" onClick={() => openEdit(m)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn-danger" title="Delete" onClick={() => handleDelete(m)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Gauge size={18} /> {editing ? 'Edit Meter' : 'New Meter'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Property <span className="req">*</span></label>
                    <select required value={form.propertyId} onChange={(e) => handlePropertyChange(e.target.value)}>
                      <option value="">Select property…</option>
                      {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Floor</label>
                    <select value={form.floorId} disabled={!form.propertyId}
                      onChange={(e) => setForm({ ...form, floorId: e.target.value })}>
                      <option value="">{form.propertyId ? 'Select floor…' : 'Select property first'}</option>
                      {floors.map((f) => <option key={f.id} value={f.id}>{f.floorLabel}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Meter Type <span className="req">*</span></label>
                    <select required value={form.meterType} onChange={(e) => handleMeterTypeChange(e.target.value)}>
                      <option value="">Select type…</option>
                      {METER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {form.meterType === 'sub_meter' && (
                    <div className="inv-field">
                      <label>Main Meter <span className="req">*</span></label>
                      <select required value={form.mainMeterId} disabled={!form.propertyId}
                        onChange={(e) => setForm({ ...form, mainMeterId: e.target.value })}>
                        <option value="">{form.propertyId ? 'Select main meter…' : 'Select property first'}</option>
                        {mainMeterOptions.map((m) => (
                          <option key={m.id} value={m.id}>{m.meterNo}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="inv-field">
                    <label>Meter No <span className="req">*</span></label>
                    <input required placeholder="e.g. MT-00123" value={form.meterNo}
                      onChange={(e) => setForm({ ...form, meterNo: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Category <span className="req">*</span></label>
                    <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="">Select category…</option>
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Horse Power</label>
                    <input type="number" className="no-spinner" placeholder="e.g. 5" value={form.horsePower}
                      onChange={(e) => setForm({ ...form, horsePower: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Unit Lost (%)</label>
                    <input type="number" className="no-spinner" min={0} max={100} step="0.01" placeholder="e.g. 2.5" value={form.unitLostPct}
                      onChange={(e) => setForm({ ...form, unitLostPct: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Factor</label>
                    <input type="number" className="no-spinner" placeholder="e.g. 1" value={form.factor}
                      onChange={(e) => setForm({ ...form, factor: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Maintenance Fee</label>
                    <input type="number" className="no-spinner" step="0.01" placeholder="e.g. 25.00" value={form.maintenanceFee}
                      onChange={(e) => setForm({ ...form, maintenanceFee: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>Meter Usage Type</label>
                    <select value={form.usageType} onChange={(e) => setForm({ ...form, usageType: e.target.value })}>
                      <option value="">— Select —</option>
                      {USAGE_TYPES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                  {creating || updating ? 'Saving…' : editing ? 'Save Changes' : 'Create Meter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
