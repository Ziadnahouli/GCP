'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'default' | 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  title?: string;
  description: string;
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: ToastItem[];
  toast: (item: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

const MAX_TOASTS = 3;
const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = React.useCallback((id: string) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ duration = 4000, ...rest }: Omit<ToastItem, 'id'>) => {
      // Deduplicate: if an identical notification is already active, don't stack duplicates
      let isDuplicate = false;
      setToasts((prev) => {
        const dupIndex = prev.findIndex(
          (t) => t.title === rest.title && t.description === rest.description
        );
        if (dupIndex !== -1) {
          isDuplicate = true;
          // Refresh existing timer
          const existingId = prev[dupIndex].id;
          const oldTimer = timersRef.current.get(existingId);
          if (oldTimer) clearTimeout(oldTimer);
          if (duration > 0) {
            const newTimer = setTimeout(() => {
              removeToast(existingId);
            }, duration);
            timersRef.current.set(existingId, newTimer);
          }
          return prev;
        }

        const id = Math.random().toString(36).substring(2, 9);
        const newToast: ToastItem = { id, duration, ...rest };

        if (duration > 0) {
          const timer = setTimeout(() => {
            removeToast(id);
          }, duration);
          timersRef.current.set(id, timer);
        }

        const next = [...prev, newToast];
        // Enforce maximum visible toasts cap (drop oldest if exceeding MAX_TOASTS)
        if (next.length > MAX_TOASTS) {
          const toRemove = next.slice(0, next.length - MAX_TOASTS);
          toRemove.forEach((item) => {
            const t = timersRef.current.get(item.id);
            if (t) {
              clearTimeout(t);
              timersRef.current.delete(item.id);
            }
          });
          return next.slice(-MAX_TOASTS);
        }
        return next;
      });
    },
    [removeToast]
  );

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const contextValue = React.useMemo(() => ({ toasts, toast, removeToast }), [toasts, toast, removeToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[999999] flex flex-col justify-end gap-2 max-w-sm w-full pointer-events-none p-2 max-h-[calc(100vh-2rem)] overflow-hidden"
        aria-live="polite"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl bg-surface-panel text-foreground backdrop-blur-md transition-all animate-in slide-in-from-bottom-5 fade-in duration-200 border-white/[0.08]',
              item.type === 'error' && 'border-rose-500/30 bg-rose-950/25 text-rose-200',
              item.type === 'success' && 'border-emerald-500/30 bg-emerald-950/25 text-emerald-200',
              item.type === 'info' && 'border-primary/30 bg-primary/10 text-foreground',
              (!item.type || item.type === 'default') && 'border-white/[0.08] bg-surface-panel'
            )}
          >
            {item.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            {item.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {item.type === 'info' && <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />}

            <div className="flex-1">
              {item.title && <h5 className="font-semibold text-sm leading-tight mb-1">{item.title}</h5>}
              <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              {item.action && (
                <button
                  onClick={() => {
                    item.action?.onClick();
                    removeToast(item.id);
                  }}
                  className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-md bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  {item.action.label}
                </button>
              )}
            </div>

            <button
              onClick={() => removeToast(item.id)}
              className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1 rounded-md transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      toast: () => {},
      removeToast: () => {},
    };
  }
  return context;
}
