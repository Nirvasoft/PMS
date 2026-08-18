import React, { useState, useMemo } from 'react';
import {
  useGetBmsSummaryQuery, useGetBmsDevicesQuery, useGetBmsMetaQuery,
  useCreateBmsDeviceMutation, useDeleteBmsDeviceMutation, usePollBmsDeviceMutation,
  useUpdateBmsDeviceMutation, useGetBmsReadingsQuery, useGetBmsFaultsQuery,
} from '../../store/api/integrationsApi';
import { useGetPropertiesQuery } from '../../store/api/propertiesApi';
import { useConfirm } from '../../components/DialogProvider';
import {
  Server, Plus, RefreshCw, Trash2, Wifi, WifiOff, AlertTriangle,
  Thermometer, Zap, Droplets, Shield, ArrowUpDown, Activity, X,
  Search, LayoutGrid, List, ChevronRight, Settings, Clock, Signal,
  CheckCircle, XCircle, Eye, BarChart3, AlertCircle, Gauge, Power, Check,
} from 'lucide-react';

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const TYPE_CFG: Record<string, { icon: any; color: string; gradient: string; label: string }> = {
  hvac:           { icon: Thermometer, color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)', label: 'HVAC' },
  elevator:       { icon: ArrowUpDown, color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', label: 'Elevator' },
  fire_panel:     { icon: Shield,      color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #f87171)', label: 'Fire Panel' },
  power_meter:    { icon: Zap,         color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', label: 'Power Meter' },
  water_meter:    { icon: Droplets,    color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)', label: 'Water Meter' },
  lighting:       { icon: Power,       color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)', label: 'Lighting' },
  access_control: { icon: Server,      color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)', label: 'Access Control' },
};

const PROTOCOL_LABELS: Record<string, string> = {
  bacnet_ip: 'BACnet/IP', bacnet_mstp: 'BACnet MS/TP', modbus_tcp: 'Modbus TCP', lonworks: 'LonWorks',
};

const PROTOCOL_DESC: Record<string, string> = {
  bacnet_ip: 'Most common — Ethernet-based building automation',
  bacnet_mstp: 'Serial RS-485 based, legacy installations',
  modbus_tcp: 'Industrial standard — TCP/IP metering devices',
  lonworks: 'Peer-to-peer networking for field devices',
};

function getCfg(type: string) { return TYPE_CFG[type] || { icon: Server, color: '#64748b', gradient: 'linear-gradient(135deg, #64748b, #94a3b8)', label: type }; }
function getStatus(d: any) { return d.faultActive ? 'fault' : !d.isActive ? 'offline' : 'online'; }
function fmt(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function ago(s: string | null) {
  if (!s) return 'Never';
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
}

const statusCfg = {
  online: { label: 'Online', dot: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  fault:  { label: 'Fault',  dot: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  offline:{ label: 'Offline',dot: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
} as Record<string, { label: string; dot: string; bg: string }>;

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function BmsPage() {
  const [propFilter, setPropFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showAdd, setShowAdd] = useState(false);
  const [selDevice, setSelDevice] = useState<any>(null);

  const { data: summary } = useGetBmsSummaryQuery();
  const { data: devicesRaw, isLoading, isFetching } = useGetBmsDevicesQuery({
    propertyId: propFilter || undefined, deviceType: typeFilter || undefined,
  });
  const { data: properties } = useGetPropertiesQuery({});
  const { data: meta } = useGetBmsMetaQuery();
  const [pollDevice, { isLoading: polling }] = usePollBmsDeviceMutation();
  const [deleteDevice] = useDeleteBmsDeviceMutation();
  const confirmDialog = useConfirm();

  const devices = devicesRaw?.data || devicesRaw || [];
  const stats = summary?.data || summary || { totalDevices: 0, activeDevices: 0, faultDevices: 0, totalReadings: 0, byType: [] };
  const propList = properties?.data || properties || [];

  const filtered = useMemo(() => {
    let r = devices;
    if (search) { const q = search.toLowerCase(); r = r.filter((d: any) => d.deviceName?.toLowerCase().includes(q) || d.ipAddress?.includes(q)); }
    if (statusFilter) r = r.filter((d: any) => getStatus(d) === statusFilter);
    return r;
  }, [devices, search, statusFilter]);

  const handlePoll = async (id: string) => { try { await pollDevice(id).unwrap(); } catch {} };
  const handleDelete = async (id: string) => { if (!(await confirmDialog('Delete this device and all its readings?', { danger: true, confirmText: 'Delete' }))) return; try { await deleteDevice(id).unwrap(); } catch {} };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1440 }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
          }}><Server size={24} /></div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Building Management System
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}>
              {stats.totalDevices} device{stats.totalDevices !== 1 ? 's' : ''} across {propList.length} propert{propList.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { for (const d of devices.filter((d: any) => d.isActive)) handlePoll(d.id); }}
            disabled={polling} style={outlineBtn}>
            <RefreshCw size={15} className={polling ? 'spin' : ''} /> Poll All
          </button>
          <button onClick={() => setShowAdd(true)} style={primaryBtn}>
            <Plus size={16} /> Add Device
          </button>
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Stat icon={<Server size={20} />} label="Total Devices" value={stats.totalDevices} color="var(--accent-solid)" />
        <Stat icon={<Wifi size={20} />} label="Online" value={stats.activeDevices} color="#10b981" />
        <Stat icon={<AlertTriangle size={20} />} label="Faults" value={stats.faultDevices} color="#ef4444" />
        <Stat icon={<BarChart3 size={20} />} label="Readings" value={(stats.totalReadings || 0).toLocaleString()} color="#8b5cf6" />
      </div>

      {/* ── TYPE CHIPS ── */}
      {(stats.byType?.length > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(stats.byType || []).map((t: any) => {
            const c = getCfg(t.type);
            const active = typeFilter === t.type;
            return (
              <button key={t.type} onClick={() => setTypeFilter(active ? '' : t.type)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
                borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                border: `1.5px solid ${active ? c.color : 'var(--border)'}`,
                background: active ? `${c.color}14` : 'var(--surface)',
                color: active ? c.color : 'var(--text-primary)',
                transition: 'all 0.2s',
              }}>
                {React.createElement(c.icon, { size: 14 })}
                {c.label}
                <span style={{
                  background: active ? c.color : 'var(--surface-elevated)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                  minWidth: 18, textAlign: 'center' as const,
                }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── TOOLBAR ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or IP…"
            style={{ ...inputBase, paddingLeft: 36, width: '100%', boxSizing: 'border-box' as const }} />
        </div>
        <select value={propFilter} onChange={e => setPropFilter(e.target.value)} style={selectBase}>
          <option value="">All Properties</option>
          {propList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectBase}>
          <option value="">All Status</option>
          <option value="online">🟢 Online</option>
          <option value="fault">🟡 Fault</option>
          <option value="offline">🔴 Offline</option>
        </select>
        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--surface-elevated)', borderRadius: 8, padding: 3, gap: 2 }}>
          {(['grid', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              border: 'none', borderRadius: 6, padding: '5px 9px', cursor: 'pointer',
              background: view === v ? 'var(--surface)' : 'transparent',
              color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              display: 'flex', alignItems: 'center',
            }}>
              {v === 'grid' ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
        {isFetching && <RefreshCw size={14} className="spin" style={{ color: 'var(--text-secondary)' }} />}
      </div>

      {/* ── DEVICE GRID/LIST ── */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(340px, 1fr))' : '1fr', gap: 12 }}>
          {[1,2,3,4,5,6].map(i => <div key={i} style={{ ...cardBase, height: view === 'grid' ? 210 : 70, opacity: 0.4 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasDevices={devices.length > 0} onAdd={() => setShowAdd(true)} />
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {filtered.map((d: any) => (
            <DeviceCard key={d.id} d={d} onPoll={() => handlePoll(d.id)} onDelete={() => handleDelete(d.id)}
              onSelect={() => setSelDevice(d)} polling={polling} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 100px 100px 130px 90px 90px 70px', padding: '6px 14px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
            <span>Device</span><span>Type</span><span>Protocol</span><span>Property</span><span>Status</span><span>Last Seen</span><span></span>
          </div>
          {filtered.map((d: any) => <ListRow key={d.id} d={d} onPoll={() => handlePoll(d.id)} onDelete={() => handleDelete(d.id)} onSelect={() => setSelDevice(d)} polling={polling} />)}
        </div>
      )}

      {showAdd && <AddDeviceWizard properties={propList} meta={meta?.data} onClose={() => setShowAdd(false)} />}
      {selDevice && <DetailDrawer device={selDevice} onClose={() => setSelDevice(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════ */

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: any; color: string }) {
  return (
    <div style={{ ...cardBase, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: `${color}12`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════ */

function EmptyState({ hasDevices, onAdd }: { hasDevices: boolean; onAdd: () => void }) {
  return (
    <div style={{
      textAlign: 'center' as const, padding: '60px 20px',
      background: 'var(--surface)', borderRadius: 16,
      border: '1.5px dashed var(--border)',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'var(--accent-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px', color: 'var(--text-secondary)',
      }}><Server size={32} /></div>
      <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>
        {hasDevices ? 'No devices match your filters' : 'No BMS devices yet'}
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 20px', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
        {hasDevices ? 'Try adjusting your search, type, or status filters.' : 'Connect your building\'s HVAC, metering, fire safety, and access control systems.'}
      </p>
      {!hasDevices && (
        <button onClick={onAdd} style={primaryBtn}>
          <Plus size={16} /> Add First Device
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   DEVICE CARD (grid)
   ═══════════════════════════════════════════ */

function DeviceCard({ d, onPoll, onDelete, onSelect, polling }: any) {
  const cfg = getCfg(d.deviceType);
  const Icon = cfg.icon;
  const st = getStatus(d);
  const sc = statusCfg[st];
  const readings = d.latestReadings || [];

  return (
    <div onClick={onSelect} style={{
      ...cardBase, padding: 0, cursor: 'pointer',
      borderColor: st === 'fault' ? '#f59e0b33' : st === 'offline' ? '#ef444422' : undefined,
      overflow: 'hidden',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      {/* Gradient top bar */}
      <div style={{ height: 3, background: cfg.gradient }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              background: `${cfg.color}12`, color: cfg.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.deviceName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {PROTOCOL_LABELS[d.protocol] || d.protocol}
                {d.ipAddress && <> · <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{d.ipAddress}</span></>}
              </div>
            </div>
          </div>
          <StatusBadge status={st} />
        </div>

        {/* Property */}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Signal size={11} /> {d.property?.name || '—'}
        </div>

        {/* Fault */}
        {d.faultActive && d.faultMessage && (
          <div style={{
            background: '#f59e0b0c', borderRadius: 8, padding: '6px 10px', fontSize: 11,
            color: '#f59e0b', marginBottom: 10, display: 'flex', gap: 5, alignItems: 'center',
            border: '1px solid #f59e0b18',
          }}><AlertCircle size={12} /> {d.faultMessage}</div>
        )}

        {/* Readings grid */}
        {readings.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(readings.length, 3)}, 1fr)`, gap: 6, marginBottom: 12 }}>
            {readings.slice(0, 3).map((r: any, i: number) => (
              <div key={i} style={{
                background: 'var(--surface-elevated)', borderRadius: 8, padding: '8px 10px',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.pointName}</div>
                <div style={{ fontFamily: '"SF Mono","Fira Code",monospace', fontWeight: 700, fontSize: 15 }}>
                  {typeof r.value === 'number' ? r.value : Number(r.value||0).toFixed(1)}
                  {r.unit && r.unit !== 'binary' && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>{r.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> {ago(d.lastSeenAt)}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={e => { e.stopPropagation(); onPoll(); }} disabled={polling}
              style={{ ...smallBtn, background: `${cfg.color}10`, color: cfg.color }}>
              <RefreshCw size={12} className={polling ? 'spin' : ''} /> Poll
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ ...smallBtn, background: '#ef444408', color: '#ef4444' }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   LIST ROW
   ═══════════════════════════════════════════ */

function ListRow({ d, onPoll, onDelete, onSelect, polling }: any) {
  const cfg = getCfg(d.deviceType);
  const Icon = cfg.icon;
  const st = getStatus(d);

  return (
    <div onClick={onSelect} style={{
      display: 'grid', gridTemplateColumns: '1.4fr 100px 100px 130px 90px 90px 70px',
      padding: '10px 14px', ...cardBase, cursor: 'pointer', alignItems: 'center', fontSize: 12,
      borderRadius: 10,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-secondary)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${cfg.color}12`, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{d.deviceName}</div>
          {d.ipAddress && <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{d.ipAddress}</div>}
        </div>
      </div>
      <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' as const, fontSize: 11 }}>{cfg.label}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{PROTOCOL_LABELS[d.protocol] || d.protocol}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{d.property?.name || '—'}</span>
      <StatusBadge status={st} small />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ago(d.lastSeenAt)}</span>
      <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => onPoll()} disabled={polling} style={{ ...smallBtn, background: `${cfg.color}0d`, color: cfg.color, padding: '3px 6px' }}>
          <RefreshCw size={11} className={polling ? 'spin' : ''} />
        </button>
        <button onClick={() => onDelete()} style={{ ...smallBtn, background: '#ef444408', color: '#ef4444', padding: '3px 6px' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STATUS BADGE
   ═══════════════════════════════════════════ */

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const sc = statusCfg[status] || statusCfg.offline;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: sc.bg, padding: small ? '2px 7px' : '3px 10px',
      borderRadius: 20, fontSize: small ? 10 : 11, fontWeight: 600,
      color: sc.dot, whiteSpace: 'nowrap' as const,
    }}>
      <span style={{
        width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: '50%', background: sc.dot,
        boxShadow: status === 'online' ? `0 0 6px ${sc.dot}` : 'none',
        display: 'inline-block',
      }} />
      {sc.label}
    </div>
  );
}

/* ═══════════════════════════════════════════
   ADD DEVICE WIZARD
   ═══════════════════════════════════════════ */

function AddDeviceWizard({ properties, meta, onClose }: { properties: any[]; meta: any; onClose: () => void }) {
  const [createDevice, { isLoading }] = useCreateBmsDeviceMutation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    propertyId: '', deviceName: '', deviceType: 'hvac', protocol: 'bacnet_ip',
    ipAddress: '', port: '', bacnetDeviceId: '',
  });

  const types = meta?.deviceTypes || Object.keys(TYPE_CFG);
  const protocols = meta?.protocols || Object.keys(PROTOCOL_LABELS);

  const canNext = step === 1 ? (form.propertyId && form.deviceName) : step === 2 ? true : true;

  const handleSubmit = async () => {
    try { await createDevice(form).unwrap(); onClose(); } catch {}
  };

  const STEPS = ['Basic Info', 'Device Type', 'Network Config'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 0,
        width: 540, maxWidth: '92vw', maxHeight: '88vh',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        position: 'relative',
      }} onClick={e => e.stopPropagation()}>

        {/* Close button - top right corner */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16, zIndex: 2,
          width: 28, height: 28, borderRadius: 6, border: 'none',
          background: 'var(--surface-elevated)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)',
        }}><X size={14} /></button>

        {/* ── MODAL HEADER with stepper ── */}
        <div style={{
          padding: '24px 28px 22px',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Title */}
          <h2 style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 700 }}>Add BMS Device</h2>
          <p style={{ margin: '0 0 22px', fontSize: 12, color: 'var(--text-secondary)' }}>
            Step {step} of 3 — {STEPS[step - 1]}
          </p>

          {/* Stepper bar */}
          <StepIndicator steps={STEPS} current={step} onStepClick={(n) => { if (step > n) setStep(n); }} />
        </div>

        {/* ── STEP CONTENT ── */}
        <div style={{ padding: '24px 28px', flex: 1, overflow: 'auto' }}>

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Field label="Property" required>
                <select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}
                  required style={fieldInput}>
                  <option value="">Select property…</option>
                  {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Device Name" required>
                <input value={form.deviceName} onChange={e => setForm(f => ({ ...f, deviceName: e.target.value }))}
                  required placeholder="e.g. AHU B1 Controller" style={fieldInput}
                  autoFocus />
              </Field>
              {/* Subtle help text */}
              <div style={{
                background: 'var(--surface-elevated)', borderRadius: 10, padding: '12px 14px',
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Choose the property where this device is physically located. The device name should be descriptive enough to identify it on-site.</span>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Device Type</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                  {types.map((t: string) => {
                    const c = getCfg(t);
                    const sel = form.deviceType === t;
                    const Icon = c.icon;
                    return (
                      <button key={t} onClick={() => setForm(f => ({ ...f, deviceType: t }))} style={{
                        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8,
                        padding: '14px 8px', borderRadius: 12,
                        border: `2px solid ${sel ? c.color : 'var(--border)'}`,
                        background: sel ? `${c.color}08` : 'var(--surface-elevated)',
                        cursor: 'pointer', transition: 'all 0.15s', color: 'var(--text-primary)',
                        position: 'relative' as const,
                      }}>
                        {sel && <div style={{
                          position: 'absolute' as const, top: 5, right: 5,
                          width: 16, height: 16, borderRadius: '50%',
                          background: c.color, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><Check size={9} /></div>}
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: sel ? c.gradient : `${c.color}12`,
                          color: sel ? '#fff' : c.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}><Icon size={18} /></div>
                        <span style={{ fontSize: 11, fontWeight: sel ? 600 : 400, textAlign: 'center' as const }}>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Communication Protocol</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {protocols.map((p: string) => {
                    const sel = form.protocol === p;
                    return (
                      <button key={p} onClick={() => setForm(f => ({ ...f, protocol: p }))} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', borderRadius: 10,
                        border: `2px solid ${sel ? 'var(--accent-solid)' : 'var(--border)'}`,
                        background: sel ? 'var(--accent-subtle)' : 'var(--surface-elevated)',
                        cursor: 'pointer', transition: 'all 0.15s', color: 'var(--text-primary)',
                        textAlign: 'left' as const, width: '100%',
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          border: `2px solid ${sel ? 'var(--accent-solid)' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'all 0.15s',
                        }}>
                          {sel && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-solid)' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: sel ? 600 : 500 }}>{PROTOCOL_LABELS[p] || p}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{PROTOCOL_DESC[p] || ''}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Device preview card */}
              {(() => {
                const c = getCfg(form.deviceType);
                const Icon = c.icon;
                return (
                  <div style={{
                    borderRadius: 12, padding: '14px 16px',
                    display: 'flex', gap: 12, alignItems: 'center',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-elevated)',
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      background: c.gradient, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 3px 10px ${c.color}30`,
                    }}><Icon size={20} /></div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{form.deviceName || 'Unnamed'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {getCfg(form.deviceType).label} · {PROTOCOL_LABELS[form.protocol] || form.protocol}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <Field label="IP Address">
                  <input value={form.ipAddress} onChange={e => setForm(f => ({ ...f, ipAddress: e.target.value }))}
                    placeholder="192.168.1.50" style={fieldInput} />
                </Field>
                <Field label="Port">
                  <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                    placeholder={form.protocol === 'bacnet_ip' ? '47808' : form.protocol === 'modbus_tcp' ? '502' : '—'}
                    style={fieldInput} />
                </Field>
              </div>
              {form.protocol.includes('bacnet') && (
                <Field label="BACnet Device Instance ID" hint="Unique BACnet identifier assigned to this controller">
                  <input type="number" value={form.bacnetDeviceId}
                    onChange={e => setForm(f => ({ ...f, bacnetDeviceId: e.target.value }))}
                    placeholder="1001" style={fieldInput} />
                </Field>
              )}
            </div>
          )}
        </div>

        {/* ── MODAL FOOTER ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', padding: '14px 28px',
          borderTop: '1px solid var(--border)',
        }}>
          <button onClick={() => step > 1 ? setStep(step - 1) : onClose()} style={outlineBtn}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canNext} style={{
              ...primaryBtn, opacity: canNext ? 1 : 0.5, cursor: canNext ? 'pointer' : 'not-allowed',
            }}>
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={isLoading} style={primaryBtn}>
              {isLoading ? <><RefreshCw size={14} className="spin" /> Creating…</> : <><Plus size={15} /> Add Device</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════
   STEP INDICATOR
   ═══════════════════════════════════════════ */

function StepIndicator({ steps, current, onStepClick }: {
  steps: string[]; current: number; onStepClick: (step: number) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '12px 4px',
    }}>
      {steps.map((label, i) => {
        const num = i + 1;
        const done = current > num;
        const active = current === num;
        return (
          <React.Fragment key={num}>
            {i > 0 && (
              <div style={{
                flex: 1, height: 2, margin: '0 4px',
                background: done ? 'var(--accent-solid)' : '#d1d5db',
                borderRadius: 1,
              }} />
            )}
            <div
              onClick={() => onStepClick(num)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                cursor: done ? 'pointer' : 'default',
                flexShrink: 0,
              }}
            >
              {/* Circle — always solid opaque */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done || active ? 'var(--accent-solid)' : '#e2e4e9',
                color: done || active ? '#fff' : '#9ca3af',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {done ? <Check size={13} /> : num}
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? 'var(--text-primary)' : '#9ca3af',
                whiteSpace: 'nowrap' as const,
              }}>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FIELD HELPER
   ═══════════════════════════════════════════ */

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{hint}</span>}
    </label>
  );
}

/* ═══════════════════════════════════════════
   DETAIL DRAWER
   ═══════════════════════════════════════════ */

function DetailDrawer({ device: d, onClose }: { device: any; onClose: () => void }) {
  const [tab, setTab] = useState<'overview' | 'readings' | 'faults'>('overview');
  const cfg = getCfg(d.deviceType);
  const Icon = cfg.icon;
  const st = getStatus(d);

  const { data: faultData } = useGetBmsFaultsQuery(d.id, { skip: tab !== 'faults' });
  const faults = faultData?.data || faultData;
  const { data: rdData } = useGetBmsReadingsQuery({ deviceId: d.id, limit: 50 }, { skip: tab !== 'readings' });
  const allReadings = rdData?.data || rdData || [];
  const readings = d.latestReadings || d.readings || [];

  const TABS = [
    { id: 'overview', label: 'Overview', icon: <Eye size={13} /> },
    { id: 'readings', label: 'Readings', icon: <BarChart3 size={13} /> },
    { id: 'faults', label: 'Faults', icon: <AlertTriangle size={13} /> },
  ] as const;

  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed' as const, right: 0, top: 0, bottom: 0,
        width: 460, maxWidth: '95vw',
        background: 'var(--surface)', boxShadow: '-12px 0 40px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', zIndex: 1001,
      }}>
        {/* Header */}
        <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: cfg.gradient, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 12px ${cfg.color}40`,
              }}><Icon size={22} /></div>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{d.deviceName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {cfg.label} · {PROTOCOL_LABELS[d.protocol] || d.protocol}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'var(--surface-elevated)', cursor: 'pointer', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><X size={16} /></button>
          </div>

          {/* Status */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: statusCfg[st].bg, borderRadius: 10, padding: '8px 12px',
            marginBottom: 14,
          }}>
            <StatusBadge status={st} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Last: {ago(d.lastSeenAt)}</span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? 'var(--accent-solid)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${tab === t.id ? 'var(--accent-solid)' : 'transparent'}`,
                transition: 'all 0.15s', marginBottom: -1,
              }}>{t.icon} {t.label}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '18px 24px', flex: 1, overflow: 'auto' }}>
          {tab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {[
                  { l: 'IP Address', v: d.ipAddress || '—' },
                  { l: 'Port', v: d.port || '—' },
                  { l: 'BACnet ID', v: d.bacnetDeviceId || '—' },
                  { l: 'Property', v: d.property?.name || '—' },
                ].map(x => (
                  <div key={x.l} style={{ background: 'var(--surface-elevated)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>{x.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{x.v}</div>
                  </div>
                ))}
              </div>

              {d.faultActive && (
                <div style={{ background: '#ef444410', borderRadius: 10, padding: '10px 14px', marginBottom: 18, border: '1px solid #ef444420' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                    <AlertCircle size={13} /> Active Fault
                  </div>
                  <div style={{ fontSize: 12 }}>{d.faultMessage || 'Unknown'}</div>
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Latest Readings</div>
              {readings.length === 0 ? (
                <div style={{ textAlign: 'center' as const, padding: 24, background: 'var(--surface-elevated)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 12 }}>
                  No readings yet. Poll the device to generate data.
                </div>
              ) : readings.map((r: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', background: i % 2 === 0 ? 'var(--surface-elevated)' : 'transparent',
                  borderRadius: 8, marginBottom: 2,
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{r.pointName}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.pointType?.replace(/_/g, ' ')}</div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>
                    {typeof r.value === 'number' ? r.value : Number(r.value||0).toFixed(1)}
                    {r.unit && r.unit !== 'binary' && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 3 }}>{r.unit}</span>}
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'readings' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Reading History (Last 50)</div>
              {allReadings.length === 0 ? (
                <div style={{ textAlign: 'center' as const, padding: 24, background: 'var(--surface-elevated)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 12 }}>No readings recorded.</div>
              ) : allReadings.map((r: any, i: number) => (
                <div key={r.id || i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 70px 50px 90px',
                  padding: '7px 10px', background: i % 2 === 0 ? 'var(--surface-elevated)' : 'transparent',
                  borderRadius: 6, fontSize: 11, alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 500 }}>{r.pointName}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, textAlign: 'right' as const }}>{typeof r.value === 'number' ? r.value : Number(r.value||0).toFixed(1)}</span>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'center' as const }}>{r.unit || '—'}</span>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right' as const, fontSize: 10 }}>{r.readAt ? new Date(r.readAt).toLocaleTimeString() : '—'}</span>
                </div>
              ))}
            </>
          )}

          {tab === 'faults' && (
            <>
              {faults?.currentFault ? (
                <div style={{ background: '#ef444410', borderRadius: 10, padding: 12, marginBottom: 14, border: '1px solid #ef444420' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontWeight: 600, fontSize: 11, marginBottom: 3 }}><XCircle size={13} /> Active Fault</div>
                  <div style={{ fontSize: 12 }}>{faults.currentFault.message || 'Active'}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b98110', borderRadius: 10, padding: 12, marginBottom: 14, color: '#10b981', fontSize: 12, fontWeight: 500 }}>
                  <CheckCircle size={14} /> No active faults
                </div>
              )}
              {faults?.historicalFaults?.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Historical</div>
                  {faults.historicalFaults.map((f: any, i: number) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr 70px 60px 90px',
                      padding: '7px 10px', background: i % 2 === 0 ? 'var(--surface-elevated)' : 'transparent',
                      borderRadius: 6, fontSize: 11, alignItems: 'center',
                    }}>
                      <span style={{ fontWeight: 500 }}>{f.pointName}</span>
                      <span style={{ fontFamily: 'monospace' }}>{Number(f.value||0).toFixed(1)}</span>
                      <span style={{ color: f.quality === 'bad' ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{f.quality}</span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'right' as const, fontSize: 10 }}>{f.readAt ? new Date(f.readAt).toLocaleString() : '—'}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SHARED STYLES
   ═══════════════════════════════════════════ */

const cardBase: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 14,
  border: '1px solid var(--border)', transition: 'all 0.2s',
};

const inputBase: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-elevated)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none',
};

const selectBase: React.CSSProperties = {
  ...inputBase, cursor: 'pointer', minWidth: 140,
};

const fieldInput: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-elevated)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none', width: '100%', boxSizing: 'border-box' as const,
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 18px', borderRadius: 10, border: 'none',
  background: 'var(--gradient-primary)',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 2px 8px var(--accent-glow)',
};

const outlineBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 16px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

const smallBtn: React.CSSProperties = {
  border: 'none', borderRadius: 7, padding: '5px 10px',
  cursor: 'pointer', fontSize: 11, fontWeight: 500,
  display: 'flex', alignItems: 'center', gap: 3,
};
