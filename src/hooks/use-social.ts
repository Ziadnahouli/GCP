'use client';

import * as React from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { FriendItem, FriendRequestItem, BlockedUserItem } from '@/lib/types/social';
import { UserProfile } from '@/lib/types/profile';
import { useToast } from '@/components/ui/toast';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { globalPresenceStore } from '@/features/presence/presence-context';

export function useSocial() {
  const { user, profile, isConfigured } = useAuth();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [friends, setFriends] = React.useState<FriendItem[]>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      try {
        const cached = localStorage.getItem(`nexus_friends_${user.id}`);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return [];
  });
  const [incomingRequests, setIncomingRequests] = React.useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = React.useState<FriendRequestItem[]>([]);
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUserItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const socialChannelRef = React.useRef<any>(null);
  const isFetchingRef = React.useRef(false);

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

      // 1. Fetch friendships in BOTH directions (user_id = me OR friend_id = me)
      const { data: friendshipsData, error: friendsErr } = await supabase
        .from('friendships')
        .select(`
          id,
          user_id,
          friend_id,
          created_at,
          friend:friend_id (
            id, username, display_name, avatar_url, avatar_path, custom_status, status
          ),
          sender_profile:user_id (
            id, username, display_name, avatar_url, avatar_path, custom_status, status
          )
        `)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (!friendsErr && friendshipsData) {
        const uniqueFriendsMap = new Map<string, FriendItem>();
        for (const row of friendshipsData) {
          const prof =
            row.user_id === user.id
              ? (row.friend as unknown as UserProfile)
              : (row.sender_profile as unknown as UserProfile);

          if (prof && prof.id && prof.id !== user.id) {
            uniqueFriendsMap.set(prof.id, {
              id: row.id,
              created_at: row.created_at,
              friend: {
                ...prof,
                status: prof.status || 'offline',
              },
            });
          }
        }
        const friendList = Array.from(uniqueFriendsMap.values());
        setFriends(friendList);
        try {
          localStorage.setItem(`nexus_friends_${user.id}`, JSON.stringify(friendList));
        } catch {}
      } else if (friendsErr) {
        console.warn('Friendships query warning:', friendsErr);
        try {
          const cached = localStorage.getItem(`nexus_friends_${user.id}`);
          if (cached) setFriends(JSON.parse(cached));
        } catch {}
      }

      // 2. Fetch incoming requests
      const { data: inReqData } = await supabase
        .from('friend_requests')
        .select(`
          id, sender_id, receiver_id, status, created_at,
          sender:sender_id (
            id, username, display_name, avatar_url, avatar_path
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
            id, username, display_name, avatar_url, avatar_path
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
            id, username, display_name, avatar_url, avatar_path
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
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [user, supabase]);

  // Initial fetch and Realtime subscription with Presence tracking
  React.useEffect(() => {
    fetchSocialData();

    if (!isConfigured || !user) return;

    // Realtime Postgres database updates listener for social data
    const channel = realtimeHub.acquire('nexus-social-db', undefined, supabase);

    channel
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
      .on('broadcast', { event: 'presence_status_change' }, ({ payload }: any) => {
        if (payload?.userId && payload?.status) {
          globalPresenceStore.setStatus(payload.userId, payload.status);
          setFriends((prev) =>
            prev.map((f) =>
              f.friend.id === payload.userId
                ? { ...f, friend: { ...f.friend, status: payload.status } }
                : f
            )
          );
        }
      })
    let isSubscribed = false;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isSubscribed = true;
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        isSubscribed = false;
      }
    });

    socialChannelRef.current = channel;

    // Background auto-sync polling: fallback only when realtime channel is NOT subscribed (S4)
    const autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isSubscribed) return; // Healthy realtime connection: skip redundant polling
      fetchSocialData();
    }, 35000);

    const handleResume = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchSocialData();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleResume);
      document.addEventListener('visibilitychange', handleResume);
    }

    return () => {
      clearInterval(autoSyncTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleResume);
        document.removeEventListener('visibilitychange', handleResume);
      }
      socialChannelRef.current = null;
      realtimeHub.release('nexus-social-db', 1000);
    };
  }, [fetchSocialData, isConfigured, user?.id, supabase]);

  // Send a friend request by username or user ID
  const sendFriendRequest = async (targetUsernameOrId: string) => {
    const rawInput = (targetUsernameOrId || '').trim();
    if (!rawInput) {
      toast({ title: 'Error', description: 'Please enter a username', type: 'error' });
      return { error: 'Please enter a username' };
    }

    const cleanUsername = rawInput.toLowerCase().replace(/^@/, '');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawInput);

    if (!isConfigured || !user) {
      toast({
        title: 'Friend Request Sent',
        description: `Request sent to ${rawInput} (Simulated).`,
        type: 'success',
      });
      return { error: null };
    }

    try {
      // 1. Look up target profile by ID or username
      let targetProfile: { id: string; username: string } | null = null;

      if (isUuid) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', rawInput)
          .maybeSingle();
        if (!error && data) {
          targetProfile = data;
        }
      }

      if (!targetProfile) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username')
          .ilike('username', cleanUsername)
          .maybeSingle();
        if (!error && data) {
          targetProfile = data;
        }
      }

      if (!targetProfile) {
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
        .or(`and(user_id.eq.${user.id},friend_id.eq.${targetProfile.id}),and(user_id.eq.${targetProfile.id},friend_id.eq.${user.id})`)
        .maybeSingle();

      if (existingFriend) {
        const msg = `You are already friends with @${targetProfile.username}.`;
        toast({ title: 'Already Friends', description: msg, type: 'info' });
        return { error: msg };
      }

      // Check if reverse request is pending (they already sent you a request)
      const { data: reverseReq } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', targetProfile.id)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (reverseReq) {
        await acceptRequest(reverseReq.id);
        toast({
          title: 'Friend Added',
          description: `@${targetProfile.username} already sent you a request. You are now friends!`,
          type: 'success',
        });
        return { error: null };
      }

      // 3. Insert friend request
      const { error: insertErr } = await supabase.from('friend_requests').insert({
        sender_id: user.id,
        receiver_id: targetProfile.id,
        status: 'pending',
      });

      if (insertErr) {
        const msg = insertErr.message.includes('unique_pending_request') || insertErr.message.includes('duplicate')
          ? 'A friend request is already pending between you.'
          : insertErr.message;
        toast({ title: 'Request Error', description: msg, type: 'error' });
        return { error: msg };
      }

      toast({
        title: 'Friend Request Sent',
        description: `Friend request sent to @${targetProfile.username}!`,
        type: 'success',
      });

      // Broadcast update across social and direct user channels
      realtimeHub.send('nexus-social-db', 'social_update', {
        type: 'friend_request',
        senderId: user.id,
        receiverId: targetProfile.id,
      }).catch(() => {});

      realtimeHub.send(`user_notifications_${targetProfile.id}`, 'notification_ping', {
        type: 'friend_request',
      }).catch(() => {});

      await fetchSocialData();
      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      console.error('Error sending friend request:', err);
      return { error: msg };
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
        console.warn('accept_friend_request RPC error, running resilient fallback:', error);
        const { data: req } = await supabase
          .from('friend_requests')
          .select('sender_id, receiver_id')
          .eq('id', requestId)
          .maybeSingle();

        if (req) {
          await supabase
            .from('friend_requests')
            .update({ status: 'accepted' })
            .eq('id', requestId);

          await supabase.from('friendships').upsert([
            { user_id: req.sender_id, friend_id: req.receiver_id },
            { user_id: req.receiver_id, friend_id: req.sender_id },
          ], { onConflict: 'user_id,friend_id', ignoreDuplicates: true });

          await supabase.rpc('create_or_get_direct_conversation', {
            target_user_id: req.sender_id === user.id ? req.receiver_id : req.sender_id,
          });
        }
      }

      toast({ title: 'Friend Added', description: 'Friend request accepted!', type: 'success' });
      if (socialChannelRef.current) {
        if (socialChannelRef.current.state === 'joined') {
          socialChannelRef.current
            .send({ type: 'broadcast', event: 'social_update', payload: {} })
            .catch(() => {});
        } else if (typeof (socialChannelRef.current as any).httpSend === 'function') {
          (socialChannelRef.current as any)
            .httpSend({ type: 'broadcast', event: 'social_update', payload: {} })
            .catch(() => {});
        }
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
      if (socialChannelRef.current.state === 'joined') {
        socialChannelRef.current
          .send({ type: 'broadcast', event: 'social_update', payload: {} })
          .catch(() => {});
      } else if (typeof (socialChannelRef.current as any).httpSend === 'function') {
        (socialChannelRef.current as any)
          .httpSend({ type: 'broadcast', event: 'social_update', payload: {} })
          .catch(() => {});
      }
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

    const { error: blockErr } = await supabase.from('blocks').insert({
      blocker_id: user.id,
      blocked_id: targetUserId,
    });

    if (blockErr && (blockErr as any).code !== '23505') {
      toast({ title: 'Error', description: blockErr.message || 'Failed to block user', type: 'error' });
      return;
    }

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

    const { error: unblockErr } = await supabase.from('blocks').delete().eq('id', blockId);
    if (unblockErr) {
      toast({ title: 'Error', description: unblockErr.message || 'Failed to unblock user', type: 'error' });
      return;
    }

    toast({ title: 'User Unblocked', description: 'User unblocked', type: 'success' });
    await fetchSocialData();
  };

  // Search users by username query
  const searchUsers = async (query: string): Promise<UserProfile[]> => {
    if (!query.trim() || !isConfigured || !user) return [];

    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
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
