import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppDispatch } from '../../../store';
import { setBulkCreateOpen } from '../../../store/slices/unitsSlice';
import { useBulkCreateUnitsMutation, useGetUnitTypesQuery, useCheckBulkConflictsMutation } from '../../../store/api/unitsApi';
import { useGetFloorSetupsQuery } from '../../../store/api/propertiesApi';
import { useGetCurrencyRatesQuery } from '../../../store/api/billingApi';
import type { Tower } from '../../../store/api/unitsApi';
import { X, AlertCircle, CheckCircle, Layers, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import './BulkCreateModal.css';

interface Props {
  propertyId: string;
  towers: Tower[];
}

export function BulkCreateModal({ propertyId, towers }: Props) {
  const dispatch = useAppDispatch();
  const { data: typesData } = useGetUnitTypesQuery();
  const { data: floorSetupsData } = useGetFloorSetupsQuery({ propertyId });
  const { data: currencyRatesData } = useGetCurrencyRatesQuery({ propertyId });
  const [bulkCreate, { isLoading }] = useBulkCreateUnitsMutation();
  const [checkConflicts] = useCheckBulkConflictsMutation();

  const [form, setForm] = useState({
    towerId: '',
    fromFloor: 1,
    toFloor: 1,
    unitsPerFloor: 4,
    unitTypeId: '',
    areaSqft: '' as number | '',
    currency: '',
    useFloorLabelPrefix: true,
  });

  // Currency options come from the property's Currency Rates; default to the base currency
  const currencyOptions = useMemo(
    () => (currencyRatesData?.data || []).filter((c) => c.isActive !== false),
    [currencyRatesData],
  );
  useEffect(() => {
    if (form.currency || currencyOptions.length === 0) return;
    const base = currencyOptions.find((c) => c.isBaseCurrency) ?? currencyOptions[0];
    setForm((f) => (f.currency ? f : { ...f, currency: base.currency }));
  }, [currencyOptions, form.currency]);

  // Fixed separator between the floor label and the sequence number (e.g. "8F-01")
  const UNIT_NUMBER_SEPARATOR = '-';

  const unitTypes = typesData?.data || [];
  const invalidFloorRange = form.toFloor < form.fromFloor;

  // ── Floor labels and prefixes (from Floor Setup) ─────────
  const floorLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of floorSetupsData?.data || []) map.set(f.floorNumber, f.floorLabel);
    return map;
  }, [floorSetupsData]);

  // prefix field from Floor Setup (independent of label)
  const floorPrefixMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of floorSetupsData?.data || []) {
      if (f.prefix) map.set(f.floorNumber, f.prefix);
    }
    return map;
  }, [floorSetupsData]);

  // Highest floor number actually configured for this property — To Floor can't go past it
  const maxFloorNumber = useMemo(() => {
    const nums = (floorSetupsData?.data || []).map((f) => f.floorNumber);
    return nums.length ? Math.max(...nums) : undefined;
  }, [floorSetupsData]);

  const floorsMissingPrefix = useMemo(() => {
    const missing: number[] = [];
    for (let floor = form.fromFloor; floor <= form.toFloor; floor++) {
      if (!floorPrefixMap.has(floor)) missing.push(floor);
    }
    return missing;
  }, [form.fromFloor, form.toFloor, floorPrefixMap]);

  const hasMissingPrefixWarning = form.useFloorLabelPrefix && !!form.unitTypeId && !invalidFloorRange && floorsMissingPrefix.length > 0;
  const [plainPrefixConfirmed, setPlainPrefixConfirmed] = useState<boolean | null>(null);
  const [showPrefixConfirmPopup, setShowPrefixConfirmPopup] = useState(false);

  const missingPrefixKey = floorsMissingPrefix.join(',');
  useEffect(() => {
    setPlainPrefixConfirmed(null);
    if (!hasMissingPrefixWarning) {
      setShowPrefixConfirmPopup(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowPrefixConfirmPopup(true);
    }, 450);
    return () => clearTimeout(timer);
  }, [missingPrefixKey, hasMissingPrefixWarning, form.useFloorLabelPrefix, form.unitTypeId]);

  // ── Conflict pre-check state ────────────────
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Generate ALL units (not limited) ────────
  // Unit numbers use the prefix from Floor Setup. Falls back to plain floor number
  // when no prefix is set for that floor.
  const allUnits = useMemo(() => {
    const list: Array<{ unitNumber: string; floor: number }> = [];
    if (!form.unitTypeId) return list;
    for (let floor = form.fromFloor; floor <= form.toFloor; floor++) {
      const floorPrefix = floorPrefixMap.get(floor) ?? String(floor);
      const numberPrefix = form.useFloorLabelPrefix ? floorPrefix : String(floor);
      for (let u = 1; u <= form.unitsPerFloor; u++) {
        list.push({ unitNumber: `${numberPrefix}${UNIT_NUMBER_SEPARATOR}${u.toString().padStart(2, '0')}`, floor });
      }
    }
    return list;
  }, [form.fromFloor, form.toFloor, form.unitsPerFloor, form.unitTypeId, form.useFloorLabelPrefix, floorPrefixMap]);

  const allUnitNumbers = useMemo(() => allUnits.map((u) => u.unitNumber), [allUnits]);

  // Preview (first 20)
  const previewUnits = useMemo(() => allUnits.slice(0, 20), [allUnits]);
  const totalUnits = allUnits.length;

  // ── Debounced conflict check ────────────────
  const runConflictCheck = useCallback(async (unitNumbers: string[]) => {
    if (unitNumbers.length === 0 || unitNumbers.length > 500) {
      setConflicts(new Set());
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const result = await checkConflicts({ propertyId, unitNumbers }).unwrap();
      const conflictSet = new Set((result.data.conflicts || []).map((c: string) => c.toLowerCase()));
      setConflicts(conflictSet);
    } catch {
      setConflicts(new Set());
    }
    setChecking(false);
  }, [checkConflicts, propertyId]);

  // Trigger debounced check when unit numbers change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (allUnitNumbers.length === 0 || allUnitNumbers.length > 500) {
      setConflicts(new Set());
      return;
    }
    setChecking(true);
    debounceRef.current = setTimeout(() => {
      runConflictCheck(allUnitNumbers);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [allUnitNumbers, runConflictCheck]);

  const conflictCount = conflicts.size;
  const creatableUnits = Math.max(0, totalUnits - conflictCount);
  const isPrefixUnconfirmed = hasMissingPrefixWarning && plainPrefixConfirmed !== true;

  const handleCreate = async () => {
    if (!form.unitTypeId) { toast.error('Select a unit type'); return; }
    if (invalidFloorRange) { toast.error('To Floor must be greater than or equal to From Floor'); return; }
    if (totalUnits > 500) { toast.error('Maximum 500 units per bulk operation'); return; }
    if (creatableUnits === 0) { toast.error(`All ${conflictCount} unit number(s) already exist — change the range`); return; }
    if (isPrefixUnconfirmed) {
      setShowPrefixConfirmPopup(true);
      return;
    }

    try {
      const result = await bulkCreate({
        propertyId,
        data: {
          towerId: form.towerId || undefined,
          floorRange: {
            from: form.fromFloor,
            to: form.toFloor,
            unitsPerFloor: form.unitsPerFloor,
            unitTypeId: form.unitTypeId,
            areaSqft: form.areaSqft ? Number(form.areaSqft) : undefined,
            prefix: UNIT_NUMBER_SEPARATOR,
            useFloorLabelPrefix: form.useFloorLabelPrefix,
            currency: form.currency || undefined,
          },
        },
      }).unwrap();
      toast.success(`✅ Created ${result.data.created} units`);
      dispatch(setBulkCreateOpen(false));
    } catch (e: any) {
      const apiError = e?.data?.errors?.[0];
      const serverConflicts = apiError?.meta?.conflicts as string[] | undefined;
      toast.error(serverConflicts?.length
        ? `${serverConflicts.length} unit number(s) already exist: ${serverConflicts.slice(0, 3).join(', ')}…`
        : apiError?.message || 'Bulk create failed');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bulk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><Layers size={18} /> Bulk Create Units</div>
          <button onClick={() => dispatch(setBulkCreateOpen(false))}><X size={18} /></button>
        </div>

        <div className="bulk-body">
          <div className="bulk-form">
            {/* Tower */}
            <div className="form-field">
              <label>Tower / Block (optional)</label>
              <select value={form.towerId} onChange={(e) => setForm({ ...form, towerId: e.target.value })}>
                <option value="">No tower</option>
                {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* Unit type */}
            <div className="form-field">
              <label>Unit Type *</label>
              <select value={form.unitTypeId} onChange={(e) => setForm({ ...form, unitTypeId: e.target.value })}>
                <option value="">Select type…</option>
                {['residential', 'commercial', 'storage', 'parking'].map((cat) => (
                  <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                    {unitTypes.filter((t) => t.category === cat).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div className="form-field">
              <label>Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="">No currency</option>
                {currencyOptions.map((c) => (
                  <option key={c.id} value={c.currency}>
                    {c.currency}{c.isBaseCurrency ? ' (base)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Floor range */}
            <div className="form-row-2">
              <div className="form-field">
                <label>From Floor</label>
                <input type="number" min={-5} max={200} value={form.fromFloor}
                  onChange={(e) => setForm({ ...form, fromFloor: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form-field">
                <label className="ff-label-row">To Floor {maxFloorNumber != null && <span className="field-hint">(up to {maxFloorNumber})</span>}</label>
                <input type="number" min={form.fromFloor} max={maxFloorNumber ?? 200} value={form.toFloor}
                  className={invalidFloorRange ? 'field-error' : ''}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value) || 1;
                    const clamped = maxFloorNumber != null ? Math.min(raw, maxFloorNumber) : raw;
                    setForm({ ...form, toFloor: clamped });
                  }} />
                {invalidFloorRange && <span className="field-error-msg">Must be ≥ From Floor</span>}
              </div>
            </div>

            <label className="bulk-checkbox-row" title="Prefix each generated unit number with its floor's prefix (from Floor Setup) instead of the plain floor number">
              <input
                type="checkbox"
                checked={form.useFloorLabelPrefix}
                onChange={(e) => setForm({ ...form, useFloorLabelPrefix: e.target.checked })}
              />
              Use prefix from Floor Setup
            </label>

            <div className="form-row-2">
              <div className="form-field">
                <label>Units per Floor</label>
                <input type="number" min={1} max={50} value={form.unitsPerFloor}
                  onChange={(e) => setForm({ ...form, unitsPerFloor: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form-field">
                <label>Area (sqft, optional)</label>
                <input type="number" placeholder="e.g. 750" value={form.areaSqft}
                  onChange={(e) => setForm({ ...form, areaSqft: e.target.value ? parseFloat(e.target.value) : '' })} />
              </div>
            </div>

            {/* Total summary */}
            <div className={`total-summary ${totalUnits > 500 ? 'over-limit' : ''}`}>
              {totalUnits > 500 ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
              <span>Will create <strong>{totalUnits}</strong> units{totalUnits > 500 ? ' — max 500' : ''}</span>
            </div>

            {/* Conflict warning */}
            {conflictCount > 0 && (
              <div className="conflict-warning">
                <AlertTriangle size={14} />
                <span>
                  <strong>{conflictCount}</strong> unit number{conflictCount !== 1 ? 's' : ''} already exist{conflictCount === 1 ? 's' : ''} and will be skipped
                </span>
              </div>
            )}

            {/* Missing floor prefix warning */}
            {hasMissingPrefixWarning && (
              <div
                className="conflict-warning"
                style={{ cursor: 'pointer' }}
                title="Click to confirm or cancel using plain floor number prefix"
                onClick={() => setShowPrefixConfirmPopup(true)}
              >
                <AlertTriangle size={14} />
                <span>
                  Floor{floorsMissingPrefix.length !== 1 ? 's' : ''} {floorsMissingPrefix.join(', ')} {floorsMissingPrefix.length !== 1 ? "don't" : "doesn't"} have a prefix in Floor Setup — they'll use the plain floor number
                </span>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bulk-preview">
            <div className="preview-header">
              Preview (first {Math.min(previewUnits.length, 20)})
              {checking && <span className="preview-checking"> · checking…</span>}
            </div>
            {previewUnits.length === 0
              ? <div className="preview-empty">Select type and set range to preview</div>
              : (
                <div className="preview-grid">
                  {previewUnits.map(({ unitNumber: n, floor }) => {
                    const isConflict = conflicts.has(n.toLowerCase());
                    const floorLabel = floorLabelMap.get(floor) ?? String(floor);
                    const title = isConflict ? `"${n}" already exists` : `${n} · Floor ${floorLabel}`;
                    return (
                      <div
                        key={n}
                        className={`preview-cell ${isConflict ? 'conflict' : ''}`}
                        title={title}
                      >
                        {n}
                      </div>
                    );
                  })}
                  {totalUnits > 20 && (
                    <div className="preview-more">… and {totalUnits - 20} more</div>
                  )}
                </div>
              )
            }
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={() => dispatch(setBulkCreateOpen(false))}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate}
            disabled={isLoading || checking || invalidFloorRange || totalUnits > 500 || !form.unitTypeId || creatableUnits === 0 || isPrefixUnconfirmed}>
            {isLoading ? 'Creating…' : `Create ${totalUnits} Units`}
          </button>
        </div>
      </div>

      {/* Popup Confirm Modal for Missing Floor Setup Prefix */}
      {showPrefixConfirmPopup && hasMissingPrefixWarning && (
        <div className="modal-overlay" style={{ zIndex: 600 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ color: 'var(--warning)' }}>
                <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
                <span>Confirm Plain Prefix</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlainPrefixConfirmed(false);
                  setShowPrefixConfirmPopup(false);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="conflict-warning">
                <AlertTriangle size={14} />
                <span>
                  Floor{floorsMissingPrefix.length !== 1 ? 's' : ''} <strong>{floorsMissingPrefix.join(', ')}</strong> {floorsMissingPrefix.length !== 1 ? "don't" : "doesn't"} have a prefix in Floor Setup — they'll use the plain floor number. Do you want to proceed with plain prefix?
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setPlainPrefixConfirmed(false);
                  setShowPrefixConfirmPopup(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setPlainPrefixConfirmed(true);
                  setShowPrefixConfirmPopup(false);
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
