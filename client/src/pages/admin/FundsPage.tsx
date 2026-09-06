import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useGetFundsQuery, useCreateFundMutation, useGetFundTransactionsQuery,
  useAddFundTransactionMutation, useApproveFundTransactionMutation, useRejectFundTransactionMutation,
} from '../../store/api/condoApi';
import { useSelectedPropertyId } from '../../hooks/useSelectedPropertyId';
import { useAlertDialog } from '../../components/DialogProvider';
import { Wallet, Plus, X, ArrowUpRight, ArrowDownRight, CheckCircle, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { PermissionGuard } from '../../components/guards/PermissionGuard';

const FUND_TYPES = ['sinking_fund', 'management_fund', 'reserve_fund'];
const TXN_TYPES = ['contribution', 'expenditure', 'interest', 'transfer'];
const FUND_LABELS: Record<string, string> = {
  sinking_fund: 'Sinking Fund', management_fund: 'Management Fund', reserve_fund: 'Reserve Fund',
};

export default function FundsPage() {
  const alertDialog = useAlertDialog();
  const propertyId = useSelectedPropertyId();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data: fundsRes, isLoading } = useGetFundsQuery({ propertyId, year }, { skip: !propertyId });
  const funds = fundsRes?.data || [];

  const [selectedFund, setSelectedFund] = useState<string>('');
  const [showCreateFund, setShowCreateFund] = useState(false);
  const [showAddTxn, setShowAddTxn] = useState(false);

  const { data: txnRes } = useGetFundTransactionsQuery({ fundId: selectedFund }, { skip: !selectedFund });
  const transactions = txnRes?.data || [];

  const [createFund] = useCreateFundMutation();
  const [addTxn] = useAddFundTransactionMutation();
  const [approveTxn, { isLoading: isApproving }] = useApproveFundTransactionMutation();
  const [rejectTxn, { isLoading: isRejecting }] = useRejectFundTransactionMutation();

  const [fundForm, setFundForm] = useState({ fundType: 'sinking_fund', name: '', openingBalance: '0', currency: 'USD', fiscalYear: String(currentYear) });
  const [txnForm, setTxnForm] = useState({ transactionType: 'contribution', amount: '', description: '', transactionDate: new Date().toISOString().slice(0, 10), notes: '' });
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleCreateFund = async () => {
    if (!fundForm.name) return;
    await createFund({ propertyId, ...fundForm, openingBalance: Number(fundForm.openingBalance), fiscalYear: Number(fundForm.fiscalYear) });
    setShowCreateFund(false);
    setFundForm({ fundType: 'sinking_fund', name: '', openingBalance: '0', currency: 'USD', fiscalYear: String(currentYear) });
  };

  const handleAddTxn = async () => {
    if (!txnForm.amount || !txnForm.description) return;
    await addTxn({ fundId: selectedFund, data: { ...txnForm, amount: Number(txnForm.amount) } });
    setShowAddTxn(false);
    setTxnForm({ transactionType: 'contribution', amount: '', description: '', transactionDate: new Date().toISOString().slice(0, 10), notes: '' });
  };

  const handleApprove = async (txnId: string) => {
    try {
      await approveTxn({ txnId }).unwrap();
    } catch (e: any) {
      alertDialog(e?.data?.errors?.[0]?.message || 'Approval failed');
    }
  };

  const handleReject = async () => {
    if (!showRejectModal) return;
    try {
      await rejectTxn({ txnId: showRejectModal, reason: rejectReason }).unwrap();
      setShowRejectModal(null);
      setRejectReason('');
    } catch (e: any) {
      alertDialog(e?.data?.errors?.[0]?.message || 'Rejection failed');
    }
  };

  const pendingCount = transactions.filter((t: any) => t.status === 'pending_approval').length;

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (!propertyId) return <div className="page-content"><div className="condo-empty-state"><Wallet size={40} /><h3>Select a Property</h3><p>Choose a property to manage funds</p></div></div>;

  return (
    <div className="page-content">
      <div className="condo-page-header">
        <div>
          <h1>Funds Management</h1>
          <p className="condo-page-subtitle">Sinking fund, management fund & reserve fund ledger</p>
        </div>
        <div className="condo-header-actions">
          <select className="condo-filter-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <PermissionGuard permission="condo-funds.write">
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateFund(true)}>
              <Plus size={14} style={{ marginRight: 4 }} />New Fund
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Fund Balance Cards */}
      {isLoading ? (
        <div className="module-skeleton-grid">
          {[1,2,3].map(i => <div key={i} className="module-skeleton-card module-skeleton-tall" />)}
        </div>
      ) : (
      <div className="condo-fund-grid">
        {funds.length === 0 ? (
          <div className="condo-empty-state">
            <Wallet size={40} strokeWidth={1} />
            <h3>No Funds</h3>
            <p>Create a fund account to get started.</p>
          </div>
        ) : funds.map((fund: any) => (
          <div key={fund.id}
            className={`condo-fund-card ${selectedFund === fund.id ? 'condo-fund-selected' : ''}`}
            onClick={() => setSelectedFund(fund.id)}>
            <div className="condo-fund-card-header">
              <span className={`condo-fund-type condo-fund-${fund.fundType}`}>{FUND_LABELS[fund.fundType] || fund.fundType}</span>
              {fund.isActive && <span className="condo-status-badge condo-status-active">Active</span>}
            </div>
            <h4 className="condo-fund-name">{fund.name}</h4>
            <div className="condo-fund-balance">{fund.currency} {fmt(Number(fund.currentBalance))}</div>
            <div className="condo-fund-stats">
              <div className="condo-fund-stat">
                <span className="condo-fund-stat-label">YTD In</span>
                <span className="text-success">+{fmt(fund.ytdContributions)}</span>
              </div>
              <div className="condo-fund-stat">
                <span className="condo-fund-stat-label">YTD Out</span>
                <span className="text-danger">-{fmt(fund.ytdExpenditures)}</span>
              </div>
            </div>
            <div className="condo-fund-footer">
              <span>{fund._count?.transactions || 0} transactions</span>
              <span>FY {fund.fiscalYear}</span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Transactions Table */}
      {selectedFund && (
        <div className="condo-card" style={{ marginTop: 20 }}>
          <div className="condo-card-header">
            <h3>
              <Wallet size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />Transactions
              {pendingCount > 0 && (
                <span className="condo-pending-badge" style={{
                  marginLeft: 8, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px',
                  borderRadius: 12, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b',
                }}>{pendingCount} pending approval</span>
              )}
            </h3>
            <PermissionGuard permission="condo-funds.write">
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddTxn(true)}>
                <Plus size={14} style={{ marginRight: 4 }} />Add Transaction
              </button>
            </PermissionGuard>
          </div>
          <div className="condo-table-wrap">
            <table className="condo-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={8} className="condo-table-empty">No transactions yet</td></tr>
                ) : transactions.map((t: any) => (
                  <tr key={t.id}>
                    <td>{new Date(t.transactionDate).toLocaleDateString()}</td>
                    <td><span className={`condo-txn-type condo-txn-${t.transactionType}`}>{t.transactionType}</span></td>
                    <td>
                      {t.description}
                      {t.rejectionReason && (
                        <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2 }}>
                          Reason: {t.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td>{t.unit?.unitNumber || '—'}</td>
                    <td className={`text-right ${t.transactionType === 'expenditure' || t.transactionType === 'transfer' ? 'text-danger' : 'text-success'}`}>
                      {t.transactionType === 'expenditure' || t.transactionType === 'transfer' ? '-' : '+'}{fmt(Number(t.amount))}
                    </td>
                    <td>
                      <span className={`condo-approval-badge condo-approval-${t.status}`}>
                        {t.status === 'pending_approval' && <><Clock size={11} /> Pending</>}
                        {t.status === 'approved' && <><CheckCircle size={11} /> Approved</>}
                        {t.status === 'auto_approved' && <><ShieldCheck size={11} /> Auto</>}
                        {t.status === 'rejected' && <><XCircle size={11} /> Rejected</>}
                      </span>
                    </td>
                    <td>{t.creator?.profile?.firstName || t.creator?.email || '—'}</td>
                    <td>
                      {t.status === 'pending_approval' && (
                        <PermissionGuard permission="condo-funds.write">
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                              onClick={() => handleApprove(t.id)}
                              disabled={isApproving}
                            >
                              <CheckCircle size={12} /> Approve
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                              onClick={() => { setShowRejectModal(t.id); setRejectReason(''); }}
                              disabled={isRejecting}
                            >
                              <XCircle size={12} /> Reject
                            </button>
                          </div>
                        </PermissionGuard>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Fund Modal */}
      {showCreateFund && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Create Fund Account</h3>
              <button className="condo-modal-close" onClick={() => setShowCreateFund(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>Fund Type
                  <select value={fundForm.fundType} onChange={e => setFundForm(p => ({ ...p, fundType: e.target.value }))}>
                    {FUND_TYPES.map(t => <option key={t} value={t}>{FUND_LABELS[t]}</option>)}
                  </select>
                </label>
                <label>Fiscal Year
                  <input type="number" value={fundForm.fiscalYear} onChange={e => setFundForm(p => ({ ...p, fiscalYear: e.target.value }))} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Fund Name
                  <input value={fundForm.name} onChange={e => setFundForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 2025 Sinking Fund" />
                </label>
                <label>Opening Balance
                  <input type="number" value={fundForm.openingBalance} onChange={e => setFundForm(p => ({ ...p, openingBalance: e.target.value }))} />
                </label>
                <label>Currency
                  <input value={fundForm.currency} onChange={e => setFundForm(p => ({ ...p, currency: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreateFund(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateFund}>Create Fund</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Add Transaction Modal */}
      {showAddTxn && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal" onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Add Transaction</h3>
              <button className="condo-modal-close" onClick={() => setShowAddTxn(false)}>×</button>
            </div>
            <div className="condo-modal-body">
              <div className="condo-form-grid">
                <label>Type
                  <select value={txnForm.transactionType} onChange={e => setTxnForm(p => ({ ...p, transactionType: e.target.value }))}>
                    {TXN_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </label>
                <label>Amount
                  <input type="number" value={txnForm.amount} onChange={e => setTxnForm(p => ({ ...p, amount: e.target.value }))} />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Description
                  <input value={txnForm.description} onChange={e => setTxnForm(p => ({ ...p, description: e.target.value }))} />
                </label>
                <label>Date
                  <input type="date" value={txnForm.transactionDate} onChange={e => setTxnForm(p => ({ ...p, transactionDate: e.target.value }))} />
                </label>
                <label>Notes
                  <input value={txnForm.notes} onChange={e => setTxnForm(p => ({ ...p, notes: e.target.value }))} />
                </label>
              </div>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddTxn(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddTxn}>Add Transaction</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Rejection Reason Modal */}
      {showRejectModal && createPortal(
        <div className="condo-modal-overlay">
          <div className="condo-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="condo-modal-header">
              <h3>Reject Transaction</h3>
              <button className="condo-modal-close" onClick={() => setShowRejectModal(null)}>×</button>
            </div>
            <div className="condo-modal-body">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Rejection Reason</span>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Provide a reason for rejecting this transaction..."
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-body)',
                    color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </label>
            </div>
            <div className="condo-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowRejectModal(null)}>Cancel</button>
              <button
                className="btn"
                style={{ background: '#ef4444', color: 'white' }}
                onClick={handleReject}
                disabled={isRejecting}
              >
                {isRejecting ? 'Rejecting...' : 'Reject Transaction'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
