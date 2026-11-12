import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetTerminationPreviewQuery,
  useTerminateLeaseMutation,
} from '../../../../../../store/api/leasesApi';
import { Modal } from './SharedModal';

export function TerminateModal({ leaseId, currency, onClose }: {
  leaseId: string; rentAmount?: number; endDate?: string; currency: string; onClose: () => void;
}) {
  const [terminationDate, setTermDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [waivePenalty, setWaivePenalty] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [penaltyAdjustReason, setPenaltyAdjustReason] = useState('');
  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);

  const { data: previewRes, isFetching: previewLoading } = useGetTerminationPreviewQuery(
    { id: leaseId, terminationDate },
    { skip: !terminationDate },
  );
  const [terminate, { isLoading }] = useTerminateLeaseMutation();

  const preview = previewRes?.data;
  const isEarly = Boolean(preview?.isEarly);
  const calculatedPenalty = preview?.penalty ?? 0;
  const canAdjust = Boolean(preview?.canAdjust);

  const trimmedOverride = overrideAmount.trim();
  const parsedOverride = trimmedOverride !== '' ? Number(trimmedOverride) : NaN;
  const hasOverride =
    isEarly && !waivePenalty && trimmedOverride !== '' && Number.isFinite(parsedOverride) && parsedOverride !== calculatedPenalty;
  const needsAdjustReason = isEarly && (waivePenalty || hasOverride);
  const effectivePenalty = !isEarly
    ? 0
    : waivePenalty
      ? 0
      : hasOverride
        ? parsedOverride
        : calculatedPenalty;

  const submitTermination = async (terminateSchedules: boolean) => {
    try {
      const result = await terminate({
        id: leaseId,
        terminationDate,
        reason: reason.trim(),
        terminateSchedules,
        ...(isEarly && waivePenalty
          ? { waivePenalty: true, penaltyAdjustReason: penaltyAdjustReason.trim() }
          : {}),
        ...(hasOverride
          ? { penaltyOverride: parsedOverride, penaltyAdjustReason: penaltyAdjustReason.trim() }
          : {}),
      }).unwrap();
      toast.success(
        `Lease terminated${result.data.earlyTerminationPenalty ? ` · Penalty: ${currency} ${result.data.earlyTerminationPenalty.toLocaleString()}` : ''}`,
      );
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.errors?.[0]?.message || e?.data?.message || 'Failed');
    }
  };

  const handleConfirmTerminate = () => {
    if (!terminationDate || !reason.trim()) {
      toast.error('Termination date and reason are required');
      return;
    }
    if (!waivePenalty && trimmedOverride !== '' && (!Number.isFinite(parsedOverride) || parsedOverride < 0)) {
      toast.error('Penalty amount must be 0 or greater');
      return;
    }
    if (needsAdjustReason && !penaltyAdjustReason.trim()) {
      toast.error('Reason is required when waiving or changing the penalty');
      return;
    }
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

        {isEarly && (
          <div className="penalty-box">
            <div className="penalty-box-head">
              <AlertTriangle size={14} />
              <span>
                Early termination penalty:{' '}
                <strong>
                  {previewLoading ? 'Calculating…' : `${currency} ${effectivePenalty.toLocaleString()}`}
                </strong>
                {(waivePenalty || hasOverride) && !previewLoading && (
                  <span className="penalty-orig-note">
                    {' '}(calculated: {currency} {calculatedPenalty.toLocaleString()})
                  </span>
                )}
              </span>
            </div>
            {preview?.breakdown && <div className="penalty-calc">{preview.breakdown}</div>}
          </div>
        )}

        {isEarly && canAdjust && (
          <div className="penalty-adjust-section">
            {calculatedPenalty > 0 && (
              <label className="penalty-waive-label">
                <input
                  type="checkbox"
                  checked={waivePenalty}
                  onChange={(e) => {
                    setWaivePenalty(e.target.checked);
                    if (e.target.checked) setOverrideAmount('');
                  }}
                />
                <span>Waive early termination penalty</span>
              </label>
            )}

            {!waivePenalty && (
              <div className="form-field">
                <label>Override Penalty Amount ({currency})</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={`Default: ${calculatedPenalty.toLocaleString()}`}
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                />
              </div>
            )}

            {needsAdjustReason && (
              <div className="form-field">
                <label>Penalty Adjustment Reason *</label>
                <input
                  type="text"
                  placeholder={waivePenalty ? 'Reason for waiving penalty…' : 'Reason for changing penalty amount…'}
                  value={penaltyAdjustReason}
                  onChange={(e) => setPenaltyAdjustReason(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={handleConfirmTerminate} disabled={isLoading || previewLoading}>
          {isLoading ? '…' : 'Confirm Terminate'}
        </button>
      </div>
    </Modal>
  );
}
