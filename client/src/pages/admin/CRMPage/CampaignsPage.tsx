import { useState, useEffect } from 'react';
import {
  useGetCampaignsQuery, useCreateCampaignMutation, useUpdateCampaignMutation,
  useDeleteCampaignMutation,
  useGetCampaignROIQuery, type CampaignItem,
} from '../../../store/api/crmApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import {
  Megaphone, Plus, Edit3, Save, X, Calendar, DollarSign, Trash2, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';
import './CRMPage.css';

export default function CampaignsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignItem | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const activePropertyFilter = useSelectedPropertyFilter();

  // Reset pagination whenever the sidebar's Active Property changes.
  useEffect(() => { setPage(1); }, [activePropertyFilter]);

  const { data, isLoading } = useGetCampaignsQuery({
    propertyId: activePropertyFilter || undefined,
    page, limit: pageSize,
  });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });

  const campaigns = data?.data || [];
  const meta = data?.meta;
  const properties = propertiesData?.data || [];

  return (
    <div className="campaigns-page">
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
            <Megaphone size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Marketing Campaigns</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {meta ? `${meta.total} total campaigns` : 'Loading…'}
            </p>
          </div>
        </div>
        <PermissionGuard permission="crm-campaigns.write">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Campaign
          </button>
        </PermissionGuard>
      </div>

      {/* Table */}
      <div className="campaign-table-wrap">
        <TableScrollWrapper className="tenant-table-scroll">
          <div className="campaign-table-inner">
            <div className="campaign-table-header">
              <span>Campaign</span><span>Channel</span><span>Budget</span>
              <span>Dates</span><span>Leads</span><span>Conversions</span><span>ROI</span><span></span>
            </div>
            {isLoading ? (
              <div className="table-loading"><div className="lp" /><div className="lp" /><div className="lp" /></div>
            ) : campaigns.length === 0 ? (
              <div className="table-empty"><Megaphone size={40} /><p>No campaigns found</p></div>
            ) : (
              campaigns.map((c: CampaignItem) => (
                <CampaignRow key={c.id} campaign={c} onEdit={() => setEditingCampaign(c)} />
              ))
            )}
          </div>
        </TableScrollWrapper>

        {/* Pagination */}
        {meta && meta.total >= 10 && (
          <div className="campaign-pagination billing-pagination">
            <div className="pagination-left">
              <div className="page-size-selector">
                <label htmlFor="campaign-page-size">Rows per page:</label>
                <select
                  id="campaign-page-size"
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
                onClick={() => setPage(p => p - 1)}
                title="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="page-num-display">
                Page {meta.page} of {Math.max(meta.totalPages, 1)}
              </span>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage(p => p + 1)}
                title="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CampaignFormModal
          properties={properties}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit Modal */}
      {editingCampaign && (
        <CampaignFormModal
          campaign={editingCampaign}
          properties={properties}
          onClose={() => setEditingCampaign(null)}
        />
      )}
    </div>
  );
}

