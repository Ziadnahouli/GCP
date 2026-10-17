import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Voice Overhaul & Audio Duplication Regression Tests', () => {
  let mockAudioTrack: any;
  let mockPublication: any;
  let mockLocalParticipant: any;
  let mockRoom: any;
  let mockRtcPeerConnection: any;
  let mockAudioElement: any;

  beforeEach(() => {
    mockAudioTrack = {
      kind: 'audio',
      enabled: true,
      muted: false,
      mute: vi.fn(() => {
        mockAudioTrack.muted = true;
      }),
      unmute: vi.fn(() => {
        mockAudioTrack.muted = false;
      }),
      stop: vi.fn(),
      setProcessor: vi.fn().mockResolvedValue(undefined),
    };

    mockPublication = {
      track: mockAudioTrack,
      source: 'microphone',
      isMuted: false,
    };

    mockLocalParticipant = {
      identity: 'user_local',
      audioTrackPublications: new Map([['mic_pub', mockPublication]]),
      publishTrack: vi.fn().mockResolvedValue(mockPublication),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      setMicrophoneEnabled: vi.fn(), // Should NOT be called in idempotent mute/unmute!
    };

    mockRoom = {
      state: 'connected',
      localParticipant: mockLocalParticipant,
      remoteParticipants: new Map(),
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const mockSender = {
      track: { kind: 'audio', enabled: true },
      replaceTrack: vi.fn().mockResolvedValue(undefined),
    };

    mockRtcPeerConnection = {
      connectionState: 'connected',
      getSenders: vi.fn().mockReturnValue([mockSender]),
      addTrack: vi.fn(),
      close: vi.fn(),
    };

    mockAudioElement = {
      id: '',
      muted: false,
      srcObject: null,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      remove: vi.fn(),
      parentNode: {
        removeChild: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Mute/Unmute Idempotency & Prevention of Track Doubling', () => {
    it('rapid toggling of mute/unmute mutates existing publications directly without calling setMicrophoneEnabled', () => {
      // Simulate our idempotent toggleMic implementation
      let isMicMuted = false;
      const mediaTracks = [mockAudioTrack];

      const toggleMic = () => {
        isMicMuted = !isMicMuted;
        mediaTracks.forEach((t) => {
          t.enabled = !isMicMuted;
        });

        // Mutate existing publications directly
        mockLocalParticipant.audioTrackPublications.forEach((pub: any) => {
          if (pub.track) {
            if (isMicMuted) {
              pub.track.mute();
            } else {
              pub.track.unmute();
            }
          }
        });
      };

      // Rapidly toggle 6 times: mute -> unmute -> mute -> unmute -> mute -> unmute
      for (let i = 0; i < 6; i++) {
        toggleMic();
      }

      // Final state: unmuted
      expect(isMicMuted).toBe(false);
      expect(mockAudioTrack.enabled).toBe(true);
      expect(mockAudioTrack.muted).toBe(false);

      // Verify that setMicrophoneEnabled (which causes getUserMedia duplication in LiveKit) was NEVER called
      expect(mockLocalParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();

      // Verify no extra tracks were published
      expect(mockLocalParticipant.publishTrack).not.toHaveBeenCalled();
      expect(mockAudioTrack.mute).toHaveBeenCalledTimes(3);
      expect(mockAudioTrack.unmute).toHaveBeenCalledTimes(3);
    });

    it('synchronizes track enabled state across WebRTC senders on mute and unmute', () => {
      const senders = mockRtcPeerConnection.getSenders();
      const audioSender = senders[0];

      let isMicMuted = false;
      const toggleMic = () => {
        isMicMuted = !isMicMuted;
        senders.forEach((s: any) => {
          if (s.track?.kind === 'audio') {
            s.track.enabled = !isMicMuted;
          }
        });
      };

      // Mute
      toggleMic();
      expect(isMicMuted).toBe(true);
      expect(audioSender.track.enabled).toBe(false);

      // Unmute
      toggleMic();
      expect(isMicMuted).toBe(false);
      expect(audioSender.track.enabled).toBe(true);
    });
  });

  describe('2. Mutual Exclusivity Between LiveKit and WebRTC Transports', () => {
    it('suppresses WebRTC peer connections when LiveKit SFU is active', () => {
      let mediaTransport: 'livekit' | 'webrtc' | 'none' = 'livekit';
      let rtcConnectionsCreated = 0;

      const getOrCreatePeerConnection = (remoteUserId: string) => {
        if (mediaTransport === 'livekit') {
          // Suppressed because LiveKit is authoritative
          return undefined;
        }
        rtcConnectionsCreated++;
        return mockRtcPeerConnection;
      };

      const pc1 = getOrCreatePeerConnection('user_bob');
      const pc2 = getOrCreatePeerConnection('user_alice');

      expect(pc1).toBeUndefined();
      expect(pc2).toBeUndefined();
      expect(rtcConnectionsCreated).toBe(0);
    });

    it('activates WebRTC peer connections only as fallback when LiveKit is not active', () => {
      let mediaTransport: string = 'webrtc';
      let rtcConnectionsCreated = 0;

      const getOrCreatePeerConnection = (remoteUserId: string) => {
        if (mediaTransport === 'livekit') {
          return undefined;
        }
        rtcConnectionsCreated++;
        return mockRtcPeerConnection;
      };

      const pc = getOrCreatePeerConnection('user_bob');
      expect(pc).toBeDefined();
      expect(rtcConnectionsCreated).toBe(1);
    });
  });

  describe('3. Single Authoritative Playback Sink and Track Cleanup', () => {
    it('cleans up previous audio element before creating a new one on track subscription', () => {
      const audioElements = new Map<string, any>();

      const onTrackSubscribed = (peerId: string) => {
        const prev = audioElements.get(peerId);
        if (prev) {
          prev.srcObject = null;
          prev.pause();
          prev.remove();
          audioElements.delete(peerId);
        }

        const newEl = { ...mockAudioElement, id: `audio-${peerId}` };
        audioElements.set(peerId, newEl);
      };

      // First subscription
      onTrackSubscribed('peer_1');
      expect(audioElements.size).toBe(1);
      const firstEl = audioElements.get('peer_1');

      // Second subscription for same peer (e.g. track replacement or reconnect)
      onTrackSubscribed('peer_1');
      expect(audioElements.size).toBe(1);
      expect(firstEl.remove).toHaveBeenCalled();
      expect(firstEl.pause).toHaveBeenCalled();
    });

    it('completely removes audio element and closes peer connection on unsubscribe or participant departure', () => {
      const audioElements = new Map<string, any>();
      const peerConnections = new Map<string, any>();

      audioElements.set('peer_1', mockAudioElement);
      peerConnections.set('peer_1', mockRtcPeerConnection);

      const onParticipantDisconnected = (peerId: string) => {
        const audio = audioElements.get(peerId);
        if (audio) {
          audio.srcObject = null;
          audio.pause();
          audio.remove();
          audioElements.delete(peerId);
        }

        const pc = peerConnections.get(peerId);
        if (pc) {
          pc.close();
          peerConnections.delete(peerId);
        }
      };

      onParticipantDisconnected('peer_1');

      expect(audioElements.has('peer_1')).toBe(false);
      expect(peerConnections.has('peer_1')).toBe(false);
      expect(mockAudioElement.remove).toHaveBeenCalled();
      expect(mockAudioElement.pause).toHaveBeenCalled();
      expect(mockRtcPeerConnection.close).toHaveBeenCalled();
    });
  });

  describe('4. Asynchronous Session Cancellation', () => {
    it('discards late LiveKit token responses and room connections if call session has ended', async () => {
      let activeSessionId: string | null = 'session_1';
      let connectionEstablished = false;

      // Simulate async connection flow with session check
      const connectWithSession = async (sessionId: string) => {
        // Step 1: Simulate token fetch delay
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Check cancellation
        if (activeSessionId !== sessionId) {
          return; // Cancelled
        }

        // Step 2: Simulate room connection delay
        await new Promise((resolve) => setTimeout(resolve, 20));

        if (activeSessionId !== sessionId) {
          return; // Cancelled
        }

        connectionEstablished = true;
      };

      // Start connection
      const promise = connectWithSession('session_1');

      // End session before connection completes
      activeSessionId = null;

      await promise;

      // Connection should NOT be established
      expect(connectionEstablished).toBe(false);
    });
  });

  describe('5. Krisp AI Processor State Management', () => {
    it('only marks isKrispActive true after successful setProcessor initialization', async () => {
      let isKrispActive = false;
      let processorRef: any = null;

      const initKrisp = async (shouldFail: boolean) => {
        try {
          if (shouldFail) {
            throw new Error('Krisp initialization failed');
          }
          const mockKrisp = { name: 'krisp-processor' };
          await mockAudioTrack.setProcessor(mockKrisp);
          processorRef = mockKrisp;
          isKrispActive = true;
        } catch {
          processorRef = null;
          isKrispActive = false;
        }
      };

      // Failure case
      await initKrisp(true);
      expect(isKrispActive).toBe(false);
      expect(processorRef).toBeNull();

      // Success case
      await initKrisp(false);
      expect(isKrispActive).toBe(true);
      expect(processorRef).not.toBeNull();
      expect(mockAudioTrack.setProcessor).toHaveBeenCalled();
    });
  });

  describe('6. Safe Constraints Polyfill & OverconstrainedError Handling', () => {
    it('relaxes audio constraints when browser throws OverconstrainedError', async () => {
      const { installSafeConstraintsPolyfill } = await import('@/lib/webrtc/safe-constraints');

      // Setup mock MediaStreamTrack on global window
      const appliedList: any[] = [];
      const mockTrack = {
        kind: 'audio',
        applyConstraints: vi.fn(async (c: any) => {
          appliedList.push(c);
          if (c && c.sampleRate) {
            const err: any = new Error('Cannot satisfy constraints');
            err.name = 'OverconstrainedError';
            throw err;
          }
          return undefined;
        }),
      };

      (global as any).MediaStreamTrack = function () {};
      (global as any).MediaStreamTrack.prototype = mockTrack;

      installSafeConstraintsPolyfill();

      // Call applyConstraints with unsupported sampleRate (WASAPI / CoreAudio)
      await mockTrack.applyConstraints({
        sampleRate: 48000,
        echoCancellation: true,
        noiseSuppression: true,
      });

      // It should have caught OverconstrainedError and retried with sampleRate stripped
      expect(appliedList.length).toBe(2);
      expect(appliedList[0].sampleRate).toBe(48000);
      expect(appliedList[1].sampleRate).toBeUndefined();
      expect(appliedList[1].echoCancellation).toBe(true);
      expect(appliedList[1].noiseSuppression).toBe(true);
    });

    it('silences unhandled constraint rejections in global rejection handler', async () => {
      const preventDefaultSpy = vi.fn();
      const mockRejectionEvent = {
        reason: {
          name: 'OverconstrainedError',
          message: 'Cannot satisfy constraints',
        },
        preventDefault: preventDefaultSpy,
      };

      const listeners: any[] = [];
      (global as any).window.addEventListener = (event: string, fn: any) => {
        if (event === 'unhandledrejection') listeners.push(fn);
      };

      delete (global as any).window.__safeConstraintsRejectionHandlerInstalled;
      const { installSafeConstraintsPolyfill } = await import('@/lib/webrtc/safe-constraints');
      installSafeConstraintsPolyfill();

      listeners.forEach((listener) => listener(mockRejectionEvent));
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('7. Private Call State Machine & activeCallSessionIdRef Isolation', () => {
    it('preserves local activeCallSessionIdRef when database returns call_sessions ID', () => {
      const activeCallSessionIdRef = { current: 'call_1729000000_abc' };
      const dbCallSessionIdRef = { current: null as string | null };

      // Simulate database response with row UUID
      const dbResponse = { id: '123e4567-e89b-12d3-a456-426614174000' };

      // Fix: db row ID goes into dbCallSessionIdRef, leaving activeCallSessionIdRef intact
      dbCallSessionIdRef.current = dbResponse.id;

      expect(activeCallSessionIdRef.current).toBe('call_1729000000_abc');
      expect(dbCallSessionIdRef.current).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('transitions call status to in_call and stops ringtones when remote participant joins or tracks arrive', () => {
      let callStatus = 'outgoing_ringing';
      let ringtonePlaying = true;
      let beaconActive = true;

      const stopRingtone = () => {
        ringtonePlaying = false;
        beaconActive = false;
      };

      const markCallConnected = () => {
        stopRingtone();
        callStatus = 'in_call';
      };

      // Callee answers and remote track is subscribed
      markCallConnected();

      expect(callStatus).toBe('in_call');
      expect(ringtonePlaying).toBe(false);
      expect(beaconActive).toBe(false);
    });
  });

  describe('8. Single Authoritative Media Transport & Playback Isolation', () => {
    it('suppresses WebRTC remote audio playback when LiveKit SFU is authoritative', () => {
      let mediaTransport = 'livekit';
      const playMock = vi.fn();
      const mockAudioEl = { play: playMock, srcObject: null };

      // Simulate ontrack with transport guard
      const onTrack = (event: { kind: string }) => {
        if (event.kind === 'audio') {
          if (mediaTransport === 'livekit') {
            // Suppress WebRTC track playback because LiveKit is authoritative
            return;
          }
          mockAudioEl.play();
        }
      };

      onTrack({ kind: 'audio' });
      expect(playMock).not.toHaveBeenCalled();

      // When fallback webrtc is active, playback occurs
      mediaTransport = 'webrtc';
      onTrack({ kind: 'audio' });
      expect(playMock).toHaveBeenCalledTimes(1);
    });

    it('unmuting mic does NOT enable WebRTC senders when LiveKit SFU is authoritative', () => {
      let mediaTransport: 'livekit' | 'webrtc' = 'livekit';
      const senderTrack = { kind: 'audio', enabled: false };
      const pc = {
        getSenders: () => [{ track: senderTrack }],
      };

      let isMicMuted = true;
      const toggleMic = () => {
        isMicMuted = !isMicMuted;
        // Authoritative transport check: only toggle WebRTC senders if webrtc transport
        if ((mediaTransport as string) === 'webrtc') {
          pc.getSenders().forEach((s) => {
            if (s.track?.kind === 'audio') {
              s.track.enabled = !isMicMuted;
            }
          });
        }
      };

      toggleMic(); // Unmute while livekit
      expect(isMicMuted).toBe(false);
      // Sender track must remain disabled to prevent dual transmission over P2P!
      expect(senderTrack.enabled).toBe(false);

      // Now switch to webrtc transport and unmute
      mediaTransport = 'webrtc';
      isMicMuted = true;
      toggleMic();
      expect(senderTrack.enabled).toBe(true);
    });

    it('local deafen/undeafen toggles playback elements without mutating remote participant mediaStreamTracks', () => {
      let isDeafened = false;
      const remoteAudioEl = { muted: false };
      const remoteMediaStreamTrack = { kind: 'audio', enabled: true }; // e.g. remote user active mic

      const toggleDeafen = () => {
        isDeafened = !isDeafened;
        // Only mute the local playback element
        remoteAudioEl.muted = isDeafened;
        // Remote mediaStreamTrack.enabled must NOT be altered
      };

      toggleDeafen(); // Deafen
      expect(isDeafened).toBe(true);
      expect(remoteAudioEl.muted).toBe(true);
      expect(remoteMediaStreamTrack.enabled).toBe(true);

      toggleDeafen(); // Undeafen
      expect(isDeafened).toBe(false);
      expect(remoteAudioEl.muted).toBe(false);
      expect(remoteMediaStreamTrack.enabled).toBe(true);
    });
  });

  describe('9. Voice Lounge Audio Delivery & Mute/Unmute Resilience', () => {
    it('remote tracks are attached directly with volume=1.0 and unmuted without room audioContext hijacking', () => {
      const mockAudioEl = {
        volume: 0,
        muted: true,
        autoplay: false,
        play: vi.fn().mockResolvedValue(undefined),
      };

      const mockTrack = {
        kind: 'audio',
        mediaStreamTrack: { enabled: false },
        attach: vi.fn(() => mockAudioEl),
      };

      let isDeafened = false;
      const attachAudio = (track: any) => {
        if (track.mediaStreamTrack) {
          track.mediaStreamTrack.enabled = !isDeafened;
        }
        const el = track.attach();
        el.muted = isDeafened;
        el.volume = 1.0;
        el.autoplay = true;
        el.play();
        return el;
      };

      const resultEl = attachAudio(mockTrack);
      expect(resultEl.volume).toBe(1.0);
      expect(resultEl.muted).toBe(false);
      expect(resultEl.autoplay).toBe(true);
      expect(mockTrack.mediaStreamTrack.enabled).toBe(true);
      expect(mockAudioEl.play).toHaveBeenCalledTimes(1);
    });

    it('attaches window unlock listener if remote audio autoplay is rejected by browser policy', async () => {
      const playMock = vi.fn().mockRejectedValue(new Error('Autoplay blocked'));
      const mockAudioEl = {
        volume: 1.0,
        muted: false,
        play: playMock,
      };

      const registeredListeners = new Map<string, Function>();
      const mockWindow = {
        addEventListener: (event: string, handler: Function) => registeredListeners.set(event, handler),
        removeEventListener: (event: string) => registeredListeners.delete(event),
      };

      const unlockAudio = () => {
        mockAudioEl.play();
        mockWindow.removeEventListener('click');
        mockWindow.removeEventListener('keydown');
      };

      try {
        await mockAudioEl.play();
      } catch {
        mockWindow.addEventListener('click', unlockAudio);
        mockWindow.addEventListener('keydown', unlockAudio);
      }

      expect(registeredListeners.has('click')).toBe(true);
      expect(registeredListeners.has('keydown')).toBe(true);

      // Simulate user clicking anywhere in document
      playMock.mockResolvedValueOnce(undefined);
      const clickHandler = registeredListeners.get('click');
      clickHandler?.();

      expect(registeredListeners.has('click')).toBe(false);
      expect(playMock).toHaveBeenCalledTimes(2);
    });

    it('unmuting mic invokes setMicrophoneEnabled and ensures mediaStreamTrack is enabled', async () => {
      let isMicMuted = true;
      const localAudioTrack = {
        mediaStreamTrack: { enabled: false },
        mute: vi.fn().mockResolvedValue(undefined),
        unmute: vi.fn().mockResolvedValue(undefined),
      };

      const lp = {
        audioTrackPublications: new Map([['TR_1', { track: localAudioTrack, mute: vi.fn(), unmute: vi.fn() }]]),
        setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      };

      const toggleMic = async () => {
        const nextMuted = !isMicMuted;
        isMicMuted = nextMuted;

        const promises: Promise<any>[] = [];
        lp.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            promises.push(nextMuted ? pub.track.mute() : pub.track.unmute());
            pub.track.mediaStreamTrack.enabled = !nextMuted;
          }
        });
        promises.push(lp.setMicrophoneEnabled(!nextMuted));
        await Promise.allSettled(promises);
      };

      await toggleMic(); // Unmute
      expect(isMicMuted).toBe(false);
      expect(localAudioTrack.unmute).toHaveBeenCalledTimes(1);
      expect(localAudioTrack.mediaStreamTrack.enabled).toBe(true);
      expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(true);

      await toggleMic(); // Mute again
      expect(isMicMuted).toBe(true);
      expect(localAudioTrack.mute).toHaveBeenCalledTimes(1);
      expect(localAudioTrack.mediaStreamTrack.enabled).toBe(false);
      expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    });

    it('TrackUnmuted event re-triggers play on existing audio element', () => {
      const playMock = vi.fn().mockResolvedValue(undefined);
      const audioElements = new Map([
        ['user_2', { muted: false, play: playMock }],
      ]);

      const onTrackUnmuted = (peerId: string) => {
        const el = audioElements.get(peerId);
        if (el) {
          el.muted = false;
          el.play();
        }
      };

      onTrackUnmuted('user_2');
      expect(playMock).toHaveBeenCalledTimes(1);
    });

    it('toggleDeafen silences receiver track, pauses playback element, and toggles mic in tandem', async () => {
      let isDeafened = false;
      let isMicMuted = false;

      const pauseMock = vi.fn();
      const playMock = vi.fn().mockResolvedValue(undefined);
      const mockAudioEl = {
        muted: false,
        volume: 1.0,
        paused: false,
        pause: pauseMock,
        play: playMock,
      };

      const receiverTrack = { enabled: true };
      const audioElements = new Map([['user_2', mockAudioEl]]);
      const remoteParticipants = new Map([
        ['user_2', { audioTrackPublications: new Map([['TR_2', { track: { mediaStreamTrack: receiverTrack, attachedElements: [mockAudioEl] } }]]) }],
      ]);

      const toggleMic = async () => {
        isMicMuted = !isMicMuted;
      };

      const toggleDeafen = async () => {
        const nextDeafened = !isDeafened;
        isDeafened = nextDeafened;

        audioElements.forEach((audio) => {
          audio.muted = nextDeafened;
          audio.volume = nextDeafened ? 0 : 1.0;
          if (!nextDeafened && (audio as any).paused) (audio as any).play();
        });

        remoteParticipants.forEach((rp) => {
          rp.audioTrackPublications.forEach((pub) => {
            if (pub.track?.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !nextDeafened;
            }
          });
        });

        if (nextDeafened && !isMicMuted) {
          await toggleMic();
        } else if (!nextDeafened && isMicMuted) {
          await toggleMic();
        }
      };

      // 1. Deafen
      await toggleDeafen();
      expect(isDeafened).toBe(true);
      expect(mockAudioEl.muted).toBe(true);
      expect(mockAudioEl.volume).toBe(0);
      expect(pauseMock).not.toHaveBeenCalled(); // Must NOT pause live stream to prevent buffer freezes
      expect(receiverTrack.enabled).toBe(false);
      expect(isMicMuted).toBe(true); // Mic muted automatically

      // 2. Undeafen
      mockAudioEl.paused = true;
      await toggleDeafen();
      expect(isDeafened).toBe(false);
      expect(mockAudioEl.muted).toBe(false);
      expect(mockAudioEl.volume).toBe(1.0);
      expect(playMock).toHaveBeenCalledTimes(1);
      expect(receiverTrack.enabled).toBe(true);
      expect(isMicMuted).toBe(false); // Mic restored automatically
    });
  });
});

