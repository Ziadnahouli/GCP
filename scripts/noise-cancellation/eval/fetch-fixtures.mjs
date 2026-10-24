// Fixture Generator / Fetcher for Audio Evaluation
// Generates calibrated 48 kHz mono 16-bit WAV audio fixtures in docs/audio-samples/
// and tests/fixtures/audio/ for reproducible offline benchmarks.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  SAMPLE_RATE,
  generateSpeechVoice,
  generateFanNoise,
  generateKeyboardClicks,
  generateAirConHum,
  mixToSnr,
  saveWavFile,
} = require('./audio-generator');
const { WorkletHarness } = require('./worklet-runner');

async function main() {
  console.log('=== Generating Audio Samples and Benchmark Fixtures (48 kHz) ===');

  const rootDir = path.resolve(__dirname, '../../..');
  const docsSamplesDir = path.join(rootDir, 'docs/audio-samples');
  const testFixturesDir = path.join(rootDir, 'tests/fixtures/audio');

  fs.mkdirSync(docsSamplesDir, { recursive: true });
  fs.mkdirSync(testFixturesDir, { recursive: true });

  const DURATION_SEC = 3.0;
  const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);

  console.log('1. Synthesizing clean speech...');
  const maleSpeech = generateSpeechVoice({
    durationSec: DURATION_SEC,
    f0: 130,
    amplitude: 0.35,
    seed: 101,
  });
  const femaleSpeech = generateSpeechVoice({
    durationSec: DURATION_SEC,
    f0: 220,
    amplitude: 0.30,
    seed: 202,
  });

  console.log('2. Synthesizing noise fixtures...');
  const fanNoise = generateFanNoise(TOTAL_SAMPLES, 0.09, 303);
  const keyboardNoise = generateKeyboardClicks(TOTAL_SAMPLES, 5, 0.40, 404);
  const humNoise = generateAirConHum(TOTAL_SAMPLES, 0.08);

  console.log('3. Creating calibrated mixtures (10 dB SNR)...');
  const maleFanMix = mixToSnr(maleSpeech.buffer, fanNoise, 10).mixed;
  const maleKeyboardMix = mixToSnr(maleSpeech.buffer, keyboardNoise, 10).mixed;

  console.log('4. Processing through real AudioWorklet RNNoise WASM pipeline...');
  const harness = new WorkletHarness();
  await harness.initialize();

  const { outputSignal: processedFanBalanced } = await harness.processBuffer(maleFanMix, 'balanced');
  const { outputSignal: processedKeyboardBalanced } = await harness.processBuffer(maleKeyboardMix, 'balanced');

  console.log('5. Saving 16-bit 48 kHz WAV files to docs/audio-samples/ ...');
  saveWavFile(path.join(docsSamplesDir, 'speech_clean_reference.wav'), maleSpeech.buffer, SAMPLE_RATE);
  saveWavFile(path.join(docsSamplesDir, 'noisy_mixture_fan_10db.wav'), maleFanMix, SAMPLE_RATE);
  saveWavFile(path.join(docsSamplesDir, 'processed_fan_balanced.wav'), processedFanBalanced, SAMPLE_RATE);
  saveWavFile(path.join(docsSamplesDir, 'noisy_mixture_keyboard_10db.wav'), maleKeyboardMix, SAMPLE_RATE);
  saveWavFile(path.join(docsSamplesDir, 'processed_keyboard_balanced.wav'), processedKeyboardBalanced, SAMPLE_RATE);

  // Copy reference fixtures to tests/fixtures/audio/
  saveWavFile(path.join(testFixturesDir, 'speech_male_48k.wav'), maleSpeech.buffer, SAMPLE_RATE);
  saveWavFile(path.join(testFixturesDir, 'speech_female_48k.wav'), femaleSpeech.buffer, SAMPLE_RATE);
  saveWavFile(path.join(testFixturesDir, 'noise_fan_48k.wav'), fanNoise, SAMPLE_RATE);
  saveWavFile(path.join(testFixturesDir, 'noise_keyboard_48k.wav'), keyboardNoise, SAMPLE_RATE);

  console.log('✅ Generated sample WAV files:');
  const files = fs.readdirSync(docsSamplesDir);
  for (const f of files) {
    const stat = fs.statSync(path.join(docsSamplesDir, f));
    console.log(` - docs/audio-samples/${f} (${stat.size} bytes)`);
  }
}

main().catch((err) => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
