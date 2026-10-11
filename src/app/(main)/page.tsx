'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Flame,
  Gamepad2,
  Radio,
  Sliders,
  Zap,
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
import { useToast } from '@/components/ui/toast';

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('c');
  const serverId = searchParams.get('s');
  const channelId = searchParams.get('ch');

  const { profile } = useAuth();
  const { servers } = useServers();
  const { friends } = useSocial();
  const { toast } = useToast();
  const [showSettings, setShowSettings] = React.useState(false);

  const onlineFriends = React.useMemo(() => {
    return friends.filter((f) => f.friend.status === 'online' || f.friend.status === 'idle');
  }, [friends]);

  const activeServer = React.useMemo(() => {
    if (!serverId) return null;
    return servers.find((s) => s.id === serverId) || null;
  }, [servers, serverId]);

  const activeChannel = React.useMemo(() => {
    if (!activeServer) return null;
    if (channelId) {
      return activeServer.channels.find((c) => c.id === channelId) || activeServer.channels[0] || null;
    }
    return activeServer.channels[0] || null;
  }, [activeServer, channelId]);

  // If a server is active, render the ChannelView
  if (activeServer && activeChannel) {
    return <ChannelView server={activeServer} channel={activeChannel} />;
  }

  // If a direct message conversation is active, render the real-time ChatView
  if (conversationId) {
    return (
      <ChatView
        conversationId={conversationId}
        onBack={() => router.push('/')}
      />
    );
  }

  // Otherwise render the full Gaming Social Hub
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Center Stage: Friends & Social Hub */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Profile Gamer Header Banner */}
        <div className="px-2.5 sm:px-4 pt-2.5 sm:pt-4 shrink-0">
          <div className="rounded-2xl border border-border/80 bg-surface-default overflow-hidden shadow-md">
            <div
              className="h-20 w-full transition-colors relative"
              style={{
                backgroundColor: profile?.banner_color || '#7c3aed',
                backgroundImage:
                  'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 60%)',
              }}
            >
              <div className="absolute top-2.5 right-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 bg-card/70 backdrop-blur-md border-border/60"
                  onClick={() => setShowSettings(true)}
                >
                  <Sliders className="w-3 h-3 text-primary" />
                  <span>Customize</span>
                </Button>
              </div>
            </div>

            <div className="px-3 sm:px-5 pb-3 sm:pb-4 pt-0 relative flex items-end justify-between -mt-8 gap-3">
              <div className="flex items-end gap-3.5">
                <Avatar
                  src={profile?.avatar_url || null}
                  name={profile?.display_name || 'Gamer'}
                  status={profile?.status || 'online'}
                  showStatus
                  size="lg"
                  className="ring-4 ring-card shadow-lg"
                />
                <div className="mb-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-foreground tracking-tight truncate">
                      {profile?.display_name || 'Gamer One'}
                    </h2>
                    <Badge variant="default" className="text-[9px] uppercase font-mono tracking-wider px-1.5 py-0">
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
                  className="h-8 text-xs gap-1.5"
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
      <div className="w-72 border-l border-border bg-surface-sidebar hidden xl:flex flex-col p-4 shrink-0 overflow-y-auto select-none">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-rose-500" />
          <span>Active Squadmates</span>
        </div>

        <div className="space-y-2.5">
          {onlineFriends.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-border/80 bg-surface-default/40 text-center space-y-2">
              <Gamepad2 className="w-7 h-7 text-muted-foreground/60 mx-auto" />
              <div className="text-xs font-semibold text-foreground">No squadmates online</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Add friends using their @username in the Social Hub to party up and see their gaming activity.
              </p>
            </div>
          ) : (
            onlineFriends.map(({ friend }) => (
              <div
                key={friend.id}
                onClick={() => router.push(`/?friend=${friend.id}`)}
                className="p-3 rounded-xl border border-border/60 bg-surface-default hover:bg-surface-hover/80 transition-all cursor-pointer group"
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
                    <div className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                      {friend.display_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      @{friend.username}
                    </div>
                  </div>
                </div>

                {friend.game_activity && (
                  <div className="mt-2.5 pt-2 border-t border-border/40 text-[11px]">
                    <div className="font-semibold text-foreground/90 flex items-center gap-1 truncate">
                      <Gamepad2 className="w-3 h-3 text-primary shrink-0" />
                      <span className="truncate">{friend.game_activity}</span>
                    </div>
                    {friend.custom_status && (
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {friend.custom_status}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Quick Voice Lounge Card (Phase 5 Prep) */}
        <div className="mt-6 p-4 rounded-xl border border-primary/30 bg-primary/10 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Radio className="w-4 h-4 text-primary" />
            <span>Voice Lounge</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Instant low-latency voice room with WebRTC & LiveKit.
          </p>
          <Button
            size="sm"
            variant="default"
            className="w-full text-xs font-semibold"
            onClick={() => {
              toast({
                title: 'Voice Lounge',
                description: 'Full voice room signaling will connect in Phase 5.',
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
