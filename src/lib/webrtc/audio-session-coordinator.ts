import { CallState } from '@/features/calls/call-state-machine';

type Listener = () => void;

class AudioSessionCoordinator {
  private callState: CallState = 'idle';
  private serverVoiceChannelId: string | null = null;
  private disconnectVoiceCallback: (() => void) | null = null;
  private endCallCallback: (() => void) | null = null;
  private listeners: Set<Listener> = new Set();

  setCallState(state: CallState) {
    if (this.callState !== state) {
      this.callState = state;
      this.notify();
    }
  }

  getCallState(): CallState {
    return this.callState;
  }

  setServerVoiceChannel(channelId: string | null) {
    if (this.serverVoiceChannelId !== channelId) {
      this.serverVoiceChannelId = channelId;
      this.notify();
    }
  }

  getServerVoiceChannel(): string | null {
    return this.serverVoiceChannelId;
  }

  isServerVoiceActive(): boolean {
    return this.serverVoiceChannelId !== null;
  }

  isCallActive(): boolean {
    return this.callState !== 'idle' && this.callState !== 'ended';
  }

  isAnyCallOrVoiceActive(): boolean {
    return this.isCallActive() || this.isServerVoiceActive();
  }

  registerVoiceDisconnectHandler(cb: () => void): () => void {
    this.disconnectVoiceCallback = cb;
    return () => {
      if (this.disconnectVoiceCallback === cb) {
        this.disconnectVoiceCallback = null;
      }
    };
  }

  registerEndCallHandler(cb: () => void): () => void {
    this.endCallCallback = cb;
    return () => {
      if (this.endCallCallback === cb) {
        this.endCallCallback = null;
      }
    };
  }

  disconnectVoiceIfActive(): boolean {
    if (this.isServerVoiceActive() && this.disconnectVoiceCallback) {
      try {
        this.disconnectVoiceCallback();
        return true;
      } catch (e) {
        console.error('[AudioSessionCoordinator] Failed to disconnect voice:', e);
      }
    }
    return false;
  }

  endCallIfActive(): boolean {
    if (this.isCallActive() && this.endCallCallback) {
      try {
        this.endCallCallback();
        return true;
      } catch (e) {
        console.error('[AudioSessionCoordinator] Failed to end call:', e);
      }
    }
    return false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch {}
    });
  }

  reset() {
    this.callState = 'idle';
    this.serverVoiceChannelId = null;
    this.disconnectVoiceCallback = null;
    this.endCallCallback = null;
    this.listeners.clear();
  }
}

export const audioSessionCoordinator = new AudioSessionCoordinator();
