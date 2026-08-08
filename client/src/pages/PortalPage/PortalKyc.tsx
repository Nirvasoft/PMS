import { useState } from 'react';
import { useGetPortalKycQuery, useSubmitPortalKycDocumentMutation } from '../../store/api/portalApi';
import {
  FileCheck, Upload, CheckCircle2, Clock, XCircle, AlertCircle,
  ShieldCheck, Loader2, FileText, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<string, { icon: JSX.Element; label: string; className: string }> = {
  pending: { icon: <Clock size={14} />, label: 'Pending', className: 'status-pending' },
  approved: { icon: <CheckCircle2 size={14} />, label: 'Approved', className: 'status-active' },
  rejected: { icon: <XCircle size={14} />, label: 'Rejected', className: 'status-cancelled' },
  in_review: { icon: <Clock size={14} />, label: 'In Review', className: 'status-pending' },
  verified: { icon: <ShieldCheck size={14} />, label: 'Verified', className: 'status-active' },
};

const KYC_STATUS_BANNER: Record<string, { bg: string; border: string; text: string; message: string }> = {
  pending: { bg: 'rgba(255,193,7,0.08)', border: 'rgba(255,193,7,0.3)', text: '#b8860b', message: 'Your KYC verification is pending. Please upload the required documents below.' },
  in_review: { bg: 'rgba(33,150,243,0.08)', border: 'rgba(33,150,243,0.3)', text: '#1976d2', message: 'Your documents are being reviewed by the property management team.' },
  verified: { bg: 'rgba(76,175,80,0.08)', border: 'rgba(76,175,80,0.3)', text: '#388e3c', message: 'Your identity has been verified. All documents are approved.' },
  rejected: { bg: 'rgba(244,67,54,0.08)', border: 'rgba(244,67,54,0.3)', text: '#d32f2f', message: 'Some documents were rejected. Please review the feedback and re-upload.' },
  expired: { bg: 'rgba(244,67,54,0.08)', border: 'rgba(244,67,54,0.3)', text: '#d32f2f', message: 'Your KYC has expired. Please re-upload your documents.' },
};

export default function PortalKyc() {
  const { data: kyc, isLoading, refetch } = useGetPortalKycQuery();
  const [submitDoc, { isLoading: submitting }] = useSubmitPortalKycDocumentMutation();

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [docIdInput, setDocIdInput] = useState('');

  const handleSubmit = async (requirementId: string) => {
    if (!docIdInput.trim()) {
      toast.error('Please enter the document ID');
      return;
    }
    try {
      await submitDoc({ requirementId, documentId: docIdInput.trim() }).unwrap();
      toast.success('Document submitted for review');
      setUploadingFor(null);
      setDocIdInput('');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to submit document');
    }
  };

  const banner = KYC_STATUS_BANNER[kyc?.status || 'pending'];

  return (
    <div className="page-content portal-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1><FileCheck size={24} /> KYC Verification</h1>
        <button className="btn btn-sm" onClick={() => refetch()} title="Refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading KYC status...</div>
      ) : !kyc ? (
        <div className="portal-card" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <FileCheck size={40} />
          <p>No KYC requirements found</p>
        </div>
      ) : (
        <>
          {/* Status Banner */}
          {banner && (
            <div
              className="portal-card"
              style={{
                background: banner.bg,
                border: `1px solid ${banner.border}`,
                marginBottom: 24,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
              id="kyc-status-banner"
            >
              {kyc.status === 'verified' ? <ShieldCheck size={24} style={{ color: banner.text }} /> :
               kyc.status === 'rejected' ? <XCircle size={24} style={{ color: banner.text }} /> :
               <AlertCircle size={24} style={{ color: banner.text }} />}
              <div>
                <div style={{ fontWeight: 600, color: banner.text, marginBottom: 2 }}>
                  KYC Status: {STATUS_CONFIG[kyc.status]?.label || kyc.status}
                </div>
                <div style={{ color: banner.text, opacity: 0.85, fontSize: '0.9rem' }}>
                  {banner.message}
                </div>
              </div>
            </div>
          )}

          {/* Verification dates */}
          {(kyc.verifiedAt || kyc.expiryDate) && (
            <div style={{ display: 'flex', gap: 24, marginBottom: 20, fontSize: '0.85rem' }} className="text-muted">
              {kyc.verifiedAt && (
                <span>✓ Verified on {new Date(kyc.verifiedAt).toLocaleDateString()}</span>
              )}
              {kyc.expiryDate && (
                <span>⏰ Expires {new Date(kyc.expiryDate).toLocaleDateString()}</span>
              )}
            </div>
          )}

          {/* Document Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} id="kyc-documents-list">
            {kyc.documents.map((doc) => {
              const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
              const isUploading = uploadingFor === doc.requirementId;
              const canUpload = doc.status === 'pending' || doc.status === 'rejected';

              return (
                <div
                  key={doc.id}
                  className="portal-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    padding: '16px 20px',
                    borderLeft: `4px solid ${
                      doc.status === 'approved' ? 'var(--success, #4caf50)' :
                      doc.status === 'rejected' ? 'var(--danger, #f44336)' :
                      'var(--warning, #ff9800)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={18} />
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {doc.name || doc.requirement?.name || doc.docType}
                          {doc.isRequired && <span style={{ color: 'var(--danger, red)', marginLeft: 4 }}>*</span>}
                        </div>
                        {doc.requirement?.description && (
                          <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: 2 }}>
                            {doc.requirement.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`status-badge ${statusCfg.className}`}>
                      {statusCfg.icon} {statusCfg.label}
                    </span>
                  </div>

                  {/* Rejection reason */}
                  {doc.status === 'rejected' && doc.rejectionReason && (
                    <div style={{
                      background: 'rgba(244,67,54,0.06)',
                      border: '1px solid rgba(244,67,54,0.2)',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: '0.85rem',
                      color: '#d32f2f',
                    }}>
                      <strong>Reason:</strong> {doc.rejectionReason}
                    </div>
                  )}

                  {/* Upload section */}
                  {canUpload && !isUploading && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => { setUploadingFor(doc.requirementId); setDocIdInput(''); }}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      <Upload size={12} /> {doc.status === 'rejected' ? 'Re-upload Document' : 'Upload Document'}
                    </button>
                  )}

                  {isUploading && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        value={docIdInput}
                        onChange={(e) => setDocIdInput(e.target.value)}
                        placeholder="Document ID (from document vault)"
                        style={{ flex: 1 }}
                        autoFocus
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSubmit(doc.requirementId)}
                        disabled={submitting}
                      >
                        {submitting ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}
                        {' '}Submit
                      </button>
                      <button className="btn btn-sm" onClick={() => setUploadingFor(null)}>Cancel</button>
                    </div>
                  )}

                  {/* Reviewed date */}
                  {doc.reviewedAt && (
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                      Reviewed on {new Date(doc.reviewedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {kyc.documents.length > 0 && (
            <div className="portal-card" style={{ marginTop: 20, padding: '12px 20px', display: 'flex', gap: 24, fontSize: '0.85rem' }}>
              <span><CheckCircle2 size={14} className="text-success" /> {kyc.documents.filter(d => d.status === 'approved').length} Approved</span>
              <span><Clock size={14} className="text-warning" /> {kyc.documents.filter(d => d.status === 'pending').length} Pending</span>
              <span><XCircle size={14} className="text-danger" /> {kyc.documents.filter(d => d.status === 'rejected').length} Rejected</span>
              <span className="text-muted">| {kyc.documents.length} Total</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
