import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installMixerAdapter, MixerAdapterApi, MixerState } from '../../src/lib/audio/mixer-adapter';

// Mock browser environment for testing mixer-adapter
function createMockEnvironment(origin = 'https://gcp-green.vercel.app') {
  const listeners: Record<string, ((event: any) => void)[]> = {};
  const intervals: Record<number, NodeJS.Timeout> = {};
  let nextIntervalId = 1;
  const postedMessages: any[] = [];

  const env = {
    location: { origin },
    postMessage: vi.fn((data: any, targetOrigin: string) => {
      postedMessages.push({ data, targetOrigin });
    }),
    addEventListener: vi.fn((type: string, listener: (event: any) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: any) => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((l) => l !== listener);
      }
    }),
    setInterval: vi.fn((callback: () => void, ms: number) => {
      const id = nextIntervalId++;
      const timer = setInterval(callback, ms);
      intervals[id] = timer;
      return id as any;
    }),
    clearInterval: vi.fn((id: number) => {
      if (intervals[id]) {
        clearInterval(intervals[id]);
        delete intervals[id];
      }
    }),
    // Helper to simulate an incoming message event
    simulateMessage(data: any, msgOrigin = origin) {
      const event = {
        source: env,
        origin: msgOrigin,
        data,
      };
      (listeners['message'] || []).forEach((l) => l(event));
    },
    getPostedMessages() {
      return postedMessages;
    },
    cleanupTimers() {
      Object.keys(intervals).forEach((id) => {
        clearInterval(intervals[Number(id)]);
        delete intervals[Number(id)];
      });
    },
  };

  return env;
}

