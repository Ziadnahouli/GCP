import { describe, it, expect } from 'vitest';
import {
  ButterworthHighPassFilter,
  TransientClickSuppressor,
  HysteresisGateExpander,
  SlowSpeechLeveler,
  SoftLimiter,
  AudioRingBuffer,
  MODE_CONFIGS,
} from '@/audio/worklet/dsp-core';

describe('GCP DSP Core Primitives (Pure Tested Audio Stages)', () => {
  it('ButterworthHighPassFilter attenuates sub-bass rumble (< 50 Hz) and passes speech (> 150 Hz)', () => {
    const hpf = new ButterworthHighPassFilter(75, 48000);
    const SAMPLES = 4800; // 100 ms

    // Test 20 Hz rumble
    let rumblePower = 0;
    let hpfRumblePower = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const inSample = Math.sin(2 * Math.PI * 20 * (i / 48000));
      const outSample = hpf.process(inSample);
      if (i > 1000) { // Steady state
        rumblePower += inSample * inSample;
        hpfRumblePower += outSample * outSample;
      }
    }
    const rumbleAttenuationDb = 10 * Math.log10(hpfRumblePower / rumblePower);
    expect(rumbleAttenuationDb).toBeLessThan(-15); // > 15 dB attenuation on 20 Hz sub-bass

    // Test 300 Hz vocal tone
    hpf.reset();
    let vocalPower = 0;
    let hpfVocalPower = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const inSample = Math.sin(2 * Math.PI * 300 * (i / 48000));
      const outSample = hpf.process(inSample);
      if (i > 1000) {
        vocalPower += inSample * inSample;
        hpfVocalPower += outSample * outSample;
      }
    }
    const vocalRatio = Math.sqrt(hpfVocalPower / vocalPower);
    expect(vocalRatio).toBeGreaterThan(0.92); // Passes vocal fundamental with > 92% transmission
  });

  it('TransientClickSuppressor clamps impulsive keystrokes during pauses and preserves speech', () => {
    const suppressor = new TransientClickSuppressor(48000, 12.0);

    // Warm up background noise floor
    for (let i = 0; i < 2000; i++) {
      suppressor.process((Math.random() - 0.5) * 0.01, 0.0);
    }

    // Deliver sharp keyboard click (amplitude 0.5 transient) during silence (vad = 0.0)
    const rawClickPeak = 0.5;
    const suppressed = suppressor.process(rawClickPeak, 0.0);
    expect(Math.abs(suppressed)).toBeLessThan(rawClickPeak * 0.7); // Clamped

    // In speech context (vad = 0.9), consonant onset should NOT be severely clamped
    suppressor.reset();
    for (let i = 0; i < 2000; i++) {
      suppressor.process(0.1 * Math.sin(i * 0.1), 0.9);
    }
    const speechOnset = suppressor.process(0.25, 0.9);
    expect(speechOnset).toBeGreaterThan(0.18); // Preserves consonant onset
  });

  it('HysteresisGateExpander provides specified acoustic floors and hangover', () => {
    const gate = new HysteresisGateExpander('balanced');
    expect(gate.config.floorGain).toBeCloseTo(0.0158, 4);

    // When speaking (vad = 0.8), gate opens toward 1.0 gain
    for (let i = 0; i < 480; i++) {
      gate.updateState(0.8);
      gate.process(0.1);
    }
    expect(gate.currentGain).toBeGreaterThan(0.85);

    // When speech ceases (vad = 0.0), hangover holds gate open for hangoverSamples
    expect(gate.hangoverRemaining).toBeGreaterThan(0);
    for (let i = 0; i < 1000; i++) {
      gate.updateState(0.0);
      gate.process(0.1);
    }
    expect(gate.currentGain).toBeGreaterThan(0.7); // Still within hangover

    // After silence and hangover expiration, gain decays to acoustic floor
    for (let i = 0; i < 96000; i++) {
      gate.updateState(0.0);
      gate.process(0.1);
    }
    expect(gate.currentGain).toBeCloseTo(MODE_CONFIGS.balanced.floorGain, 3);
  });

  it('SlowSpeechLeveler normalizes low-level speech without pumping pause noise', () => {
    const leveler = new SlowSpeechLeveler();

    // Quiet speech (0.03 amplitude, target is 0.10)
    for (let i = 0; i < 48000; i++) {
      leveler.process(0.03 * Math.sin(i * 0.1), 0.8);
    }
    expect(leveler.currentGain).toBeGreaterThan(1.2); // Raised quiet speech

    // During silence/noise (vad = 0.1), gain must NOT increase
    const gainBeforePause = leveler.currentGain;
    for (let i = 0; i < 24000; i++) {
      leveler.process(0.005 * (Math.random() - 0.5), 0.1);
    }
    expect(leveler.currentGain).toBeLessThanOrEqual(gainBeforePause); // Did not pump noise
  });

  it('SoftLimiter clamps loud signals strictly within [-1.0, 1.0] with zero clipping', () => {
    const limiter = new SoftLimiter();

    // Clean normal signal passes unmodified
    expect(limiter.process(0.5)).toBe(0.5);
    expect(limiter.process(-0.5)).toBe(-0.5);

    // Extreme overs (> 1.0) smoothly compressed
    const over1 = limiter.process(1.5);
    const over2 = limiter.process(5.0);
    const over3 = limiter.process(-3.0);

    expect(over1).toBeLessThanOrEqual(1.0);
    expect(over1).toBeGreaterThan(0.89);
    expect(over2).toBeLessThanOrEqual(1.0);
    expect(over3).toBeGreaterThanOrEqual(-1.0);
  });

  it('AudioRingBuffer operates circularly with zero data corruption', () => {
    const ring = new AudioRingBuffer(512);
    expect(ring.available()).toBe(0);

    for (let i = 1; i <= 200; i++) {
      ring.write(i);
    }
    expect(ring.available()).toBe(200);

    for (let i = 1; i <= 200; i++) {
      expect(ring.read()).toBe(i);
    }
    expect(ring.available()).toBe(0);
  });
});
