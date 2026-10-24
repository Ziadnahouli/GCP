'use client';

import '@/lib/webrtc/safe-constraints';
import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { SoundboardClip, soundboardEngine } from '@/lib/soundboard/audio-engine';
import { DEFAULT_RTC_CONFIG, cleanIceCandidate } from '@/lib/webrtc/ice-config';
import { createGcpNoisePipeline, GcpNoisePipeline, NoiseCancellationMode } from '@/lib/webrtc/gcp-noise-cancellation';
import { getUserMediaAudioConstraints, applyProcessingPolicy } from '@/lib/webrtc/audio-processing-policy';
import { applyGcpOptimalConstraints } from '@/lib/webrtc/safe-constraints';
import { audioSessionCoordinator } from '@/lib/webrtc/audio-session-coordinator';
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  RemoteTrack,
  RemoteParticipant,
} from 'livekit-client';

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

export interface ServerVoiceContextType {
  activeServerId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
  activeServerName: string | null;
  isVoiceConnected: boolean;
  isConnecting: boolean;
  isLiveKitActive: boolean;
  isKrispActive: boolean;
  isMicMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isNoiseSuppressionEnabled: boolean;
  noiseSuppressionMode: NoiseCancellationMode;
  isSpeaking: boolean;
  audioLevel: number;
  localStream: MediaStream | null;
  videoStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteParticipants: VoiceParticipant[];
  remoteVideoStreams: Map<string, MediaStream>;
  channelOccupants: Map<string, VoiceParticipant[]>;

  joinVoiceChannel: (
    serverId: string,
    channelId: string,
    serverName?: string,
    channelName?: string
  ) => Promise<void>;
  disconnectVoice: () => void;
  toggleMic: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleNoiseSuppression: () => void;
  setNoiseSuppressionMode: (mode: NoiseCancellationMode) => void;
  broadcastSoundboard: (clip: SoundboardClip) => void;
  incomingVolume: number;
  setIncomingVolume: (volume: number) => Promise<void>;
  setMicMutedExplicit: (muted: boolean) => Promise<void>;
  setDeafenedExplicit: (deafened: boolean) => Promise<void>;
  forceMute: () => void;
}

const ServerVoiceContext = React.createContext<ServerVoiceContextType | null>(null);

function isPushToTalkEnabled(settings?: any): boolean {
  if (settings?.push_to_talk_enabled) return true;
  try {
    const rawPrefs = localStorage.getItem('nexus_audio_prefs');
    if (rawPrefs) {
      const prefs = JSON.parse(rawPrefs);
      return Boolean(prefs?.pushToTalk);
    }
  } catch {}
  return false;
}

