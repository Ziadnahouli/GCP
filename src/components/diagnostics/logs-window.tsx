'use client';

import * as React from 'react';
import {
  Terminal,
  X,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Activity,
  Maximize2,
  Minimize2,
  Shield,
  Radio,
  Database,
  ArrowDownCircle,
  ChevronRight,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDiagnosticsLogs } from '@/hooks/use-diagnostics-logs';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { LogEntry } from '@/lib/logger/debug-logger';

interface LogsWindowProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LogsWindow({ open: controlledOpen, onOpenChange }: LogsWindowProps) {
  const {
    logs,
    rawLogsCount,
    errorCount,
    warningCount,
    isOpen: hookOpen,
    setIsOpen: setHookOpen,
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
  } = useDiagnosticsLogs();

  const isOpen = controlledOpen !== undefined ? controlledOpen : hookOpen;
  const setIsOpen = onOpenChange || setHookOpen;
  useModalEscape(isOpen, setIsOpen);

  const [isExpanded, setIsExpanded] = React.useState(false);
  const [expandedLogIds, setExpandedLogIds] = React.useState<Set<string>>(new Set());
  const logsContainerRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  React.useEffect(() => {
    if (isAutoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, isAutoScroll]);

  // Run initial diagnostic check when window is opened for the first time
  React.useEffect(() => {
    if (isOpen && !diagnosticsSummary && !isRunningDiagnostics) {
      runDiagnostics();
    }
  }, [isOpen, diagnosticsSummary, isRunningDiagnostics, runDiagnostics]);

  if (!isOpen) return null;

  const toggleExpandLog = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-2.5 h-2.5" />
            ERR
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-2.5 h-2.5" />
            WARN
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-2.5 h-2.5" />
            OK
          </span>
        );
      case 'debug':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            DBG
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            <Info className="w-2.5 h-2.5" />
            INFO
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide bg-surface-sidebar text-muted-foreground border border-border/80">
        {category}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={cn(
          'relative w-full rounded-2xl border border-white/[0.08] bg-surface-panel shadow-2xl shadow-black/90 flex flex-col overflow-hidden transition-all duration-200 z-10',
          isExpanded
            ? 'h-[96vh] max-w-[98vw]'
            : 'h-[85vh] max-h-[750px] max-w-5xl'
        )}
      >
        {/* Header Bar */}
        <div className="px-4 py-3 bg-surface-sidebar border-b border-white/[0.06] flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-foreground">
                  GCP Diagnostics & Live Logs
                </h3>
                {errorCount > 0 && (
                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                    {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
                  </Badge>
                )}
                <span className="text-[10px] font-mono text-muted-foreground/60 hidden sm:inline">
                  (Ctrl + ~)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                Real-time Supabase messaging, WebSocket, session & network event telemetry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title={isExpanded ? 'Restore window size' : 'Maximize window'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title="Close diagnostics window"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Live System Diagnostics Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-surface-sidebar/40 border-b border-white/[0.06] text-xs shrink-0">
          {/* 1. Database Ping */}
          <div className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center gap-2">
            <Database className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground/70 uppercase font-semibold">Database Latency</div>
              <div className="font-mono font-medium text-foreground text-xs truncate">
                {isRunningDiagnostics ? (
                  <span className="text-muted-foreground animate-pulse">Pinging...</span>
                ) : diagnosticsSummary ? (
                  diagnosticsSummary.dbOk ? (
                    <span className="text-emerald-400">{diagnosticsSummary.dbPingMs}ms (Online)</span>
                  ) : (
                    <span className="text-rose-400">Offline / Error</span>
                  )
                ) : (
                  <span>Checking...</span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Auth Session */}
          <div className="p-2 rounded-xl border border-border/60 bg-surface-sidebar/80 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground uppercase font-bold">Session Expiry</div>
              <div className="font-mono font-semibold text-foreground truncate">
                {diagnosticsSummary?.authValid ? (
                  <span className="text-emerald-400">{diagnosticsSummary.authExpiresIn || 'Active'}</span>
                ) : (
                  <span className="text-amber-400">Guest / Uncached</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Realtime Sockets */}
          <div className="p-2 rounded-xl border border-border/60 bg-surface-sidebar/80 flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground uppercase font-bold">Realtime Channels</div>
              <div className="font-mono font-semibold text-foreground truncate">
                {diagnosticsSummary ? (
                  <span className="text-cyan-400">
                    {diagnosticsSummary.realtimeChannels.length} connected
                  </span>
                ) : (
                  <span>0 channels</span>
                )}
              </div>
            </div>
          </div>

          {/* 4. Action buttons: Run Test */}
          <div className="flex items-center gap-1.5 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={runDiagnostics}
              disabled={isRunningDiagnostics}
              className="text-xs h-9 font-semibold flex items-center gap-1 border-primary/40 hover:bg-primary/10"
              title="Test Supabase database, auth session, and realtime channels"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRunningDiagnostics && 'animate-spin')} />
              <span>Diagnose</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAuthSession}
              className="text-xs h-9 font-semibold border-border hover:bg-surface-hover"
              title="Force refresh Supabase auth JWT token"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400 mr-1" />
              <span>Renew Token</span>
            </Button>
          </div>
        </div>

        {/* Toolbar: Filters & Actions */}
        <div className="p-2.5 bg-surface-sidebar/30 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Level Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(['all', 'error', 'warn', 'info', 'success'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-colors',
                  selectedLevel === lvl
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                )}
              >
                {lvl === 'all'
                  ? `All (${rawLogsCount})`
                  : lvl === 'error'
                  ? `Errors (${errorCount})`
                  : lvl === 'warn'
                  ? `Warn (${warningCount})`
                  : lvl}
              </button>
            ))}

            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter logs by category"
              className="px-2 py-1 rounded-lg text-xs font-mono bg-surface-sidebar border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary ml-1"
            >
              <option value="all">All Categories</option>
              <option value="messaging">Messaging</option>
              <option value="channel_messaging">Channel Msgs</option>
              <option value="auth">Auth & Session</option>
              <option value="realtime">Realtime</option>
              <option value="database">Database</option>
              <option value="webrtc">WebRTC</option>
              <option value="console">Console</option>
              <option value="system">System</option>
            </select>
          </div>

          {/* Search Input & Action Buttons */}
          <div className="flex items-center gap-1.5 flex-1 max-w-md justify-end">
            <div className="relative flex-1 min-w-[120px]">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter logs by keyword"
                placeholder="Filter logs by keyword..."
                className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-border bg-surface-sidebar text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={copyLogs}
              className="h-8 px-2.5 text-xs font-semibold"
              title="Copy all logs formatted for sharing with developer"
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Copy Logs</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={exportLogs}
              className="h-8 px-2 text-xs"
              title="Download logs file (.txt)"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={clearLogs}
              className="h-8 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              title="Clear log history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAutoScroll((prev) => !prev)}
              className={cn(
                'h-8 px-2 text-xs font-mono',
                isAutoScroll ? 'text-primary' : 'text-muted-foreground'
              )}
              title={isAutoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Logs Feed List */}
        <div
          ref={logsContainerRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 bg-background/95 select-text"
        >
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-16 space-y-2">
              <Terminal className="w-8 h-8 opacity-40" />
              <div className="text-sm font-semibold">No Logs Recorded Yet</div>
              <p className="text-xs text-muted-foreground max-w-sm text-center font-sans">
                Try sending a message or clicking &quot;Diagnose&quot; above to generate diagnostic logs.
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const hasDetails = log.details !== undefined && log.details !== null;
              const isDetailsExpanded = expandedLogIds.has(log.id);

              return (
                <div
                  key={log.id}
                  className={cn(
                    'group p-1.5 rounded-lg border transition-colors',
                    log.level === 'error'
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                      : log.level === 'warn'
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                      : log.level === 'success'
                      ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200'
                      : 'bg-surface-sidebar/40 border-border/40 text-foreground/90 hover:bg-surface-hover/50',
                    log.isPreviousSession && 'opacity-75 border-dashed'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {/* Timestamp */}
                    <span className="text-[11px] text-muted-foreground/80 shrink-0 font-mono select-none">
                      {log.timeFormatted}
                    </span>

                    {/* Level */}
                    <div className="shrink-0">{getLevelBadge(log.level)}</div>

                    {/* Category */}
                    <div className="shrink-0">{getCategoryBadge(log.category)}</div>

                    {/* Previous Session Marker */}
                    {log.isPreviousSession && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border uppercase">
                        Prev Session
                      </span>
                    )}

                    {/* Message Body */}
                    <span className="flex-1 break-all whitespace-pre-wrap font-sans text-xs">
                      {log.message}
                    </span>

                    {/* Toggle Details Button */}
                    {hasDetails && (
                      <button
                        onClick={() => toggleExpandLog(log.id)}
                        className="text-[10px] font-mono text-primary/80 hover:text-primary shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20"
                      >
                        {isDetailsExpanded ? (
                          <>
                            <ChevronDown className="w-3 h-3" /> Hide
                          </>
                        ) : (
                          <>
                            <ChevronRight className="w-3 h-3" /> Details
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expandable JSON / Object Details View */}
                  {hasDetails && isDetailsExpanded && (
                    <div className="mt-2 p-2 rounded-md bg-black/60 border border-border/60 text-[11px] font-mono text-foreground/90 overflow-x-auto">
                      <pre className="whitespace-pre-wrap">
                        {typeof log.details === 'string'
                          ? log.details
                          : JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-4 py-2 bg-surface-sidebar border-t border-border/80 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 select-none">
          <div className="flex items-center gap-3">
            <span>
              Showing {logs.length} of {rawLogsCount} logs
            </span>
            <span>•</span>
            <span className="text-emerald-400">{diagnosticsSummary?.authValid ? 'Session Valid' : 'Check Session'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={reconnectRealtime}
              className="h-6 px-2 text-[11px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
              title="Reset Supabase Realtime WebSocket connections"
            >
              Reset Sockets
            </Button>
            <span>•</span>
            <span>Press Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
