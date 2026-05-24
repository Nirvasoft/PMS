import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGetGtoSubmissionsQuery, useGetGtoSummaryQuery, useVerifyGtoMutation } from '../../store/api/mallApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function GtoManagementPage() {
  
  const propertyId = useSelectedPropertyId();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [verifyModal, setVerifyModal] = useState<any>(null);
  const [verifyData, setVerifyData] = useState({ verified: true, variancePct: 0, notes: '' });

  const { data: gtoData, isLoading } = useGetGtoSubmissionsQuery(
    { propertyId, month, year },
    { skip: !propertyId }
  );
  const { data: summaryData } = useGetGtoSummaryQuery(
    { propertyId, month, year },
    { skip: !propertyId }
  );
  const [verifyGto] = useVerifyGtoMutation();

  const submissions = gtoData?.data || [];
  const summary = summaryData?.data;

  const handleVerify = async () => {
    if (!verifyModal) return;
    try {
      await verifyGto({ id: verifyModal.id, data: verifyData }).unwrap();
      setVerifyModal(null);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="page-content">
      <div className="mall-page-header">
        <div>
          <h1>GTO Management</h1>
          <p className="mall-page-subtitle">Gross Turnover submissions and percentage rent tracking</p>
        </div>
      </div>

      {/* Month/Year Filters */}
      <div className="mall-filter-bar">
        <select className="mall-filter-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="mall-filter-select" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mall-gto-summary-row">
          <div className="mall-gto-summary-card">
            <span className="mall-gto-summary-label">Submissions</span>
            <span className="mall-gto-summary-value">{summary.submitted} / {summary.totalShopsRequired}</span>
            {summary.pending > 0 && (
              <span className="mall-gto-pending-badge">{summary.pending} pending</span>
            )}
          </div>
          <div className="mall-gto-summary-card">
            <span className="mall-gto-summary-label">Total GTO</span>
            <span className="mall-gto-summary-value">${summary.totalGto.toLocaleString()}</span>
          </div>
          <div className="mall-gto-summary-card">
            <span className="mall-gto-summary-label">Base Rent</span>
            <span className="mall-gto-summary-value">${summary.totalBaseRent.toLocaleString()}</span>
          </div>
          <div className="mall-gto-summary-card">
            <span className="mall-gto-summary-label">% Rent Revenue</span>
            <span className="mall-gto-summary-value mall-gto-pct-rent">+${summary.totalPercentageRent.toLocaleString()}</span>
          </div>
          <div className="mall-gto-summary-card">
            <span className="mall-gto-summary-label">Total Rent</span>
            <span className="mall-gto-summary-value">${summary.totalRent.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      {isLoading ? (
        <div className="mall-loading">Loading submissions...</div>
      ) : (
        <div className="mall-table-wrap">
          <table className="mall-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Tenant</th>
                <th>Lease</th>
                <th className="text-right">GTO</th>
                <th className="text-right">Base Rent</th>
                <th className="text-right">% Rent</th>
                <th className="text-right">Total Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((gto: any) => (
                <tr key={gto.id}>
                  <td><strong>{gto.unit?.unitNumber}</strong></td>
                  <td>{gto.tenant?.companyName}</td>
                  <td>{gto.lease?.leaseNumber}</td>
                  <td className="text-right">${Number(gto.grossTurnover).toLocaleString()}</td>
                  <td className="text-right">${Number(gto.baseRent || 0).toLocaleString()}</td>
                  <td className="text-right">
                    {Number(gto.percentageRent) > 0 ? (
                      <span className="mall-gto-pct-rent">+${Number(gto.percentageRent).toLocaleString()}</span>
                    ) : '-'}
                  </td>
                  <td className="text-right"><strong>${Number(gto.totalRentDue || 0).toLocaleString()}</strong></td>
                  <td>
                    <span className={`mall-status-badge mall-status-${gto.verified ? 'verified' : 'pending'}`}>
                      {gto.verified ? '✓ Verified' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    {!gto.verified && (
                      <button
                        className="mall-btn-sm"
                        onClick={() => { setVerifyModal(gto); setVerifyData({ verified: true, variancePct: 0, notes: '' }); }}
                      >
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr><td colSpan={9} className="mall-table-empty">No submissions for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Verify Modal */}
      {verifyModal && createPortal(
        <div className="mall-modal-overlay" onClick={() => setVerifyModal(null)}>
          <div className="mall-modal mall-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mall-modal-header">
              <h3>Verify GTO Submission</h3>
              <button className="mall-modal-close" onClick={() => setVerifyModal(null)}>✕</button>
            </div>
            <div className="mall-modal-body">
              <p>Verify GTO of <strong>${Number(verifyModal.grossTurnover).toLocaleString()}</strong> for <strong>{verifyModal.unit?.unitNumber}</strong></p>
              <div className="mall-form-grid">
                <label>Variance vs POS (%)
                  <input type="number" step="0.1" value={verifyData.variancePct}
                    onChange={e => setVerifyData(d => ({ ...d, variancePct: Number(e.target.value) }))} />
                </label>
                <label>Notes
                  <textarea value={verifyData.notes}
                    onChange={e => setVerifyData(d => ({ ...d, notes: e.target.value }))}
                    rows={3} placeholder="Verification notes..." />
                </label>
              </div>
            </div>
            <div className="mall-modal-footer">
              <button className="btn btn-ghost" onClick={() => setVerifyModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleVerify}>✓ Verify</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
