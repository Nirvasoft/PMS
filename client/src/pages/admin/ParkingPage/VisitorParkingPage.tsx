import { useState } from 'react';
import {
  useGetVisitorPassesQuery, useIssueVisitorPassMutation, useCancelVisitorPassMutation,
  type VisitorPass,
} from '../../../store/api/parkingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { Ticket, Plus, X, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
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
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showIssue, setShowIssue] = useState(false);

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
    if (!confirm('Cancel this visitor pass?')) return;
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
        <button className="btn-primary" onClick={() => setShowIssue(true)}>
          <Plus size={15} /> Issue Pass
        </button>
      </div>

      <div className="pipeline-toolbar" style={{ marginBottom: 16 }}>
        <select className="filter-select" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <div key={pass.id} className="visitor-pass-card">
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
              <div className="vpc-qr">QR: {pass.qrToken}</div>
              <div className="vpc-actions">
                {['pending', 'active'].includes(pass.status) && (
                  <button className="btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleCancel(pass.id)}>
                    <X size={12} /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showIssue && <IssuePassModal properties={properties} onClose={() => setShowIssue(false)} />}
    </div>
  );
}

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
    <div className="crm-modal-overlay" onClick={onClose}>
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
