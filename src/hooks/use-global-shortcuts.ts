'use client';

import * as React from 'react';
import { useCallContext } from '@/features/calls/call-context';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { useToast } from '@/components/ui/toast';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';

export function useGlobalShortcuts() {
  const call = useCallContext();
  const serverVoice = useServerVoiceContext();
  const { toast } = useToast();

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
      const tag = target.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        target.isContentEditable ||
        target.classList.contains('ProseMirror')
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const inInput = isTextInput(target);
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // 1. Quick Search: Ctrl + K (allowed everywhere, even when inside an input)
      if (isCtrlOrMeta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
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

      // 5. Push-To-Talk Default Key: [V] (Only when push-to-talk mode is enabled in Audio Preferences)
      if (!inInput && (e.key === 'v' || e.key === 'V') && !e.repeat && !isCtrlOrMeta && !e.altKey) {
        try {
          const rawPrefs = localStorage.getItem('nexus_audio_prefs');
          const prefs = rawPrefs ? JSON.parse(rawPrefs) : null;
          if (prefs?.pushToTalk) {
            isPttHeldRef.current = true;
            const sv = serverVoiceRef.current;
            const cl = callRef.current;

            if (sv?.isVoiceConnected && sv.isMicMuted) {
              sv.toggleMic();
            } else if (cl?.callStatus === 'in_call' && cl.isMicMuted) {
              cl.toggleMic();
            }
          }
        } catch {}
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

      // Push-To-Talk release: Re-mute mic
      if (!inInput && (e.key === 'v' || e.key === 'V')) {
        if (isPttHeldRef.current) {
          isPttHeldRef.current = false;
          try {
            const rawPrefs = localStorage.getItem('nexus_audio_prefs');
            const prefs = rawPrefs ? JSON.parse(rawPrefs) : null;
            if (prefs?.pushToTalk) {
              const sv = serverVoiceRef.current;
              const cl = callRef.current;

              if (sv?.isVoiceConnected && !sv.isMicMuted) {
                sv.toggleMic();
              } else if (cl?.callStatus === 'in_call' && !cl.isMicMuted) {
                cl.toggleMic();
              }
            }
          } catch {}
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
}
