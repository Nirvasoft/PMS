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
  Layers, ShieldCheck, Warehouse, FileText, ChevronRight, Zap,
  CircleDot, PackageOpen, PackageCheck, Gauge,
} from 'lucide-react';

const MOVEMENT_ICONS: Record<string, { icon: typeof Activity; color: string; bg: string; label: string }> = {
  receive: { icon: ArrowDownCircle, color: '#10b981', bg: 'rgba(16,185,129,0.10)', label: 'Receipt' },
  issue: { icon: ArrowUpCircle, color: '#f97316', bg: 'rgba(249,115,22,0.10)', label: 'Issue' },
  transfer: { icon: RefreshCw, color: '#6366f1', bg: 'rgba(99,102,241,0.10)', label: 'Transfer' },
  adjustment: { icon: Activity, color: '#eab308', bg: 'rgba(234,179,8,0.10)', label: 'Adjust' },
};

const PR_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  submitted: { color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  approved: { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  ordered: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
};

const CAT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899', '#8b5cf6', '#14b8a6'];

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

  const allAlerts = [...outOfStockItems, ...lowStockItems];

  // Category breakdown
  const catMap: Record<string, number> = {};
  items.forEach((item: any) => {
    const cat = item.category || 'Uncategorized';
    catMap[cat] = (catMap[cat] || 0) + 1;
  });
  const categories = Object.entries(catMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const totalItemCount = categories.reduce((s, c) => s + c.count, 0);

  // Recent movements (last 6)
  const recentMovements = movements.slice(0, 8);

  // Pending PRs
  const pendingPrs = prs.filter((pr: any) => ['draft', 'submitted'].includes(pr.status)).slice(0, 5);

  // Stock health %
  const totalStockEntries = stockLevels.length;
  const healthyStock = totalStockEntries - (stats?.lowStockCount ?? 0) - (stats?.outOfStockCount ?? 0);
  const healthPct = totalStockEntries > 0 ? Math.round((healthyStock / totalStockEntries) * 100) : 100;

  if (isLoading) {
    return (
      <div className="maint-page">
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="maint-page">
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', margin: 0,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Package size={18} color="#fff" />
            </div>
            Inventory Dashboard
          </h1>
          <p style={{ margin: '4px 0 0 46px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Stock levels, movements & procurement at a glance
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/inventory/items')}
            style={{ borderRadius: 10 }}>
            <Box size={14} /> Catalog
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/inventory/movements')}
            style={{ borderRadius: 10 }}>
            <Activity size={14} /> Movements
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/inventory/purchase-requisitions')}
            style={{ borderRadius: 10 }}>
            <ClipboardList size={14} /> New PR
          </button>
        </div>
      </div>

      {/* ── Hero Stat Cards ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14, marginBottom: 20,
      }}>
        {/* Total Items */}
        <div style={{
          borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 100%)',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ position: 'absolute', top: -8, right: -8, opacity: 0.06 }}>
            <Box size={80} strokeWidth={1} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(99,102,241,0.15)', color: '#6366f1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Box size={16} /></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Total Items
            </span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#6366f1' }}>
            {stats?.totalItems ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            across {stats?.totalStores ?? 0} store{(stats?.totalStores ?? 0) !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Inventory Value */}
        <div style={{
          borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(5,150,105,0.04) 100%)',
          border: '1px solid rgba(16,185,129,0.15)',
        }}>
          <div style={{ position: 'absolute', top: -8, right: -8, opacity: 0.06 }}>
            <DollarSign size={80} strokeWidth={1} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(16,185,129,0.15)', color: '#10b981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><DollarSign size={16} /></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Total Value
            </span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#10b981' }}>
            ${(stats?.totalValue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            inventory at cost
          </div>
        </div>

        {/* Stock Health */}
        <div style={{
          borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden',
          background: healthPct >= 80
            ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(5,150,105,0.02) 100%)'
            : healthPct >= 50
              ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(234,179,8,0.03) 100%)'
              : 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(220,38,38,0.03) 100%)',
          border: `1px solid ${healthPct >= 80 ? 'rgba(16,185,129,0.15)' : healthPct >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: healthPct >= 80 ? 'rgba(16,185,129,0.15)' : healthPct >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
              color: healthPct >= 80 ? '#10b981' : healthPct >= 50 ? '#f59e0b' : '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><ShieldCheck size={16} /></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Stock Health
            </span>
          </div>
          <div style={{
            fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em',
            color: healthPct >= 80 ? '#10b981' : healthPct >= 50 ? '#f59e0b' : '#ef4444',
          }}>
            {healthPct}%
          </div>
          {/* Mini progress bar */}
          <div style={{
            height: 4, borderRadius: 2, marginTop: 8,
            background: 'var(--surface-hover)',
          }}>
            <div style={{
              height: '100%', borderRadius: 2, transition: 'width 0.6s ease',
              width: `${healthPct}%`,
              background: healthPct >= 80 ? '#10b981' : healthPct >= 50 ? '#f59e0b' : '#ef4444',
            }} />
          </div>
        </div>

        {/* Low Stock */}
        <div style={{
          borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(234,179,8,0.03) 100%)',
          border: '1px solid rgba(245,158,11,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><TrendingDown size={16} /></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Low Stock
            </span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f59e0b' }}>
            {stats?.lowStockCount ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            items below reorder point
          </div>
        </div>

        {/* Out of Stock */}
        <div style={{
          borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden',
          background: (stats?.outOfStockCount ?? 0) > 0
            ? 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(220,38,38,0.03) 100%)'
            : 'linear-gradient(135deg, rgba(107,114,128,0.06) 0%, rgba(107,114,128,0.02) 100%)',
          border: `1px solid ${(stats?.outOfStockCount ?? 0) > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.12)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: (stats?.outOfStockCount ?? 0) > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.12)',
              color: (stats?.outOfStockCount ?? 0) > 0 ? '#ef4444' : '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><AlertTriangle size={16} /></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Out of Stock
            </span>
          </div>
          <div style={{
            fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em',
            color: (stats?.outOfStockCount ?? 0) > 0 ? '#ef4444' : 'var(--text-primary)',
          }}>
            {stats?.outOfStockCount ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {(stats?.outOfStockCount ?? 0) === 0 ? 'all items in stock ✓' : 'need immediate reorder'}
          </div>
        </div>

        {/* Movements 7d */}
        <div style={{
          borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(124,58,237,0.04) 100%)',
          border: '1px solid rgba(139,92,246,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Activity size={16} /></div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Movements (7d)
            </span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#8b5cf6' }}>
            {stats?.recentMovements ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            transactions this week
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16, 
      }}>
        {/* ─ Left Column ─ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Low Stock & Out of Stock Alerts */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: allAlerts.length > 0 ? '#f59e0b' : '#10b981',
                  display: 'inline-block',
                  boxShadow: allAlerts.length > 0 ? '0 0 8px rgba(245,158,11,0.5)' : '0 0 8px rgba(16,185,129,0.5)',
                  animation: allAlerts.length > 0 ? 'pulse 2s infinite' : 'none',
                }} />
                Stock Alerts
                {allAlerts.length > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                    background: 'rgba(245,158,11,0.12)', color: '#f59e0b', marginLeft: 4,
                  }}>{allAlerts.length}</span>
                )}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/inventory/stock')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {allAlerts.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '32px 16px', gap: 8,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'rgba(16,185,129,0.1)', color: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><PackageCheck size={22} /></div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>All stock levels healthy</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No items below reorder threshold</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {allAlerts.map((sl: any) => {
                  const isOOS = Number(sl.qtyOnHand) <= 0;
                  const qty = Number(sl.qtyOnHand);
                  const reorder = Number(sl.item?.reorderPoint || 0);
                  const pct = reorder > 0 ? Math.min((qty / reorder) * 100, 100) : 0;
                  return (
                    <div key={sl.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 4px', borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: isOOS ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color: isOOS ? '#ef4444' : '#f59e0b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isOOS ? <AlertTriangle size={14} /> : <TrendingDown size={14} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sl.item?.name || '—'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{sl.store?.name || '—'}</div>
                      </div>
                      {/* Mini gauge */}
                      <div style={{ width: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                          color: isOOS ? '#ef4444' : '#f59e0b',
                        }}>{qty}</span>
                        <div style={{
                          width: '100%', height: 3, borderRadius: 2,
                          background: 'var(--surface-hover)',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${pct}%`,
                            background: isOOS ? '#ef4444' : '#f59e0b',
                          }} />
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                        background: isOOS ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color: isOOS ? '#ef4444' : '#f59e0b',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {isOOS ? 'OUT' : `RO:${reorder}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><BarChart3 size={15} /> Items by Category</h3>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{items.length} total</span>
            </div>
            {categories.length === 0 ? (
              <div className="hk-dash-empty">
                <Layers size={20} color="var(--text-tertiary)" />
                <span>No items yet</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                {categories.map((cat, i) => {
                  const pct = totalItemCount > 0 ? Math.round((cat.count / totalItemCount) * 100) : 0;
                  const color = CAT_COLORS[i % CAT_COLORS.length];
                  return (
                    <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: 3, background: color, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 500, width: 90, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cat.name}
                      </span>
                      <div style={{
                        flex: 1, height: 6, borderRadius: 3,
                        background: 'var(--surface-hover)', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', borderRadius: 3, transition: 'width 0.8s ease',
                          width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                        }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {cat.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stores */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3><Warehouse size={15} /> Stores ({stores.length})</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/inventory/stores')}>
                Manage <ArrowRight size={12} />
              </button>
            </div>
            {stores.length === 0 ? (
              <div className="hk-dash-empty">
                <Store size={20} color="var(--text-tertiary)" />
                <span>No stores configured</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, paddingTop: 4 }}>
                {stores.slice(0, 6).map((store: any, i: number) => (
                  <div key={store.id} style={{
                    padding: '10px 12px', borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: `${CAT_COLORS[i % CAT_COLORS.length]}06`,
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'border-color 0.2s',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: `${CAT_COLORS[i % CAT_COLORS.length]}15`,
                      color: CAT_COLORS[i % CAT_COLORS.length],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><Store size={13} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {store.name}
                      </div>
                      {store.storeType && (
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                          {store.storeType}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─ Right Column ─ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {recentMovements.map((mov: any, idx: number) => {
                  const m = MOVEMENT_ICONS[mov.movementType] || MOVEMENT_ICONS.adjustment;
                  const MIcon = m.icon;
                  return (
                    <div key={mov.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 4px', borderBottom: idx < recentMovements.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: m.bg, color: m.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}><MIcon size={14} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {mov.item?.name || '—'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{
                            padding: '0 5px', borderRadius: 4,
                            background: m.bg, color: m.color,
                            fontWeight: 700, fontSize: 9, textTransform: 'uppercase',
                          }}>{m.label}</span>
                          <span>qty: {mov.qty}</span>
                          {mov.store?.name && <span>· {mov.store.name}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(mov.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Purchase Requisitions */}
          <div className="hk-dash-card">
            <div className="hk-dash-card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={15} /> Purchase Requisitions
                {pendingPrs.length > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                    background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                  }}>{pendingPrs.length}</span>
                )}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/inventory/purchase-requisitions')}>
                View All <ArrowRight size={12} />
              </button>
            </div>
            {pendingPrs.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '28px 16px', gap: 8,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: 'rgba(107,114,128,0.08)', color: 'var(--text-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><FileText size={20} /></div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>No pending requisitions</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>All PRs processed</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {pendingPrs.map((pr: any, idx: number) => {
                  const ps = PR_STATUS_STYLE[pr.status] || PR_STATUS_STYLE.draft;
                  const itemCount = Array.isArray(pr.items) ? pr.items.length : 0;
                  return (
                    <div key={pr.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 4px',
                      borderBottom: idx < pendingPrs.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: ps.bg, color: ps.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}><FileText size={14} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--surface-hover)', padding: '1px 5px', borderRadius: 4 }}>
                            {pr.prNumber}
                          </code>
                          {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          ${Number(pr.totalAmount || 0).toLocaleString()}
                          {pr.property?.name && <> · {pr.property.name}</>}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: ps.bg, color: ps.color, textTransform: 'capitalize', flexShrink: 0,
                      }}>{pr.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inventory Summary Mini Cards */}
          <div className="hk-dash-card" style={{ padding: '16px 18px' }}>
            <div className="hk-dash-card-header" style={{ marginBottom: 10 }}>
              <h3><Gauge size={15} /> Inventory Summary</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Active Items', value: stats?.totalItems ?? 0, icon: Box, color: '#6366f1' },
                { label: 'Active Stores', value: stats?.totalStores ?? 0, icon: Store, color: '#10b981' },
                { label: 'Pending PRs', value: pendingPrs.length, icon: ClipboardList, color: '#6366f1' },
                { label: 'Categories', value: categories.length, icon: Layers, color: '#8b5cf6' },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: `${item.color}12`, color: item.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}><item.icon size={13} /></div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>{item.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
