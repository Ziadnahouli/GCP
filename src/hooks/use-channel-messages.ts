'use client';

import * as React from 'react';
import { ChannelMessage } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';

const STORAGE_KEY_PREFIX = 'nexus_channel_msgs_';

export function useChannelMessages(channelId: string | null) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = React.useState<ChannelMessage[]>([]);

  // Load from cache or Supabase
  React.useEffect(() => {
    if (!channelId) {
      setMessages([]);
      return;
    }

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${channelId}`);
      if (stored) {
        setMessages(JSON.parse(stored));
        return;
      }
    } catch (e) {
      console.warn('Failed to parse cached channel messages:', e);
    }

    setMessages([]);
  }, [channelId]);

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

      const newMsg: ChannelMessage = {
        id: `cmsg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        channel_id: channelId,
        user_id: user?.id || 'current-user',
        content: content.trim(),
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

      const updated = [...messages, newMsg];
      saveMessages(updated);

      if (user && supabase) {
        try {
          await supabase.from('channel_messages').insert({
            id: newMsg.id,
            channel_id: channelId,
            user_id: user.id,
            content: newMsg.content,
          });
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
