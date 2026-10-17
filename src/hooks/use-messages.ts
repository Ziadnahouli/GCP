'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { Message, MessageAttachment, MessageReaction } from '@/lib/types/messaging';
import { UserProfile } from '@/lib/types/profile';
import { uploadAttachmentFile } from '@/lib/storage/upload';
import { debugLogger } from '@/lib/logger/debug-logger';

export function useMessages(conversationId: string | null) {
  const { user, profile, isConfigured } = useAuth();
  const userId = user?.id;
  const currentUsername = profile?.username;
  const supabase = React.useMemo(() => getBrowserClient(), []);

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
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showPinnedOnly, setShowPinnedOnly] = React.useState(false);

  const chatChannelRef = React.useRef<any>(null);
  const activeConversationIdRef = React.useRef<string | null>(conversationId);
  const prevConversationIdRef = React.useRef<string | null>(conversationId);
  const isFetchingRef = React.useRef(false);
  const membershipVerifiedRef = React.useRef<Set<string>>(new Set());
  const createdBlobUrlsRef = React.useRef<Set<string>>(new Set());

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

  const cacheKey = React.useMemo(() => {
    if (!conversationId) return '';
    return userId ? `nexus_dm_msgs_${userId}_${conversationId}` : `nexus_dm_msgs_guest_${conversationId}`;
  }, [conversationId, userId]);

  // Fetch messages with attachments and reactions
  const fetchMessages = React.useCallback(
    async (isInitial = false) => {
      if (!conversationId) {
        setMessages([]);
        setIsLoading(false);
        return;
      }

      if (!userId) {
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
        const convChanged = prevConversationIdRef.current !== conversationId;
        if (convChanged) {
          prevConversationIdRef.current = conversationId;
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
        } else if (isInitial) {
          // Keep current messages visible during background revalidation
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
          const errMsg = String(msgsErr.message || msgsErr || '');
          const isTransientNetwork =
            errMsg.includes('Failed to fetch') ||
            errMsg.includes('NetworkError') ||
            errMsg.includes('network') ||
            msgsErr.name === 'AbortError';

          if (isTransientNetwork) {
            debugLogger.warn('messaging', `Transient network glitch fetching messages (will retry): ${errMsg}`);
            console.warn('Transient network glitch fetching messages:', msgsErr);
            if (activeConversationIdRef.current === conversationId) {
              setTimeout(() => {
                if (activeConversationIdRef.current === conversationId && !isFetchingRef.current) {
                  fetchMessages(false);
                }
              }, 1500);
            }
          } else {
            debugLogger.error('messaging', `Error fetching messages from database: ${msgsErr.message}`, msgsErr);
            console.warn('Error fetching messages from database:', msgsErr);
          }
          return;
        }

        // Database is authoritative, but retain active sending and failed drafts
        if (!msgsData || msgsData.length === 0) {
          setMessages((prev) => {
            return prev.filter((m) => {
              if (m.conversation_id !== conversationId) return false;
              return m.status === 'sending' || m.status === 'failed';
            });
          });
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

        if (activeConversationIdRef.current !== conversationId) return;

        const rawAttachments = attachmentsRes.data || [];
        const signedUrlMap = new Map<string, string>();
        if (rawAttachments.length > 0) {
          try {
            const paths = rawAttachments.map((a: any) => a.storage_path).filter(Boolean);
            const { data: signedData } = await (supabase.storage.from('attachments') as any).createSignedUrls(paths, 3600);
            if (Array.isArray(signedData)) {
              signedData.forEach((s: any) => {
                if (s.signedUrl && s.path) {
                  signedUrlMap.set(s.path, s.signedUrl);
                }
              });
            }
          } catch {}
        }

        const parsed: Message[] = msgsData.map((m) => {
          // Attachments
          const mAttachments: MessageAttachment[] = rawAttachments
            .filter((a) => a.message_id === m.id)
            .map((a) => {
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
          const combined = [...parsed];
          for (const p of prev) {
            if (p.conversation_id === conversationId && !combined.some((c) => c.id === p.id)) {
              // Deduplicate: If p is an optimistic message whose content was already saved and returned in parsed messages, drop it
              const alreadyPersisted =
                p.id.startsWith('opt-') &&
                combined.some(
                  (c) =>
                    c.sender_id === p.sender_id &&
                    c.content.trim() === p.content.trim()
                );
              if (!alreadyPersisted) {
                combined.push(p);
              }
            }
          }
          combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return combined;
        });

        try {
          if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(parsed));
        } catch {}
      } catch (err: any) {
        const errMsg = String(err?.message || err || '');
        if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
          debugLogger.warn('messaging', `Network fetch error (will retry): ${errMsg}`);
          if (activeConversationIdRef.current === conversationId) {
            setTimeout(() => {
              if (activeConversationIdRef.current === conversationId && !isFetchingRef.current) {
                fetchMessages(false);
              }
            }, 1500);
          }
        } else {
          console.error('Error fetching messages:', err);
        }
      } finally {
        isFetchingRef.current = false;
        if (activeConversationIdRef.current === conversationId) {
          setIsLoading(false);
        }
      }
    },
    [conversationId, userId, supabase, isUUID, isConfigured, cacheKey, user?.id]
  );

  // Realtime channel subscriptions
  React.useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      prevConversationIdRef.current = conversationId;
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

      if (chatChannelRef.current) {
        try {
          supabase.removeChannel(chatChannelRef.current);
        } catch {}
      }

      const channelName = `chat-room-${conversationId}`;
      const ch = supabase.channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      });

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
            const exists = prev.some((m) => m.id === newRow.id);
            if (exists) return prev;
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
            setMessages((prev) => {
              const next = prev.filter((m) => m.id !== oldRow.id);
              try {
                if (cacheKey) {
                  localStorage.setItem(cacheKey, JSON.stringify(next.filter((m) => m.status === 'sent')));
                }
              } catch {}
              return next;
            });
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
      });

      ch.subscribe((status, err) => {
        debugLogger.info('realtime', `Chat channel [${channelName}] status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          debugLogger.success('realtime', `Connected to real-time chat for conv ${conversationId}`);
          fetchMessages();
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          debugLogger.warn('realtime', `Chat channel disconnected (${status}). Fetching via REST and auto-reconnecting in 2.5s with full listeners...`);
          fetchMessages();
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

    // Fast-adaptive background poll (3.5s when active tab):
    // Guarantees delivery even across strict corporate firewalls or when Supabase WebSockets idle out
    const syncInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchMessages();
    }, 3500);

    // Heartbeat ping every 20 seconds to keep WebSocket connection active and revive dropped sockets
    heartbeatTimer = setInterval(() => {
      if (chatChannelRef.current && chatChannelRef.current.state === 'joined') {
        chatChannelRef.current.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: { timestamp: Date.now() },
        }).catch(() => {});
      } else if (chatChannelRef.current && (chatChannelRef.current.state === 'closed' || chatChannelRef.current.state === 'errored')) {
        setupChannel();
      }
    }, 20000);

    // Immediate sync on tab focus or visibility resume
    const handleFocus = () => {
      fetchMessages();
    };
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchMessages();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      isCleanedUp = true;
      clearInterval(syncInterval);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
    };
  }, [conversationId, fetchMessages, isConfigured, userId, currentUsername, supabase, isUUID, profile?.username, cacheKey]);

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
      const mockAttachments: MessageAttachment[] = files.map((f, i) => {
        const url = URL.createObjectURL(f);
        createdBlobUrlsRef.current.add(url);
        return {
          id: `att-mock-${Date.now()}-${i}`,
          message_id: `local-msg-${Date.now()}`,
          conversation_id: conversationId,
          file_name: f.name,
          file_type: f.type,
          file_size: f.size,
          storage_path: 'local/path',
          url,
          created_at: new Date().toISOString(),
        };
      });

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

      // Proactively check session expiration
      if (isConfigured && supabase.auth?.getSession) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.expires_at) {
            const timeLeftSec = session.expires_at - Math.floor(Date.now() / 1000);
            if (timeLeftSec < 120 && supabase.auth.refreshSession) {
              debugLogger.info('auth', `Proactively refreshing session (${timeLeftSec}s remaining)...`);
              await supabase.auth.refreshSession();
            }
          }
        } catch {}
      }

      // Ensure user is recorded in conversation_members to satisfy RLS (cached per conversation)
      if (!membershipVerifiedRef.current.has(conversationId)) {
        try {
          const { data: memberData } = await supabase
            .from('conversation_members')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!memberData) {
            await supabase.from('conversation_members').insert({
              conversation_id: conversationId,
              user_id: user.id,
              role: 'member',
            });
          }
          membershipVerifiedRef.current.add(conversationId);
        } catch (cmErr) {
          console.warn('Ensure conversation member error:', cmErr);
        }
      }

      debugLogger.info('messaging', `Initiating DM send (${trimmed.length} chars) to conv ${conversationId}`, {
        optId,
        cleanReplyId,
        filesCount: files.length,
      });

      // 1. Insert message to database with bounded timeout to prevent hanging on dropped connections
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
            console.warn('Potential token expiry detected, refreshing auth session and retrying message insert...');
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
              } else if (retryRes.error) {
                debugLogger.error('messaging', `Message insert retry also failed: ${retryRes.error.message}`, retryRes.error);
              }
            }
          } catch (refreshErr) {
            debugLogger.error('auth', 'Exception during auto-session refresh:', refreshErr);
            console.warn('Auto session refresh retry failed:', refreshErr);
          }
        }
      }

      if (msgErr || !msgRows?.[0]?.id) {
        const errorMsg = msgErr?.message || 'Database rejected message insert';
        debugLogger.error('messaging', `Final message delivery failure: ${errorMsg}`, {
          error: msgErr,
          conversationId,
          userId: user.id,
        });
        console.error('Database message insert failure:', errorMsg);
        // Mark optimistic message as failed
        setMessages((prev) =>
          prev.map((m) => (m.id === optId ? { ...m, status: 'failed', error: errorMsg } : m))
        );
        return { error: errorMsg };
      }

      const confirmedId = msgRows[0].id;
      const confirmedCreatedAt = msgRows[0].created_at;
      debugLogger.success('messaging', `Message persisted to database (${insertDurationMs}ms): id=${confirmedId}`);

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

      // 3. Reconcile optimistic message with confirmed persisted message
      setMessages((prev) => prev.map((m) => (m.id === optId ? confirmedMsg : m)));
      try {
        if (cacheKey) {
          const current = messages.map((m) => (m.id === optId ? confirmedMsg : m));
          localStorage.setItem(cacheKey, JSON.stringify(current));
        }
      } catch {}

      // Revoke any optimistic blob URLs now that persisted attachments are confirmed
      optMsg.attachments?.forEach((a) => {
        if (a.url && a.url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(a.url);
            createdBlobUrlsRef.current.delete(a.url);
          } catch {}
        }
      });

      // 4. Broadcast to peers ONLY AFTER successful database persistence
      // 4. Broadcast to peers ONLY AFTER successful database persistence
      if (chatChannelRef.current) {
        if (chatChannelRef.current.state === 'joined') {
          chatChannelRef.current
            .send({
              type: 'broadcast',
              event: 'new_msg',
              payload: { message: confirmedMsg },
            })
            .catch((bcErr: unknown) => {
              console.warn('Realtime broadcast warning:', bcErr);
            });
        } else if (typeof chatChannelRef.current.httpSend === 'function') {
          chatChannelRef.current
            .httpSend({
              type: 'broadcast',
              event: 'new_msg',
              payload: { message: confirmedMsg },
            })
            .catch(() => {});
        }
      }

      // 5. Broadcast conversation update so sidebar updates immediately
      try {
        const existingChannel = supabase
          .getChannels()
          .find((c) => c.topic === 'realtime:conversations-realtime');

        if (existingChannel && existingChannel.state === 'joined') {
          existingChannel
            .send({
              type: 'broadcast',
              event: 'conv_update',
              payload: { conversationId, lastMessage: confirmedMsg },
            })
            .catch(() => {});
        } else {
          const convListChannel = existingChannel || supabase.channel('conversations-realtime');
          if (typeof (convListChannel as any).httpSend === 'function') {
            (convListChannel as any)
              .httpSend({
                type: 'broadcast',
                event: 'conv_update',
                payload: { conversationId, lastMessage: confirmedMsg },
              })
              .catch(() => {});
          }
        }
      } catch {}

      // Update conversation updated_at timestamp
      supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(() => {}, () => {});

      // Fast authoritative follow-up reconciliations to guarantee server consistency
      setTimeout(() => {
        if (activeConversationIdRef.current === conversationId) {
          fetchMessages();
        }
      }, 400);

      setTimeout(() => {
        if (activeConversationIdRef.current === conversationId) {
          fetchMessages();
        }
      }, 1200);

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

    // Idempotency check: verify if the timed-out message was actually committed to the database
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
