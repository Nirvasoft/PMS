// Custom (free-hand polygon) unit shapes: label format `unit:custom:x,y;x,y;...` (x/y = 0..100 % of the tile box).
// Mirrors client/src/pages/admin/ShopDirectory/shopMapShapeCatalog.ts so overlap validation matches the editor.

type Pt = [number, number];

const PREFIX = 'unit:custom:';
const MAX_POINTS = 64;

export function decodeCustomShape(label: string | null | undefined): Pt[] | null {
  if (!label || !label.startsWith(PREFIX)) return null;
  const out: Pt[] = [];
  for (const part of label.slice(PREFIX.length).split(';')) {
    const [xs, ys] = part.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y))]);
    if (out.length > MAX_POINTS) return null;
  }
  return out.length >= 3 ? out : null;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
  const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
  return !(neg && pos);
}

function triangulate(pts: Pt[]): Pt[][] {
  const idx = pts.map((_, i) => i);
  if (signedArea(pts) < 0) idx.reverse();
  const tris: Pt[][] = [];
  let guard = 0;
  while (idx.length > 3 && guard < 500) {
    guard++;
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length];
      const b = idx[i];
      const c = idx[(i + 1) % idx.length];
      if (cross(pts[a], pts[b], pts[c]) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) {
        if (j === a || j === b || j === c) continue;
        if (inTriangle(pts[j], pts[a], pts[b], pts[c])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      tris.push([pts[a], pts[b], pts[c]]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length >= 3) {
    for (let k = 1; k < idx.length - 1; k++) tris.push([pts[idx[0]], pts[idx[k]], pts[idx[k + 1]]]);
  }
  return tris;
}

/** Convex UV parts (same ±0.48 inset as the client collision tables) for a custom shape label, or null. */
export function customShapeConvexUvParts(label: string | null | undefined): Array<Array<[number, number]>> | null {
  const pts = decodeCustomShape(label);
  if (!pts) return null;
  return triangulate(pts).map((tri) =>
    tri.map(([x, y]) => [(x / 100 - 0.5) * 0.96, (y / 100 - 0.5) * 0.96] as [number, number]),
  );
}
