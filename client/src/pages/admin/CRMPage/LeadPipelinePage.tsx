import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetLeadStatsQuery, useCreateLeadMutation, useGetLeadsQuery,
  type LeadListItem,
} from '../../../store/api/crmApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { Target, Plus, Search, X, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
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

const SOURCE_OPTIONS = [
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'agent', label: 'Agent' },
  { value: 'portal', label: 'Portal' },
];

const leadDisplayName = (lead: LeadListItem) =>
  lead.companyName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown';

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
  const [showCreate, setShowCreate] = useState(false);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
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
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
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
        <select className="filter-select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">All Sources</option>
          {SOURCE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <LeadListView
        key={`${propertyFilter}|${debouncedSearch}|${stageFilter}|${priorityFilter}|${sourceFilter}`}
        propertyId={propertyFilter}
        search={debouncedSearch}
        stage={stageFilter}
        priority={priorityFilter}
        source={sourceFilter}
        onClickLead={(id) => navigate(`/admin/crm/leads/${id}`)}
      />

      {/* Create Lead Modal */}
      {showCreate && (
        <CreateLeadModal
          properties={properties}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); navigate(`/admin/crm/leads/${id}`); }}
        />
      )}
    </div>
  );
}

// ── Lead List View ──────────────────────────────

const LEADS_PER_PAGE = 10;

function LeadListView({ propertyId, search, stage, priority, source, onClickLead }: {
  propertyId: string; search: string; stage: string; priority: string; source: string;
  onClickLead: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useGetLeadsQuery({
    propertyId: propertyId || undefined,
    search: search || undefined,
    stage: stage || undefined,
    priority: priority || undefined,
    source: source || undefined,
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
        <span>Name</span>
        <span>Stage</span>
        <span>Property</span>
        <span>Priority</span>
        <span>Lease Number</span>
        <span>Date</span>
      </div>
      {leads.map((lead) => {
        const meta = STAGE_META[lead.stage];
        return (
          <div key={lead.id} className="lead-row" onClick={() => onClickLead(lead.id)}>
            <span className="lc-name">
              {leadDisplayName(lead)}
              {lead.isBlacklisted && <span className="blacklist-chip"><ShieldOff size={9} /> Blacklisted</span>}
            </span>
            <span>
              <span className="stage-chip" style={{ background: `${meta?.color || '#666'}18`, color: meta?.color || '#666' }}>
                {meta?.label || lead.stage}
              </span>
            </span>
            <span>{lead.property?.name || '–'}</span>
            <span><span className={`priority-chip ${lead.priority}`}>{lead.priority}</span></span>
            <span>{lead.convertedLease?.leaseNumber || '–'}</span>
            <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
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

// ── Create Lead Modal ──────────────────────────

function CreateLeadModal({ properties, onClose, onCreated }: {
  properties: any[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [createLead, { isLoading }] = useCreateLeadMutation();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', mobile: '',
    propertyId: '', source: 'website', priority: 'medium',
    budgetMin: '', budgetMax: '', unitTypePreference: '', leaseTermMonths: '',
  });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    try {
      const body: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName || undefined,
        email: form.email || undefined,
        mobile: form.mobile || undefined,
        propertyId: form.propertyId || undefined,
        source: form.source || undefined,
        priority: form.priority,
        unitTypePreference: form.unitTypePreference || undefined,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        leaseTermMonths: form.leaseTermMonths ? Number(form.leaseTermMonths) : undefined,
      };
      const result = await createLead(body).unwrap();
      toast.success('Lead created');
      onCreated(result.data.id);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to create lead');
    }
  };

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="crm-modal-close" onClick={onClose} title="Close"><X size={16} /></button>
        <h2>New Lead</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Code *</label>
            <input className="form-input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="John" />
          </div>
          <div className="form-group">
            <label>Name</label>
            <input className="form-input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Email</label>
            <input className="form-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="john@email.com" />
          </div>
          <div className="form-group">
            <label>Mobile</label>
            <input className="form-input" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="+1-555-1234" />
          </div>
        </div>
        <div className="form-group">
          <label>Property</label>
          <select className="form-input" value={form.propertyId} onChange={(e) => set('propertyId', e.target.value)}>
            <option value="">— Select property —</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Source</label>
            <select className="form-input" value={form.source} onChange={(e) => set('source', e.target.value)}>
              <option value="website">Website</option>
              <option value="walk_in">Walk-in</option>
              <option value="referral">Referral</option>
              <option value="agent">Agent</option>
              <option value="portal">Portal</option>
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select className="form-input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Budget Min</label>
            <input className="form-input" type="number" value={form.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>Budget Max</label>
            <input className="form-input" type="number" value={form.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} placeholder="5000" />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={isLoading || !form.firstName}>
            {isLoading ? 'Creating…' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
