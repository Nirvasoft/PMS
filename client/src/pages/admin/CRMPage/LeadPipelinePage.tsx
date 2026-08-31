import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetLeadStatsQuery, useGetLeadsQuery,
  type LeadListItem,
} from '../../../store/api/crmApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { Target, Plus, Search, X, ShieldOff } from 'lucide-react';
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
  const [propertyFilter, setPropertyFilter] = useState('');

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: statsData } = useGetLeadStatsQuery({ propertyId: propertyFilter || undefined });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });

  const stats = statsData?.data;
  const properties = propertiesData?.data || [];

  return (
    <div className="crm-pipeline-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Target size={22} /></div>
          <div>
            <h1>Lead Pipeline</h1>
            <p>Manage your CRM leasing pipeline</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => navigate('/admin/crm/leads/new')}>
          <Plus size={15} /> New Lead
        </button>
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
        <select className="filter-select" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="filter-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STAGE_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
        <select className="filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <LeadListView
        key={`${propertyFilter}|${debouncedSearch}|${stageFilter}|${priorityFilter}`}
        propertyId={propertyFilter}
        search={debouncedSearch}
        stage={stageFilter}
        priority={priorityFilter}
        onClickLead={(id) => navigate(`/admin/crm/leads/${id}`)}
      />
    </div>
  );
}

// ── Lead List View ──────────────────────────────

const LEADS_PER_PAGE = 10;

function LeadListView({ propertyId, search, stage, priority, onClickLead }: {
  propertyId: string; search: string; stage: string; priority: string;
  onClickLead: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useGetLeadsQuery({
    propertyId: propertyId || undefined,
    search: search || undefined,
    stage: stage || undefined,
    priority: priority || undefined,
    page,
    limit: LEADS_PER_PAGE,
  });

  const leads = data?.data || [];
  const totalPages = data?.meta?.totalPages || 1;

  if (isFetching && leads.length === 0) {
    return <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>;
  }

  if (leads.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-tertiary)', fontSize: '13px' }}>No leads match your filters</div>;
  }

  return (
    <>
    <div className="lead-table-wrap">
      <div className="lead-table-header">
        <span>Date</span>
        <span>Lead Number</span>
        <span>Lease Number</span>
        <span>Name</span>
        <span>Property</span>
        <span>Stage</span>
        <span>Priority</span>
      </div>
      {leads.map((lead) => {
        const meta = STAGE_META[lead.stage];
        return (
          <div key={lead.id} className="lead-row" onClick={() => onClickLead(lead.id)}>
            <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
            <span>{lead.leadNumber || '–'}</span>
            <span>{lead.convertedLease?.leaseNumber || '–'}</span>
            <span className="lc-name">
              {leadDisplayName(lead)}
              {lead.isBlacklisted && <span className="blacklist-chip"><ShieldOff size={9} /> Blacklisted</span>}
            </span>
            <span>{lead.property?.name || '–'}</span>
            <span>
              <span className="stage-chip" style={{ background: `${meta?.color || '#666'}18`, color: meta?.color || '#666' }}>
                {meta?.label || lead.stage}
              </span>
            </span>
            <span><span className={`priority-chip ${lead.priority}`}>{lead.priority}</span></span>
          </div>
        );
      })}
    </div>
    {totalPages > 1 && (
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span>Page {page} of {totalPages}</span>
        <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>
    )}
    </>
  );
}
