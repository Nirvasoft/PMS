// Centralized Unit Shape Catalog, Compact UI Families, Category Tabs & Convex Collision Polygons.
// Single source of truth for all 49 architectural unit shapes.

export type TileKind =
  | 'unit'
  | 'atrium'
  | 'stairs'
  | 'escalator'
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
  | 'crescent-l'
  | 'crescent-r'
  | 'crescent-t'
  | 'crescent-b'
  | 'pie-wedge'
  | 'wedge-tl'
  | 'wedge-tr'
  | 'wedge-bl'
  | 'wedge-br'
  | 'step-tl'
  | 'step-tr'
  | 'step-bl'
  | 'step-br'
  | 'step-t-mid'
  | 'step-b-mid'
  | 'wing-bend-l'
  | 'wing-bend-r'
  | 'u-court-t'
  | 'u-court-b'
  | 'slope-b-l'
  | 'slope-b-r'
  | 'slope-t-l'
  | 'slope-t-r'
  | 'slope-l-t'
  | 'slope-l-b'
  | 'slope-r-t'
  | 'slope-r-b'
  | 'bevel-l'
  | 'bevel-r'
  | 'bevel-t'
  | 'bevel-b'
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
  | 'notch-br-chamfer-tl'
  | 'notch-tr-chamfer-bl'
  | 'notch-bl-chamfer-tr'
  | 'notch-tl-chamfer-br'
  | 'arch-tl'
  | 'arch-tr'
  | 'arch-bl'
  | 'arch-br'
  | 'trapezoid'
  | 'trapezoid-l'
  | 'trapezoid-r'
  | 'custom';

export const UNIT_SHAPE_LABELS: Record<UnitShapeMode, string> = {
  rect: 'Rectangle (Standard)',
  circle: 'Circle / Oval',
  'ring-curve': 'Fan / Ring Sector',
  'trapezoid-ring': 'Curved Arch',
  'crescent-l': 'Inner Crescent (Left Arc)',
  'crescent-r': 'Inner Crescent (Right Arc)',
  'crescent-t': 'Inner Crescent (Top Arc)',
  'crescent-b': 'Inner Crescent (Bottom Arc)',
  'pie-wedge': 'Pie-Slice Wedge (Curved)',
  'wedge-tl': 'Triangle Wedge (Top-Left)',
  'wedge-tr': 'Triangle Wedge (Top-Right)',
  'wedge-bl': 'Triangle Wedge (Bottom-Left)',
  'wedge-br': 'Triangle Wedge (Bottom-Right)',
  'step-tl': 'Stepped Cutout (Top-Left)',
  'step-tr': 'Stepped Cutout (Top-Right)',
  'step-bl': 'Stepped Cutout (Bottom-Left)',
  'step-br': 'Stepped Cutout (Bottom-Right)',
  'step-t-mid': 'Center Alcove Notch (Top)',
  'step-b-mid': 'Center Alcove Notch (Bottom)',
  'wing-bend-l': 'Corner-Bend Wing (Left)',
  'wing-bend-r': 'Corner-Bend Wing (Right)',
  'u-court-t': 'U-Wing Courtyard (Top)',
  'u-court-b': 'U-Wing Courtyard (Bottom)',
  'slope-b-l': 'Slant Bottom (Up-Left)',
  'slope-b-r': 'Slant Bottom (Up-Right)',
  'slope-t-l': 'Slant Top (Down-Left)',
  'slope-t-r': 'Slant Top (Down-Right)',
  'slope-l-t': 'Slant Left Wall (Top-In)',
  'slope-l-b': 'Slant Left Wall (Bottom-In)',
  'slope-r-t': 'Slant Right Wall (Top-In)',
  'slope-r-b': 'Slant Right Wall (Bottom-In)',
  'bevel-l': 'Pointed Bevel End (Left)',
  'bevel-r': 'Pointed Bevel End (Right)',
  'bevel-t': 'Pointed Bevel End (Top)',
  'bevel-b': 'Pointed Bevel End (Bottom)',
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
  'notch-br-chamfer-tl': 'Kiosk Notch BR + Cut TL',
  'notch-tr-chamfer-bl': 'Kiosk Notch TR + Cut BL',
  'notch-bl-chamfer-tr': 'Kiosk Notch BL + Cut TR',
  'notch-tl-chamfer-br': 'Kiosk Notch TL + Cut BR',
  'arch-tl': 'Outer Ring Concave Wing (Top-Left)',
  'arch-tr': 'Outer Ring Concave Wing (Top-Right)',
  'arch-bl': 'Outer Ring Concave Wing (Bottom-Left)',
  'arch-br': 'Outer Ring Concave Wing (Bottom-Right)',
  trapezoid: 'Trapezoid (Symmetric)',
  'trapezoid-l': 'Trapezoid (Left Slant)',
  'trapezoid-r': 'Trapezoid (Right Slant)',
  custom: 'Custom Shape',
};

export const VALID_UNIT_SHAPE_MODES = new Set<UnitShapeMode>(
  Object.keys(UNIT_SHAPE_LABELS) as UnitShapeMode[],
);

export type UnitShapeCategoryId = 'all' | 'ring' | 'cut' | 'notch' | 'slant' | 'step' | 'basic';

export const UNIT_SHAPE_CATEGORY_TABS: ReadonlyArray<{ id: UnitShapeCategoryId; label: string }> = [
  { id: 'all', label: 'All Shapes' },
  { id: 'ring', label: 'Ring & Arc' },
  { id: 'cut', label: '45° Cut & Bevel' },
  { id: 'notch', label: 'Notch & Kiosk' },
  { id: 'slant', label: 'Slanted & Trapezoid' },
  { id: 'step', label: 'Stepped & Wing' },
  { id: 'basic', label: 'Basic & Polygon' },
];

export interface UnitShapeCompactFamily {
  id: string;
  title: string;
  subtitle: string;
  category: Exclude<UnitShapeCategoryId, 'all'>;
  variants: ReadonlyArray<UnitShapeMode>;
}

