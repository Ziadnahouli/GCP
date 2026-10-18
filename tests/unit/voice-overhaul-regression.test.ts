import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderHook, act } from '@testing-library/react';
import { RoomEvent, Track } from 'livekit-client';

const {
  mockUser,
  mockProfile,
  mockSupabase,
  roomState,
  MockLiveKitRoom,
} = vi.hoisted(() => {
  const mockUser = { id: '00000000-0000-0000-0000-000000000001', email: 'gamer1@example.com' };
  const mockProfile = {
    id: '00000000-0000-0000-0000-000000000001',
    username: 'gamer_one',
    display_name: 'Gamer One',
    avatar_url: null,
  };

  const roomState = {
    activeInstance: null as any,
    listeners: new Map<string, Function[]>(),
  };

  class MockLiveKitRoom {
    state = 'disconnected';
    localParticipant: any;
    remoteParticipants = new Map();

    constructor() {
      roomState.activeInstance = this;
      roomState.listeners.clear();

      const mockLocalTrack = {
        kind: 'audio',
        enabled: true,
        muted: false,
        mute: vi.fn().mockImplementation(async () => {
          mockLocalTrack.muted = true;
        }),
        unmute: vi.fn().mockImplementation(async () => {
          mockLocalTrack.muted = false;
        }),
        stop: vi.fn(),
        mediaStreamTrack: { enabled: true, stop: vi.fn() },
      };

      const mockPublication = {
        track: mockLocalTrack,
        source: 'microphone',
        isMuted: false,
      };

      this.localParticipant = {
        identity: mockUser.id,
        audioTrackPublications: new Map([['mic_pub', mockPublication]]),
        publishTrack: vi.fn().mockResolvedValue(mockPublication),
        unpublishTrack: vi.fn().mockResolvedValue(undefined),
        setMicrophoneEnabled: vi.fn().mockImplementation(async (enabled: boolean) => {
          mockLocalTrack.enabled = enabled;
          mockLocalTrack.muted = !enabled;
        }),
      };
    }

    on(event: string, handler: Function) {
      if (!roomState.listeners.has(event)) {
        roomState.listeners.set(event, []);
      }
      roomState.listeners.get(event)!.push(handler);
      return this;
    }

    off(event: string, handler: Function) {
      const list = roomState.listeners.get(event);
      if (list) {
        roomState.listeners.set(event, list.filter((h) => h !== handler));
      }
      return this;
    }

    emit(event: string, ...args: any[]) {
      const handlers = roomState.listeners.get(event) || [];
      handlers.forEach((h) => h(...args));
    }

    connect = vi.fn().mockImplementation(async () => {
      this.state = 'connected';
      this.emit(RoomEvent.Connected);
    });

    disconnect = vi.fn().mockImplementation(() => {
      this.state = 'disconnected';
      this.emit(RoomEvent.Disconnected);
    });

    startAudio = vi.fn().mockResolvedValue(undefined);
  }

  const mockRealtimeChannel: any = {
    send: vi.fn().mockResolvedValue(null),
    track: vi.fn(),
    untrack: vi.fn(),
    on: vi.fn().mockImplementation(function () { return mockRealtimeChannel; }),
    subscribe: vi.fn((cb) => {
      if (cb) cb('SUBSCRIBED');
      return mockRealtimeChannel;
    }),
    unsubscribe: vi.fn().mockResolvedValue('ok'),
  };

  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-supabase-jwt' } },
        error: null,
      }),
    },
    channel: vi.fn().mockReturnValue(mockRealtimeChannel),
    removeChannel: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
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
    roomState,
    MockLiveKitRoom,
  };
});

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    settings: { noise_suppression: true },
    isConfigured: true,
  }),
  useOptionalAuth: () => ({
    user: mockUser,
    profile: mockProfile,
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => mockSupabase,
  createClient: () => mockSupabase,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('livekit-client', async () => {
  const actual = await vi.importActual<any>('livekit-client');
  return {
    ...actual,
    Room: MockLiveKitRoom,
    createLocalAudioTrack: vi.fn().mockResolvedValue({
      kind: 'audio',
      stop: vi.fn(),
      mediaStreamTrack: { enabled: true, stop: vi.fn() },
    }),
  };
});

describe('Real Production Voice Lifecycle & Audio Duplication Elimination Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roomState.listeners.clear();
    roomState.activeInstance = null;
    localStorage.clear();

    // Mock global fetch for LiveKit token route
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/calls/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            isConfigured: true,
            token: 'valid-livekit-jwt',
            url: 'wss://livekit.nexus.gg',
            roomName: 'nexus-voice-channel-123',
            mode: 'livekit',
          }),
          text: async () => '',
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    // Mock AudioContext and media devices if not in jsdom
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
          createMediaStreamSource: vi.fn().mockReturnValue({
            connect: vi.fn(),
            disconnect: vi.fn(),
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
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Server Voice Channel Lifecycle via ServerVoiceProvider', () => {
    it('executes joinVoiceChannel, connects LiveKit SFU, and enforces transport exclusivity', async () => {
      const { ServerVoiceProvider, useServerVoiceContext } = await import('@/features/servers/server-voice-context');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ServerVoiceProvider, null, children)
      );

      const { result } = renderHook(() => useServerVoiceContext(), { wrapper });

      expect(result.current.isVoiceConnected).toBe(false);
      expect(result.current.isLiveKitActive).toBe(false);

      // Join voice channel
      await act(async () => {
        await result.current.joinVoiceChannel('server-123', 'channel-456', 'Main Server', 'General Voice');
      });

      // Verify token was requested
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/calls/token',
        expect.objectContaining({
          method: 'POST',
        })
      );

      // Verify LiveKit Room was instantiated and connected
      expect(roomState.activeInstance).not.toBeNull();
      act(() => {
        roomState.activeInstance.emit(RoomEvent.Connected);
      });

      // Transport exclusivity: LiveKit SFU is authoritative
      expect(result.current.isVoiceConnected).toBe(true);
      expect(result.current.isLiveKitActive).toBe(true);
      expect(result.current.activeServerId).toBe('server-123');
      expect(result.current.activeChannelId).toBe('channel-456');
    });

    it('toggles microphone muting idempotently without republishing tracks', async () => {
      const { ServerVoiceProvider, useServerVoiceContext } = await import('@/features/servers/server-voice-context');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ServerVoiceProvider, null, children)
      );

      const { result } = renderHook(() => useServerVoiceContext(), { wrapper });

      await act(async () => {
        await result.current.joinVoiceChannel('server-123', 'channel-456');
      });

      const initialPubCount = roomState.activeInstance.localParticipant.publishTrack.mock.calls.length;

      // Toggle mic to muted
      await act(async () => {
        result.current.toggleMic();
      });
      expect(result.current.isMicMuted).toBe(true);

      // Toggle mic back to unmuted
      await act(async () => {
        result.current.toggleMic();
      });
      expect(result.current.isMicMuted).toBe(false);

      // Verify no duplicate track was published
      expect(roomState.activeInstance.localParticipant.publishTrack.mock.calls.length).toBe(initialPubCount);
    });

    it('attaches remote audio tracks to a single authoritative sink and prevents duplicate audio elements', async () => {
      const { ServerVoiceProvider, useServerVoiceContext } = await import('@/features/servers/server-voice-context');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ServerVoiceProvider, null, children)
      );

      const { result } = renderHook(() => useServerVoiceContext(), { wrapper });

      await act(async () => {
        await result.current.joinVoiceChannel('server-123', 'channel-456');
      });

      const mockAudioElement = document.createElement('audio');
      mockAudioElement.play = vi.fn().mockResolvedValue(undefined);

      const mockRemoteTrack = {
        kind: Track.Kind.Audio,
        source: 'microphone',
        mediaStreamTrack: { enabled: true },
        attach: vi.fn(() => mockAudioElement),
        detach: vi.fn(() => [mockAudioElement]),
      };

      const mockRemoteParticipant = {
        identity: 'remote-user-bob',
        name: 'Bob',
      };

      // Simulate remote participant track subscription
      act(() => {
        roomState.activeInstance.emit(RoomEvent.TrackSubscribed, mockRemoteTrack, null, mockRemoteParticipant);
      });

      expect(mockRemoteTrack.attach).toHaveBeenCalledTimes(1);
      expect(mockAudioElement.id).toBe('remote-livekit-audio-remote-user-bob');
      expect(mockAudioElement.volume).toBe(1.0);
      expect(mockAudioElement.muted).toBe(false);

      // Simulate re-subscription (e.g., reconnect or track update) for the SAME peer
      act(() => {
        roomState.activeInstance.emit(RoomEvent.TrackSubscribed, mockRemoteTrack, null, mockRemoteParticipant);
      });

      // Track detach must have been called on previous element to eliminate duplicate playback
      expect(mockRemoteTrack.detach).toHaveBeenCalled();
    });

    it('cleans up remote audio element and audio nodes on TrackUnsubscribed', async () => {
      const { ServerVoiceProvider, useServerVoiceContext } = await import('@/features/servers/server-voice-context');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ServerVoiceProvider, null, children)
      );

      const { result } = renderHook(() => useServerVoiceContext(), { wrapper });

      await act(async () => {
        await result.current.joinVoiceChannel('server-123', 'channel-456');
      });

      const mockAudioElement = document.createElement('audio');
      mockAudioElement.play = vi.fn().mockResolvedValue(undefined);
      const pauseSpy = vi.spyOn(mockAudioElement, 'pause');

      const mockRemoteTrack = {
        kind: Track.Kind.Audio,
        source: 'microphone',
        mediaStreamTrack: { enabled: true },
        attach: vi.fn(() => mockAudioElement),
        detach: vi.fn(() => [mockAudioElement]),
      };

      const mockRemoteParticipant = {
        identity: 'remote-user-charlie',
        name: 'Charlie',
      };

      act(() => {
        roomState.activeInstance.emit(RoomEvent.TrackSubscribed, mockRemoteTrack, null, mockRemoteParticipant);
      });

      // Participant unsubscribes track
      act(() => {
        roomState.activeInstance.emit(RoomEvent.TrackUnsubscribed, mockRemoteTrack, null, mockRemoteParticipant);
      });

      expect(mockRemoteTrack.detach).toHaveBeenCalled();
      expect(pauseSpy).toHaveBeenCalled();
      expect(mockAudioElement.srcObject).toBeNull();
    });

    it('disconnects and resets all voice states when disconnectVoice is called', async () => {
      const { ServerVoiceProvider, useServerVoiceContext } = await import('@/features/servers/server-voice-context');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(ServerVoiceProvider, null, children)
      );

      const { result } = renderHook(() => useServerVoiceContext(), { wrapper });

      await act(async () => {
        await result.current.joinVoiceChannel('server-123', 'channel-456');
      });

      // Leave voice channel
      act(() => {
        result.current.disconnectVoice();
      });

      expect(roomState.activeInstance.disconnect).toHaveBeenCalled();
      expect(result.current.isVoiceConnected).toBe(false);
      expect(result.current.activeServerId).toBeNull();
      expect(result.current.activeChannelId).toBeNull();
    });
  });

  describe('2. Direct Private Call Lifecycle via CallProvider', () => {
    it('initializes in idle state and manages call cleanup cleanly', async () => {
      const { CallProvider, useCallContext } = await import('@/features/calls/call-context');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        React.createElement(CallProvider, null, children)
      );

      const { result } = renderHook(() => useCallContext(), { wrapper });

      expect(result.current.callStatus).toBe('idle');
      expect(result.current.isLiveKitActive).toBe(false);
      expect(result.current.activeConversationId).toBeNull();

      // End call when idle is safe and resets clean state
      act(() => {
        result.current.endCall();
      });

      expect(result.current.callStatus).toBe('idle');
      expect(result.current.localStream).toBeNull();
      expect(result.current.remoteStream).toBeNull();
    });
  });

  describe('3. Safe Constraints Polyfill & OverconstrainedError Handling', () => {
    it('relaxes audio constraints when browser throws OverconstrainedError', async () => {
      const { installSafeConstraintsPolyfill } = await import('@/lib/webrtc/safe-constraints');

      const appliedList: any[] = [];
      const mockTrack = {
        kind: 'audio',
        applyConstraints: vi.fn(async (c: any) => {
          appliedList.push(c);
          if (c && c.sampleRate) {
            const err: any = new Error('Cannot satisfy constraints');
            err.name = 'OverconstrainedError';
            throw err;
          }
          return undefined;
        }),
      };

      (global as any).MediaStreamTrack = function () {};
      (global as any).MediaStreamTrack.prototype = mockTrack;

      installSafeConstraintsPolyfill();

      await mockTrack.applyConstraints({
        sampleRate: 48000,
        echoCancellation: true,
        noiseSuppression: true,
      });

      expect(appliedList.length).toBe(2);
      expect(appliedList[0].sampleRate).toBe(48000);
      expect(appliedList[1].sampleRate).toBeUndefined();
      expect(appliedList[1].echoCancellation).toBe(true);
      expect(appliedList[1].noiseSuppression).toBe(true);
    });
  });
});
