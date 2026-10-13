'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { SoundboardClip, soundboardEngine } from '@/lib/soundboard/audio-engine';

export interface VoiceParticipant {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  role?: string;
  is_speaking: boolean;
  is_muted: boolean;
  is_deafened: boolean;
  is_camera_on: boolean;
  is_screen_sharing: boolean;
  audio_level: number;
}

export function useServerVoice(channelId: string, serverId: string) {
  const { user, profile } = useAuth();

  const [isVoiceConnected, setIsVoiceConnected] = React.useState(false);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isDeafened, setIsDeafened] = React.useState(false);
  const [isCameraOn, setIsCameraOn] = React.useState(false);
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = React.useState(true);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [audioLevel, setAudioLevel] = React.useState(0);

  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = React.useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = React.useState<MediaStream | null>(null);

  const [remoteParticipants, setRemoteParticipants] = React.useState<VoiceParticipant[]>([]);

  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const animFrameRef = React.useRef<number | null>(null);
  const realtimeChannelRef = React.useRef<any>(null);

  const isMicMutedRef = React.useRef(isMicMuted);
  React.useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Broadcast state to Supabase Realtime presence channel
  const broadcastMyVoiceState = React.useCallback(
    (customState?: Partial<VoiceParticipant>) => {
      if (!realtimeChannelRef.current || !user) return;
      const state: VoiceParticipant = {
        id: user.id,
        user_id: user.id,
        display_name: profile?.display_name || user.email?.split('@')[0] || 'Squadmate',
        avatar_url: profile?.avatar_url || null,
        is_speaking: isSpeaking,
        is_muted: isMicMuted,
        is_deafened: isDeafened,
        is_camera_on: isCameraOn,
        is_screen_sharing: isScreenSharing,
        audio_level: audioLevel,
        ...customState,
      };

      try {
        realtimeChannelRef.current.track(state);
      } catch {}
    },
    [user, profile, isSpeaking, isMicMuted, isDeafened, isCameraOn, isScreenSharing, audioLevel]
  );

  // Sync speaking status to peers over Realtime Presence
  const prevSpeakingRef = React.useRef(false);
  React.useEffect(() => {
    if (isVoiceConnected && prevSpeakingRef.current !== isSpeaking) {
      prevSpeakingRef.current = isSpeaking;
      broadcastMyVoiceState({ is_speaking: isSpeaking, audio_level: audioLevel });
    }
  }, [isSpeaking, isVoiceConnected, broadcastMyVoiceState, audioLevel]);

  // Stop all audio & video streams cleanly
  const stopAllMediaStreams = React.useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
    }
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
    }

    setIsSpeaking(false);
    setAudioLevel(0);
    setIsCameraOn(false);
    setIsScreenSharing(false);
  }, [localStream, videoStream, screenStream]);

  // Connect user to voice lounge (Real WebRTC audio capture)
  const connectVoice = React.useCallback(async () => {
    if (isVoiceConnected || isConnecting) return;
    setIsConnecting(true);

    try {
      // 1. Request actual microphone stream with noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: isNoiseSuppressionEnabled,
          autoGainControl: true,
        },
        video: false,
      });

      setLocalStream(stream);

      // 2. Set up live Web Audio API speech analyzer with time-domain RMS
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        // Keep Chrome/Edge audio processing awake without speaker feedback loop
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        source.connect(silentGain);
        silentGain.connect(audioCtx.destination);

        analyserRef.current = analyser;

        const timeData = new Uint8Array(analyser.fftSize);

        const checkSpeaking = () => {
          if (!analyserRef.current) return;
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }

          if (isMicMutedRef.current) {
            setAudioLevel(0);
            setIsSpeaking(false);
            animFrameRef.current = requestAnimationFrame(checkSpeaking);
            return;
          }

          analyserRef.current.getByteTimeDomainData(timeData);

          // Calculate Root Mean Square (RMS) of audio waveform
          let sumSquares = 0;
          for (let i = 0; i < timeData.length; i++) {
            const sample = (timeData[i] - 128) / 128;
            sumSquares += sample * sample;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          // Scale RMS to 0 - 100 percentage.
          const normalized = Math.min(100, Math.round(rms * 350));
          setAudioLevel(normalized);

          // Threshold for speaking detection (sensitivity)
          const speaking = normalized > 5;
          setIsSpeaking(speaking);

          animFrameRef.current = requestAnimationFrame(checkSpeaking);
        };

        checkSpeaking();
      }

      // 3. Connect to Supabase Realtime presence channel for this voice lounge
      const supabase = getBrowserClient();
      if (supabase && user) {
        const roomChannel = supabase.channel(`voice_room_${channelId}`, {
          config: { presence: { key: user.id } },
        });

        roomChannel
          .on('presence', { event: 'sync' }, () => {
            const state = roomChannel.presenceState();
            const peers: VoiceParticipant[] = [];
            Object.keys(state).forEach((key) => {
              const entries = state[key] as any[];
              if (entries && entries[0] && entries[0].user_id !== user.id) {
                peers.push(entries[0]);
              }
            });
            setRemoteParticipants(peers);
          })
          .on('broadcast', { event: 'soundboard' }, ({ payload }: { payload: SoundboardClip }) => {
            if (payload && !isDeafened) {
              soundboardEngine.playClip(payload);
            }
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              roomChannel.track({
                id: user.id,
                user_id: user.id,
                display_name: profile?.display_name || user.email?.split('@')[0] || 'Squadmate',
                avatar_url: profile?.avatar_url || null,
                is_speaking: false,
                is_muted: isMicMuted,
                is_deafened: isDeafened,
                is_camera_on: false,
                is_screen_sharing: false,
                audio_level: 0,
              });
            }
          });

        realtimeChannelRef.current = roomChannel;
      }

      setIsVoiceConnected(true);
    } catch (err) {
      console.error('Failed to capture audio device:', err);
      // Fallback: connect in visual mode even if mic is denied
      setIsVoiceConnected(true);
    } finally {
      setIsConnecting(false);
    }
  }, [channelId, isVoiceConnected, isConnecting, isNoiseSuppressionEnabled, isMicMuted, isDeafened, user, profile]);

  // Disconnect from voice lounge
  const disconnectVoice = React.useCallback(() => {
    stopAllMediaStreams();
    if (realtimeChannelRef.current) {
      try {
        realtimeChannelRef.current.untrack();
        const supabase = getBrowserClient();
        if (supabase) {
          supabase.removeChannel(realtimeChannelRef.current);
        }
      } catch {}
      realtimeChannelRef.current = null;
    }
    setIsVoiceConnected(false);
    setRemoteParticipants([]);
  }, [stopAllMediaStreams]);

  // Toggle microphone
  const toggleMic = React.useCallback(() => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);

    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (nextMuted) {
      setIsSpeaking(false);
      setAudioLevel(0);
    }

    broadcastMyVoiceState({ is_muted: nextMuted, is_speaking: false });
  }, [isMicMuted, localStream, broadcastMyVoiceState]);

  // Toggle deafen
  const toggleDeafen = React.useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    if (nextDeafened && !isMicMuted) {
      toggleMic();
    }
    broadcastMyVoiceState({ is_deafened: nextDeafened });
  }, [isDeafened, isMicMuted, toggleMic, broadcastMyVoiceState]);

  // Toggle camera
  const toggleCamera = React.useCallback(async () => {
    if (isCameraOn) {
      if (videoStream) {
        videoStream.getTracks().forEach((t) => t.stop());
        setVideoStream(null);
      }
      setIsCameraOn(false);
      broadcastMyVoiceState({ is_camera_on: false });
    } else {
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false,
        });
        setVideoStream(vStream);
        setIsCameraOn(true);
        broadcastMyVoiceState({ is_camera_on: true });
      } catch (err) {
        console.warn('Failed to start webcam:', err);
      }
    }
  }, [isCameraOn, videoStream, broadcastMyVoiceState]);

  // Toggle screen share
  const toggleScreenShare = React.useCallback(async () => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      broadcastMyVoiceState({ is_screen_sharing: false });
    } else {
      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        // Detect when user clicks "Stop sharing" in browser native UI
        const videoTrack = sStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            setScreenStream(null);
            setIsScreenSharing(false);
            broadcastMyVoiceState({ is_screen_sharing: false });
          };
        }

        setScreenStream(sStream);
        setIsScreenSharing(true);
        broadcastMyVoiceState({ is_screen_sharing: true });
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    }
  }, [isScreenSharing, screenStream, broadcastMyVoiceState]);

  // Toggle AI Noise Suppression
  const toggleNoiseSuppression = React.useCallback(() => {
    const next = !isNoiseSuppressionEnabled;
    setIsNoiseSuppressionEnabled(next);

    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        try {
          track.applyConstraints({
            noiseSuppression: next,
            echoCancellation: true,
          });
        } catch {}
      });
    }
  }, [isNoiseSuppressionEnabled, localStream]);

  // Broadcast soundboard clip
  const broadcastSoundboard = React.useCallback(
    (clip: SoundboardClip) => {
      soundboardEngine.playClip(clip);
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: 'broadcast',
          event: 'soundboard',
          payload: clip,
        });
      }
    },
    []
  );

  // Auto disconnect when unmounting or switching channel
  React.useEffect(() => {
    return () => {
      stopAllMediaStreams();
      if (realtimeChannelRef.current) {
        try {
          realtimeChannelRef.current.untrack();
          const supabase = getBrowserClient();
          if (supabase) {
            supabase.removeChannel(realtimeChannelRef.current);
          }
        } catch {}
      }
    };
  }, [channelId, stopAllMediaStreams]);

  return {
    isVoiceConnected,
    isConnecting,
    isMicMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    isNoiseSuppressionEnabled,
    isSpeaking,
    audioLevel,
    localStream,
    videoStream,
    screenStream,
    remoteParticipants,
    connectVoice,
    disconnectVoice,
    toggleMic,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    toggleNoiseSuppression,
    broadcastSoundboard,
  };
}
