'use client';

import * as React from 'react';
import { ChannelMessage } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';
import { debugLogger } from '@/lib/logger/debug-logger';

const STORAGE_KEY_PREFIX = 'nexus_channel_msgs_';

export function useChannelMessages(channelId: string | null) {
  const { user, profile, isConfigured } = useAuth();
  const supabase = React.useMemo(() => getBrowserClient(), []);
  const [messages, setMessages] = React.useState<ChannelMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const channelRef = React.useRef<any>(null);
  const activeChannelIdRef = React.useRef<string | null>(channelId);
  const prevChannelIdRef = React.useRef<string | null>(null);
  const isFetchingRef = React.useRef(false);

  React.useEffect(() => {
    activeChannelIdRef.current = channelId;
  }, [channelId]);

  const isUUID = React.useMemo(() => {
    return channelId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId) : false;
  }, [channelId]);

  const userId = user?.id;

  const fetchChannelMessages = React.useCallback(async (isInitial = false) => {
    if (!channelId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const channelChanged = prevChannelIdRef.current !== channelId;
    if (channelChanged) {
      prevChannelIdRef.current = channelId;
      setMessages([]);
      setIsLoading(true);
    } else if (isInitial) {
      // Background revalidation: keep existing messages visible while loading
    }

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
          .order('created_at', { ascending: true });

        // Guard against race conditions if user switched channels while fetch was in-flight
        if (activeChannelIdRef.current !== channelId) return;

        if (!error && data) {
          const parsed: ChannelMessage[] = data.map((m) => ({
            id: m.id,
            channel_id: m.channel_id,
            user_id: m.user_id,
            content: m.content,
            created_at: m.created_at,
            updated_at: m.updated_at,
            status: 'sent' as const,
            profile: (m.profile as unknown as UserProfile) || undefined,
          }));

          setMessages((prev) => {
            const combined = [...parsed];
            for (const p of prev) {
              if (p.channel_id === channelId && !combined.some((c) => c.id === p.id)) {
                // Deduplicate: If p is an optimistic message whose content was already saved in parsed messages, drop it
                const alreadyPersisted =
                  combined.some(
                    (c) =>
                      c.user_id === p.user_id &&
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
  }, [channelId, userId, isConfigured, isUUID, supabase]);

  React.useEffect(() => {
    if (prevChannelIdRef.current !== channelId) {
      prevChannelIdRef.current = channelId;
      setMessages([]);
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

      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {}
      }

      const channelName = `chan-room-${channelId}`;
      const ch = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      ch.on('broadcast', { event: 'new_channel_msg' }, ({ payload }) => {
        if (payload?.message) {
          const incoming = payload.message as ChannelMessage;
          if (incoming.channel_id !== channelId) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
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
            setMessages((prev) => {
              const existingIdx = prev.findIndex((m) => m.id === newRow.id);
              if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  ...newRow,
                  status: 'sent',
                };
                return updated;
              }
              fetchChannelMessages();
              return prev;
            });
          }
        );
      }

      ch.subscribe((status, err) => {
        debugLogger.info('realtime', `Server channel [${channelName}] status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          debugLogger.success('realtime', `Connected to channel chat for channel ${channelId}`);
          if (isUUID) fetchChannelMessages();
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          debugLogger.warn('realtime', `Server channel disconnected (${status}). Auto-reconnecting in 2.5s with full listeners...`);
          if (isUUID) fetchChannelMessages();
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

    // Fast-adaptive background poll (3.5s when active tab):
    // Guarantees real-time delivery without requiring page refresh
    const autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isUUID) {
        fetchChannelMessages();
      }
    }, 3500);

    // Heartbeat ping every 20 seconds to keep channel socket active and revive dropped sockets
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

    // Immediate sync on tab focus or visibility resume
    const handleFocus = () => {
      if (isUUID) fetchChannelMessages();
    };
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden && isUUID) {
        fetchChannelMessages();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      isCleanedUp = true;
      clearInterval(autoSyncTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelId, fetchChannelMessages, isConfigured, userId, isUUID, supabase]);

  const sendMessage = React.useCallback(
    async (content: string): Promise<{ error: string | null }> => {
      const trimmed = content.trim();
      if (!channelId || !trimmed) return { error: 'Empty message' };

      if (isConfigured && !user) {
        return { error: 'User is not authenticated' };
      }

      // Local demo mode simulation ONLY when Supabase is not configured
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

      // Generate a stable UUID for the message
      const messageId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8005-${Date.now().toString(16).padStart(12, '0')}`;

      const optimisticMsg: ChannelMessage = {
        id: messageId,
        channel_id: channelId,
        user_id: user.id,
        content: trimmed,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'sending',
        profile: profile || undefined,
      };

      // 1. Add optimistic message to UI with 'sending' status
      setMessages((prev) => [...prev, optimisticMsg]);

      // 2. Persist to Supabase BEFORE considering delivered
      try {
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


        debugLogger.info('channel_messaging', `Initiating channel message send (${trimmed.length} chars) to channel ${channelId}`, {
          messageId,
          userId: user.id,
        });

        const insertStartTime = performance.now();
        const insertPromise = supabase.from('channel_messages').insert({
          id: messageId,
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

        const insertDurationMs = Math.round(performance.now() - insertStartTime);

        // Auto-recovery: If rejected due to RLS/auth/JWT expiration or PGRST301, refresh session and retry once
        if (insertErr) {
          debugLogger.warn('channel_messaging', `Channel message insert failed (${insertDurationMs}ms): [${(insertErr as any).code}] ${insertErr.message}`, insertErr);
          const errLower = (insertErr.message || '').toLowerCase();
          const isAuthOrRls =
            errLower.includes('jwt') ||
            errLower.includes('security') ||
            errLower.includes('rls') ||
            errLower.includes('unauthorized') ||
            errLower.includes('authenticated') ||
            (insertErr as any).code === 'PGRST301' ||
            (insertErr as any).code === '42501';

          if (isAuthOrRls && supabase.auth?.refreshSession) {
            try {
              debugLogger.info('auth', 'Channel message insert rejected by auth/RLS. Refreshing session...');
              console.warn('Channel message insert auth issue detected, refreshing session and retrying...');
              const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
              if (refErr) {
                debugLogger.error('auth', `Token auto-refresh failed: ${refErr.message}`, refErr);
              }
              if (refreshed?.session?.user) {
                debugLogger.success('auth', 'Token renewed. Retrying channel message insert...');
                const retryRes = await supabase.from('channel_messages').insert({
                  id: messageId,
                  channel_id: channelId,
                  user_id: user.id,
                  content: trimmed,
                });
                if (!retryRes.error) {
                  insertErr = null;
                  debugLogger.success('channel_messaging', 'Channel message insert retry succeeded.');
                } else {
                  debugLogger.error('channel_messaging', `Retry insert failed: ${retryRes.error.message}`, retryRes.error);
                }
              }
            } catch (refreshErr) {
              debugLogger.error('auth', 'Exception during auto session refresh:', refreshErr);
              console.warn('Auto session refresh retry failed:', refreshErr);
            }
          }
        }

        if (insertErr) {
          debugLogger.error('channel_messaging', `Failed to persist channel message: ${insertErr.message}`, {
            error: insertErr,
            channelId,
            userId: user.id,
          });
          console.error('Failed to persist channel message:', insertErr);
          // Mark optimistic message as failed
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, status: 'failed', error: insertErr.message } : m
            )
          );
          return { error: insertErr.message || 'Failed to send message to database' };
        }

        debugLogger.success('channel_messaging', `Channel message saved to database (${insertDurationMs}ms): id=${messageId}`);

        // 3. Mark message as sent
        const sentMsg: ChannelMessage = {
          ...optimisticMsg,
          status: 'sent',
        };

        setMessages((prev) => {
          const updated = prev.map((m) => (m.id === messageId ? sentMsg : m));
          try {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${channelId}`, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        // 4. Broadcast to peers ONLY AFTER successful database persistence
        if (channelRef.current) {
          if (channelRef.current.state === 'joined') {
            channelRef.current
              .send({
                type: 'broadcast',
                event: 'new_channel_msg',
                payload: { message: sentMsg },
              })
              .catch((bcErr: unknown) => {
                console.warn('Realtime channel broadcast warning:', bcErr);
              });
          } else if (typeof channelRef.current.httpSend === 'function') {
            channelRef.current
              .httpSend({
                type: 'broadcast',
                event: 'new_channel_msg',
                payload: { message: sentMsg },
              })
              .catch(() => {});
          }
        }

        // Fast authoritative follow-up reconciliations
        setTimeout(() => {
          if (activeChannelIdRef.current === channelId) {
            fetchChannelMessages();
          }
        }, 400);

        setTimeout(() => {
          if (activeChannelIdRef.current === channelId) {
            fetchChannelMessages();
          }
        }, 1200);

        return { error: null };
      } catch (err: unknown) {
        console.error('Channel send exception:', err);
        const errMsg = err instanceof Error ? err.message : 'Network error sending channel message';
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'failed', error: errMsg } : m))
        );
        return { error: errMsg };
      }
    },
    [channelId, isConfigured, user, profile, isUUID, supabase, fetchChannelMessages]
  );

  const retryMessage = React.useCallback(
    async (messageId: string): Promise<{ error: string | null }> => {
      const target = messages.find((m) => m.id === messageId && m.status === 'failed');
      if (!target) return { error: 'Message not found or not in failed state' };

      // Remove the failed message and re-send
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      return sendMessage(target.content);
    },
    [messages, sendMessage]
  );

  return {
    messages,
    isLoading,
    sendMessage,
    retryMessage,
  };
}
