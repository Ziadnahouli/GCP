'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { Conversation } from '@/lib/types/messaging';
import { UserProfile } from '@/lib/types/profile';

export function useConversations() {
  const { user, isConfigured } = useAuth();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const isFetchingRef = React.useRef(false);

  const fetchConversations = React.useCallback(async () => {
    if (!user) {
      setConversations([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

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

      const convIds = memberRows.map((r) => r.conversation_id);
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

      const parsed: Conversation[] = memberRows.map((row) => {
        const conv = row.conversation as unknown as Conversation;
        const members = (allMembers || [])
          .filter((m) => m.conversation_id === conv.id)
          .map((m) => ({
            ...m,
            profile: m.profile as unknown as UserProfile,
          }));

        const lastMsg = (lastMsgs || []).find((m) => m.conversation_id === conv.id) || null;

        return {
          ...conv,
          members,
          last_message: lastMsg,
          unread_count: 0,
        };
      });

      // Sort by latest message or updated_at
      parsed.sort((a, b) => {
        const dateA = a.last_message?.created_at || a.updated_at;
        const dateB = b.last_message?.created_at || b.updated_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setConversations(parsed);
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
    if (isConfigured && !user) {
      return { conversationId: null, error: 'User is not authenticated' };
    }

    if (!isConfigured) {
      return { conversationId: 'demo-conv-1', error: null };
    }

    try {
      // Call RPC function
      const { data, error } = await supabase.rpc('create_or_get_direct_conversation', {
        target_user_id: targetUserId,
      });

      if (error) {
        return { conversationId: null, error: error.message };
      }

      await fetchConversations();
      return { conversationId: data as string, error: null };
    } catch (err: unknown) {
      return {
        conversationId: null,
        error: err instanceof Error ? err.message : 'Failed to open conversation',
      };
    }
  };

  return {
    conversations,
    isLoading,
    getOrCreateDirectConversation,
    refetch: fetchConversations,
  };
}
