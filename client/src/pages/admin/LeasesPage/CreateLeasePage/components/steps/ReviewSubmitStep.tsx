import { skipToken } from '@reduxjs/toolkit/query';
import { useGetUnitQuery } from '../../../../../../store/api/unitsApi';
import { useGetChargeTypesQuery } from '../../../../../../store/api/billingApi';
import { PREDEFINED_TYPE_LABELS, calcLeaseTermMonths, calcPartialBreakdown, type FormState } from '../../types';

/** Format raw billingCycle values to human-readable */
function formatBillingCycle(cycle: string): string {
  return cycle.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function ReviewSubmitStep({ form }: { form: FormState }) {
  const termMonths = calcLeaseTermMonths(form.startDate, form.endDate);
  const breakdown = calcPartialBreakdown(
    form.startDate,
    form.endDate,
    form.billingCycle,
    form.rentAmount,
    form.partialPaymentPercent,
  );

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
        {form.rentalAgreement.contractStartDate && (
          <ReviewRow label="Contract Start Date" value={form.rentalAgreement.contractStartDate} />
        )}
        {form.rentalAgreement.contractEndDate && (
          <ReviewRow label="Contract End Date"   value={form.rentalAgreement.contractEndDate} />
        )}
        <ReviewRow label="Advance Start Date" value={form.startDate} />
        <ReviewRow label="Advance End Date"   value={form.endDate} />
        <ReviewRow label="Handover Date"   value={form.handoverDate || '—'} />
        <ReviewRow label="Predefined Type" value={PREDEFINED_TYPE_LABELS[form.predefinedType] || '—'} />
        <ReviewRow label="Term"            value={termMonths ? `${termMonths} month${termMonths !== 1 ? 's' : ''}` : '—'} />
        <ReviewRow label="Rent"            value={`${form.currency} ${Number(form.rentAmount || 0).toLocaleString()}`} />
        <ReviewRow label="Deposit"         value={form.securityDeposit ? `${form.currency} ${Number(form.securityDeposit).toLocaleString()}` : '—'} />
        <ReviewRow label="Payment Type"    value={form.paymentType === 'partially' ? 'Partially' : 'Fully'} />
        {form.paymentType === 'partially' && (
          <>
            <ReviewRow label="Partial Payment" value={`${form.currency} ${Number(form.partialPaymentPercent || 0).toLocaleString()}`} />
            <ReviewRow label="Remaining Rent"  value={`${form.currency} ${breakdown.remainingRent.toLocaleString()} (${form.currency} ${breakdown.scheduleAmount.toLocaleString()} / cycle)`} />
          </>
        )}
        <ReviewRow label="Billing Cycle"   value={`${formatBillingCycle(form.billingCycle)}, day ${form.billingDay}`} />
        <ReviewRow label="Payment Due"     value={`${form.paymentDueDays} day${form.paymentDueDays !== 1 ? 's' : ''} after billing`} />
        <ReviewRow label="Escalation"      value={form.escalationType ? `${form.escalationType} · ${form.escalationValue} · ${form.escalationFrequency}` : 'None'} />
        <ReviewRow label="Clauses"         value={`${form.clauses.length} clause${form.clauses.length !== 1 ? 's' : ''}`} />
      </div>

      {/* ── Scheduled billing & Direct invoice preview ── */}
      {(() => {
        const rent = Number(form.rentAmount || 0);
        const dep  = Number(form.securityDeposit || 0);
        if (!rent) return null;

        if (form.paymentType === 'partially') {
          return (
            <>
              <div className="review-subhead">Direct Invoices <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>(issued immediately on activation)</span></div>
              <table className="charges-table">
                <thead><tr><th>Invoice Item</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  <tr>
                    <td>Rent (Partial Payment)</td>
                    <td className="text-right">{form.currency} {breakdown.partialAmount.toLocaleString()}</td>
                  </tr>
                  {dep > 0 && (
                    <tr>
                      <td>Security Deposit</td>
                      <td className="text-right">{form.currency} {dep.toLocaleString()}</td>
                    </tr>
                  )}
                  {form.leaseCharges.map((c) => (
                    <tr key={c.chargeTypeId}>
                      <td>{chargeTypeName(c.chargeTypeId)}</td>
                      <td className="text-right">{form.currency} {Number(c.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="review-subhead">
                Billing Schedules{' '}
                <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>
                  {breakdown.remainingCycles > 0
                    ? `(recurring for remaining ${breakdown.remainingCycles} ${form.billingCycle.replace(/_/g, ' ')} cycle${breakdown.remainingCycles !== 1 ? 's' : ''})`
                    : '(single cycle lease — no remaining recurring rent cycles)'}
                </span>
              </div>
              <table className="charges-table">
                <thead><tr><th>Schedule</th><th className="text-right">Amount / Cycle</th></tr></thead>
                <tbody>
                  {breakdown.remainingCycles > 0 && (
                    <tr>
                      <td>Rent (Remaining Balance)</td>
                      <td className="text-right">{form.currency} {breakdown.scheduleAmount.toLocaleString()}</td>
                    </tr>
                  )}
                  {form.leaseCharges.map((c) => (
                    <tr key={c.chargeTypeId}>
                      <td>{chargeTypeName(c.chargeTypeId)}</td>
                      <td className="text-right">{form.currency} {Number(c.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                  {breakdown.remainingCycles === 0 && form.leaseCharges.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        None (No recurring schedules for single-cycle lease)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          );
        }

        const fullRentAmount = Math.round(rent * (termMonths || 1) * 100) / 100;
        return (
          <>
            <div className="review-subhead">Direct Invoices <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>(issued immediately on activation)</span></div>
            <table className="charges-table">
              <thead><tr><th>Invoice Item</th><th className="text-right">Qty</th><th className="text-right">Unit Price</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                <tr>
                  <td>Rent ({termMonths} {termMonths === 1 ? 'month' : 'months'})</td>
                  <td className="text-right">{termMonths}</td>
                  <td className="text-right">{form.currency} {rent.toLocaleString()}</td>
                  <td className="text-right">{form.currency} {fullRentAmount.toLocaleString()}</td>
                </tr>
                {dep > 0 && (
                  <tr>
                    <td>Security Deposit</td>
                    <td className="text-right">1</td>
                    <td className="text-right">{form.currency} {dep.toLocaleString()}</td>
                    <td className="text-right">{form.currency} {dep.toLocaleString()}</td>
                  </tr>
                )}
                {form.leaseCharges.map((c) => (
                  <tr key={c.chargeTypeId}>
                    <td>{chargeTypeName(c.chargeTypeId)}</td>
                    <td className="text-right">1</td>
                    <td className="text-right">{form.currency} {Number(c.amount).toLocaleString()}</td>
                    <td className="text-right">{form.currency} {Number(c.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {form.leaseCharges.length > 0 && (
              <>
                <div className="review-subhead">
                  Billing Schedules{' '}
                  <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>
                    (recurring charges from period 2 onward)
                  </span>
                </div>
                <table className="charges-table">
                  <thead><tr><th>Schedule</th><th className="text-right">Amount / Cycle</th></tr></thead>
                  <tbody>
                    {form.leaseCharges.map((c) => (
                      <tr key={c.chargeTypeId}>
                        <td>{chargeTypeName(c.chargeTypeId)}</td>
                        <td className="text-right">{form.currency} {Number(c.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        );
      })()}

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
          <ReviewRow label="Shop Name"   value={ra.shopName          || '—'} />
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
