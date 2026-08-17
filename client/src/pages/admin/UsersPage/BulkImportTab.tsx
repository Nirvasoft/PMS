/* ─── Bulk Import Tab ───────────────────────── */

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, UploadCloud, Download, FileText, Users, X } from 'lucide-react';
import { useImportUsersMutation, type BulkImportResult } from '../../../store/api/usersApi';

const MAX_SIZE = 5 * 1024 * 1024; // matches the server's csvUpload limit

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BulkImportTab({ onViewUsers }: { onViewUsers?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importUsers, { isLoading: importing }] = useImportUsersMutation();
  const [results, setResults] = useState<BulkImportResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Shared by the picker and the drop handler so both validate identically. */
  const acceptFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!/\.csv$/i.test(picked.name)) {
      toast.error(`${picked.name} is not a CSV file`);
      return;
    }
    if (picked.size > MAX_SIZE) {
      toast.error(`${formatSize(picked.size)} is over the 5 MB limit`);
      return;
    }
    setFile(picked);
    setResults(null);
  };

  const clearFile = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadTemplate = () => {
    const csv = 'email,firstname,lastname,role\njohn.doe@example.com,John,Doe,Manager\njane.smith@example.com,Jane,Smith,Staff';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file) { toast.error('Please select a CSV file'); return; }
    try {
      const res = await importUsers(file).unwrap();
      setResults(res.data);
      const summary = `Import done: ${res.data.created} created, ${res.data.skipped} skipped, ${res.data.errors} error${res.data.errors !== 1 ? 's' : ''}`;
      if (res.data.errors > 0) toast.error(summary);
      else toast.success(summary);
      clearFile();
    } catch (err: unknown) {
      const apiErr = err as { data?: { errors?: { message: string }[] }; error?: string };
      toast.error(apiErr.data?.errors?.[0]?.message || apiErr.error || 'Import failed');
    }
  };

  return (
    <div>
      <div className="info-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}><Upload size={18} /> Bulk Import Users</h3>
        <p className="text-muted">Upload a CSV file to create multiple users at once. Each user will be created with a temporary password and <code>mustChangePassword</code> set.</p>
        <p className="text-small text-muted">Required columns: <code>email</code>. Optional: <code>firstname</code>, <code>lastname</code>, <code>role</code>. If provided, <code>role</code> must exactly match an existing role name from Roles &amp; Permissions, or that row will be rejected.</p>

        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-sm" onClick={downloadTemplate}>
            <Download size={14} /> Download Template CSV
          </button>
        </div>

        {/* The native input stays in the DOM (it is what actually opens the
            file picker) but is visually replaced by the dropzone below. */}
        <input
          type="file" accept=".csv,text/csv" ref={fileRef} id="csv-upload"
          style={{ display: 'none' }}
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />

        {!file ? (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '28px 20px', cursor: 'pointer', textAlign: 'center',
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12,
              background: dragging ? 'var(--surface-hover)' : 'var(--surface)',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <UploadCloud size={30} style={{ color: 'var(--accent)' }} />
            <div style={{ fontWeight: 600 }}>
              {dragging ? 'Drop the file here' : 'Drag a CSV file here, or click to browse'}
            </div>
            <div className="text-small text-muted">CSV only · up to 5 MB</div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)',
            }}
          >
            <FileText size={26} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </div>
              <div className="text-small text-muted">{formatSize(file.size)}</div>
            </div>
            <button
              onClick={clearFile}
              disabled={importing}
              title="Remove file"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, padding: 0, flexShrink: 0,
                border: 'none', borderRadius: 8, background: 'transparent',
                color: 'var(--text-muted)', cursor: importing ? 'default' : 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing || !file}>
            {importing ? '⏳ Importing...' : <><Upload size={14} /> Import {file ? `${file.name.length > 24 ? 'file' : file.name}` : ''}</>}
          </button>
        </div>
      </div>

      {results && (
        <div>
          {results.created > 0 && onViewUsers && (
            <div className="info-card" style={{ padding: 14, marginBottom: 12, borderLeft: '4px solid var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>
                <strong>{results.created}</strong> user{results.created !== 1 ? 's' : ''} added. The list is already up to date.
              </span>
              <button className="btn btn-sm btn-primary" onClick={onViewUsers}>
                <Users size={14} /> View Users List
              </button>
            </div>
          )}
          {results.errors > 0 && (
            <div className="info-card" style={{ padding: 14, marginBottom: 12, borderLeft: '4px solid var(--danger)' }}>
              <div style={{ marginBottom: 6 }}>
                <strong>{results.errors}</strong> row{results.errors !== 1 ? 's' : ''} could not be imported:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {results.results.filter(r => r.status === 'error').map((r, i) => (
                  <li key={i} className="text-small">
                    {r.email || 'row'}: {r.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div className="info-card" style={{ flex: 1, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)' }}>{results.created}</div>
              <div className="text-small text-muted">Created</div>
            </div>
            <div className="info-card" style={{ flex: 1, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>{results.skipped}</div>
              <div className="text-small text-muted">Skipped</div>
            </div>
            <div className="info-card" style={{ flex: 1, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger)' }}>{results.errors}</div>
              <div className="text-small text-muted">Errors</div>
            </div>
          </div>
          <div className="audit-table-container">
            <table className="audit-table">
              <thead><tr><th>Email</th><th>Status</th><th>Note</th></tr></thead>
              <tbody>
                {results.results.map((r, i) => (
                  <tr key={i}>
                    <td><FileText size={14} style={{ marginRight: 6 }} />{r.email || '—'}</td>
                    <td>
                      <span className={`status-badge ${r.status === 'created' ? 'active' : r.status === 'skipped' ? 'pending' : 'inactive'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="text-small text-muted">{r.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
