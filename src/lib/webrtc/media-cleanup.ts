export interface MediaSessionCleanupOptions {
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  peerConnection?: RTCPeerConnection | null;
  peerConnections?: Map<string, RTCPeerConnection> | RTCPeerConnection[] | null;
  livekitRoom?: { disconnect?: () => void } | null;
  ringtone?: { stop?: () => void } | null;
  audioContext?: AudioContext | null;
  audioElement?: HTMLAudioElement | null;
}

/**
 * Clean up all media tracks, WebRTC peer connections, LiveKit rooms, and audio contexts (C8).
 * Ensures zero audio leaks, released hardware (camera/mic indicators off), and no phantom participants.
 */
export function cleanupMediaSession(options: MediaSessionCleanupOptions): void {
  const {
    localStream,
    remoteStream,
    screenStream,
    peerConnection,
    peerConnections,
    livekitRoom,
    ringtone,
    audioContext,
    audioElement,
  } = options;

  // 1. Stop all tracks in streams (InvalidStateError if already ended is safe to ignore)
  const streams = [localStream, remoteStream, screenStream];
  for (const stream of streams) {
    if (stream && typeof stream.getTracks === 'function') {
      try {
        const tracks = stream.getTracks();
        for (const track of tracks) {
          try {
            track.stop();
          } catch {
            // Track may already be ended or released by browser hardware
          }
        }
      } catch {
        // Stream may have already been garbage collected
      }
    }
  }

  // 2. Close single peer connection
  if (peerConnection) {
    try {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.close();
    } catch {
      // PeerConnection may already be in 'closed' state
    }
  }

  // 3. Close peer connections collection
  if (peerConnections) {
    if (peerConnections instanceof Map) {
      peerConnections.forEach((pc) => {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
          pc.close();
        } catch {
          // Individual peer connection already closed
        }
      });
      try {
        peerConnections.clear();
      } catch {
        // Map mutation safe ignore
      }
    } else if (Array.isArray(peerConnections)) {
      peerConnections.forEach((pc) => {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.close();
        } catch {
          // Individual peer connection already closed
        }
      });
    }
  }

  // 4. Disconnect LiveKit room
  if (livekitRoom && typeof livekitRoom.disconnect === 'function') {
    try {
      livekitRoom.disconnect();
    } catch {
      // Room already disconnected or unmounted
    }
  }

  // 5. Stop ringtone
  if (ringtone && typeof ringtone.stop === 'function') {
    try {
      ringtone.stop();
    } catch {
      // Audio element or oscillator already halted
    }
  }

  // 6. Reset audio element
  if (audioElement) {
    try {
      audioElement.pause();
      audioElement.srcObject = null;
    } catch {
      // Media element already detached from DOM
    }
  }

  // 7. Close Web Audio Context
  if (audioContext && audioContext.state !== 'closed') {
    try {
      audioContext.close().catch(() => {});
    } catch {
      // AudioContext already suspended or closing
    }
  }
}
