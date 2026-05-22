import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetPatrolLogsQuery, useGetPatrolCheckpointsQuery,
  useCreatePatrolCheckpointMutation,
} from '../../../store/api/securityApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { MapPin, Loader2, Plus, Clock, CheckCircle2, XCircle, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PatrolLogsPage() {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'logs' | 'checkpoints'>('logs');
  const [showModal, setShowModal] = useState(false);

  const { data: logsData, isLoading } = useGetPatrolLogsQuery({ page, limit: 50 });
  const { data: checkpointsData } = useGetPatrolCheckpointsQuery({});
  const { data: propsData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const [createCheckpoint] = useCreatePatrolCheckpointMutation();

  const logs = logsData?.data || [];
  const meta = logsData?.meta;
  const checkpoints = checkpointsData?.data || [];
  const properties = propsData?.data || [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createCheckpoint({
        propertyId: fd.get('propertyId'), name: fd.get('name'),
        location: fd.get('location') || undefined, floor: fd.get('floor') || undefined,
        sortOrder: parseInt(fd.get('sortOrder') as string) || 0,
      }).unwrap();
      toast.success('Checkpoint created'); setShowModal(false);
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="maint-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><MapPin size={20} /></div>
          <div><h1>Patrol Management</h1><p>{checkpoints.length} checkpoints · {meta?.total ?? 0} logs</p></div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Add Checkpoint
          </button>
        </div>
      </div>

      <div className="maint-filters" style={{ gap: '4px' }}>
        <button className={`filter-chip ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
          <Clock size={12} /> Patrol Logs
        </button>
        <button className={`filter-chip ${tab === 'checkpoints' ? 'active' : ''}`} onClick={() => setTab('checkpoints')}>
          <QrCode size={12} /> Checkpoints
        </button>
      </div>

      {/* Logs Tab */}
      {tab === 'logs' && (
        isLoading ? <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading...</div> :
        logs.length === 0 ? <div className="maint-empty"><MapPin size={32} /><p>No patrol logs yet</p></div> : (
          <>
            <div className="maint-table-wrap">
              <table className="maint-table">
                <thead>
                  <tr><th>Time</th><th>Checkpoint</th><th>Guard</th><th>Property</th><th>On Time</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => {
                    const guard = log.guard?.profile
                      ? `${log.guard.profile.firstName} ${log.guard.profile.lastName}`
                      : log.guard?.email || '—';
                    return (
                      <tr key={log.id}>
                        <td><span className="cell-mono">{new Date(log.scannedAt).toLocaleString()}</span></td>
                        <td>
                          <span className="cell-primary">{log.checkpoint?.name}</span>
                          {log.checkpoint?.floor && <span className="cell-secondary" style={{ display: 'block' }}>Floor {log.checkpoint.floor}</span>}
                        </td>
                        <td><span className="cell-secondary">{guard}</span></td>
                        <td><span className="cell-secondary">{log.property?.name}</span></td>
                        <td>
                          {log.isOnTime === true ? <span className="maint-status completed"><CheckCircle2 size={12} /> On Time</span>
                           : log.isOnTime === false ? <span className="maint-status cancelled"><XCircle size={12} /> Late</span>
                           : <span className="cell-secondary">—</span>}
                        </td>
                        <td><span className="cell-secondary">{log.notes || '—'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {meta && meta.totalPages > 1 && (
              <div className="maint-pagination">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page} of {meta.totalPages}</span>
                <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
          </>
        )
      )}

      {/* Checkpoints Tab */}
      {tab === 'checkpoints' && (
        checkpoints.length === 0 ? <div className="maint-empty"><QrCode size={32} /><p>No checkpoints</p></div> : (
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead><tr><th>#</th><th>Name</th><th>Location</th><th>Floor</th><th>Property</th><th>QR Code</th></tr></thead>
              <tbody>
                {checkpoints.map((cp: any, i: number) => (
                  <tr key={cp.id}>
                    <td><span className="cell-mono">{cp.sortOrder || i + 1}</span></td>
                    <td><span className="cell-primary">{cp.name}</span></td>
                    <td><span className="cell-secondary">{cp.location || '—'}</span></td>
                    <td><span className="cell-mono">{cp.floor || '—'}</span></td>
                    <td><span className="cell-secondary">{cp.property?.name}</span></td>
                    <td><span className="cell-mono" style={{ fontSize: '10px' }}>{cp.qrCode?.slice(0, 16)}...</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h2><QrCode size={18} /> New Checkpoint</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group"><label>Property *</label>
                <select name="propertyId" required><option value="">Select...</option>{properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="form-group"><label>Checkpoint Name *</label><input name="name" required placeholder="Main Gate" /></div>
              <div className="form-group"><label>Location</label><input name="location" placeholder="Ground floor, east wing" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Floor</label><input name="floor" placeholder="G" /></div>
                <div className="form-group"><label>Sort Order</label><input name="sortOrder" type="number" defaultValue="0" /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
