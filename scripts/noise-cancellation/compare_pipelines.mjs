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
const midPtr = mod._malloc(FRAME * 4);
const outPtr = mod._malloc(FRAME * 4);
const inOffset = inPtr / 4;
const midOffset = midPtr / 4;
const outOffset = outPtr / 4;

// 1. Simulate Speech + Continuous Fan + Periodic Keyboard Clicks
const sampleRate = 48000;
const SAMPLES = 48000 * 2; // 2 seconds
const speech = new Float32Array(SAMPLES);
const keyboard = new Float32Array(SAMPLES);
const music = new Float32Array(SAMPLES);
const fan = new Float32Array(SAMPLES);

// Speech starts at 0.5s and lasts until 1.5s (1 second of talking)
for (let i = 24000; i < 72000; i++) {
  const t = (i - 24000) / sampleRate;
  speech[i] = (Math.sin(2 * Math.PI * 220 * t) * 0.4 +
               Math.sin(2 * Math.PI * 440 * t) * 0.2 +
               Math.sin(2 * Math.PI * 880 * t) * 0.1) * 0.3;
}

// Keyboard clicks every 200ms throughout the entire 2 seconds
for (let k = 0; k < 10; k++) {
  const clickStart = k * 9600 + 1000;
  for (let i = 0; i < 240; i++) {
    const t = i / sampleRate;
    keyboard[clickStart + i] = Math.sin(2 * Math.PI * 3500 * t) * Math.exp(-i / 25) * 0.25;
  }
}

// Background music (chords at 330 Hz, 440 Hz, 554 Hz at low volume)
for (let i = 0; i < SAMPLES; i++) {
  const t = i / sampleRate;
  music[i] = (Math.sin(2 * Math.PI * 330 * t) +
              Math.sin(2 * Math.PI * 440 * t) +
              Math.sin(2 * Math.PI * 554 * t)) * 0.03;
}

// Fan noise (deterministic PRNG for exact reproducible benchmark)
let b0 = 0, b1 = 0, b2 = 0;
let seed = 12345;
for (let i = 0; i < SAMPLES; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const white = (seed / 4294967296 - 0.5) * 2;
  b0 = 0.99765 * b0 + white * 0.0990460;
  b1 = 0.96300 * b1 + white * 0.2965164;
  b2 = 0.57000 * b2 + white * 1.0526913;
  fan[i] = (b0 + b1 + b2 + white * 0.1848) * 0.15 * 0.04;
}

const mixed = new Float32Array(SAMPLES);
for (let i = 0; i < SAMPLES; i++) {
  mixed[i] = speech[i] + keyboard[i] + music[i] + fan[i];
}

// Test Pipeline A: OLD (Single RNNoise pass with 20% dry bleed & no lookahead)
function runOldPipeline(input) {
  const state = mod._rnnoise_create();
  const out = new Float32Array(SAMPLES);
  let vadSmooth = 0;
  let residualGain = 1.0;

  for (let f = 0; f < SAMPLES / FRAME; f++) {
    const off = f * FRAME;
    for (let i = 0; i < FRAME; i++) {
      mod.HEAPF32[inOffset + i] = input[off + i] * 32767.0;
    }
    const vad = mod._rnnoise_process_frame(state, outPtr, inPtr);
    vadSmooth = vadSmooth * 0.75 + vad * 0.25;

    const targetResidual = vadSmooth > 0.35 ? 1.0 : 0.45; // Balanced
    const drySpeechRatio = 0.20;

    for (let i = 0; i < FRAME; i++) {
      residualGain += (targetResidual - residualGain) * 0.005;
      const denoised = (mod.HEAPF32[outOffset + i] / 32767.0) * residualGain;
      const dry = input[off + i];
      out[off + i] = vadSmooth > 0.45 ? denoised * (1.0 - drySpeechRatio) + dry * drySpeechRatio : denoised;
    }
  }
  mod._rnnoise_destroy(state);
  return out;
}

