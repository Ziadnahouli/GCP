'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { Message, MessageAttachment, MessageReaction } from '@/lib/types/messaging';
import { UserProfile } from '@/lib/types/profile';
import { uploadAttachmentFile } from '@/lib/storage/upload';

export function useMessages(conversationId: string | null) {
  const { user, profile, isConfigured } = useAuth();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showPinnedOnly, setShowPinnedOnly] = React.useState(false);

  // Fetch messages with attachments and reactions
  const fetchMessages = React.useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    if (!user) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const [msgsRes, attachmentsRes, reactionsRes] = await Promise.all([
        supabase
          .from('messages')
          .select(`
            id, conversation_id, sender_id, content, reply_to_id,
            is_pinned, is_edited, created_at, updated_at,
            sender:sender_id (
              id, username, display_name, avatar_url, banner_url, banner_color,
              bio, custom_status, status, game_activity, created_at, updated_at
            )
          `)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),

        supabase
          .from('message_attachments')
          .select('*')
          .eq('conversation_id', conversationId),

        supabase
          .from('message_reactions')
          .select(`
            id, message_id, user_id, emoji, created_at,
            profile:user_id (display_name, username)
          `)
          .in(
            'message_id',
            (
              await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conversationId)
            ).data?.map((m) => m.id) || []
          ),
      ]);

      if (msgsRes.data) {
        const parsed: Message[] = msgsRes.data.map((m) => {
          // Attachments
          const mAttachments: MessageAttachment[] = (attachmentsRes.data || [])
            .filter((a) => a.message_id === m.id)
            .map((a) => {
              const { data: urlData } = supabase.storage
                .from('attachments')
                .getPublicUrl(a.storage_path);
              return {
                ...a,
                url: urlData?.publicUrl || undefined,
              };
            });

          // Reactions grouped by emoji
          const rawReactions = (reactionsRes.data || []).filter((r) => r.message_id === m.id);
          const reactionMap = new Map<string, { count: number; has_reacted: boolean; users: string[] }>();

          rawReactions.forEach((r) => {
            const existing = reactionMap.get(r.emoji) || { count: 0, has_reacted: false, users: [] };
            const userName =
              (r.profile as unknown as { display_name?: string })?.display_name || 'Gamer';
            existing.count += 1;
            existing.users.push(userName);
            if (r.user_id === user.id) existing.has_reacted = true;
            reactionMap.set(r.emoji, existing);
          });

          const mReactions: MessageReaction[] = Array.from(reactionMap.entries()).map(
            ([emoji, data]) => ({
              emoji,
              ...data,
            })
          );

          return {
            ...m,
            sender: m.sender as unknown as UserProfile,
            attachments: mAttachments,
            reactions: mReactions,
          };
        });

        setMessages(parsed);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isConfigured, user, supabase]);

  // Realtime channel subscriptions
  React.useEffect(() => {
    fetchMessages();

    if (!conversationId || !isConfigured || !user) return;

    const channel = supabase
      .channel(`chat-room-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => fetchMessages()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_attachments',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => fetchMessages()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        () => fetchMessages()
      )
      .on('broadcast', { event: 'new_msg' }, () => {
        fetchMessages();
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { username } = payload.payload;
        if (username && username !== profile?.username) {
          setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u !== username));
          }, 3000);
        }
      })
      .subscribe();

    // Auto-sync polling every 3.5s to ensure mobile/poor-connection real-time fidelity
    const syncInterval = setInterval(() => {
      fetchMessages();
    }, 3500);

    return () => {
      clearInterval(syncInterval);
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages, isConfigured, user, profile, supabase]);

  // Send message with optional file uploads
  const sendMessage = async (
    content: string,
    replyToId: string | null = null,
    files: File[] = []
  ) => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return { error: 'Empty content' };
    if (!conversationId) return { error: 'No conversation' };

    if (!isConfigured || !user) {
      // Local demo mode simulation
      const mockAttachments: MessageAttachment[] = files.map((f, i) => ({
        id: `att-mock-${Date.now()}-${i}`,
        message_id: `local-msg-${Date.now()}`,
        conversation_id: conversationId,
        file_name: f.name,
        file_type: f.type,
        file_size: f.size,
        storage_path: 'local/path',
        url: URL.createObjectURL(f),
        created_at: new Date().toISOString(),
      }));

      const newMsg: Message = {
        id: `local-msg-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user?.id || 'local-user-id',
        content: trimmed,
        reply_to_id: replyToId,
        is_pinned: false,
        is_edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender: profile || undefined,
        attachments: mockAttachments,
        reactions: [],
      };
      setMessages((prev) => [...prev, newMsg]);
      return { error: null };
    }

    // Optimistic local update for instantaneous message display (0ms lag)
    const optId = `opt-${Date.now()}`;
    const optMsg: Message = {
      id: optId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmed,
      reply_to_id: replyToId,
      is_pinned: false,
      is_edited: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender: profile || undefined,
      attachments: files.map((f, i) => ({
        id: `att-opt-${Date.now()}-${i}`,
        message_id: optId,
        conversation_id: conversationId,
        file_name: f.name,
        file_type: f.type,
        file_size: f.size,
        storage_path: '',
        url: URL.createObjectURL(f),
        created_at: new Date().toISOString(),
      })),
      reactions: [],
    };
    setMessages((prev) => [...prev, optMsg]);

    try {
      // 1. Insert message
      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: trimmed,
          reply_to_id: replyToId,
        })
        .select('id')
        .single();

      if (msgErr || !msgData) {
        // Rollback optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== optId));
        return { error: msgErr?.message || 'Failed to send message' };
      }

      // 2. Upload any attachments and insert to message_attachments
      if (files.length > 0) {
        for (const file of files) {
          const uploadRes = await uploadAttachmentFile({
            file,
            conversationId,
            userId: user.id,
          });

          if (uploadRes.storagePath) {
            await supabase.from('message_attachments').insert({
              message_id: msgData.id,
              conversation_id: conversationId,
              file_name: file.name,
              file_type: file.type || 'application/octet-stream',
              file_size: file.size,
              storage_path: uploadRes.storagePath,
            });
          }
        }
      }

      // 3. Broadcast to peers on channel for instant cross-device delivery
      supabase
        .channel(`chat-room-${conversationId}`)
        .send({
          type: 'broadcast',
          event: 'new_msg',
          payload: { messageId: msgData.id },
        })
        .catch(() => {});

      await fetchMessages();
      return { error: null };
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optId));
      return { error: 'Failed to send message' };
    }
  };

  // Add emoji reaction
  const addReaction = async (messageId: string, emoji: string) => {
    if (!isConfigured || !user) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions || [])];
          const existing = reactions.find((r) => r.emoji === emoji);
          if (existing) {
            existing.count += 1;
            existing.has_reacted = true;
          } else {
            reactions.push({ emoji, count: 1, has_reacted: true, users: ['You'] });
          }
          return { ...m, reactions };
        })
      );
      return;
    }

    await supabase.from('message_reactions').upsert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    });
    await fetchMessages();
  };

  // Remove emoji reaction
  const removeReaction = async (messageId: string, emoji: string) => {
    if (!isConfigured || !user) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = (m.reactions || [])
            .map((r) =>
              r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), has_reacted: false } : r
            )
            .filter((r) => r.count > 0);
          return { ...m, reactions };
        })
      );
      return;
    }

    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);

    await fetchMessages();
  };

  // Toggle Pin message
  const togglePinMessage = async (messageId: string, isCurrentlyPinned: boolean) => {
    const nextPinned = !isCurrentlyPinned;
    if (!isConfigured || !user) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned: nextPinned } : m))
      );
      return;
    }

    await supabase
      .from('messages')
      .update({ is_pinned: nextPinned })
      .eq('id', messageId);

    await fetchMessages();
  };

  // Broadcast typing
  const sendTyping = () => {
    if (!conversationId || !isConfigured || !profile) return;
    supabase.channel(`chat-room-${conversationId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { username: profile.display_name || profile.username },
    });
  };

  // Edit message
  const editMessage = async (messageId: string, newContent: string) => {
    if (!isConfigured || !user) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, content: newContent, is_edited: true } : m
        )
      );
      return { error: null };
    }

    const { error } = await supabase
      .from('messages')
      .update({ content: newContent, is_edited: true, updated_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_id', user.id);

    return { error: error?.message || null };
  };

  // Delete message
  const deleteMessage = async (messageId: string) => {
    if (!isConfigured || !user) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      return { error: null };
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', user.id);

    return { error: error?.message || null };
  };

  // Filtered messages by search query or pinned only
  const filteredMessages = React.useMemo(() => {
    return messages.filter((m) => {
      if (showPinnedOnly && !m.is_pinned) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesContent = m.content.toLowerCase().includes(q);
        const matchesSender = m.sender?.display_name.toLowerCase().includes(q);
        const matchesFile = m.attachments?.some((a) => a.file_name.toLowerCase().includes(q));
        return matchesContent || matchesSender || matchesFile;
      }
      return true;
    });
  }, [messages, searchQuery, showPinnedOnly]);

  return {
    messages: filteredMessages,
    rawMessages: messages,
    isLoading,
    typingUsers,
    searchQuery,
    setSearchQuery,
    showPinnedOnly,
    setShowPinnedOnly,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    togglePinMessage,
  };
}
