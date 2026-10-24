'use client';

/**
 * LiveKit SFU Adapter for Direct Calls.
 *
 * In CallContext, Direct 1-on-1 and Small Squad calls enforce Direct WebRTC P2P
 * with ZeroTier Virtual LAN optimization for minimal latency.
 * This adapter provides the room connection interface, publication mute toggles,
 * and clean disconnection handlers for SFU compatibility.
 */

export interface LiveKitCallAdapter {
  isLiveKitActive: boolean;
  connectLiveKitCall: (token: string, roomName: string) => Promise<void>;
  disconnectLiveKitCall: (room: any | null) => void;
  updatePublicationMuteState: (room: any | null, isMuted: boolean) => Promise<void>;
}

/**
 * Bypasses cloud SFU for direct 1-on-1 / squad calls in favor of direct WebRTC P2P.
 */
export async function connectLiveKitCall(
  _token: string,
  _roomName: string,
  setIsLiveKitActive: (active: boolean) => void
): Promise<void> {
  console.log('[LiveKit Call] Cloud SFU bypassed in CallContext; strictly enforcing Direct WebRTC P2P.');
  setIsLiveKitActive(false);
}

/**
 * Disconnects any active LiveKit room instance cleanly.
 */
export function disconnectLiveKitRoom(room: any | null): void {
  if (room) {
    try {
      room.disconnect();
    } catch {}
  }
}

/**
 * Directly mutes or unmutes existing LiveKit audio publications without spawning duplicate tracks.
 */
export async function updateLiveKitAudioPublicationMute(
  room: any | null,
  isMuted: boolean
): Promise<void> {
  if (room?.localParticipant) {
    try {
      const lp = room.localParticipant;
      const promises: Promise<any>[] = [];
      if (lp.audioTrackPublications) {
        lp.audioTrackPublications.forEach((pub: any) => {
          if (pub?.track) {
            promises.push(isMuted ? pub.track.mute() : pub.track.unmute());
            if (pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !isMuted;
            }
          }
          if (isMuted && typeof pub?.mute === 'function') {
            promises.push(pub.mute());
          } else if (!isMuted && typeof pub?.unmute === 'function') {
            promises.push(pub.unmute());
          }
        });
      }
      if (typeof lp.setMicrophoneEnabled === 'function') {
        promises.push(lp.setMicrophoneEnabled(!isMuted));
      }
      await Promise.allSettled(promises);
    } catch (err) {
      console.warn('[LiveKitAdapter] Error updating LiveKit audio publication mute state:', err);
    }
  }
}
