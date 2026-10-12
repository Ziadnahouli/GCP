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

const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ duration = 4000, ...rest }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, duration, ...rest };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl bg-card text-foreground backdrop-blur-md transition-all animate-in slide-in-from-bottom-5 fade-in duration-200',
              item.type === 'error' && 'border-rose-500/50 bg-rose-950/20 text-rose-200',
              item.type === 'success' && 'border-emerald-500/50 bg-emerald-950/20 text-emerald-200',
              item.type === 'info' && 'border-primary/50 bg-primary/10 text-primary-foreground',
              (!item.type || item.type === 'default') && 'border-border bg-card'
            )}
          >
            {item.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
            {item.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
            {item.type === 'info' && <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />}

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
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
