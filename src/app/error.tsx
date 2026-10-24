'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[RootError] Application render error:', error);
  }, [error]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-6 select-none">
      <div className="w-full max-w-md p-8 rounded-2xl bg-card border border-white/10 shadow-2xl flex flex-col items-center text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-destructive/20 border border-destructive/30 flex items-center justify-center text-destructive shadow-glow-sm">
          <AlertCircle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Something went wrong</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Nexus encountered an unexpected error. You can attempt to recover the session or return to the lobby.
          </p>
          {error?.message && (
            <p className="text-[11px] font-mono text-muted-foreground/80 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 break-all mt-2">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 w-full pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all shadow-glow-sm active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/';
            }}
            className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs transition-all border border-white/10 active:scale-95"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Go to Lobby</span>
          </button>
        </div>
      </div>
    </div>
  );
}
