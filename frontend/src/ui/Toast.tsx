import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastTone = 'success' | 'danger' | 'info';

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
};

type ToastInput = {
  tone?: ToastTone;
  message: string;
  title?: string;
  durationMs?: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timeout = timeouts.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.current.delete(id);
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const t of timeouts.current.values()) clearTimeout(t);
      timeouts.current.clear();
    };
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextIdRef.current++;
      const toast: Toast = {
        id,
        tone: input.tone ?? 'info',
        message: input.message,
        title: input.title,
      };
      setToasts((prev) => [...prev, toast]);
      const duration = input.durationMs ?? DEFAULT_DURATION_MS;
      if (duration > 0) {
        const timeout = setTimeout(() => dismiss(id), duration);
        timeouts.current.set(id, timeout);
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: (input) => push(input),
      success: (message, title) => push({ tone: 'success', message, title }),
      error: (message, title) => push({ tone: 'danger', message, title }),
      info: (message, title) => push({ tone: 'info', message, title }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ax-toast-viewport" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className="ax-toast" data-tone={toast.tone} role="status">
      <div className="ax-toast-icon" aria-hidden>
        {toast.tone === 'success' ? <IconCheck /> : toast.tone === 'danger' ? <IconAlert /> : <IconInfo />}
      </div>
      <div className="ax-toast-body">
        {toast.title ? <div className="ax-toast-title">{toast.title}</div> : null}
        <div className="ax-toast-message">{toast.message}</div>
      </div>
      <button type="button" className="ax-toast-close" aria-label="Dismiss" onClick={onDismiss}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return ctx;
}

function IconCheck() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 10.5l3 3 7-7.5" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5 18 16H2L10 2.5Z" />
      <path d="M10 8v3" />
      <circle cx="10" cy="13.5" r="0.8" fill="currentColor" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5M10 6.5v.2" />
    </svg>
  );
}
