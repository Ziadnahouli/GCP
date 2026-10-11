'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { FriendItem, FriendRequestItem, BlockedUserItem } from '@/lib/types/social';
import { UserProfile } from '@/lib/types/profile';
import { useToast } from '@/components/ui/toast';

export function useSocial() {
  const { user, isConfigured } = useAuth();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [friends, setFriends] = React.useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = React.useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = React.useState<FriendRequestItem[]>([]);
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUserItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const socialChannelRef = React.useRef<any>(null);

  // Fetch all social data
  const fetchSocialData = React.useCallback(async () => {
    if (!user) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setBlockedUsers([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // 1. Fetch friendships
      const { data: friendshipsData, error: friendsErr } = await supabase
        .from('friendships')
        .select(`
          id,
          created_at,
          friend:friend_id (
            id, username, display_name, avatar_url, banner_url, banner_color,
            bio, custom_status, status, game_activity, created_at, updated_at
          )
        `)
        .eq('user_id', user.id);

      if (!friendsErr && friendshipsData) {
        setFriends(
          friendshipsData.map((f) => ({
            id: f.id,
            created_at: f.created_at,
            friend: f.friend as unknown as UserProfile,
          }))
        );
      }

      // 2. Fetch incoming requests
      const { data: inReqData } = await supabase
        .from('friend_requests')
        .select(`
          id, sender_id, receiver_id, status, created_at,
          sender:sender_id (
            id, username, display_name, avatar_url, banner_url, banner_color,
            bio, custom_status, status, game_activity, created_at, updated_at
          )
        `)
        .eq('receiver_id', user.id)
        .eq('status', 'pending');

      if (inReqData) {
        setIncomingRequests(
          inReqData.map((r) => ({
            ...r,
            type: 'incoming',
            sender: r.sender as unknown as UserProfile,
          }))
        );
      }

      // 3. Fetch outgoing requests
      const { data: outReqData } = await supabase
        .from('friend_requests')
        .select(`
          id, sender_id, receiver_id, status, created_at,
          receiver:receiver_id (
            id, username, display_name, avatar_url, banner_url, banner_color,
            bio, custom_status, status, game_activity, created_at, updated_at
          )
        `)
        .eq('sender_id', user.id)
        .eq('status', 'pending');

      if (outReqData) {
        setOutgoingRequests(
          outReqData.map((r) => ({
            ...r,
            type: 'outgoing',
            receiver: r.receiver as unknown as UserProfile,
          }))
        );
      }

      // 4. Fetch blocked users
      const { data: blocksData } = await supabase
        .from('blocks')
        .select(`
          id, blocked_id, created_at,
          blocked_user:blocked_id (
            id, username, display_name, avatar_url, banner_url, banner_color,
            bio, custom_status, status, game_activity, created_at, updated_at
          )
        `)
        .eq('blocker_id', user.id);

      if (blocksData) {
        setBlockedUsers(
          blocksData.map((b) => ({
            id: b.id,
            blocked_id: b.blocked_id,
            created_at: b.created_at,
            blocked_user: b.blocked_user as unknown as UserProfile,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching social data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  // Initial fetch and Realtime subscription
  React.useEffect(() => {
    fetchSocialData();

    if (!isConfigured || !user) return;

    // Supabase Realtime channel for social changes
    const channel = supabase
      .channel('social-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => fetchSocialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => fetchSocialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks' },
        () => fetchSocialData()
      )
      .on('broadcast', { event: 'social_update' }, () => {
        fetchSocialData();
      })
      .subscribe();

    socialChannelRef.current = channel;

    // Auto-sync polling every 15s to ensure incoming requests & status changes stay fresh, pausing when tab is hidden
    const autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchSocialData();
    }, 15000);

    return () => {
      clearInterval(autoSyncTimer);
      socialChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [fetchSocialData, isConfigured, user, supabase]);

  // Send a friend request by username
  const sendFriendRequest = async (targetUsername: string) => {
    const cleanUsername = targetUsername.trim().toLowerCase().replace(/^@/, '');
    if (!cleanUsername) {
      toast({ title: 'Error', description: 'Please enter a username', type: 'error' });
      return { error: 'Please enter a username' };
    }

    if (!isConfigured || !user) {
      toast({
        title: 'Friend Request Sent',
        description: `Request sent to @${cleanUsername} (Simulated).`,
        type: 'success',
      });
      return { error: null };
    }

    try {
      // 1. Look up target profile
      const { data: targetProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', cleanUsername)
        .single();

      if (profileErr || !targetProfile) {
        const msg = `User @${cleanUsername} does not exist. Check spelling!`;
        toast({ title: 'User Not Found', description: msg, type: 'error' });
        return { error: msg };
      }

      if (targetProfile.id === user.id) {
        const msg = 'You cannot send a friend request to yourself.';
        toast({ title: 'Invalid Request', description: msg, type: 'error' });
        return { error: msg };
      }

      // 2. Check if already friends
      const { data: existingFriend } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_id', user.id)
        .eq('friend_id', targetProfile.id)
        .maybeSingle();

      if (existingFriend) {
        const msg = `You are already friends with @${cleanUsername}.`;
        toast({ title: 'Already Friends', description: msg, type: 'info' });
        return { error: msg };
      }

      // 3. Insert friend request
      const { error: insertErr } = await supabase.from('friend_requests').insert({
        sender_id: user.id,
        receiver_id: targetProfile.id,
        status: 'pending',
      });

      if (insertErr) {
        const msg = insertErr.message.includes('unique_pending_request')
          ? 'A friend request is already pending between you.'
          : insertErr.message;
        toast({ title: 'Request Error', description: msg, type: 'error' });
        return { error: msg };
      }

      toast({
        title: 'Friend Request Sent',
        description: `Friend request sent to @${cleanUsername}!`,
        type: 'success',
      });
      if (socialChannelRef.current) {
        socialChannelRef.current
          .send({ type: 'broadcast', event: 'social_update', payload: {} })
          .catch(() => {});
      }
      await fetchSocialData();
      return { error: null };
    } catch {
      return { error: 'Failed to send request' };
    }
  };

  // Accept incoming friend request
  const acceptRequest = async (requestId: string) => {
    if (!isConfigured || !user) {
      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
      toast({ title: 'Friend Added', description: 'Friend request accepted!', type: 'success' });
      return;
    }

    try {
      const { error } = await supabase.rpc('accept_friend_request', {
        request_id: requestId,
      });

      if (error) {
        // Fallback manual update if RPC is pending
        await supabase
          .from('friend_requests')
          .update({ status: 'accepted' })
          .eq('id', requestId);
      }

      toast({ title: 'Friend Added', description: 'Friend request accepted!', type: 'success' });
      if (socialChannelRef.current) {
        socialChannelRef.current
          .send({ type: 'broadcast', event: 'social_update', payload: {} })
          .catch(() => {});
      }
      await fetchSocialData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to accept request', type: 'error' });
    }
  };

  // Reject incoming friend request
  const rejectRequest = async (requestId: string) => {
    if (!isConfigured || !user) {
      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
      toast({ title: 'Declined', description: 'Friend request ignored', type: 'info' });
      return;
    }

    await supabase
      .from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);

    if (socialChannelRef.current) {
      socialChannelRef.current
        .send({ type: 'broadcast', event: 'social_update', payload: {} })
        .catch(() => {});
    }

    toast({ title: 'Declined', description: 'Friend request ignored', type: 'info' });
    await fetchSocialData();
  };

  // Cancel outgoing friend request
  const cancelRequest = async (requestId: string) => {
    if (!isConfigured || !user) {
      setOutgoingRequests((prev) => prev.filter((r) => r.id !== requestId));
      return;
    }

    await supabase.from('friend_requests').delete().eq('id', requestId);
    toast({ title: 'Request Cancelled', description: 'Friend request retracted', type: 'info' });
    await fetchSocialData();
  };

  // Remove existing friend
  const removeFriend = async (friendshipId: string, friendName: string) => {
    if (!isConfigured || !user) {
      setFriends((prev) => prev.filter((f) => f.id !== friendshipId));
      toast({ title: 'Friend Removed', description: `Removed ${friendName}`, type: 'info' });
      return;
    }

    await supabase.from('friendships').delete().eq('id', friendshipId);
    toast({ title: 'Friend Removed', description: `Removed ${friendName}`, type: 'info' });
    await fetchSocialData();
  };

  // Block a user
  const blockUser = async (targetUserId: string, targetName: string) => {
    if (!isConfigured || !user) {
      toast({ title: 'User Blocked', description: `Blocked ${targetName}`, type: 'info' });
      return;
    }

    await supabase.from('blocks').insert({
      blocker_id: user.id,
      blocked_id: targetUserId,
    });

    // Also remove from friendships if exists
    await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${user.id})`);

    toast({ title: 'User Blocked', description: `Blocked ${targetName}`, type: 'info' });
    await fetchSocialData();
  };

  // Unblock a user
  const unblockUser = async (blockId: string) => {
    if (!isConfigured || !user) {
      setBlockedUsers((prev) => prev.filter((b) => b.id !== blockId));
      toast({ title: 'User Unblocked', description: 'User unblocked', type: 'success' });
      return;
    }

    await supabase.from('blocks').delete().eq('id', blockId);
    toast({ title: 'User Unblocked', description: 'User unblocked', type: 'success' });
    await fetchSocialData();
  };

  // Search users by username query
  const searchUsers = async (query: string): Promise<UserProfile[]> => {
    if (!query.trim() || !isConfigured || !user) return [];

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${query.trim()}%`)
      .neq('id', user.id)
      .limit(8);

    return (data || []) as UserProfile[];
  };

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    blockedUsers,
    isLoading,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
    blockUser,
    unblockUser,
    searchUsers,
    refetch: fetchSocialData,
  };
}
