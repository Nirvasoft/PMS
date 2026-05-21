import { useState, useEffect } from 'react';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetGateLogsQuery } from '../../../store/api/parkingApi';
import { Activity, ShieldCheck, ShieldAlert, LogIn, LogOut, ChevronLeft, ChevronRight, Car } from 'lucide-react';
import '../BillingPage/BillingPage.css';
import { format } from 'date-fns';

export default function GateAccessLogsPage() {
  const [propertyId, setPropertyId] = useState('');
  const [page, setPage] = useState(1);
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];

  useEffect(() => {
    if (!propertyId && properties.length > 0) {
      setPropertyId(properties[0].id);
    }
  }, [properties, propertyId]);

  const { data: logsData, isFetching } = useGetGateLogsQuery(
    { propertyId, page, limit: 20 },
    { skip: !propertyId, pollingInterval: 5000 }
  );

  const logs = logsData?.data || [];
  const meta = logsData?.meta;

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <Activity size={22} />
          </div>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Gate Access Logs
              <span className="live-dot" />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#34d399', textTransform: 'uppercase', letterSpacing: 1 }}>Live</span>
            </h1>
            <p>Real-time RFID barrier access events</p>
          </div>
        </div>
        <div className="billing-filters" style={{ marginBottom: 0 }}>
          <select
            className="filter-select"
            value={propertyId}
            onChange={(e) => { setPropertyId(e.target.value); setPage(1); }}
            style={{ minWidth: 220 }}
          >
            {properties.length === 0 && <option value="">Loading…</option>}
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {!propertyId ? (
        <div className="billing-empty" style={{ marginTop: 40 }}>Select a property to view gate logs</div>
      ) : (
        <div className="billing-table-wrap" style={{ marginTop: 24 }}>
          <table className="billing-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Event Time</th>
                <th style={{ width: 100 }}>Direction</th>
                <th style={{ width: 180 }}>Vehicle</th>
                <th style={{ width: 200 }}>RFID Tag / Gate</th>
                <th style={{ width: 120 }}>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="billing-empty">
                      {isFetching ? 'Loading gate logs…' : 'No gate events found for this property.'}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log: any) => (
                  <tr key={log.id} className={!log.isAuthorized ? 'row-denied' : ''}>
                    <td>
                      <div className="cell-primary">{format(new Date(log.eventAt), 'MMM d, yyyy')}</div>
                      <div className="cell-secondary">{format(new Date(log.eventAt), 'HH:mm:ss')}</div>
                    </td>
                    <td>
                      <span className={`direction-badge ${log.eventType}`}>
                        {log.eventType === 'entry' ? <LogIn size={12} /> : <LogOut size={12} />}
                        {log.eventType}
                      </span>
                    </td>
                    <td>
                      {log.vehicle ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 8,
                            background: 'rgba(99,102,241,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#818cf8', flexShrink: 0,
                          }}>
                            <Car size={16} />
                          </div>
                          <div>
                            <div className="cell-primary">{log.vehicle.plateNumber}</div>
                            <div className="cell-secondary">{log.vehicle.make} {log.vehicle.model} · {log.vehicle.color}</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 8,
                            background: 'rgba(239,68,68,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#f87171', flexShrink: 0,
                          }}>
                            <ShieldAlert size={16} />
                          </div>
                          <div>
                            <div className="cell-primary" style={{ color: 'var(--text-tertiary)' }}>Unknown Vehicle</div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="cell-mono">{log.rfidTagNo}</span>
                      {log.gateId && (
                        <div className="cell-secondary" style={{ marginTop: 4 }}>{log.gateId}</div>
                      )}
                    </td>
                    <td>
                      {log.isAuthorized ? (
                        <span className="auth-badge granted">
                          <ShieldCheck size={13} />
                          Granted
                        </span>
                      ) : (
                        <span className="auth-badge denied">
                          <ShieldAlert size={13} />
                          Denied
                        </span>
                      )}
                    </td>
                    <td>
                      {log.denialReason ? (
                        <span style={{ color: '#f87171', fontSize: 13, fontWeight: 500 }}>
                          {log.denialReason}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="billing-pagination">
              <span className="page-info">
                Page {meta.page} of {meta.totalPages} · {meta.total} events
              </span>
              <div className="page-btns">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={15} />
                </button>
                <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
