import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetLeadStatsQuery, useGetLeadsQuery,
  type LeadListItem,
} from '../../../store/api/crmApi';
import { Target, Plus, Search, X, ShieldOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import './CRMPage.css';

const STAGE_META: Record<string, { label: string; color: string }> = {
  new:                { label: 'New',               color: '#3b82f6' },
  contacted:          { label: 'Contacted',         color: '#8b5cf6' },
  viewing_scheduled:  { label: 'Viewing Scheduled', color: '#f59e0b' },
  viewed:             { label: 'Viewed',            color: '#06b6d4' },
  offer_sent:         { label: 'Offer Sent',        color: '#ec4899' },
  negotiating:        { label: 'Negotiating',       color: '#f97316' },
  lease_signed:       { label: 'Lease Signed',      color: '#10b981' },
};

const leadDisplayName = (lead: LeadListItem) => lead.lastName || lead.companyName || 'Unknown';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function LeadPipelinePage() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, stageFilter, priorityFilter]);

  const { data: statsData } = useGetLeadStatsQuery({});
  const { data: leadsData, isFetching } = useGetLeadsQuery({
    search: debouncedSearch || undefined,
    stage: stageFilter || undefined,
    priority: priorityFilter || undefined,
    page,
    limit: pageSize,
  });

  const stats = statsData?.data;
  const leads = leadsData?.data || [];
  const meta = leadsData?.meta;
  const hasFilters = !!(search || stageFilter || priorityFilter);

  return (
    <div className="crm-pipeline-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div
            className="page-icon-lg"
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Target size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Lead Pipeline</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {meta ? `${meta.total} total leads` : 'Loading…'}
            </p>
          </div>
        </div>
        <PermissionGuard permission="crm-leads.write">
          <button className="btn-primary" onClick={() => navigate('/admin/crm/leads/new')}>
            <Plus size={15} /> New Lead
          </button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      {stats && (
        <div className="crm-stats-row">
          <div className="crm-stat-card">
            <span className="stat-value">{stats.totalActive}</span>
            <span className="stat-label">Active Leads</span>
          </div>
          <div className="crm-stat-card">
            <span className="stat-value">{stats.totalThisMonth}</span>
            <span className="stat-label">New This Month</span>
          </div>
          <div className="crm-stat-card">
            <span className="stat-value">{stats.conversionRate}%</span>
            <span className="stat-label">Conversion Rate</span>
          </div>
          <div className="crm-stat-card">
            <span className="stat-value">{stats.avgDaysToConvert}d</span>
            <span className="stat-label">Avg. Days to Convert</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="pipeline-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search leads by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} title="Clear search"><X size={14} /></button>}
        </div>
        <select className="filter-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STAGE_META).map(([value, m]) => <option key={value} value={value}>{m.label}</option>)}
        </select>
        <select className="filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Table */}
      <div className="lead-table-wrap">
        <TableScrollWrapper className="tenant-table-scroll">
          <div className="lead-table-inner">
            <div className="lead-table-header">
              <span>Date</span>
              <span>Lead Number</span>
              <span>Lease Number</span>
              <span>Name</span>
              <span>Stage</span>
              <span>Priority</span>
            </div>

            {isFetching && leads.length === 0 ? (
              <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
            ) : leads.length === 0 ? (
              <div className="table-empty">
                <Target size={40} />
                <p>No leads found{hasFilters ? ' — try clearing filters' : ''}</p>
              </div>
            ) : (
              leads.map((lead) => {
                const stageMeta = STAGE_META[lead.stage];
                return (
                  <div key={lead.id} className="lead-row" onClick={() => navigate(`/admin/crm/leads/${lead.id}`)}>
                    <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
                    <span>{lead.leadNumber || '–'}</span>
                    <span>{lead.convertedLease?.leaseNumber || '–'}</span>
                    <span className="lc-name">
                      {leadDisplayName(lead)}
                      {lead.isBlacklisted && <span className="blacklist-chip"><ShieldOff size={9} /> Blacklisted</span>}
                    </span>
                    <span>
                      <span className="stage-chip" style={{ background: `${stageMeta?.color || '#666'}18`, color: stageMeta?.color || '#666' }}>
                        {stageMeta?.label || lead.stage}
                      </span>
                    </span>
                    <span><span className={`priority-chip ${lead.priority}`}>{lead.priority}</span></span>
                  </div>
                );
              })
            )}
          </div>
        </TableScrollWrapper>

        {meta && meta.total >= 10 && (
          <div className="lead-pagination billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="lead-page-size">Rows per page:</label>
                <select
                  id="lead-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="page-btns">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {meta.page} of {Math.max(meta.totalPages, 1)}
              </span>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

