'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserStatus } from '@/lib/types/profile';
import { RealtimeChannel } from '@supabase/supabase-js';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { resolveMultiSourcePresence } from '@/features/presence/presence-resolver';
import { setBoundedMap } from '@/lib/utils';

const MAX_PRESENCE_ENTRIES = 1000;

type PresenceListener = () => void;

class PresenceStore {
  private statusMap: Map<string, UserStatus> = new Map();
  private listeners: Set<PresenceListener> = new Set();
  private userListeners: Map<string, Set<() => void>> = new Map();
  private hasSynced: boolean = false;

  getStatus(userId: string | null | undefined): UserStatus {
    if (!userId) return 'offline';
    return this.statusMap.get(userId) || 'offline';
  }

  hasUser(userId: string | null | undefined): boolean {
    if (!userId) return false;
    return this.statusMap.has(userId);
  }

  setStatus(userId: string, status: UserStatus) {
    if (!userId) return;
    const current = this.statusMap.get(userId);
    if (current === status) return;
    if (status === 'offline') {
      this.statusMap.delete(userId);
    } else {
      this.statusMap.set(userId, status);
    }
    const userSubs = this.userListeners.get(userId);
    if (userSubs) {
      userSubs.forEach((cb) => cb());
    }
    this.listeners.forEach((cb) => cb());
  }

  isOnline(userId: string | null | undefined): boolean {
    const s = this.getStatus(userId);
    return s === 'online' || s === 'idle' || s === 'dnd';
  }

  isSynced(): boolean {
    return this.hasSynced;
  }

  setHasSynced(synced: boolean) {
    if (this.hasSynced !== synced) {
      this.hasSynced = synced;
      this.listeners.forEach((cb) => cb());
    }
  }

  getSnapshot = (): Map<string, UserStatus> => {
    return this.statusMap;
  };

  subscribe = (listener: PresenceListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribeUser = (userId: string, listener: () => void): (() => void) => {
    if (!this.userListeners.has(userId)) {
      this.userListeners.set(userId, new Set());
    }
    const set = this.userListeners.get(userId)!;
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.userListeners.delete(userId);
      }
    };
  };

  setEntireMap(newMap: Map<string, UserStatus>) {
    const changedUserIds = new Set<string>();
    newMap.forEach((st, uid) => {
      if (this.statusMap.get(uid) !== st) {
        changedUserIds.add(uid);
      }
    });
    this.statusMap.forEach((_, uid) => {
      if (!newMap.has(uid)) {
        changedUserIds.add(uid);
      }
    });

    if (changedUserIds.size === 0) return;

    this.statusMap = newMap;

    changedUserIds.forEach((uid) => {
      const userSubs = this.userListeners.get(uid);
      if (userSubs) {
        userSubs.forEach((cb) => cb());
      }
    });
    this.listeners.forEach((cb) => cb());
  }
}

export const globalPresenceStore = new PresenceStore();

interface PresenceContextType {
  onlineUsers: Map<string, UserStatus>;
  getUserStatus: (userId: string | null | undefined, fallbackStatus?: UserStatus) => UserStatus;
  isUserOnline: (userId: string | null | undefined) => boolean;
  hasSynced: boolean;
}

