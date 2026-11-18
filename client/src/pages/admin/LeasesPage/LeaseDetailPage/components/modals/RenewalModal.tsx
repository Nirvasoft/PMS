import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useCreateRenewalMutation, type LeaseDetail } from '../../../../../../store/api/leasesApi';
import { useGetMyPropertyScopeQuery } from '../../../../../../store/api/propertiesApi';
import { addDaysIso, calcEndDateFromStartAndCycle } from '../../../CreateLeasePage/types';
import { Modal } from './SharedModal';

export function RenewalModal({ leaseId, lease, onClose }: { leaseId: string; lease: LeaseDetail; onClose: () => void }) {
  const { data: scopeData } = useGetMyPropertyScopeQuery();
  const propertyBillingCycle = useMemo(() => {
    const propId = (lease as any).propertyId || lease.property?.id;
    const matched = propId ? (scopeData?.data || []).find((p) => p.id === propId) : undefined;
    return matched?.billingCycle || lease.billingCycle || 'monthly';
  }, [lease, scopeData?.data]);

  const defaultStartDate = lease.endDate ? addDaysIso(lease.endDate, 1) : '';
  const [billingCycle, setBillingCycle] = useState(propertyBillingCycle);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(
    defaultStartDate ? calcEndDateFromStartAndCycle(defaultStartDate, propertyBillingCycle) : '',
  );
  const [rentAmount, setRent] = useState(lease.rentAmount ? String(lease.rentAmount) : '');
  const [deposit, setDeposit] = useState(lease.securityDeposit ? String(lease.securityDeposit) : '');
  const [createRenewal, { isLoading }] = useCreateRenewalMutation();

  useEffect(() => {
    if (propertyBillingCycle) {
      setBillingCycle(propertyBillingCycle);
    }
  }, [propertyBillingCycle]);

  useEffect(() => {
    if (startDate) {
      setEndDate(calcEndDateFromStartAndCycle(startDate, billingCycle));
    }
  }, [startDate, billingCycle]);

  const handleSubmit = async () => {
    if (!startDate || !endDate) { toast.error('Dates required'); return; }
    try {
      const r = await createRenewal({
        id: leaseId,
        startDate,
        endDate,
        billingCycle,
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
        <div className="form-field">
          <label>Billing Cycle *</label>
          <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semi_annual">Semi-Annual</option>
            <option value="tri_quarterly">Tri-Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
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
