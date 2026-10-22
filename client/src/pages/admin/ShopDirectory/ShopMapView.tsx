import { useEffect, useMemo, useState } from 'react';
import ReactGridLayout, { useContainerWidth, getCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import toast from 'react-hot-toast';
import { RotateCw, X, Pencil, Save, Wand2, Plus, Maximize2, Trash2 } from 'lucide-react';
import { useGetFloorPlanQuery, useSaveFloorPlanMutation } from '../../../store/api/mallApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import {
  DECORATION_DEFAULT_SIZES, DECORATION_LABELS, DEFAULT_COLUMNS, DEFAULT_SQFT_PER_CELL,
  autoArrange, findFreeSpot, floorKeyOf, hasAnyOverlap, resolveOverlaps,
  sizeUnitTile, tileSizeFromSqft, unitKey,
  type MapItem, type TileKind,
} from './shopMapLayout';
import './ShopMapView.css';

interface Props {
  shops: any[];
  propertyId: string | undefined | null;
  matches: (shop: any) => boolean;
  onOpenShop: (shop: any) => void;
  fullScreen?: boolean;
  initialFloor?: string;
}

const noCompaction = getCompactor(null as any, false, true);

function DecorIcon({ kind, size = 14 }: { kind: Exclude<TileKind, 'unit'>; size?: number }) {
  switch (kind) {
    case 'atrium':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="12" cy="12" r="4" />
          <path d="M3 12h5M16 12h5M12 3v5M12 16v5" />
        </svg>
      );
    case 'stairs':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20h5v-4h5v-4h5V8h3" />
          <path d="M4 13l6-6m0 0H5m5 0v5" />
        </svg>
      );
    case 'escalator':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M9 16V8m0 0L6.5 10.5M9 8l2.5 2.5" />
          <path d="M15 8v8m0 0l-2.5-2.5M15 16l2.5-2.5" />
        </svg>
      );
    case 'corridor':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h18M3 17h18" />
          <path d="M5 12h2M11 12h2M17 12h2" strokeDasharray="2 2" />
        </svg>
      );
    case 'toilet':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="5" r="2" />
          <path d="M5 9h4v5H8v6H6v-6H5V9Z" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <circle cx="17" cy="5" r="2" />
          <path d="M15 9h4l1 6h-2v5h-2v-5h-2l1-6Z" />
        </svg>
      );
    case 'marker':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2.5" />
        </svg>
      );
    case 'entrance':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
      );
    case 'exit':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
  }
}

function statusClass(shop: any): string {
  const u = shop?.unit;
  const status = String(u?.status || '').toUpperCase();
  const end = u?.leases?.[0]?.endDate;
  if (status === 'OCCUPIED' && end) {
    const days = (new Date(end).getTime() - Date.now()) / 86400000;
    if (days <= 90) return 'st-expiring';
  }
  if (status === 'OCCUPIED') return 'st-occupied';
  if (status === 'RESERVED') return 'st-reserved';
  return 'st-vacant';
}

