'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserStatus } from '@/lib/types/profile';
import { RealtimeChannel } from '@supabase/supabase-js';

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

  // 1. Core Realtime Presence Channel (lifecycle tied strictly to user auth, never torn down on status changes)
  React.useEffect(() => {
    if (!user || !isConfigured) {
      setOnlineUsers(new Map());
      pingsRef.current.clear();
      pingsStatusRef.current.clear();
      return;
    }

    const currentStatus = profileStatusRef.current;

    const channel = supabase.channel('nexus-global-presence', {
      config: {
        broadcast: { self: false },
        presence: { key: user.id },
      },
    });
    channelRef.current = channel;

    const updatePresenceState = () => {
      const state = channel.presenceState();
      const currentMap = new Map<string, UserStatus>();

      Object.entries(state).forEach(([key, presences]) => {
        if (Array.isArray(presences) && presences.length > 0) {
          const latest: any = presences[presences.length - 1];
          const st = (latest?.status as UserStatus) || 'online';
          if (st !== 'offline') {
            currentMap.set(key, st);
            if (latest?.user_id) currentMap.set(latest.user_id, st);
          }
        } else {
          currentMap.set(key, 'online');
        }
      });

      // Retain peers whose broadcast ping arrived within the last 16s (if not marked offline)
      const now = Date.now();
      pingsRef.current.forEach((timestamp, peerId) => {
        if (now - timestamp < 16000 && !currentMap.has(peerId)) {
          const st = pingsStatusRef.current.get(peerId) || 'online';
          if (st !== 'offline') {
            currentMap.set(peerId, st);
          }
        }
      });

      setOnlineUsers(currentMap);
    };

    channel
      .on('presence', { event: 'sync' }, updatePresenceState)
      .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
        if (Array.isArray(newPresences) && newPresences.length > 0) {
          const latest: any = newPresences[newPresences.length - 1];
          const st = (latest?.status as UserStatus) || 'online';
          const targetId = latest?.user_id || key;
          if (targetId && targetId !== user.id) {
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
        if (!payload?.userId || payload.userId === user.id) return;
        const st = (payload.status as UserStatus) || 'online';
        if (st === 'offline') {
          pingsRef.current.delete(payload.userId);
          pingsStatusRef.current.delete(payload.userId);
          setOnlineUsers((prev) => {
            if (!prev.has(payload.userId)) return prev;
            const next = new Map(prev);
            next.delete(payload.userId);
            return next;
          });
        } else {
          pingsRef.current.set(payload.userId, Date.now());
          pingsStatusRef.current.set(payload.userId, st);
          setOnlineUsers((prev) => {
            const next = new Map(prev);
            next.set(payload.userId, st);
            return next;
          });
        }
      })
      .on('broadcast', { event: 'presence_status_change' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === user.id) return;
        const st = (payload.status as UserStatus) || 'offline';
        if (st === 'offline') {
          pingsRef.current.delete(payload.userId);
          pingsStatusRef.current.delete(payload.userId);
          setOnlineUsers((prev) => {
            if (!prev.has(payload.userId)) return prev;
            const next = new Map(prev);
            next.delete(payload.userId);
            return next;
          });
        } else {
          pingsRef.current.set(payload.userId, Date.now());
          pingsStatusRef.current.set(payload.userId, st);
          setOnlineUsers((prev) => {
            const next = new Map(prev);
            next.set(payload.userId, st);
            return next;
          });
        }
      })
      .on('broadcast', { event: 'presence_leave' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === user.id) return;
        pingsRef.current.delete(payload.userId);
        pingsStatusRef.current.delete(payload.userId);
        setOnlineUsers((prev) => {
          if (!prev.has(payload.userId)) return prev;
          const next = new Map(prev);
          next.delete(payload.userId);
          return next;
        });
      })
      .on('broadcast', { event: 'request_presence_sync' }, () => {
        if (channel.state === 'joined') {
          channel.send({
            type: 'broadcast',
            event: 'presence_ping',
            payload: {
              userId: user.id,
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
          if (updatedProfile?.id && updatedProfile.id !== user.id) {
            const newStatus = (updatedProfile.status as UserStatus) || 'offline';
            if (newStatus === 'offline') {
              pingsRef.current.delete(updatedProfile.id);
              pingsStatusRef.current.delete(updatedProfile.id);
              setOnlineUsers((prev) => {
                if (!prev.has(updatedProfile.id)) return prev;
                const next = new Map(prev);
                next.delete(updatedProfile.id);
                return next;
              });
            } else {
              pingsRef.current.set(updatedProfile.id, Date.now());
              pingsStatusRef.current.set(updatedProfile.id, newStatus);
              setOnlineUsers((prev) => {
                const next = new Map(prev);
                next.set(updatedProfile.id, newStatus);
                return next;
              });
            }
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (profileStatusRef.current !== 'offline') {
            await channel.track({
              user_id: user.id,
              status: profileStatusRef.current,
              online_at: new Date().toISOString(),
            }).catch(() => {});
          }

          channel.send({
            type: 'broadcast',
            event: 'presence_ping',
            payload: { userId: user.id, status: profileStatusRef.current },
          }).catch(() => {});

          channel.send({
            type: 'broadcast',
            event: 'request_presence_sync',
            payload: { requesterId: user.id },
          }).catch(() => {});
        }
      });

    // 8-second lightweight presence heartbeat
    const heartbeatTimer = setInterval(() => {
      if (channel.state === 'joined') {
        channel.send({
          type: 'broadcast',
          event: 'presence_ping',
          payload: { userId: user.id, status: profileStatusRef.current },
        }).catch(() => {});
      }
    }, 8000);

    // 2.5-second live sweep timer to evict disconnected peers immediately without requiring refresh
    const sweepTimer = setInterval(() => {
      const now = Date.now();
      let hasExpired = false;
      pingsRef.current.forEach((timestamp, peerId) => {
        if (now - timestamp >= 16000) {
          pingsRef.current.delete(peerId);
          pingsStatusRef.current.delete(peerId);
          hasExpired = true;
        }
      });
      if (hasExpired) {
        updatePresenceState();
      }
    }, 2500);

    const handleWindowFocus = () => {
      if (channel.state === 'joined') {
        if (profileStatusRef.current !== 'offline') {
          channel.track({
            user_id: user.id,
            status: profileStatusRef.current,
            online_at: new Date().toISOString(),
          }).catch(() => {});
        }
        channel.send({
          type: 'broadcast',
          event: 'presence_ping',
          payload: { userId: user.id, status: profileStatusRef.current },
        }).catch(() => {});
      }
    };

    const handleBeforeUnload = () => {
      try {
        channel.send({
          type: 'broadcast',
          event: 'presence_leave',
          payload: { userId: user.id },
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
      clearInterval(heartbeatTimer);
      clearInterval(sweepTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleWindowFocus);
        document.removeEventListener('visibilitychange', handleWindowFocus);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      try {
        channel.send({
          type: 'broadcast',
          event: 'presence_leave',
          payload: { userId: user.id },
        }).catch(() => {});
        channel.untrack();
      } catch {}
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isConfigured, supabase]);

  // 2. Synchronize presence status without destroying/recreating the channel
  React.useEffect(() => {
    if (!user || !profile?.status) return;
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
  }, [profile?.status, user]);

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
