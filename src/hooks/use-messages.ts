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
  const activeConversationIdRef = React.useRef<string | null>(conversationId);

  React.useEffect(() => {
    activeConversationIdRef.current = conversationId;
  }, [conversationId]);

  const isUUID = React.useMemo(() => {
    return conversationId
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)
      : false;
  }, [conversationId]);

  const cacheKey = React.useMemo(() => {
    if (!conversationId) return '';
    return user ? `nexus_dm_msgs_${user.id}_${conversationId}` : `nexus_dm_msgs_guest_${conversationId}`;
  }, [conversationId, user]);

  // Fetch messages with attachments and reactions
  const fetchMessages = React.useCallback(
    async (isInitial = false) => {
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

      // If conversationId is not a valid UUID in configured mode, do not pretend it's real
      if (!isUUID) {
        if (!isConfigured) {
          try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) setMessages(JSON.parse(cached));
          } catch {}
        } else {
          setMessages([]);
        }
        setIsLoading(false);
        return;
      }

      try {
        if (isInitial) {
          setIsLoading(true);
          // Clear previous messages immediately on conversation switch to prevent stale flash
          setMessages([]);
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

        // Stale response guard: ignore if user has switched conversation while query was in-flight
        if (activeConversationIdRef.current !== conversationId) return;

        if (msgsErr) {
          console.warn('Error fetching messages from database:', msgsErr);
          setIsLoading(false);
          return;
        }

        // Database is authoritative: an empty successful query must render an empty conversation
        if (!msgsData || msgsData.length === 0) {
          setMessages((prev) =>
            prev.filter(
              (m) =>
                (m.status === 'sending' || m.status === 'failed') &&
                m.conversation_id === conversationId
            )
          );
          try {
            if (cacheKey) localStorage.removeItem(cacheKey);
          } catch {}
          setIsLoading(false);
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

        if (activeConversationIdRef.current !== conversationId) return;

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
            status: 'sent' as const,
            sender: m.sender as unknown as UserProfile,
            attachments: mAttachments,
            reactions: mReactions,
          };
        });

        setMessages((prev) => {
          // Preserve any currently pending/sending messages while updating historical messages
          const pending = prev.filter(
            (m) =>
              (m.status === 'sending' || m.status === 'failed') &&
              m.conversation_id === conversationId
          );
          const combined = [...parsed];
          for (const p of pending) {
            if (!combined.some((c) => c.id === p.id)) {
              combined.push(p);
            }
          }
          return combined;
        });

        try {
          if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(parsed));
        } catch {}
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        if (activeConversationIdRef.current === conversationId) {
          setIsLoading(false);
        }
      }
    },
    [conversationId, user, supabase, isUUID, isConfigured, cacheKey]
  );

  // Realtime channel subscriptions
  React.useEffect(() => {
    fetchMessages(true);

    if (!conversationId || !isConfigured || !user || !isUUID) return;

    const channel = supabase
      .channel(`chat-room-${conversationId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow?.id) return;
          // Reconcile sender's message or fetch if from peer
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newRow.id);
            if (exists) return prev;
            // Peer message arrived: trigger refetch
            fetchMessages();
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => fetchMessages()
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const oldRow = payload.old as any;
          if (oldRow?.id) {
            setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
          } else {
            fetchMessages();
          }
        }
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
          if (incomingMsg.conversation_id !== conversationId) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incomingMsg.id)) return prev;
            return [...prev, incomingMsg];
          });
        }
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { username } = payload.payload;
        if (username && username !== profile?.username) {
          setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));
          const timer = setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u !== username));
          }, 3000);
          return () => clearTimeout(timer);
        }
      })
      .subscribe();

    chatChannelRef.current = channel;

    // Visibility-guarded periodic fallback poll (30s)
    const syncInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchMessages();
    }, 30000);

    return () => {
      clearInterval(syncInterval);
      chatChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages, isConfigured, user, profile, supabase, isUUID]);

  // Send message with optional file uploads
  const sendMessage = async (
    content: string,
    replyToId: string | null = null,
    files: File[] = []
  ): Promise<{ error: string | null; messageId?: string }> => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return { error: 'Empty content' };
    if (!conversationId) return { error: 'No conversation selected' };

    if (isConfigured && !user) {
      return { error: 'User is not authenticated' };
    }

    // Local demo mode simulation ONLY when Supabase is not configured
    if (!isConfigured) {
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
        status: 'sent',
      };
      setMessages((prev) => [...prev, newMsg]);
      return { error: null, messageId: newMsg.id };
    }

    if (!isUUID) {
      return { error: 'Invalid conversation ID. Expected valid UUID.' };
    }

    if (!user) {
      return { error: 'User is not authenticated' };
    }

    // Validate reply ID: must reference an existing real message in this conversation
    const cleanReplyId =
      replyToId &&
      replyToId.trim() !== '' &&
      !replyToId.startsWith('opt-') &&
      messages.some((m) => m.id === replyToId && m.status !== 'failed')
        ? replyToId
        : null;

    // Optimistic local update with 'sending' status
    const optId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const optMsg: Message = {
      id: optId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmed,
      reply_to_id: cleanReplyId,
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
      status: 'sending',
    };

    setMessages((prev) => [...prev, optMsg]);

    try {
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

      // 1. Insert message to database
      const { data: msgRows, error: msgErr } = await supabase
        .from('messages')
        .insert(insertPayload)
        .select('id, created_at');

      if (msgErr || !msgRows?.[0]?.id) {
        const errorMsg = msgErr?.message || 'Database rejected message insert';
        console.error('Database message insert failure:', errorMsg);
        // Mark optimistic message as failed
        setMessages((prev) =>
          prev.map((m) => (m.id === optId ? { ...m, status: 'failed', error: errorMsg } : m))
        );
        return { error: errorMsg };
      }

      const confirmedId = msgRows[0].id;
      const confirmedCreatedAt = msgRows[0].created_at;

      // 2. Upload any attachments and persist to message_attachments
      const uploadedAttachments: MessageAttachment[] = [];
      if (files.length > 0) {
        for (const file of files) {
          try {
            const uploadRes = await uploadAttachmentFile({
              file,
              conversationId,
              userId: user.id,
            });

            if (uploadRes.storagePath) {
              const { data: attData } = await supabase
                .from('message_attachments')
                .insert({
                  message_id: confirmedId,
                  conversation_id: conversationId,
                  file_name: file.name,
                  file_type: file.type || 'application/octet-stream',
                  file_size: file.size,
                  storage_path: uploadRes.storagePath,
                })
                .select('*')
                .single();

              if (attData) {
                const { data: urlData } = supabase.storage
                  .from('attachments')
                  .getPublicUrl(uploadRes.storagePath);
                uploadedAttachments.push({
                  ...attData,
                  url: urlData?.publicUrl || undefined,
                });
              }
            }
          } catch (attErr) {
            console.warn('Attachment upload failed:', attErr);
          }
        }
      }

      const confirmedMsg: Message = {
        ...optMsg,
        id: confirmedId,
        created_at: confirmedCreatedAt || optMsg.created_at,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : optMsg.attachments,
        status: 'sent',
        error: undefined,
      };

      // 3. Reconcile optimistic message with confirmed persisted message
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === optId ? confirmedMsg : m));
        try {
          if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(next));
        } catch {}
        return next;
      });

      // 4. Broadcast to peers ONLY AFTER successful database persistence
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

      // 5. Broadcast conversation update so sidebar updates immediately
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

      return { error: null, messageId: confirmedId };
    } catch (err: unknown) {
      console.error('Send message exception:', err);
      const errMsg = err instanceof Error ? err.message : 'Network error sending message';
      setMessages((prev) =>
        prev.map((m) => (m.id === optId ? { ...m, status: 'failed', error: errMsg } : m))
      );
      return { error: errMsg };
    }
  };

  // Retry sending a previously failed message
  const retryMessage = async (messageId: string): Promise<{ error: string | null }> => {
    const target = messages.find((m) => m.id === messageId && m.status === 'failed');
    if (!target) return { error: 'Failed message not found' };

    // Remove the failed message and re-send
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    return sendMessage(target.content, target.reply_to_id);
  };

  // Add emoji reaction
  const addReaction = async (messageId: string, emoji: string): Promise<{ error: string | null }> => {
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
      return { error: null };
    }

    const { error } = await supabase.from('message_reactions').upsert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    });

    if (error) {
      console.error('Failed to add reaction:', error);
      return { error: error.message };
    }

    await fetchMessages();
    return { error: null };
  };

  // Remove emoji reaction
  const removeReaction = async (messageId: string, emoji: string): Promise<{ error: string | null }> => {
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
      return { error: null };
    }

    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);

    if (error) {
      console.error('Failed to remove reaction:', error);
      return { error: error.message };
    }

    await fetchMessages();
    return { error: null };
  };

  // Toggle Pin message
  const togglePinMessage = async (
    messageId: string,
    isCurrentlyPinned: boolean
  ): Promise<{ error: string | null }> => {
    const nextPinned = !isCurrentlyPinned;

    if (!isConfigured || !user) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned: nextPinned } : m))
      );
      return { error: null };
    }

    const { error } = await supabase
      .from('messages')
      .update({ is_pinned: nextPinned })
      .eq('id', messageId);

    if (error) {
      console.error('Failed to toggle pin:', error);
      return { error: error.message };
    }

    await fetchMessages();
    return { error: null };
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
  const editMessage = async (
    messageId: string,
    newContent: string
  ): Promise<{ error: string | null }> => {
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

    if (error) {
      console.error('Failed to edit message:', error);
      return { error: error.message };
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: newContent, is_edited: true } : m
      )
    );
    return { error: null };
  };

  // Delete message
  const deleteMessage = async (messageId: string): Promise<{ error: string | null }> => {
    if (!isConfigured || !user) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      return { error: null };
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', user.id);

    if (error) {
      console.error('Failed to delete message:', error);
      return { error: error.message };
    }

    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    return { error: null };
  };

  // Filtered messages by search query or pinned only
  const filteredMessages = React.useMemo(() => {
    return messages.filter((m) => {
      if (showPinnedOnly && !m.is_pinned) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesContent = m.content.toLowerCase().includes(q);
        const matchesSender = m.sender?.display_name?.toLowerCase().includes(q);
        const matchesFile = m.attachments?.some((a) => a.file_name.toLowerCase().includes(q));
        return Boolean(matchesContent || matchesSender || matchesFile);
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
    retryMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    togglePinMessage,
  };
}
