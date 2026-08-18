import { useState } from 'react';
import {
  useGetBillingSchedulesQuery, usePauseScheduleMutation,
  useResumeScheduleMutation, useCancelScheduleMutation,
  useCreateBillingScheduleMutation, useUpdateScheduleMutation,
  useGetChargeTypesQuery,
} from '../../../store/api/billingApi';
import type { BillingSchedule } from '../../../store/api/billingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { CalendarClock, Pause, Play, X, ChevronLeft, ChevronRight, CircleDot, Plus, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { useConfirm, useAlertDialog } from '../../../components/DialogProvider';
import './BillingPage.css';

const formatCurrency = (amount: string | number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

const CHARGE_CATEGORY_MAP: Record<string, string> = {
  RENT: 'rent', SERVICE_CHARGE: 'service', PARKING_MONTHLY: 'parking', PARKING_HOURLY: 'parking',
  ELECTRICITY: 'utility', WATER: 'utility', GAS: 'utility', CHILLED_WATER: 'utility',
  LATE_PAYMENT_PENALTY: 'penalty', ADMIN_FEE: 'misc', LEGAL_FEE: 'misc', REPAIR_CHARGE: 'misc', MISC: 'misc',
};

const BILLING_CYCLES = ['monthly', 'quarterly', 'semi_annually', 'annually'] as const;

interface ScheduleForm {
  chargeTypeId: string; propertyId: string; tenantId: string; unitId: string;
  amount: number; currency: string; billingCycle: string; billingDay: number;
  paymentDueDays: number; startDate: string; endDate: string; description: string;
}

const emptyForm: ScheduleForm = {
  chargeTypeId: '', propertyId: '', tenantId: '', unitId: '',
  amount: 0, currency: 'USD', billingCycle: 'monthly', billingDay: 1,
  paymentDueDays: 14, startDate: new Date().toISOString().split('T')[0], endDate: '', description: '',
};

export default function BillingSchedulesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);

  const { data, isFetching } = useGetBillingSchedulesQuery({ status: statusFilter || undefined, page, limit: 15 });
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: tenantsData } = useGetTenantsQuery({ page: 1, limit: 200 });

  const [pauseSchedule] = usePauseScheduleMutation();
  const [resumeSchedule] = useResumeScheduleMutation();
  const [cancelSchedule] = useCancelScheduleMutation();
  const [createSchedule, { isLoading: creating }] = useCreateBillingScheduleMutation();
  const [updateSchedule, { isLoading: updating }] = useUpdateScheduleMutation();
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const schedules = data?.data || [];
  const meta = data?.meta;
  const chargeTypes = chargeTypesData?.data || [];
  const properties = propertiesData?.data || [];
  const tenants = tenantsData?.data || [];

  const handleAction = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel' && !(await confirmDialog('Cancel this billing schedule? No future invoices will be generated.', { danger: true, confirmText: 'Cancel Schedule' }))) return;
    try {
      if (action === 'pause') await pauseSchedule(id).unwrap();
      if (action === 'resume') await resumeSchedule(id).unwrap();
      if (action === 'cancel') await cancelSchedule(id).unwrap();
    } catch (err: any) {
      alertDialog(err?.data?.message || `Failed to ${action} schedule`);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (s: BillingSchedule) => {
    setEditId(s.id);
    setForm({
      chargeTypeId: s.chargeType.id,
      propertyId: s.property.id,
      tenantId: s.tenant.id,
      unitId: s.unit?.id || '',
      amount: Number(s.amount),
      currency: s.currency,
      billingCycle: s.billingCycle,
      billingDay: s.billingDay,
      paymentDueDays: s.paymentDueDays,
      startDate: s.startDate.split('T')[0],
      endDate: s.endDate ? s.endDate.split('T')[0] : '',
      description: s.description || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, unknown> = {
        chargeTypeId: form.chargeTypeId,
        propertyId: form.propertyId,
        tenantId: form.tenantId,
        amount: form.amount,
        currency: form.currency,
        billingCycle: form.billingCycle,
        billingDay: form.billingDay,
        paymentDueDays: form.paymentDueDays,
        startDate: form.startDate,
        description: form.description || undefined,
      };
      if (form.unitId) payload.unitId = form.unitId;
      if (form.endDate) payload.endDate = form.endDate;

      if (editId) {
        await updateSchedule({ id: editId, data: payload }).unwrap();
      } else {
        await createSchedule(payload).unwrap();
      }
      setShowForm(false);
    } catch (err: any) {
      alertDialog(err?.data?.message || `Failed to ${editId ? 'update' : 'create'} schedule`);
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
          <div style={{ flex: 1 }}>
            <h1>Billing Schedules</h1>
            <p>Recurring charge schedules for leases</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Schedule
          </button>
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
                        {['active', 'paused'].includes(s.status) && (
                          <button className="action-btn" onClick={() => openEdit(s)} title="Edit schedule">
                            <Pencil size={13} />
                          </button>
                        )}
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

      {/* ═══ Create / Edit Schedule Modal ═══ */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><CalendarClock size={18} /> {editId ? 'Edit Schedule' : 'New Billing Schedule'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <div className="inv-field">
                    <label>Charge Type <span className="req">*</span></label>
                    <select required value={form.chargeTypeId} onChange={e => setForm({ ...form, chargeTypeId: e.target.value })}>
                      <option value="">Select charge type</option>
                      {chargeTypes.filter(ct => ct.isActive).map(ct => (
                        <option key={ct.id} value={ct.id}>{ct.name} ({ct.code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Property <span className="req">*</span></label>
                    <select required value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })}>
                      <option value="">Select property</option>
                      {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Tenant <span className="req">*</span></label>
                    <select required value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
                      <option value="">Select tenant</option>
                      {tenants.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.tenantType === 'company' ? t.companyName : `${t.firstName || ''} ${t.lastName || ''}`.trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Amount <span className="req">*</span></label>
                    <input type="number" required min={0} step={0.01} value={form.amount}
                      onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
                  </div>
                  <div className="inv-field">
                    <label>Billing Cycle <span className="req">*</span></label>
                    <select required value={form.billingCycle} onChange={e => setForm({ ...form, billingCycle: e.target.value })}>
                      {BILLING_CYCLES.map(c => (
                        <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Billing Day (of month) <span className="req">*</span></label>
                    <input type="number" required min={1} max={28} value={form.billingDay}
                      onChange={e => setForm({ ...form, billingDay: Number(e.target.value) })} />
                  </div>
                  <div className="inv-field">
                    <label>Payment Due (days after billing)</label>
                    <input type="number" min={0} max={90} value={form.paymentDueDays}
                      onChange={e => setForm({ ...form, paymentDueDays: Number(e.target.value) })} />
                  </div>
                  <div className="inv-field">
                    <label>Currency</label>
                    <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                      <option value="USD">USD</option>
                      <option value="MMK">MMK</option>
                      <option value="SGD">SGD</option>
                      <option value="MYR">MYR</option>
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Start Date <span className="req">*</span></label>
                    <input type="date" required value={form.startDate}
                      onChange={e => setForm({ ...form, startDate: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label>End Date (optional)</label>
                    <input type="date" value={form.endDate}
                      onChange={e => setForm({ ...form, endDate: e.target.value })} />
                  </div>
                </div>
                <div className="inv-form-grid cols-1" style={{ marginTop: 16 }}>
                  <div className="inv-field">
                    <label>Description (optional)</label>
                    <input placeholder="e.g. Monthly rent for Unit A101" value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                  {(creating || updating) ? 'Saving…' : editId ? 'Update Schedule' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
