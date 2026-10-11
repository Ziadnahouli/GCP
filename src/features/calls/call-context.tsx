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

// Procedural Web Audio Ringtone Generator (no assets needed)
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
        if (!this.ctx) return;
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

  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const ringtoneRef = React.useRef<RingtonePlayer | null>(null);
  const pendingCandidatesRef = React.useRef<RTCIceCandidateInit[]>([]);

  // Mutex and sequential send queues for realtime channels
  const channelPromisesRef = React.useRef<Map<string, Promise<RealtimeChannel>>>(new Map());
  const sendQueueRef = React.useRef<Map<string, Promise<unknown>>>(new Map());

  const [participants, setParticipants] = React.useState<CallParticipant[]>([]);

  const [stats] = React.useState<DiagnosticsStats>({
    connectionState: 'connected',
    rttMs: 24,
    jitterMs: 1.2,
    packetLossPercent: 0.0,
    incomingBitrateKbps: 512,
    outgoingBitrateKbps: 256,
    transportPath: 'direct_p2p',
    isZeroTierActive: true,
  });

  const stopMediaTracks = React.useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
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
    pendingCandidatesRef.current = [];
  }, []);

  const getMedia = async (video: boolean): Promise<MediaStream | null> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      }
    } catch (err) {
      console.warn('Microphone/Camera access not granted:', err);
    }
    return null;
  };

  // Helper to ensure a channel is subscribed once without duplicate callback overwrites
  const getOrSubscribeChannel = React.useCallback(
    async (channelName: string): Promise<RealtimeChannel> => {
      let channel = supabase
        .getChannels()
        .find((c) => c.topic === `realtime:${channelName}` || c.topic === channelName);

      if (channel && channel.state === 'joined') {
        return channel;
      }

      if (channelPromisesRef.current.has(channelName)) {
        return channelPromisesRef.current.get(channelName)!;
      }

      if (!channel) {
        channel = supabase.channel(channelName);
      }

      const chanInstance = channel;
      const promise = new Promise<RealtimeChannel>((resolve) => {
        const timer = setTimeout(() => {
          channelPromisesRef.current.delete(channelName);
          resolve(chanInstance);
        }, 2500);

        chanInstance.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timer);
            channelPromisesRef.current.delete(channelName);
            resolve(chanInstance);
          }
        });
      });

      channelPromisesRef.current.set(channelName, promise);
      return promise;
    },
    [supabase]
  );

  // Helper to send signal sequentially through channel send queue
  const sendSignal = React.useCallback(
    async (targetUserId: string, event: string, payload: unknown) => {
      if (!supabase) return;
      const channelName = `user-signals-${targetUserId}`;

      const prev = sendQueueRef.current.get(channelName) || Promise.resolve();
      const current = prev
        .then(async () => {
          const channel = await getOrSubscribeChannel(channelName);
          const res = await channel.send({
            type: 'broadcast',
            event,
            payload,
          });
          console.log(`[CallSignaling] Sent [${event}] to ${channelName}:`, res);
          return res;
        })
        .catch((err) => {
          console.error(`[CallSignaling] Error sending [${event}] to ${channelName}:`, err);
        });

      sendQueueRef.current.set(channelName, current);
      return current;
    },
    [supabase, getOrSubscribeChannel]
  );

  // Helper to send redundant signal through room channel
  const sendRoomSignal = React.useCallback(
    async (conversationId: string, event: string, payload: unknown) => {
      if (!supabase || !conversationId) return;
      const channelName = `call-signaling-${conversationId}`;

      const prev = sendQueueRef.current.get(channelName) || Promise.resolve();
      const current = prev
        .then(async () => {
          const channel = await getOrSubscribeChannel(channelName);
          return await channel.send({
            type: 'broadcast',
            event,
            payload,
          });
        })
        .catch(() => {});

      sendQueueRef.current.set(channelName, current);
      return current;
    },
    [supabase, getOrSubscribeChannel]
  );

  // 1. GLOBAL SIGNALING LISTENER: Subscribes on mount for the authenticated user
  React.useEffect(() => {
    if (!user || !supabase) return;

    const personalChannelName = `user-signals-${user.id}`;
    console.log(`[CallSignaling] Registering global listener on: ${personalChannelName}`);

    const existing = supabase
      .getChannels()
      .find((c) => c.topic === `realtime:${personalChannelName}` || c.topic === personalChannelName);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const myChannel = supabase.channel(personalChannelName);

    myChannel
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        console.log('[CallSignaling] Incoming call payload received:', payload);
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
        console.log('[CallSignaling] Received call_answer payload:', payload);
        if (ringtoneRef.current) {
          ringtoneRef.current.stop();
          ringtoneRef.current = null;
        }

        if (payload?.sdp && pcRef.current) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            setCallStatus('in_call');

            while (pendingCandidatesRef.current.length > 0) {
              const cand = pendingCandidatesRef.current.shift();
              if (cand) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
            }

            toast({
              title: 'Call Connected',
              description: 'Connected via direct P2P WebRTC audio stream.',
              type: 'success',
            });
          } catch (e) {
            console.warn('[CallSignaling] Error setting remote description:', e);
          }
        }
      })
      .on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
        if (!payload?.candidate || !pcRef.current) return;
        try {
          if (pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            pendingCandidatesRef.current.push(payload.candidate);
          }
        } catch (e) {
          console.warn('[CallSignaling] Error applying ice candidate:', e);
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
      .subscribe((status) => {
        console.log(`[CallSignaling] Global channel status: ${status}`);
      });

    return () => {
      supabase.removeChannel(myChannel);
    };
  }, [user, supabase, stopMediaTracks, toast]);

  // 2. START OUTGOING CALL
  const startCall = async (targetUserId: string, conversationId: string, video = false) => {
    if (!user || !supabase) {
      toast({ title: 'Error', description: 'You must be signed in to call', type: 'error' });
      return;
    }

    // Auto-resolve recipient ID if mistakenly passed as conversationId or missing
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

    console.log(`[CallSignaling] Starting call to recipient: ${recipientId} in conv: ${conversationId}`);

    stopMediaTracks();
    setActiveConversationId(conversationId);
    setPeerUserId(recipientId);
    setIsVideoCall(video);
    setIsCameraOn(video);
    setIsMicMuted(false);
    setCallStatus('outgoing_ringing');

    // Acquire microphone & camera
    const stream = await getMedia(video);

    // Setup WebRTC connection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pendingCandidatesRef.current = [];

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        console.log('[CallSignaling] Received remote media stream on caller!');
        setRemoteStream(event.streams[0]);
        setCallStatus('in_call');
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
            isSpeaking: true,
            isMuted: false,
            isCameraOn: video,
            isScreenSharing: false,
          },
        ]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallSignaling] Caller ICE State:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('in_call');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[CallSignaling] Caller Peer Connection State:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('in_call');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(recipientId, 'ice_candidate', { candidate: event.candidate });
        if (conversationId) {
          sendRoomSignal(conversationId, 'ice_candidate', { candidate: event.candidate });
        }
      }
    };

    // Create SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Broadcast offer to target user's personal channel & room channel
    const callPayload = {
      callerId: user.id,
      callerName: profile?.display_name || profile?.username || 'Squad Member',
      callerAvatar: profile?.avatar_url || null,
      targetUserId: recipientId,
      conversationId,
      isVideo: video,
      sdp: offer,
    };

    await Promise.all([
      sendSignal(recipientId, 'incoming_call', callPayload),
      sendRoomSignal(conversationId, 'incoming_call', callPayload),
    ]);

    // Also listen to room channel for answer fallback
    const roomChannel = await getOrSubscribeChannel(`call-signaling-${conversationId}`);
    roomChannel.on('broadcast', { event: 'call_answer' }, async ({ payload }) => {
      if (payload?.sdp && pcRef.current && callStatus !== 'in_call') {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          setCallStatus('in_call');
          if (ringtoneRef.current) {
            ringtoneRef.current.stop();
            ringtoneRef.current = null;
          }
        } catch {}
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

    // Start outgoing ringtone
    const player = new RingtonePlayer();
    player.start();
    ringtoneRef.current = player;
  };

  // 3. ACCEPT INCOMING CALL
  const acceptCall = async () => {
    if (!incomingCall || !user || !supabase) return;

    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }

    const { callerId, callerName, conversationId, isVideo, sdp } = incomingCall;
    setActiveConversationId(conversationId);
    setPeerUserId(callerId);
    setPeerName(callerName);
    setIsVideoCall(isVideo);
    setIsCameraOn(isVideo);
    setIsMicMuted(false);
    setCallStatus('in_call');

    // Acquire microphone & camera
    const stream = await getMedia(isVideo);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pendingCandidatesRef.current = [];

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        console.log('[CallSignaling] Received remote stream on callee!');
        setRemoteStream(event.streams[0]);
        setCallStatus('in_call');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallSignaling] Callee ICE State:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('in_call');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[CallSignaling] Callee Peer Connection State:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('in_call');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(callerId, 'ice_candidate', { candidate: event.candidate });
        if (conversationId) {
          sendRoomSignal(conversationId, 'ice_candidate', { candidate: event.candidate });
        }
      }
    };

    // Set remote description from caller offer
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    // Drain queued ICE candidates
    while (pendingCandidatesRef.current.length > 0) {
      const cand = pendingCandidatesRef.current.shift();
      if (cand) {
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
    }

    // Create SDP answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer back to caller via both personal channel & room channel
    await Promise.all([
      sendSignal(callerId, 'call_answer', { sdp: answer, conversationId }),
      sendRoomSignal(conversationId, 'call_answer', { sdp: answer, conversationId }),
    ]);

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
        isSpeaking: true,
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
      sendSignal(incomingCall.callerId, 'call_rejected', {});
      if (incomingCall.conversationId) {
        sendRoomSignal(incomingCall.conversationId, 'call_rejected', {});
      }
    }

    stopMediaTracks();
    setIncomingCall(null);
    setCallStatus('idle');
  };

  // 5. END ACTIVE CALL
  const endCall = () => {
    const target = peerUserId || incomingCall?.callerId;
    if (target) {
      sendSignal(target, 'call_ended', {});
    }
    if (activeConversationId) {
      sendRoomSignal(activeConversationId, 'call_ended', {});
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

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    setParticipants((prev) =>
      prev.map((p) => (p.id === (user?.id || 'me') ? { ...p, isMuted: nextMuted } : p))
    );
  };

  const toggleCamera = () => {
    const nextCamera = !isCameraOn;
    setIsCameraOn(nextCamera);

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextCamera;
      });
    }

    setParticipants((prev) =>
      prev.map((p) => (p.id === (user?.id || 'me') ? { ...p, isCameraOn: nextCamera } : p))
    );
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          if (pcRef.current) {
            const videoSender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
            const screenTrack = screenStream.getVideoTracks()[0];
            if (videoSender && screenTrack) {
              videoSender.replaceTrack(screenTrack);
            }
          }
          setIsScreenSharing(true);
          toast({ title: 'Screen Broadcast', description: 'Sharing screen with squadmate.', type: 'info' });
          screenStream.getVideoTracks()[0].onended = () => setIsScreenSharing(false);
        }
      } catch {
        setIsScreenSharing(false);
      }
    } else {
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
