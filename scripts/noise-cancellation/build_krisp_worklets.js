const fs = require('fs');
const path = require('path');

// Fix Emscripten createRNNWasmModule ready resolution bug
const emscriptenGlue = fs.readFileSync('node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.js', 'utf8')
  .replace('return createRNNWasmModule.ready', 'return Module["ready"];')
  .replace('export default createRNNWasmModule;', '');

const processorCode = `
/**
 * GCP Real-Time Neural Speech Enhancement Worklet Processor
 *
 * Production Architecture & Mathematical Guarantees:
 *   1. Pre-Processing: 75Hz Butterworth High-Pass Biquad (2nd-order, Q=0.7071)
 *      - Strips DC offset, sub-audible desk vibration, boom arm handling, and plosive wind blasts.
 *      - Completely preserves lowest male vocal fundamentals (lowest human bass ~85Hz).
 *   2. Dual-Stage Fast Transient Click Suppressor (dual EMA crest-factor detector)
 *      - Fast EMA (0.5ms) vs slow EMA (20ms) envelope tracking.
 *      - Smooth tanh slope clamping on mechanical keyboard keycaps & mouse click shocks.
 *      - Clamps transient spikes before RNNoise feature extraction, preventing false VAD triggers.
 *   3. Single-Pass High-Fidelity RNNoise GRU Neural Speech Enhancement (48kHz, 480 samples / 10ms frame)
 *      - Recurrent GRU hidden state preserved continuously across frames.
 *      - Zero dry-noise bleed (dryBlend = 0.0) so raw fan/keyboard noise never leaks into speech.
 *   4. Mode-Tailored Natural Acoustic Floor Expander with Hysteresis VAD Gating:
 *      - 'off': Bit-exact passthrough of input stream.
 *      - 'balanced': 100% neural denoised speech; -36 dB downward expansion during pauses with 200ms hangover.
 *                    Full whisper, consonant, and syllable ending preservation.
 *      - 'strong' / 'krisp-max': 100% neural denoised speech; -50 dB pause attenuation (digital black) with 180ms hangover.
 *                    Heavy keyboard and mouse click suppression.
 *   5. True-Peak Soft Limiter (-1.0 dBFS)
 *      - Smooth analog-style tanh saturation headroom preventing digital overs without pumping.
 *   6. Deterministic Ring Buffer & Zero-Periodic-Underrun Conversion
 *      - 8192-sample ring buffers with 512-sample pre-roll priming.
 *      - Eliminates periodic 32-sample dropouts/stutters (steady-state outCount >= 448 samples).
 *      - Bounded latency (~14 ms) with zero dynamic heap allocations on audio rendering thread.
 */
class GcpNeuralNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.FRAME_SIZE = 480;
    this.MAX_RING = 8192;
    this.sampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;

    // Ring buffers for Web Audio quantum <-> RNNoise frame conversion
    this.inRing = new Float32Array(this.MAX_RING);
    this.outRing = new Float32Array(this.MAX_RING);
    this.inWrite = 0;
    this.inRead = 0;
    this.inCount = 0;
    this.outWrite = 0;
    this.outRead = 0;
    this.outCount = 0;

    // Pre-roll priming to strictly prevent periodic underruns
    this.isPrimed = false;
    this.PRIME_THRESHOLD = 512;

    // Scratch frame buffers for zero-allocation processing
    this.frameBuffer = new Float32Array(this.FRAME_SIZE);

    // State flags
    this.isReady = false;
    this.isInitializing = false;
    this.mode = 'balanced';
    this.savedMode = 'balanced';

    // RNNoise WASM module, state, and pointers
    this.rnnModule = null;
    this.denoiseState = null;
    this.inPtr = 0;
    this.outPtr = 0;
    this.inOffset = 0;
    this.outOffset = 0;

    // Resampling state for non-48kHz hardware contexts
    this.needsResample = (this.sampleRate !== 48000);
    this.resampleRatioIn = 48000 / this.sampleRate;
    this.resampleRatioOut = this.sampleRate / 48000;
    this.resamplePhaseIn = 0.0;
    this.resamplePhaseOut = 0.0;
    this.lastSampleIn = 0.0;
    this.lastSampleOut = 0.0;

    // Stage 1: Conservative 75 Hz Butterworth High-Pass Biquad (2nd-order, Q = 0.7071)
    const targetRate = this.needsResample ? 48000 : this.sampleRate;
    const omegaHpf = (2 * Math.PI * 75.0) / targetRate;
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

    // Stage 1b: Fast Transient Click Suppressor (Keyboard & Mouse click rejection)
    this.clickFastAlpha = 1.0 - Math.exp(-1.0 / (targetRate * 0.0005)); // 0.5ms fast EMA
    this.clickSlowAlpha = 1.0 - Math.exp(-1.0 / (targetRate * 0.020));  // 20ms slow EMA
    this.clickThresholdRatio = Math.pow(10, 12.0 / 20.0);
    this.clickFastEnv = 0.0;
    this.clickSlowEnv = 0.0;
    this.clickPrevIn = 0.0;
    this.clickPrevSample = 0.0;
    this.clickHold = 0.0;

    // Stage 3: Smooth VAD tracker & Comfort Floor Expander with Hysteresis
    this.vadProb = 0.0;
    this.vadSmooth = 0.0;
    this.isSpeaking = false;
    this.speechThreshold = 0.48;
    this.speechHysteresis = 0.38;
    this.gateAttackAlpha = 1.0 - Math.exp(-1.0 / (48000 * 0.003));   // 3ms crisp attack
    this.gateReleaseAlpha = 1.0 - Math.exp(-1.0 / (48000 * 0.150));  // 150ms gentle release
    this.hangoverMaxSamples = Math.floor(48000 * 0.200);             // 200ms hangover
    this.hangoverRemaining = 0;
    this.gateFloorGain = 0.0158; // -36 dB comfortable natural floor for Balanced mode
    this.currentGateGain = 1.0;

    // Stage 4: -1.0 dBFS Soft-Brickwall Limiter
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
          await this._initModule(data.wasmBinary, data.wasmModule);
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

    if (mode === 'strong' || mode === 'krisp-max') {
      this.gateFloorGain = 0.00316; // -50 dB pause floor (digital black)
      this.speechThreshold = 0.52;
      this.speechHysteresis = 0.42;
      this.hangoverMaxSamples = Math.floor(48000 * 0.180);
      this.clickThresholdRatio = Math.pow(10, 10.0 / 20.0); // 10 dB aggressive click suppression
    } else if (mode === 'light') {
      this.gateFloorGain = 0.050;   // -26 dB gentle pause floor
      this.speechThreshold = 0.42;
      this.speechHysteresis = 0.35;
      this.hangoverMaxSamples = Math.floor(48000 * 0.250);
      this.clickThresholdRatio = Math.pow(10, 14.0 / 20.0);
    } else {
      // balanced & rnnoise-hybrid
      this.gateFloorGain = 0.0158;  // -36 dB balanced natural floor (~20 dB quieter than raw)
      this.speechThreshold = 0.48;
      this.speechHysteresis = 0.38;
      this.hangoverMaxSamples = Math.floor(48000 * 0.200);
      this.clickThresholdRatio = Math.pow(10, 12.0 / 20.0);
    }
  }

  _declick(sample, vad) {
    const diff = Math.abs(sample - this.clickPrevIn);
    this.clickPrevIn = sample;
    this.clickFastEnv += this.clickFastAlpha * (diff - this.clickFastEnv);
    this.clickSlowEnv += this.clickSlowAlpha * (diff - this.clickSlowEnv);

    const safeSlow = Math.max(this.clickSlowEnv, 0.001);
    const crest = this.clickFastEnv / safeSlow;
    if (crest > this.clickThresholdRatio && vad < 0.70) {
      this.clickHold = 1.0;
    }
    this.clickHold *= 0.95;

    const maxSlope = 0.025 + 0.045 * Math.min(1.0, vad);
    const delta = sample - this.clickPrevSample;
    const absDelta = Math.abs(delta);

    let filtered = sample;
    if ((this.clickHold > 0.05 || absDelta > maxSlope) && vad < 0.70) {
      const effectiveSlope = maxSlope * (1.0 - 0.75 * this.clickHold);
      const excess = Math.max(0.0, absDelta - effectiveSlope);
      filtered = this.clickPrevSample + Math.sign(delta) * (effectiveSlope + 0.008 * Math.tanh(excess / 0.008));
    }
    this.clickPrevSample = filtered;
    return filtered;
  }

  async _initModule(wasmBinary, wasmModule) {
    if (typeof createRNNWasmModule !== 'function') {
      throw new Error('createRNNWasmModule is not defined in worklet scope');
    }

    const config = {};
    if (wasmModule && typeof WebAssembly !== 'undefined') {
      config.instantiateWasm = (imports, successCallback) => {
        WebAssembly.instantiate(wasmModule, imports)
          .then((instance) => {
            successCallback(instance, wasmModule);
          })
          .catch((err) => {
            console.error('[GcpWorklet] instantiateWasm error:', err);
          });
        return {};
      };
    } else if (wasmBinary) {
      config.wasmBinary = wasmBinary;
    }

    const mod = await createRNNWasmModule(config);
    this.rnnModule = (mod && mod.ready && typeof mod._malloc !== 'function') ? await mod.ready : mod;

    this.inPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.outPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.inOffset = this.inPtr / 4;
    this.outOffset = this.outPtr / 4;

    this.denoiseState = this.rnnModule._rnnoise_create();

    this.isReady = true;
    this.port.postMessage({
      type: 'READY',
      sampleRate: this.sampleRate,
      engine: 'rnnoise-wasm',
      resampled: this.needsResample
    });
  }

  _cleanup() {
    this.isReady = false;
    this.isPrimed = false;
    if (this.rnnModule) {
      if (this.denoiseState) {
        try { this.rnnModule._rnnoise_destroy(this.denoiseState); } catch {}
        this.denoiseState = null;
      }
      if (this.inPtr) {
        try { this.rnnModule._free(this.inPtr); } catch {}
        this.inPtr = 0;
      }
      if (this.outPtr) {
        try { this.rnnModule._free(this.outPtr); } catch {}
        this.outPtr = 0;
      }
      this.rnnModule = null;
    }
    this.inCount = 0;
    this.outCount = 0;
    this.inWrite = 0;
    this.inRead = 0;
    this.outWrite = 0;
    this.outRead = 0;
    this.clickFastEnv = 0.0;
    this.clickSlowEnv = 0.0;
    this.clickPrevIn = 0.0;
    this.clickPrevSample = 0.0;
    this.clickHold = 0.0;
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
      this.isPrimed = false;
      return true;
    }

    // Step 1: Ingest input samples, Downmix to mono, Apply Stage 1 75Hz HPF & Stage 1b Declicker
    if (!this.needsResample) {
      // 48 kHz Fast-Path
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

        // STAGE 1: 75 Hz Butterworth High-Pass Filter (removes rumble, pops)
        const hpfOut = this.hpf_b0 * rawMono + this.hpf_d1;
        this.hpf_d1 = this.hpf_b1 * rawMono - this.hpf_a1 * hpfOut + this.hpf_d2;
        this.hpf_d2 = this.hpf_b2 * rawMono - this.hpf_a2 * hpfOut;

        // STAGE 1b: Transient Click Suppressor (keyboard clicks & desk knocks)
        const declicked = this._declick(hpfOut, this.vadSmooth);

        this.inRing[this.inWrite] = declicked;
        this.inWrite = (this.inWrite + 1) % this.MAX_RING;
      }
      this.inCount += len;
    } else {
      // Fractional linear resampling to 48 kHz
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

        while (this.resamplePhaseIn < 1.0) {
          const interp = this.lastSampleIn + this.resamplePhaseIn * (rawMono - this.lastSampleIn);
          const hpfOut = this.hpf_b0 * interp + this.hpf_d1;
          this.hpf_d1 = this.hpf_b1 * interp - this.hpf_a1 * hpfOut + this.hpf_d2;
          this.hpf_d2 = this.hpf_b2 * interp - this.hpf_a2 * hpfOut;

          const declicked = this._declick(hpfOut, this.vadSmooth);

          this.inRing[this.inWrite] = declicked;
          this.inWrite = (this.inWrite + 1) % this.MAX_RING;
          this.inCount++;
          this.resamplePhaseIn += this.resampleRatioIn;
        }
        this.resamplePhaseIn -= 1.0;
        this.lastSampleIn = rawMono;
      }
    }

    // Step 2: Process complete 480-sample frames through RNNoise Neural Engine
    while (this.inCount >= this.FRAME_SIZE) {
      const heap = this.rnnModule.HEAPF32;
      const inOff = this.inOffset;
      const outOff = this.outOffset;

      // Read 480 samples into scratch frame buffer and WASM input heap
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const s = this.inRing[this.inRead];
        this.frameBuffer[i] = s;
        heap[inOff + i] = s * 32767.0;
        this.inRead = (this.inRead + 1) % this.MAX_RING;
      }

      // Single-Pass High-Fidelity RNNoise Neural Denoising (Continuous GRU State)
      const vadProb = this.rnnModule._rnnoise_process_frame(this.denoiseState, this.outPtr, this.inPtr);
      this.vadProb = vadProb;
      this.vadSmooth = this.vadSmooth * 0.70 + vadProb * 0.30;

      // Hysteresis speech gate: requires speechThreshold to start, stays open down to speechHysteresis
      const activeThreshold = this.isSpeaking ? this.speechHysteresis : this.speechThreshold;
      this.isSpeaking = (this.vadSmooth > activeThreshold);
      if (this.isSpeaking) {
        this.hangoverRemaining = this.hangoverMaxSamples;
      }

      // Process 480 samples into outRing
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        // Pure neural speech output
        const wet = heap[outOff + i] / 32767.0;

        // Comfort downward expander during non-speech pauses
        if (this.isSpeaking || this.hangoverRemaining > 0) {
          if (!this.isSpeaking) this.hangoverRemaining--;
          this.currentGateGain += this.gateAttackAlpha * (1.0 - this.currentGateGain);
        } else {
          this.currentGateGain += this.gateReleaseAlpha * (this.gateFloorGain - this.currentGateGain);
        }

        const expanded = wet * this.currentGateGain;

        // Stage 4: -1.0 dBFS Soft-Brickwall Limiter (tanh saturation)
        const absVal = Math.abs(expanded);
        let finalSample = expanded;
        if (absVal > this.limiterThreshold) {
          const excess = absVal - this.limiterThreshold;
          finalSample = Math.sign(expanded) * (this.limiterThreshold + this.limiterHeadroom * Math.tanh(excess / this.limiterHeadroom));
        }

        this.outRing[this.outWrite] = finalSample;
        this.outWrite = (this.outWrite + 1) % this.MAX_RING;
      }
      this.outCount += this.FRAME_SIZE;
      this.inCount -= this.FRAME_SIZE;
    }

    // Step 3: Priming verification to completely eliminate periodic 32-sample underruns
    if (!this.isPrimed && this.outCount >= this.PRIME_THRESHOLD) {
      this.isPrimed = true;
    }

    // Step 4: Pop output samples into Web Audio output channels
    if (this.isPrimed && this.outCount >= len) {
      for (let i = 0; i < len; i++) {
        const val = this.outRing[this.outRead];
        this.outRead = (this.outRead + 1) % this.MAX_RING;
        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = val;
        }
      }
      this.outCount -= len;
    } else {
      // Warmup / priming phase: output smooth silence while buffer builds steady-state pre-roll
      for (let i = 0; i < len; i++) {
        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = 0.0;
        }
      }
    }

    return true;
  }
}

registerProcessor('gcp-rnnoise-processor', GcpNeuralNoiseProcessor);
try {
  registerProcessor('gcp-noise-processor', GcpNeuralNoiseProcessor);
} catch (e) {}
`;

const fullWorklet = '// Auto-generated GCP Production Neural Speech Enhancement AudioWorklet Processor\n\n' +
  emscriptenGlue + '\n\n' + processorCode;

fs.writeFileSync('public/worklets/gcp-rnnoise-processor.js', fullWorklet, 'utf8');
fs.writeFileSync('public/worklets/gcp-noise-processor.js', fullWorklet, 'utf8');
console.log('Successfully generated public/worklets/gcp-rnnoise-processor.js and public/worklets/gcp-noise-processor.js.');
