import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTerminateLeaseMutation } from '../../../../../../store/api/leasesApi';
import { Modal } from './SharedModal';

export function TerminateModal({ leaseId, rentAmount, endDate, currency, onClose }: {
  leaseId: string; rentAmount: number; endDate: string; currency: string; onClose: () => void;
}) {
  const [terminationDate, setTermDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);
  const [terminate, { isLoading }] = useTerminateLeaseMutation();

  const isEarly   = terminationDate && terminationDate < endDate.split('T')[0];
  const remaining = terminationDate ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(terminationDate).getTime()) / (30.44 * 86400000))) : 0;
  const penalty   = isEarly ? Math.min(rentAmount * 3, rentAmount * remaining * 0.5) : 0;

  const submitTermination = async (terminateSchedules: boolean) => {
    try {
      const result = await terminate({ id: leaseId, terminationDate, reason, terminateSchedules }).unwrap();
      toast.success(`Lease terminated${result.data.earlyTerminationPenalty ? ` · Penalty: ${currency} ${result.data.earlyTerminationPenalty}` : ''}`);
      onClose();
    } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed'); }
  };

  const handleConfirmTerminate = () => {
    if (!terminationDate || !reason) { toast.error('All fields required'); return; }
    setShowScheduleConfirm(true);
  };

  if (showScheduleConfirm) {
    return (
      <Modal title="Terminate active Schedule?" onClose={onClose}>
        <div className="modal-body">
          <p>Do you terminate active Schedule?</p>
          <p className="penalty-calc">Note: If All schedule are terminate, Not Include monthly billing.</p>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost-sm" onClick={() => setShowScheduleConfirm(false)} disabled={isLoading}>Back</button>
          <button className="btn-ghost-sm" onClick={() => submitTermination(false)} disabled={isLoading}>No</button>
          <button className="btn-danger" onClick={() => submitTermination(true)} disabled={isLoading}>{isLoading ? '…' : 'Yes, Terminate'}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Are you sure to Terminate?" onClose={onClose}>
      <div className="modal-body">
        <div className="form-field">
          <label>Termination Date *</label>
          <input type="date" value={terminationDate} onChange={(e) => setTermDate(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Reason *</label>
          <textarea rows={3} placeholder="Reason for termination…" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {isEarly && penalty > 0 && (
          <div className="penalty-box">
            <AlertTriangle size={14}/> Early termination penalty: <strong>{currency} {penalty.toLocaleString()}</strong>
            <div className="penalty-calc">min(3 months rent, {remaining} remaining months × 50%)</div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={handleConfirmTerminate} disabled={isLoading}>{isLoading ? '…' : 'Confirm Terminate'}</button>
      </div>
    </Modal>
  );
}
