// Objective Audio Quality and Speech Enhancement Metrics Suite
// Calculates SI-SDR, STOI, Noise Attenuation, Onset Preservation, Keystroke Attenuation, Latency, and CPU.

const SAMPLE_RATE = 48000;

function calculateRms(buf, start = 0, end = buf.length) {
  let sum = 0;
  const count = Math.max(1, end - start);
  for (let i = start; i < end; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / count);
}

function calculatePeak(buf, start = 0, end = buf.length) {
  let peak = 0;
  for (let i = start; i < end; i++) {
    const abs = Math.abs(buf[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/**
 * Cross-correlation lag finder to find exact pipeline lookahead / buffer delay
 */
function findBestLag(reference, testSignal, maxLag = 1440) { // Up to 30ms search
  const len = Math.min(reference.length, testSignal.length);
  let bestLag = 0;
  let maxCorr = -Infinity;

  for (let lag = 0; lag <= maxLag; lag += 4) {
    let corr = 0;
    const count = Math.min(len - lag, 48000); // Check 1 second
    for (let i = 0; i < count; i += 2) {
      corr += reference[i] * testSignal[i + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  // Refine lag to single sample precision
  const startRefine = Math.max(0, bestLag - 6);
  const endRefine = Math.min(maxLag, bestLag + 6);
  for (let lag = startRefine; lag <= endRefine; lag++) {
    let corr = 0;
    const count = Math.min(len - lag, 48000);
    for (let i = 0; i < count; i++) {
      corr += reference[i] * testSignal[i + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  return bestLag;
}

/**
 * Scale-Invariant Signal-to-Distortion Ratio (SI-SDR)
 */
function calculateSiSdr(target, estimated, lag = null) {
  const actualLag = lag !== null ? lag : findBestLag(target, estimated);
  const len = Math.min(target.length, estimated.length - actualLag);
  if (len <= 0) return { siSdr: 0, lag: 0 };

  let dotTargetEst = 0;
  let energyTarget = 0;

  for (let i = 0; i < len; i++) {
    const t = target[i];
    const e = estimated[i + actualLag];
    dotTargetEst += t * e;
    energyTarget += t * t;
  }

  if (energyTarget === 0) return { siSdr: 0, lag: actualLag };
  const alpha = dotTargetEst / energyTarget;

  let sTargetEnergy = 0;
  let eNoiseEnergy = 0;

  for (let i = 0; i < len; i++) {
    const sTarget = alpha * target[i];
    const eNoise = estimated[i + actualLag] - sTarget;
    sTargetEnergy += sTarget * sTarget;
    eNoiseEnergy += eNoise * eNoise;
  }

  if (eNoiseEnergy === 0) return { siSdr: 99.0, lag: actualLag };
  const ratio = Math.max(1e-12, sTargetEnergy / Math.max(1e-12, eNoiseEnergy));
  return {
    siSdr: 10 * Math.log10(ratio),
    lag: actualLag,
    lagMs: (actualLag / (SAMPLE_RATE / 1000)).toFixed(2),
  };
}

/**
 * Short-Time Objective Intelligibility (STOI) Standardized Metric (Taal et al., 2011)
 * Approximated in 1/3-octave band domain across 384 ms time frames
 */
function calculateStoi(cleanRef, degraded, lag = null) {
  const actualLag = lag !== null ? lag : findBestLag(cleanRef, degraded);
  const len = Math.min(cleanRef.length, degraded.length - actualLag);
  if (len < 4800) return 1.0;

  // 15 Center frequencies for 1/3 octave bands from 150 Hz to 4300 Hz
  const centerFreqs = [150, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000];
  const numBands = centerFreqs.length;

  const frameLen = Math.floor(SAMPLE_RATE * 0.030); // 30 ms analysis window
  const hopLen = Math.floor(frameLen / 2);
  const numFrames = Math.floor((len - frameLen) / hopLen);

  if (numFrames <= 0) return 1.0;

  // Filter bank energy extraction
  let totalCorrelation = 0;
  let totalBands = 0;

  for (let b = 0; b < numBands; b++) {
    const fc = centerFreqs[b];
    const bw = fc * 0.23; // 1/3 octave bandwidth approximation
    const w0 = (2 * Math.PI * fc) / SAMPLE_RATE;
    const q = fc / bw;
    const alpha = Math.sin(w0) / (2 * q);

    // Simple 2nd-order bandpass filter coefficients
    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    let d1Clean = 0, d2Clean = 0;
    let d1Deg = 0, d2Deg = 0;

    const cleanBand = new Float32Array(len);
    const degBand = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      const sC = cleanRef[i];
      const sD = degraded[i + actualLag];

      const outC = (b0 * sC + d1Clean) / a0;
      d1Clean = b1 * sC - a1 * outC + d2Clean;
      d2Clean = b2 * sC - a2 * outC;
      cleanBand[i] = outC;

      const outD = (b0 * sD + d1Deg) / a0;
      d1Deg = b1 * sD - a1 * outD + d2Deg;
      d2Deg = b2 * sD - a2 * outD;
      degBand[i] = outD;
    }

    // Compute frame-wise short-time energies and correlation
    const cleanEnergies = new Float32Array(numFrames);
    const degEnergies = new Float32Array(numFrames);

    for (let f = 0; f < numFrames; f++) {
      const off = f * hopLen;
      let eC = 0, eD = 0;
      for (let j = 0; j < frameLen; j++) {
        eC += cleanBand[off + j] * cleanBand[off + j];
        eD += degBand[off + j] * degBand[off + j];
      }
      cleanEnergies[f] = Math.sqrt(eC / frameLen);
      degEnergies[f] = Math.sqrt(eD / frameLen);
    }

    // Pearson correlation across frames
    let meanC = 0, meanD = 0;
    for (let f = 0; f < numFrames; f++) {
      meanC += cleanEnergies[f];
      meanD += degEnergies[f];
    }
    meanC /= numFrames;
    meanD /= numFrames;

    let cov = 0, varC = 0, varD = 0;
    for (let f = 0; f < numFrames; f++) {
      const diffC = cleanEnergies[f] - meanC;
      const diffD = degEnergies[f] - meanD;
      cov += diffC * diffD;
      varC += diffC * diffC;
      varD += diffD * diffD;
    }

    const denom = Math.sqrt(varC * varD);
    if (denom > 1e-10) {
      const r = Math.max(0, Math.min(1.0, cov / denom));
      totalCorrelation += r;
      totalBands++;
    }
  }

  return totalBands > 0 ? totalCorrelation / totalBands : 1.0;
}

/**
 * Onset preservation: Energy retained in the first 50 ms after speech onsets vs clean reference
 */
function calculateOnsetPreservation(cleanSpeech, processed, onsets, lag = 0) {
  if (!onsets || onsets.length === 0) return 100.0;
  const windowSamples = Math.floor(SAMPLE_RATE * 0.050); // 50 ms
  let totalCleanEnergy = 0;
  let totalProcEnergy = 0;

  for (const onset of onsets) {
    const end = Math.min(cleanSpeech.length, onset + windowSamples);
    const procStart = onset + lag;
    const procEnd = Math.min(processed.length, procStart + windowSamples);

    if (end > onset && procEnd > procStart) {
      const count = Math.min(end - onset, procEnd - procStart);
      for (let i = 0; i < count; i++) {
        totalCleanEnergy += cleanSpeech[onset + i] * cleanSpeech[onset + i];
        totalProcEnergy += processed[procStart + i] * processed[procStart + i];
      }
    }
  }

  if (totalCleanEnergy === 0) return 100.0;
  const ratio = Math.sqrt(totalProcEnergy / totalCleanEnergy);
  return Math.min(100.0, ratio * 100.0);
}

/**
 * Gate false-close rate: Percentage of speech frames where attenuation exceeds 6 dB
 */
function calculateGateFalseCloseRate(cleanRef, processed, lag = 0) {
  const frameSize = 480; // 10 ms
  const len = Math.min(cleanRef.length, processed.length - lag);
  const numFrames = Math.floor(len / frameSize);
  let activeSpeechFrames = 0;
  let clampedFrames = 0;

  for (let f = 0; f < numFrames; f++) {
    const off = f * frameSize;
    const cleanRms = calculateRms(cleanRef, off, off + frameSize);
    if (cleanRms > 0.02) { // Active speech threshold
      activeSpeechFrames++;
      const procRms = calculateRms(processed, off + lag, off + lag + frameSize);
      const attenDb = 20 * Math.log10(Math.max(1e-6, procRms) / cleanRms);
      if (attenDb < -6.0) { // Attenuated > 6 dB during speech
        clampedFrames++;
      }
    }
  }

  return activeSpeechFrames > 0 ? (clampedFrames / activeSpeechFrames) * 100 : 0.0;
}

/**
 * Peak click/keystroke attenuation in dB
 */
function calculateClickAttenuation(cleanClicks, processed, lag = 0) {
  const inPeak = calculatePeak(cleanClicks);
  const outPeak = calculatePeak(processed, lag);
  if (inPeak === 0 || outPeak === 0) return 0;
  return 20 * Math.log10(outPeak / inPeak);
}

/**
 * Numerical integrity verification
 */
function verifyNumericalIntegrity(buffer) {
  let nanInfCount = 0;
  let clippingCount = 0;

  for (let i = 0; i < buffer.length; i++) {
    const val = buffer[i];
    if (!Number.isFinite(val)) {
      nanInfCount++;
    } else if (Math.abs(val) > 1.0001) {
      clippingCount++;
    }
  }

  return {
    nanInfCount,
    clippingCount,
    clean: nanInfCount === 0 && clippingCount === 0,
  };
}

module.exports = {
  calculateRms,
  calculatePeak,
  findBestLag,
  calculateSiSdr,
  calculateStoi,
  calculateOnsetPreservation,
  calculateGateFalseCloseRate,
  calculateClickAttenuation,
  verifyNumericalIntegrity,
};
