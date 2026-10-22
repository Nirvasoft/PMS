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

function DecorIcon({ kind, size = 14 }: { kind: Exclude<TileKind, 'unit' | 'corridor'>; size?: number }) {
  switch (kind) {
    case 'atrium':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M3 12h18M12 3v18" strokeOpacity="0.45" />
          <polygon points="12 5.5 14.3 9.7 18.5 12 14.3 14.3 12 18.5 9.7 14.3 5.5 12 9.7 9.7 12 5.5" fill="currentColor" fillOpacity="0.24" />
        </svg>
      );
    case 'stairs':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20h4v-4h4v-4h4V8h6" />
          <path d="M4 11l6-6m0 0H5.5M10 5v4.5" />
        </svg>
      );
    case 'escalator':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="12" y1="4" x2="12" y2="20" strokeOpacity="0.45" />
          <path d="M8 16V8m0 0L5.8 10.2M8 8l2.2 2.2" />
          <path d="M16 8v8m0 0l-2.2-2.2M16 16l2.2-2.2" />
        </svg>
      );
    case 'toilet':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6.5" cy="5" r="2" fill="currentColor" stroke="none" />
          <path d="M4.5 8.5h4a1 1 0 0 1 1 1v4.5H8v6H5v-6H3.5V9.5a1 1 0 0 1 1-1Z" fill="currentColor" stroke="none" />
          <line x1="12" y1="3.5" x2="12" y2="20.5" />
          <circle cx="17.5" cy="5" r="2" fill="currentColor" stroke="none" />
          <path d="M16 8.5h3l2 6.5h-2v5h-3v-5h-2l2-6.5Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'marker':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" fill="currentColor" fillOpacity="0.22" />
          <circle cx="12" cy="11" r="2.5" fill="currentColor" />
        </svg>
      );
    case 'entrance':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
      );
    case 'exit':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

function subtractIntervals(total: number, removals: Array<[number, number]>): Array<[number, number]> {
  let result: Array<[number, number]> = [[0, total]];
  for (const [rStart, rEnd] of removals) {
    const a = Math.max(0, rStart);
    const b = Math.min(total, rEnd);
    if (b <= a) continue;
    const next: Array<[number, number]> = [];
    for (const [s, e] of result) {
      if (b <= s || a >= e) {
        next.push([s, e]);
      } else {
        if (a > s) next.push([s, a]);
        if (b < e) next.push([b, e]);
      }
    }
    result = next;
  }
  return result;
}

function isCorridorVertical(c: MapItem, all: MapItem[]): boolean {
  if (c.h !== c.w) return c.h > c.w;
  return all.some(
    (o) =>
      o.key !== c.key &&
      Math.min(c.x + c.w, o.x + o.w) > Math.max(c.x, o.x) &&
      (o.y + o.h === c.y || o.y === c.y + c.h),
  );
}

