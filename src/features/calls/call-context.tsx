'use client';

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
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}

export interface IncomingCallData {
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  targetUserId: string;
  conversationId: string;
  isVideo: boolean;
  sdp: RTCSessionDescriptionInit;
  callerZeroTierIp?: string | null;
}

interface CallContextType {
  callStatus: CallStatus;
  activeConversationId: string | null;
  isVideoCall: boolean;
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
}

export const CallContext = React.createContext<CallContextType | null>(null);

// Procedural Web Audio Ringtone Generator (no external assets needed)
class RingtonePlayer {
  private ctx: AudioContext | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  start() {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const playTone = () => {
        if (!this.ctx || this.ctx.state === 'closed') return;
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.35);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.4);
      };

      playTone();
      this.intervalId = setInterval(playTone, 2000);
    } catch {}
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [callStatus, setCallStatus] = React.useState<CallStatus>('idle');
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [peerUserId, setPeerUserId] = React.useState<string | null>(null);
  const [peerName, setPeerName] = React.useState<string>('Squadmate');
  const [isVideoCall, setIsVideoCall] = React.useState(false);

  // Incoming call state
  const [incomingCall, setIncomingCall] = React.useState<IncomingCallData | null>(null);

  // Media streams
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = React.useState<MediaStream | null>(null);

  // Media toggles
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isDeafened, setIsDeafened] = React.useState(false);
  const [isCameraOn, setIsCameraOn] = React.useState(false);
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nexus_noise_suppression');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  // Stable references
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const screenStreamRef = React.useRef<MediaStream | null>(null);
  const ringtoneRef = React.useRef<RingtonePlayer | null>(null);
  const ringingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const iceWatchdogTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const iceRestartingRef = React.useRef<boolean>(false);
  const activeCallPayloadRef = React.useRef<IncomingCallData | null>(null);
  const activeCallSessionIdRef = React.useRef<string | null>(null);
  const ringingBeaconRef = React.useRef<NodeJS.Timeout | null>(null);
  const callStatusRef = React.useRef<CallStatus>('idle');
  callStatusRef.current = callStatus;
  const roomChannelRef = React.useRef<RealtimeChannel | null>(null);
  const outboundChannelsRef = React.useRef<Map<string, RealtimeChannel>>(new Map());
  const outboundQueueRef = React.useRef<Map<string, Array<{ event: string; payload: unknown }>>>(new Map());
  const roomQueueRef = React.useRef<Array<{ event: string; payload: unknown }>>([]);
  const remoteAudioElementRef = React.useRef<HTMLAudioElement | null>(null);

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

  const [stats, setStats] = React.useState<DiagnosticsStats>({
    connectionState: 'disconnected',
    rttMs: null,
    jitterMs: null,
    packetLossPercent: null,
    incomingBitrateKbps: null,
    outgoingBitrateKbps: null,
    transportPath: 'unknown',
    isZeroTierActive: false,
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

      const existingChannel = outboundChannelsRef.current.get(targetUserId);
      if (existingChannel && existingChannel.state === 'joined') {
        existingChannel
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

      if (!existingChannel) {
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

    // Apply updated constraints to all active microphone audio tracks
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
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

    toast({
      title: nextState ? 'Noise Suppression Active' : 'Noise Suppression Off',
      description: nextState
        ? 'AI & acoustic filtering active: keyboard clatter and ambient fan noise removed.'
        : 'Raw microphone pass-through active.',
      type: nextState ? 'success' : 'info',
      duration: 2500,
    });
  }, [isNoiseSuppressionEnabled, toast]);

  // Helper to cleanly merge/update tracks into remoteStreamRef without dropping audio or video
  const attachRemoteTrack = React.useCallback((track: MediaStreamTrack) => {
    track.enabled = true;
    if (!remoteStreamRef.current) {
      remoteStreamRef.current = new MediaStream();
    }
    const currentStream = remoteStreamRef.current;
    const existingSameKind = currentStream.getTracks().find((t) => t.kind === track.kind);
    if (existingSameKind && existingSameKind.id !== track.id) {
      try {
        currentStream.removeTrack(existingSameKind);
      } catch {}
    }
    if (!currentStream.getTracks().some((t) => t.id === track.id)) {
      currentStream.addTrack(track);
    }
    setRemoteStream(new MediaStream(currentStream.getTracks()));

    // Also update remote persistent audio element if this is an audio track
    if (track.kind === 'audio' && remoteAudioElementRef.current) {
      if (remoteAudioElementRef.current.srcObject !== currentStream) {
        remoteAudioElementRef.current.srcObject = currentStream;
      }
      remoteAudioElementRef.current.muted = isDeafened;
      remoteAudioElementRef.current.play().catch(() => {});
    }
  }, [isDeafened]);

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
            try { vt.stop(); } catch {}
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
    if (iceWatchdogTimerRef.current) {
      clearTimeout(iceWatchdogTimerRef.current);
      iceWatchdogTimerRef.current = null;
    }
    iceRestartingRef.current = false;
    outboundQueueRef.current.clear();
    roomQueueRef.current = [];

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

    if (roomChannelRef.current && supabase) {
      try {
        supabase.removeChannel(roomChannelRef.current);
      } catch {}
      roomChannelRef.current = null;
    }

    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.pause();
      remoteAudioElementRef.current.srcObject = null;
    }

    localIceCandidatesRef.current = [];
    pendingRemoteCandidatesRef.current = [];
    seenCandidatesRef.current.clear();
    setParticipants([]);
    setIsCameraOn(false);
    setIsDeafened(false);
    setIsScreenSharing(false);
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
    prevStatsRef.current = null;
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
      if (audioEl.srcObject !== remoteStream) {
        audioEl.srcObject = remoteStream;
      }
      audioEl.muted = isDeafened;
      audioEl.volume = 1.0;

      remoteStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
        track.onunmute = () => {
          audioEl.play().catch(() => {});
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
      audioEl.srcObject = null;
    }
  }, [remoteStream, isDeafened]);

  // Synchronize deafen toggle instantly to persistent audio element
  React.useEffect(() => {
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = isDeafened;
    }
  }, [isDeafened]);

  // Web Audio RMS Speech Activity Monitoring for remote audio
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
      const source = audioCtx.createMediaStreamSource(remoteStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const isSpeaking = avg > 20;

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

  // Web Audio RMS Speech Activity Monitoring for local mic
  React.useEffect(() => {
    if (callStatus !== 'in_call' || !localStream || isMicMuted) {
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
      const source = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const isSpeaking = avg > 20;

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
      setStats({
        connectionState: connState,
        rttMs: null,
        jitterMs: null,
        packetLossPercent: null,
        incomingBitrateKbps: null,
        outgoingBitrateKbps: null,
        transportPath: 'unknown',
        isZeroTierActive: false,
      });
      prevStatsRef.current = null;
      return;
    }

    const interval = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        const statsReport = await pc.getStats();
        let rtt: number | null = null;
        let jitter: number | null = null;
        let packetLoss: number | null = null;
        let inBitrate: number | null = null;
        let outBitrate: number | null = null;
        let transportPath: 'direct_p2p' | 'relayed_turn' | 'livekit_sfu' | 'unknown' = 'direct_p2p';

        let currentBytesReceived = 0;
        let currentBytesSent = 0;
        let packetsLost = 0;
        let packetsReceived = 0;

        statsReport.forEach((report) => {
          if (
            report.type === 'candidate-pair' &&
            (report.state === 'succeeded' || report.nominated)
          ) {
            if (typeof report.currentRoundTripTime === 'number') {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            } else if (typeof report.roundTripTime === 'number') {
              rtt = Math.round(report.roundTripTime * 1000);
            }

            const localCand = statsReport.get(report.localCandidateId);
            const remoteCand = statsReport.get(report.remoteCandidateId);
            if (localCand?.candidateType === 'relay' || remoteCand?.candidateType === 'relay') {
              transportPath = 'relayed_turn';
            } else {
              transportPath = 'direct_p2p';
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
          }
        });

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
          pc.connectionState === 'connected' ||
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed';

        const isFailed =
          pc.connectionState === 'failed' || pc.iceConnectionState === 'failed';

        const currentConnectionState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' =
          isConnected
            ? 'connected'
            : isFailed
            ? 'reconnecting'
            : pc.connectionState === 'closed'
            ? 'disconnected'
            : 'connecting';

        setStats({
          connectionState: currentConnectionState,
          rttMs: rtt,
          jitterMs: jitter,
          packetLossPercent: packetLoss,
          incomingBitrateKbps: inBitrate,
          outgoingBitrateKbps: outBitrate,
          transportPath,
          isZeroTierActive: isTauriPresent,
        });
      } catch {}
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [callStatus]);

  // Acquire local microphone and optional camera stream
  const getMedia = async (video: boolean): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: isNoiseSuppressionEnabled,
          autoGainControl: isNoiseSuppressionEnabled,
        },
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (videoErr) {
      if (video) {
        console.warn('Video stream acquisition failed, falling back to audio only:', videoErr);
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: isNoiseSuppressionEnabled,
              autoGainControl: isNoiseSuppressionEnabled,
            },
            video: false,
          });
          audioStream.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });
          localStreamRef.current = audioStream;
          setLocalStream(audioStream);
          setIsCameraOn(false);
          setIsVideoCall(false);
          return audioStream;
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
    const pc = pcRef.current;
    if (!pc || iceRestartingRef.current) return;
    iceRestartingRef.current = true;

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
    } catch (err) {
      console.warn('[CallNAT] ICE restart offer error:', err);
    } finally {
      setTimeout(() => {
        iceRestartingRef.current = false;
      }, 4000);
    }
  }, [peerUserId, incomingCall?.callerId, user?.id, activeConversationId, sendSignalToRoom, sendSignalToUser, toast]);

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

  // Helper to apply incoming answer SDP
  const applyAnswerSdp = React.useCallback(
    async (sdp: RTCSessionDescriptionInit) => {
      const pc = pcRef.current;
      if (!pc || !sdp) return;

      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }
      if (ringingTimerRef.current) {
        clearTimeout(ringingTimerRef.current);
        ringingTimerRef.current = null;
      }

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

  // 1. GLOBAL SIGNALING LISTENER: Subscribes on mount for the authenticated user
  React.useEffect(() => {
    if (!user || !supabase) return;

    const personalChannelName = `user-signals-${user.id}`;
    const myChannel = supabase.channel(personalChannelName);

    myChannel
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        if (!payload || payload.callerId === user.id) return;
        if (payload.callerZeroTierIp) {
          peerZeroTierIpRef.current = payload.callerZeroTierIp;
          setPeerZeroTierIpState(payload.callerZeroTierIp);
          setPeerZeroTierIp(payload.callerZeroTierIp);
        }
        setIncomingCall(payload as IncomingCallData);
        setCallStatus('incoming_ringing');

        if (ringtoneRef.current) {
          ringtoneRef.current.stop();
        }
        const player = new RingtonePlayer();
        player.start();
        ringtoneRef.current = player;
      })
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
      .on('broadcast', { event: 'peer_media_toggle' }, ({ payload }) => {
        handlePeerMediaToggle(payload);
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
        toast({ title: 'Call Declined', description: 'Squadmate was unable to answer.', type: 'info' });
        stopMediaTracks();
        setCallStatus('idle');
        setIncomingCall(null);
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
            conversationId: activeConversationId,
          };
          sendSignalToRoom('ice_restart_answer', ansPayload);
          if (payload.senderId) {
            sendSignalToUser(payload.senderId, 'ice_restart_answer', ansPayload);
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
      .on('broadcast', { event: 'request_incoming_call_beacon' }, ({ payload }) => {
        if (callStatusRef.current === 'outgoing_ringing' && activeCallPayloadRef.current) {
          console.log('[CallSignaling] Re-dispatching active call offer beacon on demand:', payload);
          if (activeCallPayloadRef.current.targetUserId) {
            sendSignalToUser(activeCallPayloadRef.current.targetUserId, 'incoming_call', activeCallPayloadRef.current);
          }
        }
      })
      .on('broadcast', { event: 'call_ended' }, () => {
        stopMediaTracks();
        setCallStatus('idle');
        setIncomingCall(null);
        toast({ title: 'Call Ended', description: 'Squadmate disconnected from voice room.', type: 'info' });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // If newly connecting / opening the app, query recent ringing calls for late joiners
          const checkActiveRingingCalls = async () => {
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
                  sendSignalToUser(call.caller_id, 'request_incoming_call_beacon', {
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
      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
      }
      myChannel.unsubscribe();
      supabase.removeChannel(myChannel);
    };
  }, [user, supabase, stopMediaTracks, toast, applyAnswerSdp, applyRemoteCandidate, handlePeerMediaToggle, activeConversationId, drainPendingRemoteCandidates, sendSignalToRoom, sendSignalToUser]);

  // 2. START OUTGOING CALL
  const startCall = async (targetUserId: string, conversationId: string, video = false) => {
    if (!user || !supabase) {
      toast({ title: 'Error', description: 'You must be signed in to call', type: 'error' });
      return;
    }

    let recipientId = targetUserId;
    if (!recipientId || recipientId === conversationId) {
      const { data: members } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', user.id);
      if (members && members.length > 0) {
        recipientId = members[0].user_id;
      }
    }

    if (!recipientId || recipientId === conversationId) {
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
    setPeerUserId(recipientId);
    setIsVideoCall(video);
    setIsCameraOn(video);
    setIsMicMuted(false);
    setCallStatus('outgoing_ringing');

    // Acquire microphone & optional camera
    const stream = await getMedia(video);

    // Setup WebRTC Peer Connection with TURN relay support and candidate pre-fetching
    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    pcRef.current = pc;
    localIceCandidatesRef.current = [];
    pendingRemoteCandidatesRef.current = [];
    seenCandidatesRef.current.clear();

    if (stream) {
      stream.getTracks().forEach((track) => {
        track.enabled = true;
        pc.addTrack(track, stream);
      });
    }

    // Pre-negotiate both audio AND video transceivers so video/screen can be swapped without renegotiation
    const hasAudio = pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'audio');
    const hasVideo = pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'video');
    if (!hasAudio) pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (!hasVideo) pc.addTransceiver('video', { direction: 'sendrecv' });

    pc.ontrack = (event) => {
      console.log('[CallSignaling] Received remote media track on caller:', event.track.kind);
      attachRemoteTrack(event.track);
      setCallStatus('in_call');

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
            isCameraOn: remote?.isCameraOn ?? (event.track.kind === 'video' ? true : video),
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
      } else if (pc.iceConnectionState === 'failed') {
        console.warn('[CallNAT] Caller ICE connection failed, restarting ICE...');
        restartIceConnection();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (iceWatchdogTimerRef.current) {
          clearTimeout(iceWatchdogTimerRef.current);
          iceWatchdogTimerRef.current = null;
        }
        setCallStatus('in_call');
      } else if (pc.connectionState === 'failed') {
        console.warn('[CallNAT] Caller connectionState failed, restarting ICE...');
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
        toast({ title: 'Call Declined', description: 'Squadmate was unable to answer.', type: 'info' });
        stopMediaTracks();
        setCallStatus('idle');
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

            // Persist call session to database for cross-app/late opener synchronization
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
                    activeCallSessionIdRef.current = sessData.id;
                  }
                }, () => {});
            } catch {}

            // Notify recipient directly via persistent user mailbox
            sendSignalToUser(recipientId, 'incoming_call', callPayload);

            // Also broadcast on the shared room channel
            roomChannel.send({
              type: 'broadcast',
              event: 'incoming_call',
              payload: callPayload,
            }).catch(() => {});

            // Pulse beacon every 2 seconds during outgoing_ringing so any newly opened client catches it
            if (ringingBeaconRef.current) clearInterval(ringingBeaconRef.current);
            ringingBeaconRef.current = setInterval(() => {
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
              } else {
                if (ringingBeaconRef.current) {
                  clearInterval(ringingBeaconRef.current);
                  ringingBeaconRef.current = null;
                }
              }
            }, 2000);
          } catch (e) {
            console.warn('[CallSignaling] Error creating offer:', e);
          }
        }
      });

    setParticipants([
      {
        id: user.id,
        name: profile?.display_name || 'You',
        isSpeaking: false,
        isMuted: false,
        isCameraOn: video,
        isScreenSharing: false,
      },
    ]);

    const player = new RingtonePlayer();
    player.start();
    ringtoneRef.current = player;

    // Ringing timeout (35s)
    ringingTimerRef.current = setTimeout(() => {
      if (callStatus === 'outgoing_ringing') {
        toast({ title: 'No Answer', description: 'Squadmate did not pick up.', type: 'info' });
        endCall();
      }
    }, 35000);
  };

  // 3. ACCEPT INCOMING CALL
  const acceptCall = async () => {
    if (!incomingCall || !user || !supabase) return;

    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }
    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }

    const { callerId, callerName, conversationId, isVideo, sdp } = incomingCall;

    // Pre-unlock the audio element under the user click gesture
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = false;
      remoteAudioElementRef.current.play().catch(() => {});
    }

    setActiveConversationId(conversationId);
    setPeerUserId(callerId);
    setPeerName(callerName);
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicMuted(false);
    setCallStatus('in_call');

    // Acquire microphone & optional camera
    const stream = await getMedia(isVideo);

    // Setup WebRTC Peer Connection with TURN relay and candidate pre-fetching
    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    pcRef.current = pc;
    localIceCandidatesRef.current = [];
    pendingRemoteCandidatesRef.current = [];
    seenCandidatesRef.current.clear();

    if (stream) {
      stream.getTracks().forEach((track) => {
        track.enabled = true;
        pc.addTrack(track, stream);
      });
    }

    // Pre-negotiate both audio AND video transceivers
    const hasAudio = pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'audio');
    const hasVideo = pc.getTransceivers().some((t) => t.receiver?.track?.kind === 'video');
    if (!hasAudio) pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (!hasVideo) pc.addTransceiver('video', { direction: 'sendrecv' });

    pc.ontrack = (event) => {
      console.log('[CallSignaling] Received remote media track on callee:', event.track.kind);
      attachRemoteTrack(event.track);
      setCallStatus('in_call');
      if (event.track.kind === 'video') {
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
      } else if (pc.iceConnectionState === 'failed') {
        console.warn('[CallNAT] Callee ICE connection failed, restarting ICE...');
        restartIceConnection();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (iceWatchdogTimerRef.current) {
          clearTimeout(iceWatchdogTimerRef.current);
          iceWatchdogTimerRef.current = null;
        }
        setCallStatus('in_call');
      } else if (pc.connectionState === 'failed') {
        console.warn('[CallNAT] Callee connectionState failed, restarting ICE...');
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
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await drainPendingRemoteCandidates();

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
        isMuted: false,
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
    if (incomingCall) {
      sendSignalToUser(incomingCall.callerId, 'call_rejected', {});
      sendSignalToRoom('call_rejected', {});
      try {
        supabase
          .from('call_sessions')
          .update({ status: 'rejected', ended_at: new Date().toISOString() })
          .eq('conversation_id', incomingCall.conversationId)
          .eq('status', 'ringing')
          .then(() => {}, () => {});
      } catch {}
    }

    stopMediaTracks();
    setIncomingCall(null);
    setCallStatus('idle');
  };

  // 5. END ACTIVE CALL
  const endCall = () => {
    const target = peerUserId || incomingCall?.callerId;
    if (target) {
      sendSignalToUser(target, 'call_ended', {});
    }
    sendSignalToRoom('call_ended', {});

    if (activeConversationId) {
      try {
        supabase
          .from('call_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('conversation_id', activeConversationId)
          .in('status', ['ringing', 'active'])
          .then(() => {}, () => {});
      } catch {}
    }

    stopMediaTracks();
    setCallStatus('ended');

    setTimeout(() => {
      setCallStatus('idle');
      setActiveConversationId(null);
      setPeerUserId(null);
      setIncomingCall(null);
      setIsScreenSharing(false);
      setParticipants([]);
    }, 400);

    toast({ title: 'Call Ended', description: 'Disconnected from voice room.', type: 'info' });
  };

  // 6. TOGGLE CONTROLS
  const toggleMic = () => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);

    // If unmuting while deafened, automatically undeafen
    if (!nextMuted && isDeafened) {
      setIsDeafened(false);
      if (remoteAudioElementRef.current) {
        remoteAudioElementRef.current.muted = false;
      }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    setParticipants((prev) =>
      prev.map((p) => (p.id === user?.id ? { ...p, isMuted: nextMuted } : p))
    );

    sendSignalToRoom('peer_media_toggle', { userId: user?.id, isMuted: nextMuted });
    if (peerUserId) {
      sendSignalToUser(peerUserId, 'peer_media_toggle', { userId: user?.id, isMuted: nextMuted });
    }

    toast({
      title: nextMuted ? 'Microphone Muted' : 'Microphone Active',
      description: nextMuted ? 'You are muted' : 'Microphone unmuted',
      type: nextMuted ? 'error' : 'success',
      duration: 1500,
    });
  };

  const toggleDeafen = () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);

    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.muted = nextDeafened;
    }

    if (nextDeafened) {
      // Deafening automatically mutes microphone
      setIsMicMuted(true);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      setParticipants((prev) =>
        prev.map((p) => (p.id === user?.id ? { ...p, isMuted: true } : p))
      );
      sendSignalToRoom('peer_media_toggle', { userId: user?.id, isMuted: true });
      if (peerUserId) {
        sendSignalToUser(peerUserId, 'peer_media_toggle', { userId: user?.id, isMuted: true });
      }
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
          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
          } else {
            pc.addTrack(videoTrack, localStreamRef.current || new MediaStream([videoTrack]));
          }
          const videoTransceiver = pc.getTransceivers().find(
            (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
          );
          if (videoTransceiver && videoTransceiver.direction !== 'sendrecv') {
            videoTransceiver.direction = 'sendrecv';
          }

          // Trigger WebRTC SDP renegotiation so remote peer decodes incoming camera RTP stream
          restartIceConnection().catch(() => {});
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

  const callContextValue = React.useMemo(
    () => ({
      callStatus,
      activeConversationId,
      isVideoCall,
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
    }),
    [
      callStatus,
      activeConversationId,
      isVideoCall,
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
    ]
  );

  return (
    <CallContext.Provider value={callContextValue}>
      {children}
      <audio
        ref={remoteAudioElementRef}
        autoPlay
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
