import { useState, useMemo } from 'react';
import {
  useGetFloorSetupsQuery, useCreateFloorSetupMutation, useUpdateFloorSetupMutation, useDeleteFloorSetupMutation,
  type FloorSetup,
} from '../../../store/api/propertiesApi';
import { Building2, Plus, X, Pencil, Trash2, Settings2 } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard, usePermission } from '../../../components/guards/PermissionGuard';
import './FloorSetupTab.css';

// Unicode superscript letters — native <option> text can't render <sup> HTML, so the
// suffix is composed from real superscript characters instead (1ˢᵗ, 2ⁿᵈ, 3ʳᵈ, 4ᵗʰ...).
const SUPERSCRIPT: Record<string, string> = { s: 'ˢ', t: 'ᵗ', n: 'ⁿ', d: 'ᵈ', r: 'ʳ', h: 'ʰ' };
const toSuperscript = (s: string) => s.split('').map((c) => SUPERSCRIPT[c] || c).join('');

/** 1 -> "1ˢᵗ Floor", 2 -> "2ⁿᵈ Floor", 3 -> "3ʳᵈ Floor", 4 -> "4ᵗʰ Floor", 11-13 -> "ᵗʰ" */
function ordinalFloorLabel(n: number): string {
  const suffix = plainOrdinalSuffix(n);
  return `${n}${toSuperscript(suffix)} Floor`;
}

function plainOrdinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

/**
 * Deterministic hue/saturation/lightness for this property's tower, matching the palette
 * formula used in the cross-portfolio Floor Setup skyline so a single property's tower looks
 * the same here as it does there.
 */
const HUE_BASE = 158;
const HUE_SPREAD = 42;
const SAT_MIN = 52;
const SAT_MAX = 78;
const LIGHT_SPREAD = 9;

function hashStr(id: string, multiplier: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * multiplier + id.charCodeAt(i)) % 997;
  return h;
}

function paletteForId(id: string): { hue: number; sat: number; lightShift: number } {
  const hue = HUE_BASE - HUE_SPREAD + (hashStr(id, 31) % (HUE_SPREAD * 2 + 1));
  const sat = SAT_MIN + (hashStr(id, 53) % (SAT_MAX - SAT_MIN + 1));
  const lightShift = -LIGHT_SPREAD + (hashStr(id, 17) % (LIGHT_SPREAD * 2 + 1));
  return { hue, sat, lightShift };
}

/* ── Smart label prediction ──────────────────────────
   If the user already labeled floor 1 "B2", the next floors should continue
   that scheme ("B3", "B4"…) instead of resetting to generic "Nth Floor". */
interface LabelAnchor { floorNumber: number; prefix: string; num: number; suffix: string }

/** Parses a label like "B2" or "Level 12A" into a prefix/number/suffix anchor; null if it has no number to continue from. */
function parseLabelAnchor(floorNumber: number, label: string): LabelAnchor | null {
  const m = label.match(/^(\D*?)(\d+)(\D*)$/);
  if (!m) return null;
  return { floorNumber, prefix: m[1], num: parseInt(m[2], 10), suffix: m[3] };
}

