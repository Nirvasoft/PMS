import React, { useState, useMemo } from 'react';
import {
  useGetBmsSummaryQuery, useGetBmsDevicesQuery, useGetBmsMetaQuery,
  useCreateBmsDeviceMutation, useDeleteBmsDeviceMutation, usePollBmsDeviceMutation,
} from '../../store/api/integrationsApi';
import { useGetPropertiesQuery } from '../../store/api/propertiesApi';
import {
  Server, Plus, RefreshCw, Trash2, Wifi, WifiOff, AlertTriangle,
  Thermometer, Zap, Droplets, Shield, ArrowUpDown, Activity, ChevronDown, X,
} from 'lucide-react';

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  hvac: <Thermometer size={20} />,
  elevator: <ArrowUpDown size={20} />,
  fire_panel: <Shield size={20} />,
  power_meter: <Zap size={20} />,
  water_meter: <Droplets size={20} />,
  lighting: <Activity size={20} />,
  access_control: <Server size={20} />,
};

const DEVICE_COLORS: Record<string, string> = {
  hvac: '#3b82f6',
  elevator: '#8b5cf6',
  fire_panel: '#ef4444',
  power_meter: '#f59e0b',
  water_meter: '#06b6d4',
  lighting: '#10b981',
  access_control: '#6366f1',
};

const PROTOCOL_LABELS: Record<string, string> = {
  bacnet_ip: 'BACnet/IP',
  bacnet_mstp: 'BACnet MS/TP',
  modbus_tcp: 'Modbus TCP',
  lonworks: 'LonWorks',
};

