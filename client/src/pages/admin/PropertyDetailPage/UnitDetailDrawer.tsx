import { useState, useRef, useCallback } from 'react';
import { useAppDispatch } from '../../../store';
import { closeDrawer } from '../../../store/slices/unitsSlice';
import {
  useGetUnitQuery, useUpdateUnitMutation, useUpdateUnitStatusMutation,
  useAddMeterMutation, useDeleteMeterMutation, useUpdateMeterMutation,
  useSetAmenitiesMutation, useUploadFloorPlanMutation, useGetUnitTypesQuery,
  useGetUnitChargesQuery, useAddUnitChargeMutation, useUpdateUnitChargeMutation, useDeleteUnitChargeMutation,
} from '../../../store/api/unitsApi';
import { useGetMeterSetupsQuery, useGetChargeTypesQuery } from '../../../store/api/billingApi';
import { useGetFloorSetupsQuery } from '../../../store/api/propertiesApi';
import { CATEGORIES as METER_CATEGORIES, METER_TYPES } from '../BillingPage/MeterSetupPage';
import { ZONE_OPTIONS } from './zoneOptions';
import {
  X, Zap, Droplets, Wind, Star, ChevronRight, Settings2,
  Activity, Clock, Thermometer, Plus, Trash2, Pencil, Check,
  Upload, FileImage, ExternalLink, FileText, CalendarDays, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './UnitDetailDrawer.css';

const STATUS_COLORS: Record<string, string> = {
  available: '#2ecc71', occupied: '#2196F3', reserved: '#FF9800',
  maintenance: '#F44336', not_for_rent: '#9E9E9E',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  available:    ['reserved', 'maintenance', 'not_for_rent'],
  reserved:     ['available', 'occupied'],
  occupied:     ['available', 'maintenance'],
  maintenance:  ['available', 'not_for_rent'],
  not_for_rent: ['available', 'maintenance'],
};

const METER_ICONS: Record<string, JSX.Element> = {
  electricity: <Zap size={14} />,
  water:       <Droplets size={14} />,
  gas:         <Wind size={14} />,
  chilled_water: <Thermometer size={14} />,
};

const AMENITY_OPTIONS = [
  'balcony', 'bathtub', 'built_in_wardrobe', 'storage_room', 'private_garden',
  'study_room', 'maid_room', 'utility_room', 'jacuzzi', 'private_pool',
];

const SQM_TO_SQFT = 10.7639;
const DIRECTION_OPTIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'corner'];
const FURNISHING_OPTIONS = ['unfurnished', 'partially_furnished', 'fully_furnished'];
const OWNERSHIP_OPTIONS = ['leasehold', 'freehold', 'strata', 'company', 'individual'];

type DrawerTab = 'info' | 'meters' | 'charges' | 'floor_plan' | 'leases' | 'history';

