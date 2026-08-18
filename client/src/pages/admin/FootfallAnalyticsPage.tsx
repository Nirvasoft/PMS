import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetFootfallDailyQuery, useGetFootfallTrendQuery,
  useGetFootfallHeatmapQuery, useGetFootfallSensorsQuery,
  useCreateFootfallSensorMutation, useUpdateFootfallSensorMutation,
  useDeleteFootfallSensorMutation, useToggleFootfallSensorMutation,
  useSyncFootfallSensorMutation, useSyncAllFootfallSensorsMutation,
} from '../../store/api/mallApi';
import { useGetPropertiesQuery } from '../../store/api/propertiesApi';
import { useConfirm, useAlertDialog } from '../../components/DialogProvider';
import {
  Users, TrendingUp, TrendingDown, Clock, BarChart3, MapPin, Activity,
  ArrowUpRight, ArrowDownRight, Wifi, WifiOff, Radio, Calendar,
  ChevronLeft, ChevronRight, Plus, Edit3, Trash2, Power, RefreshCw,
} from 'lucide-react';

const TABS = [
  { label: 'Daily View', icon: <BarChart3 size={15} /> },
  { label: 'Trend', icon: <TrendingUp size={15} /> },
  { label: 'Zone Heatmap', icon: <MapPin size={15} /> },
  { label: 'Sensors', icon: <Radio size={15} /> },
];

function formatDate(d: Date): string { return d.toISOString().split('T')[0]; }
function formatNum(n: number): string { return n.toLocaleString(); }

