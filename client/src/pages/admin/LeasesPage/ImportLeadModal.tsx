import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetLeadsQuery, type LeadListItem } from '../../../store/api/crmApi';
import { X, Search, ChevronLeft, ChevronRight, Import } from 'lucide-react';

// Stages excluded per spec: new, contacted, lease_signed
const EXCLUDED_STAGES = new Set(['new', 'contacted', 'lease_signed']);

const STAGE_META: Record<string, { label: string; color: string }> = {
  viewing_scheduled: { label: 'Viewing Scheduled', color: '#f59e0b' },
  viewed:            { label: 'Viewed',            color: '#06b6d4' },
  offer_sent:        { label: 'Offer Sent',        color: '#ec4899' },
  negotiating:       { label: 'Negotiating',       color: '#f97316' },
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#10b981',
};

const leadName = (lead: LeadListItem) =>
  [lead.firstName, lead.lastName].filter(Boolean).join(' ') ||
  lead.companyName ||
  '—';

const LEADS_PER_PAGE = 10;

interface Props {
  onClose: () => void;
}

export default function ImportLeadModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // Fetch leads that are NOT in the excluded stages.
  // We load without stage filter and filter client-side (API supports single stage
  // filter; to exclude multiple we filter after fetch).
  const { data, isFetching } = useGetLeadsQuery({
    search: debouncedSearch || undefined,
    page,
    limit: LEADS_PER_PAGE * 3, // fetch more to account for client-side filtering
  });

  const allLeads  = data?.data || [];
  const eligible  = allLeads.filter(l => !EXCLUDED_STAGES.has(l.stage));
  const totalPages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / LEADS_PER_PAGE));

  const handleSelect = (lead: LeadListItem) => {
    const params = new URLSearchParams();
    params.set('leadId', lead.id);
    if (lead.property?.id) params.set('propertyId', lead.property.id);
    navigate(`/admin/leases/new?${params.toString()}`);
    onClose();
  };

  return (
    <div className="il-overlay" onClick={onClose}>
      <div className="il-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="il-header">
          <div className="il-title">
            <Import size={18} />
            <span>Import Lead</span>
          </div>
          <p className="il-subtitle">Select a lead from the pipeline to prefill the lease form</p>
          <button className="il-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Search */}
        <div className="il-search-wrap">
          <Search size={14} className="il-search-icon" />
          <input
            className="il-search-input"
            type="text"
            placeholder="Search by name, email or lead number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="il-search-clear" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="il-table-wrap">
          <div className="il-table-head">
            <span>Date</span>
            <span>Lead Number</span>
            <span>Name</span>
            <span>Property</span>
            <span>Stage</span>
            <span>Priority</span>
          </div>

          <div className="il-table-body">
            {isFetching ? (
              <div className="il-state">
                <div className="il-lp" /><div className="il-lp" /><div className="il-lp" />
              </div>
            ) : eligible.length === 0 ? (
              <div className="il-state il-empty">
                No eligible leads found
                {search && <span> — try clearing your search</span>}
              </div>
            ) : eligible.map(lead => {
              const stageMeta = STAGE_META[lead.stage];
              return (
                <div key={lead.id} className="il-row" onClick={() => handleSelect(lead)}>
                  <span className="il-cell il-date">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </span>
                  <span className="il-cell il-mono">{lead.leadNumber || '—'}</span>
                  <span className="il-cell il-name">{leadName(lead)}</span>
                  <span className="il-cell il-dim">{lead.property?.name || '—'}</span>
                  <span className="il-cell">
                    {stageMeta ? (
                      <span
                        className="il-stage-chip"
                        style={{
                          background: `${stageMeta.color}1a`,
                          color: stageMeta.color,
                          borderColor: `${stageMeta.color}40`,
                        }}
                      >
                        {stageMeta.label}
                      </span>
                    ) : (
                      <span className="il-dim">{lead.stage}</span>
                    )}
                  </span>
                  <span className="il-cell">
                    <span
                      className="il-priority-chip"
                      style={{ color: PRIORITY_COLOR[lead.priority] || '#94a3b8' }}
                    >
                      {lead.priority}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="il-pagination">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Footer hint */}
        <div className="il-footer-hint">
          Leads with stages <em>New</em>, <em>Contacted</em>, and <em>Lease Signed</em> are excluded
        </div>
      </div>
    </div>
  );
}
