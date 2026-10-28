import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import '../MaintenancePage/MaintenancePage.css';
import { useParams, useNavigate } from 'react-router-dom';
import { useGetFacilityAssetByIdQuery, useUpdateFacilityAssetMutation, useDeleteFacilityAssetMutation, useGetAssetServiceHistoryQuery } from '../../../store/api/facilityApi';
import { useGetPmSchedulesQuery } from '../../../store/api/pmApi';
import {
  ArrowLeft, Loader2, MapPin, Shield,
  CalendarClock, FileText, History, Trash2, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import { TableScrollWrapper } from '../../../components/TableScrollWrapper';

const ASSET_TYPES: Record<string, { label: string; icon: string }> = {
  hvac: { label: 'HVAC', icon: 'â„ï¸' }, elevator: { label: 'Elevator', icon: 'ðŸ›—' },
  generator: { label: 'Generator', icon: 'âš¡' }, fire_system: { label: 'Fire System', icon: 'ðŸ§¯' },
  water_pump: { label: 'Water Pump', icon: 'ðŸ’§' }, cctv: { label: 'CCTV', icon: 'ðŸ“¹' },
  access_control: { label: 'Access Control', icon: 'ðŸ”‘' }, lighting: { label: 'Lighting', icon: 'ðŸ’¡' },
  other: { label: 'Other', icon: 'ðŸ”§' },
};

const STATUS_MAP: Record<string, string> = {
  operational: 'completed', under_maintenance: 'in_progress',
  decommissioned: 'closed', fault: 'cancelled',
};

export default function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: assetData, isLoading } = useGetFacilityAssetByIdQuery(id!);
  const [updateAsset] = useUpdateFacilityAssetMutation();
  const asset = assetData?.data;

  // Fetch linked PM schedules
  const { data: pmData } = useGetPmSchedulesQuery({
    propertyId: asset?.propertyId,
    page: 1, limit: 50,
  }, { skip: !asset?.propertyId });
  const allPmSchedules = pmData?.data || [];
  // Filter to schedules linked to this asset (or unlinked ones)
  const pmSchedules = allPmSchedules.filter((s: any) => s.assetId === id || !s.assetId);

  // Fetch service history for this asset
  const { data: historyData } = useGetAssetServiceHistoryQuery(id!, { skip: !id });
  const serviceHistory = historyData?.data || [];

  const today = new Date();
  const daysUntilWarranty = asset?.warrantyExpiry
    ? Math.ceil((new Date(asset.warrantyExpiry).getTime() - today.getTime()) / 86400000) : null;
  const daysUntilService = asset?.nextServiceDue
    ? Math.ceil((new Date(asset.nextServiceDue).getTime() - today.getTime()) / 86400000) : null;

  const [statusChanging, setStatusChanging] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAsset, { isLoading: deleting }] = useDeleteFacilityAssetMutation();

  const handleStatusChange = async (newStatus: string) => {
    setStatusChanging(true);
    try {
      await updateAsset({ id: id!, data: { status: newStatus } }).unwrap();
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    } catch { toast.error('Failed'); }
    setStatusChanging(false);
  };

  const handleDelete = async () => {
    try {
      await deleteAsset(id!).unwrap();
      toast.success('Asset deleted');
      navigate('/admin/facility/assets');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to delete');
    }
  };

  if (isLoading) return <div className="maint-page"><TableSkeleton columns={5} rows={5} /></div>;
  if (!asset) return <div className="maint-page"><div className="maint-empty"><p>Asset not found</p></div></div>;

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/facility/assets')}>
            <ArrowLeft size={16} />
          </button>
          <div className="page-icon-lg" style={{ fontSize: '20px' }}>
            {ASSET_TYPES[asset.assetType]?.icon || 'ðŸ”§'}
          </div>
          <div>
            <h1>{asset.name}</h1>
            <p>
              <span className="cell-mono" style={{ marginRight: '8px' }}>{asset.assetNumber}</span>
              {asset.property?.name} Â· {ASSET_TYPES[asset.assetType]?.label}
            </p>
          </div>
        </div>
        <PermissionGuard permission="facility-assets.write">
          <div className="header-actions">
            <select className="filter-select" value={asset.status} onChange={(e) => handleStatusChange(e.target.value)}
              disabled={statusChanging} style={{ minWidth: '180px' }}>
              <option value="operational">âœ… Operational</option>
              <option value="under_maintenance">ðŸ”§ Under Maintenance</option>
              <option value="fault">âš ï¸ Fault</option>
              <option value="decommissioned">ðŸš« Decommissioned</option>
            </select>
            <button className="btn btn-ghost btn-danger-ghost" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </PermissionGuard>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Asset Info */}
        <div className="sla-defaults-card">
          <h3><FileText size={16} /> Asset Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '12px', fontSize: '13px' }}>
            <InfoItem label="Status">
              <span className={`maint-status ${STATUS_MAP[asset.status]}`}>{asset.status?.replace('_', ' ')}</span>
            </InfoItem>
            <InfoItem label="Type">
              <span>{ASSET_TYPES[asset.assetType]?.icon} {ASSET_TYPES[asset.assetType]?.label}</span>
            </InfoItem>
            <InfoItem label="Make / Brand">{asset.make || 'â€”'}</InfoItem>
            <InfoItem label="Model">{asset.model || 'â€”'}</InfoItem>
            <InfoItem label="Serial Number">{asset.serialNumber || 'â€”'}</InfoItem>
            <InfoItem label="QR Code"><span className="cell-mono">{asset.qrCode || 'â€”'}</span></InfoItem>
            <InfoItem label="Location"><MapPin size={12} style={{ marginRight: '4px' }} />{asset.location || 'â€”'}</InfoItem>
            <InfoItem label="Floor">{asset.floor || 'â€”'}</InfoItem>
            <InfoItem label="Installation Date">
              {asset.installationDate ? new Date(asset.installationDate).toLocaleDateString() : 'â€”'}
            </InfoItem>
            <InfoItem label="Expected Lifespan">
              {asset.expectedLifespanYears ? `${asset.expectedLifespanYears} years` : 'â€”'}
            </InfoItem>
            <InfoItem label="Purchase Cost">
              {asset.purchaseCost ? `$${Number(asset.purchaseCost).toLocaleString()}` : 'â€”'}
            </InfoItem>
            <InfoItem label="Current Value">
              {asset.currentValue ? `$${Number(asset.currentValue).toLocaleString()}` : 'â€”'}
            </InfoItem>
          </div>
          {asset.notes && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>Notes:</strong> {asset.notes}
            </div>
          )}
        </div>

        {/* Warranty & Service */}
        <div className="sla-defaults-card">
          <h3><Shield size={16} /> Warranty & Service</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '12px', fontSize: '13px' }}>
            <InfoItem label="Warranty Expiry">
              {asset.warrantyExpiry ? (
                <div>
                  {new Date(asset.warrantyExpiry).toLocaleDateString()}
                  {daysUntilWarranty !== null && (
                    <span className={`sla-chip ${daysUntilWarranty < 0 ? 'breached' : daysUntilWarranty <= 30 ? 'at_risk' : 'on_track'}`}
                      style={{ marginLeft: '8px' }}>
                      {daysUntilWarranty < 0 ? 'Expired' : `${daysUntilWarranty}d left`}
                    </span>
                  )}
                </div>
              ) : 'â€”'}
            </InfoItem>
            <InfoItem label="Next Service Due">
              {asset.nextServiceDue ? (
                <div>
                  {new Date(asset.nextServiceDue).toLocaleDateString()}
                  {daysUntilService !== null && (
                    <span className={`sla-chip ${daysUntilService < 0 ? 'breached' : daysUntilService <= 7 ? 'at_risk' : 'on_track'}`}
                      style={{ marginLeft: '8px' }}>
                      {daysUntilService < 0 ? `${Math.abs(daysUntilService)}d overdue` : `${daysUntilService}d`}
                    </span>
                  )}
                </div>
              ) : 'â€”'}
            </InfoItem>
            <InfoItem label="Last Serviced">
              {asset.lastServicedAt ? new Date(asset.lastServicedAt).toLocaleDateString() : 'Never'}
            </InfoItem>
            <InfoItem label="Responsible Person">
              {asset.responsiblePerson?.profile
                ? `${asset.responsiblePerson.profile.firstName} ${asset.responsiblePerson.profile.lastName}` : 'â€”'}
            </InfoItem>
            <InfoItem label="Vendor">{asset.vendorName || 'â€”'}</InfoItem>
            <InfoItem label="Vendor Contact">{asset.vendorContact || 'â€”'}</InfoItem>
            <InfoItem label="Service Contract #">{asset.serviceContractNo || 'â€”'}</InfoItem>
            <InfoItem label="Contract Expiry">
              {asset.serviceContractExpiry ? new Date(asset.serviceContractExpiry).toLocaleDateString() : 'â€”'}
            </InfoItem>
          </div>
        </div>
      </div>

      {/* Linked PM Schedules */}
      <div className="maint-table-wrap">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
            <CalendarClock size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            PM Schedules ({pmSchedules.length})
          </h3>
        </div>
        <TableScrollWrapper>
          <table className="maint-table">
            <thead><tr><th>Schedule</th><th>Frequency</th><th>Next Due</th><th>Status</th><th>Priority</th></tr></thead>
            <tbody>
              {pmSchedules.length === 0 ? (
                <tr><td colSpan={5}><div className="maint-empty" style={{ padding: '24px 0' }}><p>No PM schedules linked</p></div></td></tr>
              ) : pmSchedules.map((s: any) => (
                <tr key={s.id} onClick={() => navigate(`/admin/maintenance/pm/${s.id}`)}>
                  <td>
                    <span className="cell-primary">{s.name}</span>
                    {s.asset && <span className="cell-secondary" style={{ display: 'block', fontSize: '11px' }}>{s.asset.assetNumber} â€” {s.asset.name}</span>}
                  </td>
                  <td><span className="maint-status open">{s.frequencyType}</span></td>
                  <td><span className="cell-secondary">{new Date(s.nextDueDate).toLocaleDateString()}</span></td>
                  <td><span className={`maint-status ${s.status === 'active' ? 'in_progress' : 'closed'}`}>{s.status}</span></td>
                  <td><span className={`maint-priority ${s.priority?.toLowerCase()}`}>{s.priority}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScrollWrapper>
      </div>

      {/* Service History */}
      <div className="maint-table-wrap" style={{ marginTop: '16px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
            <History size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            Service History ({serviceHistory.length})
          </h3>
        </div>
        <TableScrollWrapper>
          <table className="maint-table">
            <thead><tr><th>Schedule</th><th>Due Date</th><th>Completed</th><th>Technician</th><th>Status</th><th>Findings</th></tr></thead>
            <tbody>
              {serviceHistory.length === 0 ? (
                <tr><td colSpan={6}><div className="maint-empty" style={{ padding: '24px 0' }}><p>No service history yet</p></div></td></tr>
              ) : serviceHistory.map((h: any) => (
                <tr key={h.id}>
                  <td><span className="cell-primary">{h.scheduleName}</span></td>
                  <td><span className="cell-secondary">{new Date(h.dueDate).toLocaleDateString()}</span></td>
                  <td><span className="cell-secondary">{h.completedAt ? new Date(h.completedAt).toLocaleDateString() : 'â€”'}</span></td>
                  <td>{h.technician || 'â€”'}</td>
                  <td><span className={`maint-status ${h.status === 'completed' ? 'completed' : 'cancelled'}`}>{h.status}</span></td>
                  <td><span className="cell-secondary" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{h.findings || 'â€”'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScrollWrapper>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2><span className="modal-icon"><Trash2 size={18} /></span> Delete Asset</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm(false)}><XCircle size={20} /></button>
            </div>
            <div style={{ padding: '0 24px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete <strong>{asset.name}</strong> ({asset.assetNumber})? This will also remove all linked service history. This action cannot be undone.
            </div>
            <div className="maint-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={deleting}
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleDelete}
              >
                {deleting ? <Loader2 size={16} className="spin" /> : <><Trash2 size={16} /> Delete Asset</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="cell-secondary">{label}</span>
      <div style={{ marginTop: '4px', fontWeight: 500 }}>{children}</div>
    </div>
  );
}
