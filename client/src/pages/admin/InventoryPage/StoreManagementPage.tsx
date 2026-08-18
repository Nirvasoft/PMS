import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useGetStoresQuery, useCreateStoreMutation, useUpdateStoreMutation, useGetStockLevelsQuery } from '../../../store/api/inventoryApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Store, Plus, Loader2, Inbox, XCircle, Building2, Package, Box,
  MapPin, Edit3, ToggleLeft, ToggleRight, Search, Warehouse,
  DollarSign, BarChart3, ChevronRight, ArrowUpDown, Filter,
  Layers, ShieldCheck, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STORE_COLORS = [
  { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.18)', icon: '#6366f1', accent: '#6366f1' },
  { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)', icon: '#10b981', accent: '#10b981' },
  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)', icon: '#f59e0b', accent: '#f59e0b' },
  { bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.18)', icon: '#ec4899', accent: '#ec4899' },
  { bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.18)', icon: '#0ea5e9', accent: '#0ea5e9' },
  { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.18)', icon: '#8b5cf6', accent: '#8b5cf6' },
];

export default function StoreManagementPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editStore, setEditStore] = useState<any>(null);
  const [filterProperty, setFilterProperty] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'items' | 'value'>('name');

  const { data: storesData, isLoading } = useGetStoresQuery({ propertyId: filterProperty || undefined });
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: stockData } = useGetStockLevelsQuery({});
  const [createStore, { isLoading: creating }] = useCreateStoreMutation();
  const [updateStore, { isLoading: updating }] = useUpdateStoreMutation();

  const stores = storesData?.data || [];
  const properties = propsData?.data || [];
  const stockLevels = stockData?.data || [];

  // Group stock by store for counts
  const storeStockMap: Record<string, { items: number; value: number }> = {};
  stockLevels.forEach((sl: any) => {
    if (!storeStockMap[sl.storeId]) storeStockMap[sl.storeId] = { items: 0, value: 0 };
    storeStockMap[sl.storeId].items += 1;
    storeStockMap[sl.storeId].value += Number(sl.qtyOnHand) * Number(sl.item?.unitCost || 0);
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createStore({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        location: fd.get('location') || undefined,
        storeType: fd.get('storeType') || undefined,
      }).unwrap();
      toast.success('Store created successfully');
      setShowCreate(false);
    } catch { toast.error('Failed to create store'); }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editStore) return;
    const fd = new FormData(e.currentTarget);
    try {
      await updateStore({
        id: editStore.id,
        name: fd.get('name') as string,
        location: fd.get('location') as string || undefined,
        storeType: fd.get('storeType') as string || undefined,
        isActive: fd.get('isActive') === 'true',
      }).unwrap();
      toast.success('Store updated');
      setEditStore(null);
    } catch { toast.error('Failed to update store'); }
  };

  // Filter & search
  const filtered = stores.filter((s: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.location?.toLowerCase().includes(q);
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a: any, b: any) => {
    if (sortBy === 'items') return (storeStockMap[b.id]?.items || 0) - (storeStockMap[a.id]?.items || 0);
    if (sortBy === 'value') return (storeStockMap[b.id]?.value || 0) - (storeStockMap[a.id]?.value || 0);
    return (a.name || '').localeCompare(b.name || '');
  });

  // Group by property
  const grouped = sorted.reduce((acc: Record<string, { property: any; stores: any[] }>, s: any) => {
    const pId = s.propertyId || 'unknown';
    const pName = s.property?.name || 'Unknown Property';
    if (!acc[pId]) acc[pId] = { property: { id: pId, name: pName }, stores: [] };
    acc[pId].stores.push(s);
    return acc;
  }, {});

  const totalValue = Object.values(storeStockMap).reduce((s, v) => s + v.value, 0);
  const activeStores = stores.filter((s: any) => s.isActive !== false).length;

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
              <Warehouse size={18} color="#fff" />
            </div>
            Store Management
          </h1>
          <p style={{ margin: '4px 0 0 46px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {stores.length} store{stores.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} propert{Object.keys(grouped).length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ borderRadius: 10 }}>
          <Plus size={14} /> New Store
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <div style={{
          borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ position: 'absolute', top: -6, right: -6, opacity: 0.05 }}><Warehouse size={64} strokeWidth={1} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Store size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Stores</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#6366f1' }}>{stores.length}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{activeStores} active</div>
        </div>

        <div style={{
          borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(6,182,212,0.04))',
          border: '1px solid rgba(14,165,233,0.15)',
        }}>
          <div style={{ position: 'absolute', top: -6, right: -6, opacity: 0.05 }}><Package size={64} strokeWidth={1} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(14,165,233,0.15)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Stock Entries</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#0ea5e9' }}>{stockLevels.length}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>across all stores</div>
        </div>

        <div style={{
          borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))',
          border: '1px solid rgba(16,185,129,0.15)',
        }}>
          <div style={{ position: 'absolute', top: -6, right: -6, opacity: 0.05 }}><DollarSign size={64} strokeWidth={1} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Value</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#10b981' }}>
            ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>inventory at cost</div>
        </div>

        <div style={{
          borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(124,58,237,0.04))',
          border: '1px solid rgba(139,92,246,0.15)',
        }}>
          <div style={{ position: 'absolute', top: -6, right: -6, opacity: 0.05 }}><Layers size={64} strokeWidth={1} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Properties</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#8b5cf6' }}>{Object.keys(grouped).length}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>with stores</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <div style={{
          flex: 1, minWidth: 200, maxWidth: 320, position: 'relative',
        }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text" placeholder="Search stores..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10,
              border: '1px solid var(--border-subtle)', background: 'var(--surface)',
              fontSize: 13, color: 'var(--text-primary)',
              outline: 'none', transition: 'border-color 0.2s',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-tertiary)' }} />
          <select className="filter-select" value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            style={{ borderRadius: 10, fontSize: 12, padding: '7px 28px 7px 10px' }}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowUpDown size={13} style={{ color: 'var(--text-tertiary)' }} />
          <select className="filter-select" value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ borderRadius: 10, fontSize: 12, padding: '7px 28px 7px 10px' }}>
            <option value="name">Sort by Name</option>
            <option value="items">Sort by Items</option>
            <option value="value">Sort by Value</option>
          </select>
        </div>
      </div>

      {/* ── Store Cards Grouped by Property ── */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading stores...</div>
      ) : sorted.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 20px', gap: 12,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(107,114,128,0.08)', color: 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Warehouse size={28} /></div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {searchTerm ? 'No stores match your search' : 'No stores configured'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {searchTerm ? 'Try adjusting your search or filter' : 'Create storage locations to track inventory'}
          </span>
          {!searchTerm && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ marginTop: 8, borderRadius: 10 }}>
              <Plus size={14} /> Create First Store
            </button>
          )}
        </div>
      ) : (
        Object.entries(grouped).map(([propId, group]) => (
          <div key={propId} style={{ marginBottom: 24 }}>
            {/* Property Group Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              padding: '8px 14px', borderRadius: 10,
              background: 'var(--surface-hover)',
            }}>
              <Building2 size={14} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                {(group as any).property.name}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 8,
                background: 'rgba(99,102,241,0.1)', color: '#6366f1',
              }}>
                {(group as any).stores.length} store{(group as any).stores.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Store Cards Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
            }}>
              {((group as any).stores as any[]).map((store: any, idx: number) => {
                const info = storeStockMap[store.id] || { items: 0, value: 0 };
                const colorSet = STORE_COLORS[idx % STORE_COLORS.length];
                const isActive = store.isActive !== false;
                const maxVal = Math.max(...Object.values(storeStockMap).map(v => v.value), 1);
                const valuePct = maxVal > 0 ? Math.round((info.value / maxVal) * 100) : 0;

                return (
                  <div key={store.id} style={{
                    borderRadius: 14, padding: '18px 20px', position: 'relative',
                    background: colorSet.bg,
                    border: `1px solid ${colorSet.border}`,
                    transition: 'all 0.2s',
                    opacity: isActive ? 1 : 0.6,
                    cursor: 'pointer',
                  }}
                    onClick={() => setEditStore(store)}
                  >
                    {/* Top Row: Icon + Name + Status */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                        background: `${colorSet.accent}15`, color: colorSet.icon,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${colorSet.accent}20`,
                      }}>
                        <Warehouse size={20} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {store.name}
                        </div>
                        {store.location && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2,
                          }}>
                            <MapPin size={10} /> {store.location}
                          </div>
                        )}
                        {store.storeType && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1,
                            textTransform: 'capitalize',
                          }}>
                            <Layers size={9} /> {store.storeType}
                          </div>
                        )}
                      </div>
                      <div style={{
                        fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                        color: isActive ? '#10b981' : '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {isActive ? 'Active' : 'Inactive'}
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div style={{
                      display: 'flex', gap: 0,
                      borderTop: `1px solid ${colorSet.accent}12`,
                      paddingTop: 12,
                    }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: colorSet.icon, letterSpacing: '-0.02em' }}>
                          {info.items}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Items
                        </div>
                      </div>
                      <div style={{
                        width: 1, background: `${colorSet.accent}15`, margin: '0 8px',
                      }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em' }}>
                          ${info.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Value
                        </div>
                      </div>
                    </div>

                    {/* Value proportion bar */}
                    {info.value > 0 && (
                      <div style={{
                        height: 3, borderRadius: 2, marginTop: 10,
                        background: `${colorSet.accent}10`,
                      }}>
                        <div style={{
                          height: '100%', borderRadius: 2, transition: 'width 0.8s ease',
                          width: `${valuePct}%`,
                          background: `linear-gradient(90deg, ${colorSet.accent}, ${colorSet.accent}aa)`,
                        }} />
                      </div>
                    )}

                    {/* Edit indicator */}
                    <div style={{
                      position: 'absolute', top: 14, right: 14, opacity: 0,
                      transition: 'opacity 0.2s',
                    }} className="store-edit-hint">
                      <Edit3 size={12} style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* ── Create Store Modal ── */}
      {showCreate && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '480px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Warehouse size={16} color="#fff" />
                </div>
                New Store
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div className="form-group"><label>Property *</label>
                  <select name="propertyId" required style={{ borderRadius: 10 }}>
                    <option value="">Select property...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Store Name *</label>
                  <input name="name" required placeholder="e.g. Main Warehouse, Floor 3 Supply Room"
                    style={{ borderRadius: 10 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Store Type</label>
                    <select name="storeType" style={{ borderRadius: 10 }}>
                      <option value="">Select type...</option>
                      <option value="warehouse">Warehouse</option>
                      <option value="supply_room">Supply Room</option>
                      <option value="tool_crib">Tool Crib</option>
                      <option value="mobile">Mobile Store</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Location</label>
                    <input name="location" placeholder="Building A, Level B1" style={{ borderRadius: 10 }} />
                  </div>
                </div>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}
                  style={{ borderRadius: 10 }}>
                  {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Create Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Store Modal ── */}
      {editStore && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '480px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Edit3 size={16} color="#fff" />
                </div>
                Edit Store
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditStore(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                {/* Store info header */}
                <div style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 16,
                  background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Building2 size={14} style={{ color: '#6366f1' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {editStore.property?.name || 'Unknown Property'}
                  </span>
                </div>

                <div className="form-group"><label>Store Name *</label>
                  <input name="name" required defaultValue={editStore.name} style={{ borderRadius: 10 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Store Type</label>
                    <select name="storeType" defaultValue={editStore.storeType || ''} style={{ borderRadius: 10 }}>
                      <option value="">Select type...</option>
                      <option value="warehouse">Warehouse</option>
                      <option value="supply_room">Supply Room</option>
                      <option value="tool_crib">Tool Crib</option>
                      <option value="mobile">Mobile Store</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Location</label>
                    <input name="location" defaultValue={editStore.location || ''} placeholder="Building A, Level B1"
                      style={{ borderRadius: 10 }} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <label style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer',
                      border: '1px solid', transition: 'all 0.2s',
                      borderColor: editStore.isActive !== false ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)',
                      background: editStore.isActive !== false ? 'rgba(16,185,129,0.06)' : 'transparent',
                    }}>
                      <input type="radio" name="isActive" value="true"
                        defaultChecked={editStore.isActive !== false}
                        style={{ accentColor: '#10b981' }} />
                      <ShieldCheck size={14} style={{ color: '#10b981' }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Active</span>
                    </label>
                    <label style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer',
                      border: '1px solid', transition: 'all 0.2s',
                      borderColor: editStore.isActive === false ? 'rgba(107,114,128,0.3)' : 'var(--border-subtle)',
                      background: editStore.isActive === false ? 'rgba(107,114,128,0.06)' : 'transparent',
                    }}>
                      <input type="radio" name="isActive" value="false"
                        defaultChecked={editStore.isActive === false}
                        style={{ accentColor: '#6b7280' }} />
                      <Clock size={14} style={{ color: '#6b7280' }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Inactive</span>
                    </label>
                  </div>
                </div>

                {/* Quick stats in edit modal */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8,
                }}>
                  <div style={{
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <Package size={14} style={{ color: '#0ea5e9' }} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{storeStockMap[editStore.id]?.items || 0}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Items</div>
                    </div>
                  </div>
                  <div style={{
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <DollarSign size={14} style={{ color: '#10b981' }} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>
                        ${(storeStockMap[editStore.id]?.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Value</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditStore(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={updating}
                  style={{ borderRadius: 10 }}>
                  {updating ? <Loader2 size={14} className="spin" /> : <Edit3 size={14} />} Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hover hint CSS */}
      <style>{`
        [style*="cursor: pointer"]:hover .store-edit-hint { opacity: 1 !important; }
        [style*="cursor: pointer"]:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
      `}</style>
    </div>
  );
}
