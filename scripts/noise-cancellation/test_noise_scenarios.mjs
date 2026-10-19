import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnnoiseJsPath = path.resolve(__dirname, '../../node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.js');
const wasmPath = path.resolve(__dirname, '../../public/worklets/rnnoise.wasm');
const { default: createRNNWasmModule } = await import(pathToFileURL(rnnoiseJsPath).href);

const wasmBinary = fs.readFileSync(wasmPath);
const mod = await createRNNWasmModule({ wasmBinary });

const FRAME = 480;
const inPtr = mod._malloc(FRAME * 4);
const outPtr = mod._malloc(FRAME * 4);
const inOffset = inPtr / 4;
const outOffset = outPtr / 4;

const SAMPLES = 48000;
const sampleRate = 48000;
const speech = new Float32Array(SAMPLES);
for (let i = 0; i < SAMPLES; i++) {
  const t = i / 48000;
  // Vocal formants / harmonics (fundamental 220 Hz + 440 Hz + 880 Hz)
  speech[i] = (Math.sin(2 * Math.PI * 220 * t) * 0.4 +
               Math.sin(2 * Math.PI * 440 * t) * 0.2 +
               Math.sin(2 * Math.PI * 880 * t) * 0.1) * 0.3;
}

// Mechanical keyboard clicks (transient impacts every 100ms)
const keyboard = new Float32Array(SAMPLES);
for (let k = 1; k < 9; k++) {
  const clickStart = k * 4800;
  for (let i = 0; i < 240; i++) {
    const t = i / 48000;
    keyboard[clickStart + i] = Math.sin(2 * Math.PI * 3500 * t) * Math.exp(-i / 30) * 0.3;
  }
}

const mixed = new Float32Array(SAMPLES);
for (let i = 0; i < SAMPLES; i++) {
  mixed[i] = speech[i] + keyboard[i];
}

// ----------------------------------------------------------------------------
// Pipeline 1: Baseline Stock RNNoise (Without Stage 1-2 DSP Pre-Conditioning)
// ----------------------------------------------------------------------------
function runBaselinePipeline(input) {
  const state = mod._rnnoise_create();
  const output = new Float32Array(SAMPLES);
  const numFrames = SAMPLES / FRAME;
  for (let f = 0; f < numFrames; f++) {
    const off = f * FRAME;
    for (let i = 0; i < FRAME; i++) {
      mod.HEAPF32[inOffset + i] = input[off + i] * 32767.0;
    }
    mod._rnnoise_process_frame(state, outPtr, inPtr);
    for (let i = 0; i < FRAME; i++) {
      output[off + i] = mod.HEAPF32[outOffset + i] / 32767.0;
    }
  }
  mod._rnnoise_destroy(state);
  return output;
}

