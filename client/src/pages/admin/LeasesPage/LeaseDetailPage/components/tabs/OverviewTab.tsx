import { type LeaseDetail } from '../../../../../../store/api/leasesApi';

export function OverviewTab({ lease }: { lease: LeaseDetail }) {
  return (
    <div className="tab-panel">
      <div className="info-grid">
        <InfoCard title="Unit">
          <InfoRow label="Unit"       value={lease.unit.unitNumber} />
          <InfoRow label="Type"       value={lease.unit.unitType?.replace(/_/g,' ') || '—'} />
          <InfoRow label="Total Area" value={lease.unit.areaSqft != null ? `${lease.unit.areaSqft.toLocaleString()} sqft` : '—'} />
        </InfoCard>

        <InfoCard title="Dates">
          <InfoRow label="Start Date"    value={new Date(lease.startDate).toLocaleDateString()} />
          <InfoRow label="End Date"      value={new Date(lease.endDate).toLocaleDateString()} />
          {lease.handoverDate && <InfoRow label="Handover"   value={new Date(lease.handoverDate).toLocaleDateString()} />}
          <InfoRow label="Term"          value={`${lease.leaseTermMonths} months`} />
          {lease.activatedAt && <InfoRow label="Activated"   value={new Date(lease.activatedAt).toLocaleString()} />}
          {lease.approvedAt  && <InfoRow label="Approved"    value={new Date(lease.approvedAt).toLocaleString()} />}
        </InfoCard>

        <InfoCard title="Billing">
          <InfoRow label="Billing Cycle" value={lease.billingCycle.replace(/_/g,' ')} />
          <InfoRow label="Billing Day"   value={`Day ${lease.billingDay} of month`} />
          <InfoRow label="Payment Due"   value={`${lease.paymentDueDays} days after invoice`} />
        </InfoCard>

        <InfoCard title="Security Deposit">
          <InfoRow label="Amount"   value={`${lease.currency} ${Number(lease.securityDeposit).toLocaleString()}`} />
          <InfoRow label="Status"   value={lease.depositPaid ? '✓ Paid' : '✗ Unpaid'} />
          {lease.depositPaid && lease.depositPaidAt && (
            <InfoRow label="Paid On"  value={new Date(lease.depositPaidAt).toLocaleDateString()} />
          )}
          {lease.depositRefunded && (
            <>
              <InfoRow label="Refunded" value="✓ Yes" />
              {lease.depositRefundedAt && <InfoRow label="Refunded On" value={new Date(lease.depositRefundedAt).toLocaleDateString()} />}
            </>
          )}
        </InfoCard>

        {lease.parentLease && (
          <InfoCard title="Renewal Chain">
            <InfoRow label="Parent Lease" value={lease.parentLease.leaseNumber} />
            <InfoRow label="Status"       value={lease.parentLease.status} />
          </InfoCard>
        )}

        {lease.terminationDate && (
          <InfoCard title="Termination">
            <InfoRow label="Date"   value={new Date(lease.terminationDate).toLocaleDateString()} />
            <InfoRow label="Type"   value={lease.terminationType || '—'} />
            <InfoRow label="Reason" value={lease.terminationReason || '—'} />
            {lease.earlyTerminationPenalty && <InfoRow label="Penalty" value={`${Number(lease.earlyTerminationPenalty).toLocaleString()}`} />}
          </InfoCard>
        )}

        {lease.rentalAgreement && (
          <div className="info-card info-card-wide">
            <h4>Rental Agreement</h4>
            <div className="ra-cols">
              <div className="ra-col">
                <div className="ra-col-head">Renter</div>
                <InfoRow label="Name"        value={lease.rentalAgreement.renterName        || '—'} />
                <InfoRow label="Address"     value={lease.rentalAgreement.renterAddress     || '—'} />
                <InfoRow label="Signed Name" value={lease.rentalAgreement.renterSignedName  || '—'} />
                <InfoRow label="NRC"         value={lease.rentalAgreement.renterNirc        || '—'} />
                <InfoRow label="Date"        value={lease.rentalAgreement.renterDate        || '—'} />
              </div>
              <div className="ra-divider" />
              <div className="ra-col">
                <div className="ra-col-head">Customer</div>
                <InfoRow label="Company"     value={lease.rentalAgreement.companyName       || '—'} />
                <InfoRow label="Address"     value={lease.rentalAgreement.customerAddress   || '—'} />
                <InfoRow label="Signed Name" value={lease.rentalAgreement.customerSignedName|| '—'} />
                <InfoRow label="NRC"         value={lease.rentalAgreement.customerNirc      || '—'} />
                <InfoRow label="Date"        value={lease.rentalAgreement.customerDate      || '—'} />
              </div>
            </div>
          </div>
        )}
      </div>

      {lease.notes && (
        <div className="special-conditions">
          <div className="sc-label">Notes</div>
          <p>{lease.notes}</p>
        </div>
      )}

      {lease.specialConditions && (
        <div className="special-conditions">
          <div className="sc-label">Special Conditions</div>
          <p>{lease.specialConditions}</p>
        </div>
      )}

      {(lease.clauses as any[]).length > 0 && (
        <div className="clauses-list">
          <div className="sc-label">Clauses ({(lease.clauses as any[]).length})</div>
          {(lease.clauses as any[]).map((c: any, i: number) => (
            <div key={i} className="clause-card">
              <strong>{c.title}</strong>
              <p>{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="info-card"><h4>{title}</h4>{children}</div>;
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="info-row"><span className="ir-label">{label}</span><span className="ir-value">{value}</span></div>;
}
