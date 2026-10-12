'use client';

import * as React from 'react';
import { debugLogger, LogEntry, LogLevel, LogCategory } from '@/lib/logger/debug-logger';
import { getBrowserClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';

export function useDiagnosticsLogs() {
  const [logs, setLogs] = React.useState<LogEntry[]>(() => debugLogger.getLogs());
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedLevel, setSelectedLevel] = React.useState<string>('all');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isAutoScroll, setIsAutoScroll] = React.useState(true);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = React.useState(false);
  const [diagnosticsSummary, setDiagnosticsSummary] = React.useState<{
    authValid: boolean;
    authEmail?: string;
    authExpiresIn?: string;
    dbPingMs: number;
    dbOk: boolean;
    realtimeChannels: { topic: string; state: string }[];
  } | null>(null);

  const supabase = React.useMemo(() => getBrowserClient(), []);
  const { toast } = useToast();

  React.useEffect(() => {
    const unsubscribe = debugLogger.subscribe((newEntry) => {
      setLogs((prev) => [...prev, newEntry]);
    });
    return () => unsubscribe();
  }, []);

  // Keyboard shortcut: Ctrl + ~ or Ctrl + ` or Alt + L to toggle logs window
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && (e.key === '`' || e.key === '~')) ||
        (e.altKey && (e.key === 'l' || e.key === 'L'))
      ) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen to custom DOM event 'nexus:open-logs'
  React.useEffect(() => {
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener('nexus:open-logs', handleOpenEvent);
    return () => window.removeEventListener('nexus:open-logs', handleOpenEvent);
  }, []);

  const errorCount = React.useMemo(() => {
    return logs.filter((l) => l.level === 'error').length;
  }, [logs]);

  const warningCount = React.useMemo(() => {
    return logs.filter((l) => l.level === 'warn').length;
  }, [logs]);

  const filteredLogs = React.useMemo(() => {
    return logs.filter((entry) => {
      // Level filter
      if (selectedLevel !== 'all' && entry.level !== selectedLevel) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'all' && entry.category !== selectedCategory) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesMsg = entry.message.toLowerCase().includes(query);
        const matchesCat = entry.category.toLowerCase().includes(query);
        const matchesDetails = entry.details
          ? JSON.stringify(entry.details).toLowerCase().includes(query)
          : false;
        return matchesMsg || matchesCat || matchesDetails;
      }
      return true;
    });
  }, [logs, selectedLevel, selectedCategory, searchQuery]);

  const runDiagnostics = React.useCallback(async () => {
    setIsRunningDiagnostics(true);
    try {
      const summary = await debugLogger.runSystemDiagnostics(supabase);
      setDiagnosticsSummary(summary);
      toast({
        title: summary.dbOk ? 'Diagnostics Passed' : 'Diagnostics Detected Errors',
        description: `DB Ping: ${summary.dbPingMs}ms | Auth: ${summary.authValid ? 'Valid' : 'Invalid'} | Channels: ${summary.realtimeChannels.length}`,
        type: summary.dbOk ? 'success' : 'error',
      });
    } catch (err: any) {
      debugLogger.error('system', `Diagnostics execution failed: ${err.message}`, err);
    } finally {
      setIsRunningDiagnostics(false);
    }
  }, [supabase, toast]);

  const refreshAuthSession = React.useCallback(async () => {
    debugLogger.info('auth', 'Manually triggering supabase.auth.refreshSession()...');
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        debugLogger.error('auth', `Manual refreshSession failed: ${error.message}`, error);
        toast({
          title: 'Session Refresh Failed',
          description: error.message,
          type: 'error',
        });
      } else {
        debugLogger.success(
          'auth',
          `Session refreshed successfully. New expires_at: ${
            data.session?.expires_at
              ? new Date(data.session.expires_at * 1000).toLocaleTimeString()
              : 'N/A'
          }`,
          data.session
        );
        toast({
          title: 'Session Refreshed',
          description: 'Auth token renewed successfully.',
          type: 'success',
        });
      }
    } catch (ex: any) {
      debugLogger.error('auth', `Exception during refreshSession: ${ex.message}`, ex);
    }
  }, [supabase, toast]);

  const reconnectRealtime = React.useCallback(() => {
    debugLogger.info('realtime', 'Attempting Realtime reconnection...');
    try {
      const channels = typeof supabase.getChannels === 'function' ? supabase.getChannels() : [];
      debugLogger.info('realtime', `Unsubscribing ${channels.length} existing channels...`);
      channels.forEach((ch: any) => {
        try {
          supabase.removeChannel(ch);
        } catch {}
      });
      debugLogger.success('realtime', 'Cleared stale channels. Active components will re-subscribe automatically.');
      toast({
        title: 'Realtime Reset',
        description: 'Cleared channel sockets. Refreshing subscriptions...',
        type: 'info',
      });
    } catch (ex: any) {
      debugLogger.error('realtime', `Failed to reset realtime channels: ${ex.message}`, ex);
    }
  }, [supabase, toast]);

  const clearLogs = React.useCallback(() => {
    debugLogger.clearLogs();
    setLogs([]);
    toast({
      title: 'Logs Cleared',
      description: 'Log history has been reset.',
      type: 'info',
      duration: 1500,
    });
  }, [toast]);

  const copyLogs = React.useCallback(() => {
    const formatted = logs
      .map((l) => {
        const detailsStr = l.details ? `\nDetails: ${JSON.stringify(l.details, null, 2)}` : '';
        return `[${l.timeFormatted}] [${l.level.toUpperCase()}] [${l.category.toUpperCase()}] ${l.message}${detailsStr}`;
      })
      .join('\n');

    const header = `=== NEXUS PLATFORM SYSTEM & MESSAGING LOGS (${new Date().toISOString()}) ===\nTotal Logs: ${logs.length} | Errors: ${errorCount} | Warnings: ${warningCount}\n=======================================================\n\n`;

    navigator.clipboard.writeText(header + formatted);
    toast({
      title: 'Logs Copied to Clipboard',
      description: `Copied ${logs.length} log lines ready for debugging.`,
      type: 'success',
      duration: 2500,
    });
  }, [logs, errorCount, warningCount, toast]);

  const exportLogs = React.useCallback(() => {
    const formatted = logs
      .map((l) => {
        const detailsStr = l.details ? `\n  Details: ${JSON.stringify(l.details)}` : '';
        return `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category.toUpperCase()}] ${l.message}${detailsStr}`;
      })
      .join('\n');

    const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Logs Exported',
      description: 'Downloaded diagnostic log file.',
      type: 'success',
    });
  }, [logs, toast]);

  return {
    logs: filteredLogs,
    rawLogsCount: logs.length,
    errorCount,
    warningCount,
    isOpen,
    setIsOpen,
    openLogs: () => setIsOpen(true),
    closeLogs: () => setIsOpen(false),
    selectedLevel,
    setSelectedLevel,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    isAutoScroll,
    setIsAutoScroll,
    isRunningDiagnostics,
    diagnosticsSummary,
    runDiagnostics,
    refreshAuthSession,
    reconnectRealtime,
    clearLogs,
    copyLogs,
    exportLogs,
  };
}

export function triggerOpenLogsWindow() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nexus:open-logs'));
  }
}