/** Groups existing labels by their textual pattern (prefix+suffix) and derives each group's per-floor step. */
function buildLabelGroups(fm: Map<number, FloorSetup> | undefined): { anchors: LabelAnchor[]; slope: number }[] {
  if (!fm) return [];
  const anchors: LabelAnchor[] = [];
  fm.forEach((f) => {
    const a = parseLabelAnchor(f.floorNumber, f.floorLabel);
    if (a) anchors.push(a);
  });
  const groups = new Map<string, LabelAnchor[]>();
  anchors.forEach((a) => {
    const key = `${a.prefix} ${a.suffix}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  });
  return [...groups.values()].map((list) => {
    list.sort((x, y) => x.floorNumber - y.floorNumber);
    let slope = 1;
    if (list.length >= 2) {
      const first = list[0], last = list[list.length - 1];
      const raw = (last.num - first.num) / (last.floorNumber - first.floorNumber);
      if (Number.isFinite(raw) && raw !== 0) slope = Math.round(raw);
    }
    return { anchors: list, slope };
  });
}

/** Predicts a label for floor `n` by extending the pattern of whichever existing floor is numerically closest to it. */
function predictFloorLabel(n: number, groups: { anchors: LabelAnchor[]; slope: number }[]): string {
  let best: { anchor: LabelAnchor; slope: number; dist: number } | null = null;
  for (const g of groups) {
    for (const a of g.anchors) {
      const dist = Math.abs(a.floorNumber - n);
      if (!best || dist < best.dist) best = { anchor: a, slope: g.slope, dist };
    }
  }
  if (!best) return `${n}${plainOrdinalSuffix(n)} Floor`;
  const computedNum = best.anchor.num + best.slope * (n - best.anchor.floorNumber);
  return `${best.anchor.prefix}${computedNum}${best.anchor.suffix}`;
}

interface FloorSetupTabProps {
  propertyId: string;
  property: { id: string; name: string; totalFloors?: number | null };
}

export default function FloorSetupTab({ propertyId, property }: FloorSetupTabProps) {
  const { data: floorsData } = useGetFloorSetupsQuery({ propertyId });
  const [createFloorSetup, { isLoading: creating }] = useCreateFloorSetupMutation();
  const [updateFloorSetup, { isLoading: updating }] = useUpdateFloorSetupMutation();
  const [deleteFloorSetup] = useDeleteFloorSetupMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();
  const canCreateFloor = usePermission('floor.create');

  const floors = floorsData?.data || [];
  const total = property.totalFloors || 0;

  const floorMap = useMemo(() => {
    const map = new Map<number, FloorSetup>();
    floors.forEach((f) => map.set(f.floorNumber, f));
    return map;
  }, [floors]);

  const floorNumberOptions = Array.from({ length: total }, (_, i) => i + 1);

  const emptyForm = { floorNumber: '', floorLabel: '', prefix: '' };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FloorSetup | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Floor Label auto-fills from the detected pattern when a floor number is picked; once the
  // user edits the label by hand, further floor-number changes stop overwriting it.
  const [labelTouched, setLabelTouched] = useState(false);



  // Clicking an empty slot in the skyline pre-fills the floor number and a label that
  // continues whatever naming pattern this property's existing floors already use.
  const openCreateFloor = (floorNumber: number) => {
    setEditing(null);
    setLabelTouched(false);
    const groups = buildLabelGroups(floorMap);
    setForm({ floorNumber: String(floorNumber), floorLabel: predictFloorLabel(floorNumber, groups), prefix: '' });
    setShowForm(true);
  };
  const openEdit = (f: FloorSetup) => {
    setEditing(f);
    setLabelTouched(true); // editing an existing label should never be auto-overwritten
    setForm({ floorNumber: String(f.floorNumber), floorLabel: f.floorLabel, prefix: f.prefix ?? '' });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      propertyId,
      floorNumber: Number(form.floorNumber),
      floorLabel: form.floorLabel.trim(),
      prefix: form.prefix.trim() || null,
    };
    try {
      if (editing) {
        await updateFloorSetup({ id: editing.id, data: payload }).unwrap();
      } else {
        await createFloorSetup(payload).unwrap();
      }
      closeForm();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || err?.data?.message || `Failed to ${editing ? 'update' : 'create'} floor`);
    }
  };

  const handleDelete = async (f: FloorSetup) => {
    if (!(await confirmDialog(`Delete floor "${f.floorLabel}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteFloorSetup(f.id).unwrap();
    } catch (e: any) {
      alertDialog(e?.data?.errors?.[0]?.message || 'Failed to delete floor');
    }
  };

  // One click fills every unconfigured floor, continuing whatever label pattern this
  // property's existing floors already use (e.g. 1st floor "B2" → "B3", "B4"…) — avoids
  // clicking each empty slot individually on a tall tower.
  const [filling, setFilling] = useState(false);
  const handleFillRemaining = async () => {
    const missing: number[] = [];
    for (let n = 1; n <= total; n++) if (!floorMap.has(n)) missing.push(n);
    if (missing.length === 0) return;
    const ok = await confirmDialog(
      `Create ${missing.length} missing floor${missing.length > 1 ? 's' : ''} with auto-generated labels?`,
      { confirmText: 'Create All' }
    );
    if (!ok) return;
    setFilling(true);
    try {
      // Predicted from the floors as they stood when the button was clicked, so every
      // missing floor extends the same original pattern rather than each other's guesses.
      const groups = buildLabelGroups(floorMap);
      const results = await Promise.allSettled(
        missing.map((n) =>
          createFloorSetup({ propertyId, floorNumber: n, floorLabel: predictFloorLabel(n, groups) }).unwrap()
        )
      );
      const failed = results.length - results.filter((r) => r.status === 'fulfilled').length;
      if (failed > 0) {
        alertDialog(`Created ${results.length - failed} of ${results.length} floors. ${failed} failed — a label or floor number may already be in use.`);
      }
    } finally {
      setFilling(false);
    }
  };

  const configuredCount = floorMap.size;


  const rows: number[] = [];
  for (let n = total; n >= 1; n--) rows.push(n);

  return (
    <div className="tab-section">
      <div className="section-header">
        <h3><Building2 size={16} /> Floor Setup</h3>
      </div>

      <div className="floor-skyline-stage">
        {total === 0 ? (
          <div className="building-empty-state">
            <Settings2 size={20} />
            <span>Set Total Floors for this property in the Overview tab to start configuring floors</span>
          </div>
        ) : (
          <div className="floor-layout-split">
            {/* Left — building tower */}
            <div className="floor-skyline">
              <div className="building-card focus">
                <div className="building-tower">
                  <span className="building-spire" />
                  {rows.map((n, idx) => {
                    const f = floorMap.get(n);
                    return (
                      <div
                        key={n}
                        className={`floor-slab ${f ? 'filled' : 'empty'}`}
                        style={{ ['--fi' as any]: rows.length - idx }}
                        onClick={() => { if (f) openEdit(f); else if (canCreateFloor) openCreateFloor(n); }}
                        title={f ? f.floorLabel : ''}
                      >
                        <span className="fs-num">{n}</span>
                        {f ? <span className="fs-label">{f.floorLabel}</span> : <Plus size={12} className="fs-plus" />}
                        {f && (
                          <div className="fs-actions">
                            <PermissionGuard permission="floor.update">
                              <button type="button" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(f); }}>
                                <Pencil size={11} />
                              </button>
                            </PermissionGuard>
                            <PermissionGuard permission="floor.delete">
                              <button type="button" className="danger" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(f); }}>
                                <Trash2 size={11} />
                              </button>
                            </PermissionGuard>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="building-ground" />
                <div className="building-label">
                  <span className="bl-name" title={property.name}>{property.name}</span>
                </div>
              </div>
            </div>

            {/* Right — info panel */}
            <div className="floor-info-panel">
              <div className="fip-stat-group">
                <div className="fip-stat">
                  <span className="fip-stat-value">{total}</span>
                  <span className="fip-stat-label">Total Floors</span>
                </div>
                <div className="fip-stat">
                  <span className="fip-stat-value" style={{ color: 'var(--accent)' }}>{configuredCount}</span>
                  <span className="fip-stat-label">Configured</span>
                </div>
                <div className="fip-stat">
                  <span className="fip-stat-value" style={{ color: total - configuredCount > 0 ? 'var(--text-muted)' : 'var(--accent)' }}>
                    {total - configuredCount}
                  </span>
                  <span className="fip-stat-label">Remaining</span>
                </div>
              </div>

              <div className="fip-progress-block">
                <div className="fip-progress-header">
                  <span>Configuration Progress</span>
                  <span>{Math.round((configuredCount / total) * 100)}%</span>
                </div>
                <div className="bl-progress" style={{ width: '100%' }}>
                  <div className="bl-progress-fill" style={{ width: `${(configuredCount / total) * 100}%` }} />
                </div>
              </div>

              <div className="fip-legend">
                <div className="fip-legend-item">
                  <span className="fip-legend-dot filled" />
                  <span>Configured floor</span>
                </div>
                <div className="fip-legend-item">
                  <span className="fip-legend-dot empty" />
                  <span>Empty slot</span>
                </div>
              </div>

              {configuredCount < total && canCreateFloor && (
                <button type="button" className="bl-fill-btn fip-fill-btn" disabled={filling} onClick={handleFillRemaining}>
                  {filling ? 'Filling…' : `Auto-fill ${total - configuredCount} remaining`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Building2 size={16} /> {editing ? 'Edit Floor' : 'New Floor'}</h3>
              <button onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="rff-row">
                  <div className="rff-field rff-grow">
                    <label>Floor Number *</label>
                    <select required value={form.floorNumber}
                      onChange={(e) => {
                        const floorNumber = e.target.value;
                        if (!editing && !labelTouched && floorNumber) {
                          const groups = buildLabelGroups(floorMap);
                          setForm({ ...form, floorNumber, floorLabel: predictFloorLabel(Number(floorNumber), groups) });
                        } else {
                          setForm({ ...form, floorNumber });
                        }
                      }}>
                      <option value="">{total === 0 ? 'No total floors set for this property' : 'Select floor…'}</option>
                      {floorNumberOptions.map((n) => <option key={n} value={n}>{ordinalFloorLabel(n)}</option>)}
                    </select>
                  </div>
                  <div className="rff-field rff-grow">
                    <label>Floor Label *</label>
                    <input required placeholder="e.g. 10th Floor" value={form.floorLabel}
                      onChange={(e) => { setLabelTouched(true); setForm({ ...form, floorLabel: e.target.value }); }} />
                  </div>
                </div>
                <div className="rff-row">
                  <div className="rff-field rff-grow">
                    <label>Prefix <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      placeholder="e.g. FL, GF, B"
                      value={form.prefix}
                      maxLength={20}
                      onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating || updating}>
                  {creating || updating ? 'Saving…' : editing ? 'Save Changes' : 'Create Floor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
