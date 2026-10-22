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

export const DECORATION_LABELS: Record<Exclude<TileKind, 'unit'>, string> = {
  atrium: 'Atrium',
  stairs: 'Stairs',
  escalator: 'Elevator',
  corridor: 'Walking Area',
  toilet: 'Restroom',
  marker: 'You are here',
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

/** Starter layout: pack the given tiles into rows, left to right, top to bottom. */
export function autoArrange(items: MapItem[], columns: number): MapItem[] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  const out = new Map<string, MapItem>();
  for (const it of items) {
    const w = Math.min(it.w, columns);
    if (x + w > columns) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    out.set(it.key, { ...it, w, x, y });
    x += w;
    rowH = Math.max(rowH, it.h);
  }
  return items.map((it) => out.get(it.key)!);
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
