import React, { useState } from 'react';
import { useGetShopsQuery, useGetTenantMixQuery, useUpsertShopProfileMutation } from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Store, X } from 'lucide-react';

const CATEGORIES = ['F&B', 'Fashion', 'Electronics', 'Beauty', 'Services', 'Entertainment', 'Anchor', 'Other'];
const ZONES = ['north_wing', 'south_wing', 'east_wing', 'west_wing', 'atrium', 'basement'];

export default function ShopDirectoryPage() {
  
  const propertyId = useSelectedPropertyId();

  const [filters, setFilters] = useState<{ tradeCategory?: string; shopZone?: string; isAnchor?: boolean }>({});
  const [showForm, setShowForm] = useState(false);
  const [selectedShop, setSelectedShop] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data: shopsData, isLoading } = useGetShopsQuery(
    { propertyId, ...filters },
    { skip: !propertyId }
  );
  const [upsertProfile] = useUpsertShopProfileMutation();

  const shops = shopsData?.data || [];

  const handleSave = async () => {
    if (!selectedShop) return;
    try {
      await upsertProfile({ unitId: selectedShop.unitId, data: formData }).unwrap();
      setShowForm(false);
      setSelectedShop(null);
    } catch (e) { console.error(e); }
  };

  const openShopDetail = (shop: any) => {
    setSelectedShop(shop);
    setFormData({
      shopNumber: shop.shopNumber || '',
      brandName: shop.brandName || '',
      tradeCategory: shop.tradeCategory || '',
      tradeSubcategory: shop.tradeSubcategory || '',
      franchiseGroup: shop.franchiseGroup || '',
      isAnchor: shop.isAnchor || false,
      shopZone: shop.shopZone || '',
      posSystem: shop.posSystem || '',
      posStoreId: shop.posStoreId || '',
    });
    setShowForm(true);
  };

  return (
    <div className="page-content">
      <div className="mall-page-header">
        <div>
          <h1>Shop Directory</h1>
          <p className="mall-page-subtitle">Manage shop profiles, brands, and trade categories</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mall-filter-bar">
        <select
          className="mall-filter-select"
          value={filters.tradeCategory || ''}
          onChange={e => setFilters(f => ({ ...f, tradeCategory: e.target.value || undefined }))}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="mall-filter-select"
          value={filters.shopZone || ''}
          onChange={e => setFilters(f => ({ ...f, shopZone: e.target.value || undefined }))}
        >
          <option value="">All Zones</option>
          {ZONES.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </select>
        <label className="mall-filter-check">
          <input
            type="checkbox"
            checked={filters.isAnchor || false}
            onChange={e => setFilters(f => ({ ...f, isAnchor: e.target.checked || undefined }))}
          />
          Anchor Only
        </label>
        <span className="mall-filter-count">{shopsData?.total || 0} shops</span>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} className="module-skeleton-card" />)}
        </div>
      ) : (
        <div className="mall-shop-grid">
          {shops.map((shop: any) => {
            const lease = shop.unit?.leases?.[0];
            return (
              <div
                key={shop.unitId}
                className={`mall-shop-card ${shop.isAnchor ? 'mall-shop-anchor' : ''}`}
                onClick={() => openShopDetail(shop)}
              >
                <div className="mall-shop-card-header">
                  <span className="mall-shop-number">{shop.shopNumber || shop.unit?.unitNumber}</span>
                  {shop.isAnchor && <span className="mall-anchor-badge">⭐ Anchor</span>}
                </div>
                <h4 className="mall-shop-brand">{shop.brandName || 'Unnamed'}</h4>
                <div className="mall-shop-meta">
                  {shop.tradeCategory && (
                    <span className="mall-category-tag">{shop.tradeCategory}</span>
                  )}
                  {shop.shopZone && (
                    <span className="mall-zone-tag">{shop.shopZone.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <div className="mall-shop-footer">
                  <span className={`mall-unit-status mall-unit-${shop.unit?.status}`}>
                    {shop.unit?.status}
                  </span>
                  {lease && (
                    <span className="mall-shop-rent">
                      ${Number(lease.rentAmount).toLocaleString()}/mo
                    </span>
                  )}
                </div>
                {lease && (
                  <div className="mall-shop-tenant">
                    {lease.tenant?.companyName}
                    {lease.commercialLease?.hasPercentageRent && (
                      <span className="mall-pct-badge">
                        +{(Number(lease.commercialLease.percentageRentRate) * 100).toFixed(0)}% GTO
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {shops.length === 0 && (
            <div className="mall-empty-state">
              <Store size={40} strokeWidth={1} />
              <h3>No Shop Profiles</h3>
              <p>Create shop profiles by assigning brands and categories to units</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {showForm && (
        <div className="mall-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Edit Shop Profile</h3>
              <button className="mall-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <div className="mall-form-grid">
                <label>Shop Number
                  <input value={formData.shopNumber} onChange={e => setFormData({ ...formData, shopNumber: e.target.value })} />
                </label>
                <label>Brand Name
                  <input value={formData.brandName} onChange={e => setFormData({ ...formData, brandName: e.target.value })} />
                </label>
                <label>Trade Category
                  <select value={formData.tradeCategory} onChange={e => setFormData({ ...formData, tradeCategory: e.target.value })}>
                    <option value="">Select...</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>Sub-category
                  <input value={formData.tradeSubcategory} onChange={e => setFormData({ ...formData, tradeSubcategory: e.target.value })} />
                </label>
                <label>Franchise Group
                  <input value={formData.franchiseGroup} onChange={e => setFormData({ ...formData, franchiseGroup: e.target.value })} />
                </label>
                <label>Shop Zone
                  <select value={formData.shopZone} onChange={e => setFormData({ ...formData, shopZone: e.target.value })}>
                    <option value="">Select...</option>
                    {ZONES.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label>POS System
                  <input value={formData.posSystem} onChange={e => setFormData({ ...formData, posSystem: e.target.value })} placeholder="square, lightspeed, revel..." />
                </label>
                <label>POS Store ID
                  <input value={formData.posStoreId} onChange={e => setFormData({ ...formData, posStoreId: e.target.value })} />
                </label>
                <label className="mall-form-checkbox">
                  <input type="checkbox" checked={formData.isAnchor} onChange={e => setFormData({ ...formData, isAnchor: e.target.checked })} />
                  Anchor Tenant
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
