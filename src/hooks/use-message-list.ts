'use client';

import * as React from 'react';

export interface BaseMessage {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  status?: 'sending' | 'sent' | 'failed';
  error?: string;
  client_nonce?: string;
}

export interface UseMessageListOptions<T extends BaseMessage> {
  targetId: string | null;
  cacheKeyPrefix: string;
  pageSize?: number;
  fetchBatch: (cursor: { targetId: string; beforeCreatedAt?: string; limit: number }) => Promise<T[]>;
  persistMessage: (draft: T) => Promise<{ id?: string; error?: string | null }>;
  deleteMessageRecord?: (messageId: string) => Promise<{ error?: string | null }>;
  onAfterMessagesChanged?: (messages: T[]) => void;
}

export function useMessageList<T extends BaseMessage>({
  targetId,
  cacheKeyPrefix,
  pageSize = 50,
  fetchBatch,
  persistMessage,
  deleteMessageRecord,
  onAfterMessagesChanged,
}: UseMessageListOptions<T>) {
  const activeTargetIdRef = React.useRef<string | null>(targetId);
  const prevTargetIdRef = React.useRef<string | null>(targetId);
  const isFetchingRef = React.useRef(false);
  const generationRef = React.useRef(0);
  const typingTimersRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const getStorageKey = React.useCallback(
    (id: string | null) => (id ? `${cacheKeyPrefix}${id}` : ''),
    [cacheKeyPrefix]
  );

  // Hydrate initial messages from cache safely
  const [messages, setMessages] = React.useState<T[]>(() => {
    if (!targetId || typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(getStorageKey(targetId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [isLoading, setIsLoading] = React.useState<boolean>(() => {
    if (!targetId || typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(getStorageKey(targetId));
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

  React.useEffect(() => {
    activeTargetIdRef.current = targetId;
  }, [targetId]);

  // Clean up all typing debounce timers
  const clearTypingTimers = React.useCallback(() => {
    typingTimersRef.current.forEach((timer) => clearTimeout(timer));
    typingTimersRef.current.clear();
    setTypingUsers([]);
  }, []);

  // Stop polling interval
  const stopPolling = React.useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Handle typing event with Map<username, Timeout> (M5 Anti-flicker)
  const registerTypingUser = React.useCallback((username: string) => {
    if (!username) return;
    const existing = typingTimersRef.current.get(username);
    if (existing) {
      clearTimeout(existing);
    }

    setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));

    const timer = setTimeout(() => {
      typingTimersRef.current.delete(username);
      setTypingUsers((prev) => prev.filter((u) => u !== username));
    }, 3000);

    typingTimersRef.current.set(username, timer);
  }, []);

  // Keyset fetch (M1)
  const fetchMessages = React.useCallback(
    async (isInitial = false) => {
      if (!targetId) {
        setMessages([]);
        setIsLoading(false);
        setHasMore(false);
        return;
      }

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      const currentGen = ++generationRef.current;

      try {
        const targetChanged = prevTargetIdRef.current !== targetId;
        if (targetChanged) {
          prevTargetIdRef.current = targetId;
          clearTypingTimers();
          let cached: T[] = [];
          try {
            const raw = localStorage.getItem(getStorageKey(targetId));
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) cached = parsed;
            }
          } catch {}
          setMessages(cached);
          setIsLoading(cached.length === 0);
        }

        const batch = await fetchBatch({ targetId, limit: pageSize });

        // Stale response or generation guard (M4)
        if (activeTargetIdRef.current !== targetId || generationRef.current !== currentGen) return;

        // Batch comes newest-first from keyset query, reverse to chronological (oldest-first)
        const chronological = [...batch].reverse();

        setMessages((prev) => {
          // Retain pending optimistic and failed messages
          const pending = prev.filter((m) => m.status === 'sending' || m.status === 'failed');
          const combined = [...chronological];
          for (const p of pending) {
            if (!combined.some((c) => c.id === p.id)) {
              combined.push(p);
            }
          }
          combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return combined;
        });

        setHasMore(batch.length >= pageSize);
      } catch (err) {
        console.warn('Failed to fetch messages batch:', err);
      } finally {
        isFetchingRef.current = false;
        if (activeTargetIdRef.current === targetId) {
          setIsLoading(false);
        }
      }
    },
    [targetId, pageSize, fetchBatch, getStorageKey, clearTypingTimers]
  );

  // Load more older messages via keyset cursor (M1)
  const loadMore = React.useCallback(async () => {
    if (!targetId || isLoadingMore || !hasMore || isFetchingRef.current) return;

    const oldestMessage = messages[0];
    if (!oldestMessage?.created_at) return;

    setIsLoadingMore(true);
    isFetchingRef.current = true;
    const currentGen = generationRef.current;

    try {
      const olderBatch = await fetchBatch({
        targetId,
        beforeCreatedAt: oldestMessage.created_at,
        limit: pageSize,
      });

      if (activeTargetIdRef.current !== targetId || generationRef.current !== currentGen) return;

      if (olderBatch.length === 0) {
        setHasMore(false);
        return;
      }

      const olderChronological = [...olderBatch].reverse();

      setMessages((prev) => {
        // Prepend older batch without duplicate IDs
        const existingIds = new Set(prev.map((m) => m.id));
        const filteredOlder = olderChronological.filter((m) => !existingIds.has(m.id));
        return [...filteredOlder, ...prev];
      });

      setHasMore(olderBatch.length >= pageSize);
    } catch (err) {
      console.warn('Failed to load older messages batch:', err);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [targetId, isLoadingMore, hasMore, messages, pageSize, fetchBatch]);

  // Send message with client nonce & optimistic UI (M3, M7)
  const send = React.useCallback(
    async (
      rawContent: string,
      createDraft: (draftId: string, sanitizedContent: string) => T
    ): Promise<{ messageId?: string; error: string | null }> => {
      const content = (rawContent ?? '').trim();

      // M7: Max 4000 character length limit
      if (rawContent && rawContent.length > 4000) {
        return { error: 'Message exceeds maximum length of 4000 characters' };
      }

      if (!targetId) {
        return { error: 'No active conversation or channel' };
      }

      const draftId = crypto.randomUUID();
      const draft = createDraft(draftId, content);
      draft.id = draftId;
      draft.client_nonce = draftId;
      draft.status = 'sending';

      // Insert optimistically
      setMessages((prev) => [...prev, draft]);

      try {
        const res = await persistMessage(draft);
        if (res.error) {
          setMessages((prev) =>
            prev.map((m) => (m.id === draftId ? { ...m, status: 'failed', error: res.error || 'Failed to send' } : m))
          );
          return { error: res.error };
        }

        const confirmedId = res.id || draftId;
        setMessages((prev) =>
          prev.map((m) => (m.id === draftId ? { ...m, id: confirmedId, status: 'sent', error: undefined } : m))
        );
        return { messageId: confirmedId, error: null };
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to send message';
        setMessages((prev) =>
          prev.map((m) => (m.id === draftId ? { ...m, status: 'failed', error: errorMsg } : m))
        );
        return { error: errorMsg };
      }
    },
    [targetId, persistMessage]
  );

  // Retry failed message (M3)
  const retry = React.useCallback(
    async (messageId: string): Promise<{ error: string | null }> => {
      const failed = messages.find((m) => m.id === messageId);
      if (!failed) return { error: 'Message not found' };

      // Set to sending state
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: 'sending', error: undefined } : m))
      );

      try {
        const res = await persistMessage(failed);
        if (res.error) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: 'failed', error: res.error || 'Retry failed' } : m))
          );
          return { error: res.error };
        }

        const confirmedId = res.id || messageId;
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, id: confirmedId, status: 'sent', error: undefined } : m))
        );
        return { error: null };
      } catch (err: any) {
        const msg = err?.message || 'Retry failed';
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'failed', error: msg } : m))
        );
        return { error: msg };
      }
    },
    [messages, persistMessage]
  );

  // Delete message
  const remove = React.useCallback(
    async (messageId: string): Promise<{ error: string | null }> => {
      if (deleteMessageRecord) {
        const res = await deleteMessageRecord(messageId);
        if (res.error) return { error: res.error };
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      return { error: null };
    },
    [deleteMessageRecord]
  );

  // Target change and unmount cleanup (M4)
  React.useEffect(() => {
    fetchMessages(true);

    return () => {
      clearTypingTimers();
      stopPolling();
    };
  }, [targetId, fetchMessages, clearTypingTimers, stopPolling]);

  return {
    messages,
    setMessages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    fetchMessages,
    send,
    retry,
    remove,
    typingUsers,
    registerTypingUser,
    clearTypingTimers,
    stopPolling,
  };
}
