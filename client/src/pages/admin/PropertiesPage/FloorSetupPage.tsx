import { useState, useEffect, useMemo } from 'react';
import {
  useGetFloorSetupsQuery, useCreateFloorSetupMutation, useUpdateFloorSetupMutation, useDeleteFloorSetupMutation,
  useGetPropertiesQuery, type FloorSetup, type PropertyListItem,
} from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { Building2, Plus, X, Pencil, Trash2, Search, Settings2 } from 'lucide-react';
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
  const [searchFloorNumber, setSearchFloorNumber] = useState('');

  const { data: floorsData, isFetching } = useGetFloorSetupsQuery();
  const [createFloorSetup, { isLoading: creating }] = useCreateFloorSetupMutation();
  const [updateFloorSetup, { isLoading: updating }] = useUpdateFloorSetupMutation();
  const [deleteFloorSetup] = useDeleteFloorSetupMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();
  const canCreateFloor = usePermission('floor.create');

  const floors = floorsData?.data || [];

  // Floor filter resets whenever the sidebar's Active Property changes.
  useEffect(() => { setSearchFloorNumber(''); }, [searchPropertyId]);

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

  // New floors bind to the sidebar's Active Property, same convention as Expenses/Payment
  // Vouchers — only when "All Properties" is active can the property be chosen here.
  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, propertyId: searchPropertyId }); setShowForm(true); };
  // Clicking an empty slot in the skyline pre-fills property + floor number + a sensible label.
  const openCreateFloor = (propertyId: string, floorNumber: number) => {
    setEditing(null);
    setForm({ propertyId, floorNumber: String(floorNumber), floorLabel: `${floorNumber}${plainOrdinalSuffix(floorNumber)} Floor` });
    setShowForm(true);
  };
  const openEdit = (f: FloorSetup) => {
    setEditing(f);
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
          {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
          <select className="meter-search-select" value={searchPropertyId} disabled>
            {searchPropertyId && (
              <option value={searchPropertyId}>{properties.find((p) => p.id === searchPropertyId)?.name || ''}</option>
            )}
          </select>
          <select
            className="meter-search-select"
            value={searchFloorNumber}
            onChange={(e) => setSearchFloorNumber(e.target.value)}
            disabled={!searchPropertyId}
          >
            <option value="">{searchPropertyId ? 'All Floors' : 'Select property first'}</option>
            {floorNumberOptions(searchPropertyId).map((n) => (
              <option key={n} value={n}>{ordinalFloorLabel(n)}</option>
            ))}
          </select>
          {searchFloorNumber && (
            <button
              type="button"
              className="meter-search-reset-btn"
              onClick={() => setSearchFloorNumber('')}
              title="Clear floor filter"
            >
              <X size={13} /> Clear
            </button>
          )}
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
              for (let n = total; n >= 1; n--) {
                if (isFocusView && searchFloorNumber && String(n) !== searchFloorNumber) continue;
                rows.push(n);
              }

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
                      onChange={(e) => setForm({ ...form, floorNumber: e.target.value })}>
                      <option value="">
                        {!form.propertyId ? 'Select a property first…' : formTotalFloors === 0 ? 'No total floors set for this property' : 'Select floor…'}
                      </option>
                      {floorNumberOptions(form.propertyId).map((n) => <option key={n} value={n}>{ordinalFloorLabel(n)}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Floor Label <span className="req">*</span></label>
                    <input required placeholder="e.g. 10th Floor" value={form.floorLabel}
                      onChange={(e) => setForm({ ...form, floorLabel: e.target.value })} />
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
