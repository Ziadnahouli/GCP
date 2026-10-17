'use client';

import * as React from 'react';
import { useOptionalAuth } from '@/features/auth/auth-provider';
import { useCallContext } from '@/features/calls/call-context';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { useToast } from '@/components/ui/toast';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';

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

  // Track push-to-talk keydown state to avoid repeating events
  const isPttHeldRef = React.useRef(false);

  React.useEffect(() => {
    const isTextInput = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const el = target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"], .ProseMirror'
      );
      return el !== null;
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

      // Helper to detect if PTT is enabled from database settings or localStorage
      const isPttActive = (): boolean => {
        if (settingsRef.current?.push_to_talk_enabled) return true;
        try {
          const rawPrefs = localStorage.getItem('nexus_audio_prefs');
          if (rawPrefs) {
            const prefs = JSON.parse(rawPrefs);
            return Boolean(prefs?.pushToTalk);
          }
        } catch {}
        return false;
      };

      // Helper to check if event matches configured PTT key (supports Space, KeyV, or custom settings key)
      const isPttTrigger = (evt: KeyboardEvent): boolean => {
        const configuredKey = settingsRef.current?.push_to_talk_key || 'KeyV';
        return (
          evt.code === configuredKey ||
          evt.code === 'KeyV' ||
          evt.key.toLowerCase() === 'v' ||
          evt.code === 'Space'
        );
      };

      // 5. Push-To-Talk Keydown (Hold to transmit)
      if (!inInput && isPttActive() && isPttTrigger(e) && !e.repeat && !isCtrlOrMeta && !e.altKey) {
        if (e.code === 'Space') {
          e.preventDefault(); // Prevent page scroll on spacebar press
        }
        isPttHeldRef.current = true;
        const sv = serverVoiceRef.current;
        const cl = callRef.current;

        if (sv?.isVoiceConnected && sv.isMicMuted) {
          sv.toggleMic();
        } else if (cl?.callStatus === 'in_call' && cl.isMicMuted) {
          cl.toggleMic();
        }
      }

      // 6. Escape: Exit fullscreen or dismiss active modal
      if (e.key === 'Escape') {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target;
      const inInput = isTextInput(target);

      const isPttActive = (): boolean => {
        if (settingsRef.current?.push_to_talk_enabled) return true;
        try {
          const rawPrefs = localStorage.getItem('nexus_audio_prefs');
          if (rawPrefs) {
            const prefs = JSON.parse(rawPrefs);
            return Boolean(prefs?.pushToTalk);
          }
        } catch {}
        return false;
      };

      const isPttTrigger = (evt: KeyboardEvent): boolean => {
        const configuredKey = settingsRef.current?.push_to_talk_key || 'KeyV';
        return (
          evt.code === configuredKey ||
          evt.code === 'KeyV' ||
          evt.key.toLowerCase() === 'v' ||
          evt.code === 'Space'
        );
      };

      // Push-To-Talk release: Re-mute mic
      if (!inInput && isPttTrigger(e)) {
        if (isPttHeldRef.current) {
          isPttHeldRef.current = false;
          if (isPttActive()) {
            const sv = serverVoiceRef.current;
            const cl = callRef.current;

            if (sv?.isVoiceConnected && !sv.isMicMuted) {
              sv.toggleMic();
            } else if (cl?.callStatus === 'in_call' && !cl.isMicMuted) {
              cl.toggleMic();
            }
          }
        }
      }
    };

    const handleBlur = () => {
      if (isPttHeldRef.current) {
        isPttHeldRef.current = false;
        const sv = serverVoiceRef.current;
        const cl = callRef.current;
        if (sv?.isVoiceConnected && !sv.isMicMuted) {
          sv.toggleMic();
        } else if (cl?.callStatus === 'in_call' && !cl.isMicMuted) {
          cl.toggleMic();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
}
