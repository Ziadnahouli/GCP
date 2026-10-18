'use client';

import * as React from 'react';
import { useOptionalAuth } from '@/features/auth/auth-provider';
import { useCallContext } from '@/features/calls/call-context';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { useToast } from '@/components/ui/toast';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';

/**
 * Key matching helper for Push-To-Talk.
 * Strictly respects the configured key without arbitrary fallbacks to V or Space.
 */
export function matchesPttKey(evt: KeyboardEvent, configuredKey: string): boolean {
  if (!configuredKey) return false;
  const cfg = configuredKey.trim();

  // 1. Direct KeyboardEvent.code match (e.g. 'KeyV' === 'KeyV', 'Space' === 'Space')
  if (evt.code && evt.code.toLowerCase() === cfg.toLowerCase()) {
    return true;
  }

  // 2. If configured is like 'KeyT', match evt.key === 't' or 'T'
  if (cfg.length === 4 && cfg.toLowerCase().startsWith('key')) {
    const char = cfg.slice(3).toLowerCase();
    if (evt.key && evt.key.toLowerCase() === char) {
      return true;
    }
  }

  // 3. If configured is a single character like 'v' or 't'
  if (cfg.length === 1) {
    if (evt.key && evt.key.toLowerCase() === cfg.toLowerCase()) {
      return true;
    }
    if (evt.code && evt.code.toLowerCase() === `key${cfg.toLowerCase()}`) {
      return true;
    }
  }

  // 4. Direct KeyboardEvent.key match (e.g. ' ', 'Space')
  if (evt.key && evt.key.toLowerCase() === cfg.toLowerCase()) {
    return true;
  }

  return false;
}

