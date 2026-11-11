// Pure helpers for the Shop Directory "Map" view (grid layout, sqft-based tile sizing).
// Kept free of React so the logic is easy to reason about and test.

import {
  customShapeConvexUvParts,
  customShapeLabelOffsetPx,
  decodeCustomShape,
  normalizeTileAngle,
  parseShapeRadius,
  polygonConvexUvParts,
  snapUvPartsToBoxEdges,
  UNIT_SHAPE_CATEGORY_TABS,
  UNIT_SHAPE_COMPACT_FAMILIES,
  UNIT_SHAPE_CONVEX_UV_PARTS,
  UNIT_SHAPE_LABELS,
  VALID_UNIT_SHAPE_MODES,
} from './shopMapShapeCatalog';
import type {
  MapItem,
  TileKind,
  UnitShapeCategoryId,
  UnitShapeCompactFamily,
  UnitShapeMode,
} from './shopMapShapeCatalog';

export {
  normalizeTileAngle,
  UNIT_SHAPE_CATEGORY_TABS,
  UNIT_SHAPE_COMPACT_FAMILIES,
  UNIT_SHAPE_CONVEX_UV_PARTS,
  UNIT_SHAPE_LABELS,
  VALID_UNIT_SHAPE_MODES,
};
export type {
  MapItem,
  TileKind,
  UnitShapeCategoryId,
  UnitShapeCompactFamily,
  UnitShapeMode,
};

export interface TrapezoidUnitGeometry {
  clipPath: string;
  fillPoints: string;
  rimPath: string;
  lipRightPath: string;
  lipBottomPath: string;
  facingEdge?: 'top' | 'right' | 'bottom' | 'left';
  labelOffsetXPx?: number;
  labelOffsetYPx?: number;
}

function isCircleRingCorridor(
  c: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number },
): boolean {
  if (c.w < 3 || c.h < 3) return false;
  if (c.kind === 'atrium') {
    return parseLandmarkMeta('atrium', c.label).isCircle;
  }
  if (c.kind !== 'unit') {
    return parseLandmarkMeta(c.kind, c.label).isCircle;
  }
  if (c.kind === 'unit') {
    return c.label === 'unit:circle';
  }
  return false;
}

function computeCircleRingRadii(
  r: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number },
  minOuter = 1.5,
  minInner = 0.8,
) {
  const rxOut = Math.max(minOuter, r.w * 0.5);
  const ryOut = Math.max(minOuter, r.h * 0.5);
  const minDim = Math.min(r.w, r.h);
  const laneX = minDim <= 2 ? r.w * 0.5 : r.w >= 8 ? Math.max(2, r.w * 0.25) : Math.min(r.w * 0.36, 1.65);
  const laneY = minDim <= 2 ? r.h * 0.5 : r.h >= 8 ? Math.max(2, r.h * 0.25) : Math.min(r.h * 0.36, 1.65);
  const rxIn = Math.max(minInner, rxOut - laneX);
  const ryIn = Math.max(minInner, ryOut - laneY);
  return { rxOut, ryOut, rxIn, ryIn };
}

interface CircleCorridorUnitMatch {
  ring: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number };
  cx: number;
  cy: number;
  rxOut: number;
  ryOut: number;
  rxIn: number;
  ryIn: number;
  boxGap: number;
  normClosest: number;
  isNear: boolean;
}

function getClosestPointOnTileToPoint(
  tile: { x: number; y: number; w: number; h: number; angle?: number },
  px: number,
  py: number,
): { x: number; y: number } {
  const angle = tile.angle ?? 0;
  if (!angle) {
    return {
      x: Math.max(tile.x, Math.min(tile.x + tile.w, px)),
      y: Math.max(tile.y, Math.min(tile.y + tile.h, py)),
    };
  }
  const cx = tile.x + tile.w * 0.5;
  const cy = tile.y + tile.h * 0.5;
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  const dx = px - cx;
  const dy = py - cy;
  const du = Math.max(-tile.w * 0.5, Math.min(tile.w * 0.5, dx * ux + dy * uy));
  const dv = Math.max(-tile.h * 0.5, Math.min(tile.h * 0.5, dx * vx + dy * vy));
  return {
    x: cx + du * ux + dv * vx,
    y: cy + du * uy + dv * vy,
  };
}

function findNearestCircleCorridorForUnit(
  it: { key?: string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }>,
): CircleCorridorUnitMatch | null {
  if (it.label === 'unit:circle') return null;
  const rings = allItems.filter(
    (r) => r !== it && (!it.key || r.key !== it.key) && isCircleRingCorridor(r),
  );
  if (rings.length === 0) return null;
  const ux = it.x + it.w * 0.5;
  const uy = it.y + it.h * 0.5;
  let best: CircleCorridorUnitMatch | null = null;
  let bestScore = Infinity;

  for (const r of rings) {
    const rcx = r.x + r.w * 0.5;
    const rcy = r.y + r.h * 0.5;
    const { rxOut, ryOut, rxIn, ryIn } = computeCircleRingRadii(r, 1.5, 0.8);
    const gapX = Math.max(0, it.x - (r.x + r.w), r.x - (it.x + it.w));
    const gapY = Math.max(0, it.y - (r.y + r.h), r.y - (it.y + it.h));
    const boxGap = Math.hypot(gapX, gapY);
    const closestPt = getClosestPointOnTileToPoint(it, rcx, rcy);
    const normClosest = Math.hypot((closestPt.x - rcx) / rxOut, (closestPt.y - rcy) / ryOut);
    const avgR = (rxOut + ryOut) * 0.5;
    const radialDist = Math.abs(normClosest - 1) * avgR;
    const normCenter = Math.hypot((ux - rcx) / rxOut, (uy - rcy) / ryOut);
    const atriumPriority = r.kind === 'atrium' ? 0 : 1.5;
    const score = boxGap + radialDist * 0.6 + atriumPriority;
    const isNear =
      boxGap <= 15.0 && normCenter >= 0.35 && normClosest >= 0.15 && (normClosest - 1) * avgR <= 15.0;
    if (score < bestScore) {
      bestScore = score;
      best = {
        ring: r,
        cx: rcx,
        cy: rcy,
        rxOut,
        ryOut,
        rxIn,
        ryIn,
        boxGap,
        normClosest,
        isNear,
      };
    }
  }
  return best;
}

function isRingCurveUnitLabel(label?: string | null): boolean {
  return Boolean(label && (label === 'unit:ring-curve' || label.startsWith('unit:ring-curve:')));
}

function isRingSectorUnitLabel(label?: string | null): boolean {
  return Boolean(isRingCurveUnitLabel(label) || label?.startsWith('unit:trapezoid-ring'));
}

function parseRingCurveLabelMeta(
  label?: string | null,
): { thetaDeg?: number; thetaRad?: number } | null {
  if (!label || !isRingSectorUnitLabel(label) || label === 'unit:ring-curve:free') return null;
  let thetaDeg: number | undefined;
  const parts = label.split(':').slice(2);
  for (const p of parts) {
    if (p.startsWith('a=')) {
      const val = Number(p.slice(2));
      if (Number.isFinite(val)) {
        thetaDeg = val;
      }
    }
  }
  return thetaDeg !== undefined ? { thetaDeg, thetaRad: (thetaDeg * Math.PI) / 180 } : {};
}

function resolveUnitCircleSectorTheta(
  u: { label?: string | null; x: number; y: number; w: number; h: number },
  rcx: number,
  rcy: number,
  rxOut: number,
  ryOut: number,
): number {
  const ux = u.x + u.w * 0.5;
  const uy = u.y + u.h * 0.5;
  const gridTheta = Math.atan2((uy - rcy) / ryOut, (ux - rcx) / rxOut);
  const meta = parseRingCurveLabelMeta(u.label);
  return meta?.thetaRad !== undefined &&
    Math.abs(Math.atan2(Math.sin(meta.thetaRad - gridTheta), Math.cos(meta.thetaRad - gridTheta))) <=
      (22 * Math.PI) / 180
    ? meta.thetaRad
    : gridTheta;
}

function computeCircleTangentUprightAngleDeg(nx: number, ny: number): number {
  const degBottom = (((Math.atan2(nx, -ny) * 180) / Math.PI) % 360 + 360) % 360;
  const degTop = (((Math.atan2(-nx, ny) * 180) / Math.PI) % 360 + 360) % 360;
  const isBottomUpright = degBottom <= 96 || degBottom >= 264;
  return isBottomUpright ? degBottom : degTop;
}

function computeRingSectorArcMetrics(
  w: number,
  h: number,
  rIn: number,
): {
  halfAngle: number;
  spanAngle: number;
  rOut: number;
  inTaper: number;
  archDrop: number;
  innerArchRise: number;
} {
  const safeRIn = Math.max(2, rIn);
  const safeW = Math.max(1, w);
  const safeH = Math.max(1, h);
  const alpha0 = Math.asin(Math.min(0.68, (0.5 * safeW) / (safeRIn + 0.9 * safeH)));
  const rOut0 = safeRIn * Math.cos(alpha0) + safeH;
  const halfAngle = Math.asin(Math.min(0.68, (0.5 * safeW) / Math.max(2, rOut0)));
  const cosA = Math.cos(halfAngle);
  const rOut = safeRIn * cosA + safeH;
  const inTaper = Math.max(0.06, Math.min(0.38, 0.5 * (1 - safeRIn / rOut)));
  const archDrop = Math.max(0.04, Math.min(0.36, (rOut * (1 - cosA)) / safeH));
  const innerArchRise = Math.max(0.03, Math.min(0.32, (safeRIn * (1 - cosA)) / safeH));
  return {
    halfAngle,
    spanAngle: halfAngle * 2,
    rOut,
    inTaper,
    archDrop,
    innerArchRise,
  };
}

export function getCircleRingSectorAlignment(
  it: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
): { dx: number; dy: number; exactAngle: number } | null {
  if (it.kind !== 'unit' || !isRingSectorUnitLabel(it.label)) return null;
  const match = findNearestCircleCorridorForUnit(it, allItems);
  if (!match || !match.isNear) return null;

  const ux = it.x + it.w * 0.5;
  const uy = it.y + it.h * 0.5;
  const theta = resolveUnitCircleSectorTheta(it, match.cx, match.cy, match.rxOut, match.ryOut);
  const bx = match.cx + match.rxOut * Math.cos(theta);
  const by = match.cy + match.ryOut * Math.sin(theta);
  const gnx = Math.cos(theta) / match.rxOut;
  const gny = Math.sin(theta) / match.ryOut;
  const gLen = Math.hypot(gnx, gny) || 1;
  const nx = gnx / gLen;
  const ny = gny / gLen;
  const rIn = Math.hypot(bx - match.cx, by - match.cy) || (match.rxOut + match.ryOut) * 0.5;
  const metrics = computeRingSectorArcMetrics(it.w, it.h, rIn);
  const cosA = Math.cos(metrics.halfAngle);
  const idealCenterX = match.cx + match.rxOut * Math.cos(theta) * cosA + nx * (0.5 * it.h);
  const idealCenterY = match.cy + match.ryOut * Math.sin(theta) * cosA + ny * (0.5 * it.h);

  const rawDx = idealCenterX - ux;
  const rawDy = idealCenterY - uy;
  if (Math.hypot(rawDx, rawDy) > 3.5) return null;

  const exactAngle = Math.round(computeCircleTangentUprightAngleDeg(nx, ny) * 100) / 100;

  return {
    dx: Math.max(-2.5, Math.min(2.5, rawDx)),
    dy: Math.max(-2.5, Math.min(2.5, rawDy)),
    exactAngle,
  };
}

export function getRingSectorRoutingPolygon(
  it: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
): {
  vcx: number;
  vcy: number;
  exactAngle: number;
  doorX: number;
  doorY: number;
  corners: Array<{ x: number; y: number }>;
} | null {
  if (it.kind !== 'unit' || !isRingSectorUnitLabel(it.label)) return null;
  const match = findNearestCircleCorridorForUnit(it, allItems);
  if (!match || !match.isNear) return null;

  const ux = it.x + it.w * 0.5;
  const uy = it.y + it.h * 0.5;
  const theta = resolveUnitCircleSectorTheta(it, match.cx, match.cy, match.rxOut, match.ryOut);
  const bx = match.cx + match.rxOut * Math.cos(theta);
  const by = match.cy + match.ryOut * Math.sin(theta);
  const gnx = Math.cos(theta) / match.rxOut;
  const gny = Math.sin(theta) / match.ryOut;
  const gLen = Math.hypot(gnx, gny) || 1;
  const nx = gnx / gLen;
  const ny = gny / gLen;
  const rIn = Math.hypot(bx - match.cx, by - match.cy) || (match.rxOut + match.ryOut) * 0.5;
  const metrics = computeRingSectorArcMetrics(it.w, it.h, rIn);
  const cosA = Math.cos(metrics.halfAngle);
  const idealCenterX = match.cx + match.rxOut * Math.cos(theta) * cosA + nx * (0.5 * it.h);
  const idealCenterY = match.cy + match.ryOut * Math.sin(theta) * cosA + ny * (0.5 * it.h);

  const rawDx = idealCenterX - ux;
  const rawDy = idealCenterY - uy;
  const dx = Math.hypot(rawDx, rawDy) <= 3.5 ? Math.max(-2.5, Math.min(2.5, rawDx)) : 0;
  const dy = Math.hypot(rawDx, rawDy) <= 3.5 ? Math.max(-2.5, Math.min(2.5, rawDy)) : 0;
  const vcx = ux + dx;
  const vcy = uy + dy;
  const exactAngle = Math.round(computeCircleTangentUprightAngleDeg(nx, ny) * 100) / 100;

  const halfSpan = metrics.halfAngle * 1.06;
  const rxOuter = match.rxOut * cosA + it.h + 0.12;
  const ryOuter = match.ryOut * cosA + it.h + 0.12;
  const rxInner = match.rxOut * 0.8;
  const ryInner = match.ryOut * 0.8;
  const steps = 6;
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const a = theta + ((i / steps) * 2 - 1) * halfSpan;
    corners.push({
      x: match.cx + rxOuter * Math.cos(a),
      y: match.cy + ryOuter * Math.sin(a),
    });
  }
  for (let i = steps; i >= 0; i--) {
    const a = theta + ((i / steps) * 2 - 1) * halfSpan;
    corners.push({
      x: match.cx + rxInner * Math.cos(a),
      y: match.cy + ryInner * Math.sin(a),
    });
  }

  const doorX = match.cx + (match.rxOut * cosA + it.h + 0.45) * Math.cos(theta);
  const doorY = match.cy + (match.ryOut * cosA + it.h + 0.45) * Math.sin(theta);

  return { vcx, vcy, exactAngle, doorX, doorY, corners };
}

function isAutoAtriumSideCurveLabel(label?: string | null): boolean {
  if (!label) return false;
  return label.startsWith('unit:') && (label.endsWith(':auto') || label === 'unit:ring-curve:free');
}

export function isAutoUnitShapeLabel(label?: string | null): boolean {
  return !label || isAutoAtriumSideCurveLabel(label);
}

function isUnitCloseToCircleAtriumRim(match: CircleCorridorUnitMatch): boolean {
  const avgR = (match.rxOut + match.ryOut) * 0.5;
  const radialGap = (match.normClosest - 1) * avgR;
  return match.boxGap <= 3.5 && match.normClosest >= 0.55 && radialGap <= 3.0;
}

function resolveAtriumFacingSideCurveMode(
  u: { x: number; y: number; w: number; h: number },
  match: {
    ring: { x: number; y: number; w: number; h: number };
    cx: number;
    cy: number;
    rxOut: number;
    ryOut: number;
  },
): UnitShapeMode {
  const ucx = u.x + u.w * 0.5;
  const ucy = u.y + u.h * 0.5;
  const nx = (ucx - match.cx) / Math.max(1, match.rxOut);
  const ny = (ucy - match.cy) / Math.max(1, match.ryOut);
  const ovX = Math.min(u.x + u.w, match.ring.x + match.ring.w) - Math.max(u.x, match.ring.x);
  const ovY = Math.min(u.y + u.h, match.ring.y + match.ring.h) - Math.max(u.y, match.ring.y);

  // Diagonal corner of the Atrium: curve only the corner facing the Atrium
  if (
    ovX <= u.w * 0.78 &&
    ovY <= u.h * 0.78 &&
    Math.abs(nx) >= 0.38 &&
    Math.abs(ny) >= 0.38
  ) {
    if (nx >= 0 && ny >= 0) return 'notch-tl';
    if (nx < 0 && ny >= 0) return 'notch-tr';
    if (nx >= 0 && ny < 0) return 'notch-bl';
    return 'notch-br';
  }

  if (Math.abs(nx) >= Math.abs(ny)) {
    return nx >= 0 ? 'crescent-l' : 'crescent-r';
  }
  return ny >= 0 ? 'crescent-t' : 'crescent-b';
}

export function parseUnitShapeMode(
  it: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems?: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
): UnitShapeMode {
  if (typeof it.label === 'string' && it.label.startsWith('unit:')) {
    const rawMode = it.label.slice(5).split(':')[0] as UnitShapeMode;
    if (!isAutoUnitShapeLabel(it.label) && VALID_UNIT_SHAPE_MODES.has(rawMode)) {
      return rawMode;
    }
    if (allItems) {
      const autoDetected = resolveAutoUnitShapeMode(it, allItems);
      if (autoDetected !== 'rect') return autoDetected;
    }
    if (VALID_UNIT_SHAPE_MODES.has(rawMode)) {
      return rawMode;
    }
  }
  if (allItems) {
    return resolveAutoUnitShapeMode(it, allItems);
  }
  return 'rect';
}

export function encodeUnitShapeMode(mode: UnitShapeMode): string {
  if (VALID_UNIT_SHAPE_MODES.has(mode)) {
    return `unit:${mode}`;
  }
  return 'unit:rect';
}

export function nextUnitShapeMode(mode: UnitShapeMode, isMergedUnit = false): UnitShapeMode {
  // If the current shape belongs to a multi-variant directional family, cycle within that family first
  const family = UNIT_SHAPE_COMPACT_FAMILIES.find((f) => f.variants.includes(mode));
  if (family && family.variants.length > 1) {
    const famVars = isMergedUnit
      ? family.variants.filter((v) => v !== 'circle')
      : family.variants;
    const fIdx = famVars.indexOf(mode);
    if (fIdx !== -1 && famVars.length > 1) {
      return famVars[(fIdx + 1) % famVars.length];
    }
  }
  const allModes = (Object.keys(UNIT_SHAPE_LABELS) as UnitShapeMode[]).filter((id) => id !== 'custom');
  const list: UnitShapeMode[] = isMergedUnit ? allModes.filter((id) => id !== 'circle') : allModes;
  const idx = list.indexOf(mode);
  if (idx === -1) return 'rect';
  return list[(idx + 1) % list.length];
}

/**
 * Automatically selects the best directional variant (`TL / TR / BL / BR` or `Left / Right / Top / Bottom`)
 * for a given `UnitShapeCompactFamily` based on the unit's position relative to nearby circular Kiosks,
 * Atriums, touching neighbor units, or the floor center.
 */
export function resolveSmartFamilyShapeMode(
  u: { key?: string; x: number; y: number; w: number; h: number; angle?: number },
  family: UnitShapeCompactFamily,
  allItems?: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
  isMergedUnit = false,
): UnitShapeMode {
  const famVariants = isMergedUnit
    ? family.variants.filter((v) => v !== 'circle')
    : family.variants;
  if (famVariants.length === 0) return 'rect';
  if (famVariants.length === 1) return famVariants[0];

  const ucx = u.x + u.w * 0.5;
  const ucy = u.y + u.h * 0.5;
  const items = allItems ?? [];

  // 1. Find nearest circular Kiosk (unit:circle)
  let nearestKiosk: { cx: number; cy: number; gap: number } | null = null;
  // 2. Find nearest Atrium or Circle Ring Corridor
  let nearestAtrium: { cx: number; cy: number; gap: number; isCircle: boolean } | null = null;
  // 3. Detect touching neighbor units to identify open island ends
  let hasLeftNeighbor = false;
  let hasRightNeighbor = false;
  let hasTopNeighbor = false;
  let hasBottomNeighbor = false;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const o of items) {
    if (o === u || (u.key && o.key === u.key)) continue;
    const ocx = o.x + o.w * 0.5;
    const ocy = o.y + o.h * 0.5;
    sumX += ocx;
    sumY += ocy;
    count++;

    const gapX = Math.max(0, u.x - (o.x + o.w), o.x - (u.x + u.w));
    const gapY = Math.max(0, u.y - (o.y + o.h), o.y - (u.y + u.h));
    const boxGap = Math.hypot(gapX, gapY);

    if (o.kind === 'unit' && parseUnitShapeMode(o) === 'circle') {
      if (!nearestKiosk || boxGap < nearestKiosk.gap) {
        nearestKiosk = { cx: ocx, cy: ocy, gap: boxGap };
      }
      continue;
    }

    if (o.kind === 'atrium' || isCircleRingCorridor(o)) {
      const priorityGap = o.kind === 'atrium' ? boxGap : boxGap + 1.5;
      if (!nearestAtrium || priorityGap < nearestAtrium.gap) {
        nearestAtrium = { cx: ocx, cy: ocy, gap: priorityGap, isCircle: isCircleRingCorridor(o) };
      }
    }

    if (o.kind === 'unit') {
      const ovX = Math.min(u.x + u.w, o.x + o.w) - Math.max(u.x, o.x);
      const ovY = Math.min(u.y + u.h, o.y + o.h) - Math.max(u.y, o.y);
      if (ovY >= 0.8 && Math.abs(u.x - (o.x + o.w)) <= 0.6) hasLeftNeighbor = true;
      if (ovY >= 0.8 && Math.abs(o.x - (u.x + u.w)) <= 0.6) hasRightNeighbor = true;
      if (ovX >= 0.8 && Math.abs(u.y - (o.y + o.h)) <= 0.6) hasTopNeighbor = true;
      if (ovX >= 0.8 && Math.abs(o.y - (u.y + u.h)) <= 0.6) hasBottomNeighbor = true;
    }
  }

  const openSide: 'left' | 'right' | 'top' | 'bottom' | null =
    hasRightNeighbor && !hasLeftNeighbor
      ? 'left'
      : hasLeftNeighbor && !hasRightNeighbor
        ? 'right'
        : hasBottomNeighbor && !hasTopNeighbor
          ? 'top'
          : hasTopNeighbor && !hasBottomNeighbor
            ? 'bottom'
            : null;

  const floorCx = count > 0 ? sumX / count : ucx;
  const floorCy = count > 0 ? sumY / count : ucy;
  const isNotchFamily = family.id === 'concave-notch' || family.id === 'notch-chamfer-combo';
  const focus = isNotchFamily
    ? (nearestKiosk && nearestKiosk.gap <= 8 ? nearestKiosk : nearestAtrium ?? nearestKiosk ?? { cx: floorCx, cy: floorCy })
    : (nearestAtrium ?? (nearestKiosk && nearestKiosk.gap <= 8 ? nearestKiosk : { cx: floorCx, cy: floorCy }));

  // Vector from unit center toward the focus point (dx < 0 => Left, dx >= 0 => Right, dy < 0 => Top, dy >= 0 => Bottom)
  const dx = focus.cx - ucx;
  const dy = focus.cy - ucy;

  const pickIfValid = (candidate: UnitShapeMode): UnitShapeMode =>
    famVariants.includes(candidate) ? candidate : famVariants[0];

  switch (family.id) {
    case 'outer-ring-wing':
      return pickIfValid(
        dx >= 0 && dy >= 0
          ? 'arch-tl'
          : dx < 0 && dy >= 0
            ? 'arch-tr'
            : dx >= 0 && dy < 0
              ? 'arch-bl'
              : 'arch-br',
      );
    case 'crescent-arc':
      return pickIfValid(
        Math.abs(dx) >= Math.abs(dy)
          ? dx < 0
            ? 'crescent-l'
            : 'crescent-r'
          : dy < 0
            ? 'crescent-t'
            : 'crescent-b',
      );
    case 'chamfer-corner':
      return pickIfValid(
        dx < 0 && dy < 0
          ? 'chamfer-tl'
          : dx >= 0 && dy < 0
            ? 'chamfer-tr'
            : dx < 0 && dy >= 0
              ? 'chamfer-bl'
              : 'chamfer-br',
      );
    case 'bevel-end':
      if (openSide === 'left') return pickIfValid('bevel-l');
      if (openSide === 'right') return pickIfValid('bevel-r');
      if (openSide === 'top') return pickIfValid('bevel-t');
      if (openSide === 'bottom') return pickIfValid('bevel-b');
      return pickIfValid(
        Math.abs(dx) >= Math.abs(dy)
          ? dx < 0
            ? 'bevel-l'
            : 'bevel-r'
          : dy < 0
            ? 'bevel-t'
            : 'bevel-b',
      );
    case 'curved-corner':
      return pickIfValid(
        dx < 0 && dy < 0
          ? 'curve-tl'
          : dx >= 0 && dy < 0
            ? 'curve-tr'
            : dx < 0 && dy >= 0
              ? 'curve-bl'
              : 'curve-br',
      );
    case 'concave-notch': {
      const wingNotch = findAdjacentOuterWingNotchForUnit(u, items);
      if (wingNotch) return pickIfValid(wingNotch);
      return pickIfValid(
        dx < 0 && dy < 0
          ? 'notch-tl'
          : dx >= 0 && dy < 0
            ? 'notch-tr'
            : dx < 0 && dy >= 0
              ? 'notch-bl'
              : 'notch-br',
      );
    }
    case 'notch-chamfer-combo': {
      const wingNotch = findAdjacentOuterWingNotchForUnit(u, items);
      if (wingNotch) {
        return pickIfValid(
          wingNotch === 'notch-tl'
            ? 'notch-tl-chamfer-br'
            : wingNotch === 'notch-tr'
              ? 'notch-tr-chamfer-bl'
              : wingNotch === 'notch-bl'
                ? 'notch-bl-chamfer-tr'
                : 'notch-br-chamfer-tl',
        );
      }
      if (nearestKiosk && nearestKiosk.gap <= 8) {
        const kdx = nearestKiosk.cx - ucx;
        const kdy = nearestKiosk.cy - ucy;
        return pickIfValid(
          kdx < 0 && kdy < 0
            ? 'notch-tl-chamfer-br'
            : kdx >= 0 && kdy < 0
              ? 'notch-tr-chamfer-bl'
              : kdx < 0 && kdy >= 0
                ? 'notch-bl-chamfer-tr'
                : 'notch-br-chamfer-tl',
        );
      }
      return pickIfValid(
        dx < 0 && dy < 0
          ? 'notch-br-chamfer-tl'
          : dx >= 0 && dy < 0
            ? 'notch-bl-chamfer-tr'
            : dx < 0 && dy >= 0
              ? 'notch-tr-chamfer-bl'
              : 'notch-tl-chamfer-br',
      );
    }
    case 'wedge-kiosk':
      if (nearestAtrium?.isCircle) return pickIfValid('pie-wedge');
      return pickIfValid(
        dx < 0 && dy < 0
          ? 'wedge-tl'
          : dx >= 0 && dy < 0
            ? 'wedge-tr'
            : dx < 0 && dy >= 0
              ? 'wedge-bl'
              : 'wedge-br',
      );
    case 'slant-top-bottom':
      return pickIfValid(
        dy < 0
          ? dx < 0
            ? 'slope-t-l'
            : 'slope-t-r'
          : dx < 0
            ? 'slope-b-l'
            : 'slope-b-r',
      );
    case 'slant-left-right':
      if (openSide === 'left') return pickIfValid(dy < 0 ? 'slope-l-t' : 'slope-l-b');
      if (openSide === 'right') return pickIfValid(dy < 0 ? 'slope-r-t' : 'slope-r-b');
      return pickIfValid(
        dx < 0
          ? dy < 0
            ? 'slope-l-t'
            : 'slope-l-b'
          : dy < 0
            ? 'slope-r-t'
            : 'slope-r-b',
      );
    case 'trapezoid-taper':
      if (openSide === 'left') return pickIfValid('trapezoid-l');
      if (openSide === 'right') return pickIfValid('trapezoid-r');
      return pickIfValid('trapezoid');
    case 'stepped-corner':
      return pickIfValid(
        dx < 0 && dy < 0
          ? 'step-tl'
          : dx >= 0 && dy < 0
            ? 'step-tr'
            : dx < 0 && dy >= 0
              ? 'step-bl'
              : 'step-br',
      );
    case 'wing-courtyard':
      return pickIfValid(
        Math.abs(dx) >= Math.abs(dy)
          ? dx < 0
            ? 'wing-bend-l'
            : 'wing-bend-r'
          : dy < 0
            ? 'u-court-t'
            : 'u-court-b',
      );
    default:
      return famVariants[0];
  }
}

export function isTrapezoidUnitMode(
  mode: UnitShapeMode | null | undefined,
): mode is Exclude<UnitShapeMode, 'rect' | 'circle'> {
  return Boolean(mode && mode !== 'rect' && mode !== 'circle' && VALID_UNIT_SHAPE_MODES.has(mode));
}

function sanitizeNormPolygon(
  rawPts: ReadonlyArray<{ x: number; y: number }>,
): ReadonlyArray<{ x: number; y: number }> {
  if (rawPts.length < 3) return rawPts;

  // 1. Remove consecutive near-duplicate vertices
  let pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < rawPts.length; i++) {
    const p = rawPts[i];
    const prev = pts.length > 0 ? pts[pts.length - 1] : rawPts[rawPts.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 0.002) {
      pts.push(p);
    }
  }
  if (pts.length < 3) return rawPts;

  // 2. Prune accidental ultra-thin needle spikes (1-vertex A->B->C or 2-vertex sliver A->B1->B2->C)
  // left behind when dragging adjacent edges in CustomShapeEditor
  let changed = true;
  let guard = 0;
  while (changed && pts.length > 4 && guard < 8) {
    changed = false;
    guard++;
    for (let i = 0; i < pts.length; i++) {
      const n = pts.length;
      if (n <= 4) break;
      const pA = pts[(i - 1 + n) % n];
      const pB = pts[i];
      const pC = pts[(i + 1) % n];
      const baseAC = Math.hypot(pC.x - pA.x, pC.y - pA.y);
      const legAB = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      const legBC = Math.hypot(pC.x - pB.x, pC.y - pB.y);
      if (baseAC <= 0.065 && Math.min(legAB, legBC) > Math.max(0.04, baseAC * 1.6)) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
      if (n > 5) {
        const pB2 = pts[(i + 1) % n];
        const pD = pts[(i + 2) % n];
        const baseAD = Math.hypot(pD.x - pA.x, pD.y - pA.y);
        const tipSpan = Math.hypot(pB2.x - pB.x, pB2.y - pB.y);
        const leg1 = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        const leg2 = Math.hypot(pD.x - pB2.x, pD.y - pB2.y);
        if (
          baseAD <= 0.065 &&
          tipSpan <= 0.065 &&
          Math.min(leg1, leg2) > Math.max(0.04, Math.max(baseAD, tipSpan) * 1.6)
        ) {
          if (i + 1 < n) {
            pts.splice(i, 2);
          } else {
            pts.splice(i, 1);
            pts.splice(0, 1);
          }
          changed = true;
          break;
        }
      }
    }
  }

  // 3. Enforce clockwise winding in screen coordinates (x right, y down => signedArea > 0)
  let signedArea2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    signedArea2 += a.x * b.y - b.x * a.y;
  }
  if (signedArea2 < -1e-6) {
    pts = [...pts].reverse();
  }

  return pts;
}

function buildPolygonUnitGeometryFromNormPoints(
  rawNormPts: ReadonlyArray<{ x: number; y: number }>,
  wPx: number,
  hPx: number,
  cellPx: number,
  merge?: {
    topMerged: boolean;
    rightMerged: boolean;
    bottomMerged: boolean;
    leftMerged: boolean;
    topSegs: Array<[number, number]>;
    rightSegs: Array<[number, number]>;
    bottomSegs: Array<[number, number]>;
    leftSegs: Array<[number, number]>;
  } | null,
  labelOffsetXPx?: number,
  labelOffsetYPx?: number,
  facingEdge?: 'top' | 'right' | 'bottom' | 'left',
): TrapezoidUnitGeometry {
  const normPts = sanitizeNormPolygon(rawNormPts);
  const rimParts: string[] = [];
  const lipRightParts: string[] = [];
  const lipBottomParts: string[] = [];
  const wU = cellPx > 0 ? wPx / cellPx : 1;
  const hV = cellPx > 0 ? hPx / cellPx : 1;
  const M = normPts.length;

  for (let i = 0; i < M; i++) {
    const pA = normPts[i];
    const pB = normPts[(i + 1) % M];
    const x1 = pA.x * wPx;
    const y1 = pA.y * hPx;
    const x2 = pB.x * wPx;
    const y2 = pB.y * hPx;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.25) continue;

    // 1. Flush Top Edge (y = 0)
    if (pA.y <= 0.005 && pB.y <= 0.005) {
      if (merge?.topMerged) {
        const minU = Math.min(pA.x, pB.x) * wU;
        const maxU = Math.max(pA.x, pB.x) * wU;
        for (const [u1, u2] of merge.topSegs) {
          const a = Math.max(minU, u1);
          const b = Math.min(maxU, u2);
          if (b - a > 0.02) {
            rimParts.push(`M ${(a * cellPx).toFixed(1)} 0.5 L ${(b * cellPx).toFixed(1)} 0.5`);
          }
        }
      } else {
        rimParts.push(`M ${x1.toFixed(1)} 0.5 L ${x2.toFixed(1)} 0.5`);
      }
      continue;
    }

    // 2. Flush Left Edge (x = 0)
    if (pA.x <= 0.005 && pB.x <= 0.005) {
      if (merge?.leftMerged) {
        const minV = Math.min(pA.y, pB.y) * hV;
        const maxV = Math.max(pA.y, pB.y) * hV;
        for (const [v1, v2] of merge.leftSegs) {
          const a = Math.max(minV, v1);
          const b = Math.min(maxV, v2);
          if (b - a > 0.02) {
            rimParts.push(`M 0.5 ${(a * cellPx).toFixed(1)} L 0.5 ${(b * cellPx).toFixed(1)}`);
          }
        }
      } else {
        rimParts.push(`M 0.5 ${y1.toFixed(1)} L 0.5 ${y2.toFixed(1)}`);
      }
      continue;
    }

    // 3. Flush Right Edge (x = 1)
    if (pA.x >= 0.995 && pB.x >= 0.995) {
      if (merge?.rightMerged) {
        const minV = Math.min(pA.y, pB.y) * hV;
        const maxV = Math.max(pA.y, pB.y) * hV;
        for (const [v1, v2] of merge.rightSegs) {
          const a = Math.max(minV, v1);
          const b = Math.min(maxV, v2);
          if (b - a > 0.02) {
            lipRightParts.push(`M ${(wPx - 1).toFixed(1)} ${(a * cellPx).toFixed(1)} L ${(wPx - 1).toFixed(1)} ${(b * cellPx).toFixed(1)}`);
          }
        }
      } else {
        lipRightParts.push(`M ${(wPx - 1).toFixed(1)} ${y1.toFixed(1)} L ${(wPx - 1).toFixed(1)} ${y2.toFixed(1)}`);
      }
      continue;
    }

    // 4. Flush Bottom Edge (y = 1)
    if (pA.y >= 0.995 && pB.y >= 0.995) {
      if (merge?.bottomMerged) {
        const minU = Math.min(pA.x, pB.x) * wU;
        const maxU = Math.max(pA.x, pB.x) * wU;
        for (const [u1, u2] of merge.bottomSegs) {
          const a = Math.max(minU, u1);
          const b = Math.min(maxU, u2);
          if (b - a > 0.02) {
            lipBottomParts.push(`M ${(a * cellPx).toFixed(1)} ${(hPx - 1.5).toFixed(1)} L ${(b * cellPx).toFixed(1)} ${(hPx - 1.5).toFixed(1)}`);
          }
        }
      } else {
        lipBottomParts.push(`M ${x1.toFixed(1)} ${(hPx - 1.5).toFixed(1)} L ${x2.toFixed(1)} ${(hPx - 1.5).toFixed(1)}`);
      }
      continue;
    }

    // 5. Slanted, Chamfered, Curved, or Concave Notch Segment (Clockwise outward normal: (dy, -dx) / segLen)
    const nx = dy / segLen;
    const ny = -dx / segLen;
    if (ny > 0.38) {
      const ox = -1.2 * nx;
      const oy = -1.2 * ny;
      lipBottomParts.push(`M ${(x1 + ox).toFixed(1)} ${(y1 + oy).toFixed(1)} L ${(x2 + ox).toFixed(1)} ${(y2 + oy).toFixed(1)}`);
    } else if (nx > 0.38) {
      const ox = -0.8 * nx;
      const oy = -0.8 * ny;
      lipRightParts.push(`M ${(x1 + ox).toFixed(1)} ${(y1 + oy).toFixed(1)} L ${(x2 + ox).toFixed(1)} ${(y2 + oy).toFixed(1)}`);
    } else {
      const ox = -0.5 * nx;
      const oy = -0.5 * ny;
      rimParts.push(`M ${(x1 + ox).toFixed(1)} ${(y1 + oy).toFixed(1)} L ${(x2 + ox).toFixed(1)} ${(y2 + oy).toFixed(1)}`);
    }
  }

  const clipPath = `polygon(${normPts.map((p) => `${(p.x * 100).toFixed(2)}% ${(p.y * 100).toFixed(2)}%`).join(', ')})`;
  const fillPoints = normPts.map((p) => `${(p.x * wPx).toFixed(1)},${(p.y * hPx).toFixed(1)}`).join(' ');

  return {
    clipPath,
    fillPoints,
    rimPath: rimParts.join(' '),
    lipRightPath: lipRightParts.join(' '),
    lipBottomPath: lipBottomParts.join(' '),
    ...(facingEdge ? { facingEdge } : {}),
    ...(labelOffsetXPx ? { labelOffsetXPx } : {}),
    ...(labelOffsetYPx ? { labelOffsetYPx } : {}),
  };
}

/** Walkway width kept between a Kiosk / circular landmark and the units that wrap around it (in grid cells). */
export const KIOSK_AISLE_CELLS = 1;

/** True when the tile is a circular Kiosk / landmark that other units can wrap around. */
export function isKioskCircleTile(
  c: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number },
): boolean {
  return isCircleRingCorridor(c);
}

/** Nearest circular Kiosk (within `maxGap` cells) whose centre lies outside the tile - used for concentric hugging. */
function findHuggedCircle(
  tile: { key?: string; x: number; y: number; w: number; h: number; angle?: number } | null | undefined,
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }> | null | undefined,
  maxGap = 6,
): { cx: number; cy: number; rx: number; ry: number } | null {
  if (!tile || !allItems || tile.angle) return null;
  let best: { k: { x: number; y: number; w: number; h: number }; gap: number } | null = null;
  for (const k of allItems) {
    if (k === (tile as unknown) || (tile.key && k.key === tile.key)) continue;
    if (!isCircleRingCorridor(k)) continue;
    const kcx = k.x + k.w * 0.5;
    const kcy = k.y + k.h * 0.5;
    if (kcx > tile.x && kcx < tile.x + tile.w && kcy > tile.y && kcy < tile.y + tile.h) continue;
    const gapX = Math.max(0, tile.x - (k.x + k.w), k.x - (tile.x + tile.w));
    const gapY = Math.max(0, tile.y - (k.y + k.h), k.y - (tile.y + tile.h));
    const gap = Math.hypot(gapX, gapY);
    if (gap > maxGap) continue;
    if (!best || gap < best.gap) best = { k, gap };
  }
  if (!best) return null;
  const { k } = best;
  return {
    cx: k.x + k.w * 0.5,
    cy: k.y + k.h * 0.5,
    rx: k.w * 0.5 + KIOSK_AISLE_CELLS,
    ry: k.h * 0.5 + KIOSK_AISLE_CELLS,
  };
}

/**
 * Trims a tile outline so it keeps a constant aisle around an ellipse (concentric with the Kiosk). Points that fall
 * inside the ellipse are pushed radially onto its edge. Returns null when nothing is trimmed or too much would be.
 */
function fitPolygonAroundEllipse(
  base: ReadonlyArray<{ x: number; y: number }>,
  tile: { x: number; y: number; w: number; h: number },
  ell: { cx: number; cy: number; rx: number; ry: number },
): Array<{ x: number; y: number }> | null {
  const dense: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < base.length; i++) {
    const a = base[i];
    const b = base[(i + 1) % base.length];
    const len = Math.hypot((b.x - a.x) * tile.w, (b.y - a.y) * tile.h);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let s = 0; s < steps; s++) {
      dense.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    }
  }
  let moved = 0;
  const out = dense.map((p) => {
    const nx = (tile.x + p.x * tile.w - ell.cx) / ell.rx;
    const ny = (tile.y + p.y * tile.h - ell.cy) / ell.ry;
    const d = Math.hypot(nx, ny);
    if (d >= 1 - 1e-6) return p;
    moved += 1;
    const k = d < 1e-6 ? 0 : 1 / d;
    const bx = ell.cx + nx * k * ell.rx;
    const by = ell.cy + ny * k * ell.ry;
    return {
      x: Math.max(0, Math.min(1, (bx - tile.x) / tile.w)),
      y: Math.max(0, Math.min(1, (by - tile.y) / tile.h)),
    };
  });
  if (moved === 0) return null;
  const deduped = out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length];
    return Math.abs(p.x - q.x) > 1e-4 || Math.abs(p.y - q.y) > 1e-4;
  });
  if (deduped.length < 3) return null;
  let area = 0;
  for (let i = 0; i < deduped.length; i++) {
    const a = deduped[i];
    const b = deduped[(i + 1) % deduped.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2) < 0.3 ? null : deduped;
}

/**
 * "Wrap Kiosk": gives every nearby unit a Concave Notch facing the Kiosk. The notch outline then trims itself
 * concentrically around the Kiosk (see `fitPolygonAroundEllipse`). Returns the updated items and how many changed.
 */
export function wrapKioskNotches(
  items: ReadonlyArray<MapItem>,
  kioskKey: string,
  maxGap = 5.5,
): { items: MapItem[]; count: number } {
  const k = items.find((i) => i.key === kioskKey);
  if (!k) return { items: [...items], count: 0 };
  const kcx = k.x + k.w * 0.5;
  const kcy = k.y + k.h * 0.5;
  let count = 0;
  const next = items.map((u) => {
    if (u.key === k.key || u.kind !== 'unit' || u.angle) return u;
    const mode = parseUnitShapeMode(u);
    if (mode === 'circle' || mode === 'custom' || mode === 'ring-curve' || mode === 'trapezoid-ring' || mode.startsWith('arch-')) {
      return u;
    }
    const gapX = Math.max(0, u.x - (k.x + k.w), k.x - (u.x + u.w));
    const gapY = Math.max(0, u.y - (k.y + k.h), k.y - (u.y + u.h));
    if (Math.hypot(gapX, gapY) > maxGap) return u;
    const ovX = Math.min(u.x + u.w, k.x + k.w) - Math.max(u.x, k.x);
    const ovY = Math.min(u.y + u.h, k.y + k.h) - Math.max(u.y, k.y);
    if (ovX > u.w * 0.75 || ovY > u.h * 0.75) return u;
    const ucx = u.x + u.w * 0.5;
    const ucy = u.y + u.h * 0.5;
    const corner = kcx < ucx && kcy < ucy ? 'tl' : kcx >= ucx && kcy < ucy ? 'tr' : kcx < ucx && kcy >= ucy ? 'bl' : 'br';
    count += 1;
    return { ...u, label: `unit:notch-${corner}` };
  });
  return { items: next, count };
}

export function getTrapezoidUnitGeometry(
  mode: Exclude<UnitShapeMode, 'rect' | 'circle'>,
  wPx: number,
  hPx: number,
  cellPx = 20,
  merge?: {
    hasMerge: boolean;
    topMerged: boolean;
    rightMerged: boolean;
    bottomMerged: boolean;
    leftMerged: boolean;
    siblingTopMerged?: boolean;
    siblingRightMerged?: boolean;
    siblingBottomMerged?: boolean;
    siblingLeftMerged?: boolean;
    topSegs: Array<[number, number]>;
    rightSegs: Array<[number, number]>;
    bottomSegs: Array<[number, number]>;
    leftSegs: Array<[number, number]>;
    groupBounds?: { minX: number; minY: number; spanW: number; spanH: number };
  } | null,
  tile?: { key?: string; kind?: TileKind | string; label?: string | null; unitId?: string | null; x: number; y: number; w: number; h: number; angle?: number } | null,
  allItems?: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; unitId?: string | null; x: number; y: number; w: number; h: number; angle?: number }> | null,
): TrapezoidUnitGeometry {
  const sTop = merge?.siblingTopMerged ?? false;
  const sRight = merge?.siblingRightMerged ?? false;
  const sBottom = merge?.siblingBottomMerged ?? false;
  const sLeft = merge?.siblingLeftMerged ?? false;

  // ── 0. Free-hand custom polygon (points stored in the tile label) ──
  if (mode === 'custom') {
    const customPts = decodeCustomShape(tile?.label);
    if (customPts) {
      const labelShift = customShapeLabelOffsetPx(customPts, wPx, hPx);
      return buildPolygonUnitGeometryFromNormPoints(
        customPts.map(([x, y]) => ({ x: x / 100, y: y / 100 })),
        wPx,
        hPx,
        cellPx,
        merge,
        labelShift?.x,
        labelShift?.y,
      );
    }
  }

  // ── 1. Slanted Top / Bottom Edge with Vertical Left & Right Walls (Right Trapezoids) ──
  if (mode === 'slope-b-l' || mode === 'slope-b-r' || mode === 'slope-t-l' || mode === 'slope-t-r') {
    let tL = 0;
    let tR = 1;
    let chainCount = 1;
    let minY = tile ? tile.y : 0;
    let maxY = tile ? tile.y + tile.h : 1;

    if (tile && allItems && !tile.angle) {
      const sameModeUnits = allItems.filter(
        (u) => u.kind === 'unit' && !u.angle && parseUnitShapeMode(u) === mode,
      );
      const chain: Array<{ key?: string; x: number; y: number; w: number; h: number }> = [tile];
      const visited = new Set<string>([tile.key ?? `${tile.x},${tile.y}`]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const cand of sameModeUnits) {
          const cKey = cand.key ?? `${cand.x},${cand.y}`;
          if (visited.has(cKey)) continue;
          const touchesChain = chain.some((member) => {
            const touchHoriz =
              Math.abs(member.x + member.w - cand.x) <= 0.05 ||
              Math.abs(cand.x + cand.w - member.x) <= 0.05;
            if (!touchHoriz) return false;
            const vOv = Math.min(member.y + member.h, cand.y + cand.h) - Math.max(member.y, cand.y);
            return vOv >= 1;
          });
          if (touchesChain) {
            visited.add(cKey);
            chain.push(cand);
            grew = true;
          }
        }
      }
      chainCount = chain.length;
      if (chainCount > 1) {
        const minX = Math.min(...chain.map((u) => u.x));
        const maxX = Math.max(...chain.map((u) => u.x + u.w));
        minY = Math.min(...chain.map((u) => u.y));
        maxY = Math.max(...chain.map((u) => u.y + u.h));
        const spanW = Math.max(1, maxX - minX);
        tL = Math.max(0, Math.min(1, (tile.x - minX) / spanW));
        tR = Math.max(0, Math.min(1, (tile.x + tile.w - minX) / spanW));
      }
    }

    const slopeAmt = chainCount > 1 ? 0.42 : 0.34;
    const spanH = Math.max(1, maxY - minY);
    const tileY = tile ? tile.y : 0;
    const tileH = Math.max(1, tile ? tile.h : 1);

    if (mode === 'slope-b-l') {
      const yWorld0 = minY + (1 - slopeAmt) * spanH;
      const yWorld1 = maxY;
      const yL =
        chainCount > 1
          ? Math.max(0.18, Math.min(1, (yWorld0 + (yWorld1 - yWorld0) * tL - tileY) / tileH))
          : 1 - slopeAmt;
      const yR =
        chainCount > 1
          ? Math.max(0.18, Math.min(1, (yWorld0 + (yWorld1 - yWorld0) * tR - tileY) / tileH))
          : 1;
      const avgBot = 0.5 * (yL + yR);
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: yR },
          { x: 0, y: yL },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        Math.round(hPx * (0.5 * avgBot - 0.5)),
        'bottom',
      );
    }
    if (mode === 'slope-b-r') {
      const yWorld0 = maxY;
      const yWorld1 = minY + (1 - slopeAmt) * spanH;
      const yL =
        chainCount > 1
          ? Math.max(0.18, Math.min(1, (yWorld0 + (yWorld1 - yWorld0) * tL - tileY) / tileH))
          : 1;
      const yR =
        chainCount > 1
          ? Math.max(0.18, Math.min(1, (yWorld0 + (yWorld1 - yWorld0) * tR - tileY) / tileH))
          : 1 - slopeAmt;
      const avgBot = 0.5 * (yL + yR);
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: yR },
          { x: 0, y: yL },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        Math.round(hPx * (0.5 * avgBot - 0.5)),
        'bottom',
      );
    }
    if (mode === 'slope-t-l') {
      const yWorld0 = minY + slopeAmt * spanH;
      const yWorld1 = minY;
      const yL =
        chainCount > 1
          ? Math.max(0, Math.min(0.82, (yWorld0 + (yWorld1 - yWorld0) * tL - tileY) / tileH))
          : slopeAmt;
      const yR =
        chainCount > 1
          ? Math.max(0, Math.min(0.82, (yWorld0 + (yWorld1 - yWorld0) * tR - tileY) / tileH))
          : 0;
      const avgTop = 0.5 * (yL + yR);
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: yL },
          { x: 1, y: yR },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        Math.round(hPx * 0.5 * avgTop),
        'top',
      );
    }
    // slope-t-r
    const yWorld0 = minY;
    const yWorld1 = minY + slopeAmt * spanH;
    const yL =
      chainCount > 1
        ? Math.max(0, Math.min(0.82, (yWorld0 + (yWorld1 - yWorld0) * tL - tileY) / tileH))
        : 0;
    const yR =
      chainCount > 1
        ? Math.max(0, Math.min(0.82, (yWorld0 + (yWorld1 - yWorld0) * tR - tileY) / tileH))
        : slopeAmt;
    const avgTop = 0.5 * (yL + yR);
    return buildPolygonUnitGeometryFromNormPoints(
      [
        { x: 0, y: yL },
        { x: 1, y: yR },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      wPx,
      hPx,
      cellPx,
      merge,
      0,
      Math.round(hPx * 0.5 * avgTop),
      'top',
    );
  }

  // ── 1b. Slanted Left / Right Side Wall with Horizontal Top & Bottom Edges ──
  if (mode === 'slope-l-t' || mode === 'slope-l-b' || mode === 'slope-r-t' || mode === 'slope-r-b') {
    const cutPx = Math.min(wPx * 0.45, hPx * 0.75);
    const sx = Math.max(0.24, Math.min(0.48, cutPx / Math.max(1, wPx)));
    if (mode === 'slope-l-t') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: sx, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * sx * 0.25),
        0,
        'left',
      );
    }
    if (mode === 'slope-l-b') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: sx, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * sx * 0.25),
        0,
        'left',
      );
    }
    if (mode === 'slope-r-t') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1 - sx, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * sx * 0.25),
        0,
        'right',
      );
    }
    // slope-r-b
    return buildPolygonUnitGeometryFromNormPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1 - sx, y: 1 },
        { x: 0, y: 1 },
      ],
      wPx,
      hPx,
      cellPx,
      merge,
      -Math.round(wPx * sx * 0.25),
      0,
      'right',
    );
  }

  // ── 1c. Pointed / Double-Chamfered Island Ends (Bevel Left / Right / Top / Bottom) ──
  if (mode === 'bevel-l' || mode === 'bevel-r' || mode === 'bevel-t' || mode === 'bevel-b') {
    const bx = Math.max(0.24, Math.min(0.46, (hPx * 0.5) / Math.max(1, wPx)));
    const by = Math.max(0.24, Math.min(0.46, (wPx * 0.5) / Math.max(1, hPx)));
    if (mode === 'bevel-l') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: bx, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: bx, y: 1 },
          { x: 0, y: 0.5 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * bx * 0.22),
        0,
      );
    }
    if (mode === 'bevel-r') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1 - bx, y: 0 },
          { x: 1, y: 0.5 },
          { x: 1 - bx, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * bx * 0.22),
        0,
      );
    }
    if (mode === 'bevel-t') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0.5, y: 0 },
          { x: 1, y: by },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
          { x: 0, y: by },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        Math.round(hPx * by * 0.22),
      );
    }
    // bevel-b
    return buildPolygonUnitGeometryFromNormPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 - by },
        { x: 0.5, y: 1 },
        { x: 0, y: 1 - by },
      ],
      wPx,
      hPx,
      cellPx,
      merge,
      0,
      -Math.round(hPx * by * 0.22),
    );
  }

  // ── 2. 45° Cut Corner (Chamfer) ──
  if (mode === 'chamfer-tr' || mode === 'chamfer-tl' || mode === 'chamfer-br' || mode === 'chamfer-bl') {
    const cutPx = Math.min(wPx, hPx) * 0.42;
    const cx = Math.max(0.18, Math.min(0.48, cutPx / Math.max(1, wPx)));
    const cy = Math.max(0.18, Math.min(0.48, cutPx / Math.max(1, hPx)));
    if (mode === 'chamfer-tr') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1 - cx, y: 0 },
          { x: 1, y: cy },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
      );
    }
    if (mode === 'chamfer-tl') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: cx, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
          { x: 0, y: cy },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
      );
    }
    if (mode === 'chamfer-br') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 - cy },
          { x: 1 - cx, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
      );
    }
    // chamfer-bl
    return buildPolygonUnitGeometryFromNormPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: cx, y: 1 },
        { x: 0, y: 1 - cy },
      ],
      wPx,
      hPx,
      cellPx,
      merge,
    );
  }

  // ── 3. Curved Outer Corner ──
  if (mode === 'curve-bl' || mode === 'curve-br' || mode === 'curve-tl' || mode === 'curve-tr') {
    const rPx = Math.min(wPx, hPx) * 0.54;
    const rx = Math.max(0.24, Math.min(0.62, rPx / Math.max(1, wPx)));
    const ry = Math.max(0.24, Math.min(0.62, rPx / Math.max(1, hPx)));
    const K = 14;
    const pts: Array<{ x: number; y: number }> = [];

    if (mode === 'curve-bl') {
      pts.push({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 });
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        pts.push({ x: rx - rx * Math.sin(th), y: 1 - ry + ry * Math.cos(th) });
      }
    } else if (mode === 'curve-br') {
      pts.push({ x: 0, y: 0 }, { x: 1, y: 0 });
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        pts.push({ x: 1 - rx + rx * Math.cos(th), y: 1 - ry + ry * Math.sin(th) });
      }
      pts.push({ x: 0, y: 1 });
    } else if (mode === 'curve-tl') {
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        pts.push({ x: rx - rx * Math.cos(th), y: ry - ry * Math.sin(th) });
      }
      pts.push({ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 });
    } else {
      // curve-tr
      pts.push({ x: 0, y: 0 });
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        pts.push({ x: 1 - rx + rx * Math.sin(th), y: ry - ry * Math.cos(th) });
      }
      pts.push({ x: 1, y: 1 }, { x: 0, y: 1 });
    }
    return buildPolygonUnitGeometryFromNormPoints(pts, wPx, hPx, cellPx, merge);
  }

  // ── 4. Concave Circular Cutout (Notch) & Kiosk Notch + Outer Chamfer Combos ──
  if (
    mode === 'notch-tl' ||
    mode === 'notch-tr' ||
    mode === 'notch-bl' ||
    mode === 'notch-br' ||
    mode === 'notch-br-chamfer-tl' ||
    mode === 'notch-tr-chamfer-bl' ||
    mode === 'notch-bl-chamfer-tr' ||
    mode === 'notch-tl-chamfer-br'
  ) {
    const arcR = Math.min(0.95, Math.max(0.3, parseShapeRadius(tile?.label) ?? 0.68));
    const rx = arcR;
    const ry = arcR;
    const cutPx = Math.min(wPx, hPx) * 0.42;
    const cx = Math.max(0.22, Math.min(0.46, cutPx / Math.max(1, wPx)));
    const cy = Math.max(0.22, Math.min(0.46, cutPx / Math.max(1, hPx)));
    const K = 24;
    const pts: Array<{ x: number; y: number }> = [];

    // Constant-aisle hugging: when a Kiosk sits right next to this tile, trim the plain outline concentrically around it.
    const hugEllipse = findHuggedCircle(tile, allItems);
    if (hugEllipse && tile) {
      const baseOutline: Array<{ x: number; y: number }> =
        mode === 'notch-br-chamfer-tl'
          ? [{ x: cx, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: cy }]
          : mode === 'notch-tl-chamfer-br'
            ? [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 - cy }, { x: 1 - cx, y: 1 }, { x: 0, y: 1 }]
            : mode === 'notch-tr-chamfer-bl'
              ? [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: cx, y: 1 }, { x: 0, y: 1 - cy }]
              : mode === 'notch-bl-chamfer-tr'
                ? [{ x: 0, y: 0 }, { x: 1 - cx, y: 0 }, { x: 1, y: cy }, { x: 1, y: 1 }, { x: 0, y: 1 }]
                : [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      const fitted = fitPolygonAroundEllipse(baseOutline, tile, hugEllipse);
      if (fitted) {
        const isLeft = mode.startsWith('notch-tl') || mode.startsWith('notch-bl');
        const isTop = mode.startsWith('notch-tl') || mode.startsWith('notch-tr');
        return buildPolygonUnitGeometryFromNormPoints(
          fitted,
          wPx,
          hPx,
          cellPx,
          merge,
          Math.round(wPx * 0.08) * (isLeft ? 1 : -1),
          Math.round(hPx * 0.08) * (isTop ? 1 : -1),
        );
      }
    }

    if (mode === 'notch-tl' || mode === 'notch-tl-chamfer-br') {
      for (let k = 0; k <= K; k++) {
        const th = (Math.PI * 0.5) * (1 - k / K);
        pts.push({ x: rx * Math.cos(th), y: ry * Math.sin(th) });
      }
      pts.push({ x: 1, y: 0 });
      if (mode === 'notch-tl-chamfer-br') {
        pts.push({ x: 1, y: 1 - cy }, { x: 1 - cx, y: 1 });
      } else {
        pts.push({ x: 1, y: 1 });
      }
      pts.push({ x: 0, y: 1 });
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.08),
        Math.round(hPx * 0.08),
      );
    }
    if (mode === 'notch-tr' || mode === 'notch-tr-chamfer-bl') {
      pts.push({ x: 0, y: 0 });
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        pts.push({ x: 1 - rx * Math.cos(th), y: ry * Math.sin(th) });
      }
      pts.push({ x: 1, y: 1 });
      if (mode === 'notch-tr-chamfer-bl') {
        pts.push({ x: cx, y: 1 }, { x: 0, y: 1 - cy });
      } else {
        pts.push({ x: 0, y: 1 });
      }
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.08),
        Math.round(hPx * 0.08),
      );
    }
    if (mode === 'notch-br' || mode === 'notch-br-chamfer-tl') {
      if (mode === 'notch-br-chamfer-tl') {
        pts.push({ x: cx, y: 0 }, { x: 1, y: 0 });
      } else {
        pts.push({ x: 0, y: 0 }, { x: 1, y: 0 });
      }
      for (let k = 0; k <= K; k++) {
        const th = (Math.PI * 0.5) * (1 - k / K);
        pts.push({ x: 1 - rx * Math.cos(th), y: 1 - ry * Math.sin(th) });
      }
      pts.push({ x: 0, y: 1 });
      if (mode === 'notch-br-chamfer-tl') {
        pts.push({ x: 0, y: cy });
      }
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.08),
        -Math.round(hPx * 0.08),
      );
    }
    // notch-bl or notch-bl-chamfer-tr
    pts.push({ x: 0, y: 0 });
    if (mode === 'notch-bl-chamfer-tr') {
      pts.push({ x: 1 - cx, y: 0 }, { x: 1, y: cy }, { x: 1, y: 1 });
    } else {
      pts.push({ x: 1, y: 0 }, { x: 1, y: 1 });
    }
    for (let k = 0; k <= K; k++) {
      const th = (k / K) * (Math.PI * 0.5);
      pts.push({ x: rx * Math.cos(th), y: 1 - ry * Math.sin(th) });
    }
    return buildPolygonUnitGeometryFromNormPoints(
      pts,
      wPx,
      hPx,
      cellPx,
      merge,
      Math.round(wPx * 0.08),
      -Math.round(hPx * 0.08),
    );
  }

  // ── 5. Inner Crescent / Concave Arc (Atrium-Hugging Side Curve) ──
  if (mode === 'crescent-l' || mode === 'crescent-r' || mode === 'crescent-t' || mode === 'crescent-b') {
    const K = 18;
    const isVertChain = mode === 'crescent-l' || mode === 'crescent-r';
    let t0 = 0;
    let t1 = 1;
    let depth = 0.34;

    if (tile && allItems && !tile.angle) {
      const sameModeUnits = allItems.filter(
        (u) => u.kind === 'unit' && !u.angle && parseUnitShapeMode(u, allItems) === mode,
      );
      const chain: Array<{ key?: string; x: number; y: number; w: number; h: number }> = [tile];
      const visited = new Set<string>([tile.key ?? `${tile.x},${tile.y}`]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const cand of sameModeUnits) {
          const cKey = cand.key ?? `${cand.x},${cand.y}`;
          if (visited.has(cKey)) continue;
          const touchesChain = chain.some((member) => {
            if (isVertChain) {
              const touchVert =
                Math.abs(member.y + member.h - cand.y) <= 0.05 ||
                Math.abs(cand.y + cand.h - member.y) <= 0.05;
              if (!touchVert) return false;
              const hOv = Math.min(member.x + member.w, cand.x + cand.w) - Math.max(member.x, cand.x);
              return hOv >= 1;
            }
            const touchHoriz =
              Math.abs(member.x + member.w - cand.x) <= 0.05 ||
              Math.abs(cand.x + cand.w - member.x) <= 0.05;
            if (!touchHoriz) return false;
            const vOv = Math.min(member.y + member.h, cand.y + cand.h) - Math.max(member.y, cand.y);
            return vOv >= 1;
          });
          if (touchesChain) {
            visited.add(cKey);
            chain.push(cand);
            grew = true;
          }
        }
      }
      if (chain.length > 1) {
        depth = 0.38;
        if (isVertChain) {
          const minY = Math.min(...chain.map((u) => u.y));
          const maxY = Math.max(...chain.map((u) => u.y + u.h));
          const spanH = Math.max(1, maxY - minY);
          t0 = Math.max(0, Math.min(1, (tile.y - minY) / spanH));
          t1 = Math.max(0, Math.min(1, (tile.y + tile.h - minY) / spanH));
        } else {
          const minX = Math.min(...chain.map((u) => u.x));
          const maxX = Math.max(...chain.map((u) => u.x + u.w));
          const spanW = Math.max(1, maxX - minX);
          t0 = Math.max(0, Math.min(1, (tile.x - minX) / spanW));
          t1 = Math.max(0, Math.min(1, (tile.x + tile.w - minX) / spanW));
        }
      }
    }

    const pts: Array<{ x: number; y: number }> = [];
    if (mode === 'crescent-l') {
      pts.push({ x: 1, y: 0 }, { x: 1, y: 1 });
      for (let k = 0; k <= K; k++) {
        const localT = 1 - k / K;
        const gT = t0 + localT * (t1 - t0);
        const u = 2 * gT - 1;
        pts.push({ x: depth * (1 - u * u), y: localT });
      }
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.12),
        0,
        'left',
      );
    }
    if (mode === 'crescent-r') {
      pts.push({ x: 0, y: 0 });
      for (let k = 0; k <= K; k++) {
        const localT = k / K;
        const gT = t0 + localT * (t1 - t0);
        const u = 2 * gT - 1;
        pts.push({ x: 1 - depth * (1 - u * u), y: localT });
      }
      pts.push({ x: 0, y: 1 });
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.12),
        0,
        'right',
      );
    }
    if (mode === 'crescent-t') {
      for (let k = 0; k <= K; k++) {
        const localT = k / K;
        const gT = t0 + localT * (t1 - t0);
        const u = 2 * gT - 1;
        pts.push({ x: localT, y: depth * (1 - u * u) });
      }
      pts.push({ x: 1, y: 1 }, { x: 0, y: 1 });
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        Math.round(hPx * 0.12),
        'top',
      );
    }
    // crescent-b
    pts.push({ x: 0, y: 0 }, { x: 1, y: 0 });
    for (let k = 0; k <= K; k++) {
      const localT = 1 - k / K;
      const gT = t0 + localT * (t1 - t0);
      const u = 2 * gT - 1;
      pts.push({ x: localT, y: 1 - depth * (1 - u * u) });
    }
    return buildPolygonUnitGeometryFromNormPoints(
      pts,
      wPx,
      hPx,
      cellPx,
      merge,
      0,
      -Math.round(hPx * 0.12),
      'bottom',
    );
  }

  // ── 6. Pie-Wedge & Triangle Kiosk ──
  if (mode === 'pie-wedge' || mode === 'wedge-tl' || mode === 'wedge-tr' || mode === 'wedge-bl' || mode === 'wedge-br') {
    if (mode === 'pie-wedge') {
      const K = 18;
      const pts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= K; k++) {
        const t = k / K;
        const u = 2 * t - 1;
        pts.push({ x: t, y: 0.24 * u * u });
      }
      pts.push({ x: 0.62, y: 1 }, { x: 0.38, y: 1 });
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        -Math.round(hPx * 0.10),
        'bottom',
      );
    }
    if (mode === 'wedge-tl') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 0.18 },
          { x: 0.18, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.12),
        -Math.round(hPx * 0.12),
      );
    }
    if (mode === 'wedge-tr') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0.82, y: 1 },
          { x: 0, y: 0.18 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.12),
        -Math.round(hPx * 0.12),
      );
    }
    if (mode === 'wedge-bl') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 0.18, y: 0 },
          { x: 1, y: 0.82 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.12),
        Math.round(hPx * 0.12),
      );
    }
    // wedge-br
    return buildPolygonUnitGeometryFromNormPoints(
      [
        { x: 0.82, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0.82 },
      ],
      wPx,
      hPx,
      cellPx,
      merge,
      Math.round(wPx * 0.12),
      Math.round(hPx * 0.12),
    );
  }

  // ── 7. Stepped & Multi-Notch (Alcove) ──
  if (
    mode === 'step-tl' ||
    mode === 'step-tr' ||
    mode === 'step-bl' ||
    mode === 'step-br' ||
    mode === 'step-t-mid' ||
    mode === 'step-b-mid'
  ) {
    if (mode === 'step-tl') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0.38, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
          { x: 0, y: 0.42 },
          { x: 0.38, y: 0.42 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.08),
        Math.round(hPx * 0.08),
      );
    }
    if (mode === 'step-tr') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 0.62, y: 0 },
          { x: 0.62, y: 0.42 },
          { x: 1, y: 0.42 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.08),
        Math.round(hPx * 0.08),
      );
    }
    if (mode === 'step-bl') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0.38, y: 1 },
          { x: 0.38, y: 0.58 },
          { x: 0, y: 0.58 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.08),
        -Math.round(hPx * 0.08),
      );
    }
    if (mode === 'step-br') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 0.58 },
          { x: 0.62, y: 0.58 },
          { x: 0.62, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.08),
        -Math.round(hPx * 0.08),
      );
    }
    if (mode === 'step-t-mid') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 0.30, y: 0 },
          { x: 0.30, y: 0.34 },
          { x: 0.70, y: 0.34 },
          { x: 0.70, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        Math.round(hPx * 0.12),
      );
    }
    // step-b-mid
    return buildPolygonUnitGeometryFromNormPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0.70, y: 1 },
        { x: 0.70, y: 0.66 },
        { x: 0.30, y: 0.66 },
        { x: 0.30, y: 1 },
        { x: 0, y: 1 },
      ],
      wPx,
      hPx,
      cellPx,
      merge,
      0,
      -Math.round(hPx * 0.12),
    );
  }

  // ── 8. Double-Wing & Corner-Bend ──
  if (mode === 'wing-bend-l' || mode === 'wing-bend-r' || mode === 'u-court-t' || mode === 'u-court-b') {
    if (mode === 'wing-bend-l') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0.28, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 0.54 },
          { x: 0.56, y: 0.54 },
          { x: 0.38, y: 1 },
          { x: 0, y: 1 },
          { x: 0, y: 0.36 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.04),
        -Math.round(hPx * 0.06),
      );
    }
    if (mode === 'wing-bend-r') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 0.72, y: 0 },
          { x: 1, y: 0.36 },
          { x: 1, y: 1 },
          { x: 0.62, y: 1 },
          { x: 0.44, y: 0.54 },
          { x: 0, y: 0.54 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.04),
        -Math.round(hPx * 0.06),
      );
    }
    if (mode === 'u-court-t') {
      return buildPolygonUnitGeometryFromNormPoints(
        [
          { x: 0, y: 0 },
          { x: 0.28, y: 0 },
          { x: 0.28, y: 0.50 },
          { x: 0.72, y: 0.50 },
          { x: 0.72, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        Math.round(hPx * 0.18),
      );
    }
    // u-court-b
    return buildPolygonUnitGeometryFromNormPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0.72, y: 1 },
        { x: 0.72, y: 0.50 },
        { x: 0.28, y: 0.50 },
        { x: 0.28, y: 1 },
        { x: 0, y: 1 },
      ],
      wPx,
      hPx,
      cellPx,
      merge,
      0,
      -Math.round(hPx * 0.18),
    );
  }

  // ── 9. Outer Ring Concave Wing (arch-tl / arch-tr / arch-bl / arch-br) ──
  if (mode === 'arch-tl' || mode === 'arch-tr' || mode === 'arch-bl' || mode === 'arch-br') {
    const K = 24;
    const archR = Math.min(0.95, Math.max(0.3, parseShapeRadius(tile?.label) ?? 0.68));
    const archMaxU = Math.min(1, archR + 0.1);
    const archMinU = Math.max(0, 1 - archR - 0.1);
    const match = tile && allItems ? findNearestCircleCorridorForUnit(tile, allItems) : null;
    let maxRingH = 0;
    if (match && allItems) {
      for (const o of allItems) {
        if (o.kind !== 'unit' || !isRingSectorUnitLabel(o.label)) continue;
        const m = findNearestCircleCorridorForUnit(o, [match.ring]);
        if (m && m.isNear) {
          maxRingH = Math.max(maxRingH, o.h);
        }
      }
    }
    const rxCut = match ? match.rxOut + maxRingH + 0.24 : 0;
    const ryCut = match ? match.ryOut + maxRingH + 0.24 : 0;

    const clampArcPt = (
      u0: number,
      v0: number,
      minU: number,
      maxU: number,
      isRightWing: boolean,
    ): { x: number; y: number } => {
      let u = u0;
      if (tile && match && maxRingH > 0 && rxCut > 1 && ryCut > 1) {
        const wy = tile.y + v0 * tile.h;
        const dyNorm = (wy - match.cy) / ryCut;
        if (Math.abs(dyNorm) < 1.0) {
          const dxCut = rxCut * Math.sqrt(Math.max(0, 1 - dyNorm * dyNorm));
          const wxCircle = isRightWing ? match.cx + dxCut : match.cx - dxCut;
          const uCircle = (wxCircle - tile.x) / Math.max(1, tile.w);
          u = isRightWing ? Math.max(u0, uCircle) : Math.min(u0, uCircle);
        }
      }
      return {
        x: Math.max(minU, Math.min(maxU, u)),
        y: Math.max(0, Math.min(1, v0)),
      };
    };

    if (mode === 'arch-tl') {
      const arc: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        // Mirror of arch-tr: concave arc centred on the bottom-right corner.
        const u0 = 1 - archR * Math.cos(th);
        const v0 = 1 - Math.sin(th);
        arc.push(clampArcPt(u0, v0, archMinU, 1, false));
      }
      return buildPolygonUnitGeometryFromNormPoints(
        [{ x: 0, y: 0 }, { x: 0, y: 1 }, ...arc],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.18),
        -Math.round(hPx * 0.18),
      );
    }
    if (mode === 'arch-tr') {
      const arc: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        const u0 = archR * Math.cos(th);
        const v0 = 1 - Math.sin(th);
        arc.push(clampArcPt(u0, v0, 0, archMaxU, true));
      }
      return buildPolygonUnitGeometryFromNormPoints(
        [{ x: 1, y: 0 }, { x: 1, y: 1 }, ...arc],
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.18),
        -Math.round(hPx * 0.18),
      );
    }
    if (mode === 'arch-bl') {
      const arc: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        // Mirror of arch-br: concave arc centred on the top-right corner.
        const u0 = 1 - archR * Math.sin(th);
        const v0 = Math.cos(th);
        arc.push(clampArcPt(u0, v0, archMinU, 1, false));
      }
      return buildPolygonUnitGeometryFromNormPoints(
        [...arc, { x: 0, y: 0 }, { x: 0, y: 1 }],
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.18),
        Math.round(hPx * 0.18),
      );
    }
    // arch-br
    const arc: Array<{ x: number; y: number }> = [];
    for (let k = 0; k <= K; k++) {
      const th = (k / K) * (Math.PI * 0.5);
      const u0 = archR * Math.sin(th);
      const v0 = Math.cos(th);
      arc.push(clampArcPt(u0, v0, 0, archMaxU, true));
    }
    return buildPolygonUnitGeometryFromNormPoints(
      [...arc, { x: 1, y: 0 }, { x: 1, y: 1 }],
      wPx,
      hPx,
      cellPx,
      merge,
      Math.round(wPx * 0.18),
      Math.round(hPx * 0.18),
    );
  }

  if (mode === 'ring-curve' || mode === 'trapezoid-ring') {
    const it = tile ?? { x: 0, y: 0, w: Math.max(1, Math.round(wPx / Math.max(1, cellPx))), h: Math.max(1, Math.round(hPx / Math.max(1, cellPx))) };
    const isSiblingMerged = Boolean(sTop || sRight || sBottom || sLeft);
    const angleDeg = (it as { angle?: number }).angle ?? 0;
    const match = allItems ? findNearestCircleCorridorForUnit(it, allItems) : null;

    const ux = it.x + it.w * 0.5;
    const uy = it.y + it.h * 0.5;

    const cx = match && match.isNear ? match.cx : ux;
    const cy = match && match.isNear ? match.cy : it.y + it.h + Math.max(3, it.w * 0.75);
    const rxOut = match && match.isNear ? match.rxOut : Math.max(4, it.w * 0.85);
    const ryOut = match && match.isNear ? match.ryOut : rxOut;

    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const wDx = cx - ux;
    const wDy = cy - uy;
    const dx = wDx * cosA + wDy * sinA;
    const dy = -wDx * sinA + wDy * cosA;
    const ndx = dx / Math.max(1, rxOut);
    const ndy = dy / Math.max(1, ryOut);

    let facingEdge: 'top' | 'right' | 'bottom' | 'left';
    if (!match || !match.isNear) {
      facingEdge = 'bottom';
    } else if (it.w >= it.h || Boolean(angleDeg) || Math.abs(ndy) >= Math.abs(ndx)) {
      facingEdge = dy >= 0 ? 'bottom' : 'top';
      if (facingEdge === 'bottom' && sBottom && !sTop) facingEdge = 'top';
      else if (facingEdge === 'top' && sTop && !sBottom) facingEdge = 'bottom';
    } else {
      facingEdge = dx >= 0 ? 'right' : 'left';
      if (facingEdge === 'right' && sRight && !sLeft) facingEdge = 'left';
      else if (facingEdge === 'left' && sLeft && !sRight) facingEdge = 'right';
    }

    // True Fan / Ring Sector (convex outer arc + radial slanted sides + concave inner arc)
    // computed with exact annular sector polar geometry so adjacent sectors meet edge-to-edge with 0 gap and 0 overlap
    if (mode === 'ring-curve' && !isSiblingMerged) {
      const isVertFacing = facingEdge === 'left' || facingEdge === 'right';
      const parCells = isVertFacing ? it.h : it.w;
      const perpCells = isVertFacing ? it.w : it.h;
      const theta = match && match.isNear ? Math.atan2((uy - cy) / Math.max(1, ryOut), (ux - cx) / Math.max(1, rxOut)) : -Math.PI * 0.5;
      const rIn =
        match && match.isNear
          ? Math.hypot(rxOut * Math.cos(theta), ryOut * Math.sin(theta)) || (rxOut + ryOut) * 0.5
          : Math.max(5, parCells * 1.15);
      const arcMetrics = computeRingSectorArcMetrics(parCells, perpCells, rIn);
      const archDrop = arcMetrics.archDrop;
      const inTaper = arcMetrics.inTaper;
      const innerArchRise = arcMetrics.innerArchRise;
      const sinHalf = Math.sin(arcMetrics.halfAngle);
      const oneMinusCosHalf = Math.max(1e-5, 1 - Math.cos(arcMetrics.halfAngle));
      const N = 20;
      const canonicalPts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const u = 2 * t - 1;
        const sVal = u * sinHalf;
        const normSag = (1 - Math.sqrt(Math.max(0, 1 - sVal * sVal))) / oneMinusCosHalf;
        canonicalPts.push({ x: t, y: archDrop * normSag });
      }
      for (let k = N; k >= 0; k--) {
        const t = k / N;
        const u = 2 * t - 1;
        const sVal = u * sinHalf;
        const normSag = (1 - Math.sqrt(Math.max(0, 1 - sVal * sVal))) / oneMinusCosHalf;
        canonicalPts.push({
          x: inTaper + t * (1 - 2 * inTaper),
          y: 1 - innerArchRise * (1 - normSag),
        });
      }
      const orientedPts = canonicalPts.map((p) => {
        if (facingEdge === 'top') return { x: 1 - p.x, y: 1 - p.y };
        if (facingEdge === 'left') return { x: 1 - p.y, y: p.x };
        if (facingEdge === 'right') return { x: p.y, y: 1 - p.x };
        return p;
      });
      const labelOffX =
        facingEdge === 'left'
          ? Math.round(wPx * 0.04)
          : facingEdge === 'right'
            ? -Math.round(wPx * 0.04)
            : 0;
      const labelOffY =
        facingEdge === 'top'
          ? Math.round(hPx * 0.04)
          : facingEdge === 'bottom'
            ? -Math.round(hPx * 0.04)
            : 0;
      return buildPolygonUnitGeometryFromNormPoints(
        orientedPts,
        wPx,
        hPx,
        cellPx,
        merge,
        labelOffX,
        labelOffY,
        facingEdge,
      );
    }

    const taper = mode === 'trapezoid-ring' ? 0.18 : 0;
    const N = 18;
    const targetRx = rxOut;
    const targetRy = ryOut;
    const effWCells = cellPx > 0 ? wPx / cellPx : it.w;
    const effHCells = cellPx > 0 ? hPx / cellPx : it.h;

    const isHorizEdge = facingEdge === 'bottom' || facingEdge === 'top';
    const sMin = isHorizEdge
      ? !angleDeg && isSiblingMerged && merge?.groupBounds
        ? merge.groupBounds.minX - cx
        : (taper - 0.5) * it.w - dx
      : !angleDeg && isSiblingMerged && merge?.groupBounds
        ? merge.groupBounds.minY - cy
        : (taper - 0.5) * it.h - dy;
    const sMax = isHorizEdge
      ? !angleDeg && isSiblingMerged && merge?.groupBounds
        ? merge.groupBounds.minX + merge.groupBounds.spanW - cx
        : (1 - taper - 0.5) * it.w - dx
      : !angleDeg && isSiblingMerged && merge?.groupBounds
        ? merge.groupBounds.minY + merge.groupBounds.spanH - cy
        : (1 - taper - 0.5) * it.h - dy;

    const baseRPar = isHorizEdge ? targetRx : targetRy;
    const baseRPerp = isHorizEdge ? targetRy : targetRx;
    const maxAbsS = Math.max(Math.abs(sMin), Math.abs(sMax));
    const rPar = Math.max(baseRPar, maxAbsS * 1.04, 2.5);
    const rPerp = Math.max(2.0, baseRPerp * (rPar / Math.max(0.5, baseRPar)));
    const arcH = (sVal: number): number => {
      const clamped = Math.max(-rPar * 0.96, Math.min(rPar * 0.96, sVal));
      return Math.sqrt(Math.max(0, 1 - (clamped / rPar) ** 2)) * rPerp;
    };
    const baseH = Math.min(arcH(sMin), arcH(sMax));
    const sPeak = Math.max(sMin, Math.min(sMax, 0));
    const peakH = arcH(sPeak);
    const spanCells = Math.max(1e-4, peakH - baseH);
    const perpCells = isHorizEdge ? effHCells : effWCells;
    const maxDepthFrac = match
      ? Math.max(0.06, Math.min(0.48, spanCells / Math.max(1, perpCells)))
      : 0.28;

    const computeArchNorm = (t: number): number => {
      const u = taper + t * (1 - 2 * taper);
      const sVal = isHorizEdge ? (u - 0.5) * it.w - dx : (u - 0.5) * it.h - dy;
      return Math.max(0, Math.min(1, (arcH(sVal) - baseH) / spanCells));
    };

    const indentAt = (t: number): number => {
      const a = computeArchNorm(t);
      return a * maxDepthFrac;
    };

    const normPts: Array<{ x: number; y: number }> = [];
    const rimParts: string[] = [];
    const lipRightParts: string[] = [];
    const lipBottomParts: string[] = [];

    const toPx = (pt: { x: number; y: number }) => ({ x: pt.x * wPx, y: pt.y * hPx });
    const polyPath = (pts: Array<{ x: number; y: number }>, dxPx = 0, dyPx = 0) =>
      pts
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${(p.x * wPx + dxPx).toFixed(1)} ${(p.y * hPx + dyPx).toFixed(1)}`)
        .join(' ');

    if (facingEdge === 'bottom') {
      const tl = { x: 0, y: 0 };
      const tr = { x: 1, y: 0 };
      const curvePts: Array<{ x: number; y: number }> = [];
      for (let k = N; k >= 0; k--) {
        const t = k / N;
        curvePts.push({ x: taper + t * (1 - 2 * taper), y: 1 - indentAt(t) });
      }
      const br = curvePts[0];
      const bl = curvePts[curvePts.length - 1];
      normPts.push(tl, tr, ...curvePts);

      if (!merge?.topMerged) {
        const p1 = toPx(tl);
        const p2 = toPx(tr);
        rimParts.push(`M ${p1.x.toFixed(1)} ${(p1.y + 0.5).toFixed(1)} L ${p2.x.toFixed(1)} ${(p2.y + 0.5).toFixed(1)}`);
      }
      if (!merge?.leftMerged) {
        const p1 = toPx(bl);
        const p2 = toPx(tl);
        rimParts.push(`M ${(p1.x + 0.5).toFixed(1)} ${p1.y.toFixed(1)} L ${(p2.x + 0.5).toFixed(1)} ${p2.y.toFixed(1)}`);
      }
      if (!merge?.rightMerged) {
        const p1 = toPx(tr);
        const p2 = toPx(br);
        lipRightParts.push(`M ${(p1.x - 1).toFixed(1)} ${p1.y.toFixed(1)} L ${(p2.x - 1).toFixed(1)} ${p2.y.toFixed(1)}`);
      }
      lipBottomParts.push(polyPath(curvePts, 0, -1.5));
    } else if (facingEdge === 'top') {
      const curvePts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        curvePts.push({ x: taper + t * (1 - 2 * taper), y: indentAt(t) });
      }
      const tl = curvePts[0];
      const tr = curvePts[curvePts.length - 1];
      const br = { x: 1, y: 1 };
      const bl = { x: 0, y: 1 };
      normPts.push(...curvePts, br, bl);

      rimParts.push(polyPath(curvePts, 0, 0.5));
      if (!merge?.leftMerged) {
        const p1 = toPx(bl);
        const p2 = toPx(tl);
        rimParts.push(`M ${(p1.x + 0.5).toFixed(1)} ${p1.y.toFixed(1)} L ${(p2.x + 0.5).toFixed(1)} ${p2.y.toFixed(1)}`);
      }
      if (!merge?.rightMerged) {
        const p1 = toPx(tr);
        const p2 = toPx(br);
        lipRightParts.push(`M ${(p1.x - 1).toFixed(1)} ${p1.y.toFixed(1)} L ${(p2.x - 1).toFixed(1)} ${p2.y.toFixed(1)}`);
      }
      if (!merge?.bottomMerged) {
        const p1 = toPx(bl);
        const p2 = toPx(br);
        lipBottomParts.push(`M ${p1.x.toFixed(1)} ${(p1.y - 1.5).toFixed(1)} L ${p2.x.toFixed(1)} ${(p2.y - 1.5).toFixed(1)}`);
      }
    } else if (facingEdge === 'right') {
      const tl = { x: 0, y: 0 };
      const curvePts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        curvePts.push({ x: 1 - indentAt(t), y: taper + t * (1 - 2 * taper) });
      }
      const tr = curvePts[0];
      const br = curvePts[curvePts.length - 1];
      const bl = { x: 0, y: 1 };
      normPts.push(tl, ...curvePts, bl);

      if (!merge?.topMerged) {
        const p1 = toPx(tl);
        const p2 = toPx(tr);
        rimParts.push(`M ${p1.x.toFixed(1)} ${(p1.y + 0.5).toFixed(1)} L ${p2.x.toFixed(1)} ${(p2.y + 0.5).toFixed(1)}`);
      }
      if (!merge?.leftMerged) {
        const p1 = toPx(bl);
        const p2 = toPx(tl);
        rimParts.push(`M ${(p1.x + 0.5).toFixed(1)} ${p1.y.toFixed(1)} L ${(p2.x + 0.5).toFixed(1)} ${p2.y.toFixed(1)}`);
      }
      lipRightParts.push(polyPath(curvePts, -1, 0));
      if (!merge?.bottomMerged) {
        const p1 = toPx(bl);
        const p2 = toPx(br);
        lipBottomParts.push(`M ${p1.x.toFixed(1)} ${(p1.y - 1.5).toFixed(1)} L ${p2.x.toFixed(1)} ${(p2.y - 1.5).toFixed(1)}`);
      }
    } else {
      // facingEdge === 'left'
      const tr = { x: 1, y: 0 };
      const br = { x: 1, y: 1 };
      const curvePts: Array<{ x: number; y: number }> = [];
      for (let k = N; k >= 0; k--) {
        const t = k / N;
        curvePts.push({ x: indentAt(t), y: taper + t * (1 - 2 * taper) });
      }
      const bl = curvePts[0];
      const tl = curvePts[curvePts.length - 1];
      normPts.push(tr, br, ...curvePts);

      if (!merge?.topMerged) {
        const p1 = toPx(tl);
        const p2 = toPx(tr);
        rimParts.push(`M ${p1.x.toFixed(1)} ${(p1.y + 0.5).toFixed(1)} L ${p2.x.toFixed(1)} ${(p2.y + 0.5).toFixed(1)}`);
      }
      rimParts.push(polyPath(curvePts, 0.5, 0));
      if (!merge?.rightMerged) {
        const p1 = toPx(tr);
        const p2 = toPx(br);
        lipRightParts.push(`M ${(p1.x - 1).toFixed(1)} ${p1.y.toFixed(1)} L ${(p2.x - 1).toFixed(1)} ${p2.y.toFixed(1)}`);
      }
      if (!merge?.bottomMerged) {
        const p1 = toPx(bl);
        const p2 = toPx(br);
        lipBottomParts.push(`M ${p1.x.toFixed(1)} ${(p1.y - 1.5).toFixed(1)} L ${p2.x.toFixed(1)} ${(p2.y - 1.5).toFixed(1)}`);
      }
    }

    const clipPath = `polygon(${normPts.map((p) => `${(p.x * 100).toFixed(1)}% ${(p.y * 100).toFixed(1)}%`).join(', ')})`;
    const fillPoints = normPts.map((p) => `${(p.x * wPx).toFixed(1)},${(p.y * hPx).toFixed(1)}`).join(' ');

    return {
      clipPath,
      fillPoints,
      rimPath: rimParts.join(' '),
      lipRightPath: lipRightParts.join(' '),
      lipBottomPath: lipBottomParts.join(' '),
      facingEdge,
    };
  }

  const symInset = 0.20;
  const sideInset = 0.28;

  let tl = { x: 0, y: 0 };
  let tr = { x: 1, y: 0 };
  let br = { x: 1, y: 1 };
  let bl = { x: 0, y: 1 };

  if (sTop && !sBottom) {
    // Attached below a sibling block: Top edge is 100% wide base, Bottom edge is tapered
    const blX = mode === 'trapezoid' ? symInset : mode === 'trapezoid-l' ? sideInset : 0;
    const brX = mode === 'trapezoid' ? 1 - symInset : mode === 'trapezoid-r' ? 1 - sideInset : 1;
    tl = { x: 0, y: 0 };
    tr = { x: 1, y: 0 };
    br = { x: brX, y: 1 };
    bl = { x: blX, y: 1 };
  } else if (sLeft && !sRight && !sTop && !sBottom) {
    // Attached to right of a sibling block: Left edge is 100% wide base, Right edge is tapered
    const trY = mode === 'trapezoid' ? symInset : mode === 'trapezoid-l' ? sideInset : 0;
    const brY = mode === 'trapezoid' ? 1 - symInset : mode === 'trapezoid-r' ? 1 - sideInset : 1;
    tl = { x: 0, y: 0 };
    tr = { x: 1, y: trY };
    br = { x: 1, y: brY };
    bl = { x: 0, y: 1 };
  } else if (sRight && !sLeft && !sTop && !sBottom) {
    // Attached to left of a sibling block: Right edge is 100% wide base, Left edge is tapered
    const tlY = mode === 'trapezoid' ? symInset : mode === 'trapezoid-l' ? sideInset : 0;
    const blY = mode === 'trapezoid' ? 1 - symInset : mode === 'trapezoid-r' ? 1 - sideInset : 1;
    tl = { x: 0, y: tlY };
    tr = { x: 1, y: 0 };
    br = { x: 1, y: 1 };
    bl = { x: 0, y: blY };
  } else {
    // Standalone or attached above a sibling block: Bottom edge is 100% wide base, Top edge is tapered
    const tlX = mode === 'trapezoid' ? symInset : mode === 'trapezoid-l' ? sideInset : 0;
    const trX = mode === 'trapezoid' ? 1 - symInset : mode === 'trapezoid-r' ? 1 - sideInset : 1;
    tl = { x: tlX, y: 0 };
    tr = { x: trX, y: 0 };
    br = { x: 1, y: 1 };
    bl = { x: 0, y: 1 };
  }

  const clipPath = `polygon(${(tl.x * 100).toFixed(1)}% ${(tl.y * 100).toFixed(1)}%, ${(tr.x * 100).toFixed(1)}% ${(tr.y * 100).toFixed(1)}%, ${(br.x * 100).toFixed(1)}% ${(br.y * 100).toFixed(1)}%, ${(bl.x * 100).toFixed(1)}% ${(bl.y * 100).toFixed(1)}%)`;

  const pTL = { x: tl.x * wPx, y: tl.y * hPx };
  const pTR = { x: tr.x * wPx, y: tr.y * hPx };
  const pBR = { x: br.x * wPx, y: br.y * hPx };
  const pBL = { x: bl.x * wPx, y: bl.y * hPx };

  const fillPoints = `${pTL.x.toFixed(1)},${pTL.y.toFixed(1)} ${pTR.x.toFixed(1)},${pTR.y.toFixed(1)} ${pBR.x.toFixed(1)},${pBR.y.toFixed(1)} ${pBL.x.toFixed(1)},${pBL.y.toFixed(1)}`;

  const rimParts: string[] = [];
  const lipRightParts: string[] = [];
  const lipBottomParts: string[] = [];
  const wU = cellPx > 0 ? wPx / cellPx : 1;
  const hV = cellPx > 0 ? hPx / cellPx : 1;

  // Top edge (rim): only use topSegs if the top edge is horizontal at y=0, clamped to [tl.x, tr.x]
  if (merge?.topMerged && tl.y <= 0.01 && tr.y <= 0.01) {
    const minU = tl.x * wU;
    const maxU = tr.x * wU;
    for (const [u1, u2] of merge.topSegs) {
      const a = Math.max(minU, u1);
      const b = Math.min(maxU, u2);
      if (b - a > 0.02) {
        rimParts.push(`M ${(a * cellPx).toFixed(1)} 0.5 L ${(b * cellPx).toFixed(1)} 0.5`);
      }
    }
  } else {
    rimParts.push(`M ${pTL.x.toFixed(1)} ${(pTL.y + 0.5).toFixed(1)} L ${pTR.x.toFixed(1)} ${(pTR.y + 0.5).toFixed(1)}`);
  }

  // Left edge (rim): only use leftSegs if the left edge is vertical and flush at x=0; slanted edges stay intact
  if (merge?.leftMerged && tl.x <= 0.01 && bl.x <= 0.01) {
    const minV = tl.y * hV;
    const maxV = bl.y * hV;
    for (const [v1, v2] of merge.leftSegs) {
      const a = Math.max(minV, v1);
      const b = Math.min(maxV, v2);
      if (b - a > 0.02) {
        rimParts.push(`M 0.5 ${(a * cellPx).toFixed(1)} L 0.5 ${(b * cellPx).toFixed(1)}`);
      }
    }
  } else {
    rimParts.push(`M ${(pBL.x + 0.5).toFixed(1)} ${pBL.y.toFixed(1)} L ${(pTL.x + 0.5).toFixed(1)} ${pTL.y.toFixed(1)}`);
  }

  // Right edge (lip-r): only use rightSegs if the right edge is vertical and flush at x=1; slanted edges stay intact
  if (merge?.rightMerged && tr.x >= 0.99 && br.x >= 0.99) {
    const minV = tr.y * hV;
    const maxV = br.y * hV;
    for (const [v1, v2] of merge.rightSegs) {
      const a = Math.max(minV, v1);
      const b = Math.min(maxV, v2);
      if (b - a > 0.02) {
        lipRightParts.push(`M ${(wPx - 1).toFixed(1)} ${(a * cellPx).toFixed(1)} L ${(wPx - 1).toFixed(1)} ${(b * cellPx).toFixed(1)}`);
      }
    }
  } else {
    lipRightParts.push(`M ${(pTR.x - 1).toFixed(1)} ${pTR.y.toFixed(1)} L ${(pBR.x - 1).toFixed(1)} ${pBR.y.toFixed(1)}`);
  }

  // Bottom edge (lip-b): only use bottomSegs if the bottom edge is horizontal at y=1, clamped to [bl.x, br.x]
  if (merge?.bottomMerged && bl.y >= 0.99 && br.y >= 0.99) {
    const minU = bl.x * wU;
    const maxU = br.x * wU;
    for (const [u1, u2] of merge.bottomSegs) {
      const a = Math.max(minU, u1);
      const b = Math.min(maxU, u2);
      if (b - a > 0.02) {
        lipBottomParts.push(`M ${(a * cellPx).toFixed(1)} ${(hPx - 1.5).toFixed(1)} L ${(b * cellPx).toFixed(1)} ${(hPx - 1.5).toFixed(1)}`);
      }
    }
  } else {
    lipBottomParts.push(`M ${pBL.x.toFixed(1)} ${(pBL.y - 1.5).toFixed(1)} L ${pBR.x.toFixed(1)} ${(pBR.y - 1.5).toFixed(1)}`);
  }

  return {
    clipPath,
    fillPoints,
    rimPath: rimParts.join(' '),
    lipRightPath: lipRightParts.join(' '),
    lipBottomPath: lipBottomParts.join(' '),
  };
}

interface LandmarkVariantDef {
  id: string;
  label: string;
  badgeText: string;
  isCircle?: boolean;
  polygonFaces?: 8 | 12 | 24;
  isEmergency?: boolean;
}

export const LANDMARK_VARIANTS: Record<Exclude<TileKind, 'unit'>, ReadonlyArray<LandmarkVariantDef>> = {
  marker: [
    { id: 'default', label: 'You Are Here', badgeText: 'HERE' },
  ],
  entrance: [
    { id: 'default', label: 'Main Entrance', badgeText: 'MAIN' },
    { id: 'north', label: 'North Gate', badgeText: 'NORTH' },
    { id: 'south', label: 'South Gate', badgeText: 'SOUTH' },
    { id: 'vip', label: 'VIP / Drop-off', badgeText: 'VIP' },
    { id: 'circle', label: 'Rotunda Entrance (Circle)', badgeText: 'GATE', isCircle: true },
  ],
  exit: [
    { id: 'default', label: 'Exit', badgeText: 'EXIT' },
    { id: 'emergency', label: 'Emergency Fire Exit', badgeText: 'SOS EXIT', isEmergency: true },
    { id: 'parking', label: 'Exit to Parking', badgeText: 'TO PARK' },
    { id: 'circle', label: 'Exit Rotunda (Circle)', badgeText: 'EXIT', isCircle: true },
  ],
  stairs: [
    { id: 'default', label: 'Stairs (Up & Down ⇅)', badgeText: '⇅' },
    { id: 'up', label: 'Stairs (Up ↑)', badgeText: 'UP ↑' },
    { id: 'down', label: 'Stairs (Down ↓)', badgeText: 'DOWN ↓' },
    { id: 'circle', label: 'Spiral Stairs (Circle)', badgeText: 'SPIRAL', isCircle: true },
    { id: 'emergency', label: 'Fire Escape Stairs', badgeText: 'SOS STAIRS', isEmergency: true },
  ],
  escalator: [
    { id: 'default', label: 'Elevator (⇅)', badgeText: 'LIFT ⇅' },
    { id: 'escalator', label: 'Escalator (⇅)', badgeText: 'ESC ⇅' },
    { id: 'escalator-up', label: 'Escalator (Up ↑)', badgeText: 'ESC ↑' },
    { id: 'escalator-down', label: 'Escalator (Down ↓)', badgeText: 'ESC ↓' },
    { id: 'accessible', label: 'Accessible Lift (♿)', badgeText: 'LIFT ♿' },
    { id: 'circle', label: 'Panoramic Lift (Circle)', badgeText: 'GLASS LIFT', isCircle: true },
  ],
  toilet: [
    { id: 'default', label: 'Restroom (M/F)', badgeText: 'WC' },
    { id: 'accessible', label: 'Accessible Restroom (♿)', badgeText: 'WC ♿' },
    { id: 'baby', label: 'Baby Care / Nursing', badgeText: 'BABY' },
    { id: 'male', label: "Men's Restroom", badgeText: 'MEN' },
    { id: 'female', label: "Women's Restroom", badgeText: 'WOMEN' },
  ],
  atrium: [
    { id: 'circle', label: 'Circle Atrium', badgeText: 'ATRIUM', isCircle: true },
    { id: 'poly24', label: '24-Faces Trapezohedron Atrium', badgeText: '24-FACE', polygonFaces: 24 },
    { id: 'poly12', label: '12-Faces Atrium (Dodecagon)', badgeText: '12-FACE', polygonFaces: 12 },
    { id: 'poly8', label: '8-Faces Atrium (Octagon)', badgeText: '8-FACE', polygonFaces: 8 },
    { id: 'rect', label: 'Rectangle Atrium', badgeText: 'ATRIUM' },
    { id: 'fountain', label: 'Fountain Court (Circle)', badgeText: 'FOUNTAIN', isCircle: true },
    { id: 'event', label: 'Event Stage / Promo Court', badgeText: 'STAGE' },
  ],
  info: [
    { id: 'default', label: 'Info Desk', badgeText: 'INFO' },
    { id: 'concierge', label: 'VIP Concierge', badgeText: 'VIP INFO' },
    { id: 'circle', label: 'Info Kiosk (Circle)', badgeText: 'INFO', isCircle: true },
  ],
  parking: [
    { id: 'default', label: 'Car Park Access', badgeText: 'PARKING' },
    { id: 'kiosk', label: 'Parking Pay Kiosk', badgeText: 'PAY P' },
    { id: 'ev', label: 'EV Charging Zone', badgeText: 'EV ⚡' },
    { id: 'bike', label: 'Motorbike Parking', badgeText: 'BIKE P' },
  ],
  atm: [
    { id: 'default', label: 'ATM Kiosk', badgeText: 'ATM' },
    { id: 'exchange', label: 'Money Changer', badgeText: 'FX $' },
    { id: 'circle', label: 'ATM Pod (Circle)', badgeText: 'ATM', isCircle: true },
  ],
  medical: [
    { id: 'default', label: 'First Aid / Clinic', badgeText: 'FIRST AID' },
    { id: 'security', label: 'Security Office', badgeText: 'SECURITY' },
    { id: 'aed', label: 'AED / Fire Safety Point', badgeText: 'AED / SOS', isEmergency: true },
  ],
};

interface LandmarkMeta {
  variant: string;
  variantLabel: string;
  badgeText: string;
  customName: string;
  showLabel: boolean;
  isCircle: boolean;
  polygonFaces?: 8 | 12 | 24;
  isEmergency: boolean;
  displayLabel: string;
}

interface PolygonAtriumGeometry {
  faces: 8 | 12 | 24;
  clipPath: string;
  outerPoints: string;
  rimPath: string;
  lipPath: string;
}

export function getPolygonAtriumGeometry(
  faces: 8 | 12 | 24,
  wPx: number,
  hPx: number,
): PolygonAtriumGeometry {
  const cx = wPx / 2;
  const cy = hPx / 2;
  const rx = Math.max(2, wPx / 2 - 0.75);
  const ry = Math.max(2, hPx / 2 - 0.75);
  const cosStep = Math.cos(Math.PI / faces);

  const outerVerts: Array<{ x: number; y: number; pctX: number; pctY: number }> = [];

  for (let i = 0; i < faces; i++) {
    const theta = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / faces;
    const ux = Math.max(-1, Math.min(1, Math.cos(theta) / cosStep));
    const uy = Math.max(-1, Math.min(1, Math.sin(theta) / cosStep));
    outerVerts.push({
      x: cx + ux * rx,
      y: cy + uy * ry,
      pctX: Math.max(0, Math.min(100, 50 + ux * 50)),
      pctY: Math.max(0, Math.min(100, 50 + uy * 50)),
    });
  }

  const clipPath = `polygon(${outerVerts.map((v) => `${v.pctX.toFixed(2)}% ${v.pctY.toFixed(2)}%`).join(', ')})`;
  const outerPoints = outerVerts.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');

  const rimParts: string[] = [];
  const lipParts: string[] = [];

  for (let i = 0; i < faces; i++) {
    const next = (i + 1) % faces;
    const v0 = outerVerts[i];
    const v1 = outerVerts[next];
    const midTheta = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / faces;
    const isRim = Math.cos(midTheta) + Math.sin(midTheta) <= 0.1;
    const edgeSeg = `M ${v0.x.toFixed(1)} ${v0.y.toFixed(1)} L ${v1.x.toFixed(1)} ${v1.y.toFixed(1)}`;
    if (isRim) {
      rimParts.push(edgeSeg);
    } else {
      lipParts.push(edgeSeg);
    }
  }

  return {
    faces,
    clipPath,
    outerPoints,
    rimPath: rimParts.join(' '),
    lipPath: lipParts.join(' '),
  };
}

export function parseLandmarkMeta(
  kind: Exclude<TileKind, 'unit'> | string,
  label?: string | null,
): LandmarkMeta {
  const safeKind = (kind in LANDMARK_VARIANTS ? kind : 'atrium') as Exclude<TileKind, 'unit'>;
  const defs = LANDMARK_VARIANTS[safeKind] || LANDMARK_VARIANTS.atrium;
  const defaultBaseLabel = DECORATION_LABELS[safeKind] || safeKind;
  let rawVariant = defs[0].id;
  let customName = '';
  let explicitShowLabel: boolean | undefined;

  const trimmed = (label ?? '').trim();
  if (trimmed.startsWith('lm:')) {
    const body = trimmed.slice(3);
    const pipeIdx = body.indexOf('|');
    let header = pipeIdx === -1 ? body : body.slice(0, pipeIdx);
    if (pipeIdx !== -1) {
      customName = body.slice(pipeIdx + 1).trim();
    }
    if (header.endsWith('+L')) {
      explicitShowLabel = true;
      header = header.slice(0, -2);
    } else if (header.endsWith('-L')) {
      explicitShowLabel = false;
      header = header.slice(0, -2);
    }
    rawVariant = header || defs[0].id;
  } else if (safeKind === 'atrium') {
    if (trimmed === 'atrium:rect') rawVariant = 'rect';
    else if (trimmed === 'atrium:circle' || !trimmed || trimmed === 'Atrium') rawVariant = 'circle';
    else customName = trimmed;
  } else if (trimmed && trimmed !== defaultBaseLabel && !trimmed.startsWith('walkway:') && !trimmed.startsWith('unit:')) {
    customName = trimmed;
  }

  const def = defs.find((d) => d.id === rawVariant) || defs[0];
  const isNonDefault =
    def.id !== defs[0].id &&
    !(safeKind === 'atrium' && trimmed === 'atrium:rect') &&
    !(safeKind === 'marker' && def.id === 'circle');
  const showLabel = explicitShowLabel ?? (Boolean(customName) || isNonDefault);
  const displayLabel = customName ? `${def.label} (${customName})` : def.label;
  return {
    variant: def.id,
    variantLabel: def.label,
    badgeText: customName || def.badgeText,
    customName,
    showLabel,
    isCircle: Boolean(def.isCircle),
    polygonFaces: def.polygonFaces,
    isEmergency: Boolean(def.isEmergency),
    displayLabel,
  };
}

export function encodeLandmarkMeta(
  kind: Exclude<TileKind, 'unit'>,
  variant: string,
  customName?: string | null,
  showLabel?: boolean,
): string {
  const cleanCustom = (customName ?? '').replace(/\|/g, '/').trim().slice(0, 48);
  const defs = LANDMARK_VARIANTS[kind] || [];
  const validVariant = defs.some((d) => d.id === variant) ? variant : (defs[0]?.id ?? 'default');
  const isNonDefault = validVariant !== (defs[0]?.id ?? 'default');
  const effectiveShowLabel =
    showLabel ?? (Boolean(cleanCustom) || (isNonDefault && !(kind === 'marker' && validVariant === 'circle')));
  if (kind === 'atrium' && !cleanCustom && !effectiveShowLabel && (validVariant === 'circle' || validVariant === 'rect')) {
    return validVariant === 'rect' ? 'atrium:rect' : 'atrium:circle';
  }
  if (!cleanCustom && !effectiveShowLabel && !isNonDefault) {
    return DECORATION_LABELS[kind] || kind;
  }
  const flag = effectiveShowLabel ? '+L' : '-L';
  return cleanCustom ? `lm:${validVariant}${flag}|${cleanCustom}` : `lm:${validVariant}${flag}`;
}

export function nextLandmarkVariant(
  kind: Exclude<TileKind, 'unit'>,
  currentVariant: string,
): string {
  const defs = LANDMARK_VARIANTS[kind] || [];
  if (defs.length <= 1) return defs[0]?.id ?? 'default';
  const idx = defs.findIndex((d) => d.id === currentVariant);
  return defs[(idx + 1) % defs.length].id;
}

export function isCircleTile(
  it: { kind: TileKind | string; label?: string | null },
  isMergedUnit?: boolean,
): boolean {
  if (it.kind !== 'unit') {
    return parseLandmarkMeta(it.kind, it.label).isCircle;
  }
  if (isMergedUnit) return false;
  return it.label === 'unit:circle';
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
  marker: 'You Are Here',
  entrance: 'Entrance',
  exit: 'Exit',
  escalator: 'Elevator / Escalator',
  stairs: 'Stairs',
  toilet: 'Restroom',
  atrium: 'Atrium',
  info: 'Info Desk',
  parking: 'Parking',
  atm: 'ATM',
  medical: 'First Aid',
};

export const DECORATION_DEFAULT_SIZES: Record<Exclude<TileKind, 'unit'>, { w: number; h: number }> = {
  atrium: { w: 12, h: 12 },
  stairs: { w: 8, h: 6 },
  escalator: { w: 8, h: 6 },
  toilet: { w: 8, h: 6 },
  marker: { w: 6, h: 6 },
  entrance: { w: 8, h: 4 },
  exit: { w: 8, h: 4 },
  info: { w: 8, h: 6 },
  parking: { w: 8, h: 6 },
  atm: { w: 6, h: 4 },
  medical: { w: 8, h: 6 },
};

export const DEFAULT_COLUMNS = 120;
export const DEFAULT_SQFT_PER_CELL = 8;

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

/** Generates `u:<unitId>` for the first block of a unit, then `u:<unitId>:2`, `u:<unitId>:3`, ... for additional wings. */
export function nextUnitBlockKey(items: ReadonlyArray<{ key: string }>, unitId: string): string {
  const base = unitKey(unitId);
  if (!items.some((i) => i.key === base)) return base;
  let n = 2;
  while (items.some((i) => i.key === `${base}:${n}`)) n++;
  return `${base}:${n}`;
}

function comparePrimaryTile(a: MapItem, b: MapItem): number {
  return b.w * b.h - a.w * a.h || a.y - b.y || a.x - b.x || a.key.localeCompare(b.key);
}

/** Finds the primary (`u:<unitId>`) or largest-area block for a unit on the current floor. */
export function findPrimaryUnitTile(items: ReadonlyArray<MapItem>, unitId: string): MapItem | null {
  const exact = items.find((i) => i.key === unitKey(unitId));
  if (exact) return exact;
  const matches = items.filter((i) => i.unitId === unitId);
  if (matches.length === 0) return null;
  return [...matches].sort(comparePrimaryTile)[0];
}

/** Resolves an exact tile key or any `u:<unitId>[:n]` key back to a placed tile on the floor. */
export function resolveTileByKey(items: ReadonlyArray<MapItem>, key: string): MapItem | null {
  if (!key) return null;
  const exact = items.find((i) => i.key === key);
  if (exact) return exact;
  if (key.startsWith('u:')) {
    const uId = key.slice(2).split(':')[0];
    return findPrimaryUnitTile(items, uId);
  }
  return null;
}

export function unitNumberOf(shop: any): string {
  return shop?.unit?.unitNumber || shop?.shopNumber || '';
}

export function compareShopsByUnitNumber(a: any, b: any): number {
  return unitNumberOf(a).localeCompare(unitNumberOf(b), undefined, { numeric: true });
}

export function shopDisplayName(shop: any, fallback = ''): string {
  const name = typeof shop?.brandName === 'string' ? shop.brandName.trim() : '';
  return name || unitNumberOf(shop) || fallback;
}

export function matchesShopQuery(shop: any, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (shop?.brandName || '').toLowerCase().includes(q) ||
    (shop?.shopNumber || '').toLowerCase().includes(q) ||
    (shop?.tradeCategory || '').toLowerCase().includes(q) ||
    (shop?.franchiseGroup || '').toLowerCase().includes(q) ||
    (shop?.unit?.unitNumber || '').toLowerCase().includes(q)
  );
}

export function scoreShopSearchMatch(shop: any, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const brand = (shop?.brandName || '').trim().toLowerCase();
  const unitNo = unitNumberOf(shop).toLowerCase();
  const shopNo = (shop?.shopNumber || '').trim().toLowerCase();
  if (unitNo === q || brand === q || shopNo === q) return 4;
  if (unitNo.startsWith(q) || brand.startsWith(q) || shopNo.startsWith(q)) return 3;
  if (unitNo.includes(q) || brand.includes(q) || shopNo.includes(q)) return 2;
  if (matchesShopQuery(shop, q)) return 1;
  return 0;
}

/**
 * Tile size in grid cells for a unit: area ∝ sqft, slightly landscape (1.4:1)
 * with a default minimum (10×6 on the 120-col fine grid) so unit cards are easy to see, click, and fine-tune by 1-cell steps.
 */
export function tileSizeFromSqft(
  areaSqft: number | string | null | undefined,
  sqftPerCell: number,
  columns: number,
): { w: number; h: number } {
  const rawSqft = Number(areaSqft);
  const sqft = rawSqft > 0 ? rawSqft : 450;
  const spc = sqftPerCell > 0 ? sqftPerCell : DEFAULT_SQFT_PER_CELL;
  const cells = Math.max(60, sqft / spc);
  const w = Math.min(columns, Math.max(10, Math.round(Math.sqrt(cells * 1.4))));
  const h = Math.max(6, Math.round(cells / w));
  return { w, h };
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function isTransitLandmark(kind: TileKind | string): boolean {
  return kind === 'stairs' || kind === 'escalator' || kind === 'info' || kind === 'marker';
}

function isAtriumTransitOverlap(
  a: { kind: TileKind | string; x: number; y: number; w: number; h: number },
  b: { kind: TileKind | string; x: number; y: number; w: number; h: number },
): boolean {
  if (
    (a.kind === 'atrium' && isTransitLandmark(b.kind)) ||
    (b.kind === 'atrium' && isTransitLandmark(a.kind))
  ) {
    return rectsOverlap(a, b);
  }
  return false;
}

function getCustomUnitConvexPolygons(
  t: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  f: { ux: number; uy: number; vx: number; vy: number },
): Array<{ corners: Array<{ x: number; y: number }>; extraAxes: Array<{ x: number; y: number }> }> | null {
  let uvParts: ReadonlyArray<ReadonlyArray<readonly [number, number]>> | null = null;

  if (t.kind !== 'unit') {
    const meta = parseLandmarkMeta(t.kind, t.label);
    if (meta.polygonFaces && meta.polygonFaces >= 6) {
      const faces = meta.polygonFaces;
      const cosStep = Math.cos(Math.PI / faces);
      const poly: Array<[number, number]> = [];
      for (let i = 0; i < faces; i++) {
        const theta = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / faces;
        const u = 0.485 * Math.max(-1, Math.min(1, Math.cos(theta) / cosStep));
        const v = 0.485 * Math.max(-1, Math.min(1, Math.sin(theta) / cosStep));
        poly.push([u, v]);
      }
      uvParts = [poly];
    } else if (meta.isCircle) {
      const K = 24;
      const poly: Array<[number, number]> = [];
      for (let i = 0; i < K; i++) {
        const theta = (i * 2 * Math.PI) / K;
        poly.push([0.485 * Math.cos(theta), 0.485 * Math.sin(theta)]);
      }
      uvParts = [poly];
    }
  } else if (t.kind === 'unit') {
    const mode = parseUnitShapeMode(t);
    if (!mode || mode === 'rect') {
      return null;
    }
    const rawParts =
      mode === 'custom'
        ? customShapeConvexUvParts(decodeCustomShape(t.label)) ?? null
        : getStraightOutlineUvParts(t, mode) ?? UNIT_SHAPE_CONVEX_UV_PARTS[mode] ?? null;
    // Straight outer edges of the box must collide exactly (circles keep their inscribed polygon).
    uvParts = rawParts && mode !== 'circle' ? snapUvPartsToBoxEdges(rawParts) : rawParts;
  }

  if (!uvParts || uvParts.length === 0) return null;
  const cx = t.x + t.w * 0.5;
  const cy = t.y + t.h * 0.5;
  return uvParts.map((uv) => {
    const corners = uv.map(([u, v]) => ({
      x: cx + f.ux * (u * t.w) + f.vx * (v * t.h),
      y: cy + f.uy * (u * t.w) + f.vy * (v * t.h),
    }));
    const extraAxes: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < corners.length; i++) {
      const p0 = corners[i];
      const p1 = corners[(i + 1) % corners.length];
      const ex = p1.x - p0.x;
      const ey = p1.y - p0.y;
      const len = Math.hypot(ex, ey);
      if (len > 1e-3) {
        extraAxes.push({ x: -ey / len, y: ex / len });
      }
    }
    return { corners, extraAxes };
  });
}

const outlinePartsCache = new Map<string, Array<Array<[number, number]>> | null>();

/**
 * Collision parts taken from the real drawn outline for shapes with straight edges (steps, slopes, bevels, chamfers,
 * wedges, courts...). The hand-written parts of those shapes were smaller than what is drawn, so tiles could overlap
 * the drawn shape. Curved shapes (arcs, notches, rings) return null and keep their looser parts so neighbours can hug them.
 */
function getStraightOutlineUvParts(
  t: { label?: string | null; w: number; h: number },
  mode: UnitShapeMode,
): Array<Array<[number, number]>> | null {
  if (mode === 'rect' || mode === 'circle' || mode === 'custom') return null;
  const key = `${mode}|${t.label ?? ''}|${t.w}x${t.h}`;
  const hit = outlinePartsCache.get(key);
  if (hit !== undefined) return hit;

  let parts: Array<Array<[number, number]>> | null = null;
  try {
    const cell = 20;
    const wPx = t.w * cell;
    const hPx = t.h * cell;
    const nums = getTrapezoidUnitGeometry(mode, wPx, hPx, cell, undefined, null, null).fillPoints.match(/-?\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 6 && nums.length / 2 <= 10) {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([(Number(nums[i]) / wPx) * 100, (Number(nums[i + 1]) / hPx) * 100]);
      parts = polygonConvexUvParts(pts);
    }
  } catch {
    parts = null;
  }
  if (outlinePartsCache.size > 300) outlinePartsCache.clear();
  outlinePartsCache.set(key, parts);
  return parts;
}

export function getCustomUnitPolygonVerticesAndAxes(
  t: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  f: { ux: number; uy: number; vx: number; vy: number },
): { corners: Array<{ x: number; y: number }>; extraAxes: Array<{ x: number; y: number }> } | null {
  const parts = getCustomUnitConvexPolygons(t, f);
  if (!parts || parts.length === 0) return null;
  return parts[0];
}

function getRotatedWorldAABB(t: { x: number; y: number; w: number; h: number; angle?: number }): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const ang = t.angle ?? 0;
  if (!ang) {
    return { minX: t.x, maxX: t.x + t.w, minY: t.y, maxY: t.y + t.h };
  }
  const rad = (ang * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const hw = (t.w * c + t.h * s) * 0.5;
  const hh = (t.w * s + t.h * c) * 0.5;
  const cx = t.x + t.w * 0.5;
  const cy = t.y + t.h * 0.5;
  return { minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh };
}

function rotatedWorldBoundsOverlap(
  a: { x: number; y: number; w: number; h: number; angle?: number },
  b: { x: number; y: number; w: number; h: number; angle?: number },
): boolean {
  if (!a.angle && !b.angle) return rectsOverlap(a, b);
  const ba = getRotatedWorldAABB(a);
  const bb = getRotatedWorldAABB(b);
  return (
    ba.minX < bb.maxX - 1e-3 &&
    ba.maxX > bb.minX + 1e-3 &&
    ba.minY < bb.maxY - 1e-3 &&
    ba.maxY > bb.minY + 1e-3
  );
}

function areConvexPartsSeparated(
  cornersA: ReadonlyArray<{ x: number; y: number }>,
  cornersB: ReadonlyArray<{ x: number; y: number }>,
  axes: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  const eps = 1e-4;
  for (const ax of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    for (const c of cornersA) {
      const p = c.x * ax.x + c.y * ax.y;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    let minB = Infinity;
    let maxB = -Infinity;
    for (const c of cornersB) {
      const p = c.x * ax.x + c.y * ax.y;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA <= minB + eps || maxB <= minA + eps) return true;
  }
  return false;
}

function areRotatedRectsSeparated(
  a: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  b: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
): boolean {
  const angleA = a.angle ?? 0;
  const angleB = b.angle ?? 0;
  const fa = getLocalTileFrame(a);
  const fb = getLocalTileFrame(b);
  const partsA = getCustomUnitConvexPolygons(a, fa);
  const partsB = getCustomUnitConvexPolygons(b, fb);
  if (angleA === 0 && angleB === 0 && !partsA && !partsB) return false;
  if (!partsA && !partsB && rectsOverlap(a, b)) return false;

  const listA = partsA ?? [{ corners: getTileWorldCorners(a, fa), extraAxes: [] }];
  const listB = partsB ?? [{ corners: getTileWorldCorners(b, fb), extraAxes: [] }];
  const baseAxes = [
    { x: fa.ux, y: fa.uy },
    { x: fa.vx, y: fa.vy },
    { x: fb.ux, y: fb.uy },
    { x: fb.vx, y: fb.vy },
  ];

  for (const pa of listA) {
    for (const pb of listB) {
      const axes = [...baseAxes, ...pa.extraAxes, ...pb.extraAxes];
      if (!areConvexPartsSeparated(pa.corners, pb.corners, axes)) {
        return false;
      }
    }
  }
  return true;
}

export function tilesConflict(a: MapItem, b: MapItem): boolean {
  if (isAtriumTransitOverlap(a, b)) return false;
  return rotatedWorldBoundsOverlap(a, b) && !areRotatedRectsSeparated(a, b);
}

/**
 * When a landmark switches to a circular variant (`isCircle === true`) and its current
 * dimensions are non-square (`w !== h`), adjusts `w` and `h` to an equal square size (`w === h`,
 * e.g. `2×2` or `3×3`) that fits without conflicting with any other tile on the map.
 */
export function autoSquareCircleLandmark(
  item: MapItem,
  allItems: ReadonlyArray<MapItem>,
  columns = DEFAULT_COLUMNS,
): MapItem {
  if (item.w === item.h) return item;
  const minSide = Math.max(2, Math.min(item.w, item.h));
  const avgSide = Math.max(2, Math.round((item.w + item.h) / 2));
  const maxSide = Math.max(2, Math.max(item.w, item.h));
  const candidateSizes = Array.from(new Set([minSide, avgSide, maxSide, 2, 3]));
  const others = allItems.filter((o) => o.key !== item.key);

  for (const sz of candidateSizes) {
    if (sz > columns) continue;
    const cx = Math.round(item.x + (item.w - sz) / 2);
    const cy = Math.round(item.y + (item.h - sz) / 2);
    const anchors: Array<[number, number]> = [
      [Math.max(0, Math.min(cx, columns - sz)), Math.max(0, cy)],
      [Math.max(0, Math.min(item.x, columns - sz)), Math.max(0, item.y)],
      [Math.max(0, Math.min(item.x + item.w - sz, columns - sz)), Math.max(0, item.y + item.h - sz)],
    ];
    for (const [ax, ay] of anchors) {
      const cand: MapItem = { ...item, x: ax, y: ay, w: sz, h: sz };
      if (cand.x + cand.w <= columns && !others.some((o) => tilesConflict(cand, o))) {
        return cand;
      }
    }
  }
  return item;
}

export function hasAnyOverlap(items: MapItem[]): boolean {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (tilesConflict(items[i], items[j])) return true;
    }
  }
  return false;
}

interface ViewportGridBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * First free spot (scanning left→right, top→bottom) where a w×h tile fits.
 * When `viewportBounds` is provided, prioritizes placing inside the user's currently visible
 * horizontal & vertical viewport before falling back to the wider grid.
 */
export function findFreeSpot(
  items: MapItem[],
  w: number,
  h: number,
  columns: number,
  minStartX = 0,
  viewportBounds?: ViewportGridBounds,
): { x: number; y: number } {
  const width = Math.min(w, columns);
  const startX = Math.max(0, Math.min(minStartX, columns - width));
  const isSpotFree = (x: number, y: number): boolean => {
    const candidate: MapItem = {
      key: '__spot__',
      kind: 'unit',
      unitId: '__spot__',
      label: null,
      x,
      y,
      w: width,
      h,
    };
    return !items.some((it) => tilesConflict(candidate, it));
  };

  if (viewportBounds) {
    const vMinX = Math.max(startX, Math.min(viewportBounds.minX, columns - width));
    const vMaxX = Math.max(vMinX + width, Math.min(viewportBounds.maxX, columns));
    const vMinY = Math.max(0, viewportBounds.minY);
    const vMaxY = Math.max(vMinY + h, viewportBounds.maxY);

    // 1. Prioritize placing directly inside the currently visible screen area
    for (let y = vMinY; y + h <= vMaxY; y++) {
      for (let x = vMinX; x + width <= vMaxX; x++) {
        if (isSpotFree(x, y)) return { x, y };
      }
    }
    // 2. Keep within the currently visible horizontal columns (no horizontal scrolling needed)
    for (let y = vMinY; y < 5000; y++) {
      for (let x = vMinX; x + width <= vMaxX; x++) {
        if (isSpotFree(x, y)) return { x, y };
      }
    }
  }

  for (let y = 0; y < 5000; y++) {
    for (let x = startX; x + width <= columns; x++) {
      if (isSpotFree(x, y)) return { x, y };
    }
  }
  return { x: startX, y: 0 };
}

/**
 * Places a newly added w×h tile directly next to `anchor` (Right → Bottom → Left → Top),
 * or in the nearest free spot along/around `anchor`'s row so sequential additions line up
 * cleanly instead of jumping back to the top-left of the canvas.
 */
export function findSpotNextToAnchor(
  items: MapItem[],
  anchor: MapItem | null | undefined,
  w: number,
  h: number,
  columns: number,
  minStartX = 0,
  viewportBounds?: ViewportGridBounds,
  candidateKind: TileKind = 'unit',
  candidateUnitId: string | null = '__new__',
): { x: number; y: number } {
  const width = Math.min(w, columns);
  if (!anchor) {
    return findFreeSpot(items, width, h, columns, minStartX, viewportBounds);
  }
  const startX = Math.max(0, Math.min(minStartX, columns - width));
  const fits = (x: number, y: number): boolean => {
    if (x < startX || y < 0 || x + width > columns) return false;
    const candidate: MapItem = {
      key: '__spot__',
      kind: candidateKind,
      unitId: candidateUnitId,
      label: null,
      x,
      y,
      w: width,
      h,
    };
    return !items.some((it) => tilesConflict(candidate, it));
  };

  // 1. Direct touching sides in priority order: Right -> Bottom -> Left -> Top
  const directCandidates: Array<[number, number]> = [
    [anchor.x + anchor.w, anchor.y],
    [anchor.x + anchor.w, anchor.y + anchor.h - h],
    [anchor.x, anchor.y + anchor.h],
    [anchor.x + anchor.w - width, anchor.y + anchor.h],
    [anchor.x - width, anchor.y],
    [anchor.x - width, anchor.y + anchor.h - h],
    [anchor.x, anchor.y - h],
    [anchor.x + anchor.w - width, anchor.y - h],
  ];
  for (const [cx, cy] of directCandidates) {
    if (fits(cx, cy)) return { x: cx, y: cy };
  }

  // Slide along each of the 4 sides (Right -> Bottom -> Left -> Top)
  for (let dy = -h + 1; dy < anchor.h; dy++) {
    if (fits(anchor.x + anchor.w, anchor.y + dy)) return { x: anchor.x + anchor.w, y: anchor.y + dy };
  }
  for (let dx = -width + 1; dx < anchor.w; dx++) {
    if (fits(anchor.x + dx, anchor.y + anchor.h)) return { x: anchor.x + dx, y: anchor.y + anchor.h };
  }
  for (let dy = -h + 1; dy < anchor.h; dy++) {
    if (fits(anchor.x - width, anchor.y + dy)) return { x: anchor.x - width, y: anchor.y + dy };
  }
  for (let dx = -width + 1; dx < anchor.w; dx++) {
    if (fits(anchor.x + dx, anchor.y - h)) return { x: anchor.x + dx, y: anchor.y - h };
  }

  // 2. Continue rightward on the same row, then downward/nearby around anchor
  for (let x = anchor.x + anchor.w + 1; x + width <= columns; x++) {
    if (fits(x, anchor.y)) return { x, y: anchor.y };
  }
  for (let radius = 1; radius <= 36; radius++) {
    const minY = Math.max(0, anchor.y - radius);
    const maxY = anchor.y + anchor.h + radius;
    const minX = Math.max(startX, anchor.x - width - radius);
    const maxX = Math.min(columns - width, anchor.x + anchor.w + radius);
    for (let y = anchor.y; y <= maxY; y++) {
      for (let x = anchor.x; x <= maxX; x++) {
        if (fits(x, y)) return { x, y };
      }
      for (let x = anchor.x - 1; x >= minX; x--) {
        if (fits(x, y)) return { x, y };
      }
    }
    for (let y = anchor.y - 1; y >= minY; y--) {
      for (let x = anchor.x; x <= maxX; x++) {
        if (fits(x, y)) return { x, y };
      }
      for (let x = anchor.x - 1; x >= minX; x--) {
        if (fits(x, y)) return { x, y };
      }
    }
  }

  return findFreeSpot(items, width, h, columns, minStartX, viewportBounds);
}

/**
 * Finds a free w×h spot directly touching one of `anchor`'s 4 sides so a new unit wing
 * immediately auto-merges into an L / T / U shape; falls back to `findFreeSpot` if surrounded.
 */
function findSpotTouchingBlock(
  items: ReadonlyArray<MapItem>,
  anchor: MapItem,
  w: number,
  h: number,
  columns: number,
): { x: number; y: number } | null {
  const width = Math.min(w, columns);
  const fits = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x + width <= columns &&
    !items.some((it) => tilesConflict({ ...anchor, key: '__wing__', x, y, w: width, h }, it));

  const priority: Array<[number, number]> = [
    [anchor.x + anchor.w, anchor.y],
    [anchor.x + anchor.w, anchor.y + anchor.h - h],
    [anchor.x, anchor.y + anchor.h],
    [anchor.x + anchor.w - width, anchor.y + anchor.h],
    [anchor.x - width, anchor.y],
    [anchor.x - width, anchor.y + anchor.h - h],
    [anchor.x, anchor.y - h],
    [anchor.x + anchor.w - width, anchor.y - h],
  ];
  for (const [cx, cy] of priority) {
    if (fits(cx, cy)) return { x: cx, y: cy };
  }
  for (let dy = -h + 1; dy < anchor.h; dy++) {
    if (fits(anchor.x + anchor.w, anchor.y + dy)) return { x: anchor.x + anchor.w, y: anchor.y + dy };
    if (fits(anchor.x - width, anchor.y + dy)) return { x: anchor.x - width, y: anchor.y + dy };
  }
  for (let dx = -width + 1; dx < anchor.w; dx++) {
    if (fits(anchor.x + dx, anchor.y + anchor.h)) return { x: anchor.x + dx, y: anchor.y + anchor.h };
    if (fits(anchor.x + dx, anchor.y - h)) return { x: anchor.x + dx, y: anchor.y - h };
  }
  return null;
}

function findAdjacentSpot(
  items: MapItem[],
  anchor: MapItem,
  w: number,
  h: number,
  columns: number,
): { x: number; y: number } {
  const width = Math.min(w, columns);
  const direct = findSpotTouchingBlock(items, anchor, width, h, columns);
  if (direct) return direct;
  return findFreeSpot(items, width, h, columns);
}

/**
 * Adds a connected wing block to the unit of `anchorKey`, guaranteeing that the new wing
 * directly touches one of the unit's 4 borders (Right, Bottom, Left, or Top) so it immediately merges.
 */
export function addConnectedUnitWing(items: MapItem[], anchorKey: string, columns: number): MapItem[] {
  const anchor = items.find((i) => i.key === anchorKey);
  if (!anchor || anchor.kind !== 'unit' || !anchor.unitId) return items;

  const wingW = anchor.w >= 3 ? Math.max(2, Math.min(anchor.w - 1, Math.round(anchor.w * 0.6))) : anchor.w;
  const wingH = anchor.h >= 3 ? Math.max(2, Math.min(anchor.h - 1, Math.round(anchor.h * 0.65))) : anchor.h;
  const nextKey = nextUnitBlockKey(items, anchor.unitId);

  const unitBlocks = [
    anchor,
    ...items.filter((i) => i.key !== anchor.key && i.kind === 'unit' && i.unitId === anchor.unitId),
  ];

  // Clear any explicit circle mode on this unit's blocks so the multi-block unit merges into an L / T / U shape
  const normalizedItems = items.map((i) =>
    i.kind === 'unit' && i.unitId === anchor.unitId && i.label === 'unit:circle' ? { ...i, label: null } : i,
  );

  const sizeCandidates: Array<[number, number]> = [
    [wingW, wingH],
    [Math.min(wingW, 2), Math.min(wingH, 2)],
    [wingW, 1],
    [1, wingH],
    [2, 1],
    [1, 2],
  ];

  for (const [cw, ch] of sizeCandidates) {
    const w = Math.max(1, Math.min(cw, columns));
    const h = Math.max(1, ch);
    for (const host of unitBlocks) {
      const spot = findSpotTouchingBlock(normalizedItems, host, w, h, columns);
      if (spot) {
        return [
          ...normalizedItems,
          {
            key: nextKey,
            kind: 'unit',
            unitId: anchor.unitId,
            label: null,
            x: spot.x,
            y: spot.y,
            w,
            h,
          },
        ];
      }
    }
  }

  // Otherwise, attach the wing directly to the bottom border of `anchor` and push any obstructing tiles below it down
  const w = Math.min(wingW, columns);
  const h = wingH;
  const attachedWing: MapItem = {
    key: nextKey,
    kind: 'unit',
    unitId: anchor.unitId,
    label: null,
    x: Math.max(0, Math.min(anchor.x, columns - w)),
    y: anchor.y + anchor.h,
    w,
    h,
  };

  const lockedKeys = new Set([...unitBlocks.map((b) => b.key), nextKey]);
  const byKey = resolveOverlapsWithLockedItems(
    [...normalizedItems.filter((i) => lockedKeys.has(i.key)), attachedWing],
    normalizedItems.filter((i) => !lockedKeys.has(i.key)),
  );
  return [...normalizedItems.map((i) => byKey.get(i.key)!), byKey.get(nextKey)!];
}

function resolveOverlapsWithLockedItems(
  lockedItems: ReadonlyArray<MapItem>,
  unlockedItems: ReadonlyArray<MapItem>,
): Map<string, MapItem> {
  const placed: MapItem[] = [...lockedItems];
  const sortedUnlocked = [...unlockedItems].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of sortedUnlocked) {
    const next = { ...it };
    while (placed.some((p) => tilesConflict(next, p))) next.y += 1;
    placed.push(next);
  }
  return new Map(placed.map((p) => [p.key, p]));
}

const MAGNET_SNAP_GAP = 1;
const LINE_ALIGN_TOL = 1;

function alignCoordToLines(val: number, targets: ReadonlyArray<number>, minVal: number, maxVal: number, tol = LINE_ALIGN_TOL): number {
  let best = val;
  let bestDiff = tol + 0.001;
  for (const t of targets) {
    if (t < minVal || t > maxVal) continue;
    const d = Math.abs(val - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = t;
    }
  }
  return best;
}

/**
 * Computes candidate coordinates along a shared border so that the two tiles' borders
 * fully touch (`100%` of the smaller tile's border length overlaps the neighbor's border without corner overhang),
 * snapping flush to start (`L-Corner`), end (`L-Corner`), or center (`T-Junction`) lines when within `LINE_ALIGN_TOL`.
 */
function computeFullBorderAlignedPositions(
  pos: number,
  len: number,
  sibPos: number,
  sibLen: number,
  maxLimit: number,
): number[] {
  const minFull = Math.max(0, Math.min(maxLimit, Math.min(sibPos, sibPos + sibLen - len)));
  const maxFull = Math.max(0, Math.min(maxLimit, Math.max(sibPos, sibPos + sibLen - len)));
  const distToFull = pos < minFull ? minFull - pos : pos > maxFull ? pos - maxFull : 0;

  const result: number[] = [];
  if (distToFull <= MAGNET_SNAP_GAP + 1) {
    const clampedFull = Math.max(minFull, Math.min(maxFull, pos));
    const lineTargets = [sibPos, sibPos + sibLen - len, Math.round(sibPos + (sibLen - len) / 2)];
    const aligned = alignCoordToLines(clampedFull, lineTargets, minFull, maxFull, LINE_ALIGN_TOL);
    result.push(aligned);
    if (clampedFull !== aligned) result.push(clampedFull);
  } else {
    const fallbackClamp = Math.max(0, Math.min(maxLimit, Math.max(sibPos - len + 1, Math.min(pos, sibPos + sibLen - 1))));
    const lineTargets = [sibPos, sibPos + sibLen - len, Math.round(sibPos + (sibLen - len) / 2)];
    const aligned = alignCoordToLines(fallbackClamp, lineTargets, 0, maxLimit, LINE_ALIGN_TOL);
    result.push(aligned);
    if (fallbackClamp !== aligned) result.push(fallbackClamp);
  }
  if (!result.includes(pos)) {
    result.push(pos);
  }
  return result;
}

/**
 * Universal size & length matching when `moved` snaps to `sib` on `side` (`'left' | 'right' | 'top' | 'bottom'`).
 * - Matches the shared border length (`candH = sib.h` on Left/Right; `candW = sib.w` on Top/Bottom).
 * - Fills exact gaps between two facing neighbors (`leftSib`..`rightSib` or `topSib`..`bottomSib`).
 * - Equalizes perpendicular depth when `moved` and `sib` are the same kind and close in size.
 */
let activeSnapAutoResize = false;
let activeAutoShape = true;

function getMatchedNeighborDimensions(
  moved: MapItem,
  sib: MapItem,
  side: 'left' | 'right' | 'top' | 'bottom',
  others: ReadonlyArray<MapItem>,
  columns: number,
): { w: number; h: number } {
  const baseW = Math.min(moved.w, columns);
  const baseH = moved.h;
  const bothLandmarks =
    moved.kind !== 'unit' &&
    moved.kind !== 'atrium' &&
    sib.kind !== 'unit' &&
    sib.kind !== 'atrium';
  const bothTransits = isTransitLandmark(moved.kind) && isTransitLandmark(sib.kind);
  const isArchWingPair =
    moved.kind === 'unit' &&
    sib.kind === 'unit' &&
    (side === 'left' || side === 'right') &&
    Boolean(
      parseUnitShapeMode(sib)?.startsWith('arch-') ||
        parseUnitShapeMode(moved)?.startsWith('arch-'),
    );

  if ((!activeSnapAutoResize && !bothTransits && !isArchWingPair) || moved.kind === 'marker') {
    return { w: baseW, h: baseH };
  }

  if (isCircleTile(moved)) {
    const targetSide = side === 'left' || side === 'right' ? sib.h : sib.w;
    if (targetSide >= 2 && targetSide <= 6 && (moved.kind === sib.kind || Math.abs(baseW - targetSide) <= 2)) {
      const sq = Math.min(columns, targetSide);
      return { w: sq, h: sq };
    }
    return { w: baseW, h: baseH };
  }

  let candW = baseW;
  let candH = baseH;

  if (side === 'left' || side === 'right') {
    // 1. Match vertical touching border length (`sib.h`)
    const shouldMatchH =
      moved.kind === sib.kind ||
      bothLandmarks ||
      bothTransits ||
      (moved.kind === 'unit' && sib.h >= 2 && sib.h <= 10) ||
      (moved.kind !== 'unit' && moved.kind !== 'atrium' && sib.h >= 2 && sib.h <= 6) ||
      Math.abs(baseH - sib.h) <= 3;
    if (shouldMatchH) {
      candH = Math.max(1, sib.h);
    }
    // 2. Equalize width (`sib.w`) if same kind or both landmarks
    if (
      bothTransits ||
      (bothLandmarks && Math.abs(baseW - sib.w) <= 4) ||
      (moved.kind === sib.kind && Math.abs(baseW - sib.w) <= 3)
    ) {
      candW = Math.max(1, Math.min(columns, sib.w));
    }
    // 3. Gap-fill between `sib` and an opposing neighbor on the other horizontal side
    if (!sib.angle) {
      for (const opp of others) {
        if (opp.key === sib.key || opp.angle) continue;
        const vOv = Math.min(sib.y + candH, opp.y + opp.h) - Math.max(sib.y, opp.y);
        if (vOv < 1) continue;
        const gapW = side === 'right' ? opp.x - (sib.x + sib.w) : sib.x - (opp.x + opp.w);
        if (gapW >= Math.max(2, baseW - 3) && gapW <= Math.min(columns, baseW + 4)) {
          candW = gapW;
          break;
        }
      }
    }
  } else {
    // 1. Match horizontal touching border length (`sib.w`)
    const shouldMatchW =
      moved.kind === sib.kind ||
      bothLandmarks ||
      bothTransits ||
      (moved.kind === 'unit' && sib.w >= 2 && sib.w <= 12) ||
      (moved.kind !== 'unit' && moved.kind !== 'atrium' && sib.w >= 2 && sib.w <= 6) ||
      Math.abs(baseW - sib.w) <= 3;
    if (shouldMatchW) {
      candW = Math.max(1, Math.min(columns, sib.w));
    }
    // 2. Equalize height (`sib.h`) if same kind or both landmarks
    if (
      bothTransits ||
      (bothLandmarks && Math.abs(baseH - sib.h) <= 4) ||
      (moved.kind === sib.kind && Math.abs(baseH - sib.h) <= 3)
    ) {
      candH = Math.max(1, sib.h);
    }
    // 3. Gap-fill between `sib` and an opposing neighbor on the other vertical side
    if (!sib.angle) {
      for (const opp of others) {
        if (opp.key === sib.key || opp.angle) continue;
        const hOv = Math.min(sib.x + candW, opp.x + opp.w) - Math.max(sib.x, opp.x);
        if (hOv < 1) continue;
        const gapH = side === 'bottom' ? opp.y - (sib.y + sib.h) : sib.y - (opp.y + opp.h);
        if (gapH >= Math.max(2, baseH - 3) && gapH <= baseH + 4) {
          candH = gapH;
          break;
        }
      }
    }
  }

  return { w: Math.max(1, Math.min(columns, candW)), h: Math.max(1, candH) };
}

/**
 * When a transit landmark (`stairs`, `escalator`, `info`) is dragged or placed inside an Atrium,
 * automatically snaps it flush side-by-side with any sibling transit landmark inside that same Atrium,
 * matching its exact width & height (`w, h`) and aligning on the exact same row (`y`) or column (`x`).
 */
function snapTransitLandmarkInsideAtrium(
  moved: MapItem,
  others: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  if (!isTransitLandmark(moved.kind) || moved.kind === 'marker') return null;
  const parentAtrium = others.find((o) => o.kind === 'atrium' && rectsOverlap(moved, o));
  if (!parentAtrium) return null;

  const innerSibs = others.filter(
    (o) =>
      o.key !== moved.key &&
      isTransitLandmark(o.kind) &&
      o.kind !== 'marker' &&
      rectsOverlap(o, parentAtrium),
  );
  if (innerSibs.length === 0) return null;

  let best: { cand: MapItem; score: number } | null = null;
  for (const sib of innerSibs) {
    const gx = Math.max(0, moved.x - (sib.x + sib.w), sib.x - (moved.x + moved.w));
    const gy = Math.max(0, moved.y - (sib.y + sib.h), sib.y - (moved.y + moved.h));
    if (Math.hypot(gx, gy) > MAGNET_SNAP_GAP + 4.5) continue;

    const candW = Math.max(1, Math.min(columns, sib.w));
    const candH = Math.max(1, sib.h);
    const spots: Array<{ x: number; y: number; rowPriority: number }> = [
      { x: sib.x + sib.w, y: sib.y, rowPriority: 0 },
      { x: sib.x - candW, y: sib.y, rowPriority: 0 },
      { x: sib.x, y: sib.y + sib.h, rowPriority: 1.5 },
      { x: sib.x, y: sib.y - candH, rowPriority: 1.5 },
    ];

    for (const sp of spots) {
      if (sp.x < 0 || sp.y < 0 || sp.x + candW > columns) continue;
      const cand: MapItem = {
        ...moved,
        x: sp.x,
        y: sp.y,
        w: candW,
        h: candH,
        angle: undefined,
      };
      if (others.some((o) => tilesConflict(cand, o))) continue;
      const dist = Math.hypot(sp.x - moved.x, sp.y - moved.y);
      const score = dist + sp.rowPriority;
      if (!best || score < best.score) {
        best = { cand, score };
      }
    }
  }

  return best ? best.cand : null;
}

/**
 * Finds the contiguous span (`min..max`) of a row or column of touching Units sharing the same border line (`edgeCoord`)
 * with `anchorUnit`, so a tile dragged alongside a Unit Row can auto-adjust its length to span the entire row.
 */
function findContiguousUnitRowSpan(
  anchorUnit: MapItem,
  others: ReadonlyArray<MapItem>,
  axis: 'x' | 'y',
  side: 'top' | 'bottom' | 'left' | 'right',
): { min: number; max: number; count: number } {
  const edgeVal =
    side === 'top'
      ? anchorUnit.y
      : side === 'bottom'
        ? anchorUnit.y + anchorUnit.h
        : side === 'left'
          ? anchorUnit.x
          : anchorUnit.x + anchorUnit.w;
  const alignedUnits = others.filter((u) => {
    if (u.kind !== 'unit' || u.angle) return false;
    if (side === 'top') return u.y === edgeVal;
    if (side === 'bottom') return u.y + u.h === edgeVal;
    if (side === 'left') return u.x === edgeVal;
    return u.x + u.w === edgeVal;
  });

  let min = axis === 'x' ? anchorUnit.x : anchorUnit.y;
  let max = axis === 'x' ? anchorUnit.x + anchorUnit.w : anchorUnit.y + anchorUnit.h;
  const included = new Set<string>([anchorUnit.key]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const u of alignedUnits) {
      if (included.has(u.key)) continue;
      const uStart = axis === 'x' ? u.x : u.y;
      const uEnd = axis === 'x' ? u.x + u.w : u.y + u.h;
      if (uEnd >= min && uStart <= max) {
        min = Math.min(min, uStart);
        max = Math.max(max, uEnd);
        included.add(u.key);
        expanded = true;
      }
    }
  }
  return { min, max, count: included.size };
}

function angularDiffDeg(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function getExactEdgeFaceAngleDeg(
  edge: 'top' | 'right' | 'bottom' | 'left',
  face: PolygonAtriumWorldFace,
): number {
  let rad = 0;
  if (edge === 'top') rad = Math.atan2(-face.nx, face.ny);
  else if (edge === 'bottom') rad = Math.atan2(face.nx, -face.ny);
  else if (edge === 'left') rad = Math.atan2(face.ny, face.nx);
  else rad = Math.atan2(-face.ny, -face.nx);
  return (((rad * 180) / Math.PI) % 360 + 360) % 360;
}

function getEdgeTaperFraction(
  tile: { kind: TileKind | string; label?: string | null },
  edge: 'top' | 'right' | 'bottom' | 'left',
): number {
  if (tile.kind !== 'unit') return 1;
  if (edge === 'top') {
    if (tile.label === 'unit:trapezoid') return 0.6;
    if (tile.label === 'unit:trapezoid-l' || tile.label === 'unit:trapezoid-r') return 0.72;
  } else if (edge === 'bottom') {
    if (tile.label === 'unit:trapezoid-ring') return 0.64;
  }
  return 1;
}

function findPolygonAtriumMagneticCandidate(
  moved: MapItem,
  atr: MapItem,
  others: ReadonlyArray<MapItem>,
  columns: number,
): { x: number; y: number; w: number; h: number; angle: number | undefined; label?: string | null; hasLabel?: boolean; dist: number } | null {
  const polyFaces = getPolygonAtriumWorldFaces(atr);
  if (!polyFaces || polyFaces.length === 0) return null;

  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const acx = atr.x + atr.w / 2;
  const acy = atr.y + atr.h / 2;
  const mcx = moved.x + w / 2;
  const mcy = moved.y + h / 2;

  // Allow transit landmarks (Escalator / Stairs / Info / Marker) overlapping an Atrium to stay in place
  if (isAtriumTransitOverlap(atr, moved)) {
    return null;
  }

  const gapX = Math.max(0, atr.x - (moved.x + w), moved.x - (atr.x + atr.w));
  const gapY = Math.max(0, atr.y - (moved.y + h), moved.y - (atr.y + atr.h));
  if (gapX > 10.0 || gapY > 10.0) return null;

  const vx = mcx - acx;
  const vy = mcy - acy;
  const vLen = Math.hypot(vx, vy) || 1;
  const dirX = vx / vLen;
  const dirY = vy / vLen;

  const rankedFaces = polyFaces
    .map((f) => ({ face: f, dot: dirX * f.nx + dirY * f.ny }))
    .filter((entry) => entry.dot > -0.25)
    .sort((a, b) => b.dot - a.dot);

  if (rankedFaces.length === 0) return null;

  const isTrap =
    moved.kind === 'unit' &&
    (moved.label === 'unit:trapezoid' ||
      moved.label === 'unit:trapezoid-l' ||
      moved.label === 'unit:trapezoid-r' ||
      moved.label === 'unit:trapezoid-ring');
  const resetUnitShapeToRect =
    moved.kind === 'unit' &&
    !isTrap &&
    isAutoAtriumSideCurveLabel(moved.label);
  const nextUnitLabel = resetUnitShapeToRect ? 'unit:rect' : moved.label;

  for (const { face: bestFace } of rankedFaces) {
    const fmx = (bestFace.x0 + bestFace.x1) * 0.5;
    const fmy = (bestFace.y0 + bestFace.y1) * 0.5;

    // Cardinal face (Top / Bottom, or Left / Right for non-trapezoid tiles) when Atrium itself is unrotated
    if (bestFace.isCardinal && !atr.angle && (!isTrap || Math.abs(bestFace.ny) > 0.9)) {
      if (gapX > 3.0 || gapY > 3.0) continue;
      const alignedAngle = undefined;
      if (Math.abs(bestFace.ny) > 0.9) {
        const touchEdge: 'top' | 'bottom' = bestFace.ny < 0 ? 'bottom' : 'top';
        const taperFrac = getEdgeTaperFraction({ ...moved, label: nextUnitLabel }, touchEdge);
        const candW =
          activeSnapAutoResize && bestFace.len >= 1.5
            ? Math.max(2, Math.min(columns, Math.round(bestFace.len / taperFrac)))
            : w;
        const candH = h;
        const cy = bestFace.ny < 0 ? atr.y - candH : atr.y + atr.h;
        if (cy >= 0) {
          const idealCx = Math.max(0, Math.min(columns - candW, Math.round(fmx - candW / 2)));
          const xCandidates = [
            idealCx,
            ...computeFullBorderAlignedPositions(moved.x, candW, atr.x, atr.w, columns - candW),
          ];
          for (const cx of xCandidates) {
            if (cx < 0 || cx + candW > columns) continue;
            const cand: MapItem = {
              ...moved,
              x: cx,
              y: cy,
              w: candW,
              h: candH,
              angle: alignedAngle,
              label: nextUnitLabel,
            };
            if (!others.some((o) => tilesConflict(cand, o))) {
              return {
                x: cx,
                y: cy,
                w: candW,
                h: candH,
                angle: alignedAngle,
                ...(resetUnitShapeToRect ? { label: nextUnitLabel, hasLabel: true } : {}),
                dist: Math.min(gapX + gapY, Math.hypot(cx - moved.x, cy - moved.y)),
              };
            }
          }
        }
        continue;
      } else {
        const candW = w;
        const candH =
          activeSnapAutoResize && bestFace.len >= 1.5
            ? Math.max(2, Math.round(bestFace.len))
            : h;
        const cx = bestFace.nx < 0 ? atr.x - candW : atr.x + atr.w;
        if (cx >= 0 && cx + candW <= columns) {
          const idealCy = Math.max(0, Math.round(fmy - candH / 2));
          const yCandidates =
            bestFace.len >= 1.5
              ? [idealCy, ...computeFullBorderAlignedPositions(moved.y, candH, atr.y, atr.h, 5000)]
              : computeFullBorderAlignedPositions(moved.y, candH, atr.y, atr.h, 5000);
          for (const cy of yCandidates) {
            if (cy < 0) continue;
            const cand: MapItem = {
              ...moved,
              x: cx,
              y: cy,
              w: candW,
              h: candH,
              angle: alignedAngle,
              label: nextUnitLabel,
            };
            if (!others.some((o) => tilesConflict(cand, o))) {
              return {
                x: cx,
                y: cy,
                w: candW,
                h: candH,
                angle: alignedAngle,
                ...(resetUnitShapeToRect ? { label: nextUnitLabel, hasLabel: true } : {}),
                dist: Math.min(gapX + gapY, Math.hypot(cx - moved.x, cy - moved.y)),
              };
            }
          }
        }
        continue;
      }
    }

    // Slanted / diagonal face (or Trapezoid on Left/Right face):
    // If an upright unit (`!moved.angle`) is placed across a walkway gap (`rawPerpGap > 2.0`),
    // do not force it to rotate to 45° unless it is already tilted or dragged close to the diagonal face (`<= 2.0` cells),
    // so upright corner units across a walkway can use 45° Cut Corner (`chamfer-*`) as in Photo 3.
    const rawPerpCenterDist = (mcx - fmx) * bestFace.nx + (mcy - fmy) * bestFace.ny;
    const rawPerpGap = Math.max(0, rawPerpCenterDist - h * 0.5);
    if (!moved.angle && rawPerpGap > 2.0 && !tilesConflict(moved, atr)) {
      continue;
    }

    const candidateEdges: Array<'bottom' | 'top'> = ['bottom', 'top'];
    let bestEdge: 'bottom' | 'top' = 'bottom';
    let bestExactDeg = getExactEdgeFaceAngleDeg('bottom', bestFace);
    let bestAngleDiff = angularDiffDeg(bestExactDeg, moved.angle ?? 0);

    for (const eName of candidateEdges) {
      const exactDeg = getExactEdgeFaceAngleDeg(eName, bestFace);
      const diff = angularDiffDeg(exactDeg, moved.angle ?? 0);
      if (diff < bestAngleDiff - 1e-3) {
        bestAngleDiff = diff;
        bestExactDeg = exactDeg;
        bestEdge = eName;
      }
    }

    let snappedDeg = Math.round(bestExactDeg);
    if (!bestFace.isCardinal && snappedDeg % 360 === 0) {
      snappedDeg = bestExactDeg >= 180 ? 359 : 1;
    }
    const alignedAngle = normalizeTileAngle(snappedDeg);

    const taperFrac = getEdgeTaperFraction({ ...moved, label: nextUnitLabel }, bestEdge);
    const targetSpan =
      bestFace.len >= 1.0
        ? Math.max(2, Math.min(columns, Math.round(bestFace.len / taperFrac)))
        : w;
    const targetDepth = Math.max(2, Math.min(h, targetSpan));

    const sizePairs: Array<[number, number]> = activeSnapAutoResize
      ? [[targetSpan, targetDepth]]
      : [[w, h]];
    if (activeSnapAutoResize && (targetSpan !== w || targetDepth !== h)) {
      sizePairs.push([w, h]);
    }

    const rawAlong = (mcx - fmx) * bestFace.tx + (mcy - fmy) * bestFace.ty;
    const maxAlong = Math.max(0, bestFace.len * 0.65);
    const clampedAlong = Math.max(-maxAlong, Math.min(maxAlong, rawAlong));
    const perpWalkwayOffset = rawPerpGap > 1.8 ? Math.round(rawPerpGap * 2) / 2 : 0;

    for (const [candW, candH] of sizePairs) {
      const alongSlots: number[] = [clampedAlong, 0];
      for (const o of others) {
        if (o.key === moved.key || o.kind === 'atrium' || o.kind === 'marker') continue;
        if (angularDiffDeg(o.angle ?? 0, alignedAngle ?? 0) <= 6) {
          const ocx = o.x + o.w * 0.5;
          const ocy = o.y + o.h * 0.5;
          const oAlong = (ocx - fmx) * bestFace.tx + (ocy - fmy) * bestFace.ty;
          const touchStep = (o.w + candW) * 0.5;
          alongSlots.push(oAlong + touchStep, oAlong - touchStep);
        }
      }

      let bestDiag: { x: number; y: number; dist: number; score: number } | null = null;
      for (const slotAlong of alongSlots) {
        const idealCenterX = fmx + bestFace.tx * slotAlong + bestFace.nx * (perpWalkwayOffset + candH * 0.5);
        const idealCenterY = fmy + bestFace.ty * slotAlong + bestFace.ny * (perpWalkwayOffset + candH * 0.5);
        const baseX = Math.round(idealCenterX - candW * 0.5);
        const baseY = Math.round(idealCenterY - candH * 0.5);

        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const cx = baseX + dx;
            const cy = baseY + dy;
            if (cx < 0 || cy < 0 || cx + candW > columns) continue;
            const cand: MapItem = {
              ...moved,
              x: cx,
              y: cy,
              w: candW,
              h: candH,
              angle: alignedAngle,
              label: nextUnitLabel,
            };
            if (others.some((o) => tilesConflict(cand, o))) continue;
            if (perpWalkwayOffset <= 0.1) {
              const match = matchSinglePolygonAtriumFaceForItem(cand, atr);
              if (!match || match.faceIndex !== bestFace.index) continue;
            }
            const centerDist = Math.hypot(cx + candW / 2 - idealCenterX, cy + candH / 2 - idealCenterY);
            const moveDist = Math.hypot(cx + candW / 2 - mcx, cy + candH / 2 - mcy);
            const score = centerDist * 3.0 + moveDist * 0.25;
            if (!bestDiag || score < bestDiag.score) {
              bestDiag = {
                x: cx,
                y: cy,
                dist: Math.min(gapX + gapY, moveDist),
                score,
              };
            }
          }
        }
      }

      if (bestDiag) {
        return {
          x: bestDiag.x,
          y: bestDiag.y,
          w: candW,
          h: candH,
          angle: alignedAngle,
          ...(resetUnitShapeToRect ? { label: nextUnitLabel, hasLabel: true } : {}),
          dist: bestDiag.dist,
        };
      }
    }
  }

  return null;
}

function findCircleCorridorMagneticCandidate(
  moved: MapItem,
  ring: MapItem,
  others: ReadonlyArray<MapItem>,
  columns: number,
): { x: number; y: number; w: number; h: number; angle: number | undefined; label: string | null; dist: number } | null {
  if (moved.kind !== 'unit' || !isCircleRingCorridor(ring)) return null;

  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const gapX = Math.max(0, ring.x - (moved.x + w), moved.x - (ring.x + ring.w));
  const gapY = Math.max(0, ring.y - (moved.y + h), moved.y - (ring.y + ring.h));
  if (gapX > 12.0 || gapY > 12.0) return null;

  const rcx = ring.x + ring.w * 0.5;
  const rcy = ring.y + ring.h * 0.5;
  const rxOut = Math.max(2, ring.w * 0.5);
  const ryOut = Math.max(2, ring.h * 0.5);
  const mcx = moved.x + w * 0.5;
  const mcy = moved.y + h * 0.5;
  const vx = mcx - rcx;
  const vy = mcy - rcy;

  const isMultiBlockUnit = Boolean(
    moved.unitId && others.some((o) => o.kind === 'unit' && o.unitId === moved.unitId),
  );

  if (Math.hypot(vx, vy) < 0.25) return null;

  const closestPt = getClosestPointOnTileToPoint(moved, rcx, rcy);
  const normClosest = Math.hypot((closestPt.x - rcx) / rxOut, (closestPt.y - rcy) / ryOut);
  const avgR = (rxOut + ryOut) * 0.5;
  const radialGap = (normClosest - 1) * avgR;
  if (radialGap > 12.0) return null;

  const ringPeer = others.find((o) => {
    if (o.key === moved.key || o.kind !== 'unit' || !isRingSectorUnitLabel(o.label)) return false;
    const m = findNearestCircleCorridorForUnit(o, [ring]);
    return Boolean(m && m.isNear && m.ring.key === ring.key);
  });

  const rawThetaCheck = Math.atan2(vy / ryOut, vx / rxOut);
  const mDistCheck = Math.hypot(vx, vy);
  const isArchWingMoved = Boolean(moved.label?.startsWith('unit:arch-'));
  const rimOccupiedAtTheta = others.some((o) => {
    if (o.key === moved.key || o.kind !== 'unit' || !isRingSectorUnitLabel(o.label)) return false;
    const m = findNearestCircleCorridorForUnit(o, [ring]);
    if (!m || !m.isNear || m.ring.key !== ring.key) return false;
    const oTheta = resolveUnitCircleSectorTheta(o, rcx, rcy, rxOut, ryOut);
    const oRIn = Math.hypot(rxOut * Math.cos(oTheta), ryOut * Math.sin(oTheta)) || avgR;
    const oMetrics = computeRingSectorArcMetrics(o.w, o.h, oRIn);
    const angDiff = Math.abs(Math.atan2(Math.sin(rawThetaCheck - oTheta), Math.cos(rawThetaCheck - oTheta)));
    const oDist = Math.hypot(o.x + o.w * 0.5 - rcx, o.y + o.h * 0.5 - rcy);
    return angDiff <= oMetrics.halfAngle * 1.15 && mDistCheck > oDist + 1.0 && radialGap >= 1.5;
  });

  // Detect if there is an existing `ring-curve` or `trapezoid-ring` neighbor on this Circle Atrium
  // so dragging a default/auto unit next to it automatically chains it as a continuous Fan Sector (`ring-curve`).
  const nearbyRingSectorNeighbor =
    moved.kind === 'unit' &&
    !isMultiBlockUnit &&
    !isArchWingMoved &&
    !rimOccupiedAtTheta &&
    activeAutoShape &&
    (!moved.label || moved.label === 'unit:rect' || isAutoAtriumSideCurveLabel(moved.label)) &&
    radialGap <= 8.5
      ? others.find((o) => {
          if (o.key === moved.key || o.kind !== 'unit' || !isRingSectorUnitLabel(o.label)) return false;
          const m = findNearestCircleCorridorForUnit(o, [ring]);
          if (!m || !m.isNear || m.ring.key !== ring.key) return false;
          const gx = Math.max(0, moved.x - (o.x + o.w), o.x - (moved.x + w));
          const gy = Math.max(0, moved.y - (o.y + o.h), o.y - (moved.y + h));
          return Math.hypot(gx, gy) <= 8.5;
        })
      : undefined;

  // Upright units (not explicitly set to fan-sector ring-curve / trapezoid-ring and not chaining onto one) keep straight outer walls (0°)
  // and hug the Circle Atrium perimeter using Side-Curve (crescent-* / notch-*) when Auto-Shape is ON.
  if (
    moved.kind === 'unit' &&
    !isRingSectorUnitLabel(moved.label) &&
    !nearbyRingSectorNeighbor
  ) {
    const conflictsWithRing = tilesConflict(moved, ring);
    if (!conflictsWithRing && radialGap > 1.5) {
      return null;
    }
    const rawThetaUpright = Math.atan2(vy / ryOut, vx / rxOut);
    const rimX = rcx + rxOut * Math.cos(rawThetaUpright);
    const rimY = rcy + ryOut * Math.sin(rawThetaUpright);
    const shiftX = conflictsWithRing ? rimX - closestPt.x : 0;
    const shiftY = conflictsWithRing ? rimY - closestPt.y : 0;
    const baseX = Math.max(0, Math.min(columns - w, Math.round(moved.x + shiftX)));
    const baseY = Math.max(0, Math.round(moved.y + shiftY));

    let bestUpright: { x: number; y: number; label: string | null; dist: number; score: number } | null = null;
    const searchRange = conflictsWithRing ? 5 : 2;
    for (let dy = -searchRange; dy <= searchRange; dy++) {
      for (let dx = -searchRange; dx <= searchRange; dx++) {
        const cx = baseX + dx;
        const cy = baseY + dy;
        if (cx < 0 || cy < 0 || cx + w > columns) continue;
        const testRect = { ...moved, x: cx, y: cy, w, h, angle: undefined };
        const cp = getClosestPointOnTileToPoint(testRect, rcx, rcy);
        const normCp = Math.hypot((cp.x - rcx) / rxOut, (cp.y - rcy) / ryOut);
        if (normCp > 1.35) continue;

        let nextLabel: string | null = moved.label ?? null;
        if (!activeAutoShape) {
          nextLabel = moved.label || 'unit:rect';
        } else if (!moved.label || moved.label === 'unit:rect' || isAutoAtriumSideCurveLabel(moved.label)) {
          const mode = resolveAtriumFacingSideCurveMode(testRect, {
            ring,
            cx: rcx,
            cy: rcy,
            rxOut,
            ryOut,
          });
          nextLabel = `unit:${mode}:auto`;
        }
        const cand: MapItem = {
          ...testRect,
          label: nextLabel,
        };
        if (tilesConflict(cand, ring) || others.some((o) => tilesConflict(cand, o))) continue;

        const moveDist = Math.hypot(cx - moved.x, cy - moved.y);
        const rimErr = Math.max(0, normCp - 1.0) * avgR;
        const alignsNeighbor = others.some(
          (o) =>
            o.kind === 'unit' &&
            !o.angle &&
            ((Math.abs(o.x - cx) === 0 && (o.y + o.h === cy || cy + h === o.y)) ||
              (Math.abs(o.y - cy) === 0 && (o.x + o.w === cx || cx + w === o.x))),
        );
        const score = rimErr * 2.4 + moveDist * 0.65 - (alignsNeighbor ? 1.2 : 0);
        if (!bestUpright || score < bestUpright.score) {
          bestUpright = {
            x: cx,
            y: cy,
            label: nextLabel,
            dist: moveDist,
            score,
          };
        }
      }
    }

    if (!bestUpright) return null;
    if (
      !conflictsWithRing &&
      bestUpright.x === moved.x &&
      bestUpright.y === moved.y &&
      bestUpright.label === moved.label &&
      !moved.angle
    ) {
      return null;
    }
    return {
      x: bestUpright.x,
      y: bestUpright.y,
      w,
      h,
      angle: undefined,
      label: bestUpright.label,
      dist: bestUpright.dist,
    };
  }

  const rawTheta = Math.atan2(vy / ryOut, vx / rxOut);
  const sizeRef = nearbyRingSectorNeighbor ?? ringPeer;
  const candW =
    isMultiBlockUnit || isCircleTile(moved)
      ? w
      : sizeRef
        ? Math.min(columns, sizeRef.w)
        : activeSnapAutoResize
          ? Math.min(columns, Math.max(w, h))
          : w;
  const candH =
    isMultiBlockUnit || isCircleTile(moved)
      ? h
      : sizeRef
        ? sizeRef.h
        : activeSnapAutoResize
          ? Math.min(w, h)
          : h;

  const candidateSlots: Array<{ theta: number; isNeighborSlot: boolean }> = [];
  const ringNeighbors: Array<{ oTheta: number; touchDelta: number }> = [];
  let nearAnyRingNeighbor = false;

  for (const o of others) {
    if (o.key === moved.key || o.kind !== 'unit' || !isRingSectorUnitLabel(o.label)) continue;
    const m = findNearestCircleCorridorForUnit(o, [ring]);
    if (!m || !m.isNear || m.ring.key !== ring.key) continue;

    const oTheta = resolveUnitCircleSectorTheta(o, rcx, rcy, rxOut, ryOut);
    const oRIn = Math.hypot(rxOut * Math.cos(oTheta), ryOut * Math.sin(oTheta)) || avgR;
    const oMetrics = computeRingSectorArcMetrics(o.w, o.h, oRIn);
    const movedMetricsAtO = computeRingSectorArcMetrics(candW, candH, oRIn);
    const touchDelta = oMetrics.halfAngle + movedMetricsAtO.halfAngle;
    ringNeighbors.push({ oTheta, touchDelta });

    const diff = Math.atan2(Math.sin(rawTheta - oTheta), Math.cos(rawTheta - oTheta));
    if (Math.abs(diff) <= touchDelta + (75 * Math.PI) / 180) {
      if (Math.abs(diff) <= touchDelta + (55 * Math.PI) / 180) {
        nearAnyRingNeighbor = true;
      }
      candidateSlots.push({
        theta: oTheta + (diff >= 0 ? touchDelta : -touchDelta),
        isNeighborSlot: true,
      });
      candidateSlots.push({
        theta: oTheta + (diff >= 0 ? -touchDelta : touchDelta),
        isNeighborSlot: true,
      });
    }
  }

  if (!nearAnyRingNeighbor) {
    candidateSlots.unshift({ theta: rawTheta, isNeighborSlot: false });
  } else {
    candidateSlots.push({ theta: rawTheta, isNeighborSlot: false });
  }

  let bestCand: { x: number; y: number; angle: number | undefined; label: string | null; dist: number; score: number } | null = null;

  for (const slot of candidateSlots) {
    const theta = slot.theta;

    // Prevent any two Fan / Ring Sectors on the same Circle Atrium from overlapping angularly
    const hasAngularOverlap = ringNeighbors.some((rn) => {
      const angDiff = Math.abs(Math.atan2(Math.sin(theta - rn.oTheta), Math.cos(theta - rn.oTheta)));
      return angDiff < rn.touchDelta * 0.94;
    });
    if (hasAngularOverlap) continue;

    const bx = rcx + rxOut * Math.cos(theta);
    const by = rcy + ryOut * Math.sin(theta);
    const gnx = Math.cos(theta) / rxOut;
    const gny = Math.sin(theta) / ryOut;
    const gLen = Math.hypot(gnx, gny) || 1;
    const nx = gnx / gLen;
    const ny = gny / gLen;

    const alignedAngle = normalizeTileAngle(computeCircleTangentUprightAngleDeg(nx, ny));
    const thetaDeg = (theta * 180) / Math.PI;
    const isTrapRing =
      Boolean(moved.label?.startsWith('unit:trapezoid-ring')) ||
      Boolean(sizeRef?.label?.startsWith('unit:trapezoid-ring'));

    const slotLabel =
      moved.kind === 'unit'
        ? isTrapRing
          ? `unit:trapezoid-ring:a=${thetaDeg.toFixed(2)}`
          : `unit:ring-curve:a=${thetaDeg.toFixed(2)}`
        : (moved.label ?? null);

    const rInAtTheta = Math.hypot(bx - rcx, by - rcy) || avgR;
    const slotMetrics = computeRingSectorArcMetrics(candW, candH, rInAtTheta);
    const cosHalf = Math.cos(slotMetrics.halfAngle);
    const idealCenterX = rcx + rxOut * Math.cos(theta) * cosHalf + nx * (0.5 * candH);
    const idealCenterY = rcy + ryOut * Math.sin(theta) * cosHalf + ny * (0.5 * candH);
    const baseX = Math.round(idealCenterX - candW * 0.5);
    const baseY = Math.round(idealCenterY - candH * 0.5);

    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const cx = baseX + dx;
        const cy = baseY + dy;
        if (cx < 0 || cy < 0 || cx + candW > columns) continue;
        const cand: MapItem = {
          ...moved,
          x: cx,
          y: cy,
          w: candW,
          h: candH,
          angle: alignedAngle,
          label: slotLabel,
        };
        if (
          others.some((o) => {
            if (isTransitLandmark(o.kind) && rectsOverlap(o, ring)) return false;
            return tilesConflict(cand, o);
          })
        ) {
          continue;
        }
        if (moved.kind === 'unit') {
          const m = findNearestCircleCorridorForUnit(cand, [ring]);
          if (!m || !m.isNear) continue;
        }
        const centerDist = Math.hypot(cx + candW * 0.5 - idealCenterX, cy + candH * 0.5 - idealCenterY);
        const moveDist = Math.hypot(cx + candW * 0.5 - mcx, cy + candH * 0.5 - mcy);
        const slotBonus = slot.isNeighborSlot ? -7.5 : 0;
        const score = centerDist * 4.5 + moveDist * 0.35 + slotBonus;
        if (!bestCand || score < bestCand.score) {
          bestCand = {
            x: cx,
            y: cy,
            angle: alignedAngle,
            label: slotLabel,
            dist: slot.isNeighborSlot ? Math.min(moveDist, MAGNET_SNAP_GAP + 1.5) : Math.min(Math.hypot(gapX, gapY), moveDist),
            score,
          };
        }
      }
    }
  }

  if (!bestCand) return null;
  return {
    x: bestCand.x,
    y: bestCand.y,
    w: candW,
    h: candH,
    angle: bestCand.angle,
    label: bestCand.label,
    dist: bestCand.dist,
  };
}

/**
 * Automatically rotates and aligns a `ring-curve` or `trapezoid-ring` unit tangent to the nearest Circle Atrium.
 */
export function alignUnitToNearestCircleAtrium(
  unit: MapItem,
  allItems: ReadonlyArray<MapItem>,
  columns: number,
): MapItem {
  if (unit.kind !== 'unit') return unit;
  const match = findNearestCircleCorridorForUnit(unit, allItems);
  if (!match || !match.isNear) return unit;

  const others = allItems.filter((o) => o.key !== unit.key);
  const ringItem = allItems.find((o) => o.key === match.ring.key);
  const cand = ringItem ? findCircleCorridorMagneticCandidate(unit, ringItem, others, columns) : null;
  if (cand && cand.dist <= 8.0) {
    return {
      ...unit,
      x: cand.x,
      y: cand.y,
      w: cand.w,
      h: cand.h,
      angle: cand.angle,
      label: cand.label ?? unit.label,
    };
  }

  const ucx = unit.x + unit.w * 0.5;
  const ucy = unit.y + unit.h * 0.5;
  const theta = Math.atan2((ucy - match.cy) / match.ryOut, (ucx - match.cx) / match.rxOut);
  const gnx = Math.cos(theta) / match.rxOut;
  const gny = Math.sin(theta) / match.ryOut;
  const gLen = Math.hypot(gnx, gny) || 1;
  const nx = gnx / gLen;
  const ny = gny / gLen;
  const alignedAngle = normalizeTileAngle(computeCircleTangentUprightAngleDeg(nx, ny));
  const thetaDeg = (theta * 180) / Math.PI;
  const isTrap = Boolean(unit.label?.startsWith('unit:trapezoid-ring'));
  return {
    ...unit,
    angle: alignedAngle,
    label: isTrap ? `unit:trapezoid-ring:a=${thetaDeg.toFixed(2)}` : `unit:ring-curve:a=${thetaDeg.toFixed(2)}`,
  };
}

/**
 * When the last active anchor unit is a `ring-curve` or `trapezoid-ring` sector around a Circle Atrium,
 * automatically computes the next clockwise contiguous Fan Sector slot (`x, y, w, h, angle, label`)
 * so clicking `Place` sequentially builds a continuous curved ring (like `F-103 -> F-107 -> F-108 -> F-119 -> F-111 -> F-114`).
 */
export function findNextRingSectorPlacement(
  items: ReadonlyArray<MapItem>,
  anchor: MapItem | null | undefined,
  unitId: string,
  newKey: string,
  columns: number,
): MapItem | null {
  if (!anchor || anchor.kind !== 'unit' || !isRingSectorUnitLabel(anchor.label)) return null;
  const match = findNearestCircleCorridorForUnit(anchor, items);
  if (!match || !match.isNear) return null;
  const ringItem = items.find((o) => o.key === match.ring.key);
  if (!ringItem) return null;

  const anchorTheta = resolveUnitCircleSectorTheta(anchor, match.cx, match.cy, match.rxOut, match.ryOut);
  const rIn =
    Math.hypot(match.rxOut * Math.cos(anchorTheta), match.ryOut * Math.sin(anchorTheta)) ||
    (match.rxOut + match.ryOut) * 0.5;
  const anchorMetrics = computeRingSectorArcMetrics(anchor.w, anchor.h, rIn);
  const stepTheta = anchorMetrics.spanAngle;

  const stepMultipliers = [1, 2, 3, 4, 5, 6, 7, 8, -1, -2];
  for (const mult of stepMultipliers) {
    const theta = anchorTheta + mult * stepTheta;
    const gnx = Math.cos(theta) / match.rxOut;
    const gny = Math.sin(theta) / match.ryOut;
    const gLen = Math.hypot(gnx, gny) || 1;
    const nx = gnx / gLen;
    const ny = gny / gLen;
    const rInAtStep =
      Math.hypot(match.rxOut * Math.cos(theta), match.ryOut * Math.sin(theta)) ||
      (match.rxOut + match.ryOut) * 0.5;
    const stepMetrics = computeRingSectorArcMetrics(anchor.w, anchor.h, rInAtStep);
    const cosHalf = Math.cos(stepMetrics.halfAngle);
    const idealCx = match.cx + match.rxOut * Math.cos(theta) * cosHalf + nx * (0.5 * anchor.h);
    const idealCy = match.cy + match.ryOut * Math.sin(theta) * cosHalf + ny * (0.5 * anchor.h);
    const probeX = Math.max(0, Math.min(columns - anchor.w, Math.round(idealCx - anchor.w * 0.5)));
    const probeY = Math.max(0, Math.round(idealCy - anchor.h * 0.5));
    const probeItem: MapItem = {
      key: newKey,
      kind: 'unit',
      unitId,
      label: anchor.label,
      x: probeX,
      y: probeY,
      w: anchor.w,
      h: anchor.h,
    };
    const cand = findCircleCorridorMagneticCandidate(probeItem, ringItem, items, columns);
    if (!cand) continue;
    const candCx = cand.x + cand.w * 0.5;
    const candCy = cand.y + cand.h * 0.5;
    if (Math.hypot(candCx - idealCx, candCy - idealCy) > 3.5) continue;
    const placed: MapItem = {
      key: newKey,
      kind: 'unit',
      unitId,
      label: cand.label ?? anchor.label,
      x: cand.x,
      y: cand.y,
      w: cand.w,
      h: cand.h,
      angle: cand.angle,
    };
    if (!items.some((o) => tilesConflict(placed, o))) {
      return placed;
    }
  }
  return null;
}

/**
 * Universal rotated neighbor magnetic snap:
 * When ANY tile (`moved`) is dragged near or overlapping ANY rotated tile (`sib` with `sib.angle !== 0`),
 * projects `moved` into `sib`'s rotated coordinate frame `(ux, uy, vx, vy)`, matches `sib`'s rotation degree (`sib.angle`),
 * matches the touching border length/size (`candW`, `candH`), and snaps flush against the nearest rotated border of `sib`.
 */
function findRotatedNeighborMagneticCandidate(
  moved: MapItem,
  sib: MapItem,
  others: ReadonlyArray<MapItem>,
  columns: number,
): { x: number; y: number; w: number; h: number; angle: number | undefined; label?: string | null; hasLabel?: boolean; dist: number } | null {
  if (!sib.angle || sib.kind === 'marker' || moved.kind !== 'unit') return null;
  if (isRingSectorUnitLabel(sib.label)) return null;
  if (sib.kind === 'atrium' && (getPolygonAtriumWorldFaces(sib) || isCircleRingCorridor(sib))) return null;
  if (isAtriumTransitOverlap(sib, moved)) {
    const scx = sib.x + sib.w * 0.5;
    const scy = sib.y + sib.h * 0.5;
    const mcx = moved.x + moved.w * 0.5;
    const mcy = moved.y + moved.h * 0.5;
    if (Math.hypot(mcx - scx, mcy - scy) < Math.min(sib.w, sib.h) * 0.4) return null;
  }

  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const fs = getLocalTileFrame(sib);
  const scx = sib.x + sib.w * 0.5;
  const scy = sib.y + sib.h * 0.5;
  const mcx = moved.x + w * 0.5;
  const mcy = moved.y + h * 0.5;
  const relU = (mcx - scx) * fs.ux + (mcy - scy) * fs.uy;
  const relV = (mcx - scx) * fs.vx + (mcy - scy) * fs.vy;

  const gapU = Math.max(0, Math.abs(relU) - (sib.w * 0.5 + w * 0.5));
  const gapV = Math.max(0, Math.abs(relV) - (sib.h * 0.5 + h * 0.5));
  if (gapU > MAGNET_SNAP_GAP + 0.5 || gapV > MAGNET_SNAP_GAP + 0.5) return null;
  if (!activeSnapAutoResize && !moved.angle && !rotatedWorldBoundsOverlap(moved, sib)) return null;

  const alignedAngle = sib.angle;
  const canAutoAdjustShape =
    moved.kind === 'unit' && (!moved.label || moved.label === 'unit:rect' || isAutoAtriumSideCurveLabel(moved.label));
  const shouldInheritUnitShape = activeAutoShape && canAutoAdjustShape && sib.kind === 'unit';
  const inheritedSibLabel =
    sib.label && sib.label.startsWith('unit:')
      ? sib.label.endsWith(':auto')
        ? sib.label
        : `${sib.label}:auto`
      : 'unit:rect';
  const nextLabel = shouldInheritUnitShape
    ? inheritedSibLabel
    : !activeAutoShape && moved.kind === 'unit'
      ? moved.label || 'unit:rect'
      : canAutoAdjustShape && isAutoAtriumSideCurveLabel(moved.label)
        ? 'unit:rect'
        : moved.label;
  const hasLabelChange = nextLabel !== moved.label;

  const sides: Array<{ side: 'right' | 'left' | 'bottom' | 'top'; approachScore: number }> = [
    {
      side: 'right',
      approachScore:
        Math.abs(relU - (sib.w * 0.5 + w * 0.5)) +
        Math.max(0, Math.abs(relV) - sib.h * 0.5) * 0.7 +
        (relU < -0.2 ? 8 : 0),
    },
    {
      side: 'left',
      approachScore:
        Math.abs(relU + (sib.w * 0.5 + w * 0.5)) +
        Math.max(0, Math.abs(relV) - sib.h * 0.5) * 0.7 +
        (relU > 0.2 ? 8 : 0),
    },
    {
      side: 'bottom',
      approachScore:
        Math.abs(relV - (sib.h * 0.5 + h * 0.5)) +
        Math.max(0, Math.abs(relU) - sib.w * 0.5) * 0.7 +
        (relV < -0.2 ? 8 : 0),
    },
    {
      side: 'top',
      approachScore:
        Math.abs(relV + (sib.h * 0.5 + h * 0.5)) +
        Math.max(0, Math.abs(relU) - sib.w * 0.5) * 0.7 +
        (relV > 0.2 ? 8 : 0),
    },
  ];
  sides.sort((a, b) => a.approachScore - b.approachScore);

  for (const { side } of sides) {
    const matched = getMatchedNeighborDimensions(moved, sib, side, others, columns);
    const sizePairs: Array<[number, number]> = [[matched.w, matched.h]];
    if (matched.w !== w || matched.h !== h) {
      sizePairs.push([w, h]);
    }

    for (const [candW, candH] of sizePairs) {
      const targetCoords: Array<[number, number]> = [];
      if (side === 'right' || side === 'left') {
        const targetU = (side === 'right' ? 1 : -1) * (sib.w * 0.5 + candW * 0.5);
        const halfDiffV = (sib.h - candH) * 0.5;
        const clampedV = Math.max(-Math.abs(halfDiffV), Math.min(Math.abs(halfDiffV), relV));
        const vList = Array.from(new Set([0, -halfDiffV, halfDiffV, clampedV]));
        vList.sort((a, b) => Math.abs(a - relV) - Math.abs(b - relV));
        for (const tv of vList) targetCoords.push([targetU, tv]);
      } else {
        const targetV = (side === 'bottom' ? 1 : -1) * (sib.h * 0.5 + candH * 0.5);
        const halfDiffU = (sib.w - candW) * 0.5;
        const clampedU = Math.max(-Math.abs(halfDiffU), Math.min(Math.abs(halfDiffU), relU));
        const uList = Array.from(new Set([0, -halfDiffU, halfDiffU, clampedU]));
        uList.sort((a, b) => Math.abs(a - relU) - Math.abs(b - relU));
        for (const tu of uList) targetCoords.push([tu, targetV]);
      }

      let bestMatch = null as { x: number; y: number; dist: number; score: number } | null;
      for (let tIdx = 0; tIdx < targetCoords.length; tIdx++) {
        const [tu, tv] = targetCoords[tIdx];
        const idealCx = scx + tu * fs.ux + tv * fs.vx;
        const idealCy = scy + tu * fs.uy + tv * fs.vy;
        const baseX = Math.round(idealCx - candW * 0.5);
        const baseY = Math.round(idealCy - candH * 0.5);

        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const cx = baseX + dx;
            const cy = baseY + dy;
            if (cx < 0 || cy < 0 || cx + candW > columns) continue;
            const cand: MapItem = {
              ...moved,
              x: cx,
              y: cy,
              w: candW,
              h: candH,
              angle: alignedAngle,
              ...(hasLabelChange ? { label: nextLabel } : {}),
            };
            if (others.some((o) => tilesConflict(cand, o))) continue;
            const centerErr = Math.hypot(cx + candW * 0.5 - idealCx, cy + candH * 0.5 - idealCy);
            if (centerErr > 1.35) continue;
            const moveDist = Math.hypot(cx + candW * 0.5 - mcx, cy + candH * 0.5 - mcy);
            const score = centerErr * 3.2 + moveDist * 0.25 + tIdx * 0.15;
            if (!bestMatch || score < bestMatch.score) {
              bestMatch = {
                x: cx,
                y: cy,
                dist: Math.min(Math.hypot(gapU, gapV), moveDist),
                score,
              };
            }
          }
        }
        if (bestMatch) break;
      }

      if (bestMatch) {
        return {
          x: bestMatch.x,
          y: bestMatch.y,
          w: candW,
          h: candH,
          angle: alignedAngle,
          ...(hasLabelChange ? { label: nextLabel, hasLabel: true } : {}),
          dist: bestMatch.dist,
        };
      }
    }
  }

  return null;
}

function findOuterRingWingMagneticCandidate(
  moved: MapItem,
  others: ReadonlyArray<MapItem>,
  columns: number,
): { x: number; y: number; w: number; h: number; angle: number | undefined; label: string | null; dist: number } | null {
  if (moved.kind !== 'unit' || isRingSectorUnitLabel(moved.label) || parseUnitShapeMode(moved) === 'circle') {
    return null;
  }
  const w = Math.min(moved.w, columns);
  const h = moved.h;
  if (w < 3 || h < 4) return null;

  const isExplicitArch = Boolean(moved.label?.startsWith('unit:arch-'));
  const canAutoAdjustShape =
    isExplicitArch ||
    (activeAutoShape && (!moved.label || moved.label === 'unit:rect' || isAutoAtriumSideCurveLabel(moved.label)));
  if (!canAutoAdjustShape) return null;

  const match = findNearestCircleCorridorForUnit(moved, others);
  if (!match || match.boxGap > 11.0) return null;

  const mcx = moved.x + w * 0.5;
  const mcy = moved.y + h * 0.5;
  const mDist = Math.hypot(mcx - match.cx, mcy - match.cy);

  const explicitMode = parseUnitShapeMode(moved);
  const archMode: 'arch-tl' | 'arch-tr' | 'arch-bl' | 'arch-br' =
    explicitMode === 'arch-tl' ||
    explicitMode === 'arch-tr' ||
    explicitMode === 'arch-bl' ||
    explicitMode === 'arch-br'
      ? explicitMode
      : mcx < match.cx && mcy < match.cy
        ? 'arch-tl'
        : mcx >= match.cx && mcy < match.cy
          ? 'arch-tr'
          : mcx < match.cx && mcy >= match.cy
            ? 'arch-bl'
            : 'arch-br';

  const existingArchInQuadrant = others.some((o) => {
    if (o.key === moved.key || o.kind !== 'unit') return false;
    if (parseUnitShapeMode(o) !== archMode) return false;
    const ocx = o.x + o.w * 0.5;
    const ocy = o.y + o.h * 0.5;
    return Math.hypot(ocx - match.cx, ocy - match.cy) < mDist + 0.5;
  });
  if (existingArchInQuadrant) return null;

  const isRightWing = archMode === 'arch-tr' || archMode === 'arch-br';
  const isTopWing = archMode === 'arch-tl' || archMode === 'arch-tr';

  const quadRingUnits: MapItem[] = [];
  let nearAnyQuadRing = false;
  let maxRingH = 0;

  for (const o of others) {
    if (o.key === moved.key || o.kind !== 'unit' || !isRingSectorUnitLabel(o.label)) continue;
    const m = findNearestCircleCorridorForUnit(o, [match.ring]);
    if (!m || !m.isNear) continue;
    maxRingH = Math.max(maxRingH, o.h);
    const ocx = o.x + o.w * 0.5;
    const ocy = o.y + o.h * 0.5;
    const inHorizHalf = isRightWing ? ocx >= match.cx - 0.5 : ocx <= match.cx + 0.5;
    const inVertHalf = isTopWing ? ocy <= match.cy + 0.5 : ocy >= match.cy - 0.5;
    if (!inHorizHalf || !inVertHalf) continue;
    quadRingUnits.push(o);
    const gx = Math.max(0, moved.x - (o.x + o.w), o.x - (moved.x + w));
    const gy = Math.max(0, moved.y - (o.y + o.h), o.y - (moved.y + h));
    const oDist = Math.hypot(ocx - match.cx, ocy - match.cy);
    if (Math.hypot(gx, gy) <= MAGNET_SNAP_GAP + 3.5 && (isExplicitArch || mDist > oDist + 0.8)) {
      nearAnyQuadRing = true;
    }
  }

  if (quadRingUnits.length === 0 || !nearAnyQuadRing) return null;

  const quadMinY = Math.min(...quadRingUnits.map((o) => o.y));
  const quadMaxY = Math.max(...quadRingUnits.map((o) => o.y + o.h));
  const quadSpanH = Math.max(4, quadMaxY - quadMinY);
  const candW = w;
  const candH = activeSnapAutoResize || Math.abs(h - quadSpanH) <= 2 ? quadSpanH : h;
  const targetY = isTopWing ? Math.max(0, quadMinY) : Math.max(0, quadMaxY - candH);

  const rxCut = match.rxOut + maxRingH + 0.24;
  const ryCut = match.ryOut + maxRingH + 0.24;
  const wyFoot = isTopWing ? targetY + candH : targetY;
  const dyNorm = Math.min(0.95, Math.abs(wyFoot - match.cy) / Math.max(1, ryCut));
  const dxCut = rxCut * Math.sqrt(Math.max(0, 1 - dyNorm * dyNorm));
  const xFoot = isRightWing ? match.cx + dxCut : match.cx - dxCut;
  const idealX = isRightWing ? Math.round(xFoot - 0.68 * candW) : Math.round(xFoot - 0.32 * candW);

  const nextLabel =
    isExplicitArch && !moved.label?.endsWith(':auto')
      ? moved.label!
      : `unit:${archMode}:auto`;

  const xOffsets = [0, 1, -1, 2, -2, 3];
  const yOffsets = [0, 1, -1];
  for (const dy of yOffsets) {
    const cy = targetY + dy;
    if (cy < 0) continue;
    for (const dx of xOffsets) {
      const cx = idealX + dx;
      if (cx < 0 || cx + candW > columns) continue;
      const cand: MapItem = {
        ...moved,
        x: cx,
        y: cy,
        w: candW,
        h: candH,
        angle: undefined,
        label: nextLabel,
      };
      if (others.some((o) => tilesConflict(cand, o))) continue;
      return {
        x: cx,
        y: cy,
        w: candW,
        h: candH,
        angle: undefined,
        label: nextLabel,
        dist: Math.hypot(cx - moved.x, cy - moved.y) * 0.5,
      };
    }
  }

  return null;
}

function getSlantedUnitNeighborSnapMeta(
  moved: MapItem,
  sib: MapItem,
  candH: number,
  baseYPositions: number[],
  side?: 'left' | 'right',
): { yPositions: number[]; inheritedLabel: string | null } {
  if (!activeAutoShape || moved.kind !== 'unit' || sib.kind !== 'unit') {
    return { yPositions: baseYPositions, inheritedLabel: null };
  }
  const canAutoAdjustShape =
    !moved.label || moved.label === 'unit:rect' || isAutoAtriumSideCurveLabel(moved.label);
  const sibMode = parseUnitShapeMode(sib);
  const movedMode = parseUnitShapeMode(moved);

  // Pair Outer Ring Concave Wing (`arch-*`, e.g. GFL-A3) with its adjacent Kiosk Concave Notch partner (`notch-*`, e.g. GFL-A30)
  const isSibArch =
    sibMode === 'arch-tl' || sibMode === 'arch-tr' || sibMode === 'arch-bl' || sibMode === 'arch-br';
  const isMovedArch =
    movedMode === 'arch-tl' || movedMode === 'arch-tr' || movedMode === 'arch-bl' || movedMode === 'arch-br';
  if (isSibArch || isMovedArch) {
    const archMode = isSibArch ? sibMode : movedMode!;
    const isTopWing = archMode === 'arch-tl' || archMode === 'arch-tr';
    const flatAlignedY = isTopWing ? sib.y : Math.max(0, sib.y + sib.h - candH);
    const extraY = [flatAlignedY, sib.y, Math.max(0, sib.y + sib.h - candH)].filter((y) => y >= 0);
    const mergedY: number[] = [];
    for (const y of [...extraY, ...baseYPositions]) {
      if (y >= 0 && !mergedY.includes(y)) mergedY.push(y);
    }

    let partnerNotchMode: UnitShapeMode | null = null;
    if (isSibArch) {
      if (sibMode === 'arch-tr' && (!side || side === 'right')) partnerNotchMode = 'notch-br';
      else if (sibMode === 'arch-tl' && (!side || side === 'left')) partnerNotchMode = 'notch-bl';
      else if (sibMode === 'arch-br' && (!side || side === 'right')) partnerNotchMode = 'notch-tr';
      else if (sibMode === 'arch-bl' && (!side || side === 'left')) partnerNotchMode = 'notch-tl';
    }
    const canAutoNotch = canAutoAdjustShape || Boolean(movedMode?.startsWith('notch-'));
    return {
      yPositions: mergedY,
      inheritedLabel: partnerNotchMode && canAutoNotch ? `unit:${partnerNotchMode}:auto` : null,
    };
  }

  const isSibSlope =
    sibMode === 'slope-b-l' ||
    sibMode === 'slope-b-r' ||
    sibMode === 'slope-t-l' ||
    sibMode === 'slope-t-r';
  const isMovedSlope =
    movedMode === 'slope-b-l' ||
    movedMode === 'slope-b-r' ||
    movedMode === 'slope-t-l' ||
    movedMode === 'slope-t-r';

  const activeSlopeMode = isSibSlope ? sibMode : isMovedSlope ? movedMode : null;
  if (!activeSlopeMode) {
    return { yPositions: baseYPositions, inheritedLabel: null };
  }

  // Align the flat horizontal edge: top edge (sib.y) for bottom-slanted units, bottom edge (sib.y + sib.h - candH) for top-slanted units
  const flatAlignedY =
    activeSlopeMode === 'slope-t-l' || activeSlopeMode === 'slope-t-r'
      ? Math.max(0, sib.y + sib.h - candH)
      : sib.y;

  const extraY = [flatAlignedY, sib.y, Math.max(0, sib.y + sib.h - candH)].filter((y) => y >= 0);
  const mergedY: number[] = [];
  for (const y of [...extraY, ...baseYPositions]) {
    if (y >= 0 && !mergedY.includes(y)) mergedY.push(y);
  }

  return {
    yPositions: mergedY,
    inheritedLabel: canAutoAdjustShape ? `unit:${activeSlopeMode}:auto` : null,
  };
}

function getVerticalComplementaryUnitLabel(
  moved: MapItem,
  sib: MapItem,
  side: 'top' | 'bottom',
): string | null {
  if (!activeAutoShape || moved.kind !== 'unit') return null;
  const canAutoAdjustShape =
    !moved.label || moved.label === 'unit:rect' || isAutoAtriumSideCurveLabel(moved.label);
  if (!canAutoAdjustShape) return null;
  if (sib.kind === 'unit') {
    const sibMode = parseUnitShapeMode(sib);
    if (side === 'bottom') {
      if (sibMode === 'slope-b-l') return 'unit:slope-t-r:auto';
      if (sibMode === 'slope-b-r') return 'unit:slope-t-l:auto';
    } else {
      if (sibMode === 'slope-t-l') return 'unit:slope-b-r:auto';
      if (sibMode === 'slope-t-r') return 'unit:slope-b-l:auto';
    }
  }
  if (isAutoAtriumSideCurveLabel(moved.label)) {
    return 'unit:rect';
  }
  return null;
}

function snapBlockToSiblingsBorder(
  moved: MapItem,
  siblings: ReadonlyArray<MapItem>,
  items: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  if (siblings.length === 0) return null;
  const overlappingSiblings = siblings.filter((s) => tilesConflict(moved, s));
  if (overlappingSiblings.length === 0) return null;

  const others = items.filter((i) => i.key !== moved.key);
  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const candidates: Array<{
    x: number;
    y: number;
    w?: number;
    h?: number;
    angle?: number;
    hasAngle?: boolean;
    label?: string | null;
    hasLabel?: boolean;
    dist: number;
    priority: number;
  }> = [];

  const outerWingOverlapCand = findOuterRingWingMagneticCandidate(moved, others, columns);
  if (outerWingOverlapCand) {
    candidates.push({
      x: outerWingOverlapCand.x,
      y: outerWingOverlapCand.y,
      w: outerWingOverlapCand.w,
      h: outerWingOverlapCand.h,
      angle: outerWingOverlapCand.angle,
      hasAngle: true,
      label: outerWingOverlapCand.label,
      hasLabel: true,
      dist: outerWingOverlapCand.dist,
      priority: -2,
    });
  }

  for (const sib of overlappingSiblings) {
    if (sib.kind === 'atrium' && getPolygonAtriumWorldFaces(sib)) {
      const polyCand = findPolygonAtriumMagneticCandidate(moved, sib, others, columns);
      if (polyCand) {
        candidates.push({
          x: polyCand.x,
          y: polyCand.y,
          w: polyCand.w,
          h: polyCand.h,
          angle: polyCand.angle,
          hasAngle: true,
          ...(polyCand.hasLabel ? { label: polyCand.label, hasLabel: true } : {}),
          dist: polyCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    if (isCircleRingCorridor(sib)) {
      const ringCand = findCircleCorridorMagneticCandidate(moved, sib, others, columns);
      if (ringCand) {
        candidates.push({
          x: ringCand.x,
          y: ringCand.y,
          w: ringCand.w,
          h: ringCand.h,
          angle: ringCand.angle,
          hasAngle: true,
          label: ringCand.label,
          hasLabel: true,
          dist: ringCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    if (
      sib.kind === 'unit' &&
      (parseUnitShapeMode(sib, items) === 'ring-curve' || parseUnitShapeMode(sib, items) === 'trapezoid-ring')
    ) {
      const sibRing = findNearestCircleCorridorForUnit(sib, items);
      if (sibRing && sibRing.isNear) {
        const ringCand = findCircleCorridorMagneticCandidate(moved, sibRing.ring as MapItem, others, columns);
        if (ringCand) {
          candidates.push({
            x: ringCand.x,
            y: ringCand.y,
            w: ringCand.w,
            h: ringCand.h,
            angle: ringCand.angle,
            hasAngle: true,
            label: ringCand.label,
            hasLabel: true,
            dist: ringCand.dist,
            priority: -1,
          });
        }
        continue;
      }
    }

    if (sib.angle) {
      const rotCand = findRotatedNeighborMagneticCandidate(moved, sib, others, columns);
      if (rotCand) {
        candidates.push({
          x: rotCand.x,
          y: rotCand.y,
          w: rotCand.w,
          h: rotCand.h,
          angle: rotCand.angle,
          hasAngle: true,
          ...(rotCand.hasLabel ? { label: rotCand.label, hasLabel: true } : {}),
          dist: rotCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    for (const side of ['right', 'left'] as const) {
      const matched = getMatchedNeighborDimensions(moved, sib, side, others, columns);
      const sizePairs: Array<[number, number]> = [[matched.w, matched.h]];
      if (matched.w !== w || matched.h !== h) sizePairs.push([w, h]);

      for (let sIdx = 0; sIdx < sizePairs.length; sIdx++) {
        const [candW, candH] = sizePairs[sIdx];
        const cx = side === 'right' ? sib.x + sib.w : sib.x - candW;
        if (cx < 0 || cx + candW > columns) continue;
        const baseYPositions = computeFullBorderAlignedPositions(moved.y, candH, sib.y, sib.h, 5000);
        const { yPositions, inheritedLabel } = getSlantedUnitNeighborSnapMeta(
          moved,
          sib,
          candH,
          baseYPositions,
          side,
        );
        const resetRingShape =
          activeAutoShape && !inheritedLabel && moved.kind === 'unit' && isAutoAtriumSideCurveLabel(moved.label);
        const nextLabel = resetRingShape ? 'unit:rect' : inheritedLabel;
        const hasShapeOverride = resetRingShape || Boolean(inheritedLabel);
        const hasAngleReset = activeSnapAutoResize && !sib.angle && Boolean(moved.angle);

        for (let idx = 0; idx < yPositions.length; idx++) {
          const cy = yPositions[idx];
          if (cy < 0) continue;
          const cand: MapItem = {
            ...moved,
            x: cx,
            y: cy,
            w: candW,
            h: candH,
            ...(hasAngleReset || hasShapeOverride ? { angle: undefined } : {}),
            ...(hasShapeOverride ? { label: nextLabel } : {}),
          };
          if (!others.some((o) => tilesConflict(cand, o))) {
            candidates.push({
              x: cx,
              y: cy,
              w: candW,
              h: candH,
              ...(hasAngleReset || hasShapeOverride ? { angle: undefined, hasAngle: true } : {}),
              ...(hasShapeOverride ? { label: nextLabel, hasLabel: true } : {}),
              dist: Math.hypot(cx - moved.x, cy - moved.y),
              priority: (inheritedLabel ? -1 : idx === 0 ? 0 : 1) + sIdx,
            });
            break;
          }
        }
      }
    }

    for (const side of ['bottom', 'top'] as const) {
      const matched = getMatchedNeighborDimensions(moved, sib, side, others, columns);
      const sizePairs: Array<[number, number]> = [[matched.w, matched.h]];
      if (matched.w !== w || matched.h !== h) sizePairs.push([w, h]);

      for (let sIdx = 0; sIdx < sizePairs.length; sIdx++) {
        const [candW, candH] = sizePairs[sIdx];
        const cy = side === 'bottom' ? sib.y + sib.h : sib.y - candH;
        if (cy < 0) continue;
        const xPositions = computeFullBorderAlignedPositions(moved.x, candW, sib.x, sib.w, columns - candW);
        const vCompLabel = getVerticalComplementaryUnitLabel(moved, sib, side);
        const nextLabel = vCompLabel;
        const hasShapeOverride = Boolean(vCompLabel);
        const hasAngleReset = activeSnapAutoResize && !sib.angle && Boolean(moved.angle);

        for (let idx = 0; idx < xPositions.length; idx++) {
          const cx = xPositions[idx];
          if (cx < 0 || cx + candW > columns) continue;
          const cand: MapItem = {
            ...moved,
            x: cx,
            y: cy,
            w: candW,
            h: candH,
            ...(hasAngleReset || hasShapeOverride ? { angle: undefined } : {}),
            ...(hasShapeOverride ? { label: nextLabel } : {}),
          };
          if (!others.some((o) => tilesConflict(cand, o))) {
            candidates.push({
              x: cx,
              y: cy,
              w: candW,
              h: candH,
              ...(hasAngleReset || hasShapeOverride ? { angle: undefined, hasAngle: true } : {}),
              ...(hasShapeOverride ? { label: nextLabel, hasLabel: true } : {}),
              dist: Math.hypot(cx - moved.x, cy - moved.y),
              priority: (idx === 0 ? 0 : 1) + sIdx,
            });
            break;
          }
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
  const best = candidates[0];
  return {
    ...moved,
    x: best.x,
    y: best.y,
    w: best.w ?? w,
    h: best.h ?? h,
    angle: best.hasAngle ? best.angle : moved.angle,
    label: best.hasLabel ? (best.label ?? null) : moved.label,
  };
}

/**
 * Magnetically snaps a dragged tile (`moved`) when it comes within `MAGNET_SNAP_GAP` (up to 3 grid cells)
 * of any neighbor's border:
 * - On Polygon Atrium (`8/12/24-Face`) faces, automatically adjusts degree (`angle`) and line length (`w`/`h`) to match the nearest free face.
 * - On Circle Atriums / Circle Rings, automatically snaps radially to the circular perimeter, matching tangent degree and curved shape.
 * - On ANY Rotated Neighbor (`sib.angle !== 0`), automatically matches degree (`sib.angle`), border length (`w`/`h`), and touches flush.
 * - On Slanted Units (`slope-*`), neighboring units automatically touch flush, match height/width, and inherit the matching slanted shape.
 * - On all unrotated tiles, aligns X/Y coordinates, straightens rotation degree to `0°`, and matches shared border length (`w`/`h`).
 */
function snapTileByMagneticProximity(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  const others = items.filter((i) => i.key !== moved.key);
  const hasConflict = others.some((o) => tilesConflict(moved, o));

  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const candidates: Array<{
    x: number;
    y: number;
    w?: number;
    h?: number;
    angle?: number;
    hasAngle?: boolean;
    label?: string | null;
    hasLabel?: boolean;
    dist: number;
    priority: number;
  }> = [];

  const outerWingProxCand = findOuterRingWingMagneticCandidate(moved, others, columns);
  if (outerWingProxCand) {
    candidates.push({
      x: outerWingProxCand.x,
      y: outerWingProxCand.y,
      w: outerWingProxCand.w,
      h: outerWingProxCand.h,
      angle: outerWingProxCand.angle,
      hasAngle: true,
      label: outerWingProxCand.label,
      hasLabel: true,
      dist: outerWingProxCand.dist,
      priority: -2,
    });
  }

  const xSnaps: Array<{
    x: number;
    yPositions: number[];
    gap: number;
    w: number;
    h: number;
    inheritedLabel?: string | null;
    resetAngle?: boolean;
  }> = [];
  const ySnaps: Array<{
    y: number;
    xPositions: number[];
    gap: number;
    w: number;
    h: number;
    inheritedLabel?: string | null;
    resetAngle?: boolean;
  }> = [];

  for (const sib of others) {
    // 1a. Any tile near a Circle Atrium or Circle Ring: magnetically attract to touch outer arc or outer concentric ring
    if (isCircleRingCorridor(sib)) {
      const ringCand = findCircleCorridorMagneticCandidate(moved, sib, others, columns);
      if (ringCand && ringCand.dist <= MAGNET_SNAP_GAP + 8.5) {
        candidates.push({
          x: ringCand.x,
          y: ringCand.y,
          w: ringCand.w,
          h: ringCand.h,
          angle: ringCand.angle,
          hasAngle: true,
          label: ringCand.label,
          hasLabel: true,
          dist: ringCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    if (
      sib.kind === 'unit' &&
      (parseUnitShapeMode(sib, items) === 'ring-curve' || parseUnitShapeMode(sib, items) === 'trapezoid-ring')
    ) {
      const sibRing = findNearestCircleCorridorForUnit(sib, items);
      if (sibRing && sibRing.isNear) {
        const gx = Math.max(0, moved.x - (sib.x + sib.w), sib.x - (moved.x + w));
        const gy = Math.max(0, moved.y - (sib.y + sib.h), sib.y - (moved.y + h));
        if (Math.hypot(gx, gy) <= MAGNET_SNAP_GAP + 4.5) {
          const ringCand = findCircleCorridorMagneticCandidate(moved, sibRing.ring as MapItem, others, columns);
          if (ringCand) {
            candidates.push({
              x: ringCand.x,
              y: ringCand.y,
              w: ringCand.w,
              h: ringCand.h,
              angle: ringCand.angle,
              hasAngle: true,
              label: ringCand.label,
              hasLabel: true,
              dist: ringCand.dist,
              priority: -1,
            });
          }
        }
        continue;
      }
    }

    if (isAtriumTransitOverlap(sib, moved)) {
      continue;
    }

    // 1b. Any tile near a Polygon Atrium (8/12/24-Face): auto-adjust degree and line length to match the nearest free face
    if (sib.kind === 'atrium' && getPolygonAtriumWorldFaces(sib)) {
      const polyCand = findPolygonAtriumMagneticCandidate(moved, sib, others, columns);
      if (polyCand && polyCand.dist <= MAGNET_SNAP_GAP + 3) {
        candidates.push({
          x: polyCand.x,
          y: polyCand.y,
          w: polyCand.w,
          h: polyCand.h,
          angle: polyCand.angle,
          hasAngle: true,
          ...(polyCand.hasLabel ? { label: polyCand.label, hasLabel: true } : {}),
          dist: polyCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    // 1c. Any tile near ANY Rotated Neighbor (`sib.angle !== 0`): auto-match degree, size/length, and touch rotated border flush
    if (sib.angle) {
      const rotCand = findRotatedNeighborMagneticCandidate(moved, sib, others, columns);
      if (rotCand && rotCand.dist <= MAGNET_SNAP_GAP + 1) {
        candidates.push({
          x: rotCand.x,
          y: rotCand.y,
          w: rotCand.w,
          h: rotCand.h,
          angle: rotCand.angle,
          hasAngle: true,
          ...(rotCand.hasLabel ? { label: rotCand.label, hasLabel: true } : {}),
          dist: rotCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    if (hasConflict || rectsOverlap(moved, sib)) continue;

    const resetAngle = activeSnapAutoResize && !sib.angle && Boolean(moved.angle);

    // 1e. Contiguous Unit-Row / Unit-Column Auto-Span when dragging a larger tile (Atrium or Unit) alongside 2+ contiguous Units
    if (activeSnapAutoResize && !moved.angle && sib.kind === 'unit' && !sib.angle) {
      const vOvRaw = Math.min(moved.y + h, sib.y + sib.h) - Math.max(moved.y, sib.y);
      const hOvRaw = Math.min(moved.x + w, sib.x + sib.w) - Math.max(moved.x, sib.x);
      if (w > sib.w && hOvRaw >= -MAGNET_SNAP_GAP) {
        const gapTop = sib.y - (moved.y + h);
        const gapBottom = moved.y - (sib.y + sib.h);
        const touchSide: 'top' | 'bottom' | null =
          gapTop >= 0 && gapTop <= MAGNET_SNAP_GAP
            ? 'top'
            : gapBottom >= 0 && gapBottom <= MAGNET_SNAP_GAP
              ? 'bottom'
              : null;
        if (touchSide) {
          const cy = touchSide === 'top' ? sib.y - h : sib.y + sib.h;
          const rowSpan = findContiguousUnitRowSpan(sib, others, 'x', touchSide);
          const spanW = Math.min(columns - rowSpan.min, rowSpan.max - rowSpan.min);
          if (
            cy >= 0 &&
            rowSpan.count >= 2 &&
            spanW >= 4 &&
            Math.abs(w - spanW) <= 6 &&
            Math.abs(moved.x - rowSpan.min) <= 4
          ) {
            const spanCand: MapItem = { ...moved, x: rowSpan.min, y: cy, w: spanW, h, angle: undefined };
            if (!others.some((o) => tilesConflict(spanCand, o))) {
              candidates.push({
                x: rowSpan.min,
                y: cy,
                w: spanW,
                h,
                angle: undefined,
                hasAngle: true,
                dist: Math.hypot(rowSpan.min - moved.x, cy - moved.y) * 0.5,
                priority: 0,
              });
            }
          }
        }
      } else if (h > sib.h && vOvRaw >= -MAGNET_SNAP_GAP) {
        const gapLeft = sib.x - (moved.x + w);
        const gapRight = moved.x - (sib.x + sib.w);
        const touchSide: 'left' | 'right' | null =
          gapLeft >= 0 && gapLeft <= MAGNET_SNAP_GAP
            ? 'left'
            : gapRight >= 0 && gapRight <= MAGNET_SNAP_GAP
              ? 'right'
              : null;
        if (touchSide) {
          const cx = touchSide === 'left' ? sib.x - w : sib.x + sib.w;
          const colSpan = findContiguousUnitRowSpan(sib, others, 'y', touchSide);
          const spanH = colSpan.max - colSpan.min;
          if (
            cx >= 0 &&
            cx + w <= columns &&
            colSpan.count >= 2 &&
            spanH >= 4 &&
            Math.abs(h - spanH) <= 6 &&
            Math.abs(moved.y - colSpan.min) <= 4
          ) {
            const spanCand: MapItem = { ...moved, x: cx, y: colSpan.min, w, h: spanH, angle: undefined };
            if (!others.some((o) => tilesConflict(spanCand, o))) {
              candidates.push({
                x: cx,
                y: colSpan.min,
                w,
                h: spanH,
                angle: undefined,
                hasAngle: true,
                dist: Math.hypot(cx - moved.x, colSpan.min - moved.y) * 0.5,
                priority: 0,
              });
            }
          }
        }
      }
    }

    const isSlantedPair =
      moved.kind === 'unit' &&
      sib.kind === 'unit' &&
      Boolean(
        parseUnitShapeMode(sib)?.startsWith('slope-') ||
          parseUnitShapeMode(moved)?.startsWith('slope-') ||
          parseUnitShapeMode(sib)?.startsWith('arch-') ||
          parseUnitShapeMode(moved)?.startsWith('arch-'),
      );
    const horizSnapGap = isSlantedPair ? MAGNET_SNAP_GAP + 2 : MAGNET_SNAP_GAP;

    // 2. Horizontal border magnetic pull (Left or Right of `sib`)
    const gapLeft = sib.x - (moved.x + w);
    if (gapLeft >= 0 && gapLeft <= horizSnapGap) {
      const { w: candW, h: candH } = getMatchedNeighborDimensions(moved, sib, 'left', others, columns);
      const vOverlap = Math.min(moved.y + candH, sib.y + sib.h) - Math.max(moved.y, sib.y);
      if (vOverlap >= -horizSnapGap) {
        const sizeChanged = candW !== w || candH !== h;
        const baseYPositions = computeFullBorderAlignedPositions(moved.y, candH, sib.y, sib.h, 5000);
        const { yPositions, inheritedLabel } = getSlantedUnitNeighborSnapMeta(
          moved,
          sib,
          candH,
          baseYPositions,
          'left',
        );
        const resetRing = activeAutoShape && !inheritedLabel && moved.kind === 'unit' && isAutoAtriumSideCurveLabel(moved.label);
        const effLabel = resetRing ? 'unit:rect' : inheritedLabel;
        const bestY = yPositions[0];
        const needsShapeReset = resetRing && (moved.label !== 'unit:rect' || Boolean(moved.angle));
        const shapeWillChange = Boolean(effLabel && moved.label !== effLabel);
        const cx = sib.x - candW;
        if (
          cx >= 0 &&
          (gapLeft > 0 || bestY !== moved.y || sizeChanged || needsShapeReset || shapeWillChange || resetAngle)
        ) {
          xSnaps.push({
            x: cx,
            yPositions,
            gap: gapLeft,
            w: candW,
            h: candH,
            inheritedLabel: effLabel,
            resetAngle,
          });
        }
      }
    }

    const gapRight = moved.x - (sib.x + sib.w);
    if (gapRight >= 0 && gapRight <= horizSnapGap) {
      const { w: candW, h: candH } = getMatchedNeighborDimensions(moved, sib, 'right', others, columns);
      const vOverlap = Math.min(moved.y + candH, sib.y + sib.h) - Math.max(moved.y, sib.y);
      if (vOverlap >= -horizSnapGap) {
        const sizeChanged = candW !== w || candH !== h;
        const baseYPositions = computeFullBorderAlignedPositions(moved.y, candH, sib.y, sib.h, 5000);
        const { yPositions, inheritedLabel } = getSlantedUnitNeighborSnapMeta(
          moved,
          sib,
          candH,
          baseYPositions,
          'right',
        );
        const resetRing = activeAutoShape && !inheritedLabel && moved.kind === 'unit' && isAutoAtriumSideCurveLabel(moved.label);
        const effLabel = resetRing ? 'unit:rect' : inheritedLabel;
        const bestY = yPositions[0];
        const needsShapeReset = resetRing && (moved.label !== 'unit:rect' || Boolean(moved.angle));
        const shapeWillChange = Boolean(effLabel && moved.label !== effLabel);
        const cx = sib.x + sib.w;
        if (
          cx + candW <= columns &&
          (gapRight > 0 || bestY !== moved.y || sizeChanged || needsShapeReset || shapeWillChange || resetAngle)
        ) {
          xSnaps.push({
            x: cx,
            yPositions,
            gap: gapRight,
            w: candW,
            h: candH,
            inheritedLabel: effLabel,
            resetAngle,
          });
        }
      }
    }

    // 3. Vertical border magnetic pull (Top or Bottom of `sib`)
    const gapTop = sib.y - (moved.y + h);
    if (gapTop >= 0 && gapTop <= MAGNET_SNAP_GAP) {
      const { w: candW, h: candH } = getMatchedNeighborDimensions(moved, sib, 'top', others, columns);
      const hOverlap = Math.min(moved.x + candW, sib.x + sib.w) - Math.max(moved.x, sib.x);
      if (hOverlap >= -MAGNET_SNAP_GAP) {
        const sizeChanged = candW !== w || candH !== h;
        const xPositions = computeFullBorderAlignedPositions(moved.x, candW, sib.x, sib.w, columns - candW);
        const bestX = xPositions[0];
        const vCompLabel = getVerticalComplementaryUnitLabel(moved, sib, 'top');
        const needsShapeReset =
          Boolean(vCompLabel) &&
          (moved.label !== (vCompLabel ?? 'unit:rect') || Boolean(moved.angle));
        const cy = sib.y - candH;
        if (cy >= 0 && (gapTop > 0 || bestX !== moved.x || sizeChanged || needsShapeReset || resetAngle)) {
          ySnaps.push({
            y: cy,
            xPositions,
            gap: gapTop,
            w: candW,
            h: candH,
            inheritedLabel: vCompLabel,
            resetAngle,
          });
        }
      }
    }

    const gapBottom = moved.y - (sib.y + sib.h);
    if (gapBottom >= 0 && gapBottom <= MAGNET_SNAP_GAP) {
      const { w: candW, h: candH } = getMatchedNeighborDimensions(moved, sib, 'bottom', others, columns);
      const hOverlap = Math.min(moved.x + candW, sib.x + sib.w) - Math.max(moved.x, sib.x);
      if (hOverlap >= -MAGNET_SNAP_GAP) {
        const sizeChanged = candW !== w || candH !== h;
        const xPositions = computeFullBorderAlignedPositions(moved.x, candW, sib.x, sib.w, columns - candW);
        const bestX = xPositions[0];
        const vCompLabel = getVerticalComplementaryUnitLabel(moved, sib, 'bottom');
        const needsShapeReset =
          Boolean(vCompLabel) &&
          (moved.label !== (vCompLabel ?? 'unit:rect') || Boolean(moved.angle));
        const cy = sib.y + sib.h;
        if (gapBottom > 0 || bestX !== moved.x || sizeChanged || needsShapeReset || resetAngle) {
          ySnaps.push({
            y: cy,
            xPositions,
            gap: gapBottom,
            w: candW,
            h: candH,
            inheritedLabel: vCompLabel,
            resetAngle,
          });
        }
      }
    }
  }

  // Evaluate dual-axis corner snaps first (snapping simultaneously to both an X border and a Y border)
  for (const xs of xSnaps) {
    for (const ys of ySnaps) {
      if (xs.inheritedLabel && ys.y !== xs.yPositions[0]) continue;
      const cw = xs.w !== w ? xs.w : ys.w;
      const ch = ys.h !== h ? ys.h : xs.h;
      const nextLabel = xs.inheritedLabel ?? ys.inheritedLabel ?? null;
      const hasShapeOverride = Boolean(xs.inheritedLabel || ys.inheritedLabel);
      const hasAngleOverride = hasShapeOverride || Boolean(xs.resetAngle || ys.resetAngle);
      const cand: MapItem = {
        ...moved,
        x: xs.x,
        y: ys.y,
        w: cw,
        h: ch,
        ...(hasAngleOverride ? { angle: undefined } : {}),
        ...(hasShapeOverride ? { label: nextLabel } : {}),
      };
      if (!others.some((o) => tilesConflict(cand, o))) {
        candidates.push({
          x: xs.x,
          y: ys.y,
          w: cw,
          h: ch,
          ...(hasAngleOverride ? { angle: undefined, hasAngle: true } : {}),
          ...(hasShapeOverride ? { label: nextLabel, hasLabel: true } : {}),
          dist: Math.hypot(xs.x - moved.x, ys.y - moved.y),
          priority: xs.inheritedLabel ? -1 : 0,
        });
      }
    }
  }

  // Evaluate single-axis X snaps with full-border Y alignment (including slanted unit neighbor inheritance)
  for (const xs of xSnaps) {
    const sizePairs: Array<[number, number]> = [[xs.w, xs.h]];
    if (xs.w !== w || xs.h !== h) sizePairs.push([w, h]);
    for (let sIdx = 0; sIdx < sizePairs.length; sIdx++) {
      const [cw, ch] = sizePairs[sIdx];
      for (let idx = 0; idx < xs.yPositions.length; idx++) {
        const cy = xs.yPositions[idx];
        const nextLabel = xs.inheritedLabel ?? null;
        const hasShapeOverride = Boolean(xs.inheritedLabel);
        const hasAngleOverride = hasShapeOverride || Boolean(xs.resetAngle);
        const cand: MapItem = {
          ...moved,
          x: xs.x,
          y: cy,
          w: cw,
          h: ch,
          ...(hasAngleOverride ? { angle: undefined } : {}),
          ...(hasShapeOverride ? { label: nextLabel } : {}),
        };
        if (!others.some((o) => tilesConflict(cand, o))) {
          candidates.push({
            x: xs.x,
            y: cy,
            w: cw,
            h: ch,
            ...(hasAngleOverride ? { angle: undefined, hasAngle: true } : {}),
            ...(hasShapeOverride ? { label: nextLabel, hasLabel: true } : {}),
            dist: xs.gap + Math.abs(cy - moved.y) * 0.35,
            priority: (xs.inheritedLabel ? (idx === 0 ? -1 : 0) : idx === 0 ? 1 : 2) + sIdx,
          });
          break;
        }
      }
    }
  }

  // Evaluate single-axis Y snaps with full-border X alignment
  for (const ys of ySnaps) {
    const sizePairs: Array<[number, number]> = [[ys.w, ys.h]];
    if (ys.w !== w || ys.h !== h) sizePairs.push([w, h]);
    for (let sIdx = 0; sIdx < sizePairs.length; sIdx++) {
      const [cw, ch] = sizePairs[sIdx];
      for (let idx = 0; idx < ys.xPositions.length; idx++) {
        const cx = ys.xPositions[idx];
        const nextLabel = ys.inheritedLabel ?? null;
        const hasShapeOverride = Boolean(ys.inheritedLabel);
        const hasAngleOverride = hasShapeOverride || Boolean(ys.resetAngle);
        const cand: MapItem = {
          ...moved,
          x: cx,
          y: ys.y,
          w: cw,
          h: ch,
          ...(hasAngleOverride ? { angle: undefined } : {}),
          ...(hasShapeOverride ? { label: nextLabel } : {}),
        };
        if (!others.some((o) => tilesConflict(cand, o))) {
          candidates.push({
            x: cx,
            y: ys.y,
            w: cw,
            h: ch,
            ...(hasAngleOverride ? { angle: undefined, hasAngle: true } : {}),
            ...(hasShapeOverride ? { label: nextLabel, hasLabel: true } : {}),
            dist: ys.gap + Math.abs(cx - moved.x) * 0.35,
            priority: (idx === 0 ? 1 : 2) + sIdx,
          });
          break;
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
  const best = candidates[0];
  return {
    ...moved,
    x: best.x,
    y: best.y,
    w: best.w ?? w,
    h: best.h ?? h,
    angle: best.hasAngle ? best.angle : moved.angle,
    label: best.hasLabel ? (best.label ?? null) : moved.label,
  };
}

/**
 * Validates a resized tile step-by-step (`x`, `y`, `w`, `h`) without jumping across multiple steps,
 * so the user can resize any unit or landmark smoothly 1 step at a time with full detail control.
 * If expanding width/height slightly grazes a curved Atrium border or slanted neighbor, nudges by 1–2 cells
 * to preserve the new width/height without resetting the unit's curved shape.
 */
function snapTileResizeMagnetically(
  moved: MapItem,
  _orig: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  const others = items.filter((i) => i.key !== moved.key);
  const nextX = Math.max(0, moved.x);
  const nextY = Math.max(0, moved.y);
  const nextW = Math.max(1, Math.min(moved.w, columns - nextX));
  const nextH = Math.max(1, moved.h);

  const rawCand: MapItem = { ...moved, x: nextX, y: nextY, w: nextW, h: nextH };
  if (!others.some((o) => tilesConflict(rawCand, o))) {
    return rawCand;
  }

  const offsets: Array<{ dx: number; dy: number; dist: number }> = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push({ dx, dy, dist: Math.hypot(dx, dy) });
    }
  }
  offsets.sort((a, b) => a.dist - b.dist);

  for (const { dx, dy } of offsets) {
    const cx = nextX + dx;
    const cy = nextY + dy;
    if (cx < 0 || cy < 0 || cx + nextW > columns) continue;
    const nudgedCand: MapItem = { ...moved, x: cx, y: cy, w: nextW, h: nextH };
    if (!others.some((o) => tilesConflict(nudgedCand, o))) {
      return nudgedCand;
    }
  }

  return null;
}

function isUnitWithinWalkwayOfCircleAtrium(match: CircleCorridorUnitMatch): boolean {
  const avgR = (match.rxOut + match.ryOut) * 0.5;
  const radialGap = (match.normClosest - 1) * avgR;
  return match.boxGap <= 8.5 && match.normClosest >= 0.48 && radialGap <= 8.0;
}

type ShapeDetectTile = {
  key?: string;
  kind: TileKind | string;
  unitId?: string | null;
  label?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
};

function findNearbyCircleKioskForUnit(
  u: ShapeDetectTile,
  items: ReadonlyArray<ShapeDetectTile>,
): { notchCorner: 'tl' | 'tr' | 'bl' | 'br'; boxGap: number } | null {
  if (u.angle || parseUnitShapeMode(u) === 'circle') return null;
  const ucx = u.x + u.w * 0.5;
  const ucy = u.y + u.h * 0.5;
  let best: { notchCorner: 'tl' | 'tr' | 'bl' | 'br'; boxGap: number } | null = null;

  for (const k of items) {
    if (k === u || (u.key && k.key === u.key)) continue;
    if (k.kind !== 'unit' || parseUnitShapeMode(k) !== 'circle') continue;
    const gapX = Math.max(0, u.x - (k.x + k.w), k.x - (u.x + u.w));
    const gapY = Math.max(0, u.y - (k.y + k.h), k.y - (u.y + u.h));
    const boxGap = Math.hypot(gapX, gapY);
    if (boxGap > 5.5) continue;
    const ovX = Math.min(u.x + u.w, k.x + k.w) - Math.max(u.x, k.x);
    const ovY = Math.min(u.y + u.h, k.y + k.h) - Math.max(u.y, u.y);
    if (ovX > u.w * 0.75 || ovY > u.h * 0.75) continue;
    const kcx = k.x + k.w * 0.5;
    const kcy = k.y + k.h * 0.5;
    const notchCorner: 'tl' | 'tr' | 'bl' | 'br' =
      kcx < ucx && kcy < ucy
        ? 'tl'
        : kcx >= ucx && kcy < ucy
          ? 'tr'
          : kcx < ucx && kcy >= ucy
            ? 'bl'
            : 'br';
    if (!best || boxGap < best.boxGap) {
      best = { notchCorner, boxGap };
    }
  }
  return best;
}

function findAdjacentOuterWingNotchForUnit(
  u: { key?: string; x: number; y: number; w: number; h: number; angle?: number },
  items: ReadonlyArray<ShapeDetectTile>,
): 'notch-tl' | 'notch-tr' | 'notch-bl' | 'notch-br' | null {
  if (u.angle) return null;
  for (const o of items) {
    if (o === u || (u.key && o.key === u.key) || o.kind !== 'unit' || o.angle) continue;
    const oMode = parseUnitShapeMode(o);
    if (
      oMode !== 'arch-tl' &&
      oMode !== 'arch-tr' &&
      oMode !== 'arch-bl' &&
      oMode !== 'arch-br'
    ) {
      continue;
    }
    const ovY = Math.min(u.y + u.h, o.y + o.h) - Math.max(u.y, o.y);
    if (ovY < Math.min(u.h, o.h) * 0.45) continue;
    if (oMode === 'arch-tr' && Math.abs(u.x - (o.x + o.w)) <= 1.2) return 'notch-br';
    if (oMode === 'arch-tl' && Math.abs(o.x - (u.x + u.w)) <= 1.2) return 'notch-bl';
    if (oMode === 'arch-br' && Math.abs(u.x - (o.x + o.w)) <= 1.2) return 'notch-tr';
    if (oMode === 'arch-bl' && Math.abs(o.x - (u.x + u.w)) <= 1.2) return 'notch-tl';
  }
  return null;
}

function isNearAnyPolygonAtrium(
  u: { key?: string; x: number; y: number; w: number; h: number },
  items: ReadonlyArray<ShapeDetectTile>,
  maxGap = 9.0,
): boolean {
  for (const a of items) {
    if (a === u || (u.key && a.key === u.key) || a.kind !== 'atrium') continue;
    if (!parseLandmarkMeta('atrium', a.label).polygonFaces) continue;
    const gapX = Math.max(0, u.x - (a.x + a.w), a.x - (u.x + u.w));
    const gapY = Math.max(0, u.y - (a.y + a.h), a.y - (u.y + u.h));
    if (Math.hypot(gapX, gapY) <= maxGap) return true;
  }
  return false;
}

function findPolygonAtriumCornerChamferForUnit(
  u: { key?: string; x: number; y: number; w: number; h: number; angle?: number },
  items: ReadonlyArray<ShapeDetectTile>,
): { chamferMode: UnitShapeMode; boxGap: number } | null {
  if (u.angle) return null;
  const ucx = u.x + u.w * 0.5;
  const ucy = u.y + u.h * 0.5;
  let best: { chamferMode: UnitShapeMode; boxGap: number } | null = null;

  for (const a of items) {
    if (a === u || (u.key && a.key === u.key) || a.kind !== 'atrium') continue;
    const polyFaces = parseLandmarkMeta('atrium', a.label).polygonFaces;
    if (!polyFaces) continue;
    const acx = a.x + a.w * 0.5;
    const acy = a.y + a.h * 0.5;
    const rx = Math.max(1, a.w * 0.5);
    const ry = Math.max(1, a.h * 0.5);
    const gapX = Math.max(0, u.x - (a.x + a.w), a.x - (u.x + u.w));
    const gapY = Math.max(0, u.y - (a.y + a.h), a.y - (u.y + u.h));
    const boxGap = Math.hypot(gapX, gapY);
    if (boxGap > 8.0) continue;
    const ovX = Math.min(u.x + u.w, a.x + a.w) - Math.max(u.x, a.x);
    const ovY = Math.min(u.y + u.h, a.y + a.h) - Math.max(u.y, a.y);
    const nx = (ucx - acx) / rx;
    const ny = (ucy - acy) / ry;
    if (ovX <= u.w * 0.8 && ovY <= u.h * 0.8 && Math.abs(nx) >= 0.36 && Math.abs(ny) >= 0.36) {
      const chamferMode: UnitShapeMode =
        nx >= 0 && ny >= 0
          ? 'chamfer-tl'
          : nx < 0 && ny >= 0
            ? 'chamfer-tr'
            : nx >= 0 && ny < 0
              ? 'chamfer-bl'
              : 'chamfer-br';
      if (!best || boxGap < best.boxGap) {
        best = { chamferMode, boxGap };
      }
    }
  }
  return best;
}

function findIslandEndBevelForUnit(
  u: { key?: string; x: number; y: number; w: number; h: number; angle?: number },
  items: ReadonlyArray<ShapeDetectTile>,
): { bevelMode: UnitShapeMode; boxGap: number } | null {
  if (u.angle) return null;
  let hasLeft = false;
  let hasRight = false;
  let hasTop = false;
  let hasBottom = false;

  for (const o of items) {
    if (o === u || (u.key && o.key === u.key) || o.kind !== 'unit' || o.angle) continue;
    const ovX = Math.min(u.x + u.w, o.x + o.w) - Math.max(u.x, o.x);
    const ovY = Math.min(u.y + u.h, o.y + o.h) - Math.max(u.y, o.y);
    if (ovY >= u.h * 0.55 && Math.abs(u.x - (o.x + o.w)) <= 0.6) hasLeft = true;
    if (ovY >= u.h * 0.55 && Math.abs(o.x - (u.x + u.w)) <= 0.6) hasRight = true;
    if (ovX >= u.w * 0.55 && Math.abs(u.y - (o.y + o.h)) <= 0.6) hasTop = true;
    if (ovX >= u.w * 0.55 && Math.abs(o.y - (u.y + u.h)) <= 0.6) hasBottom = true;
  }

  // Only bevel an island row end when it is touching a row neighbor on one side and open on the opposite side
  const openSide: 'left' | 'right' | 'top' | 'bottom' | null =
    hasRight && !hasLeft && !hasTop && !hasBottom
      ? 'left'
      : hasLeft && !hasRight && !hasTop && !hasBottom
        ? 'right'
        : hasBottom && !hasTop && !hasLeft && !hasRight
          ? 'top'
          : hasTop && !hasBottom && !hasLeft && !hasRight
            ? 'bottom'
            : null;
  if (!openSide) return null;

  const ucx = u.x + u.w * 0.5;
  const ucy = u.y + u.h * 0.5;
  let bestGap = Infinity;

  // Check if there is an angled wing unit or a Polygon Atrium near that open end
  for (const o of items) {
    if (o === u || (u.key && o.key === u.key)) continue;
    const isAngledUnit = o.kind === 'unit' && Boolean(o.angle && o.angle % 90 !== 0);
    const isPolyAtrium = o.kind === 'atrium' && Boolean(parseLandmarkMeta('atrium', o.label).polygonFaces);
    if (!isAngledUnit && !isPolyAtrium) continue;

    const ocx = o.x + o.w * 0.5;
    const ocy = o.y + o.h * 0.5;
    if (openSide === 'left' && ocx >= ucx) continue;
    if (openSide === 'right' && ocx <= ucx) continue;
    if (openSide === 'top' && ocy >= ucy) continue;
    if (openSide === 'bottom' && ocy <= ucy) continue;

    const gapX = Math.max(0, u.x - (o.x + o.w), o.x - (u.x + u.w));
    const gapY = Math.max(0, u.y - (o.y + o.h), o.y - (u.y + u.h));
    const boxGap = Math.hypot(gapX, gapY);
    if (boxGap < bestGap) {
      bestGap = boxGap;
    }
  }

  if (bestGap > 7.5) return null;
  const bevelMode: UnitShapeMode =
    openSide === 'left'
      ? 'bevel-l'
      : openSide === 'right'
        ? 'bevel-r'
        : openSide === 'top'
          ? 'bevel-t'
          : 'bevel-b';
  return { bevelMode, boxGap: bestGap };
}

function findOuterRingWingForUnit(
  u: ShapeDetectTile,
  items: ReadonlyArray<ShapeDetectTile>,
): UnitShapeMode | null {
  if (u.angle || parseUnitShapeMode(u) === 'circle' || isRingSectorUnitLabel(u.label)) {
    return null;
  }
  if (u.w < 3 || u.h < 4) return null;
  if (findAdjacentOuterWingNotchForUnit(u, items)) return null;
  const match = findNearestCircleCorridorForUnit(u, items);
  if (!match) return null;

  const ucx = u.x + u.w * 0.5;
  const ucy = u.y + u.h * 0.5;
  const uDist = Math.hypot(ucx - match.cx, ucy - match.cy);
  const alreadyAutoCurved = isAutoAtriumSideCurveLabel(u.label);
  const maxGap = alreadyAutoCurved ? 5.0 : 3.8;

  const dx = match.cx - ucx;
  const dy = match.cy - ucy;
  const archMode: 'arch-tl' | 'arch-tr' | 'arch-bl' | 'arch-br' =
    dx >= 0 && dy >= 0
      ? 'arch-tl'
      : dx < 0 && dy >= 0
        ? 'arch-tr'
        : dx >= 0 && dy < 0
          ? 'arch-bl'
          : 'arch-br';

  const existingArchInQuadrant = items.some((o) => {
    if (o === u || (u.key && o.key === u.key) || o.kind !== 'unit') return false;
    if (parseUnitShapeMode(o) !== archMode) return false;
    const ocx = o.x + o.w * 0.5;
    const ocy = o.y + o.h * 0.5;
    return Math.hypot(ocx - match.cx, ocy - match.cy) < uDist + 0.5;
  });
  if (existingArchInQuadrant) return null;

  let hasInnerRingSectorNeighbor = false;
  for (const o of items) {
    if (o === u || (u.key && o.key === u.key) || o.kind !== 'unit') continue;
    if (!isRingSectorUnitLabel(o.label)) continue;
    const gx = Math.max(0, u.x - (o.x + o.w), o.x - (u.x + u.w));
    const gy = Math.max(0, u.y - (o.y + o.h), o.y - (u.y + u.h));
    if (Math.hypot(gx, gy) > maxGap) continue;
    const ocx = o.x + o.w * 0.5;
    const ocy = o.y + o.h * 0.5;
    const oDist = Math.hypot(ocx - match.cx, ocy - match.cy);
    if (oDist + 0.4 < uDist) {
      hasInnerRingSectorNeighbor = true;
      break;
    }
  }
  if (!hasInnerRingSectorNeighbor) return null;

  return archMode;
}

function resolveAutoUnitShapeMode(
  u: ShapeDetectTile,
  items: ReadonlyArray<ShapeDetectTile>,
): UnitShapeMode {
  if (parseUnitShapeMode(u) === 'circle') return 'circle';
  const alreadyAutoCurved = isAutoAtriumSideCurveLabel(u.label);

  // 0. Check if touching the outer vertical wall of an Outer Ring Concave Wing (`arch-*`, e.g. GFL-A30 beside GFL-A3)
  const wingNotch = findAdjacentOuterWingNotchForUnit(u, items);
  if (wingNotch) {
    if (isNearAnyPolygonAtrium(u, items, 9.0)) {
      return wingNotch === 'notch-tl'
        ? 'notch-tl-chamfer-br'
        : wingNotch === 'notch-tr'
          ? 'notch-tr-chamfer-bl'
          : wingNotch === 'notch-bl'
            ? 'notch-bl-chamfer-tr'
            : 'notch-br-chamfer-tl';
    }
    return wingNotch;
  }

  // 1. Check nearby circular Kiosk (unit:circle) -> Concave Notch or Notch + Outer 45° Chamfer combo
  const kioskMatch = findNearbyCircleKioskForUnit(u, items);
  if (kioskMatch && (kioskMatch.boxGap <= 3.2 || (alreadyAutoCurved && kioskMatch.boxGap <= 5.5))) {
    if (isNearAnyPolygonAtrium(u, items, 9.0)) {
      return kioskMatch.notchCorner === 'tl'
        ? 'notch-tl-chamfer-br'
        : kioskMatch.notchCorner === 'tr'
          ? 'notch-tr-chamfer-bl'
          : kioskMatch.notchCorner === 'bl'
            ? 'notch-bl-chamfer-tr'
            : 'notch-br-chamfer-tl';
    }
    return kioskMatch.notchCorner === 'tl'
      ? 'notch-tl'
      : kioskMatch.notchCorner === 'tr'
        ? 'notch-tr'
        : kioskMatch.notchCorner === 'bl'
          ? 'notch-bl'
          : 'notch-br';
  }

  // 1b. Check outer corner unit wrapping around `ring-curve` / `trapezoid-ring` sectors -> Outer Ring Concave Wing (`arch-*`)
  const outerWingMode = findOuterRingWingForUnit(u, items);
  if (outerWingMode) {
    return outerWingMode;
  }

  // 2. Check nearby Circle / Oval Atrium or Circle Ring Walkway -> Crescent or Corner Notch
  const match = findNearestCircleCorridorForUnit(u, items);
  const shouldAutoCurve =
    match &&
    (isUnitCloseToCircleAtriumRim(match) ||
      (alreadyAutoCurved && isUnitWithinWalkwayOfCircleAtrium(match)));
  if (match && shouldAutoCurve) {
    return resolveAtriumFacingSideCurveMode(u, match);
  }

  // 3. Check nearby Octagonal / Polygon Atrium corner -> 45° Cut Corner (Chamfer)
  const polyChamfer = findPolygonAtriumCornerChamferForUnit(u, items);
  if (polyChamfer && (polyChamfer.boxGap <= 4.8 || (alreadyAutoCurved && polyChamfer.boxGap <= 8.0))) {
    return polyChamfer.chamferMode;
  }

  // 4. Check middle island row end facing angled wings or Polygon Atrium -> Pointed Bevel End
  const islandBevel = findIslandEndBevelForUnit(u, items);
  if (islandBevel && (islandBevel.boxGap <= 5.5 || (alreadyAutoCurved && islandBevel.boxGap <= 7.5))) {
    return islandBevel.bevelMode;
  }

  return 'rect';
}

function applyAtriumAutoShapeToUnit(
  u: MapItem,
  items: ReadonlyArray<MapItem>,
  autoShape: boolean,
): MapItem {
  if (u.kind !== 'unit' || !u.unitId) return u;
  if (!autoShape) {
    return !u.label ? { ...u, label: 'unit:rect' } : u;
  }

  const isMultiBlockUnit = items.some((o) => o.key !== u.key && o.kind === 'unit' && o.unitId === u.unitId);
  if (isMultiBlockUnit) return u;

  const alreadyAutoCurved = isAutoAtriumSideCurveLabel(u.label);
  const wingNotch = findAdjacentOuterWingNotchForUnit(u, items);
  const canAutoShape =
    !u.label ||
    u.label === 'unit:rect' ||
    alreadyAutoCurved ||
    Boolean(wingNotch && parseUnitShapeMode(u)?.startsWith('notch-'));
  if (!canAutoShape) return u;

  const autoMode = resolveAutoUnitShapeMode(u, items);
  if (autoMode !== 'rect') {
    return {
      ...u,
      label: `unit:${autoMode}:auto`,
      angle: undefined,
    };
  }

  if (alreadyAutoCurved) {
    return { ...u, label: null, angle: undefined };
  }
  return u;
}

/**
 * Snaps any dragged or resized tile (`moved` — Unit, Atrium, or Landmark):
 * - When resizing (`orig` has different `w` or `h`), steps strictly 1 grid cell at a time without magnetic jumps.
 * - When overlapping ANY tile (`Unit`, `Atrium`, or `Landmark`), snaps flush to the nearest border with full border alignment, degree matching, and size/length matching.
 * - When dragged within `MAGNET_SNAP_GAP` of any tile, magnetically pulls to touch border-by-border
 *   (and on Polygon Atriums / Circle Atriums / Rotated Neighbors / Slanted Neighbor Units, auto-adjusts degree, length/size & shape).
 */
export function syncAtriumInnerTransitRow(
  items: ReadonlyArray<MapItem>,
  atriumKeyOrMovedKey: string,
  columns: number,
  referenceTile?: MapItem,
): { items: MapItem[]; changedCount: number } {
  const triggerItem = items.find((i) => i.key === atriumKeyOrMovedKey);
  if (!triggerItem) return { items: [...items], changedCount: 0 };

  const atr =
    triggerItem.kind === 'atrium'
      ? triggerItem
      : items.find((o) => o.kind === 'atrium' && rectsOverlap(triggerItem, o));
  if (!atr) return { items: [...items], changedCount: 0 };

  const innerTransits = items
    .filter(
      (i) =>
        (i.kind === 'stairs' || i.kind === 'escalator') &&
        rectsOverlap(i, atr),
    )
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (innerTransits.length < 2) return { items: [...items], changedCount: 0 };

  const ref =
    referenceTile && (referenceTile.kind === 'stairs' || referenceTile.kind === 'escalator')
      ? referenceTile
      : triggerItem.kind === 'stairs' || triggerItem.kind === 'escalator'
        ? triggerItem
        : innerTransits[0];
  const n = innerTransits.length;
  const maxAllowedTotalW = Math.max(n, atr.w - 2);
  const tw = Math.max(1, Math.min(ref.w, Math.floor(maxAllowedTotalW / n), columns));
  const th = Math.max(1, Math.min(ref.h, Math.max(1, atr.h - 2)));
  const totalW = tw * n;
  const startX = Math.max(0, Math.min(columns - totalW, Math.round(atr.x + (atr.w - totalW) * 0.5)));
  const rowY =
    triggerItem.kind === 'stairs' || triggerItem.kind === 'escalator'
      ? Math.max(atr.y, Math.min(atr.y + atr.h - th, triggerItem.y))
      : Math.max(0, Math.round(atr.y + (atr.h - th) * 0.5));

  const nextByKey = new Map<string, MapItem>();
  for (let k = 0; k < n; k++) {
    const t = innerTransits[k];
    nextByKey.set(t.key, {
      ...t,
      x: startX + k * tw,
      y: rowY,
      w: tw,
      h: th,
      angle: undefined,
    });
  }

  const innerKeySet = new Set(innerTransits.map((t) => t.key));
  const others = items.filter((o) => !innerKeySet.has(o.key));
  for (const cand of nextByKey.values()) {
    if (others.some((o) => tilesConflict(cand, o))) {
      return { items: [...items], changedCount: 0 };
    }
  }

  let changedCount = 0;
  const nextItems = items.map((it) => {
    const updated = nextByKey.get(it.key);
    if (!updated) return it;
    if (
      updated.x !== it.x ||
      updated.y !== it.y ||
      updated.w !== it.w ||
      updated.h !== it.h ||
      updated.angle !== it.angle
    ) {
      changedCount++;
    }
    return updated;
  });

  return { items: nextItems, changedCount };
}

export function snapTileToBorder(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
  orig?: MapItem,
  allowAutoResize = false,
  autoShape = true,
): MapItem | null {
  if (moved.kind === 'unit' && !moved.unitId) return null;
  activeSnapAutoResize = allowAutoResize;
  activeAutoShape = autoShape;
  if (orig && (moved.w !== orig.w || moved.h !== orig.h)) {
    return snapTileResizeMagnetically(moved, orig, items, columns);
  }
  try {
    let baseMoved = !autoShape && moved.kind === 'unit' && !moved.label ? { ...moved, label: 'unit:rect' } : moved;
    const others = items.filter((i) => i.key !== baseMoved.key);
    const transitInsideSnap = snapTransitLandmarkInsideAtrium(baseMoved, others, columns);
    if (transitInsideSnap) {
      return transitInsideSnap;
    }

    let detachedFromRing = false;
    if (autoShape && baseMoved.kind === 'unit' && (!orig || (baseMoved.w === orig.w && baseMoved.h === orig.h))) {
      const nowMatch = findNearestCircleCorridorForUnit(baseMoved, items);
      const polyChamfer = findPolygonAtriumCornerChamferForUnit(baseMoved, items);
      const outerWingMode = findOuterRingWingForUnit(baseMoved, items);
      const wingNotch = findAdjacentOuterWingNotchForUnit(baseMoved, items);
      const alreadyAutoCurved = isAutoAtriumSideCurveLabel(baseMoved.label);
      const nearRingNow = Boolean(
        wingNotch ||
          outerWingMode ||
          (nowMatch &&
            (isUnitCloseToCircleAtriumRim(nowMatch) ||
              (alreadyAutoCurved && isUnitWithinWalkwayOfCircleAtrium(nowMatch)))) ||
          (polyChamfer && (polyChamfer.boxGap <= 4.5 || (alreadyAutoCurved && polyChamfer.boxGap <= 8.0))),
      );
      if (!nearRingNow && alreadyAutoCurved) {
        baseMoved = { ...baseMoved, label: 'unit:rect', angle: undefined };
        detachedFromRing = true;
      } else if (nearRingNow) {
        baseMoved = applyAtriumAutoShapeToUnit(baseMoved, items, autoShape);
      }
    }
    const siblings = items.filter((i) => {
      if (i.key === baseMoved.key) return false;
      if (isAtriumTransitOverlap(baseMoved, i)) {
        return false;
      }
      if (baseMoved.kind === 'unit' && i.kind === 'unit' && i.unitId === baseMoved.unitId) {
        return true;
      }
      return tilesConflict(baseMoved, i);
    });
    const overlapSnapped = snapBlockToSiblingsBorder(baseMoved, siblings, items, columns);
    if (overlapSnapped) {
      return applyAtriumAutoShapeToUnit(overlapSnapped, items, autoShape);
    }
    const proximitySnapped = snapTileByMagneticProximity(baseMoved, items, columns);
    if (proximitySnapped) {
      return applyAtriumAutoShapeToUnit(proximitySnapped, items, autoShape);
    }
    const shaped = applyAtriumAutoShapeToUnit(baseMoved, items, autoShape);
    if (detachedFromRing || shaped.label !== moved.label || shaped.angle !== moved.angle) {
      return shaped;
    }
    return null;
  } finally {
    activeSnapAutoResize = false;
    activeAutoShape = true;
  }
}

/**
 * When Auto-Snap is OFF, curves only the Atrium-facing side of a unit tile (`crescent-*` / `notch-*`, outer walls straight `0°`)
 * when `autoShape` is ON, or preserves the unit's current shape (`unit:rect` or custom shape) when `autoShape` is OFF.
 */
export function curveUnitAroundCircleWithoutSnap(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  autoShape = true,
): MapItem {
  return applyAtriumAutoShapeToUnit(moved, items, autoShape);
}

/**
 * Smart Radial Ring Aligner (#23):
 * Automatically arranges and snaps units surrounding Circle Atriums or Polygon Atriums
 * along the perimeter with even angular spacing, tangent degree alignment, and Atrium-facing shapes,
 * and aligns interior transit landmarks (`stairs`, `escalator`) into a centered, equal-sized row.
 */
export function alignUnitsRadiallyAroundAtrium(
  items: ReadonlyArray<MapItem>,
  targetAtriumKey: string | null | undefined,
  columns: number,
  selectedKeys?: ReadonlySet<string>,
): { items: MapItem[]; alignedCount: number } {
  const atriums = items.filter(
    (i) => i.kind === 'atrium' && (!targetAtriumKey || i.key === targetAtriumKey),
  );
  if (atriums.length === 0) return { items: [...items], alignedCount: 0 };

  let current = items.map((i) => ({ ...i }));
  let alignedCount = 0;
  const prevAutoShape = activeAutoShape;
  const prevAutoResize = activeSnapAutoResize;
  activeAutoShape = true;
  activeSnapAutoResize = true;

  try {
    for (const atr of atriums) {
      if (!selectedKeys || selectedKeys.size === 0) {
        const innerSync = syncAtriumInnerTransitRow(current, atr.key, columns);
        if (innerSync.changedCount > 0) {
          current = innerSync.items;
          alignedCount += innerSync.changedCount;
        }
      }

      const acx = atr.x + atr.w * 0.5;
      const acy = atr.y + atr.h * 0.5;
      const rx = Math.max(2, atr.w * 0.5);
      const ry = Math.max(2, atr.h * 0.5);
      const isCircleAtr = isCircleRingCorridor(atr);
      const polyFaces = getPolygonAtriumWorldFaces(atr);

      const candidateUnits = current
        .filter((u) => {
          if (u.kind !== 'unit' || !u.unitId) return false;
          if (selectedKeys && selectedKeys.size > 0 && !selectedKeys.has(u.key)) return false;
          const cp = getClosestPointOnTileToPoint(u, acx, acy);
          const normDist = Math.hypot((cp.x - acx) / rx, (cp.y - acy) / ry);
          return normDist >= 0.55 && normDist <= 2.15;
        })
        .sort((a, b) => {
          const ta = Math.atan2(a.y + a.h * 0.5 - acy, a.x + a.w * 0.5 - acx);
          const tb = Math.atan2(b.y + b.h * 0.5 - acy, b.x + b.w * 0.5 - acx);
          return ta - tb;
        });

      const candidateKeySet = new Set(candidateUnits.map((u) => u.key));
      const placedCandidateKeys = new Set<string>();

      for (const u of candidateUnits) {
        const others = isCircleAtr
          ? current.filter((o) => o.key !== u.key && (!candidateKeySet.has(o.key) || placedCandidateKeys.has(o.key)))
          : current.filter((o) => o.key !== u.key);
        let snapped: {
          x: number;
          y: number;
          w: number;
          h: number;
          angle: number | undefined;
          label?: string | null;
        } | null = null;

        if (polyFaces) {
          const polyCand = findPolygonAtriumMagneticCandidate(u, atr, others, columns);
          if (polyCand) {
            snapped = {
              x: polyCand.x,
              y: polyCand.y,
              w: polyCand.w,
              h: polyCand.h,
              angle: polyCand.angle,
              label: polyCand.hasLabel ? polyCand.label : u.label,
            };
          }
        } else if (isCircleAtr) {
          const cp = getClosestPointOnTileToPoint(u, acx, acy);
          const normDist = Math.hypot((cp.x - acx) / rx, (cp.y - acy) / ry);
          const isOuterWing =
            u.w >= 3 &&
            u.h >= 4 &&
            (Boolean(u.label?.startsWith('unit:arch-')) || findOuterRingWingForUnit(u, current) !== null);
          const isTrap = Boolean(u.label?.startsWith('unit:trapezoid-ring'));
          if (isOuterWing) {
            const wingCand = findOuterRingWingMagneticCandidate(u, others, columns);
            if (wingCand) {
              snapped = {
                x: wingCand.x,
                y: wingCand.y,
                w: wingCand.w,
                h: wingCand.h,
                angle: wingCand.angle,
                label: wingCand.label,
              };
            }
          } else {
            const uForRing: MapItem =
              normDist <= 2.15 && (u.w <= 7 || u.h <= 6)
                ? { ...u, label: isTrap ? 'unit:trapezoid-ring' : 'unit:ring-curve' }
                : u;
            const ringCand = findCircleCorridorMagneticCandidate(uForRing, atr, others, columns);
            if (ringCand) {
              snapped = {
                x: ringCand.x,
                y: ringCand.y,
                w: ringCand.w,
                h: ringCand.h,
                angle: ringCand.angle,
                label: ringCand.label,
              };
            }
          }
        }

        if (snapped) {
          const nextUnit: MapItem = applyAtriumAutoShapeToUnit(
            {
              ...u,
              x: snapped.x,
              y: snapped.y,
              w: snapped.w,
              h: snapped.h,
              angle: snapped.angle,
              label: snapped.label ?? u.label,
            },
            current,
            true,
          );
          if (
            !others.some((o) => {
              if (isTransitLandmark(o.kind) && rectsOverlap(o, atr)) return false;
              return tilesConflict(nextUnit, o);
            })
          ) {
            if (
              nextUnit.x !== u.x ||
              nextUnit.y !== u.y ||
              nextUnit.w !== u.w ||
              nextUnit.h !== u.h ||
              nextUnit.angle !== u.angle ||
              nextUnit.label !== u.label
            ) {
              alignedCount++;
            }
            current = current.map((item) => (item.key === u.key ? nextUnit : item));
            placedCandidateKeys.add(u.key);
          } else {
            placedCandidateKeys.add(u.key);
          }
        } else {
          placedCandidateKeys.add(u.key);
        }
      }

      // Second pass on Circle Atriums: snap & auto-shape outer corner wing units (`arch-*`, e.g. GFL-A3) and their adjacent notch partners (`notch-*`, e.g. GFL-A30)
      if (isCircleAtr) {
        for (const item of [...current]) {
          if (item.kind !== 'unit' || !item.unitId) continue;
          if (selectedKeys && selectedKeys.size > 0 && !selectedKeys.has(item.key)) continue;
          const others = current.filter((o) => o.key !== item.key);
          const wingCand = findOuterRingWingMagneticCandidate(item, others, columns);
          const nextItem = wingCand
            ? applyAtriumAutoShapeToUnit(
                {
                  ...item,
                  x: wingCand.x,
                  y: wingCand.y,
                  w: wingCand.w,
                  h: wingCand.h,
                  angle: wingCand.angle,
                  label: wingCand.label ?? item.label,
                },
                current,
                true,
              )
            : applyAtriumAutoShapeToUnit(item, current, true);
          if (
            (nextItem.x !== item.x ||
              nextItem.y !== item.y ||
              nextItem.w !== item.w ||
              nextItem.h !== item.h ||
              nextItem.label !== item.label) &&
            !others.some((o) => tilesConflict(nextItem, o))
          ) {
            alignedCount++;
            current = current.map((c) => (c.key === item.key ? nextItem : c));
          }
        }

        // Third pass: align any partner unit (`GFL-A30`) next to an `arch-*` wing (`GFL-A3`)
        for (const item of [...current]) {
          if (item.kind !== 'unit' || !item.unitId) continue;
          if (selectedKeys && selectedKeys.size > 0 && !selectedKeys.has(item.key)) continue;
          const wingNotch = findAdjacentOuterWingNotchForUnit(item, current);
          if (!wingNotch) continue;
          const others = current.filter((o) => o.key !== item.key);
          const snappedPartner = snapTileByMagneticProximity(item, current, columns);
          const nextPartner = applyAtriumAutoShapeToUnit(snappedPartner ?? item, current, true);
          if (
            (nextPartner.x !== item.x ||
              nextPartner.y !== item.y ||
              nextPartner.w !== item.w ||
              nextPartner.h !== item.h ||
              nextPartner.label !== item.label) &&
            !others.some((o) => tilesConflict(nextPartner, o))
          ) {
            alignedCount++;
            current = current.map((c) => (c.key === item.key ? nextPartner : c));
          }
        }
      }
    }
  } finally {
    activeAutoShape = prevAutoShape;
    activeSnapAutoResize = prevAutoResize;
  }

  return { items: current, alignedCount };
}

export interface MagneticSnapGuide {
  /** Primary shared border or Polygon Atrium face segment (in grid cell coordinates). */
  touchLine: { x1: number; y1: number; x2: number; y2: number };
  /** Extended collinear alignment guide lines (in grid cell coordinates). */
  guideLines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** Midpoint of the touching border (in grid cell coordinates) where the floating badge renders. */
  badgePos: { x: number; y: number };
  /** Human-readable snap badge text, e.g. "45° • 8-Face Line & Length" or "Equal Height (3) • Full Touch". */
  badgeText: string;
  /** True when snapped to a Polygon Atrium (8/12/24-Face) face. */
  isPolygonAtriumSnap: boolean;
}

/**
 * Computes visual magnetic snap guide lines (`touchLine`, `guideLines`) and floating badge metadata (`badgePos`, `badgeText`)
 * when a dragged or resized tile (`snapped`) snaps onto a Polygon Atrium (`8/12/24-Face`) face or touches a neighbor's border.
 */
export function computeMagneticSnapGuide(
  snapped: MapItem,
  allItems: ReadonlyArray<MapItem>,
): MagneticSnapGuide | null {
  const others = allItems.filter((i) => i.key !== snapped.key);

  // 1. Check Polygon Atrium (8/12/24-Face) face snap
  for (const a of others) {
    if (a.kind !== 'atrium') continue;
    const polyFaces = getPolygonAtriumWorldFaces(a);
    if (!polyFaces) continue;
    const match = matchSinglePolygonAtriumFaceForItem(snapped, a);
    if (!match) continue;
    const face = polyFaces.find((f) => f.index === match.faceIndex);
    if (!face) continue;

    const deg = Math.round(snapped.angle ?? 0) % 360;
    const ext = 1.6;
    return {
      touchLine: { x1: face.x0, y1: face.y0, x2: face.x1, y2: face.y1 },
      guideLines: [
        {
          x1: face.x0 - face.tx * ext,
          y1: face.y0 - face.ty * ext,
          x2: face.x1 + face.tx * ext,
          y2: face.y1 + face.ty * ext,
        },
      ],
      badgePos: { x: (face.x0 + face.x1) * 0.5, y: (face.y0 + face.y1) * 0.5 },
      badgeText: `${deg}° • ${polyFaces.length}-Face Line & Length`,
      isPolygonAtriumSnap: true,
    };
  }

  // 1b. Check Circle Atrium / Ring curve snap for any Unit or Landmark
  if (snapped.kind !== 'atrium') {
    const ringMatch = findNearestCircleCorridorForUnit(snapped, allItems);
    if (ringMatch && ringMatch.isNear) {
      const deg = Math.round(snapped.angle ?? 0) % 360;
      const ucx = snapped.x + snapped.w * 0.5;
      const ucy = snapped.y + snapped.h * 0.5;
      const rxGuide = ringMatch.rxOut;
      const ryGuide = ringMatch.ryOut;
      const theta = Math.atan2((ucy - ringMatch.cy) / ringMatch.ryOut, (ucx - ringMatch.cx) / ringMatch.rxOut);
      const bx = ringMatch.cx + rxGuide * Math.cos(theta);
      const by = ringMatch.cy + ryGuide * Math.sin(theta);
      const gnx = Math.cos(theta) / rxGuide;
      const gny = Math.sin(theta) / ryGuide;
      const gLen = Math.hypot(gnx, gny) || 1;
      const tx = -gny / gLen;
      const ty = gnx / gLen;
      const halfSpan = Math.max(snapped.w, snapped.h) * 0.5;
      return {
        touchLine: {
          x1: bx - tx * halfSpan,
          y1: by - ty * halfSpan,
          x2: bx + tx * halfSpan,
          y2: by + ty * halfSpan,
        },
        guideLines: [
          {
            x1: bx - tx * (halfSpan + 1.2),
            y1: by - ty * (halfSpan + 1.2),
            x2: bx + tx * (halfSpan + 1.2),
            y2: by + ty * (halfSpan + 1.2),
          },
        ],
        badgePos: { x: bx, y: by },
        badgeText: `${deg}° • Circle Curve Match`,
        isPolygonAtriumSnap: true,
      };
    }
  }

  if (snapped.kind === 'unit') {
    // 1c. Check Slanted Neighbor Unit touch for a slanted/chamfered Unit
    const unitMode = parseUnitShapeMode(snapped);
    if (
      unitMode &&
      (unitMode.startsWith('slope-') || unitMode.startsWith('chamfer-'))
    ) {
      for (const c of others) {
        if (c.kind !== 'unit' || isCircleRingCorridor(c)) continue;
        const gapX = Math.max(0, c.x - (snapped.x + snapped.w), snapped.x - (c.x + c.w));
        const gapY = Math.max(0, c.y - (snapped.y + snapped.h), snapped.y - (c.y + c.h));
        if (gapX <= 1.5 && gapY <= 1.5) {
          const isBottomEdge = unitMode.includes('-b-') || unitMode.includes('-bl') || unitMode.includes('-br');
          const y1 = isBottomEdge
            ? snapped.y + snapped.h * (unitMode === 'slope-b-l' || unitMode === 'chamfer-bl' ? 0.72 : 1)
            : snapped.y + snapped.h * (unitMode === 'slope-t-l' || unitMode === 'chamfer-tl' ? 0.28 : 0);
          const y2 = isBottomEdge
            ? snapped.y + snapped.h * (unitMode === 'slope-b-r' || unitMode === 'chamfer-br' ? 0.72 : 1)
            : snapped.y + snapped.h * (unitMode === 'slope-t-r' || unitMode === 'chamfer-tr' ? 0.28 : 0);
          return {
            touchLine: { x1: snapped.x, y1, x2: snapped.x + snapped.w, y2 },
            guideLines: [{ x1: snapped.x - 0.8, y1, x2: snapped.x + snapped.w + 0.8, y2 }],
            badgePos: { x: snapped.x + snapped.w * 0.5, y: (y1 + y2) * 0.5 },
            badgeText: `${isBottomEdge ? 'Slant Bottom' : 'Slant Top'} • Slanted Edge Match`,
            isPolygonAtriumSnap: true,
          };
        }
      }
    }
  }

  // 1d. Check Rotated Neighbor border snap (when both tiles share a non-zero rotation angle)
  const snappedNormAngle = (((snapped.angle ?? 0) % 360) + 360) % 360;
  if (snappedNormAngle !== 0) {
    const rad = (snappedNormAngle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = -uy;
    const vy = ux;
    const scx = snapped.x + snapped.w * 0.5;
    const scy = snapped.y + snapped.h * 0.5;
    const tol = 0.72;

    for (const o of others) {
      const oNormAngle = (((o.angle ?? 0) % 360) + 360) % 360;
      if (oNormAngle !== snappedNormAngle) continue;
      const ocx = o.x + o.w * 0.5;
      const ocy = o.y + o.h * 0.5;
      const du = (scx - ocx) * ux + (scy - ocy) * uy;
      const dv = (scx - ocx) * vx + (scy - ocy) * vy;
      const halfU = (snapped.w + o.w) * 0.5;
      const halfV = (snapped.h + o.h) * 0.5;

      const touchU = Math.abs(Math.abs(du) - halfU) <= tol && Math.abs(dv) <= halfV - 0.25;
      const touchV = Math.abs(Math.abs(dv) - halfV) <= tol && Math.abs(du) <= halfU - 0.25;
      if (!touchU && !touchV) continue;

      const deg = Math.round(snappedNormAngle) % 360;
      if (touchU && (!touchV || Math.abs(Math.abs(du) - halfU) <= Math.abs(Math.abs(dv) - halfV))) {
        const signU = du >= 0 ? 1 : -1;
        const edgeMidX = ocx + signU * (o.w * 0.5) * ux + dv * 0.5 * vx;
        const edgeMidY = ocy + signU * (o.w * 0.5) * uy + dv * 0.5 * vy;
        const halfSpan = Math.min(snapped.h, o.h) * 0.5;
        return {
          touchLine: {
            x1: edgeMidX - vx * halfSpan,
            y1: edgeMidY - vy * halfSpan,
            x2: edgeMidX + vx * halfSpan,
            y2: edgeMidY + vy * halfSpan,
          },
          guideLines: [
            {
              x1: edgeMidX - vx * (halfSpan + 1.2),
              y1: edgeMidY - vy * (halfSpan + 1.2),
              x2: edgeMidX + vx * (halfSpan + 1.2),
              y2: edgeMidY + vy * (halfSpan + 1.2),
            },
          ],
          badgePos: { x: edgeMidX, y: edgeMidY },
          badgeText: `${deg}° • Equal Height (${snapped.h}) • Touch`,
          isPolygonAtriumSnap: true,
        };
      } else {
        const signV = dv >= 0 ? 1 : -1;
        const edgeMidX = ocx + du * 0.5 * ux + signV * (o.h * 0.5) * vx;
        const edgeMidY = ocy + du * 0.5 * uy + signV * (o.h * 0.5) * vy;
        const halfSpan = Math.min(snapped.w, o.w) * 0.5;
        return {
          touchLine: {
            x1: edgeMidX - ux * halfSpan,
            y1: edgeMidY - uy * halfSpan,
            x2: edgeMidX + ux * halfSpan,
            y2: edgeMidY + uy * halfSpan,
          },
          guideLines: [
            {
              x1: edgeMidX - ux * (halfSpan + 1.2),
              y1: edgeMidY - uy * (halfSpan + 1.2),
              x2: edgeMidX + ux * (halfSpan + 1.2),
              y2: edgeMidY + uy * (halfSpan + 1.2),
            },
          ],
          badgePos: { x: edgeMidX, y: edgeMidY },
          badgeText: `${deg}° • Equal Width (${snapped.w}) • Touch`,
          isPolygonAtriumSnap: true,
        };
      }
    }
  }

  // 2. Check standard rectangular border contact with adjacent tiles
  let bestGuide: { guide: MagneticSnapGuide; overlapLen: number } | null = null;

  for (const o of others) {
    // Vertical shared border (Left or Right of `snapped`)
    if (snapped.x + snapped.w === o.x || snapped.x === o.x + o.w) {
      const ovY1 = Math.max(snapped.y, o.y);
      const ovY2 = Math.min(snapped.y + snapped.h, o.y + o.h);
      const ovLen = ovY2 - ovY1;
      if (ovLen > 0) {
        const edgeX = snapped.x + snapped.w === o.x ? snapped.x + snapped.w : snapped.x;
        const guideLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [
          {
            x1: edgeX,
            y1: Math.max(0, Math.min(snapped.y, o.y) - 0.8),
            x2: edgeX,
            y2: Math.max(snapped.y + snapped.h, o.y + o.h) + 0.8,
          },
        ];
        if (snapped.y === o.y) {
          guideLines.push({
            x1: Math.min(snapped.x, o.x),
            y1: snapped.y,
            x2: Math.max(snapped.x + snapped.w, o.x + o.w),
            y2: snapped.y,
          });
        }
        if (snapped.y + snapped.h === o.y + o.h) {
          guideLines.push({
            x1: Math.min(snapped.x, o.x),
            y1: snapped.y + snapped.h,
            x2: Math.max(snapped.x + snapped.w, o.x + o.w),
            y2: snapped.y + snapped.h,
          });
        }
        const badgeText =
          snapped.y === o.y && snapped.h === o.h
            ? `Equal Height (${snapped.h}) • Full Touch`
            : snapped.y === o.y || snapped.y + snapped.h === o.y + o.h
              ? 'Edge Aligned • Full Touch'
              : 'Full Border Touch';
        if (!bestGuide || ovLen > bestGuide.overlapLen) {
          bestGuide = {
            overlapLen: ovLen,
            guide: {
              touchLine: { x1: edgeX, y1: ovY1, x2: edgeX, y2: ovY2 },
              guideLines,
              badgePos: { x: edgeX, y: (ovY1 + ovY2) * 0.5 },
              badgeText,
              isPolygonAtriumSnap: false,
            },
          };
        }
      }
    }

    // Horizontal shared border (Top or Bottom of `snapped`)
    if (snapped.y + snapped.h === o.y || snapped.y === o.y + o.h) {
      const ovX1 = Math.max(snapped.x, o.x);
      const ovX2 = Math.min(snapped.x + snapped.w, o.x + o.w);
      const ovLen = ovX2 - ovX1;
      if (ovLen > 0) {
        const edgeY = snapped.y + snapped.h === o.y ? snapped.y + snapped.h : snapped.y;
        const guideLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [
          {
            x1: Math.max(0, Math.min(snapped.x, o.x) - 0.8),
            y1: edgeY,
            x2: Math.max(snapped.x + snapped.w, o.x + o.w) + 0.8,
            y2: edgeY,
          },
        ];
        if (snapped.x === o.x) {
          guideLines.push({
            x1: snapped.x,
            y1: Math.min(snapped.y, o.y),
            x2: snapped.x,
            y2: Math.max(snapped.y + snapped.h, o.y + o.h),
          });
        }
        if (snapped.x + snapped.w === o.x + o.w) {
          guideLines.push({
            x1: snapped.x + snapped.w,
            y1: Math.min(snapped.y, o.y),
            x2: snapped.x + snapped.w,
            y2: Math.max(snapped.y + snapped.h, o.y + o.h),
          });
        }
        const badgeText =
          snapped.x === o.x && snapped.w === o.w
            ? `Equal Width (${snapped.w}) • Full Touch`
            : snapped.x === o.x || snapped.x + snapped.w === o.x + o.w
              ? 'Edge Aligned • Full Touch'
              : 'Full Border Touch';
        if (!bestGuide || ovLen > bestGuide.overlapLen) {
          bestGuide = {
            overlapLen: ovLen,
            guide: {
              touchLine: { x1: ovX1, y1: edgeY, x2: ovX2, y2: edgeY },
              guideLines,
              badgePos: { x: (ovX1 + ovX2) * 0.5, y: edgeY },
              badgeText,
              isPolygonAtriumSnap: false,
            },
          };
        }
      }
    }
  }

  return bestGuide?.guide ?? null;
}

/**
 * Places a new `escalator` (Elevator / Lift / Escalator), `stairs`, or `info` tile directly inside `atriumKey`
 * (and adjacent to any existing transit tile inside that Atrium so they auto-merge side-by-side).
 */
export function addTransitIntoAtrium(
  items: MapItem[],
  atriumKey: string,
  kind: 'escalator' | 'stairs' | 'info',
  variant: string,
  columns: number,
  newKey: string = `d:${kind}-${items.length + 1}`,
): MapItem[] {
  const atrium = items.find((i) => i.key === atriumKey && i.kind === 'atrium');
  if (!atrium) return items;

  const w = Math.max(1, Math.min(atrium.w >= 8 ? 5 : 2, atrium.w, columns));
  const h = Math.max(1, Math.min(atrium.h >= 8 ? 4 : 2, atrium.h));
  const label = encodeLandmarkMeta(kind, variant);

  const fitsInsideAtrium = (x: number, y: number, tw: number, th: number) =>
    x >= atrium.x &&
    y >= atrium.y &&
    x + tw <= Math.min(columns, atrium.x + atrium.w) &&
    y + th <= atrium.y + atrium.h &&
    !items.some((o) => tilesConflict({ key: newKey, kind, unitId: null, label, x, y, w: tw, h: th }, o));

  // 1. If there are already transit tiles inside this Atrium, match their dimensions and attach right next to one so they merge
  const innerTransits = items.filter(
    (i) => isTransitLandmark(i.kind) && rectsOverlap(i, atrium),
  );
  const peerW = isTransitLandmark(kind) && innerTransits[0] ? innerTransits[0].w : w;
  const peerH = isTransitLandmark(kind) && innerTransits[0] ? innerTransits[0].h : h;
  for (const [tw, th] of [[peerW, peerH], [w, h], [2, 2], [1, 1]] as Array<[number, number]>) {
    for (const host of innerTransits) {
      const adjSpots: Array<[number, number]> = [
        [host.x + host.w, host.y],
        [host.x - tw, host.y],
        [host.x, host.y + host.h],
        [host.x, host.y - th],
      ];
      for (const [cx, cy] of adjSpots) {
        if (fitsInsideAtrium(cx, cy, tw, th)) {
          const placed = [...items, { key: newKey, kind, unitId: null, label, x: cx, y: cy, w: tw, h: th }];
          return isTransitLandmark(kind)
            ? syncAtriumInnerTransitRow(placed, newKey, columns).items
            : placed;
        }
      }
    }

    // 2. Otherwise try the center of the Atrium, then scan all cells inside the Atrium
    const centerX = atrium.x + Math.floor((atrium.w - tw) / 2);
    const centerY = atrium.y + Math.floor((atrium.h - th) / 2);
    if (fitsInsideAtrium(centerX, centerY, tw, th)) {
      const placed = [...items, { key: newKey, kind, unitId: null, label, x: centerX, y: centerY, w: tw, h: th }];
      return isTransitLandmark(kind)
        ? syncAtriumInnerTransitRow(placed, newKey, columns).items
        : placed;
    }
    for (let y = atrium.y; y + th <= atrium.y + atrium.h; y++) {
      for (let x = atrium.x; x + tw <= Math.min(columns, atrium.x + atrium.w); x++) {
        if (fitsInsideAtrium(x, y, tw, th)) {
          const placed = [...items, { key: newKey, kind, unitId: null, label, x, y, w: tw, h: th }];
          return isTransitLandmark(kind)
            ? syncAtriumInnerTransitRow(placed, newKey, columns).items
            : placed;
        }
      }
    }
  }

  // Fallback: place touching the Atrium's outer border
  const adj = findAdjacentSpot(items, atrium, w, h, columns);
  return [...items, { key: newKey, kind, unitId: null, label, x: adj.x, y: adj.y, w, h }];
}

/**
 * Clamp tiles inside the grid, then push any tile that overlaps an earlier one
 * straight down until it fits. Used after the scale changes or sizes are recomputed.
 */
function resolveOverlaps(items: MapItem[], columns: number): MapItem[] {
  const clamped = items.map((it) => {
    const w = Math.min(it.w, columns);
    return { ...it, w, x: Math.max(0, Math.min(it.x, columns - w)) };
  });
  const byKey = resolveOverlapsWithLockedItems([], clamped);
  return items.map((it) => byKey.get(it.key)!);
}

/** Preserves saved manual tile dimensions when valid, falling back to `tileSizeFromSqft`. */
function sizeUnitTile(
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
 * Automatically calibrates sqft-per-cell from the actual database `areaSqft`
 * of placed units divided by their total occupied grid cells across all blocks:
 *   sqftPerCell = sum(unit.areaSqft) / sum(unitCells)
 */
export function calibrateSqftPerCell(
  items: MapItem[],
  shopByUnit: Map<string, any>,
  fallbackSqftPerCell = DEFAULT_SQFT_PER_CELL,
): number {
  const cellsByUnit = new Map<string, number>();
  for (const it of items) {
    if (it.kind !== 'unit' || !it.unitId) continue;
    cellsByUnit.set(it.unitId, (cellsByUnit.get(it.unitId) ?? 0) + Math.max(1, it.w * it.h));
  }
  let totalSqft = 0;
  let totalCells = 0;
  for (const [uId, cells] of cellsByUnit.entries()) {
    const rawSqft = Number(shopByUnit.get(uId)?.unit?.areaSqft);
    if (rawSqft > 0) {
      totalSqft += rawSqft;
      totalCells += cells;
    }
  }
  if (totalSqft > 0 && totalCells > 0) {
    const calibrated = totalSqft / totalCells;
    return Math.max(4, Math.min(500, Math.round(calibrated * 10) / 10));
  }
  return fallbackSqftPerCell > 0 ? fallbackSqftPerCell : DEFAULT_SQFT_PER_CELL;
}

/**
 * Resizes single-block unit tiles proportionally to their real database `areaSqft`
 * while preserving custom multi-block (L / T / U) unit shapes intact.
 */
export function syncUnitTilesToSqft(
  items: MapItem[],
  shopByUnit: Map<string, any>,
  sqftPerCell: number,
  columns: number,
): { items: MapItem[]; updatedCount: number; calibratedSqftPerCell: number } {
  const effectiveSpc = calibrateSqftPerCell(items, shopByUnit, sqftPerCell);
  const blockCountByUnit = new Map<string, number>();
  for (const it of items) {
    if (it.kind === 'unit' && it.unitId) {
      blockCountByUnit.set(it.unitId, (blockCountByUnit.get(it.unitId) ?? 0) + 1);
    }
  }
  let updatedCount = 0;
  const resized = items.map((it) => {
    if (it.kind !== 'unit' || !it.unitId) return it;
    if ((blockCountByUnit.get(it.unitId) ?? 0) > 1) return it;
    const rawSqft = Number(shopByUnit.get(it.unitId)?.unit?.areaSqft);
    if (!(rawSqft > 0)) return it;
    const isVertical = it.h > it.w;
    const base = tileSizeFromSqft(rawSqft, effectiveSpc, columns);
    const nextW = Math.min(columns, isVertical ? base.h : base.w);
    const nextH = isVertical ? base.w : base.h;
    if (nextW !== it.w || nextH !== it.h) {
      updatedCount++;
    }
    return { ...it, w: nextW, h: nextH };
  });
  const resolvedCols = Math.max(columns, DEFAULT_COLUMNS, ...resized.map((i) => i.x + i.w));
  const resolved = resolveOverlaps(resized, resolvedCols);
  const finalSpc = calibrateSqftPerCell(resolved, shopByUnit, effectiveSpc);
  return {
    items: resolved,
    updatedCount,
    calibratedSqftPerCell: finalSpc,
  };
}

export type MapRotationAngle = 0 | 90 | 180 | 270;

export function parseRotationAngle(val: string | number | null | undefined): MapRotationAngle {
  const n = ((Number(val) % 360) + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

/**
 * Rotates the map layout by 0°, 90°, 180°, or 270° clockwise around the occupied bounding box
 * while keeping individual tile text and icons upright.
 */
/**
 * View mode: drops the empty grid space left of / above the first tile and right of the last one, so the map is
 * not pushed down or sideways by unused rows and columns (the saved grid keeps its editing padding).
 */
export function cropLayoutToContent(
  layout: { items: MapItem[]; columns: number },
  pad = 1,
  minColumns = 12,
): { items: MapItem[]; columns: number } {
  const { items } = layout;
  if (items.length === 0) return layout;
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const dx = Math.max(0, minX - pad);
  const dy = Math.max(0, minY - pad);
  return {
    items: dx === 0 && dy === 0 ? items : items.map((it) => ({ ...it, x: it.x - dx, y: it.y - dy })),
    columns: Math.max(minColumns, Math.ceil(maxX - dx + pad)),
  };
}

export function rotateMapLayout(
  items: MapItem[],
  columns: number,
  rotation: MapRotationAngle,
): { items: MapItem[]; columns: number } {
  if (!rotation || items.length === 0) {
    return { items, columns };
  }

  const minX = Math.min(...items.map((i) => i.x));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const minY = Math.min(...items.map((i) => i.y));
  const maxY = Math.max(...items.map((i) => i.y + i.h));

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  if (rotation === 180) {
    return {
      columns,
      items: items.map((it) => {
        const lx = it.x - minX;
        const ly = it.y - minY;
        return {
          ...it,
          x: Math.max(0, minX + (spanX - (lx + it.w))),
          y: Math.max(0, minY + (spanY - (ly + it.h))),
          w: it.w,
          h: it.h,
        };
      }),
    };
  }

  const rotatedCols = Math.max(12, spanY + 2);
  const padX = Math.max(0, Math.floor((rotatedCols - spanY) / 2));
  return {
    columns: rotatedCols,
    items: items.map((it) => {
      const lx = it.x - minX;
      const ly = it.y - minY;
      return {
        ...it,
        x: rotation === 90 ? padX + (spanY - (ly + it.h)) : padX + ly,
        y: rotation === 90 ? 1 + lx : 1 + (spanX - (lx + it.w)),
        w: it.h,
        h: it.w,
      };
    }),
  };
}

export {
  buildSmoothRouteSvgPath,
  computeFloorplateBounds,
  computeRouteDirectionArrows,
  computeWalkwayPath,
  findDefaultStartItem,
  findNearestFacilityItem,
} from './shopMapRouting';
export type { WalkwayRouteResult, WalkwayRouteStep } from './shopMapRouting';

function subtractIntervals(total: number, removals: ReadonlyArray<[number, number]>): Array<[number, number]> {
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

const EDGE_EPS = 0.02;
const MIN_SHARED_EDGE = 0.1;
const CORNER_EPS = 0.05;

/**
 * Clips a 1D world segment `P(t) = (p0x + t*dx, p0y + t*dy)` for `t in [0, segLen]`
 * (where `(dx, dy)` is a unit vector) against `target`'s visual rectangle
 * (centered at `(target.x + target.w/2, target.y + target.h/2)` and rotated by `target.angle`),
 * expanded by `EDGE_EPS` so edge-touching tiles register cleanly while corner-only touches
 * (`length <= MIN_SHARED_EDGE`) are ignored.
 */
function clipSegmentToRotatedItem(
  p0x: number,
  p0y: number,
  dx: number,
  dy: number,
  segLen: number,
  target: { x: number; y: number; w: number; h: number; angle?: number },
): [number, number] | null {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const hw = target.w / 2 + EDGE_EPS;
  const hh = target.h / 2 + EDGE_EPS;
  const rad = ((target.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rx = p0x - cx;
  const ry = p0y - cy;

  const u0 = rx * cos + ry * sin;
  const du = dx * cos + dy * sin;
  const v0 = -rx * sin + ry * cos;
  const dv = -dx * sin + dy * cos;

  let tMin = 0;
  let tMax = segLen;

  const clipAxis = (pos0: number, dir: number, limit: number): boolean => {
    if (Math.abs(dir) < 1e-9) {
      return Math.abs(pos0) <= limit;
    }
    const t1 = (-limit - pos0) / dir;
    const t2 = (limit - pos0) / dir;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return tMax > tMin;
  };

  if (!clipAxis(u0, du, hw)) return null;
  if (!clipAxis(v0, dv, hh)) return null;

  const a = Math.max(0, tMin);
  const b = Math.min(segLen, tMax);
  if (b - a <= MIN_SHARED_EDGE) return null;
  return [a, b];
}

export interface SharpCorners {
  tlSharp: boolean;
  trSharp: boolean;
  blSharp: boolean;
  brSharp: boolean;
}

export interface EdgeMergeGeometry extends SharpCorners {
  hasMerge: boolean;
  topMerged: boolean;
  rightMerged: boolean;
  bottomMerged: boolean;
  leftMerged: boolean;
  topSegs: Array<[number, number]>;
  rightSegs: Array<[number, number]>;
  bottomSegs: Array<[number, number]>;
  leftSegs: Array<[number, number]>;
}

interface LocalTileFrame {
  tlx: number;
  tly: number;
  blx: number;
  bly: number;
  trx: number;
  try_: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

function getLocalTileFrame(it: { x: number; y: number; w: number; h: number; angle?: number }): LocalTileFrame {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const hw = it.w / 2;
  const hh = it.h / 2;
  const rad = ((it.angle ?? 0) * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  return {
    tlx: cx - hw * ux - hh * vx,
    tly: cy - hw * uy - hh * vy,
    blx: cx - hw * ux + hh * vx,
    bly: cy - hw * uy + hh * vy,
    trx: cx + hw * ux - hh * vx,
    try_: cy + hw * uy - hh * vy,
    ux,
    uy,
    vx,
    vy,
  };
}

function getTileWorldCorners(
  it: { x: number; y: number; w: number; h: number; angle?: number },
  f = getLocalTileFrame(it),
): Array<{ x: number; y: number }> {
  return [
    { x: f.tlx, y: f.tly },
    { x: f.trx, y: f.try_ },
    { x: f.trx + it.h * f.vx, y: f.try_ + it.h * f.vy },
    { x: f.blx, y: f.bly },
  ];
}

interface PolygonAtriumWorldFace {
  index: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  len: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  isCardinal: boolean;
}

export function getPolygonAtriumWorldFaces(atrium: {
  kind?: TileKind | string;
  label?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
}): PolygonAtriumWorldFace[] | null {
  if (atrium.kind !== 'atrium') return null;
  const faces = parseLandmarkMeta('atrium', atrium.label).polygonFaces;
  if (!faces) return null;
  const cx = atrium.x + atrium.w / 2;
  const cy = atrium.y + atrium.h / 2;
  const rx = atrium.w / 2;
  const ry = atrium.h / 2;
  const rad = ((atrium.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cosStep = Math.cos(Math.PI / faces);

  const verts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < faces; i++) {
    const theta = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / faces;
    const ux = Math.max(-1, Math.min(1, Math.cos(theta) / cosStep)) * rx;
    const uy = Math.max(-1, Math.min(1, Math.sin(theta) / cosStep)) * ry;
    verts.push({
      x: cx + ux * cos - uy * sin,
      y: cy + ux * sin + uy * cos,
    });
  }

  const result: PolygonAtriumWorldFace[] = [];
  for (let i = 0; i < faces; i++) {
    const v0 = verts[i];
    const v1 = verts[(i + 1) % faces];
    const dx = v1.x - v0.x;
    const dy = v1.y - v0.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;
    const tx = dx / len;
    const ty = dy / len;
    const nx = ty;
    const ny = -tx;
    result.push({
      index: i,
      x0: v0.x,
      y0: v0.y,
      x1: v1.x,
      y1: v1.y,
      len,
      tx,
      ty,
      nx,
      ny,
      isCardinal: Math.abs(nx) < 1e-4 || Math.abs(ny) < 1e-4,
    });
  }
  return result;
}

interface PolygonAtriumFaceMatch {
  edge: 'top' | 'right' | 'bottom' | 'left';
  tileHit: [number, number];
  faceIndex: number;
  faceHit: [number, number];
}

function matchSinglePolygonAtriumFace(
  frame: LocalTileFrame,
  w: number,
  h: number,
  atrium: { kind?: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  activeRanges?: {
    top?: [number, number] | null;
    right?: [number, number] | null;
    bottom?: [number, number] | null;
    left?: [number, number] | null;
  },
): PolygonAtriumFaceMatch | null {
  const polyFaces = getPolygonAtriumWorldFaces(atrium);
  if (!polyFaces) return null;

  const edges: Array<{
    name: 'top' | 'right' | 'bottom' | 'left';
    p0x: number;
    p0y: number;
    dx: number;
    dy: number;
    minT: number;
    maxT: number;
    outNx: number;
    outNy: number;
  }> = [];

  if (activeRanges?.top !== null) {
    edges.push({
      name: 'top',
      p0x: frame.tlx,
      p0y: frame.tly,
      dx: frame.ux,
      dy: frame.uy,
      minT: activeRanges?.top?.[0] ?? 0,
      maxT: activeRanges?.top?.[1] ?? w,
      outNx: -frame.vx,
      outNy: -frame.vy,
    });
  }
  if (activeRanges?.bottom !== null) {
    edges.push({
      name: 'bottom',
      p0x: frame.blx,
      p0y: frame.bly,
      dx: frame.ux,
      dy: frame.uy,
      minT: activeRanges?.bottom?.[0] ?? 0,
      maxT: activeRanges?.bottom?.[1] ?? w,
      outNx: frame.vx,
      outNy: frame.vy,
    });
  }
  if (activeRanges?.left !== null) {
    edges.push({
      name: 'left',
      p0x: frame.tlx,
      p0y: frame.tly,
      dx: frame.vx,
      dy: frame.vy,
      minT: activeRanges?.left?.[0] ?? 0,
      maxT: activeRanges?.left?.[1] ?? h,
      outNx: -frame.ux,
      outNy: -frame.uy,
    });
  }
  if (activeRanges?.right !== null) {
    edges.push({
      name: 'right',
      p0x: frame.trx,
      p0y: frame.try_,
      dx: frame.vx,
      dy: frame.vy,
      minT: activeRanges?.right?.[0] ?? 0,
      maxT: activeRanges?.right?.[1] ?? h,
      outNx: frame.ux,
      outNy: frame.uy,
    });
  }

  const fcx = frame.tlx + (w / 2) * frame.ux + (h / 2) * frame.vx;
  const fcy = frame.tly + (w / 2) * frame.uy + (h / 2) * frame.vy;
  const isTilted = Math.abs(frame.uy) > 1e-4;

  let bestScore = Infinity;
  let bestMatch: PolygonAtriumFaceMatch | null = null;

  for (const face of polyFaces) {
    for (const e of edges) {
      const dotN = e.outNx * face.nx + e.outNy * face.ny;
      if (dotN > -0.88) continue;

      const centerDist = (fcx - face.x0) * face.nx + (fcy - face.y0) * face.ny;
      if (centerDist <= 0.05) continue;

      const midT = (e.minT + e.maxT) * 0.5;
      const emx = e.p0x + midT * e.dx;
      const emy = e.p0y + midT * e.dy;
      const signedGap = (emx - face.x0) * face.nx + (emy - face.y0) * face.ny;
      const isExactCardinal = face.isCardinal && !isTilted && !atrium.angle;

      if (isExactCardinal) {
        if (Math.abs(signedGap) > EDGE_EPS * 1.5) continue;
      } else {
        if (signedGap < -0.72 || signedGap > 0.95) continue;
      }

      const t0 = (face.x0 - e.p0x) * e.dx + (face.y0 - e.p0y) * e.dy;
      const t1 = (face.x1 - e.p0x) * e.dx + (face.y1 - e.p0y) * e.dy;
      const u1 = Math.max(e.minT, Math.min(t0, t1));
      const u2 = Math.min(e.maxT, Math.max(t0, t1));
      if (u2 - u1 <= MIN_SHARED_EDGE) continue;

      const p1x = e.p0x + u1 * e.dx;
      const p1y = e.p0y + u1 * e.dy;
      const p2x = e.p0x + u2 * e.dx;
      const p2y = e.p0y + u2 * e.dy;
      const s0 = (p1x - face.x0) * face.tx + (p1y - face.y0) * face.ty;
      const s1 = (p2x - face.x0) * face.tx + (p2y - face.y0) * face.ty;
      const f1 = Math.max(0, Math.min(s0, s1));
      const f2 = Math.min(face.len, Math.max(s0, s1));
      if (f2 - f1 <= MIN_SHARED_EDGE) continue;

      const fmx = (face.x0 + face.x1) * 0.5;
      const fmy = (face.y0 + face.y1) * 0.5;
      const lateralDist = Math.abs((emx - fmx) * face.tx + (emy - fmy) * face.ty);
      const score = Math.abs(signedGap) + (1 + dotN) * 12 + lateralDist * 0.25 - (u2 - u1) * 0.02;
      if (score < bestScore) {
        bestScore = score;
        bestMatch = {
          edge: e.name,
          tileHit: [u1, u2],
          faceIndex: face.index,
          faceHit: [f1, f2],
        };
      }
    }
  }

  return bestMatch;
}

function matchSinglePolygonAtriumFaceForItem(
  tile: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  atrium: { kind?: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
): PolygonAtriumFaceMatch | null {
  const frame = getLocalTileFrame(tile);
  const isTrap =
    tile.kind === 'unit' &&
    (tile.label === 'unit:trapezoid' || tile.label === 'unit:trapezoid-l' || tile.label === 'unit:trapezoid-r');
  if (isTrap) {
    const inset = tile.label === 'unit:trapezoid' ? 0.2 : 0.28;
    const lSlant = tile.label !== 'unit:trapezoid-r';
    const rSlant = tile.label !== 'unit:trapezoid-l';
    return matchSinglePolygonAtriumFace(frame, tile.w, tile.h, atrium, {
      top: [lSlant ? inset * tile.w : 0, rSlant ? (1 - inset) * tile.w : tile.w],
      bottom: [0, tile.w],
      left: lSlant ? null : [0, tile.h],
      right: rSlant ? null : [0, tile.h],
    });
  }
  if (tile.kind === 'unit' && tile.label === 'unit:trapezoid-ring') {
    return matchSinglePolygonAtriumFace(frame, tile.w, tile.h, atrium, {
      top: [0, tile.w],
      bottom: [0.18 * tile.w, 0.82 * tile.w],
      left: null,
      right: null,
    });
  }
  return matchSinglePolygonAtriumFace(frame, tile.w, tile.h, atrium);
}

function clipFrameEdges(
  frame: LocalTileFrame,
  w: number,
  h: number,
  target: { kind?: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
) {
  if (target.kind === 'atrium' && parseLandmarkMeta('atrium', target.label).polygonFaces) {
    const polyMatch = matchSinglePolygonAtriumFace(frame, w, h, target);
    return {
      tHit: polyMatch?.edge === 'top' ? polyMatch.tileHit : null,
      bHit: polyMatch?.edge === 'bottom' ? polyMatch.tileHit : null,
      lHit: polyMatch?.edge === 'left' ? polyMatch.tileHit : null,
      rHit: polyMatch?.edge === 'right' ? polyMatch.tileHit : null,
    };
  }
  return {
    tHit: clipSegmentToRotatedItem(frame.tlx, frame.tly, frame.ux, frame.uy, w, target),
    bHit: clipSegmentToRotatedItem(frame.blx, frame.bly, frame.ux, frame.uy, w, target),
    lHit: clipSegmentToRotatedItem(frame.tlx, frame.tly, frame.vx, frame.vy, h, target),
    rHit: clipSegmentToRotatedItem(frame.trx, frame.try_, frame.vx, frame.vy, h, target),
  };
}

function rotatedVisualBounds(
  frame: LocalTileFrame,
  w: number,
  pad: number,
): { x: number; y: number; w: number; h: number } {
  const brx = frame.blx + w * frame.ux;
  const bry = frame.bly + w * frame.uy;
  const minX = Math.min(frame.tlx, frame.trx, frame.blx, brx) - pad;
  const maxX = Math.max(frame.tlx, frame.trx, frame.blx, brx) + pad;
  const minY = Math.min(frame.tly, frame.try_, frame.bly, bry) - pad;
  const maxY = Math.max(frame.tly, frame.try_, frame.bly, bry) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function computeSharpCorners(
  w: number,
  h: number,
  top: ReadonlyArray<[number, number]>,
  right: ReadonlyArray<[number, number]>,
  bottom: ReadonlyArray<[number, number]>,
  left: ReadonlyArray<[number, number]>,
): SharpCorners {
  return {
    tlSharp: top.some(([a]) => a <= CORNER_EPS) || left.some(([a]) => a <= CORNER_EPS),
    trSharp: top.some(([, b]) => b >= w - CORNER_EPS) || right.some(([a]) => a <= CORNER_EPS),
    blSharp: bottom.some(([a]) => a <= CORNER_EPS) || left.some(([, b]) => b >= h - CORNER_EPS),
    brSharp: bottom.some(([, b]) => b >= w - CORNER_EPS) || right.some(([, b]) => b >= h - CORNER_EPS),
  };
}

function buildEdgeMergeGeometry(
  w: number,
  h: number,
  topTouched: Array<[number, number]>,
  rightTouched: Array<[number, number]>,
  bottomTouched: Array<[number, number]>,
  leftTouched: Array<[number, number]>,
): EdgeMergeGeometry {
  const topMerged = topTouched.length > 0;
  const rightMerged = rightTouched.length > 0;
  const bottomMerged = bottomTouched.length > 0;
  const leftMerged = leftTouched.length > 0;
  const hasMerge = topMerged || rightMerged || bottomMerged || leftMerged;
  return {
    hasMerge,
    topMerged,
    rightMerged,
    bottomMerged,
    leftMerged,
    topSegs: hasMerge ? subtractIntervals(w, topTouched) : [],
    rightSegs: hasMerge ? subtractIntervals(h, rightTouched) : [],
    bottomSegs: hasMerge ? subtractIntervals(w, bottomTouched) : [],
    leftSegs: hasMerge ? subtractIntervals(h, leftTouched) : [],
    ...computeSharpCorners(w, h, topTouched, rightTouched, bottomTouched, leftTouched),
  };
}

interface UnitMergeData extends EdgeMergeGeometry {
  topBridges: Array<[number, number]>;
  rightBridges: Array<[number, number]>;
  bottomBridges: Array<[number, number]>;
  leftBridges: Array<[number, number]>;
  siblingHasMerge: boolean;
  siblingTopMerged: boolean;
  siblingRightMerged: boolean;
  siblingBottomMerged: boolean;
  siblingLeftMerged: boolean;
  /** True on the primary (largest-area) block of each connected group so the shop name renders once per merged shape. */
  showLabel: boolean;
  /** Bounding box (in grid cells) of the connected group so unit photos span continuously across L / T / U wings. */
  groupBounds: { minX: number; minY: number; spanW: number; spanH: number };
}

interface TileFlushEdgeIntervals {
  top: Array<[number, number]>;
  right: Array<[number, number]>;
  bottom: Array<[number, number]>;
  left: Array<[number, number]>;
}

function getUnitFlushEdgeIntervals(
  tile: MapItem,
  allItems: ReadonlyArray<MapItem>,
): TileFlushEdgeIntervals {
  const mode = parseUnitShapeMode(tile);
  if (!isTrapezoidUnitMode(mode)) {
    return {
      top: [[0, tile.w]],
      right: [[0, tile.h]],
      bottom: [[0, tile.w]],
      left: [[0, tile.h]],
    };
  }
  const geo = getTrapezoidUnitGeometry(mode, 100, 100, 20, null, tile, allItems);
  const pts = geo.fillPoints
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [xs, ys] = pair.split(',');
      return { x: Number(xs) / 100, y: Number(ys) / 100 };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (pts.length < 3) {
    return {
      top: [[0, tile.w]],
      right: [[0, tile.h]],
      bottom: [[0, tile.w]],
      left: [[0, tile.h]],
    };
  }

  const top: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  const bottom: Array<[number, number]> = [];
  const left: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a.y <= 0.006 && b.y <= 0.006) {
      const u1 = Math.min(a.x, b.x) * tile.w;
      const u2 = Math.max(a.x, b.x) * tile.w;
      if (u2 - u1 > 0.02) top.push([u1, u2]);
    }
    if (a.x >= 0.994 && b.x >= 0.994) {
      const v1 = Math.min(a.y, b.y) * tile.h;
      const v2 = Math.max(a.y, b.y) * tile.h;
      if (v2 - v1 > 0.02) right.push([v1, v2]);
    }
    if (a.y >= 0.994 && b.y >= 0.994) {
      const u1 = Math.min(a.x, b.x) * tile.w;
      const u2 = Math.max(a.x, b.x) * tile.w;
      if (u2 - u1 > 0.02) bottom.push([u1, u2]);
    }
    if (a.x <= 0.006 && b.x <= 0.006) {
      const v1 = Math.min(a.y, b.y) * tile.h;
      const v2 = Math.max(a.y, b.y) * tile.h;
      if (v2 - v1 > 0.02) left.push([v1, v2]);
    }
  }
  return { top, right, bottom, left };
}

function intersectEdgeHitWithFlush(
  hit: [number, number] | null,
  ownFlush: ReadonlyArray<[number, number]>,
  otherFlush: ReadonlyArray<[number, number]>,
  ownOrigin: number,
  otherOrigin: number,
): Array<[number, number]> {
  if (!hit) return [];
  const [h1, h2] = hit;
  const out: Array<[number, number]> = [];
  for (const [a1, a2] of ownFlush) {
    const s1 = Math.max(h1, a1);
    const s2 = Math.min(h2, a2);
    if (s2 - s1 <= 0.02) continue;
    for (const [b1, b2] of otherFlush) {
      const o1 = b1 + (otherOrigin - ownOrigin);
      const o2 = b2 + (otherOrigin - ownOrigin);
      const f1 = Math.max(s1, o1);
      const f2 = Math.min(s2, o2);
      if (f2 - f1 > 0.02) {
        out.push([f1, f2]);
      }
    }
  }
  return out;
}

/**
 * Computes auto-merge seams, outer borders, gap bridges, primary label block, and union photo bounds
 * for any unit that consists of 2 or more grid blocks (`L`, `T`, `U`, or stepped shapes).
 */
export function computeUnitMergeMap(items: MapItem[]): Map<string, UnitMergeData> {
  const result = new Map<string, UnitMergeData>();
  const byUnit = new Map<string, MapItem[]>();
  for (const it of items) {
    if (it.kind !== 'unit' || !it.unitId) continue;
    const list = byUnit.get(it.unitId);
    if (list) list.push(it);
    else byUnit.set(it.unitId, [it]);
  }

  for (const group of byUnit.values()) {
    if (group.length < 2) continue;
    const adj = new Map<string, Set<string>>();
    const flushByKey = new Map<string, TileFlushEdgeIntervals>();
    for (const b of group) {
      adj.set(b.key, new Set());
      flushByKey.set(b.key, getUnitFlushEdgeIntervals(b, items));
    }

    const rawByKey = new Map<string, Omit<UnitMergeData, 'showLabel' | 'groupBounds'>>();

    for (const it of group) {
      const topTouched: Array<[number, number]> = [];
      const rightTouched: Array<[number, number]> = [];
      const bottomTouched: Array<[number, number]> = [];
      const leftTouched: Array<[number, number]> = [];
      const topBridges: Array<[number, number]> = [];
      const rightBridges: Array<[number, number]> = [];
      const bottomBridges: Array<[number, number]> = [];
      const leftBridges: Array<[number, number]> = [];
      const frame = getLocalTileFrame(it);
      const itFlush = flushByKey.get(it.key)!;

      for (const o of group) {
        if (o.key === it.key) continue;
        const { tHit, rHit, bHit, lHit } = clipFrameEdges(frame, it.w, it.h, o);
        const oFlush = flushByKey.get(o.key)!;

        const tiltedPair = Boolean(it.angle || o.angle);
        const canonicalOwner = it.key < o.key;
        const tClips = tiltedPair
          ? tHit ? [tHit] : []
          : intersectEdgeHitWithFlush(tHit, itFlush.top, oFlush.bottom, it.x, o.x);
        const bClips = tiltedPair
          ? bHit ? [bHit] : []
          : intersectEdgeHitWithFlush(bHit, itFlush.bottom, oFlush.top, it.x, o.x);
        const lClips = tiltedPair
          ? lHit ? [lHit] : []
          : intersectEdgeHitWithFlush(lHit, itFlush.left, oFlush.right, it.y, o.y);
        const rClips = tiltedPair
          ? rHit ? [rHit] : []
          : intersectEdgeHitWithFlush(rHit, itFlush.right, oFlush.left, it.y, o.y);

        if (tClips.length > 0 || bClips.length > 0 || lClips.length > 0 || rClips.length > 0) {
          adj.get(it.key)!.add(o.key);
          adj.get(o.key)!.add(it.key);
        }

        for (const clip of tClips) {
          topTouched.push(clip);
          if (tiltedPair && canonicalOwner) topBridges.push(clip);
        }
        for (const clip of bClips) {
          bottomTouched.push(clip);
          const ownsBottom = !tiltedPair ? (o.y !== it.y ? o.y > it.y : canonicalOwner) : canonicalOwner;
          if (ownsBottom) bottomBridges.push(clip);
        }
        for (const clip of lClips) {
          leftTouched.push(clip);
          if (tiltedPair && canonicalOwner) leftBridges.push(clip);
        }
        for (const clip of rClips) {
          rightTouched.push(clip);
          const ownsRight = !tiltedPair ? (o.x !== it.x ? o.x > it.x : canonicalOwner) : canonicalOwner;
          if (ownsRight) rightBridges.push(clip);
        }
      }

      const siblingTopMerged = topTouched.length > 0;
      const siblingRightMerged = rightTouched.length > 0;
      const siblingBottomMerged = bottomTouched.length > 0;
      const siblingLeftMerged = leftTouched.length > 0;
      const siblingHasMerge =
        siblingTopMerged || siblingRightMerged || siblingBottomMerged || siblingLeftMerged;

      rawByKey.set(it.key, {
        ...buildEdgeMergeGeometry(it.w, it.h, topTouched, rightTouched, bottomTouched, leftTouched),
        topBridges,
        rightBridges,
        bottomBridges,
        leftBridges,
        siblingHasMerge,
        siblingTopMerged,
        siblingRightMerged,
        siblingBottomMerged,
        siblingLeftMerged,
      });
    }

    const byKey = new Map(group.map((b) => [b.key, b]));
    const visited = new Set<string>();
    for (const seed of group) {
      if (visited.has(seed.key)) continue;
      const comp: MapItem[] = [];
      const queue: string[] = [seed.key];
      visited.add(seed.key);
      while (queue.length > 0) {
        const curKey = queue.shift()!;
        comp.push(byKey.get(curKey)!);
        for (const nb of adj.get(curKey)!) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }

      const primary = [...comp].sort(comparePrimaryTile)[0];
      const minX = Math.min(...comp.map((b) => b.x));
      const minY = Math.min(...comp.map((b) => b.y));
      const maxX = Math.max(...comp.map((b) => b.x + b.w));
      const maxY = Math.max(...comp.map((b) => b.y + b.h));
      const groupBounds = {
        minX,
        minY,
        spanW: Math.max(1, maxX - minX),
        spanH: Math.max(1, maxY - minY),
      };

      for (const b of comp) {
        const raw = rawByKey.get(b.key)!;
        if (comp.length < 2 && !raw.hasMerge) continue;
        result.set(b.key, {
          ...raw,
          showLabel: b.key === primary.key,
          groupBounds,
        });
      }
    }
  }

  return result;
}

function extractSavedPlanBase(planData: any): { spc: number; cols: number; saved: any[] } {
  const rawSaved = Array.isArray(planData?.items) ? planData.items : [];
  const rawCols = Number(planData?.columns) || 0;
  const maxRawRight = rawSaved.reduce(
    (max: number, it: any) => Math.max(max, (Number(it?.x) || 0) + Math.max(1, Number(it?.w) || 1)),
    0,
  );
  const isLegacyCoarseGrid = rawSaved.length > 0 && (rawCols > 0 ? rawCols <= 90 : maxRawRight <= 90);
  const scale = isLegacyCoarseGrid ? 2 : 1;
  const saved =
    scale === 1
      ? rawSaved
      : rawSaved.map((it: any) => ({
          ...it,
          x: Math.round((Number(it?.x) || 0) * scale),
          y: Math.round((Number(it?.y) || 0) * scale),
          w: Math.max(1, Math.round((Number(it?.w) || 1) * scale)),
          h: Math.max(1, Math.round((Number(it?.h) || 1) * scale)),
        }));
  const maxSavedRight = saved.reduce(
    (max: number, it: any) => Math.max(max, (Number(it?.x) || 0) + Math.max(1, Number(it?.w) || 1)),
    0,
  );
  const rawSpc = Number(planData?.sqftPerCell) || 0;
  const spc =
    rawSpc > 0
      ? isLegacyCoarseGrid
        ? Math.max(4, Math.round((rawSpc / (scale * scale)) * 10) / 10)
        : rawSpc
      : DEFAULT_SQFT_PER_CELL;
  return {
    spc,
    cols: Math.max(rawCols * scale || DEFAULT_COLUMNS, DEFAULT_COLUMNS, maxSavedRight),
    saved,
  };
}

function buildDecorMapItem(it: any, seq: number): MapItem {
  return {
    key: `d:${seq}`,
    kind: it.kind,
    unitId: null,
    label: it.label ?? DECORATION_LABELS[it.kind as Exclude<TileKind, 'unit'>] ?? null,
    x: Number(it.x) || 0,
    y: Number(it.y) || 0,
    w: Math.max(1, Number(it.w) || 4),
    h: Math.max(1, Number(it.h) || 3),
    angle: normalizeTileAngle(it.angle),
  };
}

function extractSavedDecorAndUnitEntries(saved: any[]): {
  decorItems: MapItem[];
  decorSeq: number;
  unitEntries: any[];
} {
  const decorItems: MapItem[] = [];
  const unitEntries: any[] = [];
  let d = 1;
  let hasMarker = false;

  for (const it of saved) {
    if (it.kind === 'corridor') continue;
    if (it.kind === 'unit') {
      unitEntries.push(it);
    } else {
      if (it.kind === 'marker') {
        if (hasMarker) continue;
        hasMarker = true;
      }
      decorItems.push(buildDecorMapItem(it, d++));
    }
  }
  return { decorItems, decorSeq: d, unitEntries };
}

function findLargestAreaIndex<T>(
  list: ReadonlyArray<T>,
  getSize: (item: T) => { w: number; h: number },
): number {
  let primaryIdx = 0;
  let bestArea = -1;
  list.forEach((item, idx) => {
    const { w, h } = getSize(item);
    const area = w * h;
    if (area > bestArea) {
      bestArea = area;
      primaryIdx = idx;
    }
  });
  return primaryIdx;
}

export function parseFloorPlanData(
  planData: any,
  shopByUnit: Map<string, any>,
): { sqftPerCell: number; columns: number; decorSeq: number; items: MapItem[] } {
  const { spc, cols, saved } = extractSavedPlanBase(planData);
  const { decorItems, decorSeq, unitEntries } = extractSavedDecorAndUnitEntries(saved);
  const next: MapItem[] = [...decorItems];

  const entriesByUnit = new Map<string, Array<{ raw: any; size: { w: number; h: number } }>>();
  for (const it of unitEntries) {
    if (!it.unitId) continue;
    const shop = shopByUnit.get(it.unitId);
    if (!shop) continue;
    const size = sizeUnitTile({ w: it.w, h: it.h }, shop.unit?.areaSqft, spc, cols);
    const list = entriesByUnit.get(it.unitId) || [];
    list.push({ raw: it, size });
    entriesByUnit.set(it.unitId, list);
  }

  for (const [uId, list] of entriesByUnit.entries()) {
    const primaryIdx = findLargestAreaIndex(list, (entry) => entry.size);
    let wingSeq = 2;
    list.forEach(({ raw, size }, idx) => {
      const key = idx === primaryIdx ? unitKey(uId) : `${unitKey(uId)}:${wingSeq++}`;
      next.push({
        key,
        kind: 'unit',
        unitId: uId,
        label: raw.label ?? null,
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        ...size,
        angle: normalizeTileAngle(raw.angle),
      });
    });
  }

  const resolved = resolveOverlaps(next, cols);
  return {
    sqftPerCell: calibrateSqftPerCell(resolved, shopByUnit, spc),
    columns: cols,
    decorSeq,
    items: resolved,
  };
}

function unitSuffixKey(unitNum: string): string {
  const trimmed = unitNum.trim();
  const dashIdx = trimmed.lastIndexOf('-');
  if (dashIdx !== -1 && dashIdx < trimmed.length - 1) {
    return trimmed.slice(dashIdx + 1).toLowerCase();
  }
  const digits = trimmed.match(/\d+$/)?.[0];
  if (digits && digits.length >= 2) {
    return digits.slice(-2);
  }
  return trimmed.toLowerCase();
}

/**
 * Copies landmarks, walkways, and (optionally) unit slot positions from a source floor plan
 * onto the current floor, matching current floor units to source unit slots (preserving multi-block shapes).
 */
export function buildCopiedFloorLayout(
  sourcePlanData: any,
  targetFloorShops: any[],
  allShopByUnit: Map<string, any>,
  includeUnits = true,
): { sqftPerCell: number; columns: number; decorSeq: number; items: MapItem[]; matchedUnits: number } {
  const { spc, cols, saved } = extractSavedPlanBase(sourcePlanData);
  const { decorItems, decorSeq, unitEntries } = extractSavedDecorAndUnitEntries(saved);
  const next: MapItem[] = [...decorItems];

  const slotGroupsMap = new Map<
    string,
    {
      blocks: Array<{ x: number; y: number; w: number; h: number; angle?: number; label?: string | null }>;
      suffix: string;
      orderKey: string;
    }
  >();
  unitEntries.forEach((it, idx) => {
    const groupKey = it.unitId ? `u:${it.unitId}` : `anon:${idx}`;
    const srcShop = it.unitId ? allShopByUnit.get(it.unitId) : null;
    const srcNum = unitNumberOf(srcShop);
    const block = {
      x: Number(it.x) || 0,
      y: Number(it.y) || 0,
      w: Math.max(1, Number(it.w) || 5),
      h: Math.max(1, Number(it.h) || 3),
      angle: normalizeTileAngle(it.angle),
      label: it.label ?? null,
    };
    const existing = slotGroupsMap.get(groupKey);
    if (existing) {
      existing.blocks.push(block);
    } else {
      slotGroupsMap.set(groupKey, {
        blocks: [block],
        suffix: srcNum ? unitSuffixKey(srcNum) : '',
        orderKey: srcNum || `${String(block.y).padStart(4, '0')}:${String(block.x).padStart(4, '0')}`,
      });
    }
  });
  const sourceUnitSlots = Array.from(slotGroupsMap.values());

  let matchedUnits = 0;
  if (includeUnits && targetFloorShops.length > 0) {
    const sortedTargetShops = [...targetFloorShops].sort(compareShopsByUnitNumber);
    const sortedSlots = [...sourceUnitSlots].sort((a, b) =>
      a.orderKey.localeCompare(b.orderKey, undefined, { numeric: true }),
    );
    const usedSlotIndices = new Set<number>();
    const placedTargetUnitIds = new Set<string>();

    const assignUnitToSlot = (
      shop: any,
      sl: { blocks: Array<{ x: number; y: number; w: number; h: number; angle?: number; label?: string | null }> },
    ) => {
      placedTargetUnitIds.add(shop.unitId);
      const primaryIdx = findLargestAreaIndex(sl.blocks, (b) => b);
      sl.blocks.forEach((b, idx) => {
        const key = idx === primaryIdx ? unitKey(shop.unitId) : nextUnitBlockKey(next, shop.unitId);
        next.push({
          key,
          kind: 'unit',
          unitId: shop.unitId,
          label: b.label ?? null,
          x: b.x,
          y: b.y,
          w: Math.min(cols, b.w),
          h: b.h,
          angle: b.angle,
        });
      });
      matchedUnits++;
    };

    // Pass 1: Match by unit number suffix (e.g., 101 -> 201, G-05 -> L2-05)
    sortedTargetShops.forEach((shop) => {
      const sfx = unitSuffixKey(unitNumberOf(shop));
      if (!sfx) return;
      const slotIdx = sortedSlots.findIndex((sl, idx) => !usedSlotIndices.has(idx) && sl.suffix && sl.suffix === sfx);
      if (slotIdx !== -1) {
        usedSlotIndices.add(slotIdx);
        assignUnitToSlot(shop, sortedSlots[slotIdx]);
      }
    });

    // Pass 2: Match remaining shops in reading/unit-number order to remaining source slots
    const remainingSlots = sortedSlots.filter((_, idx) => !usedSlotIndices.has(idx));
    let slotCursor = 0;
    sortedTargetShops.forEach((shop) => {
      if (!placedTargetUnitIds.has(shop.unitId) && slotCursor < remainingSlots.length) {
        assignUnitToSlot(shop, remainingSlots[slotCursor++]);
      }
    });
  }

  const resolved = resolveOverlaps(next, cols);
  return {
    sqftPerCell: calibrateSqftPerCell(resolved, allShopByUnit, spc),
    columns: cols,
    decorSeq,
    items: resolved,
    matchedUnits,
  };
}

export {
  getCachedDirectory,
  getCachedFloorPlan,
  saveCachedDirectory,
  saveCachedFloorPlan,
} from './shopMapRouting';

/* ── Edit Mode Multi-Select / Group Helpers ── */

function tilesTouchOrOverlapForGroup(a: MapItem, b: MapItem): boolean {
  if (a.key === b.key) return false;
  // Direct overlap or enclosure (e.g. Lift/Escalator inside Atrium)
  if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
    return true;
  }
  // Cardinal border touch (gap === 0 with positive shared edge span)
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const touchH = (Math.abs(a.x + a.w - b.x) <= 0.5 || Math.abs(b.x + b.w - a.x) <= 0.5) && overlapY > 0;
  const touchV = (Math.abs(a.y + a.h - b.y) <= 0.5 || Math.abs(b.y + b.h - a.y) <= 0.5) && overlapX > 0;
  if (touchH || touchV) return true;

  // Polygon or Circle Atrium slanted/curved face alignment touch
  if (a.kind === 'atrium' || b.kind === 'atrium') {
    const atrium = a.kind === 'atrium' ? a : b;
    const other = a.kind === 'atrium' ? b : a;
    const touchesAtrium =
      matchSinglePolygonAtriumFaceForItem(other, atrium) !== null ||
      Boolean(isCircleRingCorridor(atrium) && findNearestCircleCorridorForUnit(other, [atrium])?.isNear);
    if (touchesAtrium) {
      return true;
    }
  }

  // Same-angle rotated neighbor edge touch
  const aAng = (((a.angle ?? 0) % 360) + 360) % 360;
  const bAng = (((b.angle ?? 0) % 360) + 360) % 360;
  if (aAng !== 0 && aAng === bAng) {
    const rad = (aAng * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = -uy;
    const vy = ux;
    const dx = b.x + b.w * 0.5 - (a.x + a.w * 0.5);
    const dy = b.y + b.h * 0.5 - (a.y + a.h * 0.5);
    const du = Math.abs(dx * ux + dy * uy);
    const dv = Math.abs(dx * vx + dy * vy);
    const halfU = (a.w + b.w) * 0.5;
    const halfV = (a.h + b.h) * 0.5;
    if (
      (Math.abs(du - halfU) <= 0.72 && dv <= halfV - 0.25) ||
      (Math.abs(dv - halfV) <= 0.72 && du <= halfU - 0.25)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Expands the active group selection by adding all tiles that directly touch or sit inside
 * any currently selected tile (1-hop expansion per click).
 */
export function expandTouchingGroupKeys(
  items: ReadonlyArray<MapItem>,
  seedKeys: ReadonlySet<string>,
): string[] {
  const result = new Set<string>(seedKeys);
  const seeds = items.filter((i) => seedKeys.has(i.key));
  for (const s of seeds) {
    for (const cand of items) {
      if (result.has(cand.key)) continue;
      if (tilesTouchOrOverlapForGroup(s, cand)) {
        result.add(cand.key);
      }
    }
  }
  return Array.from(result);
}

export function computeGroupBoundingBox(
  items: ReadonlyArray<MapItem>,
  groupKeys: ReadonlySet<string>,
  overrideAngle?: number,
): { x: number; y: number; w: number; h: number; angle: number; count: number } | null {
  const groupItems = items.filter((it) => groupKeys.has(it.key));
  const count = groupItems.length;
  if (count === 0) return null;

  let frameAngle = 0;
  if (overrideAngle !== undefined && Number.isFinite(overrideAngle) && overrideAngle !== 0) {
    frameAngle = ((Math.round(overrideAngle) % 360) + 360) % 360;
  } else {
    const firstAngle = (((groupItems[0].angle ?? 0) % 360) + 360) % 360;
    const allSameAngle = groupItems.every(
      (it) => ((((it.angle ?? 0) % 360) + 360) % 360) === firstAngle,
    );
    if (allSameAngle && firstAngle !== 0) {
      frameAngle = firstAngle;
    }
  }

  if (frameAngle === 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of groupItems) {
      if (it.angle) {
        const rb = rotatedVisualBounds(getLocalTileFrame(it), it.w, 0);
        minX = Math.min(minX, it.x, rb.x);
        minY = Math.min(minY, it.y, rb.y);
        maxX = Math.max(maxX, it.x + it.w, rb.x + rb.w);
        maxY = Math.max(maxY, it.y + it.h, rb.y + rb.h);
      } else {
        minX = Math.min(minX, it.x);
        minY = Math.min(minY, it.y);
        maxX = Math.max(maxX, it.x + it.w);
        maxY = Math.max(maxY, it.y + it.h);
      }
    }
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, angle: 0, count };
  }

  const rad = (frameAngle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const it of groupItems) {
    for (const c of getTileWorldCorners(it)) {
      const pu = c.x * ux + c.y * uy;
      const pv = c.x * vx + c.y * vy;
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv;
      if (pv > maxV) maxV = pv;
    }
  }

  const w = Math.max(1, maxU - minU);
  const h = Math.max(1, maxV - minV);
  const centerU = (minU + maxU) * 0.5;
  const centerV = (minV + maxV) * 0.5;
  const worldCx = centerU * ux + centerV * vx;
  const worldCy = centerU * uy + centerV * vy;

  return {
    x: worldCx - w * 0.5,
    y: worldCy - h * 0.5,
    w,
    h,
    angle: frameAngle,
    count,
  };
}

/**
 * Moves all tiles in `groupKeys` together by `(dx, dy)` while clamping to floor boundaries
 * and verifying zero conflict with unselected tiles.
 */
export function moveTileGroupByDelta(
  items: ReadonlyArray<MapItem>,
  groupKeys: ReadonlySet<string>,
  dx: number,
  dy: number,
  columns: number,
): { moved: boolean; conflict: boolean; clampedDx: number; clampedDy: number; items: MapItem[] } {
  const groupItems = items.filter((i) => groupKeys.has(i.key));
  if (groupItems.length === 0) {
    return { moved: false, conflict: false, clampedDx: 0, clampedDy: 0, items: items.map((i) => ({ ...i })) };
  }
  const minDx = -Math.min(...groupItems.map((i) => i.x));
  const maxDx = Math.min(...groupItems.map((i) => columns - (i.x + i.w)));
  const minDy = -Math.min(...groupItems.map((i) => i.y));
  const clampedDx = Math.max(minDx, Math.min(maxDx, Math.round(dx)));
  const clampedDy = Math.max(minDy, Math.round(dy));

  if (clampedDx === 0 && clampedDy === 0) {
    return { moved: false, conflict: false, clampedDx: 0, clampedDy: 0, items: items.map((i) => ({ ...i })) };
  }

  const candidateItems = items.map((it) =>
    groupKeys.has(it.key)
      ? { ...it, x: it.x + clampedDx, y: it.y + clampedDy }
      : { ...it },
  );

  const movedGroup = candidateItems.filter((i) => groupKeys.has(i.key));
  const staticOthers = candidateItems.filter((i) => !groupKeys.has(i.key));

  for (const g of movedGroup) {
    for (const o of staticOthers) {
      if (tilesConflict(g, o)) {
        return {
          moved: false,
          conflict: true,
          clampedDx: 0,
          clampedDy: 0,
          items: items.map((i) => ({ ...i })),
        };
      }
    }
  }

  return {
    moved: true,
    conflict: false,
    clampedDx,
    clampedDy,
    items: candidateItems,
  };
}

/**
 * Orbits and rotates all tiles in `groupKeys` together around the group's center pivot `(groupCx, groupCy)`
 * by `deltaDeg` degrees (snapped to `TILE_ANGLE_STEP = 12°` or cardinal `90°`), clamping to floor boundaries and resolving
 * any integer-rounding overlap inside the group or with adjacent unselected tiles.
 */
export function rotateTileGroup(
  baseItems: ReadonlyArray<MapItem>,
  groupKeys: ReadonlySet<string>,
  deltaDeg: number,
  columns: number,
): { rotated: boolean; conflict: boolean; items: MapItem[] } {
  const groupItems = baseItems.filter((i) => groupKeys.has(i.key));
  if (groupItems.length === 0) {
    return { rotated: false, conflict: false, items: baseItems.map((i) => ({ ...i })) };
  }

  const normDelta = ((Math.round(deltaDeg) % 360) + 360) % 360;
  if (normDelta === 0) {
    return { rotated: false, conflict: false, items: baseItems.map((i) => ({ ...i })) };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of groupItems) {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w);
    maxY = Math.max(maxY, it.y + it.h);
  }
  const groupCx = (minX + maxX) * 0.5;
  const groupCy = (minY + maxY) * 0.5;
  const rad = (normDelta * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const rotatedGroup: MapItem[] = groupItems.map((it) => {
    const cx = it.x + it.w * 0.5;
    const cy = it.y + it.h * 0.5;
    const dx = cx - groupCx;
    const dy = cy - groupCy;
    const rotCx = groupCx + dx * cosA - dy * sinA;
    const rotCy = groupCy + dx * sinA + dy * cosA;
    const nextAngle = normalizeTileAngle((it.angle ?? 0) + normDelta);
    const swapAxes =
      it.w !== it.h && !it.angle && (normDelta === 90 || normDelta === 270);
    const newW = swapAxes ? Math.min(columns, it.h) : Math.min(columns, it.w);
    const newH = swapAxes ? it.w : it.h;
    const newAngle = swapAxes ? undefined : nextAngle;
    return {
      ...it,
      x: Math.round(rotCx - newW * 0.5),
      y: Math.round(rotCy - newH * 0.5),
      w: newW,
      h: newH,
      angle: newAngle,
    };
  });

  // Clamp the rotated group as a rigid block within [0, columns] and y >= 0
  const gMinX = Math.min(...rotatedGroup.map((g) => g.x));
  const gMaxX = Math.max(...rotatedGroup.map((g) => g.x + g.w));
  const gMinY = Math.min(...rotatedGroup.map((g) => g.y));
  const shiftX = gMinX < 0 ? -gMinX : gMaxX > columns ? columns - gMaxX : 0;
  const shiftY = gMinY < 0 ? -gMinY : 0;
  for (const g of rotatedGroup) {
    g.x = Math.max(0, Math.min(columns - g.w, g.x + shiftX));
    g.y = Math.max(0, g.y + shiftY);
  }

  // Resolve any internal integer-rounding collision inside the rotated group by nudging outward from group center
  for (let pass = 0; pass < 3; pass++) {
    let fixedAny = false;
    for (let i = 0; i < rotatedGroup.length; i++) {
      for (let j = i + 1; j < rotatedGroup.length; j++) {
        const a = rotatedGroup[i];
        const b = rotatedGroup[j];
        if (!tilesConflict(a, b)) continue;
        const acx = a.x + a.w * 0.5;
        const acy = a.y + a.h * 0.5;
        const bcx = b.x + b.w * 0.5;
        const bcy = b.y + b.h * 0.5;
        const distA = Math.hypot(acx - groupCx, acy - groupCy);
        const distB = Math.hypot(bcx - groupCx, bcy - groupCy);
        const mover = distB >= distA ? b : a;
        const anchor = mover === b ? a : b;
        const vx = mover.x + mover.w * 0.5 - (anchor.x + anchor.w * 0.5);
        const vy = mover.y + mover.h * 0.5 - (anchor.y + anchor.h * 0.5);
        const stepX = Math.abs(vx) >= Math.abs(vy) * 0.5 ? (vx >= 0 ? 1 : -1) : 0;
        const stepY = Math.abs(vy) >= Math.abs(vx) * 0.5 ? (vy >= 0 ? 1 : -1) : 0;
        const nx = Math.max(0, Math.min(columns - mover.w, mover.x + (stepX || 1)));
        const ny = Math.max(0, mover.y + (stepY || 1));
        if (nx !== mover.x || ny !== mover.y) {
          mover.x = nx;
          mover.y = ny;
          fixedAny = true;
        }
      }
    }
    if (!fixedAny) break;
  }

  const staticOthers = baseItems.filter((i) => !groupKeys.has(i.key));
  const minOffsetX = -Math.min(...rotatedGroup.map((g) => g.x));
  const maxOffsetX = Math.min(...rotatedGroup.map((g) => columns - (g.x + g.w)));
  const minOffsetY = -Math.min(...rotatedGroup.map((g) => g.y));

  const offsets: Array<[number, number]> = [];
  for (let oy = Math.max(-3, minOffsetY); oy <= 3; oy++) {
    for (let ox = Math.max(-3, minOffsetX); ox <= Math.min(3, maxOffsetX); ox++) {
      offsets.push([ox, oy]);
    }
  }
  offsets.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));

  for (const [ox, oy] of offsets) {
    const shifted = rotatedGroup.map((g) => ({ ...g, x: g.x + ox, y: g.y + oy }));
    const conflictsWithOutside = shifted.some((g) => staticOthers.some((o) => tilesConflict(g, o)));
    if (!conflictsWithOutside) {
      const byKey = new Map(shifted.map((g) => [g.key, g]));
      return {
        rotated: true,
        conflict: false,
        items: baseItems.map((it) => byKey.get(it.key) ?? { ...it }),
      };
    }
  }

  return {
    rotated: false,
    conflict: true,
    items: baseItems.map((i) => ({ ...i })),
  };
}

export type GroupResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Resizes/scales all tiles in `groupKeys` proportionally when dragging one of the 8 resize handles
 * (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`) on the group bounding box.
 */
export function resizeTileGroup(
  baseItems: ReadonlyArray<MapItem>,
  groupKeys: ReadonlySet<string>,
  handle: GroupResizeHandle,
  deltaU: number,
  deltaV: number,
  frameAngle: number,
  columns: number,
): { resized: boolean; conflict: boolean; items: MapItem[] } {
  const groupItems = baseItems.filter((i) => groupKeys.has(i.key));
  if (groupItems.length === 0) {
    return { resized: false, conflict: false, items: baseItems.map((i) => ({ ...i })) };
  }

  const baseBox = computeGroupBoundingBox(baseItems, groupKeys, frameAngle);
  if (!baseBox || baseBox.w <= 0 || baseBox.h <= 0) {
    return { resized: false, conflict: false, items: baseItems.map((i) => ({ ...i })) };
  }

  const ang = baseBox.angle;
  const baseW = Math.max(1, baseBox.w);
  const baseH = Math.max(1, baseBox.h);
  const baseCx = baseBox.x + baseW * 0.5;
  const baseCy = baseBox.y + baseH * 0.5;
  const rad = (ang * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -uy;
  const vy = ux;

  const minGroupW = Math.max(2, Math.round(baseW * 0.25));
  const minGroupH = Math.max(2, Math.round(baseH * 0.25));

  let minU = -baseW * 0.5;
  let maxU = baseW * 0.5;
  let minV = -baseH * 0.5;
  let maxV = baseH * 0.5;

  if (handle.includes('w')) {
    minU = Math.min(maxU - minGroupW, minU + deltaU);
  }
  if (handle.includes('e')) {
    maxU = Math.max(minU + minGroupW, maxU + deltaU);
  }
  if (handle.includes('n')) {
    minV = Math.min(maxV - minGroupH, minV + deltaV);
  }
  if (handle.includes('s')) {
    maxV = Math.max(minV + minGroupH, maxV + deltaV);
  }

  const targetW = maxU - minU;
  const targetH = maxV - minV;
  if (Math.abs(targetW - baseW) < 0.2 && Math.abs(targetH - baseH) < 0.2) {
    return { resized: false, conflict: false, items: baseItems.map((i) => ({ ...i })) };
  }

  const targetMinX = baseCx + minU;
  const targetMinY = baseCy + minV;
  const scaleU = targetW / baseW;
  const scaleV = targetH / baseH;

  const resizedGroup: MapItem[] = groupItems.map((it) => {
    if (ang === 0 && !it.angle) {
      const relX0 = (it.x - baseBox.x) / baseW;
      const relX1 = (it.x + it.w - baseBox.x) / baseW;
      const relY0 = (it.y - baseBox.y) / baseH;
      const relY1 = (it.y + it.h - baseBox.y) / baseH;
      const nx0 = Math.max(0, Math.round(targetMinX + relX0 * targetW));
      const nx1 = Math.min(columns, Math.max(nx0 + 1, Math.round(targetMinX + relX1 * targetW)));
      const ny0 = Math.max(0, Math.round(targetMinY + relY0 * targetH));
      const ny1 = Math.max(ny0 + 1, Math.round(targetMinY + relY1 * targetH));
      const nw = Math.max(1, Math.min(columns - nx0, nx1 - nx0));
      const nh = Math.max(1, ny1 - ny0);
      return { ...it, x: nx0, y: ny0, w: nw, h: nh };
    }

    const cx = it.x + it.w * 0.5;
    const cy = it.y + it.h * 0.5;
    const lu = (cx - baseCx) * ux + (cy - baseCy) * uy;
    const lv = (cx - baseCx) * vx + (cy - baseCy) * vy;
    const uRel = (lu + baseW * 0.5) / baseW;
    const vRel = (lv + baseH * 0.5) / baseH;
    const newLu = minU + uRel * targetW;
    const newLv = minV + vRel * targetH;
    const newCx = baseCx + newLu * ux + newLv * vx;
    const newCy = baseCy + newLu * uy + newLv * vy;

    const diffRad = (((it.angle ?? 0) - ang) * Math.PI) / 180;
    const cosD = Math.abs(Math.cos(diffRad));
    const sinD = Math.abs(Math.sin(diffRad));
    const wScale = cosD * scaleU + sinD * scaleV;
    const hScale = sinD * scaleU + cosD * scaleV;
    const nw = Math.max(1, Math.min(columns, Math.round(it.w * wScale)));
    const nh = Math.max(1, Math.round(it.h * hScale));
    const nx = Math.max(0, Math.min(columns - nw, Math.round(newCx - nw * 0.5)));
    const ny = Math.max(0, Math.round(newCy - nh * 0.5));
    return { ...it, x: nx, y: ny, w: nw, h: nh };
  });

  const groupCenterNextX = baseCx + (minU + maxU) * 0.5 * ux + (minV + maxV) * 0.5 * vx;
  const groupCenterNextY = baseCy + (minU + maxU) * 0.5 * uy + (minV + maxV) * 0.5 * vy;

  for (let pass = 0; pass < 3; pass++) {
    let fixedAny = false;
    for (let i = 0; i < resizedGroup.length; i++) {
      for (let j = i + 1; j < resizedGroup.length; j++) {
        const a = resizedGroup[i];
        const b = resizedGroup[j];
        if (!tilesConflict(a, b)) continue;
        const acx = a.x + a.w * 0.5;
        const acy = a.y + a.h * 0.5;
        const bcx = b.x + b.w * 0.5;
        const bcy = b.y + b.h * 0.5;
        const distA = Math.hypot(acx - groupCenterNextX, acy - groupCenterNextY);
        const distB = Math.hypot(bcx - groupCenterNextX, bcy - groupCenterNextY);
        const mover = distB >= distA ? b : a;
        const anchor = mover === b ? a : b;
        const dx = mover.x + mover.w * 0.5 - (anchor.x + anchor.w * 0.5);
        const dy = mover.y + mover.h * 0.5 - (anchor.y + anchor.h * 0.5);
        const stepX = Math.abs(dx) >= Math.abs(dy) * 0.5 ? (dx >= 0 ? 1 : -1) : 0;
        const stepY = Math.abs(dy) >= Math.abs(dx) * 0.5 ? (dy >= 0 ? 1 : -1) : 0;
        const nx = Math.max(0, Math.min(columns - mover.w, mover.x + (stepX || 1)));
        const ny = Math.max(0, mover.y + (stepY || 1));
        if (nx !== mover.x || ny !== mover.y) {
          mover.x = nx;
          mover.y = ny;
          fixedAny = true;
        }
      }
    }
    if (!fixedAny) break;
  }

  const staticOthers = baseItems.filter((i) => !groupKeys.has(i.key));
  const conflictsWithOutside = resizedGroup.some((g) => staticOthers.some((o) => tilesConflict(g, o)));
  if (conflictsWithOutside) {
    return {
      resized: false,
      conflict: true,
      items: baseItems.map((i) => ({ ...i })),
    };
  }

  const byKey = new Map(resizedGroup.map((g) => [g.key, g]));
  let anyChanged = false;
  const nextItems = baseItems.map((it) => {
    const g = byKey.get(it.key);
    if (!g) return { ...it };
    if (g.x !== it.x || g.y !== it.y || g.w !== it.w || g.h !== it.h) {
      anyChanged = true;
    }
    return g;
  });

  return {
    resized: anyChanged,
    conflict: false,
    items: nextItems,
  };
}

type UnitStatusSource =
  | { unit?: { status?: string | null; leases?: Array<{ endDate?: string | number | Date | null }> | null } | null }
  | null
  | undefined;

/** CSS status class of a unit tile, derived from its unit status / lease end date. */
export function statusClass(shop: UnitStatusSource): string {
  const u = shop?.unit;
  const status = String(u?.status || '').toUpperCase();
  const end = u?.leases?.[0]?.endDate;
  if (status === 'OCCUPIED' && end) {
    const days = (new Date(end).getTime() - Date.now()) / 86400000;
    if (days <= 90) return 'st-expiring';
  }
  if (status === 'OCCUPIED') return 'st-occupied';
  if (status === 'RESERVED') return 'st-reserved';
  if (status === 'MAINTENANCE') return 'st-maintenance';
  if (status === 'NOT_FOR_RENT') return 'st-notrent';
  return 'st-vacant';
}
