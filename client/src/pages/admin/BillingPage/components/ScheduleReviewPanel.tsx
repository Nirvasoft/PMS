import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  CheckCircle2, RotateCcw, AlertTriangle, CircleDot,
  ChevronLeft, ChevronRight,
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
import { TableScrollWrapper } from './TableScrollWrapper';

const fmt = (n: string | number) => formatFullAmount(n, { minDecimals: 2, maxDecimals: 2 });

const tenantName = (t: BillingScheduleReviewRow['tenant']) =>
  (t.tenantType !== 'individual' ? t.companyName : t.lastName) || t.lastName || t.companyName || t.firstName || '—';

const totalsLabel = (totals: Record<string, number>) =>
  Object.entries(totals).map(([cur, amt]) => `${cur} ${fmt(amt)}`).join(' • ') || '—';

const computeTotals = (rows: BillingScheduleReviewRow[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const s of rows) {
    totals[s.currency] = Math.round(((totals[s.currency] || 0) + Number(s.lineTotal || 0)) * 100) / 100;
  }
  return totals;
};

interface Props {
  propertyId?: string;
  currency?: string;
  floorNumber?: number;
  billDate: string;
  search: string;
  initialCategory?: string;
}

/**
 * Review & Confirm: due schedules grouped by Charge Category. Staff check Unit, Tenant and
 * Amount, then Confirm — only Confirmed schedules are invoiced by Run Billing.
 */
