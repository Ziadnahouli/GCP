import { describe, it, expect, vi } from 'vitest';
import {
  getPolicyConstraints,
  getUserMediaAudioConstraints,
  applyProcessingPolicy,
  getAudioEngineDiagnostics,
  updateAudioEngineDiagnostics,
  subscribeAudioEngineDiagnostics,
} from '@/lib/webrtc/audio-processing-policy';

describe('N2 & N6: Audio Processing Policy & Constraint Ownership', () => {
  it('N2: defines an unambiguous policy table without contradictory constraints', () => {
    // RNNoise engine: browser NS and AGC must be off to prevent dual-processing artifacts and AGC pumping
    const rnnoiseConstraints = getPolicyConstraints('rnnoise');
    expect(rnnoiseConstraints.echoCancellation).toBe(true);
    expect(rnnoiseConstraints.noiseSuppression).toBe(false);
    expect(rnnoiseConstraints.autoGainControl).toBe(false);

    // Browser-native fallback engine: browser NS and AGC are on
    const browserConstraints = getPolicyConstraints('browser');
    expect(browserConstraints.echoCancellation).toBe(true);
    expect(browserConstraints.noiseSuppression).toBe(true);
    expect(browserConstraints.autoGainControl).toBe(true);

    // Off mode: Echo cancellation preserved, but NS and AGC off for bit-exact raw audio
    const offConstraints = getPolicyConstraints('off');
    expect(offConstraints.echoCancellation).toBe(true);
    expect(offConstraints.noiseSuppression).toBe(false);
    expect(offConstraints.autoGainControl).toBe(false);
  });

  it('N2 & N6: getUserMediaAudioConstraints requests 48kHz, mono, and never drops deviceId', () => {
    const constraints = getUserMediaAudioConstraints('rnnoise', 'my-usb-mic-id');
    expect(constraints.channelCount).toBe(1);
    expect(constraints.sampleRate).toEqual({ ideal: 48000 });
    expect(constraints.deviceId).toEqual({ exact: 'my-usb-mic-id' });
    expect(constraints.noiseSuppression).toBe(false);
    expect(constraints.autoGainControl).toBe(false);
  });

  it('N2 & N6: applyProcessingPolicy is the single owner of track constraints and preserves deviceId', async () => {
    const appliedConstraints: any[] = [];
    const mockTrack = {
      kind: 'audio',
      applyConstraints: vi.fn(async (c: any) => {
        appliedConstraints.push(c);
      }),
      getSettings: vi.fn(() => ({
        deviceId: 'my-usb-mic-id',
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      })),
    } as unknown as MediaStreamTrack;

    const res = await applyProcessingPolicy(mockTrack, 'rnnoise');
    expect(res.success).toBe(true);
    expect(mockTrack.applyConstraints).toHaveBeenCalledTimes(1);
    expect(appliedConstraints[0]).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    });

    const diag = getAudioEngineDiagnostics();
    expect(diag.appliedSettings?.deviceId).toBe('my-usb-mic-id');
    expect(diag.appliedSettings?.noiseSuppression).toBe(false);
  });

  it('N3: diagnostics store honestly surfaces engine, status, and fallback reasons', () => {
    const received: any[] = [];
    const unsubscribe = subscribeAudioEngineDiagnostics((d) => {
      received.push(d);
    });

    updateAudioEngineDiagnostics({
      status: 'fallback',
      engine: 'browser-native',
      fallbackReason: 'AudioWorklet module failed to load',
      mode: 'balanced',
    });

    const current = getAudioEngineDiagnostics();
    expect(current.status).toBe('fallback');
    expect(current.engine).toBe('browser-native');
    expect(current.fallbackReason).toBe('AudioWorklet module failed to load');

    unsubscribe();
  });
});
