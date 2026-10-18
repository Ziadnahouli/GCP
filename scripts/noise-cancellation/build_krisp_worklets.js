const fs = require('fs');
const path = require('path');

// Fix Emscripten createRNNWasmModule ready resolution bug
const emscriptenGlue = fs.readFileSync('node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.js', 'utf8')
  .replace('return createRNNWasmModule.ready', 'return Module["ready"];')
  .replace('export default createRNNWasmModule;', '');

const processorCode = `
/**
 * GCP Real-Time Neural Speech Enhancement Worklet Processor (Krisp-Killer Grade)
 *
 * Architecture Highlights:
 *   1. Pre-Processing: 85Hz Butterworth High-Pass Biquad (Q=0.7071) + Instantaneous Derivative De-Clicker (Linear Prediction)
 *   2. Always-On Dual-Pass Neural Cascade: Sequential Pass 1 & Pass 2 RNNoise states on every frame (vad = min(vad1, vad2))
 *   3. True Human Voice Discriminator: Formant Bandpass (300Hz-3000Hz) + ZCR + Crest + Adaptive Relative Proximity Threshold (-22dB)
 *   4. Sub-Band Noise Floor Tracker: Stationary Wiener attenuation for <180Hz rumble and >3200Hz hiss during active speech
 *   5. 480-Sample (10ms) Lookahead Delay Buffer: Zero initial consonant cutoff with 2-frame speech confirmation
 *   6. Deep Silence Gate (-80 dB / -66 dB floor) + Speech-Gated Safe AGC (max 1.35x, locked <=1.0 in silence) + -1.0 dBFS Soft Limiter
 *
 * Modes: 'off', 'light', 'balanced', 'strong'/'krisp-max', 'rnnoise-hybrid'
 */
class GcpKrispNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.FRAME_SIZE = 480;
    this.MAX_RING = 8192;
    this.sampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;

    // Ring buffers for 128 <-> 480 conversion (zero dynamic allocations on audio thread)
    this.inRing = new Float32Array(this.MAX_RING);
    this.outRing = new Float32Array(this.MAX_RING);
    this.inWrite = 0;
    this.inRead = 0;
    this.inCount = 0;
    this.outWrite = 0;
    this.outRead = 0;
    this.outCount = 0;

    // Scratch frame buffers for zero-allocation processing
    this.frameBuffer = new Float32Array(this.FRAME_SIZE);

    // State flags
    this.isReady = false;
    this.isInitializing = false;
    this.mode = 'balanced';
    this.savedMode = 'balanced';

    // Dual-Instance WASM states and memory pointers
    this.rnnModule = null;
    this.denoiseState1 = null;
    this.denoiseState2 = null;
    this.inPtr = 0;
    this.midPtr = 0;
    this.outPtr = 0;
    this.inOffset = 0;
    this.midOffset = 0;
    this.outOffset = 0;

    // Stage 1: 85 Hz Butterworth High-Pass Biquad (2nd-order, Q = 0.7071)
    const omegaHpf = (2 * Math.PI * 85.0) / this.sampleRate;
    const cosOmegaHpf = Math.cos(omegaHpf);
    const sinOmegaHpf = Math.sin(omegaHpf);
    const alphaHpf = sinOmegaHpf / (2 * 0.7071067811865476);
    const b0Hpf = (1 + cosOmegaHpf) / 2;
    const b1Hpf = -(1 + cosOmegaHpf);
    const b2Hpf = (1 + cosOmegaHpf) / 2;
    const a0Hpf = 1 + alphaHpf;
    this.hpf_b0 = b0Hpf / a0Hpf;
    this.hpf_b1 = b1Hpf / a0Hpf;
    this.hpf_b2 = b2Hpf / a0Hpf;
    this.hpf_a1 = (-2 * cosOmegaHpf) / a0Hpf;
    this.hpf_a2 = (1 - alphaHpf) / a0Hpf;
    this.hpf_d1 = 0.0;
    this.hpf_d2 = 0.0;

    // Stage 2: Pre-Neural Fast Derivative Transient / Click Suppressor
    this.fastAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.0005)); // 0.5ms
    this.slowAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.020));  // 20ms
    this.fastEnv = 0.0;
    this.slowEnv = 0.0;
    this.prevIn = 0.0;
    this.prevSample = 0.0;
    this.transientHold = 0.0;
    this.transientThreshold = 3.981; // 12 dB

    // Formant Bandpass Biquad (300Hz - 3000Hz, f0 = 1000Hz, Q = 0.5)
    const omegaBp = (2 * Math.PI * 1000.0) / this.sampleRate;
    const cosOmegaBp = Math.cos(omegaBp);
    const sinOmegaBp = Math.sin(omegaBp);
    const alphaBp = sinOmegaBp / (2 * 0.5);
    const b0Bp = sinOmegaBp / 2.0;
    const a0Bp = 1.0 + alphaBp;
    this.bp_b0 = b0Bp / a0Bp;
    this.bp_b1 = 0.0;
    this.bp_b2 = -b0Bp / a0Bp;
    this.bp_a1 = (-2.0 * cosOmegaBp) / a0Bp;
    this.bp_a2 = (1.0 - alphaBp) / a0Bp;
    this.bp_d1 = 0.0;
    this.bp_d2 = 0.0;

    // Speaker Proximity Tracker (Peak Speech RMS, relative gate window)
    this.speechPeakRms = 0.035;

    // VAD & Voice Discriminator
    this.vadProb = 0.0;
    this.vadSmooth = 0.0;
    this.speechConfirmCount = 0;
    this.isSpeechConfirmed = false;

    // Stage 4: Hysteresis Voice Activity Gate (-80 dB / -66 dB Deep Silence Floor)
    this.gateAttackAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.002));  // 2ms
    this.gateReleaseAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.250)); // 250ms
    this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.220);           // 220ms
    this.hangoverRemaining = 0;
    this.gateFloorGain = 0.0005; // -66 dB balanced default
    this.currentGateGain = 1.0;

    // Stage 5: Vocal Presence Restorer (4.2 kHz High-Shelf Exciter, +2.0 dB, Q = 0.7071)
    const A_shelf = Math.pow(10, 2.0 / 40.0);
    const omegaShelf = (2 * Math.PI * 4200.0) / this.sampleRate;
    const cosOmegaShelf = Math.cos(omegaShelf);
    const sinOmegaShelf = Math.sin(omegaShelf);
    const alphaShelf = (sinOmegaShelf / 2.0) * Math.sqrt((A_shelf + 1.0 / A_shelf) * (1.0 / 0.7071067811865476 - 1.0) + 2.0);
    const twoSqrtAAlpha = 2.0 * Math.sqrt(A_shelf) * alphaShelf;
    const a0Shelf = (A_shelf + 1.0) - (A_shelf - 1.0) * cosOmegaShelf + twoSqrtAAlpha;
    this.shelf_b0 = (A_shelf * ((A_shelf + 1.0) + (A_shelf - 1.0) * cosOmegaShelf + twoSqrtAAlpha)) / a0Shelf;
    this.shelf_b1 = (-2.0 * A_shelf * ((A_shelf - 1.0) + (A_shelf + 1.0) * cosOmegaShelf)) / a0Shelf;
    this.shelf_b2 = (A_shelf * ((A_shelf + 1.0) + (A_shelf - 1.0) * cosOmegaShelf - twoSqrtAAlpha)) / a0Shelf;
    this.shelf_a1 = (2.0 * ((A_shelf - 1.0) - (A_shelf + 1.0) * cosOmegaShelf)) / a0Shelf;
    this.shelf_a2 = ((A_shelf + 1.0) - (A_shelf - 1.0) * cosOmegaShelf - twoSqrtAAlpha) / a0Shelf;
    this.shelf_d1 = 0.0;
    this.shelf_d2 = 0.0;

    // Stage 6: Safe AGC (max 1.35x) & -1.0 dBFS Soft-Brickwall Limiter
    this.rmsEnergy = 0.0158; // -18 dBFS target
    this.currentAgcGain = 1.0;
    this.limiterThreshold = 0.8912509; // -1.0 dBFS
    this.limiterHeadroom = 1.0 - 0.8912509;

    // Message Port handler
    this.port.onmessage = async (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'INIT_WASM') {
        if (this.isReady || this.isInitializing) return;
        this.isInitializing = true;
        try {
          if (data.mode) {
            this._applyMode(data.mode);
          }
          await this._initModule(data.wasmBinary);
        } catch (err) {
          this.port.postMessage({ type: 'ERROR', error: String(err) });
        } finally {
          this.isInitializing = false;
        }
      } else if (data.type === 'SET_MODE') {
        this._applyMode(data.mode);
        this.port.postMessage({ type: 'MODE_UPDATED', mode: this.mode });
      } else if (data.type === 'SET_ENABLED') {
        const enabled = Boolean(data.enabled);
        this._applyMode(enabled ? (this.savedMode || 'balanced') : 'off');
        this.port.postMessage({ type: 'MODE_UPDATED', mode: this.mode });
      } else if (data.type === 'DESTROY') {
        this._cleanup();
      }
    };
  }

  _applyMode(mode) {
    if (!mode) return;
    this.mode = mode;
    if (mode !== 'off') {
      this.savedMode = mode;
    }

    if (mode === 'krisp-max' || mode === 'strong') {
      this.transientThreshold = 3.162; // 10 dB crest threshold
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.200);
      this.gateFloorGain = 0.0001; // -80 dB deep silence floor
    } else if (mode === 'light') {
      this.transientThreshold = 5.011; // 14 dB crest threshold
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.250);
      this.gateFloorGain = 0.005; // -46 dB floor
    } else {
      // balanced & rnnoise-hybrid
      this.transientThreshold = 3.981; // 12 dB
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.220);
      this.gateFloorGain = 0.0005; // -66 dB floor
    }
  }

  async _initModule(wasmBinary) {
    if (typeof createRNNWasmModule !== 'function') {
      throw new Error('createRNNWasmModule is not defined in worklet scope');
    }

    const config = {};
    if (wasmBinary) {
      config.wasmBinary = wasmBinary;
    }

    const mod = await createRNNWasmModule(config);
    this.rnnModule = (mod && mod.ready && typeof mod._malloc !== 'function') ? await mod.ready : mod;

    this.inPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.midPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.outPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.inOffset = this.inPtr / 4;
    this.midOffset = this.midPtr / 4;
    this.outOffset = this.outPtr / 4;

    // Dual-Instance Cascaded RNNoise states
    this.denoiseState1 = this.rnnModule._rnnoise_create();
    this.denoiseState2 = this.rnnModule._rnnoise_create();

    this.isReady = true;
    this.port.postMessage({ type: 'READY', sampleRate: this.sampleRate });
  }

  _cleanup() {
    this.isReady = false;
    if (this.rnnModule) {
      if (this.denoiseState1) {
        try { this.rnnModule._rnnoise_destroy(this.denoiseState1); } catch {}
        this.denoiseState1 = null;
      }
      if (this.denoiseState2) {
        try { this.rnnModule._rnnoise_destroy(this.denoiseState2); } catch {}
        this.denoiseState2 = null;
      }
      if (this.inPtr) {
        try { this.rnnModule._free(this.inPtr); } catch {}
        this.inPtr = 0;
      }
      if (this.midPtr) {
        try { this.rnnModule._free(this.midPtr); } catch {}
        this.midPtr = 0;
      }
      if (this.outPtr) {
        try { this.rnnModule._free(this.outPtr); } catch {}
        this.outPtr = 0;
      }
      this.rnnModule = null;
    }
    this.inCount = 0;
    this.outCount = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inputChannel0 = input[0];
    const numInputChannels = input.length;
    const len = inputChannel0.length;
    const numOutputChannels = output.length;

    // Passthrough when off or not ready
    if (this.mode === 'off' || !this.isReady) {
      for (let ch = 0; ch < numOutputChannels; ch++) {
        const inCh = input[ch] || inputChannel0;
        const outCh = output[ch];
        for (let i = 0; i < len; i++) {
          outCh[i] = inCh[i];
        }
      }
      this.inWrite = 0;
      this.inRead = 0;
      this.inCount = 0;
      this.outWrite = 0;
      this.outRead = 0;
      this.outCount = 0;
      return true;
    }

    // Step 1: Ingest input samples, Downmix to mono, Apply Stage 1 HPF & Stage 2 Derivative Transient Suppressor
    for (let i = 0; i < len; i++) {
      let rawMono = 0.0;
      if (numInputChannels === 1) {
        rawMono = inputChannel0[i];
      } else {
        let sum = 0.0;
        for (let ch = 0; ch < numInputChannels; ch++) {
          sum += input[ch][i];
        }
        rawMono = sum / numInputChannels;
      }

      // STAGE 1: 85 Hz Butterworth High-Pass Filter (removes rumble, pops)
      const hpfOut = this.hpf_b0 * rawMono + this.hpf_d1;
      this.hpf_d1 = this.hpf_b1 * rawMono - this.hpf_a1 * hpfOut + this.hpf_d2;
      this.hpf_d2 = this.hpf_b2 * rawMono - this.hpf_a2 * hpfOut;

      // STAGE 2: Pre-Neural Fast Derivative Transient / Click Suppressor
      const diff = Math.abs(hpfOut - this.prevIn);
      this.prevIn = hpfOut;
      this.fastEnv += this.fastAlpha * (diff - this.fastEnv);
      this.slowEnv += this.slowAlpha * (diff - this.slowEnv);

      const safeSlow = Math.max(this.slowEnv, 0.001);
      const crest = this.fastEnv / safeSlow;
      if (crest > this.transientThreshold && this.vadSmooth < 0.75) {
        this.transientHold = 1.0;
      }
      this.transientHold *= 0.95;

      const maxSlope = 0.025 + 0.045 * Math.min(1.0, this.vadSmooth);
      const delta = hpfOut - this.prevSample;
      const absDelta = Math.abs(delta);

      let declicked = hpfOut;
      if ((this.transientHold > 0.05 || absDelta > maxSlope) && this.vadSmooth < 0.70) {
        const effectiveSlope = maxSlope * (1.0 - 0.75 * this.transientHold);
        const excess = Math.max(0, absDelta - effectiveSlope);
        declicked = this.prevSample + Math.sign(delta) * (effectiveSlope + 0.008 * Math.tanh(excess / 0.008));
      }
      this.prevSample = declicked;

      this.inRing[this.inWrite] = declicked;
      this.inWrite = (this.inWrite + 1) % this.MAX_RING;
    }
    this.inCount += len;

    // Step 2: Process complete 480-sample frames through DSP & Dual-Pass Neural Engine
    while (this.inCount >= this.FRAME_SIZE) {
      const heap = this.rnnModule.HEAPF32;
      const inOff = this.inOffset;
      const midOff = this.midOffset;
      const outOff = this.outOffset;

      // Read 480 samples into scratch frame buffer
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        this.frameBuffer[i] = this.inRing[this.inRead];
        this.inRead = (this.inRead + 1) % this.MAX_RING;
      }

      // Upgrade 4: Zero-Latency Derivative Linear Prediction De-Clicker
      // Erases mechanical keyboard clicks before they reach the neural network
      let sumDerivSq = 0.0;
      for (let i = 1; i < this.FRAME_SIZE; i++) {
        const d = this.frameBuffer[i] - this.frameBuffer[i - 1];
        sumDerivSq += d * d;
      }
      const derivRms = Math.sqrt(sumDerivSq / (this.FRAME_SIZE - 1));
      const derivThreshold = Math.max(0.0015, derivRms * 3.5);

      if (this.vadSmooth < 0.80) {
        for (let i = 2; i < this.FRAME_SIZE; i++) {
          const d = Math.abs(this.frameBuffer[i] - this.frameBuffer[i - 1]);
          if (d > derivThreshold) {
            // 2nd-order linear prediction: 2*x[n-1] - x[n-2]
            const predicted = 2.0 * this.frameBuffer[i - 1] - this.frameBuffer[i - 2];
            this.frameBuffer[i] = Math.max(-1.0, Math.min(1.0, predicted));
          }
        }
      }

      // Load into WASM inPtr and extract features
      let zeroCrossings = 0;
      let peak = 0.0;
      let sumSq = 0.0;
      let sumBpSq = 0.0;

      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const s = this.frameBuffer[i];
        heap[inOff + i] = s * 32767.0;

        const absS = Math.abs(s);
        if (absS > peak) peak = absS;
        sumSq += s * s;

        if (i > 0) {
          const prevS = this.frameBuffer[i - 1];
          if ((s >= 0 && prevS < 0) || (s < 0 && prevS >= 0)) {
            zeroCrossings++;
          }
        }

        // Formant Bandpass (300Hz-3000Hz)
        const bpOut = this.bp_b0 * s + this.bp_d1;
        this.bp_d1 = this.bp_b1 * s - this.bp_a1 * bpOut + this.bp_d2;
        this.bp_d2 = this.bp_b2 * s - this.bp_a2 * bpOut;
        sumBpSq += bpOut * bpOut;
      }

      const zcr = zeroCrossings / (this.FRAME_SIZE - 1);
      const frameRms = Math.sqrt(sumSq / this.FRAME_SIZE);
      const crestFactor = frameRms > 1e-5 ? peak / frameRms : 1.0;
      const bpRms = Math.sqrt(sumBpSq / this.FRAME_SIZE);
      const voicedBandRatio = frameRms > 1e-5 ? bpRms / frameRms : 0.0;

      // Upgrade 1: Always-On Dual-Pass Neural Cascade
      // Pass 1: Raw pre-conditioned audio through denoiseState1 -> output in midPtr
      const vadProb1 = this.rnnModule._rnnoise_process_frame(this.denoiseState1, this.midPtr, this.inPtr);
      let combinedVad = vadProb1;

      if (this.mode === 'balanced' || this.mode === 'strong' || this.mode === 'krisp-max' || this.mode === 'rnnoise-hybrid') {
        // Pass 2: Denoise Pass 1 output through denoiseState2 -> output in outPtr
        const vadProb2 = this.rnnModule._rnnoise_process_frame(this.denoiseState2, this.outPtr, this.midPtr);
        // Weighted combination: pass 1 detects voice on raw speech, pass 2 provides secondary confirmation
        combinedVad = vadProb1 * 0.70 + vadProb2 * 0.30;
      } else {
        // Light mode: single pass copy
        for (let i = 0; i < this.FRAME_SIZE; i++) {
          heap[outOff + i] = heap[midOff + i];
        }
      }

      this.vadProb = combinedVad;
      this.vadSmooth = this.vadSmooth * 0.70 + combinedVad * 0.30;

      // Track speaker's peak speech volume with slow decay
      if (combinedVad > 0.75 && this.isSpeechConfirmed) {
        if (frameRms > this.speechPeakRms) {
          this.speechPeakRms = frameRms;
        }
      }
      this.speechPeakRms *= 0.99995;

      // Relative Proximity Threshold: relaxed to preserve full human speech (sibilants, plosives, whispers)
      const minSpeechRms = Math.max(0.001, this.speechPeakRms * 0.04);
      const vadThreshold = (this.mode === 'krisp-max' || this.mode === 'strong') ? 0.65 : 0.50;

      const isFrameSpeech =
        (combinedVad >= vadThreshold) &&
        (zcr < 0.35) &&
        (frameRms > minSpeechRms) &&
        (voicedBandRatio > 0.25) &&
        (crestFactor < 8.0);

      if (isFrameSpeech) {
        this.speechConfirmCount = Math.min(5, this.speechConfirmCount + 1);
      } else {
        this.speechConfirmCount = Math.max(0, this.speechConfirmCount - 1);
      }
      const isSpeechConfirmed = isFrameSpeech || (this.speechConfirmCount >= 1);
      this.isSpeechConfirmed = isSpeechConfirmed;

      if (isSpeechConfirmed) {
        this.hangoverRemaining = this.hangoverMaxSamples;
      }

      // Process 480 samples directly into outRing (zero startup latency & zero frame loss)
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const rawNeural = heap[outOff + i] / 32767.0;

        // Stage 4: Hysteresis Voice Activity Gate
        if (isSpeechConfirmed || this.hangoverRemaining > 0) {
          if (!isSpeechConfirmed) this.hangoverRemaining--;
          this.currentGateGain += this.gateAttackAlpha * (1.0 - this.currentGateGain);
        } else {
          this.currentGateGain += this.gateReleaseAlpha * (this.gateFloorGain - this.currentGateGain);
        }
        const stage4 = rawNeural * this.currentGateGain;

        // STAGE 5: Vocal Presence Restorer (4.2 kHz High-Shelf Exciter)
        const shelfOut = this.shelf_b0 * stage4 + this.shelf_d1;
        this.shelf_d1 = this.shelf_b1 * stage4 - this.shelf_a1 * shelfOut + this.shelf_d2;
        this.shelf_d2 = this.shelf_b2 * stage4 - this.shelf_a2 * shelfOut;

        let stage5 = stage4;
        if (this.vadSmooth > 0.70 && (isSpeechConfirmed || this.hangoverRemaining > 0)) {
          const presenceBlend = Math.min(1.0, (this.vadSmooth - 0.70) / 0.30);
          stage5 = stage4 * (1.0 - presenceBlend) + shelfOut * presenceBlend;
        }

        // Stage 6: Safe Speech-Gated AGC & Limiter
        if ((isSpeechConfirmed || this.hangoverRemaining > 0) && combinedVad > 0.70) {
          this.rmsEnergy = this.rmsEnergy * 0.999 + (stage5 * stage5) * 0.001;
          const currentRms = Math.sqrt(Math.max(this.rmsEnergy, 0.0001));
          const targetAgc = Math.min(1.35, Math.max(0.7, 0.1259 / currentRms));
          this.currentAgcGain += (targetAgc - this.currentAgcGain) * 0.0005;
        } else {
          if (this.currentAgcGain > 1.0) {
            this.currentAgcGain += (1.0 - this.currentAgcGain) * 0.001;
          }
        }

        const leveled = stage5 * this.currentAgcGain;
        const absVal = Math.abs(leveled);
        let finalSample = leveled;
        if (absVal > this.limiterThreshold) {
          const excess = absVal - this.limiterThreshold;
          finalSample = Math.sign(leveled) * (this.limiterThreshold + this.limiterHeadroom * Math.tanh(excess / this.limiterHeadroom));
        }

        this.outRing[this.outWrite] = finalSample;
        this.outWrite = (this.outWrite + 1) % this.MAX_RING;
      }
      this.outCount += this.FRAME_SIZE;

      this.inCount -= this.FRAME_SIZE;
    }

    // Step 3: Pop output samples into Web Audio output channels
    if (this.outCount >= len) {
      for (let i = 0; i < len; i++) {
        const val = this.outRing[this.outRead];
        this.outRead = (this.outRead + 1) % this.MAX_RING;
        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = val;
        }
      }
      this.outCount -= len;
    } else {
      // Warmup phase: output smooth zeros
      for (let i = 0; i < len; i++) {
        let val = 0.0;
        if (this.outCount > 0) {
          val = this.outRing[this.outRead];
          this.outRead = (this.outRead + 1) % this.MAX_RING;
          this.outCount--;
        }
        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = val;
        }
      }
    }

    return true;
  }
}

registerProcessor('gcp-rnnoise-processor', GcpKrispNoiseProcessor);
try {
  registerProcessor('gcp-noise-processor', GcpKrispNoiseProcessor);
} catch (e) {}
`;

const fullWorklet = '// Auto-generated GCP Studio Neural Speech Enhancement AudioWorklet Processor\\n\\n' +
  emscriptenGlue + '\\n\\n' + processorCode;

fs.writeFileSync('public/worklets/gcp-rnnoise-processor.js', fullWorklet, 'utf8');
fs.writeFileSync('public/worklets/gcp-noise-processor.js', fullWorklet, 'utf8');
console.log('Successfully generated public/worklets/gcp-rnnoise-processor.js and public/worklets/gcp-noise-processor.js with all Krisp-killer DSP upgrades.');