export function useGlobalShortcuts() {
  const auth = useOptionalAuth();
  const settings = auth?.settings;
  const call = useCallContext();
  const serverVoice = useServerVoiceContext();
  const { toast } = useToast();

  const settingsRef = React.useRef(settings);
  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const callRef = React.useRef(call);
  React.useEffect(() => {
    callRef.current = call;
  }, [call]);

  const serverVoiceRef = React.useRef(serverVoice);
  React.useEffect(() => {
    serverVoiceRef.current = serverVoice;
  }, [serverVoice]);

  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // Push-To-Talk State Machine:
  // Tracks which audio session was temporarily unmuted by this PTT keydown.
  // If the microphone was already unmuted when PTT was pressed, this remains null
  // so that releasing the key does NOT unexpectedly mute an already-active microphone.
  const pttUnmutedSessionRef = React.useRef<'server' | 'call' | null>(null);
  const isPttKeyDownRef = React.useRef<boolean>(false);

  // Monitor voice and call disconnects to cancel any active PTT hold immediately
  React.useEffect(() => {
    if (pttUnmutedSessionRef.current === 'server' && !serverVoice?.isVoiceConnected) {
      pttUnmutedSessionRef.current = null;
      isPttKeyDownRef.current = false;
    }
    if (pttUnmutedSessionRef.current === 'call' && call?.callStatus !== 'in_call') {
      pttUnmutedSessionRef.current = null;
      isPttKeyDownRef.current = false;
    }
  }, [serverVoice?.isVoiceConnected, call?.callStatus]);

  React.useEffect(() => {
    const isTextInput = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const el = target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"], .ProseMirror'
      );
      return el !== null;
    };

    // Helper to detect if PTT is enabled from database settings or localStorage
    const isPttActive = (): boolean => {
      if (settingsRef.current?.push_to_talk_enabled !== undefined) {
        return Boolean(settingsRef.current.push_to_talk_enabled);
      }
      try {
        const rawPrefs = localStorage.getItem('nexus_audio_prefs');
        if (rawPrefs) {
          const prefs = JSON.parse(rawPrefs);
          return Boolean(prefs?.pushToTalk);
        }
      } catch {}
      return false;
    };

    // Helper to get configured PTT key
    const getConfiguredPttKey = (): string => {
      if (settingsRef.current?.push_to_talk_key) {
        return settingsRef.current.push_to_talk_key;
      }
      try {
        const rawPrefs = localStorage.getItem('nexus_audio_prefs');
        if (rawPrefs) {
          const prefs = JSON.parse(rawPrefs);
          if (prefs?.pushToTalkKey) {
            return prefs.pushToTalkKey;
          }
        }
      } catch {}
      return 'KeyV';
    };

    // Reset PTT state and re-mute if and only if PTT had temporarily unmuted
    const resetPtt = () => {
      isPttKeyDownRef.current = false;
      const unmutedSession = pttUnmutedSessionRef.current;
      pttUnmutedSessionRef.current = null;

      if (unmutedSession === 'server') {
        const sv = serverVoiceRef.current;
        if (sv?.isVoiceConnected && !sv.isMicMuted) {
          sv.toggleMic();
        }
      } else if (unmutedSession === 'call') {
        const cl = callRef.current;
        if (cl?.callStatus === 'in_call' && !cl.isMicMuted) {
          cl.toggleMic();
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const inInput = isTextInput(target);
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // 1. Quick Search: Ctrl + K (opens command palette modal when not typing in inputs)
      if (!inInput && isCtrlOrMeta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nexus-open-global-search'));
        }
        return;
      }

      // 2. Telemetry & Logs Window: Ctrl + ~ or Ctrl + ` or Alt + L
      if (
        (isCtrlOrMeta && (e.key === '`' || e.key === '~' || e.code === 'Backquote')) ||
        (e.altKey && (e.key === 'l' || e.key === 'L'))
      ) {
        e.preventDefault();
        triggerOpenLogsWindow();
        return;
      }

      // 3. Toggle Microphone Mute: Ctrl + Shift + M
      if (isCtrlOrMeta && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        const sv = serverVoiceRef.current;
        const cl = callRef.current;

        if (sv?.isVoiceConnected) {
          const nextMuted = !sv.isMicMuted;
          sv.toggleMic();
          toastRef.current({
            title: nextMuted ? 'Microphone Muted' : 'Microphone Unmuted',
            description: `Voice Lounge • Shortcut: Ctrl+Shift+M`,
            type: nextMuted ? 'info' : 'success',
            duration: 2000,
          });
        } else if (cl?.callStatus === 'in_call') {
          const nextMuted = !cl.isMicMuted;
          cl.toggleMic();
          toastRef.current({
            title: nextMuted ? 'Microphone Muted' : 'Microphone Unmuted',
            description: `Private Call • Shortcut: Ctrl+Shift+M`,
            type: nextMuted ? 'info' : 'success',
            duration: 2000,
          });
        } else {
          toastRef.current({
            title: 'No Active Audio Session',
            description: 'Connect to a voice lounge or private call to toggle microphone.',
            type: 'info',
            duration: 2000,
          });
        }
        return;
      }

      // 4. Toggle Deafen Audio: Ctrl + Shift + D
      if (isCtrlOrMeta && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const sv = serverVoiceRef.current;
        const cl = callRef.current;

        if (sv?.isVoiceConnected) {
          const nextDeaf = !sv.isDeafened;
          sv.toggleDeafen();
          toastRef.current({
            title: nextDeaf ? 'Audio Deafened' : 'Audio Undeafened',
            description: nextDeaf
              ? 'Incoming sound and microphone silenced'
              : 'Incoming sound and microphone restored',
            type: nextDeaf ? 'info' : 'success',
            duration: 2000,
          });
        } else if (cl?.callStatus === 'in_call') {
          const nextDeaf = !cl.isDeafened;
          cl.toggleDeafen();
          toastRef.current({
            title: nextDeaf ? 'Audio Deafened' : 'Audio Undeafened',
            description: nextDeaf
              ? 'Incoming sound and microphone silenced'
              : 'Incoming sound and microphone restored',
            type: nextDeaf ? 'info' : 'success',
            duration: 2000,
          });
        } else {
          toastRef.current({
            title: 'No Active Audio Session',
            description: 'Connect to a voice lounge or private call to toggle deafen.',
            type: 'info',
            duration: 2000,
          });
        }
        return;
      }

      // 5. Push-To-Talk Keydown (Hold to transmit)
      if (!inInput && isPttActive() && !isCtrlOrMeta && !e.altKey) {
        const configuredKey = getConfiguredPttKey();
        if (matchesPttKey(e, configuredKey)) {
          if (e.code === 'Space' || configuredKey.toLowerCase() === 'space' || configuredKey === ' ') {
            e.preventDefault(); // Prevent page scroll only when Space is the actual configured key
          }

          if (e.repeat || isPttKeyDownRef.current) {
            return;
          }
          isPttKeyDownRef.current = true;

          const sv = serverVoiceRef.current;
          const cl = callRef.current;

          // Priority: server voice if connected, else private call
          if (sv?.isVoiceConnected) {
            if (sv.isMicMuted) {
              sv.toggleMic();
              pttUnmutedSessionRef.current = 'server';
            } else {
              // Mic was already unmuted: DO NOT mute, DO NOT flag for re-mute on keyup
              pttUnmutedSessionRef.current = null;
            }
          } else if (cl?.callStatus === 'in_call') {
            if (cl.isMicMuted) {
              cl.toggleMic();
              pttUnmutedSessionRef.current = 'call';
            } else {
              // Mic was already unmuted: DO NOT mute, DO NOT flag for re-mute on keyup
              pttUnmutedSessionRef.current = null;
            }
          } else {
            pttUnmutedSessionRef.current = null;
          }
        }
      }

      // 6. Escape: Exit fullscreen
      if (e.key === 'Escape') {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target;
      const inInput = isTextInput(target);
      if (inInput) return;

      const configuredKey = getConfiguredPttKey();
      if (matchesPttKey(e, configuredKey)) {
        if (e.code === 'Space' || configuredKey.toLowerCase() === 'space' || configuredKey === ' ') {
          e.preventDefault();
        }

        isPttKeyDownRef.current = false;
        const unmutedSession = pttUnmutedSessionRef.current;
        pttUnmutedSessionRef.current = null;

        if (unmutedSession === 'server') {
          const sv = serverVoiceRef.current;
          if (sv?.isVoiceConnected && !sv.isMicMuted) {
            sv.toggleMic();
          }
        } else if (unmutedSession === 'call') {
          const cl = callRef.current;
          if (cl?.callStatus === 'in_call' && !cl.isMicMuted) {
            cl.toggleMic();
          }
        }
      }
    };

    const handleBlur = () => {
      resetPtt();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetPtt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resetPtt();
    };
  }, []);
}
