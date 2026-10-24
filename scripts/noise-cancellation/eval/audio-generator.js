// Evaluation Audio Generator: Synthesizes calibrated speech and noise fixtures at 48 kHz
// CC0/Algorithmic permissive synthesis ensuring zero large media files in git.

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 48000;

function createWavHeader(numSamples, sampleRate = 48000) {
  const buffer = Buffer.alloc(44);
  const dataSize = numSamples * 2; // 16-bit mono
  const fileSize = 36 + dataSize;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // PCM
  buffer.writeUInt16LE(1, 22);  // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function floatTo16BitPcm(floatArray) {
  const pcm = Buffer.alloc(floatArray.length * 2);
  for (let i = 0; i < floatArray.length; i++) {
    const s = Math.max(-1, Math.min(1, floatArray[i]));
    pcm.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  return pcm;
}

function saveWavFile(filePath, floatArray, sampleRate = 48000) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const header = createWavHeader(floatArray.length, sampleRate);
  const pcm = floatTo16BitPcm(floatArray);
  fs.writeFileSync(filePath, Buffer.concat([header, pcm]));
}

function calculateRms(buf, start = 0, end = buf.length) {
  let sum = 0;
  const count = Math.max(1, end - start);
  for (let i = start; i < end; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / count);
}

// Deterministic Pseudo-Random Number Generator (PRNG) for bit-exact repeatable benchmarks
class Prng {
  constructor(seed = 123456789) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  nextSigned() {
    return (this.next() - 0.5) * 2;
  }
}

/**
 * Phonetically realistic speech synthesis
 * @param {object} options: { durationSec, f0, amplitude, whisper, formants }
 */
function generateSpeechVoice({
  durationSec = 3.0,
  f0 = 130, // 130 Hz for male, 220 Hz for female
  amplitude = 0.3,
  whisper = false,
  seed = 42,
}) {
  const numSamples = Math.floor(durationSec * SAMPLE_RATE);
  const buf = new Float32Array(numSamples);
  const prng = new Prng(seed);

  // Sequence of phonemes simulating spoken syllables with natural pause gaps
  const words = [
    // Word 1: "Nexus" (/n/ /e/ /k/ /s/ /ah/ /s/)
    { type: 'nasal', f0, dur: 0.10, amp: amplitude * 0.7 },
    { type: 'vowel', f0, formants: [530, 1840, 2480], dur: 0.18, amp: amplitude },
    { type: 'plosive', freq: 3000, dur: 0.04, amp: amplitude * 0.8 },
    { type: 'fricative', centerFreq: 5200, bw: 2000, dur: 0.14, amp: amplitude * 0.6 },
    { type: 'pause', dur: 0.20 },

    // Word 2: "Tactical" (/t/ /ae/ /k/ /t/ /ih/ /k/ /l/)
    { type: 'plosive', freq: 3500, dur: 0.05, amp: amplitude * 0.9 },
    { type: 'vowel', f0, formants: [660, 1720, 2410], dur: 0.22, amp: amplitude },
    { type: 'plosive', freq: 2800, dur: 0.04, amp: amplitude * 0.8 },
    { type: 'vowel', f0, formants: [390, 1990, 2550], dur: 0.16, amp: amplitude * 0.9 },
    { type: 'fricative', centerFreq: 4800, bw: 1800, dur: 0.12, amp: amplitude * 0.5 },
    { type: 'pause', dur: 0.30 },

    // Word 3: "Online" (/aa/ /n/ /l/ /ay/ /n/)
    { type: 'vowel', f0, formants: [730, 1090, 2440], dur: 0.20, amp: amplitude },
    { type: 'nasal', f0, dur: 0.10, amp: amplitude * 0.7 },
    { type: 'vowel', f0, formants: [270, 2290, 3010], dur: 0.22, amp: amplitude },
    { type: 'pause', dur: 0.40 },
  ];

  let currentSample = 0;
  let wordIdx = 0;
  const onsets = []; // Timestamps of speech starts for onset-preservation evaluation

  while (currentSample < numSamples) {
    const item = words[wordIdx % words.length];
    wordIdx++;
    const segSamples = Math.min(Math.floor(item.dur * SAMPLE_RATE), numSamples - currentSample);

    if (item.type !== 'pause') {
      // Mark onset if previous was pause or start
      if (currentSample === 0 || words[(wordIdx - 2 + words.length) % words.length]?.type === 'pause') {
        onsets.push(currentSample);
      }
    }

    for (let i = 0; i < segSamples; i++) {
      const globalIdx = currentSample + i;
      const t = i / SAMPLE_RATE;
      const env = Math.sin((Math.PI * i) / segSamples);

      if (item.type === 'vowel') {
        if (whisper) {
          // Aperiodic turbulent noise shaped by vowel formants
          let val = 0;
          const white = prng.nextSigned();
          for (const fmt of item.formants) {
            val += white * Math.sin(2 * Math.PI * fmt * t) * 0.35;
          }
          buf[globalIdx] = val * env * (item.amp * 0.4);
        } else {
          let val = 0;
          for (const fmt of item.formants) {
            val += Math.sin(2 * Math.PI * fmt * t) * 0.30;
          }
          val += Math.sin(2 * Math.PI * item.f0 * t) * 0.50;
          val += Math.sin(2 * Math.PI * (item.f0 * 2) * t) * 0.25;
          buf[globalIdx] = val * env * item.amp;
        }
      } else if (item.type === 'fricative') {
        const white = prng.nextSigned();
        buf[globalIdx] = white * Math.sin(2 * Math.PI * item.centerFreq * t) * env * item.amp;
      } else if (item.type === 'plosive') {
        const decay = Math.exp(-i / (SAMPLE_RATE * 0.008));
        const transient = Math.sin(2 * Math.PI * item.freq * t) + prng.nextSigned() * 0.4;
        buf[globalIdx] = transient * decay * item.amp;
      } else if (item.type === 'nasal') {
        const val = Math.sin(2 * Math.PI * item.f0 * t) * 0.6 + Math.sin(2 * Math.PI * 250 * t) * 0.4;
        buf[globalIdx] = val * env * item.amp;
      } else {
        buf[globalIdx] = 0.0;
      }
    }
    currentSample += segSamples;
  }

  return { buffer: buf, onsets };
}

