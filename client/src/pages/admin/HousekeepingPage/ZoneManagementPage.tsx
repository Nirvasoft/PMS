import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useGetHkZonesQuery, useCreateHkZoneMutation } from '../../../store/api/housekeepingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  MapPin, Plus, Loader2, Inbox, XCircle, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ZONE_TYPES = ['corridor', 'lobby', 'car_park', 'amenity', 'office', 'restroom', 'other'];
const ZONE_ICONS: Record<string, string> = {
  corridor: '🚶', lobby: '🏛️', car_park: '🅿️', amenity: '🏊', office: '🏢', restroom: '🚻', other: '📍',
};
const ZONE_BG: Record<string, string> = {
  corridor: 'rgba(99,102,241,0.10)', lobby: 'rgba(234,179,8,0.10)', car_park: 'rgba(14,165,233,0.10)',
  amenity: 'rgba(16,185,129,0.10)', office: 'rgba(168,85,247,0.10)', restroom: 'rgba(249,115,22,0.10)',
  other: 'rgba(107,114,128,0.10)',
};

export default function ZoneManagementPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [filterProperty, setFilterProperty] = useState('');

  const { data: zonesData, isLoading } = useGetHkZonesQuery({ propertyId: filterProperty || undefined });
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createZone] = useCreateHkZoneMutation();

  const zones = zonesData?.data || [];
  const properties = propsData?.data || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createZone({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        zoneType: fd.get('zoneType') || undefined, floor: fd.get('floor') || undefined,
        areaSqm: parseFloat(fd.get('areaSqm') as string) || undefined,
        notes: fd.get('notes') || undefined,
      }).unwrap();
      toast.success('Zone created');
      setShowCreate(false);
    } catch { toast.error('Failed to create zone'); }
  };

  // Group by property
  const grouped = zones.reduce((acc: Record<string, any[]>, z: any) => {
    const pName = z.property?.name || 'Unknown';
    if (!acc[pName]) acc[pName] = [];
    acc[pName].push(z);
    return acc;
  }, {});

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><MapPin size={22} /></div>
          <div>
            <h1>Zone Management</h1>
            <p>{zones.length} zones across {Object.keys(grouped).length} properties</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Zone
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><MapPin size={18} /></div>
          <span className="msc-value">{zones.length}</span>
          <span className="msc-label">Total Zones</span>
        </div>
        {ZONE_TYPES.slice(0, 4).map(type => {
          const count = zones.filter((z: any) => z.zoneType === type).length;
          return count > 0 ? (
            <div key={type} className="maint-stat-card">
              <div className="msc-icon" style={{ background: ZONE_BG[type] }}>
                <span style={{ fontSize: '16px' }}>{ZONE_ICONS[type]}</span>
              </div>
              <span className="msc-value">{count}</span>
              <span className="msc-label" style={{ textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
            </div>
          ) : null;
        })}
      </div>

      {/* Filter */}
      <div className="maint-toolbar">
        <div className="filter-group">
          <select className="filter-select" value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Zone Cards */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading zones...</div>
      ) : zones.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No zones configured</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Create zones to organize your housekeeping areas
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([propName, propZones]) => (
          <div key={propName} style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Building2 size={13} /> {propName}
            </div>
            <div className="hk-mgmt-grid">
              {(propZones as any[]).map((zone: any) => (
                <div key={zone.id} className="hk-mgmt-card">
                  <div className="hk-mgmt-icon" style={{ background: ZONE_BG[zone.zoneType] || ZONE_BG.other }}>
                    {ZONE_ICONS[zone.zoneType] || '📍'}
                  </div>
                  <div className="hk-mgmt-info">
                    <div className="hk-mgmt-name">{zone.name}</div>
                    <div className="hk-mgmt-tags">
                      {zone.zoneType && (
                        <span className="hk-mgmt-tag" style={{ background: 'rgba(168,85,247,0.1)', color: '#c084fc' }}>
                          {zone.zoneType.replace('_', ' ')}
                        </span>
                      )}
                      {zone.floor && (
                        <span className="hk-mgmt-tag" style={{ background: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)' }}>
                          Floor {zone.floor}
                        </span>
                      )}
                      {zone.areaSqm && (
                        <span className="hk-mgmt-tag" style={{ background: 'rgba(14,165,233,0.08)', color: '#38bdf8' }}>
                          {Number(zone.areaSqm).toLocaleString()} sqm
                        </span>
                      )}
                    </div>
                    {zone.notes && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{zone.notes}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Create Zone Modal */}
      {showCreate && (
        <div className="maint-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="maint-modal" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><MapPin size={18} /></span> New Zone</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div className="form-group">
                  <label>Property *</label>
                  <select name="propertyId" required>
                    <option value="">Select property...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Zone Name *</label>
                  <input name="name" required placeholder="Main Lobby" />
                </div>
                <div className="form-group">
                  <label>Zone Type</label>
                  <select name="zoneType">
                    <option value="">Select type...</option>
                    {ZONE_TYPES.map(t => <option key={t} value={t}>{ZONE_ICONS[t]} {t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group"><label>Floor</label><input name="floor" placeholder="G" /></div>
                  <div className="form-group"><label>Area (sqm)</label><input name="areaSqm" type="number" step="0.01" /></div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea name="notes" rows={2} placeholder="Any notes about this zone..." />
                </div>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><MapPin size={16} /> Create Zone</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
