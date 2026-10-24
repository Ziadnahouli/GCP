/**
 * GCP AudioEngine Singleton (N9)
 *
 * Manages a single shared 48 kHz AudioContext across calls, server voice, and settings.
 * Prevents browser AudioContext exhaustion (crucial for Safari/iOS), loads AudioWorklet modules once,
 * auto-resumes on user gesture, ref-counts active pipelines, and provides robust onprocessorerror recovery.
 */

import { updateAudioEngineDiagnostics } from './audio-processing-policy';

export type AudioEngineStatus = 'uninitialized' | 'suspended' | 'running' | 'closed';

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private audioContext: AudioContext | null = null;
  private workletLoadPromise: Promise<boolean> | null = null;
  private activePipelineCount = 0;
  private gestureListenersInstalled = false;
  private idleSuspendTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.setupUserGestureListeners();
    }
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  /**
   * Returns whether Web Audio API is supported in the current environment
   */
  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    );
  }

  /**
   * Obtains the shared 48 kHz AudioContext singleton.
   * Creates it on first demand and resumes if suspended.
   */
  public async getAudioContext(): Promise<AudioContext | null> {
    if (!this.isSupported()) return null;

    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.audioContext = new AudioCtxClass({
        sampleRate: 48000,
        latencyHint: 'interactive',
      });
      this.workletLoadPromise = null;
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // Will auto-resume on first user gesture
      }
    }

    if (this.idleSuspendTimer) {
      clearTimeout(this.idleSuspendTimer);
      this.idleSuspendTimer = null;
    }

    return this.audioContext;
  }

  /**
   * Loads the RNNoise worklet module once onto the shared context.
   */
  public async ensureWorkletModuleLoaded(ctx?: AudioContext): Promise<boolean> {
    const context = ctx || (await this.getAudioContext());
    if (!context || typeof context.audioWorklet?.addModule !== 'function') {
      return false;
    }

    if (this.workletLoadPromise) {
      return this.workletLoadPromise;
    }

    this.workletLoadPromise = (async () => {
      try {
        await context.audioWorklet.addModule('/worklets/gcp-rnnoise-processor.js');
        return true;
      } catch (err) {
        console.warn('[AudioEngine] Failed to load /worklets/gcp-rnnoise-processor.js:', err);
        this.workletLoadPromise = null;
        return false;
      }
    })();

    return this.workletLoadPromise;
  }

  /**
   * Increments active pipeline ref count.
   */
  public acquire(): void {
    this.activePipelineCount++;
    if (this.idleSuspendTimer) {
      clearTimeout(this.idleSuspendTimer);
      this.idleSuspendTimer = null;
    }
  }

  /**
   * Decrements active pipeline ref count.
   * When ref count reaches 0, gracefully suspends context after an idle period.
   */
  public release(): void {
    if (this.activePipelineCount > 0) {
      this.activePipelineCount--;
    }

    if (this.activePipelineCount === 0 && this.audioContext && this.audioContext.state === 'running') {
      if (this.idleSuspendTimer) clearTimeout(this.idleSuspendTimer);
      this.idleSuspendTimer = setTimeout(() => {
        if (this.activePipelineCount === 0 && this.audioContext && this.audioContext.state === 'running') {
          this.audioContext.suspend().catch(() => {});
        }
      }, 5000);
    }
  }

  /**
   * Returns current active pipeline count
   */
  public getActiveCount(): number {
    return this.activePipelineCount;
  }

  /**
   * Automatically resumes audio context on user interaction
   */
  private setupUserGestureListeners(): void {
    if (this.gestureListenersInstalled) return;
    this.gestureListenersInstalled = true;

    const resumeOnGesture = () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    };

    window.addEventListener('click', resumeOnGesture, { passive: true });
    window.addEventListener('keydown', resumeOnGesture, { passive: true });
    window.addEventListener('touchstart', resumeOnGesture, { passive: true });
  }

  /**
   * Handles worklet processor crash with graceful failover (N9)
   */
  public handleProcessorError(errorEvent?: any): void {
    console.error('[AudioEngine] Worklet processor error encountered:', errorEvent);
    updateAudioEngineDiagnostics({
      status: 'fallback',
      engine: 'browser-native',
      fallbackReason: 'AudioWorklet processor threw error (onprocessorerror)',
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gcp_audio_processor_error', {
          detail: {
            message: 'Noise cancellation processor crashed. Switched to browser fallback.',
          },
        })
      );
    }
  }

  /**
   * Test hook: resets singleton instance for isolated unit tests
   */
  public static _resetInstanceForTesting(): void {
    if (AudioEngine.instance?.audioContext && AudioEngine.instance.audioContext.state !== 'closed') {
      try {
        AudioEngine.instance.audioContext.close();
      } catch {}
    }
    AudioEngine.instance = null;
  }
}
