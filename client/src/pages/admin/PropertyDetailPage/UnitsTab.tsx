import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../../store';
import {
  selectUnit, setViewMode, selectTower,
  toggleStatusFilter, setSearchQuery, clearFilters,
  setZoomLevel, setBulkCreateOpen,
  setFloorFilter, setUnitTypeFilter,
} from '../../../store/slices/unitsSlice';
import {
  useGetTowersQuery, useGetFloorPlanQuery, useGetUnitsQuery,
  useGetUnitStatsQuery, useDeleteUnitMutation, useCreateUnitMutation, useGetUnitTypesQuery,
} from '../../../store/api/unitsApi';
import type { UnitListItem, Tower } from '../../../store/api/unitsApi';
import {
  LayoutGrid, List, Layers, Plus, Search, Building2,
  Zap, Droplets, Wind, X, Grid3x3, ChevronRight,
  ChevronsUp, ChevronsDown, Filter, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { UnitDetailDrawer } from './UnitDetailDrawer';
import { BulkCreateModal } from './BulkCreateModal';
import { TowerSidebar } from './TowerSidebar';
import { TowerFormModal } from './TowerFormModal';
import { useConfirm } from '../../../components/DialogProvider';
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
  const confirmDialog = useConfirm();
  const {
    viewMode, selectedTowerId, statusFilter, floorFilter, unitTypeFilter,
    searchQuery, zoomLevel, drawerOpen, selectedUnitId, bulkCreateOpen,
  } = useAppSelector((s) => s.units);

  /* Tower modal: null = closed, 'new' = create, Tower = edit */
  const [towerModal, setTowerModal] = useState<Tower | 'new' | null>(null);

  /* Reset filters when switching to a different property */
  const prevPropertyId = useRef(propertyId);
  useEffect(() => {
    if (propertyId !== prevPropertyId.current) {
      dispatch(clearFilters());
      dispatch(selectTower(null));
      prevPropertyId.current = propertyId;
    }
  }, [propertyId, dispatch]);

  const { data: towersData } = useGetTowersQuery(propertyId!);
  const { data: statsData }  = useGetUnitStatsQuery(propertyId!);
  const towers = towersData?.data || [];
  const stats  = statsData?.data;

  /* floor-plan data */
  const { data: floorPlanData, isLoading: fpLoading } = useGetFloorPlanQuery(
    { propertyId: propertyId!, towerId: selectedTowerId || undefined },
    { skip: viewMode !== 'floor_plan' }
  );

  /* list / grid data — send comma-separated statuses for multi-select */
  const statusParam = statusFilter.length > 0 ? statusFilter.join(',') : undefined;
  const { data: listData, isLoading: listLoading } = useGetUnitsQuery(
    {
      propertyId: propertyId!,
      towerId: selectedTowerId || undefined,
      status: statusParam,
      search: searchQuery || undefined,
    },
    { skip: viewMode === 'floor_plan' }
  );

  const [deleteUnit] = useDeleteUnitMutation();

  /* filtered floor plan */
  const floors = floorPlanData?.data.floors || [];

  const cellSize = ZOOM_CELL[zoomLevel];
  const hasFilters = statusFilter.length > 0 || !!searchQuery || !!unitTypeFilter || floorFilter !== null;

  /* Floor plan scroll ref for jump buttons */
  const floorScrollRef = useRef<HTMLDivElement>(null);

  /* Distinct floors from floor plan data */
  const distinctFloors = [...new Set(floors.map((f) => f.floorNumber))].sort((a, b) => b - a);

  /* Unit types for filter dropdown */
  const { data: unitTypesData } = useGetUnitTypesQuery();
  const unitTypes = unitTypesData?.data || [];

  /* Apply floor + unit type filters to floor plan */
  const filteredFloors = floors
    .map((floor) => ({
      ...floor,
      units: floor.units.filter((u) => {
        if (statusFilter.length > 0 && !statusFilter.includes(u.status)) return false;
        if (unitTypeFilter && u.unitType !== unitTypeFilter) return false;
        return true;
      }),
    }))
    .filter((f) => {
      if (floorFilter !== null && f.floorNumber !== floorFilter) return false;
      return f.units.length > 0 || (statusFilter.length === 0 && !unitTypeFilter);
    });

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

          {/* Filter dropdowns */}
          <div className="ut-filter-dropdowns">
            <div className="ut-filter-select">
              <Filter size={11} />
              <select
                value={unitTypeFilter || ''}
                onChange={(e) => dispatch(setUnitTypeFilter(e.target.value || null))}
              >
                <option value="">All Types</option>
                {['residential', 'commercial', 'storage', 'parking'].map((cat) => (
                  <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                    {unitTypes.filter((t) => t.category === cat).map((t) => (
                      <option key={t.id} value={t.code}>{t.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {viewMode === 'floor_plan' && distinctFloors.length > 1 && (
              <div className="ut-filter-select">
                <Layers size={11} />
                <select
                  value={floorFilter ?? ''}
                  onChange={(e) => dispatch(setFloorFilter(e.target.value ? parseInt(e.target.value) : null))}
                >
                  <option value="">All Floors</option>
                  {distinctFloors.map((f) => (
                    <option key={f} value={f}>Floor {f}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

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
              <button
                title="Calendar"
                className={viewMode === 'calendar' ? 'active' : ''}
                onClick={() => dispatch(setViewMode('calendar'))}
              ><Calendar size={14} /></button>
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
          onAddTower={() => setTowerModal('new')}
          onEditTower={(tower) => setTowerModal(tower)}
        />

        {/* Main content */}
        <div className="units-main">

          {/* ── Floor Plan ── */}
          {viewMode === 'floor_plan' && (
            fpLoading
              ? <div className="units-loading"><Building2 size={24} /><span>Loading floor plan…</span></div>
              : <div className="floor-plan-view">
                  <div className="floor-plan-scroll" ref={floorScrollRef}>
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
                                  {/* Rich tooltip */}
                                  <div className="unit-tooltip">
                                    <div className="ut-tip-header">
                                      <span className="ut-tip-num">{unit.unitNumber}</span>
                                      <span className="ut-tip-status" style={{ background: STATUS_COLOR[unit.status] + '33', color: STATUS_COLOR[unit.status] }}>
                                        {unit.status.replace(/_/g, ' ')}
                                      </span>
                                    </div>
                                    <div className="ut-tip-rows">
                                      <span>Type</span><span>{unit.unitType.replace(/_/g, ' ')}</span>
                                      {unit.areaSqft && <><span>Area</span><span>{unit.areaSqft} sqft</span></>}
                                      <span>Furnishing</span><span>{unit.furnishing.replace(/_/g, ' ')}</span>
                                      {unit.tower && <><span>Tower</span><span>{unit.tower.name}</span></>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                    }
                  </div>
                  {/* Status legend */}
                  {filteredFloors.length > 0 && (
                    <div className="floor-legend">
                      {STATUSES.map((s) => (
                        <div key={s.key} className="legend-item">
                          <span className="legend-dot" style={{ background: s.color }} />
                          <span>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Floor jump buttons */}
                  {filteredFloors.length > 2 && (
                    <div className="floor-jump-btns">
                      <button
                        className="floor-jump-btn"
                        title="Jump to top floor"
                        onClick={() => floorScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                      >
                        <ChevronsUp size={14} />
                      </button>
                      <button
                        className="floor-jump-btn"
                        title="Jump to ground floor"
                        onClick={() => floorScrollRef.current?.scrollTo({ top: floorScrollRef.current.scrollHeight, behavior: 'smooth' })}
                      >
                        <ChevronsDown size={14} />
                      </button>
                    </div>
                  )}
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
                              if (!(await confirmDialog(`Delete unit ${unit.unitNumber}?`, { danger: true, confirmText: 'Delete' }))) return;
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

          {/* ── Calendar View ── */}
          {viewMode === 'calendar' && (
            <CalendarView
              units={listData?.data || []}
              loading={listLoading}
              hasFilters={hasFilters}
              onSelectUnit={(id) => dispatch(selectUnit(id))}
            />
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
      {towerModal !== null && (
        <TowerFormModal
          propertyId={propertyId!}
          tower={towerModal === 'new' ? null : towerModal}
          onClose={() => setTowerModal(null)}
        />
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
    <div className="cu-overlay">
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

/* ── Calendar View ── */
function CalendarView({
  units,
  loading,
  hasFilters,
  onSelectUnit,
}: {
  units: UnitListItem[];
  loading: boolean;
  hasFilters: boolean;
  onSelectUnit: (id: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(month.year, month.month, 1);
    const lastDay = new Date(month.year, month.month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();
    const today = new Date();

    const days: Array<{ date: number; isToday: boolean } | null> = [];
    // Padding for start of week
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) {
      days.push({
        date: d,
        isToday: d === today.getDate() && month.month === today.getMonth() && month.year === today.getFullYear(),
      });
    }
    return days;
  }, [month]);

  const monthLabel = new Date(month.year, month.month).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Status summary for the current snapshot
  const statusSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    for (const u of units) {
      summary[u.status] = (summary[u.status] || 0) + 1;
    }
    return summary;
  }, [units]);

  const prevMonth = () => setMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 });
  const nextMonth = () => setMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 });

  if (loading) return <div className="units-loading"><Building2 size={24} /><span>Loading…</span></div>;
  if (units.length === 0) return <EmptyState message={hasFilters ? 'No units match the current filters' : 'No units yet'} />;

  return (
    <div className="calendar-view">
      {/* Month header */}
      <div className="cal-header">
        <button className="cal-nav" onClick={prevMonth}>‹</button>
        <span className="cal-month">{monthLabel}</span>
        <button className="cal-nav" onClick={nextMonth}>›</button>
      </div>

      {/* Status summary bar */}
      <div className="cal-summary">
        {STATUSES.map((s) => (
          <div key={s.key} className="cal-sum-item">
            <span className="cal-sum-dot" style={{ background: s.color }} />
            <span className="cal-sum-count">{statusSummary[s.key] || 0}</span>
            <span className="cal-sum-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {calendarDays.map((day, i) => (
          <div key={i} className={`cal-day ${!day ? 'empty' : ''} ${day?.isToday ? 'today' : ''}`}>
            {day && (
              <>
                <span className="cal-date">{day.date}</span>
                <div className="cal-day-dots">
                  {STATUSES.map((s) => {
                    const count = statusSummary[s.key] || 0;
                    if (count === 0) return null;
                    return (
                      <div
                        key={s.key}
                        className="cal-dot-bar"
                        style={{ background: s.color + '55', borderColor: s.color }}
                        title={`${count} ${s.label}`}
                      >
                        <span style={{ color: s.color }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Unit list below calendar */}
      <div className="cal-unit-list">
        <div className="cal-list-header">Units ({units.length})</div>
        <div className="cal-list-scroll">
          {units.slice(0, 50).map((u) => (
            <button key={u.id} className="cal-unit-row" onClick={() => onSelectUnit(u.id)}>
              <span className="cal-u-dot" style={{ background: STATUS_COLOR[u.status] }} />
              <span className="cal-u-num">{u.unitNumber}</span>
              <span className="cal-u-type">{u.unitType.replace(/_/g, ' ')}</span>
              <span className="cal-u-status" style={{ color: STATUS_COLOR[u.status] }}>{u.status.replace(/_/g, ' ')}</span>
              <ChevronRight size={12} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
