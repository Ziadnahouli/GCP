/**
 * Studio-Grade Web Audio Voice DSP & Adaptive Noise Gate Pipeline
 * 
 * Provides Discord/Krisp-quality voice enhancement:
 * - 85 Hz Butterworth High-Pass: eliminates desk thuds, AC hum, and sub-bass vibration.
 * - 2.8 kHz Peaking Formant Filter (+2.5 dB): enhances voice clarity and vocal presence.
 * - 7.5 kHz High-Shelf (-4.5 dB): removes background hiss, coil whine, and PC fan whoosh.
 * - Dynamics Compressor: levels vocal peaks and prevents clipping.
 * - Adaptive Soft Noise Gate: suppresses room ambience, keystrokes, and breathing when silent.
 */

export interface StudioAudioPipeline {
  outputStream: MediaStream;
  audioContext: AudioContext;
  setNoiseSuppression: (enabled: boolean) => void;
  cleanup: () => void;
}

export function createStudioAudioPipeline(
  rawStream: MediaStream,
  initialSuppression: boolean = true
): StudioAudioPipeline | null {
  if (typeof window === 'undefined') return null;

  const audioTrack = rawStream.getAudioTracks()[0];
  if (!audioTrack) return null;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx) return null;

  try {
    const ctx = new AudioCtx({ latencyHint: 'interactive' });
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));

    // 1. High-Pass Filter (85 Hz) - sub-bass & desk rumble elimination
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(85, ctx.currentTime);
    highpass.Q.setValueAtTime(0.707, ctx.currentTime);

    // 2. Vocal Formant Peaking Filter (2.8 kHz, +2.5 dB) - sharpens speech definition
    const notch = ctx.createBiquadFilter();
    notch.type = 'peaking';
    notch.frequency.setValueAtTime(2800, ctx.currentTime);
    notch.gain.setValueAtTime(initialSuppression ? 2.5 : 0, ctx.currentTime);
    notch.Q.setValueAtTime(1.1, ctx.currentTime);

    // 3. High-Shelf Filter (7.5 kHz, -4.5 dB) - fan noise and hiss suppressor
    const highshelf = ctx.createBiquadFilter();
    highshelf.type = 'highshelf';
    highshelf.frequency.setValueAtTime(7500, ctx.currentTime);
    highshelf.gain.setValueAtTime(initialSuppression ? -4.5 : 0, ctx.currentTime);

    // 4. Downward Expander / Noise Gate Gain Node
    const gateGain = ctx.createGain();
    gateGain.gain.setValueAtTime(1.0, ctx.currentTime);

    // 5. Studio Vocal Dynamics Compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, ctx.currentTime);
    compressor.knee.setValueAtTime(10, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.12, ctx.currentTime);

    // 6. Analyser Node for spectral voice activity detection
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.2;

    // 7. Destination
    const destination = ctx.createMediaStreamDestination();

    // Signal chain wiring
    source.connect(highpass);
    highpass.connect(notch);
    notch.connect(highshelf);
    highshelf.connect(gateGain);
    gateGain.connect(compressor);
    compressor.connect(destination);
    highshelf.connect(analyser);

    // Adaptive Soft Noise Gate Processor
    let isSuppressionActive = initialSuppression;
    let animFrame: number | null = null;
    let isGateOpen = false;
    let lastSpeechTime = performance.now();
    const pcmBuffer = new Float32Array(analyser.fftSize);

    const updateGate = () => {
      if (!isSuppressionActive) {
        gateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.02);
        animFrame = requestAnimationFrame(updateGate);
        return;
      }

      analyser.getFloatTimeDomainData(pcmBuffer);
      let sumSquares = 0;
      for (let i = 0; i < pcmBuffer.length; i++) {
        sumSquares += pcmBuffer[i] * pcmBuffer[i];
      }
      const rms = Math.sqrt(sumSquares / pcmBuffer.length);
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = performance.now();

      // Hysteresis thresholds calibrated for quiet microphones and headsets
      const speechOpenThreshold = 0.003;
      const speechHoldThreshold = 0.0015;
      const hangoverMs = 350; // Smooth 350ms tail so word endings never cut off

      if (rms >= speechOpenThreshold) {
        isGateOpen = true;
        lastSpeechTime = now;
      } else if (rms >= speechHoldThreshold && isGateOpen) {
        lastSpeechTime = now;
      } else if (now - lastSpeechTime > hangoverMs) {
        isGateOpen = false;
      }

      // Smooth gain transition: 4ms attack, 30ms release down to -14dB (0.20)
      // Soft downward expansion ensures voice is never muted completely
      const targetGain = isGateOpen ? 1.0 : 0.20;
      const timeConstant = isGateOpen ? 0.004 : 0.035;
      gateGain.gain.setTargetAtTime(targetGain, ctx.currentTime, timeConstant);

      animFrame = requestAnimationFrame(updateGate);
    };

    animFrame = requestAnimationFrame(updateGate);

    const setNoiseSuppression = (enabled: boolean) => {
      isSuppressionActive = enabled;
      const t = ctx.currentTime;
      notch.gain.setTargetAtTime(enabled ? 2.5 : 0, t, 0.05);
      highshelf.gain.setTargetAtTime(enabled ? -4.5 : 0, t, 0.05);
      if (!enabled) {
        gateGain.gain.setTargetAtTime(1.0, t, 0.02);
      }
    };

    const cleanup = () => {
      if (animFrame !== null) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
      try {
        source.disconnect();
        highpass.disconnect();
        notch.disconnect();
        highshelf.disconnect();
        gateGain.disconnect();
        compressor.disconnect();
        analyser.disconnect();
      } catch {}
      try {
        if (ctx.state !== 'closed') {
          ctx.close();
        }
      } catch {}
    };

    return {
      outputStream: destination.stream,
      audioContext: ctx,
      setNoiseSuppression,
      cleanup,
    };
  } catch (err) {
    console.warn('[AudioDSP] Failed to create studio audio pipeline:', err);
    return null;
  }
}
