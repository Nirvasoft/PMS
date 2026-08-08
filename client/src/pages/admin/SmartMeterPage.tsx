import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetSmartDevicesQuery, useGetMeterReadingsQuery, useAddMeterReadingMutation,
  useCheckOfflineMetersMutation,
} from '../../store/api/condoApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Zap, Wifi, WifiOff, Activity, Gauge, Plus, X, AlertTriangle, Wrench } from 'lucide-react';

export default function SmartMeterPage() {
  const propertyId = useSelectedPropertyId();

  const { data: devicesRes, isLoading } = useGetSmartDevicesQuery({ propertyId }, { skip: !propertyId });
  const devices = devicesRes?.data || [];

  const [selectedMeter, setSelectedMeter] = useState<string>('');
  const [showAddReading, setShowAddReading] = useState(false);
  const [readingForm, setReadingForm] = useState({ readingValue: '', readingAt: new Date().toISOString().slice(0, 16) });

  const { data: readingsRes } = useGetMeterReadingsQuery(
    { meterId: selectedMeter }, { skip: !selectedMeter },
  );
  const readings = readingsRes?.data || [];

  const [addReading] = useAddMeterReadingMutation();
  const [checkOffline, { isLoading: isChecking }] = useCheckOfflineMetersMutation();
  const [offlineResult, setOfflineResult] = useState<any>(null);

  const handleAddReading = async () => {
    if (!selectedMeter || !readingForm.readingValue) return;
    await addReading({ meterId: selectedMeter, data: { ...readingForm, readingValue: Number(readingForm.readingValue), source: 'manual' } });
    setShowAddReading(false);
    setReadingForm({ readingValue: '', readingAt: new Date().toISOString().slice(0, 16) });
  };

  const online = devices.filter((d: any) => d.connectionStatus === 'online').length;
  const offline = devices.filter((d: any) => d.connectionStatus !== 'online' && d.connectionStatus !== 'unknown').length;

  if (!propertyId) return <div className="page-content"><div className="condo-empty-state"><Zap size={40} /><h3>Select a Property</h3><p>Choose a property to manage smart meters</p></div></div>;

  return (
    <div className="page-content">
      <div className="condo-page-header">
        <div>
          <h1>Smart Meter Management</h1>
          <p className="condo-page-subtitle">IoT meter devices, readings & consumption tracking</p>
        </div>
        <button
          className="btn btn-sm"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: offline > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(99, 102, 241, 0.1)',
            color: offline > 0 ? '#ef4444' : '#6366f1',
            border: `1px solid ${offline > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
            fontWeight: 600, fontSize: '0.82rem',
          }}
          onClick={async () => {
            try {
              const res = await checkOffline().unwrap();
              setOfflineResult(res.data);
            } catch (e: any) {
              alert(e?.data?.message || 'Check failed');
            }
          }}
          disabled={isChecking}
        >
          <AlertTriangle size={14} />
          {isChecking ? 'Checking...' : 'Check Offline → Ticket'}
        </button>
      </div>

      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3,4].map(i => <div key={i} className="module-skeleton-card" />)}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="condo-kpi-grid">
            <div className="condo-kpi-card module-animate-in">
              <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                <Gauge size={20} color="white" />
              </div>
              <div className="condo-kpi-content">
                <span className="condo-kpi-label">Total Devices</span>
                <span className="condo-kpi-value">{devices.length}</span>
              </div>
            </div>
            <div className="condo-kpi-card module-animate-in" style={{ animationDelay: '0.05s' }}>
              <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <Wifi size={20} color="white" />
              </div>
              <div className="condo-kpi-content">
                <span className="condo-kpi-label">Online</span>
                <span className="condo-kpi-value">{online}</span>
              </div>
            </div>
            <div className="condo-kpi-card module-animate-in" style={{ animationDelay: '0.1s' }}>
              <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                <WifiOff size={20} color="white" />
              </div>
              <div className="condo-kpi-content">
                <span className="condo-kpi-label">Offline / Error</span>
                <span className="condo-kpi-value">{offline}</span>
              </div>
            </div>
            <div className="condo-kpi-card module-animate-in" style={{ animationDelay: '0.15s' }}>
              <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <Activity size={20} color="white" />
              </div>
              <div className="condo-kpi-content">
                <span className="condo-kpi-label">Readings Today</span>
                <span className="condo-kpi-value">{readings.length}</span>
              </div>
            </div>
          </div>

          {/* Offline Check Results */}
          {offlineResult && (
            <div className="condo-card module-animate-in" style={{
              marginBottom: 20, borderColor: offlineResult.offlineCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)',
            }}>
              <div className="condo-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {offlineResult.offlineCount > 0 ? (
                    <><WifiOff size={16} style={{ color: '#ef4444' }} /> {offlineResult.offlineCount} Meter{offlineResult.offlineCount !== 1 ? 's' : ''} Offline</>
                  ) : (
                    <><Wifi size={16} style={{ color: '#10b981' }} /> All Meters Online</>
                  )}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {offlineResult.ticketsCreated > 0 && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700,
                      background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1',
                    }}>
                      <Wrench size={12} /> {offlineResult.ticketsCreated} ticket{offlineResult.ticketsCreated !== 1 ? 's' : ''} created
                    </span>
                  )}
                  <button className="condo-btn-sm" onClick={() => setOfflineResult(null)} style={{ padding: '2px 8px' }}>✕</button>
                </div>
              </div>
              {offlineResult.offlineDevices?.length > 0 && (
                <div className="condo-table-wrap">
                  <table className="condo-table">
                    <thead>
                      <tr>
                        <th>Serial No</th>
                        <th>Type</th>
                        <th>Unit</th>
                        <th>Protocol</th>
                        <th>Last Polled</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offlineResult.offlineDevices.map((d: any) => (
                        <tr key={d.deviceId}>
                          <td style={{ fontWeight: 600 }}>{d.serial}</td>
                          <td><span className="condo-type-tag">{d.type}</span></td>
                          <td>{d.unit}</td>
                          <td><span className="condo-protocol-tag">{d.protocol}</span></td>
                          <td style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.8rem' }}>
                            {d.lastPolled ? new Date(d.lastPolled).toLocaleString() : 'Never'}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {d.error || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Device Table */}
          <div className="condo-card module-animate-in" style={{ marginBottom: 20, animationDelay: '0.2s' }}>
            <div className="condo-card-header">
              <h3><Gauge size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />Meter Devices</h3>
              <span className="condo-card-badge">{devices.length} devices</span>
            </div>
            <div className="condo-table-wrap">
              <table className="condo-table">
                <thead>
                  <tr>
                    <th>Serial No</th>
                    <th>Type</th>
                    <th>Unit</th>
                    <th>Protocol</th>
                    <th>Status</th>
                    <th>Last Reading</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.length === 0 ? (
                    <tr><td colSpan={7} className="condo-table-empty">No smart meter devices configured</td></tr>
                  ) : devices.map((d: any) => (
                    <tr key={d.id} className={selectedMeter === d.meterId ? 'module-row-active' : ''}>
                      <td style={{ fontWeight: 600 }}>{d.meter?.meterSerialNo || '—'}</td>
                      <td><span className="condo-type-tag">{d.meter?.meterType || '—'}</span></td>
                      <td>{d.meter?.unit?.unitNumber || '—'}</td>
                      <td><span className="condo-protocol-tag">{d.protocol}</span></td>
                      <td>
                        <span className={`condo-status-badge condo-status-${d.connectionStatus}`}>
                          {d.connectionStatus === 'online' && <Wifi size={12} style={{ marginRight: 4 }} />}
                          {d.connectionStatus}
                        </span>
                      </td>
                      <td>{d.lastReadingAt ? new Date(d.lastReadingAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <button
                          className={`condo-btn-sm ${selectedMeter === d.meterId ? 'condo-btn-active' : ''}`}
                          onClick={() => setSelectedMeter(d.meterId)}
                        >
                          View Readings
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Readings Section */}
          {selectedMeter && (
            <div className="condo-card module-animate-in">
              <div className="condo-card-header">
                <h3><Activity size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />Meter Readings</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddReading(true)}>
                  <Plus size={14} style={{ marginRight: 4 }} />Add Reading
                </button>
              </div>
              <div className="condo-table-wrap">
                <table className="condo-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reading</th>
                      <th>Unit</th>
                      <th>Consumption</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.length === 0 ? (
                      <tr><td colSpan={5} className="condo-table-empty">No readings yet</td></tr>
                    ) : readings.map((r: any) => (
                      <tr key={r.id}>
                        <td>{new Date(r.readingAt).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 600 }}>{Number(r.readingValue).toFixed(2)}</td>
                        <td>{r.readingUnit}</td>
                        <td>{r.consumption ? <span className="text-success">{Number(r.consumption).toFixed(2)}</span> : '—'}</td>
                        <td>
                          <span className={`condo-status-badge condo-status-${r.source === 'smart_meter' ? 'active' : 'pending'}`}>
                            {r.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Add Reading Modal */}
          {showAddReading && createPortal(
            <div className="condo-modal-overlay" onClick={() => setShowAddReading(false)}>
              <div className="condo-modal condo-modal-sm" onClick={e => e.stopPropagation()}>
                <div className="condo-modal-header">
                  <h3>Add Manual Reading</h3>
                  <button className="condo-modal-close" onClick={() => setShowAddReading(false)}><X size={18} /></button>
                </div>
                <div className="condo-modal-body">
                  <div className="condo-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <label>Reading Value
                      <input type="number" value={readingForm.readingValue}
                        onChange={e => setReadingForm(p => ({ ...p, readingValue: e.target.value }))}
                        placeholder="Enter reading value" />
                    </label>
                    <label>Reading Date/Time
                      <input type="datetime-local" value={readingForm.readingAt}
                        onChange={e => setReadingForm(p => ({ ...p, readingAt: e.target.value }))} />
                    </label>
                  </div>
                </div>
                <div className="condo-modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowAddReading(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAddReading}>Add Reading</button>
                </div>
              </div>
            </div>
          , document.body)}
        </>
      )}
    </div>
  );
}