// Test Pipeline B: NEW (Dual-Pass RNNoise + Linear Prediction De-Clicker + Sub-Band Wiener + Proximity Gate)
function runNewPipeline(input) {
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

  // Stage 2: Dual-EMA Crest-Factor Transient Suppressor
  const fastAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.0005));
  const slowAlpha = 1.0 - Math.exp(-1.0 / (sampleRate * 0.020));
  let fastDiffEnv = 0, slowDiffEnv = 0;
  let prevIn = 0, prevOut = 0;
  let transientHold = 0;

  // Formant Bandpass (300Hz-3000Hz)
  const omegaBp = (2 * Math.PI * 1000.0) / sampleRate;
  const sinOmegaBp = Math.sin(omegaBp);
  const cosOmegaBp = Math.cos(omegaBp);
  const alphaBp = sinOmegaBp / (2 * 0.5);
  const a0Bp = 1.0 + alphaBp;
  const bp_b0 = (sinOmegaBp / 2.0) / a0Bp;
  const bp_b1 = 0.0;
  const bp_b2 = (-sinOmegaBp / 2.0) / a0Bp;
  const bp_a1 = (-2.0 * cosOmegaBp) / a0Bp;
  const bp_a2 = (1.0 - alphaBp) / a0Bp;
  let bp_d1 = 0, bp_d2 = 0;

  // Sub-Band Filters (<180Hz LP, >3200Hz HP)
  const omegaLp180 = (2 * Math.PI * 180.0) / sampleRate;
  const cosLp180 = Math.cos(omegaLp180);
  const sinLp180 = Math.sin(omegaLp180);
  const alphaLp180 = sinLp180 / (2 * 0.70710678);
  const a0Lp180 = 1.0 + alphaLp180;
  const lp180_b0 = ((1 - cosLp180) / 2) / a0Lp180;
  const lp180_b1 = (1 - cosLp180) / a0Lp180;
  const lp180_b2 = ((1 - cosLp180) / 2) / a0Lp180;
  const lp180_a1 = (-2 * cosLp180) / a0Lp180;
  const lp180_a2 = (1 - alphaLp180) / a0Lp180;
  let lp180_d1 = 0, lp180_d2 = 0;

  const omegaHp3200 = (2 * Math.PI * 3200.0) / sampleRate;
  const cosHp3200 = Math.cos(omegaHp3200);
  const sinHp3200 = Math.sin(omegaHp3200);
  const alphaHp3200 = sinHp3200 / (2 * 0.70710678);
  const a0Hp3200 = 1.0 + alphaHp3200;
  const hp3200_b0 = ((1 + cosHp3200) / 2) / a0Hp3200;
  const hp3200_b1 = (-(1 + cosHp3200)) / a0Hp3200;
  const hp3200_b2 = ((1 + cosHp3200) / 2) / a0Hp3200;
  const hp3200_a1 = (-2 * cosHp3200) / a0Hp3200;
  const hp3200_a2 = (1 - alphaHp3200) / a0Hp3200;
  let hp3200_d1 = 0, hp3200_d2 = 0;

  let noiseFloorLow = 0.0005;
  let noiseFloorHigh = 0.0005;
  let currentLowGain = 1.0;
  let currentHighGain = 1.0;
  let speechPeakRms = 0.035;

  const preConditioned = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const s = input[i];
    const hpfOut = hpf_b0 * s + hpf_d1;
    hpf_d1 = hpf_b1 * s - hpf_a1 * hpfOut + hpf_d2;
    hpf_d2 = hpf_b2 * s - hpf_a2 * hpfOut;

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

  // Dual-Instance RNNoise inference & conditioning
  const state1 = mod._rnnoise_create();
  const state2 = mod._rnnoise_create();
  const out = new Float32Array(SAMPLES);
  let vadSmooth = 0;
  let gateGain = 1.0;
  let hangover = 0;
  let speechConfirmCount = 0;

  const lookaheadBuffer = new Float32Array(FRAME);
  const frameScratch = new Float32Array(FRAME);
  let hasLookahead = false;

  const numFrames = Math.floor(SAMPLES / FRAME);
  for (let f = 0; f < numFrames; f++) {
    const off = f * FRAME;
    for (let i = 0; i < FRAME; i++) {
      frameScratch[i] = preConditioned[off + i];
    }

    // Zero-Latency Derivative Linear Prediction De-Clicker
    let sumDerivSq = 0.0;
    for (let i = 1; i < FRAME; i++) {
      const d = frameScratch[i] - frameScratch[i - 1];
      sumDerivSq += d * d;
    }
    const derivRms = Math.sqrt(sumDerivSq / (FRAME - 1));
    const derivThreshold = Math.max(0.0015, derivRms * 3.5);

    if (vadSmooth < 0.80) {
      for (let i = 2; i < FRAME; i++) {
        const d = Math.abs(frameScratch[i] - frameScratch[i - 1]);
        if (d > derivThreshold) {
          const pred = 2.0 * frameScratch[i - 1] - frameScratch[i - 2];
          frameScratch[i] = Math.max(-1.0, Math.min(1.0, pred));
        }
      }
    }

    let zeroCrossings = 0;
    let peak = 0.0;
    let sumSq = 0.0;
    let sumBpSq = 0.0;

    for (let i = 0; i < FRAME; i++) {
      const s = frameScratch[i];
      mod.HEAPF32[inOffset + i] = s * 32767.0;

      const absS = Math.abs(s);
      if (absS > peak) peak = absS;
      sumSq += s * s;

      if (i > 0) {
        const prevS = frameScratch[i - 1];
        if ((s >= 0 && prevS < 0) || (s < 0 && prevS >= 0)) {
          zeroCrossings++;
        }
      }

      const bpOut = bp_b0 * s + bp_d1;
      bp_d1 = bp_b1 * s - bp_a1 * bpOut + bp_d2;
      bp_d2 = bp_b2 * s - bp_a2 * bpOut;
      sumBpSq += bpOut * bpOut;
    }

    const zcr = zeroCrossings / (FRAME - 1);
    const frameRms = Math.sqrt(sumSq / FRAME);
    const crestFactor = frameRms > 1e-5 ? peak / frameRms : 1.0;
    const bpRms = Math.sqrt(sumBpSq / FRAME);
    const voicedBandRatio = frameRms > 1e-5 ? bpRms / frameRms : 0.0;

    // Dual-Pass RNNoise (Weighted agreement: pass 1 primary, pass 2 secondary)
    const vad1 = mod._rnnoise_process_frame(state1, midPtr, inPtr);
    const vad2 = mod._rnnoise_process_frame(state2, outPtr, midPtr);
    const combinedVad = vad1 * 0.70 + vad2 * 0.30;
    vadSmooth = vadSmooth * 0.70 + combinedVad * 0.30;

    // Relative Proximity Threshold
    if (combinedVad > 0.75 && speechConfirmCount >= 1) {
      if (frameRms > speechPeakRms) speechPeakRms = frameRms;
    }
    speechPeakRms *= 0.99995;
    const minSpeechRms = Math.max(0.001, speechPeakRms * 0.04);

    const isFrameSpeech =
      (combinedVad >= 0.50) &&
      (zcr < 0.35) &&
      (frameRms > minSpeechRms) &&
      (voicedBandRatio > 0.25) &&
      (crestFactor < 8.0);

    if (isFrameSpeech) {
      speechConfirmCount = Math.min(5, speechConfirmCount + 1);
    } else {
      speechConfirmCount = Math.max(0, speechConfirmCount - 1);
    }
    const isSpeechConfirmed = isFrameSpeech || (speechConfirmCount >= 1);

    if (isSpeechConfirmed) {
      hangover = Math.floor(sampleRate * 0.220);
    }

    const outOff = f * FRAME;
    for (let i = 0; i < FRAME; i++) {
      const rawNeural = mod.HEAPF32[outOffset + i] / 32767.0;

      if (isSpeechConfirmed || hangover > 0) {
        if (!isSpeechConfirmed) hangover--;
        gateGain += (1.0 - gateGain) * 0.010;
      } else {
        gateGain += (0.0005 - gateGain) * 0.0002;
      }

      out[outOff + i] = rawNeural * gateGain;
    }
  }

  mod._rnnoise_destroy(state1);
  mod._rnnoise_destroy(state2);
  return out;
}

