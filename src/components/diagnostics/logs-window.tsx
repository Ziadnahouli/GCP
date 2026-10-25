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
import { LogEntry, isDebugEnabled } from '@/lib/logger/debug-logger';

interface LogsWindowProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LogsWindow(props: LogsWindowProps) {
  if (!isDebugEnabled()) {
    return null;
  }
  return <LogsWindowInternal {...props} />;
}

function LogsWindowInternal({ open: controlledOpen, onOpenChange }: LogsWindowProps) {
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
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-danger/15 text-danger border border-danger/30">
            <AlertCircle className="w-2.5 h-2.5" />
            ERR
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-warning/15 text-warning border border-warning/30">
            <AlertTriangle className="w-2.5 h-2.5" />
            WARN
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-success/15 text-success border border-success/30">
            <CheckCircle2 className="w-2.5 h-2.5" />
            OK
          </span>
        );
      case 'debug':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-primary/15 text-primary border border-primary/30">
            DBG
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-primary-subtle text-primary border border-primary/30">
            <Info className="w-2.5 h-2.5" />
            INFO
          </span>
        );
    }
  };

  const getCategoryBadge = (category: string) => {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-mono uppercase tracking-wide bg-surface-sidebar text-muted-foreground border border-border/80">
        {category}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={cn(
          'relative w-full rounded-2xl border border-border bg-surface-panel shadow-2xl shadow-black/90 flex flex-col overflow-hidden transition-all duration-200 z-10',
          isExpanded
            ? 'h-[96vh] max-w-[98vw]'
            : 'h-[85vh] max-h-[750px] max-w-5xl'
        )}
      >
        {/* Header Bar */}
        <div className="px-4 py-3 bg-surface-sidebar border-b border-border flex items-center justify-between shrink-0 select-none">
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
                  <Badge variant="destructive" className="text-xs px-1.5 py-0">
                    {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
                  </Badge>
                )}
                <span className="text-xs font-mono text-muted-foreground/60 hidden sm:inline">
                  (Ctrl + ~)
                </span>
              </div>
              <p className="text-xs text-muted-foreground/60">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-surface-sidebar/40 border-b border-border text-xs shrink-0">
          {/* 1. Database Ping */}
          <div className="p-2 rounded-lg border border-border bg-surface-default flex items-center gap-2">
            <Database className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground/70 uppercase font-semibold">Database Latency</div>
              <div className="font-mono font-medium text-foreground text-xs truncate">
                {isRunningDiagnostics ? (
                  <span className="text-muted-foreground animate-pulse">Pinging...</span>
                ) : diagnosticsSummary ? (
                  diagnosticsSummary.dbOk ? (
                    <span className="text-success">{diagnosticsSummary.dbPingMs}ms (Online)</span>
                  ) : (
                    <span className="text-danger">Offline / Error</span>
                  )
                ) : (
                  <span>Checking...</span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Auth Session */}
          <div className="p-2 rounded-xl border border-border/60 bg-surface-sidebar/80 flex items-center gap-2">
            <Shield className="w-4 h-4 text-success shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground uppercase font-bold">Session Expiry</div>
              <div className="font-mono font-semibold text-foreground truncate">
                {diagnosticsSummary?.authValid ? (
                  <span className="text-success">{diagnosticsSummary.authExpiresIn || 'Active'}</span>
                ) : (
                  <span className="text-warning">Guest / Uncached</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Realtime Sockets */}
          <div className="p-2 rounded-xl border border-border/60 bg-surface-sidebar/80 flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground uppercase font-bold">Realtime Channels</div>
              <div className="font-mono font-semibold text-foreground truncate">
                {diagnosticsSummary ? (
                  <span className="text-primary">
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
              <Shield className="w-3.5 h-3.5 text-success mr-1" />
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
              className="h-8 px-2 text-xs text-danger hover:text-danger hover:bg-danger/10"
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
                      ? 'bg-danger/15 border-danger/30 text-danger'
                      : log.level === 'warn'
                      ? 'bg-warning/15 border-warning/30 text-warning'
                      : log.level === 'success'
                      ? 'bg-success/15 border-success/20 text-success'
                      : 'bg-surface-sidebar/40 border-border/40 text-foreground/90 hover:bg-surface-hover/50',
                    log.isPreviousSession && 'opacity-75 border-dashed'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {/* Timestamp */}
                    <span className="text-xs text-muted-foreground/80 shrink-0 font-mono select-none">
                      {log.timeFormatted}
                    </span>

                    {/* Level */}
                    <div className="shrink-0">{getLevelBadge(log.level)}</div>

                    {/* Category */}
                    <div className="shrink-0">{getCategoryBadge(log.category)}</div>

                    {/* Previous Session Marker */}
                    {log.isPreviousSession && (
                      <span className="text-xs px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border uppercase">
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
                        className="text-xs font-mono text-primary/80 hover:text-primary shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20"
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
                    <div className="mt-2 p-2 rounded-md bg-black/60 border border-border/60 text-xs font-mono text-foreground/90 overflow-x-auto">
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
        <div className="px-4 py-2 bg-surface-sidebar border-t border-border/80 flex items-center justify-between text-xs text-muted-foreground shrink-0 select-none">
          <div className="flex items-center gap-3">
            <span>
              Showing {logs.length} of {rawLogsCount} logs
            </span>
            <span>•</span>
            <span className="text-success">{diagnosticsSummary?.authValid ? 'Session Valid' : 'Check Session'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={reconnectRealtime}
              className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary-subtle"
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
