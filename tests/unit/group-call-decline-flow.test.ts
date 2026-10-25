import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';

// Hoisted mocks
const {
  mockUser,
  mockProfile,
  mockSupabase,
  channelCallbacks,
  mockToast,
  mockDbUpdate,
} = vi.hoisted(() => {
  const mockUser = {
    id: 'user-callee-222',
    email: 'callee@example.com',
  };

  const mockProfile = {
    username: 'CalleeUser',
    display_name: 'Callee User',
    avatar_url: null,
  };

  const mockToast = vi.fn();
  const channelCallbacks = new Map<string, Map<string, Function[]>>();

  const getOrCreateChannel = (topic: string) => {
    let topicMap = channelCallbacks.get(topic);
    if (!topicMap) {
      topicMap = new Map();
      channelCallbacks.set(topic, topicMap);
    }

    const channelObj: any = {
      topic,
      state: 'joined',
      on: vi.fn((type: string, filter: any, callback: Function) => {
        const eventName = filter?.event || type;
        let cbs = topicMap!.get(eventName);
        if (!cbs) {
          cbs = [];
          topicMap!.set(eventName, cbs);
        }
        cbs.push(callback);
        return channelObj;
      }),
      send: vi.fn().mockImplementation(async (msg: any) => {
        const eventName = msg.event;
        const listeners = topicMap!.get(eventName) || [];
        listeners.forEach((fn) => fn({ payload: msg.payload }));
        return null;
      }),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        channelObj.state = 'joined';
        if (cb) cb('SUBSCRIBED');
        return channelObj;
      }),
      unsubscribe: vi.fn().mockResolvedValue('ok'),
    };
    return channelObj;
  };

  const mockDbUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ data: null, error: null })),
  });

  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
        error: null,
      }),
    },
    channel: vi.fn().mockImplementation((topic: string) => getOrCreateChannel(topic)),
    removeChannel: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'call_session_group_123' }, error: null }),
        }),
      }),
      update: mockDbUpdate,
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'call-sess-squad-888', caller_id: 'user-caller-111', status: 'ringing' },
        error: null,
      }),
      then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
    }),
  };

  return {
    mockUser,
    mockProfile,
    mockSupabase,
    channelCallbacks,
    mockToast,
    mockDbUpdate,
  };
});

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    settings: {
      output_volume: 85,
      input_device_id: 'default',
    },
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
  getBrowserClient: () => mockSupabase,
  supabase: mockSupabase,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
  ToastProvider: ({ children }: any) => children,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