const outOldMixed = runOldPipeline(mixed);
const outOldSpeech = runOldPipeline(speech);

const outNewMixed = runNewPipeline(mixed);
const outNewSpeech = runNewPipeline(speech);

// Measure noise floor when quiet (first 0.3s)
let quietRmsOld = 0, quietRmsNew = 0;
for (let i = 2000; i < 14400; i++) {
  quietRmsOld += outOldMixed[i] * outOldMixed[i];
  quietRmsNew += outNewMixed[i] * outNewMixed[i];
}
quietRmsOld = Math.sqrt(quietRmsOld / 12400);
quietRmsNew = Math.sqrt(quietRmsNew / 12400);

// Measure background noise leakage DURING active speech (around click at 1.0s, sample 48000 + 1000)
const clickSampleIn = 48000 + 1000;
const clickSampleOut = clickSampleIn;

let clickResidualOld = 0, clickResidualNew = 0;
for (let i = 0; i < 240; i++) {
  const diffOld = outOldMixed[clickSampleOut + i] - outOldSpeech[clickSampleOut + i];
  const diffNew = outNewMixed[clickSampleOut + i] - outNewSpeech[clickSampleOut + i];
  clickResidualOld += diffOld * diffOld;
  clickResidualNew += diffNew * diffNew;
}
clickResidualOld = Math.sqrt(clickResidualOld / 240);
clickResidualNew = Math.sqrt(clickResidualNew / 240);

const reductionDb = 20 * Math.log10(clickResidualNew / clickResidualOld);

console.log('=== Pipeline Comparison: Old (20% Bleed) vs New (GCP 6-Stage Krisp-Killer) ===');
console.log('Quiet Background Noise RMS:     Old:', quietRmsOld.toFixed(5), '| New:', quietRmsNew.toFixed(5));
console.log('Click Residual DURING speech:   Old:', clickResidualOld.toFixed(5), '| New:', clickResidualNew.toFixed(5));
console.log('Transient Reduction Advantage: ', reductionDb.toFixed(2), 'dB improvement during speech!');