// Noise Synthesizers
function generateFanNoise(samples, amplitude = 0.08, seed = 101) {
  const buf = new Float32Array(samples);
  const prng = new Prng(seed);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < samples; i++) {
    const white = prng.nextSigned();
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.96300 * b1 + white * 0.2965164;
    b2 = 0.57000 * b2 + white * 1.0526913;
    buf[i] = (b0 + b1 + b2 + white * 0.1848) * 0.15 * amplitude;
  }
  return buf;
}

function generateKeyboardClicks(samples, clickRate = 4, amplitude = 0.35, seed = 202) {
  const buf = new Float32Array(samples);
  const prng = new Prng(seed);
  const clickPeriod = Math.floor(SAMPLE_RATE / clickRate);
  for (let i = 0; i < samples; i++) {
    const clickPhase = i % clickPeriod;
    if (clickPhase < 320) { // ~6.6 ms sharp mechanical switch click
      const t = clickPhase / SAMPLE_RATE;
      const decay = Math.exp(-clickPhase / 35);
      const freq = 3400 + prng.nextSigned() * 400;
      buf[i] = Math.sin(2 * Math.PI * freq * t) * decay * amplitude;
    }
  }
  return buf;
}

function generateMouseClicks(samples, clickRate = 3, amplitude = 0.20, seed = 303) {
  const buf = new Float32Array(samples);
  const clickPeriod = Math.floor(SAMPLE_RATE / clickRate);
  for (let i = 0; i < samples; i++) {
    const clickPhase = i % clickPeriod;
    if (clickPhase < 120) { // ~2.5 ms short high-frequency microswitch click
      const t = clickPhase / SAMPLE_RATE;
      const decay = Math.exp(-clickPhase / 15);
      buf[i] = Math.sin(2 * Math.PI * 5500 * t) * decay * amplitude;
    }
  }
  return buf;
}

function generateAirConHum(samples, amplitude = 0.07) {
  const buf = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const hum = Math.sin(2 * Math.PI * 60 * t) * 0.7 +
                Math.sin(2 * Math.PI * 120 * t) * 0.3 +
                Math.sin(2 * Math.PI * 180 * t) * 0.15;
    buf[i] = hum * amplitude;
  }
  return buf;
}

