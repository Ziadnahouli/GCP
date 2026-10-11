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

  const chatChannelRef = React.useRef<any>(null);

  const isUUID = React.useMemo(() => {
    return conversationId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId) : false;
  }, [conversationId]);

  // Fetch messages with attachments and reactions
  const fetchMessages = React.useCallback(async (isInitial = false) => {
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

    // If conversationId is not a UUID, load from cached messages
    if (!isUUID) {
      try {
        const cached = localStorage.getItem(`nexus_dm_msgs_${conversationId}`);
        if (cached) {
          setMessages(JSON.parse(cached));
        }
      } catch {}
      setIsLoading(false);
      return;
    }

    try {
      if (isInitial) {
        setIsLoading(true);
      }

      const { data: msgsData, error: msgsErr } = await supabase
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
        .order('created_at', { ascending: true });

      if (msgsErr) {
        console.warn('Error fetching messages from database:', msgsErr);
        try {
          const cached = localStorage.getItem(`nexus_dm_msgs_${conversationId}`);
          if (cached) setMessages(JSON.parse(cached));
        } catch {}
        return;
      }

      if (!msgsData || msgsData.length === 0) {
        try {
          const cached = localStorage.getItem(`nexus_dm_msgs_${conversationId}`);
          if (cached) setMessages(JSON.parse(cached));
          else setMessages([]);
        } catch {
          setMessages([]);
        }
        return;
      }

      const msgIds = msgsData.map((m) => m.id);

      const [attachmentsRes, reactionsRes] = await Promise.all([
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
          .in('message_id', msgIds),
      ]);

      const parsed: Message[] = msgsData.map((m) => {
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
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, user, supabase, isUUID]);

  // Realtime channel subscriptions
  React.useEffect(() => {
    fetchMessages();

    if (!conversationId || !isConfigured || !user) return;

    const channel = supabase
      .channel(`chat-room-${conversationId}`, {
        config: {
          broadcast: { self: false },
        },
      })
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
      .on('broadcast', { event: 'new_msg' }, ({ payload }) => {
        if (payload?.message) {
          const incomingMsg = payload.message as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incomingMsg.id)) return prev;
            return [...prev, incomingMsg];
          });
        }
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

    chatChannelRef.current = channel;

    // High-frequency auto-sync polling every 2.5s to ensure delivery across tabs/devices
    const syncInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchMessages();
    }, 2500);

    return () => {
      clearInterval(syncInterval);
      chatChannelRef.current = null;
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
      let confirmedId = `msg-${Date.now()}`;

      // Only attempt database insert if conversationId is a valid UUID
      if (isUUID) {
        // 0. Ensure sender is registered in conversation_members for RLS check
        try {
          await supabase.from('conversation_members').upsert(
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: 'member',
            },
            { onConflict: 'conversation_id,user_id', ignoreDuplicates: true }
          );
        } catch (cmErr) {
          console.warn('Membership ensure warning:', cmErr);
        }

        // Sanitize reply_to_id (null if empty, none, or optimistic ID)
        const cleanReplyId =
          replyToId && replyToId.trim() !== '' && !replyToId.startsWith('opt-')
            ? replyToId
            : null;

        const insertPayload: {
          conversation_id: string;
          sender_id: string;
          content: string;
          reply_to_id?: string | null;
        } = {
          conversation_id: conversationId,
          sender_id: user.id,
          content: trimmed,
        };
        if (cleanReplyId) {
          insertPayload.reply_to_id = cleanReplyId;
        }

        // 1. Insert message with .select('id') (avoiding .single() PGRST116 throw)
        const { data: msgRows, error: msgErr } = await supabase
          .from('messages')
          .insert(insertPayload)
          .select('id');

        if (msgErr) {
          console.warn('Database message insert warning:', msgErr);
        } else if (msgRows?.[0]?.id) {
          confirmedId = msgRows[0].id;
        }
      }

      const confirmedMsg: Message = {
        ...optMsg,
        id: confirmedId,
      };

      // 2. Upload any attachments and insert to message_attachments
      if (files.length > 0 && isUUID) {
        for (const file of files) {
          try {
            const uploadRes = await uploadAttachmentFile({
              file,
              conversationId,
              userId: user.id,
            });

            if (uploadRes.storagePath) {
              await supabase.from('message_attachments').insert({
                message_id: confirmedId,
                conversation_id: conversationId,
                file_name: file.name,
                file_type: file.type || 'application/octet-stream',
                file_size: file.size,
                storage_path: uploadRes.storagePath,
              });
            }
          } catch (attErr) {
            console.warn('Attachment upload failed:', attErr);
          }
        }
      }

      // Update optimistic message with confirmed ID and cache to localStorage
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === optId ? confirmedMsg : m));
        try {
          localStorage.setItem(`nexus_dm_msgs_${conversationId}`, JSON.stringify(next));
        } catch {}
        return next;
      });

      // 3. Broadcast to peers on active channel for instantaneous cross-device delivery
      if (chatChannelRef.current) {
        chatChannelRef.current
          .send({
            type: 'broadcast',
            event: 'new_msg',
            payload: { message: confirmedMsg },
          })
          .catch((bcErr: unknown) => {
            console.warn('Realtime broadcast warning:', bcErr);
          });
      }

      // 4. Broadcast conversation update so sidebar updates immediately
      try {
        const convListChannel = supabase.channel('conversations-realtime');
        convListChannel
          .send({
            type: 'broadcast',
            event: 'conv_update',
            payload: { conversationId, lastMessage: confirmedMsg },
          })
          .catch(() => {});
      } catch {}

      // Update conversation updated_at timestamp
      supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(() => {}, () => {});

      fetchMessages().catch(() => {});
      return { error: null };
    } catch (err: unknown) {
      console.error('Send message failed:', err);
      setMessages((prev) => prev.filter((m) => m.id !== optId));
      return { error: err instanceof Error ? err.message : 'Failed to send message' };
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
    if (chatChannelRef.current) {
      chatChannelRef.current
        .send({
          type: 'broadcast',
          event: 'typing',
          payload: { username: profile.display_name || profile.username },
        })
        .catch(() => {});
    }
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
