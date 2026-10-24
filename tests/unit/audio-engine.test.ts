import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioEngine } from '@/lib/webrtc/audio-engine';
import { getAudioEngineDiagnostics } from '@/lib/webrtc/audio-processing-policy';

describe('N9 — AudioEngine Singleton & Lifecycle Management', () => {
  let mockAddModule: ReturnType<typeof vi.fn>;
  let mockContextInstance: any;

  beforeEach(() => {
    AudioEngine._resetInstanceForTesting();
    mockAddModule = vi.fn().mockResolvedValue(undefined);

    mockContextInstance = {
      sampleRate: 48000,
      state: 'running',
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      audioWorklet: {
        addModule: mockAddModule,
      },
    };

    // Install mock AudioContext on window
    (window as any).AudioContext = vi.fn().mockImplementation(() => mockContextInstance);
  });

  it('guarantees a single AudioEngine singleton instance', () => {
    const engine1 = AudioEngine.getInstance();
    const engine2 = AudioEngine.getInstance();
    expect(engine1).toBe(engine2);
  });

  it('maintains exactly one shared AudioContext across multiple acquisitions', async () => {
    const engine = AudioEngine.getInstance();
    const ctx1 = await engine.getAudioContext();
    const ctx2 = await engine.getAudioContext();

    expect(ctx1).toBe(ctx2);
    expect((window as any).AudioContext).toHaveBeenCalledTimes(1);
    expect(ctx1?.sampleRate).toBe(48000);
  });

  it('loads the worklet module exactly once on the shared AudioContext', async () => {
    const engine = AudioEngine.getInstance();
    const ctx = await engine.getAudioContext();

    const loaded1 = await engine.ensureWorkletModuleLoaded(ctx!);
    const loaded2 = await engine.ensureWorkletModuleLoaded(ctx!);

    expect(loaded1).toBe(true);
    expect(loaded2).toBe(true);
    expect(mockAddModule).toHaveBeenCalledTimes(1);
    expect(mockAddModule).toHaveBeenCalledWith('/worklets/gcp-rnnoise-processor.js');
  });

  it('accurately tracks active pipeline acquisitions and releases (ref-counting)', async () => {
    const engine = AudioEngine.getInstance();
    expect(engine.getActiveCount()).toBe(0);

    engine.acquire();
    expect(engine.getActiveCount()).toBe(1);

    engine.acquire();
    expect(engine.getActiveCount()).toBe(2);

    engine.release();
    expect(engine.getActiveCount()).toBe(1);

    engine.release();
    expect(engine.getActiveCount()).toBe(0);
  });

  it('handles worklet processor crash with graceful failover to browser audio', () => {
    const engine = AudioEngine.getInstance();
    const eventSpy = vi.fn();
    window.addEventListener('gcp_audio_processor_error', eventSpy);

    engine.handleProcessorError(new Error('Simulated worklet processor crash'));

    const diag = getAudioEngineDiagnostics();
    expect(diag.status).toBe('fallback');
    expect(diag.engine).toBe('browser-native');
    expect(diag.fallbackReason).toContain('onprocessorerror');
    expect(eventSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('gcp_audio_processor_error', eventSpy);
  });
});
