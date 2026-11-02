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

export type CorridorShapeMode = 'auto' | 'straight' | 'circle' | 'arc';
export type ResolvedCorridorShape = 'straight' | 'circle' | 'arc';
export type ArcQuadrant = 'bl' | 'tl' | 'tr' | 'br';

export const CORRIDOR_SHAPE_LABELS: Record<CorridorShapeMode, string> = {
  auto: 'Auto',
  straight: 'Straight',
  circle: 'Circle Ring',
  arc: 'Curved Arc',
};

export function parseCorridorShapeMode(label: string | null | undefined): CorridorShapeMode {
  if (label === 'walkway:straight') return 'straight';
  if (label === 'walkway:circle') return 'circle';
  if (label === 'walkway:arc') return 'arc';
  return 'auto';
}

export function encodeCorridorShapeMode(mode: CorridorShapeMode): string {
  if (mode === 'straight') return 'walkway:straight';
  if (mode === 'circle') return 'walkway:circle';
  if (mode === 'arc') return 'walkway:arc';
  return 'Walkway';
}

export function nextCorridorShapeMode(mode: CorridorShapeMode): CorridorShapeMode {
  if (mode === 'auto') return 'straight';
  if (mode === 'straight') return 'circle';
  if (mode === 'circle') return 'arc';
  return 'auto';
}

