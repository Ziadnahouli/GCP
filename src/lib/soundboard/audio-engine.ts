/**
 * Nexus Gaming Soundboard - Web Audio API Synthesizer & Audio Engine
 * Zero external audio file dependencies required for built-in effects.
 * Supports custom audio uploads, call track routing, and anti-spam cooldowns.
 */

export interface SoundboardClip {
  id: string;
  name: string;
  category: 'memes' | 'combat' | 'callouts' | 'custom';
  icon: string;
  hotkey?: string;
  durationSeconds: number;
  type: 'synth' | 'custom';
  synthId?: string;
  audioDataUri?: string;
}

export const BUILTIN_CLIPS: SoundboardClip[] = [
  {
    id: 'airhorn',
    name: 'Airhorn MLG',
    category: 'memes',
    icon: '🎺',
    hotkey: '1',
    durationSeconds: 1.8,
    type: 'synth',
    synthId: 'airhorn',
  },
  {
    id: 'victory',
    name: 'Victory Fanfare',
    category: 'combat',
    icon: '🏆',
    hotkey: '2',
    durationSeconds: 2.2,
    type: 'synth',
    synthId: 'victory',
  },
  {
    id: 'headshot',
    name: 'Headshot Ping',
    category: 'combat',
    icon: '🎯',
    hotkey: '3',
    durationSeconds: 0.6,
    type: 'synth',
    synthId: 'headshot',
  },
  {
    id: 'levelup',
    name: 'Level Up',
    category: 'callouts',
    icon: '⚡',
    hotkey: '4',
    durationSeconds: 1.2,
    type: 'synth',
    synthId: 'levelup',
  },
  {
    id: 'gg',
    name: 'GG Good Game',
    category: 'callouts',
    icon: '🎮',
    hotkey: '5',
    durationSeconds: 1.5,
    type: 'synth',
    synthId: 'gg',
  },
  {
    id: 'bruh',
    name: 'Bruh Moment',
    category: 'memes',
    icon: '💀',
    hotkey: '6',
    durationSeconds: 1.1,
    type: 'synth',
    synthId: 'bruh',
  },
  {
    id: 'laser',
    name: 'Laser Beam',
    category: 'combat',
    icon: '🔫',
    hotkey: '7',
    durationSeconds: 0.8,
    type: 'synth',
    synthId: 'laser',
  },
  {
    id: 'quack',
    name: 'Tactical Quack',
    category: 'memes',
    icon: '🦆',
    hotkey: '8',
    durationSeconds: 0.7,
    type: 'synth',
    synthId: 'quack',
  },
  {
    id: 'drumroll',
    name: 'Hype Drumroll',
    category: 'memes',
    icon: '🥁',
    hotkey: '9',
    durationSeconds: 2.0,
    type: 'synth',
    synthId: 'drumroll',
  },
];

class SoundboardAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private broadcastDest: MediaStreamAudioDestinationNode | null = null;
  private volume: number = 0.8;
  private lastPlayTimestamp: number = 0;
  private cooldownMs: number = 600; // anti-spam cooldown
  private activeNodes: { stop: () => void }[] = [];

  private initContext() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx || typeof AudioCtx !== 'function') return;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

        this.broadcastDest = this.ctx.createMediaStreamDestination();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.connect(this.broadcastDest);
      }

      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {
      // AudioContext unavailable or blocked by autoplay policy
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getBroadcastStream(): MediaStream | null {
    this.initContext();
    return this.broadcastDest ? this.broadcastDest.stream : null;
  }

  public isCoolingDown(): boolean {
    return Date.now() - this.lastPlayTimestamp < this.cooldownMs;
  }

  public stopAll() {
    this.activeNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // node already finished
      }
    });
    this.activeNodes = [];
  }

  public async playClip(clip: SoundboardClip): Promise<boolean> {
    if (this.isCoolingDown()) {
      return false;
    }
    this.lastPlayTimestamp = Date.now();
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {}
    }
    if (!this.ctx || !this.masterGain) return false;

    if (clip.type === 'custom' && clip.audioDataUri) {
      return this.playCustomDataUri(clip.audioDataUri);
    }

    switch (clip.synthId) {
      case 'airhorn':
        this.synthAirhorn();
        return true;
      case 'victory':
        this.synthVictory();
        return true;
      case 'headshot':
        this.synthHeadshot();
        return true;
      case 'levelup':
        this.synthLevelUp();
        return true;
      case 'gg':
        this.synthGG();
        return true;
      case 'bruh':
        this.synthBruh();
        return true;
      case 'laser':
        this.synthLaser();
        return true;
      case 'quack':
        this.synthQuack();
        return true;
      case 'drumroll':
        this.synthDrumroll();
        return true;
      default:
        this.synthAirhorn();
        return true;
    }
  }

  private async playCustomDataUri(dataUri: string): Promise<boolean> {
    if (!this.ctx || !this.masterGain) return false;
    try {
      const response = await fetch(dataUri);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.masterGain);
      source.start();

      const ref = { stop: () => source.stop() };
      this.activeNodes.push(ref);
      source.onended = () => {
        this.activeNodes = this.activeNodes.filter((n) => n !== ref);
      };
      return true;
    } catch (err) {
      console.error('Failed to play custom soundboard clip:', err);
      return false;
    }
  }

  // --- PROCEDURAL AUDIO SYNTHESIZERS ---

  private synthAirhorn() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const freqs = [466.16, 470.0, 462.5]; // Bb4 detuned triad for iconic brass airhorn

    freqs.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.05, now + 0.1);
      osc.frequency.linearRampToValueAtTime(freq * 0.95, now + 0.6);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.setValueAtTime(0.2, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + 0.75);

      this.activeNodes.push({ stop: () => osc.stop() });
    });

    // Second blast
    const blast2 = now + 0.35;
    freqs.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, blast2);
      osc.frequency.linearRampToValueAtTime(freq * 1.02, blast2 + 0.1);

      gain.gain.setValueAtTime(0, blast2);
      gain.gain.linearRampToValueAtTime(0.25, blast2 + 0.04);
      gain.gain.setValueAtTime(0.25, blast2 + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, blast2 + 1.2);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(blast2);
      osc.stop(blast2 + 1.25);

      this.activeNodes.push({ stop: () => osc.stop() });
    });
  }

  private synthVictory() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // C major fanfare: C4, E4, G4, C5 triumphant cadence
    const notes = [
      { f: 261.63, t: 0.0, d: 0.18 },
      { f: 329.63, t: 0.18, d: 0.18 },
      { f: 392.0, t: 0.36, d: 0.22 },
      { f: 523.25, t: 0.58, d: 1.0 },
    ];

    notes.forEach((n) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0, now + n.t);
      gain.gain.linearRampToValueAtTime(0.3, now + n.t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
      this.activeNodes.push({ stop: () => osc.stop() });
    });
  }

  private synthHeadshot() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Transient click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.35);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.4);
    this.activeNodes.push({ stop: () => osc.stop() });
  }

  private synthLevelUp() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const scale = [392.0, 440.0, 523.25, 659.25, 783.99, 1046.5]; // G4 to C6 sparkle

    scale.forEach((freq, idx) => {
      const t = now + idx * 0.08;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.45);
      this.activeNodes.push({ stop: () => osc.stop() });
    });
  }

  private synthGG() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const chords = [523.25, 659.25, 783.99]; // Warm C major synth chord

    chords.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + 1.25);
      this.activeNodes.push({ stop: () => osc.stop() });
    });
  }

  private synthBruh() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.7);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.linearRampToValueAtTime(250, now + 0.7);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.9);
    this.activeNodes.push({ stop: () => osc.stop() });
  }

  private synthLaser() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
    this.activeNodes.push({ stop: () => osc.stop() });
  }

  private synthQuack() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(240, now + 0.3);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(4.0, now);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.45);
    this.activeNodes.push({ stop: () => osc.stop() });
  }

  private synthDrumroll() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Rapid snare bursts using filtered noise
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 1.7);
    this.activeNodes.push({ stop: () => noise.stop() });
  }
}

export const soundboardEngine = new SoundboardAudioEngine();
