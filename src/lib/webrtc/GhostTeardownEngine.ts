/**
 * GhostTeardownEngine
 * 
 * Guarantees zero orphan "ghost calls" by aggressively binding synchronous browser unload hooks,
 * transmitting unblockable exit beacons, executing immediate hardware media shutdowns,
 * pulsing 2.5s signaling heartbeats, and watching ICE freezes for 5-second dead connection drops.
 */

export interface TeardownConfig {
  callId: string;
  peerId: string;
  signalingEndpoint: string;
  authToken: string;
  pc: RTCPeerConnection;
  localStream?: MediaStream | null;
  onCallTerminated: (reason: string) => void;
}

export class GhostTeardownEngine {
  private config: TeardownConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private iceWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private exitHandler: (() => void) | null = null;

  constructor(config: TeardownConfig) {
    this.config = config;
    this.bindWindowLifecycleEvents();
    this.startSignalingHeartbeat();
    this.monitorIceConnectionState();
  }

  /**
   * Bind synchronous browser teardown hooks.
   */
  private bindWindowLifecycleEvents(): void {
    if (typeof window === 'undefined') return;

    this.exitHandler = () => {
      this.executeImmediateTeardown('window_closed');
    };

    window.addEventListener('beforeunload', this.exitHandler);
    window.addEventListener('pagehide', this.exitHandler);
  }

  /**
   * Unbind browser teardown hooks.
   */
  private unbindWindowLifecycleEvents(): void {
    if (typeof window === 'undefined' || !this.exitHandler) return;

    window.removeEventListener('beforeunload', this.exitHandler);
    window.removeEventListener('pagehide', this.exitHandler);
    this.exitHandler = null;
  }

  /**
   * Stop hardware, close socket/PC, and fire network exit beacons.
   */
  public executeImmediateTeardown(reason: string): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // 1. Immediately kill hardware tracks (stops webcam/mic hardware LEDs)
    if (this.config.localStream) {
      try {
        this.config.localStream.getTracks().forEach((track) => {
          try {
            track.stop();
            track.enabled = false;
          } catch (e) {
            console.error('Error stopping track in GhostTeardownEngine:', e);
          }
        });
      } catch (e) {
        console.error('Error iterating local stream tracks:', e);
      }
    }

    // 2. Transmit unblockable exit beacon to signaling server
    const payload = JSON.stringify({
      callId: this.config.callId,
      peerId: this.config.peerId,
      reason,
      timestamp: Date.now(),
    });

    const exitUrl = `${this.config.signalingEndpoint}/api/calls/${this.config.callId}/leave`;

    let beaconSent = false;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        beaconSent = navigator.sendBeacon(exitUrl, blob);
      } catch (e) {
        // Beacon might fail if payload exceeds limit or quota
        beaconSent = false;
      }
    }

    // Fallback: fetch keepalive (survives tab closure)
    if (!beaconSent && typeof fetch !== 'undefined') {
      try {
        fetch(exitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.authToken}`,
          },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Suppress unhandled network error during teardown
      }
    }

    // 3. Close RTCPeerConnection cleanly
    try {
      if (this.config.pc && typeof this.config.pc.close === 'function') {
        this.config.pc.close();
      }
    } catch (e) {
      console.error('Error closing peer connection in GhostTeardownEngine:', e);
    }

    // 4. Clear internal timers & unbind hooks
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.iceWatchdogTimer) {
      clearTimeout(this.iceWatchdogTimer);
      this.iceWatchdogTimer = null;
    }

    this.unbindWindowLifecycleEvents();

    // 5. Notify parent callback
    try {
      this.config.onCallTerminated(reason);
    } catch (err) {
      console.error('Error in onCallTerminated callback:', err);
    }
  }

  /**
   * Send heartbeat pings every 2.5 seconds.
   */
  private startSignalingHeartbeat(): void {
    if (typeof window === 'undefined') return;

    this.heartbeatTimer = setInterval(async () => {
      if (this.isDestroyed) return;

      try {
        const res = await fetch(
          `${this.config.signalingEndpoint}/api/calls/${this.config.callId}/heartbeat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.config.authToken}`,
            },
            body: JSON.stringify({ peerId: this.config.peerId }),
          }
        );

        if (!res.ok && res.status === 404) {
          // Call already pruned on server
          this.executeImmediateTeardown('server_pruned_session');
        }
      } catch {
        // Suppress transient network ping errors
      }
    }, 2500);
  }

  /**
   * Watchdog drops peer connection if ICE freezes for more than 5 seconds.
   */
  private monitorIceConnectionState(): void {
    if (!this.config.pc) return;

    const checkState = () => {
      const state = this.config.pc.iceConnectionState;

      if (state === 'disconnected' || state === 'failed') {
        if (!this.iceWatchdogTimer) {
          this.iceWatchdogTimer = setTimeout(() => {
            if (
              this.config.pc.iceConnectionState === 'disconnected' ||
              this.config.pc.iceConnectionState === 'failed'
            ) {
              this.executeImmediateTeardown('ice_timeout_5s_exceeded');
            }
          }, 5000);
        }
      } else if (state === 'connected' || state === 'completed') {
        if (this.iceWatchdogTimer) {
          clearTimeout(this.iceWatchdogTimer);
          this.iceWatchdogTimer = null;
        }
      }
    };

    this.config.pc.oniceconnectionstatechange = checkState;
  }

  public destroy(): void {
    this.executeImmediateTeardown('user_hangup');
  }

  public get destroyed(): boolean {
    return this.isDestroyed;
  }
}
