import { useEffect, useMemo, useState } from 'react';
import ReactGridLayout, { useContainerWidth, getCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import toast from 'react-hot-toast';
import { RotateCw, X, Pencil, Save, Plus, Maximize2, Trash2, LayoutGrid, Image as ImageIcon, Map as MapIcon } from 'lucide-react';
import { useGetFloorPlanQuery, useSaveFloorPlanMutation } from '../../../store/api/mallApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import {
  DECORATION_DEFAULT_SIZES, DECORATION_LABELS, DEFAULT_COLUMNS, DEFAULT_SQFT_PER_CELL,
  SHOP_CATEGORIES, findFreeSpot, floorKeyOf, hasAnyOverlap, resolveOverlaps,
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
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 3.5H20a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-5.5" />
          <rect x="15.5" y="4.5" width="4.5" height="15" fill="currentColor" fillOpacity="0.2" stroke="none" />
          <circle cx="8.5" cy="5.5" r="2" fill="currentColor" stroke="none" />
          <path d="M3.5 10.5l3.2-2 3.8 1 2.2 2.8" />
          <path d="M7.2 13L4.5 19.5" />
          <path d="M7.5 12.8l3.5 1.4 1.5 5.3" />
          <path d="M14 12h4.5m0 0l-2-2m2 2l-2 2" />
        </svg>
      );
  }
}

