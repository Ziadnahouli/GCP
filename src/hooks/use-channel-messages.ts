'use client';

import * as React from 'react';
import { ChannelMessage } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';

const STORAGE_KEY_PREFIX = 'nexus_channel_msgs_';

export function useChannelMessages(channelId: string | null) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = React.useState<ChannelMessage[]>([]);
  const channelRef = React.useRef<any>(null);

  const fetchChannelMessages = React.useCallback(async () => {
    if (!channelId) {
      setMessages([]);
      return;
    }

    try {
      // 1. Try fetching from Supabase
      if (user && supabase) {
        const { data, error } = await supabase
          .from('channel_messages')
          .select(`
            id, channel_id, user_id, content, created_at, updated_at,
            profile:user_id (
              id, username, display_name, avatar_url, banner_url, banner_color,
              bio, custom_status, status, game_activity, created_at, updated_at
            )
          `)
          .eq('channel_id', channelId)
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          const parsed: ChannelMessage[] = data.map((m) => ({
            id: m.id,
            channel_id: m.channel_id,
            user_id: m.user_id,
            content: m.content,
            created_at: m.created_at,
            updated_at: m.updated_at,
            profile: (m.profile as unknown as UserProfile) || undefined,
          }));

          setMessages(parsed);
          try {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${channelId}`, JSON.stringify(parsed));
          } catch {}
          return;
        }
      }

      // Fallback to cached messages
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${channelId}`);
      if (stored) {
        setMessages(JSON.parse(stored));
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.warn('Failed to fetch channel messages:', e);
    }
  }, [channelId, user]);

  React.useEffect(() => {
    fetchChannelMessages();

    if (!channelId || !supabase) return;

    // Realtime postgres changes + broadcast channel
    const channel = supabase
      .channel(`chan-room-${channelId}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => fetchChannelMessages()
      )
      .on('broadcast', { event: 'new_channel_msg' }, ({ payload }) => {
        if (payload?.message) {
          const incoming = payload.message as ChannelMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            const next = [...prev, incoming];
            try {
              localStorage.setItem(`${STORAGE_KEY_PREFIX}${channelId}`, JSON.stringify(next));
            } catch {}
            return next;
          });
        }
        fetchChannelMessages();
      })
      .subscribe();

    channelRef.current = channel;

    const autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchChannelMessages();
    }, 2500);

    return () => {
      clearInterval(autoSyncTimer);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [channelId, fetchChannelMessages]);

  const saveMessages = React.useCallback(
    (msgs: ChannelMessage[]) => {
      setMessages(msgs);
      if (!channelId) return;
      try {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${channelId}`, JSON.stringify(msgs));
      } catch (e) {
        console.warn('Failed to save channel messages:', e);
      }
    },
    [channelId]
  );

  const sendMessage = React.useCallback(
    async (content: string) => {
      if (!channelId || !content.trim()) return;

      const trimmed = content.trim();
      const messageId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8005-${Date.now().toString(16).padStart(12, '0')}`;

      const newMsg: ChannelMessage = {
        id: messageId,
        channel_id: channelId,
        user_id: user?.id || 'current-user',
        content: trimmed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile: profile || {
          id: user?.id || 'current-user',
          username: 'gamer',
          display_name: 'Gamer One',
          avatar_url: null,
          banner_url: null,
          banner_color: '#7c3aed',
          bio: null,
          game_activity: null,
          status: 'online',
          custom_status: null,
          created_at: '',
          updated_at: '',
        },
      };

      // Optimistic instant append (0ms latency)
      const updated = [...messages, newMsg];
      saveMessages(updated);

      // Broadcast immediately to channel peers for real-time delivery
      if (channelRef.current) {
        channelRef.current
          .send({
            type: 'broadcast',
            event: 'new_channel_msg',
            payload: { message: newMsg },
          })
          .catch((err: unknown) => {
            console.warn('Channel broadcast warning:', err);
          });
      }

      // If channel is a valid UUID, persist to Supabase
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId);
      if (user && supabase && isUUID) {
        try {
          const { error: msgErr } = await supabase.from('channel_messages').insert({
            id: newMsg.id,
            channel_id: channelId,
            user_id: user.id,
            content: newMsg.content,
          });
          if (msgErr) {
            console.warn('Supabase channel message insert warning:', msgErr);
          }
        } catch (e) {
          console.warn('Supabase channel message insert failed:', e);
        }
      }
    },
    [channelId, messages, user, profile, saveMessages]
  );

  return {
    messages,
    sendMessage,
  };
}
