'use client';

import * as React from 'react';
import {
  Hash,
  Volume2,
  Plus,
  ChevronDown,
  Settings,
  Trash2,
  UserPlus,
  Sparkles,
  Users,
  MessageSquare,
  Radio,
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
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useModalEscape } from '@/hooks/use-modal-escape';
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
  const [showMenu, setShowMenu] = React.useState(false);
  const [showAddChannel, setShowAddChannel] = React.useState(false);
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [newChannelName, setNewChannelName] = React.useState('');
  const [newChannelType, setNewChannelType] = React.useState<ChannelType>('text');
  const [isCreatingChannel, setIsCreatingChannel] = React.useState(false);

  useModalEscape(showAddChannel, () => setShowAddChannel(false));

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
                display_name: latest.display_name || 'Squadmate',
                avatar_url: latest.avatar_url || null,
                role: 'Squadmate',
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

      // Populate from presence (strictly omit self if not connected to this channel)
      serverList.forEach((p) => {
        if (p.user_id === user?.id) {
          if (isVoiceConnectedToThis) {
            occupantsMap.set(p.user_id, p);
          }
          return;
        }
        occupantsMap.set(p.user_id, p);
      });

      // Also merge any occupants known from serverVoice.channelOccupants (LiveKit room state)
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

      // If current user is connected to this voice channel, overlay local realtime voice state
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

        // Also merge direct WebRTC peer states
        serverVoice.remoteParticipants.forEach((p) => {
          occupantsMap.set(p.user_id, p);
        });
      }

      return Array.from(occupantsMap.values());
    },
    [remoteOccupants, serverVoice, server.id, user]
  );

  const canManageServer = hasServerPermission(server, user?.id, 'manage_server') || hasServerPermission(server, user?.id, 'manage_roles');
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
        title: 'Channel Created',
        description: `${newChannelType === 'text' ? '#' : '🔊'} ${newChannelName} is live.`,
        type: 'success',
      });
      setNewChannelName('');
      setShowAddChannel(false);
    } catch (err: any) {
      toast({
        title: 'Failed to Create Channel',
        description: err?.message || 'Could not create channel. Please check your permissions.',
        type: 'error',
      });
    } finally {
      setIsCreatingChannel(false);
    }
  };

  const memberCount = (server.members?.length || 0) + 1;

  return (
    <aside className="w-full h-full bg-surface-sidebar flex flex-col justify-between select-none shrink-0 z-20 border-r-0">
      <div className="overflow-y-auto flex-1 no-scrollbar">
        {/* Server Top Header / Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            className="w-full h-14 border-b border-white/[0.06] px-3.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors group text-left bg-gradient-to-b from-white/[0.04] to-transparent"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
              <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-xs text-primary shadow-sm shrink-0">
                {server.name ? server.name.charAt(0).toUpperCase() : 'S'}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1.5 leading-snug">
                  <span className="truncate">{server.name}</span>
                </h2>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse" />
                  <span>{memberCount} {memberCount === 1 ? 'member' : 'members'} online</span>
                </div>
              </div>
            </div>

            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 shrink-0',
                showMenu && 'rotate-180 text-foreground'
              )}
            />
          </button>

          {/* Server Action Dropdown */}
          {showMenu && (
            <div className="absolute top-14 left-2 right-2 z-40 bg-card border border-white/[0.08] rounded-xl shadow-panel p-1.5 space-y-0.5 animate-in fade-in duration-100 backdrop-blur-md">
              {canManageServer && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onOpenServerSettings?.();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Server Settings</span>
                </button>
              )}

              {canManageChannels && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowAddChannel(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  <span>Create Channel</span>
                </button>
              )}

              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowInviteModal(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-surface-hover hover:text-primary transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Invite Squadmates</span>
              </button>

              <div className="h-[1px] bg-white/[0.06] my-1" />

              <button
                onClick={async () => {
                  setShowMenu(false);
                  if (onLeaveServer) {
                    if (server.owner_id === user?.id) {
                      toast({
                        title: 'Cannot Leave Server',
                        description: 'You are the server owner. Transfer ownership in Server Settings or delete the server.',
                        type: 'error',
                      });
                      onOpenServerSettings?.();
                    } else if (confirm(`Leave ${server.name}?`)) {
                      await onLeaveServer(server.id);
                    }
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Server</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Switch to Direct Messages & Friends */}
        <div className="p-2.5 border-b border-white/[0.06]">
          <button
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary/10 via-white/[0.03] to-transparent hover:from-primary/20 hover:via-white/[0.06] border border-primary/25 hover:border-primary/40 text-foreground text-xs font-semibold shadow-sm transition-all text-left group"
            title="Switch to Direct Messages & Friends Hub"
          >
            <div className="w-6 h-6 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
              <MessageSquare className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-foreground text-xs">Direct Messages</div>
              <div className="text-[10px] text-muted-foreground/60 font-normal truncate">
                Private chats & friends
              </div>
            </div>
          </button>
        </div>

        {/* Text Channels Category */}
        <div className="p-2.5 mt-0.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-2 py-1.5">
            <span className="flex items-center gap-1.5">
              <span>Text Channels</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/[0.04] text-muted-foreground/60 font-mono font-normal">
                {textChannels.length}
              </span>
            </span>
            {canManageChannels && (
              <button
                onClick={() => {
                  setNewChannelType('text');
                  setShowAddChannel(true);
                }}
                className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-colors"
                title="Add Text Channel"
                aria-label="Add Text Channel"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-0.5 mt-1">
            {textChannels.map((channel) => {
              const isActive = activeChannelId === channel.id;

              return (
                <div
                  key={channel.id}
                  onClick={() => onSelectChannel(channel)}
                  className={cn(
                    'group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all relative',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold border border-primary/20 shadow-sm'
                      : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Hash
                      className={cn(
                        'w-3.5 h-3.5 shrink-0 transition-colors',
                        isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'
                      )}
                    />
                    <span className="truncate">{channel.name}</span>
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
                        className="p-1 hover:text-destructive text-muted-foreground/50 rounded transition-colors"
                        title="Delete Channel"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary rounded-r-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Voice Channels Category */}
        <div className="p-2.5 pt-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-2 py-1.5">
            <span className="flex items-center gap-1.5">
              <span>Voice Lounges</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400/80 font-mono font-normal">
                {voiceChannels.length}
              </span>
            </span>
            {canManageChannels && (
              <button
                onClick={() => {
                  setNewChannelType('voice');
                  setShowAddChannel(true);
                }}
                className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-colors"
                title="Add Voice Channel"
                aria-label="Add Voice Channel"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-1 mt-1">
            {voiceChannels.map((channel) => {
              const isSelected = activeChannelId === channel.id;
              const isVoiceConnectedToThis =
                serverVoice.isVoiceConnected &&
                serverVoice.activeChannelId?.toLowerCase().trim() === channel.id.toLowerCase().trim();

              return (
                <div key={channel.id} className="space-y-1">
                  <div
                    onClick={() => {
                      onSelectChannel(channel);
                      if (!isVoiceConnectedToThis) {
                        onConnectVoiceChannel?.(channel);
                      }
                    }}
                    className={cn(
                      'group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all border',
                      isVoiceConnectedToThis
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-sm shadow-emerald-500/10'
                        : isSelected
                        ? 'bg-white/[0.06] text-foreground border-white/[0.1]'
                        : 'hover:bg-emerald-500/10 hover:text-emerald-400 text-muted-foreground border-transparent hover:border-emerald-500/20'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Volume2
                        className={cn(
                          'w-4 h-4 shrink-0 transition-colors',
                          isVoiceConnectedToThis ? 'text-emerald-400 animate-pulse' : 'text-emerald-400/80'
                        )}
                      />
                      <span className="truncate">{channel.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isVoiceConnectedToThis ? (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-2 py-0.5 border-emerald-500/50 text-emerald-300 bg-emerald-500/20 font-mono flex items-center gap-1.5 shadow-sm"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60 animate-ping" />
                          <span>Connected</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-2 py-0.5 border-white/[0.08] text-muted-foreground/80 group-hover:border-emerald-500/30 group-hover:text-emerald-400 font-mono transition-colors"
                        >
                          Join
                        </Badge>
                      )}

                      {onDeleteChannel && voiceChannels.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete voice channel ${channel.name}?`)) {
                              onDeleteChannel(channel.id);
                            }
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground/50 rounded transition-colors"
                          title="Delete Voice Channel"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Connected Occupants List beneath the voice lounge */}
                  {(() => {
                    const occupants = getChannelOccupants(channel.id);
                    if (occupants.length === 0) {
                      return isVoiceConnectedToThis ? (
                        <div className="pl-7 py-0.5 flex items-center gap-1.5 text-[10px] text-emerald-400/90 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Voice Lounge Connected</span>
                        </div>
                      ) : null;
                    }

                    return (
                      <div className="border-l-2 border-emerald-500/20 ml-4 pl-3 my-1 space-y-1 animate-in fade-in duration-150">
                        {occupants.map((occ) => {
                          const isCurrentUser = user?.id === occ.user_id;

                          return (
                            <div
                              key={occ.user_id}
                              className={cn(
                                'flex items-center justify-between py-1 px-2 rounded-lg text-xs transition-colors group/occupant',
                                occ.is_speaking
                                  ? 'bg-emerald-500/10 text-emerald-300'
                                  : 'hover:bg-white/[0.04] text-muted-foreground hover:text-foreground'
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="relative shrink-0">
                                  <Avatar
                                    src={occ.avatar_url || null}
                                    name={occ.display_name}
                                    size="xs"
                                    className={cn(
                                      'w-5 h-5 transition-all',
                                      occ.is_speaking
                                        ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-surface-sidebar scale-105'
                                        : 'ring-1 ring-white/10'
                                    )}
                                  />
                                  {occ.is_speaking && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-1 ring-surface-sidebar animate-ping" />
                                  )}
                                </div>

                                <span
                                  className={cn(
                                    'truncate text-[11px] leading-tight',
                                    occ.is_speaking
                                      ? 'text-emerald-300 font-semibold'
                                      : 'text-muted-foreground group-hover/occupant:text-foreground'
                                  )}
                                >
                                  {occ.display_name}
                                  {isCurrentUser && (
                                    <span className="text-[9px] opacity-60 ml-1 font-mono">(You)</span>
                                  )}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-1">
                                {occ.is_muted && (
                                  <span title="Muted" className="flex items-center">
                                    <MicOff className="w-3 h-3 text-rose-400" />
                                  </span>
                                )}
                                {occ.is_deafened && (
                                  <span title="Deafened" className="flex items-center">
                                    <VolumeX className="w-3 h-3 text-rose-400" />
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Add Channel Modal / Popup */}
      {showAddChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setShowAddChannel(false)}
          />
          <form
            onSubmit={handleCreateChannelSubmit}
            className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-surface-default p-5 shadow-modal z-10 space-y-4"
          >
            <h3 className="text-sm font-bold text-foreground">Create Channel</h3>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isCreatingChannel}
                onClick={() => setNewChannelType('text')}
                className={cn(
                  'flex-1 p-2 rounded-xl border flex flex-col items-center gap-1 text-xs font-semibold transition-colors',
                  newChannelType === 'text'
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-white/[0.06] bg-surface-panel text-muted-foreground hover:text-foreground'
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
                  'flex-1 p-2 rounded-xl border flex flex-col items-center gap-1 text-xs font-semibold transition-colors',
                  newChannelType === 'voice'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-white/[0.06] bg-surface-panel text-muted-foreground hover:text-foreground'
                )}
              >
                <Volume2 className="w-4 h-4" />
                <span>Voice</span>
              </button>
            </div>

            <div>
              <label htmlFor="new-channel-name-input" className="text-xs font-medium text-foreground block mb-1.5">
                Channel Name
              </label>
              <input
                id="new-channel-name-input"
                type="text"
                disabled={isCreatingChannel}
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder={newChannelType === 'text' ? 'e.g. general' : 'e.g. Scrim Voice'}
                className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-panel text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 disabled:opacity-50"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isCreatingChannel}
                onClick={() => setShowAddChannel(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newChannelName.trim() || isCreatingChannel}
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-subtle hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
              >
                {isCreatingChannel && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{isCreatingChannel ? 'Creating...' : 'Create'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invite Squadmates Modal */}
      <InviteModal
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        server={server}
      />
    </aside>
  );
}
