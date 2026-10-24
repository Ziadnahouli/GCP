'use client';

import { DEFAULT_RTC_CONFIG, cleanIceCandidate } from '@/lib/webrtc/ice-config';

export interface MeshPeerOptions {
  remoteUserId: string;
  currentUserId: string;
  isInitiator: boolean;
  localStream: MediaStream | null;
  videoStream: MediaStream | null;
  screenStream: MediaStream | null;
  channel: any;
  isDeafened: boolean;
  incomingVolume: number;
  onAudioTrackReceived?: (remoteUserId: string, stream: MediaStream) => void;
  onVideoTrackReceived?: (remoteUserId: string, stream: MediaStream) => void;
  onVideoTrackEnded?: (remoteUserId: string) => void;
  onConnectionFailed?: (remoteUserId: string) => void;
}

/**
 * Creates and configures a WebRTC RTCPeerConnection for a voice mesh peer.
 */
export function createMeshPeerConnection(options: MeshPeerOptions): RTCPeerConnection | undefined {
  const {
    remoteUserId,
    currentUserId,
    isInitiator,
    localStream,
    videoStream,
    screenStream,
    channel,
    onAudioTrackReceived,
    onVideoTrackReceived,
    onVideoTrackEnded,
    onConnectionFailed,
  } = options;

  let pc: RTCPeerConnection;
  try {
    pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
  } catch (err) {
    console.warn('[VoiceMesh] Failed to create RTCPeerConnection:', err);
    return undefined;
  }

  // Add local audio tracks if mic captured
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      try {
        pc.addTrack(track, localStream);
      } catch {}
    });
  }

  // Pre-add video transceiver so camera/screenshare can be added or replaced dynamically
  try {
    pc.addTransceiver('video', { direction: 'sendrecv' });
  } catch {}

  // Add local video/screen tracks if active
  if (screenStream) {
    screenStream.getVideoTracks().forEach((track) => {
      try {
        const senders = pc.getSenders();
        const vSender = senders.find((s) => s.track?.kind === 'video');
        if (vSender) vSender.replaceTrack(track);
        else pc.addTrack(track, screenStream);
      } catch {}
    });
  } else if (videoStream) {
    videoStream.getVideoTracks().forEach((track) => {
      try {
        const senders = pc.getSenders();
        const vSender = senders.find((s) => s.track?.kind === 'video');
        if (vSender) vSender.replaceTrack(track);
        else pc.addTrack(track, videoStream);
      } catch {}
    });
  }

  // Trickle ICE candidates
  pc.onicecandidate = (event) => {
    const cleaned = cleanIceCandidate(event.candidate?.toJSON());
    if (cleaned && channel) {
      try {
        channel.send({
          type: 'broadcast',
          event: 'voice_rtc_signal',
          payload: {
            from: currentUserId,
            to: remoteUserId,
            type: 'ice-candidate',
            candidate: cleaned,
          },
        });
      } catch {}
    }
  };

  // Remote tracks
  pc.ontrack = (event) => {
    const stream = (event.streams && event.streams[0]) || new MediaStream([event.track]);
    if (event.track.kind === 'audio') {
      onAudioTrackReceived?.(remoteUserId, stream);
    } else if (event.track.kind === 'video') {
      onVideoTrackReceived?.(remoteUserId, stream);
      event.track.onended = () => {
        onVideoTrackEnded?.(remoteUserId);
      };
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      onConnectionFailed?.(remoteUserId);
    }
  };

  if (isInitiator) {
    pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any)
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        if (channel) {
          channel.send({
            type: 'broadcast',
            event: 'voice_rtc_signal',
            payload: {
              from: currentUserId,
              to: remoteUserId,
              type: 'offer',
              sdp: pc.localDescription,
            },
          });
        }
      })
      .catch((err) => {
        console.warn('[VoiceMesh] createOffer error:', err);
      });
  }

  return pc;
}

/**
 * Attaches or configures an HTMLAudioElement for a remote voice mesh participant.
 */
export function setupRemoteAudioElement(
  remoteUserId: string,
  stream: MediaStream,
  isDeafened: boolean,
  incomingVolume: number,
  existingElement?: HTMLAudioElement | null
): HTMLAudioElement {
  let audioEl = existingElement;
  if (!audioEl && typeof document !== 'undefined') {
    audioEl = document.getElementById(`remote-voice-audio-${remoteUserId}`) as HTMLAudioElement | null;
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `remote-voice-audio-${remoteUserId}`;
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
    }
  }

  if (audioEl) {
    if (audioEl.srcObject !== stream) {
      audioEl.srcObject = stream;
    }
    audioEl.muted = isDeafened;
    audioEl.volume = isDeafened ? 0 : Math.max(0, Math.min(1, incomingVolume / 100));

    try {
      if (typeof window !== 'undefined') {
        const savedOutputId = localStorage.getItem('nexus_audio_output_device');
        if (savedOutputId && 'setSinkId' in audioEl && typeof (audioEl as any).setSinkId === 'function') {
          (audioEl as any).setSinkId(savedOutputId).catch(() => {});
        }
      }
    } catch {}

    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[VoiceMesh] Audio autoplay awaiting user interaction:', err);
      });
    }
  }

  return audioEl!;
}

/**
 * Updates volume and mute states across all remote audio elements.
 */
export function updateAllRemoteAudioVolumes(
  audioElements: Map<string, HTMLAudioElement>,
  isDeafened: boolean,
  incomingVolume: number
): void {
  const vol = isDeafened ? 0 : Math.max(0, Math.min(1, incomingVolume / 100));
  audioElements.forEach((el) => {
    try {
      el.muted = isDeafened;
      el.volume = vol;
    } catch {}
  });
}

/**
 * Cleans up a single mesh peer connection and its audio/video elements.
 */
export function cleanupMeshPeer(
  peerId: string,
  peerConnections: Map<string, RTCPeerConnection>,
  audioElements: Map<string, HTMLAudioElement>,
  remoteVideoStreams?: Map<string, MediaStream>
): void {
  const pc = peerConnections.get(peerId);
  if (pc) {
    try {
      pc.close();
    } catch {}
    peerConnections.delete(peerId);
  }

  const el = audioElements.get(peerId);
  if (el) {
    try {
      el.pause();
      el.srcObject = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch {}
    audioElements.delete(peerId);
  }

  if (remoteVideoStreams) {
    remoteVideoStreams.delete(peerId);
  }
}

/**
 * Cleans up all mesh peer connections and audio elements.
 */
export function cleanupAllMeshPeers(
  peerConnections: Map<string, RTCPeerConnection>,
  audioElements: Map<string, HTMLAudioElement>,
  remoteVideoStreams?: Map<string, MediaStream>
): void {
  peerConnections.forEach((pc) => {
    try {
      pc.close();
    } catch {}
  });
  peerConnections.clear();

  audioElements.forEach((el) => {
    try {
      el.pause();
      el.srcObject = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch {}
  });
  audioElements.clear();

  if (remoteVideoStreams) {
    remoteVideoStreams.clear();
  }
}