function CategoryIcon({ category, size = 26 }: { category: string; size?: number }) {
  switch (category) {
    case 'Dining':
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          {/* Fork */}
          <path d="M4.5 4v6.5a2 2 0 0 0 2 2v11.5" />
          <path d="M6.5 4v5.5" />
          <path d="M8.5 4v6.5a2 2 0 0 1-2 2" />
          {/* Plate */}
          <circle cx="14.5" cy="14" r="5.5" strokeWidth="2" />
          <circle cx="14.5" cy="14" r="3.2" fill="currentColor" fillOpacity="0.22" strokeWidth="1.5" />
          {/* Knife */}
          <path d="M23 4v11h-2V7.5A3.5 3.5 0 0 1 23 4Z" fill="currentColor" fillOpacity="0.22" />
          <path d="M23 15v9" />
        </svg>
      );
    case 'Health/Pharmacy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" />
          <path d="M9 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1.5" />
          <path d="M12 9.5v6M9 12.5h6" strokeWidth="2.2" />
        </svg>
      );
    case 'ATMs':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
          <line x1="6.5" y1="14.5" x2="10.5" y2="14.5" strokeWidth="2.2" />
          <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'Beauty & Wellness':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" fill="currentColor" fillOpacity="0.18" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
          <path d="M5 16l.7 1.6L7.3 18.3l-1.6.7L5 20.6l-.7-1.6-1.6-.7 1.6-.7L5 16Z" />
        </svg>
      );
    case 'Education':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 4 2 9 12 14 22 9 12 4" fill="currentColor" fillOpacity="0.18" />
          <path d="M6 11.5v5c0 1.8 2.7 3.5 6 3.5s6-1.7 6-3.5v-5" />
          <path d="M22 9v6" />
        </svg>
      );
    case 'Fashion & Accessories':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 7h12l1.2 13H4.8L6 7Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
        </svg>
      );
    case 'Services':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="3" y1="13" x2="21" y2="13" />
        </svg>
      );
    case 'Sports & Lifestyle':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5v11M3.5 8.5v7M17.5 6.5v11M20.5 8.5v7M6.5 12h11" />
        </svg>
      );
    case 'Supermarket':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="20" r="1.5" fill="currentColor" />
          <circle cx="18" cy="20" r="1.5" fill="currentColor" />
          <path d="M2.5 4h2.5l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.4-1.1L21 7H6" />
        </svg>
      );
    case 'Watches & Jewellery':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="6 4 18 4 22 9 12 21 2 9 6 4" fill="currentColor" fillOpacity="0.16" />
          <line x1="2" y1="9" x2="22" y2="9" />
          <polyline points="9.5 4 7.5 9 12 21 16.5 9 14.5 4" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l1.8-5h14.4L21 9" />
          <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
          <path d="M5 12v8h14v-8" />
          <path d="M10 15h4v5h-4z" />
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
  const placedCategories = useMemo(() => {
    const groups = new Map<string, any[]>();
    placedShops.forEach((s) => {
      const cat = (s.tradeCategory || 'Other').trim() || 'Other';
      const list = groups.get(cat) || [];
      list.push(s);
      groups.set(cat, list);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const ia = (SHOP_CATEGORIES as readonly string[]).indexOf(a);
        const ib = (SHOP_CATEGORIES as readonly string[]).indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(([category, shopsList]) => ({ category, shops: shopsList }));
  }, [placedShops]);

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
  const [connector, setConnector] = useState<{ x1: number; y1: number; x2: number; y2: number; points: string } | null>(null);

  useEffect(() => {
    setSelectedUnitId(null);
  }, [floor]);

  useEffect(() => {
    if (editing || !selectedUnitId) {
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
      const boxEl = infoEl.closest('.shop-map-directory-overlays') as HTMLElement | null;
      const boxRect = boxEl ? boxEl.getBoundingClientRect() : infoRect;

      const x1 = infoRect.left + infoRect.width / 2 - wrapRect.left + wrap.scrollLeft;
      const y1 = infoRect.top - wrapRect.top + wrap.scrollTop;
      const x2 = tileRect.left + tileRect.width / 2 - wrapRect.left + wrap.scrollLeft;
      const y2 = tileRect.bottom - wrapRect.top + wrap.scrollTop;
      const boxTop = boxRect.top - wrapRect.top + wrap.scrollTop;
      const yMid = Math.max(y2, Math.min(y1, boxTop) - 14);
      const points = `${x1},${y1} ${x1},${yMid} ${x2},${yMid} ${x2},${y2}`;
      setConnector({ x1, y1, x2, y2, points });
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
  }, [editing, selectedUnitId, items, width, cellPx, containerRef]);

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

  const [mapView, setMapView] = useState<'default' | 'photo'>(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    return v === 'photo' ? 'photo' : 'default';
  });

  const openFullScreenTab = () => {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (floor) params.set('floor', floor);
    if (mapView === 'photo') params.set('view', 'photo');
    window.open(`/admin/mall/shops/map?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  if (floors.length === 0) return null;

  return (
    <div className={`shop-map ${fullScreen ? 'shop-map-fullscreen' : ''}`}>
      <div className="shop-map-toolbar">
        <div className="shop-map-toolbar-left">
          <select
            className="shop-map-floor-select"
            value={floor}
            onChange={(e) => switchFloor(e.target.value)}
          >
            {floors.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <div className="shop-map-view-switch" role="group" aria-label="Map view mode">
            <button
              type="button"
              className={`shop-map-view-opt ${mapView === 'default' ? 'active' : ''}`}
              onClick={() => setMapView('default')}
            >
              <LayoutGrid size={14} /> View 1
            </button>
            <button
              type="button"
              className={`shop-map-view-opt ${mapView === 'photo' ? 'active' : ''}`}
              onClick={() => setMapView('photo')}
            >
              <ImageIcon size={14} /> View 2
            </button>
          </div>
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
          className={`shop-map-canvas-wrap ${editing ? 'editing' : ''} ${!editing && selectedUnitId ? 'has-routed-unit' : ''}`}
          onClick={() => { if (selectedUnitId) setSelectedUnitId(null); }}
        >
          {isFetching && items.length === 0 ? (
            <div className="shop-map-empty-state">
              <div className="shop-map-empty-icon">
                <MapIcon size={26} />
              </div>
              <h4 className="shop-map-empty-title">Loading Floor Map…</h4>
            </div>
          ) : items.length === 0 && !editing ? (
            <div className="shop-map-empty-state">
              <div className="shop-map-empty-icon">
                <MapIcon size={28} />
              </div>
              <h4 className="shop-map-empty-title">{floor} Map Not Configured</h4>
              <p className="shop-map-empty-desc">
                {floorShops.length > 0
                  ? `${floorShops.length} ${floorShops.length === 1 ? 'unit is' : 'units are'} available on this floor and ready to be arranged on the interactive map.`
                  : 'No units or landmarks have been placed on this floor layout yet.'}
              </p>
              {!fullScreen && (
                <PermissionGuard permission="mall-shops.write" hideWhenDenied>
                  <div className="shop-map-empty-actions">
                    <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
                      <Pencil size={14} /> Edit Layout
                    </button>
                  </div>
                </PermissionGuard>
              )}
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
                const unitLabel = shop?.unit?.unitNumber || shop?.shopNumber || '';
                const rawPhotoUrl = shop?.unit?.floorPlanUrl as string | undefined | null;
                const isImagePhoto = Boolean(rawPhotoUrl && /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(rawPhotoUrl));
                const photoSrc = rawPhotoUrl
                  ? rawPhotoUrl.startsWith('http')
                    ? rawPhotoUrl
                    : `/api/v1${rawPhotoUrl}`
                  : null;
                const showPhotoMode = !decor && mapView === 'photo';
                const hasUnitPhoto = showPhotoMode && isImagePhoto && Boolean(photoSrc);
                const title = decor
                  ? decorLabel
                  : `${shop?.brandName || unitLabel} • ${unitLabel} • ${shop?.unit?.areaSqft ?? '—'} sqft • ${shop?.unit?.status || ''}`;
                return (
                  <div
                    key={it.key}
                    title={title}
                    data-tile-unit-id={it.unitId || undefined}
                    className={`shop-map-tile ${decor ? `st-decor st-decor-${it.kind} ${sharpClasses}` : statusClass(shop)} ${hasUnitPhoto ? 'has-unit-photo' : ''} ${editing ? 'editing' : ''} ${dim ? 'dim' : ''} ${tiny ? 'tiny' : ''} ${isTarget ? 'active-target' : ''}`}
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
                          {[
                            ...cm.topSegs.map(([u1, u2]) => ({ x1: u1 * cellPx, y1: 0.75, x2: u2 * cellPx, y2: 0.75 })),
                            ...cm.bottomSegs.map(([u1, u2]) => ({ x1: u1 * cellPx, y1: hPx - 0.75, x2: u2 * cellPx, y2: hPx - 0.75 })),
                            ...cm.leftSegs.map(([v1, v2]) => ({ x1: 0.75, y1: v1 * cellPx, x2: 0.75, y2: v2 * cellPx })),
                            ...cm.rightSegs.map(([v1, v2]) => ({ x1: wPx - 0.75, y1: v1 * cellPx, x2: wPx - 0.75, y2: v2 * cellPx })),
                          ].map((seg, idx) => (
                            <line key={`b-${idx}`} {...seg} className="shop-map-corridor-border" />
                          ))}
                          <line
                            x1={cm.vertical ? wPx / 2 : cm.start * cellPx + (cm.start < 0 ? -1 : 0)}
                            y1={cm.vertical ? cm.start * cellPx + (cm.start < 0 ? -1 : 0) : hPx / 2}
                            x2={cm.vertical ? wPx / 2 : cm.end * cellPx + (cm.end > it.w ? 1 : 0)}
                            y2={cm.vertical ? cm.end * cellPx + (cm.end > it.h ? 1 : 0) : hPx / 2}
                            className="shop-map-corridor-centerline"
                          />
                        </svg>
                      ) : (
                        <div className="shop-map-decor-badge" style={{ width: badgePx, height: badgePx }}>
                          <span className="shop-map-decor-icon">
                            <DecorIcon kind={decorType as Exclude<TileKind, 'unit' | 'corridor'>} size={iconPx} />
                          </span>
                        </div>
                      )
                    ) : hasUnitPhoto && photoSrc ? (
                      <img
                        src={photoSrc}
                        alt={unitLabel}
                        className="shop-map-tile-photo"
                        loading="lazy"
                      />
                    ) : (
                      <div className="shop-map-tile-name">{unitLabel}</div>
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
          {!editing && connector && (
            <svg className="shop-map-connector-svg">
              <polyline
                points={connector.points}
                className="shop-map-connector-line"
              />
              <circle cx={connector.x1} cy={connector.y1} r={3.5} className="shop-map-connector-dot" />
              <circle cx={connector.x2} cy={connector.y2} r={4.5} className="shop-map-connector-dot target" />
            </svg>
          )}
          {!editing && (placedCategories.length > 0 || placedDecorKinds.length > 0) && (
            <div className="shop-map-directory-overlays" onClick={(e) => e.stopPropagation()}>
              {placedDecorKinds.length > 0 && (
                <div className="shop-map-landmarks-bar">
                  {placedDecorKinds.map((kind) => (
                    <div key={`decor-${kind}`} className="shop-map-landmark-item">
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
              {placedCategories.length > 0 && (
                <div className="shop-map-category-grid">
                  {placedCategories.map(({ category, shops: catShops }) => (
                    <div key={category} className="shop-map-cat-card">
                      <div className="shop-map-cat-header">
                        <span className="shop-map-cat-icon">
                          <CategoryIcon category={category} size={15} />
                        </span>
                        <h4 className="shop-map-cat-title">{category.toUpperCase()}</h4>
                      </div>
                      <div className="shop-map-cat-divider" />
                      <div className="shop-map-cat-cols">
                        <span>STORE</span>
                        <span>UNIT</span>
                      </div>
                      <div className="shop-map-cat-rows">
                        {catShops.map((s) => {
                          const isSelected = selectedUnitId === s.unitId;
                          return (
                            <div
                              key={s.unitId}
                              data-info-unit-id={s.unitId}
                              className={`shop-map-cat-row ${isSelected ? 'active' : ''}`}
                              onClick={() => setSelectedUnitId((prev) => (prev === s.unitId ? null : s.unitId))}
                            >
                              <span className="shop-map-cat-store">{s.brandName || 'Vacant'}</span>
                              <span className="shop-map-cat-unit">{s.unit?.unitNumber || s.shopNumber}</span>
                            </div>
                          );
                        })}
                      </div>
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
