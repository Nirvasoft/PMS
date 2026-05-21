import { useState } from 'react';
import { useGetCampaignsQuery, useCreateCampaignMutation, useGetCampaignROIQuery, type CampaignItem } from '../../../store/api/crmApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { Megaphone, Plus, TrendingUp, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import './CRMPage.css';

export default function CampaignsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetCampaignsQuery({ page, limit: 20 });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });

  const campaigns = data?.data || [];
  const meta = data?.meta;
  const properties = propertiesData?.data || [];

  return (
    <div className="campaigns-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Megaphone size={22} /></div>
          <div>
            <h1>Marketing Campaigns</h1>
            <p>{meta ? `${meta.total} campaigns` : 'Loading…'}</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {/* Table */}
      <div className="campaign-table-wrap">
        <div className="campaign-table-header">
          <span>Campaign</span><span>Channel</span><span>Budget</span>
          <span>Dates</span><span>Leads</span><span>Conversions</span><span>ROI</span>
        </div>
        {isLoading ? (
          <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
        ) : campaigns.length === 0 ? (
          <div className="table-empty"><Megaphone size={40} /><p>No campaigns found</p></div>
        ) : (
          campaigns.map((c: CampaignItem) => <CampaignRow key={c.id} campaign={c} />)
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span>Page {page} of {meta.totalPages}</span>
          <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateCampaignModal
          properties={properties}
          onClose={() => setShowCreate(false)}
          onCreated={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignItem }) {
  const { data: roiData } = useGetCampaignROIQuery(campaign.id);
  const roi = roiData?.data;

  return (
    <div className="campaign-row">
      <div>
        <div className="camp-name">{campaign.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {campaign.status}
        </div>
      </div>
      <div>
        {campaign.channel && <span className="camp-channel">{campaign.channel.replace(/_/g, ' ')}</span>}
      </div>
      <div>{campaign.budget ? `$${Number(campaign.budget).toLocaleString()}` : '—'}</div>
      <div style={{ fontSize: 12 }}>
        {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : '—'}
        {campaign.endDate ? ` → ${new Date(campaign.endDate).toLocaleDateString()}` : ''}
      </div>
      <div style={{ fontWeight: 600 }}>{campaign.totalLeads}</div>
      <div style={{ fontWeight: 600 }}>{campaign.totalConversions}</div>
      <div>
        {roi ? (
          <span className={`camp-roi ${roi.roi >= 0 ? 'positive' : 'negative'}`}>
            {roi.roi >= 0 ? '+' : ''}{roi.roi}%
          </span>
        ) : '—'}
      </div>
    </div>
  );
}

function CreateCampaignModal({ properties, onClose, onCreated }: {
  properties: any[]; onClose: () => void; onCreated: () => void;
}) {
  const [createCampaign, { isLoading }] = useCreateCampaignMutation();
  const [form, setForm] = useState({
    name: '', propertyId: '', channel: 'email', budget: '', startDate: '', endDate: '',
  });
  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    try {
      await createCampaign({
        name: form.name,
        propertyId: form.propertyId || undefined,
        channel: form.channel || undefined,
        budget: form.budget ? Number(form.budget) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      }).unwrap();
      toast.success('Campaign created');
      onCreated();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <h2>New Marketing Campaign</h2>
        <div className="form-group">
          <label>Campaign Name *</label>
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Summer Promo 2026" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Channel</label>
            <select className="form-input" value={form.channel} onChange={e => set('channel', e.target.value)}>
              <option value="email">Email</option>
              <option value="facebook">Facebook</option>
              <option value="google_ads">Google Ads</option>
              <option value="portal">Portal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Budget ($)</label>
            <input className="form-input" type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="form-group">
          <label>Property (optional)</label>
          <select className="form-input" value={form.propertyId} onChange={e => set('propertyId', e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Start Date</label>
            <input className="form-input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input className="form-input" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={isLoading || !form.name}>
            {isLoading ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}
