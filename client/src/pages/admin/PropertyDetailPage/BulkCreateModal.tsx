import { useState, useMemo } from 'react';
import { useAppDispatch } from '../../../store';
import { setBulkCreateOpen } from '../../../store/slices/unitsSlice';
import { useBulkCreateUnitsMutation, useGetUnitTypesQuery } from '../../../store/api/unitsApi';
import type { Tower } from '../../../store/api/unitsApi';
import { X, AlertCircle, CheckCircle, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import './BulkCreateModal.css';

interface Props {
  propertyId: string;
  towers: Tower[];
}

export function BulkCreateModal({ propertyId, towers }: Props) {
  const dispatch = useAppDispatch();
  const { data: typesData } = useGetUnitTypesQuery();
  const [bulkCreate, { isLoading }] = useBulkCreateUnitsMutation();

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

  // Preview generated unit numbers
  const previewUnits = useMemo(() => {
    const units: string[] = [];
    if (!form.unitTypeId) return units;
    for (let floor = form.fromFloor; floor <= form.toFloor && units.length < 20; floor++) {
      for (let u = 1; u <= form.unitsPerFloor && units.length < 20; u++) {
        units.push(`${floor}${form.prefix}${u.toString().padStart(2, '0')}`);
      }
    }
    return units;
  }, [form.fromFloor, form.toFloor, form.unitsPerFloor, form.prefix, form.unitTypeId]);

  const totalUnits = (form.toFloor - form.fromFloor + 1) * form.unitsPerFloor;

  const handleCreate = async () => {
    if (!form.unitTypeId) { toast.error('Select a unit type'); return; }
    if (form.fromFloor > form.toFloor) { toast.error('Invalid floor range'); return; }
    if (totalUnits > 500) { toast.error('Maximum 500 units per bulk operation'); return; }

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
      const conflicts = e?.data?.details?.conflicts;
      toast.error(conflicts
        ? `${conflicts.length} unit number(s) already exist: ${conflicts.slice(0, 3).join(', ')}…`
        : 'Bulk create failed');
    }
  };

  return (
    <div className="modal-overlay" onClick={() => dispatch(setBulkCreateOpen(false))}>
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
          </div>

          {/* Preview */}
          <div className="bulk-preview">
            <div className="preview-header">Preview (first {Math.min(previewUnits.length, 20)})</div>
            {previewUnits.length === 0
              ? <div className="preview-empty">Select type and set range to preview</div>
              : (
                <div className="preview-grid">
                  {previewUnits.map((n) => <div key={n} className="preview-cell">{n}</div>)}
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
          <button className="btn-primary" onClick={handleCreate} disabled={isLoading || totalUnits > 500 || !form.unitTypeId}>
            {isLoading ? 'Creating…' : `Create ${totalUnits} Units`}
          </button>
        </div>
      </div>
    </div>
  );
}