describe('Squad Group Call Decline Flow & Active Persistence Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelCallbacks.clear();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ token: 'mock-livekit-token' }),
    });

    if (typeof window !== 'undefined') {
      const MockAudioContext = function () {
        return {
          state: 'running',
          resume: vi.fn().mockResolvedValue(undefined),
          createOscillator: vi.fn().mockReturnValue({
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          }),
          createGain: vi.fn().mockReturnValue({
            connect: vi.fn(),
            gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          }),
          close: vi.fn().mockResolvedValue(undefined),
        };
      };
      (window as any).AudioContext = MockAudioContext;
      (window as any).webkitAudioContext = MockAudioContext;

      if (typeof window.HTMLMediaElement !== 'undefined') {
        window.HTMLMediaElement.prototype.pause = vi.fn();
        window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
      }

      if (typeof (globalThis as any).MediaStream === 'undefined') {
        (globalThis as any).MediaStream = class MockMediaStream {
          getTracks = vi.fn().mockReturnValue([]);
          getAudioTracks = vi.fn().mockReturnValue([]);
          getVideoTracks = vi.fn().mockReturnValue([]);
          addTrack = vi.fn();
          removeTrack = vi.fn();
        };
      }

      if (!navigator.mediaDevices) {
        (navigator as any).mediaDevices = {};
      }
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(
        new (globalThis as any).MediaStream()
      );

      class MockRTCPeerConnection {
        addTrack = vi.fn();
        removeTrack = vi.fn();
        getSenders = vi.fn().mockReturnValue([]);
        getTransceivers = vi.fn().mockReturnValue([]);
        addTransceiver = vi.fn().mockReturnValue({ sender: {}, receiver: {} });
        createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' });
        createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' });
        setLocalDescription = vi.fn().mockResolvedValue(undefined);
        setRemoteDescription = vi.fn().mockResolvedValue(undefined);
        close = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
      }
      (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
      (globalThis as any).RTCSessionDescription = class MockRTCSessionDescription {
        constructor(public init: any) {}
      };
      (globalThis as any).RTCIceCandidate = class MockRTCIceCandidate {
        constructor(public init: any) {}
      };
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('when callee declines an incoming squad group call, the squad call remains live and active', async () => {
    const { CallProvider, useCallContext } = await import('@/features/calls/call-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(CallProvider, null, children)
    );

    const { result } = renderHook(() => useCallContext(), { wrapper });

    // 1. Simulate incoming squad call from User 1 to User 2
    const calleeMailbox = channelCallbacks.get(`user-signals-${mockUser.id}`);
    const incomingCallListeners = calleeMailbox?.get('incoming_call') || [];

    await act(async () => {
      await Promise.all(
        incomingCallListeners.map((fn) =>
          fn({
            payload: {
              id: 'call-sess-squad-888',
              callerId: 'user-caller-111',
              callerName: 'User One',
              targetUserId: mockUser.id,
              conversationId: 'conv-group-squad-444',
              isVideo: false,
              isGroup: true,
              groupName: 'Elite Gamers Squad',
            },
          })
        )
      );
    });

    // Verify callee entered incoming_ringing and tracked the squad call
    expect(result.current.callStatus).toBe('incoming_ringing');
    expect(result.current.incomingCall).not.toBeNull();
    expect(result.current.incomingCall?.isGroup).toBe(true);
    expect(result.current.isSquadCallActive('conv-group-squad-444')).toBe(true);

    // Reset mockDbUpdate history to strictly track what happens on rejectCall
    mockDbUpdate.mockClear();

    // 2. Callee clicks "Dismiss" / "Decline" on the incoming ringing modal
    await act(async () => {
      result.current.rejectCall();
    });

    // A) Callee ringing state is dismissed
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.incomingCall).toBeNull();

    // B) CRITICAL: Database call_sessions was NOT updated with 'rejected' (squad call was not cancelled!)
    expect(mockDbUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));

    // C) CRITICAL: No call_rejected signal was sent to caller channel
    const callerChannel = channelCallbacks.get('user-signals-user-caller-111');
    const roomChannel = channelCallbacks.get('call-room-conv-group-squad-444');
    expect(mockSupabase.channel).not.toHaveBeenCalledWith('user-signals-user-caller-111');

    // D) CRITICAL: isSquadCallActive remains TRUE for this group!
    expect(result.current.isSquadCallActive('conv-group-squad-444')).toBe(true);
    expect(result.current.activeSquadCalls.has('conv-group-squad-444')).toBe(true);
  });

  it('clears squad call active state when squad_call_ended is broadcasted', async () => {
    const { CallProvider, useCallContext } = await import('@/features/calls/call-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(CallProvider, null, children)
    );

    const { result } = renderHook(() => useCallContext(), { wrapper });

    const calleeMailbox = channelCallbacks.get(`user-signals-${mockUser.id}`);
    const incomingCallListeners = calleeMailbox?.get('incoming_call') || [];
    const squadEndedListeners = calleeMailbox?.get('squad_call_ended') || [];

    // Callee receives group call and dismisses ringtone
    await act(async () => {
      await Promise.all(
        incomingCallListeners.map((fn) =>
          fn({
            payload: {
              id: 'call-sess-squad-888',
              callerId: 'user-caller-111',
              callerName: 'User One',
              targetUserId: mockUser.id,
              conversationId: 'conv-group-squad-444',
              isVideo: false,
              isGroup: true,
              groupName: 'Elite Gamers Squad',
            },
          })
        )
      );
    });

    act(() => {
      result.current.rejectCall();
    });

    expect(result.current.isSquadCallActive('conv-group-squad-444')).toBe(true);

    // Later, caller actually ends the call and broadcasts squad_call_ended
    act(() => {
      squadEndedListeners.forEach((fn) =>
        fn({
          payload: {
            conversation_id: 'conv-group-squad-444',
          },
        })
      );
    });

    // Now squad call is cleared
    expect(result.current.isSquadCallActive('conv-group-squad-444')).toBe(false);
    expect(result.current.activeSquadCalls.has('conv-group-squad-444')).toBe(false);
  });

  it('keeps squad call active when a user disconnects while other squadmates remain inside', async () => {
    const { CallProvider, useCallContext } = await import('@/features/calls/call-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(CallProvider, null, children)
    );

    const { result } = renderHook(() => useCallContext(), { wrapper });

    // Seed an active squad call with 2 participants (User 1 and Callee)
    act(() => {
      result.current.registerSquadCallActive?.('conv-group-squad-444', {
        id: 'call-sess-squad-888',
        conversation_id: 'conv-group-squad-444',
        status: 'active',
        participants: [
          { id: 'user-caller-111', name: 'User One' },
          { id: mockUser.id, name: 'Callee User' },
        ],
      });
    });

    expect(result.current.isSquadCallActive('conv-group-squad-444')).toBe(true);

    // Callee disconnects from call
    act(() => {
      result.current.endCall();
    });

    // Callee is now idle locally
    expect(result.current.callStatus).toBe('idle');

    // CRITICAL: Squad call is STILL ACTIVE on callee side because User One is still inside!
    expect(result.current.isSquadCallActive('conv-group-squad-444')).toBe(true);
    expect(result.current.activeSquadCalls.has('conv-group-squad-444')).toBe(true);

    // Database call_sessions was NOT updated with 'ended'
    expect(mockDbUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'ended' }));
  });
});
