/**
 * GCP Studio AudioWorklet Noise Cancellation & Adaptive Gate Processor
 * Runs on the dedicated high-priority OS audio thread (immune to UI throttling, alt-tabbing & gaming)
 */
class GcpNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isOpen = false;
    this.currentGain = 1.0;
    this.targetGain = 1.0;
    this.lastSpeechTime = 0;

    // Calibrated acoustic thresholds:
    // -46 dB speech trigger: catches soft speech and whisper without clipping
    // -52 dB close threshold: hysteresis prevents fluttering
    this.openThreshold = 0.005;
    this.closeThreshold = 0.0025;
    this.holdMs = 280; // 280ms speech tail hold time
    this.attackRate = 0.8; // ~2ms instantaneous attack
    this.releaseRate = 0.035; // ~40ms smooth exponential downward expansion
    this.minGain = 0.0025; // -52 dB acoustic floor (fans, breathing, keystrokes silenced)
    this.enabled = true;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'SET_ENABLED') {
        this.enabled = Boolean(data.enabled);
        if (!this.enabled) {
          this.currentGain = 1.0;
          this.targetGain = 1.0;
        }
      } else if (data.type === 'SET_THRESHOLD') {
        if (typeof data.openThreshold === 'number') {
          this.openThreshold = data.openThreshold;
          this.closeThreshold = data.closeThreshold ?? data.openThreshold * 0.5;
        }
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inputChannel = input[0];
    const outputChannel = output[0];
    const len = inputChannel.length;

    if (!this.enabled) {
      for (let i = 0; i < len; i++) {
        outputChannel[i] = inputChannel[i];
      }
      return true;
    }

    // 1. Compute frame energy (RMS)
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const s = inputChannel[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / len);

    // 2. Audio-thread accurate timestamp in ms
    const nowMs = currentTime * 1000;

    // 3. Dual-threshold Hysteresis VAD
    if (rms >= this.openThreshold) {
      this.isOpen = true;
      this.lastSpeechTime = nowMs;
    } else if (rms >= this.closeThreshold && this.isOpen) {
      this.lastSpeechTime = nowMs;
    } else if (nowMs - this.lastSpeechTime > this.holdMs) {
      this.isOpen = false;
    }

    this.targetGain = this.isOpen ? 1.0 : this.minGain;

    // 4. Smooth sample-by-sample gain interpolation (prevents audio clicks/pops)
    const rate = this.isOpen ? this.attackRate : this.releaseRate;
    for (let i = 0; i < len; i++) {
      this.currentGain += (this.targetGain - this.currentGain) * rate;
      outputChannel[i] = inputChannel[i] * this.currentGain;
    }

    return true;
  }
}

registerProcessor('gcp-noise-processor', GcpNoiseProcessor);
