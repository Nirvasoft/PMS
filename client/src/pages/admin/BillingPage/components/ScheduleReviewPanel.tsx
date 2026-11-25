import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  CheckCircle2, ClipboardCheck, RotateCcw, AlertTriangle, CircleDot,
} from 'lucide-react';
import {
  useGetBillingScheduleReviewQuery,
  useSetBillingScheduleConfirmationMutation,
  useGetChargeCategoriesQuery,
  type BillingScheduleReviewCategory,
  type BillingScheduleReviewRow,
} from '../../../../store/api/billingApi';
import { useConfirm, useAlertDialog } from '../../../../components/DialogProvider';
import { usePermission } from '../../../../components/guards/PermissionGuard';
import { formatFullAmount } from '../../../../utils/formatCurrency';
import ComboBox from '../../../../components/ComboBox';

const fmt = (n: string | number) => formatFullAmount(n, { minDecimals: 2, maxDecimals: 2 });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const tenantName = (t: BillingScheduleReviewRow['tenant']) =>
  (t.tenantType !== 'individual' ? t.companyName : t.lastName) || t.lastName || t.companyName || t.firstName || '—';

const totalsLabel = (totals: Record<string, number>) =>
  Object.entries(totals).map(([cur, amt]) => `${cur} ${fmt(amt)}`).join(' • ') || '—';

interface Props {
  propertyId?: string;
  currency?: string;
  search: string;
  initialBillDate?: string;
  initialCategory?: string;
}

/**
 * Review & Confirm: due schedules grouped by Charge Category. Staff check Unit, Tenant and
 * Amount, then Confirm — only Confirmed schedules are invoiced by Run Billing.
 */
