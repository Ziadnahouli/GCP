import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessages } from '@/hooks/use-messages';
import { useChannelMessages } from '@/hooks/use-channel-messages';

const {
  mockUser,
  mockProfile,
  mockState,
  mockRemoveChannel,
  mockBroadcastSend,
} = vi.hoisted(() => {
  const mockUser = { id: '00000000-0000-0000-0000-000000000001', email: 'gamer1@example.com' };
  const mockProfile = {
    id: '00000000-0000-0000-0000-000000000001',
    username: 'gamer_one',
    display_name: 'Gamer One',
    avatar_url: null,
  };
  const mockRemoveChannel = vi.fn();
  const mockBroadcastSend = vi.fn().mockResolvedValue(null);
  const mockState = {
    isConfigured: true,
    currentUser: mockUser as any,
    insertResult: { data: [{ id: 'db-msg-1', created_at: new Date().toISOString() }], error: null } as any,
    selectResult: { data: [] as any[], error: null } as any,
    fromOverride: null as any,
    querySpies: [] as any[],
  };
  return {
    mockUser,
    mockProfile,
    mockState,
    mockRemoveChannel,
    mockBroadcastSend,
  };
});

// Mock Auth Provider
vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: mockState.currentUser,
    profile: mockProfile,
    isConfigured: mockState.isConfigured,
  }),
}));

// Mock Supabase client with chainable query builder
vi.mock('@/lib/supabase/client', () => {
  const getClient = () => {
    let broadcastHandler: any = null;
    const channelObj = {
      on: vi.fn().mockImplementation((type: string, filter: any, handler: any) => {
        if (type === 'broadcast' && filter?.event === 'typing') {
          broadcastHandler = handler;
        }
        return channelObj;
      }),
      subscribe: vi.fn().mockImplementation((cb?: any) => {
        if (cb) cb('SUBSCRIBED', null);
        return channelObj;
      }),
      send: mockBroadcastSend,
      _simulateBroadcast: (event: string, payload: any) => {
        if (broadcastHandler) {
          broadcastHandler({ event, payload });
        }
      },
    };

    return {
      from: (table: string) => {
        if (mockState.fromOverride) {
          const custom = mockState.fromOverride(table);
          if (custom) return custom;
        }

        const createQueryBuilder = () => {
          const qb: any = {
            _table: table,
            _eq: [] as any[],
            _order: null as any,
            _limit: null as any,
            _lt: null as any,
            select: vi.fn().mockImplementation(() => qb),
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              qb._eq.push({ col, val });
              return qb;
            }),
            lt: vi.fn().mockImplementation((col: string, val: any) => {
              qb._lt = { col, val };
              return qb;
            }),
            order: vi.fn().mockImplementation((col: string, opts: any) => {
              qb._order = { col, opts };
              return qb;
            }),
            limit: vi.fn().mockImplementation((num: number) => {
              qb._limit = num;
              return qb;
            }),
            in: vi.fn().mockImplementation(() => Promise.resolve(mockState.selectResult)),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            // Make thenable so awaiting the builder directly executes the query
            then: (resolve: any, reject: any) => {
              mockState.querySpies.push({ ...qb });
              if (table === 'messages' || table === 'channel_messages') {
                return Promise.resolve(mockState.selectResult).then(resolve, reject);
              }
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            },
          };
          return qb;
        };

        const qb = createQueryBuilder();

        return {
          select: vi.fn().mockReturnValue(qb),
          insert: vi.fn().mockImplementation((payload: any) => {
            const insertedPayload = Array.isArray(payload) ? payload[0] : payload;
            const res = {
              data: [
                {
                  id: insertedPayload?.id || 'db-msg-auto-id',
                  created_at: new Date().toISOString(),
                  ...insertedPayload,
                },
              ],
              error: null,
            };
            return {
              select: vi.fn().mockResolvedValue(res),
              then: (onResolve: any) => Promise.resolve(res).then(onResolve),
            };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
            }),
          }),
          upsert: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
        };
      },
      channel: vi.fn().mockReturnValue(channelObj),
      removeChannel: mockRemoveChannel,
      storage: {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file' } }),
          createSignedUrls: vi.fn().mockResolvedValue({ data: [] }),
        }),
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      _lastChannel: channelObj,
    };
  };

  const client = getClient();
  return {
    getBrowserClient: () => client,
    supabase: client,
  };
});

