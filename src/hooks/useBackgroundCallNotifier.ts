'use client';

import { useEffect, useRef, useCallback } from 'react';

export const useBackgroundCallNotifier = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneOscillatorRef = useRef<OscillatorNode | null>(null);
  const ringtoneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneTimerRef.current) {
      clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }

    if (ringtoneOscillatorRef.current) {
      try {
        ringtoneOscillatorRef.current.stop();
        ringtoneOscillatorRef.current.disconnect();
      } catch {
        // Oscillator may already have stopped
      }
      ringtoneOscillatorRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Register Service Worker safely in client environments
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    ) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Background call Service Worker active with scope:', registration.scope);
        })
        .catch((err) => {
          console.warn('Service worker registration note:', err);
        });
    }

    return () => {
      stopRingtone();
    };
  }, [stopRingtone]);

  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }, []);

  /**
   * Procedural synthesized ringtone using Web Audio API (no external MP3 asset dependency).
   * Generates standard 440Hz / 480Hz dual-frequency chime with smooth gain envelope.
   */
  const playRingPulse = useCallback((ctx: AudioContext) => {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(480, now + 0.35);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.8);
      gain.gain.linearRampToValueAtTime(0, now + 1.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.8);
      ringtoneOscillatorRef.current = osc;
    } catch (e) {
      console.warn('Procedural ringtone pulse error:', e);
    }
  }, []);

  const startRingtone = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (audioContextRef.current) return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      audioContextRef.current = ctx;

      // Play first pulse immediately
      playRingPulse(ctx);

      // Pulse cadence every 3 seconds (standard phone ring cycle)
      ringtoneTimerRef.current = setInterval(() => {
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
          playRingPulse(audioContextRef.current);
        }
      }, 3000);
    } catch (err) {
      console.warn('Failed to start procedural ringtone:', err);
    }
  }, [playRingPulse]);

  return {
    requestNotificationPermission,
    startRingtone,
    stopRingtone,
  };
};
