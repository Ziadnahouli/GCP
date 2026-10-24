/**
 * GCP Real-Time Neural Speech Enhancement DSP Core
 *
 * Modular, deterministic, zero-allocation audio DSP primitives for 48 kHz real-time audio.
 * Provides tested building blocks for AudioWorklet and offline evaluation harnesses.
 */

export type NoiseCancellationMode = 'off' | 'light' | 'balanced' | 'strong';

export interface GateModeConfig {
  floorGain: number;       // Linear floor gain (e.g. 0.0158 for -36 dB)
  speechThreshold: number; // VAD probability required to trigger gate opening
  speechHysteresis: number;// VAD probability to hold gate open
  hangoverSamples: number; // Samples of hangover after speech ends
  attackAlpha: number;     // Exponential smoothing factor for attack
  releaseAlpha: number;    // Exponential smoothing factor for release
}

export const MODE_CONFIGS: Record<NoiseCancellationMode, GateModeConfig> = {
  off: {
    floorGain: 1.0,
    speechThreshold: 0.0,
    speechHysteresis: 0.0,
    hangoverSamples: 0,
    attackAlpha: 1.0,
    releaseAlpha: 1.0,
  },
  light: {
    floorGain: 0.0501, // -26 dB gentle acoustic floor (preserves whispers and quiet breathing)
    speechThreshold: 0.40,
    speechHysteresis: 0.32,
    hangoverSamples: Math.floor(48000 * 0.250), // 250 ms
    attackAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.003)),
    releaseAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.200)),
  },
  balanced: {
    floorGain: 0.0158, // -36 dB balanced natural floor (~20 dB quieter than raw mic)
    speechThreshold: 0.45,
    speechHysteresis: 0.35,
    hangoverSamples: Math.floor(48000 * 0.220), // 220 ms
    attackAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.003)),
    releaseAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.180)),
  },
  strong: {
    floorGain: 0.0100, // -40 dB robust floor (replaces harsh -50 dB digital black to avoid codec cutting)
    speechThreshold: 0.50,
    speechHysteresis: 0.38,
    hangoverSamples: Math.floor(48000 * 0.200), // 200 ms
    attackAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.003)),
    releaseAlpha: 1.0 - Math.exp(-1.0 / (48000 * 0.150)),
  },
};

/**
 * 2nd-order Butterworth High-Pass Biquad Filter (75 Hz default)
 * Removes subsonic handling noise, desk rumbles, boom vibrations, and breath blasts
 * while cleanly preserving low male vocal fundamentals (lowest human fundamental ~85 Hz).
 */
export class ButterworthHighPassFilter {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  d1 = 0.0;
  d2 = 0.0;

  constructor(cutoffHz = 75.0, sampleRate = 48000, q = 0.7071067811865476) {
    const omega = (2 * Math.PI * cutoffHz) / sampleRate;
    const cosOmega = Math.cos(omega);
    const sinOmega = Math.sin(omega);
    const alpha = sinOmega / (2 * q);

    const b0 = (1 + cosOmega) / 2;
    const b1 = -(1 + cosOmega);
    const b2 = (1 + cosOmega) / 2;
    const a0 = 1 + alpha;

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cosOmega) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.d1;
    this.d1 = this.b1 * x - this.a1 * y + this.d2;
    this.d2 = this.b2 * x - this.a2 * y;
    return y;
  }

  reset(): void {
    this.d1 = 0.0;
    this.d2 = 0.0;
  }
}

/**
 * Fast Transient Click Suppressor (Keyboard & Mouse Click Rejection)
 * Uses dual EMA envelope tracking (0.5 ms fast, 20 ms slow) to detect high-crest transients.
 * When enabled post-RNNoise, operates on the residual without mangling vocal consonants (Q1).
 */
export class TransientClickSuppressor {
  fastAlpha: number;
  slowAlpha: number;
  thresholdRatio: number;
  fastEnv = 0.0;
  slowEnv = 0.0;
  prevIn = 0.0;
  prevSample = 0.0;
  hold = 0.0;
  enabled = true;

  constructor(sampleRate = 48000, thresholdDb = 12.0) {
    this.fastAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.0005));
    this.slowAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.020));
    this.thresholdRatio = Math.pow(10, thresholdDb / 20.0);
  }

  process(sample: number, vadSmooth: number): number {
    if (!this.enabled) return sample;

    const diff = Math.abs(sample - this.prevIn);
    this.prevIn = sample;
    this.fastEnv += this.fastAlpha * (diff - this.fastEnv);
    this.slowEnv += this.slowAlpha * (diff - this.slowEnv);

    const safeSlow = Math.max(this.slowEnv, 0.001);
    const crest = this.fastEnv / safeSlow;
    if (crest > this.thresholdRatio && vadSmooth < 0.65) {
      this.hold = 1.0;
    }
    this.hold *= 0.95;

    // Scale-tolerant slope limiter that relaxes when speech is detected (Q1)
    const maxSlope = 0.035 + 0.065 * Math.min(1.0, vadSmooth * 1.5);
    const delta = sample - this.prevSample;
    const absDelta = Math.abs(delta);

    let filtered = sample;
    if ((this.hold > 0.05 || absDelta > maxSlope) && vadSmooth < 0.65) {
      const effectiveSlope = maxSlope * (1.0 - 0.70 * this.hold);
      const excess = Math.max(0.0, absDelta - effectiveSlope);
      filtered = this.prevSample + Math.sign(delta) * (effectiveSlope + 0.008 * Math.tanh(excess / 0.008));
    }
    this.prevSample = filtered;
    return filtered;
  }

  reset(): void {
    this.fastEnv = 0.0;
    this.slowEnv = 0.0;
    this.prevIn = 0.0;
    this.prevSample = 0.0;
    this.hold = 0.0;
  }
}

