import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../../store';
import {
  selectUnit, setViewMode, selectTower,
  toggleStatusFilter, setSearchQuery, clearFilters,
  setZoomLevel, setBulkCreateOpen,
} from '../../../store/slices/unitsSlice';
import {
  useGetTowersQuery, useGetFloorPlanQuery, useGetUnitsQuery,
  useGetUnitStatsQuery, useDeleteUnitMutation, useCreateUnitMutation, useGetUnitTypesQuery,
} from '../../../store/api/unitsApi';
import type { UnitListItem, Tower } from '../../../store/api/unitsApi';
import {
  LayoutGrid, List, Layers, Plus, Search, Building2,
  Zap, Droplets, Wind, X, Grid3x3, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { UnitDetailDrawer } from './UnitDetailDrawer';
import { BulkCreateModal } from './BulkCreateModal';
import { TowerSidebar } from './TowerSidebar';
import './UnitsTab.css';

/* ── Status config (single source of truth) ── */
const STATUSES = [
  { key: 'available',    label: 'Available',    color: '#10b981' },
  { key: 'occupied',     label: 'Occupied',     color: '#3b82f6' },
  { key: 'reserved',     label: 'Reserved',     color: '#f59e0b' },
  { key: 'maintenance',  label: 'Maintenance',  color: '#ef4444' },
  { key: 'not_for_rent', label: 'Not for Rent', color: '#6b7280' },
] as const;

const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.key, s.color])
);

const ZOOM_CELL: Record<string, { w: number; h: number }> = {
  compact: { w: 36, h: 30 },
  normal:  { w: 54, h: 46 },
  large:   { w: 78, h: 66 },
};

/* ════════════════════════════════════════════
   Main Tab
   ════════════════════════════════════════════ */
