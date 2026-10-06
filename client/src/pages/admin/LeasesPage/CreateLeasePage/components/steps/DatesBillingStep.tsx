import type { RentalAgreement } from '../../../../../../store/api/leasesApi';
import { calcLeaseTermMonths, type FormState } from '../../types';

export function DatesBillingStep({ form, set }: { form: FormState; set: Function }) {
  const termMonths = form.startDate && form.endDate && form.endDate >= form.startDate
    ? calcLeaseTermMonths(form.startDate, form.endDate)
    : 0;

  const setRA = (key: keyof RentalAgreement, val: string) =>
    set('rentalAgreement', { ...form.rentalAgreement, [key]: val });

  return (
    <div className="step-content">
      <h3>Lease Dates & Billing</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Contract Start Date</label>
          <input type="date" value={form.rentalAgreement.contractStartDate || ''} onChange={(e) => setRA('contractStartDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Contract End Date</label>
          <input type="date" value={form.rentalAgreement.contractEndDate || ''} onChange={(e) => setRA('contractEndDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Advance Start Date *</label>
          <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Advance End Date *</label>
          <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Handover Date <span className="optional">(optional)</span></label>
          <input type="date" value={form.handoverDate} onChange={(e) => set('handoverDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Predefined Type</label>
          <select value={form.predefinedType} onChange={(e) => set('predefinedType', e.target.value)}>
            <option value="">-</option>
            <option value="prerenewal">Prerenewal</option>
            <option value="precontractend">Precontractend</option>
          </select>
        </div>
        <div className="form-field">
          <label>Billing Cycle *</label>
          <select value={form.billingCycle} onChange={(e) => set('billingCycle', e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semi_annual">Semi-Annual</option>
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
