import type { RentalAgreement } from '../../../../../../store/api/leasesApi';
import {
  addDaysIso,
  calcEndDateFromStartAndCycle,
  calcLeaseTermMonths,
  type FormState,
} from '../../types';

export function DatesBillingStep({
  form,
  set,
  previousLeaseEndDate,
}: {
  form: FormState;
  set: Function;
  previousLeaseEndDate?: string;
}) {
  const termMonths = form.startDate && form.endDate && form.endDate >= form.startDate
    ? calcLeaseTermMonths(form.startDate, form.endDate)
    : 0;

  // One-way sync: changing a Contract Start Date auto-fills Advance Start Date
  // and computes End Date = Start Date + Billing Cycle for both.
  const onContractStartChange = (val: string) => {
    const autoEnd = val ? calcEndDateFromStartAndCycle(val, form.billingCycle) : '';
    set('rentalAgreement', {
      ...form.rentalAgreement,
      contractStartDate: val,
      ...(autoEnd ? { contractEndDate: autoEnd } : {}),
    });
    set('startDate', val);
    if (autoEnd) {
      set('endDate', autoEnd);
    }
  };
  const onContractEndChange = (val: string) => {
    set('rentalAgreement', { ...form.rentalAgreement, contractEndDate: val });
    set('endDate', val);
  };
  const onAdvanceStartChange = (val: string) => {
    set('startDate', val);
    if (val) {
      const autoEnd = calcEndDateFromStartAndCycle(val, form.billingCycle);
      if (autoEnd) {
        set('endDate', autoEnd);
      }
    }
  };
  const onBillingCycleChange = (newCycle: string) => {
    set('billingCycle', newCycle);
    const nextAdvanceEnd = form.startDate
      ? calcEndDateFromStartAndCycle(form.startDate, newCycle)
      : '';
    const nextContractEnd = form.rentalAgreement.contractStartDate
      ? calcEndDateFromStartAndCycle(form.rentalAgreement.contractStartDate, newCycle)
      : nextAdvanceEnd;
    if (nextAdvanceEnd) {
      set('endDate', nextAdvanceEnd);
    }
    if (nextContractEnd) {
      set('rentalAgreement', {
        ...form.rentalAgreement,
        contractEndDate: nextContractEnd,
      });
    }
  };
  const onPredefinedTypeChange = (val: string) => {
    set('predefinedType', val);
    if (val === 'prerenewal' && previousLeaseEndDate) {
      const nextStart = addDaysIso(previousLeaseEndDate, 1);
      const nextEnd = nextStart ? calcEndDateFromStartAndCycle(nextStart, form.billingCycle) : '';
      if (nextStart) {
        set('startDate', nextStart);
        if (nextEnd) set('endDate', nextEnd);
        set('rentalAgreement', {
          ...form.rentalAgreement,
          contractStartDate: nextStart,
          ...(nextEnd ? { contractEndDate: nextEnd } : {}),
        });
      }
    }
  };

  return (
    <div className="step-content">
      <h3>Lease Dates & Billing</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Contract Start Date</label>
          <input type="date" value={form.rentalAgreement.contractStartDate || ''} onChange={(e) => onContractStartChange(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Contract End Date</label>
          <input type="date" value={form.rentalAgreement.contractEndDate || ''} onChange={(e) => onContractEndChange(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Advance Start Date *</label>
          <input type="date" value={form.startDate} onChange={(e) => onAdvanceStartChange(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Advance End Date *</label>
          <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Predefined Type</label>
          <select value={form.predefinedType} onChange={(e) => onPredefinedTypeChange(e.target.value)}>
            <option value="">-</option>
            <option value="prerenewal">Prerenewal</option>
            <option value="precontractend">Precontractend</option>
          </select>
        </div>
      </div>

      <div className="form-grid-3" style={{ marginTop: 12 }}>
        <div className="form-field">
          <label>Billing Cycle *</label>
          <select value={form.billingCycle} onChange={(e) => onBillingCycleChange(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semi_annual">Semi-Annual</option>
            <option value="tri_quarterly">Tri-Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div className="form-field">
          <label>Billing Day (1–28)</label>
          <input type="number" min={1} max={28} value={form.billingDay} onChange={(e) => set('billingDay', parseInt(e.target.value))} />
        </div>
        <div className="form-field">
          <label>Payment Due Days</label>
          <input type="number" min={1} max={30} value={form.paymentDueDays} onChange={(e) => set('paymentDueDays', parseInt(e.target.value))} />
        </div>
      </div>
      {termMonths > 0 && (
        <div className="dates-summary">
          Lease term: <strong>{termMonths} {termMonths === 1 ? 'month' : 'months'}</strong>
        </div>
      )}
    </div>
  );
}
