import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../../store';
import {
  selectUnit, setViewMode, selectTower,
  toggleStatusFilter, setUnitTypeFilter, setSearchQuery, clearFilters,
  setZoomLevel, setBulkCreateOpen,
} from '../../../store/slices/unitsSlice';
import {
  useGetTowersQuery, useGetFloorPlanQuery, useGetUnitsQuery,
  useGetUnitStatsQuery, useDeleteUnitMutation, useCreateUnitMutation, useGetUnitTypesQuery,
} from '../../../store/api/unitsApi';
import type { UnitListItem, Tower } from '../../../store/api/unitsApi';
import { LayoutGrid, List, Grid3x3, Plus, Search, Building2, Zap, Droplets, Wind, X, Layers, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { UnitDetailDrawer } from './UnitDetailDrawer';
import { BulkCreateModal } from './BulkCreateModal';
import { TowerSidebar } from './TowerSidebar';
import './UnitsTab.css';

const STATUS_COLORS: Record<string, string> = {
  available:    '#2ecc71',
  occupied:     '#2196F3',
  reserved:     '#FF9800',
  maintenance:  '#F44336',
  not_for_rent: '#9E9E9E',
};

const ZOOM_CELL: Record<string, { w: number; h: number }> = {
  compact: { w: 36, h: 32 },
  normal:  { w: 56, h: 48 },
  large:   { w: 80, h: 68 },
};

export default function UnitsTab() {
  const { id: propertyId } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const {
    viewMode, selectedTowerId, statusFilter, unitTypeFilter,
    searchQuery, zoomLevel, drawerOpen, selectedUnitId, bulkCreateOpen,
  } = useAppSelector((s) => s.units);

  const { data: towersData } = useGetTowersQuery(propertyId!);
  const { data: statsData } = useGetUnitStatsQuery(propertyId!);
  const towers = towersData?.data || [];
  const stats = statsData?.data;

  // ── Floor plan data ─────────────────────────
  const { data: floorPlanData, isLoading: fpLoading } = useGetFloorPlanQuery({
    propertyId: propertyId!,
    towerId: selectedTowerId || undefined,
  }, { skip: viewMode !== 'floor_plan' });

  // ── List data ───────────────────────────────
  const { data: listData, isLoading: listLoading } = useGetUnitsQuery({
    propertyId: propertyId!,
    towerId: selectedTowerId || undefined,
    status: statusFilter.length === 1 ? statusFilter[0] : undefined,
    unitType: unitTypeFilter || undefined,
    search: searchQuery || undefined,
  }, { skip: viewMode === 'floor_plan' });

  const [deleteUnit] = useDeleteUnitMutation();

  // Filter floor plan client-side for status/type
  const floors = floorPlanData?.data.floors || [];
  const filteredFloors = floors.map((floor) => ({
    ...floor,
    units: floor.units.filter((u) => {
      if (statusFilter.length > 0 && !statusFilter.includes(u.status)) return false;
      if (unitTypeFilter && u.unitType !== unitTypeFilter) return false;
      return true;
    }),
  })).filter((f) => f.units.length > 0 || statusFilter.length === 0);

  const cellSize = ZOOM_CELL[zoomLevel];
  const hasFilters = statusFilter.length > 0 || !!unitTypeFilter || !!searchQuery;

  return (
    <div className="units-tab">
      {/* Stats bar */}
      {stats && (
        <div className="unit-stats-bar">
          <div className="unit-stat available"><span className="stat-n">{stats.available}</span><span>Available</span></div>
          <div className="unit-stat occupied"><span className="stat-n">{stats.occupied}</span><span>Occupied</span></div>
          <div className="unit-stat reserved"><span className="stat-n">{stats.reserved}</span><span>Reserved</span></div>
          <div className="unit-stat maintenance"><span className="stat-n">{stats.maintenance}</span><span>Maintenance</span></div>
          <div className="unit-stat total"><span className="stat-n">{stats.total}</span><span>Total</span></div>
          <div className="unit-stat occupancy"><span className="stat-n">{stats.occupancyRate}%</span><span>Occupancy</span></div>
        </div>
      )}

      <div className="units-layout">
        {/* Tower sidebar */}
        <TowerSidebar
          propertyId={propertyId!}
          towers={towers}
          selectedTowerId={selectedTowerId}
          onSelect={(id) => dispatch(selectTower(id))}
        />

        {/* Main content */}
        <div className="units-main">
          {/* Toolbar */}
          <div className="units-toolbar">
            <div className="toolbar-left">
              {/* Search */}
              <div className="search-box-sm">
                <Search size={13} />
                <input placeholder="Search units..." value={searchQuery}
                  onChange={(e) => dispatch(setSearchQuery(e.target.value))} />
                {searchQuery && <button onClick={() => dispatch(setSearchQuery(''))}><X size={12} /></button>}
              </div>

              {/* Status chips */}
              <div className="status-chips">
                {Object.entries(STATUS_COLORS).map(([status, color]) => (
                  <button
                    key={status}
                    className={`status-chip ${statusFilter.includes(status) ? 'active' : ''}`}
                    style={{ '--chip-color': color } as any}
                    onClick={() => dispatch(toggleStatusFilter(status))}
                  >
                    <span className="chip-dot" />
                    {status.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              {hasFilters && (
                <button className="btn-clear" onClick={() => dispatch(clearFilters())}><X size={12} /> Clear</button>
              )}
            </div>

            <div className="toolbar-right">
              {/* Zoom (only for floor plan) */}
              {viewMode === 'floor_plan' && (
                <div className="zoom-toggle">
                  {(['compact', 'normal', 'large'] as const).map((z) => (
                    <button key={z} className={zoomLevel === z ? 'active' : ''} onClick={() => dispatch(setZoomLevel(z))}>
                      {z[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              )}

              {/* View mode */}
              <div className="view-toggle">
                <button title="Floor Plan" className={viewMode === 'floor_plan' ? 'active' : ''} onClick={() => dispatch(setViewMode('floor_plan'))}><Layers size={15} /></button>
                <button title="List" className={viewMode === 'list' ? 'active' : ''} onClick={() => dispatch(setViewMode('list'))}><List size={15} /></button>
                <button title="Grid" className={viewMode === 'grid' ? 'active' : ''} onClick={() => dispatch(setViewMode('grid'))}><Grid3x3 size={15} /></button>
              </div>

              <button className="btn-bulk" onClick={() => dispatch(setBulkCreateOpen(true))}>
                <Layers size={13} /> Bulk Create
              </button>
              <button className="btn-add-unit" onClick={() => dispatch(selectUnit('new'))}>
                <Plus size={14} /> Add Unit
              </button>
            </div>
          </div>

          {/* Content area */}
          {viewMode === 'floor_plan' && (
            fpLoading ? <div className="units-loading">Loading floor plan…</div> : (
              <div className="floor-plan-view">
                <div className="floor-plan-scroll">
                  {filteredFloors.length === 0 ? (
                    <div className="fp-empty"><Building2 size={36} /><p>No units match the current filters</p></div>
                  ) : filteredFloors.map((floor) => (
                    <div key={floor.floorNumber} className="floor-row">
                      <div className="floor-label">{floor.floorLabel}</div>
                      <div className="floor-cells">
                        {floor.units.map((unit) => (
                          <div
                            key={unit.id}
                            className={`unit-cell ${selectedUnitId === unit.id ? 'selected' : ''}`}
                            style={{
                              width: cellSize.w, height: cellSize.h,
                              background: STATUS_COLORS[unit.status] + '22',
                              borderColor: selectedUnitId === unit.id ? '#6c5ce7' : STATUS_COLORS[unit.status] + '66',
                            }}
                            onClick={() => dispatch(selectUnit(unit.id))}
                            title={`${unit.unitNumber} · ${unit.unitType} · ${unit.status}`}
                          >
                            <div className="cell-dot" style={{ background: STATUS_COLORS[unit.status] }} />
                            <span className="cell-num" style={{ fontSize: zoomLevel === 'compact' ? 9 : zoomLevel === 'large' ? 13 : 11 }}>
                              {unit.unitNumber}
                            </span>
                            {zoomLevel === 'large' && (
                              <span className="cell-type">{unit.unitType}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="fp-legend">
                  {Object.entries(STATUS_COLORS).map(([status, color]) => (
                    <div key={status} className="legend-item">
                      <span className="legend-dot" style={{ background: color }} />
                      <span>{status.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {viewMode === 'list' && (
            <div className="unit-list-view">
              {listLoading ? <div className="units-loading">Loading…</div> : (
                <>
                  <div className="ul-header">
                    <span>Unit No.</span><span>Type</span><span>Floor</span>
                    <span>Area</span><span>Bed/Bath</span><span>Status</span><span>Furnishing</span><span></span>
                  </div>
                  {(listData?.data || []).map((unit) => (
                    <UnitListRow key={unit.id} unit={unit}
                      onClick={() => dispatch(selectUnit(unit.id))}
                      onDelete={async () => {
                        if (!confirm(`Delete unit ${unit.unitNumber}?`)) return;
                        try { await deleteUnit({ propertyId: propertyId!, unitId: unit.id }).unwrap(); toast.success('Deleted'); }
                        catch { toast.error('Cannot delete'); }
                      }} />
                  ))}
                </>
              )}
            </div>
          )}

          {viewMode === 'grid' && (
            <div className="unit-grid-view">
              {listLoading ? <div className="units-loading">Loading…</div> :
                (listData?.data || []).map((unit) => (
                  <UnitGridCard key={unit.id} unit={unit} onClick={() => dispatch(selectUnit(unit.id))} />
                ))
              }
            </div>
          )}
        </div>
      </div>

      {/* Unit Detail Drawer */}
      {drawerOpen && selectedUnitId && selectedUnitId !== 'new' && (
        <UnitDetailDrawer propertyId={propertyId!} unitId={selectedUnitId} />
      )}

      {/* Create Unit Modal */}
      {drawerOpen && selectedUnitId === 'new' && (
        <CreateUnitModal propertyId={propertyId!} towers={towers} />
      )}

      {/* Bulk Create Modal */}
      {bulkCreateOpen && (
        <BulkCreateModal propertyId={propertyId!} towers={towers} />
      )}
    </div>
  );
}

// ── Unit List Row ─────────────────────────────
function UnitListRow({ unit, onClick, onDelete }: { unit: UnitListItem; onClick: () => void; onDelete: () => void }) {
  return (
    <div className="ul-row" onClick={onClick}>
      <div className="ul-unitno">
        <span className="dot" style={{ background: STATUS_COLORS[unit.status] }} />
        {unit.unitNumber}
        {unit.tower && <span className="ul-tower">{unit.tower.name}</span>}
      </div>
      <span className="capitalize">{unit.unitType.replace(/_/g, ' ')}</span>
      <span>{unit.floorLabel ?? unit.floorNumber ?? '—'}</span>
      <span>{unit.areaSqft ? `${unit.areaSqft} sqft` : '—'}</span>
      <span>{unit.bedroomCount}bd / {unit.bathroomCount}ba</span>
      <span className="ul-status" style={{ color: STATUS_COLORS[unit.status] }}>{unit.status.replace(/_/g, ' ')}</span>
      <span className="capitalize">{unit.furnishing}</span>
      <button className="ul-delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</button>
    </div>
  );
}

// ── Unit Grid Card ────────────────────────────
function UnitGridCard({ unit, onClick }: { unit: UnitListItem; onClick: () => void }) {
  return (
    <div className="ug-card" onClick={onClick}>
      <div className="ug-header" style={{ borderTopColor: STATUS_COLORS[unit.status] }}>
        <span className="ug-num">{unit.unitNumber}</span>
        <span className="ug-status-dot" style={{ background: STATUS_COLORS[unit.status] }} />
      </div>
      <div className="ug-body">
        <div className="ug-type">{unit.unitType.replace(/_/g, ' ')}</div>
        <div className="ug-meta">
          {unit.floorNumber !== null && <span>Floor {unit.floorLabel ?? unit.floorNumber}</span>}
          {unit.areaSqft && <span>{unit.areaSqft} sqft</span>}
          {unit.bedroomCount > 0 && <span>{unit.bedroomCount}bd</span>}
        </div>
        <div className="ug-meters">
          {unit.meters.map((m) => (
            <span key={m.meterType} title={m.meterType} className="meter-icon">
              {m.meterType === 'electricity' ? <Zap size={11} /> : m.meterType === 'water' ? <Droplets size={11} /> : <Wind size={11} />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Create Unit Modal ─────────────────────────
function CreateUnitModal({ propertyId, towers }: { propertyId: string; towers: Tower[] }) {
  const dispatch = useAppDispatch();
  const close = () => dispatch(selectUnit(null as any));

  const [form, setForm] = useState({
    unitNumber: '', unitType: '', towerId: '', sectionId: '',
    floorNumber: '', floorLabel: '', areaSqft: '', areaSqm: '',
    bedroomCount: '0', bathroomCount: '0',
    direction: '', furnishing: 'unfurnished', ownershipType: 'company',
    description: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: typesData } = useGetUnitTypesQuery();
  const [createUnit, { isLoading }] = useCreateUnitMutation();

  const unitTypes = typesData?.data || [];
  const selectedTower = towers.find(t => t.id === form.towerId);
  const sections = selectedTower?.sections || [];

  const handleSubmit = async () => {
    if (!form.unitNumber.trim() || !form.unitType) {
      toast.error('Unit number and type are required');
      return;
    }
    try {
      const data: Record<string, unknown> = {
        unitNumber: form.unitNumber.trim(),
        unitType: form.unitType,
        towerId:      form.towerId     || undefined,
        sectionId:    form.sectionId   || undefined,
        floorNumber:  form.floorNumber ? Number(form.floorNumber) : undefined,
        floorLabel:   form.floorLabel  || undefined,
        areaSqft:     form.areaSqft    ? Number(form.areaSqft)    : undefined,
        areaSqm:      form.areaSqm     ? Number(form.areaSqm)     : undefined,
        bedroomCount: Number(form.bedroomCount) || 0,
        bathroomCount: Number(form.bathroomCount) || 0,
        direction:    form.direction   || undefined,
        furnishing:   form.furnishing,
        ownershipType: form.ownershipType,
        description:  form.description || undefined,
      };
      await createUnit({ propertyId, data: data as any }).unwrap();
      toast.success(`Unit ${form.unitNumber} created`);
      close();
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to create unit');
    }
  };

  return (
    <div className="cu-overlay" onClick={close}>
      <div className="cu-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cu-header">
          <h3>Add New Unit</h3>
          <button onClick={close}><X size={18} /></button>
        </div>

        {/* Form */}
        <div className="cu-body">
          {/* Row 1 */}
          <div className="cu-grid">
            <div className="cu-field">
              <label>Unit Number *</label>
              <input placeholder="e.g. A-101" value={form.unitNumber} onChange={e => set('unitNumber', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Unit Type *</label>
              <select value={form.unitType} onChange={e => set('unitType', e.target.value)}>
                <option value="">Select type…</option>
                {unitTypes.length > 0
                  ? unitTypes.map(t => <option key={t.id} value={t.code}>{t.name}</option>)
                  : ['studio','one_bedroom','two_bedroom','three_bedroom','penthouse','shop','office','warehouse'].map(t =>
                      <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>

          {/* Tower & Section */}
          {towers.length > 0 && (
            <div className="cu-grid">
              <div className="cu-field">
                <label>Tower <span className="cu-opt">(optional)</span></label>
                <select value={form.towerId} onChange={e => { set('towerId', e.target.value); set('sectionId', ''); }}>
                  <option value="">No tower</option>
                  {towers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {sections.length > 0 && (
                <div className="cu-field">
                  <label>Section</label>
                  <select value={form.sectionId} onChange={e => set('sectionId', e.target.value)}>
                    <option value="">No section</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Floor */}
          <div className="cu-grid">
            <div className="cu-field">
              <label>Floor Number</label>
              <input type="number" placeholder="e.g. 10" value={form.floorNumber} onChange={e => set('floorNumber', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Floor Label</label>
              <input placeholder="e.g. 10F" value={form.floorLabel} onChange={e => set('floorLabel', e.target.value)} />
            </div>
          </div>

          {/* Area */}
          <div className="cu-grid">
            <div className="cu-field">
              <label>Area (sqft)</label>
              <input type="number" min={0} placeholder="e.g. 850" value={form.areaSqft} onChange={e => set('areaSqft', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Area (sqm)</label>
              <input type="number" min={0} placeholder="e.g. 79" value={form.areaSqm} onChange={e => set('areaSqm', e.target.value)} />
            </div>
          </div>

          {/* Bed/Bath */}
          <div className="cu-grid">
            <div className="cu-field">
              <label>Bedrooms</label>
              <input type="number" min={0} value={form.bedroomCount} onChange={e => set('bedroomCount', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Bathrooms</label>
              <input type="number" min={0} value={form.bathroomCount} onChange={e => set('bathroomCount', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Furnishing</label>
              <select value={form.furnishing} onChange={e => set('furnishing', e.target.value)}>
                <option value="unfurnished">Unfurnished</option>
                <option value="semi_furnished">Semi-Furnished</option>
                <option value="fully_furnished">Fully Furnished</option>
              </select>
            </div>
            <div className="cu-field">
              <label>Ownership Type</label>
              <select value={form.ownershipType} onChange={e => set('ownershipType', e.target.value)}>
                <option value="company">Company Owned</option>
                <option value="individual">Individual</option>
                <option value="strata">Strata Title</option>
              </select>
            </div>
          </div>

          <div className="cu-field cu-full">
            <label>Description <span className="cu-opt">(optional)</span></label>
            <textarea rows={2} placeholder="Any notes about this unit…" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="cu-footer">
          <button className="cu-btn-cancel" onClick={close}>Cancel</button>
          <button className="cu-btn-submit" onClick={handleSubmit} disabled={isLoading || !form.unitNumber.trim() || !form.unitType}>
            {isLoading ? 'Creating…' : '+ Add Unit'}
          </button>
        </div>
      </div>
    </div>
  );
}