export function UnitDetailDrawer({ propertyId, unitId }: { propertyId: string; unitId: string }) {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<DrawerTab>('info');
  const [historyFilter, setHistoryFilter] = useState<'status' | 'meter'>('status');
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');
  const [historyMeterCategory, setHistoryMeterCategory] = useState('all');
  const [editing, setEditing] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [estimatedCompletion, setEstimatedCompletion] = useState('');
  const [addingMeter, setAddingMeter] = useState(false);
  const [meterForm, setMeterForm] = useState({
    meterType: '', meterSerialNo: '', meterProvider: '',
    isSmartMeter: false, location: '', installedAt: '', smartMeterId: '',
  });
  const [meterFormErrors, setMeterFormErrors] = useState<Record<string, string>>({});
  const [editingMeterId, setEditingMeterId] = useState<string | null>(null);
  const [meterEditForm, setMeterEditForm] = useState<Record<string, any>>({});
  const [meterEditFormErrors, setMeterEditFormErrors] = useState<Record<string, string>>({});
  const [readingMeterId, setReadingMeterId] = useState<string | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingStartDate, setReadingStartDate] = useState('');
  const [readingEndDate, setReadingEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingCharge, setAddingCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({ chargeTypeId: '', amount: '' });
  const [savingCharge, setSavingCharge] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [chargeEditForm, setChargeEditForm] = useState({ chargeTypeId: '', amount: '' });
  const [savingChargeEdit, setSavingChargeEdit] = useState(false);

  const { data, isLoading, isError, error } = useGetUnitQuery({ propertyId, unitId });
  const unit = data?.data;

  const [updateUnit, { isLoading: saving }] = useUpdateUnitMutation();
  const [updateStatus] = useUpdateUnitStatusMutation();
  const [addMeter] = useAddMeterMutation();
  const [deleteMeter] = useDeleteMeterMutation();
  const [updateMeter] = useUpdateMeterMutation();
  const [setAmenities] = useSetAmenitiesMutation();
  const [uploadFloorPlan, { isLoading: uploading }] = useUploadFloorPlanMutation();
  const { data: typesData } = useGetUnitTypesQuery();
  const unitTypes = typesData?.data || [];

  const { data: meterSetupsData } = useGetMeterSetupsQuery({ propertyId });
  const floorMeterOptions = (meterSetupsData?.data || []).filter(
    (m) => m.category === meterForm.meterType && m.floor?.floorNumber === unit?.floorNumber
  );
  const floorMeterEditOptions = (meterSetupsData?.data || []).filter(
    (m) => m.category === meterEditForm.meterCategory && m.floor?.floorNumber === unit?.floorNumber
  );

  const { data: floorSetupsData } = useGetFloorSetupsQuery({ propertyId });
  const floorSetups = [...(floorSetupsData?.data || [])].sort((a, b) => a.floorNumber - b.floorNumber);

  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const chargeTypes = (chargeTypesData?.data || []).filter((ct) => ct.isActive);

  const { data: unitChargesData, refetch: refetchCharges } = useGetUnitChargesQuery({ propertyId, unitId });
  const unitCharges = unitChargesData?.data || [];
  const [addUnitCharge] = useAddUnitChargeMutation();
  const [deleteUnitCharge] = useDeleteUnitChargeMutation();

  // ── Edit form state ─────────────────────────
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  const startEditing = useCallback(() => {
    if (!unit) return;
    setEditForm({
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
      zone: unit.zone ?? '',
      floorNumber: unit.floorNumber ?? '',
      floorLabel: unit.floorLabel ?? '',
      areaSqft: unit.areaSqft ?? '',
      areaSqm: unit.areaSqm ?? '',
      bedroomCount: unit.bedroomCount,
      bathroomCount: unit.bathroomCount,
      direction: unit.direction ?? '',
      furnishing: unit.furnishing,
      ownershipType: unit.ownershipType,
      ownerName: unit.ownerName ?? '',
      ownerContact: unit.ownerContact ?? '',
      purchaseDate: unit.purchaseDate ? unit.purchaseDate.split('T')[0] : '',
      purchasePrice: unit.purchasePrice ?? '',
      currentMarketValue: unit.currentMarketValue ?? '',
      rentalPeriod: unit.rentalPeriod ?? '',
      rentalPeriodUnit: unit.rentalPeriodUnit ?? 'month',
      calculationOn: unit.calculationOn ?? 'fixed',
      rate: unit.rate ?? '',
      description: unit.description ?? '',
      notes: unit.notes ?? '',
      commonBillCalculate: unit.commonBillCalculate ?? false,
    });
    setEditing(true);
  }, [unit]);

  const cancelEditing = () => { setEditing(false); setEditForm({}); };

  const handleSave = async () => {
    try {
      const payload: Record<string, any> = {};
      // Only send changed fields
      if (editForm.unitNumber !== unit!.unitNumber) payload.unitNumber = editForm.unitNumber;
      if (editForm.unitType !== unit!.unitType) payload.unitType = editForm.unitType;
      if (editForm.zone !== (unit!.zone ?? '')) payload.zone = editForm.zone || null;
      if (editForm.floorNumber !== '' && Number(editForm.floorNumber) !== unit!.floorNumber) payload.floorNumber = Number(editForm.floorNumber);
      if (editForm.floorLabel !== (unit!.floorLabel ?? '')) payload.floorLabel = editForm.floorLabel || null;
      if (editForm.areaSqft !== '' && Number(editForm.areaSqft) !== unit!.areaSqft) payload.areaSqft = Number(editForm.areaSqft);
      if (editForm.areaSqm !== '' && Number(editForm.areaSqm) !== unit!.areaSqm) payload.areaSqm = Number(editForm.areaSqm);
      if (editForm.bedroomCount !== unit!.bedroomCount) payload.bedroomCount = Number(editForm.bedroomCount);
      if (editForm.bathroomCount !== unit!.bathroomCount) payload.bathroomCount = Number(editForm.bathroomCount);
      if (editForm.direction !== (unit!.direction ?? '')) payload.direction = editForm.direction || null;
      if (editForm.furnishing !== unit!.furnishing) payload.furnishing = editForm.furnishing;
      if (editForm.ownershipType !== unit!.ownershipType) payload.ownershipType = editForm.ownershipType;
      if (editForm.ownerName !== (unit!.ownerName ?? '')) payload.ownerName = editForm.ownerName || null;
      if (editForm.ownerContact !== (unit!.ownerContact ?? '')) payload.ownerContact = editForm.ownerContact || null;
      const origPurchaseDate = unit!.purchaseDate ? unit!.purchaseDate.split('T')[0] : '';
      if (editForm.purchaseDate !== origPurchaseDate) payload.purchaseDate = editForm.purchaseDate || null;
      if (editForm.purchasePrice !== '' && Number(editForm.purchasePrice) !== unit!.purchasePrice) payload.purchasePrice = Number(editForm.purchasePrice) || null;
      if (editForm.currentMarketValue !== '' && Number(editForm.currentMarketValue) !== unit!.currentMarketValue) payload.currentMarketValue = Number(editForm.currentMarketValue) || null;
      if (editForm.rentalPeriod !== '' && Number(editForm.rentalPeriod) !== unit!.rentalPeriod) payload.rentalPeriod = Number(editForm.rentalPeriod);
      if (editForm.rentalPeriodUnit !== (unit!.rentalPeriodUnit ?? 'month')) payload.rentalPeriodUnit = editForm.rentalPeriodUnit;
      if (editForm.calculationOn !== (unit!.calculationOn ?? 'fixed')) payload.calculationOn = editForm.calculationOn;
      if (editForm.rate !== '' && Number(editForm.rate) !== unit!.rate) payload.rate = Number(editForm.rate) || null;
      if (editForm.description !== (unit!.description ?? '')) payload.description = editForm.description || null;
      if (editForm.notes !== (unit!.notes ?? '')) payload.notes = editForm.notes || null;
      if (editForm.commonBillCalculate !== (unit!.commonBillCalculate ?? false)) payload.commonBillCalculate = editForm.commonBillCalculate;

      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }

      await updateUnit({ propertyId, unitId, data: payload }).unwrap();
      toast.success('Unit updated');
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to update');
    }
  };

  const ef = (k: string, v: any) => setEditForm((f) => ({ ...f, [k]: v }));
  const efAreaSqft = (v: string) => setEditForm((f) => ({
    ...f, areaSqft: v, areaSqm: v ? (Number(v) / SQM_TO_SQFT).toFixed(2) : '',
  }));
  const efAreaSqm = (v: string) => setEditForm((f) => ({
    ...f, areaSqm: v, areaSqft: v ? (Number(v) * SQM_TO_SQFT).toFixed(2) : '',
  }));

  // ── Handlers ────────────────────────────────
  const handleStatusChange = async () => {
    try {
      // Append estimated completion to reason if set
      let reason = statusReason || undefined;
      if (newStatus === 'maintenance' && estimatedCompletion) {
        reason = `${statusReason}\n[Est. completion: ${estimatedCompletion}]`.trim();
      }
      await updateStatus({ propertyId, unitId, status: newStatus, reason }).unwrap();
      toast.success('Status updated');
      setStatusModal(false);
      setStatusReason('');
      setEstimatedCompletion('');
    } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed to update status'); }
  };

  const handleAddMeter = async () => {
    // Validate required fields (Provider and Location are optional)
    const errs: Record<string, string> = {};
    if (!meterForm.meterType)      errs.meterType     = 'Category is required';
    if (!meterForm.meterSerialNo)  errs.meterSerialNo = 'Meter No is required';
    if (!meterForm.installedAt)    errs.installedAt   = 'Install Date is required';
    if (meterForm.isSmartMeter && !meterForm.smartMeterId) errs.smartMeterId = 'Smart Meter ID is required';

    if (Object.keys(errs).length > 0) {
      setMeterFormErrors(errs);
      return;
    }
    setMeterFormErrors({});

    try {
      await addMeter({ propertyId, unitId, data: {
        ...meterForm,
        location: meterForm.location || undefined,
        installedAt: meterForm.installedAt ? new Date(meterForm.installedAt).toISOString() : undefined,
        smartMeterId: meterForm.smartMeterId || undefined,
      }}).unwrap();
      toast.success('Meter added');
      setAddingMeter(false);
      setMeterForm({ meterType: '', meterSerialNo: '', meterProvider: '', isSmartMeter: false, location: '', installedAt: '', smartMeterId: '' });
    } catch (e: any) {
      const code = e?.data?.errors?.[0]?.code;
      const msg  = e?.data?.errors?.[0]?.message || 'Failed';
      if (code === 'METER_SERIAL_EXISTS') setMeterFormErrors((p) => ({ ...p, meterSerialNo: msg }));
      else toast.error(msg);
    }
  };

  const handleMeterEdit = (m: any) => {
    setEditingMeterId(m.id);
    setMeterEditFormErrors({});
    setMeterEditForm({
      meterCategory: m.meterType,
      meterSerialNo: m.meterSerialNo,
      meterProvider: m.meterProvider || '',
      location: m.location || '',
      isSmartMeter: m.isSmartMeter,
      smartMeterId: m.smartMeterId || '',
    });
  };

  const handleMeterEditSave = async () => {
    if (!editingMeterId) return;
    const errs: Record<string, string> = {};
    if (!meterEditForm.meterCategory) errs.meterCategory = 'Category is required';
    if (!meterEditForm.meterSerialNo) errs.meterSerialNo = 'Meter No is required';
    if (meterEditForm.isSmartMeter && !meterEditForm.smartMeterId) errs.smartMeterId = 'Smart Meter ID is required';
    if (Object.keys(errs).length > 0) { setMeterEditFormErrors(errs); return; }
    setMeterEditFormErrors({});
    try {
      await updateMeter({ propertyId, unitId, meterId: editingMeterId, data: {
        meterType: meterEditForm.meterCategory,
        meterSerialNo: meterEditForm.meterSerialNo,
        meterProvider: meterEditForm.meterProvider || null,
        location: meterEditForm.location || null,
        isSmartMeter: meterEditForm.isSmartMeter,
        smartMeterId: meterEditForm.smartMeterId || null,
      }}).unwrap();
      toast.success('Meter updated');
      setEditingMeterId(null);
    } catch (e: any) {
      const code = e?.data?.errors?.[0]?.code;
      const msg  = e?.data?.errors?.[0]?.message || 'Failed to update meter';
      if (code === 'METER_SERIAL_EXISTS') setMeterEditFormErrors((p) => ({ ...p, meterSerialNo: msg }));
      else toast.error(msg);
    }
  };

  const handleRecordReading = async () => {
    if (!readingMeterId || !readingValue) return;
    try {
      await updateMeter({ propertyId, unitId, meterId: readingMeterId, data: {
        lastReading: Number(readingValue),
        lastReadingStartDate: readingStartDate ? new Date(readingStartDate).toISOString() : null,
        lastReadingDate: readingEndDate ? new Date(readingEndDate).toISOString() : undefined,
      }}).unwrap();
      toast.success('Reading recorded');
      setReadingMeterId(null);
      setReadingValue('');
      setReadingStartDate('');
    } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed'); }
  };

  const handleToggleAmenity = async (amenity: string) => {
    if (!unit) return;
    const current = unit.amenities.map((a) => a.amenity);
    const next = current.includes(amenity)
      ? current.filter((a) => a !== amenity)
      : [...current, amenity];
    try {
      await setAmenities({ propertyId, unitId, amenities: next }).unwrap();
    } catch { toast.error('Failed to update amenities'); }
  };

  // ── Floor plan upload ───────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFloorPlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Max file size is 10MB'); return; }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) { toast.error('Only PDF, PNG, JPEG allowed'); return; }
    try {
      await uploadFloorPlan({ propertyId, unitId, file }).unwrap();
      toast.success('Floor plan uploaded');
    } catch { toast.error('Upload failed'); }
    // Reset input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Unit Charges ─────────────────────────────
  const [updateUnitCharge] = useUpdateUnitChargeMutation();

  const handleAddCharge = async () => {
    if (!chargeForm.chargeTypeId || !chargeForm.amount) return;
    setSavingCharge(true);
    try {
      await addUnitCharge({ propertyId, unitId, data: { chargeTypeId: chargeForm.chargeTypeId, amount: Number(chargeForm.amount) } }).unwrap();
      toast.success('Charge added');
      setChargeForm({ chargeTypeId: '', amount: '' });
      setAddingCharge(false);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to add charge');
    } finally { setSavingCharge(false); }
  };

  const handleChargeEdit = (c: { id: string; amount: string; chargeType: { id: string } }) => {
    setEditingChargeId(c.id);
    setChargeEditForm({ chargeTypeId: c.chargeType.id, amount: c.amount });
    setAddingCharge(false);
  };

  const handleChargeEditSave = async () => {
    if (!editingChargeId || !chargeEditForm.chargeTypeId || !chargeEditForm.amount) return;
    setSavingChargeEdit(true);
    try {
      await updateUnitCharge({ propertyId, unitId, chargeId: editingChargeId, data: { chargeTypeId: chargeEditForm.chargeTypeId, amount: Number(chargeEditForm.amount) } }).unwrap();
      toast.success('Charge updated');
      setEditingChargeId(null);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to update charge');
    } finally { setSavingChargeEdit(false); }
  };

  const handleDeleteCharge = async (chargeId: string) => {
    try {
      await deleteUnitCharge({ propertyId, unitId, chargeId }).unwrap();
      toast.success('Charge removed');
    } catch { toast.error('Failed to remove charge'); }
  };

  if (isLoading) return (
    <div className="unit-drawer loading">
      <div className="drawer-spinner" />
    </div>
  );

  if (isError || !unit) {
    const errMsg = error && 'data' in error
      ? (error.data as any)?.message || 'Unit not found'
      : 'Failed to load unit details';
    return (
      <>
        <div className="drawer-overlay" />
        <div className="unit-drawer">
          <div className="drawer-header">
            <div><div className="drawer-unit-no">Error</div></div>
            <div className="drawer-header-right">
              <button className="drawer-close" onClick={() => dispatch(closeDrawer())}><X size={18} /></button>
            </div>
          </div>
          <div className="drawer-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '3rem 1.5rem', textAlign: 'center' }}>
            <AlertCircle size={36} style={{ color: '#ef4444', opacity: 0.7 }} />
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{errMsg}</p>
            <button className="btn-ghost" onClick={() => dispatch(closeDrawer())} style={{ marginTop: 8 }}>Close</button>
          </div>
        </div>
      </>
    );
  }

  const transitions = STATUS_TRANSITIONS[unit.status] || [];
  const statusStyle = STATUS_COLORS[unit.status] || '#95a5a6';
  const amenitySet = new Set(unit.amenities.map((a) => a.amenity));

  return (
    <>
      <div className="drawer-overlay" onClick={() => dispatch(closeDrawer())} />
      <div className="unit-drawer">
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div className="drawer-unit-no">{unit.unitNumber}</div>
            <div className="drawer-unit-meta">
              {unit.tower && <span>{unit.tower.name}</span>}
              {unit.floorLabel && <span>Floor {unit.floorLabel}</span>}
              <span className="capitalize">{unit.unitType.replace(/_/g, ' ')}</span>
            </div>
          </div>
          <div className="drawer-header-right">
            <span className="status-pill" style={{ background: statusStyle + '22', color: statusStyle }}>
              {unit.status.replace(/_/g, ' ')}
            </span>
            <button className="drawer-close" onClick={() => dispatch(closeDrawer())}><X size={18} /></button>
          </div>
        </div>

        {/* Status transitions */}
        {transitions.length > 0 && (
          <div className="status-transition-bar">
            {transitions.map((s) => (
              <button key={s} onClick={() => { setNewStatus(s); setStatusModal(true); }}
                style={{ borderColor: STATUS_COLORS[s] + '66', color: STATUS_COLORS[s] }}>
                → {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="drawer-tabs">
          {([
            { key: 'info', label: 'Info' },
            { key: 'meters', label: 'Meters' },
            { key: 'charges', label: 'Charges' },
            { key: 'floor_plan', label: 'Floor Plan' },
            { key: 'leases', label: `Leases${unit.leases.length > 0 ? ` (${unit.leases.length})` : ''}` },
            { key: 'history', label: 'History' },
          ] as { key: DrawerTab; label: string }[]).map((t) => (
            <button key={t.key} className={activeTab === t.key ? 'active' : ''} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="drawer-content">
          {/* ═══ INFO TAB ═══ */}
          {activeTab === 'info' && (
            <div className="drawer-info">
              {/* Edit toggle */}
              <div className="edit-toggle-bar">
                {editing ? (
                  <>
                    <button className="btn-save-edit" onClick={handleSave} disabled={saving}>
                      <Check size={13} /> {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn-cancel-edit" onClick={cancelEditing}>Cancel</button>
                  </>
                ) : (
                  <button className="btn-start-edit" onClick={startEditing}>
                    <Pencil size={12} /> Edit
                  </button>
                )}
              </div>

              {editing ? (
                /* ── EDIT MODE ── */
                <div className="edit-form">
                  <div className="ef-section-title">Identity</div>
                  <div className="ef-grid">
                    <EditField label="Unit Number" value={editForm.unitNumber} onChange={(v) => ef('unitNumber', v)} />
                    <div className="ef-field">
                      <label>Unit Type</label>
                      <select value={editForm.unitType} onChange={(e) => ef('unitType', e.target.value)}>
                        {unitTypes.length > 0
                          ? [...unitTypes].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.code}>{t.name}</option>)
                          : <option value={editForm.unitType}>{editForm.unitType}</option>}
                      </select>
                    </div>
                    <div className="ef-field">
                      <label>Zone</label>
                      <select value={editForm.zone ?? ''} onChange={(e) => ef('zone', e.target.value)}>
                        <option value="">-</option>
                        {ZONE_OPTIONS.map((z) => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="ef-section-title">Floor &amp; Location</div>
                  <div className="ef-grid">
                    <div className="ef-field">
                      <label>Floor Number</label>
                      {floorSetups.length > 0 ? (
                        <select
                          value={editForm.floorNumber ?? ''}
                          onChange={(e) => {
                            const selected = floorSetups.find((f) => f.floorNumber === Number(e.target.value));
                            ef('floorNumber', e.target.value);
                            ef('floorLabel', selected ? selected.floorLabel : '');
                          }}
                        >
                          <option value="">— Select —</option>
                          {floorSetups.map((f) => (
                            <option key={f.id} value={f.floorNumber}>Floor {f.floorNumber}</option>
                          ))}
                        </select>
                      ) : (
                        <EditField label="" value={editForm.floorNumber} type="number" onChange={(v) => ef('floorNumber', v)} placeholder="Floor number" />
                      )}
                    </div>
                    <div className="ef-field">
                      <label>Floor Label</label>
                      <input
                        value={editForm.floorLabel ?? ''}
                        readOnly={floorSetups.length > 0}
                        placeholder={floorSetups.length > 0 ? 'Auto-filled' : 'e.g. G, M, B1'}
                        style={floorSetups.length > 0 ? { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                        onChange={(e) => ef('floorLabel', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="ef-section-title">Dimensions</div>
                  <div className="ef-grid">
                    <EditField label="Area (sqft)" type="number" value={editForm.areaSqft} onChange={efAreaSqft} />
                    <EditField label="Area (sqm)" type="number" value={editForm.areaSqm} onChange={efAreaSqm} />
                    <EditField label="Bedrooms" type="number" value={editForm.bedroomCount} onChange={(v) => ef('bedroomCount', v)} />
                    <EditField label="Bathrooms" type="number" value={editForm.bathroomCount} onChange={(v) => ef('bathroomCount', v)} />
                  </div>
                  <div className="ef-grid">
                    <div className="ef-field">
                      <label>Direction</label>
                      <select value={editForm.direction} onChange={(e) => ef('direction', e.target.value)}>
                        <option value="">—</option>
                        {DIRECTION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="ef-field">
                      <label>Furnishing</label>
                      <select value={editForm.furnishing} onChange={(e) => ef('furnishing', e.target.value)}>
                        {FURNISHING_OPTIONS.map((f) => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="ef-section-title">Ownership</div>
                  <div className="ef-grid">
                    <div className="ef-field">
                      <label>Type</label>
                      <select value={editForm.ownershipType} onChange={(e) => ef('ownershipType', e.target.value)}>
                        {OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <EditField label="Owner" value={editForm.ownerName} onChange={(v) => ef('ownerName', v)} />
                    <EditField label="Contact" value={editForm.ownerContact} onChange={(v) => ef('ownerContact', v)} />
                  </div>
                  <div className="ef-grid">
                    <EditField label="Purchase Date" type="date" value={editForm.purchaseDate} onChange={(v) => ef('purchaseDate', v)} />
                    <EditField label="Purchase Price" type="number" value={editForm.purchasePrice} onChange={(v) => ef('purchasePrice', v)} />
                    <EditField label="Market Value" type="number" value={editForm.currentMarketValue} onChange={(v) => ef('currentMarketValue', v)} />
                  </div>

                  <div className="ef-section-title">Rental</div>
                  <div className="ef-grid">
                    <div className="ef-field">
                      <label>Rental Period</label>
                      <div className="ef-field-combo">
                        <input type="number" min={0} value={editForm.rentalPeriod} onChange={(e) => ef('rentalPeriod', e.target.value)} />
                        <select value={editForm.rentalPeriodUnit} onChange={(e) => ef('rentalPeriodUnit', e.target.value)}>
                          <option value="day">Day</option>
                          <option value="month">Month</option>
                          <option value="year">Year</option>
                        </select>
                      </div>
                    </div>
                    <div className="ef-field">
                      <label>Calculation on</label>
                      <select value={editForm.calculationOn} onChange={(e) => ef('calculationOn', e.target.value)}>
                        <option value="fixed">Fixed</option>
                        <option value="per_sqft">PerSqFt</option>
                      </select>
                    </div>
                    <EditField label="Rate" type="number" value={editForm.rate} onChange={(v) => ef('rate', v)} />
                  </div>

                  <div className="ef-section-title">Notes</div>
                  <div className="ef-field full-width">
                    <label>Description</label>
                    <textarea rows={2} value={editForm.description} onChange={(e) => ef('description', e.target.value)} />
                  </div>
                  <div className="ef-field full-width">
                    <label>Internal Notes</label>
                    <textarea rows={2} value={editForm.notes} onChange={(e) => ef('notes', e.target.value)} />
                  </div>
                  <div className="ef-field full-width">
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <input
                        type="checkbox"
                        checked={editForm.commonBillCalculate ?? false}
                        onChange={(e) => ef('commonBillCalculate', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                      />
                      <span>Common Bill Calculate</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Include in common area bill calculation</span>
                    </label>
                  </div>
                </div>
              ) : (
                /* ── VIEW MODE ── */
                <>
                  <div className="info-section">
                    <h5>Identity</h5>
                    <div className="info-grid">
                      <InfoItem label="Unit Number" value={unit.unitNumber} />
                      <InfoItem label="Unit Type"   value={unit.unitType.replace(/_/g, ' ')} />
                      <InfoItem label="Zone"        value={unit.zone || '—'} />
                    </div>
                  </div>

                  <div className="info-section">
                    <h5>Floor &amp; Location</h5>
                    <div className="info-grid">
                      <InfoItem label="Floor Number" value={unit.floorNumber != null ? `Floor ${unit.floorNumber}` : '—'} />
                      <InfoItem label="Floor Label"  value={unit.floorLabel || '—'} />
                    </div>
                  </div>

                  <div className="info-section">
                    <h5>Dimensions</h5>
                    <div className="info-grid">
                      <InfoItem label="Area (sqft)" value={unit.areaSqft ? `${unit.areaSqft}` : '—'} />
                      <InfoItem label="Area (sqm)"  value={unit.areaSqm  ? `${unit.areaSqm}` : '—'} />
                      <InfoItem label="Bedrooms"    value={String(unit.bedroomCount)} />
                      <InfoItem label="Bathrooms"   value={String(unit.bathroomCount)} />
                      <InfoItem label="Direction"   value={unit.direction || '—'} />
                      <InfoItem label="Furnishing"  value={unit.furnishing.replace(/_/g, ' ')} />
                    </div>
                  </div>

                  <div className="info-section">
                    <h5>Ownership</h5>
                    <div className="info-grid">
                      <InfoItem label="Type"           value={unit.ownershipType} />
                      <InfoItem label="Owner"          value={unit.ownerName || '—'} />
                      <InfoItem label="Contact"        value={unit.ownerContact || '—'} />
                      <InfoItem label="Purchase Date"  value={unit.purchaseDate ? new Date(unit.purchaseDate).toLocaleDateString() : '—'} />
                      <InfoItem label="Purchase Price" value={unit.purchasePrice ? Number(unit.purchasePrice).toLocaleString() : '—'} />
                      <InfoItem label="Market Value"   value={unit.currentMarketValue ? Number(unit.currentMarketValue).toLocaleString() : '—'} />
                    </div>
                  </div>

                  <div className="info-section">
                    <h5>Rental</h5>
                    <div className="info-grid">
                      <InfoItem label="Rental Period"   value={unit.rentalPeriod ? `${unit.rentalPeriod} ${unit.rentalPeriodUnit || 'month'}${unit.rentalPeriod === 1 ? '' : 's'}` : '—'} />
                      <InfoItem label="Calculation on"  value={unit.calculationOn === 'per_sqft' ? 'PerSqFt' : 'Fixed'} />
                      <InfoItem label="Rate"            value={unit.rate ? Number(unit.rate).toLocaleString() : '—'} />
                    </div>
                  </div>

                  <div className="info-section">
                    <h5>Notes</h5>
                    <div className="info-grid">
                      <InfoItem label="Description"    value={unit.description || '—'} />
                      <InfoItem label="Internal Notes" value={unit.notes || '—'} />
                      <InfoItem
                        label="Common Bill Calculate"
                        value={unit.commonBillCalculate ? '✅ Yes' : '—'}
                      />
                    </div>
                  </div>

                  <div className="info-section">
                    <h5>Amenities</h5>
                    <div className="amenity-toggles">
                      {AMENITY_OPTIONS.map((a) => (
                        <button
                          key={a}
                          className={`amenity-toggle ${amenitySet.has(a) ? 'active' : ''}`}
                          onClick={() => handleToggleAmenity(a)}
                        >
                          {a.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ METERS TAB ═══ */}
          {activeTab === 'meters' && (
            <div className="drawer-meters">
              <button className="btn-add-meter" onClick={() => { setAddingMeter(!addingMeter); setMeterFormErrors({}); }}>
                <Plus size={13} /> Add Meter
              </button>

              {addingMeter && (
                <div className="meter-form">
                  <div className="ef-field">
                    <label>Category <span className="req-star">*</span></label>
                    <select value={meterForm.meterType}
                      className={meterFormErrors.meterType ? 'input-error' : ''}
                      onChange={(e) => { setMeterForm({ ...meterForm, meterType: e.target.value, meterSerialNo: '' }); setMeterFormErrors((p) => ({ ...p, meterType: '', meterSerialNo: '' })); }}>
                      <option value="">Select category…</option>
                      {METER_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    {meterFormErrors.meterType && <span className="field-warn">{meterFormErrors.meterType}</span>}
                  </div>
                  <div className="ef-field">
                    <label>Meter No <span className="req-star">*</span></label>
                    <select value={meterForm.meterSerialNo} disabled={!meterForm.meterType}
                      className={meterFormErrors.meterSerialNo ? 'input-error' : ''}
                      onChange={(e) => { setMeterForm({ ...meterForm, meterSerialNo: e.target.value }); setMeterFormErrors((p) => ({ ...p, meterSerialNo: '' })); }}>
                      <option value="">
                        {!meterForm.meterType ? 'Select category first' : floorMeterOptions.length === 0 ? 'No meters set up for this floor' : 'Select meter no…'}
                      </option>
                      {floorMeterOptions.map((m) => (
                        <option key={m.id} value={m.meterNo}>{m.meterNo}</option>
                      ))}
                    </select>
                    {meterFormErrors.meterSerialNo && <span className="field-warn">{meterFormErrors.meterSerialNo}</span>}
                  </div>
                  {(() => {
                    const sel = floorMeterOptions.find((m) => m.meterNo === meterForm.meterSerialNo);
                    const label = sel ? (METER_TYPES.find((t) => t.value === sel.meterType)?.label || sel.meterType.replace(/_/g, ' ')) : '';
                    return (
                      <div className="ef-field">
                        <label>Meter Type</label>
                        <input
                          readOnly
                          value={label}
                          placeholder="— auto-filled —"
                          style={{ background: 'var(--bg-tertiary)', color: label ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'not-allowed', textTransform: 'capitalize' }}
                        />
                      </div>
                    );
                  })()}
                  <input placeholder="Provider (optional)" value={meterForm.meterProvider}
                    onChange={(e) => setMeterForm({ ...meterForm, meterProvider: e.target.value })} />
                  <input placeholder="Location (optional)" value={meterForm.location}
                    onChange={(e) => setMeterForm({ ...meterForm, location: e.target.value })} />
                  <div className="meter-form-row">
                    <div className="ef-field">
                      <label>Install Date <span className="req-star">*</span></label>
                      <input type="date" value={meterForm.installedAt}
                        className={meterFormErrors.installedAt ? 'input-error' : ''}
                        onChange={(e) => { setMeterForm({ ...meterForm, installedAt: e.target.value }); setMeterFormErrors((p) => ({ ...p, installedAt: '' })); }} />
                      {meterFormErrors.installedAt && <span className="field-warn">{meterFormErrors.installedAt}</span>}
                    </div>
                    <label className="meter-checkbox">
                      <input type="checkbox" checked={meterForm.isSmartMeter}
                        onChange={(e) => { setMeterForm({ ...meterForm, isSmartMeter: e.target.checked }); setMeterFormErrors((p) => ({ ...p, smartMeterId: '' })); }} />
                      Smart Meter
                    </label>
                  </div>
                  {meterForm.isSmartMeter && (
                    <div className="ef-field">
                      <input placeholder="Smart Meter ID *" value={meterForm.smartMeterId}
                        className={meterFormErrors.smartMeterId ? 'input-error' : ''}
                        onChange={(e) => { setMeterForm({ ...meterForm, smartMeterId: e.target.value }); setMeterFormErrors((p) => ({ ...p, smartMeterId: '' })); }} />
                      {meterFormErrors.smartMeterId && <span className="field-warn">{meterFormErrors.smartMeterId}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <button className="btn-primary-sm" onClick={handleAddMeter}>Save</button>
                    <button className="btn-ghost-sm" onClick={() => { setAddingMeter(false); setMeterFormErrors({}); }}>Cancel</button>
                  </div>
                </div>
              )}

              {unit.meters.length === 0
                ? <div className="empty-sm">No meters assigned</div>
                : unit.meters.map((m) => (
                    <div key={m.id} className="meter-card">
                      {editingMeterId === m.id ? (
                        /* ── Inline Meter Edit ── */
                        <div className="meter-edit-inline">
                          <div className="ef-field">
                            <label>Category <span className="req-star">*</span></label>
                            <select value={meterEditForm.meterCategory}
                              className={meterEditFormErrors.meterCategory ? 'input-error' : ''}
                              onChange={(e) => { setMeterEditForm({ ...meterEditForm, meterCategory: e.target.value, meterSerialNo: '' }); setMeterEditFormErrors((p) => ({ ...p, meterCategory: '', meterSerialNo: '' })); }}>
                              <option value="">Select category…</option>
                              {METER_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            {meterEditFormErrors.meterCategory && <span className="field-warn">{meterEditFormErrors.meterCategory}</span>}
                          </div>
                          <div className="ef-field">
                            <label>Meter No <span className="req-star">*</span></label>
                            <select value={meterEditForm.meterSerialNo} disabled={!meterEditForm.meterCategory}
                              className={meterEditFormErrors.meterSerialNo ? 'input-error' : ''}
                              onChange={(e) => { setMeterEditForm({ ...meterEditForm, meterSerialNo: e.target.value }); setMeterEditFormErrors((p) => ({ ...p, meterSerialNo: '' })); }}>
                              <option value="">
                                {!meterEditForm.meterCategory ? 'Select category first' : floorMeterEditOptions.length === 0 ? 'No meters set up for this floor' : 'Select meter no…'}
                              </option>
                              {floorMeterEditOptions.map((opt) => (
                                <option key={opt.id} value={opt.meterNo}>{opt.meterNo}</option>
                              ))}
                            </select>
                            {meterEditFormErrors.meterSerialNo && <span className="field-warn">{meterEditFormErrors.meterSerialNo}</span>}
                          </div>
                          {(() => {
                            const setup = floorMeterEditOptions.find((s) => s.meterNo === meterEditForm.meterSerialNo);
                            const typeLabel = setup ? (METER_TYPES.find((t) => t.value === setup.meterType)?.label || setup.meterType.replace(/_/g, ' ')) : '';
                            return (
                              <div className="ef-field">
                                <label>Meter Type</label>
                                <input readOnly value={typeLabel} placeholder="— auto-filled —"
                                  style={{ background: 'var(--bg-tertiary)', color: typeLabel ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'not-allowed' }} />
                              </div>
                            );
                          })()}
                          <input value={meterEditForm.meterProvider}
                            onChange={(e) => setMeterEditForm({ ...meterEditForm, meterProvider: e.target.value })}
                            placeholder="Provider (optional)" />
                          <input value={meterEditForm.location}
                            onChange={(e) => setMeterEditForm({ ...meterEditForm, location: e.target.value })}
                            placeholder="Location (optional)" />
                          <label className="meter-checkbox">
                            <input type="checkbox" checked={meterEditForm.isSmartMeter}
                              onChange={(e) => { setMeterEditForm({ ...meterEditForm, isSmartMeter: e.target.checked }); setMeterEditFormErrors((p) => ({ ...p, smartMeterId: '' })); }} />
                            Smart
                          </label>
                          {meterEditForm.isSmartMeter && (
                            <div className="ef-field">
                              <input value={meterEditForm.smartMeterId}
                                className={meterEditFormErrors.smartMeterId ? 'input-error' : ''}
                                onChange={(e) => { setMeterEditForm({ ...meterEditForm, smartMeterId: e.target.value }); setMeterEditFormErrors((p) => ({ ...p, smartMeterId: '' })); }}
                                placeholder="Smart Meter ID *" />
                              {meterEditFormErrors.smartMeterId && <span className="field-warn">{meterEditFormErrors.smartMeterId}</span>}
                            </div>
                          )}
                          <div className="form-row">
                            <button className="btn-primary-sm" onClick={handleMeterEditSave}><Check size={12} /> Save</button>
                            <button className="btn-ghost-sm" onClick={() => { setEditingMeterId(null); setMeterEditFormErrors({}); }}>Cancel</button>
                          </div>
                        </div>
                      ) : readingMeterId === m.id ? (
                        /* ── Record Reading Inline ── */
                        <div className="meter-edit-inline">
                          <div className="meter-reading-header">
                            {METER_ICONS[m.meterType] || <Activity size={14} />}
                            <span>Record Reading — {m.meterSerialNo}</span>
                          </div>
                          <div className="ef-field full-width">
                            <label>Reading Value</label>
                            <input type="number" step="0.001" value={readingValue}
                              onChange={(e) => setReadingValue(e.target.value)}
                              placeholder="e.g. 1250.5" autoFocus />
                          </div>
                          <div className="ef-field full-width">
                            <label>Start Date</label>
                            <input type="date" value={readingStartDate}
                              onChange={(e) => setReadingStartDate(e.target.value)} />
                          </div>
                          <div className="ef-field full-width">
                            <label>End Date</label>
                            <input type="date" value={readingEndDate}
                              onChange={(e) => setReadingEndDate(e.target.value)} />
                          </div>
                          <div className="form-row">
                            <button className="btn-primary-sm" onClick={handleRecordReading}><Check size={12} /> Save</button>
                            <button className="btn-ghost-sm" onClick={() => setReadingMeterId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        /* ── Normal Meter Card View ── */
                        <>
                          <div className="meter-info">
                            <div className="meter-detail-grid">
                              <div className="meter-detail-col">
                                <span className="meter-detail-label">Category</span>
                                <span className="meter-detail-value">
                                  {METER_CATEGORIES.find((c) => c.value === m.meterType)?.label || m.meterType.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div className="meter-detail-col">
                                <span className="meter-detail-label">Meter No</span>
                                <span className="meter-detail-value">{m.meterSerialNo}</span>
                              </div>
                              {(() => {
                                const setup = (meterSetupsData?.data || []).find((s) => s.meterNo === m.meterSerialNo);
                                const typeLabel = setup ? (METER_TYPES.find((t) => t.value === setup.meterType)?.label || setup.meterType.replace(/_/g, ' ')) : '';
                                return typeLabel ? (
                                  <div className="meter-detail-col">
                                    <span className="meter-detail-label">Meter Type</span>
                                    <span className="meter-detail-value">{typeLabel}</span>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                            {(m.meterProvider || m.location || m.installedAt) && (
                              <div className="meter-extra-row">
                                {m.meterProvider && <span className="meter-extra-item"><span className="meter-detail-label">Provider</span> {m.meterProvider}</span>}
                                {m.location && <span className="meter-extra-item"><span className="meter-detail-label">Location</span> {m.location}</span>}
                                {m.installedAt && <span className="meter-extra-item"><span className="meter-detail-label">Installed</span> {new Date(m.installedAt).toLocaleDateString()}</span>}
                              </div>
                            )}
                            {m.lastReading !== null && (
                              <div className="meter-last-reading">
                                <span className="mlr-label">Last Reading</span>
                                <span className="mlr-value">{Number(m.lastReading).toLocaleString()}</span>
                                {(m.lastReadingStartDate || m.lastReadingDate) && (
                                  <span className="mlr-date">
                                    {m.lastReadingStartDate && new Date(m.lastReadingStartDate).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                                    {m.lastReadingStartDate && m.lastReadingDate && ' – '}
                                    {m.lastReadingDate && new Date(m.lastReadingDate).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </span>
                                )}
                              </div>
                            )}
                            {m.isSmartMeter && <span className="smart-badge">Smart{m.smartMeterId ? ` · ${m.smartMeterId}` : ''}</span>}
                          </div>
                          <div className="meter-actions">
                            <button className="meter-action-btn" title="Record Reading"
                              onClick={() => {
                                setReadingMeterId(m.id);
                                setReadingValue(m.lastReading != null ? String(m.lastReading) : '');
                                setReadingStartDate(m.lastReadingStartDate ? m.lastReadingStartDate.split('T')[0] : '');
                                setReadingEndDate(m.lastReadingDate ? m.lastReadingDate.split('T')[0] : new Date().toISOString().split('T')[0]);
                              }}>
                              <Activity size={12} />
                            </button>
                            <button className="meter-action-btn" title="Edit Meter" onClick={() => handleMeterEdit(m)}>
                              <Pencil size={12} />
                            </button>
                            <button className="meter-delete" onClick={async () => {
                              try { await deleteMeter({ propertyId, unitId, meterId: m.id }).unwrap(); toast.success('Removed'); }
                              catch { toast.error('Failed'); }
                            }}><Trash2 size={13} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
              }
            </div>
          )}

          {/* ═══ CHARGES TAB ═══ */}
          {activeTab === 'charges' && (
            <div className="drawer-charges">

              {/* Add Charge button */}
              <button className="btn-add-meter" onClick={() => { setAddingCharge(!addingCharge); setChargeForm({ chargeTypeId: '', amount: '' }); }}>
                <Plus size={13} /> Add Charge
              </button>

              {/* Add Charge form */}
              {addingCharge && (
                <div className="charge-inline-form">
                  <div className="charge-inline-fields">
                    <select
                      value={chargeForm.chargeTypeId}
                      onChange={(e) => setChargeForm({ ...chargeForm, chargeTypeId: e.target.value })}
                    >
                      <option value="">Charge type…</option>
                      {chargeTypes.map((ct) => (
                        <option key={ct.id} value={ct.id}>{ct.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      value={chargeForm.amount}
                      onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                    />
                  </div>
                  <div className="charge-inline-actions">
                    <button
                      className="btn-primary-sm"
                      onClick={handleAddCharge}
                      disabled={!chargeForm.chargeTypeId || !chargeForm.amount || savingCharge}
                    >
                      <Check size={12} /> {savingCharge ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn-ghost-sm" onClick={() => setAddingCharge(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Charges list */}
              {unitCharges.length === 0 ? (
                <div className="empty-sm">No charges assigned to this unit</div>
              ) : (
                unitCharges.map((c) => (
                  <div key={c.id} className="charge-card">
                    {editingChargeId === c.id ? (
                      /* ── Inline Edit Form ── */
                      <div className="charge-inline-form">
                        <div className="charge-inline-fields">
                          <select
                            value={chargeEditForm.chargeTypeId}
                            onChange={(e) => setChargeEditForm({ ...chargeEditForm, chargeTypeId: e.target.value })}
                          >
                            <option value="">Charge type…</option>
                            {chargeTypes.map((ct) => (
                              <option key={ct.id} value={ct.id}>{ct.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Amount"
                            value={chargeEditForm.amount}
                            onChange={(e) => setChargeEditForm({ ...chargeEditForm, amount: e.target.value })}
                          />
                        </div>
                        <div className="charge-inline-actions">
                          <button
                            className="btn-primary-sm"
                            onClick={handleChargeEditSave}
                            disabled={!chargeEditForm.chargeTypeId || !chargeEditForm.amount || savingChargeEdit}
                          >
                            <Check size={12} /> {savingChargeEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button className="btn-ghost-sm" onClick={() => setEditingChargeId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal Card View ── */
                      <>
                        <div className="charge-card-info">
                          <span className="charge-card-name">{c.chargeType.name}</span>
                          <span className="charge-card-amount">{Number(c.amount).toLocaleString()}</span>
                        </div>
                        <div className="charge-actions">
                          <button
                            className="meter-action-btn"
                            title="Edit charge"
                            onClick={() => handleChargeEdit(c)}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="meter-delete"
                            title="Remove charge"
                            onClick={() => handleDeleteCharge(c.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ═══ FLOOR PLAN TAB ═══ */}
          {activeTab === 'floor_plan' && (
            <div className="drawer-floorplan">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={handleFloorPlanUpload}
              />

              {unit.floorPlanUrl ? (
                <div className="fp-preview">
                  {/\.(png|jpe?g)$/i.test(unit.floorPlanUrl) ? (
                    <img
                      src={`/api/v1${unit.floorPlanUrl}`}
                      alt="Floor plan"
                      className="fp-image"
                    />
                  ) : (
                    <div className="fp-pdf-card">
                      <FileImage size={32} />
                      <span>Floor Plan (PDF)</span>
                      <a
                        href={`/api/v1${unit.floorPlanUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="fp-open-link"
                      >
                        <ExternalLink size={12} /> Open
                      </a>
                    </div>
                  )}
                  <div className="fp-actions">
                    <button className="btn-fp-replace" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <Upload size={13} /> {uploading ? 'Uploading…' : 'Replace'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="fp-empty">
                  <FileImage size={36} />
                  <p>No floor plan uploaded</p>
                  <button className="btn-fp-upload" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload Floor Plan'}
                  </button>
                  <span className="fp-hint">PDF, PNG, or JPEG — max 10MB</span>
                </div>
              )}
            </div>
          )}

          {/* ═══ LEASES TAB ═══ */}
          {activeTab === 'leases' && (
            <div className="drawer-leases">
              {unit.leases.length === 0
                ? <div className="empty-sm">No leases for this unit</div>
                : unit.leases.map((lease) => {
                    const tenantName = lease.tenant.tenantType === 'corporate'
                      ? lease.tenant.companyName
                      : `${lease.tenant.firstName ?? ''} ${lease.tenant.lastName ?? ''}`.trim();
                    const isActive = lease.status === 'active';
                    return (
                      <div key={lease.id} className={`lease-card ${isActive ? 'active' : ''}`}>
                        <div className="lease-card-header">
                          <span className="lease-number">{lease.leaseNumber}</span>
                          <span className={`lease-status ls-${lease.status}`}>{lease.status}</span>
                        </div>
                        <div className="lease-tenant">
                          {tenantName || lease.tenant.email || 'Unknown tenant'}
                        </div>
                        <div className="lease-details">
                          <div className="lease-detail-row">
                            <CalendarDays size={11} />
                            <span>{new Date(lease.startDate).toLocaleDateString()} → {new Date(lease.endDate).toLocaleDateString()}</span>
                          </div>
                          <div className="lease-detail-row">
                            <span className="lease-term">{lease.leaseTermMonths} mo</span>
                            <span className="lease-rent">
                              {lease.currency} {Number(lease.rentAmount).toLocaleString()}
                              <span className="lease-cycle">/{lease.billingCycle}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* ═══ HISTORY TAB ═══ */}
          {activeTab === 'history' && (() => {
            type HistoryEvent = { id: string; at: string; filterStart: string; filterEnd: string; meterType?: string; node: JSX.Element };

            const statusEvents: HistoryEvent[] = unit.statusHistory.map((h) => ({
              id: `status-${h.id}`,
              at: h.changedAt,
              filterStart: h.changedAt,
              filterEnd: h.changedAt,
              node: (
                <div key={`status-${h.id}`} className="history-item-sm">
                  <div className="history-dot-sm" style={{ background: STATUS_COLORS[h.toStatus] }} />
                  <div>
                    <div className="history-change-sm">
                      {h.fromStatus ? <span>{h.fromStatus.replace(/_/g, ' ')} →</span> : null}
                      <span style={{ color: STATUS_COLORS[h.toStatus] }}>{h.toStatus.replace(/_/g, ' ')}</span>
                    </div>
                    {h.reason && <div className="history-reason-sm">{h.reason}</div>}
                    <div className="history-meta-sm">
                      {h.changedByUser?.profile
                        ? `${h.changedByUser.profile.firstName} ${h.changedByUser.profile.lastName}`
                        : h.changedByUser?.email}
                      · {new Date(h.changedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ),
            }));

            const meterEvents: HistoryEvent[] = unit.meterReadingHistory.map((r) => {
              const typeLabel = METER_CATEGORIES.find((c) => c.value === r.meterType)?.label || r.meterType.replace(/_/g, ' ');
              return {
                id: `meter-${r.id}`,
                at: r.recordedAt,
                filterStart: r.startDate || r.endDate || r.recordedAt,
                filterEnd: r.endDate || r.startDate || r.recordedAt,
                meterType: r.meterType,
                node: (
                  <div key={`meter-${r.id}`} className="history-item-sm">
                    <div className="history-dot-sm history-dot-meter" />
                    <div>
                      <div className="history-change-sm">
                        {METER_ICONS[r.meterType] || <Activity size={12} />}
                        <span>Meter Reading</span>
                        <span className="history-meter-type">· {typeLabel}</span>
                      </div>
                      <div className="history-reason-sm">
                        {r.meterSerialNo} — {Number(r.readingValue).toLocaleString()}
                        {(r.startDate || r.endDate) && (
                          <> ({r.startDate ? new Date(r.startDate).toLocaleDateString() : '—'} – {r.endDate ? new Date(r.endDate).toLocaleDateString() : '—'})</>
                        )}
                      </div>
                      <div className="history-meta-sm">
                        {r.recordedByUser?.profile
                          ? `${r.recordedByUser.profile.firstName} ${r.recordedByUser.profile.lastName}`
                          : r.recordedByUser?.email}
                        · {new Date(r.recordedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ),
              };
            });

            const sortDesc = (a: HistoryEvent, b: HistoryEvent) => new Date(b.at).getTime() - new Date(a.at).getTime();
            statusEvents.sort(sortDesc);
            meterEvents.sort(sortDesc);

            const fromTime = historyFromDate ? new Date(`${historyFromDate}T00:00:00.000Z`).getTime() : null;
            const toTime = historyToDate ? new Date(`${historyToDate}T23:59:59.999Z`).getTime() : null;
            const inRange = (e: HistoryEvent) => {
              const startT = new Date(e.filterStart).getTime();
              const endT = new Date(e.filterEnd).getTime();
              return (fromTime === null || endT >= fromTime) && (toTime === null || startT <= toTime);
            };

            const shown = (historyFilter === 'status' ? statusEvents : meterEvents)
              .filter(inRange)
              .filter((e) => historyFilter !== 'meter' || historyMeterCategory === 'all' || e.meterType === historyMeterCategory);
            const emptyLabel = historyFilter === 'status' ? 'No status history' : 'No meter readings recorded';

            return (
              <div>
                <div className="history-filter-row">
                  <select className="history-type-select" value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value as 'status' | 'meter')}>
                    <option value="status">Status History</option>
                    <option value="meter">Meter Reading History</option>
                  </select>
                  {historyFilter === 'meter'
                    ? (
                      <select className="history-type-select history-category-select" value={historyMeterCategory}
                        onChange={(e) => setHistoryMeterCategory(e.target.value)}>
                        <option value="all">All</option>
                        {METER_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    )
                    : (
                      <select className="history-type-select history-type-select-spacer" disabled aria-hidden="true" tabIndex={-1} value="all">
                        <option value="all">All</option>
                      </select>
                    )
                  }
                  <div className="history-clear-spacer" aria-hidden="true" />
                </div>
                <div className="history-date-filter">
                  <div className="ef-field">
                    <label>From</label>
                    <input type="date" value={historyFromDate} max={historyToDate || undefined}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && historyToDate && v > historyToDate) return;
                        setHistoryFromDate(v);
                      }} />
                  </div>
                  <div className="ef-field">
                    <label>To</label>
                    <input type="date" value={historyToDate} min={historyFromDate || undefined}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && historyFromDate && v < historyFromDate) return;
                        setHistoryToDate(v);
                      }} />
                  </div>
                  <button
                    className={`btn-ghost-sm history-date-clear${(historyFromDate || historyToDate) ? '' : ' history-date-clear-hidden'}`}
                    disabled={!(historyFromDate || historyToDate)}
                    onClick={() => { setHistoryFromDate(''); setHistoryToDate(''); }}>Clear</button>
                </div>
                <div className="drawer-history">
                  {shown.length === 0
                    ? <div className="empty-sm">{(historyFromDate || historyToDate) ? 'No history in this date range' : emptyLabel}</div>
                    : shown.map((e) => e.node)
                  }
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Status change modal */}
      {statusModal && (() => {
        const reasonRequired = ['maintenance', 'not_for_rent'].includes(newStatus);
        const canConfirm = !reasonRequired || statusReason.trim().length > 0;
        return (
          <div className="modal-overlay">
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Change Status</h3>
                <button onClick={() => setStatusModal(false)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                <p>→ <strong style={{ color: STATUS_COLORS[newStatus] }}>{newStatus.replace(/_/g, ' ')}</strong></p>
                <label>
                  Reason {reasonRequired
                    ? <span className="reason-required">* required</span>
                    : <span className="reason-optional">(optional)</span>
                  }
                </label>
                <textarea
                  rows={3}
                  placeholder={reasonRequired ? 'Please provide a reason…' : 'Reason for change...'}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className={reasonRequired && !statusReason.trim() ? 'reason-error' : ''}
                />
                {newStatus === 'maintenance' && (
                  <div className="est-completion">
                    <label>Estimated Completion <span className="reason-optional">(optional)</span></label>
                    <input
                      type="date"
                      value={estimatedCompletion}
                      onChange={(e) => setEstimatedCompletion(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-ghost" onClick={() => setStatusModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleStatusChange} disabled={!canConfirm}>Confirm</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

/* ── Shared sub-components ───────────────────── */

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      <span className="info-value capitalize">{value}</span>
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="ef-field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
