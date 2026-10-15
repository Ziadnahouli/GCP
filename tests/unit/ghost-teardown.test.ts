import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GhostTeardownEngine, TeardownConfig } from '@/lib/webrtc/GhostTeardownEngine';

describe('GhostTeardownEngine - Ghost Call Annihilation & Teardown Protocol', () => {
  let mockTrack1: { stop: ReturnType<typeof vi.fn>; enabled: boolean };
  let mockTrack2: { stop: ReturnType<typeof vi.fn>; enabled: boolean };
  let mockStream: { getTracks: ReturnType<typeof vi.fn> };
  let mockPc: { close: ReturnType<typeof vi.fn>; iceConnectionState: RTCIceConnectionState; oniceconnectionstatechange: (() => void) | null };
  let mockOnTerminated: ReturnType<typeof vi.fn>;
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockTrack1 = { stop: vi.fn(), enabled: true };
    mockTrack2 = { stop: vi.fn(), enabled: true };
    mockStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack1, mockTrack2]),
    };

    mockPc = {
      close: vi.fn(),
      iceConnectionState: 'connected',
      oniceconnectionstatechange: null,
    };

    mockOnTerminated = vi.fn();

    sendBeaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconMock,
      writable: true,
      configurable: true,
    });

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('immediately kills all hardware media tracks and disables them', () => {
    const config: TeardownConfig = {
      callId: 'call_99',
      peerId: 'peer_1',
      signalingEndpoint: 'https://api.veloq.gg',
      authToken: 'token_123',
      pc: mockPc as unknown as RTCPeerConnection,
      localStream: mockStream as unknown as MediaStream,
      onCallTerminated: mockOnTerminated,
    };

    const engine = new GhostTeardownEngine(config);
    engine.executeImmediateTeardown('user_hangup');

    expect(mockTrack1.stop).toHaveBeenCalledTimes(1);
    expect(mockTrack1.enabled).toBe(false);
    expect(mockTrack2.stop).toHaveBeenCalledTimes(1);
    expect(mockTrack2.enabled).toBe(false);
    expect(mockPc.close).toHaveBeenCalledTimes(1);
    expect(mockOnTerminated).toHaveBeenCalledWith('user_hangup');
  });

  it('transmits unblockable exit beacon to signaling endpoint', () => {
    const config: TeardownConfig = {
      callId: 'call_99',
      peerId: 'peer_1',
      signalingEndpoint: 'https://api.veloq.gg',
      authToken: 'token_123',
      pc: mockPc as unknown as RTCPeerConnection,
      localStream: mockStream as unknown as MediaStream,
      onCallTerminated: mockOnTerminated,
    };

    const engine = new GhostTeardownEngine(config);
    engine.executeImmediateTeardown('window_closed');

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const beaconUrl = sendBeaconMock.mock.calls[0][0];
    expect(beaconUrl).toBe('https://api.veloq.gg/api/calls/call_99/leave');
  });

  it('falls back to fetch keepalive if sendBeacon fails', () => {
    sendBeaconMock.mockReturnValue(false);

    const config: TeardownConfig = {
      callId: 'call_88',
      peerId: 'peer_2',
      signalingEndpoint: 'https://api.veloq.gg',
      authToken: 'token_abc',
      pc: mockPc as unknown as RTCPeerConnection,
      localStream: null,
      onCallTerminated: mockOnTerminated,
    };

    const engine = new GhostTeardownEngine(config);
    engine.executeImmediateTeardown('browser_exit');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.veloq.gg/api/calls/call_88/leave',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      })
    );
  });

  it('tears down call if signaling server prunes session with 404 heartbeat', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const config: TeardownConfig = {
      callId: 'call_prune',
      peerId: 'peer_prune',
      signalingEndpoint: 'https://api.veloq.gg',
      authToken: 'token_prune',
      pc: mockPc as unknown as RTCPeerConnection,
      localStream: mockStream as unknown as MediaStream,
      onCallTerminated: mockOnTerminated,
    };

    const engine = new GhostTeardownEngine(config);

    // Fast-forward 2.5s to trigger signaling heartbeat
    await vi.advanceTimersByTimeAsync(2500);

    expect(mockOnTerminated).toHaveBeenCalledWith('server_pruned_session');
    expect(engine.destroyed).toBe(true);
  });

  it('drops peer connection if ICE connection freezes for 5 seconds', () => {
    const config: TeardownConfig = {
      callId: 'call_ice',
      peerId: 'peer_ice',
      signalingEndpoint: 'https://api.veloq.gg',
      authToken: 'token_ice',
      pc: mockPc as unknown as RTCPeerConnection,
      localStream: null,
      onCallTerminated: mockOnTerminated,
    };

    const engine = new GhostTeardownEngine(config);

    // Simulate ICE state change to disconnected
    mockPc.iceConnectionState = 'disconnected';
    if (mockPc.oniceconnectionstatechange) {
      mockPc.oniceconnectionstatechange();
    }

    // 4 seconds passed - should still be alive
    vi.advanceTimersByTime(4000);
    expect(engine.destroyed).toBe(false);

    // 5 seconds elapsed - watchdog triggers
    vi.advanceTimersByTime(1100);
    expect(engine.destroyed).toBe(true);
    expect(mockOnTerminated).toHaveBeenCalledWith('ice_timeout_5s_exceeded');
  });

  it('cancels ICE timeout if connection state recovers before 5 seconds', () => {
    const config: TeardownConfig = {
      callId: 'call_recover',
      peerId: 'peer_recover',
      signalingEndpoint: 'https://api.veloq.gg',
      authToken: 'token_recover',
      pc: mockPc as unknown as RTCPeerConnection,
      localStream: null,
      onCallTerminated: mockOnTerminated,
    };

    const engine = new GhostTeardownEngine(config);

    // Disconnect
    mockPc.iceConnectionState = 'disconnected';
    mockPc.oniceconnectionstatechange?.();

    vi.advanceTimersByTime(3000);
    expect(engine.destroyed).toBe(false);

    // Recovers
    mockPc.iceConnectionState = 'connected';
    mockPc.oniceconnectionstatechange?.();

    // Advance past 5s
    vi.advanceTimersByTime(3000);
    expect(engine.destroyed).toBe(false);
    expect(mockOnTerminated).not.toHaveBeenCalled();

    engine.destroy();
  });
});
