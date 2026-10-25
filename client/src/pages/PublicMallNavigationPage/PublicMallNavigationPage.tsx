import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Store, Search, X, MapPin, Tag, Star, Layers, Maximize2 } from 'lucide-react';
import { useGetPublicDirectoryQuery } from '../../store/api/mallApi';
import ShopMapView from '../admin/ShopDirectory/ShopMapView';

export default function PublicMallNavigationPage() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const propertyId = urlParams.get('propertyId') || '';
  const initialFloor = urlParams.get('floor') || '';

  const [search, setSearch] = useState('');
  const [detailShop, setDetailShop] = useState<any>(null);

  const { data, isLoading, isError } = useGetPublicDirectoryQuery(
    { propertyId },
    { skip: !propertyId },
  );

  const property = data?.data?.property;
  const allShops = data?.data?.shops || [];

  const matchesMapSearch = (s: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.brandName || '').toLowerCase().includes(q) ||
      (s.shopNumber || '').toLowerCase().includes(q) ||
      (s.tradeCategory || '').toLowerCase().includes(q) ||
      (s.unit?.unitNumber || '').toLowerCase().includes(q)
    );
  };

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
            <Store size={20} />
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

      {isLoading ? (
        <div className="shop-map-empty-state">
          <div className="shop-map-empty-icon">
            <Store size={26} />
          </div>
          <h4 className="shop-map-empty-title">Loading Directory…</h4>
        </div>
      ) : isError ? (
        <div className="shop-map-empty-state">
          <h4 className="shop-map-empty-title">Unable to load floor directory</h4>
          <p className="shop-map-empty-desc">Please check the QR code link and try again.</p>
        </div>
      ) : (
        <ShopMapView
          shops={allShops}
          propertyId={propertyId}
          propertyName={property?.name}
          matches={matchesMapSearch}
          onOpenShop={(shop) => setDetailShop(shop)}
          fullScreen
          initialFloor={initialFloor}
          publicMode
        />
      )}

      {/* Public Shop Info Modal */}
      {detailShop && createPortal(
        <div className="shop-map-qr-backdrop" onClick={() => setDetailShop(null)}>
          <div className="shop-map-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shop-map-qr-header">
              <div>
                <h3>
                  <Store size={18} /> {detailShop.brandName || 'Shop'}
                </h3>
                <p>Unit {detailShop.unit?.unitNumber || detailShop.shopNumber || '—'}</p>
              </div>
              <button type="button" className="shop-map-qr-close" onClick={() => setDetailShop(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="shop-map-qr-body">
              <div className="public-mall-tags">
                <span className="shop-map-quick-pill active public-mall-tag-pill">
                  <Tag size={12} /> {detailShop.tradeCategory || 'Other'}
                </span>
                {detailShop.isAnchor && (
                  <span className="shop-map-quick-pill public-mall-tag-pill">
                    <Star size={12} /> Anchor Store
                  </span>
                )}
              </div>

              <div className="public-mall-info-grid">
                <div>
                  <div className="public-mall-info-label">
                    <Layers size={11} /> Floor
                  </div>
                  <div className="public-mall-info-val">
                    {detailShop.unit?.floorLabel || `Floor ${detailShop.unit?.floorNumber ?? 1}`}
                  </div>
                </div>
                <div>
                  <div className="public-mall-info-label">
                    <MapPin size={11} /> Unit Number
                  </div>
                  <div className="public-mall-info-val">
                    {detailShop.unit?.unitNumber || detailShop.shopNumber || '—'}
                  </div>
                </div>
                {detailShop.tradeSubcategory && (
                  <div>
                    <div className="public-mall-info-label">Subcategory</div>
                    <div className="public-mall-info-val">{detailShop.tradeSubcategory}</div>
                  </div>
                )}
                {detailShop.unit?.areaSqft && (
                  <div>
                    <div className="public-mall-info-label">
                      <Maximize2 size={11} /> Area
                    </div>
                    <div className="public-mall-info-val">
                      {Number(detailShop.unit.areaSqft).toLocaleString()} sqft
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
