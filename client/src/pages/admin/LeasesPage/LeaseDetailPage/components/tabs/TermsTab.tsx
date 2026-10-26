import React from 'react';
import { type LeaseDetail, type EscalationEntry } from '../../../../../../store/api/leasesApi';
import { formatCompactAmount } from '../../../../../../utils/formatCurrency';

export function TermsTab({ lease }: { lease: LeaseDetail }) {
  return (
    <div className="tab-panel">

      <InfoCard title="Escalation">
        {lease.escalationType ? (
          <>
            <InfoRow label="Type"      value={lease.escalationType.replace(/_/g,' ')} />
            <InfoRow label="Value"     value={lease.escalationType === 'fixed_percent' ? `${lease.escalationValue}%` : `${lease.currency} ${lease.escalationValue}`} />
            <InfoRow label="Frequency" value={lease.escalationFrequency || '—'} />
            {lease.escalationMonth && <InfoRow label="Month" value={String(lease.escalationMonth)} />}
          </>
        ) : <div className="empty-sm">No escalation configured</div>}
      </InfoCard>

      <div className="escalation-table-wrap">
        <div className="et-label">Charges</div>
        {(() => {
          const visibleCharges = lease.leaseCharges.filter((c) => {
            const code = (c.chargeType?.code || '').toUpperCase();
            const cat = (c.chargeType?.category || '').toLowerCase();
            const name = (c.chargeType?.name || '').toLowerCase();
            return code !== 'RENT' && cat !== 'rent' && !/^U\d{4}/i.test(code) && name !== 'rent' && name !== 'base rent' && !name.includes('unit fee');
          });
          return visibleCharges.length === 0 ? (
            <div className="empty-sm">No charges configured for this lease</div>
          ) : (
            <table className="escalation-table">
              <thead><tr><th>Charge</th><th>Category</th><th>Amount</th></tr></thead>
              <tbody>
                {visibleCharges.map((c) => (
                  <tr key={c.id}>
                    <td>{c.chargeType.name}</td>
                    <td>{c.chargeType.category}</td>
                    <td title={`${lease.currency} ${Number(c.amount).toLocaleString()}`}>
                      {lease.currency} {formatCompactAmount(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>

      {lease.escalationSchedule.length > 0 && (
        <div className="escalation-table-wrap">
          <div className="et-label">Escalation Schedule</div>
          <table className="escalation-table">
            <thead><tr><th>Effective Date</th><th>New Rent</th><th>Applied</th></tr></thead>
            <tbody>
              {lease.escalationSchedule.map((e: EscalationEntry) => (
                <tr key={e.id} className={e.applied ? 'applied' : ''}>
                  <td>{new Date(e.effectiveDate).toLocaleDateString()}</td>
                  <td title={`${lease.currency} ${Number(e.newRent).toLocaleString()}`}>
                    {lease.currency} {formatCompactAmount(e.newRent)}
                  </td>
                  <td>{e.applied ? <span className="applied-badge">✓ Applied</span> : <span className="pending-badge">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
