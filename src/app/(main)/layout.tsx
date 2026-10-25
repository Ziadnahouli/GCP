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
import { CallProvider, useCallState, useCallActions, useCallStats } from '@/features/calls/call-context';
import { PresenceProvider } from '@/features/presence/presence-context';
import { ServerVoiceProvider, useServerVoiceContext } from '@/features/servers/server-voice-context';
import { VoiceConnectedBar } from '@/components/servers/voice-connected-bar';
import { IncomingCallModal } from '@/components/calls/incoming-call-modal';
import { CallModal } from '@/components/calls/call-modal';
import { PermissionsModal } from '@/components/layout/permissions-modal';
import { LogsWindow } from '@/components/diagnostics/logs-window';
import { VoiceLoungePopup } from '@/components/servers/voice-lounge-popup';
import { MixerAdapterBridge } from '@/components/audio/mixer-adapter-bridge';
import { OfflineBanner } from '@/components/network/offline-banner';
import { ComponentErrorBoundary } from '@/components/ui/error-boundary';
import { useAuth } from '@/features/auth/auth-provider';
import { useServers, ServersProvider } from '@/hooks/use-servers';
import { useToast } from '@/components/ui/toast';
import { ConversationsProvider } from '@/hooks/use-conversations';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { Gamepad2, MessageSquare, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Channel } from '@/lib/types/server';
import { cn } from '@/lib/utils';

