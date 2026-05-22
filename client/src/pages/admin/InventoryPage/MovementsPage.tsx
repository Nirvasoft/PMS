import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useGetMovementsQuery } from '../../../store/api/inventoryApi';
import { Activity, Loader2, Filter } from 'lucide-react';

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

  const { data, isLoading } = useGetMovementsQuery({ movementType: movementType || undefined, page, limit: 50 });
  const movements = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Activity size={20} /></div>
          <div><h1>Stock Movements</h1><p>{meta?.total ?? 0} records</p></div>
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
                      <span className="cell-mono">{m.unitCost ? `$${Number(m.unitCost).toFixed(2)}` : '—'}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="cell-mono">{m.totalCost ? `$${Number(m.totalCost).toFixed(2)}` : '—'}</span>
                    </td>
                    <td><span className="cell-secondary">{user}</span></td>
                    <td><span className="cell-secondary" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{m.notes || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="maint-pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
