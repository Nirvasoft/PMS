import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shapes, Spline, X } from 'lucide-react';
import {
  CUSTOM_SHAPE_MAX_POINTS,
  CUSTOM_SHAPE_MIN_POINTS,
  CUSTOM_SHAPE_PRESETS,
  fitBezierToCurvedRuns,
  isSimpleCustomPolygon,
  roundCustomCorner,
  sampleBezierShapeToPolygon,
  smoothCustomPolygon,
  type CustomBezierEdge,
  type CustomBezierShapeSpec,
  type CustomShapePoint,
} from './shopMapShapeCatalog';

export interface CustomShapeBlueprintOverlay {
  dataUrl: string;
  /** Blueprint top-left X in grid cells */
  bpXCells: number;
  /** Blueprint top-left Y in grid cells */
  bpYCells: number;
  /** Blueprint width in grid cells */
  bpWCells: number;
  /** Blueprint height/width aspect ratio */
  aspectRatio?: number;
  /** Blueprint rotation in degrees around blueprint center */
  rotation: number;
  /** Current blueprint opacity (0..100) from the map */
  opacity: number;
  /** Tile top-left X in grid cells */
  tileX: number;
  /** Tile top-left Y in grid cells */
  tileY: number;
  /** Tile rotation in degrees around tile center */
  tileAngle: number;
}

interface Props {
  title: string;
  /** Tile size in grid cells – the canvas uses the same aspect ratio so what you draw is what you get. */
  tileW: number;
  tileH: number;
  initialPoints: CustomShapePoint[];
  /** Optional saved Bezier anchor & tangent handle specification for this unit. */
  initialBezierSpec?: CustomBezierShapeSpec | null;
  /** Message shown when the editor opens (e.g. the source preset had curves that become straight segments). */
  initialNote: string | null;
  /** Outlines of nearby tiles in this tile's own 0..100 % frame (can extend outside 0..100). */
  neighbors: Array<{ key: string; points: CustomShapePoint[] }>;
  /** Active floorplan blueprint overlay mapped to grid cells so the user can trace walls inside Custom Shape. */
  blueprint?: CustomShapeBlueprintOverlay | null;
  onApply: (points: CustomShapePoint[], bezierSpec?: CustomBezierShapeSpec | null) => void;
  onClose: () => void;
}

const PAD = 38;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));
const clampCtrlPct = (n: number) => Math.min(130, Math.max(-30, n));

function evaluateBezierMidpoint(
  a: CustomShapePoint,
  b: CustomShapePoint,
  curve: CustomBezierEdge,
): CustomShapePoint {
  if (curve.mode === 'quad') {
    return [
      0.25 * a[0] + 0.5 * curve.cp1[0] + 0.25 * b[0],
      0.25 * a[1] + 0.5 * curve.cp1[1] + 0.25 * b[1],
    ];
  }
  return [
    0.125 * a[0] + 0.375 * curve.cp1[0] + 0.375 * curve.cp2[0] + 0.125 * b[0],
    0.125 * a[1] + 0.375 * curve.cp1[1] + 0.375 * curve.cp2[1] + 0.125 * b[1],
  ];
}

function buildCurveFromThroughPoint(
  a: CustomShapePoint,
  b: CustomShapePoint,
  throughPt: CustomShapePoint,
  mode: 'quad' | 'cubic',
  roundCtrl: (n: number) => number,
): CustomBezierEdge {
  const mx = (a[0] + b[0]) * 0.5;
  const my = (a[1] + b[1]) * 0.5;
  const dx = throughPt[0] - mx;
  const dy = throughPt[1] - my;
  if (mode === 'quad') {
    const qx = roundCtrl(2 * throughPt[0] - mx);
    const qy = roundCtrl(2 * throughPt[1] - my);
    return { mode: 'quad', cp1: [qx, qy], cp2: [qx, qy] };
  }
  const c1: CustomShapePoint = [
    roundCtrl(a[0] + (b[0] - a[0]) / 3 + (4 / 3) * dx),
    roundCtrl(a[1] + (b[1] - a[1]) / 3 + (4 / 3) * dy),
  ];
  const c2: CustomShapePoint = [
    roundCtrl(a[0] + ((b[0] - a[0]) * 2) / 3 + (4 / 3) * dx),
    roundCtrl(a[1] + ((b[1] - a[1]) * 2) / 3 + (4 / 3) * dy),
  ];
  return { mode: 'cubic', cp1: c1, cp2: c2 };
}

