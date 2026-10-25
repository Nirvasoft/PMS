// Pure helpers for the Shop Directory "Map" view (grid layout, sqft-based tile sizing).
// Kept free of React so the logic is easy to reason about and test.

export type TileKind = 'unit' | 'atrium' | 'stairs' | 'escalator' | 'corridor' | 'toilet' | 'marker' | 'entrance' | 'exit';

export interface MapItem {
  /** Stable key used by react-grid-layout: `u:<unitId>` for units, `d:<n>` for decorations. */
  key: string;
  kind: TileKind;
  unitId: string | null;
  label: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SHOP_CATEGORIES = [
  'ATMs',
  'Beauty & Wellness',
  'Dining',
  'Education',
  'Fashion & Accessories',
  'Health/Pharmacy',
  'Services',
  'Sports & Lifestyle',
  'Supermarket',
  'Watches & Jewellery',
  'Other',
] as const;

export const DECORATION_LABELS: Record<Exclude<TileKind, 'unit'>, string> = {
  atrium: 'Atrium',
  stairs: 'Stairs',
  escalator: 'Elevator',
  corridor: 'Walkway',
  toilet: 'Restroom',
  marker: 'You Are Here',
  entrance: 'Entrance',
  exit: 'Exit',
};

export const DECORATION_DEFAULT_SIZES: Record<Exclude<TileKind, 'unit'>, { w: number; h: number }> = {
  atrium: { w: 8, h: 6 },
  stairs: { w: 4, h: 3 },
  escalator: { w: 4, h: 3 },
  corridor: { w: 14, h: 2 },
  toilet: { w: 4, h: 3 },
  marker: { w: 3, h: 3 },
  entrance: { w: 4, h: 2 },
  exit: { w: 4, h: 2 },
};

export const DEFAULT_COLUMNS = 60;
export const DEFAULT_SQFT_PER_CELL = 30;

/** The floor a shop belongs to, used as the map's per-floor key. */
export function floorKeyOf(shop: any): string {
  const u = shop?.unit;
  const label = typeof u?.floorLabel === 'string' ? u.floorLabel.trim() : '';
  if (label) return label;
  if (u?.floorNumber !== null && u?.floorNumber !== undefined) return `Floor ${u.floorNumber}`;
  return 'Unassigned';
}

export function unitKey(unitId: string): string {
  return `u:${unitId}`;
}

/**
 * Tile size in grid cells for a unit: area ∝ sqft, slightly landscape (1.4:1)
 * with a larger default minimum (5×3) so unit cards are easy to see and click.
 */
export function tileSizeFromSqft(
  areaSqft: number | string | null | undefined,
  sqftPerCell: number,
  columns: number,
): { w: number; h: number } {
  const rawSqft = Number(areaSqft);
  const sqft = rawSqft > 0 ? rawSqft : 450;
  const spc = sqftPerCell > 0 ? sqftPerCell : DEFAULT_SQFT_PER_CELL;
  const cells = Math.max(15, sqft / spc);
  const w = Math.min(columns, Math.max(5, Math.round(Math.sqrt(cells * 1.4))));
  const h = Math.max(3, Math.round(cells / w));
  return { w, h };
}

export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function hasAnyOverlap(items: MapItem[]): boolean {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (rectsOverlap(items[i], items[j])) return true;
    }
  }
  return false;
}

