'use client';

import * as React from 'react';
import {
  Hash,
  Volume2,
  Users,
  Search,
  Sparkles,
  Smile,
  Send,
  PlusCircle,
  Shield,
  Crown,
  Gamepad2,
  X,
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Server, Channel } from '@/lib/types/server';
import { useChannelMessages } from '@/hooks/use-channel-messages';
import { useAuth } from '@/features/auth/auth-provider';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
interface ChannelViewProps {
  server: Server;
  channel: Channel;
}

const DEFAULT_COMMUNITY_MEMBERS = [
  { id: '51a183ab-d80e-4db2-b29f-57203aca3ea0', display_name: 'Commander Rex', username: 'commander_rex', role: 'admin', status: 'online' as const },
  { id: '8cab3f6c-1712-4a01-9b98-1f41676ef501', display_name: 'zorkos', username: 'zzorkoss', role: 'member', status: 'online' as const },
  { id: '3b4668f6-f241-4a90-9c98-3aba096e9705', display_name: 'Test1', username: 'test', role: 'member', status: 'idle' as const },
];

export function ChannelView({ server, channel }: ChannelViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { friends } = useSocial();
  const { getOrCreateDirectConversation } = useConversations();
  const { messages, sendMessage, retryMessage } = useChannelMessages(channel.id);
  const { toast } = useToast();
  const [inputText, setInputText] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [showMembers, setShowMembers] = React.useState(true);
  const [showSoundboard, setShowSoundboard] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [communityProfiles, setCommunityProfiles] = React.useState<UserProfile[]>([]);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Load real community member profiles from database
  React.useEffect(() => {
    if (!user) return;
    try {
      const supabase = getBrowserClient();
      supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .limit(10)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setCommunityProfiles(data as UserProfile[]);
          }
        });
    } catch {}
  }, [user]);

  const handleStartDirectChat = async (targetUserId: string, targetName: string) => {
    if (!targetUserId || targetUserId === user?.id) {
      toast({ title: 'You', description: 'This is your own profile.', type: 'info' });
      return;
    }

    const isMock = DEFAULT_COMMUNITY_MEMBERS.some((d) => d.id === targetUserId);
    if (isMock) {
      toast({
        title: 'Demo Squadmate',
        description: `${targetName} is an automated bot. Add registered friends to start private chats!`,
        type: 'info',
      });
      return;
    }

    const { conversationId, error } = await getOrCreateDirectConversation(targetUserId);
    if (error) {
      toast({ title: 'Could not open private chat', description: error, type: 'error' });
    } else if (conversationId) {
      toast({
        title: 'Opening Private Chat',
        description: `Chatting with ${targetName}`,
        type: 'success',
        duration: 1500,
      });
      router.push(`/?c=${conversationId}&s=${server.id}&ch=${channel.id}`);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = inputText.trim();
    if (!content || isSending) return;

    setIsSending(true);
    try {
      const res = await sendMessage(content);
      if (res?.error) {
        toast({
          title: 'Channel Message Failed',
          description: `${res.error}`,
          type: 'error',
          action: {
            label: 'Open Logs',
            onClick: () => triggerOpenLogsWindow(),
          },
        });
        // Preserves the draft in inputText
      } else {
        setInputText('');
      }
    } catch (err: unknown) {
      toast({
        title: 'Error Sending',
        description: err instanceof Error ? err.message : 'Failed to send message',
        type: 'error',
        action: {
          label: 'Open Logs',
          onClick: () => triggerOpenLogsWindow(),
        },
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // Build real squad members list
  const squadList = React.useMemo(() => {
    const list: Array<{
      id: string;
      display_name: string;
      username: string;
      avatar_url?: string | null;
      role: string;
      status: 'online' | 'idle' | 'dnd' | 'offline';
      game_activity?: string | null;
    }> = [];

    const seenIds = new Set<string>();

    // 1. Server members
    if (server.members && server.members.length > 0) {
      for (const m of server.members) {
        if (!seenIds.has(m.user_id)) {
          seenIds.add(m.user_id);
          list.push({
            id: m.user_id,
            display_name: m.profile?.display_name || 'Squad Member',
            username: m.profile?.username || 'member',
            avatar_url: m.profile?.avatar_url || null,
            role: m.role || 'member',
            status: (m.profile?.status as any) || 'online',
            game_activity: m.profile?.game_activity || null,
          });
        }
      }
    }

    // 2. Add friends
    for (const f of friends) {
      if (!seenIds.has(f.friend.id)) {
        seenIds.add(f.friend.id);
        list.push({
          id: f.friend.id,
          display_name: f.friend.display_name,
          username: f.friend.username,
          avatar_url: f.friend.avatar_url || null,
          role: 'friend',
          status: (f.friend.status as any) || 'online',
          game_activity: f.friend.game_activity || null,
        });
      }
    }

    // 3. Registered Community Profiles
    for (const cp of communityProfiles) {
      if (!seenIds.has(cp.id)) {
        seenIds.add(cp.id);
        list.push({
          id: cp.id,
          display_name: cp.display_name || cp.username,
          username: cp.username,
          avatar_url: cp.avatar_url || null,
          role: 'member',
          status: (cp.status as any) || 'online',
          game_activity: cp.game_activity || null,
        });
      }
    }

    // 4. Fallback mock community profiles only if list is empty
    if (list.length === 0) {
      for (const cm of DEFAULT_COMMUNITY_MEMBERS) {
        if (!seenIds.has(cm.id)) {
          seenIds.add(cm.id);
          list.push({
            id: cm.id,
            display_name: cm.display_name,
            username: cm.username,
            avatar_url: null,
            role: cm.role,
            status: cm.status,
            game_activity: null,
          });
        }
      }
    }

    return list;
  }, [server.members, friends, communityProfiles]);

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Center Stage: Channel Chat Feed */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Top Channel Header */}
        <div className="h-12 border-b border-subtle px-3 sm:px-4 flex items-center justify-between shrink-0 bg-surface-header/80 backdrop-blur-xl select-none">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => router.push('/')}
              className="p-1 -ml-1 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] rounded-lg transition-colors flex items-center gap-1"
              title="Back to Direct Messages & Friends"
              aria-label="Back to Direct Messages"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Hash className="w-4 h-4 text-muted-foreground/60 shrink-0" />
              <h3 className="font-semibold text-xs text-foreground truncate">
                {channel.name}
              </h3>
            </div>

            {channel.topic && (
              <>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0 hidden sm:inline-block" />
                <span className="text-[11px] text-muted-foreground/60 truncate hidden sm:inline-block max-w-sm font-normal">
                  {channel.topic}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Direct Messages Shortcut Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/')}
              className="h-7 text-xs px-2.5 gap-1.5 border-subtle bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] rounded-lg"
              title="Switch to Direct Messages & Friends"
            >
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline font-normal">Direct Chats</span>
            </Button>

            {/* Search Toggle */}
            <div className="relative">
              {showSearch ? (
                <div className="flex items-center gap-1 bg-surface-sidebar rounded-lg px-2 py-0.5 border border-subtle">
                  <Search className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in channel..."
                    aria-label="Search in channel"
                    className="w-32 sm:w-44 bg-transparent text-xs text-foreground focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearch(false);
                    }}
                    aria-label="Clear channel search"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  aria-label="Search Messages"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                  title="Search Messages"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Soundboard Trigger */}
            <button
              type="button"
              onClick={() => setShowSoundboard(true)}
              aria-label="Soundboard"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
              title="Soundboard"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Members Toggle */}
            <button
              onClick={() => setShowMembers((prev) => !prev)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                showMembers
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
              )}
              title="Toggle Squad Member List"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Channel Start Banner */}
          <div className="py-6 space-y-2 border-b border-border/40 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-sidebar border border-border/80 flex items-center justify-center text-primary shadow-inner">
              <Hash className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-foreground tracking-tight">
              Welcome to #{channel.name}!
            </h2>
            <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
              This is the start of the #{channel.name} channel for {server.name}. Share strats, callouts, and coordinate your gaming matches.
            </p>
          </div>

          {filteredMessages.map((msg) => {
            const isOwner = msg.user_id === server.owner_id;

            return (
              <div
                key={msg.id}
                className="flex items-start gap-3.5 group rounded-xl hover:bg-surface-hover/40 p-2 -mx-2 transition-colors"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleStartDirectChat(msg.user_id, msg.profile?.display_name || 'Member')}
                  title="Click to direct message"
                >
                  <Avatar
                    src={msg.profile?.avatar_url}
                    name={msg.profile?.display_name || 'Gamer'}
                    size="md"
                    className="mt-0.5 shrink-0 hover:ring-2 hover:ring-primary transition-all"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      onClick={() => handleStartDirectChat(msg.user_id, msg.profile?.display_name || 'Member')}
                      className="font-bold text-xs text-foreground hover:underline hover:text-primary cursor-pointer transition-colors"
                      title="Send direct message"
                    >
                      {msg.profile?.display_name || 'Squad Member'}
                    </span>

                    {isOwner ? (
                      <Badge
                        variant="default"
                        className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1 font-mono uppercase"
                      >
                        <Crown className="w-2.5 h-2.5" />
                        Leader
                      </Badge>
                    ) : (
                      <Badge
                        variant="subtle"
                        className="text-[9px] px-1.5 py-0 text-primary border-primary/30 font-mono uppercase"
                      >
                        Squad
                      </Badge>
                    )}

                    <span className="text-[10px] text-muted-foreground font-mono">
                      {(() => {
                        try {
                          const d = new Date(msg.created_at);
                          return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        } catch {
                          return '';
                        }
                      })()}
                    </span>

                    {msg.status === 'sending' && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />
                        <span>sending...</span>
                      </span>
                    )}

                    {msg.status === 'failed' && (
                      <span className="flex items-center gap-1.5 text-[10px] text-destructive font-mono">
                        <AlertCircle className="w-3 h-3" />
                        <span>failed</span>
                        <button
                          type="button"
                          onClick={() => retryMessage(msg.id)}
                          className="flex items-center gap-0.5 text-[10px] text-primary hover:underline ml-1"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          Retry
                        </button>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-foreground/90 mt-1 leading-relaxed break-words">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-subtle bg-surface-header/40 backdrop-blur-xl shrink-0">
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 bg-surface-default/70 border border-subtle rounded-xl p-1.5 px-3 focus-within:border-primary/50 transition-all"
          >
            <button
              type="button"
              onClick={() => setShowSoundboard(true)}
              aria-label="Trigger Soundboard Meme"
              className="text-muted-foreground hover:text-amber-400 p-1.5 rounded-lg transition-colors shrink-0"
              title="Trigger Soundboard Meme"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label={`Message #${channel.name}`}
              placeholder={`Message #${channel.name}...`}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none max-h-28 py-1 font-normal"
            />

            <Button
              type="submit"
              size="sm"
              aria-label="Send channel message"
              disabled={!inputText.trim() || isSending}
              className="h-8 w-8 p-0 rounded-lg shrink-0 font-medium"
            >
              {isSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Right Squad Members Panel */}
      {showMembers && (
        <aside className="w-64 border-l border-border bg-surface-sidebar hidden lg:flex flex-col p-4 shrink-0 overflow-y-auto select-none">
          {/* Direct Messages Quick Action */}
          <div className="mb-4 pb-3 border-b border-border/60">
            <Button
              size="sm"
              variant="default"
              onClick={() => router.push('/')}
              className="w-full text-xs font-bold gap-2 shadow-sm"
              title="Exit server to direct messages"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Direct Messages & Friends</span>
            </Button>
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span>Squad ({squadList.length})</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-normal">Click to chat</span>
          </div>

          <div className="space-y-1">
            {squadList.map((m) => {
              const isMe = m.id === user?.id;

              return (
                <div
                  key={m.id}
                  onClick={() => !isMe && handleStartDirectChat(m.id, m.display_name)}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-xl transition-all group',
                    isMe
                      ? 'bg-surface-default/40 opacity-80 cursor-default'
                      : 'hover:bg-surface-hover cursor-pointer border border-transparent hover:border-border/60'
                  )}
                  title={isMe ? 'You' : `Send private message to ${m.display_name}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Avatar
                      src={m.avatar_url || null}
                      name={m.display_name}
                      status={m.status}
                      showStatus
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1">
                        <span className="truncate">{m.display_name}</span>
                        {isMe && (
                          <span className="text-[9px] text-primary font-mono">(You)</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        @{m.username}
                      </div>
                    </div>
                  </div>

                  {!isMe && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartDirectChat(m.id, m.display_name);
                      }}
                      aria-label={`Direct Message ${m.display_name}`}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 p-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 focus:ring-1 focus:ring-primary transition-all shrink-0"
                      title="Direct Message"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Soundboard Modal */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} />
    </div>
  );
}
