import { installMixerAdapter as installMixerAdapterRaw } from './mixer-adapter.mjs';

export interface MixerState {
  connected: boolean;
  callId: string;
  room: string;
  mic_muted: boolean;
  deafened: boolean;
  volume: number; // 0..100
}

export interface MixerAdapterApi {
  getState: () => MixerState;
  setMicMuted: (value: boolean) => Promise<void> | void;
  setDeafened: (value: boolean) => Promise<void> | void;
  setVolume: (value: number) => Promise<void> | void;
  forceMute: () => void;
}

export function installMixerAdapter(
  api: MixerAdapterApi,
  environment: any = typeof window !== 'undefined' ? window : undefined
): () => void {
  if (!environment) return () => {};
  return installMixerAdapterRaw(api, environment);
}
