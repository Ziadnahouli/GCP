'use client';

import * as React from 'react';
import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOffline = () => {
      setIsOffline(true);
    };

    const handleOnline = () => {
      setIsOffline(false);
      toast({
        title: 'Connection Restored',
        description: 'You are back online. Realtime squad sync active.',
        type: 'success',
      });
    };

    if (!navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [toast]);

  const handleRetry = async () => {
    setIsChecking(true);
    try {
      if (typeof window !== 'undefined' && navigator.onLine) {
        setIsOffline(false);
        toast({
          title: 'Connected',
          description: 'Network connectivity re-established.',
          type: 'success',
        });
      } else {
        toast({
          title: 'Still Offline',
          description: 'Could not establish connection to the gaming network.',
          type: 'error',
        });
      }
    } finally {
      setTimeout(() => setIsChecking(false), 500);
    }
  };

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 px-4 py-2 flex items-center justify-between z-50 text-xs backdrop-blur-md animate-in slide-in-from-top-2 duration-200"
    >
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="w-4 h-4 shrink-0 text-amber-400 animate-pulse" />
        <span className="font-semibold">Network Connection Lost</span>
        <span className="hidden sm:inline text-amber-300/80">
          — Realtime chat and voice updates may be delayed.
        </span>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={handleRetry}
        disabled={isChecking}
        className="h-6 px-2 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 shrink-0"
      >
        <RefreshCw className={`w-3 h-3 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
        Reconnect
      </Button>
    </div>
  );
}