export function ScheduleReviewPanel({ propertyId, currency, search, initialBillDate, initialCategory }: Props) {
  const [billDate, setBillDate] = useState(initialBillDate || todayIso());
  const [categoryFilter, setCategoryFilter] = useState(initialCategory || '');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const canWrite = usePermission('billing-schedules.write');
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  const { data, isFetching } = useGetBillingScheduleReviewQuery({ asOfDate: billDate, propertyId, currency });
  const [setConfirmation] = useSetBillingScheduleConfirmationMutation();
  const review = data?.data;

  const { data: chargeCategoriesData } = useGetChargeCategoriesQuery(propertyId ? { propertyId } : undefined);
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; label: string; sublabel?: string }[] = [];
    for (const c of chargeCategoriesData?.data ?? []) {
      const key = c.code.trim().toLowerCase();
      if (!c.isActive || seen.has(key)) continue;
      seen.add(key);
      const label = c.description?.trim() || c.code;
      opts.push({ id: c.code, label, sublabel: label !== c.code ? c.code : undefined });
    }
    // Categories that only exist on due schedules (e.g. legacy codes) stay selectable too
    for (const g of review?.categories ?? []) {
      const key = g.categoryCode.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({ id: g.categoryCode, label: g.categoryName });
    }
    // Categories with due schedules come first so the default (top) selection has data to review
    const dueKeys = new Set((review?.categories ?? []).map((g) => g.categoryCode.trim().toLowerCase()));
    return opts.sort((a, b) => {
      const da = dueKeys.has(a.id.trim().toLowerCase()) ? 0 : 1;
      const db = dueKeys.has(b.id.trim().toLowerCase()) ? 0 : 1;
      return da - db || a.label.localeCompare(b.label);
    });
  }, [chargeCategoriesData, review]);

  // One category at a time — default to the top option, and keep a valid selection when options change
  useEffect(() => {
    if (categoryOptions.length === 0) return;
    const key = categoryFilter.trim().toLowerCase();
    if (!key || !categoryOptions.some((o) => o.id.trim().toLowerCase() === key)) {
      setCategoryFilter(categoryOptions[0].id);
    }
  }, [categoryOptions, categoryFilter]);

  const categoryScoped = useMemo(() => {
    if (!categoryFilter) return [];
    const key = categoryFilter.trim().toLowerCase();
    return (review?.categories ?? []).filter((c) => c.categoryCode.trim().toLowerCase() === key);
  }, [review, categoryFilter]);

  const stats = useMemo(() => ({
    due: categoryScoped.reduce((n, c) => n + c.activeCount + c.confirmedCount, 0),
    pending: categoryScoped.reduce((n, c) => n + c.activeCount, 0),
    confirmed: categoryScoped.reduce((n, c) => n + c.confirmedCount, 0),
  }), [categoryScoped]);

  // Client-side search over tenant / unit / charge so the category totals stay server-accurate.
  const categories = useMemo(() => {
    const list = categoryScoped;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list
      .map((c) => ({
        ...c,
        schedules: c.schedules.filter((s) =>
          [tenantName(s.tenant), s.tenant.firstName, s.unit?.unitNumber, s.chargeType.name, s.description]
            .some((v) => (v || '').toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.schedules.length > 0);
  }, [categoryScoped, search]);

  const run = async (
    key: string,
    body: { action: 'confirm' | 'unconfirm'; category?: string; scheduleIds?: string[] },
    successMsg: (n: number) => string,
  ) => {
    setBusyKey(key);
    try {
      const res = await setConfirmation({ asOfDate: billDate, propertyId, currency, ...body }).unwrap();
      toast.success(successMsg(res.data.updatedCount));
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || `Failed to ${body.action} schedules`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleCategory = async (cat: BillingScheduleReviewCategory, action: 'confirm' | 'unconfirm') => {
    const count = action === 'confirm' ? cat.activeCount : cat.confirmedCount;
    if (count === 0) return;
    const msg = action === 'confirm'
      ? `Confirm ${count} schedule(s) in "${cat.categoryName}" (${totalsLabel(cat.totalsByCurrency)}) for billing as of ${billDate}?\n\nRun Billing will only invoice Confirmed schedules.`
      : `Revert ${count} confirmed schedule(s) in "${cat.categoryName}" back to Active?`;
    if (!(await confirmDialog(msg, { confirmText: action === 'confirm' ? 'Confirm' : 'Unconfirm' }))) return;
    await run(`cat:${cat.categoryCode}`, { action, category: cat.categoryCode }, (n) =>
      action === 'confirm'
        ? `Confirmed ${n} schedule(s) in ${cat.categoryName}.`
        : `Reverted ${n} schedule(s) in ${cat.categoryName} to Active.`,
    );
  };

  const handleRow = (s: BillingScheduleReviewRow) => {
    const action = s.status === 'confirmed' ? 'unconfirm' : 'confirm';
    return run(`row:${s.id}`, { action, scheduleIds: [s.id] }, () =>
      action === 'confirm' ? 'Schedule confirmed.' : 'Schedule reverted to Active.',
    );
  };

  return (
    <div className="sched-review">
      <div className="sched-review-toolbar">
        <div className="sched-review-filters">
          <label className="sched-review-date">
            <span>Bill Date</span>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value || todayIso())} />
          </label>
          <div className="sched-review-date sched-review-category">
            <span>Charge Category</span>
            <ComboBox
              id="review-charge-category"
              value={categoryFilter}
              onChange={(v) => { if (v) setCategoryFilter(v); }}
              options={categoryOptions}
              placeholder="Select category"
              emptyText="No charge categories"
              clearable={false}
            />
          </div>
        </div>
        <div className="sched-review-stats">
          <div className="sched-review-stat">
            <span className="sched-review-stat-label">Due</span>
            <span className="sched-review-stat-value">{stats.due}</span>
          </div>
          <div className="sched-review-stat">
            <span className="sched-review-stat-label">Pending Review</span>
            <span className="sched-review-stat-value sched-review-stat-value--pending">{stats.pending}</span>
          </div>
          <div className="sched-review-stat">
            <span className="sched-review-stat-label">Confirmed</span>
            <span className="sched-review-stat-value sched-review-stat-value--confirmed">{stats.confirmed}</span>
          </div>
        </div>
      </div>
      <p className="sched-review-hint">
        <ClipboardCheck size={13} /> Check Unit, Tenant and Amount for schedules due on or before the bill date, then
        confirm each Charge Category. Run Billing invoices Confirmed schedules only; after billing they return to Active
        with the next billing date.
      </p>

      {isFetching && !review ? (
        <div className="billing-empty">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="billing-empty">
          No schedules due on or before {billDate}
          {categoryFilter ? ` in "${categoryOptions.find((o) => o.id === categoryFilter)?.label || categoryFilter}"` : ''}
          {currency ? ` (${currency})` : ''}.
        </div>
      ) : (
        categories.map((cat) => {
          const key = cat.categoryCode;
          const fullyConfirmed = cat.activeCount === 0 && cat.confirmedCount > 0;
          const invoicedCount = cat.schedules.filter((s) => s.alreadyInvoicedNumber).length;
          return (
            <div key={key} className={`sched-category-card${fullyConfirmed ? ' sched-category-card--confirmed' : ''}`}>
              <div className="sched-category-head">
                <div className="sched-category-toggle">
                  <span className="sched-category-name">{cat.categoryName}</span>
                  <span className="sched-category-count">{cat.activeCount + cat.confirmedCount} schedules</span>
                  {cat.confirmedCount > 0 && (
                    <span className="sched-status sched-status--confirmed">
                      <CheckCircle2 size={10} /> {fullyConfirmed ? 'Confirmed' : `${cat.confirmedCount} Confirmed`}
                    </span>
                  )}
                  {cat.activeCount > 0 && (
                    <span className="sched-status sched-status--active">
                      <CircleDot size={10} /> {cat.activeCount} Pending
                    </span>
                  )}
                  {invoicedCount > 0 && (
                    <span className="sched-status sched-status--paused" title="Already invoiced for this period — Run Billing will skip the invoice and only advance the next billing date">
                      <AlertTriangle size={10} /> {invoicedCount} Already Invoiced
                    </span>
                  )}
                </div>
                <div className="sched-category-actions">
                  <span className="sched-category-total">{totalsLabel(cat.totalsByCurrency)}</span>
                  {canWrite && cat.confirmedCount > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busyKey !== null} onClick={() => handleCategory(cat, 'unconfirm')}>
                      <RotateCcw size={13} /> Unconfirm
                    </button>
                  )}
                  {canWrite && cat.activeCount > 0 && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busyKey !== null} onClick={() => handleCategory(cat, 'confirm')}>
                      <CheckCircle2 size={13} /> {busyKey === `cat:${key}` ? 'Confirming…' : 'Confirm'}
                    </button>
                  )}
                </div>
              </div>

              {(
                <div className="sched-category-body">
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th>Floor / Unit</th>
                        <th>Tenant</th>
                        <th>Charge</th>
                        <th>Next Billing</th>
                        <th className="text-center">Qty</th>
                        <th className="text-right">Amount</th>
                        <th className="text-right">Total</th>
                        <th>Status</th>
                        {canWrite && <th className="text-center" />}
                      </tr>
                    </thead>
                    <tbody>
                      {cat.schedules.map((s) => (
                        <tr key={s.id} className={s.status === 'confirmed' ? 'sched-row--confirmed' : undefined}>
                          <td>
                            {s.unit ? (
                              <>
                                {s.unit.floorLabel && <div className="cell-secondary">{s.unit.floorLabel}</div>}
                                <div className="cell-primary">{s.unit.unitNumber}</div>
                              </>
                            ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                          <td><div className="cell-primary">{tenantName(s.tenant)}</div></td>
                          <td>
                            <div className="cell-primary">{s.chargeType.name}</div>
                            {s.description && s.description.trim() !== s.chargeType.name && (
                              <div className="cell-secondary">{s.description}</div>
                            )}
                            {s.alreadyInvoicedNumber && (
                              <div className="sched-row-warning"><AlertTriangle size={11} /> Already invoiced ({s.alreadyInvoicedNumber})</div>
                            )}
                            {s.isProrated && <div className="sched-row-note">First invoice is prorated</div>}
                          </td>
                          <td>{s.nextBillingDate ? format(new Date(`${s.nextBillingDate.split('T')[0]}T00:00:00`), 'MMM d, yyyy') : '—'}</td>
                          <td className="text-center">{Number(s.quantity) || 1}</td>
                          <td className="text-right">{fmt(s.amount)}</td>
                          <td className="text-right"><span className="cell-amount">{s.currency} {fmt(s.lineTotal)}</span></td>
                          <td>
                            <span className={`sched-status sched-status--${s.status}`}>
                              <CircleDot size={10} /> {s.status}
                            </span>
                          </td>
                          {canWrite && (
                            <td className="text-center">
                              <button
                                type="button"
                                className="action-btn"
                                disabled={busyKey !== null}
                                onClick={() => handleRow(s)}
                                title={s.status === 'confirmed' ? 'Revert to Active' : 'Confirm this schedule'}
                              >
                                {s.status === 'confirmed' ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
