import React from 'react';
import { useGetMallDashboardQuery, useGetTenantMixQuery } from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Store, TrendingUp, DollarSign, Radio, Calendar, Users, BarChart3 } from 'lucide-react';

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
    </div>
  );
}
