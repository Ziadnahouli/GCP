'use client';

import '@/lib/webrtc/safe-constraints';
import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { useToast } from '@/components/ui/toast';
import { getBrowserClient } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DiagnosticsStats } from '@/components/calls/network-diagnostics';
import { soundboardEngine, SoundboardClip } from '@/lib/soundboard/audio-engine';
import {
  DEFAULT_RTC_CONFIG,
  cleanIceCandidate,
  getLocalZeroTierIp,
  getPeerZeroTierIp,
  setPeerZeroTierIp,
  unmaskCandidate,
  synthesizeZeroTierCandidate,
} from '@/lib/webrtc/ice-config';

export type CallStatus = 'idle' | 'outgoing_ringing' | 'incoming_ringing' | 'in_call' | 'ended';

export interface CallParticipant {
  id: string;
  name: string;
  avatar_url?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}

export interface IncomingCallData {
  id?: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  targetUserId: string;
  conversationId: string;
  isVideo: boolean;
  sdp?: RTCSessionDescriptionInit | null;
  callerZeroTierIp?: string | null;
  isGroup?: boolean;
  groupName?: string | null;
}

interface CallContextType {
  callStatus: CallStatus;
  activeConversationId: string | null;
  isVideoCall: boolean;
  isGroupCall: boolean;
  isLiveKitActive: boolean;
  isKrispActive: boolean;
  isMicMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  incomingCall: IncomingCallData | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  participants: CallParticipant[];
  stats: DiagnosticsStats;
  startCall: (targetUserId: string, conversationId: string, video?: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  restartConnection: () => Promise<void>;
  toggleMic: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  broadcastSoundboardClip: (clip: SoundboardClip) => void;
  isNoiseSuppressionEnabled: boolean;
  toggleNoiseSuppression: () => void;
  peerZeroTierIp: string | null;
  setPeerZeroTierDirectIp: (ip: string) => void;
  incomingVolume: number;
  setIncomingVolume: (volume: number) => Promise<void>;
  setMicMutedExplicit: (muted: boolean) => Promise<void>;
  setDeafenedExplicit: (deafened: boolean) => Promise<void>;
  forceMute: () => void;
  activeSquadCalls: Map<string, any>;
  isSquadCallActive: (conversationId?: string | null) => boolean;
  getSquadCallParticipants: (conversationId?: string | null) => Array<{
    id: string;
    name: string;
    avatar_url?: string | null;
    isSpeaking?: boolean;
    isMuted?: boolean;
  }>;
  registerSquadCallActive?: (conversationId: string, payload: any) => void;
  unregisterSquadCall?: (conversationId: string) => void;
}

export const CallContext = React.createContext<CallContextType | null>(null);

// Procedural Web Audio Ringtone Generator (no external assets needed)
class RingtonePlayer {
  private static activeInstance: RingtonePlayer | null = null;
  private ctx: AudioContext | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private activeGain: GainNode | null = null;
  private activeOsc: OscillatorNode | null = null;
  private isRunning: boolean = false;

  static isPlaying(): boolean {
    return Boolean(RingtonePlayer.activeInstance && RingtonePlayer.activeInstance.isRunning);
  }

  static stopAll() {
    if (RingtonePlayer.activeInstance) {
      try {
        RingtonePlayer.activeInstance.stop();
      } catch {}
      RingtonePlayer.activeInstance = null;
    }
  }

