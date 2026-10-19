/**
 * GCP Production Real-Time AI Speech Enhancement Pipeline (RNNoise WASM)
 *
 * Implements low-latency, real-time neural speech enhancement running
 * inside an AudioWorklet off the main thread.
 *
 * Architecture:
 *   Microphone capture
 *   → 48kHz AudioContext
 *   → 80Hz Butterworth High-Pass Biquad (pre-filters sub-bass rumble/plosives)
 *   → Continuous 480-sample frame buffering (10ms) via ring buffers
 *   → Recurrent Neural Network (RNNoise GRU) noise suppression
 *   → Dynamic comfortable acoustic floor & natural vocal preservation blend
 *   → -1.0 dBFS true-peak soft limiter
 *   → Processed MediaStreamTrack for WebRTC transmission
 */

import { loadRnnoiseWasmBinary } from './rnnoise-wasm-binary';

export type NoiseCancellationMode =
  | 'off'
  | 'light'
  | 'balanced'
  | 'strong'
  | 'krisp-max'
  | 'rnnoise-hybrid';

export interface GcpNoisePipeline {
  outputStream: MediaStream;
  audioContext: AudioContext | null;
  setNoiseSuppression: (enabled: boolean) => void;
  setMode: (mode: NoiseCancellationMode) => void;
  getMode: () => NoiseCancellationMode;
  isReady: () => boolean;
  cleanup: () => void;
}

let workletBlobUrl: string | null = null;

async function ensureWorkletModule(audioContext: AudioContext): Promise<boolean> {
  if (typeof audioContext.audioWorklet?.addModule !== 'function') {
    return false;
  }

  // 1. Try public path
  try {
    await audioContext.audioWorklet.addModule('/worklets/gcp-rnnoise-processor.js');
    return true;
  } catch (err) {
    // 2. Try alternate path
    try {
      await audioContext.audioWorklet.addModule('/worklets/gcp-noise-processor.js');
      return true;
    } catch {}
  }

  // 3. If running from blob or file protocol, fetch or fallback
  try {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      const resp = await fetch('/worklets/gcp-rnnoise-processor.js');
      if (resp.ok) {
        const text = await resp.text();
        const blob = new Blob([text], { type: 'application/javascript' });
        workletBlobUrl = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(workletBlobUrl);
        return true;
      }
    }
  } catch {}

  return false;
}

/**
 * Creates a production real-time AI noise cancellation pipeline using RNNoise WASM.
 * Feeds the processed MediaStreamTrack to WebRTC peer connections.
 */