/** First free spot (scanning left→right, top→bottom) where a w×h tile fits. */
export function findFreeSpot(
  items: MapItem[],
  w: number,
  h: number,
  columns: number,
): { x: number; y: number } {
  const width = Math.min(w, columns);
  for (let y = 0; y < 5000; y++) {
    for (let x = 0; x + width <= columns; x++) {
      const candidate = { x, y, w: width, h };
      if (!items.some((it) => rectsOverlap(candidate, it))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

/**
 * Clamp tiles inside the grid, then push any tile that overlaps an earlier one
 * straight down until it fits. Used after the scale changes or sizes are recomputed.
 */
export function resolveOverlaps(items: MapItem[], columns: number): MapItem[] {
  const sorted = [...items]
    .map((it) => ({ ...it, w: Math.min(it.w, columns), x: Math.max(0, Math.min(it.x, columns - Math.min(it.w, columns))) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: MapItem[] = [];
  for (const it of sorted) {
    const next = { ...it };
    while (placed.some((p) => rectsOverlap(next, p))) next.y += 1;
    placed.push(next);
  }
  // keep the caller's original order
  const byKey = new Map(placed.map((p) => [p.key, p]));
  return items.map((it) => byKey.get(it.key)!);
}

/**
 * Size a saved unit tile from the unit's *current* sqft. A tile that was only
 * rotated (w/h swapped) keeps its rotation; any other size mismatch means the
 * sqft or the scale changed, so it is recomputed.
 */
export function sizeUnitTile(
  saved: { w: number; h: number },
  areaSqft: number | string | null | undefined,
  sqftPerCell: number,
  columns: number,
): { w: number; h: number } {
  if (saved && saved.w >= 1 && saved.h >= 1) {
    return { w: Math.min(columns, saved.w), h: saved.h };
  }
  return tileSizeFromSqft(areaSqft, sqftPerCell, columns);
}

/**
 * Resolve the default starting point ("You Are Here") on a floor plan.
 * Priority: 'marker' (You Are Here) -> 'entrance' -> 'escalator' -> 'stairs' -> 'atrium'.
 */
export function findDefaultStartItem(items: MapItem[]): MapItem | null {
  if (!items || items.length === 0) return null;
  const priorities: TileKind[] = ['marker', 'entrance', 'escalator', 'stairs', 'atrium'];
  for (const kind of priorities) {
    const found = items.find((i) => i.kind === kind);
    if (found) return found;
  }
  return items[0] || null;
}

/**
 * Find the nearest tile matching any of the given kinds from `fromItem` (by Euclidean center distance).
 */
export function findNearestFacilityItem(
  items: MapItem[],
  fromItem: MapItem | null,
  kinds: TileKind[],
): MapItem | null {
  const candidates = items.filter((i) => kinds.includes(i.kind) && (!fromItem || i.key !== fromItem.key));
  if (candidates.length === 0) return null;
  if (!fromItem) return candidates[0];
  const fx = fromItem.x + fromItem.w / 2;
  const fy = fromItem.y + fromItem.h / 2;
  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const d = Math.hypot(cx - fx, cy - fy);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export interface WalkwayRouteResult {
  /** Waypoints in grid coordinates (0..columns, 0..rows). Multiply by cellPx for SVG pixels. */
  points: Array<{ x: number; y: number }>;
  /** Total path length in grid cells */
  cellDistance: number;
  /** Estimated walking distance in feet */
  distanceFeet: number;
  /** Estimated walking distance in meters */
  distanceMeters: number;
  /** Estimated walking time in minutes */
  estimatedMinutes: number;
}

/**
 * Computes an orthogonal indoor walking path from `fromItem` to `toItem` that follows
 * `corridor` (Walkway) centerlines and avoids cutting through other shop units.
 */
export function computeWalkwayPath(
  items: MapItem[],
  fromItem: MapItem,
  toItem: MapItem,
  columns: number,
  sqftPerCell: number = DEFAULT_SQFT_PER_CELL,
): WalkwayRouteResult {
  const cols = Math.max(columns, ...items.map((i) => i.x + i.w), 12);
  const rows = Math.max(12, ...items.map((i) => i.y + i.h)) + 3;

  const startCx = Math.max(0, Math.min(cols - 1, Math.floor(fromItem.x + fromItem.w / 2)));
  const startCy = Math.max(0, Math.min(rows - 1, Math.floor(fromItem.y + fromItem.h / 2)));
  const endCx = Math.max(0, Math.min(cols - 1, Math.floor(toItem.x + toItem.w / 2)));
  const endCy = Math.max(0, Math.min(rows - 1, Math.floor(toItem.y + toItem.h / 2)));

  const isInside = (cx: number, cy: number, it: MapItem) =>
    cx >= it.x && cx < it.x + it.w && cy >= it.y && cy < it.y + it.h;

  // Precompute cell traversal cost
  const cellCost = new Float32Array(cols * rows);
  cellCost.fill(6.5); // Default empty grid space (bridges small gaps between shop & corridor)

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const idx = cy * cols + cx;
      if (isInside(cx, cy, fromItem) || isInside(cx, cy, toItem)) {
        cellCost[idx] = 0.85;
        continue;
      }
      // Check if covered by any item
      let matched: MapItem | null = null;
      for (const it of items) {
        if (isInside(cx, cy, it)) {
          matched = it;
          break;
        }
      }
      if (!matched) continue;

      if (matched.kind === 'corridor') {
        const centerOffset =
          matched.w >= matched.h
            ? Math.abs(cy + 0.5 - (matched.y + matched.h / 2))
            : Math.abs(cx + 0.5 - (matched.x + matched.w / 2));
        cellCost[idx] = 1.0 + 0.16 * centerOffset;
      } else if (
        matched.kind === 'atrium' ||
        matched.kind === 'marker' ||
        matched.kind === 'entrance' ||
        matched.kind === 'escalator' ||
        matched.kind === 'stairs'
      ) {
        cellCost[idx] = 1.8;
      } else {
        // Other shop units / restrooms — strongly avoid cutting through them
        cellCost[idx] = 48.0;
      }
    }
  }

  // Dijkstra with 4 directions (0: E, 1: W, 2: S, 3: N, 4: initial)
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const stateCount = cols * rows * 5;
  const dist = new Float32Array(stateCount);
  dist.fill(Infinity);
  const parent = new Int32Array(stateCount);
  parent.fill(-1);

  const startState = (startCy * cols + startCx) * 5 + 4;
  dist[startState] = 0;

  // Simple binary min-heap on state index
  const heap: number[] = [startState];
  const pushHeap = (s: number) => {
    heap.push(s);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (dist[heap[p]] <= dist[heap[i]]) break;
      const tmp = heap[p];
      heap[p] = heap[i];
      heap[i] = tmp;
      i = p;
    }
  };
  const popHeap = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      const n = heap.length;
      while (true) {
        let smallest = i;
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        if (l < n && dist[heap[l]] < dist[heap[smallest]]) smallest = l;
        if (r < n && dist[heap[r]] < dist[heap[smallest]]) smallest = r;
        if (smallest === i) break;
        const tmp = heap[i];
        heap[i] = heap[smallest];
        heap[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  };

  let goalState = -1;
  while (heap.length > 0) {
    const cur = popHeap();
    const curCost = dist[cur];
    const dir = cur % 5;
    const cellIdx = (cur - dir) / 5;
    const cx = cellIdx % cols;
    const cy = (cellIdx - cx) / cols;

    if (cx === endCx && cy === endCy) {
      goalState = cur;
      break;
    }

    for (let nd = 0; nd < 4; nd++) {
      const nx = cx + DIRS[nd][0];
      const ny = cy + DIRS[nd][1];
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const nCellIdx = ny * cols + nx;
      const turnPenalty = dir !== 4 && dir !== nd ? 0.35 : 0;
      const nextCost = curCost + cellCost[nCellIdx] + turnPenalty;
      const nextState = nCellIdx * 5 + nd;
      if (nextCost < dist[nextState]) {
        dist[nextState] = nextCost;
        parent[nextState] = cur;
        pushHeap(nextState);
      }
    }
  }

  // Reconstruct cell centers
  const rawCells: Array<{ cx: number; cy: number }> = [];
  if (goalState !== -1) {
    let cur = goalState;
    while (cur !== -1) {
      const dir = cur % 5;
      const cellIdx = (cur - dir) / 5;
      const cx = cellIdx % cols;
      const cy = (cellIdx - cx) / cols;
      rawCells.push({ cx, cy });
      cur = parent[cur];
    }
    rawCells.reverse();
  } else {
    rawCells.push({ cx: startCx, cy: startCy }, { cx: endCx, cy: endCy });
  }

  const rawPoints = rawCells.map(({ cx, cy }) => ({ x: cx + 0.5, y: cy + 0.5 }));
  // Snap exact start and end tile centers
  const exactStart = { x: fromItem.x + fromItem.w / 2, y: fromItem.y + fromItem.h / 2 };
  const exactEnd = { x: toItem.x + toItem.w / 2, y: toItem.y + toItem.h / 2 };
  if (rawPoints.length > 0) {
    rawPoints[0] = exactStart;
    rawPoints[rawPoints.length - 1] = exactEnd;
  }

  // Simplify collinear consecutive segments
  const simplified: Array<{ x: number; y: number }> = [];
  for (const pt of rawPoints) {
    if (simplified.length === 0) {
      simplified.push(pt);
      continue;
    }
    const prev = simplified[simplified.length - 1];
    if (Math.abs(prev.x - pt.x) < 0.01 && Math.abs(prev.y - pt.y) < 0.01) continue;
    if (simplified.length >= 2) {
      const prev2 = simplified[simplified.length - 2];
      const sameX = Math.abs(prev2.x - prev.x) < 0.01 && Math.abs(prev.x - pt.x) < 0.01;
      const sameY = Math.abs(prev2.y - prev.y) < 0.01 && Math.abs(prev.y - pt.y) < 0.01;
      if (sameX || sameY) {
        simplified[simplified.length - 1] = pt;
        continue;
      }
    }
    simplified.push(pt);
  }

  let cellDistance = 0;
  for (let i = 1; i < simplified.length; i++) {
    cellDistance += Math.hypot(simplified[i].x - simplified[i - 1].x, simplified[i].y - simplified[i - 1].y);
  }
  const cellSideFeet = Math.sqrt(Math.max(10, sqftPerCell || DEFAULT_SQFT_PER_CELL));
  const distanceFeet = Math.max(10, Math.round(cellDistance * cellSideFeet));
  const distanceMeters = Math.max(3, Math.round(distanceFeet * 0.3048));
  const estimatedMinutes = Math.max(1, Math.ceil(distanceFeet / 220));

  return {
    points: simplified,
    cellDistance,
    distanceFeet,
    distanceMeters,
    estimatedMinutes,
  };
}

