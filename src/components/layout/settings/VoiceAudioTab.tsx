'use client';

import * as React from 'react';
import {
  Mic,
  Headphones,
  Video,
  Camera,
  Play,
  Square,
  Sparkles,
  Volume2,
  Radio,
  Save,
  Loader2,
} from 'lucide-react';
import {
  NoiseCancellationMode,
  createGcpNoisePipeline,
  GcpNoisePipeline,
} from '@/lib/webrtc/gcp-noise-cancellation';
import { AudioEngine } from '@/lib/webrtc/audio-engine';
import {
  subscribeAudioEngineDiagnostics,
  getAudioEngineDiagnostics,
  AudioEngineDiagnostics,
  getUserMediaAudioConstraints,
} from '@/lib/webrtc/audio-processing-policy';
import { useAuth } from '@/features/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface VoiceAudioTabProps {
  activeTab: 'studio' | 'audio';
  open?: boolean;
}

export function VoiceAudioTab({ activeTab, open = true }: VoiceAudioTabProps) {
  const { settings, updateSettings } = useAuth();
  const { toast } = useToast();

  const [soundEffects, setSoundEffects] = React.useState(settings?.sound_effects_enabled ?? true);
  const [pushToTalk, setPushToTalk] = React.useState(settings?.push_to_talk_enabled ?? false);
  const [inputVol, setInputVol] = React.useState(settings?.input_volume ?? 85);
  const [outputVol, setOutputVol] = React.useState(settings?.output_volume ?? 100);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (settings) {
      if (settings.sound_effects_enabled !== undefined) setSoundEffects(settings.sound_effects_enabled);
      if (settings.push_to_talk_enabled !== undefined) setPushToTalk(settings.push_to_talk_enabled);
      if (settings.input_volume !== undefined) setInputVol(settings.input_volume);
      if (settings.output_volume !== undefined) setOutputVol(settings.output_volume);
    }
  }, [settings]);

  const [noiseMode, setNoiseMode] = React.useState<NoiseCancellationMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nexus_noise_suppression_mode') as NoiseCancellationMode | null;
      if (saved === 'off' || saved === 'light' || saved === 'balanced' || saved === 'strong') return saved;
      const legacy = localStorage.getItem('nexus_noise_suppression');
      if (legacy === 'false') return 'off';
    }
    return 'balanced';
  });

  const [liveEngineStatus, setLiveEngineStatus] = React.useState<AudioEngineDiagnostics>(() =>
    getAudioEngineDiagnostics()
  );

  React.useEffect(() => {
    return subscribeAudioEngineDiagnostics((diag) => {
      setLiveEngineStatus({ ...diag });
    });
  }, []);

  // Hardware devices
  const [audioInputDevices, setAudioInputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = React.useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = React.useState('');
  const [selectedCamDevice, setSelectedCamDevice] = React.useState('');

  // Live microphone testing state
  const [isTestingMic, setIsTestingMic] = React.useState(false);
  const [micLevel, setMicLevel] = React.useState(0);
  const [micLevelClean, setMicLevelClean] = React.useState(0);
  const [isRecordingSample, setIsRecordingSample] = React.useState(false);
  const [sampleAudioUrl, setSampleAudioUrl] = React.useState<string | null>(null);
  const [isPlayingSample, setIsPlayingSample] = React.useState(false);
  const [roomNoiseAdvice, setRoomNoiseAdvice] = React.useState<string | null>(null);
  const micTestStreamRef = React.useRef<MediaStream | null>(null);
  const micTestAudioCtxRef = React.useRef<AudioContext | null>(null);
  const micTestPipelineRef = React.useRef<GcpNoisePipeline | null>(null);
  const micTestAnimRef = React.useRef<number | null>(null);
  const sampleAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Live audio output testing state
  const [isTestingOutput, setIsTestingOutput] = React.useState(false);

  // Live webcam preview testing state
  const [isTestingCam, setIsTestingCam] = React.useState(false);
  const camTestStreamRef = React.useRef<MediaStream | null>(null);
  const camVideoRef = React.useRef<HTMLVideoElement>(null);

  // Enumerate hardware devices and restore persisted preferences
  React.useEffect(() => {
    if (open && typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const inputs = devices.filter((d) => d.kind === 'audioinput');
          const outputs = devices.filter((d) => d.kind === 'audiooutput');
          const videos = devices.filter((d) => d.kind === 'videoinput');
          setAudioInputDevices(inputs);
          setAudioOutputDevices(outputs);
          setVideoDevices(videos);

          // Restore saved audio devices or fall back to first device
          const savedIn = localStorage.getItem('nexus_audio_input_device');
          const savedOut = localStorage.getItem('nexus_audio_output_device');

          if (inputs.length > 0) {
            const matchIn = savedIn && inputs.some((i) => i.deviceId === savedIn);
            setSelectedInputDevice(matchIn ? (savedIn as string) : inputs[0].deviceId);
          }
          if (outputs.length > 0) {
            const matchOut = savedOut && outputs.some((o) => o.deviceId === savedOut);
            setSelectedOutputDevice(matchOut ? (savedOut as string) : outputs[0].deviceId);
          }
          if (videos.length > 0 && !selectedCamDevice) {
            setSelectedCamDevice(videos[0].deviceId);
          }
        })
        .catch(() => {});
    }
  }, [open, selectedCamDevice]);

  // Clean up media tests
  const stopMicTest = React.useCallback(() => {
    if (micTestAnimRef.current) {
      cancelAnimationFrame(micTestAnimRef.current);
      micTestAnimRef.current = null;
    }
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((t) => t.stop());
      micTestStreamRef.current = null;
    }
    if (micTestPipelineRef.current) {
      try {
        micTestPipelineRef.current.cleanup();
      } catch {}
      micTestPipelineRef.current = null;
    }
    micTestAudioCtxRef.current = null;
    setIsTestingMic(false);
    setMicLevel(0);
    setMicLevelClean(0);
  }, []);

  const stopCamTest = React.useCallback(() => {
    if (camTestStreamRef.current) {
      camTestStreamRef.current.getTracks().forEach((t) => t.stop());
      camTestStreamRef.current = null;
    }
    if (camVideoRef.current) {
      camVideoRef.current.srcObject = null;
    }
    setIsTestingCam(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      stopMicTest();
      stopCamTest();
    }
  }, [open, stopMicTest, stopCamTest]);

  // Real Web Audio output test using synthesizer chime and device routing
  const testAudioOutput = async () => {
    if (isTestingOutput) return;
    setIsTestingOutput(true);

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) {
        throw new Error('Web Audio is not supported in this browser environment.');
      }

      const ctx = new AudioCtx();
      let usedSink = false;

      // Handle setSinkId if supported by the browser on AudioContext
      if ('setSinkId' in ctx && selectedOutputDevice) {
        try {
          await (ctx as any).setSinkId(selectedOutputDevice);
          usedSink = true;
        } catch (sinkErr) {
          console.warn('[AudioTest] setSinkId notice (using system default):', sinkErr);
        }
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Play synthesized dual-tone harmonic chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.25); // G5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc2.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.25); // C6

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.6);
      osc2.stop(ctx.currentTime + 0.6);

      setTimeout(() => {
        ctx.close().catch(() => {});
        setIsTestingOutput(false);
      }, 650);

      const deviceLabel = audioOutputDevices.find((d) => d.deviceId === selectedOutputDevice)?.label;
      toast({
        title: 'Audio Output Tested',
        description: usedSink && deviceLabel
          ? `Sound check played to "${deviceLabel}".`
          : 'Sound check played through active playback output.',
        type: 'success',
        duration: 2500,
      });
    } catch (err: any) {
      setIsTestingOutput(false);
      toast({
        title: 'Playback Test Failed',
        description: err?.message || 'Could not initialize audio playback output.',
        type: 'error',
      });
    }
  };

  // Start live microphone test with AudioWorklet DSP & dual VU meters
  const startMicTest = async () => {
    if (isTestingMic) {
      stopMicTest();
      return;
    }
    try {
      const policy = noiseMode === 'off' ? 'off' : 'rnnoise';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getUserMediaAudioConstraints(policy, selectedInputDevice || null),
      });
      micTestStreamRef.current = stream;

      const engine = AudioEngine.getInstance();
      const ctx = await engine.getAudioContext();
      if (!ctx) return;
      micTestAudioCtxRef.current = ctx;

      const pipeline = await createGcpNoisePipeline(stream, noiseMode);
      micTestPipelineRef.current = pipeline;

      const rawSource = ctx.createMediaStreamSource(stream);
      const rawAnalyser = ctx.createAnalyser();
      rawAnalyser.fftSize = 256;
      rawSource.connect(rawAnalyser);

      const cleanStream = pipeline ? pipeline.outputStream : stream;
      const cleanSource = ctx.createMediaStreamSource(cleanStream);
      const cleanAnalyser = ctx.createAnalyser();
      cleanAnalyser.fftSize = 256;
      cleanSource.connect(cleanAnalyser);

      const rawBuffer = new Uint8Array(rawAnalyser.frequencyBinCount);
      const cleanBuffer = new Uint8Array(cleanAnalyser.frequencyBinCount);
      setIsTestingMic(true);

      let roomNoiseAccum = 0;
      let roomNoiseFrames = 0;

      const updateLevel = () => {
        rawAnalyser.getByteFrequencyData(rawBuffer);
        cleanAnalyser.getByteFrequencyData(cleanBuffer);

        let rawSum = 0;
        for (let i = 0; i < rawBuffer.length; i++) rawSum += rawBuffer[i];
        const rawAvg = rawSum / rawBuffer.length;
        const rawNorm = Math.min(100, Math.round((rawAvg / 128) * 100));
        setMicLevel(rawNorm);

        let cleanSum = 0;
        for (let i = 0; i < cleanBuffer.length; i++) cleanSum += cleanBuffer[i];
        const cleanAvg = cleanSum / cleanBuffer.length;
        const cleanNorm = Math.min(100, Math.round((cleanAvg / 128) * 100));
        setMicLevelClean(cleanNorm);

        // Analyze ambient background room noise
        roomNoiseAccum += rawNorm;
        roomNoiseFrames++;
        if (roomNoiseFrames >= 45) {
          const avgFloor = roomNoiseAccum / roomNoiseFrames;
          if (avgFloor > 35) {
            setRoomNoiseAdvice('High ambient noise (fans/typing) detected — Strong mode recommended');
          } else if (avgFloor > 18) {
            setRoomNoiseAdvice('Moderate background noise — Balanced mode is optimal');
          } else {
            setRoomNoiseAdvice('Quiet room acoustics — Light or Balanced mode recommended');
          }
          roomNoiseAccum = 0;
          roomNoiseFrames = 0;
        }

        micTestAnimRef.current = requestAnimationFrame(updateLevel);
      };
      micTestAnimRef.current = requestAnimationFrame(updateLevel);
    } catch (e) {
      console.warn('Microphone test access error:', e);
      toast({ title: 'Microphone Inaccessible', description: 'Could not access the selected microphone device.', type: 'error' });
      stopMicTest();
    }
  };

  // Record 5s sample to hear what squadmates will hear
  const handleRecordSample = async () => {
    if (isRecordingSample) return;
    try {
      const policy = noiseMode === 'off' ? 'off' : 'rnnoise';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getUserMediaAudioConstraints(policy, selectedInputDevice || null),
      });
      const pipeline = await createGcpNoisePipeline(stream, noiseMode);
      const recordStream = pipeline ? pipeline.outputStream : stream;

      const mediaRecorder = new MediaRecorder(recordStream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setSampleAudioUrl(url);
        setIsRecordingSample(false);
        stream.getTracks().forEach((t) => t.stop());
        if (pipeline) pipeline.cleanup();
      };

      mediaRecorder.start();
      setIsRecordingSample(true);
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 5000);
    } catch (e) {
      console.warn('Record sample error:', e);
      setIsRecordingSample(false);
    }
  };

  // Start live camera test
  const startCamTest = async () => {
    if (isTestingCam) {
      stopCamTest();
      return;
    }
    try {
      let stream: MediaStream;
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedCamDevice ? { deviceId: { exact: selectedCamDevice } } : true,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceErr) {
        console.warn('Specific camera constraint failed, attempting generic video: true', deviceErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      camTestStreamRef.current = stream;
      setIsTestingCam(true);
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream;
        camVideoRef.current.play().catch(() => {});
      }
    } catch (e) {
      console.warn('Webcam test access error:', e);
      toast({
        title: 'Webcam Inaccessible',
        description: 'Could not access camera. Please check camera permissions in your browser or ensure no other app is using it.',
        type: 'error',
      });
      stopCamTest();
    }
  };

  const handleSelectNoiseMode = (newMode: NoiseCancellationMode) => {
    setNoiseMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('nexus_noise_suppression_mode', newMode);
      localStorage.setItem('nexus_noise_suppression', String(newMode !== 'off'));
      window.dispatchEvent(new CustomEvent('gcp_noise_mode_changed', { detail: { mode: newMode } }));
    }
    toast({
      title: newMode === 'off' ? 'Noise Suppression Disabled' : `GCP AI Suppression: ${newMode.toUpperCase()}`,
      description:
        newMode === 'off'
          ? 'Raw microphone pass-through active.'
          : newMode === 'light'
          ? 'Light suppression active: gentle floor, preserves quiet whispers.'
          : newMode === 'strong'
          ? 'Strong suppression active: maximum fan and mechanical key filtering.'
          : 'Balanced suppression active: optimal vocal clarity with natural warmth.',
      type: 'info',
    });
  };

  const handleSaveAudio = async () => {
    setIsSaving(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('nexus_noise_suppression_mode', noiseMode);
        localStorage.setItem('nexus_noise_suppression', String(noiseMode !== 'off'));
        localStorage.setItem(
          'nexus_audio_prefs',
          JSON.stringify({
            pushToTalk,
            pushToTalkKey: 'KeyV',
          })
        );
      }
      await updateSettings({
        sound_effects_enabled: soundEffects,
        push_to_talk_enabled: pushToTalk,
        input_volume: inputVol,
        output_volume: outputVol,
      });
      toast({
        title: 'Voice & Audio Saved',
        description: `GCP Studio AI Noise Suppression (${noiseMode.toUpperCase()}) saved. Preferences updated.`,
        type: 'success',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (activeTab === 'studio') {
    return (
      <div className="space-y-6 max-w-3xl w-full pb-16">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span>Voice & Video Studio</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30 font-medium">
              Hardware Linked
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select your microphone, headphones, and camera. Test audio levels and preview webcam.
          </p>
        </div>

        {/* Hardware Device Pickers */}
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-foreground/90 mb-1 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-primary" />
              <span>Microphone Input Device</span>
            </label>
            <select
              value={selectedInputDevice}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedInputDevice(val);
                try {
                  localStorage.setItem('nexus_audio_input_device', val);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('nexus_input_device_changed', { detail: { deviceId: val } })
                    );
                  }
                } catch {}
                if (isTestingMic) stopMicTest();
              }}
              className="w-full bg-card border border-border text-foreground text-xs rounded-xl p-2.5 focus:border-primary focus:outline-none"
            >
              {audioInputDevices.length === 0 ? (
                <option value="">Default Microphone</option>
              ) : (
                audioInputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Live Mic Test & Dual VU Meters */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-2">
                  <span>Microphone Studio Monitor</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                    {noiseMode.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">Test mic gain, noise reduction, and listen to processed audio</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleRecordSample}
                  disabled={isRecordingSample}
                  variant="outline"
                  className={cn(
                    'text-xs rounded-lg border-border h-8 px-2.5',
                    isRecordingSample && 'bg-warning/20 text-warning border-warning/40 animate-pulse'
                  )}
                  title="Record 5 seconds of clean audio to hear what squadmates will hear"
                >
                  <Radio className="w-3 h-3 mr-1" />
                  <span>{isRecordingSample ? 'Recording (5s)...' : 'Record 5s'}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={startMicTest}
                  variant="outline"
                  className={cn(
                    'text-xs rounded-lg border-border h-8 px-3',
                    isTestingMic ? 'bg-danger/10 text-danger border-danger/30' : 'hover:bg-primary/10'
                  )}
                >
                  {isTestingMic ? (
                    <>
                      <Square className="w-3 h-3 mr-1.5" /> Stop Test
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 mr-1.5" /> Test Mic
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Dual VU Meters: Raw vs Processed */}
            <div className="space-y-2 pt-1">
              {/* Raw Microphone Input */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Input Level (Raw Microphone)</span>
                  <span className="font-mono">{micLevel}%</span>
                </div>
                <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden p-0.5 border border-border">
                  <div
                    className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-success via-warning to-danger"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>

              {/* Processed Clean Output */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-success">
                  <span>Clean Output (What others hear)</span>
                  <span className="font-mono">{micLevelClean}%</span>
                </div>
                <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden p-0.5 border border-border">
                  <div
                    className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-success to-primary"
                    style={{ width: `${micLevelClean}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Room Noise Advice */}
            {roomNoiseAdvice && (
              <div className="text-xs p-2 rounded-lg bg-surface-default border border-border text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary shrink-0" />
                <span>{roomNoiseAdvice}</span>
              </div>
            )}

            {/* 5-second sample playback */}
            {sampleAudioUrl && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-success/10 border border-success/20 text-xs">
                <div className="flex items-center gap-2 text-success font-medium">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>5s Sample Ready — Listen to your clean voice</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (sampleAudioRef.current) {
                      if (isPlayingSample) {
                        sampleAudioRef.current.pause();
                        setIsPlayingSample(false);
                      } else {
                        sampleAudioRef.current.play();
                        setIsPlayingSample(true);
                      }
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-success/20 hover:bg-success/30 text-success text-xs font-semibold flex items-center gap-1"
                >
                  {isPlayingSample ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlayingSample ? 'Stop' : 'Play Back'}</span>
                </button>
                <audio
                  ref={sampleAudioRef}
                  src={sampleAudioUrl}
                  onEnded={() => setIsPlayingSample(false)}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Webcam Hardware Device Picker */}
          <div>
            <label className="block text-xs font-semibold text-foreground/90 mb-1 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-primary" />
              <span>Camera / Video Device</span>
            </label>
            <select
              value={selectedCamDevice}
              onChange={(e) => {
                setSelectedCamDevice(e.target.value);
                if (isTestingCam) stopCamTest();
              }}
              className="w-full bg-card border border-border text-foreground text-xs rounded-xl p-2.5 focus:border-primary focus:outline-none"
            >
              {videoDevices.length === 0 ? (
                <option value="">Default Webcam</option>
              ) : (
                videoDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Live Webcam Preview Studio */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-foreground">Webcam Preview Studio</div>
                <div className="text-xs text-muted-foreground">Test camera exposure and lens framing</div>
              </div>
              <Button
                size="sm"
                onClick={startCamTest}
                variant="outline"
                className={cn(
                  'text-xs rounded-lg border-border h-8 px-3',
                  isTestingCam ? 'bg-danger/10 text-danger border-danger/30' : 'hover:bg-primary/10'
                )}
              >
                {isTestingCam ? (
                  <>
                    <Square className="w-3 h-3 mr-1.5" /> Stop Camera
                  </>
                ) : (
                  <>
                    <Camera className="w-3 h-3 mr-1.5" /> Test Camera
                  </>
                )}
              </Button>
            </div>

            <div className="relative aspect-video w-full rounded-xl bg-black border border-border overflow-hidden flex items-center justify-center">
              <video
                ref={camVideoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  (e.currentTarget as HTMLVideoElement).play().catch(() => {});
                }}
                className={cn('w-full h-full object-cover', !isTestingCam && 'hidden')}
              />
              {!isTestingCam && (
                <div className="flex flex-col items-center justify-center text-muted-foreground/60 space-y-1">
                  <Camera className="w-8 h-8 opacity-40" />
                  <span className="text-xs">Webcam preview offline</span>
                </div>
              )}
              {isTestingCam && (
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-xs font-mono text-success border border-success/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping" />
                  <span>CAMERA ACTIVE (1080p)</span>
                </div>
              )}
            </div>
          </div>

          {/* Audio Output Speaker Picker */}
          <div>
            <label className="block text-xs font-semibold text-foreground/90 mb-1 flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5 text-primary" />
              <span>Playback / Headphone Output</span>
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={selectedOutputDevice}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedOutputDevice(val);
                  try {
                    localStorage.setItem('nexus_audio_output_device', val);
                  } catch {}
                }}
                className="flex-1 bg-card border border-border text-foreground text-xs rounded-xl p-2.5 focus:border-primary focus:outline-none"
              >
                {audioOutputDevices.length === 0 ? (
                  <option value="">Default Audio Output (System Default)</option>
                ) : (
                  audioOutputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Speaker ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                onClick={testAudioOutput}
                disabled={isTestingOutput}
                className={cn(
                  'px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap',
                  isTestingOutput
                    ? 'bg-primary/20 border-primary text-primary animate-pulse'
                    : 'bg-surface-default border-border hover:bg-surface-hover text-foreground'
                )}
                title="Play live test chime through this output device"
              >
                <Volume2 className={cn('w-3.5 h-3.5', isTestingOutput && 'animate-bounce')} />
                <span>{isTestingOutput ? 'Testing...' : 'Test Audio'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // activeTab === 'audio'
  return (
    <div className="space-y-6 max-w-3xl w-full pb-16">
      <div>
        <h3 className="text-lg font-bold text-foreground">Audio Processing & DSP</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Acoustic echo cancellation, neural noise suppression, and master volume balances.
        </p>
      </div>

      {/* GCP Studio AI Neural Noise Suppression Selector */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span>GCP Studio Neural Noise Suppression</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-success/20 text-success font-bold border border-success/30">
                RNNoise WASM
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Client-side WebAssembly neural network. Removes computer fans, mechanical typing, and room noise in real-time.
            </div>
          </div>
          <div className="text-xs font-mono text-muted-foreground bg-surface-default px-2.5 py-1 rounded-lg border border-border">
            0ms Cloud Latency • 100% Private
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-1">
          {/* Off Mode */}
          <div
            onClick={() => handleSelectNoiseMode('off')}
            className={cn(
              'p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
              noiseMode === 'off'
                ? 'bg-danger/10 border-danger/40 ring-1 ring-danger'
                : 'bg-surface-default border-border hover:bg-surface-hover'
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-foreground">Off</span>
                <span className={cn('w-2 h-2 rounded-full', noiseMode === 'off' ? 'bg-danger' : 'bg-white/20')} />
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                Raw mic pass-through. 0ms DSP.
              </p>
            </div>
          </div>

          {/* Light Mode */}
          <div
            onClick={() => handleSelectNoiseMode('light')}
            className={cn(
              'p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
              noiseMode === 'light'
                ? 'bg-primary-subtle border-primary/30 ring-1 ring-ring'
                : 'bg-surface-default border-border hover:bg-surface-hover'
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-foreground">Light</span>
                <span className={cn('w-2 h-2 rounded-full', noiseMode === 'light' ? 'bg-primary' : 'bg-white/20')} />
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                -26 dB floor. Preserves quiet whispers.
              </p>
            </div>
            <span className="text-xs text-primary font-bold mt-1.5">Gentle</span>
          </div>

          {/* Balanced Mode */}
          <div
            onClick={() => handleSelectNoiseMode('balanced')}
            className={cn(
              'p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
              noiseMode === 'balanced'
                ? 'bg-primary/15 border-primary/50 ring-1 ring-primary/40'
                : 'bg-surface-default border-border hover:bg-surface-hover'
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-foreground">Balanced</span>
                <span className={cn('w-2 h-2 rounded-full', noiseMode === 'balanced' ? 'bg-primary' : 'bg-white/20')} />
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                -36 dB floor. Natural voice warmth.
              </p>
            </div>
            <span className="text-xs text-primary font-bold mt-1.5">Recommended</span>
          </div>

          {/* Strong Mode */}
          <div
            onClick={() => handleSelectNoiseMode('strong')}
            className={cn(
              'p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between text-left',
              noiseMode === 'strong'
                ? 'bg-success/15 border-success/50 ring-1 ring-success'
                : 'bg-surface-default border-border hover:bg-surface-hover'
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-foreground">Strong</span>
                <span className={cn('w-2 h-2 rounded-full', noiseMode === 'strong' ? 'bg-success' : 'bg-white/20')} />
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                -40 dB floor. Eradicates loud typing & fans.
              </p>
            </div>
            <span className="text-xs text-success font-bold mt-1.5">Max Cut</span>
          </div>
        </div>

        {/* Real-Time Engine Diagnostic Badge */}
        <div className="mt-3 p-2.5 rounded-xl bg-black/30 border border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                noiseMode === 'off'
                  ? 'bg-status-offline'
                  : liveEngineStatus.status === 'ready'
                  ? 'bg-success animate-pulse'
                  : liveEngineStatus.status === 'fallback'
                  ? 'bg-warning'
                  : 'bg-primary'
              )}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-xs">
                  {noiseMode === 'off'
                    ? 'Processing Disabled (Raw Pass-Through)'
                    : liveEngineStatus.engine === 'rnnoise-wasm'
                    ? 'RNNoise Neural Engine (48 kHz WASM AudioWorklet)'
                    : liveEngineStatus.engine === 'browser-native'
                    ? `Browser Fallback (${liveEngineStatus.fallbackReason || 'Native Processing'})`
                    : 'Audio Engine Initializing'}
                </span>
                {liveEngineStatus.status === 'fallback' && noiseMode !== 'off' && (
                  <button
                    type="button"
                    onClick={() => handleSelectNoiseMode(noiseMode)}
                    className="px-2 py-0.5 rounded bg-warning/20 hover:bg-warning/30 text-warning font-medium text-xs border border-warning/30 transition-colors"
                  >
                    Retry RNNoise
                  </button>
                )}
              </div>
              {liveEngineStatus.fallbackReason && noiseMode !== 'off' && liveEngineStatus.status === 'fallback' && (
                <p className="text-xs text-warning/90 leading-tight mt-0.5 font-mono">
                  Reason: {liveEngineStatus.fallbackReason}
                </p>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
            {noiseMode === 'off' ? '0 ms' : '~14 ms latency | 100% local'}
          </span>
        </div>
      </div>

      {/* Push to talk vs Voice Activity */}
      <div
        onClick={() => {
          const nextPtt = !pushToTalk;
          setPushToTalk(nextPtt);
          if (typeof window !== 'undefined') {
            localStorage.setItem(
              'nexus_audio_prefs',
              JSON.stringify({
                pushToTalk: nextPtt,
                pushToTalkKey: 'KeyV',
              })
            );
          }
          updateSettings({ push_to_talk_enabled: nextPtt }).catch(() => {});
          toast({
            title: nextPtt ? 'Push-to-Talk Enabled' : 'Voice Activity Enabled',
            description: nextPtt
              ? 'Hold Space or V key to transmit microphone.'
              : 'Microphone is active on speech detection.',
            type: 'info',
            duration: 2000,
          });
        }}
        className={cn(
          'flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all',
          pushToTalk
            ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
            : 'bg-surface-default border-border hover:bg-surface-hover'
        )}
      >
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-foreground flex items-center gap-2">
            <span>Push-to-Talk (PTT) Mode</span>
            {pushToTalk && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono font-semibold">
                SPACE or V
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Hold keyboard hotkey (<kbd className="px-1 py-0.5 rounded bg-surface-active text-foreground font-mono text-xs">Space</kbd> or <kbd className="px-1 py-0.5 rounded bg-surface-active text-foreground font-mono text-xs">V</kbd>) to transmit mic audio.
            {pushToTalk && (
              <span className="block text-xs text-primary/80 mt-1">
                💡 Gaming Tip: When playing external games outside the browser window, web browsers sandbox keyboard input. Switch to Voice Activity with neural noise suppression for seamless background gaming audio!
              </span>
            )}
          </div>
        </div>
        <div
          className={cn(
            'w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5',
            pushToTalk ? 'bg-primary' : 'bg-white/20'
          )}
        >
          <div
            className={cn(
              'w-5 h-5 rounded-full bg-white shadow-md transition-transform',
              pushToTalk ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </div>
      </div>

      {/* Input & Output Volume Sliders */}
      <div className="space-y-4 pt-2">
        <div>
          <div className="flex justify-between text-xs font-semibold text-foreground/90 mb-1.5">
            <span>Microphone Input Gain</span>
            <span className="font-mono text-primary">{inputVol}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={inputVol}
            onChange={(e) => setInputVol(Number(e.target.value))}
            className="w-full accent-primary h-1.5 bg-surface-active rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs font-semibold text-foreground/90 mb-1.5">
            <span>Squad Call Output Volume</span>
            <span className="font-mono text-primary">{outputVol}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="150"
            value={outputVol}
            onChange={(e) => setOutputVol(Number(e.target.value))}
            className="w-full accent-primary h-1.5 bg-surface-active rounded-lg cursor-pointer"
          />
        </div>
      </div>

      <div className="pt-2">
        <Button
          onClick={handleSaveAudio}
          disabled={isSaving}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save Audio Settings</span>
        </Button>
      </div>
    </div>
  );
}
