import { skipToken } from '@reduxjs/toolkit/query';
import { useGetUnitQuery } from '../../../../../../store/api/unitsApi';
import { useGetChargeTypesQuery } from '../../../../../../store/api/billingApi';
import { PREDEFINED_TYPE_LABELS, type FormState } from '../../types';

export function ReviewSubmitStep({ form }: { form: FormState }) {
  const TermMonths = form.startDate && form.endDate && form.endDate > form.startDate
    ? (new Date(form.endDate).getFullYear() - new Date(form.startDate).getFullYear()) * 12 + new Date(form.endDate).getMonth() - new Date(form.startDate).getMonth()
    : 0;

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
      <h3>Review & Confirm</h3>
      <div className="review-grid">
        <ReviewRow label="Property ID" value={form.propertyCode || form.propertyId} />
        <ReviewRow label="Unit ID"     value={form.unitCode     || form.unitId} />
        <ReviewRow label="Total Area"  value={unitArea != null ? `${unitArea.toLocaleString()} sqft` : '—'} />
        <ReviewRow label="Tenant ID"   value={form.tenantCode   || form.tenantId} />
        <ReviewRow label="Start Date"  value={form.startDate} />
        <ReviewRow label="End Date"    value={form.endDate} />
        <ReviewRow label="Predefined Type" value={PREDEFINED_TYPE_LABELS[form.predefinedType] || '—'} />
        <ReviewRow label="Term"        value={`${TermMonths} months`} />
        <ReviewRow label="Rent"        value={`${form.currency} ${Number(form.rentAmount || 0).toLocaleString()}`} />
        <ReviewRow label="Deposit"     value={form.securityDeposit ? `${form.currency} ${Number(form.securityDeposit).toLocaleString()}` : '—'} />
        <ReviewRow label="Billing"     value={`${form.billingCycle}, day ${form.billingDay}`} />
        <ReviewRow label="Escalation"  value={form.escalationType ? `${form.escalationType} · ${form.escalationValue} · ${form.escalationFrequency}` : 'None'} />
        <ReviewRow label="Clauses"     value={`${form.clauses.length} clause(s)`} />
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
          <ReviewRow label="Company"     value={ra.companyName       || '—'} />
          <ReviewRow label="Address"     value={ra.customerAddress   || '—'} />
          <ReviewRow label="Signed Name" value={ra.customerSignedName|| '—'} />
          <ReviewRow label="NRC"         value={ra.customerNirc      || '—'} />
          <ReviewRow label="Date"        value={ra.customerDate      || '—'} />
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
