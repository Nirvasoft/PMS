import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useGetHkZonesQuery, useCreateHkZoneMutation } from '../../../store/api/housekeepingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  MapPin, Plus, Loader2, Inbox, XCircle, Building2,
  Search, Filter, Layers, Ruler, StickyNote, Map,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ZONE_TYPES = ['corridor', 'lobby', 'car_park', 'amenity', 'office', 'restroom', 'other'];
const ZONE_META: Record<string, { emoji: string; color: string; bg: string }> = {
  corridor: { emoji: '🚶', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  lobby:    { emoji: '🏛️', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  car_park: { emoji: '🅿️', color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)' },
  amenity:  { emoji: '🏊', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  office:   { emoji: '🏢', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  restroom: { emoji: '🚻', color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
  other:    { emoji: '📍', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
};

export default function ZoneManagementPage() {
  const [showCreate, setShowCreate] = useState(false);
  const filterProperty = useSelectedPropertyFilter();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');

  const { data: zonesData, isLoading } = useGetHkZonesQuery({ propertyId: filterProperty || undefined });
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createZone, { isLoading: creating }] = useCreateHkZoneMutation();

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

  // Filter & search
  const filtered = zones.filter((z: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!z.name?.toLowerCase().includes(q) && !z.notes?.toLowerCase().includes(q)) return false;
    }
    if (filterType && z.zoneType !== filterType) return false;
    return true;
  });

  // Group by property
  const grouped = filtered.reduce((acc: Record<string, { name: string; zones: any[] }>, z: any) => {
    const pId = z.propertyId || 'unknown';
    const pName = z.property?.name || 'Unknown';
    if (!acc[pId]) acc[pId] = { name: pName, zones: [] };
    acc[pId].zones.push(z);
    return acc;
  }, {});

  // Zone type counts
  const typeCounts = zones.reduce((acc: Record<string, number>, z: any) => {
    const t = z.zoneType || 'other';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const totalArea = zones.reduce((s: number, z: any) => s + (Number(z.areaSqm) || 0), 0);

  return (
    <div className="maint-page">
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', margin: 0,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Map size={18} color="#fff" />
            </div>
            Zone Management
          </h1>
          <p style={{ margin: '4px 0 0 46px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {zones.length} zone{zones.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} propert{Object.keys(grouped).length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ borderRadius: 10 }}>
          <Plus size={14} /> New Zone
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        <div style={{
          borderRadius: 14, padding: '14px 16px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03))',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={13} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Zones</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6366f1' }}>{zones.length}</div>
        </div>

        {Object.entries(typeCounts).slice(0, 4).map(([type, count]) => {
          const meta = ZONE_META[type] || ZONE_META.other;
          return (
            <div key={type} style={{
              borderRadius: 14, padding: '14px 16px', overflow: 'hidden',
              background: `linear-gradient(135deg, ${meta.bg}, transparent)`,
              border: `1px solid ${meta.color}20`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{meta.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  {type.replace('_', ' ')}
                </span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: meta.color }}>{count}</div>
            </div>
          );
        })}

        {totalArea > 0 && (
          <div style={{
            borderRadius: 14, padding: '14px 16px', overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent)',
            border: '1px solid rgba(16,185,129,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ruler size={13} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Area</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{totalArea.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 600 }}>sqm</span></div>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search zones..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-tertiary)' }} />
          {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
          <select className="filter-select" value={filterProperty} disabled
            style={{ borderRadius: 10, fontSize: 12, padding: '7px 28px 7px 10px' }}>
            {filterProperty && (
              <option value={filterProperty}>{properties.find((p: any) => p.id === filterProperty)?.name || ''}</option>
            )}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers size={13} style={{ color: 'var(--text-tertiary)' }} />
          <select className="filter-select" value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ borderRadius: 10, fontSize: 12, padding: '7px 28px 7px 10px' }}>
            <option value="">All Types</option>
            {ZONE_TYPES.map(t => <option key={t} value={t}>{ZONE_META[t]?.emoji} {t.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {/* ── Zone Cards ── */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading zones...</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(107,114,128,0.08)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Map size={28} /></div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {searchTerm || filterType ? 'No zones match your filters' : 'No zones configured'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {searchTerm || filterType ? 'Try adjusting your search' : 'Create zones to organize cleaning areas'}
          </span>
        </div>
      ) : (
        Object.entries(grouped).map(([propId, group]) => (
          <div key={propId} style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              padding: '8px 14px', borderRadius: 10, background: 'var(--surface-hover)',
            }}>
              <Building2 size={14} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                {(group as any).name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                {(group as any).zones.length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {((group as any).zones as any[]).map((zone: any) => {
                const meta = ZONE_META[zone.zoneType] || ZONE_META.other;
                return (
                  <div key={zone.id} style={{
                    borderRadius: 14, padding: '16px 18px',
                    background: meta.bg, border: `1px solid ${meta.color}18`,
                    transition: 'all 0.2s', cursor: 'default',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: `${meta.color}14`, border: `1px solid ${meta.color}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                      }}>
                        {meta.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {zone.name}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          {zone.zoneType && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: `${meta.color}12`, color: meta.color, textTransform: 'capitalize' }}>
                              {zone.zoneType.replace('_', ' ')}
                            </span>
                          )}
                          {zone.floor && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)' }}>
                              Floor {zone.floor}
                            </span>
                          )}
                          {zone.areaSqm && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(14,165,233,0.08)', color: '#38bdf8' }}>
                              {Number(zone.areaSqm).toLocaleString()} sqm
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {zone.notes && (
                      <div style={{
                        fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4,
                        padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.03)',
                        display: 'flex', alignItems: 'flex-start', gap: 6,
                      }}>
                        <StickyNote size={10} style={{ marginTop: 2, flexShrink: 0, opacity: 0.5 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>
                          {zone.notes}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '480px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={16} color="#fff" />
                </div>
                New Zone
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}><XCircle size={20} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div className="form-group"><label>Property *</label>
                  <select name="propertyId" required style={{ borderRadius: 10 }}>
                    <option value="">Select property...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Zone Name *</label>
                  <input name="name" required placeholder="e.g. Main Lobby" style={{ borderRadius: 10 }} />
                </div>
                <div className="form-group"><label>Zone Type</label>
                  <select name="zoneType" style={{ borderRadius: 10 }}>
                    <option value="">Select type...</option>
                    {ZONE_TYPES.map(t => <option key={t} value={t}>{ZONE_META[t]?.emoji} {t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Floor</label><input name="floor" placeholder="G" style={{ borderRadius: 10 }} /></div>
                  <div className="form-group"><label>Area (sqm)</label><input name="areaSqm" type="number" step="0.01" style={{ borderRadius: 10 }} /></div>
                </div>
                <div className="form-group"><label>Notes</label>
                  <textarea name="notes" rows={2} placeholder="Any notes about this zone..." style={{ borderRadius: 10 }} />
                </div>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ borderRadius: 10 }}>
                  {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Create Zone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