  start() {
    if (this.isRunning) return;
    RingtonePlayer.stopAll();
    RingtonePlayer.activeInstance = this;
    this.isRunning = true;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const playTone = () => {
        if (!this.isRunning || !this.ctx || this.ctx.state === 'closed') return;
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          this.activeOsc = osc;
          this.activeGain = gain;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, this.ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.35);

          gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.4);
        } catch {}
      };

      playTone();
      this.intervalId = setInterval(playTone, 2000);
    } catch {}
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.activeGain && this.ctx) {
      try {
        this.activeGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.activeGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
      this.activeGain = null;
    }
    if (this.activeOsc) {
      try {
        this.activeOsc.stop();
        this.activeOsc.disconnect();
      } catch {}
      this.activeOsc = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
    if (RingtonePlayer.activeInstance === this) {
      RingtonePlayer.activeInstance = null;
    }
  }
}

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

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, settings } = useAuth();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [callStatus, setCallStatus] = React.useState<CallStatus>('idle');
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [peerUserId, setPeerUserId] = React.useState<string | null>(null);
  const [peerName, setPeerName] = React.useState<string>('Squadmate');
  const [isVideoCall, setIsVideoCall] = React.useState(false);
  const [isGroupCall, setIsGroupCall] = React.useState(false);
  const isGroupCallRef = React.useRef(false);
  isGroupCallRef.current = isGroupCall;

  // Active squad calls tracker across groups
  const [activeSquadCalls, setActiveSquadCalls] = React.useState<Map<string, any>>(new Map());
  const squadHeartbeatRef = React.useRef<NodeJS.Timeout | null>(null);

  const isSquadCallActive = React.useCallback(
    (convId?: string | null) => {
      if (!convId) return false;
      if (activeSquadCalls.has(convId)) return true;
      if (isGroupCallRef.current && activeConversationIdRef.current === convId && callStatusRef.current === 'in_call') return true;
      if (incomingCallRef.current?.isGroup && incomingCallRef.current?.conversationId === convId) return true;
      return false;
    },
    [activeSquadCalls]
  );

  const registerSquadCallActive = React.useCallback((convId: string, payload: any) => {
    if (!convId) return;
    setActiveSquadCalls((prev) => {
      const next = new Map(prev);
      next.set(convId, payload);
      return next;
    });
  }, []);

  const unregisterSquadCall = React.useCallback((convId: string) => {
    if (!convId) return;
    setActiveSquadCalls((prev) => {
      if (!prev.has(convId)) return prev;
      const next = new Map(prev);
      next.delete(convId);
      return next;
    });
  }, []);

  // Incoming call state
  const [incomingCall, setIncomingCall] = React.useState<IncomingCallData | null>(null);

  // Media streams
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = React.useState<MediaStream | null>(null);

  // Media toggles
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
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nexus_noise_suppression');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  const [isLiveKitActive, setIsLiveKitActive] = React.useState(false);
  const [isKrispActive, setIsKrispActive] = React.useState(false);
  const livekitRoomRef = React.useRef<any>(null);
  const krispProcessorRef = React.useRef<any>(null);
  const mediaTransportRef = React.useRef<'livekit' | 'webrtc' | 'none'>('none');

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

  const isDeafenedRef = React.useRef(isDeafened);
  React.useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  const isMicMutedRef = React.useRef(isMicMuted);
  React.useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Stable references
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const screenStreamRef = React.useRef<MediaStream | null>(null);
  const ringtoneRef = React.useRef<RingtonePlayer | null>(null);
  const isStartingCallRef = React.useRef<boolean>(false);
  const ringingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const iceWatchdogTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const iceRestartingRef = React.useRef<boolean>(false);
  const activeCallPayloadRef = React.useRef<IncomingCallData | null>(null);
  const activeCallSessionIdRef = React.useRef<string | null>(null);
  const dbCallSessionIdRef = React.useRef<string | null>(null);
  const ringingBeaconRef = React.useRef<NodeJS.Timeout | null>(null);
  const callStatusRef = React.useRef<CallStatus>('idle');
  callStatusRef.current = callStatus;
  const roomChannelRef = React.useRef<RealtimeChannel | null>(null);
  const sessionStatusChannelRef = React.useRef<RealtimeChannel | null>(null);
  const recentlyDeclinedCallsRef = React.useRef<Map<string, number>>(new Map());
  const outboundChannelsRef = React.useRef<Map<string, RealtimeChannel>>(new Map());
  const outboundQueueRef = React.useRef<Map<string, Array<{ event: string; payload: unknown }>>>(new Map());
  const roomQueueRef = React.useRef<Array<{ event: string; payload: unknown }>>([]);
  const remoteAudioElementRef = React.useRef<HTMLAudioElement | null>(null);
  const activeConversationIdRef = React.useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;
  const peerUserIdRef = React.useRef<string | null>(null);
  peerUserIdRef.current = peerUserId;
  const incomingCallRef = React.useRef<IncomingCallData | null>(null);
  incomingCallRef.current = incomingCall;
  const seenSignalIdsRef = React.useRef<Set<string>>(new Set());

  // Web Audio Studio-Grade DSP Noise Suppression references
  const rawMicStreamRef = React.useRef<MediaStream | null>(null);
  const dspAudioCtxRef = React.useRef<AudioContext | null>(null);
  const dspFilterNodesRef = React.useRef<{
    source: MediaStreamAudioSourceNode;
    highpass: BiquadFilterNode;
    notch: BiquadFilterNode;
    highshelf: BiquadFilterNode;
    gateGain: GainNode;
    compressor: DynamicsCompressorNode;
    destination: MediaStreamAudioDestinationNode;
    analyser: AnalyserNode;
    animFrame: number | null;
  } | null>(null);

  // ZeroTier Virtual LAN IP states
  const [peerZeroTierIp, setPeerZeroTierIpState] = React.useState<string | null>(() => getPeerZeroTierIp());
  const peerZeroTierIpRef = React.useRef<string | null>(null);
  if (peerZeroTierIpRef.current === null && typeof window !== 'undefined') {
    peerZeroTierIpRef.current = getPeerZeroTierIp();
  }

  // ICE candidates buffering and deduplication
  const localIceCandidatesRef = React.useRef<RTCIceCandidateInit[]>([]);
  const pendingRemoteCandidatesRef = React.useRef<RTCIceCandidateInit[]>([]);
  const seenCandidatesRef = React.useRef<Set<string>>(new Set());

  const [participants, setParticipants] = React.useState<CallParticipant[]>([]);
  const participantsRef = React.useRef<CallParticipant[]>([]);
  participantsRef.current = participants;

  const reconnectAttemptsRef = React.useRef<number>(0);
  const reconnectFailuresRef = React.useRef<number>(0);
  const lastReconnectReasonRef = React.useRef<string | null>(null);
  const lastFailureTimestampRef = React.useRef<string | null>(null);
  const micLevelRef = React.useRef<number>(0);

  const [stats, setStats] = React.useState<DiagnosticsStats>({
    connectionState: 'disconnected',
    rttMs: null,
    jitterMs: null,
    packetLossPercent: null,
    packetsLost: 0,
    packetsReceived: 0,
    packetsSent: 0,
    incomingBitrateKbps: null,
    outgoingBitrateKbps: null,
    transportPath: 'unknown',
    isZeroTierActive: false,
    micLevel: 0,
    isMicMuted: false,
    reconnectAttempts: 0,
    reconnectFailures: 0,
    lastReconnectReason: null,
    lastFailureTimestamp: null,
    audioDevice: {
      label: 'Default Audio Device',
      sampleRate: 48000,
      channelCount: 1,
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true,
    },
    isNoiseSuppressionEnabled: true,
    isKrispActive: false,
    videoPublishing: {
      isPublishingCamera: false,
      cameraResolution: null,
      cameraFrameRate: null,
      isPublishingScreen: false,
      screenResolution: null,
      screenFrameRate: null,
    },
  });

  const prevStatsRef = React.useRef<{
    timestamp: number;
    bytesReceived: number;
    bytesSent: number;
  } | null>(null);

  // Helper to reliably send a signal to a peer's personal channel with FIFO queuing
  const sendSignalToUser = React.useCallback(
    (targetUserId: string, event: string, payload: unknown) => {
      if (!supabase || !targetUserId) return;

      let queue = outboundQueueRef.current.get(targetUserId);
      if (!queue) {
        queue = [];
        outboundQueueRef.current.set(targetUserId, queue);
      }

      let channelToUse = outboundChannelsRef.current.get(targetUserId);

      // If existing channel is closed or errored from prior disconnected call, remove and re-subscribe cleanly
      if (channelToUse && channelToUse.state !== 'joined' && channelToUse.state !== 'joining') {
        try {
          supabase.removeChannel(channelToUse);
        } catch {}
        outboundChannelsRef.current.delete(targetUserId);
        channelToUse = undefined;
      }

      if (channelToUse && channelToUse.state === 'joined') {
        channelToUse
          .send({
            type: 'broadcast',
            event,
            payload,
          })
          .catch((err) => {
            console.warn('[CallSignaling] Error sending to user channel:', err);
          });
        return;
      }

      // If channel is joining or not yet created, queue signal for delivery on join
      queue.push({ event, payload });

      if (!channelToUse) {
        const ch = supabase.channel(`user-signals-${targetUserId}`);
        outboundChannelsRef.current.set(targetUserId, ch);

        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            const pending = outboundQueueRef.current.get(targetUserId) || [];
            while (pending.length > 0) {
              const msg = pending.shift();
              if (msg) {
                ch.send({
                  type: 'broadcast',
                  event: msg.event,
                  payload: msg.payload,
                }).catch(() => {});
              }
            }
          }
        });
      }
    },
    [supabase]
  );

  // Dedicated guaranteed signal sender that is resilient against immediate stopMediaTracks() cleanup
  const sendDirectSignal = React.useCallback(
    (channelTopic: string, event: string, payload: unknown) => {
      if (!supabase || !channelTopic) return;
      try {
        const ch = supabase.channel(channelTopic);
        if (ch.state === 'joined') {
          ch.send({ type: 'broadcast', event, payload }).catch(() => {});
          return;
        }
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            ch.send({ type: 'broadcast', event, payload })
              .catch(() => {})
              .finally(() => {
                setTimeout(() => {
                  try {
                    supabase.removeChannel(ch);
                  } catch {}
                }, 1500);
              });
          }
        });
      } catch (err) {
        console.warn('[CallSignaling] Error in sendDirectSignal:', err);
      }
    },
    [supabase]
  );

  // Helper to broadcast on the active room channel with FIFO queuing
  const sendSignalToRoom = React.useCallback((event: string, payload: unknown) => {
    const ch = roomChannelRef.current;
    if (ch && ch.state === 'joined') {
      ch.send({
        type: 'broadcast',
        event,
        payload,
      }).catch(() => {});
      return;
    }

    // Queue signal until room channel joins
    roomQueueRef.current.push({ event, payload });
  }, []);

  // Flush queued room signals once subscribed
  const flushRoomQueue = React.useCallback(() => {
    const ch = roomChannelRef.current;
    if (!ch || ch.state !== 'joined') return;
    while (roomQueueRef.current.length > 0) {
      const msg = roomQueueRef.current.shift();
      if (msg) {
        ch.send({
          type: 'broadcast',
          event: msg.event,
          payload: msg.payload,
        }).catch(() => {});
      }
    }
  }, []);

  // Broadcast soundboard clip to call room and peer so remote listener hears it
  const broadcastSoundboardClip = React.useCallback(
    (clip: SoundboardClip) => {
      if (!user) return;
      const payload = {
        clip,
        senderId: user.id,
        senderName: profile?.display_name || profile?.username || 'Squadmate',
      };

      sendSignalToRoom('soundboard_play', payload);
      if (peerUserId) {
        sendSignalToUser(peerUserId, 'soundboard_play', payload);
      }
    },
    [user, profile, peerUserId, sendSignalToRoom, sendSignalToUser]
  );

  // Toggle noise suppression for microphone dynamically in active call
  const toggleNoiseSuppression = React.useCallback(async () => {
    const nextState = !isNoiseSuppressionEnabled;
    setIsNoiseSuppressionEnabled(nextState);
    try {
      localStorage.setItem('nexus_noise_suppression', String(nextState));
    } catch {}

    // 1. Update live DSP audio graph nodes immediately
    if (dspFilterNodesRef.current && dspAudioCtxRef.current) {
      const ctx = dspAudioCtxRef.current;
      const { notch, highshelf, gateGain } = dspFilterNodesRef.current;
      try {
        notch.gain.setValueAtTime(nextState ? 2.5 : 0, ctx.currentTime);
        highshelf.gain.setValueAtTime(nextState ? -4.5 : 0, ctx.currentTime);
        if (!nextState) {
          gateGain.gain.cancelScheduledValues(ctx.currentTime);
          gateGain.gain.setValueAtTime(1.0, ctx.currentTime);
        }
      } catch {}
    }

    // 2. Apply updated constraints to all active raw microphone audio tracks
    if (rawMicStreamRef.current) {
      const audioTracks = rawMicStreamRef.current.getAudioTracks();
      for (const track of audioTracks) {
        try {
          await track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: nextState,
            autoGainControl: nextState,
          });
        } catch (err) {
          console.warn('[CallContext] applyConstraints for noise suppression notice:', err);
        }
      }
    }

    // 3. Toggle Krisp AI neural noise filter if active
    if (krispProcessorRef.current) {
      try {
        krispProcessorRef.current.setEnabled(nextState);
      } catch (krispErr) {
        console.warn('[CallContext] Error toggling Krisp filter:', krispErr);
      }
    }

    toast({
      title: nextState
        ? isLiveKitActive
          ? 'Krisp AI Noise Filter Active'
          : 'Studio Noise Cancellation Active'
        : 'Noise Suppression Off',
      description: nextState
        ? isLiveKitActive
          ? 'LiveKit Cloud neural acoustic isolation: keyboard clicks, background noise removed.'
          : 'Acoustic DSP active: room rumble, keyboard clicks, and fan hiss removed.'
        : 'Raw microphone pass-through active.',
      type: nextState ? 'success' : 'info',
      duration: 2500,
    });
  }, [isNoiseSuppressionEnabled, isLiveKitActive, toast]);

  // Helper to cleanly merge/update tracks into remoteStreamRef without dropping audio or video
  const attachRemoteTrack = React.useCallback((track: MediaStreamTrack) => {
    track.enabled = true;
    if (!remoteStreamRef.current) {
      remoteStreamRef.current = new MediaStream();
    }
    const currentStream = remoteStreamRef.current;
    const existingSameKind = currentStream.getTracks().find((t) => t.kind === track.kind);
    let trackListChanged = false;

    if (existingSameKind && existingSameKind.id !== track.id) {
      try {
        currentStream.removeTrack(existingSameKind);
        trackListChanged = true;
      } catch {}
    }
    if (!currentStream.getTracks().some((t) => t.id === track.id)) {
      currentStream.addTrack(track);
      trackListChanged = true;
    }

    if (trackListChanged) {
      setRemoteStream(new MediaStream(currentStream.getTracks()));
    }

    // Attach unmute listener to ensure camera active state activates immediately on first packet
    if (track.kind === 'video') {
      track.onunmute = () => {
        track.enabled = true;
        setParticipants((prev) =>
          prev.map((p) => (p.id !== user?.id ? { ...p, isCameraOn: true } : p))
        );
      };
    }

    // Also update remote persistent audio element if this is an audio track
    if (track.kind === 'audio' && remoteAudioElementRef.current) {
      if (mediaTransportRef.current === 'livekit') {
        // LiveKit SFU is authoritative for audio playback; suppress WebRTC fallback playback
        return;
      }
      if (remoteAudioElementRef.current.srcObject !== currentStream) {
        remoteAudioElementRef.current.srcObject = currentStream;
      }
      remoteAudioElementRef.current.muted = isDeafened;
      remoteAudioElementRef.current.play().catch(() => {});
    }
  }, [isDeafened, user?.id]);

  // Update participant media state from remote signals
  const handlePeerMediaToggle = React.useCallback(
    (payload: { userId?: string; isCameraOn?: boolean; isScreenSharing?: boolean; isMuted?: boolean }) => {
      if (!payload?.userId || payload.userId === user?.id) return;
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id === payload.userId) {
            return {
              ...p,
              isCameraOn: payload.isCameraOn !== undefined ? payload.isCameraOn : p.isCameraOn,
              isScreenSharing: payload.isScreenSharing !== undefined ? payload.isScreenSharing : p.isScreenSharing,
              isMuted: payload.isMuted !== undefined ? payload.isMuted : p.isMuted,
            };
          }
          return p;
        })
      );

      // If remote peer turned on camera or screen share, ensure their remote video transceiver track is attached
      if ((payload.isCameraOn || payload.isScreenSharing) && pcRef.current) {
        const videoTransceiver = pcRef.current.getTransceivers().find(
          (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
        );
        const recTrack =
          videoTransceiver?.receiver?.track ||
          pcRef.current.getReceivers().find((r) => r.track?.kind === 'video')?.track;
        if (recTrack) {
          recTrack.enabled = true;
          attachRemoteTrack(recTrack);
        }
      } else if (payload.isCameraOn === false && !payload.isScreenSharing) {
        // Clean up remote video track if remote peer turns camera off
        if (remoteStreamRef.current) {
          remoteStreamRef.current.getVideoTracks().forEach((vt) => {
            remoteStreamRef.current?.removeTrack(vt);
          });
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
        }
      }
    },
    [user?.id, attachRemoteTrack]
  );

  // Helper to reliably find the video sender on an active peer connection
  const getVideoSender = React.useCallback((pc: RTCPeerConnection) => {
    const videoTransceiver = pc.getTransceivers().find(
      (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
    );
    if (videoTransceiver) {
      if (videoTransceiver.direction === 'recvonly') {
        videoTransceiver.direction = 'sendrecv';
      } else if (videoTransceiver.direction === 'inactive') {
        videoTransceiver.direction = 'sendonly';
      }
      if (videoTransceiver.sender) return videoTransceiver.sender;
    }
    return pc.getSenders().find((s) => s.track?.kind === 'video') || null;
  }, []);

  // Centralized call state cleanup
  const stopMediaTracks = React.useCallback(() => {
    RingtonePlayer.stopAll();
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }
    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
    if (ringingBeaconRef.current) {
      clearInterval(ringingBeaconRef.current);
      ringingBeaconRef.current = null;
    }
    if (iceWatchdogTimerRef.current) {
      clearTimeout(iceWatchdogTimerRef.current);
      iceWatchdogTimerRef.current = null;
    }
    iceRestartingRef.current = false;
    outboundQueueRef.current.clear();
    roomQueueRef.current = [];

    // Clean up LiveKit Cloud SFU room and Krisp AI processor
    if (livekitRoomRef.current) {
      try {
        livekitRoomRef.current.disconnect();
      } catch {}
      livekitRoomRef.current = null;
    }
    krispProcessorRef.current = null;
    setIsKrispActive(false);
    mediaTransportRef.current = 'none';

    // Clean up DSP noise cancellation pipeline
    if (dspFilterNodesRef.current?.animFrame) {
      cancelAnimationFrame(dspFilterNodesRef.current.animFrame);
    }
    dspFilterNodesRef.current = null;
    if (dspAudioCtxRef.current) {
      try {
        dspAudioCtxRef.current.close();
      } catch {}
      dspAudioCtxRef.current = null;
    }
    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      rawMicStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setScreenStream(null);
    remoteStreamRef.current = null;

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }

    if (supabase) {
      outboundChannelsRef.current.forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch {}
      });
    }
    outboundChannelsRef.current.clear();

    if (roomChannelRef.current && supabase) {
      try {
        roomChannelRef.current.unsubscribe();
        supabase.removeChannel(roomChannelRef.current);
      } catch {}
      roomChannelRef.current = null;
    }

    if (sessionStatusChannelRef.current && supabase) {
      try {
        sessionStatusChannelRef.current.unsubscribe();
        supabase.removeChannel(sessionStatusChannelRef.current);
      } catch {}
      sessionStatusChannelRef.current = null;
    }
    isStartingCallRef.current = false;

    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.pause();
      remoteAudioElementRef.current.srcObject = null;
    }

    localIceCandidatesRef.current = [];
    pendingRemoteCandidatesRef.current = [];
    seenCandidatesRef.current.clear();

    // Reset synchronous references
    activeCallPayloadRef.current = null;
    activeCallSessionIdRef.current = null;
    dbCallSessionIdRef.current = null;
    activeConversationIdRef.current = null;
    peerUserIdRef.current = null;
    incomingCallRef.current = null;
    callStatusRef.current = 'idle';
    prevStatsRef.current = null;

    // Reset all React call states
    setCallStatus('idle');
    setActiveConversationId(null);
    setPeerUserId(null);
    setIncomingCall(null);
    setIsVideoCall(false);
    setIsCameraOn(false);
    setIsMicMuted(false);
    setIsDeafened(false);
    setIsScreenSharing(false);
    setIsLiveKitActive(false);
    setParticipants([]);
    setStats({
      connectionState: 'disconnected',
      rttMs: null,
      jitterMs: null,
      packetLossPercent: null,
      incomingBitrateKbps: null,
      outgoingBitrateKbps: null,
      transportPath: 'unknown',
      isZeroTierActive: false,
    });
  }, [supabase]);

  // Clean up all outbound channels on unmount
  React.useEffect(() => {
    const outboundMap = outboundChannelsRef.current;
    return () => {
      outboundMap.forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch {}
      });
      outboundMap.clear();
    };
  }, [supabase]);

  // Handle remote audio playback directly via persistent HTML audio element
  React.useEffect(() => {
    const audioEl = remoteAudioElementRef.current;
    if (!audioEl) return;

    if (remoteStream) {
      if (mediaTransportRef.current !== 'livekit') {
        if (audioEl.srcObject !== remoteStream) {
          audioEl.srcObject = remoteStream;
        }
      }
      audioEl.muted = isDeafened;
      audioEl.volume = 1.0;

      remoteStream.getAudioTracks().forEach((track) => {
        track.enabled = !isDeafened;
        track.onunmute = () => {
          if (!isDeafened) {
            audioEl.play().catch(() => {});
          }
        };
      });

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[CallAudio] Autoplay waiting for user gesture:', err);
          const unlock = () => {
            audioEl.play().catch(() => {});
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
          };
          window.addEventListener('click', unlock, { once: true });
          window.addEventListener('keydown', unlock, { once: true });
        });
      }
    } else {
      audioEl.pause();
      if (mediaTransportRef.current !== 'livekit') {
        audioEl.srcObject = null;
      }
    }
  }, [remoteStream, isDeafened]);

  // Synchronize deafen toggle instantly to persistent audio element
  React.useEffect(() => {
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = isDeafened;
    }
  }, [isDeafened]);

  // Global user interaction unblocker for browser audio context and media autoplay policies
  React.useEffect(() => {
    const unlockAudio = async () => {
      if (livekitRoomRef.current) {
        livekitRoomRef.current.startAudio().catch(() => {});
      }
      if (dspAudioCtxRef.current && dspAudioCtxRef.current.state === 'suspended') {
        try {
          await dspAudioCtxRef.current.resume();
        } catch {}
      }
      const audioEl = remoteAudioElementRef.current;
      if (audioEl && audioEl.paused) {
        try {
          await audioEl.play();
        } catch {}
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
  }, [remoteStream]);

  // Web Audio Speech Activity Monitoring for remote audio
  React.useEffect(() => {
    if (callStatus !== 'in_call' || !remoteStream) return;

    let audioCtx: AudioContext | null = null;
    let animId: number | null = null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioTracks = remoteStream.getAudioTracks();
      if (audioTracks.length === 0) return;

      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(remoteStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const timeBuffer = new Uint8Array(analyser.fftSize);

      const checkVolume = () => {
        if (!analyser || !audioCtx) return;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        analyser.getByteTimeDomainData(timeBuffer);

        let sumSquares = 0;
        for (let i = 0; i < timeBuffer.length; i++) {
          const s = (timeBuffer[i] - 128) / 128;
          sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / timeBuffer.length);
        const isSpeaking = rms > 0.02;

        setParticipants((prev) =>
          prev.map((p) => {
            if (p.id !== user?.id) {
              return p.isSpeaking === isSpeaking ? p : { ...p, isSpeaking };
            }
            return p;
          })
        );

        animId = requestAnimationFrame(checkVolume);
      };

      animId = requestAnimationFrame(checkVolume);
    } catch {}

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx) {
        try {
          audioCtx.close();
        } catch {}
      }
    };
  }, [callStatus, remoteStream, user?.id]);

  // Web Audio Speech Activity Monitoring for local mic
  React.useEffect(() => {
    if (callStatus !== 'in_call' || !localStream || isMicMuted) {
      micLevelRef.current = 0;
      setParticipants((prev) =>
        prev.map((p) => (p.id === user?.id && p.isSpeaking ? { ...p, isSpeaking: false } : p))
      );
      return;
    }

    let audioCtx: AudioContext | null = null;
    let animId: number | null = null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length === 0) return;

      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      // Keep pipeline active via silent gain node
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      source.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      const timeBuffer = new Uint8Array(analyser.fftSize);

      const checkVolume = () => {
        if (!analyser || !audioCtx) return;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        analyser.getByteTimeDomainData(timeBuffer);

        let sumSquares = 0;
        for (let i = 0; i < timeBuffer.length; i++) {
          const s = (timeBuffer[i] - 128) / 128;
          sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / timeBuffer.length);
        const isSpeaking = rms > 0.02;
        micLevelRef.current = isMicMuted ? 0 : Math.min(100, Math.round(rms * 350));

        setParticipants((prev) =>
          prev.map((p) => {
            if (p.id === user?.id) {
              return p.isSpeaking === isSpeaking ? p : { ...p, isSpeaking };
            }
            return p;
          })
        );

        animId = requestAnimationFrame(checkVolume);
      };

      animId = requestAnimationFrame(checkVolume);
    } catch {}

    return () => {
      micLevelRef.current = 0;
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx) {
        try {
          audioCtx.close();
        } catch {}
      }
    };
  }, [callStatus, localStream, isMicMuted, user?.id]);

  // Real-time WebRTC stats polling from native peer connection
  React.useEffect(() => {
    if (callStatus !== 'in_call') {
      const connState =
        callStatus === 'outgoing_ringing' || callStatus === 'incoming_ringing'
          ? 'connecting'
          : 'disconnected';

      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      const audioSettings = audioTrack?.getSettings?.() || {};

      setStats({
        connectionState: connState,
        rttMs: null,
        jitterMs: null,
        packetLossPercent: null,
        packetsLost: 0,
        packetsReceived: 0,
        packetsSent: 0,
        incomingBitrateKbps: null,
        outgoingBitrateKbps: null,
        transportPath: 'unknown',
        isZeroTierActive: false,
        micLevel: 0,
        isMicMuted: isMicMutedRef.current,
        reconnectAttempts: reconnectAttemptsRef.current,
        reconnectFailures: reconnectFailuresRef.current,
        lastReconnectReason: lastReconnectReasonRef.current,
        lastFailureTimestamp: lastFailureTimestampRef.current,
        audioDevice: {
          label: audioTrack?.label || 'Default Audio Device',
          sampleRate: audioSettings.sampleRate ?? 48000,
          channelCount: audioSettings.channelCount ?? 1,
          echoCancellation: audioSettings.echoCancellation ?? true,
          autoGainControl: audioSettings.autoGainControl ?? true,
          noiseSuppression: audioSettings.noiseSuppression ?? true,
        },
        isNoiseSuppressionEnabled: isNoiseSuppressionEnabled,
        isKrispActive: isKrispActive,
        videoPublishing: {
          isPublishingCamera: false,
          cameraResolution: null,
          cameraFrameRate: null,
          isPublishingScreen: false,
          screenResolution: null,
          screenFrameRate: null,
        },
      });
      prevStatsRef.current = null;
      return;
    }

    const interval = setInterval(async () => {
      const pc = pcRef.current;
      const lkRoom = livekitRoomRef.current;
      const isLkConnected = lkRoom?.state === 'connected' || isLiveKitActive;

      if (!pc && !isLkConnected) return;

      try {
        const statsReports: RTCStatsReport[] = [];
        if (pc) {
          try {
            const pcStats = await pc.getStats();
            if (pcStats) statsReports.push(pcStats);
          } catch {}
        }
        if (isLkConnected && lkRoom?.engine) {
          const engine = lkRoom.engine;
          const pubTransport = engine.pcManager?.publisher || engine.publisher;
          const subTransport = engine.pcManager?.subscriber || engine.subscriber;
          if (pubTransport?.getStats) {
            try {
              const pubStats = await pubTransport.getStats();
              if (pubStats) statsReports.push(pubStats);
            } catch {}
          }
          if (subTransport?.getStats) {
            try {
              const subStats = await subTransport.getStats();
              if (subStats) statsReports.push(subStats);
            } catch {}
          }
        }

        let rtt: number | null = null;
        let jitter: number | null = null;
        let packetLoss: number | null = null;
        let inBitrate: number | null = null;
        let outBitrate: number | null = null;
        let transportPath: 'direct_p2p' | 'relayed_turn' | 'livekit_sfu' | 'unknown' = isLkConnected
          ? 'livekit_sfu'
          : 'direct_p2p';

        let currentBytesReceived = 0;
        let currentBytesSent = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let packetsSent = 0;

        for (const statsReport of statsReports) {
          statsReport.forEach((report) => {
            if (
              report.type === 'candidate-pair' &&
              (report.state === 'succeeded' || report.nominated)
            ) {
              if (typeof report.currentRoundTripTime === 'number' && report.currentRoundTripTime > 0) {
                rtt = Math.round(report.currentRoundTripTime * 1000);
              } else if (typeof report.roundTripTime === 'number' && report.roundTripTime > 0) {
                rtt = Math.round(report.roundTripTime * 1000);
              }

              if (!isLkConnected) {
                const localCand = statsReport.get(report.localCandidateId);
                const remoteCand = statsReport.get(report.remoteCandidateId);
                if (localCand?.candidateType === 'relay' || remoteCand?.candidateType === 'relay') {
                  transportPath = 'relayed_turn';
                } else {
                  transportPath = 'direct_p2p';
                }
              }
            }

            if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.kind === 'video')) {
              if (typeof report.jitter === 'number') {
                jitter = Math.round(report.jitter * 1000 * 10) / 10;
              }
              if (typeof report.bytesReceived === 'number') {
                currentBytesReceived += report.bytesReceived;
              }
              if (typeof report.packetsLost === 'number') {
                packetsLost += report.packetsLost;
              }
              if (typeof report.packetsReceived === 'number') {
                packetsReceived += report.packetsReceived;
              }
            }

            if (report.type === 'outbound-rtp' && (report.kind === 'audio' || report.kind === 'video')) {
              if (typeof report.bytesSent === 'number') {
                currentBytesSent += report.bytesSent;
              }
              if (typeof report.packetsSent === 'number') {
                packetsSent += report.packetsSent;
              }
            }
          });
        }

        // LiveKit SFU Fallback: if candidate-pair RTT was not measured, query LiveKit SignalClient RTT
        if (rtt === null && isLkConnected) {
          const lkRtt = lkRoom?.engine?.client?.rtt;
          if (typeof lkRtt === 'number' && lkRtt > 0) {
            rtt = Math.round(lkRtt);
          } else {
            // Trigger a background ping for subsequent polling cycles
            lkRoom?.engine?.client?.sendPing?.().catch?.(() => {});
          }
        }

        const totalPackets = packetsReceived + packetsLost;
        if (totalPackets > 0) {
          packetLoss = Math.round((packetsLost / totalPackets) * 1000) / 10;
        }

        const now = performance.now();
        if (prevStatsRef.current) {
          const deltaMs = now - prevStatsRef.current.timestamp;
          if (deltaMs > 0) {
            const inBits = (currentBytesReceived - prevStatsRef.current.bytesReceived) * 8;
            const outBits = (currentBytesSent - prevStatsRef.current.bytesSent) * 8;
            inBitrate = Math.max(0, Math.round(inBits / deltaMs));
            outBitrate = Math.max(0, Math.round(outBits / deltaMs));
          }
        }

        prevStatsRef.current = {
          timestamp: now,
          bytesReceived: currentBytesReceived,
          bytesSent: currentBytesSent,
        };

        const isTauriPresent =
          typeof window !== 'undefined' &&
          ('__TAURI_IPC__' in window || '__TAURI__' in window);

        const isConnected =
          Boolean(pc && (
            pc.connectionState === 'connected' ||
            pc.iceConnectionState === 'connected' ||
            pc.iceConnectionState === 'completed'
          ));

        const isFailed =
          Boolean(pc && (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed'));

        const isLkReconnecting = isLkConnected && lkRoom?.state === 'reconnecting';

        const currentConnectionState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' =
          isLkConnected || isConnected
            ? isLkReconnecting
              ? 'reconnecting'
              : 'connected'
            : isFailed
            ? 'reconnecting'
            : pc?.connectionState === 'closed' || lkRoom?.state === 'disconnected'
            ? 'disconnected'
            : 'connecting';

        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        const audioSettings = audioTrack?.getSettings?.() || {};

        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        const camSettings = camTrack?.getSettings?.() || {};
        const isCamActive = Boolean(isCameraOn && camTrack && camTrack.readyState === 'live');

        const scrTrack = screenStreamRef.current?.getVideoTracks()[0];
        const scrSettings = scrTrack?.getSettings?.() || {};
        const isScreenActive = Boolean(isScreenSharing && scrTrack && scrTrack.readyState === 'live');

        setStats({
          connectionState: currentConnectionState,
          rttMs: rtt,
          jitterMs: jitter,
          packetLossPercent: packetLoss,
          packetsLost,
          packetsReceived,
          packetsSent,
          incomingBitrateKbps: inBitrate,
          outgoingBitrateKbps: outBitrate,
          transportPath,
          isZeroTierActive: isTauriPresent,
          micLevel: micLevelRef.current,
          isMicMuted: isMicMutedRef.current,
          reconnectAttempts: reconnectAttemptsRef.current,
          reconnectFailures: reconnectFailuresRef.current,
          lastReconnectReason: lastReconnectReasonRef.current,
          lastFailureTimestamp: lastFailureTimestampRef.current,
          audioDevice: {
            label: audioTrack?.label || 'Default Audio Device',
            sampleRate: audioSettings.sampleRate ?? 48000,
            channelCount: audioSettings.channelCount ?? 1,
            echoCancellation: audioSettings.echoCancellation ?? true,
            autoGainControl: audioSettings.autoGainControl ?? true,
            noiseSuppression: audioSettings.noiseSuppression ?? true,
          },
          isNoiseSuppressionEnabled: isNoiseSuppressionEnabled,
          isKrispActive: isKrispActive,
          videoPublishing: {
            isPublishingCamera: isCamActive,
            cameraResolution: isCamActive && camSettings.width ? `${camSettings.width}x${camSettings.height}` : null,
            cameraFrameRate: isCamActive && camSettings.frameRate ? Math.round(camSettings.frameRate) : null,
            isPublishingScreen: isScreenActive,
            screenResolution: isScreenActive && scrSettings.width ? `${scrSettings.width}x${scrSettings.height}` : null,
            screenFrameRate: isScreenActive && scrSettings.frameRate ? Math.round(scrSettings.frameRate) : null,
          },
        });
      } catch {}
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [callStatus, isLiveKitActive, isCameraOn, isScreenSharing, isNoiseSuppressionEnabled, isKrispActive]);

  // Acquire local microphone with studio-grade Web Audio DSP noise cancellation and optional camera
  const getMedia = async (video: boolean): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    // Clean up existing DSP audio pipeline if refreshing media
    if (dspFilterNodesRef.current?.animFrame) {
      cancelAnimationFrame(dspFilterNodesRef.current.animFrame);
    }
    dspFilterNodesRef.current = null;
    if (dspAudioCtxRef.current) {
      try {
        dspAudioCtxRef.current.close();
      } catch {}
      dspAudioCtxRef.current = null;
    }
    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      rawMicStreamRef.current = null;
    }

    try {
      const savedMicId = (typeof window !== 'undefined' ? localStorage.getItem('nexus_audio_input_device') : null) || settings?.input_device_id || null;
      let rawStream: MediaStream;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: isNoiseSuppressionEnabled,
            autoGainControl: isNoiseSuppressionEnabled,
            ...(savedMicId ? { deviceId: { exact: savedMicId } } : {}),
          },
          video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        });
      } catch (exactErr) {
        console.warn('[CallContext] Exact mic device failed or unplugged, falling back to default:', exactErr);
        rawStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: isNoiseSuppressionEnabled,
            autoGainControl: isNoiseSuppressionEnabled,
          },
          video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        });
      }
      rawMicStreamRef.current = rawStream;
      if (disconnectGateRef.current || isMicMutedRef.current) {
        rawStream.getAudioTracks().forEach((t) => { t.enabled = false; });
      }

      // Construct multi-stage studio voice DSP pipeline
      let finalAudioTrack = rawStream.getAudioTracks()[0];
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx && finalAudioTrack) {
          const ctx = new AudioCtx({ latencyHint: 'interactive' });
          dspAudioCtxRef.current = ctx;
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }

          const source = ctx.createMediaStreamSource(new MediaStream([finalAudioTrack]));

          // 1. High-Pass Filter (85 Hz) - removes desk thumps, AC hum, sub-bass rumble
          const highpass = ctx.createBiquadFilter();
          highpass.type = 'highpass';
          highpass.frequency.setValueAtTime(85, ctx.currentTime);
          highpass.Q.setValueAtTime(0.707, ctx.currentTime);

          // 2. Vocal Formant Peaking Filter (2.8 kHz, +2.5 dB) - sharpens voice clarity
          const notch = ctx.createBiquadFilter();
          notch.type = 'peaking';
          notch.frequency.setValueAtTime(2800, ctx.currentTime);
          notch.gain.setValueAtTime(isNoiseSuppressionEnabled ? 2.5 : 0, ctx.currentTime);
          notch.Q.setValueAtTime(1.1, ctx.currentTime);

          // 3. High-Shelf Filter (7.5 kHz, -4.5 dB) - tames mic preamp hiss, fan whine
          const highshelf = ctx.createBiquadFilter();
          highshelf.type = 'highshelf';
          highshelf.frequency.setValueAtTime(7500, ctx.currentTime);
          highshelf.gain.setValueAtTime(isNoiseSuppressionEnabled ? -4.5 : 0, ctx.currentTime);

          // 4. Downward Expander / Noise Gate Gain Node
          const gateGain = ctx.createGain();
          gateGain.gain.setValueAtTime(1.0, ctx.currentTime);

          // 5. Studio Vocal Dynamics Compressor
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-24, ctx.currentTime);
          compressor.knee.setValueAtTime(10, ctx.currentTime);
          compressor.ratio.setValueAtTime(4, ctx.currentTime);
          compressor.attack.setValueAtTime(0.003, ctx.currentTime);
          compressor.release.setValueAtTime(0.12, ctx.currentTime);

          // 6. Analyser Node for voice activity level measurement
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.2;

          // 7. Destination
          const destination = ctx.createMediaStreamDestination();

          source.connect(highpass);
          highpass.connect(notch);
          notch.connect(highshelf);
          highshelf.connect(gateGain);
          gateGain.connect(compressor);
          compressor.connect(destination);
          highshelf.connect(analyser);

          // Adaptive Voice Activity Noise Gate with soft downward expansion (prevents quiet voice cut-off)
          const pcmBuffer = new Float32Array(analyser.fftSize);
          let isGateOpen = false;
          let lastSpeechTime = performance.now();
          const GATE_THRESHOLD = 0.003; // Calibrated for quiet mics and soft voices
          const GATE_HOLD_MS = 300; // Extra speech tail hold time to prevent clipping word endings

          const updateGate = () => {
            if (ctx.state === 'closed') return;
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {});
            }
            analyser.getFloatTimeDomainData(pcmBuffer);
            let sumSq = 0;
            for (let i = 0; i < pcmBuffer.length; i++) {
              sumSq += pcmBuffer[i] * pcmBuffer[i];
            }
            const rms = Math.sqrt(sumSq / pcmBuffer.length);
            const now = performance.now();

            if (isNoiseSuppressionEnabled) {
              if (rms > GATE_THRESHOLD) {
                lastSpeechTime = now;
                if (!isGateOpen) {
                  isGateOpen = true;
                  gateGain.gain.cancelScheduledValues(ctx.currentTime);
                  gateGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.008);
                }
              } else {
                if (isGateOpen && now - lastSpeechTime > GATE_HOLD_MS) {
                  isGateOpen = false;
                  gateGain.gain.cancelScheduledValues(ctx.currentTime);
                  // Full acoustic downward expansion (-54 dB floor) so fans, hum, and keyboards are silenced when silent
                  gateGain.gain.linearRampToValueAtTime(0.002, ctx.currentTime + 0.04);
                }
              }
            } else {
              gateGain.gain.cancelScheduledValues(ctx.currentTime);
              gateGain.gain.setValueAtTime(1.0, ctx.currentTime);
            }

            if (dspFilterNodesRef.current) {
              dspFilterNodesRef.current.animFrame = requestAnimationFrame(updateGate);
            }
          };

          const animFrame = requestAnimationFrame(updateGate);
          dspFilterNodesRef.current = {
            source,
            highpass,
            notch,
            highshelf,
            gateGain,
            compressor,
            destination,
            analyser,
            animFrame,
          };

          const dspTrack = destination.stream.getAudioTracks()[0];
          if (dspTrack) {
            finalAudioTrack = dspTrack;
          }
        }
      } catch (dspErr) {
        console.warn('[CallAudio] Web Audio DSP initialization fallback:', dspErr);
      }

      // Assemble final stream
      const tracks: MediaStreamTrack[] = [];
      if (finalAudioTrack) {
        finalAudioTrack.enabled = true;
        tracks.push(finalAudioTrack);
      }
      rawStream.getVideoTracks().forEach((vt) => {
        vt.enabled = true;
        tracks.push(vt);
      });

      const finalStream = new MediaStream(tracks);
      localStreamRef.current = finalStream;
      setLocalStream(finalStream);
      return finalStream;
    } catch (videoErr) {
      if (video) {
        console.warn('Video stream acquisition failed, falling back to audio only:', videoErr);
        try {
          return await getMedia(false);
        } catch (audioErr) {
          console.warn('Microphone access not granted:', audioErr);
        }
      } else {
        console.warn('Microphone access not granted:', videoErr);
      }

      toast({
        title: 'Microphone Permission Needed',
        description: 'Please allow microphone access in your browser to talk.',
        type: 'error',
      });
    }
    return null;
  };

  // Helper to establish LiveKit Cloud SFU connection with Krisp AI Noise Cancellation for private 1-on-1 calls
  const connectLiveKitCall = React.useCallback(
    async (
      conversationId: string,
      currentLocalStream: MediaStream | null,
      callSessionId: string
    ): Promise<boolean> => {
      if (activeCallSessionIdRef.current !== callSessionId) {
        console.log('[LiveKit Call] Aborting connect; call session is no longer active.');
        return false;
      }

      const currentUser = user || userRef.current;
      if (!currentUser?.id) {
        console.warn('[LiveKit Call] Cannot connect LiveKit call: unauthenticated user');
        return false;
      }

      try {
        const cleanConvId = (conversationId || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_');

        console.log('[LiveKit Call] Requesting SFU token for private call:', cleanConvId);

        let authHeader = '';
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.access_token) {
            authHeader = `Bearer ${sessionData.session.access_token}`;
          }
        } catch {}

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId || '');
        const tokenRes = await fetch('/api/calls/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({
            conversationId: isUUID ? conversationId : undefined,
            roomName: !isUUID ? `nexus-dm-${cleanConvId}` : undefined,
            userId: currentUser.id,
            userName: profileRef.current?.display_name || currentUser.email?.split('@')[0],
          }),
        });

        if (activeCallSessionIdRef.current !== callSessionId) {
          console.log('[LiveKit Call] Session superseded while requesting token.');
          return false;
        }

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          console.warn('[LiveKit Call] Token route response not OK:', tokenRes.status, errText);
          return false;
        }

        const tokenData = await tokenRes.json();
        if (!tokenData.isConfigured || !tokenData.token || !tokenData.url) {
          console.warn('[LiveKit Call] LiveKit not configured or missing token/url. Controlled P2P fallback active.');
          return false;
        }

        if (activeCallSessionIdRef.current !== callSessionId) {
          return false;
        }

        console.log('[LiveKit Call] Connecting to LiveKit Cloud SFU at', tokenData.url);
        const { Room, RoomEvent, Track, LocalAudioTrack } = await import('livekit-client');
        const lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          disconnectOnPageLeave: false,
        });
        livekitRoomRef.current = lkRoom;

        lkRoom.on(RoomEvent.Connected, () => {
          if (activeCallSessionIdRef.current !== callSessionId) {
            try { lkRoom.disconnect(); } catch {}
            return;
          }
          console.log('[LiveKit Call] Connected to LiveKit Cloud SFU Room:', `nexus-dm-${cleanConvId}`);
          setIsLiveKitActive(true);
          mediaTransportRef.current = 'livekit';

          // Disable fallback WebRTC audio senders so no duplicate audio packets stream peer-to-peer
          if (pcRef.current) {
            try {
              pcRef.current.getSenders().forEach((sender) => {
                if (sender.track && sender.track.kind === 'audio') {
                  sender.track.enabled = false;
                }
              });
            } catch {}
          }
        });

        lkRoom.on(RoomEvent.Disconnected, () => {
          console.log('[LiveKit Call] Disconnected from LiveKit Cloud SFU');
          setIsLiveKitActive(false);
          setIsKrispActive(false);
          if (mediaTransportRef.current === 'livekit') {
            mediaTransportRef.current = 'none';
          }
        });

        // Listen for browser autoplay restrictions
        lkRoom.on(RoomEvent.AudioPlaybackStatusChanged, (canPlayAudio: boolean) => {
          if (!canPlayAudio) {
            console.warn('[LiveKit Call] Audio playback blocked by browser. Unlocking on next user gesture...');
            const unlock = () => {
              lkRoom.startAudio().catch(() => {});
              if (remoteAudioElementRef.current) {
                remoteAudioElementRef.current.play().catch(() => {});
              }
              window.removeEventListener('click', unlock);
              window.removeEventListener('keydown', unlock);
              window.removeEventListener('touchstart', unlock);
            };
            window.addEventListener('click', unlock, { once: true, passive: true });
            window.addEventListener('keydown', unlock, { once: true, passive: true });
            window.addEventListener('touchstart', unlock, { once: true, passive: true });
          }
        });

        // Stop outgoing ringtone and transition to 'in_call' helper
        const markCallConnected = (peerId?: string, peerName?: string, isVideoTrack: boolean = false) => {
          RingtonePlayer.stopAll();
          if (ringtoneRef.current) {
            ringtoneRef.current.stop();
            ringtoneRef.current = null;
          }
          if (ringingTimerRef.current) {
            clearTimeout(ringingTimerRef.current);
            ringingTimerRef.current = null;
          }
          if (ringingBeaconRef.current) {
            clearInterval(ringingBeaconRef.current);
            ringingBeaconRef.current = null;
          }
          callStatusRef.current = 'in_call';
          setCallStatus('in_call');

          if (peerId) {
            setParticipants((prev) => {
              if (prev.some((p) => p.id === peerId)) {
                return prev.map((p) =>
                  p.id === peerId && isVideoTrack ? { ...p, isCameraOn: true } : p
                );
              }
              return [
                ...prev,
                {
                  id: peerId,
                  name: peerName || 'Squadmate',
                  isSpeaking: false,
                  isMuted: false,
                  isCameraOn: isVideoTrack,
                  isScreenSharing: false,
                },
              ];
            });
          }
        };

        // When remote participant connects to the SFU room
        lkRoom.on(RoomEvent.ParticipantConnected, (participant: any) => {
          if (activeCallSessionIdRef.current !== callSessionId) return;
          console.log('[LiveKit Call] Authoritative remote participant joined SFU room:', participant.identity);
          markCallConnected(participant.identity, participant.name || 'Squadmate', false);
        });

        // SINGLE AUTHORITATIVE PLAYBACK SINK:
        // Remote audio is attached directly to remoteAudioElementRef via LiveKit SDK track.attach
        lkRoom.on(RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
          if (activeCallSessionIdRef.current !== callSessionId) return;
          console.log('[LiveKit Call] Authoritative remote track subscribed:', participant.identity, track.kind);

          markCallConnected(
            participant.identity,
            participant.name || 'Squadmate',
            track.kind === 'video'
          );

          if (track.kind === 'audio' || track.kind === Track.Kind.Audio) {
            if (track.mediaStreamTrack) {
              track.mediaStreamTrack.enabled = !isDeafenedRef.current;
            }
            if (remoteAudioElementRef.current) {
              try {
                // Route to saved audio output device if setSinkId is supported
                const savedOutputId = localStorage.getItem('nexus_audio_output_device');
                if (savedOutputId && 'setSinkId' in remoteAudioElementRef.current && typeof (remoteAudioElementRef.current as any).setSinkId === 'function') {
                  (remoteAudioElementRef.current as any).setSinkId(savedOutputId).catch((sinkErr: any) => {
                    console.warn('[LiveKit Call] Output setSinkId notice:', sinkErr);
                  });
                }
                track.attach(remoteAudioElementRef.current);
                remoteAudioElementRef.current.muted = isDeafenedRef.current;
                remoteAudioElementRef.current.volume = 1.0;
                remoteAudioElementRef.current.play().catch((playErr: any) => {
                  console.warn('[LiveKit Call] Remote audio autoplay deferred waiting for gesture:', playErr);
                });
              } catch (attachErr) {
                console.warn('[LiveKit Call] Error attaching track to audio element:', attachErr);
              }
            }
          }
          if (track.mediaStreamTrack) {
            attachRemoteTrack(track.mediaStreamTrack);
          }
        });

        lkRoom.on(RoomEvent.TrackUnsubscribed, (track: any) => {
          if (track.kind === 'audio' || track.kind === Track.Kind.Audio) {
            if (remoteAudioElementRef.current) {
              try {
                track.detach(remoteAudioElementRef.current);
              } catch {}
            }
          }
          if (track.mediaStreamTrack && remoteStreamRef.current) {
            try {
              remoteStreamRef.current.removeTrack(track.mediaStreamTrack);
              setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
            } catch {}
          }
        });

        lkRoom.on(RoomEvent.ParticipantDisconnected, () => {
          if (activeCallSessionIdRef.current !== callSessionId) return;
          setRemoteStream(null);
          remoteStreamRef.current = null;
          if (remoteAudioElementRef.current) {
            remoteAudioElementRef.current.srcObject = null;
          }
        });

        lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
          const activeIds = new Set(speakers.map((s) => s.identity));
          setParticipants((prev) =>
            prev.map((p) => {
              const spk = activeIds.has(p.id);
              return p.isSpeaking !== spk ? { ...p, isSpeaking: spk } : p;
            })
          );
        });

        await lkRoom.connect(tokenData.url, tokenData.token);

        if (activeCallSessionIdRef.current !== callSessionId) {
          try { lkRoom.disconnect(); } catch {}
          return false;
        }

        // Authorize audio playback immediately on connect
        await lkRoom.startAudio().catch((err) => {
          console.warn('[LiveKit Call] lkRoom.startAudio() notice:', err);
        });

        // Clear WebRTC ICE watchdog timer so it doesn't fire and restart ICE while LiveKit SFU is active
        if (iceWatchdogTimerRef.current) {
          clearTimeout(iceWatchdogTimerRef.current);
          iceWatchdogTimerRef.current = null;
        }

        // Check if remote participants are already in the room upon connection & attach their tracks
        if (lkRoom.remoteParticipants.size > 0) {
          console.log('[LiveKit Call] Remote participant(s) already in room on connect');
          lkRoom.remoteParticipants.forEach((rp: any) => {
            markCallConnected(rp.identity, rp.name || 'Squadmate', false);
            rp.trackPublications?.forEach((pub: any) => {
              if (pub.isSubscribed && pub.track) {
                if (pub.track.mediaStreamTrack) {
                  attachRemoteTrack(pub.track.mediaStreamTrack);
                }
                if (pub.track.kind === 'audio' || pub.track.kind === Track.Kind.Audio) {
                  if (remoteAudioElementRef.current) {
                    try {
                      pub.track.attach(remoteAudioElementRef.current);
                      remoteAudioElementRef.current.play().catch(() => {});
                    } catch {}
                  }
                }
              }
            });
          });
        }

        setIsLiveKitActive(true);
        mediaTransportRef.current = 'livekit';

        // Publish local audio with explicit Track.Source.Microphone
        try {
          let localAudioTrack: any;
          const existingAudioTrack =
            rawMicStreamRef.current?.getAudioTracks()[0] ||
            currentLocalStream?.getAudioTracks()[0] ||
            localStreamRef.current?.getAudioTracks()[0];
          const { LocalAudioTrack, createLocalAudioTrack } = await import('livekit-client');

          // Obtain an active AudioContext for LocalAudioTrack processor support
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx =
            (lkRoom as any).audioContext ||
            dspAudioCtxRef.current ||
            (AudioCtx ? new AudioCtx({ latencyHint: 'interactive' }) : undefined);
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          if (audioCtx && !(lkRoom as any).audioContext) {
            try {
              (lkRoom as any).audioContext = audioCtx;
              (lkRoom as any).setAudioContext?.(audioCtx);
            } catch {}
          }

          if (existingAudioTrack && existingAudioTrack.readyState === 'live') {
            localAudioTrack = new LocalAudioTrack(existingAudioTrack, undefined, true, audioCtx);
          } else {
            localAudioTrack = await createLocalAudioTrack({
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            });
          }

          if (audioCtx) {
            try {
              localAudioTrack.setAudioContext(audioCtx);
            } catch {}
            try {
              (localAudioTrack as any).audioContext = audioCtx;
            } catch {}
          }

          // Attempt Krisp AI neural noise cancellation filter
          if (typeof window !== 'undefined') {
            try {
              const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
              const isSupported = isKrispNoiseFilterSupported();
              console.log('[LiveKit Call] Checking Krisp AI noise filter support:', isSupported);
              if (isSupported) {
                const krisp = KrispNoiseFilter();
                await localAudioTrack.setProcessor(krisp);
                try {
                  await krisp.setEnabled(true);
                } catch {}
                krispProcessorRef.current = krisp;
                setIsKrispActive(true);
                console.log('[LiveKit Call] Krisp AI noise filter activated in private call!');
              } else {
                console.log('[LiveKit Call] Krisp AI is not supported by this browser; clean studio DSP active.');
              }
            } catch (krispErr) {
              console.warn('[LiveKit Call] Krisp processor setup notice (using studio audio fallback):', krispErr);
              try {
                await localAudioTrack.stopProcessor();
              } catch {}
              krispProcessorRef.current = null;
              setIsKrispActive(false);
            }
          }

          // Authoritative publish to LiveKit SFU first, then sync mute state to avoid unpublished track warning
          await lkRoom.localParticipant.publishTrack(localAudioTrack, { source: Track.Source.Microphone });
          if (isMicMutedRef.current) {
            try {
              await localAudioTrack.mute();
            } catch {}
          }

          // If camera was requested on call start, also publish camera track
          const existingVideoTrack = currentLocalStream?.getVideoTracks()[0] || localStreamRef.current?.getVideoTracks()[0];
          if (existingVideoTrack && existingVideoTrack.readyState === 'live') {
            try {
              await lkRoom.localParticipant.publishTrack(existingVideoTrack, { source: Track.Source.Camera });
            } catch (vErr) {
              console.warn('[LiveKit Call] Initial video publish notice:', vErr);
            }
          }

          return true;
        } catch (pubErr) {
          console.warn('[LiveKit Call] Could not publish local audio to LiveKit SFU:', pubErr);
          return false;
        }
      } catch (lkErr) {
        console.warn('[LiveKit Call] LiveKit room initialization notice:', lkErr);
        return false;
      }
    },
    [user, attachRemoteTrack, supabase]
  );

  // Helper to add a remote ICE candidate cleanly with ZeroTier unmasking & deduplication
  const applyRemoteCandidate = React.useCallback(async (rawCandidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc || !rawCandidate) return;

    const candidate = cleanIceCandidate(rawCandidate);
    if (!candidate) return;

    // 1. If candidate contains .local and remote ZeroTier IP is known, unmask and inject direct route
    const targetZeroTierIp = peerZeroTierIpRef.current || getPeerZeroTierIp();
    if (targetZeroTierIp && candidate.candidate && candidate.candidate.includes('.local')) {
      const unmasked = unmaskCandidate(candidate, targetZeroTierIp);
      if (unmasked) {
        const unmaskedKey = JSON.stringify({
          candidate: unmasked.candidate,
          sdpMid: unmasked.sdpMid,
          sdpMLineIndex: unmasked.sdpMLineIndex,
        });
        if (!seenCandidatesRef.current.has(unmaskedKey)) {
          seenCandidatesRef.current.add(unmaskedKey);
          try {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(unmasked));
            } else {
              pendingRemoteCandidatesRef.current.push(unmasked);
            }
          } catch (e) {
            console.warn('[CallZeroTier] Error applying unmasked candidate:', e);
          }
        }
      }
    }

    // 2. Also register standard candidate (deduplicated)
    const candStr = JSON.stringify({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    });
    if (seenCandidatesRef.current.has(candStr)) return;
    seenCandidatesRef.current.add(candStr);

    try {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingRemoteCandidatesRef.current.push(candidate);
      }
    } catch (e) {
      console.warn('[CallSignaling] Error applying candidate:', e);
    }
  }, []);

  // Helper to drain pending remote candidates once remote description is set
  const drainPendingRemoteCandidates = React.useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    while (pendingRemoteCandidatesRef.current.length > 0) {
      const cand = pendingRemoteCandidatesRef.current.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {}
      }
    }
  }, []);

  // Dynamic ICE restart to bypass Symmetric NAT, CGNAT, or firewall timeouts
  const restartIceConnection = React.useCallback(async () => {
    if (mediaTransportRef.current === 'livekit' || isLiveKitActive) {
      console.log('[CallNAT] Suppressing P2P ICE restart because LiveKit SFU is active.');
      return;
    }
    const pc = pcRef.current;
    if (!pc || iceRestartingRef.current) return;
    iceRestartingRef.current = true;
    reconnectAttemptsRef.current += 1;
    lastReconnectReasonRef.current = 'ICE restart initiated';

    try {
      console.log('[CallNAT] Initiating WebRTC ICE restart & relay candidate gathering...');
      // Clear previously seen candidates so restart candidates are not discarded as duplicates
      seenCandidatesRef.current.clear();
      localIceCandidatesRef.current = [];
      pendingRemoteCandidatesRef.current = [];

      toast({
        title: 'Optimizing Call Connection',
        description: 'Re-routing candidate pairs & ZeroTier direct tunnels...',
        type: 'info',
        duration: 3500,
      });

      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }

      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      const targetId = peerUserId || incomingCall?.callerId;
      const localZtIp = getLocalZeroTierIp();
      const payload = {
        sdp: offer,
        senderId: user?.id,
        senderZeroTierIp: localZtIp,
        conversationId: activeConversationId,
      };

      sendSignalToRoom('ice_restart_offer', payload);
      if (targetId) {
        sendSignalToUser(targetId, 'ice_restart_offer', payload);
      }
    } catch (err: any) {
      console.warn('[CallNAT] ICE restart offer error:', err);
      reconnectFailuresRef.current += 1;
      lastFailureTimestampRef.current = new Date().toLocaleTimeString();
      lastReconnectReasonRef.current = 'ICE restart error: ' + (err?.message || 'unknown');
    } finally {
      setTimeout(() => {
        iceRestartingRef.current = false;
      }, 4000);
    }
  }, [peerUserId, incomingCall?.callerId, user?.id, activeConversationId, sendSignalToRoom, sendSignalToUser, toast, isLiveKitActive]);

  // Manually configure squadmate's ZeroTier IP for immediate direct routing
  const setPeerZeroTierDirectIp = React.useCallback(
    (ip: string) => {
      const trimmed = ip.trim();
      if (!trimmed) return;
      setPeerZeroTierIp(trimmed);
      peerZeroTierIpRef.current = trimmed;
      setPeerZeroTierIpState(trimmed);
      toast({
        title: 'Squadmate ZeroTier IP Configured',
        description: `Direct routing to ${trimmed}. Restarting ICE...`,
        type: 'success',
      });
      seenCandidatesRef.current.clear();
      restartIceConnection();
    },
    [restartIceConnection, toast]
  );

  // Lightweight WebRTC media renegotiation for dynamic camera/screen toggle (no ICE teardown)
  const renegotiateMedia = React.useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    if (pc.signalingState !== 'stable') {
      console.log('[CallMedia] Skipping renegotiation; signalingState is:', pc.signalingState);
      return;
    }
    try {
      console.log('[CallMedia] Initiating SDP renegotiation for media track change...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const targetId = peerUserIdRef.current;
      const messageId = `reneg-off-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const payload = {
        messageId,
        sdp: offer,
        senderId: user?.id,
        conversationId: activeConversationIdRef.current,
      };

      const room = roomChannelRef.current;
      if (room && room.state === 'joined') {
        room.send({ type: 'broadcast', event: 'media_renegotiate_offer', payload }).catch(() => {});
      }
      if (targetId) {
        sendSignalToUser(targetId, 'media_renegotiate_offer', payload);
      }
    } catch (err) {
      console.warn('[CallMedia] SDP renegotiation offer error:', err);
    }
  }, [user?.id, sendSignalToUser]);

  const handleIncomingRenegotiateOffer = React.useCallback(
    async (payload: any) => {
      if (!payload?.sdp || payload.senderId === user?.id) return;
      if (payload.messageId && seenSignalIdsRef.current.has(payload.messageId)) return;
      if (payload.messageId) seenSignalIdsRef.current.add(payload.messageId);

      const activePc = pcRef.current;
      if (!activePc) return;
      if (activePc.signalingState !== 'stable') {
        console.log('[CallMedia] Ignoring renegotiate offer; signaling state is:', activePc.signalingState);
        return;
      }

      try {
        console.log('[CallMedia] Handling media renegotiation offer from:', payload.senderId);
        await activePc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await drainPendingRemoteCandidates();

        const answer = await activePc.createAnswer();
        await activePc.setLocalDescription(answer);

        const ansMessageId = `reneg-ans-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const ansPayload = {
          messageId: ansMessageId,
          sdp: answer,
          senderId: user?.id,
          conversationId: activeConversationIdRef.current,
        };

        const room = roomChannelRef.current;
        if (room && room.state === 'joined') {
          room.send({ type: 'broadcast', event: 'media_renegotiate_answer', payload: ansPayload }).catch(() => {});
        }
        if (payload.senderId) {
          sendSignalToUser(payload.senderId, 'media_renegotiate_answer', ansPayload);
        }

        const videoTransceiver = activePc.getTransceivers().find(
          (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
        );
        const recTrack = videoTransceiver?.receiver?.track;
        if (recTrack) {
          recTrack.enabled = true;
          attachRemoteTrack(recTrack);
          setParticipants((prev) =>
            prev.map((p) => (p.id !== user?.id ? { ...p, isCameraOn: true } : p))
          );
        }
      } catch (e) {
        console.warn('[CallMedia] Error processing media_renegotiate_offer:', e);
      }
    },
    [user?.id, drainPendingRemoteCandidates, sendSignalToUser, attachRemoteTrack]
  );

  const handleIncomingRenegotiateAnswer = React.useCallback(
    async (payload: any) => {
      if (!payload?.sdp || payload.senderId === user?.id) return;
      if (payload.messageId && seenSignalIdsRef.current.has(payload.messageId)) return;
      if (payload.messageId) seenSignalIdsRef.current.add(payload.messageId);

      const activePc = pcRef.current;
      if (!activePc) return;
      if (activePc.signalingState !== 'have-local-offer') {
        console.log('[CallMedia] Ignoring renegotiate answer; signaling state is:', activePc.signalingState);
        return;
      }

      try {
        console.log('[CallMedia] Applying media renegotiation answer from:', payload.senderId);
        await activePc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await drainPendingRemoteCandidates();

        const videoTransceiver = activePc.getTransceivers().find(
          (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
        );
        const recTrack = videoTransceiver?.receiver?.track;
        if (recTrack) {
          recTrack.enabled = true;
          attachRemoteTrack(recTrack);
        }
      } catch (e) {
        console.warn('[CallMedia] Error applying media_renegotiate_answer:', e);
      }
    },
    [user?.id, drainPendingRemoteCandidates, attachRemoteTrack]
  );

  // Helper to apply incoming answer SDP
  const applyAnswerSdp = React.useCallback(
    async (sdp: RTCSessionDescriptionInit) => {
      const pc = pcRef.current;
      if (!pc || !sdp) return;

      RingtonePlayer.stopAll();
      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }
      if (ringingTimerRef.current) {
        clearTimeout(ringingTimerRef.current);
        ringingTimerRef.current = null;
      }
      if (ringingBeaconRef.current) {
        clearInterval(ringingBeaconRef.current);
        ringingBeaconRef.current = null;
      }
      activeCallPayloadRef.current = null;
      callStatusRef.current = 'in_call';

      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          setCallStatus('in_call');
          await drainPendingRemoteCandidates();

          // Flush all gathered local ICE candidates to BOTH room AND peer mailbox
          localIceCandidatesRef.current.forEach((candidate) => {
            sendSignalToRoom('ice_candidate', { candidate, senderId: user?.id });
            if (peerUserId) {
              sendSignalToUser(peerUserId, 'ice_candidate', { candidate, senderId: user?.id });
            }
          });

          toast({
            title: 'Call Connected',
            description: 'Connected via direct WebRTC stream with NAT traversal.',
            type: 'success',
          });
        }
      } catch (e) {
        console.warn('[CallSignaling] Error applying answer SDP:', e);
      }
    },
    [drainPendingRemoteCandidates, sendSignalToRoom, sendSignalToUser, peerUserId, toast, user?.id]
  );

  // Stable reference wrappers for global signaling callbacks to avoid channel reconnect churn
  const applyAnswerSdpRef = React.useRef(applyAnswerSdp);
  applyAnswerSdpRef.current = applyAnswerSdp;
  const applyRemoteCandidateRef = React.useRef(applyRemoteCandidate);
  applyRemoteCandidateRef.current = applyRemoteCandidate;
  const handlePeerMediaToggleRef = React.useRef(handlePeerMediaToggle);
  handlePeerMediaToggleRef.current = handlePeerMediaToggle;
  const handleIncomingRenegotiateOfferRef = React.useRef(handleIncomingRenegotiateOffer);
  handleIncomingRenegotiateOfferRef.current = handleIncomingRenegotiateOffer;
  const handleIncomingRenegotiateAnswerRef = React.useRef(handleIncomingRenegotiateAnswer);
  handleIncomingRenegotiateAnswerRef.current = handleIncomingRenegotiateAnswer;
  const stopMediaTracksRef = React.useRef(stopMediaTracks);
  stopMediaTracksRef.current = stopMediaTracks;
  const sendSignalToUserRef = React.useRef(sendSignalToUser);
  sendSignalToUserRef.current = sendSignalToUser;
  const sendSignalToRoomRef = React.useRef(sendSignalToRoom);
  sendSignalToRoomRef.current = sendSignalToRoom;
  const sendDirectSignalRef = React.useRef(sendDirectSignal);
  sendDirectSignalRef.current = sendDirectSignal;

  // 1. GLOBAL SIGNALING LISTENER: Subscribes on mount for the authenticated user
  React.useEffect(() => {
    if (!user || !supabase) return;

    const personalChannelName = `user-signals-${user.id}`;
    const myChannel = supabase.channel(personalChannelName);

    myChannel
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        if (!payload || payload.callerId === user.id) return;

        // If user is already in active call or dialing, do not disrupt
        if (callStatusRef.current === 'in_call' || callStatusRef.current === 'outgoing_ringing') {
          console.log('[CallSignaling] Ignoring incoming call beacon while already active or dialing');
          return;
        }

        // If user has recently declined this exact call session/conversation, suppress beacons and re-signal rejection
        const sessionKey = `${payload.callerId}_${payload.conversationId}`;
        const declinedExpiry = recentlyDeclinedCallsRef.current.get(sessionKey);
        if (declinedExpiry && Date.now() < declinedExpiry) {
          console.log('[CallSignaling] Suppressing incoming_call beacon for recently declined call:', sessionKey);
          if (!payload.isGroup) {
            sendDirectSignalRef.current(`user-signals-${payload.callerId}`, 'call_rejected', {
              conversationId: payload.conversationId,
              calleeId: user.id,
            });
          }
          return;
        }

        // If user is ALREADY ringing for this exact incoming call, deduplicate and do NOT re-trigger ringtone
        if (callStatusRef.current === 'incoming_ringing') {
          const currentCaller = incomingCallRef.current?.callerId;
          const currentConv = incomingCallRef.current?.conversationId;
          if (currentCaller === payload.callerId || currentConv === payload.conversationId) {
            console.log('[CallSignaling] Duplicate incoming call beacon received, keeping single active ringtone.');
            if (payload.sdp && !incomingCallRef.current?.sdp) {
              incomingCallRef.current = { ...incomingCallRef.current, ...payload };
              setIncomingCall((prev) => (prev ? { ...prev, sdp: payload.sdp } : (payload as IncomingCallData)));
            }
            if (payload.callerZeroTierIp && !peerZeroTierIpRef.current) {
              peerZeroTierIpRef.current = payload.callerZeroTierIp;
              setPeerZeroTierIpState(payload.callerZeroTierIp);
              setPeerZeroTierIp(payload.callerZeroTierIp);
            }
            return;
          }
        }

        // Fresh incoming call
        callStatusRef.current = 'incoming_ringing';
        activeConversationIdRef.current = payload.conversationId;
        peerUserIdRef.current = payload.callerId;
        incomingCallRef.current = payload as IncomingCallData;

        if (payload.isGroup && payload.conversationId) {
          setActiveSquadCalls((prev) => {
            const next = new Map(prev);
            next.set(payload.conversationId, {
              id: payload.id || `call_${Date.now()}`,
              conversation_id: payload.conversationId,
              caller_id: payload.callerId,
              caller_name: payload.callerName,
              status: 'active',
              started_at: new Date().toISOString(),
            });
            return next;
          });
        }

        if (payload.callerZeroTierIp) {
          peerZeroTierIpRef.current = payload.callerZeroTierIp;
          setPeerZeroTierIpState(payload.callerZeroTierIp);
          setPeerZeroTierIp(payload.callerZeroTierIp);
        }
        setIncomingCall(payload as IncomingCallData);
        setCallStatus('incoming_ringing');
        setActiveConversationId(payload.conversationId);
        setPeerUserId(payload.callerId);

        // Start ringtone once strictly
        if (!ringtoneRef.current && !RingtonePlayer.isPlaying()) {
          const player = new RingtonePlayer();
          player.start();
          ringtoneRef.current = player;
        }
      })
      .on('broadcast', { event: 'call_accepted' }, ({ payload }) => {
        if (!payload || payload.calleeId === user.id) return;
        console.log('[CallSignaling] Instant call_accepted received from callee:', payload.calleeId);
        RingtonePlayer.stopAll();
        if (ringtoneRef.current) {
          ringtoneRef.current.stop();
          ringtoneRef.current = null;
        }
        if (ringingTimerRef.current) {
          clearTimeout(ringingTimerRef.current);
          ringingTimerRef.current = null;
        }
        if (ringingBeaconRef.current) {
          clearInterval(ringingBeaconRef.current);
          ringingBeaconRef.current = null;
        }
        callStatusRef.current = 'in_call';
        setCallStatus('in_call');
      })
      .on('broadcast', { event: 'call_answer' }, async ({ payload }) => {
        if (payload?.calleeZeroTierIp) {
          peerZeroTierIpRef.current = payload.calleeZeroTierIp;
          setPeerZeroTierIpState(payload.calleeZeroTierIp);
          setPeerZeroTierIp(payload.calleeZeroTierIp);
        }
        if (payload?.sdp) {
          await applyAnswerSdpRef.current(payload.sdp);
        }
      })
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (payload?.senderZeroTierIp) {
          peerZeroTierIpRef.current = payload.senderZeroTierIp;
          setPeerZeroTierIpState(payload.senderZeroTierIp);
        }
        if (payload?.candidate && payload.senderId !== user.id) {
          await applyRemoteCandidateRef.current(payload.candidate);
        }
      })
      .on('broadcast', { event: 'peer_media_toggle' }, ({ payload }) => {
        handlePeerMediaToggleRef.current(payload);
      })
      .on('broadcast', { event: 'soundboard_play' }, async ({ payload }) => {
        if (payload?.clip && payload.senderId !== user.id) {
          console.log('[CallSoundboard] Remote soundboard clip received via mailbox:', payload.clip.name);
          soundboardEngine.playClip(payload.clip);
          toast({
            title: `${payload.senderName || 'Squadmate'} played ${payload.clip.name}`,
            description: `${payload.clip.icon || '🔊'} Soundboard`,
            type: 'info',
            duration: 2500,
          });
        }
      })
      .on('broadcast', { event: 'call_rejected' }, () => {
        console.log('[CallSignaling] call_rejected received in mailbox');
        if (isGroupCallRef.current) {
          console.log('[CallSignaling] Squad member declined, but squad call remains active for remaining participants');
          return;
        }
        toast({ title: 'Call Declined', description: 'Squadmate was unable to answer.', type: 'info' });
        stopMediaTracksRef.current();
        setCallStatus('idle');
      })
      .on('broadcast', { event: 'squad_call_active' }, ({ payload }) => {
        if (!payload?.conversation_id) return;
        setActiveSquadCalls((prev) => {
          const next = new Map(prev);
          next.set(payload.conversation_id, payload);
          return next;
        });
      })
      .on('broadcast', { event: 'squad_call_ended' }, ({ payload }) => {
        if (!payload?.conversation_id) return;
        setActiveSquadCalls((prev) => {
          const next = new Map(prev);
          next.delete(payload.conversation_id);
          return next;
        });
      })
      .on('broadcast', { event: 'ice_restart_offer' }, async ({ payload }) => {
        if (!payload?.sdp || payload.senderId === user.id) return;
        const pc = pcRef.current;
        if (!pc) return;
        try {
          console.log('[CallNAT] Received remote ICE restart offer in mailbox, creating answer...');
          if (payload.senderZeroTierIp) {
            peerZeroTierIpRef.current = payload.senderZeroTierIp;
            setPeerZeroTierIpState(payload.senderZeroTierIp);
            setPeerZeroTierIp(payload.senderZeroTierIp);
          }
          seenCandidatesRef.current.clear();
          localIceCandidatesRef.current = [];
          pendingRemoteCandidatesRef.current = [];

          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await drainPendingRemoteCandidates();

          const restartAns = await pc.createAnswer();
          await pc.setLocalDescription(restartAns);

          const localZtIp = getLocalZeroTierIp();
          const ansPayload = {
            sdp: restartAns,
            senderId: user.id,
            senderZeroTierIp: localZtIp,
            conversationId: activeConversationIdRef.current,
          };
          sendSignalToRoomRef.current('ice_restart_answer', ansPayload);
          if (payload.senderId) {
            sendSignalToUserRef.current(payload.senderId, 'ice_restart_answer', ansPayload);
          }
        } catch (e) {
          console.warn('[CallNAT] Error handling ice_restart_offer in mailbox:', e);
        }
      })
      .on('broadcast', { event: 'ice_restart_answer' }, async ({ payload }) => {
        if (!payload?.sdp || payload.senderId === user.id) return;
        const pc = pcRef.current;
        if (!pc) return;
        try {
          if (payload.senderZeroTierIp) {
            peerZeroTierIpRef.current = payload.senderZeroTierIp;
            setPeerZeroTierIpState(payload.senderZeroTierIp);
            setPeerZeroTierIp(payload.senderZeroTierIp);
          }
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await drainPendingRemoteCandidates();
            console.log('[CallNAT] ICE restart answer applied successfully via mailbox.');
          }
        } catch (e) {
          console.warn('[CallNAT] Error applying ice_restart_answer in mailbox:', e);
        }
      })
      .on('broadcast', { event: 'media_renegotiate_offer' }, ({ payload }) => {
        handleIncomingRenegotiateOfferRef.current(payload);
      })
      .on('broadcast', { event: 'media_renegotiate_answer' }, ({ payload }) => {
        handleIncomingRenegotiateAnswerRef.current(payload);
      })
      .on('broadcast', { event: 'request_incoming_call_beacon' }, ({ payload }) => {
        if (callStatusRef.current === 'outgoing_ringing' && activeCallPayloadRef.current && activeCallPayloadRef.current.targetUserId === payload?.calleeId) {
          console.log('[CallSignaling] Re-dispatching active call offer beacon on demand:', payload);
          sendSignalToUserRef.current(activeCallPayloadRef.current.targetUserId, 'incoming_call', activeCallPayloadRef.current);
        }
      })
      .on('broadcast', { event: 'call_ended' }, () => {
        stopMediaTracksRef.current();
        toast({ title: 'Call Ended', description: 'Squadmate disconnected from voice room.', type: 'info' });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // If newly connecting / opening the app, query recent ringing calls for late joiners
          const checkActiveRingingCalls = async () => {
            if (callStatusRef.current !== 'idle' || activeConversationIdRef.current) return;
            try {
              const thirtyFiveSecondsAgo = new Date(Date.now() - 35000).toISOString();
              const { data: recentCalls } = await supabase
                .from('call_sessions')
                .select('id, conversation_id, caller_id, is_video, status, started_at')
                .eq('status', 'ringing')
                .gt('started_at', thirtyFiveSecondsAgo)
                .neq('caller_id', user.id)
                .order('started_at', { ascending: false })
                .limit(1);

              if (recentCalls && recentCalls.length > 0) {
                const call = recentCalls[0];
                const { data: member } = await supabase
                  .from('conversation_members')
                  .select('conversation_id')
                  .eq('conversation_id', call.conversation_id)
                  .eq('user_id', user.id)
                  .maybeSingle();

                if (member) {
                  console.log('[CallSignaling] Detected active ringing call for late opener:', call);
                  sendSignalToUserRef.current(call.caller_id, 'request_incoming_call_beacon', {
                    calleeId: user.id,
                    callerId: call.caller_id,
                    conversationId: call.conversation_id,
                  });
                }
              }
            } catch (e) {
              console.warn('[CallCheck] Notice checking active calls:', e);
            }
          };

          checkActiveRingingCalls();
        }
      });

    return () => {
      RingtonePlayer.stopAll();
      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }
      myChannel.unsubscribe();
      supabase.removeChannel(myChannel);
    };
  }, [user, supabase, toast, drainPendingRemoteCandidates]);

  // 2. START OUTGOING CALL
  const startCall = async (targetUserId: string, conversationId: string, video = false) => {
    if (!user || !supabase) {
      toast({ title: 'Error', description: 'You must be signed in to call', type: 'error' });
      return;
    }

    if (callStatusRef.current !== 'idle' || isStartingCallRef.current) {
      console.log('[CallSignaling] Cannot start call while status is:', callStatusRef.current);
      return;
    }
    isStartingCallRef.current = true;

    // Check if this conversation is a group
    let isGroup = Boolean(targetUserId && conversationId && targetUserId === conversationId);
    let groupName = 'Squad';
    try {
      const { data: convData } = await supabase
        .from('conversations')
        .select('type, name, is_group')
        .eq('id', conversationId)
        .maybeSingle();
      if (convData?.type === 'group' || (convData as any)?.is_group) {
        isGroup = true;
      }
      if (convData?.name) {
        groupName = convData.name;
      }
    } catch {}

    // Fetch all other conversation members
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id);

    if (members && members.length > 1) {
      isGroup = true;
    }

    setIsGroupCall(isGroup);
    isGroupCallRef.current = isGroup;

    let recipientId = targetUserId;
    if (!recipientId || recipientId === conversationId) {
      if (members && members.length > 0) {
        recipientId = members[0].user_id;
      }
    }

    if (!isGroup && (!recipientId || recipientId === conversationId)) {
      isStartingCallRef.current = false;
      toast({
        title: 'Call Failed',
        description: 'Could not find squadmate to call.',
        type: 'error',
      });
      return;
    }

    // Pre-unlock the persistent audio element under user gesture
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = false;
      remoteAudioElementRef.current.play().catch(() => {});
    }

    stopMediaTracks();
    setActiveConversationId(conversationId);
    activeConversationIdRef.current = conversationId;
    setPeerUserId(recipientId || conversationId);
    peerUserIdRef.current = recipientId || conversationId;
    setIsVideoCall(video);
    setIsCameraOn(video);

    const pttActive = isPushToTalkEnabled(settingsRef.current);
    setIsMicMuted(pttActive);
    isMicMutedRef.current = pttActive;

    const callSessionId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    activeCallSessionIdRef.current = callSessionId;

    if (isGroup) {
      // IN GROUP CALL: Caller immediately enters the voice room
      setCallStatus('in_call');
      callStatusRef.current = 'in_call';

      // Register squad call in active state
      setActiveSquadCalls((prev) => {
        const next = new Map(prev);
        next.set(conversationId, {
          id: callSessionId,
          conversation_id: conversationId,
          caller_id: user.id,
          caller_name: profile?.display_name || user.email?.split('@')[0],
          status: 'active',
          started_at: new Date().toISOString(),
        });
        return next;
      });

      // Start periodic squad call heartbeat so squadmates always see active status
      if (squadHeartbeatRef.current) clearInterval(squadHeartbeatRef.current);
      squadHeartbeatRef.current = setInterval(() => {
        if (callStatusRef.current === 'in_call' && isGroupCallRef.current) {
          try {
            const room = roomChannelRef.current;
            if (room && room.state === 'joined') {
              const activeMembers = participantsRef.current.length > 0
                ? participantsRef.current.map((p) => ({
                    id: p.id,
                    name: p.name,
                    avatar_url: p.avatar_url || (p.id === user.id ? profile?.avatar_url : null),
                    isSpeaking: p.isSpeaking,
                    isMuted: p.isMuted,
                  }))
                : [
                    {
                      id: user.id,
                      name: profile?.display_name || user.email?.split('@')[0] || 'Squadmate',
                      avatar_url: profile?.avatar_url || null,
                      isSpeaking: false,
                      isMuted: isMicMuted,
                    },
                  ];

              room.send({
                type: 'broadcast',
                event: 'squad_call_active',
                payload: {
                  id: callSessionId,
                  conversation_id: conversationId,
                  caller_id: user.id,
                  caller_name: profile?.display_name || user.email?.split('@')[0],
                  caller_avatar: profile?.avatar_url || null,
                  status: 'active',
                  started_at: new Date().toISOString(),
                  participants: activeMembers,
                },
              }).catch(() => {});
            }
          } catch {}
        } else {
          if (squadHeartbeatRef.current) {
            clearInterval(squadHeartbeatRef.current);
            squadHeartbeatRef.current = null;
          }
        }
      }, 3000);

      // Ring all squad members
      if (members && members.length > 0) {
        members.forEach((m: { user_id: string }) => {
          const groupPayload: IncomingCallData = {
            callerId: user.id,
            callerName: profile?.display_name || profile?.username || user.email?.split('@')[0] || 'Squadmate',
            callerAvatar: profile?.avatar_url || null,
            targetUserId: m.user_id,
            conversationId,
            isVideo: video,
            isGroup: true,
            groupName,
            callerZeroTierIp: getLocalZeroTierIp(),
          };
          sendSignalToUser(m.user_id, 'incoming_call', groupPayload);
          sendSignalToUser(m.user_id, 'squad_call_active', {
            id: callSessionId,
            conversation_id: conversationId,
            caller_id: user.id,
            caller_name: profile?.display_name || profile?.username || user.email?.split('@')[0],
            caller_avatar: profile?.avatar_url || null,
            status: 'active',
            started_at: new Date().toISOString(),
            participants: [
              {
                id: user.id,
                name: profile?.display_name || profile?.username || user.email?.split('@')[0] || 'Squadmate',
                avatar_url: profile?.avatar_url || null,
                isSpeaking: false,
                isMuted: isMicMuted,
              },
            ],
          });
        });
      }

      // Broadcast real-time active squad call event for instant banner display in chat
      try {
        const roomBroadcastChannel = supabase.channel(`call-room-${conversationId}`);
        roomBroadcastChannel.subscribe((subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            const initialMembers = [
              {
                id: user.id,
                name: profile?.display_name || profile?.username || user.email?.split('@')[0] || 'Squadmate',
                avatar_url: profile?.avatar_url || null,
                isSpeaking: false,
                isMuted: isMicMuted,
              },
            ];

            roomBroadcastChannel.send({
              type: 'broadcast',
              event: 'squad_call_active',
              payload: {
                id: callSessionId,
                conversation_id: conversationId,
                caller_id: user.id,
                caller_name: profile?.display_name || user.email?.split('@')[0],
                caller_avatar: profile?.avatar_url || null,
                status: 'active',
                started_at: new Date().toISOString(),
                participants: initialMembers,
              },
            });
          }
        });
      } catch {}

      // Persist call session to database
      try {
        supabase
          .from('call_sessions')
          .insert({
            conversation_id: conversationId,
            caller_id: user.id,
            livekit_room_name: `call-room-${conversationId}`,
            is_video: video,
            status: 'active',
            started_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle()
          .then(({ data: sessData }: any) => {
            if (sessData) {
              dbCallSessionIdRef.current = sessData.id;
            }
          }, () => {});
      } catch {}

      toast({
        title: 'Squad Call Started',
        description: `Connected to voice room in ${groupName}. Squadmates can join at any time.`,
        type: 'success',
      });
    } else {
      // 1-on-1 private call: standard outgoing_ringing
      setCallStatus('outgoing_ringing');
      callStatusRef.current = 'outgoing_ringing';

      const initialCallPayload: IncomingCallData = {
        callerId: user.id,
        callerName: profile?.display_name || profile?.username || user.email?.split('@')[0] || 'Squadmate',
        callerAvatar: profile?.avatar_url || null,
        targetUserId: recipientId,
        conversationId,
        isVideo: video,
        callerZeroTierIp: getLocalZeroTierIp(),
      };
      activeCallPayloadRef.current = initialCallPayload;

      // Send immediate incoming_call signal so callee rings instantly
      sendSignalToUser(recipientId, 'incoming_call', initialCallPayload);

      // Persist call session to database
      try {
        supabase
          .from('call_sessions')
          .insert({
            conversation_id: conversationId,
            caller_id: user.id,
            livekit_room_name: `call-room-${conversationId}`,
            is_video: video,
            status: 'ringing',
            started_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle()
          .then(({ data: sessData }: any) => {
            if (sessData) {
              dbCallSessionIdRef.current = sessData.id;
            }
          }, () => {});
      } catch {}

      // Realtime postgres_changes listener on call_sessions for this conversation
      if (conversationId && supabase) {
        if (sessionStatusChannelRef.current) {
          try {
            supabase.removeChannel(sessionStatusChannelRef.current);
          } catch {}
        }
        const sessionChan = supabase
          .channel(`call-status-sync-${conversationId}-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'call_sessions',
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload: any) => {
              const newStatus = payload?.new?.status;
              if (newStatus === 'rejected') {
                if (isGroupCallRef.current) return;
                console.log('[CallSignaling] Instant call_rejected from Postgres call_sessions update');
                toast({ title: 'Call Declined', description: 'Squadmate was unable to answer.', type: 'info' });
                stopMediaTracks();
              } else if (newStatus === 'ended') {
                if (isGroupCallRef.current) return;
                console.log('[CallSignaling] Instant call_ended from Postgres call_sessions update');
                toast({ title: 'Call Ended', description: 'Squadmate disconnected from voice room.', type: 'info' });
                stopMediaTracks();
              }
            }
          );
        sessionChan.subscribe();
        sessionStatusChannelRef.current = sessionChan;
      }

      // Pulse beacon every 2 seconds during outgoing_ringing so recipient reliably catches it
      if (ringingBeaconRef.current) clearInterval(ringingBeaconRef.current);
      ringingBeaconRef.current = setInterval(async () => {
        if (callStatusRef.current === 'outgoing_ringing' && activeCallPayloadRef.current) {
          // Active check of database status in case WebSocket broadcast was dropped
          if (conversationId && supabase) {
            try {
              const { data: currentSession } = await supabase
                .from('call_sessions')
                .select('status')
                .eq('conversation_id', conversationId)
                .order('started_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (currentSession && (currentSession.status === 'rejected' || currentSession.status === 'ended')) {
                if (isGroupCallRef.current) return;
                console.log('[CallSignaling] Detected call declined or ended in database during beacon check');
                toast({ title: 'Call Declined', description: 'Squadmate was unable to answer.', type: 'info' });
                stopMediaTracks();
                return;
              }
            } catch {}
          }

          if (callStatusRef.current === 'outgoing_ringing' && activeCallPayloadRef.current) {
            sendSignalToUser(recipientId, 'incoming_call', activeCallPayloadRef.current);
            const room = roomChannelRef.current;
            if (room && room.state === 'joined') {
              room.send({
                type: 'broadcast',
                event: 'incoming_call',
                payload: activeCallPayloadRef.current,
              }).catch(() => {});
            }
          }
        } else {
          if (ringingBeaconRef.current) {
            clearInterval(ringingBeaconRef.current);
            ringingBeaconRef.current = null;
          }
        }
      }, 2000);

      // Start outgoing ringtone immediately
      if (!ringtoneRef.current && !RingtonePlayer.isPlaying()) {
        const player = new RingtonePlayer();
        player.start();
        ringtoneRef.current = player;
      }

      // Outgoing ringing timeout (35s)
      if (ringingTimerRef.current) clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = setTimeout(() => {
        if (callStatusRef.current === 'outgoing_ringing') {
          toast({ title: 'No Answer', description: 'Squadmate did not pick up.', type: 'info' });
          endCall();
        }
      }, 35000);
    }

    setParticipants([
      {
        id: user.id,
        name: profile?.display_name || 'You',
        isSpeaking: false,
        isMuted: pttActive,
        isCameraOn: video,
        isScreenSharing: false,
      },
    ]);
    isStartingCallRef.current = false;

    // Acquire microphone & optional camera
    const stream = await getMedia(video);
    if (activeCallSessionIdRef.current !== callSessionId) return;

    if (pttActive && stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    // Connect LiveKit Cloud SFU with Krisp AI Filter
    const livekitOk = await connectLiveKitCall(conversationId, stream, callSessionId);
    if (activeCallSessionIdRef.current !== callSessionId) return;

    if (pttActive && livekitRoomRef.current?.localParticipant) {
      livekitRoomRef.current.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }

    // Setup WebRTC Peer Connection with TURN relay support and candidate pre-fetching
    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    pcRef.current = pc;
    localIceCandidatesRef.current = [];
    pendingRemoteCandidatesRef.current = [];
    seenCandidatesRef.current.clear();

    if (livekitOk) {
      mediaTransportRef.current = 'livekit';
      console.log('[CallContext] LiveKit SFU media active. Suppressing duplicate native WebRTC audio transmission.');
    } else {
      mediaTransportRef.current = 'webrtc';
      console.log('[CallContext] LiveKit unavailable. Activating native WebRTC P2P fallback audio transport.');
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.enabled = true;
          pc.addTrack(track, stream);
        });
      }
    }

    // Pre-negotiate both audio AND video transceivers so video/screen can be swapped without renegotiation
    const hasAudio = pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'audio');
    const hasVideo = pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'video');
    if (!hasAudio) pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (!hasVideo) pc.addTransceiver('video', { direction: 'sendrecv' });

    pc.ontrack = (event) => {
      // Authoritative transport check: if LiveKit is active, suppress WebRTC playback
      if (mediaTransportRef.current !== 'webrtc') {
        console.log('[CallSignaling] Suppressing WebRTC track playback; LiveKit is authoritative.');
        return;
      }
      console.log('[CallSignaling] Received remote media track on caller via WebRTC fallback:', event.track.kind);
      attachRemoteTrack(event.track);
      setCallStatus('in_call');

      const isRemoteVideoActive = event.track.kind === 'video' && (video || (!event.track.muted && event.track.readyState === 'live'));

      setParticipants((prev) => {
        const local = prev.find((p) => p.id === user.id);
        const remote = prev.find((p) => p.id === recipientId);
        return [
          {
            id: user.id,
            name: profile?.display_name || 'You',
            isSpeaking: local?.isSpeaking || false,
            isMuted: local?.isMuted || false,
            isCameraOn: local?.isCameraOn ?? video,
            isScreenSharing: local?.isScreenSharing || false,
          },
          {
            id: recipientId,
            name: peerName,
            isSpeaking: remote?.isSpeaking || false,
            isMuted: remote?.isMuted || false,
            isCameraOn: remote?.isCameraOn ?? isRemoteVideoActive,
            isScreenSharing: remote?.isScreenSharing || false,
          },
        ];
      });
    };

    // Hook transceiver un-mute listeners so swapped or enabled camera tracks are immediately rendered
    pc.getTransceivers().forEach((transceiver) => {
      const recTrack = transceiver.receiver?.track;
      if (recTrack) {
        recTrack.onunmute = () => {
          if (recTrack.kind === 'audio' && mediaTransportRef.current === 'livekit') {
            return;
          }
          console.log('[CallSignaling] Caller remote transceiver track unmuted:', recTrack.kind);
          recTrack.enabled = true;
          attachRemoteTrack(recTrack);
          if (recTrack.kind === 'video') {
            setParticipants((prev) =>
              prev.map((p) => (p.id !== user.id ? { ...p, isCameraOn: true } : p))
            );
          }
        };
        if (recTrack.readyState === 'live' && !recTrack.muted) {
          if (recTrack.kind !== 'audio' || mediaTransportRef.current !== 'livekit') {
            recTrack.enabled = true;
            attachRemoteTrack(recTrack);
          }
          if (recTrack.kind === 'video' && video) {
            setParticipants((prev) =>
              prev.map((p) => (p.id !== user.id ? { ...p, isCameraOn: true } : p))
            );
          }
        }
      }
    });

    // 12-second connection watchdog: if stuck in checking/connecting, trigger automatic ICE restart
    if (iceWatchdogTimerRef.current) clearTimeout(iceWatchdogTimerRef.current);
    iceWatchdogTimerRef.current = setTimeout(() => {
      const activePc = pcRef.current;
      if (activePc && activePc.iceConnectionState !== 'connected' && activePc.iceConnectionState !== 'completed') {
        console.log('[CallNAT] WebRTC connection still pending after 12s on caller, restarting ICE...');
        restartIceConnection();
      }
    }, 12000);

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (iceWatchdogTimerRef.current) {
          clearTimeout(iceWatchdogTimerRef.current);
          iceWatchdogTimerRef.current = null;
        }
        setCallStatus('in_call');
      } else if (pc.iceConnectionState === 'disconnected') {
        reconnectAttemptsRef.current += 1;
        lastReconnectReasonRef.current = 'ICE state disconnected';
      } else if (pc.iceConnectionState === 'failed') {
        console.warn('[CallNAT] Caller ICE connection failed, restarting ICE...');
        reconnectFailuresRef.current += 1;
        lastFailureTimestampRef.current = new Date().toLocaleTimeString();
        lastReconnectReasonRef.current = 'ICE connection state failed';
        restartIceConnection();
      }
    };

    pc.onconnectionstatechange = () => {
      if (mediaTransportRef.current === 'livekit' || isLiveKitActive) {
        return;
      }
      if (pc.connectionState === 'connected') {
        if (iceWatchdogTimerRef.current) {
          clearTimeout(iceWatchdogTimerRef.current);
          iceWatchdogTimerRef.current = null;
        }
        setCallStatus('in_call');
      } else if (pc.connectionState === 'failed') {
        console.warn('[CallNAT] Caller connectionState failed, restarting ICE...');
        reconnectFailuresRef.current += 1;
        lastFailureTimestampRef.current = new Date().toLocaleTimeString();
        lastReconnectReasonRef.current = 'WebRTC connectionState failed';
        restartIceConnection();
      }
    };

    // Buffer, unmask and broadcast cleaned ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const cleaned = cleanIceCandidate(event.candidate.toJSON());
        if (cleaned) {
          localIceCandidatesRef.current.push(cleaned);

          const localZtIp = getLocalZeroTierIp();
          sendSignalToRoom('ice_candidate', {
            candidate: cleaned,
            senderId: user.id,
            senderZeroTierIp: localZtIp,
          });
          sendSignalToUser(recipientId, 'ice_candidate', {
            candidate: cleaned,
            senderId: user.id,
            senderZeroTierIp: localZtIp,
          });

          // If local ZeroTier IP is present, synthesize explicit direct route candidate
          if (localZtIp) {
            const synth = synthesizeZeroTierCandidate(cleaned, localZtIp);
            if (synth) {
              localIceCandidatesRef.current.push(synth);
              sendSignalToRoom('ice_candidate', {
                candidate: synth,
                senderId: user.id,
                senderZeroTierIp: localZtIp,
              });
              sendSignalToUser(recipientId, 'ice_candidate', {
                candidate: synth,
                senderId: user.id,
                senderZeroTierIp: localZtIp,
              });
            }
          }
        }
      }
    };

    // Connect to shared room channel for in-call signaling
    const roomChannel = supabase.channel(`call-room-${conversationId}`);
    roomChannelRef.current = roomChannel;

    roomChannel
      .on('broadcast', { event: 'call_answer' }, async ({ payload }) => {
        if (payload?.calleeZeroTierIp) {
          peerZeroTierIpRef.current = payload.calleeZeroTierIp;
          setPeerZeroTierIpState(payload.calleeZeroTierIp);
          setPeerZeroTierIp(payload.calleeZeroTierIp);
        }
        if (payload?.sdp) {
          await applyAnswerSdp(payload.sdp);
        }
      })
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (payload?.senderZeroTierIp) {
          peerZeroTierIpRef.current = payload.senderZeroTierIp;
          setPeerZeroTierIpState(payload.senderZeroTierIp);
        }
        if (payload?.candidate && payload.senderId !== user.id) {
          await applyRemoteCandidate(payload.candidate);
        }
      })
      .on('broadcast', { event: 'ice_restart_offer' }, async ({ payload }) => {
        if (!payload?.sdp || payload.senderId === user.id) return;
        const activePc = pcRef.current;
        if (!activePc) return;
        try {
          console.log('[CallNAT] Received remote ICE restart offer in caller room, answering...');
          if (payload.senderZeroTierIp) {
            peerZeroTierIpRef.current = payload.senderZeroTierIp;
            setPeerZeroTierIpState(payload.senderZeroTierIp);
            setPeerZeroTierIp(payload.senderZeroTierIp);
          }
          seenCandidatesRef.current.clear();
          localIceCandidatesRef.current = [];
          pendingRemoteCandidatesRef.current = [];

          await activePc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await drainPendingRemoteCandidates();

          const restartAns = await activePc.createAnswer();
          await activePc.setLocalDescription(restartAns);

          const localZtIp = getLocalZeroTierIp();
          const ansPayload = {
            sdp: restartAns,
            senderId: user.id,
            senderZeroTierIp: localZtIp,
            conversationId,
          };
          sendSignalToRoom('ice_restart_answer', ansPayload);
          sendSignalToUser(recipientId, 'ice_restart_answer', ansPayload);
        } catch (e) {
          console.warn('[CallNAT] Error handling ice_restart_offer in room:', e);
        }
      })
      .on('broadcast', { event: 'ice_restart_answer' }, async ({ payload }) => {
        if (!payload?.sdp || payload.senderId === user.id) return;
        const activePc = pcRef.current;
        if (!activePc) return;
        try {
          if (payload.senderZeroTierIp) {
            peerZeroTierIpRef.current = payload.senderZeroTierIp;
            setPeerZeroTierIpState(payload.senderZeroTierIp);
            setPeerZeroTierIp(payload.senderZeroTierIp);
          }
          if (activePc.signalingState === 'have-local-offer') {
            await activePc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await drainPendingRemoteCandidates();
            console.log('[CallNAT] ICE restart answer applied in caller room.');
          }
        } catch (e) {
          console.warn('[CallNAT] Error applying ice_restart_answer in caller room:', e);
        }
      })
      .on('broadcast', { event: 'media_renegotiate_offer' }, ({ payload }) => {
        handleIncomingRenegotiateOffer(payload);
      })
      .on('broadcast', { event: 'media_renegotiate_answer' }, ({ payload }) => {
        handleIncomingRenegotiateAnswer(payload);
      })
      .on('broadcast', { event: 'peer_media_toggle' }, ({ payload }) => {
        handlePeerMediaToggle(payload);
      })
      .on('broadcast', { event: 'soundboard_play' }, async ({ payload }) => {
        if (payload?.clip && payload.senderId !== user.id) {
          console.log('[CallSoundboard] Remote soundboard clip received via room:', payload.clip.name);
          soundboardEngine.playClip(payload.clip);
          toast({
            title: `${payload.senderName || 'Squadmate'} played ${payload.clip.name}`,
            description: `${payload.clip.icon || '🔊'} Soundboard`,
            type: 'info',
            duration: 2500,
          });
        }
      })
      .on('broadcast', { event: 'call_rejected' }, () => {
        if (isGroupCallRef.current) {
          console.log('[CallSignaling] Member declined squad call; call continues for active members');
          return;
        }
        toast({ title: 'Call Declined', description: 'Squadmate was unable to answer.', type: 'info' });
        stopMediaTracks();
        setCallStatus('idle');
      })
      .on('broadcast', { event: 'call_ended' }, ({ payload }: any) => {
        if (isGroupCallRef.current) {
          if (payload?.userId) {
            setParticipants((prev) => prev.filter((p) => p.id !== payload.userId));
          }
          return;
        }
        stopMediaTracks();
        setCallStatus('idle');
        toast({ title: 'Call Ended', description: 'Squadmate disconnected from voice room.', type: 'info' });
      })
      .on('broadcast', { event: 'call_accepted' }, ({ payload }) => {
        if (!payload || payload.calleeId === user.id) return;
        console.log('[CallSignaling] Instant call_accepted in caller room channel');
        RingtonePlayer.stopAll();
        if (ringtoneRef.current) {
          ringtoneRef.current.stop();
          ringtoneRef.current = null;
        }
        if (ringingTimerRef.current) {
          clearTimeout(ringingTimerRef.current);
          ringingTimerRef.current = null;
        }
        if (ringingBeaconRef.current) {
          clearInterval(ringingBeaconRef.current);
          ringingBeaconRef.current = null;
        }
        callStatusRef.current = 'in_call';
        setCallStatus('in_call');
      })
      .on('broadcast', { event: 'query_squad_call' }, () => {
        if (callStatusRef.current === 'in_call' && isGroupCallRef.current) {
          try {
            const room = roomChannelRef.current;
            if (room && room.state === 'joined') {
              const activeMembers = participantsRef.current.length > 0
                ? participantsRef.current.map((p) => ({
                    id: p.id,
                    name: p.name,
                    avatar_url: p.avatar_url || (p.id === user.id ? profile?.avatar_url : null),
                    isSpeaking: p.isSpeaking,
                    isMuted: p.isMuted,
                  }))
                : [
                    {
                      id: user.id,
                      name: profile?.display_name || user.email?.split('@')[0] || 'Squadmate',
                      avatar_url: profile?.avatar_url || null,
                      isSpeaking: false,
                      isMuted: isMicMuted,
                    },
                  ];

              room.send({
                type: 'broadcast',
                event: 'squad_call_active',
                payload: {
                  id: activeCallSessionIdRef.current || `call_${Date.now()}`,
                  conversation_id: activeConversationIdRef.current || conversationId,
                  caller_id: user.id,
                  caller_name: profile?.display_name || user.email?.split('@')[0],
                  caller_avatar: profile?.avatar_url || null,
                  status: 'active',
                  started_at: new Date().toISOString(),
                  participants: activeMembers,
                },
              }).catch(() => {});
            }
          } catch {}
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          flushRoomQueue();
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const callPayload: IncomingCallData = {
              callerId: user.id,
              callerName: profile?.display_name || profile?.username || 'Squad Member',
              callerAvatar: profile?.avatar_url || null,
              targetUserId: recipientId,
              conversationId,
              isVideo: video,
              sdp: offer,
              callerZeroTierIp: getLocalZeroTierIp(),
            };

            activeCallPayloadRef.current = callPayload;

            // Notify recipient directly via persistent user mailbox with SDP
            sendSignalToUser(recipientId, 'incoming_call', callPayload);

            // Also broadcast on the shared room channel
            roomChannel.send({
              type: 'broadcast',
              event: 'incoming_call',
              payload: callPayload,
            }).catch(() => {});
          } catch (e) {
            console.warn('[CallSignaling] Error creating offer:', e);
          }
        }
      });
  };

  // 3. ACCEPT INCOMING CALL
  const acceptCall = async () => {
    if (!incomingCall || !user || !supabase) return;

    RingtonePlayer.stopAll();
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }
    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }

    const { callerId, callerName, conversationId, isVideo, sdp } = incomingCall;

    // Immediately notify caller that the call was accepted so caller stops ringing right away
    const acceptPayload = {
      conversationId,
      calleeId: user.id,
      calleeName: profile?.display_name || user.email?.split('@')[0] || 'Squadmate',
    };
    sendSignalToUser(callerId, 'call_accepted', acceptPayload);
    try {
      supabase
        .from('call_sessions')
        .update({ status: 'in_call' })
        .eq('conversation_id', conversationId)
        .then(() => {}, () => {});
    } catch {}

    // Immediately dismiss incoming call modal and transition call status
    if (incomingCall.isGroup) {
      setIsGroupCall(true);
      isGroupCallRef.current = true;
    }
    setIncomingCall(null);
    incomingCallRef.current = null;
    callStatusRef.current = 'in_call';
    activeConversationIdRef.current = conversationId;
    peerUserIdRef.current = callerId;
    setCallStatus('in_call');

    // Pre-unlock the audio element under the user click gesture
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = isDeafenedRef.current;
      remoteAudioElementRef.current.play().catch(() => {});
    }

    setActiveConversationId(conversationId);
    setPeerUserId(callerId);
    setPeerName(callerName);
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);

    const pttActive = isPushToTalkEnabled(settingsRef.current);
    setIsMicMuted(pttActive);
    isMicMutedRef.current = pttActive;

    const callSessionId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    activeCallSessionIdRef.current = callSessionId;

    // Acquire microphone & optional camera
    const stream = await getMedia(isVideo);
    if (activeCallSessionIdRef.current !== callSessionId) return;

    if (pttActive && stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    // Connect LiveKit Cloud SFU with Krisp AI Filter
    const livekitOk = await connectLiveKitCall(conversationId, stream, callSessionId);
    if (activeCallSessionIdRef.current !== callSessionId) return;

    if (pttActive && livekitRoomRef.current?.localParticipant) {
      livekitRoomRef.current.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }

    // Setup WebRTC Peer Connection with TURN relay and candidate pre-fetching
    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    pcRef.current = pc;
    localIceCandidatesRef.current = [];
    pendingRemoteCandidatesRef.current = [];
    seenCandidatesRef.current.clear();

    if (livekitOk) {
      mediaTransportRef.current = 'livekit';
      console.log('[CallContext] Callee LiveKit SFU media active. Suppressing duplicate native WebRTC audio transmission.');
    } else {
      mediaTransportRef.current = 'webrtc';
      console.log('[CallContext] Callee LiveKit unavailable. Activating native WebRTC P2P fallback audio transport.');
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.enabled = true;
          pc.addTrack(track, stream);
        });
      }
    }

    pc.ontrack = (event) => {
      // Authoritative transport check: if LiveKit is active, suppress WebRTC playback
      if (mediaTransportRef.current !== 'webrtc') {
        console.log('[CallSignaling] Callee suppressing WebRTC track; LiveKit is authoritative.');
        return;
      }
      console.log('[CallSignaling] Received remote media track on callee via WebRTC fallback:', event.track.kind);
      attachRemoteTrack(event.track);
      setCallStatus('in_call');
      if (event.track.kind === 'video' && (isVideo || (!event.track.muted && event.track.readyState === 'live'))) {
        setParticipants((prev) =>
          prev.map((p) => (p.id !== user.id ? { ...p, isCameraOn: true } : p))
        );
      }
    };

    // Hook transceiver un-mute listeners so swapped or enabled camera tracks are immediately rendered
    pc.getTransceivers().forEach((transceiver) => {
      const recTrack = transceiver.receiver?.track;
      if (recTrack) {
        recTrack.onunmute = () => {
          if (recTrack.kind === 'audio' && mediaTransportRef.current === 'livekit') {
            return;
          }
          console.log('[CallSignaling] Callee remote transceiver track unmuted:', recTrack.kind);
          recTrack.enabled = true;
          attachRemoteTrack(recTrack);
          if (recTrack.kind === 'video') {
            setParticipants((prev) =>
              prev.map((p) => (p.id !== user.id ? { ...p, isCameraOn: true } : p))
            );
          }
        };
        if (recTrack.readyState === 'live' && !recTrack.muted) {
          if (recTrack.kind !== 'audio' || mediaTransportRef.current !== 'livekit') {
            recTrack.enabled = true;
            attachRemoteTrack(recTrack);
          }
          if (recTrack.kind === 'video' && isVideo) {
            setParticipants((prev) =>
              prev.map((p) => (p.id !== user.id ? { ...p, isCameraOn: true } : p))
            );
          }
        }
      }
    });

    // 12-second connection watchdog: if stuck in checking/connecting, trigger automatic ICE restart
    if (iceWatchdogTimerRef.current) clearTimeout(iceWatchdogTimerRef.current);
    iceWatchdogTimerRef.current = setTimeout(() => {
      const activePc = pcRef.current;
      if (activePc && activePc.iceConnectionState !== 'connected' && activePc.iceConnectionState !== 'completed') {
        console.log('[CallNAT] WebRTC connection still pending after 12s on callee, restarting ICE...');
        restartIceConnection();
      }
    }, 12000);

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (iceWatchdogTimerRef.current) {
          clearTimeout(iceWatchdogTimerRef.current);
          iceWatchdogTimerRef.current = null;
        }
        setCallStatus('in_call');
      } else if (pc.iceConnectionState === 'disconnected') {
        reconnectAttemptsRef.current += 1;
        lastReconnectReasonRef.current = 'ICE state disconnected';
      } else if (pc.iceConnectionState === 'failed') {
        console.warn('[CallNAT] Callee ICE connection failed, restarting ICE...');
        reconnectFailuresRef.current += 1;
        lastFailureTimestampRef.current = new Date().toLocaleTimeString();
        lastReconnectReasonRef.current = 'ICE connection state failed';
        restartIceConnection();
      }
    };

    pc.onconnectionstatechange = () => {
      if (mediaTransportRef.current === 'livekit' || isLiveKitActive) {
        return;
      }
      if (pc.connectionState === 'connected') {
        if (iceWatchdogTimerRef.current) {
          clearTimeout(iceWatchdogTimerRef.current);
          iceWatchdogTimerRef.current = null;
        }
        setCallStatus('in_call');
      } else if (pc.connectionState === 'failed') {
        console.warn('[CallNAT] Callee connectionState failed, restarting ICE...');
        reconnectFailuresRef.current += 1;
        lastFailureTimestampRef.current = new Date().toLocaleTimeString();
        lastReconnectReasonRef.current = 'WebRTC connectionState failed';
        restartIceConnection();
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const cleaned = cleanIceCandidate(event.candidate.toJSON());
        if (cleaned) {
          localIceCandidatesRef.current.push(cleaned);

          const localZtIp = getLocalZeroTierIp();
          sendSignalToRoom('ice_candidate', {
            candidate: cleaned,
            senderId: user.id,
            senderZeroTierIp: localZtIp,
          });
          sendSignalToUser(callerId, 'ice_candidate', {
            candidate: cleaned,
            senderId: user.id,
            senderZeroTierIp: localZtIp,
          });

          if (localZtIp) {
            const synth = synthesizeZeroTierCandidate(cleaned, localZtIp);
            if (synth) {
              localIceCandidatesRef.current.push(synth);
              sendSignalToRoom('ice_candidate', {
                candidate: synth,
                senderId: user.id,
                senderZeroTierIp: localZtIp,
              });
              sendSignalToUser(callerId, 'ice_candidate', {
                candidate: synth,
                senderId: user.id,
                senderZeroTierIp: localZtIp,
              });
            }
          }
        }
      }
    };

    // Connect to shared room channel
    const roomChannel = supabase.channel(`call-room-${conversationId}`);
    roomChannelRef.current = roomChannel;

    roomChannel
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (payload?.senderZeroTierIp) {
          peerZeroTierIpRef.current = payload.senderZeroTierIp;
          setPeerZeroTierIpState(payload.senderZeroTierIp);
        }
        if (payload?.candidate && payload.senderId !== user.id) {
          await applyRemoteCandidate(payload.candidate);
        }
      })
      .on('broadcast', { event: 'ice_restart_offer' }, async ({ payload }) => {
        if (!payload?.sdp || payload.senderId === user.id) return;
        const activePc = pcRef.current;
        if (!activePc) return;
        try {
          console.log('[CallNAT] Received remote ICE restart offer in callee room, answering...');
          if (payload.senderZeroTierIp) {
            peerZeroTierIpRef.current = payload.senderZeroTierIp;
            setPeerZeroTierIpState(payload.senderZeroTierIp);
            setPeerZeroTierIp(payload.senderZeroTierIp);
          }
          seenCandidatesRef.current.clear();
          localIceCandidatesRef.current = [];
          pendingRemoteCandidatesRef.current = [];

          await activePc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await drainPendingRemoteCandidates();

          const restartAns = await activePc.createAnswer();
          await activePc.setLocalDescription(restartAns);

          const localZtIp = getLocalZeroTierIp();
          const ansPayload = {
            sdp: restartAns,
            senderId: user.id,
            senderZeroTierIp: localZtIp,
            conversationId,
          };
          sendSignalToRoom('ice_restart_answer', ansPayload);
          sendSignalToUser(callerId, 'ice_restart_answer', ansPayload);
        } catch (e) {
          console.warn('[CallNAT] Error handling ice_restart_offer in callee room:', e);
        }
      })
      .on('broadcast', { event: 'ice_restart_answer' }, async ({ payload }) => {
        if (!payload?.sdp || payload.senderId === user.id) return;
        const activePc = pcRef.current;
        if (!activePc) return;
        try {
          if (payload.senderZeroTierIp) {
            peerZeroTierIpRef.current = payload.senderZeroTierIp;
            setPeerZeroTierIpState(payload.senderZeroTierIp);
            setPeerZeroTierIp(payload.senderZeroTierIp);
          }
          if (activePc.signalingState === 'have-local-offer') {
            await activePc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await drainPendingRemoteCandidates();
            console.log('[CallNAT] ICE restart answer applied in callee room.');
          }
        } catch (e) {
          console.warn('[CallNAT] Error applying ice_restart_answer in callee room:', e);
        }
      })
      .on('broadcast', { event: 'media_renegotiate_offer' }, ({ payload }) => {
        handleIncomingRenegotiateOffer(payload);
      })
      .on('broadcast', { event: 'media_renegotiate_answer' }, ({ payload }) => {
        handleIncomingRenegotiateAnswer(payload);
      })
      .on('broadcast', { event: 'peer_media_toggle' }, ({ payload }) => {
        handlePeerMediaToggle(payload);
      })
      .on('broadcast', { event: 'soundboard_play' }, async ({ payload }) => {
        if (payload?.clip && payload.senderId !== user.id) {
          console.log('[CallSoundboard] Remote soundboard clip received via callee room:', payload.clip.name);
          soundboardEngine.playClip(payload.clip);
          toast({
            title: `${payload.senderName || 'Squadmate'} played ${payload.clip.name}`,
            description: `${payload.clip.icon || '🔊'} Soundboard`,
            type: 'info',
            duration: 2500,
          });
        }
      })
      .on('broadcast', { event: 'call_ended' }, () => {
        stopMediaTracks();
        setCallStatus('idle');
        toast({ title: 'Call Ended', description: 'Squadmate disconnected from voice room.', type: 'info' });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          flushRoomQueue();
          try {
            // Also broadcast accept on room channel
            roomChannel.send({
              type: 'broadcast',
              event: 'call_accepted',
              payload: acceptPayload,
            }).catch(() => {});

            if (sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));
              await drainPendingRemoteCandidates();

              pc.getTransceivers().forEach((t) => {
                if (t.direction !== 'sendrecv') {
                  t.direction = 'sendrecv';
                }
                const recTrack = t.receiver?.track;
                if (recTrack) {
                  recTrack.onunmute = () => {
                    console.log('[CallSignaling] Callee transceiver track unmuted:', recTrack.kind);
                    recTrack.enabled = true;
                    attachRemoteTrack(recTrack);
                    if (recTrack.kind === 'video') {
                      setParticipants((prev) =>
                        prev.map((p) => (p.id !== user.id ? { ...p, isCameraOn: true } : p))
                      );
                    }
                  };
                  if (recTrack.readyState === 'live' && !recTrack.muted) {
                    recTrack.enabled = true;
                    attachRemoteTrack(recTrack);
                    if (recTrack.kind === 'video') {
                      setParticipants((prev) =>
                        prev.map((p) => (p.id !== user.id ? { ...p, isCameraOn: true } : p))
                      );
                    }
                  }
                }
              });

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              const localZtIp = getLocalZeroTierIp();
              const answerPayload = {
                sdp: answer,
                conversationId,
                calleeId: user.id,
                calleeZeroTierIp: localZtIp,
              };

              // Broadcast answer on room channel
              roomChannel.send({
                type: 'broadcast',
                event: 'call_answer',
                payload: answerPayload,
              }).catch(() => {});

              // Also send directly to caller's mailbox
              sendSignalToUser(callerId, 'call_answer', answerPayload);

              // Flush all gathered local candidates to room & caller
              localIceCandidatesRef.current.forEach((candidate) => {
                sendSignalToRoom('ice_candidate', { candidate, senderId: user.id, senderZeroTierIp: localZtIp });
                sendSignalToUser(callerId, 'ice_candidate', { candidate, senderId: user.id, senderZeroTierIp: localZtIp });
              });
            }
          } catch (e) {
            console.warn('[CallSignaling] Error creating answer:', e);
          }
        }
      });

    setParticipants([
      {
        id: user.id,
        name: profile?.display_name || 'You',
        isSpeaking: false,
        isMuted: pttActive,
        isCameraOn: isVideo,
        isScreenSharing: false,
      },
      {
        id: callerId,
        name: callerName,
        isSpeaking: false,
        isMuted: false,
        isCameraOn: isVideo,
        isScreenSharing: false,
      },
    ]);

    setIncomingCall(null);
    try {
      supabase
        .from('call_sessions')
        .update({ status: 'active' })
        .eq('conversation_id', conversationId)
        .eq('status', 'ringing')
        .then(() => {}, () => {});
    } catch {}
    toast({ title: 'Call Connected', description: `Speaking with ${callerName}.`, type: 'success' });
  };

  // 4. REJECT INCOMING CALL
  const rejectCall = () => {
    const inc = incomingCallRef.current || incomingCall;
    const isGroup = Boolean(
      inc?.isGroup ||
      isGroupCallRef.current ||
      isGroupCall ||
      (inc?.conversationId && activeSquadCalls.has(inc.conversationId))
    );
    const callerId = inc?.callerId;
    const convId = inc?.conversationId;

    if (!isGroup) {
      if (callerId) {
        // Mark as rejected in recent cooldown cache to suppress stray in-flight beacons
        const key = `${callerId}_${convId || ''}`;
        recentlyDeclinedCallsRef.current.set(key, Date.now() + 15000);

        // Send guaranteed direct signal to caller's personal channel
        sendDirectSignal(`user-signals-${callerId}`, 'call_rejected', {
          conversationId: convId,
          calleeId: user?.id,
        });
        sendSignalToUser(callerId, 'call_rejected', {
          conversationId: convId,
          calleeId: user?.id,
        });
      }

      if (convId) {
        // Also broadcast to the call room channel in case caller is listening there
        sendDirectSignal(`call-room-${convId}`, 'call_rejected', {
          conversationId: convId,
          calleeId: user?.id,
        });
        sendSignalToRoom('call_rejected', {
          conversationId: convId,
          calleeId: user?.id,
        });

        // Update call_sessions table in Supabase
        try {
          supabase
            .from('call_sessions')
            .update({ status: 'rejected', ended_at: new Date().toISOString() })
            .eq('conversation_id', convId)
            .eq('status', 'ringing')
            .then(() => {}, () => {});
        } catch {}
      }
    } else {
      console.log('[CallSignaling] Callee dismissed squad call invitation; squad call stays active in background');
      if (convId) {
        setActiveSquadCalls((prev) => {
          const next = new Map(prev);
          next.set(convId, {
            id: inc?.id || `call_${Date.now()}`,
            conversation_id: convId,
            caller_id: callerId || '',
            caller_name: inc?.callerName || 'Squadmate',
            status: 'active',
            started_at: new Date().toISOString(),
          });
          return next;
        });
      }
    }

    // Stop ringtone and clean up incoming ringing state immediately
    RingtonePlayer.stopAll();
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }
    setIncomingCall(null);
    incomingCallRef.current = null;
    setCallStatus('idle');
    callStatusRef.current = 'idle';

    stopMediaTracks();
  };

  // 5. END ACTIVE CALL
  const endCall = () => {
    const isGroup = isGroupCallRef.current || isGroupCall;
    const target = peerUserIdRef.current || peerUserId || incomingCallRef.current?.callerId;
    const convId = activeConversationIdRef.current || activeConversationId;
    const lkRoom = livekitRoomRef.current;

    if (squadHeartbeatRef.current) {
      clearInterval(squadHeartbeatRef.current);
      squadHeartbeatRef.current = null;
    }

    // Check if other squadmates are still in this call:
    const lkRemoteCount = lkRoom?.remoteParticipants?.size ?? 0;
    const callParticipantsRemaining = participants.filter((p) => p.id !== user?.id);
    const squadParticipantsRemaining = convId
      ? (getSquadCallParticipants(convId) || []).filter((p: any) => p.id !== user?.id)
      : [];
    const activeSquadData = convId ? activeSquadCalls.get(convId) : null;
    const activeSquadRemaining = activeSquadData?.participants?.filter((p: any) => p.id !== user?.id) || [];

    const hasRemainingSquadmates = Boolean(
      isGroup &&
        (lkRemoteCount > 0 ||
          callParticipantsRemaining.length > 0 ||
          squadParticipantsRemaining.length > 0 ||
          activeSquadRemaining.length > 0)
    );

    if (hasRemainingSquadmates && convId) {
      console.log('[CallContext] User left squad call; other squadmates remain inside. Retaining active squad call state.');

      // Update local activeSquadCalls so convId remains active and ready to rejoin immediately
      setActiveSquadCalls((prev) => {
        const next = new Map(prev);
        const existing = next.get(convId) || {};
        const remaining = (existing.participants || squadParticipantsRemaining || callParticipantsRemaining).filter(
          (p: any) => p.id !== user?.id
        );
        next.set(convId, {
          ...existing,
          id: existing.id || `call_${Date.now()}`,
          conversation_id: convId,
          status: 'active',
          started_at: existing.started_at || new Date().toISOString(),
          participants: remaining.length > 0 ? remaining : [{ id: 'peer', name: 'Squadmate' }],
        });
        return next;
      });

      // Broadcast participant_left to room so remaining participants know this user left
      sendDirectSignal(`call-room-${convId}`, 'participant_left', {
        conversationId: convId,
        userId: user?.id,
      });
      sendSignalToRoom('participant_left', {
        conversationId: convId,
        userId: user?.id,
      });

      stopMediaTracks();
      toast({ title: 'Disconnected', description: 'Left voice room. Squad call remains active.', type: 'info' });
      return;
    }

    if (convId && isGroup) {
      setActiveSquadCalls((prev) => {
        const next = new Map(prev);
        next.delete(convId);
        return next;
      });
    }

    if (!isGroup && target) {
      sendDirectSignal(`user-signals-${target}`, 'call_ended', {
        conversationId: convId,
        senderId: user?.id,
      });
      sendSignalToUser(target, 'call_ended', {});
    }

    if (convId) {
      sendDirectSignal(`call-room-${convId}`, 'call_ended', {
        conversationId: convId,
        senderId: user?.id,
        userId: user?.id,
        isGroup,
      });
      sendSignalToRoom('call_ended', {
        conversationId: convId,
        senderId: user?.id,
        userId: user?.id,
        isGroup,
      });

      try {
        supabase
          .from('call_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('conversation_id', convId)
          .in('status', ['ringing', 'active', 'in_call'])
          .then(() => {}, () => {});
      } catch {}

      if (isGroup) {
        try {
          const roomBroadcastChannel = supabase.channel(`call-room-${convId}`);
          roomBroadcastChannel.subscribe((subStatus) => {
            if (subStatus === 'SUBSCRIBED') {
              roomBroadcastChannel.send({
                type: 'broadcast',
                event: 'squad_call_ended',
                payload: { conversation_id: convId },
              });
            }
          });
        } catch {}
      }
    }

    stopMediaTracks();
    toast({ title: 'Call Ended', description: 'Disconnected from voice room.', type: 'info' });
  };

  // 6. TOGGLE CONTROLS (Idempotent, leak-free toggles)
  const toggleMic = () => {
    const nextMuted = !isMicMutedRef.current;
    isMicMutedRef.current = nextMuted;
    setIsMicMuted(nextMuted);

    // If unmuting while deafened, automatically undeafen
    if (!nextMuted && isDeafenedRef.current) {
      isDeafenedRef.current = false;
      setIsDeafened(false);
      if (remoteAudioElementRef.current) {
        remoteAudioElementRef.current.muted = false;
      }
    }

    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    // Directly mute/unmute existing LiveKit audio publications without spawning duplicate tracks
    if (livekitRoomRef.current?.localParticipant) {
      try {
        const lp = livekitRoomRef.current.localParticipant;
        const promises: Promise<any>[] = [];
        lp.audioTrackPublications.forEach((pub: any) => {
          if (pub?.track) {
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
        Promise.allSettled(promises).catch(() => {});
      } catch (err) {
        console.warn('[CallContext] Error updating LiveKit audio publication mute state:', err);
      }
    }

    // Update WebRTC fallback audio senders ONLY if WebRTC is the active transport
    if (mediaTransportRef.current === 'webrtc' && pcRef.current) {
      try {
        pcRef.current.getSenders().forEach((sender) => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = !nextMuted;
          }
        });
      } catch {}
    }

    setParticipants((prev) =>
      prev.map((p) => (p.id === user?.id ? { ...p, isMuted: nextMuted } : p))
    );

    sendSignalToRoom('peer_media_toggle', { userId: user?.id, isMuted: nextMuted });
    if (peerUserIdRef.current) {
      sendSignalToUser(peerUserIdRef.current, 'peer_media_toggle', { userId: user?.id, isMuted: nextMuted });
    }

    toast({
      title: nextMuted ? 'Microphone Muted' : 'Microphone Active',
      description: nextMuted ? 'You are muted' : 'Microphone unmuted',
      type: nextMuted ? 'error' : 'success',
      duration: 1500,
    });
  };

  const toggleDeafen = () => {
    const nextDeafened = !isDeafenedRef.current;
    isDeafenedRef.current = nextDeafened;
    setIsDeafened(nextDeafened);

    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = nextDeafened;
      remoteAudioElementRef.current.volume = nextDeafened ? 0 : 1.0;
      if (!nextDeafened && remoteAudioElementRef.current.paused) {
        remoteAudioElementRef.current.play().catch(() => {});
      }
    }

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

    if (nextDeafened && !isMicMutedRef.current) {
      // Deafening automatically mutes microphone
      toggleMic();
    } else if (!nextDeafened && isMicMutedRef.current) {
      // Undeafening restores microphone
      toggleMic();
    }

    sendSignalToRoom('peer_media_toggle', { userId: user?.id, isDeafened: nextDeafened });
    if (peerUserIdRef.current) {
      sendSignalToUser(peerUserIdRef.current, 'peer_media_toggle', { userId: user?.id, isDeafened: nextDeafened });
    }

    toast({
      title: nextDeafened ? 'Deafened' : 'Undeafened',
      description: nextDeafened
        ? 'Incoming call audio and microphone muted.'
        : 'Incoming call audio restored.',
      type: nextDeafened ? 'error' : 'success',
      duration: 1500,
    });
  };

  const setIncomingVolume = React.useCallback(async (vol: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(vol)));
    incomingVolumeRef.current = clamped;
    setIncomingVolumeState(clamped);

    const gain = isDeafenedRef.current ? 0 : clamped / 100;
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.volume = gain;
    }

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
    isMicMutedRef.current = muted;
    setIsMicMuted(muted);

    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

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
        });
        promises.push(lp.setMicrophoneEnabled(!muted));
        await Promise.allSettled(promises);
      } catch (lkErr) {
        console.warn('[LiveKit Call] Error setting mic state:', lkErr);
      }
    }

    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s: RTCRtpSender) => {
        if (s.track?.kind === 'audio') {
          s.track.enabled = !muted;
        }
      });
    }

    sendSignalToRoom('peer_media_toggle', { userId: user?.id, isMuted: muted });
  }, [sendSignalToRoom, user?.id]);

  const setDeafenedExplicit = React.useCallback(async (deafened: boolean) => {
    isDeafenedRef.current = deafened;
    setIsDeafened(deafened);

    const gain = deafened ? 0 : incomingVolumeRef.current / 100;
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = deafened;
      remoteAudioElementRef.current.volume = gain;
      if (!deafened && remoteAudioElementRef.current.paused) {
        remoteAudioElementRef.current.play().catch(() => {});
      }
    }

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

    sendSignalToRoom('peer_media_toggle', { userId: user?.id, isDeafened: deafened });
  }, [sendSignalToRoom, user?.id]);

  const forceMute = React.useCallback(() => {
    disconnectGateRef.current = true;
    isMicMutedRef.current = true;
    setIsMicMuted(true);

    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }

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

    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s: RTCRtpSender) => {
        if (s.track?.kind === 'audio') {
          s.track.enabled = false;
        }
      });
    }

    sendSignalToRoom('peer_media_toggle', { userId: user?.id, isMuted: true });
  }, [sendSignalToRoom, user?.id]);

  const toggleCamera = async () => {
    const pc = pcRef.current;
    const nextCamera = !isCameraOn;

    if (nextCamera) {
      try {
        let videoTrack = localStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live');
        if (!videoTrack) {
          let camStream: MediaStream;
          try {
            camStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            });
          } catch (firstErr) {
            console.warn('HD camera constraints failed, attempting basic video:', firstErr);
            camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
          videoTrack = camStream.getVideoTracks()[0];
          if (!videoTrack) throw new Error('No video track returned');

          if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach((oldTrack) => {
              try { oldTrack.stop(); } catch {}
              localStreamRef.current?.removeTrack(oldTrack);
            });
            localStreamRef.current.addTrack(videoTrack);
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          } else {
            const newStream = new MediaStream([videoTrack]);
            localStreamRef.current = newStream;
            setLocalStream(newStream);
          }
        } else {
          videoTrack.enabled = true;
          setLocalStream(new MediaStream(localStreamRef.current?.getTracks() || []));
        }

        // Send camera track over WebRTC via pre-negotiated video sender (if not actively screen sharing)
        if (pc && !isScreenSharing) {
          const videoSender = getVideoSender(pc);
          const videoTransceiver = pc.getTransceivers().find(
            (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
          );
          let needsRenegotiation = false;

          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
            if (videoTransceiver && videoTransceiver.direction !== 'sendrecv') {
              videoTransceiver.direction = 'sendrecv';
              needsRenegotiation = true;
            }
          } else {
            pc.addTrack(videoTrack, localStreamRef.current || new MediaStream([videoTrack]));
            needsRenegotiation = true;
          }

          if (needsRenegotiation) {
            renegotiateMedia().catch(() => {});
          }
        }

        if (livekitRoomRef.current?.localParticipant && videoTrack) {
          try {
            const { Track } = await import('livekit-client');
            await livekitRoomRef.current.localParticipant.publishTrack(videoTrack, { source: Track.Source.Camera });
          } catch {}
        }

        setIsCameraOn(true);
        setParticipants((prev) =>
          prev.map((p) => (p.id === user?.id ? { ...p, isCameraOn: true } : p))
        );

        sendSignalToRoom('peer_media_toggle', { userId: user?.id, isCameraOn: true });
        if (peerUserId) {
          sendSignalToUser(peerUserId, 'peer_media_toggle', { userId: user?.id, isCameraOn: true });
        }
      } catch (err) {
        console.warn('Failed to access camera:', err);
        toast({ title: 'Camera Error', description: 'Could not access webcam. Please check permissions.', type: 'error' });
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = false;
          try { track.stop(); } catch {}
          localStreamRef.current?.removeTrack(track);
        });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      // If screen share is not active, set video sender track to null
      if (pc && !isScreenSharing) {
        const videoSender = getVideoSender(pc);
        if (videoSender) {
          await videoSender.replaceTrack(null);
        }
      }

      if (livekitRoomRef.current?.localParticipant) {
        try {
          const { Track } = await import('livekit-client');
          const pub = livekitRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub?.track) {
            livekitRoomRef.current.localParticipant.unpublishTrack(pub.track);
          }
        } catch {}
      }

      setIsCameraOn(false);
      setParticipants((prev) =>
        prev.map((p) => (p.id === user?.id ? { ...p, isCameraOn: false } : p))
      );

      sendSignalToRoom('peer_media_toggle', { userId: user?.id, isCameraOn: false });
      if (peerUserId) {
        sendSignalToUser(peerUserId, 'peer_media_toggle', { userId: user?.id, isCameraOn: false });
      }
    }
  };

  const toggleScreenShare = async () => {
    const pc = pcRef.current;

    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        screenStreamRef.current = null;
      }
      setScreenStream(null);
      setIsScreenSharing(false);

      if (pc) {
        const videoSender = getVideoSender(pc);
        const camTrack = isCameraOn
          ? localStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live') || null
          : null;
        if (videoSender) {
          await videoSender.replaceTrack(camTrack);
        }
      }

      if (livekitRoomRef.current?.localParticipant) {
        try {
          const { Track } = await import('livekit-client');
          const pub = livekitRoomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
          if (pub?.track) {
            livekitRoomRef.current.localParticipant.unpublishTrack(pub.track);
          }
        } catch {}
      }

      setParticipants((prev) =>
        prev.map((p) => (p.id === user?.id ? { ...p, isScreenSharing: false } : p))
      );

      sendSignalToRoom('peer_media_toggle', { userId: user?.id, isScreenSharing: false });
      if (peerUserId) {
        sendSignalToUser(peerUserId, 'peer_media_toggle', { userId: user?.id, isScreenSharing: false });
      }
      return;
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        toast({ title: 'Not Supported', description: 'Screen sharing is not supported in this browser.', type: 'error' });
        return;
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      screenStreamRef.current = displayStream;
      setScreenStream(displayStream);
      setIsScreenSharing(true);

      const screenTrack = displayStream.getVideoTracks()[0];

      if (pc) {
        const videoSender = getVideoSender(pc);
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, displayStream);
        }
      }

      if (livekitRoomRef.current?.localParticipant && screenTrack) {
        try {
          const { Track } = await import('livekit-client');
          await livekitRoomRef.current.localParticipant.publishTrack(screenTrack, { source: Track.Source.ScreenShare });
        } catch {}
      }

      setParticipants((prev) =>
        prev.map((p) => (p.id === user?.id ? { ...p, isScreenSharing: true } : p))
      );

      sendSignalToRoom('peer_media_toggle', { userId: user?.id, isScreenSharing: true });
      if (peerUserId) {
        sendSignalToUser(peerUserId, 'peer_media_toggle', { userId: user?.id, isScreenSharing: true });
      }

      screenTrack.onended = async () => {
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((t) => {
            try { t.stop(); } catch {}
          });
          screenStreamRef.current = null;
        }
        setScreenStream(null);
        setIsScreenSharing(false);

        if (pcRef.current) {
          const videoSender = getVideoSender(pcRef.current);
          const camTrack = isCameraOn
            ? localStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live') || null
            : null;
          if (videoSender) {
            await videoSender.replaceTrack(camTrack);
          }
        }

        if (livekitRoomRef.current?.localParticipant) {
          try {
            const { Track } = await import('livekit-client');
            const pub = livekitRoomRef.current.localParticipant.getTrackPublication(Track.Source.ScreenShare);
            if (pub?.track) {
              livekitRoomRef.current.localParticipant.unpublishTrack(pub.track);
            }
          } catch {}
        }

        setParticipants((prev) =>
          prev.map((p) => (p.id === user?.id ? { ...p, isScreenSharing: false } : p))
        );

        sendSignalToRoom('peer_media_toggle', { userId: user?.id, isScreenSharing: false });
        if (peerUserId) {
          sendSignalToUser(peerUserId, 'peer_media_toggle', { userId: user?.id, isScreenSharing: false });
        }
      };
    } catch (err) {
      console.warn('Screen share failed or cancelled:', err);
      setIsScreenSharing(false);
      setScreenStream(null);
    }
  };

  // Stable callback dispatchers to keep context value reference stable
  const startCallRef = React.useRef(startCall);
  startCallRef.current = startCall;
  const stableStartCall = React.useCallback(
    (...args: Parameters<typeof startCall>) => startCallRef.current(...args),
    []
  );

  const acceptCallRef = React.useRef(acceptCall);
  acceptCallRef.current = acceptCall;
  const stableAcceptCall = React.useCallback(
    (...args: Parameters<typeof acceptCall>) => acceptCallRef.current(...args),
    []
  );

  const rejectCallRef = React.useRef(rejectCall);
  rejectCallRef.current = rejectCall;
  const stableRejectCall = React.useCallback(
    (...args: Parameters<typeof rejectCall>) => rejectCallRef.current(...args),
    []
  );

  const endCallRef = React.useRef(endCall);
  endCallRef.current = endCall;
  const stableEndCall = React.useCallback(
    (...args: Parameters<typeof endCall>) => endCallRef.current(...args),
    []
  );

  const toggleMicRef = React.useRef(toggleMic);
  toggleMicRef.current = toggleMic;
  const stableToggleMic = React.useCallback(
    (...args: Parameters<typeof toggleMic>) => toggleMicRef.current(...args),
    []
  );

  const toggleDeafenRef = React.useRef(toggleDeafen);
  toggleDeafenRef.current = toggleDeafen;
  const stableToggleDeafen = React.useCallback(
    (...args: Parameters<typeof toggleDeafen>) => toggleDeafenRef.current(...args),
    []
  );

  const toggleCameraRef = React.useRef(toggleCamera);
  toggleCameraRef.current = toggleCamera;
  const stableToggleCamera = React.useCallback(
    (...args: Parameters<typeof toggleCamera>) => toggleCameraRef.current(...args),
    []
  );

  const toggleScreenShareRef = React.useRef(toggleScreenShare);
  toggleScreenShareRef.current = toggleScreenShare;
  const stableToggleScreenShare = React.useCallback(
    (...args: Parameters<typeof toggleScreenShare>) => toggleScreenShareRef.current(...args),
    []
  );

  const getSquadCallParticipants = React.useCallback(
    (convId?: string | null) => {
      if (!convId) return [];
      if (
        activeConversationIdRef.current === convId &&
        callStatusRef.current === 'in_call' &&
        participantsRef.current.length > 0
      ) {
        return participantsRef.current;
      }
      const squad = activeSquadCalls.get(convId);
      if (squad?.participants && Array.isArray(squad.participants) && squad.participants.length > 0) {
        return squad.participants;
      }
      if (squad?.caller_name) {
        return [
          {
            id: squad.caller_id || 'caller',
            name: squad.caller_name,
            avatar_url: squad.caller_avatar || null,
            isSpeaking: false,
            isMuted: false,
          },
        ];
      }
      return [];
    },
    [activeSquadCalls]
  );

  const callContextValue = React.useMemo(
    () => ({
      callStatus,
      activeConversationId,
      isVideoCall,
      isGroupCall,
      isLiveKitActive,
      isKrispActive,
      isMicMuted,
      isDeafened,
      isCameraOn,
      isScreenSharing,
      incomingCall,
      localStream,
      remoteStream,
      screenStream,
      participants,
      stats,
      startCall: stableStartCall,
      acceptCall: stableAcceptCall,
      rejectCall: stableRejectCall,
      endCall: stableEndCall,
      restartConnection: restartIceConnection,
      toggleMic: stableToggleMic,
      toggleDeafen: stableToggleDeafen,
      toggleCamera: stableToggleCamera,
      toggleScreenShare: stableToggleScreenShare,
      broadcastSoundboardClip,
      isNoiseSuppressionEnabled,
      toggleNoiseSuppression,
      peerZeroTierIp,
      setPeerZeroTierDirectIp,
      incomingVolume,
      setIncomingVolume,
      setMicMutedExplicit,
      setDeafenedExplicit,
      forceMute,
      activeSquadCalls,
      isSquadCallActive,
      getSquadCallParticipants,
      registerSquadCallActive,
      unregisterSquadCall,
    }),
    [
      callStatus,
      activeConversationId,
      isVideoCall,
      isGroupCall,
      isLiveKitActive,
      isKrispActive,
      isMicMuted,
      isDeafened,
      isCameraOn,
      isScreenSharing,
      incomingCall,
      localStream,
      remoteStream,
      screenStream,
      participants,
      stats,
      stableStartCall,
      stableAcceptCall,
      stableRejectCall,
      stableEndCall,
      restartIceConnection,
      stableToggleMic,
      stableToggleDeafen,
      stableToggleCamera,
      stableToggleScreenShare,
      broadcastSoundboardClip,
      isNoiseSuppressionEnabled,
      toggleNoiseSuppression,
      peerZeroTierIp,
      setPeerZeroTierDirectIp,
      incomingVolume,
      setIncomingVolume,
      setMicMutedExplicit,
      setDeafenedExplicit,
      forceMute,
      activeSquadCalls,
      isSquadCallActive,
      getSquadCallParticipants,
      registerSquadCallActive,
      unregisterSquadCall,
    ]
  );

  return (
    <CallContext.Provider value={callContextValue}>
      {children}
      <audio
        ref={remoteAudioElementRef}
        autoPlay
        playsInline
        aria-hidden="true"
        className="fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none"
      />
    </CallContext.Provider>
  );
}

export function useCallContext() {
  const context = React.useContext(CallContext);
  if (!context) {
    throw new Error('useCallContext must be used within a CallProvider');
  }
  return context;
}
