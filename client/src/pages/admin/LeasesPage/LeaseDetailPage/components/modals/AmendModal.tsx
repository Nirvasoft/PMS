import { useState } from 'react';
import toast from 'react-hot-toast';
import { useCreateAmendmentMutation } from '../../../../../../store/api/leasesApi';
import { Modal } from './SharedModal';

export function AmendModal({ leaseId, onClose }: { leaseId: string; onClose: () => void }) {
  const [form, setForm] = useState({ amendmentType: 'rent_revision', description: '', effectiveDate: '', newRentAmount: '', newEndDate: '' });
  const [create, { isLoading }] = useCreateAmendmentMutation();

  const handleSubmit = async () => {
    if (!form.description || !form.effectiveDate) { toast.error('Description and effective date required'); return; }
    try {
      await create({ leaseId, ...form, newRentAmount: form.newRentAmount ? Number(form.newRentAmount) : undefined, newEndDate: form.newEndDate || undefined }).unwrap();
      toast.success('Amendment created');
      onClose();
    } catch (e: any) { toast.error(e?.data?.errors?.[0]?.message || 'Failed'); }
  };

  return (
    <Modal title="Add Amendment" onClose={onClose}>
      <div className="modal-body">
        <div className="form-field">
          <label>Type</label>
          <select value={form.amendmentType} onChange={(e) => setForm({ ...form, amendmentType: e.target.value })}>
            <option value="rent_revision">Rent Revision</option>
            <option value="term_extension">Term Extension</option>
            <option value="unit_change">Unit Change</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="form-field"><label>Description *</label><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="form-field"><label>Effective Date *</label><input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
        {form.amendmentType === 'rent_revision' && <div className="form-field"><label>New Rent Amount</label><input type="number" value={form.newRentAmount} onChange={(e) => setForm({ ...form, newRentAmount: e.target.value })} /></div>}
        {form.amendmentType === 'term_extension' && <div className="form-field"><label>New End Date</label><input type="date" value={form.newEndDate} onChange={(e) => setForm({ ...form, newEndDate: e.target.value })} /></div>}
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary-sm" onClick={handleSubmit} disabled={isLoading}>{isLoading ? '…' : 'Create Amendment'}</button>
      </div>
    </Modal>
  );
}
