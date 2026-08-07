import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useGetStoresQuery, useCreateStoreMutation, useGetStockLevelsQuery } from '../../../store/api/inventoryApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Store, Plus, Loader2, Inbox, XCircle, Building2, Package, Box,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function StoreManagementPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [filterProperty, setFilterProperty] = useState('');

  const { data: storesData, isLoading } = useGetStoresQuery({ propertyId: filterProperty || undefined });
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: stockData } = useGetStockLevelsQuery({});
  const [createStore] = useCreateStoreMutation();

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
      }).unwrap();
      toast.success('Store created');
      setShowCreate(false);
    } catch { toast.error('Failed to create store'); }
  };

  // Group by property
  const grouped = stores.reduce((acc: Record<string, any[]>, s: any) => {
    const pName = s.property?.name || 'Unknown';
    if (!acc[pName]) acc[pName] = [];
    acc[pName].push(s);
    return acc;
  }, {});

  const totalValue = Object.values(storeStockMap).reduce((s, v) => s + v.value, 0);

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Store size={22} /></div>
          <div>
            <h1>Store Management</h1>
            <p>{stores.length} stores across {Object.keys(grouped).length} properties</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Store
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><Store size={18} /></div>
          <span className="msc-value">{stores.length}</span>
          <span className="msc-label">Total Stores</span>
        </div>
        <div className="maint-stat-card green">
          <div className="msc-icon"><Package size={18} /></div>
          <span className="msc-value">{stockLevels.length}</span>
          <span className="msc-label">Stock Entries</span>
        </div>
        <div className="maint-stat-card" style={{ position: 'relative' }}>
          <div className="msc-icon" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>
            <Box size={18} />
          </div>
          <span className="msc-value" style={{ fontSize: '18px', color: '#10b981' }}>
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="msc-label">Total Inventory Value</span>
        </div>
      </div>

      {/* Filter */}
      <div className="maint-toolbar">
        <div className="filter-group">
          <select className="filter-select" value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Store Cards */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading stores...</div>
      ) : stores.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No stores configured</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Create storage locations to track inventory
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([propName, propStores]) => (
          <div key={propName} style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Building2 size={13} /> {propName}
            </div>
            <div className="hk-mgmt-grid">
              {(propStores as any[]).map((store: any) => {
                const info = storeStockMap[store.id] || { items: 0, value: 0 };
                return (
                  <div key={store.id} className="hk-mgmt-card">
                    <div className="hk-mgmt-icon" style={{ background: 'rgba(99,102,241,0.10)' }}>
                      <Store size={20} color="#818cf8" />
                    </div>
                    <div className="hk-mgmt-info">
                      <div className="hk-mgmt-name">{store.name}</div>
                      <div className="hk-mgmt-tags">
                        <span className="hk-mgmt-tag" style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8' }}>
                          {info.items} item{info.items !== 1 ? 's' : ''}
                        </span>
                        {info.value > 0 && (
                          <span className="hk-mgmt-tag" style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981' }}>
                            ${info.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        )}
                        {store.isActive !== false ? (
                          <span className="hk-mgmt-tag" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Active</span>
                        ) : (
                          <span className="hk-mgmt-tag" style={{ background: 'rgba(107,114,128,0.1)', color: '#6b7280' }}>Inactive</span>
                        )}
                      </div>
                      {store.location && (
                        <div className="hk-mgmt-meta">
                          <span><Building2 size={11} /> {store.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Create Store Modal */}
      {showCreate && (
        <div className="maint-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="maint-modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><Store size={18} /></span> New Store</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
                <div className="form-group"><label>Property *</label>
                  <select name="propertyId" required>
                    <option value="">Select property...</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Store Name *</label>
                  <input name="name" required placeholder="Main Warehouse, Floor 3 Supply Room..." />
                </div>
                <div className="form-group"><label>Location</label>
                  <input name="location" placeholder="Building A, Level B1" />
                </div>
              </div>
              <div className="maint-modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Store size={16} /> Create Store</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
