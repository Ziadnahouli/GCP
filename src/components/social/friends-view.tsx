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
  ShieldAlert,
  Gamepad2,
  Sparkles,
  ArrowRight,
  Loader2,
  Trash2,
  Ban,
  Clock,
} from 'lucide-react';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useCallContext } from '@/features/calls/call-context';

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

  const { getOrCreateDirectConversation } = useConversations();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = React.useState<'online' | 'all' | 'pending' | 'blocked' | 'add'>('online');
  const [searchFilter, setSearchFilter] = React.useState('');
  const [addUsernameInput, setAddUsernameInput] = React.useState('');
  const [isSendingRequest, setIsSendingRequest] = React.useState(false);
  const [activeMenuId, setActiveMenuId] = React.useState<string | null>(null);

  const onlineCount = friends.filter(
    (f) => f.friend.status === 'online' || f.friend.status === 'idle' || f.friend.status === 'dnd'
  ).length;

  // Filter friends based on search
  const filteredFriends = React.useMemo(() => {
    return friends.filter((item) => {
      const matchSearch =
        item.friend.display_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        item.friend.username.toLowerCase().includes(searchFilter.toLowerCase());

      if (!matchSearch) return false;
      if (activeTab === 'online') {
        // If there are friends but none are online, show all friends with their offline badge
        if (onlineCount === 0) return true;
        return item.friend.status === 'online' || item.friend.status === 'idle' || item.friend.status === 'dnd';
      }
      return true;
    });
  }, [friends, searchFilter, activeTab, onlineCount]);

  const call = useCallContext();

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
    call.startCall(targetUserId, conversationId, isVideo);
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsernameInput.trim()) return;

    setIsSendingRequest(true);
    const { error } = await sendFriendRequest(addUsernameInput);
    setIsSendingRequest(false);
    if (!error) {
      setAddUsernameInput('');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Social Tab Navigation Bar */}
      <div className="h-14 border-b border-border/80 px-4 flex items-center justify-between shrink-0 select-none bg-surface-header/60 backdrop-blur-md">
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1 no-scrollbar">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mr-3 shrink-0">
            <Users className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">Friends</span>
          </div>

          <button
            onClick={() => setActiveTab('online')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
              activeTab === 'online'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-glow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
          >
            Online ({onlineCount})
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
              activeTab === 'all'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-glow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
          >
            All ({friends.length})
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 relative',
              activeTab === 'pending'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-glow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
          >
            Pending
            {incomingRequests.length > 0 ? (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                {incomingRequests.length}
              </span>
            ) : outgoingRequests.length > 0 ? (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {outgoingRequests.length}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveTab('blocked')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
              activeTab === 'blocked'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-glow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            )}
          >
            Blocked ({blockedUsers.length})
          </button>

          <button
            onClick={() => setActiveTab('add')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ml-2',
              activeTab === 'add'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-glow-sm'
                : 'bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20'
            )}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Friend</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* ADD FRIEND TAB */}
        {activeTab === 'add' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl border border-border bg-card shadow-xl">
              <h2 className="text-lg font-bold text-foreground">Add a Squadmate</h2>
              <p className="text-xs text-muted-foreground mt-1">
                You can add friends with their unique Nexus username. It is case-insensitive.
              </p>

              <form onSubmit={handleSendFriendRequest} className="mt-5 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Enter unique username (e.g. ghost_rider)"
                    value={addUsernameInput}
                    onChange={(e) => setAddUsernameInput(e.target.value)}
                    className="h-11 bg-surface-default"
                  />
                </div>
                <Button
                  type="submit"
                  size="default"
                  className="h-11 px-5 gap-2 shrink-0 font-semibold"
                  disabled={isSendingRequest || !addUsernameInput.trim()}
                >
                  {isSendingRequest ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Send Friend Request
                </Button>
              </form>
            </div>

            {/* Outgoing pending requests */}
            {outgoingRequests.length > 0 && (
              <div className="p-5 rounded-2xl border border-border bg-surface-default space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Pending Outgoing Requests ({outgoingRequests.length})
                </h3>
                <div className="space-y-2">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/80"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={req.receiver?.display_name || 'Gamer'}
                          status="offline"
                          size="sm"
                        />
                        <div>
                          <div className="text-xs font-bold text-foreground">
                            {req.receiver?.display_name || 'User'}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            @{req.receiver?.username} • Outgoing Friend Request
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelRequest(req.id)}
                        className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
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
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Incoming Requests ({incomingRequests.length})
              </h3>
              {incomingRequests.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-border/60 bg-surface-default text-xs text-muted-foreground">
                  No incoming friend requests waiting for review.
                </div>
              ) : (
                <div className="space-y-2">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-card border border-border hover:border-primary/40 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={req.sender?.display_name || 'Gamer'}
                          status={req.sender?.status || 'online'}
                          showStatus
                          size="md"
                        />
                        <div>
                          <div className="text-sm font-bold text-foreground">
                            {req.sender?.display_name || 'Unknown Gamer'}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            @{req.sender?.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => acceptRequest(req.id)}
                          className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 flex items-center justify-center transition-colors"
                          title="Accept Friend Request"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => rejectRequest(req.id)}
                          className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/40 flex items-center justify-center transition-colors"
                          title="Ignore Request"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing */}
            {outgoingRequests.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Outgoing Requests ({outgoingRequests.length})
                </h3>
                <div className="space-y-2">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/80"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={req.receiver?.display_name || 'Gamer'}
                          status="offline"
                          size="sm"
                        />
                        <div>
                          <div className="text-xs font-bold text-foreground">
                            {req.receiver?.display_name}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            @{req.receiver?.username}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelRequest(req.id)}
                        className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
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
          <div className="max-w-3xl mx-auto space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Blocked Users ({blockedUsers.length})
            </h3>
            {blockedUsers.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-border/60 bg-surface-default text-xs text-muted-foreground">
                You have not blocked any users.
              </div>
            ) : (
              <div className="space-y-2">
                {blockedUsers.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-card border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={b.blocked_user?.display_name || 'Blocked User'}
                        status="offline"
                        size="sm"
                      />
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          {b.blocked_user?.display_name || 'User'}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          @{b.blocked_user?.username} • Blocked
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unblockUser(b.id)}
                      className="text-xs border-border"
                    >
                      Unblock
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ONLINE & ALL TABS */}
        {(activeTab === 'online' || activeTab === 'all') && (
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Search Filter Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search friends list..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9 h-10 bg-surface-default"
              />
            </div>

            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">
              {activeTab === 'online'
                ? onlineCount > 0
                  ? `Online Friends — ${filteredFriends.length}`
                  : `All Friends (${friends.length}) — Offline`
                : `All Friends — ${filteredFriends.length}`}
            </div>

            {filteredFriends.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-border/60 bg-surface-default space-y-3">
                <div className="w-12 h-12 rounded-xl bg-surface-panel border border-border flex items-center justify-center mx-auto text-muted-foreground">
                  <Gamepad2 className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-foreground">No Friends Found</div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {searchFilter
                    ? 'No friends match your search query.'
                    : activeTab === 'online'
                    ? 'None of your friends are currently online. Check the All tab!'
                    : 'Your friends list is empty. Add friends using the Add Friend tab!'}
                </p>
                {activeTab === 'online' && friends.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('all')}>
                    View All Friends ({friends.length})
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredFriends.map((item) => {
                  const isMenuOpen = activeMenuId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="group flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card hover:bg-surface-hover hover:border-border transition-all cursor-pointer relative"
                      onClick={() => handleStartChat(item.friend.id)}
                    >
                      {/* Left: Avatar & Info */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <Avatar
                          src={item.friend.avatar_url}
                          name={item.friend.display_name}
                          status={item.friend.status}
                          showStatus
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                              {item.friend.display_name}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono truncate">
                              @{item.friend.username}
                            </span>
                          </div>

                          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                            {item.friend.game_activity ? (
                              <span className="text-primary font-medium flex items-center gap-1">
                                <Gamepad2 className="w-3.5 h-3.5" /> Playing {item.friend.game_activity}
                              </span>
                            ) : item.friend.custom_status ? (
                              <span>{item.friend.custom_status}</span>
                            ) : (
                              <span className="capitalize">{item.friend.status}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Action Buttons */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Direct Message button */}
                        <button
                          onClick={() => handleStartChat(item.friend.id)}
                          className="w-9 h-9 rounded-xl bg-surface-default hover:bg-primary/20 hover:text-primary text-muted-foreground border border-border flex items-center justify-center transition-colors"
                          title="Direct Message"
                          aria-label="Direct Message"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>

                        {/* Call button */}
                        <button
                          onClick={() => handleCallFriend(item.friend.id, false)}
                          className="w-9 h-9 rounded-xl bg-surface-default hover:bg-primary/20 hover:text-primary text-muted-foreground border border-border flex items-center justify-center transition-colors"
                          title="Voice Call Friend"
                          aria-label="Voice Call Friend"
                        >
                          <Phone className="w-4 h-4" />
                        </button>

                        {/* More menu trigger */}
                        <div className="relative">
                          <button
                            onClick={() => setActiveMenuId(isMenuOpen ? null : item.id)}
                            className="w-9 h-9 rounded-xl bg-surface-default hover:bg-surface-hover text-muted-foreground hover:text-foreground border border-border flex items-center justify-center transition-colors"
                            title="More Options"
                            aria-label="More Options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {isMenuOpen && (
                            <div className="absolute right-0 top-11 z-30 w-44 rounded-xl bg-card border border-border shadow-2xl p-1 animate-in fade-in duration-150">
                              <button
                                onClick={() => {
                                  removeFriend(item.id, item.friend.display_name);
                                  setActiveMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove Friend
                              </button>
                              <button
                                onClick={() => {
                                  blockUser(item.friend.id, item.friend.display_name);
                                  setActiveMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                              >
                                <Ban className="w-3.5 h-3.5" /> Block User
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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
