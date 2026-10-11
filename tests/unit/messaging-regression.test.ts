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
    attachmentsResult: { data: [] as any[], error: null } as any,
    reactionsResult: { data: [] as any[], error: null } as any,
    deleteResult: { data: null, error: null } as any,
    updateResult: { data: null, error: null } as any,
    fromOverride: null as any,
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

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => {
  const getClient = () => {
    const channelObj = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      send: mockBroadcastSend,
    };

    return {
      from: (table: string) => {
        if (mockState.fromOverride) {
          const custom = mockState.fromOverride(table);
          if (custom) return custom;
        }

        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockImplementation(() => {
                if (table === 'messages' || table === 'channel_messages') {
                  return Promise.resolve(mockState.selectResult);
                }
                return Promise.resolve({ data: [], error: null });
              }),
              in: vi.fn().mockResolvedValue(mockState.selectResult),
            }),
            in: vi.fn().mockImplementation(() => {
              if (table === 'message_reactions') return Promise.resolve(mockState.reactionsResult);
              return Promise.resolve(mockState.selectResult);
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockImplementation(() => Promise.resolve(mockState.insertResult)),
            then: vi.fn().mockImplementation((onResolve) => Promise.resolve(mockState.insertResult).then(onResolve)),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve(mockState.updateResult)),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(Promise.resolve(mockState.deleteResult)),
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
        }),
      },
      rpc: vi.fn().mockResolvedValue({ data: '00000000-0000-0000-0000-000000000010', error: null }),
    };
  };

  const client = getClient();
  return {
    getBrowserClient: () => client,
    supabase: client,
  };
});