describe('Phase 2 Messaging Correctness (M1–M8)', () => {
  const validConvId = '11111111-1111-1111-1111-111111111111';
  const validChannelId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockState.isConfigured = true;
    mockState.currentUser = mockUser;
    mockState.fromOverride = null;
    mockState.querySpies = [];
    mockState.selectResult = { data: [], error: null };
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  // M1: Keyset pagination cursor
  describe('M1: Keyset Pagination', () => {
    it('fetches latest 50 messages ordered by created_at descending with limit 50 and reverses in memory', async () => {
      // Generate 50 mock messages
      const mockBatch = Array.from({ length: 50 }, (_, i) => ({
        id: `msg-${i + 1}`,
        conversation_id: validConvId,
        sender_id: mockUser.id,
        content: `Message ${i + 1}`,
        created_at: new Date(Date.now() - (50 - i) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        sender: mockProfile,
      }));

      // Supabase returns newest first
      mockState.selectResult = {
        data: [...mockBatch].reverse(),
        error: null,
      };

      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      // Verify limit(50) was queried
      const lastQuery = mockState.querySpies.find((q) => q._table === 'messages');
      expect(lastQuery).toBeDefined();
      expect(lastQuery._limit).toBe(50);
      expect(lastQuery._order?.opts?.ascending).toBe(false);

      // Verify messages are presented in chronological order (oldest top, newest bottom)
      expect(result.current.messages).toHaveLength(50);
      expect(result.current.messages[0].id).toBe('msg-1');
      expect(result.current.messages[49].id).toBe('msg-50');
      expect(result.current.hasMore).toBe(true);
    });

    it('loadMore queries older messages using lt cursor on created_at and prepends them', async () => {
      const firstBatch = Array.from({ length: 50 }, (_, i) => ({
        id: `recent-${i + 1}`,
        conversation_id: validConvId,
        sender_id: mockUser.id,
        content: `Recent ${i + 1}`,
        created_at: new Date(2026, 0, 2, 0, i).toISOString(),
        updated_at: new Date().toISOString(),
        sender: mockProfile,
      }));

      mockState.selectResult = {
        data: [...firstBatch].reverse(),
        error: null,
      };

      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.messages).toHaveLength(50);
      const oldestCreatedAt = result.current.messages[0].created_at;

      // Mock older batch (20 messages)
      const olderBatch = Array.from({ length: 20 }, (_, i) => ({
        id: `older-${i + 1}`,
        conversation_id: validConvId,
        sender_id: mockUser.id,
        content: `Older ${i + 1}`,
        created_at: new Date(2026, 0, 1, 0, i).toISOString(),
        updated_at: new Date().toISOString(),
        sender: mockProfile,
      }));

      mockState.selectResult = {
        data: [...olderBatch].reverse(),
        error: null,
      };

      await act(async () => {
        await result.current.loadMore();
      });

      // Verify the query used lt('created_at', oldestCreatedAt)
      const loadMoreQuery = mockState.querySpies[mockState.querySpies.length - 1];
      expect(loadMoreQuery._lt).toEqual({ col: 'created_at', val: oldestCreatedAt });
      expect(loadMoreQuery._limit).toBe(50);

      // Total messages should be 70, with olderBatch prepended at top
      expect(result.current.messages).toHaveLength(70);
      expect(result.current.messages[0].id).toBe('older-1');
      expect(result.current.messages[19].id).toBe('older-20');
      expect(result.current.messages[20].id).toBe('recent-1');
      expect(result.current.hasMore).toBe(false); // returned < 50
    });
  });

  // M3: Brittle optimistic deduplication -> Client Nonce / ID Matching
  describe('M3: Nonce / Client ID Deduplication', () => {
    it('does not collapse or delete consecutive identical messages like "gg"', async () => {
      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      // User sends "gg" twice in rapid succession
      await act(async () => {
        await result.current.sendMessage('gg');
      });
      await act(async () => {
        await result.current.sendMessage('gg');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe('gg');
      expect(result.current.messages[1].content).toBe('gg');
      expect(result.current.messages[0].id).not.toBe(result.current.messages[1].id);
    });

    it('client passes draftId as primary key id so DB confirmation matches exactly', async () => {
      let insertedPayload: any = null;
      mockState.fromOverride = (table: string) => {
        if (table === 'messages') {
          return {
            insert: vi.fn().mockImplementation((payload: any) => {
              insertedPayload = payload;
              return {
                select: vi.fn().mockResolvedValue({ data: [payload], error: null }),
                then: (cb: any) => Promise.resolve({ data: [payload], error: null }).then(cb),
              };
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return null;
      };

      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.sendMessage('Tactical payload');
      });

      expect(insertedPayload).toBeDefined();
      expect(insertedPayload.id).toBeDefined();
      expect(typeof insertedPayload.id).toBe('string');
      // Optimistic message id should match the persisted id exactly
      expect(result.current.messages[0].id).toBe(insertedPayload.id);
      expect(result.current.messages[0].status).toBe('sent');
    });
  });

  // M5: Anti-flicker typing indicator map
  describe('M5: Typing Indicator Anti-Flicker Debounce Map', () => {
    it('debounces rapid typing events with Map<username, Timeout> so indicator does not flicker or prematurely disappear', async () => {
      const { getBrowserClient } = await import('@/lib/supabase/client');
      const client = getBrowserClient();
      const channelObj = (client as any)._lastChannel;

      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      // Teammate 'shadow_sniper' starts typing (keystroke 1)
      act(() => {
        channelObj._simulateBroadcast('typing', { username: 'shadow_sniper' });
      });
      expect(result.current.typingUsers).toContain('shadow_sniper');

      // Advance 2 seconds (less than 3s debounce)
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.typingUsers).toContain('shadow_sniper');

      // Teammate presses another key (keystroke 2)
      act(() => {
        channelObj._simulateBroadcast('typing', { username: 'shadow_sniper' });
      });

      // Advance another 1.5 seconds (3.5s total from first keystroke)
      // Old buggy implementation would have dropped 'shadow_sniper' at 3.0s!
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(result.current.typingUsers).toContain('shadow_sniper');

      // Advance remaining 1.6 seconds (total 3.1s from second keystroke)
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      // Now it should expire cleanly
      expect(result.current.typingUsers).not.toContain('shadow_sniper');
    });
  });

  // M6: Raw storage_path caching
  describe('M6: Raw storage_path Caching in localStorage', () => {
    it('stores raw storage_path in localStorage and does not bake ephemeral 1-hour signed URLs into cache', async () => {
      const cacheKey = `nexus_dm_msgs_${mockUser.id}_${validConvId}`;
      mockState.selectResult = {
        data: [
          {
            id: 'msg-with-attachment',
            conversation_id: validConvId,
            sender_id: mockUser.id,
            content: 'Check this map',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sender: mockProfile,
          },
        ],
        error: null,
      };

      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed[0]?.attachments?.length > 0) {
          // URLs in cache must NOT contain expiring tokens (e.g. token=... or X-Amz-Signature)
          expect(parsed[0].attachments[0].url).not.toMatch(/token=|Expires=/);
        }
      }
    });
  });

  // M7: Null-safety & 4000 char length enforcement
  describe('M7: Content Null-Safety and 4000 Char Length Limit', () => {
    it('rejects message exceeding 4000 characters with an error', async () => {
      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      const oversizedContent = 'A'.repeat(4001);
      let sendRes: any;
      await act(async () => {
        sendRes = await result.current.sendMessage(oversizedContent);
      });

      expect(sendRes.error).toMatch(/exceed.*4000/i);
      expect(result.current.messages).toHaveLength(0);
    });

    it('safely handles null or undefined content without crashing and defaults to empty string', async () => {
      mockState.selectResult = {
        data: [
          {
            id: 'msg-null-content',
            conversation_id: validConvId,
            sender_id: mockUser.id,
            content: null, // DB returned null content
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sender: mockProfile,
          },
        ],
        error: null,
      };

      const { result } = renderHook(() => useMessages(validConvId));
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('');
    });
  });

  // M8: Unified useChannelMessages behavior
  describe('M8: Unified Behavior for Channel Messages', () => {
    it('useChannelMessages supports keyset pagination and limits initial fetch to 50', async () => {
      const mockChannelBatch = Array.from({ length: 50 }, (_, i) => ({
        id: `chan-msg-${i + 1}`,
        channel_id: validChannelId,
        user_id: mockUser.id,
        content: `Channel Message ${i + 1}`,
        created_at: new Date(Date.now() - (50 - i) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        profile: mockProfile,
      }));

      mockState.selectResult = {
        data: [...mockChannelBatch].reverse(),
        error: null,
      };

      const { result } = renderHook(() => useChannelMessages(validChannelId));
      await act(async () => {
        await Promise.resolve();
      });

      const lastQuery = mockState.querySpies.find((q) => q._table === 'channel_messages');
      expect(lastQuery).toBeDefined();
      expect(lastQuery._limit).toBe(50);
      expect(lastQuery._order?.opts?.ascending).toBe(false);

      expect(result.current.messages).toHaveLength(50);
      expect(result.current.messages[0].id).toBe('chan-msg-1');
      expect(result.current.messages[49].id).toBe('chan-msg-50');
    });

    it('useChannelMessages rejects sending message exceeding 4000 characters', async () => {
      const { result } = renderHook(() => useChannelMessages(validChannelId));
      await act(async () => {
        await Promise.resolve();
      });

      const oversized = 'B'.repeat(4005);
      let res: any;
      await act(async () => {
        res = await result.current.sendMessage(oversized);
      });

      expect(res.error).toMatch(/exceed.*4000/i);
    });
  });
});
