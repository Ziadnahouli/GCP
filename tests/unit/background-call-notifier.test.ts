import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBackgroundCallNotifier } from '@/hooks/useBackgroundCallNotifier';

describe('useBackgroundCallNotifier - Background Calling & Native Alerts', () => {
  let mockRegister: ReturnType<typeof vi.fn>;
  let mockRequestPermission: ReturnType<typeof vi.fn>;
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;

  beforeEach(() => {
    mockRegister = vi.fn().mockResolvedValue({ scope: '/' });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: mockRegister },
      writable: true,
      configurable: true,
    });

    (window as any).PushManager = {};

    mockRequestPermission = vi.fn().mockResolvedValue('granted');
    (window as any).Notification = {
      requestPermission: mockRequestPermission,
    };

    mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    mockAudioContext = {
      currentTime: 0,
      state: 'running',
      createOscillator: vi.fn().mockReturnValue(mockOscillator),
      createGain: vi.fn().mockReturnValue(mockGain),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    (window as any).AudioContext = vi.fn().mockImplementation(() => mockAudioContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the /sw.js service worker on mount', () => {
    renderHook(() => useBackgroundCallNotifier());
    expect(mockRegister).toHaveBeenCalledWith('/sw.js');
  });

  it('requests native notification permission', async () => {
    const { result } = renderHook(() => useBackgroundCallNotifier());

    let granted = false;
    await act(async () => {
      granted = await result.current.requestNotificationPermission();
    });

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(granted).toBe(true);
  });

  it('synthesizes procedural dual-frequency ringtone using Web Audio API', () => {
    const { result } = renderHook(() => useBackgroundCallNotifier());

    act(() => {
      result.current.startRingtone();
    });

    expect((window as any).AudioContext).toHaveBeenCalledTimes(1);
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalled();

    // Clean up
    act(() => {
      result.current.stopRingtone();
    });

    expect(mockAudioContext.close).toHaveBeenCalledTimes(1);
  });
});