function ConnectedCallModal() {
  const callState = useCallState();
  const callActions = useCallActions();
  const { stats } = useCallStats();

  return (
    <CallModal
      open={callState.callStatus === 'in_call' || callState.callStatus === 'outgoing_ringing'}
      callStatus={callState.callStatus}
      isVideo={callState.isVideoCall}
      isMicMuted={callState.isMicMuted}
      isDeafened={callState.isDeafened}
      isCameraOn={callState.isCameraOn}
      isScreenSharing={callState.isScreenSharing}
      isNoiseSuppressionEnabled={callState.isNoiseSuppressionEnabled}
      isLiveKitActive={callState.isLiveKitActive}
      participants={callState.participants}
      stats={stats}
      localStream={callState.localStream}
      remoteStream={callState.remoteStream}
      screenStream={callState.screenStream}
      onEndCall={callActions.endCall}
      onToggleMic={callActions.toggleMic}
      onToggleDeafen={callActions.toggleDeafen}
      onToggleCamera={callActions.toggleCamera}
      onToggleScreenShare={callActions.toggleScreenShare}
      onToggleNoiseSuppression={callActions.toggleNoiseSuppression}
      onRestartConnection={callActions.restartConnection}
    />
  );
}

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, profile, isLoading } = useAuth();
  useGlobalShortcuts();
  const serverVoice = useServerVoiceContext();
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
    updateServer,
    deleteServer,
    createChannel,
    updateChannel,
    deleteChannel,
    joinServer,
    leaveServer,
    transferOwnership,
    updateMemberRole,
    kickMember,
    createRole,
    updateRole,
    deleteRole,
    updateRolePermissions,
  } = useServers();
  const { toast } = useToast();

  const activeServer = React.useMemo(() => {
    if (!selectedServerId) return null;
    return servers.find((s) => s.id === selectedServerId) || null;
  }, [servers, selectedServerId]);

  // Support 1-click joining via invite links like /?join=UUID
  const joinParam = searchParams.get('join');
  const processedJoinRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (joinParam && user && processedJoinRef.current !== joinParam) {
      processedJoinRef.current = joinParam;
      joinServer(joinParam).then((res) => {
        if (res.success && res.server) {
          router.replace(`/?s=${res.server.id}&ch=${res.server.channels[0]?.id || ''}`);
        }
      });
    }
  }, [joinParam, user, joinServer, router]);

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
      const firstChannel = targetServer?.channels?.[0]?.id || '';
      router.push(firstChannel ? `/?s=${serverId}&ch=${firstChannel}` : `/?s=${serverId}`);
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

  const handleCreateServerSubmit = async (
    name: string,
    description?: string,
    iconUrl?: string,
    template?: 'competitive' | 'hangout' | 'custom'
  ) => {
    const created = await createServer(name, description, iconUrl, template);
    if (created) {
      router.push(`/?s=${created.id}&ch=${created.channels[0]?.id || ''}`);
    }
  };

  const handleJoinServerSubmit = async (serverIdOrInvite: string) => {
    const res = await joinServer(serverIdOrInvite);
    if (res.success && res.server) {
      router.push(`/?s=${res.server.id}&ch=${res.server.channels[0]?.id || ''}`);
    }
    return res;
  };

  const handleDeleteServer = async (srvId: string) => {
    await deleteServer(srvId);
    setShowServerSettings(false);
    router.push('/');
  };

  const handleLeaveServer = async (srvId: string) => {
    const srv = servers.find((s) => s.id === srvId);
    if (srv && srv.owner_id === user?.id) {
      toast({
        title: 'Cannot Leave Server',
        description: 'Server owners must transfer ownership to another member or delete the server before leaving.',
        type: 'error',
      });
      return;
    }
    const success = await leaveServer(srvId);
    if (!success) {
      toast({
        title: 'Failed to Leave Server',
        description: 'An unexpected error occurred while attempting to leave the server.',
        type: 'error',
      });
      return;
    }
    setShowServerSettings(false);
    router.push('/');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <OfflineBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Mobile Drawer Backdrop Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Unified Responsive Navigation Sidebar (Docked on Desktop, Slide-out Drawer on Mobile) */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex flex-row shrink-0 h-full transition-transform duration-200 ease-in-out md:static md:z-auto md:translate-x-0',
            mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
          )}
        >
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

          <div className="flex flex-col w-[calc(92vw-72px)] sm:w-64 max-w-[280px] md:w-60 md:max-w-none shrink-0 h-full bg-surface-sidebar border-r border-white/[0.06]">
            <div className="flex-1 overflow-hidden">
              <ComponentErrorBoundary sectionName="Sidebar Navigation">
                {activeServer && !selectedConversationId ? (
                  <ServerSidebar
                    server={activeServer}
                    activeChannelId={selectedChannelId || activeServer.channels[0]?.id || null}
                    onSelectChannel={(ch) => {
                      handleSelectChannel(ch);
                      setMobileMenuOpen(false);
                    }}
                    onConnectVoiceChannel={(channel) => {
                      serverVoice.joinVoiceChannel(activeServer.id, channel.id, activeServer.name, channel.name);
                    }}
                    onOpenServerSettings={() => {
                      setShowServerSettings(true);
                      setMobileMenuOpen(false);
                    }}
                    onCreateChannel={async (name, type, topic) => {
                      await createChannel(activeServer.id, name, type, topic);
                    }}
                    onUpdateChannel={async (chanId, updates) => {
                      await updateChannel(activeServer.id, chanId, updates);
                    }}
                    onDeleteChannel={async (chanId) => {
                      await deleteChannel(activeServer.id, chanId);
                    }}
                    onLeaveServer={handleLeaveServer}
                  />
                ) : (
                  <Sidebar
                    collapsed={collapsed}
                    onToggleCollapse={() => setCollapsed((prev) => !prev)}
                    selectedConversationId={selectedConversationId}
                    onSelectConversation={(id) => {
                      handleSelectConversation(id);
                      setMobileMenuOpen(false);
                    }}
                  />
                )}
              </ComponentErrorBoundary>
            </div>

            {serverVoice.isVoiceConnected && serverVoice.activeChannelName && (
              <VoiceConnectedBar
                channelName={serverVoice.activeChannelName}
                serverName={serverVoice.activeServerName || undefined}
                isMuted={serverVoice.isMicMuted}
                isDeafened={serverVoice.isDeafened}
                onDisconnect={serverVoice.disconnectVoice}
                onToggleMic={serverVoice.toggleMic}
                onToggleDeafen={serverVoice.toggleDeafen}
                onClick={() => {
                  if (serverVoice.activeServerId && serverVoice.activeChannelId) {
                    router.push(`/?s=${serverVoice.activeServerId}&ch=${serverVoice.activeChannelId}`);
                    setMobileMenuOpen(false);
                  }
                }}
              />
            )}

            <UserBar />
          </div>
        </div>

        {/* Main Content Stage */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
          <NavHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto min-h-0 bg-background">
            <ComponentErrorBoundary sectionName="Main Chat & Content Area">
              {children}
            </ComponentErrorBoundary>
          </main>

          {/* Mobile Persistent Voice Connected Indicator Bar (only when drawer is closed to prevent duplicate instances) */}
          {!mobileMenuOpen && serverVoice.isVoiceConnected && serverVoice.activeChannelName && (
            <div className="md:hidden shrink-0">
              <VoiceConnectedBar
                channelName={serverVoice.activeChannelName}
                serverName={serverVoice.activeServerName || undefined}
                isMuted={serverVoice.isMicMuted}
                isDeafened={serverVoice.isDeafened}
                onDisconnect={serverVoice.disconnectVoice}
                onToggleMic={serverVoice.toggleMic}
                onToggleDeafen={serverVoice.toggleDeafen}
                onClick={() => {
                  if (serverVoice.activeServerId && serverVoice.activeChannelId) {
                    router.push(`/?s=${serverVoice.activeServerId}&ch=${serverVoice.activeChannelId}`);
                  }
                }}
              />
            </div>
          )}

          {/* Mobile Bottom Tab Bar (Phone Friendly) */}
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
          onJoinServer={handleJoinServerSubmit}
        />

        {/* Server Settings Modal */}
        {activeServer && (
          <ServerSettingsModal
            open={showServerSettings}
            onOpenChange={setShowServerSettings}
            server={activeServer}
            onUpdateServer={updateServer}
            onDeleteServer={handleDeleteServer}
            onCreateChannel={createChannel}
            onUpdateChannel={updateChannel}
            onDeleteChannel={deleteChannel}
            onUpdateMemberRole={updateMemberRole}
            onKickMember={kickMember}
            onLeaveServer={handleLeaveServer}
            onTransferOwnership={transferOwnership}
            onCreateRole={createRole}
            onUpdateRole={updateRole}
            onDeleteRole={deleteRole}
            onUpdateRolePermissions={updateRolePermissions}
          />
        )}

        {/* User Settings Modal for Mobile & Global */}
        <SettingsModal open={showUserSettings} onOpenChange={setShowUserSettings} />

        {/* Global Browser & Hardware Permissions Onboarding Modal */}
        <PermissionsModal />

        {/* Global Incoming Call Ringing Modal */}
        <IncomingCallModal />

        {/* Global Active WebRTC Voice/Video Call Modal */}
        <ComponentErrorBoundary sectionName="Call Modal">
          <ConnectedCallModal />
        </ComponentErrorBoundary>

        {/* Floating Pop-Up Screen for Active Server Voice Lounge */}
        <ComponentErrorBoundary sectionName="Voice Lounge">
          <VoiceLoungePopup />
        </ComponentErrorBoundary>

        {/* Chrome Call Controls Mixer Adapter Bridge */}
        <MixerAdapterBridge />

        {/* Global Diagnostics & Live Telemetry Logs Console */}
        <ComponentErrorBoundary sectionName="Diagnostics Window">
          <LogsWindow />
        </ComponentErrorBoundary>
      </div>
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
      <PresenceProvider>
        <CallProvider>
          <ServersProvider>
            <ConversationsProvider>
              <ServerVoiceProvider>
                <MainLayoutContent>{children}</MainLayoutContent>
              </ServerVoiceProvider>
            </ConversationsProvider>
          </ServersProvider>
        </CallProvider>
      </PresenceProvider>
    </React.Suspense>
  );
}
