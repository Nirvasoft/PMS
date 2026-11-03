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
  /** Visual tilt in degrees (multiples of 15). 0/undefined = upright. */
  angle?: number;
}

export const TILE_ANGLE_STEP = 15;

/** Normalizes any value to one of 0, 15, 30 ... 345 (returns undefined for upright so it is not persisted). */
export function normalizeTileAngle(val: unknown): number | undefined {
  const n = Math.round(Number(val) / TILE_ANGLE_STEP) * TILE_ANGLE_STEP;
  if (!Number.isFinite(n)) return undefined;
  const a = ((n % 360) + 360) % 360;
  return a === 0 ? undefined : a;
}

export type CorridorShapeMode = 'auto' | 'straight' | 'circle';
export type ResolvedCorridorShape = 'straight' | 'circle';

export const CORRIDOR_SHAPE_LABELS: Record<CorridorShapeMode, string> = {
  auto: 'Auto',
  straight: 'Straight',
  circle: 'Circle Ring',
};

export function parseCorridorShapeMode(label: string | null | undefined): CorridorShapeMode {
  if (label === 'walkway:straight') return 'straight';
  if (label === 'walkway:circle') return 'circle';
  return 'auto';
}

export function encodeCorridorShapeMode(mode: CorridorShapeMode): string {
  if (mode === 'straight') return 'walkway:straight';
  if (mode === 'circle') return 'walkway:circle';
  return 'Walkway';
}

export function nextCorridorShapeMode(mode: CorridorShapeMode): CorridorShapeMode {
  if (mode === 'auto') return 'straight';
  if (mode === 'straight') return 'circle';
  return 'auto';
}

export type UnitShapeMode =
  | 'rect'
  | 'circle'
  | 'ring-curve'
  | 'trapezoid-ring'
  | 'trapezoid'
  | 'trapezoid-l'
  | 'trapezoid-r';

export const UNIT_SHAPE_LABELS: Record<UnitShapeMode, string> = {
  rect: 'Rectangle',
  circle: 'Circle',
  'ring-curve': 'Ring Curve',
  'trapezoid-ring': 'Curved Trapezoid',
  trapezoid: 'Trapezoid',
  'trapezoid-l': 'Trapezoid (Left Slant)',
  'trapezoid-r': 'Trapezoid (Right Slant)',
};

export interface TrapezoidUnitGeometry {
  clipPath: string;
  fillPoints: string;
  rimPath: string;
  lipRightPath: string;
  lipBottomPath: string;
  facingEdge?: 'top' | 'right' | 'bottom' | 'left';
}

export function parseUnitShapeMode(
  it: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number },
  allItems?: ReadonlyArray<{ kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }>,
  isMergedUnit?: boolean,
): UnitShapeMode {
  if (it.label === 'unit:ring-curve') return 'ring-curve';
  if (it.label === 'unit:trapezoid-ring') return 'trapezoid-ring';
  if (it.label === 'unit:trapezoid') return 'trapezoid';
  if (it.label === 'unit:trapezoid-l') return 'trapezoid-l';
  if (it.label === 'unit:trapezoid-r') return 'trapezoid-r';
  if (it.label === 'unit:circle') return 'circle';
  if (isMergedUnit) return 'rect';
  if (it.label === 'unit:rect') return 'rect';
  if (allItems && allItems.some((c) => c.kind === 'corridor' && isInsideCircleCorridorHole(c, it))) {
    return 'circle';
  }
  return 'rect';
}

export function encodeUnitShapeMode(mode: UnitShapeMode): string {
  if (mode === 'circle') return 'unit:circle';
  if (mode === 'ring-curve') return 'unit:ring-curve';
  if (mode === 'trapezoid-ring') return 'unit:trapezoid-ring';
  if (mode === 'trapezoid') return 'unit:trapezoid';
  if (mode === 'trapezoid-l') return 'unit:trapezoid-l';
  if (mode === 'trapezoid-r') return 'unit:trapezoid-r';
  return 'unit:rect';
}

export function nextUnitShapeMode(mode: UnitShapeMode, isMergedUnit = false): UnitShapeMode {
  if (isMergedUnit) {
    if (mode === 'rect') return 'ring-curve';
    if (mode === 'ring-curve') return 'trapezoid-ring';
    if (mode === 'trapezoid-ring') return 'trapezoid';
    if (mode === 'trapezoid') return 'trapezoid-l';
    if (mode === 'trapezoid-l') return 'trapezoid-r';
    return 'rect';
  }
  if (mode === 'rect') return 'circle';
  if (mode === 'circle') return 'ring-curve';
  if (mode === 'ring-curve') return 'trapezoid-ring';
  if (mode === 'trapezoid-ring') return 'trapezoid';
  if (mode === 'trapezoid') return 'trapezoid-l';
  if (mode === 'trapezoid-l') return 'trapezoid-r';
  return 'rect';
}

export function isTrapezoidUnitMode(
  mode: UnitShapeMode | null | undefined,
): mode is 'ring-curve' | 'trapezoid-ring' | 'trapezoid' | 'trapezoid-l' | 'trapezoid-r' {
  return (
    mode === 'ring-curve' ||
    mode === 'trapezoid-ring' ||
    mode === 'trapezoid' ||
    mode === 'trapezoid-l' ||
    mode === 'trapezoid-r'
  );
}

