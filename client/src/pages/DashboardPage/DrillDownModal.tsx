import { X, ExternalLink, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLazyGetDrillDownQuery } from '../../store/api/dashboardApi';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './DrillDownModal.css';

interface DrillDownModalProps {
  widgetCode: string;
  drillKey?: string;
  propertyId?: string;
  onClose: () => void;
}

export default function DrillDownModal({ widgetCode, drillKey, propertyId, onClose }: DrillDownModalProps) {
  const [fetchDrillDown, { data: response, isFetching, isError }] = useLazyGetDrillDownQuery();
  const [page, setPage] = useState(1);

  // Switching widget/breakdown/property starts a new result set — jump back to page 1.
  useEffect(() => {
    setPage(1);
  }, [widgetCode, drillKey, propertyId]);

  useEffect(() => {
    fetchDrillDown({ code: widgetCode, drillKey, propertyId, page });
  }, [widgetCode, drillKey, propertyId, page, fetchDrillDown]);

  const drillData = response?.data;
  const totalPages = drillData?.totalPages ?? 1;

  return (
    <div className="drilldown-overlay">
      <div className="drilldown-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drilldown-header">
          <div>
            <h3>{drillData?.title || 'Loading Details...'}</h3>
            {drillData && <span className="drilldown-subtitle">{drillData.total} records found</span>}
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="drilldown-body">
          {isFetching ? (
            <div className="drilldown-loading">
              <Loader2 size={32} className="spinner" />
              <p>Fetching detailed data...</p>
            </div>
          ) : isError ? (
            <div className="drilldown-error">
              <p>Failed to load drill-down data.</p>
              <button className="btn-primary" onClick={() => fetchDrillDown({ code: widgetCode, drillKey, propertyId, page })}>Retry</button>
            </div>
          ) : drillData && drillData.rows.length > 0 ? (
            <div className="drilldown-table-container">
              <table>
                <thead>
                  <tr>
                    {drillData.columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillData.rows.map((row, i) => (
                    <tr key={i}>
                      {drillData.columns.map((col) => (
                        <td key={col.key}>{String(row[col.key] || '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="drilldown-empty">
              <p>No detailed data available.</p>
            </div>
          )}
        </div>

        {drillData && (totalPages > 1 || drillData.navigateTo) && (
          <div className="drilldown-footer">
            {totalPages > 1 ? (
              <div className="drilldown-pagination">
                <button
                  className="icon-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isFetching}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="drilldown-page-info">Page {page} of {totalPages}</span>
                <button
                  className="icon-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isFetching}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : <span />}
            {drillData.navigateTo && (
              <Link to={drillData.navigateTo} className="drilldown-link-btn" onClick={onClose}>
                View Full Module <ExternalLink size={16} />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
