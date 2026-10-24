'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserStatus } from '@/lib/types/profile';
import { RealtimeChannel } from '@supabase/supabase-js';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { resolveMultiSourcePresence } from '@/features/presence/presence-resolver';

interface PresenceContextType {
  onlineUsers: Map<string, UserStatus>;
  getUserStatus: (userId: string | null | undefined) => UserStatus;
  isUserOnline: (userId: string | null | undefined) => boolean;
}

const PresenceContext = React.createContext<PresenceContextType>({
  onlineUsers: new Map(),
  getUserStatus: () => 'offline',
  isUserOnline: () => false,
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isConfigured } = useAuth();
  const supabase = React.useMemo(() => getBrowserClient(), []);
  const [onlineUsers, setOnlineUsers] = React.useState<Map<string, UserStatus>>(new Map());

  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const profileStatusRef = React.useRef<UserStatus>('online');
  profileStatusRef.current = profile?.status || 'online';

  const pingsRef = React.useRef<Map<string, number>>(new Map());
  const pingsStatusRef = React.useRef<Map<string, UserStatus>>(new Map());
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // 1. Core Realtime Presence Channel (lifecycle tied strictly to user?.id, never torn down on status changes)
  React.useEffect(() => {
    if (!user?.id || !isConfigured) {
      setOnlineUsers(new Map());
      pingsRef.current.clear();
      pingsStatusRef.current.clear();
      return;
    }

    const userId = user.id;

    // C1: Acquire shared channel from RealtimeHub
    const channel = realtimeHub.acquire(
      'nexus-global-presence',
      {
        config: {
          broadcast: { self: false },
          presence: { key: userId },
        },
      },
      supabase
    );
    channelRef.current = channel;

    const performUpdate = () => {
      const state = channel.presenceState();
      const currentMap = new Map<string, UserStatus>();

      // Group presence entries by user ID (C7: Multi-source conflict resolution)
      const userPresences = new Map<string, Array<{ status: UserStatus; timestamp?: number }>>();

      Object.entries(state).forEach(([key, presences]) => {
        if (Array.isArray(presences) && presences.length > 0) {
          presences.forEach((p: any) => {
            const uid = p?.user_id || key;
            const st = (p?.status as UserStatus) || 'online';
            if (!userPresences.has(uid)) {
              userPresences.set(uid, []);
            }
            userPresences.get(uid)!.push({
              status: st,
              timestamp: p?.online_at ? new Date(p.online_at).getTime() : Date.now(),
            });
          });
        }
      });

      // Retain peers from active pings within the last 30s
      const now = Date.now();
      pingsRef.current.forEach((timestamp, peerId) => {
        if (now - timestamp < 30000) {
          const st = pingsStatusRef.current.get(peerId) || 'online';
          if (!userPresences.has(peerId)) {
            userPresences.set(peerId, []);
          }
          userPresences.get(peerId)!.push({ status: st, timestamp });
        }
      });

      // Resolve each user to a single, stable presence status
      userPresences.forEach((entries, uid) => {
        const resolved = resolveMultiSourcePresence(entries);
        if (resolved !== 'offline') {
          currentMap.set(uid, resolved);
        }
      });

      setOnlineUsers(currentMap);
    };

    // Debounced update to prevent flapping / re-render storms (C7)
    const updatePresenceState = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(performUpdate, 150);
    };

    channel
      .on('presence', { event: 'sync' }, updatePresenceState)
      .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
        if (Array.isArray(newPresences) && newPresences.length > 0) {
          const latest: any = newPresences[newPresences.length - 1];
          const st = (latest?.status as UserStatus) || 'online';
          const targetId = latest?.user_id || key;
          if (targetId && targetId !== userId) {
            pingsRef.current.set(targetId, Date.now());
            pingsStatusRef.current.set(targetId, st);
          }
        }
        updatePresenceState();
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
        if (key) {
          pingsRef.current.delete(key);
          pingsStatusRef.current.delete(key);
        }
        if (Array.isArray(leftPresences)) {
          leftPresences.forEach((lp: any) => {
            const uid = lp?.user_id || lp?.key;
            if (uid) {
              pingsRef.current.delete(uid);
              pingsStatusRef.current.delete(uid);
            }
          });
        }
        updatePresenceState();
      })
      .on('broadcast', { event: 'presence_ping' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === userId) return;
        const st = (payload.status as UserStatus) || 'online';
        if (st === 'offline') {
          pingsRef.current.delete(payload.userId);
          pingsStatusRef.current.delete(payload.userId);
        } else {
          pingsRef.current.set(payload.userId, Date.now());
          pingsStatusRef.current.set(payload.userId, st);
        }
        updatePresenceState();
      })
      .on('broadcast', { event: 'presence_status_change' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === userId) return;
        const st = (payload.status as UserStatus) || 'offline';
        if (st === 'offline') {
          pingsRef.current.delete(payload.userId);
          pingsStatusRef.current.delete(payload.userId);
        } else {
          pingsRef.current.set(payload.userId, Date.now());
          pingsStatusRef.current.set(payload.userId, st);
        }
        updatePresenceState();
      })
      .on('broadcast', { event: 'presence_leave' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === userId) return;
        pingsRef.current.delete(payload.userId);
        pingsStatusRef.current.delete(payload.userId);
        updatePresenceState();
      })
      .on('broadcast', { event: 'request_presence_sync' }, () => {
        if (channel.state === 'joined') {
          channel.send({
            type: 'broadcast',
            event: 'presence_ping',
            payload: {
              userId,
              status: profileStatusRef.current,
            },
          }).catch(() => {});
        }
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: any) => {
          const updatedProfile = payload?.new;
          if (updatedProfile?.id && updatedProfile.id !== userId) {
            const newStatus = (updatedProfile.status as UserStatus) || 'offline';
            if (newStatus === 'offline') {
              pingsRef.current.delete(updatedProfile.id);
              pingsStatusRef.current.delete(updatedProfile.id);
            } else {
              pingsRef.current.set(updatedProfile.id, Date.now());
              pingsStatusRef.current.set(updatedProfile.id, newStatus);
            }
            updatePresenceState();
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (profileStatusRef.current !== 'offline') {
            await channel.track({
              user_id: userId,
              status: profileStatusRef.current,
              online_at: new Date().toISOString(),
            }).catch(() => {});
          }

          channel.send({
            type: 'broadcast',
            event: 'presence_ping',
            payload: { userId, status: profileStatusRef.current },
          }).catch(() => {});

          channel.send({
            type: 'broadcast',
            event: 'request_presence_sync',
            payload: { requesterId: userId },
          }).catch(() => {});
        }
      });

    // C6: Lightweight 30s presence heartbeat (only when tab is visible)
    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && channel.state === 'joined') {
        channel.send({
          type: 'broadcast',
          event: 'presence_ping',
          payload: { userId, status: profileStatusRef.current },
        }).catch(() => {});
      }
    }, 30000);

    const handleWindowFocus = () => {
      if (channel.state === 'joined') {
        if (profileStatusRef.current !== 'offline') {
          channel.track({
            user_id: userId,
            status: profileStatusRef.current,
            online_at: new Date().toISOString(),
          }).catch(() => {});
        }
        channel.send({
          type: 'broadcast',
          event: 'presence_ping',
          payload: { userId, status: profileStatusRef.current },
        }).catch(() => {});
      }
    };

    const handleBeforeUnload = () => {
      try {
        channel.send({
          type: 'broadcast',
          event: 'presence_leave',
          payload: { userId },
        }).catch(() => {});
        channel.untrack();
      } catch {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleWindowFocus);
      document.addEventListener('visibilitychange', handleWindowFocus);
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearInterval(heartbeatTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleWindowFocus);
        document.removeEventListener('visibilitychange', handleWindowFocus);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      try {
        channel.send({
          type: 'broadcast',
          event: 'presence_leave',
          payload: { userId },
        }).catch(() => {});
        channel.untrack();
      } catch {}
      channelRef.current = null;
      // C1: Release channel with grace period
      realtimeHub.release('nexus-global-presence', 1500);
    };
  }, [user?.id, isConfigured, supabase]);

  // 2. Synchronize presence status without destroying/recreating the channel
  React.useEffect(() => {
    if (!user?.id || !profile?.status) return;
    const channel = channelRef.current;
    if (channel && channel.state === 'joined') {
      if (profile.status === 'offline') {
        channel.untrack().catch(() => {});
      } else {
        channel.track({
          user_id: user.id,
          status: profile.status,
          online_at: new Date().toISOString(),
        }).catch(() => {});
      }
      channel.send({
        type: 'broadcast',
        event: 'presence_status_change',
        payload: { userId: user.id, status: profile.status },
      }).catch(() => {});
      channel.send({
        type: 'broadcast',
        event: 'presence_ping',
        payload: { userId: user.id, status: profile.status },
      }).catch(() => {});
    }
  }, [profile?.status, user?.id]);

  const getUserStatus = React.useCallback(
    (userId: string | null | undefined): UserStatus => {
      if (!userId) return 'offline';
      if (user && userId === user.id) {
        return profile?.status || 'online';
      }
      return onlineUsers.get(userId) || 'offline';
    },
    [user, profile?.status, onlineUsers]
  );

  const isUserOnline = React.useCallback(
    (userId: string | null | undefined): boolean => {
      const s = getUserStatus(userId);
      return s === 'online' || s === 'idle' || s === 'dnd';
    },
    [getUserStatus]
  );

  return (
    <PresenceContext.Provider value={{ onlineUsers, getUserStatus, isUserOnline }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return React.useContext(PresenceContext);
}
