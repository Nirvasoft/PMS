import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useAppDispatch } from '../../store';
import {
  mallApi,
  useGetShopsQuery, useGetTenantMixQuery, useUpsertShopProfileMutation,
  useGetAvailableUnitsQuery, useGetCommercialLeaseQuery, useUpsertCommercialLeaseMutation,
} from '../../store/api/mallApi';
import {
  useUploadFloorPlanMutation,
  useDeleteFloorPlanMutation,
} from '../../store/api/unitsApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import {
  Store, Search, X, Maximize2, Calendar, DollarSign,
  Star, Tag, Building2, ChevronRight, Grid3x3, List, Map as MapIcon, Edit3,
  TrendingUp, Percent, ExternalLink, Layers, Package, Plus,
  FileText, Shield, Wrench, Receipt, Upload, Trash2, FileImage,
} from 'lucide-react';
import { PermissionGuard } from '../../components/guards/PermissionGuard';
import { CachedUnitPhoto, useUnitPhotoCache } from '../../components/common/CachedUnitPhoto';
import ShopMapView from './ShopDirectory/ShopMapView';
import { SHOP_CATEGORIES as CATEGORIES } from './ShopDirectory/shopMapLayout';
import {
  evictUnitPhotoCache,
  isImageFileName,
  isUnitPhotoImage,
  preloadUnitPhotosBatch,
  syncUploadedUnitPhotoCache,
  validateUnitPhotoFile,
} from '../../utils/unitPhotoCache';

const INITIAL_CREATE_FORM = { unitId: '', brandName: '', shopNumber: '', tradeCategory: 'Other' };

interface ShopModalPhotoBoxProps {
  photoUrl?: string | null;
  title: string;
  subtitle: string;
  uploadLabel: string;
  canRemove: boolean;
  isUploading?: boolean;
  isDeleting?: boolean;
  onUploadClick: () => void;
  onRemoveClick: () => void;
  noMargin?: boolean;
}

