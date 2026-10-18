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
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Video,
  VideoOff,
  Monitor,
  MonitorUp,
  PhoneOff,
  UserPlus,
  Radio,
  Sliders,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Reply,
  Forward,
  Flag,
  ArrowDown,
  Clock,
} from 'lucide-react';
import { ForwardModal } from '@/components/chat/forward-modal';
import { ReportModal } from '@/components/social/report-modal';
import { ChannelMessage } from '@/lib/types/server';
import { useRouter } from 'next/navigation';
import { Server, Channel, hasServerPermission } from '@/lib/types/server';
import { useChannelMessages } from '@/hooks/use-channel-messages';
import { useAuth } from '@/features/auth/auth-provider';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { useServerVoice } from '@/hooks/use-server-voice';
import { getBrowserClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { InviteModal } from './invite-modal';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
import { MessageContent } from '@/components/chat/message-content';

function StreamVideo({
  stream,
  isMuted = false,
  className,
  objectFit = 'contain',
}: {
  stream: MediaStream | null;
  isMuted?: boolean;
  className?: string;
  objectFit?: 'contain' | 'cover';
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.play().catch(() => {});
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className={cn('w-full h-full bg-black/80 flex items-center justify-center text-muted-foreground text-xs font-mono', className)}>
        Connecting live feed...
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isMuted}
      className={cn('w-full h-full', objectFit === 'cover' ? 'object-cover' : 'object-contain', className)}
    />
  );
}

interface ChannelViewProps {
  server: Server;
  channel: Channel;
}

