import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import { ServersProvider, useServers } from '@/hooks/use-servers';

const {
  mockUser,
  mockState,
  mockFrom,
  mockRpc,
} = vi.hoisted(() => {
  const mockUser = { id: 'test-user-123', email: 'owner@nexus.gg' };

  const mockState = {
    serversData: [] as any[],
    queryError: null as any,
    updateError: null as any,
    deleteError: null as any,
  };

  const createQueryBuilder = () => {
    const promise = Promise.resolve({
      data: mockState.serversData,
      error: mockState.queryError,
    });
    const builder: any = {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      order: vi.fn().mockImplementation(() => createQueryBuilder()),
      eq: vi.fn().mockImplementation(() => createQueryBuilder()),
      in: vi.fn().mockImplementation(() => createQueryBuilder()),
      single: vi.fn().mockImplementation(() => createQueryBuilder()),
    };
    return builder;
  };

  const mockFrom = vi.fn().mockImplementation((table: string) => ({
    select: vi.fn().mockImplementation(() => createQueryBuilder()),
    insert: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: mockState.updateError,
        }),
        then: (fn: any) => Promise.resolve({ data: null, error: mockState.updateError }).then(fn),
      })),
      then: (fn: any) => Promise.resolve({ data: null, error: mockState.updateError }).then(fn),
    })),
    delete: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockImplementation(() => ({
        then: (fn: any) => Promise.resolve({ data: null, error: mockState.deleteError }).then(fn),
      })),
      then: (fn: any) => Promise.resolve({ data: null, error: mockState.deleteError }).then(fn),
    })),
  }));

  const mockRpc = vi.fn().mockImplementation((fnName: string) => {
    if (fnName === 'delete_channel' && mockState.deleteError) {
      return Promise.resolve({ data: null, error: mockState.deleteError });
    }
    return Promise.resolve({ data: null, error: null });
  });

  return {
    mockUser,
    mockState,
    mockFrom,
    mockRpc,
  };
});

vi.mock('@/lib/supabase/client', () => {
  const mockClient = {
    from: mockFrom,
    rpc: mockRpc,
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
  };
  return {
    supabase: mockClient,
    getBrowserClient: vi.fn(() => mockClient),
    getSupabaseClient: vi.fn(() => mockClient),
    createClient: vi.fn(() => mockClient),
  };
});

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    profile: { id: mockUser.id, username: 'testuser' },
    session: { user: mockUser },
  })),
}));

describe('SS-H1 & SS-H2: Server Mutation Error Handling & Optimistic Rollback Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.updateError = null;
    mockState.deleteError = null;
    mockState.serversData = [
      {
        id: 'srv-1',
        name: 'Original Clan',
        description: 'Original Desc',
        icon_url: null,
        owner_id: mockUser.id,
        created_at: new Date().toISOString(),
        channels: [
          {
            id: 'chan-1',
            server_id: 'srv-1',
            name: 'general',
            type: 'text',
            topic: null,
            position: 0,
            created_at: new Date().toISOString(),
          },
        ],
        server_members: [
          {
            id: 'mem-1',
            server_id: 'srv-1',
            user_id: mockUser.id,
            role: 'owner',
            joined_at: new Date().toISOString(),
            profile: { id: mockUser.id, display_name: 'Owner', username: 'owner' },
          },
        ],
      },
    ];
  });

  it('updateServer returns { ok: false, error } and rolls back state when DB update fails', async () => {
    mockState.updateError = { message: 'RLS check failed: not an administrator' };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(ServersProvider, null, children)
    );

    const { result } = renderHook(() => useServers(), { wrapper });

    await act(async () => {
      await result.current.refetch();
    });

    let res: any;
    await act(async () => {
      res = await result.current.updateServer('srv-1', { name: 'Hacked Name' });
    });

    // Contract: Every mutation must return { ok: boolean, error?: string }
    expect(res).toBeDefined();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/RLS check failed|not an administrator/i);

    // Optimistic rollback: srv-1 name must NOT remain 'Hacked Name'
    const srv = result.current.servers.find((s) => s.id === 'srv-1');
    expect(srv?.name).toBe('Original Clan');
  });

  it('deleteChannel returns { ok: false, error } and rolls back channels when DB delete fails', async () => {
    mockState.deleteError = { message: 'Permission denied' };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(ServersProvider, null, children)
    );

    const { result } = renderHook(() => useServers(), { wrapper });

    await act(async () => {
      await result.current.refetch();
    });

    let res: any;
    await act(async () => {
      res = await result.current.deleteChannel('srv-1', 'chan-1');
    });

    // Contract: deleteChannel must return { ok: boolean, error?: string }
    expect(res).toBeDefined();
    expect(res.ok).toBe(false);

    // Channel chan-1 must NOT have been removed from local state
    const srv = result.current.servers.find((s) => s.id === 'srv-1');
    expect(srv?.channels.some((c) => c.id === 'chan-1')).toBe(true);
  });
});