export default function UnitsTab() {
  const { id: propertyId } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const {
    viewMode, selectedTowerId, statusFilter,
    searchQuery, zoomLevel, drawerOpen, selectedUnitId, bulkCreateOpen,
  } = useAppSelector((s) => s.units);

  const { data: towersData } = useGetTowersQuery(propertyId!);
  const { data: statsData }  = useGetUnitStatsQuery(propertyId!);
  const towers = towersData?.data || [];
  const stats  = statsData?.data;

  /* floor-plan data */
  const { data: floorPlanData, isLoading: fpLoading } = useGetFloorPlanQuery(
    { propertyId: propertyId!, towerId: selectedTowerId || undefined },
    { skip: viewMode !== 'floor_plan' }
  );

  /* list / grid data */
  const { data: listData, isLoading: listLoading } = useGetUnitsQuery(
    {
      propertyId: propertyId!,
      towerId: selectedTowerId || undefined,
      status: statusFilter.length === 1 ? statusFilter[0] : undefined,
      search: searchQuery || undefined,
    },
    { skip: viewMode === 'floor_plan' }
  );

  const [deleteUnit] = useDeleteUnitMutation();

  /* filtered floor plan */
  const floors = floorPlanData?.data.floors || [];
  const filteredFloors = floors
    .map((floor) => ({
      ...floor,
      units: floor.units.filter((u) =>
        statusFilter.length === 0 || statusFilter.includes(u.status)
      ),
    }))
    .filter((f) => f.units.length > 0 || statusFilter.length === 0);

  const cellSize = ZOOM_CELL[zoomLevel];
  const hasFilters = statusFilter.length > 0 || !!searchQuery;

  return (
    <div className="units-tab">

      {/* ── Toolbar ─────────────────────────────── */}
      <div className="ut-toolbar">
        {/* Row 1: search + actions */}
        <div className="ut-row ut-row-top">
          {/* Search */}
          <div className="ut-search">
            <Search size={13} className="ut-search-icon" />
            <input
              placeholder="Search units…"
              value={searchQuery}
              onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            />
            {searchQuery && (
              <button className="ut-clear-x" onClick={() => dispatch(setSearchQuery(''))}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* Stats pills — replace the old separate stats bar */}
          {stats && (
            <div className="ut-stat-pills">
              {STATUSES.map((s) => {
                const count = (stats as any)[s.key] ?? 0;
                const isActive = statusFilter.includes(s.key);
                return (
                  <button
                    key={s.key}
                    className={`ut-stat-pill ${isActive ? 'active' : ''}`}
                    style={{ '--sc': s.color } as React.CSSProperties}
                    onClick={() => dispatch(toggleStatusFilter(s.key))}
                    title={`Filter: ${s.label}`}
                  >
                    <span className="usp-dot" />
                    <span className="usp-count">{count}</span>
                    <span className="usp-label">{s.label}</span>
                  </button>
                );
              })}
              {/* Occupancy rate pill */}
              <div className="ut-stat-pill ut-occ-pill">
                <span className="usp-count">{stats.occupancyRate}%</span>
                <span className="usp-label">Occupancy</span>
              </div>
              {hasFilters && (
                <button className="ut-clear-all" onClick={() => dispatch(clearFilters())}>
                  <X size={10} /> Clear
                </button>
              )}
            </div>
          )}

          {/* Right-side controls */}
          <div className="ut-actions">
            {/* Zoom (floor plan only) */}
            {viewMode === 'floor_plan' && (
              <div className="ut-zoom">
                {(['compact', 'normal', 'large'] as const).map((z) => (
                  <button
                    key={z}
                    className={zoomLevel === z ? 'active' : ''}
                    onClick={() => dispatch(setZoomLevel(z))}
                    title={z}
                  >
                    {z === 'compact' ? 'S' : z === 'normal' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            )}

            {/* View mode toggle */}
            <div className="ut-view-toggle">
              <button
                title="Floor Plan"
                className={viewMode === 'floor_plan' ? 'active' : ''}
                onClick={() => dispatch(setViewMode('floor_plan'))}
              ><Layers size={14} /></button>
              <button
                title="List"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => dispatch(setViewMode('list'))}
              ><List size={14} /></button>
              <button
                title="Grid"
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => dispatch(setViewMode('grid'))}
              ><Grid3x3 size={14} /></button>
            </div>

            <button className="ut-btn-bulk" onClick={() => dispatch(setBulkCreateOpen(true))}>
              <Layers size={13} /> Bulk Create
            </button>
            <button className="ut-btn-add" onClick={() => dispatch(selectUnit('new'))}>
              <Plus size={14} /> Add Unit
            </button>
          </div>
        </div>
      </div>

      {/* ── Layout: Sidebar + Content ─────────── */}
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

          {/* ── Floor Plan ── */}
          {viewMode === 'floor_plan' && (
            fpLoading
              ? <div className="units-loading"><Building2 size={24} /><span>Loading floor plan…</span></div>
              : <div className="floor-plan-view">
                  <div className="floor-plan-scroll">
                    {filteredFloors.length === 0
                      ? <EmptyState message={hasFilters ? 'No units match the current filters' : 'No units yet — click Add Unit to get started'} />
                      : filteredFloors.map((floor) => (
                          <div key={floor.floorNumber} className="floor-row">
                            <div className="floor-label">{floor.floorLabel ?? `Floor ${floor.floorNumber}`}</div>
                            <div className="floor-cells">
                              {floor.units.map((unit) => (
                                <div
                                  key={unit.id}
                                  className={`unit-cell ${selectedUnitId === unit.id ? 'selected' : ''}`}
                                  style={{
                                    width: cellSize.w,
                                    height: cellSize.h,
                                    background: STATUS_COLOR[unit.status] + '1a',
                                    borderColor: selectedUnitId === unit.id
                                      ? '#6c5ce7'
                                      : STATUS_COLOR[unit.status] + '55',
                                  }}
                                  onClick={() => dispatch(selectUnit(unit.id))}
                                  title={`${unit.unitNumber} · ${unit.unitType} · ${unit.status}`}
                                >
                                  <div className="cell-dot" style={{ background: STATUS_COLOR[unit.status] }} />
                                  <span
                                    className="cell-num"
                                    style={{ fontSize: zoomLevel === 'compact' ? 8 : zoomLevel === 'large' ? 12 : 10 }}
                                  >
                                    {unit.unitNumber}
                                  </span>
                                  {zoomLevel === 'large' && (
                                    <span className="cell-type">{unit.unitType}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                    }
                  </div>
                </div>
          )}

          {/* ── List View ── */}
          {viewMode === 'list' && (
            <div className="unit-list-view">
              {listLoading
                ? <div className="units-loading"><Building2 size={24} /><span>Loading…</span></div>
                : <>
                    <div className="ul-header">
                      <span>Unit No.</span>
                      <span>Type</span>
                      <span>Floor</span>
                      <span>Area</span>
                      <span>Bed / Bath</span>
                      <span>Status</span>
                      <span>Furnishing</span>
                      <span />
                    </div>
                    {(listData?.data || []).length === 0
                      ? <EmptyState message={hasFilters ? 'No units match the current filters' : 'No units yet'} />
                      : (listData?.data || []).map((unit) => (
                          <UnitListRow
                            key={unit.id}
                            unit={unit}
                            onClick={() => dispatch(selectUnit(unit.id))}
                            onDelete={async () => {
                              if (!confirm(`Delete unit ${unit.unitNumber}?`)) return;
                              try {
                                await deleteUnit({ propertyId: propertyId!, unitId: unit.id }).unwrap();
                                toast.success('Deleted');
                              } catch { toast.error('Cannot delete'); }
                            }}
                          />
                        ))
                    }
                  </>
              }
            </div>
          )}

          {/* ── Grid View ── */}
          {viewMode === 'grid' && (
            <div className="unit-grid-view">
              {listLoading
                ? <div className="units-loading"><Building2 size={24} /><span>Loading…</span></div>
                : (listData?.data || []).length === 0
                  ? <EmptyState message={hasFilters ? 'No units match the current filters' : 'No units yet'} />
                  : (listData?.data || []).map((unit) => (
                      <UnitGridCard key={unit.id} unit={unit} onClick={() => dispatch(selectUnit(unit.id))} />
                    ))
              }
            </div>
          )}

        </div>
      </div>

      {/* Drawers / Modals */}
      {drawerOpen && selectedUnitId && selectedUnitId !== 'new' && (
        <UnitDetailDrawer propertyId={propertyId!} unitId={selectedUnitId} />
      )}
      {drawerOpen && selectedUnitId === 'new' && (
        <CreateUnitModal propertyId={propertyId!} towers={towers} />
      )}
      {bulkCreateOpen && (
        <BulkCreateModal propertyId={propertyId!} towers={towers} />
      )}
    </div>
  );
}

/* ── Empty State ──────────────────────────── */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="units-empty">
      <Building2 size={40} />
      <p>{message}</p>
    </div>
  );
}

/* ── Unit List Row ─────────────────────────── */
function UnitListRow({ unit, onClick, onDelete }: {
  unit: UnitListItem; onClick: () => void; onDelete: () => void;
}) {
  return (
    <div className="ul-row" onClick={onClick}>
      <div className="ul-unitno">
        <span className="ul-dot" style={{ background: STATUS_COLOR[unit.status] }} />
        <span>{unit.unitNumber}</span>
        {unit.tower && <span className="ul-tower-tag">{unit.tower.name}</span>}
      </div>
      <span className="capitalize">{unit.unitType.replace(/_/g, ' ')}</span>
      <span>{unit.floorLabel ?? (unit.floorNumber != null ? `${unit.floorNumber}F` : '—')}</span>
      <span>{unit.areaSqft ? `${unit.areaSqft} ft²` : '—'}</span>
      <span>{unit.bedroomCount}bd · {unit.bathroomCount}ba</span>
      <span className="ul-status" style={{ color: STATUS_COLOR[unit.status] }}>
        <span className="ul-sdot" style={{ background: STATUS_COLOR[unit.status] }} />
        {unit.status.replace(/_/g, ' ')}
      </span>
      <span className="capitalize ul-furn">{unit.furnishing.replace(/_/g, ' ')}</span>
      <button className="ul-del" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete unit">
        <X size={13} />
      </button>
    </div>
  );
}

/* ── Unit Grid Card ───────────────────────── */
function UnitGridCard({ unit, onClick }: { unit: UnitListItem; onClick: () => void }) {
  const color = STATUS_COLOR[unit.status];
  return (
    <div className="ug-card" onClick={onClick}>
      <div className="ug-top-bar" style={{ background: color }} />
      <div className="ug-card-inner">
        <div className="ug-card-head">
          <span className="ug-num">{unit.unitNumber}</span>
          <span className="ug-status-label" style={{ color, background: color + '18' }}>
            {unit.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="ug-type">{unit.unitType.replace(/_/g, ' ')}</div>
        <div className="ug-meta">
          {unit.floorNumber != null && (
            <span>
              <ChevronRight size={10} />
              {unit.floorLabel ?? `${unit.floorNumber}F`}
            </span>
          )}
          {unit.areaSqft && <span>{unit.areaSqft} ft²</span>}
          {unit.bedroomCount > 0 && <span>{unit.bedroomCount}bd / {unit.bathroomCount}ba</span>}
        </div>
        {unit.meters.length > 0 && (
          <div className="ug-meters">
            {unit.meters.map((m) => (
              <span key={m.meterType} className="meter-chip" title={m.meterType}>
                {m.meterType === 'electricity' ? <Zap size={10} />
                  : m.meterType === 'water' ? <Droplets size={10} />
                  : <Wind size={10} />}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Create Unit Modal ────────────────────── */
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

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const { data: typesData } = useGetUnitTypesQuery();
  const [createUnit, { isLoading }] = useCreateUnitMutation();
  const unitTypes = typesData?.data || [];
  const selectedTower = towers.find((t) => t.id === form.towerId);
  const sections = selectedTower?.sections || [];

  const handleSubmit = async () => {
    if (!form.unitNumber.trim() || !form.unitType) {
      toast.error('Unit number and type are required');
      return;
    }
    try {
      await createUnit({
        propertyId,
        data: {
          unitNumber:    form.unitNumber.trim(),
          unitType:      form.unitType,
          towerId:       form.towerId     || undefined,
          sectionId:     form.sectionId   || undefined,
          floorNumber:   form.floorNumber ? Number(form.floorNumber) : undefined,
          floorLabel:    form.floorLabel  || undefined,
          areaSqft:      form.areaSqft    ? Number(form.areaSqft)    : undefined,
          areaSqm:       form.areaSqm     ? Number(form.areaSqm)     : undefined,
          bedroomCount:  Number(form.bedroomCount) || 0,
          bathroomCount: Number(form.bathroomCount) || 0,
          direction:     form.direction   || undefined,
          furnishing:    form.furnishing,
          ownershipType: form.ownershipType,
          description:   form.description || undefined,
        } as any,
      }).unwrap();
      toast.success(`Unit ${form.unitNumber} created`);
      close();
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to create unit');
    }
  };

  return (
    <div className="cu-overlay" onClick={close}>
      <div className="cu-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cu-header">
          <div>
            <h3>Add New Unit</h3>
            <p className="cu-subtitle">Fill in the details for the new unit</p>
          </div>
          <button className="cu-close" onClick={close}><X size={18} /></button>
        </div>

        <div className="cu-body">
          {/* Unit Number + Type */}
          <div className="cu-section-title">Unit Identity</div>
          <div className="cu-grid">
            <div className="cu-field">
              <label>Unit Number *</label>
              <input placeholder="e.g. A-101" value={form.unitNumber} onChange={(e) => set('unitNumber', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Unit Type *</label>
              <select value={form.unitType} onChange={(e) => set('unitType', e.target.value)}>
                <option value="">Select type…</option>
                {unitTypes.length > 0
                  ? unitTypes.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)
                  : ['studio','one_bedroom','two_bedroom','three_bedroom','penthouse','shop','office','warehouse'].map((t) =>
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          {/* Tower & Section */}
          {towers.length > 0 && (
            <>
              <div className="cu-section-title">Location</div>
              <div className="cu-grid">
                <div className="cu-field">
                  <label>Tower <span className="cu-opt">(optional)</span></label>
                  <select value={form.towerId} onChange={(e) => { set('towerId', e.target.value); set('sectionId', ''); }}>
                    <option value="">No tower</option>
                    {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {sections.length > 0 && (
                  <div className="cu-field">
                    <label>Section</label>
                    <select value={form.sectionId} onChange={(e) => set('sectionId', e.target.value)}>
                      <option value="">No section</option>
                      {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Floor */}
          <div className="cu-section-title">Floor</div>
          <div className="cu-grid">
            <div className="cu-field">
              <label>Floor Number</label>
              <input type="number" placeholder="e.g. 10" value={form.floorNumber} onChange={(e) => set('floorNumber', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Floor Label <span className="cu-opt">(optional)</span></label>
              <input placeholder="e.g. 10F, Mezzanine" value={form.floorLabel} onChange={(e) => set('floorLabel', e.target.value)} />
            </div>
          </div>

          {/* Area */}
          <div className="cu-section-title">Size</div>
          <div className="cu-grid">
            <div className="cu-field">
              <label>Area (sqft)</label>
              <input type="number" min={0} placeholder="e.g. 850" value={form.areaSqft} onChange={(e) => set('areaSqft', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Area (sqm)</label>
              <input type="number" min={0} placeholder="e.g. 79" value={form.areaSqm} onChange={(e) => set('areaSqm', e.target.value)} />
            </div>
          </div>

          {/* Bed/Bath/Furnishing/Ownership */}
          <div className="cu-section-title">Details</div>
          <div className="cu-grid cu-grid-4">
            <div className="cu-field">
              <label>Bedrooms</label>
              <input type="number" min={0} value={form.bedroomCount} onChange={(e) => set('bedroomCount', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Bathrooms</label>
              <input type="number" min={0} value={form.bathroomCount} onChange={(e) => set('bathroomCount', e.target.value)} />
            </div>
            <div className="cu-field">
              <label>Furnishing</label>
              <select value={form.furnishing} onChange={(e) => set('furnishing', e.target.value)}>
                <option value="unfurnished">Unfurnished</option>
                <option value="semi_furnished">Semi-Furnished</option>
                <option value="fully_furnished">Fully Furnished</option>
              </select>
            </div>
            <div className="cu-field">
              <label>Ownership</label>
              <select value={form.ownershipType} onChange={(e) => set('ownershipType', e.target.value)}>
                <option value="company">Company</option>
                <option value="individual">Individual</option>
                <option value="strata">Strata Title</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="cu-field">
            <label>Notes <span className="cu-opt">(optional)</span></label>
            <textarea rows={2} placeholder="Any notes about this unit…" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </div>

        <div className="cu-footer">
          <button className="cu-btn-cancel" onClick={close}>Cancel</button>
          <button
            className="cu-btn-submit"
            onClick={handleSubmit}
            disabled={isLoading || !form.unitNumber.trim() || !form.unitType}
          >
            {isLoading ? 'Creating…' : '+ Add Unit'}
          </button>
        </div>
      </div>
    </div>
  );
}
