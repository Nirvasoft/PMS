import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetInventoryItemsQuery, useCreateInventoryItemMutation,
  useUpdateInventoryItemMutation,
  useGetStoresQuery, useCreateStoreMutation,
  useGetInventoryStatsQuery,
} from '../../../store/api/inventoryApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Package, Plus, Search, Loader2, AlertTriangle, Filter,
  Warehouse, TrendingDown, DollarSign, BarChart3, Edit3, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const CATEGORIES = ['plumbing', 'electrical', 'hvac', 'cleaning', 'general', 'other'];
const UNITS = ['pcs', 'meters', 'kg', 'litres', 'roll', 'box', 'set'];
const CATEGORY_ICONS: Record<string, string> = {
  plumbing: '🔧', electrical: '⚡', hvac: '❄️', cleaning: '🧹', general: '📦', other: '🔩',
};

export default function ItemCatalogPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [showStoreModal, setShowStoreModal] = useState(false);

  const { data: itemsData, isLoading } = useGetInventoryItemsQuery({
    search, category, lowStock: lowStock ? 'true' : undefined, page, limit: 20,
  });
  const { data: statsData } = useGetInventoryStatsQuery();
  const { data: storesData } = useGetStoresQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createItem] = useCreateInventoryItemMutation();
  const [updateItem] = useUpdateInventoryItemMutation();
  const [createStore] = useCreateStoreMutation();

  const items = itemsData?.data || [];
  const meta = itemsData?.meta;
  const stats = statsData?.data;
  const stores = storesData?.data || [];
  const properties = propsData?.data || [];

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name') as string,
      category: fd.get('category') as string,
      unitOfMeasure: fd.get('unitOfMeasure') as string,
      unitCost: parseFloat(fd.get('unitCost') as string) || 0,
      reorderPoint: parseFloat(fd.get('reorderPoint') as string) || 0,
      reorderQty: parseFloat(fd.get('reorderQty') as string) || 1,
      maxStock: parseFloat(fd.get('maxStock') as string) || undefined,
      description: (fd.get('description') as string) || undefined,
    };
    try {
      if (editItem) {
        await updateItem({ id: editItem.id, data: payload }).unwrap();
        toast.success('Item updated');
      } else {
        await createItem({ ...payload, itemCode: fd.get('itemCode') as string }).unwrap();
        toast.success('Item created');
      }
      setShowModal(false);
      setEditItem(null);
    } catch { toast.error(editItem ? 'Failed to update item' : 'Failed to create item'); }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setShowModal(true);
  };

  const openCreate = () => {
    setEditItem(null);
    setShowModal(true);
  };

  const handleCreateStore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createStore({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        location: fd.get('location') || undefined,
      }).unwrap();
      toast.success('Store created');
      setShowStoreModal(false);
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="maint-page">
      {/* Stats Row */}
      {stats && (
        <div className="maint-stats-row">
          <div className="maint-stat-card blue">
            <div className="msc-icon"><Package size={18} /></div>
            <div className="msc-label">Items</div>
            <div className="msc-value">{stats.totalItems}</div>
          </div>
          <div className="maint-stat-card" style={{ position: 'relative' }}>
            <div className="msc-icon" style={{ background: 'rgba(234,179,8,0.14)', color: '#eab308' }}><AlertTriangle size={18} /></div>
            <div className="msc-label">Low Stock</div>
            <div className="msc-value" style={{ color: '#eab308' }}>{stats.lowStockCount}</div>
          </div>
          <div className="maint-stat-card red">
            <div className="msc-icon"><TrendingDown size={18} /></div>
            <div className="msc-label">Out of Stock</div>
            <div className="msc-value">{stats.outOfStockCount}</div>
          </div>
          <div className="maint-stat-card green">
            <div className="msc-icon"><DollarSign size={18} /></div>
            <div className="msc-label">Total Value</div>
            <div className="msc-value">${stats.totalValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="maint-stat-card purple">
            <div className="msc-icon"><Warehouse size={18} /></div>
            <div className="msc-label">Stores</div>
            <div className="msc-value">{stats.totalStores}</div>
          </div>
          <div className="maint-stat-card" style={{ position: 'relative' }}>
            <div className="msc-icon" style={{ background: 'rgba(14,165,233,0.14)', color: '#0ea5e9' }}><BarChart3 size={18} /></div>
            <div className="msc-label">Movements (7d)</div>
            <div className="msc-value" style={{ color: '#0ea5e9' }}>{stats.recentMovements}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Package size={20} /></div>
          <div><h1>Item Catalog</h1><p>{meta?.total ?? 0} items · {stores.length} stores</p></div>
        </div>
        <div className="header-actions">
          <PermissionGuard permission="inventory-stores.write">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowStoreModal(true)}>
              <Warehouse size={14} /> Add Store
            </button>
          </PermissionGuard>
          <PermissionGuard permission="inventory-items.write">
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <Plus size={14} /> Add Item
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Filters */}
      <div className="maint-filters">
        <div className="search-box">
          <Search size={14} />
          <input placeholder="Search items..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="filter-select" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
        </select>
        <button className={`filter-chip ${lowStock ? 'active' : ''}`} onClick={() => { setLowStock(!lowStock); setPage(1); }}>
          <Filter size={12} /> Low Stock
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : items.length === 0 ? (
        <div className="maint-empty"><Package size={32} /><p>No items found</p></div>
      ) : (
        <div className="maint-table-wrap">
          <table className="maint-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Unit</th>
                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                <th style={{ textAlign: 'right' }}>On Hand</th>
                <th style={{ textAlign: 'right' }}>Reorder Pt</th>
                <th>Status</th>
                <th style={{ width: 60, textAlign: 'center' }}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td><span className="cell-mono">{item.itemCode}</span></td>
                  <td><span className="cell-primary">{item.name}</span></td>
                  <td>
                    <span className="maint-status open">
                      {CATEGORY_ICONS[item.category] || '📦'} {item.category}
                    </span>
                  </td>
                  <td><span className="cell-secondary">{item.unitOfMeasure}</span></td>
                  <td style={{ textAlign: 'right' }}><span className="cell-mono">${Number(item.unitCost).toFixed(2)}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`cell-mono ${item.isLowStock ? 'text-danger' : ''}`}>{item.totalOnHand}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}><span className="cell-secondary">{Number(item.reorderPoint)}</span></td>
                  <td>
                    {item.totalOnHand <= 0 ? (
                      <span className="maint-status cancelled">❌ Out</span>
                    ) : item.isLowStock ? (
                      <span className="maint-status in_progress">⚠️ Low</span>
                    ) : (
                      <span className="maint-status completed">✅ OK</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <PermissionGuard permission="inventory-items.write">
                      <button className="btn btn-ghost btn-sm" title="Edit Item"
                        onClick={() => openEdit(item)}>
                        <Edit3 size={14} />
                      </button>
                    </PermissionGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="maint-pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {/* Create/Edit Item Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2><Package size={18} /> {editItem ? 'Edit Item' : 'New Inventory Item'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowModal(false); setEditItem(null); }}><XCircle size={20} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Item Code *</label>
                  <input name="itemCode" required placeholder="PIPE-25MM"
                    defaultValue={editItem?.itemCode || ''}
                    disabled={!!editItem}
                    style={editItem ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
                </div>
                <div className="form-group">
                  <label>Name *</label>
                  <input name="name" required placeholder="25mm Copper Pipe" defaultValue={editItem?.name || ''} />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select name="category" defaultValue={editItem?.category || 'plumbing'}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Unit of Measure *</label>
                  <select name="unitOfMeasure" defaultValue={editItem?.unitOfMeasure || 'pcs'}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Unit Cost</label><input name="unitCost" type="number" step="0.01" defaultValue={editItem ? Number(editItem.unitCost) : 0} /></div>
                <div className="form-group"><label>Reorder Point</label><input name="reorderPoint" type="number" step="0.001" defaultValue={editItem ? Number(editItem.reorderPoint) : 0} /></div>
                <div className="form-group"><label>Reorder Qty</label><input name="reorderQty" type="number" step="0.001" defaultValue={editItem ? Number(editItem.reorderQty) : 1} /></div>
                <div className="form-group"><label>Max Stock</label><input name="maxStock" type="number" step="0.001" defaultValue={editItem?.maxStock ? Number(editItem.maxStock) : ''} /></div>
              </div>
              <div className="form-group"><label>Description</label><textarea name="description" rows={2} defaultValue={editItem?.description || ''} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditItem(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editItem ? 'Update Item' : 'Create Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Store Modal */}
      {showStoreModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2><Warehouse size={18} /> New Store</h2>
            <form onSubmit={handleCreateStore}>
              <div className="form-group">
                <label>Property *</label>
                <select name="propertyId" required>
                  <option value="">Select property...</option>
                  {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Store Name *</label><input name="name" required placeholder="Main Store" /></div>
              <div className="form-group"><label>Location</label><input name="location" placeholder="Ground floor, Tower A" /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowStoreModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Store</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
