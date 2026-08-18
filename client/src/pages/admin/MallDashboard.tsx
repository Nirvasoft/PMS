import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetMallDashboardQuery, useGetTenantMixQuery,
  useGetMallPropertyQuery, useUpsertMallPropertyMutation,
} from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import {
  Store, TrendingUp, DollarSign, Radio, Calendar, Users, BarChart3,
  Settings, X, Building2, Percent, Hash, Maximize2,
} from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

export default function MallDashboard() {
  const propertyId = useSelectedPropertyId();

  const { data: dashData, isLoading } = useGetMallDashboardQuery(
    { propertyId },
    { skip: !propertyId }
  );
  const { data: mixData } = useGetTenantMixQuery(
    { propertyId },
    { skip: !propertyId }
  );

  const dash = dashData?.data;
  const mix = mixData?.data;
  const gto = dash?.gtoSummary;

  // Mall Property Config
  const { data: configData, refetch: refetchConfig } = useGetMallPropertyQuery(
    { propertyId }, { skip: !propertyId }
  );
  const [upsertConfig, { isLoading: isSavingConfig }] = useUpsertMallPropertyMutation();
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState<any>({});

  const MALL_TYPES = [
    { value: 'regional', label: 'Regional Mall' },
    { value: 'community', label: 'Community Mall' },
    { value: 'neighborhood', label: 'Neighborhood Center' },
    { value: 'power_center', label: 'Power Center' },
    { value: 'lifestyle', label: 'Lifestyle Center' },
    { value: 'outlet', label: 'Outlet Mall' },
    { value: 'mixed_use', label: 'Mixed-Use Development' },
  ];
  const CAM_POOL_TYPES = [
    { value: 'shared', label: 'Shared Pool (proportionate GLA split)' },
    { value: 'per_category', label: 'Per Category (separate pools by cost type)' },
    { value: 'fixed_rate', label: 'Fixed Rate (per sqft rate per lease)' },
  ];
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const openConfig = () => {
    const cfg = configData?.data || {};
    setConfigForm({
      mallType: cfg.mallType || '',
      totalGlaSqft: cfg.totalGlaSqft ?? '',
      totalNlaSqft: cfg.totalNlaSqft ?? '',
      totalFloors: cfg.totalFloors ?? '',
      totalShops: cfg.totalShops ?? 0,
      anchorTenantSlots: cfg.anchorTenantSlots ?? 0,
      managementFeePct: cfg.managementFeePct ? (Number(cfg.managementFeePct) * 100).toFixed(2) : '5.00',
      camPoolType: cfg.camPoolType || 'shared',
      camAdminFeePct: cfg.camAdminFeePct ? (Number(cfg.camAdminFeePct) * 100).toFixed(2) : '10.00',
      fiscalYearStart: cfg.fiscalYearStart ?? 1,
    });
    setShowConfig(true);
  };

  const handleSaveConfig = async () => {
    try {
      await upsertConfig({
        propertyId,
        data: {
          mallType: configForm.mallType || null,
          totalGlaSqft: configForm.totalGlaSqft ? Number(configForm.totalGlaSqft) : null,
          totalNlaSqft: configForm.totalNlaSqft ? Number(configForm.totalNlaSqft) : null,
          totalFloors: configForm.totalFloors ? Number(configForm.totalFloors) : null,
          totalShops: Number(configForm.totalShops) || 0,
          anchorTenantSlots: Number(configForm.anchorTenantSlots) || 0,
          managementFeePct: Number(configForm.managementFeePct) / 100,
          camPoolType: configForm.camPoolType,
          camAdminFeePct: Number(configForm.camAdminFeePct) / 100,
          fiscalYearStart: Number(configForm.fiscalYearStart),
        },
      }).unwrap();
      setShowConfig(false);
      refetchConfig();
    } catch (e) { console.error(e); }
  };

  if (!propertyId) {
    return (
      <div className="page-content">
        <div className="mall-empty-state">
          <span className="mall-empty-icon">🏬</span>
          <h3>Select a Property</h3>
          <p>Choose a property from the sidebar to view mall dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="mall-page-header">
        <div>
          <h1>Mall Dashboard</h1>
          <p className="mall-page-subtitle">Overview of mall operations and performance</p>
        </div>
        <button className="btn btn-outline" onClick={openConfig} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Settings size={16} /> Mall Settings
        </button>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3,4].map(i => <div key={i} className="module-skeleton-card" />)}
          <div className="module-skeleton-card module-skeleton-wide" />
          <div className="module-skeleton-card module-skeleton-wide" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="mall-kpi-grid">
            <div className="mall-kpi-card">
              <div className="mall-kpi-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                <Store size={22} color="white" />
              </div>
              <div className="mall-kpi-content">
                <span className="mall-kpi-label">Total Shops</span>
                <span className="mall-kpi-value">{mix?.totalShops || 0}</span>
              </div>
            </div>

            <div className="mall-kpi-card">
              <div className="mall-kpi-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <TrendingUp size={22} color="white" />
              </div>
              <div className="mall-kpi-content">
                <span className="mall-kpi-label">Occupancy Rate</span>
                <span className="mall-kpi-value">{(mix?.occupancyRate || 0).toFixed(1)}%</span>
              </div>
            </div>

            <div className="mall-kpi-card">
              <div className="mall-kpi-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <DollarSign size={22} color="white" />
              </div>
              <div className="mall-kpi-content">
                <span className="mall-kpi-label">GTO This Month</span>
                <span className="mall-kpi-value">${((gto?.totalGto || 0) / 1000).toFixed(0)}K</span>
              </div>
            </div>

            <div className="mall-kpi-card">
              <div className="mall-kpi-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #db2777)' }}>
                <Radio size={22} color="white" />
              </div>
              <div className="mall-kpi-content">
                <span className="mall-kpi-label">Active Sensors</span>
                <span className="mall-kpi-value">{dash?.activeSensors || 0}</span>
              </div>
            </div>
          </div>

          {/* Main Grid: Tenant Mix + GTO Summary */}
          <div className="mall-dashboard-grid">
            {/* Tenant Mix */}
            <div className="mall-card module-animate-in">
              <div className="mall-card-header">
                <h3><BarChart3 size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />Tenant Mix</h3>
                <span className="mall-card-badge">{mix?.totalShops || 0} shops</span>
              </div>
              <div className="mall-card-body">
                {mix?.byCategory?.length > 0 ? (
                  <>
                    <div className="mall-mix-chart">
                      {mix.byCategory.slice(0, 6).map((cat: any, i: number) => (
                        <div key={cat.category} className="mall-mix-bar-row">
                          <span className="mall-mix-label">{cat.category}</span>
                          <div className="mall-mix-bar-wrap">
                            <div
                              className="mall-mix-bar"
                              style={{
                                width: `${cat.pct}%`,
                                background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}, ${COLORS[i % COLORS.length]}aa)`,
                              }}
                            />
                          </div>
                          <span className="mall-mix-pct">{cat.pct}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="mall-mix-footer">
                      <span>Total GLA: {(mix.totalGlaSqft || 0).toLocaleString()} sq ft</span>
                    </div>
                  </>
                ) : (
                  <div className="module-empty-inline">
                    <BarChart3 size={32} strokeWidth={1} />
                    <p>No shop profiles configured yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* GTO Summary */}
            <div className="mall-card module-animate-in" style={{ animationDelay: '0.05s' }}>
              <div className="mall-card-header">
                <h3><DollarSign size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />GTO Summary</h3>
                <span className="mall-card-badge">
                  {MONTH_NAMES[(gto?.month || 1) - 1]} {gto?.year}
                </span>
              </div>
              <div className="mall-card-body">
                <div className="mall-gto-stats">
                  <div className="mall-gto-stat">
                    <span className="mall-gto-stat-label">Submissions</span>
                    <span className="mall-gto-stat-value">
                      {gto?.submitted || 0} / {gto?.totalShopsRequired || 0}
                    </span>
                    <div className="mall-progress-bar">
                      <div
                        className="mall-progress-fill"
                        style={{
                          width: `${gto?.totalShopsRequired ? (gto.submitted / gto.totalShopsRequired) * 100 : 0}%`,
                          background: gto?.pending > 0 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #10b981, #34d399)',
                        }}
                      />
                    </div>
                  </div>
                  <div className="module-stat-row">
                    <div className="mall-gto-stat">
                      <span className="mall-gto-stat-label">Total GTO</span>
                      <span className="mall-gto-stat-value">${(gto?.totalGto || 0).toLocaleString()}</span>
                    </div>
                    <div className="mall-gto-stat">
                      <span className="mall-gto-stat-label">Base Rent</span>
                      <span className="mall-gto-stat-value">${(gto?.totalBaseRent || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mall-gto-stat">
                    <span className="mall-gto-stat-label">Percentage Rent</span>
                    <span className="mall-gto-stat-value mall-gto-pct-rent">
                      +${(gto?.totalPercentageRent || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CAM Status */}
            <div className="mall-card module-animate-in" style={{ animationDelay: '0.1s' }}>
              <div className="mall-card-header">
                <h3><Users size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />CAM Pools</h3>
                <span className="mall-card-badge">{dash?.activeCamPools || 0} active</span>
              </div>
              <div className="mall-card-body">
                {dash?.activeCamPools ? (
                  <div className="module-info-highlight">
                    <span className="module-info-number">{dash.activeCamPools}</span>
                    <span className="module-info-text">active cost pools for {new Date().getFullYear()}</span>
                  </div>
                ) : (
                  <div className="module-empty-inline">
                    <Users size={32} strokeWidth={1} />
                    <p>No CAM pools configured</p>
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="mall-card module-animate-in" style={{ animationDelay: '0.15s' }}>
              <div className="mall-card-header">
                <h3><Calendar size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />Upcoming Events</h3>
              </div>
              <div className="mall-card-body">
                {dash?.upcomingEvents?.length > 0 ? (
                  <div className="mall-events-list">
                    {dash.upcomingEvents.map((ev: any) => (
                      <div key={ev.id} className="mall-event-item">
                        <div className="mall-event-date">
                          <span className="mall-event-day">
                            {new Date(ev.startDate).getDate()}
                          </span>
                          <span className="mall-event-month">
                            {MONTH_NAMES[new Date(ev.startDate).getMonth()]}
                          </span>
                        </div>
                        <div className="mall-event-info">
                          <span className="mall-event-title">{ev.title}</span>
                          <span className="mall-event-meta">
                            {ev.venue || 'TBD'} · {ev.eventType}
                          </span>
                        </div>
                        <span className={`mall-status-badge mall-status-${ev.status}`}>
                          {ev.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="module-empty-inline">
                    <Calendar size={32} strokeWidth={1} />
                    <p>No upcoming events</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Anchor Tenants */}
          {mix?.anchorTenants?.length > 0 && (
            <div className="mall-card module-animate-in" style={{ marginTop: 20, animationDelay: '0.2s' }}>
              <div className="mall-card-header">
                <h3>⭐ Anchor Tenants</h3>
                <span className="mall-card-badge">{mix.anchorTenants.length} anchors</span>
              </div>
              <div className="mall-card-body">
                <div className="mall-anchor-grid">
                  {mix.anchorTenants.map((a: any, i: number) => (
                    <div key={i} className="mall-anchor-chip">
                      <span className="mall-anchor-name">{a.brandName}</span>
                      <span className="mall-anchor-meta">
                        {a.glaSqft?.toLocaleString()} sqft · {a.zone}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Mall Property Config Modal ── */}
      {showConfig && createPortal(
        <div className="mall-modal-overlay">
          <div className="shop-edit-modal shop-lease-modal" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <div>
                <h3>Mall Property Settings</h3>
                <span className="shop-edit-unit-label">Configure mall-specific parameters for this property</span>
              </div>
              <button className="mall-modal-close" onClick={() => setShowConfig(false)}><X size={18} /></button>
            </div>

            <div className="shop-edit-body">
              {/* General Info */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Building2 size={14} /> General Information</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>Mall Type</span>
                    <select value={configForm.mallType} onChange={e => setConfigForm({ ...configForm, mallType: e.target.value })}>
                      <option value="">Select mall type...</option>
                      {MALL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="shop-edit-field">
                    <span>Fiscal Year Starts</span>
                    <select value={configForm.fiscalYearStart} onChange={e => setConfigForm({ ...configForm, fiscalYearStart: e.target.value })}>
                      {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              {/* Area & Capacity */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Maximize2 size={14} /> Area & Capacity</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>Total GLA (sqft)</span>
                    <input type="number" min="0" step="0.01" value={configForm.totalGlaSqft} onChange={e => setConfigForm({ ...configForm, totalGlaSqft: e.target.value })} placeholder="Gross Leasable Area" />
                  </label>
                  <label className="shop-edit-field">
                    <span>Total NLA (sqft)</span>
                    <input type="number" min="0" step="0.01" value={configForm.totalNlaSqft} onChange={e => setConfigForm({ ...configForm, totalNlaSqft: e.target.value })} placeholder="Net Leasable Area" />
                  </label>
                  <label className="shop-edit-field">
                    <span>Total Floors</span>
                    <input type="number" min="1" max="200" value={configForm.totalFloors} onChange={e => setConfigForm({ ...configForm, totalFloors: e.target.value })} placeholder="e.g. 5" />
                  </label>
                  <label className="shop-edit-field">
                    <span>Total Shop Slots</span>
                    <input type="number" min="0" value={configForm.totalShops} onChange={e => setConfigForm({ ...configForm, totalShops: e.target.value })} />
                  </label>
                  <label className="shop-edit-field">
                    <span>Anchor Tenant Slots</span>
                    <input type="number" min="0" value={configForm.anchorTenantSlots} onChange={e => setConfigForm({ ...configForm, anchorTenantSlots: e.target.value })} />
                  </label>
                </div>
              </div>

              {/* Fee Structure */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Percent size={14} /> Fee Structure</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field">
                    <span>Management Fee (%)</span>
                    <input type="number" min="0" max="100" step="0.01" value={configForm.managementFeePct} onChange={e => setConfigForm({ ...configForm, managementFeePct: e.target.value })} placeholder="e.g. 5.00" />
                  </label>
                  <label className="shop-edit-field">
                    <span>CAM Admin Fee (%)</span>
                    <input type="number" min="0" max="100" step="0.01" value={configForm.camAdminFeePct} onChange={e => setConfigForm({ ...configForm, camAdminFeePct: e.target.value })} placeholder="e.g. 10.00" />
                  </label>
                </div>
              </div>

              {/* CAM Pool Configuration */}
              <div className="shop-edit-section">
                <h4 className="shop-edit-section-title"><Hash size={14} /> CAM Pool Configuration</h4>
                <div className="shop-edit-grid">
                  <label className="shop-edit-field" style={{ gridColumn: '1 / -1' }}>
                    <span>Pool Allocation Type</span>
                    <select value={configForm.camPoolType} onChange={e => setConfigForm({ ...configForm, camPoolType: e.target.value })}>
                      {CAM_POOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mall-config-hint" style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(99, 102, 241, 0.06)', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {configForm.camPoolType === 'shared' && '💡 Shared Pool: All CAM costs are pooled and allocated proportionally by GLA across all tenants.'}
                  {configForm.camPoolType === 'per_category' && '💡 Per Category: Separate cost pools for cleaning, security, landscaping, etc. — each allocated independently.'}
                  {configForm.camPoolType === 'fixed_rate' && '💡 Fixed Rate: Each lease specifies a fixed CAM rate per sqft, billed directly without pooling.'}
                </div>
              </div>
            </div>

            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowConfig(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveConfig} disabled={isSavingConfig}>
                {isSavingConfig ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
