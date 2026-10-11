'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { UserBar } from '@/components/layout/user-bar';
import { NavHeader } from '@/components/layout/nav-header';
import { ServerRail } from '@/components/servers/server-rail';
import { ServerSidebar } from '@/components/servers/server-sidebar';
import { CreateServerModal } from '@/components/servers/create-server-modal';
import { ServerSettingsModal } from '@/components/servers/server-settings-modal';
import { useAuth } from '@/features/auth/auth-provider';
import { useServers } from '@/hooks/use-servers';
import { Gamepad2 } from 'lucide-react';
import { Channel } from '@/lib/types/server';

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [collapsed, setCollapsed] = React.useState(false);
  const [showCreateServer, setShowCreateServer] = React.useState(false);
  const [showServerSettings, setShowServerSettings] = React.useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const selectedConversationId = searchParams.get('c');
  const selectedServerId = searchParams.get('s');
  const selectedChannelId = searchParams.get('ch');

  const {
    servers,
    createServer,
    createChannel,
    deleteChannel,
    deleteServer,
  } = useServers();

  const activeServer = React.useMemo(() => {
    if (!selectedServerId) return null;
    return servers.find((s) => s.id === selectedServerId) || null;
  }, [servers, selectedServerId]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary animate-pulse shadow-glow-sm">
          <Gamepad2 className="w-6 h-6" />
        </div>
        <div className="text-xs font-mono text-muted-foreground">Authenticating Nexus Session...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleSelectServer = (serverId: string | null) => {
    if (serverId) {
      const targetServer = servers.find((s) => s.id === serverId);
      const firstChannel = targetServer?.channels[0]?.id;
      if (firstChannel) {
        router.push(`/?s=${serverId}&ch=${firstChannel}`);
      } else {
        router.push(`/?s=${serverId}`);
      }
    } else {
      router.push('/');
    }
  };

  const handleSelectChannel = (channel: Channel) => {
    if (selectedServerId) {
      router.push(`/?s=${selectedServerId}&ch=${channel.id}`);
    }
  };

  const handleSelectConversation = (id: string | null) => {
    if (id) {
      router.push(`/?c=${id}`);
    } else {
      router.push('/');
    }
  };

  const handleCreateServerSubmit = async (name: string, description?: string) => {
    const created = await createServer(name, description);
    if (created) {
      router.push(`/?s=${created.id}&ch=${created.channels[0]?.id}`);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 1. Leftmost Discord-style Server Rail (Icons & Guild switcher) */}
      <ServerRail
        servers={servers}
        activeServerId={selectedServerId}
        onSelectServer={handleSelectServer}
        onOpenCreateServer={() => setShowCreateServer(true)}
      />

      {/* 2. Sub-Sidebar Column (DMs when at Home, or Channels when in a Server) */}
      <div className="flex flex-col shrink-0 h-full">
        <div className="flex-1 overflow-hidden">
          {activeServer ? (
            <ServerSidebar
              server={activeServer}
              activeChannelId={selectedChannelId || activeServer.channels[0]?.id || null}
              onSelectChannel={handleSelectChannel}
              onOpenServerSettings={() => setShowServerSettings(true)}
              onCreateChannel={async (name, type, topic) => {
                await createChannel(activeServer.id, name, type, topic);
              }}
              onDeleteChannel={async (chanId) => {
                await deleteChannel(activeServer.id, chanId);
              }}
            />
          ) : (
            <Sidebar
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed((prev) => !prev)}
              selectedConversationId={selectedConversationId}
              onSelectConversation={handleSelectConversation}
            />
          )}
        </div>

        {/* Persistent Bottom User Control Bar (Mic, Deafen, Soundboard, Profile status) */}
        <UserBar />
      </div>

      {/* 3. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
        <NavHeader />
        <main className="flex-1 overflow-y-auto min-h-0 bg-background">{children}</main>
      </div>

      {/* Create Server Modal */}
      <CreateServerModal
        open={showCreateServer}
        onOpenChange={setShowCreateServer}
        onCreateServer={handleCreateServerSubmit}
      />

      {/* Server Settings Modal */}
      {activeServer && (
        <ServerSettingsModal
          open={showServerSettings}
          onOpenChange={setShowServerSettings}
          server={activeServer}
          onDeleteServer={async (srvId) => {
            await deleteServer(srvId);
            router.push('/');
          }}
          onDeleteChannel={async (chanId) => {
            await deleteChannel(activeServer.id, chanId);
          }}
        />
      )}
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
          Loading Nexus Platform...
        </div>
      }
    >
      <MainLayoutContent>{children}</MainLayoutContent>
    </React.Suspense>
  );
}
