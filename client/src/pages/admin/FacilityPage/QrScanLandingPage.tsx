import { TableSkeleton } from '../../../components/common/SkeletonLoaders';
import '../MaintenancePage/MaintenancePage.css';
import { useParams, useNavigate } from 'react-router-dom';
import { useScanFacilityAssetQuery } from '../../../store/api/facilityApi';
import {
  QrCode, MapPin, Shield, Clock,
  CalendarClock, History, Wrench, AlertTriangle, ExternalLink,
} from 'lucide-react';

const ASSET_TYPES: Record<string, { label: string; icon: string }> = {
  hvac: { label: 'HVAC', icon: 'Ã¢Ââ€žÃ¯Â¸Â' }, elevator: { label: 'Elevator', icon: 'Ã°Å¸â€ºâ€”' },
  generator: { label: 'Generator', icon: 'Ã¢Å¡Â¡' }, fire_system: { label: 'Fire System', icon: 'Ã°Å¸Â§Â¯' },
  water_pump: { label: 'Water Pump', icon: 'Ã°Å¸â€™Â§' }, cctv: { label: 'CCTV', icon: 'Ã°Å¸â€œÂ¹' },
  access_control: { label: 'Access Control', icon: 'Ã°Å¸â€â€˜' }, lighting: { label: 'Lighting', icon: 'Ã°Å¸â€™Â¡' },
  other: { label: 'Other', icon: 'Ã°Å¸â€Â§' },
};

const STATUS_MAP: Record<string, { label: string; css: string }> = {
  operational: { label: 'Ã¢Å“â€¦ Operational', css: 'completed' },
  under_maintenance: { label: 'Ã°Å¸â€Â§ Under Maintenance', css: 'in_progress' },
  fault: { label: 'Ã¢Å¡Â Ã¯Â¸Â Fault', css: 'cancelled' },
  decommissioned: { label: 'Ã°Å¸Å¡Â« Decommissioned', css: 'closed' },
};

