'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[GlobalError] Critical root layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen w-full flex flex-col items-center justify-center bg-black text-white p-6 font-sans">
        <div className="w-full max-w-md p-8 rounded-2xl bg-background border border-border shadow-2xl flex flex-col items-center text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-danger/20 border border-danger/30 flex items-center justify-center text-danger">
            <AlertCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Critical System Error</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Nexus failed to initialize the root application layout.
            </p>
          </div>

          <button
            onClick={() => reset()}
            className="w-full flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover active:bg-primary-hover/90 text-primary-foreground font-semibold text-xs transition-all shadow-lg active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Application</span>
          </button>
        </div>
      </body>
    </html>
  );
}
