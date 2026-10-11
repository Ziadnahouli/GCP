'use client';

import * as React from 'react';
import {
  soundboardEngine,
  SoundboardClip,
  BUILTIN_CLIPS,
} from '@/lib/soundboard/audio-engine';

const STORAGE_KEY = 'nexus_custom_soundboard_clips';

export function useSoundboard() {
  const [customClips, setCustomClips] = React.useState<SoundboardClip[]>([]);
  const [playingClipId, setPlayingClipId] = React.useState<string | null>(null);
  const [volume, setVolumeState] = React.useState<number>(0.8);
  const [activeCategory, setActiveCategory] = React.useState<string>('all');
  const [hotkeysEnabled, setHotkeysEnabled] = React.useState<boolean>(true);

  // Load custom clips from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCustomClips(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to parse custom soundboard clips:', e);
    }
  }, []);

  const saveCustomClips = (clips: SoundboardClip[]) => {
    setCustomClips(clips);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
    } catch (e) {
      console.warn('Failed to store custom soundboard clips:', e);
    }
  };

  const allClips = React.useMemo(() => {
    return [...BUILTIN_CLIPS, ...customClips];
  }, [customClips]);

  const filteredClips = React.useMemo(() => {
    if (activeCategory === 'all') return allClips;
    return allClips.filter((c) => c.category === activeCategory);
  }, [allClips, activeCategory]);

  const playClip = React.useCallback(async (clip: SoundboardClip) => {
    if (soundboardEngine.isCoolingDown()) return false;

    const played = await soundboardEngine.playClip(clip);
    if (played) {
      setPlayingClipId(clip.id);
      window.setTimeout(() => {
        setPlayingClipId((current) => (current === clip.id ? null : current));
      }, clip.durationSeconds * 1000);
      return true;
    }
    return false;
  }, []);

  const stopAll = React.useCallback(() => {
    soundboardEngine.stopAll();
    setPlayingClipId(null);
  }, []);

  const setVolume = React.useCallback((vol: number) => {
    setVolumeState(vol);
    soundboardEngine.setVolume(vol);
  }, []);

  const addCustomClip = React.useCallback(
    (name: string, category: 'memes' | 'combat' | 'callouts' | 'custom', audioDataUri: string, durationSeconds: number) => {
      const newClip: SoundboardClip = {
        id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        category,
        icon: '🎵',
        durationSeconds: Math.min(10, Math.max(0.5, durationSeconds)),
        type: 'custom',
        audioDataUri,
      };
      const updated = [...customClips, newClip];
      saveCustomClips(updated);
      return newClip;
    },
    [customClips]
  );

  const removeCustomClip = React.useCallback(
    (id: string) => {
      const updated = customClips.filter((c) => c.id !== id);
      saveCustomClips(updated);
    },
    [customClips]
  );

  // Global Hotkey Listener (Keys 1-9)
  React.useEffect(() => {
    if (!hotkeysEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const clip = allClips.find((c) => c.hotkey === e.key);
      if (clip) {
        e.preventDefault();
        playClip(clip);
      } else if (e.key === 'Escape' && playingClipId) {
        stopAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allClips, hotkeysEnabled, playClip, playingClipId, stopAll]);

  return {
    allClips,
    filteredClips,
    customClips,
    playingClipId,
    volume,
    setVolume,
    playClip,
    stopAll,
    addCustomClip,
    removeCustomClip,
    activeCategory,
    setActiveCategory,
    hotkeysEnabled,
    setHotkeysEnabled,
  };
}
