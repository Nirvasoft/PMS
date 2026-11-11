// Indoor Wayfinding A* Pathfinding, Smooth SVG Route Rendering, Floorplate Bounds & Offline Cache Helpers.

import type { MapItem, TileKind } from './shopMapShapeCatalog';
import {
  DEFAULT_SQFT_PER_CELL,
  DECORATION_LABELS,
  getCustomUnitPolygonVerticesAndAxes,
  getPolygonAtriumWorldFaces,
  getRingSectorRoutingPolygon,
  getTrapezoidUnitGeometry,
  isCircleTile,
  parseLandmarkMeta,
  parseUnitShapeMode,
} from './shopMapLayout';

/**
 * Resolve the default starting point ("You Are Here") on a floor plan.
 * Priority: 'marker' (You Are Here) -> 'entrance' -> 'info' -> 'escalator' -> 'stairs' -> 'atrium'.
 */
export function findDefaultStartItem(items: MapItem[]): MapItem | null {
  if (!items || items.length === 0) return null;
  const priorities: TileKind[] = ['marker', 'entrance', 'info', 'escalator', 'stairs', 'atrium'];
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

export interface WalkwayRouteStep {
  instruction: string;
  distanceMeters: number;
  direction: 'start' | 'straight' | 'left' | 'right' | 'arrive';
  nearTileKey?: string;
  nearUnitId?: string | null;
  nearLabel?: string;
  point?: { x: number; y: number };
}

export interface WalkwayRouteResult {
  /** Waypoints in grid coordinates (0..columns, 0..rows). Multiply by cellPx for SVG pixels. */
  points: Array<{ x: number; y: number }>;
  /** Estimated walking distance in feet */
  distanceFeet: number;
  /** Estimated walking distance in meters */
  distanceMeters: number;
  /** Estimated walking time in minutes */
  estimatedMinutes: number;
  /** Turn-by-turn navigation steps (Mappedin-style) */
  steps: WalkwayRouteStep[];
}

/**
 * Builds a smooth SVG path string (`M ... L ... Q ...`) with rounded corners (`cornerRadiusPx`)
 * from pixel-space route waypoints so wayfinding paths render with Mappedin-style fluid turns
 * and seamless tangent transitions onto/off circular ring walkways.
 */
export function buildSmoothRouteSvgPath(
  pxPoints: ReadonlyArray<{ x: number; y: number }>,
  cornerRadiusPx = 12,
): string {
  if (pxPoints.length === 0) return '';
  if (pxPoints.length === 1) return `M ${pxPoints[0].x.toFixed(1)} ${pxPoints[0].y.toFixed(1)}`;
  if (pxPoints.length === 2) {
    return `M ${pxPoints[0].x.toFixed(1)} ${pxPoints[0].y.toFixed(1)} L ${pxPoints[1].x.toFixed(1)} ${pxPoints[1].y.toFixed(1)}`;
  }

  const n = pxPoints.length;
  const turnAngles = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) {
    const prev = pxPoints[i - 1];
    const curr = pxPoints[i];
    const next = pxPoints[i + 1];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const len1 = Math.hypot(d1x, d1y);
    const len2 = Math.hypot(d2x, d2y);
    if (len1 < 1e-3 || len2 < 1e-3) continue;
    const cross = d1x * d2y - d1y * d2x;
    const dot = d1x * d2x + d1y * d2y;
    turnAngles[i] = Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);
  }

  const SMOOTH_ARC_ANGLE_THRESHOLD_DEG = 11;
  const parts: string[] = [`M ${pxPoints[0].x.toFixed(1)} ${pxPoints[0].y.toFixed(1)}`];
  for (let i = 1; i < n - 1; i++) {
    const prev = pxPoints[i - 1];
    const curr = pxPoints[i];
    const next = pxPoints[i + 1];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const len1 = Math.hypot(d1x, d1y);
    const len2 = Math.hypot(d2x, d2y);
    if (len1 < 1e-3 || len2 < 1e-3) continue;

    // Interior sample along a finely subdivided circular ring arc
    if (turnAngles[i] < SMOOTH_ARC_ANGLE_THRESHOLD_DEG) {
      parts.push(`L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`);
      continue;
    }

    const prevIsSmoothArc = i > 1 && turnAngles[i - 1] < SMOOTH_ARC_ANGLE_THRESHOLD_DEG;
    const nextIsSmoothArc = i < n - 2 && turnAngles[i + 1] < SMOOTH_ARC_ANGLE_THRESHOLD_DEG;
    const maxBack = len1 * (prevIsSmoothArc ? 0.92 : 0.45);
    const maxFwd = len2 * (nextIsSmoothArc ? 0.92 : 0.45);
    const r = Math.min(cornerRadiusPx, maxBack, maxFwd);
    if (r < 1.5) {
      parts.push(`L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`);
      continue;
    }
    const pEnterX = curr.x - (d1x / len1) * r;
    const pEnterY = curr.y - (d1y / len1) * r;
    const pExitX = curr.x + (d2x / len2) * r;
    const pExitY = curr.y + (d2y / len2) * r;
    parts.push(
      `L ${pEnterX.toFixed(1)} ${pEnterY.toFixed(1)} Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${pExitX.toFixed(1)} ${pExitY.toFixed(1)}`,
    );
  }
  const last = pxPoints[n - 1];
  parts.push(`L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
  return parts.join(' ');
}

/**
 * Computes evenly spaced directional arrow markers (`{ x, y, angleDeg }`) along a pixel-space route
 * by cumulative arc-length so chevrons flow smoothly along both straight corridors and circular ring arcs.
 */
export function computeRouteDirectionArrows(
  pxPoints: ReadonlyArray<{ x: number; y: number }>,
  spacingPx = 46,
): Array<{ x: number; y: number; angleDeg: number; progress: number }> {
  const arrows: Array<{ x: number; y: number; angleDeg: number; progress: number }> = [];
  const n = pxPoints.length;
  if (n < 2) return arrows;

  const cumLen = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dx = pxPoints[i].x - pxPoints[i - 1].x;
    const dy = pxPoints[i].y - pxPoints[i - 1].y;
    cumLen[i] = cumLen[i - 1] + Math.hypot(dx, dy);
  }
  const totalLen = cumLen[n - 1];
  if (totalLen < 20) return arrows;

  const endMargin = 12;
  let targetDist = Math.max(12, Math.min(spacingPx * 0.55, totalLen * 0.5));
  let segIdx = 1;

  while (targetDist <= totalLen - endMargin) {
    while (segIdx < n - 1 && cumLen[segIdx] < targetDist) {
      segIdx++;
    }
    const segStart = cumLen[segIdx - 1];
    const segLen = cumLen[segIdx] - segStart;
    if (segLen > 1e-4) {
      const p0 = pxPoints[segIdx - 1];
      const p1 = pxPoints[segIdx];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const t = Math.max(0, Math.min(1, (targetDist - segStart) / segLen));
      arrows.push({
        x: p0.x + dx * t,
        y: p0.y + dy * t,
        angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
        progress: Math.max(0, Math.min(1, targetDist / totalLen)),
      });
    }
    targetDist += spacingPx;
  }
  return arrows;
}

/**
 * Computes the padded architectural floorplate bounding box (in grid cells) enclosing all placed items.
 */
export function computeFloorplateBounds(
  items: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
  columns: number,
): { x: number; y: number; w: number; h: number } | null {
  if (!items || items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y + it.h > maxY) maxY = it.y + it.h;
  }
  const pad = 0.45;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(columns, maxX + pad);
  const bottom = maxY + pad;
  return {
    x,
    y,
    w: Math.max(1, right - x),
    h: Math.max(1, bottom - y),
  };
}

function simplifyCollinearWaypoints(pts: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const simplified: Array<{ x: number; y: number }> = [];
  for (const pt of pts) {
    if (simplified.length === 0) {
      simplified.push(pt);
      continue;
    }
    const prev = simplified[simplified.length - 1];
    if (Math.hypot(prev.x - pt.x, prev.y - pt.y) < 0.015) continue;
    if (simplified.length >= 2) {
      const prev2 = simplified[simplified.length - 2];
      const v1x = prev.x - prev2.x;
      const v1y = prev.y - prev2.y;
      const v2x = pt.x - prev.x;
      const v2y = pt.y - prev.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 > 1e-4 && len2 > 1e-4) {
        const cross = Math.abs(v1x * v2y - v1y * v2x) / (len1 * len2);
        const dot = v1x * v2x + v1y * v2y;
        if (cross < 0.015 && dot > 0) {
          simplified[simplified.length - 1] = pt;
          continue;
        }
      }
    }
    simplified.push(pt);
  }
  return simplified;
}

interface TileCollisionShape {
  item: MapItem;
  vcx: number;
  vcy: number;
  hw: number;
  hh: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  isRotatedOrCurved: boolean;
  mode: 'rect' | 'ellipse' | 'poly';
  corners?: Array<{ x: number; y: number }>;
  doorX?: number;
  doorY?: number;
  isRingSector?: boolean;
}

interface FloorRoutingCache {
  cols: number;
  rows: number;
  gCols: number;
  gRows: number;
  shapes: TileCollisionShape[];
  min1Dist: Float32Array;
  min1Tile: Int16Array;
  min2Dist: Float32Array;
  min2Tile: Int16Array;
  min3Dist: Float32Array;
  min3Tile: Int16Array;
  routeCache: Map<string, WalkwayRouteResult>;
}

const MAX_CLEARANCE_RADIUS = 1.85;
const floorRoutingCacheByItems = new WeakMap<MapItem[], Map<string, FloorRoutingCache>>();

function isPointInPolygon(wx: number, wy: number, corners: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const xi = corners[i].x;
    const yi = corners[i].y;
    const xj = corners[j].x;
    const yj = corners[j].y;
    const intersect = yi > wy !== yj > wy && wx < ((xj - xi) * (wy - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function minDistToPolygonEdges(
  wx: number,
  wy: number,
  corners: ReadonlyArray<{ x: number; y: number }>,
): number {
  let minD2 = Infinity;
  for (let i = 0, n = corners.length; i < n; i++) {
    const p0 = corners[i];
    const p1 = corners[(i + 1) % n];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 1e-8 ? Math.max(0, Math.min(1, ((wx - p0.x) * dx + (wy - p0.y) * dy) / len2)) : 0;
    const ex = wx - (p0.x + dx * t);
    const ey = wy - (p0.y + dy * t);
    const d2 = ex * ex + ey * ey;
    if (d2 < minD2) minD2 = d2;
  }
  return Math.sqrt(minD2);
}

const OUTLINE_CELL_PX = 20;

/**
 * The real drawn outline of a non-rectangular unit (every part of it, concave bites included) in world cells.
 * The collision parts used for placement are coarse approximations and only their first part was ever treated as an
 * obstacle, which let routes cut through the rest of the unit.
 */
function getUnitOutlineCorners(it: MapItem, items: ReadonlyArray<MapItem>): Array<{ x: number; y: number }> | null {
  const mode = parseUnitShapeMode(it, items);
  if (mode === 'rect' || mode === 'circle') return null;
  let fillPoints: string;
  try {
    fillPoints = getTrapezoidUnitGeometry(
      mode,
      it.w * OUTLINE_CELL_PX,
      it.h * OUTLINE_CELL_PX,
      OUTLINE_CELL_PX,
      undefined,
      it,
      items,
    ).fillPoints;
  } catch {
    return null;
  }
  const nums = fillPoints.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 6) return null;
  const rad = ((it.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = it.x + it.w * 0.5;
  const cy = it.y + it.h * 0.5;
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const lx = Number(nums[i]) / OUTLINE_CELL_PX - it.w * 0.5;
    const ly = Number(nums[i + 1]) / OUTLINE_CELL_PX - it.h * 0.5;
    corners.push({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos });
  }
  return corners.length >= 3 ? corners : null;
}

function buildTileCollisionShape(it: MapItem, items: ReadonlyArray<MapItem>): TileCollisionShape {
  if (it.kind === 'atrium') {
    const polyFaces = getPolygonAtriumWorldFaces(it);
    if (polyFaces && polyFaces.length >= 3) {
      const corners = polyFaces.map((f) => ({ x: f.x0, y: f.y0 }));
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const c of corners) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      }
      return {
        item: it,
        vcx: it.x + it.w * 0.5,
        vcy: it.y + it.h * 0.5,
        hw: it.w * 0.5,
        hh: it.h * 0.5,
        ux: 1,
        uy: 0,
        vx: 0,
        vy: 1,
        minX,
        maxX,
        minY,
        maxY,
        isRotatedOrCurved: true,
        mode: 'poly',
        corners,
      };
    }
  }

  if (it.kind === 'unit') {
    const ringPoly = getRingSectorRoutingPolygon(it, items);
    if (ringPoly && ringPoly.corners.length >= 3) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const c of ringPoly.corners) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      }
      const rad = (ringPoly.exactAngle * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      return {
        item: it,
        vcx: ringPoly.vcx,
        vcy: ringPoly.vcy,
        hw: Math.max(0.5, it.w) * 0.5,
        hh: Math.max(0.5, it.h) * 0.5,
        ux,
        uy,
        vx: -uy,
        vy: ux,
        minX,
        maxX,
        minY,
        maxY,
        isRotatedOrCurved: true,
        mode: 'poly',
        corners: ringPoly.corners,
        doorX: ringPoly.doorX,
        doorY: ringPoly.doorY,
        isRingSector: true,
      };
    }
  }

  const vcx = it.x + it.w * 0.5;
  const vcy = it.y + it.h * 0.5;
  const vw = Math.max(0.5, it.w);
  const vh = Math.max(0.5, it.h);
  const hw = vw * 0.5;
  const hh = vh * 0.5;
  const rad = ((it.angle ?? 0) * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  const aabbHalfW = hw * Math.abs(ux) + hh * Math.abs(vx);
  const aabbHalfH = hw * Math.abs(uy) + hh * Math.abs(vy);
  const minX = vcx - aabbHalfW;
  const maxX = vcx + aabbHalfW;
  const minY = vcy - aabbHalfH;
  const maxY = vcy + aabbHalfH;

  if (isCircleTile(it) || (it.kind === 'unit' && parseUnitShapeMode(it) === 'circle')) {
    return {
      item: it,
      vcx,
      vcy,
      hw,
      hh,
      ux,
      uy,
      vx,
      vy,
      minX,
      maxX,
      minY,
      maxY,
      isRotatedOrCurved: true,
      mode: 'ellipse',
    };
  }

  if (it.kind === 'unit') {
    const outline = getUnitOutlineCorners(it, items);
    const customPoly = outline ? { corners: outline } : getCustomUnitPolygonVerticesAndAxes(it, { ux, uy, vx, vy });
    if (customPoly && customPoly.corners.length >= 3) {
      return {
        item: it,
        vcx,
        vcy,
        hw,
        hh,
        ux,
        uy,
        vx,
        vy,
        minX,
        maxX,
        minY,
        maxY,
        isRotatedOrCurved: true,
        mode: 'poly',
        corners: customPoly.corners,
      };
    }
  }

  return {
    item: it,
    vcx,
    vcy,
    hw,
    hh,
    ux,
    uy,
    vx,
    vy,
    minX,
    maxX,
    minY,
    maxY,
    isRotatedOrCurved: Boolean(it.angle),
    mode: 'rect',
  };
}

function signedDistanceToShape(wx: number, wy: number, s: TileCollisionShape): number {
  if (s.mode === 'poly' && s.corners) {
    const edgeDist = minDistToPolygonEdges(wx, wy, s.corners);
    return isPointInPolygon(wx, wy, s.corners) ? -edgeDist : edgeDist;
  }
  const du = (wx - s.vcx) * s.ux + (wy - s.vcy) * s.uy;
  const dv = (wx - s.vcx) * s.vx + (wy - s.vcy) * s.vy;
  if (s.mode === 'ellipse') {
    const norm = Math.hypot(du / Math.max(0.4, s.hw), dv / Math.max(0.4, s.hh));
    return (norm - 1) * Math.min(s.hw, s.hh);
  }
  const qx = Math.abs(du) - s.hw;
  const qy = Math.abs(dv) - s.hh;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

function getOrBuildFloorRoutingCache(items: MapItem[], cols: number, rows: number): FloorRoutingCache {
  let byDim = floorRoutingCacheByItems.get(items);
  if (!byDim) {
    byDim = new Map<string, FloorRoutingCache>();
    floorRoutingCacheByItems.set(items, byDim);
  }
  const dimKey = `${cols}:${rows}`;
  const existing = byDim.get(dimKey);
  if (existing) return existing;

  const SUB = 2;
  const gCols = cols * SUB;
  const gRows = rows * SUB;
  const totalNodes = gCols * gRows;
  const shapes = items.map((it) => buildTileCollisionShape(it, items));

  const min1Dist = new Float32Array(totalNodes);
  min1Dist.fill(MAX_CLEARANCE_RADIUS);
  const min1Tile = new Int16Array(totalNodes);
  min1Tile.fill(-1);
  const min2Dist = new Float32Array(totalNodes);
  min2Dist.fill(MAX_CLEARANCE_RADIUS);
  const min2Tile = new Int16Array(totalNodes);
  min2Tile.fill(-1);
  const min3Dist = new Float32Array(totalNodes);
  min3Dist.fill(MAX_CLEARANCE_RADIUS);
  const min3Tile = new Int16Array(totalNodes);
  min3Tile.fill(-1);

  for (let tIdx = 0; tIdx < shapes.length; tIdx++) {
    const s = shapes[tIdx];
    const gx0 = Math.max(0, Math.floor((s.minX - MAX_CLEARANCE_RADIUS) * 2));
    const gx1 = Math.min(gCols - 1, Math.ceil((s.maxX + MAX_CLEARANCE_RADIUS) * 2));
    const gy0 = Math.max(0, Math.floor((s.minY - MAX_CLEARANCE_RADIUS) * 2));
    const gy1 = Math.min(gRows - 1, Math.ceil((s.maxY + MAX_CLEARANCE_RADIUS) * 2));

    for (let gy = gy0; gy <= gy1; gy++) {
      const wy = gy <= 0 ? 0.22 : gy * 0.5;
      const rowOff = gy * gCols;
      for (let gx = gx0; gx <= gx1; gx++) {
        const idx = rowOff + gx;
        const wx = gx <= 0 ? 0.22 : gx * 0.5;
        const d = signedDistanceToShape(wx, wy, s);
        if (d < min1Dist[idx]) {
          min3Dist[idx] = min2Dist[idx];
          min3Tile[idx] = min2Tile[idx];
          min2Dist[idx] = min1Dist[idx];
          min2Tile[idx] = min1Tile[idx];
          min1Dist[idx] = d;
          min1Tile[idx] = tIdx;
        } else if (d < min2Dist[idx]) {
          min3Dist[idx] = min2Dist[idx];
          min3Tile[idx] = min2Tile[idx];
          min2Dist[idx] = d;
          min2Tile[idx] = tIdx;
        } else if (d < min3Dist[idx]) {
          min3Dist[idx] = d;
          min3Tile[idx] = tIdx;
        }
      }
    }
  }

  const built: FloorRoutingCache = {
    cols,
    rows,
    gCols,
    gRows,
    shapes,
    min1Dist,
    min1Tile,
    min2Dist,
    min2Tile,
    min3Dist,
    min3Tile,
    routeCache: new Map<string, WalkwayRouteResult>(),
  };
  byDim.set(dimKey, built);
  return built;
}

/**
 * Computes an indoor walking path from `fromItem` to `toItem` that follows
 * open walkway corridors while avoiding shop units.
 */
export function computeWalkwayPath(
  items: MapItem[],
  fromItem: MapItem,
  toItem: MapItem,
  columns: number,
  sqftPerCell: number = DEFAULT_SQFT_PER_CELL,
  describeItem?: (it: MapItem) => string,
): WalkwayRouteResult {
  const cols = Math.max(columns, ...items.map((i) => i.x + i.w), 12) + 2;
  const rows = Math.max(12, ...items.map((i) => i.y + i.h)) + 3;
  const floorCache = getOrBuildFloorRoutingCache(items, cols, rows);
  const routeCacheKey = `${fromItem.key}->${toItem.key}:${Math.round(sqftPerCell * 10)}`;
  const cachedRoute = floorCache.routeCache.get(routeCacheKey);
  if (cachedRoute) return cachedRoute;

  const { gCols, gRows, shapes, min1Dist, min1Tile, min2Dist, min2Tile, min3Dist, min3Tile } = floorCache;
  const gxToWorld = (gx: number): number => (gx <= 0 ? 0.22 : gx * 0.5);
  const gyToWorld = (gy: number): number => (gy <= 0 ? 0.22 : gy * 0.5);
  const worldToGx = (wx: number): number => Math.max(0, Math.min(gCols - 1, Math.round(wx * 2)));
  const worldToGy = (wy: number): number => Math.max(0, Math.min(gRows - 1, Math.round(wy * 2)));

  const fromShape = shapes.find((s) => s.item.key === fromItem.key) ?? null;
  const toShape = shapes.find((s) => s.item.key === toItem.key) ?? null;

  const exactStart = {
    x: fromShape?.vcx ?? fromItem.x + fromItem.w * 0.5,
    y: fromShape?.vcy ?? fromItem.y + fromItem.h * 0.5,
  };
  const exactEnd = {
    x: toShape?.vcx ?? toItem.x + toItem.w * 0.5,
    y: toShape?.vcy ?? toItem.y + toItem.h * 0.5,
  };

  const isStartOrDestTile = (it: MapItem) =>
    it.key === fromItem.key ||
    it.key === toItem.key ||
    (Boolean(fromItem.unitId) && it.unitId === fromItem.unitId) ||
    (Boolean(toItem.unitId) && it.unitId === toItem.unitId);

  const startDestShapes: TileCollisionShape[] = [];
  const obstacleShapes: TileCollisionShape[] = [];
  const containerAtriumShapes: TileCollisionShape[] = [];
  const isExcludedTile = new Uint8Array(shapes.length);

  for (let tIdx = 0; tIdx < shapes.length; tIdx++) {
    const shape = shapes[tIdx];
    const it = shape.item;
    if (isStartOrDestTile(it)) {
      startDestShapes.push(shape);
      isExcludedTile[tIdx] = 1;
    } else if (
      it.kind === 'atrium' &&
      !fromShape?.isRingSector &&
      !toShape?.isRingSector &&
      (signedDistanceToShape(exactStart.x, exactStart.y, shape) < -0.1 ||
        signedDistanceToShape(exactEnd.x, exactEnd.y, shape) < -0.1)
    ) {
      containerAtriumShapes.push(shape);
      isExcludedTile[tIdx] = 1;
    } else {
      obstacleShapes.push(shape);
    }
  }

  const minObstacleDistanceAt = (wx: number, wy: number, maxCap = MAX_CLEARANCE_RADIUS): number => {
    let minD = maxCap;
    for (const obs of obstacleShapes) {
      if (
        wx < obs.minX - minD ||
        wx > obs.maxX + minD ||
        wy < obs.minY - minD ||
        wy > obs.maxY + minD
      ) {
        continue;
      }
      const d = signedDistanceToShape(wx, wy, obs);
      if (d < minD) minD = d;
    }
    return minD;
  };

  const findStartDestShapeAt = (wx: number, wy: number, pad = 0.04): TileCollisionShape | null => {
    for (const s of startDestShapes) {
      if (wx < s.minX - pad || wx > s.maxX + pad || wy < s.minY - pad || wy > s.maxY + pad) continue;
      if (signedDistanceToShape(wx, wy, s) <= pad) return s;
    }
    return null;
  };

  const floorplate = computeFloorplateBounds(items, cols);
  const fpMinX = floorplate ? floorplate.x + 0.12 : 0.15;
  const fpMaxX = floorplate ? floorplate.x + floorplate.w - 0.12 : cols - 0.15;
  const fpMinY = floorplate ? floorplate.y + 0.12 : 0.15;
  const fpMaxY = floorplate ? floorplate.y + floorplate.h - 0.12 : rows - 0.15;
  const isInsideFloorplate = (wx: number, wy: number): boolean =>
    wx >= fpMinX && wx <= fpMaxX && wy >= fpMinY && wy <= fpMaxY;

  const useStartDoor = Boolean(
    fromShape?.isRingSector &&
      fromShape.doorX !== undefined &&
      fromShape.doorY !== undefined &&
      isInsideFloorplate(fromShape.doorX, fromShape.doorY) &&
      minObstacleDistanceAt(fromShape.doorX, fromShape.doorY, 0.35) >= 0.12,
  );
  const useEndDoor = Boolean(
    toShape?.isRingSector &&
      toShape.doorX !== undefined &&
      toShape.doorY !== undefined &&
      isInsideFloorplate(toShape.doorX, toShape.doorY) &&
      minObstacleDistanceAt(toShape.doorX, toShape.doorY, 0.35) >= 0.12,
  );

  const startGx = worldToGx(useStartDoor ? fromShape!.doorX! : exactStart.x);
  const startGy = worldToGy(useStartDoor ? fromShape!.doorY! : exactStart.y);
  const endGx = worldToGx(useEndDoor ? toShape!.doorX! : exactEnd.x);
  const endGy = worldToGy(useEndDoor ? toShape!.doorY! : exactEnd.y);

  const totalNodes = gCols * gRows;
  const cellCost = new Float32Array(totalNodes);
  cellCost.fill(6.5);
  const obsDistGrid = new Float32Array(totalNodes);
  obsDistGrid.fill(MAX_CLEARANCE_RADIUS);
  const allowDiag = new Uint8Array(totalNodes);
  const isOpenFloorCell = new Uint8Array(totalNodes);

  for (let gy = 0; gy < gRows; gy++) {
    const wy = gyToWorld(gy);
    const rowOff = gy * gCols;
    for (let gx = 0; gx < gCols; gx++) {
      const idx = rowOff + gx;
      const wx = gxToWorld(gx);

      if (!isInsideFloorplate(wx, wy)) {
        cellCost[idx] = 25000.0;
        obsDistGrid[idx] = 0;
        allowDiag[idx] = 0;
        continue;
      }

      const t1 = min1Tile[idx];
      let obsDist: number;
      if (t1 === -1 || !isExcludedTile[t1]) {
        obsDist = min1Dist[idx];
      } else {
        const t2 = min2Tile[idx];
        if (t2 === -1 || !isExcludedTile[t2]) {
          obsDist = min2Dist[idx];
        } else {
          const t3 = min3Tile[idx];
          if (t3 === -1 || !isExcludedTile[t3]) {
            obsDist = min3Dist[idx];
          } else {
            obsDist = minObstacleDistanceAt(wx, wy, MAX_CLEARANCE_RADIUS);
          }
        }
      }
      obsDistGrid[idx] = obsDist;

      if (obsDist <= 0.04) {
        cellCost[idx] = 50000.0;
        allowDiag[idx] = 0;
        continue;
      }

      // Fast check: only test start/dest or container atrium shapes if some tile is within 0.04 of this cell
      if (min1Dist[idx] <= 0.04) {
        const startDestHit = findStartDestShapeAt(wx, wy, 0.04);
        if (startDestHit) {
          if (
            (startDestHit === fromShape && useStartDoor) ||
            (startDestHit === toShape && useEndDoor)
          ) {
            cellCost[idx] = 50000.0;
            allowDiag[idx] = 0;
            continue;
          }
          if (startDestHit.item.kind === 'marker' && obsDist >= 0.22) {
            cellCost[idx] = 1.0;
            allowDiag[idx] = 1;
            isOpenFloorCell[idx] = 1;
            continue;
          }
          const distToEndpoints = Math.min(
            Math.hypot(wx - exactStart.x, wy - exactStart.y),
            Math.hypot(wx - exactEnd.x, wy - exactEnd.y),
          );
          if (obsDist < 0.28 && distToEndpoints > 0.65) {
            cellCost[idx] = 450.0;
            allowDiag[idx] = 0;
            continue;
          }
          const du = (wx - startDestHit.vcx) * startDestHit.ux + (wy - startDestHit.vcy) * startDestHit.uy;
          const dv = (wx - startDestHit.vcx) * startDestHit.vx + (wy - startDestHit.vcy) * startDestHit.vy;
          const axisOffset = Math.min(Math.abs(du), Math.abs(dv));
          cellCost[idx] = 16.0 + axisOffset * 3.5;
          allowDiag[idx] = startDestHit.isRotatedOrCurved ? 1 : 0;
          continue;
        }
      }

      if (obsDist < 0.18) {
        cellCost[idx] = 36.0;
        allowDiag[idx] = 0;
        continue;
      }

      if (
        min1Dist[idx] <= 0.04 &&
        containerAtriumShapes.length > 0 &&
        containerAtriumShapes.some((s) => signedDistanceToShape(wx, wy, s) <= 0.04)
      ) {
        cellCost[idx] = 24.0;
        allowDiag[idx] = 1;
        continue;
      }

      let clearancePenalty = 0;
      if (obsDist < 1.8) {
        clearancePenalty += (1.8 - obsDist) * 0.55;
      }
      if (obsDist < 0.55) {
        clearancePenalty += (0.55 - obsDist) * 7.5;
      }
      cellCost[idx] = 6.5 + clearancePenalty;
      allowDiag[idx] = obsDist >= 0.22 ? 1 : 0;
      isOpenFloorCell[idx] = 1;
    }
  }

  const startCellIdx = startGy * gCols + startGx;
  const endCellIdx = endGy * gCols + endGx;
  cellCost[startCellIdx] = 1.0;
  cellCost[endCellIdx] = 1.0;
  allowDiag[startCellIdx] = fromItem.kind === 'marker' || fromItem.angle || useStartDoor ? 1 : 0;
  allowDiag[endCellIdx] = toItem.kind === 'marker' || toItem.angle || useEndDoor ? 1 : 0;

  const DIRS = [
    [1, 0, 0.5],
    [-1, 0, 0.5],
    [0, 1, 0.5],
    [0, -1, 0.5],
    [1, 1, 0.5 * Math.SQRT2],
    [1, -1, 0.5 * Math.SQRT2],
    [-1, 1, 0.5 * Math.SQRT2],
    [-1, -1, 0.5 * Math.SQRT2],
  ] as const;
  const STATE_STRIDE = 9;
  const INIT_DIR = 8;
  const decodeState = (s: number) => {
    const dir = s % STATE_STRIDE;
    const cellIdx = (s - dir) / STATE_STRIDE;
    const gx = cellIdx % gCols;
    return { dir, cellIdx, gx, gy: (cellIdx - gx) / gCols };
  };
  const stateCount = totalNodes * STATE_STRIDE;
  const dist = new Float32Array(stateCount);
  dist.fill(Infinity);
  const fScore = new Float32Array(stateCount);
  fScore.fill(Infinity);
  const parent = new Int32Array(stateCount);
  parent.fill(-1);

  const heuristicCost = (gx: number, gy: number): number => {
    const dx = Math.abs(gx - endGx);
    const dy = Math.abs(gy - endGy);
    return (Math.max(dx, dy) + 0.41421356 * Math.min(dx, dy)) * 0.5;
  };

  const startState = startCellIdx * STATE_STRIDE + INIT_DIR;
  dist[startState] = 0;
  fScore[startState] = heuristicCost(startGx, startGy);

  const heap: number[] = [startState];
  const pushHeap = (s: number) => {
    heap.push(s);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[i]]) break;
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
        if (l < n && fScore[heap[l]] < fScore[heap[smallest]]) smallest = l;
        if (r < n && fScore[heap[r]] < fScore[heap[smallest]]) smallest = r;
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
    const { dir, cellIdx, gx, gy } = decodeState(cur);
    if (curCost + heuristicCost(gx, gy) > fScore[cur] + 1e-4) continue;

    if (gx === endGx && gy === endGy) {
      goalState = cur;
      break;
    }

    for (let nd = 0; nd < 8; nd++) {
      const [dx, dy, stepLen] = DIRS[nd];
      const ngx = gx + dx;
      const ngy = gy + dy;
      if (ngx < 0 || ngx >= gCols || ngy < 0 || ngy >= gRows) continue;
      const nCellIdx = ngy * gCols + ngx;

      if (nd >= 4) {
        if (!allowDiag[cellIdx] || !allowDiag[nCellIdx]) continue;
        if (obsDistGrid[cellIdx] < 0.55 || obsDistGrid[nCellIdx] < 0.55) {
          const wx0 = gxToWorld(gx);
          const wy0 = gyToWorld(gy);
          const wx1 = gxToWorld(ngx);
          const wy1 = gyToWorld(ngy);
          if (
            minObstacleDistanceAt((wx0 + wx1) * 0.5, (wy0 + wy1) * 0.5, 0.19) < 0.18 ||
            minObstacleDistanceAt(wx0 * 0.75 + wx1 * 0.25, wy0 * 0.75 + wy1 * 0.25, 0.17) < 0.16 ||
            minObstacleDistanceAt(wx0 * 0.25 + wx1 * 0.75, wy0 * 0.25 + wy1 * 0.75, 0.17) < 0.16
          ) {
            continue;
          }
        }
      }

      let turnPenalty = 0;
      if (dir !== INIT_DIR && dir !== nd) {
        const [prevDx, prevDy] = DIRS[dir];
        const prevLen = Math.hypot(prevDx, prevDy);
        const curLen = Math.hypot(dx, dy);
        const cosTurn = (prevDx * dx + prevDy * dy) / (prevLen * curLen);
        turnPenalty = cosTurn > 0.5 ? 0.14 : 0.35;
      }

      const nextCost = curCost + cellCost[nCellIdx] * stepLen + turnPenalty;
      const nextState = nCellIdx * STATE_STRIDE + nd;
      if (nextCost < dist[nextState]) {
        dist[nextState] = nextCost;
        fScore[nextState] = nextCost + heuristicCost(ngx, ngy);
        parent[nextState] = cur;
        pushHeap(nextState);
      }
    }
  }

  const rawNodes: Array<{ gx: number; gy: number }> = [];
  if (goalState !== -1) {
    let cur = goalState;
    while (cur !== -1) {
      const { gx, gy } = decodeState(cur);
      rawNodes.push({ gx, gy });
      cur = parent[cur];
    }
    rawNodes.reverse();
  } else {
    rawNodes.push({ gx: startGx, gy: startGy }, { gx: endGx, gy: endGy });
  }

  const isSegmentClearOfObstacles = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    minClearance = 0.24,
  ): boolean => {
    const distAB = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(4, Math.ceil(distAB / 0.12));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const sx = a.x + (b.x - a.x) * t;
      const sy = a.y + (b.y - a.y) * t;
      if (!isInsideFloorplate(sx, sy) || minObstacleDistanceAt(sx, sy, minClearance + 0.02) < minClearance) {
        return false;
      }
    }
    return true;
  };

  const rawPoints = rawNodes.map(({ gx, gy }) => ({ x: gxToWorld(gx), y: gyToWorld(gy) }));
  if (rawPoints.length > 0) {
    if (useStartDoor) {
      rawPoints.unshift(exactStart);
    } else {
      rawPoints[0] = exactStart;
    }
    if (useEndDoor) {
      rawPoints.push(exactEnd);
    } else {
      rawPoints[rawPoints.length - 1] = exactEnd;
    }
  }

  if ((fromItem.angle || toItem.angle) && rawPoints.length >= 4) {
    if (fromItem.angle && !useStartDoor) {
      let exitIdx = 1;
      while (
        exitIdx < rawPoints.length - 2 &&
        findStartDestShapeAt(rawPoints[exitIdx].x, rawPoints[exitIdx].y, 0.08) !== null
      ) {
        exitIdx++;
      }
      if (exitIdx > 1 && isSegmentClearOfObstacles(exactStart, rawPoints[exitIdx], 0.26)) {
        rawPoints.splice(1, exitIdx - 1);
      }
    }
    if (toItem.angle && !useEndDoor && rawPoints.length >= 4) {
      let enterIdx = rawPoints.length - 2;
      while (
        enterIdx > 1 &&
        findStartDestShapeAt(rawPoints[enterIdx].x, rawPoints[enterIdx].y, 0.08) !== null
      ) {
        enterIdx--;
      }
      if (
        enterIdx < rawPoints.length - 2 &&
        isSegmentClearOfObstacles(rawPoints[enterIdx], exactEnd, 0.26)
      ) {
        rawPoints.splice(enterIdx + 1, rawPoints.length - 2 - enterIdx);
      }
    }
  }

  const isInWalledStartDestAt = (wx: number, wy: number, pad = 0.08): boolean => {
    const hit = findStartDestShapeAt(wx, wy, pad);
    return Boolean(hit && hit.item.kind !== 'marker');
  };

  const smoothOpenFloorWaypoints = (pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> => {
    if (pts.length <= 2) return simplifyCollinearWaypoints(pts);
    const nodeIdxAt = (pt: { x: number; y: number }) => {
      const gx = worldToGx(pt.x);
      const gy = worldToGy(pt.y);
      return gy * gCols + gx;
    };
    const pointToSegmentDist = (
      p: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number },
    ): number => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 1e-8 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    };
    const canShortcutOpenChord = (iStart: number, iEnd: number, maxRefCost: number): boolean => {
      const a = pts[iStart];
      const b = pts[iEnd];
      for (let k = iStart + 1; k < iEnd; k++) {
        if (pointToSegmentDist(pts[k], a, b) > 0.42) {
          return false;
        }
      }
      if (!isSegmentClearOfObstacles(a, b, 0.30)) return false;
      const distAB = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(3, Math.ceil(distAB / 0.2));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const sx = a.x + (b.x - a.x) * t;
        const sy = a.y + (b.y - a.y) * t;
        if (isInWalledStartDestAt(sx, sy, 0.08)) return false;
        const idx = nodeIdxAt({ x: sx, y: sy });
        if (!isOpenFloorCell[idx] && cellCost[idx] >= 6.0) return false;
        if (cellCost[idx] >= 25 || cellCost[idx] > maxRefCost + 0.85) return false;
      }
      return true;
    };

    const pulled: Array<{ x: number; y: number }> = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      const curIdx = nodeIdxAt(pts[i]);
      const nextIdx = nodeIdxAt(pts[i + 1]);
      const curInStartDest = isInWalledStartDestAt(pts[i].x, pts[i].y, 0.08);
      const nextInStartDest = isInWalledStartDestAt(pts[i + 1].x, pts[i + 1].y, 0.08);
      if (curInStartDest || nextInStartDest || (!isOpenFloorCell[curIdx] && !isOpenFloorCell[nextIdx])) {
        pulled.push(pts[i + 1]);
        i++;
        continue;
      }
      let bestJ = i + 1;
      let maxCostInRun = Math.max(cellCost[curIdx], cellCost[nextIdx]);
      const limitJ = Math.min(pts.length - 1, i + 12);
      for (let j = i + 2; j <= limitJ; j++) {
        if (isInWalledStartDestAt(pts[j].x, pts[j].y, 0.08)) break;
        const jCell = nodeIdxAt(pts[j]);
        if (!isOpenFloorCell[jCell]) break;
        if (cellCost[jCell] < 25) {
          maxCostInRun = Math.max(maxCostInRun, cellCost[jCell]);
        }
        if (canShortcutOpenChord(i, j, maxCostInRun)) {
          bestJ = j;
        }
      }
      pulled.push(pts[bestJ]);
      i = bestJ;
    }
    return simplifyCollinearWaypoints(pulled);
  };

  const smoothedPoints = smoothOpenFloorWaypoints(rawPoints);

  let cellDistance = 0;
  for (let i = 1; i < smoothedPoints.length; i++) {
    cellDistance += Math.hypot(
      smoothedPoints[i].x - smoothedPoints[i - 1].x,
      smoothedPoints[i].y - smoothedPoints[i - 1].y,
    );
  }
  const cellSideFeet = Math.sqrt(Math.max(10, sqftPerCell || DEFAULT_SQFT_PER_CELL));
  const distanceFeet = Math.max(10, Math.round(cellDistance * cellSideFeet));
  const distanceMeters = Math.max(3, Math.round(distanceFeet * 0.3048));
  const estimatedMinutes = Math.max(1, Math.ceil(distanceFeet / 220));

  const getTileLabel = (it: MapItem): string => {
    if (describeItem) {
      const custom = describeItem(it)?.trim();
      if (custom && custom !== '—') return custom;
    }
    if (it.kind !== 'unit') {
      return parseLandmarkMeta(it.kind, it.label).displayLabel;
    }
    if (it.label && !it.label.startsWith('unit:') && !it.label.startsWith('walkway:')) {
      return it.label;
    }
    return DECORATION_LABELS[it.kind as Exclude<TileKind, 'unit'>] || 'Shop';
  };

  const findNearbyWaypoint = (
    samplePts: ReadonlyArray<{ x: number; y: number }>,
    usedNames: Set<string>,
    allowReuseForTurn = false,
  ): { name: string; key: string; unitId?: string | null } | null => {
    let best: { name: string; key: string; unitId?: string | null } | null = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (it.key === fromItem.key || it.key === toItem.key) continue;
      if (fromItem.unitId && it.unitId === fromItem.unitId) continue;
      if (toItem.unitId && it.unitId === toItem.unitId) continue;
      if (it.kind === 'marker') continue;
      const name = getTileLabel(it);
      if (!name || (!allowReuseForTurn && usedNames.has(name))) continue;
      let minDist = Infinity;
      for (const pt of samplePts) {
        const dx = pt.x < it.x ? it.x - pt.x : pt.x > it.x + it.w ? pt.x - (it.x + it.w) : 0;
        const dy = pt.y < it.y ? it.y - pt.y : pt.y > it.y + it.h ? pt.y - (it.y + it.h) : 0;
        const d = Math.hypot(dx, dy);
        if (d < minDist) minDist = d;
      }
      const isLandmark = it.kind !== 'unit';
      const maxReach = isLandmark ? 4.8 : 3.2;
      if (minDist > maxReach) continue;
      const score = minDist - (isLandmark ? 0.9 : 0) + (usedNames.has(name) ? 1.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { name, key: it.key, unitId: it.unitId ?? null };
      }
    }
    return best;
  };

  const steps: WalkwayRouteStep[] = [];
  if (smoothedPoints.length >= 2) {
    type RawSeg = {
      dir: 'straight' | 'left' | 'right';
      pts: Array<{ x: number; y: number }>;
      cells: number;
    };
    const rawSegs: RawSeg[] = [];
    for (let i = 1; i < smoothedPoints.length; i++) {
      const p0 = smoothedPoints[i - 1];
      const p1 = smoothedPoints[i];
      const segCells = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (segCells < 1e-3) continue;
      if (rawSegs.length === 0) {
        rawSegs.push({ dir: 'straight', pts: [p0, p1], cells: segCells });
      } else {
        const prev = smoothedPoints[i - 2];
        const v1x = p0.x - prev.x;
        const v1y = p0.y - prev.y;
        const v2x = p1.x - p0.x;
        const v2y = p1.y - p0.y;
        const cross = v1x * v2y - v1y * v2x;
        const dot = v1x * v2x + v1y * v2y;
        const turnAngle = Math.abs(Math.atan2(cross, dot) * (180 / Math.PI));
        if (turnAngle >= 22) {
          const dir: 'left' | 'right' = cross < 0 ? 'left' : 'right';
          rawSegs.push({ dir, pts: [p0, p1], cells: segCells });
        } else {
          const last = rawSegs[rawSegs.length - 1];
          last.pts.push(p1);
          last.cells += segCells;
        }
      }
    }

    const startName = getTileLabel(fromItem);
    const destName = getTileLabel(toItem);
    const usedNames = new Set<string>([startName, destName]);

    for (const seg of rawSegs) {
      const firstPt = seg.pts[0];
      const lastPt = seg.pts[seg.pts.length - 1];
      const midPt = { x: (firstPt.x + lastPt.x) * 0.5, y: (firstPt.y + lastPt.y) * 0.5 };
      const segMeters = Math.max(1, Math.round(seg.cells * cellSideFeet * 0.3048));

      if (seg.dir === 'straight') {
        const near = findNearbyWaypoint([firstPt, midPt, lastPt], usedNames, false);
        if (near) {
          usedNames.add(near.name);
          steps.push({
            instruction: `Pass by ${near.name}`,
            distanceMeters: segMeters,
            direction: 'straight',
            nearTileKey: near.key,
            nearUnitId: near.unitId ?? null,
            nearLabel: near.name,
            point: midPt,
          });
        }
      } else {
        const dirText = seg.dir === 'left' ? 'Turn left' : 'Turn right';
        const turnNear = findNearbyWaypoint([firstPt, midPt], usedNames, true);
        if (turnNear) {
          usedNames.add(turnNear.name);
        }
        const instruction = turnNear ? `${dirText} near ${turnNear.name}` : dirText;
        const prevStep = steps[steps.length - 1];
        if (!prevStep || prevStep.instruction !== instruction) {
          steps.push({
            instruction,
            distanceMeters: segMeters,
            direction: seg.dir,
            nearTileKey: turnNear?.key,
            nearUnitId: turnNear?.unitId ?? null,
            nearLabel: turnNear?.name,
            point: firstPt,
          });
        }
      }
    }

    steps.push({
      instruction: `Arrive at ${destName}`,
      distanceMeters: 0,
      direction: 'arrive',
      nearTileKey: toItem.key,
      nearUnitId: toItem.unitId ?? null,
      nearLabel: destName,
      point: smoothedPoints[smoothedPoints.length - 1],
    });
  }

  const result: WalkwayRouteResult = {
    points: smoothedPoints,
    distanceFeet,
    distanceMeters,
    estimatedMinutes,
    steps,
  };
  floorCache.routeCache.set(routeCacheKey, result);
  return result;
}

// ── Offline / Low-Connection Local Storage Cache for Floor Plans & Directory ──
const FLOOR_PLAN_CACHE_PREFIX = 'pms_mall_fp_v1:';
const DIRECTORY_CACHE_PREFIX = 'pms_mall_dir_v1:';

function readLocalJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveCachedFloorPlan(propertyId: string | null | undefined, floor: string, planData: any): void {
  if (!propertyId || !floor || !planData) return;
  writeLocalJson(`${FLOOR_PLAN_CACHE_PREFIX}${propertyId}:${floor}`, {
    data: planData,
    updatedAt: Date.now(),
  });
}

export function getCachedFloorPlan(propertyId: string | null | undefined, floor: string): any | null {
  if (!propertyId || !floor) return null;
  return readLocalJson<{ data?: any }>(`${FLOOR_PLAN_CACHE_PREFIX}${propertyId}:${floor}`)?.data ?? null;
}

export function saveCachedDirectory(
  propertyId: string | null | undefined,
  payload: { property?: any; shops: any[] },
): void {
  if (!propertyId || !Array.isArray(payload?.shops)) return;
  const existing = getCachedDirectory(propertyId);
  writeLocalJson(`${DIRECTORY_CACHE_PREFIX}${propertyId}`, {
    property: payload.property ?? existing?.property ?? null,
    shops: payload.shops,
    updatedAt: Date.now(),
  });
}

export function getCachedDirectory(
  propertyId: string | null | undefined,
): { property?: any; shops: any[]; updatedAt?: number } | null {
  if (!propertyId) return null;
  const parsed = readLocalJson<{ property?: any; shops: any[]; updatedAt?: number }>(
    `${DIRECTORY_CACHE_PREFIX}${propertyId}`,
  );
  return parsed && Array.isArray(parsed.shops) ? parsed : null;
}
