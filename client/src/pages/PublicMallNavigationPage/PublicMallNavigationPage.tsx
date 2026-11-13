import { useEffect, useMemo, useRef, useState } from 'react';
import { Store, Search, X } from 'lucide-react';
import { useGetPublicDirectoryQuery, useGetPublicFloorPlanQuery } from '../../store/api/mallApi';
import { preloadUnitPhotosBatch, resolveImageAssetUrl } from '../../utils/unitPhotoCache';
import { useUnitPhotoCache } from '../../components/common/CachedUnitPhoto';
import ShopMapView from '../admin/ShopDirectory/ShopMapView';
import AvailableUnitsAdModal from './AvailableUnitsAdModal';
import LeasingContactModal from './LeasingContactModal';
import type { AvailableUnit, EnquiryUnit } from './leasingContact';
import {
  compareShopsByUnitNumber,
  floorKeyOf,
  getCachedDirectory,
  saveCachedDirectory,
  unitKey,
  unitNumberOf,
} from '../admin/ShopDirectory/shopMapLayout';

const MIT_WEBSITE_URL = 'https://www.mit.com.mm';

/** Available for lease AND placed on the map, so a visitor can actually find it. Older cached data has no flag: keep it. */
const isAdvertisedUnit = (shop: any): boolean =>
  String(shop?.unit?.status ?? '').toLowerCase() === 'available' && shop?.placedOnMap !== false;

