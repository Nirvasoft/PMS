import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ConfirmOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type AlertOptions = {
  title?: string;
  buttonText?: string;
};

type DialogRequest =
  | { kind: 'confirm'; message: string; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'alert'; message: string; options: AlertOptions; resolve: () => void };

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;
type AlertFn = (message: string, options?: AlertOptions) => Promise<void>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const AlertContext = createContext<AlertFn | null>(null);

/** Modal replacement for window.confirm — resolves true/false, cancel-safe on backdrop click and Escape. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used within DialogProvider');
  return fn;
}

/** Modal replacement for window.alert. */
export function useAlertDialog(): AlertFn {
  const fn = useContext(AlertContext);
  if (!fn) throw new Error('useAlertDialog must be used within DialogProvider');
  return fn;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);

  const enqueue = useCallback((request: DialogRequest) => {
    setCurrent((active) => {
      if (active) {
        queueRef.current.push(request);
        return active;
      }
      return request;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setCurrent((active) => {
      if (!active) return null;
      if (active.kind === 'confirm') active.resolve(result);
      else active.resolve();
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const confirmDialog = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      enqueue({ kind: 'confirm', message, options, resolve });
    });
  }, [enqueue]);

  const alertDialog = useCallback<AlertFn>((message, options = {}) => {
    return new Promise<void>((resolve) => {
      enqueue({ kind: 'alert', message, options, resolve });
    });
  }, [enqueue]);

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, settle]);

  return (
    <ConfirmContext.Provider value={confirmDialog}>
      <AlertContext.Provider value={alertDialog}>
        {children}
        {current && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2>{current.options.title || (current.kind === 'confirm' ? 'Confirm' : 'Notice')}</h2>
                <button type="button" className="btn-icon" onClick={() => settle(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{current.message}</p>
                <div className="modal-actions" style={{ gap: 12 }}>
                  {current.kind === 'confirm' && (
                    <button type="button" className="btn" onClick={() => settle(false)}>
                      {current.options.cancelText || 'Cancel'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn ${current.kind === 'confirm' && current.options.danger ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => settle(true)}
                    autoFocus
                  >
                    {current.kind === 'confirm' ? (current.options.confirmText || 'Confirm') : (current.options.buttonText || 'OK')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AlertContext.Provider>
    </ConfirmContext.Provider>
  );
}
