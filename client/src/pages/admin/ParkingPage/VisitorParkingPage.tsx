import { useState } from 'react';
import {
  useGetVisitorPassesQuery, useIssueVisitorPassMutation, useCancelVisitorPassMutation,
  type VisitorPass,
} from '../../../store/api/parkingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useSelectedPropertyFilter } from '../../../hooks/useSelectedPropertyId';
import { QRCode, useQRDownload } from '../../../components/QRCode';
import { useConfirm } from '../../../components/DialogProvider';
import { Ticket, Plus, X, Clock, CheckCircle, AlertCircle, QrCode, Download, Printer, Maximize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './ParkingPage.css';

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock size={12} />,
  active:    <CheckCircle size={12} />,
  completed: <CheckCircle size={12} />,
  cancelled: <X size={12} />,
  expired:   <AlertCircle size={12} />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', active: '#10b981', completed: '#3b82f6',
  cancelled: '#ef4444', expired: '#6b7280',
};

export default function VisitorParkingPage() {
  const confirmDialog = useConfirm();
  const propertyFilter = useSelectedPropertyFilter();
  const [statusFilter, setStatusFilter] = useState('');
  const [showIssue, setShowIssue] = useState(false);
  const [qrPass, setQrPass] = useState<VisitorPass | null>(null);

  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data, isLoading } = useGetVisitorPassesQuery({
    propertyId: propertyFilter || undefined,
    status: statusFilter || undefined,
    limit: 50,
  });
  const [cancelPass] = useCancelVisitorPassMutation();

  const properties = propertiesData?.data || [];
  const passes = data?.data || [];

  const handleCancel = async (id: string) => {
    if (!(await confirmDialog('Cancel this visitor pass?', { danger: true, confirmText: 'Cancel Pass' }))) return;
    try {
      await cancelPass(id).unwrap();
      toast.success('Pass cancelled');
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const timeRemaining = (validTo: string) => {
    const diff = new Date(validTo).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="parking-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><Ticket size={22} /></div>
          <div>
            <h1>Visitor Parking Passes</h1>
            <p>{data?.meta ? `${data.meta.total} passes` : 'Loading…'}</p>
          </div>
        </div>
        <PermissionGuard permission="parking-visitors.write">
          <button className="btn-primary" onClick={() => setShowIssue(true)}>
            <Plus size={15} /> Issue Pass
          </button>
        </PermissionGuard>
      </div>

      <div className="pipeline-toolbar" style={{ marginBottom: 16 }}>
        {/* Follows the sidebar's "Active Property" selector — not independently choosable here. */}
        <select className="filter-select" value={propertyFilter} disabled>
          {propertyFilter && (
            <option value={propertyFilter}>{properties.find((p: any) => p.id === propertyFilter)?.name || ''}</option>
          )}
        </select>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="table-loading"><div className="lp" /><div className="lp" /></div>
      ) : passes.length === 0 ? (
        <div className="table-empty"><Ticket size={40} /><p>No visitor passes found</p></div>
      ) : (
        <div className="visitor-pass-grid">
          {passes.map((pass: VisitorPass) => (
            <div key={pass.id} className={`visitor-pass-card ${pass.status === 'cancelled' ? 'vpc-dimmed' : ''}`}>
              <div className="vpc-header">
                <span className="vpc-name">{pass.visitorName}</span>
                <span className="slot-status-badge" style={{ background: (STATUS_COLORS[pass.status] || '#666') + '18', color: STATUS_COLORS[pass.status] || '#666' }}>
                  {STATUS_ICON[pass.status]} {pass.status}
                </span>
              </div>
              <div className="vpc-details">
                <div className="vpc-detail-row"><span className="vpc-label">Vehicle</span><span className="vpc-value">{pass.visitorVehiclePlate || '—'}</span></div>
                <div className="vpc-detail-row"><span className="vpc-label">Slot</span><span className="vpc-value">{pass.slot?.slotNumber || 'Any'}</span></div>
                <div className="vpc-detail-row"><span className="vpc-label">Valid From</span><span className="vpc-value">{new Date(pass.validFrom).toLocaleString()}</span></div>
                <div className="vpc-detail-row"><span className="vpc-label">Valid To</span><span className="vpc-value">{new Date(pass.validTo).toLocaleString()}</span></div>
                {pass.actualEntryAt && <div className="vpc-detail-row"><span className="vpc-label">Entry</span><span className="vpc-value">{new Date(pass.actualEntryAt).toLocaleTimeString()}</span></div>}
                {pass.actualExitAt && <div className="vpc-detail-row"><span className="vpc-label">Exit</span><span className="vpc-value">{new Date(pass.actualExitAt).toLocaleTimeString()}</span></div>}
                {pass.status === 'active' && (
                  <div className="vpc-detail-row"><span className="vpc-label">Time Left</span><span className="vpc-value" style={{ color: '#f59e0b', fontWeight: 600 }}>{timeRemaining(pass.validTo)}</span></div>
                )}
              </div>

              {/* QR Code Section */}
              <div className="vpc-qr-section">
                <div className="vpc-qr-code" onClick={() => setQrPass(pass)} title="Click to enlarge">
                  <QRCode value={pass.qrToken} size={80} />
                </div>
                <div className="vpc-qr-info">
                  <div className="vpc-qr-token">{pass.qrToken}</div>
                  <button className="vpc-qr-expand" onClick={() => setQrPass(pass)}>
                    <Maximize2 size={12} /> View Full QR
                  </button>
                </div>
              </div>

              <div className="vpc-actions">
                <button className="btn-sm btn-ghost" onClick={() => setQrPass(pass)} title="Show QR Code">
                  <QrCode size={13} /> QR
                </button>
                {['pending', 'active'].includes(pass.status) && (
                  <PermissionGuard permission="parking-visitors.write">
                    <button className="btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleCancel(pass.id)}>
                      <X size={12} /> Cancel
                    </button>
                  </PermissionGuard>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showIssue && <IssuePassModal properties={properties} onClose={() => setShowIssue(false)} />}
      {qrPass && <QRCodeModal pass={qrPass} onClose={() => setQrPass(null)} />}
    </div>
  );
}

// ── QR Code Full View Modal ────────────────

function QRCodeModal({ pass, onClose }: { pass: VisitorPass; onClose: () => void }) {
  const downloadQR = useQRDownload();

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Visitor Pass — ${pass.visitorName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 40px 20px; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
            .qr-container { display: inline-block; padding: 16px; border: 2px solid #eee; border-radius: 12px; margin-bottom: 20px; }
            .token { font-family: monospace; font-size: 16px; letter-spacing: 2px; background: #f5f5f5; padding: 8px 16px; border-radius: 8px; margin-bottom: 20px; display: inline-block; }
            .details { text-align: left; max-width: 300px; margin: 0 auto; font-size: 13px; }
            .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
            .detail-label { color: #888; }
            .detail-value { font-weight: 600; }
            .footer { margin-top: 24px; font-size: 11px; color: #aaa; }
          </style>
        </head>
        <body>
          <h1>VISITOR PARKING PASS</h1>
          <div class="subtitle">${pass.property.name}</div>
          <div class="qr-container" id="qr-target"></div>
          <br/>
          <div class="token">${pass.qrToken}</div>
          <div class="details">
            <div class="detail-row"><span class="detail-label">Visitor</span><span class="detail-value">${pass.visitorName}</span></div>
            <div class="detail-row"><span class="detail-label">Vehicle</span><span class="detail-value">${pass.visitorVehiclePlate || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Slot</span><span class="detail-value">${pass.slot?.slotNumber || 'Any available'}</span></div>
            <div class="detail-row"><span class="detail-label">Valid From</span><span class="detail-value">${new Date(pass.validFrom).toLocaleString()}</span></div>
            <div class="detail-row"><span class="detail-label">Valid To</span><span class="detail-value">${new Date(pass.validTo).toLocaleString()}</span></div>
            <div class="detail-row"><span class="detail-label">Max Hours</span><span class="detail-value">${pass.maxHours}h</span></div>
          </div>
          <div class="footer">Scan QR code at parking gate for entry</div>
        </body>
      </html>
    `);

    // Draw QR on the print page's canvas
    const container = printWindow.document.getElementById('qr-target');
    if (container) {
      const canvas = printWindow.document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      canvas.style.imageRendering = 'pixelated';
      container.appendChild(canvas);

      // We need to redraw the QR in the print window context
      const img = new Image();
      const localCanvas = document.createElement('canvas');
      localCanvas.width = 200;
      localCanvas.height = 200;
      // Draw using our QR component approach
      const tempDiv = document.createElement('div');
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);

      // Copy the existing QR from modal
      const existingCanvas = document.querySelector('.qr-modal-code canvas') as HTMLCanvasElement;
      if (existingCanvas) {
        img.src = existingCanvas.toDataURL();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, 200, 200);
          }
          document.body.removeChild(tempDiv);
          setTimeout(() => { printWindow.print(); }, 200);
        };
      } else {
        document.body.removeChild(tempDiv);
        setTimeout(() => { printWindow.print(); }, 200);
      }
    }
  };

  const isActive = ['pending', 'active'].includes(pass.status);

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal qr-modal" onClick={e => e.stopPropagation()}>
        <div className="qr-modal-header">
          <div className="qr-modal-icon"><QrCode size={22} /></div>
          <h2>Visitor Pass QR Code</h2>
          <p className="qr-modal-subtitle">{pass.property.name}</p>
        </div>

        {/* Large QR Code */}
        <div className={`qr-modal-code ${!isActive ? 'qr-expired' : ''}`}>
          <QRCode value={pass.qrToken} size={200} />
          {!isActive && <div className="qr-expired-overlay">{pass.status.toUpperCase()}</div>}
        </div>

        {/* Token display */}
        <div className="qr-token-display">{pass.qrToken}</div>

        {/* Pass details */}
        <div className="qr-pass-details">
          <div className="qr-detail"><span>Visitor</span><strong>{pass.visitorName}</strong></div>
          <div className="qr-detail"><span>Vehicle</span><strong>{pass.visitorVehiclePlate || '—'}</strong></div>
          <div className="qr-detail"><span>Slot</span><strong>{pass.slot?.slotNumber || 'Any'}</strong></div>
          <div className="qr-detail"><span>Valid</span><strong>{new Date(pass.validFrom).toLocaleDateString()} → {new Date(pass.validTo).toLocaleDateString()}</strong></div>
          <div className="qr-detail"><span>Max Hours</span><strong>{pass.maxHours}h</strong></div>
          <div className="qr-detail">
            <span>Status</span>
            <strong style={{ color: STATUS_COLORS[pass.status] }}>{pass.status}</strong>
          </div>
        </div>

        {/* Action buttons */}
        <div className="qr-modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            <X size={14} /> Close
          </button>
          <button className="btn-secondary" onClick={() => downloadQR(pass.qrToken, `visitor-pass-${pass.visitorName.replace(/\s+/g, '-')}`)}>
            <Download size={14} /> Download
          </button>
          <button className="btn-primary" onClick={handlePrint}>
            <Printer size={14} /> Print Pass
          </button>
        </div>

        <div className="qr-modal-hint">Scan this QR code at the parking gate for entry</div>
      </div>
    </div>
  );
}

// ── Issue Pass Modal ───────────────────────

function IssuePassModal({ properties, onClose }: { properties: any[]; onClose: () => void }) {
  const [issuePass, { isLoading }] = useIssueVisitorPassMutation();
  const [form, setForm] = useState({
    propertyId: properties[0]?.id || '',
    visitorName: '', visitorVehiclePlate: '',
    validFrom: '', validTo: '', maxHours: '4',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    try {
      await issuePass({
        propertyId: form.propertyId,
        data: {
          visitorName: form.visitorName,
          visitorVehiclePlate: form.visitorVehiclePlate || undefined,
          validFrom: new Date(form.validFrom).toISOString(),
          validTo: new Date(form.validTo).toISOString(),
          maxHours: parseInt(form.maxHours) || 4,
        },
      }).unwrap();
      toast.success('Visitor pass issued');
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal" onClick={e => e.stopPropagation()}>
        <h2>Issue Visitor Pass</h2>
        <div className="form-group">
          <label>Property *</label>
          <select className="form-input" value={form.propertyId} onChange={e => set('propertyId', e.target.value)}>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Visitor Name *</label><input className="form-input" value={form.visitorName} onChange={e => set('visitorName', e.target.value)} placeholder="Jane Smith" /></div>
          <div className="form-group"><label>Vehicle Plate</label><input className="form-input" value={form.visitorVehiclePlate} onChange={e => set('visitorVehiclePlate', e.target.value)} placeholder="ABC-123" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.5fr', gap: 12 }}>
          <div className="form-group"><label>Valid From *</label><input className="form-input" type="datetime-local" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} /></div>
          <div className="form-group"><label>Valid To *</label><input className="form-input" type="datetime-local" value={form.validTo} onChange={e => set('validTo', e.target.value)} /></div>
          <div className="form-group"><label>Max Hours</label><input className="form-input" type="number" value={form.maxHours} onChange={e => set('maxHours', e.target.value)} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isLoading || !form.visitorName || !form.validFrom || !form.validTo} onClick={handleSubmit}>
            {isLoading ? 'Issuing…' : 'Issue Pass'}
          </button>
        </div>
      </div>
    </div>
  );
}
