import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import {
  useGetPurchaseRequisitionsQuery, useSubmitPurchaseRequisitionMutation,
  useApprovePurchaseRequisitionMutation, useRejectPurchaseRequisitionMutation,
} from '../../../store/api/inventoryApi';
import {
  ClipboardList, Loader2, Inbox, Send, CheckCircle2, XCircle,
  ShoppingCart, AlertTriangle, Clock, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'ordered', label: 'Ordered' },
];

const STATUS_STYLE: Record<string, string> = {
  draft: 'open',
  submitted: 'in_progress',
  approved: 'completed',
  rejected: 'cancelled',
  ordered: 'completed',
};

const STATUS_ICON: Record<string, typeof Clock> = {
  draft: Clock,
  submitted: Send,
  approved: CheckCircle2,
  rejected: XCircle,
  ordered: ShoppingCart,
};

export default function PurchaseRequisitionsPage() {
  const [filters, setFilters] = useState({ status: '', page: 1, limit: 20 });
  const [detailPr, setDetailPr] = useState<any>(null);

  const { data: prData, isLoading } = useGetPurchaseRequisitionsQuery({
    status: filters.status || undefined,
    page: filters.page,
    limit: filters.limit,
  });
  const [submitPr, { isLoading: submitting }] = useSubmitPurchaseRequisitionMutation();
  const [approvePr, { isLoading: approving }] = useApprovePurchaseRequisitionMutation();
  const [rejectPr, { isLoading: rejecting }] = useRejectPurchaseRequisitionMutation();

  const prs = prData?.data || [];
  const meta = prData?.meta;

  const handleSubmit = async (id: string) => {
    try {
      await submitPr(id).unwrap();
      toast.success('PR submitted for approval');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || err?.data?.message || 'Failed to submit');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approvePr(id).unwrap();
      toast.success('PR approved');
      setDetailPr(null);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || err?.data?.message || 'Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectPr(id).unwrap();
      toast.success('PR rejected');
      setDetailPr(null);
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || err?.data?.message || 'Failed to reject');
    }
  };

  const formatCurrency = (val: any) => {
    if (!val) return '—';
    return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  // Count by status
  const draftCount = prs.filter((p: any) => p.status === 'draft').length;
  const submittedCount = prs.filter((p: any) => p.status === 'submitted').length;

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><ClipboardList size={22} /></div>
          <div>
            <h1>Purchase Requisitions</h1>
            <p>Auto-generated and manual purchase requests for inventory items</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="maint-stats-row">
        <div className="maint-stat-card blue">
          <div className="msc-icon"><ClipboardList size={18} /></div>
          <span className="msc-value">{meta?.total || prs.length}</span>
          <span className="msc-label">Total PRs</span>
        </div>
        <div className="maint-stat-card amber">
          <div className="msc-icon"><Clock size={18} /></div>
          <span className="msc-value">{draftCount}</span>
          <span className="msc-label">Draft</span>
        </div>
        <div className="maint-stat-card purple">
          <div className="msc-icon"><Send size={18} /></div>
          <span className="msc-value">{submittedCount}</span>
          <span className="msc-label">Pending Approval</span>
        </div>
      </div>

      {/* Filters */}
      <div className="maint-toolbar">
        <div className="filter-group">
          <select className="filter-select" value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading requisitions...</div>
      ) : prs.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No purchase requisitions found</p>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            PRs are auto-generated when stock falls below reorder point
          </p>
        </div>
      ) : (
        <>
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>PR Number</th>
                  <th>Property</th>
                  <th>Items</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th>Requested By</th>
                  <th>Date</th>
                  <th style={{ width: 140, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prs.map((pr: any) => {
                  const items = Array.isArray(pr.items) ? pr.items : [];
                  const StatusIcon = STATUS_ICON[pr.status] || Clock;
                  return (
                    <tr key={pr.id}>
                      <td>
                        <span className="cell-mono" style={{ fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}
                          onClick={() => setDetailPr(pr)}>
                          {pr.prNumber}
                        </span>
                      </td>
                      <td><span className="cell-secondary">{pr.property?.name || '—'}</span></td>
                      <td>
                        <div className="pr-items-preview">
                          {items.slice(0, 2).map((item: any, i: number) => (
                            <span key={i} className="pr-item-tag">
                              {item.itemName || item.name}
                              <span className="pr-item-qty">×{item.qty}</span>
                            </span>
                          ))}
                          {items.length > 2 && (
                            <span className="pr-item-more">+{items.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="cell-mono" style={{ fontWeight: 600 }}>
                          {formatCurrency(pr.totalAmount)}
                        </span>
                      </td>
                      <td>
                        <span className={`maint-status ${STATUS_STYLE[pr.status] || 'open'}`}>
                          <StatusIcon size={12} />
                          {pr.status}
                        </span>
                      </td>
                      <td>
                        <span className="cell-secondary">
                          {pr.requestedBy?.profile
                            ? `${pr.requestedBy.profile.firstName} ${pr.requestedBy.profile.lastName}`
                            : pr.requestedBy?.email === 'system' ? '⚙️ Auto-generated' : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="cell-secondary">
                          {new Date(pr.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <div className="sla-row-actions">
                          <button className="btn btn-ghost btn-sm" title="View Details"
                            onClick={() => setDetailPr(pr)}>
                            <Eye size={14} />
                          </button>
                          <PermissionGuard permission="inventory-purchase-req.write">
                            {pr.status === 'draft' && (
                              <button className="btn btn-ghost btn-sm" title="Submit for Approval"
                                style={{ color: '#6366f1' }} disabled={submitting}
                                onClick={() => handleSubmit(pr.id)}>
                                <Send size={14} />
                              </button>
                            )}
                            {pr.status === 'submitted' && (
                              <>
                                <button className="btn btn-ghost btn-sm" title="Approve"
                                  style={{ color: '#22c55e' }} disabled={approving}
                                  onClick={() => handleApprove(pr.id)}>
                                  <CheckCircle2 size={14} />
                                </button>
                                <button className="btn btn-ghost btn-sm btn-danger-ghost" title="Reject"
                                  disabled={rejecting}
                                  onClick={() => handleReject(pr.id)}>
                                  <XCircle size={14} />
                                </button>
                              </>
                            )}
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="maint-pagination">
              <span className="page-info">Page {meta.page} of {meta.totalPages} ({meta.total} requisitions)</span>
              <div className="page-btns">
                <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Previous</button>
                <button disabled={filters.page >= meta.totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* PR Detail Modal */}
      {detailPr && (
        <div className="maint-modal-backdrop">
          <div className="maint-modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="maint-modal-header">
              <h2>
                <span className="modal-icon"><ClipboardList size={18} /></span>
                {detailPr.prNumber}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailPr(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <div className="maint-modal-body" style={{ padding: '0 24px 16px' }}>
              {/* Status + Meta */}
              <div className="pr-detail-meta">
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Status</span>
                  <span className={`maint-status ${STATUS_STYLE[detailPr.status]}`}>
                    {detailPr.status}
                  </span>
                </div>
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Property</span>
                  <span>{detailPr.property?.name || '—'}</span>
                </div>
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Requested By</span>
                  <span>
                    {detailPr.requestedBy?.profile
                      ? `${detailPr.requestedBy.profile.firstName} ${detailPr.requestedBy.profile.lastName}`
                      : '⚙️ Auto-generated'}
                  </span>
                </div>
                {detailPr.approvedBy?.profile && (
                  <div className="pr-meta-row">
                    <span className="pr-meta-label">{detailPr.status === 'rejected' ? 'Rejected By' : 'Approved By'}</span>
                    <span>{detailPr.approvedBy.profile.firstName} {detailPr.approvedBy.profile.lastName}</span>
                  </div>
                )}
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Date</span>
                  <span>{new Date(detailPr.createdAt).toLocaleString()}</span>
                </div>
                <div className="pr-meta-row">
                  <span className="pr-meta-label">Total Amount</span>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>
                    {formatCurrency(detailPr.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  Line Items ({(Array.isArray(detailPr.items) ? detailPr.items : []).length})
                </h4>
                <div className="pr-items-table">
                  <div className="pr-items-header">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Unit Cost</span>
                    <span>Total</span>
                  </div>
                  {(Array.isArray(detailPr.items) ? detailPr.items : []).map((item: any, idx: number) => (
                    <div key={idx} className="pr-items-row">
                      <span className="pr-item-name">{item.itemName || item.name || '—'}</span>
                      <span className="pr-item-qty-cell">{item.qty}</span>
                      <span className="pr-item-cost">{formatCurrency(item.unitCost)}</span>
                      <span className="pr-item-total">{formatCurrency((item.qty || 0) * (item.unitCost || 0))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {detailPr.notes && (
                <div className="pr-notes">
                  <strong>Notes:</strong> {detailPr.notes}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {(detailPr.status === 'draft' || detailPr.status === 'submitted') && (
              <PermissionGuard permission="inventory-purchase-req.write">
                <div className="maint-modal-footer">
                  {detailPr.status === 'draft' && (
                    <button className="btn btn-primary" disabled={submitting} onClick={() => {
                      handleSubmit(detailPr.id);
                      setDetailPr(null);
                    }}>
                      <Send size={16} /> Submit for Approval
                    </button>
                  )}
                  {detailPr.status === 'submitted' && (
                    <>
                      <button className="btn btn-ghost" disabled={rejecting}
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                        onClick={() => handleReject(detailPr.id)}>
                        <XCircle size={16} /> Reject
                      </button>
                      <button className="btn btn-primary" disabled={approving}
                        style={{ background: '#22c55e', borderColor: '#22c55e' }}
                        onClick={() => handleApprove(detailPr.id)}>
                        <CheckCircle2 size={16} /> Approve
                      </button>
                    </>
                  )}
                </div>
              </PermissionGuard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
