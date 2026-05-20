import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSendForSigningMutation } from '../../../../../../store/api/leasesApi';
import { Modal } from './SharedModal';

export function EsignSendModal({ leaseId, tenantEmail, tenantName, onClose }: { leaseId: string; tenantEmail: string; tenantName: string; onClose: () => void }) {
  const [recipients, setRecipients] = useState([
    { recipientType: 'tenant',   name: tenantName,   email: tenantEmail },
    { recipientType: 'landlord', name: '', email: '' },
  ]);
  const [send, { isLoading }] = useSendForSigningMutation();

  const handleSend = async () => {
    const valid = recipients.filter((r) => r.name && r.email);
    if (valid.length < 1) { toast.error('At least one recipient required'); return; }
    try {
      await send({ id: leaseId, recipients: valid }).unwrap();
      toast.success('Signing requests sent');
      onClose();
    } catch (e: any) { toast.error(e?.data?.message || 'Failed'); }
  };

  return (
    <Modal title="Send for E-Signature" onClose={onClose}>
      <div className="modal-body">
        {recipients.map((r, i) => (
          <div key={i} className="recipient-form-row">
            <div className="rf-type">{r.recipientType}</div>
            <input placeholder="Name" value={r.name} onChange={(e) => setRecipients(rr => rr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input type="email" placeholder="Email" value={r.email} onChange={(e) => setRecipients(rr => rr.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn-ghost-sm" onClick={onClose}>Cancel</button>
        <button className="btn-primary-sm" onClick={handleSend} disabled={isLoading}>{isLoading ? '…' : 'Send'}</button>
      </div>
    </Modal>
  );
}
