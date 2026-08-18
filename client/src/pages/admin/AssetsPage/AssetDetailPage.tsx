import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetAssetQuery, useTransferAssetMutation, useDisposeAssetMutation,
  useGetDepreciationScheduleQuery,
} from '../../../store/api/assetsApi';
import { useAlertDialog } from '../../../components/DialogProvider';
import '../GLPage/GLPage.css';

const fmtAmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: asset, isLoading } = useGetAssetQuery(id!);
  const { data: schedule = [] } = useGetDepreciationScheduleQuery(id!);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDispose, setShowDispose] = useState(false);

  if (isLoading) return <div className="gl-page"><p style={{color:'var(--text-secondary)'}}>Loading…</p></div>;
  if (!asset) return <div className="gl-page"><p>Asset not found</p></div>;

  const depPct = Number(asset.acquisitionCost) > 0
    ? Math.round((Number(asset.accumulatedDepreciation) / Number(asset.acquisitionCost)) * 100)
    : 0;

  return (
    <div className="gl-page">
      <button className="btn-sm" onClick={() => navigate('/admin/assets')} style={{marginBottom:12}}>← Back to Assets</button>
      <h2>{asset.name}</h2>
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        <span className={`gl-badge ${asset.status === 'active' ? 'open' : asset.status === 'disposed' ? 'reversed' : 'closed'}`}>{asset.status}</span>
        <span className={`gl-type-chip ${asset.category === 'building' ? 'asset' : 'liability'}`}>{asset.category.replace(/_/g, ' ')}</span>
        <span style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>#{asset.assetNumber}</span>
      </div>

      {/* Summary Cards */}
      <div className="gl-stats">
        <div className="gl-stat-card">
          <div className="stat-value">{fmtAmt(Number(asset.acquisitionCost))}</div>
          <div className="stat-label">Acquisition Cost</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value" style={{color:'var(--danger, #ef4444)'}}>{fmtAmt(Number(asset.accumulatedDepreciation))}</div>
          <div className="stat-label">Accumulated Depreciation</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value" style={{color:'var(--success, #22c55e)'}}>{fmtAmt(asset.netBookValue)}</div>
          <div className="stat-label">Net Book Value</div>
        </div>
        <div className="gl-stat-card">
          <div className="stat-value">{depPct}%</div>
          <div className="stat-label">Depreciated</div>
        </div>
      </div>

      {/* Depreciation Progress */}
      <div className="gl-card" style={{marginBottom:20}}>
        <h3 style={{margin:'0 0 10px'}}>Depreciation Progress</h3>
        <div style={{background:'var(--border)',borderRadius:8,height:20,overflow:'hidden',position:'relative'}}>
          <div style={{
            background: depPct >= 90 ? 'var(--danger, #ef4444)' : depPct >= 50 ? '#f59e0b' : 'var(--success, #22c55e)',
            height:'100%',width:`${Math.min(depPct, 100)}%`,borderRadius:8,transition:'width 0.5s ease',
          }} />
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem',color:'var(--text-muted)',marginTop:4}}>
          <span>Residual: {fmtAmt(Number(asset.residualValue))}</span>
          <span>{asset.depreciationMethod === 'straight_line' ? 'Straight Line' : 'Declining Balance'} · {asset.usefulLifeYears} years</span>
        </div>
      </div>

      {/* Details Grid */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
        <div className="gl-card">
          <h3 style={{margin:'0 0 12px'}}>Details</h3>
          <DetailRow label="Acquisition Date" value={fmtDate(asset.acquisitionDate)} />
          <DetailRow label="Location" value={asset.currentLocation || '—'} />
          <DetailRow label="Serial Number" value={asset.serialNumber || '—'} />
          <DetailRow label="Warranty Expiry" value={asset.warrantyExpiry ? fmtDate(asset.warrantyExpiry) : '—'} />
          {asset.description && <DetailRow label="Description" value={asset.description} />}
        </div>
        <div className="gl-card">
          <h3 style={{margin:'0 0 12px'}}>Actions</h3>
          {asset.status === 'active' && (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <button className="btn-primary" onClick={() => setShowTransfer(true)} style={{width:'100%'}}>🔄 Transfer Asset</button>
              <button className="btn-sm btn-danger" onClick={() => setShowDispose(true)} style={{width:'100%'}}>🗑️ Dispose Asset</button>
            </div>
          )}
          {asset.status === 'disposed' && asset.disposalDate && (
            <div style={{padding:12,background:'var(--surface-hover)',borderRadius:8}}>
              <p style={{color:'var(--text-secondary)',margin:0,fontSize:'0.85rem'}}>
                Disposed on {fmtDate(asset.disposalDate)}<br />
                Sale price: <strong>{fmtAmt(Number(asset.disposalAmount || 0))}</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Depreciation Schedule */}
      <div className="gl-card" style={{marginBottom:20}}>
        <h3 style={{margin:'0 0 12px'}}>Depreciation Schedule ({schedule.length} entries)</h3>
        {schedule.length > 0 ? (
          <div className="gl-table-wrap">
            <table className="gl-table">
              <thead>
                <tr><th>Date</th><th>Period</th><th style={{textAlign:'right'}}>Amount</th><th style={{textAlign:'right'}}>NBV After</th></tr>
              </thead>
              <tbody>
                {schedule.map(e => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.depreciationDate)}</td>
                    <td>{e.fiscalPeriod?.name || '—'}</td>
                    <td className="amount negative">{fmtAmt(Number(e.amount))}</td>
                    <td className="amount">{fmtAmt(Number(e.netBookValueAfter))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>No depreciation entries yet</p>}
      </div>

      {/* Transfer History */}
      {asset.transfers && asset.transfers.length > 0 && (
        <div className="gl-card">
          <h3 style={{margin:'0 0 12px'}}>Transfer History</h3>
          <div className="gl-table-wrap">
            <table className="gl-table">
              <thead><tr><th>Date</th><th>Reason</th></tr></thead>
              <tbody>
                {asset.transfers.map((t: any) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.transferDate)}</td>
                    <td>{t.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showTransfer && <TransferModal assetId={id!} onClose={() => setShowTransfer(false)} />}
      {showDispose && <DisposeModal assetId={id!} onClose={() => setShowDispose(false)} />}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
      <span style={{fontSize:'0.85rem',color:'var(--text-secondary)'}}>{label}</span>
      <span style={{fontSize:'0.85rem',color:'var(--text-primary)',fontWeight:500}}>{value}</span>
    </div>
  );
}

function TransferModal({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [transferAsset, { isLoading }] = useTransferAssetMutation();
  const [form, setForm] = useState({ transferDate: new Date().toISOString().split('T')[0], reason: '' });
  const alertDialog = useAlertDialog();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await transferAsset({ id: assetId, data: form }).unwrap();
      onClose();
    } catch (err: any) { alertDialog(err.data?.message || 'Error'); }
  };

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal" onClick={e => e.stopPropagation()} style={{maxWidth:500}}>
        <h3>Transfer Asset</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-group">
            <label>Transfer Date</label>
            <input type="date" value={form.transferDate} onChange={e => setForm({...form, transferDate: e.target.value})} required />
          </div>
          <div className="gl-form-group">
            <label>Reason</label>
            <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} rows={3} placeholder="Reason for transfer…" />
          </div>
          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? 'Transferring…' : 'Transfer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DisposeModal({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [disposeAsset, { isLoading }] = useDisposeAssetMutation();
  const [form, setForm] = useState({ disposalDate: new Date().toISOString().split('T')[0], disposalAmount: 0 });
  const alertDialog = useAlertDialog();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await disposeAsset({ id: assetId, data: form }).unwrap();
      onClose();
    } catch (err: any) { alertDialog(err.data?.message || 'Error'); }
  };

  return (
    <div className="gl-modal-overlay" onClick={onClose}>
      <div className="gl-modal" onClick={e => e.stopPropagation()} style={{maxWidth:500}}>
        <h3>Dispose Asset</h3>
        <form onSubmit={handleSubmit}>
          <div className="gl-form-group">
            <label>Disposal Date</label>
            <input type="date" value={form.disposalDate} onChange={e => setForm({...form, disposalDate: e.target.value})} required />
          </div>
          <div className="gl-form-group">
            <label>Sale Amount</label>
            <input type="number" min="0" step="0.01" value={form.disposalAmount || ''} onChange={e => setForm({...form, disposalAmount: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="gl-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary btn-danger" disabled={isLoading}>{isLoading ? 'Disposing…' : 'Dispose'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
