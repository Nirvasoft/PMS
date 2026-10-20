import { useEffect, useState } from 'react';
import { apiSlices, useAppSelector } from '../store';

const IGNORED_SLICE_PATHS = new Set([
  'authApi',
  'dashboardApi',
  'notificationsApi',
]);

const SILENT_ENDPOINTS = new Set([
  'getUnreadCount',
  'getNotifications',
  'getMyPropertyScope',
  'getExpiringDocuments',
  'getIntegrations',
]);

export function GlobalLoadingIndicator() {
  const { hasAnyPending, hasUncachedPending } = useAppSelector((state) => {
    if (!state.auth?.isAuthenticated || state.auth?.isLoading) {
      return { hasAnyPending: false, hasUncachedPending: false };
    }

    const root = state as Record<string, any>;
    let anyPending = false;
    let uncachedPending = false;

    for (const api of apiSlices) {
      if (IGNORED_SLICE_PATHS.has(api.reducerPath)) continue;

      const slice = root[api.reducerPath];
      if (!slice) continue;

      if (slice.queries) {
        const subs = slice.subscriptions || {};
        for (const key in slice.queries) {
          const q = slice.queries[key];
          if (!q || q.status !== 'pending') continue;
          if (SILENT_ENDPOINTS.has(q.endpointName)) continue;

          // Only track queries that still have an active mounted subscriber
          const keySubs = subs[key];
          if (keySubs && Object.keys(keySubs).length === 0) continue;

          anyPending = true;
          if (q.data === undefined) {
            uncachedPending = true;
          }
        }
      }

      if (slice.mutations) {
        for (const key in slice.mutations) {
          const m = slice.mutations[key];
          if (m && m.status === 'pending' && !SILENT_ENDPOINTS.has(m.endpointName)) {
            anyPending = true;
            uncachedPending = true;
          }
        }
      }
    }
    return { hasAnyPending: anyPending, hasUncachedPending: uncachedPending };
  });

  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!hasUncachedPending) {
      setShowOverlay(false);
      return;
    }
    const showTimer = window.setTimeout(() => {
      setShowOverlay(true);
    }, 250);
    const maxTimer = window.setTimeout(() => {
      setShowOverlay(false);
    }, 12000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(maxTimer);
    };
  }, [hasUncachedPending]);

  if (!hasAnyPending && !showOverlay) return null;

  return (
    <>
      {hasAnyPending && (
        <div className="global-loading-bar" role="progressbar" aria-label="Loading data">
          <div className="global-loading-bar-track" />
        </div>
      )}
      {showOverlay && (
        <div className="global-loading-overlay" aria-live="polite" aria-busy="true">
          <div className="global-loading-card">
            <div className="global-loading-spinner" />
            <div className="global-loading-text-group">
              <span className="global-loading-title">Loading data…</span>
              <span className="global-loading-subtitle">Please wait a moment</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
