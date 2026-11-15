import { useState, useMemo, useEffect } from 'react';
import {
  Tag,
  Save,
  Plus,
  RotateCcw,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetSequencesQuery,
  useBulkSaveSequencesMutation,
  useDeleteSequenceMutation,
  useResetSequenceMutation,
  type Prefix2Format,
} from '../../../store/api/sequenceApi';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import { useConfirm } from '../../../components/DialogProvider';
import { TableSkeletonRows } from '../../../components/common/SkeletonLoaders';
import { TableScrollWrapper } from '../BillingPage/components/TableScrollWrapper';
import '../BillingPage/BillingPage.css';
import './PrefixSetupPage.css';

// ── Module & Document Definitions ───────────────────────────

interface DocTypeDef {
  typeKey: string;
  label: string;
  module: string;
  defaultPrefix1: string;
  defaultPrefix2: Prefix2Format;
  defaultPad: number;
  defaultMode?: 'auto' | 'manual';
}

const MODULE_OPTIONS = [
  { id: 'organization', label: 'Organization' },
  { id: 'leasing', label: 'Leasing' },
  { id: 'crm', label: 'CRM' },
  { id: 'billing', label: 'Billing' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'parking', label: 'Parking' },
  { id: 'security', label: 'Security' },
];

const MODULE_LABELS: Record<string, string> = MODULE_OPTIONS.reduce((acc, m) => {
  acc[m.id] = m.label;
  return acc;
}, {} as Record<string, string>);

const PMS_DOCUMENT_TYPES: DocTypeDef[] = [
  // Organization
  { typeKey: 'tenant', label: 'Tenant Code', module: 'organization', defaultPrefix1: 'TNT', defaultPrefix2: 'none', defaultPad: 6, defaultMode: 'manual' },

  // Leasing
  { typeKey: 'lease', label: 'Lease Agreement', module: 'leasing', defaultPrefix1: 'LSE', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'quotation', label: 'Lease Quotation', module: 'leasing', defaultPrefix1: 'QUO', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'booking', label: 'Unit Booking', module: 'leasing', defaultPrefix1: 'BKG', defaultPrefix2: 'none', defaultPad: 6 },

  // CRM
  { typeKey: 'lead', label: 'CRM Lead', module: 'crm', defaultPrefix1: 'LD', defaultPrefix2: 'none', defaultPad: 6 },

  // Billing
  { typeKey: 'invoice', label: 'Sales Invoice', module: 'billing', defaultPrefix1: 'INV', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'receipt', label: 'Official Receipt', module: 'billing', defaultPrefix1: 'RCT', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'credit_note', label: 'Credit Note', module: 'billing', defaultPrefix1: 'CN', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'debit_note', label: 'Debit Note', module: 'billing', defaultPrefix1: 'DN', defaultPrefix2: 'none', defaultPad: 6 },

  // Maintenance
  { typeKey: 'ticket', label: 'Maintenance Ticket', module: 'maintenance', defaultPrefix1: 'TKT', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'work_order', label: 'Work Order', module: 'maintenance', defaultPrefix1: 'WO', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'inspection', label: 'Inspection Report', module: 'maintenance', defaultPrefix1: 'INS', defaultPrefix2: 'none', defaultPad: 6 },

  // Inventory
  { typeKey: 'purchase_requisition', label: 'Purchase Requisition', module: 'inventory', defaultPrefix1: 'PR', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'purchase_order', label: 'Purchase Order', module: 'inventory', defaultPrefix1: 'PO', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'stock_movement', label: 'Stock Movement', module: 'inventory', defaultPrefix1: 'SM', defaultPrefix2: 'none', defaultPad: 6 },

  // Parking
  { typeKey: 'parking_pass', label: 'Parking Pass', module: 'parking', defaultPrefix1: 'PP', defaultPrefix2: 'none', defaultPad: 6 },

  // Security
  { typeKey: 'security_incident', label: 'Security Incident', module: 'security', defaultPrefix1: 'INC', defaultPrefix2: 'none', defaultPad: 6 },
];

