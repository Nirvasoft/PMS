import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import '../MaintenancePage/MaintenancePage.css';
import { useState, useEffect } from 'react';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import {
  useGetStockLevelsQuery, useGetStoresQuery,
  useReceiveStockMutation, useIssueStockMutation,
  useTransferStockMutation, useAdjustStockMutation,
  useGetInventoryItemsQuery,
} from '../../../store/api/inventoryApi';
import {
  Layers, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, ClipboardEdit,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';

type ModalType = null | 'receive' | 'issue' | 'transfer' | 'adjust';

export default function StockLevelsPage() {
  const [storeId, setStoreId] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, boolean>>({});

  const filterProperty = useSelectedPropertyFilter();
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const properties = scopeData?.data || [];
  const activeProperty = properties.find((p: any) => p.id === filterProperty);
  const currency = activeProperty?.currency || 'MMK';

  useEffect(() => {
    setStoreId('');
  }, [filterProperty]);

  const { data: stockData, isLoading } = useGetStockLevelsQuery({
    propertyId: filterProperty || undefined,
    storeId: storeId || undefined,
  });
  const { data: storesData } = useGetStoresQuery(filterProperty ? { propertyId: filterProperty } : {});
  const { data: itemsData } = useGetInventoryItemsQuery({ page: 1, limit: 500, propertyId: filterProperty || undefined });

  const [receiveStock] = useReceiveStockMutation();
  const [issueStock] = useIssueStockMutation();
  const [transferStock] = useTransferStockMutation();
  const [adjustStock] = useAdjustStockMutation();

  const levels = stockData?.data || [];
  const stores = storesData?.data || [];
  const items = itemsData?.data || [];

  const openActionModal = (type: ModalType) => {
    setActionErrors({});
    setModal(type);
  };

  const handleAction = async (e: React.FormEvent<HTMLFormElement>, type: ModalType) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const itemId = ((fd.get('itemId') as string) || '').trim();
    const storeVal = ((fd.get('storeId') as string) || '').trim();
    const fromStoreVal = ((fd.get('fromStoreId') as string) || '').trim();
    const toStoreVal = ((fd.get('toStoreId') as string) || '').trim();
    const qtyVal = ((fd.get('quantity') as string) || '').trim();
    const adjustedQtyVal = ((fd.get('adjustedQty') as string) || '').trim();
    const reasonVal = ((fd.get('reason') as string) || '').trim();

    const errs: Record<string, boolean> = {};
    if (!itemId) errs.itemId = true;
    if (type === 'transfer') {
      if (!fromStoreVal) errs.fromStoreId = true;
      if (!toStoreVal) errs.toStoreId = true;
    } else {
      if (!storeVal) errs.storeId = true;
    }
    if (type === 'adjust') {
      if (adjustedQtyVal === '' || isNaN(parseFloat(adjustedQtyVal))) errs.adjustedQty = true;
      if (!reasonVal) errs.reason = true;
    } else {
      if (!qtyVal || parseFloat(qtyVal) <= 0) errs.quantity = true;
    }

    if (Object.keys(errs).length > 0) {
      setActionErrors(errs);
      return;
    }
    setActionErrors({});

    try {
      if (type === 'receive') {
        await receiveStock({
          itemId, storeId: storeVal,
          quantity: parseFloat(qtyVal),
          unitCost: parseFloat(fd.get('unitCost') as string) || undefined,
          notes: fd.get('notes') || undefined,
        }).unwrap();
      } else if (type === 'issue') {
        await issueStock({
          itemId, storeId: storeVal,
          quantity: parseFloat(qtyVal),
          notes: fd.get('notes') || undefined,
        }).unwrap();
      } else if (type === 'transfer') {
        await transferStock({
          itemId,
          fromStoreId: fromStoreVal, toStoreId: toStoreVal,
          quantity: parseFloat(qtyVal),
          notes: fd.get('notes') || undefined,
        }).unwrap();
      } else if (type === 'adjust') {
        await adjustStock({
          itemId, storeId: storeVal,
          adjustedQty: parseFloat(adjustedQtyVal),
          reason: reasonVal,
        }).unwrap();
      }
      toast.success(`Stock ${type} successful`);
      setModal(null);
    } catch (err: any) {
      toast.error(err?.data?.error || `Stock ${type} failed`);
    }
  };

  const getBarWidth = (onHand: number, max: number) => max > 0 ? Math.min((onHand / max) * 100, 100) : 50;
  const getBarColor = (onHand: number, reorder: number) =>
    onHand <= 0 ? '#ef4444' : onHand <= reorder ? '#eab308' : '#10b981';

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Layers size={22} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>Stock Levels</h1>
              {activeProperty ? (
                <span className="maint-status completed" style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: 8 }}>
                  Ã°Å¸ÂÂ¢ {activeProperty.name}
                </span>
              ) : (
                <span className="maint-status open" style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: 8, background: 'rgba(100,116,139,0.15)', color: 'var(--text-secondary)' }}>
                  Ã°Å¸Å’Â All Properties
                </span>
              )}
            </div>
            <p>{levels.length} total records</p>
          </div>
        </div>
        <PermissionGuard permission="inventory-stock.write">
          <div className="header-actions">
            <button className="btn btn-success btn-sm" onClick={() => openActionModal('receive')}>
              <ArrowDownToLine size={14} /> Receive
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => openActionModal('issue')}>
              <ArrowUpFromLine size={14} /> Issue
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => openActionModal('transfer')}>
              <ArrowLeftRight size={14} /> Transfer
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => openActionModal('adjust')}>
              <ClipboardEdit size={14} /> Adjust
            </button>
          </div>
        </PermissionGuard>
      </div>

      <div className="maint-filters">
        <select className="filter-select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">All Stores</option>
          {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <TableSkeleton columns={5} rows={5} />
      ) : levels.length === 0 ? (
        <div className="maint-empty"><Layers size={32} /><p>No stock records yet</p></div>
      ) : (
        <div className="maint-table-wrap">
          <TableScrollWrapper>
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Store</th>
                  <th style={{ textAlign: 'right' }}>On Hand</th>
                  <th style={{ textAlign: 'right' }}>Reserved</th>
                  <th style={{ textAlign: 'right' }}>Available</th>
                  <th style={{ width: '160px' }}>Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((sl: any) => {
                  const onHand = Number(sl.qtyOnHand);
                  const reorder = Number(sl.item?.reorderPoint ?? 0);
                  const max = Number(sl.item?.maxStock ?? onHand * 2);
                  return (
                    <tr key={sl.id}>
                      <td>
                        <span className="cell-primary">{sl.item?.name}</span>
                        <span className="cell-mono" style={{ display: 'block', fontSize: '11px' }}>{sl.item?.itemCode}</span>
                      </td>
                      <td><span className="cell-secondary">{sl.store?.name}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="cell-mono">{onHand}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="cell-secondary">{Number(sl.qtyReserved)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="cell-mono">{Number(sl.qtyAvailable)}</span></td>
                      <td>
                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '4px', height: '8px', position: 'relative', overflow: 'hidden' }}>
                          <div style={{
                            width: `${getBarWidth(onHand, max)}%`, height: '100%', borderRadius: '4px',
                            background: getBarColor(onHand, reorder), transition: 'width 0.3s',
                          }} />
                        </div>
                      </td>
                      <td>
                        {onHand <= 0 ? <span className="maint-status cancelled">Out</span>
                         : sl.isLowStock ? <span className="maint-status in_progress">Low</span>
                         : <span className="maint-status completed">OK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollWrapper>
        </div>
      )}

      {/* Action Modals */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h2>
              {modal === 'receive' && <><ArrowDownToLine size={18} /> Receive Stock</>}
              {modal === 'issue' && <><ArrowUpFromLine size={18} /> Issue Stock</>}
              {modal === 'transfer' && <><ArrowLeftRight size={18} /> Transfer Stock</>}
              {modal === 'adjust' && <><ClipboardEdit size={18} /> Adjust Stock</>}
            </h2>
            <form noValidate onSubmit={(e) => handleAction(e, modal)}>
              <div className="form-group">
                <label>Item <span style={{ color: '#f87171' }}>*</span></label>
                <select
                  name="itemId"
                  className={actionErrors.itemId ? 'maint-input-error' : ''}
                  onChange={() => setActionErrors(prev => ({ ...prev, itemId: false }))}
                >
                  <option value="">Select item...</option>
                  {items.map((i: any) => <option key={i.id} value={i.id}>{i.itemCode} Ã¢â‚¬â€ {i.name}</option>)}
                </select>
                {actionErrors.itemId && <span className="maint-error-text">Item is required</span>}
              </div>

              {modal === 'transfer' ? (
                <>
                  <div className="form-group">
                    <label>From Store <span style={{ color: '#f87171' }}>*</span></label>
                    <select
                      name="fromStoreId"
                      className={actionErrors.fromStoreId ? 'maint-input-error' : ''}
                      onChange={() => setActionErrors(prev => ({ ...prev, fromStoreId: false }))}
                    >
                      <option value="">Select...</option>
                      {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {actionErrors.fromStoreId && <span className="maint-error-text">From store is required</span>}
                  </div>
                  <div className="form-group">
                    <label>To Store <span style={{ color: '#f87171' }}>*</span></label>
                    <select
                      name="toStoreId"
                      className={actionErrors.toStoreId ? 'maint-input-error' : ''}
                      onChange={() => setActionErrors(prev => ({ ...prev, toStoreId: false }))}
                    >
                      <option value="">Select...</option>
                      {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {actionErrors.toStoreId && <span className="maint-error-text">To store is required</span>}
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label>Store <span style={{ color: '#f87171' }}>*</span></label>
                  <select
                    name="storeId"
                    className={actionErrors.storeId ? 'maint-input-error' : ''}
                    onChange={() => setActionErrors(prev => ({ ...prev, storeId: false }))}
                  >
                    <option value="">Select store...</option>
                    {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {actionErrors.storeId && <span className="maint-error-text">Store is required</span>}
                </div>
              )}

              {modal === 'adjust' ? (
                <>
                  <div className="form-group">
                    <label>Adjusted Qty <span style={{ color: '#f87171' }}>*</span></label>
                    <input
                      name="adjustedQty"
                      type="number"
                      step="0.001"
                      className={actionErrors.adjustedQty ? 'maint-input-error' : ''}
                      onChange={() => setActionErrors(prev => ({ ...prev, adjustedQty: false }))}
                    />
                    {actionErrors.adjustedQty && <span className="maint-error-text">Adjusted quantity is required</span>}
                  </div>
                  <div className="form-group">
                    <label>Reason <span style={{ color: '#f87171' }}>*</span></label>
                    <input
                      name="reason"
                      placeholder="Physical count result"
                      className={actionErrors.reason ? 'maint-input-error' : ''}
                      onChange={() => setActionErrors(prev => ({ ...prev, reason: false }))}
                    />
                    {actionErrors.reason && <span className="maint-error-text">Reason is required</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Quantity <span style={{ color: '#f87171' }}>*</span></label>
                    <input
                      name="quantity"
                      type="number"
                      step="0.001"
                      min="0.001"
                      className={actionErrors.quantity ? 'maint-input-error' : ''}
                      onChange={() => setActionErrors(prev => ({ ...prev, quantity: false }))}
                    />
                    {actionErrors.quantity && <span className="maint-error-text">Valid quantity is required</span>}
                  </div>
                  {modal === 'receive' && (
                    <div className="form-group"><label>Unit Cost ({currency})</label><input name="unitCost" type="number" step="0.01" /></div>
                  )}
                  <div className="form-group"><label>Notes</label><input name="notes" placeholder="Optional notes" /></div>
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