// ----------------------------------------------------------------------------
// Pipeline 2: GCP 6-Stage Krisp-Killer Cascade
// ----------------------------------------------------------------------------
function runGcpKrispPipeline(input) {
  // Stage 1: 85 Hz Butterworth High-Pass Biquad
  const omegaHpf = (2 * Math.PI * 85.0) / sampleRate;
  const cosOmegaHpf = Math.cos(omegaHpf);
  const alphaHpf = Math.sin(omegaHpf) / (2 * 0.70710678);
  const a0Hpf = 1 + alphaHpf;
  const hpf_b0 = (1 + cosOmegaHpf) / (2 * a0Hpf);
  const hpf_b1 = -(1 + cosOmegaHpf) / a0Hpf;
  const hpf_b2 = (1 + cosOmegaHpf) / (2 * a0Hpf);
  const hpf_a1 = (-2 * cosOmegaHpf) / a0Hpf;
  const hpf_a2 = (1 - alphaHpf) / a0Hpf;
  let hpf_d1 = 0, hpf_d2 = 0;

  // Stage 2: Dual-EMA Crest-Factor Transient Click Suppressor (derivative domain)
  const fastAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.0005)); // 0.5ms
  const slowAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.020));  // 20ms
  let fastDiffEnv = 0, slowDiffEnv = 0;
  let prevIn = 0, prevOut = 0;
  let transientHold = 0;

  const preConditioned = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const s = input[i];
    // Stage 1 HPF
    const hpfOut = hpf_b0 * s + hpf_d1;
    hpf_d1 = hpf_b1 * s - hpf_a1 * hpfOut + hpf_d2;
    hpf_d2 = hpf_b2 * s - hpf_a2 * hpfOut;

    // Stage 2 Transient Suppressor
    const diff = Math.abs(hpfOut - prevIn);
    prevIn = hpfOut;
    fastDiffEnv += fastAlpha * (diff - fastDiffEnv);
    slowDiffEnv += slowAlpha * (diff - slowDiffEnv);

    const safeSlow = Math.max(slowDiffEnv, 0.002);
    const crest = fastDiffEnv / safeSlow;
    if (crest > 3.98) {
      transientHold = 1.0;
    }
    transientHold *= 0.95;

    const maxSlope = 0.016;
    const delta = hpfOut - prevOut;
    const absDelta = Math.abs(delta);

    let declicked = hpfOut;
    if (transientHold > 0.05 || absDelta > maxSlope) {
      const effectiveSlope = maxSlope * (1.0 - 0.75 * transientHold);
      const excess = Math.max(0, absDelta - effectiveSlope);
      declicked = prevOut + Math.sign(delta) * (effectiveSlope + 0.008 * Math.tanh(excess / 0.008));
    }
    prevOut = declicked;
    preConditioned[i] = declicked;
  }

  // Stage 3-6 Neural inference & conditioning
  const state = mod._rnnoise_create();
  const output = new Float32Array(SAMPLES);
  const numFrames = SAMPLES / FRAME;
  let vadSmooth = 0.0;
  let gateGain = 1.0;
  let hangover = 0;

  // Stage 5 High-Shelf Presence Filter
  const A_shelf = Math.pow(10, 2.0 / 40.0);
  const omegaShelf = (2 * Math.PI * 4200.0) / sampleRate;
  const cosOmegaShelf = Math.cos(omegaShelf);
  const sinOmegaShelf = Math.sin(omegaShelf);
  const alphaShelf = (sinOmegaShelf / 2.0) * Math.sqrt((A_shelf + 1.0 / A_shelf) * (1.0 / 0.70710678 - 1.0) + 2.0);
  const twoSqrtAAlpha = 2.0 * Math.sqrt(A_shelf) * alphaShelf;
  const a0Shelf = (A_shelf + 1.0) - (A_shelf - 1.0) * cosOmegaShelf + twoSqrtAAlpha;
  const shelf_b0 = (A_shelf * ((A_shelf + 1.0) + (A_shelf - 1.0) * cosOmegaShelf + twoSqrtAAlpha)) / a0Shelf;
  const shelf_b1 = (-2.0 * A_shelf * ((A_shelf - 1.0) + (A_shelf + 1.0) * cosOmegaShelf)) / a0Shelf;
  const shelf_b2 = (A_shelf * ((A_shelf + 1.0) + (A_shelf - 1.0) * cosOmegaShelf - twoSqrtAAlpha)) / a0Shelf;
  const shelf_a1 = (2.0 * ((A_shelf - 1.0) - (A_shelf + 1.0) * cosOmegaShelf)) / a0Shelf;
  const shelf_a2 = ((A_shelf + 1.0) - (A_shelf - 1.0) * cosOmegaShelf - twoSqrtAAlpha) / a0Shelf;
  let shelf_d1 = 0, shelf_d2 = 0;

  for (let f = 0; f < numFrames; f++) {
    const off = f * FRAME;
    for (let i = 0; i < FRAME; i++) {
      mod.HEAPF32[inOffset + i] = preConditioned[off + i] * 32767.0;
    }
    const vad = mod._rnnoise_process_frame(state, outPtr, inPtr);
    vadSmooth = vadSmooth * 0.75 + vad * 0.25;

    for (let i = 0; i < FRAME; i++) {
      const wet = mod.HEAPF32[outOffset + i] / 32767.0;
      const dry = preConditioned[off + i];
      const dryBlend = vadSmooth > 0.65 ? 0.04 : 0.0;
      const s3 = wet * (1.0 - dryBlend) + dry * dryBlend;

      // Stage 4 Hysteresis VAD Gate
      if (vadSmooth >= 0.35) {
        gateGain += (1.0 - gateGain) * 0.010;
        hangover = Math.floor(sampleRate * 0.180);
      } else if (hangover > 0) {
        hangover--;
        gateGain = 1.0;
      } else {
        gateGain += (0.0056 - gateGain) * 0.0001;
      }
      const s4 = s3 * gateGain;

      // Stage 5 Vocal Presence Restorer
      const shelfOut = shelf_b0 * s4 + shelf_d1;
      shelf_d1 = shelf_b1 * s4 - shelf_a1 * shelfOut + shelf_d2;
      shelf_d2 = shelf_b2 * s4 - shelf_a2 * shelfOut;
      let s5 = s4;
      if (vadSmooth > 0.75) {
        const presenceBlend = Math.min(1.0, (vadSmooth - 0.75) / 0.25);
        s5 = s4 * (1.0 - presenceBlend) + shelfOut * presenceBlend;
      }

      // Stage 6 Soft Limiter
      let s6 = s5;
      const absS5 = Math.abs(s5);
      if (absS5 > 0.891) {
        const excess = absS5 - 0.891;
        s6 = Math.sign(s5) * (0.891 + 0.109 * Math.tanh(excess / 0.109));
      }

      output[off + i] = s6;
    }
  }
  mod._rnnoise_destroy(state);
  return output;
}

