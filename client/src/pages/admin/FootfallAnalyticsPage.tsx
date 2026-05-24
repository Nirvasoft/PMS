import React, { useState, useMemo } from 'react';
import {
  useGetFootfallDailyQuery, useGetFootfallTrendQuery,
  useGetFootfallHeatmapQuery, useGetFootfallSensorsQuery,
} from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { Users, TrendingUp, Clock, BarChart3, MapPin, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const TABS = ['Daily View', 'Trend', 'Zone Heatmap', 'Sensors'];

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function FootfallAnalyticsPage() {
  const propertyId = useSelectedPropertyId();
  const [tab, setTab] = useState(0);
  const [date, setDate] = useState(formatDate(new Date()));
  const [hour, setHour] = useState(12);

  // Trend range: last 30 days
  const trendFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDate(d);
  }, []);
  const trendTo = useMemo(() => formatDate(new Date()), []);

  const { data: dailyData, isLoading: loadingDaily } = useGetFootfallDailyQuery(
    { propertyId, date },
    { skip: !propertyId || tab !== 0 },
  );
  const { data: trendData, isLoading: loadingTrend } = useGetFootfallTrendQuery(
    { propertyId, from: trendFrom, to: trendTo },
    { skip: !propertyId || tab !== 1 },
  );
  const { data: heatmapData, isLoading: loadingHeatmap } = useGetFootfallHeatmapQuery(
    { propertyId, date, hour },
    { skip: !propertyId || tab !== 2 },
  );
  const { data: sensorsData } = useGetFootfallSensorsQuery(
    { propertyId },
    { skip: !propertyId || tab !== 3 },
  );

  const daily = dailyData?.data;
  const trend = trendData?.data;
  const heatmap = heatmapData?.data;
  const sensors = sensorsData?.data || [];

  // Hourly chart max for bar height
  const maxHourlyEntries = daily?.byHour ? Math.max(...daily.byHour.map((h: any) => h.entries), 1) : 1;
  const maxTrendEntries = trend?.daily ? Math.max(...trend.daily.map((d: any) => d.entries), 1) : 1;

  return (
    <div className="mall-page" style={{ '--accent-hue': '200' } as React.CSSProperties}>
      <div className="mall-page-header">
        <div>
          <h2 className="mall-page-title">Footfall Analytics</h2>
          <p className="mall-page-subtitle">Visitor traffic data from entry/exit sensors</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color, var(--border))', background: 'var(--card-bg, var(--surface))', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mall-tabs" style={{ marginBottom: 20 }}>
        {TABS.map((t, i) => (
          <button key={i} className={`mall-tab ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Daily View ── */}
      {tab === 0 && (
        <div>
          {/* Summary Cards */}
          <div className="mall-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="mall-stat-card">
              <div className="mall-stat-icon" style={{ background: 'linear-gradient(135deg, hsl(200, 75%, 55%), hsl(200, 75%, 40%))' }}>
                <ArrowUpRight size={20} />
              </div>
              <div className="mall-stat-value">{(daily?.totalEntries || 0).toLocaleString()}</div>
              <div className="mall-stat-label">Total Entries</div>
            </div>
            <div className="mall-stat-card">
              <div className="mall-stat-icon" style={{ background: 'linear-gradient(135deg, hsl(340, 75%, 55%), hsl(340, 75%, 40%))' }}>
                <ArrowDownRight size={20} />
              </div>
              <div className="mall-stat-value">{(daily?.totalExits || 0).toLocaleString()}</div>
              <div className="mall-stat-label">Total Exits</div>
            </div>
            <div className="mall-stat-card">
              <div className="mall-stat-icon" style={{ background: 'linear-gradient(135deg, hsl(45, 85%, 55%), hsl(45, 85%, 40%))' }}>
                <Clock size={20} />
              </div>
              <div className="mall-stat-value">{daily?.peakHour || '--'}</div>
              <div className="mall-stat-label">Peak Hour ({(daily?.peakHourCount || 0).toLocaleString()})</div>
            </div>
            <div className="mall-stat-card">
              <div className="mall-stat-icon" style={{ background: 'linear-gradient(135deg, hsl(150, 65%, 45%), hsl(150, 65%, 35%))' }}>
                <Users size={20} />
              </div>
              <div className="mall-stat-value">{Math.max(0, (daily?.totalEntries || 0) - (daily?.totalExits || 0)).toLocaleString()}</div>
              <div className="mall-stat-label">Currently Inside (est.)</div>
            </div>
          </div>

          {/* Hourly Bar Chart */}
          <div className="mall-card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-primary)' }}>
              <BarChart3 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Hourly Breakdown
            </h3>
            {loadingDaily ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            ) : !daily?.byHour?.length || daily.byHour.every((h: any) => h.entries === 0) ? (
              <div className="mall-empty-state">
                <Activity size={40} strokeWidth={1} />
                <h3>No Footfall Data</h3>
                <p>No sensor data recorded for {date}. Connect sensors and wait for data sync.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 200 }}>
                {daily.byHour.map((h: any, i: number) => {
                  const entryH = Math.max(1, (h.entries / maxHourlyEntries) * 180);
                  const exitH = Math.max(1, (h.exits / maxHourlyEntries) * 180);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 180 }}>
                        <div
                          title={`${h.hour} — ${h.entries} entries`}
                          style={{
                            width: '100%', height: entryH, borderRadius: '4px 4px 0 0',
                            background: 'var(--primary, hsl(200, 75%, 55%))', minWidth: 6, opacity: 0.85,
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <div
                          title={`${h.hour} — ${h.exits} exits`}
                          style={{
                            width: '100%', height: exitH, borderRadius: '4px 4px 0 0',
                            background: 'hsl(340, 65%, 55%)', minWidth: 6, opacity: 0.65,
                            transition: 'height 0.3s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{i % 2 === 0 ? h.hour.slice(0,2) : ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--primary, hsl(200, 75%, 55%))', marginRight: 4 }} />Entries</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'hsl(340, 65%, 55%)', marginRight: 4 }} />Exits</span>
            </div>
          </div>

          {/* Zone Breakdown */}
          {daily?.byZone?.length > 0 && (
            <div className="mall-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-primary)' }}>
                <MapPin size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Zone Breakdown
              </h3>
              <div className="mall-table-wrap">
                <table className="mall-table">
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th className="text-right">Entries</th>
                      <th className="text-right">Exits</th>
                      <th className="text-right">Net</th>
                      <th>Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.byZone.map((z: any) => {
                      const pct = daily.totalEntries > 0 ? (z.entries / daily.totalEntries * 100).toFixed(1) : '0';
                      return (
                        <tr key={z.zone}>
                          <td style={{ fontWeight: 500 }}>{z.zone}</td>
                          <td className="text-right">{z.entries.toLocaleString()}</td>
                          <td className="text-right">{z.exits.toLocaleString()}</td>
                          <td className="text-right">{(z.entries - z.exits).toLocaleString()}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border-color, var(--border))' }}>
                                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--primary, hsl(200, 75%, 55%))' }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>{pct}%</span>
                            </div>
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

      {/* ── Trend ── */}
      {tab === 1 && (
        <div>
          <div className="mall-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="mall-stat-card">
              <div className="mall-stat-icon" style={{ background: 'linear-gradient(135deg, hsl(200, 75%, 55%), hsl(200, 75%, 40%))' }}>
                <TrendingUp size={20} />
              </div>
              <div className="mall-stat-value">{(trend?.totalEntries || 0).toLocaleString()}</div>
              <div className="mall-stat-label">Total Entries (30d)</div>
            </div>
            <div className="mall-stat-card">
              <div className="mall-stat-icon" style={{ background: 'linear-gradient(135deg, hsl(45, 85%, 55%), hsl(45, 85%, 40%))' }}>
                <Users size={20} />
              </div>
              <div className="mall-stat-value">{(trend?.avgDaily || 0).toLocaleString()}</div>
              <div className="mall-stat-label">Avg Daily Entries</div>
            </div>
            <div className="mall-stat-card">
              <div className="mall-stat-icon" style={{ background: 'linear-gradient(135deg, hsl(150, 65%, 45%), hsl(150, 65%, 35%))' }}>
                <BarChart3 size={20} />
              </div>
              <div className="mall-stat-value">{trend?.days || 0}</div>
              <div className="mall-stat-label">Days with Data</div>
            </div>
          </div>

          {/* Trend Line Chart (CSS bars) */}
          <div className="mall-card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-primary)' }}>
              Daily Footfall (Last 30 Days)
            </h3>
            {loadingTrend ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            ) : !trend?.daily?.length ? (
              <div className="mall-empty-state">
                <Activity size={40} strokeWidth={1} />
                <h3>No Trend Data</h3>
                <p>No footfall data in the last 30 days.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 200, overflowX: 'auto' }}>
                  {trend.daily.map((d: any, i: number) => {
                    const h = Math.max(2, (d.entries / maxTrendEntries) * 180);
                    return (
                      <div key={i} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div
                          title={`${d.date}: ${d.entries} entries, ${d.exits} exits`}
                          style={{
                            width: 14, height: h, borderRadius: '4px 4px 0 0',
                            background: `linear-gradient(to top, hsl(200, 75%, 45%), hsl(200, 75%, 60%))`,
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', writingMode: 'vertical-lr', height: 30 }}>
                          {i % 3 === 0 ? d.date.slice(5) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Trend table */}
                <div className="mall-table-wrap" style={{ marginTop: 16 }}>
                  <table className="mall-table">
                    <thead>
                      <tr><th>Date</th><th className="text-right">Entries</th><th className="text-right">Exits</th><th className="text-right">Net</th></tr>
                    </thead>
                    <tbody>
                      {trend.daily.slice().reverse().slice(0, 10).map((d: any) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td className="text-right">{d.entries.toLocaleString()}</td>
                          <td className="text-right">{d.exits.toLocaleString()}</td>
                          <td className={`text-right ${d.net >= 0 ? 'text-success' : 'text-danger'}`}>{d.net >= 0 ? '+' : ''}{d.net.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Zone Heatmap ── */}
      {tab === 2 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Hour:
              <select
                value={hour}
                onChange={e => setHour(Number(e.target.value))}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, var(--border))', background: 'var(--card-bg, var(--surface))', color: 'var(--text-primary)' }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
          </div>

          {loadingHeatmap ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
          ) : !heatmap?.zones?.length ? (
            <div className="mall-empty-state">
              <MapPin size={40} strokeWidth={1} />
              <h3>No Heatmap Data</h3>
              <p>No footfall data for {date} at {String(hour).padStart(2, '0')}:00</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {heatmap.zones.map((z: any) => {
                const hue = z.intensity > 70 ? 0 : z.intensity > 40 ? 35 : 120;
                const lightness = 50 - z.intensity * 0.1;
                return (
                  <div
                    key={z.zone}
                    className="mall-card"
                    style={{
                      padding: 20,
                      borderLeft: `4px solid hsl(${hue}, 70%, ${lightness}%)`,
                      background: `linear-gradient(135deg, hsla(${hue}, 70%, ${lightness}%, 0.08), transparent)`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{z.zone}</h4>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: `hsl(${hue}, 70%, ${lightness}%)`, color: '#fff',
                      }}>
                        {z.intensity}%
                      </span>
                    </div>
                    {z.floor && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>Floor: {z.floor}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>↑ {z.entries.toLocaleString()} in</span>
                      <span>↓ {z.exits.toLocaleString()} out</span>
                    </div>
                    {z.sensors?.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        Sensors: {z.sensors.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Sensors ── */}
      {tab === 3 && (
        <div className="mall-table-wrap">
          <table className="mall-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sensor ID</th>
                <th>Zone</th>
                <th>Floor</th>
                <th>Type</th>
                <th>Vendor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((s: any) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.sensorId}</td>
                  <td>{s.zone || '—'}</td>
                  <td>{s.floor || '—'}</td>
                  <td>{s.sensorType}</td>
                  <td>{s.vendor || '—'}</td>
                  <td>
                    <span className={`mall-status-badge mall-status-${s.isActive ? 'active' : 'inactive'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {sensors.length === 0 && (
                <tr><td colSpan={7} className="mall-table-empty">No sensors configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