const DOC_TYPE_LOOKUP = PMS_DOCUMENT_TYPES.reduce((acc, doc) => {
  acc[doc.typeKey] = doc;
  return acc;
}, {} as Record<string, DocTypeDef>);

// ── Helper: Format Sample Preview ───────────────────────────

function computeLiveSample(prefix1: string, prefix2: Prefix2Format, padLength: number, sampleVal: number = 1): string {
  const cleanPrefix = (prefix1 || '').trim().toUpperCase();
  const cleanPad = Math.max(3, Math.min(10, padLength || 6));
  const padded = String(sampleVal).padStart(cleanPad, '0');

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  let datePart = '';
  if (prefix2 === 'yymm') {
    datePart = `${yy}${mm}`;
  } else if (prefix2 === 'mmyy') {
    datePart = `${mm}${yy}`;
  }

  return [cleanPrefix, datePart, padded].filter(Boolean).join('-');
}

// ── Editable Row Model ──────────────────────────────────────

interface EditableRow {
  rowId: string;
  typeKey: string;
  label: string;
  module: string;
  prefix1: string;
  prefix2: Prefix2Format;
  padLength: number;
  currentVal: number;
  mode?: 'auto' | 'manual';
  isNew?: boolean;
}

// Check whether row differs from system default configuration
function isRowModified(row: EditableRow): boolean {
  const docDef = DOC_TYPE_LOOKUP[row.typeKey];
  if (!docDef) return false;

  const currentPrefix1 = (row.prefix1 || '').trim().toUpperCase();
  const defaultPrefix1 = (docDef.defaultPrefix1 || '').trim().toUpperCase();
  if (currentPrefix1 !== defaultPrefix1) return true;

  const currentPrefix2 = row.prefix2 || 'none';
  const defaultPrefix2 = docDef.defaultPrefix2 || 'none';
  if (currentPrefix2 !== defaultPrefix2) return true;

  const currentPad = Number(row.padLength) || 6;
  const defaultPad = Number(docDef.defaultPad) || 6;
  if (currentPad !== defaultPad) return true;

  if (row.typeKey === 'tenant') {
    const currentMode = row.mode || 'manual';
    const defaultMode = docDef.defaultMode || 'manual';
    if (currentMode !== defaultMode) return true;
  }

  return false;
}

