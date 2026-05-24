import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetShopsQuery, useGetTenantMixQuery, useUpsertShopProfileMutation,
  useGetAvailableUnitsQuery,
} from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import {
  Store, Search, X, MapPin, Maximize2, Calendar, DollarSign,
  Star, Tag, Building2, ChevronRight, Grid3x3, List, Edit3,
  TrendingUp, Percent, ExternalLink, Package, Layers, Plus,
} from 'lucide-react';

const CATEGORIES = ['F&B', 'Fashion', 'Electronics', 'Beauty', 'Services', 'Entertainment', 'Anchor', 'Other'];
const ZONES = ['north_wing', 'south_wing', 'east_wing', 'west_wing', 'atrium', 'basement'];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  'F&B':           { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', icon: '🍽️' },
  'Fashion':       { bg: 'rgba(99, 102, 241, 0.12)', text: '#6366f1', icon: '👗' },
  'Electronics':   { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', icon: '💻' },
  'Beauty':        { bg: 'rgba(236, 72, 153, 0.12)', text: '#ec4899', icon: '💄' },
  'Services':      { bg: 'rgba(20, 184, 166, 0.12)', text: '#14b8a6', icon: '🛎️' },
  'Entertainment': { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7', icon: '🎬' },
  'Anchor':        { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', icon: '⭐' },
  'Other':         { bg: 'rgba(107, 114, 128, 0.12)', text: '#6b7280', icon: '🏪' },
};

const ZONE_LABELS: Record<string, string> = {
  north_wing: 'North Wing', south_wing: 'South Wing', east_wing: 'East Wing',
  west_wing: 'West Wing', atrium: 'Atrium', basement: 'Basement',
};

function formatZone(z: string) { return ZONE_LABELS[z] || z.replace(/_/g, ' '); }
function getCatStyle(cat: string) { return CATEGORY_COLORS[cat] || CATEGORY_COLORS['Other']; }

function daysUntil(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function ShopDirectoryPage() {
  const propertyId = useSelectedPropertyId();
  const [filters, setFilters] = useState<{ tradeCategory?: string; shopZone?: string; isAnchor?: boolean }>({});
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [detailShop, setDetailShop] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [showCreateShop, setShowCreateShop] = useState(false);
  const [createForm, setCreateForm] = useState<any>({ unitId: '', brandName: '', shopNumber: '', tradeCategory: 'Fashion', shopZone: 'atrium' });

  const { data: shopsData, isLoading } = useGetShopsQuery(
    { propertyId, ...filters },
    { skip: !propertyId }
  );
  const { data: mixData } = useGetTenantMixQuery({ propertyId }, { skip: !propertyId });
  const [upsertProfile, { isLoading: isSaving }] = useUpsertShopProfileMutation();
  const { data: availRes } = useGetAvailableUnitsQuery({ propertyId }, { skip: !propertyId || !showCreateShop });
  const availableUnits = availRes?.data || [];

  const allShops = shopsData?.data || [];
  const mix = mixData?.data;

  // Client-side search
  const shops = useMemo(() => {
    if (!search.trim()) return allShops;
    const q = search.toLowerCase();
    return allShops.filter((s: any) =>
      (s.brandName || '').toLowerCase().includes(q) ||
      (s.shopNumber || '').toLowerCase().includes(q) ||
      (s.tradeCategory || '').toLowerCase().includes(q) ||
      (s.franchiseGroup || '').toLowerCase().includes(q) ||
      (s.unit?.unitNumber || '').toLowerCase().includes(q)
    );
  }, [allShops, search]);

  const openDetail = (shop: any) => setDetailShop(shop);
  const closeDetail = () => setDetailShop(null);

  const openEdit = (shop: any) => {
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

  const handleCreateShop = async () => {
    if (!createForm.unitId) return;
    try {
      await upsertProfile({
        unitId: createForm.unitId,
        data: {
          shopNumber: createForm.shopNumber || undefined,
          brandName: createForm.brandName || undefined,
          tradeCategory: createForm.tradeCategory || undefined,
          tradeSubcategory: createForm.tradeSubcategory || undefined,
          shopZone: createForm.shopZone || undefined,
        },
      }).unwrap();
      setShowCreateShop(false);
      setCreateForm({ unitId: '', brandName: '', shopNumber: '', tradeCategory: 'Fashion', shopZone: 'atrium' });
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
    <div className="page-content">
      {/* Header */}
      <div className="shop-dir-header">
        <div className="shop-dir-title-row">
          <div>
            <h1>Shop Directory</h1>
            <p className="mall-page-subtitle">Manage shop profiles, brands, and trade categories</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateShop(true)}>
            <Plus size={16} /> Add Shop
          </button>
        </div>

        {/* Stats Bar */}
        {mix && (
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

        {/* Search & Filters */}
        <div className="shop-dir-toolbar">
          <div className="shop-dir-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search shops, brands, units..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="shop-dir-search-clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="shop-dir-filters">
            <select
              className="shop-dir-filter-select"
              value={filters.tradeCategory || ''}
              onChange={e => setFilters(f => ({ ...f, tradeCategory: e.target.value || undefined }))}
            >
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{getCatStyle(c).icon} {c}</option>)}
            </select>
            <select
              className="shop-dir-filter-select"
              value={filters.shopZone || ''}
              onChange={e => setFilters(f => ({ ...f, shopZone: e.target.value || undefined }))}
            >
              <option value="">All Zones</option>
              {ZONES.map(z => <option key={z} value={z}>{formatZone(z)}</option>)}
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

          <div className="shop-dir-view-toggle">
            <button
              className={`shop-dir-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            ><Grid3x3 size={16} /></button>
            <button
              className={`shop-dir-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            ><List size={16} /></button>
          </div>

          <span className="shop-dir-result-count">{shops.length} shops</span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} className="module-skeleton-card" />)}
        </div>
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
            return (
              <div
                key={shop.unitId}
                className={`shop-dir-card ${shop.isAnchor ? 'shop-dir-card-anchor' : ''}`}
                onClick={() => openDetail(shop)}
              >
                {/* Card Top Banner */}
                <div className="shop-dir-card-banner" style={{ background: cat.bg }}>
                  <span className="shop-dir-card-cat-icon">{cat.icon}</span>
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
                      <Tag size={10} /> {shop.tradeCategory}
                    </span>
                    {shop.shopZone && (
                      <span className="shop-dir-tag shop-dir-tag-zone">
                        <MapPin size={10} /> {formatZone(shop.shopZone)}
                      </span>
                    )}
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
            <span>Zone</span>
            <span>Area</span>
            <span>Status</span>
            <span>Rent</span>
            <span></span>
          </div>
          {shops.map((shop: any) => {
            const lease = shop.unit?.leases?.[0];
            const cat = getCatStyle(shop.tradeCategory || 'Other');
            return (
              <div key={shop.unitId} className="shop-dir-list-row" onClick={() => openDetail(shop)}>
                <div className="shop-dir-list-brand">
                  <span className="shop-dir-list-icon" style={{ background: cat.bg, color: cat.text }}>
                    {cat.icon}
                  </span>
                  <div>
                    <strong>{shop.brandName || 'Unnamed'}</strong>
                    <small>{shop.shopNumber || shop.unit?.unitNumber}</small>
                  </div>
                  {shop.isAnchor && <Star size={14} className="shop-dir-list-anchor" />}
                </div>
                <span className="shop-dir-tag" style={{ background: cat.bg, color: cat.text }}>
                  {shop.tradeCategory}
                </span>
                <span className="shop-dir-list-zone">{shop.shopZone ? formatZone(shop.shopZone) : '—'}</span>
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
        <div className="shop-detail-overlay" onClick={closeDetail}>
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
                <button className="btn btn-sm btn-outline" onClick={() => openEdit(detailShop)}>
                  <Edit3 size={14} /> Edit
                </button>
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
                <Tag size={10} /> {detailShop.tradeCategory}
              </span>
              {detailShop.shopZone && (
                <span className="shop-dir-tag shop-dir-tag-zone">
                  <MapPin size={10} /> {formatZone(detailShop.shopZone)}
                </span>
              )}
            </div>

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
        <div className="mall-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="shop-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <div>
                <h3>Edit Shop Profile</h3>
                <span className="shop-edit-unit-label">{detailShop?.shopNumber || detailShop?.unit?.unitNumber}</span>
              </div>
              <button className="mall-modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>

            <div className="shop-edit-body">
              {/* Section: Identity */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Store size={14} /> Shop Identity</h4>
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
                    <span>Franchise Group</span>
                    <input value={formData.franchiseGroup} onChange={e => setFormData({ ...formData, franchiseGroup: e.target.value })} placeholder="e.g., H&M Group" />
                  </label>
                  <label className="shop-edit-field shop-edit-checkbox">
                    <input type="checkbox" checked={formData.isAnchor} onChange={e => setFormData({ ...formData, isAnchor: e.target.checked })} />
                    <Star size={14} /> Anchor Tenant
                  </label>
                </div>
              </div>

              {/* Section: Classification */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Tag size={14} /> Classification</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>Trade Category</span>
                    <select value={formData.tradeCategory} onChange={e => setFormData({ ...formData, tradeCategory: e.target.value })}>
                      <option value="">Select category...</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{getCatStyle(c).icon} {c}</option>)}
                    </select>
                  </label>
                  <label className="shop-edit-field">
                    <span>Sub-category</span>
                    <input value={formData.tradeSubcategory} onChange={e => setFormData({ ...formData, tradeSubcategory: e.target.value })} placeholder="e.g., Coffee, Sportswear" />
                  </label>
                  <label className="shop-edit-field">
                    <span>Shop Zone</span>
                    <select value={formData.shopZone} onChange={e => setFormData({ ...formData, shopZone: e.target.value })}>
                      <option value="">Select zone...</option>
                      {ZONES.map(z => <option key={z} value={z}>{formatZone(z)}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              {/* Section: POS */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><ExternalLink size={14} /> POS Integration</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>POS System</span>
                    <input value={formData.posSystem} onChange={e => setFormData({ ...formData, posSystem: e.target.value })} placeholder="e.g., square, lightspeed" />
                  </label>
                  <label className="shop-edit-field">
                    <span>POS Store ID</span>
                    <input value={formData.posStoreId} onChange={e => setFormData({ ...formData, posStoreId: e.target.value })} placeholder="e.g., POS-001" />
                  </label>
                </div>
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

      {/* ── Create Shop Modal ── */}
      {showCreateShop && createPortal(
        <div className="mall-modal-overlay" onClick={() => setShowCreateShop(false)}>
          <div className="mall-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <div>
                <h3>Add New Shop</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Assign a shop profile to an available unit
                </span>
              </div>
              <button className="mall-modal-close" onClick={() => setShowCreateShop(false)}>✕</button>
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
                    <span>Select Unit *</span>
                    <select
                      value={createForm.unitId}
                      onChange={e => setCreateForm({ ...createForm, unitId: e.target.value, shopNumber: e.target.value ? availableUnits.find((u: any) => u.id === e.target.value)?.unitNumber || '' : '' })}
                    >
                      <option value="">Choose a unit...</option>
                      {availableUnits.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.unitNumber} — {u.floorLabel || `Floor ${u.floorNumber}`} — {Number(u.areaSqft || 0).toLocaleString()} sqft ({u.status})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Shop Number</span>
                    <input value={createForm.shopNumber} onChange={e => setCreateForm({ ...createForm, shopNumber: e.target.value })} placeholder="Auto from unit" />
                  </label>
                  <label>
                    <span>Brand Name</span>
                    <input value={createForm.brandName} onChange={e => setCreateForm({ ...createForm, brandName: e.target.value })} placeholder="e.g. Starbucks" />
                  </label>
                  <label>
                    <span>Trade Category</span>
                    <select value={createForm.tradeCategory} onChange={e => setCreateForm({ ...createForm, tradeCategory: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{getCatStyle(c).icon} {c}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Sub-Category</span>
                    <input value={createForm.tradeSubcategory || ''} onChange={e => setCreateForm({ ...createForm, tradeSubcategory: e.target.value })} placeholder="e.g. Coffee" />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    <span>Shop Zone</span>
                    <select value={createForm.shopZone} onChange={e => setCreateForm({ ...createForm, shopZone: e.target.value })}>
                      {ZONES.map(z => <option key={z} value={z}>{formatZone(z)}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreateShop(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCreateShop}
                disabled={!createForm.unitId || isSaving}
              >
                {isSaving ? 'Creating...' : '+ Create Shop'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
