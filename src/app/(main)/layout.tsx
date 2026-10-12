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
import { SettingsModal } from '@/components/layout/settings-modal';
import { CallProvider, useCallContext } from '@/features/calls/call-context';
import { IncomingCallModal } from '@/components/calls/incoming-call-modal';
import { CallModal } from '@/components/calls/call-modal';
import { PermissionsModal } from '@/components/layout/permissions-modal';
import { LogsWindow } from '@/components/diagnostics/logs-window';
import { useAuth } from '@/features/auth/auth-provider';
import { useServers } from '@/hooks/use-servers';
import { Gamepad2, MessageSquare, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Channel } from '@/lib/types/server';
import { cn } from '@/lib/utils';

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, profile, isLoading } = useAuth();
  const call = useCallContext();
  const [collapsed, setCollapsed] = React.useState(false);
  const [showCreateServer, setShowCreateServer] = React.useState(false);
  const [showServerSettings, setShowServerSettings] = React.useState(false);
  const [showUserSettings, setShowUserSettings] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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
      {/* 1. Desktop Docked Sidebars (Rail + Sub-Sidebar) - Hidden on Mobile */}
      <div className="hidden md:flex flex-row shrink-0 h-full">
        <ServerRail
          servers={servers}
          activeServerId={selectedServerId}
          onSelectServer={handleSelectServer}
          onOpenCreateServer={() => setShowCreateServer(true)}
        />

        <div className="flex flex-col shrink-0 h-full">
          <div className="flex-1 overflow-hidden">
            {activeServer && !selectedConversationId ? (
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

          <UserBar />
        </div>
      </div>

      {/* 2. Mobile Off-Canvas Drawer (Slide-out menu for Phones) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative flex h-full max-w-[92vw] shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <ServerRail
              servers={servers}
              activeServerId={selectedServerId}
              onSelectServer={(srvId) => {
                handleSelectServer(srvId);
                setMobileMenuOpen(false);
              }}
              onOpenCreateServer={() => {
                setShowCreateServer(true);
                setMobileMenuOpen(false);
              }}
            />

            <div className="flex flex-col w-[calc(92vw-72px)] sm:w-64 max-w-[280px] h-full bg-surface-sidebar border-r border-white/[0.06]">
              <div className="flex-1 overflow-hidden">
                {activeServer && !selectedConversationId ? (
                  <ServerSidebar
                    server={activeServer}
                    activeChannelId={selectedChannelId || activeServer.channels[0]?.id || null}
                    onSelectChannel={(ch) => {
                      handleSelectChannel(ch);
                      setMobileMenuOpen(false);
                    }}
                    onOpenServerSettings={() => {
                      setShowServerSettings(true);
                      setMobileMenuOpen(false);
                    }}
                    onCreateChannel={async (name, type, topic) => {
                      await createChannel(activeServer.id, name, type, topic);
                    }}
                    onDeleteChannel={async (chanId) => {
                      await deleteChannel(activeServer.id, chanId);
                    }}
                  />
                ) : (
                  <Sidebar
                    collapsed={false}
                    selectedConversationId={selectedConversationId}
                    onSelectConversation={(id) => {
                      handleSelectConversation(id);
                      setMobileMenuOpen(false);
                    }}
                  />
                )}
              </div>

              <UserBar />
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Content Stage */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
        <NavHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto min-h-0 bg-background">{children}</main>

        {/* 4. Mobile Bottom Tab Bar (Phone Friendly) */}
        <nav className="md:hidden h-14 bg-surface-sidebar border-t border-white/[0.06] flex items-center justify-around px-2 shrink-0 z-20 select-none">
          <button
            onClick={() => router.push('/')}
            className={cn(
              'flex flex-col items-center justify-center p-1.5 rounded-lg text-xs font-medium transition-colors',
              !selectedServerId && !selectedConversationId
                ? 'text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Friends & Activity"
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Friends</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center p-1.5 rounded-lg text-xs font-medium transition-colors',
              mobileMenuOpen || selectedServerId
                ? 'text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Servers"
          >
            <Gamepad2 className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Servers</span>
          </button>

          <button
            onClick={() => {
              if (selectedServerId) {
                router.push('/');
              }
              setMobileMenuOpen(true);
            }}
            className={cn(
              'flex flex-col items-center justify-center p-1.5 rounded-lg text-xs font-medium transition-colors',
              selectedConversationId
                ? 'text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Direct Messages"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Messages</span>
          </button>

          <button
            onClick={() => setShowUserSettings(true)}
            className="flex flex-col items-center justify-center p-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            title="User Profile & Settings"
          >
            <Avatar
              src={profile?.avatar_url || null}
              name={profile?.display_name || 'Gamer'}
              status={profile?.status || 'online'}
              showStatus
              size="xs"
            />
            <span className="text-[10px] mt-0.5">You</span>
          </button>
        </nav>
      </div>

      {/* Create Server Modal */}
      <CreateServerModal
        open={showCreateServer}
        onOpenChange={setShowCreateServer}
        onCreateServer={handleCreateServerSubmit}
      />

      {/* User Settings Modal for Mobile & Global */}
      <SettingsModal open={showUserSettings} onOpenChange={setShowUserSettings} />

      {/* Global Browser & Hardware Permissions Onboarding Modal */}
      <PermissionsModal />

      {/* Global Incoming Call Ringing Modal */}
      <IncomingCallModal />

      {/* Global Active WebRTC Voice/Video Call Modal */}
      <CallModal
        open={call.callStatus === 'in_call' || call.callStatus === 'outgoing_ringing'}
        callStatus={call.callStatus}
        isVideo={call.isVideoCall}
        isMicMuted={call.isMicMuted}
        isCameraOn={call.isCameraOn}
        isScreenSharing={call.isScreenSharing}
        isNoiseSuppressionEnabled={call.isNoiseSuppressionEnabled}
        participants={call.participants}
        stats={call.stats}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        screenStream={call.screenStream}
        onEndCall={call.endCall}
        onToggleMic={call.toggleMic}
        onToggleCamera={call.toggleCamera}
        onToggleScreenShare={call.toggleScreenShare}
        onToggleNoiseSuppression={call.toggleNoiseSuppression}
        onRestartConnection={call.restartConnection}
      />

      {/* Global Diagnostics & Live Telemetry Logs Console */}
      <LogsWindow />
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
      <CallProvider>
        <MainLayoutContent>{children}</MainLayoutContent>
      </CallProvider>
    </React.Suspense>
  );
}