export function ServerVoiceProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, settings } = useAuth();

  const [activeServerId, setActiveServerId] = React.useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = React.useState<string | null>(null);
  const [activeChannelName, setActiveChannelName] = React.useState<string | null>(null);
  const [activeServerName, setActiveServerName] = React.useState<string | null>(null);

  const [isVoiceConnected, setIsVoiceConnected] = React.useState(false);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isLiveKitActive, setIsLiveKitActive] = React.useState(false);
  const [isKrispActive, setIsKrispActive] = React.useState(false);
  const livekitRoomRef = React.useRef<Room | null>(null);
  const krispProcessorRef = React.useRef<any>(null);
  const mediaTransportRef = React.useRef<'livekit' | 'webrtc' | 'none'>('none');
  const currentVoiceSessionIdRef = React.useRef<string | null>(null);
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isDeafened, setIsDeafened] = React.useState(false);
  const [incomingVolume, setIncomingVolumeState] = React.useState(() => {
    return settings?.output_volume ?? 100;
  });
  const incomingVolumeRef = React.useRef(settings?.output_volume ?? 100);

  React.useEffect(() => {
    if (settings?.output_volume !== undefined && settings?.output_volume !== null) {
      incomingVolumeRef.current = settings.output_volume;
      setIncomingVolumeState(settings.output_volume);
    }
  }, [settings?.output_volume]);
  const disconnectGateRef = React.useRef(false);
  const [isCameraOn, setIsCameraOn] = React.useState(false);
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);
  const [noiseSuppressionMode, setNoiseSuppressionModeState] = React.useState<NoiseCancellationMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nexus_noise_suppression_mode');
      if (saved === 'off' || saved === 'balanced' || saved === 'strong') return saved;
      const legacy = localStorage.getItem('nexus_noise_suppression');
      if (legacy === 'false') return 'off';
    }
    return 'balanced';
  });
  const isNoiseSuppressionEnabled = noiseSuppressionMode !== 'off';
  const noiseSuppressionModeRef = React.useRef<NoiseCancellationMode>(noiseSuppressionMode);
  React.useEffect(() => {
    noiseSuppressionModeRef.current = noiseSuppressionMode;
  }, [noiseSuppressionMode]);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [audioLevel, setAudioLevel] = React.useState(0);

  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = React.useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = React.useState<MediaStream | null>(null);

  const [remoteParticipants, setRemoteParticipants] = React.useState<VoiceParticipant[]>([]);
  const [remoteVideoStreams, setRemoteVideoStreams] = React.useState<Map<string, MediaStream>>(new Map());
  const remoteVideoStreamsRef = React.useRef<Map<string, MediaStream>>(new Map());
  const dspPipelineRef = React.useRef<GcpNoisePipeline | null>(null);
  const [channelOccupants, setChannelOccupants] = React.useState<Map<string, VoiceParticipant[]>>(new Map());

  // Synchronous refs for WebRTC callbacks to prevent stale closures
  const userRef = React.useRef(user);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  const profileRef = React.useRef(profile);
  React.useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const settingsRef = React.useRef(settings);
  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const isMicMutedRef = React.useRef(isMicMuted);
  React.useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  const isDeafenedRef = React.useRef(isDeafened);
  React.useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  const isCameraOnRef = React.useRef(isCameraOn);
  React.useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  const isScreenSharingRef = React.useRef(isScreenSharing);
  React.useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  const isSpeakingRef = React.useRef(isSpeaking);
  React.useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const audioLevelRef = React.useRef(audioLevel);
  React.useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  const localStreamRef = React.useRef<MediaStream | null>(null);
  const videoStreamRef = React.useRef<MediaStream | null>(null);
  React.useEffect(() => {
    videoStreamRef.current = videoStream;
  }, [videoStream]);

  const screenStreamRef = React.useRef<MediaStream | null>(null);
  React.useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const animFrameRef = React.useRef<number | null>(null);

  const realtimeChannelRef = React.useRef<any>(null);
  const serverRealtimeChannelRef = React.useRef<any>(null);
  const activeChannelIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);
  const heartbeatIntervalRef = React.useRef<any>(null);

  // Mesh WebRTC maps
  const peersMapRef = React.useRef<Map<string, VoiceParticipant>>(new Map());
  const peerConnectionsRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = React.useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingCandidatesRef = React.useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const masterAudioContextRef = React.useRef<AudioContext | null>(null);
  const remoteAudioNodesRef = React.useRef<Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode }>>(new Map());

  // Helper to construct current user participant state
  const getMyVoiceState = React.useCallback((): VoiceParticipant => {
    const u = userRef.current;
    const p = profileRef.current;
    return {
      id: u?.id || '',
      user_id: u?.id || '',
      display_name: p?.display_name || u?.email?.split('@')[0] || 'Squadmate',
      avatar_url: p?.avatar_url || null,
      role: 'Squadmate',
      is_speaking: isSpeakingRef.current,
      is_muted: isMicMutedRef.current,
      is_deafened: isDeafenedRef.current,
      is_camera_on: isCameraOnRef.current,
      is_screen_sharing: isScreenSharingRef.current,
      audio_level: audioLevelRef.current,
    };
  }, []);

  // Update channel occupancy map for sidebar
  const updateChannelOccupantsMap = React.useCallback(
    (chanId: string, participants: VoiceParticipant[]) => {
      setChannelOccupants((prev) => {
        const next = new Map(prev);
        if (participants.length === 0) {
          next.delete(chanId);
        } else {
          next.set(chanId, participants);
        }
        return next;
      });
    },
    []
  );

  // Broadcast voice state update
  const broadcastMyVoiceState = React.useCallback(
    (customState?: Partial<VoiceParticipant>) => {
      const channel = realtimeChannelRef.current;
      const u = userRef.current;
      if (!channel || !u) return;

      const state: VoiceParticipant = {
        ...getMyVoiceState(),
        ...customState,
      };

      // Only call channel.track on persistent status changes (mute/deafen), never on transient speaking changes
      if (
        customState?.is_muted !== undefined ||
        customState?.is_deafened !== undefined ||
        customState?.role !== undefined
      ) {
        try {
          channel.track(state);
        } catch {}
      }

      try {
        channel.send({
          type: 'broadcast',
          event: 'voice_state_update',
          payload: state,
        });
      } catch {}

      if (serverRealtimeChannelRef.current && activeChannelIdRef.current) {
        try {
          serverRealtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'voice_state_update',
            payload: {
              channel_id: activeChannelIdRef.current,
              ...state,
            },
          });
        } catch {}
      }
    },
    [getMyVoiceState]
  );

  // LiveKit Authoritative Remote Audio Attacher
  // Binds remote tracks to DOM <audio> elements with gesture unlock retry logic
  const attachLiveKitAudioTrack = React.useCallback((track: RemoteTrack, peerId: string) => {
    if (track.kind !== Track.Kind.Audio) return;

    if (track.mediaStreamTrack) {
      track.mediaStreamTrack.enabled = !isDeafenedRef.current;
    }

    // 1. Remove previous DOM audio element if any
    const prevEl = audioElementsRef.current.get(peerId);
    if (prevEl) {
      try {
        track.detach(prevEl);
        prevEl.srcObject = null;
        prevEl.pause();
        prevEl.remove();
      } catch {}
      audioElementsRef.current.delete(peerId);
    }

    // 2. Attach track to a dedicated DOM audio element
    const el = track.attach();
    el.id = `remote-livekit-audio-${peerId}`;
    el.muted = isDeafenedRef.current;
    el.volume = isDeafenedRef.current ? 0 : incomingVolumeRef.current / 100;
    el.autoplay = true;
    el.setAttribute('playsinline', 'true');

    // Route audio to user-selected output device if supported
    try {
      const savedOutputId = localStorage.getItem('nexus_audio_output_device');
      if (savedOutputId && 'setSinkId' in el && typeof (el as any).setSinkId === 'function') {
        (el as any).setSinkId(savedOutputId).catch((sinkErr: any) => {
          console.warn('[LiveKit Voice] Output setSinkId notice:', sinkErr);
        });
      }
    } catch {}

    el.style.position = 'fixed';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';

    if (!document.body.contains(el)) {
      document.body.appendChild(el);
    }
    audioElementsRef.current.set(peerId, el);

    const playPromise = el.play();
    if (playPromise !== undefined) {
      playPromise.catch((playErr) => {
        console.warn('[LiveKit Voice] Remote audio autoplay deferred waiting for gesture:', playErr);
        if (livekitRoomRef.current) {
          livekitRoomRef.current.startAudio().catch(() => {});
        }
        const unlock = () => {
          if (livekitRoomRef.current) {
            livekitRoomRef.current.startAudio().catch(() => {});
          }
          audioElementsRef.current.forEach((aEl) => {
            aEl.muted = isDeafenedRef.current;
            aEl.play().catch(() => {});
          });
          window.removeEventListener('click', unlock);
          window.removeEventListener('keydown', unlock);
          window.removeEventListener('touchstart', unlock);
          window.removeEventListener('pointerdown', unlock);
        };
        window.addEventListener('click', unlock, { once: true, passive: true });
        window.addEventListener('keydown', unlock, { once: true, passive: true });
        window.addEventListener('touchstart', unlock, { once: true, passive: true });
        window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      });
    }
  }, []);

  // Clean up all WebRTC peer connections and DOM audio elements
  const cleanUpAllPeers = React.useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    peerConnectionsRef.current.clear();

    audioElementsRef.current.forEach((audio) => {
      try {
        audio.srcObject = null;
        audio.pause();
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
      } catch {}
    });
    audioElementsRef.current.clear();

    remoteAudioNodesRef.current.forEach(({ source, gain }) => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {}
    });
    remoteAudioNodesRef.current.clear();

    pendingCandidatesRef.current.clear();

    peersMapRef.current.clear();
    setRemoteParticipants([]);
    remoteVideoStreamsRef.current.clear();
    setRemoteVideoStreams(new Map());
  }, []);

  // WebRTC Mesh Peer Connection Manager
  const getOrCreatePeerConnection = React.useCallback(
    (remoteUserId: string, isInitiator: boolean): RTCPeerConnection | undefined => {
      const u = userRef.current;
      const channel = realtimeChannelRef.current;
      if (!u || !remoteUserId || remoteUserId === u.id) return undefined;

      // When LiveKit Cloud SFU is active, all audio/video is routed via SFU; skip P2P mesh WebRTC
      if (livekitRoomRef.current && (livekitRoomRef.current.state === 'connected' || livekitRoomRef.current.state === 'connecting')) {
        return undefined;
      }

      let pc = peerConnectionsRef.current.get(remoteUserId);
      if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
        return pc;
      }

      try {
        pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      } catch (err) {
        console.warn('[WebRTC] Failed to create RTCPeerConnection:', err);
        return undefined;
      }
      peerConnectionsRef.current.set(remoteUserId, pc);

      // Add local audio tracks if mic captured
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          try {
            pc!.addTrack(track, localStreamRef.current!);
          } catch {}
        });
      }

      // Pre-add video transceiver so camera/screenshare can be added or replaced dynamically
      try {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      } catch {}

      // Add local video/screen tracks if active
      if (screenStreamRef.current) {
        screenStreamRef.current.getVideoTracks().forEach((track) => {
          try {
            const senders = pc!.getSenders();
            const vSender = senders.find((s) => s.track?.kind === 'video');
            if (vSender) vSender.replaceTrack(track);
            else pc!.addTrack(track, screenStreamRef.current!);
          } catch {}
        });
      } else if (videoStreamRef.current) {
        videoStreamRef.current.getVideoTracks().forEach((track) => {
          try {
            const senders = pc!.getSenders();
            const vSender = senders.find((s) => s.track?.kind === 'video');
            if (vSender) vSender.replaceTrack(track);
            else pc!.addTrack(track, videoStreamRef.current!);
          } catch {}
        });
      }

      // Trickle ICE candidates
      pc.onicecandidate = (event) => {
        const cleaned = cleanIceCandidate(event.candidate?.toJSON());
        if (cleaned && realtimeChannelRef.current) {
          try {
            realtimeChannelRef.current.send({
              type: 'broadcast',
              event: 'voice_rtc_signal',
              payload: {
                from: u.id,
                to: remoteUserId,
                type: 'ice-candidate',
                candidate: cleaned,
              },
            });
          } catch {}
        }
      };

      // Handle receiving remote audio and video streams
      pc.ontrack = (event) => {
        if (event.track.kind === 'audio') {
          if (mediaTransportRef.current === 'livekit' || livekitRoomRef.current?.state === 'connected') {
            console.log('[WebRTC Lounge] Suppressing WebRTC track playback; LiveKit SFU is authoritative.');
            return;
          }
          console.log('[WebRTC] ontrack fired for peer (audio):', remoteUserId);
          const stream = (event.streams && event.streams[0]) || new MediaStream([event.track]);

          let audioEl = audioElementsRef.current.get(remoteUserId);
          if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `remote-voice-audio-${remoteUserId}`;
            audioEl.autoplay = true;
            audioEl.setAttribute('playsinline', 'true');
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl);
            audioElementsRef.current.set(remoteUserId, audioEl);
          }

          if (audioEl.srcObject !== stream) {
            audioEl.srcObject = stream;
          }
          audioEl.muted = isDeafenedRef.current;
          audioEl.volume = isDeafenedRef.current ? 0 : incomingVolumeRef.current / 100;

          try {
            const savedOutputId = localStorage.getItem('nexus_audio_output_device');
            if (savedOutputId && 'setSinkId' in audioEl && typeof (audioEl as any).setSinkId === 'function') {
              (audioEl as any).setSinkId(savedOutputId).catch(() => {});
            }
          } catch {}

          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('[WebRTC] Audio autoplay awaiting user click:', err);
            });
          }
        } else if (event.track.kind === 'video') {
          console.log('[WebRTC] ontrack fired for peer (video):', remoteUserId);
          const stream = (event.streams && event.streams[0]) || new MediaStream([event.track]);
          remoteVideoStreamsRef.current.set(remoteUserId, stream);
          setRemoteVideoStreams(new Map(remoteVideoStreamsRef.current));

          event.track.onended = () => {
            remoteVideoStreamsRef.current.delete(remoteUserId);
            setRemoteVideoStreams(new Map(remoteVideoStreamsRef.current));
          };
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
          peerConnectionsRef.current.delete(remoteUserId);
          remoteVideoStreamsRef.current.delete(remoteUserId);
          setRemoteVideoStreams(new Map(remoteVideoStreamsRef.current));
        }
      };

      if (isInitiator) {
        pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any)
          .then((offer) => pc!.setLocalDescription(offer))
          .then(() => {
            const ch = realtimeChannelRef.current || channel;
            if (ch && pc?.localDescription) {
              ch.send({
                type: 'broadcast',
                event: 'voice_rtc_signal',
                payload: {
                  from: u.id,
                  to: remoteUserId,
                  type: 'offer',
                  sdp: pc.localDescription,
                },
              });
            }
          })
          .catch((err) => {
            console.warn('[WebRTC] Error creating offer:', err);
          });
      }

      return pc;
    },
    []
  );

  // Handle incoming WebRTC signaling (Offer, Answer, ICE Candidate)
  const handleRtcSignal = React.useCallback(
    async (payload: any) => {
      const u = userRef.current;
      if (!u || !payload || payload.to !== u.id || !payload.from) return;
      if (mediaTransportRef.current === 'livekit' || livekitRoomRef.current?.state === 'connected') {
        // LiveKit SFU is authoritative; suppress duplicate P2P WebRTC connections
        return;
      }
      const fromPeerId = payload.from;

      try {
        if (payload.type === 'offer' && payload.sdp) {
          let pc = peerConnectionsRef.current.get(fromPeerId);
          if (!pc || pc.connectionState === 'closed') {
            pc = getOrCreatePeerConnection(fromPeerId, false);
          }
          if (!pc) return;

          // Attach local tracks before answering
          if (localStreamRef.current) {
            const senders = pc.getSenders();
            localStreamRef.current.getAudioTracks().forEach((track) => {
              if (!senders.some((s) => s.track === track)) {
                try {
                  pc!.addTrack(track, localStreamRef.current!);
                } catch {}
              }
            });
          }
          if (screenStreamRef.current || videoStreamRef.current) {
            const senders = pc.getSenders();
            const vTrack = screenStreamRef.current?.getVideoTracks()[0] || videoStreamRef.current?.getVideoTracks()[0];
            const vStream = screenStreamRef.current || videoStreamRef.current;
            if (vTrack && vStream) {
              const videoSender = senders.find((s) => s.track?.kind === 'video');
              if (videoSender) {
                videoSender.replaceTrack(vTrack);
              } else {
                try {
                  pc!.addTrack(vTrack, vStream);
                } catch {}
              }
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

          // Drain any ICE candidates received before remoteDescription
          const pending = pendingCandidatesRef.current.get(fromPeerId) || [];
          for (const cand of pending) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.warn('[WebRTC] Error applying drained candidate:', err);
            }
          }
          pendingCandidatesRef.current.delete(fromPeerId);

          const answer = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
          await pc.setLocalDescription(answer);

          if (realtimeChannelRef.current) {
            realtimeChannelRef.current.send({
              type: 'broadcast',
              event: 'voice_rtc_signal',
              payload: {
                from: u.id,
                to: fromPeerId,
                type: 'answer',
                sdp: answer,
              },
            });
          }
        } else if (payload.type === 'answer' && payload.sdp) {
          const pc = peerConnectionsRef.current.get(fromPeerId);
          if (pc && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

            // Drain queued ICE candidates
            const pending = pendingCandidatesRef.current.get(fromPeerId) || [];
            for (const cand of pending) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (err) {
                console.warn('[WebRTC] Error applying drained candidate on answer:', err);
              }
            }
            pendingCandidatesRef.current.delete(fromPeerId);
          }
        } else if (payload.type === 'ice-candidate' && payload.candidate) {
          const cleaned = cleanIceCandidate(payload.candidate);
          if (!cleaned) return;

          const pc = peerConnectionsRef.current.get(fromPeerId);
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cleaned));
            } catch (e) {
              console.warn('[WebRTC] Error adding ICE candidate:', e);
            }
          } else {
            // Queue candidate until remoteDescription is set
            if (!pendingCandidatesRef.current.has(fromPeerId)) {
              pendingCandidatesRef.current.set(fromPeerId, []);
            }
            pendingCandidatesRef.current.get(fromPeerId)!.push(cleaned);
          }
        }
      } catch (signalErr) {
        console.warn('[WebRTC] Error processing signal:', signalErr);
      }
    },
    [getOrCreatePeerConnection]
  );

  // Resume remote audio on any user gesture if initially blocked by autoplay
  React.useEffect(() => {
    const unlockAudio = () => {
      audioElementsRef.current.forEach((audio) => {
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      });
      if (livekitRoomRef.current) {
        livekitRoomRef.current.startAudio().catch(() => {});
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };

    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Stop all media streams cleanly
  const stopAllMediaStreams = React.useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (dspPipelineRef.current) {
      dspPipelineRef.current.cleanup();
      dspPipelineRef.current = null;
    }

    if (livekitRoomRef.current) {
      try {
        livekitRoomRef.current.disconnect();
      } catch {}
      livekitRoomRef.current = null;
    }
    krispProcessorRef.current = null;
    setIsLiveKitActive(false);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
      setVideoStream(null);
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }

    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setAudioLevel(0);
    audioLevelRef.current = 0;
    setIsCameraOn(false);
    isCameraOnRef.current = false;
    setIsScreenSharing(false);
    isScreenSharingRef.current = false;
  }, []);

  // Connect to a voice channel
  const joinVoiceChannel = React.useCallback(
    async (
      serverId: string,
      channelId: string,
      serverName?: string,
      channelName?: string
    ) => {
      const currentUser = user || userRef.current || {
        id:
          profileRef.current?.id ||
          (typeof window !== 'undefined' ? localStorage.getItem('nexus_user_id') : null) ||
          'user_' + Math.random().toString(36).slice(2, 9),
        email: profileRef.current?.username ? `${profileRef.current.username}@nexus.gg` : 'squadmate@nexus.gg',
      };
      if (typeof window !== 'undefined' && currentUser.id) {
        try {
          localStorage.setItem('nexus_user_id', currentUser.id);
        } catch {}
      }

      const voiceSessionId = 'voice_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      currentVoiceSessionIdRef.current = voiceSessionId;

      // Resume master Web Audio Context within the active user gesture
      if (typeof window !== 'undefined') {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            if (!masterAudioContextRef.current || masterAudioContextRef.current.state === 'closed') {
              masterAudioContextRef.current = new AudioCtx({ latencyHint: 'interactive' });
            }
            if (masterAudioContextRef.current.state === 'suspended') {
              masterAudioContextRef.current.resume().catch(() => {});
            }
          }
        } catch {}
      }

      console.log('[LiveKit Voice] Initiating joinVoiceChannel:', { serverId, channelId, userId: currentUser.id, serverName, channelName });
      const supabase = getBrowserClient();

      // If already connected to this channel AND LiveKit room is active and connected, do nothing
      const isLkConnected = livekitRoomRef.current?.state === 'connected' || isLiveKitActive;
      if (isVoiceConnected && activeChannelId === channelId && isLkConnected) {
        console.log('[LiveKit Voice] Already connected to channel and LiveKit room is active');
        return;
      }

      // C5: If user is in an active 1-on-1 call, end it before joining voice
      if (audioSessionCoordinator.isCallActive()) {
        audioSessionCoordinator.endCallIfActive();
      }

      setIsConnecting(true);

      // Disconnect from any previous voice channel first
      if (realtimeChannelRef.current) {
        try {
          realtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'voice_user_left',
            payload: { userId: currentUser.id },
          });
          realtimeChannelRef.current.untrack();
          if (supabase) {
            supabase.removeChannel(realtimeChannelRef.current);
          }
        } catch {}
        realtimeChannelRef.current = null;
      }

      if (serverRealtimeChannelRef.current) {
        try {
          serverRealtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'voice_user_left',
            payload: { userId: currentUser.id },
          });
          serverRealtimeChannelRef.current.untrack();
          if (supabase) {
            supabase.removeChannel(serverRealtimeChannelRef.current);
          }
        } catch {}
        serverRealtimeChannelRef.current = null;
      }

      if (livekitRoomRef.current) {
        try {
          livekitRoomRef.current.disconnect();
        } catch {}
        livekitRoomRef.current = null;
      }
      krispProcessorRef.current = null;
      setIsKrispActive(false);
      setIsLiveKitActive(false);
      mediaTransportRef.current = 'none';

      cleanUpAllPeers();

      setActiveServerId(serverId);
      setActiveChannelId(channelId);
      activeChannelIdRef.current = channelId;
      if (serverName) setActiveServerName(serverName);
      if (channelName) setActiveChannelName(channelName);

      // 1. Immediately request LiveKit token and connect to LiveKit Cloud SFU
      const cleanChanId = String(channelId || 'lounge').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_');
      const roomName = `nexus-voice-${cleanChanId}`;
      const participantName = profileRef.current?.display_name || currentUser.email?.split('@')[0] || 'Squadmate';

      try {
        console.log('[LiveKit Voice] Requesting SFU token for room:', roomName, 'as user:', currentUser.id);

        let authHeader = '';
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.access_token) {
            authHeader = `Bearer ${sessionData.session.access_token}`;
          }
        } catch {}

        const tokenRes = await fetch('/api/calls/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({
            serverId: serverId || undefined,
            channelId: channelId || undefined,
            roomName,
            userId: currentUser.id,
            userName: participantName,
          }),
        });

        if (currentVoiceSessionIdRef.current !== voiceSessionId) {
          console.log('[LiveKit Voice] Session changed during token request, discarding');
          return;
        }

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          console.error('[LiveKit Voice] Token endpoint error:', tokenRes.status, errText);
          mediaTransportRef.current = 'webrtc';
        } else {
          const tokenData = await tokenRes.json();
          if (tokenData.isConfigured && tokenData.token && tokenData.url) {
            console.log('[LiveKit Voice] Connecting to LiveKit Cloud SFU at', tokenData.url, 'for room', roomName);
            const lkRoom = new Room({
              adaptiveStream: true,
              dynacast: true,
              disconnectOnPageLeave: false,
            });
            livekitRoomRef.current = lkRoom;

            lkRoom.on(RoomEvent.Connected, () => {
              console.log('[LiveKit Voice] Connected to LiveKit Cloud Room:', roomName);
              mediaTransportRef.current = 'livekit';
              setIsLiveKitActive(true);
              setIsVoiceConnected(true);
              setIsConnecting(false);

              // LiveKit SFU is authoritative: close and clean up any fallback WebRTC peer connections
              peerConnectionsRef.current.forEach((peerPc) => {
                try { peerPc.close(); } catch {}
              });
              peerConnectionsRef.current.clear();

              // Clean up any existing WebRTC audio elements to prevent double playback
              document.querySelectorAll('[id^="remote-voice-audio-"]').forEach((el) => {
                try {
                  const mediaEl = el as HTMLMediaElement;
                  mediaEl.pause();
                  mediaEl.srcObject = null;
                  mediaEl.remove();
                } catch {}
              });
            });

            lkRoom.on(RoomEvent.Disconnected, (reason) => {
              console.log('[LiveKit Voice] Disconnected from LiveKit Cloud SFU, reason:', reason);
              setIsLiveKitActive(false);
              setIsKrispActive(false);
              if (mediaTransportRef.current === 'livekit') {
                mediaTransportRef.current = 'none';
              }
            });

            lkRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub, participant: RemoteParticipant) => {
              const peerId = participant.identity;
              console.log('[LiveKit Voice] Remote track subscribed:', peerId, track.kind, track.source);

              if (track.kind === Track.Kind.Audio) {
                attachLiveKitAudioTrack(track, peerId);
              } else if (track.kind === Track.Kind.Video) {
                if (track.mediaStreamTrack) {
                  const vStream = new MediaStream([track.mediaStreamTrack]);
                  remoteVideoStreamsRef.current.set(peerId, vStream);
                  setRemoteVideoStreams(new Map(remoteVideoStreamsRef.current));

                  const isScreen = track.source === Track.Source.ScreenShare;
                  const isCam = track.source === Track.Source.Camera;
                  const existing = peersMapRef.current.get(peerId);
                  if (existing) {
                    peersMapRef.current.set(peerId, {
                      ...existing,
                      is_screen_sharing: isScreen || existing.is_screen_sharing,
                      is_camera_on: isCam || existing.is_camera_on,
                    });
                    setRemoteParticipants(Array.from(peersMapRef.current.values()));
                  }

                  track.mediaStreamTrack.onended = () => {
                    remoteVideoStreamsRef.current.delete(peerId);
                    setRemoteVideoStreams(new Map(remoteVideoStreamsRef.current));
                    const peer = peersMapRef.current.get(peerId);
                    if (peer) {
                      peersMapRef.current.set(peerId, {
                        ...peer,
                        is_screen_sharing: isScreen ? false : peer.is_screen_sharing,
                        is_camera_on: isCam ? false : peer.is_camera_on,
                      });
                      setRemoteParticipants(Array.from(peersMapRef.current.values()));
                    }
                  };
                }
              }
            });

            lkRoom.on(RoomEvent.TrackPublished, (pub, participant: RemoteParticipant) => {
              if (pub.kind === Track.Kind.Audio && !pub.isSubscribed) {
                pub.setSubscribed(true);
              }
            });

            lkRoom.on(RoomEvent.TrackUnmuted, (pub: any, participant: any) => {
              const peerId = participant.identity;
              console.log('[LiveKit Voice] Remote track unmuted:', peerId, pub?.kind);
              if (pub?.kind === Track.Kind.Audio && pub?.track) {
                const el = audioElementsRef.current.get(peerId);
                if (el) {
                  el.muted = isDeafenedRef.current;
                  el.play().catch(() => {});
                } else {
                  attachLiveKitAudioTrack(pub.track as RemoteTrack, peerId);
                }
              }
              const existing = peersMapRef.current.get(peerId);
              if (existing && existing.is_muted) {
                peersMapRef.current.set(peerId, { ...existing, is_muted: false });
                setRemoteParticipants(Array.from(peersMapRef.current.values()));
              }
            });

            lkRoom.on(RoomEvent.TrackMuted, (pub: any, participant: any) => {
              const peerId = participant.identity;
              console.log('[LiveKit Voice] Remote track muted:', peerId, pub?.kind);
              const existing = peersMapRef.current.get(peerId);
              if (existing && !existing.is_muted) {
                peersMapRef.current.set(peerId, { ...existing, is_muted: true, is_speaking: false });
                setRemoteParticipants(Array.from(peersMapRef.current.values()));
              }
            });

            lkRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub, participant: RemoteParticipant) => {
              const peerId = participant.identity;
              if (track.kind === Track.Kind.Audio) {
                try {
                  track.detach().forEach((el) => {
                    try { el.remove(); } catch {}
                  });
                } catch {}
                const el = audioElementsRef.current.get(peerId);
                if (el) {
                  try {
                    el.srcObject = null;
                    el.pause();
                    el.remove();
                  } catch {}
                  audioElementsRef.current.delete(peerId);
                }
                const existingNode = remoteAudioNodesRef.current.get(peerId);
                if (existingNode) {
                  try {
                    existingNode.source.disconnect();
                    existingNode.gain.disconnect();
                  } catch {}
                  remoteAudioNodesRef.current.delete(peerId);
                }
              } else if (track.kind === Track.Kind.Video) {
                remoteVideoStreamsRef.current.delete(peerId);
                setRemoteVideoStreams(new Map(remoteVideoStreamsRef.current));
                const peer = peersMapRef.current.get(peerId);
                if (peer) {
                  peersMapRef.current.set(peerId, {
                    ...peer,
                    is_screen_sharing: track.source === Track.Source.ScreenShare ? false : peer.is_screen_sharing,
                    is_camera_on: track.source === Track.Source.Camera ? false : peer.is_camera_on,
                  });
                  setRemoteParticipants(Array.from(peersMapRef.current.values()));
                }
              }
            });

            lkRoom.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
              const peerId = participant.identity;
              if (!peersMapRef.current.has(peerId)) {
                peersMapRef.current.set(peerId, {
                  id: peerId,
                  user_id: peerId,
                  display_name: participant.name || 'Squadmate',
                  avatar_url: null,
                  role: 'Squadmate',
                  is_speaking: false,
                  is_muted: false,
                  is_deafened: false,
                  is_camera_on: false,
                  is_screen_sharing: false,
                  audio_level: 0,
                });
                const remotes = Array.from(peersMapRef.current.values());
                setRemoteParticipants(remotes);
                updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);
              }
            });

            lkRoom.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
              const peerId = participant.identity;
              peersMapRef.current.delete(peerId);
              remoteVideoStreamsRef.current.delete(peerId);
              setRemoteVideoStreams(new Map(remoteVideoStreamsRef.current));
              const el = audioElementsRef.current.get(peerId);
              if (el) {
                try {
                  el.srcObject = null;
                  el.pause();
                  el.remove();
                } catch {}
                audioElementsRef.current.delete(peerId);
              }
              const existingNode = remoteAudioNodesRef.current.get(peerId);
              if (existingNode) {
                try {
                  existingNode.source.disconnect();
                  existingNode.gain.disconnect();
                } catch {}
                remoteAudioNodesRef.current.delete(peerId);
              }
              const remotes = Array.from(peersMapRef.current.values());
              setRemoteParticipants(remotes);
              updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);
            });

            lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
              const activeIds = new Set(speakers.map((s) => s.identity));
              const u = userRef.current;
              if (u) {
                const isUserActive = activeIds.has(u.id);
                if (isUserActive && !isMicMutedRef.current && !isDeafenedRef.current) {
                  if (!isSpeakingRef.current) {
                    isSpeakingRef.current = true;
                    setIsSpeaking(true);
                  }
                } else if (!isUserActive && isSpeakingRef.current) {
                  isSpeakingRef.current = false;
                  setIsSpeaking(false);
                }
              }
              peersMapRef.current.forEach((peer, peerId) => {
                const spk = activeIds.has(peerId);
                if (peer.is_speaking !== spk) {
                  peersMapRef.current.set(peerId, { ...peer, is_speaking: spk });
                }
              });
              const remotes = Array.from(peersMapRef.current.values());
              setRemoteParticipants(remotes);
            });

            // Listen for browser autoplay restrictions
            lkRoom.on(RoomEvent.AudioPlaybackStatusChanged, (canPlayAudio: boolean) => {
              if (!canPlayAudio) {
                console.warn('[LiveKit Voice] Audio playback blocked by browser. Unlocking on next user gesture...');
                const unlock = () => {
                  lkRoom.startAudio().catch(() => {});
                  audioElementsRef.current.forEach((el) => {
                    el.play().catch(() => {});
                  });
                  window.removeEventListener('click', unlock);
                  window.removeEventListener('keydown', unlock);
                  window.removeEventListener('touchstart', unlock);
                };
                window.addEventListener('click', unlock, { once: true, passive: true });
                window.addEventListener('keydown', unlock, { once: true, passive: true });
                window.addEventListener('touchstart', unlock, { once: true, passive: true });
              }
            });

            // Connect to LiveKit Cloud SFU
            await lkRoom.connect(tokenData.url, tokenData.token);
            if (currentVoiceSessionIdRef.current !== voiceSessionId) {
              console.log('[LiveKit Voice] Session cancelled while connecting, disconnecting');
              try { lkRoom.disconnect(); } catch {}
              return;
            }

            // Immediately request audio playback authorization
            await lkRoom.startAudio().catch((err) => {
              console.warn('[LiveKit Voice] lkRoom.startAudio() notice:', err);
            });

            mediaTransportRef.current = 'livekit';
            setIsLiveKitActive(true);
            setIsVoiceConnected(true);
            setIsConnecting(false);

            // Populate and attach tracks for all existing participants already present in the room upon connection
            lkRoom.remoteParticipants.forEach((participant: RemoteParticipant) => {
              const peerId = participant.identity;
              if (!peersMapRef.current.has(peerId)) {
                peersMapRef.current.set(peerId, {
                  id: peerId,
                  user_id: peerId,
                  display_name: participant.name || 'Squadmate',
                  avatar_url: null,
                  role: 'Squadmate',
                  is_speaking: false,
                  is_muted: false,
                  is_deafened: false,
                  is_camera_on: false,
                  is_screen_sharing: false,
                  audio_level: 0,
                });
              }

              // Attach all already published & subscribed audio tracks so joining user hears everyone
              participant.trackPublications.forEach((pub) => {
                if (pub.isSubscribed && pub.track && pub.track.kind === Track.Kind.Audio) {
                  attachLiveKitAudioTrack(pub.track as RemoteTrack, peerId);
                }
              });
            });
            const initialRemotes = Array.from(peersMapRef.current.values());
            setRemoteParticipants(initialRemotes);
            updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...initialRemotes]);

            // Acquire local microphone & setup studio audio pipeline if not already active
            let stream = localStreamRef.current;
            const isExistingStreamLive =
              stream &&
              stream.active &&
              stream.getAudioTracks().some((t) => t.readyState === 'live');

            if (!isExistingStreamLive) {
              try {
                if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
                  const savedMicId = (typeof window !== 'undefined' ? localStorage.getItem('nexus_audio_input_device') : null) || settings?.input_device_id || null;
                  const policy = noiseSuppressionMode === 'off' ? 'off' : 'rnnoise';
                  const audioConstraints = getUserMediaAudioConstraints(policy, savedMicId);
                  let rawStream: MediaStream;
                  try {
                    rawStream = await navigator.mediaDevices.getUserMedia({
                      audio: audioConstraints,
                      video: false,
                    });
                  } catch (exactErr) {
                    console.warn('[ServerVoice] Exact mic device failed or unplugged, falling back to default:', exactErr);
                    rawStream = await navigator.mediaDevices.getUserMedia({
                      audio: getUserMediaAudioConstraints(policy, null),
                      video: false,
                    });
                  }

                  if (currentVoiceSessionIdRef.current !== voiceSessionId) {
                    rawStream.getTracks().forEach((t) => t.stop());
                    return;
                  }

                  let streamToUse = rawStream;
                  try {
                    if (dspPipelineRef.current) {
                      try { dspPipelineRef.current.cleanup(); } catch {}
                      dspPipelineRef.current = null;
                    }
                    const pipeline = await createGcpNoisePipeline(rawStream, noiseSuppressionMode);
                    if (currentVoiceSessionIdRef.current !== voiceSessionId) {
                      rawStream.getTracks().forEach((t) => t.stop());
                      if (pipeline) pipeline.cleanup();
                      return;
                    }
                    if (pipeline) {
                      dspPipelineRef.current = pipeline;
                      streamToUse = pipeline.outputStream;
                    }
                  } catch (dspErr) {
                    console.warn('[ServerVoice] Error initializing GCP noise pipeline for lounge:', dspErr);
                  }

                  setLocalStream(streamToUse);
                  localStreamRef.current = streamToUse;
                  stream = streamToUse;

                  const pttActive = isPushToTalkEnabled(settingsRef.current);
                  if (pttActive || disconnectGateRef.current || isMicMutedRef.current) {
                    stream.getAudioTracks().forEach((track) => {
                      track.enabled = false;
                    });
                    setIsMicMuted(true);
                    isMicMutedRef.current = true;
                    if (livekitRoomRef.current?.localParticipant) {
                      livekitRoomRef.current.localParticipant.setMicrophoneEnabled(false).catch(() => {});
                    }
                  } else {
                    setIsMicMuted(false);
                    isMicMutedRef.current = false;
                  }
                }
              } catch (micErr) {
                console.warn('[VoiceLounge] Mic setup notice (joining muted):', micErr);
                setIsMicMuted(true);
                isMicMutedRef.current = true;
              }
            }

            // Start speech analyzer for RMS meter (never close audioContextRef if active)
            if (stream) {
              try {
                if (animFrameRef.current) {
                  cancelAnimationFrame(animFrameRef.current);
                  animFrameRef.current = null;
                }
                const AudioCtx =
                  window.AudioContext ||
                  (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

                if (AudioCtx) {
                  let audioCtx = audioContextRef.current;
                  if (!audioCtx || audioCtx.state === 'closed') {
                    audioCtx = new AudioCtx();
                    audioContextRef.current = audioCtx;
                  }
                  if (audioCtx.state === 'suspended') {
                    audioCtx.resume().catch(() => {});
                  }

                  const source = audioCtx.createMediaStreamSource(stream);
                  const analyser = audioCtx.createAnalyser();
                  analyser.fftSize = 512;
                  analyser.smoothingTimeConstant = 0.3;
                  source.connect(analyser);

                  const silentGain = audioCtx.createGain();
                  silentGain.gain.value = 0;
                  source.connect(silentGain);
                  silentGain.connect(audioCtx.destination);

                  const pcmData = new Uint8Array(analyser.frequencyBinCount);
                  let speakingCounter = 0;

                  const checkSpeaking = () => {
                    if (!analyser) return;
                    analyser.getByteFrequencyData(pcmData);

                    let sum = 0;
                    for (let i = 0; i < pcmData.length; i++) {
                      sum += pcmData[i];
                    }
                    const avg = sum / pcmData.length;
                    const normalized = Math.min(100, Math.round((avg / 128) * 100));

                    if (normalized !== audioLevelRef.current) {
                      audioLevelRef.current = normalized;
                      setAudioLevel(normalized);
                    }

                    const speakingThreshold = 14;
                    if (normalized > speakingThreshold && !isMicMutedRef.current && !isDeafenedRef.current) {
                      speakingCounter = 6;
                      if (!isSpeakingRef.current) {
                        isSpeakingRef.current = true;
                        setIsSpeaking(true);
                        broadcastMyVoiceState({ is_speaking: true });
                      }
                    } else if (speakingCounter > 0) {
                      speakingCounter--;
                    } else if (isSpeakingRef.current) {
                      isSpeakingRef.current = false;
                      setIsSpeaking(false);
                      broadcastMyVoiceState({ is_speaking: false });
                    }

                    animFrameRef.current = requestAnimationFrame(checkSpeaking);
                  };

                  animFrameRef.current = requestAnimationFrame(checkSpeaking);
                }
              } catch (audioCtxErr) {
                console.warn('[VoiceLounge] Audio analyser setup notice:', audioCtxErr);
              }
            }

            // Publish local audio track to LiveKit Cloud SFU
            try {
              let localAudioTrack: any;
              const existingAudioTrack = stream?.getAudioTracks()[0] || localStreamRef.current?.getAudioTracks()[0];
              const { LocalAudioTrack, createLocalAudioTrack } = await import('livekit-client');

              // Obtain an active AudioContext strictly for LocalAudioTrack processor / Krisp support
              // Note: Never assign audioContext to lkRoom, as that forces connectWebAudio on remote tracks which mutes them
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              const audioCtx =
                audioContextRef.current ||
                (AudioCtx ? new AudioCtx({ latencyHint: 'interactive' }) : undefined);
              if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
              }

              // Route audio through GCP Studio AudioWorklet Noise Cancellation Pipeline
              let rawStream: MediaStream;
              if (existingAudioTrack && existingAudioTrack.readyState === 'live') {
                rawStream = new MediaStream([existingAudioTrack]);
              } else if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
                const savedMicId = (typeof window !== 'undefined' ? localStorage.getItem('nexus_audio_input_device') : null);
                const policy = noiseSuppressionMode === 'off' ? 'off' : 'rnnoise';
                rawStream = await navigator.mediaDevices.getUserMedia({
                  audio: getUserMediaAudioConstraints(policy, savedMicId),
                });
              } else {
                const fallbackTrack = await createLocalAudioTrack({
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                });
                rawStream = new MediaStream([fallbackTrack.mediaStreamTrack]);
              }

              let finalAudioTrack = rawStream.getAudioTracks()[0];
              try {
                if (dspPipelineRef.current) {
                  try { dspPipelineRef.current.cleanup(); } catch {}
                  dspPipelineRef.current = null;
                }
                const pipeline = await createGcpNoisePipeline(rawStream, noiseSuppressionMode);
                if (pipeline) {
                  dspPipelineRef.current = pipeline;
                  const procTrack = pipeline.outputStream.getAudioTracks()[0];
                  if (procTrack) {
                    finalAudioTrack = procTrack;
                  }
                }
              } catch (dspErr) {
                console.warn('[LiveKit Voice] GCP Noise Pipeline initialization notice:', dspErr);
              }

              if (finalAudioTrack) {
                const filteredStream = new MediaStream([finalAudioTrack]);
                setLocalStream(filteredStream);
                localStreamRef.current = filteredStream;
                localAudioTrack = new LocalAudioTrack(finalAudioTrack, undefined, true, audioCtx);
              } else {
                localAudioTrack = await createLocalAudioTrack();
              }

              if (audioCtx) {
                try {
                  localAudioTrack.setAudioContext(audioCtx);
                } catch {}
                try {
                  (localAudioTrack as any).audioContext = audioCtx;
                } catch {}
              }

              await lkRoom.localParticipant.publishTrack(localAudioTrack, {
                source: Track.Source.Microphone,
              });
              if (isMicMutedRef.current) {
                try {
                  await localAudioTrack.mute();
                } catch {}
              }
              console.log('[LiveKit Voice] Local audio track published to LiveKit Cloud SFU!');
            } catch (pubErr) {
              console.warn('[LiveKit Voice] Local audio track publish notice:', pubErr);
            }
          } else {
            console.warn('[LiveKit Voice] LiveKit not configured or missing token/url, using WebRTC fallback:', tokenData);
            mediaTransportRef.current = 'webrtc';
          }
        }
      } catch (lkErr) {
        console.error('[LiveKit Voice] Error connecting to LiveKit room, falling back to WebRTC:', lkErr);
        mediaTransportRef.current = 'webrtc';
      }

      // 3. Connect Server-wide presence channel so all server members see occupants under the channel in the sidebar
      if (supabase) {
        try {
          const cleanServerId = serverId.toLowerCase().trim();
          const serverPresenceChannel = supabase.channel(`server_voice_${cleanServerId}`, {
            config: {
              private: true,
              broadcast: { self: false },
              presence: { key: currentUser.id },
            },
          });
          serverRealtimeChannelRef.current = serverPresenceChannel;

          const doTrack = () => {
            const normalizedChanId = (channelId || '').toLowerCase().trim();
            serverPresenceChannel.track({
              channel_id: normalizedChanId,
              user_id: currentUser.id,
              display_name: profileRef.current?.display_name || currentUser.email?.split('@')[0] || 'Squadmate',
              avatar_url: profileRef.current?.avatar_url || null,
              is_speaking: false,
              is_muted: isMicMutedRef.current,
              is_deafened: isDeafenedRef.current,
            }).catch(() => {});
          };

          if (serverPresenceChannel.state === 'joined') {
            doTrack();
          } else {
            serverPresenceChannel.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                doTrack();
              }
            });
          }
        } catch (srvErr) {
          console.warn('[ServerVoice] Error joining server voice presence:', srvErr);
        }
      }

      // 4. Connect WebRTC signaling room channel
      const topic = `voice_room_${cleanChanId}`;

      const roomChannel = supabase ? supabase.channel(topic, {
        config: {
          private: true,
          broadcast: { self: false },
          presence: { key: currentUser.id },
        },
      }) : null;

      realtimeChannelRef.current = roomChannel;

      const updateParticipantsFromPresence = (presenceState: Record<string, any[]>) => {
        const u = userRef.current;
        if (!u) return;
        const nextMap = new Map<string, VoiceParticipant>();

        Object.entries(presenceState).forEach(([key, presences]) => {
          if (key === u.id) return;
          if (Array.isArray(presences) && presences.length > 0) {
            const latest = presences[presences.length - 1];
            const peerId = latest?.user_id || key;
            if (peerId && peerId !== u.id) {
              const existing = peersMapRef.current.get(peerId);
              nextMap.set(peerId, {
                id: latest.id || peerId,
                user_id: peerId,
                display_name: latest.display_name || existing?.display_name || 'Squadmate',
                avatar_url: latest.avatar_url ?? existing?.avatar_url ?? null,
                role: latest.role || existing?.role || 'Squadmate',
                is_speaking: Boolean(latest.is_speaking ?? existing?.is_speaking),
                is_muted: Boolean(latest.is_muted ?? existing?.is_muted),
                is_deafened: Boolean(latest.is_deafened ?? existing?.is_deafened),
                is_camera_on: Boolean(latest.is_camera_on ?? existing?.is_camera_on),
                is_screen_sharing: Boolean(latest.is_screen_sharing ?? existing?.is_screen_sharing),
                audio_level: Number(latest.audio_level || existing?.audio_level || 0),
              });

              if (u.id < peerId && mediaTransportRef.current === 'webrtc') {
                getOrCreatePeerConnection(peerId, true);
              }
            }
          }
        });

        // Retain broadcast-discovered peers
        peersMapRef.current.forEach((peer, peerId) => {
          if (!nextMap.has(peerId) && peerId !== u.id) {
            nextMap.set(peerId, peer);
          }
        });

        peersMapRef.current = nextMap;
        const remotes = Array.from(nextMap.values());
        setRemoteParticipants(remotes);

        // Update occupancy map for sidebar
        updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);
      };

      if (roomChannel) {
        roomChannel
          .on('presence', { event: 'sync' }, () => {
          updateParticipantsFromPresence(roomChannel.presenceState());
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
          const u = userRef.current;
          if (!u || key === u.id) return;
          if (Array.isArray(newPresences) && newPresences.length > 0) {
            const latest = newPresences[newPresences.length - 1];
            const peerId = latest?.user_id || key;
            if (peerId && peerId !== u.id) {
              const newPeer: VoiceParticipant = {
                id: latest.id || peerId,
                user_id: peerId,
                display_name: latest.display_name || 'Squadmate',
                avatar_url: latest.avatar_url || null,
                role: latest.role || 'Squadmate',
                is_speaking: Boolean(latest.is_speaking),
                is_muted: Boolean(latest.is_muted),
                is_deafened: Boolean(latest.is_deafened),
                is_camera_on: Boolean(latest.is_camera_on),
                is_screen_sharing: Boolean(latest.is_screen_sharing),
                audio_level: Number(latest.audio_level || 0),
              };
              peersMapRef.current.set(peerId, newPeer);
              const remotes = Array.from(peersMapRef.current.values());
              setRemoteParticipants(remotes);
              updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);

              if (u.id < peerId && mediaTransportRef.current === 'webrtc') {
                getOrCreatePeerConnection(peerId, true);
              }
            }
          }
          updateParticipantsFromPresence(roomChannel.presenceState());
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
          const removePeer = (id: string) => {
            peersMapRef.current.delete(id);
            const pc = peerConnectionsRef.current.get(id);
            if (pc) {
              try {
                pc.close();
              } catch {}
              peerConnectionsRef.current.delete(id);
            }
            const audio = audioElementsRef.current.get(id);
            if (audio) {
              try {
                audio.srcObject = null;
                audio.pause();
                if (audio.parentNode) {
                  audio.parentNode.removeChild(audio);
                }
              } catch {}
              audioElementsRef.current.delete(id);
            }
          };

          if (key) removePeer(key);
          if (Array.isArray(leftPresences)) {
            leftPresences.forEach((lp: any) => {
              const uid = lp?.user_id || lp?.key;
              if (uid) removePeer(uid);
            });
          }
          const remotes = Array.from(peersMapRef.current.values());
          setRemoteParticipants(remotes);
          updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);
        })
        .on('broadcast', { event: 'voice_announce' }, ({ payload }: { payload: VoiceParticipant }) => {
          const u = userRef.current;
          if (!u || !payload || !payload.user_id || payload.user_id === u.id) return;
          peersMapRef.current.set(payload.user_id, payload);
          const remotes = Array.from(peersMapRef.current.values());
          setRemoteParticipants(remotes);
          updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);

          // Immediate ACK
          try {
            roomChannel.send({
              type: 'broadcast',
              event: 'voice_announce_ack',
              payload: getMyVoiceState(),
            });
          } catch {}

          if (u.id < payload.user_id && mediaTransportRef.current === 'webrtc') {
            getOrCreatePeerConnection(payload.user_id, true);
          }
        })
        .on('broadcast', { event: 'voice_announce_ack' }, ({ payload }: { payload: VoiceParticipant }) => {
          const u = userRef.current;
          if (!u || !payload || !payload.user_id || payload.user_id === u.id) return;
          peersMapRef.current.set(payload.user_id, payload);
          const remotes = Array.from(peersMapRef.current.values());
          setRemoteParticipants(remotes);
          updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);

          if (u.id < payload.user_id && mediaTransportRef.current === 'webrtc') {
            getOrCreatePeerConnection(payload.user_id, true);
          }
        })
        .on('broadcast', { event: 'voice_speaking' }, ({ payload }: { payload: { user_id: string; is_speaking: boolean; audio_level: number } }) => {
          const u = userRef.current;
          if (!u || !payload || !payload.user_id || payload.user_id === u.id) return;
          const peer = peersMapRef.current.get(payload.user_id);
          if (peer) {
            peersMapRef.current.set(payload.user_id, {
              ...peer,
              is_speaking: payload.is_speaking,
              audio_level: payload.audio_level,
            });
            const remotes = Array.from(peersMapRef.current.values());
            setRemoteParticipants(remotes);
            updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);
          }
        })
        .on('broadcast', { event: 'voice_state_update' }, ({ payload }: { payload: VoiceParticipant }) => {
          const u = userRef.current;
          if (!u || !payload || !payload.user_id || payload.user_id === u.id) return;
          const peer = peersMapRef.current.get(payload.user_id);
          peersMapRef.current.set(payload.user_id, {
            ...(peer || {}),
            ...payload,
          });
          const remotes = Array.from(peersMapRef.current.values());
          setRemoteParticipants(remotes);
          updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);
        })
        .on('broadcast', { event: 'voice_user_left' }, ({ payload }: { payload: { userId: string } }) => {
          if (!payload || !payload.userId) return;
          peersMapRef.current.delete(payload.userId);
          const pc = peerConnectionsRef.current.get(payload.userId);
          if (pc) {
            try {
              pc.close();
            } catch {}
            peerConnectionsRef.current.delete(payload.userId);
          }
          const audio = audioElementsRef.current.get(payload.userId);
          if (audio) {
            try {
              audio.srcObject = null;
              audio.pause();
              if (audio.parentNode) {
                audio.parentNode.removeChild(audio);
              }
            } catch {}
            audioElementsRef.current.delete(payload.userId);
          }
          const remotes = Array.from(peersMapRef.current.values());
          setRemoteParticipants(remotes);
          updateChannelOccupantsMap(channelId, [getMyVoiceState(), ...remotes]);
        })
        .on('broadcast', { event: 'voice_rtc_signal' }, ({ payload }: { payload: any }) => {
          handleRtcSignal(payload);
        })
        .on('broadcast', { event: 'soundboard' }, ({ payload }: { payload: SoundboardClip }) => {
          if (payload && !isDeafenedRef.current) {
            soundboardEngine.playClip(payload);
          }
        });

        roomChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const myState = getMyVoiceState();
            try {
              await roomChannel.track(myState);
            } catch (trackErr) {
              console.warn('[WebRTC] Presence track warning:', trackErr);
            }
            try {
              roomChannel.send({
                type: 'broadcast',
                event: 'voice_announce',
                payload: myState,
              });
            } catch {}
          }
        });
      }

      // C6: Redundant 5s polling loop eliminated. Supabase Presence tracks active occupants.
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      setIsVoiceConnected(true);
      setIsConnecting(false);
    },
    [
      user,
      isVoiceConnected,
      activeChannelId,
      isLiveKitActive,
      cleanUpAllPeers,
      getMyVoiceState,
      updateChannelOccupantsMap,
      getOrCreatePeerConnection,
      handleRtcSignal,
      broadcastMyVoiceState,
      attachLiveKitAudioTrack,
      settings?.input_device_id,
      isNoiseSuppressionEnabled,
      noiseSuppressionMode,
    ]
  );

  // Disconnect from current voice channel
  const disconnectVoice = React.useCallback(() => {
    currentVoiceSessionIdRef.current = null;
    mediaTransportRef.current = 'none';
    setIsKrispActive(false);
    krispProcessorRef.current = null;
    stopAllMediaStreams();

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (livekitRoomRef.current) {
      try {
        livekitRoomRef.current.disconnect();
      } catch {}
      livekitRoomRef.current = null;
    }
    setIsLiveKitActive(false);

    const prevChanId = activeChannelIdRef.current || activeChannelId;
    const prevServerId = activeServerId;

    if (realtimeChannelRef.current) {
      const rChan = realtimeChannelRef.current;
      realtimeChannelRef.current = null;
      try {
        if (userRef.current) {
          rChan.send({
            type: 'broadcast',
            event: 'voice_user_left',
            payload: { userId: userRef.current.id, channelId: prevChanId },
          });
        }
        rChan.untrack();
        const supabase = getBrowserClient();
        if (supabase) {
          supabase.removeChannel(rChan);
        }
      } catch {}
    }

    if (serverRealtimeChannelRef.current) {
      const sChan = serverRealtimeChannelRef.current;
      serverRealtimeChannelRef.current = null;
      try {
        if (userRef.current) {
          sChan.send({
            type: 'broadcast',
            event: 'voice_user_left',
            payload: { userId: userRef.current.id, channelId: prevChanId },
          });
        }
        sChan.untrack();
        const supabase = getBrowserClient();
        if (supabase) {
          supabase.removeChannel(sChan);
        }
      } catch {}
    }

    // Clean up all DOM audio elements from remote LiveKit and mesh
    audioElementsRef.current.forEach((audio) => {
      try {
        audio.srcObject = null;
        audio.pause();
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
      } catch {}
    });
    audioElementsRef.current.clear();

    setChannelOccupants(new Map());
    cleanUpAllPeers();
    audioSessionCoordinator.setServerVoiceChannel(null);
    activeChannelIdRef.current = null;
    setIsVoiceConnected(false);
    setIsConnecting(false);
    setActiveChannelId(null);
    setActiveServerId(null);
    setActiveChannelName(null);
    setActiveServerName(null);

    // Notify window that voice disconnected so sidebar and views immediately remove user
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('nexus_voice_disconnected', {
          detail: { channelId: prevChanId, serverId: prevServerId, userId: userRef.current?.id },
        })
      );
    }
  }, [stopAllMediaStreams, activeChannelId, activeServerId, cleanUpAllPeers]);

  const disconnectVoiceRef = React.useRef(disconnectVoice);
  disconnectVoiceRef.current = disconnectVoice;

  // C5 & C8: Register voice disconnect handler and unmount cleanup
  React.useEffect(() => {
    return audioSessionCoordinator.registerVoiceDisconnectHandler(() => {
      disconnectVoiceRef.current();
    });
  }, []);

  React.useEffect(() => {
    return () => {
      disconnectVoiceRef.current();
    };
  }, []);

  React.useEffect(() => {
    audioSessionCoordinator.setServerVoiceChannel(isVoiceConnected ? activeChannelId : null);
  }, [isVoiceConnected, activeChannelId]);

  // Toggle microphone
  const toggleMic = React.useCallback(async () => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);
    isMicMutedRef.current = nextMuted;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (livekitRoomRef.current?.localParticipant) {
      try {
        const lp = livekitRoomRef.current.localParticipant;
        const promises: Promise<any>[] = [];
        lp.audioTrackPublications.forEach((pub: any) => {
          if (pub.track) {
            promises.push(nextMuted ? pub.track.mute() : pub.track.unmute());
            if (pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !nextMuted;
            }
          }
          if (nextMuted && typeof pub.mute === 'function') {
            promises.push(pub.mute());
          } else if (!nextMuted && typeof pub.unmute === 'function') {
            promises.push(pub.unmute());
          }
        });
        promises.push(lp.setMicrophoneEnabled(!nextMuted));
        await Promise.allSettled(promises);
      } catch (lkErr) {
        console.warn('[LiveKit Voice] Error setting mic state:', lkErr);
      }
    }

    // Only update WebRTC fallback audio senders if WebRTC is the authoritative transport
    if (mediaTransportRef.current === 'webrtc') {
      peerConnectionsRef.current.forEach((pc) => {
        pc.getSenders().forEach((s) => {
          if (s.track?.kind === 'audio') {
            s.track.enabled = !nextMuted;
          }
        });
      });
    }

    if (nextMuted) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setAudioLevel(0);
      audioLevelRef.current = 0;
    } else if (isDeafenedRef.current) {
      setIsDeafened(false);
      isDeafenedRef.current = false;
      audioElementsRef.current.forEach((audio) => {
        audio.muted = false;
        audio.volume = 1.0;
        audio.play().catch(() => {});
      });
      if (livekitRoomRef.current?.remoteParticipants) {
        livekitRoomRef.current.remoteParticipants.forEach((rp: any) => {
          rp.audioTrackPublications?.forEach((pub: any) => {
            if (pub.track) {
              if (pub.track.mediaStreamTrack) {
                pub.track.mediaStreamTrack.enabled = true;
              }
              if (pub.track.attachedElements) {
                pub.track.attachedElements.forEach((el: HTMLMediaElement) => {
                  el.muted = false;
                  el.volume = 1.0;
                  el.play().catch(() => {});
                });
              }
            }
          });
        });
      }
      broadcastMyVoiceState({ is_deafened: false });
    }

    broadcastMyVoiceState({ is_muted: nextMuted, is_speaking: false });
  }, [isMicMuted, broadcastMyVoiceState]);

  // Toggle deafen
  const toggleDeafen = React.useCallback(async () => {
    const nextDeafened = !isDeafenedRef.current;
    setIsDeafened(nextDeafened);
    isDeafenedRef.current = nextDeafened;

    // Reset speaking indicators immediately so avatar doesn't show old speech
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setAudioLevel(0);
    audioLevelRef.current = 0;

    // 1. Mute/unmute all tracked DOM audio elements without pausing to prevent buffer freeze & stale audio playback
    audioElementsRef.current.forEach((audio) => {
      audio.muted = nextDeafened;
      audio.volume = nextDeafened ? 0 : 1.0;
      if (!nextDeafened && audio.paused) {
        audio.play().catch(() => {});
      }
    });

    // 2. Mute/unmute Web Audio mixer nodes
    remoteAudioNodesRef.current.forEach(({ gain }) => {
      gain.gain.value = nextDeafened ? 0 : 1;
    });

    // 3. Completely silence/restore remote WebRTC tracks and attached elements
    if (livekitRoomRef.current?.remoteParticipants) {
      livekitRoomRef.current.remoteParticipants.forEach((rp: any) => {
        rp.audioTrackPublications?.forEach((pub: any) => {
          if (pub.track) {
            if (pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !nextDeafened;
            }
            if (pub.track.attachedElements) {
              pub.track.attachedElements.forEach((el: HTMLMediaElement) => {
                el.muted = nextDeafened;
                el.volume = nextDeafened ? 0 : 1.0;
                if (!nextDeafened && el.paused) {
                  el.play().catch(() => {});
                }
              });
            }
          }
        });
      });
    }

    // 4. Mute/unmute microphone in tandem with deafen state
    if (nextDeafened && !isMicMutedRef.current) {
      await toggleMic();
    } else if (!nextDeafened && isMicMutedRef.current) {
      await toggleMic();
    }

    broadcastMyVoiceState({ is_deafened: nextDeafened, is_speaking: false });
  }, [toggleMic, broadcastMyVoiceState]);

  const setIncomingVolume = React.useCallback(async (vol: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(vol)));
    incomingVolumeRef.current = clamped;
    setIncomingVolumeState(clamped);

    const gain = isDeafenedRef.current ? 0 : clamped / 100;
    audioElementsRef.current.forEach((el) => {
      el.volume = gain;
    });

    remoteAudioNodesRef.current.forEach(({ gain: gNode }) => {
      gNode.gain.value = gain;
    });

    if (livekitRoomRef.current?.remoteParticipants) {
      livekitRoomRef.current.remoteParticipants.forEach((rp: any) => {
        rp.audioTrackPublications?.forEach((pub: any) => {
          if (pub.track?.attachedElements) {
            pub.track.attachedElements.forEach((el: HTMLMediaElement) => {
              el.volume = gain;
            });
          }
        });
      });
    }
  }, []);

  const setMicMutedExplicit = React.useCallback(async (muted: boolean) => {
    if (!muted) {
      disconnectGateRef.current = false;
    }
    setIsMicMuted(muted);
    isMicMutedRef.current = muted;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    if (livekitRoomRef.current?.localParticipant) {
      try {
        const lp = livekitRoomRef.current.localParticipant;
        const promises: Promise<any>[] = [];
        lp.audioTrackPublications.forEach((pub: any) => {
          if (pub.track) {
            promises.push(muted ? pub.track.mute() : pub.track.unmute());
            if (pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !muted;
            }
          }
          if (muted && typeof pub.mute === 'function') {
            promises.push(pub.mute());
          } else if (!muted && typeof pub.unmute === 'function') {
            promises.push(pub.unmute());
          }
        });
        promises.push(lp.setMicrophoneEnabled(!muted));
        await Promise.allSettled(promises);
      } catch (lkErr) {
        console.warn('[LiveKit Voice] Error setting mic state:', lkErr);
      }
    }

    if (mediaTransportRef.current === 'webrtc') {
      peerConnectionsRef.current.forEach((pc) => {
        pc.getSenders().forEach((s) => {
          if (s.track?.kind === 'audio') {
            s.track.enabled = !muted;
          }
        });
      });
    }

    if (muted) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setAudioLevel(0);
      audioLevelRef.current = 0;
    }

    broadcastMyVoiceState({ is_muted: muted, is_speaking: false });
  }, [broadcastMyVoiceState]);

  const setDeafenedExplicit = React.useCallback(async (deafened: boolean) => {
    setIsDeafened(deafened);
    isDeafenedRef.current = deafened;

    const gain = deafened ? 0 : incomingVolumeRef.current / 100;

    audioElementsRef.current.forEach((audio) => {
      audio.muted = deafened;
      audio.volume = gain;
      if (!deafened && audio.paused) {
        audio.play().catch(() => {});
      }
    });

    remoteAudioNodesRef.current.forEach(({ gain: gNode }) => {
      gNode.gain.value = gain;
    });

    if (livekitRoomRef.current?.remoteParticipants) {
      livekitRoomRef.current.remoteParticipants.forEach((rp: any) => {
        rp.audioTrackPublications?.forEach((pub: any) => {
          if (pub.track) {
            if (pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !deafened;
            }
            if (pub.track.attachedElements) {
              pub.track.attachedElements.forEach((el: HTMLMediaElement) => {
                el.muted = deafened;
                el.volume = gain;
                if (!deafened && el.paused) {
                  el.play().catch(() => {});
                }
              });
            }
          }
        });
      });
    }

    // Keep mic state independent as required by mixer contract
    broadcastMyVoiceState({ is_deafened: deafened });
  }, [broadcastMyVoiceState]);

  const forceMute = React.useCallback(() => {
    disconnectGateRef.current = true;
    setIsMicMuted(true);
    isMicMutedRef.current = true;
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setAudioLevel(0);
    audioLevelRef.current = 0;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    if (livekitRoomRef.current?.localParticipant) {
      const lp = livekitRoomRef.current.localParticipant;
      lp.audioTrackPublications.forEach((pub: any) => {
        if (pub.track?.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = false;
        }
        if (typeof pub.track?.mute === 'function') {
          pub.track.mute().catch(() => {});
        }
      });
    }

    if (mediaTransportRef.current === 'webrtc') {
      peerConnectionsRef.current.forEach((pc) => {
        pc.getSenders().forEach((s) => {
          if (s.track?.kind === 'audio') {
            s.track.enabled = false;
          }
        });
      });
    }

    broadcastMyVoiceState({ is_muted: true, is_speaking: false });
  }, [broadcastMyVoiceState]);

  // Toggle camera
  const toggleCamera = React.useCallback(async () => {
    if (isCameraOn) {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
        setVideoStream(null);
      }
      setIsCameraOn(false);
      isCameraOnRef.current = false;

      if (livekitRoomRef.current?.localParticipant) {
        try {
          const pub = livekitRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub && pub.track) {
            livekitRoomRef.current.localParticipant.unpublishTrack(pub.track);
          }
        } catch (lkErr) {
          console.warn('[LiveKit] Error unpublishing camera:', lkErr);
        }
      }

      const fallbackTrack = screenStreamRef.current?.getVideoTracks()[0] || null;
      peerConnectionsRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(fallbackTrack);
        }
      });
      broadcastMyVoiceState({ is_camera_on: false });
    } else {
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false,
        });
        setVideoStream(vStream);
        videoStreamRef.current = vStream;
        setIsCameraOn(true);
        isCameraOnRef.current = true;
        const vTrack = vStream.getVideoTracks()[0];

        if (livekitRoomRef.current?.localParticipant && vTrack) {
          try {
            await livekitRoomRef.current.localParticipant.publishTrack(vTrack, { source: Track.Source.Camera });
          } catch (lkErr) {
            console.warn('[LiveKit] Error publishing camera track:', lkErr);
          }
        }

        peerConnectionsRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(vTrack);
          } else {
            try { pc.addTrack(vTrack, vStream); } catch {}
          }
        });
        broadcastMyVoiceState({ is_camera_on: true });
      } catch (err) {
        console.warn('Failed to start webcam:', err);
      }
    }
  }, [isCameraOn, broadcastMyVoiceState]);

  // Toggle screen share
  const toggleScreenShare = React.useCallback(async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      isScreenSharingRef.current = false;

      if (livekitRoomRef.current?.localParticipant) {
        try {
          const pub = livekitRoomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
          if (pub && pub.track) {
            livekitRoomRef.current.localParticipant.unpublishTrack(pub.track);
          }
        } catch (lkErr) {
          console.warn('[LiveKit] Error unpublishing screen share:', lkErr);
        }
      }

      const fallbackTrack = videoStreamRef.current?.getVideoTracks()[0] || null;
      peerConnectionsRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(fallbackTrack);
        }
      });
      broadcastMyVoiceState({ is_screen_sharing: false });
    } else {
      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 } },
          audio: true,
        });

        const videoTrack = sStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            if (screenStreamRef.current) {
              screenStreamRef.current.getTracks().forEach((t) => t.stop());
              screenStreamRef.current = null;
            }
            setScreenStream(null);
            setIsScreenSharing(false);
            isScreenSharingRef.current = false;

            if (livekitRoomRef.current?.localParticipant) {
              try {
                const pub = livekitRoomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
                if (pub && pub.track) {
                  livekitRoomRef.current.localParticipant.unpublishTrack(pub.track);
                }
              } catch (lkErr) {
                console.warn('[LiveKit] Error unpublishing screen share onended:', lkErr);
              }
            }

            const camTrack = videoStreamRef.current?.getVideoTracks()[0] || null;
            peerConnectionsRef.current.forEach((pc) => {
              const senders = pc.getSenders();
              const videoSender = senders.find((s) => s.track?.kind === 'video');
              if (videoSender) {
                videoSender.replaceTrack(camTrack);
              }
            });
            broadcastMyVoiceState({ is_screen_sharing: false });
          };
        }

        setScreenStream(sStream);
        screenStreamRef.current = sStream;
        setIsScreenSharing(true);
        isScreenSharingRef.current = true;

        if (livekitRoomRef.current?.localParticipant && videoTrack) {
          try {
            await livekitRoomRef.current.localParticipant.publishTrack(videoTrack, { source: Track.Source.ScreenShare });
          } catch (lkErr) {
            console.warn('[LiveKit] Error publishing screen share:', lkErr);
          }
        }

        peerConnectionsRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(videoTrack);
          } else {
            try { pc.addTrack(videoTrack, sStream); } catch {}
          }
        });
        broadcastMyVoiceState({ is_screen_sharing: true });
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    }
  }, [isScreenSharing, broadcastMyVoiceState]);

  // Update AI Noise Suppression Mode
  const setNoiseSuppressionMode = React.useCallback((mode: NoiseCancellationMode) => {
    if (mode === noiseSuppressionModeRef.current) return;
    noiseSuppressionModeRef.current = mode;
    setNoiseSuppressionModeState(mode);
    try {
      localStorage.setItem('nexus_noise_suppression_mode', mode);
      localStorage.setItem('nexus_noise_suppression', String(mode !== 'off'));
    } catch {}

    if (dspPipelineRef.current) {
      dspPipelineRef.current.setMode(mode);
    } else if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        applyProcessingPolicy(track, mode === 'off' ? 'off' : 'browser').catch(() => {});
      });
    }
  }, []);

  // Toggle AI Noise Suppression
  const toggleNoiseSuppression = React.useCallback(() => {
    const nextMode: NoiseCancellationMode =
      noiseSuppressionMode === 'balanced' ? 'strong' :
      noiseSuppressionMode === 'strong' ? 'off' : 'balanced';
    setNoiseSuppressionMode(nextMode);
  }, [noiseSuppressionMode, setNoiseSuppressionMode]);

  // Synchronize with external settings modal mode updates in real-time
  React.useEffect(() => {
    const handleModeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode: NoiseCancellationMode }>;
      const targetMode = customEvent.detail?.mode;
      if (targetMode && targetMode !== noiseSuppressionModeRef.current) {
        setNoiseSuppressionMode(targetMode);
      }
    };
    const handleDesktopDspEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ active: boolean; engine?: string }>;
      if (customEvent.detail?.active) {
        if (dspPipelineRef.current) {
          dspPipelineRef.current.setMode('off');
        }
      } else {
        if (dspPipelineRef.current) {
          dspPipelineRef.current.setMode(noiseSuppressionModeRef.current);
        }
      }
    };

    window.addEventListener('gcp_noise_mode_changed', handleModeEvent);
    window.addEventListener('gcp_desktop_dsp_active', handleDesktopDspEvent);
    return () => {
      window.removeEventListener('gcp_noise_mode_changed', handleModeEvent);
      window.removeEventListener('gcp_desktop_dsp_active', handleDesktopDspEvent);
    };
  }, [setNoiseSuppressionMode]);

  // Broadcast soundboard clip
  const broadcastSoundboard = React.useCallback(
    (clip: SoundboardClip) => {
      soundboardEngine.playClip(clip);
      if (realtimeChannelRef.current) {
        try {
          realtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'soundboard',
            payload: clip,
          });
        } catch {}
      }
    },
    []
  );

  const value: ServerVoiceContextType = {
    activeServerId,
    activeChannelId,
    activeChannelName,
    activeServerName,
    isVoiceConnected,
    isConnecting,
    isLiveKitActive,
    isKrispActive,
    isMicMuted,
    isDeafened,
    isCameraOn,
    isScreenSharing,
    isNoiseSuppressionEnabled,
    noiseSuppressionMode,
    isSpeaking,
    audioLevel,
    localStream,
    videoStream,
    screenStream,
    remoteParticipants,
    remoteVideoStreams,
    channelOccupants,

    joinVoiceChannel,
    disconnectVoice,
    toggleMic,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    toggleNoiseSuppression,
    setNoiseSuppressionMode,
    broadcastSoundboard,
    incomingVolume,
    setIncomingVolume,
    setMicMutedExplicit,
    setDeafenedExplicit,
    forceMute,
  };

  return <ServerVoiceContext.Provider value={value}>{children}</ServerVoiceContext.Provider>;
}

export function useServerVoiceContext() {
  const context = React.useContext(ServerVoiceContext);
  if (!context) {
    throw new Error('useServerVoiceContext must be used within a ServerVoiceProvider');
  }
  return context;
}
