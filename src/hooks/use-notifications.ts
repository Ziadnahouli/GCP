'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'friend_request' | 'mention' | 'message' | 'call' | 'system';
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

  // Initial load
  React.useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

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
            setNotifications((prev) => [newItem, ...prev.filter((p) => p.id !== newItem.id)]);
            playNotificationChime();
            displayDesktopNotification(newItem);
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
            setNotifications((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isConfigured, supabase, playNotificationChime, displayDesktopNotification]);

  // Mark single notification as read
  const markAsRead = React.useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );

      if (!isConfigured || !user) {
        if (user) {
          try {
            const updated = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
            localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(updated));
          } catch {}
        }
        return;
      }

      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', id)
          .eq('user_id', user.id);
      } catch (err) {
        console.warn('[Notifications] Failed to mark as read:', err);
      }
    },
    [isConfigured, user, supabase, notifications]
  );

  // Mark all notifications as read
  const markAllAsRead = React.useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

    if (!isConfigured || !user) {
      if (user) {
        try {
          const updated = notifications.map((n) => ({ ...n, is_read: true }));
          localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(updated));
        } catch {}
      }
      return;
    }

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
    } catch (err) {
      console.warn('[Notifications] Failed to mark all as read:', err);
    }
  }, [isConfigured, user, supabase, notifications]);

  // Delete notification
  const deleteNotification = React.useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));

      if (!isConfigured || !user) {
        if (user) {
          try {
            const updated = notifications.filter((n) => n.id !== id);
            localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(updated));
          } catch {}
        }
        return;
      }

      try {
        await supabase.from('notifications').delete().eq('id', id).eq('user_id', user.id);
      } catch (err) {
        console.warn('[Notifications] Failed to delete notification:', err);
      }
    },
    [isConfigured, user, supabase, notifications]
  );

  // Clear all notifications
  const clearAll = React.useCallback(async () => {
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
      await supabase.from('notifications').delete().eq('user_id', user.id);
    } catch (err) {
      console.warn('[Notifications] Failed to clear notifications:', err);
    }
  }, [isConfigured, user, supabase]);

  // Create notification helper (useful for local actions or testing)
  const createNotification = React.useCallback(
    async (item: Omit<NotificationItem, 'id' | 'is_read' | 'created_at'>) => {
      if (!user) return;
      const newItem: NotificationItem = {
        id: crypto.randomUUID(),
        user_id: user.id,
        title: item.title,
        message: item.message,
        type: item.type,
        data: item.data || {},
        is_read: false,
        created_at: new Date().toISOString(),
      };

      seenIdsRef.current.add(newItem.id);
      setNotifications((prev) => [newItem, ...prev]);
      playNotificationChime();
      displayDesktopNotification(newItem);

      if (!isConfigured) {
        try {
          const updated = [newItem, ...notifications];
          localStorage.setItem(`${LOCAL_NOTIFS_KEY}_${user.id}`, JSON.stringify(updated));
        } catch {}
        return;
      }

      try {
        await supabase.from('notifications').insert({
          id: newItem.id,
          user_id: user.id,
          title: item.title,
          message: item.message,
          type: item.type,
          data: item.data || {},
          is_read: false,
        });
      } catch (err) {
        console.warn('[Notifications] Failed to create notification:', err);
      }
    },
    [user, isConfigured, supabase, notifications, playNotificationChime, displayDesktopNotification]
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
  };
}
