import { useState } from 'react';
import { useAppDispatch } from '../../../store';
import { closeDrawer } from '../../../store/slices/unitsSlice';
import {
  useGetUnitQuery, useUpdateUnitStatusMutation, useAddMeterMutation,
  useDeleteMeterMutation, useSetAmenitiesMutation,
} from '../../../store/api/unitsApi';
import {
  X, Zap, Droplets, Wind, Star, ChevronRight, Settings2,
  Activity, Clock, Thermometer, Plus, Trash2,
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

type DrawerTab = 'info' | 'meters' | 'history';

export function UnitDetailDrawer({ propertyId, unitId }: { propertyId: string; unitId: string }) {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<DrawerTab>('info');
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [addingMeter, setAddingMeter] = useState(false);
  const [meterForm, setMeterForm] = useState({ meterType: 'electricity', meterSerialNo: '', meterProvider: '', isSmartMeter: false });

  const { data, isLoading } = useGetUnitQuery({ propertyId, unitId });
  const unit = data?.data;

  const [updateStatus] = useUpdateUnitStatusMutation();
  const [addMeter] = useAddMeterMutation();
  const [deleteMeter] = useDeleteMeterMutation();
  const [setAmenities] = useSetAmenitiesMutation();

  const handleStatusChange = async () => {
    try {
      await updateStatus({ propertyId, unitId, status: newStatus, reason: statusReason || undefined }).unwrap();
      toast.success('Status updated');
      setStatusModal(false);
      setStatusReason('');
    } catch { toast.error('Failed to update status'); }
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

  if (isLoading || !unit) return (
    <div className="unit-drawer loading">
      <div className="drawer-spinner" />
    </div>
  );

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
          {(['info', 'meters', 'history'] as DrawerTab[]).map((t) => (
            <button key={t} className={activeTab === t ? 'active' : ''} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="drawer-content">
          {activeTab === 'info' && (
            <div className="drawer-info">
              <div className="info-section">
                <h5>Dimensions</h5>
                <div className="info-grid">
                  <InfoItem label="Area (sqft)" value={unit.areaSqft ? `${unit.areaSqft}` : '—'} />
                  <InfoItem label="Area (sqm)"  value={unit.areaSqm  ? `${unit.areaSqm}` : '—'} />
                  <InfoItem label="Bedrooms"    value={String(unit.bedroomCount)} />
                  <InfoItem label="Bathrooms"   value={String(unit.bathroomCount)} />
                  <InfoItem label="Direction"   value={unit.direction || '—'} />
                  <InfoItem label="Furnishing"  value={unit.furnishing} />
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

              {unit.amenities.length > 0 && (
                <div className="info-section">
                  <h5>Amenities</h5>
                  <div className="amenity-tags">
                    {unit.amenities.map((a) => (
                      <span key={a.amenity} className="amenity-tag">{a.amenity.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>
              )}

              {unit.description && (
                <div className="info-section">
                  <h5>Description</h5>
                  <p className="unit-desc">{unit.description}</p>
                </div>
              )}
            </div>
          )}

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
      {statusModal && (
        <div className="modal-overlay" onClick={() => setStatusModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Status</h3>
              <button onClick={() => setStatusModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p>→ <strong style={{ color: STATUS_COLORS[newStatus] }}>{newStatus.replace(/_/g, ' ')}</strong></p>
              <label>Reason (optional)</label>
              <textarea rows={3} placeholder="Reason for change..." value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setStatusModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleStatusChange}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      <span className="info-value capitalize">{value}</span>
    </div>
  );
}
