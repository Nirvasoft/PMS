import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetStockLevelsQuery, useGetStoresQuery,
  useReceiveStockMutation, useIssueStockMutation,
  useTransferStockMutation, useAdjustStockMutation,
  useGetInventoryItemsQuery,
} from '../../../store/api/inventoryApi';
import {
  Layers, Loader2, Plus, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, ClipboardEdit,
} from 'lucide-react';
import toast from 'react-hot-toast';

type ModalType = null | 'receive' | 'issue' | 'transfer' | 'adjust';

export default function StockLevelsPage() {
  const [storeId, setStoreId] = useState('');
  const [modal, setModal] = useState<ModalType>(null);

  const { data: stockData, isLoading } = useGetStockLevelsQuery({ storeId: storeId || undefined });
  const { data: storesData } = useGetStoresQuery({});
  const { data: itemsData } = useGetInventoryItemsQuery({ page: 1, limit: 500 });

  const [receiveStock] = useReceiveStockMutation();
  const [issueStock] = useIssueStockMutation();
  const [transferStock] = useTransferStockMutation();
  const [adjustStock] = useAdjustStockMutation();

  const levels = stockData?.data || [];
  const stores = storesData?.data || [];
  const items = itemsData?.data || [];

  const handleAction = async (e: React.FormEvent<HTMLFormElement>, type: ModalType) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      if (type === 'receive') {
        await receiveStock({
          itemId: fd.get('itemId'), storeId: fd.get('storeId'),
          quantity: parseFloat(fd.get('quantity') as string),
          unitCost: parseFloat(fd.get('unitCost') as string) || undefined,
          notes: fd.get('notes') || undefined,
        }).unwrap();
      } else if (type === 'issue') {
        await issueStock({
          itemId: fd.get('itemId'), storeId: fd.get('storeId'),
          quantity: parseFloat(fd.get('quantity') as string),
          notes: fd.get('notes') || undefined,
        }).unwrap();
      } else if (type === 'transfer') {
        await transferStock({
          itemId: fd.get('itemId'),
          fromStoreId: fd.get('fromStoreId'), toStoreId: fd.get('toStoreId'),
          quantity: parseFloat(fd.get('quantity') as string),
          notes: fd.get('notes') || undefined,
        }).unwrap();
      } else if (type === 'adjust') {
        await adjustStock({
          itemId: fd.get('itemId'), storeId: fd.get('storeId'),
          adjustedQty: parseFloat(fd.get('adjustedQty') as string),
          reason: fd.get('reason') as string,
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
          <div className="page-icon-lg"><Layers size={20} /></div>
          <div><h1>Stock Levels</h1><p>{levels.length} records</p></div>
        </div>
        <div className="header-actions">
          <button className="btn btn-success btn-sm" onClick={() => setModal('receive')}>
            <ArrowDownToLine size={14} /> Receive
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setModal('issue')}>
            <ArrowUpFromLine size={14} /> Issue
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setModal('transfer')}>
            <ArrowLeftRight size={14} /> Transfer
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setModal('adjust')}>
            <ClipboardEdit size={14} /> Adjust
          </button>
        </div>
      </div>

      <div className="maint-filters">
        <select className="filter-select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">All Stores</option>
          {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : levels.length === 0 ? (
        <div className="maint-empty"><Layers size={32} /><p>No stock records yet</p></div>
      ) : (
        <div className="maint-table-wrap">
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
        </div>
      )}

      {/* Action Modals */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h2>
              {modal === 'receive' && <><ArrowDownToLine size={18} /> Receive Stock</>}
              {modal === 'issue' && <><ArrowUpFromLine size={18} /> Issue Stock</>}
              {modal === 'transfer' && <><ArrowLeftRight size={18} /> Transfer Stock</>}
              {modal === 'adjust' && <><ClipboardEdit size={18} /> Adjust Stock</>}
            </h2>
            <form onSubmit={(e) => handleAction(e, modal)}>
              <div className="form-group">
                <label>Item *</label>
                <select name="itemId" required>
                  <option value="">Select item...</option>
                  {items.map((i: any) => <option key={i.id} value={i.id}>{i.itemCode} — {i.name}</option>)}
                </select>
              </div>

              {modal === 'transfer' ? (
                <>
                  <div className="form-group">
                    <label>From Store *</label>
                    <select name="fromStoreId" required>
                      <option value="">Select...</option>
                      {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>To Store *</label>
                    <select name="toStoreId" required>
                      <option value="">Select...</option>
                      {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label>Store *</label>
                  <select name="storeId" required>
                    <option value="">Select store...</option>
                    {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {modal === 'adjust' ? (
                <>
                  <div className="form-group"><label>Adjusted Qty *</label><input name="adjustedQty" type="number" step="0.001" required /></div>
                  <div className="form-group"><label>Reason *</label><input name="reason" required placeholder="Physical count result" /></div>
                </>
              ) : (
                <>
                  <div className="form-group"><label>Quantity *</label><input name="quantity" type="number" step="0.001" min="0.001" required /></div>
                  {modal === 'receive' && (
                    <div className="form-group"><label>Unit Cost</label><input name="unitCost" type="number" step="0.01" /></div>
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
