'use client';

import * as React from 'react';
import {
  Users,
  Search,
  UserPlus,
  MessageSquare,
  Phone,
  MoreVertical,
  Check,
  X,
  ArrowRight,
  Loader2,
  Trash2,
  Ban,
  Video,
} from 'lucide-react';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ListItem } from '@/components/ui/list-item';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useCallActions } from '@/features/calls/call-context';
import { usePresence, useUserPresence } from '@/features/presence/presence-context';

function FriendAvatar({
  friend,
}: {
  friend: { avatar_url?: string | null; display_name: string; id: string };
}) {
  const status = useUserPresence(friend.id);
  return (
    <Avatar
      src={friend.avatar_url}
      name={friend.display_name}
      status={status}
      showStatus
      size="32"
    />
  );
}

interface FriendsViewProps {
  onOpenConversation?: (conversationId: string) => void;
}

export function FriendsView({ onOpenConversation }: FriendsViewProps) {
  const {
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
  } = useSocial();

  const { conversations, getOrCreateDirectConversation } = useConversations();
  const { toast } = useToast();
  const { getUserStatus, isUserOnline } = usePresence();
  const { startCall } = useCallActions();

  const [activeTab, setActiveTab] = React.useState<'online' | 'all' | 'pending' | 'blocked' | 'add'>('all');
  const [searchFilter, setSearchFilter] = React.useState('');
  const [addUsernameInput, setAddUsernameInput] = React.useState('');
  const [isSendingRequest, setIsSendingRequest] = React.useState(false);

  const onlineCount = friends.filter((f) => isUserOnline(f.friend.id)).length;
  const pendingCount = incomingRequests.length + outgoingRequests.length;

  const filteredFriends = React.useMemo(() => {
    return friends.filter((item) => {
      const matchSearch =
        item.friend.display_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        item.friend.username.toLowerCase().includes(searchFilter.toLowerCase());

      if (!matchSearch) return false;
      if (activeTab === 'online') {
        return isUserOnline(item.friend.id);
      }
      return true;
    });
  }, [friends, searchFilter, activeTab, isUserOnline]);

  const handleStartChat = async (targetUserId: string) => {
    const { conversationId, error } = await getOrCreateDirectConversation(targetUserId);
    if (error) {
      toast({ title: 'Error', description: error, type: 'error' });
    } else if (conversationId && onOpenConversation) {
      onOpenConversation(conversationId);
    }
  };

  const handleCallFriend = async (targetUserId: string, isVideo = false) => {
    const { conversationId, error } = await getOrCreateDirectConversation(targetUserId);
    if (error || !conversationId) {
      toast({ title: 'Error', description: error || 'Failed to start call', type: 'error' });
      return;
    }
    startCall(targetUserId, conversationId, isVideo);
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsernameInput.trim()) return;

    setIsSendingRequest(true);
    try {
      const { error } = await sendFriendRequest(addUsernameInput.trim());
      if (!error) {
        setAddUsernameInput('');
        toast({
          title: 'Request sent',
          description: `Friend request sent to @${addUsernameInput.trim()}`,
          type: 'success',
        });
      }
    } finally {
      setIsSendingRequest(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Friends Header Bar (52px height) */}
      <header className="h-[52px] min-h-[52px] border-b border-border px-4 flex items-center justify-between shrink-0 bg-background">
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground mr-2 shrink-0">
            <Users className="w-4 h-4 text-primary" />
            <span>Friends</span>
          </div>

          <div className="h-4 w-px bg-border mx-1 shrink-0" />

          {/* Segmented Control Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={cn(
                'px-2.5 py-1 rounded-control text-xs font-medium transition-colors duration-fast ease-pro',
                activeTab === 'all'
                  ? 'bg-surface-active text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              All ({friends.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={cn(
                'px-2.5 py-1 rounded-control text-xs font-medium transition-colors duration-fast ease-pro',
                activeTab === 'online'
                  ? 'bg-surface-active text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              Online ({onlineCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={cn(
                'px-2.5 py-1 rounded-control text-xs font-medium transition-colors duration-fast ease-pro flex items-center gap-1.5',
                activeTab === 'pending'
                  ? 'bg-surface-active text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              <span>Pending</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold leading-none">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('blocked')}
              className={cn(
                'px-2.5 py-1 rounded-control text-xs font-medium transition-colors duration-fast ease-pro',
                activeTab === 'blocked'
                  ? 'bg-surface-active text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
              )}
            >
              Blocked ({blockedUsers.length})
            </button>
          </div>
        </div>

        {/* Primary Add Friend Action */}
        <Button
          size="sm"
          variant={activeTab === 'add' ? 'secondary' : 'primary'}
          onClick={() => setActiveTab(activeTab === 'add' ? 'all' : 'add')}
          className="h-7 text-xs font-medium gap-1.5 shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add friend</span>
        </Button>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar">
        {/* ADD FRIEND TAB */}
        {activeTab === 'add' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="p-6 rounded-card border border-border bg-card shadow-subtle">
              <h2 className="text-sm font-semibold text-foreground">Add a friend</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Enter your friend&apos;s unique Nexus username. Usernames are case-insensitive.
              </p>

              <form onSubmit={handleSendFriendRequest} className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Enter username (e.g. ghost_rider)"
                    value={addUsernameInput}
                    onChange={(e) => setAddUsernameInput(e.target.value)}
                    className="h-9 text-xs"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  size="md"
                  className="h-9 px-4 gap-1.5 shrink-0 text-xs font-medium"
                  disabled={isSendingRequest || !addUsernameInput.trim()}
                  isLoading={isSendingRequest}
                >
                  Send request <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </form>
            </div>

            {/* Outgoing pending requests */}
            {outgoingRequests.length > 0 && (
              <div className="p-4 rounded-card border border-border bg-card space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Outgoing requests ({outgoingRequests.length})
                </h3>
                <div className="space-y-1">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-2 rounded-control bg-surface-sidebar border border-border"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          name={req.receiver?.display_name || 'User'}
                          status="offline"
                          size="32"
                        />
                        <div className="min-w-0 truncate">
                          <div className="text-xs font-medium text-foreground truncate">
                            {req.receiver?.display_name || 'User'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            @{req.receiver?.username} &bull; Outgoing request
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelRequest(req.id)}
                        className="text-xs text-danger hover:text-danger/90 hover:bg-danger/10 h-7 px-2"
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PENDING TAB */}
        {activeTab === 'pending' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                Incoming requests ({incomingRequests.length})
              </h3>
              {incomingRequests.length === 0 ? (
                <EmptyState
                  title="No pending requests"
                  description="When someone sends you a friend request, it will appear here."
                  className="py-8"
                />
              ) : (
                <div className="space-y-1.5">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-2.5 rounded-card bg-card border border-border hover:border-border-strong transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={req.sender?.display_name || 'User'}
                          status={getUserStatus(req.sender?.id)}
                          showStatus
                          size="32"
                        />
                        <div className="min-w-0 truncate">
                          <div className="text-xs font-medium text-foreground truncate">
                            {req.sender?.display_name || 'User'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            @{req.sender?.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => acceptRequest(req.id)}
                          className="w-8 h-8 rounded-control bg-success/15 text-success hover:bg-success/25 border border-success/30 flex items-center justify-center transition-colors"
                          title="Accept friend request"
                          aria-label="Accept friend request"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectRequest(req.id)}
                          className="w-8 h-8 rounded-control bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30 flex items-center justify-center transition-colors"
                          title="Ignore request"
                          aria-label="Ignore request"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing pending requests */}
            {outgoingRequests.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                  Outgoing requests ({outgoingRequests.length})
                </h3>
                <div className="space-y-1.5">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-2 rounded-card bg-card border border-border"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          name={req.receiver?.display_name || 'User'}
                          status="offline"
                          size="32"
                        />
                        <div className="min-w-0 truncate">
                          <div className="text-xs font-medium text-foreground truncate">
                            {req.receiver?.display_name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            @{req.receiver?.username}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelRequest(req.id)}
                        className="text-xs text-danger hover:text-danger/90 hover:bg-danger/10 h-7 px-2"
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BLOCKED TAB */}
        {activeTab === 'blocked' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
              Blocked users ({blockedUsers.length})
            </h3>
            {blockedUsers.length === 0 ? (
              <EmptyState
                title="No blocked users"
                description="Users you block will not be able to message or call you."
                className="py-8"
              />
            ) : (
              <div className="space-y-1">
                {blockedUsers.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-2.5 rounded-card bg-card border border-border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={b.blocked_user?.display_name || 'Blocked user'}
                        status="offline"
                        size="32"
                      />
                      <div className="min-w-0 truncate">
                        <div className="text-xs font-medium text-foreground truncate">
                          {b.blocked_user?.display_name || 'User'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          @{b.blocked_user?.username} &bull; Blocked
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unblockUser(b.id)}
                      className="text-xs h-7 px-3 border-border"
                    >
                      Unblock
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ALL & ONLINE TABS */}
        {(activeTab === 'all' || activeTab === 'online') && (
          <div className="max-w-3xl mx-auto space-y-3">
            {/* Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search friends..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9 h-8 text-xs bg-surface-sidebar border-border"
              />
            </div>

            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1 px-1">
              {activeTab === 'online'
                ? `Online &bull; ${filteredFriends.length}`
                : `All friends &bull; ${filteredFriends.length}`}
            </div>

            {filteredFriends.length === 0 ? (
              <EmptyState
                title={searchFilter ? 'No matching friends' : activeTab === 'online' ? 'No friends online' : 'No friends yet'}
                description={
                  searchFilter
                    ? 'No friends match your current search query.'
                    : activeTab === 'online'
                    ? 'None of your friends are currently online.'
                    : 'Start by adding a friend using their unique username.'
                }
                action={!searchFilter ? { label: 'Add friend', onClick: () => setActiveTab('add') } : undefined}
                className="py-12"
              />
            ) : (
              <div className="space-y-0.5">
                {filteredFriends.map((item) => {
                  const liveStatus = getUserStatus(item.friend.id);

                  // Check if there is an unread conversation with this friend
                  const friendConv = conversations.find(
                    (c) =>
                      c.type === 'direct' &&
                      c.members.some((m) => m.user_id === item.friend.id)
                  );
                  const unreadCount = friendConv?.unread_count || 0;

                  return (
                    <ContextMenu key={item.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className="group relative flex items-center justify-between px-2.5 py-1.5 rounded-control hover:bg-surface-hover transition-colors duration-fast cursor-pointer"
                          onClick={() => handleStartChat(item.friend.id)}
                        >
                          {/* Left: Avatar + Names */}
                          <div className="flex items-center gap-3 min-w-0">
                            <FriendAvatar friend={item.friend} />
                            <div className="min-w-0 truncate">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-body truncate",
                                  unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground"
                                )}>
                                  {item.friend.display_name}
                                </span>
                                <span className="text-meta text-muted-foreground truncate">
                                  @{item.friend.username}
                                </span>
                                {unreadCount > 0 && (
                                  <Badge variant="accent" className="h-4 px-1 text-meta">
                                    {unreadCount}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-meta text-muted-foreground truncate">
                                {item.friend.game_activity ? (
                                  <span className="text-primary font-medium">
                                    Playing {item.friend.game_activity}
                                  </span>
                                ) : item.friend.custom_status ? (
                                  <span>{item.friend.custom_status}</span>
                                ) : (
                                  <span className="capitalize">{liveStatus}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Actions on Hover / Touch */}
                          <div
                            className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleStartChat(item.friend.id)}
                              className="w-7 h-7 rounded-control flex items-center justify-center hover:bg-surface-active hover:text-foreground text-muted-foreground transition-colors"
                              title="Direct message"
                              aria-label="Direct message"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCallFriend(item.friend.id, false)}
                              className="w-7 h-7 rounded-control flex items-center justify-center hover:bg-surface-active hover:text-foreground text-muted-foreground transition-colors"
                              title="Voice call"
                              aria-label="Voice call"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </button>

                            {/* Radix DropdownMenu for More Options */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-control flex items-center justify-center hover:bg-surface-active hover:text-foreground text-muted-foreground transition-colors"
                                  title="More options"
                                  aria-label="More options"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={() => handleStartChat(item.friend.id)}
                                  className="text-xs gap-2"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                  <span>Message</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCallFriend(item.friend.id, false)}
                                  className="text-xs gap-2"
                                >
                                  <Phone className="w-3.5 h-3.5 text-success" />
                                  <span>Voice call</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCallFriend(item.friend.id, true)}
                                  className="text-xs gap-2"
                                >
                                  <Video className="w-3.5 h-3.5 text-primary" />
                                  <span>Video call</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => removeFriend(item.id, item.friend.display_name)}
                                  className="text-xs gap-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Remove friend</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => blockUser(item.friend.id, item.friend.display_name)}
                                  className="text-xs gap-2"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Block user</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </ContextMenuTrigger>

                      {/* Radix ContextMenu */}
                      <ContextMenuContent className="w-44">
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground truncate border-b border-border mb-1">
                          {item.friend.display_name}
                        </div>
                        <ContextMenuItem
                          onClick={() => handleStartChat(item.friend.id)}
                          className="text-xs gap-2"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-primary" />
                          <span>Send message</span>
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleCallFriend(item.friend.id, false)}
                          className="text-xs gap-2"
                        >
                          <Phone className="w-3.5 h-3.5 text-success" />
                          <span>Voice call</span>
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleCallFriend(item.friend.id, true)}
                          className="text-xs gap-2"
                        >
                          <Video className="w-3.5 h-3.5 text-primary" />
                          <span>Video call</span>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => blockUser(item.friend.id, item.friend.display_name)}
                          className="text-xs gap-2"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Block user</span>
                        </ContextMenuItem>
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => removeFriend(item.id, item.friend.display_name)}
                          className="text-xs gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove friend</span>
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

