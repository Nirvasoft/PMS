import { useState, useRef, useCallback } from 'react';
import {
  useGetDocumentsQuery,
  useUploadDocumentMutation,
  useDeleteDocumentMutation,
  useUpdateDocumentMutation,
  useGetFoldersQuery,
  useCreateFolderMutation,
  useGetDocumentVersionsQuery,
  useUploadNewVersionMutation,
  useGetExpiringDocumentsQuery,
  useCreateShareLinkMutation,
} from '../../store/api/documentsApi';
import type { DocumentItem, FolderItem } from '../../store/api/documentsApi';
import {
  Upload, Search, Filter, FolderPlus, FileText, Image, FileSpreadsheet,
  File, Trash2, Download, Eye, Share2, Clock, ChevronRight, X, Plus, Tag,
  AlertTriangle, History, FolderOpen, MoreVertical, Edit3, Copy, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './DocumentsPage.css';

// ─── File type icon mapping ────────────────────
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image size={20} className="file-icon image" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet size={20} className="file-icon spreadsheet" />;
  if (mimeType === 'application/pdf') return <FileText size={20} className="file-icon pdf" />;
  return <File size={20} className="file-icon default" />;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ═══════════════════════════════════════════════════
// MAIN DOCUMENTS PAGE
// ═══════════════════════════════════════════════════
export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'expiring'>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [folderId, setFolderId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showVersions, setShowVersions] = useState<string | null>(null);

  const params: Record<string, string> = {
    page: String(page), limit: '20', sort: 'createdAt', order: 'desc',
  };
  if (search) params.search = search;
  if (category) params.category = category;
  if (folderId) params.folderId = folderId;

  const { data: docsData, isLoading } = useGetDocumentsQuery(params);
  const { data: foldersData } = useGetFoldersQuery({ tree: 'true' });
  const { data: expiringData } = useGetExpiringDocumentsQuery({ days: 30 }, { skip: activeTab !== 'expiring' });
  const [deleteDocument] = useDeleteDocumentMutation();

  const documents = activeTab === 'all' ? (docsData?.data || []) : (expiringData?.data || []);
  const meta = activeTab === 'all' ? docsData?.meta : expiringData?.meta;
  const folders = (foldersData?.data || []) as FolderItem[];

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await deleteDocument(id).unwrap();
      toast.success('Document deleted');
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="documents-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-left">
          <FolderOpen size={28} className="header-icon" />
          <div>
            <h1>Document Vault</h1>
            <p className="subtitle">Manage all your documents, contracts, and files</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowNewFolder(true)}>
            <FolderPlus size={16} /> New Folder
          </button>
          <button className="btn-primary" onClick={() => setShowUpload(true)}>
            <Upload size={16} /> Upload Document
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-bar">
        <button className={`tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
          <FileText size={16} /> All Documents
          {meta?.total != null && <span className="tab-count">{meta.total}</span>}
        </button>
        <button className={`tab ${activeTab === 'expiring' ? 'active' : ''}`} onClick={() => setActiveTab('expiring')}>
          <AlertTriangle size={16} /> Expiring Soon
        </button>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && <button className="clear-btn" onClick={() => setSearch('')}><X size={14} /></button>}
        </div>
        <div className="filter-group">
          <Filter size={16} />
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All Categories</option>
            <option value="contract">Contracts</option>
            <option value="kyc">KYC Documents</option>
            <option value="invoice">Invoices</option>
            <option value="photo">Photos</option>
            <option value="report">Reports</option>
          </select>
        </div>
      </div>

      {/* Main content */}
      <div className="documents-layout">
        {/* Folder sidebar */}
        <aside className="folder-sidebar">
          <div className="folder-header">
            <h3>Folders</h3>
          </div>
          <ul className="folder-tree">
            <li
              className={`folder-item ${!folderId ? 'active' : ''}`}
              onClick={() => { setFolderId(undefined); setPage(1); }}
            >
              <FolderOpen size={16} /> All Documents
            </li>
            {folders.map((f) => (
              <FolderTreeItem key={f.id} folder={f} activeId={folderId} onSelect={(id) => { setFolderId(id); setPage(1); }} depth={0} />
            ))}
          </ul>
        </aside>

        {/* Document list */}
        <div className="documents-main">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <h3>No documents found</h3>
              <p>Upload your first document to get started</p>
              <button className="btn-primary" onClick={() => setShowUpload(true)}>
                <Upload size={16} /> Upload Document
              </button>
            </div>
          ) : (
            <>
              <div className="documents-grid">
                {documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    isSelected={selectedDoc?.id === doc.id}
                    onSelect={() => setSelectedDoc(doc)}
                    onDelete={() => handleDelete(doc.id)}
                    onVersions={() => setShowVersions(doc.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="pagination">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                  <span className="page-info">Page {page} of {meta.totalPages}</span>
                  <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selectedDoc && (
          <DetailPanel doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
        )}
      </div>

      {/* Modals */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} folderId={folderId} />}
      {showNewFolder && <NewFolderModal onClose={() => setShowNewFolder(false)} />}
      {showVersions && <VersionsModal docId={showVersions} onClose={() => setShowVersions(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FOLDER TREE ITEM
// ═══════════════════════════════════════════════════
function FolderTreeItem({ folder, activeId, onSelect, depth }: {
  folder: FolderItem;
  activeId: string | undefined;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = (folder.children?.length || 0) > 0;

  return (
    <>
      <li
        className={`folder-item ${activeId === folder.id ? 'active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren && (
          <button className="folder-expand" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            <ChevronRight size={14} className={expanded ? 'rotated' : ''} />
          </button>
        )}
        <FolderOpen size={16} />
        <span className="folder-name">{folder.name}</span>
        {folder._count && (
          <span className="folder-count">{folder._count.documents}</span>
        )}
      </li>
      {expanded && folder.children?.map((child) => (
        <FolderTreeItem key={child.id} folder={child} activeId={activeId} onSelect={onSelect} depth={depth + 1} />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════
// DOCUMENT CARD
// ═══════════════════════════════════════════════════
function DocumentCard({ doc, isSelected, onSelect, onDelete, onVersions }: {
  doc: DocumentItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onVersions: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const uploaderName = doc.uploader?.profile
    ? `${doc.uploader.profile.firstName} ${doc.uploader.profile.lastName}`
    : doc.uploader?.email || 'Unknown';

  return (
    <div className={`document-card ${isSelected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="card-header">
        {getFileIcon(doc.mimeType)}
        <div className="card-info">
          <h4 className="doc-name" title={doc.name}>{doc.name}</h4>
          <span className="doc-meta">{doc.fileSizeFormatted} · v{doc.currentVersion}</span>
        </div>
        <div className="card-actions">
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}>
            <MoreVertical size={16} />
          </button>
          {showMenu && (
            <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
              <a href={`/api/v1/documents/${doc.id}/download`} className="menu-item" target="_blank" rel="noreferrer">
                <Download size={14} /> Download
              </a>
              <button className="menu-item" onClick={() => { onVersions(); setShowMenu(false); }}>
                <History size={14} /> Versions
              </button>
              <button className="menu-item danger" onClick={() => { onDelete(); setShowMenu(false); }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card-body">
        {doc.category && <span className="badge category">{doc.category}</span>}
        {doc.tags?.slice(0, 3).map((t) => <span key={t} className="badge tag">{t}</span>)}
      </div>

      <div className="card-footer">
        <span className="uploader">{uploaderName}</span>
        <span className="date">{formatDate(doc.createdAt)}</span>
      </div>

      {doc.expiryDate && (
        <div className={`expiry-badge ${(doc.daysUntilExpiry ?? 999) <= 7 ? 'urgent' : (doc.daysUntilExpiry ?? 999) <= 30 ? 'warning' : 'ok'}`}>
          <Clock size={12} />
          {doc.daysUntilExpiry != null && doc.daysUntilExpiry <= 0
            ? 'Expired'
            : `${doc.daysUntilExpiry ?? '?'}d left`}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// DETAIL PANEL
// ═══════════════════════════════════════════════════
function DetailPanel({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const [createShare] = useCreateShareLinkMutation();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      const result = await createShare({ id: doc.id, data: { shareType: 'view' } }).unwrap();
      setShareUrl(result.data.shareUrl);
      toast.success('Share link created');
    } catch { toast.error('Failed to create share link'); }
  };

  const copyUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <h3>Document Details</h3>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="detail-body">
        <div className="detail-icon-large">
          {getFileIcon(doc.mimeType)}
        </div>
        <h4 className="detail-name">{doc.name}</h4>

        <div className="detail-actions">
          <a href={`/api/v1/documents/${doc.id}/download`} className="btn-secondary" target="_blank" rel="noreferrer">
            <Download size={14} /> Download
          </a>
          <button className="btn-secondary" onClick={handleShare}>
            <Share2 size={14} /> Share
          </button>
        </div>

        {shareUrl && (
          <div className="share-url-box">
            <input type="text" value={shareUrl} readOnly />
            <button onClick={copyUrl}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}

        <div className="detail-meta">
          <div className="meta-row">
            <span className="label">Filename</span>
            <span className="value">{doc.originalFilename}</span>
          </div>
          <div className="meta-row">
            <span className="label">Type</span>
            <span className="value">{doc.mimeType}</span>
          </div>
          <div className="meta-row">
            <span className="label">Size</span>
            <span className="value">{doc.fileSizeFormatted}</span>
          </div>
          <div className="meta-row">
            <span className="label">Version</span>
            <span className="value">v{doc.currentVersion}</span>
          </div>
          <div className="meta-row">
            <span className="label">Category</span>
            <span className="value">{doc.category || '—'}</span>
          </div>
          {doc.description && (
            <div className="meta-row">
              <span className="label">Description</span>
              <span className="value">{doc.description}</span>
            </div>
          )}
          {doc.expiryDate && (
            <div className="meta-row">
              <span className="label">Expires</span>
              <span className="value">{formatDate(doc.expiryDate)}</span>
            </div>
          )}
          {doc.tags?.length > 0 && (
            <div className="meta-row">
              <span className="label">Tags</span>
              <div className="tag-list">
                {doc.tags.map((t) => <span key={t} className="badge tag">{t}</span>)}
              </div>
            </div>
          )}
          <div className="meta-row">
            <span className="label">Uploaded</span>
            <span className="value">{formatDate(doc.createdAt)}</span>
          </div>
          {doc.folder && (
            <div className="meta-row">
              <span className="label">Folder</span>
              <span className="value">{doc.folder.path}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════
// UPLOAD MODAL
// ═══════════════════════════════════════════════════
function UploadModal({ onClose, folderId }: { onClose: () => void; folderId?: string }) {
  const [uploadDoc, { isLoading }] = useUploadDocumentMutation();
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(dropped);
    if (dropped[0] && !name) setName(dropped[0].name.replace(/\.[^.]+$/, ''));
  }, [name]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    if (selected[0] && !name) setName(selected[0].name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) { toast.error('Please select a file'); return; }

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name || file.name);
      if (category) formData.append('category', category);
      if (description) formData.append('description', description);
      if (tags) formData.append('tags', JSON.stringify(tags.split(',').map((t) => t.trim()).filter(Boolean)));
      if (expiryDate) formData.append('expiryDate', expiryDate);
      if (folderId) formData.append('folderId', folderId);

      try {
        await uploadDoc(formData).unwrap();
        toast.success(`Uploaded: ${file.name}`);
      } catch {
        toast.error(`Failed to upload: ${file.name}`);
      }
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Upload size={20} /> Upload Document</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            className={`drop-zone ${dragActive ? 'active' : ''} ${files.length > 0 ? 'has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {files.length > 0 ? (
              <div className="selected-files">
                {files.map((f, i) => (
                  <div key={i} className="selected-file">
                    {getFileIcon(f.type)}
                    <span>{f.name}</span>
                    <span className="file-size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <Upload size={32} />
                <p>Drag & drop files here, or <strong>click to browse</strong></p>
                <span className="hint">PDF, DOCX, XLSX, PNG, JPG — Max 500 MB</span>
              </>
            )}
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Display Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto-filled from filename" />
            </div>

            <div className="form-group">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">None</option>
                <option value="contract">Contract</option>
                <option value="kyc">KYC Document</option>
                <option value="invoice">Invoice</option>
                <option value="photo">Photo</option>
                <option value="report">Report</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." rows={2} />
            </div>

            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. signed, 2025, residential" />
            </div>

            <div className="form-group">
              <label>Expiry Date</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading || files.length === 0}>
              {isLoading ? 'Uploading...' : `Upload ${files.length > 0 ? `(${files.length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// NEW FOLDER MODAL
// ═══════════════════════════════════════════════════
function NewFolderModal({ onClose }: { onClose: () => void }) {
  const [createFolder, { isLoading }] = useCreateFolderMutation();
  const [name, setName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createFolder({ name: name.trim() }).unwrap();
      toast.success('Folder created');
      onClose();
    } catch { toast.error('Failed to create folder'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><FolderPlus size={20} /> New Folder</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ padding: '0 24px' }}>
            <label>Folder Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contracts 2025" autoFocus />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading || !name.trim()}>Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// VERSIONS MODAL
// ═══════════════════════════════════════════════════
function VersionsModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { data } = useGetDocumentVersionsQuery(docId);
  const [uploadVersion, { isLoading }] = useUploadNewVersionMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [changeNotes, setChangeNotes] = useState('');
  const versions = data?.data || [];

  const handleUploadVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (changeNotes) formData.append('changeNotes', changeNotes);

    try {
      await uploadVersion({ id: docId, formData }).unwrap();
      toast.success('New version uploaded');
      setChangeNotes('');
    } catch { toast.error('Failed to upload new version'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal versions-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><History size={20} /> Version History</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="versions-list">
          {versions.map((v) => (
            <div key={v.versionNumber} className={`version-item ${v.isCurrent ? 'current' : ''}`}>
              <div className="version-number">
                v{v.versionNumber}
                {v.isCurrent && <span className="current-badge">Current</span>}
              </div>
              <div className="version-info">
                <span className="filename">{v.originalFilename}</span>
                <span className="meta">
                  {(v.fileSize / 1024 / 1024).toFixed(1)} MB · {formatDate(v.createdAt)}
                </span>
                {v.changeNotes && <p className="change-notes">{v.changeNotes}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="upload-version-section">
          <h4>Upload New Version</h4>
          <div className="form-group">
            <label>Change Notes</label>
            <input type="text" value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)} placeholder="What changed?" />
          </div>
          <input ref={fileRef} type="file" onChange={handleUploadVersion} style={{ display: 'none' }} />
          <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={isLoading}>
            <Plus size={14} /> {isLoading ? 'Uploading...' : 'Select File'}
          </button>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
