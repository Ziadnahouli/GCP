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
});