function CampaignRow({ campaign, onEdit }: { campaign: CampaignItem; onEdit: () => void }) {
  const { data: roiData } = useGetCampaignROIQuery(campaign.id);
  const [deleteCampaign, { isLoading: isDeleting }] = useDeleteCampaignMutation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const roi = roiData?.data;

  const handleDelete = async () => {
    try {
      await deleteCampaign(campaign.id).unwrap();
      toast.success('Campaign deleted');
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed to delete');
    }
  };

  return (
    <>
      <div className="campaign-row">
        <div>
          <div className="camp-name">{campaign.name}</div>
          <div className="camp-status-row">
            <span className={`camp-status-badge status-${campaign.status}`}>{campaign.status}</span>
            {campaign.property && <span className="camp-property-name">{campaign.property.name}</span>}
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
        <PermissionGuard permission="crm-campaigns.write">
          <div className="camp-actions">
            <button className="row-btn-edit" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit campaign">
              <Edit3 size={13} />
            </button>
            <button className="row-btn-delete" onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }} title="Delete campaign">
              <Trash2 size={13} />
            </button>
          </div>
        </PermissionGuard>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="crm-modal-overlay">
          <div className="crm-modal delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <div className="delete-confirm-icon"><AlertTriangle size={28} /></div>
              <h2>Delete Campaign</h2>
            </div>
            <p className="delete-confirm-msg">
              Are you sure you want to delete <strong>{campaign.name}</strong>?
              {campaign.totalLeads > 0 && (
                <span className="delete-confirm-warning">
                  This campaign has {campaign.totalLeads} associated lead{campaign.totalLeads > 1 ? 's' : ''}. They will be unlinked but not deleted.
                </span>
              )}
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                <X size={14} /> Cancel
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={isDeleting}>
                <Trash2 size={14} /> {isDeleting ? 'Deleting…' : 'Delete Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Shared Create / Edit Modal ──────────────

function CampaignFormModal({ campaign, properties, onClose }: {
  campaign?: CampaignItem;
  properties: any[];
  onClose: () => void;
}) {
  const isEdit = !!campaign;
  const [createCampaign, { isLoading: isCreating }] = useCreateCampaignMutation();
  const [updateCampaign, { isLoading: isUpdating }] = useUpdateCampaignMutation();
  const isSaving = isCreating || isUpdating;

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [form, setForm] = useState({
    name: campaign?.name || '',
    propertyId: campaign?.property?.id || '',
    channel: campaign?.channel || 'email',
    budget: campaign?.budget ? Number(campaign.budget).toString() : '',
    startDate: campaign?.startDate ? campaign.startDate.substring(0, 10) : '',
    endDate: campaign?.endDate ? campaign.endDate.substring(0, 10) : '',
    status: campaign?.status || 'active',
  });
  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if (!form.name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    try {
      if (isEdit) {
        // Only send changed fields
        const data: Record<string, unknown> = {};
        if (form.name !== campaign!.name) data.name = form.name;
        if ((form.propertyId || null) !== (campaign!.property?.id || null)) data.propertyId = form.propertyId || null;
        if (form.channel !== campaign!.channel) data.channel = form.channel;
        const newBudget = form.budget ? Number(form.budget) : null;
        const oldBudget = campaign!.budget ? Number(campaign!.budget) : null;
        if (newBudget !== oldBudget) data.budget = newBudget;
        const newStart = form.startDate || null;
        const oldStart = campaign!.startDate ? campaign!.startDate.substring(0, 10) : null;
        if (newStart !== oldStart) data.startDate = newStart;
        const newEnd = form.endDate || null;
        const oldEnd = campaign!.endDate ? campaign!.endDate.substring(0, 10) : null;
        if (newEnd !== oldEnd) data.endDate = newEnd;
        if (form.status !== campaign!.status) data.status = form.status;

        if (Object.keys(data).length === 0) { onClose(); return; }

        await updateCampaign({ id: campaign!.id, data }).unwrap();
        toast.success('Campaign updated');
      } else {
        await createCampaign({
          name: form.name,
          propertyId: form.propertyId || undefined,
          channel: form.channel || undefined,
          budget: form.budget ? Number(form.budget) : undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
        }).unwrap();
        toast.success('Campaign created');
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || `Failed to ${isEdit ? 'update' : 'create'} campaign`);
    }
  };

  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal camp-form-modal" onClick={e => e.stopPropagation()}>
        <div className="camp-modal-header">
          <div className="camp-modal-header-left">
            <div className="camp-modal-icon">
              {isEdit ? <Edit3 size={18} /> : <Megaphone size={18} />}
            </div>
            <div>
              <h2>{isEdit ? 'Edit Campaign' : 'New Marketing Campaign'}</h2>
              <p className="camp-modal-subtitle">
                {isEdit ? 'Update campaign channel, budget, and schedule' : 'Configure campaign channel, target budget, and schedule'}
              </p>
            </div>
          </div>
          <button type="button" className="crm-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form
          className="camp-modal-body"
          noValidate
          onSubmit={e => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div className="camp-field">
            <label>Campaign Name <span className="req-star">*</span></label>
            <input
              className={`camp-input${hasAttemptedSubmit && !form.name.trim() ? ' input-error' : ''}`}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Summer Promo 2026"
              autoFocus
            />
            {hasAttemptedSubmit && !form.name.trim() && (
              <span className="field-error-text">Campaign name is required</span>
            )}
          </div>

          <div className="camp-form-grid-2">
            <div className="camp-field">
              <label>Channel</label>
              <select className="camp-input" value={form.channel} onChange={e => set('channel', e.target.value)}>
                <option value="email">Email</option>
                <option value="facebook">Facebook</option>
                <option value="google_ads">Google Ads</option>
                <option value="portal">Portal</option>
                <option value="instagram">Instagram</option>
                <option value="sms">SMS</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="camp-field">
              <label><DollarSign size={13} /> Budget</label>
              <input
                className="camp-input"
                type="number"
                value={form.budget}
                onChange={e => set('budget', e.target.value)}
                placeholder="0.00"
                min="0"
              />
            </div>
          </div>

          <div className="camp-field">
            <label>Property <span className="camp-optional">(optional)</span></label>
            <select className="camp-input" value={form.propertyId} onChange={e => set('propertyId', e.target.value)}>
              <option value="">All Properties</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="camp-form-grid-2">
            <div className="camp-field">
              <label><Calendar size={13} /> Start Date</label>
              <input
                className="camp-input"
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
              />
            </div>
            <div className="camp-field">
              <label><Calendar size={13} /> End Date</label>
              <input
                className="camp-input"
                type="date"
                value={form.endDate}
                onChange={e => set('endDate', e.target.value)}
              />
            </div>
          </div>

          {isEdit && (
            <div className="camp-field">
              <label>Status</label>
              <select className="camp-input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              <X size={14} /> Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              <Save size={14} /> {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
