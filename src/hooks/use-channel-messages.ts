'use client';

import * as React from 'react';
import { ChannelMessage } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';
import { debugLogger } from '@/lib/logger/debug-logger';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { addBoundedSet } from '@/lib/utils';

const STORAGE_KEY_PREFIX = 'nexus_channel_msgs_';
const PAGE_SIZE = 50;
const MAX_CONTENT_LENGTH = 4000;
const MAX_SEEN_CHANNEL_MESSAGES = 1000;

const getCachedChannelMessages = (chanId: string | null): ChannelMessage[] => {
  if (!chanId || typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${chanId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

export function useChannelMessages(channelId: string | null) {
  const { user, profile, isConfigured } = useAuth();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [messages, setMessages] = React.useState<ChannelMessage[]>(() => getCachedChannelMessages(channelId));
  const [isLoading, setIsLoading] = React.useState<boolean>(() => getCachedChannelMessages(channelId).length === 0);
  const [isLoadingMore, setIsLoadingMore] = React.useState<boolean>(false);
  const [hasMore, setHasMore] = React.useState<boolean>(false);

  const channelRef = React.useRef<any>(null);
  const activeChannelIdRef = React.useRef<string | null>(channelId);
  const prevChannelIdRef = React.useRef<string | null>(channelId);
  const isFetchingRef = React.useRef<boolean>(false);
  const generationRef = React.useRef<number>(0);
  const fallbackPollTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const seenIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    activeChannelIdRef.current = channelId;
  }, [channelId]);

  const isUUID = React.useMemo(() => {
    return channelId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId) : false;
  }, [channelId]);

  const userId = user?.id;

  const fetchChannelMessagesRef = React.useRef<(isInitial?: boolean) => Promise<void>>(() => Promise.resolve());

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
      if (activeChannelIdRef.current) {
        fetchChannelMessagesRef.current(false);
      }
    }, 10000); // 10s fallback polling ONLY when disconnected
  }, [stopFallbackPolling]);

  // Keyset fetch (M1)
  const fetchChannelMessages = React.useCallback(
    async (isInitial = false) => {
      if (!channelId) {
        setMessages([]);
        setIsLoading(false);
        setHasMore(false);
        return;
      }

      const channelChanged = prevChannelIdRef.current !== channelId;
      if (channelChanged) {
        prevChannelIdRef.current = channelId;
        const cached = getCachedChannelMessages(channelId);
        setMessages(cached);
        setIsLoading(cached.length === 0);
      }

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      const currentGen = ++generationRef.current;

      try {
        if (userId && isConfigured && isUUID) {
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
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

          // Guard against race condition on channel switch (M4)
          if (activeChannelIdRef.current !== channelId || generationRef.current !== currentGen) return;

          if (!error && data) {
            // Reverse from descending keyset to chronological order (oldest top, newest bottom)
            const chronological = [...data].reverse();
            const parsed: ChannelMessage[] = chronological.map((m) => ({
              id: m.id,
              channel_id: m.channel_id,
              user_id: m.user_id,
              content: m.content ?? '', // M7: Null-safe fallback
              created_at: m.created_at,
              updated_at: m.updated_at,
              status: 'sent' as const,
              profile: (m.profile as unknown as UserProfile) || undefined,
            }));

            parsed.forEach((m) => addBoundedSet(seenIdsRef.current, m.id, MAX_SEEN_CHANNEL_MESSAGES));

            setMessages((prev) => {
              // Exact ID deduplication: keep optimistic and failed messages (M3)
              const pending = prev.filter((p) => p.channel_id === channelId && (p.status === 'sending' || p.status === 'failed'));
              const combined = [...parsed];
              for (const p of pending) {
                if (!combined.some((c) => c.id === p.id)) {
                  combined.push(p);
                }
              }
              combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              return combined;
            });

            setHasMore(data.length >= PAGE_SIZE);

            try {
              localStorage.setItem(`${STORAGE_KEY_PREFIX}${channelId}`, JSON.stringify(parsed));
            } catch {}
            return;
          } else if (error) {
            console.warn('Database error fetching channel messages:', error);
          }
        }

        // Demo/unconfigured fallback
        if (!isConfigured || !userId) {
          const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${channelId}`);
          if (stored) {
            setMessages(JSON.parse(stored));
          } else {
            setMessages([]);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch channel messages:', e);
      } finally {
        isFetchingRef.current = false;
        if (activeChannelIdRef.current === channelId) {
          setIsLoading(false);
        }
      }
    },
    [channelId, userId, isConfigured, isUUID, supabase]
  );
  fetchChannelMessagesRef.current = fetchChannelMessages;

  // Load older messages using keyset cursor on created_at (M1)
  const loadMore = React.useCallback(async () => {
    if (!channelId || isLoadingMore || !hasMore || isFetchingRef.current || !userId || !isConfigured || !isUUID) return;

    const oldest = messages[0];
    if (!oldest?.created_at) return;

    setIsLoadingMore(true);
    isFetchingRef.current = true;
    const currentGen = generationRef.current;

    try {
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
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (activeChannelIdRef.current !== channelId || generationRef.current !== currentGen) return;

      if (!error && data) {
        if (data.length === 0) {
          setHasMore(false);
          return;
        }

        const olderChronological: ChannelMessage[] = [...data].reverse().map((m) => ({
          id: m.id,
          channel_id: m.channel_id,
          user_id: m.user_id,
          content: m.content ?? '',
          created_at: m.created_at,
          updated_at: m.updated_at,
          status: 'sent' as const,
          profile: (m.profile as unknown as UserProfile) || undefined,
        }));

        olderChronological.forEach((m) => addBoundedSet(seenIdsRef.current, m.id, MAX_SEEN_CHANNEL_MESSAGES));

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const filteredOlder = olderChronological.filter((m) => !existingIds.has(m.id));
          return [...filteredOlder, ...prev];
        });

        setHasMore(data.length >= PAGE_SIZE);
      }
    } catch (e) {
      console.warn('Failed to load older channel messages:', e);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [channelId, isLoadingMore, hasMore, messages, userId, isConfigured, isUUID, supabase]);

  // Realtime subscription setup
  React.useEffect(() => {
    if (prevChannelIdRef.current !== channelId) {
      prevChannelIdRef.current = channelId;
      seenIdsRef.current.clear();
      const cached = getCachedChannelMessages(channelId);
      setMessages(cached);
      setIsLoading(cached.length === 0);
    }

    if (!channelId || !isConfigured || !userId) {
      return () => {};
    }

    fetchChannelMessages(true);

    let reconnectTimeout: NodeJS.Timeout | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let isCleanedUp = false;

    const setupChannel = () => {
      if (isCleanedUp) return;

      const channelName = `channel:${channelId}:chat`;
      const ch = realtimeHub.acquire(
        channelName,
        {
          config: { private: true, broadcast: { self: false } },
        },
        supabase
      );

      ch.on('broadcast', { event: 'new_channel_msg' }, async ({ payload }) => {
        if (payload?.message?.id && channelId) {
          const incoming = payload.message as ChannelMessage;
          if (incoming.channel_id !== channelId) return;
          if (seenIdsRef.current.has(incoming.id)) return;
          // Verify authenticity and content by fetching row from DB (A2)
          try {
            const { data, error } = await supabase
              .from('channel_messages')
              .select(`
                id, channel_id, user_id, content, created_at, updated_at,
                profile:user_id (
                  id, username, display_name, avatar_url, banner_url, banner_color,
                  bio, custom_status, status, game_activity, created_at, updated_at
                )
              `)
              .eq('id', incoming.id)
              .eq('channel_id', channelId)
              .maybeSingle();

            if (!error && data && activeChannelIdRef.current === channelId) {
              addBoundedSet(seenIdsRef.current, data.id, MAX_SEEN_CHANNEL_MESSAGES);
              setMessages((prev) => {
                if (prev.some((m) => m.id === data.id)) return prev;
                const verifiedMsg: ChannelMessage = {
                  id: data.id,
                  channel_id: data.channel_id,
                  user_id: data.user_id,
                  content: data.content ?? '',
                  created_at: data.created_at,
                  updated_at: data.updated_at,
                  status: 'sent',
                  profile: (data.profile as unknown as UserProfile) || undefined,
                };
                return [...prev, verifiedMsg];
              });
            }
          } catch {
            // DB lookup failed or unauthorized - ignore unverified broadcast
          }
        }
      });

      if (isUUID) {
        ch.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'channel_messages',
            filter: `channel_id=eq.${channelId}`,
          },
          (payload) => {
            const newRow = payload.new as any;
            if (!newRow?.id) return;
            if (newRow.channel_id && newRow.channel_id !== channelId) return;
            addBoundedSet(seenIdsRef.current, newRow.id, MAX_SEEN_CHANNEL_MESSAGES);

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
              const newMsg: ChannelMessage = {
                id: newRow.id,
                channel_id: newRow.channel_id,
                user_id: newRow.user_id,
                content: newRow.content ?? '',
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
            table: 'channel_messages',
            filter: `channel_id=eq.${channelId}`,
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
            table: 'channel_messages',
            filter: `channel_id=eq.${channelId}`,
          },
          (payload) => {
            const oldRow = payload.old as any;
            if (oldRow?.id) {
              setMessages((prev) => {
                const next = prev.filter((m) => m.id !== oldRow.id);
                try {
                  localStorage.setItem(
                    `${STORAGE_KEY_PREFIX}${channelId}`,
                    JSON.stringify(next.filter((m) => m.status === 'sent'))
                  );
                } catch {}
                return next;
              });
            }
          }
        );
      }

      ch.subscribe((status, err) => {
        debugLogger.info('realtime', `Server channel [${channelName}] status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          debugLogger.success('realtime', `Connected to channel chat for channel ${channelId}`);
          stopFallbackPolling();
          if (isUUID) fetchChannelMessages();
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          debugLogger.warn('realtime', `Server channel disconnected (${status}). Starting fallback polling...`);
          startFallbackPolling();
          if (!reconnectTimeout && !isCleanedUp) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              setupChannel();
            }, 2500);
          }
        }
      });

      channelRef.current = ch;
    };

    setupChannel();

    // Heartbeat ping every 20 seconds to keep channel socket active
    heartbeatTimer = setInterval(() => {
      if (channelRef.current && channelRef.current.state === 'joined') {
        channelRef.current.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: { timestamp: Date.now() },
        }).catch(() => {});
      } else if (channelRef.current && (channelRef.current.state === 'closed' || channelRef.current.state === 'errored')) {
        setupChannel();
      }
    }, 20000);

    const handleFocus = () => {
      if (isUUID && document.visibilityState === 'visible') fetchChannelMessages();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleFocus);
    }

    return () => {
      isCleanedUp = true;
      stopFallbackPolling();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleFocus);
      }
      if (channelRef.current) {
        channelRef.current = null;
        realtimeHub.release(`channel:${channelId}:chat`, 1000);
      }
    };
  }, [channelId, fetchChannelMessages, isConfigured, userId, isUUID, supabase, stopFallbackPolling, startFallbackPolling]);

  const sendMessage = React.useCallback(
    async (content: string): Promise<{ error: string | null }> => {
      const trimmed = (content ?? '').trim();
      if (!channelId || !trimmed) return { error: 'Empty message' };

      // M7: Enforce 4000 character maximum length limit
      if (content && content.length > MAX_CONTENT_LENGTH) {
        return { error: 'Message exceeds maximum length of 4000 characters' };
      }

      if (isConfigured && !user) {
        return { error: 'User is not authenticated' };
      }

      // Local demo mode simulation
      if (!isConfigured) {
        const demoMsg: ChannelMessage = {
          id: `demo-${Date.now()}`,
          channel_id: channelId,
          user_id: user?.id || 'demo-user',
          content: trimmed,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'sent',
          profile: profile || undefined,
        };
        setMessages((prev) => {
          const next = [...prev, demoMsg];
          try {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${channelId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        return { error: null };
      }

      if (!isUUID) {
        return { error: 'Invalid channel ID. Production messages require a valid channel UUID.' };
      }

      if (!user) {
        return { error: 'User is not authenticated' };
      }

      // Generate stable client nonce / message UUID (M3)
      const messageId = crypto.randomUUID();

      const optimisticMsg: ChannelMessage = {
        id: messageId,
        client_nonce: messageId,
        channel_id: channelId,
        user_id: user.id,
        content: trimmed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'sending',
        profile: profile || undefined,
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const insertPromise = supabase.from('channel_messages').insert({
          id: messageId, // Passes client draft ID as primary key (M3)
          channel_id: channelId,
          user_id: user.id,
          content: trimmed,
        });

        const timeoutPromise = new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Network request timed out after 8s')), 8000)
        );

        let insertErr: any = null;
        try {
          const insertRes = await Promise.race([insertPromise, timeoutPromise]);
          insertErr = insertRes?.error || null;
        } catch (raceErr: any) {
          insertErr = raceErr;
        }

        if (insertErr) {
          const errMsg = insertErr?.message || 'Failed to persist channel message';
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: 'failed', error: errMsg } : m))
          );
          return { error: errMsg };
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'sent', error: undefined } : m))
        );

        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'new_channel_msg',
            payload: { message: { ...optimisticMsg, status: 'sent' } },
          }).catch(() => {});
        }

        return { error: null };
      } catch (err: any) {
        const errMsg = err?.message || 'Failed to send channel message';
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'failed', error: errMsg } : m))
        );
        return { error: errMsg };
      }
    },
    [channelId, isConfigured, user, profile, isUUID, supabase]
  );

  const retryMessage = React.useCallback(
    async (messageId: string): Promise<{ error: string | null }> => {
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return { error: 'Message not found' };

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: 'sending', error: undefined } : m))
      );

      try {
        const { error } = await supabase.from('channel_messages').insert({
          id: msg.id,
          channel_id: msg.channel_id,
          user_id: msg.user_id,
          content: msg.content,
        });

        if (error) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: 'failed', error: error.message } : m))
          );
          return { error: error.message };
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'sent', error: undefined } : m))
        );
        return { error: null };
      } catch (err: any) {
        const errMsg = err?.message || 'Retry failed';
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'failed', error: errMsg } : m))
        );
        return { error: errMsg };
      }
    },
    [messages, supabase]
  );

  const deleteMessage = React.useCallback(
    async (messageId: string): Promise<{ error: string | null }> => {
      if (!isConfigured) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return { error: null };
      }

      const { error } = await supabase
        .from('channel_messages')
        .delete()
        .eq('id', messageId);

      if (error) {
        console.error('Failed to delete channel message:', error);
        return { error: error.message };
      }

      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== messageId);
        try {
          localStorage.setItem(
            `${STORAGE_KEY_PREFIX}${channelId}`,
            JSON.stringify(next.filter((m) => m.status === 'sent'))
          );
        } catch {}
        return next;
      });
      return { error: null };
    },
    [channelId, isConfigured, supabase]
  );

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    sendMessage,
    retryMessage,
    deleteMessage,
  };
}
