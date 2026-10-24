'use client';

import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { unmaskCandidate } from '@/lib/webrtc/ice-config';
import { addBoundedSet } from '@/lib/utils';

export interface QueuedSignal {
  event: string;
  payload: unknown;
}

/**
 * Creates a unique messageId for WebRTC signaling deduplication.
 */
export function createSignalMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Reliably sends a signal to a peer's personal channel with FIFO queuing.
 */
export function dispatchSignalToUser(
  targetUserId: string,
  event: string,
  payload: unknown,
  outboundQueue: Map<string, QueuedSignal[]>,
  outboundChannels: Map<string, RealtimeChannel>,
  supabase: SupabaseClient | null
): void {
  if (!supabase || !targetUserId) return;

  let queue = outboundQueue.get(targetUserId);
  if (!queue) {
    queue = [];
    outboundQueue.set(targetUserId, queue);
  }

  let channelToUse = outboundChannels.get(targetUserId);

  // If existing channel is closed or errored from prior disconnected call, remove and re-subscribe cleanly
  if (channelToUse && channelToUse.state !== 'joined' && channelToUse.state !== 'joining') {
    try {
      supabase.removeChannel(channelToUse);
    } catch {}
    outboundChannels.delete(targetUserId);
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
    const ch = realtimeHub.acquire(`user-signals-${targetUserId}`, { config: { private: true } }, supabase);
    outboundChannels.set(targetUserId, ch);

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const pending = outboundQueue.get(targetUserId) || [];
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
}

/**
 * Dedicated guaranteed signal sender resilient against immediate cleanup.
 */
export function dispatchDirectSignal(
  channelTopic: string,
  event: string,
  payload: unknown,
  supabase: SupabaseClient | null
): void {
  if (!supabase || !channelTopic) return;
  try {
    const ch = realtimeHub.acquire(channelTopic, { config: { private: true } }, supabase);
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
}

/**
 * Broadcasts a signal on the active call room channel with FIFO queuing.
 */
export function dispatchSignalToRoom(
  event: string,
  payload: unknown,
  roomChannel: RealtimeChannel | null,
  roomQueue: QueuedSignal[]
): void {
  if (roomChannel && roomChannel.state === 'joined') {
    roomChannel
      .send({
        type: 'broadcast',
        event,
        payload,
      })
      .catch(() => {});
    return;
  }

  roomQueue.push({ event, payload });
}

/**
 * Processes an incoming ICE candidate, unmasks ZeroTier candidates if available,
 * and adds to RTCPeerConnection or pending candidate buffer.
 */
export async function processIncomingIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit,
  targetZeroTierIp: string | null,
  seenCandidates: Set<string>,
  pendingCandidates: RTCIceCandidateInit[]
): Promise<void> {
  // 1. If candidate contains .local and remote ZeroTier IP is known, unmask and inject direct route
  if (targetZeroTierIp && candidate.candidate && candidate.candidate.includes('.local')) {
    const unmasked = unmaskCandidate(candidate, targetZeroTierIp);
    if (unmasked) {
      const unmaskedKey = JSON.stringify({
        candidate: unmasked.candidate,
        sdpMid: unmasked.sdpMid,
        sdpMLineIndex: unmasked.sdpMLineIndex,
      });
      if (!seenCandidates.has(unmaskedKey)) {
        addBoundedSet(seenCandidates, unmaskedKey, 1000);
        try {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(unmasked));
          } else {
            pendingCandidates.push(unmasked);
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
  if (seenCandidates.has(candStr)) return;
  addBoundedSet(seenCandidates, candStr, 1000);

  try {
    if (pc.remoteDescription && pc.remoteDescription.type) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      pendingCandidates.push(candidate);
    }
  } catch (e) {
    console.warn('[CallSignaling] Error applying standard candidate:', e);
  }
}
