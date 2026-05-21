import { X, ExternalLink, Loader2 } from 'lucide-react';
import { useLazyGetDrillDownQuery } from '../../store/api/dashboardApi';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './DrillDownModal.css';

interface DrillDownModalProps {
  widgetCode: string;
  drillKey?: string;
  onClose: () => void;
}

export default function DrillDownModal({ widgetCode, drillKey, onClose }: DrillDownModalProps) {
  const [fetchDrillDown, { data: response, isFetching, isError }] = useLazyGetDrillDownQuery();

  useEffect(() => {
    fetchDrillDown({ code: widgetCode, drillKey });
  }, [widgetCode, drillKey, fetchDrillDown]);

  const drillData = response?.data;

  return (
    <div className="drilldown-overlay" onClick={onClose}>
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
              <button className="btn-primary" onClick={() => fetchDrillDown({ code: widgetCode, drillKey })}>Retry</button>
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

        {drillData?.navigateTo && (
          <div className="drilldown-footer">
            <Link to={drillData.navigateTo} className="drilldown-link-btn" onClick={onClose}>
              View Full Module <ExternalLink size={16} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
