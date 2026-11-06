import { useEffect, useMemo, useRef, useState } from 'react';
import { Store, Search, X } from 'lucide-react';
import { useGetPublicDirectoryQuery } from '../../store/api/mallApi';
import { resolveImageAssetUrl } from '../../utils/unitPhotoCache';
import { useUnitPhotoCache } from '../../components/common/CachedUnitPhoto';
import ShopMapView from '../admin/ShopDirectory/ShopMapView';
import AvailableUnitsAdModal from './AvailableUnitsAdModal';
import {
  getCachedDirectory,
  saveCachedDirectory,
} from '../admin/ShopDirectory/shopMapLayout';

const MIT_WEBSITE_URL = 'https://www.mit.com.mm';

export default function PublicMallNavigationPage() {
  useUnitPhotoCache();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const propertyId = urlParams.get('propertyId') || '';
  const initialFloor = urlParams.get('floor') || '';

  const [search, setSearch] = useState('');
  const [brandImgIdx, setBrandImgIdx] = useState(0);

  const { data, isLoading, isError } = useGetPublicDirectoryQuery(
    { propertyId },
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

  // "Units available for lease" ad: only when at least one unit is Available.
  // Shown on every page load/refresh, but only once per load (closing it keeps it closed until refresh).
  const availableCount = useMemo(
    () => allShops.filter((s: any) => String(s?.unit?.status ?? '').toLowerCase() === 'available').length,
    [allShops],
  );
  const hasAvailable = availableCount > 0;
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
          shops={allShops}
          propertyId={propertyId}
          propertyName={property?.name}
          searchQuery={search}
          fullScreen
          initialFloor={initialFloor}
          publicMode
          highlightAvailable={highlightAvailable}
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
          propertyName={property?.name}
          contact={property?.leasingContact}
          onViewUnits={viewAvailableUnits}
          onClose={closeAd}
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
