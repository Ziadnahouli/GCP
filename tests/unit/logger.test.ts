import { describe, it, expect, beforeEach, vi } from 'vitest';
import { debugLogger, LogEntry } from '@/lib/logger/debug-logger';

describe('DebugLogger System & Diagnostics', () => {
  beforeEach(() => {
    debugLogger.clearLogs();
  });

  it('records logs with timestamp, level, category, and message', () => {
    debugLogger.info('messaging', 'Testing DM message send', { id: 'test-123' });
    debugLogger.error('database', 'Simulated RLS rejection', { code: '42501' });

    const logs = debugLogger.getLogs();
    // 1 log from clearLogs ('Logs buffer cleared') + 2 added
    expect(logs.length).toBeGreaterThanOrEqual(3);

    const msgLog = logs.find((l) => l.message === 'Testing DM message send');
    expect(msgLog).toBeDefined();
    expect(msgLog?.level).toBe('info');
    expect(msgLog?.category).toBe('messaging');
    expect(msgLog?.details).toEqual({ id: 'test-123' });

    const errLog = logs.find((l) => l.message === 'Simulated RLS rejection');
    expect(errLog).toBeDefined();
    expect(errLog?.level).toBe('error');
    expect(errLog?.category).toBe('database');
  });

  it('notifies subscribers in real-time when new logs are emitted', () => {
    const emitted: LogEntry[] = [];
    const unsubscribe = debugLogger.subscribe((entry) => {
      emitted.push(entry);
    });

    debugLogger.warn('auth', 'Token expiration warning');
    debugLogger.success('realtime', 'WebSocket joined channel');

    expect(emitted.length).toBe(2);
    expect(emitted[0].level).toBe('warn');
    expect(emitted[1].level).toBe('success');

    unsubscribe();
    debugLogger.info('system', 'Ignored after unsubscribe');
    expect(emitted.length).toBe(2);
  });

  it('runs system diagnostics against a mock Supabase client', async () => {
    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: { id: 'user-abc', email: 'gamer@nexus.io' },
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: 'bearer',
            },
          },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'msg-1' }],
          count: 1,
          error: null,
        }),
      }),
      getChannels: vi.fn().mockReturnValue([
        { topic: 'chat:conv-1', state: 'joined' },
        { topic: 'realtime:server-1', state: 'joined' },
      ]),
    };

    const result = await debugLogger.runSystemDiagnostics(mockSupabase);

    expect(result.authValid).toBe(true);
    expect(result.authEmail).toBe('gamer@nexus.io');
    expect(result.dbOk).toBe(true);
    expect(result.realtimeChannels).toHaveLength(2);
    expect(result.realtimeChannels[0].state).toBe('joined');
  });

  it('handles database errors during diagnostics gracefully', async () => {
    const mockSupabaseWithErr = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          count: null,
          error: { code: 'PGRST301', message: 'JWT expired' },
        }),
      }),
      getChannels: vi.fn().mockReturnValue([]),
    };

    const result = await debugLogger.runSystemDiagnostics(mockSupabaseWithErr);

    expect(result.dbOk).toBe(false);
    expect(result.errorDetails).toContain('JWT expired');
  });
});