function ShopModalPhotoBox({
  photoUrl,
  title,
  subtitle,
  uploadLabel,
  canRemove,
  isUploading = false,
  isDeleting = false,
  onUploadClick,
  onRemoveClick,
  noMargin = false,
}: ShopModalPhotoBoxProps) {
  const hasImg = isUnitPhotoImage(photoUrl);
  return (
    <div className="shop-edit-photo-box" style={noMargin ? { marginBottom: 0 } : undefined}>
      <div className="shop-edit-photo-preview">
        {hasImg || isUploading ? (
          <CachedUnitPhoto
            photoUrl={hasImg ? photoUrl : null}
            alt="Shop photo"
            wrapperAs="div"
            wrapperClassName="shop-edit-photo-frame"
            imgClassName="shop-edit-photo-img"
            skeletonClassName="shop-photo-mini-skeleton"
            forceLoading={isUploading}
          />
        ) : (
          <div className="shop-edit-photo-placeholder">
            <FileImage size={22} />
          </div>
        )}
        <div className="shop-edit-photo-meta">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="shop-detail-photo-actions">
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={onUploadClick}
          disabled={isUploading || isDeleting}
        >
          <Upload size={13} /> {isUploading ? 'Uploading…' : uploadLabel}
        </button>
        {canRemove && (
          <button
            type="button"
            className="shop-photo-remove-btn"
            onClick={onRemoveClick}
            disabled={isUploading || isDeleting}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'ATMs':                  { bg: 'rgba(6, 182, 212, 0.12)',   text: '#06b6d4' },
  'Beauty & Wellness':     { bg: 'rgba(236, 72, 153, 0.12)',  text: '#ec4899' },
  'Dining':                { bg: 'rgba(245, 158, 11, 0.12)',  text: '#f59e0b' },
  'Education':             { bg: 'rgba(59, 130, 246, 0.12)',  text: '#3b82f6' },
  'Fashion & Accessories': { bg: 'rgba(99, 102, 241, 0.12)',  text: '#6366f1' },
  'Health/Pharmacy':       { bg: 'rgba(16, 185, 129, 0.12)',  text: '#10b981' },
  'Services':              { bg: 'rgba(20, 184, 166, 0.12)',  text: '#14b8a6' },
  'Sports & Lifestyle':    { bg: 'rgba(249, 115, 22, 0.12)',  text: '#f97316' },
  'Supermarket':           { bg: 'rgba(34, 197, 94, 0.12)',   text: '#22c55e' },
  'Watches & Jewellery':   { bg: 'rgba(168, 85, 247, 0.12)',  text: '#a855f7' },
  'Other':                 { bg: 'rgba(107, 114, 128, 0.12)', text: '#6b7280' },
};

function getCatStyle(cat: string) { return CATEGORY_COLORS[cat] || CATEGORY_COLORS['Other']; }

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function extractFloors(units: any[]) {
  const map = new Map<string, { value: string; label: string; floorNumber: number }>();
  for (const u of units) {
    if (!u) continue;
    const key = String(u.floorNumber ?? u.floorLabel ?? '1');
    if (!map.has(key)) {
      map.set(key, {
        value: key,
        label: u.floorLabel || `Floor ${u.floorNumber ?? 1}`,
        floorNumber: Number(u.floorNumber ?? 1),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.floorNumber - b.floorNumber);
}

export default function ShopDirectoryPage({ fullScreenMap = false }: { fullScreenMap?: boolean } = {}) {
  const dispatch = useAppDispatch();
  useUnitPhotoCache();
  const selectedPropertyId = useSelectedPropertyId();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const propertyId = urlParams.get('propertyId') || selectedPropertyId;
  const initialFloor = urlParams.get('floor') || '';
  const [filters, setFilters] = useState<{ tradeCategory?: string; isAnchor?: boolean }>({});
  const [floorFilter, setFloorFilter] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>(fullScreenMap ? 'map' : 'grid');
  const [showForm, setShowForm] = useState(false);
  const [detailShop, setDetailShop] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [showCreateShop, setShowCreateShop] = useState(false);
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const [createForm, setCreateForm] = useState<any>(INITIAL_CREATE_FORM);
  const [unitSearch, setUnitSearch] = useState('');
  const [unitFloorFilter, setUnitFloorFilter] = useState('');
  const [showLeaseEdit, setShowLeaseEdit] = useState(false);
  const [leaseFormData, setLeaseFormData] = useState<any>({});

  // Unit/Shop Photo state & refs
  const shopPhotoInputRef = useRef<HTMLInputElement>(null);
  const createShopPhotoInputRef = useRef<HTMLInputElement>(null);
  const [createPhotoFile, setCreatePhotoFile] = useState<File | null>(null);
  const [createPhotoPreviewUrl, setCreatePhotoPreviewUrl] = useState<string | null>(null);
  const [removeExistingUnitPhotoOnCreate, setRemoveExistingUnitPhotoOnCreate] = useState(false);

  const { data: shopsData, isLoading } = useGetShopsQuery(
    { propertyId },
    { skip: !propertyId }
  );
  const { data: mixData } = useGetTenantMixQuery({ propertyId }, { skip: !propertyId });
  const [upsertProfile, { isLoading: isSaving }] = useUpsertShopProfileMutation();
  const [uploadFloorPlan, { isLoading: isUploadingPhoto }] = useUploadFloorPlanMutation();
  const [deleteFloorPlan, { isLoading: isDeletingPhoto }] = useDeleteFloorPlanMutation();
  const { data: availRes } = useGetAvailableUnitsQuery({ propertyId }, { skip: !propertyId || !showCreateShop });

  const allShops = shopsData?.data || [];
  const mix = mixData?.data;

  useEffect(() => {
    if (allShops.length === 0) return;
    preloadUnitPhotosBatch(allShops.map((s: any) => s?.unit?.floorPlanUrl));
  }, [allShops]);

  useEffect(() => {
    if (!availRes?.data?.length) return;
    preloadUnitPhotosBatch(availRes.data.map((u: any) => u?.floorPlanUrl));
  }, [availRes?.data]);

  // Keep detailShop synced when allShops refetches (e.g. after photo upload in P-Units or Shop Directory)
  useEffect(() => {
    if (!detailShop?.unitId) return;
    const fresh = allShops.find((s: any) => s.unitId === detailShop.unitId);
    if (fresh && fresh !== detailShop) {
      setDetailShop(fresh);
    }
  }, [allShops, detailShop]);

  useEffect(() => {
    return () => {
      if (createPhotoPreviewUrl) URL.revokeObjectURL(createPhotoPreviewUrl);
    };
  }, [createPhotoPreviewUrl]);

  const availableUnits = useMemo(() => {
    const raw = availRes?.data || [];
    const takenUnitIds = new Set(allShops.map((s: any) => s.unitId));
    return raw.filter((u: any) => u.status === 'occupied' && !takenUnitIds.has(u.id));
  }, [availRes?.data, allShops]);

  const selectedCreateUnit = useMemo(
    () => availableUnits.find((u: any) => u.id === createForm.unitId) || null,
    [availableUnits, createForm.unitId],
  );

  const availableFloors = useMemo(() => extractFloors(availableUnits), [availableUnits]);

  const filteredAvailableUnits = useMemo(() => {
    return availableUnits.filter((u: any) => {
      if (unitFloorFilter && String(u.floorNumber ?? u.floorLabel ?? '1') !== unitFloorFilter) {
        return false;
      }
      if (!unitSearch.trim()) return true;
      const q = unitSearch.toLowerCase();
      return (
        u.unitNumber.toLowerCase().includes(q) ||
        (u.floorLabel || `floor ${u.floorNumber}`).toLowerCase().includes(q)
      );
    });
  }, [availableUnits, unitFloorFilter, unitSearch]);

  // Commercial lease hooks
  const activeLeaseId = detailShop?.unit?.leases?.[0]?.id;
  const { data: clData, refetch: refetchCl } = useGetCommercialLeaseQuery(
    activeLeaseId || '', { skip: !activeLeaseId }
  );
  const [upsertLease, { isLoading: isSavingLease }] = useUpsertCommercialLeaseMutation();
  const commercialLease = clData?.data;

  const shopFloors = useMemo(() => extractFloors(allShops.map((s: any) => s.unit)), [allShops]);

  // Client-side category, anchor, floor & search filter (for Grid & List views)
  const shops = useMemo(() => {
    return allShops.filter((s: any) => {
      if (filters.tradeCategory && (s.tradeCategory || 'Other') !== filters.tradeCategory) return false;
      if (filters.isAnchor && !s.isAnchor) return false;
      if (floorFilter) {
        const u = s.unit;
        const key = String(u?.floorNumber ?? u?.floorLabel ?? '1');
        if (key !== floorFilter) return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (s.brandName || '').toLowerCase().includes(q) ||
        (s.shopNumber || '').toLowerCase().includes(q) ||
        (s.tradeCategory || 'Other').toLowerCase().includes(q) ||
        (s.franchiseGroup || '').toLowerCase().includes(q) ||
        (s.unit?.unitNumber || '').toLowerCase().includes(q)
      );
    });
  }, [allShops, filters.tradeCategory, filters.isAnchor, floorFilter, search]);

  const matchesMapSearch = (s: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.brandName || '').toLowerCase().includes(q) ||
      (s.shopNumber || '').toLowerCase().includes(q) ||
      (s.unit?.unitNumber || '').toLowerCase().includes(q)
    );
  };

  const openDetail = (shop: any) => setDetailShop(shop);
  const closeDetail = () => { setDetailShop(null); setShowLeaseEdit(false); };

  const openEdit = (shop: any) => {
    setFormData({
      shopNumber: shop.shopNumber || '',
      brandName: shop.brandName || '',
      tradeCategory: shop.tradeCategory || 'Other',
      tradeSubcategory: shop.tradeSubcategory || '',
      franchiseGroup: shop.franchiseGroup || '',
      isAnchor: shop.isAnchor || false,
      posSystem: shop.posSystem || '',
      posStoreId: shop.posStoreId || '',
    });
    setDetailShop(shop);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!detailShop) return;
    try {
      await upsertProfile({ unitId: detailShop.unitId, data: formData }).unwrap();
      setShowForm(false);
    } catch (e) { console.error(e); }
  };

  const handleShopPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !detailShop?.unitId || !propertyId) return;
    const validationErr = validateUnitPhotoFile(file);
    if (validationErr) {
      toast.error(validationErr);
      return;
    }
    const previousUrl = detailShop.unit?.floorPlanUrl;
    try {
      const updated = await uploadFloorPlan({ propertyId, unitId: detailShop.unitId, file }).unwrap();
      const newUrl = updated?.data?.floorPlanUrl || null;
      syncUploadedUnitPhotoCache(previousUrl, newUrl, file);
      setDetailShop((prev: any) =>
        prev ? { ...prev, unit: { ...prev.unit, floorPlanUrl: newUrl } } : prev,
      );
      dispatch(mallApi.util.invalidateTags(['Shops']));
      toast.success('Photo uploaded & synced to Unit Photo');
    } catch {
      toast.error('Failed to upload photo');
    }
  };

  const handleShopPhotoRemove = async () => {
    if (!detailShop?.unitId || !propertyId) return;
    const previousUrl = detailShop.unit?.floorPlanUrl;
    try {
      await deleteFloorPlan({ propertyId, unitId: detailShop.unitId }).unwrap();
      evictUnitPhotoCache(previousUrl);
      setDetailShop((prev: any) =>
        prev ? { ...prev, unit: { ...prev.unit, floorPlanUrl: null } } : prev,
      );
      dispatch(mallApi.util.invalidateTags(['Shops']));
      toast.success('Photo removed from Shop & Unit Photo');
    } catch {
      toast.error('Failed to remove photo');
    }
  };

  const handleCreatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const validationErr = validateUnitPhotoFile(file);
    if (validationErr) {
      toast.error(validationErr);
      return;
    }
    if (createPhotoPreviewUrl) URL.revokeObjectURL(createPhotoPreviewUrl);
    setCreatePhotoFile(file);
    setRemoveExistingUnitPhotoOnCreate(false);
    setCreatePhotoPreviewUrl(isImageFileName(file.name) ? URL.createObjectURL(file) : null);
  };

  const resetCreatePhotoState = () => {
    if (createPhotoPreviewUrl) URL.revokeObjectURL(createPhotoPreviewUrl);
    setCreatePhotoFile(null);
    setCreatePhotoPreviewUrl(null);
    setRemoveExistingUnitPhotoOnCreate(false);
  };

  const openLeaseEdit = () => {
    const cl = commercialLease || {};
    setLeaseFormData({
      fitOutStartDate: cl.fitOutStartDate ? cl.fitOutStartDate.split('T')[0] : '',
      fitOutEndDate: cl.fitOutEndDate ? cl.fitOutEndDate.split('T')[0] : '',
      fitOutRentFree: cl.fitOutRentFree ?? true,
      fitOutAllowance: cl.fitOutAllowance ?? 0,
      fitOutAllowancePaid: cl.fitOutAllowancePaid ?? false,
      hasPercentageRent: cl.hasPercentageRent ?? false,
      percentageRentRate: cl.percentageRentRate ? (Number(cl.percentageRentRate) * 100).toFixed(2) : '',
      percentageRentType: cl.percentageRentType || 'natural',
      baseRentPctThreshold: cl.baseRentPctThreshold ?? '',
      artificialBreakpoint: cl.artificialBreakpoint ?? '',
      gtoReportingDay: cl.gtoReportingDay ?? 15,
      camIncluded: cl.camIncluded ?? true,
      camRatePerSqft: cl.camRatePerSqft ?? '',
      camCapPct: cl.camCapPct ? (Number(cl.camCapPct) * 100).toFixed(2) : '',
      camBaseYear: cl.camBaseYear ?? '',
      marketingLevyPct: cl.marketingLevyPct ? (Number(cl.marketingLevyPct) * 100).toFixed(2) : '',
      marketingLevyAmount: cl.marketingLevyAmount ?? '',
      turnoverReportingRequired: cl.turnoverReportingRequired ?? true,
      exclusivityCategory: cl.exclusivityCategory ?? '',
      exclusivityRadiusKm: cl.exclusivityRadiusKm ?? '',
    });
    setShowLeaseEdit(true);
  };

  const handleSaveLease = async () => {
    if (!activeLeaseId) return;
    try {
      const payload = {
        ...leaseFormData,
        fitOutStartDate: leaseFormData.fitOutStartDate || null,
        fitOutEndDate: leaseFormData.fitOutEndDate || null,
        fitOutAllowance: Number(leaseFormData.fitOutAllowance) || 0,
        percentageRentRate: leaseFormData.hasPercentageRent && leaseFormData.percentageRentRate
          ? Number(leaseFormData.percentageRentRate) / 100 : null,
        baseRentPctThreshold: leaseFormData.baseRentPctThreshold ? Number(leaseFormData.baseRentPctThreshold) : null,
        artificialBreakpoint: leaseFormData.artificialBreakpoint ? Number(leaseFormData.artificialBreakpoint) : null,
        gtoReportingDay: Number(leaseFormData.gtoReportingDay) || 15,
        camRatePerSqft: leaseFormData.camRatePerSqft ? Number(leaseFormData.camRatePerSqft) : null,
        camCapPct: leaseFormData.camCapPct ? Number(leaseFormData.camCapPct) / 100 : null,
        camBaseYear: leaseFormData.camBaseYear ? Number(leaseFormData.camBaseYear) : null,
        marketingLevyPct: leaseFormData.marketingLevyPct ? Number(leaseFormData.marketingLevyPct) / 100 : 0.01,
        marketingLevyAmount: leaseFormData.marketingLevyAmount ? Number(leaseFormData.marketingLevyAmount) : null,
        exclusivityRadiusKm: leaseFormData.exclusivityRadiusKm ? Number(leaseFormData.exclusivityRadiusKm) : null,
      };
      await upsertLease({ leaseId: activeLeaseId, data: payload }).unwrap();
      setShowLeaseEdit(false);
      refetchCl();
    } catch (e) { console.error(e); }
  };

  const handleCreateShop = async () => {
    setCreateSubmitted(true);
    if (!createForm.unitId || !createForm.brandName?.trim()) return;
    try {
      await upsertProfile({
        unitId: createForm.unitId,
        data: {
          shopNumber: createForm.shopNumber || undefined,
          brandName: createForm.brandName || undefined,
          tradeCategory: createForm.tradeCategory || 'Other',
          tradeSubcategory: createForm.tradeSubcategory || undefined,
        },
      }).unwrap();
      if (propertyId && createPhotoFile) {
        const previousUrl = selectedCreateUnit?.floorPlanUrl;
        const updated = await uploadFloorPlan({
          propertyId,
          unitId: createForm.unitId,
          file: createPhotoFile,
        }).unwrap();
        syncUploadedUnitPhotoCache(previousUrl, updated?.data?.floorPlanUrl, createPhotoFile);
        dispatch(mallApi.util.invalidateTags(['Shops']));
      } else if (propertyId && removeExistingUnitPhotoOnCreate && selectedCreateUnit?.floorPlanUrl) {
        const previousUrl = selectedCreateUnit.floorPlanUrl;
        await deleteFloorPlan({ propertyId, unitId: createForm.unitId }).unwrap();
        evictUnitPhotoCache(previousUrl);
        dispatch(mallApi.util.invalidateTags(['Shops']));
      }
      setShowCreateShop(false);
      setCreateSubmitted(false);
      setUnitFloorFilter('');
      setUnitSearch('');
      setCreateForm(INITIAL_CREATE_FORM);
      resetCreatePhotoState();
    } catch (e) { console.error(e); }
  };

  if (!propertyId) {
    return (
      <div className="page-content">
        <div className="mall-empty-state">
          <Store size={48} strokeWidth={1} />
          <h3>Select a Property</h3>
          <p>Choose a mall property from the sidebar to view shops</p>
        </div>
      </div>
    );
  }

  return (
    <div className={fullScreenMap ? 'shop-map-fullscreen-page' : 'page-content'}>
      {!fullScreenMap && (
      /* Header */
      <div className="shop-dir-header">
        <div className="page-header">
          <div className="page-title-row">
            <div className="page-icon-lg">
              <Store size={22} />
            </div>
            <div>
              <h1>Shop Directory</h1>
              <p>{allShops.length} total shops</p>
            </div>
          </div>
          <PermissionGuard permission="mall-shops.write">
            <button className="btn btn-primary" onClick={() => { setCreateSubmitted(false); setUnitFloorFilter(''); setUnitSearch(''); setShowCreateShop(true); }}>
              <Plus size={16} /> Add Shop
            </button>
          </PermissionGuard>
        </div>

        {/* Stats Bar */}
        {viewMode !== 'map' && mix && (
          <div className="shop-dir-stats">
            <div className="shop-dir-stat">
              <Store size={16} />
              <span className="shop-dir-stat-val">{mix.totalShops}</span>
              <span className="shop-dir-stat-label">Total Shops</span>
            </div>
            <div className="shop-dir-stat">
              <TrendingUp size={16} />
              <span className="shop-dir-stat-val">{mix.occupancyRate?.toFixed(0)}%</span>
              <span className="shop-dir-stat-label">Occupancy</span>
            </div>
            <div className="shop-dir-stat">
              <Maximize2 size={16} />
              <span className="shop-dir-stat-val">{(mix.totalGlaSqft || 0).toLocaleString()}</span>
              <span className="shop-dir-stat-label">Total GLA (sqft)</span>
            </div>
            <div className="shop-dir-stat">
              <Star size={16} />
              <span className="shop-dir-stat-val">{mix.anchorTenants?.length || 0}</span>
              <span className="shop-dir-stat-label">Anchors</span>
            </div>
          </div>
        )}

        {/* Tenant Mix Chart — only for Grid/List directory views */}
        {viewMode !== 'map' && mix?.byCategory?.length > 0 && (
          <div className="mall-card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} /> Tenant Mix by Category
            </h3>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Donut Chart (SVG) */}
              <svg viewBox="0 0 120 120" width={160} height={160}>
                {(() => {
                  const cats = mix.byCategory;
                  const total = cats.reduce((s: number, c: any) => s + c.glaSqft, 0) || 1;
                  let cum = 0;
                  return cats.map((c: any) => {
                    const color = getCatStyle(c.category).text;
                    const pct = c.glaSqft / total;
                    const startAngle = cum * 2 * Math.PI - Math.PI / 2;
                    cum += pct;
                    const endAngle = cum * 2 * Math.PI - Math.PI / 2;
                    const largeArc = pct > 0.5 ? 1 : 0;
                    const r = 50, cx = 60, cy = 60;
                    const x1 = cx + r * Math.cos(startAngle);
                    const y1 = cy + r * Math.sin(startAngle);
                    const x2 = cx + r * Math.cos(endAngle);
                    const y2 = cy + r * Math.sin(endAngle);
                    return (
                      <path
                        key={c.category}
                        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                        fill={color}
                        stroke="var(--card-bg, var(--surface))"
                        strokeWidth={2}
                        opacity={0.85}
                      >
                        <title>{c.category}: {c.pct}% ({c.shopCount} shops, {c.glaSqft.toLocaleString()} sqft)</title>
                      </path>
                    );
                  });
                })()}
                <circle cx={60} cy={60} r={28} fill="var(--card-bg, var(--surface))" />
                <text x={60} y={56} textAnchor="middle" fill="var(--text-primary)" fontSize={13} fontWeight={700}>
                  {mix.totalShops}
                </text>
                <text x={60} y={70} textAnchor="middle" fill="var(--text-secondary)" fontSize={8}>
                  shops
                </text>
              </svg>

              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 }}>
                {mix.byCategory.map((c: any) => {
                  const catInfo = getCatStyle(c.category);
                  return (
                    <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: catInfo.text, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        {c.category}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>
                        {c.shopCount}
                      </span>
                      <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--border-color, var(--border))', overflow: 'hidden' }}>
                        <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: 3, background: catInfo.text }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: catInfo.text, minWidth: 38, textAlign: 'right' }}>
                        {c.pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {/* Search & Filters */}
        <div className="shop-dir-toolbar">
          <div className="shop-dir-search">
            <Search size={16} />
            <input
              type="text"
              placeholder={viewMode === 'map' ? 'Search unit or brand on map...' : 'Search shops, brands, units...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="shop-dir-search-clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {viewMode !== 'map' && (
            <div className="shop-dir-filters">
              <select
                className="shop-dir-filter-select"
                value={filters.tradeCategory || ''}
                onChange={e => setFilters(f => ({ ...f, tradeCategory: e.target.value || undefined }))}
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                className="shop-dir-filter-select"
                value={floorFilter}
                onChange={e => setFloorFilter(e.target.value)}
              >
                <option value="">All Floors</option>
                {shopFloors.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <label className="shop-dir-anchor-toggle">
                <input
                  type="checkbox"
                  checked={filters.isAnchor || false}
                  onChange={e => setFilters(f => ({ ...f, isAnchor: e.target.checked || undefined }))}
                />
                <Star size={14} />
                Anchors
              </label>
            </div>
          )}

          <div className="shop-dir-view-toggle" style={viewMode === 'map' ? { marginLeft: 'auto' } : undefined}>
            <button
              className={`shop-dir-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            ><Grid3x3 size={16} /></button>
            <button
              className={`shop-dir-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            ><List size={16} /></button>
            <button
              className={`shop-dir-view-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
              title="Map"
            ><MapIcon size={16} /></button>
          </div>

          <span className="shop-dir-result-count">
            {viewMode === 'map' ? `${allShops.length} units` : `${shops.length} shops`}
          </span>
        </div>
      </div>
      )}

      {/* Shared hidden file inputs for Shop / Unit Photo */}
      <input
        ref={shopPhotoInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
        style={{ display: 'none' }}
        onChange={handleShopPhotoUpload}
      />
      <input
        ref={createShopPhotoInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
        style={{ display: 'none' }}
        onChange={handleCreatePhotoSelect}
      />

      {/* Content */}
      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} className="module-skeleton-card" />)}
        </div>
      ) : viewMode === 'map' ? (
        <ShopMapView
          shops={allShops}
          propertyId={propertyId}
          matches={matchesMapSearch}
          onOpenShop={openDetail}
          fullScreen={fullScreenMap}
          initialFloor={initialFloor}
        />
      ) : shops.length === 0 ? (
        <div className="mall-empty-state">
          <Store size={48} strokeWidth={1} />
          <h3>{search ? 'No Matching Shops' : 'No Shop Profiles'}</h3>
          <p>{search ? 'Try adjusting your search or filters' : 'Create shop profiles by assigning brands and categories to units'}</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="shop-dir-grid">
          {shops.map((shop: any) => {
            const lease = shop.unit?.leases?.[0];
            const cat = getCatStyle(shop.tradeCategory || 'Other');
            const leaseEnd = lease?.endDate ? daysUntil(lease.endDate) : null;
            const photoUrl = shop.unit?.floorPlanUrl;
            const hasPhoto = isUnitPhotoImage(photoUrl);
            return (
              <div
                key={shop.unitId}
                className={`shop-dir-card ${shop.isAnchor ? 'shop-dir-card-anchor' : ''}`}
                onClick={() => openDetail(shop)}
              >
                {/* Card Top Banner / Photo Header */}
                <div
                  className={`shop-dir-card-banner ${hasPhoto ? 'has-photo' : ''}`}
                  style={hasPhoto ? undefined : { background: cat.bg }}
                >
                  {hasPhoto && (
                    <CachedUnitPhoto
                      photoUrl={photoUrl}
                      alt={shop.brandName || shop.unit?.unitNumber || 'Shop'}
                      imgClassName="shop-dir-card-photo"
                      skeletonClassName="shop-dir-card-photo-skeleton"
                    />
                  )}
                  {shop.isAnchor && <span className="shop-dir-anchor-badge"><Star size={10} /> Anchor</span>}
                  <span className="shop-dir-card-unit">{shop.shopNumber || shop.unit?.unitNumber}</span>
                </div>

                {/* Card Body */}
                <div className="shop-dir-card-body">
                  <h3 className="shop-dir-card-brand">{shop.brandName || 'Unnamed Shop'}</h3>
                  {shop.tradeSubcategory && (
                    <span className="shop-dir-card-subcat">{shop.tradeSubcategory}</span>
                  )}

                  <div className="shop-dir-card-tags">
                    <span className="shop-dir-tag" style={{ background: cat.bg, color: cat.text }}>
                      <Tag size={10} /> {shop.tradeCategory || 'Other'}
                    </span>
                  </div>

                  <div className="shop-dir-card-info">
                    <div className="shop-dir-card-info-item">
                      <Maximize2 size={12} />
                      <span>{Number(shop.unit?.areaSqft || 0).toLocaleString()} sqft</span>
                    </div>
                    <div className={`shop-dir-card-status shop-dir-status-${shop.unit?.status}`}>
                      {shop.unit?.status}
                    </div>
                  </div>

                  {/* Lease Footer */}
                  {lease ? (
                    <div className="shop-dir-card-lease">
                      <div className="shop-dir-card-lease-left">
                        <DollarSign size={12} />
                        <span className="shop-dir-card-rent">
                          ${Number(lease.rentAmount).toLocaleString()}<small>/mo</small>
                        </span>
                      </div>
                      <div className="shop-dir-card-lease-right">
                        {lease.commercialLease?.hasPercentageRent && (
                          <span className="shop-dir-pct-rent">
                            +{(Number(lease.commercialLease.percentageRentRate) * 100).toFixed(0)}% GTO
                          </span>
                        )}
                        {leaseEnd !== null && leaseEnd <= 90 && (
                          <span className={`shop-dir-lease-expiry ${leaseEnd <= 30 ? 'urgent' : ''}`}>
                            <Calendar size={10} />
                            {leaseEnd <= 0 ? 'Expired' : `${leaseEnd}d left`}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="shop-dir-card-lease shop-dir-card-vacant">
                      <span>No active lease</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="shop-dir-list">
          <div className="shop-dir-list-header">
            <span>Unit / Brand</span>
            <span>Category</span>
            <span>Area</span>
            <span>Status</span>
            <span>Rent</span>
            <span></span>
          </div>
          {shops.map((shop: any) => {
            const lease = shop.unit?.leases?.[0];
            const cat = getCatStyle(shop.tradeCategory || 'Other');
            const photoUrl = shop.unit?.floorPlanUrl;
            const hasPhoto = isUnitPhotoImage(photoUrl);
            return (
              <div key={shop.unitId} className="shop-dir-list-row" onClick={() => openDetail(shop)}>
                <div className="shop-dir-list-brand">
                  {hasPhoto && (
                    <CachedUnitPhoto
                      photoUrl={photoUrl}
                      alt={shop.brandName || 'Shop'}
                      wrapperAs="span"
                      wrapperClassName="shop-photo-thumb-frame"
                      imgClassName="shop-dir-list-thumb"
                      skeletonClassName="shop-photo-mini-skeleton"
                    />
                  )}
                  <div>
                    <strong>{shop.brandName || 'Unnamed'}</strong>
                    <small>{shop.shopNumber || shop.unit?.unitNumber}</small>
                  </div>
                  {shop.isAnchor && <Star size={14} className="shop-dir-list-anchor" />}
                </div>
                <span className="shop-dir-tag" style={{ background: cat.bg, color: cat.text }}>
                  {shop.tradeCategory || 'Other'}
                </span>
                <span>{Number(shop.unit?.areaSqft || 0).toLocaleString()} sqft</span>
                <span className={`shop-dir-card-status shop-dir-status-${shop.unit?.status}`}>
                  {shop.unit?.status}
                </span>
                <span className="shop-dir-list-rent">
                  {lease ? `$${Number(lease.rentAmount).toLocaleString()}/mo` : '—'}
                </span>
                <ChevronRight size={16} className="shop-dir-list-arrow" />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detail Drawer ── */}
      {detailShop && !showForm && createPortal(
        <div className="shop-detail-overlay">
          <div className="shop-detail-drawer" onClick={e => e.stopPropagation()}>
            <div className="shop-detail-header">
              <div>
                <span className="shop-detail-unit">{detailShop.shopNumber || detailShop.unit?.unitNumber}</span>
                <h2 className="shop-detail-brand">{detailShop.brandName || 'Unnamed Shop'}</h2>
                {detailShop.tradeSubcategory && (
                  <span className="shop-detail-subcat">{detailShop.tradeSubcategory}</span>
                )}
              </div>
              <div className="shop-detail-header-actions">
                <PermissionGuard permission="mall-shops.write">
                  <button className="btn btn-sm btn-outline" onClick={() => openEdit(detailShop)}>
                    <Edit3 size={14} /> Edit
                  </button>
                </PermissionGuard>
                <button className="shop-detail-close" onClick={closeDetail}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Tags */}
            <div className="shop-detail-tags">
              {detailShop.isAnchor && (
                <span className="shop-dir-anchor-badge"><Star size={10} /> Anchor Tenant</span>
              )}
              <span className="shop-dir-tag" style={{
                background: getCatStyle(detailShop.tradeCategory).bg,
                color: getCatStyle(detailShop.tradeCategory).text,
              }}>
                <Tag size={10} /> {detailShop.tradeCategory || 'Other'}
              </span>
            </div>

            {/* Shop / Unit Photo Section (Synced with P-Units -> Unit Photo) */}
            {(() => {
              const photoUrl = detailShop.unit?.floorPlanUrl;
              const isImg = isUnitPhotoImage(photoUrl);
              return (
                <div className="shop-detail-photo-section">
                  <div className="shop-detail-photo-header">
                    <span className="shop-detail-photo-title">
                      <FileImage size={14} /> Shop / Unit Photo
                    </span>
                    <PermissionGuard permission="mall-shops.write">
                      <div className="shop-detail-photo-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => shopPhotoInputRef.current?.click()}
                          disabled={isUploadingPhoto || isDeletingPhoto}
                        >
                          <Upload size={13} /> {isUploadingPhoto ? 'Uploading…' : photoUrl ? 'Replace' : 'Upload Photo'}
                        </button>
                        {photoUrl && (
                          <button
                            type="button"
                            className="shop-photo-remove-btn"
                            onClick={handleShopPhotoRemove}
                            disabled={isUploadingPhoto || isDeletingPhoto}
                          >
                            <Trash2 size={13} /> {isDeletingPhoto ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </PermissionGuard>
                  </div>
                  {photoUrl ? (
                    isImg ? (
                      <CachedUnitPhoto
                        photoUrl={photoUrl}
                        alt={detailShop.brandName || detailShop.unit?.unitNumber || 'Unit photo'}
                        wrapperAs="div"
                        wrapperClassName="shop-detail-photo-frame"
                        imgClassName="shop-detail-photo-img"
                        skeletonClassName="shop-detail-photo-skeleton"
                        loading="eager"
                        forceLoading={isUploadingPhoto}
                      />
                    ) : (
                      <div className="shop-detail-photo-pdf">
                        <FileImage size={24} />
                        <span>Unit Photo (PDF)</span>
                        <a
                          href={`/api/v1${photoUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline"
                        >
                          <ExternalLink size={12} /> Open
                        </a>
                      </div>
                    )
                  ) : isUploadingPhoto ? (
                    <CachedUnitPhoto
                      photoUrl={null}
                      alt="Uploading"
                      wrapperAs="div"
                      wrapperClassName="shop-detail-photo-frame"
                      imgClassName="shop-detail-photo-img"
                      skeletonClassName="shop-detail-photo-skeleton"
                      forceLoading
                    />
                  ) : (
                    <div
                      className="shop-detail-photo-empty"
                      onClick={() => shopPhotoInputRef.current?.click()}
                    >
                      <FileImage size={22} />
                      <span>No photo uploaded yet — click Upload Photo (syncs with P-Unit Photo)</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Info Grid */}
            <div className="shop-detail-info-grid">
              <div className="shop-detail-info-item">
                <span className="shop-detail-info-label"><Maximize2 size={14} /> Area</span>
                <span className="shop-detail-info-value">{Number(detailShop.unit?.areaSqft || 0).toLocaleString()} sqft</span>
              </div>
              <div className="shop-detail-info-item">
                <span className="shop-detail-info-label"><Building2 size={14} /> Status</span>
                <span className={`shop-dir-card-status shop-dir-status-${detailShop.unit?.status}`}>
                  {detailShop.unit?.status}
                </span>
              </div>
              <div className="shop-detail-info-item">
                <span className="shop-detail-info-label"><Layers size={14} /> Franchise</span>
                <span className="shop-detail-info-value">{detailShop.franchiseGroup || '—'}</span>
              </div>
              <div className="shop-detail-info-item">
                <span className="shop-detail-info-label"><Package size={14} /> POS System</span>
                <span className="shop-detail-info-value" style={{ textTransform: 'capitalize' }}>
                  {detailShop.posSystem || '—'}
                </span>
              </div>
            </div>

            {/* Lease Section */}
            {(() => {
              const lease = detailShop.unit?.leases?.[0];
              if (!lease) return (
                <div className="shop-detail-section">
                  <h4 className="shop-detail-section-title">Lease Information</h4>
                  <div className="shop-detail-no-lease">
                    <Calendar size={20} />
                    <p>No active lease for this unit</p>
                  </div>
                </div>
              );

              const leaseEnd = daysUntil(lease.endDate);
              const cl = lease.commercialLease;

              return (
                <div className="shop-detail-section">
                  <h4 className="shop-detail-section-title">Lease Information</h4>
                  <div className="shop-detail-lease-card">
                    <div className="shop-detail-lease-row">
                      <span className="shop-detail-lease-label">Lease No</span>
                      <span className="shop-detail-lease-val">{lease.leaseNumber}</span>
                    </div>
                    <div className="shop-detail-lease-row">
                      <span className="shop-detail-lease-label">Base Rent</span>
                      <span className="shop-detail-lease-val shop-detail-lease-rent">
                        ${Number(lease.rentAmount).toLocaleString()}/mo
                      </span>
                    </div>
                    {cl?.hasPercentageRent && (
                      <div className="shop-detail-lease-row">
                        <span className="shop-detail-lease-label">% Rent</span>
                        <span className="shop-detail-lease-val">
                          <span className="shop-dir-pct-rent">
                            <Percent size={12} />
                            {(Number(cl.percentageRentRate) * 100).toFixed(1)}% of GTO
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="shop-detail-lease-row">
                      <span className="shop-detail-lease-label">Expiry</span>
                      <span className="shop-detail-lease-val">
                        {new Date(lease.endDate).toLocaleDateString()}
                        <span className={`shop-dir-lease-expiry ${leaseEnd <= 30 ? 'urgent' : leaseEnd <= 90 ? '' : 'ok'}`}>
                          {leaseEnd <= 0 ? 'Expired' : `${leaseEnd} days left`}
                        </span>
                      </span>
                    </div>
                    {lease.tenant?.companyName && (
                      <div className="shop-detail-lease-row">
                        <span className="shop-detail-lease-label">Tenant</span>
                        <span className="shop-detail-lease-val">{lease.tenant.companyName}</span>
                      </div>
                    )}
                  </div>

                  {/* Commercial Lease Terms */}
                  {cl && (
                    <div className="shop-detail-lease-terms">
                      <div className="shop-detail-lease-terms-header">
                        <h5 style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileText size={13} /> Commercial Lease Terms
                        </h5>
                        <PermissionGuard permission="mall-shops.write">
                          <button className="btn btn-sm btn-outline" onClick={openLeaseEdit} style={{ fontSize: '0.72rem', padding: '3px 10px' }}>
                            <Edit3 size={12} /> Edit Terms
                          </button>
                        </PermissionGuard>
                      </div>

                      <div className="shop-detail-cl-grid">
                        {/* Fit-Out */}
                        {(cl.fitOutStartDate || cl.fitOutEndDate) && (
                          <div className="shop-detail-cl-item">
                            <span className="shop-detail-cl-icon"><Wrench size={12} /></span>
                            <div>
                              <span className="shop-detail-cl-label">Fit-Out Period</span>
                              <span className="shop-detail-cl-value">
                                {cl.fitOutStartDate ? new Date(cl.fitOutStartDate).toLocaleDateString() : '—'} → {cl.fitOutEndDate ? new Date(cl.fitOutEndDate).toLocaleDateString() : '—'}
                                {cl.fitOutRentFree && <span className="shop-detail-cl-badge green">Rent Free</span>}
                              </span>
                            </div>
                          </div>
                        )}
                        {Number(cl.fitOutAllowance) > 0 && (
                          <div className="shop-detail-cl-item">
                            <span className="shop-detail-cl-icon"><DollarSign size={12} /></span>
                            <div>
                              <span className="shop-detail-cl-label">Fit-Out Allowance</span>
                              <span className="shop-detail-cl-value">
                                ${Number(cl.fitOutAllowance).toLocaleString()}
                                <span className={`shop-detail-cl-badge ${cl.fitOutAllowancePaid ? 'green' : 'amber'}`}>
                                  {cl.fitOutAllowancePaid ? 'Paid' : 'Unpaid'}
                                </span>
                              </span>
                            </div>
                          </div>
                        )}

                        {/* CAM */}
                        <div className="shop-detail-cl-item">
                          <span className="shop-detail-cl-icon"><Receipt size={12} /></span>
                          <div>
                            <span className="shop-detail-cl-label">CAM</span>
                            <span className="shop-detail-cl-value">
                              {cl.camIncluded ? (
                                <>
                                  Included
                                  {cl.camRatePerSqft && <span> · ${Number(cl.camRatePerSqft).toFixed(2)}/sqft</span>}
                                  {cl.camCapPct && <span> · Cap {(Number(cl.camCapPct) * 100).toFixed(0)}%</span>}
                                </>
                              ) : (
                                <span className="shop-detail-cl-badge">Excluded</span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Marketing Levy */}
                        <div className="shop-detail-cl-item">
                          <span className="shop-detail-cl-icon"><TrendingUp size={12} /></span>
                          <div>
                            <span className="shop-detail-cl-label">Marketing Levy</span>
                            <span className="shop-detail-cl-value">
                              {(Number(cl.marketingLevyPct) * 100).toFixed(1)}%
                              {cl.marketingLevyAmount && <span> (min ${Number(cl.marketingLevyAmount).toLocaleString()})</span>}
                            </span>
                          </div>
                        </div>

                        {/* Exclusivity */}
                        {cl.exclusivityCategory && (
                          <div className="shop-detail-cl-item">
                            <span className="shop-detail-cl-icon"><Shield size={12} /></span>
                            <div>
                              <span className="shop-detail-cl-label">Exclusivity</span>
                              <span className="shop-detail-cl-value">
                                {cl.exclusivityCategory}
                                {cl.exclusivityRadiusKm && <span> · {Number(cl.exclusivityRadiusKm).toFixed(1)} km radius</span>}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* GTO Reporting */}
                        <div className="shop-detail-cl-item">
                          <span className="shop-detail-cl-icon"><Calendar size={12} /></span>
                          <div>
                            <span className="shop-detail-cl-label">GTO Reporting</span>
                            <span className="shop-detail-cl-value">
                              Due by {cl.gtoReportingDay || 15}th
                              {cl.turnoverReportingRequired
                                ? <span className="shop-detail-cl-badge green">Required</span>
                                : <span className="shop-detail-cl-badge">Optional</span>}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* POS Integration */}
            {detailShop.posSystem && (
              <div className="shop-detail-section">
                <h4 className="shop-detail-section-title">POS Integration</h4>
                <div className="shop-detail-pos-card">
                  <div className="shop-detail-pos-row">
                    <span>System</span>
                    <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{detailShop.posSystem}</span>
                  </div>
                  <div className="shop-detail-pos-row">
                    <span>Store ID</span>
                    <code>{detailShop.posStoreId || '—'}</code>
                  </div>
                  <div className="shop-detail-pos-row">
                    <span>Status</span>
                    <span className="shop-detail-pos-connected">
                      <ExternalLink size={12} /> Connected
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {/* ── Edit Modal ── */}
      {showForm && createPortal(
        <div className="mall-modal-overlay">
          <div className="shop-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <div>
                <h3>Edit Shop Profile</h3>
                <span className="shop-edit-unit-label">{detailShop?.shopNumber || detailShop?.unit?.unitNumber}</span>
              </div>
              <button className="mall-modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>

            <div className="shop-edit-body">
              {/* Shop / Unit Photo in Edit Modal */}
              <ShopModalPhotoBox
                photoUrl={detailShop?.unit?.floorPlanUrl}
                title="Shop / Unit Photo"
                subtitle={
                  detailShop?.unit?.floorPlanUrl
                    ? 'Synced with P-Units → Unit Photo'
                    : 'Upload a photo for this shop & P-Unit'
                }
                uploadLabel={detailShop?.unit?.floorPlanUrl ? 'Replace' : 'Upload'}
                canRemove={Boolean(detailShop?.unit?.floorPlanUrl)}
                isUploading={isUploadingPhoto}
                isDeleting={isDeletingPhoto}
                onUploadClick={() => shopPhotoInputRef.current?.click()}
                onRemoveClick={handleShopPhotoRemove}
              />

              <div className="shop-edit-grid">
                <label className="shop-edit-field">
                  <span>Shop Number</span>
                  <input value={formData.shopNumber} onChange={e => setFormData({ ...formData, shopNumber: e.target.value })} />
                </label>
                <label className="shop-edit-field">
                  <span>Brand Name</span>
                  <input value={formData.brandName} onChange={e => setFormData({ ...formData, brandName: e.target.value })} />
                </label>
                <label className="shop-edit-field">
                  <span>Trade Category</span>
                  <select value={formData.tradeCategory || 'Other'} onChange={e => setFormData({ ...formData, tradeCategory: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="shop-edit-field">
                  <span>Sub-category</span>
                  <input value={formData.tradeSubcategory} onChange={e => setFormData({ ...formData, tradeSubcategory: e.target.value })} placeholder="e.g., Coffee, Sportswear" />
                </label>
                <label className="shop-edit-field">
                  <span>POS System</span>
                  <input value={formData.posSystem} onChange={e => setFormData({ ...formData, posSystem: e.target.value })} placeholder="e.g., square, lightspeed" />
                </label>
                <label className="shop-edit-field">
                  <span>POS Store ID</span>
                  <input value={formData.posStoreId} onChange={e => setFormData({ ...formData, posStoreId: e.target.value })} placeholder="e.g., POS-001" />
                </label>
                <label className="shop-edit-field">
                  <span>Franchise Group</span>
                  <input value={formData.franchiseGroup} onChange={e => setFormData({ ...formData, franchiseGroup: e.target.value })} placeholder="e.g., H&M Group" />
                </label>
                <label className="shop-edit-field shop-edit-checkbox">
                  <input type="checkbox" checked={formData.isAnchor} onChange={e => setFormData({ ...formData, isAnchor: e.target.checked })} />
                  <Star size={14} /> Anchor Tenant
                </label>
              </div>
            </div>

            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── Commercial Lease Edit Modal ── */}
      {showLeaseEdit && activeLeaseId && createPortal(
        <div className="mall-modal-overlay">
          <div className="shop-edit-modal shop-lease-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <div>
                <h3>Edit Commercial Lease Terms</h3>
                <span className="shop-edit-unit-label">
                  {detailShop?.brandName || detailShop?.shopNumber || detailShop?.unit?.unitNumber} · Lease {detailShop?.unit?.leases?.[0]?.leaseNumber}
                </span>
              </div>
              <button className="mall-modal-close" onClick={() => setShowLeaseEdit(false)}><X size={18} /></button>
            </div>

            <div className="shop-edit-body">
              {/* Fit-Out Period */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Wrench size={14} /> Fit-Out Period</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>Start Date</span>
                    <input type="date" value={leaseFormData.fitOutStartDate} onChange={e => setLeaseFormData({ ...leaseFormData, fitOutStartDate: e.target.value })} />
                  </label>
                  <label className="shop-edit-field">
                    <span>End Date</span>
                    <input type="date" value={leaseFormData.fitOutEndDate} onChange={e => setLeaseFormData({ ...leaseFormData, fitOutEndDate: e.target.value })} />
                  </label>
                  <label className="shop-edit-field shop-edit-checkbox">
                    <input type="checkbox" checked={leaseFormData.fitOutRentFree} onChange={e => setLeaseFormData({ ...leaseFormData, fitOutRentFree: e.target.checked })} />
                    Rent-Free During Fit-Out
                  </label>
                  <label className="shop-edit-field">
                    <span>Fit-Out Allowance ($)</span>
                    <input type="number" min="0" step="0.01" value={leaseFormData.fitOutAllowance} onChange={e => setLeaseFormData({ ...leaseFormData, fitOutAllowance: e.target.value })} placeholder="0.00" />
                  </label>
                  <label className="shop-edit-field shop-edit-checkbox">
                    <input type="checkbox" checked={leaseFormData.fitOutAllowancePaid} onChange={e => setLeaseFormData({ ...leaseFormData, fitOutAllowancePaid: e.target.checked })} />
                    Allowance Paid
                  </label>
                </div>
              </div>

              {/* Percentage Rent */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Percent size={14} /> Percentage Rent</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field shop-edit-checkbox" style={{ gridColumn: '1 / -1' }}>
                    <input type="checkbox" checked={leaseFormData.hasPercentageRent} onChange={e => setLeaseFormData({ ...leaseFormData, hasPercentageRent: e.target.checked })} />
                    Enable Percentage Rent
                  </label>
                  {leaseFormData.hasPercentageRent && (
                    <>
                      <label className="shop-edit-field">
                        <span>Percentage Rate (%)</span>
                        <input type="number" min="0" max="100" step="0.01" value={leaseFormData.percentageRentRate} onChange={e => setLeaseFormData({ ...leaseFormData, percentageRentRate: e.target.value })} placeholder="e.g. 5.00" />
                      </label>
                      <label className="shop-edit-field">
                        <span>Breakpoint Type</span>
                        <select value={leaseFormData.percentageRentType} onChange={e => setLeaseFormData({ ...leaseFormData, percentageRentType: e.target.value })}>
                          <option value="natural">Natural (Base Rent ÷ Rate)</option>
                          <option value="artificial">Artificial (Fixed Amount)</option>
                        </select>
                      </label>
                      {leaseFormData.percentageRentType === 'artificial' && (
                        <label className="shop-edit-field">
                          <span>Artificial Breakpoint ($)</span>
                          <input type="number" min="0" step="0.01" value={leaseFormData.artificialBreakpoint} onChange={e => setLeaseFormData({ ...leaseFormData, artificialBreakpoint: e.target.value })} placeholder="Fixed GTO threshold" />
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* CAM */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Receipt size={14} /> CAM (Common Area Maintenance)</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field shop-edit-checkbox" style={{ gridColumn: '1 / -1' }}>
                    <input type="checkbox" checked={leaseFormData.camIncluded} onChange={e => setLeaseFormData({ ...leaseFormData, camIncluded: e.target.checked })} />
                    CAM Included in Lease
                  </label>
                  {leaseFormData.camIncluded && (
                    <>
                      <label className="shop-edit-field">
                        <span>CAM Rate ($/sqft)</span>
                        <input type="number" min="0" step="0.01" value={leaseFormData.camRatePerSqft} onChange={e => setLeaseFormData({ ...leaseFormData, camRatePerSqft: e.target.value })} placeholder="Rate per sqft" />
                      </label>
                      <label className="shop-edit-field">
                        <span>CAM Cap (%)</span>
                        <input type="number" min="0" max="100" step="0.01" value={leaseFormData.camCapPct} onChange={e => setLeaseFormData({ ...leaseFormData, camCapPct: e.target.value })} placeholder="Annual increase cap" />
                      </label>
                      <label className="shop-edit-field">
                        <span>CAM Base Year</span>
                        <input type="number" min="2000" max="2099" value={leaseFormData.camBaseYear} onChange={e => setLeaseFormData({ ...leaseFormData, camBaseYear: e.target.value })} placeholder="e.g. 2025" />
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Marketing & Exclusivity */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Shield size={14} /> Marketing & Exclusivity</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>Marketing Levy (%)</span>
                    <input type="number" min="0" max="100" step="0.01" value={leaseFormData.marketingLevyPct} onChange={e => setLeaseFormData({ ...leaseFormData, marketingLevyPct: e.target.value })} placeholder="e.g. 1.00" />
                  </label>
                  <label className="shop-edit-field">
                    <span>Min Marketing Amount ($)</span>
                    <input type="number" min="0" step="0.01" value={leaseFormData.marketingLevyAmount} onChange={e => setLeaseFormData({ ...leaseFormData, marketingLevyAmount: e.target.value })} placeholder="Monthly minimum" />
                  </label>
                  <label className="shop-edit-field">
                    <span>Exclusivity Category</span>
                    <input value={leaseFormData.exclusivityCategory} onChange={e => setLeaseFormData({ ...leaseFormData, exclusivityCategory: e.target.value })} placeholder="e.g. Coffee, Fast Food" />
                  </label>
                  <label className="shop-edit-field">
                    <span>Exclusivity Radius (km)</span>
                    <input type="number" min="0" step="0.1" value={leaseFormData.exclusivityRadiusKm} onChange={e => setLeaseFormData({ ...leaseFormData, exclusivityRadiusKm: e.target.value })} placeholder="e.g. 2.0" />
                  </label>
                </div>
              </div>

              {/* GTO Reporting */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Calendar size={14} /> GTO Reporting</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>Reporting Due Day</span>
                    <input type="number" min="1" max="28" value={leaseFormData.gtoReportingDay} onChange={e => setLeaseFormData({ ...leaseFormData, gtoReportingDay: e.target.value })} />
                  </label>
                  <label className="shop-edit-field shop-edit-checkbox">
                    <input type="checkbox" checked={leaseFormData.turnoverReportingRequired} onChange={e => setLeaseFormData({ ...leaseFormData, turnoverReportingRequired: e.target.checked })} />
                    Turnover Reporting Required
                  </label>
                </div>
              </div>
            </div>

            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowLeaseEdit(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveLease} disabled={isSavingLease}>
                {isSavingLease ? 'Saving...' : 'Save Lease Terms'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── Create Shop Modal ── */}
      {showCreateShop && createPortal(
        <div className="mall-modal-overlay">
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <div>
                <h3>Add New Shop</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Assign a shop profile to an available unit
                </span>
              </div>
              <button className="mall-modal-close" onClick={() => { setShowCreateShop(false); resetCreatePhotoState(); }}>✕</button>
            </div>
            <div className="mall-modal-body">
              {availableUnits.length === 0 ? (
                <div className="mall-empty-state" style={{ padding: '24px 0' }}>
                  <Building2 size={36} strokeWidth={1} />
                  <h3 style={{ fontSize: '1rem', margin: '8px 0 4px' }}>No Available Units</h3>
                  <p style={{ fontSize: '0.85rem' }}>All units in this property already have shop profiles, or no units exist yet.</p>
                </div>
              ) : (
                <div className="mall-form-grid">
                  <label style={{ gridColumn: '1 / -1' }}>
                    <span>Filter by Floor</span>
                    <select
                      value={unitFloorFilter}
                      onChange={e => {
                        setUnitFloorFilter(e.target.value);
                        if (createForm.unitId) {
                          setCreateForm({ ...createForm, unitId: '', shopNumber: '' });
                          resetCreatePhotoState();
                        }
                      }}
                    >
                      <option value="">All Floors</option>
                      {availableFloors.map(f => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mall-form-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="mall-form-field-label">Search & Select Unit *</span>
                    <div className="shop-unit-picker">
                      <div className="shop-unit-picker-input">
                        <Search size={16} className="shop-unit-picker-icon" />
                        <input
                          type="text"
                          className={createSubmitted && !createForm.unitId ? 'mall-input-error' : ''}
                          placeholder="Type unit number to search (e.g. BKG-01-015)..."
                          value={unitSearch}
                          onChange={e => { setUnitSearch(e.target.value); }}
                        />
                        {(unitSearch || createForm.unitId) && (
                          <button type="button" className="shop-unit-picker-clear" onClick={() => {
                            setCreateForm({ ...createForm, unitId: '', shopNumber: '' });
                            setUnitSearch('');
                            resetCreatePhotoState();
                          }}><X size={14} /></button>
                        )}
                      </div>
                      {createSubmitted && !createForm.unitId && (
                        <span className="mall-error-text">Unit is required</span>
                      )}
                      {createForm.unitId ? (
                        <div className="shop-unit-picker-selected">
                          ✓ Selected: <strong>{createForm.shopNumber}</strong>
                        </div>
                      ) : (
                        <div className="shop-unit-picker-list">
                          {filteredAvailableUnits
                            .slice(0, 50)
                            .map((u: any) => (
                              <button
                                type="button"
                                key={u.id}
                                className="shop-unit-picker-item"
                                onClick={() => {
                                  setCreateForm({ ...createForm, unitId: u.id, shopNumber: u.unitNumber });
                                  setUnitSearch('');
                                  resetCreatePhotoState();
                                }}
                              >
                                {isUnitPhotoImage(u.floorPlanUrl) && (
                                  <CachedUnitPhoto
                                    photoUrl={u.floorPlanUrl}
                                    alt={u.unitNumber}
                                    wrapperAs="span"
                                    wrapperClassName="shop-photo-thumb-frame"
                                    imgClassName="shop-unit-picker-thumb"
                                    skeletonClassName="shop-photo-mini-skeleton"
                                  />
                                )}
                                <span className="shop-unit-picker-num">{u.unitNumber}</span>
                                <span className="shop-unit-picker-meta">
                                  {u.floorLabel || `Floor ${u.floorNumber}`} · {Number(u.areaSqft || 0).toLocaleString()} sqft
                                </span>
                                <span className={`shop-unit-picker-status status-${u.status}`}>{u.status}</span>
                              </button>
                            ))}
                          {filteredAvailableUnits.length > 50 && (
                            <div className="shop-unit-picker-more">Type to narrow down results...</div>
                          )}
                          {filteredAvailableUnits.length === 0 && (
                            <div className="shop-unit-picker-more">No matching units found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <label>
                    <span>Shop Number</span>
                    <input value={createForm.shopNumber} onChange={e => setCreateForm({ ...createForm, shopNumber: e.target.value })} placeholder="Auto from unit" />
                  </label>
                  <label>
                    <span>Brand Name *</span>
                    <input
                      className={createSubmitted && !createForm.brandName?.trim() ? 'mall-input-error' : ''}
                      value={createForm.brandName}
                      onChange={e => setCreateForm({ ...createForm, brandName: e.target.value })}
                      placeholder="e.g. Starbucks"
                    />
                    {createSubmitted && !createForm.brandName?.trim() && (
                      <span className="mall-error-text">Brand name is required</span>
                    )}
                  </label>
                  <label>
                    <span>Trade Category</span>
                    <select value={createForm.tradeCategory} onChange={e => setCreateForm({ ...createForm, tradeCategory: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Sub-Category</span>
                    <input value={createForm.tradeSubcategory || ''} onChange={e => setCreateForm({ ...createForm, tradeSubcategory: e.target.value })} placeholder="e.g. Coffee" />
                  </label>

                  {/* Shop / Unit Photo in Create Shop Modal */}
                  <div className="mall-form-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="mall-form-field-label">Shop / Unit Photo (Syncs with P-Unit Photo)</span>
                    {(() => {
                      const existingUnitPhotoUrl =
                        !removeExistingUnitPhotoOnCreate && selectedCreateUnit?.floorPlanUrl
                          ? selectedCreateUnit.floorPlanUrl
                          : null;
                      return (
                        <ShopModalPhotoBox
                          photoUrl={createPhotoPreviewUrl || existingUnitPhotoUrl}
                          title={
                            createPhotoFile
                              ? createPhotoFile.name
                              : existingUnitPhotoUrl
                                ? 'Unit already has a photo (Auto-synced from P-Unit)'
                                : 'No photo selected'
                          }
                          subtitle={
                            createPhotoFile
                              ? 'Will upload & update P-Unit Photo on create'
                              : existingUnitPhotoUrl
                                ? 'Will automatically show in Shop Directory'
                                : 'Upload PNG, JPG, WEBP, GIF or PDF (max 10MB)'
                          }
                          uploadLabel={createPhotoFile || existingUnitPhotoUrl ? 'Replace' : 'Upload Photo'}
                          canRemove={Boolean(createPhotoFile || existingUnitPhotoUrl)}
                          isUploading={isUploadingPhoto}
                          onUploadClick={() => createShopPhotoInputRef.current?.click()}
                          onRemoveClick={() => {
                            if (createPhotoFile) {
                              resetCreatePhotoState();
                            } else if (existingUnitPhotoUrl) {
                              setRemoveExistingUnitPhotoOnCreate(true);
                            }
                          }}
                          noMargin
                        />
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowCreateShop(false); resetCreatePhotoState(); }}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCreateShop}
                disabled={isSaving || isUploadingPhoto}
              >
                {isSaving || isUploadingPhoto ? 'Creating...' : '+ Create Shop'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
