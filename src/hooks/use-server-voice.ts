'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { SoundboardClip, soundboardEngine } from '@/lib/soundboard/audio-engine';
import { DEFAULT_RTC_CONFIG } from '@/lib/webrtc/ice-config';

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

  // Synchronous refs for event handlers to avoid stale closures
  const userRef = React.useRef(user);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  const profileRef = React.useRef(profile);
  React.useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

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
  const heartbeatIntervalRef = React.useRef<any>(null);

  // Mesh WebRTC maps
  const peersMapRef = React.useRef<Map<string, VoiceParticipant>>(new Map());
  const peerConnectionsRef = React.useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = React.useRef<Map<string, HTMLAudioElement>>(new Map());

  // Helper to construct current user voice participant state
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

  // Broadcast state to Supabase Realtime presence and broadcast channels
  const broadcastMyVoiceState = React.useCallback(
    (customState?: Partial<VoiceParticipant>) => {
      if (!realtimeChannelRef.current || !userRef.current) return;
      const state: VoiceParticipant = {
        ...getMyVoiceState(),
        ...customState,
      };

      try {
        realtimeChannelRef.current.track(state);
      } catch {}

      try {
        realtimeChannelRef.current.send({
          type: 'broadcast',
          event: 'voice_state_update',
          payload: state,
        });
      } catch {}
    },
    [getMyVoiceState]
  );

  // WebRTC Mesh Peer Connection Manager
  const getOrCreatePeerConnection = React.useCallback(
    (remoteUserId: string, isInitiator: boolean): RTCPeerConnection | undefined => {
      const u = userRef.current;
      const channel = realtimeChannelRef.current;
      if (!u || !remoteUserId || remoteUserId === u.id) return undefined;

      let pc = peerConnectionsRef.current.get(remoteUserId);
      if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
        return pc;
      }

      try {
        pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      } catch (err) {
        console.warn('[useServerVoice] Failed to create RTCPeerConnection:', err);
        return undefined;
      }
      peerConnectionsRef.current.set(remoteUserId, pc);

      // Add local audio track if microphone stream is active
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          try {
            pc!.addTrack(track, localStreamRef.current!);
          } catch {}
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && realtimeChannelRef.current) {
          try {
            realtimeChannelRef.current.send({
              type: 'broadcast',
              event: 'voice_rtc_signal',
              payload: {
                from: u.id,
                to: remoteUserId,
                type: 'ice-candidate',
                candidate: event.candidate.toJSON(),
              },
            });
          } catch {}
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          let audioEl = audioElementsRef.current.get(remoteUserId);
          if (!audioEl) {
            audioEl = new Audio();
            audioEl.autoplay = true;
            audioElementsRef.current.set(remoteUserId, audioEl);
          }
          audioEl.srcObject = remoteStream;
          audioEl.muted = isDeafenedRef.current;
          audioEl.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
          peerConnectionsRef.current.delete(remoteUserId);
        }
      };

      if (isInitiator) {
        pc.createOffer({ offerToReceiveAudio: true })
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
            console.warn('[useServerVoice] Error creating WebRTC offer:', err);
          });
      }

      return pc;
    },
    []
  );

  // Incoming WebRTC Signal Handler
  const handleRtcSignal = React.useCallback(
    async (payload: any) => {
      const u = userRef.current;
      if (!u || !payload || payload.to !== u.id || !payload.from) return;
      const fromPeerId = payload.from;

      try {
        if (payload.type === 'offer' && payload.sdp) {
          let pc = peerConnectionsRef.current.get(fromPeerId);
          if (!pc || pc.connectionState === 'closed') {
            pc = getOrCreatePeerConnection(fromPeerId, false);
          }
          if (!pc) return;

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

          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
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
          }
        } else if (payload.type === 'ice-candidate' && payload.candidate) {
          const pc = peerConnectionsRef.current.get(fromPeerId);
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch {}
          }
        }
      } catch (signalErr) {
        console.warn('[useServerVoice] Error handling RTC signal:', signalErr);
      }
    },
    [getOrCreatePeerConnection]
  );

  // Sync speaking status to peers
  const prevSpeakingRef = React.useRef(false);
  React.useEffect(() => {
    if (isVoiceConnected && prevSpeakingRef.current !== isSpeaking) {
      prevSpeakingRef.current = isSpeaking;
      broadcastMyVoiceState({ is_speaking: isSpeaking, audio_level: audioLevel });
      if (realtimeChannelRef.current && user) {
        try {
          realtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'voice_speaking',
            payload: { user_id: user.id, is_speaking: isSpeaking, audio_level: audioLevel },
          });
        } catch {}
      }
    }
  }, [isSpeaking, isVoiceConnected, broadcastMyVoiceState, audioLevel, user]);

  // Clean up all WebRTC peer connections and audio players
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
      } catch {}
    });
    audioElementsRef.current.clear();

    peersMapRef.current.clear();
    setRemoteParticipants([]);
  }, []);

  // Stop local audio & video streams cleanly (using refs so dependencies are stable)
  const stopAllMediaStreams = React.useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

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

  // Connect user to voice lounge
  const connectVoice = React.useCallback(async () => {
    if (isVoiceConnected || isConnecting) return;
    setIsConnecting(true);

    try {
      const supabase = getBrowserClient();
      const currentUser = userRef.current;
      if (!supabase || !currentUser) {
        setIsVoiceConnected(true);
        setIsConnecting(false);
        return;
      }

      // 1. Setup Supabase Realtime Channel IMMEDIATELY so we connect without waiting for mic
      const cleanChanId = (channelId || '').toLowerCase().trim();
      const topic = `voice_room_${cleanChanId}`;

      // Clean up previous channel instance if active
      if (realtimeChannelRef.current) {
        try {
          realtimeChannelRef.current.untrack();
          supabase.removeChannel(realtimeChannelRef.current);
        } catch {}
        realtimeChannelRef.current = null;
      }

      const roomChannel = supabase.channel(topic, {
        config: {
          broadcast: { self: false },
          presence: { key: currentUser.id },
        },
      });

      // Synchronously assign to ref so message handlers have instant access
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

              if (u.id < peerId) {
                getOrCreatePeerConnection(peerId, true);
              }
            }
          }
        });

        // Retain any peers discovered via broadcast ping
        peersMapRef.current.forEach((peer, peerId) => {
          if (!nextMap.has(peerId) && peerId !== u.id) {
            nextMap.set(peerId, peer);
          }
        });

        peersMapRef.current = nextMap;
        setRemoteParticipants(Array.from(nextMap.values()));
      };

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
              peersMapRef.current.set(peerId, {
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
              });
              setRemoteParticipants(Array.from(peersMapRef.current.values()));

              if (u.id < peerId) {
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
          setRemoteParticipants(Array.from(peersMapRef.current.values()));
        })
        .on('broadcast', { event: 'voice_announce' }, ({ payload }: { payload: VoiceParticipant }) => {
          const u = userRef.current;
          if (!u || !payload || !payload.user_id || payload.user_id === u.id) return;
          peersMapRef.current.set(payload.user_id, payload);
          setRemoteParticipants(Array.from(peersMapRef.current.values()));

          // Respond immediately with ack so User 2 sees us instantly
          try {
            roomChannel.send({
              type: 'broadcast',
              event: 'voice_announce_ack',
              payload: getMyVoiceState(),
            });
          } catch {}

          if (u.id < payload.user_id) {
            getOrCreatePeerConnection(payload.user_id, true);
          }
        })
        .on('broadcast', { event: 'voice_announce_ack' }, ({ payload }: { payload: VoiceParticipant }) => {
          const u = userRef.current;
          if (!u || !payload || !payload.user_id || payload.user_id === u.id) return;
          peersMapRef.current.set(payload.user_id, payload);
          setRemoteParticipants(Array.from(peersMapRef.current.values()));

          if (u.id < payload.user_id) {
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
            setRemoteParticipants(Array.from(peersMapRef.current.values()));
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
          setRemoteParticipants(Array.from(peersMapRef.current.values()));
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
            } catch {}
            audioElementsRef.current.delete(payload.userId);
          }
          setRemoteParticipants(Array.from(peersMapRef.current.values()));
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
            console.warn('[useServerVoice] Presence track warning:', trackErr);
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

      // Heartbeat discovery every 5 seconds to keep peer table fresh
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      heartbeatIntervalRef.current = setInterval(() => {
        if (realtimeChannelRef.current) {
          try {
            realtimeChannelRef.current.send({
              type: 'broadcast',
              event: 'voice_announce',
              payload: getMyVoiceState(),
            });
          } catch {}
        }
      }, 5000);

      setIsVoiceConnected(true);

      // 2. Microphone Capture (Parallel & Non-Blocking)
      // Capturing mic failure will NEVER block the room connection
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: isNoiseSuppressionEnabled,
              autoGainControl: true,
            },
            video: false,
          });
          setLocalStream(stream);
          localStreamRef.current = stream;
          setIsMicMuted(false);
          isMicMutedRef.current = false;

          // Attach audio track to any existing peer connections
          peerConnectionsRef.current.forEach((pc) => {
            const senders = pc.getSenders();
            stream.getAudioTracks().forEach((track) => {
              if (!senders.some((s) => s.track === track)) {
                try {
                  pc.addTrack(track, stream);
                } catch {}
              }
            });
          });

          // Setup AudioContext for RMS speech analysis
          try {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

            if (AudioCtx) {
              const audioCtx = new AudioCtx();
              audioContextRef.current = audioCtx;
              // Resume in background (non-blocking) to avoid Chromium autoplay policy stall
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

              analyserRef.current = analyser;
              const timeData = new Uint8Array(analyser.fftSize);

              const checkSpeaking = () => {
                if (!analyserRef.current) return;
                if (audioCtx.state === 'suspended') {
                  audioCtx.resume().catch(() => {});
                }

                if (isMicMutedRef.current) {
                  setAudioLevel(0);
                  audioLevelRef.current = 0;
                  setIsSpeaking(false);
                  isSpeakingRef.current = false;
                  animFrameRef.current = requestAnimationFrame(checkSpeaking);
                  return;
                }

                analyserRef.current.getByteTimeDomainData(timeData);

                let sumSquares = 0;
                for (let i = 0; i < timeData.length; i++) {
                  const sample = (timeData[i] - 128) / 128;
                  sumSquares += sample * sample;
                }
                const rms = Math.sqrt(sumSquares / timeData.length);
                const normalized = Math.min(100, Math.round(rms * 350));
                setAudioLevel(normalized);
                audioLevelRef.current = normalized;

                const speaking = normalized > 5;
                setIsSpeaking(speaking);
                isSpeakingRef.current = speaking;

                animFrameRef.current = requestAnimationFrame(checkSpeaking);
              };

              checkSpeaking();
            }
          } catch (audioErr) {
            console.warn('[useServerVoice] AudioContext setup warning:', audioErr);
          }
        }
      } catch (micErr) {
        console.warn('[useServerVoice] Microphone unavailable or denied, in listen mode:', micErr);
        setIsMicMuted(true);
        isMicMutedRef.current = true;
      }
    } catch (err) {
      console.error('[useServerVoice] Error connecting to voice room:', err);
      setIsVoiceConnected(true);
    } finally {
      setIsConnecting(false);
    }
  }, [channelId, isVoiceConnected, isConnecting, isNoiseSuppressionEnabled, getMyVoiceState, getOrCreatePeerConnection, handleRtcSignal]);

  // Disconnect from voice lounge cleanly
  const disconnectVoice = React.useCallback(() => {
    stopAllMediaStreams();

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (realtimeChannelRef.current) {
      try {
        if (userRef.current) {
          realtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'voice_user_left',
            payload: { userId: userRef.current.id },
          });
        }
        realtimeChannelRef.current.untrack();
        const supabase = getBrowserClient();
        if (supabase) {
          supabase.removeChannel(realtimeChannelRef.current);
        }
      } catch {}
      realtimeChannelRef.current = null;
    }

    cleanUpAllPeers();
    setIsVoiceConnected(false);
    setIsConnecting(false);
  }, [stopAllMediaStreams, cleanUpAllPeers]);

  // Toggle microphone
  const toggleMic = React.useCallback(() => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);
    isMicMutedRef.current = nextMuted;

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (nextMuted) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setAudioLevel(0);
      audioLevelRef.current = 0;
    }

    broadcastMyVoiceState({ is_muted: nextMuted, is_speaking: false });
  }, [isMicMuted, broadcastMyVoiceState]);

  // Toggle deafen
  const toggleDeafen = React.useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    isDeafenedRef.current = nextDeafened;

    // Mute/unmute all remote audio elements
    audioElementsRef.current.forEach((audio) => {
      audio.muted = nextDeafened;
    });

    if (nextDeafened && !isMicMuted) {
      toggleMic();
    }
    broadcastMyVoiceState({ is_deafened: nextDeafened });
  }, [isDeafened, isMicMuted, toggleMic, broadcastMyVoiceState]);

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
      broadcastMyVoiceState({ is_screen_sharing: false });
    } else {
      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
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
            broadcastMyVoiceState({ is_screen_sharing: false });
          };
        }

        setScreenStream(sStream);
        screenStreamRef.current = sStream;
        setIsScreenSharing(true);
        isScreenSharingRef.current = true;
        broadcastMyVoiceState({ is_screen_sharing: true });
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    }
  }, [isScreenSharing, broadcastMyVoiceState]);

  // Toggle AI Noise Suppression
  const toggleNoiseSuppression = React.useCallback(() => {
    const next = !isNoiseSuppressionEnabled;
    setIsNoiseSuppressionEnabled(next);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        try {
          track.applyConstraints({
            noiseSuppression: next,
            echoCancellation: true,
          });
        } catch {}
      });
    }
  }, [isNoiseSuppressionEnabled]);

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

  // Auto disconnect cleanly on unmount or channel switch
  React.useEffect(() => {
    return () => {
      disconnectVoice();
    };
  }, [channelId, disconnectVoice]);

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
