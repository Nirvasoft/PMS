import { type LeaseDetail, type EscalationEntry } from '../../../../../../store/api/leasesApi';

export function TermsTab({ lease }: { lease: LeaseDetail }) {
  return (
    <div className="tab-panel">
      <InfoCard title="Escalation">
        {lease.escalationType ? (
          <>
            <InfoRow label="Type"      value={lease.escalationType.replace(/_/g,' ')} />
            <InfoRow label="Value"     value={lease.escalationType === 'fixed_percent' ? `${lease.escalationValue}%` : `${lease.property.currency} ${lease.escalationValue}`} />
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
                  <td>{lease.property.currency} {Number(e.newRent).toLocaleString()}</td>
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