export const UNIT_SHAPE_COMPACT_FAMILIES: ReadonlyArray<UnitShapeCompactFamily> = [
  {
    id: 'rect-standard',
    title: 'Rectangle (Standard)',
    subtitle: 'Standard rectangular shop unit',
    category: 'ring',
    variants: ['rect'],
  },
  {
    id: 'circle-kiosk',
    title: 'Circle / Oval Kiosk',
    subtitle: 'Round or oval island kiosk unit',
    category: 'ring',
    variants: ['circle'],
  },
  {
    id: 'ring-sector',
    title: 'Fan / Ring Sector & Arch',
    subtitle: 'Curved fan sector or arch hugging a circular Atrium',
    category: 'ring',
    variants: ['ring-curve', 'trapezoid-ring'],
  },
  {
    id: 'outer-ring-wing',
    title: 'Outer Ring Concave Wing',
    subtitle: 'Corner anchor unit with deep diagonal concave arc hugging an inner ring',
    category: 'ring',
    variants: ['arch-tl', 'arch-tr', 'arch-bl', 'arch-br'],
  },
  {
    id: 'crescent-arc',
    title: 'Inner Crescent (Atrium Arc)',
    subtitle: 'Concave curved side hugging an oval/circle Atrium',
    category: 'ring',
    variants: ['crescent-l', 'crescent-r', 'crescent-t', 'crescent-b'],
  },
  {
    id: 'chamfer-corner',
    title: '45° Cut Corner (Chamfer)',
    subtitle: 'Diagonal corner cut facing an Octagonal Atrium or intersection',
    category: 'cut',
    variants: ['chamfer-tl', 'chamfer-tr', 'chamfer-bl', 'chamfer-br'],
  },
  {
    id: 'bevel-end',
    title: 'Pointed / Bevel Island End',
    subtitle: 'Double-chamfered pointed end for middle island rows',
    category: 'cut',
    variants: ['bevel-l', 'bevel-r', 'bevel-t', 'bevel-b'],
  },
  {
    id: 'curved-corner',
    title: 'Rounded Outer Corner',
    subtitle: 'Smooth convex rounded outer corner',
    category: 'cut',
    variants: ['curve-tl', 'curve-tr', 'curve-bl', 'curve-br'],
  },
  {
    id: 'concave-notch',
    title: 'Concave Corner Cutout (Notch)',
    subtitle: 'Quarter-circle concave corner cutout around a Kiosk or Atrium',
    category: 'notch',
    variants: ['notch-tl', 'notch-tr', 'notch-bl', 'notch-br'],
  },
  {
    id: 'notch-chamfer-combo',
    title: 'Kiosk Notch + Outer 45° Cut',
    subtitle: 'Inner Kiosk concave cutout + opposite outer 45° chamfer',
    category: 'notch',
    variants: [
      'notch-br-chamfer-tl',
      'notch-tr-chamfer-bl',
      'notch-bl-chamfer-tr',
      'notch-tl-chamfer-br',
    ],
  },
  {
    id: 'wedge-kiosk',
    title: 'Pie-Wedge & Triangle Kiosk',
    subtitle: 'Pie-slice sector or triangular corner unit',
    category: 'notch',
    variants: ['pie-wedge', 'wedge-tl', 'wedge-tr', 'wedge-bl', 'wedge-br'],
  },
  {
    id: 'slant-top-bottom',
    title: 'Slanted Top / Bottom Edge',
    subtitle: 'Angled top or bottom wall with vertical left/right walls',
    category: 'slant',
    variants: ['slope-b-l', 'slope-b-r', 'slope-t-l', 'slope-t-r'],
  },
  {
    id: 'slant-left-right',
    title: 'Slanted Left / Right Wall',
    subtitle: 'Angled left or right side wall with horizontal top/bottom edges',
    category: 'slant',
    variants: ['slope-l-t', 'slope-l-b', 'slope-r-t', 'slope-r-b'],
  },
  {
    id: 'trapezoid-taper',
    title: 'Tapered-Side Trapezoid',
    subtitle: 'Symmetric or single-side tapered trapezoid',
    category: 'slant',
    variants: ['trapezoid', 'trapezoid-l', 'trapezoid-r'],
  },
  {
    id: 'stepped-corner',
    title: 'Stepped L-Cutout & Alcove',
    subtitle: 'Rectangular corner step or center alcove cutout',
    category: 'step',
    variants: ['step-tl', 'step-tr', 'step-bl', 'step-br', 'step-t-mid', 'step-b-mid'],
  },
  {
    id: 'wing-courtyard',
    title: 'Corner-Bend & U-Courtyard',
    subtitle: 'Bent corridor wing or U-shaped courtyard anchor block',
    category: 'step',
    variants: ['wing-bend-l', 'wing-bend-r', 'u-court-t', 'u-court-b'],
  },
];

const CIRCLE_24_UV: ReadonlyArray<[number, number]> = Array.from({ length: 24 }, (_, i) => {
  const theta = (i * 2 * Math.PI) / 24;
  return [0.485 * Math.cos(theta), 0.485 * Math.sin(theta)] as [number, number];
});

/**
 * Single-source lookup table of normalized `[-0.5..0.5, -0.5..0.5]` convex collision sub-polygons
 * for each non-rectangular `UnitShapeMode`.
 */
export const UNIT_SHAPE_CONVEX_UV_PARTS: Partial<
  Record<UnitShapeMode, ReadonlyArray<ReadonlyArray<[number, number]>>>