export default function QrScanLandingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: scanData, isLoading, error } = useScanFacilityAssetQuery(id!);

  if (isLoading) {
    return (
      <div className="maint-page" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <TableSkeleton columns={5} rows={5} />
      </div>
    );
  }

  if (error || !scanData?.data) {
    return (
      <div className="maint-page" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="maint-empty">
          <QrCode size={40} />
          <p>Asset not found</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            This QR code may be invalid or the asset has been removed.
          </p>
        </div>
      </div>
    );
  }

  const { asset, pmSchedules, recentHistory } = scanData.data;
  const typeInfo = ASSET_TYPES[asset.assetType] || { label: asset.assetType, icon: 'Ã°Å¸â€Â§' };
  const statusInfo = STATUS_MAP[asset.status] || { label: asset.status, css: 'open' };

  return (
    <div className="maint-page" style={{ maxWidth: '600px', margin: '0 auto' }}>
      {/* Header Card */}
      <div className="qr-landing-header">
        <div className="qr-scan-badge">
          <QrCode size={14} /> QR Scan
        </div>
        <div className="qr-asset-hero">
          <span className="qr-asset-icon">{typeInfo.icon}</span>
          <div>
            <h1 className="qr-asset-name">{asset.name}</h1>
            <p className="qr-asset-sub">
              <span className="cell-mono">{asset.assetNumber}</span>
              {' Ã‚Â· '}{typeInfo.label}
            </p>
          </div>
        </div>
        <div className="qr-status-row">
          <span className={`maint-status ${statusInfo.css}`}>{statusInfo.label}</span>
          <span className="cell-secondary">{asset.property?.name}</span>
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: '8px' }}
          onClick={() => navigate(`/admin/facility/assets/${asset.id}`)}>
          <ExternalLink size={14} /> View Full Details
        </button>
      </div>

      {/* Key Info */}
      <div className="qr-info-grid">
        {asset.location && (
          <div className="qr-info-item">
            <MapPin size={14} />
            <div>
              <span className="qr-info-label">Location</span>
              <span className="qr-info-value">{asset.location}{asset.floor ? `, Floor ${asset.floor}` : ''}</span>
            </div>
          </div>
        )}
        {asset.responsiblePerson?.profile && (
          <div className="qr-info-item">
            <Wrench size={14} />
            <div>
              <span className="qr-info-label">Responsible</span>
              <span className="qr-info-value">
                {asset.responsiblePerson.profile.firstName} {asset.responsiblePerson.profile.lastName}
              </span>
            </div>
          </div>
        )}
        {asset.warrantyExpiry && (
          <div className="qr-info-item">
            <Shield size={14} />
            <div>
              <span className="qr-info-label">Warranty</span>
              <span className="qr-info-value">
                {new Date(asset.warrantyExpiry).toLocaleDateString()}
                {asset.daysUntilWarrantyExpiry !== null && (
                  <span className={`sla-chip ${asset.daysUntilWarrantyExpiry < 0 ? 'breached' : asset.daysUntilWarrantyExpiry <= 30 ? 'at_risk' : 'on_track'}`}
                    style={{ marginLeft: '6px' }}>
                    {asset.daysUntilWarrantyExpiry < 0 ? 'Expired' : `${asset.daysUntilWarrantyExpiry}d left`}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
        {asset.nextServiceDue && (
          <div className="qr-info-item">
            <Clock size={14} />
            <div>
              <span className="qr-info-label">Next Service</span>
              <span className="qr-info-value">
                {new Date(asset.nextServiceDue).toLocaleDateString()}
                {asset.daysUntilService !== null && (
                  <span className={`sla-chip ${asset.daysUntilService < 0 ? 'breached' : asset.daysUntilService <= 7 ? 'at_risk' : 'on_track'}`}
                    style={{ marginLeft: '6px' }}>
                    {asset.daysUntilService < 0 ? `${Math.abs(asset.daysUntilService)}d overdue` : `${asset.daysUntilService}d`}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* PM Schedules */}
      {pmSchedules.length > 0 && (
        <div className="qr-section">
          <h3 className="qr-section-title">
            <CalendarClock size={14} /> Active PM Schedules ({pmSchedules.length})
          </h3>
          <div className="qr-section-list">
            {pmSchedules.map((s: any) => {
              const days = s.nextDueDate ? Math.ceil((new Date(s.nextDueDate).getTime() - Date.now()) / 86400000) : null;
              return (
                <div key={s.id} className="qr-list-item"
                  onClick={() => navigate(`/admin/maintenance/pm/${s.id}`)}>
                  <div className="qr-list-info">
                    <span className="qr-list-name">{s.name}</span>
                    <span className="qr-list-sub">
                      {s.frequencyType} Ã‚Â· {s.assignedTo?.profile
                        ? `${s.assignedTo.profile.firstName} ${s.assignedTo.profile.lastName}`
                        : 'Unassigned'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`maint-priority ${s.priority?.toLowerCase()}`}>{s.priority}</span>
                    {days !== null && (
                      <span className={`sla-chip ${days < 0 ? 'breached' : days <= 3 ? 'at_risk' : 'on_track'}`}>
                        {days < 0 ? `${Math.abs(days)}d late` : `${days}d`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Service History */}
      {recentHistory.length > 0 && (
        <div className="qr-section">
          <h3 className="qr-section-title">
            <History size={14} /> Recent Service ({recentHistory.length})
          </h3>
          <div className="qr-section-list">
            {recentHistory.map((h: any) => (
              <div key={h.id} className="qr-list-item">
                <div className="qr-list-info">
                  <span className="qr-list-name">{h.schedule?.name || 'PM Service'}</span>
                  <span className="qr-list-sub">
                    {h.completedAt ? new Date(h.completedAt).toLocaleDateString() : 'Ã¢â‚¬â€'}
                    {h.completedBy?.profile && ` by ${h.completedBy.profile.firstName}`}
                  </span>
                </div>
                {h.findings && (
                  <span className="cell-secondary" style={{
                    maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', fontSize: '11px',
                  }}>
                    {h.findings}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fault Warning */}
      {asset.status === 'fault' && (
        <div className="qr-fault-banner">
          <AlertTriangle size={16} />
          <span>This asset is currently in <strong>Fault</strong> state. Contact maintenance team immediately.</span>
        </div>
      )}
    </div>
  );
}
