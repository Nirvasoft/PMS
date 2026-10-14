import { useState, useMemo, useEffect } from 'react';
import {
  Tag,
  Save,
  Plus,
  RotateCcw,
  Lock,
  Info,
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
import { useV6IntegrationStatus } from '../../../hooks/useV6IntegrationStatus';
import { useConfirm } from '../../../components/DialogProvider';
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

const MODULE_TABS = [
  { id: 'organization', label: 'Organization' },
  { id: 'leasing', label: 'Leasing' },
  { id: 'crm', label: 'CRM' },
  { id: 'billing', label: 'Billing' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'parking', label: 'Parking' },
  { id: 'security', label: 'Security' },
];

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
  const cleanPrefix = (prefix1 || '').trim().toUpperCase() || 'DOC';
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

  if (datePart) {
    return `${cleanPrefix}-${datePart}-${padded}`;
  }
  return `${cleanPrefix}-${padded}`;
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
  const { isV6Active } = useV6IntegrationStatus();

  // Active Property from global application context
  const activePropertyId = useSelectedPropertyId();
  const { data: propertiesScope } = useGetMyPropertyScopeQuery();
  const properties = propertiesScope?.data || [];
  const activeProperty = useMemo(() => {
    return properties.find((p) => p.id === activePropertyId) || null;
  }, [properties, activePropertyId]);

  const [activeTab, setActiveTab] = useState<string>('organization');

  // Fetch sequences from server for the active property
  const { data: serverSequences = [], isLoading, refetch } = useGetSequencesQuery(
    activePropertyId ? { locationId: activePropertyId } : undefined,
    { skip: !activePropertyId }
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
      const mapped: EditableRow[] = serverSequences.map((s) => {
        const isLockedTenant = s.typeKey === 'tenant' && isV6Active;
        return {
          rowId: s.id || s.typeKey,
          typeKey: s.typeKey,
          label: s.label || DOC_TYPE_LOOKUP[s.typeKey]?.label || s.typeKey,
          module: DOC_TYPE_LOOKUP[s.typeKey]?.module || s.module || 'organization',
          prefix1: isLockedTenant ? 'TNT' : s.prefix1,
          prefix2: isLockedTenant ? 'none' : (s.prefix2 || 'none'),
          padLength: isLockedTenant ? 6 : (s.padLength || 6),
          currentVal: s.currentVal || 0,
          mode: isLockedTenant ? 'manual' : (s.mode || (s.typeKey === 'tenant' ? 'manual' : undefined)),
          isNew: false,
        };
      });
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
  }, [serverSequences, isV6Active]);

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

  // Active module rows
  const activeRows = useMemo(() => {
    return rows.filter((r) => r.module === activeTab);
  }, [rows, activeTab]);

  // Available document types for active tab that haven't been added yet
  const availableTypesForTab = useMemo(() => {
    const existingKeys = new Set(activeRows.map((r) => r.typeKey));
    return PMS_DOCUMENT_TYPES.filter((d) => d.module === activeTab && !existingKeys.has(d.typeKey));
  }, [activeRows, activeTab]);

  // Handle Tab Change
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
  };

  // Add new row to current active tab
  const handleAddRow = () => {
    if (availableTypesForTab.length === 0) {
      toast('All document types for this module are already in the list.', { icon: 'ℹ️' });
      return;
    }

    const nextType = availableTypesForTab[0];
    const newRow: EditableRow = {
      rowId: `new_${Date.now()}_${nextType.typeKey}`,
      typeKey: nextType.typeKey,
      label: nextType.label,
      module: activeTab,
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

    // Delete custom property override from server if it was saved
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

    // Validate rows
    for (const r of rows) {
      if (!r.prefix1.trim()) {
        toast.error(`Prefix cannot be empty for ${r.label}`);
        return;
      }
    }

    const payload = {
      locationId: activePropertyId,
      items: rows.map((r) => ({
        typeKey: r.typeKey,
        prefix1: r.prefix1.trim().toUpperCase(),
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
    <div className="prefix-setup-page">
      {/* ── Top Header matching PMS System ─────────────────── */}
      <div className="prefix-page-header">
        <div className="prefix-header-left">
          <div className="prefix-icon-badge">
            <Tag size={22} />
          </div>
          <div>
            <h1 className="prefix-title">Prefix Setup</h1>
          </div>
        </div>

        <div className="prefix-header-actions">
          {isDirty && <span className="prefix-dirty-pill">● Unsaved Changes</span>}

          <button
            type="button"
            className="btn btn-primary prefix-save-btn"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            title={isDirty ? 'Save changes' : 'No unsaved changes'}
          >
            {isDirty ? <Save size={16} /> : null}
            <span>{isSaving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* ── Module Tabs Bar (Pill Button Style) ─ */}
      <div className="prefix-tabs-bar">
        {MODULE_TABS.map((tab) => {
          const count = rows.filter((r) => r.module === tab.id).length;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              className={`perm-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span>{tab.label}</span>
              <span className="perm-tab-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Main Setup Card (Table Only) ───────────────────────────────── */}
      <div className="prefix-card">
        {/* V6 ERP Notice when Active */}
        {isV6Active && activeTab === 'organization' && (
          <div className="prefix-v6-notice">
            <Info size={15} />
            <span>
              <strong>V6 ERP Active:</strong> Tenant codes are managed and synchronized from V6 ERP. Tenant code sequence is locked to default manual mode.
            </span>
          </div>
        )}

        {/* ── Dynamic Prefix Table with Evenly Spaced Columns ─ */}
        <div className="prefix-table-container">
          {isLoading ? (
            <div className="prefix-loading-wrap">
              <div className="prefix-spinner" />
              <p>Loading document sequence configurations...</p>
            </div>
          ) : (
            <table className="prefix-data-table">
              <thead>
                <tr>
                  <th style={{ width: '44px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '22%' }}>Type</th>
                  <th style={{ width: '14%' }}>Mode</th>
                  <th style={{ width: '13%' }}>Prefix 1</th>
                  <th style={{ width: '16%' }}>Prefix 2</th>
                  <th style={{ width: '11%' }}>Length</th>
                  <th style={{ width: '24%' }}>Preview</th>
                  <th style={{ width: '76px', textAlign: 'center' }} aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="prefix-empty-cell">
                      <div className="prefix-empty-content">
                        <p>No document types configured for this module.</p>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleAddRow}
                          disabled={availableTypesForTab.length === 0}
                        >
                          <Plus size={14} />
                          <span>Add Document Type</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  activeRows.map((row, index) => {
                    const sample = computeLiveSample(row.prefix1, row.prefix2, row.padLength, row.currentVal + 1);
                    const isModified = isRowModified(row);
                    const isTenantLocked = row.typeKey === 'tenant' && isV6Active;

                    return (
                      <tr key={row.rowId} className={row.isNew ? 'row-new' : ''}>
                        {/* Index */}
                        <td className="prefix-row-index">{index + 1}</td>

                        {/* Document Type Dropdown & Status Badge */}
                        <td>
                          <div className="prefix-doc-type-cell">
                            <div className="prefix-type-main">
                              {row.isNew ? (
                                <select
                                  className="prefix-input-select"
                                  value={row.typeKey}
                                  onChange={(e) => handleUpdateField(row.rowId, 'typeKey', e.target.value)}
                                >
                                  <option value={row.typeKey}>{row.label}</option>
                                  {availableTypesForTab.map((d) => (
                                    <option key={d.typeKey} value={d.typeKey}>
                                      {d.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="prefix-type-title">{row.label}</span>
                              )}
                              {isTenantLocked && (
                                <span className="prefix-v6-tag" title="Tenant codes are synchronized from V6 ERP">
                                  <Lock size={10} /> V6 ERP
                                </span>
                              )}
                              <span
                                className={`prefix-status-badge ${isModified ? 'status-modified' : 'status-default'}`}
                                title={isModified ? 'Modified from system default settings' : 'Using system default settings'}
                              >
                                {isModified ? 'Modified' : 'Default'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Mode Column */}
                        <td>
                          {row.typeKey === 'tenant' ? (
                            <div className="prefix-mode-cell" title={isTenantLocked ? "Locked by V6 ERP Integration" : "Code Generation Mode"}>
                              {isTenantLocked ? (
                                <span className="prefix-mode-pill active prefix-mode-locked" title="Tenant codes are managed by V6 ERP">
                                  Manual (V6 Synced)
                                </span>
                              ) : (
                                <div className="prefix-mode-toggle">
                                  <button
                                    type="button"
                                    className={`prefix-mode-pill ${row.mode !== 'auto' ? 'active' : ''}`}
                                    onClick={() => handleUpdateField(row.rowId, 'mode', 'manual')}
                                  >
                                    Manual
                                  </button>
                                  <button
                                    type="button"
                                    className={`prefix-mode-pill ${row.mode === 'auto' ? 'active' : ''}`}
                                    onClick={() => handleUpdateField(row.rowId, 'mode', 'auto')}
                                  >
                                    Auto
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="prefix-mode-auto-badge" title="Automatically numbered sequence">
                              Auto
                            </span>
                          )}
                        </td>

                        {/* Prefix 1 (Text input) */}
                        <td>
                          <input
                            type="text"
                            className="prefix-input-text"
                            maxLength={10}
                            placeholder="e.g. INV"
                            value={row.prefix1}
                            disabled={isTenantLocked}
                            title={isTenantLocked ? "Locked: Managed by V6 ERP" : undefined}
                            onChange={(e) => {
                              const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                              handleUpdateField(row.rowId, 'prefix1', clean);
                            }}
                          />
                        </td>

                        {/* Prefix 2 (Date format dropdown) */}
                        <td>
                          <select
                            className="prefix-input-select"
                            value={row.prefix2}
                            disabled={isTenantLocked}
                            title={isTenantLocked ? "Locked: Managed by V6 ERP" : undefined}
                            onChange={(e) =>
                              handleUpdateField(row.rowId, 'prefix2', e.target.value as Prefix2Format)
                            }
                          >
                            <option value="none">None</option>
                            <option value="yymm">YYMM</option>
                            <option value="mmyy">MMYY</option>
                          </select>
                        </td>

                        {/* Length (Padding Digits) */}
                        <td>
                          <input
                            type="number"
                            className="prefix-input-number"
                            min={3}
                            max={10}
                            value={row.padLength}
                            disabled={isTenantLocked}
                            title={isTenantLocked ? "Locked: Managed by V6 ERP" : undefined}
                            onChange={(e) =>
                              handleUpdateField(
                                row.rowId,
                                'padLength',
                                Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 6))
                              )
                            }
                          />
                        </td>

                        {/* Real-time Sample Preview */}
                        <td className="prefix-preview-td">
                          <div className="prefix-preview-cell">
                            <span className="prefix-sample-pill">{sample}</span>
                            {row.currentVal > 0 && (
                              <span
                                className="prefix-counter-subtext"
                                title={`Total documents issued so far: ${row.currentVal}. Click to reset.`}
                                onClick={() => handleResetCounter(row)}
                              >
                                <RotateCcw size={11} /> {row.currentVal} issued
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Reset to Default Button */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={`prefix-btn-reset-text ${(!isModified || isTenantLocked) ? 'is-default' : ''}`}
                            onClick={() => isModified && !isTenantLocked && handleResetRow(row)}
                            disabled={!isModified || isTenantLocked}
                            title={isTenantLocked ? "Locked: Managed by V6 ERP" : isModified ? `Reset ${row.label} to default settings` : `${row.label} is already using default settings`}
                          >
                            Reset
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Table Footer Summary (Add Row Button if any types remain) ──── */}
        {availableTypesForTab.length > 0 && (
          <div className="prefix-card-footer" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAddRow}
            >
              <Plus size={14} />
              <span>Add Document Type ({availableTypesForTab.length} remaining)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