export default function FootfallAnalyticsPage() {
  const { data: propsRes } = useGetPropertiesQuery({ limit: 100 });
  const properties = propsRes?.data || [];
  const [propertyId, setPropertyId] = useState('');
  const selectedPropId = propertyId || properties[0]?.id || '';
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const [tab, setTab] = useState(0);
  const [date, setDate] = useState(formatDate(new Date()));
  const [hour, setHour] = useState(12);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const trendFrom = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return formatDate(d);
  }, []);
  const trendTo = useMemo(() => formatDate(new Date()), []);

  const { data: dailyData, isLoading: loadingDaily } = useGetFootfallDailyQuery(
    { propertyId: selectedPropId, date },
    { skip: !selectedPropId || tab !== 0 },
  );
  const { data: trendData, isLoading: loadingTrend } = useGetFootfallTrendQuery(
    { propertyId: selectedPropId, from: trendFrom, to: trendTo },
    { skip: !selectedPropId || tab !== 1 },
  );
  const { data: heatmapData, isLoading: loadingHeatmap } = useGetFootfallHeatmapQuery(
    { propertyId: selectedPropId, date, hour },
    { skip: !selectedPropId || tab !== 2 },
  );
  const { data: sensorsData } = useGetFootfallSensorsQuery(
    { propertyId: selectedPropId },
    { skip: !selectedPropId || tab !== 3 },
  );

  const daily = dailyData?.data;
  const trend = trendData?.data;
  const heatmap = heatmapData?.data;
  const sensors = sensorsData?.data || [];

  // Sensor CRUD
  const [createSensor] = useCreateFootfallSensorMutation();
  const [updateSensor] = useUpdateFootfallSensorMutation();
  const [deleteSensor] = useDeleteFootfallSensorMutation();
  const [toggleSensor] = useToggleFootfallSensorMutation();
  const [sensorModal, setSensorModal] = useState<'create' | 'edit' | null>(null);
  const [editingSensor, setEditingSensor] = useState<any>(null);
  const [sensorForm, setSensorForm] = useState({
    sensorId: '', name: '', location: '', zone: '', floor: '',
    sensorType: 'stereo', vendor: '', apiEndpoint: '', apiKey: '',
  });

  const openCreateSensor = () => {
    setSensorForm({ sensorId: '', name: '', location: '', zone: '', floor: '', sensorType: 'stereo', vendor: '', apiEndpoint: '', apiKey: '' });
    setEditingSensor(null);
    setSensorModal('create');
  };

  const openEditSensor = (s: any) => {
    setSensorForm({
      sensorId: s.sensorId || '', name: s.name || '', location: s.location || '',
      zone: s.zone || '', floor: s.floor || '', sensorType: s.sensorType || 'stereo',
      vendor: s.vendor || '', apiEndpoint: s.apiEndpoint || '', apiKey: '',
    });
    setEditingSensor(s);
    setSensorModal('edit');
  };

  const handleSaveSensor = async () => {
    try {
      if (sensorModal === 'create') {
        await createSensor({ ...sensorForm, propertyId: selectedPropId }).unwrap();
      } else if (sensorModal === 'edit' && editingSensor) {
        const { sensorId: _omit, apiKey, ...rest } = sensorForm;
        const payload: any = { ...rest };
        if (apiKey) payload.apiKeyEnc = apiKey;
        await updateSensor({ id: editingSensor.id, data: payload }).unwrap();
      }
      setSensorModal(null);
    } catch (e: any) {
      alertDialog(e?.data?.message || 'Failed to save sensor');
    }
  };

  const handleDeleteSensor = async (s: any) => {
    const confirmed = await confirmDialog(`Delete sensor "${s.name}"? If it has recorded data, it will be deactivated instead.`, { danger: true, confirmText: 'Delete' });
    if (!confirmed) return;
    try {
      const res = await deleteSensor(s.id).unwrap();
      if (res.data?.deactivated) alertDialog(res.data.reason);
    } catch (e: any) {
      alertDialog(e?.data?.message || 'Failed to delete sensor');
    }
  };

  const handleToggleSensor = async (id: string) => {
    try { await toggleSensor(id).unwrap(); } catch (e) { console.error(e); }
  };

  // Sync
  const [syncSensor, { isLoading: isSyncingSingle }] = useSyncFootfallSensorMutation();
  const [syncAll, { isLoading: isSyncingAll }] = useSyncAllFootfallSensorsMutation();
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncingSensorId, setSyncingSensorId] = useState<string | null>(null);

  const handleSyncSensor = async (sensorId: string) => {
    setSyncingSensorId(sensorId);
    try {
      const res = await syncSensor(sensorId).unwrap();
      setSyncResult(res.data);
    } catch (e: any) {
      alertDialog(e?.data?.message || 'Sync failed');
    } finally {
      setSyncingSensorId(null);
    }
  };

  const handleSyncAll = async () => {
    try {
      const res = await syncAll({ propertyId: selectedPropId }).unwrap();
      setSyncResult(res.data);
    } catch (e: any) {
      alertDialog(e?.data?.message || 'Sync all failed');
    }
  };

  const maxHourlyEntries = daily?.byHour ? Math.max(...daily.byHour.map((h: any) => h.entries), 1) : 1;
  const maxTrendEntries = trend?.daily ? Math.max(...trend.daily.map((d: any) => d.entries), 1) : 1;

  // Navigate date
  const shiftDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(formatDate(d));
  };

  const selectedPropName = properties.find((p: any) => p.id === selectedPropId)?.name || '';

  return (
    <div className="page-content" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={24} style={{ color: 'hsl(200, 75%, 55%)' }} />
            Footfall Analytics
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 }}>
            Visitor traffic across zones and time periods
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={selectedPropId}
            onChange={e => setPropertyId(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border-color)', background: 'var(--card-bg)',
              color: 'var(--text-primary)', fontSize: 13, minWidth: 180,
            }}
          >
            {properties.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => shiftDate(-1)} style={navBtnStyle}><ChevronLeft size={16} /></button>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border-color)', background: 'var(--card-bg)',
                color: 'var(--text-primary)', fontSize: 13,
              }}
            />
            <button onClick={() => shiftDate(1)} style={navBtnStyle}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border-color)', paddingBottom: 0 }}>
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', fontSize: 13, fontWeight: tab === i ? 600 : 400,
              border: 'none', borderBottom: tab === i ? '2px solid hsl(200, 75%, 55%)' : '2px solid transparent',
              background: 'transparent',
              color: tab === i ? 'hsl(200, 75%, 55%)' : 'var(--text-secondary)',
              cursor: 'pointer', marginBottom: -2,
              transition: 'all 0.2s ease',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Daily View ── */}
      {tab === 0 && (
        <div>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            <KpiCard icon={<ArrowUpRight size={20} />} label="Total Entries" value={formatNum(daily?.totalEntries || 0)} color="hsl(200, 75%, 55%)" />
            <KpiCard icon={<ArrowDownRight size={20} />} label="Total Exits" value={formatNum(daily?.totalExits || 0)} color="hsl(340, 65%, 55%)" />
            <KpiCard icon={<Clock size={20} />} label="Peak Hour" value={daily?.peakHour || '--'} sub={`${formatNum(daily?.peakHourCount || 0)} visitors`} color="hsl(45, 85%, 50%)" />
            <KpiCard icon={<Users size={20} />} label="Currently Inside" value={formatNum(Math.max(0, (daily?.totalEntries || 0) - (daily?.totalExits || 0)))} sub="estimated" color="hsl(150, 65%, 45%)" />
          </div>

          {/* Hourly Bar Chart */}
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart3 size={16} />
              Hourly Breakdown — {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            {loadingDaily ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : !daily?.byHour?.length || daily.byHour.every((h: any) => h.entries === 0) ? (
              <EmptyState icon={<Activity size={48} />} title="No Footfall Data" subtitle={`No sensor data recorded for ${date}. Select a different date or property.`} />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 220, padding: '0 4px' }}>
                  {daily.byHour.map((h: any, i: number) => {
                    const entryH = Math.max(2, (h.entries / maxHourlyEntries) * 190);
                    const exitH = Math.max(2, (h.exits / maxHourlyEntries) * 190);
                    const isHovered = hoveredBar === i;
                    return (
                      <div
                        key={i}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}
                        onMouseEnter={() => setHoveredBar(i)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        {/* Tooltip */}
                        {isHovered && (h.entries > 0 || h.exits > 0) && (
                          <div style={{
                            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                            background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                            borderRadius: 8, padding: '8px 12px', zIndex: 10,
                            fontSize: 12, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            marginBottom: 4,
                          }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{h.hour}</div>
                            <div style={{ color: 'hsl(200, 75%, 55%)' }}>↑ {h.entries} entries</div>
                            <div style={{ color: 'hsl(340, 65%, 55%)' }}>↓ {h.exits} exits</div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                              Net: {h.entries - h.exits >= 0 ? '+' : ''}{h.entries - h.exits}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 190 }}>
                          <div style={{
                            width: '100%', height: entryH, borderRadius: '4px 4px 0 0',
                            background: isHovered
                              ? 'linear-gradient(to top, hsl(200, 85%, 50%), hsl(200, 85%, 65%))'
                              : 'linear-gradient(to top, hsl(200, 65%, 50%), hsl(200, 65%, 60%))',
                            minWidth: 5, transition: 'all 0.2s ease',
                            transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                            transformOrigin: 'bottom',
                          }} />
                          <div style={{
                            width: '100%', height: exitH, borderRadius: '4px 4px 0 0',
                            background: isHovered
                              ? 'linear-gradient(to top, hsl(340, 75%, 50%), hsl(340, 75%, 65%))'
                              : 'linear-gradient(to top, hsl(340, 55%, 50%), hsl(340, 55%, 60%))',
                            minWidth: 5, opacity: 0.75, transition: 'all 0.2s ease',
                            transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                            transformOrigin: 'bottom',
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isHovered ? 600 : 400 }}>
                          {h.hour.slice(0, 2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(135deg, hsl(200, 65%, 50%), hsl(200, 65%, 60%))' }} /> Entries
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(135deg, hsl(340, 55%, 50%), hsl(340, 55%, 60%))', opacity: 0.75 }} /> Exits
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Zone Breakdown */}
          {daily?.byZone?.length > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={16} /> Zone Breakdown
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {daily.byZone.map((z: any) => {
                  const pct = daily.totalEntries > 0 ? (z.entries / daily.totalEntries * 100) : 0;
                  return (
                    <div key={z.zone} style={{
                      padding: '16px 18px', borderRadius: 12,
                      border: '1px solid var(--border-color)',
                      background: `linear-gradient(135deg, hsla(200, 70%, 55%, ${pct / 300}), transparent)`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{z.zone.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(200, 75%, 55%)', padding: '2px 8px', borderRadius: 6, background: 'hsla(200, 75%, 55%, 0.12)' }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span>↑ {z.entries.toLocaleString()}</span>
                        <span>↓ {z.exits.toLocaleString()}</span>
                        <span style={{ color: (z.entries - z.exits) >= 0 ? 'hsl(150, 65%, 45%)' : 'hsl(0, 65%, 55%)' }}>
                          Net: {z.entries - z.exits >= 0 ? '+' : ''}{(z.entries - z.exits).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--border-color)' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, hsl(200, 75%, 55%), hsl(180, 70%, 50%))', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Trend ── */}
      {tab === 1 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            <KpiCard icon={<TrendingUp size={20} />} label="Total Entries (30d)" value={formatNum(trend?.totalEntries || 0)} color="hsl(200, 75%, 55%)" />
            <KpiCard icon={<Users size={20} />} label="Avg Daily" value={formatNum(trend?.avgDaily || 0)} color="hsl(45, 85%, 50%)" />
            <KpiCard icon={<Calendar size={20} />} label="Days with Data" value={String(trend?.days || 0)} color="hsl(150, 65%, 45%)" />
            <KpiCard icon={<TrendingDown size={20} />} label="Total Exits (30d)" value={formatNum(trend?.totalExits || 0)} color="hsl(340, 65%, 55%)" />
          </div>

          {/* Trend Chart */}
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>
              Daily Footfall — Last 30 Days
            </h3>
            {loadingTrend ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : !trend?.daily?.length ? (
              <EmptyState icon={<Activity size={48} />} title="No Trend Data" subtitle="No footfall data in the last 30 days." />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 200, overflowX: 'auto', paddingBottom: 4 }}>
                  {trend.daily.map((d: any, i: number) => {
                    const h = Math.max(3, (d.entries / maxTrendEntries) * 180);
                    const isWeekend = [0, 6].includes(new Date(d.date).getDay());
                    return (
                      <div key={i} style={{ flex: '1 0 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 16 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)', height: 14 }}>
                          {d.entries > 0 ? (d.entries / 1000).toFixed(1) + 'k' : ''}
                        </div>
                        <div
                          title={`${d.date}: ${d.entries} entries, ${d.exits} exits`}
                          style={{
                            width: '100%', height: h, borderRadius: '4px 4px 0 0',
                            background: isWeekend
                              ? 'linear-gradient(to top, hsl(280, 60%, 50%), hsl(280, 60%, 65%))'
                              : 'linear-gradient(to top, hsl(200, 70%, 45%), hsl(200, 70%, 60%))',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <span style={{ fontSize: 9, color: 'var(--text-secondary)', transform: 'rotate(-45deg)', transformOrigin: 'top left', width: 30, height: 20 }}>
                          {i % 3 === 0 ? d.date.slice(5) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'hsl(200, 70%, 55%)' }} /> Weekday
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: 'hsl(280, 60%, 55%)' }} /> Weekend
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Recent Days Table */}
          {trend?.daily?.length > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Recent 10 Days</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Day</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Entries</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Exits</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
                      <th style={thStyle}>vs Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.daily.slice().reverse().slice(0, 10).map((d: any) => {
                      const dayName = new Date(d.date).toLocaleDateString('en', { weekday: 'short' });
                      const vsAvg = trend.avgDaily > 0 ? ((d.entries - trend.avgDaily) / trend.avgDaily * 100) : 0;
                      return (
                        <tr key={d.date} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={tdStyle}>{d.date}</td>
                          <td style={tdStyle}>{dayName}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{formatNum(d.entries)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNum(d.exits)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: d.net >= 0 ? 'hsl(150, 65%, 45%)' : 'hsl(0, 65%, 55%)' }}>
                            {d.net >= 0 ? '+' : ''}{formatNum(d.net)}
                          </td>
                          <td style={tdStyle}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                              color: vsAvg >= 0 ? 'hsl(150, 65%, 45%)' : 'hsl(0, 65%, 55%)',
                              background: vsAvg >= 0 ? 'hsla(150, 65%, 45%, 0.1)' : 'hsla(0, 65%, 55%, 0.1)',
                            }}>
                              {vsAvg >= 0 ? '+' : ''}{vsAvg.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Zone Heatmap ── */}
      {tab === 2 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <Clock size={14} /> Hour:
              <select
                value={hour}
                onChange={e => setHour(Number(e.target.value))}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {selectedPropName} — {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {loadingHeatmap ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : !heatmap?.zones?.length ? (
            <EmptyState icon={<MapPin size={48} />} title="No Heatmap Data" subtitle={`No data for ${date} at ${String(hour).padStart(2, '0')}:00`} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {heatmap.zones.map((z: any) => {
                const hue = z.intensity > 70 ? 0 : z.intensity > 40 ? 30 : z.intensity > 20 ? 45 : 150;
                return (
                  <div key={z.zone} className="card" style={{
                    padding: 20, position: 'relative', overflow: 'hidden',
                    borderLeft: `4px solid hsl(${hue}, 70%, 50%)`,
                  }}>
                    {/* Intensity background glow */}
                    <div style={{
                      position: 'absolute', top: 0, right: 0, width: 120, height: 120,
                      borderRadius: '50%', filter: 'blur(40px)',
                      background: `hsla(${hue}, 70%, 50%, ${z.intensity / 400})`,
                    }} />
                    <div style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, textTransform: 'capitalize' }}>
                          {z.zone.replace(/_/g, ' ')}
                        </h4>
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
                          background: `hsl(${hue}, 70%, 50%)`, color: '#fff',
                        }}>
                          {z.intensity}%
                        </span>
                      </div>
                      {z.floor && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Floor {z.floor}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span>↑ {formatNum(z.entries)} in</span>
                        <span>↓ {formatNum(z.exits)} out</span>
                      </div>
                      {/* Intensity bar */}
                      <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: 'var(--border-color)' }}>
                        <div style={{
                          width: `${z.intensity}%`, height: '100%', borderRadius: 3,
                          background: `linear-gradient(90deg, hsl(${hue}, 70%, 55%), hsl(${hue}, 60%, 45%))`,
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                      {z.sensors?.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <Radio size={10} style={{ marginRight: 4 }} />{z.sensors.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Sensors ── */}
      {tab === 3 && (
        <div>
          {/* Sensors header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {sensors.length} sensor{sensors.length !== 1 ? 's' : ''}
              {sensors.filter((s: any) => s.isActive).length < sensors.length && (
                <span> · {sensors.filter((s: any) => !s.isActive).length} inactive</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSyncAll}
                disabled={isSyncingAll || sensors.filter((s: any) => s.isActive).length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: 'rgba(16, 185, 129, 0.12)', color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)', cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} className={isSyncingAll ? 'spin-animation' : ''} />
                {isSyncingAll ? 'Syncing...' : 'Sync All'}
              </button>
              <button
                onClick={openCreateSensor}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: 'hsl(200, 75%, 55%)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Add Sensor
              </button>
            </div>
          </div>

          {/* Sync Results Banner */}
          {syncResult && (
            <div style={{
              marginBottom: 14, padding: '12px 16px', borderRadius: 10,
              background: 'var(--card-bg)', border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={14} style={{ color: '#10b981' }} />
                  Sync Results
                </div>
                {/* Single sensor result */}
                {syncResult.synced !== undefined && !syncResult.results && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {syncResult.synced ? (
                      <span>
                        <strong style={{ color: '#10b981' }}>✓ Synced</strong> — {syncResult.sensorName}: <strong>{syncResult.entries}</strong> entries, <strong>{syncResult.exits}</strong> exits ({new Date(syncResult.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    ) : (
                      <span style={{ color: '#f59e0b' }}>{syncResult.message}</span>
                    )}
                  </div>
                )}
                {/* Sync all results */}
                {syncResult.results && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: '#10b981' }}>{syncResult.synced}</strong> synced, <strong style={{ color: '#f59e0b' }}>{syncResult.skipped}</strong> skipped out of {syncResult.totalSensors} sensors
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {syncResult.results.map((r: any) => (
                        <span key={r.sensorId} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 6,
                          background: r.synced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: r.synced ? '#10b981' : '#f59e0b', fontWeight: 600,
                        }}>
                          {r.synced ? '✓' : '—'} {r.name}
                          {r.synced && <span> ({r.entries}↑ {r.exits}↓)</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setSyncResult(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14,
              }}>✕</button>
            </div>
          )}

          {sensors.length === 0 ? (
            <EmptyState icon={<Radio size={48} />} title="No Sensors" subtitle="No footfall sensors configured for this property." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
              {sensors.map((s: any) => (
                <div key={s.id} className="card" style={{
                  padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start',
                  opacity: s.isActive ? 1 : 0.6, transition: 'opacity 0.2s',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: s.isActive ? 'hsla(150, 65%, 45%, 0.12)' : 'hsla(0, 0%, 50%, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: s.isActive ? 'hsl(150, 65%, 45%)' : 'var(--text-secondary)',
                  }}>
                    {s.isActive ? <Wifi size={20} /> : <WifiOff size={20} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {s.zone ? <span style={{ textTransform: 'capitalize' }}>{s.zone.replace(/_/g, ' ')}</span> : '—'}
                      {s.floor && <span> · Floor {s.floor}</span>}
                      {s.sensorType && <span> · {s.sensorType}</span>}
                      {s.vendor && <span> · {s.vendor}</span>}
                    </div>
                    {s.location && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        <MapPin size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{s.location}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: 2 }}>
                      ID: {s.sensorId}
                    </div>
                    {/* Action row */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleSyncSensor(s.id)}
                        disabled={!s.isActive || (isSyncingSingle && syncingSensorId === s.id)}
                        title={s.isActive ? 'Sync sensor data' : 'Activate sensor first'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: 'rgba(16, 185, 129, 0.1)', color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.2)', cursor: s.isActive ? 'pointer' : 'not-allowed',
                          opacity: s.isActive ? 1 : 0.5,
                        }}
                      >
                        <RefreshCw size={11} className={(isSyncingSingle && syncingSensorId === s.id) ? 'spin-animation' : ''} />
                        {(isSyncingSingle && syncingSensorId === s.id) ? 'Syncing...' : 'Sync'}
                      </button>
                      <button
                        onClick={() => openEditSensor(s)}
                        title="Edit sensor"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1',
                          border: '1px solid rgba(99, 102, 241, 0.2)', cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={11} /> Edit
                      </button>
                      <button
                        onClick={() => handleToggleSensor(s.id)}
                        title={s.isActive ? 'Deactivate sensor' : 'Activate sensor'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: s.isActive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: s.isActive ? '#f59e0b' : '#10b981',
                          border: `1px solid ${s.isActive ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                          cursor: 'pointer',
                        }}
                      >
                        <Power size={11} /> {s.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteSensor(s)}
                        title="Delete sensor"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.2)', cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                    color: s.isActive ? 'hsl(150, 65%, 45%)' : 'hsl(0, 0%, 55%)',
                    background: s.isActive ? 'hsla(150, 65%, 45%, 0.1)' : 'hsla(0, 0%, 50%, 0.08)',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.isActive ? '● Online' : '○ Offline'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sensor Create/Edit Modal */}
      {sensorModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setSensorModal(null)}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: 14, width: 520, maxWidth: '90vw',
            maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border-color)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px', borderBottom: '1px solid var(--border-color)',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {sensorModal === 'create' ? 'Add Sensor' : `Edit: ${editingSensor?.name}`}
              </h3>
              <button onClick={() => setSensorModal(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
                fontSize: 18,
              }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {sensorModal === 'create' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
                  Sensor ID *
                  <input value={sensorForm.sensorId} onChange={e => setSensorForm({ ...sensorForm, sensorId: e.target.value })}
                    placeholder="Unique sensor ID" style={inputStyle} />
                </label>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
                Name *
                <input value={sensorForm.name} onChange={e => setSensorForm({ ...sensorForm, name: e.target.value })}
                  placeholder="Sensor name" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
                Location
                <input value={sensorForm.location} onChange={e => setSensorForm({ ...sensorForm, location: e.target.value })}
                  placeholder="e.g. Main Entrance" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
                Zone
                <input value={sensorForm.zone} onChange={e => setSensorForm({ ...sensorForm, zone: e.target.value })}
                  placeholder="e.g. entrance, food_court" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
                Floor
                <input value={sensorForm.floor} onChange={e => setSensorForm({ ...sensorForm, floor: e.target.value })}
                  placeholder="e.g. G, 1, 2" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
                Type
                <select value={sensorForm.sensorType} onChange={e => setSensorForm({ ...sensorForm, sensorType: e.target.value })} style={inputStyle}>
                  <option value="stereo">Stereo</option>
                  <option value="thermal">Thermal</option>
                  <option value="lidar">LiDAR</option>
                  <option value="wifi">WiFi</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
                Vendor
                <input value={sensorForm.vendor} onChange={e => setSensorForm({ ...sensorForm, vendor: e.target.value })}
                  placeholder="e.g. Brickstream, Xovis" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500, gridColumn: '1 / -1' }}>
                API Endpoint
                <input value={sensorForm.apiEndpoint} onChange={e => setSensorForm({ ...sensorForm, apiEndpoint: e.target.value })}
                  placeholder="https://..." style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500, gridColumn: '1 / -1' }}>
                API Key {sensorModal === 'edit' && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>(leave blank to keep existing)</span>}
                <input type="password" value={sensorForm.apiKey} onChange={e => setSensorForm({ ...sensorForm, apiKey: e.target.value })}
                  placeholder="••••••••" style={inputStyle} />
              </label>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              padding: '12px 18px', borderTop: '1px solid var(--border-color)',
            }}>
              <button onClick={() => setSensorModal(null)} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)',
                background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
              }}>Cancel</button>
              <button onClick={handleSaveSensor} disabled={!sensorForm.name || (sensorModal === 'create' && !sensorForm.sensorId)} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: 'hsl(200, 75%, 55%)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
                {sensorModal === 'create' ? 'Add Sensor' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

// ── Sub-components ──

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '48px 24px',
      color: 'var(--text-secondary)', borderRadius: 12,
      border: '1px dashed var(--border-color)',
    }}>
      <div style={{ opacity: 0.3, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 13 }}>{subtitle}</p>
    </div>
  );
}

// ── Styles ──
const navBtnStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 8,
  border: '1px solid var(--border-color)', background: 'var(--card-bg)',
  color: 'var(--text-primary)', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px' };
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13,
};
