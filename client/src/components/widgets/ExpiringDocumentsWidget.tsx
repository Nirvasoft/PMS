import { useState } from 'react';
import { useGetExpiringDocumentsQuery } from '../../store/api/documentsApi';
import type { DocumentItem } from '../../store/api/documentsApi';
import {
  AlertTriangle, FileText, Clock, ChevronRight, File,
  Image, FileSpreadsheet, RefreshCw,
} from 'lucide-react';
import './ExpiringDocumentsWidget.css';

function getFileIcon(mimeType: string, size = 16) {
  if (mimeType.startsWith('image/')) return <Image size={size} className="file-icon image" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet size={size} className="file-icon spreadsheet" />;
  if (mimeType === 'application/pdf') return <FileText size={size} className="file-icon pdf" />;
  return <File size={size} className="file-icon default" />;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getUrgencyClass(days: number | undefined): string {
  if (days === undefined || days === null) return 'ok';
  if (days <= 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

/**
 * Expiring Documents Widget — A reusable dashboard widget.
 *
 * Props:
 * - days:  How many days ahead to look (default 30)
 * - limit: Max documents to show (default 8)
 * - onViewAll: Callback when "View All" is clicked (e.g., navigate to /documents?tab=expiring)
 */
export default function ExpiringDocumentsWidget({
  days = 30,
  limit = 8,
  onViewAll,
}: {
  days?: number;
  limit?: number;
  onViewAll?: () => void;
}) {
  const [page] = useState(1);
  const { data, isLoading, refetch } = useGetExpiringDocumentsQuery({ days, page });
  const documents = data?.data || [];
  const total = data?.meta?.total || 0;

  // Stats
  const expired = documents.filter((d) => (d.daysUntilExpiry ?? 999) <= 0).length;
  const critical = documents.filter((d) => (d.daysUntilExpiry ?? 999) > 0 && (d.daysUntilExpiry ?? 999) <= 7).length;
  const warning = documents.filter((d) => (d.daysUntilExpiry ?? 999) > 7 && (d.daysUntilExpiry ?? 999) <= 30).length;

  return (
    <div className="expiring-widget">
      {/* Header */}
      <div className="expiring-widget-header">
        <div className="expiring-header-left">
          <AlertTriangle size={18} className="expiring-icon" />
          <div>
            <h3>Expiring Documents</h3>
            <span className="expiring-subtitle">Next {days} days</span>
          </div>
        </div>
        <div className="expiring-header-right">
          <button className="widget-refresh-btn" onClick={() => refetch()} title="Refresh">
            <RefreshCw size={14} />
          </button>
          {total > 0 && (
            <span className="expiring-total-badge">{total}</span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="expiring-stats">
          {expired > 0 && (
            <div className="stat-chip expired">
              <span className="stat-dot" /> {expired} Expired
            </div>
          )}
          {critical > 0 && (
            <div className="stat-chip critical">
              <span className="stat-dot" /> {critical} &lt; 7 days
            </div>
          )}
          {warning > 0 && (
            <div className="stat-chip warning">
              <span className="stat-dot" /> {warning} &lt; 30 days
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="expiring-widget-body">
        {isLoading ? (
          <div className="expiring-loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="expiring-skeleton" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="expiring-empty">
            <Clock size={32} />
            <p>No documents expiring within {days} days</p>
          </div>
        ) : (
          <div className="expiring-list">
            {documents.slice(0, limit).map((doc: DocumentItem) => {
              const urgency = getUrgencyClass(doc.daysUntilExpiry);
              return (
                <div key={doc.id} className={`expiring-item urgency-${urgency}`}>
                  <div className="expiring-item-icon">
                    {getFileIcon(doc.mimeType)}
                  </div>
                  <div className="expiring-item-info">
                    <span className="expiring-item-name">{doc.name}</span>
                    <span className="expiring-item-meta">
                      {doc.category && <span className="exp-category">{doc.category}</span>}
                      {doc.fileSizeFormatted}
                    </span>
                  </div>
                  <div className={`expiring-item-badge ${urgency}`}>
                    <Clock size={11} />
                    {doc.daysUntilExpiry != null && doc.daysUntilExpiry <= 0
                      ? 'Expired'
                      : `${doc.daysUntilExpiry ?? '?'}d`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {total > limit && onViewAll && (
        <button className="expiring-view-all" onClick={onViewAll}>
          View all {total} documents <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