export default function PublicMallNavigationPage() {
  useUnitPhotoCache();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const propertyId = urlParams.get('propertyId') || '';
  const initialFloor = urlParams.get('floor') || '';

  const [search, setSearch] = useState('');
  const [brandImgIdx, setBrandImgIdx] = useState(0);

  // Opening the map on another floor / unit remounts it with new initial values.
  const [mapFloor, setMapFloor] = useState(initialFloor);
  const [mapTarget, setMapTarget] = useState('');
  const [mapKey, setMapKey] = useState(0);
  const [enquiry, setEnquiry] = useState<EnquiryUnit | null>(null);

  const { data, isLoading, isError } = useGetPublicDirectoryQuery(
    { propertyId },
    { skip: !propertyId },
  );

  // Prefetch the floor plan in parallel with the directory query to avoid a serial waterfall on initial load
  useGetPublicFloorPlanQuery(
    { propertyId, floor: mapFloor || 'Ground Floor' },
    { skip: !propertyId },
  );

  useEffect(() => {
    if (propertyId && Array.isArray(data?.data?.shops)) {
      saveCachedDirectory(propertyId, {
        property: data.data.property,
        shops: data.data.shops,
      });
    }
  }, [propertyId, data]);

  const cachedDir = useMemo(() => getCachedDirectory(propertyId), [propertyId, data]);
  const property = data?.data?.property ?? cachedDir?.property;
  const allShops = data?.data?.shops ?? cachedDir?.shops ?? [];

  useEffect(() => {
    if (!allShops.length) return;
    const urls = allShops.map((s: any) => s?.unit?.floorPlanUrl || s?.logoUrl || null);
    void preloadUnitPhotosBatch(urls);
  }, [allShops]);

  // "Units available for lease" ad: only when at least one unit is Available.
  // Shown on every page load/refresh, but only once per load (closing it keeps it closed until refresh).
  const availableCount = useMemo(() => allShops.filter(isAdvertisedUnit).length, [allShops]);
  const hasAvailable = availableCount > 0;
  const availableUnits = useMemo<AvailableUnit[]>(
    () =>
      allShops
        .filter((s: any) => s?.unitId && isAdvertisedUnit(s))
        .sort(
          (a: any, b: any) =>
            (Number(a.unit?.floorNumber) || 0) - (Number(b.unit?.floorNumber) || 0) || compareShopsByUnitNumber(a, b),
        )
        .map((s: any) => ({
          unitId: s.unitId,
          unitNumber: unitNumberOf(s) || 'Unit',
          floor: floorKeyOf(s),
          floorKey: floorKeyOf(s),
          areaSqft: Number(s.unit?.areaSqft) || null,
        })),
    [allShops],
  );
  const leasingContact = property?.leasingContact ?? null;
  const [adOpen, setAdOpen] = useState(false);
  const adShownRef = useRef(false);
  const [highlightAvailable, setHighlightAvailable] = useState(false);

  useEffect(() => {
    if (!propertyId || isLoading || !hasAvailable || adShownRef.current) return;
    const t = window.setTimeout(() => {
      adShownRef.current = true;
      setAdOpen(true);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [propertyId, isLoading, hasAvailable]);

  const closeAd = () => setAdOpen(false);

  const showUnitOnMap = (unit: AvailableUnit) => {
    closeAd();
    setMapFloor(unit.floorKey);
    setMapTarget(unitKey(unit.unitId));
    setMapKey((k) => k + 1);
  };

  const highlightTimerRef = useRef<number | null>(null);
  const stopHighlight = () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = null;
    setHighlightAvailable(false);
  };
  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const viewAvailableUnits = () => {
    closeAd();
    setHighlightAvailable(true);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(stopHighlight, 15000);
  };

  const propertyImageCandidates = useMemo(() => {
    const rawList = [
      resolveImageAssetUrl(property?.coverImageUrl),
      property?.coverImageUrl,
      resolveImageAssetUrl(property?.imageUrl),
      property?.imageUrl,
    ].filter((u): u is string => Boolean(u && typeof u === 'string' && u.trim()));
    return Array.from(new Set(rawList));
  }, [property?.coverImageUrl, property?.imageUrl]);

  const activePropertyImageUrl = propertyImageCandidates[brandImgIdx] || null;

  useEffect(() => {
    setBrandImgIdx(0);
  }, [propertyImageCandidates]);

  if (!propertyId) {
    return (
      <div className="shop-map-fullscreen-page public-mall-empty-page">
        <div className="shop-map-empty-state">
          <div className="shop-map-empty-icon">
            <Store size={28} />
          </div>
          <h4 className="shop-map-empty-title">Missing Property Link</h4>
          <p className="shop-map-empty-desc">Please scan a valid floor QR code to open the indoor navigation map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-map-fullscreen-page">
      {/* Public Header */}
      <div className="public-mall-header">
        <div className="public-mall-brand">
          <div className="public-mall-brand-icon">
            {activePropertyImageUrl ? (
              <img
                src={activePropertyImageUrl}
                alt={property?.name || 'Property'}
                className="public-mall-brand-img"
                onError={() => setBrandImgIdx((prev) => prev + 1)}
              />
            ) : (
              <Store size={20} />
            )}
          </div>
          <div>
            <h2 className="public-mall-brand-title">
              {property?.name || 'Shopping Directory & Indoor Navigation'}
            </h2>
            <p className="public-mall-brand-sub">
              {property?.address || 'Select a destination shop or facility to see your walking route'}
            </p>
          </div>
        </div>

        <div className="public-mall-search">
          <Search size={15} className="public-mall-search-icon" />
          <input
            type="text"
            placeholder="Search shop, brand, or unit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="public-mall-search-clear"
              onClick={() => setSearch('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {isLoading && allShops.length === 0 ? (
        <div className="shop-map-empty-state">
          <div className="shop-map-empty-icon">
            <Store size={26} />
          </div>
          <h4 className="shop-map-empty-title">Loading Directory…</h4>
        </div>
      ) : isError && allShops.length === 0 ? (
        <div className="shop-map-empty-state">
          <h4 className="shop-map-empty-title">Unable to load floor directory</h4>
          <p className="shop-map-empty-desc">Please check the QR code link and try again.</p>
        </div>
      ) : (
        <ShopMapView
          key={mapKey}
          shops={allShops}
          propertyId={propertyId}
          propertyName={property?.name}
          searchQuery={search}
          fullScreen
          initialFloor={mapFloor}
          initialTarget={mapTarget || undefined}
          publicMode
          highlightAvailable={highlightAvailable}
          onEnquireUnit={(shop) =>
            setEnquiry({
              unitId: shop?.unitId,
              unitNumber: unitNumberOf(shop) || 'Unit',
              floor: floorKeyOf(shop),
              areaSqft: Number(shop?.unit?.areaSqft) || null,
            })
          }
        />
      )}

      {highlightAvailable && (
        <button type="button" className="public-available-reset" onClick={stopHighlight}>
          Show all units
        </button>
      )}

      {adOpen && hasAvailable && (
        <AvailableUnitsAdModal
          count={availableCount}
          propertyId={propertyId}
          propertyName={property?.name}
          contact={leasingContact}
          units={availableUnits}
          onViewUnits={viewAvailableUnits}
          onShowUnit={showUnitOnMap}
          onClose={closeAd}
        />
      )}

      {enquiry && (
        <LeasingContactModal
          propertyId={propertyId}
          contact={leasingContact}
          propertyName={property?.name}
          unit={enquiry}
          onClose={() => setEnquiry(null)}
        />
      )}

      <footer className="public-mall-footer">
        Powered by{' '}
        <a href={MIT_WEBSITE_URL} target="_blank" rel="noopener noreferrer">
          MIT
        </a>
      </footer>
    </div>
  );
}
