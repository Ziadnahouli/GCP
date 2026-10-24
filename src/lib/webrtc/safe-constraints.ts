/**
 * WebRTC Constraint Hardening (N6)
 *
 * Provides safe constraint application without destructive global monkey-patching.
 * Preserves deviceId and groupId at all times and avoids global unhandledrejection silencing.
 */

import {
  applyProcessingPolicy,
  getUserMediaAudioConstraints,
  getAudioEngineDiagnostics,
  updateAudioEngineDiagnostics,
  subscribeAudioEngineDiagnostics,
} from './audio-processing-policy';

export {
  applyProcessingPolicy,
  getUserMediaAudioConstraints,
  getAudioEngineDiagnostics,
  updateAudioEngineDiagnostics,
  subscribeAudioEngineDiagnostics,
};

/**
 * Opt-in helper for legacy test suites requiring MediaStreamTrack.prototype.applyConstraints relaxation.
 * Note: Never deletes deviceId or groupId, and does not install global rejection swallowers.
 */
export function installSafeConstraintsPolyfill(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof MediaStreamTrack !== 'undefined') {
    const trackProto = MediaStreamTrack.prototype as any;
    if (trackProto && !trackProto.__safeConstraintsInstalled) {
      const origApplyConstraints = trackProto.applyConstraints;
      if (typeof origApplyConstraints === 'function') {
        trackProto.applyConstraints = async function (constraints?: MediaTrackConstraints) {
          try {
            return await origApplyConstraints.call(this, constraints);
          } catch (err: any) {
            const isConstraintErr =
              err?.name === 'OverconstrainedError' ||
              String(err?.message || err).toLowerCase().includes('constraint');

            if (isConstraintErr && constraints && typeof constraints === 'object') {
              console.warn('[WebRTC] applyConstraints overconstrained, retrying with relaxed audio processing flags:', err);
              const relaxed: any = { ...constraints };
              delete relaxed.sampleRate;
              delete relaxed.channelCount;
              delete relaxed.voiceIsolation;
              delete relaxed.latency;
              // CRITICAL: NEVER delete deviceId or groupId! (N6)
              return await origApplyConstraints.call(this, relaxed);
            }
            throw err;
          }
        };
        trackProto.__safeConstraintsInstalled = true;
      }
    }
  }
}

/**
 * Applies optimal standard constraints for WebRTC audio tracks through the unified policy owner (N2).
 */
export async function applyGcpOptimalConstraints(
  track: MediaStreamTrack | undefined,
  noiseSuppressionActive = true
): Promise<void> {
  if (!track || track.kind !== 'audio') return;
  await applyProcessingPolicy(track, noiseSuppressionActive ? 'browser' : 'off');
}

/**
 * Disables browser native noiseSuppression on an input track for raw microphone pass-through (N2).
 */
export async function killNativeAudioProcessing(
  track: MediaStreamTrack | undefined
): Promise<void> {
  return applyGcpOptimalConstraints(track, false);
}
