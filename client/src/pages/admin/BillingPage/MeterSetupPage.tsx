import { useState, useEffect } from 'react';
import {
  useGetMeterSetupsQuery, useCreateMeterSetupMutation, useUpdateMeterSetupMutation, useDeleteMeterSetupMutation,
  useGetChargeTypesQuery,
  type MeterSetup,
} from '../../../store/api/billingApi';
import { useGetPropertiesQuery, useGetFloorSetupsQuery, useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { Gauge, Plus, X, Pencil, Trash2, Search, Zap, Layers, Droplets, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from './components/TableScrollWrapper';
import toast from 'react-hot-toast';
import './BillingPage.css';

export const METER_TYPES = [
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

const CALCULATION_TYPES = [
  { value: 'per_unit', label: 'Per Unit' },
  { value: 'fixed', label: 'Fixed' },
] as const;

const labelFor = (opts: readonly { value: string; label: string }[], value: string) =>
  opts.find((o) => o.value === value)?.label || value;

export default function MeterSetupPage() {
  const { data: metersData, isFetching } = useGetMeterSetupsQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ limit: 100 });
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  // /properties requires properties.read, which a billing-only role may lack — use the
  // permission-free /properties/my-scope endpoint so the locked field still resolves
  // a name instead of silently rendering as unselected. See useSelectedPropertyId.ts.
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const scopeProperties = scopeData?.data || [];
  const [createMeterSetup, { isLoading: creating }] = useCreateMeterSetupMutation();
  const [updateMeterSetup, { isLoading: updating }] = useUpdateMeterSetupMutation();
  const [deleteMeterSetup] = useDeleteMeterSetupMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();

  const meters = metersData?.data || [];
  const properties = propertiesData?.data || [];
  const chargeTypes = chargeTypesData?.data || [];

  // ── Search & Filters ────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const searchPropertyId = useSelectedPropertyFilter();
  const [searchFloorId, setSearchFloorId] = useState('');
  const [filterMeterType, setFilterMeterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterChargeTypeId, setFilterChargeTypeId] = useState('');

  const defaultPropertyId = searchPropertyId || properties[0]?.id || scopeProperties[0]?.id || '';

  const { data: searchFloorsData } = useGetFloorSetupsQuery(
    defaultPropertyId ? { propertyId: defaultPropertyId } : undefined,
    { skip: !defaultPropertyId }
  );
  const searchFloors = searchFloorsData?.data || [];

  const hasFilterSelections = Boolean(searchFloorId || filterMeterType || filterCategory || filterChargeTypeId);

  // Floor filter resets whenever the sidebar's Active Property changes.
  useEffect(() => { setSearchFloorId(''); }, [searchPropertyId]);

  const filteredMeters = meters.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (searchPropertyId && m.propertyId !== searchPropertyId) return false;
    if (searchFloorId && m.floorId !== searchFloorId) return false;
    if (filterMeterType && m.meterType !== filterMeterType) return false;
    if (filterCategory && m.category !== filterCategory) return false;
    if (filterChargeTypeId && m.chargeTypeId !== filterChargeTypeId) return false;
    if (!q) return true;
    return (
      m.property.name.toLowerCase().includes(q) ||
      (m.floor?.floorLabel ?? '').toLowerCase().includes(q) ||
      m.meterNo.toLowerCase().includes(q) ||
      labelFor(METER_TYPES, m.meterType).toLowerCase().includes(q) ||
      (m.chargeType?.name ?? '').toLowerCase().includes(q)
    );
  });

  // ── Pagination ───────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, searchPropertyId, searchFloorId, filterMeterType, filterCategory, filterChargeTypeId, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredMeters.length / pageSize));
  const paginatedMeters = filteredMeters.slice((page - 1) * pageSize, page * pageSize);

  // ── Counts & Statistics (scoped by selected Property and Floor) ──────
  const scopedMeters = meters.filter((m) => {
    if (searchPropertyId && m.propertyId !== searchPropertyId) return false;
    if (searchFloorId && m.floorId !== searchFloorId) return false;
    return true;
  });

  const totalCount = scopedMeters.length;

  const mepeCount = scopedMeters.filter((m) => m.meterType === 'mepe').length;
  const subMeterCount = scopedMeters.filter((m) => m.meterType === 'sub_meter').length;
  const ctMeterCount = scopedMeters.filter((m) => m.meterType === 'ct_meter').length;
  const waterMeterCount = scopedMeters.filter((m) => m.meterType === 'water_meter').length;

  const selectedFloorLabel = searchFloors.find((f) => f.id === searchFloorId)?.floorLabel;

  const emptyForm = {
    propertyId: '', floorId: '', meterType: '', meterNo: '', mainMeterId: '', horsePower: '', unitLostPct: '',
    category: '', chargeTypeId: '', factor: '1', maintenanceFee: '', usageType: '', rate: '', calculationType: 'per_unit',
  };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MeterSetup | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const effectiveFormPropertyId = form.propertyId || defaultPropertyId;

  const { data: floorsData } = useGetFloorSetupsQuery(
    effectiveFormPropertyId ? { propertyId: effectiveFormPropertyId } : undefined,
    { skip: !effectiveFormPropertyId }
  );
  const floors = floorsData?.data || [];

  const lockedPropertyName = scopeProperties.find((p) => p.id === searchPropertyId)?.name;

  useEffect(() => {
    if (showForm && !editing) {
      if (form.propertyId !== defaultPropertyId && defaultPropertyId) {
        setForm((f) => ({ ...f, propertyId: defaultPropertyId, floorId: '', mainMeterId: '' }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPropertyId, showForm, editing]);

  const mainMeterOptions = meters.filter(
    (m) => m.propertyId === effectiveFormPropertyId && m.meterType !== 'sub_meter' && m.id !== editing?.id
  );

  const openCreate = () => {
    setHasAttemptedSubmit(false);
    setEditing(null);
    setForm({ ...emptyForm, propertyId: defaultPropertyId });
    setShowForm(true);
  };
  const openEdit = (m: MeterSetup) => {
    setHasAttemptedSubmit(false);
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
      chargeTypeId: m.chargeTypeId ?? '',
      factor: m.factor ?? '',
      maintenanceFee: m.maintenanceFee ?? '',
      usageType: m.usageType ?? '',
      rate: m.rate ?? '',
      calculationType: m.calculationType ?? 'per_unit',
    });
    setShowForm(true);
  };
  const closeForm = () => { setHasAttemptedSubmit(false); setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleMeterTypeChange = (meterType: string) => {
    setForm({ ...form, meterType, mainMeterId: meterType === 'sub_meter' ? form.mainMeterId : '' });
  };

  const isMeterTypeMissing = hasAttemptedSubmit && !form.meterType;
  const isMainMeterMissing = hasAttemptedSubmit && form.meterType === 'sub_meter' && !form.mainMeterId;
  const isMeterNoMissing = hasAttemptedSubmit && !form.meterNo.trim();
  const isCategoryMissing = hasAttemptedSubmit && !form.category;
  const isChargeTypeMissing = hasAttemptedSubmit && !form.chargeTypeId;
  const isRateMissing = hasAttemptedSubmit && (form.rate === '' || form.rate == null || isNaN(Number(form.rate)) || Number(form.rate) < 0);
  const isCalculationMissing = hasAttemptedSubmit && !form.calculationType;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    const resolvedPropertyId = form.propertyId || defaultPropertyId;
    if (
      !resolvedPropertyId ||
      !form.meterType ||
      (form.meterType === 'sub_meter' && !form.mainMeterId) ||
      !form.meterNo.trim() ||
      !form.category ||
      !form.chargeTypeId ||
      form.rate === '' || form.rate == null || isNaN(Number(form.rate)) || Number(form.rate) < 0 ||
      !form.calculationType
    ) {
      toast.error(!resolvedPropertyId ? 'Please select a property from the sidebar first' : 'Please fill in all required fields');
      return;
    }
    const payload = {
      propertyId: resolvedPropertyId,
      floorId: form.floorId || undefined,
      meterType: form.meterType,
      meterNo: form.meterNo,
      mainMeterId: form.meterType === 'sub_meter' ? form.mainMeterId : undefined,
      horsePower: form.horsePower ? Number(form.horsePower) : undefined,
      unitLostPct: form.unitLostPct ? Number(form.unitLostPct) : undefined,
      category: form.category,
      chargeTypeId: form.chargeTypeId,
      factor: form.factor ? Number(form.factor) : undefined,
      maintenanceFee: form.maintenanceFee ? Number(form.maintenanceFee) : undefined,
      usageType: form.usageType || undefined,
      rate: form.rate ? Number(form.rate) : undefined,
      calculationType: form.calculationType || 'per_unit',
    };
    try {
      if (editing) {
        await updateMeterSetup({ id: editing.id, data: payload }).unwrap();
      } else {
        await createMeterSetup(payload).unwrap();
      }
      closeForm();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || `Failed to ${editing ? 'update' : 'create'} meter`);
    }
  };

  const handleDelete = async (m: MeterSetup) => {
    if (!(await confirmDialog(`Delete meter "${m.meterNo}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteMeterSetup(m.id).unwrap();
    } catch (e: any) {
      const msg = e?.data?.errors?.[0]?.message || 'Failed to delete meter';
      alertDialog(msg);
    }
  };

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}>
            <Gauge size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Meter Setup</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {`${totalCount} total meters${selectedFloorLabel ? ` · ${selectedFloorLabel}` : ''}`}
            </p>
          </div>
          <PermissionGuard permission="meter.create">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Meter
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="billing-summary-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
            <Gauge size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Total Meters</span>
            <span className="bsc-value">{totalCount}</span>
            <span className="bsc-sub">
              {selectedFloorLabel
                ? `Floor: ${selectedFloorLabel}`
                : (lockedPropertyName || properties.find((p) => p.id === searchPropertyId)?.name || 'All registered meters')}
            </span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(234, 179, 8, 0.12)', color: '#eab308' }}>
            <Zap size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">MEPE Meters</span>
            <span className="bsc-value">{mepeCount}</span>
            <span className="bsc-sub">Main supply meters</span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
            <Layers size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">Sub Meters</span>
            <span className="bsc-value">{subMeterCount}</span>
            <span className="bsc-sub">Tenant & branch meters</span>
          </div>
        </div>

        <div className="billing-stat-card">
          <div className="bsc-icon" style={{ background: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9' }}>
            <Droplets size={17} />
          </div>
          <div className="bsc-info">
            <span className="bsc-label">CT & Water</span>
            <span className="bsc-value">{ctMeterCount + waterMeterCount}</span>
            <span className="bsc-sub">{ctMeterCount} CT · {waterMeterCount} Water</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="billing-filters" style={showFilters ? { marginBottom: 12 } : undefined}>
        <div className="billing-filters-left">
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search meter no, meter type…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="button"
            className={`btn btn-secondary billing-filter-toggle-btn${showFilters || hasFilterSelections ? ' active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} /> Filters{hasFilterSelections ? ' •' : ''}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="billing-filter-bar">
          <select
            className="filter-select"
            value={searchFloorId}
            onChange={(e) => setSearchFloorId(e.target.value)}
            disabled={!defaultPropertyId}
            title="Floor"
          >
            <option value="">All Floors</option>
            {searchFloors.map((f) => (
              <option key={f.id} value={f.id}>{f.floorLabel}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={filterMeterType}
            onChange={(e) => setFilterMeterType(e.target.value)}
            title="Meter Type"
          >
            <option value="">All Meter Types</option>
            {METER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            title="Category"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={filterChargeTypeId}
            onChange={(e) => setFilterChargeTypeId(e.target.value)}
            title="Charge Type"
          >
            <option value="">All Charge Types</option>
            {chargeTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>{ct.name}</option>
            ))}
          </select>

          <button
            type="button"
            className="btn-ghost billing-filter-reset-btn"
            onClick={() => {
              setSearchFloorId('');
              setFilterMeterType('');
              setFilterCategory('');
              setFilterChargeTypeId('');
              setPage(1);
            }}
          >
            <X size={14} /> Reset
          </button>
        </div>
      )}

      {/* Meter Setup Table */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
          <table className="billing-table">
          <thead>
            <tr>
              <th>Floor Label</th>
              <th>Meter Type</th>
              <th>Meter No</th>
              <th>Category</th>
              <th>Charge Type</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Maintenance Fee</th>
              <th>Usage Type</th>
              <th className="text-center"></th>
            </tr>
          </thead>
          <tbody>
            {isFetching && meters.length === 0 ? (
              <tr><td colSpan={9} className="billing-empty">Loading…</td></tr>
            ) : meters.length === 0 ? (
              <tr><td colSpan={9} className="billing-empty">No meters set up yet</td></tr>
            ) : filteredMeters.length === 0 ? (
              <tr><td colSpan={9} className="billing-empty">No meters match your search</td></tr>
            ) : paginatedMeters.map((m) => (
              <tr key={m.id}>
                <td>{m.floor?.floorLabel ?? '—'}</td>
                <td>{labelFor(METER_TYPES, m.meterType)}</td>
                <td><span className="cell-mono">{m.meterNo}</span></td>
                <td>{labelFor(CATEGORIES, m.category)}</td>
                <td>{m.chargeType?.name ?? '—'}</td>
                <td className="text-right">{m.rate != null && m.rate !== '' ? Number(m.rate).toFixed(2) : '—'}</td>
                <td className="text-right">{m.maintenanceFee != null && m.maintenanceFee !== '' ? Number(m.maintenanceFee).toFixed(2) : '—'}</td>
                <td>{m.usageType ? labelFor(USAGE_TYPES, m.usageType) : '—'}</td>
                <td className="text-center">
                  <PermissionGuard permission="meter.update">
                    <button className="btn-icon" title="Edit" onClick={() => openEdit(m)}>
                      <Pencil size={14} />
                    </button>
                  </PermissionGuard>
                  <PermissionGuard permission="meter.delete">
                    <button className="btn-icon" title="Delete" onClick={() => handleDelete(m)}
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </PermissionGuard>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScrollWrapper>

        {/* Pagination */}
        {filteredMeters.length >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="meter-page-size">Rows per page:</label>
                <select
                  id="meter-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="page-btns">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Gauge size={18} /> {editing ? 'Edit Meter' : 'New Meter'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Floor</label>
                    <select value={form.floorId} disabled={!effectiveFormPropertyId}
                      onChange={(e) => setForm({ ...form, floorId: e.target.value })}>
                      <option value="">Select floor…</option>
                      {floors.map((f) => <option key={f.id} value={f.id}>{f.floorLabel}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Meter Type <span className="req">*</span></label>
                    <select
                      className={isMeterTypeMissing ? 'inv-input-error' : ''}
                      value={form.meterType}
                      onChange={(e) => handleMeterTypeChange(e.target.value)}
                    >
                      <option value="">Select type…</option>
                      {METER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {isMeterTypeMissing && <span className="inv-error-text">Meter type is required</span>}
                  </div>
                  {form.meterType === 'sub_meter' && (
                    <div className="inv-field">
                      <label>Main Meter <span className="req">*</span></label>
                      <select
                        className={isMainMeterMissing ? 'inv-input-error' : ''}
                        value={form.mainMeterId}
                        disabled={!effectiveFormPropertyId}
                        onChange={(e) => setForm({ ...form, mainMeterId: e.target.value })}
                      >
                        <option value="">Select main meter…</option>
                        {mainMeterOptions.map((m) => (
                          <option key={m.id} value={m.id}>{m.meterNo}</option>
                        ))}
                      </select>
                      {isMainMeterMissing && <span className="inv-error-text">Main meter is required</span>}
                    </div>
                  )}
                  <div className="inv-field">
                    <label>Meter No <span className="req">*</span></label>
                    <input
                      className={isMeterNoMissing ? 'inv-input-error' : ''}
                      placeholder="e.g. MT-00123"
                      value={form.meterNo}
                      onChange={(e) => setForm({ ...form, meterNo: e.target.value })}
                    />
                    {isMeterNoMissing && <span className="inv-error-text">Meter number is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>Category <span className="req">*</span></label>
                    <select
                      className={isCategoryMissing ? 'inv-input-error' : ''}
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      <option value="">Select category…</option>
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    {isCategoryMissing && <span className="inv-error-text">Category is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>Charge Type <span className="req">*</span></label>
                    <select
                      className={isChargeTypeMissing ? 'inv-input-error' : ''}
                      value={form.chargeTypeId}
                      onChange={(e) => setForm({ ...form, chargeTypeId: e.target.value })}
                    >
                      <option value="">Select charge type…</option>
                      {chargeTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                    </select>
                    {isChargeTypeMissing && <span className="inv-error-text">Charge type is required</span>}
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
                    <label>Rate <span className="req">*</span></label>
                    <input
                      type="number"
                      className={`no-spinner ${isRateMissing ? 'inv-input-error' : ''}`}
                      step="0.0001"
                      min={0}
                      placeholder="e.g. 150.00"
                      value={form.rate}
                      onChange={(e) => setForm({ ...form, rate: e.target.value })}
                    />
                    {isRateMissing && <span className="inv-error-text">Valid rate is required</span>}
                  </div>
                  <div className="inv-field">
                    <label>Calculation <span className="req">*</span></label>
                    <select
                      className={isCalculationMissing ? 'inv-input-error' : ''}
                      value={form.calculationType}
                      onChange={(e) => setForm({ ...form, calculationType: e.target.value })}
                    >
                      {CALCULATION_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    {isCalculationMissing && <span className="inv-error-text">Calculation type is required</span>}
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
                <PermissionGuard permission={editing ? 'meter.update' : 'meter.create'}>
                  <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                    {creating || updating ? 'Saving…' : editing ? 'Save Changes' : 'Create Meter'}
                  </button>
                </PermissionGuard>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
