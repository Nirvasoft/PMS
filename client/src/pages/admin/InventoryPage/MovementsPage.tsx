import '../MaintenancePage/MaintenancePage.css';
import { useState, useEffect } from 'react';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { useGetMyPropertyScopeQuery } from '../../../store/api/propertiesApi';
import { useGetMovementsQuery } from '../../../store/api/inventoryApi';
import { Activity, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  receipt: { label: 'Receipt', icon: '📥', color: 'completed' },
  issue: { label: 'Issue', icon: '📤', color: 'in_progress' },
  transfer_in: { label: 'Transfer In', icon: '➡️', color: 'completed' },
  transfer_out: { label: 'Transfer Out', icon: '⬅️', color: 'in_progress' },
  adjustment: { label: 'Adjustment', icon: '📋', color: 'open' },
  write_off: { label: 'Write-off', icon: '❌', color: 'cancelled' },
};

export default function MovementsPage() {
  const [movementType, setMovementType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const filterProperty = useSelectedPropertyFilter();
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const properties = scopeData?.data || [];
  const activeProperty = properties.find((p: any) => p.id === filterProperty);
  const currency = activeProperty?.currency || 'MMK';

  useEffect(() => {
    setPage(1);
  }, [filterProperty]);

  const { data, isLoading } = useGetMovementsQuery({
    propertyId: filterProperty || undefined,
    movementType: movementType || undefined,
    page,
    limit,
  });
  const movements = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Activity size={22} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>Stock Movements</h1>
              {activeProperty ? (
                <span className="maint-status completed" style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: 8 }}>
                  🏢 {activeProperty.name}
                </span>
              ) : (
                <span className="maint-status open" style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: 8, background: 'rgba(100,116,139,0.15)', color: 'var(--text-secondary)' }}>
                  🌐 All Properties
                </span>
              )}
            </div>
            <p>{meta?.total ?? movements.length} total records</p>
          </div>
        </div>
      </div>

      <div className="maint-filters">
        <select className="filter-select" value={movementType} onChange={(e) => { setMovementType(e.target.value); setPage(1); }}>
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div>
      ) : movements.length === 0 ? (
        <div className="maint-empty"><Activity size={32} /><p>No movements found</p></div>
      ) : (
        <div className="maint-table-wrap">
          <TableScrollWrapper>
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Store</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m: any) => {
                  const t = TYPE_LABELS[m.movementType] || { label: m.movementType, icon: '•', color: 'open' };
                  const user = m.performedBy?.profile
                    ? `${m.performedBy.profile.firstName || ''} ${m.performedBy.profile.lastName || ''}`.trim()
                    : m.performedBy?.email || '—';
                  return (
                    <tr key={m.id}>
                      <td><span className="cell-secondary">{new Date(m.createdAt).toLocaleString()}</span></td>
                      <td><span className={`maint-status ${t.color}`}>{t.icon} {t.label}</span></td>
                      <td>
                        <span className="cell-primary">{m.item?.name}</span>
                        <span className="cell-mono" style={{ display: 'block', fontSize: '11px' }}>{m.item?.itemCode}</span>
                      </td>
                      <td><span className="cell-secondary">{m.store?.name}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`cell-mono ${Number(m.quantity) < 0 ? 'text-danger' : ''}`}>
                          {Number(m.quantity) > 0 ? '+' : ''}{Number(m.quantity)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="cell-mono">{m.unitCost ? `${currency} ${Number(m.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="cell-mono">{m.totalCost ? `${currency} ${Number(m.totalCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                      </td>
                      <td><span className="cell-secondary">{user}</span></td>
                      <td><span className="cell-secondary" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{m.notes || '—'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollWrapper>

          {meta && meta.total >= 10 && (
            <div className="maint-pagination">
              <div className="maint-pagination-left">
                <span>Rows per page:</span>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="maint-pagination-right">
                <button className="maint-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={16} />
                </button>
                <span className="maint-page-info">
                  Page {page} of {meta.totalPages || 1}
                </span>
                <button className="maint-page-btn" disabled={page >= (meta.totalPages || 1)} onClick={() => setPage(page + 1)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
