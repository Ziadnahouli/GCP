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
} = vi.hoisted(() => {
  const mockUser = {
    id: 'user-current-111',
    email: 'current@example.com',
  };

  const mockProfile = {
    username: 'CurrentUser',
    display_name: 'Current User',
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
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'call_session_123' }, error: null }),
        }),
      }),
      update: mockDbUpdate,
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
    }),
  };

  return {
    mockUser,
    mockProfile,
    mockSupabase,
    channelCallbacks,
    mockToast,
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

describe('Private Call Decline Signaling & Re-Calling Elimination', () => {
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

  it('rejectCall sends guaranteed direct signal to caller mailbox and updates database', async () => {
    const { CallProvider, useCallContext } = await import('@/features/calls/call-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(CallProvider, null, children)
    );

    const { result } = renderHook(() => useCallContext(), { wrapper });

    // Simulate callee receiving an incoming call from user-caller-other-222
    const calleeMailbox = channelCallbacks.get(`user-signals-${mockUser.id}`);
    const incomingCallListeners = calleeMailbox?.get('incoming_call') || [];

    act(() => {
      incomingCallListeners.forEach((fn) =>
        fn({
          payload: {
            callerId: 'user-caller-other-222',
            callerName: 'Caller User',
            targetUserId: mockUser.id,
            conversationId: 'conv-private-999',
            isVideo: false,
          },
        })
      );
    });

    expect(result.current.callStatus).toBe('incoming_ringing');
    expect(result.current.incomingCall).not.toBeNull();
    expect(result.current.incomingCall?.callerId).toBe('user-caller-other-222');

    // Callee rejects the call
    await act(async () => {
      result.current.rejectCall();
    });

    // 1. Callee state is reset to idle
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.incomingCall).toBeNull();

    // 2. Database call_sessions update was invoked with status 'rejected'
    expect(mockSupabase.from).toHaveBeenCalledWith('call_sessions');

    // 3. Guaranteed direct signal was sent to caller channel 'user-signals-user-caller-other-222'
    expect(mockSupabase.channel).toHaveBeenCalledWith(
      'user-signals-user-caller-other-222',
      { config: { private: true } }
    );
    expect(mockSupabase.channel).toHaveBeenCalledWith(
      'call-room-conv-private-999',
      { config: { private: true } }
    );
  });

  it('suppresses incoming_call beacons for recently declined calls and re-dispatches rejection', async () => {
    const { CallProvider, useCallContext } = await import('@/features/calls/call-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(CallProvider, null, children)
    );

    const { result } = renderHook(() => useCallContext(), { wrapper });

    const calleeMailbox = channelCallbacks.get(`user-signals-${mockUser.id}`);
    const incomingCallListeners = calleeMailbox?.get('incoming_call') || [];

    // Callee receives and declines call
    act(() => {
      incomingCallListeners.forEach((fn) =>
        fn({
          payload: {
            callerId: 'user-caller-other-222',
            callerName: 'Caller User',
            targetUserId: mockUser.id,
            conversationId: 'conv-private-999',
            isVideo: false,
          },
        })
      );
    });

    act(() => {
      result.current.rejectCall();
    });

    expect(result.current.callStatus).toBe('idle');

    // Stray in-flight incoming_call beacon arrives from caller 1 second later
    act(() => {
      incomingCallListeners.forEach((fn) =>
        fn({
          payload: {
            callerId: 'user-caller-other-222',
            callerName: 'Caller User',
            targetUserId: mockUser.id,
            conversationId: 'conv-private-999',
            isVideo: false,
          },
        })
      );
    });

    // Callee must REMAIN idle, NOT entering incoming_ringing or ringing again!
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.incomingCall).toBeNull();
  });

  it('caller transitions to idle immediately upon receiving call_rejected broadcast', async () => {
    const { CallProvider, useCallContext } = await import('@/features/calls/call-context');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(CallProvider, null, children)
    );

    const { result } = renderHook(() => useCallContext(), { wrapper });

    // Caller initiates private call to squadmate
    await act(async () => {
      await result.current.startCall('user-callee-other-333', 'conv-private-999', false);
    });

    expect(result.current.callStatus).toBe('outgoing_ringing');

    // Callee sends call_rejected into caller's mailbox
    const callerMailbox = channelCallbacks.get(`user-signals-${mockUser.id}`);
    const callRejectedListeners = callerMailbox?.get('call_rejected') || [];

    act(() => {
      callRejectedListeners.forEach((fn) => fn({ payload: { conversationId: 'conv-private-999' } }));
    });

    // Caller immediately resets to idle
    expect(result.current.callStatus).toBe('idle');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Call Declined',
      })
    );
  });
});