export default function PrefixSetupPage() {
  const confirmDialog = useConfirm();

  // Active Property from global application context
  const activePropertyId = useSelectedPropertyId();
  const { data: propertiesScope } = useGetMyPropertyScopeQuery();
  const properties = propertiesScope?.data || [];
  const activeProperty = useMemo(() => {
    return properties.find((p) => p.id === activePropertyId) || null;
  }, [properties, activePropertyId]);

  // Search, Filters & Pagination
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Fetch sequences from server for the active property
  const { data: serverSequences = [], isLoading, refetch } = useGetSequencesQuery(
    activePropertyId ? { locationId: activePropertyId } : undefined,
    { skip: !activePropertyId, refetchOnMountOrArgChange: true }
  );

  const [bulkSaveSequences, { isLoading: isSaving }] = useBulkSaveSequencesMutation();
  const [deleteSequence] = useDeleteSequenceMutation();
  const [resetSequence] = useResetSequenceMutation();

  // Local rows for editing and baseline for dirty detection
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [initialRows, setInitialRows] = useState<EditableRow[]>([]);

  // Sync serverSequences to local rows and baseline when loaded or property changed
  useEffect(() => {
    if (serverSequences && serverSequences.length > 0) {
      const mapped: EditableRow[] = serverSequences.map((s) => ({
        rowId: s.id || s.typeKey,
        typeKey: s.typeKey,
        label: s.label || DOC_TYPE_LOOKUP[s.typeKey]?.label || s.typeKey,
        module: DOC_TYPE_LOOKUP[s.typeKey]?.module || s.module || 'organization',
        prefix1: s.prefix1,
        prefix2: s.prefix2 || 'none',
        padLength: s.padLength || 6,
        currentVal: s.currentVal || 0,
        mode: s.mode || (s.typeKey === 'tenant' ? 'manual' : undefined),
        isNew: false,
      }));
      setRows(mapped);
      setInitialRows(mapped);
    } else {
      // Seed default rows for active property
      const defaultRows: EditableRow[] = PMS_DOCUMENT_TYPES.map((d) => ({
        rowId: d.typeKey,
        typeKey: d.typeKey,
        label: d.label,
        module: d.module,
        prefix1: d.defaultPrefix1,
        prefix2: d.defaultPrefix2,
        padLength: d.defaultPad,
        currentVal: 0,
        mode: d.defaultMode,
        isNew: false,
      }));
      setRows(defaultRows);
      setInitialRows(defaultRows);
    }
  }, [serverSequences]);

  // Derive whether local rows differ from initial saved DB state
  const isDirty = useMemo(() => {
    if (rows.length !== initialRows.length) return true;
    if (rows.some((r) => r.isNew)) return true;

    const initialMap = new Map<string, EditableRow>();
    for (const init of initialRows) {
      initialMap.set(init.typeKey, init);
    }

    for (const row of rows) {
      const init = initialMap.get(row.typeKey);
      if (!init) return true;

      const currPrefix1 = (row.prefix1 || '').trim().toUpperCase();
      const initPrefix1 = (init.prefix1 || '').trim().toUpperCase();
      if (currPrefix1 !== initPrefix1) return true;

      const currPrefix2 = row.prefix2 || 'none';
      const initPrefix2 = init.prefix2 || 'none';
      if (currPrefix2 !== initPrefix2) return true;

      const currPad = Number(row.padLength) || 6;
      const initPad = Number(init.padLength) || 6;
      if (currPad !== initPad) return true;

      if (row.typeKey === 'tenant') {
        const currMode = row.mode || 'manual';
        const initMode = init.mode || 'manual';
        if (currMode !== initMode) return true;
      }
    }

    return false;
  }, [rows, initialRows]);

  const hasFilterSelections = Boolean(moduleFilter || statusFilter);

  // Filtered rows across all or selected modules
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (moduleFilter && r.module !== moduleFilter) return false;
      if (statusFilter === 'modified' && !isRowModified(r)) return false;
      if (statusFilter === 'default' && isRowModified(r)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const modLabel = (MODULE_LABELS[r.module] || r.module).toLowerCase();
        const sample = computeLiveSample(r.prefix1, r.prefix2, r.padLength, r.currentVal + 1).toLowerCase();
        const matchLabel = r.label.toLowerCase().includes(q);
        const matchPrefix = (r.prefix1 || '').toLowerCase().includes(q);
        const matchMod = modLabel.includes(q);
        const matchSample = sample.includes(q);
        if (!matchLabel && !matchPrefix && !matchMod && !matchSample) return false;
      }
      return true;
    });
  }, [rows, moduleFilter, statusFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [search, moduleFilter, statusFilter, pageSize, activePropertyId]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Available document types that haven't been added yet
  const availableTypes = useMemo(() => {
    const existingKeys = new Set(rows.map((r) => r.typeKey));
    return PMS_DOCUMENT_TYPES.filter(
      (d) => (!moduleFilter || d.module === moduleFilter) && !existingKeys.has(d.typeKey)
    );
  }, [rows, moduleFilter]);

  const handleResetFilters = () => {
    setSearch('');
    setModuleFilter('');
    setStatusFilter('');
    setPage(1);
  };

  // Add new row
  const handleAddRow = () => {
    if (availableTypes.length === 0) {
      toast('All document types are already in the list.', { icon: 'ℹ️' });
      return;
    }

    const nextType = availableTypes[0];
    const newRow: EditableRow = {
      rowId: `new_${Date.now()}_${nextType.typeKey}`,
      typeKey: nextType.typeKey,
      label: nextType.label,
      module: nextType.module,
      prefix1: nextType.defaultPrefix1,
      prefix2: nextType.defaultPrefix2,
      padLength: nextType.defaultPad,
      currentVal: 0,
      mode: nextType.defaultMode || (nextType.typeKey === 'tenant' ? 'manual' : undefined),
      isNew: true,
    };

    setRows((prev) => [...prev, newRow]);
  };

  // Reset row to system default values
  const handleResetRow = async (rowToReset: EditableRow) => {
    const docDef = DOC_TYPE_LOOKUP[rowToReset.typeKey];
    const defaultPrefix1 = docDef ? docDef.defaultPrefix1 : rowToReset.typeKey.slice(0, 3).toUpperCase();
    const defaultPrefix2: Prefix2Format = docDef ? docDef.defaultPrefix2 : 'none';
    const defaultPad = docDef ? docDef.defaultPad : 6;

    const confirmed = await confirmDialog(
      `Reset ${rowToReset.label} to default settings (${defaultPrefix1}, None, ${defaultPad} digits)?`,
      {
        title: `Reset ${rowToReset.label} to Default?`,
        confirmText: 'Reset to Default',
        cancelText: 'Cancel',
        danger: false,
      }
    );
    if (!confirmed) return;

    if (!rowToReset.isNew && activePropertyId) {
      try {
        await deleteSequence({ typeKey: rowToReset.typeKey, locationId: activePropertyId }).unwrap();
      } catch {
        // Continue with local reset
      }
    }

    const defaultMode = docDef?.defaultMode || (rowToReset.typeKey === 'tenant' ? 'manual' : undefined);

    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowToReset.rowId
          ? {
              ...r,
              prefix1: defaultPrefix1,
              prefix2: defaultPrefix2,
              padLength: defaultPad,
              mode: defaultMode,
            }
          : r
      )
    );
    toast.success(`${rowToReset.label} reset to default.`);
    refetch();
  };

  // Update a row field
  const handleUpdateField = <K extends keyof EditableRow>(rowId: string, field: K, value: EditableRow[K]) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const updated = { ...r, [field]: value };
        if (field === 'typeKey') {
          const docDef = DOC_TYPE_LOOKUP[value as string];
          if (docDef) {
            updated.label = docDef.label;
            updated.module = docDef.module;
            if (r.isNew) {
              updated.prefix1 = docDef.defaultPrefix1;
              updated.prefix2 = docDef.defaultPrefix2;
              updated.padLength = docDef.defaultPad;
              updated.mode = docDef.defaultMode;
            }
          }
        }
        return updated;
      })
    );
  };

  // Reset sequential counter
  const handleResetCounter = async (row: EditableRow) => {
    const confirmed = await confirmDialog(
      `Reset sequential counter for ${row.label}? Next issued document will restart from 1 (or 000001).`,
      {
        title: `Reset ${row.label} Counter?`,
        confirmText: 'Reset to 0',
        cancelText: 'Cancel',
        danger: true,
      }
    );
    if (!confirmed) return;

    try {
      await resetSequence({
        key: row.rowId || row.typeKey,
        value: 0,
        locationId: activePropertyId || undefined,
      }).unwrap();
      toast.success(`${row.label} counter reset to 0.`);
      refetch();
    } catch {
      toast.error('Failed to reset counter');
    }
  };

  // Save all rows for the active property
  const handleSave = async () => {
    if (!activePropertyId) {
      toast.error('No active property selected in the system');
      return;
    }

    const payload = {
      locationId: activePropertyId,
      items: rows.map((r) => ({
        typeKey: r.typeKey,
        prefix1: (r.prefix1 || '').trim().toUpperCase(),
        prefix2: r.prefix2,
        padLength: Number(r.padLength) || 6,
        mode: r.mode,
      })),
    };

    try {
      await bulkSaveSequences(payload).unwrap();
      const savedRows = rows.map((r) => ({ ...r, isNew: false }));
      setRows(savedRows);
      setInitialRows(savedRows);
      toast.success(
        `Prefix setup for ${activeProperty?.name || 'Active Property'} saved successfully!`
      );
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save prefix configuration';
      toast.error(msg);
    }
  };

  return (
    <div className="billing-page prefix-setup-page">
      {/* ── Standard PMS Page Header ─────────────────────────── */}
      <div className="page-header">
        <div className="page-title-row">
          <div
            className="page-icon-lg"
            style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent)', borderRadius: 12 }}
          >
            <Tag size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Prefix Setup</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {isLoading ? (
                <span
                  className="pms-skeleton-line"
                  style={{ display: 'inline-block', width: 96, height: 12, verticalAlign: 'middle' }}
                />
              ) : (
                `${filteredRows.length} total prefixes`
              )}
            </p>
          </div>

          <div className="prefix-header-actions">
            {isDirty && <span className="prefix-dirty-pill">● Unsaved Changes</span>}
            {availableTypes.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddRow}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} /> Add Prefix
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              title={isDirty ? 'Save changes' : 'No unsaved changes'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Save size={15} />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Toolbar (Standard Billing/Admin Style) ── */}
      <div className="billing-filters" style={showFilters ? { marginBottom: 12 } : undefined}>
        <div className="billing-filters-left">
          <div className="search-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search document type, module, or prefix…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                <X size={14} />
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

        {/* Quick Module Pills on Desktop */}
        <div className="prefix-module-pills">
          <button
            type="button"
            className={`prefix-mod-pill ${moduleFilter === '' ? 'active' : ''}`}
            onClick={() => setModuleFilter('')}
          >
            All
          </button>
          {MODULE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`prefix-mod-pill ${moduleFilter === m.id ? 'active' : ''}`}
              onClick={() => setModuleFilter(moduleFilter === m.id ? '' : m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="billing-filter-bar">
          <select
            className="filter-select"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            title="Module"
          >
            <option value="">All Modules</option>
            {MODULE_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Configuration Status"
          >
            <option value="">All Statuses</option>
            <option value="modified">Modified Only</option>
            <option value="default">Default Only</option>
          </select>

          <button
            type="button"
            className="btn-ghost billing-filter-reset-btn"
            onClick={handleResetFilters}
          >
            <X size={14} /> Reset
          </button>
        </div>
      )}

      {/* ── Standard PMS Table ─────────────────────────────── */}
      <div className="billing-table-wrap">
        <TableScrollWrapper>
          <table className="billing-table prefix-billing-table">
            <thead>
              <tr>
                <th style={{ minWidth: 210 }}>Document Type</th>
                <th style={{ width: 130 }}>Module</th>
                <th className="text-center" style={{ width: 140 }}>Mode</th>
                <th style={{ width: 130 }}>Prefix 1</th>
                <th style={{ width: 150 }}>Date Prefix</th>
                <th className="text-center" style={{ width: 110 }}>Digits</th>
                <th style={{ minWidth: 190 }}>Preview</th>
                <th className="text-center" style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeletonRows columns={8} />
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="billing-empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
                      No prefix configurations match your search or filter criteria.
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleResetFilters}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px' }}
                    >
                      <RotateCcw size={13} /> Reset Filters
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const sample = computeLiveSample(row.prefix1, row.prefix2, row.padLength, row.currentVal + 1);
                  const isModified = isRowModified(row);

                  return (
                    <tr key={row.rowId} className={row.isNew ? 'prefix-row-new' : ''}>
                      {/* Document Type */}
                      <td>
                        <div className="prefix-type-cell">
                          {row.isNew ? (
                            <select
                              className="prefix-field-select"
                              value={row.typeKey}
                              onChange={(e) => handleUpdateField(row.rowId, 'typeKey', e.target.value)}
                            >
                              <option value={row.typeKey}>{row.label}</option>
                              {availableTypes.map((d) => (
                                <option key={d.typeKey} value={d.typeKey}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="cell-primary">{row.label}</span>
                          )}
                          {isModified && (
                            <span
                              className="prefix-modified-tag"
                              title="Modified from default system configuration"
                            >
                              Modified
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Module */}
                      <td>
                        <span className="prefix-module-badge">
                          {MODULE_LABELS[row.module] || row.module}
                        </span>
                      </td>

                      {/* Mode */}
                      <td className="text-center">
                        {row.typeKey === 'tenant' ? (
                          <div className="prefix-mode-segmented" title="Code Generation Mode">
                            <button
                              type="button"
                              className={`prefix-seg-btn ${row.mode !== 'auto' ? 'active' : ''}`}
                              onClick={() => handleUpdateField(row.rowId, 'mode', 'manual')}
                            >
                              Manual
                            </button>
                            <button
                              type="button"
                              className={`prefix-seg-btn ${row.mode === 'auto' ? 'active' : ''}`}
                              onClick={() => handleUpdateField(row.rowId, 'mode', 'auto')}
                            >
                              Auto
                            </button>
                          </div>
                        ) : (
                          <span className="prefix-mode-static">Auto</span>
                        )}
                      </td>

                      {/* Prefix 1 */}
                      <td>
                        <input
                          type="text"
                          className="prefix-field-input prefix-field-code"
                          maxLength={10}
                          placeholder="e.g. INV"
                          value={row.prefix1}
                          onChange={(e) => {
                            const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                            handleUpdateField(row.rowId, 'prefix1', clean);
                          }}
                        />
                      </td>

                      {/* Date Prefix (Prefix 2) */}
                      <td>
                        <select
                          className="prefix-field-select"
                          value={row.prefix2}
                          onChange={(e) =>
                            handleUpdateField(row.rowId, 'prefix2', e.target.value as Prefix2Format)
                          }
                        >
                          <option value="none">None</option>
                          <option value="yymm">YYMM</option>
                          <option value="mmyy">MMYY</option>
                        </select>
                      </td>

                      {/* Digits (Pad Length) */}
                      <td className="text-center">
                        <input
                          type="number"
                          className="prefix-field-input prefix-field-digits"
                          min={3}
                          max={10}
                          value={row.padLength}
                          onChange={(e) =>
                            handleUpdateField(
                              row.rowId,
                              'padLength',
                              Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 6))
                            )
                          }
                        />
                      </td>

                      {/* Live Sample Preview */}
                      <td>
                        <div className="prefix-preview-wrap">
                          <span className="cell-mono prefix-preview-code">{sample}</span>
                          {row.currentVal > 0 && (
                            <button
                              type="button"
                              className="prefix-counter-reset-btn"
                              title={`Total issued so far: ${row.currentVal}. Click to reset counter to 0.`}
                              onClick={() => handleResetCounter(row)}
                            >
                              <RotateCcw size={11} />
                              <span>{row.currentVal} issued</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Row Reset Action (Only shown when modified) */}
                      <td className="text-center">
                        {isModified ? (
                          <button
                            type="button"
                            className="btn-icon prefix-row-reset-btn"
                            onClick={() => handleResetRow(row)}
                            title={`Reset ${row.label} to default`}
                          >
                            <RotateCcw size={14} />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScrollWrapper>

        {/* Pagination */}
        {totalItems >= 10 && (
          <div className="billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="prefix-page-size">Rows per page:</label>
                <select
                  id="prefix-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="page-btns">
              <button
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
