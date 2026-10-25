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
      <div className="shop-map-fullscreen-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
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
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
          padding: '10px 14px',
          borderRadius: 12,
          border: '1px solid var(--border-color, var(--border))',
          background: 'var(--card-bg, var(--surface))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(16, 185, 129, 0.14)',
              color: 'var(--accent, #10b981)',
            }}
          >
            <Store size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {property?.name || 'Shopping Directory & Indoor Navigation'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              {property?.address || 'Select a destination shop or facility to see your walking route'}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--border-color, var(--border))',
            background: 'var(--bg-body, var(--bg))',
            minWidth: 240,
            flex: '0 1 320px',
          }}
        >
          <Search size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search shop, brand, or unit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              width: '100%',
              outline: 'none',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 2,
              }}
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
            <div className="shop-map-qr-body" style={{ gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span className="shop-map-quick-pill active" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Tag size={12} /> {detailShop.tradeCategory || 'Other'}
                </span>
                {detailShop.isAnchor && (
                  <span className="shop-map-quick-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Star size={12} /> Anchor Store
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid var(--border-color, var(--border))',
                  background: 'var(--bg-body, var(--bg))',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                    <Layers size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Floor
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>
                    {detailShop.unit?.floorLabel || `Floor ${detailShop.unit?.floorNumber ?? 1}`}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                    <MapPin size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Unit Number
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>
                    {detailShop.unit?.unitNumber || detailShop.shopNumber || '—'}
                  </div>
                </div>
                {detailShop.tradeSubcategory && (
                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Subcategory</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{detailShop.tradeSubcategory}</div>
                  </div>
                )}
                {detailShop.unit?.areaSqft && (
                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                      <Maximize2 size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Area
                    </div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>
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
