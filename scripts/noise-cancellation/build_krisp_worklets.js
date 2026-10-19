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
 * Production architecture:
 *   1. Pre-Processing: 80Hz Butterworth High-Pass Biquad (2nd-order, Q=0.7071)
 *      - Strips DC offset, sub-audible desk rumble, and plosive pops without affecting vocal timbre.
 *   2. Single-Pass RNNoise GRU Neural Speech Enhancement (48kHz, 480 samples / 10ms frame)
 *      - Recurrent GRU state preserved continuously across frames.
 *      - Continuous spectral feature extraction and Bark-band gain synthesis.
 *   3. Mode-Tailored Speech Preserving Blend & Comfort Noise Floor:
 *      - 'off': Bit-exact passthrough of input stream.
 *      - 'balanced': 90% neural denoised + 10% natural acoustic floor during speech;
 *                    gentle -26 dB downward expansion during pauses with 200ms hangover.
 *                    Full whisper, consonant, and syllable ending preservation.
 *      - 'strong': 100% neural denoised; -38 dB stationary pause attenuation with 180ms hangover.
 *   4. Zero-Latency -1.0 dBFS Soft Limiter (tanh headroom saturation)
 *      - Prevents digital clipping from loud vocal bursts or mic bumps.
 *   5. Ring Buffer Conversion (128-sample Web Audio quantum <-> 480-sample RNNoise frame)
 *      - 8192-sample ring buffers with zero dynamic allocations in real-time callback.
 *      - Low algorithmic latency (~12.7 ms end-to-end).
 */
class GcpNeuralNoiseProcessor extends AudioWorkletProcessor {
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

    // RNNoise WASM module, state, and pointers
    this.rnnModule = null;
    this.denoiseState = null;
    this.inPtr = 0;
    this.outPtr = 0;
    this.inOffset = 0;
    this.outOffset = 0;

    // Stage 1: 80 Hz Butterworth High-Pass Biquad (2nd-order, Q = 0.7071)
    const omegaHpf = (2 * Math.PI * 80.0) / this.sampleRate;
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

    // Stage 3: Smooth VAD tracker & Comfort Floor Expander
    this.vadProb = 0.0;
    this.vadSmooth = 0.0;
    this.gateAttackAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.005));  // 5ms smooth attack
    this.gateReleaseAlpha = 1.0 - Math.exp(-1.0 / (this.sampleRate * 0.120)); // 120ms gentle release
    this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.200);           // 200ms hangover
    this.hangoverRemaining = 0;
    this.gateFloorGain = 0.050; // -26 dB comfortable natural floor for Balanced mode
    this.currentGateGain = 1.0;
    this.dryBlend = 0.10;       // 10% clean dry blend during speech for Balanced mode

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

    if (mode === 'strong' || mode === 'krisp-max') {
      this.dryBlend = 0.0;
      this.gateFloorGain = 0.0125; // -38 dB stationary floor
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.180);
    } else if (mode === 'light') {
      this.dryBlend = 0.20;
      this.gateFloorGain = 0.10;   // -20 dB light floor
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.250);
    } else {
      // balanced & rnnoise-hybrid
      this.dryBlend = 0.10;
      this.gateFloorGain = 0.050;  // -26 dB balanced natural floor
      this.hangoverMaxSamples = Math.floor(this.sampleRate * 0.200);
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
    this.outPtr = this.rnnModule._malloc(this.FRAME_SIZE * 4);
    this.inOffset = this.inPtr / 4;
    this.outOffset = this.outPtr / 4;

    this.denoiseState = this.rnnModule._rnnoise_create();

    this.isReady = true;
    this.port.postMessage({ type: 'READY', sampleRate: this.sampleRate });
  }

  _cleanup() {
    this.isReady = false;
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

    // Step 1: Ingest input samples, Downmix to mono, Apply Stage 1 80Hz HPF
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

      // STAGE 1: 80 Hz Butterworth High-Pass Filter (removes rumble, pops)
      const hpfOut = this.hpf_b0 * rawMono + this.hpf_d1;
      this.hpf_d1 = this.hpf_b1 * rawMono - this.hpf_a1 * hpfOut + this.hpf_d2;
      this.hpf_d2 = this.hpf_b2 * rawMono - this.hpf_a2 * hpfOut;

      this.inRing[this.inWrite] = hpfOut;
      this.inWrite = (this.inWrite + 1) % this.MAX_RING;
    }
    this.inCount += len;

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

      // Single-Pass High-Fidelity RNNoise Neural Denoising
      const vadProb = this.rnnModule._rnnoise_process_frame(this.denoiseState, this.outPtr, this.inPtr);
      this.vadProb = vadProb;
      this.vadSmooth = this.vadSmooth * 0.70 + vadProb * 0.30;

      const isSpeech = (this.vadSmooth > 0.40);
      if (isSpeech) {
        this.hangoverRemaining = this.hangoverMaxSamples;
      }

      // Process 480 samples into outRing
      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const wet = heap[outOff + i] / 32767.0;
        const dry = this.frameBuffer[i];

        // Mode-tailored blend
        let blended = wet;
        if (this.dryBlend > 0.0) {
          blended = wet * (1.0 - this.dryBlend) + dry * this.dryBlend;
        }

        // Comfort downward expander during pauses
        if (isSpeech || this.hangoverRemaining > 0) {
          if (!isSpeech) this.hangoverRemaining--;
          this.currentGateGain += this.gateAttackAlpha * (1.0 - this.currentGateGain);
        } else {
          this.currentGateGain += this.gateReleaseAlpha * (this.gateFloorGain - this.currentGateGain);
        }

        const expanded = blended * this.currentGateGain;

        // Stage 4: -1.0 dBFS Soft-Brickwall Limiter
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
      // Warmup phase: output whatever is available, or smooth zero
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
