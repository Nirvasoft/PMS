import { useState } from 'react';
import toast from 'react-hot-toast';
import { useCreateRenewalMutation, type LeaseDetail } from '../../../../../../store/api/leasesApi';
import { Modal } from './SharedModal';

export function RenewalModal({ leaseId, lease, onClose }: { leaseId: string; lease: LeaseDetail; onClose: () => void }) {
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [rentAmount, setRent]     = useState('');
  const [createRenewal, { isLoading }] = useCreateRenewalMutation();

  const handleSubmit = async () => {
    if (!startDate || !endDate) { toast.error('Dates required'); return; }
    try {
      const r = await createRenewal({ id: leaseId, startDate, endDate, rentAmount: rentAmount ? Number(rentAmount) : undefined }).unwrap();
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
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary-sm" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Create Renewal'}</button>
      </div>
    </Modal>
  );
}
