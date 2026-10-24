/**
 * Centralized WebRTC Audio Processing Policy & Diagnostics Store
 *
 * Implements strict single-ownership of microphone audio constraints (N2),
 * honest pipeline diagnostics reporting (N3), and safe non-destructive constraint application (N6).
 */

import type { NoiseCancellationMode, GcpPipelineStatus, GcpActiveEngine } from './gcp-noise-cancellation';

export type AudioProcessingPolicy = 'rnnoise' | 'browser' | 'off';

export interface AudioEngineDiagnostics {
  status: GcpPipelineStatus;
  engine: GcpActiveEngine;
  fallbackReason: string | null;
  mode: NoiseCancellationMode;
  latencyMs: number;
  sampleRate: number;
  channelCount: number;
  deviceId?: string;
  appliedSettings?: MediaTrackSettings;
  underruns?: number;
  cpuMs?: number;
}

// Single reactive store for diagnostics across settings, in-call badges, and audio pipeline
let currentDiagnostics: AudioEngineDiagnostics = {
  status: 'initializing',
  engine: 'none',
  fallbackReason: null,
  mode: 'balanced',
  latencyMs: 0,
  sampleRate: 48000,
  channelCount: 1,
};

const listeners = new Set<(diag: AudioEngineDiagnostics) => void>();

export function getAudioEngineDiagnostics(): AudioEngineDiagnostics {
  return { ...currentDiagnostics };
}

export function updateAudioEngineDiagnostics(partial: Partial<AudioEngineDiagnostics>): void {
  const previousMode = currentDiagnostics.mode;
  const isModeChanging = partial.mode !== undefined && partial.mode !== previousMode;

  currentDiagnostics = { ...currentDiagnostics, ...partial };
  listeners.forEach((fn) => {
    try {
      fn(currentDiagnostics);
    } catch (err) {
      console.warn('[AudioProcessingPolicy] Listener threw error:', err);
    }
  });

  // Only dispatch window event if the mode ACTUALLY changed to prevent runaway event loops & toast storms
  if (typeof window !== 'undefined' && isModeChanging) {
    try {
      window.dispatchEvent(
        new CustomEvent('gcp_noise_mode_changed', { detail: { ...currentDiagnostics } })
      );
    } catch {}
  }
}

export function subscribeAudioEngineDiagnostics(
  listener: (diag: AudioEngineDiagnostics) => void
): () => void {
  listeners.add(listener);
  try {
    listener(currentDiagnostics);
  } catch {}

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Explicit Audio Processing Policy Table (N2)
 *
 * - 'rnnoise': echoCancellation: true, noiseSuppression: false, autoGainControl: false.
 *   Disabling native NS avoids dual-filter distortion; disabling native AGC avoids noise floor pumping.
 * - 'browser': echoCancellation: true, noiseSuppression: true, autoGainControl: true.
 *   Used only during browser fallback when AudioWorklet/WASM cannot run.
 * - 'off': echoCancellation: true, noiseSuppression: false, autoGainControl: false.
 *   Raw microphone pass-through with acoustic echo cancellation preserved.
 */
export function getPolicyConstraints(policy: AudioProcessingPolicy): MediaTrackConstraintSet {
  switch (policy) {
    case 'rnnoise':
      return {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      };
    case 'browser':
      return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
    case 'off':
    default:
      return {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      };
  }
}

/**
 * Returns ideal getUserMedia audio constraints for the specified policy.
 * Requests mono (channelCount: 1) and 48 kHz (ideal) with exact deviceId if provided.
 */
export function getUserMediaAudioConstraints(
  policy: AudioProcessingPolicy = 'rnnoise',
  deviceId?: string | null
): MediaTrackConstraints {
  const policyConstraints = getPolicyConstraints(policy);
  return {
    ...policyConstraints,
    channelCount: 1,
    sampleRate: { ideal: 48000 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

/**
 * Single owner for applying audio processing constraints on MediaStreamTrack (N2, N6).
 * Never deletes or drops deviceId.
 * Reads back track.getSettings() and records actual hardware configuration.
 */
export async function applyProcessingPolicy(
  track: MediaStreamTrack | undefined | null,
  policy: AudioProcessingPolicy
): Promise<{ success: boolean; appliedSettings?: MediaTrackSettings; error?: string }> {
  if (!track || track.kind !== 'audio') {
    return { success: false, error: 'No audio track provided' };
  }

  const constraints = getPolicyConstraints(policy);

  try {
    if (typeof track.applyConstraints === 'function') {
      await track.applyConstraints(constraints);
    }
    const appliedSettings = typeof track.getSettings === 'function' ? track.getSettings() : {};
    updateAudioEngineDiagnostics({
      appliedSettings,
      sampleRate: appliedSettings.sampleRate || 48000,
      channelCount: appliedSettings.channelCount || 1,
      deviceId: appliedSettings.deviceId,
    });
    return { success: true, appliedSettings };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[AudioProcessingPolicy] Failed to apply exact policy constraints:', errorMsg);

    // Non-destructive fallback retry: try applying essential echoCancellation/noiseSuppression without device change
    try {
      if (typeof track.applyConstraints === 'function') {
        await track.applyConstraints({
          echoCancellation: constraints.echoCancellation,
          noiseSuppression: constraints.noiseSuppression,
        });
      }
      const appliedSettings = typeof track.getSettings === 'function' ? track.getSettings() : {};
      updateAudioEngineDiagnostics({ appliedSettings });
      return { success: true, appliedSettings, error: errorMsg };
    } catch (fallbackErr: unknown) {
      const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      return { success: false, error: fbMsg };
    }
  }
}
