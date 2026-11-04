// Pure helpers for the Shop Directory "Map" view (grid layout, sqft-based tile sizing).
// Kept free of React so the logic is easy to reason about and test.

export type TileKind =
  | 'unit'
  | 'atrium'
  | 'stairs'
  | 'escalator'
  | 'corridor'
  | 'toilet'
  | 'marker'
  | 'entrance'
  | 'exit'
  | 'info'
  | 'parking'
  | 'atm'
  | 'medical';

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
  /** Visual tilt in degrees (1-degree steps). 0/undefined = upright. */
  angle?: number;
}

/** Normalizes any value to 1-degree integer steps 1..359 (returns undefined for 0 / upright). */
export function normalizeTileAngle(val: unknown): number | undefined {
  const raw = Number(val);
  if (!Number.isFinite(raw)) return undefined;
  const n = Math.round(raw);
  const a = ((n % 360) + 360) % 360;
  return a === 0 ? undefined : a;
}

export type UnitShapeMode =
  | 'rect'
  | 'circle'
  | 'ring-curve'
  | 'trapezoid-ring'
  | 'slope-b-l'
  | 'slope-b-r'
  | 'slope-t-l'
  | 'slope-t-r'
  | 'chamfer-tr'
  | 'chamfer-tl'
  | 'chamfer-br'
  | 'chamfer-bl'
  | 'curve-bl'
  | 'curve-br'
  | 'curve-tl'
  | 'curve-tr'
  | 'notch-tl'
  | 'notch-tr'
  | 'notch-bl'
  | 'notch-br'
  | 'trapezoid'
  | 'trapezoid-l'
  | 'trapezoid-r';

export const UNIT_SHAPE_LABELS: Record<UnitShapeMode, string> = {
  rect: 'Rectangle (Standard)',
  circle: 'Circle / Oval',
  'ring-curve': 'Fan / Ring Sector',
  'trapezoid-ring': 'Curved Arch',
  'slope-b-l': 'Slant Bottom (Up-Left)',
  'slope-b-r': 'Slant Bottom (Up-Right)',
  'slope-t-l': 'Slant Top (Down-Left)',
  'slope-t-r': 'Slant Top (Down-Right)',
  'chamfer-tr': 'Cut Corner (Top-Right)',
  'chamfer-tl': 'Cut Corner (Top-Left)',
  'chamfer-br': 'Cut Corner (Bottom-Right)',
  'chamfer-bl': 'Cut Corner (Bottom-Left)',
  'curve-bl': 'Curved Corner (Bottom-Left)',
  'curve-br': 'Curved Corner (Bottom-Right)',
  'curve-tl': 'Curved Corner (Top-Left)',
  'curve-tr': 'Curved Corner (Top-Right)',
  'notch-tl': 'Concave Cutout (Top-Left)',
  'notch-tr': 'Concave Cutout (Top-Right)',
  'notch-bl': 'Concave Cutout (Bottom-Left)',
  'notch-br': 'Concave Cutout (Bottom-Right)',
  trapezoid: 'Trapezoid (Symmetric)',
  'trapezoid-l': 'Trapezoid (Left Slant)',
  'trapezoid-r': 'Trapezoid (Right Slant)',
};

interface UnitShapeOptionDef {
  id: UnitShapeMode;
  label: string;
  group: string;
}

export const UNIT_SHAPE_OPTIONS: ReadonlyArray<UnitShapeOptionDef> = [
  // 1. Basic & Ring / Fan
  { id: 'rect', label: 'Rectangle (Standard)', group: 'Basic & Ring / Fan Shapes' },
  { id: 'circle', label: 'Circle / Oval', group: 'Basic & Ring / Fan Shapes' },
  { id: 'ring-curve', label: 'Fan / Ring Sector', group: 'Basic & Ring / Fan Shapes' },
  { id: 'trapezoid-ring', label: 'Curved Arch', group: 'Basic & Ring / Fan Shapes' },

  // 2. Slanted Top / Bottom Edge (Vertical Left & Right Side Walls — Side-by-Side Flush)
  { id: 'slope-b-l', label: 'Slant Bottom (Up-Left)', group: 'Slanted Edge (Vertical Side Walls)' },
  { id: 'slope-b-r', label: 'Slant Bottom (Up-Right)', group: 'Slanted Edge (Vertical Side Walls)' },
  { id: 'slope-t-l', label: 'Slant Top (Down-Left)', group: 'Slanted Edge (Vertical Side Walls)' },
  { id: 'slope-t-r', label: 'Slant Top (Down-Right)', group: 'Slanted Edge (Vertical Side Walls)' },

  // 3. 45° Cut Corner (Chamfer)
  { id: 'chamfer-tr', label: 'Cut Corner (Top-Right)', group: '45° Cut Corner (Chamfer)' },
  { id: 'chamfer-tl', label: 'Cut Corner (Top-Left)', group: '45° Cut Corner (Chamfer)' },
  { id: 'chamfer-br', label: 'Cut Corner (Bottom-Right)', group: '45° Cut Corner (Chamfer)' },
  { id: 'chamfer-bl', label: 'Cut Corner (Bottom-Left)', group: '45° Cut Corner (Chamfer)' },

  // 4. Curved Outer Corner
  { id: 'curve-bl', label: 'Curved Corner (Bottom-Left)', group: 'Curved Outer Corner' },
  { id: 'curve-br', label: 'Curved Corner (Bottom-Right)', group: 'Curved Outer Corner' },
  { id: 'curve-tl', label: 'Curved Corner (Top-Left)', group: 'Curved Outer Corner' },
  { id: 'curve-tr', label: 'Curved Corner (Top-Right)', group: 'Curved Outer Corner' },

  // 5. Concave Circular Cutout (Notch)
  { id: 'notch-tl', label: 'Concave Cutout (Top-Left)', group: 'Concave Circular Cutout (Notch)' },
  { id: 'notch-tr', label: 'Concave Cutout (Top-Right)', group: 'Concave Circular Cutout (Notch)' },
  { id: 'notch-bl', label: 'Concave Cutout (Bottom-Left)', group: 'Concave Circular Cutout (Notch)' },
  { id: 'notch-br', label: 'Concave Cutout (Bottom-Right)', group: 'Concave Circular Cutout (Notch)' },

  // 6. Tapered-Side Trapezoids
  { id: 'trapezoid', label: 'Trapezoid (Symmetric)', group: 'Tapered-Side Trapezoids' },
  { id: 'trapezoid-l', label: 'Trapezoid (Left Slant)', group: 'Tapered-Side Trapezoids' },
  { id: 'trapezoid-r', label: 'Trapezoid (Right Slant)', group: 'Tapered-Side Trapezoids' },
];

const VALID_UNIT_SHAPE_MODES = new Set<UnitShapeMode>(UNIT_SHAPE_OPTIONS.map((o) => o.id));

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
  if (c.kind === 'atrium') {
    return c.w >= 3 && c.h >= 3 && parseLandmarkMeta('atrium', c.label).isCircle;
  }
  if (c.kind !== 'corridor') return false;
  if (c.label === 'walkway:straight') return false;
  if (c.label === 'walkway:circle') return c.w >= 2 && c.h >= 2;
  if (c.w < 4 || c.h < 4) return false;
  const aspect = Math.max(c.w, c.h) / Math.max(1, Math.min(c.w, c.h));
  return aspect <= 1.65;
}

function computeCircleRingRadii(
  r: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }>,
  minOuter = 1.5,
  minInner = 0.8,
) {
  const rxOut = Math.max(minOuter, r.w * 0.5);
  const ryOut = Math.max(minOuter, r.h * 0.5);
  const minDim = Math.min(r.w, r.h);
  const laneX = minDim <= 2 ? r.w * 0.5 : r.w >= 8 ? Math.max(2, r.w * 0.25) : Math.min(r.w * 0.36, 1.65);
  const laneY = minDim <= 2 ? r.h * 0.5 : r.h >= 8 ? Math.max(2, r.h * 0.25) : Math.min(r.h * 0.36, 1.65);
  let rxIn = Math.max(minInner, rxOut - laneX);
  let ryIn = Math.max(minInner, ryOut - laneY);
  const innerHoleItems = allItems.filter(
    (o) => (r.key && o.key ? o.key !== r.key : o !== r) && isInsideCircleCorridorHole(r, o),
  );
  if (innerHoleItems.length > 0) {
    let reqRx = 0;
    let reqRy = 0;
    for (const inner of innerHoleItems) {
      reqRx = Math.max(reqRx, inner.w * 0.5);
      reqRy = Math.max(reqRy, inner.h * 0.5);
    }
    rxIn = Math.min(Math.max(0.5, rxOut - 1), reqRx);
    ryIn = Math.min(Math.max(0.5, ryOut - 1), reqRy);
  }
  return { rxOut, ryOut, rxIn, ryIn, innerHoleItems };
}

