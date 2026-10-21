import { useEffect, useState } from 'react';
import { apiSlices, useAppSelector } from '../store';

// Unpaginated heavy report/matrix endpoints that always process large datasets
const HEAVY_REPORT_ENDPOINTS = new Set([
  'getAgingReport',
  'getTrialBalance',
  'getPnL',
  'getBalanceSheet',
  'getCashFlow',
  'getFloorPlan',
  'getGlAccounts',
]);

// Paginated list endpoints — only show the global loading overlay when fetching
// bulk rows (e.g. `all: true` or `limit > 100` for reports/exports), not for 10/20/50-row pages
const PAGINATED_LIST_ENDPOINTS = new Set([
  'getInvoices',
  'getBillingSchedules',
  'getMeterSetups',
  'getReceipts',
  'getRefunds',
  'getCredits',
  'getApInvoices',
  'getPaymentVouchers',
  'getExpenses',
  'getJournalEntries',
  'getStatementLines',
  'getGatewayTransactions',
  'getAssets',
  'getProperties',
  'getUnits',
  'getLeases',
  'getTenants',
  'getTickets',
  'getWorkOrders',
  'getFacilityAssets',
  'getInventoryItems',
  'getMovements',
  'getSlots',
  'getSlotsAll',
  'getAllocations',
  'getLeads',
  'getUsers',
  'getAuditLogs',
]);

function isHeavyQuery(endpointName: string, args: any): boolean {
  if (HEAVY_REPORT_ENDPOINTS.has(endpointName)) {
    return true;
  }
  if (PAGINATED_LIST_ENDPOINTS.has(endpointName)) {
    if (!args || typeof args !== 'object') return false;
    if (args.all === true || args.all === 'true' || args.includeTotals === true) return true;
    if (typeof args.limit === 'number' && args.limit > 100) return true;
    return false;
  }
  return false;
}

export function GlobalLoadingIndicator() {
  const hasHeavyListPending = useAppSelector((state) => {
    if (!state.auth?.isAuthenticated || state.auth?.isLoading) {
      return false;
    }

    const root = state as Record<string, any>;

    for (const api of apiSlices) {
      const slice = root[api.reducerPath];
      if (!slice?.queries) continue;

      const subs = slice.subscriptions || {};
      for (const key in slice.queries) {
        const q = slice.queries[key];
        if (!q || q.status !== 'pending') continue;
        if (!isHeavyQuery(q.endpointName, q.originalArgs)) continue;

        // Only trigger when uncached (no existing data rendered yet)
        if (q.data !== undefined) continue;

        // Only track queries that still have an active mounted subscriber
        const keySubs = subs[key];
        if (!keySubs || Object.keys(keySubs).length === 0) continue;

        return true;
      }
    }
    return false;
  });

  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!hasHeavyListPending) {
      setShowLoading(false);
      return;
    }
    // Only display loading effect when a heavy list query takes longer than 400ms
    const showTimer = window.setTimeout(() => {
      setShowLoading(true);
    }, 400);
    const maxTimer = window.setTimeout(() => {
      setShowLoading(false);
    }, 12000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(maxTimer);
    };
  }, [hasHeavyListPending]);

  if (!showLoading) return null;

  return (
    <>
      <div className="global-loading-bar" role="progressbar" aria-label="Loading data">
        <div className="global-loading-bar-track" />
      </div>
      <div className="global-loading-overlay" aria-live="polite" aria-busy="true">
        <div className="global-loading-card">
          <div className="global-loading-spinner" />
          <div className="global-loading-text-group">
            <span className="global-loading-title">Loading data…</span>
            <span className="global-loading-subtitle">Please wait a moment</span>
          </div>
        </div>
      </div>
    </>
  );
}

