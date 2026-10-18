'use client';

import * as React from 'react';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { useCallContext } from '@/features/calls/call-context';
import { installMixerAdapter, MixerAdapterApi, MixerState } from '@/lib/audio/mixer-adapter';

/**
 * Global reference ensuring that strictly ONE adapter is installed per tab,
 * surviving React Fast Refresh and Strict Mode mounts/unmounts.
 */
let globalMixerCleanup: (() => void) | null = null;
let activeCallIdGlobal: string | null = null;

export function MixerAdapterBridge() {
  const serverVoice = useServerVoiceContext();
  const call = useCallContext();

  // Determine active call source and stable unique callId
  const isServerVoiceActive = Boolean(serverVoice.isVoiceConnected && serverVoice.activeChannelId);
  const isDirectCallActive = Boolean(!isServerVoiceActive && call.callStatus === 'in_call' && call.activeConversationId);

  const activeCallId = React.useMemo(() => {
    if (isServerVoiceActive && serverVoice.activeChannelId) {
      return serverVoice.activeServerId
        ? `server-voice:${serverVoice.activeServerId}:${serverVoice.activeChannelId}`
        : `voice:${serverVoice.activeChannelId}`;
    }
    if (isDirectCallActive && call.activeConversationId) {
      return `direct-call:${call.activeConversationId}`;
    }
    return null;
  }, [isServerVoiceActive, isDirectCallActive, serverVoice.activeServerId, serverVoice.activeChannelId, call.activeConversationId]);

  // Keep a reference to current context methods and state to satisfy synchronous getState() contract
  const latestStateRef = React.useRef<MixerState>({
    connected: false,
    callId: '',
    room: '',
    mic_muted: true,
    deafened: false,
    volume: 100,
  });

  const activeProviderRef = React.useRef<{
    setMicMuted: (val: boolean) => Promise<void>;
    setDeafened: (val: boolean) => Promise<void>;
    setVolume: (val: number) => Promise<void>;
    forceMute: () => void;
  } | null>(null);

  // Synchronize latest call state on every render/state update from GCP UI
  React.useEffect(() => {
    if (isServerVoiceActive && serverVoice.activeChannelId) {
      latestStateRef.current = {
        connected: true,
        callId: activeCallId || '',
        room: serverVoice.activeChannelName ? `#${serverVoice.activeChannelName}` : (serverVoice.activeServerName || 'Voice Lounge'),
        mic_muted: serverVoice.isMicMuted,
        deafened: serverVoice.isDeafened,
        volume: serverVoice.incomingVolume,
      };
      activeProviderRef.current = {
        setMicMuted: serverVoice.setMicMutedExplicit,
        setDeafened: serverVoice.setDeafenedExplicit,
        setVolume: serverVoice.setIncomingVolume,
        forceMute: serverVoice.forceMute,
      };
    } else if (isDirectCallActive && call.activeConversationId) {
      const otherParticipant = call.participants?.[0]?.name;
      latestStateRef.current = {
        connected: true,
        callId: activeCallId || '',
        room: otherParticipant ? `Call with ${otherParticipant}` : 'Direct Call',
        mic_muted: call.isMicMuted,
        deafened: call.isDeafened,
        volume: call.incomingVolume,
      };
      activeProviderRef.current = {
        setMicMuted: call.setMicMutedExplicit,
        setDeafened: call.setDeafenedExplicit,
        setVolume: call.setIncomingVolume,
        forceMute: call.forceMute,
      };
    } else {
      latestStateRef.current = {
        connected: false,
        callId: '',
        room: '',
        mic_muted: true,
        deafened: false,
        volume: 100,
      };
      activeProviderRef.current = null;
    }
  }, [
    isServerVoiceActive,
    isDirectCallActive,
    activeCallId,
    serverVoice.activeChannelId,
    call.activeConversationId,
    serverVoice.activeChannelName,
    serverVoice.activeServerName,
    serverVoice.isMicMuted,
    serverVoice.isDeafened,
    serverVoice.incomingVolume,
    serverVoice.setMicMutedExplicit,
    serverVoice.setDeafenedExplicit,
    serverVoice.setIncomingVolume,
    serverVoice.forceMute,
    call.participants,
    call.isMicMuted,
    call.isDeafened,
    call.incomingVolume,
    call.setMicMutedExplicit,
    call.setDeafenedExplicit,
    call.setIncomingVolume,
    call.forceMute,
  ]);

  // Desktop companion DSP coordination: Poll companion bridge to prevent double suppression
  const previousModeRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !activeCallId) return;

    let isPolling = true;
    const checkDesktopDsp = async () => {
      try {
        const res = await fetch('http://127.0.0.1:48123/api/audio/dsp', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(600),
        });
        if (!isPolling) return;
        if (res.ok) {
          const data = await res.json();
          if (data && data.desktop_dsp_active && data.bypass_browser_dsp) {
            // Signal browser WebRTC pipeline not to double-process
            window.dispatchEvent(
              new CustomEvent('gcp_desktop_dsp_active', {
                detail: { active: true, engine: data.engine },
              })
            );
            return;
          }
        }
      } catch {
        // Desktop bridge offline or unreachable; browser WebRTC DSP should run normally
      }
      if (isPolling) {
        window.dispatchEvent(
          new CustomEvent('gcp_desktop_dsp_active', {
            detail: { active: false },
          })
        );
      }
    };

    const interval = window.setInterval(checkDesktopDsp, 2500);
    checkDesktopDsp();

    return () => {
      isPolling = false;
      window.clearInterval(interval);
      window.dispatchEvent(
        new CustomEvent('gcp_desktop_dsp_active', {
          detail: { active: false },
        })
      );
    };
  }, [activeCallId]);

  // Install adapter only after joining a call, and cleanup when leaving
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    // If call ended or inactive, teardown active adapter
    if (!activeCallId) {
      if (globalMixerCleanup) {
        try {
          globalMixerCleanup();
        } catch {}
        globalMixerCleanup = null;
      }
      activeCallIdGlobal = null;
      return;
    }

    // Teardown any prior instance to enforce strictly one adapter per tab
    if (globalMixerCleanup) {
      try {
        globalMixerCleanup();
      } catch {}
      globalMixerCleanup = null;
    }

    activeCallIdGlobal = activeCallId;

    const api: MixerAdapterApi = {
      getState: () => {
        return { ...latestStateRef.current };
      },
      setMicMuted: async (muted: boolean) => {
        // Immediate synchronous state reflect to satisfy contract
        latestStateRef.current.mic_muted = muted;
        if (activeProviderRef.current) {
          await activeProviderRef.current.setMicMuted(muted);
        }
      },
      setDeafened: async (deafened: boolean) => {
        latestStateRef.current.deafened = deafened;
        if (activeProviderRef.current) {
          await activeProviderRef.current.setDeafened(deafened);
        }
      },
      setVolume: async (volume: number) => {
        const clamped = Math.max(0, Math.min(100, Math.round(volume)));
        latestStateRef.current.volume = clamped;
        if (activeProviderRef.current) {
          await activeProviderRef.current.setVolume(clamped);
        }
      },
      forceMute: () => {
        latestStateRef.current.mic_muted = true;
        if (activeProviderRef.current) {
          activeProviderRef.current.forceMute();
        }
      },
    };

    try {
      const cleanup = installMixerAdapter(api, window);
      globalMixerCleanup = cleanup;
    } catch (err) {
      console.error('[MixerAdapterBridge] Failed to install adapter:', err);
    }

    return () => {
      if (globalMixerCleanup) {
        try {
          globalMixerCleanup();
        } catch {}
        globalMixerCleanup = null;
      }
      activeCallIdGlobal = null;
    };
  }, [activeCallId]);

  return null;
}
