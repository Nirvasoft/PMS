import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetPosConfigQuery, useIngestPosSalesMutation, useGetPosSalesHistoryQuery,
} from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { useAlertDialog } from '../../components/DialogProvider';
import {
  ShoppingCart, Terminal, RefreshCw, Upload, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, XCircle, DollarSign, CreditCard, Globe, Banknote,
} from 'lucide-react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PosIntegrationPage() {
  const propertyId = useSelectedPropertyId();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: configRes, isLoading: configLoading } = useGetPosConfigQuery(
    { propertyId }, { skip: !propertyId },
  );
  const posShops = configRes?.data || [];

  const { data: historyRes } = useGetPosSalesHistoryQuery(
    { propertyId, month, year }, { skip: !propertyId },
  );
  const history = historyRes?.data || [];

  const [ingestSales, { isLoading: isIngesting }] = useIngestPosSalesMutation();
  const alertDialog = useAlertDialog();

  const [showIngestModal, setShowIngestModal] = useState(false);
  const [ingestForm, setIngestForm] = useState({
    unitId: '', posSystem: '', salesDate: now.toISOString().split('T')[0],
    cashSales: '', cardSales: '', onlineSales: '', otherSales: '',
  });
  const [ingestResult, setIngestResult] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(true);

  const handleIngest = async () => {
    try {
      const res = await ingestSales({
        propertyId,
        unitId: ingestForm.unitId,
        posSystem: ingestForm.posSystem,
        salesDate: ingestForm.salesDate,
        cashSales: Number(ingestForm.cashSales) || 0,
        cardSales: Number(ingestForm.cardSales) || 0,
        onlineSales: Number(ingestForm.onlineSales) || 0,
        otherSales: Number(ingestForm.otherSales) || 0,
      }).unwrap();
      setIngestResult(res.data);
      setShowIngestModal(false);
    } catch (e: any) {
      alertDialog(e?.data?.errors?.[0]?.message || 'Ingest failed');
    }
  };

  const openIngest = (shop?: any) => {
    setIngestForm({
      unitId: shop?.unitId || '', posSystem: shop?.posSystem || '',
      salesDate: now.toISOString().split('T')[0],
      cashSales: '', cardSales: '', onlineSales: '', otherSales: '',
    });
    setIngestResult(null);
    setShowIngestModal(true);
  };

  const posCount = posShops.length;
  const posSyncCount = history.filter((h: any) => h.submissionMethod === 'pos_sync').length;
  const manualCount = history.filter((h: any) => h.submissionMethod !== 'pos_sync').length;
  const validatedCount = history.filter((h: any) => h.posValidated).length;

  if (!propertyId) {
    return (
      <div className="page-content">
        <div className="condo-empty-state">
          <Terminal size={40} />
          <h3>Select a Property</h3>
          <p>Choose a property to manage POS integrations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="condo-page-header">
        <div>
          <h1>POS Integration</h1>
          <p className="condo-page-subtitle">Connect POS systems for automated GTO sales data ingestion</p>
        </div>
        <button
          onClick={() => openIngest()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: 'hsl(260, 65%, 55%)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          <Upload size={14} /> Ingest Sales Data
        </button>
      </div>

      {/* KPI Cards */}
      <div className="condo-kpi-grid">
        <div className="condo-kpi-card module-animate-in">
          <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
            <Terminal size={20} color="white" />
          </div>
          <div className="condo-kpi-content">
            <span className="condo-kpi-label">POS-Enabled Shops</span>
            <span className="condo-kpi-value">{posCount}</span>
          </div>
        </div>
        <div className="condo-kpi-card module-animate-in" style={{ animationDelay: '0.05s' }}>
          <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <RefreshCw size={20} color="white" />
          </div>
          <div className="condo-kpi-content">
            <span className="condo-kpi-label">POS-Synced GTOs</span>
            <span className="condo-kpi-value">{posSyncCount}</span>
          </div>
        </div>
        <div className="condo-kpi-card module-animate-in" style={{ animationDelay: '0.1s' }}>
          <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <ShoppingCart size={20} color="white" />
          </div>
          <div className="condo-kpi-content">
            <span className="condo-kpi-label">Manual Submissions</span>
            <span className="condo-kpi-value">{manualCount}</span>
          </div>
        </div>
        <div className="condo-kpi-card module-animate-in" style={{ animationDelay: '0.15s' }}>
          <div className="condo-kpi-icon" style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}>
            <CheckCircle size={20} color="white" />
          </div>
          <div className="condo-kpi-content">
            <span className="condo-kpi-label">POS Validated</span>
            <span className="condo-kpi-value">{validatedCount}</span>
          </div>
        </div>
      </div>

      {/* Ingest Result Banner */}
      {ingestResult && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: 'var(--card-bg)',
          border: `1px solid ${ingestResult.action === 'created' ? 'rgba(16, 185, 129, 0.3)' : ingestResult.action === 'accumulated' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {ingestResult.action === 'created' && <CheckCircle size={16} style={{ color: '#10b981' }} />}
            {ingestResult.action === 'accumulated' && <RefreshCw size={16} style={{ color: '#6366f1' }} />}
            {ingestResult.action === 'variance_check' && <AlertTriangle size={16} style={{ color: '#f59e0b' }} />}
            <span style={{ fontSize: 13 }}>
              {ingestResult.action === 'created' && (
                <span><strong style={{ color: '#10b981' }}>GTO Created</strong> — ${ingestResult.grossTurnover?.toLocaleString()} for {ingestResult.month}/{ingestResult.year}</span>
              )}
              {ingestResult.action === 'accumulated' && (
                <span><strong style={{ color: '#6366f1' }}>Sales Accumulated</strong> — +${ingestResult.dailySales?.toLocaleString()} → Total: ${ingestResult.newGrossTotal?.toLocaleString()}</span>
              )}
              {ingestResult.action === 'variance_check' && (
                <span><strong style={{ color: '#f59e0b' }}>Variance Check</strong> — {ingestResult.message}</span>
              )}
            </span>
          </div>
          <button onClick={() => setIngestResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>
      )}

      {/* POS-Configured Shops */}
      <div className="condo-card module-animate-in" style={{ marginBottom: 20, animationDelay: '0.2s' }}>
        <div className="condo-card-header">
          <h3><Terminal size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />POS-Configured Shops</h3>
          <span className="condo-card-badge">{posCount} shop{posCount !== 1 ? 's' : ''}</span>
        </div>
        {configLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : posShops.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Terminal size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p style={{ margin: 0 }}>No shops with POS systems configured. Set up POS system in the Shop Profile.</p>
          </div>
        ) : (
          <div className="condo-table-wrap">
            <table className="condo-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Brand</th>
                  <th>Tenant</th>
                  <th>POS System</th>
                  <th>Store ID</th>
                  <th>Category</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posShops.map((shop: any) => (
                  <tr key={shop.id}>
                    <td style={{ fontWeight: 600 }}>{shop.unitNumber}</td>
                    <td>{shop.brandName || '—'}</td>
                    <td>{shop.tenant || '—'}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6',
                        textTransform: 'uppercase',
                      }}>
                        {shop.posSystem}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {shop.posStoreId || '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{shop.tradeCategory || '—'}</td>
                    <td>
                      <button
                        onClick={() => openIngest(shop)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6',
                          border: '1px solid rgba(139, 92, 246, 0.2)', cursor: 'pointer',
                        }}
                      >
                        <Upload size={11} /> Push Sales
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sales History */}
      <div className="condo-card module-animate-in" style={{ animationDelay: '0.3s' }}>
        <div className="condo-card-header" style={{ cursor: 'pointer' }} onClick={() => setShowHistory(!showHistory)}>
          <h3>
            <DollarSign size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Sales History — {MONTH_NAMES[month - 1]} {year}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              onClick={e => e.stopPropagation()}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }}
            >
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              onClick={e => e.stopPropagation()}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }}
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
        {showHistory && (
          <div className="condo-table-wrap">
            <table className="condo-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Brand</th>
                  <th>Tenant</th>
                  <th>Method</th>
                  <th>POS</th>
                  <th className="text-right">Cash</th>
                  <th className="text-right">Card</th>
                  <th className="text-right">Online</th>
                  <th className="text-right">Other</th>
                  <th className="text-right">Total GTO</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={11} className="condo-table-empty">No submissions for this period</td></tr>
                ) : history.map((h: any) => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>{h.unitNumber}</td>
                    <td>{h.brandName || '—'}</td>
                    <td>{h.tenant || '—'}</td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                        background: h.submissionMethod === 'pos_sync' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: h.submissionMethod === 'pos_sync' ? '#10b981' : '#f59e0b',
                      }}>
                        {h.submissionMethod === 'pos_sync' ? '⟳ POS' : '✎ Manual'}
                      </span>
                    </td>
                    <td>
                      {h.posSystem ? (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' }}>
                          {h.posSystem}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right" style={{ fontSize: 12 }}>
                      <Banknote size={10} style={{ marginRight: 2, verticalAlign: 'middle', opacity: 0.5 }} />
                      ${h.cashSales.toLocaleString()}
                    </td>
                    <td className="text-right" style={{ fontSize: 12 }}>
                      <CreditCard size={10} style={{ marginRight: 2, verticalAlign: 'middle', opacity: 0.5 }} />
                      ${h.cardSales.toLocaleString()}
                    </td>
                    <td className="text-right" style={{ fontSize: 12 }}>
                      <Globe size={10} style={{ marginRight: 2, verticalAlign: 'middle', opacity: 0.5 }} />
                      ${h.onlineSales.toLocaleString()}
                    </td>
                    <td className="text-right" style={{ fontSize: 12 }}>${h.otherSales.toLocaleString()}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>${h.grossTurnover.toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {h.posValidated ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                            ✓ POS OK
                          </span>
                        ) : h.variancePct != null && h.variancePct > 0.05 ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                            title={`Variance: ${(h.variancePct * 100).toFixed(1)}%`}
                          >
                            ⚠ {(h.variancePct * 100).toFixed(1)}%
                          </span>
                        ) : h.verified ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                            ✓ Verified
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af' }}>
                            Pending
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ingest Modal */}
      {showIngestModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowIngestModal(false)}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: 14, width: 520, maxWidth: '90vw',
            border: '1px solid var(--border-color)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px', borderBottom: '1px solid var(--border-color)',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={18} style={{ color: '#8b5cf6' }} /> Ingest POS Sales Data
              </h3>
              <button onClick={() => setShowIngestModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={labelStyle}>
                Shop *
                <select value={ingestForm.unitId} onChange={e => {
                  const shop = posShops.find((s: any) => s.unitId === e.target.value);
                  setIngestForm({ ...ingestForm, unitId: e.target.value, posSystem: shop?.posSystem || '' });
                }} style={fldStyle}>
                  <option value="">Select shop...</option>
                  {posShops.map((s: any) => (
                    <option key={s.unitId} value={s.unitId}>{s.unitNumber} — {s.brandName || s.tenant || 'N/A'}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Sales Date *
                <input type="date" value={ingestForm.salesDate} onChange={e => setIngestForm({ ...ingestForm, salesDate: e.target.value })} style={fldStyle} />
              </label>
              <label style={labelStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Banknote size={12} /> Cash Sales</span>
                <input type="number" min="0" step="0.01" value={ingestForm.cashSales} onChange={e => setIngestForm({ ...ingestForm, cashSales: e.target.value })} placeholder="0.00" style={fldStyle} />
              </label>
              <label style={labelStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={12} /> Card Sales</span>
                <input type="number" min="0" step="0.01" value={ingestForm.cardSales} onChange={e => setIngestForm({ ...ingestForm, cardSales: e.target.value })} placeholder="0.00" style={fldStyle} />
              </label>
              <label style={labelStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Globe size={12} /> Online Sales</span>
                <input type="number" min="0" step="0.01" value={ingestForm.onlineSales} onChange={e => setIngestForm({ ...ingestForm, onlineSales: e.target.value })} placeholder="0.00" style={fldStyle} />
              </label>
              <label style={labelStyle}>
                Other Sales
                <input type="number" min="0" step="0.01" value={ingestForm.otherSales} onChange={e => setIngestForm({ ...ingestForm, otherSales: e.target.value })} placeholder="0.00" style={fldStyle} />
              </label>
              {ingestForm.posSystem && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px', borderRadius: 8, background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.1)' }}>
                  POS System: <strong style={{ color: '#8b5cf6', textTransform: 'uppercase' }}>{ingestForm.posSystem}</strong>
                  {' · '}Total: <strong>${(
                    (Number(ingestForm.cashSales) || 0) + (Number(ingestForm.cardSales) || 0) +
                    (Number(ingestForm.onlineSales) || 0) + (Number(ingestForm.otherSales) || 0)
                  ).toLocaleString()}</strong>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-color)' }}>
              <button onClick={() => setShowIngestModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button
                onClick={handleIngest}
                disabled={!ingestForm.unitId || !ingestForm.salesDate || isIngesting}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'hsl(260, 65%, 55%)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {isIngesting ? 'Ingesting...' : 'Ingest Sales'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 };
const fldStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)',
  background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13,
};
