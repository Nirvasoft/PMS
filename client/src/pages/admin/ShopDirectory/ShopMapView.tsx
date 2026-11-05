import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout';
import { absoluteStrategy } from 'react-grid-layout/core';
import 'react-grid-layout/css/styles.css';
import toast from 'react-hot-toast';
import {
  RotateCw, X, Pencil, Save, Plus, Maximize2, Trash2, LayoutGrid,
  Map as MapIcon, QrCode, Navigation, MapPin, Layers, Magnet,
  Printer, Copy, ExternalLink, Info, ArrowRight, WifiOff, ChevronDown,
  Compass, CornerUpLeft, CornerUpRight, MoveUp,
  Image as ImageIcon, Eye, EyeOff, Lock, Unlock, Wand2,
} from 'lucide-react';
import {
  useGetFloorPlanQuery,
  useLazyGetFloorPlanQuery,
  useGetPublicFloorPlanQuery,
  useSaveFloorPlanMutation,
  useGetMallQrCodeQuery,
} from '../../../store/api/mallApi';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import {
  DECORATION_DEFAULT_SIZES, DECORATION_LABELS, DEFAULT_COLUMNS, DEFAULT_SQFT_PER_CELL,
  SHOP_CATEGORIES, compareShopsByUnitNumber, findFreeSpot, findSpotNextToAnchor, findNextRingSectorPlacement, addConnectedUnitWing, snapTileToBorder, curveUnitAroundCircleWithoutSnap, alignUnitsRadiallyAroundAtrium, alignUnitToNearestCircleAtrium, computeMagneticSnapGuide, addTransitIntoAtrium, isTransitLandmark, floorKeyOf, tilesConflict, hasAnyOverlap,
  tileSizeFromSqft, calibrateSqftPerCell, syncUnitTilesToSqft,
  unitKey, nextUnitBlockKey, findPrimaryUnitTile, resolveTileByKey,
  unitNumberOf, shopDisplayName, matchesShopQuery, scoreShopSearchMatch,
  computeWalkwayPath, buildSmoothRouteSvgPath, computeRouteDirectionArrows, computeFloorplateBounds, findDefaultStartItem, findNearestFacilityItem,
  rotateMapLayout, parseRotationAngle, computeUnitMergeMap,
  normalizeTileAngle,
  UNIT_SHAPE_LABELS, UNIT_SHAPE_CATEGORY_TABS, UNIT_SHAPE_COMPACT_FAMILIES, parseUnitShapeMode, encodeUnitShapeMode, isAutoUnitShapeLabel, nextUnitShapeMode, resolveSmartFamilyShapeMode, isTrapezoidUnitMode, getTrapezoidUnitGeometry, getCircleRingSectorAlignment,
  LANDMARK_VARIANTS, parseLandmarkMeta, encodeLandmarkMeta, nextLandmarkVariant, autoSquareCircleLandmark, getPolygonAtriumGeometry,
  parseFloorPlanData, buildCopiedFloorLayout, saveCachedFloorPlan, getCachedFloorPlan,
  expandTouchingGroupKeys, computeGroupBoundingBox, moveTileGroupByDelta, rotateTileGroup, resizeTileGroup,
  type MapItem, type TileKind, type MapRotationAngle, type SharpCorners, type EdgeMergeGeometry, type UnitShapeMode, type UnitShapeCategoryId, type TrapezoidUnitGeometry, type MagneticSnapGuide, type GroupResizeHandle,
} from './shopMapLayout';
import {
  hasFailedUnitPhoto,
  isUnitPhotoImage,
  preloadUnitPhotosBatch,
} from '../../../utils/unitPhotoCache';
import { CachedUnitPhoto, useUnitPhotoCache } from '../../../components/common/CachedUnitPhoto';
import './ShopMapView.css';

interface Props {
  shops: any[];
  propertyId: string | undefined | null;
  propertyName?: string;
  searchQuery?: string;
  onOpenShop?: (shop: any) => void;
  fullScreen?: boolean;
  initialFloor?: string;
  publicMode?: boolean;
}

const ALL_RESIZE_HANDLES = ['se', 'sw', 'nw', 'ne', 'e', 'w', 's', 'n'] as const;
const EDIT_LEFT_PAD = 4;
const EDIT_RIGHT_PAD = 32;

interface BlueprintOverlayConfig {
  dataUrl: string;
  visible: boolean;
  opacity: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetCellX?: number;
  offsetCellY?: number;
  gridCols?: number;
  aspectRatio?: number;
  rotation: number;
}

function getBlueprintStorageKey(floorName: string): string {
  return `pms_floor_blueprint_v1_${floorName.trim().toLowerCase()}`;
}

function compressBlueprintImageToDataUrl(file: File): Promise<{ dataUrl: string; aspectRatio: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      const img = new window.Image();
      img.onerror = () => resolve({ dataUrl: rawUrl, aspectRatio: 0.75 });
      img.onload = () => {
        const w = img.naturalWidth || img.width || 1200;
        const h = img.naturalHeight || img.height || 900;
        const aspectRatio = Math.max(0.15, Math.min(4, Math.round((h / Math.max(1, w)) * 10000) / 10000));
        if (file.type === 'image/svg+xml' || file.size <= 350 * 1024) {
          resolve({ dataUrl: rawUrl, aspectRatio });
          return;
        }
        const maxDim = 1600;
        const ratio = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * ratio));
        const targetH = Math.max(1, Math.round(h * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: rawUrl, aspectRatio });
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        try {
          const webpUrl = canvas.toDataURL('image/webp', 0.85);
          resolve({
            dataUrl: webpUrl.startsWith('data:image/') ? webpUrl : canvas.toDataURL('image/jpeg', 0.85),
            aspectRatio,
          });
        } catch {
          resolve({ dataUrl: rawUrl, aspectRatio });
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

function AtriumShapeIcon({ mode, size }: { mode: UnitShapeMode | string; size: number }) {
  const s = Math.max(9, size);
  if (mode === 'rect') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.8" />
      </svg>
    );
  }
  if (mode === 'poly8' || mode === 'poly12' || mode === 'poly24') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points="5.6 2.2 10.4 2.2 13.8 5.6 13.8 10.4 10.4 13.8 5.6 13.8 2.2 10.4 2.2 5.6" />
      </svg>
    );
  }
  if (mode === 'ring-curve') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 1.8 5.4 Q 8 1.6 14.2 5.4 L 11.6 13.2 Q 8 10.4 4.4 13.2 Z" />
      </svg>
    );
  }
  if (mode === 'trapezoid-ring') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 L 11.8 12.8 Q 8 9.2 4.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'slope-b-l') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 12.8 2.2 9.0" />
      </svg>
    );
  }
  if (mode === 'slope-b-r') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 9.0 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'slope-t-l') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 7.0 13.8 3.2 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'slope-t-r') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 7.0 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'slope-l-t') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="6.2 3.2 13.8 3.2 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'slope-l-b') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 12.8 6.2 12.8" />
      </svg>
    );
  }
  if (mode === 'slope-r-t') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 9.8 3.2 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'slope-r-b') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 9.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'chamfer-tr') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 9.4 3.2 13.8 7.6 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'chamfer-tl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="6.6 3.2 13.8 3.2 13.8 12.8 2.2 12.8 2.2 7.6" />
      </svg>
    );
  }
  if (mode === 'chamfer-br') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 8.4 9.4 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'chamfer-bl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 12.8 6.6 12.8 2.2 8.4" />
      </svg>
    );
  }
  if (mode === 'bevel-l') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="6.2 3.2 13.8 3.2 13.8 12.8 6.2 12.8 2.2 8.0" />
      </svg>
    );
  }
  if (mode === 'bevel-r') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 9.8 3.2 13.8 8.0 9.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'bevel-t') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="8.0 2.4 13.8 6.6 13.8 12.8 2.2 12.8 2.2 6.6" />
      </svg>
    );
  }
  if (mode === 'bevel-b') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 9.4 8.0 13.6 2.2 9.4" />
      </svg>
    );
  }
  if (mode === 'notch-br-chamfer-tl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 6.2 3.2 L 13.8 3.2 L 13.8 8.2 Q 9.2 8.2 9.2 12.8 L 2.2 12.8 L 2.2 7.2 Z" />
      </svg>
    );
  }
  if (mode === 'notch-tr-chamfer-bl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 9.2 3.2 Q 9.2 7.8 13.8 7.8 L 13.8 12.8 L 6.2 12.8 L 2.2 8.8 Z" />
      </svg>
    );
  }
  if (mode === 'notch-bl-chamfer-tr') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 9.8 3.2 L 13.8 7.2 L 13.8 12.8 L 6.8 12.8 Q 6.8 8.2 2.2 8.2 Z" />
      </svg>
    );
  }
  if (mode === 'notch-tl-chamfer-br') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 6.8 3.2 L 13.8 3.2 L 13.8 8.8 L 9.8 12.8 L 2.2 12.8 L 2.2 7.8 Q 6.8 7.8 6.8 3.2 Z" />
      </svg>
    );
  }
  if (mode === 'curve-bl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 L 13.8 12.8 L 8.0 12.8 Q 2.2 12.8 2.2 7.0 Z" />
      </svg>
    );
  }
  if (mode === 'curve-br') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 L 13.8 7.0 Q 13.8 12.8 8.0 12.8 L 2.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'curve-tl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 8.0 3.2 L 13.8 3.2 L 13.8 12.8 L 2.2 12.8 L 2.2 9.0 Q 2.2 3.2 8.0 3.2 Z" />
      </svg>
    );
  }
  if (mode === 'curve-tr') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 8.0 3.2 Q 13.8 3.2 13.8 9.0 L 13.8 12.8 L 2.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'notch-tl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 7.8 3.2 L 13.8 3.2 L 13.8 12.8 L 2.2 12.8 L 2.2 8.8 Q 7.4 8.4 7.8 3.2 Z" />
      </svg>
    );
  }
  if (mode === 'notch-tr') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 8.2 3.2 Q 8.6 8.4 13.8 8.8 L 13.8 12.8 L 2.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'notch-bl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 L 13.8 12.8 L 7.8 12.8 Q 7.4 7.6 2.2 7.2 Z" />
      </svg>
    );
  }
  if (mode === 'notch-br') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 L 13.8 7.2 Q 8.6 7.6 8.2 12.8 L 2.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'arch-tl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 2.6 L 11.2 2.6 L 13.8 5.2 Q 5.8 5.8 5.4 13.4 L 2.2 13.4 Z" />
      </svg>
    );
  }
  if (mode === 'arch-tr') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 4.8 2.6 L 13.8 2.6 L 13.8 13.4 L 10.6 13.4 Q 10.2 5.8 2.2 5.2 Z" />
      </svg>
    );
  }
  if (mode === 'arch-bl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 2.6 L 5.4 2.6 Q 5.8 10.2 13.8 10.8 L 11.2 13.4 L 2.2 13.4 Z" />
      </svg>
    );
  }
  if (mode === 'arch-br') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 10.6 2.6 L 13.8 2.6 L 13.8 13.4 L 4.8 13.4 L 2.2 10.8 Q 10.2 10.2 10.6 2.6 Z" />
      </svg>
    );
  }
  if (mode === 'crescent-l') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 L 13.8 12.8 L 2.2 12.8 Q 7.4 8.0 2.2 3.2 Z" />
      </svg>
    );
  }
  if (mode === 'crescent-r') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 Q 8.6 8.0 13.8 12.8 L 2.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'crescent-t') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 Q 8.0 8.2 13.8 3.2 L 13.8 12.8 L 2.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'crescent-b') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 2.2 3.2 L 13.8 3.2 L 13.8 12.8 Q 8.0 7.8 2.2 12.8 Z" />
      </svg>
    );
  }
  if (mode === 'pie-wedge') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M 1.8 5.2 Q 8.0 1.6 14.2 5.2 L 9.8 13.4 L 6.2 13.4 Z" />
      </svg>
    );
  }
  if (mode === 'wedge-tl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 5.4 4.4 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'wedge-tr') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 12.8 11.6 12.8 2.2 5.4" />
      </svg>
    );
  }
  if (mode === 'wedge-bl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 4.4 3.2 13.8 10.6 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'wedge-br') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="11.6 3.2 13.8 3.2 13.8 12.8 2.2 12.8 2.2 10.6" />
      </svg>
    );
  }
  if (mode === 'step-tl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="6.6 3.2 13.8 3.2 13.8 12.8 2.2 12.8 2.2 7.4 6.6 7.4" />
      </svg>
    );
  }
  if (mode === 'step-tr') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 9.4 3.2 9.4 7.4 13.8 7.4 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'step-bl') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 12.8 6.6 12.8 6.6 8.6 2.2 8.6" />
      </svg>
    );
  }
  if (mode === 'step-br') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 8.6 9.4 8.6 9.4 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'step-t-mid') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 5.6 3.2 5.6 6.8 10.4 6.8 10.4 3.2 13.8 3.2 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'step-b-mid') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 12.8 10.4 12.8 10.4 9.2 5.6 9.2 5.6 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'wing-bend-l') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="5.4 3.2 13.8 3.2 13.8 8.4 8.6 8.4 6.6 12.8 2.2 12.8 2.2 6.6" />
      </svg>
    );
  }
  if (mode === 'wing-bend-r') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 10.6 3.2 13.8 6.6 13.8 12.8 9.4 12.8 7.4 8.4 2.2 8.4" />
      </svg>
    );
  }
  if (mode === 'u-court-t') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 5.4 3.2 5.4 8.4 10.6 8.4 10.6 3.2 13.8 3.2 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'u-court-b') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 13.8 3.2 13.8 12.8 10.6 12.8 10.6 7.6 5.4 7.6 5.4 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'trapezoid') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="4.2 3.2 11.8 3.2 14.2 12.8 1.8 12.8" />
      </svg>
    );
  }
  if (mode === 'trapezoid-l') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="5.4 3.2 13.8 3.2 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  if (mode === 'trapezoid-r') {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <polygon points="2.2 3.2 10.6 3.2 13.8 12.8 2.2 12.8" />
      </svg>
    );
  }
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="8" cy="8" r="5.6" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

function QrModalDialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return createPortal(
    <div className="shop-map-qr-backdrop" onClick={onClose}>
      <div className="shop-map-qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shop-map-qr-header">
          <div>
            <h3><QrCode size={18} /> {title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="shop-map-qr-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="shop-map-qr-body">{children}</div>
        {footer && <div className="shop-map-qr-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

function QrPreviewCard({
  badge,
  dataUrl,
  alt,
  caption,
}: {
  badge: string;
  dataUrl: string;
  alt: string;
  caption: React.ReactNode;
}) {
  return (
    <div className="shop-map-qr-preview">
      <div className="shop-map-qr-badge">{badge}</div>
      {dataUrl ? (
        <img src={dataUrl} alt={alt} className="shop-map-qr-img" />
      ) : (
        <div className="shop-map-qr-loading">Generating QR…</div>
      )}
      <div className="shop-map-qr-caption">{caption}</div>
    </div>
  );
}

function MapNavSelect({
  value,
  placeholder,
  icon,
  clearable = false,
  options,
  onChange,
}: {
  value: string;
  placeholder?: string;
  icon?: React.ReactNode;
  clearable?: boolean;
  options: { value: string; label: string }[];
  onChange: (nextVal: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(() => {
    const match = options.find((o) => o.value === value);
    return match ? match.label : '';
  }, [options, value]);

  const visibleOptions = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, term]);

  useEffect(() => {
    setActiveIdx(0);
  }, [visibleOptions.length, open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTerm('');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
    };
  }, [open]);

  const selectOption = (nextVal: string) => {
    onChange(nextVal);
    setOpen(false);
    setTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (visibleOptions.length > 0) {
        setActiveIdx((prev) => {
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          return (prev + delta + visibleOptions.length) % visibleOptions.length;
        });
      }
    } else if (e.key === 'Enter') {
      if (open && visibleOptions[activeIdx]) {
        e.preventDefault();
        selectOption(visibleOptions[activeIdx].value);
        inputRef.current?.blur();
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setTerm('');
        inputRef.current?.blur();
      }
    } else if (e.key === 'Tab') {
      if (open) {
        setOpen(false);
        setTerm('');
      }
    }
  };

  return (
    <div className="shop-map-nav-select-wrap" ref={wrapRef}>
      <div
        className={`shop-map-nav-select-btn shop-map-nav-combo ${open ? 'open' : ''}`}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {icon && <span className="shop-map-nav-combo-icon">{icon}</span>}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="shop-map-nav-combo-input"
          placeholder={selectedLabel || placeholder || 'Search…'}
          value={open ? term : selectedLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {((open && term) || (clearable && value)) && (
          <button
            type="button"
            className="shop-map-nav-combo-clear"
            onClick={(e) => {
              e.stopPropagation();
              if (open && term) {
                setTerm('');
                inputRef.current?.focus();
              } else {
                onChange('');
                setTerm('');
                setOpen(false);
              }
            }}
            aria-label="Clear"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown
          size={13}
          className="shop-map-nav-select-chevron"
          onClick={(e) => {
            e.stopPropagation();
            if (open) {
              setOpen(false);
              setTerm('');
            } else {
              setOpen(true);
              inputRef.current?.focus();
            }
          }}
        />
      </div>
      {open && (
        <div className="shop-map-nav-menu" role="listbox">
          {visibleOptions.length === 0 ? (
            <div className="shop-map-nav-empty">No matching locations</div>
          ) : (
            visibleOptions.map((opt, idx) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className={`shop-map-nav-option ${idx === activeIdx ? 'active' : ''} ${value === opt.value ? 'selected' : ''}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(opt.value)}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Cute3DCubeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2.5 21 7.5 12 12.5 3 7.5 12 2.5" fill="currentColor" fillOpacity="0.28" />
      <polygon points="3 7.5 12 12.5 12 21.5 3 16.5 3 7.5" fill="currentColor" fillOpacity="0.14" />
      <polygon points="21 7.5 12 12.5 12 21.5 21 16.5 21 7.5" fill="currentColor" fillOpacity="0.06" />
    </svg>
  );
}

function DecorIcon({
  kind,
  variant = 'default',
  size = 14,
}: {
  kind: Exclude<TileKind, 'unit'>;
  variant?: string;
  size?: number;
}) {
  switch (kind) {
    case 'atrium':
      if (variant === 'fountain') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V8" />
            <path d="M12 10c-2.5-3.5-6-3-6 0.5M12 10c2.5-3.5 6-3 6 0.5" />
            <path d="M12 14c-3.5-2.5-7.5-1.5-7.5 1.5M12 14c3.5-2.5 7.5-1.5 7.5 1.5" />
            <path d="M4 20h16" />
          </svg>
        );
      }
      if (variant === 'poly8' || variant === 'poly12' || variant === 'poly24') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="8.3 2.5 15.7 2.5 21.5 8.3 21.5 15.7 15.7 21.5 8.3 21.5 2.5 15.7 2.5 8.3" fill="currentColor" fillOpacity="0.2" />
          </svg>
        );
      }
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M3 12h18M12 3v18" strokeOpacity="0.45" />
          <polygon points="12 5.5 14.3 9.7 18.5 12 14.3 14.3 12 18.5 9.7 14.3 5.5 12 9.7 9.7 12 5.5" fill="currentColor" fillOpacity="0.24" />
        </svg>
      );
    case 'stairs':
      if (variant === 'circle') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            <path d="M12 3v6.8M19.8 7.5l-5.9 3.4M19.8 16.5l-5.9-3.4M12 21v-6.8M4.2 16.5l5.9-3.4M4.2 7.5l5.9 3.4" />
          </svg>
        );
      }
      if (variant === 'down') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 20h4v-4h4v-4h4V8h6" />
            <path d="M10 5L4 11m0 0h4.5M4 11V6.5" />
          </svg>
        );
      }
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20h4v-4h4v-4h4V8h6" />
          <path d="M4 11l6-6m0 0H5.5M10 5v4.5" />
        </svg>
      );
    case 'escalator':
      if (variant === 'escalator' || variant === 'escalator-up' || variant === 'escalator-down') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18h4.5L16.5 9H21a2 2 0 0 0 0-4h-5.5l-9 9H3a2 2 0 0 0 0 4Z" fill="currentColor" fillOpacity="0.18" />
            {variant !== 'escalator-down' ? (
              <path d="M6 10l4-4m0 0H6.5M10 6v3.5" />
            ) : (
              <path d="M10 6l-4 4m0 0h3.5M6 10V6.5" />
            )}
          </svg>
        );
      }
      if (variant === 'accessible') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="4.5" r="2" fill="currentColor" stroke="none" />
            <path d="M11 7.5v5.5h5l2 5" />
            <path d="M11 10.5h3.5" />
            <path d="M13.5 16.5a4.5 4.5 0 1 1-4.8-5.5" />
          </svg>
        );
      }
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="12" y1="4" x2="12" y2="20" strokeOpacity="0.45" />
          <path d="M8 16V8m0 0L5.8 10.2M8 8l2.2 2.2" />
          <path d="M16 8v8m0 0l-2.2-2.2M16 16l2.2-2.2" />
        </svg>
      );
    case 'toilet':
      if (variant === 'accessible') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="4.5" r="2" fill="currentColor" stroke="none" />
            <path d="M11 7.5v5.5h5l2 5" />
            <path d="M11 10.5h3.5" />
            <path d="M13.5 16.5a4.5 4.5 0 1 1-4.8-5.5" />
          </svg>
        );
      }
      if (variant === 'baby') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="6.5" r="3" fill="currentColor" fillOpacity="0.22" />
            <path d="M8 12.5c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5v3.5l-2 4h-4l-2-4v-3.5Z" fill="currentColor" fillOpacity="0.18" />
            <path d="M6 14l2-1.5M18 14l-2-1.5" />
          </svg>
        );
      }
      if (variant === 'male') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="4.8" r="2.3" fill="currentColor" stroke="none" />
            <path d="M6 8.5h6a1.2 1.2 0 0 1 1.2 1.2v5.3h-1.8v6H6.6v-6H4.8V9.7A1.2 1.2 0 0 1 6 8.5Z" fill="currentColor" stroke="none" />
            <circle cx="17.5" cy="11.5" r="2.5" />
            <path d="M19.3 9.7L21.5 7.5m0 0h-2.3m2.3 0v2.3" />
          </svg>
        );
      }
      if (variant === 'female') {
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="4.8" r="2.3" fill="currentColor" stroke="none" />
            <path d="M6.8 8.5h4.4l2.4 7h-2.2V21H6.6v-5.5H4.4l2.4-7Z" fill="currentColor" stroke="none" />
            <circle cx="17.8" cy="9.5" r="2.5" />
            <path d="M17.8 12v4.8M15.8 14.6h4" />
          </svg>
        );
      }
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6.5" cy="5" r="2" fill="currentColor" stroke="none" />
          <path d="M4.5 8.5h4a1 1 0 0 1 1 1v4.5H8v6H5v-6H3.5V9.5a1 1 0 0 1 1-1Z" fill="currentColor" stroke="none" />
          <line x1="12" y1="3.5" x2="12" y2="20.5" />
          <circle cx="17.5" cy="5" r="2" fill="currentColor" stroke="none" />
          <path d="M16 8.5h3l2 6.5h-2v5h-3v-5h-2l2-6.5Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'marker':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M12 22s-7.5-6.2-7.5-11.5a7.5 7.5 0 1 1 15 0C19.5 15.8 12 22 12 22Z"
            fill="currentColor"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="10.5" r="3.1" fill="#ffffff" />
        </svg>
      );
    case 'entrance':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
      );
    case 'exit':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 3.5H20a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-5.5" />
          <rect x="15.5" y="4.5" width="4.5" height="15" fill="currentColor" fillOpacity="0.2" stroke="none" />
          <circle cx="8.5" cy="5.5" r="2" fill="currentColor" stroke="none" />
          <path d="M3.5 10.5l3.2-2 3.8 1 2.2 2.8" />
          <path d="M7.2 13L4.5 19.5" />
          <path d="M7.5 12.8l3.5 1.4 1.5 5.3" />
          <path d="M14 12h4.5m0 0l-2-2m2 2l-2 2" />
        </svg>
      );
    case 'info':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.16" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
          <circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'parking':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="currentColor" fillOpacity="0.16" />
          <path d="M9.5 17V7h4a3 3 0 0 1 0 6h-4" />
        </svg>
      );
    case 'atm':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="currentColor" fillOpacity="0.16" />
          <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
          <line x1="6.5" y1="14.5" x2="10.5" y2="14.5" strokeWidth="2.2" />
          <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'medical':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="currentColor" fillOpacity="0.16" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}

function CategoryIcon({ category, size = 26 }: { category: string; size?: number }) {
  switch (category) {
    case 'Dining':
      return (
        <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          {/* Fork */}
          <path d="M4.5 4v6.5a2 2 0 0 0 2 2v11.5" />
          <path d="M6.5 4v5.5" />
          <path d="M8.5 4v6.5a2 2 0 0 1-2 2" />
          {/* Plate */}
          <circle cx="14.5" cy="14" r="5.5" strokeWidth="2" />
          <circle cx="14.5" cy="14" r="3.2" fill="currentColor" fillOpacity="0.22" strokeWidth="1.5" />
          {/* Knife */}
          <path d="M23 4v11h-2V7.5A3.5 3.5 0 0 1 23 4Z" fill="currentColor" fillOpacity="0.22" />
          <path d="M23 15v9" />
        </svg>
      );
    case 'Health/Pharmacy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" />
          <path d="M9 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1.5" />
          <path d="M12 9.5v6M9 12.5h6" strokeWidth="2.2" />
        </svg>
      );
    case 'ATMs':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
          <line x1="6.5" y1="14.5" x2="10.5" y2="14.5" strokeWidth="2.2" />
          <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'Beauty & Wellness':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" fill="currentColor" fillOpacity="0.18" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
          <path d="M5 16l.7 1.6L7.3 18.3l-1.6.7L5 20.6l-.7-1.6-1.6-.7 1.6-.7L5 16Z" />
        </svg>
      );
    case 'Education':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 4 2 9 12 14 22 9 12 4" fill="currentColor" fillOpacity="0.18" />
          <path d="M6 11.5v5c0 1.8 2.7 3.5 6 3.5s6-1.7 6-3.5v-5" />
          <path d="M22 9v6" />
        </svg>
      );
    case 'Fashion & Accessories':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 7h12l1.2 13H4.8L6 7Z" fill="currentColor" fillOpacity="0.16" />
          <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
        </svg>
      );
    case 'Services':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="3" y1="13" x2="21" y2="13" />
        </svg>
      );
    case 'Sports & Lifestyle':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5v11M3.5 8.5v7M17.5 6.5v11M20.5 8.5v7M6.5 12h11" />
        </svg>
      );
    case 'Supermarket':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="20" r="1.5" fill="currentColor" />
          <circle cx="18" cy="20" r="1.5" fill="currentColor" />
          <path d="M2.5 4h2.5l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.4-1.1L21 7H6" />
        </svg>
      );
    case 'Watches & Jewellery':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="6 4 18 4 22 9 12 21 2 9 6 4" fill="currentColor" fillOpacity="0.16" />
          <line x1="2" y1="9" x2="22" y2="9" />
          <polyline points="9.5 4 7.5 9 12 21 16.5 9 14.5 4" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l1.8-5h14.4L21 9" />
          <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
          <path d="M5 12v8h14v-8" />
          <path d="M10 15h4v5h-4z" />
        </svg>
      );
  }
}

function statusClass(shop: any): string {
  const u = shop?.unit;
  const status = String(u?.status || '').toUpperCase();
  const end = u?.leases?.[0]?.endDate;
  if (status === 'OCCUPIED' && end) {
    const days = (new Date(end).getTime() - Date.now()) / 86400000;
    if (days <= 90) return 'st-expiring';
  }
  if (status === 'OCCUPIED') return 'st-occupied';
  if (status === 'RESERVED') return 'st-reserved';
  return 'st-vacant';
}

function sharpCornerClasses(c: SharpCorners): string {
  return `${c.tlSharp ? 'sharp-tl' : ''} ${c.trSharp ? 'sharp-tr' : ''} ${c.blSharp ? 'sharp-bl' : ''} ${c.brSharp ? 'sharp-br' : ''}`;
}

function edgeMergeClasses(prefix: string, m: EdgeMergeGeometry): string {
  return `${prefix} ${m.topMerged ? 'merge-t' : ''} ${m.rightMerged ? 'merge-r' : ''} ${m.bottomMerged ? 'merge-b' : ''} ${m.leftMerged ? 'merge-l' : ''} ${sharpCornerClasses(m)}`;
}

function MergedTileBorderSvg({
  merge,
  cellPx,
  wPx,
  hPx,
}: {
  merge: EdgeMergeGeometry;
  cellPx: number;
  wPx: number;
  hPx: number;
}) {
  if (
    merge.topSegs.length === 0 &&
    merge.rightSegs.length === 0 &&
    merge.bottomSegs.length === 0 &&
    merge.leftSegs.length === 0
  ) {
    return null;
  }
  const wU = cellPx > 0 ? wPx / cellPx : 0;
  const hV = cellPx > 0 ? hPx / cellPx : 0;
  return (
    <svg
      className="shop-map-merged-border-svg"
      viewBox={`0 0 ${wPx} ${hPx}`}
      preserveAspectRatio="none"
    >
      {merge.topSegs.map(([u1, u2], idx) => (
        <line
          key={`t-${idx}`}
          x1={u1 <= 0.02 && merge.leftMerged ? -1.5 : u1 * cellPx}
          y1={0.5}
          x2={u2 >= wU - 0.02 && merge.rightMerged ? wPx + 1.5 : u2 * cellPx}
          y2={0.5}
          className="lm-border-rim"
        />
      ))}
      {merge.leftSegs.map(([v1, v2], idx) => (
        <line
          key={`l-${idx}`}
          x1={0.5}
          y1={v1 <= 0.02 && merge.topMerged ? -1.5 : v1 * cellPx}
          x2={0.5}
          y2={v2 >= hV - 0.02 && merge.bottomMerged ? hPx + 1.5 : v2 * cellPx}
          className="lm-border-rim"
        />
      ))}
      {merge.rightSegs.map(([v1, v2], idx) => (
        <line
          key={`r-${idx}`}
          x1={wPx - 1}
          y1={v1 <= 0.02 && merge.topMerged ? -1.5 : v1 * cellPx}
          x2={wPx - 1}
          y2={v2 >= hV - 0.02 && merge.bottomMerged ? hPx + 1.5 : v2 * cellPx}
          className="lm-border-lip-r"
        />
      ))}
      {merge.bottomSegs.map(([u1, u2], idx) => (
        <line
          key={`b-${idx}`}
          x1={u1 <= 0.02 && merge.leftMerged ? -1.5 : u1 * cellPx}
          y1={hPx - 1.5}
          x2={u2 >= wU - 0.02 && merge.rightMerged ? wPx + 1.5 : u2 * cellPx}
          y2={hPx - 1.5}
          className="lm-border-lip-b"
        />
      ))}
    </svg>
  );
}

function TrapezoidUnitSvg({
  trap,
  wPx,
  hPx,
  showFill,
}: {
  trap: TrapezoidUnitGeometry;
  wPx: number;
  hPx: number;
  showFill: boolean;
}) {
  return (
    <svg
      className="shop-map-trapezoid-svg"
      viewBox={`0 0 ${wPx} ${hPx}`}
      preserveAspectRatio="none"
    >
      {showFill && <polygon points={trap.fillPoints} className="shop-map-trapezoid-fill" />}
      {trap.rimPath && <path d={trap.rimPath} className="lm-border-rim" fill="none" />}
      {trap.lipRightPath && <path d={trap.lipRightPath} className="lm-border-lip-r" fill="none" />}
      {trap.lipBottomPath && <path d={trap.lipBottomPath} className="lm-border-lip-b" fill="none" />}
    </svg>
  );
}

export default function ShopMapView({
  shops,
  propertyId,
  propertyName,
  searchQuery = '',
  onOpenShop,
  fullScreen = false,
  initialFloor,
  publicMode = false,
}: Props) {
  useUnitPhotoCache();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialFromParam = urlParams.get('from') || '';
  const initialToParam = urlParams.get('to') || '';
  const initialRotateParam = parseRotationAngle(urlParams.get('rotate'));

  const floors = useMemo(() => {
    const m = new Map<string, number>();
    shops.forEach((s) => {
      const k = floorKeyOf(s);
      const n = Number(s?.unit?.floorNumber);
      if (!m.has(k)) m.set(k, Number.isFinite(n) ? n : 9999);
    });
    return [...m.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  }, [shops]);

  const [floor, setFloor] = useState<string>(initialFloor || '');
  useEffect(() => {
    if (!floor || !floors.includes(floor)) {
      if (initialFloor && floors.includes(initialFloor)) setFloor(initialFloor);
      else setFloor(floors[0] || '');
    }
  }, [floors, floor, initialFloor]);

  const floorShops = useMemo(() => shops.filter((s) => floorKeyOf(s) === floor), [shops, floor]);
  const shopByUnit = useMemo(() => new Map(floorShops.map((s) => [s.unitId, s])), [floorShops]);
  const allShopByUnit = useMemo(() => new Map(shops.map((s) => [s.unitId, s])), [shops]);

  // Preload and cache unit photos in the background as soon as shops load
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const shopPhotoOf = (s: any) => (s?.unit?.floorPlanUrl || s?.shopfrontUrl || s?.logoUrl) as string | undefined;
    const currentFloorUrls = floorShops.map(shopPhotoOf);
    const otherFloorUrls = shops.filter((s) => floorKeyOf(s) !== floor).map(shopPhotoOf);

    preloadUnitPhotosBatch(currentFloorUrls).then(() => {
      if (!cancelled && otherFloorUrls.length > 0) {
        timerId = setTimeout(() => {
          if (!cancelled) preloadUnitPhotosBatch(otherFloorUrls);
        }, 400);
      }
    });

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [floorShops, shops, floor]);

  const adminPlanQuery = useGetFloorPlanQuery(
    { propertyId: propertyId as string, floor },
    { skip: !propertyId || !floor || publicMode },
  );
  const publicPlanQuery = useGetPublicFloorPlanQuery(
    { propertyId: propertyId as string, floor },
    { skip: !propertyId || !floor || !publicMode },
  );
  const [fetchSourceFloorPlan, { isFetching: isCopyingFloor }] = useLazyGetFloorPlanQuery();
  const plan = publicMode ? publicPlanQuery.data : adminPlanQuery.data;
  const isFetching = publicMode ? publicPlanQuery.isFetching : adminPlanQuery.isFetching;

  const [savePlan, { isLoading: saving }] = useSaveFloorPlanMutation();

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [items, setItems] = useState<MapItem[]>([]);
  const [sqftPerCell, setSqftPerCell] = useState(DEFAULT_SQFT_PER_CELL);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [decorKind, setDecorKind] = useState<Exclude<TileKind, 'unit'>>('marker');
  const [decorSeq, setDecorSeq] = useState(1);
  const [copySourceFloor, setCopySourceFloor] = useState<string>('');
  const [copyIncludeUnits, setCopyIncludeUnits] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Indoor Navigation, Map Rotation, 2.5D Pitch & Floor QR state
  const [mapRotation, setMapRotation] = useState<MapRotationAngle>(initialRotateParam);
  const [is3DPitch, setIs3DPitch] = useState<boolean>(() => {
    const p = new URLSearchParams(window.location.search).get('pitch')?.toLowerCase();
    if (p === '2.5d' || p === '3d' || p === '1' || p === 'true') return true;
    if (p === '2d' || p === '0' || p === 'false') return false;
    return Boolean(publicMode);
  });
  const [highlightedAmenityKinds, setHighlightedAmenityKinds] = useState<TileKind[]>([]);
  const [editSnapMode, setEditSnapMode] = useState<'free' | 'edge' | 'smart'>('edge');
  const magnetEnabled = editSnapMode !== 'free';
  const snapAutoResize = editSnapMode === 'smart';
  const autoShapeEnabled = editSnapMode === 'smart';
  const [magnetBypassActive, setMagnetBypassActive] = useState(false);
  const bypassMagnetKeyRef = useRef(false);
  const [dragSnapGuide, setDragSnapGuide] = useState<MagneticSnapGuide | null>(null);
  const [dragAngle, setDragAngle] = useState(0);
  const [dragShape, setDragShape] = useState<string>('rect');
  const [dragClipPath, setDragClipPath] = useState<string>('none');
  const [dragPreviewItem, setDragPreviewItem] = useState<MapItem | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [customStartKey, setCustomStartKey] = useState<string>(initialFromParam);
  const [targetKey, setTargetKey] = useState<string>(initialToParam);
  const [crossFloorUnitId, setCrossFloorUnitId] = useState<string | null>(null);
  const [transitArrivalMode, setTransitArrivalMode] = useState(false);
  const [originFloorBeforeTransit, setOriginFloorBeforeTransit] = useState<string | null>(null);
  const [showFloorQrModal, setShowFloorQrModal] = useState(false);
  const [qrModalFloor, setQrModalFloor] = useState<string>('');
  const [showRouteQrModal, setShowRouteQrModal] = useState(false);
  const [editingLandmarkKey, setEditingLandmarkKey] = useState<string | null>(null);
  const [editingUnitShapeKey, setEditingUnitShapeKey] = useState<string | null>(null);
  const [unitShapeCatTab, setUnitShapeCatTab] = useState<UnitShapeCategoryId>('all');
  const [showFloorToolsMenu, setShowFloorToolsMenu] = useState(false);
  const [focusedLayerKey, setFocusedLayerKey] = useState<string | null>(null);
  const [rotatingTileKey, setRotatingTileKey] = useState<string | null>(null);
  const [isRotatingGroup, setIsRotatingGroup] = useState(false);
  const [groupFrameAngle, setGroupFrameAngle] = useState(0);
  const groupFrameAngleRef = useRef(0);
  groupFrameAngleRef.current = groupFrameAngle;
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [dragGroupDelta, setDragGroupDelta] = useState<{ dx: number; dy: number } | null>(null);
  const selectedGroupSet = useMemo(() => new Set(selectedGroupKeys), [selectedGroupKeys]);
  const selectedGroupSetRef = useRef<Set<string>>(selectedGroupSet);
  selectedGroupSetRef.current = selectedGroupSet;
  const groupRotBaseRef = useRef<{
    keysSig: string;
    baseItems: MapItem[];
    baseFrameAngle: number;
    cumulativeDeg: number;
  } | null>(null);
  const [landmarkVariantDraft, setLandmarkVariantDraft] = useState<string>('default');
  const [landmarkCustomDraft, setLandmarkCustomDraft] = useState<string>('');
  const [landmarkShowLabelDraft, setLandmarkShowLabelDraft] = useState<boolean>(false);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onKeyChange = (e: KeyboardEvent) => {
      const bypass = Boolean(e.altKey || e.shiftKey);
      if (bypassMagnetKeyRef.current !== bypass) {
        bypassMagnetKeyRef.current = bypass;
        setMagnetBypassActive(bypass);
      }
    };
    const onWindowBlur = () => {
      if (bypassMagnetKeyRef.current) {
        bypassMagnetKeyRef.current = false;
        setMagnetBypassActive(false);
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('keydown', onKeyChange);
    window.addEventListener('keyup', onKeyChange);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('keydown', onKeyChange);
      window.removeEventListener('keyup', onKeyChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const otherFloorsForCopy = useMemo(() => floors.filter((f) => f !== floor), [floors, floor]);
  useEffect(() => {
    if (!copySourceFloor || !otherFloorsForCopy.includes(copySourceFloor)) {
      setCopySourceFloor(otherFloorsForCopy[0] || '');
    }
  }, [otherFloorsForCopy, copySourceFloor]);

  const localSavedPlanRef = useRef<{ floor: string; data: any } | null>(null);
  const networkPlanData: any = (plan as any)?.data ?? plan;
  useEffect(() => {
    if (networkPlanData && propertyId && floor) {
      localSavedPlanRef.current = null;
      saveCachedFloorPlan(propertyId, floor, networkPlanData);
    }
  }, [networkPlanData, propertyId, floor]);

  const planData = useMemo(
    () => networkPlanData ?? getCachedFloorPlan(propertyId, floor),
    [networkPlanData, propertyId, floor],
  );
  const activePlanData =
    localSavedPlanRef.current?.floor === floor ? localSavedPlanRef.current.data : planData;

  const applyParsedLayout = (parsed: {
    sqftPerCell: number;
    columns: number;
    decorSeq: number;
    items: MapItem[];
  }) => {
    setSqftPerCell(parsed.sqftPerCell);
    setColumns(parsed.columns);
    setDecorSeq(parsed.decorSeq);
    lastActiveTileKeyRef.current = null;
    itemsRef.current = parsed.items;
    setItems(parsed.items);
  };

  // (Re)load draft from server or local offline cache whenever floor / data changes and there are no unsaved edits.
  useEffect(() => {
    if (dirty) return;
    applyParsedLayout(parseFloorPlanData(activePlanData, shopByUnit));
  }, [activePlanData, shopByUnit, dirty]);

  const blueprintInputRef = useRef<HTMLInputElement | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintOverlayConfig | null>(null);
  const editOriginBlueprintRef = useRef<BlueprintOverlayConfig | null>(null);
  const [adjustingBlueprint, setAdjustingBlueprint] = useState(false);

  const blueprintGridBounds = useMemo(() => {
    if (!editing || !blueprint || !blueprint.visible) return null;
    const bpWCells = (DEFAULT_COLUMNS * blueprint.scale) / 100;
    const aspect = blueprint.aspectRatio && blueprint.aspectRatio > 0 ? blueprint.aspectRatio : 0.75;
    const bpHCells = bpWCells * aspect;
    const bpXCells =
      typeof blueprint.offsetCellX === 'number'
        ? blueprint.offsetCellX
        : Math.max(0, Math.round((blueprint.offsetX / 9) * 100) / 100);
    const bpYCells =
      typeof blueprint.offsetCellY === 'number'
        ? blueprint.offsetCellY
        : Math.max(0, Math.round((blueprint.offsetY / 9) * 100) / 100);
    const isBpQuarterTurn = blueprint.rotation % 180 !== 0;
    const rightCells = isBpQuarterTurn
      ? Math.ceil(bpXCells + bpWCells * 0.5 + bpHCells * 0.5)
      : Math.ceil(bpXCells + bpWCells);
    const bottomCells = isBpQuarterTurn
      ? Math.ceil(bpYCells + bpHCells * 0.5 + bpWCells * 0.5)
      : Math.ceil(bpYCells + bpHCells);
    return { bpXCells, bpYCells, bpWCells, bpHCells, rightCells, bottomCells };
  }, [editing, blueprint]);

  const maxEditingRight = useMemo(() => {
    let maxR = blueprintGridBounds ? blueprintGridBounds.rightCells : 0;
    for (const it of items) {
      const dx =
        editing && dragGroupDelta && selectedGroupSet.has(it.key) ? dragGroupDelta.dx : 0;
      const r = it.x + dx + it.w;
      if (r > maxR) maxR = r;
    }
    if (editing && dragPreviewItem) {
      const r = dragPreviewItem.x + dragPreviewItem.w;
      if (r > maxR) maxR = r;
    }
    return maxR;
  }, [items, editing, dragPreviewItem, dragGroupDelta, selectedGroupSet, blueprintGridBounds]);

  const effectiveColumns = editing
    ? Math.max(columns, DEFAULT_COLUMNS, maxEditingRight + EDIT_RIGHT_PAD)
    : Math.max(columns, DEFAULT_COLUMNS, maxEditingRight);

  const effectiveRotation: MapRotationAngle = editing ? 0 : mapRotation;
  const isQuarterTurn = effectiveRotation === 90 || effectiveRotation === 270;
  const rotatedLayout = useMemo(
    () => rotateMapLayout(items, effectiveColumns, effectiveRotation),
    [items, effectiveColumns, effectiveRotation],
  );
  // Render atriums first, then units & transit/other landmarks so Elevator/Escalator/Stairs inside an Atrium are always on top
  const displayItems = useMemo(
    () => [
      ...rotatedLayout.items.filter((i) => i.kind === 'atrium'),
      ...rotatedLayout.items.filter((i) => i.kind !== 'atrium'),
    ],
    [rotatedLayout.items],
  );
  const displayColumns = rotatedLayout.columns;
  const maxDisplayBottom = useMemo(() => {
    let maxB = blueprintGridBounds ? Math.max(20, blueprintGridBounds.bottomCells) : 20;
    for (const it of displayItems) {
      const dy =
        editing && dragGroupDelta && selectedGroupSet.has(it.key) ? dragGroupDelta.dy : 0;
      const b = it.y + dy + it.h;
      if (b > maxB) maxB = b;
    }
    if (editing && dragPreviewItem) {
      const b = dragPreviewItem.y + dragPreviewItem.h;
      if (b > maxB) maxB = b;
    }
    return maxB;
  }, [displayItems, editing, dragPreviewItem, dragGroupDelta, selectedGroupSet, blueprintGridBounds]);
  const rows = maxDisplayBottom + (editing ? 16 : 2);

  const itemsRef = useRef<MapItem[]>(items);
  itemsRef.current = items;
  const dragOriginItemsRef = useRef<MapItem[] | null>(null);
  const [layoutResetTick, setLayoutResetTick] = useState(0);

  const hasLayoutConflict = (nextLayout: readonly any[], baseItems: ReadonlyArray<MapItem>): boolean => {
    const byKey = new Map(baseItems.map((i) => [i.key, i]));
    const candidates = nextLayout
      .map((l) => {
        const orig = byKey.get(l.i);
        return orig
          ? {
              ...orig,
              x: l.x,
              y: l.y,
              w: l.w,
              h: l.h,
              ...('angle' in l ? { angle: l.angle } : {}),
              ...('label' in l ? { label: l.label } : {}),
            }
          : null;
      })
      .filter(Boolean) as MapItem[];

    for (let a = 0; a < candidates.length; a++) {
      for (let b = a + 1; b < candidates.length; b++) {
        const p = candidates[a];
        const q = candidates[b];
        if (tilesConflict(p, q)) {
          return true;
        }
      }
    }
    return false;
  };

  const resolveInteractionLayout = (
    nextLayout: readonly any[],
    baseItems: ReadonlyArray<MapItem>,
  ): { conflict: boolean; items: MapItem[]; groupDelta?: { dx: number; dy: number } | null } => {
    const layoutByKey = new Map(nextLayout.map((x) => [x.i, x]));
    const activeGroup = selectedGroupSetRef.current;
    const interactionColumns = Math.max(
      effectiveColumns,
      ...nextLayout.map((l) => (Number(l.x) || 0) + (Number(l.w) || 1) + EDIT_RIGHT_PAD),
    );

    if (activeGroup.size > 1) {
      const movedOrig = baseItems.find((orig) => {
        if (!activeGroup.has(orig.key)) return false;
        const l = layoutByKey.get(orig.key);
        return Boolean(l && (l.x !== orig.x || l.y !== orig.y) && l.w === orig.w && l.h === orig.h);
      });
      if (movedOrig) {
        const l = layoutByKey.get(movedOrig.key)!;
        const groupRes = moveTileGroupByDelta(
          baseItems,
          activeGroup,
          l.x - movedOrig.x,
          l.y - movedOrig.y,
          interactionColumns,
        );
        return {
          conflict: groupRes.conflict,
          items: groupRes.items,
          groupDelta: { dx: groupRes.clampedDx, dy: groupRes.clampedDy },
        };
      }
    }

    let candidateItems = baseItems.map((it) => {
      const l = layoutByKey.get(it.key);
      return l ? { ...it, x: l.x, y: l.y, w: l.w, h: l.h } : { ...it };
    });

    // Magnetically snap moved/resized tiles to touching borders, align X/Y edge lines, and adjust rotation degree (`angle`)
    // unless Magnet is toggled OFF or the user holds Alt / Shift during drag/resize.
    if (magnetEnabled && !bypassMagnetKeyRef.current) {
      candidateItems = candidateItems.map((it, idx) => {
        const orig = baseItems[idx];
        const moved = orig && (it.x !== orig.x || it.y !== orig.y || it.w !== orig.w || it.h !== orig.h);
        if (!moved) return it;
        return snapTileToBorder(it, candidateItems, interactionColumns, orig, snapAutoResize, autoShapeEnabled) ?? it;
      });
    } else {
      candidateItems = candidateItems.map((it, idx) => {
        const orig = baseItems[idx];
        const moved = orig && (it.x !== orig.x || it.y !== orig.y || it.w !== orig.w || it.h !== orig.h);
        if (!moved) return it;
        return curveUnitAroundCircleWithoutSnap(it, candidateItems, autoShapeEnabled);
      });
    }

    // When an Atrium is dragged, move any enclosed Transit Landmarks (Lift / Escalator / Stairs) together with it,
    // and when an Atrium moves or resizes, re-sync nearby auto-shaped units.
    let anyAtriumChanged = false;
    for (let idx = 0; idx < baseItems.length; idx++) {
      const orig = baseItems[idx];
      const curr = candidateItems[idx];
      if (!orig || !curr || orig.kind !== 'atrium') continue;
      const dx = curr.x - orig.x;
      const dy = curr.y - orig.y;
      const dw = curr.w - orig.w;
      const dh = curr.h - orig.h;
      if (dx === 0 && dy === 0 && dw === 0 && dh === 0) continue;
      anyAtriumChanged = true;
      if ((dx !== 0 || dy !== 0) && dw === 0 && dh === 0) {
        candidateItems = candidateItems.map((t, tIdx) => {
          const origT = baseItems[tIdx];
          if (
            origT &&
            isTransitLandmark(origT.kind) &&
            origT.x >= orig.x &&
            origT.y >= orig.y &&
            origT.x + origT.w <= orig.x + orig.w &&
            origT.y + origT.h <= orig.y + orig.h &&
            t.x === origT.x &&
            t.y === origT.y
          ) {
            return {
              ...t,
              x: Math.max(0, Math.min(interactionColumns - t.w, origT.x + dx)),
              y: Math.max(0, origT.y + dy),
            };
          }
          return t;
        });
      }
    }
    if (anyAtriumChanged && autoShapeEnabled) {
      candidateItems = candidateItems.map((t) =>
        t.kind === 'unit' && isAutoUnitShapeLabel(t.label)
          ? curveUnitAroundCircleWithoutSnap(t, candidateItems, true)
          : t,
      );
    }

    const resolvedLayout = candidateItems.map((it) => ({
      i: it.key,
      x: it.x,
      y: it.y,
      w: it.w,
      h: it.h,
      angle: it.angle,
      label: it.label,
    }));
    if (hasLayoutConflict(resolvedLayout, baseItems)) {
      return { conflict: true, items: baseItems.map((i) => ({ ...i })), groupDelta: null };
    }
    return { conflict: false, items: candidateItems, groupDelta: null };
  };

  // No-push compactor: allows smooth dragging across the canvas while handleInteractionMove/Stop
  // enforce border snapping for same-unit wings and revert-to-previous-position on any overlap
  const mapCompactor = useMemo(
    () => ({
      type: null,
      allowOverlap: true,
      preventCollision: false,
      compact(nextLayout: readonly any[]) {
        return nextLayout.map((l) => ({ ...l }));
      },
    }),
    [layoutResetTick],
  );

  const placedUnitIds = useMemo(() => new Set(items.filter((i) => i.unitId).map((i) => i.unitId as string)), [items]);
  const placedShops = useMemo(
    () => floorShops.filter((s) => placedUnitIds.has(s.unitId)).sort(compareShopsByUnitNumber),
    [floorShops, placedUnitIds],
  );
  const otherFloorShops = useMemo(
    () =>
      shops
        .filter((s) => floorKeyOf(s) !== floor)
        .sort((a, b) =>
          floorKeyOf(a).localeCompare(floorKeyOf(b)) ||
          shopDisplayName(a).localeCompare(shopDisplayName(b)),
        ),
    [shops, floor],
  );
  const placedCategories = useMemo(() => {
    const groups = new Map<string, any[]>();
    placedShops.forEach((s) => {
      const cat = (s.tradeCategory || 'Other').trim() || 'Other';
      const list = groups.get(cat) || [];
      list.push(s);
      groups.set(cat, list);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const ia = (SHOP_CATEGORIES as readonly string[]).indexOf(a);
        const ib = (SHOP_CATEGORIES as readonly string[]).indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(([category, shopsList]) => ({ category, shops: shopsList }));
  }, [placedShops]);

  const placedDecorKinds = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => i.kind !== 'unit')
            .map((i) => i.kind as Exclude<TileKind, 'unit'>),
        ),
      ),
    [items],
  );
  const liveDisplayItems = useMemo(() => {
    if (!editing || mapRotation !== 0) return displayItems;
    if (dragGroupDelta && (dragGroupDelta.dx !== 0 || dragGroupDelta.dy !== 0) && selectedGroupSet.size > 1) {
      return displayItems.map((it) =>
        selectedGroupSet.has(it.key) ? { ...it, x: it.x + dragGroupDelta.dx, y: it.y + dragGroupDelta.dy } : it,
      );
    }
    if (dragPreviewItem) {
      return displayItems.map((it) => (it.key === dragPreviewItem.key ? dragPreviewItem : it));
    }
    return displayItems;
  }, [editing, mapRotation, displayItems, dragPreviewItem, dragGroupDelta, selectedGroupSet]);

  const unitMergeMap = useMemo(() => computeUnitMergeMap(liveDisplayItems), [liveDisplayItems]);
  const unplaced = useMemo(
    () => floorShops.filter((s) => !placedUnitIds.has(s.unitId)),
    [floorShops, placedUnitIds],
  );

  const { width, containerRef } = useContainerWidth();
  const availWidth = Math.max(0, (width || viewport.w || 900) - 16);
  const minDeviceCellPx = editing ? 5 : viewport.w <= 480 ? 5 : viewport.w <= 768 ? 6 : 2;
  // In Edit mode, keep cell size constant (based on DEFAULT_COLUMNS) and lock it against scrollbar width changes
  // so neither tiles nor the blueprint ever shrink or zoom when placing units below or to the sides.
  const rawCellPx = Math.floor(availWidth / Math.max(1, editing ? DEFAULT_COLUMNS : displayColumns));
  const lockedEditCellPxRef = useRef<{ windowW: number; containerW: number; cellPx: number } | null>(null);
  if (!editing) {
    lockedEditCellPxRef.current = null;
  } else if (width && width > 0) {
    const nextEditCellPx = Math.max(5, rawCellPx);
    if (
      !lockedEditCellPxRef.current ||
      Math.abs(lockedEditCellPxRef.current.windowW - viewport.w) > 2 ||
      Math.abs(lockedEditCellPxRef.current.containerW - width) > 24
    ) {
      lockedEditCellPxRef.current = { windowW: viewport.w, containerW: width, cellPx: nextEditCellPx };
    }
  }
  const maxCanvasHeight = Math.max(340, Math.round(viewport.h * (fullScreen ? 0.72 : 0.65)));
  const maxCellByHeight = Math.max(minDeviceCellPx, Math.floor(maxCanvasHeight / Math.max(1, rows)));
  const cellPx = editing
    ? (lockedEditCellPxRef.current?.cellPx ?? Math.max(5, rawCellPx))
    : isQuarterTurn
      ? Math.max(minDeviceCellPx, Math.min(rawCellPx, maxCellByHeight, 13))
      : Math.max(minDeviceCellPx, rawCellPx);
  const naturalGridWidth = displayColumns * cellPx;
  const gridWidth = Math.max(240, naturalGridWidth);
  const colStepPx = displayColumns > 0 ? gridWidth / displayColumns : cellPx;
  const rowStepPx = cellPx;
  const floorplateBounds = useMemo(
    () => (!editing ? computeFloorplateBounds(displayItems, displayColumns) : null),
    [editing, displayItems, displayColumns],
  );

  // ── Feature #7: Background Floorplan Blueprint Image Overlay (Edit Layout) ──
  useEffect(() => {
    if (!floor || typeof window === 'undefined') {
      setBlueprint(null);
      editOriginBlueprintRef.current = null;
      setAdjustingBlueprint(false);
      return;
    }
    try {
      const raw = window.localStorage.getItem(getBlueprintStorageKey(floor));
      if (!raw) {
        setBlueprint(null);
        editOriginBlueprintRef.current = null;
        setAdjustingBlueprint(false);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.dataUrl === 'string' && parsed.dataUrl.length > 0) {
        const refCellPx = Math.max(5, cellPx);
        const savedGridCols = typeof parsed.gridCols === 'number' && parsed.gridCols > 0 ? parsed.gridCols : 60;
        const colScale = DEFAULT_COLUMNS / savedGridCols;
        const offsetX = typeof parsed.offsetX === 'number' ? parsed.offsetX : Math.round(EDIT_LEFT_PAD * refCellPx);
        const offsetY = typeof parsed.offsetY === 'number' ? parsed.offsetY : Math.round(2 * refCellPx);
        const offsetCellX =
          typeof parsed.offsetCellX === 'number'
            ? Math.round(parsed.offsetCellX * colScale * 100) / 100
            : Math.round((offsetX / refCellPx) * 100) / 100;
        const offsetCellY =
          typeof parsed.offsetCellY === 'number'
            ? Math.round(parsed.offsetCellY * colScale * 100) / 100
            : Math.round((offsetY / refCellPx) * 100) / 100;
        const loadedBp: BlueprintOverlayConfig = {
          dataUrl: parsed.dataUrl,
          visible: parsed.visible !== false,
          opacity: typeof parsed.opacity === 'number' ? Math.min(95, Math.max(10, parsed.opacity)) : 15,
          scale: typeof parsed.scale === 'number' ? Math.min(250, Math.max(25, parsed.scale)) : 100,
          offsetX: Math.round(offsetCellX * refCellPx),
          offsetY: Math.round(offsetCellY * refCellPx),
          offsetCellX,
          offsetCellY,
          gridCols: DEFAULT_COLUMNS,
          aspectRatio: typeof parsed.aspectRatio === 'number' && parsed.aspectRatio > 0 ? parsed.aspectRatio : undefined,
          rotation: typeof parsed.rotation === 'number' ? ((parsed.rotation % 360) + 360) % 360 : 0,
        };
        setBlueprint(loadedBp);
        editOriginBlueprintRef.current = loadedBp;
      } else {
        setBlueprint(null);
        editOriginBlueprintRef.current = null;
      }
    } catch {
      setBlueprint(null);
      editOriginBlueprintRef.current = null;
    }
    setAdjustingBlueprint(false);
  }, [floor]);

  useEffect(() => {
    if (!editing && adjustingBlueprint) {
      setAdjustingBlueprint(false);
    }
  }, [editing, adjustingBlueprint]);

  const saveBlueprintConfig = (next: BlueprintOverlayConfig | null, markDirty = true) => {
    setBlueprint(next);
    if (editing && markDirty) {
      setDirty(true);
    }
    if (!floor || typeof window === 'undefined') return;
    try {
      const key = getBlueprintStorageKey(floor);
      if (!next) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify({ ...next, gridCols: DEFAULT_COLUMNS }));
      }
    } catch {
      // Ignore storage quota errors; keep in-memory state active for the session
    }
  };

  const updateBlueprint = (patch: Partial<BlueprintOverlayConfig>, markDirty = true) => {
    if (editing && markDirty) {
      setDirty(true);
    }
    setBlueprint((prev) => {
      if (!prev) return null;
      const next: BlueprintOverlayConfig = { ...prev, ...patch, gridCols: DEFAULT_COLUMNS };
      if (floor && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(getBlueprintStorageKey(floor), JSON.stringify(next));
        } catch {
          // Ignore quota error
        }
      }
      return next;
    });
  };

  const handleBlueprintFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (PNG, JPG, WebP, SVG)');
      return;
    }
    try {
      const { dataUrl, aspectRatio } = await compressBlueprintImageToDataUrl(file);
      const refCellPx = Math.max(5, cellPx);
      const offsetCellX = blueprint?.offsetCellX ?? EDIT_LEFT_PAD;
      const offsetCellY = blueprint?.offsetCellY ?? 2;
      const next: BlueprintOverlayConfig = {
        dataUrl,
        visible: true,
        opacity: blueprint?.opacity ?? 15,
        scale: blueprint?.scale ?? 100,
        offsetX: Math.round(offsetCellX * refCellPx),
        offsetY: Math.round(offsetCellY * refCellPx),
        offsetCellX,
        offsetCellY,
        gridCols: DEFAULT_COLUMNS,
        aspectRatio,
        rotation: blueprint?.rotation ?? 0,
      };
      saveBlueprintConfig(next, true);
      toast.success('Blueprint overlay loaded');
    } catch {
      toast.error('Could not load blueprint image');
    }
  };

  const handleRemoveBlueprint = () => {
    saveBlueprintConfig(null, true);
    setAdjustingBlueprint(false);
    toast.success('Blueprint overlay removed');
  };

  const startDragBlueprintMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || !adjustingBlueprint || !blueprint) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const refCellPx = Math.max(5, cellPx);
    const origCellX =
      typeof blueprint.offsetCellX === 'number' ? blueprint.offsetCellX : blueprint.offsetX / refCellPx;
    const origCellY =
      typeof blueprint.offsetCellY === 'number' ? blueprint.offsetCellY : blueprint.offsetY / refCellPx;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const nextCellX = Math.round((origCellX + dx / refCellPx) * 100) / 100;
      const nextCellY = Math.round((origCellY + dy / refCellPx) * 100) / 100;
      updateBlueprint({
        offsetCellX: nextCellX,
        offsetCellY: nextCellY,
        offsetX: Math.round(nextCellX * refCellPx),
        offsetY: Math.round(nextCellY * refCellPx),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startDragBlueprintScale = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!editing || !adjustingBlueprint || !blueprint) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origScale = blueprint.scale;
    const baseW = Math.max(240, DEFAULT_COLUMNS * cellPx);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const deltaPct = (dx / baseW) * 100;
      const nextScale = Math.min(250, Math.max(25, Math.round(origScale + deltaPct)));
      updateBlueprint({ scale: nextScale });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const staticTileMetaMap = useMemo(() => {
    const map = new Map<
      string,
      {
        wPx: number;
        hPx: number;
        lmMeta: ReturnType<typeof parseLandmarkMeta> | null;
        unitMode: UnitShapeMode | null;
        polyAtriumGeo: ReturnType<typeof getPolygonAtriumGeometry> | null;
        trapezoidGeo: TrapezoidUnitGeometry | null;
        ringSectorAlign: ReturnType<typeof getCircleRingSectorAlignment> | null;
        hasInnerItems: boolean;
        parentAtrium: MapItem | null;
      }
    >();
    for (const it of displayItems) {
      const wPx = Math.max(1, it.w * cellPx);
      const hPx = Math.max(1, it.h * cellPx);
      const decor = it.kind !== 'unit';
      const um = !decor ? unitMergeMap.get(it.key) ?? null : null;
      const lmMeta = decor ? parseLandmarkMeta(it.kind, it.label) : null;
      const unitMode =
        it.kind === 'unit'
          ? parseUnitShapeMode(it, autoShapeEnabled ? liveDisplayItems : undefined)
          : null;
      const polyAtriumGeo = lmMeta?.polygonFaces
        ? getPolygonAtriumGeometry(lmMeta.polygonFaces, wPx, hPx)
        : null;
      const trapezoidGeo =
        unitMode && isTrapezoidUnitMode(unitMode)
          ? getTrapezoidUnitGeometry(unitMode, wPx, hPx, cellPx, um, it, liveDisplayItems)
          : null;
      const ringSectorAlign =
        it.kind === 'unit' ? getCircleRingSectorAlignment(it, liveDisplayItems) : null;
      let hasInnerItems = false;
      let parentAtrium: MapItem | null = null;
      for (const o of liveDisplayItems) {
        if (o.key === it.key) continue;
        if (it.x < o.x + o.w && it.x + it.w > o.x && it.y < o.y + o.h && it.y + it.h > o.y) {
          if (it.kind === 'atrium' && isTransitLandmark(o.kind)) {
            const ocx = o.x + o.w * 0.5;
            const ocy = o.y + o.h * 0.5;
            if (ocx >= it.x && ocx <= it.x + it.w && ocy >= it.y && ocy <= it.y + it.h) {
              hasInnerItems = true;
            }
          }
          if (isTransitLandmark(it.kind) && o.kind === 'atrium' && !parentAtrium) {
            parentAtrium = o;
          }
        }
      }
      map.set(it.key, {
        wPx,
        hPx,
        lmMeta,
        unitMode,
        polyAtriumGeo,
        trapezoidGeo,
        ringSectorAlign,
        hasInnerItems,
        parentAtrium,
      });
    }
    return map;
  }, [displayItems, liveDisplayItems, cellPx, unitMergeMap, autoShapeEnabled]);

  // Resolve starting point ("You Are Here" by default, or user-selected shop/landmark)
  const defaultStartItem = useMemo(() => findDefaultStartItem(displayItems), [displayItems]);
  const activeStartItem = useMemo(() => {
    if (customStartKey) {
      const found = resolveTileByKey(displayItems, customStartKey);
      if (found) return found;
    }
    if (transitArrivalMode) {
      const transit = displayItems.find((i) => i.kind === 'escalator' || i.kind === 'stairs');
      if (transit) return transit;
    }
    return defaultStartItem;
  }, [displayItems, customStartKey, transitArrivalMode, defaultStartItem]);

  // If we arrived on a new floor via multi-floor navigation, automatically target the cross-floor unit
  useEffect(() => {
    if (crossFloorUnitId) {
      const targetShop = allShopByUnit.get(crossFloorUnitId);
      if (targetShop && floorKeyOf(targetShop) === floor) {
        const primaryTile = findPrimaryUnitTile(displayItems, crossFloorUnitId);
        if (primaryTile) {
          setTargetKey(unitKey(crossFloorUnitId));
          setCrossFloorUnitId(null);
        }
      }
    }
  }, [crossFloorUnitId, floor, displayItems, allShopByUnit]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const hasActiveSearch = Boolean(!editing && normalizedSearch.length > 0);
  const searchRoutedRef = useRef(false);
  const lastScrolledKeyRef = useRef('');

  // When searching for a unit/shop, automatically switch to its floor if needed
  useEffect(() => {
    if (!hasActiveSearch) {
      if (searchRoutedRef.current) {
        searchRoutedRef.current = false;
        lastScrolledKeyRef.current = '';
        setTargetKey('');
        setCrossFloorUnitId(null);
      }
      return;
    }
    const matched = shops
      .map((s) => ({
        shop: s,
        score: scoreShopSearchMatch(s, normalizedSearch),
        onCurrentFloor: floorKeyOf(s) === floor ? 1 : 0,
      }))
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.onCurrentFloor - a.onCurrentFloor ||
          compareShopsByUnitNumber(a.shop, b.shop),
      );
    if (matched.length === 0) return;
    const bestFloor = floorKeyOf(matched[0].shop);
    if (bestFloor && bestFloor !== floor && floors.includes(bestFloor)) {
      setFloor(bestFloor);
    }
  }, [hasActiveSearch, normalizedSearch, shops, floor, floors]);

  // Once on the floor, route to the best matched unit and scroll the map to its tile
  useEffect(() => {
    if (!hasActiveSearch) return;
    const placedMatches = placedShops
      .map((s) => {
        const score = scoreShopSearchMatch(s, normalizedSearch);
        const item = score > 0 ? findPrimaryUnitTile(displayItems, s.unitId) : null;
        return item ? { item, shop: s, score } : null;
      })
      .filter((x): x is { item: MapItem; shop: any; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score || compareShopsByUnitNumber(a.shop, b.shop));

    if (placedMatches.length === 0) return;
    const bestItem = placedMatches[0].item;
    const bestTargetKey = bestItem.unitId ? unitKey(bestItem.unitId) : bestItem.key;
    searchRoutedRef.current = true;
    setCrossFloorUnitId(null);
    if (targetKey !== bestTargetKey) {
      setTargetKey(bestTargetKey);
    }

    const scrollSig = `${floor}:${bestItem.key}:${normalizedSearch}`;
    if (lastScrolledKeyRef.current !== scrollSig) {
      lastScrolledKeyRef.current = scrollSig;
      requestAnimationFrame(() => {
        const wrapEl = containerRef.current;
        const tileEl = wrapEl?.querySelector(`[data-tile-key="${bestItem.key}"]`) as HTMLElement | null;
        if (tileEl) {
          tileEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      });
    }
  }, [hasActiveSearch, normalizedSearch, placedShops, displayItems, floor, targetKey, containerRef]);

  const crossFloorShop = useMemo(
    () => (crossFloorUnitId ? allShopByUnit.get(crossFloorUnitId) || null : null),
    [crossFloorUnitId, allShopByUnit],
  );

  // Resolve effective target item on the current floor
  const effectiveTargetItem = useMemo(() => {
    if (crossFloorShop && floorKeyOf(crossFloorShop) !== floor) {
      return findNearestFacilityItem(displayItems, activeStartItem, ['escalator', 'stairs', 'exit']);
    }
    return resolveTileByKey(displayItems, targetKey);
  }, [crossFloorShop, floor, displayItems, activeStartItem, targetKey]);

  const selectedUnitId = useMemo(() => {
    if (effectiveTargetItem?.kind === 'unit' && effectiveTargetItem.unitId) {
      return effectiveTargetItem.unitId;
    }
    return null;
  }, [effectiveTargetItem]);

  const selectedShop = useMemo(
    () => (selectedUnitId ? shopByUnit.get(selectedUnitId) || null : null),
    [selectedUnitId, shopByUnit],
  );

  const effectiveSqftPerCell = useMemo(
    () => calibrateSqftPerCell(displayItems, shopByUnit, sqftPerCell),
    [displayItems, shopByUnit, sqftPerCell],
  );

  const describeTile = (it: MapItem | null): string => {
    if (!it) return '—';
    if (it.kind === 'unit' && it.unitId) {
      return shopDisplayName(shopByUnit.get(it.unitId), 'Shop');
    }
    return parseLandmarkMeta(it.kind, it.label).displayLabel;
  };

  // Compute route path and landmark/shop waypoint steps
  const walkwayRoute = useMemo(() => {
    if (editing || !activeStartItem || !effectiveTargetItem) return null;
    if (activeStartItem.key === effectiveTargetItem.key) return null;
    if (activeStartItem.unitId && activeStartItem.unitId === effectiveTargetItem.unitId) return null;
    return computeWalkwayPath(
      displayItems,
      activeStartItem,
      effectiveTargetItem,
      displayColumns,
      effectiveSqftPerCell,
      describeTile,
    );
  }, [editing, activeStartItem, effectiveTargetItem, displayItems, displayColumns, effectiveSqftPerCell, shopByUnit]);

  const routeRenderData = useMemo(() => {
    if (!walkwayRoute || walkwayRoute.points.length < 2) return null;
    const pxPoints = walkwayRoute.points.map((pt) => ({
      x: pt.x * colStepPx,
      y: pt.y * rowStepPx,
    }));
    let totalPxLen = 0;
    for (let i = 1; i < pxPoints.length; i++) {
      totalPxLen += Math.hypot(pxPoints[i].x - pxPoints[i - 1].x, pxPoints[i].y - pxPoints[i - 1].y);
    }
    const drawDurationSec = Math.round(Math.max(2.5, Math.min(3.5, 2.25 + totalPxLen / 550)) * 100) / 100;
    const routeAnimKey = `${floor}:${activeStartItem?.key ?? ''}->${effectiveTargetItem?.key ?? ''}`;
    return {
      smoothPathD: buildSmoothRouteSvgPath(pxPoints, Math.max(4, Math.round(cellPx * 0.36))),
      routeArrows: computeRouteDirectionArrows(pxPoints, Math.max(38, Math.round(cellPx * 2.2))),
      startPt: pxPoints[0],
      endPt: pxPoints[pxPoints.length - 1],
      drawDurationSec,
      routeAnimKey,
    };
  }, [walkwayRoute, colStepPx, rowStepPx, cellPx, floor, activeStartItem?.key, effectiveTargetItem?.key]);

  const openLandmarkConfig = (key: string) => {
    const target = items.find((i) => i.key === key);
    if (!target || target.kind === 'unit') return;
    const meta = parseLandmarkMeta(target.kind, target.label);
    setEditingLandmarkKey(key);
    setLandmarkVariantDraft(meta.variant);
    setLandmarkCustomDraft(meta.customName);
    setLandmarkShowLabelDraft(meta.showLabel);
  };

  const resolveConflictFreeTileShapeChange = (
    candidate: MapItem,
    allItems: ReadonlyArray<MapItem>,
    maxNudge = 4,
  ): MapItem => {
    const others = allItems.filter((o) => o.key !== candidate.key);
    if (!others.some((o) => tilesConflict(candidate, o))) {
      return candidate;
    }
    let best: { cand: MapItem; dist: number } | null = null;
    for (let dy = -maxNudge; dy <= maxNudge; dy++) {
      for (let dx = -maxNudge; dx <= maxNudge; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = candidate.x + dx;
        const ny = candidate.y + dy;
        if (nx < 0 || ny < 0 || nx + candidate.w > effectiveColumns) continue;
        const dist = Math.hypot(dx, dy);
        if (best && dist >= best.dist) continue;
        const testCand: MapItem = { ...candidate, x: nx, y: ny };
        if (!others.some((o) => tilesConflict(testCand, o))) {
          best = { cand: testCand, dist };
        }
      }
    }
    return best ? best.cand : candidate;
  };

  const saveLandmarkConfig = () => {
    if (!editingLandmarkKey) return;
    update((prev) =>
      prev.map((i) => {
        if (i.key !== editingLandmarkKey || i.kind === 'unit') return i;
        const nextLabel = encodeLandmarkMeta(i.kind, landmarkVariantDraft, landmarkCustomDraft, landmarkShowLabelDraft);
        const nextItem: MapItem = { ...i, label: nextLabel };
        const squared =
          i.kind === 'marker' || parseLandmarkMeta(i.kind, nextLabel).isCircle
            ? autoSquareCircleLandmark(nextItem, prev, effectiveColumns)
            : nextItem;
        return resolveConflictFreeTileShapeChange(squared, prev, 4);
      }),
    );
    setEditingLandmarkKey(null);
  };

  const targetLandmarkKey = targetKey && !targetKey.startsWith('unit:') ? targetKey : '';
  const navOptions = useMemo(() => {
    const rawLandmarks = displayItems.filter((i) => i.kind !== 'unit');
    const startByLabel = new Map<string, MapItem>();
    const destByLabel = new Map<string, MapItem>();
    for (const lm of rawLandmarks) {
      const label = describeTile(lm);
      if (!startByLabel.has(label) || lm.key === activeStartItem?.key) {
        startByLabel.set(label, lm);
      }
      if (!destByLabel.has(label)) {
        const nearest = findNearestFacilityItem(displayItems, activeStartItem, [lm.kind]) || lm;
        destByLabel.set(label, nearest);
      }
      if (targetLandmarkKey && lm.key === targetLandmarkKey) {
        destByLabel.set(label, lm);
      }
    }
    const unitItems = placedShops
      .map((s) => findPrimaryUnitTile(displayItems, s.unitId))
      .filter((x): x is MapItem => Boolean(x));
    const startLandmarks = Array.from(startByLabel.values());
    const destLandmarks = Array.from(destByLabel.values());
    return {
      fromOptions: [
        ...startLandmarks.map((lm) => ({ value: lm.key, label: describeTile(lm) })),
        ...unitItems.map((u) => ({ value: u.key, label: describeTile(u) })),
      ],
      toOptions: [
        ...placedShops.map((s) => ({ value: unitKey(s.unitId), label: shopDisplayName(s) })),
        ...destLandmarks.map((lm) => ({ value: lm.key, label: describeTile(lm) })),
        ...otherFloorShops.map((s) => ({ value: `cross:${s.unitId}`, label: shopDisplayName(s) })),
      ],
    };
  }, [displayItems, placedShops, otherFloorShops, activeStartItem, targetLandmarkKey, shopByUnit]);

  const handleSelectDestination = (val: string) => {
    setHighlightedAmenityKinds((prev) => (prev.length > 0 ? [] : prev));
    if (!val) {
      setTargetKey('');
      setCrossFloorUnitId(null);
      return;
    }
    if (val.startsWith('cross:')) {
      const uId = val.slice('cross:'.length);
      setCrossFloorUnitId(uId);
      setTargetKey('');
      return;
    }
    setCrossFloorUnitId(null);
    setTargetKey(val);
  };

  const handleQuickFacility = (kinds: TileKind[]) => {
    setCrossFloorUnitId(null);
    const nearest = findNearestFacilityItem(displayItems, activeStartItem, kinds);
    if (!nearest) {
      toast.error('Not available on this floor map');
      return;
    }
    const isAlreadySameKind =
      targetKey === nearest.key &&
      highlightedAmenityKinds.length === kinds.length &&
      kinds.every((k) => highlightedAmenityKinds.includes(k));
    if (isAlreadySameKind) {
      setTargetKey('');
      setHighlightedAmenityKinds([]);
    } else {
      setTargetKey(nearest.key);
      setHighlightedAmenityKinds(kinds);
    }
  };

  const clearRoute = () => {
    setTargetKey('');
    setCrossFloorUnitId(null);
    setTransitArrivalMode(false);
    setOriginFloorBeforeTransit(null);
    setHighlightedAmenityKinds([]);
  };

  const cycleMapRotation = () => {
    setMapRotation((prev) => (((prev + 90) % 360) as MapRotationAngle));
  };

  const update = (fn: (prev: MapItem[]) => MapItem[]) => {
    setItems((prev) => {
      const next = fn(prev);
      itemsRef.current = next;
      return next;
    });
    setLayoutResetTick((n) => n + 1);
    setDirty(true);
  };

  const [newlyPlacedKey, setNewlyPlacedKey] = useState<string | null>(null);
  const newlyPlacedTimerRef = useRef<number | null>(null);

  const getVisibleViewportGridBounds = (): { minX: number; maxX: number; minY: number; maxY: number } => {
    const wrapEl = containerRef.current as HTMLElement | null;
    const stageEl = wrapEl?.querySelector('.shop-map-stage') as HTMLElement | null;
    const stepX = Math.max(8, colStepPx);
    const stepY = Math.max(8, rowStepPx);
    if (!wrapEl || !stageEl || typeof window === 'undefined') {
      return {
        minX: EDIT_LEFT_PAD,
        maxX: Math.min(effectiveColumns, EDIT_LEFT_PAD + DEFAULT_COLUMNS - 4),
        minY: 0,
        maxY: 16,
      };
    }
    const wrapRect = wrapEl.getBoundingClientRect();
    const stageRect = stageEl.getBoundingClientRect();
    const visLeftPx = Math.max(0, Math.max(wrapRect.left + 8, 8) - stageRect.left);
    const visRightPx = Math.max(
      visLeftPx + stepX * 12,
      Math.min(wrapRect.right - 8, window.innerWidth - 16) - stageRect.left,
    );
    const visTopPx = Math.max(0, Math.max(wrapRect.top + 8, 72) - stageRect.top);
    const visBottomPx = Math.max(
      visTopPx + stepY * 8,
      Math.min(wrapRect.bottom - 8, window.innerHeight - 24) - stageRect.top,
    );
    const minX = Math.max(EDIT_LEFT_PAD, Math.ceil(visLeftPx / stepX));
    const maxX = Math.max(minX + 8, Math.min(effectiveColumns, Math.floor(visRightPx / stepX)));
    const minY = Math.max(0, Math.ceil(visTopPx / stepY));
    const maxY = Math.max(minY + 6, Math.floor(visBottomPx / stepY));
    return { minX, maxX, minY, maxY };
  };

  const lastActiveTileKeyRef = useRef<string | null>(null);

  const resolvePlacementAnchor = (
    list: ReadonlyArray<MapItem>,
    preferredKind?: TileKind,
  ): MapItem | null => {
    if (lastActiveTileKeyRef.current) {
      const byActive = list.find((i) => i.key === lastActiveTileKeyRef.current);
      if (byActive) return byActive;
    }
    if (selectedGroupKeys.length > 0) {
      const lastGroupKey = selectedGroupKeys[selectedGroupKeys.length - 1];
      const byGroup = list.find((i) => i.key === lastGroupKey);
      if (byGroup) return byGroup;
    }
    if (preferredKind) {
      for (let idx = list.length - 1; idx >= 0; idx--) {
        if (list[idx].kind === preferredKind) return list[idx];
      }
    }
    for (let idx = list.length - 1; idx >= 0; idx--) {
      if (list[idx].kind !== 'atrium') return list[idx];
    }
    return list.length > 0 ? list[list.length - 1] : null;
  };

  const focusNewlyPlacedTile = (tileKey: string) => {
    lastActiveTileKeyRef.current = tileKey;
    if (newlyPlacedTimerRef.current) {
      window.clearTimeout(newlyPlacedTimerRef.current);
    }
    setNewlyPlacedKey(tileKey);
    newlyPlacedTimerRef.current = window.setTimeout(() => {
      setNewlyPlacedKey((cur) => (cur === tileKey ? null : cur));
      newlyPlacedTimerRef.current = null;
    }, 2400);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const wrapEl = containerRef.current as HTMLElement | null;
        const tileEl = wrapEl?.querySelector(`[data-tile-key="${tileKey}"]`) as HTMLElement | null;
        if (!tileEl || !wrapEl) return;
        const tileRect = tileEl.getBoundingClientRect();
        const wrapRect = wrapEl.getBoundingClientRect();
        const visibleLeft = Math.max(wrapRect.left, 0);
        const visibleRight = Math.min(wrapRect.right, window.innerWidth);
        const visibleTop = Math.max(wrapRect.top, 64);
        const visibleBottom = Math.min(wrapRect.bottom, window.innerHeight - 16);
        const isFullyVisible =
          tileRect.left >= visibleLeft &&
          tileRect.right <= visibleRight &&
          tileRect.top >= visibleTop &&
          tileRect.bottom <= visibleBottom;
        if (!isFullyVisible) {
          tileEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      });
    });
  };

  const place = (shop: any) => {
    const { w, h } = tileSizeFromSqft(shop.unit?.areaSqft, effectiveSqftPerCell, DEFAULT_COLUMNS);
    const vpBounds = getVisibleViewportGridBounds();
    const newKey = nextUnitBlockKey(items, shop.unitId);
    update((prev) => {
      const actualKey = nextUnitBlockKey(prev, shop.unitId);
      const anchor = resolvePlacementAnchor(prev, 'unit');
      const ringPlaced = findNextRingSectorPlacement(prev, anchor, shop.unitId, actualKey, effectiveColumns);
      if (ringPlaced) {
        lastActiveTileKeyRef.current = actualKey;
        return [...prev, ringPlaced];
      }
      const pos = anchor
        ? findSpotNextToAnchor(prev, anchor, w, h, effectiveColumns, EDIT_LEFT_PAD, vpBounds, 'unit', shop.unitId)
        : findFreeSpot(prev, w, h, effectiveColumns, EDIT_LEFT_PAD, vpBounds);
      const rawItem: MapItem = {
        key: actualKey,
        kind: 'unit',
        unitId: shop.unitId,
        label: null,
        x: pos.x,
        y: pos.y,
        w,
        h,
      };
      const nextList = [...prev, rawItem];
      const snapped = magnetEnabled
        ? snapTileToBorder(rawItem, nextList, effectiveColumns, undefined, snapAutoResize, autoShapeEnabled)
        : curveUnitAroundCircleWithoutSnap(rawItem, nextList, autoShapeEnabled);
      const keepSnapped =
        snapped &&
        Math.hypot(snapped.x - rawItem.x, snapped.y - rawItem.y) <= 2.5 &&
        snapped.x >= 0 &&
        snapped.x + snapped.w <= effectiveColumns &&
        !prev.some((o) => tilesConflict(snapped, o));
      lastActiveTileKeyRef.current = actualKey;
      return keepSnapped && snapped ? [...prev, snapped] : nextList;
    });
    focusNewlyPlacedTile(newKey);
  };

  const addUnitWing = (anchorKey: string) => {
    const anchor = items.find((i) => i.key === anchorKey);
    const newKey = anchor?.unitId ? nextUnitBlockKey(items, anchor.unitId) : null;
    update((prev) => addConnectedUnitWing(prev, anchorKey, effectiveColumns));
    if (newKey) focusNewlyPlacedTile(newKey);
  };

  const handleSyncUnitSqft = () => {
    const res = syncUnitTilesToSqft(items, shopByUnit, effectiveSqftPerCell, effectiveColumns);
    itemsRef.current = res.items;
    setItems(res.items);
    setSqftPerCell(res.calibratedSqftPerCell);
    if (res.updatedCount > 0) {
      setDirty(true);
      toast.success(`Synced ${res.updatedCount} unit tiles to database sqft (${res.calibratedSqftPerCell} sqft/cell)`);
    } else {
      toast.success(`Unit tiles already match database sqft (${res.calibratedSqftPerCell} sqft/cell)`);
    }
  };

  const handleRadialAlignAtrium = (targetAtriumKey?: string) => {
    const res = alignUnitsRadiallyAroundAtrium(
      items,
      targetAtriumKey,
      effectiveColumns,
      selectedGroupSet.size > 0 ? selectedGroupSet : undefined,
    );
    itemsRef.current = res.items;
    setItems(res.items);
    setLayoutResetTick((n) => n + 1);
    if (res.alignedCount > 0) {
      setDirty(true);
      toast.success(`Aligned ${res.alignedCount} unit${res.alignedCount === 1 ? '' : 's'} around Atrium perimeter`);
    } else {
      toast.success('Units around Atrium are already aligned');
    }
  };

  const addDecor = (kind: Exclude<TileKind, 'unit'> = decorKind) => {
    if (kind === 'marker' && items.some((i) => i.kind === 'marker')) return;
    const { w, h } = DECORATION_DEFAULT_SIZES[kind] || { w: 6, h: 4 };
    const vpBounds = getVisibleViewportGridBounds();
    const newKey = `d:${decorSeq}`;
    update((prev) => {
      const anchor = resolvePlacementAnchor(prev, kind);
      const pos = anchor
        ? findSpotNextToAnchor(prev, anchor, w, h, effectiveColumns, EDIT_LEFT_PAD, vpBounds, kind, null)
        : findFreeSpot(prev, w, h, effectiveColumns, EDIT_LEFT_PAD, vpBounds);
      lastActiveTileKeyRef.current = newKey;
      return [...prev, { key: newKey, kind, unitId: null, label: DECORATION_LABELS[kind], x: pos.x, y: pos.y, w, h }];
    });
    setDecorSeq((n) => n + 1);
    focusNewlyPlacedTile(newKey);
  };

  const createTransitInAtrium = (atriumKey: string, kind: 'escalator' | 'stairs' | 'info', variant: string) => {
    const newKey = `d:${decorSeq}`;
    update((prev) => addTransitIntoAtrium(prev, atriumKey, kind, variant, effectiveColumns, newKey));
    setDecorSeq((n) => n + 1);
    focusNewlyPlacedTile(newKey);
  };

  const resolveConflictFreeRotatedTile = (
    tile: MapItem,
    nextAngle: number | undefined,
    others: ReadonlyArray<MapItem>,
    maxNudge = 4,
  ): MapItem | null => {
    const inPlace: MapItem = { ...tile, angle: nextAngle };
    if (!others.some((o) => tilesConflict(inPlace, o))) {
      return inPlace;
    }
    let best: { cand: MapItem; dist: number } | null = null;
    for (let dy = -maxNudge; dy <= maxNudge; dy++) {
      for (let dx = -maxNudge; dx <= maxNudge; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx < 0 || ny < 0 || nx + tile.w > effectiveColumns) continue;
        const dist = Math.hypot(dx, dy);
        if (best && dist >= best.dist) continue;
        const cand: MapItem = { ...tile, x: nx, y: ny, angle: nextAngle };
        if (!others.some((o) => tilesConflict(cand, o))) {
          best = { cand, dist };
        }
      }
    }
    return best ? best.cand : null;
  };

  const rotate = (key: string, stepDeg = 1) => {
    lastActiveTileKeyRef.current = key;
    groupRotBaseRef.current = null;
    let blocked = false;
    update((prev) => {
      const rotatedList = prev.map((i) => {
        if (i.key !== key) return i;
        const others = prev.filter((o) => o.key !== i.key);
        const nextAngle = normalizeTileAngle((i.angle ?? 0) + stepDeg);
        const safeRotated = resolveConflictFreeRotatedTile(i, nextAngle, others, 4);
        if (safeRotated) return safeRotated;
        blocked = true;
        return i;
      });
      return rotatedList;
    });
    if (blocked) {
      toast.error('Cannot rotate — blocked by another tile');
    } else {
      setLayoutResetTick((n) => n + 1);
    }
  };

  const startDragRotateTile = (e: React.PointerEvent<HTMLButtonElement>, key: string) => {
    e.stopPropagation();
    e.preventDefault();
    lastActiveTileKeyRef.current = key;
    groupRotBaseRef.current = null;
    const gridEl = e.currentTarget.closest('.shop-map-grid-item') as HTMLElement | null;
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startItem = itemsRef.current.find((i) => i.key === key);
    const baseX = startItem?.x ?? 0;
    const baseY = startItem?.y ?? 0;
    setRotatingTileKey(key);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - cx;
      const dy = ev.clientY - cy;
      if (Math.hypot(dx, dy) < 4) return;
      // Handle sits at +90 deg (bottom of unrotated tile: dx=0, dy=+1 -> atan2 = +90 deg -> angle = 0 deg)
      const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90 - mapRotation;
      const snapped = ev.shiftKey ? Math.round(rawDeg / 15) * 15 : Math.round(rawDeg);
      const nextAngle = normalizeTileAngle(snapped);
      setItems((prev) => {
        const cur = prev.find((i) => i.key === key);
        if (!cur) return prev;
        const others = prev.filter((o) => o.key !== key);
        const anchorTile: MapItem = { ...cur, x: baseX, y: baseY };
        const safe = resolveConflictFreeRotatedTile(anchorTile, nextAngle, others, 3);
        if (!safe) return prev;
        const next = prev.map((i) => (i.key === key ? safe : i));
        itemsRef.current = next;
        return next;
      });
      setDirty(true);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setRotatingTileKey(null);
      setLayoutResetTick((n) => n + 1);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const cycleTileShape = (key: string) =>
    update((prev) => {
      const prevMergeMap = computeUnitMergeMap(prev);
      return prev.map((i) => {
        if (i.key !== key) return i;
        if (i.kind !== 'unit') {
          const meta = parseLandmarkMeta(i.kind, i.label);
          const nextVar = nextLandmarkVariant(i.kind, meta.variant);
          const explicitlyHidden = Boolean(i.label?.startsWith('lm:') && i.label.split('|')[0].endsWith('-L'));
          const nextLabel = encodeLandmarkMeta(i.kind, nextVar, meta.customName, explicitlyHidden ? false : undefined);
          const nextItem: MapItem = { ...i, label: nextLabel };
          const squared = parseLandmarkMeta(i.kind, nextLabel).isCircle
            ? autoSquareCircleLandmark(nextItem, prev, effectiveColumns)
            : nextItem;
          return resolveConflictFreeTileShapeChange(squared, prev, 4);
        }
        const isMerged = Boolean(prevMergeMap.get(i.key)?.siblingHasMerge);
        const curr = parseUnitShapeMode(i, prev);
        const nextUnit: MapItem = { ...i, label: encodeUnitShapeMode(nextUnitShapeMode(curr, isMerged)) };
        return resolveConflictFreeTileShapeChange(nextUnit, prev, 4);
      });
    });

  const applyUnitShapeMode = (key: string, nextMode: UnitShapeMode) => {
    update((prev) =>
      prev.map((i) => {
        if (i.key !== key || i.kind !== 'unit') return i;
        const wasRingSector =
          Boolean(i.label?.startsWith('unit:ring-curve')) || i.label === 'unit:trapezoid-ring';
        const isNextRingSector = nextMode === 'ring-curve' || nextMode === 'trapezoid-ring';
        const baseUnit: MapItem = {
          ...i,
          label: encodeUnitShapeMode(nextMode),
          ...(wasRingSector && !isNextRingSector ? { angle: undefined } : {}),
        };
        const orientedUnit = isNextRingSector
          ? alignUnitToNearestCircleAtrium(baseUnit, prev, effectiveColumns)
          : baseUnit;
        return resolveConflictFreeTileShapeChange(orientedUnit, prev, 4);
      }),
    );
  };

  const resetUnitShapeToAuto = (key: string) => {
    update((prev) =>
      prev.map((i) => {
        if (i.key !== key || i.kind !== 'unit') return i;
        const resetItem: MapItem = { ...i, label: null };
        const curved = curveUnitAroundCircleWithoutSnap(resetItem, prev, true);
        return resolveConflictFreeTileShapeChange(curved, prev, 4);
      }),
    );
  };

  const resolveDragVisuals = (
    itemOrKey: MapItem | string | undefined,
    currentItems: ReadonlyArray<MapItem> = displayItems,
  ): { shape: string; clipPath: string } => {
    const t =
      typeof itemOrKey === 'string'
        ? currentItems.find((x) => x.key === itemOrKey)
        : itemOrKey;
    if (!t) return { shape: 'rect', clipPath: 'none' };
    if (t.kind !== 'unit') {
      const meta = parseLandmarkMeta(t.kind, t.label);
      if (meta.polygonFaces) {
        const geo = getPolygonAtriumGeometry(
          meta.polygonFaces,
          Math.max(1, t.w * cellPx),
          Math.max(1, t.h * cellPx),
        );
        return { shape: `poly${meta.polygonFaces}`, clipPath: geo.clipPath };
      }
      return { shape: meta.isCircle ? 'circle' : 'rect', clipPath: 'none' };
    }
    const um = unitMergeMap.get(t.key) ?? null;
    const mode = parseUnitShapeMode(t, autoShapeEnabled ? currentItems : undefined);
    if (isTrapezoidUnitMode(mode)) {
      const wPx = Math.max(1, Math.round(t.w * cellPx));
      const hPx = Math.max(1, Math.round(t.h * cellPx));
      const geo = getTrapezoidUnitGeometry(
        mode,
        wPx,
        hPx,
        cellPx,
        um,
        t,
        currentItems,
      );
      return { shape: mode, clipPath: geo.clipPath };
    }
    return { shape: mode, clipPath: 'none' };
  };

  const resetGroupRotation = () => {
    groupRotBaseRef.current = null;
    setGroupFrameAngle(0);
  };

  const remove = (key: string) => {
    resetGroupRotation();
    setSelectedGroupKeys((prev) => prev.filter((k) => k !== key));
    update((prev) => prev.filter((i) => i.key !== key || i.kind === 'marker'));
  };

  const toggleGroupSelection = (key: string) => {
    resetGroupRotation();
    setSelectedGroupKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleExpandGroupTouching = () => {
    if (selectedGroupSet.size === 0) return;
    resetGroupRotation();
    const expanded = expandTouchingGroupKeys(items, selectedGroupSet);
    const added = expanded.length - selectedGroupSet.size;
    setSelectedGroupKeys(expanded);
    if (added > 0) {
      toast.success(`Added ${added} connected tile${added === 1 ? '' : 's'} to group (${expanded.length} total)`);
    } else {
      toast.success(`All touching tiles are already in the group (${expanded.length})`);
    }
  };

  const handleSelectAllGroup = () => {
    resetGroupRotation();
    setSelectedGroupKeys(items.map((i) => i.key));
  };

  const clearGroupSelection = () => {
    resetGroupRotation();
    setSelectedGroupKeys([]);
    setGroupSelectMode(false);
    setDragGroupDelta(null);
  };

  const nudgeSelectedGroup = (dx: number, dy: number) => {
    if (selectedGroupSetRef.current.size === 0) return;
    groupRotBaseRef.current = null;
    const baseList = itemsRef.current;
    const maxR = baseList.reduce((m, it) => Math.max(m, it.x + it.w), 0) + Math.max(0, dx) + EDIT_RIGHT_PAD;
    const res = moveTileGroupByDelta(
      baseList,
      selectedGroupSetRef.current,
      dx,
      dy,
      Math.max(effectiveColumns, maxR),
    );
    if (res.conflict) {
      toast.error('Cannot move group — blocked by another tile');
      return;
    }
    if (res.moved) {
      itemsRef.current = res.items;
      setItems(res.items);
      setLayoutResetTick((n) => n + 1);
      setDirty(true);
    }
  };

  const startDragRotateGroup = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (selectedGroupSetRef.current.size === 0) return;
    const boxEl = e.currentTarget.closest('.shop-map-group-bounds-box') as HTMLElement | null;
    if (!boxEl) return;
    const rect = boxEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const keysSig = Array.from(selectedGroupSetRef.current).sort().join('|');
    if (!groupRotBaseRef.current || groupRotBaseRef.current.keysSig !== keysSig) {
      groupRotBaseRef.current = {
        keysSig,
        baseItems: itemsRef.current.map((i) => ({ ...i })),
        baseFrameAngle:
          computeGroupBoundingBox(
            itemsRef.current,
            selectedGroupSetRef.current,
            groupFrameAngleRef.current,
          )?.angle ?? 0,
        cumulativeDeg: 0,
      };
    }
    const startCumDeg = groupRotBaseRef.current.cumulativeDeg;
    const startRawDeg =
      (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI - 90 - mapRotation;
    setIsRotatingGroup(true);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - cx;
      const dy = ev.clientY - cy;
      if (Math.hypot(dx, dy) < 6) return;
      const currRawDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90 - mapRotation;
      const deltaFromDragStart = ((((currRawDeg - startRawDeg) % 360) + 540) % 360) - 180;
      const snappedCum =
        (((Math.round(startCumDeg + deltaFromDragStart)) % 360) + 360) % 360;
      if (!groupRotBaseRef.current) return;
      if (snappedCum === groupRotBaseRef.current.cumulativeDeg) return;
      const nextFrameAngle =
        (((groupRotBaseRef.current.baseFrameAngle + snappedCum) % 360) + 360) % 360;
      if (snappedCum === 0) {
        groupRotBaseRef.current.cumulativeDeg = 0;
        setGroupFrameAngle(nextFrameAngle);
        const restored = groupRotBaseRef.current.baseItems.map((i) => ({ ...i }));
        itemsRef.current = restored;
        setItems(restored);
        setLayoutResetTick((n) => n + 1);
        setDirty(true);
        return;
      }
      const res = rotateTileGroup(
        groupRotBaseRef.current.baseItems,
        selectedGroupSetRef.current,
        snappedCum,
        effectiveColumns + EDIT_RIGHT_PAD,
      );
      if (!res.conflict) {
        groupRotBaseRef.current.cumulativeDeg = snappedCum;
        setGroupFrameAngle(nextFrameAngle);
        itemsRef.current = res.items;
        setItems(res.items);
        setLayoutResetTick((n) => n + 1);
        setDirty(true);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setIsRotatingGroup(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startDragResizeGroup = (e: React.PointerEvent<HTMLSpanElement>, handle: GroupResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    if (selectedGroupSetRef.current.size === 0) return;
    groupRotBaseRef.current = null;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseItems = itemsRef.current.map((i) => ({ ...i }));
    const frameAng = groupFrameAngleRef.current;
    const baseBox = computeGroupBoundingBox(baseItems, selectedGroupSetRef.current, frameAng);
    const rad = ((baseBox?.angle ?? 0) * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = -uy;
    const vy = ux;
    const stepX = Math.max(5, colStepPx);
    const stepY = Math.max(5, rowStepPx);
    let lastSig = '0:0';

    const onMove = (ev: PointerEvent) => {
      const dxGrid = (ev.clientX - startX) / stepX;
      const dyGrid = (ev.clientY - startY) / stepY;
      const du = Math.round(dxGrid * ux + dyGrid * uy);
      const dv = Math.round(dxGrid * vx + dyGrid * vy);
      const sig = `${du}:${dv}`;
      if (sig === lastSig) return;
      lastSig = sig;
      if (du === 0 && dv === 0) {
        const restored = baseItems.map((i) => ({ ...i }));
        itemsRef.current = restored;
        setItems(restored);
        setLayoutResetTick((n) => n + 1);
        setDirty(true);
        return;
      }
      const res = resizeTileGroup(
        baseItems,
        selectedGroupSetRef.current,
        handle,
        du,
        dv,
        frameAng,
        effectiveColumns + EDIT_RIGHT_PAD,
      );
      if (!res.conflict) {
        itemsRef.current = res.items;
        setItems(res.items);
        setLayoutResetTick((n) => n + 1);
        setDirty(true);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' && (selectedGroupSetRef.current.size > 0 || groupSelectMode)) {
        clearGroupSelection();
        return;
      }
      if (selectedGroupSetRef.current.size === 0) return;
      const step = e.shiftKey ? 3 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nudgeSelectedGroup(-step, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nudgeSelectedGroup(step, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nudgeSelectedGroup(0, -step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nudgeSelectedGroup(0, step);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, groupSelectMode, effectiveColumns]);

  const groupBounds = useMemo(
    () =>
      editing && selectedGroupSet.size > 1
        ? computeGroupBoundingBox(displayItems, selectedGroupSet, groupFrameAngle)
        : null,
    [editing, displayItems, selectedGroupSet, groupFrameAngle],
  );

  const onLayoutChange = (nextLayout: readonly any[]) => {
    if (!editing || dragOriginItemsRef.current !== null) return;
    const baseItems = itemsRef.current;
    if (hasLayoutConflict(nextLayout, baseItems)) return;
    const layoutByKey = new Map(nextLayout.map((x) => [x.i, x]));
    let changed = false;
    const next = baseItems.map((it) => {
      const l = layoutByKey.get(it.key);
      if (!l) return it;
      if (l.x === it.x && l.y === it.y && l.w === it.w && l.h === it.h) return it;
      changed = true;
      return { ...it, x: l.x, y: l.y, w: l.w, h: l.h };
    });
    if (changed) {
      itemsRef.current = next;
      setItems(next);
      setDirty(true);
    }
  };

  const handleInteractionStart = (_l: unknown, oldItem: { i: string } | null) => {
    if (oldItem?.i) {
      lastActiveTileKeyRef.current = oldItem.i;
    }
    dragOriginItemsRef.current = itemsRef.current.map((i) => ({ ...i }));
    const orig = itemsRef.current.find((t) => t.key === oldItem?.i);
    setDragPreviewItem(orig ? { ...orig } : null);
    setDragGroupDelta(null);
    setDragSnapGuide(null);
    setDragAngle(orig?.angle ?? 0);
    const vis = resolveDragVisuals(orig, itemsRef.current);
    setDragShape(vis.shape);
    setDragClipPath(vis.clipPath);
  };

  const handleInteractionMove = (
    nextLayout: readonly any[],
    _oldItem: any,
    l: any,
    placeholder: any,
    e?: MouseEvent,
    node?: HTMLElement,
  ) => {
    if (!editing || !l || !placeholder) return;
    if (e && typeof e.altKey === 'boolean') {
      const bypass = Boolean(e.altKey || e.shiftKey);
      if (bypassMagnetKeyRef.current !== bypass) {
        bypassMagnetKeyRef.current = bypass;
        setMagnetBypassActive(bypass);
      }
    }
    const baseItems = dragOriginItemsRef.current ?? itemsRef.current;
    const { conflict, items: resolvedItems, groupDelta } = resolveInteractionLayout(nextLayout, baseItems);
    const resolved = resolvedItems.find((i) => i.key === l.i);
    if (!resolved) return;

    if (node?.classList?.contains('react-resizable-handle') && node.parentElement) {
      const gridItemEl = node.parentElement;
      if (gridItemEl.style.width) gridItemEl.style.setProperty('--tile-w', gridItemEl.style.width);
      if (gridItemEl.style.height) gridItemEl.style.setProperty('--tile-h', gridItemEl.style.height);
    }

    placeholder.x = resolved.x;
    placeholder.y = resolved.y;
    placeholder.w = resolved.w;
    placeholder.h = resolved.h;
    setDragPreviewItem(resolved);
    setDragGroupDelta(groupDelta ?? null);
    setDragAngle(resolved.angle ?? 0);
    const vis = resolveDragVisuals(resolved, resolvedItems);
    setDragShape(vis.shape);
    setDragClipPath(vis.clipPath);
    if (!conflict && !groupDelta && magnetEnabled && !bypassMagnetKeyRef.current) {
      setDragSnapGuide(computeMagneticSnapGuide(resolved, resolvedItems));
    } else {
      setDragSnapGuide(null);
    }
  };

  const handleInteractionStop = (finalLayout: readonly any[]) => {
    const baseItems = dragOriginItemsRef.current ?? itemsRef.current;
    const { conflict, items: resolvedItems } = resolveInteractionLayout(finalLayout, baseItems);
    const didMoveOrChange =
      !conflict &&
      resolvedItems.some((it, idx) => {
        const b = baseItems[idx];
        return (
          b &&
          (it.x !== b.x ||
            it.y !== b.y ||
            it.w !== b.w ||
            it.h !== b.h ||
            it.angle !== b.angle ||
            it.label !== b.label)
        );
      });
    const maxRightAfter = resolvedItems.reduce((m, it) => Math.max(m, it.x + it.w), 0);
    if (maxRightAfter + EDIT_RIGHT_PAD > columns) {
      setColumns(maxRightAfter + EDIT_RIGHT_PAD);
    }
    const resolvedByKey = new Map(resolvedItems.map((i) => [i.key, i]));

    // Mutate finalLayout in-place so ReactGridLayout's internal setLayout(finalLayout)
    // immediately commits the reset (or border-snapped / group-shifted) coordinates on mouse release
    for (const l of finalLayout) {
      const r = resolvedByKey.get(l.i);
      if (r) {
        l.x = r.x;
        l.y = r.y;
        l.w = r.w;
        l.h = r.h;
      }
    }

    itemsRef.current = resolvedItems;
    setItems(resolvedItems);
    setLayoutResetTick((n) => n + 1);
    if (didMoveOrChange) {
      setDirty(true);
    }
    dragOriginItemsRef.current = null;
    groupRotBaseRef.current = null;
    setDragPreviewItem(null);
    setDragGroupDelta(null);
    setDragSnapGuide(null);
    setDragAngle(0);
    setDragShape('rect');
    setDragClipPath('none');
  };

  const startEditingLayout = () => {
    setDecorKind('marker');
    clearGroupSelection();
    editOriginBlueprintRef.current = blueprint ? { ...blueprint } : null;
    const hadMarker = items.some((i) => i.kind === 'marker');
    setEditing(true);
    if (!hadMarker) {
      const { w, h } = DECORATION_DEFAULT_SIZES.marker || { w: 6, h: 6 };
      const maxR = items.reduce((m, it) => Math.max(m, it.x + it.w), 0);
      const cols = Math.max(columns, DEFAULT_COLUMNS, maxR + EDIT_RIGHT_PAD);
      const pos = findFreeSpot(items, w, h, cols, EDIT_LEFT_PAD);
      const next = [
        ...items,
        { key: `d:${decorSeq}`, kind: 'marker' as const, unitId: null, label: DECORATION_LABELS.marker, x: pos.x, y: pos.y, w, h },
      ];
      itemsRef.current = next;
      setItems(next);
      setDecorSeq((n) => n + 1);
      setDirty(true);
    }
  };

  const discard = () => {
    clearGroupSelection();
    setAdjustingBlueprint(false);
    setDirty(false);
    setEditing(false);
    saveBlueprintConfig(editOriginBlueprintRef.current, false);
    applyParsedLayout(parseFloorPlanData(activePlanData, shopByUnit));
  };

  const handleCopyFromFloor = async () => {
    if (!propertyId || !copySourceFloor) return;
    try {
      let srcData: any = null;
      try {
        const res = await fetchSourceFloorPlan({ propertyId: propertyId as string, floor: copySourceFloor }).unwrap();
        srcData = (res as any)?.data ?? res;
        if (srcData) saveCachedFloorPlan(propertyId, copySourceFloor, srcData);
      } catch {
        srcData = getCachedFloorPlan(propertyId, copySourceFloor);
      }
      const srcItems: any[] = Array.isArray(srcData?.items) ? srcData.items : [];
      if (srcItems.length === 0) {
        toast.error(`No saved layout found on ${copySourceFloor}`);
        return;
      }
      const copied = buildCopiedFloorLayout(srcData, floorShops, allShopByUnit, copyIncludeUnits);
      applyParsedLayout(copied);
      setDirty(true);
      toast.success(
        copyIncludeUnits
          ? `Copied layout from ${copySourceFloor} (${copied.matchedUnits} units matched)`
          : `Copied landmarks from ${copySourceFloor}`,
      );
    } catch {
      toast.error(`Failed to copy layout from ${copySourceFloor}`);
    }
  };

  const save = async () => {
    if (hasAnyOverlap(items)) {
      toast.error('Some tiles overlap. Please separate them before saving.');
      return;
    }
    const cleanItems = items.map((i) => ({
      ...i,
      x: Math.max(0, i.x),
      y: Math.max(0, i.y),
    }));
    const maxRight = cleanItems.reduce((m, i) => Math.max(m, i.x + i.w), 0);
    const bpRight = blueprintGridBounds ? blueprintGridBounds.rightCells : 0;
    const savedColumns = Math.max(DEFAULT_COLUMNS, maxRight + 2, bpRight);
    const payloadData = {
      sqftPerCell: effectiveSqftPerCell,
      columns: savedColumns,
      items: cleanItems.map((i) => ({ kind: i.kind, unitId: i.unitId, label: i.label, x: i.x, y: i.y, w: i.w, h: i.h, ...(i.angle ? { angle: i.angle } : {}) })),
    };
    try {
      await savePlan({
        propertyId: propertyId as string,
        floor,
        data: payloadData,
      } as any).unwrap();
      localSavedPlanRef.current = { floor, data: payloadData };
      editOriginBlueprintRef.current = blueprint ? { ...blueprint } : null;
      if (blueprint) {
        saveBlueprintConfig(blueprint, false);
      }
      setAdjustingBlueprint(false);
      setColumns(savedColumns);
      itemsRef.current = cleanItems;
      setItems(cleanItems);
      saveCachedFloorPlan(propertyId, floor, payloadData);
      toast.success('Floor plan saved');
      clearGroupSelection();
      setDirty(false);
      setEditing(false);
    } catch (e: any) {
      const detail =
        e?.data?.errors?.[0]?.message ||
        e?.data?.error?.message ||
        e?.data?.message ||
        (typeof e?.data?.error === 'string' ? e.data.error : '') ||
        e?.error ||
        '';
      console.error('saveFloorPlan failed', e);
      toast.error(`Failed to save floor plan${e?.status ? ` (${e.status})` : ''}${detail ? `: ${detail}` : ''}`);
    }
  };

  const switchFloor = (f: string, keepTransit = false) => {
    if (f === floor) return;
    if (dirty && !window.confirm('Discard unsaved map changes?')) return;
    clearGroupSelection();
    setDirty(false);
    setEditing(false);
    setCustomStartKey('');
    if (!keepTransit) {
      setTargetKey('');
      setCrossFloorUnitId(null);
      setTransitArrivalMode(false);
      setOriginFloorBeforeTransit(null);
    }
    setFloor(f);
  };

  const proceedToDestinationFloor = () => {
    if (!crossFloorShop) return;
    const nextFloor = floorKeyOf(crossFloorShop);
    setOriginFloorBeforeTransit(floor);
    setTransitArrivalMode(true);
    switchFloor(nextFloor, true);
  };

  const layout = displayItems.map((i) => ({
    i: i.key, x: i.x, y: i.y, w: i.w, h: i.h,
    isResizable: editing,
    isDraggable: editing,
    resizeHandles: ALL_RESIZE_HANDLES,
  }));

  const [mapView, setMapView] = useState<'default' | 'photo'>(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'photo' || v === 'default') return v;
    return publicMode ? 'photo' : 'default';
  });

  const openFullScreenTab = () => {
    const params = new URLSearchParams();
    if (propertyId) params.set('propertyId', propertyId);
    if (floor) params.set('floor', floor);
    if (mapView === 'photo') params.set('view', 'photo');
    if (is3DPitch) params.set('pitch', '2.5d');
    if (mapRotation) params.set('rotate', String(mapRotation));
    window.open(`/admin/mall/shops/map?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const openFloorQr = () => {
    setQrModalFloor(floor);
    setShowFloorQrModal(true);
  };

  const activeQrFloor = qrModalFloor || floor;
  const buildPublicNavUrl = (targetFloor: string, extra?: Record<string, string>) => {
    if (!propertyId || !targetFloor) return '';
    const params = new URLSearchParams({ propertyId, floor: targetFloor, view: 'photo', pitch: '2.5d', ...extra });
    if (mapRotation) params.set('rotate', String(mapRotation));
    const basePath = window.location.pathname.startsWith('/pms') ? '/pms' : '';
    return `${window.location.origin}${basePath}/mall/navigate?${params.toString()}`;
  };

  const floorQrUrl = useMemo(
    () => buildPublicNavUrl(activeQrFloor),
    [propertyId, activeQrFloor, mapRotation],
  );

  const routeQrUrl = useMemo(() => {
    if (!activeStartItem || !effectiveTargetItem) return '';
    return buildPublicNavUrl(floor, {
      from: activeStartItem.key,
      to: effectiveTargetItem.key,
    });
  }, [propertyId, floor, activeStartItem, effectiveTargetItem, mapRotation]);

  const { data: floorQrRes } = useGetMallQrCodeQuery(
    { text: floorQrUrl },
    { skip: !showFloorQrModal || !floorQrUrl },
  );
  const { data: routeQrRes } = useGetMallQrCodeQuery(
    { text: routeQrUrl },
    { skip: !showRouteQrModal || !routeQrUrl },
  );
  const floorQrDataUrl = floorQrRes?.data?.dataUrl || '';
  const routeQrDataUrl = routeQrRes?.data?.dataUrl || '';

  const handlePrintFloorQr = () => {
    if (!floorQrDataUrl) return;
    const win = window.open('', '_blank', 'width=520,height=680');
    if (!win) return;
    const titleText = propertyName ? `${propertyName} — ${activeQrFloor}` : activeQrFloor;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Floor QR — ${titleText}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 32px; display: flex; justify-content: center; background: #fff; color: #0f172a; }
    .card { border: 2px solid #0f172a; border-radius: 20px; padding: 32px 28px; text-align: center; max-width: 380px; width: 100%; }
    .badge { display: inline-block; background: #10b981; color: #fff; font-weight: 800; font-size: 14px; padding: 6px 16px; border-radius: 999px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 12px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p.sub { margin: 0 0 20px; font-size: 14px; color: #475569; }
    img { width: 260px; height: 260px; display: block; margin: 0 auto 16px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; }
    .hint { font-size: 13px; color: #334155; font-weight: 600; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Indoor Navigation</div>
    <h1>${titleText}</h1>
    <p class="sub">Interactive Floor Directory &amp; Wayfinding</p>
    <img src="${floorQrDataUrl}" alt="Floor QR Code" />
    <div class="hint">Scan with your phone camera to see "You Are Here" and walking directions to any shop on ${activeQrFloor}.</div>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  if (floors.length === 0) return null;

  const hasMarkerOnFloor = items.some((i) => i.kind === 'marker');
  const isRoutingActive = Boolean(!editing && walkwayRoute && activeStartItem && effectiveTargetItem);
  const isMobile = viewport.w <= 640;
  const isTablet = viewport.w > 640 && viewport.w <= 1024;
  const toolbarIconPx = isMobile ? 12 : isTablet ? 13 : 14;
  const viewSwitchGridPx = isMobile ? 13 : isTablet ? 14 : 15;
  const viewSwitchCubePx = isMobile ? 14 : isTablet ? 15 : 16;
  const navIconPx = isMobile ? 11 : isTablet ? 12 : 13;
  const legendIconPx = isMobile ? 9 : isTablet ? 10 : 11;
  const categoryIconPx = isMobile ? 13 : isTablet ? 14 : 15;
  const tileActionIconPx = isMobile ? 8 : 9;

  const effective3DPitch = Boolean(!editing && is3DPitch);

  return (
    <div className={`shop-map ${fullScreen ? 'shop-map-fullscreen' : ''} ${mapView === 'photo' ? 'shop-map-view2' : ''} ${effective3DPitch ? 'is-3d-pitch' : ''}`}>
      <div className="shop-map-toolbar">
        <div className="shop-map-toolbar-left">
          <select
            className="shop-map-floor-select"
            value={floor}
            onChange={(e) => switchFloor(e.target.value)}
          >
            {floors.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <div className="shop-map-view-switch" role="group" aria-label="Map view mode">
            <button
              type="button"
              className={`shop-map-view-opt ${mapView === 'default' ? 'active' : ''}`}
              onClick={() => setMapView('default')}
              title="Layout View"
              aria-label="Layout View"
            >
              <LayoutGrid size={viewSwitchGridPx} />
            </button>
            <button
              type="button"
              className={`shop-map-view-opt ${mapView === 'photo' ? 'active' : ''}`}
              onClick={() => setMapView('photo')}
              title="3D Photo View"
              aria-label="3D Photo View"
            >
              <Cute3DCubeIcon size={viewSwitchCubePx} />
            </button>
          </div>
          {!editing && (
            <>
              <button
                type="button"
                className={`btn btn-secondary ${is3DPitch ? 'active' : ''}`}
                onClick={() => setIs3DPitch((prev) => !prev)}
                title="Toggle Mappedin 2.5D Isometric Perspective View"
              >
                <Compass size={toolbarIconPx} /> {is3DPitch ? '2.5D View' : '2D View'}
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${mapRotation !== 0 ? 'active' : ''}`}
                onClick={cycleMapRotation}
                title="Rotate map"
              >
                <RotateCw size={toolbarIconPx} /> Rotate{mapRotation !== 0 ? ` (${mapRotation}°)` : ''}
              </button>
            </>
          )}
          {!publicMode && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openFloorQr}
              title="Generate or Print QR Code for this Floor"
            >
              <QrCode size={toolbarIconPx} /> Floor QR Code
            </button>
          )}
          {!isOnline && (
            <span className="shop-map-offline-badge" title="Offline mode — showing saved map from device cache">
              <WifiOff size={toolbarIconPx - 1} /> Offline Mode
            </span>
          )}
        </div>
        {!fullScreen && !publicMode && (
          <div className="shop-map-toolbar-actions">
            <button className="btn btn-secondary" onClick={openFullScreenTab} title="Open Full Screen Map in a new tab">
              <Maximize2 size={toolbarIconPx} /> View Full Screen
            </button>
            <PermissionGuard permission="mall-shops.write" hideWhenDenied>
              {!editing ? (
                <button className="btn btn-secondary" onClick={startEditingLayout}>
                  <Pencil size={toolbarIconPx} /> Edit Layout
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={discard} disabled={saving}>Cancel</button>
                  <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
                    <Save size={toolbarIconPx} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </PermissionGuard>
          </div>
        )}
      </div>

      {/* ── Indoor Wayfinding / Navigation Bar ── */}
      {!editing && items.length > 0 && (
        <div className="shop-map-nav-bar">
          <div className="shop-map-nav-controls">
            <div className="shop-map-nav-field">
              <MapNavSelect
                value={activeStartItem?.key || ''}
                placeholder="Search starting location…"
                icon={<MapPin size={navIconPx} className="nav-pin-start-icon" />}
                clearable={Boolean(customStartKey)}
                onChange={(val) => {
                  setTransitArrivalMode(false);
                  setCustomStartKey(val);
                }}
                options={navOptions.fromOptions}
              />
            </div>

            <ArrowRight size={navIconPx + 1} className="shop-map-nav-arrow" />

            <div className="shop-map-nav-field">
              <MapNavSelect
                value={crossFloorUnitId ? `cross:${crossFloorUnitId}` : targetKey}
                placeholder="Search destination shop or facility…"
                icon={<Navigation size={navIconPx} className="nav-pin-dest-icon" />}
                clearable
                onChange={handleSelectDestination}
                options={navOptions.toOptions}
              />
            </div>

            <div className="shop-map-nav-quick">
              {items.some((i) => i.kind === 'toilet') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'toilet' || highlightedAmenityKinds.includes('toilet') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['toilet'])}
                >
                  Restroom
                </button>
              )}
              {items.some((i) => i.kind === 'escalator' || i.kind === 'stairs') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'escalator' || effectiveTargetItem?.kind === 'stairs' || highlightedAmenityKinds.includes('escalator') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['escalator', 'stairs'])}
                >
                  Elevator / Stairs
                </button>
              )}
              {items.some((i) => i.kind === 'entrance') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'entrance' || highlightedAmenityKinds.includes('entrance') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['entrance'])}
                >
                  Entrance
                </button>
              )}
              {items.some((i) => i.kind === 'exit') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'exit' || highlightedAmenityKinds.includes('exit') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['exit'])}
                >
                  Exit
                </button>
              )}
              {items.some((i) => i.kind === 'info') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'info' || highlightedAmenityKinds.includes('info') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['info'])}
                >
                  Info Desk
                </button>
              )}
              {items.some((i) => i.kind === 'atm') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'atm' || highlightedAmenityKinds.includes('atm') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['atm'])}
                >
                  ATM
                </button>
              )}
              {items.some((i) => i.kind === 'parking') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'parking' || highlightedAmenityKinds.includes('parking') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['parking'])}
                >
                  Parking
                </button>
              )}
              {items.some((i) => i.kind === 'medical') && (
                <button
                  type="button"
                  className={`shop-map-quick-pill ${effectiveTargetItem?.kind === 'medical' || highlightedAmenityKinds.includes('medical') ? 'active' : ''}`}
                  onClick={() => handleQuickFacility(['medical'])}
                >
                  First Aid
                </button>
              )}
            </div>
          </div>

          {/* Active Route Summary Banner */}
          {(isRoutingActive || crossFloorShop || originFloorBeforeTransit) && (
            <div className="shop-map-route-summary">
              <div className="shop-map-route-info">
                {crossFloorShop && floorKeyOf(crossFloorShop) !== floor ? (
                  <span className="shop-map-route-steps">
                    <strong>Step 1 ({floor}):</strong> Walk from <em>{describeTile(activeStartItem)}</em> to{' '}
                    <em>{describeTile(effectiveTargetItem)}</em>, then go to <strong>{floorKeyOf(crossFloorShop)}</strong> for{' '}
                    <strong>{shopDisplayName(crossFloorShop)}</strong>.
                  </span>
                ) : walkwayRoute ? (
                  <div className="shop-map-route-details-col">
                    <span className="shop-map-route-steps">
                      <strong>{describeTile(activeStartItem)}</strong> → <strong>{describeTile(effectiveTargetItem)}</strong>
                    </span>
                    {walkwayRoute.steps.length > 0 && (
                      <div className="shop-map-turn-steps">
                        {walkwayRoute.steps.map((st, idx) => (
                          <span key={`step-${idx}`} className={`shop-map-turn-pill dir-${st.direction}`}>
                            {st.direction === 'left' ? (
                              <CornerUpLeft size={11} />
                            ) : st.direction === 'right' ? (
                              <CornerUpRight size={11} />
                            ) : (
                              <MoveUp size={11} />
                            )}
                            <span>{st.instruction}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="shop-map-route-actions">
                {originFloorBeforeTransit && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => switchFloor(originFloorBeforeTransit)}
                  >
                    Back to {originFloorBeforeTransit}
                  </button>
                )}
                {crossFloorShop && floorKeyOf(crossFloorShop) !== floor && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={proceedToDestinationFloor}
                  >
                    Switch to {floorKeyOf(crossFloorShop)}
                  </button>
                )}
                {!crossFloorShop &&
                  (effectiveTargetItem?.kind === 'stairs' || effectiveTargetItem?.kind === 'escalator') &&
                  otherFloorsForCopy.map((f) => (
                    <button
                      key={`jump-${f}`}
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setOriginFloorBeforeTransit(floor);
                        setTransitArrivalMode(true);
                        setCustomStartKey('');
                        setTargetKey('');
                        setFloor(f);
                      }}
                    >
                      Go to {f}
                    </button>
                  ))}
                {effectiveTargetItem && effectiveTargetItem.key !== activeStartItem?.key && !crossFloorShop && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setCustomStartKey(effectiveTargetItem.key);
                      setTargetKey('');
                      toast.success(`Starting point set to ${describeTile(effectiveTargetItem)}`);
                    }}
                    title="I am standing here now — use this as my starting location"
                  >
                    <MapPin size={12} /> Start From Here
                  </button>
                )}
                {selectedShop && !publicMode && onOpenShop && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onOpenShop(selectedShop)}
                  >
                    <Info size={12} /> Shop Info
                  </button>
                )}
                {isRoutingActive && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowRouteQrModal(true)}
                    title="Scan QR to carry this route on your phone"
                  >
                    <QrCode size={12} /> Phone QR
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={clearRoute}
                >
                  <X size={12} /> Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="shop-map-edit-bar">
          <select value={decorKind} onChange={(e) => setDecorKind(e.target.value as any)}>
            {Object.entries(DECORATION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => addDecor()}
            disabled={decorKind === 'marker' && hasMarkerOnFloor}
          >
            <Plus size={14} /> Add
          </button>
          <div className="shop-map-group-toolbar shop-map-snap-mode-toolbar" role="group" aria-label="Edit Snap Mode">
            <button
              type="button"
              className={`btn btn-secondary btn-sm shop-map-group-btn ${editSnapMode === 'free' ? 'active' : ''}`}
              onClick={() => setEditSnapMode('free')}
              title="Free Move: Move and place units freely anywhere (Auto-Snap OFF, Snap Size OFF, Auto-Shape OFF)"
            >
              <Compass size={12} /> Free Move
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-sm shop-map-group-btn ${editSnapMode === 'edge' && !magnetBypassActive ? 'active' : ''}`}
              onClick={() => setEditSnapMode('edge')}
              title="Edge Align (Default): Gently align borders (≤ 1 cell) without changing unit size or shape (Hold Alt/Shift to bypass)"
            >
              <Magnet size={12} /> Edge Align{editSnapMode === 'edge' && magnetBypassActive ? ' (Bypass)' : ''}
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-sm shop-map-group-btn ${editSnapMode === 'smart' && !magnetBypassActive ? 'active' : ''}`}
              onClick={() => setEditSnapMode('smart')}
              title="Smart Fit: Align borders, match neighbor dimensions, and auto-curve units adjacent to a Circle Atrium"
            >
              <Wand2 size={12} /> Smart Fit{editSnapMode === 'smart' && magnetBypassActive ? ' (Bypass)' : ''}
            </button>
          </div>
          <div className="shop-map-group-toolbar">
            <button
              type="button"
              className={`btn btn-secondary shop-map-group-btn ${groupSelectMode || selectedGroupKeys.length > 0 ? 'active' : ''}`}
              onClick={() => setGroupSelectMode((prev) => !prev)}
              title="Toggle Group Select mode (or Ctrl+Click tiles) to select multiple tiles and drag/move them together"
            >
              <Layers size={13} /> Group{selectedGroupKeys.length > 0 ? ` (${selectedGroupKeys.length})` : ''}
            </button>
            {(groupSelectMode || selectedGroupKeys.length > 0) && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleExpandGroupTouching}
                  disabled={selectedGroupKeys.length === 0}
                  title="Add all touching or enclosed tiles into the active group"
                >
                  + Touching
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSelectAllGroup}
                  disabled={items.length === 0 || selectedGroupKeys.length === items.length}
                  title="Select all tiles on this floor"
                >
                  All
                </button>
                {selectedGroupKeys.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={clearGroupSelection}
                    title="Ungroup / Clear selection (Esc)"
                  >
                    <X size={12} /> Ungroup
                  </button>
                )}
              </>
            )}
          </div>
          <div className={`shop-map-blueprint-toolbar ${blueprint ? 'has-blueprint' : ''}`}>
            <input
              ref={blueprintInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleBlueprintFileChange}
            />
            {!blueprint ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => blueprintInputRef.current?.click()}
                title="Upload an architectural floorplan or blueprint image (PNG, JPG, WebP, SVG) to trace over"
              >
                <ImageIcon size={13} /> Blueprint Image
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm shop-map-bp-btn ${blueprint.visible ? 'active' : ''}`}
                  onClick={() => updateBlueprint({ visible: !blueprint.visible })}
                  title={blueprint.visible ? 'Hide blueprint overlay' : 'Show blueprint overlay'}
                >
                  {blueprint.visible ? <Eye size={13} /> : <EyeOff size={13} />} Blueprint
                </button>
                {blueprint.visible && (
                  <>
                    <label className="shop-map-bp-slider" title="Adjust blueprint image transparency (Opacity)">
                      <span>Opacity {blueprint.opacity}%</span>
                      <input
                        type="range"
                        min={10}
                        max={95}
                        step={5}
                        value={blueprint.opacity}
                        onChange={(e) => updateBlueprint({ opacity: Number(e.target.value) })}
                      />
                    </label>
                    <label className="shop-map-bp-slider" title="Adjust blueprint image size scale (%)">
                      <span>Scale {blueprint.scale}%</span>
                      <input
                        type="range"
                        min={25}
                        max={250}
                        step={5}
                        value={blueprint.scale}
                        onChange={(e) => updateBlueprint({ scale: Number(e.target.value) })}
                      />
                    </label>
                    <button
                      type="button"
                      className={`btn btn-secondary btn-sm shop-map-bp-move-btn ${adjustingBlueprint ? 'active' : ''}`}
                      onClick={() => setAdjustingBlueprint((p) => !p)}
                      title={
                        adjustingBlueprint
                          ? 'Click to lock blueprint position so you can place and drag shop units over it'
                          : 'Unlock blueprint to drag/move or scale it directly on the canvas'
                      }
                    >
                      {adjustingBlueprint ? (
                        <>
                          <Unlock size={12} /> Lock Blueprint
                        </>
                      ) : (
                        <>
                          <Lock size={12} /> Move Blueprint
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateBlueprint({ rotation: (blueprint.rotation + 90) % 360 })}
                      title="Rotate blueprint image 90°"
                    >
                      <RotateCw size={12} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => blueprintInputRef.current?.click()}
                  title="Replace blueprint image"
                >
                  Change
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm shop-map-bp-remove"
                  onClick={handleRemoveBlueprint}
                  title="Remove blueprint overlay from this floor"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            className={`btn btn-secondary btn-sm shop-map-group-btn ${showFloorToolsMenu ? 'active' : ''}`}
            onClick={() => setShowFloorToolsMenu((prev) => !prev)}
            title="Batch Floor Tools: Auto-Size by Sqft, Ring Align Atrium, Copy Layout from Floor, and Clear All"
          >
            <LayoutGrid size={13} /> Floor Tools <ChevronDown size={12} style={{ transform: showFloorToolsMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
          {dirty && <span className="shop-map-dirty">● Unsaved changes</span>}
          {showFloorToolsMenu && (
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                paddingTop: 8,
                marginTop: 4,
                borderTop: '1px dashed rgba(148, 163, 184, 0.35)',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSyncUnitSqft}
                disabled={!items.some((i) => i.kind === 'unit')}
                title={`Resize placed unit tiles proportionally to their database areaSqft (Scale: 1 cell ≈ ${effectiveSqftPerCell} sqft)`}
              >
                <Maximize2 size={13} /> Auto-Size by Sqft ({Math.round(effectiveSqftPerCell)} sqft/cell)
              </button>
              {items.some((i) => i.kind === 'atrium') && items.some((i) => i.kind === 'unit') && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleRadialAlignAtrium()}
                  title="Smart Radial Ring Aligner: Automatically align and evenly space surrounding units around the Atrium perimeter"
                >
                  <Wand2 size={12} /> Ring Align Atrium
                </button>
              )}
              {otherFloorsForCopy.length > 0 && (
                <div className="shop-map-copy-group">
                  <span className="shop-map-copy-label">Copy from:</span>
                  <select
                    value={copySourceFloor}
                    onChange={(e) => setCopySourceFloor(e.target.value)}
                    title="Select floor to copy layout from"
                  >
                    {otherFloorsForCopy.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <select
                    value={copyIncludeUnits ? 'all' : 'landmarks'}
                    onChange={(e) => setCopyIncludeUnits(e.target.value === 'all')}
                    title="Choose what to copy from the selected floor"
                  >
                    <option value="all">Landmarks + Match Units</option>
                    <option value="landmarks">Landmarks Only</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopyFromFloor}
                    disabled={isCopyingFloor || !copySourceFloor}
                    title={`Copy layout from ${copySourceFloor} to ${floor}`}
                  >
                    <Copy size={13} /> {isCopyingFloor ? 'Copying…' : 'Copy Layout'}
                  </button>
                </div>
              )}
              <button
                className="btn btn-secondary btn-sm shop-map-clear-btn"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  clearGroupSelection();
                  update((prev) => prev.filter((i) => i.kind === 'marker'));
                }}
                disabled={items.every((i) => i.kind === 'marker')}
                title="Remove all tiles from this floor"
              >
                <Trash2 size={14} /> Clear All
              </button>
            </div>
          )}
        </div>
      )}

      <div className="shop-map-body">
        <div
          ref={containerRef as any}
          className={`shop-map-canvas-wrap ${editing ? 'editing' : ''} ${isRoutingActive ? 'has-routed-unit' : ''}`}
          onClick={() => {
            if (focusedLayerKey) setFocusedLayerKey(null);
            if (targetKey || crossFloorUnitId) clearRoute();
          }}
        >
          {isFetching && items.length === 0 ? (
            <div className="shop-map-skeleton-wrap" aria-hidden="true">
              <div className="shop-map-skeleton-block wide" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block tall" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block wide" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block" />
              <div className="shop-map-skeleton-block wide" />
            </div>
          ) : items.length === 0 && !editing ? (
            <div className="shop-map-empty-state">
              <div className="shop-map-empty-icon">
                <MapIcon size={28} />
              </div>
              <h4 className="shop-map-empty-title">{floor} Map Not Configured</h4>
              <p className="shop-map-empty-desc">
                {floorShops.length > 0
                  ? `${floorShops.length} ${floorShops.length === 1 ? 'unit is' : 'units are'} available on this floor and ready to be arranged on the interactive map.`
                  : 'No units or landmarks have been placed on this floor layout yet.'}
              </p>
              {!fullScreen && !publicMode && (
                <PermissionGuard permission="mall-shops.write" hideWhenDenied>
                  <div className="shop-map-empty-actions">
                    <button type="button" className="btn btn-primary" onClick={startEditingLayout}>
                      <Pencil size={14} /> Edit Layout
                    </button>
                  </div>
                </PermissionGuard>
              )}
            </div>
          ) : (
            <>
              <div
                className={`shop-map-stage ${effective3DPitch ? 'is-3d-stage' : ''} ${editing && blueprint?.visible ? 'has-blueprint-overlay' : ''}`}
                data-drag-shape={dragShape}
                style={{
                  width: gridWidth,
                  ...(editing ? { minHeight: `${rows * cellPx}px` } : {}),
                  ['--drag-angle' as string]: `${dragAngle}deg`,
                  ['--drag-clip-path' as string]: dragClipPath,
                } as CSSProperties}
              >
                {editing && blueprint && blueprint.visible && (
                  <div
                    className={`shop-map-blueprint-layer ${adjustingBlueprint ? 'is-adjusting' : ''}`}
                    style={{
                      left: `${Math.round(
                        (typeof blueprint.offsetCellX === 'number'
                          ? blueprint.offsetCellX
                          : blueprint.offsetX / Math.max(5, cellPx)) * cellPx,
                      )}px`,
                      top: `${Math.round(
                        (typeof blueprint.offsetCellY === 'number'
                          ? blueprint.offsetCellY
                          : blueprint.offsetY / Math.max(5, cellPx)) * cellPx,
                      )}px`,
                      width: `${Math.round(((DEFAULT_COLUMNS * blueprint.scale) / 100) * cellPx)}px`,
                      opacity: blueprint.opacity / 100,
                      transform: blueprint.rotation ? `rotate(${blueprint.rotation}deg)` : undefined,
                    }}
                    onPointerDown={adjustingBlueprint ? startDragBlueprintMove : undefined}
                    onClick={(e) => {
                      if (adjustingBlueprint) e.stopPropagation();
                    }}
                  >
                    <img
                      src={blueprint.dataUrl}
                      alt="Floorplan Blueprint Overlay"
                      className="shop-map-blueprint-img"
                      draggable={false}
                      onLoad={(e) => {
                        const nw = e.currentTarget.naturalWidth;
                        const nh = e.currentTarget.naturalHeight;
                        if (nw > 0 && nh > 0) {
                          const measured = Math.max(0.15, Math.min(4, Math.round((nh / nw) * 10000) / 10000));
                          if (!blueprint.aspectRatio || Math.abs(blueprint.aspectRatio - measured) > 0.005) {
                            updateBlueprint({ aspectRatio: measured }, false);
                          }
                        }
                      }}
                    />
                    {adjustingBlueprint && (
                      <>
                        <div className="shop-map-blueprint-badge">
                          Drag to align blueprint · Drag corner to scale · Click &ldquo;Lock Blueprint&rdquo; when done
                        </div>
                        <button
                          type="button"
                          className="shop-map-blueprint-scale-handle"
                          title="Drag to resize blueprint"
                          onPointerDown={startDragBlueprintScale}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </>
                    )}
                  </div>
                )}
                {floorplateBounds && (
                  <div
                    className="shop-map-floorplate"
                    style={{
                      left: `${(floorplateBounds.x * colStepPx).toFixed(1)}px`,
                      top: `${(floorplateBounds.y * rowStepPx).toFixed(1)}px`,
                      width: `${(floorplateBounds.w * colStepPx).toFixed(1)}px`,
                      height: `${(floorplateBounds.h * rowStepPx).toFixed(1)}px`,
                    }}
                    aria-hidden="true"
                  />
                )}
                {groupBounds && (
                  <div
                    className={`shop-map-group-bounds-box ${isRotatingGroup ? 'is-rotating-group' : ''}`}
                    style={{
                      left: `${((groupBounds.x + (dragGroupDelta?.dx ?? 0)) * colStepPx).toFixed(1)}px`,
                      top: `${((groupBounds.y + (dragGroupDelta?.dy ?? 0)) * rowStepPx).toFixed(1)}px`,
                      width: `${(groupBounds.w * colStepPx).toFixed(1)}px`,
                      height: `${(groupBounds.h * rowStepPx).toFixed(1)}px`,
                      transform: groupBounds.angle ? `rotate(${groupBounds.angle}deg)` : undefined,
                    }}
                  >
                    <span
                      className="shop-map-group-bounds-badge"
                      style={
                        groupBounds.angle > 90 && groupBounds.angle < 270
                          ? { transform: 'rotate(180deg)' }
                          : undefined
                      }
                    >
                      Group ({groupBounds.count})
                    </span>
                    <button
                      type="button"
                      className="shop-map-group-rot-handle"
                      title="Drag to rotate group"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={startDragRotateGroup}
                    >
                      <span className="shop-map-group-rot-dot" />
                    </button>
                    {ALL_RESIZE_HANDLES.map((dir) => (
                      <span
                        key={dir}
                        className={`shop-map-group-resize-handle handle-${dir}`}
                        title="Drag to resize group"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => startDragResizeGroup(e, dir)}
                      />
                    ))}
                  </div>
                )}
                <ReactGridLayout
                  width={gridWidth}
                  style={editing ? ({ minHeight: `${rows * cellPx}px` } as CSSProperties) : undefined}
                  layout={layout as any}
                  gridConfig={{ cols: displayColumns, rowHeight: cellPx, margin: [0, 0], containerPadding: [0, 0], maxRows: rows } as any}
                  positionStrategy={absoluteStrategy as any}
                  dragConfig={{ enabled: editing, cancel: '.shop-map-tile-btn, .shop-map-rot-handle' } as any}
                  resizeConfig={{ enabled: editing, handles: ALL_RESIZE_HANDLES } as any}
                  compactor={mapCompactor as any}
                  onLayoutChange={onLayoutChange as any}
                  onDragStart={handleInteractionStart as any}
                  onDragStop={handleInteractionStop as any}
                  onResizeStart={handleInteractionStart as any}
                  onResizeStop={handleInteractionStop as any}
                  onDrag={handleInteractionMove as any}
                  onResize={handleInteractionMove as any}
                >
                  {displayItems.map((it) => {
                    const isDraggingThisTile = Boolean(dragPreviewItem && dragPreviewItem.key === it.key && mapRotation === 0);
                    const isGroupSelected = Boolean(editing && selectedGroupSet.has(it.key));
                    const isGroupPeerMoving = Boolean(
                      isGroupSelected && !isDraggingThisTile && dragGroupDelta && (dragGroupDelta.dx !== 0 || dragGroupDelta.dy !== 0),
                    );
                    const effectiveIt = isDraggingThisTile && dragPreviewItem ? dragPreviewItem : it;
                    const cachedMeta = !isDraggingThisTile ? staticTileMetaMap.get(it.key) : null;
                    const effectiveDisplayItems =
                      isDraggingThisTile && dragPreviewItem
                        ? displayItems.map((d) => (d.key === dragPreviewItem.key ? dragPreviewItem : d))
                        : displayItems;
                    const shop = it.unitId ? shopByUnit.get(it.unitId) : null;
                    const decor = it.kind !== 'unit';
                    const isSearchMatch = Boolean(hasActiveSearch && !decor && shop && matchesShopQuery(shop, normalizedSearch));
                    const isTarget = Boolean(
                      !editing &&
                        effectiveTargetItem &&
                        (it.key === effectiveTargetItem.key ||
                          (Boolean(it.unitId) && it.unitId === effectiveTargetItem.unitId)),
                    );
                    const isStart = Boolean(
                      !editing &&
                        isRoutingActive &&
                        !hasActiveSearch &&
                        activeStartItem &&
                        (it.key === activeStartItem.key ||
                          (Boolean(it.unitId) && it.unitId === activeStartItem.unitId)),
                    );
                    const isAmenityHighlighted = Boolean(!editing && decor && highlightedAmenityKinds.includes(it.kind));
                    const isUnitHovered = Boolean(!editing && it.unitId && hoveredUnitId === it.unitId);
                    const dim = Boolean(
                      !editing &&
                        hasActiveSearch &&
                        (decor || !isSearchMatch),
                    );
                    const gridItemWPx = Math.max(1, effectiveIt.w * colStepPx);
                    const gridItemHPx = Math.max(1, effectiveIt.h * rowStepPx);
                    const wPx = cachedMeta ? cachedMeta.wPx : Math.max(1, effectiveIt.w * cellPx);
                    const hPx = cachedMeta ? cachedMeta.hPx : Math.max(1, effectiveIt.h * cellPx);
                    const isVerticalTile = !decor && hPx > wPx * 1.15;
                    const longSidePx = Math.max(wPx, hPx);
                    const shortSidePx = Math.min(wPx, hPx);
                    const tiny = !decor && (longSidePx < 18 || shortSidePx < 14);
                    const minSidePx = Math.min(wPx, hPx);
                    const maxBadgeForTile = Math.max(10, minSidePx - (isMobile ? 3 : 5));
                    const minBadgePx = isMobile ? 12 : isTablet ? 14 : 16;
                    const maxBadgePx = isMobile ? 42 : isTablet ? 64 : 88;
                    const badgeScale = isMobile ? 0.60 : isTablet ? 0.64 : 0.68;
                    const badgePx = Math.min(
                      maxBadgeForTile,
                      Math.max(minBadgePx, Math.min(maxBadgePx, Math.round(minSidePx * badgeScale))),
                    );
                    const decorType = it.kind as Exclude<TileKind, 'unit'>;
                    const decorLabel = DECORATION_LABELS[decorType] || it.label || '';
                    const um = !decor ? unitMergeMap.get(it.key) ?? null : null;
                    const unitMergeClasses = um?.hasMerge ? edgeMergeClasses('is-merged-unit', um) : '';
                    const showUnitLabel = !um || um.showLabel;
                    const unitNumberLabel = unitNumberOf(shop);
                    const tileDisplayLabel = shopDisplayName(shop);
                    const labelLen = Math.max(2, tileDisplayLabel.length);
                    const minTileFontPx = isMobile ? 7 : 8;
                    const tileFontPx = Math.max(
                      minTileFontPx,
                      Math.min(
                        13,
                        Math.floor(Math.min(shortSidePx * 0.38, (longSidePx - 6) / Math.max(2.4, labelLen * 0.54))),
                      ),
                    );
                    const rawPhotoUrl = (shop?.unit?.floorPlanUrl || shop?.shopfrontUrl || shop?.logoUrl) as string | undefined;
                    const hasPhotoImage = isUnitPhotoImage(rawPhotoUrl) && !hasFailedUnitPhoto(rawPhotoUrl);
                    const showPhotoMode = !decor && mapView === 'photo';
                    const hasUnitPhoto = showPhotoMode && hasPhotoImage;
                    const lmMeta = cachedMeta
                      ? cachedMeta.lmMeta
                      : decor
                        ? parseLandmarkMeta(it.kind, it.label)
                        : null;
                    const unitMode = cachedMeta
                      ? cachedMeta.unitMode
                      : it.kind === 'unit'
                        ? parseUnitShapeMode(
                            effectiveIt,
                            autoShapeEnabled ? effectiveDisplayItems : undefined,
                          )
                        : null;
                    const shapeMode =
                      unitMode ??
                      (lmMeta && it.kind !== 'marker'
                        ? lmMeta.polygonFaces
                          ? `poly${lmMeta.polygonFaces}`
                          : lmMeta.isCircle
                            ? 'circle'
                            : 'rect'
                        : null);
                    const isCircleShape = Boolean(it.kind !== 'marker' && (unitMode === 'circle' || lmMeta?.isCircle));
                    const polyAtriumGeo = cachedMeta
                      ? cachedMeta.polyAtriumGeo
                      : lmMeta?.polygonFaces
                        ? getPolygonAtriumGeometry(lmMeta.polygonFaces, wPx, hPx)
                        : null;
                    const isEmergencyLandmark = Boolean(lmMeta?.isEmergency);
                    const hasLandmarkVariants = Boolean(
                      decor && (LANDMARK_VARIANTS[it.kind as Exclude<TileKind, 'unit'>]?.length ?? 0) > 1,
                    );
                    const showLandmarkSublabel = Boolean(lmMeta && lmMeta.showLabel);
                    const isFullIconMarker = it.kind === 'marker';
                    const effectiveBadgePx = isFullIconMarker
                      ? showLandmarkSublabel
                        ? Math.max(14, Math.round(minSidePx * 0.68))
                        : Math.max(16, Math.round(minSidePx * 0.90))
                      : showLandmarkSublabel
                        ? Math.max(10, Math.min(badgePx, Math.round(hPx * 0.48)))
                        : badgePx;
                    const effectiveIconPx = isFullIconMarker
                      ? effectiveBadgePx
                      : Math.max(isMobile ? 8 : 9, Math.round(effectiveBadgePx * 0.60));
                    const trapezoidGeo = cachedMeta
                      ? cachedMeta.trapezoidGeo
                      : unitMode && isTrapezoidUnitMode(unitMode)
                        ? getTrapezoidUnitGeometry(unitMode, wPx, hPx, cellPx, um, effectiveIt, effectiveDisplayItems)
                        : null;
                    const tileShapeDesc = lmMeta
                      ? lmMeta.displayLabel
                      : unitMode
                        ? UNIT_SHAPE_LABELS[unitMode]
                        : '';
                    const ringSectorAlign = cachedMeta
                      ? cachedMeta.ringSectorAlign
                      : effectiveIt.kind === 'unit'
                        ? getCircleRingSectorAlignment(effectiveIt, effectiveDisplayItems)
                        : null;
                    const effectiveAngle = ringSectorAlign
                      ? ringSectorAlign.exactAngle
                      : (effectiveIt.angle ?? 0);
                    const title = decor
                      ? editing && tileShapeDesc
                        ? `${decorLabel} • ${tileShapeDesc}${effectiveAngle ? ` • ${Math.round(effectiveAngle)}°` : ''}`
                        : lmMeta?.displayLabel || decorLabel
                      : undefined;
                    const groupMoveNudge = isGroupPeerMoving && dragGroupDelta
                      ? { dx: dragGroupDelta.dx, dy: dragGroupDelta.dy }
                      : null;
                    const totalNudgeDx =
                      (groupMoveNudge?.dx ?? 0) + (groupMoveNudge ? 0 : (ringSectorAlign?.dx ?? 0));
                    const totalNudgeDy =
                      (groupMoveNudge?.dy ?? 0) + (groupMoveNudge ? 0 : (ringSectorAlign?.dy ?? 0));
                    const hasTotalNudge = totalNudgeDx !== 0 || totalNudgeDy !== 0;
                    const hasSizeOverride = !editing && (wPx !== gridItemWPx || hPx !== gridItemHPx);
                    const tileStyle: CSSProperties | undefined =
                      effectiveAngle || hasTotalNudge || hasSizeOverride
                        ? ({
                            ...(hasSizeOverride
                              ? {
                                  width: `${wPx}px`,
                                  height: `${hPx}px`,
                                  left: `${((gridItemWPx - wPx) / 2).toFixed(1)}px`,
                                  top: `${((gridItemHPx - hPx) / 2).toFixed(1)}px`,
                                }
                              : {}),
                            ...(effectiveAngle ? { rotate: `${effectiveAngle}deg` } : {}),
                            ...(hasTotalNudge
                              ? {
                                  translate: `${(totalNudgeDx * colStepPx).toFixed(1)}px ${(totalNudgeDy * rowStepPx).toFixed(1)}px`,
                                }
                              : {}),
                          } as CSSProperties)
                        : undefined;
                    const isVerticalPhoto = um?.hasMerge
                      ? um.groupBounds.spanH > um.groupBounds.spanW
                      : isVerticalTile && !isCircleShape;
                    const worldPhotoAngle = ((((effectiveAngle) + (isVerticalPhoto ? -90 : 0)) % 360) + 360) % 360;
                    const isPhotoUpsideDown = worldPhotoAngle > 90 && worldPhotoAngle < 270;
                    const photoImgClass = `shop-map-tile-photo${isPhotoUpsideDown ? ' is-photo-flipped' : ''}`;
                    const isSmartUprightLabel = Boolean(effectiveAngle !== 0 && !isVerticalTile);
                    const worldLabelAngle = ((((effectiveAngle) + (isVerticalTile ? -90 : 0)) % 360) + 360) % 360;
                    const isLabelUpsideDown = !isSmartUprightLabel && worldLabelAngle > 90 && worldLabelAngle < 270;
                    const showUnitSubNumber = Boolean(
                      !showPhotoMode &&
                        tileDisplayLabel !== unitNumberLabel &&
                        unitNumberLabel &&
                        shortSidePx >= 34 &&
                        longSidePx >= 48,
                    );
                    const hasInnerItems = cachedMeta ? cachedMeta.hasInnerItems : false;
                    const parentAtrium = cachedMeta ? cachedMeta.parentAtrium : null;
                    const isLayerFocused = editing && focusedLayerKey === it.key;
                    const isRotatingThisTile = editing && rotatingTileKey === it.key;
                    const rotFlip = effectiveAngle > 90 && effectiveAngle <= 270 ? -1 : 1;
                    const gridItemCssVars: CSSProperties | undefined = editing
                      ? ({
                          '--tile-angle': `${effectiveAngle}deg`,
                          '--tile-w': `${wPx}px`,
                          '--tile-h': `${hPx}px`,
                          '--tile-nudge-x': `${(totalNudgeDx * colStepPx).toFixed(1)}px`,
                          '--tile-nudge-y': `${(totalNudgeDy * rowStepPx).toFixed(1)}px`,
                          '--rot-flip': String(rotFlip),
                        } as CSSProperties)
                      : undefined;
                    return (
                      <div
                        key={it.key}
                        data-tile-key={it.key}
                        title={title}
                        style={gridItemCssVars}
                        className={`shop-map-grid-item ${it.kind === 'atrium' ? 'is-atrium-item' : ''} ${isTransitLandmark(it.kind) ? 'is-transit-item' : ''} ${hasInnerItems ? 'has-inner-items' : ''} ${isLayerFocused ? 'is-layer-focused' : ''} ${isGroupSelected ? 'is-group-selected' : ''} ${newlyPlacedKey === it.key ? 'is-newly-placed' : ''} ${effectiveAngle ? 'is-rotated-item' : ''} ${isRotatingThisTile ? 'is-rotating-item' : ''} ${editing ? 'editing' : ''} ${isTarget ? 'active-target' : ''} ${isStart ? 'active-start' : ''} ${isAmenityHighlighted ? 'is-amenity-highlighted' : ''}`}
                        onMouseEnter={() => {
                          if (!editing && it.unitId) setHoveredUnitId(it.unitId);
                        }}
                        onMouseLeave={() => {
                          if (it.unitId) setHoveredUnitId((prev) => (prev === it.unitId ? null : prev));
                        }}
                        onClick={(e) => {
                          if (editing) {
                            lastActiveTileKeyRef.current = it.key;
                            if (groupSelectMode || e.ctrlKey || e.metaKey) {
                              e.stopPropagation();
                              toggleGroupSelection(it.key);
                              return;
                            }
                            if (e.altKey) {
                              e.stopPropagation();
                              if (parentAtrium) {
                                setFocusedLayerKey(focusedLayerKey === parentAtrium.key ? null : parentAtrium.key);
                              } else if (hasInnerItems) {
                                setFocusedLayerKey(isLayerFocused ? null : it.key);
                              }
                            }
                            return;
                          }
                          e.stopPropagation();
                          const alreadyTargeted =
                            targetKey === it.key || (Boolean(it.unitId) && selectedUnitId === it.unitId);
                          if (alreadyTargeted && shop && !publicMode && onOpenShop) {
                            onOpenShop(shop);
                          } else {
                            setCrossFloorUnitId(null);
                            setHighlightedAmenityKinds((prev) => (prev.length > 0 ? [] : prev));
                            setTargetKey(it.unitId ? unitKey(it.unitId) : it.key);
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (!editing && shop && !publicMode && onOpenShop) {
                            e.stopPropagation();
                            onOpenShop(shop);
                          } else if (editing && decor) {
                            e.stopPropagation();
                            openLandmarkConfig(it.key);
                          } else if (editing && it.kind === 'unit') {
                            e.stopPropagation();
                            setEditingUnitShapeKey(it.key);
                          }
                        }}
                      >
                        <div
                          style={tileStyle}
                          className={`shop-map-tile ${decor ? `st-decor st-decor-${it.kind} ${lmMeta ? `st-variant-${lmMeta.variant}` : ''}` : `${statusClass(shop)} ${unitMergeClasses}`} ${isCircleShape ? 'is-circle-tile' : ''} ${polyAtriumGeo ? 'is-polygon-atrium' : ''} ${trapezoidGeo ? 'is-trapezoid-tile' : ''} ${isEmergencyLandmark ? 'is-emergency-landmark' : ''} ${isUnitHovered ? 'is-unit-hovered' : ''} ${hasUnitPhoto ? 'has-unit-photo' : ''} ${isVerticalTile ? 'is-vertical-tile' : ''} ${editing ? 'editing' : ''} ${dim ? 'dim' : ''} ${isSearchMatch ? 'search-match' : ''} ${tiny ? 'tiny' : ''} ${isTarget ? 'active-target' : ''} ${isStart ? 'active-start' : ''} ${isAmenityHighlighted ? 'is-amenity-highlighted' : ''}`}
                        >
                        {decor ? (
                          <>
                            {polyAtriumGeo && (
                              <svg
                                className="shop-map-atrium-poly-svg"
                                viewBox={`0 0 ${wPx} ${hPx}`}
                                preserveAspectRatio="none"
                              >
                                <polygon points={polyAtriumGeo.outerPoints} className="shop-map-atrium-poly-base" />
                                {polyAtriumGeo.rimPath && <path d={polyAtriumGeo.rimPath} className="lm-border-rim" fill="none" />}
                                {polyAtriumGeo.lipPath && <path d={polyAtriumGeo.lipPath} className="lm-border-lip-b" fill="none" />}
                              </svg>
                            )}
                            <div
                              className="shop-map-decor-content"
                              style={effectiveAngle ? ({ rotate: `${-effectiveAngle}deg` } as CSSProperties) : undefined}
                            >
                              <div className="shop-map-decor-badge" style={{ width: effectiveBadgePx, height: effectiveBadgePx }}>
                                <span className="shop-map-decor-icon">
                                  <DecorIcon
                                    kind={decorType}
                                    variant={lmMeta?.variant}
                                    size={effectiveIconPx}
                                  />
                                </span>
                              </div>
                              {showLandmarkSublabel && lmMeta && (
                                <span className="shop-map-decor-sublabel">{lmMeta.badgeText}</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            {um?.hasMerge ? (
                              <div className="shop-map-unit-box">
                                {um.topBridges.map(([u1, u2], idx) => (
                                  <span
                                    key={`utb-${idx}`}
                                    className="shop-map-unit-bridge"
                                    style={{
                                      left: `${(u1 / it.w) * 100}%`,
                                      width: `${((u2 - u1) / it.w) * 100}%`,
                                      bottom: '100%',
                                      height: 2,
                                    }}
                                  />
                                ))}
                                {um.bottomBridges.map(([u1, u2], idx) => (
                                  <span
                                    key={`ubb-${idx}`}
                                    className="shop-map-unit-bridge"
                                    style={{
                                      left: `${(u1 / it.w) * 100}%`,
                                      width: `${((u2 - u1) / it.w) * 100}%`,
                                      top: '100%',
                                      height: it.angle ? 2 : 1.5,
                                    }}
                                  />
                                ))}
                                {um.leftBridges.map(([v1, v2], idx) => (
                                  <span
                                    key={`ulb-${idx}`}
                                    className="shop-map-unit-bridge"
                                    style={{
                                      top: `${(v1 / it.h) * 100}%`,
                                      height: `${((v2 - v1) / it.h) * 100}%`,
                                      right: '100%',
                                      width: 2,
                                    }}
                                  />
                                ))}
                                {um.rightBridges.map(([v1, v2], idx) => (
                                  <span
                                    key={`urb-${idx}`}
                                    className="shop-map-unit-bridge"
                                    style={{
                                      top: `${(v1 / it.h) * 100}%`,
                                      height: `${((v2 - v1) / it.h) * 100}%`,
                                      left: '100%',
                                      width: it.angle ? 2 : 1.5,
                                    }}
                                  />
                                ))}
                                {hasPhotoImage && (
                                  <div
                                    className="shop-map-tile-photo-clip"
                                    style={{
                                      top: um.topMerged && um.topSegs.length === 0 ? -1 : 0,
                                      right: um.rightMerged && um.rightSegs.length === 0 ? -1 : 0,
                                      bottom: um.bottomMerged && um.bottomSegs.length === 0 ? -1 : 0,
                                      left: um.leftMerged && um.leftSegs.length === 0 ? -1 : 0,
                                      ...(trapezoidGeo ? { clipPath: trapezoidGeo.clipPath } : {}),
                                    }}
                                  >
                                    <div
                                      className={`shop-map-group-photo-frame ${um.groupBounds.spanH > um.groupBounds.spanW ? 'is-vertical-group' : ''}`}
                                      style={{
                                        left: `${-((it.x - um.groupBounds.minX) / it.w) * 100}%`,
                                        top: `${-((it.y - um.groupBounds.minY) / it.h) * 100}%`,
                                        width: `${(um.groupBounds.spanW / it.w) * 100}%`,
                                        height: `${(um.groupBounds.spanH / it.h) * 100}%`,
                                      }}
                                    >
                                      <CachedUnitPhoto
                                        photoUrl={rawPhotoUrl}
                                        alt={tileDisplayLabel}
                                        imgClassName={photoImgClass}
                                        skeletonClassName={hasUnitPhoto ? 'shop-map-tile-skeleton' : undefined}
                                        loading="eager"
                                      />
                                    </div>
                                  </div>
                                )}
                                {trapezoidGeo ? (
                                  <TrapezoidUnitSvg trap={trapezoidGeo} wPx={wPx} hPx={hPx} showFill={!hasUnitPhoto} />
                                ) : (
                                  <MergedTileBorderSvg merge={um} cellPx={cellPx} wPx={wPx} hPx={hPx} />
                                )}
                              </div>
                            ) : trapezoidGeo ? (
                              <div className="shop-map-unit-box">
                                {hasPhotoImage && (
                                  <div
                                    className="shop-map-tile-photo-clip"
                                    style={{ clipPath: trapezoidGeo.clipPath }}
                                  >
                                    <CachedUnitPhoto
                                      photoUrl={rawPhotoUrl}
                                      alt={tileDisplayLabel}
                                      imgClassName={photoImgClass}
                                      skeletonClassName={hasUnitPhoto ? 'shop-map-tile-skeleton' : undefined}
                                      loading="eager"
                                    />
                                  </div>
                                )}
                                <TrapezoidUnitSvg trap={trapezoidGeo} wPx={wPx} hPx={hPx} showFill={!hasUnitPhoto} />
                              </div>
                            ) : (
                              hasPhotoImage && (
                                <CachedUnitPhoto
                                  photoUrl={rawPhotoUrl}
                                  alt={tileDisplayLabel}
                                  imgClassName={photoImgClass}
                                  skeletonClassName={hasUnitPhoto ? 'shop-map-tile-skeleton' : undefined}
                                  loading="eager"
                                />
                              )
                            )}
                            {showUnitLabel && (
                              <div
                                className={`shop-map-tile-name ${isSmartUprightLabel ? 'is-smart-upright' : ''}`}
                                style={{
                                  fontSize: `${tileFontPx}px`,
                                  ...(trapezoidGeo && (trapezoidGeo.labelOffsetXPx || trapezoidGeo.labelOffsetYPx)
                                    ? ({
                                        translate: `${trapezoidGeo.labelOffsetXPx ?? 0}px ${trapezoidGeo.labelOffsetYPx ?? 0}px`,
                                      } as CSSProperties)
                                    : {}),
                                  ...(isSmartUprightLabel
                                    ? ({ rotate: `${-effectiveAngle}deg` } as CSSProperties)
                                    : isLabelUpsideDown
                                      ? ({ rotate: '180deg' } as CSSProperties)
                                      : {}),
                                }}
                              >
                                <span className="shop-map-tile-name-main">{tileDisplayLabel}</span>
                                {showUnitSubNumber && (
                                  <span className="shop-map-tile-unit-no">{unitNumberLabel}</span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                        </div>
                        {editing && (
                          <div
                            className="shop-map-tile-actions"
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            {it.kind === 'unit' && (
                              <button
                                className="shop-map-tile-btn add"
                                title="Add connected wing block (L / T / U shape)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addUnitWing(it.key);
                                }}
                              >
                                <Plus size={tileActionIconPx} />
                              </button>
                            )}
                            {decor && (
                              <button
                                className="shop-map-tile-btn add"
                                title={`Customize ${decorLabel} (type, direction & gate/label)`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openLandmarkConfig(it.key);
                                }}
                              >
                                <Pencil size={tileActionIconPx} />
                              </button>
                            )}
                            {(unitMode || hasLandmarkVariants) && (
                              <button
                                className="shop-map-tile-btn shape"
                                title={
                                  it.kind === 'unit'
                                    ? `Unit Shape: ${tileShapeDesc} — Click to choose shape (Shift+Click to cycle)`
                                    : `${decorLabel}: ${tileShapeDesc} — click to switch`
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (it.kind === 'unit' && !e.shiftKey) {
                                    setEditingUnitShapeKey(it.key);
                                  } else {
                                    cycleTileShape(it.key);
                                  }
                                }}
                              >
                                <AtriumShapeIcon mode={shapeMode || 'rect'} size={tileActionIconPx} />
                              </button>
                            )}
                            {(hasInnerItems || parentAtrium) && (
                              <button
                                className={`shop-map-tile-btn layer ${isLayerFocused ? 'active' : ''}`}
                                title={
                                  parentAtrium
                                    ? 'Bring Atrium to front (Alt+Click)'
                                    : isLayerFocused
                                      ? 'Send behind inner items (Alt+Click)'
                                      : 'Bring to front over inner items (Alt+Click)'
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (parentAtrium) {
                                    setFocusedLayerKey(focusedLayerKey === parentAtrium.key ? null : parentAtrium.key);
                                  } else {
                                    setFocusedLayerKey(isLayerFocused ? null : it.key);
                                  }
                                }}
                              >
                                <Layers size={tileActionIconPx} />
                              </button>
                            )}
                            <button
                              className="shop-map-tile-btn rot"
                              title="Rotate +15° (Shift+Click: +45°, Alt+Click: +1°)"
                              onClick={(e) => {
                                e.stopPropagation();
                                rotate(it.key, e.shiftKey ? 45 : e.altKey ? 1 : 15);
                              }}
                            >
                              <RotateCw size={tileActionIconPx} />
                            </button>
                            {it.kind !== 'marker' && (
                              <button className="shop-map-tile-btn" title="Remove" onClick={(e) => { e.stopPropagation(); remove(it.key); }}>
                                <X size={tileActionIconPx} />
                              </button>
                            )}
                          </div>
                        )}
                        {editing && (
                          <button
                            type="button"
                            className="shop-map-rot-handle"
                            title="Drag to rotate"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => startDragRotateTile(e, it.key)}
                          >
                            <span className="shop-map-rot-dot" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </ReactGridLayout>

                {/* ── Live Magnetic Snap Guide Lines & Floating Snap Badge (Edit Mode) ── */}
                {editing && dragSnapGuide && (
                  <>
                    <svg className="shop-map-snap-guides-svg" aria-hidden="true">
                      {dragSnapGuide.guideLines.map((gl, idx) => (
                        <line
                          key={`gl-${idx}`}
                          x1={gl.x1 * colStepPx}
                          y1={gl.y1 * rowStepPx}
                          x2={gl.x2 * colStepPx}
                          y2={gl.y2 * rowStepPx}
                          className={`shop-map-snap-guide-line ${dragSnapGuide.isPolygonAtriumSnap ? 'atrium' : ''}`}
                        />
                      ))}
                      <line
                        x1={dragSnapGuide.touchLine.x1 * colStepPx}
                        y1={dragSnapGuide.touchLine.y1 * rowStepPx}
                        x2={dragSnapGuide.touchLine.x2 * colStepPx}
                        y2={dragSnapGuide.touchLine.y2 * rowStepPx}
                        className={`shop-map-snap-touch-line ${dragSnapGuide.isPolygonAtriumSnap ? 'atrium' : ''}`}
                      />
                      <circle
                        cx={dragSnapGuide.touchLine.x1 * colStepPx}
                        cy={dragSnapGuide.touchLine.y1 * rowStepPx}
                        r={3.5}
                        className={`shop-map-snap-endpoint ${dragSnapGuide.isPolygonAtriumSnap ? 'atrium' : ''}`}
                      />
                      <circle
                        cx={dragSnapGuide.touchLine.x2 * colStepPx}
                        cy={dragSnapGuide.touchLine.y2 * rowStepPx}
                        r={3.5}
                        className={`shop-map-snap-endpoint ${dragSnapGuide.isPolygonAtriumSnap ? 'atrium' : ''}`}
                      />
                    </svg>
                    <div
                      className={`shop-map-snap-badge ${dragSnapGuide.isPolygonAtriumSnap ? 'atrium' : ''}`}
                      style={{
                        left: `${dragSnapGuide.badgePos.x * colStepPx}px`,
                        top: `${Math.max(18, dragSnapGuide.badgePos.y * rowStepPx - 14)}px`,
                      }}
                    >
                      <Magnet size={11} />
                      <span>{dragSnapGuide.badgeText}</span>
                    </div>
                  </>
                )}

                {/* ── Mappedin Smooth Wayfinding Route Overlay ── */}
                {routeRenderData && walkwayRoute && (() => {
                  const { smoothPathD, routeArrows, startPt, endPt, drawDurationSec, routeAnimKey } = routeRenderData;
                  const maskId = 'shop-map-route-reveal-mask';
                  return (
                    <svg
                      key={routeAnimKey}
                      className="shop-map-connector-svg"
                      aria-hidden="true"
                      style={{ '--route-draw-dur': `${drawDurationSec}s` } as CSSProperties}
                    >
                      <defs>
                        <mask id={maskId} maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="12000" height="12000">
                          <path d={smoothPathD} pathLength={1} className="shop-map-nav-reveal-mask-path" />
                        </mask>
                      </defs>
                      <g mask={`url(#${maskId})`}>
                        <path d={smoothPathD} className="shop-map-nav-glow" />
                        <path d={smoothPathD} className="shop-map-nav-casing" />
                        <path d={smoothPathD} className="shop-map-connector-line" />
                      </g>
                      {routeArrows.map((ar, idx) => (
                        <g
                          key={`ar-${idx}`}
                          transform={`translate(${ar.x.toFixed(1)}, ${ar.y.toFixed(1)}) rotate(${ar.angleDeg.toFixed(1)})`}
                          className="shop-map-nav-arrow-glyph"
                          style={{ '--arrow-delay': `${(ar.progress * drawDurationSec).toFixed(2)}s` } as CSSProperties}
                        >
                          <path d="M -3 -2.6 L 2.2 0 L -3 2.6" />
                        </g>
                      ))}
                      <circle cx={startPt.x} cy={startPt.y} r={8} className="shop-map-nav-pulse start" />
                      <circle cx={startPt.x} cy={startPt.y} r={4.5} className="shop-map-connector-dot start" />
                      <g
                        className="shop-map-nav-end-group"
                        style={{ '--end-delay': `${(drawDurationSec * 0.95).toFixed(2)}s` } as CSSProperties}
                      >
                        <circle cx={endPt.x} cy={endPt.y} r={9} className="shop-map-nav-pulse target" />
                        <circle cx={endPt.x} cy={endPt.y} r={5} className="shop-map-connector-dot target" />
                      </g>
                    </svg>
                  );
                })()}
              </div>
            </>
          )}

          {!editing && (placedCategories.length > 0 || placedDecorKinds.length > 0) && (
            <div className="shop-map-directory-overlays" onClick={(e) => e.stopPropagation()}>
              {placedDecorKinds.length > 0 && (
                <div className={`shop-map-landmarks-bar ${hasActiveSearch ? 'dim' : ''}`}>
                  {placedDecorKinds.map((kind) => (
                    <div
                      key={`decor-${kind}`}
                      className="shop-map-landmark-item clickable"
                      onClick={() => handleQuickFacility([kind])}
                      title={`Click to route to nearest ${DECORATION_LABELS[kind]}`}
                    >
                      <span className={`shop-map-directory-marker-badge lg-${kind}`}>
                        <DecorIcon kind={kind} size={legendIconPx} />
                      </span>
                      <span className="shop-map-directory-name">{DECORATION_LABELS[kind]}</span>
                    </div>
                  ))}
                </div>
              )}
              {placedCategories.length > 0 && (
                <div className="shop-map-category-grid">
                  {placedCategories.map(({ category, shops: catShops }) => (
                    <div key={category} className="shop-map-cat-card">
                      <div className="shop-map-cat-header">
                        <span className="shop-map-cat-icon">
                          <CategoryIcon category={category} size={categoryIconPx} />
                        </span>
                        <h4 className="shop-map-cat-title">{category.toUpperCase()}</h4>
                      </div>
                      <div className="shop-map-cat-divider" />
                      <div className="shop-map-cat-cols">
                        <span>STORE</span>
                        <span>UNIT</span>
                      </div>
                      <div className="shop-map-cat-rows">
                        {catShops.map((s) => {
                          const uKey = unitKey(s.unitId);
                          const isSelected = targetKey === uKey || selectedUnitId === s.unitId;
                          const isRowMatch = Boolean(hasActiveSearch && matchesShopQuery(s, normalizedSearch));
                          const isRowDim = Boolean(hasActiveSearch && !isRowMatch);
                          return (
                            <div
                              key={s.unitId}
                              className={`shop-map-cat-row ${isSelected ? 'active' : ''} ${isRowMatch ? 'search-match' : ''} ${isRowDim ? 'dim' : ''}`}
                              onClick={() => {
                                setCrossFloorUnitId(null);
                                setTargetKey((prev) => (prev === uKey ? '' : uKey));
                              }}
                            >
                              <span className="shop-map-cat-store">{s.brandName || 'Vacant'}</span>
                              <span className="shop-map-cat-unit">{unitNumberOf(s)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {editing && (
          <div className="shop-map-tray">
            <h4>Unplaced shops ({unplaced.length})</h4>
            {unplaced.length === 0 ? (
              <div className="shop-map-tray-empty">All shops on this floor are placed.</div>
            ) : (
              unplaced.map((s) => {
                const trayPhotoUrl = s.unit?.floorPlanUrl as string | undefined;
                return (
                  <div key={s.unitId} className="shop-map-tray-item">
                    {trayPhotoUrl && isUnitPhotoImage(trayPhotoUrl) && (
                      <CachedUnitPhoto
                        photoUrl={trayPhotoUrl}
                        alt={shopDisplayName(s, 'Unit')}
                        wrapperAs="span"
                        wrapperClassName="shop-photo-thumb-frame"
                        imgClassName="shop-dir-list-thumb"
                        skeletonClassName="shop-photo-mini-skeleton"
                      />
                    )}
                    <div className="grow">
                      {shopDisplayName(s)}
                      <small>{unitNumberOf(s)} · {s.unit?.areaSqft ?? '—'} sqft</small>
                    </div>
                    <button className="btn btn-secondary" onClick={() => place(s)}>Place</button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Floor QR Code Modal (1 QR Code per Floor) ── */}
      {showFloorQrModal && (
        <QrModalDialog
          title="Floor QR Code"
          subtitle='One QR code per floor — shoppers scan to navigate from "You Are Here"'
          onClose={() => setShowFloorQrModal(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.open(floorQrUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink size={14} /> Open Public Map
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrintFloorQr}
                disabled={!floorQrDataUrl}
              >
                <Printer size={14} /> Print Floor QR
              </button>
            </>
          }
        >
          <div className="shop-map-qr-floor-picker">
            <label>Select Floor:</label>
            <select
              className="shop-map-floor-select"
              value={activeQrFloor}
              onChange={(e) => setQrModalFloor(e.target.value)}
            >
              {floors.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <QrPreviewCard
            badge={activeQrFloor}
            dataUrl={floorQrDataUrl}
            alt={`QR Code for ${activeQrFloor}`}
            caption={
              <>
                Scan with phone camera to open <strong>{activeQrFloor}</strong> Indoor Navigation
              </>
            }
          />

          {activeQrFloor === floor && (
            <div className={`shop-map-qr-status ${hasMarkerOnFloor ? 'ok' : 'warn'}`}>
              <MapPin size={14} />
              <span>
                {hasMarkerOnFloor
                  ? 'Default starting point is linked to this floor\'s "You Are Here" marker.'
                  : 'Tip: Place a "You Are Here" marker in Edit Layout where this floor QR sign is posted.'}
              </span>
            </div>
          )}

          <div className="shop-map-qr-url-box">
            <input type="text" readOnly value={floorQrUrl} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(floorQrUrl);
                toast.success('Floor navigation link copied');
              }}
            >
              <Copy size={13} /> Copy
            </button>
          </div>
        </QrModalDialog>
      )}

      {/* ── Take Route on Phone QR Modal (Kiosk -> Mobile Handoff) ── */}
      {showRouteQrModal && (
        <QrModalDialog
          title="Take Route on Your Phone"
          subtitle={`${describeTile(activeStartItem)} → ${describeTile(effectiveTargetItem)}`}
          onClose={() => setShowRouteQrModal(false)}
        >
          <QrPreviewCard
            badge={`${floor} Route`}
            dataUrl={routeQrDataUrl}
            alt="Route QR Code"
            caption="Scan to open this exact walking route on your mobile phone"
          />
        </QrModalDialog>
      )}

      {/* ── Customize Landmark Variant & Gate/Location Tag Modal ── */}
      {editingLandmarkKey && (() => {
        const editingItem = items.find((i) => i.key === editingLandmarkKey);
        if (!editingItem || editingItem.kind === 'unit') return null;
        const lmKind = editingItem.kind;
        const variants = LANDMARK_VARIANTS[lmKind] || [];
        const activeSpec = variants.find((v) => v.id === landmarkVariantDraft) || variants[0];
        return (
          <QrModalDialog
            title={`Customize ${DECORATION_LABELS[lmKind]}`}
            subtitle="Choose sub-type (e.g. Emergency Exit, Up/Down Escalator, Accessible Lift) and optional gate/zone label"
            onClose={() => setEditingLandmarkKey(null)}
            footer={
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditingLandmarkKey(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={saveLandmarkConfig}
                >
                  Apply
                </button>
              </>
            }
          >
            {variants.length > 0 && (
              <div className="shop-map-lm-modal-section">
                <label className="shop-map-lm-modal-label">Sub-Type / Variant</label>
                <div className="shop-map-lm-variant-grid">
                  {variants.map((v) => {
                    const selected = landmarkVariantDraft === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`shop-map-lm-variant-btn ${selected ? 'active' : ''} ${v.isEmergency ? 'emergency' : ''}`}
                        onClick={() => {
                          setLandmarkVariantDraft(v.id);
                          if (v.id !== variants[0]?.id && lmKind !== 'marker') {
                            setLandmarkShowLabelDraft(true);
                          }
                        }}
                      >
                        <span className={`shop-map-lm-variant-icon ${v.isCircle ? 'is-circle' : ''}`}>
                          <DecorIcon kind={lmKind} variant={v.id} size={15} />
                        </span>
                        <span className="shop-map-lm-variant-text">
                          <strong>{v.label}</strong>
                          <small>
                            Badge: {v.badgeText}
                            {v.isCircle ? ' • Circle' : v.polygonFaces ? ` • ${v.polygonFaces} Faces` : ''}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {lmKind === 'atrium' && (
              <div className="shop-map-lm-modal-section">
                <label className="shop-map-lm-modal-label">
                  Add Inside Atrium (Elevator / Escalator / Stairs / Info Desk) &amp; Ring Layout
                </label>
                <div className="shop-map-lm-variant-grid">
                  {(
                    [
                      { kind: 'escalator' as const, variant: 'default', label: '+ Elevator / Lift (⇅)', sub: 'Standard Lift' },
                      { kind: 'escalator' as const, variant: 'circle', label: '+ Panoramic Glass Lift', sub: 'Circle Lift' },
                      { kind: 'escalator' as const, variant: 'escalator', label: '+ Escalator (⇅)', sub: 'Two-Way Escalator' },
                      { kind: 'escalator' as const, variant: 'escalator-up', label: '+ Escalator (Up ↑)', sub: 'Up Escalator' },
                      { kind: 'escalator' as const, variant: 'escalator-down', label: '+ Escalator (Down ↓)', sub: 'Down Escalator' },
                      { kind: 'stairs' as const, variant: 'default', label: '+ Stairs (⇅)', sub: 'Atrium Stairs' },
                      { kind: 'stairs' as const, variant: 'circle', label: '+ Spiral Stairs', sub: 'Circle Stairs' },
                      { kind: 'info' as const, variant: 'default', label: '+ Info Desk (i)', sub: 'Reception Desk' },
                      { kind: 'info' as const, variant: 'circle', label: '+ Circle Info Kiosk (i)', sub: 'Round Info Kiosk' },
                    ]
                  ).map((opt) => (
                    <button
                      key={`${opt.kind}-${opt.variant}`}
                      type="button"
                      className="shop-map-lm-variant-btn"
                      onClick={() => {
                        createTransitInAtrium(editingItem.key, opt.kind, opt.variant);
                        toast.success(`Added ${opt.label.replace(/^\+\s*/, '')} inside Atrium`);
                      }}
                    >
                      <span className="shop-map-lm-variant-icon">
                        <DecorIcon kind={opt.kind} variant={opt.variant} size={15} />
                      </span>
                      <span className="shop-map-lm-variant-text">
                        <strong>{opt.label}</strong>
                        <small>{opt.sub} • Auto-Merges</small>
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="shop-map-lm-variant-btn"
                    onClick={() => {
                      handleRadialAlignAtrium(editingItem.key);
                    }}
                  >
                    <span className="shop-map-lm-variant-icon">
                      <Wand2 size={15} />
                    </span>
                    <span className="shop-map-lm-variant-text">
                      <strong>Ring Align Surrounding Units</strong>
                      <small>Smart Radial Ring Aligner around this Atrium</small>
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div className="shop-map-lm-modal-section">
              <label className="shop-map-lm-modal-label" htmlFor="shop-map-lm-custom-input">
                Custom Gate / Location Name <span style={{ fontWeight: 400, opacity: 0.75 }}>(Optional)</span>
              </label>
              <input
                id="shop-map-lm-custom-input"
                type="text"
                className="shop-map-lm-custom-input"
                maxLength={40}
                placeholder={
                  editingItem.kind === 'exit'
                    ? 'e.g. Gate B, To Pyay Road, Level B1 Car Park'
                    : editingItem.kind === 'entrance'
                      ? 'e.g. Gate A (Main Plaza), VIP Drop-off'
                      : editingItem.kind === 'stairs' || editingItem.kind === 'escalator'
                        ? 'e.g. Lift Lobby A, To Cinema Level 4'
                        : 'e.g. Near Atrium, North Wing, KBZ / AYA ATM'
                }
                value={landmarkCustomDraft}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  if (!landmarkCustomDraft.trim() && nextVal.trim()) {
                    setLandmarkShowLabelDraft(true);
                  }
                  setLandmarkCustomDraft(nextVal);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveLandmarkConfig();
                  }
                }}
              />

              <label className="shop-map-lm-toggle-row">
                <input
                  type="checkbox"
                  checked={landmarkShowLabelDraft}
                  onChange={(e) => setLandmarkShowLabelDraft(e.target.checked)}
                />
                <span className="shop-map-lm-toggle-text">
                  <strong>Show Label on Map Tile</strong>
                  <small>
                    {landmarkShowLabelDraft
                      ? `Displays "${landmarkCustomDraft.trim() || activeSpec?.badgeText || DECORATION_LABELS[lmKind]}" below the icon`
                      : 'Icon only on map tile (label still shown in hover tooltip & navigation)'}
                  </small>
                </span>
              </label>
            </div>
          </QrModalDialog>
        );
      })()}

      {/* ── Customize Individual Unit Shape Modal (100% Independent Per Unit Tile) ── */}
      {editingUnitShapeKey && (() => {
        const editingUnitItem = items.find((i) => i.key === editingUnitShapeKey && i.kind === 'unit');
        if (!editingUnitItem) return null;
        const unitShop = editingUnitItem.unitId ? shopByUnit.get(editingUnitItem.unitId) : null;
        const isMerged = Boolean(unitMergeMap.get(editingUnitItem.key)?.siblingHasMerge);
        const isAutoShape = isAutoUnitShapeLabel(editingUnitItem.label);
        const currentMode = parseUnitShapeMode(editingUnitItem, autoShapeEnabled ? items : undefined);
        const unitTitle = unitShop
          ? `${shopDisplayName(unitShop)} (${unitNumberOf(unitShop)})`
          : 'Shop Unit';
        const visibleFamilies = UNIT_SHAPE_COMPACT_FAMILIES.filter(
          (fam) => unitShapeCatTab === 'all' || fam.category === unitShapeCatTab,
        );

        return (
          <QrModalDialog
            title={`Unit Shape — ${unitTitle}`}
            subtitle="Click any shape family to auto-match direction (click the active card again to flip direction)"
            onClose={() => setEditingUnitShapeKey(null)}
            footer={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setEditingUnitShapeKey(null)}
              >
                Done
              </button>
            }
          >
            <div className="shop-map-lm-modal-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <label className="shop-map-lm-modal-label" style={{ margin: 0 }}>
                  Shape Catalog <span style={{ fontWeight: 400, opacity: 0.75 }}>({isAutoShape ? `Auto: ${UNIT_SHAPE_LABELS[currentMode]}` : UNIT_SHAPE_LABELS[currentMode]})</span>
                </label>
                <button
                  type="button"
                  className={`btn btn-sm ${isAutoShape ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => {
                    resetUnitShapeToAuto(editingUnitItem.key);
                    setEditingUnitShapeKey(null);
                  }}
                >
                  <Wand2 size={13} /> Auto (Smart Detect)
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {UNIT_SHAPE_CATEGORY_TABS.map((tab) => {
                  const activeTab = unitShapeCatTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`btn btn-sm ${activeTab ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 999 }}
                      onClick={() => setUnitShapeCatTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="shop-map-lm-variant-grid">
                {visibleFamilies.map((fam) => {
                  const famVariants = fam.variants.filter((mode) => !isMerged || mode !== 'circle');
                  if (famVariants.length === 0) return null;
                  const activeIdx = !isAutoShape ? famVariants.indexOf(currentMode) : -1;
                  const activeMode = activeIdx >= 0 ? famVariants[activeIdx] : undefined;
                  const smartMode = resolveSmartFamilyShapeMode(editingUnitItem, fam, items, isMerged);
                  const previewMode = activeMode ?? smartMode;
                  const nextMode =
                    activeMode && famVariants.length > 1
                      ? famVariants[(activeIdx + 1) % famVariants.length]
                      : smartMode;

                  return (
                    <button
                      key={fam.id}
                      type="button"
                      className={`shop-map-lm-variant-btn ${activeMode ? 'active' : ''}`}
                      title={
                        activeMode && famVariants.length > 1
                          ? `${UNIT_SHAPE_LABELS[activeMode]} — Click again to flip direction`
                          : UNIT_SHAPE_LABELS[smartMode]
                      }
                      onClick={() => {
                        applyUnitShapeMode(editingUnitItem.key, nextMode);
                        if (famVariants.length <= 1) {
                          setEditingUnitShapeKey(null);
                        }
                      }}
                    >
                      <span className={`shop-map-lm-variant-icon ${previewMode === 'circle' ? 'is-circle' : ''}`}>
                        <AtriumShapeIcon mode={previewMode} size={18} />
                      </span>
                      <span className="shop-map-lm-variant-text">
                        <strong>{fam.title}</strong>
                        <small>
                          {activeMode && famVariants.length > 1
                            ? `${UNIT_SHAPE_LABELS[activeMode]} • Click to flip`
                            : fam.subtitle}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </QrModalDialog>
        );
      })()}
    </div>
  );
}

