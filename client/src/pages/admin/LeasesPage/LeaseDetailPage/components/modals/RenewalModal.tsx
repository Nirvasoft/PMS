import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useCreateRenewalMutation, type LeaseDetail } from '../../../../../../store/api/leasesApi';
import { Modal } from './SharedModal';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function RenewalModal({ leaseId, lease, onClose }: { leaseId: string; lease: LeaseDetail; onClose: () => void }) {
  const defaultStartDate = lease.endDate ? addDays(lease.endDate, 1) : '';
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate,   setEndDate]   = useState(defaultStartDate ? addDays(defaultStartDate, 1) : '');
  const [rentAmount, setRent]     = useState(lease.rentAmount ? String(lease.rentAmount) : '');
  const [deposit, setDeposit]     = useState(lease.securityDeposit ? String(lease.securityDeposit) : '');
  const [createRenewal, { isLoading }] = useCreateRenewalMutation();

  useEffect(() => {
    if (startDate) setEndDate(addDays(startDate, 1));
  }, [startDate]);

  const handleSubmit = async () => {
    if (!startDate || !endDate) { toast.error('Dates required'); return; }
    try {
      const r = await createRenewal({
        id: leaseId,
        startDate,
        endDate,
        rentAmount: rentAmount ? Number(rentAmount) : undefined,
        securityDeposit: deposit ? Number(deposit) : undefined,
      }).unwrap();
      toast.success(`Renewal lease ${r.data.leaseNumber} created (draft)`);
      onClose();
    } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed'); }
  };

  return (
    <Modal title="Create Renewal Offer" onClose={onClose}>
      <div className="modal-body">
        <div className="form-field"><label>New Start Date *</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="form-field"><label>New End Date *</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div className="form-field"><label>New Rent (optional, current: {lease.currency} {Number(lease.rentAmount).toLocaleString()})</label><input type="number" value={rentAmount} onChange={(e) => setRent(e.target.value)} /></div>
        <div className="form-field"><label>New Deposit (optional, current: {lease.currency} {Number(lease.securityDeposit).toLocaleString()})</label><input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></div>
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary-sm" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Create Renewal'}</button>
      </div>
    </Modal>
  );
}