export function CustomShapeEditor({
  title,
  tileW,
  tileH,
  initialPoints,
  initialBezierSpec = null,
  initialNote,
  neighbors,
  blueprint = null,
  onApply,
  onClose,
}: Props) {
  const initialResolved = useMemo((): {
    anchors: CustomShapePoint[];
    curves: Record<number, CustomBezierEdge>;
  } => {
    if (initialBezierSpec && initialBezierSpec.anchors.length >= CUSTOM_SHAPE_MIN_POINTS) {
      return {
        anchors: initialBezierSpec.anchors.map((p) => [p[0], p[1]] as CustomShapePoint),
        curves: { ...initialBezierSpec.curves },
      };
    }
    if (initialPoints.length >= 7) {
      const autoFitted = fitBezierToCurvedRuns(initialPoints);
      if (autoFitted && Object.keys(autoFitted.curves).length > 0) {
        const sampled = sampleBezierShapeToPolygon(autoFitted, 16);
        if (isSimpleCustomPolygon(sampled)) {
          return autoFitted;
        }
      }
    }
    return {
      anchors: initialPoints.map((p) => [p[0], p[1]] as CustomShapePoint),
      curves: {},
    };
  }, [initialPoints, initialBezierSpec]);

  const [pts, setPts] = useState<CustomShapePoint[]>(initialResolved.anchors);
  const [curves, setCurves] = useState<Record<number, CustomBezierEdge>>(initialResolved.curves);
  const [sel, setSel] = useState<number | null>(null);
  const [selEdge, setSelEdge] = useState<number | null>(() => {
    const firstCurveKey = Object.keys(initialResolved.curves)[0];
    return firstCurveKey !== undefined ? Number(firstCurveKey) : null;
  });
  const [defaultBezierMode, setDefaultBezierMode] = useState<'cubic' | 'quad'>('cubic');
  const [snap, setSnap] = useState(true);
  const [snapNb, setSnapNb] = useState(true);
  const [cornerRadiusPct, setCornerRadiusPct] = useState(40);
  const [showBp, setShowBp] = useState(true);
  const [bpOpacity, setBpOpacity] = useState(() =>
    blueprint ? Math.min(95, Math.max(45, blueprint.opacity)) : 55,
  );
  const [bpAspect, setBpAspect] = useState<number>(
    blueprint?.aspectRatio && blueprint.aspectRatio > 0 ? blueprint.aspectRatio : 0.75,
  );
  const [drag, setDrag] = useState<number | null>(null);
  const [ctrlDrag, setCtrlDrag] = useState<{
    edgeIdx: number;
    handle: 'cp1' | 'cp2' | 'mid';
  } | null>(null);
  const [note, setNote] = useState<string | null>(initialNote);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!blueprint?.dataUrl) return;
    if (blueprint.aspectRatio && blueprint.aspectRatio > 0) {
      setBpAspect(blueprint.aspectRatio);
    }
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setBpAspect(img.naturalHeight / img.naturalWidth);
      }
    };
    img.src = blueprint.dataUrl;
  }, [blueprint?.dataUrl, blueprint?.aspectRatio]);

  const { W, H } = useMemo(() => {
    const aspect = Math.min(4, Math.max(0.25, tileW / Math.max(1, tileH)));
    if (aspect >= 1) return { W: 440, H: Math.round(440 / aspect) };
    return { W: Math.round(340 * aspect), H: 340 };
  }, [tileW, tileH]);

  const hasCurves = useMemo(() => Object.keys(curves).length > 0, [curves]);

  const evaluatedPolygon = useMemo(() => {
    if (!hasCurves) return pts;
    return sampleBezierShapeToPolygon({ anchors: pts, curves }, 16);
  }, [pts, curves, hasCurves]);

  const valid = useMemo(() => isSimpleCustomPolygon(evaluatedPolygon), [evaluatedPolygon]);

  const toPx = (p: CustomShapePoint): [number, number] => [(p[0] / 100) * W, (p[1] / 100) * H];

  /** Closest vertex / edge point of any neighbouring tile outline (distance measured in canvas pixels). */
  const nearestNeighborPoint = (
    p: CustomShapePoint,
  ): { pt: CustomShapePoint; distPx: number } | null => {
    const px = (p[0] / 100) * W;
    const py = (p[1] / 100) * H;
    let best: { pt: CustomShapePoint; distPx: number; score: number } | null = null;
    for (const n of neighbors) {
      const poly = n.points;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const ax = (a[0] / 100) * W;
        const ay = (a[1] / 100) * H;
        const bx = (b[0] / 100) * W;
        const by = (b[1] / 100) * H;
        const dv = Math.hypot(px - ax, py - ay);
        if (!best || dv - 4 < best.score) best = { pt: [a[0], a[1]], distPx: dv, score: dv - 4 };
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        const qx = ax + t * dx;
        const qy = ay + t * dy;
        const de = Math.hypot(px - qx, py - qy);
        if (de < best.score) best = { pt: [(qx / W) * 100, (qy / H) * 100], distPx: de, score: de };
      }
    }
    return best ? { pt: best.pt, distPx: best.distPx } : null;
  };

  const roundOne = (n: number) => Math.round(clampPct(n) * 10) / 10;
  const roundCtrl = (n: number) => Math.round(clampCtrlPct(n) * 10) / 10;

  const pointerToPct = (
    e: { clientX: number; clientY: number },
    ignoreGridSnap = false,
    allowOutOfBox = false,
  ): CustomShapePoint | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const clampFn = allowOutOfBox ? clampCtrlPct : clampPct;
    const roundFn = allowOutOfBox ? roundCtrl : roundOne;
    let x = clampFn((local.x / W) * 100);
    let y = clampFn((local.y / H) * 100);
    if (!allowOutOfBox && snapNb && neighbors.length > 0) {
      const near = nearestNeighborPoint([x, y]);
      if (near && near.distPx <= 9) return [roundOne(near.pt[0]), roundOne(near.pt[1])];
    }
    if (snap && !ignoreGridSnap) {
      x = Math.round(x / 5) * 5;
      y = Math.round(y / 5) * 5;
    }
    return [roundFn(x), roundFn(y)];
  };

  const matchSelectedToNeighbor = () => {
    if (sel == null) return;
    const near = nearestNeighborPoint(pts[sel]);
    if (!near) {
      setNote('No neighbouring tile nearby to match.');
      return;
    }
    const target: CustomShapePoint = [roundOne(near.pt[0]), roundOne(near.pt[1])];
    setPts((prev) => prev.map((q, i) => (i === sel ? target : q)));
    setNote(null);
  };

  const deleteVertex = (idx: number) => {
    if (pts.length <= CUSTOM_SHAPE_MIN_POINTS) {
      setNote(`Minimum ${CUSTOM_SHAPE_MIN_POINTS} points`);
      return;
    }
    const n = pts.length;
    const prevEdge = (idx - 1 + n) % n;
    setPts((prev) => prev.filter((_, i) => i !== idx));
    setCurves((prev) => {
      const next: Record<number, CustomBezierEdge> = {};
      for (const [kStr, val] of Object.entries(prev)) {
        const k = Number(kStr);
        if (k === idx || k === prevEdge) continue;
        const newIdx = k > idx ? k - 1 : k;
        next[newIdx] = val;
      }
      return next;
    });
    setSel(null);
    setSelEdge(null);
    setNote(null);
  };

  const straightenEdge = (edgeIdx: number) => {
    setCurves((prev) => {
      if (!prev[edgeIdx]) return prev;
      const next = { ...prev };
      delete next[edgeIdx];
      return next;
    });
    if (selEdge === edgeIdx) setSelEdge(null);
    setNote(null);
  };

  const toggleEdgeCurveMode = (edgeIdx: number, targetMode: 'quad' | 'cubic') => {
    setCurves((prev) => {
      const cur = prev[edgeIdx];
      const a = pts[edgeIdx];
      const b = pts[(edgeIdx + 1) % pts.length];
      if (!a || !b) return prev;
      if (!cur) {
        const mx = (a[0] + b[0]) * 0.5;
        const my = (a[1] + b[1]) * 0.5;
        const nx = -(b[1] - a[1]) * 0.22;
        const ny = (b[0] - a[0]) * 0.22;
        const through: CustomShapePoint = [roundCtrl(mx + nx), roundCtrl(my + ny)];
        return {
          ...prev,
          [edgeIdx]: buildCurveFromThroughPoint(a, b, through, targetMode, roundCtrl),
        };
      }
      if (cur.mode === targetMode) return prev;
      if (targetMode === 'cubic') {
        // Elevate quadratic control point to exact equivalent cubic control points
        const c1: CustomShapePoint = [
          roundCtrl(a[0] + (2 / 3) * (cur.cp1[0] - a[0])),
          roundCtrl(a[1] + (2 / 3) * (cur.cp1[1] - a[1])),
        ];
        const c2: CustomShapePoint = [
          roundCtrl(b[0] + (2 / 3) * (cur.cp1[0] - b[0])),
          roundCtrl(b[1] + (2 / 3) * (cur.cp1[1] - b[1])),
        ];
        return { ...prev, [edgeIdx]: { mode: 'cubic', cp1: c1, cp2: c2 } };
      }
      // Collapse cubic to quadratic control point passing through current curve midpoint
      const mid = evaluateBezierMidpoint(a, b, cur);
      return {
        ...prev,
        [edgeIdx]: buildCurveFromThroughPoint(a, b, mid, 'quad', roundCtrl),
      };
    });
    setDefaultBezierMode(targetMode);
  };

  const handleAutoFitBezier = () => {
    const sourcePoly = evaluatedPolygon;
    const fitted = fitBezierToCurvedRuns(sourcePoly);
    if (!fitted || Object.keys(fitted.curves).length === 0) {
      setNote('Drag any cyan diamond on a wall to create a Bezier curve handle.');
      return;
    }
    setPts(fitted.anchors);
    setCurves(fitted.curves);
    const firstKey = Object.keys(fitted.curves)[0];
    setSelEdge(firstKey !== undefined ? Number(firstKey) : null);
    setSel(null);
    setNote(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel != null) {
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      e.preventDefault();
      deleteVertex(sel);
    }
    if (e.key === 'Escape') onClose();
  };
  const keyRef = useRef(onKeyDown);
  keyRef.current = onKeyDown;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const onSvgMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (ctrlDrag != null) {
      const p = pointerToPct(e, true, true);
      if (!p) return;
      const { edgeIdx, handle } = ctrlDrag;
      const a = pts[edgeIdx];
      const b = pts[(edgeIdx + 1) % pts.length];
      if (!a || !b) return;
      const dist = Math.hypot(
        p[0] - (a[0] + b[0]) * 0.5,
        p[1] - (a[1] + b[1]) * 0.5,
      );
      setCurves((prev) => {
        const cur = prev[edgeIdx];
        if (handle === 'mid') {
          if (dist < 0.8 && !cur) return prev;
          if (!cur) {
            return {
              ...prev,
              [edgeIdx]: buildCurveFromThroughPoint(a, b, p, defaultBezierMode, roundCtrl),
            };
          }
          if (cur.mode === 'quad') {
            return {
              ...prev,
              [edgeIdx]: buildCurveFromThroughPoint(a, b, p, 'quad', roundCtrl),
            };
          }
          // Shift both cubic handles together so t=0.5 passes through pointer `p`
          const curMid = evaluateBezierMidpoint(a, b, cur);
          const dx = (4 / 3) * (p[0] - curMid[0]);
          const dy = (4 / 3) * (p[1] - curMid[1]);
          return {
            ...prev,
            [edgeIdx]: {
              mode: 'cubic',
              cp1: [roundCtrl(cur.cp1[0] + dx), roundCtrl(cur.cp1[1] + dy)],
              cp2: [roundCtrl(cur.cp2[0] + dx), roundCtrl(cur.cp2[1] + dy)],
            },
          };
        }
        if (!cur) return prev;
        if (cur.mode === 'quad' || handle === 'cp1') {
          return {
            ...prev,
            [edgeIdx]: {
              ...cur,
              cp1: p,
              ...(cur.mode === 'quad' ? { cp2: p } : {}),
            },
          };
        }
        return {
          ...prev,
          [edgeIdx]: {
            ...cur,
            cp2: p,
          },
        };
      });
      return;
    }
    if (drag == null) return;
    const p = pointerToPct(e);
    if (!p) return;
    const oldPt = pts[drag];
    if (!oldPt) return;
    const dx = p[0] - oldPt[0];
    const dy = p[1] - oldPt[1];
    if (dx === 0 && dy === 0) return;
    const n = pts.length;
    const prevEdgeIdx = (drag - 1 + n) % n;
    setPts((prev) => prev.map((q, i) => (i === drag ? p : q)));
    setCurves((prev) => {
      if (!prev[drag] && !prev[prevEdgeIdx]) return prev;
      const next = { ...prev };
      if (next[drag]) {
        const c = next[drag];
        next[drag] = {
          ...c,
          cp1: [roundCtrl(c.cp1[0] + dx), roundCtrl(c.cp1[1] + dy)],
          ...(c.mode === 'quad'
            ? { cp2: [roundCtrl(c.cp1[0] + dx), roundCtrl(c.cp1[1] + dy)] }
            : {}),
        };
      }
      if (next[prevEdgeIdx]) {
        const c = next[prevEdgeIdx];
        if (c.mode === 'cubic') {
          next[prevEdgeIdx] = {
            ...c,
            cp2: [roundCtrl(c.cp2[0] + dx), roundCtrl(c.cp2[1] + dy)],
          };
        }
      }
      return next;
    });
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag == null && ctrlDrag == null) return;
    setDrag(null);
    setCtrlDrag(null);
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const startVertexDrag = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    setSel(idx);
    setDrag(idx);
    setNote(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const startCurveHandleDrag = (
    e: React.PointerEvent,
    edgeIdx: number,
    handle: 'cp1' | 'cp2' | 'mid',
  ) => {
    e.stopPropagation();
    setSel(null);
    setSelEdge(edgeIdx);
    setCtrlDrag({ edgeIdx, handle });
    setNote(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const insertOnEdge = (e: React.PointerEvent, edgeIdx: number) => {
    e.stopPropagation();
    if (curves[edgeIdx]) {
      setSelEdge(edgeIdx);
      setSel(null);
      return;
    }
    if (pts.length >= CUSTOM_SHAPE_MAX_POINTS) {
      setNote(`Maximum ${CUSTOM_SHAPE_MAX_POINTS} points`);
      return;
    }
    const p = pointerToPct(e);
    if (!p) return;
    setPts((prev) => [...prev.slice(0, edgeIdx + 1), p, ...prev.slice(edgeIdx + 1)]);
    setCurves((prev) => {
      const next: Record<number, CustomBezierEdge> = {};
      for (const [kStr, val] of Object.entries(prev)) {
        const k = Number(kStr);
        next[k > edgeIdx ? k + 1 : k] = val;
      }
      return next;
    });
    setSel(edgeIdx + 1);
    setSelEdge(null);
    setDrag(edgeIdx + 1);
    setNote(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const doRound = () => {
    if (sel == null) return;
    const basePoly = evaluatedPolygon;
    const r = roundCustomCorner(basePoly, sel, 10, cornerRadiusPct / 100);
    if (!r) {
      setNote(
        basePoly.length + 2 > CUSTOM_SHAPE_MAX_POINTS
          ? `Too many points (max ${CUSTOM_SHAPE_MAX_POINTS})`
          : 'Edges next to this corner are too short to round',
      );
      return;
    }
    const fitted = fitBezierToCurvedRuns(r.points);
    if (fitted && Object.keys(fitted.curves).length > 0) {
      setPts(fitted.anchors);
      setCurves(fitted.curves);
    } else {
      setPts(r.points);
      setCurves({});
    }
    setSel(null);
    setNote(null);
  };

  const doSmoothCurve = () => {
    const basePoly = evaluatedPolygon;
    const smoothed = smoothCustomPolygon(basePoly, sel, cornerRadiusPct / 100);
    if (!smoothed) {
      setNote('Select a corner dot or draw a curved section first, then click Smooth curve');
      return;
    }
    const fitted = fitBezierToCurvedRuns(smoothed);
    if (fitted && Object.keys(fitted.curves).length > 0) {
      setPts(fitted.anchors);
      setCurves(fitted.curves);
    } else {
      setPts(smoothed);
      setCurves({});
    }
    setSel(null);
    setNote(null);
  };

  const svgShapePathD = useMemo(() => {
    if (pts.length === 0) return '';
    const [x0, y0] = toPx(pts[0]);
    const parts: string[] = [`M ${x0.toFixed(1)} ${y0.toFixed(1)}`];
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const q = pts[(i + 1) % n];
      const [qx, qy] = toPx(q);
      const c = curves[i];
      if (!c) {
        parts.push(`L ${qx.toFixed(1)} ${qy.toFixed(1)}`);
      } else if (c.mode === 'quad') {
        const [c1x, c1y] = toPx(c.cp1);
        parts.push(`Q ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${qx.toFixed(1)} ${qy.toFixed(1)}`);
      } else {
        const [c1x, c1y] = toPx(c.cp1);
        const [c2x, c2y] = toPx(c.cp2);
        parts.push(
          `C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${qx.toFixed(1)} ${qy.toFixed(1)}`,
        );
      }
    }
    parts.push('Z');
    return parts.join(' ');
  }, [pts, curves, W, H]);

  const previewPct = (pr: ReadonlyArray<CustomShapePoint>) => pr.map(([x, y]) => `${x},${y}`).join(' ');

  const btn = (active = false): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent, #10b981)' : 'var(--border-color, var(--border, #cbd5e1))'}`,
    background: active ? 'rgba(16, 185, 129, 0.14)' : 'var(--card-bg, var(--surface, #fff))',
    color: 'var(--text-primary, #0f172a)',
    cursor: 'pointer',
  });

  const activeEdgeCurve = selEdge != null ? curves[selEdge] ?? null : null;

  return createPortal(
    <div className="shop-map-qr-backdrop" onClick={onClose}>
      <div className="shop-map-qr-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="shop-map-qr-header">
          <div>
            <h3>
              <Shapes size={18} /> Custom Shape &amp; Bezier Curves — {title}
            </h3>
            <p>
              Drag white anchor dots · drag cyan diamonds (◆) to bend any edge · drag green/cyan Bezier tangent handles (CP1/CP2) to sculpt smooth curves
            </p>
          </div>
          <button type="button" className="shop-map-qr-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="shop-map-qr-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {CUSTOM_SHAPE_PRESETS.map((pr) => (
              <button
                key={pr.id}
                type="button"
                style={{ ...btn(), display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                onClick={() => {
                  const rawPts = pr.points.map((p) => [p[0], p[1]] as CustomShapePoint);
                  if (pr.group === 'round') {
                    const fitted = fitBezierToCurvedRuns(rawPts);
                    if (fitted && Object.keys(fitted.curves).length > 0) {
                      setPts(fitted.anchors);
                      setCurves(fitted.curves);
                      const firstKey = Object.keys(fitted.curves)[0];
                      setSelEdge(firstKey !== undefined ? Number(firstKey) : null);
                      setSel(null);
                      setNote(null);
                      return;
                    }
                  }
                  setPts(rawPts);
                  setCurves({});
                  setSel(null);
                  setSelEdge(null);
                  setNote(null);
                }}
                title={pr.label}
              >
                <svg width="26" height="26" viewBox="-4 -4 108 108">
                  <polygon points={previewPct(pr.points)} fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 10 }}>{pr.label}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg
              ref={svgRef}
              width="100%"
              style={{
                maxWidth: W + PAD * 2,
                touchAction: 'none',
                background: 'var(--bg-secondary, #f1f5f9)',
                border: '1px solid var(--border-color, var(--border, #cbd5e1))',
                borderRadius: 10,
                userSelect: 'none',
                overflow: 'hidden',
              }}
              viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
              onPointerMove={onSvgMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerDown={() => {
                setSel(null);
                setSelEdge(null);
              }}
            >
              {blueprint && showBp && (() => {
                const bpHCells = blueprint.bpWCells * bpAspect;
                const tileCx = blueprint.tileX + tileW * 0.5;
                const tileCy = blueprint.tileY + tileH * 0.5;
                const cellPxX = W / Math.max(1, tileW);
                const cellPxY = H / Math.max(1, tileH);
                const bpCx = blueprint.bpXCells + blueprint.bpWCells * 0.5;
                const bpCy = blueprint.bpYCells + bpHCells * 0.5;
                return (
                  <>
                    <g
                      pointerEvents="none"
                      opacity={bpOpacity / 100}
                      transform={`translate(${W / 2} ${H / 2}) scale(${cellPxX} ${cellPxY}) rotate(${-blueprint.tileAngle}) translate(${-tileCx} ${-tileCy})`}
                    >
                      <image
                        href={blueprint.dataUrl}
                        x={blueprint.bpXCells}
                        y={blueprint.bpYCells}
                        width={blueprint.bpWCells}
                        height={bpHCells}
                        preserveAspectRatio="none"
                        transform={
                          blueprint.rotation
                            ? `rotate(${blueprint.rotation} ${bpCx} ${bpCy})`
                            : undefined
                        }
                      />
                    </g>
                    <path
                      d={`M ${-PAD} ${-PAD} H ${W + PAD} V ${H + PAD} H ${-PAD} Z M 0 0 V ${H} H ${W} V 0 Z`}
                      fillRule="evenodd"
                      fill="rgba(15, 23, 42, 0.12)"
                      pointerEvents="none"
                    />
                  </>
                );
              })()}
              <rect
                x={0}
                y={0}
                width={W}
                height={H}
                fill="none"
                stroke={blueprint && showBp ? '#10b981' : '#94a3b8'}
                strokeWidth={blueprint && showBp ? 1.5 : 1}
                strokeOpacity={blueprint && showBp ? 0.7 : 1}
                strokeDasharray="4 4"
                pointerEvents="none"
              />
              {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((g) => (
                <g key={g} stroke="#94a3b8" strokeOpacity={g === 50 ? 0.35 : 0.15} pointerEvents="none">
                  <line x1={(g / 100) * W} y1={0} x2={(g / 100) * W} y2={H} />
                  <line x1={0} y1={(g / 100) * H} x2={W} y2={(g / 100) * H} />
                </g>
              ))}
              {neighbors.map((n) => (
                <polygon
                  key={n.key}
                  points={n.points.map((p) => toPx(p).join(',')).join(' ')}
                  fill="rgba(100,116,139,0.12)"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ))}
              <path
                d={svgShapePathD}
                fill={
                  valid
                    ? blueprint && showBp
                      ? 'rgba(16, 185, 129, 0.16)'
                      : 'rgba(16, 185, 129, 0.24)'
                    : 'rgba(220, 38, 38, 0.18)'
                }
                stroke={valid ? '#10b981' : '#dc2626'}
                strokeWidth={2.5}
                strokeLinejoin="round"
                fillRule="evenodd"
              />
              {/* Clickable Edge Hit-Targets (insert vertex on straight edge, or select curved edge) */}
              {pts.map((p, i) => {
                const q = pts[(i + 1) % pts.length];
                const [x1, y1] = toPx(p);
                const [x2, y2] = toPx(q);
                const c = curves[i];
                if (c) {
                  const [c1x, c1y] = toPx(c.cp1);
                  const [c2x, c2y] = toPx(c.cp2);
                  const edgeD =
                    c.mode === 'quad'
                      ? `M ${x1} ${y1} Q ${c1x} ${c1y} ${x2} ${y2}`
                      : `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
                  return (
                    <path
                      key={`e${i}`}
                      d={edgeD}
                      fill="none"
                      stroke={selEdge === i ? 'rgba(6, 182, 212, 0.45)' : 'transparent'}
                      strokeWidth={12}
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelEdge(i);
                        setSel(null);
                      }}
                    />
                  );
                }
                return (
                  <line
                    key={`e${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: 'copy' }}
                    onPointerDown={(e) => insertOnEdge(e, i)}
                  />
                );
              })}

              {/* Bezier Tangent Control Arms & Handles (CP1, CP2) for all curved edges */}
              {pts.map((p, i) => {
                const c = curves[i];
                if (!c) return null;
                const q = pts[(i + 1) % pts.length];
                const [ax, ay] = toPx(p);
                const [bx, by] = toPx(q);
                const [c1x, c1y] = toPx(c.cp1);
                const [c2x, c2y] = toPx(c.cp2);
                const isFocusedEdge = selEdge === i || ctrlDrag?.edgeIdx === i;
                return (
                  <g key={`bz-${i}`} opacity={isFocusedEdge ? 1 : 0.82}>
                    {/* Dashed tangent lines from anchors to control handles */}
                    <line
                      x1={ax}
                      y1={ay}
                      x2={c1x}
                      y2={c1y}
                      stroke="#06b6d4"
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                      pointerEvents="none"
                    />
                    <line
                      x1={bx}
                      y1={by}
                      x2={c.mode === 'quad' ? c1x : c2x}
                      y2={c.mode === 'quad' ? c1y : c2y}
                      stroke={c.mode === 'quad' ? '#06b6d4' : '#10b981'}
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                      pointerEvents="none"
                    />
                    {/* CP1 Tangent Handle */}
                    <circle
                      cx={c1x}
                      cy={c1y}
                      r={isFocusedEdge ? 6.2 : 5}
                      fill="#06b6d4"
                      stroke="#ffffff"
                      strokeWidth={2}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => startCurveHandleDrag(e, i, 'cp1')}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        straightenEdge(i);
                      }}
                    >
                      <title>
                        {c.mode === 'quad'
                          ? 'Quadratic Bezier Handle (CP) — drag to curve, double-click to straighten'
                          : 'Cubic Bezier Tangent Handle 1 (CP1) — drag to sculpt curve, double-click to straighten'}
                      </title>
                    </circle>
                    {/* CP2 Tangent Handle (Cubic mode only) */}
                    {c.mode === 'cubic' && (
                      <circle
                        cx={c2x}
                        cy={c2y}
                        r={isFocusedEdge ? 6.2 : 5}
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(e) => startCurveHandleDrag(e, i, 'cp2')}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          straightenEdge(i);
                        }}
                      >
                        <title>Cubic Bezier Tangent Handle 2 (CP2) — drag to sculpt curve, double-click to straighten</title>
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* Interactive On-Curve / Edge-Midpoint Bend Diamonds (cyan ◆ at t=0.5 of every edge) */}
              {pts.map((p, i) => {
                const q = pts[(i + 1) % pts.length];
                const c = curves[i];
                const lenPct = Math.hypot(q[0] - p[0], q[1] - p[1]);
                if (!c && lenPct < 10) return null;
                const midPct: CustomShapePoint = c
                  ? evaluateBezierMidpoint(p, q, c)
                  : [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5];
                const [mx, my] = toPx(midPct);
                const sz = c ? 5.8 : 5.2;
                return (
                  <polygon
                    key={`bend${i}`}
                    points={`${mx},${my - sz} ${mx + sz},${my} ${mx},${my + sz} ${mx - sz},${my}`}
                    fill={c ? '#0891b2' : '#06b6d4'}
                    stroke="#fff"
                    strokeWidth={1.8}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => startCurveHandleDrag(e, i, 'mid')}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (c) straightenEdge(i);
                    }}
                  >
                    <title>
                      {c
                        ? 'Drag to pull curve crest · double-click to straighten edge'
                        : 'Drag to bend this straight edge into a smooth Bezier curve'}
                    </title>
                  </polygon>
                );
              })}

              {/* Anchor Vertices */}
              {pts.map((p, i) => {
                const [x, y] = toPx(p);
                const active = sel === i;
                return (
                  <circle
                    key={`v${i}`}
                    cx={x}
                    cy={y}
                    r={active ? 8 : 6.5}
                    fill={active ? '#06b6d4' : '#fff'}
                    stroke={valid ? '#059669' : '#dc2626'}
                    strokeWidth={2.5}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => startVertexDrag(e, i)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      deleteVertex(i);
                    }}
                  >
                    <title>Anchor Point #{i + 1} — drag to move, double-click to delete</title>
                  </circle>
                );
              })}
            </svg>
          </div>

          {/* Bezier Curve Controls Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 10,
              padding: '7px 10px',
              borderRadius: 8,
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.28)',
              alignItems: 'center',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
              <Spline size={14} style={{ color: '#06b6d4' }} /> Bezier Curve Mode:
            </span>
            <button
              type="button"
              style={btn((activeEdgeCurve ? activeEdgeCurve.mode : defaultBezierMode) === 'cubic')}
              onClick={() => {
                if (selEdge != null) toggleEdgeCurveMode(selEdge, 'cubic');
                else setDefaultBezierMode('cubic');
              }}
              title="Cubic Bezier: 2 independent tangent handles (CP1 & CP2) for S-curves, asymmetric arcs & full control"
            >
              Cubic (2 Handles)
            </button>
            <button
              type="button"
              style={btn((activeEdgeCurve ? activeEdgeCurve.mode : defaultBezierMode) === 'quad')}
              onClick={() => {
                if (selEdge != null) toggleEdgeCurveMode(selEdge, 'quad');
                else setDefaultBezierMode('quad');
              }}
              title="Quadratic Bezier: 1 shared control handle (CP) for simple symmetric arcs"
            >
              Quadratic (1 Handle)
            </button>
            {selEdge != null && activeEdgeCurve && (
              <button
                type="button"
                style={btn()}
                onClick={() => straightenEdge(selEdge)}
                title="Convert the selected curved edge back into a straight wall"
              >
                Straighten Edge
              </button>
            )}
            {hasCurves && (
              <button
                type="button"
                style={btn()}
                onClick={() => {
                  setCurves({});
                  setSelEdge(null);
                }}
                title="Reset all curved edges back to straight segments between anchors"
              >
                Straighten All
              </button>
            )}
            <button
              type="button"
              style={{ ...btn(), marginLeft: 'auto' }}
              onClick={handleAutoFitBezier}
              title="Convert dense multi-point curved chains into clean Anchor Points + Cubic Bezier Tangent Handles"
            >
              Auto-Fit Bezier Handles
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
            {blueprint && (
              <>
                <button
                  type="button"
                  style={btn(showBp)}
                  onClick={() => setShowBp((s) => !s)}
                  title="Show or hide the floorplan blueprint behind this shop unit while shaping"
                >
                  Blueprint {showBp ? 'ON' : 'OFF'}
                </button>
                {showBp && (
                  <label
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, opacity: 0.85 }}
                    title="Adjust blueprint visibility inside the shape editor"
                  >
                    <span>BP {bpOpacity}%</span>
                    <input
                      type="range"
                      min={10}
                      max={95}
                      step={5}
                      value={bpOpacity}
                      onChange={(e) => setBpOpacity(Number(e.target.value))}
                      style={{ width: 64, accentColor: '#10b981', cursor: 'pointer' }}
                    />
                  </label>
                )}
              </>
            )}
            <button type="button" style={btn(snap)} onClick={() => setSnap((s) => !s)}>
              Snap to grid {snap ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              style={btn(true)}
              onClick={doSmoothCurve}
              title="Smooth jagged/angled curve points while keeping straight horizontal & vertical walls sharp"
            >
              Smooth curve
            </button>
            <button
              type="button"
              style={{ ...btn(), opacity: sel == null ? 0.5 : 1 }}
              disabled={sel == null}
              onClick={doRound}
              title="Select a corner dot first, then round it into a smooth Bezier curve"
            >
              Round corner
            </button>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, opacity: 0.85 }}
              title="Curve radius when rounding a selected corner"
            >
              <span>Radius {cornerRadiusPct}%</span>
              <input
                type="range"
                min={15}
                max={48}
                step={1}
                value={cornerRadiusPct}
                onChange={(e) => setCornerRadiusPct(Number(e.target.value))}
                style={{ width: 64, accentColor: '#10b981', cursor: 'pointer' }}
              />
            </label>
            <button
              type="button"
              style={{ ...btn(), opacity: sel == null ? 0.5 : 1 }}
              disabled={sel == null}
              onClick={() => sel != null && deleteVertex(sel)}
            >
              Delete point
            </button>
            {neighbors.length > 0 && (
              <>
                <button
                  type="button"
                  style={btn(snapNb)}
                  onClick={() => setSnapNb((s) => !s)}
                  title="Dots jump onto the outline of nearby tiles (grey dashed shapes) so edges line up exactly"
                >
                  Snap to neighbors {snapNb ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  style={{ ...btn(), opacity: sel == null ? 0.5 : 1 }}
                  disabled={sel == null}
                  onClick={matchSelectedToNeighbor}
                  title="Select a dot, then move it onto the closest neighbour edge"
                >
                  Match neighbor edge
                </button>
              </>
            )}
            <button
              type="button"
              style={btn()}
              onClick={() => {
                setPts(initialResolved.anchors.map((p) => [p[0], p[1]] as CustomShapePoint));
                setCurves({ ...initialResolved.curves });
                setSel(null);
                setSelEdge(null);
                setNote(initialNote);
              }}
            >
              Reset
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, opacity: 0.75 }}>
              {pts.length} anchors · { Object.keys(curves).length } curves ({evaluatedPolygon.length}/{CUSTOM_SHAPE_MAX_POINTS} pts)
            </span>
          </div>

          {!valid && (
            <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12.5, fontWeight: 600 }}>
              Edges cross each other (or the shape is flat) — adjust the anchor dots or Bezier handles so the outline does not intersect.
            </div>
          )}
          {note && <div style={{ marginTop: 8, color: '#0891b2', fontSize: 12.5 }}>{note}</div>}
        </div>
        <div className="shop-map-qr-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!valid}
            onClick={() =>
              onApply(
                evaluatedPolygon,
                hasCurves ? { anchors: pts, curves } : null,
              )
            }
          >
            Apply shape
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

