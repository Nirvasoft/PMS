import { useState, useRef, useCallback } from 'react';
import { useAppDispatch } from '../../../store';
import { closeDrawer } from '../../../store/slices/unitsSlice';
import {
  useGetUnitQuery, useUpdateUnitMutation, useUpdateUnitStatusMutation,
  useAddMeterMutation, useDeleteMeterMutation, useSetAmenitiesMutation,
  useUploadFloorPlanMutation, useGetUnitTypesQuery,
} from '../../../store/api/unitsApi';
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

const DIRECTION_OPTIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'corner'];
const FURNISHING_OPTIONS = ['unfurnished', 'partially_furnished', 'fully_furnished'];
const OWNERSHIP_OPTIONS = ['leasehold', 'freehold', 'strata', 'company', 'individual'];

type DrawerTab = 'info' | 'meters' | 'floor_plan' | 'leases' | 'history';

export function UnitDetailDrawer({ propertyId, unitId }: { propertyId: string; unitId: string }) {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<DrawerTab>('info');
  const [editing, setEditing] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [estimatedCompletion, setEstimatedCompletion] = useState('');
  const [addingMeter, setAddingMeter] = useState(false);
  const [meterForm, setMeterForm] = useState({ meterType: 'electricity', meterSerialNo: '', meterProvider: '', isSmartMeter: false });

  const { data, isLoading, isError, error } = useGetUnitQuery({ propertyId, unitId });
  const unit = data?.data;

  const [updateUnit, { isLoading: saving }] = useUpdateUnitMutation();
  const [updateStatus] = useUpdateUnitStatusMutation();
  const [addMeter] = useAddMeterMutation();
  const [deleteMeter] = useDeleteMeterMutation();
  const [setAmenities] = useSetAmenitiesMutation();
  const [uploadFloorPlan, { isLoading: uploading }] = useUploadFloorPlanMutation();
  const { data: typesData } = useGetUnitTypesQuery();
  const unitTypes = typesData?.data || [];

  // ── Edit form state ─────────────────────────
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  const startEditing = useCallback(() => {
    if (!unit) return;
    setEditForm({
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
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
      description: unit.description ?? '',
      notes: unit.notes ?? '',
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
      if (editForm.description !== (unit!.description ?? '')) payload.description = editForm.description || null;
      if (editForm.notes !== (unit!.notes ?? '')) payload.notes = editForm.notes || null;

      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }

      await updateUnit({ propertyId, unitId, data: payload }).unwrap();
      toast.success('Unit updated');
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to update');
    }
  };

  const ef = (k: string, v: any) => setEditForm((f) => ({ ...f, [k]: v }));

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
    } catch (e: any) { toast.error(e?.data?.message || 'Failed to update status'); }
  };

  const handleAddMeter = async () => {
    if (!meterForm.meterSerialNo) return;
    try {
      await addMeter({ propertyId, unitId, data: meterForm }).unwrap();
      toast.success('Meter added');
      setAddingMeter(false);
      setMeterForm({ meterType: 'electricity', meterSerialNo: '', meterProvider: '', isSmartMeter: false });
    } catch (e: any) { toast.error(e?.data?.message || 'Failed'); }
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
        <div className="drawer-overlay" onClick={() => dispatch(closeDrawer())} />
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
                          ? unitTypes.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)
                          : <option value={editForm.unitType}>{editForm.unitType}</option>}
                      </select>
                    </div>
                  </div>

                  <div className="ef-section-title">Floor & Location</div>
                  <div className="ef-grid">
                    <EditField label="Floor Number" type="number" value={editForm.floorNumber} onChange={(v) => ef('floorNumber', v)} />
                    <EditField label="Floor Label" value={editForm.floorLabel} onChange={(v) => ef('floorLabel', v)} placeholder="e.g. M, G, B1" />
                  </div>

                  <div className="ef-section-title">Dimensions</div>
                  <div className="ef-grid">
                    <EditField label="Area (sqft)" type="number" value={editForm.areaSqft} onChange={(v) => ef('areaSqft', v)} />
                    <EditField label="Area (sqm)" type="number" value={editForm.areaSqm} onChange={(v) => ef('areaSqm', v)} />
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

                  <div className="ef-section-title">Notes</div>
                  <div className="ef-field full-width">
                    <label>Description</label>
                    <textarea rows={2} value={editForm.description} onChange={(e) => ef('description', e.target.value)} />
                  </div>
                  <div className="ef-field full-width">
                    <label>Internal Notes</label>
                    <textarea rows={2} value={editForm.notes} onChange={(e) => ef('notes', e.target.value)} />
                  </div>
                </div>
              ) : (
                /* ── VIEW MODE ── */
                <>
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
                      <InfoItem label="Type"   value={unit.ownershipType} />
                      <InfoItem label="Owner"  value={unit.ownerName || '—'} />
                      <InfoItem label="Contact" value={unit.ownerContact || '—'} />
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

                  {(unit.description || unit.notes) && (
                    <div className="info-section">
                      <h5>Notes</h5>
                      {unit.description && <p className="unit-desc">{unit.description}</p>}
                      {unit.notes && <p className="unit-desc unit-notes">{unit.notes}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ METERS TAB ═══ */}
          {activeTab === 'meters' && (
            <div className="drawer-meters">
              <button className="btn-add-meter" onClick={() => setAddingMeter(!addingMeter)}>
                <Plus size={13} /> Add Meter
              </button>

              {addingMeter && (
                <div className="meter-form">
                  <select value={meterForm.meterType} onChange={(e) => setMeterForm({ ...meterForm, meterType: e.target.value })}>
                    <option value="electricity">Electricity</option>
                    <option value="water">Water</option>
                    <option value="gas">Gas</option>
                    <option value="chilled_water">Chilled Water</option>
                  </select>
                  <input placeholder="Serial No. *" value={meterForm.meterSerialNo}
                    onChange={(e) => setMeterForm({ ...meterForm, meterSerialNo: e.target.value })} />
                  <input placeholder="Provider" value={meterForm.meterProvider}
                    onChange={(e) => setMeterForm({ ...meterForm, meterProvider: e.target.value })} />
                  <div className="form-row">
                    <button className="btn-primary-sm" onClick={handleAddMeter}>Save</button>
                    <button className="btn-ghost-sm" onClick={() => setAddingMeter(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {unit.meters.length === 0
                ? <div className="empty-sm">No meters assigned</div>
                : unit.meters.map((m) => (
                    <div key={m.id} className="meter-card">
                      <div className="meter-icon">{METER_ICONS[m.meterType] || <Activity size={14} />}</div>
                      <div className="meter-info">
                        <div className="meter-type">{m.meterType.replace(/_/g, ' ')}</div>
                        <div className="meter-serial">{m.meterSerialNo}</div>
                        {m.meterProvider && <div className="meter-provider">{m.meterProvider}</div>}
                        {m.lastReading !== null && <div className="meter-reading">{m.lastReading} (last: {m.lastReadingDate})</div>}
                        {m.isSmartMeter && <span className="smart-badge">Smart</span>}
                      </div>
                      <button className="meter-delete" onClick={async () => {
                        try { await deleteMeter({ propertyId, unitId, meterId: m.id }).unwrap(); toast.success('Removed'); }
                        catch { toast.error('Failed'); }
                      }}><Trash2 size={13} /></button>
                    </div>
                  ))
              }
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
          {activeTab === 'history' && (
            <div className="drawer-history">
              {unit.statusHistory.length === 0
                ? <div className="empty-sm">No status history</div>
                : unit.statusHistory.map((h) => (
                    <div key={h.id} className="history-item-sm">
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
                  ))
              }
            </div>
          )}
        </div>
      </div>

      {/* Status change modal */}
      {statusModal && (() => {
        const reasonRequired = ['maintenance', 'not_for_rent'].includes(newStatus);
        const canConfirm = !reasonRequired || statusReason.trim().length > 0;
        return (
          <div className="modal-overlay" onClick={() => setStatusModal(false)}>
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
