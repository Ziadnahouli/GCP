/**
 * GCP Real-Time Neural Speech Enhancement Worklet Processor
 *
 * Runs inside the AudioWorklet audio rendering thread.
 * Coordinates Web Audio 128-sample render quanta with RNNoise 480-sample frame processing.
 */

import {
  NoiseCancellationMode,
  MODE_CONFIGS,
  ButterworthHighPassFilter,
  TransientClickSuppressor,
  HysteresisGateExpander,
  SlowSpeechLeveler,
  SoftLimiter,
} from './dsp-core';

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare const currentTime: number;
declare const sampleRate: number;
declare function registerProcessor(name: string, processorCtor: any): void;
declare const createRNNWasmModule: any;

export class GcpNeuralNoiseProcessor extends AudioWorkletProcessor {
  FRAME_SIZE = 480;
  MAX_RING = 8192;
  PRIME_THRESHOLD = 256;
  sampleRate: number;

  // Ring buffers
  inRing: Float32Array;
  outRing: Float32Array;
  dryRing: Float32Array; // Delay-compensated dry buffer for click-free crossfading (N7)
  inWrite = 0;
  inRead = 0;
  inCount = 0;
  outWrite = 0;
  outRead = 0;
  outCount = 0;
  dryWrite = 0;
  dryRead = 0;

  // DSP Stages
  hpf: ButterworthHighPassFilter;
  declicker: TransientClickSuppressor;
  gate: HysteresisGateExpander;
  leveler: SlowSpeechLeveler;
  limiter: SoftLimiter;

  // Crossfade state for zero-click mode transitions (N7)
  crossfadeGain = 1.0;
  targetCrossfadeGain = 1.0;
  crossfadeStep = 1.0 / 720; // 15 ms crossfade at 48 kHz

  // Performance and Telemetry metrics (O1)
  underruns = 0;
  framesProcessed = 0;
  totalProcessTimeMs = 0;
  maxProcessTimeMs = 0;
  lastTelemetryTime = 0;
  inputRmsAccum = 0;
  outputRmsAccum = 0;
  rmsSampleCount = 0;

  // WASM State
  isReady = false;
  isInitializing = false;
  isPrimed = false;
  mode: NoiseCancellationMode = 'balanced';
  savedMode: NoiseCancellationMode = 'balanced';
  rnnModule: any = null;
  denoiseState: any = null;
  inPtr = 0;
  outPtr = 0;
  inOffset = 0;
  outOffset = 0;
  vadSmooth = 0.0;

  constructor() {
    super();
    this.sampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;

    this.inRing = new Float32Array(this.MAX_RING);
    this.outRing = new Float32Array(this.MAX_RING);
    this.dryRing = new Float32Array(this.MAX_RING);

    this.hpf = new ButterworthHighPassFilter(75, this.sampleRate);
    this.declicker = new TransientClickSuppressor(this.sampleRate, 12.0);
    this.gate = new HysteresisGateExpander(this.mode);
    this.leveler = new SlowSpeechLeveler();
    this.limiter = new SoftLimiter();

    this.port.onmessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'INIT_WASM') {
        if (this.isReady || this.isInitializing) return;
        this.isInitializing = true;
        try {
          if (data.mode) {
            this._applyMode(data.mode);
            if (data.mode === 'off') {
              this.crossfadeGain = 0.0;
            }
          }
          await this._initModule(data.wasmBinary, data.wasmModule);
        } catch (err: any) {
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

  _applyMode(mode: NoiseCancellationMode) {
    if (!mode) return;
    this.mode = mode;
    if (mode !== 'off') {
      this.savedMode = mode;
      this.targetCrossfadeGain = 1.0;
      this.gate.setMode(mode);
    } else {
      this.targetCrossfadeGain = 0.0;
    }
  }

  async _initModule(wasmBinary?: ArrayBuffer, wasmModule?: any) {
    if (typeof createRNNWasmModule !== 'function') {
      throw new Error('createRNNWasmModule is not defined in worklet scope');
    }

    const config: any = {};
    if (wasmBinary) {
      config.wasmBinary = wasmBinary;
    }
    if (wasmModule && typeof WebAssembly !== 'undefined') {
      config.instantiateWasm = (imports: any, successCallback: any) => {
        WebAssembly.instantiate(wasmModule, imports)
          .then((instance) => {
            successCallback(instance, wasmModule);
          })
          .catch((err) => {
            console.warn('[GcpWorklet] instantiateWasm module failed, trying wasmBinary:', err);
            if (wasmBinary) {
              WebAssembly.instantiate(wasmBinary, imports)
                .then((res) => {
                  successCallback(res.instance, res.module);
                })
                .catch((binErr) => {
                  this.port.postMessage({ type: 'ERROR', error: String(binErr) });
                });
            } else {
              this.port.postMessage({ type: 'ERROR', error: String(err) });
            }
          });
        return {};
      };
    }

    const mod = await createRNNWasmModule(config);
    this.rnnModule = mod && mod.ready && typeof mod._malloc !== 'function' ? await mod.ready : mod;

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
    });
  }