export default function ShopMapView({ shops, propertyId, matches, onOpenShop, fullScreen = false, initialFloor }: Props) {
  const floors = useMemo(() => {
    const m = new Map<string, number>();
    shops.forEach((s) => {
      const k = floorKeyOf(s);
      const n = Number(s?.unit?.floorNumber);
      if (!m.has(k)) m.set(k, Number.isFinite(n) ? n : 9999);
    });
    return [...m.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  }, [shops]);

  const [floor, setFloor] = useState<string>(initialFloor || '');
  useEffect(() => {
    if (!floor || !floors.includes(floor)) {
      if (initialFloor && floors.includes(initialFloor)) setFloor(initialFloor);
      else setFloor(floors[0] || '');
    }
  }, [floors, floor, initialFloor]);

  const floorShops = useMemo(() => shops.filter((s) => floorKeyOf(s) === floor), [shops, floor]);
  const shopByUnit = useMemo(() => new Map(floorShops.map((s) => [s.unitId, s])), [floorShops]);

  const { data: plan, isFetching } = useGetFloorPlanQuery(
    { propertyId: propertyId as string, floor },
    { skip: !propertyId || !floor },
  );
  const [savePlan, { isLoading: saving }] = useSaveFloorPlanMutation();

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [items, setItems] = useState<MapItem[]>([]);
  const [sqftPerCell, setSqftPerCell] = useState(DEFAULT_SQFT_PER_CELL);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [decorKind, setDecorKind] = useState<Exclude<TileKind, 'unit'>>('corridor');
  const [decorSeq, setDecorSeq] = useState(1);

  const planData: any = (plan as any)?.data ?? plan;

  // (Re)load draft from server whenever floor / data changes and there are no unsaved edits.
  useEffect(() => {
    if (dirty) return;
    const spc = Number(planData?.sqftPerCell) || DEFAULT_SQFT_PER_CELL;
    const cols = Number(planData?.columns) || DEFAULT_COLUMNS;
    const saved: any[] = planData?.items || [];
    const next: MapItem[] = [];
    let d = 1;
    saved.forEach((it) => {
      if (it.kind === 'unit') {
        const shop = shopByUnit.get(it.unitId);
        if (!shop) return;
        const size = sizeUnitTile({ w: it.w, h: it.h }, shop.unit?.areaSqft, spc, cols);
        next.push({ key: unitKey(it.unitId), kind: 'unit', unitId: it.unitId, label: it.label ?? null, x: it.x, y: it.y, ...size });
      } else {
        next.push({ key: `d:${d++}`, kind: it.kind, unitId: null, label: it.label ?? null, x: it.x, y: it.y, w: it.w, h: it.h });
      }
    });
    setSqftPerCell(spc);
    setColumns(cols);
    setDecorSeq(d);
    setItems(resolveOverlaps(next, cols));
  }, [planData, shopByUnit, dirty]);

  const placedUnitIds = useMemo(() => new Set(items.filter((i) => i.unitId).map((i) => i.unitId as string)), [items]);
  const placedShops = useMemo(
    () =>
      floorShops
        .filter((s) => placedUnitIds.has(s.unitId))
        .sort((a, b) =>
          String(a.unit?.unitNumber || a.shopNumber || '').localeCompare(
            String(b.unit?.unitNumber || b.shopNumber || ''),
            undefined,
            { numeric: true },
          ),
        ),
    [floorShops, placedUnitIds],
  );
  const placedDecorKinds = useMemo(
    () =>
      Array.from(
        new Set(items.filter((i) => i.kind !== 'unit').map((i) => i.kind as Exclude<TileKind, 'unit'>)),
      ),
    [items],
  );
  const unplaced = floorShops.filter((s) => !placedUnitIds.has(s.unitId));

  const { width, containerRef } = useContainerWidth();
  const cellPx = Math.max(6, Math.floor(((width || 900) - 16) / columns));

  const update = (fn: (prev: MapItem[]) => MapItem[]) => {
    setItems((prev) => fn(prev));
    setDirty(true);
  };

  const place = (shop: any) => {
    const { w, h } = tileSizeFromSqft(shop.unit?.areaSqft, sqftPerCell, columns);
    update((prev) => {
      const pos = findFreeSpot(prev, w, h, columns);
      return [...prev, { key: unitKey(shop.unitId), kind: 'unit', unitId: shop.unitId, label: null, x: pos.x, y: pos.y, w, h }];
    });
  };

  const addDecor = () => {
    const { w, h } = DECORATION_DEFAULT_SIZES[decorKind] || { w: 6, h: 4 };
    update((prev) => {
      const pos = findFreeSpot(prev, w, h, columns);
      return [...prev, { key: `d:${decorSeq}`, kind: decorKind, unitId: null, label: DECORATION_LABELS[decorKind], x: pos.x, y: pos.y, w, h }];
    });
    setDecorSeq((n) => n + 1);
  };

  const rotate = (key: string) =>
    update((prev) =>
      resolveOverlaps(prev.map((i) => (i.key === key ? { ...i, w: Math.min(i.h, columns), h: i.w } : i)), columns),
    );

  const remove = (key: string) => update((prev) => prev.filter((i) => i.key !== key));

  const onLayoutChange = (layout: readonly any[]) => {
    if (!editing) return;
    let changed = false;
    const next = items.map((it) => {
      const l = layout.find((x) => x.i === it.key);
      if (!l) return it;
      if (l.x === it.x && l.y === it.y && l.w === it.w && l.h === it.h) return it;
      changed = true;
      return { ...it, x: l.x, y: l.y, w: l.w, h: l.h };
    });
    if (changed) {
      setItems(next);
      setDirty(true);
    }
  };

  const discard = () => {
    setDirty(false);
    setEditing(false);
  };

  const save = async () => {
    if (hasAnyOverlap(items)) {
      toast.error('Some tiles overlap. Please separate them before saving.');
      return;
    }
    try {
      await savePlan({
        propertyId: propertyId as string,
        floor,
        data: {
          sqftPerCell,
          columns,
          items: items.map((i) => ({ kind: i.kind, unitId: i.unitId, label: i.label, x: i.x, y: i.y, w: i.w, h: i.h })),
        },
      } as any).unwrap();
      toast.success('Floor plan saved');
      setDirty(false);
      setEditing(false);
    } catch (e: any) {
      const detail =
        e?.data?.errors?.[0]?.message ||
        e?.data?.error?.message ||
        e?.data?.message ||
        (typeof e?.data?.error === 'string' ? e.data.error : '') ||
        e?.error ||
        '';
      console.error('saveFloorPlan failed', e);
      toast.error(`Failed to save floor plan${e?.status ? ` (${e.status})` : ''}${detail ? `: ${detail}` : ''}`);
    }
  };

  const switchFloor = (f: string) => {
    if (f === floor) return;
    if (dirty && !window.confirm('Discard unsaved map changes?')) return;
    setDirty(false);
    setEditing(false);
    setFloor(f);
  };

  const layout = items.map((i) => ({
    i: i.key, x: i.x, y: i.y, w: i.w, h: i.h,
    isResizable: editing,
    isDraggable: editing,
  }));

  const rows = Math.max(10, ...items.map((i) => i.y + i.h)) + (editing ? 6 : 1);

  const openFullScreenTab = () => {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (floor) params.set('floor', floor);
    window.open(`/admin/mall/shops/map?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  if (floors.length === 0) return null;

  return (
    <div className={`shop-map ${fullScreen ? 'shop-map-fullscreen' : ''}`}>
      <div className="shop-map-toolbar">
        <div className="shop-map-floor-tabs">
          {floors.map((f) => (
            <button key={f} className={`shop-map-floor-tab ${f === floor ? 'active' : ''}`} onClick={() => switchFloor(f)}>
              {f}
            </button>
          ))}
        </div>
        {!fullScreen && (
          <div className="shop-map-toolbar-actions">
            <button className="btn btn-secondary" onClick={openFullScreenTab} title="Open Full Screen Map in a new tab">
              <Maximize2 size={14} /> View Full Screen
            </button>
            <PermissionGuard permission="mall-shops.write" hideWhenDenied>
              {!editing ? (
                <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Edit Layout
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={discard} disabled={saving}>Cancel</button>
                  <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
                    <Save size={14} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </PermissionGuard>
          </div>
        )}
      </div>

      {editing && (
        <div className="shop-map-edit-bar">
          <select value={decorKind} onChange={(e) => setDecorKind(e.target.value as any)}>
            {Object.entries(DECORATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={addDecor}><Plus size={14} /> Add</button>
          <button className="btn btn-secondary" onClick={() => update((p) => autoArrange(p, columns))}>
            <Wand2 size={14} /> Auto-arrange
          </button>
          <button
            className="btn btn-secondary shop-map-clear-btn"
            onClick={() => update(() => [])}
            disabled={items.length === 0}
            title="Remove all tiles from this floor"
          >
            <Trash2 size={14} /> Clear All
          </button>
          {dirty && <span className="shop-map-dirty">● Unsaved changes</span>}
        </div>
      )}

      <div className="shop-map-body">
        <div ref={containerRef as any} className={`shop-map-canvas-wrap ${editing ? 'editing' : ''}`}>
          {isFetching && items.length === 0 ? (
            <div className="shop-map-tray-empty">Loading…</div>
          ) : items.length === 0 && !editing ? (
            <div className="shop-map-tray-empty">
              No layout yet for {floor}. Use “Edit Layout” to place shops on the map.
            </div>
          ) : (
            <ReactGridLayout
              width={Math.max(0, (width || 900) - 16)}
              layout={layout as any}
              gridConfig={{ cols: columns, rowHeight: cellPx, margin: [1, 1], containerPadding: [0, 0], maxRows: rows } as any}
              dragConfig={{ enabled: editing, cancel: '.shop-map-tile-btn' } as any}
              resizeConfig={{ enabled: editing } as any}
              compactor={noCompaction as any}
              onLayoutChange={onLayoutChange as any}
            >
              {items.map((it) => {
                const shop = it.unitId ? shopByUnit.get(it.unitId) : null;
                const decor = it.kind !== 'unit';
                const dim = !decor && shop ? !matches(shop) : false;
                const tiny = !decor && (it.w * cellPx < 24 || it.h * cellPx < 18);
                const isVertical = it.h > it.w;
                const minSidePx = Math.min(it.w, it.h) * cellPx;
                const badgePx = Math.max(18, Math.min(96, Math.round(minSidePx * 0.68)));
                const iconPx = Math.max(12, Math.round(badgePx * 0.62));
                const decorType = it.kind as Exclude<TileKind, 'unit'>;
                const decorLabel = DECORATION_LABELS[decorType] || it.label || '';
                const title = decor
                  ? decorLabel
                  : `${shop?.brandName || shop?.unit?.unitNumber || ''} • ${shop?.unit?.unitNumber || ''} • ${shop?.unit?.areaSqft ?? '—'} sqft • ${shop?.unit?.status || ''}`;
                return (
                  <div
                    key={it.key}
                    title={title}
                    className={`shop-map-tile ${decor ? `st-decor st-decor-${it.kind} ${isVertical ? 'dir-vertical' : 'dir-horizontal'}` : statusClass(shop)} ${editing ? 'editing' : ''} ${dim ? 'dim' : ''} ${tiny ? 'tiny' : ''}`}
                    onClick={() => { if (!editing && shop) onOpenShop(shop); }}
                  >
                    {decor ? (
                      <div className="shop-map-decor-badge" style={{ width: badgePx, height: badgePx }}>
                        <span className="shop-map-decor-icon">
                          <DecorIcon kind={decorType} size={iconPx} />
                        </span>
                      </div>
                    ) : (
                      <div className="shop-map-tile-name">{shop?.unit?.unitNumber || shop?.shopNumber}</div>
                    )}
                    {editing && (
                      <div className="shop-map-tile-actions">
                        <button className="shop-map-tile-btn rot" title="Rotate 90°" onClick={(e) => { e.stopPropagation(); rotate(it.key); }}>
                          <RotateCw size={9} />
                        </button>
                        <button className="shop-map-tile-btn" title="Remove" onClick={(e) => { e.stopPropagation(); remove(it.key); }}>
                          <X size={9} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </ReactGridLayout>
          )}
          {!editing && (placedShops.length > 0 || placedDecorKinds.length > 0) && (
            <div className="shop-map-directory-overlays">
              {placedShops.length > 0 && (
                <div className="shop-map-directory-index">
                  {placedShops.map((s) => (
                    <div
                      key={s.unitId}
                      className="shop-map-directory-row"
                      onClick={() => onOpenShop(s)}
                    >
                      <span className="shop-map-directory-unit">{s.unit?.unitNumber || s.shopNumber}</span>
                      <span className="shop-map-directory-name">{s.brandName || 'Vacant'}</span>
                    </div>
                  ))}
                </div>
              )}
              {placedDecorKinds.length > 0 && (
                <div className="shop-map-directory-index is-markers-box">
                  {placedDecorKinds.map((kind) => (
                    <div key={`decor-${kind}`} className="shop-map-directory-row is-marker">
                      <span className={`shop-map-directory-marker-badge lg-${kind}`}>
                        <DecorIcon kind={kind} size={11} />
                      </span>
                      <span className="shop-map-directory-name">{DECORATION_LABELS[kind]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {editing && (
          <div className="shop-map-tray">
            <h4>Unplaced shops ({unplaced.length})</h4>
            {unplaced.length === 0 ? (
              <div className="shop-map-tray-empty">All shops on this floor are placed.</div>
            ) : (
              unplaced.map((s) => (
                <div key={s.unitId} className="shop-map-tray-item">
                  <div className="grow">
                    {s.brandName || s.unit?.unitNumber}
                    <small>{s.unit?.unitNumber} · {s.unit?.areaSqft ?? '—'} sqft</small>
                  </div>
                  <button className="btn btn-secondary" onClick={() => place(s)}>Place</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
