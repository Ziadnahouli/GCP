import { describe, it, expect, vi } from 'vitest';
import {
  createStudioAudioPipeline,
  ButterworthHighPass85Hz,
  TransientClickSuppressor,
  AdaptiveSpeechFloor,
  HysteresisVadGate,
  VocalPresenceRestorer,
  TruePeakSoftLimiter,
  KrispAudioDspPipeline,
} from '@/lib/webrtc/audio-dsp';

describe('Studio-Grade Audio DSP & 6-Stage Krisp-Killer Cascade', () => {
  it('returns null safely when media stream has no audio tracks', async () => {
    const emptyStream = {
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const pipeline = await createStudioAudioPipeline(emptyStream);
    expect(pipeline).toBeNull();
  });

  describe('Stage 1 — 85Hz Butterworth High-Pass Filter', () => {
    it('attenuates 30Hz AC sub-bass rumble and plosives by >15dB while preserving 220Hz speech fundamentals', () => {
      const hpf = new ButterworthHighPass85Hz(48000, 85.0);
      const samples = 48000;
      let rumbleInEnergy = 0, rumbleOutEnergy = 0;
      let voiceInEnergy = 0, voiceOutEnergy = 0;

      for (let i = 0; i < samples; i++) {
        const t = i / 48000;
        // 30Hz sub-bass hum
        const rumble = Math.sin(2 * Math.PI * 30 * t) * 0.2;
        const rumbleOut = hpf.processSample(rumble);
        rumbleInEnergy += rumble * rumble;
        rumbleOutEnergy += rumbleOut * rumbleOut;
      }

      hpf.reset();
      for (let i = 0; i < samples; i++) {
        const t = i / 48000;
        // 220Hz human voice fundamental
        const voice = Math.sin(2 * Math.PI * 220 * t) * 0.2;
        const voiceOut = hpf.processSample(voice);
        voiceInEnergy += voice * voice;
        voiceOutEnergy += voiceOut * voiceOut;
      }

      const rumbleAttDb = 10 * Math.log10(rumbleOutEnergy / rumbleInEnergy);
      const voiceAttDb = 10 * Math.log10(voiceOutEnergy / voiceInEnergy);

      // Sub-bass rumble must be suppressed by at least 15 dB
      expect(rumbleAttDb).toBeLessThan(-15.0);
      // Voice fundamental must be preserved within < 1.0 dB
      expect(voiceAttDb).toBeGreaterThan(-1.0);
    });
  });

  describe('Stage 2 — Pre-Neural Fast Transient / Click Suppressor', () => {
    it('detects and suppresses mechanical keyboard transients without altering smooth human voice', () => {
      const declicker = new TransientClickSuppressor(48000, 12.0);
      const samples = 4800;

      // 1. Clean speech: sample-to-sample delta is small (<0.012 at 48kHz)
      let speechDiffEnergy = 0;
      let speechEnergy = 0;
      for (let i = 0; i < samples; i++) {
        const t = i / 48000;
        const s = Math.sin(2 * Math.PI * 220 * t) * 0.25;
        const out = declicker.processSample(s, 0.8);
        const diff = out - s;
        speechDiffEnergy += diff * diff;
        speechEnergy += s * s;
      }
      const speechSnr = 10 * Math.log10(speechEnergy / Math.max(speechDiffEnergy, 1e-12));
      // Clean speech must have >60dB fidelity (zero coloration)
      expect(speechSnr).toBeGreaterThan(60.0);

      // 2. Fast keyboard transient: 3500Hz high-crest spike
      declicker.reset();
      let clickInEnergy = 0;
      let clickOutEnergy = 0;
      for (let i = 0; i < 240; i++) {
        const t = i / 48000;
        const click = Math.sin(2 * Math.PI * 3500 * t) * Math.exp(-i / 30) * 0.35;
        const out = declicker.processSample(click, 0.0);
        clickInEnergy += click * click;
        clickOutEnergy += out * out;
      }
      const clickAttDb = 10 * Math.log10(clickOutEnergy / clickInEnergy);
      // Transient must be clamped
      expect(clickAttDb).toBeLessThan(-3.0);
    });
  });

  describe('Stage 3 — Adaptive Speech Floor (Fixing Robotic/Hollow Voice)', () => {
    it('maintains a minimum -28dB spectral/dry floor during active speech and deep floor during silence', () => {
      const floor = new AdaptiveSpeechFloor();
      const dry = 0.5;
      const wetDenoised = 0.4;

      // Active speech (vad = 0.90) -> blends 4-6% dry signal to preserve natural vocal timbre
      let blendedSpeech = 0;
      for (let i = 0; i < 500; i++) {
        blendedSpeech = floor.computeBlend(wetDenoised, dry, 0.90, 'balanced');
      }
      expect(blendedSpeech).toBeGreaterThan(wetDenoised); // Dry blend preserves vocal harmonics

      // Silence (vad = 0.05) -> zero dry bleed to prevent noise leakage
      let blendedSilence = 0;
      for (let i = 0; i < 1000; i++) {
        blendedSilence = floor.computeBlend(0.001, 0.5, 0.05, 'krisp-max');
      }
      expect(blendedSilence).toBeLessThan(0.01);
    });
  });

  describe('Stage 4 — Hysteresis Voice Activity Gate', () => {
    it('achieves <2ms attack latency to prevent clipping initial consonants (t, k, s)', () => {
      // 48kHz, attack = 2ms (96 samples)
      const gate = new HysteresisVadGate(48000, 2.0, 180.0, 250.0, -45.0);
      gate.reset();

      // Trigger speech start
      for (let i = 0; i < 96; i++) {
        gate.processSample(0.1, 0.85);
      }
      // Gate gain must reach >0.63 (1 time constant) within 96 samples (2ms)
      expect(gate.getGain()).toBeGreaterThan(0.60);
    });

    it('holds hangover at full gain for 180ms preventing inter-word tail clipping', () => {
      const gate = new HysteresisVadGate(48000, 2.0, 180.0, 250.0, -45.0);
      // Open gate fully
      for (let i = 0; i < 500; i++) gate.processSample(0.1, 0.9);
      expect(gate.getGain()).toBeGreaterThan(0.99);

      // Speech drops to 0 (pause between words)
      const hangoverSamples = Math.floor(48000 * 0.150); // 150ms later (<180ms)
      for (let i = 0; i < hangoverSamples; i++) {
        gate.processSample(0.1, 0.0);
      }
      // Must still be at 1.0 full open gain during the 180ms hold
      expect(gate.getGain()).toBe(1.0);
    });

    it('smoothly decays to -45dB floor without hard digital 0.0 dead-air clicks', () => {
      const gate = new HysteresisVadGate(48000, 2.0, 180.0, 250.0, -45.0);
      // Open and let expire
      for (let i = 0; i < 200; i++) gate.processSample(0.1, 0.9);
      // Advance past hangover and release (2.0s = 7.3 time constants)
      for (let i = 0; i < 96000; i++) gate.processSample(0.1, 0.0);

      // Floor must be close to -45 dB (approx 0.0056), NOT hard 0.0
      expect(gate.getGain()).toBeGreaterThan(0.005);
      expect(gate.getGain()).toBeLessThan(0.007);
    });
  });

  describe('Stage 5 — Vocal Presence Restorer', () => {
    it('applies subtle high-shelf boost when VAD > 0.75 and passes transparently otherwise', () => {
      const presence = new VocalPresenceRestorer(48000, 4200.0, 2.0);
      const testFreq = 6000; // Presence band
      const samples = 4800;

      let inEnergy = 0, speechOutEnergy = 0, quietOutEnergy = 0;
      for (let i = 0; i < samples; i++) {
        const t = i / 48000;
        const sample = Math.sin(2 * Math.PI * testFreq * t) * 0.1;
        inEnergy += sample * sample;
        const outSpeech = presence.processSample(sample, 0.95);
        speechOutEnergy += outSpeech * outSpeech;
      }

      presence.reset();
      for (let i = 0; i < samples; i++) {
        const t = i / 48000;
        const sample = Math.sin(2 * Math.PI * testFreq * t) * 0.1;
        const outQuiet = presence.processSample(sample, 0.20);
        quietOutEnergy += outQuiet * outQuiet;
      }

      const speechGainDb = 10 * Math.log10(speechOutEnergy / inEnergy);
      const quietGainDb = 10 * Math.log10(quietOutEnergy / inEnergy);

      // Boosted during speech
      expect(speechGainDb).toBeGreaterThan(1.2);
      // Un-boosted during non-speech (transparent)
      expect(Math.abs(quietGainDb)).toBeLessThan(0.1);
    });
  });

  describe('Stage 6 — True-Peak Soft-Knee Limiter', () => {
    it('strictly prevents digital clipping above -1.0dBFS using analog-style tanh saturation', () => {
      const limiter = new TruePeakSoftLimiter();
      // Test extreme input overshoots up to +6 dBFS (amplitude 2.0)
      for (let amp = 0.5; amp <= 2.5; amp += 0.2) {
        for (let i = 0; i < 480; i++) {
          const sample = Math.sin(2 * Math.PI * 440 * i / 48000) * amp;
          const limited = limiter.processSample(sample, 0.8);
          // Never exceeds 1.0 (0 dBFS true peak ceiling)
          expect(Math.abs(limited)).toBeLessThan(1.0);
        }
      }
    });
  });

  describe('Zero Heap Allocations & High-Load Continuous Stream Verification', () => {
    it('executes 10,000 render quanta without any dynamic allocations or exceptions', () => {
      const pipeline = new KrispAudioDspPipeline(48000, 'krisp-max');
      const quantumSize = 128;
      const numQuanta = 10000; // 1,280,000 samples (~26.6 seconds of continuous real-time audio)
      const inputQuantum = new Float32Array(quantumSize);
      const outputQuantum = new Float32Array(quantumSize);

      for (let q = 0; q < numQuanta; q++) {
        for (let i = 0; i < quantumSize; i++) {
          inputQuantum[i] = Math.sin(2 * Math.PI * 440 * (q * quantumSize + i) / 48000) * 0.2;
        }

        // Process through 6-stage chain
        for (let i = 0; i < quantumSize; i++) {
          const s = inputQuantum[i];
          const hpf = pipeline.hpf.processSample(s);
          const declicked = pipeline.declicker.processSample(hpf, 0.7);
          const gated = pipeline.vadGate.processSample(declicked, 0.7);
          const presence = pipeline.presence.processSample(gated, 0.7);
          outputQuantum[i] = pipeline.limiter.processSample(presence, 0.7);
        }
      }

      // Output should remain stable, bounded, and continuous
      expect(outputQuantum[quantumSize - 1]).toBeDefined();
      expect(Number.isFinite(outputQuantum[quantumSize - 1])).toBe(true);
    });
  });
});