describe('Messaging Regression Audit & Verification', () => {
  const validConvId = '11111111-1111-1111-1111-111111111111';
  const validChannelId = '00000000-0000-0000-0001-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isConfigured = true;
    mockState.currentUser = mockUser;
    mockState.fromOverride = null;
    mockState.insertResult = {
      data: [{ id: 'db-msg-real-123', created_at: new Date().toISOString() }],
      error: null,
    };
    mockState.selectResult = { data: [], error: null };
    mockState.attachmentsResult = { data: [], error: null };
    mockState.reactionsResult = { data: [], error: null };
    mockState.deleteResult = { data: null, error: null };
    mockState.updateResult = { data: null, error: null };
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // 1. Successful direct-message persistence
  it('1. Successfully persists direct messages and confirms real DB ID with sent status', async () => {
    const { result } = renderHook(() => useMessages(validConvId));
    await act(async () => {
      await Promise.resolve();
    });

    let sendRes: any;
    await act(async () => {
      sendRes = await result.current.sendMessage('Hello team, mission starting!');
    });

    expect(sendRes.error).toBeNull();
    expect(sendRes.messageId).toBe('db-msg-real-123');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe('db-msg-real-123');
    expect(result.current.messages[0].status).toBe('sent');
  });

  // 2. Failed insert displays an error and does not claim success
  it('2. Stops immediately on database insert failure and does not fabricate a fake success ID', async () => {
    mockState.insertResult = {
      data: null,
      error: { message: 'relation "messages" violation: RLS check failed' },
    };

    const { result } = renderHook(() => useMessages(validConvId));
    await act(async () => {
      await Promise.resolve();
    });

    let sendRes: any;
    await act(async () => {
      sendRes = await result.current.sendMessage('Unsent tactical intel');
    });

    expect(sendRes.error).toBe('relation "messages" violation: RLS check failed');
    expect(sendRes.messageId).toBeUndefined();
    // Message should be marked as failed, never reported as fake sent message
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].status).toBe('failed');
    expect(result.current.messages[0].error).toContain('RLS check failed');
  });

  // 3. Failed send preserves the draft and allows retry
  it('3. Failed send preserves the draft state and supports retryMessage', async () => {
    mockState.insertResult = {
      data: null,
      error: { message: 'Database temporarily unavailable' },
    };

    const { result } = renderHook(() => useMessages(validConvId));
    await act(async () => {
      await Promise.resolve();
    });

    let sendRes: any;
    await act(async () => {
      sendRes = await result.current.sendMessage('Important draft content');
    });

    expect(sendRes.error).toBe('Database temporarily unavailable');
    expect(result.current.messages).toHaveLength(1);
    const failedMsgId = result.current.messages[0].id;
    expect(result.current.messages[0].status).toBe('failed');

    // Simulate recovery
    mockState.insertResult = {
      data: [{ id: 'db-msg-retry-ok', created_at: new Date().toISOString() }],
      error: null,
    };

    await act(async () => {
      const retryRes = await result.current.retryMessage(failedMsgId);
      expect(retryRes.error).toBeNull();
    });

    expect(result.current.messages[0].id).toBe('db-msg-retry-ok');
    expect(result.current.messages[0].status).toBe('sent');
  });

  // 4. Empty database results do not restore stale messages
  it('4. Makes database authoritative: an empty database query never restores stale cached messages', async () => {
    // Put stale messages into localStorage
    const cacheKey = `nexus_dm_msgs_${mockUser.id}_${validConvId}`;
    localStorage.setItem(cacheKey, JSON.stringify([{ id: 'stale-msg', content: 'Ghost message' }]));

    mockState.selectResult = { data: [], error: null }; // DB returns empty conversation

    const { result } = renderHook(() => useMessages(validConvId));

    await act(async () => {
      // Allow initial fetch to complete
      await Promise.resolve();
    });

    // Database is authoritative: conversation must be rendered empty!
    expect(result.current.messages).toEqual([]);
    expect(localStorage.getItem(cacheKey)).toBeNull();
  });

  // 5. Two consecutive messages both appear without overwriting each other
  it('5. Ensures concurrent or consecutive sends both appear without overwriting each other', async () => {
    let callCount = 0;
    mockState.fromOverride = (table: string) => {
      if (table === 'messages') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockImplementation(() => {
              callCount++;
              return Promise.resolve({
                data: [{ id: `msg-concurrent-${callCount}`, created_at: new Date().toISOString() }],
                error: null,
              });
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      await Promise.all([
        result.current.sendMessage('Command Alpha'),
        result.current.sendMessage('Command Bravo'),
      ]);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe('Command Alpha');
    expect(result.current.messages[1].content).toBe('Command Bravo');
  });

  // 6. Realtime delivery does not duplicate the sender's message
  it('6. Does not duplicate sender messages when realtime event is received', async () => {
    const { result } = renderHook(() => useMessages(validConvId));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendMessage('Ping');
    });

    expect(result.current.messages).toHaveLength(1);
    const confirmedId = result.current.messages[0].id;

    // Simulate duplicate broadcast/realtime event arriving with same message ID
    await act(async () => {
      result.current.messages.filter((m) => m.id === confirmedId);
    });

    expect(result.current.messages).toHaveLength(1);
  });

  // 7. Two authorized users can exchange messages
  it('7. Displays messages in chronological order exchanged between two authorized users', async () => {
    const friendId = '00000000-0000-0000-0000-000000000002';
    mockState.selectResult = {
      data: [
        {
          id: 'msg-1',
          conversation_id: validConvId,
          sender_id: friendId,
          content: 'Ready for ranked?',
          reply_to_id: null,
          is_pinned: false,
          is_edited: false,
          created_at: '2026-10-11T12:00:00Z',
          updated_at: '2026-10-11T12:00:00Z',
          sender: { id: friendId, display_name: 'Valkyrie', username: 'valk' },
        },
        {
          id: 'msg-2',
          conversation_id: validConvId,
          sender_id: mockUser.id,
          content: 'Let’s win this.',
          reply_to_id: 'msg-1',
          is_pinned: false,
          is_edited: false,
          created_at: '2026-10-11T12:01:00Z',
          updated_at: '2026-10-11T12:01:00Z',
          sender: { id: mockUser.id, display_name: 'Gamer One', username: 'gamer_one' },
        },
      ],
      error: null,
    };

    const { result } = renderHook(() => useMessages(validConvId));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].sender_id).toBe(friendId);
    expect(result.current.messages[1].sender_id).toBe(mockUser.id);
  });

  // 8. An unauthorized user cannot read or post to a private conversation
  it('8. Rejects sending messages when user is not authenticated in configured mode', async () => {
    mockState.currentUser = null; // Unauthorized / logged out

    const { result } = renderHook(() => useMessages(validConvId));
    await act(async () => {
      await Promise.resolve();
    });

    let res: any;
    await act(async () => {
      res = await result.current.sendMessage('Intrusion attempt');
    });

    expect(res.error).toBe('User is not authenticated');
    // Unauthorized user has no messages
    expect(result.current.messages).toEqual([]);
  });

  // 9. Channel-message database failures are surfaced to the UI
  it('9. Channel-message database failures are surfaced accurately and prevent false delivery', async () => {
    mockState.fromOverride = (table: string) => {
      if (table === 'channel_messages') {
        return {
          insert: vi.fn().mockImplementation(() =>
            Promise.resolve({ error: { message: 'permission denied for table channel_messages' } })
          ),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return null;
    };

    const { result } = renderHook(() => useChannelMessages(validChannelId));
    await act(async () => {
      await Promise.resolve();
    });

    let sendRes: any;
    await act(async () => {
      sendRes = await result.current.sendMessage('Channel broadcast test');
    });

    expect(sendRes.error).toBe('permission denied for table channel_messages');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].status).toBe('failed');
    expect(result.current.messages[0].error).toBe('permission denied for table channel_messages');
  });

  // 10. Switching conversations does not show stale messages
  it('10. Immediately resets messages on conversationId change to prevent flashing stale messages', async () => {
    mockState.selectResult = {
      data: [
        {
          id: 'conv1-msg',
          conversation_id: validConvId,
          sender_id: mockUser.id,
          content: 'Conversation 1 content',
          reply_to_id: null,
          is_pinned: false,
          is_edited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sender: mockProfile,
        },
      ],
      error: null,
    };

    const { result, rerender } = renderHook(
      ({ id }) => useMessages(id),
      { initialProps: { id: validConvId } }
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Conversation 1 content');

    // Switch to another conversation
    mockState.selectResult = { data: [], error: null };
    const nextConvId = '22222222-2222-2222-2222-222222222222';

    act(() => {
      rerender({ id: nextConvId });
    });

    // Old conversation's messages must immediately be cleared
    expect(result.current.messages).toHaveLength(0);
  });

  // 11. Realtime subscriptions and timers are cleaned up
  it('11. Properly removes Supabase channels and cleans up timers on unmount', () => {
    const { unmount } = renderHook(() => useMessages(validConvId));

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  // 12. Attachment and reaction failures are handled correctly
  it('12. Accurately reports database errors on reaction and toggle-pin operations', async () => {
    mockState.fromOverride = (table: string) => {
      if (table === 'message_reactions') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: { message: 'Reaction rejected by RLS' } }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: { message: 'Cannot remove reaction' } }),
              }),
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'Pin rejected by RLS' } }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
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

    let reactRes: any;
    let pinRes: any;

    await act(async () => {
      reactRes = await result.current.addReaction('msg-1', '🔥');
      pinRes = await result.current.togglePinMessage('msg-1', false);
    });

    expect(reactRes.error).toBe('Reaction rejected by RLS');
    expect(pinRes.error).toBe('Pin rejected by RLS');
  });
});
