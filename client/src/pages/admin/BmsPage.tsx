import React, { useState, useMemo } from 'react';
import {
  useGetBmsSummaryQuery, useGetBmsDevicesQuery, useGetBmsMetaQuery,
  useCreateBmsDeviceMutation, useDeleteBmsDeviceMutation, usePollBmsDeviceMutation,
  useUpdateBmsDeviceMutation, useGetBmsReadingsQuery, useGetBmsFaultsQuery,
} from '../../store/api/integrationsApi';
import { useGetPropertiesQuery } from '../../store/api/propertiesApi';
import {
  Server, Plus, RefreshCw, Trash2, Wifi, WifiOff, AlertTriangle,
  Thermometer, Zap, Droplets, Shield, ArrowUpDown, Activity, X,
  Search, LayoutGrid, List, ChevronRight, Settings, Clock, Signal,
  CheckCircle, XCircle, Edit3, Eye, BarChart3, AlertCircle, Gauge, Power,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════
   Constants & Helpers
   ═══════════════════════════════════════════════════ */

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  hvac: <Thermometer size={18} />,
  elevator: <ArrowUpDown size={18} />,
  fire_panel: <Shield size={18} />,
  power_meter: <Zap size={18} />,
  water_meter: <Droplets size={18} />,
  lighting: <Power size={18} />,
  access_control: <Server size={18} />,
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

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  online: { label: 'Online', color: '#10b981', bg: '#10b98118' },
  offline: { label: 'Offline', color: '#ef4444', bg: '#ef444418' },
  fault: { label: 'Fault', color: '#f59e0b', bg: '#f59e0b18' },
};

