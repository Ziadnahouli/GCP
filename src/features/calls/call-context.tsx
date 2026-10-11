'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { useToast } from '@/components/ui/toast';
import { getBrowserClient } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DiagnosticsStats } from '@/components/calls/network-diagnostics';

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
}

interface CallContextType {
  callStatus: CallStatus;
  activeConversationId: string | null;
  isVideoCall: boolean;
  isMicMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  incomingCall: IncomingCallData | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  participants: CallParticipant[];
  stats: DiagnosticsStats;
  startCall: (targetUserId: string, conversationId: string, video?: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
}

const CallContext = React.createContext<CallContextType | null>(null);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
];

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

  // Media toggles
  const [isMicMuted, setIsMicMuted] = React.useState(false);
  const [isCameraOn, setIsCameraOn] = React.useState(false);
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);

  // Stable references
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const ringtoneRef = React.useRef<RingtonePlayer | null>(null);
  const ringingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const roomChannelRef = React.useRef<RealtimeChannel | null>(null);
  const outboundChannelsRef = React.useRef<Map<string, RealtimeChannel>>(new Map());
  const remoteAudioElementRef = React.useRef<HTMLAudioElement | null>(null);

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

  // Helper to reliably send a signal to a peer's personal channel
  const sendSignalToUser = React.useCallback(
    (targetUserId: string, event: string, payload: unknown) => {
      if (!supabase || !targetUserId) return;

      const existingChannel = outboundChannelsRef.current.get(targetUserId);
      if (existingChannel) {
        existingChannel
          .send({
            type: 'broadcast',
            event,
            payload,
          })
          .catch(() => {});
        return;
      }

      const ch = supabase.channel(`user-signals-${targetUserId}`);
      outboundChannelsRef.current.set(targetUserId, ch);

      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast',
            event,
            payload,
          }).catch(() => {});
        }
      });
    },
    [supabase]
  );

  // Helper to broadcast on the active room channel
  const sendSignalToRoom = React.useCallback((event: string, payload: unknown) => {
    if (roomChannelRef.current) {
      roomChannelRef.current
        .send({
          type: 'broadcast',
          event,
          payload,
        })
        .catch(() => {});
    }
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
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);

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
      audioEl.muted = false;
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
  }, [remoteStream]);

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

        const currentConnectionState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' =
          pc.connectionState === 'connected'
            ? 'connected'
            : pc.connectionState === 'connecting'
            ? 'connecting'
            : pc.connectionState === 'failed' || pc.connectionState === 'closed'
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

  // Acquire local camera and microphone stream with audio-only fallback
  const getMedia = async (video: boolean): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
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
      // If video access failed (e.g., no webcam attached), gracefully fallback to audio only
      if (video) {
        console.warn('Video stream acquisition failed, falling back to audio only:', videoErr);
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
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

  // Helper to add a remote ICE candidate cleanly with deduplication
  const applyRemoteCandidate = React.useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc || !candidate) return;

    const candStr = JSON.stringify(candidate);
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

          // Flush all gathered local ICE candidates so callee receives any candidates generated before answer
          localIceCandidatesRef.current.forEach((candidate) => {
            sendSignalToRoom('ice_candidate', { candidate, senderId: user?.id });
          });

          toast({
            title: 'Call Connected',
            description: 'Connected via direct P2P WebRTC audio stream.',
            type: 'success',
          });
        }
      } catch (e) {
        console.warn('[CallSignaling] Error applying answer SDP:', e);
      }
    },
    [drainPendingRemoteCandidates, sendSignalToRoom, toast, user?.id]
  );

  // 1. GLOBAL SIGNALING LISTENER: Subscribes on mount for the authenticated user
  React.useEffect(() => {
    if (!user || !supabase) return;

    const personalChannelName = `user-signals-${user.id}`;
    const myChannel = supabase.channel(personalChannelName);

    myChannel
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        if (!payload || payload.callerId === user.id) return;
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
        if (payload?.sdp) {
          await applyAnswerSdp(payload.sdp);
        }
      })
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (payload?.candidate && payload.senderId !== user.id) {
          await applyRemoteCandidate(payload.candidate);
        }
      })
      .on('broadcast', { event: 'call_rejected' }, () => {
        toast({ title: 'Call Declined', description: 'Squadmate was unable to answer.', type: 'info' });
        stopMediaTracks();
        setCallStatus('idle');
        setIncomingCall(null);
      })
      .on('broadcast', { event: 'call_ended' }, () => {
        stopMediaTracks();
        setCallStatus('idle');
        setIncomingCall(null);
        toast({ title: 'Call Ended', description: 'Squadmate disconnected from voice room.', type: 'info' });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(myChannel);
    };
  }, [user, supabase, stopMediaTracks, toast, applyAnswerSdp, applyRemoteCandidate]);

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

    // Acquire microphone & camera
    const stream = await getMedia(video);

    // Setup WebRTC Peer Connection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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

    // Explicitly guarantee an audio transceiver in the SDP
    if (pc.getTransceivers().length === 0) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (video) {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      }
    }

    pc.ontrack = (event) => {
      console.log('[CallSignaling] Received remote media stream on caller:', event.track.kind);
      let rStream = event.streams && event.streams[0];
      if (!rStream) {
        rStream = new MediaStream([event.track]);
      }
      setRemoteStream(rStream);
      setCallStatus('in_call');

      if (remoteAudioElementRef.current) {
        if (remoteAudioElementRef.current.srcObject !== rStream) {
          remoteAudioElementRef.current.srcObject = rStream;
        }
        remoteAudioElementRef.current.muted = false;
        remoteAudioElementRef.current.play().catch(() => {});
      }

      setParticipants([
        {
          id: user.id,
          name: profile?.display_name || 'You',
          isSpeaking: false,
          isMuted: false,
          isCameraOn: video,
          isScreenSharing: false,
        },
        {
          id: recipientId,
          name: peerName,
          isSpeaking: false,
          isMuted: false,
          isCameraOn: video,
          isScreenSharing: false,
        },
      ]);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('in_call');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatus('in_call');
      }
    };

    // Buffer and broadcast ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candJson = event.candidate.toJSON();
        localIceCandidatesRef.current.push(candJson);

        sendSignalToRoom('ice_candidate', { candidate: candJson, senderId: user.id });
        sendSignalToUser(recipientId, 'ice_candidate', { candidate: candJson, senderId: user.id });
      }
    };

    // Connect to shared room channel for in-call signaling
    const roomChannel = supabase.channel(`call-room-${conversationId}`);
    roomChannelRef.current = roomChannel;

    roomChannel
      .on('broadcast', { event: 'call_answer' }, async ({ payload }) => {
        if (payload?.sdp) {
          await applyAnswerSdp(payload.sdp);
        }
      })
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (payload?.candidate && payload.senderId !== user.id) {
          await applyRemoteCandidate(payload.candidate);
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
            };

            // Notify recipient directly via persistent user mailbox
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

    // Acquire microphone & camera
    const stream = await getMedia(isVideo);

    // Setup WebRTC Peer Connection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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

    if (pc.getTransceivers().length === 0) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (isVideo) {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      }
    }

    pc.ontrack = (event) => {
      console.log('[CallSignaling] Received remote media stream on callee:', event.track.kind);
      let rStream = event.streams && event.streams[0];
      if (!rStream) {
        rStream = new MediaStream([event.track]);
      }
      setRemoteStream(rStream);
      setCallStatus('in_call');

      if (remoteAudioElementRef.current) {
        if (remoteAudioElementRef.current.srcObject !== rStream) {
          remoteAudioElementRef.current.srcObject = rStream;
        }
        remoteAudioElementRef.current.muted = false;
        remoteAudioElementRef.current.play().catch(() => {});
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('in_call');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatus('in_call');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candJson = event.candidate.toJSON();
        localIceCandidatesRef.current.push(candJson);

        sendSignalToRoom('ice_candidate', { candidate: candJson, senderId: user.id });
        sendSignalToUser(callerId, 'ice_candidate', { candidate: candJson, senderId: user.id });
      }
    };

    // Connect to shared room channel
    const roomChannel = supabase.channel(`call-room-${conversationId}`);
    roomChannelRef.current = roomChannel;

    roomChannel
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (payload?.candidate && payload.senderId !== user.id) {
          await applyRemoteCandidate(payload.candidate);
        }
      })
      .on('broadcast', { event: 'call_ended' }, () => {
        stopMediaTracks();
        setCallStatus('idle');
        toast({ title: 'Call Ended', description: 'Squadmate disconnected from voice room.', type: 'info' });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await drainPendingRemoteCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const answerPayload = {
              sdp: answer,
              conversationId,
              calleeId: user.id,
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
              sendSignalToRoom('ice_candidate', { candidate, senderId: user.id });
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
    toast({ title: 'Call Connected', description: `Speaking with ${callerName}.`, type: 'success' });
  };

  // 4. REJECT INCOMING CALL
  const rejectCall = () => {
    if (incomingCall) {
      sendSignalToUser(incomingCall.callerId, 'call_rejected', {});
      sendSignalToRoom('call_rejected', {});
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

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    setParticipants((prev) =>
      prev.map((p) => (p.id === user?.id ? { ...p, isMuted: nextMuted } : p))
    );
  };

  const toggleCamera = async () => {
    const nextCamera = !isCameraOn;
    setIsCameraOn(nextCamera);

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextCamera;
      });
    }

    setParticipants((prev) =>
      prev.map((p) => (p.id === user?.id ? { ...p, isCameraOn: nextCamera } : p))
    );
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      setIsScreenSharing(false);
      setParticipants((prev) =>
        prev.map((p) => (p.id === user?.id ? { ...p, isScreenSharing: false } : p))
      );
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        setIsScreenSharing(true);
        setParticipants((prev) =>
          prev.map((p) => (p.id === user?.id ? { ...p, isScreenSharing: true } : p))
        );

        displayStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setParticipants((prev) =>
            prev.map((p) => (p.id === user?.id ? { ...p, isScreenSharing: false } : p))
          );
        };
      }
    } catch {
      setIsScreenSharing(false);
    }
  };

  return (
    <CallContext.Provider
      value={{
        callStatus,
        activeConversationId,
        isVideoCall,
        isMicMuted,
        isCameraOn,
        isScreenSharing,
        incomingCall,
        localStream,
        remoteStream,
        participants,
        stats,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
      }}
    >
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
