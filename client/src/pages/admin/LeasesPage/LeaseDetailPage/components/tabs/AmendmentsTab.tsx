import { Plus, PenLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApproveAmendmentMutation, type LeaseDetail, type LeaseAmendment } from '../../../../../../store/api/leasesApi';
import { PermissionGuard } from '../../../../../../components/guards/PermissionGuard';

export function AmendmentsTab({ leaseId, lease, onAddAmendment }: { leaseId: string; lease: LeaseDetail; onAddAmendment: () => void }) {
  const [approveAmendment] = useApproveAmendmentMutation();

  const handleApprove = async (amendmentId: string) => {
    try { await approveAmendment({ leaseId, amendmentId }).unwrap(); toast.success('Amendment approved'); }
    catch { toast.error('Approve failed'); }
  };

  return (
    <div className="tab-panel">
      {lease.status === 'active' && (
        <div className="tab-toolbar">
          <PermissionGuard permission="leases.update">
            <button className="btn-add-amendment" onClick={onAddAmendment}><Plus size={13}/> Add Amendment</button>
          </PermissionGuard>
        </div>
      )}
      {lease.amendments.length === 0 ? (
        <div className="empty-state"><PenLine size={36}/><p>No amendments yet</p></div>
      ) : (
        lease.amendments.map((a: LeaseAmendment) => (
          <div key={a.id} className={`amendment-card ${a.status}`}>
            <div className="ac-header">
              <div className="ac-num">Amendment #{a.amendmentNumber}</div>
              <span className={`amend-status ${a.status}`}>{a.status.replace(/_/g,' ')}</span>
            </div>
            <div className="ac-type">{a.amendmentType.replace(/_/g,' ')}</div>
            <div className="ac-desc">{a.description}</div>
            <div className="ac-meta">
              Effective: {new Date(a.effectiveDate).toLocaleDateString()}
              {a.newRentAmount && ` · New rent: ${Number(a.newRentAmount).toLocaleString()}`}
              {a.newEndDate    && ` · New end: ${new Date(a.newEndDate).toLocaleDateString()}`}
            </div>
            {a.status === 'pending_approval' && (
              <PermissionGuard permission="leases.approve">
                <button className="btn-approve-amendment" onClick={() => handleApprove(a.id)}>Approve Amendment</button>
              </PermissionGuard>
            )}
          </div>
        ))
      )}
    </div>
  );
}