function getCorridorMergeData(it: MapItem, corridors: MapItem[]) {
  const others = corridors.filter((c) => c.key !== it.key);
  const topTouched: Array<[number, number]> = [];
  const bottomTouched: Array<[number, number]> = [];
  const leftTouched: Array<[number, number]> = [];
  const rightTouched: Array<[number, number]> = [];

  const touchesTop = (o: MapItem) => o.y < it.y && o.y + o.h >= it.y;
  const touchesBottom = (o: MapItem) => o.y <= it.y + it.h && o.y + o.h > it.y + it.h;
  const touchesLeft = (o: MapItem) => o.x < it.x && o.x + o.w >= it.x;
  const touchesRight = (o: MapItem) => o.x <= it.x + it.w && o.x + o.w > it.x + it.w;
  const overlapsX = (o: MapItem) => Math.min(it.x + it.w, o.x + o.w) > Math.max(it.x, o.x);
  const overlapsY = (o: MapItem) => Math.min(it.y + it.h, o.y + o.h) > Math.max(it.y, o.y);

  for (const o of others) {
    const u1 = Math.max(0, o.x - it.x);
    const u2 = Math.min(it.w, o.x + o.w - it.x);
    if (u2 > u1) {
      if (touchesTop(o)) topTouched.push([u1, u2]);
      if (touchesBottom(o)) bottomTouched.push([u1, u2]);
    }
    const v1 = Math.max(0, o.y - it.y);
    const v2 = Math.min(it.h, o.y + o.h - it.y);
    if (v2 > v1) {
      if (touchesLeft(o)) leftTouched.push([v1, v2]);
      if (touchesRight(o)) rightTouched.push([v1, v2]);
    }
  }

  const vertical = isCorridorVertical(it, corridors);
  let start = 0.35;
  let end = (vertical ? it.h : it.w) - 0.35;

  if (!vertical) {
    const leftN = others.find((o) => touchesLeft(o) && overlapsY(o));
    const leftCorner = !leftN && others.find((o) => isCorridorVertical(o, corridors) && o.x <= it.x + 0.5 && o.x + o.w > it.x && (touchesTop(o) || touchesBottom(o)));
    if (leftN) start = isCorridorVertical(leftN, corridors) ? leftN.x + leftN.w / 2 - it.x : 0;
    else if (leftCorner) start = leftCorner.x + leftCorner.w / 2 - it.x;

    const rightN = others.find((o) => touchesRight(o) && overlapsY(o));
    const rightCorner = !rightN && others.find((o) => isCorridorVertical(o, corridors) && o.x < it.x + it.w && o.x + o.w >= it.x + it.w - 0.5 && (touchesTop(o) || touchesBottom(o)));
    if (rightN) end = isCorridorVertical(rightN, corridors) ? rightN.x + rightN.w / 2 - it.x : it.w;
    else if (rightCorner) end = rightCorner.x + rightCorner.w / 2 - it.x;
  } else {
    const topN = others.find((o) => touchesTop(o) && overlapsX(o));
    const topCorner = !topN && others.find((o) => !isCorridorVertical(o, corridors) && o.y <= it.y + 0.5 && o.y + o.h > it.y && (touchesLeft(o) || touchesRight(o)));
    if (topN) start = !isCorridorVertical(topN, corridors) ? topN.y + topN.h / 2 - it.y : 0;
    else if (topCorner) start = topCorner.y + topCorner.h / 2 - it.y;

    const bottomN = others.find((o) => touchesBottom(o) && overlapsX(o));
    const bottomCorner = !bottomN && others.find((o) => !isCorridorVertical(o, corridors) && o.y < it.y + it.h && o.y + o.h >= it.y + it.h - 0.5 && (touchesLeft(o) || touchesRight(o)));
    if (bottomN) end = !isCorridorVertical(bottomN, corridors) ? bottomN.y + bottomN.h / 2 - it.y : it.h;
    else if (bottomCorner) end = bottomCorner.y + bottomCorner.h / 2 - it.y;
  }

  return {
    topSegs: subtractIntervals(it.w, topTouched),
    bottomSegs: subtractIntervals(it.w, bottomTouched),
    leftSegs: subtractIntervals(it.h, leftTouched),
    rightSegs: subtractIntervals(it.h, rightTouched),
    bottomTouched,
    rightTouched,
    tlSharp: topTouched.some(([a]) => a <= 0.01) || leftTouched.some(([a]) => a <= 0.01),
    trSharp: topTouched.some(([, b]) => b >= it.w - 0.01) || rightTouched.some(([a]) => a <= 0.01),
    blSharp: bottomTouched.some(([a]) => a <= 0.01) || leftTouched.some(([, b]) => b >= it.h - 0.01),
    brSharp: bottomTouched.some(([, b]) => b >= it.w - 0.01) || rightTouched.some(([, b]) => b >= it.h - 0.01),
    vertical,
    start,
    end,
  };
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
  const corridors = useMemo(() => items.filter((i) => i.kind === 'corridor'), [items]);
  const unplaced = floorShops.filter((s) => !placedUnitIds.has(s.unitId));

  const { width, containerRef } = useContainerWidth();
  const cellPx = Math.max(6, Math.floor(((width || 900) - 16) / columns));

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [connector, setConnector] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    setSelectedUnitId(null);
  }, [floor]);

  useEffect(() => {
    if (!fullScreen || !selectedUnitId) {
      setConnector(null);
      return;
    }
    const compute = () => {
      const wrap = containerRef.current as HTMLElement | null;
      if (!wrap) return;
      const infoEl = wrap.querySelector(`[data-info-unit-id="${selectedUnitId}"]`) as HTMLElement | null;
      const tileEl = wrap.querySelector(`[data-tile-unit-id="${selectedUnitId}"]`) as HTMLElement | null;
      if (!infoEl || !tileEl) {
        setConnector(null);
        return;
      }
      const wrapRect = wrap.getBoundingClientRect();
      const infoRect = infoEl.getBoundingClientRect();
      const tileRect = tileEl.getBoundingClientRect();
      const icx = infoRect.left + infoRect.width / 2 - wrapRect.left + wrap.scrollLeft;
      const icy = infoRect.top + infoRect.height / 2 - wrapRect.top + wrap.scrollTop;
      const tcx = tileRect.left + tileRect.width / 2 - wrapRect.left + wrap.scrollLeft;
      const tcy = tileRect.top + tileRect.height / 2 - wrapRect.top + wrap.scrollTop;
      const dx = icx - tcx;
      const dy = icy - tcy;
      const ihw = Math.max(1, infoRect.width / 2);
      const ihh = Math.max(1, infoRect.height / 2);
      const thw = Math.max(1, tileRect.width / 2);
      const thh = Math.max(1, tileRect.height / 2);
      const iScale = dx === 0 && dy === 0 ? 0 : 1 / Math.max(Math.abs(dx) / ihw, Math.abs(dy) / ihh);
      const tScale = dx === 0 && dy === 0 ? 0 : 1 / Math.max(Math.abs(dx) / thw, Math.abs(dy) / thh);
      const x1 = icx - dx * iScale;
      const y1 = icy - dy * iScale;
      const x2 = tcx + dx * tScale;
      const y2 = tcy + dy * tScale;
      setConnector({ x1, y1, x2, y2 });
    };
    const raf = requestAnimationFrame(compute);
    const wrap = containerRef.current as HTMLElement | null;
    window.addEventListener('resize', compute);
    wrap?.addEventListener('scroll', compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
      wrap?.removeEventListener('scroll', compute);
    };
  }, [fullScreen, selectedUnitId, items, width, cellPx, containerRef]);

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
        <select
          className="shop-map-floor-select"
          value={floor}
          onChange={(e) => switchFloor(e.target.value)}
        >
          {floors.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
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
        <div
          ref={containerRef as any}
          className={`shop-map-canvas-wrap ${editing ? 'editing' : ''} ${fullScreen && !editing && selectedUnitId ? 'has-routed-unit' : ''}`}
          onClick={() => { if (selectedUnitId) setSelectedUnitId(null); }}
        >
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
              onDrag={onLayoutChange as any}
              onResize={onLayoutChange as any}
            >
              {items.map((it) => {
                const shop = it.unitId ? shopByUnit.get(it.unitId) : null;
                const decor = it.kind !== 'unit';
                const isTarget = !decor && Boolean(selectedUnitId && it.unitId === selectedUnitId);
                const dim = !decor && shop ? !matches(shop) : false;
                const tiny = !decor && (it.w * cellPx < 24 || it.h * cellPx < 18);
                const minSidePx = Math.min(it.w, it.h) * cellPx;
                const badgePx = Math.max(18, Math.min(96, Math.round(minSidePx * 0.68)));
                const iconPx = Math.max(12, Math.round(badgePx * 0.62));
                const decorType = it.kind as Exclude<TileKind, 'unit'>;
                const decorLabel = DECORATION_LABELS[decorType] || it.label || '';
                const cm = it.kind === 'corridor' ? getCorridorMergeData(it, corridors) : null;
                const wPx = Math.max(1, it.w * cellPx);
                const hPx = Math.max(1, it.h * cellPx);
                const sharpClasses = cm
                  ? `${cm.tlSharp ? 'sharp-tl' : ''} ${cm.trSharp ? 'sharp-tr' : ''} ${cm.blSharp ? 'sharp-bl' : ''} ${cm.brSharp ? 'sharp-br' : ''}`
                  : '';
                const title = decor
                  ? decorLabel
                  : `${shop?.brandName || shop?.unit?.unitNumber || ''} • ${shop?.unit?.unitNumber || ''} • ${shop?.unit?.areaSqft ?? '—'} sqft • ${shop?.unit?.status || ''}`;
                return (
                  <div
                    key={it.key}
                    title={title}
                    data-tile-unit-id={it.unitId || undefined}
                    className={`shop-map-tile ${decor ? `st-decor st-decor-${it.kind} ${sharpClasses}` : statusClass(shop)} ${editing ? 'editing' : ''} ${dim ? 'dim' : ''} ${tiny ? 'tiny' : ''} ${isTarget ? 'active-target' : ''}`}
                    onClick={() => { if (!editing && shop) onOpenShop(shop); }}
                  >
                    {decor ? (
                      it.kind === 'corridor' && cm ? (
                        <svg
                          className="shop-map-corridor-svg"
                          viewBox={`0 0 ${wPx} ${hPx}`}
                          preserveAspectRatio="none"
                        >
                          {cm.bottomTouched.map(([u1, u2], idx) => (
                            <rect
                              key={`bb-${idx}`}
                              x={u1 * cellPx}
                              y={hPx - 1}
                              width={(u2 - u1) * cellPx}
                              height={3}
                              className="shop-map-corridor-bridge"
                            />
                          ))}
                          {cm.rightTouched.map(([v1, v2], idx) => (
                            <rect
                              key={`rb-${idx}`}
                              x={wPx - 1}
                              y={v1 * cellPx}
                              width={3}
                              height={(v2 - v1) * cellPx}
                              className="shop-map-corridor-bridge"
                            />
                          ))}
                          {cm.topSegs.map(([u1, u2], idx) => (
                            <line
                              key={`t-${idx}`}
                              x1={u1 * cellPx}
                              y1={0.75}
                              x2={u2 * cellPx}
                              y2={0.75}
                              className="shop-map-corridor-border"
                            />
                          ))}
                          {cm.bottomSegs.map(([u1, u2], idx) => (
                            <line
                              key={`b-${idx}`}
                              x1={u1 * cellPx}
                              y1={hPx - 0.75}
                              x2={u2 * cellPx}
                              y2={hPx - 0.75}
                              className="shop-map-corridor-border"
                            />
                          ))}
                          {cm.leftSegs.map(([v1, v2], idx) => (
                            <line
                              key={`l-${idx}`}
                              x1={0.75}
                              y1={v1 * cellPx}
                              x2={0.75}
                              y2={v2 * cellPx}
                              className="shop-map-corridor-border"
                            />
                          ))}
                          {cm.rightSegs.map(([v1, v2], idx) => (
                            <line
                              key={`r-${idx}`}
                              x1={wPx - 0.75}
                              y1={v1 * cellPx}
                              x2={wPx - 0.75}
                              y2={v2 * cellPx}
                              className="shop-map-corridor-border"
                            />
                          ))}
                          {!cm.vertical ? (
                            <line
                              x1={cm.start * cellPx + (cm.start < 0 ? -1 : 0)}
                              y1={hPx / 2}
                              x2={cm.end * cellPx + (cm.end > it.w ? 1 : 0)}
                              y2={hPx / 2}
                              className="shop-map-corridor-centerline"
                            />
                          ) : (
                            <line
                              x1={wPx / 2}
                              y1={cm.start * cellPx + (cm.start < 0 ? -1 : 0)}
                              x2={wPx / 2}
                              y2={cm.end * cellPx + (cm.end > it.h ? 1 : 0)}
                              className="shop-map-corridor-centerline"
                            />
                          )}
                        </svg>
                      ) : (
                        <div className="shop-map-decor-badge" style={{ width: badgePx, height: badgePx }}>
                          <span className="shop-map-decor-icon">
                            <DecorIcon kind={decorType as Exclude<TileKind, 'unit' | 'corridor'>} size={iconPx} />
                          </span>
                        </div>
                      )
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
          {fullScreen && !editing && connector && (
            <svg className="shop-map-connector-svg">
              <line
                x1={connector.x1}
                y1={connector.y1}
                x2={connector.x2}
                y2={connector.y2}
                className="shop-map-connector-line"
              />
              <circle cx={connector.x1} cy={connector.y1} r={3.5} className="shop-map-connector-dot" />
              <circle cx={connector.x2} cy={connector.y2} r={4.5} className="shop-map-connector-dot target" />
            </svg>
          )}
          {fullScreen && !editing && (placedShops.length > 0 || placedDecorKinds.length > 0) && (
            <div className="shop-map-directory-overlays" onClick={(e) => e.stopPropagation()}>
              {placedShops.length > 0 && (
                <div
                  className="shop-map-directory-index"
                  style={{ '--dir-rows': Math.min(placedShops.length, Math.max(6, Math.ceil(placedShops.length / 5))) } as React.CSSProperties}
                >
                  {placedShops.map((s) => (
                    <div
                      key={s.unitId}
                      data-info-unit-id={s.unitId}
                      className={`shop-map-directory-row ${selectedUnitId === s.unitId ? 'active' : ''}`}
                      onClick={() => setSelectedUnitId((prev) => (prev === s.unitId ? null : s.unitId))}
                    >
                      <span className="shop-map-directory-unit">{s.unit?.unitNumber || s.shopNumber}</span>
                      <span className="shop-map-directory-name">{s.brandName || 'Vacant'}</span>
                    </div>
                  ))}
                </div>
              )}
              {placedDecorKinds.length > 0 && (
                <div
                  className="shop-map-directory-index"
                  style={{ '--dir-rows': Math.min(placedDecorKinds.length, 6) } as React.CSSProperties}
                >
                  {placedDecorKinds.map((kind) => (
                    <div key={`decor-${kind}`} className="shop-map-directory-row is-marker">
                      {kind === 'corridor' ? (
                        <span className="shop-map-directory-corridor-swatch" />
                      ) : (
                        <span className={`shop-map-directory-marker-badge lg-${kind}`}>
                          <DecorIcon kind={kind} size={11} />
                        </span>
                      )}
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
