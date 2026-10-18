/**
 * Global WebRTC Constraint Hardening
 * Prevents "OverconstrainedError: Cannot satisfy constraints" from unhandled promise rejections
 * when browsers (e.g., Windows WASAPI / macOS CoreAudio) cannot dynamically satisfy sampleRate
 * or audio processing constraints on existing MediaStreamTracks.
 */

export function installSafeConstraintsPolyfill(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // 1. Polyfill MediaStreamTrack.prototype.applyConstraints
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

            if (isConstraintErr) {
              console.warn('[WebRTC] applyConstraints overconstrained, retrying with relaxed constraints:', err);
              if (constraints && typeof constraints === 'object') {
                try {
                  const relaxed: any = { ...constraints };
                  delete relaxed.sampleRate;
                  delete relaxed.channelCount;
                  delete relaxed.voiceIsolation;
                  delete relaxed.latency;
                  delete relaxed.deviceId;
                  delete relaxed.groupId;
                  return await origApplyConstraints.call(this, relaxed);
                } catch (relaxedErr) {
                  console.warn('[WebRTC] Relaxed constraints also rejected, preserving existing track state without throwing:', relaxedErr);
                  return;
                }
              }
              // For tracks without dynamic constraints (e.g., AudioContext destination tracks), resolve cleanly
              return;
            }
            throw err;
          }
        };
        trackProto.__safeConstraintsInstalled = true;
      }
    }
  }

  // 2. Global unhandledrejection guard to capture any escaped AudioWorklet constraint rejections
  const win = window as any;
  if (!win.__safeConstraintsRejectionHandlerInstalled) {
    win.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = String(reason?.message || reason || '');
      if (
        reason?.name === 'OverconstrainedError' ||
        msg.toLowerCase().includes('cannot satisfy constraints') ||
        msg.toLowerCase().includes('overconstrained')
      ) {
        console.warn('[WebRTC SafeConstraints] Silenced unhandled constraint rejection:', reason);
        event.preventDefault();
      }
    });
    win.__safeConstraintsRejectionHandlerInstalled = true;
  }
}

// Auto-install on client import
if (typeof window !== 'undefined') {
  installSafeConstraintsPolyfill();
}

/**
 * Applies optimal constraints for GCP Neural Speech Enhancement.
 * When GCP DSP is active, browser-native noiseSuppression and autoGainControl
 * are explicitly disabled (false) to prevent phase conflicts and AGC pumping,
 * while keeping echoCancellation: true for acoustic speaker isolation.
 */
export async function applyGcpOptimalConstraints(
  track: MediaStreamTrack | undefined,
  gcpDspActive: boolean
): Promise<void> {
  if (!track || track.kind !== 'audio') return;
  try {
    await track.applyConstraints({
      echoCancellation: true,
      noiseSuppression: !gcpDspActive,
      autoGainControl: !gcpDspActive,
    });
  } catch (err) {
    console.warn('[WebRTC SafeConstraints] applyGcpOptimalConstraints relaxed:', err);
  }
}

/**
 * Force-disables browser native noiseSuppression and autoGainControl on an input track,
 * preventing microphone AGC pumping and phase artifacts from corrupting VAD thresholds.
 */
export async function killNativeAudioProcessing(
  track: MediaStreamTrack | undefined
): Promise<void> {
  return applyGcpOptimalConstraints(track, true);
}