> = {
  circle: [CIRCLE_24_UV],
  'ring-curve': [
    [[-0.22, -0.22], [0.22, -0.22], [0.22, 0.22], [-0.22, 0.22]],
  ],
  'trapezoid-ring': [
    [[-0.22, -0.22], [0.22, -0.22], [0.22, 0.22], [-0.22, 0.22]],
  ],
  'arch-tl': [
    [[-0.48, -0.48], [0.18, -0.48], [0.18, -0.24], [-0.48, -0.24]],
    [[-0.48, -0.48], [-0.24, -0.48], [-0.24, 0.48], [-0.48, 0.48]],
  ],
  'arch-tr': [
    [[-0.18, -0.48], [0.48, -0.48], [0.48, -0.24], [-0.18, -0.24]],
    [[0.24, -0.48], [0.48, -0.48], [0.48, 0.48], [0.24, 0.48]],
  ],
  'arch-bl': [
    [[-0.48, 0.24], [0.18, 0.24], [0.18, 0.48], [-0.48, 0.48]],
    [[-0.48, -0.48], [-0.24, -0.48], [-0.24, 0.48], [-0.48, 0.48]],
  ],
  'arch-br': [
    [[-0.18, 0.24], [0.48, 0.24], [0.48, 0.48], [-0.18, 0.48]],
    [[0.24, -0.48], [0.48, -0.48], [0.48, 0.48], [0.24, 0.48]],
  ],
  'slope-b-l': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.16]]],
  'slope-b-r': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.16], [-0.48, 0.48]]],
  'slope-t-l': [[[-0.48, -0.16], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48]]],
  'slope-t-r': [[[-0.48, -0.48], [0.48, -0.16], [0.48, 0.48], [-0.48, 0.48]]],
  'slope-l-t': [[[-0.16, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48]]],
  'slope-l-b': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.16, 0.48]]],
  'slope-r-t': [[[-0.48, -0.48], [0.16, -0.48], [0.48, 0.48], [-0.48, 0.48]]],
  'slope-r-b': [[[-0.48, -0.48], [0.48, -0.48], [0.16, 0.48], [-0.48, 0.48]]],
  'bevel-l': [[[-0.16, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.16, 0.48], [-0.48, 0]]],
  'bevel-r': [[[-0.48, -0.48], [0.16, -0.48], [0.48, 0], [0.16, 0.48], [-0.48, 0.48]]],
  'bevel-t': [[[0, -0.48], [0.48, -0.16], [0.48, 0.48], [-0.48, 0.48], [-0.48, -0.16]]],
  'bevel-b': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.16], [0, 0.48], [-0.48, 0.16]]],
  'chamfer-tr': [[[-0.48, -0.48], [0.08, -0.48], [0.48, -0.08], [0.48, 0.48], [-0.48, 0.48]]],
  'curve-tr': [[[-0.48, -0.48], [0.08, -0.48], [0.48, -0.08], [0.48, 0.48], [-0.48, 0.48]]],
  'chamfer-tl': [[[-0.08, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48], [-0.48, -0.08]]],
  'curve-tl': [[[-0.08, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48], [-0.48, -0.08]]],
  'chamfer-br': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.08], [0.08, 0.48], [-0.48, 0.48]]],
  'curve-br': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.08], [0.08, 0.48], [-0.48, 0.48]]],
  'chamfer-bl': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.08, 0.48], [-0.48, 0.08]]],
  'curve-bl': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.08, 0.48], [-0.48, 0.08]]],
  'notch-tl': [
    [[0.16, -0.48], [0.48, -0.48], [0.48, 0.48], [0.16, 0.48]],
    [[-0.48, 0.16], [0.48, 0.16], [0.48, 0.48], [-0.48, 0.48]],
  ],
  'step-tl': [
    [[0.12, -0.48], [0.48, -0.48], [0.48, 0.48], [0.12, 0.48]],
    [[-0.48, 0.12], [0.48, 0.12], [0.48, 0.48], [-0.48, 0.48]],
  ],
  'notch-tl-chamfer-br': [
    [[0.16, -0.48], [0.48, -0.48], [0.48, 0.08], [0.16, 0.48]],
    [[-0.48, 0.16], [0.44, 0.16], [0.08, 0.48], [-0.48, 0.48]],
  ],
  'notch-tr': [
    [[-0.48, -0.48], [-0.16, -0.48], [-0.16, 0.48], [-0.48, 0.48]],
    [[-0.48, 0.16], [0.48, 0.16], [0.48, 0.48], [-0.48, 0.48]],
  ],
  'step-tr': [
    [[-0.48, -0.48], [-0.12, -0.48], [-0.12, 0.48], [-0.48, 0.48]],
    [[-0.48, 0.12], [0.48, 0.12], [0.48, 0.48], [-0.48, 0.48]],
  ],
  'notch-tr-chamfer-bl': [
    [[-0.48, -0.48], [-0.16, -0.48], [-0.16, 0.48], [-0.48, 0.08]],
    [[-0.44, 0.16], [0.48, 0.16], [0.48, 0.48], [-0.08, 0.48]],
  ],
  'notch-br': [
    [[-0.48, -0.48], [0.48, -0.48], [0.48, -0.16], [-0.48, -0.16]],
    [[-0.48, -0.48], [-0.16, -0.48], [-0.16, 0.48], [-0.48, 0.48]],
  ],
  'step-br': [
    [[-0.48, -0.48], [0.48, -0.48], [0.48, -0.12], [-0.48, -0.12]],
    [[-0.48, -0.48], [-0.12, -0.48], [-0.12, 0.48], [-0.48, 0.48]],
  ],
  'notch-br-chamfer-tl': [
    [[-0.08, -0.48], [0.48, -0.48], [0.48, -0.16], [-0.44, -0.16]],
    [[-0.16, -0.48], [-0.16, 0.48], [-0.48, 0.48], [-0.48, -0.08]],
  ],
  'notch-bl': [
    [[-0.48, -0.48], [0.48, -0.48], [0.48, -0.16], [-0.48, -0.16]],
    [[0.16, -0.48], [0.48, -0.48], [0.48, 0.48], [0.16, 0.48]],
  ],
  'step-bl': [
    [[-0.48, -0.48], [0.48, -0.48], [0.48, -0.12], [-0.48, -0.12]],
    [[0.12, -0.48], [0.48, -0.48], [0.48, 0.48], [0.12, 0.48]],
  ],
  'notch-bl-chamfer-tr': [
    [[-0.48, -0.48], [0.08, -0.48], [0.44, -0.16], [-0.48, -0.16]],
    [[0.16, -0.48], [0.48, -0.08], [0.48, 0.48], [0.16, 0.48]],
  ],
  'crescent-l': [
    [[-0.44, -0.48], [0.48, -0.48], [0.48, 0], [-0.10, 0]],
    [[-0.10, 0], [0.48, 0], [0.48, 0.48], [-0.44, 0.48]],
  ],
  'crescent-r': [
    [[-0.48, -0.48], [0.44, -0.48], [0.10, 0], [-0.48, 0]],
    [[-0.48, 0], [0.10, 0], [0.44, 0.48], [-0.48, 0.48]],
  ],
  'crescent-t': [
    [[-0.48, -0.44], [0, -0.10], [0, 0.48], [-0.48, 0.48]],
    [[0, -0.10], [0.48, -0.44], [0.48, 0.48], [0, 0.48]],
  ],
  'crescent-b': [
    [[-0.48, -0.48], [0, -0.48], [0, 0.10], [-0.48, 0.44]],
    [[0, -0.48], [0.48, -0.48], [0.48, 0.44], [0, 0.10]],
  ],
  'step-t-mid': [
    [[-0.48, -0.48], [-0.22, -0.48], [-0.22, 0.48], [-0.48, 0.48]],
    [[-0.48, 0.02], [0.48, 0.02], [0.48, 0.48], [-0.48, 0.48]],
    [[0.22, -0.48], [0.48, -0.48], [0.48, 0.48], [0.22, 0.48]],
  ],
  'u-court-t': [
    [[-0.48, -0.48], [-0.22, -0.48], [-0.22, 0.48], [-0.48, 0.48]],
    [[-0.48, 0.02], [0.48, 0.02], [0.48, 0.48], [-0.48, 0.48]],
    [[0.22, -0.48], [0.48, -0.48], [0.48, 0.48], [0.22, 0.48]],
  ],
  'step-b-mid': [
    [[-0.48, -0.48], [-0.22, -0.48], [-0.22, 0.48], [-0.48, 0.48]],
    [[-0.48, -0.48], [0.48, -0.48], [0.48, -0.02], [-0.48, -0.02]],
    [[0.22, -0.48], [0.48, -0.48], [0.48, 0.48], [0.22, 0.48]],
  ],
  'u-court-b': [
    [[-0.48, -0.48], [-0.22, -0.48], [-0.22, 0.48], [-0.48, 0.48]],
    [[-0.48, -0.48], [0.48, -0.48], [0.48, -0.02], [-0.48, -0.02]],
    [[0.22, -0.48], [0.48, -0.48], [0.48, 0.48], [0.22, 0.48]],
  ],
  'pie-wedge': [[[-0.48, -0.48], [0.48, -0.48], [0.14, 0.48], [-0.14, 0.48]]],
  'wedge-tl': [[[-0.48, -0.48], [0.48, -0.48], [0.48, -0.32], [-0.32, 0.48], [-0.48, 0.48]]],
  'wedge-tr': [[[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [0.32, 0.48], [-0.48, -0.32]]],
  'wedge-bl': [[[-0.48, -0.48], [-0.32, -0.48], [0.48, 0.32], [0.48, 0.48], [-0.48, 0.48]]],
  'wedge-br': [[[0.32, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48], [-0.48, 0.32]]],
  'wing-bend-l': [
    [[-0.22, -0.48], [0.48, -0.48], [0.48, 0.04], [-0.48, 0.04], [-0.48, -0.14]],
    [[-0.48, -0.14], [0.06, 0.04], [-0.12, 0.48], [-0.48, 0.48]],
  ],
  'wing-bend-r': [
    [[-0.48, -0.48], [0.22, -0.48], [0.48, -0.14], [0.48, 0.04], [-0.48, 0.04]],
    [[-0.06, 0.04], [0.48, -0.14], [0.48, 0.48], [0.12, 0.48]],
  ],
  trapezoid: [[[-0.32, -0.48], [0.32, -0.48], [0.48, 0.48], [-0.48, 0.48]]],
  'trapezoid-l': [[[-0.24, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48]]],
  'trapezoid-r': [[[-0.48, -0.48], [0.24, -0.48], [0.48, 0.48], [-0.48, 0.48]]],
};

// ─── Custom (free-hand polygon) shapes ───────────────────────────────────────
// Stored in the tile label as `unit:custom:x,y;x,y;...` where x/y are 0..100 (% of the tile box).

export type CustomShapePoint = [number, number];

export const CUSTOM_SHAPE_MAX_POINTS = 96;
export const CUSTOM_SHAPE_MIN_POINTS = 3;
const CUSTOM_SHAPE_PREFIX = 'unit:custom:';

const roundPct = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

export function encodeCustomShape(points: ReadonlyArray<CustomShapePoint>): string {
  return (
    CUSTOM_SHAPE_PREFIX +
    points.map(([x, y]) => `${roundPct(x)},${roundPct(y)}`).join(';')
  );
}

