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
          className="text-xs h-7 border-border"
          onClick={() => router.push('/')}
        >
          Return to Social Hub
        </Button>
      </div>
    );
  }

  // Otherwise render the Clean Pro Friends & Social Hub
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Center Stage: Friends View */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <FriendsView onOpenConversation={(id) => router.push(`/?c=${id}`)} />
      </div>

      {/* Right Column: Active Now / Recent Activity (Desktop >= 1280px) */}
      <aside className="w-72 border-l border-border bg-surface-sidebar hidden xl:flex flex-col p-4 shrink-0 overflow-y-auto select-none no-scrollbar">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
          Active now
        </div>

        <div className="space-y-1.5">
          {friends.length === 0 ? (
            <div className="p-4 rounded-card border border-border bg-card/50 text-center space-y-1.5">
              <div className="text-xs font-semibold text-foreground">It&apos;s quiet for now</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When friends are playing games or active in voice, you will see their activity here.
              </p>
            </div>
          ) : onlineFriends.length === 0 ? (
            <div className="p-4 rounded-card border border-border bg-card/50 text-center space-y-1">
              <div className="text-xs font-medium text-foreground">No friends active</div>
              <p className="text-xs text-muted-foreground">
                None of your friends are currently online.
              </p>
            </div>
          ) : (
            onlineFriends.map(({ friend }) => (
              <div
                key={friend.id}
                onClick={async () => {
                  const { conversationId: convId, error } = await getOrCreateDirectConversation(friend.id);
                  if (convId) {
                    router.push(`/?c=${convId}`);
                  } else if (error) {
                    toast({ title: 'Error', description: error, type: 'error' });
                  }
                }}
                className="p-2.5 rounded-card border border-border bg-card hover:bg-surface-hover hover:border-border-strong transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={friend.avatar_url}
                    name={friend.display_name}
                    status={friend.status}
                    showStatus
                    size="32"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {friend.display_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      @{friend.username}
                    </div>
                  </div>
                </div>

                {friend.game_activity && (
                  <div className="mt-2 pt-2 border-t border-border text-xs">
                    <div className="font-medium text-primary flex items-center gap-1.5 truncate">
                      <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{friend.game_activity}</span>
                    </div>
                    {friend.custom_status && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {friend.custom_status}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

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
