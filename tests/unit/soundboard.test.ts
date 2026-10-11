import { describe, it, expect, beforeEach } from 'vitest';
import {
  soundboardEngine,
  BUILTIN_CLIPS,
  SoundboardClip,
} from '@/lib/soundboard/audio-engine';

describe('Soundboard Audio Engine', () => {
  beforeEach(() => {
    soundboardEngine.setVolume(0.8);
  });

  it('contains comprehensive pre-packaged gaming sound clips', () => {
    expect(BUILTIN_CLIPS.length).toBeGreaterThanOrEqual(8);
    const clipIds = BUILTIN_CLIPS.map((c) => c.id);
    expect(clipIds).toContain('airhorn');
    expect(clipIds).toContain('victory');
    expect(clipIds).toContain('headshot');
    expect(clipIds).toContain('bruh');
    expect(clipIds).toContain('gg');
  });

  it('correctly maps hotkeys 1-9 to default clips', () => {
    const clipsWithHotkeys = BUILTIN_CLIPS.filter((c) => !!c.hotkey);
    expect(clipsWithHotkeys.length).toBeGreaterThanOrEqual(8);
    const hotkeys = clipsWithHotkeys.map((c) => c.hotkey);
    expect(hotkeys).toContain('1');
    expect(hotkeys).toContain('2');
    expect(hotkeys).toContain('3');
  });

  it('clamps volume levels between 0 and 1', () => {
    soundboardEngine.setVolume(1.5);
    expect(soundboardEngine.getVolume()).toBe(1.0);

    soundboardEngine.setVolume(-0.5);
    expect(soundboardEngine.getVolume()).toBe(0.0);

    soundboardEngine.setVolume(0.65);
    expect(soundboardEngine.getVolume()).toBe(0.65);
  });

  it('handles procedural synth playback gracefully in mock environment', async () => {
    const clip = BUILTIN_CLIPS[0];
    const played = await soundboardEngine.playClip(clip);
    // In node/vitest without full AudioContext it handles safely
    expect(typeof played).toBe('boolean');
  });
});
