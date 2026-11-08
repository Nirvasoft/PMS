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

export type UnitShapeCategoryId = 'all' | 'ring' | 'cut' | 'notch' | 'slant' | 'step';

export const UNIT_SHAPE_CATEGORY_TABS: ReadonlyArray<{ id: UnitShapeCategoryId; label: string }> = [
  { id: 'all', label: 'All Shapes' },
  { id: 'ring', label: 'Ring & Arc' },
  { id: 'cut', label: '45° Cut & Bevel' },
  { id: 'notch', label: 'Notch & Kiosk' },
  { id: 'slant', label: 'Slanted & Trapezoid' },
  { id: 'step', label: 'Stepped & Wing' },
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

export const CUSTOM_SHAPE_MAX_POINTS = 64;
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
  steps = 6,
  fraction = 0.4,
): { points: CustomShapePoint[]; from: number; to: number } | null {
  const n = pts.length;
  if (index < 0 || index >= n) return null;
  if (n - 1 + steps + 1 > CUSTOM_SHAPE_MAX_POINTS) return null;
  const p = pts[index];
  const a = pts[(index + n - 1) % n];
  const c = pts[(index + 1) % n];
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
  const lc = Math.hypot(c[0] - p[0], c[1] - p[1]);
  if (la < 1 || lc < 1) return null;
  const d = fraction * Math.min(la, lc);
  const p1: CustomShapePoint = [p[0] + ((a[0] - p[0]) * d) / la, p[1] + ((a[1] - p[1]) * d) / la];
  const p2: CustomShapePoint = [p[0] + ((c[0] - p[0]) * d) / lc, p[1] + ((c[1] - p[1]) * d) / lc];
  const arc: CustomShapePoint[] = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const u = 1 - t;
    arc.push([
      roundPct(u * u * p1[0] + 2 * u * t * p[0] + t * t * p2[0]),
      roundPct(u * u * p1[1] + 2 * u * t * p[1] + t * t * p2[1]),
    ]);
  }
  const points = [...pts.slice(0, index), ...arc, ...pts.slice(index + 1)];
  return { points, from: index, to: index + arc.length - 1 };
}

export const CUSTOM_SHAPE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  points: ReadonlyArray<CustomShapePoint>;
}> = [
  { id: 'rect', label: 'Rectangle', points: [[0, 0], [100, 0], [100, 100], [0, 100]] },
  { id: 'triangle', label: 'Triangle', points: [[50, 0], [100, 100], [0, 100]] },
  { id: 'trapezoid', label: 'Trapezoid', points: [[25, 0], [75, 0], [100, 100], [0, 100]] },
  { id: 'parallelogram', label: 'Parallelogram', points: [[25, 0], [100, 0], [75, 100], [0, 100]] },
  { id: 'l-shape', label: 'L-shape', points: [[0, 0], [50, 0], [50, 50], [100, 50], [100, 100], [0, 100]] },
  { id: 'pentagon', label: 'Pentagon', points: [[50, 0], [100, 38], [81, 100], [19, 100], [0, 38]] },
  { id: 'hexagon', label: 'Hexagon', points: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]] },
  { id: 'arrow', label: 'Arrow', points: [[0, 30], [60, 30], [60, 0], [100, 50], [60, 100], [60, 70], [0, 70]] },
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
