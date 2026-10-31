import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeHub } from '@/lib/realtime/realtime-hub';
import {
  CallStateMachine,
  CallState,
  CallEvent,
  isCallCollision,
} from '@/features/calls/call-state-machine';
import { resolveMultiSourcePresence, UserStatus } from '@/features/presence/presence-resolver';
import { cleanupMediaSession } from '@/lib/webrtc/media-cleanup';

describe('Phase 3: Realtime, Calls, Voice Architecture', () => {
  describe('C1: Ref-counted RealtimeHub', () => {
    let mockSupabase: any;
    let mockChannels: Map<string, any>;
    let realtimeHub: RealtimeHub;

    beforeEach(() => {
      mockChannels = new Map();
      mockSupabase = {
        channel: vi.fn((topic: string) => {
          const ch = {
            topic,
            subscribe: vi.fn().mockReturnThis(),
            unsubscribe: vi.fn().mockResolvedValue('ok'),
            on: vi.fn().mockReturnThis(),
            send: vi.fn().mockResolvedValue({}),
            track: vi.fn().mockResolvedValue({}),
            untrack: vi.fn().mockResolvedValue({}),
            presenceState: vi.fn().mockReturnValue({}),
          };
          mockChannels.set(topic, ch);
          return ch;
        }),
        removeChannel: vi.fn((ch: any) => {
          mockChannels.delete(ch.topic);
          return Promise.resolve('ok');
        }),
      };
      realtimeHub = new RealtimeHub(mockSupabase);
    });

    it('creates a new channel on first acquire and increments refCount to 1', () => {
      const ch1 = realtimeHub.acquire('room-123');
      expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
      expect(mockSupabase.channel).toHaveBeenCalledWith('room-123', undefined);
      expect(realtimeHub.getRefCount('room-123')).toBe(1);
      expect(ch1.topic).toBe('room-123');
    });

    it('returns the existing channel on subsequent acquire and increments refCount', () => {
      const ch1 = realtimeHub.acquire('room-123');
      const ch2 = realtimeHub.acquire('room-123');
      expect(ch1).toBe(ch2);
      expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
      expect(realtimeHub.getRefCount('room-123')).toBe(2);
    });

    it('decrements refCount on release and does not remove channel while refCount > 0', () => {
      realtimeHub.acquire('room-123');
      realtimeHub.acquire('room-123');
      expect(realtimeHub.getRefCount('room-123')).toBe(2);

      realtimeHub.release('room-123');
      expect(realtimeHub.getRefCount('room-123')).toBe(1);
      expect(mockSupabase.removeChannel).not.toHaveBeenCalled();
    });

    it('removes channel when refCount reaches 0', () => {
      realtimeHub.acquire('room-123');
      realtimeHub.release('room-123');
      expect(realtimeHub.getRefCount('room-123')).toBe(0);
      expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
    });

    it('supports acquireScoped with auto-release callback', () => {
      const scoped = realtimeHub.acquireScoped('room-456');
      expect(realtimeHub.getRefCount('room-456')).toBe(1);
      scoped.release();
      expect(realtimeHub.getRefCount('room-456')).toBe(0);
      expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
    });

    it('handles gracePeriodMs to prevent flapping on rapid unmount/remount', async () => {
      vi.useFakeTimers();
      realtimeHub.acquire('room-789');
      realtimeHub.release('room-789', 500); // 500ms grace period

      // Before timer fires, channel is still kept
      expect(mockSupabase.removeChannel).not.toHaveBeenCalled();
      expect(realtimeHub.hasChannel('room-789')).toBe(true);

      // Re-acquire during grace period
      realtimeHub.acquire('room-789');
      vi.advanceTimersByTime(600);

      // Channel should still be alive because re-acquired
      expect(mockSupabase.removeChannel).not.toHaveBeenCalled();
      expect(realtimeHub.getRefCount('room-789')).toBe(1);

      // Release again and let timer expire
      realtimeHub.release('room-789', 500);
      vi.advanceTimersByTime(500);
      expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('subscribes channel once when first listener registers via hub.on and unregisters cleanly', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = realtimeHub.on('room-sub', { event: 'new_msg' }, handler1);
      expect(realtimeHub.getRefCount('room-sub')).toBe(1);

      const channel = realtimeHub.getChannel('room-sub');
      expect(channel?.subscribe).toHaveBeenCalledTimes(1);

      const unsub2 = realtimeHub.on('room-sub', { event: 'typing' }, handler2);
      expect(realtimeHub.getRefCount('room-sub')).toBe(2);
      // Subscribe should NOT be called again for second listener on same topic
      expect(channel?.subscribe).toHaveBeenCalledTimes(1);

      // Unsubscribe first listener
      unsub1();
      expect(realtimeHub.getRefCount('room-sub')).toBe(1);
      expect(mockSupabase.removeChannel).not.toHaveBeenCalled();

      // Unsubscribe second listener -> tears down channel
      unsub2();
      expect(realtimeHub.getRefCount('room-sub')).toBe(0);
      expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1);
    });
  });

  describe('C4 & C5: Call State Machine & Call Collision Handling', () => {
    it('initializes in idle state', () => {
      const fsm = new CallStateMachine();
      expect(fsm.getState()).toBe('idle');
    });

    it('transitions idle -> initiating -> in_call on successful start', () => {
      const fsm = new CallStateMachine();
      fsm.transition('START_OUTGOING');
      expect(fsm.getState()).toBe('outgoing_ringing');

      fsm.transition('CONNECT');
      expect(fsm.getState()).toBe('in_call');
    });

    it('transitions idle -> incoming_ringing -> in_call on accept', () => {
      const fsm = new CallStateMachine();
      fsm.transition('RECEIVE_INCOMING');
      expect(fsm.getState()).toBe('incoming_ringing');

      fsm.transition('ACCEPT');
      expect(fsm.getState()).toBe('in_call');
    });

    it('transitions in_call -> reconnecting on ice disconnect and recovers on ice connected', () => {
      const fsm = new CallStateMachine();
      fsm.transition('START_OUTGOING');
      fsm.transition('CONNECT');
      expect(fsm.getState()).toBe('in_call');

      fsm.transition('ICE_DISCONNECTED');
      expect(fsm.getState()).toBe('reconnecting');

      fsm.transition('ICE_CONNECTED');
      expect(fsm.getState()).toBe('in_call');
    });

    it('transitions in_call -> ended -> idle on end call', () => {
      const fsm = new CallStateMachine();
      fsm.transition('START_OUTGOING');
      fsm.transition('CONNECT');
      fsm.transition('END_CALL');
      expect(fsm.getState()).toBe('ended');

      fsm.transition('RESET');
      expect(fsm.getState()).toBe('idle');
    });

    it('detects call collisions correctly (C5)', () => {
      // If user is idle and not in voice, no collision
      expect(isCallCollision('idle', false)).toBe(false);

      // If user is in_call, collision!
      expect(isCallCollision('in_call', false)).toBe(true);

      // If user is in outgoing ringing, collision!
      expect(isCallCollision('outgoing_ringing', false)).toBe(true);

      // If user is connected to a Server Voice channel, collision!
      expect(isCallCollision('idle', true)).toBe(true);
      expect(isCallCollision('in_call', true)).toBe(true);
    });

    it('rejects invalid state transitions cleanly without throwing', () => {
      const fsm = new CallStateMachine();
      // Cannot jump from idle to reconnecting
      const result = fsm.transition('ICE_DISCONNECTED');
      expect(result).toBe(false);
      expect(fsm.getState()).toBe('idle');
    });
  });

  describe('C7: Presence Multi-Source Conflict Resolution & Flapping Prevention', () => {
    it('resolves single user with multiple tabs/devices choosing most active status', () => {
      // User with 2 tabs: one reported online, one reported dnd
      const entries = [
        { status: 'online' as UserStatus, timestamp: 1000 },
        { status: 'dnd' as UserStatus, timestamp: 2000 },
      ];
      const resolved = resolveMultiSourcePresence(entries);
      expect(resolved).toBe('dnd');
    });

    it('allows a newer deliberate status change from dnd to online or idle to take effect', () => {
      const entries = [
        { status: 'dnd' as UserStatus, timestamp: 1000 },
        { status: 'idle' as UserStatus, timestamp: 2000 },
      ];
      const resolved = resolveMultiSourcePresence(entries);
      expect(resolved).toBe('idle');
    });

    it('prefers active presence over offline when multiple devices exist', () => {
      const entries = [
        { status: 'offline' as UserStatus, timestamp: 3000 },
        { status: 'online' as UserStatus, timestamp: 1000 },
      ];
      const resolved = resolveMultiSourcePresence(entries);
      expect(resolved).toBe('online');
    });

    it('returns offline when all entries are offline or empty', () => {
      expect(resolveMultiSourcePresence([])).toBe('offline');
      expect(
        resolveMultiSourcePresence([
          { status: 'offline' as UserStatus, timestamp: 1000 },
        ])
      ).toBe('offline');
    });
  });

  describe('C8: Audio Track, WebRTC, and LiveKit Cleanup on Unmount', () => {
    it('stops all tracks in local, remote, and screen streams', () => {
      const mockTrack1 = { stop: vi.fn() };
      const mockTrack2 = { stop: vi.fn() };
      const mockTrack3 = { stop: vi.fn() };

      const localStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack1]),
      } as any;
      const remoteStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack2]),
      } as any;
      const screenStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack3]),
      } as any;

      const pc = {
        close: vi.fn(),
      } as any;

      const livekitRoom = {
        disconnect: vi.fn(),
      } as any;

      const ringtone = {
        stop: vi.fn(),
      } as any;

      cleanupMediaSession({
        localStream,
        remoteStream,
        screenStream,
        peerConnection: pc,
        livekitRoom,
        ringtone,
      });

      expect(mockTrack1.stop).toHaveBeenCalledTimes(1);
      expect(mockTrack2.stop).toHaveBeenCalledTimes(1);
      expect(mockTrack3.stop).toHaveBeenCalledTimes(1);
      expect(pc.close).toHaveBeenCalledTimes(1);
      expect(livekitRoom.disconnect).toHaveBeenCalledTimes(1);
      expect(ringtone.stop).toHaveBeenCalledTimes(1);
    });

    it('handles null/undefined gracefully without errors', () => {
      expect(() => {
        cleanupMediaSession({
          localStream: null,
          remoteStream: null,
          screenStream: null,
          peerConnection: null,
          livekitRoom: null,
          ringtone: null,
        });
      }).not.toThrow();
    });
  });
});
