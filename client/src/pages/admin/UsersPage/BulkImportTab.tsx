/* ─── Bulk Import Tab ───────────────────────── */

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, Download, FileText } from 'lucide-react';
import { useAppSelector } from '../../../store';

export function BulkImportTab() {
  const { accessToken } = useAppSelector(s => s.auth);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    created: number; skipped: number; errors: number;
    results: { email: string; status: string; error?: string }[];
  } | null>(null);

  const downloadTemplate = () => {
    const csv = 'email,firstname,lastname\njohn.doe@example.com,John,Doe\njane.smith@example.com,Jane,Smith';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Please select a CSV file'); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('csv', file);
      const res = await fetch('/api/v1/users/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
        toast.success(`Import done: ${data.data.created} created, ${data.data.skipped} skipped`);
      } else {
        toast.error(data.errors?.[0]?.message || 'Import failed');
      }
    } catch { toast.error('Network error'); }
    finally { setImporting(false); }
  };

  return (
    <div>
      <div className="info-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}><Upload size={18} /> Bulk Import Users</h3>
        <p className="text-muted">Upload a CSV file to create multiple users at once. Each user will be created with a temporary password and <code>mustChangePassword</code> set.</p>
        <p className="text-small text-muted">Required columns: <code>email</code>. Optional: <code>firstname</code>, <code>lastname</code></p>

        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-sm" onClick={downloadTemplate}>
            <Download size={14} /> Download Template CSV
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="file" accept=".csv,text/csv" ref={fileRef} id="csv-upload"
            style={{ flex: 1, padding: '8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-primary)' }} />
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? '⏳ Importing...' : <><Upload size={14} /> Import</>}
          </button>
        </div>
      </div>

      {results && (
        <div>
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
