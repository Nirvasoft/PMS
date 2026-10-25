import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactGridLayout, { useContainerWidth, getCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import toast from 'react-hot-toast';
import {
  RotateCw, X, Pencil, Save, Plus, Maximize2, Trash2, LayoutGrid,
  Map as MapIcon, QrCode, Navigation, MapPin,
  Printer, Copy, ExternalLink, Info, ArrowRight,
} from 'lucide-react';
import {
  useGetFloorPlanQuery,
  useGetPublicFloorPlanQuery,
  useSaveFloorPlanMutation,
  useGetMallQrCodeQuery,
} from '../../../store/api/mallApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import {
  DECORATION_DEFAULT_SIZES, DECORATION_LABELS, DEFAULT_COLUMNS, DEFAULT_SQFT_PER_CELL,
  SHOP_CATEGORIES, findFreeSpot, floorKeyOf, hasAnyOverlap, resolveOverlaps,
  sizeUnitTile, tileSizeFromSqft, unitKey,
  computeWalkwayPath, findDefaultStartItem, findNearestFacilityItem,
  rotateMapLayout, parseRotationAngle, getCorridorMergeData,
  type MapItem, type TileKind, type MapRotationAngle,
} from './shopMapLayout';
import {
  isUnitPhotoImage,
  preloadUnitPhotosBatch,
} from '../../../utils/unitPhotoCache';
import { CachedUnitPhoto, useUnitPhotoCache } from '../../../components/common/CachedUnitPhoto';
import './ShopMapView.css';

interface Props {
  shops: any[];
  propertyId: string | undefined | null;
  propertyName?: string;
  matches: (shop: any) => boolean;
  onOpenShop: (shop: any) => void;
  fullScreen?: boolean;
  initialFloor?: string;
  publicMode?: boolean;
}

const noCompaction = getCompactor(null as any, false, true);

function Cute3DCubeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2.5 21 7.5 12 12.5 3 7.5 12 2.5" fill="currentColor" fillOpacity="0.28" />
      <polygon points="3 7.5 12 12.5 12 21.5 3 16.5 3 7.5" fill="currentColor" fillOpacity="0.14" />
      <polygon points="21 7.5 12 12.5 12 21.5 21 16.5 21 7.5" fill="currentColor" fillOpacity="0.06" />
    </svg>
  );
}

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

