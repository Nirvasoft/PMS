import { useState, useEffect, useMemo } from 'react';
import {
  useGetFloorSetupsQuery, useCreateFloorSetupMutation, useUpdateFloorSetupMutation, useDeleteFloorSetupMutation,
  useGetPropertiesQuery, type FloorSetup, type PropertyListItem,
} from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { Building2, Plus, X, Pencil, Trash2, Search, Settings2, Sparkles, Loader2 } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import { PermissionGuard, usePermission } from '../../../components/guards/PermissionGuard';
import '../BillingPage/BillingPage.css';
import './FloorSetupPage.css';

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

/** Deterministic hue per property id so each building reads as a distinct "tower" in the skyline. */
function hueForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
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

export default function FloorSetupPage() {
  const { data: propertiesData } = useGetPropertiesQuery({ limit: 100 });
  const properties = propertiesData?.data || [];

  const floorNumberOptions = (propertyId: string) => {
    const totalFloors = properties.find((p) => p.id === propertyId)?.totalFloors || 0;
    return Array.from({ length: totalFloors }, (_, i) => i + 1);
  };

  // ── Search ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const searchPropertyId = useSelectedPropertyFilter();

  const { data: floorsData, isFetching } = useGetFloorSetupsQuery();
  const [createFloorSetup, { isLoading: creating }] = useCreateFloorSetupMutation();
  const [updateFloorSetup, { isLoading: updating }] = useUpdateFloorSetupMutation();
  const [deleteFloorSetup] = useDeleteFloorSetupMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();
  const canCreateFloor = usePermission('floor.create');

  const floors = floorsData?.data || [];

  // ── Skyline grouping ──────────────────────────────────
  const floorsByProperty = useMemo(() => {
    const map = new Map<string, Map<number, FloorSetup>>();
    floors.forEach((f) => {
      if (!map.has(f.propertyId)) map.set(f.propertyId, new Map());
      map.get(f.propertyId)!.set(f.floorNumber, f);
    });
    return map;
  }, [floors]);

  const q = searchQuery.toLowerCase().trim();
  const propertyMatchesQuery = (p: PropertyListItem) => !q || p.name.toLowerCase().includes(q);
  const floorMatchesQuery = (n: number, label: string) =>
    !q || label.toLowerCase().includes(q) || String(n).includes(q) || ordinalFloorLabel(n).toLowerCase().includes(q);

  // Buildings shown: the sidebar's Active Property alone, or the whole portfolio —
  // a property qualifies if its name matches, or any of its floors do.
  const buildingProperties = useMemo(() => {
    const list = searchPropertyId ? properties.filter((p) => p.id === searchPropertyId) : properties;
    return list.filter((p) => {
      if (propertyMatchesQuery(p)) return true;
      const fm = floorsByProperty.get(p.id);
      const total = p.totalFloors || 0;
      for (let n = 1; n <= total; n++) {
        if (floorMatchesQuery(n, fm?.get(n)?.floorLabel || '')) return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, searchPropertyId, q, floorsByProperty]);

  const emptyForm = { propertyId: '', floorNumber: '', floorLabel: '' };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FloorSetup | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Floor Label auto-fills from the detected pattern when a floor number is picked; once the
  // user edits the label by hand, further floor-number changes stop overwriting it.
  const [labelTouched, setLabelTouched] = useState(false);

  // New floors bind to the sidebar's Active Property, same convention as Expenses/Payment
  // Vouchers — only when "All Properties" is active can the property be chosen here.
  const openCreate = () => { setEditing(null); setLabelTouched(false); setForm({ ...emptyForm, propertyId: searchPropertyId }); setShowForm(true); };
  // Clicking an empty slot in the skyline pre-fills property + floor number + a label that
  // continues whatever naming pattern the property's existing floors already use.
  const openCreateFloor = (propertyId: string, floorNumber: number) => {
    setEditing(null);
    setLabelTouched(false);
    const groups = buildLabelGroups(floorsByProperty.get(propertyId));
    setForm({ propertyId, floorNumber: String(floorNumber), floorLabel: predictFloorLabel(floorNumber, groups) });
    setShowForm(true);
  };
  const openEdit = (f: FloorSetup) => {
    setEditing(f);
    setLabelTouched(true); // editing an existing label should never be auto-overwritten
    setForm({ propertyId: f.propertyId, floorNumber: String(f.floorNumber), floorLabel: f.floorLabel });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      propertyId: form.propertyId,
      floorNumber: Number(form.floorNumber),
      floorLabel: form.floorLabel.trim(),
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
      const msg = e?.data?.errors?.[0]?.message || 'Failed to delete floor';
      alertDialog(msg);
    }
  };

  // One click fills every unconfigured floor for a building, continuing whatever label
  // pattern the property's existing floors already use (e.g. 1st floor "B2" → "B3", "B4"…) —
  // avoids clicking each empty slot individually on a tall tower.
  const [fillingPropertyId, setFillingPropertyId] = useState<string | null>(null);
  const handleFillRemaining = async (property: PropertyListItem, missing: number[]) => {
    if (missing.length === 0) return;
    const ok = await confirmDialog(
      `Create ${missing.length} missing floor${missing.length > 1 ? 's' : ''} for "${property.name}" with auto-generated labels?`,
      { confirmText: 'Create All' }
    );
    if (!ok) return;
    setFillingPropertyId(property.id);
    try {
      // Predicted from the property's floors as they stood when the button was clicked, so
      // every missing floor extends the same original pattern rather than each other's guesses.
      const groups = buildLabelGroups(floorsByProperty.get(property.id));
      const results = await Promise.allSettled(
        missing.map((n) =>
          createFloorSetup({
            propertyId: property.id,
            floorNumber: n,
            floorLabel: predictFloorLabel(n, groups),
          }).unwrap()
        )
      );
      const failed = results.length - results.filter((r) => r.status === 'fulfilled').length;
      if (failed > 0) {
        alertDialog(`Created ${results.length - failed} of ${results.length} floors. ${failed} failed — a label or floor number may already be in use.`);
      }
    } finally {
      setFillingPropertyId(null);
    }
  };

  const formTotalFloors = properties.find((p) => p.id === form.propertyId)?.totalFloors || 0;
  const isFocusView = !!searchPropertyId;

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
            <Building2 size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Floor Setup</h1>
            <p>Define standard floor numbers and labels for each property</p>
          </div>
          <PermissionGuard permission="floor.create">
            <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> New Floor
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Search Bar */}
      <div className="meter-search-bar">
        <div className="meter-search-wrap">
          <Search size={15} className="meter-search-icon" />
          <input
            type="text"
            className="meter-search-input"
            placeholder="Search floor label, property…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="meter-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="meter-search-filter-wrap">
          {/* Follows the sidebar's "Active Property" selector — a read-only display, not a real
              dropdown, so it's a plain div (no native chevron/arrow like an actual <select>). */}
          <div className="meter-search-select meter-search-select--static">
            {searchPropertyId ? properties.find((p) => p.id === searchPropertyId)?.name || '' : 'All Properties'}
          </div>
        </div>
      </div>

      {/* Floor Skyline */}
      <div className="floor-skyline-stage">
        {isFetching && floors.length === 0 ? (
          <div className="billing-empty">Loading…</div>
        ) : properties.length === 0 ? (
          <div className="billing-empty">No properties found</div>
        ) : buildingProperties.length === 0 ? (
          <div className="billing-empty">No floors match your search</div>
        ) : (
          <div className="floor-skyline">
            {buildingProperties.map((p) => {
              const total = p.totalFloors || 0;
              const fm = floorsByProperty.get(p.id) || new Map<number, FloorSetup>();
              const configuredCount = fm.size;
              const hue = hueForId(p.id);
              const propMatch = propertyMatchesQuery(p);

              const rows: number[] = [];
              for (let n = total; n >= 1; n--) rows.push(n);

              return (
                <div key={p.id} className={`building-card ${isFocusView ? 'focus' : ''}`}>
                  {total === 0 ? (
                    <div className="building-empty-state">
                      <Settings2 size={20} />
                      <span>Set total floors for<br />"{p.name}" in Property settings</span>
                    </div>
                  ) : (
                    <>
                      <div className="building-tower" style={{ ['--b-hue' as any]: hue }}>
                        <span className="building-spire" />
                        {rows.map((n, idx) => {
                          const f = fm.get(n);
                          const visible = propMatch || floorMatchesQuery(n, f?.floorLabel || '');
                          const isMatch = !!q && !propMatch && visible;
                          return (
                            <div
                              key={n}
                              className={`floor-slab ${f ? 'filled' : 'empty'}${!visible ? ' dim' : ''}${isMatch ? ' match' : ''}`}
                              style={{ ['--fi' as any]: rows.length - idx }}
                              onClick={() => {
                                if (f) openEdit(f);
                                else if (canCreateFloor) openCreateFloor(p.id, n);
                              }}
                              title={f ? f.floorLabel : canCreateFloor ? `Add ${ordinalFloorLabel(n)}` : ordinalFloorLabel(n)}
                            >
                              <span className="fs-num">{ordinalFloorLabel(n)}</span>
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
                    </>
                  )}
                  <div className="building-label">
                    <span className="bl-name" title={p.name}>{p.name}</span>
                    {total > 0 && (
                      <>
                        <div className="bl-progress">
                          <div className="bl-progress-fill" style={{ width: `${(configuredCount / total) * 100}%`, ['--b-hue' as any]: hue }} />
                        </div>
                        <span className="bl-count">{configuredCount}/{total} floors set</span>
                        {configuredCount < total && canCreateFloor && (
                          <button
                            type="button"
                            className="bl-fill-btn"
                            disabled={fillingPropertyId === p.id}
                            onClick={() => {
                              const missing: number[] = [];
                              for (let n = 1; n <= total; n++) if (!fm.has(n)) missing.push(n);
                              handleFillRemaining(p, missing);
                            }}
                          >
                            {fillingPropertyId === p.id
                              ? <Loader2 size={11} className="bl-fill-spin" />
                              : <Sparkles size={11} />}
                            {fillingPropertyId === p.id ? 'Filling…' : `Fill ${total - configuredCount} remaining`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Building2 size={18} /> {editing ? 'Edit Floor' : 'New Floor'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>
                  <div className="inv-field">
                    <label>Property <span className="req">*</span></label>
                    {/* Locked to the sidebar's Active Property when creating; not independently choosable then. */}
                    <select required value={form.propertyId} disabled={!editing && !!searchPropertyId}
                      onChange={(e) => setForm({ ...form, propertyId: e.target.value, floorNumber: '' })}>
                      <option value="">Select property…</option>
                      {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Floor Number <span className="req">*</span></label>
                    <select required value={form.floorNumber} disabled={!form.propertyId}
                      onChange={(e) => {
                        const floorNumber = e.target.value;
                        if (!editing && !labelTouched && floorNumber) {
                          const groups = buildLabelGroups(floorsByProperty.get(form.propertyId));
                          setForm({ ...form, floorNumber, floorLabel: predictFloorLabel(Number(floorNumber), groups) });
                        } else {
                          setForm({ ...form, floorNumber });
                        }
                      }}>
                      <option value="">
                        {!form.propertyId ? 'Select a property first…' : formTotalFloors === 0 ? 'No total floors set for this property' : 'Select floor…'}
                      </option>
                      {floorNumberOptions(form.propertyId).map((n) => <option key={n} value={n}>{ordinalFloorLabel(n)}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Floor Label <span className="req">*</span></label>
                    <input required placeholder="e.g. 10th Floor" value={form.floorLabel}
                      onChange={(e) => { setLabelTouched(true); setForm({ ...form, floorLabel: e.target.value }); }} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || updating}>
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
