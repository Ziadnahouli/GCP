// Worklet Evaluation Runner
// Loads the real AudioWorklet processor and executes it in 128-sample quanta exactly like a Web Audio thread.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WORKLET_PATH = path.resolve(__dirname, '../../../public/worklets/gcp-rnnoise-processor.js');
const WASM_PATH = path.resolve(__dirname, '../../../public/worklets/rnnoise.wasm');

class WorkletHarness {
  constructor() {
    this.processor = null;
    this.ProcessorClass = null;
    this.messageQueue = [];
    this.readyPromise = null;
    this.readyResolver = null;
  }

  async initialize() {
    if (!fs.existsSync(WORKLET_PATH)) {
      throw new Error(`Worklet file not found at ${WORKLET_PATH}`);
    }
    if (!fs.existsSync(WASM_PATH)) {
      throw new Error(`WASM binary not found at ${WASM_PATH}`);
    }

    const workletSource = fs.readFileSync(WORKLET_PATH, 'utf8');
    const wasmBinary = fs.readFileSync(WASM_PATH);

    const sandbox = {
      sampleRate: 48000,
      AudioWorkletProcessor: class AudioWorkletProcessor {
        constructor() {
          const port = {
            onmessage: null,
            _onHostMessage: null,
            postMessage: (msg) => {
              if (port._onHostMessage) {
                port._onHostMessage(msg);
              }
            },
          };
          this.port = port;
        }
      },
      registerProcessor: (name, cls) => {
        if (name === 'gcp-rnnoise-processor' || name === 'gcp-noise-processor') {
          this.ProcessorClass = cls;
        }
      },
      console: {
        log: () => {},
        warn: () => {},
        error: console.error,
      },
      Math,
      Float32Array,
      Int32Array,
      Int16Array,
      Uint8Array,
      ArrayBuffer,
      Promise,
      setTimeout,
      clearTimeout,
      WebAssembly,
    };

    vm.createContext(sandbox);
    vm.runInContext(workletSource, sandbox);

    if (!this.ProcessorClass) {
      throw new Error('Failed to register GcpNeuralNoiseProcessor from worklet source.');
    }

    this.wasmBinary = wasmBinary;
  }

  async createInstance(mode = 'balanced') {
    const proc = new this.ProcessorClass();
    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    proc.port._onHostMessage = (msg) => {
      if (msg.type === 'READY') {
        resolveReady(msg);
      } else if (msg.type === 'ERROR') {
        rejectReady(new Error(msg.error));
      }
    };

    // Send INIT_WASM with mode and wasmBinary copy
    const wasmCopy = this.wasmBinary.buffer.slice(
      this.wasmBinary.byteOffset,
      this.wasmBinary.byteOffset + this.wasmBinary.byteLength
    );

    proc.port.onmessage({
      data: {
        type: 'INIT_WASM',
        wasmBinary: wasmCopy,
        mode,
      },
    });

    await readyPromise;
    return proc;
  }

  /**
   * Process a complete audio buffer in 128-sample quanta
   */
  async processBuffer(inputSignal, mode = 'balanced') {
    const proc = await this.createInstance(mode);
    const SAMPLES = inputSignal.length;
    const outputSignal = new Float32Array(SAMPLES);
    const QUANTUM = 128;

    const inputBlock = [new Float32Array(QUANTUM)];
    const outputBlock = [new Float32Array(QUANTUM)];
    const inputs = [inputBlock];
    const outputs = [outputBlock];

    const frameExecutionTimesUs = [];
    let processedSamples = 0;

    while (processedSamples < SAMPLES) {
      const remaining = SAMPLES - processedSamples;
      const count = Math.min(QUANTUM, remaining);

      // Fill quantum input
      for (let i = 0; i < count; i++) {
        inputBlock[0][i] = inputSignal[processedSamples + i];
      }
      for (let i = count; i < QUANTUM; i++) {
        inputBlock[0][i] = 0.0;
      }

      // Execute worklet process in high-resolution timing
      const startHr = process.hrtime.bigint();
      proc.process(inputs, outputs);
      const endHr = process.hrtime.bigint();

      // Collect execution time for complete 480-sample frame quanta
      frameExecutionTimesUs.push(Number(endHr - startHr) / 1000);

      // Copy quantum output
      for (let i = 0; i < count; i++) {
        outputSignal[processedSamples + i] = outputBlock[0][i];
      }

      processedSamples += count;
    }

    // Cleanup instance
    if (proc.port.onmessage) {
      proc.port.onmessage({ data: { type: 'DESTROY' } });
    }

    // Compute CPU metrics per 10 ms (480 samples / ~3.75 quanta)
    const quantumPerFrame = 480 / 128;
    const sortedTimes = [...frameExecutionTimesUs].sort((a, b) => a - b);
    const meanTimeUs = frameExecutionTimesUs.reduce((a, b) => a + b, 0) / frameExecutionTimesUs.length;
    const p99TimeUs = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || meanTimeUs;

    const mean10msFrameMs = (meanTimeUs * quantumPerFrame) / 1000;
    const p9910msFrameMs = (p99TimeUs * quantumPerFrame) / 1000;

    return {
      outputSignal,
      mean10msFrameMs,
      p9910msFrameMs,
    };
  }

  /**
   * Measure algorithmic pipeline latency via impulse response
   */
  async measureLatency(mode = 'balanced') {
    if (mode === 'off') {
      return 0.0;
    }

    // Warm up the pipeline with 1 second of low-level speech formants so VAD is open
    const warmupSamples = 48000;
    const testSamples = 48000 * 2;
    const stream = new Float32Array(testSamples);

    for (let i = 0; i < warmupSamples; i++) {
      const t = i / 48000;
      stream[i] = Math.sin(2 * Math.PI * 220 * t) * 0.25;
    }

    // Insert an impulse at 1.0s (sample 48000)
    const impulseIdx = 48000;
    stream[impulseIdx] = 0.90;

    const { outputSignal } = await this.processBuffer(stream, mode);

    // Look for peak in output after impulseIdx
    let maxVal = 0;
    let maxIdx = impulseIdx;
    for (let i = impulseIdx; i < impulseIdx + 4800; i++) {
      const abs = Math.abs(outputSignal[i]);
      if (abs > maxVal) {
        maxVal = abs;
        maxIdx = i;
      }
    }

    const latencySamples = maxIdx - impulseIdx;
    return Number((latencySamples / (48000 / 1000)).toFixed(2));
  }
}

module.exports = {
  WorkletHarness,
};
