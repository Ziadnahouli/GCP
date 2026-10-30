'use client';

import * as React from 'react';
import {
  Hash,
  Volume2,
  Plus,
  ChevronDown,
  ChevronRight,
  Settings,
  Trash2,
  UserPlus,
  MessageSquare,
  MicOff,
  VolumeX,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Server, Channel, ChannelType, hasServerPermission } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { useServerVoiceContext, VoiceParticipant } from '@/features/servers/server-voice-context';
import { getBrowserClient } from '@/lib/supabase/client';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { InviteModal } from './invite-modal';

interface ServerSidebarProps {
  server: Server;
  activeChannelId: string | null;
  onSelectChannel: (channel: Channel) => void;
  onOpenServerSettings?: () => void;
  onCreateChannel: (name: string, type: ChannelType, topic?: string) => Promise<unknown>;
  onUpdateChannel?: (channelId: string, updates: { name?: string; topic?: string | null }) => Promise<unknown>;
  onDeleteChannel?: (channelId: string) => Promise<unknown>;
  onConnectVoiceChannel?: (channel: Channel) => void;
  onLeaveServer?: (serverId: string) => Promise<void>;
}

export function ServerSidebar({
  server,
  activeChannelId,
  onSelectChannel,
  onOpenServerSettings,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
  onConnectVoiceChannel,
  onLeaveServer,
}: ServerSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const serverVoice = useServerVoiceContext();

  const [showAddChannel, setShowAddChannel] = React.useState(false);
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [newChannelName, setNewChannelName] = React.useState('');
  const [newChannelType, setNewChannelType] = React.useState<ChannelType>('text');
  const [isCreatingChannel, setIsCreatingChannel] = React.useState(false);

  // Collapsible categories state
  const [textCollapsed, setTextCollapsed] = React.useState(false);
  const [voiceCollapsed, setVoiceCollapsed] = React.useState(false);

  // Realtime presence state of server-wide voice channel occupants
  const [remoteOccupants, setRemoteOccupants] = React.useState<Map<string, VoiceParticipant[]>>(new Map());

  // Subscribe to server-wide voice channel presence
  React.useEffect(() => {
    if (!server?.id) return;
    const supabase = getBrowserClient();
    if (!supabase) return;

    const cleanServerId = server.id.toLowerCase().trim();
    const scoped = realtimeHub.acquireScoped(`server_voice_${cleanServerId}`, {
      config: { private: true, presence: { key: user?.id || 'anon' } },
    });
    const chan = scoped.channel;

    const updateFromPresence = () => {
      const state = chan.presenceState();
      const byChannel = new Map<string, VoiceParticipant[]>();

      Object.entries(state).forEach(([, presences]) => {
        if (Array.isArray(presences) && presences.length > 0) {
          const latest: any = presences[presences.length - 1];
          if (latest?.channel_id && latest?.user_id) {
            const cleanChanId = (latest.channel_id || '').toLowerCase().trim();
            const list = byChannel.get(cleanChanId) || [];
            if (!list.some((p) => p.user_id === latest.user_id)) {
              const part: VoiceParticipant = {
                id: latest.user_id,
                user_id: latest.user_id,
                display_name: latest.display_name || 'Member',
                avatar_url: latest.avatar_url || null,
                role: 'Member',
                is_speaking: Boolean(latest.is_speaking),
                is_muted: Boolean(latest.is_muted),
                is_deafened: Boolean(latest.is_deafened),
                is_camera_on: false,
                is_screen_sharing: false,
                audio_level: 0,
              };
              list.push(part);
              byChannel.set(cleanChanId, list);
              byChannel.set(latest.channel_id, list);
            }
          }
        }
      });

      setRemoteOccupants(byChannel);
    };

    chan
      .on('presence', { event: 'sync' }, updateFromPresence)
      .on('presence', { event: 'join' }, updateFromPresence)
      .on('presence', { event: 'leave' }, updateFromPresence)
      .on('broadcast', { event: 'voice_state_update' }, ({ payload }: any) => {
        if (!payload?.channel_id || !payload?.user_id) return;
        const cleanChanId = (payload.channel_id || '').toLowerCase().trim();
        setRemoteOccupants((prev) => {
          const next = new Map(prev);
          const list = next.get(cleanChanId) || next.get(payload.channel_id);
          if (list) {
            const updated = list.map((p) => {
              if (p.user_id === payload.user_id) {
                return {
                  ...p,
                  is_speaking: payload.is_speaking !== undefined ? Boolean(payload.is_speaking) : p.is_speaking,
                  is_muted: payload.is_muted !== undefined ? Boolean(payload.is_muted) : p.is_muted,
                  is_deafened: payload.is_deafened !== undefined ? Boolean(payload.is_deafened) : p.is_deafened,
                };
              }
              return p;
            });
            next.set(cleanChanId, updated);
            next.set(payload.channel_id, updated);
          }
          return next;
        });
      })
      .on('broadcast', { event: 'voice_user_left' }, ({ payload }: any) => {
        if (!payload?.userId) return;
        setRemoteOccupants((prev) => {
          const next = new Map(prev);
          next.forEach((list, chId) => {
            const filtered = list.filter((p) => p.user_id !== payload.userId);
            if (filtered.length !== list.length) {
              next.set(chId, filtered);
            }
          });
          return next;
        });
      })
      .subscribe();

    const handleVoiceDisconnected = (evt: any) => {
      const discUserId = evt?.detail?.userId || user?.id;
      if (!discUserId) return;
      setRemoteOccupants((prev) => {
        const next = new Map(prev);
        next.forEach((list, chId) => {
          const filtered = list.filter((p) => p.user_id !== discUserId);
          next.set(chId, filtered);
        });
        return next;
      });
    };
    window.addEventListener('nexus_voice_disconnected', handleVoiceDisconnected);

    return () => {
      window.removeEventListener('nexus_voice_disconnected', handleVoiceDisconnected);
      scoped.release();
    };
  }, [server?.id, user?.id]);

  // Merge server-wide remote presence with local realtime voice context
  const getChannelOccupants = React.useCallback(
    (channelId: string): VoiceParticipant[] => {
      const cleanChanId = (channelId || '').toLowerCase().trim();
      const serverList = remoteOccupants.get(cleanChanId) || remoteOccupants.get(channelId) || [];
      const occupantsMap = new Map<string, VoiceParticipant>();

      const isVoiceConnectedToThis =
        serverVoice.isVoiceConnected &&
        (serverVoice.activeServerId || '').toLowerCase().trim() === (server.id || '').toLowerCase().trim() &&
        (serverVoice.activeChannelId || '').toLowerCase().trim() === cleanChanId;

      serverList.forEach((p) => {
        if (p.user_id === user?.id) {
          if (isVoiceConnectedToThis) {
            occupantsMap.set(p.user_id, p);
          }
          return;
        }
        occupantsMap.set(p.user_id, p);
      });

      const contextOccupants =
        serverVoice.channelOccupants.get(cleanChanId) ||
        serverVoice.channelOccupants.get(channelId) ||
        [];
      contextOccupants.forEach((p) => {
        if (p.user_id === user?.id) {
          if (isVoiceConnectedToThis) {
            occupantsMap.set(p.user_id, p);
          }
          return;
        }
        occupantsMap.set(p.user_id, p);
      });

      if (isVoiceConnectedToThis && user) {
        occupantsMap.set(user.id, {
          id: user.id,
          user_id: user.id,
          display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'You',
          avatar_url: user.user_metadata?.avatar_url || null,
          role: 'You',
          is_speaking: serverVoice.isSpeaking,
          is_muted: serverVoice.isMicMuted,
          is_deafened: serverVoice.isDeafened,
          is_camera_on: serverVoice.isCameraOn,
          is_screen_sharing: serverVoice.isScreenSharing,
          audio_level: serverVoice.audioLevel,
        });

        serverVoice.remoteParticipants.forEach((p) => {
          occupantsMap.set(p.user_id, p);
        });
      }

      return Array.from(occupantsMap.values());
    },
    [remoteOccupants, serverVoice, server.id, user]
  );

  const canManageServer =
    server?.owner_id === user?.id ||
    hasServerPermission(server, user?.id, 'manage_server') ||
    hasServerPermission(server, user?.id, 'manage_roles') ||
    hasServerPermission(server, user?.id, 'manage_channels') ||
    hasServerPermission(server, user?.id, 'kick_members') ||
    hasServerPermission(server, user?.id, 'moderate_members') ||
    hasServerPermission(server, user?.id, 'manage_reports') ||
    hasServerPermission(server, user?.id, 'view_audit_log');
  const canManageChannels = hasServerPermission(server, user?.id, 'manage_channels');

  const allChannels = server.channels || [];
  const textChannels = allChannels.filter((c) => c.type === 'text');
  const voiceChannels = allChannels.filter((c) => c.type === 'voice');

  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || isCreatingChannel) return;

    setIsCreatingChannel(true);
    try {
      await onCreateChannel(newChannelName.trim(), newChannelType);
      toast({
        title: 'Channel created',
        description: `${newChannelType === 'text' ? '#' : ''} ${newChannelName} is now active.`,
        type: 'success',
      });
      setNewChannelName('');
      setShowAddChannel(false);
    } catch (err: any) {
      toast({
        title: 'Failed to create channel',
        description: err?.message || 'Could not create channel. Please check your permissions.',
        type: 'error',
      });
    } finally {
      setIsCreatingChannel(false);
    }
  };

  const memberCount = (server.members?.length || 0) + 1;

  return (
    <aside className="w-full h-full bg-surface-sidebar flex flex-col justify-between select-none shrink-0 border-r-0">
      <div className="overflow-y-auto flex-1 no-scrollbar">
        {/* Server Top Header with Radix Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-full h-[52px] border-b border-border px-3.5 flex items-center justify-between hover:bg-surface-hover transition-colors group text-left focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label={`${server.name} menu`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                <div className="w-7 h-7 rounded-md bg-primary-subtle border border-primary/20 flex items-center justify-center font-semibold text-xs text-primary shrink-0 overflow-hidden">
                  {server.icon_url ? (
                    <img
                      src={server.icon_url}
                      alt={server.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    server.name ? server.name.charAt(0).toUpperCase() : 'S'
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-body text-foreground truncate group-hover:text-primary transition-colors leading-tight">
                    {server.name}
                  </h2>
                  <div className="flex items-center gap-1.5 text-meta text-muted-foreground mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-online shrink-0" />
                    <span className="truncate">{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                  </div>
                </div>
              </div>

              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-150 shrink-0 group-data-[state=open]:rotate-180" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-56 p-1">
            <DropdownMenuItem
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-primary" />
              <span>Invite people</span>
            </DropdownMenuItem>

            {canManageServer && (
              <DropdownMenuItem
                onClick={() => onOpenServerSettings?.()}
                className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Server settings</span>
              </DropdownMenuItem>
            )}

            {canManageChannels && (
              <DropdownMenuItem
                onClick={() => {
                  setNewChannelType('text');
                  setShowAddChannel(true);
                }}
                className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span>Create channel</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={async () => {
                if (onLeaveServer) {
                  if (server.owner_id === user?.id) {
                    toast({
                      title: 'Cannot leave server',
                      description: 'You are the server owner. Transfer ownership in server settings or delete the server.',
                      type: 'error',
                    });
                    onOpenServerSettings?.();
                  } else if (confirm(`Are you sure you want to leave ${server.name}?`)) {
                    await onLeaveServer(server.id);
                  }
                }
              }}
              className="flex items-center gap-2 text-xs font-medium text-danger hover:bg-danger/10 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave server</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick Switch to Direct Messages & Friends */}
        <div className="p-2 border-b border-border">
          <button
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-control text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors text-left"
            title="Switch to Direct Messages"
            aria-label="Direct messages"
          >
            <MessageSquare className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">Direct messages</span>
          </button>
        </div>

        {/* Text Channels Category */}
        <div className="p-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-2 py-1">
            <button
              onClick={() => setTextCollapsed((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors -ml-1 p-0.5 rounded-control"
              aria-label={textCollapsed ? 'Expand text channels' : 'Collapse text channels'}
            >
              {textCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="text-xs uppercase tracking-wider font-semibold">Channels</span>
              <span className="text-xs text-muted-foreground font-normal">
                ({textChannels.length})
              </span>
            </button>

            {canManageChannels && (
              <button
                onClick={() => {
                  setNewChannelType('text');
                  setShowAddChannel(true);
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-control transition-colors"
                title="Create text channel"
                aria-label="Create text channel"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!textCollapsed && (
            <div className="space-y-0.5 mt-0.5">
              {textChannels.map((channel) => {
                const isActive = activeChannelId === channel.id;

                return (
                  <div
                    key={channel.id}
                    onClick={() => onSelectChannel(channel)}
                    className={cn(
                      'group flex items-center justify-between px-2.5 h-8 max-sm:h-14 rounded-control text-meta font-medium cursor-pointer transition-colors relative',
                      isActive
                        ? 'bg-surface-active text-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r" />
                    )}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Hash
                        className={cn(
                          'w-4 h-4 shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      <span className="truncate text-body">{channel.name}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canManageChannels && onDeleteChannel && textChannels.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete #${channel.name}?`)) {
                              onDeleteChannel(channel.id);
                            }
                          }}
                          className="p-1 hover:text-danger text-muted-foreground rounded-control transition-colors"
                          title="Delete channel"
                          aria-label={`Delete #${channel.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Voice Channels Category */}
        <div className="p-2 pt-0">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-2 py-1">
            <button
              onClick={() => setVoiceCollapsed((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors -ml-1 p-0.5 rounded-control"
              aria-label={voiceCollapsed ? 'Expand voice channels' : 'Collapse voice channels'}
            >
              {voiceCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="text-xs uppercase tracking-wider font-semibold">Voice</span>
              <span className="text-xs text-muted-foreground font-normal">
                ({voiceChannels.length})
              </span>
            </button>

            {canManageChannels && (
              <button
                onClick={() => {
                  setNewChannelType('voice');
                  setShowAddChannel(true);
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-control transition-colors"
                title="Create voice channel"
                aria-label="Create voice channel"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!voiceCollapsed && (
            <div className="space-y-1 mt-0.5">
              {voiceChannels.map((channel) => {
                const isSelected = activeChannelId === channel.id;
                const isVoiceConnectedToThis =
                  serverVoice.isVoiceConnected &&
                  serverVoice.activeChannelId?.toLowerCase().trim() === channel.id.toLowerCase().trim();
                const occupants = getChannelOccupants(channel.id);

                return (
                  <div key={channel.id} className="space-y-0.5">
                    <div
                      onClick={() => {
                        onSelectChannel(channel);
                        if (!isVoiceConnectedToThis) {
                          onConnectVoiceChannel?.(channel);
                        }
                      }}
                      className={cn(
                        'group flex items-center justify-between px-2.5 h-8 max-sm:h-14 rounded-control text-meta font-medium cursor-pointer transition-colors relative',
                        isVoiceConnectedToThis
                          ? 'bg-primary-subtle text-primary font-semibold'
                          : isSelected
                          ? 'bg-surface-active text-foreground'
                          : 'hover:bg-surface-hover text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {isSelected && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r" />
                      )}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Volume2
                          className={cn(
                            'w-4 h-4 shrink-0 transition-colors',
                            isVoiceConnectedToThis ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                        <span className="truncate text-body">{channel.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isVoiceConnectedToThis ? (
                          <Badge variant="accent" className="text-xs px-1.5 py-0">
                            Connected
                          </Badge>
                        ) : occupants.length > 0 ? (
                          <span className="text-xs text-muted-foreground font-normal">
                            {occupants.length}
                          </span>
                        ) : null}

                        {onDeleteChannel && voiceChannels.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete voice channel ${channel.name}?`)) {
                                onDeleteChannel(channel.id);
                              }
                            }}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:text-danger text-muted-foreground rounded-control transition-colors"
                            title="Delete voice channel"
                            aria-label={`Delete ${channel.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Connected Occupants List beneath the voice channel */}
                    {occupants.length > 0 && (
                      <div className="ml-5 pl-2 border-l border-border space-y-0.5 py-0.5">
                        {occupants.map((occ) => {
                          const isCurrentUser = user?.id === occ.user_id;

                          return (
                            <div
                              key={occ.user_id}
                              className={cn(
                                'flex items-center justify-between py-1 px-1.5 rounded-control text-xs transition-colors group/occupant',
                                occ.is_speaking
                                  ? 'text-status-online font-medium'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="relative shrink-0">
                                  <Avatar
                                    src={occ.avatar_url || null}
                                    name={occ.display_name}
                                    size="20"
                                    className={cn(
                                      'transition-all',
                                      occ.is_speaking && 'ring-2 ring-status-online'
                                    )}
                                  />
                                </div>

                                <span className="truncate text-xs">
                                  {occ.display_name}
                                  {isCurrentUser && (
                                    <span className="text-muted-foreground ml-1">(You)</span>
                                  )}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-1">
                                {occ.is_muted && (
                                  <span title="Muted" className="flex items-center">
                                    <MicOff className="w-3.5 h-3.5 text-danger" />
                                  </span>
                                )}
                                {occ.is_deafened && (
                                  <span title="Deafened" className="flex items-center">
                                    <VolumeX className="w-3.5 h-3.5 text-danger" />
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Clean Pro Create Channel Dialog */}
      <Dialog open={showAddChannel} onOpenChange={setShowAddChannel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create channel</DialogTitle>
            <DialogDescription>
              Create a new text or voice channel for this server.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateChannelSubmit} className="space-y-4 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isCreatingChannel}
                onClick={() => setNewChannelType('text')}
                className={cn(
                  'flex-1 p-3 rounded-control border flex flex-col items-center gap-1 text-xs font-semibold transition-colors',
                  newChannelType === 'text'
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                <Hash className="w-4 h-4" />
                <span>Text</span>
              </button>
              <button
                type="button"
                disabled={isCreatingChannel}
                onClick={() => setNewChannelType('voice')}
                className={cn(
                  'flex-1 p-3 rounded-control border flex flex-col items-center gap-1 text-xs font-semibold transition-colors',
                  newChannelType === 'voice'
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                <Volume2 className="w-4 h-4" />
                <span>Voice</span>
              </button>
            </div>

            <div>
              <label htmlFor="new-channel-name-input" className="text-xs font-medium text-foreground block mb-1.5">
                Channel name
              </label>
              <Input
                id="new-channel-name-input"
                type="text"
                disabled={isCreatingChannel}
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder={newChannelType === 'text' ? 'e.g. general' : 'e.g. Lounge'}
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isCreatingChannel}
                onClick={() => setShowAddChannel(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isCreatingChannel}
                disabled={!newChannelName.trim() || isCreatingChannel}
              >
                Create channel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite Modal */}
      <InviteModal
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        server={server}
      />
    </aside>
  );
}
