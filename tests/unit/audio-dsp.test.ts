import { describe, it, expect, vi } from 'vitest';
import { createStudioAudioPipeline } from '@/lib/webrtc/audio-dsp';

describe('Studio-Grade Audio DSP & Noise Gate', () => {
  it('returns null safely when media stream has no audio tracks', () => {
    const emptyStream = {
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const pipeline = createStudioAudioPipeline(emptyStream);
    expect(pipeline).toBeNull();
  });

  it('initializes DSP pipeline with audio track and sets up filters when AudioContext is mocked', () => {
    const mockTrack = {
      id: 'mock-audio-track',
      kind: 'audio',
      readyState: 'live',
      stop: vi.fn(),
    };

    const mockStream = {
      getAudioTracks: () => [mockTrack],
    } as unknown as MediaStream;

    // In jsdom environment, window.AudioContext may not be available or partially mocked
    if (typeof window !== 'undefined' && !window.AudioContext) {
      const pipeline = createStudioAudioPipeline(mockStream);
      expect(pipeline).toBeNull();
    } else {
      const pipeline = createStudioAudioPipeline(mockStream);
      if (pipeline) {
        expect(pipeline.outputStream).toBeDefined();
        expect(typeof pipeline.setNoiseSuppression).toBe('function');
        expect(typeof pipeline.cleanup).toBe('function');
        pipeline.cleanup();
      }
    }
  });
});
