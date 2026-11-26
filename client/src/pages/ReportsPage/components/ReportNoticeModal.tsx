import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, SearchX, X } from 'lucide-react';

export interface ReportNoticeState {
  variant: 'empty' | 'error';
  title: string;
  message: string;
}

interface ReportNoticeModalProps {
  notice: ReportNoticeState | null;
  onClose: () => void;
  onReset?: () => void;
}

export function ReportNoticeModal({ notice, onClose, onReset }: ReportNoticeModalProps) {
  useEffect(() => {
    if (!notice) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [notice, onClose]);

  if (!notice) return null;

  const isError = notice.variant === 'error';

  return (
    <div
      className="rp-notice-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rp-notice-title"
      onClick={onClose}
    >
      <div className="rp-notice-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="rp-notice-close"
          onClick={onClose}
          aria-label="Close notice"
        >
          <X size={16} />
        </button>

        <div className={`rp-notice-icon rp-notice-icon--${notice.variant}`}>
          {isError ? <AlertTriangle size={22} /> : <SearchX size={22} />}
        </div>

        <h3 id="rp-notice-title" className="rp-notice-title">
          {notice.title}
        </h3>
        <p className="rp-notice-desc">{notice.message}</p>

        <div className="rp-notice-actions">
          {!isError && onReset && (
            <button
              type="button"
              className="btn btn-ghost rp-notice-btn-reset"
              onClick={() => {
                onReset();
                onClose();
              }}
            >
              <RotateCcw size={14} /> Reset Filters
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary rp-notice-btn-ok"
            onClick={onClose}
          >
            OK, Got It
          </button>
        </div>
      </div>
    </div>
  );
}
