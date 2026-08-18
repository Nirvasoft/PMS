import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetPipelineQuery, useGetLeadStatsQuery, useUpdateLeadStageMutation,
  useCreateLeadMutation, useGetLeadsQuery,
  type PipelineStage,
} from '../../../store/api/crmApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  Target, Plus, Search, X, TrendingUp, Users, Clock, BarChart3, ChevronRight,
  Phone, Mail, Calendar, ShieldOff,
} from 'lucide-react';
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

export default function LeadPipelinePage() {
  const navigate = useNavigate();
  const [propertyFilter, setPropertyFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: pipelineData, isLoading } = useGetPipelineQuery({ propertyId: propertyFilter || undefined });
  const { data: statsData } = useGetLeadStatsQuery({ propertyId: propertyFilter || undefined });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [updateStage] = useUpdateLeadStageMutation();

  const stats = statsData?.data;
  const stages = pipelineData?.data?.stages || [];
  const properties = propertiesData?.data || [];

  const handleDrop = useCallback(async (leadId: string, newStage: string) => {
    try {
      await updateStage({ id: leadId, stage: newStage }).unwrap();
      toast.success(`Lead moved to ${STAGE_META[newStage]?.label || newStage}`);
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Cannot move lead to this stage');
    }
  }, [updateStage]);

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
        <select className="filter-select" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
      ) : (
        <div className="kanban-board">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.stage}
              stage={stage}
              meta={STAGE_META[stage.stage]}
              onDrop={handleDrop}
              onClickLead={(id) => navigate(`/admin/crm/leads/${id}`)}
            />
          ))}
        </div>
      )}

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

// ── Kanban Column ──────────────────────────────

function KanbanColumn({ stage, meta, onDrop, onClickLead }: {
  stage: PipelineStage;
  meta: { label: string; color: string } | undefined;
  onDrop: (leadId: string, newStage: string) => void;
  onClickLead: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`kanban-column stage-${stage.stage} ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const leadId = e.dataTransfer.getData('leadId');
        if (leadId) onDrop(leadId, stage.stage);
      }}
    >
      <div className="kanban-col-header">
        <span className="col-title">
          <span className="col-dot" style={{ background: meta?.color || '#666' }} />
          {meta?.label || stage.stage}
        </span>
        <span className="col-count">{stage.count}</span>
      </div>
      <div className="kanban-col-body">
        {stage.leads.map((lead) => (
          <div
            key={lead.id}
            className="lead-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('leadId', lead.id);
              (e.target as HTMLElement).classList.add('dragging');
            }}
            onDragEnd={(e) => (e.target as HTMLElement).classList.remove('dragging')}
            onClick={() => onClickLead(lead.id)}
          >
            <div className="lc-name">{lead.displayName}</div>
            {(lead.budgetMin || lead.budgetMax) && (
              <div className="lc-budget">
                Budget: {lead.budgetMin ? Number(lead.budgetMin).toLocaleString() : '–'} – {lead.budgetMax ? Number(lead.budgetMax).toLocaleString() : '–'}
              </div>
            )}
            <div className="lc-footer">
              <span className={`priority-chip ${lead.priority}`}>{lead.priority}</span>
              {lead.isBlacklisted && <span className="blacklist-chip"><ShieldOff size={9} /> Blacklisted</span>}
              {lead.source && <span className="lc-source">{lead.source.replace(/_/g, ' ')}</span>}
              {lead.agent && (
                <span className="lc-agent">
                  <span className="lc-agent-dot" />
                  {lead.agent.profile ? `${lead.agent.profile.firstName} ${lead.agent.profile.lastName?.[0]}.` : lead.agent.email.split('@')[0]}
                </span>
              )}
            </div>
          </div>
        ))}
        {stage.leads.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
            No leads
          </div>
        )}
      </div>
    </div>
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
        <h2>New Lead</h2>
        <div className="crm-modal .form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>First Name *</label>
            <input className="form-input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="John" />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input className="form-input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" />
          </div>
        </div>
        <div className="crm-modal .form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
        <div className="crm-modal .form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
        <div className="crm-modal .form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
