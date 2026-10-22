import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
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
import { glApi } from '../../../store/api/glApi';
import { billingApi } from '../../../store/api/billingApi';
import { useSelectedPropertyId } from '../../../hooks/useSelectedPropertyId';
import './GeneralImportPage.css';

const IMPORT_OPTIONS: { value: GeneralImportType; label: string }[] = [
  { value: 'meter', label: 'Meter Import' },
  { value: 'unit', label: 'Unit Import' },
  { value: 'lease', label: 'Lease Import' },
  { value: 'tenant', label: 'Tenant Import' },
  { value: 'lead', label: 'Lead Import' },
  { value: 'invoice', label: 'Invoice Import' },
  { value: 'charge', label: 'Charges Import' },
  { value: 'coa', label: 'Chart of Accounts Import' },
];

function errMessage(e: unknown, fallback: string): string {
  const err = e as {
    data?: {
      error?: { message?: string };
      errors?: { message?: string }[];
      message?: string;
    };
  };
  return err?.data?.error?.message || err?.data?.errors?.[0]?.message || err?.data?.message || fallback;
}

export default function GeneralImportPage() {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const initialType = (searchParams.get('type') as GeneralImportType) || 'meter';
  const propertyId = useSelectedPropertyId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<GeneralImportType>(
    IMPORT_OPTIONS.some((o) => o.value === initialType) ? initialType : 'meter'
  );
  const [file, setFile] = useState<File | null>(null);
  const [hasAttemptedFile, setHasAttemptedFile] = useState(false);
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
    if (needFile && !file) {
      setHasAttemptedFile(true);
      toast.error('Choose an Excel file first');
      return false;
    }
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
      if (importType === 'coa') {
        dispatch(glApi.util.invalidateTags(['GlAccounts', 'DepartmentCenters', 'CostCenters']));
      }
      if (importType === 'charge') {
        dispatch(billingApi.util.invalidateTags(['ChargeCategories', 'ChargeTypes']));
      }
      if (res.data.imported > 0) {
        toast.success(`${res.data.imported} record(s) imported${res.data.skipped > 0 ? `, ${res.data.skipped} skipped` : ''}`);
      } else if (res.data.skipped > 0) {
        toast.success(`0 records imported, ${res.data.skipped} skipped`);
      }
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
      a.download = `${importType === 'charge' ? 'charges' : importType === 'coa' ? 'chart-of-accounts' : importType}-import-sample.xlsx`;
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
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-title-row">
          <div
            className="page-icon-lg"
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileUp size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>General Import</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Import meters, units, leases, tenants, leads, invoices, charges and chart of accounts from an Excel file
            </p>
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
            className={`gi-file-text${hasAttemptedFile && !file ? ' input-error' : ''}`}
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
              const selected = e.target.files?.[0] ?? null;
              setFile(selected);
              if (selected) setHasAttemptedFile(false);
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
                {preview.rows.slice(0, 500).map((r) => (
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
          {(preview.total > 500 || preview.rows.length > 500) && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6b7280' }}>
              Showing first 500 of {preview.total} rows in preview. All valid rows will be imported.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="gi-card">
          <div className="gi-summary">
            <strong>{typeLabel} result</strong> ({result.total} rows in file)
          </div>
          <ul className="gi-stats">
            <li><span className="gi-ok">{result.imported}</span> record(s) inserted into {{ meter: 'meter_setups', tenant: 'tenants', lead: 'leads', invoice: 'invoices', lease: 'leases', charge: 'Charges', coa: 'Chart of Accounts' }[importType as string] ?? 'database'}</li>
            {(['meter', 'tenant', 'lead', 'invoice', 'lease', 'charge', 'coa'].includes(importType)) && (
              <li><span className="gi-skip">{result.skipped}</span> record(s) skipped (
                {importType === 'meter'
                  ? 'Meter No + Floor + Category already exist'
                  : importType === 'tenant'
                  ? 'Code already exists'
                  : importType === 'lead'
                  ? 'LeadNumber already exists'
                  : importType === 'invoice'
                  ? 'Invoice and Tenant already exist'
                  : importType === 'lease'
                  ? (result.skippedLeases !== undefined && result.skippedLeases > 0
                      ? `${result.skippedLeases} lease(s) already exist`
                      : 'Lease Number and Tenant already exist')
                  : importType === 'coa'
                  ? 'AccCode + Department + Cost Center already exist'
                  : 'Charges Code already exists'})</li>
            )}
            {importType === 'meter' && (
              <li><span className="gi-ok">{result.linked}</span> unit connection(s) inserted into utility_meters
                {result.linkSkipped > 0 && <>, <span className="gi-skip">{result.linkSkipped}</span> skipped</>}</li>
            )}
            {importType === 'lease' && result.unitChargesCount !== undefined && result.unitChargesCount > 0 && (
              <li><span className="gi-ok">{result.unitChargesCount}</span> charge(s) added to unit_charges</li>
            )}
            {importType === 'lease' && result.billingSchedulesCount !== undefined && result.billingSchedulesCount > 0 && (
              <li><span className="gi-ok">{result.billingSchedulesCount}</span> schedule(s) created in billing_schedules</li>
            )}
            {importType === 'lease' && result.unitStatusUpdated !== undefined && result.unitStatusUpdated > 0 && (
              <li><span className="gi-ok">{result.unitStatusUpdated}</span> unit status(es) updated (occupied / reserved)</li>
            )}
            {result.failed.length > 0 && <li><span className="gi-bad">{result.failed.length}</span> row(s) failed</li>}
          </ul>
          {result.notes.length > 0 && (
            <ul className="gi-notes">
              {result.notes.slice(0, 200).map((n, i) => <li key={i}>Row {n.rowNo}: {n.message}</li>)}
              {result.notes.length > 200 && (
                <li>...and {result.notes.length - 200} more note(s)</li>
              )}
            </ul>
          )}
          {result.failed.length > 0 && (
            <ul className="gi-errors">
              {result.failed.slice(0, 200).map((f) => <li key={f.rowNo}>Row {f.rowNo}: {f.errors.join('; ')}</li>)}
              {result.failed.length > 200 && (
                <li>...and {result.failed.length - 200} more error(s)</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