export default function ShopMapView({
  shops,
  propertyId,
  propertyName,
  matches,
  onOpenShop,
  fullScreen = false,
  initialFloor,
  publicMode = false,
}: Props) {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialFromParam = urlParams.get('from') || '';
  const initialToParam = urlParams.get('to') || '';
  const initialRotateParam = parseRotationAngle(urlParams.get('rotate'));

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
  const allShopByUnit = useMemo(() => new Map(shops.map((s) => [s.unitId, s])), [shops]);
  useUnitPhotoCache();

  // Preload and cache unit photos in the background as soon as shops load
  useEffect(() => {
    let cancelled = false;
    const currentFloorUrls = floorShops.map((s) => s?.unit?.floorPlanUrl);
    const otherFloorUrls = shops.filter((s) => floorKeyOf(s) !== floor).map((s) => s?.unit?.floorPlanUrl);

    preloadUnitPhotosBatch(currentFloorUrls).then(() => {
      if (!cancelled) preloadUnitPhotosBatch(otherFloorUrls);
    });

    return () => {
      cancelled = true;
    };
  }, [floorShops, shops, floor]);

  const adminPlanQuery = useGetFloorPlanQuery(
    { propertyId: propertyId as string, floor },
    { skip: !propertyId || !floor || publicMode },
  );
  const publicPlanQuery = useGetPublicFloorPlanQuery(
    { propertyId: propertyId as string, floor },
    { skip: !propertyId || !floor || !publicMode },
  );
  const plan = publicMode ? publicPlanQuery.data : adminPlanQuery.data;
  const isFetching = publicMode ? publicPlanQuery.isFetching : adminPlanQuery.isFetching;

  const [savePlan, { isLoading: saving }] = useSaveFloorPlanMutation();

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [items, setItems] = useState<MapItem[]>([]);
  const [sqftPerCell, setSqftPerCell] = useState(DEFAULT_SQFT_PER_CELL);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [decorKind, setDecorKind] = useState<Exclude<TileKind, 'unit'>>('marker');
  const [decorSeq, setDecorSeq] = useState(1);

  // Indoor Navigation, Map Rotation & Floor QR state
  const [mapRotation, setMapRotation] = useState<MapRotationAngle>(initialRotateParam);
  const [customStartKey, setCustomStartKey] = useState<string>(initialFromParam);
  const [targetKey, setTargetKey] = useState<string>(initialToParam);
  const [crossFloorUnitId, setCrossFloorUnitId] = useState<string | null>(null);
  const [transitArrivalMode, setTransitArrivalMode] = useState(false);
  const [originFloorBeforeTransit, setOriginFloorBeforeTransit] = useState<string | null>(null);
  const [showFloorQrModal, setShowFloorQrModal] = useState(false);
  const [qrModalFloor, setQrModalFloor] = useState<string>('');
  const [showRouteQrModal, setShowRouteQrModal] = useState(false);

  const planData: any = (plan as any)?.data ?? plan;

  // (Re)load draft from server whenever floor / data changes and there are no unsaved edits.
  useEffect(() => {
    if (dirty) return;
    const spc = Number(planData?.sqftPerCell) || DEFAULT_SQFT_PER_CELL;
    const cols = Number(planData?.columns) || DEFAULT_COLUMNS;
    const saved: any[] = planData?.items || [];
    const next: MapItem[] = [];
    let d = 1;
    let hasMarker = false;
    saved.forEach((it) => {
      if (it.kind === 'unit') {
        const shop = shopByUnit.get(it.unitId);
        if (!shop) return;
        const size = sizeUnitTile({ w: it.w, h: it.h }, shop.unit?.areaSqft, spc, cols);
        next.push({ key: unitKey(it.unitId), kind: 'unit', unitId: it.unitId, label: it.label ?? null, x: it.x, y: it.y, ...size });
      } else {
        if (it.kind === 'marker') {
          if (hasMarker) return;
          hasMarker = true;
        }
        next.push({ key: `d:${d++}`, kind: it.kind, unitId: null, label: it.label ?? null, x: it.x, y: it.y, w: it.w, h: it.h });
      }
    });
    setSqftPerCell(spc);
    setColumns(cols);
    setDecorSeq(d);
    setItems(resolveOverlaps(next, cols));
  }, [planData, shopByUnit, dirty]);

  const effectiveRotation: MapRotationAngle = editing ? 0 : mapRotation;
  const rotatedLayout = useMemo(
    () => rotateMapLayout(items, columns, effectiveRotation),
    [items, columns, effectiveRotation],
  );
  const displayItems = rotatedLayout.items;
  const displayColumns = rotatedLayout.columns;

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
  const otherFloorShops = useMemo(
    () =>
      shops
        .filter((s) => floorKeyOf(s) !== floor)
        .sort((a, b) =>
          String(floorKeyOf(a)).localeCompare(String(floorKeyOf(b))) ||
          String(a.brandName || a.unit?.unitNumber || '').localeCompare(String(b.brandName || b.unit?.unitNumber || '')),
        ),
    [shops, floor],
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
  const corridors = useMemo(() => displayItems.filter((i) => i.kind === 'corridor'), [displayItems]);
  const unplaced = floorShops.filter((s) => !placedUnitIds.has(s.unitId));

  const { width, containerRef } = useContainerWidth();
  const gridWidth = Math.max(0, (width || 900) - 16);
  const cellPx = Math.max(6, Math.floor(gridWidth / displayColumns));
  const colStepPx = displayColumns > 0 ? (gridWidth - (displayColumns - 1)) / displayColumns + 1 : cellPx + 1;
  const rowStepPx = cellPx + 1;

  // Resolve starting point ("You Are Here" by default, or user-selected shop/landmark)
  const defaultStartItem = useMemo(() => findDefaultStartItem(displayItems), [displayItems]);
  const activeStartItem = useMemo(() => {
    if (customStartKey) {
      const found = displayItems.find((i) => i.key === customStartKey);
      if (found) return found;
    }
    if (transitArrivalMode) {
      const transit = displayItems.find((i) => i.kind === 'escalator' || i.kind === 'stairs');
      if (transit) return transit;
    }
    return defaultStartItem;
  }, [displayItems, customStartKey, transitArrivalMode, defaultStartItem]);

  // If we arrived on a new floor via multi-floor navigation, automatically target the cross-floor unit
  useEffect(() => {
    if (crossFloorUnitId) {
      const targetShop = allShopByUnit.get(crossFloorUnitId);
      if (targetShop && floorKeyOf(targetShop) === floor) {
        const uKey = unitKey(crossFloorUnitId);
        if (displayItems.some((i) => i.key === uKey)) {
          setTargetKey(uKey);
          setCrossFloorUnitId(null);
        }
      }
    }
  }, [crossFloorUnitId, floor, displayItems, allShopByUnit]);

  const crossFloorShop = useMemo(
    () => (crossFloorUnitId ? allShopByUnit.get(crossFloorUnitId) || null : null),
    [crossFloorUnitId, allShopByUnit],
  );

  // Resolve effective target item on the current floor
  const effectiveTargetItem = useMemo(() => {
    if (crossFloorShop && floorKeyOf(crossFloorShop) !== floor) {
      return findNearestFacilityItem(displayItems, activeStartItem, ['escalator', 'stairs', 'exit']);
    }
    if (!targetKey) return null;
    return displayItems.find((i) => i.key === targetKey) || null;
  }, [crossFloorShop, floor, displayItems, activeStartItem, targetKey]);

  const selectedUnitId = useMemo(() => {
    if (effectiveTargetItem?.kind === 'unit' && effectiveTargetItem.unitId) {
      return effectiveTargetItem.unitId;
    }
    return null;
  }, [effectiveTargetItem]);

  const selectedShop = useMemo(
    () => (selectedUnitId ? shopByUnit.get(selectedUnitId) || null : null),
    [selectedUnitId, shopByUnit],
  );

  // Compute walkway path along corridors
  const walkwayRoute = useMemo(() => {
    if (editing || !activeStartItem || !effectiveTargetItem) return null;
    if (activeStartItem.key === effectiveTargetItem.key) return null;
    return computeWalkwayPath(displayItems, activeStartItem, effectiveTargetItem, displayColumns, sqftPerCell);
  }, [editing, activeStartItem, effectiveTargetItem, displayItems, displayColumns, sqftPerCell]);

  const shopDisplayName = (s: any): string => {
    const name = typeof s?.brandName === 'string' ? s.brandName.trim() : '';
    if (name) return name;
    return s?.unit?.unitNumber || s?.shopNumber || 'Shop';
  };

  const describeTile = (it: MapItem | null): string => {
    if (!it) return '—';
    if (it.kind === 'unit' && it.unitId) {
      return shopDisplayName(shopByUnit.get(it.unitId));
    }
    return DECORATION_LABELS[it.kind as Exclude<TileKind, 'unit'>] || it.label || it.kind;
  };

  const startOptions = useMemo(() => {
    const landmarks = displayItems.filter((i) => i.kind !== 'unit' && i.kind !== 'corridor');
    const unitItems = displayItems.filter((i) => i.kind === 'unit' && i.unitId);
    return { landmarks, unitItems };
  }, [displayItems]);

  const handleSelectDestination = (val: string) => {
    if (!val) {
      setTargetKey('');
      setCrossFloorUnitId(null);
      return;
    }
    if (val.startsWith('cross:')) {
      const uId = val.slice('cross:'.length);
      setCrossFloorUnitId(uId);
      setTargetKey('');
      return;
    }
    setCrossFloorUnitId(null);
    setTargetKey(val);
  };

  const handleQuickFacility = (kinds: TileKind[]) => {
    setCrossFloorUnitId(null);
    const nearest = findNearestFacilityItem(displayItems, activeStartItem, kinds);
    if (!nearest) {
      toast.error('Not available on this floor map');
      return;
    }
    setTargetKey((prev) => (prev === nearest.key ? '' : nearest.key));
  };

  const clearRoute = () => {
    setTargetKey('');
    setCrossFloorUnitId(null);
    setTransitArrivalMode(false);
    setOriginFloorBeforeTransit(null);
  };

  const cycleMapRotation = () => {
    setMapRotation((prev) => (((prev + 90) % 360) as MapRotationAngle));
  };

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
    if (decorKind === 'marker' && items.some((i) => i.kind === 'marker')) return;
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

  const remove = (key: string) =>
    update((prev) => prev.filter((i) => i.key !== key || i.kind === 'marker'));

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

  const startEditingLayout = () => {
    setDecorKind('marker');
    setEditing(true);
    if (!items.some((i) => i.kind === 'marker')) {
      const { w, h } = DECORATION_DEFAULT_SIZES.marker;
      const pos = findFreeSpot(items, w, h, columns);
      const nextItem: MapItem = {
        key: `d:${decorSeq}`,
        kind: 'marker',
        unitId: null,
        label: DECORATION_LABELS.marker,
        x: pos.x,
        y: pos.y,
        w,
        h,
      };
      setItems((prev) => [...prev, nextItem]);
      setDecorSeq((n) => n + 1);
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

  const switchFloor = (f: string, keepTransit = false) => {
    if (f === floor) return;
    if (dirty && !window.confirm('Discard unsaved map changes?')) return;
    setDirty(false);
    setEditing(false);
    setCustomStartKey('');
    if (!keepTransit) {
      setTargetKey('');
      setCrossFloorUnitId(null);
      setTransitArrivalMode(false);
      setOriginFloorBeforeTransit(null);
    }
    setFloor(f);
  };

  const proceedToDestinationFloor = () => {
    if (!crossFloorShop) return;
    const nextFloor = floorKeyOf(crossFloorShop);
    setOriginFloorBeforeTransit(floor);
    setTransitArrivalMode(true);
    switchFloor(nextFloor, true);
  };

  const layout = displayItems.map((i) => ({
    i: i.key, x: i.x, y: i.y, w: i.w, h: i.h,
    isResizable: editing,
    isDraggable: editing,
  }));

  const rows = Math.max(10, ...displayItems.map((i) => i.y + i.h)) + (editing ? 6 : 1);

  const [mapView, setMapView] = useState<'default' | 'photo'>(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    return v === 'photo' ? 'photo' : 'default';
  });

  const openFullScreenTab = () => {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (floor) params.set('floor', floor);
    if (mapView === 'photo') params.set('view', 'photo');
    if (mapRotation) params.set('rotate', String(mapRotation));
    window.open(`/admin/mall/shops/map?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const openFloorQr = () => {
    setQrModalFloor(floor);
    setShowFloorQrModal(true);
  };

  const activeQrFloor = qrModalFloor || floor;
  const floorQrUrl = useMemo(() => {
    if (!propertyId || !activeQrFloor) return '';
    const params = new URLSearchParams();
    params.set('propertyId', propertyId);
    params.set('floor', activeQrFloor);
    if (mapRotation) params.set('rotate', String(mapRotation));
    return `${window.location.origin}/mall/navigate?${params.toString()}`;
  }, [propertyId, activeQrFloor, mapRotation]);

  const routeQrUrl = useMemo(() => {
    if (!propertyId || !floor || !activeStartItem || !effectiveTargetItem) return '';
    const params = new URLSearchParams();
    params.set('propertyId', propertyId);
    params.set('floor', floor);
    params.set('from', activeStartItem.key);
    params.set('to', effectiveTargetItem.key);
    if (mapRotation) params.set('rotate', String(mapRotation));
    return `${window.location.origin}/mall/navigate?${params.toString()}`;
  }, [propertyId, floor, activeStartItem, effectiveTargetItem, mapRotation]);

  const { data: floorQrRes } = useGetMallQrCodeQuery(
    { text: floorQrUrl },
    { skip: !showFloorQrModal || !floorQrUrl },
  );
  const { data: routeQrRes } = useGetMallQrCodeQuery(
    { text: routeQrUrl },
    { skip: !showRouteQrModal || !routeQrUrl },
  );
  const floorQrDataUrl = floorQrRes?.data?.dataUrl || '';
  const routeQrDataUrl = routeQrRes?.data?.dataUrl || '';

  const handlePrintFloorQr = () => {
    if (!floorQrDataUrl) return;
    const win = window.open('', '_blank', 'width=520,height=680');
    if (!win) return;
    const titleText = propertyName ? `${propertyName} — ${activeQrFloor}` : activeQrFloor;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Floor QR — ${titleText}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 32px; display: flex; justify-content: center; background: #fff; color: #0f172a; }
    .card { border: 2px solid #0f172a; border-radius: 20px; padding: 32px 28px; text-align: center; max-width: 380px; width: 100%; }
    .badge { display: inline-block; background: #10b981; color: #fff; font-weight: 800; font-size: 14px; padding: 6px 16px; border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 12px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p.sub { margin: 0 0 20px; font-size: 14px; color: #475569; }
    img { width: 260px; height: 260px; display: block; margin: 0 auto 16px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; }
    .hint { font-size: 13px; color: #334155; font-weight: 600; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Indoor Navigation</div>
    <h1>${titleText}</h1>
    <p class="sub">Interactive Floor Directory &amp; Wayfinding</p>
    <img src="${floorQrDataUrl}" alt="Floor QR Code" />
    <div class="hint">Scan with your phone camera to see "You Are Here" and walking directions to any shop on ${activeQrFloor}.</div>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  if (floors.length === 0) return null;

  const hasMarkerOnFloor = items.some((i) => i.kind === 'marker');
  const isRoutingActive = Boolean(!editing && walkwayRoute && activeStartItem && effectiveTargetItem);

  return (
    <div className={`shop-map ${fullScreen ? 'shop-map-fullscreen' : ''} ${mapView === 'photo' ? 'shop-map-view2' : 'shop-map-view1'}`}>
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
              title="Layout View"
              aria-label="Layout View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className={`shop-map-view-opt ${mapView === 'photo' ? 'active' : ''}`}
              onClick={() => setMapView('photo')}
              title="3D Photo View"
              aria-label="3D Photo View"
            >
              <Cute3DCubeIcon size={16} />
            </button>
          </div>
          {!editing && (
            <button
              type="button"
              className={`btn btn-secondary ${mapRotation !== 0 ? 'active' : ''}`}
              onClick={cycleMapRotation}
              title="Rotate map"
            >
              <RotateCw size={14} /> Rotate
            </button>
          )}
          {!publicMode && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openFloorQr}
              title="Generate or Print QR Code for this Floor"
            >
              <QrCode size={14} /> Floor QR Code
            </button>
          )}
        </div>
        {!fullScreen && !publicMode && (
          <div className="shop-map-toolbar-actions">
            <button className="btn btn-secondary" onClick={openFullScreenTab} title="Open Full Screen Map in a new tab">
              <Maximize2 size={14} /> View Full Screen
            </button>
            <PermissionGuard permission="mall-shops.write" hideWhenDenied>
              {!editing ? (
                <button className="btn btn-secondary" onClick={startEditingLayout}>
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

      {/* ── Indoor Wayfinding / Navigation Bar ── */}
      {!editing && items.length > 0 && (
        <div className="shop-map-nav-bar">
          <div className="shop-map-nav-controls">
            <div className="shop-map-nav-field">
              <span className="shop-map-nav-label">
                <MapPin size={13} className="nav-pin-start-icon" /> From:
              </span>
              <select
                className="shop-map-nav-select"
                value={activeStartItem?.key || ''}
                onChange={(e) => {
                  setTransitArrivalMode(false);
                  setCustomStartKey(e.target.value);
                }}
              >
                {startOptions.landmarks.length > 0 && (
                  <optgroup label="Floor Landmarks & Entrances">
                    {startOptions.landmarks.map((lm) => (
                      <option key={lm.key} value={lm.key}>
                        {describeTile(lm)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {startOptions.unitItems.length > 0 && (
                  <optgroup label={`Shops on ${floor} (Standing Near)`}>
                    {startOptions.unitItems.map((u) => (
                      <option key={u.key} value={u.key}>
                        {describeTile(u)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <ArrowRight size={14} className="shop-map-nav-arrow" />

            <div className="shop-map-nav-field">
              <span className="shop-map-nav-label">
                <Navigation size={13} className="nav-pin-dest-icon" /> To:
              </span>
              <select
                className="shop-map-nav-select"
                value={crossFloorUnitId ? `cross:${crossFloorUnitId}` : targetKey}
                onChange={(e) => handleSelectDestination(e.target.value)}
              >
                <option value="">Select destination shop or facility…</option>
                {placedShops.length > 0 && (
                  <optgroup label={`Shops on ${floor}`}>
                    {placedShops.map((s) => (
                      <option key={s.unitId} value={unitKey(s.unitId)}>
                        {shopDisplayName(s)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {startOptions.landmarks.length > 0 && (
                  <optgroup label={`Facilities on ${floor}`}>
                    {startOptions.landmarks.map((lm) => (
                      <option key={lm.key} value={lm.key}>
                        {describeTile(lm)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherFloorShops.length > 0 && (
                  <optgroup label="Other Floors (Multi-Floor Route)">
                    {otherFloorShops.map((s) => (
                      <option key={s.unitId} value={`cross:${s.unitId}`}>
                        [{floorKeyOf(s)}] {shopDisplayName(s)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="shop-map-nav-quick">
              {items.some((i) => i.kind === 'toilet') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'toilet' ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['toilet'])}
                >
                  Restroom
                </button>
              )}
              {items.some((i) => i.kind === 'escalator' || i.kind === 'stairs') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'escalator' || effectiveTargetItem?.kind === 'stairs' ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['escalator', 'stairs'])}
                >
                  Elevator / Stairs
                </button>
              )}
              {items.some((i) => i.kind === 'exit') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'exit' ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['exit'])}
                >
                  Exit
                </button>
              )}
            </div>
          </div>

          {/* Active Route Summary Banner */}
          {(isRoutingActive || crossFloorShop || originFloorBeforeTransit) && (
            <div className="shop-map-route-summary">
              <div className="shop-map-route-info">
                {crossFloorShop && floorKeyOf(crossFloorShop) !== floor ? (
                  <span className="shop-map-route-steps">
                    <strong>Step 1 ({floor}):</strong> Walk from <em>{describeTile(activeStartItem)}</em> to{' '}
                    <em>{describeTile(effectiveTargetItem)}</em>, then go to <strong>{floorKeyOf(crossFloorShop)}</strong> for{' '}
                    <strong>{crossFloorShop.brandName || crossFloorShop.unit?.unitNumber}</strong>.
                  </span>
                ) : walkwayRoute ? (
                  <span className="shop-map-route-steps">
                    <strong>{describeTile(activeStartItem)}</strong> → <strong>{describeTile(effectiveTargetItem)}</strong>
                    <span className="shop-map-route-metrics">
                      ~{walkwayRoute.distanceMeters} m ({walkwayRoute.distanceFeet} ft) · {walkwayRoute.estimatedMinutes} min walk
                    </span>
                  </span>
                ) : null}
              </div>

              <div className="shop-map-route-actions">
                {originFloorBeforeTransit && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => switchFloor(originFloorBeforeTransit)}
                  >
                    ← Back to {originFloorBeforeTransit}
                  </button>
                )}
                {crossFloorShop && floorKeyOf(crossFloorShop) !== floor && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={proceedToDestinationFloor}
                  >
                    Switch to {floorKeyOf(crossFloorShop)} →
                  </button>
                )}
                {effectiveTargetItem && effectiveTargetItem.key !== activeStartItem?.key && !crossFloorShop && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setCustomStartKey(effectiveTargetItem.key);
                      setTargetKey('');
                      toast.success(`Starting point set to ${describeTile(effectiveTargetItem)}`);
                    }}
                    title="I am standing here now — use this as my starting location"
                  >
                    <MapPin size={12} /> Start From Here
                  </button>
                )}
                {selectedShop && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onOpenShop(selectedShop)}
                  >
                    <Info size={12} /> Shop Info
                  </button>
                )}
                {isRoutingActive && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowRouteQrModal(true)}
                    title="Scan QR to carry this route on your phone"
                  >
                    <QrCode size={12} /> Phone QR
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={clearRoute}
                >
                  <X size={12} /> Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="shop-map-edit-bar">
          <select value={decorKind} onChange={(e) => setDecorKind(e.target.value as any)}>
            {Object.entries(DECORATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button
            className="btn btn-secondary"
            onClick={addDecor}
            disabled={decorKind === 'marker' && items.some((i) => i.kind === 'marker')}
          >
            <Plus size={14} /> Add
          </button>
          <button
            className="btn btn-secondary shop-map-clear-btn"
            onClick={() => update((prev) => prev.filter((i) => i.kind === 'marker'))}
            disabled={items.every((i) => i.kind === 'marker')}
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
          className={`shop-map-canvas-wrap ${editing ? 'editing' : ''} ${isRoutingActive ? 'has-routed-unit' : ''}`}
          onClick={() => { if (targetKey || crossFloorUnitId) clearRoute(); }}
        >
          {isFetching && items.length === 0 ? (
            <div className="shop-map-skeleton-wrap" aria-hidden="true">
              <div className="shop-map-skeleton-block wide" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block tall" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block wide" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block wide" />
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
              {!fullScreen && !publicMode && (
                <PermissionGuard permission="mall-shops.write" hideWhenDenied>
                  <div className="shop-map-empty-actions">
                    <button type="button" className="btn btn-primary" onClick={startEditingLayout}>
                      <Pencil size={14} /> Edit Layout
                    </button>
                  </div>
                </PermissionGuard>
              )}
            </div>
          ) : (
            <ReactGridLayout
              width={gridWidth}
              layout={layout as any}
              gridConfig={{ cols: displayColumns, rowHeight: cellPx, margin: [1, 1], containerPadding: [0, 0], maxRows: rows } as any}
              dragConfig={{ enabled: editing, cancel: '.shop-map-tile-btn' } as any}
              resizeConfig={{ enabled: editing } as any}
              compactor={noCompaction as any}
              onLayoutChange={onLayoutChange as any}
              onDrag={onLayoutChange as any}
              onResize={onLayoutChange as any}
            >
              {displayItems.map((it) => {
                const shop = it.unitId ? shopByUnit.get(it.unitId) : null;
                const decor = it.kind !== 'unit';
                const isTarget = Boolean(!editing && effectiveTargetItem && it.key === effectiveTargetItem.key);
                const isStart = Boolean(!editing && activeStartItem && it.key === activeStartItem.key);
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
                const rawPhotoUrl = shop?.unit?.floorPlanUrl as string | undefined;
                const hasPhotoImage = isUnitPhotoImage(rawPhotoUrl);
                const showPhotoMode = !decor && mapView === 'photo';
                const hasUnitPhoto = showPhotoMode && hasPhotoImage;
                const title = decor
                  ? decorLabel
                  : `${shop?.brandName || unitLabel} • ${unitLabel} • ${shop?.unit?.areaSqft ?? '—'} sqft • ${shop?.unit?.status || ''}`;
                return (
                  <div
                    key={it.key}
                    title={title}
                    className={`shop-map-tile ${decor ? `st-decor st-decor-${it.kind} ${sharpClasses}` : statusClass(shop)} ${hasUnitPhoto ? 'has-unit-photo' : ''} ${editing ? 'editing' : ''} ${dim ? 'dim' : ''} ${tiny ? 'tiny' : ''} ${isTarget ? 'active-target' : ''} ${isStart ? 'active-start' : ''}`}
                    onClick={(e) => {
                      if (editing) return;
                      e.stopPropagation();
                      if (it.kind === 'corridor') return;
                      if (targetKey === it.key && shop) {
                        onOpenShop(shop);
                      } else {
                        setCrossFloorUnitId(null);
                        setTargetKey(it.key);
                      }
                    }}
                    onDoubleClick={(e) => {
                      if (!editing && shop) {
                        e.stopPropagation();
                        onOpenShop(shop);
                      }
                    }}
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
                    ) : (
                      <>
                        {hasPhotoImage && (
                          <CachedUnitPhoto
                            photoUrl={rawPhotoUrl}
                            alt={unitLabel}
                            imgClassName="shop-map-tile-photo"
                            skeletonClassName={hasUnitPhoto ? 'shop-map-tile-skeleton' : undefined}
                            readyClassName="is-loaded"
                            loading="eager"
                          />
                        )}
                        <div className="shop-map-tile-name">{unitLabel}</div>
                      </>
                    )}
                    {editing && (
                      <div className="shop-map-tile-actions">
                        <button className="shop-map-tile-btn rot" title="Rotate 90°" onClick={(e) => { e.stopPropagation(); rotate(it.key); }}>
                          <RotateCw size={9} />
                        </button>
                        {it.kind !== 'marker' && (
                          <button className="shop-map-tile-btn" title="Remove" onClick={(e) => { e.stopPropagation(); remove(it.key); }}>
                            <X size={9} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </ReactGridLayout>
          )}

          {/* ── Walkway Indoor Navigation Route Overlay ── */}
          {isRoutingActive && walkwayRoute && walkwayRoute.points.length >= 2 && (() => {
            const pxPoints = walkwayRoute.points.map((pt) => ({
              x: 8 + pt.x * colStepPx - 0.5,
              y: 8 + pt.y * rowStepPx - 0.5,
            }));
            const polyStr = pxPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            const startPt = pxPoints[0];
            const endPt = pxPoints[pxPoints.length - 1];
            return (
              <svg className="shop-map-connector-svg">
                <polyline points={polyStr} className="shop-map-nav-glow" />
                <polyline points={polyStr} className="shop-map-connector-line" />
                <circle cx={startPt.x} cy={startPt.y} r={8} className="shop-map-nav-pulse start" />
                <circle cx={startPt.x} cy={startPt.y} r={4.5} className="shop-map-connector-dot start" />
                <circle cx={endPt.x} cy={endPt.y} r={9} className="shop-map-nav-pulse target" />
                <circle cx={endPt.x} cy={endPt.y} r={5} className="shop-map-connector-dot target" />
              </svg>
            );
          })()}

          {!editing && (placedCategories.length > 0 || placedDecorKinds.length > 0) && (
            <div className="shop-map-directory-overlays" onClick={(e) => e.stopPropagation()}>
              {placedDecorKinds.length > 0 && (
                <div className="shop-map-landmarks-bar">
                  {placedDecorKinds.map((kind) => (
                    <div
                      key={`decor-${kind}`}
                      className="shop-map-landmark-item clickable"
                      onClick={() => {
                        if (kind !== 'corridor') handleQuickFacility([kind]);
                      }}
                      title={kind !== 'corridor' ? `Click to route to nearest ${DECORATION_LABELS[kind]}` : undefined}
                    >
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
                          const uKey = unitKey(s.unitId);
                          const isSelected = targetKey === uKey || selectedUnitId === s.unitId;
                          return (
                            <div
                              key={s.unitId}
                              className={`shop-map-cat-row ${isSelected ? 'active' : ''}`}
                              onClick={() => {
                                setCrossFloorUnitId(null);
                                setTargetKey((prev) => (prev === uKey ? '' : uKey));
                              }}
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
              unplaced.map((s) => {
                const trayPhotoUrl = s.unit?.floorPlanUrl as string | undefined;
                return (
                  <div key={s.unitId} className="shop-map-tray-item">
                    {trayPhotoUrl && isUnitPhotoImage(trayPhotoUrl) && (
                      <CachedUnitPhoto
                        photoUrl={trayPhotoUrl}
                        alt={s.brandName || s.unit?.unitNumber || 'Unit'}
                        wrapperAs="span"
                        wrapperClassName="shop-photo-thumb-frame"
                        imgClassName="shop-dir-list-thumb"
                        skeletonClassName="shop-photo-mini-skeleton"
                      />
                    )}
                    <div className="grow">
                      {s.brandName || s.unit?.unitNumber}
                      <small>{s.unit?.unitNumber} · {s.unit?.areaSqft ?? '—'} sqft</small>
                    </div>
                    <button className="btn btn-secondary" onClick={() => place(s)}>Place</button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Floor QR Code Modal (1 QR Code per Floor) ── */}
      {showFloorQrModal && createPortal(
        <div className="shop-map-qr-backdrop" onClick={() => setShowFloorQrModal(false)}>
          <div className="shop-map-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shop-map-qr-header">
              <div>
                <h3><QrCode size={18} /> Floor QR Code</h3>
                <p>One QR code per floor — shoppers scan to navigate from "You Are Here"</p>
              </div>
              <button type="button" className="shop-map-qr-close" onClick={() => setShowFloorQrModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="shop-map-qr-body">
              <div className="shop-map-qr-floor-picker">
                <label>Select Floor:</label>
                <select
                  className="shop-map-floor-select"
                  value={activeQrFloor}
                  onChange={(e) => setQrModalFloor(e.target.value)}
                >
                  {floors.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div className="shop-map-qr-preview">
                <div className="shop-map-qr-badge">{activeQrFloor}</div>
                {floorQrDataUrl ? (
                  <img src={floorQrDataUrl} alt={`QR Code for ${activeQrFloor}`} className="shop-map-qr-img" />
                ) : (
                  <div className="shop-map-qr-loading">Generating QR…</div>
                )}
                <div className="shop-map-qr-caption">
                  Scan with phone camera to open <strong>{activeQrFloor}</strong> Indoor Navigation
                </div>
              </div>

              {activeQrFloor === floor && (
                <div className={`shop-map-qr-status ${hasMarkerOnFloor ? 'ok' : 'warn'}`}>
                  <MapPin size={14} />
                  <span>
                    {hasMarkerOnFloor
                      ? 'Default starting point is linked to this floor\'s "You Are Here" marker.'
                      : 'Tip: Place a "You Are Here" marker in Edit Layout where this floor QR sign is posted.'}
                  </span>
                </div>
              )}

              <div className="shop-map-qr-url-box">
                <input type="text" readOnly value={floorQrUrl} />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(floorQrUrl);
                    toast.success('Floor navigation link copied');
                  }}
                >
                  <Copy size={13} /> Copy
                </button>
              </div>
            </div>

            <div className="shop-map-qr-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.open(floorQrUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink size={14} /> Open Public Map
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrintFloorQr}
                disabled={!floorQrDataUrl}
              >
                <Printer size={14} /> Print Floor QR
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Take Route on Phone QR Modal (Kiosk -> Mobile Handoff) ── */}
      {showRouteQrModal && createPortal(
        <div className="shop-map-qr-backdrop" onClick={() => setShowRouteQrModal(false)}>
          <div className="shop-map-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shop-map-qr-header">
              <div>
                <h3><QrCode size={18} /> Take Route on Your Phone</h3>
                <p>{describeTile(activeStartItem)} → {describeTile(effectiveTargetItem)}</p>
              </div>
              <button type="button" className="shop-map-qr-close" onClick={() => setShowRouteQrModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="shop-map-qr-body">
              <div className="shop-map-qr-preview">
                <div className="shop-map-qr-badge">{floor} Route</div>
                {routeQrDataUrl ? (
                  <img src={routeQrDataUrl} alt="Route QR Code" className="shop-map-qr-img" />
                ) : (
                  <div className="shop-map-qr-loading">Generating QR…</div>
                )}
                <div className="shop-map-qr-caption">
                  Scan to open this exact walking route on your mobile phone
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