function generateStreetNoise(samples, amplitude = 0.05, seed = 404) {
  const buf = new Float32Array(samples);
  const prng = new Prng(seed);
  let lowpass = 0;
  for (let i = 0; i < samples; i++) {
    const white = prng.nextSigned();
    lowpass += 0.02 * (white - lowpass);
    const t = i / SAMPLE_RATE;
    const traffic = Math.sin(2 * Math.PI * 0.5 * t) * 0.5 + 0.5;
    buf[i] = (lowpass * 1.5 + white * 0.1) * traffic * amplitude;
  }
  return buf;
}

function generateCafeBabble(samples, amplitude = 0.06, seed = 505) {
  const buf = new Float32Array(samples);
  const prng = new Prng(seed);
  const talkers = [
    { f: 160, speed: 1.2 },
    { f: 210, speed: 0.9 },
    { f: 260, speed: 1.4 },
    { f: 110, speed: 0.8 },
  ];
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    let sum = 0;
    for (const tk of talkers) {
      const mod = Math.sin(2 * Math.PI * tk.speed * t);
      sum += Math.sin(2 * Math.PI * tk.f * t) * Math.max(0, mod);
    }
    buf[i] = (sum * 0.25 + prng.nextSigned() * 0.1) * amplitude;
  }
  return buf;
}

function generateTvMusic(samples, amplitude = 0.05) {
  const buf = new Float32Array(samples);
  const chords = [
    [261.63, 329.63, 392.00], // C major
    [220.00, 261.63, 329.63], // A minor
    [174.61, 220.00, 261.63], // F major
    [196.00, 246.94, 293.66], // G major
  ];
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const chordIdx = Math.floor(t / 0.8) % chords.length;
    const [c1, c2, c3] = chords[chordIdx];
    const val = (Math.sin(2 * Math.PI * c1 * t) +
                 Math.sin(2 * Math.PI * c2 * t) +
                 Math.sin(2 * Math.PI * c3 * t)) * 0.33;
    buf[i] = val * amplitude;
  }
  return buf;
}

function generateDogBark(samples, amplitude = 0.35, seed = 606) {
  const buf = new Float32Array(samples);
  const prng = new Prng(seed);
  const barkPeriod = Math.floor(SAMPLE_RATE * 1.2);
  for (let i = 0; i < samples; i++) {
    const phase = i % barkPeriod;
    if (phase < 9600) { // 200 ms bark
      const t = phase / SAMPLE_RATE;
      const decay = Math.exp(-phase / 2400);
      const modFreq = 450 - 150 * (phase / 9600);
      const bark = (Math.sin(2 * Math.PI * modFreq * t) + prng.nextSigned() * 0.5) * decay;
      buf[i] = bark * amplitude;
    }
  }
  return buf;
}

/**
 * Mix speech and noise to an exact target SNR (dB)
 */
function mixToSnr(cleanSpeech, noise, targetSnrDb) {
  const len = Math.min(cleanSpeech.length, noise.length);
  const speechRms = calculateRms(cleanSpeech, 0, len);
  const noiseRms = calculateRms(noise, 0, len);

  if (speechRms === 0 || noiseRms === 0) {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = cleanSpeech[i] + noise[i];
    return out;
  }

  // targetSnrDb = 20 * log10(speechRms / (scale * noiseRms))
  // scale = (speechRms / noiseRms) * 10^(-targetSnrDb / 20)
  const scale = (speechRms / noiseRms) * Math.pow(10, -targetSnrDb / 20);

  const mixed = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    mixed[i] = cleanSpeech[i] + noise[i] * scale;
  }
  return { mixed, scaledNoiseScale: scale };
}

module.exports = {
  SAMPLE_RATE,
  generateSpeechVoice,
  generateFanNoise,
  generateKeyboardClicks,
  generateMouseClicks,
  generateAirConHum,
  generateStreetNoise,
  generateCafeBabble,
  generateTvMusic,
  generateDogBark,
  mixToSnr,
  calculateRms,
  saveWavFile,
};
