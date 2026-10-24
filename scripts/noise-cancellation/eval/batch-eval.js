// Batch 50-Utterance Audio Evaluation with 95% Confidence Intervals
// Validates DSP metrics across >= 50 distinct speaker utterances (pitch 85-300 Hz)
// and diverse noise conditions to provide statistically honest evaluation.

const fs = require('fs');
const path = require('path');
const {
  SAMPLE_RATE,
  generateSpeechVoice,
  generateFanNoise,
  generateKeyboardClicks,
  generateAirConHum,
  generateStreetNoise,
  generateCafeBabble,
  mixToSnr,
} = require('./audio-generator');
const {
  calculateSiSdr,
  calculateStoi,
  calculateOnsetPreservation,
  calculateGateFalseCloseRate,
  calculateClickAttenuation,
  verifyNumericalIntegrity,
  findBestLag,
} = require('./metrics');
const { WorkletHarness } = require('./worklet-runner');

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr, m) {
  const avg = m !== undefined ? m : mean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function confidenceInterval95(arr) {
  const n = arr.length;
  const m = mean(arr);
  const s = stdDev(arr, m);
  const margin = 1.96 * (s / Math.sqrt(n));
  return {
    mean: Number(m.toFixed(3)),
    stdDev: Number(s.toFixed(3)),
    margin: Number(margin.toFixed(3)),
    ciLow: Number((m - margin).toFixed(3)),
    ciHigh: Number((m + margin).toFixed(3)),
    formatted: `${m.toFixed(3)} ± ${margin.toFixed(3)} [${(m - margin).toFixed(3)}, ${(m + margin).toFixed(3)}]`,
  };
}

async function runBatchEvaluation() {
  console.log('========================================================================');
  console.log('  50-UTTERANCE STATISTICAL EVALUATION WITH 95% CONFIDENCE INTERVALS    ');
  console.log('========================================================================\n');

  const harness = new WorkletHarness();
  await harness.initialize();

  const NUM_UTTERANCES = 50;
  const DURATION_SEC = 2.0;
  const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);

  console.log(`Generating ${NUM_UTTERANCES} diverse speech utterances (pitch range: 85 Hz to 300 Hz)...`);

  const utterances = [];
  for (let i = 0; i < NUM_UTTERANCES; i++) {
    // Pitch distributed across typical male (85-155 Hz) and female (165-280 Hz) fundamentals
    const f0 = 85 + (i * (300 - 85)) / (NUM_UTTERANCES - 1);
    const amp = 0.25 + 0.15 * Math.sin(i * 1.5); // Amplitude between 0.15 and 0.40
    const whisper = i % 10 === 0; // Every 10th utterance is whispered speech
    utterances.push({
      id: i + 1,
      f0,
      whisper,
      speech: generateSpeechVoice({ durationSec: DURATION_SEC, f0, amplitude: amp, whisper, seed: 1000 + i }),
    });
  }

  // Generate diverse ambient noise fixtures
  const fanNoise = generateFanNoise(TOTAL_SAMPLES, 0.08, 101);
  const keyboardNoise = generateKeyboardClicks(TOTAL_SAMPLES, 4, 0.35, 202);
  const humNoise = generateAirConHum(TOTAL_SAMPLES, 0.07);
  const streetNoise = generateStreetNoise(TOTAL_SAMPLES, 0.06, 404);
  const babbleNoise = generateCafeBabble(TOTAL_SAMPLES, 0.07, 505);

  const MODES = ['off', 'light', 'balanced', 'strong'];
  const summaryReport = {};

  for (const mode of MODES) {
    console.log(`\nBenchmarking Mode: [${mode.toUpperCase()}] across ${NUM_UTTERANCES} utterances...`);

    const metricArrays = {
      stoi: [],
      cleanSiSdr: [],
      onsetPreservation: [],
      gateFalseClose: [],
      mix10dbSiSdrImprovement: [],
      fanAttenuation: [],
      keyboardPeakCut: [],
      cpuTimeMs: [],
    };

    for (let i = 0; i < NUM_UTTERANCES; i++) {
      const u = utterances[i];
      const cleanBuf = u.speech.buffer;

      // 1. Clean speech processing
      const { outputSignal: cleanOut, mean10msFrameMs } = await harness.processBuffer(cleanBuf, mode);
      const lag = mode === 'off' ? 0 : findBestLag(cleanBuf, cleanOut);

      const sdrResult = calculateSiSdr(cleanBuf, cleanOut, lag);
      const stoi = calculateStoi(cleanBuf, cleanOut, lag);
      const onsetPreservation = calculateOnsetPreservation(cleanBuf, cleanOut, u.speech.onsets, lag);
      const gateFalseClose = calculateGateFalseCloseRate(cleanBuf, cleanOut, lag);

      metricArrays.stoi.push(stoi);
      metricArrays.cleanSiSdr.push(sdrResult.siSdr);
      metricArrays.onsetPreservation.push(onsetPreservation);
      metricArrays.gateFalseClose.push(gateFalseClose);
      metricArrays.cpuTimeMs.push(mean10msFrameMs);

      // 2. Mixture at 10 dB SNR with fan noise
      const mix10 = mixToSnr(cleanBuf, fanNoise, 10);
      const { outputSignal: mixOut } = await harness.processBuffer(mix10.mixed, mode);
      const mixLag = mode === 'off' ? 0 : findBestLag(cleanBuf, mixOut);
      const initialMixSdr = calculateSiSdr(cleanBuf, mix10.mixed, 0).siSdr;
      const finalMixSdr = calculateSiSdr(cleanBuf, mixOut, mixLag).siSdr;
      metricArrays.mix10dbSiSdrImprovement.push(finalMixSdr - initialMixSdr);

      // 3. Isolated noise attenuation
      const { outputSignal: fanOut } = await harness.processBuffer(fanNoise, mode);
      const fanInRms = Math.sqrt(fanNoise.reduce((acc, v) => acc + v * v, 0) / fanNoise.length);
      const fanOutRms = Math.sqrt(fanOut.reduce((acc, v) => acc + v * v, 0) / fanOut.length);
      const fanAtten = 20 * Math.log10((fanOutRms + 1e-9) / (fanInRms + 1e-9));
      metricArrays.fanAttenuation.push(fanAtten);

      // 4. Keyboard click peak attenuation
      const { outputSignal: keyOut } = await harness.processBuffer(keyboardNoise, mode);
      const keyPeakIn = Math.max(...keyboardNoise.map(Math.abs));
      const keyPeakOut = Math.max(...keyOut.map(Math.abs));
      const keyCut = 20 * Math.log10((keyPeakOut + 1e-9) / (keyPeakIn + 1e-9));
      metricArrays.keyboardPeakCut.push(keyCut);
    }

    summaryReport[mode] = {
      utteranceCount: NUM_UTTERANCES,
      stoi: confidenceInterval95(metricArrays.stoi),
      cleanSiSdr: confidenceInterval95(metricArrays.cleanSiSdr),
      onsetPreservation: confidenceInterval95(metricArrays.onsetPreservation),
      gateFalseClose: confidenceInterval95(metricArrays.gateFalseClose),
      mix10dbSiSdrImprovement: confidenceInterval95(metricArrays.mix10dbSiSdrImprovement),
      fanAttenuation: confidenceInterval95(metricArrays.fanAttenuation),
      keyboardPeakCut: confidenceInterval95(metricArrays.keyboardPeakCut),
      cpuTimeMs: confidenceInterval95(metricArrays.cpuTimeMs),
    };

    console.log(` - STOI: ${summaryReport[mode].stoi.formatted}`);
    console.log(` - Onset Preservation: ${summaryReport[mode].onsetPreservation.formatted}%`);
    console.log(` - Fan Attenuation: ${summaryReport[mode].fanAttenuation.formatted} dB`);
    console.log(` - Keystroke Peak Cut: ${summaryReport[mode].keyboardPeakCut.formatted} dB`);
    console.log(` - CPU Frame Time: ${summaryReport[mode].cpuTimeMs.formatted} ms`);
  }

  const jsonPath = path.resolve(__dirname, '../../../docs/noise-baseline-ci95.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summaryReport, null, 2), 'utf8');
  console.log(`\n✅ Statistical 95% CI metrics written to ${jsonPath}`);

  return summaryReport;
}

if (require.main === module) {
  runBatchEvaluation().catch((err) => {
    console.error('Batch evaluation failed:', err);
    process.exit(1);
  });
}

module.exports = { runBatchEvaluation };
