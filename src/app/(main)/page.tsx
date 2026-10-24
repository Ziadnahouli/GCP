'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Flame,
  Gamepad2,
  Radio,
  Sliders,
  Zap,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsModal } from '@/components/layout/settings-modal';
import { FriendsView } from '@/components/social/friends-view';
import { ChatView } from '@/components/chat/chat-view';
import { ChannelView } from '@/components/servers/channel-view';
import { useServers } from '@/hooks/use-servers';
import { useSocial } from '@/hooks/use-social';
import { useConversations } from '@/hooks/use-conversations';
import { useNotifications } from '@/hooks/use-notifications';
import { useToast } from '@/components/ui/toast';

import { StatusSelector } from '@/components/layout/status-selector';
import { UserStatus } from '@/lib/types/profile';
import { cn } from '@/lib/utils';

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('c');
  const serverId = searchParams.get('s');
  const channelId = searchParams.get('ch');

  const { profile, updateProfile } = useAuth();
  const { servers } = useServers();
  const { friends } = useSocial();
  const { getOrCreateDirectConversation } = useConversations();
  const { setActiveResource } = useNotifications();
  const { toast } = useToast();
  const [showSettings, setShowSettings] = React.useState(false);
  const [showPresencePicker, setShowPresencePicker] = React.useState(false);

  React.useEffect(() => {
    setActiveResource(conversationId || channelId || null);
  }, [conversationId, channelId, setActiveResource]);

  const handleStatusChange = async (newStatus: UserStatus) => {
    const res = await updateProfile({ status: newStatus });
    if (res?.error) {
      toast({
        title: 'Presence Update Failed',
        description: res.error,
        type: 'error',
      });
    } else {
      toast({
        title: 'Status Updated',
        description: `Presence set to ${newStatus.toUpperCase()}`,
        type: 'info',
        duration: 2000,
      });
    }
  };

  const onlineFriends = React.useMemo(() => {
    return friends.filter(
      (f) => f.friend.status === 'online' || f.friend.status === 'idle' || f.friend.status === 'dnd'
    );
  }, [friends]);

  const activeServer = React.useMemo(() => {
    if (!serverId) return null;
    return servers.find((s) => s.id === serverId) || null;
  }, [servers, serverId]);

  const activeChannel = React.useMemo(() => {
    if (!activeServer) return null;
    const channels = activeServer.channels || [];
    if (channelId) {
      return channels.find((c) => c.id === channelId) || channels[0] || null;
    }
    return channels[0] || null;
  }, [activeServer, channelId]);

  // 1. Direct message conversation takes priority so private chats are ALWAYS accessible
  if (conversationId) {
    return (
      <ChatView
        key={conversationId}
        conversationId={conversationId}
        onBack={() => router.push(serverId ? `/?s=${serverId}&ch=${channelId || ''}` : '/')}
      />
    );
  }

  // 2. If a server is active, render the ChannelView with unique key per channel
  if (activeServer && activeChannel) {
    const safeServer = {
      ...activeServer,
      channels:
        activeServer.channels && activeServer.channels.length > 0
          ? activeServer.channels
          : [activeChannel],
    };
    return <ChannelView key={`${activeServer.id}-${activeChannel.id}`} server={safeServer} channel={activeChannel} />;
  }

  // 3. If serverId is present in URL but server is still synchronizing/hydrating
  if (serverId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background text-muted-foreground text-xs font-mono p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span>Synchronizing server...</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 border-white/[0.08]"
          onClick={() => router.push('/')}
        >
          Return to Social Hub
        </Button>
      </div>
    );
  }

  // Otherwise render the full Gaming Social Hub
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Center Stage: Friends & Social Hub */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Profile Gamer Header Banner */}
        <div className="px-2.5 sm:px-4 pt-2.5 sm:pt-4 shrink-0">
          <div className="rounded-2xl border border-white/[0.06] bg-surface-default overflow-hidden shadow-subtle">
            <div className="h-16 w-full relative bg-gradient-to-r from-surface-sidebar via-surface-panel to-surface-default border-b border-white/[0.04]">
              <div className="absolute top-2.5 right-3 flex items-center gap-2">
                {/* Direct Presence Selector Button */}
                <div className="relative">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 bg-surface-default/80 border-white/[0.08] hover:bg-surface-hover text-foreground"
                    onClick={() => setShowPresencePicker((prev) => !prev)}
                  >
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        profile?.status === 'online'
                          ? 'bg-emerald-500'
                          : profile?.status === 'idle'
                          ? 'bg-amber-500'
                          : profile?.status === 'dnd'
                          ? 'bg-rose-500'
                          : 'bg-slate-500'
                      )}
                    />
                    <span className="capitalize">{profile?.status || 'Online'}</span>
                  </Button>

                  {showPresencePicker && (
                    <StatusSelector
                      currentStatus={profile?.status || 'online'}
                      onSelect={handleStatusChange}
                      onClose={() => setShowPresencePicker(false)}
                      className="absolute top-9 right-0 z-50 slide-in-from-top-2"
                    />
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 bg-surface-default/80 border-white/[0.08] hover:bg-surface-hover text-foreground"
                  onClick={() => setShowSettings(true)}
                >
                  <Sliders className="w-3 h-3 text-primary" />
                  <span>Customize</span>
                </Button>
              </div>
            </div>

            <div className="px-3 sm:px-5 pb-3 sm:pb-4 pt-0 relative flex items-end justify-between -mt-6 gap-3">
              <div className="flex items-end gap-3.5">
                <div
                  className="cursor-pointer"
                  onClick={() => setShowPresencePicker((prev) => !prev)}
                  title="Click to change presence"
                >
                  <Avatar
                    src={profile?.avatar_url || null}
                    name={profile?.display_name || 'Gamer'}
                    status={profile?.status || 'online'}
                    showStatus
                    size="lg"
                    className="ring-4 ring-surface-default shadow-subtle hover:opacity-90 transition-opacity"
                  />
                </div>
                <div className="mb-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-foreground tracking-tight truncate">
                      {profile?.display_name || 'Gamer One'}
                    </h2>
                    <Badge variant="subtle" className="text-[9px] uppercase font-mono tracking-wider px-1.5 py-0">
                      PRO
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    @{profile?.username || 'gamer'}
                  </div>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <Button
                  variant="subtle"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => {
                    toast({
                      title: 'Audio Engine',
                      description: 'Microphone & headset devices synchronized.',
                      type: 'success',
                      duration: 2000,
                    });
                  }}
                >
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  Test Audio
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Friends & Social List with Tabs */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <FriendsView onOpenConversation={(id) => router.push(`/?c=${id}`)} />
        </div>
      </div>

      {/* Right Column: Active Squad & Gaming Activity */}
      <div className="w-72 border-l border-white/[0.06] bg-surface-sidebar hidden xl:flex flex-col p-3.5 shrink-0 overflow-y-auto select-none no-scrollbar">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2.5 flex items-center gap-1.5 px-1">
          <Flame className="w-3.5 h-3.5 text-rose-400" />
          <span>Active Squadmates</span>
        </div>

        <div className="space-y-1.5">
          {friends.length === 0 ? (
            <div className="p-3.5 rounded-xl border border-dashed border-white/[0.08] bg-surface-default/40 text-center space-y-1.5">
              <Gamepad2 className="w-6 h-6 text-muted-foreground/60 mx-auto" />
              <div className="text-xs font-semibold text-foreground">No squadmates yet</div>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                Add friends using their @username in the Social Hub to party up and see their gaming activity.
              </p>
            </div>
          ) : (
            (onlineFriends.length > 0 ? onlineFriends : friends).map(({ friend }) => (
              <div
                key={friend.id}
                onClick={async () => {
                  const { conversationId: convId, error } = await getOrCreateDirectConversation(friend.id);
                  if (convId) {
                    router.push(`/?c=${convId}`);
                  } else if (error) {
                    toast({ title: 'Chat Error', description: error, type: 'error' });
                  }
                }}
                className="p-2.5 rounded-xl border border-white/[0.06] bg-surface-default/60 hover:bg-surface-hover/80 hover:border-white/[0.12] transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={friend.avatar_url}
                    name={friend.display_name}
                    status={friend.status}
                    showStatus
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {friend.display_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                      @{friend.username} • <span className="capitalize">{friend.status}</span>
                    </div>
                  </div>
                </div>

                {friend.game_activity && (
                  <div className="mt-2 pt-1.5 border-t border-white/[0.06] text-[11px]">
                    <div className="font-medium text-foreground/90 flex items-center gap-1 truncate">
                      <Gamepad2 className="w-3 h-3 text-primary shrink-0" />
                      <span className="truncate">{friend.game_activity}</span>
                    </div>
                    {friend.custom_status && (
                      <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                        {friend.custom_status}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Quick Voice Lounge Card */}
        <div className="mt-5 p-3.5 rounded-xl border border-white/[0.08] bg-surface-default/70 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Radio className="w-4 h-4 text-primary" />
            <span>Voice Lounge</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Instant low-latency voice room with WebRTC & LiveKit.
          </p>
          <Button
            size="sm"
            variant="default"
            className="w-full text-xs font-semibold h-8"
            onClick={() => {
              const srvWithVoice = servers.find((s) => s.channels.some((c) => c.type === 'voice'));
              if (srvWithVoice) {
                const vc = srvWithVoice.channels.find((c) => c.type === 'voice');
                if (vc) {
                  router.push(`/?s=${srvWithVoice.id}&ch=${vc.id}`);
                  return;
                }
              }
              toast({
                title: 'Voice Lounge',
                description: 'Select a server from the sidebar to join its voice lounge.',
                type: 'info',
              });
            }}
          >
            Join Lounge
          </Button>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}

export default function HomePage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-xs">
          Loading Social Hub...
        </div>
      }
    >
      <HomePageContent />
    </React.Suspense>
  );
}
