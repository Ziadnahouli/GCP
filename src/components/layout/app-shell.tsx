'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  Compass,
  Gamepad2,
  Hash,
  Headphones,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  Minus,
  Moon,
  MoreHorizontal,
  Phone,
  PhoneOff,
  Plus,
  Radio,
  Search,
  Settings,
  Shield,
  Square,
  Sun,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { useAuth } from '@/features/auth/auth-provider';
import { useServers } from '@/hooks/use-servers';
import { useServerVoiceContext } from '@/features/servers/server-voice-context';
import { useCallState, useCallActions, useCallStats } from '@/features/calls/call-context';
import { useNotifications } from '@/hooks/use-notifications';
import { ServerRail } from '@/components/servers/server-rail';
import { ServerSidebar } from '@/components/servers/server-sidebar';
import { Sidebar } from '@/components/layout/sidebar';
import { UserBar } from '@/components/layout/user-bar';
import { VoiceConnectedBar } from '@/components/servers/voice-connected-bar';
import { ResizableSidebar } from '@/components/ui/resizable-panels';
import { Avatar } from '@/components/ui/avatar';
import { Pill, Badge, Kbd } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { NotificationsPopover } from '@/components/notifications/notifications-popover';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command-palette';
import { OfflineBanner } from '@/components/network/offline-banner';
import dynamic from 'next/dynamic';
import { ComponentErrorBoundary } from '@/components/ui/error-boundary';

const CreateServerModal = dynamic(
  () => import('@/components/servers/create-server-modal').then((m) => m.CreateServerModal),
  { ssr: false }
);
const ServerSettingsModal = dynamic(
  () => import('@/components/servers/server-settings-modal').then((m) => m.ServerSettingsModal),
  { ssr: false }
);
const SettingsModal = dynamic(
  () => import('@/components/layout/settings-modal').then((m) => m.SettingsModal),
  { ssr: false }
);
const PermissionsModal = dynamic(
  () => import('@/components/layout/permissions-modal').then((m) => m.PermissionsModal),
  { ssr: false }
);
const IncomingCallModal = dynamic(
  () => import('@/components/calls/incoming-call-modal').then((m) => m.IncomingCallModal),
  { ssr: false }
);
const CallModal = dynamic(
  () => import('@/components/calls/call-modal').then((m) => m.CallModal),
  { ssr: false }
);
const VoiceLoungePopup = dynamic(
  () => import('@/components/servers/voice-lounge-popup').then((m) => m.VoiceLoungePopup),
  { ssr: false }
);
const MixerAdapterBridge = dynamic(
  () => import('@/components/audio/mixer-adapter-bridge').then((m) => m.MixerAdapterBridge),
  { ssr: false }
);
const LogsWindow = dynamic(
  () => import('@/components/diagnostics/logs-window').then((m) => m.LogsWindow),
  { ssr: false }
);
import { useToast } from '@/components/ui/toast';
import { Channel } from '@/lib/types/server';
import { cn } from '@/lib/utils';

export interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, isLoading } = useAuth();
  const { toast } = useToast();
  const serverVoice = useServerVoiceContext();
  const callState = useCallState();
  const callActions = useCallActions();
  const { stats } = useCallStats();
  const {
    notifications,
    unreadCount: notificationsCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  // Active query parameters
  const selectedConversationId = searchParams.get('c');
  const selectedServerId = searchParams.get('s');
  const selectedChannelId = searchParams.get('ch');

  // Server management hook
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

  // Active server resolution
  const activeServer = React.useMemo(() => {
    if (!selectedServerId) return null;
    return servers.find((s) => s.id === selectedServerId) || null;
  }, [servers, selectedServerId]);

  // Modal states
  const [showCreateServer, setShowCreateServer] = React.useState(false);
  const [showServerSettings, setShowServerSettings] = React.useState(false);
  const [showUserSettings, setShowUserSettings] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [showNotificationsPopover, setShowNotificationsPopover] = React.useState(false);
  const [showVoiceSheet, setShowVoiceSheet] = React.useState(false);

  // Responsive state
  const [tabletDrawerOpen, setTabletDrawerOpen] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState<'home' | 'messages' | 'servers' | 'inbox' | 'you'>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  // Sync mobile active tab with routes
  React.useEffect(() => {
    if (selectedServerId) {
      setMobileTab('servers');
    } else if (selectedConversationId) {
      setMobileTab('messages');
    } else {
      setMobileTab('home');
    }
  }, [selectedServerId, selectedConversationId]);

  // Global Ctrl+K command palette shortcut listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        <div className="w-10 h-10 rounded-2xl bg-primary-subtle border border-primary/20 flex items-center justify-center text-primary animate-pulse">
          <Gamepad2 className="w-5 h-5" />
        </div>
        <div className="text-xs text-muted-foreground font-medium">Authenticating Nexus Session...</div>
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

  // Context-aware sidebar content
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full w-full bg-surface-sidebar overflow-hidden select-none">
      <div className="flex-1 overflow-hidden min-h-0">
        <ComponentErrorBoundary sectionName="Sidebar Navigation">
          {activeServer && !selectedConversationId ? (
            <ServerSidebar
              server={activeServer}
              activeChannelId={selectedChannelId || activeServer.channels[0]?.id || null}
              onSelectChannel={(ch) => {
                handleSelectChannel(ch);
                setTabletDrawerOpen(false);
              }}
              onConnectVoiceChannel={(channel) => {
                serverVoice.joinVoiceChannel(activeServer.id, channel.id, activeServer.name, channel.name);
              }}
              onOpenServerSettings={() => {
                setShowServerSettings(true);
                setTabletDrawerOpen(false);
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
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
              selectedConversationId={selectedConversationId}
              onSelectConversation={(id) => {
                handleSelectConversation(id);
                setTabletDrawerOpen(false);
              }}
            />
          )}
        </ComponentErrorBoundary>
      </div>

      {/* Single Voice Dock Instance (if connected) */}
      {serverVoice.isVoiceConnected && serverVoice.activeChannelName && (
        <div className="shrink-0 border-t border-border">
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
                setTabletDrawerOpen(false);
              }
            }}
          />
        </div>
      )}

      {/* Single User Bar Instance */}
      <div className="shrink-0 border-t border-border bg-surface-sidebar">
        <UserBar />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground font-sans antialiased">
      {/* Non-blocking offline/reconnecting banner */}
      <OfflineBanner />

      {/* Primary Responsive Shell */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Region 1: Rail (56px) - Desktop & Tablet (>= 640px) */}
        <div className="hidden sm:flex flex-col w-14 shrink-0 h-full bg-surface-rail border-r border-border select-none z-30">
          <ServerRail
            servers={servers}
            activeServerId={selectedServerId}
            onSelectServer={handleSelectServer}
            onOpenCreateServer={() => setShowCreateServer(true)}
          />
        </div>

        {/* Region 2: Resizable Sidebar (248px default, 220-320px) - Desktop (>= 1024px) */}
        <div className="hidden lg:flex h-full shrink-0">
          <ResizableSidebar defaultWidth={248} minWidth={220} maxWidth={320}>
            {renderSidebarContent()}
          </ResizableSidebar>
        </div>

        {/* Tablet Slide-over Sidebar Drawer (640px - 1023px) */}
        <Sheet open={tabletDrawerOpen} onOpenChange={setTabletDrawerOpen}>
          <SheetContent side="left" className="p-0 w-72 sm:max-w-xs border-r border-border bg-surface-sidebar">
            {renderSidebarContent()}
          </SheetContent>
        </Sheet>

        {/* Region 3: Main Content Stage */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background relative">
          {/* Main Top Header (52px) */}
          <header className="h-[52px] min-h-[52px] border-b border-border bg-surface-sidebar/50 backdrop-blur-md px-3.5 flex items-center justify-between shrink-0 select-none z-20">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Tablet Sidebar Toggle */}
              <button
                onClick={() => setTabletDrawerOpen(true)}
                className="hidden sm:flex lg:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-control transition-colors"
                title="Toggle Sidebar"
                aria-label="Toggle navigation sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Title / Topic */}
              <div className="flex items-center gap-2 truncate">
                <span className="font-semibold text-xs md:text-sm text-foreground truncate">
                  {activeServer
                    ? activeServer.name
                    : selectedConversationId
                    ? 'Conversation'
                    : 'Friends & Social'}
                </span>
                {selectedChannelId && (
                  <>
                    <span className="text-muted-foreground/60 text-xs">/</span>
                    <span className="text-xs text-muted-foreground truncate">
                      #{activeServer?.channels.find((c) => c.id === selectedChannelId)?.name || 'general'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Actions & Command Palette Trigger */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCommandPaletteOpen(true)}
                className="h-7 text-xs text-muted-foreground gap-2 hidden md:inline-flex"
                title="Quick Search (Ctrl+K)"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
                <Kbd className="text-xs">Ctrl+K</Kbd>
              </Button>

              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => setShowNotificationsPopover((prev) => !prev)}
                className="relative"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                {notificationsCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => setShowUserSettings(true)}
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </header>

          {/* Main Stage Content */}
          <main className="flex-1 overflow-y-auto min-h-0 bg-background relative flex flex-col">
            <ComponentErrorBoundary sectionName="Main Content Stage">
              {children}
            </ComponentErrorBoundary>
          </main>

          {/* Mobile Floating Voice Mini-Bar (52px above bottom tabs) */}
          {serverVoice.isVoiceConnected && serverVoice.activeChannelName && (
            <div className="sm:hidden shrink-0 border-t border-border bg-surface-sidebar">
              <div
                onClick={() => setShowVoiceSheet(true)}
                className="h-[52px] px-3.5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-status-online animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate block">
                      {serverVoice.activeChannelName}
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
                      Connected • Tap for voice lounge
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    onClick={serverVoice.toggleMic}
                    aria-label={serverVoice.isMicMuted ? 'Unmute' : 'Mute'}
                  >
                    {serverVoice.isMicMuted ? <MicOff className="w-4 h-4 text-danger" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    onClick={serverVoice.disconnectVoice}
                    aria-label="Leave voice"
                  >
                    <PhoneOff className="w-4 h-4 text-danger" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Bottom Tab Bar (56px + safe-area) */}
          <nav className="sm:hidden h-14 bg-surface-rail border-t border-border flex items-center justify-around px-2 shrink-0 z-20 select-none pb-[env(safe-area-inset-bottom)]">
            <button
              onClick={() => {
                setMobileTab('home');
                router.push('/');
              }}
              className={cn(
                'flex flex-col items-center justify-center p-1 rounded-control text-xs transition-colors min-w-[56px]',
                mobileTab === 'home' && !selectedConversationId && !selectedServerId
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Home (Friends & Activity)"
            >
              <Users className="w-5 h-5" />
              <span className="text-xs mt-0.5">Home</span>
            </button>

            <button
              onClick={() => {
                setMobileTab('messages');
                if (selectedServerId) {
                  router.push('/');
                }
                setTabletDrawerOpen(true);
              }}
              className={cn(
                'flex flex-col items-center justify-center p-1 rounded-control text-xs transition-colors min-w-[56px]',
                mobileTab === 'messages' || selectedConversationId
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Messages"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-xs mt-0.5">Messages</span>
            </button>

            <button
              onClick={() => {
                setMobileTab('servers');
                setTabletDrawerOpen(true);
              }}
              className={cn(
                'flex flex-col items-center justify-center p-1 rounded-control text-xs transition-colors min-w-[56px]',
                mobileTab === 'servers' || selectedServerId
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Servers"
            >
              <Gamepad2 className="w-5 h-5" />
              <span className="text-xs mt-0.5">Servers</span>
            </button>

            <button
              onClick={() => setShowNotificationsPopover((prev) => !prev)}
              className={cn(
                'flex flex-col items-center justify-center p-1 rounded-control text-xs transition-colors min-w-[56px] relative',
                showNotificationsPopover
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Inbox"
            >
              <Bell className="w-5 h-5" />
              {notificationsCount > 0 && (
                <span className="absolute top-1 right-3.5 w-2 h-2 rounded-full bg-primary" />
              )}
              <span className="text-xs mt-0.5">Inbox</span>
            </button>

            <button
              onClick={() => setShowUserSettings(true)}
              className="flex flex-col items-center justify-center p-1 rounded-control text-xs text-muted-foreground hover:text-foreground transition-colors min-w-[56px]"
              title="You (Profile & Settings)"
            >
              <Avatar
                src={profile?.avatar_url || null}
                name={profile?.display_name || 'User'}
                status={profile?.status || 'online'}
                showStatus
                size={20}
              />
              <span className="text-xs mt-0.5">You</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Command Palette (Ctrl+K) */}
      <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem
              onSelect={() => {
                router.push('/');
                setCommandPaletteOpen(false);
              }}
            >
              <Users className="w-4 h-4 mr-2 text-muted-foreground" />
              <span>Friends & Social</span>
            </CommandItem>
            {servers.map((srv) => (
              <CommandItem
                key={srv.id}
                onSelect={() => {
                  handleSelectServer(srv.id);
                  setCommandPaletteOpen(false);
                }}
              >
                <Gamepad2 className="w-4 h-4 mr-2 text-muted-foreground" />
                <span>Server: {srv.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => {
                setShowUserSettings(true);
                setCommandPaletteOpen(false);
              }}
            >
              <Settings className="w-4 h-4 mr-2 text-muted-foreground" />
              <span>Open Settings</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setShowCreateServer(true);
                setCommandPaletteOpen(false);
              }}
            >
              <Plus className="w-4 h-4 mr-2 text-muted-foreground" />
              <span>Create / Join Server</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Notifications Popover */}
      {showNotificationsPopover && (
        <NotificationsPopover
          open={showNotificationsPopover}
          onClose={() => setShowNotificationsPopover(false)}
          notifications={notifications}
          unreadCount={notificationsCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onDeleteNotification={deleteNotification}
          onClearAll={clearAll}
        />
      )}

      {/* Fullscreen Mobile Voice Sheet */}
      <Sheet open={showVoiceSheet} onOpenChange={setShowVoiceSheet}>
        <SheetContent side="bottom" className="h-[80vh] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-semibold">{serverVoice.activeChannelName}</h3>
                <p className="text-xs text-muted-foreground">{serverVoice.activeServerName} • Voice Connected</p>
              </div>
              <Badge variant="success">HD Audio</Badge>
            </div>
            <div className="py-6 text-center">
              <Avatar size={64} name={profile?.display_name} isSpeaking showStatus status="online" className="mx-auto" />
              <p className="mt-3 text-sm font-semibold">{profile?.display_name}</p>
              <p className="text-xs text-muted-foreground">Voice Active</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 py-4 border-t border-border">
            <Button
              size="lg"
              variant={serverVoice.isMicMuted ? 'destructive' : 'outline'}
              onClick={serverVoice.toggleMic}
              className="rounded-full w-12 h-12 p-0"
              aria-label={serverVoice.isMicMuted ? 'Unmute' : 'Mute'}
            >
              {serverVoice.isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
            <Button
              size="lg"
              variant={serverVoice.isDeafened ? 'destructive' : 'outline'}
              onClick={serverVoice.toggleDeafen}
              className="rounded-full w-12 h-12 p-0"
              aria-label={serverVoice.isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {serverVoice.isDeafened ? <VolumeX className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
            </Button>
            <Button
              size="lg"
              variant="destructive"
              onClick={() => {
                serverVoice.disconnectVoice();
                setShowVoiceSheet(false);
              }}
              className="rounded-full w-12 h-12 p-0"
              aria-label="Leave Voice"
            >
              <PhoneOff className="w-5 h-5" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Global Modals & Overlays */}
      <CreateServerModal
        open={showCreateServer}
        onOpenChange={setShowCreateServer}
        onCreateServer={handleCreateServerSubmit}
        onJoinServer={handleJoinServerSubmit}
      />

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

      <SettingsModal open={showUserSettings} onOpenChange={setShowUserSettings} />
      <PermissionsModal />
      <IncomingCallModal />

      <ComponentErrorBoundary sectionName="Call Modal">
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
      </ComponentErrorBoundary>

      <ComponentErrorBoundary sectionName="Voice Lounge">
        <VoiceLoungePopup />
      </ComponentErrorBoundary>

      <MixerAdapterBridge />

      <ComponentErrorBoundary sectionName="Diagnostics Window">
        <LogsWindow />
      </ComponentErrorBoundary>
    </div>
  );
}
