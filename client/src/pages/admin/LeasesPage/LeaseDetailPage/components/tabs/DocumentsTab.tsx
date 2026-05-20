import { FileText, Download } from 'lucide-react';
import { type LeaseDetail } from '../../../../../../store/api/leasesApi';

export function DocumentsTab({ lease }: { lease: LeaseDetail }) {
  return (
    <div className="tab-panel">
      <div className="documents-list">
        {lease.leaseDocumentUrl ? (
          <div className="document-card">
            <div className="dc-icon"><FileText size={32} color="#3498db" /></div>
            <div className="dc-info">
              <div className="dc-title">Generated Lease Agreement</div>
              <div className="dc-meta">PDF Document</div>
            </div>
            <a href={`http://localhost:3000${lease.leaseDocumentUrl}`} target="_blank" rel="noreferrer" className="btn-download">
              <Download size={16} /> View
            </a>
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={36} />
            <p>No documents generated yet.</p>
            <span className="hint">The lease document will be generated automatically when sent for E-Signature.</span>
          </div>
        )}
      </div>
    </div>
  );
}