describe('Mixer Adapter Specification & Integration Contract', () => {
  let env: ReturnType<typeof createMockEnvironment>;

  beforeEach(() => {
    vi.useFakeTimers();
    env = createMockEnvironment();
  });

  afterEach(() => {
    env.cleanupTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('validates API shape and throws if any required method is missing', () => {
    const incompleteApi = {
      getState: () => ({} as any),
      setMicMuted: () => {},
      // missing setDeafened, setVolume, forceMute
    };

    expect(() => installMixerAdapter(incompleteApi as any, env as any)).toThrow(
      'Missing mixer API: setDeafened'
    );
  });

  it('publishes initial state immediately and every 100ms interval', () => {
    let state: MixerState = {
      connected: true,
      callId: 'server-1:channel-99',
      room: '#General Voice',
      mic_muted: true,
      deafened: false,
      volume: 85,
    };

    const api: MixerAdapterApi = {
      getState: () => state,
      setMicMuted: vi.fn(),
      setDeafened: vi.fn(),
      setVolume: vi.fn(),
      forceMute: vi.fn(),
    };

    const cleanup = installMixerAdapter(api, env as any);

    // Initial publish occurs synchronously
    const messages = env.getPostedMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].data.channel).toBe('gcp-mixer-state-v2');
    expect(messages[0].data.payload.state).toEqual(state);
    expect(messages[0].data.payload.needsMute).toBe(true); // inactive before first handshake

    // Advance 100ms
    vi.advanceTimersByTime(100);
    expect(messages.length).toBe(2);

    cleanup();
  });

  const flushPromises = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  it('handles companion pairing and enforces mic starts muted', async () => {
    let state: MixerState = {
      connected: true,
      callId: 'call-uuid-123',
      room: 'Lounge',
      mic_muted: true,
      deafened: false,
      volume: 80,
    };

    const api: MixerAdapterApi = {
      getState: () => state,
      setMicMuted: vi.fn().mockImplementation((muted: boolean) => {
        state.mic_muted = muted;
      }),
      setDeafened: vi.fn().mockImplementation((deafened: boolean) => {
        state.deafened = deafened;
      }),
      setVolume: vi.fn().mockImplementation((vol: number) => {
        state.volume = vol;
      }),
      forceMute: vi.fn().mockImplementation(() => {
        state.mic_muted = true;
      }),
    };

    const cleanup = installMixerAdapter(api, env as any);

    // Initial connection attempt with mic_muted: false must be rejected/ignored on new epoch
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-1',
        revision: 1,
        binding: 'desktop-agent:call-uuid-123',
        desired: {
          mic_muted: false, // Trying to start unmuted!
          deafened: false,
          volume: 80,
        },
      },
    });

    await flushPromises();
    // Force mute was called and mic was NOT set to false
    expect(api.forceMute).toHaveBeenCalled();
    expect(state.mic_muted).toBe(true);

    // Legitimate first handshake pairing must have mic_muted: true
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-1',
        revision: 2,
        binding: 'desktop-agent:call-uuid-123',
        desired: {
          mic_muted: true,
          deafened: false,
          volume: 80,
        },
      },
    });

    await flushPromises();
    expect(api.setMicMuted).toHaveBeenCalledWith(true);

    cleanup();
  });

  it('processes valid command sequence for mute, deafen, and volume updates', async () => {
    let state: MixerState = {
      connected: true,
      callId: 'call-xyz',
      room: 'Race Comms',
      mic_muted: true,
      deafened: false,
      volume: 75,
    };

    const api: MixerAdapterApi = {
      getState: () => state,
      setMicMuted: vi.fn().mockImplementation(async (muted: boolean) => {
        state.mic_muted = muted;
      }),
      setDeafened: vi.fn().mockImplementation(async (deafened: boolean) => {
        state.deafened = deafened;
      }),
      setVolume: vi.fn().mockImplementation(async (vol: number) => {
        state.volume = vol;
      }),
      forceMute: vi.fn(),
    };

    const cleanup = installMixerAdapter(api, env as any);

    // Initial handshake
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-alpha',
        revision: 1,
        binding: 'companion:call-xyz',
        desired: { mic_muted: true, deafened: false, volume: 75 },
      },
    });
    await flushPromises();

    // Now send unmute and adjust volume to 90%
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-alpha',
        revision: 2,
        binding: 'companion:call-xyz',
        desired: { mic_muted: false, volume: 90 },
      },
    });
    await flushPromises();

    expect(api.setMicMuted).toHaveBeenCalledWith(false);
    expect(api.setVolume).toHaveBeenCalledWith(90);
    expect(state.mic_muted).toBe(false);
    expect(state.volume).toBe(90);

    // Deafen comms while keeping mic independent
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-alpha',
        revision: 3,
        binding: 'companion:call-xyz',
        desired: { deafened: true },
      },
    });
    await flushPromises();

    expect(api.setDeafened).toHaveBeenCalledWith(true);
    expect(state.deafened).toBe(true);
    expect(state.mic_muted).toBe(false); // Mic state remains completely independent

    cleanup();
  });

  it('rejects commands for other calls (multi-tab isolation)', async () => {
    let state: MixerState = {
      connected: true,
      callId: 'tab-1-call-id',
      room: 'Room A',
      mic_muted: true,
      deafened: false,
      volume: 100,
    };

    const api: MixerAdapterApi = {
      getState: () => state,
      setMicMuted: vi.fn(),
      setDeafened: vi.fn(),
      setVolume: vi.fn(),
      forceMute: vi.fn(),
    };

    const cleanup = installMixerAdapter(api, env as any);

    // Send command targeting a different callId binding
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-1',
        revision: 1,
        binding: 'companion:different-call-id',
        desired: { mic_muted: true },
      },
    });
    await flushPromises();

    expect(api.setMicMuted).not.toHaveBeenCalled();

    cleanup();
  });

  it('fails closed and force-mutes when watchdog heartbeat expires (>1500ms)', async () => {
    let state: MixerState = {
      connected: true,
      callId: 'active-call-watchdog',
      room: 'Pit Wall',
      mic_muted: false,
      deafened: false,
      volume: 100,
    };

    const api: MixerAdapterApi = {
      getState: () => state,
      setMicMuted: vi.fn().mockImplementation((muted: boolean) => {
        state.mic_muted = muted;
      }),
      setDeafened: vi.fn(),
      setVolume: vi.fn(),
      forceMute: vi.fn().mockImplementation(() => {
        state.mic_muted = true;
      }),
    };

    const cleanup = installMixerAdapter(api, env as any);

    // Handshake
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-dog',
        revision: 1,
        binding: 'companion:active-call-watchdog',
        desired: { mic_muted: true },
      },
    });
    await flushPromises();

    // Explicitly unmute
    env.simulateMessage({
      channel: 'gcp-mixer-command-v2',
      payload: {
        kind: 'command',
        epoch: 'epoch-dog',
        revision: 2,
        binding: 'companion:active-call-watchdog',
        desired: { mic_muted: false },
      },
    });
    await flushPromises();
    expect(state.mic_muted).toBe(false);

    // Advance 1600ms without companion heartbeat
    vi.advanceTimersByTime(1600);
    await flushPromises();

    // Watchdog triggered failClosed -> forceMute
    expect(api.forceMute).toHaveBeenCalled();
    expect(state.mic_muted).toBe(true);

    cleanup();
  });

  it('triggers failClosed and gates mic when cleanup is executed on call exit', () => {
    let state: MixerState = {
      connected: true,
      callId: 'call-to-leave',
      room: 'Debrief',
      mic_muted: false,
      deafened: false,
      volume: 90,
    };

    const api: MixerAdapterApi = {
      getState: () => state,
      setMicMuted: vi.fn().mockImplementation((muted: boolean) => {
        state.mic_muted = muted;
      }),
      setDeafened: vi.fn(),
      setVolume: vi.fn(),
      forceMute: vi.fn().mockImplementation(() => {
        state.mic_muted = true;
      }),
    };

    const cleanup = installMixerAdapter(api, env as any);
    expect(env.clearInterval).not.toHaveBeenCalled();

    // Call exit cleanup
    cleanup();

    expect(api.forceMute).toHaveBeenCalled();
    expect(env.clearInterval).toHaveBeenCalled();
    expect(env.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