export async function createGcpNoisePipeline(
  rawStream: MediaStream,
  initialModeOrSuppression: boolean | NoiseCancellationMode = 'balanced'
): Promise<GcpNoisePipeline | null> {
  if (typeof window === 'undefined') return null;

  const audioTrack = rawStream.getAudioTracks()[0];
  if (!audioTrack) return null;

  let currentMode: NoiseCancellationMode = 'balanced';
  if (typeof initialModeOrSuppression === 'boolean') {
    currentMode = initialModeOrSuppression ? 'balanced' : 'off';
  } else if (typeof initialModeOrSuppression === 'string') {
    currentMode = initialModeOrSuppression;
  }

  // Fallback helper in case AudioWorklet or WASM cannot be initialized
  const createFallbackPipeline = (mode: NoiseCancellationMode, ctx: AudioContext | null = null): GcpNoisePipeline => {
    try {
      if (typeof audioTrack.applyConstraints === 'function') {
        audioTrack
          .applyConstraints({
            echoCancellation: true,
            noiseSuppression: mode !== 'off',
            autoGainControl: true,
          })
          .catch(() => {});
      }
    } catch {}

    return {
      outputStream: rawStream,
      audioContext: ctx,
      setNoiseSuppression: (enabled: boolean) => {
        currentMode = enabled ? 'balanced' : 'off';
        try {
          if (typeof audioTrack.applyConstraints === 'function') {
            audioTrack
              .applyConstraints({
                echoCancellation: true,
                noiseSuppression: enabled,
                autoGainControl: true,
              })
              .catch(() => {});
          }
        } catch {}
      },
      setMode: (m: NoiseCancellationMode) => {
        currentMode = m;
        try {
          if (typeof audioTrack.applyConstraints === 'function') {
            audioTrack
              .applyConstraints({
                echoCancellation: true,
                noiseSuppression: m !== 'off',
                autoGainControl: true,
              })
              .catch(() => {});
          }
        } catch {}
      },
      getMode: () => currentMode,
      isReady: () => true,
      cleanup: () => {
        if (ctx) {
          try {
            ctx.close();
          } catch {}
        }
      },
    };
  };

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    return createFallbackPipeline(currentMode);
  }

  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let destinationNode: MediaStreamAudioDestinationNode | null = null;
  let isReadyState = false;

  try {
    // Strictly enforce 48 kHz for RNNoise neural speech enhancement
    audioContext = new AudioContextClass({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const moduleLoaded = await ensureWorkletModule(audioContext);
    if (!moduleLoaded) {
      console.warn('[GcpAudio] AudioWorklet module unavailable; falling back to native browser constraints.');
      return createFallbackPipeline(currentMode, audioContext);
    }

    sourceNode = audioContext.createMediaStreamSource(rawStream);
    destinationNode = audioContext.createMediaStreamDestination();

    workletNode = new AudioWorkletNode(audioContext, 'gcp-rnnoise-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    // Listen for readiness or errors from the AudioWorklet
    workletNode.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'READY') {
        isReadyState = true;
      }
    };

    // Load and transfer the RNNoise WASM binary
    const wasmBinary = await loadRnnoiseWasmBinary();
    workletNode.port.postMessage(
      {
        type: 'INIT_WASM',
        wasmBinary,
        mode: currentMode,
      },
      [wasmBinary]
    );

    // Wire the DSP audio graph: source -> worklet -> destination
    sourceNode.connect(workletNode);
    workletNode.connect(destinationNode);

    // Apply baseline browser constraints to raw microphone
    try {
      if (typeof audioTrack.applyConstraints === 'function') {
        audioTrack
          .applyConstraints({
            echoCancellation: true,
            noiseSuppression: false, // Keep raw spectrum intact for RNNoise neural processing
            autoGainControl: true,
          })
          .catch(() => {});
      }
    } catch {}

    const outputStream = destinationNode.stream;

    const setMode = (mode: NoiseCancellationMode) => {
      currentMode = mode;
      if (workletNode) {
        try {
          workletNode.port.postMessage({ type: 'SET_MODE', mode });
        } catch {}
      }
      try {
        if (typeof audioTrack.applyConstraints === 'function') {
          audioTrack
            .applyConstraints({
              echoCancellation: true,
              noiseSuppression: mode === 'off',
              autoGainControl: true,
            })
            .catch(() => {});
        }
      } catch {}
    };

    const setNoiseSuppression = (enabled: boolean) => {
      setMode(enabled ? 'balanced' : 'off');
    };

    const cleanup = () => {
      isReadyState = false;
      if (workletNode) {
        try {
          workletNode.port.postMessage({ type: 'DESTROY' });
          workletNode.disconnect();
        } catch {}
        workletNode = null;
      }
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch {}
        sourceNode = null;
      }
      if (destinationNode) {
        try {
          destinationNode.disconnect();
        } catch {}
        destinationNode = null;
      }
      if (audioContext && audioContext.state !== 'closed') {
        try {
          audioContext.close();
        } catch {}
        audioContext = null;
      }
      if (workletBlobUrl) {
        try {
          URL.revokeObjectURL(workletBlobUrl);
        } catch {}
        workletBlobUrl = null;
      }
    };

    return {
      outputStream,
      audioContext,
      setNoiseSuppression,
      setMode,
      getMode: () => currentMode,
      isReady: () => isReadyState,
      cleanup,
    };
  } catch (err) {
    console.warn('[GcpAudio] Failed to initialize RNNoise AudioWorklet pipeline, using fallback:', err);
    return createFallbackPipeline(currentMode, audioContext);
  }
}
