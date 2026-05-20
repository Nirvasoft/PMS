import { Send, FileText } from 'lucide-react';
import { useGetEsignStatusQuery, type LeaseDetail } from '../../../../../../store/api/leasesApi';

export function ESignTab({ leaseId, lease, onSend }: { leaseId: string; lease: LeaseDetail; onSend: () => void }) {
  const { data: esignData } = useGetEsignStatusQuery(leaseId);

  const ESIGN_COLOR: Record<string, string> = {
    not_started: '#95a5a6', sent: '#f39c12', partial: '#e67e22',
    completed: '#2ecc71', voided: '#e74c3c',
  };

  return (
    <div className="tab-panel">
      <div className="esign-overview">
        <div className="esign-status-lg" style={{ color: ESIGN_COLOR[lease.esignStatus] || '#95a5a6' }}>
          {lease.esignStatus.replace(/_/g,' ')}
        </div>
        {lease.esignStatus !== 'completed' && (
          <button className="btn-send-esign" onClick={onSend}><Send size={14}/> Send for Signing</button>
        )}
      </div>

      {(esignData?.data?.recipients || lease.esignRecipients).map((r: any) => (
        <div key={r.id} className="recipient-row">
          <div className="rr-left">
            <div className="rr-name">{r.name} <span className="rr-type">({r.recipientType})</span></div>
            <div className="rr-email">{r.email}</div>
          </div>
          <span className={`rr-status ${r.status}`}>{r.status}</span>
          {r.signedAt && <div className="rr-date">{new Date(r.signedAt).toLocaleString()}</div>}
        </div>
      ))}

      {lease.esignRecipients.length === 0 && lease.esignStatus === 'not_started' && (
        <div className="empty-state"><FileText size={36}/><p>No signing requests sent yet</p></div>
      )}
    </div>
  );
}