export function ScheduleReviewPanel({ propertyId, currency, floorNumber, billDate, search, initialCategory }: Props) {
  const [categoryFilter, setCategoryFilter] = useState(initialCategory || '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const canWrite = usePermission('billing-schedules.write');
  const confirmDialog = useConfirm();
  const alertDialog = useAlertDialog();

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [billDate, categoryFilter, propertyId, currency, floorNumber, search]);

  const { data, isFetching } = useGetBillingScheduleReviewQuery({ asOfDate: billDate, propertyId, currency, floorNumber });
  const [setConfirmation] = useSetBillingScheduleConfirmationMutation();
  const review = data?.data;

  const { data: chargeCategoriesData } = useGetChargeCategoriesQuery(propertyId ? { propertyId } : undefined);

  const reviewByCategoryKey = useMemo(() => {
    const map = new Map<string, BillingScheduleReviewCategory>();
    for (const g of review?.categories ?? []) {
      map.set(g.categoryCode.trim().toLowerCase(), g);
    }
    return map;
  }, [review]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: Array<{
      id: string;
      label: string;
      activeCount: number;
      confirmedCount: number;
      totalDue: number;
    }> = [];

    for (const c of chargeCategoriesData?.data ?? []) {
      const key = c.code.trim().toLowerCase();
      if (!c.isActive || seen.has(key)) continue;
      seen.add(key);
      const rev = reviewByCategoryKey.get(key);
      const activeCount = rev?.activeCount ?? 0;
      const confirmedCount = rev?.confirmedCount ?? 0;
      opts.push({
        id: c.code,
        label: c.description?.trim() || c.code,
        activeCount,
        confirmedCount,
        totalDue: activeCount + confirmedCount,
      });
    }

    // Categories that only exist on due schedules (e.g. legacy codes) stay selectable too
    for (const g of review?.categories ?? []) {
      const key = g.categoryCode.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({
        id: g.categoryCode,
        label: g.categoryName,
        activeCount: g.activeCount,
        confirmedCount: g.confirmedCount,
        totalDue: g.activeCount + g.confirmedCount,
      });
    }

    // Categories with pending schedules first, then confirmed due categories, then empty
    return opts.sort((a, b) => {
      const pa = a.activeCount > 0 ? 0 : a.totalDue > 0 ? 1 : 2;
      const pb = b.activeCount > 0 ? 0 : b.totalDue > 0 ? 1 : 2;
      return pa - pb || a.label.localeCompare(b.label);
    });
  }, [chargeCategoriesData, review, reviewByCategoryKey]);

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
      const res = await setConfirmation({ asOfDate: billDate, propertyId, currency, floorNumber, ...body }).unwrap();
      toast.success(successMsg(res.data.updatedCount));
      setSelectedIds(new Set());
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

  const handleSelected = async (
    cat: BillingScheduleReviewCategory,
    rows: BillingScheduleReviewRow[],
    action: 'confirm' | 'unconfirm',
  ) => {
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const selectedTotals = computeTotals(rows);
    const msg = action === 'confirm'
      ? `Confirm ${ids.length} selected schedule(s) (${totalsLabel(selectedTotals)}) in "${cat.categoryName}"?`
      : `Revert ${ids.length} selected schedule(s) in "${cat.categoryName}" back to Active?`;
    if (!(await confirmDialog(msg, { confirmText: action === 'confirm' ? 'Confirm' : 'Unconfirm' }))) return;
    await run(`bulk:${action}`, { action, scheduleIds: ids }, (n) =>
      action === 'confirm'
        ? `Confirmed ${n} selected schedule(s).`
        : `Reverted ${n} selected schedule(s) to Active.`,
    );
  };

  const handleRow = (s: BillingScheduleReviewRow) => {
    const action = s.status === 'confirmed' ? 'unconfirm' : 'confirm';
    return run(`row:${s.id}`, { action, scheduleIds: [s.id] }, () =>
      action === 'confirm' ? 'Schedule confirmed.' : 'Schedule reverted to Active.',
    );
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (rows: BillingScheduleReviewRow[]) => {
    const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
    setSelectedIds(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  };

  return (
    <div className="sched-review">
      {/* Charge Category Quick Pills */}
      {categoryOptions.length > 0 && (
        <div className="sched-cat-pills" role="tablist" aria-label="Charge Categories">
          {categoryOptions.map((opt) => {
            const isActive = opt.id.trim().toLowerCase() === categoryFilter.trim().toLowerCase();
            const isAllConfirmed = opt.activeCount === 0 && opt.confirmedCount > 0;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`sched-cat-pill${isActive ? ' active' : ''}${opt.totalDue === 0 ? ' is-empty' : ''}`}
                onClick={() => setCategoryFilter(opt.id)}
              >
                <span>{opt.label}</span>
                {opt.activeCount > 0 ? (
                  <span
                    className="sched-cat-pill-badge sched-cat-pill-badge--pending"
                    title={`${opt.activeCount} pending review`}
                  >
                    {opt.activeCount}
                  </span>
                ) : isAllConfirmed ? (
                  <span
                    className="sched-cat-pill-badge sched-cat-pill-badge--confirmed"
                    title={`${opt.confirmedCount} confirmed`}
                  >
                    <CheckCircle2 size={11} />
                  </span>
                ) : (
                  <span className="sched-cat-pill-badge sched-cat-pill-badge--zero">0</span>
                )}
              </button>
            );
          })}
        </div>
      )}

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
          const totalCount = cat.schedules.length;
          const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
          const currentPage = Math.min(page, totalPages);
          const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
          const endItem = Math.min(currentPage * pageSize, totalCount);
          const pagedSchedules = cat.schedules.slice((currentPage - 1) * pageSize, currentPage * pageSize);

          const selectedRows = cat.schedules.filter((s) => selectedIds.has(s.id));
          const selectedPending = selectedRows.filter((s) => s.status !== 'confirmed');
          const selectedConfirmed = selectedRows.filter((s) => s.status === 'confirmed');
          const allSelected = cat.schedules.length > 0 && selectedRows.length === cat.schedules.length;
          const someSelected = selectedRows.length > 0;
          const displayedTotals = someSelected ? computeTotals(selectedRows) : cat.totalsByCurrency;

          return (
            <div key={key} className={`sched-category-card${fullyConfirmed ? ' sched-category-card--confirmed' : ''}`}>
              <div className="sched-category-head">
                <div className="sched-category-toggle">
                  {someSelected ? (
                    <>
                      <span className="sched-selected-pill">{selectedRows.length} selected</span>
                      <button
                        type="button"
                        className="btn-ghost sched-clear-sel-btn"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="sched-category-name">{cat.categoryName}</span>
                      <span className="sched-category-count">{cat.activeCount + cat.confirmedCount} due</span>
                      {cat.activeCount > 0 && (
                        <span className="sched-status sched-status--active">
                          <CircleDot size={10} /> {cat.activeCount} Pending
                        </span>
                      )}
                      {cat.confirmedCount > 0 && (
                        <span className="sched-status sched-status--confirmed">
                          <CheckCircle2 size={10} /> {fullyConfirmed ? 'All Confirmed' : `${cat.confirmedCount} Confirmed`}
                        </span>
                      )}
                      {invoicedCount > 0 && (
                        <span className="sched-status sched-status--paused" title="Already invoiced for this period — Run Billing will skip the invoice and only advance the next billing date">
                          <AlertTriangle size={10} /> {invoicedCount} Already Invoiced
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="sched-category-actions">
                  <span className="sched-category-total">{totalsLabel(displayedTotals)}</span>
                  {canWrite && someSelected ? (
                    <>
                      {selectedConfirmed.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busyKey !== null}
                          onClick={() => handleSelected(cat, selectedConfirmed, 'unconfirm')}
                        >
                          <RotateCcw size={13} /> Unconfirm ({selectedConfirmed.length})
                        </button>
                      )}
                      {selectedPending.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyKey !== null}
                          onClick={() => handleSelected(cat, selectedPending, 'confirm')}
                        >
                          <CheckCircle2 size={13} /> {busyKey === 'bulk:confirm' ? 'Confirming…' : `Confirm (${selectedPending.length})`}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {canWrite && cat.confirmedCount > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busyKey !== null} onClick={() => handleCategory(cat, 'unconfirm')}>
                          <RotateCcw size={13} /> Unconfirm All
                        </button>
                      )}
                      {canWrite && cat.activeCount > 0 && (
                        <button type="button" className="btn btn-primary btn-sm" disabled={busyKey !== null} onClick={() => handleCategory(cat, 'confirm')}>
                          <CheckCircle2 size={13} /> {busyKey === `cat:${key}` ? 'Confirming…' : `Confirm All (${cat.activeCount})`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="sched-category-body">
                <TableScrollWrapper>
                  <table className="billing-table">
                    <thead>
                      <tr>
                        {canWrite && (
                          <th style={{ width: 40, paddingLeft: 12 }}>
                            <input
                              type="checkbox"
                              className="inv-checkbox"
                              checked={allSelected}
                              disabled={cat.schedules.length === 0}
                              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                              onChange={() => toggleSelectAll(cat.schedules)}
                              title={`Select all ${cat.schedules.length} schedule(s) in ${cat.categoryName}`}
                            />
                          </th>
                        )}
                        <th>Floor / Unit</th>
                        <th>Tenant</th>
                        <th>Charge</th>
                        <th>Next Billing</th>
                        <th className="text-center">Qty</th>
                        <th className="text-right">Amount</th>
                        <th className="text-right">Total</th>
                        <th>Status</th>
                        {canWrite && <th className="text-center" style={{ width: 56 }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSchedules.map((s) => {
                        const isChecked = selectedIds.has(s.id);
                        const rowClass = [
                          isChecked ? 'row-selected' : '',
                          s.status === 'confirmed' ? 'sched-row--confirmed' : '',
                        ].filter(Boolean).join(' ') || undefined;

                        return (
                          <tr key={s.id} className={rowClass}>
                            {canWrite && (
                              <td style={{ paddingLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="inv-checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleRowSelection(s.id)}
                                  title="Select schedule"
                                />
                              </td>
                            )}
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
                        );
                      })}
                    </tbody>
                  </table>
                </TableScrollWrapper>

                {totalCount >= 10 && (
                  <div className="billing-pagination">
                    <div className="pagination-left">
                      <div className="page-size-selector">
                        <label htmlFor={`review-page-size-${key}`}>Rows per page:</label>
                        <select
                          id={`review-page-size-${key}`}
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(1);
                          }}
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                      <span className="page-info">
                        Showing {startItem}–{endItem} of {totalCount}
                      </span>
                    </div>

                    <div className="page-btns">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(Math.max(1, currentPage - 1))}
                        title="Previous page"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <span className="page-num-display">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                        title="Next page"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
