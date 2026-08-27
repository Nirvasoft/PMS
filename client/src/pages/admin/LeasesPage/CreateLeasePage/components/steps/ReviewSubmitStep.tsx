import type { FormState } from '../../types';

export function ReviewSubmitStep({ form }: { form: FormState }) {
  const TermMonths = form.startDate && form.endDate && form.endDate > form.startDate
    ? (new Date(form.endDate).getFullYear() - new Date(form.startDate).getFullYear()) * 12 + new Date(form.endDate).getMonth() - new Date(form.startDate).getMonth()
    : 0;

  return (
    <div className="step-content">
      <h3>Review & Confirm</h3>
      <div className="review-grid">
        <ReviewRow label="Property ID" value={form.propertyCode || form.propertyId} />
        <ReviewRow label="Unit ID"     value={form.unitCode     || form.unitId} />
        <ReviewRow label="Tenant ID"   value={form.tenantCode   || form.tenantId} />
        <ReviewRow label="Start Date"  value={form.startDate} />
        <ReviewRow label="End Date"    value={form.endDate} />
        <ReviewRow label="Term"        value={`${TermMonths} months`} />
        <ReviewRow label="Rent"        value={`${form.currency} ${Number(form.rentAmount || 0).toLocaleString()}`} />
        <ReviewRow label="Deposit"     value={form.securityDeposit ? `${form.currency} ${Number(form.securityDeposit).toLocaleString()}` : '—'} />
        <ReviewRow label="Billing"     value={`${form.billingCycle}, day ${form.billingDay}`} />
        <ReviewRow label="Escalation"  value={form.escalationType ? `${form.escalationType} · ${form.escalationValue} · ${form.escalationFrequency}` : 'None'} />
        <ReviewRow label="Clauses"     value={`${form.clauses.length} clause(s)`} />
      </div>

      <div className="review-note">
        <p>The lease will be created in <strong>Draft</strong> status. You can then submit it for approval.</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <span className="rr-label">{label}</span>
      <span className="rr-value">{value || '—'}</span>
    </div>
  );
}
