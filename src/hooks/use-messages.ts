'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { Message, MessageAttachment, MessageReaction } from '@/lib/types/messaging';
import { UserProfile } from '@/lib/types/profile';
import { uploadAttachmentFile } from '@/lib/storage/upload';
import { debugLogger } from '@/lib/logger/debug-logger';
import { useToast } from '@/components/ui/toast';
import { realtimeHub } from '@/lib/realtime/realtime-hub';

const PAGE_SIZE = 50;
const MAX_CONTENT_LENGTH = 4000;

export function useMessages(conversationId: string | null) {
  const { user, profile, isConfigured } = useAuth();
  const { toast } = useToast();
  const userId = user?.id;
  const currentUsername = profile?.username;
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const cacheKey = React.useMemo(() => {
    if (!conversationId) return '';
    return userId ? `nexus_dm_msgs_${userId}_${conversationId}` : `nexus_dm_msgs_guest_${conversationId}`;
  }, [conversationId, userId]);

  const [messages, setMessages] = React.useState<Message[]>(() => {
    if (!conversationId || typeof window === 'undefined') return [];
    try {
      const key = userId ? `nexus_dm_msgs_${userId}_${conversationId}` : `nexus_dm_msgs_guest_${conversationId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [isLoading, setIsLoading] = React.useState<boolean>(() => {
    if (!conversationId || typeof window === 'undefined') return false;
    try {
      const key = userId ? `nexus_dm_msgs_${userId}_${conversationId}` : `nexus_dm_msgs_guest_${conversationId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {}
    return true;
  });

  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showPinnedOnly, setShowPinnedOnly] = React.useState(false);

  const chatChannelRef = React.useRef<any>(null);
  const activeConversationIdRef = React.useRef<string | null>(conversationId);
  const prevConversationIdRef = React.useRef<string | null>(conversationId);
  const isFetchingRef = React.useRef(false);
  const generationRef = React.useRef(0);
  const createdBlobUrlsRef = React.useRef<Set<string>>(new Set());
  const typingTimersRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());
  const fallbackPollTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const signedUrlCacheRef = React.useRef<Map<string, { url: string; expiresAt: number }>>(new Map());

  // Revoke any created blob object URLs on unmount to prevent memory leaks
  React.useEffect(() => {
    const blobUrls = createdBlobUrlsRef.current;
    return () => {
      blobUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      blobUrls.clear();
    };
  }, []);

  React.useEffect(() => {
    activeConversationIdRef.current = conversationId;
  }, [conversationId]);

  const isUUID = React.useMemo(() => {
    return conversationId
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)
      : false;
  }, [conversationId]);

  // Clean up all typing debounce timers (M5)
  const clearTypingTimers = React.useCallback(() => {
    typingTimersRef.current.forEach((timer) => clearTimeout(timer));
    typingTimersRef.current.clear();
    setTypingUsers([]);
  }, []);

  const fetchMessagesRef = React.useRef<(isInitial?: boolean) => Promise<void>>(() => Promise.resolve());

  // Stop polling interval
  const stopFallbackPolling = React.useCallback(() => {
    if (fallbackPollTimerRef.current) {
      clearInterval(fallbackPollTimerRef.current);
      fallbackPollTimerRef.current = null;
    }
  }, []);

  const startFallbackPolling = React.useCallback(() => {
    stopFallbackPolling();
    fallbackPollTimerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (activeConversationIdRef.current) {
        fetchMessagesRef.current(false);
      }
    }, 10000);
  }, [stopFallbackPolling]);

  // Sign attachment paths with cache awareness (M6)
  const resolveSignedUrls = React.useCallback(
    async (rawAttachments: any[]): Promise<Map<string, string>> => {
      const signedMap = new Map<string, string>();
      const missingPaths: string[] = [];
      const now = Date.now();

      for (const a of rawAttachments) {
        const path = a.storage_path;
        if (!path) continue;
        const cached = signedUrlCacheRef.current.get(path);
        if (cached && cached.expiresAt > now + 60000) {
          signedMap.set(path, cached.url);
        } else {
          missingPaths.push(path);
        }
      }

      if (missingPaths.length > 0) {
        try {
          const { data: signedData } = await (supabase.storage.from('attachments') as any).createSignedUrls(
            missingPaths,
            3600
          );
          if (Array.isArray(signedData)) {
            signedData.forEach((s: any) => {
              if (s.signedUrl && s.path) {
                signedMap.set(s.path, s.signedUrl);
                signedUrlCacheRef.current.set(s.path, {
                  url: s.signedUrl,
                  expiresAt: now + 3500 * 1000,
                });
              }
            });
          }
        } catch {}
      }

      return signedMap;
    },
    [supabase]
  );

  // Fetch messages with keyset pagination (M1)
  const fetchMessages = React.useCallback(
    async (isInitial = false) => {
      if (!conversationId) {
        setMessages([]);
        setIsLoading(false);
        setHasMore(false);
        return;
      }

      if (!userId) {
        setMessages([]);
        setIsLoading(false);
        setHasMore(false);
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
        setHasMore(false);
        return;
      }

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      const currentGen = ++generationRef.current;

      try {
        const convChanged = prevConversationIdRef.current !== conversationId;
        if (convChanged) {
          prevConversationIdRef.current = conversationId;
          clearTypingTimers();
          let cached: Message[] = [];
          try {
            const raw = localStorage.getItem(cacheKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) cached = parsed;
            }
          } catch {}
          setMessages(cached);
          setIsLoading(cached.length === 0);
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
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        // Guard against race condition on conversation switch (M4)
        if (activeConversationIdRef.current !== conversationId || generationRef.current !== currentGen) return;

        if (msgsErr) {
          const errMsg = String(msgsErr.message || msgsErr || '');
          debugLogger.error('messaging', `Error fetching messages from database: ${errMsg}`, msgsErr);
          return;
        }

        // Database authoritative: empty result clears stale cache
        if (!msgsData || msgsData.length === 0) {
          setMessages((prev) => {
            return prev.filter((m) => {
              if (m.conversation_id !== conversationId) return false;
              return m.status === 'sending' || m.status === 'failed';
            });
          });
          setHasMore(false);
          try {
            if (cacheKey) localStorage.removeItem(cacheKey);
          } catch {}
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

        if (activeConversationIdRef.current !== conversationId || generationRef.current !== currentGen) return;

        const rawAttachments = attachmentsRes.data || [];
        const signedUrlMap = await resolveSignedUrls(rawAttachments);

        // Reverse descending keyset to chronological order (oldest top, newest bottom)
        const chronologicalMsgs = [...msgsData].reverse();

        const parsed: Message[] = chronologicalMsgs.map((m) => {
          // Attachments
          const mAttachments: MessageAttachment[] = rawAttachments
            .filter((a: any) => a.message_id === m.id)
            .map((a: any) => {
              const signed = signedUrlMap.get(a.storage_path);
              if (signed) {
                return {
                  ...a,
                  url: signed,
                };
              }
              const { data: urlData } = supabase.storage
                .from('attachments')
                .getPublicUrl(a.storage_path);
              return {
                ...a,
                url: urlData?.publicUrl || undefined,
              };
            });

          // Reactions grouped by emoji
          const rawReactions = (reactionsRes.data || []).filter((r: any) => r.message_id === m.id);
          const reactionMap = new Map<string, { count: number; has_reacted: boolean; users: string[] }>();

          rawReactions.forEach((r: any) => {
            const existing = reactionMap.get(r.emoji) || { count: 0, has_reacted: false, users: [] };
            const userName =
              (r.profile as unknown as { display_name?: string })?.display_name || 'Gamer';
            existing.count += 1;
            existing.users.push(userName);
            if (r.user_id === user?.id) existing.has_reacted = true;
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
            content: m.content ?? '', // M7: Null-safe fallback
            status: 'sent' as const,
            sender: m.sender as unknown as UserProfile,
            attachments: mAttachments,
            reactions: mReactions,
          };
        });

        setMessages((prev) => {
          // Retain pending optimistic and failed drafts (M3)
          const pending = prev.filter(
            (p) => p.conversation_id === conversationId && (p.status === 'sending' || p.status === 'failed')
          );
          const combined = [...parsed];
          for (const p of pending) {
            if (!combined.some((c) => c.id === p.id)) {
              combined.push(p);
            }
          }
          combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return combined;
        });

        setHasMore(msgsData.length >= PAGE_SIZE);

        // M6: Sanitize cache so ephemeral tokens with 1-hour expiration are not stored in localStorage
        try {
          if (cacheKey) {
            const cachePayload = parsed.map((m) => ({
              ...m,
              attachments: m.attachments?.map((a) => ({
                ...a,
                url: a.storage_path ? undefined : a.url,
              })),
            }));
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          }
        } catch {}
      } catch (err: any) {
        console.error('Error fetching messages:', err);
      } finally {
        isFetchingRef.current = false;
        if (activeConversationIdRef.current === conversationId) {
          setIsLoading(false);
        }
      }
    },
    [conversationId, userId, supabase, isUUID, isConfigured, cacheKey, user?.id, clearTypingTimers, resolveSignedUrls]
  );
  fetchMessagesRef.current = fetchMessages;

  // Load older messages via keyset cursor on created_at (M1)
  const loadMore = React.useCallback(async () => {
    if (!conversationId || isLoadingMore || !hasMore || isFetchingRef.current || !userId || !isConfigured || !isUUID) return;

    const oldest = messages[0];
    if (!oldest?.created_at) return;

    setIsLoadingMore(true);
    isFetchingRef.current = true;
    const currentGen = generationRef.current;

    try {
      const { data: olderBatch, error } = await supabase
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
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (activeConversationIdRef.current !== conversationId || generationRef.current !== currentGen) return;

      if (!error && olderBatch) {
        if (olderBatch.length === 0) {
          setHasMore(false);
          return;
        }

        const msgIds = olderBatch.map((m) => m.id);
        const [attachmentsRes, reactionsRes] = await Promise.all([
          supabase
            .from('message_attachments')
            .select('*')
            .in('message_id', msgIds),
          supabase
            .from('message_reactions')
            .select(`
              id, message_id, user_id, emoji, created_at,
              profile:user_id (display_name, username)
            `)
            .in('message_id', msgIds),
        ]);

        const rawAttachments = attachmentsRes.data || [];
        const signedUrlMap = await resolveSignedUrls(rawAttachments);

        const chronologicalOlder: Message[] = [...olderBatch].reverse().map((m) => {
          const mAttachments: MessageAttachment[] = rawAttachments
            .filter((a: any) => a.message_id === m.id)
            .map((a: any) => ({
              ...a,
              url: signedUrlMap.get(a.storage_path) || undefined,
            }));

          const rawReactions = (reactionsRes.data || []).filter((r: any) => r.message_id === m.id);
          const reactionMap = new Map<string, { count: number; has_reacted: boolean; users: string[] }>();

          rawReactions.forEach((r: any) => {
            const existing = reactionMap.get(r.emoji) || { count: 0, has_reacted: false, users: [] };
            const userName =
              (r.profile as unknown as { display_name?: string })?.display_name || 'Gamer';
            existing.count += 1;
            existing.users.push(userName);
            if (r.user_id === user?.id) existing.has_reacted = true;
            reactionMap.set(r.emoji, existing);
          });

          return {
            ...m,
            content: m.content ?? '',
            status: 'sent' as const,
            sender: m.sender as unknown as UserProfile,
            attachments: mAttachments,
            reactions: Array.from(reactionMap.entries()).map(([emoji, data]) => ({ emoji, ...data })),
          };
        });

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const filteredOlder = chronologicalOlder.filter((m) => !existingIds.has(m.id));
          return [...filteredOlder, ...prev];
        });

        setHasMore(olderBatch.length >= PAGE_SIZE);
      }
    } catch (e) {
      console.warn('Failed to load older messages:', e);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [conversationId, isLoadingMore, hasMore, messages, userId, isConfigured, isUUID, supabase, resolveSignedUrls, user?.id]);

  // Realtime channel subscriptions
  React.useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      prevConversationIdRef.current = conversationId;
      clearTypingTimers();
      let cached: Message[] = [];
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) cached = parsed;
        }
      } catch {}
      setMessages(cached);
      setIsLoading(cached.length === 0);
    }

    if (!conversationId || !isConfigured || !userId || !isUUID) {
      return () => {};
    }

    fetchMessages(true);

    let reconnectTimeout: NodeJS.Timeout | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let isCleanedUp = false;

    const setupChannel = () => {
      if (isCleanedUp) return;

      const channelName = `conv:${conversationId}:chat`;
      const ch = realtimeHub.acquire(
        channelName,
        {
          config: { private: true, broadcast: { self: false } },
        },
        supabase
      );

      ch.on(
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
          if (newRow.conversation_id && newRow.conversation_id !== conversationId) return;

          setMessages((prev) => {
            const existingIdx = prev.findIndex((m) => m.id === newRow.id);
            if (existingIdx !== -1) {
              const updated = [...prev];
              updated[existingIdx] = {
                ...updated[existingIdx],
                ...newRow,
                content: newRow.content ?? '',
                status: 'sent',
              };
              return updated;
            }
            const newMsg: Message = {
              id: newRow.id,
              conversation_id: newRow.conversation_id,
              sender_id: newRow.sender_id,
              content: newRow.content ?? '',
              reply_to_id: newRow.reply_to_id || null,
              is_pinned: Boolean(newRow.is_pinned),
              is_edited: Boolean(newRow.is_edited),
              created_at: newRow.created_at,
              updated_at: newRow.updated_at,
              status: 'sent',
            };
            return [...prev, newMsg];
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
        (payload) => {
          const updatedRow = payload.new as any;
          if (!updatedRow?.id) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedRow.id
                ? { ...m, ...updatedRow, content: updatedRow.content ?? m.content }
                : m
            )
          );
        }
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
            setMessages((prev) => {
              const next = prev.filter((m) => m.id !== oldRow.id);
              try {
                if (cacheKey) {
                  localStorage.setItem(cacheKey, JSON.stringify(next.filter((m) => m.status === 'sent')));
                }
              } catch {}
              return next;
            });
          }
        }
      )
      .on('broadcast', { event: 'new_msg' }, async ({ payload }) => {
        if (payload?.message?.id && conversationId) {
          const incomingMsg = payload.message as Message;
          if (incomingMsg.conversation_id !== conversationId) return;
          // Verify authenticity and content by fetching row from DB (A2)
          try {
            const { data, error } = await supabase
              .from('messages')
              .select('id, conversation_id, sender_id, content, reply_to_id, is_pinned, is_edited, created_at, updated_at')
              .eq('id', incomingMsg.id)
              .eq('conversation_id', conversationId)
              .maybeSingle();

            if (!error && data && activeConversationIdRef.current === conversationId) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === data.id)) return prev;
                return [
                  ...prev,
                  {
                    id: data.id,
                    conversation_id: data.conversation_id,
                    sender_id: data.sender_id,
                    content: data.content ?? '',
                    reply_to_id: data.reply_to_id || null,
                    is_pinned: Boolean(data.is_pinned),
                    is_edited: Boolean(data.is_edited),
                    created_at: data.created_at,
                    updated_at: data.updated_at,
                    status: 'sent',
                  },
                ];
              });
            }
          } catch {
            // DB lookup failed or unauthenticated - ignore unverified broadcast
          }
        }
      })
      // M5: Anti-flicker typing indicator map
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { username } = payload.payload;
        if (username && username !== profile?.username) {
          const existingTimer = typingTimersRef.current.get(username);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));

          const timer = setTimeout(() => {
            typingTimersRef.current.delete(username);
            setTypingUsers((prev) => prev.filter((u) => u !== username));
          }, 3000);

          typingTimersRef.current.set(username, timer);
        }
      });

      ch.subscribe((status, err) => {
        debugLogger.info('realtime', `Chat channel [${channelName}] status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          debugLogger.success('realtime', `Connected to real-time chat for conv ${conversationId}`);
          stopFallbackPolling();
          fetchMessages();
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          debugLogger.warn('realtime', `Chat channel disconnected (${status}). Starting fallback polling...`);
          startFallbackPolling();
          if (!reconnectTimeout && !isCleanedUp) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              setupChannel();
            }, 2500);
          }
        }
      });

      chatChannelRef.current = ch;
    };

    setupChannel();

    // Heartbeat ping every 20 seconds to keep WebSocket connection active
    heartbeatTimer = setInterval(() => {
      if (chatChannelRef.current && chatChannelRef.current.state === 'joined') {
        chatChannelRef.current
          .send({
            type: 'broadcast',
            event: 'heartbeat',
            payload: { timestamp: Date.now() },
          })
          .catch(() => {});
      } else if (chatChannelRef.current && (chatChannelRef.current.state === 'closed' || chatChannelRef.current.state === 'errored')) {
        setupChannel();
      }
    }, 20000);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') fetchMessages();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleFocus);
    }

    return () => {
      isCleanedUp = true;
      stopFallbackPolling();
      clearTypingTimers();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleFocus);
      }
      if (chatChannelRef.current) {
        chatChannelRef.current = null;
        realtimeHub.release(`conv:${conversationId}:chat`, 1000);
      }
    };
  }, [conversationId, fetchMessages, isConfigured, userId, isUUID, supabase, cacheKey, profile?.username, stopFallbackPolling, startFallbackPolling, clearTypingTimers]);

  // Send a new message (M3, M7)
  const sendMessage = async (
    content: string,
    replyToId?: string | null,
    files: File[] = []
  ): Promise<{ error: string | null; messageId?: string }> => {
    const trimmed = (content ?? '').trim();
    if (!trimmed && files.length === 0) {
      return { error: 'Empty message' };
    }

    // M7: Enforce 4000 character length limit
    if (content && content.length > MAX_CONTENT_LENGTH) {
      return { error: 'Message exceeds maximum length of 4000 characters' };
    }

    if (!conversationId) {
      return { error: 'No active conversation selected' };
    }

    // Local demo mode simulation
    if (!isConfigured) {
      const newMsg: Message = {
        id: `demo-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user?.id || 'demo-user',
        content: trimmed,
        reply_to_id: null,
        is_pinned: false,
        is_edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender: profile || undefined,
        attachments: [],
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

    const cleanReplyId =
      replyToId &&
      replyToId.trim() !== '' &&
      messages.some((m) => m.id === replyToId && m.status !== 'failed')
        ? replyToId
        : null;

    // Stable client UUID primary key (M3)
    const optId = crypto.randomUUID();
    const optMsg: Message = {
      id: optId,
      client_nonce: optId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmed,
      reply_to_id: cleanReplyId,
      is_pinned: false,
      is_edited: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender: profile || undefined,
      attachments: files.map((f, i) => {
        const url = URL.createObjectURL(f);
        createdBlobUrlsRef.current.add(url);
        return {
          id: `att-opt-${Date.now()}-${i}`,
          message_id: optId,
          conversation_id: conversationId,
          file_name: f.name,
          file_type: f.type,
          file_size: f.size,
          storage_path: '',
          url,
          created_at: new Date().toISOString(),
        };
      }),
      reactions: [],
      status: 'sending',
    };

    setMessages((prev) => [...prev, optMsg]);

    try {
      const insertPayload: {
        id: string; // Pass draft ID as primary key (M3)
        conversation_id: string;
        sender_id: string;
        content: string;
        reply_to_id?: string | null;
      } = {
        id: optId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmed,
      };
      if (cleanReplyId) {
        insertPayload.reply_to_id = cleanReplyId;
      }

      const insertStartTime = performance.now();
      const insertPromise = supabase
        .from('messages')
        .insert(insertPayload)
        .select('id, created_at');

      const timeoutPromise = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Network request timed out after 8s')), 8000)
      );

      let insertRes: any;
      try {
        insertRes = await Promise.race([insertPromise, timeoutPromise]);
      } catch (raceErr: any) {
        insertRes = { data: null, error: raceErr };
      }

      const insertDurationMs = Math.round(performance.now() - insertStartTime);
      let msgRows = insertRes.data;
      let msgErr = insertRes.error;

      // Auto-recovery: If rejected due to RLS/auth/JWT expiration or PGRST301, refresh session and retry once
      if (msgErr) {
        debugLogger.warn('messaging', `Initial message insert failed (${insertDurationMs}ms): [${(msgErr as any).code}] ${msgErr.message}`, msgErr);
        const errLower = (msgErr.message || '').toLowerCase();
        const isAuthOrRls =
          errLower.includes('jwt') ||
          errLower.includes('security') ||
          errLower.includes('rls') ||
          errLower.includes('unauthorized') ||
          errLower.includes('authenticated') ||
          (msgErr as any).code === 'PGRST301' ||
          (msgErr as any).code === '42501';

        if (isAuthOrRls && supabase.auth?.refreshSession) {
          try {
            debugLogger.info('auth', 'Auth issue detected during send. Refreshing auth session and retrying...');
            const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
            if (refErr) {
              debugLogger.error('auth', `Token auto-refresh failed: ${refErr.message}`, refErr);
            }
            if (refreshed?.session?.user) {
              debugLogger.success('auth', 'Token auto-refreshed successfully. Retrying message insert...');
              const retryRes = await supabase
                .from('messages')
                .insert(insertPayload)
                .select('id, created_at');
              if (!retryRes.error && retryRes.data?.[0]?.id) {
                msgRows = retryRes.data;
                msgErr = null;
                debugLogger.success('messaging', 'Message insert retry succeeded after token renewal.');
              }
            }
          } catch (refreshErr) {
            console.warn('Auto session refresh retry failed:', refreshErr);
          }
        }
      }

      if (msgErr || !msgRows?.[0]?.id) {
        const errorMsg = msgErr?.message || 'Database rejected message insert';
        console.error('Database message insert failure:', errorMsg);
        if (errorMsg.includes('blocked') || errorMsg.includes('direct messages') || errorMsg.includes('Recipient')) {
          toast({
            title: 'Cannot Send Message',
            description: errorMsg,
            type: 'error',
          });
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === optId ? { ...m, status: 'failed', error: errorMsg } : m))
        );
        return { error: errorMsg };
      }

      const confirmedId = msgRows[0].id || optId;
      const confirmedCreatedAt = msgRows[0].created_at;

      // Upload attachments if present
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
                uploadedAttachments.push({
                  ...attData,
                  url: uploadRes.publicUrl || undefined,
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

      // Reconcile optimistic message by exact ID (M3)
      setMessages((prev) => prev.map((m) => (m.id === optId ? confirmedMsg : m)));

      try {
        if (cacheKey) {
          const current = messages.map((m) => (m.id === optId ? confirmedMsg : m));
          localStorage.setItem(cacheKey, JSON.stringify(current));
        }
      } catch {}

      optMsg.attachments?.forEach((a) => {
        if (a.url && a.url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(a.url);
            createdBlobUrlsRef.current.delete(a.url);
          } catch {}
        }
      });

      // Broadcast to peers
      if (chatChannelRef.current) {
        if (chatChannelRef.current.state === 'joined') {
          chatChannelRef.current
            .send({
              type: 'broadcast',
              event: 'new_msg',
              payload: { message: confirmedMsg },
            })
            .catch(() => {});
        }
      }

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

  // Retry sending a previously failed message (M3)
  const retryMessage = async (messageId: string): Promise<{ error: string | null }> => {
    const target = messages.find((m) => m.id === messageId && m.status === 'failed');
    if (!target) return { error: 'Failed message not found' };

    // Idempotency check: verify if the message was already committed to database
    if (isConfigured && userId && isUUID && conversationId) {
      try {
        const { data: existing } = await supabase
          .from('messages')
          .select('id, created_at')
          .eq('conversation_id', conversationId)
          .eq('sender_id', userId)
          .eq('content', target.content.trim())
          .gte('created_at', new Date(Date.now() - 60000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (existing && existing.length > 0) {
          debugLogger.info('messaging', 'Retry detected message was already committed. Reconciling...');
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          await fetchMessages();
          return { error: null };
        }
      } catch {}
    }

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

    const target = messages.find((m) => m.id === messageId);
    const isAuthor = !target || target.sender_id === user.id;

    let error: any = null;
    if (isAuthor) {
      const directRes = await supabase
        .from('messages')
        .update({ is_pinned: nextPinned })
        .eq('id', messageId);
      error = directRes.error;
    } else {
      try {
        const rpcRes = await supabase.rpc('pin_conversation_message', {
          p_message_id: messageId,
          p_is_pinned: nextPinned,
        });
        error = rpcRes.error;
      } catch (e: any) {
        error = e;
      }
    }

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
    if (chatChannelRef.current && chatChannelRef.current.state === 'joined') {
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

    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== messageId);
      try {
        if (cacheKey) {
          localStorage.setItem(cacheKey, JSON.stringify(next.filter((m) => m.status === 'sent')));
        }
      } catch {}
      return next;
    });
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
    isLoadingMore,
    hasMore,
    loadMore,
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
