import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetAssetsQuery, useCreateAssetMutation, useRunDepreciationMutation,
} from '../../../store/api/assetsApi';
import type { FixedAsset } from '../../../store/api/assetsApi';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import '../GLPage/GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const CATEGORIES = ['building', 'machinery', 'furniture', 'vehicle', 'it_equipment', 'other'];

export default function AssetsListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const { data: result, isLoading } = useGetAssetsQuery({ page, limit: 20, category: category || undefined, status: status || undefined });
  const [runDep, { isLoading: depRunning }] = useRunDepreciationMutation();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const assets = result?.data || [];
  const meta = result?.meta || { total: 0, page: 1, totalPages: 1 };

  const totalCost = assets.reduce((s, a) => s + Number(a.acquisitionCost), 0);
  const totalNBV = assets.reduce((s, a) => s + a.netBookValue, 0);

  const handleRunDepreciation = async () => {
    if (!(await confirmDialog('Run monthly depreciation for all active assets?'))) return;
    try {
      const result = await runDep().unwrap();
      alertDialog(`Depreciation complete: ${result.data.assetsProcessed} assets, total ${fmtAmt(result.data.totalDepreciation)} for ${result.data.periodName}`);
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || err.data?.message || 'Error running depreciation');
    }
  };

  return (
    <div className="gl-page">
      <h2>Fixed Assets</h2>
      <div className="gl-toolbar">
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="disposed">Disposed</option>
          <option value="transferred">Transferred</option>
        </select>
        <div style={{ flex: 1 }} />
        <PermissionGuard permission="finance-assets.write">
          <button className="btn-sm" onClick={handleRunDepreciation} disabled={depRunning}>
            {depRunning ? '⏳ Running…' : '⚙️ Run Depreciation'}
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Add Asset</button>
        </PermissionGuard>
      </div>

      <div className="gl-stats">
        <div className="gl-stat-card">
          <div className="stat-value">{meta.total}</div>
          <div className="stat-label">Total Assets</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value">{fmtAmt(totalCost)}</div>
          <div className="stat-label">Acquisition Cost</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value" style={{color:'var(--primary, #3b82f6)'}}>{fmtAmt(totalNBV)}</div>
          <div className="stat-label">Net Book Value</div>
        </div>
      </div>

      {isLoading ? <p style={{color:'var(--text-secondary)'}}>Loading…</p> : (
        <div className="gl-table-wrap">
          <table className="gl-table">
            <thead>
              <tr>
                <th>Asset #</th><th>Name</th><th>Category</th><th>Acquisition</th>
                <th style={{textAlign:'right'}}>Cost</th><th style={{textAlign:'right'}}>Accum Dep</th>
                <th style={{textAlign:'right'}}>NBV</th><th>Status</th><th>Location</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id} onClick={() => navigate(`/admin/assets/${a.id}`)} style={{cursor:'pointer'}}>
                  <td style={{fontWeight:600}}>{a.assetNumber}</td>
                  <td>{a.name}</td>
                  <td><span className={`gl-type-chip ${a.category === 'building' ? 'asset' : a.category === 'machinery' ? 'liability' : a.category === 'vehicle' ? 'equity' : a.category === 'it_equipment' ? 'income' : 'expense'}`}>{a.category.replace(/_/g, ' ')}</span></td>
                  <td>{fmtDate(a.acquisitionDate)}</td>
                  <td className="amount">{fmtAmt(Number(a.acquisitionCost))}</td>
                  <td className="amount negative">{fmtAmt(Number(a.accumulatedDepreciation))}</td>
                  <td className="amount positive">{fmtAmt(a.netBookValue)}</td>
                  <td><span className={`gl-badge ${a.status === 'active' ? 'open' : a.status === 'disposed' ? 'reversed' : 'closed'}`}>{a.status}</span></td>
                  <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{a.currentLocation || '—'}</td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr><td colSpan={9} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No assets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {meta.totalPages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:16}}>
          <button className="btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{padding:'6px 12px',color:'var(--text-secondary)',fontSize:'0.85rem'}}>Page {meta.page} of {meta.totalPages}</span>
          <button className="btn-sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {showCreate && <CreateAssetModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateAssetModal({ onClose }: { onClose: () => void }) {
  const [createAsset, { isLoading }] = useCreateAssetMutation();
  const alertDialog = useAlertDialog();
  const [form, setForm] = useState({
    name: '', category: 'machinery', acquisitionDate: new Date().toISOString().split('T')[0],
    acquisitionCost: 0, usefulLifeYears: 10, residualValue: 0,
    depreciationMethod: 'straight_line', currentLocation: '', serialNumber: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAsset(form).unwrap();
      onClose();
    } catch (err: any) {
      alertDialog(err.data?.errors?.[0]?.message || err.data?.message || 'Error');
    }
  };

  return (
    <div className="gl-modal-overlay">
      <div className="gl-modal" onClick={e => e.stopPropagation()}>
        <h3>Register New Asset</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Asset Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div className="gl-form-group">
              <label>Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Acquisition Date</label>
              <input type="date" value={form.acquisitionDate} onChange={e => setForm({...form, acquisitionDate: e.target.value})} required />
            </div>
            <div className="gl-form-group">
              <label>Acquisition Cost</label>
              <input type="number" min="0" step="0.01" value={form.acquisitionCost || ''} onChange={e => setForm({...form, acquisitionCost: parseFloat(e.target.value) || 0})} required />
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Useful Life (Years)</label>
              <input type="number" min="1" max="100" value={form.usefulLifeYears} onChange={e => setForm({...form, usefulLifeYears: parseInt(e.target.value) || 1})} required />
            </div>
            <div className="gl-form-group">
              <label>Residual Value</label>
              <input type="number" min="0" step="0.01" value={form.residualValue || ''} onChange={e => setForm({...form, residualValue: parseFloat(e.target.value) || 0})} />
            </div>
          </div>
          <div className="gl-form-row">
            <div className="gl-form-group">
              <label>Depreciation Method</label>
              <select value={form.depreciationMethod} onChange={e => setForm({...form, depreciationMethod: e.target.value})}>
                <option value="straight_line">Straight Line</option>
                <option value="declining_balance">Declining Balance</option>
              </select>
            </div>
            <div className="gl-form-group">
              <label>Serial Number</label>
              <input value={form.serialNumber} onChange={e => setForm({...form, serialNumber: e.target.value})} />
            </div>
          </div>
          <div className="gl-form-group">
            <label>Location</label>
            <input value={form.currentLocation} onChange={e => setForm({...form, currentLocation: e.target.value})} />
          </div>
          <div className="gl-form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} />
          </div>

          {/* Preview */}
          <div className="gl-card" style={{background:'var(--surface-hover)',marginTop:12,padding:12}}>
            <div style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>Monthly Depreciation Preview</div>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>
              {form.depreciationMethod === 'straight_line'
                ? fmtAmt((form.acquisitionCost - form.residualValue) / (form.usefulLifeYears * 12))
                : '(depends on rate)'
              } / month
            </div>
          </div>

          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Creating…' : 'Register Asset'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
