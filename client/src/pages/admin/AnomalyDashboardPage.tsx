import React, { useState, useMemo, useEffect } from 'react';
import {
  useGetAnomaliesQuery, useDetectAnomaliesMutation,
  useAcknowledgeAnomalyMutation, useMarkFalsePositiveMutation,
} from '../../store/api/biApi';
import { useGetMyPropertyScopeQuery } from '../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../hooks/useSelectedPropertyId';
import { useConfirm } from '../../components/DialogProvider';
import {
  AlertTriangle, Activity, Building2, DollarSign, TrendingDown, Clock,
  CheckCircle, XCircle, Eye, EyeOff, RefreshCw, Search, Filter, X,
  ChevronDown, ChevronRight, ChevronLeft, Zap, Users, ShieldAlert,
  BarChart3, ArrowUpRight, ArrowDownRight, Layers, Calendar, Ban,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────

const ANOMALY_TYPES: Record<string, { label: string; icon: any; color: string; gradient: string }> = {
  billing_spike:      { label: 'Billing Spike',      icon: DollarSign,    color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
  occupancy_drop:     { label: 'Occupancy Drop',     icon: TrendingDown,  color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #f87171)' },
  late_payment_risk:  { label: 'Late Payment Risk',  icon: Clock,         color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
  maintenance_surge:  { label: 'Maintenance Surge',  icon: Zap,           color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
};

const SEVERITY_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  dot: '🔴' },
  high:     { label: 'High',     color: '#f97316', bg: 'rgba(249,115,22,0.12)', dot: '🟠' },
  medium:   { label: 'Medium',   color: '#eab308', bg: 'rgba(234,179,8,0.12)',  dot: '🟡' },
  low:      { label: 'Low',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  dot: '🟢' },
};

function getMeta(type: string) {
  return ANOMALY_TYPES[type] || { label: type.replace(/_/g, ' '), icon: AlertTriangle, color: '#64748b', gradient: 'linear-gradient(135deg,#64748b,#94a3b8)' };
}

function getSev(s: string) {
  return SEVERITY_CFG[s] || SEVERITY_CFG.medium;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Main Page ───────────────────────────────────────────

export default function AnomalyDashboardPage() {
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'acknowledged' | 'false_positive'>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Active property from the sidebar — follows the same pattern as Parking Overview.
  const selectedProperty = useSelectedPropertyFilter();
  const { data: propsRes } = useGetMyPropertyScopeQuery();
  const properties = propsRes?.data || [];
  const selectedPropertyName = properties.find((p) => p.id === selectedProperty)?.name || '';

  // Reset page whenever the active property changes.
  useEffect(() => { setPage(1); }, [selectedProperty]);

  // Build query params
  const queryParams: any = { page };
  if (statusFilter === 'active') queryParams.acknowledged = 'false';
  else if (statusFilter === 'acknowledged') queryParams.acknowledged = 'true';
  if (selectedProperty) queryParams.propertyId = selectedProperty;

  const { data: anomaliesRes, isLoading, isFetching } = useGetAnomaliesQuery(queryParams);
  const [detectAnomalies, { isLoading: detecting }] = useDetectAnomaliesMutation();
  const [acknowledgeAnomaly] = useAcknowledgeAnomalyMutation();
  const [markFalsePositive] = useMarkFalsePositiveMutation();
  const confirmDialog = useConfirm();

  const allAnomalies = anomaliesRes?.data || [];
  const total = anomaliesRes?.total || 0;
  const limit = anomaliesRes?.limit || 50;
  const totalPages = Math.ceil(total / limit) || 1;

  // Client-side filters (type + search + false_positive)
  const anomalies = useMemo(() => {
    let filtered = allAnomalies;
    if (typeFilter) filtered = filtered.filter((a: any) => a.anomalyType === typeFilter);
    if (statusFilter === 'false_positive') filtered = filtered.filter((a: any) => a.isFalsePositive);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((a: any) =>
        a.description?.toLowerCase().includes(q) ||
        a.anomalyType?.toLowerCase().includes(q) ||
        a.property?.name?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allAnomalies, typeFilter, statusFilter, searchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    const active = allAnomalies.filter((a: any) => !a.acknowledgedAt).length;
    const acked = allAnomalies.filter((a: any) => a.acknowledgedAt && !a.isFalsePositive).length;
    const fp = allAnomalies.filter((a: any) => a.isFalsePositive).length;
    const critical = allAnomalies.filter((a: any) => (a.severity === 'critical' || a.severity === 'high') && !a.acknowledgedAt).length;

    const byType: Record<string, number> = {};
    allAnomalies.forEach((a: any) => { byType[a.anomalyType] = (byType[a.anomalyType] || 0) + 1; });

    return { total: allAnomalies.length, active, acked, fp, critical, byType };
  }, [allAnomalies]);

  // Timeline data (group by date)
  const timeline = useMemo(() => {
    const groups: Record<string, any[]> = {};
    anomalies.forEach((a: any) => {
      const date = new Date(a.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(a);
    });
    return Object.entries(groups);
  }, [anomalies]);

  const handleAcknowledge = async (id: string) => {
    await acknowledgeAnomaly(id);
  };

  const handleFalsePositive = async (id: string) => {
    if (!(await confirmDialog('Mark this anomaly as a false positive? It will be excluded from active alerts.', { danger: true }))) return;
    await markFalsePositive(id);
  };

  return (
    <div className="page-content" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ═══ Header ═══ */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>
            <ShieldAlert size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Anomaly Dashboard
          </h1>
          <p style={S.subtitle}>
            AI-powered anomaly detection across billing, occupancy, and payments
          </p>
        </div>
        <button
          style={S.detectBtn}
          onClick={() => detectAnomalies()}
          disabled={detecting}
        >
          <RefreshCw size={16} className={detecting ? 'spin' : ''} />
          {detecting ? 'Scanning...' : 'Run Detection'}
        </button>
      </div>

      {/* ═══ KPI Cards ═══ */}
      <div style={S.kpiGrid}>
        <KpiCard
          icon={<AlertTriangle size={20} />}
          label="Active Anomalies"
          value={stats.active}
          color="#ef4444"
          active={statusFilter === 'active'}
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
        />
        <KpiCard
          icon={<Zap size={20} />}
          label="Critical / High"
          value={stats.critical}
          color="#f97316"
          sub="Requiring attention"
        />
        <KpiCard
          icon={<CheckCircle size={20} />}
          label="Acknowledged"
          value={stats.acked}
          color="#22c55e"
          active={statusFilter === 'acknowledged'}
          onClick={() => setStatusFilter(statusFilter === 'acknowledged' ? 'all' : 'acknowledged')}
        />
        <KpiCard
          icon={<Ban size={20} />}
          label="False Positives"
          value={stats.fp}
          color="#64748b"
          active={statusFilter === 'false_positive'}
          onClick={() => setStatusFilter(statusFilter === 'false_positive' ? 'all' : 'false_positive')}
        />
      </div>

      {/* ═══ Type Distribution ═══ */}
      <div style={S.typeRow}>
        <button
          style={{ ...S.typeChip, ...(typeFilter === '' ? S.typeChipActive : {}) }}
          onClick={() => setTypeFilter('')}
        >
          <Layers size={14} /> All ({total})
        </button>
        {Object.entries(ANOMALY_TYPES).map(([code, meta]) => {
          const count = stats.byType[code] || 0;
          return (
            <button
              key={code}
              style={{
                ...S.typeChip,
                ...(typeFilter === code ? { border: `1.5px solid ${meta.color}`, background: `${meta.color}12`, color: meta.color } : {}),
              }}
              onClick={() => setTypeFilter(typeFilter === code ? '' : code)}
            >
              <meta.icon size={14} /> {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ═══ Filters Bar ═══ */}
      <div style={S.filterBar}>
        <div style={S.searchBox}>
          <Search size={15} style={{ color: 'var(--text-secondary)' }} />
          <input
            style={S.searchInput}
            placeholder="Search anomalies..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button style={S.searchClear} onClick={() => setSearchQuery('')}><X size={14} /></button>
          )}
        </div>
        <div style={S.filterRight}>
          {/* Property follows the sidebar's "Active Property" selector — not independently choosable here. */}
          <select
            style={S.select}
            value={selectedProperty}
            disabled
          >
            {!selectedProperty && <option value="">All Properties</option>}
            {selectedProperty && <option value={selectedProperty}>{selectedPropertyName || 'Loading…'}</option>}
          </select>
          <select
            style={S.select}
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="false_positive">False Positives</option>
          </select>
        </div>
      </div>

      {/* ═══ Loading ═══ */}
      {isLoading ? (
        <div style={S.loadingWrap}>
          {[1, 2, 3, 4].map(i => <div key={i} style={S.skeleton} />)}
        </div>
      ) : anomalies.length === 0 ? (
        /* ═══ Empty State ═══ */
        <div style={S.emptyState}>
          <CheckCircle size={52} style={{ color: '#22c55e', opacity: 0.2, marginBottom: 16 }} />
          <h3 style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 18 }}>
            {searchQuery || typeFilter || selectedProperty ? 'No matching anomalies' : 'All Clear!'}
          </h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, maxWidth: 400 }}>
            {searchQuery || typeFilter || selectedProperty
              ? 'Try adjusting your filters or run a new detection scan.'
              : 'No anomalies detected. Run a detection scan to check for billing spikes, occupancy drops, or late payment risks.'}
          </p>
          {!searchQuery && !typeFilter && (
            <button
              style={{ ...S.detectBtn, marginTop: 16 }}
              onClick={() => detectAnomalies()}
              disabled={detecting}
            >
              <RefreshCw size={14} className={detecting ? 'spin' : ''} />
              {detecting ? 'Scanning...' : 'Run Detection'}
            </button>
          )}
        </div>
      ) : (
        /* ═══ Timeline View ═══ */
        <div style={S.timeline}>
          {timeline.map(([date, items]) => (
            <div key={date} style={S.timelineGroup}>
              {/* Date header */}
              <div style={S.timelineDateRow}>
                <div style={S.timelineDateDot} />
                <span style={S.timelineDateLabel}>
                  <Calendar size={13} /> {date}
                </span>
                <span style={S.timelineDateCount}>
                  {items.length} anomal{items.length !== 1 ? 'ies' : 'y'}
                </span>
                <div style={S.timelineDateLine} />
              </div>

              {/* Anomaly cards */}
              {items.map((a: any) => {
                const meta = getMeta(a.anomalyType);
                const sev = getSev(a.severity);
                const isExpanded = expandedId === a.id;
                const isAcked = !!a.acknowledgedAt;
                const isFP = a.isFalsePositive;
                const deviation = a.deviationPct ? Number(a.deviationPct) : null;

                return (
                  <div
                    key={a.id}
                    style={{
                      ...S.card,
                      ...(isFP ? S.cardFP : {}),
                      ...(isExpanded ? S.cardExpanded : {}),
                      borderLeft: `3px solid ${isFP ? '#64748b' : sev.color}`,
                    }}
                  >
                    {/* Main row */}
                    <div
                      style={S.cardMain}
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                    >
                      {/* Icon */}
                      <div style={{ ...S.cardIcon, background: isFP ? 'rgba(100,116,139,0.12)' : meta.gradient }}>
                        <meta.icon size={18} color={isFP ? '#64748b' : '#fff'} />
                      </div>

                      {/* Content */}
                      <div style={S.cardContent}>
                        <div style={S.cardTopRow}>
                          <span style={{ ...S.severityBadge, background: sev.bg, color: sev.color }}>
                            {sev.label}
                          </span>
                          <span style={{ ...S.typeBadge, color: meta.color }}>
                            {meta.label}
                          </span>
                          {a.property?.name && (
                            <span style={S.propBadge}>
                              <Building2 size={11} /> {a.property.name}
                            </span>
                          )}
                          {isFP && (
                            <span style={S.fpBadge}>
                              <Ban size={11} /> False Positive
                            </span>
                          )}
                          {isAcked && !isFP && (
                            <span style={S.ackedBadge}>
                              <CheckCircle size={11} /> Acknowledged
                            </span>
                          )}
                        </div>
                        <div style={{ ...S.cardDesc, ...(isFP ? { textDecoration: 'line-through', opacity: 0.5 } : {}) }}>
                          {a.description}
                        </div>
                        <div style={S.cardFooter}>
                          <span style={S.cardTime}>
                            <Clock size={12} /> {timeAgo(a.detectedAt)}
                          </span>
                          {deviation !== null && (
                            <span style={{ ...S.deviationBadge, color: deviation > 0 ? '#ef4444' : '#22c55e' }}>
                              {deviation > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              {Math.abs(deviation).toFixed(1)}% deviation
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expand arrow */}
                      <div style={S.expandArrow}>
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={S.cardDetails}>
                        <div style={S.detailGrid}>
                          <DetailItem label="Anomaly Type" value={meta.label} />
                          <DetailItem label="Severity" value={sev.label} valueColor={sev.color} />
                          <DetailItem label="Entity Type" value={a.entityType || '—'} />
                          <DetailItem label="Detected At" value={fmtDate(a.detectedAt)} />
                          {a.metricValue && (
                            <DetailItem label="Metric Value" value={Number(a.metricValue).toLocaleString()} />
                          )}
                          {a.expectedValue && (
                            <DetailItem label="Expected Value" value={Number(a.expectedValue).toLocaleString()} />
                          )}
                          {deviation !== null && (
                            <DetailItem label="Deviation" value={`${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%`} valueColor={deviation > 0 ? '#ef4444' : '#22c55e'} />
                          )}
                          {a.acknowledgedAt && (
                            <DetailItem label="Acknowledged At" value={fmtDate(a.acknowledgedAt)} />
                          )}
                        </div>

                        {/* Actions */}
                        <div style={S.detailActions}>
                          {!isAcked && (
                            <>
                              <button
                                style={S.ackBtn}
                                onClick={(e) => { e.stopPropagation(); handleAcknowledge(a.id); }}
                              >
                                <Eye size={14} /> Acknowledge
                              </button>
                              <button
                                style={S.fpBtn}
                                onClick={(e) => { e.stopPropagation(); handleFalsePositive(a.id); }}
                              >
                                <Ban size={14} /> Mark False Positive
                              </button>
                            </>
                          )}
                          {isAcked && !isFP && (
                            <span style={{ fontSize: 13, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <CheckCircle size={14} /> Acknowledged
                            </span>
                          )}
                          {isFP && (
                            <span style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Ban size={14} /> Marked as false positive
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ═══ Pagination ═══ */}
      {totalPages > 1 && (
        <div style={S.pagination}>
          <button
            style={{ ...S.pageBtn, opacity: page <= 1 ? 0.4 : 1 }}
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span style={S.pageInfo}>
            Page {page} of {totalPages} • {total} total
          </span>
          <button
            style={{ ...S.pageBtn, opacity: page >= totalPages ? 0.4 : 1 }}
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ═══ Fetch indicator ═══ */}
      {isFetching && !isLoading && (
        <div style={S.fetchOverlay}>
          <div className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function KpiCard({ icon, label, value, color, sub, active, onClick }: {
  icon: React.ReactNode; label: string; value: number; color: string;
  sub?: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      style={{
        ...S.kpiCard,
        ...(active ? { border: `1.5px solid ${color}`, background: `${color}08` } : {}),
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <div style={{ ...S.kpiIcon, background: `${color}14`, color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{sub}</div>}
      </div>
    </button>
  );
}

function DetailItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={S.detailItem}>
      <span style={S.detailLabel}>{label}</span>
      <span style={{ ...S.detailValue, color: valueColor || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// ─── Inline Styles ───────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  // Header
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, margin: 0 },
  subtitle: { color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 },
  detectBtn: {
    display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 10,
    border: 'none', background: 'linear-gradient(135deg, #ef4444, #f97316)', color: '#fff',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
    boxShadow: '0 2px 12px rgba(239,68,68,0.25)',
  },

  // KPI grid
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 },
  kpiCard: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14,
    border: '1px solid var(--border-color)', background: 'var(--card-bg)',
    transition: 'all 0.2s', textAlign: 'left' as any,
  },
  kpiIcon: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Type row
  typeRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as any },
  typeChip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20,
    border: '1.5px solid var(--border-color)', background: 'transparent',
    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  typeChipActive: { border: '1.5px solid #6366f1', background: 'rgba(99,102,241,0.08)', color: '#818cf8' },

  // Filter bar
  filterBar: { display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' as any },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, padding: '0 12px',
    borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)',
    height: 40,
  },
  searchInput: {
    flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none',
  },
  searchClear: {
    background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', padding: 2,
  },
  filterRight: { display: 'flex', gap: 8 },
  select: {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
    background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
  },

  // Loading / empty
  loadingWrap: { display: 'flex', flexDirection: 'column' as any, gap: 12 },
  skeleton: { height: 88, borderRadius: 14, background: 'var(--card-bg)', animation: 'pulse 1.5s infinite' },
  emptyState: {
    textAlign: 'center' as any, padding: '60px 24px', borderRadius: 16,
    background: 'var(--card-bg)', border: '1px solid var(--border-color)',
  },

  // Timeline
  timeline: { display: 'flex', flexDirection: 'column' as any, gap: 0 },
  timelineGroup: { marginBottom: 8 },
  timelineDateRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0 8px',
    position: 'relative' as any,
  },
  timelineDateDot: {
    width: 10, height: 10, borderRadius: '50%', background: '#6366f1',
    border: '2px solid var(--card-bg)', flexShrink: 0, zIndex: 1,
  },
  timelineDateLabel: {
    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  timelineDateCount: { fontSize: 12, color: 'var(--text-secondary)' },
  timelineDateLine: {
    flex: 1, height: 1, background: 'var(--border-color)',
  },

  // Card
  card: {
    marginLeft: 5, marginBottom: 8, borderRadius: 14,
    border: '1px solid var(--border-color)', background: 'var(--card-bg)',
    transition: 'all 0.2s', overflow: 'hidden',
  },
  cardFP: { opacity: 0.6 },
  cardExpanded: { boxShadow: '0 4px 20px rgba(0,0,0,0.15)' },
  cardMain: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
    cursor: 'pointer', transition: 'background 0.15s',
  },
  cardIcon: {
    width: 42, height: 42, borderRadius: 12, display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardContent: { flex: 1, minWidth: 0 },
  cardTopRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as any, marginBottom: 4 },
  severityBadge: { padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 },
  typeBadge: { fontSize: 11, fontWeight: 600, opacity: 0.8 },
  propBadge: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)',
    padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
  },
  fpBadge: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b',
    padding: '2px 8px', borderRadius: 6, background: 'rgba(100,116,139,0.12)',
  },
  ackedBadge: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22c55e',
    padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)',
  },
  cardDesc: { fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 },
  cardFooter: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 },
  cardTime: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' },
  deviationBadge: { display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600 },
  expandArrow: { color: 'var(--text-secondary)', flexShrink: 0 },

  // Card details
  cardDetails: {
    padding: '0 18px 16px', borderTop: '1px solid var(--border-color)',
    marginTop: 0, paddingTop: 14,
  },
  detailGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 12, marginBottom: 14,
  },
  detailItem: { display: 'flex', flexDirection: 'column' as any, gap: 2 },
  detailLabel: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },
  detailValue: { fontSize: 13, fontWeight: 500 },
  detailActions: { display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border-color)' },
  ackBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
    border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
  },
  fpBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
    border: '1px solid var(--border-color)', background: 'transparent',
    color: 'var(--text-secondary)', fontWeight: 500, fontSize: 13, cursor: 'pointer',
    transition: 'all 0.15s',
  },

  // Pagination
  pagination: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16,
    marginTop: 24, padding: '16px 0',
  },
  pageBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
    border: '1px solid var(--border-color)', background: 'var(--card-bg)',
    color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
  },
  pageInfo: { fontSize: 13, color: 'var(--text-secondary)' },

  // Fetch overlay
  fetchOverlay: {
    position: 'fixed' as any, top: 16, right: 16, padding: '8px 12px',
    borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border-color)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 100,
    display: 'flex', alignItems: 'center', gap: 8,
  },
};
