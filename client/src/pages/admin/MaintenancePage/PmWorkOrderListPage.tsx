import '../MaintenancePage/MaintenancePage.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetPmWorkOrdersQuery, useCompletePmWorkOrderMutation,
  useSkipPmWorkOrderMutation,
} from '../../../store/api/pmApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  ClipboardList, Loader2, Inbox, Clock, Check, SkipForward,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
];

const WO_STATUS_MAP: Record<string, string> = {
  scheduled: 'open',
  in_progress: 'in_progress',
  overdue: 'cancelled',
  completed: 'completed',
  skipped: 'pending_parts',
};

export default function PmWorkOrderListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    status: '', propertyId: '', page: 1, limit: 20,
  });

  const { data: woData, isLoading } = useGetPmWorkOrdersQuery({
    status: filters.status || undefined,
    propertyId: filters.propertyId || undefined,
    page: filters.page,
    limit: filters.limit,
  });
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 200 });
  const [completeWo] = useCompletePmWorkOrderMutation();
  const [skipWo] = useSkipPmWorkOrderMutation();

  const workOrders = woData?.data || [];
  const meta = woData?.meta;
  const properties = propertiesData?.data || [];

  const handleQuickComplete = async (woId: string) => {
    try {
      await completeWo({ id: woId, data: { checklistResults: [], severity: 'none' } }).unwrap();
      toast.success('Work order completed');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const handleQuickSkip = async (woId: string) => {
    try {
      await skipWo({ id: woId }).unwrap();
      toast.success('Work order skipped');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed');
    }
  };

  const getDaysUntilDue = (dateStr: string) => {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="maint-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg"><ClipboardList size={22} /></div>
          <div>
            <h1>PM Work Orders</h1>
            <p>All preventive maintenance work orders across schedules</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="maint-toolbar">
        <div className="filter-group">
          <select className="filter-select" value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="filter-select" value={filters.propertyId}
            onChange={(e) => setFilters(f => ({ ...f, propertyId: e.target.value, page: 1 }))}>
            <option value="">All Properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="toolbar-stats">
          <span className="stat-chip">
            <ClipboardList size={12} />
            {meta?.total || workOrders.length} work order{(meta?.total || workOrders.length) !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="maint-loading"><Loader2 size={20} className="spin" /> Loading work orders...</div>
      ) : workOrders.length === 0 ? (
        <div className="maint-empty">
          <Inbox size={40} />
          <p>No PM work orders found</p>
        </div>
      ) : (
        <>
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Property</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Completed</th>
                  <th>Findings</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map((wo: any) => {
                  const days = getDaysUntilDue(wo.dueDate);
                  const isActionable = wo.status === 'scheduled' || wo.status === 'in_progress' || wo.status === 'overdue';
                  return (
                    <tr key={wo.id}>
                      <td>
                        <div>
                          <span
                            className="cell-primary" style={{ cursor: 'pointer', color: 'var(--primary)' }}
                            onClick={() => wo.scheduleId && navigate(`/admin/maintenance/pm/${wo.scheduleId}`)}
                          >
                            {wo.schedule?.name || '—'}
                          </span>
                          {wo.schedule?.category && (
                            <span className="cell-secondary" style={{ display: 'block', fontSize: '11px' }}>
                              {wo.schedule.category.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td><span className="cell-secondary">{wo.schedule?.property?.name || '—'}</span></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="cell-mono">{new Date(wo.dueDate).toLocaleDateString()}</span>
                          {isActionable && (
                            <span className={`sla-chip ${days < 0 ? 'breached' : days <= 3 ? 'at_risk' : 'on_track'}`}>
                              <Clock size={10} />
                              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`maint-status ${WO_STATUS_MAP[wo.status] || 'open'}`}>
                          {wo.status}
                        </span>
                      </td>
                      <td>
                        <span className="cell-secondary">
                          {wo.completedAt ? new Date(wo.completedAt).toLocaleString() : '—'}
                        </span>
                        {wo.completedBy?.profile && (
                          <span className="cell-secondary" style={{ display: 'block', fontSize: '11px' }}>
                            by {wo.completedBy.profile.firstName} {wo.completedBy.profile.lastName}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="cell-secondary" style={{
                          maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', display: 'block',
                        }}>
                          {wo.findings || '—'}
                        </span>
                      </td>
                      <td>
                        {isActionable ? (
                          <div className="sla-row-actions">
                            <button className="btn btn-ghost btn-sm" title="Quick Complete"
                              style={{ color: '#22c55e' }}
                              onClick={() => handleQuickComplete(wo.id)}
                            >
                              <Check size={14} />
                            </button>
                            <button className="btn btn-ghost btn-sm btn-danger-ghost" title="Skip"
                              onClick={() => handleQuickSkip(wo.id)}
                            >
                              <SkipForward size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="cell-secondary" style={{ fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="maint-pagination">
              <span className="page-info">Page {meta.page} of {meta.totalPages} ({meta.total} work orders)</span>
              <div className="page-btns">
                <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Previous</button>
                <button disabled={filters.page >= meta.totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