export function isCircleAtrium(it: { kind: TileKind | string; label?: string | null }): boolean {
  return it.kind === 'atrium' && parseLandmarkMeta('atrium', it.label).isCircle;
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
  if (isMergedUnit) return 'rect';
  if (it.label === 'unit:circle') return 'circle';
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
    topSegs: Array<[number, number]>;
    rightSegs: Array<[number, number]>;
    bottomSegs: Array<[number, number]>;
    leftSegs: Array<[number, number]>;
    groupBounds?: { minX: number; minY: number; spanW: number; spanH: number };
  } | null,
  tile?: { x: number; y: number; w: number; h: number } | null,
  allItems?: ReadonlyArray<{ kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number }> | null,
): TrapezoidUnitGeometry {
  if (mode === 'ring-curve' || mode === 'trapezoid-ring') {
    const it = tile ?? { x: 0, y: 0, w: Math.max(1, Math.round(wPx / Math.max(1, cellPx))), h: Math.max(1, Math.round(hPx / Math.max(1, cellPx))) };
    const rings = (allItems ?? []).filter(
      (c) =>
        c.kind === 'corridor' &&
        c.w >= 4 &&
        c.h >= 4 &&
        c.label !== 'walkway:straight' &&
        c.label !== 'walkway:arc',
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
          insideHole = isInsideCircleCorridorHole(r, it);
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
      if (facingEdge === 'bottom' && merge?.bottomMerged && !merge?.topMerged) facingEdge = 'top';
      else if (facingEdge === 'top' && merge?.topMerged && !merge?.bottomMerged) facingEdge = 'bottom';
    } else {
      facingEdge = dx >= 0 ? 'right' : 'left';
      if (facingEdge === 'right' && merge?.rightMerged && !merge?.leftMerged) facingEdge = 'left';
      else if (facingEdge === 'left' && merge?.leftMerged && !merge?.rightMerged) facingEdge = 'right';
    }

    const taper = mode === 'trapezoid-ring' ? 0.18 : 0;
    const maxDepthFrac = 0.28;
    const N = 18;

    const computeArchNorm = (t: number): number => {
      if (facingEdge === 'bottom' || facingEdge === 'top') {
        const u = taper + t * (1 - 2 * taper);
        const gx = it.x + u * it.w;
        const gMinX = merge?.hasMerge && merge.groupBounds ? merge.groupBounds.minX : it.x + taper * it.w;
        const gMaxX =
          merge?.hasMerge && merge.groupBounds
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
        const gMinY = merge?.hasMerge && merge.groupBounds ? merge.groupBounds.minY : it.y + taper * it.h;
        const gMaxY =
          merge?.hasMerge && merge.groupBounds
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

  if (merge?.topMerged && !merge?.bottomMerged) {
    // Attached below a sibling block: Top edge is 100% wide base, Bottom edge is tapered
    const blX = mode === 'trapezoid' ? symInset : mode === 'trapezoid-l' ? sideInset : 0;
    const brX = mode === 'trapezoid' ? 1 - symInset : mode === 'trapezoid-r' ? 1 - sideInset : 1;
    tl = { x: 0, y: 0 };
    tr = { x: 1, y: 0 };
    br = { x: brX, y: 1 };
    bl = { x: blX, y: 1 };
  } else if (merge?.leftMerged && !merge?.rightMerged && !merge?.topMerged && !merge?.bottomMerged) {
    // Attached to right of a sibling block: Left edge is 100% wide base, Right edge is tapered
    const trY = mode === 'trapezoid' ? symInset : mode === 'trapezoid-l' ? sideInset : 0;
    const brY = mode === 'trapezoid' ? 1 - symInset : mode === 'trapezoid-r' ? 1 - sideInset : 1;
    tl = { x: 0, y: 0 };
    tr = { x: 1, y: trY };
    br = { x: 1, y: brY };
    bl = { x: 0, y: 1 };
  } else if (merge?.rightMerged && !merge?.leftMerged && !merge?.topMerged && !merge?.bottomMerged) {
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

  // Top edge (rim)
  if (merge?.topMerged) {
    for (const [u1, u2] of merge.topSegs) {
      rimParts.push(`M ${(u1 * cellPx).toFixed(1)} 0.5 L ${(u2 * cellPx).toFixed(1)} 0.5`);
    }
  } else {
    rimParts.push(`M ${pTL.x.toFixed(1)} ${(pTL.y + 0.5).toFixed(1)} L ${pTR.x.toFixed(1)} ${(pTR.y + 0.5).toFixed(1)}`);
  }

  // Left edge (rim)
  if (merge?.leftMerged) {
    for (const [v1, v2] of merge.leftSegs) {
      rimParts.push(`M 0.5 ${(v1 * cellPx).toFixed(1)} L 0.5 ${(v2 * cellPx).toFixed(1)}`);
    }
  } else {
    rimParts.push(`M ${(pBL.x + 0.5).toFixed(1)} ${pBL.y.toFixed(1)} L ${(pTL.x + 0.5).toFixed(1)} ${pTL.y.toFixed(1)}`);
  }

  // Right edge (lip-r)
  if (merge?.rightMerged) {
    for (const [v1, v2] of merge.rightSegs) {
      lipRightParts.push(`M ${(wPx - 1).toFixed(1)} ${(v1 * cellPx).toFixed(1)} L ${(wPx - 1).toFixed(1)} ${(v2 * cellPx).toFixed(1)}`);
    }
  } else {
    lipRightParts.push(`M ${(pTR.x - 1).toFixed(1)} ${pTR.y.toFixed(1)} L ${(pBR.x - 1).toFixed(1)} ${pBR.y.toFixed(1)}`);
  }

  // Bottom edge (lip-b)
  if (merge?.bottomMerged) {
    for (const [u1, u2] of merge.bottomSegs) {
      lipBottomParts.push(`M ${(u1 * cellPx).toFixed(1)} ${(hPx - 1.5).toFixed(1)} L ${(u2 * cellPx).toFixed(1)} ${(hPx - 1.5).toFixed(1)}`);
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
    const edgeSeg = `M ${v0.x.toFixed(1)} ${v0.y.toFixed(1)} L ${v1.x.toFixed(1)} ${v1.y.toFixed(1)}`;
    if (Math.cos(midTheta) + Math.sin(midTheta) <= 0.1) {
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
 * (`w >= 4, h >= 4` and not forced to `straight` or `arc`). Matches server `saveFloorPlan` overlap validation.
 */
function isInsideCircleCorridorHole(
  outer: { kind: TileKind | string; label?: string | null; x: number; y: number; w: number; h: number },
  inner: { x: number; y: number; w: number; h: number },
): boolean {
  if (outer.kind !== 'corridor') return false;
  if (outer.label === 'walkway:straight' || outer.label === 'walkway:arc') return false;
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

export function tilesConflict(a: MapItem, b: MapItem): boolean {
  return (
    rectsOverlap(a, b) &&
    !isInsideCircleCorridorHole(a, b) &&
    !isInsideCircleCorridorHole(b, a) &&
    !isAtriumTransitOverlap(a, b)
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
  const candidates: Array<{ x: number; y: number; dist: number }> = [];

  for (const sib of overlappingSiblings) {
    const clampX = Math.max(0, Math.min(columns - w, Math.max(sib.x - w + 1, Math.min(moved.x, sib.x + sib.w - 1))));
    const clampY = Math.max(0, Math.max(sib.y - h + 1, Math.min(moved.y, sib.y + sib.h - 1)));
    const rawSpots: Array<[number, number]> = [
      [sib.x + sib.w, clampY], // Right border
      [sib.x - w, clampY],     // Left border
      [clampX, sib.y + sib.h], // Bottom border
      [clampX, sib.y - h],     // Top border
    ];
    for (const [cx, cy] of rawSpots) {
      if (cx < 0 || cy < 0 || cx + w > columns) continue;
      const cand: MapItem = { ...moved, x: cx, y: cy, w, h };
      if (!others.some((o) => tilesConflict(cand, o))) {
        candidates.push({ x: cx, y: cy, dist: Math.hypot(cx - moved.x, cy - moved.y) });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  return { ...moved, x: candidates[0].x, y: candidates[0].y, w, h };
}

/**
 * If a dragged/resized unit block `moved` overlaps another block of the SAME unit,
 * snaps `moved` to the nearest conflict-free position directly touching one of the 4 borders
 * (Top, Right, Bottom, Left) of that sibling block so they merge cleanly.
 */
export function snapUnitBlockToBorder(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  if (moved.kind !== 'unit' || !moved.unitId) return null;
  const siblings = items.filter((i) => i.key !== moved.key && i.kind === 'unit' && i.unitId === moved.unitId);
  return snapBlockToSiblingsBorder(moved, siblings, items, columns);
}

/**
 * When a dragged/resized transit tile (`stairs` or `escalator`) overlaps another transit tile,
 * snaps it to the nearest conflict-free border (Right, Left, Bottom, Top) of that transit tile
 * so multiple Elevators, Escalators, Lifts, and Stairs merge side-by-side cleanly (inside or outside an Atrium).
 */
export function snapTransitBlockToBorder(
  moved: MapItem,
  items: ReadonlyArray<MapItem>,
  columns: number,
): MapItem | null {
  if (!isTransitLandmark(moved.kind)) return null;
  const siblings = items.filter((i) => i.key !== moved.key && isTransitLandmark(i.kind));
  return snapBlockToSiblingsBorder(moved, siblings, items, columns);
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

export interface WalkwayRouteResult {
  /** Waypoints in grid coordinates (0..columns, 0..rows). Multiply by cellPx for SVG pixels. */
  points: Array<{ x: number; y: number }>;
  /** Estimated walking distance in feet */
  distanceFeet: number;
  /** Estimated walking distance in meters */
  distanceMeters: number;
  /** Estimated walking time in minutes */
  estimatedMinutes: number;
}

/**
 * Computes an indoor walking path from `fromItem` to `toItem` that follows
 * `corridor` (Walkway) centerlines — including 15°-tilted straight walkways,
 * hollow circular ring roundabouts, and 90° curved corner arcs — while avoiding shop units.
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
  const landmarks = items.filter((i) => isMergeableLandmark(i.kind));
  const nonCorridors = items.filter((i) => i.kind !== 'corridor');
  const shapeMap = buildCorridorShapeMap(corridors, landmarks, items);
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

      // Check corridor bodies (straight + sleeves, circle ring bands, curved 90° arcs)
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
          // Circle ring or 90° curved arc (pad band slightly by 0.32 cells so narrow curved bands stay connected)
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

  return {
    points: simplified,
    distanceFeet,
    distanceMeters,
    estimatedMinutes,
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

/** All non-unit, non-walkway tiles (Restroom, Exit, Entrance, Stairs, Elevator, Atrium, You Are Here) merge when touching a walkway. */
export function isMergeableLandmark(kind: TileKind): boolean {
  return kind !== 'unit' && kind !== 'corridor';
}

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

function clipFrameEdges(
  frame: LocalTileFrame,
  w: number,
  h: number,
  target: { x: number; y: number; w: number; h: number; angle?: number },
) {
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
  quadrant: ArcQuadrant;
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

function clampArcInnerRadius(val: number, span: number): number {
  const nearestHalf = Math.round(val * 2) / 2;
  const snapped = Math.abs(val - nearestHalf) <= EDGE_EPS * 1.5 ? nearestHalf : val;
  if (snapped <= 0.08) return 0;
  return Math.max(0, Math.min(span - 0.8, snapped));
}

function clampArcOuterRadius(val: number, span: number): number {
  const nearestHalf = Math.round(val * 2) / 2;
  const snapped = Math.abs(val - nearestHalf) <= EDGE_EPS * 1.5 ? nearestHalf : val;
  if (span - snapped <= 0.15) return span;
  return Math.max(Math.min(span, 1.2), Math.min(span, snapped));
}

function curvedRadialExcess(u: number, v: number, info: CorridorShapeInfo): number {
  if (info.shape === 'arc') {
    if ((info.quadrant === 'bl' || info.quadrant === 'tl') && u < -CRESCENT_REACH) return Infinity;
    if ((info.quadrant === 'tr' || info.quadrant === 'br') && u > info.rxOut + CRESCENT_REACH) return Infinity;
    if ((info.quadrant === 'tl' || info.quadrant === 'tr') && v < -CRESCENT_REACH) return Infinity;
    if ((info.quadrant === 'bl' || info.quadrant === 'br') && v > info.ryOut + CRESCENT_REACH) return Infinity;
  }
  const du = u - info.cx;
  const dv = v - info.cy;
  const normOut = Math.hypot(du / Math.max(0.1, info.rxOut), dv / Math.max(0.1, info.ryOut));
  if (info.rxIn > 0.25 && info.ryIn > 0.25) {
    const normIn = Math.hypot(du / info.rxIn, dv / info.ryIn);
    if (normIn < 0.96) return Infinity;
  } else if (info.shape === 'arc') {
    if (info.rxIn > 0.25 && Math.abs(du) < info.rxIn * 0.96 && Math.abs(dv) <= EDGE_EPS * 2) return Infinity;
    if (info.ryIn > 0.25 && Math.abs(dv) < info.ryIn * 0.96 && Math.abs(du) <= EDGE_EPS * 2) return Infinity;
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
 * Precomputes resolved shapes (`straight` | `circle` | `arc`), inner/outer radii,
 * and tilted end-sleeves for all walkways on the floor.
 */
export function buildCorridorShapeMap(
  corridors: MapItem[],
  landmarks: MapItem[] = [],
  allItems?: MapItem[],
): Map<string, CorridorShapeInfo> {
  const map = new Map<string, CorridorShapeInfo>();
  const all = allItems ?? [...corridors, ...landmarks];
  const mergeNeighbors = [...corridors, ...landmarks];

  for (const c of corridors) {
    const frame = getLocalTileFrame(c);
    const topRaw: Array<[number, number]> = [];
    const rightRaw: Array<[number, number]> = [];
    const bottomRaw: Array<[number, number]> = [];
    const leftRaw: Array<[number, number]> = [];

    for (const o of mergeNeighbors) {
      if (o.key === c.key) continue;
      if (isInsideCircleCorridorHole(c, o) || isInsideCircleCorridorHole(o, c)) continue;
      const { tHit, rHit, bHit, lHit } = clipFrameEdges(frame, c.w, c.h, o);
      if (tHit) topRaw.push(tHit);
      if (rHit) rightRaw.push(rHit);
      if (bHit) bottomRaw.push(bHit);
      if (lHit) leftRaw.push(lHit);
    }

    const mode = parseCorridorShapeMode(c.label);
    const innerHoleItems = all.filter((o) => o.key !== c.key && isInsideCircleCorridorHole(c, o));
    const hasInnerHoleItem = innerHoleItems.length > 0;
    const hasT = topRaw.length > 0;
    const hasR = rightRaw.length > 0;
    const hasB = bottomRaw.length > 0;
    const hasL = leftRaw.length > 0;
    const sideCount = Number(hasT) + Number(hasR) + Number(hasB) + Number(hasL);

    const sumLen = (arr: Array<[number, number]>) => arr.reduce((acc, [a, b]) => acc + Math.max(0, b - a), 0);
    const tLen = sumLen(topRaw);
    const rLen = sumLen(rightRaw);
    const bLen = sumLen(bottomRaw);
    const lLen = sumLen(leftRaw);

    let perpQuadrant: ArcQuadrant | null = null;
    if (sideCount >= 2) {
      const pairs: Array<{ q: ArcQuadrant; both: number; score: number }> = [
        { q: 'bl', both: Number(hasL && hasB), score: lLen + bLen },
        { q: 'tl', both: Number(hasT && hasL), score: tLen + lLen },
        { q: 'tr', both: Number(hasR && hasT), score: rLen + tLen },
        { q: 'br', both: Number(hasB && hasR), score: bLen + rLen },
      ];
      pairs.sort((a, b) => b.both - a.both || b.score - a.score);
      if (pairs[0].both > 0) perpQuadrant = pairs[0].q;
    }

    const pickSingleSideQuadrant = (): ArcQuadrant => {
      if (hasL) {
        const minV = Math.min(...leftRaw.map(([a]) => a));
        const maxV = Math.max(...leftRaw.map(([, b]) => b));
        return minV >= c.h * 0.35 && maxV > c.h * 0.65 ? 'tl' : 'bl';
      }
      if (hasR) {
        const minV = Math.min(...rightRaw.map(([a]) => a));
        const maxV = Math.max(...rightRaw.map(([, b]) => b));
        return maxV <= c.h * 0.65 && minV < c.h * 0.35 ? 'br' : 'tr';
      }
      if (hasT) {
        const minU = Math.min(...topRaw.map(([a]) => a));
        const maxU = Math.max(...topRaw.map(([, b]) => b));
        return maxU <= c.w * 0.65 && minU < c.w * 0.35 ? 'tr' : 'tl';
      }
      if (hasB) {
        const minU = Math.min(...bottomRaw.map(([a]) => a));
        const maxU = Math.max(...bottomRaw.map(([, b]) => b));
        return maxU <= c.w * 0.65 && minU < c.w * 0.35 ? 'br' : 'bl';
      }
      return 'bl';
    };

    let shape: ResolvedCorridorShape = 'straight';
    let quadrant: ArcQuadrant = 'bl';

    if (mode === 'straight') {
      shape = 'straight';
    } else if (mode === 'circle') {
      shape = 'circle';
    } else if (mode === 'arc') {
      shape = 'arc';
      quadrant = perpQuadrant ?? pickSingleSideQuadrant();
    } else {
      const minDim = Math.min(c.w, c.h);
      const maxDim = Math.max(c.w, c.h);
      const aspect = maxDim / Math.max(1, minDim);
      if (hasInnerHoleItem || (minDim >= 4 && aspect <= 1.45 && sideCount >= 3)) {
        shape = 'circle';
      } else if (minDim >= 3 && aspect <= 1.75 && sideCount === 2 && perpQuadrant) {
        shape = 'arc';
        quadrant = perpQuadrant;
      }
    }

    let cx = c.w / 2;
    let cy = c.h / 2;
    let rxOut = c.w / 2;
    let ryOut = c.h / 2;
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
    } else if (shape === 'arc') {
      rxOut = c.w;
      ryOut = c.h;
      const defRxIn = c.w >= 3 ? Math.max(0.8, c.w - Math.min(2.5, Math.max(1.5, c.w * 0.45))) : c.w * 0.35;
      const defRyIn = c.h >= 3 ? Math.max(0.8, c.h - Math.min(2.5, Math.max(1.5, c.h * 0.45))) : c.h * 0.35;

      const computeAxisRadii = (
        raw: Array<[number, number]>,
        span: number,
        fromZero: boolean,
        defIn: number,
      ): { rOut: number; rIn: number; touched: boolean } => {
        if (raw.length === 0) {
          return { rOut: span, rIn: defIn, touched: false };
        }
        const rMins = raw.map(([a, b]) => (fromZero ? a : span - b));
        const rMaxs = raw.map(([a, b]) => (fromZero ? b : span - a));
        const rMin = Math.max(0, Math.min(...rMins));
        const rMax = Math.min(span, Math.max(...rMaxs));
        const rOut = clampArcOuterRadius(rMax, span);
        const rIn = clampArcInnerRadius(rMin, rOut);
        return { rOut, rIn, touched: true };
      };

      let xRad: { rOut: number; rIn: number; touched: boolean };
      let yRad: { rOut: number; rIn: number; touched: boolean };

      if (quadrant === 'bl') {
        cx = 0;
        cy = c.h;
        thetaStart = -Math.PI / 2;
        thetaEnd = 0;
        yRad = computeAxisRadii(leftRaw, c.h, false, defRyIn);
        xRad = computeAxisRadii(bottomRaw, c.w, true, defRxIn);
      } else if (quadrant === 'tl') {
        cx = 0;
        cy = 0;
        thetaStart = 0;
        thetaEnd = Math.PI / 2;
        xRad = computeAxisRadii(topRaw, c.w, true, defRxIn);
        yRad = computeAxisRadii(leftRaw, c.h, true, defRyIn);
      } else if (quadrant === 'tr') {
        cx = c.w;
        cy = 0;
        thetaStart = Math.PI / 2;
        thetaEnd = Math.PI;
        yRad = computeAxisRadii(rightRaw, c.h, true, defRyIn);
        xRad = computeAxisRadii(topRaw, c.w, false, defRxIn);
      } else {
        cx = c.w;
        cy = c.h;
        thetaStart = Math.PI;
        thetaEnd = (3 * Math.PI) / 2;
        xRad = computeAxisRadii(bottomRaw, c.w, false, defRxIn);
        yRad = computeAxisRadii(rightRaw, c.h, false, defRyIn);
      }

      rxOut = xRad.rOut;
      rxIn = xRad.rIn;
      ryOut = yRad.rOut;
      ryIn = yRad.rIn;

      // When only one mouth is connected, match the unconnected mouth's lane width to the connected mouth
      if (xRad.touched && !yRad.touched) {
        const lane = Math.max(1, rxOut - rxIn);
        ryIn = clampArcInnerRadius(ryOut - Math.min(ryOut, lane), ryOut);
      } else if (yRad.touched && !xRad.touched) {
        const lane = Math.max(1, ryOut - ryIn);
        rxIn = clampArcInnerRadius(rxOut - Math.min(rxOut, lane), rxOut);
      }
    }

    map.set(c.key, {
      mode,
      shape,
      quadrant,
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

function getArcMouthIntervals(
  corridor: { w: number; h: number },
  info: CorridorShapeInfo,
): {
  top: [number, number] | null;
  right: [number, number] | null;
  bottom: [number, number] | null;
  left: [number, number] | null;
} {
  if (info.quadrant === 'bl') {
    return {
      top: null,
      right: null,
      left: [corridor.h - info.ryOut, corridor.h - info.ryIn],
      bottom: [info.rxIn, info.rxOut],
    };
  }
  if (info.quadrant === 'tl') {
    return {
      top: [info.rxIn, info.rxOut],
      left: [info.ryIn, info.ryOut],
      right: null,
      bottom: null,
    };
  }
  if (info.quadrant === 'tr') {
    return {
      top: [corridor.w - info.rxOut, corridor.w - info.rxIn],
      right: [info.ryIn, info.ryOut],
      bottom: null,
      left: null,
    };
  }
  return {
    top: null,
    left: null,
    bottom: [corridor.w - info.rxOut, corridor.w - info.rxIn],
    right: [corridor.h - info.ryOut, corridor.h - info.ryIn],
  };
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

  // When clipping a neighbor edge against one of the straight mouth edges of a 90° Curved Arc,
  // intersect analytically with the exact mouth interval [m0, m1] so seam openings match 1:1.
  if (info.shape === 'arc') {
    const [uA, vA] = worldToLocal(info.frame, p0x + a * dx, p0y + a * dy);
    const [uB, vB] = worldToLocal(info.frame, p0x + b * dx, p0y + b * dy);
    const mouths = getArcMouthIntervals(corridor, info);
    const mapMouthRange = (cA: number, cB: number, mouth: [number, number] | null): Array<[number, number]> => {
      if (!mouth) return [];
      const segMin = Math.min(cA, cB);
      const segMax = Math.max(cA, cB);
      const lo = Math.max(segMin, mouth[0]);
      const hi = Math.min(segMax, mouth[1]);
      if (hi - lo <= MIN_SHARED_EDGE) return [];
      const spanC = Math.abs(cB - cA);
      if (spanC <= 1e-6) return [[a, b]];
      const t0 = a + ((lo - segMin) / spanC) * (b - a);
      const t1 = a + ((hi - segMin) / spanC) * (b - a);
      return t1 - t0 > MIN_SHARED_EDGE ? [[t0, t1]] : [];
    };

    if (Math.abs(uA) <= EDGE_EPS * 2 && Math.abs(uB) <= EDGE_EPS * 2 && mouths.left) {
      return mapMouthRange(vA, vB, mouths.left);
    }
    if (Math.abs(uA - corridor.w) <= EDGE_EPS * 2 && Math.abs(uB - corridor.w) <= EDGE_EPS * 2 && mouths.right) {
      return mapMouthRange(vA, vB, mouths.right);
    }
    if (Math.abs(vA) <= EDGE_EPS * 2 && Math.abs(vB) <= EDGE_EPS * 2 && mouths.top) {
      return mapMouthRange(uA, uB, mouths.top);
    }
    if (Math.abs(vA - corridor.h) <= EDGE_EPS * 2 && Math.abs(vB - corridor.h) <= EDGE_EPS * 2 && mouths.bottom) {
      return mapMouthRange(uA, uB, mouths.bottom);
    }
  }

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

/**
 * Computes which local CSS edges and corners of a landmark tile touch or intersect
 * any walkway (`corridor`) tile, accounting for rotation and curved circle/arc walkways.
 */
export function getLandmarkMergeData(
  it: MapItem,
  corridors: MapItem[],
  shapeMap?: Map<string, CorridorShapeInfo>,
  allItems?: ReadonlyArray<MapItem>,
): EdgeMergeGeometry {
  const lmMeta = it.kind !== 'unit' && it.kind !== 'corridor' ? parseLandmarkMeta(it.kind, it.label) : null;
  if (isCircleAtrium(it) || lmMeta?.isCircle || lmMeta?.polygonFaces) {
    return buildEdgeMergeGeometry(it.w, it.h, [], [], [], []);
  }
  const resolvedShapes = shapeMap ?? buildCorridorShapeMap(corridors, [it]);
  const topTouched: Array<[number, number]> = [];
  const rightTouched: Array<[number, number]> = [];
  const bottomTouched: Array<[number, number]> = [];
  const leftTouched: Array<[number, number]> = [];
  const frame = getLocalTileFrame(it);

  if (!it.angle) {
    for (const c of corridors) {
      // Keep a crisp 360° border on an island Atrium/marker placed inside a hollow circle walkway hole
      if (isInsideCircleCorridorHole(c, it)) continue;
      const { tHits, rHits, bHits, lHits } = clipFrameEdgesToCorridor(
        it.key,
        frame,
        it.w,
        it.h,
        c,
        resolvedShapes.get(c.key),
      );
      topTouched.push(...tHits);
      rightTouched.push(...rHits);
      bottomTouched.push(...bHits);
      leftTouched.push(...lHits);
    }
  }

  // Also merge touching borders between Elevator / Escalator / Lift ('escalator'), Stairs ('stairs'), and Atrium ('atrium')
  if (allItems && (it.kind === 'atrium' || isTransitLandmark(it.kind))) {
    const strictlyInside = (
      inner: { x: number; y: number; w: number; h: number },
      outer: { x: number; y: number; w: number; h: number },
    ) =>
      inner.x >= outer.x + 1 &&
      inner.x + inner.w <= outer.x + outer.w - 1 &&
      inner.y >= outer.y + 1 &&
      inner.y + inner.h <= outer.y + outer.h - 1;

    for (const o of allItems) {
      if (o.key === it.key) continue;
      if (o.kind !== 'atrium' && !isTransitLandmark(o.kind)) continue;
      const oMeta = parseLandmarkMeta(o.kind, o.label);
      if (isCircleAtrium(o) || oMeta.isCircle || oMeta.polygonFaces) continue;
      if (strictlyInside(it, o) || strictlyInside(o, it)) continue;
      const hits = clipFrameEdges(frame, it.w, it.h, o);
      if (hits.tHit) topTouched.push(hits.tHit);
      if (hits.rHit) rightTouched.push(hits.rHit);
      if (hits.bHit) bottomTouched.push(hits.bHit);
      if (hits.lHit) leftTouched.push(hits.lHit);
    }
  }

  return buildEdgeMergeGeometry(it.w, it.h, topTouched, rightTouched, bottomTouched, leftTouched);
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
  const wPx = it.w * px;
  const hPx = it.h * px;
  const cxPx = info.cx * px;
  const cyPx = info.cy * px;
  const rxOutPx = info.rxOut * px;
  const ryOutPx = info.ryOut * px;
  const rxInPx = info.rxIn * px;
  const ryInPx = info.ryIn * px;
  const hasInner = rxInPx > 0.8 && ryInPx > 0.8;

  let fillPath: string;
  if (info.shape === 'circle') {
    const outerLoop = `M ${(cxPx - rxOutPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxOutPx.toFixed(2)} ${ryOutPx.toFixed(2)} 0 1 1 ${(cxPx + rxOutPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxOutPx.toFixed(2)} ${ryOutPx.toFixed(2)} 0 1 1 ${(cxPx - rxOutPx).toFixed(2)} ${cyPx.toFixed(2)} Z`;
    const innerLoop = hasInner
      ? ` M ${(cxPx - rxInPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxInPx.toFixed(2)} ${ryInPx.toFixed(2)} 0 1 0 ${(cxPx + rxInPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rxInPx.toFixed(2)} ${ryInPx.toFixed(2)} 0 1 0 ${(cxPx - rxInPx).toFixed(2)} ${cyPx.toFixed(2)} Z`
      : '';
    fillPath = outerLoop + innerLoop;
  } else {
    const ox0 = cxPx + rxOutPx * Math.cos(info.thetaStart);
    const oy0 = cyPx + ryOutPx * Math.sin(info.thetaStart);
    const ox1 = cxPx + rxOutPx * Math.cos(info.thetaEnd);
    const oy1 = cyPx + ryOutPx * Math.sin(info.thetaEnd);
    const ix1 = cxPx + rxInPx * Math.cos(info.thetaEnd);
    const iy1 = cyPx + ryInPx * Math.sin(info.thetaEnd);
    const ix0 = cxPx + rxInPx * Math.cos(info.thetaStart);
    const iy0 = cyPx + ryInPx * Math.sin(info.thetaStart);
    if (hasInner) {
      fillPath = `M ${ox0.toFixed(2)} ${oy0.toFixed(2)} A ${rxOutPx.toFixed(2)} ${ryOutPx.toFixed(2)} 0 0 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${rxInPx.toFixed(2)} ${ryInPx.toFixed(2)} 0 0 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;
    } else {
      fillPath = `M ${ox0.toFixed(2)} ${oy0.toFixed(2)} A ${rxOutPx.toFixed(2)} ${ryOutPx.toFixed(2)} 0 0 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} L ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;
    }
  }

  // Filter neighbors that actually come within contact distance of the outer curved rim
  const allNeighbors = [...others, ...landmarks].filter(
    (o) => !isInsideCircleCorridorHole(it, o) && !isInsideCircleCorridorHole(o, it),
  );
  const sampleCount = info.shape === 'circle' ? 96 : 32;
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
  // For a 90° arc, ignore endpoint samples i=0 and i=sampleCount so straight-mouth neighbors
  // grazing the corner vertex do not falsely register as outer-rim crescent neighbors.
  const connectedNeighbors = allNeighbors.filter((nb) => {
    const nbInfo = nb.kind === 'corridor' ? shapeMap.get(nb.key) : undefined;
    for (let i = 0; i <= sampleCount; i++) {
      if (info.shape === 'arc' && (i === 0 || i === sampleCount)) continue;
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
    const prevHit =
      i > 0 ? hitData[i - 1].hit : info.shape === 'circle' ? hitData[sampleCount - 1].hit : false;
    const nextHit =
      i < sampleCount ? hitData[i + 1].hit : info.shape === 'circle' ? hitData[1].hit : false;
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

  // Inner ring / inner arc dotted border
  if (hasInner) {
    const innerBorder = svgEllipseArc(cxPx, cyPx, rxInPx + 0.75, ryInPx + 0.75, info.thetaStart, info.thetaEnd);
    if (innerBorder) borderPaths.push(innerBorder);
  }

  const rxMidPx = info.shape === 'arc' || hasInner ? (rxOutPx + rxInPx) * 0.5 : rxOutPx * 0.58;
  const ryMidPx = info.shape === 'arc' || hasInner ? (ryOutPx + ryInPx) * 0.5 : ryOutPx * 0.58;

  if (info.shape === 'circle') {
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
  } else {
    // 90° curved arc: clip the 2 straight end-cap borders against touching neighbors,
    // emit 3px seam bridges across touched corridor mouths, and draw curved centerline
    const topAll: Array<[number, number]> = [];
    const rightAll: Array<[number, number]> = [];
    const bottomAll: Array<[number, number]> = [];
    const leftAll: Array<[number, number]> = [];
    const topCorridorHits: Array<[number, number]> = [];
    const rightCorridorHits: Array<[number, number]> = [];
    const bottomCorridorHits: Array<[number, number]> = [];
    const leftCorridorHits: Array<[number, number]> = [];

    for (const o of allNeighbors) {
      if (o.kind === 'corridor') {
        const hits = clipFrameEdgesToCorridor(it.key, info.frame, it.w, it.h, o, shapeMap.get(o.key));
        topAll.push(...hits.tHits);
        rightAll.push(...hits.rHits);
        bottomAll.push(...hits.bHits);
        leftAll.push(...hits.lHits);
        topCorridorHits.push(...hits.tHits);
        rightCorridorHits.push(...hits.rHits);
        bottomCorridorHits.push(...hits.bHits);
        leftCorridorHits.push(...hits.lHits);
      } else {
        const hits = clipFrameEdges(info.frame, it.w, it.h, o);
        if (hits.tHit) topAll.push(hits.tHit);
        if (hits.rHit) rightAll.push(hits.rHit);
        if (hits.bHit) bottomAll.push(hits.bHit);
        if (hits.lHit) leftAll.push(hits.lHit);
      }
    }

    const emitHorizontalMouth = (
      yPx: number,
      bridgeY: number,
      u0: number,
      u1: number,
      touched: Array<[number, number]>,
      corridorHits: Array<[number, number]>,
    ): boolean => {
      const span = Math.max(0, u1 - u0);
      if (span <= 0.04) return false;
      const localTouched = touched.map(([a, b]) => [a - u0, b - u0] as [number, number]);
      for (const [s, e] of subtractIntervals(span, localTouched)) {
        if (e - s > 0.04) borderPaths.push(svgLine((u0 + s) * px, yPx, (u0 + e) * px, yPx));
      }
      const localCorridor = corridorHits.map(([a, b]) => [a - u0, b - u0] as [number, number]);
      const covered = subtractIntervals(span, subtractIntervals(span, localCorridor));
      for (const [s, e] of covered) {
        if (e - s > 0.04) bridgePaths.push(svgRect((u0 + s) * px, bridgeY, (e - s) * px, 3));
      }
      return subtractIntervals(span, subtractIntervals(span, localTouched)).some(([s, e]) => e - s > 0.04);
    };

    const emitVerticalMouth = (
      xPx: number,
      bridgeX: number,
      v0: number,
      v1: number,
      touched: Array<[number, number]>,
      corridorHits: Array<[number, number]>,
    ): boolean => {
      const span = Math.max(0, v1 - v0);
      if (span <= 0.04) return false;
      const localTouched = touched.map(([a, b]) => [a - v0, b - v0] as [number, number]);
      for (const [s, e] of subtractIntervals(span, localTouched)) {
        if (e - s > 0.04) borderPaths.push(svgLine(xPx, (v0 + s) * px, xPx, (v0 + e) * px));
      }
      const localCorridor = corridorHits.map(([a, b]) => [a - v0, b - v0] as [number, number]);
      const covered = subtractIntervals(span, subtractIntervals(span, localCorridor));
      for (const [s, e] of covered) {
        if (e - s > 0.04) bridgePaths.push(svgRect(bridgeX, (v0 + s) * px, 3, (e - s) * px));
      }
      return subtractIntervals(span, subtractIntervals(span, localTouched)).some(([s, e]) => e - s > 0.04);
    };

    let startConnected = false;
    let endConnected = false;
    if (info.quadrant === 'bl') {
      startConnected = emitVerticalMouth(0.75, -1.5, it.h - info.ryOut, it.h - info.ryIn, leftAll, leftCorridorHits);
      endConnected = emitHorizontalMouth(hPx - 0.75, hPx - 1.5, info.rxIn, info.rxOut, bottomAll, bottomCorridorHits);
      if (!hasInner) {
        if (ryInPx <= 0.8 && rxInPx > 0.8) {
          emitHorizontalMouth(hPx - 0.75, hPx - 1.5, 0, info.rxIn, bottomAll, bottomCorridorHits);
        } else if (rxInPx <= 0.8 && ryInPx > 0.8) {
          emitVerticalMouth(0.75, -1.5, it.h - info.ryIn, it.h, leftAll, leftCorridorHits);
        }
      }
    } else if (info.quadrant === 'tl') {
      startConnected = emitHorizontalMouth(0.75, -1.5, info.rxIn, info.rxOut, topAll, topCorridorHits);
      endConnected = emitVerticalMouth(0.75, -1.5, info.ryIn, info.ryOut, leftAll, leftCorridorHits);
      if (!hasInner) {
        if (ryInPx <= 0.8 && rxInPx > 0.8) {
          emitHorizontalMouth(0.75, -1.5, 0, info.rxIn, topAll, topCorridorHits);
        } else if (rxInPx <= 0.8 && ryInPx > 0.8) {
          emitVerticalMouth(0.75, -1.5, 0, info.ryIn, leftAll, leftCorridorHits);
        }
      }
    } else if (info.quadrant === 'tr') {
      startConnected = emitVerticalMouth(wPx - 0.75, wPx - 1.5, info.ryIn, info.ryOut, rightAll, rightCorridorHits);
      endConnected = emitHorizontalMouth(
        0.75,
        -1.5,
        it.w - info.rxOut,
        it.w - info.rxIn,
        topAll,
        topCorridorHits,
      );
      if (!hasInner) {
        if (ryInPx <= 0.8 && rxInPx > 0.8) {
          emitHorizontalMouth(0.75, -1.5, it.w - info.rxIn, it.w, topAll, topCorridorHits);
        } else if (rxInPx <= 0.8 && ryInPx > 0.8) {
          emitVerticalMouth(wPx - 0.75, wPx - 1.5, 0, info.ryIn, rightAll, rightCorridorHits);
        }
      }
    } else {
      startConnected = emitHorizontalMouth(
        hPx - 0.75,
        hPx - 1.5,
        it.w - info.rxOut,
        it.w - info.rxIn,
        bottomAll,
        bottomCorridorHits,
      );
      endConnected = emitVerticalMouth(
        wPx - 0.75,
        wPx - 1.5,
        it.h - info.ryOut,
        it.h - info.ryIn,
        rightAll,
        rightCorridorHits,
      );
      if (!hasInner) {
        if (ryInPx <= 0.8 && rxInPx > 0.8) {
          emitHorizontalMouth(hPx - 0.75, hPx - 1.5, it.w - info.rxIn, it.w, bottomAll, bottomCorridorHits);
        } else if (rxInPx <= 0.8 && ryInPx > 0.8) {
          emitVerticalMouth(wPx - 0.75, wPx - 1.5, it.h - info.ryIn, it.h, rightAll, rightCorridorHits);
        }
      }
    }

    const padRad = 0.35 / Math.max(1, (info.rxOut + info.rxIn) * 0.5);
    const clStart = info.thetaStart + (startConnected ? 0 : padRad);
    const clEnd = info.thetaEnd - (endConnected ? 0 : padRad);
    if (clEnd > clStart) {
      const arcCl = svgEllipseArc(cxPx, cyPx, rxMidPx, ryMidPx, clStart, clEnd);
      if (arcCl) centerlinePaths.push(arcCl);
    }
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
    return buildCurvedCorridorMergeData(it, info, others, landmarks, resolvedShapes, cellPx);
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
  const topLm: Array<[number, number]> = [];
  const bottomLm: Array<[number, number]> = [];
  const leftLm: Array<[number, number]> = [];
  const rightLm: Array<[number, number]> = [];

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

  for (const o of landmarks) {
    if (isCircleAtrium(o) || isInsideCircleCorridorHole(it, o)) continue;
    const { tHit, rHit, bHit, lHit } = clipFrameEdges(frame, it.w, it.h, o);
    if (tHit) topLm.push(tHit);
    if (bHit) bottomLm.push(bHit);
    if (lHit) leftLm.push(lHit);
    if (rHit) rightLm.push(rHit);
  }

  const topAll = [...topTouched, ...topLm];
  const bottomAll = [...bottomTouched, ...bottomLm];
  const leftAll = [...leftTouched, ...leftLm];
  const rightAll = [...rightTouched, ...rightLm];

  const bridgePaths: string[] = [
    ...[...topCorridorBridges, ...topLm].map(([u1, u2]) => svgRect(u1 * px, -2, (u2 - u1) * px, 3)),
    ...[...bottomCorridorBridges, ...bottomLm].map(([u1, u2]) => svgRect(u1 * px, hPx - 1, (u2 - u1) * px, 3)),
    ...[...leftCorridorBridges, ...leftLm].map(([v1, v2]) => svgRect(-2, v1 * px, 3, (v2 - v1) * px)),
    ...[...rightCorridorBridges, ...rightLm].map(([v1, v2]) => svgRect(wPx - 1, v1 * px, 3, (v2 - v1) * px)),
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

  const vertical = it.angle ? it.h > it.w : isCorridorVertical(it, [...corridors, ...landmarks]);
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

      rawByKey.set(it.key, {
        ...buildEdgeMergeGeometry(it.w, it.h, topTouched, rightTouched, bottomTouched, leftTouched),
        topBridges,
        rightBridges,
        bottomBridges,
        leftBridges,
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
        result.set(b.key, {
          ...rawByKey.get(b.key)!,
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


