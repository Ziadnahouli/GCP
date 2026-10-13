'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserStatus } from '@/lib/types/profile';

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

  React.useEffect(() => {
    if (!user || !isConfigured) {
      setOnlineUsers(new Map());
      return;
    }

    const channel = supabase.channel('nexus-global-presence', {
      config: {
        broadcast: { self: false },
        presence: { key: user.id },
      },
    });

    const updatePresenceState = () => {
      const state = channel.presenceState();
      const nextMap = new Map<string, UserStatus>();

      Object.keys(state).forEach((key) => {
        const presences = state[key] as Array<{ status?: string; user_id?: string }> | undefined;
        if (presences && presences.length > 0) {
          const latest = presences[presences.length - 1];
          const st = (latest.status as UserStatus) || 'online';
          nextMap.set(key, st);
          if (latest.user_id) nextMap.set(latest.user_id, st);
        } else {
          nextMap.set(key, 'online');
        }
      });

      setOnlineUsers(nextMap);
    };

    channel
      .on('presence', { event: 'sync' }, updatePresenceState)
      .on('presence', { event: 'join' }, updatePresenceState)
      .on('presence', { event: 'leave' }, updatePresenceState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            status: profile?.status || 'online',
            online_at: new Date().toISOString(),
          });
        }
      });

    // Re-track when profile status changes
    if (channel.state === 'joined') {
      channel.track({
        user_id: user.id,
        status: profile?.status || 'online',
        online_at: new Date().toISOString(),
      }).catch(() => {});
    }

    const handleBeforeUnload = () => {
      try {
        channel.untrack();
      } catch {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      try {
        channel.untrack();
      } catch {}
      supabase.removeChannel(channel);
    };
  }, [user, isConfigured, profile?.status, supabase]);

  const getUserStatus = React.useCallback(
    (userId: string | null | undefined): UserStatus => {
      if (!userId) return 'offline';
      if (user && userId === user.id) {
        return profile?.status || 'online';
      }
      const live = onlineUsers.get(userId);
      return live || 'offline';
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
