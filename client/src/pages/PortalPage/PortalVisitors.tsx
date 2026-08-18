import { useState } from 'react';
import {
  useGetPortalVisitorsQuery,
  usePreRegisterVisitorMutation,
  useCancelVisitorMutation,
} from '../../store/api/visitorsApi';
import { useGetPortalDashboardQuery } from '../../store/api/portalApi';
import toast from 'react-hot-toast';
import { useConfirm } from '../../components/DialogProvider';
import {
  UserPlus, QrCode, Clock, CheckCircle2, XCircle, AlertTriangle,
  Copy, X, Filter, ChevronLeft, ChevronRight, Car,
} from 'lucide-react';

const STATUS_CFG: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: 'var(--warning)', label: 'Pending' },
  approved: { icon: CheckCircle2, color: 'var(--success)', label: 'Approved' },
  checked_in: { icon: CheckCircle2, color: 'var(--primary)', label: 'Checked In' },
  checked_out: { icon: CheckCircle2, color: 'var(--text-muted)', label: 'Checked Out' },
  expired: { icon: AlertTriangle, color: 'var(--text-muted)', label: 'Expired' },
  cancelled: { icon: XCircle, color: 'var(--danger)', label: 'Cancelled' },
  denied: { icon: XCircle, color: 'var(--danger)', label: 'Denied' },
};

const FILTERS = ['all', 'pending', 'approved', 'checked_in', 'checked_out', 'cancelled'];