interface CircleCorridorUnitMatch {
  ring: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number };
  cx: number;
  cy: number;
  rxOut: number;
  ryOut: number;
  rxIn: number;
  ryIn: number;
  insideHole: boolean;
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
  it: { x: number; y: number; w: number; h: number; angle?: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }>,
): CircleCorridorUnitMatch | null {
  const rings = allItems.filter(isCircleRingCorridor);
  if (rings.length === 0) return null;
  const ux = it.x + it.w * 0.5;
  const uy = it.y + it.h * 0.5;
  let best: CircleCorridorUnitMatch | null = null;
  let bestScore = Infinity;

  for (const r of rings) {
    const rcx = r.x + r.w * 0.5;
    const rcy = r.y + r.h * 0.5;
    const { rxOut, ryOut, rxIn, ryIn, innerHoleItems } = computeCircleRingRadii(r, allItems, 1.5, 0.8);
    const hasInnerAtrium = innerHoleItems.some((o) => o.kind === 'atrium');
    const insideHole = !hasInnerAtrium && isInsideCircleCorridorHole(r, { ...it, kind: 'unit' });
    const gapX = Math.max(0, it.x - (r.x + r.w), r.x - (it.x + it.w));
    const gapY = Math.max(0, it.y - (r.y + r.h), r.y - (it.y + it.h));
    const boxGap = Math.hypot(gapX, gapY);
    const closestPt = getClosestPointOnTileToPoint(it, rcx, rcy);
    const normClosest = Math.hypot((closestPt.x - rcx) / rxOut, (closestPt.y - rcy) / ryOut);
    const avgR = (rxOut + ryOut) * 0.5;
    const radialDist = Math.abs(normClosest - 1) * avgR;
    const normCenter = Math.hypot((ux - rcx) / rxOut, (uy - rcy) / ryOut);
    const score = insideHole ? Math.abs(normCenter) * 0.1 : boxGap + radialDist * 0.6;
    const isNear =
      insideHole ||
      (boxGap <= 6.0 && normCenter >= 0.40 && normClosest >= 0.18 && (normClosest - 1) * avgR <= 5.5);
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
        insideHole,
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

function parseRingCurveLabelMeta(
  label?: string | null,
): { mode: 'rim' | 'outer' | 'free'; radialOffset?: number } | null {
  if (!label) return null;
  if (label === 'unit:ring-curve') return { mode: 'rim', radialOffset: 0 };
  if (label === 'unit:ring-curve:free') return { mode: 'free' };
  if (label.startsWith('unit:ring-curve:r=')) {
    const val = Number(label.slice('unit:ring-curve:r='.length));
    if (Number.isFinite(val) && val >= 0) {
      return { mode: val <= 0.1 ? 'rim' : 'outer', radialOffset: val <= 0.1 ? 0 : val };
    }
  }
  return null;
}

function computeUnitNaturalRadialOffset(
  u: { x: number; y: number; w: number; h: number },
  match: { cx: number; cy: number; rxOut: number; ryOut: number },
): number {
  const ucx = u.x + u.w * 0.5;
  const ucy = u.y + u.h * 0.5;
  const thetaRaw = Math.atan2((ucy - match.cy) / match.ryOut, (ucx - match.cx) / match.rxOut);
  const parSpan = Math.max(u.w, u.h);
  const perpDepth = Math.max(2, Math.min(2.6, Math.min(u.w, u.h)));
  const rRim = Math.hypot(match.rxOut * Math.cos(thetaRaw), match.ryOut * Math.sin(thetaRaw)) || match.rxOut;
  const rCenter = Math.hypot(ucx - match.cx, ucy - match.cy);
  const dTheta0 = Math.max(
    (18 * Math.PI) / 180,
    Math.min((95 * Math.PI) / 180, parSpan / Math.max(2, rRim + perpDepth * 0.5)),
  );
  const cHalf = Math.max(0.7, 0.5 + 0.5 * Math.cos(dTheta0 * 0.5));
  return Math.max(0, (rCenter - 0.5 * perpDepth) / cHalf - rRim);
}

function resolveUnitCircleRadialOffset(
  u: { label?: string | null; x: number; y: number; w: number; h: number },
  match: { cx: number; cy: number; rxOut: number; ryOut: number },
): number {
  const naturalOffset = computeUnitNaturalRadialOffset(u, match);
  const meta = parseRingCurveLabelMeta(u.label);
  if (meta?.mode === 'rim' && naturalOffset <= 1.35) {
    return 0;
  }
  if (meta?.mode === 'outer' && meta.radialOffset !== undefined && Math.abs(meta.radialOffset - naturalOffset) <= 1.5) {
    return meta.radialOffset;
  }
  return naturalOffset;
}

interface CircleRingUnitSector {
  ring: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number };
  cx: number;
  cy: number;
  rxOut: number;
  ryOut: number;
  thetaStart: number;
  thetaEnd: number;
  thetaStartOut: number;
  thetaEndOut: number;
  thetaMid: number;
  radialDepth: number;
  facingEdge: 'top' | 'right' | 'bottom' | 'left';
  exactAngleDeg: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  midU: number;
  midV: number;
  worldCx: number;
  worldCy: number;
  wCells: number;
  hCells: number;
}

function isUnitEligibleForCircleRingSector(
  u: { key?: string; label?: string | null; unitId?: string | null; x: number; y: number; w: number; h: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; unitId?: string | null; x: number; y: number; w: number; h: number }>,
): boolean {
  if (u.label && u.label.startsWith('unit:') && !isRingCurveUnitLabel(u.label)) {
    return false;
  }
  const hasAdjacentSameUnit =
    Boolean(u.unitId) &&
    allItems.some(
      (o) =>
        o !== u &&
        (o.key ? o.key !== u.key : true) &&
        o.kind === 'unit' &&
        o.unitId === u.unitId &&
        Math.max(0, u.x - (o.x + o.w), o.x - (u.x + u.w)) <= 0.05 &&
        Math.max(0, u.y - (o.y + o.h), o.y - (u.y + u.h)) <= 0.05,
    );
  return !hasAdjacentSameUnit;
}

function computeCircleRingUnitSector(
  it: { key?: string; kind?: TileKind | string; label?: string | null; unitId?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; unitId?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
): CircleRingUnitSector | null {
  const baseIt = (it.key ? allItems.find((o) => o.key === it.key) : null) ?? it;
  if (!isUnitEligibleForCircleRingSector(baseIt, allItems)) return null;

  const match = findNearestCircleCorridorForUnit(baseIt, allItems);
  if (!match || !match.isNear || match.insideHole) return null;

  const ucx = baseIt.x + baseIt.w * 0.5;
  const ucy = baseIt.y + baseIt.h * 0.5;
  const raw = Math.atan2((ucy - match.cy) / match.ryOut, (ucx - match.cx) / match.rxOut);
  const thetaRaw = ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const parSpan = Math.max(baseIt.w, baseIt.h);
  const perpDepth = Math.max(2, Math.min(2.6, Math.min(baseIt.w, baseIt.h)));
  const radialOffset = resolveUnitCircleRadialOffset(baseIt, match);
  const rxInSector = match.rxOut + radialOffset;
  const ryInSector = match.ryOut + radialOffset;
  const rInAtTheta = Math.hypot(rxInSector * Math.cos(thetaRaw), ryInSector * Math.sin(thetaRaw)) || rxInSector;
  const rMid = rInAtTheta + perpDepth * 0.5;
  const deltaThetaNat = Math.max(
    (18 * Math.PI) / 180,
    Math.min((95 * Math.PI) / 180, parSpan / Math.max(2, rMid)),
  );

  let thetaStart = thetaRaw - deltaThetaNat * 0.5;
  let thetaEnd = thetaRaw + deltaThetaNat * 0.5;

  const meta = parseRingCurveLabelMeta(baseIt.label);
  const isFreeUnsnapped = meta?.mode === 'free' || !baseIt.label;

  // Snap shared radial boundary with immediately adjacent ring-curve units in the same concentric band (<= 18° gap) for 0px seam
  let bestStartGap: number | null = null;
  let bestStartDist = Infinity;
  let bestEndGap: number | null = null;
  let bestEndDist = Infinity;

  if (!isFreeUnsnapped) {
    for (const o of allItems) {
      if (o.kind !== 'unit' || o.key === baseIt.key) continue;
      if (baseIt.unitId && o.unitId === baseIt.unitId) continue;
      const oShape = parseUnitShapeMode(o);
      if (oShape && oShape !== 'ring-curve' && oShape !== 'trapezoid-ring') continue;
      const om = findNearestCircleCorridorForUnit(o, [match.ring]);
      if (!om || !om.isNear || om.insideHole) continue;

      const oRadialOffset = resolveUnitCircleRadialOffset(o, om);
      if (Math.abs(oRadialOffset - radialOffset) > 1.15) continue;

      const ocx = o.x + o.w * 0.5;
      const ocy = o.y + o.h * 0.5;
      const oRaw = Math.atan2((ocy - match.cy) / match.ryOut, (ocx - match.cx) / match.rxOut);
      const oTheta = ((oRaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const oPar = Math.max(o.w, o.h);
      const oPerp = Math.max(2, Math.min(2.6, Math.min(o.w, o.h)));
      const oRxIn = match.rxOut + oRadialOffset;
      const oRyIn = match.ryOut + oRadialOffset;
      const oRIn = Math.hypot(oRxIn * Math.cos(oTheta), oRyIn * Math.sin(oTheta)) || oRxIn;
      const oDelta = Math.max(
        (18 * Math.PI) / 180,
        Math.min((95 * Math.PI) / 180, oPar / Math.max(2, oRIn + oPerp * 0.5)),
      );
      const oStart = oTheta - oDelta * 0.5;
      const oEnd = oTheta + oDelta * 0.5;

      const ccwDist = (((thetaRaw - oTheta) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (ccwDist > 0.02 && ccwDist < Math.PI && ccwDist < bestStartDist) {
        const gap = Math.atan2(Math.sin(thetaStart - oEnd), Math.cos(thetaStart - oEnd));
        if (Math.abs(gap) <= (18 * Math.PI) / 180) {
          bestStartDist = ccwDist;
          bestStartGap = gap;
        }
      }

      const cwDist = (((oTheta - thetaRaw) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (cwDist > 0.02 && cwDist < Math.PI && cwDist < bestEndDist) {
        const gap = Math.atan2(Math.sin(oStart - thetaEnd), Math.cos(oStart - thetaEnd));
        if (Math.abs(gap) <= (18 * Math.PI) / 180) {
          bestEndDist = cwDist;
          bestEndGap = gap;
        }
      }
    }
  }

  if (bestStartGap !== null) {
    thetaStart -= 0.5 * bestStartGap;
  }
  if (bestEndGap !== null) {
    thetaEnd += 0.5 * bestEndGap;
  }

  const thetaMid = 0.5 * (thetaStart + thetaEnd);
  const radialDepth = perpDepth;
  const thetaStartOut = thetaStart;
  const thetaEndOut = thetaEnd;

  const gnx = Math.cos(thetaMid) / rxInSector;
  const gny = Math.sin(thetaMid) / ryInSector;
  const gLen = Math.hypot(gnx, gny) || 1;
  const nx = gnx / gLen;
  const ny = gny / gLen;

  const degBottom = (((Math.atan2(nx, -ny) * 180) / Math.PI) % 360 + 360) % 360;
  const degTop = (((Math.atan2(-nx, ny) * 180) / Math.PI) % 360 + 360) % 360;
  const bottomUpright = degBottom <= 96 || degBottom >= 264;
  const topUpright = degTop <= 96 || degTop >= 264;
  const facingEdge: 'bottom' | 'top' =
    bottomUpright && !topUpright
      ? 'bottom'
      : topUpright && !bottomUpright
        ? 'top'
        : angularDiffDeg(degBottom, baseIt.angle ?? 0) <= angularDiffDeg(degTop, baseIt.angle ?? 0)
          ? 'bottom'
          : 'top';
  const exactAngleDeg = Math.round((facingEdge === 'bottom' ? degBottom : degTop) * 100) / 100;

  const rad = (exactAngleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const vx = -Math.sin(rad);
  const vy = Math.cos(rad);

  const rxOutSector = rxInSector + radialDepth;
  const ryOutSector = ryInSector + radialDepth;
  const N = 24;
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (let k = 0; k <= N; k++) {
    const thIn = thetaStart + (k / N) * (thetaEnd - thetaStart);
    const thOut = thetaStartOut + (k / N) * (thetaEndOut - thetaStartOut);
    const ix = rxInSector * Math.cos(thIn);
    const iy = ryInSector * Math.sin(thIn);
    const ox = rxOutSector * Math.cos(thOut);
    const oy = ryOutSector * Math.sin(thOut);
    const uIn = ix * ux + iy * uy;
    const vIn = ix * vx + iy * vy;
    const uOut = ox * ux + oy * uy;
    const vOut = ox * vx + oy * vy;
    if (uIn < uMin) uMin = uIn;
    if (uIn > uMax) uMax = uIn;
    if (vIn < vMin) vMin = vIn;
    if (vIn > vMax) vMax = vIn;
    if (uOut < uMin) uMin = uOut;
    if (uOut > uMax) uMax = uOut;
    if (vOut < vMin) vMin = vOut;
    if (vOut > vMax) vMax = vOut;
  }

  const padCells = 0.08;
  const wCells = Math.max(0.5, uMax - uMin + padCells);
  const hCells = Math.max(0.5, vMax - vMin + padCells);
  const midU = 0.5 * (uMin + uMax);
  const midV = 0.5 * (vMin + vMax);
  const worldCx = isFreeUnsnapped ? ucx : match.cx + midU * ux + midV * vx;
  const worldCy = isFreeUnsnapped ? ucy : match.cy + midU * uy + midV * vy;

  return {
    ring: match.ring,
    cx: match.cx,
    cy: match.cy,
    rxOut: rxInSector,
    ryOut: ryInSector,
    thetaStart,
    thetaEnd,
    thetaStartOut,
    thetaEndOut,
    thetaMid,
    radialDepth,
    facingEdge,
    exactAngleDeg,
    uMin,
    uMax,
    vMin,
    vMax,
    midU,
    midV,
    worldCx,
    worldCy,
    wCells,
    hCells,
  };
}

export function parseUnitShapeMode(
  it: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems?: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
  isMergedUnit?: boolean,
): UnitShapeMode {
  if (typeof it.label === 'string' && it.label.startsWith('unit:')) {
    const rawMode = it.label.slice(5).split(':')[0] as UnitShapeMode;
    if (VALID_UNIT_SHAPE_MODES.has(rawMode)) {
      return rawMode;
    }
  }
  if (allItems) {
    const match = findNearestCircleCorridorForUnit(it, allItems);
    if (match && match.isNear) {
      if (match.insideHole && !isMergedUnit) {
        const centered =
          Math.abs(it.x + it.w * 0.5 - match.cx) <= 0.85 &&
          Math.abs(it.y + it.h * 0.5 - match.cy) <= 0.85;
        if (centered) return 'circle';
      }
      return 'ring-curve';
    }
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
  const list = isMergedUnit
    ? UNIT_SHAPE_OPTIONS.filter((o) => o.id !== 'circle')
    : UNIT_SHAPE_OPTIONS;
  const idx = list.findIndex((o) => o.id === mode);
  if (idx === -1) return 'rect';
  return list[(idx + 1) % list.length].id;
}

export function isTrapezoidUnitMode(
  mode: UnitShapeMode | null | undefined,
): mode is Exclude<UnitShapeMode, 'rect' | 'circle'> {
  return Boolean(mode && mode !== 'rect' && mode !== 'circle' && VALID_UNIT_SHAPE_MODES.has(mode));
}

function buildPolygonUnitGeometryFromNormPoints(
  normPts: ReadonlyArray<{ x: number; y: number }>,
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

  // ── 4. Concave Circular Cutout (Notch) ──
  if (mode === 'notch-tl' || mode === 'notch-tr' || mode === 'notch-bl' || mode === 'notch-br') {
    const rPx = Math.min(wPx, hPx) * 0.46;
    const rx = Math.max(0.22, Math.min(0.54, rPx / Math.max(1, wPx)));
    const ry = Math.max(0.22, Math.min(0.54, rPx / Math.max(1, hPx)));
    const K = 14;
    const pts: Array<{ x: number; y: number }> = [];

    if (mode === 'notch-tl') {
      for (let k = 0; k <= K; k++) {
        const th = (Math.PI * 0.5) * (1 - k / K);
        pts.push({ x: rx * Math.cos(th), y: ry * Math.sin(th) });
      }
      pts.push({ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 });
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        Math.round(wPx * 0.05),
        Math.round(hPx * 0.05),
      );
    }
    if (mode === 'notch-tr') {
      pts.push({ x: 0, y: 0 });
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * (Math.PI * 0.5);
        pts.push({ x: 1 - rx * Math.cos(th), y: ry * Math.sin(th) });
      }
      pts.push({ x: 1, y: 1 }, { x: 0, y: 1 });
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.05),
        Math.round(hPx * 0.05),
      );
    }
    if (mode === 'notch-br') {
      pts.push({ x: 0, y: 0 }, { x: 1, y: 0 });
      for (let k = 0; k <= K; k++) {
        const th = (Math.PI * 0.5) * (1 - k / K);
        pts.push({ x: 1 - rx * Math.cos(th), y: 1 - ry * Math.sin(th) });
      }
      pts.push({ x: 0, y: 1 });
      return buildPolygonUnitGeometryFromNormPoints(
        pts,
        wPx,
        hPx,
        cellPx,
        merge,
        -Math.round(wPx * 0.05),
        -Math.round(hPx * 0.05),
      );
    }
    // notch-bl
    pts.push({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 });
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
      Math.round(wPx * 0.05),
      -Math.round(hPx * 0.05),
    );
  }

  if (mode === 'ring-curve' || mode === 'trapezoid-ring') {
    const it = tile ?? { x: 0, y: 0, w: Math.max(1, Math.round(wPx / Math.max(1, cellPx))), h: Math.max(1, Math.round(hPx / Math.max(1, cellPx))) };
    const isSiblingMerged = Boolean(sTop || sRight || sBottom || sLeft);
    const sector = mode === 'ring-curve' && !isSiblingMerged && allItems ? computeCircleRingUnitSector(it, allItems) : null;

    if (sector) {
      const rad = (sector.exactAngleDeg * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const vx = -Math.sin(rad);
      const vy = Math.cos(rad);
      const rxInSector = sector.rxOut;
      const ryInSector = sector.ryOut;
      const rxOutSector = sector.rxOut + sector.radialDepth;
      const ryOutSector = sector.ryOut + sector.radialDepth;
      const N = 24;

      const worldRelToNorm = (rx: number, ry: number) => {
        const u = rx * ux + ry * uy;
        const v = rx * vx + ry * vy;
        const xNorm = Math.max(0, Math.min(1, 0.5 + ((u - sector.midU) * cellPx) / Math.max(1, wPx)));
        const yNorm = Math.max(0, Math.min(1, 0.5 + ((v - sector.midV) * cellPx) / Math.max(1, hPx)));
        return { x: xNorm, y: yNorm };
      };

      const outerCurvePts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= N; k++) {
        const th = sector.thetaStartOut + (k / N) * (sector.thetaEndOut - sector.thetaStartOut);
        outerCurvePts.push(worldRelToNorm(rxOutSector * Math.cos(th), ryOutSector * Math.sin(th)));
      }
      const innerCurvePts: Array<{ x: number; y: number }> = [];
      for (let k = N; k >= 0; k--) {
        const th = sector.thetaStart + (k / N) * (sector.thetaEnd - sector.thetaStart);
        innerCurvePts.push(worldRelToNorm(rxInSector * Math.cos(th), ryInSector * Math.sin(th)));
      }

      const normPts = [...outerCurvePts, ...innerCurvePts];
      const polyPath = (pts: Array<{ x: number; y: number }>) =>
        pts
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${(p.x * wPx).toFixed(1)} ${(p.y * hPx).toFixed(1)}`)
          .join(' ');

      const startWall = [innerCurvePts[innerCurvePts.length - 1], outerCurvePts[0]];
      const endWall = [outerCurvePts[outerCurvePts.length - 1], innerCurvePts[0]];
      const rimParts = [polyPath(outerCurvePts), polyPath(startWall)];
      const lipRightParts = [polyPath(endWall)];
      const lipBottomParts = [polyPath(innerCurvePts)];

      const midR = 0.5 * (rxInSector + rxOutSector);
      const midRY = 0.5 * (ryInSector + ryOutSector);
      const labelRelX = midR * Math.cos(sector.thetaMid);
      const labelRelY = midRY * Math.sin(sector.thetaMid);
      const labelU = labelRelX * ux + labelRelY * uy;
      const labelV = labelRelX * vx + labelRelY * vy;
      const labelOffsetXPx = Math.round((labelU - sector.midU) * cellPx * 10) / 10;
      const labelOffsetYPx = Math.round((labelV - sector.midV) * cellPx * 10) / 10;

      const clipPath = `polygon(${normPts.map((p) => `${(p.x * 100).toFixed(2)}% ${(p.y * 100).toFixed(2)}%`).join(', ')})`;
      const fillPoints = normPts.map((p) => `${(p.x * wPx).toFixed(1)},${(p.y * hPx).toFixed(1)}`).join(' ');

      return {
        clipPath,
        fillPoints,
        rimPath: rimParts.join(' '),
        lipRightPath: lipRightParts.join(' '),
        lipBottomPath: lipBottomParts.join(' '),
        facingEdge: sector.facingEdge,
        labelOffsetXPx,
        labelOffsetYPx,
      };
    }

    const angleDeg = (it as { angle?: number }).angle ?? 0;
    const match = allItems ? findNearestCircleCorridorForUnit(it, allItems) : null;

    // Standalone Fan / Pie-Slice Sector when `mode === 'ring-curve'` and not near a Circle Ring Walkway
    if (mode === 'ring-curve' && (!match || !match.isNear) && !isSiblingMerged) {
      const archDrop = 0.18;
      const inTaper = 0.18;
      const innerArchRise = 0.16;
      const N = 20;
      const outerPts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const u = 2 * t - 1;
        outerPts.push({ x: t, y: archDrop * u * u });
      }
      const innerPts: Array<{ x: number; y: number }> = [];
      for (let k = N; k >= 0; k--) {
        const t = k / N;
        const u = 2 * t - 1;
        innerPts.push({
          x: inTaper + t * (1 - 2 * inTaper),
          y: 1 - innerArchRise * (1 - u * u),
        });
      }
      return buildPolygonUnitGeometryFromNormPoints(
        [...outerPts, ...innerPts],
        wPx,
        hPx,
        cellPx,
        merge,
        0,
        -Math.round(hPx * 0.04),
        'bottom',
      );
    }

    const ux = it.x + it.w * 0.5;
    const uy = it.y + it.h * 0.5;

    const cx = match && match.isNear ? match.cx : ux;
    const cy = match && match.isNear ? match.cy : it.y + it.h + Math.max(3, it.w * 0.75);
    const rxOut = match && match.isNear ? match.rxOut : Math.max(4, it.w * 0.85);
    const ryOut = match && match.isNear ? match.ryOut : rxOut;
    const rxIn = match && match.isNear ? match.rxIn : Math.max(2, rxOut - 1.65);
    const ryIn = match && match.isNear ? match.ryIn : Math.max(2, ryOut - 1.65);
    const insideHole = match && match.isNear ? match.insideHole : false;

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
    if (Math.abs(ndy) >= Math.abs(ndx)) {
      facingEdge = dy >= 0 ? 'bottom' : 'top';
      if (facingEdge === 'bottom' && sBottom && !sTop) facingEdge = 'top';
      else if (facingEdge === 'top' && sTop && !sBottom) facingEdge = 'bottom';
    } else {
      facingEdge = dx >= 0 ? 'right' : 'left';
      if (facingEdge === 'right' && sRight && !sLeft) facingEdge = 'left';
      else if (facingEdge === 'left' && sLeft && !sRight) facingEdge = 'right';
    }

    const taper = mode === 'trapezoid-ring' ? 0.18 : 0;
    const N = 18;
    const targetRx = insideHole ? rxIn : rxOut;
    const targetRy = insideHole ? ryIn : ryOut;
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
      return (insideHole ? 1 - a : a) * maxDepthFrac;
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

export const LANDMARK_VARIANTS: Record<Exclude<TileKind, 'unit' | 'corridor'>, ReadonlyArray<LandmarkVariantDef>> = {
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
  kind: Exclude<TileKind, 'unit' | 'corridor'> | string,
  label?: string | null,
): LandmarkMeta {
  const safeKind = (kind in LANDMARK_VARIANTS ? kind : 'atrium') as Exclude<TileKind, 'unit' | 'corridor'>;
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
  kind: Exclude<TileKind, 'unit' | 'corridor'>,
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
  kind: Exclude<TileKind, 'unit' | 'corridor'>,
  currentVariant: string,
): string {
  const defs = LANDMARK_VARIANTS[kind] || [];
  if (defs.length <= 1) return defs[0]?.id ?? 'default';
  const idx = defs.findIndex((d) => d.id === currentVariant);
  return defs[(idx + 1) % defs.length].id;
}

function isCircleTile(
  it: { kind: TileKind | string; label?: string | null; x?: number; y?: number; w?: number; h?: number },
  allItems?: ReadonlyArray<{ kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }>,
  isMergedUnit?: boolean,
): boolean {
  if (it.kind !== 'unit' && it.kind !== 'corridor') {
    return parseLandmarkMeta(it.kind, it.label).isCircle;
  }
  if (it.kind === 'unit') {
    if (isMergedUnit) return false;
    if (it.label === 'unit:circle') return true;
    if (it.label?.startsWith('unit:')) return false;
    if (
      allItems &&
      typeof it.x === 'number' &&
      typeof it.y === 'number' &&
      typeof it.w === 'number' &&
      typeof it.h === 'number'
    ) {
      return parseUnitShapeMode(it as any, allItems, isMergedUnit) === 'circle';
    }
  }
  return false;
}

/**
 * Returns true when `inner` sits strictly inside the hollow center hole of a circular ring walkway `outer`
 * (`w >= 4, h >= 4` and not forced to `straight`). Matches server `saveFloorPlan` overlap validation.
 */
function isInsideCircleCorridorHole(
  outer: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number },
  inner: { kind?: TileKind | string; x: number; y: number; w: number; h: number },
): boolean {
  if (outer.kind !== 'corridor') return false;
  if (outer.label === 'walkway:straight') return false;
  if (outer.w < 4 || outer.h < 4) return false;
  if (
    inner.x < outer.x + 1 ||
    inner.x + inner.w > outer.x + outer.w - 1 ||
    inner.y < outer.y + 1 ||
    inner.y + inner.h > outer.y + outer.h - 1
  ) {
    return false;
  }
  if (inner.kind === 'unit') {
    const rcx = outer.x + outer.w * 0.5;
    const rcy = outer.y + outer.h * 0.5;
    const rxOut = Math.max(2, outer.w * 0.5);
    const ryOut = Math.max(2, outer.h * 0.5);
    const icx = inner.x + inner.w * 0.5;
    const icy = inner.y + inner.h * 0.5;
    const normCenter = Math.hypot((icx - rcx) / rxOut, (icy - rcy) / ryOut);
    if (normCenter > 0.42) return false;
  }
  return true;
}

/**
 * Returns true when a non-corridor tile `other` overlaps the rectangular bounding box of a circular ring walkway `ring`
 * only in the empty outer corner/shoulder region outside the inscribed circular/elliptical walkway lane, or is a unit
 * tile visually auto-snapped to the outer rim (`rxOut`).
 */
function isOutsideCircleCorridorOuter(
  a: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  b: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
): boolean {
  const check = (
    ring: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
    other: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  ): boolean => {
    if (!isCircleRingCorridor(ring) || other.kind === 'corridor') return false;
    if (isInsideCircleCorridorHole(ring, other)) return false;
    const rcx = ring.x + ring.w * 0.5;
    const rcy = ring.y + ring.h * 0.5;
    const rxOut = Math.max(2, ring.w * 0.5);
    const ryOut = Math.max(2, ring.h * 0.5);
    const ocx = other.x + other.w * 0.5;
    const ocy = other.y + other.h * 0.5;
    const centerNorm = Math.hypot((ocx - rcx) / rxOut, (ocy - rcy) / ryOut);
    if (centerNorm < (other.kind === 'unit' ? 0.40 : 0.92)) return false;
    const closestPt = getClosestPointOnTileToPoint(other, rcx, rcy);
    const closestNorm = Math.hypot((closestPt.x - rcx) / rxOut, (closestPt.y - rcy) / ryOut);
    return closestNorm >= (other.angle || other.kind === 'unit' ? 0.18 : 0.82);
  };
  return check(a, b) || check(b, a);
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
  corridor: 'Walkway',
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
  atrium: { w: 6, h: 6 },
  stairs: { w: 4, h: 3 },
  escalator: { w: 4, h: 3 },
  corridor: { w: 14, h: 2 },
  toilet: { w: 4, h: 3 },
  marker: { w: 3, h: 3 },
  entrance: { w: 4, h: 2 },
  exit: { w: 4, h: 2 },
  info: { w: 4, h: 3 },
  parking: { w: 4, h: 3 },
  atm: { w: 3, h: 2 },
  medical: { w: 4, h: 3 },
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

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function isTransitLandmark(kind: TileKind | string): boolean {
  return kind === 'stairs' || kind === 'escalator';
}

function isAtriumTransitOverlap(
  a: { kind: TileKind | string },
  b: { kind: TileKind | string },
): boolean {
  return (
    (a.kind === 'atrium' && isTransitLandmark(b.kind)) ||
    (b.kind === 'atrium' && isTransitLandmark(a.kind))
  );
}

function isOutsidePolygonAtrium(
  a: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  b: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
): boolean {
  const check = (
    atr: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
    other: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  ): boolean => {
    if (atr.kind !== 'atrium' || !other.angle) return false;
    const polyFaces = getPolygonAtriumWorldFaces(atr);
    if (!polyFaces) return false;
    const f = getLocalTileFrame(other);
    const corners = getTileWorldCorners(other, f);
    for (const face of polyFaces) {
      let minProj = Infinity;
      for (const c of corners) {
        const p = (c.x - face.x0) * face.nx + (c.y - face.y0) * face.ny;
        if (p < minProj) minProj = p;
      }
      const centerDist = (other.x + other.w * 0.5 - face.x0) * face.nx + (other.y + other.h * 0.5 - face.y0) * face.ny;
      const alignedDiagonal =
        Boolean(other.angle) &&
        centerDist >= 0.15 &&
        (Math.abs(f.ux * face.nx + f.uy * face.ny) <= 0.26 ||
          Math.abs(f.vx * face.nx + f.vy * face.ny) <= 0.26);
      const tol = alignedDiagonal ? 0.72 : EDGE_EPS;
      if (minProj >= -tol) return true;
    }
    return false;
  };
  return check(a, b) || check(b, a);
}

function getCustomUnitPolygonVerticesAndAxes(
  t: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  f: { ux: number; uy: number; vx: number; vy: number },
): { corners: Array<{ x: number; y: number }>; extraAxes: Array<{ x: number; y: number }> } | null {
  if (t.kind !== 'unit') return null;
  const mode = parseUnitShapeMode(t);
  if (!mode || mode === 'rect' || mode === 'ring-curve' || mode === 'trapezoid-ring' || mode === 'circle') {
    return null;
  }
  let uv: Array<[number, number]> | null = null;
  switch (mode) {
    case 'slope-b-l':
      uv = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.22]];
      break;
    case 'slope-b-r':
      uv = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.22], [-0.5, 0.5]];
      break;
    case 'slope-t-l':
      uv = [[-0.5, -0.22], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      break;
    case 'slope-t-r':
      uv = [[-0.5, -0.5], [0.5, -0.22], [0.5, 0.5], [-0.5, 0.5]];
      break;
    case 'chamfer-tr':
    case 'curve-tr':
    case 'notch-tr':
      uv = [[-0.5, -0.5], [0.18, -0.5], [0.5, -0.18], [0.5, 0.5], [-0.5, 0.5]];
      break;
    case 'chamfer-tl':
    case 'curve-tl':
    case 'notch-tl':
      uv = [[-0.18, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.18]];
      break;
    case 'chamfer-br':
    case 'curve-br':
    case 'notch-br':
      uv = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.18], [0.18, 0.5], [-0.5, 0.5]];
      break;
    case 'chamfer-bl':
    case 'curve-bl':
    case 'notch-bl':
      uv = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.18, 0.5], [-0.5, 0.18]];
      break;
    case 'trapezoid':
      uv = [[-0.36, -0.5], [0.36, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      break;
    case 'trapezoid-l':
      uv = [[-0.28, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      break;
    case 'trapezoid-r':
      uv = [[-0.5, -0.5], [0.28, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      break;
    default:
      return null;
  }
  const cx = t.x + t.w * 0.5;
  const cy = t.y + t.h * 0.5;
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

function areRotatedRectsSeparated(
  a: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  b: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
): boolean {
  const angleA = a.angle ?? 0;
  const angleB = b.angle ?? 0;
  const isRingCurvePair =
    a.kind === 'unit' &&
    b.kind === 'unit' &&
    (isRingCurveUnitLabel(a.label) ||
      isRingCurveUnitLabel(b.label) ||
      a.label === 'unit:trapezoid-ring' ||
      b.label === 'unit:trapezoid-ring');
  const fa = getLocalTileFrame(a);
  const fb = getLocalTileFrame(b);
  const polyA = getCustomUnitPolygonVerticesAndAxes(a, fa);
  const polyB = getCustomUnitPolygonVerticesAndAxes(b, fb);
  if (angleA === 0 && angleB === 0 && !isRingCurvePair && !polyA && !polyB) return false;
  if (
    (a.kind === 'corridor' && parseCorridorShapeMode(a.label) === 'circle') ||
    (b.kind === 'corridor' && parseCorridorShapeMode(b.label) === 'circle')
  ) {
    return false;
  }
  const cornersA = polyA ? polyA.corners : getTileWorldCorners(a, fa);
  const cornersB = polyB ? polyB.corners : getTileWorldCorners(b, fb);
  const axes = [
    { x: fa.ux, y: fa.uy },
    { x: fa.vx, y: fa.vy },
    { x: fb.ux, y: fb.uy },
    { x: fb.vx, y: fb.vy },
    ...(polyA ? polyA.extraAxes : []),
    ...(polyB ? polyB.extraAxes : []),
  ];
  const centerDist = Math.hypot(
    a.x + a.w * 0.5 - (b.x + b.w * 0.5),
    a.y + a.h * 0.5 - (b.y + b.h * 0.5),
  );
  const minSpan = Math.min(a.w, a.h, b.w, b.h);
  const isShapedUnitCorridorPair =
    (Boolean(polyA) && b.kind === 'corridor' && angleB !== 0) ||
    (Boolean(polyB) && a.kind === 'corridor' && angleA !== 0);
  const angDiff90 = Math.abs((((angleA - angleB) % 90) + 90) % 90);
  const isAlignedRotatedPair =
    angleA !== 0 &&
    angleB !== 0 &&
    (angDiff90 <= 15 || angDiff90 >= 75) &&
    centerDist >= Math.max(1.2, minSpan * 0.72);
  const sepTol = isShapedUnitCorridorPair
    ? 0.95
    : isRingCurvePair && centerDist >= Math.max(1.2, minSpan * 0.62)
      ? 1.65
      : 0.12;
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
    const effTol = isAlignedRotatedPair
      ? Math.max(sepTol, Math.min(0.76, 0.54 * (Math.abs(ax.x) + Math.abs(ax.y))))
      : sepTol;
    if (maxA <= minB + effTol || maxB <= minA + effTol) return true;
  }
  return false;
}

export function tilesConflict(a: MapItem, b: MapItem): boolean {
  return (
    rotatedWorldBoundsOverlap(a, b) &&
    !(a.kind === 'corridor' && b.kind === 'corridor') &&
    !isInsideCircleCorridorHole(a, b) &&
    !isInsideCircleCorridorHole(b, a) &&
    !isOutsideCircleCorridorOuter(a, b) &&
    !isAtriumTransitOverlap(a, b) &&
    !isOutsidePolygonAtrium(a, b) &&
    !areRotatedRectsSeparated(a, b)
  );
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

/** First free spot (scanning left→right, top→bottom) where a w×h tile fits. */
export function findFreeSpot(
  items: MapItem[],
  w: number,
  h: number,
  columns: number,
  minStartX = 0,
): { x: number; y: number } {
  const width = Math.min(w, columns);
  const startX = Math.max(0, Math.min(minStartX, columns - width));
  for (let y = 0; y < 5000; y++) {
    for (let x = startX; x + width <= columns; x++) {
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
      if (!items.some((it) => tilesConflict(candidate, it))) return { x, y };
    }
  }
  return { x: startX, y: 0 };
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

  // If the anchor is inside a Walkway Circle Ring and the inner hole is full, carve an L-wing inside its footprint
  const enclosingRing = normalizedItems.find((c) => isInsideCircleCorridorHole(c, anchor));
  if (enclosingRing && anchor.w >= 3 && anchor.h >= 2) {
    const splitW = Math.max(1, Math.floor(anchor.w * 0.4));
    const mainW = anchor.w - splitW;
    const subH = Math.max(1, anchor.h - 1);
    return [
      ...normalizedItems.map((i) => (i.key === anchor.key ? { ...i, w: mainW } : i)),
      {
        key: nextKey,
        kind: 'unit',
        unitId: anchor.unitId,
        label: null,
        x: anchor.x + mainW,
        y: anchor.y,
        w: splitW,
        h: subH,
      },
    ];
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

const MAGNET_SNAP_GAP = 3;
const LINE_ALIGN_TOL = 2;

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
let activeSnapAutoResize = true;

function getMatchedNeighborDimensions(
  moved: MapItem,
  sib: MapItem,
  side: 'left' | 'right' | 'top' | 'bottom',
  others: ReadonlyArray<MapItem>,
  columns: number,
): { w: number; h: number } {
  const baseW = Math.min(moved.w, columns);
  const baseH = moved.h;
  if (!activeSnapAutoResize || moved.kind === 'marker') {
    return { w: baseW, h: baseH };
  }

  if (moved.kind === 'corridor' && sib.kind === 'corridor' && !moved.angle && !sib.angle) {
    const sibThick = Math.min(sib.w, sib.h);
    if (sibThick >= 1 && sibThick <= 4) {
      if (baseW > baseH && Math.abs(baseH - sibThick) <= 1) return { w: baseW, h: sibThick };
      if (baseH > baseW && Math.abs(baseW - sibThick) <= 1) return { w: Math.min(sibThick, columns), h: baseH };
    }
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
  const bothLandmarks =
    moved.kind !== 'unit' &&
    moved.kind !== 'atrium' &&
    sib.kind !== 'unit' &&
    sib.kind !== 'atrium';

  if (side === 'left' || side === 'right') {
    // 1. Match vertical touching border length (`sib.h`)
    const shouldMatchH =
      moved.kind === sib.kind ||
      bothLandmarks ||
      (moved.kind === 'unit' && sib.h >= 2 && sib.h <= 10) ||
      (moved.kind !== 'unit' && moved.kind !== 'atrium' && sib.h >= 2 && sib.h <= 5) ||
      Math.abs(baseH - sib.h) <= 3;
    if (shouldMatchH) {
      candH = Math.max(1, sib.h);
    }
    // 2. Equalize width (`sib.w`) if same kind or both landmarks and close in width
    if ((moved.kind === sib.kind || bothLandmarks) && Math.abs(baseW - sib.w) <= 2) {
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
      (moved.kind === 'unit' && sib.w >= 2 && sib.w <= 12) ||
      (moved.kind !== 'unit' && moved.kind !== 'atrium' && sib.w >= 2 && sib.w <= 6) ||
      Math.abs(baseW - sib.w) <= 3;
    if (shouldMatchW) {
      candW = Math.max(1, Math.min(columns, sib.w));
    }
    // 2. Equalize height (`sib.h`) if same kind or both landmarks and close in height
    if ((moved.kind === sib.kind || bothLandmarks) && Math.abs(baseH - sib.h) <= 2) {
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
  if (moved.kind === 'corridor' && isInsideCircleCorridorHole(moved, atr)) return null;
  const polyFaces = getPolygonAtriumWorldFaces(atr);
  if (!polyFaces || polyFaces.length === 0) return null;

  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const acx = atr.x + atr.w / 2;
  const acy = atr.y + atr.h / 2;
  const mcx = moved.x + w / 2;
  const mcy = moved.y + h / 2;

  // Allow transit landmarks (Escalator / Stairs) dragged inside the Atrium interior (`normDist < 0.68`) to stay inside
  if (isAtriumTransitOverlap(atr, moved)) {
    const normDist = Math.hypot((mcx - acx) / Math.max(1, atr.w * 0.5), (mcy - acy) / Math.max(1, atr.h * 0.5));
    if (normDist < 0.68) return null;
  }

  const gapX = Math.max(0, atr.x - (moved.x + w), moved.x - (atr.x + atr.w));
  const gapY = Math.max(0, atr.y - (moved.y + h), moved.y - (atr.y + atr.h));
  const overlapsAttached = others.some(
    (o) =>
      o.kind !== 'atrium' &&
      !isInsideCircleCorridorHole(o, atr) &&
      rectsOverlap(moved, o) &&
      matchSinglePolygonAtriumFaceForItem(o, atr) !== null,
  );
  const maxGap = overlapsAttached ? MAGNET_SNAP_GAP + 2 : MAGNET_SNAP_GAP + 1;
  if (gapX > maxGap || gapY > maxGap) return null;

  const vx = mcx - acx;
  const vy = mcy - acy;
  const vLen = Math.hypot(vx, vy) || 1;
  const dirX = vx / vLen;
  const dirY = vy / vLen;

  const occupiedFaces = new Set<number>();
  for (const o of others) {
    if (o.kind === 'atrium' || o.kind === 'marker' || isInsideCircleCorridorHole(o, atr)) continue;
    const m = matchSinglePolygonAtriumFaceForItem(o, atr);
    if (m) occupiedFaces.add(m.faceIndex);
  }

  const rankedFaces = polyFaces
    .filter((f) => !occupiedFaces.has(f.index))
    .map((f) => ({ face: f, dot: dirX * f.nx + dirY * f.ny }))
    .filter((entry) => entry.dot > -0.35)
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
    Boolean(moved.label && moved.label !== 'unit:rect' && moved.label !== 'unit:circle');
  const nextUnitLabel = resetUnitShapeToRect ? 'unit:rect' : moved.label;
  const isLongCorridor = moved.kind === 'corridor' && Math.max(w, h) >= atr.w;

  for (const { face: bestFace } of rankedFaces) {
    const fmx = (bestFace.x0 + bestFace.x1) * 0.5;
    const fmy = (bestFace.y0 + bestFace.y1) * 0.5;

    // Cardinal face (Top / Bottom, or Left / Right for non-trapezoid tiles) when Atrium itself is unrotated
    if (bestFace.isCardinal && !atr.angle && (!isTrap || Math.abs(bestFace.ny) > 0.9)) {
      const alignedAngle = undefined;
      if (Math.abs(bestFace.ny) > 0.9) {
        const touchEdge: 'top' | 'bottom' = bestFace.ny < 0 ? 'bottom' : 'top';
        const taperFrac = getEdgeTaperFraction({ ...moved, label: nextUnitLabel }, touchEdge);
        const candW =
          !isLongCorridor && bestFace.len >= 1.5
            ? Math.max(2, Math.min(columns, Math.round(bestFace.len / taperFrac)))
            : w;
        const candH = h;
        const cy = bestFace.ny < 0 ? atr.y - candH : atr.y + atr.h;
        if (cy >= 0) {
          const idealCx = Math.max(0, Math.min(columns - candW, Math.round(fmx - candW / 2)));
          const xCandidates = isLongCorridor
            ? computeFullBorderAlignedPositions(moved.x, candW, atr.x, atr.w, columns - candW)
            : [
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
        const candH = !isLongCorridor && bestFace.len >= 1.5 ? Math.max(2, Math.round(bestFace.len)) : h;
        const cx = bestFace.nx < 0 ? atr.x - candW : atr.x + atr.w;
        if (cx >= 0 && cx + candW <= columns) {
          const idealCy = Math.max(0, Math.round(fmy - candH / 2));
          const yCandidates =
            !isLongCorridor && bestFace.len >= 1.5
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

    // Slanted / diagonal face (or Trapezoid on Left/Right face): auto-adjust degree (`alignedAngle`) and line length (`candW`, `candH`)
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

    for (const [candW, candH] of sizePairs) {
      const idealCenterX = fmx + bestFace.nx * (candH * 0.5);
      const idealCenterY = fmy + bestFace.ny * (candH * 0.5);
      const baseX = Math.round(idealCenterX - candW * 0.5);
      const baseY = Math.round(idealCenterY - candH * 0.5);

      let bestDiag: { x: number; y: number; dist: number; score: number } | null = null;
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
          const match = matchSinglePolygonAtriumFaceForItem(cand, atr);
          if (!match || match.faceIndex !== bestFace.index) continue;
          const centerDist = Math.hypot(cx + candW / 2 - idealCenterX, cy + candH / 2 - idealCenterY);
          const moveDist = Math.hypot(cx + candW / 2 - mcx, cy + candH / 2 - mcy);
          const score = centerDist * 3.5 + moveDist * 0.15;
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
  if (moved.kind === 'marker' || moved.kind === 'atrium' || !isCircleRingCorridor(ring)) return null;

  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const gapX = Math.max(0, ring.x - (moved.x + w), moved.x - (ring.x + ring.w));
  const gapY = Math.max(0, ring.y - (moved.y + h), moved.y - (ring.y + ring.h));
  if (gapX > 6.0 || gapY > 6.0) return null;

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

  const normCenterDist = Math.hypot(vx / rxOut, vy / ryOut);
  // Allow transit landmarks (Escalator / Stairs) dragged inside a Circle Atrium to stay inside its interior
  if (isAtriumTransitOverlap(ring, moved) && normCenterDist < 0.65) {
    return null;
  }

  // Center hole snap: if dragged inside a Circle Ring corridor's hollow center, auto-center and switch to 'unit:circle'
  if (moved.kind === 'unit' && ring.kind === 'corridor' && (normCenterDist < 0.66 || isInsideCircleCorridorHole(ring, moved))) {
    const maxHoleSide = Math.max(2, Math.floor(Math.min(ring.w, ring.h) * 0.5));
    const side = !activeSnapAutoResize || isMultiBlockUnit ? w : Math.max(2, Math.min(maxHoleSide, Math.max(w, h)));
    const holeW = Math.min(columns, side);
    const holeH = !activeSnapAutoResize || isMultiBlockUnit ? h : side;
    const cx = Math.max(0, Math.min(columns - holeW, Math.round(rcx - holeW * 0.5)));
    const cy = Math.max(0, Math.round(rcy - holeH * 0.5));
    const holeCand: MapItem = {
      ...moved,
      x: cx,
      y: cy,
      w: holeW,
      h: holeH,
      angle: undefined,
      label: 'unit:circle',
    };
    if (isInsideCircleCorridorHole(ring, holeCand) && !others.some((o) => tilesConflict(holeCand, o))) {
      return {
        x: cx,
        y: cy,
        w: holeW,
        h: holeH,
        angle: undefined,
        label: 'unit:circle',
        dist: Math.hypot(cx + holeW * 0.5 - mcx, cy + holeH * 0.5 - mcy),
      };
    }
    return null;
  }

  if (Math.hypot(vx, vy) < 0.25) return null;

  const closestPt = getClosestPointOnTileToPoint(moved, rcx, rcy);
  const normClosest = Math.hypot((closestPt.x - rcx) / rxOut, (closestPt.y - rcy) / ryOut);
  const avgR = (rxOut + ryOut) * 0.5;
  const radialGap = (normClosest - 1) * avgR;
  if (radialGap > 5.5) return null;

  const rawTheta = Math.atan2(vy / ryOut, vx / rxOut);
  const parSpan = Math.max(w, h);
  const perpDepth = Math.min(w, h);
  const candW = !activeSnapAutoResize || isMultiBlockUnit || isCircleTile(moved) ? w : Math.min(columns, parSpan);
  const candH = !activeSnapAutoResize || isMultiBlockUnit || isCircleTile(moved) ? h : perpDepth;

  const movedRawOffset = computeUnitNaturalRadialOffset(
    { x: moved.x, y: moved.y, w: candW, h: candH },
    { cx: rcx, cy: rcy, rxOut, ryOut },
  );

  // Determine direct radial offset: 0 when dragged close to the Circle Atrium rim (<= 1.35 cells),
  // or preserve the walkway space from the Circle Atrium when placed further out (> 1.35 cells).
  let directRadialOffset = moved.kind === 'unit' && movedRawOffset > 1.35 ? Math.round(movedRawOffset * 4) / 4 : 0;

  const candidateSlots: Array<{ theta: number; radialOffset: number; isNeighborSlot: boolean }> = [];
  const mPerp = moved.kind === 'unit' ? Math.max(2, Math.min(2.6, perpDepth)) : candH;

  for (const o of others) {
    if (o.key === moved.key || o.kind === 'atrium' || o.kind === 'marker') continue;
    const m = findNearestCircleCorridorForUnit(o, [ring]);
    if (!m || !m.isNear || m.insideHole) continue;

    const oRadialOffset = resolveUnitCircleRadialOffset(o, m);
    if (directRadialOffset > 0 && oRadialOffset > 0.15 && Math.abs(oRadialOffset - movedRawOffset) <= 1.25) {
      directRadialOffset = oRadialOffset;
    }
    if (Math.abs(movedRawOffset - oRadialOffset) > 2.2) continue;

    const ocx = o.x + o.w * 0.5;
    const ocy = o.y + o.h * 0.5;
    const oTheta = Math.atan2((ocy - rcy) / ryOut, (ocx - rcx) / rxOut);
    const oPar = Math.max(o.w, o.h);
    const oPerp = Math.max(2, Math.min(2.6, Math.min(o.w, o.h)));
    const oRxIn = rxOut + oRadialOffset;
    const oRyIn = ryOut + oRadialOffset;
    const oRIn = Math.hypot(oRxIn * Math.cos(oTheta), oRyIn * Math.sin(oTheta)) || oRxIn;
    const oSpan = Math.max(
      (18 * Math.PI) / 180,
      Math.min((95 * Math.PI) / 180, oPar / Math.max(2, oRIn + oPerp * 0.5)),
    );
    const dThetaMovedAtO = Math.max(
      (18 * Math.PI) / 180,
      Math.min((95 * Math.PI) / 180, parSpan / Math.max(2, oRIn + mPerp * 0.5)),
    );
    const touchDelta = 0.5 * (oSpan + dThetaMovedAtO);
    const diff = Math.atan2(Math.sin(rawTheta - oTheta), Math.cos(rawTheta - oTheta));
    if (Math.abs(diff) <= touchDelta + (40 * Math.PI) / 180) {
      candidateSlots.push({
        theta: oTheta + (diff >= 0 ? touchDelta : -touchDelta),
        radialOffset: oRadialOffset,
        isNeighborSlot: true,
      });
      candidateSlots.push({
        theta: oTheta + (diff >= 0 ? -touchDelta : touchDelta),
        radialOffset: oRadialOffset,
        isNeighborSlot: true,
      });
    }
  }

  candidateSlots.unshift({
    theta: rawTheta,
    radialOffset: directRadialOffset,
    isNeighborSlot: false,
  });

  let bestCand: { x: number; y: number; angle: number | undefined; label: string | null; dist: number; score: number } | null = null;

  for (let tIdx = 0; tIdx < candidateSlots.length; tIdx++) {
    const slot = candidateSlots[tIdx];
    const theta = slot.theta;
    const rxSlot = rxOut + slot.radialOffset;
    const rySlot = ryOut + slot.radialOffset;
    const bx = rcx + rxSlot * Math.cos(theta);
    const by = rcy + rySlot * Math.sin(theta);
    const gnx = Math.cos(theta) / rxSlot;
    const gny = Math.sin(theta) / rySlot;
    const gLen = Math.hypot(gnx, gny) || 1;
    const nx = gnx / gLen;
    const ny = gny / gLen;

    const candidateEdges: Array<'bottom' | 'top'> = ['bottom', 'top'];
    let bestExactDeg = 0;
    let bestScoreDeg = Infinity;

    for (const edge of candidateEdges) {
      const rad = edge === 'top' ? Math.atan2(-nx, ny) : Math.atan2(nx, -ny);
      const exactDeg = (((rad * 180) / Math.PI) % 360 + 360) % 360;
      const isUpright = exactDeg <= 96 || exactDeg >= 264;
      const penalty = (isUpright ? 0 : 180) + angularDiffDeg(exactDeg, moved.angle ?? 0) * 0.2;
      if (penalty < bestScoreDeg) {
        bestScoreDeg = penalty;
        bestExactDeg = exactDeg;
      }
    }

    const alignedAngle = normalizeTileAngle(bestExactDeg);

    const slotLabel =
      moved.kind === 'unit'
        ? moved.label === 'unit:trapezoid-ring'
          ? 'unit:trapezoid-ring'
          : slot.radialOffset <= 0.1
            ? 'unit:ring-curve'
            : `unit:ring-curve:r=${slot.radialOffset.toFixed(2)}`
        : (moved.label ?? null);

    const rInAtTheta = Math.hypot(bx - rcx, by - rcy) || (avgR + slot.radialOffset);
    const dThetaSlot = Math.max(
      (18 * Math.PI) / 180,
      Math.min((95 * Math.PI) / 180, parSpan / Math.max(2, rInAtTheta + mPerp * 0.5)),
    );
    const cHalf = moved.kind === 'unit' ? Math.max(0.7, 0.5 + 0.5 * Math.cos(dThetaSlot * 0.5)) : 1;
    const idealCenterX = rcx + rxSlot * Math.cos(theta) * cHalf + nx * (0.5 * mPerp);
    const idealCenterY = rcy + rySlot * Math.sin(theta) * cHalf + ny * (0.5 * mPerp);
    const baseX = Math.round(idealCenterX - candW * 0.5);
    const baseY = Math.round(idealCenterY - candH * 0.5);

    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
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
        if (others.some((o) => tilesConflict(cand, o))) continue;
        if (moved.kind === 'unit') {
          const m = findNearestCircleCorridorForUnit(cand, [ring]);
          if (!m || !m.isNear || m.insideHole) continue;
        }
        const centerDist = Math.hypot(cx + candW * 0.5 - idealCenterX, cy + candH * 0.5 - idealCenterY);
        const moveDist = Math.hypot(cx + candW * 0.5 - mcx, cy + candH * 0.5 - mcy);
        const slotBonus = slot.isNeighborSlot && moveDist <= MAGNET_SNAP_GAP + 2.2 ? -1.15 : slot.isNeighborSlot ? 0.35 : 0;
        const score = centerDist * 3.0 + moveDist * 0.35 + slotBonus;
        if (!bestCand || score < bestCand.score) {
          bestCand = {
            x: cx,
            y: cy,
            angle: alignedAngle,
            label: slotLabel,
            dist: slot.isNeighborSlot ? moveDist : Math.min(Math.hypot(gapX, gapY), moveDist),
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
  if (!sib.angle || sib.kind === 'marker') return null;
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
  if (gapU > MAGNET_SNAP_GAP + 2.5 || gapV > MAGNET_SNAP_GAP + 2.5) return null;

  const alignedAngle = moved.kind === 'marker' ? undefined : sib.angle;
  const shouldInheritUnitShape = moved.kind === 'unit' && sib.kind === 'unit';
  const nextLabel = shouldInheritUnitShape
    ? sib.label ?? 'unit:rect'
    : moved.kind === 'unit' && moved.label && moved.label !== 'unit:rect' && moved.label !== 'unit:circle'
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

      let bestMatch: { x: number; y: number; dist: number; score: number } | null = null;
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

function getSlantedUnitNeighborSnapMeta(
  moved: MapItem,
  sib: MapItem,
  _side: 'left' | 'right',
  candH: number,
  baseYPositions: number[],
): { yPositions: number[]; inheritedLabel: string | null } {
  if (moved.kind !== 'unit' || sib.kind !== 'unit') {
    return { yPositions: baseYPositions, inheritedLabel: null };
  }
  const sibMode = parseUnitShapeMode(sib);
  const movedMode = parseUnitShapeMode(moved);
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
    inheritedLabel: `unit:${activeSlopeMode}`,
  };
}

function getVerticalComplementaryUnitLabel(
  moved: MapItem,
  sib: MapItem,
  side: 'top' | 'bottom',
): string | null {
  if (moved.kind !== 'unit') return null;
  if (sib.kind === 'unit') {
    const sibMode = parseUnitShapeMode(sib);
    if (side === 'bottom') {
      if (sibMode === 'slope-b-l') return 'unit:slope-t-r';
      if (sibMode === 'slope-b-r') return 'unit:slope-t-l';
    } else {
      if (sibMode === 'slope-t-l') return 'unit:slope-b-r';
      if (sibMode === 'slope-t-r') return 'unit:slope-b-l';
    }
  }
  if (isRingCurveUnitLabel(moved.label) || moved.label?.startsWith('unit:slope-')) {
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
  const overlappingSiblings = siblings.filter((s) => rotatedWorldBoundsOverlap(moved, s) || rectsOverlap(moved, s));
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

    if (sib.kind === 'unit' && parseUnitShapeMode(sib, items) === 'ring-curve') {
      const sibRing = findNearestCircleCorridorForUnit(sib, items);
      if (sibRing && sibRing.isNear && !sibRing.insideHole) {
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
          continue;
        }
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

    const isStraightCorridorSnapForUnit =
      moved.kind === 'unit' && sib.kind === 'corridor' && !sib.angle && !isCircleRingCorridor(sib);

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
          side,
          candH,
          baseYPositions,
        );
        const resetRingShape =
          !inheritedLabel && moved.kind === 'unit' && isRingCurveUnitLabel(moved.label);
        const nextLabel = isStraightCorridorSnapForUnit || resetRingShape ? 'unit:rect' : inheritedLabel;
        const hasShapeOverride = isStraightCorridorSnapForUnit || resetRingShape || Boolean(inheritedLabel);
        const hasAngleReset = !sib.angle && Boolean(moved.angle);

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
          if (
            !others.some(
              (o) =>
                tilesConflict(cand, o) ||
                (cand.kind === 'corridor' && o.kind === 'corridor' && rectsOverlap(cand, o)),
            )
          ) {
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
        const nextLabel = isStraightCorridorSnapForUnit ? 'unit:rect' : vCompLabel;
        const hasShapeOverride = isStraightCorridorSnapForUnit || Boolean(vCompLabel);
        const hasAngleReset = !sib.angle && Boolean(moved.angle);

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
          if (
            !others.some(
              (o) =>
                tilesConflict(cand, o) ||
                (cand.kind === 'corridor' && o.kind === 'corridor' && rectsOverlap(cand, o)),
            )
          ) {
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

  const xSnaps: Array<{
    x: number;
    yPositions: number[];
    gap: number;
    w: number;
    h: number;
    straightCorridorTouch?: boolean;
    inheritedLabel?: string | null;
    resetAngle?: boolean;
  }> = [];
  const ySnaps: Array<{
    y: number;
    xPositions: number[];
    gap: number;
    w: number;
    h: number;
    straightCorridorTouch?: boolean;
    inheritedLabel?: string | null;
    resetAngle?: boolean;
  }> = [];

  for (const sib of others) {
    // 1a. Any tile near a Circle Atrium or Circle Ring: magnetically attract to touch outer arc, outer concentric ring, or center hole
    if (isCircleRingCorridor(sib)) {
      const ringCand = findCircleCorridorMagneticCandidate(moved, sib, others, columns);
      if (ringCand && ringCand.dist <= MAGNET_SNAP_GAP + 5.5) {
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

    if (sib.kind === 'unit' && parseUnitShapeMode(sib, items) === 'ring-curve') {
      const sibRing = findNearestCircleCorridorForUnit(sib, items);
      if (sibRing && sibRing.isNear && !sibRing.insideHole) {
        continue;
      }
    }

    if (isInsideCircleCorridorHole(sib, moved) || isInsideCircleCorridorHole(moved, sib)) continue;
    if (
      isAtriumTransitOverlap(sib, moved) &&
      moved.x >= sib.x &&
      moved.x + w <= sib.x + sib.w &&
      moved.y >= sib.y &&
      moved.y + h <= sib.y + sib.h
    ) {
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
      if (rotCand && rotCand.dist <= MAGNET_SNAP_GAP + 3) {
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

    const isStraightCorridorTouchForUnit =
      moved.kind === 'unit' && sib.kind === 'corridor' && !sib.angle && !isCircleRingCorridor(sib);
    const resetAngle = !sib.angle && Boolean(moved.angle);

    // 1e. Contiguous Unit-Row / Unit-Column Auto-Span when dragging a larger tile (Atrium, Unit, or Corridor) alongside 2+ contiguous Units
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
          parseUnitShapeMode(moved)?.startsWith('slope-'),
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
          'left',
          candH,
          baseYPositions,
        );
        const resetRing = !inheritedLabel && moved.kind === 'unit' && isRingCurveUnitLabel(moved.label);
        const effLabel = resetRing ? 'unit:rect' : inheritedLabel;
        const bestY = yPositions[0];
        const needsShapeReset =
          (isStraightCorridorTouchForUnit || resetRing) && (moved.label !== 'unit:rect' || Boolean(moved.angle));
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
            straightCorridorTouch: isStraightCorridorTouchForUnit,
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
          'right',
          candH,
          baseYPositions,
        );
        const resetRing = !inheritedLabel && moved.kind === 'unit' && isRingCurveUnitLabel(moved.label);
        const effLabel = resetRing ? 'unit:rect' : inheritedLabel;
        const bestY = yPositions[0];
        const needsShapeReset =
          (isStraightCorridorTouchForUnit || resetRing) && (moved.label !== 'unit:rect' || Boolean(moved.angle));
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
            straightCorridorTouch: isStraightCorridorTouchForUnit,
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
          (isStraightCorridorTouchForUnit || Boolean(vCompLabel)) &&
          (moved.label !== (vCompLabel ?? 'unit:rect') || Boolean(moved.angle));
        const cy = sib.y - candH;
        if (cy >= 0 && (gapTop > 0 || bestX !== moved.x || sizeChanged || needsShapeReset || resetAngle)) {
          ySnaps.push({
            y: cy,
            xPositions,
            gap: gapTop,
            w: candW,
            h: candH,
            straightCorridorTouch: isStraightCorridorTouchForUnit,
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
          (isStraightCorridorTouchForUnit || Boolean(vCompLabel)) &&
          (moved.label !== (vCompLabel ?? 'unit:rect') || Boolean(moved.angle));
        const cy = sib.y + sib.h;
        if (gapBottom > 0 || bestX !== moved.x || sizeChanged || needsShapeReset || resetAngle) {
          ySnaps.push({
            y: cy,
            xPositions,
            gap: gapBottom,
            w: candW,
            h: candH,
            straightCorridorTouch: isStraightCorridorTouchForUnit,
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
      const straightTouch = Boolean(xs.straightCorridorTouch || ys.straightCorridorTouch);
      const nextLabel = straightTouch ? 'unit:rect' : xs.inheritedLabel ?? ys.inheritedLabel ?? null;
      const hasShapeOverride = straightTouch || Boolean(xs.inheritedLabel || ys.inheritedLabel);
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
        const straightTouch = Boolean(xs.straightCorridorTouch);
        const nextLabel = straightTouch ? 'unit:rect' : xs.inheritedLabel ?? null;
        const hasShapeOverride = straightTouch || Boolean(xs.inheritedLabel);
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
        const straightTouch = Boolean(ys.straightCorridorTouch);
        const nextLabel = straightTouch ? 'unit:rect' : ys.inheritedLabel ?? null;
        const hasShapeOverride = straightTouch || Boolean(ys.inheritedLabel);
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
 * Magnetically snaps a resized tile's moving edges (`x`, `y`, `w`, `h`) within `MAGNET_SNAP_GAP`
 * so resized edges automatically touch adjacent borders or equalize width/height and edge lines with neighbors.
 */
function snapTileResizeMagnetically(
  moved: MapItem,
  orig: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  const others = items.filter((i) => i.key !== moved.key);
  if (moved.angle || isCircleRingCorridor(moved)) {
    const cand: MapItem = { ...moved, w: Math.min(moved.w, columns - moved.x) };
    return !others.some((o) => tilesConflict(cand, o)) ? cand : null;
  }
  const origRight = orig.x + orig.w;
  const origBottom = orig.y + orig.h;
  const movedRight = moved.x + moved.w;
  const movedBottom = moved.y + moved.h;

  const resizingLeft = moved.x !== orig.x;
  const resizingRight = movedRight !== origRight && !resizingLeft;
  const resizingTop = moved.y !== orig.y;
  const resizingBottom = movedBottom !== origBottom && !resizingTop;

  const xTargets: number[] = [];
  const rightTargets: number[] = [];
  const yTargets: number[] = [];
  const bottomTargets: number[] = [];

  for (const sib of others) {
    if (isInsideCircleCorridorHole(sib, moved) || isInsideCircleCorridorHole(moved, sib)) continue;
    const sibB = getRotatedWorldAABB(sib);
    const sibMinX = Math.round(sibB.minX);
    const sibMaxX = Math.round(sibB.maxX);
    const sibMinY = Math.round(sibB.minY);
    const sibMaxY = Math.round(sibB.maxY);
    const vNear = Math.min(movedBottom, sibMaxY) - Math.max(moved.y, sibMinY) >= -(MAGNET_SNAP_GAP + 4);
    const hNear = Math.min(movedRight, sibMaxX) - Math.max(moved.x, sibMinX) >= -(MAGNET_SNAP_GAP + 4);

    if (vNear) {
      xTargets.push(sibMaxX, sibMinX, movedRight - sib.w);
      rightTargets.push(sibMinX, sibMaxX, moved.x + sib.w);
    }
    if (hNear) {
      yTargets.push(sibMaxY, sibMinY, movedBottom - sib.h);
      bottomTargets.push(sibMinY, sibMaxY, moved.y + sib.h);
    }
  }

  let nextX = moved.x;
  let nextW = Math.min(moved.w, columns - moved.x);
  let nextY = moved.y;
  let nextH = moved.h;

  if (resizingRight) {
    const validRightTargets = rightTargets.filter((t) => t !== origRight);
    const snappedRight = alignCoordToLines(movedRight, validRightTargets, moved.x + 1, columns, MAGNET_SNAP_GAP);
    nextW = Math.max(1, snappedRight - moved.x);
  } else if (resizingLeft) {
    const validXTargets = xTargets.filter((t) => t !== orig.x);
    const snappedLeft = alignCoordToLines(moved.x, validXTargets, 0, origRight - 1, MAGNET_SNAP_GAP);
    nextX = snappedLeft;
    nextW = Math.max(1, origRight - snappedLeft);
  }

  if (resizingBottom) {
    const validBottomTargets = bottomTargets.filter((t) => t !== origBottom);
    const snappedBottom = alignCoordToLines(movedBottom, validBottomTargets, moved.y + 1, 5000, MAGNET_SNAP_GAP);
    nextH = Math.max(1, snappedBottom - moved.y);
  } else if (resizingTop) {
    const validYTargets = yTargets.filter((t) => t !== orig.y);
    const snappedTop = alignCoordToLines(moved.y, validYTargets, 0, origBottom - 1, MAGNET_SNAP_GAP);
    nextY = snappedTop;
    nextH = Math.max(1, origBottom - snappedTop);
  }

  const cand: MapItem = { ...moved, x: nextX, y: nextY, w: nextW, h: nextH };
  if (!others.some((o) => tilesConflict(cand, o))) {
    return cand;
  }
  return null;
}

/**
 * Snaps any dragged or resized tile (`moved` — Unit, Atrium, or Landmark):
 * - When resizing (`orig` has different `w` or `h`), snaps the resized edge to nearby borders and equalizes width/height.
 * - When overlapping ANY tile (`Unit`, `Atrium`, or `Landmark`), snaps flush to the nearest border with full border alignment, degree matching, and size/length matching.
 * - When dragged within `MAGNET_SNAP_GAP` of any tile, magnetically pulls to touch border-by-border
 *   (and on Polygon Atriums / Circle Atriums / Rotated Neighbors / Slanted Neighbor Units, auto-adjusts degree, length/size & shape).
 */
export function snapTileToBorder(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
  orig?: MapItem,
  allowAutoResize = true,
): MapItem | null {
  if (moved.kind === 'unit' && !moved.unitId) return null;
  if (orig && (moved.w !== orig.w || moved.h !== orig.h)) {
    const resized = snapTileResizeMagnetically(moved, orig, items, columns);
    if (resized) return resized;
    if (moved.angle) return null;
  }
  activeSnapAutoResize = allowAutoResize;
  try {
    let baseMoved = moved;
    let detachedFromRing = false;
    if (baseMoved.kind === 'unit' && (!orig || (baseMoved.w === orig.w && baseMoved.h === orig.h))) {
      const nearRingNow = Boolean(findNearestCircleCorridorForUnit(baseMoved, items)?.isNear);
      const wasNearRing = Boolean(orig && findNearestCircleCorridorForUnit(orig, items)?.isNear);
      const isNearAngledCorridor = (u: MapItem) =>
        items.some(
          (i) =>
            i.kind === 'corridor' &&
            !isCircleRingCorridor(i) &&
            Boolean(i.angle) &&
            Math.max(0, i.x - (u.x + u.w), u.x - (i.x + i.w)) <= MAGNET_SNAP_GAP + 2.5 &&
            Math.max(0, i.y - (u.y + u.h), u.y - (i.y + i.h)) <= MAGNET_SNAP_GAP + 2.5,
        );
      const nearAngledCorridorNow = isNearAngledCorridor(baseMoved);
      const wasNearAngledCorridor = Boolean(orig && isNearAngledCorridor(orig));
      if (!nearRingNow && !nearAngledCorridorNow && (wasNearRing || wasNearAngledCorridor || isRingCurveUnitLabel(baseMoved.label))) {
        baseMoved = { ...baseMoved, label: 'unit:rect', angle: undefined };
        detachedFromRing = true;
      }
    }
    const siblings = items.filter((i) => {
      if (i.key === baseMoved.key) return false;
      if (isAtriumTransitOverlap(baseMoved, i)) {
        const atr = baseMoved.kind === 'atrium' ? baseMoved : i;
        const tr = baseMoved.kind === 'atrium' ? i : baseMoved;
        if (tr.x >= atr.x && tr.x + tr.w <= atr.x + atr.w && tr.y >= atr.y && tr.y + tr.h <= atr.y + atr.h) {
          return false;
        }
      }
      if (baseMoved.kind === 'unit' && i.kind === 'unit' && i.unitId === baseMoved.unitId) {
        return true;
      }
      return tilesConflict(baseMoved, i) || rotatedWorldBoundsOverlap(baseMoved, i) || rectsOverlap(baseMoved, i);
    });
    const overlapSnapped = snapBlockToSiblingsBorder(baseMoved, siblings, items, columns);
    if (overlapSnapped) return overlapSnapped;
    const proximitySnapped = snapTileByMagneticProximity(baseMoved, items, columns);
    if (proximitySnapped) return proximitySnapped;
    return detachedFromRing ? baseMoved : null;
  } finally {
    activeSnapAutoResize = true;
  }
}

/**
 * When Auto-Snap is OFF, curves a unit tile around a nearby Circle Atrium in-place (`label: 'unit:ring-curve:free'`,
 * matching the tangent degree `angle`) without magnetically changing its `(x, y)` position or pulling it to touch
 * the Circle Atrium or neighbor units. If dragged away from the Circle Atrium, resets back to `'unit:rect'`.
 */
export function curveUnitAroundCircleWithoutSnap(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  orig?: MapItem,
): MapItem {
  if (moved.kind !== 'unit' || !moved.unitId) return moved;
  if (orig && (moved.w !== orig.w || moved.h !== orig.h)) return moved;

  const isMultiBlockUnit = items.some((o) => o.key !== moved.key && o.kind === 'unit' && o.unitId === moved.unitId);
  if (isMultiBlockUnit) return moved;

  const match = findNearestCircleCorridorForUnit(moved, items);
  if (match && match.isNear && !match.insideHole) {
    if (moved.label && moved.label.startsWith('unit:') && !isRingCurveUnitLabel(moved.label) && moved.label !== 'unit:rect') {
      return moved;
    }
    const ucx = moved.x + moved.w * 0.5;
    const ucy = moved.y + moved.h * 0.5;
    const theta = Math.atan2((ucy - match.cy) / match.ryOut, (ucx - match.cx) / match.rxOut);
    const gnx = Math.cos(theta) / match.rxOut;
    const gny = Math.sin(theta) / match.ryOut;
    const gLen = Math.hypot(gnx, gny) || 1;
    const nx = gnx / gLen;
    const ny = gny / gLen;

    const degBottom = (((Math.atan2(nx, -ny) * 180) / Math.PI) % 360 + 360) % 360;
    const degTop = (((Math.atan2(-nx, ny) * 180) / Math.PI) % 360 + 360) % 360;
    const bottomUpright = degBottom <= 96 || degBottom >= 264;
    const topUpright = degTop <= 96 || degTop >= 264;
    const exactDeg =
      bottomUpright && !topUpright
        ? degBottom
        : topUpright && !bottomUpright
          ? degTop
          : angularDiffDeg(degBottom, moved.angle ?? 0) <= angularDiffDeg(degTop, moved.angle ?? 0)
            ? degBottom
            : degTop;
    const alignedAngle = normalizeTileAngle(exactDeg);
    const cand: MapItem = {
      ...moved,
      angle: alignedAngle,
      label: 'unit:ring-curve:free',
    };
    const others = items.filter((o) => o.key !== moved.key);
    if (!others.some((o) => tilesConflict(cand, o))) {
      return cand;
    }
    return { ...moved, label: 'unit:ring-curve:free' };
  }

  const wasNearRing = Boolean(orig && findNearestCircleCorridorForUnit(orig, items)?.isNear);
  if (wasNearRing || isRingCurveUnitLabel(moved.label)) {
    return { ...moved, label: 'unit:rect', angle: undefined };
  }
  return moved;
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

    const align = getAtriumFaceAlignment(snapped, allItems);
    const deg = Math.round(align ? align.exactAngleDeg : (snapped.angle ?? 0)) % 360;
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

  // 1b. Check Circle Atrium / Ring curve or center-hole snap for any Unit or Landmark
  if (snapped.kind !== 'atrium' && snapped.kind !== 'corridor') {
    const ringMatch = findNearestCircleCorridorForUnit(snapped, allItems);
    if (ringMatch && ringMatch.insideHole && snapped.kind === 'unit' && snapped.label === 'unit:circle') {
      const ucx = snapped.x + snapped.w * 0.5;
      const ucy = snapped.y + snapped.h * 0.5;
      return {
        touchLine: { x1: snapped.x, y1: ucy, x2: snapped.x + snapped.w, y2: ucy },
        guideLines: [
          { x1: ringMatch.cx, y1: ringMatch.ring.y, x2: ringMatch.cx, y2: ringMatch.ring.y + ringMatch.ring.h },
          { x1: ringMatch.ring.x, y1: ringMatch.cy, x2: ringMatch.ring.x + ringMatch.ring.w, y2: ringMatch.cy },
        ],
        badgePos: { x: ucx, y: snapped.y },
        badgeText: 'Circle Center • Auto-Shape',
        isPolygonAtriumSnap: true,
      };
    }
    if (ringMatch && ringMatch.isNear && !ringMatch.insideHole) {
      const align = getAtriumFaceAlignment(snapped, allItems);
      const deg = Math.round(align ? align.exactAngleDeg : (snapped.angle ?? 0)) % 360;
      const ucx = snapped.x + snapped.w * 0.5;
      const ucy = snapped.y + snapped.h * 0.5;
      const radialOffset = snapped.kind === 'unit' ? resolveUnitCircleRadialOffset(snapped, ringMatch) : 0;
      const rxGuide = ringMatch.rxOut + radialOffset;
      const ryGuide = ringMatch.ryOut + radialOffset;
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
        badgeText: radialOffset > 0.1 ? `${deg}° • Outer Ring Curve` : `${deg}° • Circle Curve Match`,
        isPolygonAtriumSnap: true,
      };
    }
  }

  if (snapped.kind === 'unit') {
    // 1c. Check Angled Walkway or Slanted Neighbor Unit touch for a slanted/chamfered Unit
    const unitMode = parseUnitShapeMode(snapped);
    if (
      unitMode &&
      (unitMode.startsWith('slope-') || unitMode.startsWith('chamfer-'))
    ) {
      for (const c of others) {
        if ((c.kind !== 'corridor' && c.kind !== 'unit') || isCircleRingCorridor(c)) continue;
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
    const align = getAtriumFaceAlignment(snapped, allItems);
    const scx = snapped.x + snapped.w * 0.5 + (align?.dx ?? 0);
    const scy = snapped.y + snapped.h * 0.5 + (align?.dy ?? 0);
    const tol = 0.72;

    for (const o of others) {
      const oNormAngle = (((o.angle ?? 0) % 360) + 360) % 360;
      if (oNormAngle !== snappedNormAngle) continue;
      const oAlign = getAtriumFaceAlignment(o, allItems);
      const ocx = o.x + o.w * 0.5 + (oAlign?.dx ?? 0);
      const ocy = o.y + o.h * 0.5 + (oAlign?.dy ?? 0);
      const du = (scx - ocx) * ux + (scy - ocy) * uy;
      const dv = (scx - ocx) * vx + (scy - ocy) * vy;
      const halfU = (snapped.w + o.w) * 0.5;
      const halfV = (snapped.h + o.h) * 0.5;

      const touchU = Math.abs(Math.abs(du) - halfU) <= tol && Math.abs(dv) <= halfV - 0.25;
      const touchV = Math.abs(Math.abs(dv) - halfV) <= tol && Math.abs(du) <= halfU - 0.25;
      if (!touchU && !touchV) continue;

      const deg = Math.round(align ? align.exactAngleDeg : snappedNormAngle) % 360;
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
    if (isInsideCircleCorridorHole(o, snapped) || isInsideCircleCorridorHole(snapped, o)) continue;

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
        let badgeText =
          snapped.y === o.y && snapped.h === o.h
            ? `Equal Height (${snapped.h}) • Full Touch`
            : snapped.y === o.y || snapped.y + snapped.h === o.y + o.h
              ? 'Edge Aligned • Full Touch'
              : 'Full Border Touch';
        if (snapped.kind === 'corridor' && o.kind === 'corridor') {
          const midDiff = Math.abs(snapped.y + snapped.h * 0.5 - (o.y + o.h * 0.5));
          badgeText =
            snapped.y === o.y && snapped.h === o.h
              ? `Equal Width (${snapped.h}) • Walkway Merged`
              : snapped.y === o.y || snapped.y + snapped.h === o.y + o.h
                ? 'L-Corner Junction • Walkway Merged'
                : midDiff <= 1
                  ? 'T-Junction • Walkway Merged'
                  : 'Walkway Merged • Full Touch';
        } else if (snapped.kind === 'corridor' && o.kind === 'unit') {
          const unitSide = snapped.x + snapped.w === o.x ? 'left' : 'right';
          const rowSpan = findContiguousUnitRowSpan(o, allItems, 'y', unitSide);
          const totalSpan = rowSpan.max - rowSpan.min;
          if (rowSpan.count >= 2 && snapped.y === rowSpan.min && snapped.h === totalSpan) {
            badgeText = `Unit Row Span (${totalSpan}) • Full Touch`;
          }
        }
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
        let badgeText =
          snapped.x === o.x && snapped.w === o.w
            ? `Equal Width (${snapped.w}) • Full Touch`
            : snapped.x === o.x || snapped.x + snapped.w === o.x + o.w
              ? 'Edge Aligned • Full Touch'
              : 'Full Border Touch';
        if (snapped.kind === 'corridor' && o.kind === 'corridor') {
          const midDiff = Math.abs(snapped.x + snapped.w * 0.5 - (o.x + o.w * 0.5));
          badgeText =
            snapped.x === o.x && snapped.w === o.w
              ? `Equal Width (${snapped.w}) • Walkway Merged`
              : snapped.x === o.x || snapped.x + snapped.w === o.x + o.w
                ? 'L-Corner Junction • Walkway Merged'
                : midDiff <= 1
                  ? 'T-Junction • Walkway Merged'
                  : 'Walkway Merged • Full Touch';
        } else if (snapped.kind === 'corridor' && o.kind === 'unit') {
          const unitSide = snapped.y + snapped.h === o.y ? 'top' : 'bottom';
          const rowSpan = findContiguousUnitRowSpan(o, allItems, 'x', unitSide);
          const totalSpan = rowSpan.max - rowSpan.min;
          if (rowSpan.count >= 2 && snapped.x === rowSpan.min && snapped.w === totalSpan) {
            badgeText = `Unit Row Span (${totalSpan}) • Full Touch`;
          }
        }
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
 * Places a new `escalator` (Elevator / Lift / Escalator) or `stairs` tile directly inside `atriumKey`
 * (and adjacent to any existing transit tile inside that Atrium so they auto-merge side-by-side).
 */
export function addTransitIntoAtrium(
  items: MapItem[],
  atriumKey: string,
  kind: 'escalator' | 'stairs',
  variant: string,
  columns: number,
  newKey: string = `d:${kind}-${items.length + 1}`,
): MapItem[] {
  const atrium = items.find((i) => i.key === atriumKey && i.kind === 'atrium');
  if (!atrium) return items;

  const w = Math.max(1, Math.min(2, atrium.w, columns));
  const h = Math.max(1, Math.min(2, atrium.h));
  const label = encodeLandmarkMeta(kind, variant);

  const fitsInsideAtrium = (x: number, y: number, tw: number, th: number) =>
    x >= atrium.x &&
    y >= atrium.y &&
    x + tw <= Math.min(columns, atrium.x + atrium.w) &&
    y + th <= atrium.y + atrium.h &&
    !items.some((o) => tilesConflict({ key: newKey, kind, unitId: null, label, x, y, w: tw, h: th }, o));

  // 1. If there are already transit tiles inside this Atrium, try to attach right next to one so they merge
  const innerTransits = items.filter(
    (i) => isTransitLandmark(i.kind) && rectsOverlap(i, atrium),
  );
  for (const [tw, th] of [[w, h], [1, 1]] as Array<[number, number]>) {
    for (const host of innerTransits) {
      const adjSpots: Array<[number, number]> = [
        [host.x + host.w, host.y],
        [host.x - tw, host.y],
        [host.x, host.y + host.h],
        [host.x, host.y - th],
      ];
      for (const [cx, cy] of adjSpots) {
        if (fitsInsideAtrium(cx, cy, tw, th)) {
          return [...items, { key: newKey, kind, unitId: null, label, x: cx, y: cy, w: tw, h: th }];
        }
      }
    }

    // 2. Otherwise try the center of the Atrium, then scan all cells inside the Atrium
    const centerX = atrium.x + Math.floor((atrium.w - tw) / 2);
    const centerY = atrium.y + Math.floor((atrium.h - th) / 2);
    if (fitsInsideAtrium(centerX, centerY, tw, th)) {
      return [...items, { key: newKey, kind, unitId: null, label, x: centerX, y: centerY, w: tw, h: th }];
    }
    for (let y = atrium.y; y + th <= atrium.y + atrium.h; y++) {
      for (let x = atrium.x; x + tw <= Math.min(columns, atrium.x + atrium.w); x++) {
        if (fitsInsideAtrium(x, y, tw, th)) {
          return [...items, { key: newKey, kind, unitId: null, label, x, y, w: tw, h: th }];
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

/**
 * Resolve the default starting point ("You Are Here") on a floor plan.
 * Priority: 'marker' (You Are Here) -> 'entrance' -> 'escalator' -> 'stairs' -> 'atrium'.
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

interface WalkwayRouteStep {
  instruction: string;
  distanceMeters: number;
  direction: 'start' | 'straight' | 'left' | 'right' | 'arrive';
}

interface WalkwayRouteResult {
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
): Array<{ x: number; y: number; angleDeg: number }> {
  const arrows: Array<{ x: number; y: number; angleDeg: number }> = [];
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

/**
 * Computes an indoor walking path from `fromItem` to `toItem` that follows
 * `corridor` (Walkway) centerlines — including tilted straight walkways
 * and hollow circular ring roundabouts — while avoiding shop units.
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
  const SUB = 2;
  const gCols = cols * SUB;
  const gRows = rows * SUB;
  const gxToWorld = (gx: number): number => (gx <= 0 ? 0.22 : gx * 0.5);
  const gyToWorld = (gy: number): number => (gy <= 0 ? 0.22 : gy * 0.5);
  const worldToGx = (wx: number): number => Math.max(0, Math.min(gCols - 1, Math.round(wx * 2)));
  const worldToGy = (wy: number): number => Math.max(0, Math.min(gRows - 1, Math.round(wy * 2)));

  const nonCorridors = items.filter((i) => i.kind !== 'corridor');

  const sectorByUnitKey = new Map<string, CircleRingUnitSector>();
  for (const it of nonCorridors) {
    if (it.kind === 'unit') {
      const sec = computeCircleRingUnitSector(it, items);
      if (sec) sectorByUnitKey.set(it.key, sec);
    }
  }

  const resolveTileVisualCenter = (it: MapItem): { x: number; y: number } => {
    const sec = sectorByUnitKey.get(it.key);
    if (sec) {
      const thOutMid = 0.5 * (sec.thetaStartOut + sec.thetaEndOut);
      const thVis = 0.5 * (sec.thetaMid + thOutMid);
      const rxVis = sec.rxOut + sec.radialDepth * 0.48;
      const ryVis = sec.ryOut + sec.radialDepth * 0.48;
      return {
        x: sec.cx + rxVis * Math.cos(thVis),
        y: sec.cy + ryVis * Math.sin(thVis),
      };
    }
    const align = getAtriumFaceAlignment(it, items);
    if (align) {
      return {
        x: it.x + it.w * 0.5 + align.dx,
        y: it.y + it.h * 0.5 + align.dy,
      };
    }
    return { x: it.x + it.w * 0.5, y: it.y + it.h * 0.5 };
  };

  const fromSector = sectorByUnitKey.get(fromItem.key) ?? null;
  const toSector = sectorByUnitKey.get(toItem.key) ?? null;
  const exactStart = resolveTileVisualCenter(fromItem);
  const exactEnd = resolveTileVisualCenter(toItem);

  const startGx = worldToGx(exactStart.x);
  const startGy = worldToGy(exactStart.y);
  const endGx = worldToGx(exactEnd.x);
  const endGy = worldToGy(exactEnd.y);

  const isStartOrDestTile = (it: MapItem) =>
    it.key === fromItem.key ||
    it.key === toItem.key ||
    (Boolean(fromItem.unitId) && it.unitId === fromItem.unitId) ||
    (Boolean(toItem.unitId) && it.unitId === toItem.unitId);

  const isPointInPolygon = (wx: number, wy: number, corners: ReadonlyArray<{ x: number; y: number }>): boolean => {
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
  };

  const minDistToPolygonEdges = (
    wx: number,
    wy: number,
    corners: ReadonlyArray<{ x: number; y: number }>,
  ): number => {
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
  };

  type TileCollisionShape = {
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
  };

  const buildTileCollisionShape = (it: MapItem): TileCollisionShape => {
    const sec = sectorByUnitKey.get(it.key);
    if (sec) {
      const corners: Array<{ x: number; y: number }> = [];
      const arcSteps = 8;
      for (let s = 0; s <= arcSteps; s++) {
        const th = sec.thetaStart + (s / arcSteps) * (sec.thetaEnd - sec.thetaStart);
        corners.push({
          x: sec.cx + sec.rxOut * Math.cos(th),
          y: sec.cy + sec.ryOut * Math.sin(th),
        });
      }
      const rOutX = sec.rxOut + sec.radialDepth;
      const rOutY = sec.ryOut + sec.radialDepth;
      for (let s = arcSteps; s >= 0; s--) {
        const th = sec.thetaStartOut + (s / arcSteps) * (sec.thetaEndOut - sec.thetaStartOut);
        corners.push({
          x: sec.cx + rOutX * Math.cos(th),
          y: sec.cy + rOutY * Math.sin(th),
        });
      }
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
      const vc = resolveTileVisualCenter(it);
      return {
        item: it,
        vcx: vc.x,
        vcy: vc.y,
        hw: (maxX - minX) * 0.5,
        hh: (maxY - minY) * 0.5,
        ux: Math.cos(sec.thetaMid),
        uy: Math.sin(sec.thetaMid),
        vx: -Math.sin(sec.thetaMid),
        vy: Math.cos(sec.thetaMid),
        minX,
        maxX,
        minY,
        maxY,
        isRotatedOrCurved: true,
        mode: 'poly',
        corners,
      };
    }

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

    const align = getAtriumFaceAlignment(it, items);
    const vcx = it.x + it.w * 0.5 + (align?.dx ?? 0);
    const vcy = it.y + it.h * 0.5 + (align?.dy ?? 0);
    const vw = Math.max(0.5, it.w * (align?.scaleX ?? 1));
    const vh = Math.max(0.5, it.h * (align?.scaleY ?? 1));
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

    if (isCircleTile(it, items) || (it.kind === 'unit' && parseUnitShapeMode(it) === 'circle')) {
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
      const visualItem: MapItem = {
        ...it,
        x: vcx - hw,
        y: vcy - hh,
        w: vw,
        h: vh,
      };
      const customPoly = getCustomUnitPolygonVerticesAndAxes(visualItem, { ux, uy, vx, vy });
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
  };

  const signedDistanceToShape = (wx: number, wy: number, s: TileCollisionShape): number => {
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
  };

  const startDestShapes: TileCollisionShape[] = [];
  const obstacleShapes: TileCollisionShape[] = [];
  const containerAtriumShapes: TileCollisionShape[] = [];

  for (const it of nonCorridors) {
    const shape = buildTileCollisionShape(it);
    if (isStartOrDestTile(it)) {
      startDestShapes.push(shape);
    } else if (
      it.kind === 'atrium' &&
      (signedDistanceToShape(exactStart.x, exactStart.y, shape) < -0.1 ||
        signedDistanceToShape(exactEnd.x, exactEnd.y, shape) < -0.1)
    ) {
      containerAtriumShapes.push(shape);
    } else {
      obstacleShapes.push(shape);
    }
  }

  const minObstacleDistanceAt = (wx: number, wy: number): number => {
    let minD = Infinity;
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

  // Precompute sub-cell traversal cost & whether diagonal (8-dir) steps are enabled on the node
  const totalNodes = gCols * gRows;
  const cellCost = new Float32Array(totalNodes);
  cellCost.fill(6.5);
  const allowDiag = new Uint8Array(totalNodes);
  const isOpenFloorCell = new Uint8Array(totalNodes);

  for (let gy = 0; gy < gRows; gy++) {
    const wy = gyToWorld(gy);
    for (let gx = 0; gx < gCols; gx++) {
      const idx = gy * gCols + gx;
      const wx = gxToWorld(gx);

      // 0. Never route outside the architectural floorplate border
      if (!isInsideFloorplate(wx, wy)) {
        cellCost[idx] = 25000.0;
        allowDiag[idx] = 0;
        continue;
      }

      const obsDist = minObstacleDistanceAt(wx, wy);

      // 1. Strict obstacle interior & wall boundary block (units, atriums, restrooms, stairs, escalators, etc.)
      if (obsDist <= 0.04) {
        cellCost[idx] = 50000.0;
        allowDiag[idx] = 0;
        continue;
      }

      // 2. Start or Destination tile interior: prefer perpendicular exit/entry along center axes, away from neighbor walls
      const startDestHit = findStartDestShapeAt(wx, wy, 0.04);
      if (startDestHit) {
        // Standalone "You Are Here" location pin sits on open floor — allow smooth 360-degree departure
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

      // 3. Very tight wall-grazing margin outside obstacles
      if (obsDist < 0.18) {
        cellCost[idx] = 36.0;
        allowDiag[idx] = 0;
        continue;
      }

      // 4. Open floor concourse cost & obstacle clearance
      const inContainerAtrium =
        containerAtriumShapes.length > 0 &&
        containerAtriumShapes.some((s) => signedDistanceToShape(wx, wy, s) <= 0.04);

      if (inContainerAtrium) {
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

  // Ensure start and end nodes are reachable
  const startCellIdx = startGy * gCols + startGx;
  const endCellIdx = endGy * gCols + endGx;
  cellCost[startCellIdx] = 1.0;
  cellCost[endCellIdx] = 1.0;
  allowDiag[startCellIdx] = fromItem.kind === 'marker' || fromItem.angle || fromSector ? 1 : 0;
  allowDiag[endCellIdx] = toItem.kind === 'marker' || toItem.angle || toSector ? 1 : 0;

  // Hybrid 4-dir / 8-dir Dijkstra on 0.5-cell subgrid
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
  const parent = new Int32Array(stateCount);
  parent.fill(-1);

  const startState = startCellIdx * STATE_STRIDE + INIT_DIR;
  dist[startState] = 0;

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
    const { dir, cellIdx, gx, gy } = decodeState(cur);

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
        // Verify diagonal segment midpoint & quarter points stay clear of all obstacle walls/corners
        const wx0 = gxToWorld(gx);
        const wy0 = gyToWorld(gy);
        const wx1 = gxToWorld(ngx);
        const wy1 = gyToWorld(ngy);
        if (
          minObstacleDistanceAt((wx0 + wx1) * 0.5, (wy0 + wy1) * 0.5) < 0.18 ||
          minObstacleDistanceAt(wx0 * 0.75 + wx1 * 0.25, wy0 * 0.75 + wy1 * 0.25) < 0.16 ||
          minObstacleDistanceAt(wx0 * 0.25 + wx1 * 0.75, wy0 * 0.25 + wy1 * 0.75) < 0.16
        ) {
          continue;
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
        parent[nextState] = cur;
        pushHeap(nextState);
      }
    }
  }

  // Reconstruct sub-cell nodes
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
      if (!isInsideFloorplate(sx, sy) || minObstacleDistanceAt(sx, sy) < minClearance) {
        return false;
      }
    }
    return true;
  };

  const rawPoints = rawNodes.map(({ gx, gy }) => ({ x: gxToWorld(gx), y: gyToWorld(gy) }));
  if (rawPoints.length > 0) {
    rawPoints[0] = exactStart;
    rawPoints[rawPoints.length - 1] = exactEnd;
  }

  // For rotated start/destination tiles, straighten interior sub-cell steps into a clean perpendicular line along the open face normal
  if ((fromItem.angle || toItem.angle) && rawPoints.length >= 4) {
    if (fromItem.angle && !fromSector) {
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
    if (toItem.angle && !toSector && rawPoints.length >= 4) {
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
      // Do not cut 90-degree corridor turns around unit corners; only smooth grid staircase steps
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

  // Build concise landmark / shop waypoint steps (no raw meter/feet numbers)
  const getTileLabel = (it: MapItem): string => {
    if (describeItem) {
      const custom = describeItem(it)?.trim();
      if (custom && custom !== '—') return custom;
    }
    if (it.kind !== 'unit' && it.kind !== 'corridor') {
      return parseLandmarkMeta(it.kind, it.label).displayLabel;
    }
    if (it.label && !it.label.startsWith('unit:') && !it.label.startsWith('walkway:')) {
      return it.label;
    }
    return DECORATION_LABELS[it.kind as Exclude<TileKind, 'unit'>] || 'Shop';
  };

  const findNearbyWaypointName = (
    samplePts: ReadonlyArray<{ x: number; y: number }>,
    usedNames: Set<string>,
    allowReuseForTurn = false,
  ): string | null => {
    let bestName: string | null = null;
    let bestScore = Infinity;
    for (const it of nonCorridors) {
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
        bestName = name;
      }
    }
    return bestName;
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
        const nearName = findNearbyWaypointName([firstPt, midPt, lastPt], usedNames, false);
        if (nearName) {
          usedNames.add(nearName);
          steps.push({
            instruction: `Pass by ${nearName}`,
            distanceMeters: segMeters,
            direction: 'straight',
          });
        }
      } else {
        const dirText = seg.dir === 'left' ? 'Turn left' : 'Turn right';
        const turnNear = findNearbyWaypointName([firstPt, midPt], usedNames, true);
        if (turnNear) {
          usedNames.add(turnNear);
        }
        const instruction = turnNear ? `${dirText} near ${turnNear}` : dirText;
        const prevStep = steps[steps.length - 1];
        if (!prevStep || prevStep.instruction !== instruction) {
          steps.push({
            instruction,
            distanceMeters: segMeters,
            direction: seg.dir,
          });
        }
      }
    }

    steps.push({
      instruction: `Arrive at ${destName}`,
      distanceMeters: 0,
      direction: 'straight',
    });
  }

  return {
    points: smoothedPoints,
    distanceFeet,
    distanceMeters,
    estimatedMinutes,
    steps,
  };
}

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

function getPolygonAtriumWorldFaces(atrium: {
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

interface AtriumFaceVisualAlignment {
  dx: number;
  dy: number;
  exactAngleDeg: number;
  scaleX: number;
  scaleY: number;
  edge: 'top' | 'right' | 'bottom' | 'left';
  faceIndex: number;
  faceLenCells: number;
}

/**
 * Computes the exact visual alignment (`dx, dy, exactAngleDeg, scaleX, scaleY`) for any Unit, Card, or Walkway
 * touching a Polygon Atrium (`8/12/24-Face`) face so that its touching border is collinear (`0°` error, `0px` gap)
 * and has the exact same line length (`face.len * cellPx`) and midpoint (`(fmx, fmy)`) as that Atrium face.
 */
function getDirectAtriumOrCircleAlignment(
  it: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
): AtriumFaceVisualAlignment | null {
  if (it.kind === 'atrium' || it.kind === 'marker') return null;
  if (it.kind === 'corridor' && parseCorridorShapeMode(it.label) === 'circle') return null;
  for (const a of allItems) {
    if (a.kind !== 'atrium') continue;
    if (it.kind === 'corridor' && isInsideCircleCorridorHole(it, a)) continue;
    const polyFaces = getPolygonAtriumWorldFaces(a);
    if (!polyFaces) continue;
    const match = matchSinglePolygonAtriumFaceForItem(it, a);
    if (!match) continue;
    const face = polyFaces.find((f) => f.index === match.faceIndex);
    if (!face) continue;
    if (face.isCardinal && !it.angle && !a.angle && face.len < 1.4) {
      continue;
    }
    if (it.kind === 'corridor' && !it.angle && Math.max(it.w, it.h) > face.len + 1.8) {
      continue;
    }

    const exactAngleDeg = getExactEdgeFaceAngleDeg(match.edge, face);
    let norm0 = 0;
    let norm1 = 1;
    if (
      it.kind === 'unit' &&
      (it.label === 'unit:trapezoid' || it.label === 'unit:trapezoid-l' || it.label === 'unit:trapezoid-r') &&
      match.edge === 'top'
    ) {
      const inset = it.label === 'unit:trapezoid' ? 0.2 : 0.28;
      norm0 = it.label !== 'unit:trapezoid-r' ? inset : 0;
      norm1 = it.label !== 'unit:trapezoid-l' ? 1 - inset : 1;
    } else if (it.kind === 'unit' && it.label === 'unit:trapezoid-ring' && match.edge === 'bottom') {
      norm0 = 0.18;
      norm1 = 0.82;
    }

    const edgeFrac = Math.max(0.2, norm1 - norm0);
    const midNorm = (norm0 + norm1) * 0.5;
    let scaleX = 1;
    let scaleY = 1;
    if (match.edge === 'top' || match.edge === 'bottom') {
      const targetW = Math.max(2, Math.round(face.len / edgeFrac));
      if (Math.abs(it.w - targetW) <= 1) {
        scaleX = Math.max(0.35, Math.min(2.5, face.len / Math.max(0.2, it.w * edgeFrac)));
      }
    } else {
      const targetH = Math.max(2, Math.round(face.len / edgeFrac));
      if (Math.abs(it.h - targetH) <= 1) {
        scaleY = Math.max(0.35, Math.min(2.5, face.len / Math.max(0.2, it.h * edgeFrac)));
      }
    }

    const uMidNorm = match.edge === 'left' ? 0 : match.edge === 'right' ? 1 : midNorm;
    const vMidNorm = match.edge === 'top' ? 0 : match.edge === 'bottom' ? 1 : midNorm;
    const localU = (uMidNorm - 0.5) * it.w * scaleX;
    const localV = (vMidNorm - 0.5) * it.h * scaleY;
    const rad = (exactAngleDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = -uy;
    const vy = ux;
    const fcx = it.x + it.w * 0.5;
    const fcy = it.y + it.h * 0.5;
    const edgeMidWorldX = fcx + localU * ux + localV * vx;
    const edgeMidWorldY = fcy + localU * uy + localV * vy;
    const fmx = (face.x0 + face.x1) * 0.5;
    const fmy = (face.y0 + face.y1) * 0.5;

    return {
      dx: fmx - edgeMidWorldX,
      dy: fmy - edgeMidWorldY,
      exactAngleDeg: Math.round(exactAngleDeg * 100) / 100,
      scaleX: Math.round(scaleX * 10000) / 10000,
      scaleY: Math.round(scaleY * 10000) / 10000,
      edge: match.edge,
      faceIndex: face.index,
      faceLenCells: Math.round(face.len * 1000) / 1000,
    };
  }

  if (it.kind === 'unit') {
    const mode = parseUnitShapeMode(it, allItems);
    if (mode === 'ring-curve' || mode === 'trapezoid-ring') {
      const sector = computeCircleRingUnitSector(it, allItems);
      if (sector) {
        const ucx = it.x + it.w * 0.5;
        const ucy = it.y + it.h * 0.5;
        const rawDx = sector.worldCx - ucx;
        const rawDy = sector.worldCy - ucy;
        const scaleX = Math.max(0.25, Math.min(8.0, sector.wCells / Math.max(0.5, it.w)));
        const scaleY = Math.max(0.25, Math.min(8.0, sector.hCells / Math.max(0.5, it.h)));
        return {
          dx: Math.round(rawDx * 1000) / 1000,
          dy: Math.round(rawDy * 1000) / 1000,
          exactAngleDeg: sector.exactAngleDeg,
          scaleX: Math.round(scaleX * 10000) / 10000,
          scaleY: Math.round(scaleY * 10000) / 10000,
          edge: sector.facingEdge,
          faceIndex: 0,
          faceLenCells: Math.round(sector.wCells * 1000) / 1000,
        };
      }
    }
  } else if (it.kind !== 'corridor' && it.angle) {
    // Non-unit landmark snapped to the outer rim of a Circle Atrium
    const ringMatch = findNearestCircleCorridorForUnit(it, allItems);
    if (ringMatch && ringMatch.isNear && !ringMatch.insideHole) {
      const ucx = it.x + it.w * 0.5;
      const ucy = it.y + it.h * 0.5;
      const theta = Math.atan2((ucy - ringMatch.cy) / ringMatch.ryOut, (ucx - ringMatch.cx) / ringMatch.rxOut);
      const bx = ringMatch.cx + ringMatch.rxOut * Math.cos(theta);
      const by = ringMatch.cy + ringMatch.ryOut * Math.sin(theta);
      const gnx = Math.cos(theta) / ringMatch.rxOut;
      const gny = Math.sin(theta) / ringMatch.ryOut;
      const gLen = Math.hypot(gnx, gny) || 1;
      const nx = gnx / gLen;
      const ny = gny / gLen;
      const tx = -ny;
      const ty = nx;
      const rawDeg = (((Math.atan2(ty, tx) * 180) / Math.PI) + 360) % 360;
      const exactAngleDeg = Math.round(((rawDeg > 90 && rawDeg <= 270 ? (rawDeg + 180) % 360 : rawDeg) * 100)) / 100;
      const angleDiff = Math.abs(((((it.angle ?? 0) - exactAngleDeg + 540) % 360) - 180));
      const centerDistToRim = (ucx - bx) * nx + (ucy - by) * ny;
      if (angleDiff <= 18 && Math.abs(centerDistToRim - it.h * 0.5) <= 0.85) {
        const idealCx = bx + nx * (it.h * 0.5);
        const idealCy = by + ny * (it.h * 0.5);
        const rad = (exactAngleDeg * Math.PI) / 180;
        const facingEdge: 'top' | 'bottom' = -Math.sin(rad) * nx + Math.cos(rad) * ny > 0 ? 'top' : 'bottom';
        return {
          dx: Math.round((idealCx - ucx) * 1000) / 1000,
          dy: Math.round((idealCy - ucy) * 1000) / 1000,
          exactAngleDeg,
          scaleX: 1,
          scaleY: 1,
          edge: facingEdge,
          faceIndex: 0,
          faceLenCells: it.w,
        };
      }
    }
  }
  return null;
}

/**
 * Computes the exact visual alignment (`dx, dy, exactAngleDeg, scaleX, scaleY`) for any Unit, Landmark, or tile:
 * 1. Touching a Polygon Atrium (`8/12/24-Face`) face so that its touching border is collinear (`0°` error, `0px` gap)
 *    and has the exact same line length (`face.len * cellPx`) and midpoint (`(fmx, fmy)`) as that Atrium face.
 * 2. Touching a Circle Atrium's curved outer rim (`unit:ring-curve`, `unit:trapezoid-ring`, or angled Landmark).
 * 3. Touching a same-angle Rotated Neighbor (`it.angle !== 0`), using a deterministic anchor across the connected
 *    rotated component so chains of rotated tiles sit edge-to-edge with `0.0px` visual gap despite integer grid cells.
 */
export function getAtriumFaceAlignment(
  it: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  allItems: ReadonlyArray<{ key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number }>,
): AtriumFaceVisualAlignment | null {
  if (it.kind === 'atrium' || it.kind === 'marker') return null;
  const direct = getDirectAtriumOrCircleAlignment(it, allItems);
  if (direct) return direct;

  const normAngle = (((it.angle ?? 0) % 360) + 360) % 360;
  if (normAngle === 0) return null;

  // Find all tiles in `allItems` that share the same normalized grid angle
  const peers: Array<{
    item: { key?: string; kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number };
    idx: number;
  }> = [];
  allItems.forEach((t, idx) => {
    const tAngle = (((t.angle ?? 0) % 360) + 360) % 360;
    if (tAngle === normAngle) {
      peers.push({ item: t, idx });
    }
  });
  if (peers.length < 2) return null;

  const targetIdx = peers.findIndex((p) =>
    it.key && p.item.key ? p.item.key === it.key : p.item === it || (p.item.x === it.x && p.item.y === it.y && p.item.w === it.w && p.item.h === it.h),
  );
  if (targetIdx < 0) return null;

  const gridRad = (normAngle * Math.PI) / 180;
  const gUx = Math.cos(gridRad);
  const gUy = Math.sin(gridRad);
  const gVx = -gUy;
  const gVy = gUx;
  const tol = 0.72;

  const getPairOffset = (
    p: { x: number; y: number; w: number; h: number },
    q: { x: number; y: number; w: number; h: number },
  ): { idealDu: number; idealDv: number; qEdge: 'top' | 'right' | 'bottom' | 'left' } | null => {
    const pcx = p.x + p.w * 0.5;
    const pcy = p.y + p.h * 0.5;
    const qcx = q.x + q.w * 0.5;
    const qcy = q.y + q.h * 0.5;
    const du = (qcx - pcx) * gUx + (qcy - pcy) * gUy;
    const dv = (qcx - pcx) * gVx + (qcy - pcy) * gVy;
    const halfU = (p.w + q.w) * 0.5;
    const halfV = (p.h + q.h) * 0.5;

    const errU = Math.abs(Math.abs(du) - halfU);
    const errV = Math.abs(Math.abs(dv) - halfV);
    const touchU = errU <= tol && Math.abs(dv) <= halfV - 0.25;
    const touchV = errV <= tol && Math.abs(du) <= halfU - 0.25;
    if (!touchU && !touchV) return null;

    if (touchU && (!touchV || errU <= errV)) {
      const signU = du >= 0 ? 1 : -1;
      const idealDu = signU * halfU;
      const candVs = [0, (q.h - p.h) * 0.5, (p.h - q.h) * 0.5];
      let idealDv = dv;
      let bestDiff = Infinity;
      for (const cv of candVs) {
        const d = Math.abs(dv - cv);
        if (d <= tol && d < bestDiff) {
          bestDiff = d;
          idealDv = cv;
        }
      }
      return { idealDu, idealDv, qEdge: signU > 0 ? 'left' : 'right' };
    } else {
      const signV = dv >= 0 ? 1 : -1;
      const idealDv = signV * halfV;
      const candUs = [0, (q.w - p.w) * 0.5, (p.w - q.w) * 0.5];
      let idealDu = du;
      let bestDiff = Infinity;
      for (const cu of candUs) {
        const d = Math.abs(du - cu);
        if (d <= tol && d < bestDiff) {
          bestDiff = d;
          idealDu = cu;
        }
      }
      return { idealDu, idealDv, qEdge: signV > 0 ? 'top' : 'bottom' };
    }
  };

  // Find connected component containing `targetIdx`
  const compIndices: number[] = [targetIdx];
  const inComp = new Set<number>([targetIdx]);
  for (let head = 0; head < compIndices.length; head++) {
    const cur = compIndices[head];
    for (let j = 0; j < peers.length; j++) {
      if (inComp.has(j)) continue;
      if (getPairOffset(peers[cur].item, peers[j].item)) {
        inComp.add(j);
        compIndices.push(j);
      }
    }
  }
  if (compIndices.length < 2) return null;

  // Choose deterministic anchor `rootPeerIdx` in the connected component
  let rootPeerIdx = compIndices[0];
  let rootDirectAlign: AtriumFaceVisualAlignment | null = null;
  let rootPriority = -1;

  for (const pi of compIndices) {
    const cand = peers[pi].item;
    const directAlign = getDirectAtriumOrCircleAlignment(cand, allItems);
    const prio = cand.kind === 'atrium' ? 3 : directAlign ? 2 : 1;
    if (
      prio > rootPriority ||
      (prio === rootPriority &&
        (cand.w * cand.h > peers[rootPeerIdx].item.w * peers[rootPeerIdx].item.h ||
          (cand.w * cand.h === peers[rootPeerIdx].item.w * peers[rootPeerIdx].item.h &&
            peers[pi].idx < peers[rootPeerIdx].idx)))
    ) {
      rootPriority = prio;
      rootPeerIdx = pi;
      rootDirectAlign = directAlign;
    }
  }

  if (rootPeerIdx === targetIdx) return null;

  const exactAngleDeg = rootDirectAlign ? rootDirectAlign.exactAngleDeg : normAngle;
  const exactRad = (exactAngleDeg * Math.PI) / 180;
  const ux = Math.cos(exactRad);
  const uy = Math.sin(exactRad);
  const vx = -uy;
  const vy = ux;

  const rootItem = peers[rootPeerIdx].item;
  const resolved = new Map<
    number,
    { cx: number; cy: number; edge: 'top' | 'right' | 'bottom' | 'left' }
  >();
  resolved.set(rootPeerIdx, {
    cx: rootItem.x + rootItem.w * 0.5 + (rootDirectAlign?.dx ?? 0),
    cy: rootItem.y + rootItem.h * 0.5 + (rootDirectAlign?.dy ?? 0),
    edge: rootDirectAlign?.edge ?? 'top',
  });

  const queue: number[] = [rootPeerIdx];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const curPos = resolved.get(cur)!;
    if (cur === targetIdx) break;
    for (const nxt of compIndices) {
      if (resolved.has(nxt)) continue;
      const off = getPairOffset(peers[cur].item, peers[nxt].item);
      if (!off) continue;
      resolved.set(nxt, {
        cx: curPos.cx + off.idealDu * ux + off.idealDv * vx,
        cy: curPos.cy + off.idealDu * uy + off.idealDv * vy,
        edge: off.qEdge,
      });
      queue.push(nxt);
    }
  }

  const targetResolved = resolved.get(targetIdx);
  if (!targetResolved) return null;

  const rawDx = targetResolved.cx - (it.x + it.w * 0.5);
  const rawDy = targetResolved.cy - (it.y + it.h * 0.5);
  return {
    dx: Math.round(rawDx * 1000) / 1000,
    dy: Math.round(rawDy * 1000) / 1000,
    exactAngleDeg: Math.round(exactAngleDeg * 100) / 100,
    scaleX: 1,
    scaleY: 1,
    edge: targetResolved.edge,
    faceIndex: 0,
    faceLenCells: targetResolved.edge === 'top' || targetResolved.edge === 'bottom' ? it.w : it.h,
  };
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
    for (const b of group) adj.set(b.key, new Set());

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

      for (const o of group) {
        if (o.key === it.key) continue;
        const { tHit, rHit, bHit, lHit } = clipFrameEdges(frame, it.w, it.h, o);

        if (tHit || bHit || lHit || rHit) {
          adj.get(it.key)!.add(o.key);
          adj.get(o.key)!.add(it.key);
        }

        const tiltedPair = Boolean(it.angle || o.angle);
        const canonicalOwner = it.key < o.key;
        if (tHit) {
          topTouched.push(tHit);
          if (tiltedPair && canonicalOwner) topBridges.push(tHit);
        }
        if (bHit) {
          bottomTouched.push(bHit);
          const ownsBottom = !tiltedPair ? (o.y !== it.y ? o.y > it.y : canonicalOwner) : canonicalOwner;
          if (ownsBottom) bottomBridges.push(bHit);
        }
        if (lHit) {
          leftTouched.push(lHit);
          if (tiltedPair && canonicalOwner) leftBridges.push(lHit);
        }
        if (rHit) {
          rightTouched.push(rHit);
          const ownsRight = !tiltedPair ? (o.x !== it.x ? o.x > it.x : canonicalOwner) : canonicalOwner;
          if (ownsRight) rightBridges.push(rHit);
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
  const saved = Array.isArray(planData?.items) ? planData.items : [];
  const maxSavedRight = saved.reduce(
    (max: number, it: any) => Math.max(max, (Number(it?.x) || 0) + Math.max(1, Number(it?.w) || 1)),
    0,
  );
  return {
    spc: Number(planData?.sqftPerCell) || DEFAULT_SQFT_PER_CELL,
    cols: Math.max(Number(planData?.columns) || DEFAULT_COLUMNS, maxSavedRight),
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

/* ── Edit Mode Multi-Select / Group Helpers ── */

function tilesTouchOrOverlapForGroup(a: MapItem, b: MapItem, allItems: ReadonlyArray<MapItem>): boolean {
  if (a.key === b.key) return false;
  // Direct overlap or enclosure (e.g. Atrium inside Circle Ring Walkway, or Lift/Escalator inside Atrium)
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
    const align = getAtriumFaceAlignment(other, allItems);
    if (align) {
      const dist = Math.hypot(
        other.x + other.w * 0.5 - (atrium.x + atrium.w * 0.5),
        other.y + other.h * 0.5 - (atrium.y + atrium.h * 0.5),
      );
      if (dist <= Math.max(atrium.w, atrium.h) + Math.max(other.w, other.h) + 1.5) {
        return true;
      }
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
      if (tilesTouchOrOverlapForGroup(s, cand, items)) {
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
      it.w !== it.h &&
      ((!it.angle && (normDelta === 90 || normDelta === 270)) ||
        (it.kind === 'corridor' && (nextAngle === 90 || nextAngle === 270)));
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



