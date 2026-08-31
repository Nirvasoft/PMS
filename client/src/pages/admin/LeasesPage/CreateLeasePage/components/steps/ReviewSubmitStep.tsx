import { skipToken } from '@reduxjs/toolkit/query';
import { useGetUnitQuery } from '../../../../../../store/api/unitsApi';
import { useGetChargeTypesQuery } from '../../../../../../store/api/billingApi';
import { PREDEFINED_TYPE_LABELS, type FormState } from '../../types';

/** Mirror of server-side calcLeaseTermMonths */
function calcTermMonths(startDate: string, endDate: string): number {
  if (!startDate || !endDate || endDate <= startDate) return 0;
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth()   - start.getMonth());
  return Math.max(1, months);
}

/** Format raw billingCycle values to human-readable */
function formatBillingCycle(cycle: string): string {
  return cycle.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function ReviewSubmitStep({ form }: { form: FormState }) {
  const termMonths = calcTermMonths(form.startDate, form.endDate);

  const { data: unitData } = useGetUnitQuery(
    form.propertyId && form.unitId ? { propertyId: form.propertyId, unitId: form.unitId } : skipToken,
  );
  const unitArea = unitData?.data?.areaSqft ?? null;
  const ra = form.rentalAgreement;

  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const chargeTypes = chargeTypesData?.data || [];
  const chargeTypeName = (id: string) => chargeTypes.find((t) => t.id === id)?.name || 'Unknown charge';

  return (
    <div className="step-content">
      <h3>Review &amp; Confirm</h3>
      <div className="review-grid">
        <ReviewRow label="Property"        value={form.propertyCode || form.propertyId} />
        <ReviewRow label="Unit"            value={form.unitCode     || form.unitId} />
        <ReviewRow label="Total Area"      value={unitArea != null ? `${unitArea.toLocaleString()} sqft` : '—'} />
        <ReviewRow label="Tenant"          value={form.tenantCode   || form.tenantId} />
        <ReviewRow label="Start Date"      value={form.startDate} />
        <ReviewRow label="End Date"        value={form.endDate} />
        <ReviewRow label="Handover Date"   value={form.handoverDate || '—'} />
        <ReviewRow label="Predefined Type" value={PREDEFINED_TYPE_LABELS[form.predefinedType] || '—'} />
        <ReviewRow label="Term"            value={termMonths ? `${termMonths} month${termMonths !== 1 ? 's' : ''}` : '—'} />
        <ReviewRow label="Rent"            value={`${form.currency} ${Number(form.rentAmount || 0).toLocaleString()}`} />
        <ReviewRow label="Deposit"         value={form.securityDeposit ? `${form.currency} ${Number(form.securityDeposit).toLocaleString()}` : '—'} />
        <ReviewRow label="Billing Cycle"   value={`${formatBillingCycle(form.billingCycle)}, day ${form.billingDay}`} />
        <ReviewRow label="Payment Due"     value={`${form.paymentDueDays} day${form.paymentDueDays !== 1 ? 's' : ''} after billing`} />
        <ReviewRow label="Escalation"      value={form.escalationType ? `${form.escalationType} · ${form.escalationValue} · ${form.escalationFrequency}` : 'None'} />
        <ReviewRow label="Clauses"         value={`${form.clauses.length} clause${form.clauses.length !== 1 ? 's' : ''}`} />
      </div>

      <div className="review-subhead">Lease Charges</div>
      {form.leaseCharges.length === 0 ? (
        <p className="unit-charges-empty">No charges added</p>
      ) : (
        <table className="charges-table">
          <thead>
            <tr><th>Charge</th><th className="text-right">Amount</th></tr>
          </thead>
          <tbody>
            {form.leaseCharges.map((c) => (
              <tr key={c.chargeTypeId}>
                <td>{chargeTypeName(c.chargeTypeId)}</td>
                <td className="text-right">{form.currency} {Number(c.amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="review-subhead">Rental Agreement</div>
      <div className="review-ra-cols">
        <div className="review-ra-col">
          <div className="review-ra-colhead">Renter</div>
          <ReviewRow label="Name"        value={ra.renterName        || '—'} />
          <ReviewRow label="Address"     value={ra.renterAddress     || '—'} />
          <ReviewRow label="Signed Name" value={ra.renterSignedName  || '—'} />
          <ReviewRow label="NRC"         value={ra.renterNirc        || '—'} />
          <ReviewRow label="Date"        value={ra.renterDate        || '—'} />
        </div>
        <div className="review-ra-divider" />
        <div className="review-ra-col">
          <div className="review-ra-colhead">Customer</div>
          <ReviewRow label="Company"     value={ra.companyName        || '—'} />
          <ReviewRow label="Address"     value={ra.customerAddress    || '—'} />
          <ReviewRow label="Signed Name" value={ra.customerSignedName || '—'} />
          <ReviewRow label="NRC"         value={ra.customerNirc       || '—'} />
          <ReviewRow label="Date"        value={ra.customerDate       || '—'} />
        </div>
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
