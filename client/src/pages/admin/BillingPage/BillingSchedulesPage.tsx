import { useState } from 'react';
import {
  useGetBillingSchedulesQuery, usePauseScheduleMutation,
  useResumeScheduleMutation, useCancelScheduleMutation,
} from '../../../store/api/billingApi';
import { CalendarClock, Pause, Play, X, ChevronLeft, ChevronRight, CircleDot } from 'lucide-react';
import { format } from 'date-fns';
import './BillingPage.css';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

const CHARGE_CATEGORY_MAP: Record<string, string> = {
  RENT: 'rent',
  SERVICE_CHARGE: 'service',
  PARKING_MONTHLY: 'parking',
  PARKING_HOURLY: 'parking',
  ELECTRICITY: 'utility',
  WATER: 'utility',
  GAS: 'utility',
  CHILLED_WATER: 'utility',
  LATE_PAYMENT_PENALTY: 'penalty',
  ADMIN_FEE: 'misc',
  LEGAL_FEE: 'misc',
  REPAIR_CHARGE: 'misc',
  MISC: 'misc',
};

export default function BillingSchedulesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isFetching } = useGetBillingSchedulesQuery({ status: statusFilter || undefined, page, limit: 15 });
  const [pauseSchedule] = usePauseScheduleMutation();
  const [resumeSchedule] = useResumeScheduleMutation();
  const [cancelSchedule] = useCancelScheduleMutation();

  const schedules = data?.data || [];
  const meta = data?.meta;

  const handleAction = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel' && !confirm('Cancel this billing schedule? No future invoices will be generated.')) return;
    try {
      if (action === 'pause') await pauseSchedule(id).unwrap();
      if (action === 'resume') await resumeSchedule(id).unwrap();
      if (action === 'cancel') await cancelSchedule(id).unwrap();
    } catch (err: any) {
      alert(err?.data?.message || `Failed to ${action} schedule`);
    }
  };

  const getTenantName = (s: any) => s.tenant.tenantType === 'company'
    ? s.tenant.companyName || ''
    : `${s.tenant.firstName || ''} ${s.tenant.lastName || ''}`.trim();

  const getChargeCategory = (code: string) => CHARGE_CATEGORY_MAP[code] || 'misc';

  return (
    <div className="billing-page">
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
            <CalendarClock size={22} />
          </div>
          <div>
            <h1>Billing Schedules</h1>
            <p>Recurring charge schedules for leases</p>
          </div>
        </div>
        <div className="billing-filters" style={{ marginBottom: 0 }}>
          <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className="billing-table-wrap" style={{ marginTop: 24 }}>
        <table className="billing-table">
          <thead>
            <tr>
              <th style={{ width: 220 }}>Charge</th>
              <th style={{ width: 160 }}>Tenant</th>
              <th style={{ width: 180 }}>Property / Unit</th>
              <th className="text-right" style={{ width: 110 }}>Amount</th>
              <th style={{ width: 80 }}>Cycle</th>
              <th style={{ width: 120 }}>Next Billing</th>
              <th style={{ width: 100 }}>Status</th>
              <th className="text-center" style={{ width: 70 }}>Invoices</th>
              <th className="text-center" style={{ width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="billing-empty">
                    {isFetching ? 'Loading…' : 'No billing schedules found.'}
                  </div>
                </td>
              </tr>
            ) : (
              schedules.map(s => {
                const category = s.chargeType?.category || getChargeCategory(s.chargeType?.code || '');
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-primary">{s.description || s.chargeType.name}</div>
                      <div style={{ marginTop: 4 }}>
                        <span className={`charge-type-badge ${category}`}>
                          {s.chargeType.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-primary">{getTenantName(s)}</div>
                    </td>
                    <td>
                      <div className="cell-primary">{s.property.name}</div>
                      {s.unit && <div className="cell-secondary">Unit {s.unit.unitNumber}</div>}
                    </td>
                    <td className="text-right">
                      <span className="cell-amount">{formatCurrency(s.amount, s.currency)}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                        {s.billingCycle.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {s.nextBillingDate ? (
                        <div style={{ fontSize: 13 }}>{format(new Date(s.nextBillingDate), 'MMM d, yyyy')}</div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`sched-status sched-status--${s.status}`}>
                        <CircleDot size={10} />
                        {s.status}
                      </span>
                    </td>
                    <td className="text-center">
                      <span style={{ 
                        fontWeight: 700, 
                        fontSize: 14,
                        color: s.invoiceCount > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        background: s.invoiceCount > 0 ? 'rgba(99,102,241,0.1)' : 'transparent',
                        padding: '3px 10px',
                        borderRadius: 8,
                      }}>
                        {s.invoiceCount}
                      </span>
                    </td>
                    <td className="text-center">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {s.status === 'active' && (
                          <button className="action-btn" onClick={() => handleAction(s.id, 'pause')} title="Pause schedule">
                            <Pause size={13} />
                          </button>
                        )}
                        {s.status === 'paused' && (
                          <button className="action-btn" onClick={() => handleAction(s.id, 'resume')} title="Resume schedule">
                            <Play size={13} />
                          </button>
                        )}
                        {['active', 'paused'].includes(s.status) && (
                          <button className="action-btn danger" onClick={() => handleAction(s.id, 'cancel')} title="Cancel schedule">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {meta && meta.totalPages > 1 && (
          <div className="billing-pagination">
            <span className="page-info">Page {meta.page} of {meta.totalPages}</span>
            <div className="page-btns">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={15} />
              </button>
              <button disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