export default function PortalVisitors() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [qrModal, setQrModal] = useState<{ visitorName: string; qrToken: string } | null>(null);

  const { data: dashboard } = useGetPortalDashboardQuery();
  const { data: result, isLoading } = useGetPortalVisitorsQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: 15,
  });
  const [preRegister, { isLoading: isRegistering }] = usePreRegisterVisitorMutation();
  const [cancelVisitor] = useCancelVisitorMutation();
  const confirmDialog = useConfirm();

  // Form state
  const [form, setForm] = useState({
    visitorName: '', visitorMobile: '', visitorCompany: '',
    visitPurpose: '', validFrom: '', validTo: '',
    passType: 'single', vehiclePlate: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboard?.property?.id || !dashboard?.unit?.id) return;
    try {
      await preRegister({
        propertyId: dashboard.property.id,
        hostUnitId: dashboard.unit.id,
        ...form,
        validFrom: new Date(form.validFrom).toISOString(),
        validTo: new Date(form.validTo).toISOString(),
      }).unwrap();
      toast.success('Visitor registered — QR pass created');
      setShowForm(false);
      setForm({ visitorName: '', visitorMobile: '', visitorCompany: '',
        visitPurpose: '', validFrom: '', validTo: '', passType: 'single', vehiclePlate: '' });
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to register visitor');
    }
  };

  const handleCancel = async (id: string) => {
    if (!(await confirmDialog('Cancel this visitor pass?', { danger: true, confirmText: 'Cancel' }))) return;
    try {
      await cancelVisitor(id).unwrap();
      toast.success('Visitor pass cancelled');
    } catch {
      toast.error('Failed to cancel');
    }
  };

  const copyQrLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/visitor-pass/${token}`);
    toast.success('QR pass link copied!');
  };

  const visitors = result?.data || [];
  const meta = result?.meta;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="page-content portal-page">
      <div className="portal-page-header">
        <div>
          <h1>Visitors</h1>
          <p className="text-muted">Pre-register visitors and manage QR passes</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <UserPlus size={16} /> Register Visitor
        </button>
      </div>

      {/* Register Form */}
      {showForm && (
        <div className="portal-card portal-form-card">
          <h3>Pre-Register Visitor</h3>
          <form onSubmit={handleSubmit} className="portal-form-grid">
            <div className="form-group">
              <label>Visitor Name *</label>
              <input type="text" required value={form.visitorName}
                onChange={e => setForm(f => ({ ...f, visitorName: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Mobile</label>
              <input type="text" value={form.visitorMobile}
                onChange={e => setForm(f => ({ ...f, visitorMobile: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input type="text" value={form.visitorCompany}
                onChange={e => setForm(f => ({ ...f, visitorCompany: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Purpose</label>
              <input type="text" value={form.visitPurpose}
                onChange={e => setForm(f => ({ ...f, visitPurpose: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Valid From *</label>
              <input type="datetime-local" required value={form.validFrom}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Valid To *</label>
              <input type="datetime-local" required value={form.validTo}
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Pass Type</label>
              <select value={form.passType}
                onChange={e => setForm(f => ({ ...f, passType: e.target.value }))}>
                <option value="single">Single Visit</option>
                <option value="recurring">Recurring</option>
                <option value="multi_day">Multi-Day</option>
              </select>
            </div>
            <div className="form-group">
              <label>Vehicle Plate</label>
              <input type="text" value={form.vehiclePlate}
                onChange={e => setForm(f => ({ ...f, vehiclePlate: e.target.value }))} />
            </div>
            <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isRegistering}>
                {isRegistering ? 'Registering...' : 'Register & Create QR Pass'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs */}
      <div className="portal-filter-bar">
        <Filter size={16} />
        {FILTERS.map(f => (
          <button key={f} className={`portal-filter-chip${statusFilter === f ? ' active' : ''}`}
            onClick={() => { setStatusFilter(f); setPage(1); }}>
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Visitor list */}
      {isLoading ? (
        <div className="portal-loading">Loading visitors...</div>
      ) : visitors.length === 0 ? (
        <div className="portal-empty">
          <UserPlus size={48} strokeWidth={1} />
          <p>No visitors found</p>
        </div>
      ) : (
        <div className="portal-visitors-grid">
          {visitors.map((v: any) => {
            const cfg = STATUS_CFG[v.status] || STATUS_CFG.pending;
            const Icon = cfg.icon;
            return (
              <div key={v.id} className="portal-visitor-card">
                <div className="portal-visitor-card-header">
                  <div className="portal-visitor-name">{v.visitorName}</div>
                  <span className="portal-status-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
                    <Icon size={12} /> {cfg.label}
                  </span>
                </div>
                {v.visitorCompany && (
                  <div className="portal-visitor-company">{v.visitorCompany}</div>
                )}
                <div className="portal-visitor-meta">
                  <span><Clock size={13} /> {fmtDate(v.validFrom)} — {fmtDate(v.validTo)}</span>
                  {v.vehiclePlate && <span><Car size={13} /> {v.vehiclePlate}</span>}
                </div>
                {v.visitPurpose && <div className="portal-visitor-purpose">{v.visitPurpose}</div>}
                <div className="portal-visitor-actions">
                  {['approved', 'pending'].includes(v.status) && (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => setQrModal({ visitorName: v.visitorName, qrToken: v.qrToken })}>
                        <QrCode size={14} /> Show QR
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => copyQrLink(v.qrToken)}>
                        <Copy size={14} /> Copy Link
                      </button>
                      <button className="btn btn-sm btn-danger-outline" onClick={() => handleCancel(v.id)}>
                        <XCircle size={14} /> Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total > meta.limit && (
        <div className="portal-pagination">
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={16} /> Prev
          </button>
          <span>Page {meta.page} of {Math.ceil(meta.total / meta.limit)}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* QR Modal */}
      {qrModal && (
        <div className="modal-backdrop">
          <div className="modal-content portal-qr-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Visitor QR Pass</h3>
              <button className="btn-icon" onClick={() => setQrModal(null)}><X size={18} /></button>
            </div>
            <div className="portal-qr-body">
              <div className="portal-qr-placeholder">
                <QrCode size={120} strokeWidth={0.5} />
                <p className="text-muted" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                  {qrModal.qrToken}
                </p>
              </div>
              <p className="portal-qr-name">{qrModal.visitorName}</p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => copyQrLink(qrModal.qrToken)}>
                <Copy size={14} /> Copy Pass Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