/**
 * Hysteresis Gate & Downward Comfort Expander (Q2)
 * Maintains natural vocal warmth during pauses with smooth exponential transitions
 * and hysteresis to prevent gating flutter/clipping.
 */
export class HysteresisGateExpander {
  config: GateModeConfig;
  currentGain = 1.0;
  isSpeaking = false;
  hangoverRemaining = 0;

  constructor(mode: NoiseCancellationMode = 'balanced') {
    this.config = { ...MODE_CONFIGS[mode] };
  }

  setMode(mode: NoiseCancellationMode): void {
    this.config = { ...MODE_CONFIGS[mode] };
  }

  /**
   * Updates speech state from VAD probability and applies hangover.
   */
  updateState(vadSmooth: number): boolean {
    const activeThreshold = this.isSpeaking ? this.config.speechHysteresis : this.config.speechThreshold;
    this.isSpeaking = vadSmooth > activeThreshold;
    if (this.isSpeaking) {
      this.hangoverRemaining = this.config.hangoverSamples;
    }
    return this.isSpeaking || this.hangoverRemaining > 0;
  }

  /**
   * Processes a single wet sample with comfortable downward expansion.
   */
  process(sample: number): number {
    const speechActive = this.isSpeaking || this.hangoverRemaining > 0;
    if (speechActive) {
      if (!this.isSpeaking && this.hangoverRemaining > 0) {
        this.hangoverRemaining--;
      }
      this.currentGain += this.config.attackAlpha * (1.0 - this.currentGain);
    } else {
      this.currentGain += this.config.releaseAlpha * (this.config.floorGain - this.currentGain);
    }
    return sample * this.currentGain;
  }

  reset(): void {
    this.currentGain = 1.0;
    this.isSpeaking = false;
    this.hangoverRemaining = 0;
  }
}

/**
 * Slow RMS Speech Leveler (Q3)
 * Operates post-RNNoise to normalize speech volume toward -20 dBFS (+/- 6 dB range).
 * Crucially, ONLY adapts gain while speech VAD is high, preventing background noise pumping during pauses.
 */
export class SlowSpeechLeveler {
  targetRms = 0.10; // Target ~ -20 dBFS
  currentGain = 1.0;
  minGain = 0.50;   // -6 dB minimum
  maxGain = 2.00;   // +6 dB maximum
  rmsTracker = 0.10;
  enabled = true;

  // Slow adaptation constants
  private attackAlpha = 1.0 - Math.exp(-1.0 / (48000 * 0.300));  // 300 ms attack
  private releaseAlpha = 1.0 - Math.exp(-1.0 / (48000 * 1.200)); // 1.2 s release

  process(sample: number, vadSmooth: number): number {
    if (!this.enabled) return sample;

    // Only update loudness tracker when speech is clearly present
    if (vadSmooth > 0.55) {
      const samplePower = sample * sample;
      this.rmsTracker += 0.0001 * (samplePower - this.rmsTracker);
      const measuredRms = Math.sqrt(Math.max(this.rmsTracker, 1e-6));

      const desiredGain = Math.min(this.maxGain, Math.max(this.minGain, this.targetRms / measuredRms));

      if (desiredGain > this.currentGain) {
        this.currentGain += this.attackAlpha * (desiredGain - this.currentGain);
      } else {
        this.currentGain += this.releaseAlpha * (desiredGain - this.currentGain);
      }
    }

    return sample * this.currentGain;
  }

  reset(): void {
    this.currentGain = 1.0;
    this.rmsTracker = 0.10;
  }
}

/**
 * True-Peak Soft Brickwall Limiter (-1.0 dBFS)
 * Employs an analog-style hyperbolic tangent (tanh) soft saturation curve above 0.89125 (-1.0 dBFS)
 * to strictly prevent digital overs and clipping distortion without harsh pumping.
 */
export class SoftLimiter {
  threshold = 0.8912509; // -1.0 dBFS
  headroom = 1.0 - 0.8912509;

  process(sample: number): number {
    const absVal = Math.abs(sample);
    if (absVal <= this.threshold) {
      return sample;
    }
    const excess = absVal - this.threshold;
    return Math.sign(sample) * (this.threshold + this.headroom * Math.tanh(excess / this.headroom));
  }
}

/**
 * Power-of-Two Circular Audio Ring Buffer
 * Thread-safe, garbage-collection-free buffer for 128-quantum to 480-frame conversion.
 */
export class AudioRingBuffer {
  private buffer: Float32Array;
  private capacity: number;
  private mask: number;
  private writeIndex = 0;
  private readIndex = 0;
  count = 0;

  constructor(size = 8192) {
    this.capacity = size;
    this.mask = size - 1;
    this.buffer = new Float32Array(size);
  }

  write(sample: number): void {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) & this.mask;
    this.count++;
  }

  read(): number {
    if (this.count === 0) return 0.0;
    const sample = this.buffer[this.readIndex];
    this.readIndex = (this.readIndex + 1) & this.mask;
    this.count--;
    return sample;
  }

  available(): number {
    return this.count;
  }

  reset(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.count = 0;
  }
}