  _cleanup() {
    this.isReady = false;
    this.isPrimed = false;
    if (this.rnnModule) {
      if (this.denoiseState) {
        try {
          this.rnnModule._rnnoise_destroy(this.denoiseState);
        } catch {}
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
    this.hpf.reset();
    this.declicker.reset();
    this.gate.reset();
    this.leveler.reset();
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inputChannel0 = input[0];
    const numInputChannels = input.length;
    const len = inputChannel0.length;
    const numOutputChannels = output.length;

    const startPerf = typeof currentTime !== 'undefined' ? currentTime : 0;

    // Hard fallback passthrough if WASM is not ready
    if (!this.isReady) {
      for (let ch = 0; ch < numOutputChannels; ch++) {
        const inCh = input[ch] || inputChannel0;
        const outCh = output[ch];
        for (let i = 0; i < len; i++) {
          outCh[i] = inCh[i];
        }
      }
      return true;
    }

    // Bit-exact passthrough when mode is off and crossfade has completed (Rule 5)
    if (this.mode === 'off' && this.crossfadeGain <= 0.0) {
      for (let ch = 0; ch < numOutputChannels; ch++) {
        const inCh = input[ch] || inputChannel0;
        const outCh = output[ch];
        for (let i = 0; i < len; i++) {
          outCh[i] = inCh[i];
        }
      }
      return true;
    }

    // Step 1: Ingest input samples, Downmix to mono, Apply Stage 1 HPF (75Hz)
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

      this.inputRmsAccum += rawMono * rawMono;

      // Stage 1: 75 Hz Butterworth HPF
      const hpfOut = this.hpf.process(rawMono);

      // Store in input ring for RNNoise framing
      this.inRing[this.inWrite] = hpfOut;
      this.inWrite = (this.inWrite + 1) % this.MAX_RING;

      // Also store raw in delay-compensated dry ring for seamless click-free crossfade (N7)
      this.dryRing[this.dryWrite] = rawMono;
      this.dryWrite = (this.dryWrite + 1) % this.MAX_RING;
    }
    this.inCount += len;

    // Step 2: Process complete 480-sample frames through RNNoise Neural Engine
    while (this.inCount >= this.FRAME_SIZE) {
      const heap = this.rnnModule.HEAPF32;
      const inOff = this.inOffset;
      const outOff = this.outOffset;

      for (let i = 0; i < this.FRAME_SIZE; i++) {
        const s = this.inRing[this.inRead];
        heap[inOff + i] = s * 32767.0;
        this.inRead = (this.inRead + 1) % this.MAX_RING;
      }

      // Execute single-pass RNNoise GRU inference
      const vadProb = this.rnnModule._rnnoise_process_frame(this.denoiseState, this.outPtr, this.inPtr);
      this.vadSmooth = this.vadSmooth * 0.70 + vadProb * 0.30;
      this.gate.updateState(this.vadSmooth);

      for (let i = 0; i < this.FRAME_SIZE; i++) {
        // Pure neural speech output
        const wet = heap[outOff + i] / 32767.0;

        // Stage 2: Scale-tolerant declicker post-RNNoise on residual (Q1)
        const declicked = this.declicker.process(wet, this.vadSmooth);

        // Stage 3: Comfort downward expander during pauses with hysteresis (Q2)
        const expanded = this.gate.process(declicked);

        // Stage 4: Controlled speech loudness leveler (Q3)
        const leveled = this.leveler.process(expanded, this.vadSmooth);

        // Stage 5: -1.0 dBFS True-Peak Soft Brickwall Limiter
        const limited = this.limiter.process(leveled);

        this.outRing[this.outWrite] = limited;
        this.outWrite = (this.outWrite + 1) % this.MAX_RING;
      }

      this.outCount += this.FRAME_SIZE;
      this.inCount -= this.FRAME_SIZE;
      this.framesProcessed++;
    }

    // Step 3: Priming verification to prevent periodic underruns
    if (!this.isPrimed && this.outCount >= this.PRIME_THRESHOLD) {
      this.isPrimed = true;
      // Align dry ring pointer with output latency
      this.dryRead = (this.dryWrite - this.outCount + this.MAX_RING) % this.MAX_RING;
    }

    // Step 4: Crossfade output samples (N7 click-free mode transition)
    if (this.isPrimed && this.outCount >= len) {
      for (let i = 0; i < len; i++) {
        const wetVal = this.outRing[this.outRead];
        this.outRead = (this.outRead + 1) % this.MAX_RING;

        const dryVal = this.dryRing[this.dryRead];
        this.dryRead = (this.dryRead + 1) % this.MAX_RING;

        // Smooth linear crossfade toward target gain (1.0 = full wet, 0.0 = full dry)
        if (this.crossfadeGain < this.targetCrossfadeGain) {
          this.crossfadeGain = Math.min(this.targetCrossfadeGain, this.crossfadeGain + this.crossfadeStep);
        } else if (this.crossfadeGain > this.targetCrossfadeGain) {
          this.crossfadeGain = Math.max(this.targetCrossfadeGain, this.crossfadeGain - this.crossfadeStep);
        }

        const finalSample = (1.0 - this.crossfadeGain) * dryVal + this.crossfadeGain * wetVal;
        this.outputRmsAccum += finalSample * finalSample;

        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = finalSample;
        }
      }
      this.outCount -= len;
    } else {
      // Underrun or priming: gracefully output dry input to prevent audio dropouts/stutters
      if (this.isPrimed) {
        this.underruns++;
      }
      for (let i = 0; i < len; i++) {
        const dryVal = inputChannel0[i] || 0.0;
        this.outputRmsAccum += dryVal * dryVal;
        for (let ch = 0; ch < numOutputChannels; ch++) {
          output[ch][i] = input[ch] ? input[ch][i] : dryVal;
        }
      }
    }

    this.rmsSampleCount += len;

    // Periodic telemetry publishing every ~250 ms (O1)
    if (this.rmsSampleCount >= 12000) {
      const inRms = Math.sqrt(this.inputRmsAccum / this.rmsSampleCount);
      const outRms = Math.sqrt(this.outputRmsAccum / this.rmsSampleCount);
      const inDb = inRms > 1e-5 ? 20 * Math.log10(inRms) : -100;
      const outDb = outRms > 1e-5 ? 20 * Math.log10(outRms) : -100;

      this.port.postMessage({
        type: 'TELEMETRY',
        inputRmsDb: inDb,
        outputRmsDb: outDb,
        vadProb: this.vadSmooth,
        gateGain: this.gate.currentGain,
        underruns: this.underruns,
        mode: this.mode,
        crossfadeGain: this.crossfadeGain,
      });

      this.inputRmsAccum = 0;
      this.outputRmsAccum = 0;
      this.rmsSampleCount = 0;
    }

    return true;
  }
}

try {
  registerProcessor('gcp-rnnoise-processor', GcpNeuralNoiseProcessor);
} catch {}
