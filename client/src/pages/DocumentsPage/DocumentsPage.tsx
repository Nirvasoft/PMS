import { useState, useRef, useCallback, useEffect } from 'react';
import {
  useGetDocumentsQuery,
  useUploadDocumentMutation,
  useDeleteDocumentMutation,
  useUpdateDocumentMutation,
  useGetFoldersQuery,
  useCreateFolderMutation,
  useUpdateFolderMutation,
  useDeleteFolderMutation,
  useGetDocumentVersionsQuery,
  useUploadNewVersionMutation,
  useGetExpiringDocumentsQuery,
  useCreateShareLinkMutation,
  useGetDocumentPreviewQuery,
  useGetDocumentAccessLogsQuery,
} from '../../store/api/documentsApi';
import type { DocumentItem, FolderItem, AccessLogItem } from '../../store/api/documentsApi';
import {
  Upload, Search, Filter, FolderPlus, FileText, Image, FileSpreadsheet,
  File, Trash2, Download, Eye, Share2, Clock, ChevronRight, X, Plus, Tag,
  AlertTriangle, History, FolderOpen, MoreVertical, Edit3, Copy, Check,
  ZoomIn, ZoomOut, Maximize2, RotateCw, Save, Lock, Link, Shield, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../components/DialogProvider';
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
  const [editDoc, setEditDoc] = useState<DocumentItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [renameFolder, setRenameFolder] = useState<FolderItem | null>(null);
  const [deleteFolder] = useDeleteFolderMutation();
  const confirmDialog = useConfirm();

  const handleDeleteFolder = async (folder: FolderItem) => {
    const docCount = folder._count?.documents || 0;
    const childCount = folder._count?.children || 0;
    const warning = docCount > 0 || childCount > 0
      ? `This folder contains ${docCount} document(s) and ${childCount} subfolder(s). They will be moved to the parent folder.`
      : 'This folder is empty.';
    if (!(await confirmDialog(`Delete folder "${folder.name}"?\n\n${warning}`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteFolder(folder.id).unwrap();
      toast.success('Folder deleted');
      if (folderId === folder.id) setFolderId(undefined);
    } catch { toast.error('Failed to delete folder'); }
  };

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
    if (!(await confirmDialog('Are you sure you want to delete this document?', { danger: true, confirmText: 'Delete' }))) return;
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
              <FolderTreeItem
                key={f.id}
                folder={f}
                activeId={folderId}
                onSelect={(id) => { setFolderId(id); setPage(1); }}
                onRename={(folder) => setRenameFolder(folder)}
                onDelete={(folder) => handleDeleteFolder(folder)}
                depth={0}
              />
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
                    onEdit={() => setEditDoc(doc)}
                    onPreview={() => setPreviewDoc(doc)}
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
          <DetailPanel
            doc={selectedDoc}
            onClose={() => setSelectedDoc(null)}
            onEdit={() => setEditDoc(selectedDoc)}
            onPreview={() => setPreviewDoc(selectedDoc)}
          />
        )}
      </div>

      {/* Modals */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} folderId={folderId} />}
      {showNewFolder && <NewFolderModal onClose={() => setShowNewFolder(false)} />}
      {showVersions && <VersionsModal docId={showVersions} onClose={() => setShowVersions(null)} />}
      {editDoc && <EditDocumentModal doc={editDoc} onClose={() => setEditDoc(null)} onUpdated={(updated) => { if (selectedDoc?.id === updated.id) setSelectedDoc(updated); }} />}
      {previewDoc && <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      {renameFolder && <RenameFolderModal folder={renameFolder} onClose={() => setRenameFolder(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FOLDER TREE ITEM
// ═══════════════════════════════════════════════════
function FolderTreeItem({ folder, activeId, onSelect, onRename, onDelete, depth }: {
  folder: FolderItem;
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onRename: (folder: FolderItem) => void;
  onDelete: (folder: FolderItem) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showCtx, setShowCtx] = useState(false);
  const hasChildren = (folder.children?.length || 0) > 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowCtx(true);
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!showCtx) return;
    const close = () => setShowCtx(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showCtx]);

  return (
    <>
      <li
        className={`folder-item ${activeId === folder.id ? 'active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(folder.id)}
        onContextMenu={handleContextMenu}
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
        <button
          className="folder-menu-btn"
          onClick={(e) => { e.stopPropagation(); setShowCtx(!showCtx); }}
        >
          <MoreVertical size={14} />
        </button>

        {showCtx && (
          <div className="folder-context-menu" onClick={(e) => e.stopPropagation()}>
            <button className="menu-item" onClick={() => { onRename(folder); setShowCtx(false); }}>
              <Edit3 size={14} /> Rename
            </button>
            <div className="menu-divider" />
            <button className="menu-item danger" onClick={() => { onDelete(folder); setShowCtx(false); }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </li>
      {expanded && folder.children?.map((child) => (
        <FolderTreeItem
          key={child.id}
          folder={child}
          activeId={activeId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════
// DOCUMENT CARD
// ═══════════════════════════════════════════════════
function DocumentCard({ doc, isSelected, onSelect, onDelete, onVersions, onEdit, onPreview }: {
  doc: DocumentItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onVersions: () => void;
  onEdit: () => void;
  onPreview: () => void;
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
              <button className="menu-item" onClick={() => { onPreview(); setShowMenu(false); }}>
                <Eye size={14} /> Preview
              </button>
              <button className="menu-item" onClick={() => { onEdit(); setShowMenu(false); }}>
                <Edit3 size={14} /> Edit
              </button>
              <a href={`/api/v1/documents/${doc.id}/download`} className="menu-item" target="_blank" rel="noreferrer">
                <Download size={14} /> Download
              </a>
              <button className="menu-item" onClick={() => { onVersions(); setShowMenu(false); }}>
                <History size={14} /> Versions
              </button>
              <div className="menu-divider" />
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
function DetailPanel({ doc, onClose, onEdit, onPreview }: {
  doc: DocumentItem;
  onClose: () => void;
  onEdit: () => void;
  onPreview: () => void;
}) {
  const [showShareConfig, setShowShareConfig] = useState(false);

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <h3>Document Details</h3>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="detail-body">
        {/* Clickable preview thumbnail */}
        <div className="detail-preview-thumb" onClick={onPreview}>
          {doc.mimeType.startsWith('image/') ? (
            <img
              src={`/api/v1/documents/${doc.id}/download`}
              alt={doc.name}
              className="preview-thumb-img"
            />
          ) : (
            <div className="preview-thumb-placeholder">
              {getFileIcon(doc.mimeType)}
              <span>Click to preview</span>
            </div>
          )}
          <div className="preview-thumb-overlay">
            <Eye size={20} />
          </div>
        </div>

        <h4 className="detail-name">{doc.name}</h4>

        <div className="detail-actions">
          <button className="btn-secondary" onClick={onPreview}>
            <Eye size={14} /> Preview
          </button>
          <button className="btn-secondary" onClick={onEdit}>
            <Edit3 size={14} /> Edit
          </button>
        </div>

        <div className="detail-actions">
          <a href={`/api/v1/documents/${doc.id}/download`} className="btn-secondary" target="_blank" rel="noreferrer">
            <Download size={14} /> Download
          </a>
          <button className="btn-secondary" onClick={() => setShowShareConfig(!showShareConfig)}>
            <Share2 size={14} /> Share
          </button>
        </div>

        {/* Share Configuration Panel */}
        {showShareConfig && (
          <ShareConfigPanel docId={doc.id} onClose={() => setShowShareConfig(false)} />
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
            <span className="label">Status</span>
            <span className={`value status-badge status-${doc.status}`}>{doc.status}</span>
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
          {doc.isConfidential && (
            <div className="meta-row">
              <span className="label">Access</span>
              <span className="value confidential-flag">🔒 Confidential</span>
            </div>
          )}
        </div>

        {/* Access Log Section */}
        <AccessLogSection docId={doc.id} />
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
    <div className="modal-overlay">
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
    <div className="modal-overlay">
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
    <div className="modal-overlay">
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
              <a
                href={`/api/v1/documents/${docId}/versions/${v.versionNumber}/download`}
                className="version-download-btn"
                title={`Download v${v.versionNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={14} />
              </a>
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

// ═══════════════════════════════════════════════════
// EDIT DOCUMENT MODAL
// ═══════════════════════════════════════════════════
function EditDocumentModal({ doc, onClose, onUpdated }: {
  doc: DocumentItem;
  onClose: () => void;
  onUpdated: (doc: DocumentItem) => void;
}) {
  const [updateDocument, { isLoading }] = useUpdateDocumentMutation();
  const [name, setName] = useState(doc.name);
  const [description, setDescription] = useState(doc.description || '');
  const [category, setCategory] = useState(doc.category || '');
  const [tagsStr, setTagsStr] = useState((doc.tags || []).join(', '));
  const [expiryDate, setExpiryDate] = useState(doc.expiryDate ? doc.expiryDate.split('T')[0] : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
      const result = await updateDocument({
        id: doc.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          tags,
          expiryDate: expiryDate || null,
        },
      }).unwrap();
      toast.success('Document updated');
      onUpdated(result.data);
      onClose();
    } catch {
      toast.error('Failed to update document');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Edit3 size={20} /> Edit Document</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Read-only file info */}
          <div className="edit-file-info">
            {getFileIcon(doc.mimeType)}
            <div>
              <span className="edit-filename">{doc.originalFilename}</span>
              <span className="edit-filemeta">{doc.fileSizeFormatted} · v{doc.currentVersion}</span>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group full-width">
              <label>Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Document display name"
                required
              />
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

            <div className="form-group">
              <label>Expiry Date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="form-group full-width">
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>

            <div className="form-group full-width">
              <label>Tags (comma-separated)</label>
              <input
                type="text"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="e.g. signed, 2025, residential"
              />
              {tagsStr && (
                <div className="tag-preview">
                  {tagsStr.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="badge tag">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading || !name.trim()}>
              <Save size={14} /> {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// DOCUMENT PREVIEW MODAL
// ═══════════════════════════════════════════════════
function PreviewModal({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const { data: previewData, isLoading: previewLoading } = useGetDocumentPreviewQuery(doc.id);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const previewUrl = previewData?.data?.url || `/api/v1/documents/${doc.id}/download`;
  const mimeType = previewData?.data?.mimeType || doc.mimeType;

  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  const isText = mimeType.startsWith('text/');
  const canPreview = isPdf || isImage || isVideo || isText;

  // Close on Escape, keyboard shortcuts for zoom/rotate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 25, 300));
      if (e.key === '-') setZoom((z) => Math.max(z - 25, 25));
      if (e.key === 'r') setRotation((r) => (r + 90) % 360);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="preview-overlay">
      <div className="preview-container" onClick={(e) => e.stopPropagation()}>
        {/* Preview toolbar */}
        <div className="preview-toolbar">
          <div className="preview-title">
            {getFileIcon(mimeType)}
            <div className="preview-title-text">
              <span className="preview-name">{doc.name}</span>
              <span className="preview-meta">{doc.fileSizeFormatted} · {mimeType}</span>
            </div>
          </div>

          <div className="preview-controls">
            {isImage && (
              <>
                <button
                  className="preview-ctrl-btn"
                  onClick={() => setZoom((z) => Math.max(z - 25, 25))}
                  title="Zoom out (−)"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="zoom-label">{zoom}%</span>
                <button
                  className="preview-ctrl-btn"
                  onClick={() => setZoom((z) => Math.min(z + 25, 300))}
                  title="Zoom in (+)"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  className="preview-ctrl-btn"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  title="Rotate (R)"
                >
                  <RotateCw size={16} />
                </button>
                <div className="preview-separator" />
              </>
            )}
            <a
              href={`/api/v1/documents/${doc.id}/download`}
              className="preview-ctrl-btn"
              target="_blank"
              rel="noreferrer"
              title="Download"
            >
              <Download size={16} />
            </a>
            <a
              href={previewUrl}
              className="preview-ctrl-btn"
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
            >
              <Maximize2 size={16} />
            </a>
            <button className="preview-ctrl-btn close" onClick={onClose} title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="preview-content">
          {previewLoading ? (
            <div className="preview-loading">
              <div className="spinner" />
              <p>Loading preview...</p>
            </div>
          ) : !canPreview ? (
            <div className="preview-unsupported">
              <div className="unsupported-icon">{getFileIcon(mimeType)}</div>
              <h3>Preview not available</h3>
              <p>This file type ({mimeType}) cannot be previewed in the browser.</p>
              <a
                href={`/api/v1/documents/${doc.id}/download`}
                className="btn-primary"
                target="_blank"
                rel="noreferrer"
              >
                <Download size={14} /> Download to view
              </a>
            </div>
          ) : isPdf ? (
            <iframe
              src={`${previewUrl}#toolbar=1&navpanes=0`}
              className="preview-pdf"
              title={doc.name}
            />
          ) : isImage ? (
            <div className="preview-image-wrapper">
              <img
                src={previewUrl}
                alt={doc.name}
                className="preview-image"
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                }}
                draggable={false}
              />
            </div>
          ) : isVideo ? (
            <video
              src={previewUrl}
              className="preview-video"
              controls
              autoPlay={false}
            />
          ) : isText ? (
            <iframe
              src={previewUrl}
              className="preview-text"
              title={doc.name}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// RENAME FOLDER MODAL
// ═══════════════════════════════════════════════════
function RenameFolderModal({ folder, onClose }: {
  folder: FolderItem;
  onClose: () => void;
}) {
  const [updateFolder, { isLoading }] = useUpdateFolderMutation();
  const [name, setName] = useState(folder.name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === folder.name) { onClose(); return; }
    try {
      await updateFolder({ id: folder.id, data: { name: name.trim() } }).unwrap();
      toast.success('Folder renamed');
      onClose();
    } catch { toast.error('Failed to rename folder'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Edit3 size={20} /> Rename Folder</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ padding: '16px 24px' }}>
            <label>Folder Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              required
            />
            <div className="rename-path-hint">
              Current path: <code>{folder.path}</code>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading || !name.trim()}>
              <Save size={14} /> {isLoading ? 'Saving...' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SHARE CONFIGURATION PANEL
// ═══════════════════════════════════════════════════
function ShareConfigPanel({ docId, onClose }: {
  docId: string;
  onClose: () => void;
}) {
  const [createShare, { isLoading }] = useCreateShareLinkMutation();
  const [shareType, setShareType] = useState<'view' | 'download'>('view');
  const [expiresIn, setExpiresIn] = useState<string>('7d');
  const [maxAccesses, setMaxAccesses] = useState<string>('');
  const [password, setPassword] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getExpiryDate = (): string | undefined => {
    const now = new Date();
    switch (expiresIn) {
      case '1h': now.setHours(now.getHours() + 1); break;
      case '24h': now.setHours(now.getHours() + 24); break;
      case '7d': now.setDate(now.getDate() + 7); break;
      case '30d': now.setDate(now.getDate() + 30); break;
      case '90d': now.setDate(now.getDate() + 90); break;
      case 'never': return undefined;
      default: return undefined;
    }
    return now.toISOString();
  };

  const handleCreate = async () => {
    try {
      const data: Record<string, unknown> = { shareType };
      const expiresAt = getExpiryDate();
      if (expiresAt) data.expiresAt = expiresAt;
      if (maxAccesses) data.maxAccesses = parseInt(maxAccesses, 10);
      if (password) data.password = password;

      const result = await createShare({ id: docId, data }).unwrap();
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
    <div className="share-config-panel">
      <div className="share-config-header">
        <Link size={16} />
        <span>Share Settings</span>
        <button className="icon-btn" onClick={onClose}><X size={14} /></button>
      </div>

      {!shareUrl ? (
        <>
          <div className="share-config-body">
            {/* Share Type */}
            <div className="share-field">
              <label>Permission</label>
              <div className="share-type-toggle">
                <button
                  className={`toggle-btn ${shareType === 'view' ? 'active' : ''}`}
                  onClick={() => setShareType('view')}
                  type="button"
                >
                  <Eye size={13} /> View only
                </button>
                <button
                  className={`toggle-btn ${shareType === 'download' ? 'active' : ''}`}
                  onClick={() => setShareType('download')}
                  type="button"
                >
                  <Download size={13} /> Download
                </button>
              </div>
            </div>

            {/* Expiry */}
            <div className="share-field">
              <label>Link expires</label>
              <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="90d">90 days</option>
                <option value="never">Never</option>
              </select>
            </div>

            {/* Max Accesses */}
            <div className="share-field">
              <label>Max accesses <span className="field-hint">(optional)</span></label>
              <input
                type="number"
                min="1"
                max="1000"
                value={maxAccesses}
                onChange={(e) => setMaxAccesses(e.target.value)}
                placeholder="Unlimited"
              />
            </div>

            {/* Password */}
            <div className="share-field">
              <label><Lock size={12} /> Password protection <span className="field-hint">(optional)</span></label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="No password"
              />
            </div>
          </div>

          <div className="share-config-footer">
            <button className="btn-primary share-create-btn" onClick={handleCreate} disabled={isLoading}>
              <Link size={14} /> {isLoading ? 'Creating...' : 'Create Link'}
            </button>
          </div>
        </>
      ) : (
        <div className="share-result">
          <div className="share-result-icon">
            <Check size={24} />
          </div>
          <p className="share-result-text">Share link created!</p>

          <div className="share-url-box">
            <input type="text" value={shareUrl} readOnly />
            <button onClick={copyUrl} title="Copy link">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          <div className="share-result-meta">
            <span><Shield size={12} /> {shareType === 'view' ? 'View only' : 'Download allowed'}</span>
            {expiresIn !== 'never' && <span><Clock size={12} /> Expires in {expiresIn}</span>}
            {maxAccesses && <span><Eye size={12} /> Max {maxAccesses} access(es)</span>}
            {password && <span><Lock size={12} /> Password protected</span>}
          </div>

          <button
            className="btn-secondary share-new-btn"
            onClick={() => { setShareUrl(null); setCopied(false); }}
          >
            Create another link
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ACCESS LOG SECTION (Detail Panel)
// ═══════════════════════════════════════════════════
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

function getActionLabel(action: string) {
  switch (action) {
    case 'download': return { label: 'Downloaded', cls: 'action-download' };
    case 'preview': return { label: 'Previewed', cls: 'action-preview' };
    case 'share': return { label: 'Shared', cls: 'action-share' };
    case 'view': return { label: 'Viewed', cls: 'action-view' };
    default: return { label: action, cls: 'action-default' };
  }
}

function AccessLogSection({ docId }: { docId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetDocumentAccessLogsQuery(
    { id: docId, page, limit: 10 },
    { skip: !expanded },
  );

  const logs = data?.data || [];
  const meta = data?.meta;
  const hasMore = meta ? page < meta.totalPages : false;

  return (
    <div className="access-log-section">
      <button
        className="access-log-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <Activity size={14} />
        <span>Recent Activity</span>
        {meta && <span className="access-log-count">{meta.total}</span>}
        <ChevronRight size={14} className={`toggle-chevron ${expanded ? 'rotated' : ''}`} />
      </button>

      {expanded && (
        <div className="access-log-list">
          {isLoading ? (
            <div className="access-log-loading">
              <div className="spinner" style={{ width: 20, height: 20 }} />
            </div>
          ) : logs.length === 0 ? (
            <p className="access-log-empty">No activity recorded yet</p>
          ) : (
            <>
              {logs.map((log) => {
                const { label, cls } = getActionLabel(log.action);
                const userName = log.user?.profile
                  ? `${log.user.profile.firstName} ${log.user.profile.lastName}`
                  : log.user?.email || 'System';
                return (
                  <div key={log.id} className="access-log-item">
                    <span className={`action-badge ${cls}`}>{label}</span>
                    <span className="log-user" title={log.user?.email || ''}>{userName}</span>
                    <span className="log-time">{formatRelativeTime(log.createdAt)}</span>
                  </div>
                );
              })}
              {hasMore && (
                <button
                  className="load-more-btn"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
