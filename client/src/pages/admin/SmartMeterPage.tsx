import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetSmartDevicesQuery, useGetMeterReadingsQuery, useAddMeterReadingMutation,
  useCheckOfflineMetersMutation, useSyncMeterMutation,
  useGenerateUtilityInvoiceMutation, useUpsertSmartDeviceMutation,
} from '../../store/api/condoApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { useAlertDialog } from '../../components/DialogProvider';
import { PermissionGuard } from '../../components/guards/PermissionGuard';
import {
  Zap, Wifi, WifiOff, Activity, Gauge, Plus, X, AlertTriangle, Wrench,
  RefreshCw, Loader2, Settings, FileText, Receipt,
} from 'lucide-react';

export default function SmartMeterPage() {
  const alertDialog = useAlertDialog();
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
  const [syncMeter] = useSyncMeterMutation();
  const [generateInvoice] = useGenerateUtilityInvoiceMutation();
  const [upsertDevice] = useUpsertSmartDeviceMutation();
  const [offlineResult, setOfflineResult] = useState<any>(null);
  const [syncingMeterId, setSyncingMeterId] = useState<string | null>(null);

  // Modals
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showDeviceConfigModal, setShowDeviceConfigModal] = useState<{ meterId: string; existing?: any } | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ from: '', to: '' });
  const [deviceForm, setDeviceForm] = useState({
    protocol: 'modbus_tcp' as string,
    host: '', port: '', modbusUnitId: '',
    mqttTopic: '', mqttBroker: '',
    httpEndpoint: '',
    pollingIntervalMinutes: '60',
  });
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<any>(null);

  const handleAddReading = async () => {
    if (!selectedMeter || !readingForm.readingValue) return;
    await addReading({ meterId: selectedMeter, data: { ...readingForm, readingValue: Number(readingForm.readingValue), source: 'manual' } });
    setShowAddReading(false);
    setReadingForm({ readingValue: '', readingAt: new Date().toISOString().slice(0, 16) });
  };

  const handleGenerateInvoice = async () => {
    if (!invoiceForm.from || !invoiceForm.to) return;
    // Find the unitId from the selected meter's device
    const device = devices.find((d: any) => d.meterId === selectedMeter);
    const unitId = device?.meter?.unitId;
    if (!unitId) { alertDialog('No unit associated with this meter'); return; }
    setInvoiceGenerating(true);
    try {
      const res = await generateInvoice({ unitId, data: { from: invoiceForm.from, to: invoiceForm.to } }).unwrap();
      setInvoiceResult(res.data);
    } catch (e: any) {
      alertDialog(e?.data?.errors?.[0]?.message || 'Failed to generate invoice');
    } finally {
      setInvoiceGenerating(false);
    }
  };

  const openDeviceConfig = (device: any) => {
    setDeviceForm({
      protocol: device.protocol || 'modbus_tcp',
      host: device.host || '',
      port: device.port?.toString() || '',
      modbusUnitId: device.modbusUnitId?.toString() || '',
      mqttTopic: device.mqttTopic || '',
      mqttBroker: device.mqttBroker || '',
      httpEndpoint: device.httpEndpoint || '',
      pollingIntervalMinutes: device.pollingIntervalMinutes?.toString() || '60',
    });
    setShowDeviceConfigModal({ meterId: device.meterId, existing: device });
  };

  const handleSaveDeviceConfig = async () => {
    if (!showDeviceConfigModal) return;
    await upsertDevice({
      meterId: showDeviceConfigModal.meterId,
      data: {
        protocol: deviceForm.protocol,
        host: deviceForm.host || undefined,
        port: deviceForm.port ? Number(deviceForm.port) : undefined,
        modbusUnitId: deviceForm.modbusUnitId ? Number(deviceForm.modbusUnitId) : undefined,
        mqttTopic: deviceForm.mqttTopic || undefined,
        mqttBroker: deviceForm.mqttBroker || undefined,
        httpEndpoint: deviceForm.httpEndpoint || undefined,
        pollingIntervalMinutes: Number(deviceForm.pollingIntervalMinutes) || 60,
      },
    });
    setShowDeviceConfigModal(null);
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
              alertDialog(e?.data?.errors?.[0]?.message || 'Check failed');
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
                        <PermissionGuard permission="condo-meters.write">
                          <button
                            className="condo-btn-sm"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6,
                              background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                              color: '#fff', border: 'none', fontWeight: 600,
                              opacity: syncingMeterId === d.meterId ? 0.7 : 1,
                            }}
                            disabled={syncingMeterId === d.meterId}
                            onClick={async () => {
                              setSyncingMeterId(d.meterId);
                              try {
                                await syncMeter(d.meterId).unwrap();
                              } catch (e: any) {
                                alertDialog(e?.data?.errors?.[0]?.message || 'Sync failed');
                              } finally {
                                setSyncingMeterId(null);
                              }
                            }}
                          >
                            {syncingMeterId === d.meterId ? (
                              <><Loader2 size={12} className="spin" /> Syncing</>
                            ) : (
                              <><RefreshCw size={12} /> Sync</>
                            )}
                          </button>
                          <button
                            className="condo-btn-sm"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6,
                              border: '1px solid var(--border-color)', background: 'transparent',
                              color: 'var(--text-primary)', fontWeight: 500,
                            }}
                            onClick={() => openDeviceConfig(d)}
                          >
                            <Settings size={12} /> Config
                          </button>
                        </PermissionGuard>
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
                <PermissionGuard permission="condo-meters.write">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.82rem',
                      }}
                      onClick={() => {
                        setInvoiceForm({ from: '', to: '' });
                        setInvoiceResult(null);
                        setShowInvoiceModal(true);
                      }}
                    >
                      <Receipt size={14} /> Generate Invoice
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddReading(true)}>
                      <Plus size={14} style={{ marginRight: 4 }} />Add Reading
                    </button>
                  </div>
                </PermissionGuard>
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
            <div className="condo-modal-overlay">
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

          {/* Generate Invoice Modal */}
          {showInvoiceModal && createPortal(
            <div className="condo-modal-overlay">
              <div className="condo-modal condo-modal-sm" onClick={e => e.stopPropagation()}>
                <div className="condo-modal-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Receipt size={18} /> Generate Utility Invoice
                  </h3>
                  <button className="condo-modal-close" onClick={() => setShowInvoiceModal(false)}><X size={18} /></button>
                </div>
                <div className="condo-modal-body">
                  {invoiceResult ? (
                    <div style={{
                      padding: '16px', borderRadius: 10,
                      background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                      textAlign: 'center',
                    }}>
                      <FileText size={28} color="#22c55e" style={{ marginBottom: 8 }} />
                      <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>Invoice Generated!</p>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                        Invoice #{invoiceResult.invoiceNumber || invoiceResult.id?.slice(-6)}
                        {invoiceResult.totalAmount != null && (<> — Total: <strong>${Number(invoiceResult.totalAmount).toFixed(2)}</strong></>)}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        Generate a utility invoice based on meter readings for the selected period.
                      </p>
                      <div className="condo-form-grid">
                        <label>Period From *
                          <input type="date" value={invoiceForm.from}
                            onChange={e => setInvoiceForm(f => ({ ...f, from: e.target.value }))} />
                        </label>
                        <label>Period To *
                          <input type="date" value={invoiceForm.to}
                            onChange={e => setInvoiceForm(f => ({ ...f, to: e.target.value }))} />
                        </label>
                      </div>
                    </>
                  )}
                </div>
                <div className="condo-modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowInvoiceModal(false)}>
                    {invoiceResult ? 'Close' : 'Cancel'}
                  </button>
                  {!invoiceResult && (
                    <button
                      className="btn btn-primary"
                      onClick={handleGenerateInvoice}
                      disabled={!invoiceForm.from || !invoiceForm.to || invoiceGenerating}
                      style={{ opacity: (!invoiceForm.from || !invoiceForm.to) ? 0.5 : 1 }}
                    >
                      {invoiceGenerating ? (
                        <><Loader2 size={14} className="spin" style={{ marginRight: 4 }} /> Generating...</>
                      ) : (
                        <><Receipt size={14} style={{ marginRight: 4 }} /> Generate</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          , document.body)}

          {/* Smart Device Config Modal */}
          {showDeviceConfigModal && createPortal(
            <div className="condo-modal-overlay">
              <div className="condo-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="condo-modal-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings size={18} /> Smart Device Configuration
                  </h3>
                  <button className="condo-modal-close" onClick={() => setShowDeviceConfigModal(null)}><X size={18} /></button>
                </div>
                <div className="condo-modal-body">
                  {/* Meter info */}
                  {showDeviceConfigModal.existing && (
                    <div style={{
                      display: 'flex', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 10,
                      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                      fontSize: 12, color: 'var(--text-secondary)',
                    }}>
                      <span>Serial: <strong style={{ color: 'var(--text-primary)' }}>{showDeviceConfigModal.existing.meter?.meterSerialNo || '—'}</strong></span>
                      <span>Type: <strong style={{ color: 'var(--text-primary)' }}>{showDeviceConfigModal.existing.meter?.meterType || '—'}</strong></span>
                      <span>Status: <strong style={{ color: showDeviceConfigModal.existing.connectionStatus === 'online' ? '#22c55e' : '#ef4444' }}>{showDeviceConfigModal.existing.connectionStatus}</strong></span>
                    </div>
                  )}

                  <div className="condo-form-grid">
                    <label>Protocol *
                      <select value={deviceForm.protocol} onChange={e => setDeviceForm(f => ({ ...f, protocol: e.target.value }))}>
                        <option value="modbus_tcp">Modbus TCP</option>
                        <option value="mqtt">MQTT</option>
                        <option value="http">HTTP</option>
                        <option value="lora">LoRa</option>
                      </select>
                    </label>
                    <label>Polling Interval (min)
                      <input type="number" min="1" value={deviceForm.pollingIntervalMinutes}
                        onChange={e => setDeviceForm(f => ({ ...f, pollingIntervalMinutes: e.target.value }))} />
                    </label>

                    {/* Protocol-specific fields */}
                    {(deviceForm.protocol === 'modbus_tcp' || deviceForm.protocol === 'http') && (
                      <>
                        <label>Host
                          <input value={deviceForm.host}
                            onChange={e => setDeviceForm(f => ({ ...f, host: e.target.value }))}
                            placeholder="192.168.1.100" />
                        </label>
                        <label>Port
                          <input type="number" value={deviceForm.port}
                            onChange={e => setDeviceForm(f => ({ ...f, port: e.target.value }))}
                            placeholder="502" />
                        </label>
                      </>
                    )}

                    {deviceForm.protocol === 'modbus_tcp' && (
                      <label>Modbus Unit ID
                        <input type="number" value={deviceForm.modbusUnitId}
                          onChange={e => setDeviceForm(f => ({ ...f, modbusUnitId: e.target.value }))}
                          placeholder="1" />
                      </label>
                    )}

                    {deviceForm.protocol === 'mqtt' && (
                      <>
                        <label>MQTT Broker
                          <input value={deviceForm.mqttBroker}
                            onChange={e => setDeviceForm(f => ({ ...f, mqttBroker: e.target.value }))}
                            placeholder="mqtt://broker.example.com" />
                        </label>
                        <label>MQTT Topic
                          <input value={deviceForm.mqttTopic}
                            onChange={e => setDeviceForm(f => ({ ...f, mqttTopic: e.target.value }))}
                            placeholder="meters/unit-101/reading" />
                        </label>
                      </>
                    )}

                    {deviceForm.protocol === 'http' && (
                      <label style={{ gridColumn: '1 / -1' }}>HTTP Endpoint
                        <input value={deviceForm.httpEndpoint}
                          onChange={e => setDeviceForm(f => ({ ...f, httpEndpoint: e.target.value }))}
                          placeholder="https://api.meter.io/v1/reading" />
                      </label>
                    )}
                  </div>
                </div>
                <div className="condo-modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowDeviceConfigModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveDeviceConfig}>
                    <Settings size={14} style={{ marginRight: 4 }} /> Save Configuration
                  </button>
                </div>
              </div>
            </div>
          , document.body)}
        </>
      )}
    </div>
  );
}
