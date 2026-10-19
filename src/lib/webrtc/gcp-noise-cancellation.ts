/**
 * GCP Production Real-Time AI Speech Enhancement Pipeline (RNNoise WASM)
 *
 * Implements low-latency, real-time neural speech enhancement running
 * inside an AudioWorklet off the main thread.
 *
 * Architecture:
 *   Microphone capture
 *   → 48kHz AudioContext (with automatic fallback/resampling)
 *   → 75Hz Butterworth High-Pass Biquad (pre-filters sub-bass rumble/plosives)
 *   → Deterministic 480-sample frame ring buffer with 512-sample priming (0 underruns)
 *   → Single-pass Recurrent Neural Network (RNNoise GRU) noise suppression
 *   → 0.0% raw noise blend (zero fan/keyboard click bleed into speech)
 *   → Dynamic comfortable acoustic floor & hangover expander
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

export type GcpPipelineStatus =
  | 'initializing'
  | 'ready'
  | 'fallback'
  | 'failed'
  | 'disabled';

export type GcpActiveEngine =
  | 'rnnoise-wasm'
  | 'browser-native'
  | 'none';

export interface GcpNoisePipeline {
  outputStream: MediaStream;
  audioContext: AudioContext | null;
  setNoiseSuppression: (enabled: boolean) => void;
  setMode: (mode: NoiseCancellationMode) => void;
  getMode: () => NoiseCancellationMode;
  isReady: () => boolean;
  getStatus: () => GcpPipelineStatus;
  getActiveEngine: () => GcpActiveEngine;
  getFallbackReason: () => string | null;
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
  const createFallbackPipeline = (
    mode: NoiseCancellationMode,
    reason: string,
    ctx: AudioContext | null = null
  ): GcpNoisePipeline => {
    let fallbackStatus: GcpPipelineStatus = mode === 'off' ? 'disabled' : 'fallback';
    let fallbackEngine: GcpActiveEngine = mode === 'off' ? 'none' : 'browser-native';

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

    const setMode = (m: NoiseCancellationMode) => {
      currentMode = m;
      fallbackStatus = m === 'off' ? 'disabled' : 'fallback';
      fallbackEngine = m === 'off' ? 'none' : 'browser-native';
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
    };

    return {
      outputStream: rawStream,
      audioContext: ctx,
      setNoiseSuppression: (enabled: boolean) => {
        setMode(enabled ? 'balanced' : 'off');
      },
      setMode,
      getMode: () => currentMode,
      isReady: () => true,
      getStatus: () => fallbackStatus,
      getActiveEngine: () => fallbackEngine,
      getFallbackReason: () => reason,
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
    return createFallbackPipeline(currentMode, 'AudioContext not supported in this browser');
  }

  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let destinationNode: MediaStreamAudioDestinationNode | null = null;

  let isReadyState = false;
  let pipelineStatus: GcpPipelineStatus = 'initializing';
  let activeEngine: GcpActiveEngine = 'none';
  let fallbackReason: string | null = null;

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
      return createFallbackPipeline(currentMode, 'AudioWorklet module failed to load', audioContext);
    }

    sourceNode = audioContext.createMediaStreamSource(rawStream);
    destinationNode = audioContext.createMediaStreamDestination();

    workletNode = new AudioWorkletNode(audioContext, 'gcp-rnnoise-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    // Load and transfer the RNNoise WASM binary
    const wasmBinary = await loadRnnoiseWasmBinary();

    // Bounded initialization promise (3000ms max timeout)
    const initPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('AudioWorklet WASM initialization timed out after 3000ms'));
      }, 3000);

      if (!workletNode) {
        clearTimeout(timer);
        reject(new Error('WorkletNode is null'));
        return;
      }

      workletNode.port.onmessage = (event) => {
        const data = event.data;
        if (!data) return;
        if (data.type === 'READY') {
          clearTimeout(timer);
          isReadyState = true;
          pipelineStatus = currentMode === 'off' ? 'disabled' : 'ready';
          activeEngine = currentMode === 'off' ? 'none' : 'rnnoise-wasm';
          resolve();
        } else if (data.type === 'ERROR') {
          clearTimeout(timer);
          reject(new Error(data.error || 'Worklet reported initialization error'));
        }
      };
    });

    workletNode.port.postMessage(
      {
        type: 'INIT_WASM',
        wasmBinary,
        mode: currentMode,
      },
      [wasmBinary]
    );

    // Wire DSP audio graph: source -> worklet -> destination
    sourceNode.connect(workletNode);
    workletNode.connect(destinationNode);

    // Disable browser's native noise gate so RNNoise receives full raw spectrum
    try {
      if (typeof audioTrack.applyConstraints === 'function') {
        audioTrack
          .applyConstraints({
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          })
          .catch(() => {});
      }
    } catch {}

    // Await bounded readiness
    try {
      await initPromise;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[GcpAudio] RNNoise worklet initialization failed, falling back:', errMsg);
      try { sourceNode.disconnect(); } catch {}
      try { workletNode.disconnect(); } catch {}
      return createFallbackPipeline(currentMode, errMsg, audioContext);
    }

    const outputStream = destinationNode.stream;

    const setMode = (mode: NoiseCancellationMode) => {
      currentMode = mode;
      if (mode === 'off') {
        pipelineStatus = 'disabled';
        activeEngine = 'none';
      } else {
        pipelineStatus = 'ready';
        activeEngine = 'rnnoise-wasm';
      }

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
      pipelineStatus = 'disabled';
      activeEngine = 'none';

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
      // CRITICAL: Do NOT call audioTrack.stop()!
      // The original mic stream belongs to the caller and must not be terminated.
    };

    return {
      outputStream,
      audioContext,
      setNoiseSuppression,
      setMode,
      getMode: () => currentMode,
      isReady: () => isReadyState,
      getStatus: () => pipelineStatus,
      getActiveEngine: () => activeEngine,
      getFallbackReason: () => fallbackReason,
      cleanup,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[GcpAudio] Unexpected failure in createGcpNoisePipeline:', errMsg);
    return createFallbackPipeline(currentMode, errMsg, audioContext);
  }
}
