import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shapes, X } from 'lucide-react';
import {
  CUSTOM_SHAPE_MAX_POINTS,
  CUSTOM_SHAPE_MIN_POINTS,
  CUSTOM_SHAPE_PRESETS,
  isSimpleCustomPolygon,
  roundCustomCorner,
  type CustomShapePoint,
} from './shopMapShapeCatalog';

interface Props {
  title: string;
  /** Tile size in grid cells – the canvas uses the same aspect ratio so what you draw is what you get. */
  tileW: number;
  tileH: number;
  initialPoints: CustomShapePoint[];
  /** Polygon built from the tile's current preset shape (offered as "Start from current shape"). */
  currentPoints: CustomShapePoint[];
  currentIsApproximate: boolean;
  onApply: (points: CustomShapePoint[]) => void;
  onClose: () => void;
}

const PAD = 18;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export function CustomShapeEditor({
  title,
  tileW,
  tileH,
  initialPoints,
  currentPoints,
  currentIsApproximate,
  onApply,
  onClose,
}: Props) {
  const [pts, setPts] = useState<CustomShapePoint[]>(initialPoints);
  const [sel, setSel] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  const [drag, setDrag] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { W, H } = useMemo(() => {
    const aspect = Math.min(4, Math.max(0.25, tileW / Math.max(1, tileH)));
    if (aspect >= 1) return { W: 440, H: Math.round(440 / aspect) };
    return { W: Math.round(340 * aspect), H: 340 };
  }, [tileW, tileH]);

  const valid = useMemo(() => isSimpleCustomPolygon(pts), [pts]);

  const toPx = (p: CustomShapePoint): [number, number] => [(p[0] / 100) * W, (p[1] / 100) * H];

  const pointerToPct = (e: { clientX: number; clientY: number }): CustomShapePoint | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    let x = clampPct((local.x / W) * 100);
    let y = clampPct((local.y / H) * 100);
    if (snap) {
      x = Math.round(x / 5) * 5;
      y = Math.round(y / 5) * 5;
    }
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
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
    if (drag == null) return;
    const p = pointerToPct(e);
    if (!p) return;
    setPts((prev) => prev.map((q, i) => (i === drag ? p : q)));
  };
  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag == null) return;
    setDrag(null);
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
    const r = roundCustomCorner(pts, sel);
    if (!r) {
      setNote(
        pts.length + 6 > CUSTOM_SHAPE_MAX_POINTS
          ? `Too many points (max ${CUSTOM_SHAPE_MAX_POINTS})`
          : 'Edges next to this corner are too short to round',
      );
      return;
    }
    setPts(r.points);
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
      <div className="shop-map-qr-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="shop-map-qr-header">
          <div>
            <h3>
              <Shapes size={18} /> Custom Shape — {title}
            </h3>
            <p>
              Drag the dots to move · click an edge to add a point · double-click a dot to delete it
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
              style={{ ...btn(), opacity: sel == null ? 0.5 : 1 }}
              disabled={sel == null}
              onClick={doRound}
              title="Select a corner dot first, then round it into a smooth curve"
            >
              Round corner
            </button>
            <button
              type="button"
              style={{ ...btn(), opacity: sel == null ? 0.5 : 1 }}
              disabled={sel == null}
              onClick={() => sel != null && deleteVertex(sel)}
            >
              Delete point
            </button>
            <button
              type="button"
              style={btn()}
              onClick={() => {
                setPts(currentPoints.map((p) => [p[0], p[1]] as CustomShapePoint));
                setSel(null);
                setNote(
                  currentIsApproximate
                    ? 'The current shape contains curves — they become straight segments here.'
                    : null,
                );
              }}
            >
              Start from current shape
            </button>
            <button
              type="button"
              style={btn()}
              onClick={() => {
                setPts(initialPoints.map((p) => [p[0], p[1]] as CustomShapePoint));
                setSel(null);
                setNote(null);
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
