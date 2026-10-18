'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import type { UserSettings } from '@/lib/types/profile';

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'friend_request' | 'mention' | 'message' | 'call' | 'missed_call' | 'server_invitation' | 'reply' | 'system';
  data?: {
    conversation_id?: string;
    server_id?: string;
    channel_id?: string;
    sender_id?: string;
    sender_name?: string;
    url?: string;
    [key: string]: any;
  } | null;
  is_read: boolean;
  created_at: string;
}

const LOCAL_NOTIFS_KEY = 'nexus_notifications_v1';

export function isNotificationCategoryEnabled(
  type: NotificationItem['type'],
  settings?: Partial<UserSettings> | null
): boolean {
  if (!settings) return true;
  switch (type) {
    case 'message':
    case 'reply':
      return settings.notif_dms !== false;
    case 'mention':
      return settings.notif_mentions !== false;
    case 'friend_request':
      return settings.notif_friend_requests !== false;
    case 'server_invitation':
      return settings.notif_invites !== false;
    case 'call':
    case 'missed_call':
      return settings.notif_missed_calls !== false;
    case 'system':
    default:
      return true;
  }
}

export function useNotifications() {
  const { user, settings, isConfigured } = useAuth();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const seenIdsRef = React.useRef<Set<string>>(new Set());

  const settingsRef = React.useRef(settings);
  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const activeResourceIdRef = React.useRef<string | null>(null);
  const setActiveResource = React.useCallback((id: string | null) => {
    activeResourceIdRef.current = id;
  }, []);

  const isCategoryEnabled = React.useCallback(
    (type: NotificationItem['type']) => isNotificationCategoryEnabled(type, settingsRef.current),
    []
  );

  // Play subtle incoming notification chime using Web Audio API
  const playNotificationChime = React.useCallback(() => {
    if (!settingsRef.current?.sound_effects_enabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12); // E5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch {}
  }, []);

  // Display browser desktop notification if enabled and permitted
  const displayDesktopNotification = React.useCallback(
    (item: NotificationItem) => {
      if (!settingsRef.current?.desktop_notifications) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;

      if (Notification.permission === 'granted') {
        try {
          const n = new Notification(item.title, {
            body: item.message,
            icon: '/icon.png',
            tag: item.id,
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch (err) {
          console.warn('[Notifications] Desktop notification display error:', err);
        }
      }
    },
    []
  );

  // Load notifications
  const loadNotifications = React.useCallback(async () => {
    seenIdsRef.current.clear();

    if (!user) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    if (!isConfigured) {
      try {
        const stored = localStorage.getItem(`${LOCAL_NOTIFS_KEY}_${user.id}`);
        if (stored) {
          const parsed: NotificationItem[] = JSON.parse(stored);
          setNotifications(parsed);
          parsed.forEach((n) => seenIdsRef.current.add(n.id));
        } else {
          setNotifications([]);
        }
      } catch {
        setNotifications([]);
      }
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[Notifications] Fetch notice:', error.message);
      } else if (data) {
        setNotifications(data as NotificationItem[]);
        data.forEach((n: any) => seenIdsRef.current.add(n.id));
      }
    } catch (err) {
      console.warn('[Notifications] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, isConfigured, supabase]);

  // Account switching and initial load
  React.useEffect(() => {
    seenIdsRef.current.clear();
    setNotifications([]);
    setIsLoading(true);
    loadNotifications();
  }, [user?.id, loadNotifications]);

  // Realtime subscription for incoming notifications
  React.useEffect(() => {
    if (!user || !isConfigured || !supabase) return;

    const channel = supabase
      .channel(`user_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newItem = payload.new as NotificationItem;
          if (newItem && !seenIdsRef.current.has(newItem.id)) {
            seenIdsRef.current.add(newItem.id);

            // If the user is actively viewing this exact conversation or channel, auto-mark as read and suppress chimes
            const isActive =
              Boolean(activeResourceIdRef.current) &&
              (activeResourceIdRef.current === newItem.data?.conversation_id ||
                activeResourceIdRef.current === newItem.data?.channel_id);

            if (isActive) {
              newItem.is_read = true;
              setNotifications((prev) => [newItem, ...prev.filter((p) => p.id !== newItem.id)]);
              supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', newItem.id)
                .then(() => {}, () => {});
              return;
            }

            setNotifications((prev) => [newItem, ...prev.filter((p) => p.id !== newItem.id)]);

            // Respect category preference
            if (isCategoryEnabled(newItem.type)) {
              playNotificationChime();
              displayDesktopNotification(newItem);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const updated = payload.new as NotificationItem;
          if (updated) {
            setNotifications((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          if (payload.old?.id) {
            seenIdsRef.current.delete(payload.old.id);
            setNotifications((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isConfigured, supabase, playNotificationChime, displayDesktopNotification, isCategoryEnabled]);

  // Mark single notification as read
  const markAsRead = React.useCallback(
    async (id: string) => {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        if (!isConfigured && user) {
          try {
            localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(next));
          } catch {}
        }
        return next;
      });

      if (!isConfigured || !user) return;

      try {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', id)
          .eq('user_id', user.id);
        if (error) {
          console.warn('[Notifications] Failed to mark as read:', error.message);
        }
      } catch (err) {
        console.warn('[Notifications] Failed to mark as read:', err);
      }
    },
    [isConfigured, user, supabase]
  );

  // Mark all notifications as read
  const markAllAsRead = React.useCallback(async () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, is_read: true }));
      if (!isConfigured && user) {
        try {
          localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(next));
        } catch {}
      }
      return next;
    });

    if (!isConfigured || !user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (error) {
        console.warn('[Notifications] Failed to mark all as read:', error.message);
      }
    } catch (err) {
      console.warn('[Notifications] Failed to mark all as read:', err);
    }
  }, [isConfigured, user, supabase]);

  // Delete notification
  const deleteNotification = React.useCallback(
    async (id: string) => {
      seenIdsRef.current.delete(id);
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== id);
        if (!isConfigured && user) {
          try {
            localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(next));
          } catch {}
        }
        return next;
      });

      if (!isConfigured || !user) return;

      try {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
        if (error) {
          console.warn('[Notifications] Failed to delete notification:', error.message);
        }
      } catch (err) {
        console.warn('[Notifications] Failed to delete notification:', err);
      }
    },
    [isConfigured, user, supabase]
  );

  // Clear all notifications
  const clearAll = React.useCallback(async () => {
    seenIdsRef.current.clear();
    setNotifications([]);

    if (!isConfigured || !user) {
      if (user) {
        try {
          localStorage.removeItem(`${LOCAL_NOTIFS_KEY}_${user.id}`);
        } catch {}
      }
      return;
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);
      if (error) {
        console.warn('[Notifications] Failed to clear notifications:', error.message);
      }
    } catch (err) {
      console.warn('[Notifications] Failed to clear notifications:', err);
    }
  }, [isConfigured, user, supabase]);

  // Create notification helper
  const createNotification = React.useCallback(
    async (item: Omit<NotificationItem, 'id' | 'is_read' | 'created_at'>) => {
      if (!user) return;
      const newItem: NotificationItem = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `notif_${Date.now()}`,
        user_id: user.id,
        title: item.title,
        message: item.message,
        type: item.type,
        data: item.data || {},
        is_read: false,
        created_at: new Date().toISOString(),
      };

      seenIdsRef.current.add(newItem.id);
      setNotifications((prev) => {
        const next = [newItem, ...prev.filter((p) => p.id !== newItem.id)];
        if (!isConfigured) {
          try {
            localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(next));
          } catch {}
        }
        return next;
      });

      playNotificationChime();
      displayDesktopNotification(newItem);

      if (!isConfigured) return;

      try {
        const { error } = await supabase.from('notifications').insert({
          id: newItem.id,
          user_id: user.id,
          title: item.title,
          message: item.message,
          type: item.type,
          data: item.data || {},
          is_read: false,
        });
        if (error) {
          console.warn('[Notifications] Failed to create notification:', error.message);
        }
      } catch (err) {
        console.warn('[Notifications] Failed to create notification:', err);
      }
    },
    [user, isConfigured, supabase, playNotificationChime, displayDesktopNotification]
  );

  const unreadCount = React.useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    createNotification,
    refresh: loadNotifications,
    setActiveResource,
    isNotificationCategoryEnabled: isCategoryEnabled,
  };
}
