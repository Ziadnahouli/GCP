import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import {
  ConversationsProvider,
  useConversations,
} from '@/hooks/use-conversations';
import {
  ServersProvider,
  useServers,
} from '@/hooks/use-servers';

const {
  mockUser,
  mockProfile,
  mockState,
  mockRpc,
  mockFrom,
} = vi.hoisted(() => {
  const mockUser = { id: 'test-user-uuid-1', email: 'gamer@nexus.gg' };
  const mockProfile = { id: 'test-user-uuid-1', username: 'nexus_gamer', status: 'online' };

  const mockState = {
    selectResult: { data: [] as any[], error: null as any },
    rpcResult: { data: null as any, error: null as any },
    insertResult: { data: null as any, error: null as any },
  };

  const mockRpc = vi.fn().mockImplementation(() => Promise.resolve(mockState.rpcResult));

  const createQueryBuilder = () => {
    const promise = Promise.resolve(mockState.selectResult);
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

  const mockFrom = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockImplementation(() => createQueryBuilder()),
    insert: vi.fn().mockImplementation(() => Promise.resolve(mockState.insertResult)),
    delete: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
    update: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }));

  return {
    mockUser,
    mockProfile,
    mockState,
    mockRpc,
    mockFrom,
  };
});

vi.mock('@/lib/supabase/client', () => {
  const mockClient = {
    from: mockFrom,
    rpc: mockRpc,
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      send: vi.fn().mockResolvedValue({}),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  };

  return {
    supabase: mockClient,
    getBrowserClient: () => mockClient,
  };
});

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    isConfigured: true,
  }),
}));

describe('Navigation Resilience & Failover Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.selectResult = { data: [], error: null };
    mockState.rpcResult = { data: null, error: null };
    mockState.insertResult = { data: null, error: null };
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  describe('useConversations safe parsing & multi-tier fallback', () => {
    it('safely handles null foreign key joins in conversation_members without throwing TypeError', async () => {
      mockState.selectResult = {
        data: [
          {
            conversation_id: 'conv-123',
            conversation: null, // corrupted or unlinked join
          },
          {
            conversation_id: 'conv-456',
            conversation: {
              id: 'conv-456',
              type: 'direct',
              name: null,
              icon_url: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        ],
        error: null,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ConversationsProvider, null, children)
      );

      const { result } = renderHook(() => useConversations(), { wrapper });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.conversations).toBeDefined();
      expect(Array.isArray(result.current.conversations)).toBe(true);
    });

    it('falls back to direct querying and insertion when create_or_get_direct_conversation RPC fails', async () => {
      mockState.rpcResult = { data: null, error: { message: 'function create_or_get_direct_conversation() does not exist' } };
      mockState.selectResult = { data: [], error: null };
      mockState.insertResult = { data: null, error: null };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ConversationsProvider, null, children)
      );

      const { result } = renderHook(() => useConversations(), { wrapper });

      let directResult: any;
      await act(async () => {
        directResult = await result.current.getOrCreateDirectConversation('target-friend-uuid-2');
      });

      expect(directResult.error).toBeNull();
      expect(directResult.conversationId).toBeTruthy();
      expect(typeof directResult.conversationId).toBe('string');
    });
  });

  describe('useServers channel synthesis & community servers', () => {
    it('does not fabricate client-side channel IDs when server has empty channels array', async () => {
      mockState.selectResult = {
        data: [
          {
            id: 'server-custom-1',
            name: 'Apex Legends Scrim Hub',
            description: 'Custom user clan server',
            icon_url: null,
            owner_id: mockUser.id,
            created_at: new Date().toISOString(),
            channels: [], // Empty channels
            server_members: [{ id: 'm1', server_id: 'server-custom-1', user_id: mockUser.id, role: 'owner' }],
          },
        ],
        error: null,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ServersProvider, null, children)
      );

      const { result } = renderHook(() => useServers(), { wrapper });

      await act(async () => {
        await result.current.refetch();
      });

      const server = result.current.servers.find((s) => s.id === 'server-custom-1');
      expect(server).toBeDefined();
      // Phase 4 A5: Client must not fabricate fake default-chan-* IDs
      expect(server!.channels.length).toBe(0);
      expect(server!.channels.some((c) => c.id.startsWith('default-chan'))).toBe(false);
    });

    it('strictly excludes dummy/unjoined seed servers from user server list', async () => {
      mockState.selectResult = {
        data: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Tactical Squad Alpha',
            description: 'Seed public community server',
            icon_url: null,
            owner_id: null,
            created_at: new Date().toISOString(),
            channels: [],
            server_members: [],
          },
          {
            id: '00000000-0000-0000-0000-000000000002',
            name: 'Cyber Ranked Grinders',
            description: 'Seed public community server',
            icon_url: null,
            owner_id: null,
            created_at: new Date().toISOString(),
            channels: [],
            server_members: [],
          },
          {
            id: 'user-server-den',
            name: 'The Gamer Den',
            description: 'User clan server',
            icon_url: null,
            owner_id: mockUser.id,
            created_at: new Date().toISOString(),
            channels: [],
            server_members: [{ id: 'm1', server_id: 'user-server-den', user_id: mockUser.id, role: 'owner' }],
          },
        ],
        error: null,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ServersProvider, null, children)
      );

      const { result } = renderHook(() => useServers(), { wrapper });

      await act(async () => {
        await result.current.refetch();
      });

      // Dummy servers must NOT be present
      expect(result.current.servers.some((s) => s.id === '00000000-0000-0000-0000-000000000001')).toBe(false);
      expect(result.current.servers.some((s) => s.id === '00000000-0000-0000-0000-000000000002')).toBe(false);

      // User's own server MUST be present
      expect(result.current.servers.some((s) => s.id === 'user-server-den')).toBe(true);
    });
  });
});