export default function BmsPage() {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);

  const { data: summary } = useGetBmsSummaryQuery();
  const { data: devicesRaw, isLoading } = useGetBmsDevicesQuery({
    propertyId: propertyFilter || undefined,
    deviceType: typeFilter || undefined,
  });
  const { data: properties } = useGetPropertiesQuery({});
  const { data: meta } = useGetBmsMetaQuery();
  const [pollDevice, { isLoading: polling }] = usePollBmsDeviceMutation();
  const [deleteDevice] = useDeleteBmsDeviceMutation();

  const devices = devicesRaw?.data || devicesRaw || [];
  const summaryData = summary?.data || summary;
  const propertyList = properties?.data || properties || [];

  const stats = summaryData || { totalDevices: 0, activeDevices: 0, faultDevices: 0, totalReadings: 0, byType: [] };

  const handlePoll = async (deviceId: string) => {
    try {
      await pollDevice(deviceId).unwrap();
    } catch { /* toast */ }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this BMS device and all its readings?')) return;
    try { await deleteDevice(id).unwrap(); } catch { /* toast */ }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server size={28} /> Building Management System
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Monitor and manage BMS devices across all properties
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={18} /> Add Device
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <SummaryCard label="Total Devices" value={stats.totalDevices} color="#3b82f6" icon={<Server size={20} />} />
        <SummaryCard label="Active" value={stats.activeDevices} color="#10b981" icon={<Wifi size={20} />} />
        <SummaryCard label="Faults" value={stats.faultDevices} color="#ef4444" icon={<AlertTriangle size={20} />} />
        <SummaryCard label="Total Readings" value={(stats.totalReadings || 0).toLocaleString()} color="#8b5cf6" icon={<Activity size={20} />} />
        {(stats.byType || []).map((t: any) => (
          <SummaryCard key={t.type} label={t.type.replace(/_/g, ' ')} value={t.count}
            color={DEVICE_COLORS[t.type] || '#666'} icon={DEVICE_ICONS[t.type] || <Server size={20} />} />
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)}
          style={selectStyle}>
          <option value="">All Properties</option>
          {propertyList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={selectStyle}>
          <option value="">All Device Types</option>
          {(meta?.data?.deviceTypes || []).map((t: string) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {/* Device Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading devices...</div>
      ) : devices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <Server size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>No BMS devices found. Add your first device to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {devices.map((device: any) => (
            <DeviceCard key={device.id} device={device}
              onPoll={() => handlePoll(device.id)}
              onDelete={() => handleDelete(device.id)}
              onSelect={() => setSelectedDevice(device)}
              polling={polling}
            />
          ))}
        </div>
      )}

      {/* Add Device Modal */}
      {showAddModal && (
        <AddDeviceModal
          properties={propertyList}
          meta={meta?.data}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Device Detail Drawer */}
      {selectedDevice && (
        <DeviceDetailDrawer device={selectedDevice} onClose={() => setSelectedDevice(null)} />
      )}
    </div>
  );
}

// ── Summary Card ──
function SummaryCard({ label, value, color, icon }: { label: string; value: any; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12, padding: '16px 18px',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}18`, color,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{label}</div>
      </div>
    </div>
  );
}

// ── Device Card ──
function DeviceCard({ device, onPoll, onDelete, onSelect, polling }: any) {
  const color = DEVICE_COLORS[device.deviceType] || '#666';
  const icon = DEVICE_ICONS[device.deviceType] || <Server size={20} />;
  const readings = device.latestReadings || [];

  return (
    <div onClick={onSelect} style={{
      background: 'var(--bg-card)', borderRadius: 14, padding: 20,
      border: `1px solid ${device.faultActive ? '#ef444466' : 'var(--border)'}`,
      cursor: 'pointer', transition: 'all 0.2s',
      boxShadow: device.faultActive ? '0 0 12px #ef444422' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${color}18`, color,
          }}>{icon}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{device.deviceName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {device.deviceType.replace(/_/g, ' ')} · {PROTOCOL_LABELS[device.protocol] || device.protocol}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {device.isActive ? (
            <Wifi size={16} style={{ color: '#10b981' }} />
          ) : (
            <WifiOff size={16} style={{ color: '#ef4444' }} />
          )}
          {device.faultActive && <AlertTriangle size={16} style={{ color: '#ef4444' }} />}
        </div>
      </div>

      {/* Property */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        📍 {device.property?.name || 'Unknown property'}
        {device.ipAddress && <span> · {device.ipAddress}{device.port ? `:${device.port}` : ''}</span>}
      </div>

      {/* Fault */}
      {device.faultActive && device.faultMessage && (
        <div style={{
          background: '#ef444412', borderRadius: 8, padding: '6px 10px', fontSize: 12,
          color: '#ef4444', marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <AlertTriangle size={13} /> {device.faultMessage}
        </div>
      )}

      {/* Latest Readings */}
      {readings.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {readings.slice(0, 4).map((r: any, i: number) => (
            <div key={i} style={{
              background: 'var(--bg-tertiary)', borderRadius: 6, padding: '4px 8px',
              fontSize: 11, display: 'flex', gap: 4, alignItems: 'center',
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{r.pointName}:</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                {typeof r.value === 'number' ? r.value : Number(r.value || 0).toFixed(1)}
              </span>
              {r.unit && r.unit !== 'binary' && (
                <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{r.unit}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {device.lastSeenAt ? `Last seen: ${new Date(device.lastSeenAt).toLocaleTimeString()}` : 'Never polled'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); onPoll(); }}
            disabled={polling}
            style={{
              background: `${color}18`, color, border: 'none', borderRadius: 6,
              padding: '5px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
            }}>
            <RefreshCw size={13} className={polling ? 'spin' : ''} /> Poll
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              background: '#ef444412', color: '#ef4444', border: 'none', borderRadius: 6,
              padding: '5px 8px', cursor: 'pointer',
            }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Device Modal ──
function AddDeviceModal({ properties, meta, onClose }: { properties: any[]; meta: any; onClose: () => void }) {
  const [createDevice, { isLoading }] = useCreateBmsDeviceMutation();
  const [form, setForm] = useState({
    propertyId: '', deviceName: '', deviceType: 'hvac', protocol: 'bacnet_ip',
    ipAddress: '', port: '', bacnetDeviceId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDevice(form).unwrap();
      onClose();
    } catch { /* toast */ }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Add BMS Device</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={labelStyle}>
            Property
            <select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}
              required style={inputStyle}>
              <option value="">Select property</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Device Name
            <input value={form.deviceName} onChange={e => setForm(f => ({ ...f, deviceName: e.target.value }))}
              required placeholder="e.g. AHU B1 Controller" style={inputStyle} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              Device Type
              <select value={form.deviceType} onChange={e => setForm(f => ({ ...f, deviceType: e.target.value }))}
                style={inputStyle}>
                {(meta?.deviceTypes || ['hvac', 'elevator', 'fire_panel', 'power_meter', 'water_meter']).map((t: string) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Protocol
              <select value={form.protocol} onChange={e => setForm(f => ({ ...f, protocol: e.target.value }))}
                style={inputStyle}>
                {(meta?.protocols || ['bacnet_ip', 'modbus_tcp']).map((p: string) => (
                  <option key={p} value={p}>{PROTOCOL_LABELS[p] || p}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              IP Address
              <input value={form.ipAddress} onChange={e => setForm(f => ({ ...f, ipAddress: e.target.value }))}
                placeholder="192.168.1.50" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Port
              <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                placeholder="47808" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              BACnet ID
              <input type="number" value={form.bacnetDeviceId} onChange={e => setForm(f => ({ ...f, bacnetDeviceId: e.target.value }))}
                placeholder="1001" style={inputStyle} />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={isLoading}
            style={{ marginTop: 8, padding: '10px 0' }}>
            {isLoading ? 'Creating...' : 'Add Device'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Device Detail Drawer ──
function DeviceDetailDrawer({ device, onClose }: { device: any; onClose: () => void }) {
  const readings = device.latestReadings || device.readings || [];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 440, maxWidth: '90vw',
        background: 'var(--bg-card)', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)',
        overflowY: 'auto', padding: 28, zIndex: 1001,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{device.deviceName}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <InfoItem label="Type" value={device.deviceType.replace(/_/g, ' ')} />
          <InfoItem label="Protocol" value={PROTOCOL_LABELS[device.protocol] || device.protocol} />
          <InfoItem label="IP Address" value={device.ipAddress || '—'} />
          <InfoItem label="Port" value={device.port || '—'} />
          <InfoItem label="Status" value={device.isActive ? '✅ Active' : '⛔ Inactive'} />
          <InfoItem label="Fault" value={device.faultActive ? '🔴 ' + (device.faultMessage || 'Active') : '🟢 None'} />
          <InfoItem label="Property" value={device.property?.name || '—'} />
          <InfoItem label="Last Seen" value={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'} />
        </div>

        {/* Readings */}
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Latest Readings</h3>
        {readings.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No readings yet. Poll the device to generate data.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {readings.map((r: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-tertiary)', borderRadius: 8, padding: '10px 14px',
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.pointName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {r.pointType?.replace(/_/g, ' ')}
                    {r.readAt && ` · ${new Date(r.readAt).toLocaleTimeString()}`}
                  </div>
                </div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>
                  {typeof r.value === 'number' ? r.value : Number(r.value || 0).toFixed(1)}
                  {r.unit && r.unit !== 'binary' && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>{r.unit}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{String(value)}</div>
    </div>
  );
}

// ── Styles ──
const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, minWidth: 160,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: 16, padding: 28,
  width: 520, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
};

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13,
};
