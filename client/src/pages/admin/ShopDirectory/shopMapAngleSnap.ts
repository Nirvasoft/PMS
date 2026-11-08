// Smart Fit helper: when a unit tile is dropped next to a tilted / slanted neighbour, rotate it a few degrees so
// its closest outline edge becomes parallel to the neighbour's edge. Position is NOT changed (the grid is integer
// cells, so slanted edges can only ever be made parallel, not perfectly flush).
// Kept in its own file so it can be removed without touching the existing snapping code.

import {
  getTrapezoidUnitGeometry,
  isTrapezoidUnitMode,
  parseUnitShapeMode,
  tilesConflict,
  type MapItem,
} from './shopMapLayout';
import { decodeCustomShape, normalizeTileAngle } from './shopMapShapeCatalog';

type P = [number, number];

const CELL = 20;
const RECT: P[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** Edges closer than this (in grid cells) are candidates for alignment. */
const MAX_EDGE_GAP = 1.5;
/** Only rotate when the edges differ by less than this many degrees. */
const MAX_ANGLE_DIFF_DEG = 6;
/** Ignore tiny edges (curve samples). */
const MIN_EDGE_LEN = 1.2;
/** Edges must run side by side for at least this many cells. */
const MIN_EDGE_OVERLAP = 1;

/** Outline in tile-local 0..1 coordinates, or null when the tile has no straight edges worth aligning to. */
function localOutline(t: MapItem, items: ReadonlyArray<MapItem>): P[] | null {
  if (t.kind !== 'unit') return null;
  const mode = parseUnitShapeMode(t, items);
  if (mode === 'rect') return RECT;
  if (mode === 'circle' || mode === 'ring-curve' || mode === 'trapezoid-ring') return null;
  if (mode === 'custom') {
    const pts = decodeCustomShape(t.label);
    return pts ? pts.map(([x, y]) => [x / 100, y / 100] as P) : null;
  }
  if (!isTrapezoidUnitMode(mode)) return null;
  try {
    const wPx = Math.max(1, Math.round(t.w * CELL));
    const hPx = Math.max(1, Math.round(t.h * CELL));
    const geo = getTrapezoidUnitGeometry(mode, wPx, hPx, CELL, null, t, items);
    const pts = geo.fillPoints
      .trim()
      .split(/\s+/)
      .map((s) => {
        const [x, y] = s.split(',').map(Number);
        return [x / wPx, y / hPx] as P;
      });
    if (pts.length < 3 || pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
    return pts;
  } catch {
    return null;
  }
}

/** Outline in grid-cell world coordinates (tile angle applied around the tile centre). */
function worldOutline(t: MapItem, items: ReadonlyArray<MapItem>): P[] | null {
  const local = localOutline(t, items);
  if (!local) return null;
  const rad = ((t.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = t.x + t.w * 0.5;
  const cy = t.y + t.h * 0.5;
  return local.map(([u, v]) => {
    const px = t.x + u * t.w - cx;
    const py = t.y + v * t.h - cy;
    return [cx + px * cos - py * sin, cy + px * sin + py * cos] as P;
  });
}

interface Edge {
  a: P;
  b: P;
  len: number;
  /** Direction angle in radians. */
  dir: number;
}

function edgesOf(poly: P[]): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len >= MIN_EDGE_LEN) out.push({ a, b, len, dir: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  }
  return out;
}

/** Difference of two line directions folded into (-90°, 90°] (edges are undirected). */
function lineAngleDiffDeg(a: number, b: number): number {
  let d = ((a - b) * 180) / Math.PI;
  d = ((((d + 90) % 180) + 180) % 180) - 90;
  return d === -90 ? 90 : d;
}

/**
 * Returns the moved tile with a corrected `angle` when one of its outline edges is nearly parallel to (and
 * right next to) an edge of a neighbouring unit, or null when nothing should change.
 */
export function alignTileAngleToNeighborEdge(moved: MapItem, items: ReadonlyArray<MapItem>): MapItem | null {
  if (moved.kind !== 'unit' || !moved.unitId) return null;
  // Curved / ring shapes use `angle` to face their atrium, and multi-block units must stay aligned together.
  if (/crescent|ring|arch|pie|curve|circle/.test(parseUnitShapeMode(moved, items))) return null;
  if (items.some((i) => i.key !== moved.key && i.unitId === moved.unitId)) return null;
  const myPoly = worldOutline(moved, items);
  if (!myPoly) return null;
  const myEdges = edgesOf(myPoly);
  if (myEdges.length === 0) return null;

  const others = items.filter((i) => i.key !== moved.key);
  const myR = Math.hypot(moved.w, moved.h) / 2;
  const myCx = moved.x + moved.w / 2;
  const myCy = moved.y + moved.h / 2;

  let best: { diffDeg: number; score: number } | null = null;
  for (const o of others) {
    if (o.kind !== 'unit') continue;
    const oR = Math.hypot(o.w, o.h) / 2;
    if (Math.hypot(o.x + o.w / 2 - myCx, o.y + o.h / 2 - myCy) > myR + oR + MAX_EDGE_GAP) continue;
    const oPoly = worldOutline(o, items);
    if (!oPoly) continue;
    for (const f of edgesOf(oPoly)) {
      const fdx = Math.cos(f.dir);
      const fdy = Math.sin(f.dir);
      for (const e of myEdges) {
        const diffDeg = lineAngleDiffDeg(e.dir, f.dir);
        const absDiff = Math.abs(diffDeg);
        if (absDiff < 0.5 || absDiff > MAX_ANGLE_DIFF_DEG) continue;
        // Perpendicular gap between e's midpoint and f's line.
        const mx = (e.a[0] + e.b[0]) / 2;
        const my = (e.a[1] + e.b[1]) / 2;
        const gap = Math.abs((mx - f.a[0]) * -fdy + (my - f.a[1]) * fdx);
        if (gap > MAX_EDGE_GAP) continue;
        // Overlap of both edges measured along f's direction.
        const t1 = (e.a[0] - f.a[0]) * fdx + (e.a[1] - f.a[1]) * fdy;
        const t2 = (e.b[0] - f.a[0]) * fdx + (e.b[1] - f.a[1]) * fdy;
        const overlap = Math.min(Math.max(t1, t2), f.len) - Math.max(Math.min(t1, t2), 0);
        if (overlap < MIN_EDGE_OVERLAP) continue;
        const score = gap + absDiff * 0.1;
        if (!best || score < best.score) best = { diffDeg, score };
      }
    }
  }
  if (!best) return null;

  const nextAngle = normalizeTileAngle(Math.round((moved.angle ?? 0) - best.diffDeg));
  if ((nextAngle ?? 0) === (moved.angle ?? 0)) return null;
  const candidate: MapItem = { ...moved, angle: nextAngle };
  // Never trade a clean placement for an overlapping one.
  const candidateConflicts = others.some((o) => tilesConflict(candidate, o));
  if (candidateConflicts && !others.some((o) => tilesConflict(moved, o))) return null;
  return candidate;
}
