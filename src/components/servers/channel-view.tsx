'use client';

import * as React from 'react';
import {
  Hash,
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  Reply,
  Forward,
  Flag,
  ArrowDown,
  Clock,
  Sparkles,
  X,
  Crown,
  Lock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Server, Channel, ChannelMessage, hasServerPermission, hasChannelPermission } from '@/lib/types/server';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useChannelMessages } from '@/hooks/use-channel-messages';
import { useAuth } from '@/features/auth/auth-provider';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { useServers } from '@/hooks/use-servers';
import { useCallActions } from '@/features/calls/call-context';
import { useServerVoice } from '@/hooks/use-server-voice';
import { getBrowserClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { ProfileCardTrigger } from '@/components/profile/ProfileCardTrigger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { InviteModal } from './invite-modal';
import { ForwardModal } from '@/components/chat/forward-modal';
import { ReportModal } from '@/components/social/report-modal';
import { MessageContent } from '@/components/chat/message-content';
import { ChannelHeader } from './channel-header';
import { ChannelVoiceStage } from './channel-voice-stage';
import { ChannelMembersPanel, ChannelMemberItem } from './channel-members-panel';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';

interface ChannelViewProps {
  server: Server;
  channel: Channel;
}

export function ChannelView({ server, channel }: ChannelViewProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { getOrCreateDirectConversation } = useConversations();
  const { blockUser } = useSocial();
  const { timeoutMember, kickMember, banMember } = useServers();
  const { startCall } = useCallActions();
  const { messages, sendMessage, retryMessage } = useChannelMessages(channel.id);
  const voice = useServerVoice(channel.id, server.id, server.name, channel.name);
  const { toast } = useToast();

  const [inputText, setInputText] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [showMembers, setShowMembers] = React.useState(true);
  const [showVoiceChat, setShowVoiceChat] = React.useState(true);
  const [showSoundboard, setShowSoundboard] = React.useState(false);
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const virtuosoRef = React.useRef<VirtuosoHandle>(null);
  const isNearBottomRef = React.useRef(true);

  // Reply, Forward, Report
  const [replyingTo, setReplyingTo] = React.useState<ChannelMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = React.useState<any | null>(null);
  const [reportingMessage, setReportingMessage] = React.useState<any | null>(null);
  const [isScrolledUp, setIsScrolledUp] = React.useState(false);

  // Mention autocomplete
  const [mentionCandidates, setMentionCandidates] = React.useState<
    Array<{
      id: string;
      username: string;
      display_name: string;
      avatar_url?: string | null;
      isSpecial?: boolean;
    }>
  >([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = React.useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Restore draft for this channel
  React.useEffect(() => {
    if (typeof window !== 'undefined' && channel?.id) {
      const saved = localStorage.getItem(`nexus_draft_chan_${channel.id}`);
      if (saved) setInputText(saved);
    }
  }, [channel?.id]);

  // Persist draft on edit
  React.useEffect(() => {
    if (typeof window !== 'undefined' && channel?.id) {
      if (inputText) {
        localStorage.setItem(`nexus_draft_chan_${channel.id}`, inputText);
      } else {
        localStorage.removeItem(`nexus_draft_chan_${channel.id}`);
      }
    }
  }, [inputText, channel?.id]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 150;
    isNearBottomRef.current = nearBottom;
    setIsScrolledUp(!nearBottom);
  };

  // Current member and timeout state
  const currentMember = React.useMemo(() => {
    return (server.members || []).find((m) => m.user_id === user?.id) || null;
  }, [server.members, user?.id]);

  const isTimedOut = React.useMemo(() => {
    if (!currentMember?.timeout_until) return false;
    return new Date(currentMember.timeout_until) > new Date();
  }, [currentMember?.timeout_until]);

  // Permissions for current user (checking channel-level overrides and role permissions)
  const canSendMessages = !isTimedOut && hasChannelPermission(server, channel.id, user?.id, 'send_messages');
  const canConnectVoice = hasChannelPermission(server, channel.id, user?.id, 'connect_voice');
  const canSpeakVoice = !isTimedOut && hasChannelPermission(server, channel.id, user?.id, 'speak_voice');
  const canShareScreen = !isTimedOut && hasChannelPermission(server, channel.id, user?.id, 'share_screen');
  const canUseSoundboard = !isTimedOut && hasChannelPermission(server, channel.id, user?.id, 'use_soundboard');

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleStartDirectChat = async (targetUserId: string, targetName: string) => {
    if (!targetUserId || targetUserId === user?.id) {
      toast({ title: 'You', description: 'This is your own profile.', type: 'info' });
      return;
    }

    const { conversationId, error } = await getOrCreateDirectConversation(targetUserId);
    if (error) {
      toast({ title: 'Could not open private chat', description: error, type: 'error' });
    } else if (conversationId) {
      router.push(`/?c=${conversationId}&s=${server.id}&ch=${channel.id}`);
    }
  };

  const handleStartCall = async (targetUserId: string) => {
    const { conversationId } = await getOrCreateDirectConversation(targetUserId);
    if (conversationId) {
      startCall(targetUserId, conversationId, false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isTimedOut) {
      toast({
        title: 'Timed out',
        description: `You are timed out in this server until ${new Date(currentMember!.timeout_until!).toLocaleTimeString()}.`,
        type: 'error',
      });
      return;
    }
    if (!canSendMessages) {
      toast({ title: 'Restricted', description: 'Your role does not have permission to send messages.', type: 'error' });
      return;
    }
    const content = inputText.trim();
    if (!content || isSending) return;

    setIsSending(true);
    try {
      const res = await sendMessage(content);
      if (res?.error) {
        let friendlyTitle = 'Cannot Send Message';
        let friendlyDesc = res.error;

        if (
          res.error.toLowerCase().includes('violates row-level security policy') ||
          res.error.toLowerCase().includes('permission') ||
          res.error.toLowerCase().includes('is_channel_member_active')
        ) {
          friendlyTitle = 'Permission Restricted';
          friendlyDesc = 'You do not have permission to send messages in this channel.';
        } else if (res.error.toLowerCase().includes('timeout') || res.error.toLowerCase().includes('timed out')) {
          friendlyTitle = 'Timed Out';
          friendlyDesc = 'You are currently timed out in this server.';
        }

        toast({
          title: friendlyTitle,
          description: friendlyDesc,
          type: 'error',
        });
      } else {
        setInputText('');
        setReplyingTo(null);
        setMentionCandidates([]);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`nexus_draft_chan_${channel.id}`);
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setIsScrolledUp(false);
        isNearBottomRef.current = true;

        // Dispatch mention notifications
        try {
          const mentionMatches = content.match(/@([a-zA-Z0-9_.-]+)/g);
          if (mentionMatches && mentionMatches.length > 0) {
            const mentionedLower = mentionMatches.map((m) => m.slice(1).toLowerCase());
            const hasEveryone = mentionedLower.includes('everyone') || mentionedLower.includes('all') || mentionedLower.includes('here');

            const targetUsers = squadList.filter((m) => {
              if (m.id === user?.id) return false;
              if (hasEveryone) return true;
              return m.username && mentionedLower.includes(m.username.toLowerCase());
            });

            if (targetUsers.length > 0) {
              const notifInserts = targetUsers.map((tu) => ({
                user_id: tu.id,
                actor_id: user?.id,
                type: 'mention',
                title: `${profile?.display_name || 'Someone'} mentioned you in #${channel.name}`,
                body: content.slice(0, 140),
                data: {
                  server_id: server.id,
                  channel_id: channel.id,
                },
              }));

              const supabase = getBrowserClient();
              supabase.from('notifications').insert(notifInserts).then(() => {}, () => {});
            }
          }
        } catch (mentionErr) {
          console.warn('Channel mention dispatch error:', mentionErr);
        }
      }
    } catch (err: unknown) {
      toast({
        title: 'Error sending',
        description: err instanceof Error ? err.message : 'Failed to send message',
        type: 'error',
        action: {
          label: 'Open logs',
          onClick: () => triggerOpenLogsWindow(),
        },
      });
    } finally {
      setIsSending(false);
    }
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  // Build real squad members list
  const squadList: ChannelMemberItem[] = React.useMemo(() => {
    const list: ChannelMemberItem[] = [];
    const seenIds = new Set<string>();

    if (server.members && server.members.length > 0) {
      for (const m of server.members) {
        if (!seenIds.has(m.user_id)) {
          seenIds.add(m.user_id);
          const isCurrentUser = m.user_id === user?.id;
          const memberProfile = isCurrentUser ? (profile || m.profile) : m.profile;
          const effectiveName = m.nickname || memberProfile?.display_name || (isCurrentUser ? (profile?.display_name || 'You') : 'Member');
          const effectiveAvatar = m.avatar_path || memberProfile?.avatar_path || memberProfile?.avatar_url || null;
          list.push({
            id: m.user_id,
            display_name: effectiveName,
            username: memberProfile?.username || (isCurrentUser ? (profile?.username || 'you') : 'member'),
            avatar_url: effectiveAvatar,
            role: m.role || (m.user_id === server.owner_id ? 'owner' : 'member'),
            role_id: m.role_id || null,
            status: (memberProfile?.status as any) || (isCurrentUser ? 'online' : 'offline'),
            game_activity: memberProfile?.game_activity || null,
          });
        }
      }
    }

    if (list.length === 0 && user) {
      list.push({
        id: user.id,
        display_name: profile?.display_name || 'You',
        username: profile?.username || 'you',
        avatar_url: profile?.avatar_url || null,
        role: server.owner_id === user.id ? 'owner' : 'member',
        status: 'online',
        game_activity: profile?.game_activity || null,
      });
    }

    return list;
  }, [server.members, server.owner_id, user, profile]);

  // Mention autocomplete logic
  const handleInputChange = (val: string) => {
    setInputText(val);
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);

    if (match) {
      const query = match[1].toLowerCase();
      const members = squadList.map((m) => ({
        id: m.id,
        username: m.username || 'member',
        display_name: m.display_name || 'Member',
        avatar_url: m.avatar_url,
        isSpecial: false,
      }));

      const specials = [
        { id: 'spec_everyone', username: 'everyone', display_name: 'everyone', isSpecial: true },
        { id: 'spec_here', username: 'here', display_name: 'here', isSpecial: true },
      ];

      const all = [...specials, ...members];
      const filtered = all.filter(
        (c) => c.username.toLowerCase().includes(query) || c.display_name.toLowerCase().includes(query)
      );

      setMentionCandidates(filtered.slice(0, 6));
      setMentionSelectedIndex(0);
    } else {
      setMentionCandidates([]);
    }
  };

  const insertMention = (username: string) => {
    const cursor = textareaRef.current?.selectionStart ?? inputText.length;
    const textBeforeCursor = inputText.slice(0, cursor);
    const textAfterCursor = inputText.slice(cursor);
    const replacedBefore = textBeforeCursor.replace(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/, (match) => {
      const leadingSpace = match.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}@${username} `;
    });

    const newText = replacedBefore + textAfterCursor;
    setInputText(newText);
    setMentionCandidates([]);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(replacedBefore.length, replacedBefore.length);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = mentionCandidates[mentionSelectedIndex];
        if (selected) {
          insertMention(selected.username);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionCandidates([]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isVoiceChannel = channel.type === 'voice';

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Center Stage */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Top Channel Header */}
        <ChannelHeader
          server={server}
          channel={channel}
          isVoiceConnected={voice.isVoiceConnected}
          isConnectingVoice={voice.isConnecting}
          canUseSoundboard={canUseSoundboard}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers((prev) => !prev)}
          showVoiceChat={showVoiceChat}
          onToggleVoiceChat={() => setShowVoiceChat((prev) => !prev)}
          onOpenInvite={() => setShowInviteModal(true)}
          onOpenSoundboard={() => setShowSoundboard(true)}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />

        {/* Dynamic Center Stage Content: Voice Lounge Stage OR Text Chat Feed */}
        {isVoiceChannel ? (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
            <ChannelVoiceStage
              channel={channel}
              voice={voice}
              currentUserProfile={profile}
              currentUserId={user?.id}
              canConnectVoice={canConnectVoice}
              canSpeakVoice={canSpeakVoice}
              canShareScreen={canShareScreen}
              canUseSoundboard={canUseSoundboard}
              onOpenInvite={() => setShowInviteModal(true)}
              onOpenSoundboard={() => setShowSoundboard(true)}
            />

            {/* Embedded Voice Text Chat Drawer */}
            {showVoiceChat && (
              <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border flex flex-col h-64 lg:h-full bg-surface-sidebar shrink-0">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <span>Voice chat</span>
                  </div>
                  <button
                    onClick={() => setShowVoiceChat(false)}
                    className="text-muted-foreground hover:text-foreground p-1"
                    title="Close chat"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
                  {messages.map((m) => (
                    <div key={m.id} className="p-2 rounded-control bg-card border border-border">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">
                          {m.profile?.display_name || 'Member'}
                        </span>
                        <span>
                          {(() => {
                            try {
                              const d = new Date(m.created_at);
                              return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                            } catch {
                              return '';
                            }
                          })()}
                        </span>
                      </div>
                      <p className="text-foreground leading-snug">{m.content}</p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {!canSendMessages ? (
                  <div className="p-2.5 border-t border-border bg-card/60 flex items-center justify-center gap-2 text-muted-foreground select-none">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium">You do not have permission to send messages in this channel.</span>
                  </div>
                ) : (
                  <form onSubmit={handleSend} className="p-2.5 border-t border-border flex gap-1.5">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Chat in voice lounge..."
                      className="flex-1 bg-card border border-border rounded-control px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button type="submit" size="sm" disabled={!inputText.trim() || isSending} className="h-8 px-2.5">
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Text Channel Chat Feed */
          <>
            <div className="flex-1 relative overflow-hidden flex flex-col">
              <Virtuoso
                ref={virtuosoRef}
                data={filteredMessages}
                followOutput="auto"
                alignToBottom
                initialTopMostItemIndex={filteredMessages.length > 0 ? filteredMessages.length - 1 : 0}
                atBottomStateChange={(atBottom) => {
                  isNearBottomRef.current = atBottom;
                  setIsScrolledUp(!atBottom);
                }}
                className="flex-1 no-scrollbar p-4 sm:p-5"
                components={{
                  Header: () => (
                    <div className="py-4 space-y-2 border-b border-border mb-3">
                      <div className="w-10 h-10 rounded-control bg-surface-hover flex items-center justify-center text-primary">
                        <Hash className="w-5 h-5" />
                      </div>
                      <h2 className="text-base font-semibold text-foreground tracking-tight">
                        Welcome to #{channel.name}
                      </h2>
                      <p className="text-xs text-muted-foreground max-w-md leading-relaxed font-normal">
                        This is the start of the #{channel.name} channel for {server.name}.
                      </p>
                    </div>
                  ),
                }}
                itemContent={(index, msg) => {
                  const isOwner = msg.user_id === server.owner_id;

                  const msgMember = (server.members || []).find((sm) => sm.user_id === msg.user_id);
                  const effectiveMsgName = msgMember?.nickname || msg.profile?.display_name || 'Member';
                  const effectiveMsgAvatar = msgMember?.avatar_path || (msg.profile as any)?.avatar_path || msg.profile?.avatar_url || null;

                  return (
                    <div
                      key={msg.id}
                      className="flex items-start gap-3 group rounded-control hover:bg-surface-hover p-2 -mx-2 transition-colors mb-2"
                    >
                      <ProfileCardTrigger userId={msg.user_id} serverId={server.id}>
                        <Avatar
                          src={effectiveMsgAvatar}
                          name={effectiveMsgName}
                          size="32"
                          className="mt-0.5 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      </ProfileCardTrigger>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ProfileCardTrigger userId={msg.user_id} serverId={server.id}>
                            <span className="font-semibold text-body text-foreground hover:text-primary cursor-pointer transition-colors">
                              {effectiveMsgName}
                            </span>
                          </ProfileCardTrigger>

                          {isOwner && (
                            <Badge variant="warning" className="text-caption px-1.5 py-0 gap-1">
                              <Crown className="w-2.5 h-2.5" />
                              Owner
                            </Badge>
                          )}

                          <span className="text-meta text-muted-foreground tabular-nums">
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
                            <span className="flex items-center gap-1 text-meta text-muted-foreground">
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />
                              <span>sending...</span>
                            </span>
                          )}

                          {msg.status === 'failed' && (
                            <span className="flex items-center gap-1.5 text-meta text-danger">
                              <AlertCircle className="w-3 h-3" />
                              <span>failed</span>
                              <button
                                type="button"
                                onClick={() => retryMessage(msg.id)}
                                className="text-meta text-primary hover:underline ml-1"
                              >
                                <RefreshCw className="w-2.5 h-2.5 inline mr-0.5" />
                                Retry
                              </button>
                            </span>
                          )}
                        </div>

                        <div className="text-body text-foreground mt-1 leading-relaxed break-words font-normal">
                          <MessageContent content={msg.content} />
                        </div>
                      </div>

                      {/* Hover Action Bar */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card px-1 py-0.5 rounded-control border border-border shrink-0 ml-auto self-start">
                        <button
                          onClick={() => setReplyingTo(msg)}
                          className="p-1 rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                          title="Reply"
                          aria-label="Reply"
                        >
                          <Reply className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() =>
                            setForwardingMessage({
                              id: msg.id,
                              content: msg.content,
                              sender: msg.profile,
                            })
                          }
                          className="p-1 rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                          title="Forward"
                          aria-label="Forward"
                        >
                          <Forward className="w-3 h-3" />
                        </button>
                        {msg.user_id !== user?.id && (
                          <button
                            onClick={() =>
                              setReportingMessage({
                                id: msg.id,
                                user_id: msg.user_id,
                                sender: msg.profile,
                              })
                            }
                            className="p-1 rounded-control text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Report"
                            aria-label="Report"
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }}
              />

              {/* Jump to latest button */}
              {isScrolledUp && (
                <button
                  onClick={() => {
                    if (virtuosoRef.current) {
                      virtuosoRef.current.scrollToIndex({
                        index: filteredMessages.length - 1,
                        align: 'end',
                        behavior: 'smooth',
                      });
                    }
                    setIsScrolledUp(false);
                    isNearBottomRef.current = true;
                  }}
                  className="absolute bottom-4 right-6 z-30 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs shadow-floating flex items-center gap-1.5 hover:bg-primary-hover transition"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Jump to latest</span>
                </button>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-border bg-surface-sidebar shrink-0">
              {replyingTo && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-primary-subtle border-t border-primary/20 text-xs text-primary rounded-t-control mb-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <Reply className="w-3.5 h-3.5 rotate-180" />
                    <span>
                      Replying to <strong>@{replyingTo.profile?.username || 'member'}</strong>: &ldquo;
                      {replyingTo.content.slice(0, 50)}...&rdquo;
                    </span>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="hover:opacity-80 p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {isTimedOut && (
                <div className="mb-2 p-2.5 rounded-control bg-warning/10 border border-warning/20 flex items-center gap-2 text-xs text-warning">
                  <Clock className="w-4 h-4 shrink-0 text-warning" />
                  <span>
                    You are currently timed out in this server until {new Date(currentMember!.timeout_until!).toLocaleTimeString()}. You cannot send messages.
                  </span>
                </div>
              )}

              <div className="relative">
                {/* Mention autocomplete dropdown */}
                {mentionCandidates.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 max-h-52 overflow-y-auto rounded-dialog bg-popover border border-border shadow-floating p-1.5 z-50">
                    <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between border-b border-border mb-1">
                      <span>Mention members</span>
                      <span className="text-xs opacity-70">↑↓ navigate • ↵ select</span>
                    </div>
                    <div className="space-y-0.5">
                      {mentionCandidates.map((m, idx) => (
                        <div
                          key={m.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(m.username);
                          }}
                          onMouseEnter={() => setMentionSelectedIndex(idx)}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-control text-xs cursor-pointer transition-colors",
                            idx === mentionSelectedIndex
                              ? "bg-primary-subtle text-primary font-medium"
                              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                          )}
                        >
                          {m.isSpecial ? (
                            <div className="w-5 h-5 rounded bg-warning/10 text-warning flex items-center justify-center font-bold text-xs shrink-0">
                              @
                            </div>
                          ) : (
                            <Avatar src={m.avatar_url} name={m.display_name} size="24" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground text-xs truncate">
                                {m.display_name}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                @{m.username}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!canSendMessages ? (
                  <div className="flex items-center justify-center gap-2 bg-card/60 border border-border rounded-control p-3 text-muted-foreground select-none">
                    <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium">
                      {isTimedOut
                        ? `You are currently timed out in this server until ${new Date(currentMember!.timeout_until!).toLocaleTimeString()}`
                        : 'You do not have permission to send messages in this channel.'}
                    </span>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSend}
                    className="flex items-center gap-2 bg-card border border-border rounded-control p-1.5 px-3 focus-within:ring-1 focus-within:ring-ring transition-all"
                  >
                    {canUseSoundboard && (
                      <button
                        type="button"
                        onClick={() => setShowSoundboard(true)}
                        aria-label="Soundboard"
                        className="text-muted-foreground hover:text-warning p-1 rounded-control transition-colors shrink-0"
                        title="Soundboard"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                    )}

                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={inputText}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      aria-label={`Message #${channel.name}`}
                      placeholder={`Message #${channel.name}...`}
                      className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none resize-none max-h-28 py-1 font-normal"
                    />

                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      aria-label="Send channel message"
                      disabled={!inputText.trim() || isSending}
                      className="h-7 w-7 p-0 shrink-0"
                    >
                      {isSending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Squad Members Panel */}
      {showMembers && (
        <ChannelMembersPanel
          server={server}
          currentUserId={user?.id}
          members={squadList}
          onStartDirectChat={handleStartDirectChat}
          onStartCall={handleStartCall}
          onTimeoutMember={(userId, duration, reason) => timeoutMember(server.id, userId, duration, reason)}
          onKickMember={(userId) => kickMember(server.id, userId)}
          onBanMember={(userId, reason) => banMember(server.id, userId, reason)}
          onBlockUser={(userId, name) => blockUser(userId, name)}
        />
      )}

      {/* Soundboard Modal */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} />

      {/* Invite Modal */}
      <InviteModal open={showInviteModal} onOpenChange={setShowInviteModal} server={server} />

      {/* Forward Modal */}
      <ForwardModal
        message={forwardingMessage}
        open={Boolean(forwardingMessage)}
        onOpenChange={(op) => !op && setForwardingMessage(null)}
      />

      {/* Report Modal */}
      <ReportModal
        reportedUserId={reportingMessage?.user_id || reportingMessage?.sender?.id || null}
        reportedUserName={reportingMessage?.sender?.display_name || 'Member'}
        serverId={server.id}
        channelId={channel.id}
        messageId={reportingMessage?.id || null}
        open={Boolean(reportingMessage)}
        onOpenChange={(op) => !op && setReportingMessage(null)}
      />
    </div>
  );
}