// ----------------------------------------------------------------------------
// Differential Analysis: Measure keyboard transient residual during speech
// ----------------------------------------------------------------------------
const baselineSpeechOut = runBaselinePipeline(speech);
const baselineMixedOut = runBaselinePipeline(mixed);

const krispSpeechOut = runGcpKrispPipeline(speech);
const krispMixedOut = runGcpKrispPipeline(mixed);

// Measure across multiple keyboard click transients (click 1 to 7)
let rawClicksEnergy = 0;
let baselineResidualEnergy = 0;
let krispResidualEnergy = 0;
let totalClickSamples = 0;

for (let k = 1; k < 8; k++) {
  const inStart = k * 4800;
  const outStart = inStart + 480; // 10ms frame algorithmic latency
  for (let i = 0; i < 240; i++) {
    const kIn = keyboard[inStart + i];
    rawClicksEnergy += kIn * kIn;

    // True residual noise = (mixed output) - (clean speech output through same pipeline)
    const resBaseline = baselineMixedOut[outStart + i] - baselineSpeechOut[outStart + i];
    baselineResidualEnergy += resBaseline * resBaseline;

    const resKrisp = krispMixedOut[outStart + i] - krispSpeechOut[outStart + i];
    krispResidualEnergy += resKrisp * resKrisp;

    totalClickSamples++;
  }
}

const rawRms = Math.sqrt(rawClicksEnergy / totalClickSamples);
const baselineResidualRms = Math.sqrt(baselineResidualEnergy / totalClickSamples);
const krispResidualRms = Math.sqrt(krispResidualEnergy / totalClickSamples);

const baselineSuppDb = 20 * Math.log10(baselineResidualRms / rawRms);
const krispSuppDb = 20 * Math.log10(krispResidualRms / rawRms);
const netAdvantageDb = baselineSuppDb - krispSuppDb;

console.log('================================================================');
console.log('  NON-STATIONARY TRANSIENT REJECTION BENCHMARK (KEYBOARD CLICKS)');
console.log('================================================================');
console.log(`Raw Key Click Input RMS:         ${rawRms.toFixed(5)}`);
console.log(`Stock RNNoise Residual Click:    ${baselineResidualRms.toFixed(5)} (${baselineSuppDb >= 0 ? '+' : ''}${baselineSuppDb.toFixed(2)} dB suppression)`);
console.log(`GCP 6-Stage Krisp-Killer:        ${krispResidualRms.toFixed(5)} (${krispSuppDb.toFixed(2)} dB suppression)`);
console.log('----------------------------------------------------------------');
console.log(`Objective Improvement Over Stock: +${netAdvantageDb.toFixed(2)} dB greater noise rejection!`);
console.log('================================================================');
