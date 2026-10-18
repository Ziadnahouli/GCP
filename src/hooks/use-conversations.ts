'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { Conversation } from '@/lib/types/messaging';
import { UserProfile } from '@/lib/types/profile';

const getCachedConversations = (uId?: string): Conversation[] => {
  if (!uId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`nexus_conversations_${uId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

export function useConversationsInternal() {
  const { user, isConfigured } = useAuth();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [conversations, setConversations] = React.useState<Conversation[]>(() =>
    getCachedConversations(user?.id)
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(() =>
    getCachedConversations(user?.id).length === 0
  );
  const isFetchingRef = React.useRef(false);
  const conversationsCountRef = React.useRef(conversations.length);
  React.useEffect(() => {
    conversationsCountRef.current = conversations.length;
  }, [conversations.length]);

  const fetchConversations = React.useCallback(async (silent = false) => {
    if (!user) {
      setConversations([]);
      setIsLoading(false);
      return;
    }

    try {
      if (!silent && conversationsCountRef.current === 0) {
        setIsLoading(true);
      }

      // Fetch conversations where current user is a member
      const { data: memberRows, error: memberErr } = await supabase
        .from('conversation_members')
        .select(`
          conversation_id,
          conversation:conversation_id (
            id, type, name, icon_url, created_by, created_at, updated_at
          )
        `)
        .eq('user_id', user.id);

      if (memberErr || !memberRows) {
        setConversations([]);
        return;
      }

      // Filter out orphaned conversation member rows where conversation row is null
      const validMemberRows = (memberRows || []).filter(
        (row) => Boolean(row && row.conversation && typeof row.conversation === 'object' && (row.conversation as any).id)
      );

      const convIds = validMemberRows.map((r) => r.conversation_id);
      if (convIds.length === 0) {
        setConversations([]);
        return;
      }

      // Fetch all members for these conversations with profiles
      const { data: allMembers } = await supabase
        .from('conversation_members')
        .select(`
          id, conversation_id, user_id, role, last_read_at, joined_at,
          profile:user_id (
            id, username, display_name, avatar_url, banner_url, banner_color,
            bio, custom_status, status, game_activity, created_at, updated_at
          )
        `)
        .in('conversation_id', convIds);

      // Fetch last messages for each conversation
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false });

      const parsed: Conversation[] = validMemberRows.map((row) => {
        const conv = row.conversation as unknown as Conversation;
        const members = (allMembers || [])
          .filter((m) => m && m.conversation_id === conv.id)
          .map((m) => ({
            ...m,
            profile: (m.profile as unknown as UserProfile) || undefined,
          }));

        const lastMsg = (lastMsgs || []).find((m) => m && m.conversation_id === conv.id) || null;

        // Calculate actual unread count:
        const myMembership = (allMembers || []).find(
          (m) => m && m.conversation_id === conv.id && m.user_id === user.id
        );
        const myLastRead = myMembership?.last_read_at ? new Date(myMembership.last_read_at).getTime() : 0;
        const convMsgs = (lastMsgs || []).filter((m) => m && m.conversation_id === conv.id);
        const unreadCount = convMsgs.filter(
          (m) => m.sender_id !== user.id && new Date(m.created_at).getTime() > myLastRead
        ).length;

        return {
          ...conv,
          members,
          last_message: lastMsg,
          unread_count: unreadCount,
        };
      });

      // Sort by latest message or updated_at
      parsed.sort((a, b) => {
        const dateA = a.last_message?.created_at || a.updated_at;
        const dateB = b.last_message?.created_at || b.updated_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setConversations(parsed);
      try {
        if (user?.id) {
          localStorage.setItem(`nexus_conversations_${user.id}`, JSON.stringify(parsed));
        }
      } catch {}
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [user, supabase]);

  React.useEffect(() => {
    fetchConversations();

    if (!isConfigured || !user) return;

    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members' },
        () => fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchConversations()
      )
      .on('broadcast', { event: 'conv_update' }, () => {
        fetchConversations();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchConversations();
        }
      });

    // Fallback sync poll (25s when visible)
    const autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchConversations();
    }, 25000);

    // Immediate sync on tab focus or visibility resume
    const handleFocus = () => {
      fetchConversations();
    };
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchConversations();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      clearInterval(autoSyncTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, isConfigured, user, supabase]);

  // Create or retrieve 1-to-1 direct conversation with a friend
  const getOrCreateDirectConversation = async (
    targetUserId: string
  ): Promise<{ conversationId: string | null; error: string | null }> => {
    if (!user) {
      if (!isConfigured) {
        return { conversationId: 'demo-conv-1', error: null };
      }
      return { conversationId: null, error: 'User is not authenticated' };
    }

    if (!isConfigured) {
      return { conversationId: 'demo-conv-1', error: null };
    }

    try {
      // 1. First attempt the database RPC
      const { data, error } = await supabase.rpc('create_or_get_direct_conversation', {
        target_user_id: targetUserId,
      });

      if (!error && data) {
        fetchConversations().catch(() => {});
        return { conversationId: data as string, error: null };
      }

      // 2. Fallback: Query conversation_members directly for an existing 1-to-1 conversation
      const { data: myMemberRows } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (myMemberRows && myMemberRows.length > 0) {
        const myConvIds = myMemberRows.map((r) => r.conversation_id);
        const { data: targetMemberRows } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .in('conversation_id', myConvIds)
          .eq('user_id', targetUserId);

        if (targetMemberRows && targetMemberRows.length > 0) {
          const existingId = targetMemberRows[0].conversation_id;
          fetchConversations().catch(() => {});
          return { conversationId: existingId, error: null };
        }
      }

      // 3. Fallback: Create conversation directly as creator
      const newConvId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `conv-${Date.now()}`;

      const { error: insertConvErr } = await supabase.from('conversations').insert({
        id: newConvId,
        type: 'direct',
        created_by: user.id,
      });

      if (!insertConvErr) {
        await supabase.from('conversation_members').insert([
          { conversation_id: newConvId, user_id: user.id, role: 'member' },
          { conversation_id: newConvId, user_id: targetUserId, role: 'member' },
        ]);
        fetchConversations().catch(() => {});
        return { conversationId: newConvId, error: null };
      }

      return {
        conversationId: null,
        error: error?.message || insertConvErr?.message || 'Failed to open conversation',
      };
    } catch (err: unknown) {
      return {
        conversationId: null,
        error: err instanceof Error ? err.message : 'Failed to open conversation',
      };
    }
  };

  const createGroupConversation = async (
    name: string,
    memberIds: string[],
    iconUrl?: string
  ): Promise<{ conversationId: string | null; error: string | null }> => {
    if (!user) return { conversationId: null, error: 'User is not authenticated' };
    try {
      const { data, error } = await supabase.rpc('create_group_conversation', {
        p_name: name,
        p_member_ids: memberIds,
        p_icon_url: iconUrl || null,
      });

      if (error) throw error;
      await fetchConversations(true);
      return { conversationId: data as string, error: null };
    } catch (err: any) {
      return { conversationId: null, error: err?.message || 'Failed to create group conversation' };
    }
  };

  const addGroupMembers = async (
    conversationId: string,
    userIds: string[]
  ): Promise<{ success: boolean; error: string | null }> => {
    if (!user) return { success: false, error: 'User is not authenticated' };
    try {
      const { error } = await supabase.rpc('add_group_members', {
        p_conversation_id: conversationId,
        p_user_ids: userIds,
      });

      if (error) throw error;
      await fetchConversations(true);
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to add members' };
    }
  };

  const removeGroupMember = async (
    conversationId: string,
    userId: string
  ): Promise<{ success: boolean; error: string | null }> => {
    if (!user) return { success: false, error: 'User is not authenticated' };
    try {
      const { error } = await supabase.rpc('remove_group_member', {
        p_conversation_id: conversationId,
        p_user_id: userId,
      });

      if (error) throw error;
      await fetchConversations(true);
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to remove member' };
    }
  };

  const leaveGroup = async (
    conversationId: string
  ): Promise<{ success: boolean; error: string | null }> => {
    if (!user) return { success: false, error: 'User is not authenticated' };
    try {
      const { error } = await supabase.rpc('leave_group_conversation', {
        p_conversation_id: conversationId,
      });

      if (error) throw error;
      await fetchConversations(true);
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to leave group' };
    }
  };

  const updateGroupMetadata = async (
    conversationId: string,
    updates: { name?: string; icon_url?: string }
  ): Promise<{ success: boolean; error: string | null }> => {
    if (!user) return { success: false, error: 'User is not authenticated' };
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) throw error;
      await fetchConversations(true);
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update group metadata' };
    }
  };

  const markConversationAsRead = React.useCallback(
    async (convId: string) => {
      if (!user?.id || !convId) return;

      // Optimistically clear unread count in local state immediately
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );

      try {
        const now = new Date().toISOString();
        await supabase
          .from('conversation_members')
          .update({ last_read_at: now })
          .eq('conversation_id', convId)
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Failed to update last_read_at:', err);
      }
    },
    [user, supabase]
  );

  return {
    conversations,
    isLoading,
    getOrCreateDirectConversation,
    createGroupConversation,
    addGroupMembers,
    removeGroupMember,
    leaveGroup,
    updateGroupMetadata,
    markConversationAsRead,
    refetch: fetchConversations,
  };
}

export type UseConversationsReturn = ReturnType<typeof useConversationsInternal>;

const ConversationsContext = React.createContext<UseConversationsReturn | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const value = useConversationsInternal();
  return React.createElement(ConversationsContext.Provider, { value }, children);
}

export function useConversations(): UseConversationsReturn {
  const context = React.useContext(ConversationsContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationsProvider');
  }
  return context;
}