const PresenceContext = React.createContext<PresenceContextType>({
  onlineUsers: new Map(),
  getUserStatus: () => 'offline',
  isUserOnline: () => false,
  hasSynced: false,
});

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isConfigured } = useAuth();
  const supabase = React.useMemo(() => getBrowserClient(), []);
  const [onlineUsers, setOnlineUsers] = React.useState<Map<string, UserStatus>>(new Map());
  const [hasSynced, setHasSynced] = React.useState<boolean>(false);

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
          private: true,
          broadcast: { self: true },
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

      // Retain peers from active pings within the last 30s and prune stale pings
      const now = Date.now();
      pingsRef.current.forEach((timestamp, peerId) => {
        if (now - timestamp < 30000) {
          const st = pingsStatusRef.current.get(peerId) || 'online';
          if (!userPresences.has(peerId)) {
            userPresences.set(peerId, []);
          }
          userPresences.get(peerId)!.push({ status: st, timestamp });
        } else {
          pingsRef.current.delete(peerId);
          pingsStatusRef.current.delete(peerId);
        }
      });

      // Resolve each user to a single, stable presence status
      userPresences.forEach((entries, uid) => {
        const resolved = resolveMultiSourcePresence(entries);
        if (resolved !== 'offline') {
          currentMap.set(uid, resolved);
        }
      });

      globalPresenceStore.setEntireMap(currentMap);
      globalPresenceStore.setHasSynced(true);
      setHasSynced(true);
      setOnlineUsers(currentMap);
    };

    // Debounced update to prevent flapping / re-render storms (C7)
    const updatePresenceState = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(performUpdate, 150);
    };

    channel
      .on('presence', { event: 'sync' }, performUpdate)
      .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
        if (Array.isArray(newPresences) && newPresences.length > 0) {
          const latest: any = newPresences[newPresences.length - 1];
          const st = (latest?.status as UserStatus) || 'online';
          const targetId = latest?.user_id || key;
          if (targetId && targetId !== userId) {
            setBoundedMap(pingsRef.current, targetId, Date.now(), MAX_PRESENCE_ENTRIES);
            setBoundedMap(pingsStatusRef.current, targetId, st, MAX_PRESENCE_ENTRIES);
          }
        }
        performUpdate();
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
        performUpdate();
      })
      .on('broadcast', { event: 'presence_ping' }, ({ payload }) => {
        if (!payload?.userId) return;
        const st = (payload.status as UserStatus) || 'online';
        if (payload.userId !== userId) {
          if (st === 'offline') {
            pingsRef.current.delete(payload.userId);
            pingsStatusRef.current.delete(payload.userId);
          } else {
            setBoundedMap(pingsRef.current, payload.userId, Date.now(), MAX_PRESENCE_ENTRIES);
            setBoundedMap(pingsStatusRef.current, payload.userId, st, MAX_PRESENCE_ENTRIES);
          }
        }
        globalPresenceStore.setStatus(payload.userId, st);
        updatePresenceState();
      })
      .on('broadcast', { event: 'presence_status_change' }, ({ payload }) => {
        if (!payload?.userId) return;
        const st = (payload.status as UserStatus) || 'offline';
        const now = Date.now();
        if (payload.userId !== userId) {
          if (st === 'offline') {
            pingsRef.current.delete(payload.userId);
            pingsStatusRef.current.delete(payload.userId);
          } else {
            setBoundedMap(pingsRef.current, payload.userId, now, MAX_PRESENCE_ENTRIES);
            setBoundedMap(pingsStatusRef.current, payload.userId, st, MAX_PRESENCE_ENTRIES);
          }
        }
        // Immediate synchronous status update in store
        globalPresenceStore.setStatus(payload.userId, st);
        updatePresenceState();
      })
      .on('broadcast', { event: 'presence_leave' }, ({ payload }) => {
        if (!payload?.userId) return;
        if (payload.userId !== userId) {
          pingsRef.current.delete(payload.userId);
          pingsStatusRef.current.delete(payload.userId);
        }
        globalPresenceStore.setStatus(payload.userId, 'offline');
        updatePresenceState();
      })
      .on('broadcast', { event: 'request_presence_sync' }, () => {
        if (channel) {
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
      .subscribe(async (status, err) => {
        if (typeof window !== 'undefined') {
          console.log(`[Presence] 'nexus-global-presence' channel status: ${status}`, err || '');
        }
        if (status === 'SUBSCRIBED') {
          if (profileStatusRef.current !== 'offline') {
            await channel.track({
              user_id: userId,
              status: profileStatusRef.current,
              online_at: new Date().toISOString(),
            }).catch((e) => console.warn('[Presence] track error:', e));
          }

          channel.send({
            type: 'broadcast',
            event: 'presence_ping',
            payload: { userId, status: profileStatusRef.current },
          }).catch((e) => console.warn('[Presence] ping error:', e));

          channel.send({
            type: 'broadcast',
            event: 'request_presence_sync',
            payload: { requesterId: userId },
          }).catch((e) => console.warn('[Presence] sync request error:', e));
        }
      });

    // C6: Lightweight 30s presence heartbeat (only when tab is visible)
    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && channel) {
        channel.send({
          type: 'broadcast',
          event: 'presence_ping',
          payload: { userId, status: profileStatusRef.current },
        }).catch(() => {});
      }
    }, 30000);

    const handleWindowFocus = () => {
      if (channel) {
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
    if (channel) {
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
    (userId: string | null | undefined, fallbackStatus?: UserStatus): UserStatus => {
      if (!userId) return 'offline';
      if (user && userId === user.id) {
        return profile?.status || 'online';
      }
      if (globalPresenceStore.hasUser(userId)) {
        return globalPresenceStore.getStatus(userId);
      }
      if (fallbackStatus) {
        return fallbackStatus;
      }
      return 'offline';
    },
    [user, profile?.status]
  );

  const isUserOnline = React.useCallback(
    (userId: string | null | undefined): boolean => {
      const s = getUserStatus(userId);
      return s === 'online' || s === 'idle' || s === 'dnd';
    },
    [getUserStatus]
  );

  const value = React.useMemo<PresenceContextType>(() => ({
    onlineUsers,
    getUserStatus,
    isUserOnline,
    hasSynced,
  }), [onlineUsers, getUserStatus, isUserOnline, hasSynced]);

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useUserPresence(userId: string | null | undefined, fallbackStatus?: UserStatus): UserStatus {
  const { user, profile } = useAuth();
  const isMe = Boolean(user && userId === user.id);

  const subscribe = React.useCallback(
    (callback: () => void) => {
      if (!userId || isMe) return () => {};
      return globalPresenceStore.subscribeUser(userId, callback);
    },
    [userId, isMe]
  );

  const getSnapshot = React.useCallback(() => {
    if (isMe) return profile?.status || 'online';
    if (!userId) return 'offline';
    if (globalPresenceStore.hasUser(userId)) {
      return globalPresenceStore.getStatus(userId);
    }
    if (fallbackStatus) {
      return fallbackStatus;
    }
    return 'offline';
  }, [userId, isMe, profile?.status, fallbackStatus]);

  return React.useSyncExternalStore(subscribe, getSnapshot, () => 'offline');
}

export function usePresence(): PresenceContextType;
export function usePresence(userId: string | null | undefined): UserStatus;
export function usePresence(userId?: string | null | undefined): PresenceContextType | UserStatus {
  const context = React.useContext(PresenceContext);
  const singleStatus = useUserPresence(userId);

  if (userId !== undefined) {
    return singleStatus;
  }
  return context;
}
