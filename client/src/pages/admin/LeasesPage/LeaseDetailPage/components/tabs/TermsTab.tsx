import React from 'react';
import { type LeaseDetail, type EscalationEntry } from '../../../../../../store/api/leasesApi';

const CATEGORY_COLORS: Record<string, string> = {
  rent: '#a5b4fc', utility: '#34d399', service: '#22d3ee',
  parking: '#fbbf24', penalty: '#f87171', deposit: '#a78bfa', misc: '#9ca3af',
};

export function TermsTab({ lease }: { lease: LeaseDetail }) {
  return (
    <div className="tab-panel">

      {lease.leaseCharges?.length > 0 && (
        <InfoCard title="Charges">
          <table className="ld-charges-table">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Category</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {lease.leaseCharges.map(lc => {
                const color = CATEGORY_COLORS[lc.chargeType.category] || '#9ca3af';
                return (
                  <tr key={lc.id}>
                    <td><span className="cell-mono">{lc.chargeType.code}</span></td>
                    <td>{lc.chargeType.name}</td>
                    <td>
                      <span className={`charge-type-badge ${lc.chargeType.category}`} style={{ color, background: color + '1a' }}>
                        {lc.chargeType.category}
                      </span>
                    </td>
                    <td className="text-right" style={{ fontWeight: 600 }}>
                      {lease.currency} {Number(lc.amount).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="charges-total-row">
                <td colSpan={3} style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Charges</td>
                <td className="text-right" style={{ fontWeight: 700 }}>
                  {lease.currency}{' '}
                  {lease.leaseCharges.reduce((sum, lc) => sum + Number(lc.amount), 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </InfoCard>
      )}

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

      {lease.escalationSchedule.length > 0 && (
        <div className="escalation-table-wrap">
          <div className="et-label">Escalation Schedule</div>
          <table className="escalation-table">
            <thead><tr><th>Effective Date</th><th>New Rent</th><th>Applied</th></tr></thead>
            <tbody>
              {lease.escalationSchedule.map((e: EscalationEntry) => (
                <tr key={e.id} className={e.applied ? 'applied' : ''}>
                  <td>{new Date(e.effectiveDate).toLocaleDateString()}</td>
                  <td>{lease.currency} {Number(e.newRent).toLocaleString()}</td>
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
