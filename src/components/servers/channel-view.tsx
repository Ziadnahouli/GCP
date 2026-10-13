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
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Server, Channel } from '@/lib/types/server';
import { useChannelMessages } from '@/hooks/use-channel-messages';
import { useAuth } from '@/features/auth/auth-provider';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { useCallContext } from '@/features/calls/call-context';
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
  const { user, profile } = useAuth();
  const call = useCallContext();
  const { friends } = useSocial();
  const { getOrCreateDirectConversation } = useConversations();
  const { messages, sendMessage, retryMessage } = useChannelMessages(channel.id);
  const { toast } = useToast();

  const [inputText, setInputText] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [showMembers, setShowMembers] = React.useState(true);
  const [showVoiceChat, setShowVoiceChat] = React.useState(true);
  const [showSoundboard, setShowSoundboard] = React.useState(false);
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [communityProfiles, setCommunityProfiles] = React.useState<UserProfile[]>([]);
  const [isVoiceConnected, setIsVoiceConnected] = React.useState(true);
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
            status: (m.profile?.status as any) || 'offline',
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
          status: (f.friend.status as any) || 'offline',
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
          status: (cp.status as any) || 'offline',
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
                className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>WebRTC Opus 48kHz HD</span>
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
            <button
              type="button"
              onClick={() => setShowSoundboard(true)}
              aria-label="Soundboard"
              className="p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
              title="Soundboard"
            >
              <Sparkles className="w-4 h-4" />
            </button>

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
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Live Audio Stage
                    </span>
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

              {/* Connected Participants Grid */}
              <div className="my-auto py-8">
                {isVoiceConnected ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    {/* 1. Local Gamer Card */}
                    <div className="relative group rounded-2xl border border-emerald-500/30 bg-surface-panel/80 backdrop-blur-md p-5 flex flex-col items-center justify-center text-center shadow-panel transition-all hover:border-emerald-500/50">
                      <div className="relative mb-3">
                        <Avatar
                          src={profile?.avatar_url || null}
                          name={profile?.display_name || 'You'}
                          size="lg"
                          className={cn(
                            'transition-all duration-300',
                            !call.isMicMuted && 'ring-4 ring-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-pulse'
                          )}
                        />
                        {call.isMicMuted ? (
                          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-500 text-white shadow-subtle">
                            <MicOff className="w-3 h-3" />
                          </div>
                        ) : (
                          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-subtle">
                            <Mic className="w-3 h-3" />
                          </div>
                        )}
                      </div>

                      <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <span>{profile?.display_name || 'You'}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">(You)</span>
                      </div>
                      <div className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                        @{profile?.username || 'gamer'}
                      </div>

                      {/* Equalizer animation when unmuted */}
                      <div className="flex items-center gap-1 mt-3 h-3">
                        {!call.isMicMuted ? (
                          <>
                            <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1 h-3.5 bg-emerald-400 rounded-full animate-bounce" />
                            <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.2s]" />
                            <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.1s]" />
                          </>
                        ) : (
                          <span className="text-[10px] text-rose-400 font-mono">Microphone Muted</span>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-1.5">
                        <Badge variant="subtle" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                          Squad Leader
                        </Badge>
                        {call.isNoiseSuppressionEnabled && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                            DeepFilter AI
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* 2. Squad Members Cards */}
                    {squadList.slice(0, 2).map((mem) => {
                      if (mem.id === user?.id) return null;
                      return (
                        <div
                          key={mem.id}
                          className="relative group rounded-2xl border border-white/[0.08] bg-surface-default/60 backdrop-blur-md p-5 flex flex-col items-center justify-center text-center shadow-panel transition-all hover:border-white/[0.16]"
                        >
                          <div className="relative mb-3">
                            <Avatar
                              src={mem.avatar_url || null}
                              name={mem.display_name}
                              size="lg"
                              status={mem.status}
                              showStatus
                            />
                            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-subtle">
                              <Mic className="w-3 h-3" />
                            </div>
                          </div>

                          <div className="text-sm font-bold text-foreground">
                            {mem.display_name}
                          </div>
                          <div className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                            @{mem.username}
                          </div>

                          <div className="flex items-center gap-1 mt-3 h-3">
                            <span className="w-1 h-2 bg-emerald-400/60 rounded-full" />
                            <span className="w-1 h-1.5 bg-emerald-400/60 rounded-full" />
                            <span className="w-1 h-2.5 bg-emerald-400/60 rounded-full" />
                            <span className="w-1 h-1.5 bg-emerald-400/60 rounded-full" />
                          </div>

                          <div className="mt-3">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/[0.08] text-muted-foreground capitalize">
                              {mem.role}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}

                    {/* 3. Empty Invite Slot */}
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
                ) : (
                  <div className="text-center py-12 max-w-sm mx-auto space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-glow-sm">
                      <Volume2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">You are disconnected</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Connect to {channel.name} to talk with teammates using encrypted WebRTC voice.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setIsVoiceConnected(true);
                        toast({ title: 'Connected to Voice', description: channel.name, type: 'success' });
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-subtle px-6"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Join Voice Lounge</span>
                    </Button>
                  </div>
                )}
              </div>

              {/* Bottom Voice Control Dock */}
              {isVoiceConnected && (
                <div className="mt-auto pt-4 border-t border-white/[0.06] flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
                  {/* Mic Toggle */}
                  <button
                    type="button"
                    onClick={call.toggleMic}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      call.isMicMuted
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    )}
                    title={call.isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  >
                    {call.isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    <span className="text-xs font-semibold hidden sm:inline">
                      {call.isMicMuted ? 'Muted' : 'Mute'}
                    </span>
                  </button>

                  {/* Deafen Toggle */}
                  <button
                    type="button"
                    onClick={call.toggleDeafen}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      call.isDeafened
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                    )}
                    title={call.isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
                  >
                    {call.isDeafened ? <VolumeX className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
                    <span className="text-xs font-semibold hidden sm:inline">
                      {call.isDeafened ? 'Deafened' : 'Deafen'}
                    </span>
                  </button>

                  {/* Camera Toggle */}
                  <button
                    type="button"
                    onClick={() => call.toggleCamera()}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      call.isCameraOn
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                    )}
                    title="Toggle Video Camera"
                  >
                    {call.isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    <span className="text-xs font-semibold hidden sm:inline">Camera</span>
                  </button>

                  {/* Screen Share Toggle */}
                  <button
                    type="button"
                    onClick={() => call.toggleScreenShare()}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      call.isScreenSharing
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                    )}
                    title="Share Screen or Gameplay"
                  >
                    {call.isScreenSharing ? <MonitorUp className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    <span className="text-xs font-semibold hidden sm:inline">Share</span>
                  </button>

                  {/* AI Noise Suppression Toggle */}
                  <button
                    type="button"
                    onClick={call.toggleNoiseSuppression}
                    className={cn(
                      'p-3 rounded-2xl flex items-center gap-2 transition-all shadow-subtle',
                      call.isNoiseSuppressionEnabled
                        ? 'bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30'
                        : 'bg-white/[0.04] text-muted-foreground border border-white/[0.08] hover:bg-white/[0.08] hover:text-foreground'
                    )}
                    title="AI DeepFilter Noise Suppression"
                  >
                    <Sparkles className="w-5 h-5" />
                    <span className="text-xs font-semibold hidden sm:inline">DeepFilter</span>
                  </button>

                  {/* Soundboard Trigger */}
                  <button
                    type="button"
                    onClick={() => setShowSoundboard(true)}
                    className="p-3 rounded-2xl bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-2 transition-all shadow-subtle"
                    title="Soundboard Clips"
                  >
                    <Radio className="w-5 h-5" />
                    <span className="text-xs font-semibold hidden sm:inline">Sounds</span>
                  </button>

                  {/* Disconnect Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsVoiceConnected(false);
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
                    placeholder="Chat in voice lounge..."
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                  />
                  <Button type="submit" size="sm" disabled={!inputText.trim() || isSending} className="h-8 px-2.5">
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </form>
              </div>
            )}
          </div>
        ) : (
          /* Classic Text Channel Chat Feed */
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
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

                      <p className="text-xs text-foreground/85 mt-1 leading-relaxed break-words font-normal">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-white/[0.06] bg-surface-header/50 backdrop-blur-md shrink-0">
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 px-3 focus-within:border-white/[0.12] focus-within:bg-white/[0.03] transition-all"
              >
                <button
                  type="button"
                  onClick={() => setShowSoundboard(true)}
                  aria-label="Trigger Soundboard Meme"
                  className="text-muted-foreground hover:text-amber-400 p-1.5 rounded-md transition-colors shrink-0"
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
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none max-h-28 py-1 font-normal"
                />

                <Button
                  type="submit"
                  size="sm"
                  aria-label="Send channel message"
                  disabled={!inputText.trim() || isSending}
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
                      <MessageSquare className="w-3 h-3" />
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
    </div>
  );
}
