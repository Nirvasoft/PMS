import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shapes, X } from 'lucide-react';
import {
  bendCustomEdge,
  CUSTOM_SHAPE_MAX_POINTS,
  CUSTOM_SHAPE_MIN_POINTS,
  CUSTOM_SHAPE_PRESETS,
  isSimpleCustomPolygon,
  roundCustomCorner,
  smoothCustomPolygon,
  type CustomShapePoint,
} from './shopMapShapeCatalog';

interface Props {
  title: string;
  /** Tile size in grid cells – the canvas uses the same aspect ratio so what you draw is what you get. */
  tileW: number;
  tileH: number;
  initialPoints: CustomShapePoint[];
  /** Message shown when the editor opens (e.g. the source preset had curves that become straight segments). */
  initialNote: string | null;
  /** Outlines of nearby tiles in this tile's own 0..100 % frame (can extend outside 0..100). */
  neighbors: Array<{ key: string; points: CustomShapePoint[] }>;
  onApply: (points: CustomShapePoint[]) => void;
  onClose: () => void;
}

const PAD = 36;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export function CustomShapeEditor({
  title,
  tileW,
  tileH,
  initialPoints,
  initialNote,
  neighbors,
  onApply,
  onClose,
}: Props) {
  const [pts, setPts] = useState<CustomShapePoint[]>(initialPoints);
  const [sel, setSel] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  const [snapNb, setSnapNb] = useState(true);
  const [cornerRadiusPct, setCornerRadiusPct] = useState(40);
  const [drag, setDrag] = useState<number | null>(null);
  const [bendDrag, setBendDrag] = useState<{ edgeIdx: number; basePts: CustomShapePoint[] } | null>(null);
  const [note, setNote] = useState<string | null>(initialNote);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { W, H } = useMemo(() => {
    const aspect = Math.min(4, Math.max(0.25, tileW / Math.max(1, tileH)));
    if (aspect >= 1) return { W: 440, H: Math.round(440 / aspect) };
    return { W: Math.round(340 * aspect), H: 340 };
  }, [tileW, tileH]);

  const valid = useMemo(() => isSimpleCustomPolygon(pts), [pts]);

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
        // Vertices win over edge points when they are about as close.
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

  const pointerToPct = (e: { clientX: number; clientY: number }, ignoreGridSnap = false): CustomShapePoint | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    let x = clampPct((local.x / W) * 100);
    let y = clampPct((local.y / H) * 100);
    if (snapNb && neighbors.length > 0) {
      const near = nearestNeighborPoint([x, y]);
      if (near && near.distPx <= 9) return [roundOne(near.pt[0]), roundOne(near.pt[1])];
    }
    if (snap && !ignoreGridSnap) {
      x = Math.round(x / 5) * 5;
      y = Math.round(y / 5) * 5;
    }
    return [roundOne(x), roundOne(y)];
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
    setPts((prev) => prev.filter((_, i) => i !== idx));
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
    if (bendDrag != null) {
      const p = pointerToPct(e, true);
      if (!p) return;
      const bent = bendCustomEdge(bendDrag.basePts, bendDrag.edgeIdx, p, 12);
      if (bent) setPts(bent);
      return;
    }
    if (drag == null) return;
    const p = pointerToPct(e);
    if (!p) return;
    setPts((prev) => prev.map((q, i) => (i === drag ? p : q)));
  };
  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag == null && bendDrag == null) return;
    setDrag(null);
    setBendDrag(null);
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

  const startEdgeBend = (e: React.PointerEvent, edgeIdx: number) => {
    e.stopPropagation();
    if (pts.length + 2 > CUSTOM_SHAPE_MAX_POINTS) {
      setNote(`Too many points (max ${CUSTOM_SHAPE_MAX_POINTS})`);
      return;
    }
    setSel(null);
    setBendDrag({ edgeIdx, basePts: pts.map((p) => [p[0], p[1]] as CustomShapePoint) });
    setNote(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const insertOnEdge = (e: React.PointerEvent, edgeIdx: number) => {
    e.stopPropagation();
    if (pts.length >= CUSTOM_SHAPE_MAX_POINTS) {
      setNote(`Maximum ${CUSTOM_SHAPE_MAX_POINTS} points`);
      return;
    }
    const p = pointerToPct(e);
    if (!p) return;
    setPts((prev) => [...prev.slice(0, edgeIdx + 1), p, ...prev.slice(edgeIdx + 1)]);
    setSel(edgeIdx + 1);
    setDrag(edgeIdx + 1);
    setNote(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const doRound = () => {
    if (sel == null) return;
    const r = roundCustomCorner(pts, sel, 10, cornerRadiusPct / 100);
    if (!r) {
      setNote(
        pts.length + 2 > CUSTOM_SHAPE_MAX_POINTS
          ? `Too many points (max ${CUSTOM_SHAPE_MAX_POINTS})`
          : 'Edges next to this corner are too short to round',
      );
      return;
    }
    setPts(r.points);
    setSel(null);
    setNote(null);
  };

  const doSmoothCurve = () => {
    const smoothed = smoothCustomPolygon(pts, sel, cornerRadiusPct / 100);
    if (!smoothed) {
      setNote('Select a corner dot or draw a curved section first, then click Smooth curve');
      return;
    }
    setPts(smoothed);
    setSel(null);
    setNote(null);
  };

  const polyD = pts.map((p) => toPx(p).join(',')).join(' ');
  const previewPct = (pr: ReadonlyArray<CustomShapePoint>) => pr.map(([x, y]) => `${x},${y}`).join(' ');

  const btn = (active = false): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--primary, #4f46e5)' : 'var(--border-color, var(--border, #cbd5e1))'}`,
    background: active ? 'var(--primary-light, rgba(79,70,229,0.1))' : 'var(--card-bg, var(--surface, #fff))',
    color: 'var(--text-primary, #0f172a)',
    cursor: 'pointer',
  });

  return createPortal(
    <div className="shop-map-qr-backdrop" onClick={onClose}>
      <div className="shop-map-qr-modal" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
        <div className="shop-map-qr-header">
          <div>
            <h3>
              <Shapes size={18} /> Custom Shape — {title}
            </h3>
            <p>
              Drag dots to move · drag blue diamonds to bend an edge into a smooth curve · click an edge to add a point
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
                  setPts(pr.points.map((p) => [p[0], p[1]] as CustomShapePoint));
                  setSel(null);
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
              }}
              viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
              onPointerMove={onSvgMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerDown={() => setSel(null)}
            >
              <rect x={0} y={0} width={W} height={H} fill="none" stroke="#94a3b8" strokeDasharray="4 4" />
              {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((g) => (
                <g key={g} stroke="#94a3b8" strokeOpacity={g === 50 ? 0.35 : 0.15}>
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
              <polygon
                points={polyD}
                fill={valid ? 'rgba(79,70,229,0.22)' : 'rgba(220,38,38,0.18)'}
                stroke={valid ? '#4f46e5' : '#dc2626'}
                strokeWidth={2.5}
                strokeLinejoin="round"
                fillRule="evenodd"
              />
              {pts.map((p, i) => {
                const q = pts[(i + 1) % pts.length];
                const [x1, y1] = toPx(p);
                const [x2, y2] = toPx(q);
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
              {/* Interactive Edge-Bend Handles (cyan diamonds at the midpoint of edges >= 14% long) */}
              {bendDrag == null &&
                pts.map((p, i) => {
                  const q = pts[(i + 1) % pts.length];
                  const lenPct = Math.hypot(q[0] - p[0], q[1] - p[1]);
                  if (lenPct < 14) return null;
                  const [x1, y1] = toPx(p);
                  const [x2, y2] = toPx(q);
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  const sz = 5.2;
                  return (
                    <polygon
                      key={`bend${i}`}
                      points={`${mx},${my - sz} ${mx + sz},${my} ${mx},${my + sz} ${mx - sz},${my}`}
                      fill="#06b6d4"
                      stroke="#fff"
                      strokeWidth={1.8}
                      style={{ cursor: 'move' }}
                      onPointerDown={(e) => startEdgeBend(e, i)}
                    >
                      <title>Drag to bend this edge into a smooth curve</title>
                    </polygon>
                  );
                })}
              {pts.map((p, i) => {
                const [x, y] = toPx(p);
                const active = sel === i;
                return (
                  <circle
                    key={`v${i}`}
                    cx={x}
                    cy={y}
                    r={active ? 8 : 6.5}
                    fill={active ? '#f59e0b' : '#fff'}
                    stroke={valid ? '#4f46e5' : '#dc2626'}
                    strokeWidth={2.5}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => startVertexDrag(e, i)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      deleteVertex(i);
                    }}
                  />
                );
              })}
            </svg>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
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
              title="Select a corner dot first, then round it into a smooth curve"
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
                style={{ width: 64, accentColor: '#4f46e5', cursor: 'pointer' }}
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
                setPts(initialPoints.map((p) => [p[0], p[1]] as CustomShapePoint));
                setSel(null);
                setNote(initialNote);
              }}
            >
              Reset
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, opacity: 0.75 }}>
              {pts.length}/{CUSTOM_SHAPE_MAX_POINTS} points
            </span>
          </div>

          {!valid && (
            <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12.5, fontWeight: 600 }}>
              Edges cross each other (or the shape is flat) — move the dots so the outline does not intersect.
            </div>
          )}
          {note && <div style={{ marginTop: 8, color: '#b45309', fontSize: 12.5 }}>{note}</div>}
        </div>
        <div className="shop-map-qr-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!valid}
            onClick={() => onApply(pts)}
          >
            Apply shape
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