export function ChannelView({ server, channel }: ChannelViewProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { getOrCreateDirectConversation } = useConversations();
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
  const [showSearch, setShowSearch] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isNearBottomRef = React.useRef(true);

  // Phase 4 enhancements: reply, forward, report, draft, and jump-to-latest
  const [replyingTo, setReplyingTo] = React.useState<ChannelMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = React.useState<any | null>(null);
  const [reportingMessage, setReportingMessage] = React.useState<any | null>(null);
  const [isScrolledUp, setIsScrolledUp] = React.useState(false);

  // Mention autocomplete state
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

  // Screen Share Box and Fullscreen
  const screenShareBoxRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const toggleFullscreen = () => {
    if (!screenShareBoxRef.current) return;
    if (!document.fullscreenElement) {
      screenShareBoxRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const activeScreenShare = React.useMemo(() => {
    if (voice.isScreenSharing && voice.screenStream) {
      return {
        userId: user?.id,
        isLocal: true,
        userName: profile?.display_name || 'You',
        stream: voice.screenStream,
      };
    }
    const remotePresenter = voice.remoteParticipants.find((p) => p.is_screen_sharing);
    if (remotePresenter) {
      const stream = voice.remoteVideoStreams.get(remotePresenter.user_id);
      return {
        userId: remotePresenter.user_id,
        isLocal: false,
        userName: remotePresenter.display_name,
        stream: stream || null,
      };
    }
    return null;
  }, [voice.isScreenSharing, voice.screenStream, voice.remoteParticipants, voice.remoteVideoStreams, user?.id, profile?.display_name]);

  // Current member and timeout state
  const currentMember = React.useMemo(() => {
    return (server.members || []).find((m) => m.user_id === user?.id) || null;
  }, [server.members, user?.id]);

  const isTimedOut = React.useMemo(() => {
    if (!currentMember?.timeout_until) return false;
    return new Date(currentMember.timeout_until) > new Date();
  }, [currentMember?.timeout_until]);

  // Permissions for current user
  const canSendMessages = !isTimedOut && hasServerPermission(server, user?.id, 'send_messages');
  const canConnectVoice = hasServerPermission(server, user?.id, 'connect_voice');
  const canSpeakVoice = !isTimedOut && hasServerPermission(server, user?.id, 'speak_voice');
  const canShareScreen = !isTimedOut && hasServerPermission(server, user?.id, 'share_screen');
  const canUseSoundboard = !isTimedOut && hasServerPermission(server, user?.id, 'use_soundboard');

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const { isVoiceConnected, isConnecting, connectVoice } = voice;

  const handleStartDirectChat = async (targetUserId: string, targetName: string) => {
    if (!targetUserId || targetUserId === user?.id) {
      toast({ title: 'You', description: 'This is your own profile.', type: 'info' });
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
    if (isTimedOut) {
      toast({
        title: 'Timed Out',
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
        toast({
          title: 'Channel Message Failed',
          description: `${res.error}`,
          type: 'error',
          action: {
            label: 'Open Logs',
            onClick: () => triggerOpenLogsWindow(),
          },
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

        // Dispatch mention notifications to mentioned users in this server
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
                title: `${profile?.display_name || (user as any)?.display_name || 'Someone'} mentioned you in #${channel.name}`,
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

    // 1. Server members only
    if (server.members && server.members.length > 0) {
      for (const m of server.members) {
        if (!seenIds.has(m.user_id)) {
          seenIds.add(m.user_id);
          const isCurrentUser = m.user_id === user?.id;
          const memberProfile = isCurrentUser ? (profile || m.profile) : m.profile;
          list.push({
            id: m.user_id,
            display_name: memberProfile?.display_name || (isCurrentUser ? (profile?.display_name || 'You') : 'Squad Member'),
            username: memberProfile?.username || (isCurrentUser ? (profile?.username || 'you') : 'member'),
            avatar_url: memberProfile?.avatar_url || null,
            role: m.role || (m.user_id === server.owner_id ? 'owner' : 'member'),
            status: (memberProfile?.status as any) || (isCurrentUser ? 'online' : 'offline'),
            game_activity: memberProfile?.game_activity || null,
          });
        }
      }
    }

    // Fallback: if server.members hasn't loaded yet, show the current user / owner
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

  // Mention autocomplete logic for channel chat
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
        { id: 'everyone', username: 'everyone', display_name: 'Everyone in Channel', avatar_url: null, isSpecial: true },
        { id: 'here', username: 'here', display_name: 'Online Members', avatar_url: null, isSpecial: true },
        { id: 'all', username: 'all', display_name: 'All Members', avatar_url: null, isSpecial: true },
      ];

      const allTargets = [...specials, ...members];
      const filtered = allTargets.filter(
        (t) =>
          t.username.toLowerCase().includes(query) ||
          t.display_name.toLowerCase().includes(query)
      );

      setMentionCandidates(filtered);
      setMentionSelectedIndex(0);
    } else {
      setMentionCandidates([]);
    }
  };

  const insertMention = (targetUsername: string) => {
    const cursor = textareaRef.current?.selectionStart ?? inputText.length;
    const textBeforeCursor = inputText.slice(0, cursor);
    const textAfterCursor = inputText.slice(cursor);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex !== -1) {
      const newBefore = textBeforeCursor.slice(0, atIndex) + `@${targetUsername} `;
      const newFull = newBefore + textAfterCursor;
      setInputText(newFull);
      setMentionCandidates([]);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newBefore.length, newBefore.length);
        }
      }, 0);
    }
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
        <div className="h-12 border-b border-white/[0.06] px-3 sm:px-4 flex items-center justify-between shrink-0 bg-surface-header/90 backdrop-blur-md select-none">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => router.push('/')}
              className="p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] rounded-md transition-colors flex items-center gap-1"
              title="Back to Direct Messages & Friends"
              aria-label="Back to Direct Messages"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 min-w-0">
              {isVoiceChannel ? (
                <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Hash className="w-4 h-4 text-muted-foreground/70 shrink-0" />
              )}
              <h3 className="font-semibold text-xs text-foreground truncate">
                {channel.name}
              </h3>
            </div>

            {isVoiceChannel ? (
              <Badge
                variant="outline"
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 border font-mono transition-all",
                  voice.isVoiceConnected
                    ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/15 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                    : voice.isConnecting
                    ? "border-amber-500/40 text-amber-300 bg-amber-500/15"
                    : "border-white/[0.1] text-muted-foreground bg-white/[0.04]"
                )}
                title="GCP Studio AudioWorklet Noise Cancellation Active"
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  voice.isVoiceConnected
                    ? "bg-emerald-400 animate-pulse"
                    : voice.isConnecting
                    ? "bg-amber-400 animate-ping"
                    : "bg-muted-foreground/50"
                )} />
                <span>
                  {voice.isVoiceConnected
                    ? 'Connected • GCP Studio Filter'
                    : voice.isConnecting
                    ? 'Connecting to Voice...'
                    : 'GCP Studio Audio'}
                </span>
              </Badge>
            ) : (
              channel.topic && (
                <>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0 hidden sm:inline-block" />
                  <span className="text-[11px] text-muted-foreground/70 truncate hidden sm:inline-block max-w-sm font-normal">
                    {channel.topic}
                  </span>
                </>
              )
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Quick Invite Squadmates */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInviteModal(true)}
              className="h-7 text-xs px-2.5 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 rounded-md font-medium"
              title="Invite Squadmates to Server"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-normal">Invite</span>
            </Button>

            {/* Direct Messages Shortcut Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/')}
              className="h-7 text-xs px-2.5 gap-1.5 border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] rounded-md font-medium"
              title="Switch to Direct Messages & Friends"
            >
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline font-normal">Direct Chats</span>
            </Button>

            {/* If in voice channel: Toggle Voice Chat drawer */}
            {isVoiceChannel && (
              <button
                type="button"
                onClick={() => setShowVoiceChat((prev) => !prev)}
                className={cn(
                  'p-1.5 rounded-md transition-colors text-xs flex items-center gap-1 font-medium',
                  showVoiceChat
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                )}
                title="Toggle Voice Text Chat"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden md:inline text-[11px]">Chat</span>
              </button>
            )}

            {/* Search Toggle for Text */}
            {!isVoiceChannel && (
              <div className="relative">
                {showSearch ? (
                  <div className="flex items-center gap-1.5 bg-white/[0.03] rounded-md px-2 py-1 border border-white/[0.08]">
                    <Search className="w-3.5 h-3.5 text-muted-foreground/60" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search in channel..."
                      aria-label="Search in channel"
                      className="w-32 sm:w-44 bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground/50"
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
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                    title="Search Messages"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Soundboard Trigger */}
            {canUseSoundboard && (
              <button
                type="button"
                onClick={() => setShowSoundboard(true)}
                aria-label="Soundboard"
                className="p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                title="Soundboard"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}

            {/* Members Toggle */}
            <button
              onClick={() => setShowMembers((prev) => !prev)}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                showMembers
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
              )}
              title="Toggle Squad Member List"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Center Stage Content: Voice Lounge Stage OR Text Chat Feed */}
        {isVoiceChannel ? (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
            {/* Left: The Voice Room Stage */}
            <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-surface-sidebar/50 via-background to-background overflow-y-auto">
              {/* Voice Room Top Banner */}
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">{channel.name}</h2>
                    {voice.isVoiceConnected ? (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Live Audio Stage
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-muted-foreground text-[10px] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                        Disconnected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {channel.topic || 'WebRTC encrypted voice room with AI noise cancellation & low latency.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-white/[0.08] text-muted-foreground font-mono">
                    Ping: 18ms
                  </Badge>
                </div>
              </div>

              {/* Dynamic Live Stage: Theater Mode when someone is sharing, or Grid Mode */}
              <div className="flex-1 flex flex-col justify-center min-h-0 my-3">
                {voice.isVoiceConnected ? (
                  activeScreenShare ? (
                    /* THEATER MODE: Active Screen Share + Persistent Squad Dock */
                    <div className="flex-1 flex flex-col min-h-0 gap-3">
                      {/* 1. Large Screen Share Window */}
                      <div
                        ref={screenShareBoxRef}
                        className="flex-1 min-h-[220px] max-h-[56vh] w-full rounded-2xl overflow-hidden border border-emerald-500/30 bg-black aspect-video relative shadow-2xl mx-auto flex items-center justify-center group"
                      >
                        <StreamVideo
                          stream={activeScreenShare.stream}
                          isMuted={activeScreenShare.isLocal}
                          objectFit="contain"
                          className="w-full h-full"
                        />
                        {/* Top Bar Overlay */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                          <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/[0.1] text-xs font-semibold text-emerald-400 shadow-md pointer-events-auto">
                            <MonitorUp className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{activeScreenShare.isLocal ? 'Your Screen is Live' : `${activeScreenShare.userName}'s Screen`}</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[9px] font-mono">LIVE HD</span>
                          </div>

                          <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="p-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/[0.1] text-white/80 hover:text-white hover:bg-black/90 transition-all pointer-events-auto shadow-md"
                            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                          >
                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* 2. ALWAYS-VISIBLE SQUAD STRIP (Prevents other users from disappearing) */}
                      <div className="shrink-0 flex items-center gap-3 overflow-x-auto pb-1 px-1">
                        {/* Local Gamer Card (Compact Strip) */}
                        <div className="shrink-0 w-36 sm:w-44 rounded-xl border border-emerald-500/30 bg-surface-panel/90 backdrop-blur-md p-2.5 flex items-center gap-2.5 shadow-panel">
                          <div className="relative shrink-0">
                            {voice.isCameraOn && voice.videoStream ? (
                              <div className="w-9 h-9 rounded-lg overflow-hidden border border-emerald-500 relative">
                                <StreamVideo stream={voice.videoStream} isMuted objectFit="cover" className="w-full h-full" />
                              </div>
                            ) : (
                              <Avatar
                                src={profile?.avatar_url || null}
                                name={profile?.display_name || 'You'}
                                size="sm"
                                className={cn(
                                  'transition-all',
                                  voice.isSpeaking
                                    ? 'ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.85)]'
                                    : 'ring-1 ring-emerald-500/20'
                                )}
                              />
                            )}
                            {voice.isMicMuted ? (
                              <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-rose-500 text-white">
                                <MicOff className="w-2.5 h-2.5" />
                              </div>
                            ) : (
                              <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-emerald-500 text-white">
                                <Mic className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-foreground truncate">
                              {profile?.display_name || 'You'}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {voice.isSpeaking ? 'Speaking...' : voice.isMicMuted ? 'Muted' : 'Online'}
                            </div>
                          </div>
                        </div>

                        {/* Remote Participants in Strip */}
                        {voice.remoteParticipants.map((mem) => {
                          const remoteStream = voice.remoteVideoStreams.get(mem.user_id);
                          return (
                            <div
                              key={mem.user_id || mem.id}
                              className={cn(
                                'shrink-0 w-36 sm:w-44 rounded-xl border bg-surface-default/80 backdrop-blur-md p-2.5 flex items-center gap-2.5 shadow-panel transition-all',
                                mem.is_speaking
                                  ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                                  : 'border-white/[0.08]'
                              )}
                            >
                              <div className="relative shrink-0">
                                {mem.is_camera_on && remoteStream ? (
                                  <div className="w-9 h-9 rounded-lg overflow-hidden border border-emerald-500 relative">
                                    <StreamVideo stream={remoteStream} objectFit="cover" className="w-full h-full" />
                                  </div>
                                ) : (
                                  <Avatar
                                    src={mem.avatar_url || null}
                                    name={mem.display_name}
                                    size="sm"
                                    className={cn(
                                      'transition-all',
                                      mem.is_speaking
                                        ? 'ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.85)]'
                                        : 'ring-1 ring-white/[0.1]'
                                    )}
                                  />
                                )}
                                {mem.is_muted ? (
                                  <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-rose-500 text-white">
                                    <MicOff className="w-2.5 h-2.5" />
                                  </div>
                                ) : (
                                  <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-emerald-500 text-white">
                                    <Mic className="w-2.5 h-2.5" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-foreground truncate">
                                  {mem.display_name}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {mem.is_speaking ? 'Speaking...' : mem.is_muted ? 'Muted' : 'Online'}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Invite Teammates button in strip */}
                        <button
                          type="button"
                          onClick={() => setShowInviteModal(true)}
                          className="shrink-0 px-3 py-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.06] hover:border-primary/40 text-xs text-muted-foreground hover:text-primary transition-all flex items-center gap-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Invite</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* GRID MODE: Standard Stage when no screen is being shared */
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
                      {/* Local Gamer Card */}
                      <div className="relative group rounded-2xl border border-emerald-500/30 bg-surface-panel/80 backdrop-blur-md p-5 flex flex-col items-center justify-center text-center shadow-panel transition-all hover:border-emerald-500/50 overflow-hidden">
                        {voice.isCameraOn && voice.videoStream ? (
                          <div className="w-24 h-24 rounded-2xl overflow-hidden mb-3 border-2 border-emerald-500 shadow-glow-sm relative">
                            <StreamVideo stream={voice.videoStream} isMuted objectFit="cover" className="w-full h-full" />
                            <div className="absolute bottom-1 right-1 p-0.5 rounded bg-black/60 text-[9px] text-emerald-400 font-mono">
                              HD
                            </div>
                          </div>
                        ) : (
                          <div className="relative mb-3">
                            <Avatar
                              src={profile?.avatar_url || null}
                              name={profile?.display_name || 'You'}
                              size="lg"
                              className={cn(
                                'transition-all duration-150',
                                voice.isSpeaking
                                  ? 'ring-4 ring-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.85)] scale-105'
                                  : 'ring-2 ring-emerald-500/20'
                              )}
                            />
                            {voice.isMicMuted ? (
                              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-500 text-white shadow-subtle">
                                <MicOff className="w-3 h-3" />
                              </div>
                            ) : (
                              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-subtle">
                                <Mic className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          <span>{profile?.display_name || 'You'}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">(You)</span>
                        </div>
                        <div className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                          @{profile?.username || 'gamer'}
                        </div>

                        {/* Equalizer animation dynamically matching real mic waveform volume */}
                        <div className="flex items-end justify-center gap-1 mt-3 h-6">
                          {!voice.isMicMuted ? (
                            <>
                              <span
                                className={cn(
                                  'w-1 rounded-full transition-all duration-75',
                                  voice.isSpeaking
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                                    : 'bg-emerald-500/30'
                                )}
                                style={{
                                  height: `${Math.max(4, Math.min(22, Math.round(4 + (voice.audioLevel / 100) * 18 * 0.8)))}px`,
                                }}
                              />
                              <span
                                className={cn(
                                  'w-1 rounded-full transition-all duration-75',
                                  voice.isSpeaking
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                                    : 'bg-emerald-500/30'
                                )}
                                style={{
                                  height: `${Math.max(4, Math.min(24, Math.round(4 + (voice.audioLevel / 100) * 20 * 1.2)))}px`,
                                }}
                              />
                              <span
                                className={cn(
                                  'w-1 rounded-full transition-all duration-75',
                                  voice.isSpeaking
                                    ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,1)]'
                                    : 'bg-emerald-500/30'
                                )}
                                style={{
                                  height: `${Math.max(4, Math.min(26, Math.round(4 + (voice.audioLevel / 100) * 22 * 1.0)))}px`,
                                }}
                              />
                              <span
                                className={cn(
                                  'w-1 rounded-full transition-all duration-75',
                                  voice.isSpeaking
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                                    : 'bg-emerald-500/30'
                                )}
                                style={{
                                  height: `${Math.max(4, Math.min(24, Math.round(4 + (voice.audioLevel / 100) * 20 * 1.3)))}px`,
                                }}
                              />
                              <span
                                className={cn(
                                  'w-1 rounded-full transition-all duration-75',
                                  voice.isSpeaking
                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                                    : 'bg-emerald-500/30'
                                )}
                                style={{
                                  height: `${Math.max(4, Math.min(22, Math.round(4 + (voice.audioLevel / 100) * 18 * 0.7)))}px`,
                                }}
                              />
                            </>
                          ) : (
                            <span className="text-[10px] text-rose-400 font-mono">Microphone Muted</span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
                          <Badge variant="subtle" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                            Squadmate
                          </Badge>
                          {voice.isNoiseSuppressionEnabled && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                              Studio DSP Noise Filter
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Remote Connected Peers */}
                      {voice.remoteParticipants.map((mem) => {
                        const remoteStream = voice.remoteVideoStreams.get(mem.user_id);
                        return (
                          <div
                            key={mem.user_id || mem.id}
                            className={cn(
                              'relative group rounded-2xl border bg-surface-default/60 backdrop-blur-md p-5 flex flex-col items-center justify-center text-center shadow-panel transition-all',
                              mem.is_speaking
                                ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                                : 'border-white/[0.08] hover:border-white/[0.16]'
                            )}
                          >
                            {mem.is_camera_on && remoteStream ? (
                              <div className="w-24 h-24 rounded-2xl overflow-hidden mb-3 border-2 border-emerald-500 shadow-glow-sm relative">
                                <StreamVideo stream={remoteStream} objectFit="cover" className="w-full h-full" />
                                <div className="absolute bottom-1 right-1 p-0.5 rounded bg-black/60 text-[9px] text-emerald-400 font-mono">
                                  HD
                                </div>
                              </div>
                            ) : (
                              <div className="relative mb-3">
                                <Avatar
                                  src={mem.avatar_url || null}
                                  name={mem.display_name}
                                  size="lg"
                                  className={cn(
                                    'transition-all duration-150',
                                    mem.is_speaking
                                      ? 'ring-4 ring-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.85)] scale-105'
                                      : 'ring-2 ring-emerald-500/20'
                                  )}
                                />
                                {mem.is_muted ? (
                                  <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-500 text-white shadow-subtle">
                                    <MicOff className="w-3 h-3" />
                                  </div>
                                ) : (
                                  <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-subtle">
                                    <Mic className="w-3 h-3" />
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="text-sm font-bold text-foreground">
                              {mem.display_name}
                            </div>

                            <div className="flex items-end justify-center gap-1 mt-3 h-6">
                              {!mem.is_muted ? (
                                mem.is_speaking ? (
                                  <>
                                    <span className="w-1 h-3.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                    <span className="w-1 h-5 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                    <span className="w-1 h-6 bg-emerald-300 rounded-full animate-bounce [animation-delay:300ms]" />
                                    <span className="w-1 h-5 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                    <span className="w-1 h-3.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                  </>
                                ) : (
                                  <span className="text-[10px] text-emerald-400/80 font-mono">Live Audio Connected</span>
                                )
                              ) : (
                                <span className="text-[10px] text-rose-400/80 font-mono">Muted</span>
                              )}
                            </div>

                            <div className="mt-3">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/[0.08] text-muted-foreground">
                                Squadmate
                              </Badge>
                            </div>
                          </div>
                        );
                      })}

                      {/* Empty Invite Teammates Slot */}
                      <div
                        onClick={() => setShowInviteModal(true)}
                        className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04] hover:border-primary/40 p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                      >
                        <div className="w-12 h-12 rounded-full bg-white/[0.04] group-hover:bg-primary/10 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-colors mb-2">
                          <UserPlus className="w-5 h-5" />
                        </div>
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          Invite Teammates
                        </div>
                        <div className="text-[10px] text-muted-foreground max-w-[140px] mt-1 leading-snug">
                          Share link to assemble your squad for scrims
                        </div>
                      </div>
                    </div>
                  )
                ) : voice.isConnecting ? (
                  <div className="text-center py-16 max-w-sm mx-auto space-y-4">
                    <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 animate-ping" />
                      <div className="relative w-14 h-14 rounded-2xl bg-emerald-500/30 border border-emerald-500/60 text-emerald-400 flex items-center justify-center shadow-glow-sm">
                        <Volume2 className="w-7 h-7 animate-pulse" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">Connecting to Voice Lounge...</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Negotiating encrypted WebRTC audio mesh for {channel.name}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 max-w-md mx-auto space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-glow-sm">
                      <Volume2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">You are disconnected</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Connect to {channel.name} to talk with teammates using encrypted WebRTC voice.
                      </p>
                    </div>

                    {/* Preview of Teammates Already in Lounge */}
                    {(() => {
                      const cleanId = (channel.id || '').toLowerCase().trim();
                      const rawOccupants = voice.channelOccupants.get(cleanId) || voice.channelOccupants.get(channel.id) || [];
                      const currentOccupants = rawOccupants.filter((p) => (voice.isVoiceConnected ? true : p.user_id !== user?.id));
                      if (currentOccupants.length === 0) return null;

                      return (
                        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-left space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                            <span>Already in this lounge ({currentOccupants.length})</span>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {currentOccupants.map((occ) => (
                              <div
                                key={occ.user_id || occ.id}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-panel border border-white/[0.06] text-xs text-foreground"
                              >
                                <Avatar src={occ.avatar_url || null} name={occ.display_name} size="xs" className="w-4 h-4" />
                                <span className="font-medium text-[11px] truncate max-w-[120px]">{occ.display_name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <Button
                      onClick={async () => {
                        if (!canConnectVoice) {
                          toast({ title: 'Access Denied', description: 'Your role cannot join voice lounges.', type: 'error' });
                          return;
                        }
                        try {
                          await voice.connectVoice();
                          toast({ title: 'Connected to Voice Lounge', description: `${channel.name} • GCP Studio Audio`, type: 'success' });
                        } catch (err: any) {
                          toast({ title: 'Connection Notice', description: err?.message || 'Connecting to lounge...', type: 'info' });
                        }
                      }}
                      disabled={!canConnectVoice}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-subtle px-6"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>{canConnectVoice ? 'Join Voice Lounge' : 'Voice Restricted'}</span>
                    </Button>
                  </div>
                )}
              </div>

              {/* Bottom Voice Control Dock */}
              {voice.isVoiceConnected && (
                <div className="mt-auto pt-4 border-t border-white/[0.06] flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
                  {/* Mic Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!canSpeakVoice && voice.isMicMuted) {
                        toast({ title: 'Speaking Restricted', description: 'Your role cannot unmute in this channel.', type: 'error' });
                        return;
                      }
                      voice.toggleMic();
                    }}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      voice.isMicMuted
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    )}
                    title={voice.isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  >
                    {voice.isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    <span className="text-xs font-semibold hidden sm:inline">
                      {voice.isMicMuted ? 'Muted' : 'Mute'}
                    </span>
                  </button>

                  {/* Deafen Toggle */}
                  <button
                    type="button"
                    onClick={voice.toggleDeafen}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      voice.isDeafened
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                    )}
                    title={voice.isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
                  >
                    {voice.isDeafened ? <VolumeX className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
                    <span className="text-xs font-semibold hidden sm:inline">
                      {voice.isDeafened ? 'Deafened' : 'Deafen'}
                    </span>
                  </button>

                  {/* Live Mic Sensitivity VU Bar */}
                  {!voice.isMicMuted && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-subtle">
                      <Volume2
                        className={cn(
                          'w-4 h-4 transition-colors',
                          voice.isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-muted-foreground'
                        )}
                      />
                      <div className="w-16 h-2 rounded-full bg-white/[0.08] overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-75',
                            voice.isSpeaking ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-emerald-500/40'
                          )}
                          style={{ width: `${Math.min(100, voice.audioLevel)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">
                        {voice.audioLevel}%
                      </span>
                    </div>
                  )}

                  {/* Camera Toggle */}
                  {canShareScreen && (
                    <button
                      type="button"
                      onClick={() => voice.toggleCamera()}
                      className={cn(
                        'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                        voice.isCameraOn
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                      )}
                      title="Toggle Video Camera"
                    >
                      {voice.isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                      <span className="text-xs font-semibold hidden sm:inline">Camera</span>
                    </button>
                  )}

                  {/* Screen Share Toggle */}
                  {canShareScreen && (
                    <button
                      type="button"
                      onClick={() => voice.toggleScreenShare()}
                      className={cn(
                        'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                        voice.isScreenSharing
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                      )}
                      title="Share Screen or Gameplay"
                    >
                      {voice.isScreenSharing ? <MonitorUp className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                      <span className="text-xs font-semibold hidden sm:inline">Share</span>
                    </button>
                  )}

                  {/* AI Noise Suppression Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      voice.toggleNoiseSuppression();
                      toast({
                        title: voice.isNoiseSuppressionEnabled
                          ? 'GCP Noise Filter Disabled'
                          : 'GCP Studio Noise Filter Enabled',
                        description: voice.isNoiseSuppressionEnabled
                          ? 'Raw microphone audio'
                          : '5-Stage Acoustic DSP & AudioWorklet Voice Gate',
                        type: 'info',
                      });
                    }}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      voice.isNoiseSuppressionEnabled
                        ? 'bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30'
                        : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                    )}
                    title={voice.isNoiseSuppressionEnabled ? "GCP Studio Noise Filter Active" : "GCP Noise Filter Disabled"}
                  >
                    <Sparkles className="w-5 h-5" />
                    <span className="text-xs font-semibold hidden sm:inline">
                      {voice.isNoiseSuppressionEnabled ? 'GCP Studio Filter' : 'Filter Off'}
                    </span>
                  </button>

                  {/* Soundboard Trigger */}
                  {canUseSoundboard && (
                    <button
                      type="button"
                      onClick={() => setShowSoundboard(true)}
                      className="p-3 rounded-2xl bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-2 transition-all shadow-subtle"
                      title="Soundboard Clips"
                    >
                      <Radio className="w-5 h-5" />
                      <span className="text-xs font-semibold hidden sm:inline">Sounds</span>
                    </button>
                  )}

                  {/* Disconnect Button */}
                  <button
                    type="button"
                    onClick={() => {
                      voice.disconnectVoice();
                      toast({ title: 'Voice Disconnected', description: 'Left voice lounge', type: 'info' });
                    }}
                    className="p-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 transition-all shadow-subtle font-semibold text-xs"
                    title="Disconnect from Voice Lounge"
                  >
                    <PhoneOff className="w-5 h-5" />
                    <span className="hidden sm:inline">Disconnect</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Side: Embedded Voice Text Chat Drawer */}
            {showVoiceChat && (
              <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/[0.06] flex flex-col h-64 lg:h-full bg-surface-sidebar/70 backdrop-blur-md shrink-0">
                <div className="p-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    <span>Voice Channel Chat</span>
                  </div>
                  <button
                    onClick={() => setShowVoiceChat(false)}
                    className="text-muted-foreground hover:text-foreground p-1"
                    title="Close Chat"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
                  {messages.map((m) => (
                    <div key={m.id} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 mb-1">
                        <span className="font-semibold text-foreground">
                          {m.profile?.display_name || 'Member'}
                        </span>
                        <span className="font-mono">
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
                      <p className="text-foreground/80 leading-snug">{m.content}</p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input in Voice Chat */}
                <form onSubmit={handleSend} className="p-2.5 border-t border-white/[0.06] flex gap-1.5">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={!canSendMessages}
                    placeholder={canSendMessages ? "Chat in voice lounge..." : "Message permissions restricted"}
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 disabled:opacity-50"
                  />
                  <Button type="submit" size="sm" disabled={!inputText.trim() || isSending || !canSendMessages} className="h-8 px-2.5">
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </form>
              </div>
            )}
          </div>
        ) : (
          /* Classic Text Channel Chat Feed */
          <>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3"
            >
              {/* Channel Start Banner */}
              <div className="py-4 space-y-2 border-b border-white/[0.06] mb-3">
                <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-primary">
                  <Hash className="w-6 h-6" />
                </div>
                <h2 className="text-base font-semibold text-foreground tracking-tight">
                  Welcome to #{channel.name}
                </h2>
                <p className="text-xs text-muted-foreground/70 max-w-md leading-relaxed font-normal">
                  This is the start of the #{channel.name} channel for {server.name}. Share strats, callouts, and coordinate your gaming matches.
                </p>
              </div>

              {filteredMessages.map((msg) => {
                const isOwner = msg.user_id === server.owner_id;

                return (
                  <div
                    key={msg.id}
                    className="flex items-start gap-3 group rounded-lg hover:bg-white/[0.02] p-2 -mx-2 transition-colors"
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
                        className="mt-0.5 shrink-0 hover:ring-1 hover:ring-primary/60 transition-all"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          onClick={() => handleStartDirectChat(msg.user_id, msg.profile?.display_name || 'Member')}
                          className="font-medium text-xs text-foreground hover:text-primary cursor-pointer transition-colors"
                          title="Send direct message"
                        >
                          {msg.profile?.display_name || 'Squad Member'}
                        </span>

                        {isOwner ? (
                          <Badge
                            variant="default"
                            className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-300 border-amber-500/20 gap-1 font-mono uppercase"
                          >
                            <Crown className="w-2.5 h-2.5" />
                            Leader
                          </Badge>
                        ) : (
                          <Badge
                            variant="subtle"
                            className="text-[9px] px-1.5 py-0 text-primary border-primary/20 bg-primary/10 font-mono uppercase"
                          >
                            Squad
                          </Badge>
                        )}

                        <span className="text-[10px] text-muted-foreground/50 font-mono">
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
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono">
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

                      <div className="text-xs text-foreground/85 mt-1 leading-relaxed break-words font-normal">
                        <MessageContent content={msg.content} />
                      </div>
                    </div>

                    {/* Hover Action Bar */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-surface-header/90 backdrop-blur-md px-1.5 py-0.5 rounded-lg border border-white/[0.08] shrink-0 ml-auto self-start">
                      <button
                        onClick={() => setReplyingTo(msg)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition"
                        title="Reply"
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
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition"
                        title="Forward"
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
                          className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Report"
                        >
                          <Flag className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Floating Jump to Latest Button */}
            {isScrolledUp && (
              <button
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setIsScrolledUp(false);
                  isNearBottomRef.current = true;
                }}
                className="absolute bottom-20 right-6 z-30 px-3 py-1.5 rounded-full bg-primary text-black font-semibold text-xs shadow-lg flex items-center gap-1.5 hover:brightness-110 transition animate-in fade-in"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Jump to latest</span>
              </button>
            )}

            {/* Input Bar */}
            <div className="p-3 border-t border-white/[0.06] bg-surface-header/50 backdrop-blur-md shrink-0">
              {replyingTo && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-primary/10 border-t border-primary/20 text-xs text-primary rounded-t-lg mb-1">
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
                <div className="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-300 animate-in fade-in">
                  <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    You are currently timed out in this server until {new Date(currentMember!.timeout_until!).toLocaleTimeString()}. You cannot send messages.
                  </span>
                </div>
              )}
              <div className="relative">
                {/* Channel Mention Autocomplete Dropdown */}
                {mentionCandidates.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 max-h-52 overflow-y-auto rounded-xl bg-[#0c0d14]/95 border border-white/[0.12] shadow-2xl backdrop-blur-md p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 flex items-center justify-between border-b border-white/[0.06] mb-1">
                      <span>Mention Server Members</span>
                      <span className="font-mono text-[9px] opacity-70">↑↓ navigate • ↵ select</span>
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
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors",
                            idx === mentionSelectedIndex
                              ? "bg-primary/20 text-white font-medium"
                              : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                          )}
                        >
                          {m.isSpecial ? (
                            <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-xs shrink-0">
                              @
                            </div>
                          ) : (
                            <Avatar src={m.avatar_url} name={m.display_name} size="sm" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground text-xs truncate">
                                {m.display_name}
                              </span>
                              <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
                                @{m.username}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleSend}
                  className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 px-3 focus-within:border-white/[0.12] focus-within:bg-white/[0.03] transition-all"
                >
                  {canUseSoundboard && (
                    <button
                      type="button"
                      onClick={() => setShowSoundboard(true)}
                      aria-label="Trigger Soundboard Meme"
                      className="text-muted-foreground hover:text-amber-400 p-1.5 rounded-md transition-colors shrink-0"
                      title="Trigger Soundboard Meme"
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
                    disabled={!canSendMessages}
                    aria-label={`Message #${channel.name}`}
                    placeholder={
                      isTimedOut
                        ? 'You are currently timed out in this server'
                        : canSendMessages
                        ? `Message #${channel.name}...`
                        : "You don't have permission to post messages here"
                    }
                    className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none max-h-28 py-1 font-normal disabled:opacity-50"
                  />

                <Button
                  type="submit"
                  size="sm"
                  aria-label="Send channel message"
                  disabled={!inputText.trim() || isSending || !canSendMessages}
                  className="h-7 w-7 p-0 rounded-md shrink-0 font-medium"
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
          </>
        )}
      </div>

      {/* Right Squad Members Panel */}
      {showMembers && (
        <aside className="w-60 border-l border-white/[0.06] bg-surface-sidebar hidden lg:flex flex-col p-3 shrink-0 overflow-y-auto select-none">
          {/* Direct Messages Quick Action */}
          <div className="mb-3 pb-2.5 border-b border-white/[0.06]">
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/')}
              className="w-full text-xs font-medium gap-2 border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] text-muted-foreground hover:text-foreground h-8"
              title="Exit server to direct messages"
            >
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span>Direct Messages</span>
            </Button>
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5">
              <Users className="w-3 h-3 text-primary/80" />
              <span>Squad ({squadList.length})</span>
            </span>
          </div>

          <div className="space-y-0.5">
            {squadList.map((m) => {
              const isMe = m.id === user?.id;

              return (
                <div
                  key={m.id}
                  onClick={() => !isMe && handleStartDirectChat(m.id, m.display_name)}
                  className={cn(
                    'flex items-center justify-between p-1.5 rounded-md transition-colors group',
                    isMe
                      ? 'bg-white/[0.02] opacity-80 cursor-default'
                      : 'hover:bg-white/[0.04] cursor-pointer'
                  )}
                  title={isMe ? 'You' : `Send private message to ${m.display_name}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Avatar
                      src={m.avatar_url || null}
                      name={m.display_name}
                      status={m.status}
                      showStatus
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1">
                        <span className="truncate">{m.display_name}</span>
                        {isMe && (
                          <span className="text-[9px] text-muted-foreground/60 font-mono">(You)</span>
                        )}
                        {(server.members || []).find((sm) => sm.user_id === m.id)?.timeout_until &&
                          new Date((server.members || []).find((sm) => sm.user_id === m.id)!.timeout_until!) > new Date() && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                              Timed Out
                            </span>
                          )}
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 font-mono truncate">
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
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 p-1 rounded-md bg-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.1] transition-all shrink-0"
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

      {/* Invite Squadmates Modal */}
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
