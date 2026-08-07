import '../MaintenancePage/MaintenancePage.css';
import { useNavigate } from 'react-router-dom';
import {
  useGetInventoryStatsQuery, useGetInventoryItemsQuery,
  useGetStockLevelsQuery, useGetMovementsQuery, useGetPurchaseRequisitionsQuery,
  useGetStoresQuery,
} from '../../../store/api/inventoryApi';
import {
  Package, Loader2, AlertTriangle, ArrowRight, BarChart3,
  TrendingDown, TrendingUp, Box, Store, Activity,
  ClipboardList, DollarSign, ArrowUpCircle, ArrowDownCircle, RefreshCw,
  Layers,
} from 'lucide-react';

const MOVEMENT_ICONS: Record<string, { icon: typeof Activity; color: string; bg: string }> = {
  receive: { icon: ArrowDownCircle, color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  issue: { icon: ArrowUpCircle, color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  transfer: { icon: RefreshCw, color: '#6366f1', bg: 'rgba(99,102,241,0.10)' },
  adjustment: { icon: Activity, color: '#eab308', bg: 'rgba(234,179,8,0.10)' },
};

const PR_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  submitted: { color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  approved: { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  ordered: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
};

export default function InventoryDashboard() {
  const navigate = useNavigate();

  const { data: statsResp, isLoading } = useGetInventoryStatsQuery();
  const { data: itemsResp } = useGetInventoryItemsQuery({ limit: 100 });
  const { data: stockResp } = useGetStockLevelsQuery({});
  const { data: movResp } = useGetMovementsQuery({ limit: 10 });
  const { data: prResp } = useGetPurchaseRequisitionsQuery({ limit: 10 });
  const { data: storesResp } = useGetStoresQuery({});

  const stats = statsResp?.data;
  const items = itemsResp?.data || [];
  const stockLevels = stockResp?.data || [];
  const movements = movResp?.data || [];
  const prs = prResp?.data || [];
  const stores = storesResp?.data || [];

  // Low stock items
  const lowStockItems = stockLevels.filter((sl: any) =>
    Number(sl.qtyOnHand) <= Number(sl.item?.reorderPoint) && Number(sl.qtyOnHand) > 0
  ).slice(0, 6);

  const outOfStockItems = stockLevels.filter((sl: any) =>
    Number(sl.qtyOnHand) <= 0
  ).slice(0, 4);

  // Category breakdown
  const catMap: Record<string, number> = {};
  items.forEach((item: any) => {
    const cat = item.category || 'Uncategorized';
    catMap[cat] = (catMap[cat] || 0) + 1;
  });
  const categories = Object.entries(catMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxCatCount = Math.max(...categories.map(c => c.count), 1);

  // Recent movements (last 5)
  const recentMovements = movements.slice(0, 6);

  // Pending PRs
  const pendingPrs = prs.filter((pr: any) => ['draft', 'submitted'].includes(pr.status)).slice(0, 5);

  if (isLoading) {
    return (
      <div className="maint-page">
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Package size={22} /></div>
          <div>
            <h1>Inventory Dashboard</h1>
            <p>Stock levels, movements & procurement overview</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/inventory/items')}>
            <Box size={14} /> Item Catalog
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/inventory/movements')}>
            <Activity size={14} /> Movements
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/inventory/purchase-requisitions')}>
            <ClipboardList size={14} /> Purchase Reqs
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Box size={18} /></div>
          <span className="msc-value">{stats?.totalItems ?? 0}</span>
          <span className="msc-label">Active Items</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><Store size={18} /></div>
          <span className="msc-value">{stats?.totalStores ?? 0}</span>
          <span className="msc-label">Stores</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>
            <DollarSign size={18} />
          </div>
          <span className="msc-value" style={{ fontSize: '18px' }}>
            ${(stats?.totalValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="msc-label">Total Value</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{
            background: (stats?.lowStockCount ?? 0) > 0 ? 'rgba(245,158,11,0.14)' : 'rgba(107,114,128,0.14)',
            color: (stats?.lowStockCount ?? 0) > 0 ? '#f59e0b' : '#6b7280',
          }}>
            <TrendingDown size={18} />
          </div>
          <span className="msc-value" style={{ color: (stats?.lowStockCount ?? 0) > 0 ? '#f59e0b' : undefined }}>
            {stats?.lowStockCount ?? 0}
          </span>
          <span className="msc-label">Low Stock</span>
        </div>
        <div className="maint-stat-card red">
          <div className="msc-icon"><AlertTriangle size={18} /></div>
          <span className="msc-value">{stats?.outOfStockCount ?? 0}</span>
          <span className="msc-label">Out of Stock</span>
        </div>
        <div className="maint-stat-card purple">
          <div className="msc-icon"><Activity size={18} /></div>
          <span className="msc-value">{stats?.recentMovements ?? 0}</span>
          <span className="msc-label">Movements (7d)</span>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="sec-dash-grid">
        {/* Left Column */}
        <div className="hk-dash-col">
          {/* Low Stock Alerts */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3 style={{ color: '#f59e0b' }}><TrendingDown size={15} /> Low Stock Alerts</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/inventory/stock')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {lowStockItems.length === 0 && outOfStockItems.length === 0 ? (
              <div className="hk-dash-empty">
                <TrendingUp size={24} color="#10b981" />
                <span>All items above reorder point</span>
              </div>
            ) : (
              <div className="inv-alert-list">
                {outOfStockItems.map((sl: any) => (
                  <div key={sl.id} className="inv-alert-row out-of-stock">
                    <div className="inv-alert-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                      <AlertTriangle size={13} />
                    </div>
                    <div className="inv-alert-info">
                      <span className="inv-alert-name">{sl.item?.name || '—'}</span>
                      <span className="inv-alert-store">{sl.store?.name || '—'}</span>
                    </div>
                    <span className="inv-alert-qty" style={{ color: '#ef4444' }}>0</span>
                    <span className="inv-alert-badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                      Out of Stock
                    </span>
                  </div>
                ))}
                {lowStockItems.map((sl: any) => (
                  <div key={sl.id} className="inv-alert-row low-stock">
                    <div className="inv-alert-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                      <TrendingDown size={13} />
                    </div>
                    <div className="inv-alert-info">
                      <span className="inv-alert-name">{sl.item?.name || '—'}</span>
                      <span className="inv-alert-store">{sl.store?.name || '—'}</span>
                    </div>
                    <span className="inv-alert-qty" style={{ color: '#f59e0b' }}>{Number(sl.qtyOnHand)}</span>
                    <span className="inv-alert-badge" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                      Reorder @ {Number(sl.item?.reorderPoint)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={15} /> Items by Category</h3>
              <span className="cell-secondary" style={{ fontSize: '11px' }}>{items.length} total</span>
            </div>
            {categories.length === 0 ? (
              <div className="hk-dash-empty">
                <Layers size={20} color="var(--text-tertiary)" />
                <span>No items yet</span>
              </div>
            ) : (
              <div className="sec-type-chart">
                {categories.map(cat => {
                  const pct = Math.round((cat.count / maxCatCount) * 100);
                  return (
                    <div key={cat.name} className="sec-type-row">
                      <span className="sec-type-icon">📦</span>
                      <span className="sec-type-label">{cat.name}</span>
                      <div className="sec-type-bar-track">
                        <div className="sec-type-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="sec-type-count">{cat.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stores Overview */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><Store size={15} /> Stores ({stores.length})</h3>
            </div>
            {stores.length === 0 ? (
              <div className="hk-dash-empty">
                <Store size={20} color="var(--text-tertiary)" />
                <span>No stores configured</span>
              </div>
            ) : (
              <div className="hk-zone-list">
                {stores.slice(0, 8).map((store: any) => (
                  <div key={store.id} className="hk-zone-chip">
                    <Store size={12} />
                    <span>{store.name}</span>
                    {store.storeType && (
                      <span className="hk-zone-type">{store.storeType}</span>
                    )}
                  </div>
                ))}
                {stores.length > 8 && (
                  <span className="hk-zone-more">+{stores.length - 8} more</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="hk-dash-col">
          {/* Recent Movements */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><Activity size={15} /> Recent Movements</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/inventory/movements')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {recentMovements.length === 0 ? (
              <div className="hk-dash-empty">
                <Activity size={20} color="var(--text-tertiary)" />
                <span>No movements yet</span>
              </div>
            ) : (
              <div className="sec-feed">
                {recentMovements.map((mov: any) => {
                  const m = MOVEMENT_ICONS[mov.movementType] || MOVEMENT_ICONS.adjustment;
                  const MIcon = m.icon;
                  return (
                    <div key={mov.id} className="inv-mov-row">
                      <div className="inv-mov-icon" style={{ background: m.bg, color: m.color }}>
                        <MIcon size={14} />
                      </div>
                      <div className="sec-feed-info">
                        <span className="sec-feed-title">{mov.item?.name || '—'}</span>
                        <span className="sec-feed-meta">
                          <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{mov.movementType}</span>
                          {' · '}qty: {mov.qty}
                          {mov.store?.name && <> · {mov.store.name}</>}
                        </span>
                      </div>
                      <span className="ace-time">
                        {new Date(mov.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Purchase Requisitions */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><ClipboardList size={15} /> Pending Requisitions</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/inventory/purchase-requisitions')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {pendingPrs.length === 0 ? (
              <div className="hk-dash-empty">
                <ClipboardList size={20} color="var(--text-tertiary)" />
                <span>No pending requisitions</span>
              </div>
            ) : (
              <div className="sec-feed">
                {pendingPrs.map((pr: any) => {
                  const ps = PR_STATUS_STYLE[pr.status] || PR_STATUS_STYLE.draft;
                  const itemCount = Array.isArray(pr.items) ? pr.items.length : 0;
                  return (
                    <div key={pr.id} className="inv-pr-row">
                      <div className="sec-feed-info">
                        <span className="sec-feed-title">
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-tertiary)', marginRight: '6px' }}>
                            {pr.prNumber}
                          </span>
                          {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </span>
                        <span className="sec-feed-meta">
                          ${Number(pr.totalAmount || 0).toLocaleString()}
                          {pr.property?.name && <> · {pr.property.name}</>}
                        </span>
                      </div>
                      <span className="hk-task-status" style={{ background: ps.bg, color: ps.color }}>
                        {pr.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={15} /> Quick Stats</h3>
            </div>
            <div className="hk-quick-stats">
              <div className="hk-qs-item">
                <span className="hk-qs-label">Active Items</span>
                <span className="hk-qs-value">{stats?.totalItems ?? 0}</span>
              </div>
              <div className="hk-qs-item">
                <span className="hk-qs-label">Active Stores</span>
                <span className="hk-qs-value">{stats?.totalStores ?? 0}</span>
              </div>
              <div className="hk-qs-item">
                <span className="hk-qs-label">Total Inventory Value</span>
                <span className="hk-qs-value" style={{ color: '#10b981' }}>
                  ${(stats?.totalValue ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="hk-qs-item">
                <span className="hk-qs-label">Movements (7 days)</span>
                <span className="hk-qs-value">{stats?.recentMovements ?? 0}</span>
              </div>
              <div className="hk-qs-item">
                <span className="hk-qs-label">Pending PRs</span>
                <span className="hk-qs-value">{pendingPrs.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
