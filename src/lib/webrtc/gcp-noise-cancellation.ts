/**
 * WebRTC Audio Pipeline
 * Provides clean, native microphone pass-through with browser-standard
 * echo cancellation, noise suppression, and auto gain control.
 */

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

/**
 * Creates a zero-overhead native audio pipeline.
 * Bypasses custom WebAudio worklets and delegates directly to native browser WebRTC constraints
 * (AEC, native NS, AGC) for maximum vocal clarity and zero distortion.
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

  // Apply standard browser WebRTC constraints directly to the microphone track
  try {
    if (typeof audioTrack.applyConstraints === 'function') {
      audioTrack
        .applyConstraints({
          echoCancellation: true,
          noiseSuppression: currentMode !== 'off',
          autoGainControl: true,
        })
        .catch(() => {});
    }
  } catch {}

  const setMode = (mode: NoiseCancellationMode) => {
    currentMode = mode;
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
  };

  const setNoiseSuppression = (enabled: boolean) => {
    setMode(enabled ? 'balanced' : 'off');
  };

  return {
    outputStream: rawStream,
    audioContext: null,
    setNoiseSuppression,
    setMode,
    getMode: () => currentMode,
    isReady: () => true,
    cleanup: () => {},
  };
}
