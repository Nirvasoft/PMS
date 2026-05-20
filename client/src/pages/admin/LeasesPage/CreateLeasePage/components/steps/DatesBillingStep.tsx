import type { FormState } from '../../types';

export function DatesBillingStep({ form, set }: { form: FormState; set: Function }) {
  return (
    <div className="step-content">
      <h3>Lease Dates & Billing</h3>
      <div className="form-grid-2">
        <div className="form-field">
          <label>Start Date *</label>
          <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>End Date *</label>
          <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Handover Date <span className="optional">(optional)</span></label>
          <input type="date" value={form.handoverDate} onChange={(e) => set('handoverDate', e.target.value)} />
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
      {form.startDate && form.endDate && form.endDate > form.startDate && (
        <div className="dates-summary">
          Lease term: <strong>{Math.max(1, (new Date(form.endDate).getFullYear() - new Date(form.startDate).getFullYear()) * 12 + new Date(form.endDate).getMonth() - new Date(form.startDate).getMonth())} months</strong>
        </div>
      )}
    </div>
  );
}
