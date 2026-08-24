import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppDispatch } from '../../../store';
import { setBulkCreateOpen } from '../../../store/slices/unitsSlice';
import { useBulkCreateUnitsMutation, useGetUnitTypesQuery, useCheckBulkConflictsMutation } from '../../../store/api/unitsApi';
import { useGetFloorSetupsQuery } from '../../../store/api/propertiesApi';
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
  const [bulkCreate, { isLoading }] = useBulkCreateUnitsMutation();
  const [checkConflicts] = useCheckBulkConflictsMutation();

  const [form, setForm] = useState({
    towerId: '',
    fromFloor: 1,
    toFloor: 10,
    unitsPerFloor: 4,
    unitTypeId: '',
    areaSqft: '' as number | '',
    prefix: '',
  });

  const unitTypes = typesData?.data || [];

  // ── Floor labels (from Floor Setup) ─────────
  const floorLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of floorSetupsData?.data || []) map.set(f.floorNumber, f.floorLabel);
    return map;
  }, [floorSetupsData]);

  const floorsMissingLabel = useMemo(() => {
    const missing: number[] = [];
    for (let floor = form.fromFloor; floor <= form.toFloor; floor++) {
      if (!floorLabelMap.has(floor)) missing.push(floor);
    }
    return missing;
  }, [form.fromFloor, form.toFloor, floorLabelMap]);

  // ── Conflict pre-check state ────────────────
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Generate ALL units (not limited) ────────
  const allUnits = useMemo(() => {
    const list: Array<{ unitNumber: string; floor: number }> = [];
    if (!form.unitTypeId) return list;
    for (let floor = form.fromFloor; floor <= form.toFloor; floor++) {
      for (let u = 1; u <= form.unitsPerFloor; u++) {
        list.push({ unitNumber: `${floor}${form.prefix}${u.toString().padStart(2, '0')}`, floor });
      }
    }
    return list;
  }, [form.fromFloor, form.toFloor, form.unitsPerFloor, form.prefix, form.unitTypeId]);

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

  const handleCreate = async () => {
    if (!form.unitTypeId) { toast.error('Select a unit type'); return; }
    if (form.fromFloor > form.toFloor) { toast.error('Invalid floor range'); return; }
    if (totalUnits > 500) { toast.error('Maximum 500 units per bulk operation'); return; }
    if (conflictCount > 0) { toast.error(`${conflictCount} unit number(s) already exist — change the range or prefix`); return; }

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
            prefix: form.prefix,
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

            {/* Floor range */}
            <div className="form-row-2">
              <div className="form-field">
                <label>From Floor</label>
                <input type="number" min={-5} max={200} value={form.fromFloor}
                  onChange={(e) => setForm({ ...form, fromFloor: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form-field">
                <label>To Floor</label>
                <input type="number" min={-5} max={200} value={form.toFloor}
                  onChange={(e) => setForm({ ...form, toFloor: parseInt(e.target.value) || 1 })} />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-field">
                <label>Units per Floor</label>
                <input type="number" min={1} max={50} value={form.unitsPerFloor}
                  onChange={(e) => setForm({ ...form, unitsPerFloor: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form-field">
                <label>Number Separator (optional)</label>
                <input placeholder='e.g. "-"' value={form.prefix} maxLength={2}
                  onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
              </div>
            </div>

            <div className="form-field">
              <label>Area (sqft, optional — applied to all units)</label>
              <input type="number" placeholder="e.g. 750" value={form.areaSqft}
                onChange={(e) => setForm({ ...form, areaSqft: e.target.value ? parseFloat(e.target.value) : '' })} />
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

            {/* Missing floor label warning */}
            {form.unitTypeId && floorsMissingLabel.length > 0 && (
              <div className="conflict-warning">
                <AlertTriangle size={14} />
                <span>
                  Floor{floorsMissingLabel.length !== 1 ? 's' : ''} {floorsMissingLabel.join(', ')} {floorsMissingLabel.length !== 1 ? "aren't" : "isn't"} set up in Floor Setup — they'll use the plain floor number as the label
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
            disabled={isLoading || checking || totalUnits > 500 || !form.unitTypeId || conflictCount > 0}>
            {isLoading ? 'Creating…' : `Create ${totalUnits} Units`}
          </button>
        </div>
      </div>
    </div>
  );
}
