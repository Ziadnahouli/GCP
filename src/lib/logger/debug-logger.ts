'use client';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

export type LogCategory =
  | 'messaging'
  | 'channel_messaging'
  | 'auth'
  | 'realtime'
  | 'database'
  | 'webrtc'
  | 'storage'
  | 'console'
  | 'system';

export interface LogEntry {
  id: string;
  timestamp: string; // ISO string
  timeFormatted: string; // HH:mm:ss.SSS
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: any;
  stack?: string;
  isPreviousSession?: boolean;
}

const MAX_LOGS = 600;
const SESSION_STORAGE_KEY = 'nexus_debug_logs';

export const isDebugEnabled = (): boolean => {
  if (process.env.NODE_ENV === 'test') return true;
  return process.env.NEXT_PUBLIC_DEBUG === 'true';
};

class DebugLoggerService {
  private logs: LogEntry[] = [];
  private listeners: Set<(entry: LogEntry) => void> = new Set();
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init() {
    if (!isDebugEnabled()) return;
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Restore previous session logs from sessionStorage so errors before refresh are not lost
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed: LogEntry[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.logs = parsed.map((e) => ({ ...e, isPreviousSession: true }));
        }
      }
    } catch {
      // Ignore sessionStorage parse errors
    }

    // 2. Add startup log
    this.logEntry({
      level: 'system',
      category: 'system',
      message: `Nexus Diagnostics Logger initialized (Session started at ${new Date().toLocaleTimeString()})`,
      details: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
      },
    } as any);

    // 3. Intercept window errors and unhandled rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.error('system', `Uncaught exception: ${event.message}`, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        this.error('system', `Unhandled promise rejection: ${reason?.message || String(reason)}`, {
          reason: typeof reason === 'object' ? reason : String(reason),
          stack: reason?.stack,
        });
      });

      // 4. Wrap console.error and console.warn to capture third-party/runtime logs
      this.interceptConsole();
    }
  }

  private interceptConsole() {
    if (typeof window === 'undefined') return;

    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      try {
        const message = args.map((a) => (typeof a === 'string' ? a : (a?.message || JSON.stringify(a)))).join(' ');
        // Avoid recursive logging of our own logger
        if (!message.includes('[DebugLogger]')) {
          this.logEntry({
            level: 'error',
            category: 'console',
            message: message.slice(0, 500),
            details: args.length > 1 ? args : args[0],
          });
        }
      } catch {}
    };

    console.warn = (...args: any[]) => {
      originalConsoleWarn.apply(console, args);
      try {
        const message = args.map((a) => (typeof a === 'string' ? a : (a?.message || JSON.stringify(a)))).join(' ');
        if (!message.includes('[DebugLogger]')) {
          this.logEntry({
            level: 'warn',
            category: 'console',
            message: message.slice(0, 500),
            details: args.length > 1 ? args : args[0],
          });
        }
      } catch {}
    };
  }

  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${mins}:${secs}.${ms}`;
  }

  private logEntry(entryData: Omit<LogEntry, 'id' | 'timestamp' | 'timeFormatted'>) {
    if (!isDebugEnabled()) return;
    const now = new Date();
    const entry: LogEntry = {
      ...entryData,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now.toISOString(),
      timeFormatted: this.formatTime(now),
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.splice(0, this.logs.length - MAX_LOGS);
    }

    // Persist latest 250 logs in sessionStorage
    this.saveToSessionStorage();

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        console.warn('DebugLogger listener error:', err);
      }
    });
  }

  private saveToSessionStorage() {
    if (typeof window === 'undefined') return;
    try {
      const slice = this.logs.slice(-250);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(slice));
    } catch {}
  }

  public subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {}
    }
    this.logEntry({
      level: 'info',
      category: 'system',
      message: 'Logs buffer cleared by user.',
    });
  }

  public info(category: LogCategory, message: string, details?: any) {
    this.logEntry({ level: 'info', category, message, details });
  }

  public warn(category: LogCategory, message: string, details?: any) {
    this.logEntry({ level: 'warn', category, message, details });
  }

  public error(category: LogCategory, message: string, details?: any) {
    this.logEntry({ level: 'error', category, message, details });
  }

  public success(category: LogCategory, message: string, details?: any) {
    this.logEntry({ level: 'success', category, message, details });
  }

  public debug(category: LogCategory, message: string, details?: any) {
    if (process.env.NODE_ENV === 'production') return;
    this.logEntry({ level: 'debug', category, message, details });
  }

  /**
   * Diagnostic test runner for Supabase database, auth, and realtime
   */
  public async runSystemDiagnostics(supabaseClient: any): Promise<{
    authValid: boolean;
    authEmail?: string;
    authExpiresIn?: string;
    dbPingMs: number;
    dbOk: boolean;
    realtimeChannels: { topic: string; state: string }[];
    errorDetails?: string;
  }> {
    this.info('system', '--- Starting Comprehensive System Diagnostics ---');

    let authValid = false;
    let authEmail: string | undefined;
    let authExpiresIn: string | undefined;
    let dbPingMs = -1;
    let dbOk = false;
    let errorDetails: string | undefined;

    // 1. Test Auth Session
    try {
      const { data: { session }, error: sessionErr } = await supabaseClient.auth.getSession();
      if (sessionErr) {
        this.error('auth', `Auth getSession error: ${sessionErr.message}`, sessionErr);
        errorDetails = `Auth Error: ${sessionErr.message}`;
      } else if (!session) {
        this.warn('auth', 'No active Supabase auth session found (User is Guest or logged out).');
      } else {
        authValid = true;
        authEmail = session.user?.email || session.user?.id;
        const nowSec = Math.floor(Date.now() / 1000);
        const diffSec = (session.expires_at || nowSec) - nowSec;
        authExpiresIn = `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;
        this.success('auth', `Auth session active for ${authEmail}. Token expires in ${authExpiresIn}.`, {
          userId: session.user?.id,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'none',
          tokenType: session.token_type,
        });
      }
    } catch (authEx: any) {
      this.error('auth', `Auth check threw exception: ${authEx?.message || authEx}`, authEx);
      errorDetails = `Auth Exception: ${authEx?.message}`;
    }

    // 2. Test DB Query & Measure Latency
    try {
      const startTime = performance.now();
      const { data, error, count } = await supabaseClient
        .from('messages')
        .select('id', { count: 'exact', head: true });
      const endTime = performance.now();
      dbPingMs = Math.round(endTime - startTime);

      if (error) {
        this.error('database', `Database query probe failed in ${dbPingMs}ms: [${error.code}] ${error.message}`, {
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        dbOk = false;
        errorDetails = errorDetails ? `${errorDetails} | DB Error: ${error.message}` : `DB: ${error.message}`;
      } else {
        dbOk = true;
        this.success('database', `Database ping successful (${dbPingMs}ms). Accessible messages count: ${count ?? 'N/A'}`);
      }
    } catch (dbEx: any) {
      this.error('database', `Database ping threw exception: ${dbEx?.message || dbEx}`, dbEx);
      dbOk = false;
    }

    // 3. Inspect Realtime Channels
    const channels = typeof supabaseClient.getChannels === 'function' ? supabaseClient.getChannels() : [];
    const channelList = channels.map((c: any) => ({
      topic: c.topic || 'unknown',
      state: c.state || 'unknown',
    }));

    this.info('realtime', `Active Realtime Channels count: ${channelList.length}`, { channels: channelList });
    channelList.forEach((ch: any) => {
      if (ch.state === 'joined') {
        this.success('realtime', `Channel [${ch.topic}] is connected (state: ${ch.state})`);
      } else {
        this.warn('realtime', `Channel [${ch.topic}] in non-joined state: ${ch.state}`);
      }
    });

    this.info('system', `--- Diagnostics Completed: DB=${dbOk ? 'OK' : 'FAIL'} (${dbPingMs}ms), Auth=${authValid ? 'VALID' : 'INVALID'}, Channels=${channelList.length} ---`);

    return {
      authValid,
      authEmail,
      authExpiresIn,
      dbPingMs,
      dbOk,
      realtimeChannels: channelList,
      errorDetails,
    };
  }
}

// Global singleton instance
export const debugLogger = new DebugLoggerService();