function getDeviceStatus(device: any): string {
  if (device.faultActive) return 'fault';
  if (!device.isActive) return 'offline';
  return 'online';
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ═══════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════ */

export default function BmsPage() {
  const [propertyFilter, setPropertyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);

  const { data: summary } = useGetBmsSummaryQuery();
  const { data: devicesRaw, isLoading, isFetching } = useGetBmsDevicesQuery({
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

  // Client-side filtering
  const filteredDevices = useMemo(() => {
    let result = devices;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d: any) =>
        d.deviceName?.toLowerCase().includes(q) ||
        d.ipAddress?.includes(q) ||
        d.deviceType?.includes(q)
      );
    }
    if (statusFilter) {
      result = result.filter((d: any) => getDeviceStatus(d) === statusFilter);
    }
    return result;
  }, [devices, searchQuery, statusFilter]);

  const handlePoll = async (deviceId: string) => {
    try { await pollDevice(deviceId).unwrap(); } catch { /* toast */ }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this BMS device and all its readings?')) return;
    try { await deleteDevice(id).unwrap(); } catch { /* toast */ }
  };

  const handlePollAll = async () => {
    for (const d of devices.filter((d: any) => d.isActive)) {
      try { await pollDevice(d.id).unwrap(); } catch { /* skip */ }
    }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}><Server size={22} /></div>
            Building Management System
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: 14 }}>
            Monitor, manage and poll BMS devices across all properties
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handlePollAll}
            disabled={polling}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
              cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500,
            }}>
            <RefreshCw size={15} className={polling ? 'spin' : ''} /> Poll All
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8 }}>
            <Plus size={16} /> Add Device
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard icon={<Server size={20} />} label="Total Devices" value={stats.totalDevices}
          color="#3b82f6" subtitle={`${stats.byType?.length || 0} types`} />
        <StatCard icon={<Wifi size={20} />} label="Online" value={stats.activeDevices}
          color="#10b981" subtitle={stats.totalDevices > 0 ? `${Math.round((stats.activeDevices / stats.totalDevices) * 100)}% uptime` : '—'} />
        <StatCard icon={<AlertTriangle size={20} />} label="Faults" value={stats.faultDevices}
          color="#ef4444" subtitle={stats.faultDevices === 0 ? 'All clear' : 'Needs attention'} />
        <StatCard icon={<BarChart3 size={20} />} label="Total Readings" value={(stats.totalReadings || 0).toLocaleString()}
          color="#8b5cf6" subtitle="All time" />
      </div>

      {/* ── Type Breakdown ── */}
      {(stats.byType?.length > 0) && (
        <div style={{
          display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap',
        }}>
          {(stats.byType || []).map((t: any) => (
            <button key={t.type}
              onClick={() => setTypeFilter(typeFilter === t.type ? '' : t.type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                borderRadius: 10, border: `1px solid ${typeFilter === t.type ? DEVICE_COLORS[t.type] || '#666' : 'var(--border)'}`,
                background: typeFilter === t.type ? `${DEVICE_COLORS[t.type]}15` : 'var(--bg-card)',
                cursor: 'pointer', transition: 'all 0.2s', color: 'var(--text-primary)', fontSize: 13,
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${DEVICE_COLORS[t.type] || '#666'}18`, color: DEVICE_COLORS[t.type] || '#666',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{DEVICE_ICONS[t.type] || <Server size={16} />}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>{t.count}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{formatLabel(t.type)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Search + Filter Bar ── */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{
          position: 'relative', flex: 1, minWidth: 200,
        }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search devices by name, IP..."
            style={{
              ...inputStyle, paddingLeft: 36, width: '100%', boxSizing: 'border-box',
            }}
          />
        </div>
        <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} style={selectStyle}>
          <option value="">All Properties</option>
          {propertyList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Status</option>
          <option value="online">🟢 Online</option>
          <option value="fault">🟡 Fault</option>
          <option value="offline">🔴 Offline</option>
        </select>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 2 }}>
          <button onClick={() => setViewMode('grid')}
            style={{
              ...viewToggleBtn, background: viewMode === 'grid' ? 'var(--bg-card)' : 'transparent',
              boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
            }}><LayoutGrid size={16} /></button>
          <button onClick={() => setViewMode('list')}
            style={{
              ...viewToggleBtn, background: viewMode === 'list' ? 'var(--bg-card)' : 'transparent',
              boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
            }}><List size={16} /></button>
        </div>
        {isFetching && <RefreshCw size={16} className="spin" style={{ color: 'var(--text-secondary)' }} />}
      </div>

      {/* ── Device Grid/List ── */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(360px, 1fr))' : '1fr', gap: 14 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              background: 'var(--bg-card)', borderRadius: 14, padding: 22,
              border: '1px solid var(--border)', height: viewMode === 'grid' ? 200 : 80,
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
      ) : filteredDevices.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: 'var(--bg-card)',
          borderRadius: 16, border: '1px dashed var(--border)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Server size={28} style={{ opacity: 0.4 }} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>
            {devices.length === 0 ? 'No BMS devices yet' : 'No devices match your filters'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            {devices.length === 0
              ? 'Add your first BMS device to start monitoring building systems.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {devices.length === 0 && (
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}
              style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Add First Device
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {filteredDevices.map((device: any) => (
            <DeviceCard key={device.id} device={device}
              onPoll={() => handlePoll(device.id)}
              onDelete={() => handleDelete(device.id)}
              onSelect={() => setSelectedDevice(device)}
              polling={polling}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* List header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 120px 140px 120px 120px 80px',
            padding: '8px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>Device</span><span>Type</span><span>Protocol</span>
            <span>Property</span><span>Status</span><span>Last Seen</span><span>Actions</span>
          </div>
          {filteredDevices.map((device: any) => (
            <DeviceListRow key={device.id} device={device}
              onPoll={() => handlePoll(device.id)}
              onDelete={() => handleDelete(device.id)}
              onSelect={() => setSelectedDevice(device)}
              polling={polling}
            />
          ))}
        </div>
      )}

      {/* ── Add Device Modal ── */}
      {showAddModal && (
        <AddDeviceWizard
          properties={propertyList}
          meta={meta?.data}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ── Device Detail Drawer ── */}
      {selectedDevice && (
        <DeviceDetailDrawer device={selectedDevice} onClose={() => setSelectedDevice(null)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Stat Card
   ═══════════════════════════════════════════════════ */

function StatCard({ icon, label, value, color, subtitle }: {
  icon: React.ReactNode; label: string; value: any; color: string; subtitle: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 14, padding: '18px 20px',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14,
      transition: 'all 0.2s',
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: `${color}15`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.7, marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Device Card (Grid View)
   ═══════════════════════════════════════════════════ */

function DeviceCard({ device, onPoll, onDelete, onSelect, polling }: any) {
  const color = DEVICE_COLORS[device.deviceType] || '#666';
  const icon = DEVICE_ICONS[device.deviceType] || <Server size={18} />;
  const readings = device.latestReadings || [];
  const status = getDeviceStatus(device);
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.offline;

  return (
    <div onClick={onSelect} style={{
      background: 'var(--bg-card)', borderRadius: 14, padding: '18px 20px',
      border: `1px solid ${status === 'fault' ? '#f59e0b44' : status === 'offline' ? '#ef444433' : 'var(--border)'}`,
      cursor: 'pointer', transition: 'all 0.2s',
      boxShadow: status === 'fault' ? '0 0 16px #f59e0b11' : 'none',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = status === 'fault' ? '0 0 16px #f59e0b11' : 'none'; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${color}15`, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{icon}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{device.deviceName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {PROTOCOL_LABELS[device.protocol] || device.protocol}
              {device.ipAddress && <span> · {device.ipAddress}{device.port ? `:${device.port}` : ''}</span>}
            </div>
          </div>
        </div>
        {/* Status Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: statusInfo.bg, color: statusInfo.color,
          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: statusInfo.color,
            boxShadow: status === 'online' ? `0 0 6px ${statusInfo.color}` : 'none',
          }} />
          {statusInfo.label}
        </div>
      </div>

      {/* Property */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Signal size={12} /> {device.property?.name || 'Unknown property'}
      </div>

      {/* Fault Banner */}
      {device.faultActive && device.faultMessage && (
        <div style={{
          background: '#f59e0b12', borderRadius: 10, padding: '8px 12px', fontSize: 12,
          color: '#f59e0b', marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center',
          border: '1px solid #f59e0b22',
        }}>
          <AlertCircle size={14} /> {device.faultMessage}
        </div>
      )}

      {/* Readings */}
      {readings.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: 6, marginBottom: 14,
        }}>
          {readings.slice(0, 4).map((r: any, i: number) => (
            <div key={i} style={{
              background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 10px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.pointName}
              </div>
              <div style={{ fontFamily: '"SF Mono", "Fira Code", monospace', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'baseline', gap: 3 }}>
                {typeof r.value === 'number' ? r.value : Number(r.value || 0).toFixed(1)}
                {r.unit && r.unit !== 'binary' && (
                  <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>{r.unit}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={12} /> {timeAgo(device.lastSeenAt)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); onPoll(); }}
            disabled={polling}
            title="Poll device"
            style={{
              background: `${color}12`, color, border: 'none', borderRadius: 8,
              padding: '6px 12px', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
              transition: 'all 0.15s',
            }}>
            <RefreshCw size={13} className={polling ? 'spin' : ''} /> Poll
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete device"
            style={{
              background: '#ef444410', color: '#ef4444', border: 'none', borderRadius: 8,
              padding: '6px 8px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Device List Row
   ═══════════════════════════════════════════════════ */

function DeviceListRow({ device, onPoll, onDelete, onSelect, polling }: any) {
  const status = getDeviceStatus(device);
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.offline;
  const color = DEVICE_COLORS[device.deviceType] || '#666';

  return (
    <div onClick={onSelect} style={{
      display: 'grid', gridTemplateColumns: '1fr 120px 120px 140px 120px 120px 80px',
      padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 10,
      border: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center',
      transition: 'all 0.15s', fontSize: 13,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}15`, color, flexShrink: 0,
        }}>{DEVICE_ICONS[device.deviceType] || <Server size={16} />}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{device.deviceName}</div>
          {device.ipAddress && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{device.ipAddress}</div>}
        </div>
      </div>
      <span style={{ textTransform: 'capitalize', fontSize: 12, color: 'var(--text-secondary)' }}>{formatLabel(device.deviceType)}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{PROTOCOL_LABELS[device.protocol] || device.protocol}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{device.property?.name || '—'}</span>
      <span>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: statusInfo.bg, color: statusInfo.color,
          padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusInfo.color }} />
          {statusInfo.label}
        </div>
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{timeAgo(device.lastSeenAt)}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={(e) => { e.stopPropagation(); onPoll(); }} disabled={polling}
          style={{
            background: `${color}12`, color, border: 'none', borderRadius: 6,
            padding: '4px 8px', cursor: 'pointer',
          }}><RefreshCw size={12} className={polling ? 'spin' : ''} /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: '#ef444410', color: '#ef4444', border: 'none', borderRadius: 6,
            padding: '4px 6px', cursor: 'pointer',
          }}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Add Device Wizard (Multi-Step)
   ═══════════════════════════════════════════════════ */

function AddDeviceWizard({ properties, meta, onClose }: { properties: any[]; meta: any; onClose: () => void }) {
  const [createDevice, { isLoading }] = useCreateBmsDeviceMutation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    propertyId: '', deviceName: '', deviceType: 'hvac', protocol: 'bacnet_ip',
    ipAddress: '', port: '', bacnetDeviceId: '', description: '',
  });

  const STEPS = [
    { num: 1, label: 'Basic Info', icon: <Settings size={16} /> },
    { num: 2, label: 'Device Type', icon: <Server size={16} /> },
    { num: 3, label: 'Network', icon: <Wifi size={16} /> },
  ];

  const canNext = () => {
    if (step === 1) return form.propertyId && form.deviceName;
    if (step === 2) return form.deviceType && form.protocol;
    return true;
  };

  const handleSubmit = async () => {
    try {
      await createDevice(form).unwrap();
      onClose();
    } catch { /* toast */ }
  };

  const deviceTypes = meta?.deviceTypes || ['hvac', 'elevator', 'fire_panel', 'power_meter', 'water_meter', 'lighting', 'access_control'];
  const protocols = meta?.protocols || ['bacnet_ip', 'bacnet_mstp', 'modbus_tcp', 'lonworks'];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{
        ...modalStyle, width: 580,
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Add BMS Device</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Step {step} of 3 — {STEPS[step - 1].label}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, padding: '0 4px' }}>
          {STEPS.map((s) => (
            <div key={s.num} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10,
              background: step === s.num ? 'var(--primary-bg, #3b82f615)' : 'var(--bg-tertiary)',
              border: `1px solid ${step === s.num ? 'var(--primary, #3b82f6)' : 'transparent'}`,
              transition: 'all 0.2s', cursor: s.num < step ? 'pointer' : 'default',
              opacity: s.num > step ? 0.5 : 1,
            }}
              onClick={() => { if (s.num < step) setStep(s.num); }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: step >= s.num ? 'var(--primary, #3b82f6)' : 'var(--bg-card)',
                color: step >= s.num ? '#fff' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {step > s.num ? <CheckCircle size={14} /> : s.num}
              </div>
              <span style={{ fontSize: 12, fontWeight: step === s.num ? 600 : 400 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={labelStyle}>
              Property *
              <select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}
                required style={inputStyle}>
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Device Name *
              <input value={form.deviceName} onChange={e => setForm(f => ({ ...f, deviceName: e.target.value }))}
                required placeholder="e.g. AHU B1 Controller" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Description (optional)
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Location details, notes..."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Device Type</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {deviceTypes.map((t: string) => {
                  const c = DEVICE_COLORS[t] || '#666';
                  return (
                    <button key={t} onClick={() => setForm(f => ({ ...f, deviceType: t }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                        borderRadius: 10, border: `2px solid ${form.deviceType === t ? c : 'var(--border)'}`,
                        background: form.deviceType === t ? `${c}12` : 'var(--bg-tertiary)',
                        cursor: 'pointer', transition: 'all 0.15s', color: 'var(--text-primary)',
                        fontSize: 12, fontWeight: form.deviceType === t ? 600 : 400,
                        textAlign: 'left',
                      }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `${c}20`, color: c,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{DEVICE_ICONS[t] || <Server size={14} />}</div>
                      <span style={{ textTransform: 'capitalize' }}>{formatLabel(t)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Communication Protocol</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {protocols.map((p: string) => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, protocol: p }))}
                    style={{
                      padding: '12px 14px', borderRadius: 10,
                      border: `2px solid ${form.protocol === p ? '#3b82f6' : 'var(--border)'}`,
                      background: form.protocol === p ? '#3b82f612' : 'var(--bg-tertiary)',
                      cursor: 'pointer', transition: 'all 0.15s', color: 'var(--text-primary)',
                      fontSize: 13, fontWeight: form.protocol === p ? 600 : 400,
                      textAlign: 'left',
                    }}>
                    <div style={{ fontWeight: 600 }}>{PROTOCOL_LABELS[p] || p}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {p.includes('bacnet') ? 'ASHRAE Standard' : p.includes('modbus') ? 'Industrial Standard' : 'Legacy'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16,
              display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${DEVICE_COLORS[form.deviceType] || '#666'}18`,
                color: DEVICE_COLORS[form.deviceType] || '#666',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{DEVICE_ICONS[form.deviceType] || <Server size={18} />}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{form.deviceName || 'Unnamed'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {formatLabel(form.deviceType)} · {PROTOCOL_LABELS[form.protocol] || form.protocol}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <label style={labelStyle}>
                IP Address
                <input value={form.ipAddress} onChange={e => setForm(f => ({ ...f, ipAddress: e.target.value }))}
                  placeholder="192.168.1.50" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Port
                <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                  placeholder={form.protocol === 'bacnet_ip' ? '47808' : form.protocol === 'modbus_tcp' ? '502' : '—'}
                  style={inputStyle} />
              </label>
            </div>
            {form.protocol.includes('bacnet') && (
              <label style={labelStyle}>
                BACnet Device Instance ID
                <input type="number" value={form.bacnetDeviceId} onChange={e => setForm(f => ({ ...f, bacnetDeviceId: e.target.value }))}
                  placeholder="1001" style={inputStyle} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Unique BACnet identifier assigned to this device
                </span>
              </label>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            style={{
              padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--bg-card)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: 'var(--text-primary)',
            }}>
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canNext()}
              className="btn btn-primary"
              style={{
                padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: canNext() ? 1 : 0.5,
              }}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={isLoading}
              className="btn btn-primary"
              style={{
                padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {isLoading ? <><RefreshCw size={14} className="spin" /> Creating...</> : <><Plus size={16} /> Add Device</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Device Detail Drawer (Enhanced)
   ═══════════════════════════════════════════════════ */

function DeviceDetailDrawer({ device, onClose }: { device: any; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'readings' | 'faults'>('overview');
  const readings = device.latestReadings || device.readings || [];
  const color = DEVICE_COLORS[device.deviceType] || '#666';
  const status = getDeviceStatus(device);
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.offline;

  // Fetch fault data when tab selected
  const { data: faultData } = useGetBmsFaultsQuery(device.id, { skip: activeTab !== 'faults' });
  const faults = faultData?.data || faultData;

  // Fetch readings when tab selected
  const { data: readingsData } = useGetBmsReadingsQuery(
    { deviceId: device.id, limit: 50 },
    { skip: activeTab !== 'readings' },
  );
  const allReadings = readingsData?.data || readingsData || [];

  const TABS = [
    { id: 'overview', label: 'Overview', icon: <Eye size={14} /> },
    { id: 'readings', label: 'Readings', icon: <BarChart3 size={14} /> },
    { id: 'faults', label: 'Faults', icon: <AlertTriangle size={14} /> },
  ] as const;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 480, maxWidth: '95vw',
        background: 'var(--bg-card)', boxShadow: '-12px 0 40px rgba(0,0,0,0.3)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
        zIndex: 1001,
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                width: 50, height: 50, borderRadius: 14,
                background: `${color}15`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{DEVICE_ICONS[device.deviceType] || <Server size={22} />}</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{device.deviceName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {formatLabel(device.deviceType)} · {PROTOCOL_LABELS[device.protocol] || device.protocol}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', borderRadius: 8, padding: 6,
            }}>
              <X size={18} />
            </button>
          </div>

          {/* Status Banner */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: statusInfo.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: statusInfo.color }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', background: statusInfo.color,
                boxShadow: status === 'online' ? `0 0 8px ${statusInfo.color}` : 'none',
              }} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{statusInfo.label}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Last seen: {timeAgo(device.lastSeenAt)}
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {TABS.map(tab => (
              <button key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? 'var(--primary, #3b82f6)' : 'var(--text-secondary)',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--primary, #3b82f6)' : 'transparent'}`,
                  marginBottom: -1, transition: 'all 0.15s',
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '20px 28px', flex: 1, overflow: 'auto' }}>
          {activeTab === 'overview' && (
            <>
              {/* Info Grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24,
              }}>
                <InfoItem label="Type" value={formatLabel(device.deviceType)} icon={<Server size={12} />} />
                <InfoItem label="Protocol" value={PROTOCOL_LABELS[device.protocol] || device.protocol} icon={<Wifi size={12} />} />
                <InfoItem label="IP Address" value={device.ipAddress || '—'} icon={<Signal size={12} />} />
                <InfoItem label="Port" value={device.port || '—'} icon={<Settings size={12} />} />
                <InfoItem label="BACnet ID" value={device.bacnetDeviceId || '—'} icon={<Gauge size={12} />} />
                <InfoItem label="Property" value={device.property?.name || '—'} icon={<Server size={12} />} />
              </div>

              {/* Fault Info */}
              {device.faultActive && (
                <div style={{
                  background: '#ef444410', borderRadius: 12, padding: 16, marginBottom: 24,
                  border: '1px solid #ef444422',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    <AlertCircle size={15} /> Active Fault
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {device.faultMessage || 'Unknown fault'}
                  </div>
                </div>
              )}

              {/* Latest Readings */}
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={15} /> Latest Readings
              </h3>
              {readings.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 30, background: 'var(--bg-tertiary)',
                  borderRadius: 12, color: 'var(--text-secondary)', fontSize: 13,
                }}>
                  No readings yet. Poll the device to generate data.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {readings.map((r: any, i: number) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 16px',
                    }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{r.pointName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {r.pointType?.replace(/_/g, ' ')}
                          {r.readAt && ` · ${new Date(r.readAt).toLocaleTimeString()}`}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: '"SF Mono", "Fira Code", monospace',
                        fontWeight: 700, fontSize: 18,
                        display: 'flex', alignItems: 'baseline', gap: 4,
                      }}>
                        {typeof r.value === 'number' ? r.value : Number(r.value || 0).toFixed(1)}
                        {r.unit && r.unit !== 'binary' && (
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{r.unit}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'readings' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Reading History (Last 50)</h3>
              {allReadings.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 30, background: 'var(--bg-tertiary)',
                  borderRadius: 12, color: 'var(--text-secondary)', fontSize: 13,
                }}>No readings recorded yet.</div>
              ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  maxHeight: 500, overflow: 'auto',
                }}>
                  {allReadings.map((r: any, i: number) => (
                    <div key={r.id || i} style={{
                      display: 'grid', gridTemplateColumns: '1fr 80px 60px 100px',
                      padding: '8px 12px', background: i % 2 === 0 ? 'var(--bg-tertiary)' : 'transparent',
                      borderRadius: 6, fontSize: 12, alignItems: 'center',
                    }}>
                      <span style={{ fontWeight: 500 }}>{r.pointName}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, textAlign: 'right' }}>
                        {typeof r.value === 'number' ? r.value : Number(r.value || 0).toFixed(1)}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>{r.unit || '—'}</span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontSize: 11 }}>
                        {r.readAt ? new Date(r.readAt).toLocaleTimeString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'faults' && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Fault History</h3>
              {/* Current fault */}
              {faults?.currentFault ? (
                <div style={{
                  background: '#ef444412', borderRadius: 12, padding: 14, marginBottom: 16,
                  border: '1px solid #ef444422',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                    <XCircle size={14} /> Current Fault
                  </div>
                  <div style={{ fontSize: 13 }}>{faults.currentFault.message || 'Active fault'}</div>
                  {faults.currentFault.since && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Since: {new Date(faults.currentFault.since).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#10b98112', borderRadius: 12, padding: 14, marginBottom: 16,
                  color: '#10b981', fontSize: 13, fontWeight: 500,
                }}>
                  <CheckCircle size={16} /> No active faults
                </div>
              )}

              {/* Historical faults */}
              {faults?.historicalFaults?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Historical Bad Readings
                  </div>
                  {faults.historicalFaults.map((f: any, i: number) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr 80px 70px 100px',
                      padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6,
                      fontSize: 12, alignItems: 'center',
                    }}>
                      <span style={{ fontWeight: 500 }}>{f.pointName}</span>
                      <span style={{ fontFamily: 'monospace' }}>{Number(f.value || 0).toFixed(1)}</span>
                      <span style={{
                        color: f.quality === 'bad' ? '#ef4444' : '#f59e0b', fontWeight: 600,
                      }}>{f.quality}</span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontSize: 11 }}>
                        {f.readAt ? new Date(f.readAt).toLocaleString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center', padding: 24, background: 'var(--bg-tertiary)',
                  borderRadius: 12, color: 'var(--text-secondary)', fontSize: 13,
                }}>No historical faults recorded.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════════ */

function InfoItem({ label, value, icon }: { label: string; value: any; icon?: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{String(value)}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════ */

const selectStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, minWidth: 150,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none', transition: 'border-color 0.15s',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: 20, padding: 28,
  width: 520, maxWidth: '90vw', maxHeight: '88vh', overflowY: 'auto',
  boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
  border: '1px solid var(--border)',
};

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500,
};

const viewToggleBtn: React.CSSProperties = {
  border: 'none', borderRadius: 6, padding: '6px 10px',
  cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center',
  transition: 'all 0.15s',
};
