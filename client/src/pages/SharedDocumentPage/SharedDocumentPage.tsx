import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, Download, Lock, AlertTriangle, Eye, File, Image,
  FileSpreadsheet, Clock, Shield, X,
} from 'lucide-react';
import './SharedDocumentPage.css';

interface SharedDocumentInfo {
  requiresPassword: boolean;
  documentName?: string;
  shareType?: string;
  document?: {
    id: string;
    name: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    fileSizeFormatted: string;
    extension: string | null;
    description: string | null;
    category: string | null;
    createdAt: string;
    previewUrl: string;
  };
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image size={24} className="file-icon image" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet size={24} className="file-icon spreadsheet" />;
  if (mimeType === 'application/pdf') return <FileText size={24} className="file-icon pdf" />;
  return <File size={24} className="file-icon default" />;
}

export default function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedDocumentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const resolveToken = async (pwd?: string) => {
    try {
      setLoading(true);
      setError(null);
      setPasswordError('');
      const res = await fetch(`/api/v1/shared/documents/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setPasswordError(json.message || 'Incorrect password');
          return;
        }
        setError({ code: json.code || 'ERROR', message: json.message || 'Something went wrong' });
        return;
      }
      setData(json.data);
    } catch {
      setError({ code: 'NETWORK_ERROR', message: 'Failed to load shared document' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) resolveToken();
  }, [token]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    resolveToken(password);
  };

  const doc = data?.document;
  const isPdf = doc?.mimeType === 'application/pdf';
  const isImage = doc?.mimeType.startsWith('image/');
  const isVideo = doc?.mimeType.startsWith('video/');

  return (
    <div className="shared-doc-page">
      {/* Background gradient */}
      <div className="shared-bg" />

      <div className="shared-container">
        {/* Branding */}
        <div className="shared-brand">
          <FileText size={28} />
          <span>Document Share</span>
        </div>

        {loading && (
          <div className="shared-loading">
            <div className="shared-spinner" />
            <p>Loading shared document...</p>
          </div>
        )}

        {error && (
          <div className="shared-error">
            <div className="error-icon">
              <AlertTriangle size={32} />
            </div>
            <h2>
              {error.code === 'SHARE_EXPIRED' ? 'Link Expired' :
               error.code === 'SHARE_MAX_REACHED' ? 'Access Limit Reached' :
               error.code === 'SHARE_NOT_FOUND' ? 'Link Not Found' :
               'Error'}
            </h2>
            <p>{error.message}</p>
            {error.code === 'SHARE_EXPIRED' && (
              <div className="error-hint">
                <Clock size={14} /> This share link is no longer valid. Contact the document owner for a new link.
              </div>
            )}
          </div>
        )}

        {/* Password gate */}
        {data?.requiresPassword && !doc && (
          <div className="shared-password-gate">
            <div className="password-icon">
              <Lock size={32} />
            </div>
            <h2>Password Protected</h2>
            <p>
              <strong>{data.documentName}</strong> requires a password to view.
            </p>
            <form onSubmit={handlePasswordSubmit} className="password-form">
              <div className="password-input-group">
                <Lock size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              {passwordError && <p className="password-error">{passwordError}</p>}
              <button type="submit" className="shared-btn-primary">
                <Eye size={16} /> Unlock Document
              </button>
            </form>
          </div>
        )}

        {/* Document viewer */}
        {doc && (
          <>
            <div className="shared-doc-card">
              <div className="doc-card-icon">
                {getFileIcon(doc.mimeType)}
              </div>
              <div className="doc-card-info">
                <h2>{doc.name}</h2>
                <div className="doc-card-meta">
                  <span>{doc.originalFilename}</span>
                  <span className="dot">·</span>
                  <span>{doc.fileSizeFormatted}</span>
                  {doc.category && (
                    <>
                      <span className="dot">·</span>
                      <span className="doc-category">{doc.category}</span>
                    </>
                  )}
                </div>
                {doc.description && (
                  <p className="doc-description">{doc.description}</p>
                )}
              </div>
              <div className="doc-card-actions">
                <button className="shared-btn-secondary" onClick={() => setShowPreview(!showPreview)}>
                  <Eye size={16} /> {showPreview ? 'Hide Preview' : 'Preview'}
                </button>
                {data.shareType === 'download' && (
                  <a
                    href={`/api/v1/shared/documents/${token}/download`}
                    className="shared-btn-primary"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} /> Download
                  </a>
                )}
              </div>
            </div>

            <div className="shared-permissions">
              <Shield size={14} />
              <span>
                {data.shareType === 'download' ? 'View & Download' : 'View Only'}
              </span>
            </div>

            {/* Preview area */}
            {showPreview && (
              <div className="shared-preview">
                <div className="preview-toolbar">
                  <span className="preview-title">{doc.originalFilename}</span>
                  <button className="shared-btn-icon" onClick={() => setShowPreview(false)}>
                    <X size={16} />
                  </button>
                </div>
                <div className="preview-content">
                  {isPdf ? (
                    <iframe
                      src={doc.previewUrl}
                      className="preview-pdf"
                      title={doc.name}
                    />
                  ) : isImage ? (
                    <img
                      src={doc.previewUrl}
                      alt={doc.name}
                      className="preview-image"
                    />
                  ) : isVideo ? (
                    <video
                      src={doc.previewUrl}
                      className="preview-video"
                      controls
                    />
                  ) : (
                    <div className="preview-unsupported">
                      {getFileIcon(doc.mimeType)}
                      <p>Preview not available for this file type</p>
                      {data.shareType === 'download' && (
                        <a
                          href={`/api/v1/shared/documents/${token}/download`}
                          className="shared-btn-primary"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={16} /> Download to view
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="shared-footer">
          <p>Shared securely via NirvaSoft PMS</p>
        </div>
      </div>
    </div>
  );
}
