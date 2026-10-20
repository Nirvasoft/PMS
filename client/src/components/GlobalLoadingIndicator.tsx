import { useEffect, useState } from 'react';
import { apiSlices, useAppSelector } from '../store';

const SILENT_ENDPOINTS = new Set(['getUnreadCount']);

export function GlobalLoadingIndicator() {
  const isPending = useAppSelector((state) => {
    const root = state as Record<string, any>;
    for (const api of apiSlices) {
      const slice = root[api.reducerPath];
      if (!slice) continue;

      if (slice.queries) {
        for (const key in slice.queries) {
          const q = slice.queries[key];
          if (q && q.status === 'pending' && !SILENT_ENDPOINTS.has(q.endpointName)) {
            return true;
          }
        }
      }

      if (slice.mutations) {
        for (const key in slice.mutations) {
          const m = slice.mutations[key];
          if (m && m.status === 'pending' && !SILENT_ENDPOINTS.has(m.endpointName)) {
            return true;
          }
        }
      }
    }
    return false;
  });

  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setShowOverlay(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowOverlay(true);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isPending]);

  if (!isPending && !showOverlay) return null;

  return (
    <>
      {isPending && (
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
