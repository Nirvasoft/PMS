import { useRef, useState } from 'react';
import { FileUp, Eye, Upload, Download, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  usePreviewGeneralImportMutation,
  useImportGeneralImportMutation,
  useDownloadGeneralImportSampleMutation,
  type GeneralImportType,
  type GeneralImportPreview,
  type GeneralImportResult,
} from '../../../store/api/generalImportApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import './GeneralImportPage.css';

const IMPORT_OPTIONS: { value: GeneralImportType; label: string }[] = [
  { value: 'meter', label: 'Meter Import' },
  { value: 'unit', label: 'Unit Import' },
  { value: 'lease', label: 'Lease Import' },
];

function errMessage(e: unknown, fallback: string): string {
  const err = e as { data?: { error?: { message?: string }; message?: string } };
  return err?.data?.error?.message || err?.data?.message || fallback;
}

export default function GeneralImportPage() {
  const propertyId = useSelectedPropertyId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<GeneralImportType>('meter');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GeneralImportPreview | null>(null);
  const [result, setResult] = useState<GeneralImportResult | null>(null);

  const [previewMut, { isLoading: previewing }] = usePreviewGeneralImportMutation();
  const [importMut, { isLoading: importing }] = useImportGeneralImportMutation();
  const [sampleMut, { isLoading: downloading }] = useDownloadGeneralImportSampleMutation();

  const busy = previewing || importing || downloading;
  const typeLabel = IMPORT_OPTIONS.find((o) => o.value === importType)!.label;

  const resetOutput = () => { setPreview(null); setResult(null); };

  const buildForm = () => {
    const fd = new FormData();
    fd.append('file', file!);
    return fd;
  };

  const requireReady = (needFile: boolean): boolean => {
    if (!propertyId) { toast.error('Select a property first'); return false; }
    if (needFile && !file) { toast.error('Choose an Excel file first'); return false; }
    return true;
  };

  const handlePreview = async () => {
    if (!requireReady(true)) return;
    setResult(null);
    try {
      const res = await previewMut({ propertyId, type: importType, formData: buildForm() }).unwrap();
      setPreview(res.data);
      toast.success(`${res.data.total} row(s) loaded`);
    } catch (e) {
      setPreview(null);
      toast.error(errMessage(e, 'Failed to preview file'));
    }
  };

  const handleImport = async () => {
    if (!requireReady(true)) return;
    try {
      const res = await importMut({ propertyId, type: importType, formData: buildForm() }).unwrap();
      setResult(res.data);
      setPreview(null);
      if (res.data.imported > 0) toast.success(`${res.data.imported} record(s) imported`);
      if (res.data.failed.length > 0) toast.error(`${res.data.failed.length} row(s) failed`);
    } catch (e) {
      toast.error(errMessage(e, 'Failed to import file'));
    }
  };

  const handleSample = async () => {
    if (!requireReady(false)) return;
    try {
      const blob = await sampleMut({ propertyId, type: importType }).unwrap();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${importType}-import-sample.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errMessage(e, 'Failed to download sample'));
    }
  };

  return (
    <div className="general-import-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><FileUp size={22} /></div>
          <div>
            <h1>General Import</h1>
            <p>Import meters, units and leases from an Excel file</p>
          </div>
        </div>
      </div>

      <div className="gi-card">
        <div className="gi-buttons">
          <button className="btn-ghost" onClick={handlePreview} disabled={busy}>
            <Eye size={14} /> {previewing ? 'Loading…' : 'Preview'}
          </button>
          <button className="btn-primary" onClick={handleImport} disabled={busy}>
            <Upload size={14} /> {importing ? 'Importing…' : 'Import'}
          </button>
          <button className="btn-ghost" onClick={handleSample} disabled={busy}>
            <Download size={14} /> {downloading ? 'Generating…' : 'Sample'}
          </button>
        </div>

        <div className="gi-file-row">
          <label htmlFor="gi-file-text">Choose File</label>
          <input
            id="gi-file-text"
            type="text"
            className="gi-file-text"
            readOnly
            value={file?.name ?? ''}
            placeholder="No file chosen — click to browse (.xlsx)"
            onClick={() => fileRef.current?.click()}
          />
          <button className="btn-ghost" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FolderOpen size={14} /> Browse
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              resetOutput();
              e.target.value = '';
            }}
          />
          <select
            className="gi-select"
            aria-label="Import type"
            value={importType}
            onChange={(e) => { setImportType(e.target.value as GeneralImportType); resetOutput(); }}
          >
            {IMPORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {preview && (
        <div className="gi-card">
          <div className="gi-summary">
            <strong>{typeLabel} preview:</strong> {preview.total} rows —{' '}
            <span className="gi-ok">{preview.validCount} valid</span>,{' '}
            {preview.skipCount > 0 && <><span className="gi-skip">{preview.skipCount} will be skipped (already exist)</span>, </>}
            <span className="gi-bad">{preview.errorCount} with errors</span>
          </div>
          <div className="gi-table-wrap">
            <table className="gi-table">
              <thead>
                <tr>
                  <th>Row</th>
                  {preview.columns.map((c) => <th key={c.key}>{c.header}</th>)}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNo} className={r.status === 'error' ? 'gi-row-error' : r.status === 'skip' ? 'gi-row-skip' : ''}>
                    <td>{r.rowNo}</td>
                    {preview.columns.map((c) => <td key={c.key}>{r.data[c.key]}</td>)}
                    <td>
                      {r.status === 'error' && <span className="gi-bad">{r.errors.join('; ')}</span>}
                      {r.status === 'skip' && <span className="gi-skip">Skip{r.errors.length ? ` - ${r.errors.join('; ')}` : ''}</span>}
                      {r.status === 'valid' && (r.errors.length
                        ? <span className="gi-skip">OK - {r.errors.join('; ')}</span>
                        : <span className="gi-ok">OK</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="gi-card">
          <div className="gi-summary">
            <strong>{typeLabel} result</strong> ({result.total} rows in file)
          </div>
          <ul className="gi-stats">
            <li><span className="gi-ok">{result.imported}</span> record(s) inserted into {importType === 'meter' ? 'meter_setups' : 'database'}</li>
            {importType === 'meter' && (
              <>
                <li><span className="gi-skip">{result.skipped}</span> record(s) skipped (Meter No + Floor + Category already exist)</li>
                <li><span className="gi-ok">{result.linked}</span> unit connection(s) inserted into utility_meters
                  {result.linkSkipped > 0 && <>, <span className="gi-skip">{result.linkSkipped}</span> skipped</>}</li>
              </>
            )}
            {result.failed.length > 0 && <li><span className="gi-bad">{result.failed.length}</span> row(s) failed</li>}
          </ul>
          {result.notes.length > 0 && (
            <ul className="gi-notes">
              {result.notes.map((n, i) => <li key={i}>Row {n.rowNo}: {n.message}</li>)}
            </ul>
          )}
          {result.failed.length > 0 && (
            <ul className="gi-errors">
              {result.failed.map((f) => <li key={f.rowNo}>Row {f.rowNo}: {f.errors.join('; ')}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