/** Returns the polygon (0..100 %) stored in a label, or null when it is not a valid custom shape. */
export function decodeCustomShape(label: string | null | undefined): CustomShapePoint[] | null {
  if (!label || !label.startsWith(CUSTOM_SHAPE_PREFIX)) return null;
  const out: CustomShapePoint[] = [];
  for (const part of label.slice(CUSTOM_SHAPE_PREFIX.length).split(';')) {
    const [xs, ys] = part.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([roundPct(x), roundPct(y)]);
    if (out.length > CUSTOM_SHAPE_MAX_POINTS) return null;
  }
  return out.length >= CUSTOM_SHAPE_MIN_POINTS ? out : null;
}

function signedArea(pts: ReadonlyArray<ReadonlyArray<number>>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const crossOf = (o: ReadonlyArray<number>, a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function pointInTriangle(
  p: ReadonlyArray<number>,
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
  c: ReadonlyArray<number>,
): boolean {
  const d1 = crossOf(a, b, p);
  const d2 = crossOf(b, c, p);
  const d3 = crossOf(c, a, p);
  const hasNeg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
  const hasPos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
  return !(hasNeg && hasPos);
}

/** Ear-clipping triangulation (any simple polygon, convex or concave). */
function triangulatePolygon(
  pts: ReadonlyArray<CustomShapePoint>,
): Array<Array<CustomShapePoint>> {
  if (pts.length < 3) return [];
  const idx = pts.map((_, i) => i);
  if (signedArea(pts) < 0) idx.reverse();
  const tris: Array<Array<CustomShapePoint>> = [];
  let guard = 0;
  while (idx.length > 3 && guard < 500) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < idx.length; i += 1) {
      const a = idx[(i + idx.length - 1) % idx.length];
      const b = idx[i];
      const c = idx[(i + 1) % idx.length];
      if (crossOf(pts[a], pts[b], pts[c]) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) {
        if (j === a || j === b || j === c) continue;
        if (pointInTriangle(pts[j], pts[a], pts[b], pts[c])) {
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
    // Remaining polygon (or degenerate leftovers): fan from the first vertex.
    for (let k = 1; k < idx.length - 1; k += 1) {
      tris.push([pts[idx[0]], pts[idx[k]], pts[idx[k + 1]]]);
    }
  }
  return tris;
}

/**
 * Collision parts are drawn ~4 % inside the tile box so neighbours can hug curved sides. That inset must not
 * apply to the straight outer edges of the box, otherwise tiles are allowed to overlap them (up to ~0.5 cell on
 * big tiles) even with Allow Overlap off. Coordinates within 0.03 of the box edge are snapped onto it.
 */
export function snapUvPartsToBoxEdges(
  parts: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): Array<Array<[number, number]>> {
  const snap = (c: number) => (Math.abs(c) >= 0.47 ? Math.sign(c) * 0.5 : c);
  return parts.map((part) => part.map(([u, v]) => [snap(u), snap(v)] as [number, number]));
}

const MIRROR_TOKENS: Record<'h' | 'v', Record<string, string>> = {
  h: { l: 'r', r: 'l', tl: 'tr', tr: 'tl', bl: 'br', br: 'bl' },
  v: { t: 'b', b: 't', tl: 'bl', bl: 'tl', tr: 'br', br: 'tr' },
};

/** Mirror image of a preset shape mode ('h' = left/right flip, 'v' = top/bottom flip). Symmetric modes are returned as-is. */
export function mirrorUnitShapeMode(mode: UnitShapeMode, axis: 'h' | 'v'): UnitShapeMode {
  if (mode === 'rect' || mode === 'circle' || mode === 'custom' || mode === 'ring-curve' || mode === 'trapezoid-ring') {
    return mode;
  }
  const map = MIRROR_TOKENS[axis];
  const next = mode.split('-').map((tok) => map[tok] ?? tok).join('-') as UnitShapeMode;
  return VALID_UNIT_SHAPE_MODES.has(next) ? next : mode;
}

/** Mirror a free-hand polygon (0..100 %), keeping the point order so the outline stays a simple polygon. */
export function mirrorCustomPoints(points: ReadonlyArray<CustomShapePoint>, axis: 'h' | 'v'): CustomShapePoint[] {
  return points
    .map(([x, y]) => (axis === 'h' ? [100 - x, y] : [x, 100 - y]) as CustomShapePoint)
    .reverse();
}

/** Default radius (fraction of the tile) of the concave arc of Notch / Outer Ring Wing shapes. */
export const DEFAULT_SHAPE_RADIUS = 0.68;

/** Arc radius stored in a unit label as `unit:<mode>:r<percent>` (30..95), or null for the default. */
export function parseShapeRadius(label?: string | null): number | null {
  if (!label || !label.startsWith('unit:')) return null;
  const m = label.match(/:r(\d{2,3})(?::|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 30 && n <= 95 ? n / 100 : null;
}

export function encodeShapeRadius(mode: UnitShapeMode, radiusPct: number | null): string {
  if (radiusPct == null || Math.round(radiusPct) === Math.round(DEFAULT_SHAPE_RADIUS * 100)) return `unit:${mode}`;
  return `unit:${mode}:r${Math.round(radiusPct)}`;
}

/**
 * Exact convex decomposition of a simple polygon (0..100 % box) in UV space (box = -0.5..0.5): ear-clip triangles that are
 * merged back together while their union stays convex (Hertel-Mehlhorn). No inset, so outer edges collide exactly.
 */
export function polygonConvexUvParts(pts: ReadonlyArray<CustomShapePoint>): Array<Array<[number, number]>> {
  const same = (a: CustomShapePoint, b: CustomShapePoint) => a[0] === b[0] && a[1] === b[1];
  const isConvex = (poly: ReadonlyArray<CustomShapePoint>) =>
    poly.every((_, i) => crossOf(poly[i], poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]) >= -1e-9);

  const merge = (a: CustomShapePoint[], b: CustomShapePoint[]): CustomShapePoint[] | null => {
    for (let i = 0; i < a.length; i += 1) {
      const p = a[i];
      const q = a[(i + 1) % a.length];
      for (let j = 0; j < b.length; j += 1) {
        if (!same(b[j], q) || !same(b[(j + 1) % b.length], p)) continue;
        const out: CustomShapePoint[] = [];
        for (let k = 1; k <= a.length; k += 1) out.push(a[(i + k) % a.length]);
        for (let k = 2; k < b.length; k += 1) out.push(b[(j + k) % b.length]);
        return isConvex(out) ? out : null;
      }
    }
    return null;
  };

  const parts: CustomShapePoint[][] = triangulatePolygon(pts).map((t) => [...t]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const m = merge(parts[i], parts[j]) ?? merge(parts[j], parts[i]);
        if (!m) continue;
        parts[i] = m;
        parts.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return parts.map((poly) => poly.map(([x, y]) => [x / 100 - 0.5, y / 100 - 0.5] as [number, number]));
}

/** Convex collision parts (UV space, same inset as `UNIT_SHAPE_CONVEX_UV_PARTS`) for a custom polygon. */
export function customShapeConvexUvParts(
  pts: ReadonlyArray<CustomShapePoint> | null | undefined,
): ReadonlyArray<ReadonlyArray<[number, number]>> | undefined {
  if (!pts || pts.length < 3) return undefined;
  return triangulatePolygon(pts).map((tri) =>
    tri.map(([x, y]) => [(x / 100 - 0.5) * 0.96, (y / 100 - 0.5) * 0.96] as [number, number]),
  );
}

function segmentsCross(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
  c: ReadonlyArray<number>,
  d: ReadonlyArray<number>,
): boolean {
  const d1 = crossOf(a, b, c);
  const d2 = crossOf(a, b, d);
  const d3 = crossOf(c, d, a);
  const d4 = crossOf(c, d, b);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
    ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

/** True when no edges cross each other and the polygon has real area. */
export function isSimpleCustomPolygon(pts: ReadonlyArray<CustomShapePoint>): boolean {
  const n = pts.length;
  if (n < CUSTOM_SHAPE_MIN_POINTS) return false;
  if (Math.abs(signedArea(pts)) < 1) return false;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05) return false;
    for (let j = i + 1; j < n; j += 1) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(a, b, pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

/**
 * Replaces vertex `index` with a smooth quadratic-Bezier arc (polyline). Returns the new polygon and the
 * index range of the inserted points, or null when the cap would be exceeded / vertex is too short.
 */
export function roundCustomCorner(
  pts: ReadonlyArray<CustomShapePoint>,
  index: number,
  steps = 10,
  fraction = 0.4,
): { points: CustomShapePoint[]; from: number; to: number } | null {
  const n = pts.length;
  if (index < 0 || index >= n) return null;
  const maxExtra = CUSTOM_SHAPE_MAX_POINTS - n;
  const effSteps = Math.min(steps, maxExtra);
  if (effSteps < 2) return null;
  const p = pts[index];
  const a = pts[(index + n - 1) % n];
  const c = pts[(index + 1) % n];
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
  const lc = Math.hypot(c[0] - p[0], c[1] - p[1]);
  if (la < 1 || lc < 1) return null;
  const d = Math.max(0.1, Math.min(0.49, fraction)) * Math.min(la, lc);
  const p1: CustomShapePoint = [p[0] + ((a[0] - p[0]) * d) / la, p[1] + ((a[1] - p[1]) * d) / la];
  const p2: CustomShapePoint = [p[0] + ((c[0] - p[0]) * d) / lc, p[1] + ((c[1] - p[1]) * d) / lc];
  const arc: CustomShapePoint[] = [];
  for (let s = 0; s <= effSteps; s += 1) {
    const t = s / effSteps;
    const u = 1 - t;
    arc.push([
      roundPct(u * u * p1[0] + 2 * u * t * p[0] + t * t * p2[0]),
      roundPct(u * u * p1[1] + 2 * u * t * p[1] + t * t * p2[1]),
    ]);
  }
  const points = [...pts.slice(0, index), ...arc, ...pts.slice(index + 1)];
  return { points, from: index, to: index + arc.length - 1 };
}

/**
 * Bends straight edge `edgeIndex` (from `pts[edgeIndex]` to `pts[(edgeIndex + 1) % n]`) into a smooth
 * quadratic Bezier arc that passes directly through `throughPoint` at `t = 0.5`.
 */
export function bendCustomEdge(
  pts: ReadonlyArray<CustomShapePoint>,
  edgeIndex: number,
  throughPoint: CustomShapePoint,
  steps = 12,
): CustomShapePoint[] | null {
  const n = pts.length;
  if (edgeIndex < 0 || edgeIndex >= n) return null;
  const a = pts[edgeIndex];
  const b = pts[(edgeIndex + 1) % n];
  const dist = distToSegment(throughPoint, a, b);
  if (dist < 0.8) return pts.map((p) => [p[0], p[1]] as CustomShapePoint);
  const maxExtra = CUSTOM_SHAPE_MAX_POINTS - n;
  const effSteps = Math.min(steps, maxExtra + 1);
  if (effSteps < 2) return null;
  const cx = 2 * throughPoint[0] - 0.5 * (a[0] + b[0]);
  const cy = 2 * throughPoint[1] - 0.5 * (a[1] + b[1]);
  const inner: CustomShapePoint[] = [];
  for (let s = 1; s < effSteps; s += 1) {
    const t = s / effSteps;
    const u = 1 - t;
    inner.push([
      roundPct(u * u * a[0] + 2 * u * t * cx + t * t * b[0]),
      roundPct(u * u * a[1] + 2 * u * t * cy + t * t * b[1]),
    ]);
  }
  return [...pts.slice(0, edgeIndex + 1), ...inner, ...pts.slice(edgeIndex + 1)];
}

/**
 * Evaluates a smooth open curve through control chain `chain` (keeping `chain[0]` and `chain[last]` pinned),
 * first relaxing interior kinks with Laplacian averaging and then sampling a Centripetal Catmull-Rom spline.
 */
function smoothOpenChain(chain: ReadonlyArray<CustomShapePoint>, targetCount: number): CustomShapePoint[] {
  if (chain.length <= 2) return chain.map((p) => [p[0], p[1]] as CustomShapePoint);
  let relaxed = chain.map((p) => [p[0], p[1]] as CustomShapePoint);
  for (let pass = 0; pass < 2; pass += 1) {
    const next = relaxed.map((p) => [p[0], p[1]] as CustomShapePoint);
    for (let i = 1; i < relaxed.length - 1; i += 1) {
      next[i] = [
        0.25 * relaxed[i - 1][0] + 0.5 * relaxed[i][0] + 0.25 * relaxed[i + 1][0],
        0.25 * relaxed[i - 1][1] + 0.5 * relaxed[i][1] + 0.25 * relaxed[i + 1][1],
      ];
    }
    relaxed = next;
  }

  // Chaikin corner-cutting with pinned endpoints + uniform arc-length resampling
  let dense = relaxed;
  for (let iter = 0; iter < 3; iter += 1) {
    const sub: CustomShapePoint[] = [dense[0]];
    for (let i = 0; i < dense.length - 1; i += 1) {
      const p = dense[i];
      const q = dense[i + 1];
      if (i > 0) sub.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      if (i < dense.length - 2) sub.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    sub.push(dense[dense.length - 1]);
    dense = sub;
  }

  const cumLen: number[] = [0];
  for (let i = 1; i < dense.length; i += 1) {
    const d = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    cumLen.push(cumLen[i - 1] + d);
  }
  const totalLen = cumLen[cumLen.length - 1];
  if (totalLen < 1e-3) return [chain[0], chain[chain.length - 1]];

  const steps = Math.max(4, targetCount - 1);
  const out: CustomShapePoint[] = [[roundPct(chain[0][0]), roundPct(chain[0][1])]];
  for (let s = 1; s < steps; s += 1) {
    const targetD = (s / steps) * totalLen;
    let k = 0;
    while (k < cumLen.length - 2 && cumLen[k + 1] < targetD) k += 1;
    const segLen = cumLen[k + 1] - cumLen[k];
    const t = segLen > 1e-6 ? (targetD - cumLen[k]) / segLen : 0;
    out.push([
      roundPct(dense[k][0] + t * (dense[k + 1][0] - dense[k][0])),
      roundPct(dense[k][1] + t * (dense[k + 1][1] - dense[k][1])),
    ]);
  }
  out.push([roundPct(chain[chain.length - 1][0]), roundPct(chain[chain.length - 1][1])]);
  return out;
}

/**
 * Smooths jagged/hand-drawn curved chains of a custom polygon while keeping straight horizontal & vertical
 * walls and their 90° corners crisp. If `selectedIndex` is provided, smooths the curved chain containing
 * that vertex (or rounds that corner if it lies between two straight walls).
 */
export function smoothCustomPolygon(
  pts: ReadonlyArray<CustomShapePoint>,
  selectedIndex?: number | null,
  cornerFraction = 0.4,
): CustomShapePoint[] | null {
  const n = pts.length;
  if (n < 3) return null;

  const isOrthoEdge = (i: number): boolean => {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    const len = Math.hypot(dx, dy);
    if (len < 3.5) return false;
    return dx <= 0.8 || dy <= 0.8;
  };

  const orthoFlags = Array.from({ length: n }, (_, i) => isOrthoEdge(i));
  const firstOrtho = orthoFlags.findIndex((f) => f);

  // If no orthogonal walls exist at all, smooth around the selected vertex or Chaikin-smooth the whole ring
  if (firstOrtho === -1) {
    if (selectedIndex != null && selectedIndex >= 0 && selectedIndex < n) {
      const prev = (selectedIndex + n - 1) % n;
      const next = (selectedIndex + 1) % n;
      const mid: CustomShapePoint = [
        roundPct(0.25 * pts[prev][0] + 0.5 * pts[selectedIndex][0] + 0.25 * pts[next][0]),
        roundPct(0.25 * pts[prev][1] + 0.5 * pts[selectedIndex][1] + 0.25 * pts[next][1]),
      ];
      return pts.map((p, idx) => (idx === selectedIndex ? mid : p));
    }
    const relaxed = pts.map((_, i) => {
      const a = pts[(i + n - 1) % n];
      const b = pts[i];
      const c = pts[(i + 1) % n];
      return [
        roundPct(0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0]),
        roundPct(0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1]),
      ] as CustomShapePoint;
    });
    return isSimpleCustomPolygon(relaxed) ? relaxed : null;
  }

  // Walk the polygon starting at `firstOrtho` and collect contiguous runs of non-orthogonal edges
  interface ChainRun {
    indices: number[]; // vertex indices from anchorStart .. anchorEnd inclusive
  }
  const runs: ChainRun[] = [];
  let offset = 0;
  while (offset < n) {
    const eIdx = (firstOrtho + offset) % n;
    if (orthoFlags[eIdx]) {
      offset += 1;
      continue;
    }
    const indices: number[] = [eIdx];
    while (offset < n && !orthoFlags[(firstOrtho + offset) % n]) {
      offset += 1;
      indices.push((firstOrtho + offset) % n);
    }
    if (indices.length >= 3) {
      runs.push({ indices });
    }
  }

  // If user selected a vertex: either smooth the curved run it belongs to, or round that sharp corner
  let targetRuns = runs;
  if (selectedIndex != null && selectedIndex >= 0 && selectedIndex < n) {
    const matchingRun = runs.find((r) => r.indices.includes(selectedIndex));
    if (!matchingRun) {
      const rounded = roundCustomCorner(pts, selectedIndex, 10, cornerFraction);
      return rounded && isSimpleCustomPolygon(rounded.points) ? rounded.points : null;
    }
    targetRuns = [matchingRun];
  }

  if (targetRuns.length === 0) return null;

  // Smooth target multi-segment non-orthogonal runs while keeping orthogonal walls untouched
  let current = pts.map((p) => [p[0], p[1]] as CustomShapePoint);
  for (const r of targetRuns) {
    const chainPts = r.indices.map((idx) => pts[idx]);
    // Find where start & end anchor vertices sit in `current`
    const aStart = chainPts[0];
    const aEnd = chainPts[chainPts.length - 1];
    const sIdx = current.findIndex((p) => p[0] === aStart[0] && p[1] === aStart[1]);
    const eIdx = current.findIndex((p) => p[0] === aEnd[0] && p[1] === aEnd[1]);
    if (sIdx === -1 || eIdx === -1) continue;
    const budget = Math.min(14, Math.max(chainPts.length + 4, 10), CUSTOM_SHAPE_MAX_POINTS - (current.length - chainPts.length));
    if (budget < 3) continue;
    const smoothedChain = smoothOpenChain(chainPts, budget);
    const nextPoly: CustomShapePoint[] = [];
    if (sIdx < eIdx) {
      nextPoly.push(...current.slice(0, sIdx), ...smoothedChain, ...current.slice(eIdx + 1));
    } else {
      nextPoly.push(...smoothedChain, ...current.slice(eIdx + 1, sIdx));
    }
    if (isSimpleCustomPolygon(nextPoly)) {
      current = nextPoly;
    }
  }
  return current;
}

type CustomShapePresetGroup = 'triangle' | 'polygon' | 'round' | 'letter';

export const CUSTOM_SHAPE_GROUPS: ReadonlyArray<{ id: CustomShapePresetGroup; label: string }> = [
  { id: 'triangle', label: 'Triangles' },
  { id: 'polygon', label: 'Polygons' },
  { id: 'round', label: 'Round & Curved' },
  { id: 'letter', label: 'Letter & Cross' },
];

const presetR1 = (n: number) => Math.round(n * 10) / 10;

/** Sample `steps + 1` points of a parametric curve (u = 0..1) into a rounded 0..100 % polygon. */
function sampleCurve(steps: number, fn: (u: number) => [number, number]): CustomShapePoint[] {
  const out: CustomShapePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const [x, y] = fn(i / steps);
    out.push([presetR1(x), presetR1(y)]);
  }
  return out;
}

/** Half-ellipse filling the whole box. `flat` is the straight edge. */
function halfCircle(flat: 'bottom' | 'top' | 'right' | 'left'): CustomShapePoint[] {
  return sampleCurve(14, (u) => {
    const a = Math.PI * u;
    if (flat === 'bottom') return [50 - 50 * Math.cos(a), 100 - 100 * Math.sin(a)];
    if (flat === 'top') return [50 - 50 * Math.cos(a), 100 * Math.sin(a)];
    if (flat === 'right') return [100 - 100 * Math.sin(a), 50 - 50 * Math.cos(a)];
    return [100 * Math.sin(a), 50 - 50 * Math.cos(a)];
  });
}

/** Quarter-ellipse with the right angle at box corner (cx, cy) - each 0 or 100. */
function quarterCircle(cx: 0 | 100, cy: 0 | 100): CustomShapePoint[] {
  const ax = 100 - cx; // other corner along x
  const by = 100 - cy; // other corner along y
  const arc = sampleCurve(10, (u) => {
    const a = (Math.PI / 2) * u;
    // u = 0 -> corner (cx, by), u = 1 -> corner (ax, cy)
    return [cx + (ax - cx) * Math.sin(a), cy + (by - cy) * Math.cos(a)];
  });
  return [[cx, cy], ...arc];
}

/** Rectangle with elliptical corners (rx / ry in % of the box). */
function roundedRect(rx: number, ry: number, steps = 6): CustomShapePoint[] {
  const corners: Array<[number, number, number]> = [
    [rx, ry, Math.PI], // top-left
    [100 - rx, ry, 1.5 * Math.PI], // top-right
    [100 - rx, 100 - ry, 0], // bottom-right
    [rx, 100 - ry, 0.5 * Math.PI], // bottom-left
  ];
  const out: CustomShapePoint[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let s = 0; s <= steps; s += 1) {
      const a = a0 + (Math.PI / 2) * (s / steps);
      out.push([presetR1(cx + rx * Math.cos(a)), presetR1(cy + ry * Math.sin(a))]);
    }
  }
  return out;
}

/** Ring with an opening on the right (a hollow donut is not a single simple polygon, so it is cut open). */
function cRing(): CustomShapePoint[] {
  const out: CustomShapePoint[] = [];
  const toRad = (d: number) => (d * Math.PI) / 180;
  for (let d = 30; d <= 330; d += 15) out.push([presetR1(50 + 50 * Math.cos(toRad(d))), presetR1(50 + 50 * Math.sin(toRad(d)))]);
  for (let d = 330; d >= 30; d -= 15) out.push([presetR1(50 + 27 * Math.cos(toRad(d))), presetR1(50 + 27 * Math.sin(toRad(d)))]);
  return out;
}

export const CUSTOM_SHAPE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  group: CustomShapePresetGroup;
  points: ReadonlyArray<CustomShapePoint>;
}> = [
  { id: 'rect', label: 'Rectangle', group: 'polygon', points: [[0, 0], [100, 0], [100, 100], [0, 100]] },
  // Triangles
  { id: 'triangle', label: 'Triangle (Up)', group: 'triangle', points: [[50, 0], [100, 100], [0, 100]] },
  { id: 'triangle-down', label: 'Triangle (Down)', group: 'triangle', points: [[0, 0], [100, 0], [50, 100]] },
  { id: 'triangle-left', label: 'Triangle (Left)', group: 'triangle', points: [[100, 0], [100, 100], [0, 50]] },
  { id: 'triangle-right', label: 'Triangle (Right)', group: 'triangle', points: [[0, 0], [100, 50], [0, 100]] },
  { id: 'right-tri-tl', label: 'Right Tri (Top-Left)', group: 'triangle', points: [[0, 0], [100, 0], [0, 100]] },
  { id: 'right-tri-tr', label: 'Right Tri (Top-Right)', group: 'triangle', points: [[0, 0], [100, 0], [100, 100]] },
  { id: 'right-tri-bl', label: 'Right Tri (Bottom-Left)', group: 'triangle', points: [[0, 0], [0, 100], [100, 100]] },
  { id: 'right-tri-br', label: 'Right Tri (Bottom-Right)', group: 'triangle', points: [[100, 0], [100, 100], [0, 100]] },
  // Polygons
  { id: 'trapezoid', label: 'Trapezoid', group: 'polygon', points: [[25, 0], [75, 0], [100, 100], [0, 100]] },
  { id: 'parallelogram', label: 'Parallelogram', group: 'polygon', points: [[25, 0], [100, 0], [75, 100], [0, 100]] },
  { id: 'diamond', label: 'Diamond', group: 'polygon', points: [[50, 0], [100, 50], [50, 100], [0, 50]] },
  { id: 'pentagon', label: 'Pentagon', group: 'polygon', points: [[50, 0], [100, 38], [81, 100], [19, 100], [0, 38]] },
  { id: 'hexagon', label: 'Hexagon', group: 'polygon', points: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]] },
  {
    id: 'octagon',
    label: 'Octagon',
    group: 'polygon',
    points: [[29.3, 0], [70.7, 0], [100, 29.3], [100, 70.7], [70.7, 100], [29.3, 100], [0, 70.7], [0, 29.3]],
  },
  { id: 'chevron', label: 'Chevron', group: 'polygon', points: [[0, 0], [60, 0], [100, 50], [60, 100], [0, 100], [40, 50]] },
  { id: 'arrow', label: 'Arrow', group: 'polygon', points: [[0, 30], [60, 30], [60, 0], [100, 50], [60, 100], [60, 70], [0, 70]] },
  // Round & curved
  { id: 'half-circle-top', label: 'Half-circle (Dome)', group: 'round', points: halfCircle('bottom') },
  { id: 'half-circle-bottom', label: 'Half-circle (Bowl)', group: 'round', points: halfCircle('top') },
  { id: 'half-circle-left', label: 'Half-circle (Left)', group: 'round', points: halfCircle('right') },
  { id: 'half-circle-right', label: 'Half-circle (Right)', group: 'round', points: halfCircle('left') },
  { id: 'quarter-tl', label: 'Quarter-circle (Top-Left)', group: 'round', points: quarterCircle(0, 0) },
  { id: 'quarter-tr', label: 'Quarter-circle (Top-Right)', group: 'round', points: quarterCircle(100, 0) },
  { id: 'quarter-bl', label: 'Quarter-circle (Bottom-Left)', group: 'round', points: quarterCircle(0, 100) },
  { id: 'quarter-br', label: 'Quarter-circle (Bottom-Right)', group: 'round', points: quarterCircle(100, 100) },
  { id: 'rounded-rect', label: 'Rounded Rectangle', group: 'round', points: roundedRect(18, 18) },
  { id: 'rounded-rect-lg', label: 'Rounded (Large)', group: 'round', points: roundedRect(35, 35) },
  { id: 'c-ring', label: 'C-ring (Open Donut)', group: 'round', points: cRing() },
  // Letters & crosses
  { id: 'l-shape', label: 'L-shape', group: 'letter', points: [[0, 0], [50, 0], [50, 50], [100, 50], [100, 100], [0, 100]] },
  { id: 't-shape', label: 'T-shape', group: 'letter', points: [[0, 0], [100, 0], [100, 35], [65, 35], [65, 100], [35, 100], [35, 35], [0, 35]] },
  {
    id: 'plus',
    label: 'Plus / Cross',
    group: 'letter',
    points: [[35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35]],
  },
  { id: 's-shape', label: 'S-shape', group: 'letter', points: [[0, 0], [65, 0], [65, 35], [100, 35], [100, 100], [35, 100], [35, 65], [0, 65]] },
  { id: 'z-shape', label: 'Z-shape', group: 'letter', points: [[35, 0], [100, 0], [100, 65], [65, 65], [65, 100], [0, 100], [0, 35], [35, 35]] },
];

/** Best-effort polygon (0..100 %) for an existing preset shape mode, used as the editor starting point. */
export function customShapeFromMode(mode: UnitShapeMode): { points: CustomShapePoint[]; approximate: boolean } {
  const rect: CustomShapePoint[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  if (mode === 'custom' || mode === 'rect') return { points: rect, approximate: false };
  const parts = UNIT_SHAPE_CONVEX_UV_PARTS[mode];
  if (!parts || parts.length !== 1 || mode === 'ring-curve' || mode === 'trapezoid-ring') {
    return { points: rect, approximate: true };
  }
  const points = parts[0].map(
    ([u, v]) => [roundPct((u / 0.96 + 0.5) * 100), roundPct((v / 0.96 + 0.5) * 100)] as CustomShapePoint,
  );
  const curved = /curve|crescent|arch|pie|circle|ring/.test(mode);
  return { points, approximate: curved };
}

/** Polygon parts (0..100 % of the tile box) that make up a unit shape, or null when the shape is a plain box/ellipse. */
function shapePolygonParts(mode: string | null | undefined, label: string | null | undefined): CustomShapePoint[][] | null {
  if (!mode || mode === 'rect' || mode === 'circle' || mode === 'ring-curve' || mode === 'trapezoid-ring') return null;
  if (mode === 'custom') {
    const pts = decodeCustomShape(label);
    return pts ? [pts.map((p) => [p[0], p[1]] as CustomShapePoint)] : null;
  }
  if (mode === 'arch-tl' || mode === 'arch-tr' || mode === 'arch-bl' || mode === 'arch-br') {
    // Outer Ring Concave Wing: the real outline (same formulas as the renderer, without the ring-hugging clamp).
    const K = 16;
    const R = parseShapeRadius(label) ?? DEFAULT_SHAPE_RADIUS;
    const arc: CustomShapePoint[] = [];
    for (let k = 0; k <= K; k += 1) {
      const th = (k / K) * (Math.PI / 2);
      if (mode === 'arch-tl') arc.push([1 - R * Math.cos(th), 1 - Math.sin(th)]);
      else if (mode === 'arch-tr') arc.push([R * Math.cos(th), 1 - Math.sin(th)]);
      else if (mode === 'arch-bl') arc.push([1 - R * Math.sin(th), Math.cos(th)]);
      else arc.push([R * Math.sin(th), Math.cos(th)]);
    }
    const poly: CustomShapePoint[] =
      mode === 'arch-tl'
        ? [[0, 0], [0, 1], ...arc]
        : mode === 'arch-bl'
          ? [...arc, [0, 0], [0, 1]]
          : mode === 'arch-tr'
            ? [[1, 0], [1, 1], ...arc]
            : [...arc, [1, 0], [1, 1]];
    return [poly.map(([u, v]) => [u * 100, v * 100] as CustomShapePoint)];
  }
  const parts = UNIT_SHAPE_CONVEX_UV_PARTS[mode as UnitShapeMode];
  if (!parts || parts.length === 0) return null;
  return parts.map((part) =>
    part.map(([u, v]) => [(u / 0.96 + 0.5) * 100, (v / 0.96 + 0.5) * 100] as CustomShapePoint),
  );
}

function pointInPolygon(x: number, y: number, poly: ReadonlyArray<CustomShapePoint>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const badgeSpotCache = new Map<string, { cx: number; cy: number; r: number } | null>();

/**
 * Best place for a round badge (status icon) inside a non-rectangular unit shape: the point of the
 * shape that is furthest from its edges, in tile pixels, plus the radius of the circle that fits there.
 * Returns null for plain boxes / ellipses (the tile centre is already right).
 */
export function shapeBadgeSpot(
  mode: string | null | undefined,
  label: string | null | undefined,
  wPx: number,
  hPx: number,
): { cx: number; cy: number; r: number } | null {
  const w = Math.max(1, Math.round(wPx));
  const h = Math.max(1, Math.round(hPx));
  const cacheKey = `${mode}|${mode === 'custom' ? label : ''}|${w}x${h}`;
  if (badgeSpotCache.has(cacheKey)) return badgeSpotCache.get(cacheKey) ?? null;

  const parts = shapePolygonParts(mode, label);
  let best: { cx: number; cy: number; r: number } | null = null;
  if (parts) {
    for (const part of parts) {
      const px = part.map(([x, y]) => [(x / 100) * w, (y / 100) * h] as CustomShapePoint);
      const minX = Math.min(...px.map((p) => p[0]));
      const maxX = Math.max(...px.map((p) => p[0]));
      const minY = Math.min(...px.map((p) => p[1]));
      const maxY = Math.max(...px.map((p) => p[1]));
      const score = (x: number, y: number) => {
        let d = Infinity;
        for (let i = 0; i < px.length; i += 1) {
          d = Math.min(d, distToSegment([x, y], px[i], px[(i + 1) % px.length]));
        }
        return pointInPolygon(x, y, px) ? d : -d;
      };
      let bx = (minX + maxX) / 2;
      let by = (minY + maxY) / 2;
      let bs = score(bx, by);
      let stepX = (maxX - minX) / 24;
      let stepY = (maxY - minY) / 24;
      let x0 = minX;
      let x1 = maxX;
      let y0 = minY;
      let y1 = maxY;
      for (let pass = 0; pass < 3; pass += 1) {
        for (let x = x0; x <= x1 + 1e-6; x += stepX || 1) {
          for (let y = y0; y <= y1 + 1e-6; y += stepY || 1) {
            const s = score(x, y);
            if (s > bs) {
              bs = s;
              bx = x;
              by = y;
            }
          }
        }
        x0 = Math.max(minX, bx - stepX * 1.5);
        x1 = Math.min(maxX, bx + stepX * 1.5);
        y0 = Math.max(minY, by - stepY * 1.5);
        y1 = Math.min(maxY, by + stepY * 1.5);
        stepX /= 5;
        stepY /= 5;
      }
      if (bs > 0 && (!best || bs > best.r)) best = { cx: bx, cy: by, r: bs };
    }
  }
  if (badgeSpotCache.size > 400) badgeSpotCache.clear();
  badgeSpotCache.set(cacheKey, best);
  return best;
}

/** Distance from point p to the segment a-b. */
function distToSegment(p: CustomShapePoint, a: CustomShapePoint, b: CustomShapePoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(pts: CustomShapePoint[], tol: number): CustomShapePoint[] {
  if (pts.length <= 2) return pts;
  let maxD = 0;
  let idx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = distToSegment(pts[i], first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [first, last];
  const left = douglasPeucker(pts.slice(0, idx + 1), tol);
  const right = douglasPeucker(pts.slice(idx), tol);
  return [...left.slice(0, -1), ...right];
}

/**
 * Reduces a closed polygon (0..100 %) to at most `maxPoints` vertices while keeping its overall outline.
 * Used when a complex preset (many curve samples) is converted into an editable custom shape.
 */
export function simplifyCustomPolygon(
  pts: ReadonlyArray<CustomShapePoint>,
  maxPoints = 60,
): CustomShapePoint[] {
  // Drop consecutive duplicates / near-duplicates first.
  const dedup: CustomShapePoint[] = [];
  for (const p of pts) {
    const q: CustomShapePoint = [roundPct(p[0]), roundPct(p[1])];
    const prev = dedup[dedup.length - 1];
    if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) >= 0.3) dedup.push(q);
  }
  if (dedup.length > 1) {
    const f = dedup[0];
    const l = dedup[dedup.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.3) dedup.pop();
  }
  if (dedup.length <= maxPoints) return dedup;

  // Anchor on the vertex farthest from the first one so the ring splits into two open chains.
  let far = 1;
  let farD = 0;
  for (let i = 1; i < dedup.length; i += 1) {
    const d = Math.hypot(dedup[i][0] - dedup[0][0], dedup[i][1] - dedup[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const chainA = dedup.slice(0, far + 1);
  const chainB = [...dedup.slice(far), dedup[0]];
  let tol = 0.2;
  for (let guard = 0; guard < 40; guard += 1) {
    const a = douglasPeucker(chainA, tol);
    const b = douglasPeucker(chainB, tol);
    const ring = [...a.slice(0, -1), ...b.slice(0, -1)];
    if (ring.length <= maxPoints) return ring;
    tol *= 1.4;
  }
  return dedup.filter((_, i) => i % Math.ceil(dedup.length / maxPoints) === 0);
}

/**
 * Keeps the shop name inside a custom polygon. The label normally sits at the tile-box centre, which can fall
 * in a notch of an L/U/C shape. Returns the pixel offset (from the box centre) to the roomiest interior spot,
 * or `null` when the box centre is already comfortably inside (so existing shapes do not change).
 */
export function customShapeLabelOffsetPx(
  pts: ReadonlyArray<CustomShapePoint>,
  wPx: number,
  hPx: number,
): { x: number; y: number } | null {
  if (pts.length < 3 || wPx <= 0 || hPx <= 0) return null;
  const poly = pts.map(([x, y]) => [(x / 100) * wPx, (y / 100) * hPx] as [number, number]);
  const inside = (px: number, py: number): boolean => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const clearance = (px: number, py: number): number => {
    let best = Infinity;
    for (let i = 0; i < poly.length; i += 1) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
    return best;
  };
  const cx = wPx / 2;
  const cy = hPx / 2;
  const centreClear = inside(cx, cy) ? clearance(cx, cy) : 0;
  let bestX = cx;
  let bestY = cy;
  let bestClear = centreClear;
  const STEPS = 28;
  for (let iy = 0; iy <= STEPS; iy += 1) {
    for (let ix = 0; ix <= STEPS; ix += 1) {
      const px = (ix / STEPS) * wPx;
      const py = (iy / STEPS) * hPx;
      if (!inside(px, py)) continue;
      const c = clearance(px, py);
      if (c > bestClear) {
        bestClear = c;
        bestX = px;
        bestY = py;
      }
    }
  }
  // Centre is fine when it is inside and not much tighter than the best spot.
  if (centreClear > 0 && centreClear >= bestClear * 0.75) return null;
  const ox = Math.round(bestX - cx);
  const oy = Math.round(bestY - cy);
  return ox === 0 && oy === 0 ? null : { x: ox, y: oy };
}