export function getTrapezoidUnitGeometry(
  mode: 'ring-curve' | 'trapezoid-ring' | 'trapezoid' | 'trapezoid-l' | 'trapezoid-r',
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
  tile?: { x: number; y: number; w: number; h: number } | null,
  allItems?: ReadonlyArray<{ kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }> | null,
): TrapezoidUnitGeometry {
  const sTop = merge?.siblingTopMerged ?? false;
  const sRight = merge?.siblingRightMerged ?? false;
  const sBottom = merge?.siblingBottomMerged ?? false;
  const sLeft = merge?.siblingLeftMerged ?? false;

  if (mode === 'ring-curve' || mode === 'trapezoid-ring') {
    const it = tile ?? { x: 0, y: 0, w: Math.max(1, Math.round(wPx / Math.max(1, cellPx))), h: Math.max(1, Math.round(hPx / Math.max(1, cellPx))) };
    const hasAngle = Boolean((it as { angle?: number }).angle);
    const rings = hasAngle
      ? []
      : (allItems ?? []).filter(
          (c) =>
            c.kind === 'corridor' &&
            c.w >= 4 &&
            c.h >= 4 &&
            c.label !== 'walkway:straight',
        );
    const ux = it.x + it.w / 2;
    const uy = it.y + it.h / 2;

    let cx = ux;
    let cy = it.y + it.h + Math.max(3, it.w * 0.75);
    let rxOut = Math.max(4, it.w * 0.85);
    let ryOut = rxOut;
    let insideHole = false;

    if (rings.length > 0) {
      let bestScore = Infinity;
      for (const r of rings) {
        const rcx = r.x + r.w / 2;
        const rcy = r.y + r.h / 2;
        const rrx = Math.max(2, r.w / 2);
        const rry = Math.max(2, r.h / 2);
        const normDist = Math.hypot((ux - rcx) / rrx, (uy - rcy) / rry);
        const score = Math.abs(normDist - 1) * Math.min(rrx, rry);
        if (score < bestScore) {
          bestScore = score;
          cx = rcx;
          cy = rcy;
          rxOut = rrx;
          ryOut = rry;
          insideHole = r.kind === 'corridor' && isInsideCircleCorridorHole(r, it);
        }
      }
    }

    const dx = cx - ux;
    const dy = cy - uy;
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
    const maxDepthFrac = 0.28;
    const N = 18;
    const isSiblingMerged = Boolean(sTop || sRight || sBottom || sLeft);

    const computeArchNorm = (t: number): number => {
      if (facingEdge === 'bottom' || facingEdge === 'top') {
        const u = taper + t * (1 - 2 * taper);
        const gx = it.x + u * it.w;
        const gMinX = isSiblingMerged && merge?.groupBounds ? merge.groupBounds.minX : it.x + taper * it.w;
        const gMaxX =
          isSiblingMerged && merge?.groupBounds
            ? merge.groupBounds.minX + merge.groupBounds.spanW
            : it.x + (1 - taper) * it.w;
        const ringR = Math.max(rxOut * 1.15, (gMaxX - gMinX) * 0.65, 3);
        const clampDx = (xVal: number) => Math.max(-ringR * 0.92, Math.min(ringR * 0.92, xVal - cx));
        const maxDxSq = Math.max(clampDx(gMinX) ** 2, clampDx(gMaxX) ** 2);
        const baseH = Math.sqrt(Math.max(0, ringR * ringR - maxDxSq));
        const hAt = (xVal: number) => Math.max(0, Math.sqrt(Math.max(0, ringR * ringR - clampDx(xVal) ** 2)) - baseH);
        const xPeak = Math.max(gMinX, Math.min(gMaxX, cx));
        const peak = Math.max(1e-4, hAt(xPeak));
        return Math.max(0, Math.min(1, hAt(gx) / peak));
      } else {
        const v = taper + t * (1 - 2 * taper);
        const gy = it.y + v * it.h;
        const gMinY = isSiblingMerged && merge?.groupBounds ? merge.groupBounds.minY : it.y + taper * it.h;
        const gMaxY =
          isSiblingMerged && merge?.groupBounds
            ? merge.groupBounds.minY + merge.groupBounds.spanH
            : it.y + (1 - taper) * it.h;
        const ringR = Math.max(ryOut * 1.15, (gMaxY - gMinY) * 0.65, 3);
        const clampDy = (yVal: number) => Math.max(-ringR * 0.92, Math.min(ringR * 0.92, yVal - cy));
        const maxDySq = Math.max(clampDy(gMinY) ** 2, clampDy(gMaxY) ** 2);
        const baseH = Math.sqrt(Math.max(0, ringR * ringR - maxDySq));
        const hAt = (yVal: number) => Math.max(0, Math.sqrt(Math.max(0, ringR * ringR - clampDy(yVal) ** 2)) - baseH);
        const yPeak = Math.max(gMinY, Math.min(gMaxY, cy));
        const peak = Math.max(1e-4, hAt(yPeak));
        return Math.max(0, Math.min(1, hAt(gy) / peak));
      }
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

export interface LandmarkVariantDef {
  id: string;
  label: string;
  badgeText: string;
  isCircle?: boolean;
  polygonFaces?: 8 | 12 | 24;
  isEmergency?: boolean;
}

export const LANDMARK_VARIANTS: Record<Exclude<TileKind, 'unit' | 'corridor'>, ReadonlyArray<LandmarkVariantDef>> = {
  marker: [{ id: 'default', label: 'You Are Here', badgeText: 'HERE' }],
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

export interface LandmarkMeta {
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

export interface PolygonAtriumGeometry {
  faces: 8 | 12 | 24;
  clipPath: string;
  outerPoints: string;
  rimPath: string;
  lipPath: string;
  mergedFaces: number[];
}

export function getPolygonAtriumGeometry(
  faces: 8 | 12 | 24,
  wPx: number,
  hPx: number,
  atriumItem?: {
    key?: string;
    kind?: TileKind | string;
    label?: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    angle?: number;
  } | null,
  allItems?: ReadonlyArray<{
    key?: string;
    kind: TileKind | string;
    unitId?: string | null;
    label?: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    angle?: number;
  }> | null,
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
  const mergedFaces: number[] = [];
  void atriumItem;
  void allItems;

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
    mergedFaces,
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
  const isNonDefault = def.id !== defs[0].id && !(safeKind === 'atrium' && trimmed === 'atrium:rect');
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
  const effectiveShowLabel = showLabel ?? (Boolean(cleanCustom) || isNonDefault);
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

export function isCircleTile(
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
    if (
      it.label === 'unit:rect' ||
      it.label === 'unit:ring-curve' ||
      it.label === 'unit:trapezoid-ring' ||
      it.label === 'unit:trapezoid' ||
      it.label === 'unit:trapezoid-l' ||
      it.label === 'unit:trapezoid-r'
    ) {
      return false;
    }
    if (
      allItems &&
      typeof it.x === 'number' &&
      typeof it.y === 'number' &&
      typeof it.w === 'number' &&
      typeof it.h === 'number'
    ) {
      return allItems.some((c) => c.kind === 'corridor' && isInsideCircleCorridorHole(c, it as any));
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
  inner: { x: number; y: number; w: number; h: number },
): boolean {
  if (outer.kind !== 'corridor') return false;
  if (outer.label === 'walkway:straight') return false;
  if (outer.w < 4 || outer.h < 4) return false;
  return (
    inner.x >= outer.x + 1 &&
    inner.x + inner.w <= outer.x + outer.w - 1 &&
    inner.y >= outer.y + 1 &&
    inner.y + inner.h <= outer.y + outer.h - 1
  );
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

export function isAtriumTransitOverlap(
  a: { kind: TileKind | string },
  b: { kind: TileKind | string },
): boolean {
  return (
    (a.kind === 'atrium' && isTransitLandmark(b.kind)) ||
    (b.kind === 'atrium' && isTransitLandmark(a.kind))
  );
}

export function isOutsidePolygonAtrium(
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
    const corners = [
      { x: f.tlx, y: f.tly },
      { x: f.trx, y: f.try_ },
      { x: f.trx + other.h * f.vx, y: f.try_ + other.h * f.vy },
      { x: f.blx, y: f.bly },
    ];
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

export function areRotatedRectsSeparated(
  a: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
  b: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number; angle?: number },
): boolean {
  const angleA = a.angle ?? 0;
  const angleB = b.angle ?? 0;
  if (angleA === angleB) return false;
  if (a.kind === 'atrium' || b.kind === 'atrium') return false;
  if (
    (a.kind === 'corridor' && parseCorridorShapeMode(a.label) === 'circle') ||
    (b.kind === 'corridor' && parseCorridorShapeMode(b.label) === 'circle')
  ) {
    return false;
  }
  const fa = getLocalTileFrame(a);
  const fb = getLocalTileFrame(b);
  const cornersA = [
    { x: fa.tlx, y: fa.tly },
    { x: fa.trx, y: fa.try_ },
    { x: fa.trx + a.h * fa.vx, y: fa.try_ + a.h * fa.vy },
    { x: fa.blx, y: fa.bly },
  ];
  const cornersB = [
    { x: fb.tlx, y: fb.tly },
    { x: fb.trx, y: fb.try_ },
    { x: fb.trx + b.h * fb.vx, y: fb.try_ + b.h * fb.vy },
    { x: fb.blx, y: fb.bly },
  ];
  const axes = [
    { x: fa.ux, y: fa.uy },
    { x: fa.vx, y: fa.vy },
    { x: fb.ux, y: fb.uy },
    { x: fb.vx, y: fb.vy },
  ];
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
    if (maxA <= minB + 0.32 || maxB <= minA + 0.32) return true;
  }
  return false;
}

export function tilesConflict(a: MapItem, b: MapItem): boolean {
  return (
    rectsOverlap(a, b) &&
    !isInsideCircleCorridorHole(a, b) &&
    !isInsideCircleCorridorHole(b, a) &&
    !isAtriumTransitOverlap(a, b) &&
    !isOutsidePolygonAtrium(a, b) &&
    !areRotatedRectsSeparated(a, b)
  );
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

export function findAdjacentSpot(
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
  const lockedItems = [...normalizedItems.filter((i) => lockedKeys.has(i.key)), attachedWing];
  const otherItems = normalizedItems
    .filter((i) => !lockedKeys.has(i.key))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const placed: MapItem[] = [...lockedItems];
  for (const it of otherItems) {
    const next = { ...it };
    while (placed.some((p) => tilesConflict(next, p))) next.y += 1;
    placed.push(next);
  }
  const byKey = new Map(placed.map((p) => [p.key, p]));
  return [...normalizedItems.map((i) => byKey.get(i.key)!), byKey.get(nextKey)!];
}

/**
 * Adds a connected walkway branch (`L-Turn`, `T-Junction`, or radial branch from a `Circle Ring`)
 * directly touching `anchorKey` so the two walkways immediately merge with equal thickness and `0px` seam.
 */
export function addConnectedWalkwayBranch(
  items: MapItem[],
  anchorKey: string,
  columns: number,
  newKey?: string,
): MapItem[] {
  const anchor = items.find((i) => i.key === anchorKey && i.kind === 'corridor');
  if (!anchor) return items;

  let nextKey = newKey && !items.some((i) => i.key === newKey) ? newKey : `d:${items.length + 1}`;
  let seq = items.length + 2;
  while (items.some((i) => i.key === nextKey)) {
    nextKey = `d:${seq++}`;
  }

  const isCircleRing =
    parseCorridorShapeMode(anchor.label) === 'circle' ||
    (anchor.w >= 4 && anchor.h >= 4 && anchor.label !== 'walkway:straight');

  const tryPlaceBranch = (bx: number, by: number, bw: number, bh: number): MapItem | null => {
    const w = Math.max(1, Math.min(bw, columns));
    const h = Math.max(1, bh);
    if (bx < 0 || by < 0 || bx + w > columns) return null;
    const cand: MapItem = {
      key: nextKey,
      kind: 'corridor',
      unitId: null,
      label: 'Walkway',
      x: bx,
      y: by,
      w,
      h,
    };
    if (!items.some((o) => tilesConflict(cand, o))) {
      return cand;
    }
    return null;
  };

  if (isCircleRing) {
    const midY = anchor.y + Math.floor((anchor.h - 2) / 2);
    const midX = anchor.x + Math.floor((anchor.w - 2) / 2);
    for (const len of [6, 4, 3]) {
      const radialSpots: Array<[number, number, number, number]> = [
        [anchor.x + anchor.w, midY, len, 2],
        [anchor.x - len, midY, len, 2],
        [midX, anchor.y + anchor.h, 2, len],
        [midX, anchor.y - len, 2, len],
      ];
      for (const [bx, by, bw, bh] of radialSpots) {
        const placed = tryPlaceBranch(bx, by, bw, bh);
        if (placed) return [...items, placed];
      }
    }
  } else {
    const isHoriz = anchor.w >= anchor.h;
    const thickness = Math.max(2, Math.min(4, isHoriz ? anchor.h : anchor.w));
    const mainSpan = isHoriz ? anchor.w : anchor.h;
    const targetLen = Math.max(4, Math.min(10, Math.round(mainSpan * 0.65)));
    const lenCandidates = Array.from(new Set([targetLen, 6, 4, 3]));

    for (const len of lenCandidates) {
      const spots: Array<[number, number, number, number]> = isHoriz
        ? [
            // L-Turns (Bottom-Right, Bottom-Left, Top-Right, Top-Left)
            [anchor.x + anchor.w - thickness, anchor.y + anchor.h, thickness, len],
            [anchor.x, anchor.y + anchor.h, thickness, len],
            // T-Junction (Bottom-Center, Top-Center)
            [anchor.x + Math.floor((anchor.w - thickness) / 2), anchor.y + anchor.h, thickness, len],
            [anchor.x + anchor.w - thickness, anchor.y - len, thickness, len],
            [anchor.x, anchor.y - len, thickness, len],
            [anchor.x + Math.floor((anchor.w - thickness) / 2), anchor.y - len, thickness, len],
            // Collinear Extensions (Right, Left)
            [anchor.x + anchor.w, anchor.y, len, anchor.h],
            [anchor.x - len, anchor.y, len, anchor.h],
          ]
        : [
            // L-Turns (Right-Bottom, Right-Top, Left-Bottom, Left-Top)
            [anchor.x + anchor.w, anchor.y + anchor.h - thickness, len, thickness],
            [anchor.x + anchor.w, anchor.y, len, thickness],
            // T-Junction (Right-Center, Left-Center)
            [anchor.x + anchor.w, anchor.y + Math.floor((anchor.h - thickness) / 2), len, thickness],
            [anchor.x - len, anchor.y + anchor.h - thickness, len, thickness],
            [anchor.x - len, anchor.y, len, thickness],
            [anchor.x - len, anchor.y + Math.floor((anchor.h - thickness) / 2), len, thickness],
            // Collinear Extensions (Bottom, Top)
            [anchor.x, anchor.y + anchor.h, anchor.w, len],
            [anchor.x, anchor.y - len, anchor.w, len],
          ];

      for (const [bx, by, bw, bh] of spots) {
        const placed = tryPlaceBranch(bx, by, bw, bh);
        if (placed) return [...items, placed];
      }
    }
  }

  // Fallback: attach a perpendicular branch at the bottom-right of `anchor` and push obstructing tiles below it down
  const isHoriz = anchor.w >= anchor.h;
  const thickness = Math.max(2, Math.min(4, isHoriz ? anchor.h : anchor.w));
  const bw = Math.min(columns, isHoriz ? thickness : 6);
  const bh = isHoriz ? 5 : thickness;
  const fallbackBranch: MapItem = {
    key: nextKey,
    kind: 'corridor',
    unitId: null,
    label: 'Walkway',
    x: Math.max(0, Math.min(anchor.x + anchor.w - bw, columns - bw)),
    y: anchor.y + anchor.h,
    w: bw,
    h: bh,
  };

  const lockedKeys = new Set([anchor.key, nextKey]);
  const placed: MapItem[] = [anchor, fallbackBranch];
  const otherItems = items
    .filter((i) => !lockedKeys.has(i.key))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of otherItems) {
    const next = { ...it };
    while (placed.some((p) => tilesConflict(next, p))) next.y += 1;
    placed.push(next);
  }
  const byKey = new Map(placed.map((p) => [p.key, p]));
  return [...items.map((i) => byKey.get(i.key)!), byKey.get(nextKey)!];
}

/**
 * Wraps a continuous Walkway around `atriumKey` with 1 click:
 * - For `Circle Atrium`, `Fountain Court`, or `Polygon Atrium (8/12/24-Face)`: places an enclosing `Circle Ring` walkway (`walkway:circle`)
 *   around the Atrium so the Atrium sits cleanly inside its center hole.
 * - For `Rectangle Atrium` / `Event Stage`: places a connected 4-sided rectangular walkway loop framing the Atrium's 4 borders.
 */
export function wrapWalkwayAroundAtrium(
  items: MapItem[],
  atriumKey: string,
  columns: number,
  startSeq = items.length + 1,
): { items: MapItem[]; nextSeq: number; addedCount: number } {
  const atrium = items.find((i) => i.key === atriumKey && i.kind === 'atrium');
  if (!atrium) return { items, nextSeq: startSeq, addedCount: 0 };

  let seq = startSeq;
  const allocKey = (reserved: Set<string>): string => {
    let k = `d:${seq++}`;
    while (items.some((i) => i.key === k) || reserved.has(k)) {
      k = `d:${seq++}`;
    }
    reserved.add(k);
    return k;
  };

  const meta = parseLandmarkMeta('atrium', atrium.label);
  const reservedKeys = new Set<string>();

  if (meta.isCircle || Boolean(meta.polygonFaces)) {
    const alreadyWrapped = items.some((c) => c.kind === 'corridor' && isInsideCircleCorridorHole(c, atrium));
    if (alreadyWrapped) return { items, nextSeq: seq, addedCount: 0 };

    const pad = 1;
    const nextAtriumW = Math.min(atrium.w, Math.max(2, columns - 2 * pad));
    const nextAtriumX = Math.max(pad, Math.min(atrium.x, columns - nextAtriumW - pad));
    const nextAtriumY = Math.max(pad, atrium.y);
    const dx = nextAtriumX - atrium.x;
    const dy = nextAtriumY - atrium.y;

    const ringKey = allocKey(reservedKeys);
    const ringItem: MapItem = {
      key: ringKey,
      kind: 'corridor',
      unitId: null,
      label: 'walkway:circle',
      x: nextAtriumX - pad,
      y: nextAtriumY - pad,
      w: Math.min(columns - (nextAtriumX - pad), nextAtriumW + 2 * pad),
      h: atrium.h + 2 * pad,
    };

    const shiftedItems = items.map((it) => {
      if (it.key === atrium.key) {
        return { ...it, x: nextAtriumX, y: nextAtriumY, w: nextAtriumW };
      }
      if (isTransitLandmark(it.kind) && rectsOverlap(it, atrium)) {
        return {
          ...it,
          x: Math.max(nextAtriumX, Math.min(it.x + dx, nextAtriumX + nextAtriumW - it.w)),
          y: Math.max(nextAtriumY, Math.min(it.y + dy, nextAtriumY + atrium.h - it.h)),
        };
      }
      return { ...it };
    });

    const lockedKeys = new Set<string>([
      atrium.key,
      ringKey,
      ...shiftedItems.filter((it) => isTransitLandmark(it.kind) && rectsOverlap(it, { x: nextAtriumX, y: nextAtriumY, w: nextAtriumW, h: atrium.h })).map((it) => it.key),
    ]);
    const placed: MapItem[] = [
      ringItem,
      ...shiftedItems.filter((it) => lockedKeys.has(it.key)),
    ];
    const otherItems = shiftedItems
      .filter((it) => !lockedKeys.has(it.key))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const it of otherItems) {
      const next = { ...it };
      while (placed.some((p) => tilesConflict(next, p))) next.y += 1;
      placed.push(next);
    }
    const byKey = new Map(placed.map((p) => [p.key, p]));
    return {
      items: [ringItem, ...shiftedItems.map((i) => byKey.get(i.key)!)],
      nextSeq: seq,
      addedCount: 1,
    };
  }

  // Rectangular Atrium / Event Stage: surround with a 4-sided connected straight walkway loop (thickness = 2)
  const t = 2;
  const nextAtriumW = Math.min(atrium.w, Math.max(2, columns - 2 * t));
  const nextAtriumX = Math.max(t, Math.min(atrium.x, columns - nextAtriumW - t));
  const nextAtriumY = Math.max(t, atrium.y);
  const dx = nextAtriumX - atrium.x;
  const dy = nextAtriumY - atrium.y;

  const shiftedItems = items.map((it) => {
    if (it.key === atrium.key) {
      return { ...it, x: nextAtriumX, y: nextAtriumY, w: nextAtriumW };
    }
    if (isTransitLandmark(it.kind) && rectsOverlap(it, atrium)) {
      return {
        ...it,
        x: Math.max(nextAtriumX, Math.min(it.x + dx, nextAtriumX + nextAtriumW - it.w)),
        y: Math.max(nextAtriumY, Math.min(it.y + dy, nextAtriumY + atrium.h - it.h)),
      };
    }
    return { ...it };
  });

  const loopSides: Array<{ x: number; y: number; w: number; h: number }> = [
    { x: nextAtriumX - t, y: nextAtriumY - t, w: Math.min(columns - (nextAtriumX - t), nextAtriumW + 2 * t), h: t },
    { x: nextAtriumX - t, y: nextAtriumY + atrium.h, w: Math.min(columns - (nextAtriumX - t), nextAtriumW + 2 * t), h: t },
    { x: nextAtriumX - t, y: nextAtriumY, w: t, h: atrium.h },
  ];
  if (nextAtriumX + nextAtriumW + t <= columns) {
    loopSides.push({ x: nextAtriumX + nextAtriumW, y: nextAtriumY, w: t, h: atrium.h });
  }

  const newWalkways: MapItem[] = [];
  for (const side of loopSides) {
    const alreadyCovered = shiftedItems.some(
      (c) => c.kind === 'corridor' && rectsOverlap(c, side),
    );
    if (!alreadyCovered) {
      newWalkways.push({
        key: allocKey(reservedKeys),
        kind: 'corridor',
        unitId: null,
        label: 'Walkway',
        x: side.x,
        y: side.y,
        w: side.w,
        h: side.h,
      });
    }
  }

  if (newWalkways.length === 0) {
    return { items, nextSeq: seq, addedCount: 0 };
  }

  const lockedKeys = new Set<string>([
    atrium.key,
    ...newWalkways.map((w) => w.key),
    ...shiftedItems.filter((it) => isTransitLandmark(it.kind) && rectsOverlap(it, { x: nextAtriumX, y: nextAtriumY, w: nextAtriumW, h: atrium.h })).map((it) => it.key),
  ]);
  const placed: MapItem[] = [
    ...newWalkways,
    ...shiftedItems.filter((it) => lockedKeys.has(it.key)),
  ];
  const otherItems = shiftedItems
    .filter((it) => !lockedKeys.has(it.key))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of otherItems) {
    const next = { ...it };
    while (placed.some((p) => tilesConflict(next, p))) next.y += 1;
    placed.push(next);
  }
  const byKey = new Map(placed.map((p) => [p.key, p]));
  return {
    items: [...shiftedItems.map((i) => byKey.get(i.key)!), ...newWalkways],
    nextSeq: seq,
    addedCount: newWalkways.length,
  };
}

export const MAGNET_SNAP_GAP = 2;
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
  _isCorridorSib = false,
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
 * When a straight Walkway (`moved`) snaps to another straight Walkway (`sib`),
 * automatically equalizes `moved`'s thickness (`w` or `h`) if within 1 cell of `sib`'s thickness.
 */
function getMatchedCorridorDimensions(
  moved: MapItem,
  sib: MapItem,
  columns: number,
): { w: number; h: number } {
  const baseW = Math.min(moved.w, columns);
  const baseH = moved.h;
  if (moved.kind !== 'corridor' || sib.kind !== 'corridor' || moved.angle || sib.angle) {
    return { w: baseW, h: baseH };
  }
  const movedIsRing =
    parseCorridorShapeMode(moved.label) === 'circle' ||
    (baseW >= 4 && baseH >= 4 && moved.label !== 'walkway:straight');
  const sibIsRing =
    parseCorridorShapeMode(sib.label) === 'circle' ||
    (sib.w >= 4 && sib.h >= 4 && sib.label !== 'walkway:straight');
  if (movedIsRing || sibIsRing) {
    return { w: baseW, h: baseH };
  }
  const sibThick = Math.min(sib.w, sib.h);
  if (sibThick < 1 || sibThick > 4) {
    return { w: baseW, h: baseH };
  }
  if (baseW > baseH && Math.abs(baseH - sibThick) <= 1) {
    return { w: baseW, h: sibThick };
  }
  if (baseH > baseW && Math.abs(baseW - sibThick) <= 1) {
    return { w: Math.min(sibThick, columns), h: baseH };
  }
  return { w: baseW, h: baseH };
}

/**
 * Finds the contiguous span (`min..max`) of a row or column of touching Units sharing the same border line (`edgeCoord`)
 * with `anchorUnit`, so a Walkway dragged alongside a Unit Row can auto-adjust its length to span the entire row.
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
): { x: number; y: number; w: number; h: number; angle: number | undefined; dist: number } | null {
  if (isAtriumTransitOverlap(atr, moved)) return null;
  if (moved.kind === 'corridor' && isInsideCircleCorridorHole(moved, atr)) return null;
  const polyFaces = getPolygonAtriumWorldFaces(atr);
  if (!polyFaces || polyFaces.length === 0) return null;

  const w = Math.min(moved.w, columns);
  const h = moved.h;
  const gapX = Math.max(0, atr.x - (moved.x + w), moved.x - (atr.x + atr.w));
  const gapY = Math.max(0, atr.y - (moved.y + h), moved.y - (atr.y + atr.h));
  const overlapsAttached = others.some(
    (o) =>
      o.kind !== 'atrium' &&
      !isInsideCircleCorridorHole(o, atr) &&
      rectsOverlap(moved, o) &&
      matchSinglePolygonAtriumFaceForItem(o, atr) !== null,
  );
  const maxGap = overlapsAttached ? MAGNET_SNAP_GAP + 2 : MAGNET_SNAP_GAP;
  if (gapX > maxGap || gapY > maxGap) return null;

  const acx = atr.x + atr.w / 2;
  const acy = atr.y + atr.h / 2;
  const mcx = moved.x + w / 2;
  const mcy = moved.y + h / 2;
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
  const isLongCorridor = moved.kind === 'corridor' && Math.max(w, h) >= atr.w;

  for (const { face: bestFace } of rankedFaces) {
    const fmx = (bestFace.x0 + bestFace.x1) * 0.5;
    const fmy = (bestFace.y0 + bestFace.y1) * 0.5;

    // Cardinal face (Top / Bottom, or Left / Right for non-trapezoid tiles) when Atrium itself is unrotated
    if (bestFace.isCardinal && !atr.angle && (!isTrap || Math.abs(bestFace.ny) > 0.9)) {
      const alignedAngle = undefined;
      if (Math.abs(bestFace.ny) > 0.9) {
        const touchEdge: 'top' | 'bottom' = bestFace.ny < 0 ? 'bottom' : 'top';
        const taperFrac = getEdgeTaperFraction(moved, touchEdge);
        const candW =
          !isLongCorridor && bestFace.len >= 1.5
            ? Math.max(2, Math.min(columns, Math.round(bestFace.len / taperFrac)))
            : w;
        const candH = h;
        const cy = bestFace.ny < 0 ? atr.y - candH : atr.y + atr.h;
        if (cy >= 0) {
          const idealCx = Math.max(0, Math.min(columns - candW, Math.round(fmx - candW / 2)));
          const xCandidates = isLongCorridor
            ? computeFullBorderAlignedPositions(moved.x, candW, atr.x, atr.w, columns - candW, true)
            : [
                idealCx,
                ...computeFullBorderAlignedPositions(moved.x, candW, atr.x, atr.w, columns - candW, false),
              ];
          for (const cx of xCandidates) {
            if (cx < 0 || cx + candW > columns) continue;
            const cand: MapItem = { ...moved, x: cx, y: cy, w: candW, h: candH, angle: alignedAngle };
            if (!others.some((o) => tilesConflict(cand, o))) {
              return {
                x: cx,
                y: cy,
                w: candW,
                h: candH,
                angle: alignedAngle,
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
              ? [idealCy, ...computeFullBorderAlignedPositions(moved.y, candH, atr.y, atr.h, 5000, false)]
              : computeFullBorderAlignedPositions(moved.y, candH, atr.y, atr.h, 5000, true);
          for (const cy of yCandidates) {
            if (cy < 0) continue;
            const cand: MapItem = { ...moved, x: cx, y: cy, w: candW, h: candH, angle: alignedAngle };
            if (!others.some((o) => tilesConflict(cand, o))) {
              return {
                x: cx,
                y: cy,
                w: candW,
                h: candH,
                angle: alignedAngle,
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

    let snappedDeg = Math.round(bestExactDeg / TILE_ANGLE_STEP) * TILE_ANGLE_STEP;
    if (!bestFace.isCardinal && snappedDeg % 360 === 0) {
      snappedDeg = bestExactDeg >= 180 ? 345 : 15;
    }
    const alignedAngle = normalizeTileAngle(snappedDeg);

    const taperFrac = getEdgeTaperFraction(moved, bestEdge);
    const targetSpan =
      bestFace.len >= 1.0
        ? Math.max(2, Math.min(columns, Math.round(bestFace.len / taperFrac)))
        : w;
    const targetDepth = Math.max(2, Math.min(h, targetSpan));

    const sizePairs: Array<[number, number]> = [[targetSpan, targetDepth]];
    if (targetSpan !== w || targetDepth !== h) {
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
          const cand: MapItem = { ...moved, x: cx, y: cy, w: candW, h: candH, angle: alignedAngle };
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
          dist: bestDiag.dist,
        };
      }
    }
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
  const overlappingSiblings = siblings.filter((s) => rectsOverlap(moved, s));
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
          dist: polyCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    const isCorr = sib.kind === 'corridor';
    const { w: candW, h: candH } = getMatchedCorridorDimensions(moved, sib, columns);
    const xPositions = computeFullBorderAlignedPositions(moved.x, candW, sib.x, sib.w, columns - candW, isCorr);
    const yPositions = computeFullBorderAlignedPositions(moved.y, candH, sib.y, sib.h, 5000, isCorr);

    for (const cx of [sib.x + sib.w, sib.x - candW]) {
      if (cx < 0 || cx + candW > columns) continue;
      for (let idx = 0; idx < yPositions.length; idx++) {
        const cy = yPositions[idx];
        if (cy < 0) continue;
        const cand: MapItem = { ...moved, x: cx, y: cy, w: candW, h: candH };
        if (!others.some((o) => tilesConflict(cand, o))) {
          candidates.push({
            x: cx,
            y: cy,
            w: candW,
            h: candH,
            dist: Math.hypot(cx - moved.x, cy - moved.y),
            priority: idx === 0 ? 0 : 1,
          });
          break;
        }
      }
    }

    for (const cy of [sib.y + sib.h, sib.y - candH]) {
      if (cy < 0) continue;
      for (let idx = 0; idx < xPositions.length; idx++) {
        const cx = xPositions[idx];
        if (cx < 0 || cx + candW > columns) continue;
        const cand: MapItem = { ...moved, x: cx, y: cy, w: candW, h: candH };
        if (!others.some((o) => tilesConflict(cand, o))) {
          candidates.push({
            x: cx,
            y: cy,
            w: candW,
            h: candH,
            dist: Math.hypot(cx - moved.x, cy - moved.y),
            priority: idx === 0 ? 0 : 1,
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
  };
}

/**
 * Magnetically snaps a non-conflicting dragged tile (`moved`) when it comes within `MAGNET_SNAP_GAP` (1–2 grid cells)
 * of any neighbor's border:
 * - On Polygon Atrium (`8/12/24-Face`) faces, automatically adjusts degree (`angle`) and line length (`w`/`h`) to match the nearest free face.
 * - On ordinary non-Polygon-Atrium tiles, aligns X/Y coordinates for full border contact without auto-rotating.
 * - For Walkways (`corridor`), auto-matches corridor thickness at `L`/`T` junctions and auto-spans contiguous Unit rows.
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
    dist: number;
    priority: number;
  }> = [];

  const xSnaps: Array<{ x: number; yPositions: number[]; gap: number; w: number; h: number }> = [];
  const ySnaps: Array<{ y: number; xPositions: number[]; gap: number; w: number; h: number }> = [];

  for (const sib of others) {
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

    // 1. Any tile near a Polygon Atrium (8/12/24-Face): auto-adjust degree and line length to match the nearest free face
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
          dist: polyCand.dist,
          priority: -1,
        });
        continue;
      }
    }

    if (hasConflict || rectsOverlap(moved, sib)) continue;

    const isCorr = sib.kind === 'corridor';
    const { w: candW, h: candH } = getMatchedCorridorDimensions(moved, sib, columns);
    const sizeChanged = candW !== w || candH !== h;
    const vOverlap = Math.min(moved.y + candH, sib.y + sib.h) - Math.max(moved.y, sib.y);
    const hOverlap = Math.min(moved.x + candW, sib.x + sib.w) - Math.max(moved.x, sib.x);

    // 1b. Unit-Row / Unit-Column Walkway Auto-Span when dragging a straight Walkway alongside 2+ contiguous Units
    if (moved.kind === 'corridor' && !moved.angle && sib.kind === 'unit' && !sib.angle) {
      if (w >= h && hOverlap >= -MAGNET_SNAP_GAP) {
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
            const spanCand: MapItem = { ...moved, x: rowSpan.min, y: cy, w: spanW, h };
            if (!others.some((o) => tilesConflict(spanCand, o))) {
              candidates.push({
                x: rowSpan.min,
                y: cy,
                w: spanW,
                h,
                dist: Math.hypot(rowSpan.min - moved.x, cy - moved.y) * 0.5,
                priority: 0,
              });
            }
          }
        }
      } else if (h > w && vOverlap >= -MAGNET_SNAP_GAP) {
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
            const spanCand: MapItem = { ...moved, x: cx, y: colSpan.min, w, h: spanH };
            if (!others.some((o) => tilesConflict(spanCand, o))) {
              candidates.push({
                x: cx,
                y: colSpan.min,
                w,
                h: spanH,
                dist: Math.hypot(cx - moved.x, colSpan.min - moved.y) * 0.5,
                priority: 0,
              });
            }
          }
        }
      }
    }

    // 2. Horizontal border magnetic pull (Left or Right of `sib`)
    if (vOverlap >= -MAGNET_SNAP_GAP) {
      const yPositions = computeFullBorderAlignedPositions(moved.y, candH, sib.y, sib.h, 5000, isCorr);
      const bestY = yPositions[0];

      const gapLeft = sib.x - (moved.x + w);
      if (gapLeft >= 0 && gapLeft <= MAGNET_SNAP_GAP) {
        const cx = sib.x - candW;
        if (cx >= 0 && (gapLeft > 0 || bestY !== moved.y || sizeChanged)) {
          xSnaps.push({ x: cx, yPositions, gap: gapLeft, w: candW, h: candH });
        }
      }

      const gapRight = moved.x - (sib.x + sib.w);
      if (gapRight >= 0 && gapRight <= MAGNET_SNAP_GAP) {
        const cx = sib.x + sib.w;
        if (cx + candW <= columns && (gapRight > 0 || bestY !== moved.y || sizeChanged)) {
          xSnaps.push({ x: cx, yPositions, gap: gapRight, w: candW, h: candH });
        }
      }
    }

    // 3. Vertical border magnetic pull (Top or Bottom of `sib`)
    if (hOverlap >= -MAGNET_SNAP_GAP) {
      const xPositions = computeFullBorderAlignedPositions(moved.x, candW, sib.x, sib.w, columns - candW, isCorr);
      const bestX = xPositions[0];

      const gapTop = sib.y - (moved.y + h);
      if (gapTop >= 0 && gapTop <= MAGNET_SNAP_GAP) {
        const cy = sib.y - candH;
        if (cy >= 0 && (gapTop > 0 || bestX !== moved.x || sizeChanged)) {
          ySnaps.push({ y: cy, xPositions, gap: gapTop, w: candW, h: candH });
        }
      }

      const gapBottom = moved.y - (sib.y + sib.h);
      if (gapBottom >= 0 && gapBottom <= MAGNET_SNAP_GAP) {
        const cy = sib.y + sib.h;
        if (gapBottom > 0 || bestX !== moved.x || sizeChanged) {
          ySnaps.push({ y: cy, xPositions, gap: gapBottom, w: candW, h: candH });
        }
      }
    }
  }

  // Evaluate dual-axis corner snaps first (snapping simultaneously to both an X border and a Y border)
  for (const xs of xSnaps) {
    for (const ys of ySnaps) {
      const cw = xs.w !== w ? xs.w : ys.w;
      const ch = ys.h !== h ? ys.h : xs.h;
      const cand: MapItem = { ...moved, x: xs.x, y: ys.y, w: cw, h: ch };
      if (!others.some((o) => tilesConflict(cand, o))) {
        candidates.push({
          x: xs.x,
          y: ys.y,
          w: cw,
          h: ch,
          dist: Math.hypot(xs.x - moved.x, ys.y - moved.y),
          priority: 0,
        });
      }
    }
  }

  // Evaluate single-axis X snaps with full-border Y alignment
  for (const xs of xSnaps) {
    for (let idx = 0; idx < xs.yPositions.length; idx++) {
      const cy = xs.yPositions[idx];
      const cand: MapItem = { ...moved, x: xs.x, y: cy, w: xs.w, h: xs.h };
      if (!others.some((o) => tilesConflict(cand, o))) {
        candidates.push({
          x: xs.x,
          y: cy,
          w: xs.w,
          h: xs.h,
          dist: xs.gap + Math.abs(cy - moved.y) * 0.35,
          priority: idx === 0 ? 1 : 2,
        });
        break;
      }
    }
  }

  // Evaluate single-axis Y snaps with full-border X alignment
  for (const ys of ySnaps) {
    for (let idx = 0; idx < ys.xPositions.length; idx++) {
      const cx = ys.xPositions[idx];
      const cand: MapItem = { ...moved, x: cx, y: ys.y, w: ys.w, h: ys.h };
      if (!others.some((o) => tilesConflict(cand, o))) {
        candidates.push({
          x: cx,
          y: ys.y,
          w: ys.w,
          h: ys.h,
          dist: ys.gap + Math.abs(cx - moved.x) * 0.35,
          priority: idx === 0 ? 1 : 2,
        });
        break;
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
  };
}

/**
 * Magnetically snaps a resized tile's moving edges (`x`, `y`, `w`, `h`) within `MAGNET_SNAP_GAP` (1–2 cells)
 * so resized edges automatically touch adjacent borders or equalize width/height and edge lines with neighbors.
 */
export function snapTileResizeMagnetically(
  moved: MapItem,
  orig: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  const others = items.filter((i) => i.key !== moved.key);
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
    const vNear = Math.min(movedBottom, sib.y + sib.h) - Math.max(moved.y, sib.y) >= -MAGNET_SNAP_GAP;
    const hNear = Math.min(movedRight, sib.x + sib.w) - Math.max(moved.x, sib.x) >= -MAGNET_SNAP_GAP;

    if (vNear) {
      xTargets.push(sib.x + sib.w, sib.x, movedRight - sib.w);
      rightTargets.push(sib.x, sib.x + sib.w, moved.x + sib.w);
    }
    if (hNear) {
      yTargets.push(sib.y + sib.h, sib.y, movedBottom - sib.h);
      bottomTargets.push(sib.y, sib.y + sib.h, moved.y + sib.h);
    }
  }

  let nextX = moved.x;
  let nextW = Math.min(moved.w, columns - moved.x);
  let nextY = moved.y;
  let nextH = moved.h;

  if (resizingRight) {
    const snappedRight = alignCoordToLines(movedRight, rightTargets, moved.x + 1, columns, MAGNET_SNAP_GAP);
    nextW = Math.max(1, snappedRight - moved.x);
  } else if (resizingLeft) {
    const snappedLeft = alignCoordToLines(moved.x, xTargets, 0, origRight - 1, MAGNET_SNAP_GAP);
    nextX = snappedLeft;
    nextW = Math.max(1, origRight - snappedLeft);
  }

  if (resizingBottom) {
    const snappedBottom = alignCoordToLines(movedBottom, bottomTargets, moved.y + 1, 5000, MAGNET_SNAP_GAP);
    nextH = Math.max(1, snappedBottom - moved.y);
  } else if (resizingTop) {
    const snappedTop = alignCoordToLines(moved.y, yTargets, 0, origBottom - 1, MAGNET_SNAP_GAP);
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
 * Snaps a dragged or resized tile (`moved` — Unit, Walkway, Atrium, or Landmark):
 * - When resizing (`orig` has different `w` or `h`), snaps the resized edge to nearby borders.
 * - When overlapping a same-unit sibling block, Atrium, or neighboring tile, snaps flush to the nearest border with full border alignment.
 * - When dragged within 1–2 grid cells (`MAGNET_SNAP_GAP`) of any tile, magnetically pulls to touch border-by-border
 *   (and on Polygon Atriums, auto-adjusts degree & face span).
 */
export function snapTileToBorder(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
  orig?: MapItem,
): MapItem | null {
  if (moved.kind === 'unit' && !moved.unitId) return null;
  if (orig && (moved.w !== orig.w || moved.h !== orig.h)) {
    const resized = snapTileResizeMagnetically(moved, orig, items, columns);
    if (resized) return resized;
  }
  const siblings = items.filter((i) => {
    if (i.key === moved.key) return false;
    if (moved.kind === 'unit') {
      return (
        (i.kind === 'unit' && i.unitId === moved.unitId) ||
        (i.kind === 'atrium' && (tilesConflict(moved, i) || rectsOverlap(moved, i)))
      );
    }
    return tilesConflict(moved, i) || (i.kind === 'atrium' && rectsOverlap(moved, i));
  });
  const overlapSnapped = snapBlockToSiblingsBorder(moved, siblings, items, columns);
  if (overlapSnapped) return overlapSnapped;
  return snapTileByMagneticProximity(moved, items, columns);
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
export function resolveOverlaps(items: MapItem[], columns: number): MapItem[] {
  const sorted = [...items]
    .map((it) => ({ ...it, w: Math.min(it.w, columns), x: Math.max(0, Math.min(it.x, columns - Math.min(it.w, columns))) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: MapItem[] = [];
  for (const it of sorted) {
    const next = { ...it };
    while (placed.some((p) => tilesConflict(next, p))) next.y += 1;
    placed.push(next);
  }
  // keep the caller's original order
  const byKey = new Map(placed.map((p) => [p.key, p]));
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
  const resolved = resolveOverlaps(resized, columns);
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

export interface WalkwayRouteStep {
  instruction: string;
  distanceMeters: number;
  direction: 'start' | 'straight' | 'left' | 'right' | 'arrive';
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
 * from pixel-space route waypoints so wayfinding paths render with Mappedin-style fluid turns.
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

  const parts: string[] = [`M ${pxPoints[0].x.toFixed(1)} ${pxPoints[0].y.toFixed(1)}`];
  for (let i = 1; i < pxPoints.length - 1; i++) {
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

    const r = Math.min(cornerRadiusPx, len1 * 0.42, len2 * 0.42);
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
  const last = pxPoints[pxPoints.length - 1];
  parts.push(`L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
  return parts.join(' ');
}

/**
 * Computes evenly spaced directional arrow markers (`{ x, y, angleDeg }`) along a pixel-space route
 * for Mappedin-style animated wayfinding chevrons.
 */
export function computeRouteDirectionArrows(
  pxPoints: ReadonlyArray<{ x: number; y: number }>,
  spacingPx = 46,
): Array<{ x: number; y: number; angleDeg: number }> {
  const arrows: Array<{ x: number; y: number; angleDeg: number }> = [];
  if (pxPoints.length < 2) return arrows;

  let carry = spacingPx * 0.55;
  for (let i = 1; i < pxPoints.length; i++) {
    const p0 = pxPoints[i - 1];
    const p1 = pxPoints[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 4) continue;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    let d = carry;
    while (d < segLen - 10) {
      const t = d / segLen;
      arrows.push({
        x: p0.x + dx * t,
        y: p0.y + dy * t,
        angleDeg,
      });
      d += spacingPx;
    }
    carry = Math.max(8, d - segLen);
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

/**
 * Computes an indoor walking path from `fromItem` to `toItem` that follows
 * `corridor` (Walkway) centerlines — including 15°-tilted straight walkways
 * and hollow circular ring roundabouts — while avoiding shop units.
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

  const corridors = items.filter((i) => i.kind === 'corridor');
  const nonCorridors = items.filter((i) => i.kind !== 'corridor');
  const shapeMap = buildCorridorShapeMap(corridors, [], items);
  const circleCorridors = corridors.filter((c) => shapeMap.get(c.key)?.shape === 'circle');

  const isStartOrDestTile = (it: MapItem) =>
    it.key === fromItem.key ||
    it.key === toItem.key ||
    (Boolean(fromItem.unitId) && it.unitId === fromItem.unitId) ||
    (Boolean(toItem.unitId) && it.unitId === toItem.unitId);

  const pointInTile = (wx: number, wy: number, it: MapItem): boolean => {
    const [u, v] = worldToLocal(getLocalTileFrame(it), wx, wy);
    return u >= 0 && u <= it.w && v >= 0 && v <= it.h;
  };

  // Precompute cell traversal cost & whether diagonal (8-dir) steps are enabled on the cell
  const cellCost = new Float32Array(cols * rows);
  cellCost.fill(6.5); // Default empty grid space (bridges small gaps between shop & corridor)
  const allowDiag = new Uint8Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const idx = cy * cols + cx;
      const wx = cx + 0.5;
      const wy = cy + 0.5;

      if (
        (fromItem.kind === 'corridor' && pointInTile(wx, wy, fromItem)) ||
        (toItem.kind === 'corridor' && pointInTile(wx, wy, toItem))
      ) {
        cellCost[idx] = 0.85;
        continue;
      }

      // Check non-corridor tiles first so inner kiosks / atriums / transits inside an atrium or circle ring hole are respected
      let matchedNonCorridor: MapItem | null = null;
      for (const it of nonCorridors) {
        if (pointInTile(wx, wy, it)) {
          if (isStartOrDestTile(it)) {
            matchedNonCorridor = it;
            break;
          }
          if (!matchedNonCorridor || isTransitLandmark(it.kind)) {
            matchedNonCorridor = it;
          }
        }
      }
      if (matchedNonCorridor) {
        if (isStartOrDestTile(matchedNonCorridor)) {
          cellCost[idx] = 0.85;
        } else if (matchedNonCorridor.kind !== 'unit' && matchedNonCorridor.kind !== 'toilet') {
          const inHole = circleCorridors.some((c) => isInsideCircleCorridorHole(c, matchedNonCorridor!));
          cellCost[idx] = inHole ? 16.0 : 1.8;
        } else {
          cellCost[idx] = 48.0;
        }
        continue;
      }

      // Check corridor bodies (straight + sleeves, circle ring bands)
      let bestCorridorCost = Infinity;
      let diagHere = 0;
      let insideCircleHole = false;

      for (const c of corridors) {
        const info = shapeMap.get(c.key);
        if (!info) continue;
        const [u, v] = worldToLocal(info.frame, wx, wy);

        if (info.shape === 'straight') {
          const alongU = c.w >= c.h;
          const minU = alongU && info.startSleeve ? -info.startSleeve.maxExt : 0;
          const maxU = alongU && info.endSleeve ? c.w + info.endSleeve.maxExt : c.w;
          const minV = !alongU && info.startSleeve ? -info.startSleeve.maxExt : 0;
          const maxV = !alongU && info.endSleeve ? c.h + info.endSleeve.maxExt : c.h;
          if (u >= minU && u <= maxU && v >= minV && v <= maxV) {
            const centerOffset = alongU ? Math.abs(v - c.h / 2) : Math.abs(u - c.w / 2);
            const cost = 1.0 + 0.16 * centerOffset;
            if (cost < bestCorridorCost) bestCorridorCost = cost;
            if (c.angle) diagHere = 1;
          }
        } else {
          // Circle ring (pad band slightly by 0.32 cells so narrow curved bands stay connected)
          if (u < -0.35 || u > c.w + 0.35 || v < -0.35 || v > c.h + 0.35) continue;
          const du = u - info.cx;
          const dv = v - info.cy;
          const normOut = Math.hypot(du / (info.rxOut + 0.32), dv / (info.ryOut + 0.32));
          if (normOut > 1) continue;
          if (info.rxIn > 0.45 && info.ryIn > 0.45) {
            const inRx = Math.max(0.15, info.rxIn - 0.32);
            const inRy = Math.max(0.15, info.ryIn - 0.32);
            if (Math.hypot(du / inRx, dv / inRy) < 1) {
              if (info.shape === 'circle') insideCircleHole = true;
              continue;
            }
          }
          const rxMid = info.rxIn > 0.2 ? (info.rxOut + info.rxIn) / 2 : info.rxOut * 0.58;
          const ryMid = info.ryIn > 0.2 ? (info.ryOut + info.ryIn) / 2 : info.ryOut * 0.58;
          const normMid = Math.hypot(du / Math.max(0.5, rxMid), dv / Math.max(0.5, ryMid));
          const centerOffset = Math.abs(normMid - 1) * Math.min(rxMid, ryMid);
          const cost = 1.0 + 0.22 * centerOffset;
          if (cost < bestCorridorCost) bestCorridorCost = cost;
          diagHere = 1;
        }
      }

      if (bestCorridorCost < Infinity) {
        cellCost[idx] = bestCorridorCost;
        allowDiag[idx] = diagHere;
      } else if (insideCircleHole) {
        // Discourage cutting straight across the hollow center of a circular roundabout
        cellCost[idx] = 16.0;
      }
    }
  }

  // Hybrid 4-dir / 8-dir Dijkstra (0..3: orthogonal, 4..7: diagonal on tilted/curved corridors, 8: initial)
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ] as const;
  const STATE_STRIDE = 9;
  const INIT_DIR = 8;
  const decodeState = (s: number) => {
    const dir = s % STATE_STRIDE;
    const cellIdx = (s - dir) / STATE_STRIDE;
    const cx = cellIdx % cols;
    return { dir, cellIdx, cx, cy: (cellIdx - cx) / cols };
  };
  const stateCount = cols * rows * STATE_STRIDE;
  const dist = new Float32Array(stateCount);
  dist.fill(Infinity);
  const parent = new Int32Array(stateCount);
  parent.fill(-1);

  const startState = (startCy * cols + startCx) * STATE_STRIDE + INIT_DIR;
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
    const { dir, cellIdx, cx, cy } = decodeState(cur);

    if (cx === endCx && cy === endCy) {
      goalState = cur;
      break;
    }

    for (let nd = 0; nd < 8; nd++) {
      const [dx, dy, stepLen] = DIRS[nd];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const nCellIdx = ny * cols + nx;

      if (nd >= 4) {
        if (!allowDiag[cellIdx] && !allowDiag[nCellIdx]) continue;
        // Prevent diagonal corner-cutting across shop unit boundaries
        if (cellCost[cy * cols + nx] >= 30 || cellCost[ny * cols + cx] >= 30) continue;
      }

      let turnPenalty = 0;
      if (dir !== INIT_DIR && dir !== nd) {
        const [prevDx, prevDy, prevLen] = DIRS[dir];
        const cosTurn = (prevDx * dx + prevDy * dy) / (prevLen * stepLen);
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

  // Reconstruct cell centers
  const rawCells: Array<{ cx: number; cy: number }> = [];
  if (goalState !== -1) {
    let cur = goalState;
    while (cur !== -1) {
      const { cx, cy } = decodeState(cur);
      rawCells.push({ cx, cy });
      cur = parent[cur];
    }
    rawCells.reverse();
  } else {
    rawCells.push({ cx: startCx, cy: startCy }, { cx: endCx, cy: endCy });
  }

  const rawPoints = rawCells.map(({ cx, cy }) => ({ x: cx + 0.5, y: cy + 0.5 }));
  const exactStart = { x: fromItem.x + fromItem.w / 2, y: fromItem.y + fromItem.h / 2 };
  const exactEnd = { x: toItem.x + toItem.w / 2, y: toItem.y + toItem.h / 2 };
  if (rawPoints.length > 0) {
    rawPoints[0] = exactStart;
    rawPoints[rawPoints.length - 1] = exactEnd;
  }

  // Simplify collinear consecutive segments (orthogonal and diagonal)
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
      const v1x = prev.x - prev2.x;
      const v1y = prev.y - prev2.y;
      const v2x = pt.x - prev.x;
      const v2y = pt.y - prev.y;
      const cross = Math.abs(v1x * v2y - v1y * v2x);
      const dot = v1x * v2x + v1y * v2y;
      if (cross < 0.01 && dot > 0) {
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

  // Build Mappedin-style turn-by-turn steps
  const steps: WalkwayRouteStep[] = [];
  if (simplified.length >= 2) {
    for (let i = 1; i < simplified.length; i++) {
      const p0 = simplified[i - 1];
      const p1 = simplified[i];
      const segCells = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const segMeters = Math.max(1, Math.round(segCells * cellSideFeet * 0.3048));
      if (i === 1) {
        steps.push({
          instruction: `Head straight along walkway (${segMeters} m)`,
          distanceMeters: segMeters,
          direction: 'straight',
        });
      } else {
        const prev = simplified[i - 2];
        const v1x = p0.x - prev.x;
        const v1y = p0.y - prev.y;
        const v2x = p1.x - p0.x;
        const v2y = p1.y - p0.y;
        const cross = v1x * v2y - v1y * v2x;
        const dot = v1x * v2x + v1y * v2y;
        const turnAngle = Math.abs(Math.atan2(cross, dot) * (180 / Math.PI));
        if (turnAngle >= 22) {
          const dir: 'left' | 'right' = cross < 0 ? 'left' : 'right';
          steps.push({
            instruction: `Turn ${dir} and continue ${segMeters} m`,
            distanceMeters: segMeters,
            direction: dir,
          });
        } else if (steps.length > 0) {
          const lastStep = steps[steps.length - 1];
          lastStep.distanceMeters += segMeters;
          lastStep.instruction =
            lastStep.direction === 'straight'
              ? `Head straight along walkway (${lastStep.distanceMeters} m)`
              : `Turn ${lastStep.direction} and continue ${lastStep.distanceMeters} m`;
        }
      }
    }
  }

  return {
    points: simplified,
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

function isCorridorVertical(c: MapItem, all: MapItem[]): boolean {
  if (c.h !== c.w) return c.h > c.w;
  return all.some(
    (o) =>
      o.key !== c.key &&
      Math.min(c.x + c.w, o.x + o.w) > Math.max(c.x, o.x) &&
      (o.y + o.h === c.y || o.y === c.y + c.h),
  );
}

const EDGE_EPS = 0.02;
const MIN_SHARED_EDGE = 0.1;
const CORNER_EPS = 0.05;
const CRESCENT_REACH = 0.58;

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

function worldToLocal(frame: LocalTileFrame, wx: number, wy: number): [number, number] {
  const rx = wx - frame.tlx;
  const ry = wy - frame.tly;
  return [rx * frame.ux + ry * frame.uy, rx * frame.vx + ry * frame.vy];
}

function localToWorld(frame: LocalTileFrame, u: number, v: number): [number, number] {
  return [frame.tlx + u * frame.ux + v * frame.vx, frame.tly + u * frame.uy + v * frame.vy];
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

export interface AtriumFaceVisualAlignment {
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
export function getAtriumFaceAlignment(
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
      scaleX = Math.max(0.35, Math.min(2.5, face.len / Math.max(0.2, it.w * edgeFrac)));
    } else {
      scaleY = Math.max(0.35, Math.min(2.5, face.len / Math.max(0.2, it.h * edgeFrac)));
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
  return null;
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

interface TiltedEndSleeve {
  maxExt: number;
  dirX: number;
  dirY: number;
  virtualRect: { x: number; y: number; w: number; h: number; angle?: number };
  targetKeys: Set<string>;
  samples: Array<{ tau: number; t: number; hit: boolean }>;
}

export interface CorridorShapeInfo {
  mode: CorridorShapeMode;
  shape: ResolvedCorridorShape;
  frame: LocalTileFrame;
  cx: number;
  cy: number;
  rxOut: number;
  ryOut: number;
  rxIn: number;
  ryIn: number;
  thetaStart: number;
  thetaEnd: number;
  startSleeve: TiltedEndSleeve | null;
  endSleeve: TiltedEndSleeve | null;
}

function curvedRadialExcess(u: number, v: number, info: CorridorShapeInfo): number {
  const du = u - info.cx;
  const dv = v - info.cy;
  const normOut = Math.hypot(du / Math.max(0.1, info.rxOut), dv / Math.max(0.1, info.ryOut));
  if (info.rxIn > 0.25 && info.ryIn > 0.25) {
    const normIn = Math.hypot(du / info.rxIn, dv / info.ryIn);
    if (normIn < 0.96) return Infinity;
  }
  const avgR = (info.rxOut + info.ryOut) * 0.5;
  return Math.max(0, (normOut - 1) * avgR);
}

function rayHitItemBody(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  minT: number,
  maxT: number,
  target: MapItem,
  targetInfo?: CorridorShapeInfo,
): { t: number; hitEndCap: boolean } | null {
  const tf = targetInfo?.frame ?? getLocalTileFrame(target);
  const [u0, v0] = worldToLocal(tf, ox, oy);
  const du = dx * tf.ux + dy * tf.uy;
  const dv = dx * tf.vx + dy * tf.vy;

  let tEnter = minT;
  let tExit = maxT;

  const clipSlab = (p0: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi;
    const t1 = (lo - p0) / d;
    const t2 = (hi - p0) / d;
    tEnter = Math.max(tEnter, Math.min(t1, t2));
    tExit = Math.min(tExit, Math.max(t1, t2));
    return tExit >= tEnter;
  };

  if (!clipSlab(u0, du, -EDGE_EPS, target.w + EDGE_EPS)) return null;
  if (!clipSlab(v0, dv, -EDGE_EPS, target.h + EDGE_EPS)) return null;

  const circleTile = isCircleTile(target);
  if ((!targetInfo || targetInfo.shape === 'straight') && !circleTile) {
    const uHit = u0 + tEnter * du;
    const vHit = v0 + tEnter * dv;
    const alongU = target.w >= target.h;
    const hitEndCap = alongU
      ? uHit <= 0.12 || uHit >= target.w - 0.12
      : vHit <= 0.12 || vHit >= target.h - 0.12;
    return { t: tEnter, hitEndCap };
  }

  const rxAtrium = Math.max(0.1, target.w * 0.5);
  const ryAtrium = Math.max(0.1, target.h * 0.5);
  const isInsideCurved = (u: number, v: number) =>
    circleTile
      ? (Math.hypot((u - rxAtrium) / rxAtrium, (v - ryAtrium) / ryAtrium) - 1) * Math.min(rxAtrium, ryAtrium) <= EDGE_EPS
      : curvedRadialExcess(u, v, targetInfo!) <= EDGE_EPS;

  const steps = 16;
  const dt = (tExit - tEnter) / steps;
  for (let s = 0; s <= steps; s++) {
    const t = tEnter + s * dt;
    if (isInsideCurved(u0 + t * du, v0 + t * dv)) {
      let hi = t;
      let lo = s > 0 ? t - dt : t;
      for (let b = 0; b < 4 && hi - lo > 0.005; b++) {
        const mid = (lo + hi) * 0.5;
        if (isInsideCurved(u0 + mid * du, v0 + mid * dv)) hi = mid;
        else lo = mid;
      }
      return { t: hi, hitEndCap: false };
    }
  }
  return null;
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

function computeTiltedSleeve(
  c: MapItem,
  frame: LocalTileFrame,
  isStart: boolean,
  alongU: boolean,
  candidates: MapItem[],
  blockingUnits: MapItem[],
  shapeMap: Map<string, CorridorShapeInfo>,
): TiltedEndSleeve | null {
  if (candidates.length === 0) return null;
  const span = alongU ? c.h : c.w;
  const len = alongU ? c.w : c.h;
  const sin2 = Math.abs(Math.sin(((c.angle ?? 0) * Math.PI) / 90));
  const connectThreshold = 0.25 + len * 0.24 * sin2;
  const maxSleeve = connectThreshold + span * 1.5;
  const sign = isStart ? -1 : 1;
  const dirX = alongU ? sign * frame.ux : sign * frame.vx;
  const dirY = alongU ? sign * frame.uy : sign * frame.vy;
  const fixedCoord = isStart ? 0 : len;

  const K = 12;
  const samples: Array<{ tau: number; t: number; hit: boolean }> = [];
  const targetKeys = new Set<string>();
  let hitCount = 0;
  let maxExt = 0;
  let minRawT = Infinity;

  for (let k = 0; k <= K; k++) {
    const tau = (k / K) * span;
    const [ox, oy] = localToWorld(frame, alongU ? fixedCoord : tau, alongU ? tau : fixedCoord);

    let bestT = Infinity;
    let bestTarget: MapItem | null = null;
    let bestEndCap = false;

    for (const o of candidates) {
      const hit = rayHitItemBody(ox, oy, dirX, dirY, -0.05, maxSleeve, o, shapeMap.get(o.key));
      if (hit && hit.t < bestT) {
        bestT = hit.t;
        bestTarget = o;
        bestEndCap = hit.hitEndCap;
      }
    }

    if (bestTarget && bestT <= maxSleeve) {
      let blocked = false;
      for (const uTile of blockingUnits) {
        if (rayHitItemBody(ox, oy, dirX, dirY, 0, bestT - 0.03, uTile)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        if (bestT < minRawT) minRawT = bestT;
        const otherInfo = shapeMap.get(bestTarget.key);
        const endToEndTilted =
          bestTarget.kind === 'corridor' &&
          Boolean(bestTarget.angle) &&
          otherInfo?.shape === 'straight' &&
          bestEndCap;
        const reach = endToEndTilted
          ? Math.max(0, bestT * 0.5 + (c.key < bestTarget.key ? 0.02 : 0))
          : Math.max(0, bestT + 0.02);
        samples.push({ tau, t: reach, hit: true });
        targetKeys.add(bestTarget.key);
        if (reach > maxExt) maxExt = reach;
        hitCount++;
        continue;
      }
    }
    samples.push({ tau, t: 0, hit: false });
  }

  if (hitCount < 2 || maxExt <= 0.03 || minRawT > connectThreshold) return null;

  // Virtual rotated rectangle covering just this extended sleeve band for neighbor edge clipping
  const extCenterOffset = isStart ? -maxExt * 0.5 : len + maxExt * 0.5;
  const [worldCx, worldCy] = localToWorld(
    frame,
    alongU ? extCenterOffset : c.w * 0.5,
    alongU ? c.h * 0.5 : extCenterOffset,
  );
  const vw = alongU ? maxExt : c.w;
  const vh = alongU ? c.h : maxExt;

  return {
    maxExt,
    dirX,
    dirY,
    virtualRect: {
      x: worldCx - vw * 0.5,
      y: worldCy - vh * 0.5,
      w: vw,
      h: vh,
      angle: c.angle,
    },
    targetKeys,
    samples,
  };
}

/**
 * Precomputes resolved shapes (`straight` | `circle`), inner/outer radii,
 * and tilted end-sleeves for all walkways on the floor.
 */
export function buildCorridorShapeMap(
  corridors: MapItem[],
  landmarks: MapItem[] = [],
  allItems?: MapItem[],
): Map<string, CorridorShapeInfo> {
  const map = new Map<string, CorridorShapeInfo>();
  const all = allItems ?? [...corridors, ...landmarks];
  const mergeNeighbors = corridors;

  for (const c of corridors) {
    const frame = getLocalTileFrame(c);
    let corrT = false;
    let corrR = false;
    let corrB = false;
    let corrL = false;

    for (const o of mergeNeighbors) {
      if (o.key === c.key) continue;
      if (isInsideCircleCorridorHole(c, o) || isInsideCircleCorridorHole(o, c)) continue;
      const { tHit, rHit, bHit, lHit } = clipFrameEdges(frame, c.w, c.h, o);
      if (tHit && o.kind === 'corridor') corrT = true;
      if (rHit && o.kind === 'corridor') corrR = true;
      if (bHit && o.kind === 'corridor') corrB = true;
      if (lHit && o.kind === 'corridor') corrL = true;
    }

    const mode = parseCorridorShapeMode(c.label);
    const innerHoleItems = all.filter((o) => o.key !== c.key && isInsideCircleCorridorHole(c, o));
    const hasInnerHoleItem = innerHoleItems.length > 0;
    const corrSideCount = Number(corrT) + Number(corrR) + Number(corrB) + Number(corrL);

    let shape: ResolvedCorridorShape = 'straight';
    if (mode === 'straight') {
      shape = 'straight';
    } else if (mode === 'circle') {
      shape = 'circle';
    } else {
      const minDim = Math.min(c.w, c.h);
      const maxDim = Math.max(c.w, c.h);
      const aspect = maxDim / Math.max(1, minDim);
      if (hasInnerHoleItem || (minDim >= 4 && aspect <= 1.45 && corrSideCount >= 3)) {
        shape = 'circle';
      }
    }

    const cx = c.w / 2;
    const cy = c.h / 2;
    const rxOut = c.w / 2;
    const ryOut = c.h / 2;
    let rxIn = 0;
    let ryIn = 0;
    let thetaStart = 0;
    let thetaEnd = 0;

    if (shape === 'circle') {
      const minDim = Math.min(c.w, c.h);
      const laneX = minDim <= 2 ? c.w / 2 : c.w >= 8 ? 2 : Math.min(c.w * 0.36, 1.65);
      const laneY = minDim <= 2 ? c.h / 2 : c.h >= 8 ? 2 : Math.min(c.h * 0.36, 1.65);
      rxIn = Math.max(0, c.w / 2 - laneX);
      ryIn = Math.max(0, c.h / 2 - laneY);
      if (hasInnerHoleItem) {
        let reqRx = 0;
        let reqRy = 0;
        for (const inner of innerHoleItems) {
          reqRx = Math.max(reqRx, cx - (inner.x - c.x), inner.x + inner.w - c.x - cx);
          reqRy = Math.max(reqRy, cy - (inner.y - c.y), inner.y + inner.h - c.y - cy);
        }
        rxIn = Math.min(Math.max(0.5, c.w / 2 - 1), Math.max(rxIn, reqRx));
        ryIn = Math.min(Math.max(0.5, c.h / 2 - 1), Math.max(ryIn, reqRy));
      }
      thetaStart = 0;
      thetaEnd = Math.PI * 2;
    }

    map.set(c.key, {
      mode,
      shape,
      frame,
      cx,
      cy,
      rxOut,
      ryOut,
      rxIn,
      ryIn,
      thetaStart,
      thetaEnd,
      startSleeve: null,
      endSleeve: null,
    });
  }

  // Pass 2: Compute auto-extending end-sleeves for tilted straight corridors reaching nearby neighbors
  const unitItems = all.filter((i) => i.kind === 'unit');
  for (const c of corridors) {
    const info = map.get(c.key);
    if (!info || info.shape !== 'straight' || !c.angle) continue;
    const alongU = c.w >= c.h;
    const len = alongU ? c.w : c.h;
    const span = alongU ? c.h : c.w;
    const reachPad = 0.5 + len * 0.25 + span * 1.5;
    const cBounds = rotatedVisualBounds(info.frame, c.w, reachPad);
    const candidates = mergeNeighbors.filter((o) => {
      if (o.key === c.key) return false;
      if (isInsideCircleCorridorHole(c, o) || isInsideCircleCorridorHole(o, c)) return false;
      const oBounds = o.angle ? rotatedVisualBounds(getLocalTileFrame(o), o.w, 0.2) : o;
      return rectsOverlap(cBounds, oBounds);
    });
    if (candidates.length === 0) continue;
    const nearbyUnits = unitItems.filter((u) => {
      const uBounds = u.angle ? rotatedVisualBounds(getLocalTileFrame(u), u.w, 0.2) : u;
      return rectsOverlap(cBounds, uBounds);
    });
    info.startSleeve = computeTiltedSleeve(c, info.frame, true, alongU, candidates, nearbyUnits, map);
    info.endSleeve = computeTiltedSleeve(c, info.frame, false, alongU, candidates, nearbyUnits, map);
  }

  return map;
}

function clipSegmentToCorridorBody(
  p0x: number,
  p0y: number,
  dx: number,
  dy: number,
  segLen: number,
  corridor: MapItem,
  info?: CorridorShapeInfo,
): Array<[number, number]> {
  const boxHit = clipSegmentToRotatedItem(p0x, p0y, dx, dy, segLen, corridor);
  if (!boxHit) return [];
  if (!info || info.shape === 'straight') return [boxHit];

  const [a, b] = boxHit;
  const steps = Math.max(12, Math.ceil((b - a) * 8));
  const dt = (b - a) / steps;
  const excesses: number[] = [];
  let minExcess = Infinity;

  for (let i = 0; i <= steps; i++) {
    const t = a + i * dt;
    const [u, v] = worldToLocal(info.frame, p0x + t * dx, p0y + t * dy);
    const ex = curvedRadialExcess(u, v, info);
    excesses.push(ex);
    if (ex < minExcess) minExcess = ex;
  }

  // Only open the edge if the tile actually touches the curved body (not just an empty corner)
  if (minExcess > 0.14) return [];

  const intervals: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = a + i * dt;
    if (excesses[i] <= CRESCENT_REACH) {
      if (runStart === null) runStart = t;
    } else if (runStart !== null) {
      const prevT = a + (i - 1) * dt;
      if (prevT - runStart > MIN_SHARED_EDGE) intervals.push([runStart, prevT]);
      runStart = null;
    }
  }
  if (runStart !== null && b - runStart > MIN_SHARED_EDGE) {
    intervals.push([runStart, b]);
  }
  return intervals;
}

function clipFrameEdgesToCorridor(
  ownerKey: string,
  frame: LocalTileFrame,
  w: number,
  h: number,
  corridor: MapItem,
  info?: CorridorShapeInfo,
) {
  const tHits = clipSegmentToCorridorBody(frame.tlx, frame.tly, frame.ux, frame.uy, w, corridor, info);
  const bHits = clipSegmentToCorridorBody(frame.blx, frame.bly, frame.ux, frame.uy, w, corridor, info);
  const lHits = clipSegmentToCorridorBody(frame.tlx, frame.tly, frame.vx, frame.vy, h, corridor, info);
  const rHits = clipSegmentToCorridorBody(frame.trx, frame.try_, frame.vx, frame.vy, h, corridor, info);

  // Also clip facing edges against any tilted straight corridor end-sleeve reaching `ownerKey`
  const applySleeve = (sleeve: TiltedEndSleeve | null | undefined) => {
    if (!sleeve || !sleeve.targetKeys.has(ownerKey)) return;
    const hits = clipFrameEdges(frame, w, h, sleeve.virtualRect);
    // Top outward normal = (-vx, -vy); Bottom = (vx, vy); Left = (-ux, -uy); Right = (ux, uy)
    if (hits.tHit && -(frame.vx * sleeve.dirX + frame.vy * sleeve.dirY) < -0.1) tHits.push(hits.tHit);
    if (hits.bHit && frame.vx * sleeve.dirX + frame.vy * sleeve.dirY < -0.1) bHits.push(hits.bHit);
    if (hits.lHit && -(frame.ux * sleeve.dirX + frame.uy * sleeve.dirY) < -0.1) lHits.push(hits.lHit);
    if (hits.rHit && frame.ux * sleeve.dirX + frame.uy * sleeve.dirY < -0.1) rHits.push(hits.rHit);
  };
  applySleeve(info?.startSleeve);
  applySleeve(info?.endSleeve);

  return { tHits, rHits, bHits, lHits };
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

function svgEllipseArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): string {
  const span = a1 - a0;
  if (span <= 1e-4 || rx <= 0.1 || ry <= 0.1) return '';
  const pt = (a: number) => `${(cx + rx * Math.cos(a)).toFixed(2)} ${(cy + ry * Math.sin(a)).toFixed(2)}`;
  if (span > Math.PI) {
    const mid = (a0 + a1) * 0.5;
    return `M ${pt(a0)} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 1 ${pt(mid)} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 1 ${pt(a1)}`;
  }
  return `M ${pt(a0)} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 1 ${pt(a1)}`;
}

function svgLine(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function svgRect(x: number, y: number, w: number, h: number): string {
  return `M ${x.toFixed(2)} ${y.toFixed(2)} H ${(x + w).toFixed(2)} V ${(y + h).toFixed(2)} H ${x.toFixed(2)} Z`;
}

export interface CorridorMergeData extends SharpCorners {
  mode: CorridorShapeMode;
  shape: ResolvedCorridorShape;
  fillPath: string | null;
  bridgePaths: string[];
  borderPaths: string[];
  centerlinePaths: string[];
}

function buildCurvedCorridorMergeData(
  it: MapItem,
  info: CorridorShapeInfo,
  others: MapItem[],
  landmarks: MapItem[],
  shapeMap: Map<string, CorridorShapeInfo>,
  cellPx: number,
): CorridorMergeData {
  const px = Math.max(1, cellPx);
  const cxPx = info.cx * px;
  const cyPx = info.cy * px;
  const rxOutPx = info.rxOut * px;
  const ryOutPx = info.ryOut * px;
  const rxInPx = info.rxIn * px;
  const ryInPx = info.ryIn * px;
  const hasInner = rxInPx > 0.8 && ryInPx > 0.8;

  const outerLoop = `M ${(cxPx - rxOutPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxOutPx.toFixed(2)} ${ryOutPx.toFixed(2)} 0 1 1 ${(cxPx + rxOutPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxOutPx.toFixed(2)} ${ryOutPx.toFixed(2)} 0 1 1 ${(cxPx - rxOutPx).toFixed(2)} ${cyPx.toFixed(2)} Z`;
  const innerLoop = hasInner
    ? ` M ${(cxPx - rxInPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxInPx.toFixed(2)} ${ryInPx.toFixed(2)} 0 1 0 ${(cxPx + rxInPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxInPx.toFixed(2)} ${ryInPx.toFixed(2)} 0 1 0 ${(cxPx - rxInPx).toFixed(2)} ${cyPx.toFixed(2)} Z`
    : '';
  const fillPath = outerLoop + innerLoop;

  // Filter neighbors that actually come within contact distance of the outer curved rim
  const allNeighbors = [...others, ...landmarks].filter(
    (o) => !isInsideCircleCorridorHole(it, o) && !isInsideCircleCorridorHole(o, it),
  );
  const sampleCount = 96;
  const totalSpan = info.thetaEnd - info.thetaStart;
  const dTheta = totalSpan / sampleCount;

  interface OuterSample {
    theta: number;
    u: number;
    v: number;
    nu: number;
    nv: number;
    wx: number;
    wy: number;
    wnx: number;
    wny: number;
  }
  const outerSamples: OuterSample[] = [];
  for (let i = 0; i <= sampleCount; i++) {
    const theta = info.thetaStart + i * dTheta;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const u = info.cx + info.rxOut * cosT;
    const v = info.cy + info.ryOut * sinT;
    const gx = cosT / Math.max(0.1, info.rxOut);
    const gy = sinT / Math.max(0.1, info.ryOut);
    const gLen = Math.hypot(gx, gy) || 1;
    const nu = gx / gLen;
    const nv = gy / gLen;
    const [wx, wy] = localToWorld(info.frame, u, v);
    outerSamples.push({
      theta,
      u,
      v,
      nu,
      nv,
      wx,
      wy,
      wnx: nu * info.frame.ux + nv * info.frame.vx,
      wny: nu * info.frame.uy + nv * info.frame.vy,
    });
  }

  // First pass: identify neighbors that genuinely touch the curved rim (min hit distance <= 0.14 cells).
  const connectedNeighbors = allNeighbors.filter((nb) => {
    const nbInfo = nb.kind === 'corridor' ? shapeMap.get(nb.key) : undefined;
    for (let i = 0; i <= sampleCount; i++) {
      const s = outerSamples[i];
      if (rayHitItemBody(s.wx, s.wy, s.wnx, s.wny, -0.15, 0.14, nb, nbInfo)) return true;
    }
    return false;
  });

  // Second pass: at each sample, cast outward ray up to CRESCENT_REACH against connectedNeighbors
  const hitData: Array<{
    hit: boolean;
    bridgeT: number;
    emitBridge: boolean;
    isCorridorHit: boolean;
  }> = outerSamples.map((s) => {
    let bestT = Infinity;
    let bestNb: MapItem | null = null;
    for (const nb of connectedNeighbors) {
      const nbInfo = nb.kind === 'corridor' ? shapeMap.get(nb.key) : undefined;
      const hit = rayHitItemBody(s.wx, s.wy, s.wnx, s.wny, -0.15, CRESCENT_REACH, nb, nbInfo);
      if (hit && hit.t < bestT) {
        bestT = hit.t;
        bestNb = nb;
      }
    }
    if (!bestNb) {
      return { hit: false, bridgeT: 0, emitBridge: false, isCorridorHit: false };
    }
    const nbInfo = bestNb.kind === 'corridor' ? shapeMap.get(bestNb.key) : undefined;
    const bothCurved = Boolean(nbInfo && nbInfo.shape !== 'straight');
    const emitBridge = !bothCurved || it.key < bestNb.key;
    return {
      hit: true,
      bridgeT: Math.max(0, bestT + 0.025),
      emitBridge,
      isCorridorHit: bestNb.kind === 'corridor',
    };
  });

  // Clear isolated single-sample hits (which cannot form a bridge polygon) so they never
  // punch a 1-sample gap out of the outer dotted border.
  for (let i = 0; i <= sampleCount; i++) {
    if (!hitData[i].hit) continue;
    const prevHit = i > 0 ? hitData[i - 1].hit : hitData[sampleCount - 1].hit;
    const nextHit = i < sampleCount ? hitData[i + 1].hit : hitData[1].hit;
    if (!prevHit && !nextHit) {
      hitData[i] = { hit: false, bridgeT: 0, emitBridge: false, isCorridorHit: false };
    }
  }

  const bridgePaths: string[] = [];
  const borderPaths: string[] = [];
  const centerlinePaths: string[] = [];

  // Emit outer border arcs on unhit intervals, starting immediately at outerSamples[i-1].theta
  // after any hit run [i0, i1] so there is zero gap between the bridge polygon and the border arc.
  const outBorderRx = Math.max(0.5, rxOutPx - 0.75);
  const outBorderRy = Math.max(0.5, ryOutPx - 0.75);
  let unhitStart: number | null = null;
  for (let i = 0; i <= sampleCount; i++) {
    if (!hitData[i].hit) {
      if (unhitStart === null) {
        unhitStart = i > 0 && hitData[i - 1].hit ? outerSamples[i - 1].theta : outerSamples[i].theta;
      }
    } else if (unhitStart !== null) {
      const d = svgEllipseArc(cxPx, cyPx, outBorderRx, outBorderRy, unhitStart, outerSamples[i].theta);
      if (d) borderPaths.push(d);
      unhitStart = null;
    }
  }
  if (unhitStart !== null) {
    const d = svgEllipseArc(cxPx, cyPx, outBorderRx, outBorderRy, unhitStart, info.thetaEnd);
    if (d) borderPaths.push(d);
  }

  // Emit crescent-sealing bridge polygons on contiguous hit intervals
  let runIdx: number | null = null;
  const flushBridgeRun = (i0: number, i1: number) => {
    if (i1 <= i0) return;
    if (!hitData.slice(i0, i1 + 1).some((h) => h.emitBridge && h.bridgeT > 0.005)) return;
    const innerPts: string[] = [];
    const outerPts: string[] = [];
    for (let k = i0; k <= i1; k++) {
      const s = outerSamples[k];
      const t = hitData[k].emitBridge ? hitData[k].bridgeT : 0;
      // Overlap 0.02 cells inward into the ellipse so there is never an anti-aliasing hairline seam
      const uxIn = (s.u - 0.02 * s.nu) * px;
      const vyIn = (s.v - 0.02 * s.nv) * px;
      const uxOut = (s.u + t * s.nu) * px;
      const vyOut = (s.v + t * s.nv) * px;
      innerPts.push(`${uxIn.toFixed(2)} ${vyIn.toFixed(2)}`);
      outerPts.push(`${uxOut.toFixed(2)} ${vyOut.toFixed(2)}`);
    }
    outerPts.reverse();
    bridgePaths.push(`M ${innerPts.join(' L ')} L ${outerPts.join(' L ')} Z`);
  };

  for (let i = 0; i <= sampleCount; i++) {
    if (hitData[i].hit) {
      if (runIdx === null) runIdx = i;
    } else if (runIdx !== null) {
      flushBridgeRun(runIdx, i - 1);
      runIdx = null;
    }
  }
  if (runIdx !== null) {
    flushBridgeRun(runIdx, sampleCount);
  }

  // Inner ring dotted border
  if (hasInner) {
    const innerBorder = svgEllipseArc(cxPx, cyPx, rxInPx + 0.75, ryInPx + 0.75, info.thetaStart, info.thetaEnd);
    if (innerBorder) borderPaths.push(innerBorder);
  }

  const rxMidPx = hasInner ? (rxOutPx + rxInPx) * 0.5 : rxOutPx * 0.58;
  const ryMidPx = hasInner ? (ryOutPx + ryInPx) * 0.5 : ryOutPx * 0.58;

  const ringCl = svgEllipseArc(cxPx, cyPx, rxMidPx, ryMidPx, 0, Math.PI * 2);
  if (ringCl) centerlinePaths.push(ringCl);

  // Emit short radial spoke centerlines connecting each touching corridor mouth into the ring centerline
  let cRun: number | null = null;
  const corridorRuns: Array<[number, number]> = [];
  for (let i = 0; i <= sampleCount; i++) {
    if (hitData[i].isCorridorHit) {
      if (cRun === null) cRun = i;
    } else if (cRun !== null) {
      corridorRuns.push([cRun, i - 1]);
      cRun = null;
    }
  }
  if (cRun !== null) corridorRuns.push([cRun, sampleCount]);
  // Merge wrap-around run at 0 / 2π if both ends touch the same corridor mouth
  if (
    corridorRuns.length >= 2 &&
    corridorRuns[0][0] === 0 &&
    corridorRuns[corridorRuns.length - 1][1] === sampleCount
  ) {
    const first = corridorRuns.shift()!;
    const last = corridorRuns.pop()!;
    corridorRuns.push([last[0], sampleCount + first[1]]);
  }
  for (const [r0, r1] of corridorRuns) {
    if (r1 - r0 < 1) continue;
    const midIdx = Math.round((r0 + r1) * 0.5) % sampleCount;
    const s = outerSamples[midIdx];
    const t = hitData[midIdx].bridgeT;
    const x0 = cxPx + rxMidPx * Math.cos(s.theta);
    const y0 = cyPx + ryMidPx * Math.sin(s.theta);
    const x1 = (s.u + t * s.nu) * px;
    const y1 = (s.v + t * s.nv) * px;
    centerlinePaths.push(svgLine(x0, y0, x1, y1));
  }

  return {
    mode: info.mode,
    shape: info.shape,
    fillPath,
    bridgePaths,
    borderPaths,
    centerlinePaths,
    tlSharp: false,
    trSharp: false,
    blSharp: false,
    brSharp: false,
  };
}

export function getCorridorMergeData(
  it: MapItem,
  corridors: MapItem[],
  landmarks: MapItem[] = [],
  allItems?: MapItem[],
  cellPx = 1,
  shapeMap?: Map<string, CorridorShapeInfo>,
): CorridorMergeData {
  const allCorridors = corridors.some((c) => c.key === it.key) ? corridors : [it, ...corridors];
  const resolvedShapes = shapeMap ?? buildCorridorShapeMap(allCorridors, landmarks, allItems);
  const info = resolvedShapes.get(it.key)!;
  const others = corridors.filter((c) => c.key !== it.key);

  if (info.shape !== 'straight') {
    return buildCurvedCorridorMergeData(it, info, others, [], resolvedShapes, cellPx);
  }

  const px = Math.max(1, cellPx);
  const wPx = it.w * px;
  const hPx = it.h * px;
  const frame = info.frame;

  const topTouched: Array<[number, number]> = [];
  const bottomTouched: Array<[number, number]> = [];
  const leftTouched: Array<[number, number]> = [];
  const rightTouched: Array<[number, number]> = [];
  const topCorridorBridges: Array<[number, number]> = [];
  const bottomCorridorBridges: Array<[number, number]> = [];
  const leftCorridorBridges: Array<[number, number]> = [];
  const rightCorridorBridges: Array<[number, number]> = [];

  for (const o of others) {
    if (isInsideCircleCorridorHole(o, it)) continue;
    const oInfo = resolvedShapes.get(o.key);
    const { tHits, rHits, bHits, lHits } = clipFrameEdgesToCorridor(it.key, frame, it.w, it.h, o, oInfo);
    topTouched.push(...tHits);
    rightTouched.push(...rHits);
    bottomTouched.push(...bHits);
    leftTouched.push(...lHits);

    // Curved corridors emit their own crescent bridges; straight-to-straight uses 3px seam sealers
    if (!oInfo || oInfo.shape === 'straight') {
      const tiltedPair = Boolean(it.angle || o.angle);
      const canonicalOwner = it.key < o.key;
      if (tiltedPair) {
        if (canonicalOwner) {
          topCorridorBridges.push(...tHits);
          rightCorridorBridges.push(...rHits);
          bottomCorridorBridges.push(...bHits);
          leftCorridorBridges.push(...lHits);
        }
      } else {
        bottomCorridorBridges.push(...bHits);
        rightCorridorBridges.push(...rHits);
      }
    }
  }

  const topAll = [...topTouched];
  const bottomAll = [...bottomTouched];
  const leftAll = [...leftTouched];
  const rightAll = [...rightTouched];

  const bridgePaths: string[] = [
    ...topCorridorBridges.map(([u1, u2]) => svgRect(u1 * px, -2, (u2 - u1) * px, 3)),
    ...bottomCorridorBridges.map(([u1, u2]) => svgRect(u1 * px, hPx - 1, (u2 - u1) * px, 3)),
    ...leftCorridorBridges.map(([v1, v2]) => svgRect(-2, v1 * px, 3, (v2 - v1) * px)),
    ...rightCorridorBridges.map(([v1, v2]) => svgRect(wPx - 1, v1 * px, 3, (v2 - v1) * px)),
  ];
  const extraBorders: string[] = [];
  const alongU = it.w >= it.h;
  let sleeveStartExt = 0;
  let sleeveEndExt = 0;

  // Emit polygon bridges, open end-cap borders, and extend side borders for tilted end-sleeves
  const emitSleeveGeometry = (sleeve: TiltedEndSleeve | null, isStart: boolean) => {
    if (!sleeve) return;
    const sign = isStart ? -1 : 1;
    const baseCoord = isStart ? 0 : alongU ? it.w : it.h;
    const samples = sleeve.samples;
    let run0: number | null = null;

    const flushSleeveRun = (i0: number, i1: number) => {
      if (i1 <= i0) return;
      const tau0 = samples[i0].tau;
      const tau1 = samples[i1].tau;
      if (alongU) {
        if (isStart) leftAll.push([tau0, tau1]);
        else rightAll.push([tau0, tau1]);
      } else {
        if (isStart) topAll.push([tau0, tau1]);
        else bottomAll.push([tau0, tau1]);
      }

      const pts: string[] = [];
      // Slightly tuck 0.02 cells into the corridor body to prevent anti-aliasing seams
      const innerCoord = (baseCoord - sign * 0.02) * px;
      if (alongU) {
        pts.push(`${innerCoord.toFixed(2)} ${(tau0 * px).toFixed(2)}`);
        for (let k = i0; k <= i1; k++) {
          pts.push(`${((baseCoord + sign * samples[k].t) * px).toFixed(2)} ${(samples[k].tau * px).toFixed(2)}`);
        }
        pts.push(`${innerCoord.toFixed(2)} ${(tau1 * px).toFixed(2)}`);
      } else {
        pts.push(`${(tau0 * px).toFixed(2)} ${innerCoord.toFixed(2)}`);
        for (let k = i0; k <= i1; k++) {
          pts.push(`${(samples[k].tau * px).toFixed(2)} ${((baseCoord + sign * samples[k].t) * px).toFixed(2)}`);
        }
        pts.push(`${(tau1 * px).toFixed(2)} ${innerCoord.toFixed(2)}`);
      }
      bridgePaths.push(`M ${pts.join(' L ')} Z`);

      if (i0 === 0 && samples[0].t > 0.03) {
        const extPx = (baseCoord + sign * samples[0].t) * px;
        extraBorders.push(
          alongU ? svgLine(baseCoord * px, 0.75, extPx, 0.75) : svgLine(0.75, baseCoord * px, 0.75, extPx),
        );
      }
      if (i1 === samples.length - 1 && samples[i1].t > 0.03) {
        const extPx = (baseCoord + sign * samples[i1].t) * px;
        extraBorders.push(
          alongU
            ? svgLine(baseCoord * px, hPx - 0.75, extPx, hPx - 0.75)
            : svgLine(wPx - 0.75, baseCoord * px, wPx - 0.75, extPx),
        );
      }
    };

    for (let i = 0; i < samples.length; i++) {
      if (samples[i].hit) {
        if (run0 === null) run0 = i;
      } else if (run0 !== null) {
        flushSleeveRun(run0, i - 1);
        run0 = null;
      }
    }
    if (run0 !== null) flushSleeveRun(run0, samples.length - 1);

    const midSample = samples[Math.floor(samples.length / 2)];
    const midExt = midSample?.hit ? midSample.t : sleeve.maxExt * 0.5;
    if (isStart) sleeveStartExt = midExt;
    else sleeveEndExt = midExt;
  };

  emitSleeveGeometry(info.startSleeve, true);
  emitSleeveGeometry(info.endSleeve, false);

  const vertical = it.angle ? it.h > it.w : isCorridorVertical(it, corridors);
  const mainPos = vertical ? it.y : it.x;
  const mainLen = vertical ? it.h : it.w;
  const mainEnd = mainPos + mainLen;
  const crossPos = vertical ? it.x : it.y;
  const crossEnd = crossPos + (vertical ? it.w : it.h);
  const startTouches = vertical ? topAll : leftAll;
  const endTouches = vertical ? bottomAll : rightAll;
  let start = 0.35;
  let end = mainLen - 0.35;

  if (!it.angle) {
    const oMainPos = (o: MapItem) => (vertical ? o.y : o.x);
    const oMainLen = (o: MapItem) => (vertical ? o.h : o.w);
    const oMainEnd = (o: MapItem) => oMainPos(o) + oMainLen(o);
    const oMainMid = (o: MapItem) => oMainPos(o) + oMainLen(o) / 2;
    const oCrossPos = (o: MapItem) => (vertical ? o.x : o.y);
    const oCrossEnd = (o: MapItem) => oCrossPos(o) + (vertical ? o.w : o.h);
    const overlapsCross = (o: MapItem) => Math.min(crossEnd, oCrossEnd(o)) > Math.max(crossPos, oCrossPos(o));
    const touchesCrossSide = (o: MapItem) =>
      (oCrossPos(o) < crossPos && oCrossEnd(o) >= crossPos) ||
      (oCrossPos(o) <= crossEnd && oCrossEnd(o) > crossEnd);
    const isStraightOther = (o: MapItem) => (resolvedShapes.get(o.key)?.shape ?? 'straight') === 'straight' && !o.angle;
    const isPerp = (o: MapItem) => isCorridorVertical(o, corridors) !== vertical;

    const startN = others.find(
      (o) => isStraightOther(o) && oMainPos(o) < mainPos && oMainEnd(o) >= mainPos && overlapsCross(o),
    );
    const startCorner =
      !startN &&
      others.find(
        (o) =>
          isStraightOther(o) &&
          isPerp(o) &&
          oMainPos(o) <= mainPos + 0.5 &&
          oMainEnd(o) > mainPos &&
          touchesCrossSide(o),
      );
    if (startN) start = isPerp(startN) ? oMainMid(startN) - mainPos : 0;
    else if (startCorner) start = oMainMid(startCorner) - mainPos;
    else if (startTouches.length > 0) start = 0;

    const endN = others.find(
      (o) => isStraightOther(o) && oMainPos(o) <= mainEnd && oMainEnd(o) > mainEnd && overlapsCross(o),
    );
    const endCorner =
      !endN &&
      others.find(
        (o) =>
          isStraightOther(o) &&
          isPerp(o) &&
          oMainPos(o) < mainEnd &&
          oMainEnd(o) >= mainEnd - 0.5 &&
          touchesCrossSide(o),
      );
    if (endN) end = isPerp(endN) ? oMainMid(endN) - mainPos : mainLen;
    else if (endCorner) end = oMainMid(endCorner) - mainPos;
    else if (endTouches.length > 0) end = mainLen;
  } else {
    if (sleeveStartExt > 0) start = -sleeveStartExt;
    else if (startTouches.length > 0) start = 0;
    if (sleeveEndExt > 0) end = mainLen + sleeveEndExt;
    else if (endTouches.length > 0) end = mainLen;
  }

  const borderPaths: string[] = [
    ...subtractIntervals(it.w, topAll).map(([u1, u2]) => svgLine(u1 * px, 0.75, u2 * px, 0.75)),
    ...subtractIntervals(it.w, bottomAll).map(([u1, u2]) => svgLine(u1 * px, hPx - 0.75, u2 * px, hPx - 0.75)),
    ...subtractIntervals(it.h, leftAll).map(([v1, v2]) => svgLine(0.75, v1 * px, 0.75, v2 * px)),
    ...subtractIntervals(it.h, rightAll).map(([v1, v2]) => svgLine(wPx - 0.75, v1 * px, wPx - 0.75, v2 * px)),
    ...extraBorders,
  ];

  const clX1 = vertical ? wPx * 0.5 : start * px + (start < 0 ? -1 : 0);
  const clY1 = vertical ? start * px + (start < 0 ? -1 : 0) : hPx * 0.5;
  const clX2 = vertical ? wPx * 0.5 : end * px + (end > it.w ? 1 : 0);
  const clY2 = vertical ? end * px + (end > it.h ? 1 : 0) : hPx * 0.5;

  return {
    mode: info.mode,
    shape: 'straight',
    fillPath: null,
    bridgePaths,
    borderPaths,
    centerlinePaths: [svgLine(clX1, clY1, clX2, clY2)],
    ...computeSharpCorners(it.w, it.h, topAll, rightAll, bottomAll, leftAll),
  };
}

export interface UnitMergeData extends EdgeMergeGeometry {
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
  return {
    spc: Number(planData?.sqftPerCell) || DEFAULT_SQFT_PER_CELL,
    cols: Number(planData?.columns) || DEFAULT_COLUMNS,
    saved: Array.isArray(planData?.items) ? planData.items : [],
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


